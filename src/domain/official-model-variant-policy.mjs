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

function alphanumericModel(value) {
  return String(value ?? '').replace(/[^A-Z0-9]+/gi, '').toUpperCase();
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
    if (!suffix || !candidateModel.endsWith(suffix)) continue;
    const candidateBase = candidateModel.slice(0, -suffix.length);
    if (!candidateBase || alphanumericModel(candidateBase) !== alphanumericModel(targetModel)) continue;
    const market = suffix.replace(/^[._/-]+/, '');
    if (!/^[A-Z]{2}$/.test(market)) return null;
    return { sourceModel: candidateModel, suffix, market };
  }
  return null;
}

export function officialMarketApiSearchModels(caseIdentity) {
  const targetModel = normalizedModel(caseIdentity?.model);
  const category = String(caseIdentity?.category ?? '').trim().toLowerCase();
  if (!targetModel) return [];
  if (!category) return [targetModel];
  const suffixes = manufacturerPolicy.officialMarketApiModelVariantSuffixes
    ?.[brandKey(caseIdentity?.brand)]?.[category];
  if (!Array.isArray(suffixes)) return [targetModel];
  const candidates = [targetModel];
  for (const configuredSuffix of suffixes) {
    const suffix = String(configuredSuffix ?? '').trim().toUpperCase();
    if (!suffix) continue;
    candidates.push(`${targetModel}${suffix}`);
    for (const tailLength of [1, 2]) {
      if (targetModel.length <= tailLength) continue;
      candidates.push(`${targetModel.slice(0, -tailLength)}.${targetModel.slice(-tailLength)}${suffix}`);
    }
  }
  return [...new Set(candidates)];
}

export function officialProductMaterialModelVariant(caseIdentity, sourceModel) {
  const targetModel = normalizedModel(caseIdentity?.model);
  const candidateModel = normalizedModel(sourceModel);
  const category = String(caseIdentity?.category ?? '').trim().toLowerCase();
  if (!targetModel || !candidateModel || !category || targetModel === candidateModel) return null;
  const variants = manufacturerPolicy.officialProductMaterialModelVariantSuffixes
    ?.[brandKey(caseIdentity?.brand)]?.[category];
  if (!Array.isArray(variants)) return null;
  const targetKey = alphanumericModel(targetModel);
  const sourceKey = alphanumericModel(candidateModel);
  for (const configuration of variants) {
    const suffix = String(configuration?.suffix ?? '').trim().toUpperCase();
    const finishLabel = String(configuration?.finishLabel ?? '').trim();
    if (!suffix || !finishLabel || targetKey !== `${sourceKey}${suffix}`) continue;
    return {
      sourceModel: candidateModel,
      suffix,
      finishLabel,
    };
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
  const provenance = source?.discoveryProvenance;
  const marketVariant = officialMarketApiModelVariant(caseIdentity, sourceModel);
  const materialVariant = officialProductMaterialModelVariant(caseIdentity, sourceModel);
  const variant = provenance?.method === 'official_market_api'
    ? marketVariant
    : provenance?.method === 'official_product_material'
      ? materialVariant
      : null;
  if (!variant) return 'variant policy';
  if (!['official_market_api', 'official_product_material'].includes(provenance?.method)
    || normalizedModel(provenance.requestedModel) !== targetModel
    || normalizedModel(provenance.matchedModel) !== variant.sourceModel
    || !/^[a-f0-9]{64}$/.test(String(provenance.discoveryContentSha256 ?? ''))) return 'discovery provenance';

  const claims = source?.claims ?? [];
  if (claims.length !== VARIANT_DIMENSION_FIELDS.length
    || new Set(claims.map((claim) => claim?.field)).size !== VARIANT_DIMENSION_FIELDS.length
    || !claims.every((claim) => VARIANT_DIMENSION_FIELDS.includes(claim?.field))) return 'dimension claim set';

  const hash = provenance.discoveryContentSha256;
  if (provenance.method === 'official_product_material') {
    const materialNumber = String(provenance.materialNumber ?? '');
    if (!/^\d{6,14}$/.test(materialNumber)) return 'material binding';
    const materialSignal = signalByType(source, 'mineru_miele_product_material_model');
    if (!new RegExp(
      `^${escapedRegex(variant.sourceModel)}:material:${materialNumber}:finish:${escapedRegex(variant.finishLabel)}:page:[1-9]\\d*:[a-f0-9]{64}$`,
      'i',
    ).test(materialSignal ?? '')) return 'MinerU material-model signal';
    if (signalByType(source, 'canonical_source_model') !== variant.sourceModel) {
      return 'canonical source-model signal';
    }
    if (signalByType(source, 'official_product_material_model')
      !== `${targetModel}:${variant.sourceModel}:${materialNumber}:${hash}:${provenance.discoveryUrl}`) {
      return 'product-material model signal';
    }
    return null;
  }

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

function canonicalUrl(value) {
  try { return new URL(String(value ?? '')).toString(); } catch { return null; }
}

export function strictOfficialModelVariantApiFailure(source, caseIdentity) {
  if (source?.sourceType !== 'official_model_variant_api'
    || source?.contentType !== 'application/json'
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
  const hash = String(provenance?.discoveryContentSha256 ?? '');
  if (provenance?.method !== 'official_market_api'
    || normalizedModel(provenance.requestedModel) !== targetModel
    || normalizedModel(provenance.matchedModel) !== variant.sourceModel
    || !/^[a-f0-9]{64}$/.test(hash)
    || source?.contentSha256 !== hash) return 'discovery provenance';
  const boundUrl = canonicalUrl(provenance.discoveryUrl);
  if (!boundUrl || canonicalUrl(provenance.artifactUrl) !== boundUrl
    || canonicalUrl(source.sourceUrl) !== boundUrl
    || canonicalUrl(source.finalUrl) !== boundUrl) return 'self-source URL binding';

  const claims = source?.claims ?? [];
  if (claims.length !== VARIANT_DIMENSION_FIELDS.length
    || new Set(claims.map((claim) => claim?.field)).size !== VARIANT_DIMENSION_FIELDS.length
    || !claims.every((claim) => VARIANT_DIMENSION_FIELDS.includes(claim?.field))) return 'dimension claim set';
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
  if (signalByType(source, 'canonical_source_model') !== variant.sourceModel) return 'canonical source-model signal';
  if (signalByType(source, 'official_market_api_model') !== `${targetModel}:${hash}:${boundUrl}`) return 'API model signal';
  if (signalByType(source, 'official_market_api_variant_binding')
    !== `${targetModel} -> ${variant.sourceModel} (${variant.market})`) return 'API variant-binding signal';
  return null;
}

export function isStrictOfficialModelVariantApiSource(source, caseIdentity) {
  return strictOfficialModelVariantApiFailure(source, caseIdentity) === null;
}

export function isStrictOfficialModelVariantSource(source, caseIdentity) {
  return isStrictOfficialModelVariantPdfSource(source, caseIdentity)
    || isStrictOfficialModelVariantApiSource(source, caseIdentity);
}
