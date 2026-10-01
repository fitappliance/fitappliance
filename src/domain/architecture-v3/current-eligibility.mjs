import { createHash } from 'node:crypto';

import { canonicalEvidenceJson, CANONICAL_EVIDENCE_JSON_VERSION } from '../../shared/canonical-evidence-json.mjs';
import { validateEvidenceClaimV3 } from './evidence-claim-v3.mjs';
import { verifyDirectClaimReceipt } from './evidence-claim-receipt.mjs';
import { replayVerifiedSourceBinding } from './verified-source-binding.mjs';
import { validateClaimReviewHistory } from './claim-review-decision.mjs';
import { requireV3Semantics } from './semantics.mjs';
import { createProductRelationshipAssertion } from './product-relationship-assertion.mjs';
import { resolveBrandAlias } from './brand-registry.mjs';
import { selectDocumentProfile } from './document-family-registry.mjs';

const SHA256 = /^[a-f0-9]{64}$/u;
const NODE_ID = /^fa_eligibility_[a-f0-9]{64}$/u;
const USE_KINDS = new Set(['adjudication', 'readiness', 'release-candidate']);
const KINDS = new Set(['claim', 'receipt', 'source-binding', 'relationship', ...USE_KINDS]);
const INTERNAL_ACTIONS = ['cache_source', 'cache_normalized_fields', 'retain_audit_copy'];
const PURPOSE_ACTIONS = Object.freeze({
  adjudication: INTERNAL_ACTIONS,
  public_display: [...INTERNAL_ACTIONS, 'public_display'],
  quote_excerpt: [...INTERNAL_ACTIONS, 'quote_excerpt'],
  link_documents: [...INTERNAL_ACTIONS, 'link_documents'],
});

function invalid(code, message) { const error = new TypeError(message); error.code = code; throw error; }
function compare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function hash(value) { return createHash('sha256').update(canonicalEvidenceJson(value), 'utf8').digest('hex'); }
function same(a, b) { return canonicalEvidenceJson(a) === canonicalEvidenceJson(b); }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
function clone(value) { try { return JSON.parse(canonicalEvidenceJson(value)); } catch (error) { invalid('UNSAFE_JSON', error.message); } }
function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) invalid('INVALID_SCHEMA', label + ' requires exact keys: ' + keys.join(', '));
}
function text(value, label) { if (typeof value !== 'string' || !value.trim() || value !== value.trim()) invalid('INVALID_TEXT', label + ' must be nonempty trimmed text'); return value; }
function digest(value, label) { if (!SHA256.test(text(value, label))) invalid('INVALID_HASH', label + ' must be a lowercase SHA-256'); return value; }
function array(value, label) { if (!Array.isArray(value)) invalid('INVALID_SCHEMA', label + ' must be an array'); return value; }
function timestamp(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) invalid('INVALID_TIMESTAMP', label + ' must be a canonical UTC timestamp');
  return value;
}
function interval(value, label) {
  timestamp(value.validFrom, label + '.validFrom'); timestamp(value.validUntil, label + '.validUntil');
  if (value.validFrom >= value.validUntil) invalid('INVALID_INTERVAL', label + ' has an empty or reversed interval');
}
function timeReason(value, asOf, prefix) { return asOf < value.validFrom ? prefix + '_FUTURE' : asOf >= value.validUntil ? prefix + '_EXPIRED' : null; }
function policyIdentity(value, label) { exact(value, ['policyId', 'policySha256'], label); text(value.policyId, label); digest(value.policySha256, label); }
function statusMetadata(value, label) { interval(value, label); text(value.actor, label + '.actor'); exact(value.reason, ['code', 'scope'], label + '.reason'); text(value.reason.code, label); text(value.reason.scope, label); }
function sealed(value, domain, extraKeys) {
  exact(value, ['schemaVersion', 'recordDomain', 'validFrom', 'validUntil', ...extraKeys, 'sha256'], domain);
  if (value.schemaVersion !== 1 || value.recordDomain !== domain) invalid('INVALID_DOMAIN', domain + ' version/domain mismatch');
  interval(value, domain); digest(value.sha256, domain);
  const { sha256: identity, ...payload } = value;
  if (hash(payload) !== identity) invalid('HASH_MISMATCH', domain + ' hash mismatch');
}
function resolvedPolicy(value, label) { exact(value, ['sha256', 'value'], label); digest(value.sha256, label); if (hash(value.value) !== value.sha256) invalid('HASH_MISMATCH', label + ' value mismatch'); }
function uniqueStrings(value, label) {
  const entries = array(value, label).map((entry) => text(entry, label));
  if (new Set(entries).size !== entries.length) invalid('DUPLICATE_REFERENCE', label + ' has duplicates');
  return [...entries].sort(compare);
}
function uniqueIndex(entries, key, label) {
  const result = new Map(); for (const entry of entries) { const id = key(entry); if (result.has(id)) invalid('DUPLICATE_RECORD', label + ' duplicate ' + id); result.set(id, entry); } return result;
}

function currentInputs(input) {
  const source = input.sourcePolicy;
  sealed(source, 'fit-current-source-policy-v1', ['policyId', 'purpose', 'reviewPolicy', 'semantics', 'sourcePolicies', 'sources', 'relationships']);
  text(source.policyId, 'source policy id');
  if (!Object.hasOwn(PURPOSE_ACTIONS, source.purpose)) invalid('INVALID_PURPOSE', 'purpose must use one supported action scope');
  policyIdentity(source.reviewPolicy, 'current review policy'); requireV3Semantics(source.semantics);
  exact(source.sourcePolicies, ['manufacturerPolicy', 'resolutionPolicy'], 'current source policies');
  for (const [name, policy] of Object.entries(source.sourcePolicies)) {
    resolvedPolicy(policy, name);
    if (policy.value?.schemaVersion !== 1 || typeof policy.value.policyVersion !== 'string') invalid('INVALID_POLICY', name + ' must resolve a versioned source policy');
  }
  for (const entry of array(source.sources, 'sources')) {
    exact(entry, ['bindingId', 'sourceId', 'sourceArtifactSha256', 'state', 'validFrom', 'validUntil', 'actor', 'reason'], 'source status');
    digest(entry.bindingId, 'bindingId'); text(entry.sourceId, 'sourceId'); digest(entry.sourceArtifactSha256, 'sourceArtifactSha256'); statusMetadata(entry, 'source status');
    if (!['active', 'revoked', 'unknown'].includes(entry.state)) invalid('INVALID_STATE', 'unsupported source state');
  }
  for (const entry of array(source.relationships, 'relationships')) {
    exact(entry, ['assertionId', 'state', 'validFrom', 'validUntil', 'actor', 'reason'], 'relationship status'); text(entry.assertionId, 'assertionId'); statusMetadata(entry, 'relationship status');
    if (!['active', 'revoked', 'unknown'].includes(entry.state)) invalid('INVALID_STATE', 'unsupported relationship state');
  }
  const profile = input.profileStatus;
  sealed(profile, 'fit-current-profile-status-v1', ['expectedProfilePolicySha256', 'policy', 'brandRegistry', 'profiles']);
  digest(profile.expectedProfilePolicySha256, 'expected profile policy'); resolvedPolicy(profile.policy, 'profile policy');
  if (profile.policy.value.policySha256 !== profile.expectedProfilePolicySha256) invalid('PROFILE_POLICY_BINDING', 'expected profile policy does not bind current policy');
  exact(profile.brandRegistry, ['registry', 'registrySha256'], 'brand registry');
  if (hash(profile.brandRegistry.registry) !== digest(profile.brandRegistry.registrySha256, 'brand registry')) invalid('HASH_MISMATCH', 'brand registry hash mismatch');
  for (const entry of array(profile.profiles, 'profiles')) {
    exact(entry, ['profileId', 'profileSha256', 'expectedProfilePolicySha256', 'state', 'validFrom', 'validUntil', 'actor', 'reason'], 'profile status');
    text(entry.profileId, 'profileId'); digest(entry.profileSha256, 'profileSha256'); digest(entry.expectedProfilePolicySha256, 'profile policy'); statusMetadata(entry, 'profile status');
    if (!['active', 'disabled', 'unknown'].includes(entry.state)) invalid('INVALID_STATE', 'unsupported profile state');
  }
  const rights = input.rightsDecisions;
  sealed(rights, 'fit-current-rights-v1', ['dictionary', 'decisions']);
  const dictionary = rights.dictionary;
  if (dictionary?.schemaVersion !== 1 || dictionary.rights?.defaultDecision !== 'unknown_blocked' || !same(dictionary.rights.bindingKeys, ['providerId', 'sourceId', 'fieldId', 'actionId'])) invalid('INVALID_RIGHTS_DICTIONARY', 'resolved rights dictionary must retain the existing scope contract');
  const actions = uniqueStrings(array(dictionary.rights.actions, 'rights actions').map((action) => {
    exact(action, ['id', 'description'], 'rights action'); text(action.description, 'rights action description'); return action.id;
  }), 'rights action IDs');
  const states = uniqueStrings(dictionary.rights.decisionStates, 'rights states');
  if (PURPOSE_ACTIONS[source.purpose].some((action) => !actions.includes(action)) || !states.includes('granted')) invalid('INVALID_RIGHTS_DICTIONARY', 'rights dictionary lacks the required existing action/state IDs');
  for (const entry of array(rights.decisions, 'rights decisions')) {
    exact(entry, ['providerId', 'sourceId', 'fieldId', 'actionId', 'decision', 'evidenceSha256', 'conditions', 'validFrom', 'validUntil', 'actor', 'reason'], 'rights decision');
    for (const key of ['providerId', 'sourceId', 'fieldId', 'actionId']) text(entry[key], key);
    if (!actions.includes(entry.actionId) || ![...states, 'unknown_blocked'].includes(entry.decision)) invalid('INVALID_RIGHTS_DECISION', 'rights action/state is not in the resolved dictionary');
    digest(entry.evidenceSha256, 'rights evidence'); array(entry.conditions, 'rights conditions'); statusMetadata(entry, 'rights decision');
  }
  return {
    source, profile, rights,
    sources: uniqueIndex(source.sources, (entry) => entry.bindingId, 'source status'),
    relationships: uniqueIndex(source.relationships, (entry) => entry.assertionId, 'relationship status'),
    profiles: uniqueIndex(profile.profiles, (entry) => entry.profileSha256, 'profile status'),
    actions: PURPOSE_ACTIONS[source.purpose],
  };
}

function objectCorpus(objects) {
  const byPath = new Map(); const bySha = new Map();
  for (const entry of array(objects, 'resolved objects')) {
    exact(entry, ['objectPath', 'sha256', 'bytesBase64'], 'resolved object'); text(entry.objectPath, 'object path'); digest(entry.sha256, 'object hash');
    if (entry.objectPath.startsWith('/') || entry.objectPath.includes('\\') || entry.objectPath.split('/').some((part) => part === '.' || part === '..' || part === '')) invalid('INVALID_OBJECT_PATH', 'object path must be bounded and relative');
    if (typeof entry.bytesBase64 !== 'string') invalid('INVALID_OBJECT_BYTES', 'object must have base64 bytes');
    const bytes = Buffer.from(entry.bytesBase64, 'base64');
    if (bytes.toString('base64') !== entry.bytesBase64 || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) invalid('OBJECT_HASH_MISMATCH', 'resolved object bytes/hash mismatch');
    if (byPath.has(entry.objectPath)) invalid('DUPLICATE_OBJECT', 'duplicate object path');
    byPath.set(entry.objectPath, { bytes, sha256: entry.sha256 }); bySha.set(entry.sha256, bytes);
  }
  return {
    bySha,
    readObject(objectPath) { const entry = byPath.get(objectPath); if (!entry) invalid('OBJECT_MISSING', 'unresolved object ' + objectPath); return Buffer.from(entry.bytes); },
    requireRef(ref) {
      exact(ref, ['objectPath', 'sha256', 'byteSize'], 'artifact ref'); digest(ref.sha256, 'artifact hash');
      if (!Number.isSafeInteger(ref.byteSize) || ref.byteSize < 0) invalid('INVALID_OBJECT_REF', 'artifact byteSize must be a nonnegative safe integer');
      const entry = byPath.get(ref.objectPath);
      if (!entry || entry.sha256 !== ref.sha256 || entry.bytes.length !== ref.byteSize) invalid('OBJECT_REF_MISMATCH', 'artifact reference does not resolve exact bytes');
    },
  };
}

async function resolvedGraph(graph, corpus) {
  exact(graph, ['schemaVersion', 'graphDomain', 'nodes', 'objects'], 'dependency graph');
  if (graph.schemaVersion !== 1 || graph.graphDomain !== 'fit-current-eligibility-graph-v1') invalid('INVALID_DOMAIN', 'unsupported dependency graph domain');
  const nodes = uniqueIndex(array(graph.nodes, 'nodes'), (entry) => entry.nodeId, 'node');
  const order = []; const visited = new Set(); const visiting = new Set();
  for (const entry of nodes.values()) {
    exact(entry, ['nodeId', 'kind', 'recordSha256', 'record', 'dependencies'], 'dependency node');
    if (!NODE_ID.test(entry.nodeId) || !KINDS.has(entry.kind)) invalid('INVALID_NODE_TYPE', 'node requires known type and canonical ID');
    entry.dependencies = uniqueStrings(entry.dependencies, 'dependencies');
    for (const id of entry.dependencies) if (!nodes.has(id)) invalid('DANGLING_DEPENDENCY', 'unresolved dependency ' + id);
  }
  function visit(entry) {
    if (visiting.has(entry.nodeId)) invalid('DEPENDENCY_CYCLE', 'dependency graph has a cycle');
    if (visited.has(entry.nodeId)) return;
    visiting.add(entry.nodeId); for (const id of entry.dependencies) visit(nodes.get(id)); visiting.delete(entry.nodeId); visited.add(entry.nodeId); order.push(entry);
  }
  for (const entry of [...nodes.values()].sort((a, b) => compare(a.nodeId, b.nodeId))) visit(entry);
  const claims = new Map(); const receipts = new Map(); const bindings = new Map(); const relationships = new Map();
  for (const entry of order) {
    digest(entry.recordSha256, 'node record hash');
    if (hash(entry.record) !== entry.recordSha256 || entry.nodeId !== 'fa_eligibility_' + hash({ schemaVersion: 1, nodeIdentityDomain: 'fit-current-eligibility-node-v1', kind: entry.kind, recordSha256: entry.recordSha256 })) invalid('NODE_HASH_MISMATCH', 'node identity/payload hash mismatch');
    const record = entry.record;
    if (entry.kind === 'claim') {
      exact(record, ['claim', 'validationInputs', 'relationshipAssertionIds'], 'resolved Claim'); validateEvidenceClaimV3({ claim: record.claim, validationInputs: record.validationInputs });
      uniqueStrings(record.relationshipAssertionIds, 'relationship assertion IDs');
      if (!same(record.relationshipAssertionIds, record.claim.applicabilityProof.relationshipAssertionIds)) invalid('DEPENDENCY_MISMATCH', 'resolved relationship IDs must exactly bind the actual Claim proof references');
      if (claims.has(record.claim.claimId)) invalid('DUPLICATE_RECORD', 'duplicate resolved Claim'); claims.set(record.claim.claimId, entry);
    } else if (entry.kind === 'receipt') {
      exact(record, ['receipt'], 'resolved receipt'); await verifyDirectClaimReceipt({ receipt: record.receipt, readObject: corpus.readObject });
      if (receipts.has(record.receipt.claim.claimId)) invalid('DUPLICATE_RECORD', 'multiple receipts for one Claim'); receipts.set(record.receipt.claim.claimId, entry);
    } else if (entry.kind === 'source-binding') {
      exact(record, ['sourceBinding'], 'resolved source binding'); replayVerifiedSourceBinding({ sourceBinding: record.sourceBinding, readObject: corpus.readObject });
      if (bindings.has(record.sourceBinding.bindingId)) invalid('DUPLICATE_RECORD', 'duplicate source binding'); bindings.set(record.sourceBinding.bindingId, entry);
    } else if (entry.kind === 'relationship') {
      exact(record, ['assertion', 'semantics'], 'resolved relationship');
      const assertion = record.assertion;
      const recreated = createProductRelationshipAssertion({ relation: assertion.relation, market: assertion.market, namedModels: assertion.namedModels, sharedFields: assertion.sharedFields, contexts: assertion.contexts, evidence: assertion.evidence, semantics: record.semantics });
      if (!same(assertion, recreated)) invalid('RELATIONSHIP_MISMATCH', 'relationship does not reproduce from its immutable inputs');
      if (relationships.has(assertion.assertionId)) invalid('DUPLICATE_RECORD', 'duplicate relationship'); relationships.set(assertion.assertionId, entry);
    } else {
      exact(record, ['schemaVersion', 'recordDomain', 'kind', 'artifactRef', 'inputNodeIds'], 'dependency use');
      if (record.schemaVersion !== 1 || record.recordDomain !== 'fit-current-dependency-use-v1' || record.kind !== entry.kind) invalid('INVALID_DOMAIN', 'dependency-use domain/type mismatch');
      corpus.requireRef(record.artifactRef); if (!uniqueStrings(record.inputNodeIds, 'use input IDs').length) invalid('MISSING_DEPENDENCY', 'dependency use requires inputs');
    }
  }
  function requireDependencies(entry, expected) {
    if (!same(entry.dependencies, [...new Set(expected)].sort(compare))) invalid('DEPENDENCY_MISMATCH', entry.kind + ' dependencies do not match resolved payload references');
  }
  for (const entry of order) {
    const record = entry.record; const expected = [];
    if (entry.kind === 'claim') {
      const claim = record.claim;
      if (claim.derivedFromClaimId !== null) {
        const parent = claims.get(claim.derivedFromClaimId); if (!parent) invalid('DANGLING_CLAIM_PARENT', 'derived Claim parent is unresolved'); expected.push(parent.nodeId);
        if (!record.relationshipAssertionIds.length) invalid('MISSING_RELATIONSHIP', 'derived Claim requires resolved relationship inputs');
      } else if (record.relationshipAssertionIds.length) invalid('DEPENDENCY_MISMATCH', 'direct Claim cannot hide relationship-dependent derivation');
      for (const id of record.relationshipAssertionIds) { const relation = relationships.get(id); if (!relation) invalid('DANGLING_RELATIONSHIP', 'unresolved relationship assertion'); expected.push(relation.nodeId); }
      const receipt = receipts.get(claim.claimId); if (receipt) expected.push(receipt.nodeId);
    } else if (entry.kind === 'receipt') {
      const receipt = record.receipt; const claim = claims.get(receipt.claim.claimId); const binding = bindings.get(receipt.sourceBindingId);
      const receiptInputs = binding ? { semantics: binding.record.sourceBinding.replayInputs.historicalPolicies.semantics, witnessedConditions: [], artifactRecords: binding.record.sourceBinding.g3aProof.artifactRecords, fragments: binding.record.sourceBinding.g3aProof.fragments } : null;
      if (!claim || !binding || !same(claim.record.claim, receipt.claim) || !same(claim.record.validationInputs, receiptInputs) || !same(binding.record.sourceBinding, receipt.sourceBinding)) invalid('RECEIPT_JOIN_MISMATCH', 'receipt must join the exact resolved Claim, validation proof and source binding');
      expected.push(binding.nodeId);
    } else if (USE_KINDS.has(entry.kind)) expected.push(...record.inputNodeIds);
    requireDependencies(entry, expected);
    if (USE_KINDS.has(entry.kind)) {
      const ancestors = new Set(); function collect(id) { if (ancestors.has(id)) return; ancestors.add(id); for (const parent of nodes.get(id).dependencies) collect(parent); } for (const id of expected) collect(id);
      if (![...ancestors].some((id) => nodes.get(id).kind === 'claim' && nodes.get(id).record.claim.derivedFromClaimId === null)) invalid('MISSING_CLAIM_DEPENDENCY', 'dependency use must resolve an actual direct Claim ancestor');
    }
  }
  return { nodes, order, claims, receipts, bindings, relationships };
}

/** Current authority snapshots are caller-trusted; hashes prove integrity, not a grant or public acceptance. */
export async function computeCurrentEligibility(rawInput) {
  const input = clone(rawInput);
  exact(input, ['asOf', 'activeHeads', 'sourcePolicy', 'profileStatus', 'dependencyGraph', 'rightsDecisions'], 'current eligibility input');
  timestamp(input.asOf, 'asOf');
  const current = currentInputs(input); const corpus = objectCorpus(input.dependencyGraph.objects);
  const graph = await resolvedGraph(input.dependencyGraph, corpus);
  exact(input.activeHeads, ['claims', 'decisions', 'policy'], 'active heads'); policyIdentity(input.activeHeads.policy, 'active review policy');
  const history = validateClaimReviewHistory({ claims: input.activeHeads.claims, decisions: input.activeHeads.decisions });
  const activeClaims = uniqueIndex(input.activeHeads.claims, (entry) => entry.claim.claimId, 'active Claim');
  if (activeClaims.size !== graph.claims.size || [...graph.claims].some(([id, entry]) => !activeClaims.has(id) || !same(activeClaims.get(id), { claim: entry.record.claim, validationInputs: entry.record.validationInputs }))) invalid('CLAIM_JOIN_MISMATCH', 'active heads must resolve exactly the graph Claims and validation inputs');
  const reviewHeads = new Map(history.reviewHeads.map((entry) => [entry.claimId, entry]));
  const decisions = new Map(history.decisions.map((entry) => [entry.decisionId, entry]));
  const results = new Map();
  for (const entry of graph.order) {
    const reasons = new Map();
    const add = (code, originNodeId = entry.nodeId) => { if (code) reasons.set(code + ':' + originNodeId, { code, originNodeId }); };
    for (const id of entry.dependencies) for (const reason of results.get(id).reasons) add(reason.code, reason.originNodeId);
    const { record, kind } = entry;
    if (kind === 'source-binding') {
      const binding = record.sourceBinding;
      add(timeReason(current.source, input.asOf, 'SOURCE_POLICY'));
      for (const key of ['manufacturerPolicy', 'resolutionPolicy']) if (binding.policy.source[key].sha256 !== current.source.sourcePolicies[key].sha256) add('SOURCE_POLICY_MISMATCH');
      if (binding.policy.semanticPolicySha256 !== current.source.semantics.semanticPolicySha256) add('SEMANTIC_POLICY_MISMATCH');
      const source = current.sources.get(binding.bindingId);
      if (!source) add('SOURCE_MISSING');
      else {
        if (source.sourceId !== binding.source.sourceId || source.sourceArtifactSha256 !== binding.g3aProof.artifactRecords.find((artifact) => artifact.parentSha256 === null)?.sha256) add('SOURCE_SCOPE_MISMATCH');
        add(timeReason(source, input.asOf, 'SOURCE')); if (source.state !== 'active') add(source.state === 'revoked' ? 'SOURCE_REVOKED' : 'SOURCE_UNKNOWN');
      }
    } else if (kind === 'receipt') {
      const receipt = record.receipt; const binding = receipt.sourceBinding;
      const fact = binding.verifiedFactBindings.find((entry) => entry.factBindingId === receipt.factBindingId);
      add(timeReason(current.profile, input.asOf, 'PROFILE_POLICY'));
      if (fact.profileResolution.policySha256 !== current.profile.expectedProfilePolicySha256) add('PROFILE_POLICY_MISMATCH');
      const profile = current.profiles.get(receipt.toolchain.profileIdentity.profileSha256);
      if (!profile) add('PROFILE_MISSING');
      else {
        if (profile.profileId !== receipt.toolchain.profileIdentity.profileId || profile.expectedProfilePolicySha256 !== current.profile.expectedProfilePolicySha256) add('PROFILE_POLICY_MISMATCH');
        add(timeReason(profile, input.asOf, 'PROFILE')); if (profile.state !== 'active') add(profile.state === 'disabled' ? 'PROFILE_DISABLED' : 'PROFILE_UNKNOWN');
      }
      const brand = resolveBrandAlias({ alias: binding.case.brand, market: binding.case.market, registry: current.profile.brandRegistry.registry });
      const profileReplay = binding.replayInputs.fieldAttestations.find((entry) => entry.factBindingId === receipt.factBindingId).profileReplay;
      const selected = selectDocumentProfile({ registry: { brandRegistry: current.profile.brandRegistry.registry, brandRegistrySha256: current.profile.brandRegistry.registrySha256, profilePolicy: current.profile.policy.value }, brandId: brand.brandId, category: binding.case.category, documentType: profileReplay.documentType, regionObservation: profileReplay.regionObservation });
      if (selected.status === 'invalid') invalid('INVALID_PROFILE_POLICY', selected.reasons.join(','));
      if (brand.status !== 'resolved' || selected.status !== 'selected' || selected.profile.profileSha256 !== receipt.toolchain.profileIdentity.profileSha256) add('PROFILE_CURRENT_SELECTION_MISMATCH');
      add(timeReason(current.rights, input.asOf, 'RIGHTS_POLICY'));
      if (hash(current.rights.dictionary) !== receipt.policy.rightsDictionary.sha256) add('RIGHTS_POLICY_MISMATCH');
      for (const actionId of current.actions) {
        const scoped = current.rights.decisions.filter((decision) => decision.providerId === receipt.rightsRequest.providerId && decision.sourceId === binding.source.sourceId && decision.fieldId === receipt.claim.field && decision.actionId === actionId);
        if (scoped.length !== 1) { add(scoped.length ? 'RIGHTS_CONFLICT' : 'RIGHTS_MISSING'); continue; }
        const decision = scoped[0]; add(timeReason(decision, input.asOf, 'RIGHTS'));
        if (decision.decision !== 'granted') add('RIGHTS_' + decision.decision.toUpperCase());
        if (decision.conditions.length) add('RIGHTS_CONDITIONAL');
        if (!corpus.bySha.has(decision.evidenceSha256)) add('RIGHTS_EVIDENCE_MISSING');
      }
    } else if (kind === 'claim') {
      const claim = record.claim;
      if (claim.semanticPolicySha256 !== current.source.semantics.semanticPolicySha256) add('SEMANTIC_POLICY_MISMATCH');
      if (claim.derivedFromClaimId !== null) add('DERIVATION_PROOF_UNAVAILABLE');
      else if (!graph.receipts.has(claim.claimId)) add('RECEIPT_MISSING');
      const heads = reviewHeads.get(claim.claimId);
      if (!heads) add('REVIEW_MISSING');
      else {
        if (heads.forked) add('REVIEW_FORK_QUARANTINED');
        if (heads.state !== 'admitted') add('REVIEW_' + heads.state.toUpperCase());
        for (const id of heads.headDecisionIds) {
          const decision = decisions.get(id); if (decision.decidedAt > input.asOf) add('REVIEW_FUTURE');
          if (!same(input.activeHeads.policy, current.source.reviewPolicy) || decision.policyId !== current.source.reviewPolicy.policyId || decision.policySha256 !== current.source.reviewPolicy.policySha256) add('REVIEW_POLICY_MISMATCH');
        }
      }
    } else if (kind === 'relationship') {
      add(timeReason(current.source, input.asOf, 'SOURCE_POLICY'));
      add('RELATIONSHIP_UNVERIFIED');
      if (record.assertion.semanticPolicySha256 !== current.source.semantics.semanticPolicySha256) add('SEMANTIC_POLICY_MISMATCH');
      const relation = current.relationships.get(record.assertion.assertionId);
      if (!relation) add('RELATIONSHIP_MISSING');
      else { add(timeReason(relation, input.asOf, 'RELATIONSHIP')); if (relation.state !== 'active') add(relation.state === 'revoked' ? 'RELATIONSHIP_REVOKED' : 'RELATIONSHIP_UNKNOWN'); }
    }
    const reasonList = [...reasons.values()].sort((a, b) => compare(a.code, b.code) || compare(a.originNodeId, b.originNodeId));
    results.set(entry.nodeId, { nodeId: entry.nodeId, kind, status: reasonList.length ? 'ineligible' : 'eligible', reasons: reasonList });
  }
  const resultList = [...results.values()].sort((a, b) => compare(a.nodeId, b.nodeId));
  const graphSha256 = hash({ schemaVersion: 1, graphDomain: input.dependencyGraph.graphDomain, nodes: [...graph.nodes.values()].sort((a, b) => compare(a.nodeId, b.nodeId)), objects: [...input.dependencyGraph.objects].sort((a, b) => compare(a.objectPath, b.objectPath)) });
  const payload = { schemaVersion: 1, canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION, resultDomain: 'fit-current-eligibility-v1', asOf: input.asOf, purpose: current.source.purpose, graphSha256, historySha256: history.historySha256, sourcePolicySha256: current.source.sha256, profileStatusSha256: current.profile.sha256, rightsDecisionsSha256: current.rights.sha256, results: resultList };
  return freeze({ ...payload, eligibilitySha256: hash(payload) });
}
