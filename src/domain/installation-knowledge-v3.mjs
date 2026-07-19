export const INSTALLATION_KNOWLEDGE_SCHEMA_VERSION = 2;

const FIELD_TYPES = Object.freeze({
  'closedEnvelope.widthMm': 'number',
  'closedEnvelope.heightMm': 'height',
  'closedEnvelope.depthMm': 'number',
  'installationClearance.leftMm': 'number',
  'installationClearance.rightMm': 'number',
  'installationClearance.topMm': 'number',
  'installationClearance.rearMm': 'number',
  'installationClearance.frontMm': 'number',
  'operationEnvelope.doorOpenDepthMm': 'number',
  'operationEnvelope.hingeSideSpaceMm': 'number',
  'operationEnvelope.lidOpenHeightMm': 'number',
  'ventilation.leftMm': 'number',
  'ventilation.rightMm': 'number',
  'ventilation.topMm': 'number',
  'ventilation.rearMm': 'number',
  'ventilation.openAreaMm2': 'number',
  'ventilation.minimumRoomVolumeM3': 'number',
  'waterConnection.required': 'boolean',
  'waterConnection.hoseReachMm': 'number',
  'waterConnection.minimumPressureKpa': 'number',
  'waterConnection.maximumPressureKpa': 'number',
  'powerConnection.required': 'boolean',
  'powerConnection.leadReachMm': 'number',
  'powerConnection.voltageV': 'number',
  'powerConnection.minimumVoltageV': 'number',
  'powerConnection.maximumVoltageV': 'number',
  'powerConnection.currentA': 'number',
  'drainConnection.required': 'boolean',
  'drainConnection.hoseReachMm': 'number',
  'drainConnection.minimumHeightMm': 'number',
  'drainConnection.maximumHeightMm': 'number',
  'drainConnection.highLoopRequired': 'boolean',
  'deliveryEnvelope.widthMm': 'number',
  'deliveryEnvelope.heightMm': 'number',
  'deliveryEnvelope.depthMm': 'number',
  'deliveryEnvelope.weightKg': 'number',
  'professionalInstallation.required': 'boolean',
});

const FIELD_UNITS = Object.freeze({
  'ventilation.openAreaMm2': 'mm2',
  'ventilation.minimumRoomVolumeM3': 'm3',
  'waterConnection.minimumPressureKpa': 'kPa',
  'waterConnection.maximumPressureKpa': 'kPa',
  'powerConnection.voltageV': 'V',
  'powerConnection.minimumVoltageV': 'V',
  'powerConnection.maximumVoltageV': 'V',
  'powerConnection.currentA': 'A',
  'deliveryEnvelope.weightKg': 'kg',
});

const BASE_REQUIRED = Object.freeze([
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
  'installationClearance.leftMm',
  'installationClearance.rightMm',
  'installationClearance.topMm',
  'installationClearance.rearMm',
  'powerConnection.required',
  'professionalInstallation.required',
  'deliveryEnvelope.widthMm',
  'deliveryEnvelope.heightMm',
  'deliveryEnvelope.depthMm',
]);

const CATEGORY_REQUIRED = Object.freeze({
  fridge: Object.freeze([
    ...BASE_REQUIRED,
    'ventilation.rearMm',
    'waterConnection.required',
  ]),
  dishwasher: Object.freeze([
    ...BASE_REQUIRED,
    'operationEnvelope.doorOpenDepthMm',
    'ventilation.rearMm',
    'waterConnection.required',
    'drainConnection.required',
  ]),
  washing_machine: Object.freeze([
    ...BASE_REQUIRED,
    'ventilation.rearMm',
    'waterConnection.required',
    'drainConnection.required',
  ]),
  dryer: Object.freeze([
    ...BASE_REQUIRED,
    'ventilation.rearMm',
    'drainConnection.required',
  ]),
});

const CATEGORY_FORM_FACTORS = Object.freeze({
  fridge: new Set(['upright', 'chest']),
  dishwasher: new Set(['built_in', 'freestanding', 'integrated', 'drawer']),
  washing_machine: new Set(['front_loader', 'top_loader', 'washer_dryer_combo']),
  dryer: new Set(['front_loader']),
});

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freezeDeep(item);
  }
  return value;
}

export const INSTALLATION_KNOWLEDGE_APPLICABILITY_MATRIX = freezeDeep({
  schemaVersion: INSTALLATION_KNOWLEDGE_SCHEMA_VERSION,
  fieldGroups: {
    placement: ['closedEnvelope', 'installationClearance'],
    operation: ['operationEnvelope'],
    service: ['ventilation'],
    connections: ['waterConnection', 'powerConnection', 'drainConnection'],
    delivery: ['deliveryEnvelope'],
    professional: ['professionalInstallation'],
  },
  categories: Object.fromEntries(Object.entries(CATEGORY_REQUIRED).map(([category, fields]) => [
    category,
    {
      requiredFields: [...fields],
      formFactors: [...CATEGORY_FORM_FACTORS[category]],
      formFactorRequirements: category === 'fridge'
        ? {
          upright: ['operationEnvelope.doorOpenDepthMm', 'operationEnvelope.hingeSideSpaceMm'],
          chest: ['operationEnvelope.lidOpenHeightMm'],
        }
        : category === 'washing_machine'
          ? {
            front_loader: ['operationEnvelope.doorOpenDepthMm'],
            top_loader: ['operationEnvelope.lidOpenHeightMm'],
            washer_dryer_combo: ['operationEnvelope.doorOpenDepthMm'],
          }
          : category === 'dryer'
            ? { front_loader: ['operationEnvelope.doorOpenDepthMm'] }
            : {},
      connectionDependencies: {
        water: [
          'waterConnection.hoseReachMm',
          'waterConnection.minimumPressureKpa',
          'waterConnection.maximumPressureKpa',
        ],
        power: [
          'powerConnection.leadReachMm',
          'powerConnection.voltage',
          'powerConnection.currentA',
        ],
        drain: [
          'drainConnection.hoseReachMm',
          'drainConnection.minimumHeightMm',
          'drainConnection.maximumHeightMm',
          'drainConnection.highLoopRequired',
        ],
      },
    },
  ])),
});

function modelKey(value) {
  return String(value ?? '').normalize('NFKC').toUpperCase().replace(/[\s._-]+/g, '');
}

function validateValue(type, value, field) {
  if (type === 'boolean') {
    if (typeof value !== 'boolean') throw new TypeError(`${field} must be boolean`);
    return value;
  }
  if (type === 'height' && value && typeof value === 'object') {
    const minimumMm = value.minimumMm;
    const maximumMm = value.maximumMm;
    if (![minimumMm, maximumMm].every((item) => Number.isFinite(item) && item >= 0) || minimumMm > maximumMm) {
      throw new TypeError(`${field} height range is invalid`);
    }
    return { minimumMm, maximumMm };
  }
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${field} must be a non-negative number`);
  return value;
}

function validateEvidence(evidence, targetModel, field) {
  if (!evidence || typeof evidence !== 'object') throw new TypeError(`${field} exact-model evidence is required`);
  const url = new URL(evidence.sourceUrl);
  if (url.protocol !== 'https:') throw new TypeError(`${field} evidence source must use HTTPS`);
  if (!/^[a-f0-9]{64}$/.test(evidence.artifactSha256 ?? '')) throw new TypeError(`${field} evidence artifact SHA-256 is required`);
  if (!/^[a-f0-9]{64}$/.test(evidence.receiptBindingSha256 ?? '')) throw new TypeError(`${field} receipt binding SHA-256 is required`);
  if (!/^[a-f0-9]{64}$/.test(evidence.fragmentSha256 ?? '')) throw new TypeError(`${field} fragment SHA-256 is required`);
  if (!evidence.locator || typeof evidence.locator !== 'object') throw new TypeError(`${field} evidence locator is required`);
  if (typeof evidence.quote !== 'string' || evidence.quote.trim() === '') throw new TypeError(`${field} evidence quote is required`);
  if (evidence.identityOutcome !== 'exact') throw new TypeError(`${field} requires exact model identity`);
  if (evidence.sourceStatus !== 'current') throw new TypeError(`${field} evidence source must be current, not superseded`);
  const applicable = new Set((evidence.applicableModels ?? []).map(modelKey));
  if (!applicable.has(modelKey(targetModel))) throw new TypeError(`${field} evidence is not applicable to the exact model`);
  const observedAt = new Date(evidence.observedAt);
  if (Number.isNaN(observedAt.getTime())) throw new TypeError(`${field} evidence observedAt is invalid`);
  return {
    sourceUrl: url.toString(),
    artifactSha256: evidence.artifactSha256,
    receiptBindingSha256: evidence.receiptBindingSha256,
    fragmentSha256: evidence.fragmentSha256,
    locator: { ...evidence.locator },
    quote: evidence.quote.trim(),
    applicableModels: [...new Set(evidence.applicableModels)].sort(),
    identityOutcome: 'exact',
    sourceStatus: 'current',
    observedAt: observedAt.toISOString(),
  };
}

export function createModelRequirement({ field, value, unit = null, applicability = 'required', evidence, targetModel }) {
  const type = FIELD_TYPES[field];
  if (!type) throw new TypeError(`unsupported installation knowledge field: ${field}`);
  if (!['required', 'optional', 'not_applicable', 'unknown'].includes(applicability)) {
    throw new TypeError(`${field} applicability is invalid`);
  }
  if (applicability === 'unknown') {
    if (value !== null && value !== undefined) throw new TypeError(`${field} unknown applicability cannot carry a value`);
    if (evidence) throw new TypeError(`${field} unknown applicability cannot carry accepted evidence`);
    return freezeDeep({ field, value: null, unit: null, applicability, evidence: null, evidenceClass: 'unknown' });
  }
  if (applicability === 'not_applicable') {
    if (value !== null && value !== undefined) throw new TypeError(`${field} non-applicable requirement cannot carry a value`);
    return freezeDeep({
      field,
      value: null,
      unit: null,
      applicability,
      evidence: validateEvidence(evidence, targetModel, field),
      evidenceClass: 'exact_model',
    });
  }
  const expectedUnit = type === 'boolean' ? null : (FIELD_UNITS[field] ?? 'mm');
  if (unit !== expectedUnit) throw new TypeError(`${field} unit must be ${expectedUnit ?? 'null'}`);
  return freezeDeep({
    field,
    value: validateValue(type, value, field),
    unit,
    applicability,
    evidence: validateEvidence(evidence, targetModel, field),
    evidenceClass: 'exact_model',
  });
}

export function createInstallationKnowledge({
  canonicalProductId,
  category,
  brand,
  model,
  formFactor = null,
  formFactorEvidence = null,
  requirements = {},
  normativeRules = [],
}) {
  if (!CATEGORY_REQUIRED[category]) throw new TypeError(`unsupported installation knowledge category: ${category}`);
  if (typeof canonicalProductId !== 'string' || canonicalProductId === '') throw new TypeError('canonicalProductId is required');
  if (typeof brand !== 'string' || brand === '' || typeof model !== 'string' || model === '') throw new TypeError('brand and model are required');
  if (formFactor !== null && !CATEGORY_FORM_FACTORS[category].has(formFactor)) throw new TypeError(`unsupported ${category} form factor: ${formFactor}`);
  if (formFactor === null && formFactorEvidence !== null) throw new TypeError('form-factor evidence cannot exist without a form factor');
  const accepted = {};
  for (const [field, requirement] of Object.entries(requirements)) {
    if (requirement === undefined) continue;
    if (!requirement || requirement.field !== field) throw new TypeError(`${field} requirement contract mismatch`);
    accepted[field] = requirement;
  }
  return freezeDeep({
    schemaVersion: INSTALLATION_KNOWLEDGE_SCHEMA_VERSION,
    canonicalProductId,
    category,
    brand,
    model,
    formFactor,
    formFactorEvidence: formFactorEvidence === null ? null : validateEvidence(formFactorEvidence, model, 'formFactor'),
    requirements: Object.fromEntries(Object.entries(accepted).sort(([left], [right]) => left.localeCompare(right))),
    normativeRules: normativeRules.map((rule) => ({ ...rule })),
  });
}

function requiredFields(knowledge) {
  const fields = [...CATEGORY_REQUIRED[knowledge.category]];
  if (knowledge.formFactor) fields.push('formFactorEvidence');
  if (knowledge.category === 'fridge') {
    if (knowledge.formFactor === 'chest') fields.push('operationEnvelope.lidOpenHeightMm');
    else if (knowledge.formFactor) fields.push('operationEnvelope.doorOpenDepthMm', 'operationEnvelope.hingeSideSpaceMm');
    else fields.push('formFactor');
  } else if (knowledge.category === 'washing_machine') {
    if (knowledge.formFactor === 'top_loader') fields.push('operationEnvelope.lidOpenHeightMm');
    else if (knowledge.formFactor) fields.push('operationEnvelope.doorOpenDepthMm');
    else fields.push('formFactor');
  } else if (knowledge.category === 'dryer') {
    if (knowledge.formFactor) fields.push('operationEnvelope.doorOpenDepthMm');
    else fields.push('formFactor');
  } else if (!knowledge.formFactor) {
    fields.push('formFactor');
  }
  const water = knowledge.requirements['waterConnection.required'];
  if (water?.value === true) fields.push('waterConnection.hoseReachMm', 'waterConnection.minimumPressureKpa', 'waterConnection.maximumPressureKpa');
  const power = knowledge.requirements['powerConnection.required'];
  if (power?.value === true) fields.push(
    'powerConnection.leadReachMm',
    'powerConnection.voltage',
    'powerConnection.currentA',
  );
  const drain = knowledge.requirements['drainConnection.required'];
  if (drain?.value === true) fields.push(
    'drainConnection.hoseReachMm',
    'drainConnection.minimumHeightMm',
    'drainConnection.maximumHeightMm',
    'drainConnection.highLoopRequired',
  );
  return [...new Set(fields)].sort();
}

export function auditInstallationKnowledge(knowledge) {
  if (!knowledge || !CATEGORY_REQUIRED[knowledge.category]) throw new TypeError('valid installation knowledge is required');
  const required = requiredFields(knowledge);
  const missingRequired = required.filter((field) => {
    if (field === 'formFactor') return !knowledge.formFactor;
    if (field === 'formFactorEvidence') return !knowledge.formFactorEvidence;
    if (field === 'powerConnection.voltage') {
      const scalar = knowledge.requirements['powerConnection.voltageV'];
      const minimum = knowledge.requirements['powerConnection.minimumVoltageV'];
      const maximum = knowledge.requirements['powerConnection.maximumVoltageV'];
      const scalarKnown = scalar?.applicability === 'required' && Number.isFinite(scalar.value);
      const rangeKnown = minimum?.applicability === 'required' && Number.isFinite(minimum.value)
        && maximum?.applicability === 'required' && Number.isFinite(maximum.value);
      return !scalarKnown && !rangeKnown;
    }
    const requirement = knowledge.requirements[field];
    return !requirement || requirement.applicability !== 'required'
      || (requirement.value === null && INSTALLATION_KNOWLEDGE_FIELDS[field] !== 'boolean');
  });
  const evidenceViolations = Object.entries(knowledge.requirements).flatMap(([field, requirement]) => {
    if (requirement.applicability === 'unknown') return [];
    if (requirement.evidenceClass !== 'exact_model'
      || requirement.evidence?.identityOutcome !== 'exact'
      || requirement.evidence?.sourceStatus !== 'current'
      || !/^[a-f0-9]{64}$/.test(requirement.evidence?.receiptBindingSha256 ?? '')
      || !/^[a-f0-9]{64}$/.test(requirement.evidence?.fragmentSha256 ?? '')) return [field];
    if (!(requirement.evidence.applicableModels ?? []).map(modelKey).includes(modelKey(knowledge.model))) return [field];
    return [];
  });
  const ranges = [
    ['waterConnection.minimumPressureKpa', 'waterConnection.maximumPressureKpa', 'waterConnection.pressureRange'],
    ['powerConnection.minimumVoltageV', 'powerConnection.maximumVoltageV', 'powerConnection.voltageRange'],
    ['drainConnection.minimumHeightMm', 'drainConnection.maximumHeightMm', 'drainConnection.heightRange'],
  ];
  for (const [minimumField, maximumField, label] of ranges) {
    const minimum = knowledge.requirements[minimumField]?.value;
    const maximum = knowledge.requirements[maximumField]?.value;
    if (Number.isFinite(minimum) && Number.isFinite(maximum) && minimum > maximum) evidenceViolations.push(label);
  }
  return freezeDeep({
    requiredFields: required,
    missingRequired,
    evidenceViolations: [...new Set(evidenceViolations)].sort(),
    eligibleForVerifiedFit: missingRequired.length === 0 && evidenceViolations.length === 0,
  });
}

export const INSTALLATION_KNOWLEDGE_FIELDS = FIELD_TYPES;
export const INSTALLATION_KNOWLEDGE_REQUIRED_FIELDS = CATEGORY_REQUIRED;
