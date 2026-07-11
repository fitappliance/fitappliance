import { classifyTransportHost } from './source-provenance.mjs';

function text(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

function officialUrl(value) {
  const sourceUrl = text(value, 'source URL');
  let url;
  try { url = new URL(sourceUrl); } catch { throw new TypeError('valid source URL required'); }
  if (url.protocol !== 'https:' || classifyTransportHost(url.toString()) !== 'manufacturer') {
    throw new TypeError('source URL must use an official manufacturer host');
  }
  return url.toString();
}

export function buildEvidenceAcquisitionPlan(batch, input = {}) {
  if (!Array.isArray(batch?.products)) throw new TypeError('active evidence batch required');
  const overrides = input.overrides ?? {};
  const entries = batch.products.map((product) => {
    const legacyRuntimeId = text(product.legacyRuntimeId, 'legacy runtime ID');
    const override = overrides[legacyRuntimeId];
    if (override?.sourceUrl) {
      return {
        legacyRuntimeId,
        canonicalProductId: text(product.canonicalProductId, 'canonical product ID'),
        category: text(product.category, 'category'), brand: text(product.brand, 'brand'), model: text(product.model, 'model'),
        status: 'ready', selectionBasis: 'reviewed_official_override', sourceUrl: officialUrl(override.sourceUrl),
      };
    }
    if (override?.unavailableReason) {
      return {
        legacyRuntimeId,
        canonicalProductId: text(product.canonicalProductId, 'canonical product ID'),
        category: text(product.category, 'category'), brand: text(product.brand, 'brand'), model: text(product.model, 'model'),
        status: 'no_source', selectionBasis: 'reviewed_unavailable', sourceUrl: null,
        unavailableReason: text(override.unavailableReason, 'unavailable reason'),
      };
    }
    const candidate = (product.sourceCandidates ?? []).find((row) =>
      row.transportHostType === 'manufacturer'
      && row.identityOutcome === 'exact'
      && classifyTransportHost(row.sourceUrl) === 'manufacturer'
    );
    if (!candidate) throw new TypeError(`acquisition override or unavailable reason required for ${legacyRuntimeId}`);
    return {
      legacyRuntimeId,
      canonicalProductId: text(product.canonicalProductId, 'canonical product ID'),
      category: text(product.category, 'category'), brand: text(product.brand, 'brand'), model: text(product.model, 'model'),
      status: 'ready', selectionBasis: 'exact_manufacturer_candidate', sourceUrl: officialUrl(candidate.sourceUrl),
    };
  });
  const ready = entries.filter((row) => row.status === 'ready').length;
  return freezeDeep({
    schemaVersion: 1,
    entries,
    summary: { entries: entries.length, ready, noSource: entries.length - ready },
  });
}
