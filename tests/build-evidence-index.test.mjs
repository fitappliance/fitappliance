import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { buildIndex, pickEvidenceEntry } = require(path.join(repoRoot, 'scripts', 'build-evidence-index.js'));

test('build-evidence-index projects approved PDF evidence into a slim runtime map', () => {
  const index = buildIndex({
    last_updated: '2026-05-13',
    products: {
      'fridge-alpha': {
        category: 'fridge',
        brand: 'Hisense',
        model: 'HRTF206',
        evidence: [{
          status: 'approved',
          type: 'spec_sheet',
          source_url: 'https://example.com/spec.pdf',
          verified_at: '2026-05-07',
          extracted: { metadata: { confidence_score: 0.91 } }
        }]
      }
    }
  });

  assert.equal(index.schema_version, 1);
  assert.equal(index.products['fridge-alpha'].status, 'verified');
  assert.equal(index.products['fridge-alpha'].has_pdf_evidence, true);
  assert.equal(index.products['fridge-alpha'].trust_level, 'dimensions_verified');
  assert.deepEqual(index.products['fridge-alpha'].verified_fields, ['dimensions']);
  assert.equal(index.products['fridge-alpha'].clearance_verified, false);
  assert.equal(index.products['fridge-alpha'].source_url, 'https://example.com/spec.pdf');
  assert.equal(index.products['fridge-alpha'].verified_at, '2026-05-07');
  assert.equal(index.products['fridge-alpha'].confidence_score, 0.91);
});

test('build-evidence-index infers Verified Fit from extracted dimensions and clearance', () => {
  const index = buildIndex({
    products: {
      'fridge-full': {
        category: 'fridge',
        brand: 'Fisher & Paykel',
        model: 'RF605QDVX2',
        evidence: [{
          status: 'approved',
          type: 'spec_sheet',
          has_pdf_evidence: true,
          source_url: 'https://example.com/full.pdf',
          verified_at: '2026-05-07',
          extracted: {
            dimensions: {
              height_mm: 1790,
              width_mm: 905,
              depth_mm: 688,
              door_open_90_depth_mm: null,
            },
            clearance_requirements: {
              top_mm: 0,
              left_mm: 20,
              right_mm: 20,
              rear_mm: 30,
            },
            metadata: { confidence_score: 0.9 },
          },
        }],
      },
    },
  });

  assert.equal(index.products['fridge-full'].trust_level, 'verified_fit');
  assert.deepEqual(index.products['fridge-full'].verified_fields, ['dimensions', 'clearance']);
  assert.equal(index.products['fridge-full'].clearance_verified, true);
});

test('build-evidence-index preserves explicit Verified Fit and retailer spec tiers', () => {
  const index = buildIndex({
    products: {
      full: {
        category: 'fridge',
        brand: 'LG',
        model: 'FULL',
        evidence: [{
          status: 'approved',
          source_url: 'https://example.com/full.pdf',
          verified_at: '2026-05-07',
          trust_level: 'verified_fit',
          verified_fields: ['dimensions', 'clearance'],
          clearance_verified: true,
          has_pdf_evidence: true
        }]
      },
      retailer: {
        category: 'dryer',
        brand: 'Samsung',
        model: 'RETAIL',
        evidence: [{
          status: 'approved',
          source_url: 'https://www.appliancesonline.com.au/product/example',
          verified_at: '2026-05-07',
          trust_level: 'retailer_spec',
          verified_fields: ['dimensions'],
          clearance_verified: false,
          has_pdf_evidence: false
        }]
      }
    }
  });

  assert.equal(index.products.full.status, 'verified');
  assert.equal(index.products.full.trust_level, 'verified_fit');
  assert.deepEqual(index.products.full.verified_fields, ['dimensions', 'clearance']);
  assert.equal(index.products.full.clearance_verified, true);
  assert.equal(index.products.retailer.status, 'verified');
  assert.equal(index.products.retailer.trust_level, 'retailer_spec');
  assert.equal(index.products.retailer.has_pdf_evidence, false);
});

test('build-evidence-index excludes invalid products and keeps pending evidence visible', () => {
  const index = buildIndex({
    products: {
      invalid: { status: 'invalid', evidence: [{ status: 'approved' }] },
      pending: {
        category: 'dryer',
        brand: 'Samsung',
        model: 'DV80',
        evidence: [{ status: 'candidate', source_url: 'https://example.com/manual.pdf' }]
      }
    }
  });

  assert.equal(index.products.invalid, undefined);
  assert.equal(index.products.pending.status, 'pending');
  assert.equal(index.products.pending.has_pdf_evidence, false);
});

test('pickEvidenceEntry prefers approved evidence over candidate rows', () => {
  const picked = pickEvidenceEntry({
    evidence: [
      { status: 'candidate', source_url: 'https://example.com/candidate.pdf' },
      { status: 'approved', source_url: 'https://example.com/approved.pdf' }
    ]
  });

  assert.equal(picked.source_url, 'https://example.com/approved.pdf');
});

test('generated evidence index file has deterministic sorted product keys when present', () => {
  const evidencePath = path.join(repoRoot, 'public', 'data', 'evidence-index.json');
  try {
    const payload = JSON.parse(readFileSync(evidencePath, 'utf8'));
    const keys = Object.keys(payload.products ?? {});
    assert.deepEqual(keys, [...keys].sort());
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
});
