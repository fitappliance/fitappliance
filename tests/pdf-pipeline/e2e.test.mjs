import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractText } from '../../scripts/pdf-pipeline/2-extract-text.js';
import { extractStructuredData } from '../../scripts/pdf-pipeline/3-ai-parse.js';
import { validateExtracted } from '../../scripts/pdf-pipeline/4-validate.js';
import { prepareCatalogPatch } from '../../scripts/pdf-pipeline/5-merge.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixturePdf = path.join(repoRoot, 'tests', 'pdf-pipeline', 'fixtures', 'sample-bosch-fridge.pdf');

test('pdf pipeline e2e: fixture PDF moves through extract parse validate and patch stages', async () => {
  const textResult = await extractText(fixturePdf);
  assert.ok(textResult.text.length > 1000);
  assert.ok(textResult.pageCount > 0);

  let llmCalls = 0;
  const extracted = await extractStructuredData(textResult.text, {
    llmCaller: async () => {
      llmCalls += 1;
      return JSON.stringify({
        brand: 'Bosch',
        model: 'B36FD52SNS',
        category: 'fridge',
        dimensions_mm: { width: 905, height: 1780, depth: 841 },
        clearance_mm: { side: 3, top: 13, rear: 25, front: 0 },
        capacity_litres: 736,
        energy_stars: null,
        annual_kwh: 702,
        door_swing_mm: null,
        weight_kg: 145,
        noise_db: null,
        confidence: 'high',
        source_quote: 'Required cutout size 70 in x 36 in x 29 5/16 in'
      });
    }
  });
  assert.equal(llmCalls, 1);

  assert.equal(validateExtracted(extracted).valid, true);

  const patch = await prepareCatalogPatch(extracted, {
    products: [
      { id: 'bosch-b36fd52sns', brand: 'Bosch', model: 'B36FD52SNS', w: 900, h: 1780, d: 841 }
    ]
  });
  assert.equal(patch.matched.id, 'bosch-b36fd52sns');
  assert.equal(typeof patch.patch, 'object');
});

