import { createRequire } from 'node:module';

import { FIT_RELATIONS_V4 } from '../fit-relation-v4.mjs';
import { FIT_V4_FIELD_MAP_VERSION, validateFitV4FieldMap } from '../fit-v4-contract.mjs';
import { SITE_PROFILE_V4_SUBJECTS } from '../site-profile-v4.mjs';
import { DISHWASHER_POLICY_DEFINITION_V4 } from './dishwasher.mjs';
import { DRYER_POLICY_DEFINITION_V4 } from './dryer.mjs';
import { REFRIGERATOR_POLICY_DEFINITION_V4 } from './fridge.mjs';
import { WASHING_MACHINE_POLICY_DEFINITION_V4 } from './washing-machine.mjs';

const require = createRequire(import.meta.url);
const rawFieldMap = require('../../../data/architecture-v2/policies/fit-v4-field-map.json');

export const FIT_POLICY_PACK_SCHEMA_VERSION = 1;
export const FIT_POLICY_PACK_VERSION = 'fit-v4-policy-pack-1.1.0';

const DEFINITIONS = Object.freeze([
  REFRIGERATOR_POLICY_DEFINITION_V4,
  DISHWASHER_POLICY_DEFINITION_V4,
  WASHING_MACHINE_POLICY_DEFINITION_V4,
  DRYER_POLICY_DEFINITION_V4,
]);
const QUANTIFIERS = new Set(['FIXED_SELECTED', 'INSTALLER_SELECTABLE', 'UNKNOWN_FIXED', 'PROHIBITED']);
const COMPOSITION_OPERATORS = new Set(['SEPARATE', 'MAX', 'SUM']);
const DISPOSITIONS = Object.freeze(['EVALUATED', 'ADVISORY', 'EXCLUDED']);
const RELATIONS = new Set(FIT_RELATIONS_V4);
const TOWER_FORM_FACTOR = 'washtower_combo';

const RELATION_OVERRIDES = Object.freeze({
  'envelope.adjusted.heightRange': 'WITHIN_RANGE',
  'envelope.panel.extent': 'CONTAINS',
  'operation.component.removalZone': 'CONTAINS',
  'power.socket.prohibitedZone': 'NO_INTERSECTION',
  'dishwasher.serviceHole.permittedZone': 'REQUIRED_CONTAINS',
  'delivery.turningEnvelope': 'CONTAINS',
});
const SITE_SUBJECTS_BY_FIELD = Object.freeze({
  'envelope.closed.width': 'cavity.width',
  'envelope.closed.height': 'cavity.height',
  'envelope.closed.depth': 'cavity.depth',
  'envelope.body.width': 'cavity.width',
  'envelope.body.height': 'cavity.height',
  'envelope.body.depth': 'cavity.depth',
  'envelope.adjusted.heightRange': 'cavity.height',
  'envelope.door.closedDepth': 'cavity.depth',
  'envelope.handle.depth': 'cavity.depth',
  'envelope.panel.extent': 'cavity.availableVolume',
  'envelope.trim.extent': 'cavity.availableVolume',
  'installation.clearance.leftMin': 'placement.leftGap',
  'installation.clearance.rightMin': 'placement.rightGap',
  'installation.clearance.topMin': 'placement.topGap',
  'installation.clearance.rearMin': 'placement.rearGap',
  'installation.clearance.rearMax': 'placement.rearGap',
  'installation.niche.widthRange': 'cavity.width',
  'installation.niche.heightRange': 'cavity.height',
  'installation.niche.depthMin': 'cavity.depth',
  'operation.door.openDepth': 'operation.door.availableDepth',
  'operation.door.openAngle': 'operation.door.availableAngle',
  'operation.door.sweep': 'operation.door.zone',
  'operation.hinge.sideClearance': 'operation.hinge.availableSideGap',
  'operation.lid.openHeight': 'operation.lid.availableHeight',
  'operation.component.removalZone': 'operation.component.availableRemovalZone',
  'ventilation.left.minimum': 'placement.leftGap',
  'ventilation.right.minimum': 'placement.rightGap',
  'ventilation.top.minimum': 'placement.topGap',
  'ventilation.rear.minimum': 'placement.rearGap',
  'ventilation.openArea.minimum': 'ventilation.openArea',
  'ventilation.roomVolume.minimum': 'environment.roomVolume',
  'water.connection.type': 'service.water.connectionType',
  'water.connection.fitting': 'service.water.connector',
  'water.connection.pressureRange': 'service.water.pressure',
  'water.connection.temperatureRange': 'service.water.temperature',
  'water.hose.maximumLength': 'service.water.routeLength',
  'water.route.permittedZone': 'service.water.route',
  'water.isolation.accessRequired': 'service.isolation.access',
  'power.connection.type': 'service.power.connectionType',
  'power.connection.voltageRange': 'service.power.voltage',
  'power.connection.currentMinimum': 'service.power.currentCapacity',
  'power.connection.circuitDedicated': 'professional.dedicatedCircuit.confirmed',
  'power.lead.maximumLength': 'service.power.routeLength',
  'power.socket.permittedZone': 'service.power.socketZone',
  'power.socket.prohibitedZone': 'service.power.socketZone',
  'power.socket.accessRequired': 'service.power.access',
  'drain.connection.type': 'service.drain.connectionType',
  'drain.connection.diameterRange': 'service.drain.connectionDiameter',
  'drain.connection.heightRange': 'service.drain.connectionHeight',
  'drain.hose.maximumLength': 'service.drain.routeLength',
  'drain.route.permittedZone': 'service.drain.route',
  'drain.route.kinkProhibited': 'service.drain.kinkFree',
  'drain.highLoop.required': 'service.drain.highLoop',
  'drain.insertion.depthRange': 'service.drain.insertionDepth',
  'drain.fall.minimum': 'service.drain.fall',
  'drain.backflow.protection': 'service.drain.backflowProtection',
  'cabinet.support.levelRequired': 'support.level.confirmed',
  'cabinet.support.squareRequired': 'support.square.confirmed',
  'cabinet.support.minimumLoad': 'support.load.capacity',
  'stability.anchoring.required': 'professional.anchoring.confirmed',
  'stability.transitBolts.removalRequired': 'professional.transitBoltsRemoved.confirmed',
  'environment.ambientTemperatureRange': 'environment.ambientTemperature',
  'environment.location.prohibited': 'environment.location',
  'dishwasher.panel.weightRange': 'component.dishwasher.panel.weight',
  'dishwasher.panel.heightRange': 'component.dishwasher.panel.height',
  'dishwasher.toeKick.depthRange': 'operation.dishwasher.toeKickDepth',
  'dishwasher.condensation.gapMinimum': 'placement.topGap',
  'dishwasher.serviceHole.minimumDiameter': 'service.hole.diameter',
  'dishwasher.serviceHole.permittedZone': 'service.hole.zone',
  'stacking.total.height': 'cavity.height',
  'stacking.support.minimumLoad': 'support.load.capacity',
  'dryer.duct.diameter': 'service.dryer.duct.diameter',
  'dryer.duct.maximumLength': 'service.dryer.duct.length',
  'dryer.duct.maximumElbows': 'service.dryer.duct.elbowCount',
  'dryer.duct.terminationType': 'service.dryer.duct.terminationType',
  'delivery.package.width': 'delivery.path.minimumWidth',
  'delivery.package.height': 'delivery.path.minimumHeight',
  'delivery.package.depth': 'delivery.path.minimumDepth',
  'delivery.package.weight': 'delivery.path.loadCapacity',
  'delivery.removableComponents': 'delivery.path.permittedRemovals',
  'delivery.turningEnvelope': 'delivery.path.turningZone',
});
const CONFIGURATION_ENDPOINTS_BY_FIELD = Object.freeze({
  'stacking.kit.exactId': Object.freeze({ configurationVariable: 'stackingKitId', valueType: 'string' }),
  'stacking.companion.exactModel': Object.freeze({ configurationVariable: 'companionModel', valueType: 'string' }),
  'dryer.technology': Object.freeze({ configurationVariable: 'dryerTechnology', valueType: 'enum' }),
  'dryer.condensate.mode': Object.freeze({ configurationVariable: 'drainMode', valueType: 'enum' }),
});

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function same(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} required`);
  return value;
}

function uniqueStrings(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new TypeError(`${label} non-empty string array required`);
  }
  if (new Set(value).size !== value.length) throw new TypeError(`${label} contains duplicates`);
  return value;
}

function selectorRows(selectorDomains) {
  let rows = [{}];
  for (const selector of selectorDomains) {
    rows = rows.flatMap((row) => selector.values.map((value) => ({ ...row, [selector.name]: value })));
  }
  return rows;
}

function availableEndpoints(field) {
  const configuration = CONFIGURATION_ENDPOINTS_BY_FIELD[field.id];
  if (configuration) {
    const contextPath = `configuration.${configuration.configurationVariable}`;
    if (!field.contextPaths.includes(contextPath)) throw new TypeError(`configuration endpoint is outside field context: ${field.id}`);
    return [{
      source: 'selected_configuration', contextPath,
      configurationVariable: configuration.configurationVariable,
      valueType: configuration.valueType, unit: field.value.unit,
    }];
  }

  const subject = SITE_SUBJECTS_BY_FIELD[field.id];
  const contract = SITE_PROFILE_V4_SUBJECTS[subject];
  const contextPaths = field.contextPaths.filter((path) => path.startsWith('site.') && path !== 'site.delivery.selected');
  if (!contract || contextPaths.length !== 1) throw new TypeError(`field has no unambiguous typed Site Profile endpoint: ${field.id}`);
  return [{
    source: 'site_profile_v4', contextPath: contextPaths[0], subject,
    valueType: contract.valueType, unit: contract.unit,
  }];
}

function comparisonFor(fieldMap, field, endpoint) {
  const requiredFrame = field.coordinateFrame.id;
  const requiredAxis = field.coordinateFrame.axis || 'none';
  if (endpoint.source === 'selected_configuration') {
    return {
      projection: 'DIRECT_VALUE', requiredValueType: field.value.type,
      availableValueType: endpoint.valueType, unit: field.value.unit,
      coordinateSystem: 'non_geometric', axis: 'none', geometryId: `constraint.${field.id}`,
    };
  }
  const subject = SITE_PROFILE_V4_SUBJECTS[endpoint.subject];
  const geometryTypes = new Set(['box3', 'polygon2', 'route3', 'sweep3']);
  if (!geometryTypes.has(field.value.type)) {
    const categoricalTypes = new Set(['boolean', 'string', 'enum', 'enum_set', 'connector']);
    return {
      projection: categoricalTypes.has(field.value.type) ? 'DIRECT_VALUE' : 'AXIS_MAGNITUDE',
      requiredValueType: field.value.type, availableValueType: subject.valueType,
      unit: field.value.unit, coordinateSystem: requiredFrame,
      axis: requiredAxis, geometryId: `constraint.${field.id}`,
    };
  }

  const required = fieldMap.coordinateFrames.find((frame) => frame.id === requiredFrame);
  const available = fieldMap.coordinateFrames.find((frame) => frame.id === subject.coordinateSystem);
  if (!required || !available) throw new TypeError(`geometry comparison frame missing for ${field.id}`);
  const sameFrame = required.id === available.id;
  const aligned = required.origin === available.origin && same(required.axes, available.axes);
  if (!sameFrame && !aligned) throw new TypeError(`geometry endpoint requires an unproven frame transform: ${field.id}`);
  return {
    projection: sameFrame ? 'SAME_FRAME_GEOMETRY' : 'ALIGNED_FRAME_GEOMETRY',
    requiredValueType: field.value.type, availableValueType: subject.valueType,
    unit: field.value.unit, coordinateSystem: requiredFrame,
    axis: requiredAxis, geometryId: `constraint.${field.id}`,
  };
}

function relationFor(field) {
  const relation = RELATION_OVERRIDES[field.id] ?? field.permittedRelations[0];
  if (!field.permittedRelations.includes(relation)) throw new TypeError(`policy relation is not permitted for ${field.id}`);
  return relation;
}

function quantifierFor(field) {
  if (field.configurationVariables.includes('hingeSide') || field.configurationVariables.includes('adjustedHeightMm')) {
    return 'INSTALLER_SELECTABLE';
  }
  return 'FIXED_SELECTED';
}

function branchQuantifier(field, selectors) {
  if (Object.values(selectors).includes('unknown')) return 'UNKNOWN_FIXED';
  if (selectors.hingeSide === 'reversible_unselected'
    || field.configurationVariables.includes('adjustedHeightMm')) return 'INSTALLER_SELECTABLE';
  return quantifierFor(field);
}

function buildRule(fieldMap, definition, field, position) {
  const selectorDomains = field.selectorDomains
    .filter((name) => definition.selectorDomains.includes(name))
    .map((name) => ({ name, contextPath: name === 'deliverySelected' ? 'site.delivery.selected' : `configuration.${name}`, values: [...fieldMap.selectorDomains[name]] }));
  const selectorBranches = selectorRows(selectorDomains).map((selectors, index) => ({
    id: `branch-${String(index + 1).padStart(3, '0')}`,
    selectors,
    configurationQuantifier: branchQuantifier(field, selectors),
  }));
  const relation = relationFor(field);
  const available = availableEndpoints(field);
  const endpoints = {
    required: { source: 'installation_knowledge_v4', fieldId: field.id },
    available,
  };
  return {
    id: `${definition.category}.${String(position + 1).padStart(3, '0')}.${field.id}`,
    fieldId: field.id,
    fitClass: field.fitClass,
    relation,
    endpoints,
    comparison: comparisonFor(fieldMap, field, available[0]),
    composition: { operator: 'SEPARATE', fieldIds: [field.id] },
    selectorDomains,
    selectorBranches,
    configurationQuantifier: quantifierFor(field),
    requiredFields: [field.id, ...endpoints.available.map((endpoint) => endpoint.contextPath)],
    applicability: {
      formFactors: [...field.applicability.formFactors],
      unknownPolicy: field.applicability.unknownPolicy,
    },
    coverage: {
      category: definition.category,
      formFactors: [...definition.recognizedFormFactors],
      installationModes: [...fieldMap.selectorDomains.installationMode],
      selectorBranchIds: selectorBranches.map((branch) => branch.id),
      relation,
    },
  };
}

function isFormFactorApplicable(rule, formFactor) {
  return rule.applicability.formFactors.includes('*') || rule.applicability.formFactors.includes(formFactor);
}

function hasUnknownSelector(selectorValues) {
  return Object.values(selectorValues).includes('unknown');
}

function dispositionFor(pack, rule, formFactor, installationMode, selectorValues) {
  if (!isFormFactorApplicable(rule, formFactor)) return 'EXCLUDED';
  if (installationMode !== 'unknown' && !pack.supportedInstallationModes.includes(installationMode)) return 'EXCLUDED';
  if (selectorValues.deliverySelected === false) return 'EXCLUDED';
  if (rule.fieldId.startsWith('water.') && selectorValues.waterMode === 'none') return 'EXCLUDED';
  if (rule.fieldId.startsWith('drain.') && ['none', 'tank'].includes(selectorValues.drainMode)) return 'EXCLUDED';

  const panelField = rule.fieldId === 'envelope.panel.extent'
    || rule.fieldId.startsWith('dishwasher.panel.')
    || rule.fieldId.startsWith('dishwasher.toeKick.');
  if (panelField && selectorValues.panelMode === 'none') return 'EXCLUDED';

  if (rule.fieldId.startsWith('stacking.') && installationMode !== 'stacked') return 'EXCLUDED';

  if (rule.fieldId.startsWith('dryer.duct.') && selectorValues.dryerTechnology !== 'vented') return 'EXCLUDED';
  if (rule.fieldId === 'dryer.condensate.mode'
    && !['condenser', 'heat_pump'].includes(selectorValues.dryerTechnology)) return 'EXCLUDED';

  if (hasUnknownSelector(selectorValues) || installationMode === 'unknown') return 'EVALUATED';
  return 'EVALUATED';
}

function buildPlacementConstraints(fieldMap, definition) {
  const containedModes = definition.supportedInstallationModes.filter((mode) => (
    ['recessed', 'under_bench', 'integrated', 'flush'].includes(mode)
  ));
  const create = (name, axis, fieldIds, gapSubjects, modes) => {
    for (const fieldId of fieldIds) {
      const field = fieldMap.fields.find((candidate) => candidate.id === fieldId);
      if (!field || field.value.type !== 'finite_number' || field.value.unit !== 'mm') {
        throw new TypeError(`placement coherence field is not an exact scalar: ${fieldId}`);
      }
    }
    const cavitySubject = `cavity.${name}`;
    for (const subjectId of [cavitySubject, ...gapSubjects]) {
      const subject = SITE_PROFILE_V4_SUBJECTS[subjectId];
      if (!subject || subject.valueType !== 'finite_number' || subject.unit !== 'mm' || subject.axis !== axis) {
        throw new TypeError(`placement coherence subject is incompatible: ${subjectId}`);
      }
    }
    return {
      id: `${definition.category}.placement.${name}`,
      fitClass: 'hard_placement', relation: 'MIN_REQUIRED',
      composition: {
        operator: 'SUM',
        terms: fieldIds.map((fieldId) => ({ source: 'installation_knowledge_v4', fieldId })),
      },
      siteProofSubjects: [cavitySubject, ...gapSubjects],
      available: {
        source: 'site_profile_v4', subject: cavitySubject,
        valueType: 'finite_number', unit: 'mm',
      },
      comparison: {
        projection: 'AXIS_MAGNITUDE', requiredValueType: 'finite_number',
        availableValueType: 'finite_number', unit: 'mm', coordinateSystem: 'site_cavity',
        axis, geometryId: `constraint.${definition.category}.placement.${name}`,
      },
      installationModes: [...modes],
      missingOperandPolicy: 'BLOCK_VERIFICATION',
    };
  };
  return [
    create('width', 'x', [
      'installation.clearance.leftMin', 'envelope.closed.width', 'installation.clearance.rightMin',
    ], ['placement.leftGap', 'placement.rightGap'], definition.supportedInstallationModes),
    create('height', 'z', [
      'envelope.closed.height', 'installation.clearance.topMin',
    ], ['placement.topGap'], definition.supportedInstallationModes),
    create('depth', 'y', [
      'envelope.closed.depth', 'installation.clearance.rearMin',
    ], ['placement.rearGap'], containedModes),
  ];
}

function validatePlacementConstraints(fieldMap, pack, constraints) {
  const expected = buildPlacementConstraints(fieldMap, DEFINITIONS.find((item) => item.category === pack.category));
  if (!same(constraints, expected)) throw new TypeError('placement coherence constraints drift');
  const ids = new Set();
  for (const constraint of constraints) {
    if (ids.has(constraint.id)) throw new TypeError('duplicate placement coherence constraint');
    ids.add(constraint.id);
    if (constraint.composition.operator !== 'SUM' || constraint.composition.terms.length < 2
      || constraint.missingOperandPolicy !== 'BLOCK_VERIFICATION') {
      throw new TypeError(`placement coherence constraint is not fail closed: ${constraint.id}`);
    }
  }
}

export function generateFitPolicyCoverageV4(fieldMapInput, pack) {
  const fieldMap = validateFitV4FieldMap(fieldMapInput);
  if (!pack || typeof pack !== 'object') throw new TypeError('Fit V4 policy pack object required');
  if (pack.fieldMapVersion !== fieldMap.version) throw new TypeError('Fit V4 policy field-map version mismatch');
  uniqueStrings(pack.recognizedFormFactors, 'recognized form factors');
  uniqueStrings(pack.installationModes, 'installation modes');
  if (!Array.isArray(pack.rules) || pack.rules.length === 0) throw new TypeError('Fit V4 policy rules required');

  const cases = [];
  const dispositions = {};
  for (const rule of pack.rules) {
    dispositions[rule.fieldId] = Object.fromEntries(DISPOSITIONS.map((name) => [name, 0]));
    for (const formFactor of pack.recognizedFormFactors) {
      for (const installationMode of pack.installationModes) {
        for (const branch of rule.selectorBranches) {
          const disposition = dispositionFor(pack, rule, formFactor, installationMode, branch.selectors);
          dispositions[rule.fieldId][disposition] += 1;
          cases.push({
            id: `case-${String(cases.length + 1).padStart(6, '0')}`,
            category: pack.category,
            formFactor,
            installationMode,
            ruleId: rule.id,
            fieldId: rule.fieldId,
            selectorBranchId: branch.id,
            selectorValues: { ...branch.selectors },
            configurationQuantifier: branch.configurationQuantifier,
            relation: rule.relation,
            disposition,
          });
        }
      }
    }
  }
  return freezeDeep({
    schemaVersion: 1,
    packVersion: pack.packVersion,
    fieldMapVersion: pack.fieldMapVersion,
    category: pack.category,
    dimensions: ['category', 'formFactor', 'installationMode', 'selectorBranch', 'relation'],
    relations: [...new Set(pack.rules.map((rule) => rule.relation))].sort(),
    dispositions,
    cases,
  });
}

function validateRule(fieldMap, pack, rule, fieldIds, ruleIds) {
  requiredText(rule?.id, 'policy rule ID');
  if (ruleIds.has(rule.id)) throw new TypeError(`duplicate policy rule: ${rule.id}`);
  ruleIds.add(rule.id);
  const field = fieldMap.fields.find((candidate) => candidate.id === rule.fieldId);
  if (!field || !field.applicability.categories.includes(pack.category)) {
    throw new TypeError(`policy field does not belong to ${pack.category}: ${String(rule.fieldId)}`);
  }
  if (fieldIds.has(field.id)) throw new TypeError(`duplicate policy field: ${field.id}`);
  fieldIds.add(field.id);
  if (!RELATIONS.has(rule.relation) || !field.permittedRelations.includes(rule.relation)) {
    throw new TypeError(`policy relation invalid for ${field.id}`);
  }
  if (rule.fitClass !== field.fitClass || !same(rule.applicability, {
    formFactors: field.applicability.formFactors,
    unknownPolicy: field.applicability.unknownPolicy,
  })) throw new TypeError(`policy applicability drift for ${field.id}`);
  if (!rule.endpoints || rule.endpoints.required?.fieldId !== field.id
    || rule.endpoints.required.source !== 'installation_knowledge_v4'
    || !Array.isArray(rule.endpoints.available) || rule.endpoints.available.length === 0) {
    throw new TypeError(`policy endpoints invalid for ${field.id}`);
  }
  for (const endpoint of rule.endpoints.available) {
    const expectedSource = endpoint.contextPath.startsWith('site.') ? 'site_profile_v4' : 'selected_configuration';
    if (!field.contextPaths.includes(endpoint.contextPath) || endpoint.source !== expectedSource) {
      throw new TypeError(`policy available endpoint invalid for ${field.id}`);
    }
  }
  const expectedAvailable = availableEndpoints(field);
  if (!same(rule.endpoints.available, expectedAvailable)) throw new TypeError(`policy typed operand drift for ${field.id}`);
  if (!same(rule.comparison, comparisonFor(fieldMap, field, expectedAvailable[0]))) {
    throw new TypeError(`policy comparison projection drift for ${field.id}`);
  }
  if (!COMPOSITION_OPERATORS.has(rule.composition?.operator)
    || rule.composition.operator !== 'SEPARATE'
    || !same(rule.composition.fieldIds, [field.id])) throw new TypeError(`policy composition invalid for ${field.id}`);
  if (!QUANTIFIERS.has(rule.configurationQuantifier)) throw new TypeError(`policy quantifier invalid for ${field.id}`);
  uniqueStrings(rule.requiredFields, `required fields for ${field.id}`);
  const expectedRequiredFields = [field.id, ...rule.endpoints.available.map((endpoint) => endpoint.contextPath)];
  if (!same(rule.requiredFields, expectedRequiredFields)) throw new TypeError(`policy required fields drift for ${field.id}`);

  if (!Array.isArray(rule.selectorDomains)) throw new TypeError(`selector domains invalid for ${field.id}`);
  const selectorNames = new Set();
  for (const selector of rule.selectorDomains) {
    if (selectorNames.has(selector.name)) throw new TypeError(`duplicate selector domain for ${field.id}`);
    selectorNames.add(selector.name);
    const expectedPath = selector.name === 'deliverySelected' ? 'site.delivery.selected' : `configuration.${selector.name}`;
    if (!field.selectorDomains.includes(selector.name)
      || !fieldMap.allowedContextPaths.includes(expectedPath)
      || selector.contextPath !== expectedPath
      || !same(selector.values, fieldMap.selectorDomains[selector.name])) {
      throw new TypeError(`selector domain is not canonical for ${field.id}:${String(selector.name)}`);
    }
  }
  const expectedRows = selectorRows(rule.selectorDomains);
  if (!Array.isArray(rule.selectorBranches) || rule.selectorBranches.length !== expectedRows.length) {
    throw new TypeError(`selector branch coverage incomplete for ${field.id}`);
  }
  const signatures = new Set(rule.selectorBranches.map((branch) => JSON.stringify(canonical(branch.selectors))));
  const branchIds = new Set(rule.selectorBranches.map((branch) => branch.id));
  if (branchIds.size !== rule.selectorBranches.length
    || signatures.size !== expectedRows.length
    || expectedRows.some((row) => !signatures.has(JSON.stringify(canonical(row))))) {
    throw new TypeError(`selector branches overlap or have gaps for ${field.id}`);
  }
  for (const branch of rule.selectorBranches) {
    if (!QUANTIFIERS.has(branch.configurationQuantifier)
      || branch.configurationQuantifier !== branchQuantifier(field, branch.selectors)) {
      throw new TypeError(`selector branch quantifier drift for ${field.id}:${branch.id}`);
    }
  }
  if (!same(rule.coverage, {
    category: pack.category,
    formFactors: pack.recognizedFormFactors,
    installationModes: pack.installationModes,
    selectorBranchIds: rule.selectorBranches.map((branch) => branch.id),
    relation: rule.relation,
  })) throw new TypeError(`rule coverage metadata drift for ${field.id}`);
}

export function validateFitPolicyPackV4(fieldMapInput, pack) {
  const fieldMap = validateFitV4FieldMap(fieldMapInput);
  if (!pack || pack.schemaVersion !== FIT_POLICY_PACK_SCHEMA_VERSION || pack.packVersion !== FIT_POLICY_PACK_VERSION) {
    throw new TypeError(`Fit V4 policy pack ${FIT_POLICY_PACK_VERSION} required`);
  }
  if (pack.fieldMapVersion !== FIT_V4_FIELD_MAP_VERSION || pack.fieldMapVersion !== fieldMap.version) {
    throw new TypeError('Fit V4 policy pack field-map version mismatch');
  }
  const definition = DEFINITIONS.find((candidate) => candidate.category === pack.category);
  if (!definition) throw new TypeError(`unsupported Fit V4 policy category: ${String(pack.category)}`);
  if (!same(pack.recognizedFormFactors, definition.recognizedFormFactors)
    || pack.recognizedFormFactors.includes(TOWER_FORM_FACTOR)) throw new TypeError('recognized form factors drift');
  if (!same(pack.excludedFormFactors, [TOWER_FORM_FACTOR])) throw new TypeError('excluded form factors drift');
  if (!same(pack.installationModes, fieldMap.selectorDomains.installationMode)) throw new TypeError('installation mode domain drift');
  if (!same(pack.supportedInstallationModes, definition.supportedInstallationModes)) throw new TypeError('supported installation modes drift');
  const expectedModes = fieldMap.selectorDomains.installationMode.map((mode) => ({
    mode,
    disposition: mode === 'unknown' ? 'UNKNOWN' : definition.supportedInstallationModes.includes(mode) ? 'SUPPORTED' : 'EXCLUDED',
  }));
  if (!same(pack.configurationModes, expectedModes)) throw new TypeError('configuration mode disposition drift');
  if (!Array.isArray(pack.advisories) || pack.advisories.length === 0
    || pack.advisories.some((advisory) => advisory.affectsOutcome !== false)) throw new TypeError('non-outcome advisories required');

  const expectedFields = fieldMap.fields.filter((field) => field.applicability.categories.includes(pack.category));
  if (!Array.isArray(pack.rules) || pack.rules.length !== expectedFields.length) throw new TypeError('category policy fields are incomplete');
  const fieldIds = new Set();
  const ruleIds = new Set();
  for (const rule of pack.rules) validateRule(fieldMap, pack, rule, fieldIds, ruleIds);
  if (expectedFields.some((field) => !fieldIds.has(field.id))) throw new TypeError('category policy has an undeclared field disposition');
  validatePlacementConstraints(fieldMap, pack, pack.placementConstraints);

  const generated = generateFitPolicyCoverageV4(fieldMap, pack);
  if (!same(pack.coverageManifest, generated)) throw new TypeError('coverage manifest has an orphan branch, relation or case');
  if (!same(pack.fieldDispositions, generated.dispositions)) throw new TypeError('field disposition summary drift');
  return pack;
}

function buildPack(fieldMap, definition) {
  const fields = fieldMap.fields.filter((field) => field.applicability.categories.includes(definition.category));
  const rules = fields.map((field, index) => buildRule(fieldMap, definition, field, index));
  const base = {
    schemaVersion: FIT_POLICY_PACK_SCHEMA_VERSION,
    packVersion: FIT_POLICY_PACK_VERSION,
    fieldMapVersion: fieldMap.version,
    category: definition.category,
    recognizedFormFactors: [...definition.recognizedFormFactors],
    excludedFormFactors: [TOWER_FORM_FACTOR],
    installationModes: [...fieldMap.selectorDomains.installationMode],
    supportedInstallationModes: [...definition.supportedInstallationModes],
    configurationModes: fieldMap.selectorDomains.installationMode.map((mode) => ({
      mode,
      disposition: mode === 'unknown' ? 'UNKNOWN' : definition.supportedInstallationModes.includes(mode) ? 'SUPPORTED' : 'EXCLUDED',
    })),
    rules,
    placementConstraints: buildPlacementConstraints(fieldMap, definition),
    advisories: definition.advisories.map((advisory) => ({ ...advisory })),
  };
  const coverageManifest = generateFitPolicyCoverageV4(fieldMap, base);
  const pack = freezeDeep({ ...base, fieldDispositions: coverageManifest.dispositions, coverageManifest });
  validateFitPolicyPackV4(fieldMap, pack);
  return pack;
}

const fieldMap = validateFitV4FieldMap(rawFieldMap);

export const FIT_POLICY_PACKS_V4 = freezeDeep(Object.fromEntries(
  DEFINITIONS.map((definition) => [definition.category, buildPack(fieldMap, definition)]),
));

export function selectFitPolicyPackV4(identity) {
  if (!identity || typeof identity !== 'object') throw new TypeError('Fit V4 policy identity object required');
  if (identity.category === 'washtower_combo' || identity.formFactor === TOWER_FORM_FACTOR) {
    throw new TypeError('washtower_combo requires a dedicated combination policy and evidence cohort');
  }
  const pack = FIT_POLICY_PACKS_V4[identity.category];
  if (!pack) throw new TypeError(`unsupported Fit V4 policy category: ${String(identity.category)}`);
  if (!pack.recognizedFormFactors.includes(identity.formFactor)) {
    throw new TypeError(`form factor ${String(identity.formFactor)} is not recognized for ${pack.category}`);
  }
  return pack;
}
