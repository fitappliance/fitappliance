const DOCUMENT_TYPES = Object.freeze([
  'installation_guide', 'quick_reference_guide', 'specification_sheet', 'user_manual', 'family_manual',
]);

function requiredText(value, label) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) throw new TypeError(`${label} required`);
  return text;
}

function modelKey(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

export function urlModelSignal(value, model) {
  const url = new URL(value);
  const target = modelKey(model);
  if (!target) return 'none';
  const pathExact = url.pathname.split('/').filter(Boolean).some((segment) => {
    const clean = decodeURIComponent(segment).replace(/\.(?:pdf|html?)$/i, '');
    const key = modelKey(clean);
    return key === target || new RegExp(`(?:^|[^A-Z0-9])${target}(?:[^A-Z0-9]|$)`, 'i').test(clean);
  });
  if (pathExact) return 'exact_url';
  if ([...url.searchParams.values()].some((value) => modelKey(value) === target)) return 'exact_query';
  return 'none';
}

export function classifyDocumentType(value) {
  const text = String(value ?? '').toLowerCase();
  if (/install(?:ation|ing)|dimension(?:al)?\s*(?:guide|sheet|drawing)/.test(text)) return 'installation_guide';
  if (/quick\s*reference|\bqrg\b/.test(text)) return 'quick_reference_guide';
  if (/spec(?:ification)?[\s_-]*(?:sheet|ifications?)|tech(?:nical)?[\s_-]*spec/.test(text)) return 'specification_sheet';
  if (/user|owner|operat(?:ing|ion)|instruction/.test(text)) return 'user_manual';
  return 'family_manual';
}

export function createOfficialDocumentCandidate(input, priorities = DOCUMENT_TYPES) {
  const url = new URL(requiredText(input?.url, 'candidate URL')).toString();
  const documentType = requiredText(input?.documentType, 'document type');
  if (!DOCUMENT_TYPES.includes(documentType)) throw new RangeError(`unsupported document type ${documentType}`);
  const modelSignal = requiredText(input?.modelSignal ?? 'none', 'model signal');
  const typeIndex = priorities.indexOf(documentType);
  const typeScore = typeIndex < 0 ? 0 : (priorities.length - typeIndex) * 100;
  const signalScore = { exact_url_and_context: 40, exact_query_and_context: 38, exact_url: 35, exact_query: 30, exact_context: 20, none: 0 }[modelSignal] ?? 0;
  return Object.freeze({
    url,
    authority: 'manufacturer',
    documentType,
    discoveryMethod: requiredText(input?.discoveryMethod, 'discovery method'),
    modelSignal,
    marketSignal: requiredText(input?.marketSignal ?? 'official_policy', 'market signal'),
    rank: typeScore + signalScore,
    rankReason: `${documentType}:${modelSignal}`,
  });
}

export function rankOfficialDocumentCandidates(candidates) {
  const byUrl = new Map();
  for (const candidate of candidates) {
    const previous = byUrl.get(candidate.url);
    if (!previous || candidate.rank > previous.rank) byUrl.set(candidate.url, candidate);
  }
  return [...byUrl.values()].sort((left, right) => right.rank - left.rank || left.url.localeCompare(right.url));
}
