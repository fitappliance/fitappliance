import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateProduct } = require('../scripts/schema.js');
const {
  applyEvidence,
  buildEvidencePatch,
  enrichEvidence,
} = require('../scripts/enrich-evidence.js');

function makeProduct(overrides = {}) {
  return {
    id: 'fridge-arf3335',
    cat: 'fridge',
    brand: 'Hisense',
    model: 'HRTF206',
    w: 550,
    h: 1456,
    d: 562,
    kwh_year: 219,
    stars: 4,
    price: null,
    emoji: '🧊',
    door_swing_mm: 550,
    features: ['Upright', '5T', 'Class 5'],
    retailers: [],
    sponsored: false,
    unavailable: true,
    ...overrides,
  };
}

function makeDoc(products) {
  return {
    schema_version: 2,
    last_updated: '2026-05-04',
    cat: 'fridge',
    products,
  };
}

function makeManualEvidence(overrides = {}) {
  return {
    schema_version: 1,
    products: {
      'fridge-arf3335': {
        category: 'fridge',
        brand: 'Hisense',
        model: 'HRTF206',
        evidence: [
          {
            type: 'spec_sheet',
            status: 'approved',
            source_url: 'https://example.com/HRTF206-Spec.pdf',
            verified_at: '2026-05-07',
          },
        ],
      },
    },
    ...overrides,
  };
}

test('schema accepts verified evidence object on a valid appliance product', () => {
  const errors = validateProduct(makeProduct({
    evidence: {
      has_pdf_evidence: true,
      source_url: 'https://example.com/HRTF206-Spec.pdf',
      verified_at: '2026-05-07',
      trust_level: 'verified_fit',
      verified_fields: ['dimensions', 'clearance'],
      clearance_verified: true,
      source_type: 'official_pdf',
    },
  }));

  assert.deepEqual(errors, []);
});

test('schema rejects malformed evidence instead of silently ignoring it', () => {
  const errors = validateProduct(makeProduct({
    evidence: {
      has_pdf_evidence: 'yes',
      source_url: 'not-a-url',
      verified_at: 'May 7',
      trust_level: 'magic',
      verified_fields: ['dimensions', 'guesswork'],
      clearance_verified: 'no',
    },
  }));

  assert.ok(errors.some((error) => error.includes('evidence.has_pdf_evidence')));
  assert.ok(errors.some((error) => error.includes('evidence.source_url')));
  assert.ok(errors.some((error) => error.includes('evidence.verified_at')));
  assert.ok(errors.some((error) => error.includes('evidence.trust_level')));
  assert.ok(errors.some((error) => error.includes('evidence.verified_fields')));
  assert.ok(errors.some((error) => error.includes('evidence.clearance_verified')));
});

test('buildEvidencePatch returns approved PDF evidence as dimensions-only unless clearance is explicit', () => {
  const entry = makeManualEvidence().products['fridge-arf3335'];
  assert.deepEqual(buildEvidencePatch(entry), {
    has_pdf_evidence: true,
    source_url: 'https://example.com/HRTF206-Spec.pdf',
    verified_at: '2026-05-07',
    trust_level: 'dimensions_verified',
    verified_fields: ['dimensions'],
    clearance_verified: false,
    source_type: 'official_pdf',
  });

  assert.equal(buildEvidencePatch({
    evidence: [{ type: 'spec_sheet', status: 'candidate', source_url: 'https://example.com/a.pdf', verified_at: '2026-05-07' }],
  }), null);
});

test('buildEvidencePatch infers Verified Fit from extracted dimensions and clearance', () => {
  const entry = {
    evidence: [
      {
        type: 'spec_sheet',
        status: 'approved',
        has_pdf_evidence: true,
        source_url: 'https://example.com/full.pdf',
        verified_at: '2026-05-11',
        extracted: {
          dimensions: {
            height_mm: 1456,
            width_mm: 550,
            depth_mm: 562,
            door_open_90_depth_mm: null,
          },
          clearance_requirements: {
            top_mm: 100,
            left_mm: 50,
            right_mm: 50,
            rear_mm: 50,
          },
        },
      },
    ],
  };

  assert.deepEqual(buildEvidencePatch(entry), {
    has_pdf_evidence: true,
    source_url: 'https://example.com/full.pdf',
    verified_at: '2026-05-11',
    source_type: 'official_pdf',
    trust_level: 'verified_fit',
    verified_fields: ['dimensions', 'clearance'],
    clearance_verified: true,
  });
});

test('buildEvidencePatch keeps all-zero clearance as dimensions verified unless explicitly sourced', () => {
  const entry = {
    evidence: [
      {
        type: 'spec_sheet',
        status: 'approved',
        has_pdf_evidence: true,
        source_url: 'https://example.com/zero.pdf',
        verified_at: '2026-05-11',
        extracted: {
          dimensions: { height_mm: 1700, width_mm: 700, depth_mm: 700 },
          clearance_requirements: { top_mm: 0, left_mm: 0, right_mm: 0, rear_mm: 0 },
        },
      },
    ],
  };

  assert.deepEqual(buildEvidencePatch(entry), {
    has_pdf_evidence: true,
    source_url: 'https://example.com/zero.pdf',
    verified_at: '2026-05-11',
    source_type: 'official_pdf',
    trust_level: 'dimensions_verified',
    verified_fields: ['dimensions'],
    clearance_verified: false,
  });
});

test('buildEvidencePatch downgrades retailer-hosted PDFs to Retailer Spec even if stale metadata says Verified Fit', () => {
  const entry = {
    evidence: [
      {
        type: 'spec_sheet',
        status: 'approved',
        has_pdf_evidence: true,
        source_url: 'https://commercial.appliancesonline.com.au/manuals/example.pdf',
        verified_at: '2026-05-11',
        trust_level: 'verified_fit',
        verified_fields: ['dimensions', 'clearance'],
        clearance_verified: true,
      },
    ],
  };

  assert.deepEqual(buildEvidencePatch(entry), {
    has_pdf_evidence: true,
    source_url: 'https://commercial.appliancesonline.com.au/manuals/example.pdf',
    verified_at: '2026-05-11',
    source_type: 'retailer_spec',
    trust_level: 'retailer_spec',
    verified_fields: ['dimensions'],
    clearance_verified: false,
  });
});

test('buildEvidencePatch preserves approved third-party evidence without upgrading it to PDF verified', () => {
  const entry = {
    evidence: [
      {
        type: 'third_party_spec',
        status: 'approved',
        source_url: 'https://www.appliancesonline.com.au/product/example',
        verified_at: '2026-05-11',
        has_pdf_evidence: false,
        source_type: 'mixed_retailer_dimensions_pdf_clearance',
      },
    ],
  };

  assert.deepEqual(buildEvidencePatch(entry), {
    has_pdf_evidence: false,
    source_url: 'https://www.appliancesonline.com.au/product/example',
    verified_at: '2026-05-11',
    source_type: 'mixed_retailer_dimensions_pdf_clearance',
    trust_level: 'retailer_spec',
    verified_fields: ['dimensions'],
    clearance_verified: false,
  });
});

test('buildEvidencePatch preserves explicit Verified Fit evidence tier', () => {
  const entry = {
    evidence: [
      {
        type: 'installation_manual',
        status: 'approved',
        source_url: 'https://example.com/install.pdf',
        verified_at: '2026-05-11',
        has_pdf_evidence: true,
        trust_level: 'verified_fit',
        verified_fields: ['dimensions', 'clearance'],
        clearance_verified: true,
        source_type: 'official_pdf',
      },
    ],
  };

  assert.deepEqual(buildEvidencePatch(entry), {
    has_pdf_evidence: true,
    source_url: 'https://example.com/install.pdf',
    verified_at: '2026-05-11',
    source_type: 'official_pdf',
    trust_level: 'verified_fit',
    verified_fields: ['dimensions', 'clearance'],
    clearance_verified: true,
  });
});

test('applyEvidence patches only matching approved manual evidence entries', () => {
  const products = [
    makeProduct(),
    makeProduct({ id: 'fridge-other', model: 'OTHER' }),
  ];

  const patched = applyEvidence(products, makeManualEvidence());

  assert.equal(patched[0].evidence.has_pdf_evidence, true);
  assert.equal(patched[0].evidence.source_url, 'https://example.com/HRTF206-Spec.pdf');
  assert.equal(patched[0].evidence.verified_at, '2026-05-07');
  assert.equal(patched[1].evidence, undefined);
  assert.equal(products[0].evidence, undefined, 'input product should not be mutated');
});

test('enrichEvidence writes evidence into appliances and category runtime catalogs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-evidence-'));
  const dataDir = path.join(tmpDir, 'public', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const manualEvidencePath = path.join(tmpDir, 'manual-evidence.json');

  fs.writeFileSync(manualEvidencePath, JSON.stringify(makeManualEvidence(), null, 2));
  fs.writeFileSync(path.join(dataDir, 'fridges.json'), JSON.stringify(makeDoc([makeProduct()])));
  fs.writeFileSync(path.join(dataDir, 'appliances.json'), JSON.stringify(makeDoc([makeProduct()])));

  const result = enrichEvidence({ manualEvidencePath, dataDir });

  assert.equal(result.approvedCount, 1);
  assert.equal(result.changedFiles.length, 2);

  const fridges = JSON.parse(fs.readFileSync(path.join(dataDir, 'fridges.json'), 'utf8'));
  const appliances = JSON.parse(fs.readFileSync(path.join(dataDir, 'appliances.json'), 'utf8'));
  assert.equal(fridges.products[0].evidence.has_pdf_evidence, true);
  assert.equal(appliances.products[0].evidence.source_url, 'https://example.com/HRTF206-Spec.pdf');
});
