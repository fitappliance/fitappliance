import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildFitV4ShadowCohort,
  classifyFitV4Disagreement,
  writeFitV4ShadowCohort,
} from '../../scripts/architecture-v2/build-fit-v4-shadow-cohort.mjs';
import { auditFitV4ShadowCohort } from '../../scripts/architecture-v2/audit-fit-v4-shadow-cohort.mjs';

const ROOT = new URL('../..', import.meta.url).pathname;
const PILOT_PATH = new URL('../../data/architecture-v2/generated/installation-knowledge-pilot.json', import.meta.url);
const V3_BUNDLE_PATH = new URL('../../data/architecture-v2/reviews/automated/installation-evidence-receipts.json', import.meta.url);
const FIELD_MAP_PATH = new URL('../../data/architecture-v2/policies/fit-v4-field-map.json', import.meta.url);
const DESCRIPTOR_PATH = new URL('../../data/architecture-v2/decisions/active-retail-release.json', import.meta.url);

const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const semanticHash = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

async function inputs() {
  return {
    root: ROOT,
    pilot: JSON.parse(await readFile(PILOT_PATH, 'utf8')),
    pilotBytes: await readFile(PILOT_PATH),
    v3Bundle: JSON.parse(await readFile(V3_BUNDLE_PATH, 'utf8')),
    v3BundleBytes: await readFile(V3_BUNDLE_PATH),
  };
}

function rehash(artifact) {
  const copy = structuredClone(artifact);
  delete copy.semanticSha256;
  delete copy.cohortId;
  const semanticSha256 = semanticHash(copy);
  return { ...copy, cohortId: `fit_v4_cohort_${semanticSha256.slice(0, 24)}`, semanticSha256 };
}

test('build is deterministic for repeated and reversed pilot input', async () => {
  const source = await inputs();
  const first = await buildFitV4ShadowCohort(source);
  const repeated = await buildFitV4ShadowCohort(source);
  const reversed = await buildFitV4ShadowCohort({
    ...source,
    pilot: { ...source.pilot, products: [...source.pilot.products].reverse() },
  });
  assert.deepEqual(repeated, first);
  assert.deepEqual(reversed, first);
  assert.equal(Object.isFrozen(first), true);
});

test('cohort freezes exactly 100 unique products split 50/50 and binds active release authority', async () => {
  const artifact = await buildFitV4ShadowCohort(await inputs());
  assert.equal(artifact.products.length, 100);
  assert.equal(new Set(artifact.products.map((row) => row.canonicalProductId)).size, 100);
  assert.deepEqual(artifact.summary.byCategory, { dishwasher: 50, refrigerator: 50 });
  assert.match(artifact.bindings.activeRelease.catalogSha256, /^[a-f0-9]{64}$/);
  assert.match(artifact.bindings.activeRelease.historicalReferenceSha256, /^[a-f0-9]{64}$/);
  assert.match(artifact.bindings.activeRelease.authorizationManifestSha256, /^[a-f0-9]{64}$/);
  assert.equal(artifact.isolation.publicMutation, false);
  assert.equal(JSON.stringify(artifact).includes('publicationEligibility'), false);
});

test('active-release descriptor or artifact drift fails closed through the active loader', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'fit-v4-active-drift-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const descriptor = JSON.parse(await readFile(DESCRIPTOR_PATH, 'utf8'));
  descriptor.artifacts.publicProjection.sha256 = '0'.repeat(64);
  const path = join(directory, 'active-retail-release.json');
  await writeFile(path, JSON.stringify(descriptor));
  const source = await inputs();
  await assert.rejects(
    () => buildFitV4ShadowCohort({ ...source, descriptorPath: path }),
    /active public projection hash drift/i,
  );
});

test('V3 adapters are lossless references, preserve exact source bytes and never become V4 receipts', async () => {
  const source = await inputs();
  const artifact = await buildFitV4ShadowCohort(source);
  assert.ok(artifact.adapters.length > 0);
  assert.ok(artifact.gaps.some((gap) => gap.reasonCode === 'LOSSY_V3_FIELD_MAPPING'));
  for (const row of artifact.adapters) {
    const original = source.v3Bundle.receipts.find((receipt) => receipt.receiptId === row.adapter.originalV3ReceiptId);
    assert.deepEqual(
      Buffer.from(row.adapter.originalV3ReceiptBytesBase64, 'base64'),
      Buffer.from(`${JSON.stringify(original, null, 2)}\n`),
    );
    assert.equal(source.v3Bundle.receipts[row.sourceReceiptIndex].receiptId, original.receiptId);
    assert.equal(row.extraction.encoding, 'JSON_PRETTY_2_LF');
    assert.match(row.extraction.bytesSha256, /^[a-f0-9]{64}$/);
    assert.equal(row.adapter.adapterType, 'V3_REFERENCE_ONLY');
  }
  assert.equal(artifact.v4ReceiptBundle.receipts.length, 0);
});

test('V3 receipts whose full identity differs from the pilot remain typed gaps', async () => {
  const source = await inputs();
  const target = source.v3Bundle.receipts[0];
  const pilot = structuredClone(source.pilot);
  pilot.products.find((row) => row.canonicalProductId === target.canonicalProductId).brand = 'Different Brand';
  const artifact = await buildFitV4ShadowCohort({
    ...source,
    pilot,
    pilotBytes: Buffer.from(`${JSON.stringify(pilot, null, 2)}\n`),
  });
  assert.equal(
    artifact.adapters.some((row) => row.adapter.originalV3ReceiptId === target.receiptId),
    false,
  );
  assert.ok(artifact.gaps.some((row) => row.receiptId === target.receiptId
    && row.reasonCode === 'V3_RECEIPT_IDENTITY_MISMATCH'));
});

test('missing V4 identity, rights, source and knowledge remain typed unknowns', async () => {
  const artifact = await buildFitV4ShadowCohort(await inputs());
  for (const product of artifact.products) {
    assert.equal(product.v4.status, 'NOT_EVALUATED');
    assert.ok(product.v4.unknowns.length > 0);
    for (const unknown of product.v4.unknowns) {
      assert.match(unknown.type, /^(EVIDENCE|IDENTITY|RIGHTS|KNOWLEDGE)_GAP$/);
      assert.match(unknown.reasonCode, /^[A-Z][A-Z0-9_]+$/);
    }
  }
  assert.equal(artifact.summary.disagreementClasses.NO_DISAGREEMENT, 0);
  assert.equal(
    artifact.summary.disagreementClasses.MISSING_V4_EVIDENCE
      + artifact.summary.disagreementClasses.IDENTITY_DEFECT,
    100,
  );
});

test('V2 and V3 engines execute against fixed synthetic unknown-site inputs while V4 fails closed before evaluation', async () => {
  const artifact = await buildFitV4ShadowCohort(await inputs());
  for (const product of artifact.products) {
    assert.equal(product.v2.executed, true);
    assert.equal(product.v3.executed, true);
    assert.ok(product.v2.checkCount > 0);
    assert.ok(product.v3.checkCount > 0);
    assert.equal(product.v4.executed, false);
    assert.equal(product.v4.reasonCode, 'MISSING_VALIDATED_V4_KNOWLEDGE');
  }
});

test('disagreement classification uses only the frozen six-value taxonomy', () => {
  const cases = [
    [{ v2: 'NO_FIT', v3: 'NO_FIT', v4: 'NO_FIT' }, 'NO_DISAGREEMENT'],
    [{ v2: 'VERIFIED_FIT', v3: 'VERIFIED_FIT', v4: 'NO_FIT', correctionProven: true }, 'INTENDED_CORRECTION'],
    [{ v2: 'VERIFIED_FIT', v3: 'VERIFIED_FIT', v4: 'INSUFFICIENT_DATA', missingV4Evidence: true }, 'MISSING_V4_EVIDENCE'],
    [{ v2: 'NO_FIT', v3: 'NO_FIT', v4: 'VERIFIED_FIT', policyDefect: true }, 'POLICY_DEFECT'],
    [{ v2: 'NO_FIT', v3: 'NO_FIT', v4: 'NOT_EVALUATED', identityDefect: true }, 'IDENTITY_DEFECT'],
    [{ v2: 'NO_FIT', v3: 'NO_FIT', v4: 'VERIFIED_FIT' }, 'REGRESSION'],
    [{ v2: 'INSUFFICIENT_DATA', v3: 'CONDITIONAL_FIT', v4: 'NOT_EVALUATED', missingV4Evidence: true }, 'MISSING_V4_EVIDENCE'],
    [{ v2: 'INSUFFICIENT_DATA', v3: 'CONDITIONAL_FIT', v4: 'NOT_EVALUATED', missingV4Evidence: true, identityDefect: true }, 'IDENTITY_DEFECT'],
  ];
  assert.deepEqual(cases.map(([input, expected]) => classifyFitV4Disagreement(input)), cases.map(([, expected]) => expected));
});

test('audit detects semantic tamper, category drift and cross-model adapter binding', async () => {
  const artifact = await buildFitV4ShadowCohort(await inputs());
  const tampered = structuredClone(artifact);
  tampered.products[0].brand = 'Changed';
  let audit = await auditFitV4ShadowCohort(tampered, { root: ROOT });
  assert.equal(audit.passed, false);
  assert.ok(audit.violations.some((row) => row.code === 'SEMANTIC_HASH_DRIFT'));

  audit = await auditFitV4ShadowCohort(rehash(tampered), { root: ROOT });
  assert.ok(audit.violations.some((row) => row.code === 'PILOT_BINDING_VIOLATION'));

  const scenarioTamper = structuredClone(artifact);
  scenarioTamper.scenarios.scenarios[0].measurementState = 'KNOWN';
  audit = await auditFitV4ShadowCohort(rehash(scenarioTamper), { root: ROOT });
  assert.ok(audit.violations.some((row) => row.code === 'HASH_BINDING_VIOLATION'));

  const categoryDrift = structuredClone(artifact);
  categoryDrift.products[0].category = 'refrigerator';
  audit = await auditFitV4ShadowCohort(rehash(categoryDrift), { root: ROOT });
  assert.ok(audit.violations.some((row) => row.code === 'CATEGORY_BINDING_VIOLATION'));

  const crossModel = structuredClone(artifact);
  const adaptedProduct = crossModel.products.find((row) => row.v3AdapterRefs.length > 0);
  const foreignProduct = crossModel.products.find((row) => row.canonicalProductId !== adaptedProduct.canonicalProductId);
  assert.ok(foreignProduct);
  foreignProduct.v3AdapterRefs = [adaptedProduct.v3AdapterRefs[0]];
  audit = await auditFitV4ShadowCohort(rehash(crossModel), { root: ROOT });
  assert.ok(audit.violations.some((row) => row.code === 'CROSS_MODEL_RECEIPT'));

  const hiddenDisagreement = structuredClone(artifact);
  hiddenDisagreement.products[0].disagreementClass = 'NO_DISAGREEMENT';
  audit = await auditFitV4ShadowCohort(rehash(hiddenDisagreement), { root: ROOT });
  assert.ok(audit.violations.some((row) => row.code === 'DISAGREEMENT_CLASS_MISMATCH'));

  const unexecutedResult = structuredClone(artifact);
  unexecutedResult.products[0].v4.status = 'INSUFFICIENT_DATA';
  audit = await auditFitV4ShadowCohort(rehash(unexecutedResult), { root: ROOT });
  assert.ok(audit.violations.some((row) => row.code === 'V4_EXECUTION_STATE_MISMATCH'));

  const unboundAdapter = structuredClone(artifact);
  unboundAdapter.adapters[0].sourceReceiptIndex = (unboundAdapter.adapters[0].sourceReceiptIndex + 1)
    % (await inputs()).v3Bundle.receipts.length;
  audit = await auditFitV4ShadowCohort(rehash(unboundAdapter), { root: ROOT });
  assert.ok(audit.violations.some((row) => row.code === 'UNBOUND_V3_ADAPTER'));
});

test('audit rejects lossy adapter promotion, rights-invalid V4 promotion and publication fields', async () => {
  const artifact = await buildFitV4ShadowCohort(await inputs());
  const lossy = structuredClone(artifact);
  lossy.adapters[0].adapter.v4FieldId = 'unmapped.field';
  let audit = await auditFitV4ShadowCohort(rehash(lossy), { root: ROOT });
  assert.ok(audit.violations.some((row) => row.code === 'LOSSY_MAPPING'));

  const promoted = structuredClone(artifact);
  promoted.products[0].v4 = { status: 'VERIFIED_FIT', receiptRefs: [], unknowns: [] };
  audit = await auditFitV4ShadowCohort(rehash(promoted), { root: ROOT });
  assert.ok(audit.violations.some((row) => row.code === 'RIGHTS_INVALID_PROMOTION'));

  const publication = structuredClone(artifact);
  publication.publicationEligibility = true;
  audit = await auditFitV4ShadowCohort(rehash(publication), { root: ROOT });
  assert.ok(audit.violations.some((row) => row.code === 'PUBLICATION_VIOLATION'));
});

test('audit passes the real immutable cohort and detects active-release binding drift', async () => {
  const artifact = await buildFitV4ShadowCohort(await inputs());
  let audit = await auditFitV4ShadowCohort(artifact, { root: ROOT });
  assert.equal(audit.passed, true, JSON.stringify(audit.violations));
  const drift = structuredClone(artifact);
  drift.bindings.activeRelease.catalogSha256 = '0'.repeat(64);
  audit = await auditFitV4ShadowCohort(rehash(drift), { root: ROOT });
  assert.ok(audit.violations.some((row) => row.code === 'ACTIVE_RELEASE_DRIFT'));

  const lifecycleDrift = structuredClone(artifact);
  lifecycleDrift.products[0].activeLifecycleState = 'AVAILABLE';
  audit = await auditFitV4ShadowCohort(rehash(lifecycleDrift), { root: ROOT });
  assert.ok(audit.violations.some((row) => row.code === 'ACTIVE_RELEASE_DRIFT'));
});

test('CLI writer requires a non-public explicit directory and retains immutable prior runs', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'fit-v4-cohort-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const artifact = await buildFitV4ShadowCohort(await inputs());
  await assert.rejects(() => writeFitV4ShadowCohort({ artifact }), /output directory required/i);
  await assert.rejects(() => writeFitV4ShadowCohort({ artifact, outputDirectory: join(ROOT, 'public', 'cohort') }), /public/i);
  const isolatedRoot = join(directory, 'new-isolated-root');
  const firstPath = await writeFitV4ShadowCohort({ artifact, outputDirectory: isolatedRoot });
  assert.deepEqual(JSON.parse(await readFile(firstPath, 'utf8')), artifact);
  await assert.rejects(() => writeFitV4ShadowCohort({ artifact, outputDirectory: isolatedRoot }), /immutable.*exists/i);
});

test('Task 7 sources do not import public code or publication writers', async () => {
  const sources = await Promise.all([
    readFile(new URL('../../scripts/architecture-v2/build-fit-v4-shadow-cohort.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../scripts/architecture-v2/audit-fit-v4-shadow-cohort.mjs', import.meta.url), 'utf8'),
  ]);
  const joined = sources.join('\n');
  assert.doesNotMatch(joined, /from\s+['"][^'"]*public\//);
  assert.doesNotMatch(joined, /publish-active-retail-release|build-public-projection|writeFile\([^)]*public/);
});

test('field map remains the tracked Task 6 contract', async () => {
  const artifact = await buildFitV4ShadowCohort(await inputs());
  const fieldMap = JSON.parse(await readFile(FIELD_MAP_PATH, 'utf8'));
  assert.equal(artifact.bindings.fieldMap.semanticSha256, semanticHash(fieldMap));
  assert.equal(artifact.bindings.fieldMap.version, fieldMap.version);
});
