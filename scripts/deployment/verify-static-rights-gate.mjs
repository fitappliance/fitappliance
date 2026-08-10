import { existsSync, lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RightsContractError,
  canonicalJson,
  verifyStaticPublicationGate,
} from '../../src/domain/static-publication-rights.mjs';
import { buildProductionRightsReview } from './build-static-rights-review.mjs';

const AUTHORIZATION_PATH = 'deployment/static-publication-authorization.json';

function fail(code, message) {
  throw new RightsContractError(code, message);
}

function readJson(absolutePath, code) {
  try {
    return JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch {
    fail(code, `Cannot read JSON at ${absolutePath}`);
  }
}

function loadExternalTrustRoot({ repoRoot, argument }) {
  if (!argument) return undefined;
  const absolutePath = path.resolve(argument);
  const normalizedRoot = path.resolve(repoRoot);
  if (absolutePath === normalizedRoot || absolutePath.startsWith(`${normalizedRoot}${path.sep}`)) {
    fail('REPOSITORY_SELF_ENROLLMENT_FORBIDDEN', 'The production trust root must remain outside the repository');
  }
  let stat;
  try {
    stat = lstatSync(absolutePath);
  } catch {
    fail('PRODUCTION_TRUST_ROOT_NOT_ENROLLED', 'The injected production trust root is unavailable');
  }
  if (!stat.isFile() || stat.isSymbolicLink()) fail('PRODUCTION_TRUST_ROOT_NOT_ENROLLED', 'The injected production trust root must be a regular file');
  const trustRoot = readJson(absolutePath, 'PRODUCTION_TRUST_ROOT_NOT_ENROLLED');
  if (!trustRoot || Object.keys(trustRoot).sort().join(',') !== 'publicKey,source'
    || trustRoot.source !== 'INJECTED_READ_ONLY' || typeof trustRoot.publicKey !== 'string') {
    fail('PRODUCTION_TRUST_ROOT_NOT_ENROLLED', 'The injected production trust root schema is invalid');
  }
  return trustRoot;
}

function preferredBlocker(review) {
  const priorities = [
    'PRODUCTION_TRUST_ROOT_NOT_ENROLLED',
    'WITHDRAWAL_HEAD_NOT_ESTABLISHED',
    'WITHDRAWAL_LOG_NOT_ESTABLISHED',
  ];
  for (const code of priorities) {
    if (review.blockers.some((row) => row.code === code)) return code;
  }
  return review.blockers[0]?.code ?? 'STATIC_RIGHTS_GATE_BLOCKED';
}

export function verifyProductionRightsResult({ result, authorization }) {
  const { inventory, generatedProvenance, authoritySet, registry, withdrawalLog, routeConfigSha256, review } = result;
  if (review.status !== 'APPROVED') {
    fail(preferredBlocker(review), 'Production static-publication rights gate remains blocked');
  }
  verifyStaticPublicationGate({
    inventory,
    generatedProvenance,
    authoritySet,
    withdrawalLog,
    registry,
    review,
    manifest: review.sourceManifest,
    authorization,
    attributionFulfillments: registry.attributionFulfillments,
    routeConfigSha256,
    currentDecisionAsOf: registry.decisionAsOf,
    currentWithdrawalHeadHash: registry.withdrawalHeadHash,
  });
  return authorization.staticPublicationAuthorizationId;
}

async function main() {
  const repoRoot = process.cwd();
  const trustRootArg = process.argv.find((value) => value.startsWith('--trust-root='))?.slice('--trust-root='.length);
  const trustRoot = loadExternalTrustRoot({ repoRoot, argument: trustRootArg });
  const result = buildProductionRightsReview({ repoRoot, trustRoot });
  if (result.review.status !== 'APPROVED') {
    fail(preferredBlocker(result.review), 'Production static-publication rights gate remains blocked');
  }
  const authorizationFile = path.join(repoRoot, AUTHORIZATION_PATH);
  if (!existsSync(authorizationFile)) fail('STATIC_PUBLICATION_AUTHORIZATION_MISSING', 'The detached static publication authorization is missing');
  const authorization = readJson(authorizationFile, 'STATIC_PUBLICATION_AUTHORIZATION_INVALID');
  const staticPublicationAuthorizationId = verifyProductionRightsResult({ result, authorization });
  process.stdout.write(canonicalJson({ status: 'APPROVED', staticPublicationAuthorizationId }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = error instanceof RightsContractError ? error.code : 'STATIC_RIGHTS_GATE_FAILED';
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
