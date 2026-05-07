import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractText, cleanExtractedText } from '../../scripts/pdf-pipeline/2-extract-text.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixturePdf = path.join(repoRoot, 'tests', 'pdf-pipeline', 'fixtures', 'sample-bosch-fridge.pdf');

test('pdf pipeline extract: reads text and page metadata from fixture PDF', async () => {
  const result = await extractText(fixturePdf);

  assert.equal(result.pageCount, 1);
  assert.ok(result.text.length > 1000);
  assert.match(result.text, /B36FD52SNS/);
  assert.match(result.text, /Required cutout size/i);
});

test('pdf pipeline extract: removes simple page numbers and repeated footer noise', () => {
  const cleaned = cleanExtractedText('Header\n1\nUseful paragraph\n© BSH Home Appliances\n2\nUseful paragraph');

  assert.doesNotMatch(cleaned, /^1$/m);
  assert.doesNotMatch(cleaned, /© BSH/);
  assert.match(cleaned, /Useful paragraph/);
});

