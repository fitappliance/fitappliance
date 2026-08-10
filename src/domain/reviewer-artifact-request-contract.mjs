import { createHash, createPublicKey, verify } from 'node:crypto';

import {
  canonicalOwnerJson,
  ownerSemanticId,
  validateOwnerAttestationRequest,
} from './owner-attestation-request-contract.mjs';

const HEX = /^[0-9a-f]{64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_REQUEST_MS = 24 * 60 * 60 * 1000;
const ACTION = 'PUBLIC_STATIC_DISTRIBUTION';
const OWNER_TRUST_ANCHOR_KEYS = [
  'algorithm', 'authoritySetEnrollmentHash', 'environment', 'ownerPublicKeyFingerprintSha256',
  'ownerPublicKeyPemSha256', 'ownerRootId', 'ownerRootMetadataSha256', 'schemaVersion', 'trustRootSha256',
];
const CANDIDATE_SORTED_ARRAYS = new Set([
  'allowedDependencies', 'attributionFulfillments', 'attributionObligationIds', 'blockers',
  'dependencies', 'evidenceHashes', 'forbiddenDependencies',
]);

export const REVIEWER_ARTIFACT_TYPES = Object.freeze([
  'STATIC_RIGHTS_DECISION',
  'WITHDRAWAL_GENESIS_HEAD',
]);

export const REVIEWER_PRODUCTION_DEPENDENCIES = Object.freeze([
  'ENERGY_RATING_CC_BY',
  'FIRST_PARTY',
  'GOOGLE_VERIFICATION',
  'OUTFIT_FONT',
  'WEB_VITALS_APACHE_2',
]);

export class ReviewerArtifactContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ReviewerArtifactContractError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new ReviewerArtifactContractError(code, message); };
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const byteSort = (left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right));

function exactKeys(value, keys, code = 'REVIEWER_SCHEMA_INVALID', label = 'Object') {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort(byteSort)) !== JSON.stringify([...keys].sort(byteSort))) {
    fail(code, `${label} keys are invalid`);
  }
}

function normalize(value, sortedArrays = new Set(), key = '') {
  if (typeof value === 'string') {
    if (value !== value.normalize('NFC')) fail('CANONICAL_JSON_INVALID', 'Strings must use NFC');
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) fail('CANONICAL_JSON_INVALID', 'Numbers must be safe integers');
    return value;
  }
  if (typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) {
    const rows = value.map((row) => normalize(row, sortedArrays));
    return sortedArrays.has(key)
      ? rows.sort((left, right) => byteSort(canonicalReviewerJson(left), canonicalReviewerJson(right)))
      : rows;
  }
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    fail('CANONICAL_JSON_INVALID', 'Only strict JSON values are supported');
  }
  return Object.fromEntries(Object.keys(value).sort(byteSort).map((childKey) => [
    childKey, normalize(value[childKey], sortedArrays, childKey),
  ]));
}

export function canonicalReviewerJson(value, { sortedArrays = [] } = {}) {
  return `${JSON.stringify(normalize(value, new Set(sortedArrays)), null, 2)}\n`;
}

export function reviewerSemanticId(domain, schemaVersion, value, options = {}) {
  return createHash('sha256')
    .update(`${domain}\0${schemaVersion}\0${canonicalReviewerJson(value, options)}`)
    .digest('hex');
}

function parseCanonical(bytes, label, options = {}) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) fail('REVIEWER_INPUT_INVALID', `${label} bytes are required`);
  const text = Buffer.from(bytes).toString('utf8');
  let value;
  try { value = JSON.parse(text); } catch { fail('REVIEWER_INPUT_INVALID', `${label} must contain JSON`); }
  if (canonicalReviewerJson(value, options) !== text) fail('REVIEWER_INPUT_NONCANONICAL', `${label} must be canonical`);
  return value;
}

function exactTimestamp(value, label) {
  if (typeof value !== 'string' || !ISO.test(value)) fail('REVIEWER_TIME_INVALID', `${label} is invalid`);
  let canonical = '';
  try { canonical = new Date(value).toISOString(); } catch {}
  if (canonical !== value) fail('REVIEWER_TIME_INVALID', `${label} is invalid`);
  return Date.parse(value);
}

function sortedUnique(values, code, label) {
  if (!Array.isArray(values)) fail(code, `${label} must be an array`);
  const sorted = [...values].sort(byteSort);
  if (new Set(sorted).size !== sorted.length) fail(code, `${label} must be unique`);
  return sorted;
}

function canonicalPublicKey(publicKeyPem, code, label) {
  let key;
  try { key = createPublicKey(publicKeyPem); } catch { fail(code, `${label} is invalid`); }
  const canonicalPem = key.export({ type: 'spki', format: 'pem' }).toString();
  if (key.asymmetricKeyType !== 'ed25519' || canonicalPem !== publicKeyPem) fail(code, `${label} must be canonical Ed25519 PEM`);
  return {
    key,
    fingerprint: sha256(key.export({ type: 'spki', format: 'der' })),
  };
}

function validateAuthority({ authoritySetBytes, ownerTrustRoot, reviewerMetadata, reviewerPublicKeyPem }) {
  const authoritySet = parseCanonical(authoritySetBytes, 'Authority document', { sortedArrays: ['authorities'] });
  exactKeys(authoritySet, ['authorities', 'environment', 'schemaVersion', 'trustRootEnrollment'], 'AUTHORITY_INVALID', 'Authority document');
  if (authoritySet.schemaVersion !== 1 || authoritySet.environment !== 'PRODUCTION'
    || !Array.isArray(authoritySet.authorities) || authoritySet.authorities.length === 0) {
    fail('AUTHORITY_INVALID', 'Production authority document is invalid');
  }
  for (const row of authoritySet.authorities) {
    exactKeys(row, ['actions', 'issuerId', 'keyId', 'publicKey', 'roles'], 'AUTHORITY_INVALID', 'Authority');
  }
  exactKeys(authoritySet.trustRootEnrollment, ['authoritySetHash', 'signature'], 'AUTHORITY_INVALID', 'Authority enrollment');
  const enrollmentPayload = {
    schemaVersion: 1,
    environment: authoritySet.environment,
    authorities: authoritySet.authorities,
  };
  const authoritySetHash = reviewerSemanticId(
    'fitappliance.static-publication-authority-set', 1, enrollmentPayload, { sortedArrays: ['authorities'] },
  );
  let enrolled = false;
  try {
    enrolled = authoritySet.trustRootEnrollment.authoritySetHash === authoritySetHash
      && verify(
        null,
        Buffer.from(canonicalReviewerJson({ authoritySetHash })),
        ownerTrustRoot.publicKey,
        Buffer.from(authoritySet.trustRootEnrollment.signature, 'base64'),
      );
  } catch {}
  if (!enrolled) fail('AUTHORITY_ENROLLMENT_INVALID', 'Authority enrollment is not signed by the injected owner root');
  const reviewerKey = canonicalPublicKey(reviewerPublicKeyPem, 'REVIEWER_PUBLIC_KEY_INVALID', 'Reviewer public key');
  exactKeys(reviewerMetadata, [
    'action', 'algorithm', 'environment', 'issuerId', 'keyId', 'publicKeyFingerprintSha256', 'role', 'schemaVersion',
  ], 'REVIEWER_METADATA_INVALID', 'Reviewer metadata');
  const authority = authoritySet.authorities.find((row) => row?.issuerId === reviewerMetadata.issuerId);
  if (reviewerMetadata.schemaVersion !== 1 || reviewerMetadata.environment !== 'PRODUCTION'
    || reviewerMetadata.action !== ACTION || reviewerMetadata.role !== 'RIGHTS_REVIEWER'
    || reviewerMetadata.algorithm !== 'Ed25519'
    || reviewerMetadata.publicKeyFingerprintSha256 !== reviewerKey.fingerprint
    || !authority || authority.keyId !== reviewerMetadata.keyId || authority.publicKey !== reviewerPublicKeyPem
    || !authority.actions?.includes(ACTION) || !authority.roles?.includes('RIGHTS_REVIEWER')) {
    fail('REVIEWER_METADATA_INVALID', 'Reviewer metadata is not the exact enrolled authority');
  }
  return {
    authoritySet,
    authoritySetHash,
    authoritySetId: reviewerSemanticId(
      'fitappliance.static-publication-authority-set', 1, authoritySet, { sortedArrays: ['authorities'] },
    ),
    reviewerKey,
  };
}

function validateOwnerReceipt({ receiptBytes, ownerTrustRoot, ownerTrustAnchor, candidate }) {
  const receipt = parseCanonical(receiptBytes, 'Owner acceptance receipt');
  exactKeys(receipt, [
    'acceptanceId', 'acceptedAt', 'attestation', 'attestationSha256', 'candidateId', 'candidateSha256',
    'expiresAt', 'issuedAt', 'offlineSignerContractId', 'offlineSignerContractSha256',
    'ownerTrustRootSha256', 'request', 'requestId', 'requestSha256', 'schemaVersion', 'state',
  ], 'OWNER_ACCEPTANCE_INVALID', 'Owner acceptance receipt');
  const { acceptanceId, ...receiptPayload } = receipt;
  if (receipt.schemaVersion !== 1 || receipt.state !== 'OWNER_ATTESTATION_ACCEPTED'
    || !HEX.test(acceptanceId ?? '')
    || acceptanceId !== ownerSemanticId('fitappliance.owner-attestation-acceptance', 1, receiptPayload)
    || candidate.ownerAcceptance?.acceptanceId !== acceptanceId
    || candidate.ownerAcceptance?.acceptanceSha256 !== sha256(receiptBytes)
    || receipt.ownerTrustRootSha256 !== sha256(Buffer.from(canonicalReviewerJson(ownerTrustRoot)))) {
    fail('OWNER_ACCEPTANCE_INVALID', 'Owner acceptance receipt identity or candidate binding is invalid');
  }
  let request;
  try { request = validateOwnerAttestationRequest(Buffer.from(canonicalOwnerJson(receipt.request))); }
  catch { fail('OWNER_ACCEPTANCE_INVALID', 'Owner acceptance request is invalid'); }
  const ownerKey = canonicalPublicKey(ownerTrustRoot.publicKey, 'OWNER_ACCEPTANCE_INVALID', 'Owner receipt public key');
  const firstParty = candidate.dependencies.find((row) => row.dependencyId === 'FIRST_PARTY');
  const issued = exactTimestamp(receipt.issuedAt, 'Owner receipt issuedAt');
  const accepted = exactTimestamp(receipt.acceptedAt, 'Owner receipt acceptedAt');
  const expires = exactTimestamp(receipt.expiresAt, 'Owner receipt expiresAt');
  if (request.requestId !== receipt.requestId || request.candidateId !== receipt.candidateId
    || request.candidateSha256 !== receipt.candidateSha256
    || request.ownerTrustRootSha256 !== receipt.ownerTrustRootSha256
    || request.offlineSignerContractId !== receipt.offlineSignerContractId
    || request.offlineSignerContractSha256 !== receipt.offlineSignerContractSha256
    || receipt.offlineSignerContractId !== candidate.offlineSignerContractId
    || receipt.offlineSignerContractSha256 !== candidate.offlineSignerContractSha256
    || request.authoritySetId !== candidate.authoritySetId
    || request.authoritySetSha256 !== candidate.authoritySetSha256
    || request.payload.inventoryId !== candidate.inventoryId
    || request.payload.scopeHash !== firstParty?.scopeHash
    || request.payload.sourceObjectHash !== firstParty?.sourceObjectHash
    || request.payload.ownerPublicKeyFingerprintSha256 !== ownerKey.fingerprint
    || request.payload.ownerRootId !== ownerTrustAnchor.ownerRootId
    || request.payload.ownerTrustAnchorSha256 !== candidate.ownerTrustAnchorSha256
    || request.payload.routeConfigSha256 !== candidate.routeConfigSha256
    || request.payload.publicEvidenceManifestSha256 !== candidate.publicEvidenceManifestSha256
    || request.payload.toolchainContractSha256 !== candidate.toolchainContractSha256
    || request.payload.candidateGeneratorSha256 !== candidate.candidateGeneratorSha256
    || request.payload.withdrawalGenesisSha256
      !== sha256(Buffer.from(canonicalReviewerJson(candidate.withdrawalGenesis)))
    || issued >= expires || accepted < issued || accepted >= expires
    || receipt.requestSha256 !== sha256(Buffer.from(canonicalOwnerJson(receipt.request)))
    || candidate.ownerAcceptance.requestId !== receipt.requestId
    || candidate.ownerAcceptance.attestationSha256 !== receipt.attestationSha256
    || candidate.ownerAcceptance.acceptedAt !== receipt.acceptedAt
    || candidate.ownerAcceptance.expiresAt !== receipt.expiresAt) {
    fail('OWNER_ACCEPTANCE_INVALID', 'Owner receipt does not bind the accepted candidate inputs');
  }
  const signature = Buffer.from(receipt.attestation?.signature ?? '', 'base64');
  let valid = false;
  try {
    valid = signature.length === 64
      && verify(null, Buffer.from(canonicalOwnerJson(receipt.attestation.payload)), ownerTrustRoot.publicKey, signature);
  } catch {}
  if (!valid || canonicalOwnerJson(receipt.attestation.payload) !== canonicalOwnerJson(request.payload)
    || receipt.attestationSha256 !== sha256(Buffer.from(canonicalOwnerJson(receipt.attestation)))) {
    fail('OWNER_ACCEPTANCE_INVALID', 'Owner receipt signature is invalid');
  }
  return receipt;
}

function validateCandidate(candidateBytes) {
  const candidate = parseCanonical(candidateBytes, 'B1 base candidate', { sortedArrays: [...CANDIDATE_SORTED_ARRAYS] });
  exactKeys(candidate, [
    'attributionFulfillments', 'authoritySetId', 'authoritySetSha256', 'blockers', 'candidateGeneratorSha256',
    'candidateId', 'classifierId', 'constraints', 'dependencies', 'inventoryId', 'offlineSignerContractId',
    'offlineSignerContractSha256', 'ownerAcceptance', 'ownerTrustAnchorSha256', 'ownerTrustRootSha256',
    'publicEvidenceManifestSha256', 'routeConfigSha256', 'schemaVersion', 'status', 'toolchainContractSha256',
    'withdrawalGenesis',
  ], 'CANDIDATE_INVALID', 'B1 base candidate');
  exactKeys(candidate.constraints, [
    'allowedDependencies', 'environment', 'forbiddenDependencies', 'privateEvidenceAccess', 'signatureState',
  ], 'CANDIDATE_INVALID', 'Candidate constraints');
  if (candidate.schemaVersion !== 3 || candidate.status !== 'READY_FOR_EXPLICIT_SIGNING_APPROVAL'
    || candidate.constraints?.environment !== 'PRODUCTION'
    || candidate.constraints?.signatureState !== 'UNSIGNED'
    || candidate.constraints?.privateEvidenceAccess !== 'PROHIBITED'
    || JSON.stringify(candidate.constraints?.allowedDependencies) !== JSON.stringify(REVIEWER_PRODUCTION_DEPENDENCIES)
    || JSON.stringify(candidate.constraints?.forbiddenDependencies) !== JSON.stringify(['RETAILER_FEED'])
    || JSON.stringify(candidate.blockers) !== JSON.stringify(['EXPLICIT_SIGNING_APPROVAL_REQUIRED'])) {
    fail('CANDIDATE_INVALID', 'B1 base candidate state or constraints are invalid');
  }
  const { candidateId, ...payload } = candidate;
  const expectedId = reviewerSemanticId('fitappliance.static-rights-signing-candidate', 3, payload, {
    sortedArrays: [...CANDIDATE_SORTED_ARRAYS],
  });
  if (candidateId !== expectedId || !HEX.test(candidate.inventoryId ?? '')
    || !HEX.test(candidate.authoritySetId ?? '') || !HEX.test(candidate.authoritySetSha256 ?? '')) {
    fail('CANDIDATE_INVALID', 'B1 base candidate identity is invalid');
  }
  const dependencies = [...candidate.dependencies].sort((left, right) => byteSort(left.dependencyId, right.dependencyId));
  if (dependencies.length !== REVIEWER_PRODUCTION_DEPENDENCIES.length
    || JSON.stringify(dependencies.map((row) => row.dependencyId)) !== JSON.stringify(REVIEWER_PRODUCTION_DEPENDENCIES)) {
    fail('DEPENDENCY_SET_INVALID', 'Candidate must contain the exact production dependency set');
  }
  for (const descriptor of dependencies) {
    exactKeys(descriptor, [
      'attributionObligationIds', 'dependencyId', 'evidenceHashes', 'pathCount', 'scopeHash', 'sourceObjectHash', 'status',
    ], 'DEPENDENCY_SET_INVALID', 'Dependency descriptor');
    if (descriptor.status !== 'EVIDENCE_REPLAYED' || !Number.isSafeInteger(descriptor.pathCount) || descriptor.pathCount <= 0
      || !HEX.test(descriptor.scopeHash ?? '') || !HEX.test(descriptor.sourceObjectHash ?? '')
      || sortedUnique(descriptor.evidenceHashes, 'DEPENDENCY_SET_INVALID', 'Evidence hashes').some((row) => !HEX.test(row))
      || !Array.isArray(descriptor.attributionObligationIds)
      || sortedUnique(descriptor.attributionObligationIds, 'DEPENDENCY_SET_INVALID', 'Attribution obligations').length
        !== descriptor.attributionObligationIds.length) {
      fail('DEPENDENCY_SET_INVALID', `Candidate descriptor is invalid: ${descriptor.dependencyId}`);
    }
  }
  return { candidate, dependencies };
}

function validateGenesisDraft(candidate, reviewerMetadata) {
  const log = candidate.withdrawalGenesis;
  if (log?.schemaVersion !== 1 || log.environment !== 'PRODUCTION'
    || !Array.isArray(log.events) || log.events.length !== 0
    || !Array.isArray(log.heads) || log.heads.length !== 1) {
    fail('WITHDRAWAL_GENESIS_INVALID', 'Candidate must bind a zero-event genesis with no prior head');
  }
  const envelope = log.heads[0];
  exactKeys(envelope, ['payload', 'signature', 'withdrawalHeadHash'], 'WITHDRAWAL_GENESIS_INVALID', 'Genesis envelope');
  const payload = envelope.payload;
  if (envelope.signature !== null || payload?.schemaVersion !== 1 || payload.environment !== 'PRODUCTION'
    || payload.action !== ACTION || payload.role !== 'RIGHTS_REVIEWER'
    || payload.issuerId !== reviewerMetadata.issuerId || payload.keyId !== reviewerMetadata.keyId
    || payload.sequence !== 0 || payload.previousHeadHash !== null
    || !Array.isArray(payload.eventIds) || payload.eventIds.length !== 0
    || envelope.withdrawalHeadHash !== reviewerSemanticId('fitappliance.static-rights-withdrawal-head', 1, payload)) {
    fail('WITHDRAWAL_GENESIS_INVALID', 'Candidate genesis payload is invalid');
  }
  exactTimestamp(payload.issuedAt, 'Genesis issuedAt');
  return { artifactId: envelope.withdrawalHeadHash, payload };
}

function validateCurrentGenesis(bytes, expected, authoritySet) {
  if (!bytes) fail('WITHDRAWAL_STATE_INVALID', 'A signed accepted genesis is required');
  const log = parseCanonical(bytes, 'Current withdrawal log');
  if (log?.schemaVersion !== 1 || log.environment !== 'PRODUCTION' || log.events?.length !== 0 || log.heads?.length !== 1) {
    fail('WITHDRAWAL_STATE_INVALID', 'Current withdrawal state must be the accepted genesis');
  }
  const envelope = log.heads[0];
  if (envelope.withdrawalHeadHash !== expected.artifactId
    || canonicalReviewerJson(envelope.payload) !== canonicalReviewerJson(expected.payload)) {
    fail('WITHDRAWAL_STATE_INVALID', 'Current withdrawal head differs from candidate genesis');
  }
  const authority = authoritySet.authorities.find((row) => row.issuerId === envelope.payload.issuerId);
  let valid = false;
  try {
    valid = authority && verify(
      null, Buffer.from(canonicalReviewerJson(envelope.payload)), authority.publicKey,
      Buffer.from(envelope.signature, 'base64'),
    );
  } catch {}
  if (!valid) fail('WITHDRAWAL_STATE_INVALID', 'Current withdrawal head signature is invalid');
  return log;
}

export function deriveExpectedReviewerArtifact({
  artifactType,
  candidateBytes,
  ownerReceiptBytes,
  ownerTrustRootBytes,
  ownerTrustAnchorBytes,
  authoritySetBytes,
  reviewerMetadataBytes,
  reviewerPublicKeyPem,
  reviewerSignerContractId,
  reviewerSignerContractSha256,
  currentWithdrawalLogBytes = null,
  dependencyId,
  decisionAsOf,
  validFrom,
  validThrough,
  reviewBy,
}) {
  if (!REVIEWER_ARTIFACT_TYPES.includes(artifactType)) fail('ARTIFACT_TYPE_INVALID', 'Unknown reviewer artifact type');
  if (!HEX.test(reviewerSignerContractId ?? '') || !HEX.test(reviewerSignerContractSha256 ?? '')) {
    fail('SIGNER_CONTRACT_INVALID', 'Reviewer signer contract binding is invalid');
  }
  const { candidate, dependencies } = validateCandidate(candidateBytes);
  const ownerTrustRoot = parseCanonical(ownerTrustRootBytes, 'Injected owner trust root');
  exactKeys(ownerTrustRoot, ['publicKey', 'source'], 'OWNER_TRUST_ROOT_INVALID', 'Owner trust root');
  if (ownerTrustRoot.source !== 'INJECTED_READ_ONLY') fail('OWNER_TRUST_ROOT_INVALID', 'Owner trust root must be injected read-only');
  const ownerKey = canonicalPublicKey(ownerTrustRoot.publicKey, 'OWNER_TRUST_ROOT_INVALID', 'Owner public key');
  const ownerTrustAnchor = parseCanonical(ownerTrustAnchorBytes, 'Owner trust anchor');
  exactKeys(ownerTrustAnchor, OWNER_TRUST_ANCHOR_KEYS, 'OWNER_TRUST_ANCHOR_INVALID', 'Owner trust anchor');
  if (ownerTrustAnchor.schemaVersion !== 1 || ownerTrustAnchor.environment !== 'PRODUCTION'
    || ownerTrustAnchor.algorithm !== 'Ed25519'
    || ownerTrustAnchor.ownerRootId !== 'FITAPPLIANCE_OWNER_ROOT_2026_01'
    || ownerTrustAnchor.trustRootSha256 !== sha256(ownerTrustRootBytes)
    || ownerTrustAnchor.ownerPublicKeyPemSha256 !== sha256(Buffer.from(ownerTrustRoot.publicKey))
    || ownerTrustAnchor.ownerPublicKeyFingerprintSha256 !== ownerKey.fingerprint
    || sha256(ownerTrustAnchorBytes) !== candidate.ownerTrustAnchorSha256
    || ['ownerRootMetadataSha256', 'authoritySetEnrollmentHash']
      .some((key) => !HEX.test(ownerTrustAnchor[key] ?? ''))) {
    fail('OWNER_TRUST_ANCHOR_INVALID', 'Injected owner root does not match the candidate-pinned trust anchor');
  }
  const presentedReviewerKey = canonicalPublicKey(
    reviewerPublicKeyPem, 'REVIEWER_PUBLIC_KEY_INVALID', 'Reviewer public key',
  );
  if (ownerKey.fingerprint === presentedReviewerKey.fingerprint) {
    fail('OWNER_REVIEWER_KEY_COLLISION', 'Owner and reviewer keys must be distinct');
  }
  const reviewerMetadata = parseCanonical(reviewerMetadataBytes, 'Reviewer metadata');
  const authority = validateAuthority({ authoritySetBytes, ownerTrustRoot, reviewerMetadata, reviewerPublicKeyPem });
  if (candidate.authoritySetId !== authority.authoritySetId
    || candidate.authoritySetSha256 !== sha256(authoritySetBytes)
    || candidate.ownerTrustRootSha256 !== sha256(ownerTrustRootBytes)
    || ownerTrustAnchor.authoritySetEnrollmentHash !== authority.authoritySetHash) {
    fail('CANDIDATE_AUTHORITY_DRIFT', 'Candidate authority or owner-root binding differs');
  }
  const receipt = validateOwnerReceipt({
    receiptBytes: ownerReceiptBytes,
    ownerTrustRoot,
    ownerTrustAnchor,
    candidate,
  });
  const firstParty = dependencies.find((row) => row.dependencyId === 'FIRST_PARTY');
  if (!firstParty.evidenceHashes.includes(sha256(ownerReceiptBytes))) {
    fail('OWNER_ACCEPTANCE_INVALID', 'FIRST_PARTY evidence must bind the accepted owner receipt');
  }
  const genesis = validateGenesisDraft(candidate, reviewerMetadata);
  const decisionSetId = reviewerSemanticId('fitappliance.static-rights-decision-set', 1, {
    b1BaseCandidateId: candidate.candidateId,
    b1BaseCandidateSha256: sha256(candidateBytes),
    ownerAcceptanceId: receipt.acceptanceId,
    ownerAcceptanceSha256: sha256(ownerReceiptBytes),
    inventoryId: candidate.inventoryId,
    dependencies,
  }, { sortedArrays: ['attributionObligationIds', 'dependencies', 'evidenceHashes'] });

  let artifactId;
  let payload;
  let currentWithdrawalHeadHash = null;
  if (artifactType === 'WITHDRAWAL_GENESIS_HEAD') {
    if (currentWithdrawalLogBytes !== null) fail('WITHDRAWAL_PRIOR_HEAD_FORBIDDEN', 'Genesis creation requires no prior withdrawal state');
    ({ artifactId, payload } = genesis);
  } else {
    validateCurrentGenesis(currentWithdrawalLogBytes, genesis, authority.authoritySet);
    currentWithdrawalHeadHash = genesis.artifactId;
    if (!REVIEWER_PRODUCTION_DEPENDENCIES.includes(dependencyId)) fail('DEPENDENCY_SET_INVALID', 'Decision dependency is not in the production set');
    const descriptor = dependencies.find((row) => row.dependencyId === dependencyId);
    const decisionClock = exactTimestamp(decisionAsOf, 'decisionAsOf');
    const from = exactTimestamp(validFrom, 'validFrom');
    const through = exactTimestamp(validThrough, 'validThrough');
    const review = exactTimestamp(reviewBy, 'reviewBy');
    if (from > decisionClock || decisionClock > through || decisionClock > review || through > review) {
      fail('DECISION_TIME_INVALID', 'Decision validity does not contain the frozen decision clock');
    }
    payload = {
      schemaVersion: 1,
      action: ACTION,
      attributionObligationIds: descriptor.attributionObligationIds,
      decisionAsOf,
      decisionSetId,
      dependencyId,
      disposition: 'ALLOWED',
      evidenceHashes: descriptor.evidenceHashes,
      inventoryId: candidate.inventoryId,
      issuerId: reviewerMetadata.issuerId,
      keyId: reviewerMetadata.keyId,
      predecessorDecisionId: null,
      reviewBy,
      role: 'RIGHTS_REVIEWER',
      scopeHash: descriptor.scopeHash,
      sourceObjectHash: descriptor.sourceObjectHash,
      supersedesDecisionId: null,
      validFrom,
      validThrough,
      withdrawalHeadHash: currentWithdrawalHeadHash,
    };
    artifactId = reviewerSemanticId('fitappliance.static-rights-decision', 1, payload);
  }
  return Object.freeze({
    schemaVersion: 1,
    artifactType,
    artifactId,
    payload,
    b1BaseCandidateId: candidate.candidateId,
    b1BaseCandidateSha256: sha256(candidateBytes),
    ownerAcceptanceId: receipt.acceptanceId,
    ownerAcceptanceSha256: sha256(ownerReceiptBytes),
    ownerTrustAnchorSha256: sha256(ownerTrustAnchorBytes),
    ownerTrustRootSha256: sha256(ownerTrustRootBytes),
    authoritySetId: authority.authoritySetId,
    authorityDocumentSha256: sha256(authoritySetBytes),
    authorityEnrollmentPayloadId: authority.authoritySetHash,
    reviewerIssuerId: reviewerMetadata.issuerId,
    reviewerKeyId: reviewerMetadata.keyId,
    reviewerPublicKeyFingerprintSha256: authority.reviewerKey.fingerprint,
    reviewerMetadataSha256: sha256(reviewerMetadataBytes),
    reviewerSignerContractId,
    reviewerSignerContractSha256,
    decisionSetId,
    currentWithdrawalHeadHash,
  });
}

const REQUEST_KEYS = [
  'artifactId', 'artifactType', 'authorityDocumentSha256', 'authorityEnrollmentPayloadId', 'authoritySetId',
  'b1BaseCandidateId', 'b1BaseCandidateSha256', 'currentWithdrawalHeadHash', 'decisionSetId', 'encoding',
  'expiresAt', 'issuedAt', 'ownerAcceptanceId', 'ownerAcceptanceSha256', 'ownerTrustRootSha256', 'payload',
  'ownerTrustAnchorSha256',
  'requestId', 'reviewerIssuerId', 'reviewerKeyId', 'reviewerMetadataSha256',
  'reviewerPublicKeyFingerprintSha256', 'reviewerSignerContractId', 'reviewerSignerContractSha256',
  'schemaVersion', 'state',
];

function validateRequestArtifactPayload(request) {
  if (request.artifactType === 'WITHDRAWAL_GENESIS_HEAD') {
    exactKeys(request.payload, [
      'action', 'environment', 'eventIds', 'issuedAt', 'issuerId', 'keyId', 'previousHeadHash',
      'role', 'schemaVersion', 'sequence',
    ], 'REQUEST_SCHEMA_INVALID', 'Withdrawal genesis payload');
    if (request.payload.schemaVersion !== 1 || request.payload.environment !== 'PRODUCTION'
      || request.payload.action !== ACTION || request.payload.role !== 'RIGHTS_REVIEWER'
      || request.payload.sequence !== 0 || request.payload.previousHeadHash !== null
      || !Array.isArray(request.payload.eventIds) || request.payload.eventIds.length !== 0) {
      fail('ARTIFACT_BINDING_INVALID', 'Withdrawal request payload is not an initial genesis head');
    }
    exactTimestamp(request.payload.issuedAt, 'Genesis issuedAt');
    return;
  }
  exactKeys(request.payload, [
    'action', 'attributionObligationIds', 'decisionAsOf', 'decisionSetId', 'dependencyId', 'disposition', 'evidenceHashes',
    'inventoryId', 'issuerId', 'keyId', 'predecessorDecisionId', 'reviewBy', 'role', 'schemaVersion',
    'scopeHash', 'sourceObjectHash', 'supersedesDecisionId', 'validFrom', 'validThrough', 'withdrawalHeadHash',
  ], 'REQUEST_SCHEMA_INVALID', 'Static rights decision payload');
  if (request.payload.schemaVersion !== 1 || request.payload.action !== ACTION
    || request.payload.role !== 'RIGHTS_REVIEWER' || request.payload.disposition !== 'ALLOWED'
    || !REVIEWER_PRODUCTION_DEPENDENCIES.includes(request.payload.dependencyId)
    || request.payload.predecessorDecisionId !== null || request.payload.supersedesDecisionId !== null
    || !HEX.test(request.payload.decisionSetId ?? '') || !HEX.test(request.payload.inventoryId ?? '')
    || !HEX.test(request.payload.scopeHash ?? '')
    || !HEX.test(request.payload.sourceObjectHash ?? '') || !HEX.test(request.payload.withdrawalHeadHash ?? '')
    || sortedUnique(request.payload.evidenceHashes, 'REQUEST_SCHEMA_INVALID', 'Decision evidence').some((row) => !HEX.test(row))) {
    fail('ARTIFACT_BINDING_INVALID', 'Decision request payload is invalid');
  }
  sortedUnique(request.payload.attributionObligationIds, 'REQUEST_SCHEMA_INVALID', 'Decision attribution obligations');
  const clock = exactTimestamp(request.payload.decisionAsOf, 'decisionAsOf');
  const from = exactTimestamp(request.payload.validFrom, 'validFrom');
  const through = exactTimestamp(request.payload.validThrough, 'validThrough');
  const review = exactTimestamp(request.payload.reviewBy, 'reviewBy');
  if (from > clock || clock > through || through > review) fail('REQUEST_TIME_INVALID', 'Decision validity window is invalid');
}

export function buildReviewerArtifactRequest({ derived, issuedAt, expiresAt }) {
  const issued = exactTimestamp(issuedAt, 'issuedAt');
  const expires = exactTimestamp(expiresAt, 'expiresAt');
  if (expires <= issued || expires - issued > MAX_REQUEST_MS) fail('REQUEST_TIME_INVALID', 'Request validity must be positive and at most 24 hours');
  const unsigned = {
    ...derived,
    state: 'UNSIGNED',
    encoding: 'base64',
    issuedAt,
    expiresAt,
  };
  const requestId = reviewerSemanticId('fitappliance.static-rights-reviewer-request', 1, unsigned);
  return Object.freeze({ ...unsigned, requestId });
}

export function validateReviewerArtifactRequest(bytes) {
  const request = parseCanonical(bytes, 'Reviewer request');
  exactKeys(request, REQUEST_KEYS, 'REQUEST_SCHEMA_INVALID', 'Reviewer request');
  if (request.schemaVersion !== 1 || request.state !== 'UNSIGNED' || request.encoding !== 'base64'
    || !REVIEWER_ARTIFACT_TYPES.includes(request.artifactType) || !HEX.test(request.artifactId ?? '')
    || !HEX.test(request.requestId ?? '')) fail('REQUEST_SCHEMA_INVALID', 'Reviewer request constants are invalid');
  const issued = exactTimestamp(request.issuedAt, 'issuedAt');
  const expires = exactTimestamp(request.expiresAt, 'expiresAt');
  if (expires <= issued || expires - issued > MAX_REQUEST_MS) fail('REQUEST_TIME_INVALID', 'Request validity must be positive and at most 24 hours');
  for (const key of [
    'artifactId', 'authorityDocumentSha256', 'authorityEnrollmentPayloadId', 'authoritySetId',
    'b1BaseCandidateId', 'b1BaseCandidateSha256', 'decisionSetId', 'ownerAcceptanceId',
    'ownerAcceptanceSha256', 'ownerTrustAnchorSha256', 'ownerTrustRootSha256', 'requestId', 'reviewerMetadataSha256',
    'reviewerPublicKeyFingerprintSha256', 'reviewerSignerContractId', 'reviewerSignerContractSha256',
  ]) {
    if (!HEX.test(request[key] ?? '')) fail('REQUEST_SCHEMA_INVALID', `${key} must be SHA-256`);
  }
  validateRequestArtifactPayload(request);
  const expectedArtifactId = request.artifactType === 'WITHDRAWAL_GENESIS_HEAD'
    ? reviewerSemanticId('fitappliance.static-rights-withdrawal-head', 1, request.payload)
    : reviewerSemanticId('fitappliance.static-rights-decision', 1, request.payload);
  if (request.artifactId !== expectedArtifactId
    || (request.artifactType === 'WITHDRAWAL_GENESIS_HEAD' && (request.payload.sequence !== 0 || request.currentWithdrawalHeadHash !== null))
    || (request.artifactType === 'STATIC_RIGHTS_DECISION'
      && (request.payload.dependencyId === undefined
        || request.decisionSetId !== request.payload.decisionSetId
        || request.currentWithdrawalHeadHash !== request.payload.withdrawalHeadHash))) {
    fail('ARTIFACT_BINDING_INVALID', 'Request artifact type, ID and payload differ');
  }
  const { requestId, ...unsigned } = request;
  if (requestId !== reviewerSemanticId('fitappliance.static-rights-reviewer-request', 1, unsigned)) {
    fail('REQUEST_ID_INVALID', 'Reviewer request identity is invalid');
  }
  return Object.freeze(request);
}
