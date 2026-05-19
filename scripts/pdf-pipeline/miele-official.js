const { findManualEvidenceSourceUrl } = require('./1-fetch');
const { mieleModelMatchesSku, normalizeSku } = require('./parsers/miele');

const MIELE_SHOP_SEARCH_URL = 'https://shop.miele.com.au/INTERSHOP/web/WFS/Miele-AU-Site/en_AU/-/AUD/ViewParametricSearch-SimpleOfferSearch';
const MIELE_DOMESTIC_DOWNLOAD_URL = 'https://www.miele.com.au/domestic/product-details-1995.htm?info=download';
const DEFAULT_USER_AGENT = 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)';

function normalizeCategory(value) {
  return String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
}

function getTargetSku(target = {}) {
  return String(target.sku || target.model || target.product?.model || target.product?.sku || '').trim();
}

function getTargetCategory(target = {}) {
  return normalizeCategory(target.category || target.cat || target.product?.cat);
}

function getEvidenceItems(entry) {
  const items = [];
  if (entry?.source_url) {
    items.push({
      type: entry.type || 'spec_sheet',
      status: entry.status || 'candidate',
      source_url: entry.source_url,
      verified_alias: entry.verified_alias
    });
  }
  if (Array.isArray(entry?.evidence)) items.push(...entry.evidence);
  return items;
}

function isUsableMieleSpecEvidence(item) {
  if (!item?.source_url || item.status === 'rejected') return false;
  const haystack = `${item.type || ''} ${item.source_url || ''}`;
  if (/quick[_\s-]*guide|quickstart|installation[_\s-]*guide|user[_\s-]*manual/i.test(haystack)) return false;
  return /spec|sheet|data|pdf/i.test(haystack);
}

function scoreMieleEvidence(item) {
  const haystack = `${item.type || ''} ${item.source_url || ''}`;
  let score = 0;
  if (/specification|spec[_\s-]*sheet|data[_\s-]*sheet/i.test(haystack)) score += 100;
  if (/spec|sheet/i.test(String(item.type || ''))) score += 20;
  if (/quick[_\s-]*guide|quickstart/i.test(haystack)) score -= 200;
  if (/installation[_\s-]*guide|user[_\s-]*manual/i.test(haystack)) score -= 100;
  return score;
}

function entryModels(entry) {
  return [
    entry?.model,
    entry?.sku,
    entry?.product?.model,
    entry?.product?.sku,
    entry?.verified_alias,
    ...getEvidenceItems(entry).map((item) => item.verified_alias)
  ].filter(Boolean).map((value) => String(value).trim());
}

function mieleEvidenceModelMatchesTarget({
  evidenceModel,
  targetSku,
  evidenceCategory,
  targetCategory
} = {}) {
  if (normalizeCategory(evidenceCategory) !== normalizeCategory(targetCategory)) return false;
  return mieleModelMatchesSku(evidenceModel, targetSku);
}

function findMieleManualEvidencePdf(target = {}, manualEvidence = {}) {
  const exact = findManualEvidenceSourceUrl(target, manualEvidence);
  if (exact) {
    return {
      sourceUrl: exact,
      source: 'manual-evidence',
      verifiedAlias: null
    };
  }

  const targetSku = getTargetSku(target);
  const targetCategory = getTargetCategory(target);
  const products = manualEvidence?.products || {};
  const matches = [];

  for (const entry of Object.values(products)) {
    if (!/miele/i.test(String(entry?.brand || entry?.product?.brand || ''))) continue;
    const evidenceCategory = normalizeCategory(entry?.category || entry?.cat || entry?.product?.cat);
    const item = getEvidenceItems(entry).find(isUsableMieleSpecEvidence);
    if (!item) continue;

    const verifiedAlias = entryModels(entry).find((model) => mieleEvidenceModelMatchesTarget({
      evidenceModel: model,
      targetSku,
      evidenceCategory,
      targetCategory
    }));
    if (!verifiedAlias) continue;

    matches.push({
      sourceUrl: item.source_url,
      source: `manual-evidence:miele-family-${item.type || 'spec_sheet'}`,
      verifiedAlias: normalizeSku(verifiedAlias),
      score: scoreMieleEvidence(item)
    });
  }

  matches.sort((a, b) => b.score - a.score || a.sourceUrl.localeCompare(b.sourceUrl));
  return matches[0] || null;
}

function stripMieleColourSuffix(value) {
  return String(value || '')
    .replace(/\b(?:EDT\/CS|CLST|BRWS|BK|BST|WS|ED|ACTIVE|AUTODOS|WCS|WPS)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildMieleSearchQueries(target = {}) {
  const sku = getTargetSku(target);
  const compact = normalizeSku(sku);
  const stripped = stripMieleColourSuffix(sku);
  return [...new Set([
    sku,
    stripped,
    compact
  ].filter((query) => String(query || '').trim().length >= 4))];
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#47;/g, '/')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractMieleProductUrls(searchHtml) {
  const urls = new Set();
  for (const match of String(searchHtml || '').matchAll(/href="([^"]*zid\d+\/?)"/gi)) {
    const url = decodeHtml(match[1]);
    if (/shop\.miele\.com\.au/i.test(url)) urls.add(url);
  }
  return [...urls];
}

function materialNumberFromProductUrl(url) {
  const match = String(url || '').match(/zid(\d+)/i);
  return match ? match[1] : null;
}

function productUrlMatchesTarget(url, target = {}) {
  const targetSku = normalizeSku(getTargetSku(target));
  if (!targetSku) return false;
  const slug = normalizeSku(String(url || '').split('/').filter(Boolean).at(-1) || '');
  if (!slug) return false;
  return slug.includes(targetSku) || targetSku.includes(slug.slice(0, Math.min(slug.length, targetSku.length)));
}

function scoreProductUrl(url, target = {}) {
  const targetSku = normalizeSku(getTargetSku(target));
  const stripped = normalizeSku(stripMieleColourSuffix(getTargetSku(target)));
  const slug = normalizeSku(String(url || '').split('/').filter(Boolean).at(-1) || '');
  let score = 0;
  if (slug.includes(targetSku)) score += 100;
  if (slug.includes(stripped)) score += 80;
  if (targetSku && slug.startsWith(targetSku.slice(0, Math.min(6, targetSku.length)))) score += 30;
  if (/zid\d+/i.test(url)) score += 10;
  return score;
}

function extractMieleDownloadLinks(downloadHtml) {
  const links = [];
  const rowPattern = /<tr>\s*<td>([^<]+)<\/td>\s*<td>pdf<\/td>\s*<td><a[^>]+href="([^"]+)"/gi;
  for (const match of String(downloadHtml || '').matchAll(rowPattern)) {
    links.push({
      label: match[1].trim(),
      sourceUrl: decodeHtml(match[2])
    });
  }
  return links;
}

function scoreMieleDownloadLink(link) {
  const label = String(link?.label || '');
  let score = 0;
  if (/product\s+sheet/i.test(label)) score += 100;
  if (/fitting|assembly/i.test(label)) score += 40;
  if (/operating|user/i.test(label)) score += 10;
  if (/guarantee|energylabel/i.test(label)) score -= 100;
  return score;
}

async function fetchText(url, {
  fetchImpl = globalThis.fetch,
  timeoutMs = 30_000,
  userAgent = DEFAULT_USER_AGENT
} = {}) {
  if (!fetchImpl) throw new Error('Miele official finder requires fetch');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml'
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Miele fetch failed HTTP ${response.status} for ${url}`);
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function findMieleOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch,
  timeoutMs = 30_000,
  userAgent = DEFAULT_USER_AGENT
} = {}) {
  const productUrls = [];
  for (const query of buildMieleSearchQueries(target)) {
    const url = `${MIELE_SHOP_SEARCH_URL}?${new URLSearchParams({ SearchTerm: query })}`;
    try {
      const html = await fetchText(url, { fetchImpl, timeoutMs, userAgent });
      productUrls.push(...extractMieleProductUrls(html));
    } catch {
      // Individual search variants are best-effort; final no-match remains fail-closed.
    }
  }

  const ranked = [...new Set(productUrls)]
    .filter((url) => productUrlMatchesTarget(url, target))
    .map((url) => ({ url, score: scoreProductUrl(url, target) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));

  const errors = [];
  for (const candidate of ranked) {
    const materialNumber = materialNumberFromProductUrl(candidate.url);
    if (!materialNumber) continue;
    const downloadUrl = `${MIELE_DOMESTIC_DOWNLOAD_URL}&${new URLSearchParams({ mat: materialNumber })}`;
    try {
      const downloadHtml = await fetchText(downloadUrl, { fetchImpl, timeoutMs, userAgent });
      const links = extractMieleDownloadLinks(downloadHtml)
        .map((link) => ({ ...link, score: scoreMieleDownloadLink(link) }))
        .filter((link) => link.score > 0)
        .sort((a, b) => b.score - a.score || a.sourceUrl.localeCompare(b.sourceUrl));
      const primary = links.find((link) => /product\s+sheet/i.test(link.label));
      if (!primary) {
        errors.push(`No Product Sheet PDF for material ${materialNumber}`);
        continue;
      }
      return {
        sourceUrl: primary.sourceUrl,
        source: 'miele-official-product-sheet',
        verifiedAlias: normalizeSku(getTargetSku(target)),
        materialNumber,
        productUrl: candidate.url,
        resources: links
      };
    } catch (error) {
      errors.push(error.message);
    }
  }

  return {
    sourceUrl: null,
    source: 'miele-official',
    reason: errors[0] || `Miele official Product Sheet not found for ${getTargetSku(target)}`
  };
}

async function findMielePdf(target = {}, manualEvidence = {}, options = {}) {
  const manual = findMieleManualEvidencePdf(target, manualEvidence);
  if (manual?.sourceUrl && manual.verifiedAlias) return manual;
  const official = await findMieleOfficialPdf(target, options);
  if (official?.sourceUrl) return official;
  return manual || official;
}

exports.MIELE_DOMESTIC_DOWNLOAD_URL = MIELE_DOMESTIC_DOWNLOAD_URL;
exports.MIELE_SHOP_SEARCH_URL = MIELE_SHOP_SEARCH_URL;
exports.buildMieleSearchQueries = buildMieleSearchQueries;
exports.extractMieleDownloadLinks = extractMieleDownloadLinks;
exports.extractMieleProductUrls = extractMieleProductUrls;
exports.findMieleOfficialPdf = findMieleOfficialPdf;
exports.findMielePdf = findMielePdf;
exports.findMieleManualEvidencePdf = findMieleManualEvidencePdf;
exports.mieleEvidenceModelMatchesTarget = mieleEvidenceModelMatchesTarget;
