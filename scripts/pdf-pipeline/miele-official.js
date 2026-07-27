const { createHash } = require('node:crypto');

const { findManualEvidenceSourceUrl } = require('./1-fetch');
const { mieleModelMatchesSku, normalizeSku } = require('./parsers/miele');
const manufacturerSourcePolicy = require('../../data/architecture-v2/policies/manufacturer-source-policy.json');

const MIELE_SHOP_SEARCH_URL = 'https://shop.miele.com.au/INTERSHOP/web/WFS/Miele-AU-Site/en_AU/-/AUD/ViewParametricSearch-SimpleOfferSearch';
const MIELE_DOMESTIC_DOWNLOAD_URL = 'https://www.miele.com.au/domestic/product-details-1995.htm?info=download';
const MIELE_SPEC_SHEET_BASE_URL = 'https://www.miele.com.au/media/ex/au/specsheets/';
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

function exactProductMaterialAlias(target = {}) {
  const targetModel = normalizeSku(getTargetSku(target));
  const category = getTargetCategory(target);
  const aliases = manufacturerSourcePolicy.officialProductMaterialModelAliases?.miele?.[category];
  if (!targetModel || !Array.isArray(aliases)) return null;
  return aliases.find((entry) => normalizeSku(entry?.targetModel) === targetModel) ?? null;
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
  const compact = normalizeSku(value);
  for (const suffix of ['EDTCS', 'CLST', 'BRWS', 'OBSW']) {
    if (compact.endsWith(suffix) && compact.length - suffix.length >= 4) {
      return compact.slice(0, -suffix.length);
    }
  }
  return compact;
}

function formatMieleSearchModel(value) {
  const compact = normalizeSku(value);
  let stem = compact;
  let finish = '';
  for (const suffix of ['EDTCS', 'CLST', 'BRWS', 'OBSW']) {
    if (stem.endsWith(suffix) && stem.length - suffix.length >= 4) {
      finish = suffix;
      stem = stem.slice(0, -suffix.length);
      break;
    }
  }
  const match = stem.match(/^([A-Z]{1,5})(\d{3,5})([A-Z0-9]*)$/);
  if (!match) return String(value || '').trim();
  let descriptor = match[3];
  let size = '';
  let feature = '';
  if (descriptor.endsWith('K2O')) {
    feature = 'K2O';
    descriptor = descriptor.slice(0, -feature.length);
    if (descriptor.endsWith('XXL')) {
      size = 'XXL';
      descriptor = descriptor.slice(0, -size.length);
    }
  }
  return [match[1], match[2], descriptor, size, feature, finish].filter(Boolean).join(' ');
}

function buildMieleSearchQueries(target = {}) {
  const sku = getTargetSku(target);
  const compact = normalizeSku(sku);
  const stripped = stripMieleColourSuffix(sku);
  const exactAlias = exactProductMaterialAlias(target);
  return [...new Set([
    exactAlias?.pageModel,
    formatMieleSearchModel(compact),
    sku,
    formatMieleSearchModel(stripped),
    stripped,
    compact,
  ].filter((query) => String(query || '').trim().length >= 4))];
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#47;/g, '/')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function htmlAttribute(attributes, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(attributes || '').match(
    new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i')
  );
  return decodeHtml(match?.[1] ?? match?.[2] ?? '');
}

function htmlText(value) {
  return decodeHtml(String(value || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLeadingMieleModel(value) {
  const text = htmlText(value);
  const match = text.match(
    /^\s*([A-Z]{1,5})\s*(\d{3,5})(?:\s+(SC(?:i|Vi)|[A-Z]{1,5})(?![a-z]))?(?:\s+(XXL)(?=\s|$))?/
  );
  if (!match) return null;
  const trailing = text.slice(match[0].length);
  const trailingFeature = /\bK2O\b/i.test(trailing) ? 'K2O' : null;
  const parts = [...match.slice(1), trailingFeature].filter(Boolean);
  const slashFinish = trailing.match(/^\s+edt\s*\/\s*(bs|cs)\b/i);
  const separatedFinish = !slashFinish && normalizeSku(match[3]) === 'EDT'
    ? trailing.match(/^\s+(BS|CS)\b/i)
    : null;
  const finish = String(slashFinish?.[1] ?? separatedFinish?.[1] ?? '').toUpperCase();
  const modelLabel = [
    ...parts,
    slashFinish ? `edt/${finish.toLowerCase()}` : finish,
  ].filter(Boolean).join(' ');
  return {
    model: normalizeSku([...parts, finish].filter(Boolean).join(' ')),
    modelLabel,
  };
}

function extractMieleProductRecords(searchHtml) {
  const records = [];
  for (const match of String(searchHtml || '').matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attributes = match[1];
    const sourceUrl = htmlAttribute(attributes, 'href');
    if (!/^https:\/\/shop\.miele\.com\.au\//i.test(sourceUrl)) continue;
    const urlMaterialNumber = materialNumberFromProductUrl(sourceUrl);
    const attributeMaterialNumber = htmlAttribute(attributes, 'data-product-sku');
    if (!urlMaterialNumber
      || (attributeMaterialNumber && attributeMaterialNumber !== urlMaterialNumber)) {
      continue;
    }
    const title = htmlText(match[2]);
    const extractedModel = extractLeadingMieleModel(title);
    if (!title || !extractedModel) continue;
    records.push({
      sourceUrl,
      materialNumber: urlMaterialNumber,
      title,
      model: extractedModel.model,
      modelLabel: extractedModel.modelLabel,
    });
  }
  const unique = new Map();
  for (const record of records) {
    unique.set(`${record.sourceUrl}\0${record.materialNumber}\0${record.model}`, record);
  }
  return [...unique.values()].sort((left, right) => (
    left.materialNumber.localeCompare(right.materialNumber)
      || left.sourceUrl.localeCompare(right.sourceUrl)
  ));
}

function extractMieleProductUrls(searchHtml) {
  const urls = new Set(extractMieleProductRecords(searchHtml).map((record) => record.sourceUrl));
  for (const match of String(searchHtml || '').matchAll(/href="([^"]*zid\d+\/?)"/gi)) {
    const url = decodeHtml(match[1]);
    if (/^https:\/\/shop\.miele\.com\.au\//i.test(url)) urls.add(url);
  }
  return [...urls];
}

function materialNumberFromProductUrl(url) {
  const match = String(url || '').match(/zid(\d+)/i);
  return match ? match[1] : null;
}

function productCategoryMatchesTarget(url, target = {}) {
  const pathname = new URL(url).pathname.toLowerCase();
  const category = getTargetCategory(target);
  if (category === 'dishwasher') return /dishwasher/.test(pathname);
  if (category === 'fridge') return /refrigerat|fridge|freezer/.test(pathname);
  if (category === 'dryer') return /dryer|tumble/.test(pathname);
  if (category === 'washing_machine') return /washing|laundry/.test(pathname);
  return true;
}

function productRecordMatchesTarget(record, target = {}) {
  const exactAlias = exactProductMaterialAlias(target);
  if (exactAlias) {
    return record?.materialNumber === String(exactAlias.materialNumber)
      && record?.model === normalizeSku(exactAlias.pageModel)
      && productCategoryMatchesTarget(record.sourceUrl, target);
  }
  const targetModel = stripMieleColourSuffix(getTargetSku(target));
  return Boolean(targetModel)
    && record?.model === targetModel
    && productCategoryMatchesTarget(record.sourceUrl, target);
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

async function persistHtml(text, {
  sourceUrl,
  requestedModel,
  method,
  writeObject,
} = {}) {
  if (typeof writeObject !== 'function') return null;
  const bytes = Buffer.from(String(text || ''), 'utf8');
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');
  const objectPath = `evidence/web/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}.html`;
  await writeObject(objectPath, bytes);
  return {
    schemaVersion: 1,
    method,
    market: 'AU',
    discoveryUrl: sourceUrl,
    requestedModel,
    contentType: 'text/html',
    contentSha256,
    objectPath,
    byteSize: bytes.length,
  };
}

function supportedLane(laneId, required, status, provenance, candidateCount, reason = null) {
  return { laneId, required, supported: true, status, candidateCount, provenance, reason };
}

function unsupportedLane(laneId, reason) {
  return {
    laneId,
    required: false,
    supported: false,
    status: 'unsupported',
    candidateCount: 0,
    provenance: [],
    reason,
  };
}

function mieleSourceLanes({
  searchProvenance,
  searchError,
  selectionError,
  pageProvenance,
  productPageError,
  resources,
}) {
  const currentStatus = searchProvenance.length && !selectionError ? 'complete' : 'retryable';
  const currentReason = currentStatus === 'complete'
    ? null
    : selectionError || searchError || 'Immutable Miele search provenance was not persisted.';
  const dependentProvenance = pageProvenance.length ? pageProvenance : searchProvenance;
  const productCount = resources.filter((resource) => (
    resource.sourceLaneId === 'official_product_detail'
  )).length;
  const documentCount = resources.filter((resource) => (
    resource.sourceLaneId === 'official_document_cdn'
  )).length;
  const productPagePersisted = pageProvenance.some((entry) => (
    entry.method === 'official_product_page'
  ));
  const productStatus = productCount > 0 && productPagePersisted && !productPageError
    ? 'complete'
    : 'retryable';
  const productReason = productStatus === 'complete'
    ? null
    : productPageError || selectionError || 'Exact official product detail was not persisted.';
  const documentStatus = documentCount > 0 && productStatus === 'complete'
    ? 'complete'
    : 'retryable';
  const documentReason = documentStatus === 'complete'
    ? null
    : productReason || 'No bounded official document candidate was discovered.';
  return [
    supportedLane(
      'current_product', true, currentStatus, searchProvenance, 0, currentReason,
    ),
    unsupportedLane(
      'discontinued_archive',
      'The bounded Miele resolver does not yet cover a discontinued-product archive.',
    ),
    unsupportedLane(
      'support_search_api',
      'Miele does not expose a bounded Australian support-search API in this resolver.',
    ),
    supportedLane(
      'official_document_cdn', true, documentStatus, dependentProvenance,
      documentCount, documentReason,
    ),
    supportedLane(
      'official_product_detail', true, productStatus, dependentProvenance,
      productCount, productReason,
    ),
  ];
}

async function findMieleOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch,
  timeoutMs = 30_000,
  userAgent = DEFAULT_USER_AGENT,
  writeObject = null,
} = {}) {
  const requestedModel = getTargetSku(target);
  const searchRecords = [];
  const searchProvenance = [];
  const searchErrors = [];
  for (const query of buildMieleSearchQueries(target)) {
    const url = `${MIELE_SHOP_SEARCH_URL}?${new URLSearchParams({ SearchTerm: query })}`;
    try {
      const html = await fetchText(url, { fetchImpl, timeoutMs, userAgent });
      const provenance = await persistHtml(html, {
        sourceUrl: url,
        requestedModel,
        method: 'official_site_search',
        writeObject,
      });
      if (provenance) searchProvenance.push(provenance);
      searchRecords.push(...extractMieleProductRecords(html));
    } catch (error) {
      searchErrors.push(`${url}: ${error.message}`);
    }
  }

  const matchingByMaterial = new Map();
  for (const record of searchRecords.filter((entry) => productRecordMatchesTarget(entry, target))) {
    const existing = matchingByMaterial.get(record.materialNumber);
    if (!existing || record.sourceUrl < existing.sourceUrl) {
      matchingByMaterial.set(record.materialNumber, record);
    }
  }
  const matches = [...matchingByMaterial.values()].sort((left, right) => (
    left.materialNumber.localeCompare(right.materialNumber)
  ));
  const selectionError = matches.length > 1
    ? `Miele official search is ambiguous for ${requestedModel}: ${matches.map((entry) => entry.materialNumber).join(', ')}`
    : matches.length === 0
      ? `Miele official current-product search found no exact model for ${requestedModel}`
      : null;
  if (matches.length !== 1) {
    const resources = [];
    return {
      sourceUrl: null,
      source: 'miele-official',
      resources,
      sourceLanes: mieleSourceLanes({
        searchProvenance,
        searchError: searchErrors[0] || null,
        selectionError,
        pageProvenance: [],
        productPageError: null,
        resources,
      }),
      reason: selectionError || searchErrors[0] || `Miele official Product Sheet not found for ${requestedModel}`,
    };
  }

  const match = matches[0];
  const materialNumber = match.materialNumber;
  const downloadUrl = `${MIELE_DOMESTIC_DOWNLOAD_URL}&${new URLSearchParams({ mat: materialNumber })}`;
  const pageProvenance = [];
  const pageErrors = [];
  let productPageError = null;
  let productPageProvenance = null;
  let downloadHtml = '';
  try {
    const productHtml = await fetchText(match.sourceUrl, { fetchImpl, timeoutMs, userAgent });
    const provenance = await persistHtml(productHtml, {
      sourceUrl: match.sourceUrl,
      requestedModel,
      method: 'official_product_page',
      writeObject,
    });
    if (provenance) {
      productPageProvenance = provenance;
      pageProvenance.push(provenance);
    }
  } catch (error) {
    productPageError = `${match.sourceUrl}: ${error.message}`;
    pageErrors.push(productPageError);
  }
  try {
    downloadHtml = await fetchText(downloadUrl, { fetchImpl, timeoutMs, userAgent });
    const provenance = await persistHtml(downloadHtml, {
      sourceUrl: downloadUrl,
      requestedModel,
      method: 'official_download_index',
      writeObject,
    });
    if (provenance) pageProvenance.push(provenance);
  } catch (error) {
    pageErrors.push(`${downloadUrl}: ${error.message}`);
  }

  const deterministicSpecUrl = `${MIELE_SPEC_SHEET_BASE_URL}${materialNumber}.pdf`;
  const linkedOfficialSheets = extractMieleDownloadLinks(downloadHtml)
    .map((link) => ({ ...link, score: scoreMieleDownloadLink(link) }))
    .filter((link) => link.score > 0)
    .filter((link) => {
      try {
        return new URL(link.sourceUrl).hostname.toLowerCase().endsWith('miele.com.au');
      } catch {
        return false;
      }
    })
    .sort((left, right) => right.score - left.score || left.sourceUrl.localeCompare(right.sourceUrl));
  const documentUrls = [...new Set([
    deterministicSpecUrl,
    ...linkedOfficialSheets.map((link) => link.sourceUrl),
  ])];
  const materialDiscoveryBase = productPageProvenance ? {
    schemaVersion: 1,
    method: 'official_product_material',
    market: 'AU',
    discoveryUrl: match.sourceUrl,
    requestedModel,
    matchedModel: match.modelLabel,
    materialNumber,
    discoveryContentSha256: productPageProvenance.contentSha256,
    discoveryObjectPath: productPageProvenance.objectPath,
    discoveryByteSize: productPageProvenance.byteSize,
  } : null;
  const materialDiscoveryProvenance = materialDiscoveryBase ? {
    ...materialDiscoveryBase,
    artifactUrl: deterministicSpecUrl,
  } : null;
  const productPageDiscoveryProvenance = materialDiscoveryBase ? {
    ...materialDiscoveryBase,
    artifactUrl: match.sourceUrl,
  } : null;
  const resources = [
    {
      sourceUrl: match.sourceUrl,
      resourceType: 'product_page',
      sourceLaneId: 'official_product_detail',
      sourceModelHint: match.modelLabel,
      requiredAttempt: true,
      ...(productPageDiscoveryProvenance
        ? { discoveryProvenance: productPageDiscoveryProvenance }
        : {}),
    },
    ...documentUrls.map((sourceUrl) => ({
      sourceUrl,
      resourceType: /specsheet|specification|product.?sheet/i.test(sourceUrl)
        ? 'specification_sheet'
        : 'user_manual',
      sourceLaneId: 'official_document_cdn',
      sourceModelHint: match.modelLabel,
      requiredAttempt: true,
      ...(sourceUrl === deterministicSpecUrl && materialDiscoveryProvenance
        ? { discoveryProvenance: materialDiscoveryProvenance }
        : {}),
    })),
  ];
  const sourceLanes = mieleSourceLanes({
    searchProvenance,
    searchError: searchErrors[0] || null,
    selectionError: null,
    pageProvenance,
    productPageError,
    resources,
  });
  return {
    sourceUrl: deterministicSpecUrl,
    source: 'miele-official-product-sheet',
    verifiedAlias: normalizeSku(requestedModel),
    materialNumber,
    productUrl: match.sourceUrl,
    resources,
    sourceLanes,
    ...(pageErrors.length || searchErrors.length ? {
      reason: [...searchErrors, ...pageErrors].join(' | '),
    } : {}),
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
exports.extractMieleProductRecords = extractMieleProductRecords;
exports.extractMieleProductUrls = extractMieleProductUrls;
exports.findMieleOfficialPdf = findMieleOfficialPdf;
exports.findMielePdf = findMielePdf;
exports.findMieleManualEvidencePdf = findMieleManualEvidencePdf;
exports.mieleEvidenceModelMatchesTarget = mieleEvidenceModelMatchesTarget;
