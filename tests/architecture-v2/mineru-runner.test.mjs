import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runMineruPdfToJson } from '../../src/domain/mineru-runner.mjs';

const contentList = [[
  { type: 'title', content: { title_content: [{ type: 'text', content: 'Model A1' }] }, bbox: [1, 1, 10, 10] },
]];

test('MinerU runner produces one content-addressed content_list_v2 artifact with fixed safe options', async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'fitappliance-mineru-test-'));
  const calls = [];
  try {
    const result = await runMineruPdfToJson(Buffer.from('%PDF-1.7\ntest'), {
      storageRoot,
      mineruBinary: 'test-mineru',
      runCommand: async (binary, args) => {
        calls.push({ binary, args });
        if (args[0] === '-v') return { stdout: 'mineru, version 3.4.4\nfitappliance-model-revision ed6b654c018d742e65a17671e379c5e6ecc87ec9\n', stderr: '' };
        const output = args[args.indexOf('-o') + 1];
        await mkdir(join(output, 'source', 'auto'), { recursive: true });
        await writeFile(join(output, 'source', 'auto', 'source_content_list_v2.json'), JSON.stringify(contentList));
        return { stdout: 'done', stderr: '' };
      },
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].binary, 'test-mineru');
    assert.deepEqual(calls[1].args.slice(calls[1].args.indexOf('-b')), [
      '-b', 'pipeline', '-m', 'auto', '-f', 'false', '-t', 'true',
    ]);
    assert.equal(result.derivedArtifact.parserVersion, '3.4.4');
    assert.equal(result.derivedArtifact.modelRevision, 'ed6b654c018d742e65a17671e379c5e6ecc87ec9');
    assert.equal(result.derivedArtifact.pageCount, 1);
    assert.deepEqual(JSON.parse(result.jsonBytes), contentList);
    assert.match(result.derivedArtifact.objectPath, /^evidence\/derived\/mineru-json\/sha256\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{64}\.json$/);
  } finally {
    await rm(storageRoot, { recursive: true, force: true });
  }
});

test('MinerU runner rejects parser drift and ambiguous output sets', async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'fitappliance-mineru-test-'));
  try {
    await assert.rejects(() => runMineruPdfToJson(Buffer.from('%PDF-1.7\ntest'), {
      storageRoot,
      runCommand: async () => ({ stdout: 'mineru, version 3.5.0\n', stderr: '' }),
    }), /version/i);

    await assert.rejects(() => runMineruPdfToJson(Buffer.from('%PDF-1.7\ntest'), {
      storageRoot,
      runCommand: async (_binary, args) => {
        if (args[0] === '-v') return { stdout: 'mineru, version 3.4.4\nfitappliance-model-revision ed6b654c018d742e65a17671e379c5e6ecc87ec9\n', stderr: '' };
        const output = args[args.indexOf('-o') + 1];
        await mkdir(join(output, 'a'), { recursive: true });
        await mkdir(join(output, 'b'), { recursive: true });
        await writeFile(join(output, 'a', 'a_content_list_v2.json'), JSON.stringify(contentList));
        await writeFile(join(output, 'b', 'b_content_list_v2.json'), JSON.stringify(contentList));
        return { stdout: '', stderr: '' };
      },
    }), /exactly one.*content_list_v2/i);
  } finally {
    await rm(storageRoot, { recursive: true, force: true });
  }
});

test('MinerU runner does not allow environment variables to spoof model attestation', async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'fitappliance-mineru-test-'));
  try {
    await assert.rejects(() => runMineruPdfToJson(Buffer.from('%PDF-1.7\ntest'), {
      storageRoot,
      env: { FITAPPLIANCE_MINERU_MODEL_REVISION: 'ed6b654c018d742e65a17671e379c5e6ecc87ec9' },
      runCommand: async () => ({
        stdout: 'mineru, version 3.4.4\nfitappliance-model-revision 1111111111111111111111111111111111111111\n',
        stderr: '',
      }),
    }), /model revision.*does not match policy/i);
  } finally {
    await rm(storageRoot, { recursive: true, force: true });
  }
});

test('MinerU runner rejects non-PDF payloads before invoking a process', async () => {
  let called = false;
  await assert.rejects(() => runMineruPdfToJson(Buffer.from('<html>fake</html>'), {
    storageRoot: tmpdir(),
    runCommand: async () => { called = true; },
  }), /PDF payload/i);
  assert.equal(called, false);
});

test('MinerU runner rejects oversized PDFs before creating work or invoking a process', async () => {
  let called = false;
  await assert.rejects(() => runMineruPdfToJson(Buffer.from('%PDF-1.7\noversized'), {
    storageRoot: tmpdir(),
    maximumPdfBytes: 10,
    runCommand: async () => { called = true; },
  }), /PDF payload exceeds.*10 bytes/i);
  assert.equal(called, false);
});
