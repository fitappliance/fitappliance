import { load } from 'cheerio';

import { isOfficialBrandUrl } from './evidence-source-verifier.mjs';
import { discoverOfficialDocumentCandidates } from './official-document-discovery.mjs';

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
  const explicitUrls = [
    ...(caseRecord.sources ?? []).map((source) => source.finalUrl ?? source.sourceUrl),
    ...(caseRecord.candidateUrls ?? []),
  ].filter(Boolean);
  const ranked = await discoverOfficialDocumentCandidates({
    brand: caseRecord.brand,
    model: caseRecord.model,
    category: caseRecord.category,
    explicitUrls,
    productPageUrls: caseRecord.productPageUrls ?? caseRecord.officialProductPageUrls ?? [],
  }, options);
  const legacy = await discoverCandidateUrls(caseRecord, options);
  return [...new Set([...ranked.map((candidate) => candidate.url), ...legacy])];
}
