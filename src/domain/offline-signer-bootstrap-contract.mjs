import { createHash } from 'node:crypto';

import {
  canonicalReviewerJson,
  reviewerSemanticId,
} from './reviewer-artifact-request-contract.mjs';

const HEX = /^[0-9a-f]{64}$/;
const KEYS = [
  'artifactId', 'authorizationId', 'bootstrapSha256', 'confirmation', 'nodeExecutableSha256',
  'outputPath', 'requestId', 'requestSha256', 'schemaVersion', 'signerContractId',
  'signerContractSha256', 'signerKind', 'wrapperSha256',
];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export class OfflineSignerBootstrapError extends Error {
  constructor(code, message) { super(message); this.name = 'OfflineSignerBootstrapError'; this.code = code; }
}

const fail = (code, message) => { throw new OfflineSignerBootstrapError(code, message); };

export function buildOfflineSignerBootstrapAuthorization(input) {
  const payload = { schemaVersion: 1, ...input };
  const expectedConfirmation = payload.signerKind === 'OWNER'
    ? 'AUTHORIZE_EXACT_OFFLINE_OWNER_SIGNER'
    : 'AUTHORIZE_EXACT_OFFLINE_REVIEWER_SIGNER';
  if (!['OWNER', 'REVIEWER'].includes(payload.signerKind) || payload.confirmation !== expectedConfirmation
    || !pathIsAbsolute(payload.outputPath)
    || ['bootstrapSha256', 'wrapperSha256', 'signerContractId', 'signerContractSha256', 'nodeExecutableSha256',
      'requestId', 'requestSha256', 'artifactId'].some((key) => !HEX.test(payload[key] ?? ''))) {
    fail('BOOTSTRAP_AUTHORIZATION_INVALID', 'Bootstrap authorization fields are invalid');
  }
  return Object.freeze({
    ...payload,
    authorizationId: reviewerSemanticId('fitappliance.offline-signer-bootstrap-authorization', 1, payload),
  });
}

function pathIsAbsolute(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.includes('\0');
}

export function validateOfflineSignerBootstrapAuthorization({
  authorizationBytes,
  bootstrapBytes,
  wrapperBytes,
  signerContractBytes,
  nodeExecutableBytes,
  requestBytes,
  expectedRequestId,
  expectedArtifactId,
  outputPath,
  signerContractId,
}) {
  let authorization;
  try { authorization = JSON.parse(Buffer.from(authorizationBytes).toString('utf8')); }
  catch { fail('BOOTSTRAP_AUTHORIZATION_INVALID', 'Bootstrap authorization must contain JSON'); }
  if (canonicalReviewerJson(authorization) !== Buffer.from(authorizationBytes).toString('utf8')
    || JSON.stringify(Object.keys(authorization).sort()) !== JSON.stringify([...KEYS].sort())) {
    fail('BOOTSTRAP_AUTHORIZATION_INVALID', 'Bootstrap authorization must be canonical and exact');
  }
  const { authorizationId, ...payload } = authorization;
  const rebuilt = buildOfflineSignerBootstrapAuthorization(payload);
  if (authorizationId !== rebuilt.authorizationId
    || authorization.bootstrapSha256 !== sha256(bootstrapBytes)
    || authorization.wrapperSha256 !== sha256(wrapperBytes)
    || authorization.signerContractSha256 !== sha256(signerContractBytes)
    || authorization.nodeExecutableSha256 !== sha256(nodeExecutableBytes)
    || authorization.requestSha256 !== sha256(requestBytes)
    || authorization.signerContractId !== signerContractId
    || authorization.requestId !== expectedRequestId
    || authorization.artifactId !== expectedArtifactId
    || authorization.outputPath !== outputPath) {
    fail('BOOTSTRAP_HASH_DRIFT', 'Authorized bootstrap, wrapper, contract, Node, request or action binding differs');
  }
  return authorization;
}
