import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RightsContractError,
  buildRightsReview,
  buildGeneratedProvenance,
  buildStaticSourceInventory,
  canonicalJson,
  classifyStaticSources,
  validateAuthoritySet,
  validateDecisionRegistry,
  validateDecisionRegistryStructure,
  validateGeneratedProvenanceRepositoryBindings,
  validateWithdrawalLog,
} from '../../src/domain/static-publication-rights.mjs';

const DECISION_AS_OF = '2026-08-10T00:00:00.000Z';
const WITHDRAWAL_HEAD_HASH = '0'.repeat(64);
const PATHS = {
  inventory: 'deployment/static-source-inventory.json',
  provenance: 'deployment/static-generated-provenance.json',
  authorities: 'deployment/static-publication-authorities.json',
  registry: 'deployment/static-rights-source-registry.json',
  withdrawals: 'deployment/static-rights-withdrawal-log.json',
  review: 'deployment/static-rights-review.json',
  manifest: 'deployment/reviewed-static-source-manifest.json',
};

function readJson(repoRoot, relativePath) {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function writeJson(repoRoot, relativePath, value) {
  const absolutePath = path.join(repoRoot, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, canonicalJson(value));
}

export function buildProductionRightsReview({ repoRoot = process.cwd(), trustRoot } = {}) {
  const inventory = buildStaticSourceInventory({ repoRoot });
  const routeConfigSha256 = createHash('sha256')
    .update(readFileSync(path.join(repoRoot, 'vercel.json')))
    .digest('hex');
  const existingProvenance = existsSync(path.join(repoRoot, PATHS.provenance))
    ? readJson(repoRoot, PATHS.provenance)
    : { schemaVersion: 1, receipts: [] };
  const generatedProvenance = buildGeneratedProvenance({ inventory, existingProvenance });
  validateGeneratedProvenanceRepositoryBindings({ repoRoot, inventory, generatedProvenance });
  const authoritySet = existsSync(path.join(repoRoot, PATHS.authorities))
    ? readJson(repoRoot, PATHS.authorities)
    : { schemaVersion: 1, environment: 'PRODUCTION', trustRootEnrollment: null, authorities: [] };
  const registry = existsSync(path.join(repoRoot, PATHS.registry))
    ? readJson(repoRoot, PATHS.registry)
    : {
        schemaVersion: 1,
        decisionAsOf: DECISION_AS_OF,
        withdrawalHeadHash: WITHDRAWAL_HEAD_HASH,
        attributionFulfillments: [],
        decisions: [],
      };
  const withdrawalLog = existsSync(path.join(repoRoot, PATHS.withdrawals))
    ? readJson(repoRoot, PATHS.withdrawals)
    : null;
  const classification = classifyStaticSources({ inventory, generatedProvenance });
  const globalBlockers = [];
  let verifiedDecisions = [];
  validateDecisionRegistryStructure({
    registry,
    inventoryId: inventory.staticSourceInventoryId,
    decisionAsOf: registry.decisionAsOf,
    withdrawalHeadHash: registry.withdrawalHeadHash,
    attributionFulfillments: registry.attributionFulfillments,
    routeConfigSha256,
    publicationRows: inventory.rows,
    allowUnestablishedWithdrawal: true,
  });
  const placeholderWithdrawalHead = /^0{64}$/.test(registry.withdrawalHeadHash ?? '');
  if (placeholderWithdrawalHead) {
    if (registry.decisions.length > 0) {
      throw new RightsContractError('WITHDRAWAL_HEAD_NOT_ESTABLISHED', 'Signed decisions cannot use a placeholder withdrawal head');
    }
    globalBlockers.push('WITHDRAWAL_HEAD_NOT_ESTABLISHED');
  }
  let authorityReady = false;
  try {
    validateAuthoritySet({ authoritySet, trustRoot });
    authorityReady = true;
  } catch (error) {
    if (!(error instanceof RightsContractError)) throw error;
    if (!['PRODUCTION_TRUST_ROOT_NOT_ENROLLED', 'REPOSITORY_SELF_ENROLLMENT_FORBIDDEN'].includes(error.code)) throw error;
    globalBlockers.push(error.code);
  }
  if (withdrawalLog === null) {
    globalBlockers.push('WITHDRAWAL_LOG_NOT_ESTABLISHED');
  } else if (authorityReady) {
    const currentHead = validateWithdrawalLog({ withdrawalLog, authoritySet }).withdrawalHeadHash;
    if (registry.withdrawalHeadHash !== currentHead) {
      throw new RightsContractError('WITHDRAWAL_HEAD_MISMATCH', 'Decision registry does not bind the current signed withdrawal head');
    }
  }
  if (globalBlockers.length === 0) {
    verifiedDecisions = validateDecisionRegistry({
      registry,
      authoritySet,
      inventoryId: inventory.staticSourceInventoryId,
      decisionAsOf: registry.decisionAsOf,
      withdrawalHeadHash: registry.withdrawalHeadHash,
      attributionFulfillments: registry.attributionFulfillments,
      routeConfigSha256,
      publicationRows: inventory.rows,
      trustRoot,
    }).decisions;
  }
  const review = buildRightsReview({
    inventory,
    classifiedRows: classification.rows,
    verifiedDecisions,
    decisionAsOf: registry.decisionAsOf,
    withdrawalHeadHash: registry.withdrawalHeadHash,
    globalBlockers,
  });
  const reviewArtifact = { ...review };
  delete reviewArtifact.sourceManifest;
  writeJson(repoRoot, PATHS.inventory, inventory);
  writeJson(repoRoot, PATHS.provenance, generatedProvenance);
  writeJson(repoRoot, PATHS.authorities, authoritySet);
  writeJson(repoRoot, PATHS.registry, registry);
  writeJson(repoRoot, PATHS.review, reviewArtifact);
  writeJson(repoRoot, PATHS.manifest, review.sourceManifest);
  return { inventory, generatedProvenance, authoritySet, registry, withdrawalLog, routeConfigSha256, review, trustRoot };
}

async function main() {
  const result = buildProductionRightsReview();
  if (process.argv.includes('--verify-gate')) {
    const blocker = result.review.blockers.find((row) => row.code === 'PRODUCTION_TRUST_ROOT_NOT_ENROLLED')?.code
      ?? result.review.blockers[0]?.code
      ?? 'STATIC_RIGHTS_GATE_BLOCKED';
    throw new RightsContractError(blocker, 'Production static-publication rights gate remains blocked');
  }
  process.stdout.write(`${canonicalJson({
    status: result.review.status,
    inventoryCount: result.inventory.rows.length,
    staticSourceInventoryId: result.inventory.staticSourceInventoryId,
    blockerCodes: [...new Set(result.review.blockers.map((row) => row.code))].sort(),
  })}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = error instanceof RightsContractError ? error.code : 'STATIC_RIGHTS_REVIEW_FAILED';
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
