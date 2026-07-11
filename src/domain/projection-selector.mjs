const COPY = Object.freeze({
  NO_FIT: { label: 'Does not fit', detail: 'At least one required physical check fails.' },
  INSUFFICIENT_DATA: { label: 'More measurements needed', detail: 'A required product or space measurement is unknown.' },
  CONDITIONAL_FIT: { label: 'Check before buying', detail: 'The measured envelope passes, but an applicable operation or service check is unresolved.' },
  VERIFIED_FIT: { label: 'Verified fit', detail: 'Dimensions and applicable installation requirements are backed by approved evidence.' },
  LIKELY_FIT_ESTIMATED: { label: 'Likely fit (estimated)', detail: 'The measured envelope passes using estimates that still need manufacturer confirmation.' },
});

export function selectCatalogProjection({ legacy, v2, flag = 'legacy' }) {
  if (!legacy || !Array.isArray(legacy.products)) throw new TypeError('legacy projection required');
  if (flag !== 'legacy' && flag !== 'v2') throw new TypeError(`unsupported projection flag ${flag}`);
  if (flag === 'legacy') return Object.freeze({ name: 'legacy', catalog: legacy });
  if (!v2 || !Array.isArray(v2.products) || v2.products.some((row) => !String(row.canonicalProductId ?? '').startsWith('fa_prod_'))) {
    throw new TypeError('V2 projection requires canonical product IDs');
  }
  return Object.freeze({ name: 'v2', catalog: v2 });
}

export function outcomeCopy(outcome) {
  if (!COPY[outcome]) throw new TypeError(`unsupported Fit outcome ${outcome}`);
  return COPY[outcome];
}

export function rankResults(rows) {
  const fitOrder = { VERIFIED_FIT: 0, LIKELY_FIT_ESTIMATED: 1, CONDITIONAL_FIT: 2, INSUFFICIENT_DATA: 3, NO_FIT: 4 };
  if (!Array.isArray(rows) || rows.some((row) => fitOrder[row.fitDecision?.outcome] === undefined)) {
    throw new TypeError('every ranked result requires a supported Fit outcome');
  }
  return Object.freeze([...rows].sort((left, right) => (
    (fitOrder[left.fitDecision?.outcome] ?? 5) - (fitOrder[right.fitDecision?.outcome] ?? 5)
    || Number(right.rankingScore ?? 0) - Number(left.rankingScore ?? 0)
    || String(left.id).localeCompare(String(right.id))
  )));
}
