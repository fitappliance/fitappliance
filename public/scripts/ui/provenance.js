const EVIDENCE_INDEX_URL = '/data/evidence-index.json';

let cachedEvidenceIndexPromise = null;

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function toDateStamp(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const direct = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
  if (direct) return direct;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : '';
}

function isSafeSourceUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return false;
  try {
    const base = typeof window !== 'undefined' && window?.location?.origin
      ? window.location.origin
      : 'https://www.fitappliance.com.au';
    const parsed = new URL(raw, base);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function normalizeIndexPayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  if (payload.products && typeof payload.products === 'object') return payload.products;
  return payload;
}

export async function loadEvidenceIndex(fetchImpl = globalThis.fetch) {
  if (cachedEvidenceIndexPromise) return cachedEvidenceIndexPromise;
  if (typeof fetchImpl !== 'function') {
    cachedEvidenceIndexPromise = Promise.resolve({});
    return cachedEvidenceIndexPromise;
  }

  cachedEvidenceIndexPromise = fetchImpl(EVIDENCE_INDEX_URL)
    .then(async (response) => {
      if (!response?.ok) return {};
      return normalizeIndexPayload(await response.json());
    })
    .catch(() => ({}));
  return cachedEvidenceIndexPromise;
}

export function getProductProvenance(productId, indexMap = {}) {
  const id = String(productId ?? '').trim();
  if (!id || !indexMap || typeof indexMap !== 'object') return null;
  return indexMap[id] ?? null;
}

function provenanceFromProductEvidence(product = {}) {
  const evidence = product?.evidence;
  if (!evidence || evidence?.has_pdf_evidence !== true) return null;
  return {
    status: 'verified',
    has_pdf_evidence: true,
    source_url: evidence.source_url ?? '',
    verified_at: toDateStamp(evidence.verified_at),
    source_type: 'runtime_product_evidence'
  };
}

function renderVerifiedProvenance(provenance) {
  const date = toDateStamp(provenance?.verified_at);
  const sourceUrl = String(provenance?.source_url ?? '').trim();
  const source = isSafeSourceUrl(sourceUrl)
    ? `<a class="provenance-link" href="${escHtml(sourceUrl)}" target="_blank" rel="noopener">Manufacturer PDF</a>`
    : '<span class="provenance-link provenance-link--captured">Manufacturer PDF captured</span>';

  return `<div class="provenance-block provenance-block--verified">
    <span class="provenance-state">Verified source</span>
    ${source}
    ${date ? `<span class="provenance-date">verified ${escHtml(date)}</span>` : ''}
  </div>`;
}

function renderPendingProvenance() {
  return `<div class="provenance-block provenance-block--pending">
    <span class="provenance-state">Evidence pending</span>
    <span>Manufacturer manual extracted; manual verification in progress.</span>
  </div>`;
}

function renderFallbackProvenance() {
  return `<div class="provenance-block provenance-block--fallback">
    <span class="provenance-state">Retailer spec</span>
    <span>Specs from publicly listed retailer feeds. Manufacturer PDF verification pending.</span>
  </div>`;
}

export function renderProvenanceBlock(product = {}, indexMap = {}) {
  const indexed = getProductProvenance(product?.id ?? product?.product_id ?? product?.slug, indexMap);
  const provenance = indexed ?? provenanceFromProductEvidence(product);
  if (provenance?.status === 'verified' || provenance?.has_pdf_evidence === true) {
    return renderVerifiedProvenance(provenance);
  }
  if (provenance?.status === 'pending') {
    return renderPendingProvenance(provenance);
  }
  return renderFallbackProvenance();
}

export const __test = {
  escHtml,
  isSafeSourceUrl,
  normalizeIndexPayload,
  provenanceFromProductEvidence
};
