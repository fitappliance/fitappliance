import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEnvLlmCaller,
  extractStructuredData
} from '../../scripts/pdf-pipeline/3-ai-parse.js';
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
  assert.match(PROMPT_TEMPLATE, /TARGET PRODUCT CONTEXT/);
  assert.match(PROMPT_TEMPLATE, /If multiple models appear/i);
  assert.match(PROMPT_TEMPLATE, /{{TEXT}}/);
});

test('pdf pipeline parse: includes target context in the prompt for multi-model PDFs', async () => {
  let seenPrompt = '';
  await extractStructuredData('PDF mentions many variants', {
    target: {
      brand: 'Hisense',
      sku: 'HRSBS632BW',
      category: 'fridge'
    },
    sourceUrl: 'https://example.com/HRSBS632BW.pdf',
    llmCaller: async (prompt) => {
      seenPrompt = prompt;
      return JSON.stringify({
        brand: 'Hisense',
        model: 'HRSBS632BW',
        category: 'fridge',
        dimensions_mm: { width: 910, height: 1795, depth: 717 },
        clearance_mm: { side: 5, top: 20, rear: 10, front: 0 },
        capacity_litres: 632,
        energy_stars: null,
        annual_kwh: null,
        door_swing_mm: null,
        weight_kg: null,
        noise_db: null,
        confidence: 'high',
        source_quote: 'Product dimensions 910 x 1795 x 717 mm'
      });
    }
  });

  assert.match(seenPrompt, /Brand: Hisense/);
  assert.match(seenPrompt, /SKU\/Model: HRSBS632BW/);
  assert.match(seenPrompt, /Category: fridge/);
  assert.match(seenPrompt, /Source URL: https:\/\/example.com\/HRSBS632BW\.pdf/);
});

test('pdf pipeline parse: creates an OpenAI caller when OPENAI_API_KEY is present', async () => {
  let requestUrl = '';
  const caller = createEnvLlmCaller({
    OPENAI_API_KEY: 'test-key',
    OPENAI_MODEL: 'gpt-test'
  }, {
    fetchImpl: async (url, init) => {
      requestUrl = url;
      assert.equal(init.headers.Authorization, 'Bearer test-key');
      const body = JSON.parse(init.body);
      assert.equal(body.model, 'gpt-test');
      return new Response(JSON.stringify({
        output_text: JSON.stringify({ brand: 'Hisense', model: 'HRTF206' })
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });

  assert.equal(typeof caller, 'function');
  const result = await caller('prompt', 'text');
  assert.match(requestUrl, /api\.openai\.com\/v1\/responses/);
  assert.equal(JSON.parse(result).model, 'HRTF206');
});

test('pdf pipeline parse: creates an Anthropic caller when ANTHROPIC_API_KEY is present', async () => {
  const caller = createEnvLlmCaller({
    ANTHROPIC_API_KEY: 'anthropic-key',
    ANTHROPIC_MODEL: 'claude-test'
  }, {
    fetchImpl: async (url, init) => {
      assert.match(url, /api\.anthropic\.com\/v1\/messages/);
      assert.equal(init.headers['x-api-key'], 'anthropic-key');
      const body = JSON.parse(init.body);
      assert.equal(body.model, 'claude-test');
      return new Response(JSON.stringify({
        content: [{ type: 'text', text: JSON.stringify({ brand: 'Hisense', model: 'HRTF206' }) }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });

  assert.equal(typeof caller, 'function');
  const result = await caller('prompt', 'text');
  assert.equal(JSON.parse(result).brand, 'Hisense');
});
