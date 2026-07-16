import { readFileSync } from 'node:fs';

const manufacturerPolicy = JSON.parse(readFileSync(
  new URL('../../data/architecture-v2/policies/manufacturer-source-policy.json', import.meta.url),
  'utf8',
));

function brandKey(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizedModel(value) {
  const model = String(value ?? '').trim().toUpperCase();
  return model && !/[*?]/.test(model) ? model : null;
}

export function officialMarketApiModelVariant(caseIdentity, sourceModel) {
  const targetModel = normalizedModel(caseIdentity?.model);
  const candidateModel = normalizedModel(sourceModel);
  const category = String(caseIdentity?.category ?? '').trim().toLowerCase();
  if (!targetModel || !candidateModel || !category || targetModel === candidateModel) return null;
  const suffixes = manufacturerPolicy.officialMarketApiModelVariantSuffixes
    ?.[brandKey(caseIdentity?.brand)]?.[category];
  if (!Array.isArray(suffixes)) return null;
  for (const configuredSuffix of suffixes) {
    const suffix = String(configuredSuffix ?? '').trim().toUpperCase();
    if (!suffix || candidateModel !== `${targetModel}${suffix}`) continue;
    const market = suffix.replace(/^[._/-]+/, '');
    if (!/^[A-Z]{2}$/.test(market)) return null;
    return { sourceModel: candidateModel, suffix, market };
  }
  return null;
}

const VARIANT_DIMENSION_FIELDS = Object.freeze([
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
]);

function signalByType(source, type) {
  const matches = (source?.identitySignals ?? []).filter((signal) => signal?.type === type);
  return matches.length === 1 ? String(matches[0].value ?? '') : null;
}

function claimSupportsMm(claim, mm) {
  if (claim?.value?.kind === 'fixed') return claim.value.mm === mm;
  if (claim?.value?.kind === 'range') {
    return claim.value.minMm === mm || claim.value.maxMm === mm;
  }
  return false;
}

function escapedRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function strictOfficialModelVariantPdfFailure(source, caseIdentity) {
  if (source?.sourceType !== 'official_model_variant_pdf'
    || source?.contentType !== 'application/pdf'
    || source?.identity?.outcome !== 'official_marketing_alias') return 'source metadata';
  const targetModel = normalizedModel(caseIdentity?.model);
  const sourceModel = normalizedModel(source?.identity?.sourceModel);
  if (!targetModel || !sourceModel) return 'model identity';
  if (brandKey(source?.identity?.brand) !== brandKey(caseIdentity?.brand)
    || normalizedModel(source?.identity?.model) !== targetModel
    || String(source?.identity?.category ?? caseIdentity?.category) !== String(caseIdentity?.category)) return 'case identity';
  const variant = officialMarketApiModelVariant(caseIdentity, sourceModel);
  if (!variant) return 'variant policy';
  const provenance = source?.discoveryProvenance;
  if (provenance?.method !== 'official_market_api'
    || normalizedModel(provenance.requestedModel) !== targetModel
    || normalizedModel(provenance.matchedModel) !== variant.sourceModel
    || !/^[a-f0-9]{64}$/.test(String(provenance.discoveryContentSha256 ?? ''))) return 'discovery provenance';

  const claims = source?.claims ?? [];
  if (claims.length !== VARIANT_DIMENSION_FIELDS.length
    || new Set(claims.map((claim) => claim?.field)).size !== VARIANT_DIMENSION_FIELDS.length
    || !claims.every((claim) => VARIANT_DIMENSION_FIELDS.includes(claim?.field))) return 'dimension claim set';

  const hash = provenance.discoveryContentSha256;
  const apiDimensions = signalByType(source, 'official_market_api_dimensions');
  const match = new RegExp(`^${escapedRegex(targetModel)}:(\\d+)x(\\d+)x(\\d+):${hash}$`, 'i')
    .exec(apiDimensions ?? '');
  if (!match) return 'API dimensions signal';
  const mmByField = new Map([
    ['closedEnvelope.widthMm', Number(match[1])],
    ['closedEnvelope.heightMm', Number(match[2])],
    ['closedEnvelope.depthMm', Number(match[3])],
  ]);
  if (claims.some((claim) => !claimSupportsMm(claim, mmByField.get(claim.field)))) return 'PIM dimension agreement';

  const exactCoverSignal = signalByType(source, 'mineru_bound_exact_cover_model');
  if (!new RegExp(`^${escapedRegex(variant.sourceModel)}:exact-cover:${escapedRegex(variant.sourceModel)}:page:[1-9]\\d*:[a-f0-9]{64}$`, 'i')
    .test(exactCoverSignal ?? '')) return 'MinerU exact-cover signal';
  if (signalByType(source, 'canonical_source_model') !== variant.sourceModel) return 'canonical source-model signal';
  if (signalByType(source, 'official_market_api_model')
    !== `${targetModel}:${hash}:${provenance.discoveryUrl}`) return 'API model signal';
  if (signalByType(source, 'official_market_api_variant_binding')
    !== `${targetModel} -> ${variant.sourceModel} (${variant.market})`) return 'API variant-binding signal';
  return null;
}

export function isStrictOfficialModelVariantPdfSource(source, caseIdentity) {
  return strictOfficialModelVariantPdfFailure(source, caseIdentity) === null;
}
