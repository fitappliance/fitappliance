import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import * as review from '../../src/domain/architecture-v3/claim-review-decision.mjs';
import { createEvidenceClaimV3, validateEvidenceClaimV3 } from '../../src/domain/architecture-v3/evidence-claim-v3.mjs';
import { createArtifactRecord, createFragment } from '../../src/domain/architecture-v3/artifact-lineage.mjs';
import { compileV3Semantics } from '../../src/domain/architecture-v3/semantics.mjs';
import { canonicalEvidenceJson } from '../../src/shared/canonical-evidence-json.mjs';

const [fieldDictionary, installationMatrix, overlay] = await Promise.all([
  readFile('data/architecture-v2/policies/product-data-field-rights-dictionary.json', 'utf8').then(JSON.parse),
  readFile('data/architecture-v2/generated/installation-evidence-applicability-matrix.json', 'utf8').then(JSON.parse),
  readFile('data/architecture-v3/policies/semantics-overlay.json', 'utf8').then(JSON.parse),
]);
const semantics = compileV3Semantics({ fieldDictionary, installationMatrix, overlay });
const hash = (value) => createHash('sha256').update(canonicalEvidenceJson(value), 'utf8').digest('hex');

function claimFixture(productDigit = '1') {
  const canonicalProductId = `fa_prod_${productDigit.repeat(24)}`;
  const sourceArtifactSha256 = 'a'.repeat(64);
  const content = { kind: 'fixture', text: 'DW60UT4I2 Overall width: 600 mm' };
  const locator = { kind: 'json_pointer', pointer: '/claims/0' };
  const fragmentSha256 = hash({
    schemaVersion: 1, canonicalizationVersion: 'fit-evidence-json-v3-1',
    fragmentIdentityDomain: 'fitappliance.fragment.v1', content, parentArtifactSha256: sourceArtifactSha256, locator,
  });
  const fragment = createFragment({ fragmentSha256, content, parentArtifactSha256: sourceArtifactSha256, locator });
  const validationInputs = {
    semantics,
    witnessedConditions: [{
      canonicalProductId, market: 'AU', configurationKey: 'underbench_worktop_removed',
      conditions: [
        { parameter: 'installationMode', operator: 'eq', value: 'underbench' },
        { parameter: 'worktop', operator: 'eq', value: 'removed' },
      ],
      applicability: 'conditional', membership: 'exact_product_market',
    }],
    artifactRecords: [createArtifactRecord({ sha256: sourceArtifactSha256, parentSha256: null,
      mediaType: 'application/pdf', toolRevision: null, optionsSha256: null })],
    fragments: [fragment],
  };
  const claim = createEvidenceClaimV3({
    subject: { canonicalProductId, market: 'AU' }, field: 'closedEnvelope.widthMm',
    value: { kind: 'fixed', value: 600, unit: 'mm' },
    semantics: { axis: 'width', measurementScope: 'product_closed_external',
      inclusions: { door: 'unknown', handle: 'unknown' }, applicability: 'required' },
    context: { configurationKey: 'underbench_worktop_removed',
      conditions: validationInputs.witnessedConditions[0].conditions,
      referenceDatum: 'envelope_extent', operatingState: { kind: 'closed', angleDegrees: null } },
    sourceRepresentation: { kind: 'named_scalar', label: 'Overall width', labelAnchorId: 'label',
      value: 600, valueAnchorId: 'value', sourceUnit: 'mm', unitAnchorId: 'unit' },
    evidence: { sourceArtifactSha256, anchors: [
      { anchorId: 'value', role: 'value', fragmentSha256 },
      { anchorId: 'unit', role: 'unit', fragmentSha256 },
      { anchorId: 'label', role: 'legend', fragmentSha256 },
      { anchorId: 'subject', role: 'subject', fragmentSha256 },
    ], relations: [] },
    applicabilityProof: { kind: 'EXACT_MODEL', namedModels: [{ canonicalProductId, model: 'DW60UT4I2' }],
      relationshipAssertionIds: [] },
    semanticPolicySha256: semantics.semanticPolicySha256,
    extractionProfileSha256: 'b'.repeat(64), derivedFromClaimId: null, validationInputs,
  });
  return { claim, validationInputs };
}

const primary = claimFixture();
function decisionInput(overrides = {}, resolved = primary) {
  return { ...resolved, state: 'admitted', reason: { code: 'evidence_reviewed', scope: 'closedEnvelope.widthMm' },
    policyId: 'review-policy-v1', policySha256: 'c'.repeat(64), actor: 'fixture-reviewer',
    decidedAt: '2026-09-30T12:00:00.000Z', idempotencyKey: 'review-width-1',
    supersedesDecisionIds: [], forkResolution: false, ...overrides };
}
function assertInvalid(operation, pattern) {
  assert.throws(operation, (error) => error instanceof review.ClaimReviewDecisionValidationError
    && pattern.test(error.message));
}

// Removing metadata validation would let a review event masquerade as accepted evidence.
test('review admission stores an immutable claim reference without publication authority', () => {
  assert.deepEqual(validateEvidenceClaimV3(primary), primary.claim);
  const event = review.createClaimReviewDecision(decisionInput());
  assert.equal(event.schemaVersion, 1);
  assert.equal(event.canonicalizationVersion, 'fit-evidence-json-v3-1');
  assert.equal(event.decisionIdentityDomain, 'fit-claim-review-decision-v1');
  assert.match(event.decisionId, /^fa_claim_review_decision_[a-f0-9]{64}$/u);
  assert.equal(event.claimId, primary.claim.claimId);
  assert.equal(event.state, 'admitted');
  assert.equal(event.decidedAt, '2026-09-30T12:00:00.000Z');
  assert.equal(Object.hasOwn(event, 'claim'), false);
  assert.equal(Object.hasOwn(event, 'accepted'), false);
  assert.equal(Object.hasOwn(event, 'eligible'), false);
  assert.deepEqual(review.validateClaimReviewDecision({ decision: event, ...primary }), event);
  assert.equal(Object.isFrozen(event), true);
  assert.equal(Object.isFrozen(event.reason), true);
  assert.equal(Object.isFrozen(event.supersedesDecisionIds), true);
});

test('factory rejects accepted and every unknown review state', () => {
  for (const state of ['accepted', 'APPROVED', '', null, 1]) {
    assertInvalid(() => review.createClaimReviewDecision(decisionInput({ state })), /state/u);
  }
});

test('factory rejects malformed reason metadata without choosing a reason taxonomy', () => {
  for (const reason of [null, {}, { code: 'x' }, { code: '', scope: 'field' },
    { code: 'x', scope: [] }, { code: 'x', scope: ' ' }, { code: 'x', scope: 'field', allowed: true }]) {
    assertInvalid(() => review.createClaimReviewDecision(decisionInput({ reason })), /reason/u);
  }
  assert.equal(review.createClaimReviewDecision(decisionInput({ reason: { code: 'custom_code', scope: 'custom_scope' } })).reason.code,
    'custom_code');
});

test('factory requires an explicit canonical valid UTC decision time', () => {
  for (const decidedAt of [undefined, null, '', '2026-09-30', '2026-09-30T12:00:00Z',
    '2026-09-30T12:00:00.000+00:00', '2026-02-30T12:00:00.000Z', '2026-09-30T24:00:00.000Z',
    '2026-09-30T12:00:60.000Z', new Date('2026-09-30T12:00:00.000Z')]) {
    assertInvalid(() => review.createClaimReviewDecision(decisionInput({ decidedAt })), /decidedAt|strict JSON/u);
  }
});

test('stored validator rejects metadata substitution under the original identity', () => {
  const event = review.createClaimReviewDecision(decisionInput());
  for (const mutation of [{ state: 'rejected' }, { actor: 'other' }, { policySha256: 'd'.repeat(64) },
    { decidedAt: '2026-09-30T12:00:01.000Z' }, { idempotencyKey: 'other-key' },
    { reason: { code: 'other', scope: 'field' } }, { forkResolution: true }]) {
    assertInvalid(() => review.validateClaimReviewDecision({ decision: { ...event, ...mutation }, ...primary }), /decisionId|identity/u);
  }
});

test('factory requires exact metadata keys and strict JSON without coercion', () => {
  for (const mutation of [{ actor: null }, { actor: ' ' }, { policyId: 1 }, { policySha256: 'c'.repeat(63) },
    { idempotencyKey: '' }, { forkResolution: 1 }, { actor: Number.POSITIVE_INFINITY },
    { accepted: true }, { claimId: primary.claim.claimId }, { state: undefined }]) {
    assertInvalid(() => review.createClaimReviewDecision(decisionInput(mutation)), /actor|policy|idempotency|forkResolution|unknown key|strict JSON/u);
  }
  const missing = decisionInput();
  delete missing.actor;
  assertInvalid(() => review.createClaimReviewDecision(missing), /missing key.*actor/u);
  let reads = 0;
  const accessor = decisionInput();
  Object.defineProperty(accessor, 'actor', { enumerable: true, get() { reads += 1; return 'reader'; } });
  assertInvalid(() => review.createClaimReviewDecision(accessor), /strict JSON/u);
  assert.equal(reads, 0);
  const symbolic = decisionInput();
  symbolic[Symbol('hidden')] = 'metadata';
  assertInvalid(() => review.createClaimReviewDecision(symbolic), /strict JSON/u);
});

test('factory validates the resolved ClaimV3 instead of accepting a claim-looking hash', () => {
  for (const claim of [{ claimId: primary.claim.claimId }, { ...primary.claim, claimId: 'd'.repeat(64) },
    { ...primary.claim, value: { kind: 'fixed', value: 601, unit: 'mm' } }]) {
    assertInvalid(() => review.createClaimReviewDecision(decisionInput({ claim })), /Claim|claim/u);
  }
  assertInvalid(() => review.createClaimReviewDecision(decisionInput({ validationInputs: { ...primary.validationInputs, fragments: [] } })),
    /Claim|claim/u);
});

test('all four review states are allowed and distinct metadata changes event identity', () => {
  const first = review.createClaimReviewDecision(decisionInput());
  for (const state of ['admitted', 'rejected', 'quarantined', 'superseded']) {
    assert.equal(review.createClaimReviewDecision(decisionInput({ state })).state, state);
  }
  for (const metadata of [{ state: 'rejected' }, { actor: 'another' }, { policyId: 'policy-2' },
    { policySha256: 'd'.repeat(64) }, { idempotencyKey: 'another' },
    { decidedAt: '2026-09-30T11:59:59.000Z' }, { reason: { code: 'another', scope: 'another' } }]) {
    assert.notEqual(review.createClaimReviewDecision(decisionInput(metadata)).decisionId, first.decisionId);
  }
  const reordered = Object.fromEntries(Object.entries(decisionInput()).reverse());
  assert.equal(review.createClaimReviewDecision(reordered).decisionId, first.decisionId);
});

test('stored validator rejects unsupported versions, unknown keys and foreign hash domains', () => {
  const event = review.createClaimReviewDecision(decisionInput());
  for (const mutation of [{ schemaVersion: 2 }, { canonicalizationVersion: 'other' },
    { decisionIdentityDomain: 'other' }, { accepted: true }, { decisionId: primary.claim.claimId },
    { decisionId: `fa_claim_review_decision_${primary.claim.claimId}` }]) {
    assertInvalid(() => review.validateClaimReviewDecision({ decision: { ...event, ...mutation }, ...primary }),
      /schemaVersion|canonicalizationVersion|decisionIdentityDomain|unknown key|decisionId/u);
  }
  const other = claimFixture('2');
  assertInvalid(() => review.validateClaimReviewDecision({ decision: event, ...other }), /claimId/u);
});

test('supersedes IDs are sorted uniquely and fork resolution is explicit metadata', () => {
  const a = `fa_claim_review_decision_${'a'.repeat(64)}`;
  const b = `fa_claim_review_decision_${'b'.repeat(64)}`;
  const event = review.createClaimReviewDecision(decisionInput({ supersedesDecisionIds: [b, a], forkResolution: true }));
  assert.deepEqual(event.supersedesDecisionIds, [a, b]);
  assert.equal(review.createClaimReviewDecision(decisionInput({ supersedesDecisionIds: [a, b], forkResolution: true })).decisionId,
    event.decisionId);
  assertInvalid(() => review.validateClaimReviewDecision({ decision: { ...event, supersedesDecisionIds: [b, a] }, ...primary }), /canonical/u);
  for (const supersedesDecisionIds of [null, [a, a], ['not-a-decision-id']]) {
    assertInvalid(() => review.createClaimReviewDecision(decisionInput({ supersedesDecisionIds })), /supersedesDecisionIds/u);
  }
  for (const metadata of [{ supersedesDecisionIds: [a, b], forkResolution: false },
    { supersedesDecisionIds: [a], forkResolution: true }, { forkResolution: true }]) {
    assertInvalid(() => review.createClaimReviewDecision(decisionInput(metadata)), /forkResolution|supersedesDecisionIds/u);
  }
});

test('event outputs detach nested caller metadata without freezing caller inputs', () => {
  const input = decisionInput();
  const event = review.createClaimReviewDecision(input);
  input.reason.scope = 'changed';
  input.supersedesDecisionIds.push(`fa_claim_review_decision_${'d'.repeat(64)}`);
  assert.equal(event.reason.scope, 'closedEnvelope.widthMm');
  assert.deepEqual(event.supersedesDecisionIds, []);
  assert.throws(() => { event.reason.scope = 'mutated'; }, TypeError);
  assert.equal(Object.isFrozen(input), false);
});

const secondary = claimFixture('2');
const claims = [primary, secondary];
function event(overrides = {}, resolved = primary) {
  return review.createClaimReviewDecision(decisionInput(overrides, resolved));
}
function chainFixture() {
  const first = event();
  const second = event({ state: 'rejected', idempotencyKey: 'review-width-2',
    decidedAt: '2026-09-29T12:00:00.000Z', supersedesDecisionIds: [first.decisionId] });
  return { first, second };
}
function forkFixture() {
  const { first, second: left } = chainFixture();
  const right = event({ state: 'admitted', idempotencyKey: 'review-width-3',
    decidedAt: '2026-09-30T13:00:00.000Z', supersedesDecisionIds: [first.decisionId] });
  return { first, left, right };
}
function history(decisions, resolved = claims) {
  return review.validateClaimReviewHistory({ decisions, claims: resolved });
}
function propose(basisDecisions, decisions, resolved = claims) {
  return review.validateProposedClaimReviewDecisions({ basis: { decisions: basisDecisions, claims: resolved }, decisions });
}

// Removing the DAG parent check would silently admit an unrelated Claim's review chain.
test('historical parent edges cannot cross Claim boundaries', () => {
  const first = event();
  const wrongClaim = event({ supersedesDecisionIds: [first.decisionId] }, secondary);
  assertInvalid(() => history([first, wrongClaim]), /same.claim|cross.claim/u);
});

test('history rejects missing parents instead of treating them as roots', () => {
  const dangling = event({ supersedesDecisionIds: [`fa_claim_review_decision_${'d'.repeat(64)}`] });
  assertInvalid(() => history([dangling]), /missing parent|dangling/u);
});

test('history rejects duplicate decision IDs without silently deduplicating records', () => {
  const first = event();
  assertInvalid(() => history([first, first]), /duplicate.*decisionId/u);
});

test('history diagnoses cyclic parent graphs before an invalid payload identity hides the cycle', () => {
  const a = `fa_claim_review_decision_${'a'.repeat(64)}`;
  const b = `fa_claim_review_decision_${'b'.repeat(64)}`;
  const first = event();
  assertInvalid(() => history([
    { ...first, decisionId: a, supersedesDecisionIds: [b] },
    { ...first, decisionId: b, supersedesDecisionIds: [a] },
  ]), /cycle|cyclic/u);
  assertInvalid(() => history([{ ...first, decisionId: a, supersedesDecisionIds: [a] }]), /cycle|cyclic/u);
});

test('history validates every known Claim and rejects unknown Claim references', () => {
  assertInvalid(() => history([event({}, secondary)], [primary]), /unknown.*claimId/u);
  assertInvalid(() => history([], [{ ...primary, claim: { ...primary.claim, claimId: 'e'.repeat(64) } }]), /Claim|claim/u);
  assertInvalid(() => history([], [primary, primary]), /duplicate.*claimId/u);
});

test('history selects the sole terminal head regardless of timestamps or record ordering', () => {
  const { first, second } = chainFixture();
  const result = history([second, first]);
  assert.deepEqual(result.reviewHeads, [{ claimId: primary.claim.claimId,
    headDecisionIds: [second.decisionId], state: 'rejected', forked: false }]);
  assert.equal(result.historySha256, history([first, second], [secondary, primary]).historySha256);
  assert.deepEqual(result.decisions.map((decision) => decision.decisionId), [first.decisionId, second.decisionId].sort());
});

test('valid historical forks remain quarantined instead of choosing the latest timestamp', () => {
  const { first, left, right } = forkFixture();
  const result = history([right, first, left]);
  assert.deepEqual(result.reviewHeads, [{ claimId: primary.claim.claimId,
    headDecisionIds: [left.decisionId, right.decisionId].sort(), state: 'quarantined', forked: true }]);
  assert.equal(result.historySha256, history([left, right, first]).historySha256);
});

test('an explicit all-head resolution leaves the historical fork intact and one new head', () => {
  const { first, left, right } = forkFixture();
  const resolution = event({ idempotencyKey: 'resolve-fork', forkResolution: true,
    supersedesDecisionIds: [left.decisionId, right.decisionId] });
  const result = history([resolution, right, first, left]);
  assert.equal(result.decisions.length, 4);
  assert.deepEqual(result.reviewHeads, [{ claimId: primary.claim.claimId,
    headDecisionIds: [resolution.decisionId], state: 'admitted', forked: false }]);
});

test('empty history has no invented review state and binds its explicit known Claim set', () => {
  assert.deepEqual(history([]).reviewHeads, []);
  assert.notEqual(history([], [primary]).historySha256, history([], claims).historySha256);
});

test('proposed first decisions require an empty parent set', () => {
  const first = event();
  assert.equal(propose([], [first]).events[0].decisionId, first.decisionId);
  assertInvalid(() => propose([], [event({ supersedesDecisionIds: [`fa_claim_review_decision_${'d'.repeat(64)}`] })]),
    /first|parent|head/u);
});

test('normal replacement must supersede exactly the sole current head', () => {
  const { first, second } = chainFixture();
  assert.equal(propose([first], [second]).proposedReviewHeads[0].headDecisionIds[0], second.decisionId);
  assertInvalid(() => propose([first], [event({ idempotencyKey: 'unrelated-root' })]), /head|parent/u);
  assertInvalid(() => propose([first, second], [event({ idempotencyKey: 'stale-parent', supersedesDecisionIds: [first.decisionId] })]),
    /head|parent/u);
});

test('a proposed incomplete fork resolution cannot erase an unresolved head', () => {
  const { first, left, right } = forkFixture();
  assertInvalid(() => propose([first, left, right], [event({ idempotencyKey: 'incomplete-fork', supersedesDecisionIds: [left.decisionId] })]),
    /fork|every.*head|all.*head/u);
});

test('proposed fork resolution must include every current head and no extra ancestors', () => {
  const { first, left, right } = forkFixture();
  const resolution = event({ idempotencyKey: 'resolve-fork', forkResolution: true,
    supersedesDecisionIds: [left.decisionId, right.decisionId] });
  const result = propose([first, left, right], [resolution]);
  assert.equal(result.proposedReviewHeads[0].state, 'admitted');
  assert.deepEqual(result.proposedReviewHeads[0].headDecisionIds, [resolution.decisionId]);
  const extra = event({ idempotencyKey: 'extra-ancestor', forkResolution: true,
    supersedesDecisionIds: [first.decisionId, left.decisionId, right.decisionId] });
  assertInvalid(() => propose([first, left, right], [extra]), /head|ancestor/u);
});

test('proposed decisions cannot reuse existing IDs or smuggle cross-Claim parents', () => {
  const first = event();
  assertInvalid(() => propose([first], [first]), /duplicate.*decisionId/u);
  assertInvalid(() => propose([first], [event({ supersedesDecisionIds: [first.decisionId] }, secondary)]), /same.claim|cross.claim/u);
  assertInvalid(() => propose([], [first, first]), /duplicate.*decisionId/u);
});

test('proposal batches use explicit sequential order and bind a history-order-independent basis', () => {
  const { first, second } = chainFixture();
  const result = propose([], [first, second]);
  assert.deepEqual(result.events.map((decision) => decision.decisionId), [first.decisionId, second.decisionId]);
  assert.deepEqual(result.proposedReviewHeads[0].headDecisionIds, [second.decisionId]);
  assertInvalid(() => propose([], [second, first]), /parent|first|head/u);
  const other = event({ idempotencyKey: 'secondary-1' }, secondary);
  const next = event({ idempotencyKey: 'third', supersedesDecisionIds: [second.decisionId] });
  const ordered = propose([first, other, second], [next]);
  const reordered = propose([second, first, other], [next], [secondary, primary]);
  assert.equal(ordered.basisHistorySha256, reordered.basisHistorySha256);
  assert.equal(ordered.proposedHistorySha256, reordered.proposedHistorySha256);
});

test('history and proposed outputs are deeply frozen detached snapshots of caller inputs', () => {
  const { first, second } = chainFixture();
  const rawFirst = structuredClone(first);
  const rawSecond = structuredClone(second);
  const basis = { decisions: [rawFirst], claims: [primary] };
  const proposed = [rawSecond];
  const before = canonicalEvidenceJson({ basis, decisions: proposed });
  const result = review.validateProposedClaimReviewDecisions({ basis, decisions: proposed });
  assert.equal(canonicalEvidenceJson({ basis, decisions: proposed }), before);
  rawSecond.reason.scope = 'mutated';
  rawFirst.reason.scope = 'mutated';
  assert.equal(result.events[0].reason.scope, 'closedEnvelope.widthMm');
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.events[0].reason), true);
  assert.equal(Object.isFrozen(result.proposedReviewHeads[0].headDecisionIds), true);
  assert.throws(() => { result.proposedReviewHeads[0].headDecisionIds.push(first.decisionId); }, TypeError);
  const graph = history([first, second]);
  assert.equal(Object.isFrozen(graph.decisions[0].reason), true);
  assert.equal(Object.isFrozen(graph.reviewHeads[0]), true);
  assert.equal(Object.isFrozen(basis), false);
});
