import { createHash } from 'node:crypto';

import {
  CANONICAL_EVIDENCE_JSON_VERSION,
  canonicalEvidenceJson,
} from '../../shared/canonical-evidence-json.mjs';
import { validateEvidenceClaimV3 } from './evidence-claim-v3.mjs';

const SCHEMA_VERSION = 1;
const IDENTITY_DOMAIN = 'fit-claim-review-decision-v1';
const ID_PREFIX = 'fa_claim_review_decision_';
const DECISION_ID = /^fa_claim_review_decision_[a-f0-9]{64}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const STATES = new Set(['admitted', 'rejected', 'quarantined', 'superseded']);
const METADATA_KEYS = [
  'state', 'reason', 'policyId', 'policySha256', 'actor', 'decidedAt',
  'idempotencyKey', 'supersedesDecisionIds', 'forkResolution',
];
const EVENT_KEYS = [
  'schemaVersion', 'canonicalizationVersion', 'decisionIdentityDomain', 'decisionId', 'claimId',
  ...METADATA_KEYS,
];

export class ClaimReviewDecisionValidationError extends TypeError {
  constructor(message) {
    super(message);
    this.name = 'ClaimReviewDecisionValidationError';
    this.code = 'INVALID_CLAIM_REVIEW_DECISION';
  }
}

function invalid(message) {
  throw new ClaimReviewDecisionValidationError(message);
}

function cloneJson(value, label) {
  try {
    return JSON.parse(canonicalEvidenceJson(value));
  } catch (error) {
    invalid(`${label} must be strict JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function exactObject(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    invalid(`${label} must be a plain object`);
  }
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) invalid(`${label} has unknown key: ${key}`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) invalid(`${label} is missing key: ${key}`);
  }
}

function text(value, label) {
  if (typeof value !== 'string' || value.trim() === '' || value !== value.trim()) {
    invalid(`${label} must be non-empty trimmed text`);
  }
  return value;
}

function digest(value, label) {
  if (!SHA256.test(text(value, label))) invalid(`${label} must be a lowercase SHA-256 digest`);
  return value;
}

function decisionId(value, label) {
  if (!DECISION_ID.test(text(value, label))) invalid(`${label} must be a canonical review decisionId`);
  return value;
}

function compare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalHash(value) {
  return createHash('sha256').update(canonicalEvidenceJson(value), 'utf8').digest('hex');
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freezeDeep(child);
  return value;
}

function resolvedClaim(value) {
  exactObject(value, 'resolved Claim', ['claim', 'validationInputs']);
  try {
    return validateEvidenceClaimV3(value);
  } catch (error) {
    invalid(`resolved Claim is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function metadata(value) {
  if (!STATES.has(value.state)) invalid('state must be admitted, rejected, quarantined or superseded');
  exactObject(value.reason, 'reason', ['code', 'scope']);
  const reason = { code: text(value.reason.code, 'reason code'), scope: text(value.reason.scope, 'reason scope') };
  const decidedAt = text(value.decidedAt, 'decidedAt');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(decidedAt)
    || !Number.isFinite(Date.parse(decidedAt)) || new Date(decidedAt).toISOString() !== decidedAt) {
    invalid('decidedAt must be a valid canonical UTC timestamp with milliseconds');
  }
  if (!Array.isArray(value.supersedesDecisionIds)) invalid('supersedesDecisionIds must be an array');
  const parents = value.supersedesDecisionIds.map((id) => decisionId(id, 'supersedesDecisionIds entry'));
  if (new Set(parents).size !== parents.length) invalid('supersedesDecisionIds must be unique');
  parents.sort(compare);
  if (typeof value.forkResolution !== 'boolean') invalid('forkResolution must be an explicit boolean');
  if (value.forkResolution ? parents.length < 2 : parents.length > 1) {
    invalid('forkResolution requires multiple supersedesDecisionIds; normal decisions have at most one parent');
  }
  return {
    state: value.state, reason, policyId: text(value.policyId, 'policyId'),
    policySha256: digest(value.policySha256, 'policySha256'), actor: text(value.actor, 'actor'), decidedAt,
    idempotencyKey: text(value.idempotencyKey, 'idempotencyKey'),
    supersedesDecisionIds: parents, forkResolution: value.forkResolution,
  };
}

function eventFromMetadata(value, claimId) {
  const payload = {
    schemaVersion: SCHEMA_VERSION, canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
    decisionIdentityDomain: IDENTITY_DOMAIN, claimId, ...metadata(value),
  };
  return freezeDeep({ ...payload, decisionId: `${ID_PREFIX}${canonicalHash(payload)}` });
}

function eventShape(value) {
  exactObject(value, 'stored decision', EVENT_KEYS);
  if (value.schemaVersion !== SCHEMA_VERSION) invalid('stored decision schemaVersion is unsupported');
  if (value.canonicalizationVersion !== CANONICAL_EVIDENCE_JSON_VERSION) {
    invalid('stored decision canonicalizationVersion is unsupported');
  }
  if (value.decisionIdentityDomain !== IDENTITY_DOMAIN) invalid('stored decision decisionIdentityDomain is unsupported');
  decisionId(value.decisionId, 'stored decision decisionId');
  digest(value.claimId, 'stored decision claimId');
}

function storedDecision(value, claim) {
  eventShape(value);
  if (value.claimId !== claim.claimId) invalid('stored decision claimId must equal the resolved Claim claimId');
  const { decisionId: suppliedId, ...payload } = value;
  if (suppliedId !== `${ID_PREFIX}${canonicalHash(payload)}`) {
    invalid('stored decision decisionId does not match its canonical identity payload');
  }
  const canonical = eventFromMetadata(value, claim.claimId);
  if (canonicalEvidenceJson(value) !== canonicalEvidenceJson(canonical)) {
    invalid('stored decision must use its canonical normalized representation');
  }
  return canonical;
}

/** Review metadata does not authenticate the actor, policy, scope or fork resolution. */
export function createClaimReviewDecision(rawInput) {
  const input = cloneJson(rawInput, 'decision input');
  exactObject(input, 'decision input', ['claim', 'validationInputs', ...METADATA_KEYS]);
  const claim = resolvedClaim({ claim: input.claim, validationInputs: input.validationInputs });
  return eventFromMetadata(input, claim.claimId);
}

export function validateClaimReviewDecision(rawInput) {
  const input = cloneJson(rawInput, 'stored decision validation input');
  exactObject(input, 'stored decision validation input', ['decision', 'claim', 'validationInputs']);
  const claim = resolvedClaim({ claim: input.claim, validationInputs: input.validationInputs });
  return storedDecision(input.decision, claim);
}

function claimIndex(values) {
  if (!Array.isArray(values)) invalid('claims must be an array of resolved Claims');
  const byId = new Map();
  for (const value of values) {
    const claim = resolvedClaim(value);
    if (byId.has(claim.claimId)) invalid(`claims has a duplicate claimId: ${claim.claimId}`);
    byId.set(claim.claimId, claim);
  }
  return byId;
}

function checkedParents(event, byId) {
  for (const id of event.supersedesDecisionIds) {
    const parent = byId.get(id);
    if (!parent) invalid(`missing parent decisionId: ${id}`);
    if (parent.claimId !== event.claimId) invalid('parent edges must be same-claim; cross-claim parents are forbidden');
  }
}

function graphHeads(events, byId) {
  const children = new Map(events.map((event) => [event.decisionId, []]));
  const indegree = new Map();
  for (const event of events) {
    checkedParents(event, byId);
    indegree.set(event.decisionId, event.supersedesDecisionIds.length);
    for (const parent of event.supersedesDecisionIds) children.get(parent).push(event.decisionId);
  }
  const queue = events.filter((event) => indegree.get(event.decisionId) === 0).map((event) => event.decisionId);
  for (let index = 0; index < queue.length; index += 1) {
    for (const child of children.get(queue[index])) {
      indegree.set(child, indegree.get(child) - 1);
      if (indegree.get(child) === 0) queue.push(child);
    }
  }
  if (queue.length !== events.length) invalid('review history contains a cyclic parent graph');
  const headsByClaim = new Map();
  for (const event of events) {
    if (children.get(event.decisionId).length !== 0) continue;
    if (!headsByClaim.has(event.claimId)) headsByClaim.set(event.claimId, []);
    headsByClaim.get(event.claimId).push(event);
  }
  return [...headsByClaim.entries()].sort(([left], [right]) => compare(left, right)).map(([claimId, heads]) => ({
    claimId, headDecisionIds: heads.map((event) => event.decisionId).sort(compare),
    state: heads.length === 1 ? heads[0].state : 'quarantined', forked: heads.length > 1,
  }));
}

function validatedHistory(input, knownClaims = claimIndex(input.claims)) {
  exactObject(input, 'review history input', ['decisions', 'claims']);
  if (!Array.isArray(input.decisions)) invalid('decisions must be an array');
  const byId = new Map();
  for (const event of input.decisions) {
    eventShape(event);
    metadata(event);
    if (byId.has(event.decisionId)) invalid(`history has a duplicate decisionId: ${event.decisionId}`);
    if (!knownClaims.has(event.claimId)) invalid(`history has an unknown claimId: ${event.claimId}`);
    byId.set(event.decisionId, event);
  }
  const events = [...byId.values()].sort((left, right) => compare(left.decisionId, right.decisionId));
  // Structural graph failures remain diagnosable even when malformed cyclic objects have bad hashes.
  const reviewHeads = graphHeads(events, byId);
  const decisions = events.map((event) => storedDecision(event, knownClaims.get(event.claimId)));
  const historySha256 = canonicalHash({
    schemaVersion: SCHEMA_VERSION, canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
    historyIdentityDomain: 'fit-claim-review-history-v1', claimIds: [...knownClaims.keys()].sort(compare), decisions,
  });
  return { result: freezeDeep({ decisions, reviewHeads, historySha256 }), byId, knownClaims };
}

/** Historical forks are structurally valid; every unresolved multi-head Claim is quarantined. */
export function validateClaimReviewHistory(rawInput) {
  const input = cloneJson(rawInput, 'review history input');
  exactObject(input, 'review history input', ['decisions', 'claims']);
  return validatedHistory(input).result;
}

/** Proposed events are evaluated in caller order against the explicit basis and preceding events. */
export function validateProposedClaimReviewDecisions(rawInput) {
  const input = cloneJson(rawInput, 'proposed decisions input');
  exactObject(input, 'proposed decisions input', ['basis', 'decisions']);
  exactObject(input.basis, 'basis', ['decisions', 'claims']);
  if (!Array.isArray(input.decisions)) invalid('proposed decisions must be an array');
  const basis = validatedHistory(input.basis);
  const byId = new Map(basis.byId);
  const currentHeads = new Map(basis.result.reviewHeads.map((row) => [row.claimId, row.headDecisionIds]));
  const events = [];
  for (const candidate of input.decisions) {
    eventShape(candidate);
    if (byId.has(candidate.decisionId)) invalid(`proposal has a duplicate decisionId: ${candidate.decisionId}`);
    const claim = basis.knownClaims.get(candidate.claimId);
    if (!claim) invalid(`proposal has an unknown claimId: ${candidate.claimId}`);
    const event = storedDecision(candidate, claim);
    checkedParents(event, byId);
    const heads = currentHeads.get(event.claimId) ?? [];
    if (heads.length === 0) {
      if (event.forkResolution || event.supersedesDecisionIds.length !== 0) invalid('first decision requires no parents');
    } else if (heads.length === 1) {
      if (event.forkResolution || canonicalEvidenceJson(event.supersedesDecisionIds) !== canonicalEvidenceJson(heads)) {
        invalid('normal replacement must supersede exactly the sole current head');
      }
    } else if (!event.forkResolution
      || canonicalEvidenceJson(event.supersedesDecisionIds) !== canonicalEvidenceJson(heads)) {
      invalid('fork resolution must supersede every current terminal head and no extra ancestor');
    }
    byId.set(event.decisionId, event);
    currentHeads.set(event.claimId, [event.decisionId]);
    events.push(event);
  }
  const proposed = validatedHistory({ decisions: [...byId.values()], claims: input.basis.claims }, basis.knownClaims).result;
  return freezeDeep({
    events, proposedReviewHeads: proposed.reviewHeads, basisHistorySha256: basis.result.historySha256,
    proposedHistorySha256: proposed.historySha256,
  });
}
