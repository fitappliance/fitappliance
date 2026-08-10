import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { validateFitV4FieldMap } from '../../src/domain/fit-v4-contract.mjs';
import { FIT_POLICY_PACKS_V4 } from '../../src/domain/fit-policies-v4/index.mjs';
import {
  buildFitV4Checkpoint,
  validateFitV4RunManifest,
} from '../../src/domain/fit-v4-run-manifest.mjs';
import {
  buildFitV4SyntheticScenarioSet,
  selectFitV4SyntheticScenario,
} from '../../src/domain/fit-v4-scenario-binding.mjs';
import {
  createFitV4Receipt,
  createFitV4ReceiptBundle,
} from '../../src/domain/installation-evidence-receipt-v4.mjs';
import { SITE_PROFILE_V4_SUBJECTS } from '../../src/domain/site-profile-v4.mjs';

export const FIELD_MAP = validateFitV4FieldMap(JSON.parse(await readFile(
  new URL('../../data/architecture-v2/policies/fit-v4-field-map.json', import.meta.url),
  'utf8',
)));
export const PACK = FIT_POLICY_PACKS_V4.refrigerator;
export const AS_OF = '2026-08-08T00:00:00.000Z';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object' && !Buffer.isBuffer(value)
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
export const semanticHash = (value) => sha256(JSON.stringify(canonical(value)));

export async function writeFitV4PassingShadowActivationProof({ runsRoot, manifest }) {
  const validated = validateFitV4RunManifest(manifest);
  const semantic = canonical({
    schemaVersion: 2,
    artifactType: 'FIT_V4_SHADOW_AUDIT',
    manifestId: validated.manifestId,
    runId: validated.runId,
    manifestSha256: validated.manifestSha256,
    scenarioBinding: validated.semantic.scenarioBinding,
    inputSemanticSha256: 'a'.repeat(64),
    publicMutation: false,
    evaluationSummary: [{
      productId: 'fixture-product',
      category: 'refrigerator',
      applicableHardFieldCount: 0,
      outcomeCheckCount: 0,
    }],
    bindingChecks: [
      'ACTIVE_RELEASE',
      'CONFLICT_SET',
      'POLICY',
      'RECEIPT_LIFECYCLE',
      'SITE_OBSERVATION',
      'SOURCE_REVISION',
    ].map((checkId) => ({ checkId, pass: true, reasonCodes: [] })),
    verdict: 'PASS',
    reasonCodes: [],
  });
  const semanticSha256 = semanticHash(semantic);
  const artifact = {
    ...semantic,
    semanticSha256,
    auditId: `fit_v4_shadow_audit_${semanticSha256.slice(0, 24)}`,
  };
  const auditBytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`);
  const checkpoint = buildFitV4Checkpoint({
    manifest: validated,
    stage: 'shadow-audit',
    inputHashes: {
      auditInput: artifact.inputSemanticSha256,
      manifest: validated.manifestSha256,
    },
    outputSha256: sha256(auditBytes),
  });
  const runRoot = join(runsRoot, validated.runId);
  await mkdir(join(runRoot, 'checkpoints'), { recursive: true });
  await writeFile(join(runRoot, 'shadow-audit.json'), auditBytes, { flag: 'wx' });
  await writeFile(
    join(runRoot, 'checkpoints', 'shadow-audit.json'),
    `${JSON.stringify(checkpoint, null, 2)}\n`,
    { flag: 'wx' },
  );
  return { artifact, checkpoint };
}

const NULL_NORMALIZED = Object.freeze({ value: null, unit: null, relation: null, endpoints: null });
const UNKNOWN = Object.freeze({ state: 'unknown', predicate: null });
const NOT_APPLICABLE = Object.freeze({ state: 'not_applicable', predicate: null });
const IDENTITY_BYTES = Buffer.from('MODEL R1');
const RIGHTS_BYTES = Buffer.from('Example manufacturer evidence rights grant');
const RIGHTS_SHA256 = sha256(RIGHTS_BYTES);

export function normalized(fieldId, value, { relation } = {}) {
  const rule = PACK.rules.find((candidate) => candidate.fieldId === fieldId);
  const field = FIELD_MAP.fields.find((candidate) => candidate.id === fieldId);
  const selectedRelation = relation ?? rule.relation;
  let endpoints = null;
  if (['MIN_REQUIRED', 'MAX_ALLOWED'].includes(selectedRelation)) endpoints = { boundary: 'closed' };
  if (field.value.type === 'closed_range') endpoints = { minimum: 'closed', maximum: 'closed' };
  return { value, unit: field.value.unit, relation: selectedRelation, endpoints };
}

function exactIdentity() {
  const binding = {
    schemaVersion: 1,
    bindingId: 'exact-product-r1',
    canonicalProductId: 'product-r1',
    category: 'refrigerator',
    brand: 'Example',
    model: 'R1',
    market: 'AU',
    outcome: 'exact',
    fragmentSha256: sha256(IDENTITY_BYTES),
  };
  return {
    canonicalProductId: 'product-r1', category: 'refrigerator', brand: 'Example', model: 'R1', market: 'AU',
    identityMapSha256: '1'.repeat(64), applicableModels: ['R1'],
    exactBinding: { ...binding, bindingSha256: semanticHash(binding) },
  };
}

function exactReceipt(fieldId, value, options = {}) {
  const field = FIELD_MAP.fields.find((candidate) => candidate.id === fieldId);
  if (field.rights.mappingStatus !== 'EXACT') {
    throw new TypeError(`test receipt field lacks an exact rights mapping: ${fieldId}`);
  }
  const normalizedValue = normalized(fieldId, value, options);
  const fragmentText = `${fieldId}: ${JSON.stringify(value)} ${field.value.unit ?? ''}`.trim();
  const sourceBytes = Buffer.from(`%PDF synthetic ${fieldId}`);
  const contentBytes = Buffer.from(`MODEL R1\n${fragmentText}\n`);
  const fragmentBytes = Buffer.from(fragmentText);
  const sourceId = `r1-${fieldId}`;
  const receipt = createFitV4Receipt({
    identity: exactIdentity(),
    fieldId,
    applicability: { state: 'required', predicate: null },
    original: { value, unit: field.value.unit },
    normalized: normalizedValue,
    source: {
      providerId: 'example-manufacturer', sourceId,
      url: `https://example.invalid/${encodeURIComponent(fieldId)}.pdf`,
      bytesSha256: sha256(sourceBytes), contentSha256: sha256(contentBytes),
      fragmentSha256: sha256(fragmentBytes), fragmentText,
      locator: { kind: 'pdf_bbox', page: 1, bbox: [1, 2, 3, 4] },
      authority: { sourceType: field.authority.permittedSourceTypes[0], organization: 'Example' },
      jurisdiction: 'AU', language: 'en-AU', documentRevision: 'REV-A',
      observedAt: '2026-08-07T00:00:00.000Z', retrievedAt: '2026-08-07T00:00:00.000Z',
    },
    versions: { parser: 'mineru-v2', policy: PACK.packVersion, fieldMap: FIELD_MAP.version },
    rights: {
      decisions: field.rights.requiredActions.map((actionId) => ({
        providerId: 'example-manufacturer', sourceId, fieldId: field.rights.dictionaryFieldId,
        actionId, decision: 'granted', conditions: [], evidenceSha256: RIGHTS_SHA256,
      })),
    },
    lifecycle: { status: 'active', transition: 'assertion', targetReceiptId: null, reason: null, changedAt: null },
  }, { fieldMap: FIELD_MAP });
  return {
    receipt,
    replay: {
      fieldMap: FIELD_MAP,
      sourceBytes, contentBytes, fragmentBytes, identityFragmentBytes: IDENTITY_BYTES,
      rightsEvidenceBytes: { [RIGHTS_SHA256]: RIGHTS_BYTES },
    },
  };
}

function policy(ruleId, fieldId, applicability, value = NULL_NORMALIZED) {
  return {
    ruleId, authority: 'fit_policy_v4', fieldId, applicability, normalized: value,
    when: { op: 'eq', path: 'product.category', value: 'refrigerator' },
  };
}

export function policyClaim(rule, id = rule.ruleId) {
  return {
    id, fieldId: rule.fieldId, applicability: rule.applicability,
    normalized: rule.normalized, attribution: { kind: 'policy_rule', ruleId: rule.ruleId },
  };
}

function trustedPolicyBundle(rules) {
  const entries = rules.map((content) => ({
    ruleId: content.ruleId,
    usage: content.ruleId === 'fixture-configuration' ? 'configuration' : 'claim',
    policyClass: content.normalized.value === null ? 'knowledge_state' : 'normative_requirement',
    content,
    semanticSha256: semanticHash(content),
  }));
  const payload = { schemaVersion: 1, bundleId: 'trusted-fit-v4-evaluation-fixture', rules: entries };
  return { ...payload, bundleSha256: semanticHash(payload) };
}

function trustedReferenceRegistry(references) {
  const rows = references.map((reference) => {
    const field = FIELD_MAP.fields.find((candidate) => candidate.id === reference.fieldIds[0]);
    const content = {
      id: reference.id, type: reference.type, fieldIds: reference.fieldIds,
      operator: reference.type === 'composition' ? 'MAX' : field.permittedRelations[0],
    };
    return { ...content, semanticSha256: semanticHash(content) };
  });
  const payload = { schemaVersion: 1, registryId: 'trusted-fit-v4-reference-fixture', references: rows };
  return { ...payload, registrySha256: semanticHash(payload) };
}

export function observation(subject, value, options = {}) {
  const contract = SITE_PROFILE_V4_SUBJECTS[subject];
  if (!contract) throw new TypeError(`unknown fixture observation subject: ${subject}`);
  const id = options.id ?? subject.replaceAll('.', '-');
  const datum = options.datum ?? ({
    installed_appliance: 'rear-left-finished-support',
    site_cavity: 'rear-left-finished-support',
    service_route: 'declared-product-exit',
    delivery_path: 'declared-path-entry',
    non_geometric: 'not-applicable',
  }[options.coordinateSystem ?? contract.coordinateSystem]);
  let acceptedValue = value;
  if (options.boundKind === 'COVERAGE_INTERVAL' && value && !Object.hasOwn(value, 'minimumEndpoint')) {
    acceptedValue = { ...value, minimumEndpoint: 'closed', maximumEndpoint: 'closed' };
  }
  return {
    id, subject,
    observationType: options.observationType ?? contract.observationType,
    valueType: options.valueType ?? contract.valueType,
    value: acceptedValue,
    unit: options.unit === undefined ? contract.unit : options.unit,
    coordinateSystem: options.coordinateSystem ?? contract.coordinateSystem,
    datum,
    axis: options.axis ?? contract.axis,
    geometryId: options.geometryId ?? subject,
    method: options.method ?? 'synthetic_measurement',
    observedAt: options.observedAt ?? '2026-08-07T00:00:00.000Z',
    boundKind: options.boundKind ?? 'DETERMINISTIC',
    boundDirection: options.boundDirection ?? null,
    source: { kind: 'synthetic', sourceId: `synthetic-${id}` },
  };
}

function siteProfile(observations, configuration, deliverySelected) {
  const state = Object.keys(configuration).length ? 'selected' : 'unknown';
  const configurationObservation = observation('configuration.selection', state, {
    id: 'configuration-selection', method: 'synthetic_declaration',
  });
  const groups = {
    surfaces: [], obstacles: [], operationZones: [], serviceEndpoints: [], serviceRoutes: [], holes: [],
    connectors: [], access: [], componentSelections: [], serviceSpecifications: [], environment: [], support: [],
    professionalConfirmations: [], jurisdictionConfirmations: [],
  };
  const deliveryRefs = [];
  for (const row of observations) {
    const group = SITE_PROFILE_V4_SUBJECTS[row.subject].group;
    if (group === 'delivery') deliveryRefs.push(row.id);
    else groups[group].push(row.id);
  }
  return {
    schemaVersion: 1, profileId: 'synthetic-site-r1', sourceKind: 'synthetic', consent: null,
    configuration: { state, values: configuration, observationRef: configurationObservation.id },
    observations: [...observations, configurationObservation],
    ...groups,
    delivery: { selected: deliverySelected, pathObservationRefs: deliverySelected ? deliveryRefs : [] },
  };
}

function manifestFor({
  receiptBundle,
  knowledge,
  scenarioSetManifest,
  selectedScenarioMemberId,
  scenarioSelection,
  policyBundle,
  referenceRegistry,
  replayContexts,
}) {
  const policyHashes = {
    dishwasher: semanticHash(FIT_POLICY_PACKS_V4.dishwasher),
    dryer: semanticHash(FIT_POLICY_PACKS_V4.dryer),
    refrigerator: semanticHash(FIT_POLICY_PACKS_V4.refrigerator),
    washingMachine: semanticHash(FIT_POLICY_PACKS_V4.washing_machine),
  };
  const rightsEvidence = [...new Set(Object.values(replayContexts).flatMap((context) => (
    Object.keys(context.rightsEvidenceBytes)
  )))].sort();
  const semantic = canonical({
    schemaVersion: 2,
    activeRelease: {
      releaseCandidateId: 'fixture-active-release', activatedAt: '2026-08-01T00:00:00.000Z',
      catalogSha256: '2'.repeat(64), historicalReferenceSha256: '3'.repeat(64),
      authorizationManifestSha256: '4'.repeat(64),
    },
    identityMapSha256: '1'.repeat(64),
    receiptBundleSha256: receiptBundle.bundleSha256,
    fieldMapSha256: semanticHash(FIELD_MAP),
    schemaHashes: { knowledge: semanticHash({ schema: 'knowledge-v4' }), result: semanticHash({ schema: 'result-v4' }), site: semanticHash({ schema: 'site-v4' }) },
    policyHashes,
    trustedRegistryHashes: {
      knowledgePolicyBundle: policyBundle.bundleSha256,
      knowledgeReferenceRegistry: referenceRegistry.registrySha256,
      consentApprovalRegistry: null,
      rightsEvidenceSet: semanticHash({ schemaVersion: 1, evidenceSha256: rightsEvidence }),
      calibrationLabelRegistry: null,
    },
    policyEpoch: PACK.packVersion,
    scenarioBinding: scenarioSelection.scenarioBinding,
    clockBindings: {
      retailEvidence: {
        bundleSha256: '5'.repeat(64), oldestObservedAt: '2026-08-01T00:00:00.000Z',
        freshestObservedAt: '2026-08-07T00:00:00.000Z',
      },
      documentRevision: null,
      siteObservation: {
        bundleSha256: scenarioSelection.scenarioBinding.scenarioMemberSha256,
        observedAt: '2026-08-07T00:00:00.000Z',
      },
    },
    asOf: AS_OF,
  });
  const semanticSha256 = semanticHash(semantic);
  const payload = canonical({
    schemaVersion: 2,
    manifestId: `fit_v4_manifest_${semanticSha256.slice(0, 24)}`,
    runId: `fit_v4_run_${semanticSha256.slice(0, 24)}`,
    semanticSha256,
    semantic,
    scenarioSetManifest,
    selectedScenarioMemberId,
    generatedAt: AS_OF,
    clocks: {
      asOf: AS_OF, generatedAt: AS_OF,
      activeReleaseActivatedAt: semantic.activeRelease.activatedAt,
      retailEvidence: semantic.clockBindings.retailEvidence,
      documentRevision: null,
      siteObservation: semantic.clockBindings.siteObservation,
      policyEpoch: semantic.policyEpoch,
    },
  });
  return validateFitV4RunManifest({ ...payload, manifestSha256: semanticHash(payload) });
}

export function buildTrustedFitV4Input({
  fields = [], observations = [], configuration = {}, deliverySelected = false,
  normative = [], claims = [], includeDefaultEnvironmentClaim = true,
  scenarioObservationSets = null, selectedScenarioIndex = 0,
} = {}) {
  const receiptRows = fields.map(([fieldId, value, options]) => exactReceipt(fieldId, value, options));
  const receipts = receiptRows.map((row) => row.receipt);
  const receiptBundle = createFitV4ReceiptBundle(receipts, { fieldMap: FIELD_MAP });
  const replayContexts = Object.fromEntries(receiptRows.map(({ receipt, replay }) => [
    receipt.receiptId, { ...replay, bundle: receiptBundle },
  ]));

  const byField = new Map(receipts.map((receipt) => [receipt.fieldId, receipt]));
  const componentSpecs = [
    ['body', 'envelope.body.width', UNKNOWN],
    ['door', 'envelope.door.closedDepth', UNKNOWN],
    ['handle', 'envelope.handle.depth', NOT_APPLICABLE],
    ['feet', 'envelope.adjusted.heightRange', UNKNOWN],
    ['trim', 'envelope.trim.extent', NOT_APPLICABLE],
    ['panel', 'envelope.panel.extent', NOT_APPLICABLE],
  ];
  const componentRules = [];
  const componentExtents = componentSpecs.map(([component, fieldId, applicability]) => {
    const receipt = byField.get(fieldId);
    if (receipt) {
      return {
        id: `fixture-component-${component}`, component, fieldId,
        applicability: receipt.applicability, normalized: receipt.normalized,
        attribution: { kind: 'receipt', receiptId: receipt.receiptId },
      };
    }
    const rule = policy(`fixture-component-${component}`, fieldId, applicability);
    componentRules.push(rule);
    return { ...policyClaim(rule), id: `fixture-component-${component}`, component };
  });
  const configurationRule = policy('fixture-configuration', 'envelope.body.width', UNKNOWN);
  const adjustmentReceipt = byField.get('envelope.adjusted.heightRange');
  const adjustmentRule = adjustmentReceipt
    ? null
    : policy('fixture-adjustment', 'envelope.adjusted.heightRange', UNKNOWN);
  const operationRule = policy('fixture-operation', 'operation.component.removalZone', UNKNOWN);
  const serviceRule = policy('fixture-service', 'power.socket.prohibitedZone', UNKNOWN);
  const environmentRule = policy(
    'fixture-environment',
    'environment.location.prohibited',
    { state: 'prohibited', predicate: null },
    { value: ['outdoor'], unit: null, relation: 'NOT_MEMBER_OF', endpoints: null },
  );
  const normativeRules = [
    configurationRule, ...componentRules, ...[adjustmentRule].filter(Boolean),
    operationRule, serviceRule, environmentRule,
    ...normative.map((rule) => ({
    authority: 'fit_policy_v4', ...rule,
    })),
  ];
  const receiptRelationRefs = receipts
    .filter((receipt) => !componentExtents.some((claim) => claim.attribution.kind === 'receipt'
      && claim.attribution.receiptId === receipt.receiptId))
    .map((receipt, index) => ({
      id: `fixture-receipt-reference-${index + 1}`, type: 'relation', fieldIds: [receipt.fieldId],
      attribution: { kind: 'receipt', receiptId: receipt.receiptId },
    }));
  const bodyRule = componentRules.find((rule) => rule.ruleId === 'fixture-component-body');
  const relationRefs = [{
    id: 'fixture-body-relation', type: 'relation', fieldIds: ['envelope.body.width'],
    attribution: { kind: 'policy_rule', ruleId: bodyRule.ruleId },
  }, ...receiptRelationRefs];
  const compositionRefs = [{
    id: 'fixture-body-composition', type: 'composition', fieldIds: ['envelope.body.width'],
    attribution: { kind: 'policy_rule', ruleId: bodyRule.ruleId },
  }];
  const adjustmentDomains = [adjustmentReceipt ? {
    id: 'fixture-adjustment', fieldId: adjustmentReceipt.fieldId,
    applicability: adjustmentReceipt.applicability, normalized: adjustmentReceipt.normalized,
    attribution: { kind: 'receipt', receiptId: adjustmentReceipt.receiptId },
  } : policyClaim(adjustmentRule)];
  const environmentClaims = claims.filter((claim) => (
    ['environment.', 'cabinet.support.', 'stability.'].some((prefix) => claim.fieldId.startsWith(prefix))
  ));
  const serviceClaims = claims.filter((claim) => !environmentClaims.includes(claim));
  const knowledge = {
    schemaVersion: 1,
    identity: { canonicalProductId: 'product-r1', category: 'refrigerator', brand: 'Example', model: 'R1', market: 'AU' },
    coordinateConfiguration: {
      coordinateFrameId: 'installed_appliance', configurationId: 'fixture-configuration-r1',
      selectorState: Object.keys(configuration).length ? 'selected' : 'unknown', values: configuration,
      attribution: { kind: 'policy_rule', ruleId: configurationRule.ruleId },
    },
    componentExtents,
    adjustmentDomains, relationRefs, compositionRefs,
    operationGeometry: [policyClaim(operationRule)],
    services: [policyClaim(serviceRule), ...serviceClaims],
    environmentSupport: [
      ...(includeDefaultEnvironmentClaim ? [policyClaim(environmentRule)] : []),
      ...environmentClaims,
    ],
    normativeRules,
    receiptRefs: receipts.map((receipt) => receipt.receiptId),
  };
  const policyBundle = trustedPolicyBundle(normativeRules);
  const referenceRegistry = trustedReferenceRegistry([...relationRefs, ...compositionRefs]);
  const observationSets = scenarioObservationSets ?? [observations];
  if (!Array.isArray(observationSets) || observationSets.length === 0
    || !Number.isInteger(selectedScenarioIndex) || !observationSets[selectedScenarioIndex]) {
    throw new TypeError('trusted fixture scenario selection invalid');
  }
  const sites = observationSets.map((rows) => siteProfile(rows, configuration, deliverySelected));
  const scenarioSetManifest = buildFitV4SyntheticScenarioSet({
    purpose: 'FIT_V4_TRUSTED_EVALUATION_FIXTURE',
    category: 'refrigerator',
    configurationScope: { category: 'refrigerator', values: configuration },
    metadata: { frozenAt: AS_OF, source: 'TRUSTED_TEST_FIXTURE' },
    members: sites,
  }, {
    fieldMap: FIELD_MAP,
    asOf: AS_OF,
    maxObservationAgeMs: 7 * 24 * 60 * 60 * 1000,
  });
  const selectedHash = semanticHash(sites[selectedScenarioIndex]);
  const selectedScenarioMemberId = scenarioSetManifest.members.find(
    (member) => member.scenarioMemberSha256 === selectedHash,
  )?.scenarioMemberId;
  const scenarioSelection = selectFitV4SyntheticScenario(
    scenarioSetManifest,
    selectedScenarioMemberId,
    {
      fieldMap: FIELD_MAP,
      asOf: AS_OF,
      maxObservationAgeMs: 7 * 24 * 60 * 60 * 1000,
    },
  );
  const runManifest = manifestFor({
    receiptBundle, knowledge, scenarioSetManifest, selectedScenarioMemberId,
    scenarioSelection, policyBundle, referenceRegistry, replayContexts,
  });
  return {
    runId: runManifest.runId,
    runManifest,
    expectedManifest: structuredClone(runManifest),
    fieldMap: FIELD_MAP,
    policyPack: PACK,
    identity: { ...knowledge.identity, formFactor: 'upright' },
    knowledge,
    receiptBundle,
    scenarioSiteOptions: {
      fieldMap: FIELD_MAP,
      asOf: AS_OF,
      maxObservationAgeMs: 7 * 24 * 60 * 60 * 1000,
    },
    trustedPolicyBundle: policyBundle,
    trustedReferenceRegistry: referenceRegistry,
    approvalRegistry: null,
    receiptReplayContexts: replayContexts,
    identityMapSha256: runManifest.semantic.identityMapSha256,
    productSha256: semanticHash(knowledge),
    receiptBundleSha256: receiptBundle.bundleSha256,
    policySha256: semanticHash(PACK),
  };
}
