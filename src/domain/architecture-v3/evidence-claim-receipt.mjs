import { createHash } from 'node:crypto';

import {
  CANONICAL_EVIDENCE_JSON_VERSION,
  canonicalEvidenceJson,
} from '../../shared/canonical-evidence-json.mjs';
import { validateEvidenceClaimV3 } from './evidence-claim-v3.mjs';
import { replayVerifiedSourceBinding } from './verified-source-binding.mjs';

const RECEIPT_TYPE = 'EvidenceClaimReceipt';
const RECEIPT_SCHEMA_VERSION = 3;
const SHA256 = /^[a-f0-9]{64}$/u;

export class EvidenceClaimReceiptValidationError extends TypeError {
  constructor(code, message) {
    super(message);
    this.name = 'EvidenceClaimReceiptValidationError';
    this.code = code;
  }
}

function invalid(code, message) {
  throw new EvidenceClaimReceiptValidationError(code, message);
}

function canonicalSha256(value) {
  return createHash('sha256').update(canonicalEvidenceJson(value), 'utf8').digest('hex');
}

function stableCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function cloneJson(value, label) {
  try {
    return JSON.parse(canonicalEvidenceJson(value));
  } catch (error) {
    invalid('UNSAFE_JSON', label + ' must be strict JSON: ' + (error instanceof Error ? error.message : String(error)));
  }
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    invalid('INVALID_OBJECT', label + ' must be a JSON object');
  }
  return value;
}

function exactObject(value, label, keys) {
  plainObject(value, label);
  const allowed = new Set(keys);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') invalid('UNSAFE_JSON', label + ' cannot contain symbol keys');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
      invalid('UNSAFE_JSON', label + ' must contain only enumerable own data properties');
    }
    if (!allowed.has(key)) invalid('UNKNOWN_KEY', label + ' has unknown key ' + key);
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) invalid('MISSING_KEY', label + ' is missing key ' + key);
  }
  return value;
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim() === '' || value !== value.trim()) {
    invalid('INVALID_TEXT', label + ' must be non-empty trimmed text');
  }
  return value;
}

function digest(value, label) {
  const result = requiredText(value, label);
  if (!SHA256.test(result)) invalid('INVALID_SHA256', label + ' must be a lowercase SHA-256');
  return result;
}

function nonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) invalid('INVALID_INTEGER', label + ' must be a non-negative integer');
  return value;
}

function sameJson(left, right) {
  return canonicalEvidenceJson(left) === canonicalEvidenceJson(right);
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

function normalizeObjectRef(value, label) {
  exactObject(value, label, ['sha256', 'objectPath', 'byteSize']);
  return {
    sha256: digest(value.sha256, label + ' sha256'),
    objectPath: requiredText(value.objectPath, label + ' objectPath'),
    byteSize: nonNegativeInteger(value.byteSize, label + ' byteSize'),
  };
}

function byteBuffer(value, label) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  invalid('INVALID_OBJECT_BYTES', label + ' reader must return bytes or text');
}

function readCheckedObject(readObject, ref, label) {
  let raw;
  try {
    raw = readObject(ref.objectPath);
  } catch (error) {
    invalid('RIGHTS_OBJECT_READ_FAILED', label + ' could not be read: ' + (error instanceof Error ? error.message : String(error)));
  }
  if (raw && typeof raw.then === 'function') {
    invalid('ASYNC_READER_UNSUPPORTED', label + ' reader must be synchronous');
  }
  const bytes = byteBuffer(raw, label);
  if (bytes.length !== ref.byteSize) invalid('RIGHTS_OBJECT_SIZE_DRIFT', label + ' byte size drift');
  if (createHash('sha256').update(bytes).digest('hex') !== ref.sha256) {
    invalid('RIGHTS_OBJECT_HASH_DRIFT', label + ' SHA-256 drift');
  }
  return bytes;
}

function normalizedCreateInput(rawInput) {
  exactObject(rawInput, 'createDirectClaimReceipt input', [
    'claim', 'sourceBinding', 'factBindingId', 'anchors', 'toolchain', 'policy', 'rightsDecisions', 'readObject',
  ]);
  if (typeof rawInput.readObject !== 'function') invalid('MISSING_READER', 'readObject is required');
  const input = cloneJson({
    claim: rawInput.claim,
    sourceBinding: rawInput.sourceBinding,
    factBindingId: rawInput.factBindingId,
    anchors: rawInput.anchors,
    toolchain: rawInput.toolchain,
    policy: rawInput.policy,
    rightsDecisions: rawInput.rightsDecisions,
  }, 'createDirectClaimReceipt input');
  requiredText(input.factBindingId, 'factBindingId');
  return { input, readObject: rawInput.readObject };
}

function replayBinding(sourceBinding, readObject) {
  try {
    return replayVerifiedSourceBinding({ sourceBinding, readObject });
  } catch (error) {
    invalid('SOURCE_BINDING_REPLAY_FAILED', error instanceof Error ? error.message : String(error));
  }
}

function resolvedFact(binding, factBindingId) {
  const matches = binding.verifiedFactBindings.filter((fact) => fact.factBindingId === factBindingId);
  if (matches.length !== 1) invalid('FACT_BINDING_NOT_FOUND', 'factBindingId is not in the replayed source binding');
  const fact = matches[0];
  if (fact.profileResolution?.status !== 'resolved' || !SHA256.test(fact.extractionProfileSha256 ?? '')) {
    invalid('EXTRACTION_PROFILE_UNRESOLVED', 'replayed fact has no resolved extraction profile identity');
  }
  if (fact.claimEligible !== true) {
    invalid('FACT_NOT_CLAIM_ELIGIBLE', 'replayed fact is not eligible for direct Claim receipt construction');
  }
  return fact;
}

function expectedPolicy(binding) {
  return {
    source: binding.policy.source,
    semanticPolicySha256: binding.policy.semanticPolicySha256,
    rightsDictionary: binding.policy.rightsDictionary,
  };
}

function normalizePolicy(value, binding) {
  exactObject(value, 'policy', ['source', 'semanticPolicySha256', 'rightsDictionary']);
  const policy = cloneJson(value, 'policy');
  if (!sameJson(policy, expectedPolicy(binding))) {
    invalid('POLICY_BINDING_MISMATCH', 'policy must equal the replayed source binding policy projection');
  }
  return policy;
}

function expectedToolchain(binding, fact) {
  return {
    g3aProofSha256: binding.g3aProof.g3aProofSha256,
    profileIdentity: fact.profileResolution.profileIdentity,
  };
}

function normalizeToolchain(value, binding, fact) {
  exactObject(value, 'toolchain', ['g3aProofSha256', 'profileIdentity']);
  const toolchain = cloneJson(value, 'toolchain');
  if (!sameJson(toolchain, expectedToolchain(binding, fact))) {
    invalid('TOOLCHAIN_BINDING_MISMATCH', 'toolchain must bind the replayed G3a proof and extraction profile identity');
  }
  return toolchain;
}

function normalizeAnchors(value, fact) {
  const anchors = cloneJson(value, 'anchors');
  if (!sameJson(anchors, fact.evidence)) {
    invalid('ANCHOR_BINDING_MISMATCH', 'anchors must equal the replayed fact anchor proof');
  }
  return anchors;
}

// G4a Claim V3 owns this three-key reference shape. The complete normalized
// G3a proof remains in fact.evidence, receipt.anchors and binding.g3aProof;
// it is not discarded or caller-projected here.
function claimEvidenceProjection(fact) {
  const proof = cloneJson(fact.evidence, 'replayed fact full anchor proof');
  exactObject(proof, 'replayed fact full anchor proof', [
    'schemaVersion', 'canonicalizationVersion', 'sourceArtifactSha256',
    'artifactRecords', 'fragments', 'anchors', 'relations',
  ]);
  if (proof.canonicalizationVersion !== CANONICAL_EVIDENCE_JSON_VERSION
    || !Array.isArray(proof.artifactRecords)
    || !Array.isArray(proof.fragments)) {
    invalid('INVALID_FULL_ANCHOR_PROOF', 'replayed fact must retain its complete normalized G3a anchor proof');
  }
  return {
    sourceArtifactSha256: proof.sourceArtifactSha256,
    anchors: proof.anchors,
    relations: proof.relations,
  };
}

function validationInputsFromBinding(binding) {
  const semantics = binding.replayInputs?.historicalPolicies?.semantics;
  if (!semantics || typeof semantics !== 'object') {
    invalid('BINDING_SEMANTICS_UNAVAILABLE', 'replayed source binding has no semantic policy replay input');
  }
  return {
    semantics,
    witnessedConditions: [],
    artifactRecords: binding.g3aProof.artifactRecords,
    fragments: binding.g3aProof.fragments,
  };
}

function validateClaimAgainstFact(claim, binding, fact) {
  let validated;
  try {
    validated = validateEvidenceClaimV3({
      claim,
      validationInputs: validationInputsFromBinding(binding),
    });
  } catch (error) {
    invalid('CLAIM_VALIDATION_FAILED', error instanceof Error ? error.message : String(error));
  }
  const expected = {
    subject: {
      canonicalProductId: binding.case.canonicalProductId,
      market: binding.case.market,
    },
    field: fact.field,
    value: fact.value,
    semantics: fact.semantics,
    context: fact.context,
    sourceRepresentation: fact.sourceRepresentation,
    evidence: claimEvidenceProjection(fact),
    applicabilityProof: fact.applicabilityProof,
    semanticPolicySha256: binding.policy.semanticPolicySha256,
    extractionProfileSha256: fact.extractionProfileSha256,
    derivedFromClaimId: null,
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (!sameJson(validated[key], expectedValue)) {
      invalid('CLAIM_FACT_MISMATCH', 'Claim ' + key + ' differs from the replayed fact binding');
    }
  }
  return validated;
}

function rightsActions(binding) {
  const dictionary = binding.replayInputs?.historicalPolicies?.rightsDictionary;
  const actions = dictionary?.rights?.actions;
  if (dictionary?.schemaVersion !== 1 || !Array.isArray(actions) || actions.length === 0) {
    invalid('UNSUPPORTED_RIGHTS_DICTIONARY', 'replayed binding rights dictionary is unavailable');
  }
  const ids = actions.map((action) => action?.id);
  if (!ids.every((id) => typeof id === 'string' && id !== '') || new Set(ids).size !== ids.length) {
    invalid('UNSUPPORTED_RIGHTS_DICTIONARY', 'replayed binding rights action IDs are invalid');
  }
  return [...ids].sort(stableCompare);
}

function normalizeRightsRequest(value, binding, readObject) {
  exactObject(value, 'rightsDecisions request', ['providerId', 'requests']);
  const providerId = requiredText(value.providerId, 'rightsDecisions providerId');
  if (!Array.isArray(value.requests)) invalid('INVALID_RIGHTS_REQUEST', 'rightsDecisions requests must be an array');
  const allowedActions = new Set(rightsActions(binding));
  const seenActions = new Set();
  const requests = value.requests.map((rawRequest, index) => {
    const label = 'rightsDecisions requests[' + index + ']';
    exactObject(rawRequest, label, ['actionId', 'evidenceRefs']);
    const actionId = requiredText(rawRequest.actionId, label + ' actionId');
    if (!allowedActions.has(actionId) || seenActions.has(actionId)) {
      invalid('INVALID_RIGHTS_REQUEST', 'rightsDecisions request action must be one unique dictionary action');
    }
    seenActions.add(actionId);
    if (!Array.isArray(rawRequest.evidenceRefs)) {
      invalid('INVALID_RIGHTS_REQUEST', 'rightsDecisions evidenceRefs must be an array');
    }
    const refsBySha = new Map();
    const paths = new Set();
    for (const [refIndex, rawRef] of rawRequest.evidenceRefs.entries()) {
      const ref = normalizeObjectRef(rawRef, label + ' evidenceRefs[' + refIndex + ']');
      if (refsBySha.has(ref.sha256) || paths.has(ref.objectPath)) {
        invalid('DUPLICATE_RIGHTS_EVIDENCE_REF', 'rights evidence references must be unique');
      }
      refsBySha.set(ref.sha256, ref);
      paths.add(ref.objectPath);
    }
    const evidenceRefs = [...refsBySha.values()].sort((left, right) => stableCompare(left.sha256, right.sha256));
    for (const ref of evidenceRefs) readCheckedObject(readObject, ref, 'rights evidence for ' + actionId);
    return { actionId, evidenceRefs };
  }).sort((left, right) => stableCompare(left.actionId, right.actionId));
  return { providerId, requests };
}

function derivedRightsDecisions(rightsRequest, binding, fact) {
  const requestByAction = new Map(rightsRequest.requests.map((request) => [request.actionId, request]));
  return rightsActions(binding).map((actionId) => ({
    providerId: rightsRequest.providerId,
    sourceId: binding.source.sourceId,
    fieldId: fact.field,
    actionId,
    state: 'unknown_blocked',
    evidenceRefs: requestByAction.get(actionId)?.evidenceRefs ?? [],
  }));
}

function receiptIdentityPayload({ claim, sourceBinding, factBindingId, anchors, toolchain, policy, rightsRequest, rightsDecisions }) {
  return {
    receiptType: RECEIPT_TYPE,
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
    claim,
    sourceBinding,
    sourceBindingId: sourceBinding.bindingId,
    factBindingId,
    anchors,
    toolchain,
    policy,
    rightsRequest,
    rightsDecisions,
  };
}

export async function createDirectClaimReceipt(rawInput) {
  const { input, readObject } = normalizedCreateInput(rawInput);
  const sourceBinding = replayBinding(input.sourceBinding, readObject);
  const fact = resolvedFact(sourceBinding, input.factBindingId);
  const claim = validateClaimAgainstFact(input.claim, sourceBinding, fact);
  const anchors = normalizeAnchors(input.anchors, fact);
  const toolchain = normalizeToolchain(input.toolchain, sourceBinding, fact);
  const policy = normalizePolicy(input.policy, sourceBinding);
  const rightsRequest = normalizeRightsRequest(input.rightsDecisions, sourceBinding, readObject);
  const rightsDecisions = derivedRightsDecisions(rightsRequest, sourceBinding, fact);
  const identityPayload = receiptIdentityPayload({
    claim,
    sourceBinding,
    factBindingId: input.factBindingId,
    anchors,
    toolchain,
    policy,
    rightsRequest,
    rightsDecisions,
  });
  return freezeDeep({ ...identityPayload, receiptId: canonicalSha256(identityPayload) });
}

function normalizedVerifyInput(rawInput) {
  exactObject(rawInput, 'verifyDirectClaimReceipt input', ['receipt', 'readObject']);
  if (typeof rawInput.readObject !== 'function') invalid('MISSING_READER', 'readObject is required');
  return { receipt: cloneJson(rawInput.receipt, 'stored EvidenceClaimReceipt'), readObject: rawInput.readObject };
}

function validateStoredReceiptIdentity(receipt) {
  exactObject(receipt, 'stored EvidenceClaimReceipt', [
    'receiptType', 'schemaVersion', 'canonicalizationVersion', 'claim', 'sourceBinding', 'sourceBindingId',
    'factBindingId', 'anchors', 'toolchain', 'policy', 'rightsRequest', 'rightsDecisions', 'receiptId',
  ]);
  if (receipt.receiptType !== RECEIPT_TYPE || receipt.schemaVersion !== RECEIPT_SCHEMA_VERSION
    || receipt.canonicalizationVersion !== CANONICAL_EVIDENCE_JSON_VERSION) {
    invalid('UNSUPPORTED_RECEIPT_TYPE', 'stored receipt is not an EvidenceClaimReceipt V3');
  }
  const receiptId = digest(receipt.receiptId, 'stored receiptId');
  const { receiptId: ignoredReceiptId, ...identityPayload } = receipt;
  if (ignoredReceiptId === undefined || receiptId !== canonicalSha256(identityPayload)) {
    invalid('RECEIPT_ID_MISMATCH', 'stored receiptId does not match its identity payload');
  }
  if (receipt.sourceBindingId !== receipt.sourceBinding?.bindingId) {
    invalid('SOURCE_BINDING_ID_MISMATCH', 'stored sourceBindingId differs from stored source binding');
  }
}

export async function verifyDirectClaimReceipt(rawInput) {
  const { receipt, readObject } = normalizedVerifyInput(rawInput);
  validateStoredReceiptIdentity(receipt);
  const replayed = await createDirectClaimReceipt({
    claim: receipt.claim,
    sourceBinding: receipt.sourceBinding,
    factBindingId: receipt.factBindingId,
    anchors: receipt.anchors,
    toolchain: receipt.toolchain,
    policy: receipt.policy,
    rightsDecisions: receipt.rightsRequest,
    readObject,
  });
  if (!sameJson(receipt, replayed)) {
    invalid('RECEIPT_REPLAY_MISMATCH', 'stored EvidenceClaimReceipt does not reproduce from replayed source binding inputs');
  }
  return replayed;
}
