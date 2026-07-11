import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { extractText, cleanExtractedText } from '../../scripts/pdf-pipeline/2-extract-text.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixturePdf = path.join(repoRoot, 'tests', 'pdf-pipeline', 'fixtures', 'sample-bosch-fridge.pdf');

test('pdf pipeline extract: reads text and page metadata from fixture PDF', async () => {
  let receivedPdf = false;
  const result = await extractText(fixturePdf, {
    processPdf: async (bytes) => {
      receivedPdf = bytes.subarray(0, 5).toString('utf8') === '%PDF-';
      return {
        jsonBytes: Buffer.from(JSON.stringify([[
          {
            type: 'text',
            content: { text_content: `B36FD52SNS\n${'Bosch refrigerator specifications '.repeat(45)}\nRequired cutout size 70 in x 36 in x 29 5/16 in` },
            bbox: [0, 0, 1000, 1000],
          },
        ]])),
        derivedArtifact: { parserVersion: '3.4.4' },
      };
    },
  });

  assert.equal(receivedPdf, true);
  assert.equal(result.pageCount, 1);
  assert.ok(result.text.length > 1000);
  assert.match(result.text, /B36FD52SNS/);
  assert.match(result.text, /Required cutout size/i);
  assert.equal(result.extractionFormat, 'mineru_content_list_v2');
  assert.equal(result.parserVersion, '3.4.4');
});

test('pdf pipeline extract: removes simple page numbers and repeated footer noise', () => {
  const cleaned = cleanExtractedText('Header\n1\nUseful paragraph\n© BSH Home Appliances\n2\nUseful paragraph');

  assert.doesNotMatch(cleaned, /^1$/m);
  assert.doesNotMatch(cleaned, /© BSH/);
  assert.match(cleaned, /Useful paragraph/);
});

test('pdf pipeline extract: persists MinerU JSON before exposing compatibility text', async () => {
  const storageRoot = await mkdtemp(path.join(tmpdir(), 'fitappliance-pdf-json-'));
  const jsonBytes = Buffer.from(JSON.stringify([[
    { type: 'paragraph', content: { paragraph_content: [{ type: 'text', content: 'Model A1 Width 600 mm' }] }, bbox: [0, 0, 1000, 1000] },
  ]]));
  const hash = createHash('sha256').update(jsonBytes).digest('hex');
  const objectPath = `evidence/derived/mineru-json/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.json`;
  try {
    await extractText(fixturePdf, {
      storageRoot,
      processPdf: async () => ({
        jsonBytes,
        derivedArtifact: { parserVersion: '3.4.4', contentSha256: hash, objectPath },
      }),
    });
    assert.deepEqual(await readFile(path.join(storageRoot, objectPath)), jsonBytes);
  } finally {
    await rm(storageRoot, { recursive: true, force: true });
  }
});
