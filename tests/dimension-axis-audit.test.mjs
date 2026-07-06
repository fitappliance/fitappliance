import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  findDimensionAxisIssues,
  summarizeDimensionAxisIssues,
  buildMarkdownReport,
  writeDimensionAxisReports
} = require('../scripts/audit-dimension-axis.js');

function product(overrides = {}) {
  return {
    id: 'fridge-arf2745',
    cat: 'fridge',
    brand: 'Westinghouse',
    model: 'WBE4302WC',
    w: 1725,
    h: 699,
    d: 723,
    features: ['Upright', '5B', 'Class 6'],
    ...overrides
  };
}

function rawEvidence(overrides = {}) {
  return {
    product_id: 'fridge-arf2745',
    brand: 'Westinghouse',
    model: 'WBE4302WC',
    extracted: {
      dimensions: {
        width_mm: 699,
        height_mm: 1725,
        depth_mm: 723
      },
      metadata: {
        confidence_score: 0.9
      }
    },
    ...overrides
  };
}

test('dimension-axis audit flags swapped public runtime dimensions against raw evidence', () => {
  const issues = findDimensionAxisIssues({
    products: [product()],
    rawEvidenceByProductId: new Map([
      ['fridge-arf2745', rawEvidence()]
    ]),
    catalogFinalByProductId: new Map()
  });

  assert.equal(issues.some((issue) => issue.code === 'swapped_against_raw_evidence'), true);
  assert.equal(summarizeDimensionAxisIssues(issues).blockerCount, 1);
});

test('dimension-axis audit flags drift between runtime data and catalog-final when catalog-final is verified', () => {
  const issues = findDimensionAxisIssues({
    products: [product()],
    rawEvidenceByProductId: new Map(),
    catalogFinalByProductId: new Map([
      ['fridge-arf2745', product({
        w: 699,
        h: 1725,
        d: 723,
        evidence: {
          raw_json_path: 'data/pdf-evidence-raw/WBE4302WC.json',
          confidence_score: 0.9,
          verified_fields: ['dimensions']
        }
      })]
    ])
  });

  assert.equal(issues.some((issue) => issue.code === 'runtime_catalog_final_dimension_drift'), true);
  assert.equal(summarizeDimensionAxisIssues(issues).blockerCount, 1);
});

test('dimension-axis audit keeps chest-style wide fridges as review-only, not blockers', () => {
  const issues = findDimensionAxisIssues({
    products: [product({
      id: 'fridge-chest-1',
      brand: 'AKAI',
      model: 'AK-688-CF',
      w: 1905,
      h: 865,
      d: 820,
      features: ['Chest', '6C', 'Class 8']
    })],
    rawEvidenceByProductId: new Map(),
    catalogFinalByProductId: new Map()
  });

  assert.equal(issues.some((issue) => issue.severity === 'blocker'), false);
});

test('dimension-axis audit reports upright fridge width greater than height as a review warning', () => {
  const issues = findDimensionAxisIssues({
    products: [product({ id: 'upright-wide', w: 1725, h: 796, d: 773 })],
    rawEvidenceByProductId: new Map(),
    catalogFinalByProductId: new Map()
  });

  assert.equal(issues.some((issue) => issue.code === 'upright_fridge_width_gt_height_review'), true);
  assert.equal(summarizeDimensionAxisIssues(issues).warningCount, 1);
});

test('dimension-axis audit markdown report lists blocker product ids for review', () => {
  const issues = findDimensionAxisIssues({
    products: [product()],
    rawEvidenceByProductId: new Map([
      ['fridge-arf2745', rawEvidence()]
    ]),
    catalogFinalByProductId: new Map()
  });
  const markdown = buildMarkdownReport({ issues, generatedAt: '2026-07-06T00:00:00.000Z' });

  assert.match(markdown, /Dimension Axis Audit/);
  assert.match(markdown, /fridge-arf2745/);
  assert.match(markdown, /swapped_against_raw_evidence/);
});

test('dimension-axis audit writes json and markdown reports to requested directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-dimension-axis-'));
  const issues = findDimensionAxisIssues({
    products: [product()],
    rawEvidenceByProductId: new Map([
      ['fridge-arf2745', rawEvidence()]
    ]),
    catalogFinalByProductId: new Map()
  });
  const outputs = writeDimensionAxisReports({ issues, outputDir: dir, generatedAt: '2026-07-06T00:00:00.000Z' });

  assert.equal(fs.existsSync(outputs.jsonPath), true);
  assert.equal(fs.existsSync(outputs.markdownPath), true);
  assert.equal(JSON.parse(fs.readFileSync(outputs.jsonPath, 'utf8')).summary.blockerCount, 1);
  assert.match(fs.readFileSync(outputs.markdownPath, 'utf8'), /Dimension Axis Audit/);
});

test('dimension-axis audit package script is wired', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));

  assert.equal(pkg.scripts['audit-dimension-axis'], 'node scripts/audit-dimension-axis.js');
});
