import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildFinalCatalog,
  mergeEvidenceIntoProduct,
  runMerge
} from '../../scripts/pdf-pipeline/4-merge.js';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function makeRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-final-merge-'));
  const activeFridge = {
    id: 'fridge-arf2964',
    cat: 'fridge',
    brand: 'Fisher & Paykel',
    model: 'RF730QNUVX1',
    w: 900,
    h: 1890,
    d: 740,
    unavailable: false,
    retailers: [{ n: 'Appliances Online', url: 'https://example.com/product' }]
  };
  const untouchedDryer = {
    id: 'dryer-1',
    cat: 'dryer',
    brand: 'Other',
    model: 'DRY1',
    w: 600,
    h: 850,
    d: 600,
    unavailable: false
  };
  const sameSkuDifferentProduct = {
    id: 'fridge-similar',
    cat: 'fridge',
    brand: 'Fisher & Paykel',
    model: 'RF730QNUVX1',
    w: 910,
    h: 1905,
    d: 755,
    unavailable: false
  };

  writeJson(path.join(repoRoot, 'public', 'data', 'fridges.json'), { products: [activeFridge, sameSkuDifferentProduct] });
  writeJson(path.join(repoRoot, 'public', 'data', 'dryers.json'), { products: [untouchedDryer] });
  writeJson(path.join(repoRoot, 'public', 'data', 'dishwashers.json'), { products: [] });
  writeJson(path.join(repoRoot, 'public', 'data', 'washing-machines.json'), { products: [] });
  writeJson(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'RF730QNUVX1.json'), {
    schema_version: 1,
    product_id: 'fridge-arf2964',
    category: 'fridge',
    brand: 'Fisher & Paykel',
    model: 'RF730QNUVX1',
    source_url: 'https://example.com/rf730.pdf',
    verified_at: '2026-05-09',
    extracted: {
      brand: 'Fisher & Paykel',
      sku: 'RF730QNUVX1',
      category: 'FRIDGE',
      dimensions: {
        height_mm: 1900,
        width_mm: 905,
        depth_mm: 748,
        door_open_90_depth_mm: null
      },
      clearance_requirements: {
        top_mm: 20,
        left_mm: 20,
        right_mm: 20,
        rear_mm: 30
      },
      flags: {
        requires_plumbing: false,
        ventilation_required: true,
        reversible_door: null
      },
      metadata: {
        source_pdf_url: 'https://example.com/rf730.pdf',
        extraction_date: '2026-05-09T00:00:00.000Z',
        confidence_score: 0.9
      }
    }
  });
  return repoRoot;
}

test('final merge overlays official PDF dimensions, clearance and flags without mutating input', () => {
  const product = {
    id: 'fridge-arf2964',
    model: 'RF730QNUVX1',
    w: 900,
    h: 1890,
    d: 740
  };
  const evidence = {
    product_id: 'fridge-arf2964',
    source_url: 'https://example.com/rf730.pdf',
    verified_at: '2026-05-09',
    extracted: {
      dimensions: {
        height_mm: 1900,
        width_mm: 905,
        depth_mm: 748,
        door_open_90_depth_mm: null
      },
      clearance_requirements: {
        top_mm: 20,
        left_mm: 20,
        right_mm: 20,
        rear_mm: 30
      },
      flags: {
        requires_plumbing: false,
        ventilation_required: true,
        reversible_door: null
      },
      metadata: {
        source_pdf_url: 'https://example.com/rf730.pdf',
        extraction_date: '2026-05-09T00:00:00.000Z',
        confidence_score: 0.9
      }
    }
  };

  const merged = mergeEvidenceIntoProduct(product, evidence);

  assert.deepEqual(product, {
    id: 'fridge-arf2964',
    model: 'RF730QNUVX1',
    w: 900,
    h: 1890,
    d: 740
  });
  assert.equal(merged.w, 905);
  assert.equal(merged.h, 1900);
  assert.equal(merged.d, 748);
  assert.equal(merged.data_source, 'official_pdf');
  assert.deepEqual(merged.dimensions, evidence.extracted.dimensions);
  assert.deepEqual(merged.clearance_requirements, evidence.extracted.clearance_requirements);
  assert.deepEqual(merged.flags, evidence.extracted.flags);
  assert.equal(merged.evidence.has_pdf_evidence, true);
});

test('final catalog builder keeps unmatched products and reports merge counts', () => {
  const repoRoot = makeRepo();
  const result = buildFinalCatalog({ repoRoot });

  assert.equal(result.summary.total_products, 3);
  assert.equal(result.summary.evidence_files, 1);
  assert.equal(result.summary.merged_products, 1);
  assert.equal(result.catalog.products.length, 3);
  assert.equal(result.catalog.products.find((product) => product.id === 'fridge-arf2964').data_source, 'official_pdf');
  assert.equal(result.catalog.products.find((product) => product.id === 'fridge-similar').data_source, undefined);
  assert.equal(result.catalog.products.find((product) => product.id === 'dryer-1').data_source, undefined);
});

test('runMerge writes data/catalog-final.json and never rewrites public catalog files', () => {
  const repoRoot = makeRepo();
  const publicFridgesPath = path.join(repoRoot, 'public', 'data', 'fridges.json');
  const before = fs.readFileSync(publicFridgesPath, 'utf8');
  const result = runMerge({ repoRoot });

  assert.equal(result.outputPath, path.join(repoRoot, 'data', 'catalog-final.json'));
  assert.equal(fs.existsSync(result.outputPath), true);
  assert.equal(fs.readFileSync(publicFridgesPath, 'utf8'), before);

  const output = JSON.parse(fs.readFileSync(result.outputPath, 'utf8'));
  assert.equal(output.products.find((product) => product.id === 'fridge-arf2964').data_source, 'official_pdf');
});
