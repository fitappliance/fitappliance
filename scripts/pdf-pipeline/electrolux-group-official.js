const FACTSHEET_ENDPOINT = 'https://resource.electrolux.com.au/Factsheet/RequestPdf';
const USER_AGENT = 'curl/8.7.1';
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const CURL_MAX_BUFFER = 35 * 1024 * 1024;

const GROUP_BRANDS = new Map([
  ['electrolux', 'Electrolux'],
  ['kelvinator', 'Kelvinator'],
  ['westinghouse', 'Westinghouse']
]);

function resolveElectroluxGroupBrand(target = {}) {
  const raw = target.brand || target.product?.brand || '';
  return GROUP_BRANDS.get(String(raw).trim().toLowerCase()) || null;
}

function exactModel(target = {}) {
  const raw = target.sku || target.model || target.product?.model || target.product?.sku || '';
  const model = String(raw).trim().toUpperCase();
  if (!model || model.length < 5 || model.length > 40 || !/^[A-Z0-9*./-]+$/.test(model)) {
    throw new Error('Electrolux group factsheet resolver requires an exact model');
  }
  return model;
}

function buildElectroluxGroupFactsheetUrl(target = {}) {
  const brand = resolveElectroluxGroupBrand(target);
  if (!brand) {
    throw new Error(`Unsupported Electrolux group brand: ${target.brand || target.product?.brand || ''}`);
  }
  const url = new URL(FACTSHEET_ENDPOINT);
  url.searchParams.set('modelNumber', exactModel(target));
  url.searchParams.set('brand', brand);
  return url.toString();
}

function headerValue(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  return headers[name] || headers[name.toLowerCase()] || '';
}

async function electroluxGroupFetch(url, options = {}) {
  const isHead = String(options.method || 'GET').toUpperCase() === 'HEAD';
  const args = [
    '-L',
    '--fail',
    '--silent',
    '--show-error',
    '--max-time',
    '60',
    '--user-agent',
    headerValue(options.headers, 'User-Agent') || USER_AGENT,
    '--header',
    `Accept: ${headerValue(options.headers, 'Accept') || 'application/pdf'}`
  ];
  if (isHead) args.push('--head');
  args.push(String(url));

  let stdout;
  try {
    ({ stdout } = await execFileAsync('curl', args, {
      encoding: isHead ? 'utf8' : 'buffer',
      maxBuffer: CURL_MAX_BUFFER,
      signal: options.signal
    }));
  } catch (error) {
    const detail = String(error.stderr || error.message || '').trim();
    throw new Error(`Electrolux group curl fetch failed: ${detail}`);
  }

  if (isHead) {
    const contentTypes = [...String(stdout).matchAll(/^content-type:\s*([^\r\n]+)/gim)];
    const contentType = contentTypes.at(-1)?.[1]?.trim() || '';
    return {
      ok: true,
      status: 200,
      headers: { get: (name) => name.toLowerCase() === 'content-type' ? contentType : null }
    };
  }

  const body = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
  if (body.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new Error('Electrolux group curl fetch did not return PDF magic bytes');
  }
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        if (name.toLowerCase() === 'content-type') return 'application/pdf';
        if (name.toLowerCase() === 'content-length') return String(body.length);
        return null;
      }
    },
    arrayBuffer: async () => body
  };
}

async function findElectroluxGroupFactsheet(target = {}, {
  fetchImpl = electroluxGroupFetch,
  timeoutMs = 30_000
} = {}) {
  if (!fetchImpl) throw new Error('Electrolux group factsheet resolver requires fetch');
  const brand = resolveElectroluxGroupBrand(target);
  const model = exactModel(target);
  const sourceUrl = buildElectroluxGroupFactsheetUrl(target);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(sourceUrl, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/pdf' }
    });
    if (!response.ok) {
      throw new Error(`Official factsheet returned HTTP ${response.status} for ${model}`);
    }
    const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
    if (!contentType.includes('application/pdf')) {
      throw new Error(`Official factsheet response is not a PDF for ${model}`);
    }
    return {
      sourceUrl,
      source: `${brand.toLowerCase()}-official-fact_sheet`,
      resourceType: 'fact_sheet',
      verifiedAlias: model,
      productUrl: null,
      label: `${brand} ${model} Fact Sheet`
    };
  } finally {
    clearTimeout(timer);
  }
}

exports.buildElectroluxGroupFactsheetUrl = buildElectroluxGroupFactsheetUrl;
exports.electroluxGroupFetch = electroluxGroupFetch;
exports.findElectroluxGroupFactsheet = findElectroluxGroupFactsheet;
exports.resolveElectroluxGroupBrand = resolveElectroluxGroupBrand;
