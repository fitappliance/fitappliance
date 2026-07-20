import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adjudicateResolutionCase,
  applyResolutionToProduct,
  buildResolutionManifest,
  buildResolutionPlan,
  buildResolutionFieldEvidence,
  validateResolutionObjectPath,
  verifyResolutionSourceText,
} from '../../src/domain/evidence-resolution-loop.mjs';
import { createVerificationReceipt } from '../../src/domain/evidence-source-verifier.mjs';

const HASH = 'a'.repeat(64);

function exactManufacturerSource(overrides = {}, verifiedAt = '2026-07-11T14:35:00.000Z') {
  const result = {
    authority: 'manufacturer',
    sourceUrl: 'https://www.westinghouse.com.au/fridges-and-freezers/fridges/whe6874ba/',
    finalUrl: 'https://www.westinghouse.com.au/fridges-and-freezers/fridges/whe6874ba/',
    redirectChain: [],
    retrievedAt: '2026-07-11T14:30:00.000Z',
    contentSha256: HASH,
    objectPath: `evidence/web/sha256/${HASH.slice(0, 2)}/${HASH.slice(2, 4)}/${HASH}.html`,
    contentType: 'text/html',
    byteSize: 1234,
    identity: { brand: 'Westinghouse', model: 'WHE6874BA', outcome: 'exact' },
    identitySignals: [
      { type: 'canonical_url', value: 'https://www.westinghouse.com.au/fridges-and-freezers/fridges/whe6874ba/' },
      { type: 'product_model', value: 'WHE6874BA' },
    ],
    claims: [
      { field: 'closedEnvelope.widthMm', value: 913, unit: 'mm', label: 'Total width (mm)', quote: 'Total width (mm) 913 mm' },
      { field: 'closedEnvelope.heightMm', value: 1782, unit: 'mm', label: 'Total height (mm)', quote: 'Total height (mm) 1782 mm' },
      { field: 'closedEnvelope.depthMm', value: 803, unit: 'mm', label: 'Total depth (mm)', quote: 'Total depth (mm) 803 mm' },
      { field: 'operation.doorOpenDepthMm', value: 1189, unit: 'mm', label: 'Depth door open 90degree (mm)', quote: 'Depth door open 90degree (mm) 1189' },
      { field: 'installation.topMm', value: 25, unit: 'mm', label: 'Air space above cabinet (mm)', quote: 'Air space above cabinet (mm) 25' },
      { field: 'flags.requiresPlumbing', value: true, unit: 'boolean', label: 'Plumbed water supply required', quote: 'Plumbed water supply required Yes' },
    ],
    ...overrides,
  };
  result.verificationReceipt = createVerificationReceipt(result, {
    brand: 'Westinghouse', model: 'WHE6874BA', category: 'fridge',
  }, { verifiedAt });
  return result;
}

function resolutionCase(overrides = {}) {
  return {
    id: 'resolution_westinghouse_whe6874ba_v1',
    legacyRuntimeId: 'ao-88474',
    brand: 'Westinghouse',
    model: 'WHE6874BA',
    category: 'fridge',
    releasableQuarantineReasons: [
      'phase1_approved_dimensions_alias',
      'approved_alias_dimensions_only_projection_still_exposes_unreviewed_clearance_operation_and_plumbing_fields',
    ],
    initialFailure: {
      code: 'approved_scope_conflicts_with_legacy_projection',
      conflictingFields: ['flags.requiresPlumbing'],
      detail: 'Dimensions were approved but the legacy projection still exposes unrelated fields.',
    },
    attempt: 2,
    maxAttempts: 3,
    sources: [exactManufacturerSource()],
    ...overrides,
  };
}

test('resolution planning turns projection conflict into targeted autonomous research tasks', () => {
  const plan = buildResolutionPlan(resolutionCase({ sources: [] }));

  assert.equal(plan.status, 'research_required');
  assert.deepEqual(plan.hypotheses, [
    'legacy_field_is_stale',
    'approved_scope_is_narrower_than_public_projection',
    'exact_model_source_can_resolve_conflict',
  ]);
  assert.ok(plan.researchTasks.some((task) => task.field === 'flags.requiresPlumbing'));
  assert.ok(plan.researchTasks.some((task) => task.field === 'installation.leftMm'));
  assert.ok(plan.researchTasks.some((task) => task.field === 'installation.rearMm'));
  assert.ok(plan.researchTasks.every((task) => task.query.includes('WHE6874BA')));
  assert.equal(plan.requiresHumanReview, false);

  const dryerPlan = buildResolutionPlan(resolutionCase({
    category: 'dryer', formFactor: 'front_loader', sources: [],
  }));
  assert.ok(dryerPlan.researchTasks.some((task) => task.field === 'operation.doorOpenDepthMm'));
  assert.ok(dryerPlan.researchTasks.some((task) => task.field === 'service.rearVentilationMm'));
});

test('resolution evidence accepts only content-addressed relative object paths', () => {
  assert.equal(
    validateResolutionObjectPath(`evidence/web/sha256/aa/aa/${HASH}.html`, HASH),
    `evidence/web/sha256/aa/aa/${HASH}.html`,
  );
  assert.throws(() => validateResolutionObjectPath(`/tmp/${HASH}.html`, HASH), /relative/i);
  assert.throws(() => validateResolutionObjectPath(`evidence/../${HASH}.html`, HASH), /relative/i);
  assert.throws(() => validateResolutionObjectPath('evidence/web/wrong.html', HASH), /hash/i);
});

test('resolution object text must contain the exact model and every claimed quote', () => {
  const source = exactManufacturerSource();
  const text = source.claims.map((claim) => claim.quote).join(' ');
  assert.equal(verifyResolutionSourceText(source, `Westinghouse WHE6874BA ${text}`), true);
  assert.throws(() => verifyResolutionSourceText(source, text), /exact model/i);
  assert.throws(() => verifyResolutionSourceText(source, 'Westinghouse WHE6874BA Total width (mm) 913 mm'), /quote/i);
});

test('exact manufacturer evidence resolves the conflict and strips every unapproved legacy fit field', () => {
  const resolution = adjudicateResolutionCase(resolutionCase());
  assert.equal(resolution.status, 'resolved');
  assert.equal(resolution.publication.release, true);
  assert.equal(resolution.requiresHumanReview, false);
  assert.deepEqual(resolution.approvedFields, [
    'closedEnvelope.depthMm',
    'closedEnvelope.heightMm',
    'closedEnvelope.widthMm',
    'flags.requiresPlumbing',
    'installation.topMm',
    'operation.doorOpenDepthMm',
  ]);

  const product = applyResolutionToProduct({
    id: 'ao-88474', cat: 'fridge', brand: 'Westinghouse', model: 'WHE6874BA',
    w: 913, h: 1782, d: 803, door_swing_mm: 386,
    dimensions: { width_mm: 913, height_mm: 1782, depth_mm: 803, door_open_90_depth_mm: 1189 },
    clearance_requirements: { left_mm: 0, right_mm: 0, top_mm: 25, rear_mm: 0 },
    flags: { requires_plumbing: false, ventilation_required: true, reversible_door: null },
    evidence: { trust_level: 'retailer_spec', verified_fields: ['dimensions'] },
  }, resolution);

  assert.deepEqual(product.geometry_v2.closedEnvelope, {
    widthMm: 913,
    heightMm: { minimumMm: 1782, maximumMm: 1782 },
    depthMm: 803,
  });
  assert.deepEqual(product.geometry_v2.installation, {
    leftMm: null, rightMm: null, topMm: 25, rearMm: null, frontMm: null,
  });
  assert.equal(product.geometry_v2.operation.doorOpenDepthMm, 1189);
  assert.deepEqual(product.clearance_requirements, { top_mm: 25 });
  assert.deepEqual(product.flags, { requires_plumbing: true });
  assert.equal(product.door_swing_mm, undefined);
  assert.equal(product.evidence.source_url, 'https://www.westinghouse.com.au/fridges-and-freezers/fridges/whe6874ba/');
  assert.equal(product.evidence.source_type, 'official_manufacturer_html');
  assert.equal(product.evidence.has_official_evidence, true);
  assert.equal(product.evidence.v2_resolution.status, 'resolved');
  assert.equal(product.geometry_v2_provenance.evidenceLevel, 'dimensions');
  assert.equal(
    product.geometry_v2_provenance.fieldEvidence['closedEnvelope.widthMm'].receiptBindingSha256,
    exactManufacturerSource().verificationReceipt.bindingSha256,
  );
  assert.deepEqual(product.geometry_v2_provenance.activeSourceHashes, [HASH]);
  assert.equal(product.evidence.trust_level, 'dimensions_verified');
});

test('resolution promotes receipt-bound geometry only when every required placement field is present', () => {
  const source = exactManufacturerSource({
    claims: [
      ...exactManufacturerSource().claims,
      { field: 'installation.leftMm', value: 5, unit: 'mm', label: 'Left clearance', quote: 'Left clearance 5 mm' },
      { field: 'installation.rightMm', value: 5, unit: 'mm', label: 'Right clearance', quote: 'Right clearance 5 mm' },
      { field: 'installation.rearMm', value: 30, unit: 'mm', label: 'Rear clearance', quote: 'Rear clearance 30 mm' },
    ],
  });
  const resolution = adjudicateResolutionCase(resolutionCase({ sources: [source] }));
  const product = applyResolutionToProduct({
    id: 'ao-88474', cat: 'fridge', brand: 'Westinghouse', model: 'WHE6874BA', evidence: {},
  }, resolution);
  assert.equal(product.geometry_v2_provenance.evidenceLevel, 'verified');
  assert.equal(product.evidence.trust_level, 'verified_fit');
  assert.equal(product.evidence.clearance_verified, true);
});

test('autonomous resolution preserves adjustable height ranges and uses the maximum for legacy fit fields', () => {
  const ranged = exactManufacturerSource({
    claims: exactManufacturerSource().claims.map((claim) => claim.field === 'closedEnvelope.heightMm'
      ? {
        ...claim,
        value: { minimumMm: 1750, maximumMm: 1782 },
        label: 'Total height', quote: 'Total height 1750 - 1782 mm',
        semanticBasis: 'explicit_label_range', sourceUnit: 'mm',
        sourceValues: [1750, 1782], sourceValuesMm: [1750, 1782],
      }
      : claim),
  });
  const resolution = adjudicateResolutionCase(resolutionCase({ sources: [ranged] }));
  assert.equal(resolution.status, 'resolved');
  assert.deepEqual(resolution.values['closedEnvelope.heightMm'], { minimumMm: 1750, maximumMm: 1782 });

  const product = applyResolutionToProduct({
    id: 'ao-88474', cat: 'fridge', brand: 'Westinghouse', model: 'WHE6874BA',
    w: 913, h: 1782, d: 803, evidence: {},
  }, resolution);
  assert.equal(product.h, 1782);
  assert.equal(product.dimensions.height_mm, 1782);
  assert.deepEqual(product.dimensions.height_range_mm, { minimumMm: 1750, maximumMm: 1782 });
  assert.deepEqual(product.geometry_v2.closedEnvelope.heightMm, { minimumMm: 1750, maximumMm: 1782 });
});

test('conflicting current manufacturer claims trigger bounded reconciliation before terminal quarantine', () => {
  const second = exactManufacturerSource({
    sourceUrl: 'https://www.westinghouse.com.au/support/whe6874ba-conflict',
    contentSha256: 'b'.repeat(64),
    objectPath: `evidence/web/sha256/bb/bb/${'b'.repeat(64)}.html`,
    claims: [{
      field: 'flags.requiresPlumbing', value: false, unit: 'boolean',
      label: 'Water connection', quote: 'Water connection not required',
    }],
  });
  const resolution = adjudicateResolutionCase(resolutionCase({ sources: [exactManufacturerSource(), second] }));

  assert.equal(resolution.status, 'reconciliation_required');
  assert.equal(resolution.publication.release, false);
  assert.deepEqual(resolution.contradictions.map((row) => row.field), ['flags.requiresPlumbing']);
  assert.equal(resolution.requiresHumanReview, false);

  const exhausted = adjudicateResolutionCase(resolutionCase({
    attempt: 3,
    sources: [exactManufacturerSource(), second],
  }));
  assert.equal(exhausted.status, 'quarantined');
  assert.equal(exhausted.terminalReason, 'authoritative_evidence_conflict');
});

test('resolution must answer every initial conflicting field instead of resolving by omission', () => {
  const dimensionsOnly = exactManufacturerSource({
    claims: exactManufacturerSource().claims.filter((claim) => claim.field.startsWith('closedEnvelope.')),
  });
  const resolution = adjudicateResolutionCase(resolutionCase({ sources: [dimensionsOnly] }));

  assert.equal(resolution.status, 'research_required');
  assert.deepEqual(resolution.missingReleaseFields, ['flags.requiresPlumbing']);
  assert.equal(resolution.publication.release, false);
});

test('newer attested snapshot can supersede an older snapshot of the same official resource', () => {
  const oldSource = exactManufacturerSource();
  const newer = exactManufacturerSource({
    retrievedAt: '2026-07-11T15:00:00.000Z',
    contentSha256: 'd'.repeat(64),
    objectPath: `evidence/web/sha256/dd/dd/${'d'.repeat(64)}.html`,
    byteSize: 1400,
    supersedesContentSha256: [oldSource.contentSha256],
    claims: oldSource.claims.map((claim) => (
      claim.field === 'flags.requiresPlumbing'
        ? { ...claim, value: false, quote: 'Water connection not required', label: 'Water connection' }
        : claim
    )),
  }, '2026-07-11T15:05:00.000Z');
  const resolution = adjudicateResolutionCase(resolutionCase({ sources: [oldSource, newer] }));

  assert.equal(resolution.status, 'resolved');
  assert.equal(resolution.values['flags.requiresPlumbing'], false);
  assert.deepEqual(resolution.supersededSourceHashes, [oldSource.contentSha256]);
});

test('exhausted evidence search closes automatically as quarantine instead of waiting for a reviewer', () => {
  const resolution = adjudicateResolutionCase(resolutionCase({ attempt: 3, sources: [] }));

  assert.equal(resolution.status, 'quarantined');
  assert.equal(resolution.terminalReason, 'evidence_search_exhausted');
  assert.equal(resolution.requiresHumanReview, false);
});

test('manifest exposes only machine-resolved release IDs and remains deterministic', () => {
  const input = { schemaVersion: 1, cases: [resolutionCase()] };
  const first = buildResolutionManifest(input);
  const second = buildResolutionManifest(structuredClone(input));

  assert.deepEqual(first, second);
  assert.deepEqual(first.releasedLegacyIds, ['ao-88474']);
  assert.deepEqual(first.releaseGrants, [{
    legacyRuntimeId: 'ao-88474',
    caseId: 'resolution_westinghouse_whe6874ba_v1',
    reasons: [
      'approved_alias_dimensions_only_projection_still_exposes_unreviewed_clearance_operation_and_plumbing_fields',
      'phase1_approved_dimensions_alias',
    ],
  }]);
  assert.deepEqual(first.activeQuarantines, []);
  assert.equal(first.summary.resolved, 1);
  assert.equal(first.summary.requiresHumanReview, 0);
  const fields = buildResolutionFieldEvidence(first);
  assert.ok(fields.some((row) => row.legacyRuntimeId === 'ao-88474'
    && row.field === 'installation.topMm' && row.value === 25));
  assert.equal(fields.some((row) => row.field.startsWith('flags.')), false);
});

test('manifest automatically quarantines every non-resolved case', () => {
  const manifest = buildResolutionManifest({
    schemaVersion: 1,
    cases: [resolutionCase({ id: 'pending-case', attempt: 1, sources: [] })],
  });

  assert.deepEqual(manifest.releaseGrants, []);
  assert.deepEqual(manifest.activeQuarantines, [{
    legacyRuntimeId: 'ao-88474',
    reason: 'evidence_resolution_research_required',
    caseId: 'pending-case',
  }]);
});

test('expired evidence reopens machine research and quarantines publication', () => {
  const manifest = buildResolutionManifest({ schemaVersion: 1, cases: [resolutionCase()] }, {
    asOf: '2028-01-01T00:00:00.000Z',
  });
  assert.equal(manifest.results[0].decision.status, 'research_required');
  assert.deepEqual(manifest.releaseGrants, []);
  assert.equal(manifest.activeQuarantines[0].reason, 'evidence_resolution_research_required');
});

test('repository projection publishes the resolved exact model without stale legacy fit fields', async () => {
  const { readFile } = await import('node:fs/promises');
  const projection = JSON.parse(await readFile('data/architecture-v2/generated/public-catalog-projection.json', 'utf8'));
  const product = projection.products.find((row) => row.id === 'ao-88474');

  assert.ok(product, 'resolved WHE6874BA must be present in the canonical public projection');
  assert.deepEqual(product.clearance_requirements, { top_mm: 25 });
  assert.deepEqual(product.flags, { requires_plumbing: true, reversible_door: null });
  assert.equal(product.geometry_v2.installation.leftMm, null);
  assert.equal(product.geometry_v2.installation.rearMm, null);
  assert.equal(product.evidence.v2_resolution.status, 'resolved');
});
