import { load } from 'cheerio';

import { validateEvidenceSourceResolverResult } from './evidence-source-adapter-contract.mjs';
import { classifyDocumentType } from './official-document-candidate.mjs';
import { isOfficialBrandMarketUrl, isOfficialBrandUrl } from './evidence-source-verifier.mjs';
import { discoverOfficialDocumentCandidates } from './official-document-discovery.mjs';

const CORE_RESOLVER = Object.freeze({
  resolverId: 'architecture-v2-core-official-discovery',
  version: '1',
  scope: 'explicit_urls_product_pages_templates_and_bounded_sitemaps',
  required: true,
});

function modelKey(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function urlHasExactModel(value, model) {
  try {
    const url = new URL(value);
    const target = modelKey(model);
    const pathMatch = url.pathname.split('/').filter(Boolean).some((segment) => {
      const decoded = decodeURIComponent(segment);
      const withoutDocumentExtension = decoded.replace(/\.(?:pdf|html?)$/i, '');
      return modelKey(decoded) === target || modelKey(withoutDocumentExtension) === target;
    });
    const queryMatch = [...url.searchParams.values()].some((queryValue) => modelKey(queryValue) === target);
    return pathMatch || queryMatch;
  } catch {
    return false;
  }
}

export function extractSitemapLocations(xml) {
  const $ = load(String(xml ?? ''), { xmlMode: true });
  return [...new Set($('loc').map((_, element) => $(element).text().trim()).get()
    .filter((value) => {
      try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
    }))].sort();
}

export async function discoverCandidateUrls(caseRecord, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maximum = options.maximumSitemapDocuments ?? 12;
  const candidates = new Set();
  const addCandidate = (value, exactModelInUrl = true) => {
    if (isOfficialBrandUrl(value, caseRecord.brand) && (!exactModelInUrl || urlHasExactModel(value, caseRecord.model))) {
      candidates.add(new URL(value).toString());
    }
  };
  for (const source of caseRecord.sources ?? []) addCandidate(source.finalUrl ?? source.sourceUrl, false);
  for (const value of caseRecord.candidateUrls ?? []) addCandidate(value, false);

  const queue = [...new Set(options.sitemapUrls ?? [])];
  const visited = new Set();
  while (queue.length) {
    if (visited.size >= maximum) throw new Error('sitemap document budget exhausted');
    const sitemapUrl = queue.shift();
    if (visited.has(sitemapUrl) || !isOfficialBrandUrl(sitemapUrl, caseRecord.brand)) continue;
    visited.add(sitemapUrl);
    const response = await fetchImpl(sitemapUrl, { redirect: 'error' });
    if (!response.ok) continue;
    for (const location of extractSitemapLocations(await response.text())) {
      if (!isOfficialBrandUrl(location, caseRecord.brand)) continue;
      if (/\.xml(?:$|[?#])/i.test(location)) queue.push(location);
      else addCandidate(location);
    }
  }
  return [...candidates].sort();
}

export async function discoverRankedCandidateUrls(caseRecord, options = {}) {
  const result = await discoverRankedEvidenceCandidates(caseRecord, options);
  if (result.completion === 'truncated'
      && result.failures.some((failure) => failure.code === 'sitemap_budget_exhausted')) {
    throw new Error('sitemap document budget exhausted');
  }
  return result.candidates
    .filter((candidate) => candidate.authorityMode === 'official')
    .map((candidate) => candidate.sourceUrl);
}

function documentTypeForUrl(value) {
  const url = new URL(value);
  if (!/\.pdf(?:$|[?#])/i.test(`${url.pathname}${url.search}`)) return 'product_page';
  return classifyDocumentType(value);
}

function resolverCandidate(caseRecord, value, overrides = {}) {
  const sourceUrl = new URL(value).toString();
  const authorityMode = overrides.authorityMode
    ?? (isOfficialBrandUrl(sourceUrl, caseRecord.brand) ? 'official' : 'reference');
  const documentType = overrides.documentType ?? documentTypeForUrl(sourceUrl);
  return {
    sourceUrl,
    resolverId: CORE_RESOLVER.resolverId,
    resolverVersion: CORE_RESOLVER.version,
    discoveryMethod: overrides.discoveryMethod ?? 'legacy_candidate',
    documentType,
    sourceModelHint: caseRecord.model ? String(caseRecord.model).trim() : null,
    authorityMode,
    sourceRole: documentType === 'product_page'
      ? (authorityMode === 'official' ? 'manufacturer_product_page' : 'retailer_product_page')
      : (authorityMode === 'official' ? 'manufacturer_document' : 'retailer_reference'),
    requiredAttempt: authorityMode === 'official' && documentType !== 'product_page',
    batchJobId: null,
  };
}

function failureRecord(code, sourceUrl, error) {
  return {
    code,
    ...(sourceUrl ? { sourceUrl: new URL(sourceUrl).toString() } : {}),
    ...(error ? { message: String(error?.message ?? error) } : {}),
  };
}

export async function discoverRankedEvidenceCandidates(caseRecord, options = {}) {
  const explicitUrls = [
    ...(caseRecord.sources ?? []).map((source) => source.finalUrl ?? source.sourceUrl),
    ...(caseRecord.candidateUrls ?? []),
  ].filter(Boolean);
  const productPageUrls = caseRecord.productPageUrls ?? caseRecord.officialProductPageUrls ?? [];
  const failures = [];
  const fetchImpl = options.fetchImpl ?? fetch;
  const productPages = new Set(productPageUrls.map((value) => new URL(value).toString()));
  const trackedProductPageFetch = async (value, init) => {
    const sourceUrl = new URL(value).toString();
    try {
      const response = await fetchImpl(value, init);
      if (productPages.has(sourceUrl) && !response.ok) {
        failures.push(failureRecord('product_page_http_error', sourceUrl, `HTTP ${response.status}`));
      }
      return response;
    } catch (error) {
      if (productPages.has(sourceUrl)) {
        failures.push(failureRecord('product_page_fetch_failed', sourceUrl, error));
      }
      throw error;
    }
  };

  let ranked = [];
  try {
    ranked = await discoverOfficialDocumentCandidates({
      brand: caseRecord.brand,
      model: caseRecord.model,
      category: caseRecord.category,
      explicitUrls,
      productPageUrls,
    }, { ...options, fetchImpl: trackedProductPageFetch });
  } catch (error) {
    failures.push(failureRecord('official_discovery_failed', null, error));
  }

  let legacy = [];
  let truncated = false;
  const trackedSitemapFetch = async (value, init) => {
    const sourceUrl = new URL(value).toString();
    try {
      const response = await fetchImpl(value, init);
      if (!response.ok) failures.push(failureRecord('sitemap_http_error', sourceUrl, `HTTP ${response.status}`));
      return response;
    } catch (error) {
      failures.push(failureRecord('sitemap_fetch_failed', sourceUrl, error));
      throw error;
    }
  };
  try {
    legacy = await discoverCandidateUrls(caseRecord, { ...options, fetchImpl: trackedSitemapFetch });
  } catch (error) {
    if (/budget exhausted/i.test(String(error?.message ?? error))) {
      truncated = true;
      failures.push(failureRecord('sitemap_budget_exhausted', null, error));
    } else {
      failures.push(failureRecord('legacy_discovery_failed', null, error));
    }
  }

  const candidates = [];
  const seen = new Set();
  const add = (candidate) => {
    const key = `${candidate.authorityMode}\0${new URL(candidate.sourceUrl).toString()}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };
  for (const row of ranked) {
    add(resolverCandidate(caseRecord, row.url, {
      authorityMode: 'official',
      discoveryMethod: row.discoveryMethod,
      documentType: row.documentType,
    }));
  }
  for (const value of legacy) {
    add(resolverCandidate(caseRecord, value, {
      authorityMode: 'official',
      discoveryMethod: 'legacy_sitemap_or_candidate',
    }));
  }
  for (const value of explicitUrls) {
    if (!isOfficialBrandUrl(value, caseRecord.brand)) {
      let reference;
      try {
        reference = resolverCandidate(caseRecord, value, {
          authorityMode: 'reference',
          discoveryMethod: 'reference_mirror_seed',
        });
        add(reference);
      } catch {
        continue;
      }
      if (typeof options.rediscoverReferenceArtifact === 'function') {
        try {
          const rediscovered = await options.rediscoverReferenceArtifact({
            sourceUrl: reference.sourceUrl,
            brand: caseRecord.brand,
            model: caseRecord.model,
            category: caseRecord.category,
          });
          for (const candidate of rediscovered?.officialCandidates ?? []) {
            if (!candidate?.requiresOfficialAcquisition
              || !isOfficialBrandMarketUrl(candidate.sourceUrl, caseRecord.brand)) {
              throw new Error('reference rediscovery returned an invalid official candidate');
            }
            add(resolverCandidate(caseRecord, candidate.sourceUrl, {
              authorityMode: 'official',
              discoveryMethod: 'reference_fingerprint_rediscovery',
              documentType: candidate.documentType,
            }));
          }
        } catch (error) {
          failures.push(failureRecord('reference_rediscovery_failed', reference.sourceUrl, error));
        }
      }
    }
  }

  const uniqueFailures = [...new Map(failures.map((failure) => [
    `${failure.code}\0${failure.sourceUrl ?? ''}\0${failure.message ?? ''}`,
    failure,
  ])).values()];
  return validateEvidenceSourceResolverResult({
    schemaVersion: 1,
    ...CORE_RESOLVER,
    completion: truncated ? 'truncated' : uniqueFailures.length ? 'failed' : 'complete',
    candidates,
    failures: uniqueFailures,
  });
}
