#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import { readFile, readdir, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadActiveRetailRelease } from '../../src/domain/active-retail-release.mjs';
import { compareAndSwapFitV4ShadowPointer } from '../../src/domain/fit-v4-run-manifest.mjs';
import { auditFitV4ShadowCohort } from './audit-fit-v4-shadow-cohort.mjs';
import { buildFitV4ShadowCohort } from './build-fit-v4-shadow-cohort.mjs';
import {
  auditFitV4LaundryCohort,
  buildFitV4LaundryCohort,
} from './build-fit-v4-laundry-cohort.mjs';
import { buildFitV4CalibrationReport } from './build-fit-v4-calibration-report.mjs';

const DEFAULT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUTPUT_PATH = 'data/architecture-v2/reviews/automated/fit-v4-cutover-candidate.json';
const RUNBOOK_PATH = 'docs/architecture-v2/fit-v4-cutover-runbook.md';
const PACKET_PATH = 'docs/architecture-v2/fit-v4-cutover-decision-packet.md';
const CALIBRATION_PATH = 'tests/fixtures/architecture-v2/fit-v4-labelled-cases.json';
const LABEL_REGISTRY_PATH = 'tests/fixtures/architecture-v2/fit-v4-label-registry.json';
const ACTIVE_RELEASE_PATH = 'data/architecture-v2/decisions/active-retail-release.json';
const FIELD_MAP_PATH = 'data/architecture-v2/policies/fit-v4-field-map.json';
const RECEIPT_BUNDLE_PATH = 'data/architecture-v2/reviews/automated/installation-evidence-receipts.json';
const IDENTITY_MAP_PATH = 'data/architecture-v2/generated/canonical-registry.json';
const PRIOR_BROWSER_QA_PATH = 'reports/release-candidate-qa/browser-qa.json';
const PUBLIC_BASELINE_SHA256 = '37c339c49719249e74f207705911a35fb6cc99c5647710d99edd4fb5923cacd7';
const DEPLOYMENT_BASELINE_SHA256 = 'ca1c47034eb5b2cd33dba80ae1334487ea723547b041723cd822a46230a68e27';
const ROUTE_BASELINE_SHA256 = '86b42dadcb952d01afabd40b51a1948804a62d39fdfea5381cca5581590124d6';
const SITEMAP_BASELINE_SHA256 = '5b2cb9c65acdcdc59bc790fe4f071852196e4cb88d17dc680c8b59a165def9b3';
const PUBLIC_DATA_BASELINE_SHA256 = 'c2bc01d73ddd3ed1aaf4e2d88b07bec8b59839ecda77f731f8b9b00ce58baa4f';

const DEPLOYMENT_EXPLICIT_FILES = Object.freeze([
  '.vercelignore', 'vercel.json', 'package.json', 'package-lock.json', 'index.html',
  'google32758d7798f4a670.html',
  'google5keGnUyvuq31_mxZ9pNVPIsh7BzKBbM7aHdxUTZZDJM.html',
]);
const DEPLOYMENT_TREE_PATHS = Object.freeze(['public', 'pages', 'api', 'data/pdf-evidence']);

const V4_SOURCE_PATHS = Object.freeze([
  'src/domain/fit-v4-contract.mjs',
  'src/domain/fit-relation-v4.mjs',
  'src/domain/fit-rule-v4.mjs',
  'src/domain/installation-evidence-receipt-v4.mjs',
  'src/domain/installation-knowledge-v4.mjs',
  'src/domain/site-profile-v4.mjs',
  'src/domain/fit-v4-shadow.mjs',
  'src/domain/fit-v4-audit.mjs',
  'src/domain/fit-rank-v4.mjs',
  'src/domain/fit-policies-v4/index.mjs',
  'src/domain/fit-policies-v4/dishwasher.mjs',
  'src/domain/fit-policies-v4/dryer.mjs',
  'src/domain/fit-policies-v4/fridge.mjs',
  'src/domain/fit-policies-v4/washing-machine.mjs',
]);

const V4_CONTROL_SOURCE_PATHS = Object.freeze([
  'src/domain/fit-v4-run-manifest.mjs',
  'scripts/architecture-v2/audit-fit-v4-shadow.mjs',
  'scripts/architecture-v2/build-fit-v4-shadow-cohort.mjs',
  'scripts/architecture-v2/audit-fit-v4-shadow-cohort.mjs',
  'scripts/architecture-v2/build-fit-v4-laundry-cohort.mjs',
  'scripts/architecture-v2/build-fit-v4-calibration-report.mjs',
  'scripts/architecture-v2/build-fit-v4-cutover-candidate.mjs',
]);

const UX_PATHS = Object.freeze([
  'tests/helpers/fit-v4-ui-harness.mjs',
  'tests/fixtures/fit-v4-ui/synthetic-fit-case.json',
  'tests/fit-v4-ui-harness.test.mjs',
]);

const BLOCKER_CODES = Object.freeze([
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
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function semanticHash(value) {
  return sha256(JSON.stringify(canonical(value)));
}

async function fileBinding(root, path) {
  const bytes = await readFile(resolve(root, path));
  return { path, bytesSha256: sha256(bytes), byteLength: bytes.length };
}

async function treeFiles(root, relativeDirectory) {
  const directory = resolve(root, relativeDirectory);
  const rows = [];
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        const relativePath = relative(root, path).split(sep).join('/');
        const bytes = await readFile(path);
        rows.push({ path: relativePath, bytesSha256: sha256(bytes), byteLength: bytes.length });
      } else throw new Error(`unsupported deployment entry rejected: ${relative(root, path)}`);
    }
  }
  await visit(directory);
  return rows;
}

function treeHash(files) {
  return sha256([...files]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((row) => `${row.bytesSha256}  ${row.path}\n`).join(''));
}

async function deploymentSurfaceBinding(root) {
  const [explicitFiles, ...trees] = await Promise.all([
    Promise.all(DEPLOYMENT_EXPLICIT_FILES.map((path) => fileBinding(root, path))),
    ...DEPLOYMENT_TREE_PATHS.map((path) => treeFiles(root, path)),
  ]);
  const files = [...explicitFiles, ...trees.flat()];
  return {
    explicitFiles,
    trees: trees.map((rows, index) => ({
      path: DEPLOYMENT_TREE_PATHS[index],
      fileCount: rows.length,
      treeSha256: treeHash(rows),
    })),
    fileCount: files.length,
    treeSha256: treeHash(files),
  };
}

function routeInventory(bytes) {
  const config = JSON.parse(bytes);
  const routes = canonical({ redirects: config.redirects ?? [], rewrites: config.rewrites ?? [] });
  return {
    path: 'vercel.json',
    bytesSha256: sha256(bytes),
    redirectCount: routes.redirects.length,
    rewriteCount: routes.rewrites.length,
    semanticSha256: semanticHash(routes),
  };
}

function derivedDelta(baselineSha256, currentSha256) {
  return {
    baselineSha256,
    currentSha256,
    changed: baselineSha256 !== currentSha256,
  };
}

function blockersFor({ cohort, laundry, calibration }) {
  const currentShortfall = Object.values(laundry.scopeDecision.currentRetailSample.byCategory)
    .reduce((sum, row) => sum + row.shortfall, 0);
  const executableResults = cohort.products.filter((row) => row.v4.executed === true).length
    + laundry.summary.receiptBoundExactLaundryProducts;
  const details = {
    NO_REAL_RECEIPT_BOUND_V4_EVALUATION_EPOCH: { observed: 0, required: 1 },
    NO_EXECUTABLE_COHORT_V4_RESULTS: { observed: executableResults, required: 1 },
    NO_SOURCE_BACKED_CALIBRATION_LABELS: { observed: calibration.summary.sourceBackedCaseCount, required: 1 },
    NO_ELIGIBLE_CALIBRATION_CATEGORIES: { observed: calibration.summary.eligibleCategoryCount, required: 1 },
    LEGACY_CONSUMERS_NOT_MIGRATED: { total: calibration.inventory.uniqueFileCount, migrated: 0 },
    NO_FIT_V4_BROWSER_QA: { observed: 'NOT_RUN', required: 'FIT_V4_REAL_BROWSER_AND_ASSISTIVE_TECH_QA' },
    LAUNDRY_CURRENT_RETAIL_SAMPLE_SHORTFALL: { shortfall: currentShortfall },
    NO_SUPPORTED_LAUNDRY_BRANCHES: {
      observed: laundry.summary.policyBranchCoverage.supported,
      required: laundry.summary.policyBranchCoverage.total,
    },
    NO_PUBLIC_ADAPTER_CANDIDATE: { observed: false },
    NO_REAL_POST_CHANGE_ROLLBACK_SNAPSHOT: { observed: false },
    NO_OWNER_APPROVAL: { observed: false },
  };
  return BLOCKER_CODES.map((code) => ({ code, ...details[code] }));
}

export async function buildFitV4CutoverCandidate({ root = DEFAULT_ROOT } = {}) {
  const repoRoot = resolve(root);
  const [
    active, cohort, laundry, calibrationBytes, labelRegistryBytes,
    priorBrowserQaBytes, publicFiles, deploymentSurface, vercelBytes,
    sitemap, publicDataFiles,
  ] = await Promise.all([
    loadActiveRetailRelease({ root: repoRoot }),
    buildFitV4ShadowCohort({ root: repoRoot }),
    buildFitV4LaundryCohort({ root: repoRoot }),
    readFile(resolve(repoRoot, CALIBRATION_PATH)),
    readFile(resolve(repoRoot, LABEL_REGISTRY_PATH)),
    readFile(resolve(repoRoot, PRIOR_BROWSER_QA_PATH)),
    treeFiles(repoRoot, 'public'),
    deploymentSurfaceBinding(repoRoot),
    readFile(resolve(repoRoot, 'vercel.json')),
    fileBinding(repoRoot, 'public/sitemap.xml'),
    treeFiles(repoRoot, 'public/data'),
  ]);
  const [cohortAudit, laundryAudit] = await Promise.all([
    auditFitV4ShadowCohort(cohort, { root: repoRoot }),
    auditFitV4LaundryCohort(laundry, { root: repoRoot }),
  ]);
  if (!cohortAudit.passed || !laundryAudit.passed) throw new Error('authoritative cohort replay audit failed');

  const calibrationManifest = JSON.parse(calibrationBytes);
  const labelRegistry = JSON.parse(labelRegistryBytes);
  const priorBrowserQa = JSON.parse(priorBrowserQaBytes);
  const calibration = buildFitV4CalibrationReport({
    manifest: calibrationManifest,
    labelRegistry,
    repoRoot,
  });
  const activeArtifactPaths = [
    active.descriptor.artifacts.publicProjection.path,
    active.descriptor.artifacts.historicalReference.path,
    active.descriptor.artifacts.authorizationManifest.path,
  ];
  const publicTree = { files: publicFiles, fileCount: publicFiles.length, treeSha256: treeHash(publicFiles) };
  const publicDataTree = {
    path: 'public/data',
    fileCount: publicDataFiles.length,
    treeSha256: treeHash(publicDataFiles),
  };
  const routes = routeInventory(vercelBytes);

  const semantic = canonical({
    schemaVersion: 1,
    artifactType: 'FIT_V4_CUTOVER_PREPARATION_CANDIDATE',
    decision: {
      status: 'BLOCKED',
      approvedPublicScope: { categories: [], configurations: [] },
      numericTotalEnabled: false,
      perfectFitClaimAuthorized: false,
      ownerApproval: 'ABSENT',
    },
    bindings: {
      activeRelease: {
        releaseCandidateId: active.descriptor.releaseCandidateId,
        descriptor: await fileBinding(repoRoot, ACTIVE_RELEASE_PATH),
        artifacts: await Promise.all(activeArtifactPaths.map((path) => fileBinding(repoRoot, path))),
      },
      activeReleasePointerBytes: await fileBinding(repoRoot, ACTIVE_RELEASE_PATH),
      identityMap: await fileBinding(repoRoot, IDENTITY_MAP_PATH),
      fieldRightsMap: await fileBinding(repoRoot, FIELD_MAP_PATH),
      installationReceiptBundle: await fileBinding(repoRoot, RECEIPT_BUNDLE_PATH),
      v4Sources: await Promise.all(V4_SOURCE_PATHS.map((path) => fileBinding(repoRoot, path))),
      v4ControlSources: await Promise.all(V4_CONTROL_SOURCE_PATHS.map((path) => fileBinding(repoRoot, path))),
      calibrationManifest: {
        ...await fileBinding(repoRoot, CALIBRATION_PATH),
        manifestId: calibrationManifest.manifestId,
        labelRegistrySha256: calibrationManifest.labelRegistrySha256,
        semanticSha256: semanticHash(calibrationManifest),
      },
      calibrationLabelRegistry: {
        ...await fileBinding(repoRoot, LABEL_REGISTRY_PATH),
        registryId: labelRegistry.registryId,
        registrySha256: labelRegistry.registrySha256,
        semanticSha256: semanticHash(labelRegistry),
      },
      uxTestContract: {
        production: false,
        browserQa: false,
        syntheticProfilesOnly: true,
        files: await Promise.all(UX_PATHS.map((path) => fileBinding(repoRoot, path))),
      },
      priorRetailLifecycleBrowserQa: {
        ...await fileBinding(repoRoot, PRIOR_BROWSER_QA_PATH),
        candidateReleaseId: priorBrowserQa.candidateReleaseId ?? null,
        status: priorBrowserQa.status ?? null,
        classification: {
          acceptedAsFitV4: false,
          reasonCode: 'DIFFERENT_CANDIDATE_AND_TEST_SCOPE',
        },
      },
      publicTree,
      deploymentSurface,
      routeInventory: routes,
      sitemap,
      publicDataTree,
    },
    cohorts: {
      refrigeratorDishwasher: {
        cohortId: cohort.cohortId,
        semanticSha256: cohort.semanticSha256,
        summary: cohort.summary,
        audit: cohortAudit,
        v4ReceiptBundle: {
          semanticSha256: cohort.v4ReceiptBundle.bundleSha256,
          receiptCount: cohort.v4ReceiptBundle.receipts.length,
        },
        executableV4Results: cohort.products.filter((row) => row.v4.executed === true).length,
      },
      laundry: {
        cohortId: laundry.cohortId,
        semanticSha256: laundry.semanticSha256,
        summary: laundry.summary,
        scopeDecision: laundry.scopeDecision,
        audit: laundryAudit,
      },
    },
    calibration: {
      summary: calibration.summary,
      metrics: calibration.metrics,
      categories: calibration.categories,
      totalEnabled: false,
    },
    legacyConsumers: {
      total: calibration.inventory.uniqueFileCount,
      migrated: 0,
      files: calibration.inventory.files,
    },
    evaluationEpoch: { realReceiptBoundEpochCount: 0, status: 'ABSENT' },
    qa: {
      fitV4Browser: { status: 'NOT_RUN', realBrowser: false, assistiveTechnology: false },
      testHarness: { status: 'TEST_ONLY', production: false },
      retailLifecycleBrowserQaAcceptedAsV4: false,
    },
    privacy: { realSiteDataPersisted: false, testProfiles: 'SYNTHETIC_ONLY' },
    deltas: {
      routes: derivedDelta(ROUTE_BASELINE_SHA256, routes.semanticSha256),
      sitemap: derivedDelta(SITEMAP_BASELINE_SHA256, sitemap.bytesSha256),
      publicData: derivedDelta(PUBLIC_DATA_BASELINE_SHA256, publicDataTree.treeSha256),
      deployment: derivedDelta(DEPLOYMENT_BASELINE_SHA256, deploymentSurface.treeSha256),
    },
    rollback: {
      proofType: 'PRIVATE_POINTER_REHEARSAL_ONLY',
      publicRollbackProven: false,
      realPostChangeSnapshotPresent: false,
      priorActiveReleasePointerBytesSha256: sha256(await readFile(resolve(repoRoot, ACTIVE_RELEASE_PATH))),
    },
    blockers: blockersFor({ cohort, laundry, calibration }),
    isolation: {
      outputClass: 'NON_PUBLIC_DECISION_ARTIFACT',
      publicMutation: false,
      adapterSwitch: false,
      deployment: false,
      publicationWriter: false,
    },
  });
  const semanticSha256 = semanticHash(semantic);
  return Object.freeze({
    ...semantic,
    candidateId: `fit_v4_cutover_${semanticSha256.slice(0, 24)}`,
    semanticSha256,
  });
}

export async function auditFitV4CutoverCandidate(candidate, { root = DEFAULT_ROOT } = {}) {
  const expected = await buildFitV4CutoverCandidate({ root });
  const violations = [];
  const comparisons = [
    ['ACTIVE_RELEASE_BINDING_DRIFT', candidate?.bindings?.activeRelease, expected.bindings.activeRelease],
    ['COHORT_BINDING_DRIFT', candidate?.cohorts, expected.cohorts],
    ['CALIBRATION_BINDING_DRIFT', candidate?.calibration, expected.calibration],
    ['CONSUMER_INVENTORY_DRIFT', candidate?.legacyConsumers, expected.legacyConsumers],
    ['BROWSER_QA_CLAIM_DRIFT', candidate?.qa, expected.qa],
    ['PUBLIC_TREE_BINDING_DRIFT', candidate?.bindings?.publicTree, expected.bindings.publicTree],
    ['CALIBRATION_LABEL_REGISTRY_DRIFT', candidate?.bindings?.calibrationLabelRegistry, expected.bindings.calibrationLabelRegistry],
    ['DEPLOYMENT_SURFACE_BINDING_DRIFT', candidate?.bindings?.deploymentSurface, expected.bindings.deploymentSurface],
    ['ROUTE_INVENTORY_DRIFT', candidate?.bindings?.routeInventory, expected.bindings.routeInventory],
    ['SITEMAP_BINDING_DRIFT', candidate?.bindings?.sitemap, expected.bindings.sitemap],
    ['PUBLIC_DATA_BINDING_DRIFT', candidate?.bindings?.publicDataTree, expected.bindings.publicDataTree],
    ['PUBLIC_DELTA_DRIFT', candidate?.deltas, expected.deltas],
    ['CONTROL_SOURCE_BINDING_DRIFT', candidate?.bindings?.v4ControlSources, expected.bindings.v4ControlSources],
    ['BROWSER_QA_EVIDENCE_DRIFT', candidate?.bindings?.priorRetailLifecycleBrowserQa, expected.bindings.priorRetailLifecycleBrowserQa],
    ['ROLLBACK_BOUNDARY_DRIFT', candidate?.rollback, expected.rollback],
  ];
  for (const [code, observed, required] of comparisons) {
    if (JSON.stringify(canonical(observed)) !== JSON.stringify(canonical(required))) {
      violations.push({ code, detail: 'claim differs from independently rebuilt tracked inputs' });
    }
  }
  if (candidate?.candidateId !== expected.candidateId || candidate?.semanticSha256 !== expected.semanticSha256) {
    violations.push({ code: 'CANDIDATE_IDENTITY_DRIFT', detail: 'candidate identity is not the tracked-input semantic identity' });
  }
  if (JSON.stringify(canonical(candidate)) !== JSON.stringify(canonical(expected))) {
    violations.push({ code: 'SOURCE_REPLAY_DRIFT', detail: 'candidate differs from independently rebuilt tracked inputs' });
  }
  return { passed: violations.length === 0, violations };
}

function isolatedOutputPath(path) {
  if (typeof path !== 'string' || !path.trim()) throw new TypeError('explicit output path required');
  const absolute = resolve(path);
  if (absolute.split(sep).some((part) => part.toLowerCase() === 'public')) {
    throw new Error('non-public output path required');
  }
  return absolute;
}

async function atomicWrite(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(8).toString('hex')}`;
  try {
    await writeFile(temporary, bytes, { flag: 'wx' });
    if (sha256(await readFile(temporary)) !== sha256(bytes)) throw new Error('temporary output verification failed');
    await rename(temporary, path);
    if (sha256(await readFile(path)) !== sha256(bytes)) throw new Error('atomic output verification failed');
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function writeFitV4CutoverCandidate({ candidate, outputPath } = {}) {
  const path = isolatedOutputPath(outputPath);
  await atomicWrite(path, Buffer.from(`${JSON.stringify(candidate, null, 2)}\n`));
  return path;
}

export async function rehearsePrivatePointerRollback({
  runsRoot,
  shadowRoot,
  priorManifest,
  rehearsalManifest,
} = {}) {
  const root = resolve(shadowRoot);
  if (root.split(sep).some((part) => part.toLowerCase() === 'public')) {
    throw new Error('private pointer rehearsal requires isolated storage');
  }
  const pointerPath = join(root, 'active-shadow.json');
  const priorBytes = await readFile(pointerPath);
  const prior = JSON.parse(priorBytes);
  await compareAndSwapFitV4ShadowPointer({
    runsRoot,
    shadowRoot: root,
    expectedPointer: prior,
    nextManifest: rehearsalManifest,
  });
  const rehearsal = JSON.parse(await readFile(pointerPath, 'utf8'));
  let staleCasRejected = false;
  try {
    await compareAndSwapFitV4ShadowPointer({
      runsRoot,
      shadowRoot: root,
      expectedPointer: prior,
      nextManifest: rehearsalManifest,
    });
  } catch (error) {
    if (!/stale compare-and-swap/.test(error.message)) throw error;
    staleCasRejected = true;
  }
  await compareAndSwapFitV4ShadowPointer({
    runsRoot,
    shadowRoot: root,
    expectedPointer: rehearsal,
    nextManifest: priorManifest,
  });
  return {
    proofType: 'PRIVATE_POINTER_REHEARSAL_ONLY',
    restoredExactPriorBytes: Buffer.compare(await readFile(pointerPath), priorBytes) === 0,
    staleCasRejected,
  };
}

export function renderFitV4CutoverRunbook(candidate) {
  return `# Fit V4 Cutover Runbook

## Current State

Candidate \`${candidate.candidateId}\` is **BLOCKED**. This preparation does not authorize a public adapter, deployment, score, or claim change.

## Preparation Preflight

\`\`\`sh
node --test tests/architecture-v2/fit-v4-cutover-candidate.test.mjs
node --check scripts/architecture-v2/build-fit-v4-cutover-candidate.mjs
node scripts/architecture-v2/build-fit-v4-cutover-candidate.mjs
git diff --check
\`\`\`

The builder independently reloads the active retail release, rebuilds and audits both authoritative cohorts, validates the frozen label registry, rebuilds calibration and the complete consumer inventory, and binds the complete Vercel deployment surface before writing only non-public review artifacts.

## Required Sequence

1. Produce a real receipt-bound V4 evaluation epoch and replay its manifest.
2. Rebuild and audit both authoritative cohorts.
3. Collect independent source-backed labels and calibrate each category.
4. Migrate and verify all ${candidate.legacyConsumers.total} legacy consumers without generic score fallback.
5. Materialize the smallest adapter in an isolated candidate branch.
6. Capture pre-change public, route, sitemap, public-data, deployment, and pointer bytes.
7. Run real desktop/mobile browser and assistive-technology QA for Fit V4. Retail-lifecycle QA cannot satisfy this gate.
8. Capture the real post-change snapshot, exercise rollback, and prove byte-identical restoration. The current private pointer rehearsal is not this proof.
9. Rebuild this packet from the changed candidate and present it for explicit owner approval.
10. Only after approval, deploy the approved category/configuration scope and monitor; rollback on any binding, privacy, false-acceptance, or rendering failure.

## Rollback Procedure for a Future Adapter Candidate

1. Stop new writes and preserve the failed deployment and evaluation manifests.
2. CAS the real candidate pointer only from the observed candidate ID to the captured prior ID; reject stale expectations.
3. Restore captured public and deployment artifacts, then verify every byte hash, route, sitemap and public-data inventory.
4. Rerun desktop/mobile smoke and accessibility checks against the restored version.
5. Record the rollback result as a new evidence object; never relabel the private pointer rehearsal as production proof.

## Prohibitions

No adapter switch, publication writer, numeric total, Perfect Fit claim, deployment, or persisted real-site profile is permitted while any typed blocker remains.
`;
}

export function renderFitV4CutoverDecisionPacket(candidate) {
  const blockers = candidate.blockers.map((row) => `- \`${row.code}\``).join('\n');
  const task7 = candidate.cohorts.refrigeratorDishwasher;
  const laundry = candidate.cohorts.laundry;
  const dryer = laundry.scopeDecision.currentRetailSample.byCategory.dryer;
  const washer = laundry.scopeDecision.currentRetailSample.byCategory.washing_machine;
  const deltaState = (delta) => delta.changed ? 'changed' : 'unchanged';
  return `# Fit V4 Cutover Decision Packet

## Decision

- Status: **${candidate.decision.status}**
- Approved categories/configurations: **none**
- Numeric total: **disabled**
- Perfect Fit or equivalent claim: **not authorized**
- Owner approval: **absent**

## Evidence and Outcomes

- Refrigerator/dishwasher cohort: **${task7.summary.total} products**, ${task7.executableV4Results} executable V4 results, ${task7.summary.disagreementClasses.MISSING_V4_EVIDENCE} missing-evidence classifications and ${task7.summary.disagreementClasses.IDENTITY_DEFECT} identity defects.
- Laundry cohort: **${laundry.summary.selected.byLifecycle.CURRENT_RETAIL} current / ${laundry.summary.selected.byLifecycle.UNKNOWN_RETAIL} unknown / ${laundry.summary.selected.byLifecycle.CATALOG_ARCHIVED} archived**, ${laundry.summary.receiptBoundExactLaundryProducts} receipt-bound exact products.
- Current-retail shortfall: dryer **${dryer.shortfall}** (${dryer.available}/${dryer.target ?? 50} available), washing machine **${washer.shortfall}** (${washer.available}/${washer.target ?? 50} available); supported laundry policy branches: **${laundry.summary.policyBranchCoverage.supported}/${laundry.summary.policyBranchCoverage.total}**.
- Laundry quarantine/exclusion: **${laundry.summary.identityQuarantineCount}** identity rows quarantined and **${laundry.summary.excludedWashTowerCount}** WashTower rows excluded.
- Source-backed labels: **${candidate.calibration.summary.sourceBackedCaseCount}**
- Eligible categories: **${candidate.calibration.summary.eligibleCategoryCount}/4**
- False acceptance/rejection and rank metrics: **not measurable**
- V2/V3/V4 disagreements remain shadow diagnostics; lifecycle presence is not installation evidence.

## Consumer and UX Status

- Legacy consumers: **${candidate.legacyConsumers.total} total / ${candidate.legacyConsumers.migrated} migrated**
- Fit V4 real desktop/mobile browser and assistive-technology QA: **not run**
- Existing retail-lifecycle browser QA accepted for Fit V4: **no**
- Test-only UX harness: synthetic profiles only; it is not real-browser, accessibility-certification or production proof.
- Real site profiles persisted: **no**

## Public Delta and Rollback

- Route inventory: **${deltaState(candidate.deltas.routes)}**
- Sitemap: **${deltaState(candidate.deltas.sitemap)}**
- Public data: **${deltaState(candidate.deltas.publicData)}**
- Complete deployment surface: **${deltaState(candidate.deltas.deployment)}**
- Public tree: \`${candidate.bindings.publicTree.treeSha256}\`
- Deployment surface: \`${candidate.bindings.deploymentSurface.treeSha256}\`
- Rollback evidence: **PRIVATE_POINTER_REHEARSAL_ONLY**; no real post-change snapshot exists.

## Typed Blockers

${blockers}

No deployment or adapter switch may occur before every blocker is cleared and explicit owner approval is recorded.
`;
}

export async function runCli() {
  const root = DEFAULT_ROOT;
  const candidate = await buildFitV4CutoverCandidate({ root });
  await Promise.all([
    writeFitV4CutoverCandidate({ candidate, outputPath: resolve(root, OUTPUT_PATH) }),
    atomicWrite(resolve(root, RUNBOOK_PATH), Buffer.from(renderFitV4CutoverRunbook(candidate))),
    atomicWrite(resolve(root, PACKET_PATH), Buffer.from(renderFitV4CutoverDecisionPacket(candidate))),
  ]);
  process.stdout.write(`${JSON.stringify({
    candidateId: candidate.candidateId,
    status: candidate.decision.status,
    blockerCount: candidate.blockers.length,
    publicTreeSha256: candidate.bindings.publicTree.treeSha256,
    deploymentSurfaceSha256: candidate.bindings.deploymentSurface.treeSha256,
  })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runCli();
}
