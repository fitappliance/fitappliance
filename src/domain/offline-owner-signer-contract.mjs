import { createHash } from 'node:crypto';

import {
  canonicalOwnerJson,
  ownerSemanticId,
  parseCanonicalOwnerJson,
} from './owner-attestation-request-contract.mjs';

const HEX = /^[0-9a-f]{64}$/;
const REQUIRED_FILES = [
  'src/domain/owner-attestation-request-contract.mjs',
  'src/domain/offline-owner-signer-contract.mjs',
  'scripts/deployment/offline-owner-secure-io.mjs',
  'scripts/deployment/sign-owner-attestation.mjs',
];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export class OfflineSignerContractError extends Error {
  constructor(code, message) { super(message); this.name = 'OfflineSignerContractError'; this.code = code; }
}

const fail = (code, message) => { throw new OfflineSignerContractError(code, message); };

function validateShape(contract) {
  if (JSON.stringify(Object.keys(contract).sort()) !== JSON.stringify([
    'boundFiles', 'contractId', 'nodeVersion', 'schemaVersion', 'trustAnchor',
  ])) fail('SIGNER_CONTRACT_INVALID', 'Offline signer contract keys are invalid');
  if (contract.schemaVersion !== 1 || typeof contract.nodeVersion !== 'string'
    || JSON.stringify(Object.keys(contract.trustAnchor ?? {}).sort()) !== JSON.stringify(['path', 'sha256'])
    || contract.trustAnchor.path !== 'deployment/static-owner-trust-anchor.json'
    || !HEX.test(contract.trustAnchor.sha256 ?? '') || !Array.isArray(contract.boundFiles)) {
    fail('SIGNER_CONTRACT_INVALID', 'Offline signer contract fields are invalid');
  }
  const paths = contract.boundFiles.map((row) => row?.path);
  if (JSON.stringify(paths) !== JSON.stringify(REQUIRED_FILES)
    || contract.boundFiles.some((row) => JSON.stringify(Object.keys(row ?? {}).sort()) !== JSON.stringify(['path', 'sha256'])
      || !HEX.test(row.sha256 ?? ''))) fail('SIGNER_CONTRACT_INVALID', 'Offline signer file bindings are invalid');
  const { contractId, ...payload } = contract;
  if (contractId !== ownerSemanticId('fitappliance.offline-owner-signer-contract', 1, payload)) {
    fail('SIGNER_CONTRACT_ID_INVALID', 'Offline signer contract identity is invalid');
  }
  return contract;
}

export function buildOfflineSignerContract({ nodeVersion, trustAnchor, boundFiles }) {
  const payload = { schemaVersion: 1, nodeVersion, trustAnchor, boundFiles };
  return Object.freeze({
    ...payload,
    contractId: ownerSemanticId('fitappliance.offline-owner-signer-contract', 1, payload),
  });
}

export function validateOfflineSignerContract(bytes, { nodeVersion, trustAnchorBytes, fileBytes }) {
  const contract = parseOfflineSignerContract(bytes);
  if (contract.nodeVersion !== nodeVersion) fail('SIGNER_RUNTIME_DRIFT', 'Node runtime does not match the offline signer contract');
  if (sha256(trustAnchorBytes) !== contract.trustAnchor.sha256) fail('SIGNER_TRUST_ANCHOR_DRIFT', 'Trust anchor bytes do not match');
  for (const row of contract.boundFiles) {
    const bytesForFile = fileBytes.get(row.path);
    if (!bytesForFile || sha256(bytesForFile) !== row.sha256) fail('SIGNER_FILE_DRIFT', `Offline signer file drift: ${row.path}`);
  }
  if (canonicalOwnerJson(contract) !== Buffer.from(bytes).toString('utf8')) fail('SIGNER_CONTRACT_NONCANONICAL', 'Contract must be canonical');
  return Object.freeze(contract);
}

export function parseOfflineSignerContract(bytes) {
  let contract;
  try { contract = parseCanonicalOwnerJson(bytes, 'Offline signer contract'); } catch (error) { fail(error.code, error.message); }
  return Object.freeze(validateShape(contract));
}

export const OFFLINE_SIGNER_BOUND_FILES = Object.freeze([...REQUIRED_FILES]);
