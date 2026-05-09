import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  saveExtractionToVault,
  upsertManualEvidence,
  writeEvidenceVaultEntry
} from '../../scripts/pdf-pipeline/lib/vault.js';

const strictFixture = {
  brand: 'Hisense',
  sku: 'HRTF206',
  category: 'FRIDGE',
  dimensions: {
    height_mm: 1456,
    width_mm: 550,
    depth_mm: 562,
    door_open_90_depth_mm: null
  },
  clearance_requirements: {
    top_mm: 100,
    left_mm: 50,
    right_mm: 50,
    rear_mm: 50
  },
  flags: {
    requires_plumbing: false,
    ventilation_required: true,
    reversible_door: false
  },
  metadata: {
    source_pdf_url: 'https://example.com/HRTF206-Spec.pdf',
    extraction_date: '2026-05-08T00:00:00.000Z',
    confidence_score: 0.97
  }
};

function makeTempRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-vault-'));
  fs.mkdirSync(path.join(repoRoot, 'data'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'data', 'manual-evidence.json'), JSON.stringify({
    schema_version: 1,
    last_updated: '2026-05-01',
    storage: {
      root_env: 'EVIDENCE_ROOT_DIR',
      path_rule: 'Each evidence.local_path is relative to EVIDENCE_ROOT_DIR.'
    },
    products: {}
  }, null, 2));
  return repoRoot;
}

test('vault writes strict extraction JSON to data/pdf-evidence-raw/[sku].json', () => {
  const repoRoot = makeTempRepo();
  const result = writeEvidenceVaultEntry({
    repoRoot,
    productId: 'fridge-arf3335',
    product: { brand: 'Hisense', model: 'HRTF206', cat: 'fridge' },
    strictData: strictFixture,
    sourceUrl: strictFixture.metadata.source_pdf_url,
    verifiedAt: '2026-05-08'
  });

  assert.equal(result.rawJsonRelativePath, 'data/pdf-evidence-raw/HRTF206.json');
  assert.equal(fs.existsSync(path.join(repoRoot, result.rawJsonRelativePath)), true);
  const saved = JSON.parse(fs.readFileSync(path.join(repoRoot, result.rawJsonRelativePath), 'utf8'));
  assert.equal(saved.product_id, 'fridge-arf3335');
  assert.equal(saved.extracted.dimensions.depth_mm, 562);
});

test('vault upserts approved manual evidence without mutating unrelated products', () => {
  const manifest = {
    schema_version: 1,
    last_updated: '2026-05-01',
    storage: {
      root_env: 'EVIDENCE_ROOT_DIR',
      path_rule: 'Each evidence.local_path is relative to EVIDENCE_ROOT_DIR.'
    },
    products: {
      existing: {
        category: 'fridge',
        brand: 'Other',
        model: 'ABC',
        evidence: []
      }
    }
  };

  const next = upsertManualEvidence(manifest, {
    productId: 'fridge-arf3335',
    product: { cat: 'fridge', brand: 'Hisense', model: 'HRTF206' },
    strictData: strictFixture,
    sourceUrl: strictFixture.metadata.source_pdf_url,
    verifiedAt: '2026-05-08',
    rawJsonRelativePath: 'data/pdf-evidence-raw/HRTF206.json'
  });

  assert.equal(manifest.products['fridge-arf3335'], undefined);
  assert.equal(next.products.existing.brand, 'Other');
  assert.equal(next.products['fridge-arf3335'].has_pdf_evidence, true);
  assert.equal(next.products['fridge-arf3335'].evidence.length, 1);
  assert.equal(next.products['fridge-arf3335'].evidence[0].status, 'approved');
  assert.equal(next.products['fridge-arf3335'].evidence[0].source_url, strictFixture.metadata.source_pdf_url);
  assert.equal(next.products['fridge-arf3335'].evidence[0].verified_at, '2026-05-08');
  assert.equal(next.products['fridge-arf3335'].evidence[0].raw_json_path, 'data/pdf-evidence-raw/HRTF206.json');
});

test('saveExtractionToVault writes both raw JSON and manual-evidence manifest', () => {
  const repoRoot = makeTempRepo();
  const result = saveExtractionToVault({
    repoRoot,
    productId: 'fridge-arf3335',
    product: { cat: 'fridge', brand: 'Hisense', model: 'HRTF206' },
    strictData: strictFixture,
    sourceUrl: strictFixture.metadata.source_pdf_url,
    verifiedAt: '2026-05-08'
  });

  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'manual-evidence.json'), 'utf8'));
  assert.equal(result.productId, 'fridge-arf3335');
  assert.equal(manifest.products['fridge-arf3335'].has_pdf_evidence, true);
  assert.equal(manifest.products['fridge-arf3335'].evidence[0].extracted.sku, 'HRTF206');
});
