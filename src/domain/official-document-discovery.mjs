import { readFileSync } from 'node:fs';
import { load } from 'cheerio';

import { isOfficialBrandUrl } from './evidence-source-verifier.mjs';
import {
  classifyDocumentType,
  createOfficialDocumentCandidate,
  rankOfficialDocumentCandidates,
  urlModelSignal,
} from './official-document-candidate.mjs';

const strategies = JSON.parse(readFileSync(
  new URL('../../data/architecture-v2/policies/manufacturer-document-strategies.json', import.meta.url),
  'utf8',
));

function brandKey(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function containsModel(value, model) {
  const target = String(model ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
  const input = String(value ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
  return Boolean(target) && input.includes(target);
}

function candidate(url, context, discoveryMethod, contextText = '') {
  if (!isOfficialBrandUrl(url, context.brand)) return null;
  const urlSignal = urlModelSignal(url, context.model);
  const contextExact = containsModel(contextText, context.model);
  const modelSignal = urlSignal === 'exact_url' && contextExact
    ? 'exact_url_and_context'
    : urlSignal === 'exact_query' && contextExact
      ? 'exact_query_and_context'
      : urlSignal !== 'none'
        ? urlSignal
        : contextExact ? 'exact_context' : 'none';
  const isPdfArtifact = /\.pdf(?:$|[?#])/i.test(new URL(url).toString());
  const classifiedType = urlSignal !== 'none' && !isPdfArtifact
    ? 'product_page'
    : classifyDocumentType(`${url} ${contextText}`);
  return createOfficialDocumentCandidate({
    url,
    documentType: classifiedType === 'user_manual' && modelSignal === 'none' ? 'family_manual' : classifiedType,
    discoveryMethod,
    modelSignal,
  }, strategies.documentTypePriority);
}

export function extractOfficialDocumentLinks(html, context) {
  const $ = load(String(html ?? ''));
  const found = [];
  $('a[href],link[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) return;
    let url;
    try { url = new URL(href, context.pageUrl).toString(); } catch { return; }
    if (!/\.pdf(?:$|[?#])/i.test(new URL(url).pathname + new URL(url).search)) return;
    const row = candidate(url, context, 'official_product_page', $(element).text());
    if (row) found.push(row);
  });
  $('[data-download-url],[data-document-url]').each((_, element) => {
    const href = $(element).attr('data-download-url') ?? $(element).attr('data-document-url');
    let url;
    try { url = new URL(href, context.pageUrl).toString(); } catch { return; }
    const row = candidate(url, context, 'official_product_page_data', $(element).text());
    if (row) found.push(row);
  });
  return rankOfficialDocumentCandidates(found);
}

function templateCandidates(context) {
  const profile = strategies.brands[brandKey(context.brand)] ?? { templates: [] };
  return (profile.templates ?? []).flatMap((template) => {
    const url = template.url.replaceAll('{model}', encodeURIComponent(context.model));
    if (!isOfficialBrandUrl(url, context.brand)) return [];
    return [createOfficialDocumentCandidate({
      url,
      documentType: template.documentType,
      discoveryMethod: 'brand_template',
      modelSignal: urlModelSignal(url, context.model),
    }, strategies.documentTypePriority)];
  });
}

export async function discoverOfficialDocumentCandidates(context, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const rows = [...templateCandidates(context)];
  for (const value of context.explicitUrls ?? []) {
    const row = candidate(value, context, 'explicit_registry');
    if (row) rows.push(row);
  }
  for (const pageUrl of context.productPageUrls ?? []) {
    if (!isOfficialBrandUrl(pageUrl, context.brand)) continue;
    try {
      const response = await fetchImpl(pageUrl, {
        redirect: 'error', signal: options.signal ?? AbortSignal.timeout(options.timeoutMs ?? 15000),
      });
      if (!response.ok) continue;
      rows.push(...extractOfficialDocumentLinks(await response.text(), { ...context, pageUrl }));
    } catch {
      // One product-page strategy failure must not suppress deterministic candidates.
    }
  }
  return rankOfficialDocumentCandidates(rows);
}
