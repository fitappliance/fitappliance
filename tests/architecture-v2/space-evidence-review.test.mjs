import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  applySpaceEvidenceReview,
  buildSpaceEvidenceProjection,
  reviewSpaceField,
} from '../../src/domain/space-evidence-review.mjs';
import { classifyTransportHost } from '../../src/domain/source-provenance.mjs';

const document = {
  id: 'doc_exact', authorType: 'manufacturer', transportHostType: 'manufacturer',
  identityOutcome: 'exact', sha256: 'a'.repeat(64), pageCount: 20, parserVersion: 'pdftotext-26.06.0',
};
const bundles = JSON.parse(fs.readFileSync('data/architecture-v2/generated/evidence-review-bundles.json', 'utf8')).bundles;
const dimensionManifest = JSON.parse(fs.readFileSync('data/architecture-v2/generated/evidence-pilot-review-manifest.json', 'utf8'));
const base = {
  legacyRuntimeId: 'model-1', canonicalProductId: 'cp_1', document,
  field: 'installation.rearMm', value: 30, unit: 'mm', page: 2,
  quote: 'Minimum air clearance - at rear 30 mm', semanticBasis: 'explicit_axis_label',
  status: 'approved', reviewer: 'Codex PDF visual review', reviewedAt: '2026-07-11',
  renderedPageVerified: true,
};

test('approves reproducible explicit space evidence', () => {
  assert.equal(reviewSpaceField(base).status, 'approved');
});

test('classifies current official asset hosts without promoting retailer mirrors', () => {
  assert.equal(classifyTransportHost('https://dtc-aus-api.hisense.com/medias/spec.pdf'), 'manufacturer');
  assert.equal(classifyTransportHost('https://gscs-b2c.lge.com/open/downloadFile?fileId=1'), 'manufacturer');
  assert.equal(classifyTransportHost('https://www.haier.com.au/spec.pdf'), 'manufacturer');
  assert.equal(classifyTransportHost('https://commercial.appliancesonline.com.au/spec.pdf'), 'retailer');
});

test('rejects inferred zero and unsupported or semantically mismatched fields', () => {
  assert.throws(() => reviewSpaceField({ ...base, field: 'installation.frontMm', value: 0 }), /positive explicit value/i);
  assert.throws(() => reviewSpaceField({ ...base, field: 'clearance.backMm' }), /unsupported space field/i);
  assert.throws(() => reviewSpaceField({ ...base, field: 'operation.doorOpenDepthMm', value: 1115 }), /door-open diagram/i);
  assert.throws(() => reviewSpaceField({ ...base, field: 'installation.leftMm', semanticBasis: 'explicit_sides_label', quote: 'Clearance 50 mm' }), /explicit Sides label/i);
});

test('requires the same reproducibility gate as dimension evidence', () => {
  assert.throws(() => reviewSpaceField({ ...base, document: { ...document, sha256: null } }), /reproducibility gate/i);
  assert.throws(() => reviewSpaceField({ ...base, renderedPageVerified: false }), /reproducibility gate/i);
  assert.throws(() => reviewSpaceField({ ...base, document: { ...document, identityOutcome: 'ambiguous' } }), /reproducibility gate/i);
});

test('committed pilot covers all ten approved dimension documents and preserves partial trust', () => {
  const input = JSON.parse(fs.readFileSync('data/architecture-v2/reviews/phase-09/space-evidence-pilot-input.json', 'utf8'));
  const results = applySpaceEvidenceReview(input, { bundles, dimensionManifest });
  assert.equal(input.reviews.length, 10);
  assert.equal(new Set(input.reviews.map((row) => row.legacyRuntimeId)).size, 10);
  assert.equal(results.length, 18);
  assert.equal(results.filter((row) => row.status === 'approved').length, 18);
  assert.equal(input.reviews.filter((row) => row.fields.length === 0 && row.noCandidateReason).length, 5);
  const projection = buildSpaceEvidenceProjection(results);
  assert.equal(projection.size, 5);
  assert.ok([...projection.values()].every((row) => row.clearanceVerified === false));
  assert.ok([...projection.values()].every((row) => row.trustLevel === 'dimensions_verified'));
});
