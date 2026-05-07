import test from 'node:test';
import assert from 'node:assert/strict';

import { extractStructuredData } from '../../scripts/pdf-pipeline/3-ai-parse.js';
import { PROMPT_TEMPLATE } from '../../scripts/pdf-pipeline/lib/prompt-template.js';

test('pdf pipeline parse: injects text into prompt and parses llm JSON', async () => {
  let calls = 0;
  const result = await extractStructuredData('Bosch B36FD52SNS dimensions text', {
    llmCaller: async (prompt, text) => {
      calls += 1;
      assert.match(prompt, /Bosch B36FD52SNS dimensions text/);
      assert.equal(text, 'Bosch B36FD52SNS dimensions text');
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

  assert.equal(calls, 1);
  assert.equal(result.model, 'B36FD52SNS');
});

test('pdf pipeline parse: default stub returns deterministic fixture JSON', async () => {
  const result = await extractStructuredData('any text');

  assert.equal(result.brand, 'Bosch');
  assert.equal(result.model, 'B36FD52SNS');
  assert.equal(result.category, 'fridge');
});

test('pdf pipeline parse: rejects invalid JSON from llmCaller', async () => {
  await assert.rejects(() => extractStructuredData('text', {
    llmCaller: async () => 'not json'
  }), /invalid json/i);
});

test('pdf pipeline parse: prompt template contains the schema contract', () => {
  assert.match(PROMPT_TEMPLATE, /output ONLY a single JSON object/);
  assert.match(PROMPT_TEMPLATE, /dimensions_mm/);
  assert.match(PROMPT_TEMPLATE, /Do not guess ambiguous dimensions/i);
  assert.match(PROMPT_TEMPLATE, /cavity dimension/i);
  assert.match(PROMPT_TEMPLATE, /{{TEXT}}/);
});
