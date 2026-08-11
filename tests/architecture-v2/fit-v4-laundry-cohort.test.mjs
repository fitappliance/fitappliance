import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { loadActiveRetailRelease } from '../../src/domain/active-retail-release.mjs';
import { FIT_POLICY_PACKS_V4 } from '../../src/domain/fit-policies-v4/index.mjs';
import {
  auditFitV4LaundryCohort,
  buildFitV4LaundryCohort,
  selectLaundryProducts,
  writeFitV4LaundryCohort,
} from '../../scripts/architecture-v2/build-fit-v4-laundry-cohort.mjs';

const ROOT = new URL('../..', import.meta.url).pathname;

const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const semanticHash = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

function rehash(artifact) {
  const copy = structuredClone(artifact);
  delete copy.semanticSha256;
  delete copy.cohortId;
  const semanticSha256 = semanticHash(copy);
  return { ...copy, cohortId: `fit_v4_laundry_${semanticSha256.slice(0, 24)}`, semanticSha256 };
}

async function catalogProducts() {
  return (await loadActiveRetailRelease({ root: ROOT })).catalog.products;
}

test('selection is deterministic for repeated and reversed catalog order', async () => {
  const products = await catalogProducts();
  for (const category of ['washing_machine', 'dryer']) {
    const first = selectLaundryProducts(products, category, 50);
    const repeated = selectLaundryProducts(products, category, 50);
    const reversed = selectLaundryProducts([...products].reverse(), category, 50);
    assert.deepEqual(repeated, first);
    assert.deepEqual(reversed, first);
  }
});

test('cohort contains exactly 50 washers and 50 dryers with honest lifecycle counts', async () => {
  const artifact = await buildFitV4LaundryCohort({ root: ROOT });
  assert.equal(artifact.products.length, 100);
  assert.equal(new Set(artifact.products.map((row) => row.canonicalProductId)).size, 100);
  assert.deepEqual(artifact.summary.selected.byCategory, { dryer: 50, washing_machine: 50 });
  assert.deepEqual(artifact.summary.selected.byLifecycle, {
    CATALOG_ARCHIVED: 16,
    CURRENT_RETAIL: 12,
    UNKNOWN_RETAIL: 72,
  });
  assert.deepEqual(artifact.summary.selected.byCategoryLifecycle, {
    dryer: { CATALOG_ARCHIVED: 16, CURRENT_RETAIL: 4, UNKNOWN_RETAIL: 30 },
    washing_machine: { CURRENT_RETAIL: 8, UNKNOWN_RETAIL: 42 },
  });
});

test('current-retail shortfalls are explicit and separate from full cohort selection', async () => {
  const artifact = await buildFitV4LaundryCohort({ root: ROOT });
  assert.deepEqual(artifact.scopeDecision.currentRetailSample, {
    targetPerCategory: 50,
    byCategory: {
      dryer: { available: 4, selected: 4, shortfall: 46 },
      washing_machine: { available: 8, selected: 8, shortfall: 42 },
    },
    targetMet: false,
  });
  assert.equal(artifact.scopeDecision.laundryCalibrationEligible, false);
  assert.deepEqual(artifact.scopeDecision.maximumFuturePublicCandidateScope, {
    categoryCounts: { dryer: 4, washing_machine: 8 },
    total: 12,
    status: 'EVIDENCE_NOT_ESTABLISHED',
    limitation: 'CURRENT_RETAIL_POPULATION_ONLY_NOT_PUBLICATION_ELIGIBILITY',
  });
  assert.deepEqual(artifact.scopeDecision.unrelatedCategories, {
    dishwasher: 'NOT_ASSESSED_BY_TASK_8',
    refrigerator: 'NOT_ASSESSED_BY_TASK_8',
  });
});

test('catalog-derived hints never become exact evidence or receipt support', async () => {
  const artifact = await buildFitV4LaundryCohort({ root: ROOT });
  for (const product of artifact.products) {
    assert.equal(product.hints.formFactor.authority, 'CATALOG_HINT_UNVERIFIED');
    if (product.category === 'dryer') {
      assert.equal(product.hints.dryerTechnology.authority, 'CATALOG_HINT_UNVERIFIED');
    }
    assert.deepEqual(product.exactEvidence.receiptRefs, []);
    assert.equal(product.exactEvidence.status, 'UNSUPPORTED');
    assert.equal(product.exactEvidence.reasonCode, 'NO_RECEIPT_BOUND_EXACT_LAUNDRY_EVIDENCE');
  }
  assert.equal(artifact.summary.receiptBoundExactLaundryProducts, 0);
  assert.equal(artifact.receipts.length, 0);
});

test('coverage matrix aggregates every supported policy branch configuration exactly once and fails closed', async () => {
  const artifact = await buildFitV4LaundryCohort({ root: ROOT });
  const keyFor = (category, row) => JSON.stringify([
    category, row.formFactor, row.installationMode, row.selectorBranchId, canonical(row.selectorValues),
  ]);
  const expected = new Map();
  for (const category of ['washing_machine', 'dryer']) {
    const pack = FIT_POLICY_PACKS_V4[category];
    for (const row of pack.coverageManifest.cases) {
      if (row.disposition !== 'EVALUATED' || !pack.supportedInstallationModes.includes(row.installationMode)) continue;
      const key = keyFor(category, row);
      const branch = expected.get(key) ?? { fieldIds: new Set(), ruleIds: new Set() };
      branch.fieldIds.add(row.fieldId);
      branch.ruleIds.add(row.ruleId);
      expected.set(key, branch);
    }
  }
  const actual = new Map(artifact.coverageMatrix.map((row) => [keyFor(row.category, row), row]));
  assert.equal(expected.size, 2796);
  assert.equal(artifact.coverageMatrix.length, expected.size);
  assert.equal(actual.size, expected.size);
  for (const [key, branch] of expected) {
    const row = actual.get(key);
    assert.ok(row, key);
    assert.deepEqual(row.requiredFieldIds, [...branch.fieldIds].sort());
    assert.deepEqual(row.requiredRuleIds, [...branch.ruleIds].sort());
    assert.equal(row.evaluatedPolicyCaseCount > 0, true);
  }
  assert.ok(artifact.coverageMatrix.every((row) => row.calibrationStatus === 'UNSUPPORTED'));
  assert.ok(artifact.coverageMatrix.every((row) => row.receiptBoundExactModelCaseCount === 0));
  assert.ok(artifact.coverageMatrix.every((row) => row.explicitAdversarialCaseCount === 0));
  assert.deepEqual(artifact.summary.policyBranchCoverage, {
    byConfiguration: artifact.summary.policyBranchCoverage.byConfiguration,
    supported: 0,
    total: expected.size,
    unsupported: expected.size,
  });
  const configurationRows = artifact.summary.policyBranchCoverage.byConfiguration;
  assert.equal(configurationRows.length, 54);
  assert.equal(new Set(configurationRows.map((row) => [
    row.category, row.formFactor, row.installationMode,
  ].join('|'))).size, 54);
  assert.equal(configurationRows.reduce((sum, row) => sum + row.branchConfigurations, 0), expected.size);
  assert.ok(configurationRows.every((row) => row.supported === 0
    && row.unsupported === row.branchConfigurations));
  for (const row of configurationRows) {
    assert.match(artifact.coverageReport.content, new RegExp(
      `\\| ${row.category} \\| ${row.formFactor} \\| ${row.installationMode} \\| ${row.branchConfigurations} \\|`,
    ));
  }
  assert.ok(Buffer.byteLength(JSON.stringify(artifact)) < 5_000_000);
});

test('all persisted dishwasher front-loader defects are quarantined without mutation', async () => {
  const products = await catalogProducts();
  const source = products.filter((row) => row.cat === 'dishwasher'
    && row.geometry_v2?.formFactor === 'front_loader');
  const before = structuredClone(source);
  const artifact = await buildFitV4LaundryCohort({ root: ROOT });
  assert.equal(artifact.identityQuarantine.length, source.length);
  assert.ok(source.length > 1);
  assert.deepEqual(source, before);
  for (const row of artifact.identityQuarantine) {
    assert.equal(row.sourceFormFactor, 'front_loader');
    assert.equal(row.status, 'QUARANTINED_PENDING_EXISTING_IDENTITY_WORKFLOW');
    assert.equal(row.mutationApplied, false);
    assert.ok(row.inferredTargetHint === null || typeof row.inferredTargetHint === 'string');
    assert.match(artifact.coverageReport.content, new RegExp(row.canonicalProductId));
  }
});

test('every WashTower row is excluded from four-category claims', async () => {
  const products = await catalogProducts();
  const expectedIds = products.filter((row) => row.cat === 'washtower_combo')
    .map((row) => row.canonicalProductId).sort();
  const artifact = await buildFitV4LaundryCohort({ root: ROOT });
  assert.deepEqual(artifact.excludedProducts.map((row) => row.canonicalProductId).sort(), expectedIds);
  assert.ok(artifact.excludedProducts.every((row) => row.reasonCode === 'WASHTOWER_COMBO_REQUIRES_DEDICATED_POLICY'));
  assert.ok(artifact.excludedProducts.every((row) => row.excludedFromFourCategoryClaims === true));
  assert.ok(artifact.products.every((row) => row.category !== 'washtower_combo'));
  for (const row of artifact.excludedProducts) {
    assert.match(artifact.coverageReport.content, new RegExp(row.canonicalProductId));
  }
});

test('artifact binds active release, field map, policy packs and tracked receipt bytes', async () => {
  const artifact = await buildFitV4LaundryCohort({ root: ROOT });
  for (const value of [
    artifact.bindings.activeRelease.catalogSha256,
    artifact.bindings.activeRelease.historicalReferenceSha256,
    artifact.bindings.activeRelease.authorizationManifestSha256,
    artifact.bindings.fieldMap.bytesSha256,
    artifact.bindings.fieldMap.semanticSha256,
    artifact.bindings.policyPacks.dryer.semanticSha256,
    artifact.bindings.policyPacks.washing_machine.semanticSha256,
    artifact.bindings.installationReceiptBundle.bytesSha256,
    artifact.bindings.installationReceiptBundle.semanticSha256,
  ]) assert.match(value, /^[a-f0-9]{64}$/);
  assert.equal(artifact.bindings.installationReceiptBundle.receiptCount, 21);
  assert.equal((await auditFitV4LaundryCohort(artifact, { root: ROOT })).passed, true);
});

test('audit rejects semantic, policy, receipt and active-release binding drift', async () => {
  const artifact = await buildFitV4LaundryCohort({ root: ROOT });
  const semantic = structuredClone(artifact);
  semantic.products[0].brand = 'Changed';
  let audit = await auditFitV4LaundryCohort(semantic, { root: ROOT });
  assert.ok(audit.violations.some((row) => row.code === 'SEMANTIC_HASH_DRIFT'));

  const policy = structuredClone(artifact);
  policy.bindings.policyPacks.dryer.semanticSha256 = '0'.repeat(64);
  audit = await auditFitV4LaundryCohort(rehash(policy), { root: ROOT });
  assert.ok(audit.violations.some((row) => row.code === 'POLICY_BINDING_DRIFT'));

  const receipts = structuredClone(artifact);
  receipts.bindings.installationReceiptBundle.bytesSha256 = '0'.repeat(64);
  audit = await auditFitV4LaundryCohort(rehash(receipts), { root: ROOT });
  assert.ok(audit.violations.some((row) => row.code === 'RECEIPT_BINDING_DRIFT'));

  const active = structuredClone(artifact);
  active.bindings.activeRelease.catalogSha256 = '0'.repeat(64);
  audit = await auditFitV4LaundryCohort(rehash(active), { root: ROOT });
  assert.ok(audit.violations.some((row) => row.code === 'ACTIVE_RELEASE_DRIFT'));

  const contract = structuredClone(artifact);
  contract.schemaVersion = 99;
  contract.artifactType = 'FIT_V4_PUBLIC_LAUNDRY_COHORT';
  audit = await auditFitV4LaundryCohort(rehash(contract), { root: ROOT });
  assert.ok(audit.violations.some((row) => row.code === 'INVALID_COHORT'));
});

test('audit rejects rehashed source selection, hint and policy-matrix substitution', async () => {
  const artifact = await buildFitV4LaundryCohort({ root: ROOT });

  const selection = structuredClone(artifact);
  selection.products[0].canonicalProductId = 'fa_prod_000000000000000000000000';
  let audit = await auditFitV4LaundryCohort(rehash(selection), { root: ROOT });
  assert.ok(audit.violations.some((row) => row.code === 'SOURCE_COHORT_DRIFT'));

  const hint = structuredClone(artifact);
  hint.products[0].hints.formFactor = { value: 'integrated', authority: 'EXACT_MODEL' };
  audit = await auditFitV4LaundryCohort(rehash(hint), { root: ROOT });
  assert.ok(audit.violations.some((row) => row.code === 'SOURCE_COHORT_DRIFT'));

  const matrix = structuredClone(artifact);
  matrix.coverageMatrix.pop();
  matrix.summary.policyBranchCoverage.total -= 1;
  matrix.summary.policyBranchCoverage.unsupported -= 1;
  audit = await auditFitV4LaundryCohort(rehash(matrix), { root: ROOT });
  assert.ok(audit.violations.some((row) => row.code === 'POLICY_MATRIX_DRIFT'));
});

test('writer is explicit, non-public, atomic and immutable with a bound report', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'fit-v4-laundry-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const artifact = await buildFitV4LaundryCohort({ root: ROOT });
  await assert.rejects(() => writeFitV4LaundryCohort({ artifact }), /output directory required/i);
  await assert.rejects(
    () => writeFitV4LaundryCohort({ artifact, outputDirectory: join(ROOT, 'public', 'laundry') }),
    /public/i,
  );
  const outputDirectory = join(directory, 'isolated');
  const paths = await writeFitV4LaundryCohort({ artifact, outputDirectory });
  assert.deepEqual(JSON.parse(await readFile(paths.cohortPath, 'utf8')), artifact);
  assert.equal(await readFile(paths.reportPath, 'utf8'), artifact.coverageReport.content);
  await assert.rejects(
    () => writeFitV4LaundryCohort({ artifact, outputDirectory }),
    /immutable.*exists/i,
  );
});

test('Task 8 source has no public import, publication writer or evidence acquisition', async () => {
  const source = await readFile(
    new URL('../../scripts/architecture-v2/build-fit-v4-laundry-cohort.mjs', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /from\s+['"][^'"]*public\//);
  assert.doesNotMatch(source, /publish-active-retail-release|build-public-projection|writeFile\([^)]*public/);
  assert.doesNotMatch(source, /fetch\(|https?:\/\/|MinerU|firecrawl/i);
});
