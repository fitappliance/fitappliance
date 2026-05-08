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
    },
  }));

  assert.ok(errors.some((error) => error.includes('evidence.has_pdf_evidence')));
  assert.ok(errors.some((error) => error.includes('evidence.source_url')));
  assert.ok(errors.some((error) => error.includes('evidence.verified_at')));
});

test('buildEvidencePatch only returns approved PDF evidence', () => {
  const entry = makeManualEvidence().products['fridge-arf3335'];
  assert.deepEqual(buildEvidencePatch(entry), {
    has_pdf_evidence: true,
    source_url: 'https://example.com/HRTF206-Spec.pdf',
    verified_at: '2026-05-07',
  });

  assert.equal(buildEvidencePatch({
    evidence: [{ type: 'spec_sheet', status: 'candidate', source_url: 'https://example.com/a.pdf', verified_at: '2026-05-07' }],
  }), null);
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
