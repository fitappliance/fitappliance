import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  inspectMineruPdfCache,
  runMineruPdfToJson,
  runMineruPdfWithImageFallback,
} from '../../src/domain/mineru-runner.mjs';

const contentList = [[
  { type: 'title', content: { title_content: [{ type: 'text', content: 'Model A1' }] }, bbox: [1, 1, 10, 10] },
]];

const VLM_MODEL_REVISION = 'bff20d4ae2bf202df9f45284b4d43681555a97ed';

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

test('MinerU runner falls back to bounded original-PDF page ranges and bisects a failing range', async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'fitappliance-mineru-range-fallback-'));
  const parseCalls = [];
  try {
    const result = await runMineruPdfToJson(Buffer.from('%PDF-1.7\nrange-fallback-fixture'), {
      storageRoot,
      chunkPageCount: 2,
      runCommand: async (_binary, args) => {
        if (args[0] === '-v') {
          return { stdout: 'mineru, version 3.4.4\nfitappliance-model-revision ed6b654c018d742e65a17671e379c5e6ecc87ec9\n' };
        }
        const startIndex = args.indexOf('-s');
        const endIndex = args.indexOf('-e');
        const range = startIndex < 0 ? null : [Number(args[startIndex + 1]), Number(args[endIndex + 1])];
        parseCalls.push(range);
        if (!range) throw new Error('1 document, 3 pages in this batch | 3 pages total | whole-document final assembly failed');
        if (range[0] === 0 && range[1] === 1) throw new Error('two-page range failed');
        const output = args[args.indexOf('-o') + 1];
        await mkdir(join(output, 'source', 'auto'), { recursive: true });
        const pages = Array.from({ length: range[1] - range[0] + 1 }, (_, offset) => [[{
          type: 'title',
          content: { title_content: [{ type: 'text', content: `Page ${range[0] + offset + 1}` }] },
          bbox: [1, 1, 10, 10],
        }]]).flat();
        await writeFile(
          join(output, 'source', 'auto', 'source_content_list_v2.json'),
          JSON.stringify(pages),
        );
        return { stdout: 'done' };
      },
    });
    assert.deepEqual(parseCalls, [null, [0, 1], [0, 0], [1, 1], [2, 2]]);
    assert.equal(JSON.parse(result.jsonBytes).length, 3);
    assert.deepEqual(result.processing, {
      strategy: 'page_ranges',
      ranges: [[0, 0], [1, 1], [2, 2]],
    });
    const cached = await runMineruPdfToJson(Buffer.from('%PDF-1.7\nrange-fallback-fixture'), {
      storageRoot,
      runCommand: async () => { throw new Error('cache should be reused'); },
    });
    assert.deepEqual(cached, result);
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

test('MinerU runner reuses a hash-bound JSON artifact without invoking MinerU again', async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'fitappliance-mineru-cache-test-'));
  let calls = 0;
  const runCommand = async (_binary, args) => {
    calls += 1;
    if (args[0] === '-v') return { stdout: 'mineru, version 3.4.4\nfitappliance-model-revision ed6b654c018d742e65a17671e379c5e6ecc87ec9\n' };
    const output = args[args.indexOf('-o') + 1];
    await mkdir(join(output, 'source', 'auto'), { recursive: true });
    await writeFile(join(output, 'source', 'auto', 'source_content_list_v2.json'), JSON.stringify(contentList));
    return { stdout: 'done' };
  };
  try {
    const pdf = Buffer.from('%PDF-1.7\ncache-fixture');
    const first = await runMineruPdfToJson(pdf, { storageRoot, runCommand });
    const second = await runMineruPdfToJson(pdf, {
      storageRoot,
      runCommand: async () => { throw new Error('cache miss'); },
    });
    assert.equal(calls, 2);
    assert.deepEqual(second, first);
  } finally {
    await rm(storageRoot, { recursive: true, force: true });
  }
});

test('MinerU cache inspection distinguishes missing, current, and stale indexes without parsing', async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'fitappliance-mineru-cache-inspection-'));
  const pdf = Buffer.from('%PDF-1.7\ninspection-fixture');
  try {
    assert.equal((await inspectMineruPdfCache(pdf, { storageRoot })).status, 'missing');
    const parsed = await runMineruPdfToJson(pdf, {
      storageRoot,
      runCommand: async (_binary, args) => {
        if (args[0] === '-v') return { stdout: 'mineru, version 3.4.4\nfitappliance-model-revision ed6b654c018d742e65a17671e379c5e6ecc87ec9\n' };
        const output = args[args.indexOf('-o') + 1];
        await mkdir(join(output, 'source', 'auto'), { recursive: true });
        await writeFile(join(output, 'source', 'auto', 'source_content_list_v2.json'), JSON.stringify(contentList));
        return { stdout: 'done' };
      },
    });
    const current = await inspectMineruPdfCache(pdf, { storageRoot });
    assert.equal(current.status, 'indexed');
    assert.deepEqual(current.derivedArtifact, parsed.derivedArtifact);

    const indexPath = join(storageRoot, 'cache', 'mineru-index', `${parsed.derivedArtifact.sourcePdfSha256}.json`);
    const index = JSON.parse(await readFile(indexPath, 'utf8'));
    index.parserVersion = '3.3.0';
    await writeFile(indexPath, `${JSON.stringify(index)}\n`);
    const stale = await inspectMineruPdfCache(pdf, { storageRoot });
    assert.equal(stale.status, 'stale');
    assert.equal(stale.parserVersion, '3.3.0');
  } finally {
    await rm(storageRoot, { recursive: true, force: true });
  }
});

test('MinerU runner rejects a corrupted cached JSON object instead of trusting or replacing it', async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'fitappliance-mineru-cache-test-'));
  try {
    const pdf = Buffer.from('%PDF-1.7\ncorrupt-cache-fixture');
    const first = await runMineruPdfToJson(pdf, {
      storageRoot,
      runCommand: async (_binary, args) => {
        if (args[0] === '-v') return { stdout: 'mineru, version 3.4.4\nfitappliance-model-revision ed6b654c018d742e65a17671e379c5e6ecc87ec9\n' };
        const output = args[args.indexOf('-o') + 1];
        await mkdir(join(output, 'source', 'auto'), { recursive: true });
        await writeFile(join(output, 'source', 'auto', 'source_content_list_v2.json'), JSON.stringify(contentList));
        return { stdout: 'done' };
      },
    });
    const objectPath = join(storageRoot, ...first.derivedArtifact.objectPath.split('/'));
    assert.ok((await readFile(objectPath)).length > 0);
    await writeFile(objectPath, '{"tampered":true}');
    await assert.rejects(() => runMineruPdfToJson(pdf, {
      storageRoot,
      runCommand: async () => { throw new Error('must not reprocess corruption'); },
    }), /cache integrity/i);
  } finally {
    await rm(storageRoot, { recursive: true, force: true });
  }
});

test('hybrid image fallback is profile-bound, page-preserving, and isolated from the legacy cache', async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'fitappliance-mineru-hybrid-profile-'));
  const pdf = Buffer.from('%PDF-1.7\nhybrid-page-selection-fixture');
  const calls = [];
  const runCommand = async (_binary, args) => {
    calls.push(args);
    if (args[0] === '-v') {
      return { stdout: [
        'mineru, version 3.4.4',
        'fitappliance-model-revision ed6b654c018d742e65a17671e379c5e6ecc87ec9',
        `fitappliance-vlm-model-revision ${VLM_MODEL_REVISION}`,
        '',
      ].join('\n') };
    }
    const output = args[args.indexOf('-o') + 1];
    await mkdir(join(output, 'source', 'hybrid_auto'), { recursive: true });
    await writeFile(
      join(output, 'source', 'hybrid_auto', 'source_content_list_v2.json'),
      JSON.stringify(contentList),
    );
    return { stdout: 'done' };
  };
  try {
    const result = await runMineruPdfToJson(pdf, {
      storageRoot,
      profileId: 'hybrid-image-high-v1',
      selectedPages: [2],
      sourcePageCount: 3,
      runCommand,
    });
    const parseArgs = calls[1];
    assert.deepEqual(parseArgs.slice(parseArgs.indexOf('-b')), [
      '-b', 'hybrid-engine', '-m', 'auto', '-f', 'false', '-t', 'true',
      '--effort', 'high', '--image-analysis', 'true', '-s', '1', '-e', '1',
    ]);
    assert.deepEqual(JSON.parse(result.jsonBytes), [[], contentList[0], []]);
    assert.equal(result.derivedArtifact.profileId, 'hybrid-image-high-v1');
    assert.equal(result.derivedArtifact.modelRevision, VLM_MODEL_REVISION);
    assert.equal(result.derivedArtifact.backend, 'hybrid-engine');
    assert.equal(result.derivedArtifact.effort, 'high');
    assert.equal(result.derivedArtifact.imageAnalysis, true);
    assert.deepEqual(result.derivedArtifact.processedPages, [2]);
    assert.equal(result.derivedArtifact.sourcePageCount, 3);
    assert.equal(result.derivedArtifact.pageCount, 3);

    const cached = await runMineruPdfToJson(pdf, {
      storageRoot,
      profileId: 'hybrid-image-high-v1',
      selectedPages: [2],
      sourcePageCount: 3,
      runCommand: async () => { throw new Error('profile cache miss'); },
    });
    assert.deepEqual(cached, result);
    const inspection = await inspectMineruPdfCache(pdf, {
      storageRoot,
      profileId: 'hybrid-image-high-v1',
      selectedPages: [2],
      sourcePageCount: 3,
    });
    assert.equal(inspection.status, 'indexed');
    await assert.rejects(() => runMineruPdfToJson(pdf, {
      storageRoot,
      profileId: 'hybrid-image-high-v1',
      selectedPages: [1],
      sourcePageCount: 3,
      runCommand: async () => { throw new Error('different page selection must not reuse cache'); },
    }), /different page selection must not reuse cache/);
  } finally {
    await rm(storageRoot, { recursive: true, force: true });
  }
});

test('image fallback binds the primary parse trigger and runs only detected source pages', async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'fitappliance-mineru-image-fallback-'));
  const pdf = Buffer.from('%PDF-1.7\nimage-fallback-orchestration-fixture');
  const primaryContent = [[
    { type: 'title', content: { title_content: [{ type: 'text', content: 'Model A1' }] }, bbox: [1, 1, 10, 10] },
    { type: 'image', content: { image_caption: ['Dimensions'], image_footnote: [] }, bbox: [20, 20, 200, 200] },
  ], [{
    type: 'paragraph', content: { paragraph_content: [{ type: 'text', content: 'Warranty' }] }, bbox: [1, 1, 10, 10],
  }]];
  const hybridContent = [[{
    type: 'table', content: {
      html: '<table><tr><td>Width</td><td>598 mm</td></tr></table>',
      table_caption: [], table_footnote: [], table_type: 'simple_table', table_nest_level: 1,
    }, bbox: [20, 20, 200, 200],
  }]];
  const parseCalls = [];
  try {
    const result = await runMineruPdfWithImageFallback(pdf, {
      storageRoot,
      runCommand: async (_binary, args) => {
        if (args[0] === '-v') return { stdout: [
          'mineru, version 3.4.4',
          'fitappliance-model-revision ed6b654c018d742e65a17671e379c5e6ecc87ec9',
          `fitappliance-vlm-model-revision ${VLM_MODEL_REVISION}`,
          '',
        ].join('\n') };
        parseCalls.push(args);
        const hybrid = args[args.indexOf('-b') + 1] === 'hybrid-engine';
        const output = args[args.indexOf('-o') + 1];
        await mkdir(join(output, 'source', hybrid ? 'hybrid_auto' : 'auto'), { recursive: true });
        await writeFile(
          join(output, 'source', hybrid ? 'hybrid_auto' : 'auto', 'source_content_list_v2.json'),
          JSON.stringify(hybrid ? hybridContent : primaryContent),
        );
        return { stdout: 'done' };
      },
    });
    assert.equal(parseCalls.length, 2);
    assert.deepEqual(parseCalls[1].slice(-4), ['-s', '0', '-e', '0']);
    assert.equal(result.derivedArtifact.profileId, 'hybrid-image-high-v1');
    assert.deepEqual(result.derivedArtifact.processedPages, [1]);
    assert.deepEqual(result.derivedArtifact.fallbackTrigger, {
      profileId: 'pipeline-auto-v1',
      contentSha256: result.primaryDerivedArtifact.contentSha256,
      objectPath: result.primaryDerivedArtifact.objectPath,
      pages: [1],
    });
    assert.deepEqual(JSON.parse(result.jsonBytes), [
      hybridContent[0],
      primaryContent[1],
    ]);
    const replay = await runMineruPdfWithImageFallback(pdf, {
      storageRoot,
      runCommand: async () => { throw new Error('merged image fallback cache was not reused'); },
    });
    assert.deepEqual(JSON.parse(replay.jsonBytes), [
      hybridContent[0],
      primaryContent[1],
    ]);
    assert.equal(replay.derivedArtifact.contentSha256, result.derivedArtifact.contentSha256);
  } finally {
    await rm(storageRoot, { recursive: true, force: true });
  }
});
