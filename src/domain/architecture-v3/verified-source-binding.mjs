import { createHash } from 'node:crypto';
import { load } from 'cheerio';

import { verifyAttestedResolutionArtifact } from '../evidence-artifact-verifier.mjs';
import {
  evidenceSourcePolicy,
  isOfficialBrandMarketUrl,
} from '../evidence-source-verifier.mjs';
import { createInstallationFieldReceipt, replayInstallationFieldReceipt } from '../installation-evidence-pipeline.mjs';
import { inspectMineruContentListV2 } from '../mineru-document.mjs';
import {
  CANONICAL_EVIDENCE_JSON_VERSION,
  canonicalEvidenceJson,
} from '../../shared/canonical-evidence-json.mjs';
import { validateEvidenceAnchors } from './evidence-anchors.mjs';
import { resolveBrandAlias } from './brand-registry.mjs';
import { selectDocumentProfile } from './document-family-registry.mjs';
import { routeExtractionRegion } from './region-router.mjs';
import { normalizeV3FieldValue, requireV3Semantics } from './semantics.mjs';

const SHA256 = /^[a-f0-9]{64}$/u;
const PDF_MAGIC = '%PDF-';
const ADAPTER_KINDS = new Set(['manufacturer', 'installation']);
// These are immutable G3b owner references, not a second profile registry.
const G3B_PROFILE_OWNERS = Object.freeze({
  profilePolicy: Object.freeze({
    sha256: '7eda21ad3693e8934808d4ff7e38203ba4b97e93c61d54a7fd8f52af270294a8',
    objectPath: 'data/architecture-v3/policies/document-family-profiles.json',
    byteSize: 7765,
  }),
  brandRegistry: Object.freeze({
    sha256: 'cbb4dac77938ae0f9bf40278325b42a33b0e61c6403a5212eff9e9a05e7dbf0d',
    objectPath: 'data/architecture-v3/generated/brand-registry.json',
    byteSize: 63495,
  }),
});
// These are the preflight-approved compiled semantics and V2 rights dictionary
// identities. A caller can replay their bytes, but cannot supply a new policy
// just because it is internally self-consistent.
const G4B_FROZEN_POLICY_IDENTITIES = Object.freeze({
  semanticPolicySha256: '716e6f13199569c5b35c1c3525ef383e71fa6ed18e7b5c396aa3cc0d43ce0df8',
  rightsDictionarySha256: '899195b34e31a00a288de0ec10aac2406315cd3ba3ca95ff9a2455da16d01d28',
});
const UNKNOWN_CONTEXT = freezeDeep({
  configurationKey: null,
  conditions: [],
  referenceDatum: 'unknown',
  operatingState: { kind: 'unknown', angleDegrees: null },
});

export class VerifiedSourceBindingValidationError extends TypeError {
  constructor(code, message) {
    super(message);
    this.name = 'VerifiedSourceBindingValidationError';
    this.code = code;
  }
}

function invalid(code, message) {
  throw new VerifiedSourceBindingValidationError(code, message);
}

function canonicalSha256(value) {
  return createHash('sha256').update(canonicalEvidenceJson(value), 'utf8').digest('hex');
}

function rawSha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function cloneJson(value, label) {
  try {
    return JSON.parse(canonicalEvidenceJson(value));
  } catch (error) {
    invalid('UNSAFE_JSON', `${label} must be strict JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    invalid('INVALID_OBJECT', `${label} must be a JSON object`);
  }
  return value;
}

function exactObject(value, label, keys) {
  plainObject(value, label);
  const allowed = new Set(keys);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') invalid('UNSAFE_JSON', `${label} cannot contain symbol keys`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
      invalid('UNSAFE_JSON', `${label} must contain only enumerable own data properties`);
    }
    if (!allowed.has(key)) invalid('UNKNOWN_KEY', `${label} has unknown key ${key}`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) invalid('MISSING_KEY', `${label} is missing key ${key}`);
  }
  return value;
}

function closedObject(value, label, requiredKeys, optionalKeys = []) {
  plainObject(value, label);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') invalid('UNSAFE_JSON', `${label} cannot contain symbol keys`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
      invalid('UNSAFE_JSON', `${label} must contain only enumerable own data properties`);
    }
    if (!allowed.has(key)) invalid('UNKNOWN_KEY', `${label} has unknown key ${key}`);
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(value, key)) invalid('MISSING_KEY', `${label} is missing key ${key}`);
  }
  return value;
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim() === '' || value !== value.trim()) {
    invalid('INVALID_TEXT', `${label} must be non-empty trimmed text`);
  }
  return value;
}

function digest(value, label) {
  const result = requiredText(value, label);
  if (!SHA256.test(result)) invalid('INVALID_SHA256', `${label} must be a lowercase SHA-256`);
  return result;
}

function nonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) invalid('INVALID_INTEGER', `${label} must be a non-negative integer`);
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

function stableCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function strictPointer(value, label) {
  if (value === '') return value;
  if (typeof value !== 'string' || !value.startsWith('/')) {
    invalid('INVALID_POINTER', `${label} must be a strict JSON Pointer`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '~' && value[index + 1] !== '0' && value[index + 1] !== '1') {
      invalid('INVALID_POINTER', `${label} has an invalid escape`);
    }
  }
  return value;
}

function resolvePointer(root, pointer, label) {
  strictPointer(pointer, label);
  if (pointer === '') return root;
  let current = root;
  for (const rawSegment of pointer.slice(1).split('/')) {
    const segment = rawSegment.replaceAll('~1', '/').replaceAll('~0', '~');
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]*)$/u.test(segment) || Number(segment) >= current.length) {
        invalid('OWNER_POINTER_UNRESOLVED', `${label} does not resolve`);
      }
      current = current[Number(segment)];
      continue;
    }
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, segment)) {
      invalid('OWNER_POINTER_UNRESOLVED', `${label} does not resolve`);
    }
    current = current[segment];
  }
  return current;
}

function byteBuffer(value, label) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  invalid('INVALID_OBJECT_BYTES', `${label} reader must return bytes or text`);
}

function readCheckedObject(readObject, ref, label) {
  let raw;
  try {
    raw = readObject(ref.objectPath);
  } catch (error) {
    invalid('OBJECT_READ_FAILED', `${label} could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (raw && typeof raw.then === 'function') {
    invalid('ASYNC_READER_UNSUPPORTED', `${label} reader must be synchronous`);
  }
  const bytes = byteBuffer(raw, label);
  if (bytes.length !== ref.byteSize) invalid('OBJECT_SIZE_DRIFT', `${label} byte size drift`);
  if (rawSha256(bytes) !== ref.sha256) invalid('OBJECT_HASH_DRIFT', `${label} SHA-256 drift`);
  return bytes;
}

function normalizeRef(value, label) {
  exactObject(value, label, ['sha256', 'objectPath', 'byteSize']);
  return {
    sha256: digest(value.sha256, `${label} sha256`),
    objectPath: requiredText(value.objectPath, `${label} objectPath`),
    byteSize: nonNegativeInteger(value.byteSize, `${label} byteSize`),
  };
}

function normalizeRefs(rawRefs, label) {
  if (!Array.isArray(rawRefs) || rawRefs.length === 0) {
    invalid('INVALID_OBJECT_REFS', `${label} must be a non-empty array`);
  }
  const bySha = new Map();
  const paths = new Set();
  for (const [index, rawRef] of rawRefs.entries()) {
    const ref = normalizeRef(rawRef, `${label}[${index}]`);
    if (bySha.has(ref.sha256) || paths.has(ref.objectPath)) {
      invalid('DUPLICATE_OBJECT_REF', `${label} contains a duplicate object reference`);
    }
    bySha.set(ref.sha256, ref);
    paths.add(ref.objectPath);
  }
  return [...bySha.values()].sort((left, right) => stableCompare(left.sha256, right.sha256));
}

function sameRef(left, right) {
  return left.sha256 === right.sha256
    && left.objectPath === right.objectPath
    && left.byteSize === right.byteSize;
}

function normalizeProfileReplay(value, index) {
  if (value === null || value === undefined) return null;
  exactObject(value, `fieldAttestations[${index}] profileReplay`, [
    'profilePolicyRef', 'brandRegistryRef', 'documentType', 'regionObservation',
  ]);
  return {
    profilePolicyRef: normalizeRef(value.profilePolicyRef, `fieldAttestations[${index}] profileReplay profilePolicyRef`),
    brandRegistryRef: normalizeRef(value.brandRegistryRef, `fieldAttestations[${index}] profileReplay brandRegistryRef`),
    documentType: requiredText(value.documentType, `fieldAttestations[${index}] profileReplay documentType`),
    regionObservation: cloneJson(value.regionObservation, `fieldAttestations[${index}] profileReplay regionObservation`),
  };
}

function normalizeOwnerOrigin(value) {
  exactObject(value, 'caseInput ownerOrigin', [
    'containerSha256', 'objectPath', 'byteSize', 'jsonPointer',
  ]);
  return {
    containerSha256: digest(value.containerSha256, 'caseInput ownerOrigin containerSha256'),
    objectPath: requiredText(value.objectPath, 'caseInput ownerOrigin objectPath'),
    byteSize: nonNegativeInteger(value.byteSize, 'caseInput ownerOrigin byteSize'),
    jsonPointer: strictPointer(value.jsonPointer, 'caseInput ownerOrigin jsonPointer'),
  };
}

function resolveOwner(caseInput, readObject) {
  exactObject(caseInput, 'caseInput', ['ownerOrigin', 'selectedIndex']);
  const ownerOrigin = normalizeOwnerOrigin(caseInput.ownerOrigin);
  if (caseInput.selectedIndex !== null) nonNegativeInteger(caseInput.selectedIndex, 'caseInput selectedIndex');
  const bytes = readCheckedObject(readObject, {
    sha256: ownerOrigin.containerSha256,
    objectPath: ownerOrigin.objectPath,
    byteSize: ownerOrigin.byteSize,
  }, 'canonical owner container');
  let document;
  try {
    document = cloneJson(JSON.parse(bytes.toString('utf8')), 'canonical owner container JSON');
  } catch (error) {
    if (error instanceof VerifiedSourceBindingValidationError) throw error;
    invalid('OWNER_NOT_JSON', 'canonical owner container must be JSON');
  }
  const owner = resolvePointer(document, ownerOrigin.jsonPointer, 'caseInput ownerOrigin jsonPointer');
  plainObject(owner, 'selected canonical owner');
  return { ownerOrigin, selectedIndex: caseInput.selectedIndex, owner };
}

function identityFromOwner(owner) {
  const identity = {
    canonicalProductId: requiredText(owner.canonicalProductId, 'owner canonicalProductId'),
    brand: requiredText(owner.brand, 'owner brand'),
    model: requiredText(owner.model, 'owner model'),
    category: requiredText(owner.category, 'owner category'),
  };
  if (!/^fa_prod_[a-f0-9]{24}$/u.test(identity.canonicalProductId)) {
    invalid('INVALID_CANONICAL_PRODUCT_ID', 'owner canonicalProductId must be an exact canonical product ID');
  }
  return identity;
}

function normalizedInput(rawInput) {
  plainObject(rawInput, 'verifyAndBindSource input');
  exactObject(rawInput, 'verifyAndBindSource input', [
    'adapterKind', 'caseInput', 'originalSourceReceipt', 'sourceRecord',
    'artifactRecords', 'fragments', 'readObject', 'fieldAttestations', 'historicalPolicies',
  ]);
  if (typeof rawInput.readObject !== 'function') invalid('MISSING_READER', 'readObject is required');
  const input = cloneJson({
    adapterKind: rawInput.adapterKind,
    caseInput: rawInput.caseInput,
    originalSourceReceipt: rawInput.originalSourceReceipt,
    sourceRecord: rawInput.sourceRecord,
    artifactRecords: rawInput.artifactRecords,
    fragments: rawInput.fragments,
    fieldAttestations: rawInput.fieldAttestations,
    historicalPolicies: rawInput.historicalPolicies,
  }, 'verifyAndBindSource input');
  if (!ADAPTER_KINDS.has(input.adapterKind)) {
    invalid('UNSUPPORTED_ADAPTER', 'adapterKind must be manufacturer or installation');
  }
  if (!Array.isArray(input.artifactRecords) || !Array.isArray(input.fragments)) {
    invalid('INVALID_G3A_PROOF', 'artifactRecords and fragments must be arrays');
  }
  if (!Array.isArray(input.fieldAttestations) || input.fieldAttestations.length === 0) {
    invalid('INVALID_FIELD_ATTESTATIONS', 'fieldAttestations must be a non-empty array');
  }
  exactObject(input.historicalPolicies, 'historicalPolicies', [
    'canonicalizationVersion', 'semantics', 'rightsDictionary',
  ]);
  if (input.historicalPolicies.canonicalizationVersion !== CANONICAL_EVIDENCE_JSON_VERSION) {
    invalid('UNSUPPORTED_CANONICALIZATION', 'historicalPolicies canonicalizationVersion is unsupported');
  }
  const semanticPolicy = requireV3Semantics(input.historicalPolicies.semantics);
  if (input.historicalPolicies.semantics.semanticPolicySha256
    !== G4B_FROZEN_POLICY_IDENTITIES.semanticPolicySha256) {
    invalid('UNSUPPORTED_SEMANTIC_POLICY', 'historical semantics must use the frozen G4b policy identity');
  }
  const rightsDictionary = input.historicalPolicies.rightsDictionary;
  plainObject(rightsDictionary, 'rights dictionary');
  if (rightsDictionary.schemaVersion !== 1 || typeof rightsDictionary.reviewedAt !== 'string'
    || rightsDictionary?.rights?.defaultDecision !== 'unknown_blocked'
    || !sameJson(rightsDictionary?.rights?.bindingKeys, ['providerId', 'sourceId', 'fieldId', 'actionId'])) {
    invalid('UNSUPPORTED_RIGHTS_DICTIONARY', 'rights dictionary must retain the reviewed v1 binding contract');
  }
  if (canonicalSha256(rightsDictionary) !== G4B_FROZEN_POLICY_IDENTITIES.rightsDictionarySha256) {
    invalid('UNSUPPORTED_RIGHTS_DICTIONARY', 'rights dictionary must use the frozen G4b policy identity');
  }
  return { input, semanticPolicy, readObject: rawInput.readObject };
}

function normalizeAnchorIds(value, index) {
  if (!Array.isArray(value) || value.length === 0) {
    invalid('INVALID_ANCHOR_IDS', `fieldAttestations[${index}] anchorIds must be non-empty`);
  }
  const ids = value.map((entry, position) => requiredText(entry, `fieldAttestations[${index}] anchorIds[${position}]`));
  if (new Set(ids).size !== ids.length) invalid('DUPLICATE_ANCHOR_ID', `fieldAttestations[${index}] anchorIds duplicate`);
  return [...ids].sort(stableCompare);
}

function normalizedAttestation(rawValue, adapterKind, index) {
  if (adapterKind === 'manufacturer') {
    closedObject(rawValue, `fieldAttestations[${index}]`, [
      'kind', 'sourceClaimIndex', 'factBindingId', 'anchorIds', 'anchorProof', 'objectRefs',
    ], ['profileReplay']);
    if (rawValue.kind !== 'manufacturer_v2') invalid('ADAPTER_ATTESTATION_MISMATCH', 'manufacturer adapter requires manufacturer_v2 attestations');
    return {
      kind: rawValue.kind,
      sourceClaimIndex: nonNegativeInteger(rawValue.sourceClaimIndex, `fieldAttestations[${index}] sourceClaimIndex`),
      factBindingId: requiredText(rawValue.factBindingId, `fieldAttestations[${index}] factBindingId`),
      anchorIds: normalizeAnchorIds(rawValue.anchorIds, index),
      anchorProof: cloneJson(rawValue.anchorProof, `fieldAttestations[${index}] anchorProof`),
      objectRefs: normalizeRefs(rawValue.objectRefs, `fieldAttestations[${index}] objectRefs`),
      profileReplay: normalizeProfileReplay(rawValue.profileReplay, index),
    };
  }
  closedObject(rawValue, `fieldAttestations[${index}]`, [
    'kind', 'installationReceipt', 'mineruIndexEntry', 'factBindingId', 'anchorIds', 'anchorProof', 'objectRefs',
  ], ['profileReplay']);
  if (rawValue.kind !== 'installation_v1') invalid('ADAPTER_ATTESTATION_MISMATCH', 'installation adapter requires installation_v1 attestations');
  return {
    kind: rawValue.kind,
    installationReceipt: cloneJson(rawValue.installationReceipt, `fieldAttestations[${index}] installationReceipt`),
    mineruIndexEntry: cloneJson(rawValue.mineruIndexEntry, `fieldAttestations[${index}] mineruIndexEntry`),
    factBindingId: requiredText(rawValue.factBindingId, `fieldAttestations[${index}] factBindingId`),
    anchorIds: normalizeAnchorIds(rawValue.anchorIds, index),
    anchorProof: cloneJson(rawValue.anchorProof, `fieldAttestations[${index}] anchorProof`),
    objectRefs: normalizeRefs(rawValue.objectRefs, `fieldAttestations[${index}] objectRefs`),
    profileReplay: normalizeProfileReplay(rawValue.profileReplay, index),
  };
}

function normalizeAttestations(rawAttestations, adapterKind) {
  const values = rawAttestations.map((entry, index) => normalizedAttestation(entry, adapterKind, index));
  const ids = new Set();
  for (const value of values) {
    if (ids.has(value.factBindingId)) invalid('DUPLICATE_FACT_BINDING_ID', 'fieldAttestations duplicate factBindingId');
    ids.add(value.factBindingId);
    if (value.profileReplay) {
      for (const ref of [value.profileReplay.profilePolicyRef, value.profileReplay.brandRegistryRef]) {
        if (!value.objectRefs.some((candidate) => sameRef(candidate, ref))) {
          invalid('PROFILE_OWNER_REF_UNBOUND', `field attestation ${value.factBindingId} profile owner ref is not object-bound`);
        }
      }
    }
  }
  return values.sort((left, right) => stableCompare(left.factBindingId, right.factBindingId));
}

function refMap(attestations) {
  const bySha = new Map();
  for (const attestation of attestations) {
    for (const ref of attestation.objectRefs) {
      const prior = bySha.get(ref.sha256);
      if (prior && !sameJson(prior, ref)) {
        invalid('CONFLICTING_OBJECT_REF', `object reference ${ref.sha256} has conflicting metadata`);
      }
      bySha.set(ref.sha256, ref);
    }
  }
  return bySha;
}

function requireRef(refs, expected) {
  const ref = refs.get(expected.sha256);
  if (!ref || (expected.objectPath !== null && ref.objectPath !== expected.objectPath)) {
    invalid('MISSING_REQUIRED_OBJECT', `${expected.label} object reference is missing or mismatched`);
  }
  if (expected.byteSize !== null && ref.byteSize !== expected.byteSize) {
    invalid('OBJECT_SIZE_DRIFT', `${expected.label} object reference size drift`);
  }
  return ref;
}

function readAllRefs(readObject, refs) {
  const bytesBySha = new Map();
  for (const ref of [...refs.values()].sort((left, right) => stableCompare(left.sha256, right.sha256))) {
    bytesBySha.set(ref.sha256, readCheckedObject(readObject, ref, `object ${ref.sha256}`));
  }
  return bytesBySha;
}

function normalizeFullG3aProof(artifactRecords, fragments) {
  const recordBySha = new Map();
  for (const record of artifactRecords) {
    if (!record || typeof record !== 'object' || !SHA256.test(record.sha256 ?? '') || recordBySha.has(record.sha256)) {
      invalid('INVALID_G3A_PROOF', 'artifactRecords must have unique valid hashes');
    }
    recordBySha.set(record.sha256, record);
  }
  const fragmentBySha = new Map();
  for (const fragment of fragments) {
    if (!fragment || typeof fragment !== 'object' || !SHA256.test(fragment.fragmentSha256 ?? '') || fragmentBySha.has(fragment.fragmentSha256)) {
      invalid('INVALID_G3A_PROOF', 'fragments must have unique valid hashes');
    }
    fragmentBySha.set(fragment.fragmentSha256, fragment);
  }
  return {
    artifactRecords: [...recordBySha.values()].sort((left, right) => stableCompare(left.sha256, right.sha256)),
    fragments: [...fragmentBySha.values()].sort((left, right) => stableCompare(left.fragmentSha256, right.fragmentSha256)),
  };
}

function validateFragmentBytes(fullProof, bytesBySha) {
  for (const fragment of fullProof.fragments) {
    const bytes = bytesBySha.get(fragment.parentArtifactSha256);
    if (!bytes) invalid('MISSING_FRAGMENT_OBJECT', `fragment ${fragment.fragmentSha256} parent bytes are missing`);
    const locator = fragment.locator;
    if (!locator || typeof locator !== 'object') invalid('UNRESOLVABLE_FRAGMENT_LOCATOR', 'fragment locator is invalid');
    if (locator.kind === 'text_span') {
      if (typeof fragment.content !== 'string') invalid('UNRESOLVABLE_FRAGMENT', 'text-span fragment content must be text');
      const text = bytes.toString('utf8');
      if (text.slice(locator.startUtf16CodeUnit, locator.endUtf16CodeUnit) !== fragment.content) {
        invalid('FRAGMENT_CONTENT_DRIFT', `text-span fragment ${fragment.fragmentSha256} does not resolve against bytes`);
      }
      continue;
    }
    if (locator.kind === 'json_pointer') {
      let document;
      try { document = JSON.parse(bytes.toString('utf8')); } catch {
        invalid('FRAGMENT_NOT_JSON', `json-pointer fragment ${fragment.fragmentSha256} parent is not JSON`);
      }
      const selected = resolvePointer(document, locator.pointer, `fragment ${fragment.fragmentSha256} pointer`);
      if (!sameJson(selected, fragment.content)) {
        invalid('FRAGMENT_CONTENT_DRIFT', `json-pointer fragment ${fragment.fragmentSha256} does not resolve against bytes`);
      }
      continue;
    }
    invalid('UNRESOLVABLE_FRAGMENT_LOCATOR', `fragment ${fragment.fragmentSha256} locator kind ${locator.kind} has no byte resolver`);
  }
}

function allArtifactsMustResolve(fullProof, refs, bytesBySha) {
  for (const record of fullProof.artifactRecords) {
    if (!refs.has(record.sha256) || !bytesBySha.has(record.sha256)) {
      invalid('MISSING_G3A_OBJECT', `G3a artifact ${record.sha256} is not byte-bound`);
    }
  }
}

function normalizedAnchorProof(attestation, fullProof, expectedRootSha256) {
  let proof;
  try {
    proof = validateEvidenceAnchors({
      sourceArtifactSha256: attestation.anchorProof.sourceArtifactSha256,
      anchors: attestation.anchorProof.anchors,
      relations: attestation.anchorProof.relations,
      artifactRecords: fullProof.artifactRecords,
      fragments: fullProof.fragments,
    });
  } catch (error) {
    invalid('INVALID_G3A_ANCHOR_PROOF', error instanceof Error ? error.message : String(error));
  }
  if (proof.sourceArtifactSha256 !== expectedRootSha256) {
    invalid('SOURCE_ROOT_MISMATCH', 'G3a anchor proof must root at the replayed original source');
  }
  const anchors = new Map(proof.anchors.map((anchor) => [anchor.anchorId, anchor]));
  const selected = attestation.anchorIds.map((anchorId) => {
    const anchor = anchors.get(anchorId);
    if (!anchor) invalid('DANGLING_ANCHOR_ID', `field attestation anchor ${anchorId} does not resolve`);
    return anchor;
  });
  return { proof, anchors, selected };
}

function exactSelectedAnchor(anchorState, role, label) {
  const matches = anchorState.selected.filter((anchor) => anchor.role === role);
  if (matches.length !== 1) invalid('ANCHOR_ROLE_MISMATCH', `${label} requires exactly one selected ${role} anchor`);
  return matches[0];
}

function textForAnchor(anchorState, fullProof, anchor, label) {
  const fragment = fullProof.fragments.find((entry) => entry.fragmentSha256 === anchor.fragmentSha256);
  if (!fragment) invalid('DANGLING_ANCHOR_FRAGMENT', `${label} fragment does not resolve`);
  if (typeof fragment.content !== 'string') invalid('ANCHOR_TEXT_REQUIRED', `${label} must use textual fragment content`);
  return fragment.content;
}

function exactModelAnchor(anchorState, fullProof, model) {
  const subject = exactSelectedAnchor(anchorState, 'subject', 'fact binding');
  if (textForAnchor(anchorState, fullProof, subject, 'subject').trim() !== model) {
    invalid('UNPROVED_MODEL_SCOPE', 'subject anchor must be one exact model token, not a family or multi-model row');
  }
  return subject;
}

function requireRelation(anchorState, kind, fromAnchorId, toAnchorId) {
  const found = anchorState.proof.relations.some((relation) => (
    relation.kind === kind
    && relation.fromAnchorId === fromAnchorId
    && relation.toAnchorId === toAnchorId
  ));
  if (!found) invalid('MISSING_ANCHOR_RELATION', `anchor relation ${kind} is required`);
}

function relationGap(message) {
  // This rejects only the requested relation/Claim. It does not invalidate the
  // historical source replay or classify/quarantine the original PDF.
  invalid('SOURCE_RELATION_CANDIDATE_GAP', message);
}

// G3a witnesses remain structural assertions. The only semantic path here is
// an explicit exact-model table caption and one plain two-cell scalar row in
// the already replayed HTML/MinerU object. No page-wide text or caller-derived
// object can supply the relationship. Spans, nested tables, inferred headings,
// paragraphs, multi-model captions and other layouts remain candidate gaps.
function replaySourceRelations({ anchorState, fullProof, bytesBySha, model, source, locator = null, sourceClaim = null }) {
  const roles = ['subject', 'legend', 'value', 'unit'];
  const anchors = roles.map((role) => exactSelectedAnchor(anchorState, role, 'source relation'));
  const fragments = anchors.map((anchor) => fullProof.fragments.find((f) => f.fragmentSha256 === anchor.fragmentSha256));
  const expected = [
    ['exact_model_scope', anchors[0].anchorId, anchors[1].anchorId],
    ['same_table_row', anchors[1].anchorId, anchors[2].anchorId],
    ['same_table_row', anchors[2].anchorId, anchors[3].anchorId],
  ];
  if (anchorState.proof.relations.length !== expected.length
    || anchorState.proof.relations.some((r) => !expected.some(([kind, from, to]) => (
      r.kind === kind && r.fromAnchorId === from && r.toAnchorId === to
    )))) relationGap('every emitted relation must belong to the supported exact-model scalar row');
  for (const [kind, from, to] of expected) requireRelation(anchorState, kind, from, to);

  const parentHash = source.contentSha256;
  if (fragments.some((f) => f.parentArtifactSha256 !== parentHash || f.locator.kind !== 'text_span')) {
    relationGap('relation endpoints must locate text in the replayed source object itself');
  }
  const text = bytesBySha.get(parentHash).toString('utf8');
  const tables = [];
  if (source.contentType === 'text/html') {
    tables.push({ html: text, offset: (index) => index });
  } else if (source.format === 'content_list_v2') {
    const pages = JSON.parse(text);
    let selectedLocator = locator;
    if (sourceClaim) {
      // Use the existing MinerU owner to reproduce the legacy claim's fragment
      // identity. Matching only a PDF/page or caller profile would be weaker.
      const inspected = inspectMineruContentListV2(bytesBySha.get(parentHash));
      const matches = inspected.pages[sourceClaim.page - 1]?.fragments.filter((f) => (
        f.type === 'table' && f.fragmentSha256 === sourceClaim.fragmentSha256
        && sameJson(f.bbox, sourceClaim.bbox)
      )) ?? [];
      const items = pages[sourceClaim.page - 1] ?? [];
      const indices = items.flatMap((item, index) => (
        item.type === 'table' && sameJson(item.bbox, sourceClaim.bbox) ? [index] : []
      ));
      if (matches.length !== 1 || indices.length !== 1) relationGap('legacy source locator has no supported exact table');
      selectedLocator = { page: sourceClaim.page, itemIndex: indices[0] };
    }
    const item = pages[selectedLocator?.page - 1]?.[selectedLocator?.itemIndex];
    if (item?.type !== 'table' || typeof item.content?.html !== 'string') {
      relationGap('replayed field locator is not an explicit MinerU HTML table');
    }
    // A unique literal elsewhere in the same JSON is not the selected path if
    // that path uses a different escape spelling. Require a reproducible JSON
    // encoding before the unique-literal lookup, so it resolves this item's
    // actual string rather than an equal copy in unrelated metadata.
    if (![undefined, 2, 4].some((indent) => JSON.stringify(pages, null, indent) === text.trim())) {
      relationGap('MinerU JSON encoding has no supported byte-to-string offset replay');
    }
    // Resolve the literal HTML string in the original JSON bytes. This bounded
    // resolver requires a unique standard JSON string encoding; alternative or
    // ambiguous encodings remain gaps. It never searches for just the numbers.
    const html = item.content.html;
    const literal = JSON.stringify(html);
    const start = text.indexOf(literal);
    if (start < 0 || text.indexOf(literal, start + 1) !== -1) {
      relationGap('MinerU table HTML does not have a unique byte-resolved string locator');
    }
    tables.push({ html, offset: (index) => start + 1 + JSON.stringify(html.slice(0, index)).length - 2 });
  } else {
    relationGap('replayed source format has no supported table relation resolver');
  }

  let supportedRows = 0;
  for (const { html, offset } of tables) {
    // Use the existing owners' HTML topology and original locations from ONE
    // parse. A separate location parser can omit repaired, conflicting rows.
    const $ = load(html, { sourceCodeLocationInfo: true }, false);
    const sourceSpan = (node) => {
      const span = node?.sourceCodeLocation;
      return span && Number.isInteger(span.startOffset) && Number.isInteger(span.endOffset)
        && span.startOffset >= 0 && span.endOffset > span.startOffset && span.endOffset <= html.length
        ? span : null;
    };
    const plainText = (element) => {
      const nodes = element?.children ?? [];
      if (!sourceSpan(element) || nodes.length !== 1 || nodes[0].type !== 'text') return null;
      const node = nodes[0];
      const span = sourceSpan(node);
      // parse5 offsets are exclusive-end UTF-16 source offsets, not rendered
      // text or UTF-8 byte offsets. Never fabricate spans for implicit nodes.
      if (!span) return null;
      const original = html.slice(span.startOffset, span.endOffset);
      // Check only HTML's CR/LF normalization against the parsed text. Matching
      // and offsets below use ORIGINAL text, including any CRLF edge padding;
      // entities and interior scalar/unit whitespace do not gain new syntax.
      if (original.replace(/\r\n?/gu, '\n') !== node.data) return null;
      return { data: original, startOffset: span.startOffset };
    };
    const exactSpan = (f, start, end) => f.locator.startUtf16CodeUnit === offset(start)
      && f.locator.endUtf16CodeUnit === offset(end);
    const exactText = (f, node) => node && node.data.trim() === f.content
      && exactSpan(f, node.startOffset + node.data.indexOf(f.content), node.startOffset + node.data.indexOf(f.content) + f.content.length);
    $('table').each((_, table) => {
      const tableSpan = sourceSpan(table);
      const startTag = tableSpan?.startTag;
      const endTag = tableSpan?.endTag;
      // The element end offset can be assigned when parse5 implicitly closes
      // a table at a later token. Only this table's own explicit end token
      // proves the complete original interval before content is accounted.
      if (table.namespace !== 'http://www.w3.org/1999/xhtml'
        || !startTag || !endTag
        || ![startTag.startOffset, startTag.endOffset, endTag.startOffset, endTag.endOffset]
          .every(Number.isInteger)
        || startTag.startOffset !== tableSpan.startOffset
        || endTag.endOffset !== tableSpan.endOffset
        || !(startTag.startOffset < startTag.endOffset
          && startTag.endOffset <= endTag.startOffset
          && endTag.startOffset < endTag.endOffset)
        || $(table).parents('table').length || $(table).find('table,[rowspan],[colspan]').length
        || $(table).closest('[hidden],[aria-hidden="true"],script,style,noscript,template').length
        || $(table).find('[hidden],[aria-hidden="true"],script,style,noscript,template').length) return;
      const captions = $(table).children('caption').toArray();
      if (captions.length !== 1) return;
      const caption = plainText(captions[0]);
      if (!caption || caption.data.trim() !== model || !exactText(fragments[0], caption)) return;
      const rows = $(table).find('tr').toArray();
      // An implicit tbody may group explicit rows, but an implicit row itself
      // has no original row span and cannot establish supported source scope.
      if (rows.some((row) => !sourceSpan(row))) return;
      const scalarRows = rows.filter((row) => $(row).children('td').length > 0);
      // A caption does not settle intervening model/configuration headings.
      // Support one scalar row plus the optional ordinary Dimensions/Value
      // header; do not infer scope through additional rows or annotations.
      if (scalarRows.length !== 1 || rows.length > 2) return;
      if (rows.some((row) => row !== scalarRows[0] && (
        $(row).children('th').length !== 2
        || !sameJson($(row).children('th').map((___, cell) => $(cell).text().trim()).get(), ['Dimensions', 'Value'])
      ))) return;
      if ($(table).find('*').toArray().some((node) => !['caption', 'thead', 'tbody', 'tr', 'td', 'th'].includes(node.name))) return;
      if ($(table).find('*').addBack().contents().toArray().some((node) => (
        node.type === 'text' && node.data.trim() && !['caption', 'td', 'th'].includes(node.parent?.name)
      ))) return;
      // Descendants alone can lose fostered or discarded original content.
      // Account for the ORIGINAL table range using only this parse's own tag
      // tokens and faithful text spans, never a whole subtree's enclosing span.
      const covered = [];
      for (const node of $(table).find('*').addBack().toArray()) {
        const span = sourceSpan(node);
        if (!span && node.name !== 'tbody') return;
        for (const token of [span?.startTag, span?.endTag]) {
          if (token) covered.push(token);
        }
        for (const child of node.children ?? []) {
          if (child.type === 'tag') continue;
          const textSpan = sourceSpan(child);
          // Coalesced text locations can themselves bridge discarded tokens.
          // The original slice must still explain the complete parsed text.
          if (child.type !== 'text' || !textSpan
            || html.slice(textSpan.startOffset, textSpan.endOffset).replace(/\r\n?/gu, '\n') !== child.data) return;
          covered.push(textSpan);
        }
      }
      let accountedEnd = tableSpan.startOffset;
      for (const span of covered.sort((a, b) => a.startOffset - b.startOffset)) {
        if (span.startOffset < accountedEnd || span.endOffset <= span.startOffset
          || span.endOffset > tableSpan.endOffset
          || /[^\t\n\f\r ]/u.test(html.slice(accountedEnd, span.startOffset))) return;
        accountedEnd = span.endOffset;
      }
      if (/[^\t\n\f\r ]/u.test(html.slice(accountedEnd, tableSpan.endOffset))) return;
      $(table).find('tr').each((__, row) => {
        const cells = $(row).children('td,th').toArray();
        if (cells.length !== 2) return;
        const label = plainText(cells[0]);
        const scalar = plainText(cells[1]);
        if (!exactText(fragments[1], label) || !scalar) return;
        const valueText = fragments[2].content;
        const unitText = fragments[3].content;
        // Exact full cell consumption disallows ranges, extra model tokens,
        // prefix numbers and a borrowed same-valued scalar from another row.
        if (scalar.data.trim() !== valueText + ' ' + unitText) return;
        const valueStart = scalar.startOffset + scalar.data.indexOf(valueText);
        const unitStart = valueStart + valueText.length + 1;
        if (!exactSpan(fragments[2], valueStart, valueStart + valueText.length)
          || !exactSpan(fragments[3], unitStart, unitStart + unitText.length)) return;
        supportedRows += 1;
      });
    });
  }
  if (supportedRows !== 1) relationGap('model caption and scalar endpoints do not replay to one exact source table row');
  return fragments[1].content + ' ' + fragments[2].content + ' ' + fragments[3].content;
}

function decimalAnchorValue(text, label) {
  const value = text.trim();
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(value)) {
    invalid('UNSUPPORTED_SOURCE_VALUE', `${label} must be one explicit non-negative decimal`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) invalid('UNSUPPORTED_SOURCE_VALUE', `${label} is not finite`);
  return number;
}

function fieldPolicy(semanticPolicy, sourceField) {
  const field = semanticPolicy.aliases[sourceField] ?? sourceField;
  const definition = semanticPolicy.fields[field];
  if (!definition) invalid('UNSUPPORTED_FIELD', `${sourceField} is not a supported direct V3 field`);
  return { field, definition };
}

function inclusionProjection(source) {
  return {
    door: source.includesDoor === true ? 'included' : source.includesDoor === false ? 'excluded' : 'unknown',
    handle: source.includesHandle === true ? 'included' : source.includesHandle === false ? 'excluded' : 'unknown',
  };
}

function normalizeFixed({ rawValue, sourceUnit, sourceField, applicability, inclusions, semantics }) {
  let value;
  try {
    value = normalizeV3FieldValue({
      rawValue,
      unit: sourceUnit,
      fieldPath: sourceField,
      applicability,
      inclusions,
      semantics,
    });
  } catch (error) {
    invalid('FIELD_SEMANTICS_MISMATCH', error instanceof Error ? error.message : String(error));
  }
  if (!value || value.kind !== 'fixed') invalid('UNSUPPORTED_FIELD_VALUE', 'direct G4b binding currently requires one fixed numeric field value');
  return value;
}

function sourcePolicyIdentity() {
  return {
    manufacturerPolicy: {
      schemaVersion: evidenceSourcePolicy.manufacturerPolicy.schemaVersion,
      policyVersion: evidenceSourcePolicy.manufacturerPolicy.policyVersion,
      sha256: canonicalSha256(evidenceSourcePolicy.manufacturerPolicy),
    },
    resolutionPolicy: {
      schemaVersion: evidenceSourcePolicy.resolutionPolicy.schemaVersion,
      policyVersion: evidenceSourcePolicy.resolutionPolicy.policyVersion,
      sha256: canonicalSha256(evidenceSourcePolicy.resolutionPolicy),
    },
  };
}

function marketFor({ sourceUrl, brand, discoveryProvenance = null }) {
  if (discoveryProvenance?.market === 'AU') return { market: 'AU', basis: 'replayed_discovery_market' };
  if (isOfficialBrandMarketUrl(sourceUrl, brand)) return { market: 'AU', basis: 'manufacturer_source_policy' };
  invalid('MARKET_UNPROVEN', 'market-scoped Claim requires replayed official Australian market evidence');
}

function sourceReplayRefs(source) {
  const refs = [{
    sha256: digest(source.contentSha256, 'source contentSha256'),
    objectPath: requiredText(source.objectPath, 'source objectPath'),
    byteSize: nonNegativeInteger(source.byteSize, 'source byteSize'),
    label: 'original source',
  }];
  if (source.derivedArtifact) {
    refs.push({
      sha256: digest(source.derivedArtifact.contentSha256, 'derived artifact contentSha256'),
      objectPath: requiredText(source.derivedArtifact.objectPath, 'derived artifact objectPath'),
      byteSize: source.derivedArtifact.byteSize === undefined ? null : nonNegativeInteger(source.derivedArtifact.byteSize, 'derived artifact byteSize'),
      label: 'derived artifact',
    });
    if (source.derivedArtifact.fallbackTrigger) {
      const fallback = source.derivedArtifact.fallbackTrigger;
      refs.push({
        sha256: digest(fallback.contentSha256, 'fallback trigger contentSha256'),
        objectPath: requiredText(fallback.objectPath, 'fallback trigger objectPath'),
        byteSize: fallback.byteSize === undefined ? null : nonNegativeInteger(fallback.byteSize, 'fallback trigger byteSize'),
        label: 'fallback trigger artifact',
      });
    }
  }
  if (source.discoveryProvenance?.discoveryContentSha256) {
    const discovery = source.discoveryProvenance;
    refs.push({
      sha256: digest(discovery.discoveryContentSha256, 'discovery contentSha256'),
      objectPath: requiredText(discovery.discoveryObjectPath, 'discovery objectPath'),
      byteSize: discovery.discoveryByteSize === undefined ? null : nonNegativeInteger(discovery.discoveryByteSize, 'discovery byteSize'),
      label: 'discovery artifact',
    });
  }
  return refs;
}

function verifyManufacturer({ input, ownerState, identity, attestations, refs, bytesBySha, semanticPolicy, fullProof }) {
  if (input.originalSourceReceipt === null || input.sourceRecord === null) {
    invalid('MISSING_MANUFACTURER_SOURCE', 'manufacturer binding requires the original source record and receipt');
  }
  if (ownerState.selectedIndex === null || !Array.isArray(ownerState.owner.sources)) {
    invalid('MISSING_CASE_SOURCE_OWNER', 'manufacturer binding requires an owner source index');
  }
  const source = input.sourceRecord;
  if (!sameJson(ownerState.owner.sources[ownerState.selectedIndex], source)) {
    invalid('CASE_SOURCE_MISMATCH', 'manufacturer source is not the selected immutable case-owner source');
  }
  if (!sameJson(input.originalSourceReceipt, source.verificationReceipt)) {
    invalid('ORIGINAL_RECEIPT_MISMATCH', 'originalSourceReceipt must equal the selected source verification receipt');
  }
  if (source?.identity?.brand !== identity.brand || source?.identity?.model !== identity.model
    || source?.identity?.outcome !== 'exact') {
    invalid('SOURCE_IDENTITY_MISMATCH', 'manufacturer source identity does not exactly match the owner');
  }
  const replayBytes = {};
  for (const expected of sourceReplayRefs(source)) {
    const ref = requireRef(refs, expected);
    replayBytes[expected.label] = bytesBySha.get(ref.sha256);
  }
  try {
    verifyAttestedResolutionArtifact({
      source,
      caseIdentity: { brand: identity.brand, model: identity.model, category: identity.category },
      bytes: replayBytes['original source'],
      derivedArtifactBytes: replayBytes['derived artifact'] ?? null,
      fallbackTriggerArtifactBytes: replayBytes['fallback trigger artifact'] ?? null,
      discoveryArtifactBytes: replayBytes['discovery artifact'] ?? null,
    });
  } catch (error) {
    invalid('MANUFACTURER_REPLAY_FAILED', error instanceof Error ? error.message : String(error));
  }
  const rootHash = digest(source.contentSha256, 'source contentSha256');
  const facts = attestations.map((attestation) => {
    const sourceClaim = source.claims?.[attestation.sourceClaimIndex];
    if (!sourceClaim || sourceClaim.value?.kind !== 'fixed') {
      invalid('UNSUPPORTED_SOURCE_CLAIM', 'manufacturer direct binding requires one existing fixed V2 source claim');
    }
    const anchors = normalizedAnchorProof(attestation, fullProof, rootHash);
    const subject = exactModelAnchor(anchors, fullProof, identity.model);
    const label = exactSelectedAnchor(anchors, 'legend', 'manufacturer fact');
    const value = exactSelectedAnchor(anchors, 'value', 'manufacturer fact');
    const unit = exactSelectedAnchor(anchors, 'unit', 'manufacturer fact');
    const labelText = textForAnchor(anchors, fullProof, label, 'label');
    const valueText = textForAnchor(anchors, fullProof, value, 'value');
    const unitText = textForAnchor(anchors, fullProof, unit, 'unit');
    if (labelText !== sourceClaim.sourceLabel || unitText !== sourceClaim.sourceUnit) {
      invalid('SOURCE_REPRESENTATION_MISMATCH', 'manufacturer anchor label or unit differs from the replayed source claim');
    }
    replaySourceRelations({
      anchorState: anchors, fullProof, bytesBySha, model: identity.model,
      source: source.contentType === 'application/pdf' ? source.derivedArtifact : source,
      sourceClaim: source.contentType === 'application/pdf' ? sourceClaim : null,
    });
    const rawValue = decimalAnchorValue(valueText, 'manufacturer value anchor');
    const { field, definition } = fieldPolicy(semanticPolicy, sourceClaim.field);
    const normalized = normalizeFixed({
      rawValue,
      sourceUnit: unitText,
      sourceField: sourceClaim.field,
      applicability: 'required',
      inclusions: inclusionProjection(sourceClaim),
      semantics: input.historicalPolicies.semantics,
    });
    if (normalized.fieldPath !== field || normalized.value !== sourceClaim.value.mm || normalized.unit !== 'mm') {
      invalid('SOURCE_VALUE_MISMATCH', 'manufacturer anchor value does not normalize to the replayed source claim');
    }
    return {
      factBindingId: attestation.factBindingId,
      sourceField: sourceClaim.field,
      field,
      value: { kind: 'fixed', value: normalized.value, unit: normalized.unit },
      semantics: {
        axis: definition.axis,
        measurementScope: definition.measurementScope,
        inclusions: normalized.inclusions,
        applicability: 'unknown',
      },
      context: UNKNOWN_CONTEXT,
      sourceRepresentation: {
        kind: 'named_scalar',
        label: labelText,
        labelAnchorId: label.anchorId,
        value: rawValue,
        valueAnchorId: value.anchorId,
        sourceUnit: unitText,
        unitAnchorId: unit.anchorId,
      },
      evidence: anchors.proof,
      applicabilityProof: {
        kind: 'EXACT_MODEL',
        namedModels: [{ canonicalProductId: identity.canonicalProductId, model: identity.model }],
        relationshipAssertionIds: [],
      },
      claimEligible: false,
      claimBlocker: 'LEGACY_APPLICABILITY_UNKNOWN',
    };
  });
  return {
    source: {
      sourceId: rootHash,
      contentSha256: rootHash,
      sourceUrl: source.sourceUrl,
      authority: source.authority,
      documentRole: 'unknown',
      market: marketFor({
        sourceUrl: source.sourceUrl,
        brand: identity.brand,
        discoveryProvenance: source.discoveryProvenance,
      }),
    },
    facts,
    historicalReceipt: source.verificationReceipt,
  };
}

function verifyInstallation({ input, ownerState, identity, attestations, refs, bytesBySha, semanticPolicy, fullProof }) {
  if (input.originalSourceReceipt !== null || input.sourceRecord !== null) {
    invalid('INSTALLATION_STANDALONE_ONLY', 'standalone installation binding must not carry a manufacturer source receipt');
  }
  if (ownerState.selectedIndex !== null) {
    invalid('INSTALLATION_OWNER_INDEX', 'installation owner must point directly at one receipt');
  }
  const facts = attestations.map((attestation) => {
    const receipt = attestation.installationReceipt;
    if (!sameJson(ownerState.owner, receipt)) {
      invalid('CASE_RECEIPT_MISMATCH', 'installation receipt is not the selected immutable owner record');
    }
    if (receipt.canonicalProductId !== identity.canonicalProductId || receipt.brand !== identity.brand
      || receipt.model !== identity.model || receipt.category !== identity.category) {
      invalid('INSTALLATION_IDENTITY_MISMATCH', 'installation receipt identity differs from its immutable owner');
    }
    const evidence = receipt.evidence;
    const pdfHash = digest(evidence?.pdfSha256, 'installation PDF sha256');
    const pdfRef = requireRef(refs, {
      sha256: pdfHash,
      objectPath: null,
      byteSize: null,
      label: 'installation original PDF',
    });
    const pdfBytes = bytesBySha.get(pdfRef.sha256);
    if (!pdfBytes || !pdfBytes.subarray(0, PDF_MAGIC.length).toString('ascii').startsWith(PDF_MAGIC)) {
      invalid('INVALID_PDF_MAGIC', 'installation original PDF must have PDF magic bytes');
    }
    if (!Array.isArray(attestation.mineruIndexEntry?.paths)
      || !attestation.mineruIndexEntry.paths.includes(pdfRef.objectPath)
      || attestation.mineruIndexEntry.byteSize !== pdfRef.byteSize) {
      invalid('INSTALLATION_PDF_PROVENANCE_MISMATCH', 'installation index does not bind the original PDF path and size');
    }
    const mineruHash = digest(evidence?.mineru?.contentSha256, 'installation MinerU sha256');
    const mineruRef = requireRef(refs, {
      sha256: mineruHash,
      objectPath: requiredText(evidence?.mineru?.objectPath, 'installation MinerU objectPath'),
      byteSize: null,
      label: 'installation MinerU JSON',
    });
    if (attestation.mineruIndexEntry?.derivedArtifact?.byteSize !== mineruRef.byteSize) {
      invalid('INSTALLATION_MINERU_PROVENANCE_MISMATCH', 'installation index does not bind the MinerU byte size');
    }
    try {
      replayInstallationFieldReceipt(receipt, {
        jsonBytes: bytesBySha.get(mineruRef.sha256),
        indexEntry: attestation.mineruIndexEntry,
      });
    } catch (error) {
      invalid('INSTALLATION_REPLAY_FAILED', error instanceof Error ? error.message : String(error));
    }
    const anchors = normalizedAnchorProof(attestation, fullProof, pdfHash);
    const subject = exactModelAnchor(anchors, fullProof, identity.model);
    const label = exactSelectedAnchor(anchors, 'legend', 'installation fact');
    const value = exactSelectedAnchor(anchors, 'value', 'installation fact');
    const unit = exactSelectedAnchor(anchors, 'unit', 'installation fact');
    const labelText = textForAnchor(anchors, fullProof, label, 'label');
    const valueText = textForAnchor(anchors, fullProof, value, 'value');
    const unitText = textForAnchor(anchors, fullProof, unit, 'unit');
    if (!evidence.quote.includes(labelText)) {
      invalid('SOURCE_REPRESENTATION_MISMATCH', 'installation label anchor is outside the replayed receipt quote');
    }
    const rowQuote = replaySourceRelations({
      anchorState: anchors, fullProof, bytesBySha, model: identity.model,
      source: evidence.mineru, locator: evidence.locator,
    });
    try {
      // Reuse the existing owner's same-segment field/value semantics on the
      // byte-resolved row. This local check is discarded: it is not an issued
      // replacement receipt and does not replace the original full replay.
      createInstallationFieldReceipt({
        canonicalProductId: receipt.canonicalProductId,
        category: receipt.category, brand: receipt.brand, model: receipt.model,
        formFactor: receipt.formFactor, field: receipt.field,
        applicability: receipt.applicability, value: receipt.value, unit: receipt.unit,
        sourceUrl: evidence.sourceUrl, sourceStatus: evidence.sourceStatus,
        observedAt: evidence.observedAt, pdfSha256: evidence.pdfSha256,
        mineru: evidence.mineru, locator: evidence.locator, quote: rowQuote,
        identityOutcome: evidence.identityOutcome, applicableModels: evidence.applicableModels,
        identityLocators: evidence.identityLocators,
      });
    } catch {
      relationGap('selected source row does not replay the installation field/value semantics');
    }
    const rawValue = decimalAnchorValue(valueText, 'installation value anchor');
    const { field, definition } = fieldPolicy(semanticPolicy, receipt.field);
    const normalized = normalizeFixed({
      rawValue,
      sourceUnit: unitText,
      sourceField: receipt.field,
      applicability: receipt.applicability,
      inclusions: {},
      semantics: input.historicalPolicies.semantics,
    });
    if (normalized.fieldPath !== field || normalized.value !== receipt.value || normalized.unit !== receipt.unit) {
      invalid('SOURCE_VALUE_MISMATCH', 'installation anchor value does not normalize to the replayed receipt value');
    }
    return {
      factBindingId: attestation.factBindingId,
      sourceField: receipt.field,
      field,
      value: { kind: 'fixed', value: normalized.value, unit: normalized.unit },
      semantics: {
        axis: definition.axis,
        measurementScope: definition.measurementScope,
        inclusions: normalized.inclusions,
        applicability: normalized.applicability,
      },
      context: UNKNOWN_CONTEXT,
      sourceRepresentation: {
        kind: 'named_scalar',
        label: labelText,
        labelAnchorId: label.anchorId,
        value: rawValue,
        valueAnchorId: value.anchorId,
        sourceUnit: unitText,
        unitAnchorId: unit.anchorId,
      },
      evidence: anchors.proof,
      applicabilityProof: {
        kind: 'EXACT_MODEL',
        namedModels: [{ canonicalProductId: identity.canonicalProductId, model: identity.model }],
        relationshipAssertionIds: [],
      },
      claimEligible: true,
      claimBlocker: null,
    };
  });
  const first = attestations[0].installationReceipt;
  const pdfHash = digest(first.evidence.pdfSha256, 'installation PDF sha256');
  return {
    source: {
      sourceId: pdfHash,
      contentSha256: pdfHash,
      sourceUrl: first.evidence.sourceUrl,
      authority: first.evidence.authorityMode,
      documentRole: 'unknown',
      market: marketFor({ sourceUrl: first.evidence.sourceUrl, brand: identity.brand }),
    },
    facts,
    historicalReceipt: null,
  };
}

function parseObjectJson(bytes, label) {
  try {
    return cloneJson(JSON.parse(bytes.toString('utf8')), label);
  } catch (error) {
    if (error instanceof VerifiedSourceBindingValidationError) throw error;
    invalid('PROFILE_OWNER_NOT_JSON', `${label} must be JSON`);
  }
}

function requireFrozenProfileOwner(ref, expected, label) {
  if (!sameRef(ref, expected)) {
    invalid('PROFILE_OWNER_IDENTITY_MISMATCH', `${label} is not the frozen G3b profile owner`);
  }
}

function unresolvedProfile() {
  return { status: 'unresolved', reason: 'EXTRACTION_PROFILE_UNRESOLVED' };
}

function profileRegionIsBound({ regionIdentity, regionObservation, rootHash, fullProof }) {
  if (regionObservation?.sourcePdfSha256 !== rootHash) {
    invalid('PROFILE_SOURCE_ROOT_MISMATCH', 'profile region belongs to a different original source');
  }
  const candidates = fullProof.fragments.filter((fragment) => (
    fragment.fragmentSha256 === regionIdentity.fragmentSha256
    && fragment.parentArtifactSha256 === regionIdentity.parentArtifactSha256
    && fragment.locator?.kind === 'json_pointer'
    && fragment.locator.pointer === regionIdentity.sourceJsonPointer
    && sameJson(fragment.content, regionObservation.rawBlock)
  ));
  if (candidates.length !== 1) {
    invalid('PROFILE_REGION_G3A_MISMATCH', 'profile region is not an actual G3a JSON-pointer fragment');
  }
  try {
    validateEvidenceAnchors({
      sourceArtifactSha256: rootHash,
      artifactRecords: fullProof.artifactRecords,
      fragments: fullProof.fragments,
      anchors: [{ anchorId: 'profile_region', role: 'value', fragmentSha256: candidates[0].fragmentSha256 }],
      relations: [],
    });
  } catch (error) {
    invalid('PROFILE_REGION_G3A_MISMATCH', error instanceof Error ? error.message : String(error));
  }
}

function resolveExtractionProfile({ attestation, refs, bytesBySha, identity, rootHash, fullProof }) {
  const request = attestation.profileReplay;
  if (request === null) return unresolvedProfile();
  requireFrozenProfileOwner(request.profilePolicyRef, G3B_PROFILE_OWNERS.profilePolicy, 'profile policy reference');
  requireFrozenProfileOwner(request.brandRegistryRef, G3B_PROFILE_OWNERS.brandRegistry, 'brand registry reference');
  const policyRef = requireRef(refs, {
    ...G3B_PROFILE_OWNERS.profilePolicy,
    label: 'frozen G3b profile policy',
  });
  const registryRef = requireRef(refs, {
    ...G3B_PROFILE_OWNERS.brandRegistry,
    label: 'frozen G3b brand registry',
  });
  const profilePolicy = parseObjectJson(bytesBySha.get(policyRef.sha256), 'frozen G3b profile policy');
  const brandRegistryArtifact = parseObjectJson(bytesBySha.get(registryRef.sha256), 'frozen G3b brand registry');
  exactObject(brandRegistryArtifact, 'frozen G3b brand registry', ['registry', 'registrySha256']);
  let brand;
  try {
    brand = resolveBrandAlias({
      alias: identity.brand,
      market: brandRegistryArtifact.registry?.market,
      registry: brandRegistryArtifact.registry,
    });
  } catch (error) {
    invalid('PROFILE_OWNER_BRAND_MISMATCH', error instanceof Error ? error.message : String(error));
  }
  if (brand.status !== 'resolved') {
    invalid('PROFILE_OWNER_BRAND_MISMATCH', 'canonical owner brand is not resolved by the frozen G3b brand registry');
  }
  let selected;
  try {
    selected = selectDocumentProfile({
      registry: {
        brandRegistry: brandRegistryArtifact.registry,
        brandRegistrySha256: brandRegistryArtifact.registrySha256,
        profilePolicy,
      },
      brandId: brand.brandId,
      category: identity.category,
      documentType: request.documentType,
      regionObservation: request.regionObservation,
    });
  } catch (error) {
    invalid('PROFILE_SELECTION_INVALID', error instanceof Error ? error.message : String(error));
  }
  if (selected.status === 'invalid') {
    invalid('PROFILE_SELECTION_INVALID', selected.reasons?.join(',') ?? 'invalid profile selection');
  }
  if (selected.status !== 'selected') return unresolvedProfile();
  let routed;
  try {
    routed = routeExtractionRegion({
      regionObservation: request.regionObservation,
      selectedProfile: selected,
    });
  } catch (error) {
    invalid('PROFILE_ROUTE_INVALID', error instanceof Error ? error.message : String(error));
  }
  const routeInvalid = new Set([
    'INVALID_ROUTING_INPUT',
    'UNINSPECTED_REGION',
    'UNBOUND_SELECTED_PROFILE',
    'PROFILE_REGION_BINDING_MISMATCH',
    'PROFILE_SELECTION_REPLAY_MISMATCH',
  ]);
  if (routed.reasons?.some((reason) => routeInvalid.has(reason))) {
    invalid('PROFILE_ROUTE_INVALID', routed.reasons.join(','));
  }
  if (routed.status !== 'routed') return unresolvedProfile();
  const binding = selected.selectionBinding;
  profileRegionIsBound({
    regionIdentity: binding.regionIdentity,
    regionObservation: request.regionObservation,
    rootHash,
    fullProof,
  });
  return {
    status: 'resolved',
    profileIdentity: { ...binding.profileIdentity },
    route: routed.route,
    policySha256: binding.policySha256,
    brandRegistrySha256: binding.brandRegistrySha256,
    regionIdentity: { ...binding.regionIdentity },
  };
}

function completeProofIdentity(fullProof, attestations) {
  return canonicalSha256({
    schemaVersion: 1,
    canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
    artifactRecords: fullProof.artifactRecords,
    fragments: fullProof.fragments,
    anchorProofs: attestations.map((attestation) => ({
      factBindingId: attestation.factBindingId,
      anchorProof: attestation.anchorProof,
      anchorIds: attestation.anchorIds,
    })),
  });
}

export function verifyAndBindSource(rawInput) {
  const { input, semanticPolicy, readObject } = normalizedInput(rawInput);
  const ownerState = resolveOwner(input.caseInput, readObject);
  const identity = identityFromOwner(ownerState.owner);
  const attestations = normalizeAttestations(input.fieldAttestations, input.adapterKind);
  const refs = refMap(attestations);
  const bytesBySha = readAllRefs(readObject, refs);
  const fullProof = normalizeFullG3aProof(input.artifactRecords, input.fragments);
  allArtifactsMustResolve(fullProof, refs, bytesBySha);
  validateFragmentBytes(fullProof, bytesBySha);
  const replay = input.adapterKind === 'manufacturer'
    ? verifyManufacturer({ input, ownerState, identity, attestations, refs, bytesBySha, semanticPolicy, fullProof })
    : verifyInstallation({ input, ownerState, identity, attestations, refs, bytesBySha, semanticPolicy, fullProof });
  const g3aProofSha256 = completeProofIdentity(fullProof, attestations);
  const attestationsByFactBindingId = new Map(attestations.map((attestation) => [attestation.factBindingId, attestation]));
  const verifiedFactBindings = replay.facts
    .map((fact) => {
      const attestation = attestationsByFactBindingId.get(fact.factBindingId);
      if (!attestation) invalid('MISSING_FACT_ATTESTATION', 'replayed fact has no closed field attestation');
      const profileResolution = resolveExtractionProfile({
        attestation,
        refs,
        bytesBySha,
        identity,
        rootHash: replay.source.contentSha256,
        fullProof,
      });
      const profileResolved = profileResolution.status === 'resolved';
      return {
        ...fact,
        ...(profileResolved ? { extractionProfileSha256: profileResolution.profileIdentity.profileSha256 } : {}),
        claimEligible: fact.claimEligible && profileResolved,
        claimBlocker: fact.claimBlocker ?? (profileResolved ? null : 'EXTRACTION_PROFILE_UNRESOLVED'),
        profileResolution,
      };
    })
    .sort((left, right) => stableCompare(left.factBindingId, right.factBindingId));
  const policy = {
    source: sourcePolicyIdentity(),
    semanticPolicySha256: input.historicalPolicies.semantics.semanticPolicySha256,
    rightsDictionary: {
      schemaVersion: input.historicalPolicies.rightsDictionary.schemaVersion,
      reviewedAt: input.historicalPolicies.rightsDictionary.reviewedAt,
      sha256: canonicalSha256(input.historicalPolicies.rightsDictionary),
    },
    historicalReceipt: replay.historicalReceipt,
  };
  const replayInputs = {
    adapterKind: input.adapterKind,
    caseInput: input.caseInput,
    originalSourceReceipt: input.originalSourceReceipt,
    sourceRecord: input.sourceRecord,
    artifactRecords: fullProof.artifactRecords,
    fragments: fullProof.fragments,
    fieldAttestations: attestations,
    historicalPolicies: input.historicalPolicies,
  };
  const identityPayload = {
    schemaVersion: 1,
    canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
    adapterKind: input.adapterKind,
    case: { ...identity, market: replay.source.market.market },
    source: replay.source,
    authority: replay.source.authority,
    documentRole: replay.source.documentRole,
    verifiedFactBindings,
    g3aProof: {
      artifactRecords: fullProof.artifactRecords,
      fragments: fullProof.fragments,
      g3aProofSha256,
    },
    policy,
    replayInputs,
  };
  return freezeDeep({ ...identityPayload, bindingId: canonicalSha256(identityPayload) });
}

export function replayVerifiedSourceBinding({ sourceBinding, readObject }) {
  if (typeof readObject !== 'function') invalid('MISSING_READER', 'readObject is required');
  const binding = cloneJson(sourceBinding, 'stored source binding');
  exactObject(binding, 'stored source binding', [
    'schemaVersion', 'canonicalizationVersion', 'adapterKind', 'case', 'source', 'authority', 'documentRole',
    'verifiedFactBindings', 'g3aProof', 'policy', 'replayInputs', 'bindingId',
  ]);
  if (binding.schemaVersion !== 1 || binding.canonicalizationVersion !== CANONICAL_EVIDENCE_JSON_VERSION) {
    invalid('UNSUPPORTED_BINDING_VERSION', 'stored source binding version is unsupported');
  }
  digest(binding.bindingId, 'stored source binding bindingId');
  const replayed = verifyAndBindSource({ ...binding.replayInputs, readObject });
  if (!sameJson(binding, replayed)) {
    invalid('BINDING_REPLAY_MISMATCH', 'stored source binding does not reproduce from its original replay inputs');
  }
  return replayed;
}
