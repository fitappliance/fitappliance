import assert from 'node:assert/strict';
import { readFile, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  auditFitV4CutoverCandidate,
  buildFitV4CutoverCandidate,
  rehearsePrivatePointerRollback,
  writeFitV4CutoverCandidate,
} from '../../scripts/architecture-v2/build-fit-v4-cutover-candidate.mjs';
import {
  compareAndSwapFitV4ShadowPointer,
  writeFitV4RunManifest,
} from '../../src/domain/fit-v4-run-manifest.mjs';
import {
  buildTrustedFitV4Input,
  observation,
  writeFitV4PassingShadowActivationProof,
} from '../helpers/fit-v4-trusted-evaluation-fixture.mjs';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const REQUIRED_BLOCKERS = [
  'NO_REAL_RECEIPT_BOUND_V4_EVALUATION_EPOCH',
  'NO_EXECUTABLE_COHORT_V4_RESULTS',
  'NO_SOURCE_BACKED_CALIBRATION_LABELS',
  'NO_ELIGIBLE_CALIBRATION_CATEGORIES',
  'LEGACY_CONSUMERS_NOT_MIGRATED',
  'NO_FIT_V4_BROWSER_QA',
  'LAUNDRY_CURRENT_RETAIL_SAMPLE_SHORTFALL',
  'NO_SUPPORTED_LAUNDRY_BRANCHES',
  'NO_PUBLIC_ADAPTER_CANDIDATE',
  'NO_REAL_POST_CHANGE_ROLLBACK_SNAPSHOT',
  'NO_OWNER_APPROVAL',
];

test('rebuilds a deterministic, fully blocked, non-public cutover candidate', async () => {
  const first = await buildFitV4CutoverCandidate({ root: ROOT });
  const second = await buildFitV4CutoverCandidate({ root: ROOT });

  assert.deepEqual(first, second);
  assert.match(first.candidateId, /^fit_v4_cutover_[a-f0-9]{24}$/);
  assert.equal(first.semanticSha256.length, 64);
  assert.equal(first.decision.status, 'BLOCKED');
  assert.deepEqual(first.decision.approvedPublicScope, { categories: [], configurations: [] });
  assert.equal(first.decision.numericTotalEnabled, false);
  assert.equal(first.decision.perfectFitClaimAuthorized, false);
  assert.deepEqual(first.blockers.map((row) => row.code), REQUIRED_BLOCKERS);
  assert.equal(first.calibration.summary.sourceBackedCaseCount, 0);
  assert.equal(first.calibration.summary.eligibleCategoryCount, 0);
  assert.equal(first.legacyConsumers.total, 58);
  assert.equal(first.legacyConsumers.migrated, 0);
  assert.equal(first.qa.fitV4Browser.status, 'NOT_RUN');
  assert.equal(first.qa.retailLifecycleBrowserQaAcceptedAsV4, false);
  assert.equal(first.deltas.routes.changed, false);
  assert.equal(first.deltas.sitemap.changed, false);
  assert.equal(first.deltas.publicData.changed, false);
  assert.equal(first.deltas.deployment.changed, false);
  assert.equal(first.isolation.publicMutation, false);
  assert.equal(first.rollback.proofType, 'PRIVATE_POINTER_REHEARSAL_ONLY');
  assert.equal(first.bindings.publicTree.treeSha256, '37c339c49719249e74f207705911a35fb6cc99c5647710d99edd4fb5923cacd7');
  assert.equal(first.bindings.deploymentSurface.treeSha256, 'ca1c47034eb5b2cd33dba80ae1334487ea723547b041723cd822a46230a68e27');
  assert.equal(first.bindings.deploymentSurface.fileCount, 3293);
  assert.equal(first.bindings.routeInventory.semanticSha256, '86b42dadcb952d01afabd40b51a1948804a62d39fdfea5381cca5581590124d6');
  assert.equal(first.bindings.sitemap.bytesSha256, '5b2cb9c65acdcdc59bc790fe4f071852196e4cb88d17dc680c8b59a165def9b3');
  assert.equal(first.bindings.publicDataTree.treeSha256, 'c2bc01d73ddd3ed1aaf4e2d88b07bec8b59839ecda77f731f8b9b00ce58baa4f');
  assert.equal(first.bindings.calibrationLabelRegistry.registrySha256, first.bindings.calibrationManifest.labelRegistrySha256);
  const boundControlPaths = new Set(first.bindings.v4ControlSources.map((row) => row.path));
  for (const path of [
    'src/domain/fit-v4-run-manifest.mjs',
    'scripts/architecture-v2/audit-fit-v4-shadow.mjs',
    'scripts/architecture-v2/build-fit-v4-shadow-cohort.mjs',
    'scripts/architecture-v2/audit-fit-v4-shadow-cohort.mjs',
    'scripts/architecture-v2/build-fit-v4-laundry-cohort.mjs',
    'scripts/architecture-v2/build-fit-v4-calibration-report.mjs',
  ]) assert.equal(boundControlPaths.has(path), true, `missing control binding: ${path}`);
  assert.deepEqual(first.bindings.priorRetailLifecycleBrowserQa.classification, {
    acceptedAsFitV4: false,
    reasonCode: 'DIFFERENT_CANDIDATE_AND_TEST_SCOPE',
  });
  const activeDescriptor = JSON.parse(await readFile(resolve(ROOT, 'data/architecture-v2/decisions/active-retail-release.json')));
  assert.equal(
    first.bindings.priorRetailLifecycleBrowserQa.candidateReleaseId,
    activeDescriptor.predecessorReleaseCandidateId,
  );
  assert.notEqual(
    first.bindings.priorRetailLifecycleBrowserQa.candidateReleaseId,
    first.bindings.activeRelease.releaseCandidateId,
  );
  const laundryBranchBlocker = first.blockers.find((row) => row.code === 'NO_SUPPORTED_LAUNDRY_BRANCHES');
  assert.equal(laundryBranchBlocker.observed, first.cohorts.laundry.summary.policyBranchCoverage.supported);
  assert.equal(laundryBranchBlocker.required, first.cohorts.laundry.summary.policyBranchCoverage.total);

  const audit = await auditFitV4CutoverCandidate(first, { root: ROOT });
  assert.deepEqual(audit, { passed: true, violations: [] });
});

test('independent replay rejects copied, stale, or self-rehashed claims', async () => {
  const candidate = await buildFitV4CutoverCandidate({ root: ROOT });
  const tampered = structuredClone(candidate);
  tampered.legacyConsumers.total = 57;
  tampered.qa.fitV4Browser.status = 'PASSED';
  tampered.blockers = tampered.blockers.filter((row) => row.code !== 'NO_OWNER_APPROVAL');
  tampered.semanticSha256 = 'a'.repeat(64);
  tampered.candidateId = `fit_v4_cutover_${tampered.semanticSha256.slice(0, 24)}`;

  const audit = await auditFitV4CutoverCandidate(tampered, { root: ROOT });
  assert.equal(audit.passed, false);
  assert.ok(audit.violations.some((row) => row.code === 'CONSUMER_INVENTORY_DRIFT'));
  assert.ok(audit.violations.some((row) => row.code === 'BROWSER_QA_CLAIM_DRIFT'));
  assert.ok(audit.violations.some((row) => row.code === 'CANDIDATE_IDENTITY_DRIFT'));
  assert.ok(audit.violations.some((row) => row.code === 'SOURCE_REPLAY_DRIFT'));
});

test('independent replay types stale active, cohort, calibration, and public-tree claims', async () => {
  const candidate = await buildFitV4CutoverCandidate({ root: ROOT });
  const tampered = structuredClone(candidate);
  tampered.bindings.activeRelease.descriptor.bytesSha256 = 'b'.repeat(64);
  tampered.cohorts.laundry.cohortId = 'fit_v4_laundry_stale';
  tampered.calibration.summary.eligibleCategoryCount = 4;
  tampered.bindings.publicTree.treeSha256 = 'c'.repeat(64);

  const audit = await auditFitV4CutoverCandidate(tampered, { root: ROOT });
  const codes = new Set(audit.violations.map((row) => row.code));
  assert.equal(audit.passed, false);
  assert.equal(codes.has('ACTIVE_RELEASE_BINDING_DRIFT'), true);
  assert.equal(codes.has('COHORT_BINDING_DRIFT'), true);
  assert.equal(codes.has('CALIBRATION_BINDING_DRIFT'), true);
  assert.equal(codes.has('PUBLIC_TREE_BINDING_DRIFT'), true);
});

test('independent replay separately types control-source and rollback-boundary drift', async () => {
  const candidate = await buildFitV4CutoverCandidate({ root: ROOT });
  const tampered = structuredClone(candidate);
  tampered.bindings.v4ControlSources = [];
  tampered.rollback.publicRollbackProven = true;

  const audit = await auditFitV4CutoverCandidate(tampered, { root: ROOT });
  const codes = new Set(audit.violations.map((row) => row.code));
  assert.equal(codes.has('CONTROL_SOURCE_BINDING_DRIFT'), true);
  assert.equal(codes.has('ROLLBACK_BOUNDARY_DRIFT'), true);
});

test('independent replay binds calibration labels and every deployment delta surface', async () => {
  const candidate = await buildFitV4CutoverCandidate({ root: ROOT });
  const tampered = structuredClone(candidate);
  tampered.bindings.calibrationLabelRegistry.registrySha256 = 'a'.repeat(64);
  tampered.bindings.deploymentSurface.treeSha256 = 'b'.repeat(64);
  tampered.bindings.routeInventory.semanticSha256 = 'c'.repeat(64);
  tampered.bindings.sitemap.bytesSha256 = 'd'.repeat(64);
  tampered.bindings.publicDataTree.treeSha256 = 'e'.repeat(64);
  tampered.deltas.routes.changed = true;

  const audit = await auditFitV4CutoverCandidate(tampered, { root: ROOT });
  const codes = new Set(audit.violations.map((row) => row.code));
  assert.equal(codes.has('CALIBRATION_LABEL_REGISTRY_DRIFT'), true);
  assert.equal(codes.has('DEPLOYMENT_SURFACE_BINDING_DRIFT'), true);
  assert.equal(codes.has('ROUTE_INVENTORY_DRIFT'), true);
  assert.equal(codes.has('SITEMAP_BINDING_DRIFT'), true);
  assert.equal(codes.has('PUBLIC_DATA_BINDING_DRIFT'), true);
  assert.equal(codes.has('PUBLIC_DELTA_DRIFT'), true);
});

test('writer is explicit, atomic, deterministic, and rejects public output', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'fit-v4-cutover-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const candidate = await buildFitV4CutoverCandidate({ root: ROOT });
  const outputPath = join(directory, 'candidate.json');

  await writeFitV4CutoverCandidate({ candidate, outputPath });
  assert.deepEqual(JSON.parse(await readFile(outputPath, 'utf8')), candidate);
  await writeFitV4CutoverCandidate({ candidate, outputPath });
  assert.deepEqual(JSON.parse(await readFile(outputPath, 'utf8')), candidate);
  await assert.rejects(
    () => writeFitV4CutoverCandidate({ candidate, outputPath: join(ROOT, 'public', 'candidate.json') }),
    /non-public output path required/,
  );
});

test('private pointer rehearsal restores exact bytes and rejects stale CAS', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'fit-v4-cutover-pointer-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const runsRoot = join(directory, 'runs');
  const shadowRoot = join(directory, 'shadow');
  const pointerPath = join(shadowRoot, 'active-shadow.json');
  const priorManifest = buildTrustedFitV4Input({ observations: [observation('cavity.width', 610)] }).runManifest;
  const rehearsalManifest = buildTrustedFitV4Input({ observations: [observation('cavity.width', 590)] }).runManifest;
  await writeFitV4RunManifest({ runsRoot, manifest: priorManifest });
  await writeFitV4RunManifest({ runsRoot, manifest: rehearsalManifest });
  await writeFitV4PassingShadowActivationProof({ runsRoot, manifest: priorManifest });
  await writeFitV4PassingShadowActivationProof({ runsRoot, manifest: rehearsalManifest });
  await compareAndSwapFitV4ShadowPointer({
    runsRoot,
    shadowRoot,
    expectedPointer: null,
    nextManifest: priorManifest,
  });
  const original = await readFile(pointerPath);

  const result = await rehearsePrivatePointerRollback({
    runsRoot,
    shadowRoot,
    priorManifest,
    rehearsalManifest,
  });
  assert.equal(result.proofType, 'PRIVATE_POINTER_REHEARSAL_ONLY');
  assert.equal(result.restoredExactPriorBytes, true);
  assert.equal(result.staleCasRejected, true);
  assert.deepEqual(await readFile(pointerPath), original);
});

test('builder contains no publication, deployment, active-release publisher, or score fallback', async () => {
  const source = await readFile(resolve(ROOT, 'scripts/architecture-v2/build-fit-v4-cutover-candidate.mjs'), 'utf8');
  for (const forbidden of [
    'publish-active-retail-release.mjs',
    'publish-historical-reference.mjs',
    'vercel deploy',
    'npm run deploy',
    'fit_score ??',
    'score ??',
    'atomicWrite(pointerPath, priorBytes)',
  ]) assert.equal(source.includes(forbidden), false, `forbidden cutover capability: ${forbidden}`);
});

async function directoryBytes(directory) {
  const rows = [];
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) rows.push([path.slice(ROOT.length + 1), await readFile(path, 'base64')]);
    }
  }
  await visit(directory);
  return rows;
}

test('candidate build leaves public, package metadata, and active pointer bytes unchanged', async () => {
  const protectedBefore = {
    public: await directoryBytes(join(ROOT, 'public')),
    package: await readFile(join(ROOT, 'package.json')),
    active: await readFile(join(ROOT, 'data/architecture-v2/decisions/active-retail-release.json')),
  };
  await buildFitV4CutoverCandidate({ root: ROOT });
  assert.deepEqual(await directoryBytes(join(ROOT, 'public')), protectedBefore.public);
  assert.deepEqual(await readFile(join(ROOT, 'package.json')), protectedBefore.package);
  assert.deepEqual(await readFile(join(ROOT, 'data/architecture-v2/decisions/active-retail-release.json')), protectedBefore.active);
});
