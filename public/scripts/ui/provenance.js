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
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return null;
  return {
    status: evidence.status ?? 'verified',
    has_pdf_evidence: evidence.has_pdf_evidence === true,
    trust_level: evidence.trust_level ?? '',
    verified_fields: Array.isArray(evidence.verified_fields) ? evidence.verified_fields : [],
    clearance_verified: evidence.clearance_verified === true,
    source_url: evidence.source_url ?? '',
    verified_at: toDateStamp(evidence.verified_at),
    source_type: evidence.source_type ?? 'runtime_product_evidence'
  };
}

function getTrustLevel(provenance = {}, product = {}) {
  const geometryLevel = product?.geometry_v2_provenance?.evidenceLevel;
  if (geometryLevel === 'verified' && product?.fitDecision?.outcome === 'VERIFIED_FIT') return 'verified_fit';
  if (geometryLevel === 'verified') return 'fit_requirements_verified';
  if (geometryLevel === 'dimensions') return 'dimensions_verified';
  const explicit = String(provenance?.trust_level ?? '').trim();
  if (explicit === 'retailer_spec') return explicit;
  if (explicit === 'evidence_pending' || ['verified_fit', 'dimensions_verified'].includes(explicit)) return 'evidence_pending';
  if (provenance?.has_pdf_evidence === true) return 'evidence_pending';
  return 'retailer_spec';
}

function sourceAnchor(provenance, label, fallbackLabel) {
  const sourceUrl = String(provenance?.source_url ?? '').trim();
  return isSafeSourceUrl(sourceUrl)
    ? `<a class="provenance-link" href="${escHtml(sourceUrl)}" target="_blank" rel="noopener">${escHtml(label)}</a>`
    : `<span class="provenance-link provenance-link--captured">${escHtml(fallbackLabel)}</span>`;
}

function renderVerifiedProvenance(provenance) {
  const date = toDateStamp(provenance?.verified_at);
  const source = sourceAnchor(provenance, 'Official PDF', 'Official PDF captured');

  return `<div class="provenance-block provenance-block--verified">
    <span class="provenance-state">Verified Fit</span>
    ${source}
    ${date ? `<span class="provenance-date">verified ${escHtml(date)}</span>` : ''}
  </div>`;
}

function renderDimensionsProvenance(provenance) {
  const date = toDateStamp(provenance?.verified_at);
  const source = sourceAnchor(provenance, 'Dimension source', 'Dimension source captured');

  return `<div class="provenance-block provenance-block--dimensions">
    <span class="provenance-state">Dimensions verified</span>
    ${source}
    <span>clearance estimated</span>
    ${date ? `<span class="provenance-date">verified ${escHtml(date)}</span>` : ''}
  </div>`;
}

function renderRequirementsProvenance(provenance) {
  const date = toDateStamp(provenance?.verified_at);
  const source = sourceAnchor(provenance, 'Official evidence', 'Official evidence captured');
  return `<div class="provenance-block provenance-block--verified">
    <span class="provenance-state">Fit requirements verified</span>
    ${source}
    <span>fit depends on your cavity measurements</span>
    ${date ? `<span class="provenance-date">verified ${escHtml(date)}</span>` : ''}
  </div>`;
}

function renderRetailerProvenance(provenance = {}) {
  const date = toDateStamp(provenance?.verified_at);
  const source = sourceAnchor(provenance, 'Retailer source', 'Retailer source captured');

  return `<div class="provenance-block provenance-block--retailer">
    <span class="provenance-state">Retailer dimensions</span>
    ${source}
    <span>installation clearance not verified</span>
    ${date ? `<span class="provenance-date">checked ${escHtml(date)}</span>` : ''}
  </div>`;
}

function renderPendingProvenance() {
  return `<div class="provenance-block provenance-block--pending">
    <span class="provenance-state">Evidence pending</span>
    <span>Source captured; field-level receipt verification pending.</span>
  </div>`;
}

function renderFallbackProvenance() {
  return `<div class="provenance-block provenance-block--fallback">
    <span class="provenance-state">Retailer dimensions</span>
    <span>Specs from publicly listed retailer feeds. Manufacturer PDF verification pending.</span>
  </div>`;
}

export function renderProvenanceBlock(product = {}, indexMap = {}) {
  const indexed = getProductProvenance(product?.id ?? product?.product_id ?? product?.slug, indexMap);
  const provenance = indexed ?? provenanceFromProductEvidence(product);
  if (provenance?.status === 'verified' || provenance?.has_pdf_evidence === true) {
    const trustLevel = getTrustLevel(provenance, product);
    if (trustLevel === 'verified_fit') return renderVerifiedProvenance(provenance);
    if (trustLevel === 'fit_requirements_verified') return renderRequirementsProvenance(provenance);
    if (trustLevel === 'dimensions_verified') return renderDimensionsProvenance(provenance);
    if (trustLevel === 'evidence_pending') return renderPendingProvenance();
    return renderRetailerProvenance(provenance);
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
