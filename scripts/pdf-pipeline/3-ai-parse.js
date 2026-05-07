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

async function extractStructuredData(text, options = {}) {
  const truncatedText = String(text || '').slice(0, MAX_TEXT_CHARS);
  const prompt = PROMPT_TEMPLATE.replace('{{TEXT}}', truncatedText);
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
exports.MAX_TEXT_CHARS = MAX_TEXT_CHARS;
