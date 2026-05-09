require('dotenv').config({ quiet: true });

const { PROMPT_TEMPLATE } = require('./lib/prompt-template');

const MAX_TEXT_CHARS = 50_000;

const DEFAULT_FIXTURE_JSON = {
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
};

function defaultLlmCaller() {
  return JSON.stringify(DEFAULT_FIXTURE_JSON);
}

function getFetchImpl(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!fetchImpl) {
    throw new Error('LLM caller requires a fetch implementation');
  }
  return fetchImpl;
}

async function parseJsonResponse(response, provider) {
  if (!response.ok) {
    const body = typeof response.text === 'function' ? await response.text().catch(() => '') : '';
    throw new Error(`${provider} request failed with HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  return response.json();
}

function extractOpenAiOutputText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  const fromOutput = payload?.output
    ?.flatMap((item) => item.content || [])
    ?.find((part) => typeof part.text === 'string')
    ?.text;
  if (fromOutput) return fromOutput;
  throw new Error('OpenAI response did not include output_text');
}

function extractAnthropicOutputText(payload) {
  const text = payload?.content?.find((part) => typeof part.text === 'string')?.text;
  if (text) return text;
  throw new Error('Anthropic response did not include text content');
}

function createOpenAiCaller(env = process.env, options = {}) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const fetchImpl = getFetchImpl(options);
  const model = env.OPENAI_MODEL || 'gpt-4.1-mini';
  const baseUrl = String(env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const responsesUrl = `${baseUrl}/responses`;

  return async function openAiCaller(prompt) {
    const response = await fetchImpl(responsesUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        input: prompt,
        temperature: 0
      })
    });
    const payload = await parseJsonResponse(response, 'OpenAI');
    return extractOpenAiOutputText(payload);
  };
}

function createAnthropicCaller(env = process.env, options = {}) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const fetchImpl = getFetchImpl(options);
  const model = env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest';

  return async function anthropicCaller(prompt) {
    const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        max_tokens: 3000,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });
    const payload = await parseJsonResponse(response, 'Anthropic');
    return extractAnthropicOutputText(payload);
  };
}

function createEnvLlmCaller(env = process.env, options = {}) {
  return createOpenAiCaller(env, options) || createAnthropicCaller(env, options);
}

function buildTargetContext({ target = null, sourceUrl = '' } = {}) {
  const lines = [];
  if (target?.brand) lines.push(`Brand: ${target.brand}`);
  if (target?.sku || target?.model || target?.product?.model) {
    lines.push(`SKU/Model: ${target.sku || target.model || target.product.model}`);
  }
  if (target?.category || target?.cat || target?.product?.cat) {
    lines.push(`Category: ${target.category || target.cat || target.product.cat}`);
  }
  if (sourceUrl) lines.push(`Source URL: ${sourceUrl}`);
  return lines.length ? lines.join('\n') : 'No target context supplied.';
}

async function extractStructuredData(text, options = {}) {
  const truncatedText = String(text || '').slice(0, MAX_TEXT_CHARS);
  const prompt = PROMPT_TEMPLATE
    .replace('{{TARGET_CONTEXT}}', buildTargetContext(options))
    .replace('{{TEXT}}', truncatedText);
  const llmCaller = options.llmCaller || defaultLlmCaller;
  const response = await llmCaller(prompt, truncatedText);

  try {
    return JSON.parse(response);
  } catch (error) {
    throw new Error(`Invalid JSON from llmCaller: ${error.message}`);
  }
}

exports.extractStructuredData = extractStructuredData;
exports.defaultLlmCaller = defaultLlmCaller;
exports.createEnvLlmCaller = createEnvLlmCaller;
exports.createOpenAiCaller = createOpenAiCaller;
exports.createAnthropicCaller = createAnthropicCaller;
exports.buildTargetContext = buildTargetContext;
exports.MAX_TEXT_CHARS = MAX_TEXT_CHARS;
