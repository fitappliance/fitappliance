import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertEvidenceResolutionAudit,
  auditEvidenceResolution,
} from '../../src/domain/evidence-resolution-audit.mjs';
import { buildResolutionManifest } from '../../src/domain/evidence-resolution-loop.mjs';
import { createVerificationReceipt } from '../../src/domain/evidence-source-verifier.mjs';

const HASH = 'a'.repeat(64);

function input() {
  const source = {
    authority: 'manufacturer', sourceType: 'official_exact_model_product_page',
    sourceUrl: 'https://www.westinghouse.com.au/fridges/m1/',
    finalUrl: 'https://www.westinghouse.com.au/fridges/m1/', redirectChain: [],
    retrievedAt: '2026-07-11T14:00:00.000Z', contentSha256: HASH,
    objectPath: `evidence/web/sha256/aa/aa/${HASH}.html`, contentType: 'text/html', byteSize: 100,
    identity: { brand: 'Westinghouse', model: 'M1', outcome: 'exact' },
    identitySignals: [
      { type: 'canonical_url', value: 'https://www.westinghouse.com.au/fridges/m1/' },
      { type: 'product_model', value: 'M1' },
    ],
    claims: [
      { field: 'closedEnvelope.widthMm', value: 600, unit: 'mm', label: 'Total width (mm)', quote: 'Total width (mm) 600 mm' },
      { field: 'closedEnvelope.heightMm', value: 1700, unit: 'mm', label: 'Total height (mm)', quote: 'Total height (mm) 1700 mm' },
      { field: 'closedEnvelope.depthMm', value: 650, unit: 'mm', label: 'Total depth (mm)', quote: 'Total depth (mm) 650 mm' },
    ],
  };
  source.verificationReceipt = createVerificationReceipt(source, {
    brand: 'Westinghouse', model: 'M1', category: 'fridge',
  }, { verifiedAt: '2026-07-11T14:05:00.000Z' });
  return {
    schemaVersion: 1,
    cases: [{
      id: 'case-1', legacyRuntimeId: 'fridge-1', brand: 'Westinghouse', model: 'M1', category: 'fridge',
      releasableQuarantineReasons: ['evidence_projection_hold'],
      initialFailure: { code: 'bad_projection', conflictingFields: [] },
      attempt: 1, maxAttempts: 3, sources: [source], history: [],
    }],
  };
}

test('audit reports deterministic state, age, attempts, and terminal metrics', () => {
  const document = input();
  const manifest = buildResolutionManifest(document, { asOf: '2026-07-12T00:00:00.000Z' });
  const audit = auditEvidenceResolution(document, manifest, { asOf: '2026-07-12T00:00:00.000Z' });
  assert.deepEqual(audit.errors, []);
  assert.equal(audit.metrics.cases, 1);
  assert.equal(audit.metrics.resolved, 1);
  assert.equal(audit.metrics.maximumAttempt, 1);
  assert.ok(audit.metrics.oldestEvidenceAgeDays > 0);
  assert.equal(assertEvidenceResolutionAudit(audit), true);
});

test('audit blocks missing quarantine coverage, release drift, and human review flags', () => {
  const document = input();
  const manifest = buildResolutionManifest(document, { asOf: '2028-01-01T00:00:00.000Z' });
  const malformed = structuredClone(manifest);
  malformed.activeQuarantines = [];
  malformed.releasedLegacyIds = ['fridge-1'];
  malformed.summary.requiresHumanReview = 1;
  const audit = auditEvidenceResolution(document, malformed, { asOf: '2028-01-01T00:00:00.000Z' });
  assert.ok(audit.errors.some((error) => error.includes('quarantine coverage')));
  assert.ok(audit.errors.some((error) => error.includes('release drift')));
  assert.ok(audit.errors.some((error) => error.includes('human review')));
  assert.throws(() => assertEvidenceResolutionAudit(audit), /audit failed/i);
});

test('audit rejects duplicate active product cases before publication', () => {
  const document = input();
  document.cases.push({ ...structuredClone(document.cases[0]), id: 'case-2' });
  const audit = auditEvidenceResolution(document, {
    schemaVersion: 1, results: [], releaseGrants: [], releasedLegacyIds: [], activeQuarantines: [],
    summary: { cases: 0, resolved: 0, researchRequired: 0, reconciliationRequired: 0, quarantined: 0, requiresHumanReview: 0 },
  }, { asOf: '2026-07-12T00:00:00.000Z' });
  assert.ok(audit.errors.some((error) => error.includes('duplicate active product case')));
});
