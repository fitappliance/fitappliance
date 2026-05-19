const { findManualEvidenceSourceUrl } = require('./1-fetch');
const { mieleModelMatchesSku, normalizeSku } = require('./parsers/miele');

function normalizeCategory(value) {
  return String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
}

function getTargetSku(target = {}) {
  return String(target.sku || target.model || target.product?.model || target.product?.sku || '').trim();
}

function getTargetCategory(target = {}) {
  return normalizeCategory(target.category || target.cat || target.product?.cat);
}

function getEvidenceItems(entry) {
  const items = [];
  if (entry?.source_url) {
    items.push({
      type: entry.type || 'spec_sheet',
      status: entry.status || 'candidate',
      source_url: entry.source_url,
      verified_alias: entry.verified_alias
    });
  }
  if (Array.isArray(entry?.evidence)) items.push(...entry.evidence);
  return items;
}

function isUsableMieleSpecEvidence(item) {
  if (!item?.source_url || item.status === 'rejected') return false;
  const haystack = `${item.type || ''} ${item.source_url || ''}`;
  if (/quick[_\s-]*guide|quickstart|installation[_\s-]*guide|user[_\s-]*manual/i.test(haystack)) return false;
  return /spec|sheet|data|pdf/i.test(haystack);
}

function scoreMieleEvidence(item) {
  const haystack = `${item.type || ''} ${item.source_url || ''}`;
  let score = 0;
  if (/specification|spec[_\s-]*sheet|data[_\s-]*sheet/i.test(haystack)) score += 100;
  if (/spec|sheet/i.test(String(item.type || ''))) score += 20;
  if (/quick[_\s-]*guide|quickstart/i.test(haystack)) score -= 200;
  if (/installation[_\s-]*guide|user[_\s-]*manual/i.test(haystack)) score -= 100;
  return score;
}

function entryModels(entry) {
  return [
    entry?.model,
    entry?.sku,
    entry?.product?.model,
    entry?.product?.sku,
    entry?.verified_alias,
    ...getEvidenceItems(entry).map((item) => item.verified_alias)
  ].filter(Boolean).map((value) => String(value).trim());
}

function mieleEvidenceModelMatchesTarget({
  evidenceModel,
  targetSku,
  evidenceCategory,
  targetCategory
} = {}) {
  if (normalizeCategory(evidenceCategory) !== normalizeCategory(targetCategory)) return false;
  return mieleModelMatchesSku(evidenceModel, targetSku);
}

function findMieleManualEvidencePdf(target = {}, manualEvidence = {}) {
  const exact = findManualEvidenceSourceUrl(target, manualEvidence);
  if (exact) {
    return {
      sourceUrl: exact,
      source: 'manual-evidence',
      verifiedAlias: null
    };
  }

  const targetSku = getTargetSku(target);
  const targetCategory = getTargetCategory(target);
  const products = manualEvidence?.products || {};
  const matches = [];

  for (const entry of Object.values(products)) {
    if (!/miele/i.test(String(entry?.brand || entry?.product?.brand || ''))) continue;
    const evidenceCategory = normalizeCategory(entry?.category || entry?.cat || entry?.product?.cat);
    const item = getEvidenceItems(entry).find(isUsableMieleSpecEvidence);
    if (!item) continue;

    const verifiedAlias = entryModels(entry).find((model) => mieleEvidenceModelMatchesTarget({
      evidenceModel: model,
      targetSku,
      evidenceCategory,
      targetCategory
    }));
    if (!verifiedAlias) continue;

    matches.push({
      sourceUrl: item.source_url,
      source: `manual-evidence:miele-family-${item.type || 'spec_sheet'}`,
      verifiedAlias: normalizeSku(verifiedAlias),
      score: scoreMieleEvidence(item)
    });
  }

  matches.sort((a, b) => b.score - a.score || a.sourceUrl.localeCompare(b.sourceUrl));
  return matches[0] || null;
}

exports.findMieleManualEvidencePdf = findMieleManualEvidencePdf;
exports.mieleEvidenceModelMatchesTarget = mieleEvidenceModelMatchesTarget;
