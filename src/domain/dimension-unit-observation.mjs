import { createHash } from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/;
const CATEGORIES = new Set(['dishwasher', 'dryer', 'fridge', 'washing_machine']);
const SCOPES = new Set([
  'product_closed_candidate',
  'delivery_package',
  'product_body',
  'cavity_opening',
  'installation_clearance',
  'operation_envelope',
]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function sha256(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} required`);
  return value;
}

function normalizedText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function requiredSha256(value, label) {
  const result = normalizedText(value);
  if (!SHA256.test(result)) throw new TypeError(`${label} must be SHA-256`);
  return result;
}

function normalizeSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('source required');
  }
  const result = {
    contentSha256: requiredSha256(source.contentSha256, 'source content'),
    rawText: requiredText(source.rawText, 'source raw text'),
    authority: requiredText(source.authority, 'source authority').trim().toUpperCase(),
    market: requiredText(source.market, 'source market').trim().toUpperCase(),
  };
  if (source.page !== undefined && source.page !== null) {
    if (!Number.isSafeInteger(source.page) || source.page < 1) throw new TypeError('source page invalid');
    result.page = source.page;
  }
  if (source.fragmentSha256 !== undefined && source.fragmentSha256 !== null) {
    result.fragmentSha256 = requiredSha256(source.fragmentSha256, 'source fragment');
  }
  if (source.bbox !== undefined && source.bbox !== null) {
    if (!Array.isArray(source.bbox) || source.bbox.length !== 4
      || source.bbox.some((coordinate) => !Number.isFinite(coordinate))) {
      throw new TypeError('source bbox must contain four finite coordinates');
    }
    result.bbox = [...source.bbox];
  }
  return result;
}

function normalizeTarget(target) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    throw new TypeError('exact target identity required');
  }
  const result = {
    referenceId: requiredText(target.referenceId, 'target reference ID').trim(),
    brand: requiredText(target.brand, 'target brand').trim(),
    model: requiredText(target.model, 'target model').trim(),
    category: requiredText(target.category, 'target category').trim(),
    market: requiredText(target.market, 'target market').trim().toUpperCase(),
    identityScope: requiredText(target.identityScope, 'target identity scope').trim().toUpperCase(),
  };
  if (!CATEGORIES.has(result.category) || result.identityScope !== 'EXACT_MODEL') {
    throw new TypeError('exact target identity required');
  }
  return result;
}

function normalizeMetricContext(value, sourceContentSha256) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('metric context provenance object required');
  }
  const result = {
    rawText: requiredText(value.rawText, 'metric context raw text'),
    contentSha256: requiredSha256(value.contentSha256, 'metric context content'),
    fragmentSha256: requiredSha256(value.fragmentSha256, 'metric context fragment'),
  };
  if (result.contentSha256 !== sourceContentSha256) {
    throw new Error('metric context belongs to a different artifact: content SHA-256 mismatch');
  }
  if (value.page !== undefined && value.page !== null) {
    if (!Number.isSafeInteger(value.page) || value.page < 1) throw new TypeError('metric context page invalid');
    result.page = value.page;
  }
  if (value.bbox !== undefined && value.bbox !== null) {
    if (!Array.isArray(value.bbox) || value.bbox.length !== 4
      || value.bbox.some((coordinate) => !Number.isFinite(coordinate))) {
      throw new TypeError('metric context bbox must contain four finite coordinates');
    }
    result.bbox = [...value.bbox];
  }
  return result;
}

function normalizeExplicitUnitProvenance(value, source) {
  if (value === undefined || value === null) return null;
  const result = normalizeMetricContext(value, source.contentSha256);
  if (!source.fragmentSha256 || result.fragmentSha256 !== source.fragmentSha256) {
    throw new Error('explicit unit provenance must be bound to the source fragment');
  }
  return result;
}

function normalizeModelScope(value) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('model scope required');
  }
  return {
    modelBinding: requiredText(value.modelBinding, 'model binding').trim(),
    boundModels: [...new Set((value.boundModels ?? []).map((model) => (
      requiredText(model, 'bound model').trim()
    )))].sort(),
  };
}

function unitToken(value) {
  const tokens = [...String(value ?? '').matchAll(/(?<![A-Za-z])(mm|millimet(?:re|er)s?|cm|centimet(?:re|er)s?)(?![A-Za-z])/gi)]
    .map((match) => match[1].toLowerCase().startsWith('c') ? 'cm' : 'mm');
  const units = new Set(tokens);
  return units.size === 1 ? [...units][0] : units.size > 1 ? 'conflict' : null;
}

function parseEntries(rawTuple) {
  const entries = [];
  const pattern = /(?:^|[^a-z0-9])([hwdl])(["']?)\s*[:=]?\s*(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?\s*(mm|cm)?/gi;
  for (const match of String(rawTuple).matchAll(pattern)) {
    entries.push({
      token: match[1].toUpperCase(),
      variant: match[2] || '',
      min: Number(match[3]),
      max: Number(match[4] ?? match[3]),
      unit: match[5]?.toLowerCase() ?? null,
    });
  }
  return entries;
}

function structuredEntries(axisValues) {
  if (axisValues === undefined || axisValues === null) return null;
  if (!Array.isArray(axisValues) || !axisValues.length) {
    throw new TypeError('axis values must be a non-empty array');
  }
  const tokens = { height: 'H', width: 'W', depth: 'D', length: 'L' };
  return axisValues.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new TypeError(`axis value ${index} invalid`);
    }
    const axis = requiredText(entry.axis, `axis value ${index} axis`).trim().toLowerCase();
    if (!tokens[axis]) throw new TypeError(`axis value ${index} axis invalid`);
    const rawValue = requiredText(String(entry.value), `axis value ${index} value`).trim();
    const match = /^(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?$/.exec(rawValue);
    if (!match) throw new TypeError(`axis value ${index} value invalid`);
    return {
      token: tokens[axis],
      variant: '',
      min: Number(match[1]),
      max: Number(match[2] ?? match[1]),
      unit: null,
    };
  });
}

function axisState(entries, scope) {
  const tokens = new Set(entries.map((entry) => entry.token));
  const depthEntries = entries.filter((entry) => entry.token === 'D');
  if (depthEntries.length > 1 || depthEntries.some((entry) => entry.variant)) return 'AXIS_AMBIGUOUS';
  if (tokens.has('H') && tokens.has('W') && tokens.has('L') && !tokens.has('D')) {
    return scope === 'product_closed_candidate'
      ? 'ORTHOGONAL_LENGTH_AS_DEPTH_HINT'
      : 'AXIS_AMBIGUOUS';
  }
  if (tokens.has('H') && tokens.has('W') && depthEntries.length === 1 && entries.length === 3) {
    return 'EXPLICIT_DEPTH';
  }
  return 'AXIS_AMBIGUOUS';
}

function convertedDimensions(entries, unit) {
  if (!unit || unit === 'conflict') return null;
  const factor = unit === 'cm' ? 10 : 1;
  const byAxis = new Map();
  for (const entry of entries) {
    const axis = entry.token === 'H' ? 'height'
      : entry.token === 'W' ? 'width'
        : ['D', 'L'].includes(entry.token) ? 'depth' : null;
    if (!axis || byAxis.has(axis)) continue;
    byAxis.set(axis, {
      min: Number((entry.min * factor).toFixed(6)),
      max: Number((entry.max * factor).toFixed(6)),
    });
  }
  if (![...['height', 'width', 'depth']].every((axis) => byAxis.has(axis))) return null;
  return {
    height: byAxis.get('height'),
    width: byAxis.get('width'),
    depth: byAxis.get('depth'),
  };
}

function plausible(dimensions, scope) {
  const minimum = ['product_closed_candidate', 'product_body', 'delivery_package'].includes(scope)
    ? 100
    : 0;
  return dimensions !== null && Object.values(dimensions).every(({ min, max }) => (
    Number.isFinite(min) && Number.isFinite(max) && min >= minimum && max <= 3000 && min <= max
  ));
}

function dimensionsKey(dimensions) {
  if (!dimensions) return null;
  const values = ['width', 'height', 'depth'].map((axis) => Number(dimensions[axis]));
  return values.every(Number.isFinite) ? values.join('x') : null;
}

function normalizeRetailerHints(hints) {
  if (!Array.isArray(hints)) throw new TypeError('retailer hints must be an array');
  return hints.map((hint, index) => {
    if (!hint || typeof hint !== 'object' || Array.isArray(hint)) {
      throw new TypeError(`retailer hint ${index} invalid`);
    }
    const dimensions = hint.dimensionsMm ?? null;
    return {
      retailer: requiredText(hint.retailer, `retailer hint ${index} retailer`).trim(),
      market: String(hint.market ?? '').trim().toUpperCase(),
      exactModel: hint.exactModel === true,
      rawText: requiredText(hint.rawText, `retailer hint ${index} raw text`),
      dimensionsMm: dimensions && ['width', 'height', 'depth'].every((axis) => (
        Number.isFinite(Number(dimensions[axis]))
      )) ? {
          width: Number(dimensions.width),
          height: Number(dimensions.height),
          depth: Number(dimensions.depth),
        } : null,
      assetUrl: String(hint.assetUrl ?? '').trim() || null,
      syndicationOwner: String(hint.syndicationOwner ?? '').trim() || null,
    };
  }).sort((left, right) => (
    `${left.retailer}\0${left.rawText}`.localeCompare(`${right.retailer}\0${right.rawText}`)
  ));
}

function sameCopyFamily(left, right) {
  return Boolean(
    (left.assetUrl && right.assetUrl && normalizedText(left.assetUrl) === normalizedText(right.assetUrl))
    || (left.syndicationOwner && right.syndicationOwner
      && normalizedText(left.syndicationOwner) === normalizedText(right.syndicationOwner))
    || normalizedText(left.rawText) === normalizedText(right.rawText)
    || (dimensionsKey(left.dimensionsMm)
      && dimensionsKey(left.dimensionsMm) === dimensionsKey(right.dimensionsMm)),
  );
}

function retailerDiagnostics(hints) {
  const parents = hints.map((_, index) => index);
  const root = (index) => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  };
  const join = (left, right) => {
    const leftRoot = root(left);
    const rightRoot = root(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  };
  for (let left = 0; left < hints.length; left += 1) {
    for (let right = left + 1; right < hints.length; right += 1) {
      if (sameCopyFamily(hints[left], hints[right])) join(left, right);
    }
  }
  const groups = new Map();
  hints.forEach((hint, index) => {
    const key = root(index);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(hint);
  });
  const copyFamilies = [...groups.values()].map((members) => {
    const memberKeys = members.map((hint) => `${hint.retailer}\0${hint.rawText}`).sort();
    const copyBasis = new Set();
    for (let left = 0; left < members.length; left += 1) {
      for (let right = left + 1; right < members.length; right += 1) {
        if (members[left].assetUrl && members[right].assetUrl
          && normalizedText(members[left].assetUrl) === normalizedText(members[right].assetUrl)) {
          copyBasis.add('SHARED_ASSET_URL');
        }
        if (members[left].syndicationOwner && members[right].syndicationOwner
          && normalizedText(members[left].syndicationOwner)
            === normalizedText(members[right].syndicationOwner)) {
          copyBasis.add('SHARED_SYNDICATION_OWNER');
        }
        if (normalizedText(members[left].rawText) === normalizedText(members[right].rawText)) {
          copyBasis.add('SHARED_WORDING');
        }
        if (dimensionsKey(members[left].dimensionsMm)
          && dimensionsKey(members[left].dimensionsMm) === dimensionsKey(members[right].dimensionsMm)) {
          copyBasis.add('SHARED_TUPLE');
        }
      }
    }
    if (!copyBasis.size) copyBasis.add('UNKNOWN_LINEAGE');
    return {
      familyId: `retailer_copy_family_${sha256(memberKeys).slice(0, 24)}`,
      dependent: true,
      copyBasis: [...copyBasis].sort(),
      memberCount: members.length,
      retailers: members.map((hint) => hint.retailer).sort(),
    };
  }).sort((left, right) => left.familyId.localeCompare(right.familyId));
  return {
    hints: hints.length,
    copyFamilies,
    authoritativeFamilies: 0,
    lineageDecision: hints.length ? 'DEPENDENT_DIAGNOSTIC_ONLY' : 'NO_RETAILER_HINTS',
  };
}

function matchingRetailerHints(hints, dimensions) {
  if (!dimensions) return [];
  const expected = {
    width: dimensions.width.min,
    height: dimensions.height.min,
    depth: dimensions.depth.min,
  };
  return hints.filter((hint) => (
    hint.market === 'AU'
    && hint.exactModel
    && hint.dimensionsMm
    && ['width', 'height', 'depth'].every((axis) => hint.dimensionsMm[axis] === expected[axis])
  ));
}

export function createDimensionUnitObservation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('dimension unit observation input required');
  }
  const source = normalizeSource(input.source);
  const target = normalizeTarget(input.target);
  const rawLabel = requiredText(input.rawLabel, 'raw label');
  const rawTuple = requiredText(input.rawTuple, 'raw tuple');
  const scope = requiredText(input.scope, 'scope').trim();
  const policyVersion = requiredText(input.policyVersion, 'policy version').trim();
  if (!SCOPES.has(scope)) throw new TypeError(`scope invalid: ${scope}`);
  const documentMetricContext = normalizeMetricContext(
    input.documentMetricContext,
    source.contentSha256,
  );
  const explicitUnitProvenance = normalizeExplicitUnitProvenance(
    input.explicitUnitProvenance,
    source,
  );
  const modelScope = normalizeModelScope(input.modelScope);

  const entries = structuredEntries(input.axisValues) ?? parseEntries(rawTuple);
  const axes = input.axisAmbiguous === true ? 'AXIS_AMBIGUOUS' : axisState(entries, scope);
  const explicitUnit = unitToken(`${rawLabel}\n${rawTuple}\n${explicitUnitProvenance?.rawText ?? ''}`);
  const contextUnit = unitToken(documentMetricContext?.rawText ?? '');
  const inferenceEligible = source.authority === 'OFFICIAL'
    && source.market === 'AU'
    && target.market === 'AU'
    && scope === 'product_closed_candidate'
    && entries.length === 3
    && entries.every((entry) => Number.isInteger(entry.min) && entry.min === entry.max)
    && ['EXPLICIT_DEPTH', 'ORTHOGONAL_LENGTH_AS_DEPTH_HINT'].includes(axes);

  let unitState;
  let effectiveUnit = null;
  if (explicitUnit === 'conflict') unitState = 'UNIT_CONFLICT';
  else if (explicitUnit) {
    unitState = 'EXPLICIT_METRIC';
    effectiveUnit = explicitUnit;
  } else if (contextUnit === 'conflict') unitState = 'UNIT_CONFLICT';
  else if (contextUnit) {
    unitState = 'DOCUMENT_METRIC_CONTEXT';
    effectiveUnit = contextUnit;
  } else if (inferenceEligible) {
    unitState = 'DOMAIN_INFERRED_MM';
    effectiveUnit = 'mm';
  } else unitState = 'UNIT_UNKNOWN';

  const parsedDimensionsMm = convertedDimensions(entries, effectiveUnit);
  let dimensionsMm = parsedDimensionsMm;
  if (dimensionsMm && !plausible(dimensionsMm, scope)) {
    unitState = 'UNIT_CONFLICT';
    dimensionsMm = null;
  }
  if (axes === 'AXIS_AMBIGUOUS') dimensionsMm = null;

  const retailerHints = normalizeRetailerHints(input.retailerHints ?? []);
  const corroboratingHints = unitState === 'DOMAIN_INFERRED_MM'
    ? matchingRetailerHints(retailerHints, dimensionsMm)
    : [];
  if (corroboratingHints.length) unitState = 'RETAILER_HINT_CORROBORATED';

  const semantic = {
    schemaVersion: 1,
    policyVersion,
    source,
    target,
    rawLabel,
    rawTuple,
    scope,
    documentMetricContext,
    ...(explicitUnitProvenance ? { explicitUnitProvenance } : {}),
    ...(input.axisOrder ? { axisOrder: [...input.axisOrder] } : {}),
    ...(modelScope ? { modelScope } : {}),
    unitState,
    axisState: axes,
    parsedTuple: entries.map((entry) => ({ ...entry })),
    dimensionsMm,
    hasRange: dimensionsMm
      ? Object.values(dimensionsMm).some(({ min, max }) => min !== max)
      : false,
    receiptEligible: unitState === 'EXPLICIT_METRIC'
      && axes === 'EXPLICIT_DEPTH'
      && scope === 'product_closed_candidate'
      && source.authority === 'OFFICIAL'
      && source.market === target.market
      && (!modelScope || (modelScope.modelBinding !== 'DOCUMENT_IDENTITY_ONLY'
        && modelScope.boundModels.includes(target.model)))
      && dimensionsMm !== null,
    retailerDiagnostics: {
      ...retailerDiagnostics(retailerHints),
      corroboratingExactAuHints: corroboratingHints.length,
    },
  };
  return Object.freeze({
    observationId: `dimension_unit_observation_${sha256(semantic).slice(0, 24)}`,
    ...semantic,
  });
}
