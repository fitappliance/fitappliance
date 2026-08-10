import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { loadActiveRetailRelease } from '../../src/domain/active-retail-release.mjs';
import { validateFitV4FieldMap } from '../../src/domain/fit-v4-contract.mjs';
import {
  createFitV4Receipt,
  createFitV4ReceiptBundle,
} from '../../src/domain/installation-evidence-receipt-v4.mjs';
import {
  FIT_V4_READINESS_PREDECESSOR_ROLES,
  buildFitV4ReadinessEpoch,
  canonicalJsonBytes,
  classifyFitV4PolicyApplicability,
  createNotMaterializedFitV4SourceRegistry,
  materializeFitV4ReadinessEpoch,
  readFitV4ReadinessHead,
  readFitV4ReadinessTransition,
  resolveFitV4PublicationRights,
  sha256,
  validateFitV4PublicationRightsRegistry,
  validateFitV4ReadinessEpoch,
} from '../../src/domain/fit-v4-readiness-epoch.mjs';

const ROOT = new URL('../../', import.meta.url);
const AS_OF = '2026-08-09T00:00:00.000Z';
const AUTHORIZATION_BYTES = Buffer.from('FitAppliance public display authorization fixture');
const INTERNAL_RIGHTS_BYTES = Buffer.from('FitAppliance internal processing authorization fixture');
const SOURCE_BYTES = Buffer.from('%PDF-1.7 fixture');
const CONTENT_BYTES = Buffer.from('MODEL X100\nWidth 600 mm');
const FRAGMENT_BYTES = Buffer.from('Width 600 mm');
const IDENTITY_BYTES = Buffer.from('MODEL X100');

const readJsonBytes = async (path) => {
  const bytes = await readFile(new URL(path, ROOT));
  return { bytes, document: JSON.parse(bytes) };
};

function semanticSha(value) {
  return sha256(canonicalJsonBytes(value));
}

function rehashEpoch(value) {
  const copy = structuredClone(value);
  delete copy.epochId;
  delete copy.semanticSha256;
  const digest = semanticSha(copy);
  return {
    ...copy,
    epochId: `fit_v4_readiness_${digest.slice(0, 24)}`,
    semanticSha256: digest,
  };
}

function rehashTransition(value) {
  const copy = structuredClone(value);
  delete copy.transitionId;
  delete copy.semanticSha256;
  const digest = semanticSha(copy);
  return {
    ...copy,
    transitionId: `fit_v4_readiness_transition_${digest.slice(0, 24)}`,
    semanticSha256: digest,
  };
}

async function loadRealInputs(overrides = {}) {
  const active = await loadActiveRetailRelease();
  const descriptor = await readJsonBytes('data/architecture-v2/decisions/active-retail-release.json');
  const catalog = await readJsonBytes(active.descriptor.artifacts.publicProjection.path);
  const reference = await readJsonBytes(active.descriptor.artifacts.historicalReference.path);
  const identityMap = await readJsonBytes('data/architecture-v2/reviews/automated/fit-v4-universe-reconciliation.json');
  const fieldMap = await readJsonBytes('data/architecture-v2/policies/fit-v4-field-map.json');
  const rightsDictionary = await readJsonBytes('data/architecture-v2/policies/product-data-field-rights-dictionary.json');
  const publicationRights = await readJsonBytes('data/architecture-v2/policies/fit-v4-publication-rights-registry.json');
  const validatedFieldMap = validateFitV4FieldMap(fieldMap.document);
  const receiptBundle = createFitV4ReceiptBundle([], { fieldMap: validatedFieldMap });
  const sourceRegistry = createNotMaterializedFitV4SourceRegistry(AS_OF);

  return {
    activeRelease: {
      descriptorBytes: descriptor.bytes,
      descriptor: descriptor.document,
      catalogBytes: catalog.bytes,
      catalog: catalog.document,
      referenceBytes: reference.bytes,
      reference: reference.document,
    },
    identityMap,
    fieldMap,
    rightsDictionary,
    receiptBundle,
    sourceRegistry,
    publicationRights: {
      ...publicationRights,
      authorizationEvidenceBytes: {},
    },
    producer: {
      producerSha256: 'a'.repeat(64),
      materializerSha256: 'b'.repeat(64),
    },
    asOf: AS_OF,
    clocks: {
      catalog: catalog.document.retailLifecycleRelease.asOf,
      receipt: AS_OF,
      source: AS_OF,
      rights: AS_OF,
    },
    ...overrides,
  };
}

function makeReceipt(fieldMap, product) {
  const dictionaryEvidenceSha256 = sha256(INTERNAL_RIGHTS_BYTES);
  const exactBinding = {
    schemaVersion: 1,
    bindingId: `exact-${product.canonicalProductId}`,
    canonicalProductId: product.canonicalProductId,
    category: product.cat === 'fridge' ? 'refrigerator' : product.cat,
    brand: product.brand,
    model: product.model,
    market: 'AU',
    outcome: 'exact',
    fragmentSha256: sha256(IDENTITY_BYTES),
  };
  const source = {
    providerId: 'example-manufacturer',
    sourceId: 'x100-install-guide-rev-a',
    url: 'https://example.invalid/x100-install.pdf',
    bytesSha256: sha256(SOURCE_BYTES),
    contentSha256: sha256(CONTENT_BYTES),
    fragmentSha256: sha256(FRAGMENT_BYTES),
    fragmentText: FRAGMENT_BYTES.toString(),
    locator: { kind: 'pdf_bbox', page: 2, bbox: [10, 20, 30, 40] },
    authority: { sourceType: 'manufacturer_installation_guide', organization: 'Example' },
    jurisdiction: 'AU',
    language: 'en-AU',
    documentRevision: 'REV-A',
    observedAt: '2026-08-01T00:00:00.000Z',
    retrievedAt: '2026-08-02T00:00:00.000Z',
  };
  const field = fieldMap.fields.find((candidate) => candidate.id === 'envelope.closed.width');
  const rights = {
    decisions: field.rights.requiredActions.map((actionId) => ({
      providerId: source.providerId,
      sourceId: source.sourceId,
      fieldId: field.rights.dictionaryFieldId,
      actionId,
      decision: 'granted',
      conditions: [],
      evidenceSha256: dictionaryEvidenceSha256,
    })),
  };
  return createFitV4Receipt({
    identity: {
      canonicalProductId: product.canonicalProductId,
      category: exactBinding.category,
      brand: product.brand,
      model: product.model,
      market: 'AU',
      identityMapSha256: '1'.repeat(64),
      applicableModels: [product.model],
      exactBinding: { ...exactBinding, bindingSha256: semanticSha(exactBinding) },
    },
    fieldId: field.id,
    applicability: { state: 'required', predicate: null },
    original: { value: 600, unit: 'mm' },
    normalized: {
      value: 600,
      unit: 'mm',
      relation: 'MIN_REQUIRED',
      endpoints: { boundary: 'closed' },
    },
    source,
    versions: { parser: 'mineru-v2', policy: 'fit-policy-v4.0.0', fieldMap: fieldMap.version },
    rights,
    lifecycle: {
      status: 'active',
      transition: 'assertion',
      targetReceiptId: null,
      reason: null,
      changedAt: null,
    },
  }, { fieldMap });
}

function rightsDecision(receipt, product, overrides = {}) {
  return {
    decisionId: 'public-display-example-width-v1',
    providerId: receipt.source.providerId,
    sourceId: receipt.source.sourceId,
    fieldId: receipt.fieldId,
    dictionaryFieldId: 'closedEnvelope.widthMm',
    actionId: 'public_display',
    decision: 'granted',
    sourceContentSha256: receipt.source.contentSha256,
    receiptId: receipt.receiptId,
    receiptSha256: receipt.receiptSha256,
    canonicalProductId: product.canonicalProductId,
    market: 'AU',
    brand: product.brand,
    model: product.model,
    authorizationEvidenceSha256: sha256(AUTHORIZATION_BYTES),
    validFrom: '2026-08-01T00:00:00.000Z',
    validUntil: '2027-08-01T00:00:00.000Z',
    conditions: [],
    attribution: { required: false, fulfilled: true, evidenceSha256: null },
    predecessorDecisionId: null,
    ...overrides,
  };
}

function publicationRegistry(decisions = [], withdrawals = []) {
  return {
    schemaVersion: 1,
    policyVersion: 'fit-v4-publication-rights-registry-v1',
    asOf: AS_OF,
    defaultDisposition: 'UNKNOWN',
    decisions,
    withdrawals,
    evidenceInventory: decisions.length === 0 && withdrawals.length === 0 ? [] : [{
      evidenceSha256: sha256(AUTHORIZATION_BYTES),
      mediaType: 'text/plain',
      byteLength: AUTHORIZATION_BYTES.length,
    }],
  };
}

async function withReceiptAndRights(input, { withdrawn = false } = {}) {
  const fieldMap = validateFitV4FieldMap(input.fieldMap.document);
  const product = input.activeRelease.catalog.products.find((candidate) => (
    candidate.lifecycleVisibility === 'CURRENT_OUTPUT'
      && classifyFitV4PolicyApplicability(candidate).state === 'SUPPORTED'
  ));
  const receipt = makeReceipt(fieldMap, product);
  const decision = rightsDecision(receipt, product);
  const withdrawals = withdrawn ? [{
    withdrawalId: 'withdraw-public-display-example-width-v1',
    decisionId: decision.decisionId,
    predecessorDecisionId: decision.decisionId,
    changedAt: AS_OF,
    authorizationEvidenceSha256: sha256(AUTHORIZATION_BYTES),
  }] : [];
  const registry = publicationRegistry([decision], withdrawals);
  return {
    ...input,
    receiptBundle: createFitV4ReceiptBundle([receipt], { fieldMap }),
    publicationRights: {
      document: registry,
      bytes: canonicalJsonBytes(registry),
      authorizationEvidenceBytes: {
        [sha256(AUTHORIZATION_BYTES)]: AUTHORIZATION_BYTES,
      },
    },
  };
}

test('active CURRENT_OUTPUT rows partition into the frozen WP2 applicability states', async () => {
  const active = await loadActiveRetailRelease();
  const counts = {};
  for (const product of active.catalog.products.filter(
    (candidate) => candidate.lifecycleVisibility === 'CURRENT_OUTPUT',
  )) {
    const state = classifyFitV4PolicyApplicability(product).state;
    counts[state] = (counts[state] ?? 0) + 1;
  }
  assert.deepEqual(counts, {
    FORM_FACTOR_REQUIRED: 247,
    POLICY_UNSUPPORTED: 6,
    SUPPORTED: 96,
  });
  assert.equal(classifyFitV4PolicyApplicability({ cat: 'unknown', geometry_v2: { formFactor: 'upright' } }).state, 'CATEGORY_UNSUPPORTED');
  assert.throws(() => classifyFitV4PolicyApplicability(
    { cat: 'fridge', geometry_v2: { formFactor: 'upright' } },
    { policyPacks: { refrigerator: { schemaVersion: 0 } } },
  ), /POLICY_DEFECT/);
});

test('publication rights are exact, replayable, exhaustive and never inferred', async () => {
  const input = await loadRealInputs();
  const fieldMap = validateFitV4FieldMap(input.fieldMap.document);
  const product = input.activeRelease.catalog.products.find((candidate) => (
    candidate.lifecycleVisibility === 'CURRENT_OUTPUT'
      && classifyFitV4PolicyApplicability(candidate).state === 'SUPPORTED'
  ));
  const receipt = makeReceipt(fieldMap, product);
  const bundle = createFitV4ReceiptBundle([receipt], { fieldMap });
  const decision = rightsDecision(receipt, product);
  const registry = publicationRegistry([decision]);
  const context = {
    fieldMap,
    rightsDictionary: input.rightsDictionary.document,
    receiptBundle: bundle,
    authorizationEvidenceBytes: { [sha256(AUTHORIZATION_BYTES)]: AUTHORIZATION_BYTES },
    asOf: AS_OF,
  };

  assert.equal(validateFitV4PublicationRightsRegistry(registry, context).decisions.length, 1);
  assert.equal(resolveFitV4PublicationRights({ registry, receipt, fieldId: receipt.fieldId, ...context }).state, 'ALLOWED');
  assert.equal(resolveFitV4PublicationRights({ registry: publicationRegistry(), receipt, fieldId: receipt.fieldId, ...context }).state, 'UNKNOWN');
  assert.equal(resolveFitV4PublicationRights({ registry: publicationRegistry([{ ...decision, decision: 'denied' }]), receipt, fieldId: receipt.fieldId, ...context }).state, 'DENIED');
  assert.equal(resolveFitV4PublicationRights({ registry: publicationRegistry([{ ...decision, validUntil: '2026-08-08T00:00:00.000Z' }]), receipt, fieldId: receipt.fieldId, ...context }).state, 'EXPIRED');
  assert.equal(resolveFitV4PublicationRights({
    registry: publicationRegistry([decision], [{
      withdrawalId: 'withdraw-public-display-example-width-v1',
      decisionId: decision.decisionId,
      predecessorDecisionId: decision.decisionId,
      changedAt: AS_OF,
      authorizationEvidenceSha256: sha256(AUTHORIZATION_BYTES),
    }]),
    receipt,
    fieldId: receipt.fieldId,
    ...context,
  }).state, 'WITHDRAWN');
  assert.equal(resolveFitV4PublicationRights({
    registry: publicationRegistry([{ ...decision, attribution: { required: true, fulfilled: false, evidenceSha256: null } }]),
    receipt,
    fieldId: receipt.fieldId,
    ...context,
  }).state, 'ATTRIBUTION_UNMET');
  assert.equal(resolveFitV4PublicationRights({
    registry: publicationRegistry([{
      ...decision,
      decision: 'granted_with_conditions',
      conditions: ['provider approval remains current'],
    }]),
    receipt,
    fieldId: receipt.fieldId,
    ...context,
  }).state, 'UNKNOWN');
  assert.throws(() => validateFitV4PublicationRightsRegistry(registry, {
    ...context,
    authorizationEvidenceBytes: {},
  }), /authorization evidence/i);
  assert.throws(() => validateFitV4PublicationRightsRegistry(
    publicationRegistry([{ ...decision, fieldId: 'envelope.body.width', dictionaryFieldId: null }]),
    context,
  ), /UNMAPPED_BLOCKED|dictionary field/i);
  assert.throws(() => validateFitV4PublicationRightsRegistry(
    publicationRegistry([{ ...decision, receiptSha256: 'f'.repeat(64) }]),
    context,
  ), /receipt.*binding/i);
  assert.throws(() => validateFitV4PublicationRightsRegistry(
    publicationRegistry([{ ...decision, model: `${product.model}-OTHER` }]),
    context,
  ), /model.*binding|receipt\/model/i);
  assert.throws(() => validateFitV4PublicationRightsRegistry(
    publicationRegistry([{ ...decision, conditions: ['approval remains current'] }]),
    context,
  ), /granted.*conditions|conditions.*granted/i);
  assert.throws(() => validateFitV4PublicationRightsRegistry(
    publicationRegistry([{ ...decision, predecessorDecisionId: decision.decisionId }]),
    context,
  ), /predecessor.*self|cycle/i);
  assert.throws(() => validateFitV4PublicationRightsRegistry({ ...registry, extra: true }, context), /schema|key set/i);
});

test('real epoch binds the complete predecessor graph and partitions all 349 rows once', async () => {
  const input = await loadRealInputs();
  const before = canonicalJsonBytes(input);
  const first = buildFitV4ReadinessEpoch(input);
  const second = buildFitV4ReadinessEpoch(input);

  assert.deepEqual(second, first);
  assert.deepEqual(canonicalJsonBytes(input), before);
  assert.deepEqual(first.predecessors.map((row) => row.role), FIT_V4_READINESS_PREDECESSOR_ROLES);
  assert.deepEqual(first.summary.policyApplicability, {
    SUPPORTED: 96,
    POLICY_UNSUPPORTED: 6,
    FORM_FACTOR_REQUIRED: 247,
    CONFIGURATION_REQUIRED: 0,
    CATEGORY_UNSUPPORTED: 0,
  });
  assert.equal(first.summary.currentCatalogProducts, 349);
  assert.equal(first.summary.privateKnowledgeCompilationEligible, 0);
  assert.equal(first.summary.publicKnowledgeCompilationEligible, 0);
  assert.deepEqual(input.publicationRights.document, publicationRegistry());
  assert.equal(first.products.length, 349);
  assert.equal(new Set(first.products.map((row) => row.sourceOrdinal)).size, 349);
  assert.equal(new Set(first.products.map((row) => row.canonicalProductId)).size, 349);
  assert.ok(first.products.every((row) => row.catalogProductId && row.wp1RowIdentity));
  assert.doesNotMatch(JSON.stringify(first), /fitScore|FitOutcome|requiredCavity|scenarioSet|knowledgePayload|evaluationStatus/);
  assert.deepEqual(validateFitV4ReadinessEpoch(JSON.parse(JSON.stringify(first))), first);

  const forged = {
    ...input,
    identityMap: {
      ...input.identityMap,
      document: structuredClone(input.identityMap.document),
    },
  };
  forged.identityMap.document.catalogRows[first.products[0].sourceOrdinal].canonicalProductId = 'forged';
  forged.identityMap.bytes = canonicalJsonBytes(forged.identityMap.document);
  assert.throws(() => buildFitV4ReadinessEpoch(forged), /identity map semantic|WP1|join/i);

  const drifted = {
    ...input,
    activeRelease: {
      ...input.activeRelease,
      catalog: structuredClone(input.activeRelease.catalog),
    },
  };
  drifted.activeRelease.catalog.products[first.products[0].sourceOrdinal].id = 'forged';
  assert.throws(() => buildFitV4ReadinessEpoch(drifted), /catalog.*bytes|hash drift/i);

  const duplicate = structuredClone(first);
  duplicate.predecessors[1].role = duplicate.predecessors[0].role;
  assert.throws(() => validateFitV4ReadinessEpoch(duplicate), /predecessor.*role|duplicate/i);

  const extraFitField = structuredClone(first);
  extraFitField.products[0].fitScore = 100;
  assert.throws(() => validateFitV4ReadinessEpoch(rehashEpoch(extraFitField)), /schema|key set|fitScore/i);

  const invalidPolicyState = structuredClone(first);
  invalidPolicyState.products[0].policyApplicability.state = 'VERIFIED_FIT';
  assert.throws(() => validateFitV4ReadinessEpoch(rehashEpoch(invalidPolicyState)), /policy.*state|applicability/i);

  const summaryDrift = structuredClone(first);
  summaryDrift.summary.policyApplicability.SUPPORTED -= 1;
  summaryDrift.summary.policyApplicability.FORM_FACTOR_REQUIRED += 1;
  assert.throws(() => validateFitV4ReadinessEpoch(rehashEpoch(summaryDrift)), /summary|partition|count/i);

  const fieldStateDrift = structuredClone(first);
  const supported = fieldStateDrift.products.find((row) => row.fieldReadiness.length > 0);
  supported.fieldReadiness[0].receiptEvidence.state = 'NOT_A_STATE';
  assert.throws(() => validateFitV4ReadinessEpoch(rehashEpoch(fieldStateDrift)), /evidence.*state|receipt.*state/i);

  const fieldMapPredecessor = first.predecessors.find((row) => row.role === 'field_map');
  assert.equal(fieldMapPredecessor.semanticSha256, semanticSha(input.fieldMap.document));
});

test('readiness store identities reject path traversal before joined reads', async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), 'fit-v4-readiness-path-safe-'));
  await mkdir(join(storeRoot, 'transitions'));
  const foreignPath = join(storeRoot, '..', 'fit-v4-readiness-foreign-transition.json');
  const foreignBytes = canonicalJsonBytes({ foreign: true });
  await writeFile(foreignPath, foreignBytes);

  for (const unsafeKey of ['activeEpochId', 'activeTransitionId']) {
    const head = {
      schemaVersion: 1,
      sequence: 1,
      activeEpochId: 'fit_v4_readiness_safe',
      activeTransitionId: 'fit_v4_readiness_transition_safe',
      [unsafeKey]: '../../fit-v4-readiness-foreign-transition',
    };
    await writeFile(join(storeRoot, 'head.json'), canonicalJsonBytes(head));
    await assert.rejects(() => readFitV4ReadinessHead(storeRoot), /safe ID|unsafe|path/i);
  }

  await assert.rejects(
    () => readFitV4ReadinessTransition(storeRoot, '../../fit-v4-readiness-foreign-transition'),
    /safe ID|unsafe|path/i,
  );
  assert.deepEqual(await readFile(foreignPath), foreignBytes);
});

test('immutable materialization supports replay, durable-boundary resume, CAS and safe stale-lock recovery', async () => {
  const epoch = buildFitV4ReadinessEpoch(await loadRealInputs());
  const alternateInput = await loadRealInputs({
    producer: { producerSha256: 'c'.repeat(64), materializerSha256: 'b'.repeat(64) },
  });
  const alternateEpoch = buildFitV4ReadinessEpoch(alternateInput);
  const owner = {
    ownerToken: 'owner-a',
    pid: 1001,
    host: hostname(),
    processStartFingerprint: 'process-a-start',
  };

  for (const faultAt of ['AFTER_EPOCH', 'AFTER_TRANSITION', 'AFTER_HEAD']) {
    const storeRoot = await mkdtemp(join(tmpdir(), 'fit-v4-readiness-fault-'));
    await assert.rejects(() => materializeFitV4ReadinessEpoch({
      storeRoot,
      epoch,
      expectedHeadSha256: null,
      owner,
      now: AS_OF,
      faultAt,
    }), new RegExp(faultAt));
    const observed = await readFitV4ReadinessHead(storeRoot);
    const result = await materializeFitV4ReadinessEpoch({
      storeRoot,
      epoch,
      expectedHeadSha256: observed?.headSha256 ?? null,
      owner: { ...owner, ownerToken: `${owner.ownerToken}-${faultAt}` },
      now: AS_OF,
    });
    assert.equal(result.epochId, epoch.epochId);
    assert.equal((await readFitV4ReadinessHead(storeRoot)).head.activeEpochId, epoch.epochId);
  }

  const storeRoot = await mkdtemp(join(tmpdir(), 'fit-v4-readiness-store-'));
  const first = await materializeFitV4ReadinessEpoch({
    storeRoot,
    epoch,
    expectedHeadSha256: null,
    owner,
    now: AS_OF,
  });
  const head = await readFitV4ReadinessHead(storeRoot);
  const replay = await materializeFitV4ReadinessEpoch({
    storeRoot,
    epoch,
    expectedHeadSha256: head.headSha256,
    owner: { ...owner, ownerToken: 'owner-replay' },
    now: AS_OF,
  });
  assert.equal(first.transitionId, head.head.activeTransitionId);
  assert.equal(
    (await readFitV4ReadinessTransition(storeRoot, first.transitionId)).transition.toEpochId,
    epoch.epochId,
  );
  assert.equal(replay.status, 'NO_OP');
  assert.equal((await readFitV4ReadinessHead(storeRoot)).head.sequence, 1);
  await assert.rejects(() => materializeFitV4ReadinessEpoch({
    storeRoot,
    epoch,
    expectedHeadSha256: 'f'.repeat(64),
    owner: { ...owner, ownerToken: 'owner-stale-head' },
    now: AS_OF,
  }), /CAS|head/i);
  await assert.rejects(() => materializeFitV4ReadinessEpoch({
    storeRoot,
    epoch,
    expectedHeadSha256: head.headSha256,
    owner: { ...owner, ownerToken: 'owner-explicit-reactivate' },
    now: AS_OF,
    transitionType: 'ACTIVATE',
  }), /ACTIVATE|active head|transition lifecycle/i);

  const lifecycleRoot = await mkdtemp(join(tmpdir(), 'fit-v4-readiness-transition-lifecycle-'));
  await assert.rejects(() => materializeFitV4ReadinessEpoch({
    storeRoot: lifecycleRoot,
    epoch,
    expectedHeadSha256: null,
    owner: { ...owner, ownerToken: 'owner-invalid-first-supersede' },
    now: AS_OF,
    transitionType: 'SUPERSEDE',
  }), /SUPERSEDE|without.*head|transition lifecycle/i);
  const activation = await materializeFitV4ReadinessEpoch({
    storeRoot: lifecycleRoot,
    epoch,
    expectedHeadSha256: null,
    owner: { ...owner, ownerToken: 'owner-explicit-activate' },
    now: AS_OF,
    transitionType: 'ACTIVATE',
  });
  const activationHead = await readFitV4ReadinessHead(lifecycleRoot);
  const supersession = await materializeFitV4ReadinessEpoch({
    storeRoot: lifecycleRoot,
    epoch: alternateEpoch,
    expectedHeadSha256: activationHead.headSha256,
    owner: { ...owner, ownerToken: 'owner-explicit-supersede' },
    now: '2026-08-09T01:00:00.000Z',
    transitionType: 'SUPERSEDE',
  });
  const activationRecord = (await readFitV4ReadinessTransition(
    lifecycleRoot,
    activation.transitionId,
  )).transition;
  const supersessionRecord = (await readFitV4ReadinessTransition(
    lifecycleRoot,
    supersession.transitionId,
  )).transition;
  const invalidActivation = rehashTransition({ ...activationRecord, fromEpochId: epoch.epochId });
  const invalidSupersession = rehashTransition({ ...supersessionRecord, previousTransitionId: null });
  for (const invalid of [invalidActivation, invalidSupersession]) {
    await writeFile(
      join(lifecycleRoot, 'transitions', `${invalid.transitionId}.json`),
      canonicalJsonBytes(invalid),
    );
    await assert.rejects(
      () => readFitV4ReadinessTransition(lifecycleRoot, invalid.transitionId),
      /transition.*lifecycle|ACTIVATE|SUPERSEDE|sequence.*1|null/i,
    );
  }
  const unsafeTransitionFixtures = [
    {
      requestId: 'fit_v4_readiness_transition_unsafe_contained_id',
      record: { ...activationRecord, transitionId: '../../foreign-transition' },
    },
    (() => {
      const record = rehashTransition({ ...activationRecord, toEpochId: '../../foreign-epoch' });
      return { requestId: record.transitionId, record };
    })(),
    (() => {
      const record = rehashTransition({ ...supersessionRecord, fromEpochId: '../../foreign-epoch' });
      return { requestId: record.transitionId, record };
    })(),
    (() => {
      const record = rehashTransition({
        ...supersessionRecord,
        previousTransitionId: '../../foreign-transition',
      });
      return { requestId: record.transitionId, record };
    })(),
  ];
  for (const fixture of unsafeTransitionFixtures) {
    await writeFile(
      join(lifecycleRoot, 'transitions', `${fixture.requestId}.json`),
      canonicalJsonBytes(fixture.record),
    );
    await assert.rejects(
      () => readFitV4ReadinessTransition(lifecycleRoot, fixture.requestId),
      /safe ID|unsafe|path/i,
    );
  }

  const lockedRoot = await mkdtemp(join(tmpdir(), 'fit-v4-readiness-lock-'));
  const staleLock = {
    schemaVersion: 1,
    ownerToken: 'dead-owner',
    pid: 2222,
    host: hostname(),
    processStartFingerprint: 'dead-process-start',
    expectedHeadSha256: null,
    acquiredAt: '2026-08-01T00:00:00.000Z',
  };
  const staleBytes = canonicalJsonBytes(staleLock);
  await writeFile(join(lockedRoot, 'writer.lock'), staleBytes);
  await assert.rejects(() => materializeFitV4ReadinessEpoch({
    storeRoot: lockedRoot,
    epoch,
    expectedHeadSha256: null,
    owner,
    now: AS_OF,
  }), /lock/i);
  const recovered = await materializeFitV4ReadinessEpoch({
    storeRoot: lockedRoot,
    epoch,
    expectedHeadSha256: null,
    owner,
    now: AS_OF,
    staleRecovery: {
      expectedLockSha256: sha256(staleBytes),
      minimumAgeMs: 60_000,
      isProcessAlive: () => false,
    },
  });
  assert.equal(recovered.epochId, epoch.epochId);

  const mismatchedRoot = await mkdtemp(join(tmpdir(), 'fit-v4-readiness-path-id-'));
  await materializeFitV4ReadinessEpoch({
    storeRoot: mismatchedRoot,
    epoch,
    expectedHeadSha256: null,
    owner: { ...owner, ownerToken: 'owner-path-initial' },
    now: AS_OF,
  });
  await writeFile(
    join(mismatchedRoot, 'epochs', `${epoch.epochId}.json`),
    canonicalJsonBytes(alternateEpoch),
  );
  const mismatchedHead = await readFitV4ReadinessHead(mismatchedRoot);
  await assert.rejects(() => materializeFitV4ReadinessEpoch({
    storeRoot: mismatchedRoot,
    epoch: alternateEpoch,
    expectedHeadSha256: mismatchedHead.headSha256,
    owner: { ...owner, ownerToken: 'owner-path-mismatch' },
    now: AS_OF,
  }), /path.*identity|epoch.*identity|filename/i);
});

test('successors cannot silently remove receipt or rights history without a withdrawal', async () => {
  const grantInput = await withReceiptAndRights(await loadRealInputs());
  const grantEpoch = buildFitV4ReadinessEpoch(grantInput);
  const emptyInput = await loadRealInputs({
    asOf: '2026-08-10T00:00:00.000Z',
    clocks: {
      catalog: grantInput.clocks.catalog,
      receipt: '2026-08-10T00:00:00.000Z',
      source: '2026-08-10T00:00:00.000Z',
      rights: '2026-08-10T00:00:00.000Z',
    },
    sourceRegistry: createNotMaterializedFitV4SourceRegistry('2026-08-10T00:00:00.000Z'),
  });
  emptyInput.publicationRights.document.asOf = '2026-08-10T00:00:00.000Z';
  emptyInput.publicationRights.bytes = canonicalJsonBytes(emptyInput.publicationRights.document);
  const emptyEpoch = buildFitV4ReadinessEpoch(emptyInput);
  const storeRoot = await mkdtemp(join(tmpdir(), 'fit-v4-readiness-no-silent-removal-'));
  const owner = { ownerToken: 'owner-history', pid: 3101, host: hostname(), processStartFingerprint: 'history-start' };
  await materializeFitV4ReadinessEpoch({
    storeRoot,
    epoch: grantEpoch,
    expectedHeadSha256: null,
    owner,
    now: AS_OF,
  });
  const head = await readFitV4ReadinessHead(storeRoot);
  await assert.rejects(() => materializeFitV4ReadinessEpoch({
    storeRoot,
    epoch: emptyEpoch,
    expectedHeadSha256: head.headSha256,
    owner: { ...owner, ownerToken: 'owner-history-drop' },
    now: '2026-08-10T00:00:00.000Z',
  }), /receipt|rights|withdraw|history|safety floor/i);
});

test('rights withdrawal creates a blocked successor and rollback requires the exact revalidated floor', async () => {
  const baseInput = await withReceiptAndRights(await loadRealInputs());
  const grantEpoch = buildFitV4ReadinessEpoch(baseInput);
  const withdrawnInput = await withReceiptAndRights(await loadRealInputs({
    asOf: '2026-08-10T00:00:00.000Z',
    clocks: {
      catalog: baseInput.clocks.catalog,
      receipt: '2026-08-10T00:00:00.000Z',
      source: '2026-08-10T00:00:00.000Z',
      rights: '2026-08-10T00:00:00.000Z',
    },
    sourceRegistry: createNotMaterializedFitV4SourceRegistry('2026-08-10T00:00:00.000Z'),
  }), { withdrawn: true });
  withdrawnInput.publicationRights.document.asOf = '2026-08-10T00:00:00.000Z';
  withdrawnInput.publicationRights.bytes = canonicalJsonBytes(withdrawnInput.publicationRights.document);
  const withdrawnEpoch = buildFitV4ReadinessEpoch(withdrawnInput);
  const grantProduct = grantEpoch.products.find((row) => row.fieldReadiness.some(
    (field) => field.publicDisplayRights.state === 'ALLOWED',
  ));
  const withdrawnProduct = withdrawnEpoch.products.find(
    (row) => row.canonicalProductId === grantProduct.canonicalProductId,
  );
  assert.ok(withdrawnProduct.fieldReadiness.some((field) => field.publicDisplayRights.state === 'WITHDRAWN'));

  const storeRoot = await mkdtemp(join(tmpdir(), 'fit-v4-readiness-withdrawal-'));
  const owner = { ownerToken: 'owner-grant', pid: 3001, host: hostname(), processStartFingerprint: 'start-grant' };
  await materializeFitV4ReadinessEpoch({ storeRoot, epoch: grantEpoch, expectedHeadSha256: null, owner, now: AS_OF });
  const grantBytesBefore = await readFile(join(storeRoot, 'epochs', `${grantEpoch.epochId}.json`));
  const grantHead = await readFitV4ReadinessHead(storeRoot);
  await materializeFitV4ReadinessEpoch({
    storeRoot,
    epoch: withdrawnEpoch,
    expectedHeadSha256: grantHead.headSha256,
    owner: { ...owner, ownerToken: 'owner-withdrawn' },
    now: '2026-08-10T00:00:00.000Z',
  });
  assert.deepEqual(await readFile(join(storeRoot, 'epochs', `${grantEpoch.epochId}.json`)), grantBytesBefore);

  const withdrawnHead = await readFitV4ReadinessHead(storeRoot);
  await assert.rejects(() => materializeFitV4ReadinessEpoch({
    storeRoot,
    epoch: grantEpoch,
    expectedHeadSha256: withdrawnHead.headSha256,
    owner: { ...owner, ownerToken: 'owner-reactivate' },
    now: '2026-08-10T01:00:00.000Z',
  }), /withdraw|safety floor|regress/i);
  await assert.rejects(() => materializeFitV4ReadinessEpoch({
    storeRoot,
    epoch: grantEpoch,
    expectedHeadSha256: withdrawnHead.headSha256,
    owner: { ...owner, ownerToken: 'owner-rollback-blocked' },
    now: '2026-08-10T01:00:00.000Z',
    transitionType: 'ROLLBACK',
    revalidatedEpoch: withdrawnEpoch,
  }), /rollback.*floor|safety floor/i);
  await assert.rejects(() => materializeFitV4ReadinessEpoch({
    storeRoot,
    epoch: grantEpoch,
    expectedHeadSha256: withdrawnHead.headSha256,
    owner: { ...owner, ownerToken: 'owner-rollback-self-asserted' },
    now: '2026-08-10T01:00:00.000Z',
    transitionType: 'ROLLBACK',
    revalidatedEpoch: grantEpoch,
  }), /rollback|withdraw|safety floor|regress/i);

  const alternateInput = { ...withdrawnInput, producer: { ...withdrawnInput.producer, producerSha256: 'c'.repeat(64) } };
  const alternateEpoch = buildFitV4ReadinessEpoch(alternateInput);
  await materializeFitV4ReadinessEpoch({
    storeRoot,
    epoch: alternateEpoch,
    expectedHeadSha256: withdrawnHead.headSha256,
    owner: { ...owner, ownerToken: 'owner-alternate' },
    now: '2026-08-10T02:00:00.000Z',
  });
  const alternateHead = await readFitV4ReadinessHead(storeRoot);
  const rollback = await materializeFitV4ReadinessEpoch({
    storeRoot,
    epoch: withdrawnEpoch,
    expectedHeadSha256: alternateHead.headSha256,
    owner: { ...owner, ownerToken: 'owner-rollback' },
    now: '2026-08-10T03:00:00.000Z',
    transitionType: 'ROLLBACK',
    revalidatedEpoch: alternateEpoch,
  });
  assert.equal(rollback.status, 'ACTIVATED');
  assert.equal((await readFitV4ReadinessHead(storeRoot)).head.sequence, 4);
});

test('WP2 source has no evaluator, Fit result, network, public output or external-volume dependency', async () => {
  const moduleSource = await readFile(new URL('../../src/domain/fit-v4-readiness-epoch.mjs', import.meta.url), 'utf8');
  const materializerSource = await readFile(new URL('../../scripts/architecture-v2/build-fit-v4-readiness-epoch.mjs', import.meta.url), 'utf8');
  const source = `${moduleSource}\n${materializerSource}`;
  assert.doesNotMatch(source, /fit-decision|fit-engine|evaluator|knowledge-release|from ['"](?:node:)?(?:http|https|net)|\/Volumes\/|public\//i);
});
