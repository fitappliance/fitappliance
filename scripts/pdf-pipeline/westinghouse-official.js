const SITEMAP_URL = 'https://www.westinghouse.com.au/sitemap.xml';
const USER_AGENT = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const RESOURCE_BASE = 'https://resource.electrolux.com.au/Public/File/?Id=';
const { createHash } = require('node:crypto');
const { westinghouseModelMatchesSku } = require('./parsers/westinghouse');

const KNOWN_DIMENSION_GUIDES = [
  { id: '53210', models: ['WBB3100AK', 'WBB3100WK', 'WBB3400AK', 'WBB3400WK'] },
  { id: '53211', models: ['WTB3100AK', 'WTB3100WK', 'WTB3400AK', 'WTB3400WK'] },
  { id: '51192', models: ['WBB3700AH', 'WBB3700WH', 'WBB3400AH', 'WBB3400WH'] },
  { id: '51194', models: ['WTB3700AH', 'WTB3700WH', 'WTB3400AH', 'WTB3400WH', 'WTB2800AH', 'WTB2800WH', 'WTB2500WH', 'WTB2300WH'] },
  { id: '51195', models: ['WBE5300BC', 'WBE5300SC', 'WBE5300WC', 'WBE4500BC', 'WBE4500SC', 'WBE4500WC', 'WBE5304BC', 'WBE5304SC', 'WBE4504BC', 'WBE4504SC'] },
  { id: '51198', models: ['WRB5004SC', 'WRB5004WC', 'WFB4204SC', 'WFB4204WC', 'WRB3504SA', 'WRB3504WA', 'WFB2804SA', 'WFB2804WA', 'WRM2400WE', 'WFM1700WE'] },
  { id: '51196', models: ['WHE6170BB', 'WHE6170SB', 'WHE6270SB', 'WQE6870BA', 'WQE6870SA', 'WQE6000BB', 'WQE6000SB', 'WQE6060BB', 'WQE6060SB', 'WHE6000SB', 'WHE6060SB'] },
  { id: '57496', models: ['WQE5650BA'] }
];

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractLocsFromSitemap(xml) {
  return [...String(xml || '').matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => match[1].trim());
}

function isCoreProductUrl(url) {
  return /westinghouse\.com\.au\/(?:support|fridges-and-freezers\/fridges|dishwashing\/dishwashers|laundry\/(?:washing-machines|dryers))\//i.test(url);
}

function buildWestinghouseProductCandidates(sitemapXml) {
  return extractLocsFromSitemap(sitemapXml)
    .filter(isCoreProductUrl);
}

function collectLookupText(target = {}) {
  return [
    target.sku,
    target.model,
    target.product?.model,
    target.product?.sku,
    target.product?.title,
    target.product?.displayName,
    target.product?.slug
  ].filter(Boolean).join(' ');
}

function extractWestinghouseSkus(text) {
  return [...String(text || '').toUpperCase().matchAll(/\bW[A-Z]{1,4}\d[A-Z0-9]*\b/g)]
    .map((match) => normalizeSku(match[0]))
    .filter((sku) => sku.length >= 5);
}

function buildLookupCandidates(target = {}) {
  return [...new Set(extractWestinghouseSkus(collectLookupText(target)))];
}

function buildRawLookupValues(target = {}) {
  return [...new Set([
    target.sku,
    target.model,
    target.product?.model,
    target.product?.sku,
    ...buildLookupCandidates(target)
  ].filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function knownDimensionGuideForTarget(target = {}) {
  const candidates = buildRawLookupValues(target);
  for (const guide of KNOWN_DIMENSION_GUIDES) {
    const guideModels = guide.models.map(normalizeSku);
    if (candidates.some((candidate) => (
      guideModels.includes(normalizeSku(candidate))
      || guide.models.some((model) => westinghouseModelMatchesSku(model, candidate))
    ))) {
      return {
        sourceUrl: `${RESOURCE_BASE}${guide.id}`,
        source: 'westinghouse-official-known-dimension_sheet',
        resourceType: 'dimension_sheet',
        productUrl: null,
        label: `Known Westinghouse dimension guide ${guide.id}`
      };
    }
  }
  return null;
}

function productSlugFromUrl(url) {
  const pathname = new URL(url).pathname;
  const parts = pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function stripVariantSuffix(slug) {
  return normalizeSku(slug.replace(/-(?:l|r|x)$/i, ''));
}

function approvedProductPageModels(value) {
  const model = normalizeSku(value);
  if (!model) return [];
  if (/^WBE4504(?:BB|SB)[LR]$/.test(model)) return [model, model.slice(0, -1)];
  return [model];
}

function explicitProductVariantValues(target = {}) {
  return buildRawLookupValues(target)
    .filter((value) => /-(?:l|r|x)$/i.test(value));
}

function explicitProductVariantModels(target = {}) {
  return explicitProductVariantValues(target).map(normalizeSku);
}

function approvedTargetPageModels(target = {}) {
  return [...new Set([
    ...buildLookupCandidates(target).flatMap(approvedProductPageModels),
    ...explicitProductVariantModels(target),
  ])];
}

function westinghouseProductUrlMatchesTarget(url, target = {}) {
  const slug = productSlugFromUrl(url);
  const exactVariants = explicitProductVariantModels(target);
  if (exactVariants.length) return exactVariants.includes(normalizeSku(slug));
  const productSku = stripVariantSuffix(slug);
  if (!productSku || productSku.length < 5) return false;
  return approvedTargetPageModels(target).includes(productSku);
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function absoluteUrl(href, baseUrl) {
  return new URL(decodeHtml(href), baseUrl).toString();
}

function pageIdentifiesTarget(html, target = {}) {
  const identityText = [];
  for (const match of String(html || '').matchAll(/<(?:title|h1)\b[^>]*>([\s\S]*?)<\/(?:title|h1)>/gi)) {
    identityText.push(decodeHtml(match[1]).replace(/<[^>]+>/g, ' '));
  }
  const pageModels = identityText
    .flatMap((text) => [...text.toUpperCase().matchAll(/\bW[A-Z]{1,4}\d[A-Z0-9-]*\b/g)])
    .map((match) => normalizeSku(match[0]));
  const expected = approvedTargetPageModels(target);
  return pageModels.some((model) => expected.includes(model));
}

function catalogStateForUrl(value) {
  return /\/support\//i.test(new URL(value).pathname) ? 'archived' : 'current';
}

function classifyDownloadType(label, href) {
  const haystack = `${label || ''} ${href || ''}`;
  if (/dimension/i.test(haystack)) return { type: 'dimension_sheet', score: 100 };
  if (/install/i.test(haystack)) return { type: 'installation_manual', score: 80 };
  if (/fact/i.test(haystack)) return { type: 'fact_sheet', score: 60 };
  if (/manual|user/i.test(haystack)) return { type: 'user_manual', score: 50 };
  return { type: 'pdf', score: 10 };
}

function extractWestinghouseDownloadLinks(html, pageUrl) {
  const links = [];
  const source = String(html || '');
  const anchorPattern = /<a\b([^>]*?)>([\s\S]*?)<\/a>/gi;
  for (const match of source.matchAll(anchorPattern)) {
    const attrs = match[1] || '';
    const body = match[2] || '';
    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const label = decodeHtml(
      attrs.match(/\bdata-ga4-download-type=["']([^"']+)["']/i)?.[1]
      || body.replace(/<[^>]+>/g, ' ')
    );
    if (!/documenthandler|RequestPdf|\.pdf(?:$|[?#])/i.test(href)) continue;
    const classified = classifyDownloadType(label, href);
    links.push({
      url: absoluteUrl(href, pageUrl),
      label: label.trim(),
      ...classified
    });
  }

  return links.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
}

async function fetchText(url, fetchImpl, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    if (!response.ok) {
      throw new Error(`Westinghouse official finder failed HTTP ${response.status} for ${url}`);
    }
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function persistDiscoverySource({
  text,
  sourceUrl,
  requestedModel,
  contentType,
  extension,
  method,
  writeObject,
}) {
  if (typeof writeObject !== 'function') return null;
  const bytes = Buffer.from(text, 'utf8');
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');
  const objectPath = `evidence/web/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}.${extension}`;
  await writeObject(objectPath, bytes);
  return {
    schemaVersion: 1,
    method,
    market: 'AU',
    discoveryUrl: sourceUrl,
    requestedModel,
    contentType,
    contentSha256,
    objectPath,
    byteSize: bytes.length,
  };
}

function candidateDiscoveryProvenance(pageProvenance, {
  productUrl,
  requestedModel,
  artifactUrl,
}) {
  if (!pageProvenance) return null;
  return {
    schemaVersion: 1,
    method: 'official_product_page',
    market: 'AU',
    discoveryUrl: productUrl,
    requestedModel,
    matchedModel: requestedModel,
    artifactUrl,
    artifactLinkUrl: artifactUrl,
    discoveryContentSha256: pageProvenance.contentSha256,
    discoveryObjectPath: pageProvenance.objectPath,
    discoveryByteSize: pageProvenance.byteSize,
  };
}

function sourceLane(laneId, required, supported, status, provenance, candidateCount, reason = null) {
  return { laneId, required, supported, status, candidateCount, provenance, reason };
}

function westinghouseSourceLanes({ sitemapProvenance, sitemapError, resources, pageErrors }) {
  const sitemapComplete = !sitemapError;
  const detailComplete = sitemapComplete && pageErrors.length === 0;
  const productResources = resources.filter((resource) => resource.sourceLaneId === 'official_product_detail');
  const documentResources = resources.filter((resource) => resource.sourceLaneId === 'official_document_cdn');
  const currentCount = productResources.filter((resource) => resource.catalogState === 'current').length;
  const archiveCount = productResources.filter((resource) => resource.catalogState === 'archived').length;
  const inventoryProvenance = sitemapProvenance ? [sitemapProvenance] : [];
  const detailProvenance = productResources
    .map((resource) => resource.discoveryProvenance)
    .filter(Boolean)
    .map((provenance) => ({
      schemaVersion: 1,
      method: 'official_product_page',
      market: 'AU',
      discoveryUrl: provenance.discoveryUrl,
      requestedModel: provenance.requestedModel,
      contentType: 'text/html',
      contentSha256: provenance.discoveryContentSha256,
      objectPath: provenance.discoveryObjectPath,
      byteSize: provenance.discoveryByteSize,
    }));
  const dependentProvenance = detailProvenance.length ? detailProvenance : inventoryProvenance;
  const sitemapReason = sitemapComplete ? null : sitemapError;
  const detailReason = detailComplete ? null : pageErrors[0] || sitemapReason;
  return [
    sourceLane('current_product', true, true, sitemapComplete ? 'complete' : 'retryable', inventoryProvenance, currentCount, sitemapReason),
    sourceLane('discontinued_archive', true, true, sitemapComplete ? 'complete' : 'retryable', inventoryProvenance, archiveCount, sitemapReason),
    sourceLane('support_search_api', false, false, 'unsupported', [], 0, 'No supported Westinghouse AU product search API.'),
    sourceLane('official_document_cdn', true, true, detailComplete ? 'complete' : 'retryable', dependentProvenance, documentResources.length, detailReason),
    sourceLane('official_product_detail', true, true, detailComplete ? 'complete' : 'retryable', dependentProvenance, productResources.length, detailReason),
  ];
}

async function findWestinghouseOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch,
  knownOnly = false,
  sitemapUrl = SITEMAP_URL,
  timeoutMs = 30_000,
  writeObject = null,
} = {}) {
  if (!fetchImpl) throw new Error('Westinghouse official finder requires fetch');
  if (buildLookupCandidates(target).length === 0) {
    throw new Error('Westinghouse official finder requires a SKU');
  }

  const knownGuide = knownDimensionGuideForTarget(target);
  if (knownOnly && knownGuide) return knownGuide;
  if (knownOnly) {
    throw new Error(`Westinghouse known dimension guide not found for ${target.sku || target.model}`);
  }

  const requestedModel = explicitProductVariantValues(target)[0]
    || buildLookupCandidates(target)[0];
  let sitemapXml = '';
  let sitemapProvenance = null;
  let sitemapError = null;
  try {
    sitemapXml = await fetchText(sitemapUrl, fetchImpl, timeoutMs);
    sitemapProvenance = await persistDiscoverySource({
      text: sitemapXml,
      sourceUrl: sitemapUrl,
      requestedModel,
      contentType: 'application/xml',
      extension: 'xml',
      method: 'official_sitemap',
      writeObject,
    });
  } catch (error) {
    sitemapError = `Sitemap discovery failed: ${error.message}`;
  }
  const productUrls = buildWestinghouseProductCandidates(sitemapXml)
    .filter((url) => westinghouseProductUrlMatchesTarget(url, target));
  if (productUrls.length === 0) {
    if (knownGuide) return knownGuide;
    return {
      sourceUrl: null,
      source: 'westinghouse-official-no-candidate',
      resourceType: 'product_page',
      productUrl: null,
      resources: [],
      sourceLanes: westinghouseSourceLanes({
        sitemapProvenance,
        sitemapError,
        resources: [],
        pageErrors: [],
      }),
      reason: sitemapError || `Westinghouse product page not found for ${target.sku || target.model}`,
    };
  }

  const resources = [];
  const pageErrors = [];
  const identityMismatches = [];
  for (const productUrl of productUrls) {
    try {
      const html = await fetchText(productUrl, fetchImpl, timeoutMs);
      const pageProvenance = await persistDiscoverySource({
        text: html,
        sourceUrl: productUrl,
        requestedModel,
        contentType: 'text/html',
        extension: 'html',
        method: 'official_product_page',
        writeObject,
      });
      if (!pageIdentifiesTarget(html, target)) {
        identityMismatches.push(`${productUrl}: product page does not identify exact model ${requestedModel}`);
        continue;
      }
      const catalogState = catalogStateForUrl(productUrl);
      const productDiscovery = candidateDiscoveryProvenance(pageProvenance, {
        productUrl,
        requestedModel,
        artifactUrl: productUrl,
      });
      resources.push({
        sourceUrl: productUrl,
        url: productUrl,
        resourceType: 'product_page',
        sourceLaneId: 'official_product_detail',
        sourceModelHint: requestedModel,
        catalogState,
        requiredAttempt: false,
        ...(productDiscovery ? { discoveryProvenance: productDiscovery } : {}),
      });
      const links = extractWestinghouseDownloadLinks(html, productUrl);
      for (const link of links) {
        const discoveryProvenance = candidateDiscoveryProvenance(pageProvenance, {
          productUrl,
          requestedModel,
          artifactUrl: link.url,
        });
        resources.push({
          ...link,
          sourceUrl: link.url,
          resourceType: link.type,
          sourceLaneId: 'official_document_cdn',
          sourceModelHint: requestedModel,
          catalogState,
          requiredAttempt: true,
          ...(discoveryProvenance ? { discoveryProvenance } : {}),
        });
      }
    } catch (error) {
      pageErrors.push(`${productUrl}: ${error.message}`);
    }
  }

  const documents = resources.filter((resource) => resource.sourceLaneId === 'official_document_cdn');
  const exactProductPages = resources.filter((resource) => resource.sourceLaneId === 'official_product_detail');
  if (exactProductPages.length === 0) pageErrors.push(...identityMismatches);
  const best = documents.find((resource) => resource.resourceType === 'dimension_sheet')
    || documents.find((resource) => resource.resourceType === 'installation_manual')
    || documents[0]
    || null;
  if (!best && knownGuide) return knownGuide;

  return {
    sourceUrl: best?.sourceUrl ?? null,
    source: best ? `westinghouse-official-${best.resourceType}` : 'westinghouse-official-no-candidate',
    resourceType: best?.resourceType ?? 'product_page',
    productUrl: resources.find((resource) => resource.sourceLaneId === 'official_product_detail')?.sourceUrl ?? null,
    label: best?.label ?? null,
    resources,
    sourceLanes: westinghouseSourceLanes({
      sitemapProvenance,
      sitemapError,
      resources,
      pageErrors,
    }),
    ...(best?.discoveryProvenance ? { discoveryProvenance: best.discoveryProvenance } : {}),
    ...(!best || pageErrors.length ? {
      reason: pageErrors.join(' | ') || `Westinghouse PDF not found for ${target.sku || target.model}`,
    } : {}),
  };
}

exports.buildLookupCandidates = buildLookupCandidates;
exports.buildWestinghouseProductCandidates = buildWestinghouseProductCandidates;
exports.extractWestinghouseDownloadLinks = extractWestinghouseDownloadLinks;
exports.extractWestinghouseSkus = extractWestinghouseSkus;
exports.findWestinghouseOfficialPdf = findWestinghouseOfficialPdf;
exports.knownDimensionGuideForTarget = knownDimensionGuideForTarget;
exports.normalizeSku = normalizeSku;
exports.westinghouseProductUrlMatchesTarget = westinghouseProductUrlMatchesTarget;
