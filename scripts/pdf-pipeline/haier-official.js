const { createHash } = require('node:crypto');
const { resolveSalesforceDistributionPdf } = require('./fisher-paykel-official.js');

const HAIER_SITEMAP_INDEX = 'https://www.haier.com.au/sitemap_index.xml';
const HAIER_SUPPORT_HOST = 'support.haier.com.au';
const HAIER_SUPPORT_BASE = `https://${HAIER_SUPPORT_HOST}/s/help-and-support`;
const HAIER_SALESFORCE_HOST = 'fisherpaykel.my.salesforce.com';
const renderedHtmlCache = new Map();
let dynamicRenderTail = Promise.resolve();

const HAIER_SOURCE_LANES = Object.freeze([
  Object.freeze({ laneId: 'current_product', required: false, supported: true }),
  Object.freeze({ laneId: 'discontinued_archive', required: false, supported: true }),
  Object.freeze({ laneId: 'support_search_api', required: false, supported: false }),
  Object.freeze({ laneId: 'official_document_cdn', required: true, supported: true }),
  Object.freeze({ laneId: 'official_product_detail', required: true, supported: true }),
]);

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\bSERIES\b/g, '')
    .replace(/[^A-Z0-9]+/g, '');
}

async function persistLanePayload({
  bytes,
  contentType,
  extension,
  discoveryUrl,
  requestedModel,
  method,
  writeObject,
}) {
  if (typeof writeObject !== 'function') return null;
  const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes || ''));
  if (!payload.length) return null;
  const contentSha256 = createHash('sha256').update(payload).digest('hex');
  const objectPath = `evidence/web/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}.${extension}`;
  await writeObject(objectPath, payload);
  return {
    schemaVersion: 1,
    method,
    market: 'AU',
    discoveryUrl,
    requestedModel: normalizeSku(requestedModel),
    contentType,
    contentSha256,
    objectPath,
    byteSize: payload.length,
  };
}

function sourceLane(laneId, status, provenance = [], candidateCount = 0, reason = null) {
  const descriptor = HAIER_SOURCE_LANES.find((lane) => lane.laneId === laneId);
  if (!descriptor) throw new Error(`Unknown Haier source lane: ${laneId}`);
  return { ...descriptor, status, candidateCount, provenance, reason };
}

function unavailableLane(laneId, reason) {
  const descriptor = HAIER_SOURCE_LANES.find((lane) => lane.laneId === laneId);
  return descriptor.supported
    ? sourceLane(laneId, 'retryable', [], 0, reason)
    : sourceLane(laneId, 'unsupported', [], 0, reason);
}

function sourceLaneProvenance(discoveryProvenance) {
  if (!discoveryProvenance?.discoveryContentSha256) return null;
  return {
    schemaVersion: 1,
    method: discoveryProvenance.method,
    market: discoveryProvenance.market,
    discoveryUrl: discoveryProvenance.discoveryUrl,
    requestedModel: discoveryProvenance.requestedModel,
    contentType: 'text/html',
    contentSha256: discoveryProvenance.discoveryContentSha256,
    objectPath: discoveryProvenance.discoveryObjectPath,
    byteSize: discoveryProvenance.discoveryByteSize,
  };
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function hasExactHaierModelMention(value, targetModel) {
  const model = normalizeSku(targetModel);
  if (model.length < 4) return false;
  const pattern = [...model]
    .map((character) => character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^A-Z0-9]*');
  return new RegExp(`(^|[^A-Z0-9])${pattern}(?![A-Z0-9])`, 'i').test(decodeHtml(value));
}

function extractXmlLocs(xml) {
  return [...String(xml || '').matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => decodeHtml(match[1]).trim())
    .filter(Boolean);
}

function isCoreProductUrl(url) {
  return /haier\.com\.au\/(?:refrigeration|dishwashing|laundry)\//i.test(String(url || ''));
}

function haierProductUrlMatchesTarget(url, target = {}) {
  const sku = normalizeSku(target.sku || target.model || target.product?.model);
  if (!sku || sku.length < 4) return false;
  const normalizedUrl = normalizeSku(url);
  return normalizedUrl.includes(sku);
}

function scoreHaierPdf(url) {
  const text = String(url || '');
  if (/SpecificationGuide/i.test(text)) return 100;
  if (/QRG/i.test(text)) return 50;
  if (/UserInstall|Installation/i.test(text)) return 40;
  if (/UserGuide|Manual/i.test(text)) return 20;
  if (/Energy|Water/i.test(text)) return -20;
  return 0;
}

function resourceTypeForHaierPdf(url) {
  const text = String(url || '');
  if (/SpecificationGuide/i.test(text)) return 'specification_guide';
  if (/QRG/i.test(text)) return 'quick_reference_guide';
  if (/UserInstall|Installation/i.test(text)) return 'installation_manual';
  if (/UserGuide|Manual/i.test(text)) return 'user_manual';
  if (/Energy|Water/i.test(text)) return 'energy_label';
  return 'pdf';
}

function extractHaierDownloadLinks(html, baseUrl = 'https://www.haier.com.au/') {
  const links = [...String(html || '').matchAll(/href=["']([^"']+?\.pdf(?:\?[^"']*)?)["']/gi)]
    .map((match) => {
      const rawUrl = decodeHtml(match[1]);
      const url = new URL(rawUrl, baseUrl).href;
      return {
        url,
        sourceUrl: url,
        resourceType: resourceTypeForHaierPdf(url),
        source: `haier-official-${resourceTypeForHaierPdf(url)}`,
        score: scoreHaierPdf(url)
      };
    })
    .filter((link) => !/(?:Energy|Water)/i.test(link.url))
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));

  const seen = new Set();
  return links.filter((link) => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
}

function extractHrefValues(html) {
  return [...String(html || '').matchAll(/\bhref=["']([^"']+)["']/gi)]
    .map((match) => decodeHtml(match[1]).trim())
    .filter(Boolean);
}

function extractHaierSupportArticleUrls(html, baseUrl) {
  const seen = new Set();
  const urls = [];
  for (const value of extractHrefValues(html)) {
    let url;
    try { url = new URL(value, baseUrl); } catch { continue; }
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== HAIER_SUPPORT_HOST) continue;
    if (!/^\/s\/help-and-support\/article\//i.test(url.pathname)) continue;
    if (/spare[-_\s]*parts?|parts?[-_\s]*manual/i.test(url.pathname)) continue;
    url.hash = '';
    const canonical = url.toString();
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    urls.push(canonical);
  }
  return urls;
}

function extractHaierSupportAttachments(html, baseUrl) {
  const seen = new Set();
  const urls = [];
  for (const value of extractHrefValues(html)) {
    let url;
    try { url = new URL(value, baseUrl); } catch { continue; }
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== HAIER_SALESFORCE_HOST) continue;
    if (!/^\/sfc\/p\/[^/]+\/a\/[^/]+\/[^/]+\/?$/i.test(url.pathname)) continue;
    url.hash = '';
    const canonical = url.toString();
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    urls.push(canonical);
  }
  return urls;
}

function supportProductPaths(target = {}) {
  const category = String(target.category || target.cat || target.product?.cat || '').toLowerCase();
  if (category === 'dishwasher') return ['dishwashing'];
  if (category === 'fridge') {
    return [
      'refrigeration',
      'refrigeration-and-freezers/fridges/top-fridge',
    ];
  }
  if (category === 'dryer' || category === 'washing_machine') return ['laundry'];
  return [];
}

function supportResourceType(articleUrl, html) {
  const text = `${articleUrl} ${html}`;
  if (/install/i.test(text)) return 'installation_guide';
  if (/user|care|operat|instruction/i.test(text)) return 'user_manual';
  if (/spec|dimension|technical/i.test(text)) return 'specification_sheet';
  return 'family_manual';
}

function supportResourceScore(resourceType) {
  if (resourceType === 'installation_guide') return 100;
  if (resourceType === 'specification_sheet') return 80;
  if (resourceType === 'user_manual') return 50;
  return 20;
}

function buildHaierProductCandidates(sitemapXml) {
  return extractXmlLocs(sitemapXml).filter(isCoreProductUrl);
}

async function fetchText(url, fetchImpl) {
  return (await fetchHtmlDocument(url, fetchImpl)).html;
}

async function fetchHtmlDocument(url, fetchImpl, expectedHost = null) {
  const response = await fetchImpl(url, {
    headers: {
      'User-Agent': 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)'
    }
  });
  if (!response.ok) {
    throw new Error(`Haier request failed with HTTP ${response.status}: ${url}`);
  }
  const finalUrl = new URL(response.url || url);
  if (finalUrl.protocol !== 'https:' || finalUrl.username || finalUrl.password) {
    throw new Error(`Haier request escaped trusted HTTPS: ${url}`);
  }
  if (expectedHost && finalUrl.hostname.toLowerCase() !== expectedHost) {
    throw new Error(`Haier request escaped ${expectedHost}: ${url}`);
  }
  const html = await response.text();
  const bytes = Buffer.from(html, 'utf8');
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) {
    throw new Error(`Haier HTML size outside limits: ${url}`);
  }
  return { html, bytes, finalUrl: finalUrl.toString() };
}

async function defaultRenderedHtmlImpl(url, options = {}) {
  const task = dynamicRenderTail.then(async () => {
    const { fetchViaScraplingDynamic } = await import('../../src/domain/scrapling-transport.mjs');
    return fetchViaScraplingDynamic(url, options);
  });
  dynamicRenderTail = task.catch(() => {});
  return task;
}

function validateResolvedSalesforcePdf(artifactLinkUrl, resolved = {}) {
  const publicUrl = new URL(artifactLinkUrl);
  const artifactUrl = new URL(resolved.url);
  const parts = publicUrl.pathname.split('/').filter(Boolean);
  if (parts.length !== 6 || parts[0] !== 'sfc' || parts[1] !== 'p' || parts[3] !== 'a') {
    throw new Error('Haier support attachment identity is malformed');
  }
  if (resolved.sourceUrl && new URL(resolved.sourceUrl).toString() !== publicUrl.toString()) {
    throw new Error('Haier Salesforce resolver returned mismatched source identity');
  }
  if (artifactUrl.protocol !== 'https:' || artifactUrl.username || artifactUrl.password
    || artifactUrl.hostname.toLowerCase() !== HAIER_SALESFORCE_HOST
    || artifactUrl.pathname !== '/sfc/dist/version/download/') {
    throw new Error('Haier Salesforce resolver escaped the approved PDF endpoint');
  }
  const expectedOid = `00D${parts[2]}`;
  const expectedDistribution = `/a/${parts[4]}/${parts[5]}`;
  if (artifactUrl.searchParams.get('oid') !== expectedOid
    || artifactUrl.searchParams.get('d') !== expectedDistribution
    || !/^068[A-Za-z0-9]+$/.test(artifactUrl.searchParams.get('ids') || '')
    || !/^05H[A-Za-z0-9]+$/.test(artifactUrl.searchParams.get('viewId') || '')
    || artifactUrl.searchParams.get('operationContext') !== 'DELIVERY') {
    throw new Error('Haier Salesforce resolver returned mismatched PDF identity');
  }
  artifactUrl.hash = '';
  return artifactUrl.toString();
}

async function fetchRenderedHtmlDocument(url, renderedHtmlImpl, expectedHost, waitSelector) {
  const canonicalUrl = new URL(url).toString();
  if (!renderedHtmlCache.has(canonicalUrl)) {
    renderedHtmlCache.set(canonicalUrl, Promise.resolve(renderedHtmlImpl(canonicalUrl, {
      timeoutMs: 45000,
      waitMs: 250,
      networkIdle: false,
      waitSelector,
      maximumBytes: 8 * 1024 * 1024,
    })).then((result) => {
      const finalUrl = new URL(result?.finalUrl || canonicalUrl);
      if (finalUrl.protocol !== 'https:' || finalUrl.username || finalUrl.password
        || finalUrl.hostname.toLowerCase() !== expectedHost) {
        throw new Error(`Haier rendered request escaped ${expectedHost}: ${canonicalUrl}`);
      }
      const bytes = Buffer.from(result?.bytes ?? []);
      if (!bytes.length || bytes.length > 8 * 1024 * 1024) {
        throw new Error(`Haier rendered HTML size outside limits: ${canonicalUrl}`);
      }
      const contentType = String(result?.contentType || '').toLowerCase();
      if (contentType && !contentType.startsWith('text/html') && !contentType.startsWith('application/xhtml+xml')) {
        throw new Error(`Haier rendered request returned non-HTML content: ${canonicalUrl}`);
      }
      return { html: bytes.toString('utf8'), bytes, finalUrl: finalUrl.toString() };
    }).catch((error) => {
      renderedHtmlCache.delete(canonicalUrl);
      throw error;
    }));
  }
  return renderedHtmlCache.get(canonicalUrl);
}

async function loadHaierSitemapProductInventory(
  fetchImpl,
  sitemapIndexUrl,
  requestedModel,
  writeObject,
) {
  const sitemapHost = new URL(sitemapIndexUrl).hostname.toLowerCase();
  const index = await fetchHtmlDocument(sitemapIndexUrl, fetchImpl, sitemapHost);
  const provenance = [];
  const indexProvenance = await persistLanePayload({
    bytes: index.bytes,
    contentType: 'application/xml',
    extension: 'xml',
    discoveryUrl: index.finalUrl,
    requestedModel,
    method: 'official_sitemap_index',
    writeObject,
  });
  if (indexProvenance) provenance.push(indexProvenance);
  const sitemapUrls = extractXmlLocs(index.html);
  const productUrls = [];
  for (const sitemapUrl of sitemapUrls) {
    const sitemap = await fetchHtmlDocument(sitemapUrl, fetchImpl, sitemapHost);
    const sitemapProvenance = await persistLanePayload({
      bytes: sitemap.bytes,
      contentType: 'application/xml',
      extension: 'xml',
      discoveryUrl: sitemap.finalUrl,
      requestedModel,
      method: 'official_sitemap',
      writeObject,
    });
    if (sitemapProvenance) provenance.push(sitemapProvenance);
    productUrls.push(...buildHaierProductCandidates(sitemap.html));
  }
  return { productUrls: [...new Set(productUrls)].sort(), provenance };
}

async function loadHaierSitemapProductUrls(fetchImpl, sitemapIndexUrl = HAIER_SITEMAP_INDEX) {
  const inventory = await loadHaierSitemapProductInventory(
    fetchImpl,
    sitemapIndexUrl,
    'SITEMAP-INVENTORY',
    null,
  );
  return inventory.productUrls;
}

async function findHaierSupportPdf(target, {
  fetchImpl,
  renderedHtmlImpl,
  salesforceResolver,
  writeObject,
}) {
  const productPaths = supportProductPaths(target);
  const requestedModel = String(target.sku || target.model || target.product?.model || '').trim().toUpperCase();
  if (!productPaths.length || !requestedModel || /[*?]/.test(requestedModel)) return null;

  const productErrors = [];
  let productPage = null;
  let articleUrls = [];
  for (const productPath of productPaths) {
    const productUrl = `${HAIER_SUPPORT_BASE}/${productPath}/product?id=${encodeURIComponent(requestedModel)}`;
    try {
      let candidatePage = await fetchHtmlDocument(productUrl, fetchImpl, HAIER_SUPPORT_HOST);
      let candidateArticles = extractHaierSupportArticleUrls(candidatePage.html, candidatePage.finalUrl);
      if (!hasExactHaierModelMention(candidatePage.html, requestedModel) || !candidateArticles.length) {
        candidatePage = await fetchRenderedHtmlDocument(
          productUrl,
          renderedHtmlImpl,
          HAIER_SUPPORT_HOST,
          'a[href*="/s/help-and-support/article/"]',
        );
        candidateArticles = extractHaierSupportArticleUrls(candidatePage.html, candidatePage.finalUrl);
      }
      if (!hasExactHaierModelMention(candidatePage.html, requestedModel)) {
        throw new Error(`Haier support product page does not prove exact model ${requestedModel}`);
      }
      if (!candidateArticles.length) {
        throw new Error(`Haier support product page has no document articles for ${requestedModel}`);
      }
      productPage = candidatePage;
      articleUrls = candidateArticles;
      break;
    } catch (error) {
      productErrors.push(`${productUrl}: ${error.message}`);
    }
  }
  if (!productPage) {
    throw new Error(`Haier support product page not found for ${requestedModel}${productErrors.length ? `: ${productErrors[0]}` : ''}`);
  }
  const productPageProvenance = await persistLanePayload({
    bytes: productPage.bytes,
    contentType: 'text/html',
    extension: 'html',
    discoveryUrl: productPage.finalUrl,
    requestedModel,
    method: 'official_support_product_page',
    writeObject,
  });
  const resources = [];
  const errors = [];

  for (const articleUrl of articleUrls.slice(0, 12)) {
    try {
      let article = await fetchHtmlDocument(articleUrl, fetchImpl, HAIER_SUPPORT_HOST);
      let attachments = extractHaierSupportAttachments(article.html, article.finalUrl);
      if (!hasExactHaierModelMention(article.html, requestedModel) || !attachments.length) {
        article = await fetchRenderedHtmlDocument(
          articleUrl,
          renderedHtmlImpl,
          HAIER_SUPPORT_HOST,
          'a[href*="/sfc/p/"]',
        );
        attachments = extractHaierSupportAttachments(article.html, article.finalUrl);
      }
      if (!hasExactHaierModelMention(article.html, requestedModel)) continue;
      if (!attachments.length) continue;
      if (typeof writeObject !== 'function') {
        throw new TypeError('Haier content-addressed discovery writer required');
      }
      const discoveryContentSha256 = createHash('sha256').update(article.bytes).digest('hex');
      const discoveryObjectPath = `evidence/web/sha256/${discoveryContentSha256.slice(0, 2)}/${discoveryContentSha256.slice(2, 4)}/${discoveryContentSha256}.html`;
      await writeObject(discoveryObjectPath, article.bytes);
      const resourceType = supportResourceType(article.finalUrl, article.html);
      for (const artifactLinkUrl of attachments) {
        const resolved = await salesforceResolver(artifactLinkUrl, { fetchImpl });
        const artifactUrl = validateResolvedSalesforcePdf(artifactLinkUrl, resolved);
        resources.push({
          url: artifactUrl,
          sourceUrl: artifactUrl,
          source: `haier-official-${resourceType}`,
          resourceType,
          sourceModelHint: requestedModel,
          score: supportResourceScore(resourceType),
          requiredAttempt: true,
          sourceLaneId: 'official_document_cdn',
          discoveryProvenance: {
            schemaVersion: 1,
            method: 'official_product_page',
            market: 'AU',
            discoveryUrl: article.finalUrl,
            requestedModel,
            matchedModel: requestedModel,
            artifactUrl,
            artifactLinkUrl,
            discoveryContentSha256,
            discoveryObjectPath,
            discoveryByteSize: article.bytes.length,
          },
        });
      }
    } catch (error) {
      errors.push(`${articleUrl}: ${error.message}`);
    }
  }

  const unique = [];
  const seen = new Set();
  for (const resource of resources.sort((left, right) => right.score - left.score || left.url.localeCompare(right.url))) {
    if (seen.has(resource.url)) continue;
    seen.add(resource.url);
    unique.push(resource);
  }
  if (!unique.length) {
    throw new Error(`Haier official PDF resources not found for ${requestedModel}${errors.length ? `: ${errors[0]}` : ''}`);
  }
  const articleProvenance = [...new Map(unique
    .map((resource) => sourceLaneProvenance(resource.discoveryProvenance))
    .filter(Boolean)
    .map((provenance) => [provenance.objectPath, provenance])).values()];
  const productPageResource = {
    url: productPage.finalUrl,
    sourceUrl: productPage.finalUrl,
    source: 'haier-official-product-page',
    resourceType: 'product_page',
    documentType: 'product_page',
    sourceModelHint: requestedModel,
    score: 0,
    requiredAttempt: false,
    sourceLaneId: 'official_product_detail',
  };
  const sourceLanes = [
    unavailableLane('current_product', 'Current-product sitemap was not inspected after the archived support path resolved.'),
    sourceLane('discontinued_archive', 'complete', [productPageProvenance], 0, null),
    unavailableLane('support_search_api', 'Haier Australia exposes support product pages rather than a public search API.'),
    sourceLane('official_document_cdn', 'complete', articleProvenance, unique.length, null),
    sourceLane('official_product_detail', 'complete', [productPageProvenance, ...articleProvenance], 1, null),
  ];
  return {
    ...unique[0],
    productUrl: productPage.finalUrl,
    resources: [...unique, productPageResource],
    sourceLanes,
    discoveryProvenance: unique[0].discoveryProvenance,
  };
}

async function findHaierOfficialPdf(target = {}, {
  fetchImpl = globalThis.fetch,
  renderedHtmlImpl = defaultRenderedHtmlImpl,
  salesforceResolver = resolveSalesforceDistributionPdf,
  sitemapIndexUrl = HAIER_SITEMAP_INDEX,
  writeObject = null,
} = {}) {
  if (!fetchImpl) throw new Error('Haier official finder requires fetch');
  const errors = [];
  try {
    const support = await findHaierSupportPdf(target, {
      fetchImpl,
      renderedHtmlImpl,
      salesforceResolver,
      writeObject,
    });
    if (support) return support;
  } catch (error) {
    errors.push(error.message);
  }

  try {
    const requestedModel = normalizeSku(target.sku || target.model || target.product?.model);
    const inventory = await loadHaierSitemapProductInventory(
      fetchImpl,
      sitemapIndexUrl,
      requestedModel,
      writeObject,
    );
    const productUrl = inventory.productUrls.find((url) => haierProductUrlMatchesTarget(url, target));
    if (!productUrl) throw new Error(`Haier product page not found for ${target.sku || target.model}`);
    const productPage = await fetchHtmlDocument(
      productUrl,
      fetchImpl,
      new URL(productUrl).hostname.toLowerCase(),
    );
    const productPageProvenance = await persistLanePayload({
      bytes: productPage.bytes,
      contentType: 'text/html',
      extension: 'html',
      discoveryUrl: productPage.finalUrl,
      requestedModel,
      method: 'official_product_page',
      writeObject,
    });
    const discoveryFields = productPageProvenance ? {
      discoveryContentSha256: productPageProvenance.contentSha256,
      discoveryObjectPath: productPageProvenance.objectPath,
      discoveryByteSize: productPageProvenance.byteSize,
    } : null;
    const links = extractHaierDownloadLinks(productPage.html, productPage.finalUrl)
      .filter((link) => link.score > 0)
      .map((link) => ({
        ...link,
        sourceLaneId: 'official_document_cdn',
        sourceModelHint: requestedModel,
        requiredAttempt: true,
        ...(discoveryFields ? {
          discoveryProvenance: {
            schemaVersion: 1,
            method: 'official_product_page',
            market: 'AU',
            discoveryUrl: productPage.finalUrl,
            requestedModel,
            matchedModel: requestedModel,
            artifactUrl: link.url,
            artifactLinkUrl: link.url,
            ...discoveryFields,
          },
        } : {}),
      }));
    const primary = links[0];
    if (!primary) throw new Error(`Haier official PDF resources not found for ${target.sku || target.model}`);
    const currentComplete = inventory.provenance.length > 0;
    const detailComplete = Boolean(productPageProvenance);
    const productPageResource = {
      url: productPage.finalUrl,
      sourceUrl: productPage.finalUrl,
      source: 'haier-official-product-page',
      resourceType: 'product_page',
      documentType: 'product_page',
      sourceModelHint: requestedModel,
      score: 0,
      requiredAttempt: false,
      sourceLaneId: 'official_product_detail',
    };
    return {
      ...primary,
      productUrl: productPage.finalUrl,
      resources: [...links, productPageResource],
      sourceLanes: [
        currentComplete
          ? sourceLane('current_product', 'complete', inventory.provenance, 0, null)
          : unavailableLane('current_product', 'Current-product sitemap provenance was not persisted.'),
        unavailableLane('discontinued_archive', 'Archived support was not inspected after the current product resolved.'),
        unavailableLane('support_search_api', 'Haier Australia exposes support product pages rather than a public search API.'),
        detailComplete
          ? sourceLane('official_document_cdn', 'complete', [productPageProvenance], links.length, null)
          : unavailableLane('official_document_cdn', 'Current product-page provenance was not persisted.'),
        detailComplete
          ? sourceLane('official_product_detail', 'complete', [productPageProvenance], 1, null)
          : unavailableLane('official_product_detail', 'Current product-page provenance was not persisted.'),
      ],
    };
  } catch (error) {
    errors.push(error.message);
  }
  throw new Error(`Haier official PDF resources not found for ${target.sku || target.model}: ${errors.join(' | ')}`);
}

exports.HAIER_SITEMAP_INDEX = HAIER_SITEMAP_INDEX;
exports.buildHaierProductCandidates = buildHaierProductCandidates;
exports.extractHaierDownloadLinks = extractHaierDownloadLinks;
exports.extractHaierSupportArticleUrls = extractHaierSupportArticleUrls;
exports.extractXmlLocs = extractXmlLocs;
exports.findHaierOfficialPdf = findHaierOfficialPdf;
exports.haierProductUrlMatchesTarget = haierProductUrlMatchesTarget;
exports.hasExactHaierModelMention = hasExactHaierModelMention;
exports.loadHaierSitemapProductUrls = loadHaierSitemapProductUrls;
exports.normalizeSku = normalizeSku;
exports.resourceTypeForHaierPdf = resourceTypeForHaierPdf;
