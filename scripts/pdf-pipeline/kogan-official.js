const DEFAULT_PATTERNS = [
  (sku) => `${sku}_UG.pdf`,
  (sku) => `${sku}_UG_V1.1.pdf`,
  (sku) => `${sku}_User_Manual.pdf`,
  (sku) => `${sku}_UM.pdf`,
  (sku) => `${sku}_Manual.pdf`,
  (sku) => `${sku}_UserManual.pdf`,
  (sku) => `${sku}.pdf`,
  (sku) => `${sku}_IB.pdf`
];

function getTargetSku(target = {}) {
  return String(target.sku || target.model || target.product?.model || target.product?.sku || '').trim();
}

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function buildKoganManualUrls(sku, {
  baseUrl = 'https://assets.kogan.com/files/usermanuals/',
  patterns = DEFAULT_PATTERNS
} = {}) {
  const normalized = normalizeSku(sku);
  if (!normalized) return [];
  return patterns.map((pattern) => new URL(pattern(normalized), baseUrl).toString());
}

async function probePdfMagic(url, {
  fetchImpl = globalThis.fetch,
  userAgent = 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)'
} = {}) {
  if (!fetchImpl) throw new Error('Kogan official finder requires fetch');
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {
      Range: 'bytes=0-7',
      'User-Agent': userAgent
    }
  });
  if (!response.ok && response.status !== 206) {
    return { ok: false, status: response.status };
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    ok: bytes.toString('latin1').startsWith('%PDF-'),
    status: response.status,
    contentType: response.headers?.get?.('content-type') || ''
  };
}

async function findKoganOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch,
  patterns = DEFAULT_PATTERNS,
  baseUrl,
  userAgent
} = {}) {
  const sku = getTargetSku(target);
  const urls = buildKoganManualUrls(sku, { baseUrl, patterns });
  const failures = [];

  for (const url of urls) {
    const result = await probePdfMagic(url, { fetchImpl, userAgent }).catch((error) => ({
      ok: false,
      error: error.message
    }));
    if (result.ok) {
      return {
        sourceUrl: url,
        source: 'kogan-official-user_manual',
        resourceType: 'user_manual'
      };
    }
    failures.push(`${url}: ${result.error || result.status || 'not pdf'}`);
  }

  throw new Error(`Kogan official PDF resources not found for ${sku}: ${failures.slice(0, 3).join(' | ')}`);
}

exports.DEFAULT_PATTERNS = DEFAULT_PATTERNS;
exports.buildKoganManualUrls = buildKoganManualUrls;
exports.findKoganOfficialPdf = findKoganOfficialPdf;
exports.normalizeSku = normalizeSku;
exports.probePdfMagic = probePdfMagic;
