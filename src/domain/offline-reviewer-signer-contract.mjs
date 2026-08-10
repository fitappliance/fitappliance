import { createHash } from 'node:crypto';

import {
  canonicalReviewerJson,
  reviewerSemanticId,
} from './reviewer-artifact-request-contract.mjs';

const HEX = /^[0-9a-f]{64}$/;
const REQUIRED_FILES = [
  'src/domain/reviewer-artifact-request-contract.mjs',
  'src/domain/owner-attestation-request-contract.mjs',
  'src/domain/offline-reviewer-signer-contract.mjs',
  'scripts/deployment/offline-owner-secure-io.mjs',
  'scripts/deployment/sign-static-rights-reviewer-artifact.mjs',
  'src/domain/static-publication-rights.mjs',
  'scripts/deployment/offline-signer-bootstrap.sh',
  'scripts/deployment/run-offline-reviewer-signer.sh',
];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export class OfflineReviewerSignerContractError extends Error {
  constructor(code, message) { super(message); this.name = 'OfflineReviewerSignerContractError'; this.code = code; }
}

const fail = (code, message) => { throw new OfflineReviewerSignerContractError(code, message); };

function validateShape(contract) {
  if (!contract || JSON.stringify(Object.keys(contract).sort()) !== JSON.stringify([
    'boundFiles', 'contractId', 'nodeVersion', 'schemaVersion', 'trustAnchor',
  ])) fail('SIGNER_CONTRACT_INVALID', 'Reviewer signer contract keys are invalid');
  if (contract.schemaVersion !== 1 || contract.nodeVersion !== '22.23.1'
    || JSON.stringify(Object.keys(contract.trustAnchor ?? {}).sort()) !== JSON.stringify(['path', 'sha256'])
    || contract.trustAnchor.path !== 'deployment/static-owner-trust-anchor.json'
    || !HEX.test(contract.trustAnchor.sha256 ?? '') || !Array.isArray(contract.boundFiles)) {
    fail('SIGNER_CONTRACT_INVALID', 'Reviewer signer contract fields are invalid');
  }
  if (JSON.stringify(contract.boundFiles.map((row) => row?.path)) !== JSON.stringify(REQUIRED_FILES)
    || contract.boundFiles.some((row) => JSON.stringify(Object.keys(row ?? {}).sort()) !== JSON.stringify(['path', 'sha256'])
      || !HEX.test(row.sha256 ?? ''))) {
    fail('SIGNER_CONTRACT_INVALID', 'Reviewer signer file bindings are invalid');
  }
  const { contractId, ...payload } = contract;
  if (contractId !== reviewerSemanticId('fitappliance.offline-reviewer-signer-contract', 1, payload)) {
    fail('SIGNER_CONTRACT_ID_INVALID', 'Reviewer signer contract identity is invalid');
  }
  return contract;
}

export function buildOfflineReviewerSignerContract({ nodeVersion, trustAnchor, boundFiles }) {
  const payload = { schemaVersion: 1, nodeVersion, trustAnchor, boundFiles };
  return Object.freeze({
    ...payload,
    contractId: reviewerSemanticId('fitappliance.offline-reviewer-signer-contract', 1, payload),
  });
}

export function validateOfflineReviewerSignerContract(bytes, { nodeVersion, trustAnchorBytes, fileBytes }) {
  let contract;
  try { contract = JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { fail('SIGNER_CONTRACT_INVALID', 'Reviewer signer contract must contain JSON'); }
  validateShape(contract);
  if (canonicalReviewerJson(contract) !== Buffer.from(bytes).toString('utf8')) fail('SIGNER_CONTRACT_NONCANONICAL', 'Reviewer signer contract must be canonical');
  if (nodeVersion !== contract.nodeVersion) fail('SIGNER_RUNTIME_DRIFT', 'Node runtime differs from reviewer signer contract');
  if (sha256(trustAnchorBytes) !== contract.trustAnchor.sha256) fail('SIGNER_TRUST_ANCHOR_DRIFT', 'Owner trust anchor bytes differ');
  for (const row of contract.boundFiles) {
    if (!fileBytes.has(row.path) || sha256(fileBytes.get(row.path)) !== row.sha256) {
      fail('SIGNER_FILE_DRIFT', `Reviewer signer file drift: ${row.path}`);
    }
  }
  return Object.freeze(contract);
}

export const OFFLINE_REVIEWER_SIGNER_BOUND_FILES = Object.freeze([...REQUIRED_FILES]);
