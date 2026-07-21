import { auditInstallationKnowledge } from './installation-knowledge-v3.mjs';

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freezeDeep(item);
  }
  return value;
}

function value(knowledge, field) {
  return knowledge.requirements[field]?.value ?? null;
}

function heightMaximum(input) {
  return input && typeof input === 'object' ? input.maximumMm : input;
}

function numericCheck({ id, required, available, fields, unknownReason }) {
  if (!Number.isFinite(required) || !Number.isFinite(available)) {
    return { id, status: 'UNKNOWN', required: Number.isFinite(required) ? required : null, available: Number.isFinite(available) ? available : null, marginMm: null, fields, reason: unknownReason };
  }
  const marginMm = available - required;
  return { id, status: marginMm >= 0 ? 'PASS' : 'FAIL', required, available, marginMm, fields, reason: marginMm >= 0 ? `${id} has ${marginMm} mm conservative margin` : `${id} is short by ${Math.abs(marginMm)} mm` };
}

function booleanCheck({ id, required, actual, fields, unknownReason }) {
  if (required === false) return { id, status: 'NOT_APPLICABLE', required: false, actual: actual ?? null, fields, reason: `${id} is not applicable to this model` };
  if (required !== true || typeof actual !== 'boolean') return { id, status: 'UNKNOWN', required: required ?? null, actual: actual ?? null, fields, reason: unknownReason };
  return { id, status: actual ? 'PASS' : 'FAIL', required: true, actual, fields, reason: actual ? `${id} requirement is satisfied` : `${id} requirement is not satisfied` };
}

function rangeCheck({ id, actual, minimum, maximum, fields, unknownReason, unit }) {
  if (![actual, minimum, maximum].every(Number.isFinite)) {
    return { id, status: 'UNKNOWN', actual: Number.isFinite(actual) ? actual : null, minimum: Number.isFinite(minimum) ? minimum : null, maximum: Number.isFinite(maximum) ? maximum : null, fields, reason: unknownReason };
  }
  const passed = actual >= minimum && actual <= maximum;
  return { id, status: passed ? 'PASS' : 'FAIL', actual, minimum, maximum, fields, reason: passed ? `${id} is within the ${minimum}-${maximum} ${unit} requirement` : `${id} ${actual} ${unit} is outside the ${minimum}-${maximum} ${unit} requirement` };
}

function nominalCheck({ id, required, actual, fields, unknownReason, unit }) {
  if (![required, actual].every(Number.isFinite)) {
    return { id, status: 'UNKNOWN', required: Number.isFinite(required) ? required : null, actual: Number.isFinite(actual) ? actual : null, fields, reason: unknownReason };
  }
  if (actual === required) {
    return { id, status: 'PASS', required, actual, fields, reason: `${id} matches the exact ${required} ${unit} nominal evidence` };
  }
  return { id, status: 'UNKNOWN', required, actual, fields, reason: `${id} differs from the nominal value and no exact supported range is evidenced` };
}

function voltageCheck(knowledge, siteProfile) {
  const nominal = value(knowledge, 'powerConnection.voltageV');
  if (Number.isFinite(nominal)) return nominalCheck({
    id: 'powerConnection.voltage',
    required: nominal,
    actual: siteProfile?.power?.voltageV,
    fields: ['powerConnection.voltageV', 'power.voltageV'],
    unknownReason: 'required or available voltage is unknown',
    unit: 'V',
  });
  return rangeCheck({
    id: 'powerConnection.voltage',
    actual: siteProfile?.power?.voltageV,
    minimum: value(knowledge, 'powerConnection.minimumVoltageV'),
    maximum: value(knowledge, 'powerConnection.maximumVoltageV'),
    fields: ['powerConnection.minimumVoltageV', 'powerConnection.maximumVoltageV', 'power.voltageV'],
    unknownReason: 'required voltage range or available voltage is unknown',
    unit: 'V',
  });
}

function checkConnection({ knowledge, siteProfile, prefix, distanceField, accessField, accessLabel }) {
  const required = value(knowledge, `${prefix}.required`);
  if (required === false) return [{ id: `${prefix}.required`, status: 'NOT_APPLICABLE', fields: [`${prefix}.required`], reason: `${prefix} is not required` }];
  if (required !== true) return [{ id: `${prefix}.required`, status: 'UNKNOWN', fields: [`${prefix}.required`], reason: `${prefix} applicability is unknown` }];
  const reach = value(knowledge, `${prefix}.hoseReachMm`) ?? value(knowledge, `${prefix}.leadReachMm`);
  const distance = siteProfile[prefix.replace('Connection', '')]?.[distanceField];
  const checks = [numericCheck({
    id: `${prefix}.reach`,
    required: distance,
    available: reach,
    fields: [`${prefix}.${prefix === 'powerConnection' ? 'leadReachMm' : 'hoseReachMm'}`, `${prefix.replace('Connection', '')}.${distanceField}`],
    unknownReason: `${prefix} reach or site distance is unknown`,
  })];
  if (accessField) checks.push(booleanCheck({
    id: `${prefix}.${accessLabel}`,
    required: true,
    actual: siteProfile[prefix.replace('Connection', '')]?.[accessField],
    fields: [`${prefix.replace('Connection', '')}.${accessField}`],
    unknownReason: `${prefix} ${accessLabel} site observation is unknown`,
  }));
  return checks;
}

function operationChecks(knowledge, siteProfile, conservative) {
  const opensUpward = (knowledge.category === 'fridge' && knowledge.formFactor === 'chest')
    || (knowledge.category === 'washing_machine' && knowledge.formFactor === 'top_loader');
  if (opensUpward) return [numericCheck({
    id: 'operation.lidOpenHeight',
    required: value(knowledge, 'operationEnvelope.lidOpenHeightMm'),
    available: conservative(siteProfile?.operation?.overheadClearanceMm),
    fields: ['operationEnvelope.lidOpenHeightMm', 'operation.overheadClearanceMm'],
    unknownReason: 'lid-open height or overhead clearance is unknown',
  })];
  const checks = [numericCheck({
    id: 'operation.doorOpenDepth',
    required: value(knowledge, 'operationEnvelope.doorOpenDepthMm'),
    available: conservative(siteProfile?.operation?.frontWorkingDepthMm),
    fields: ['operationEnvelope.doorOpenDepthMm', 'operation.frontWorkingDepthMm'],
    unknownReason: 'door-open envelope or front working depth is unknown',
  })];
  if (knowledge.category === 'fridge') checks.push(numericCheck({
    id: 'operation.hingeSide',
    required: value(knowledge, 'operationEnvelope.hingeSideSpaceMm'),
    available: conservative(siteProfile?.operation?.hingeSideClearanceMm),
    fields: ['operationEnvelope.hingeSideSpaceMm', 'operation.hingeSideClearanceMm'],
    unknownReason: 'hinge-side envelope or site side clearance is unknown',
  }));
  return checks;
}

export function evaluateFitV3({ knowledge, siteProfile }) {
  const audit = auditInstallationKnowledge(knowledge);
  const uncertainty = Number.isFinite(siteProfile?.measurementUncertaintyMm) && siteProfile.measurementUncertaintyMm >= 0
    ? siteProfile.measurementUncertaintyMm
    : null;
  const conservative = (measurement) => Number.isFinite(measurement) && uncertainty !== null ? measurement - uncertainty : null;
  const maximumKnown = (...requirements) => Math.max(...requirements.filter(Number.isFinite));
  const leftSpace = maximumKnown(
    value(knowledge, 'installationClearance.leftMm'),
    value(knowledge, 'ventilation.leftMm'),
  );
  const rightSpace = maximumKnown(
    value(knowledge, 'installationClearance.rightMm'),
    value(knowledge, 'ventilation.rightMm'),
  );
  const widthRequired = [
    value(knowledge, 'closedEnvelope.widthMm'),
    leftSpace,
    rightSpace,
  ].every(Number.isFinite) ? value(knowledge, 'closedEnvelope.widthMm') + leftSpace + rightSpace : null;
  const height = heightMaximum(value(knowledge, 'closedEnvelope.heightMm'));
  const topSpace = maximumKnown(
    value(knowledge, 'installationClearance.topMm'),
    value(knowledge, 'ventilation.topMm'),
  );
  const heightRequired = [height, topSpace].every(Number.isFinite) ? height + topSpace : null;
  const rearTerms = [
    value(knowledge, 'installationClearance.rearMm'),
    value(knowledge, 'ventilation.rearMm'),
  ];
  const depth = value(knowledge, 'closedEnvelope.depthMm');
  const depthRequired = Number.isFinite(depth) && rearTerms.every(Number.isFinite) ? depth + Math.max(...rearTerms) : null;

  const waterRequired = value(knowledge, 'waterConnection.required');
  const powerRequired = value(knowledge, 'powerConnection.required');
  const drainRequired = value(knowledge, 'drainConnection.required');

  const checks = [
    numericCheck({ id: 'placement.width', required: widthRequired, available: conservative(siteProfile?.cavity?.widthMm), fields: ['closedEnvelope.widthMm', 'installationClearance.leftMm', 'installationClearance.rightMm', 'ventilation.leftMm', 'ventilation.rightMm', 'cavity.widthMm'], unknownReason: 'product width clearances, cavity width, or measurement uncertainty is unknown' }),
    numericCheck({ id: 'placement.height', required: heightRequired, available: conservative(siteProfile?.cavity?.heightMm), fields: ['closedEnvelope.heightMm', 'installationClearance.topMm', 'ventilation.topMm', 'cavity.heightMm'], unknownReason: 'product height range, top clearance, cavity height, or measurement uncertainty is unknown' }),
    numericCheck({ id: 'placement.depth', required: depthRequired, available: conservative(siteProfile?.cavity?.depthMm), fields: ['closedEnvelope.depthMm', 'installationClearance.rearMm', 'ventilation.rearMm', 'cavity.depthMm'], unknownReason: 'product depth, rear space, cavity depth, or measurement uncertainty is unknown' }),
    ...operationChecks(knowledge, siteProfile, conservative),
    ...checkConnection({ knowledge, siteProfile, prefix: 'waterConnection', distanceField: 'pointDistanceMm', accessField: 'isolationAccessible', accessLabel: 'isolationAccess' }),
    ...(waterRequired === true ? [rangeCheck({
      id: 'waterConnection.pressure',
      actual: siteProfile?.water?.pressureKpa,
      minimum: value(knowledge, 'waterConnection.minimumPressureKpa'),
      maximum: value(knowledge, 'waterConnection.maximumPressureKpa'),
      fields: ['waterConnection.minimumPressureKpa', 'waterConnection.maximumPressureKpa', 'water.pressureKpa'],
      unknownReason: 'water pressure requirement or site pressure is unknown',
      unit: 'kPa',
    })] : []),
    ...checkConnection({ knowledge, siteProfile, prefix: 'powerConnection', distanceField: 'socketDistanceMm', accessField: 'socketAccessible', accessLabel: 'socketAccess' }),
    ...(powerRequired === true ? [
      voltageCheck(knowledge, siteProfile),
      numericCheck({
        id: 'powerConnection.current',
        required: value(knowledge, 'powerConnection.currentA'),
        available: siteProfile?.power?.availableCurrentA,
        fields: ['powerConnection.currentA', 'power.availableCurrentA'],
        unknownReason: 'required or available current is unknown',
      }),
    ] : []),
    ...checkConnection({ knowledge, siteProfile, prefix: 'drainConnection', distanceField: 'pointDistanceMm', accessField: 'routeAvailable', accessLabel: 'route' }),
    ...(drainRequired === true ? [
      rangeCheck({
        id: 'drainConnection.height',
        actual: siteProfile?.drain?.connectionHeightMm,
        minimum: value(knowledge, 'drainConnection.minimumHeightMm'),
        maximum: value(knowledge, 'drainConnection.maximumHeightMm'),
        fields: ['drainConnection.minimumHeightMm', 'drainConnection.maximumHeightMm', 'drain.connectionHeightMm'],
        unknownReason: 'drain height requirement or site connection height is unknown',
        unit: 'mm',
      }),
      booleanCheck({
        id: 'drainConnection.highLoop',
        required: value(knowledge, 'drainConnection.highLoopRequired'),
        actual: siteProfile?.drain?.highLoopPresent,
        fields: ['drainConnection.highLoopRequired', 'drain.highLoopPresent'],
        unknownReason: 'drain high-loop requirement or site observation is unknown',
      }),
    ] : []),
    numericCheck({ id: 'delivery.width', required: value(knowledge, 'deliveryEnvelope.widthMm'), available: conservative(siteProfile?.delivery?.minimumDoorwayWidthMm), fields: ['deliveryEnvelope.widthMm', 'delivery.minimumDoorwayWidthMm'], unknownReason: 'packaged width or minimum doorway width is unknown' }),
    numericCheck({ id: 'delivery.height', required: value(knowledge, 'deliveryEnvelope.heightMm'), available: conservative(siteProfile?.delivery?.minimumDoorwayHeightMm), fields: ['deliveryEnvelope.heightMm', 'delivery.minimumDoorwayHeightMm'], unknownReason: 'packaged height or minimum doorway height is unknown' }),
    numericCheck({ id: 'delivery.depth', required: value(knowledge, 'deliveryEnvelope.depthMm'), available: conservative(siteProfile?.delivery?.minimumPathDepthMm), fields: ['deliveryEnvelope.depthMm', 'delivery.minimumPathDepthMm'], unknownReason: 'packaged depth or minimum path depth is unknown' }),
    booleanCheck({ id: 'professionalInstallation', required: value(knowledge, 'professionalInstallation.required'), actual: siteProfile?.professionalInstallation?.available, fields: ['professionalInstallation.required', 'professionalInstallation.available'], unknownReason: 'professional installation availability is unknown' }),
  ];

  const failures = checks.filter((check) => check.status === 'FAIL');
  const placementUnknown = checks.filter((check) => check.id.startsWith('placement.') && check.status === 'UNKNOWN');
  const unknown = checks.filter((check) => check.status === 'UNKNOWN');
  const estimatedFields = [...new Set([
    ...(siteProfile?.estimatedFields ?? []),
    ...(uncertainty !== null && uncertainty > 5 ? ['measurementUncertaintyMm'] : []),
  ])].sort();
  const siteInputGaps = [...new Set(checks.filter((check) => check.status === 'UNKNOWN').flatMap((check) => check.fields.filter((field) => /^(?:cavity|operation|water\.|power\.|drain\.|delivery\.|professionalInstallation\.)/.test(field))))].sort();
  let outcome;
  if (failures.length > 0) outcome = 'NO_FIT';
  else if (placementUnknown.length > 0) outcome = 'INSUFFICIENT_DATA';
  else if (unknown.length > 0 || !audit.eligibleForVerifiedFit) outcome = 'CONDITIONAL_FIT';
  else if (estimatedFields.length > 0) outcome = 'LIKELY_FIT_ESTIMATED';
  else outcome = 'VERIFIED_FIT';
  const firstIssue = failures[0] ?? placementUnknown[0] ?? unknown[0];
  const summary = firstIssue?.reason ?? (outcome === 'VERIFIED_FIT'
    ? 'All applicable hard constraints passed with exact-model receipts and precise site inputs'
    : 'All tested constraints passed using one or more estimated inputs');
  return freezeDeep({
    schemaVersion: 1,
    engine: 'fit-v3-shadow',
    outcome,
    summary,
    checks,
    productEvidenceGaps: audit.missingRequired,
    evidenceViolations: audit.evidenceViolations,
    siteInputGaps,
    estimatedFields,
    publicationEligible: false,
  });
}
