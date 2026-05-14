import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  categorizeLgFailure,
  collectLgSweepTargets,
  runLgSweep
} = require('../../scripts/pdf-pipeline/run-lg-sweep.js');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function makeRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-lg-sweep-'));
  writeJson(path.join(repoRoot, 'data', 'manual-evidence.json'), {
    schema_version: 1,
    last_updated: '2026-05-14',
    products: {
      'lg-ok': {
        category: 'washing_machine',
        brand: 'LG',
        model: 'WV9-1412W',
        product: {
          id: 'lg-ok',
          cat: 'washing_machine',
          brand: 'LG',
          model: 'WV9-1412W',
          w: 600,
          h: 850,
          d: 610
        },
        evidence: [
          {
            type: 'user_manual',
            status: 'candidate',
            source_url: 'https://example.com/wv9.pdf'
          }
        ]
      },
      'lg-missing-pdf': {
        category: 'dryer',
        brand: 'LG Electronics',
        model: 'DVH9-09W',
        product: {
          id: 'lg-missing-pdf',
          cat: 'dryer',
          brand: 'LG',
          model: 'DVH9-09W',
          w: 600,
          h: 850,
          d: 690
        },
        evidence: [
          {
            type: 'user_manual',
            status: 'candidate'
          }
        ]
      },
      'lg-existing': {
        category: 'fridge',
        brand: 'LG',
        model: 'GF-L706PL',
        product: {
          id: 'lg-existing',
          cat: 'fridge',
          brand: 'LG',
          model: 'GF-L706PL',
          w: 912,
          h: 1793,
          d: 744
        },
        evidence: [
          {
            type: 'user_manual',
            status: 'approved',
            source_url: 'https://example.com/gf.pdf',
            raw_json_path: 'data/pdf-evidence-raw/GF-L706PL.json'
          }
        ]
      },
      'not-lg': {
        category: 'fridge',
        brand: 'Samsung',
        model: 'SRF7300BSS',
        evidence: []
      }
    }
  });
  writeJson(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'GF-L706PL.json'), {
    product_id: 'lg-existing',
    brand: 'LG',
    model: 'GF-L706PL',
    extracted: {
      sku: 'GF-L706PL'
    }
  });
  return repoRoot;
}

test('collectLgSweepTargets selects pending LG ledger entries and skips existing raw evidence', () => {
  const repoRoot = makeRepo();
  const targets = collectLgSweepTargets({ repoRoot });

  assert.deepEqual(targets.map((target) => target.id), ['lg-ok', 'lg-missing-pdf']);
  assert.equal(targets[0].sourceUrl, 'https://example.com/wv9.pdf');
  assert.equal(targets[1].sourceUrl, '');
});

test('categorizeLgFailure maps parser and fetch failures to stable buckets', () => {
  assert.equal(categorizeLgFailure(new Error('missing source_url for LG')), 'Missing PDF');
  assert.equal(categorizeLgFailure(new Error('LG washing machine parser requires explicit side and rear clearance figures.')), 'Clearance Missing');
  assert.equal(categorizeLgFailure(new Error('LG parser could not verify SKU X against document model tokens.')), 'Model Mismatch');
  assert.equal(categorizeLgFailure(new Error('LG dishwasher parser could not find Width X Height X Depth dimensions.')), 'Unreadable Layout');
  assert.equal(categorizeLgFailure(new Error('PDF download failed with HTTP 403')), 'Fetch Failed');
});

test('runLgSweep writes raw evidence for successes and a markdown report for fail-closed cases', async () => {
  const repoRoot = makeRepo();
  const result = await runLgSweep({
    repoRoot,
    delayMs: 0,
    targets: collectLgSweepTargets({ repoRoot }),
    lgOfficialFinder: async () => null,
    fetchPdfImpl: async (_url, destPath) => {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, '%PDF fixture');
      return { path: destPath, cached: false, bytes: 12 };
    },
    extractTextImpl: async () => ({
      text: `
        LG Washing Machine
        INSTALLATION
        Specifications
        Dimension(mm)
        WV9-1412W / WV9-1412B
        W 600 D 610 D" 1135
        H 850 D' 660
        To ensure sufficient clearance for water inlet hoses, drain hose and airflow,
        allow minimum clearances of at least 20 mm at the sides and 100 mm behind the appliance.
      `,
      pageCount: 1,
      info: {}
    }),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.processed, 2);
  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].bucket, 'Missing PDF');

  const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'WV9-1412W.json'), 'utf8'));
  assert.equal(raw.product_id, 'lg-ok');
  assert.deepEqual(raw.extracted.clearance_requirements, {
    top_mm: 0,
    left_mm: 20,
    right_mm: 20,
    rear_mm: 100
  });

  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'manual-evidence.json'), 'utf8'));
  assert.equal(manifest.products['lg-ok'].has_pdf_evidence, true);

  const report = fs.readFileSync(path.join(repoRoot, 'reports', 'lg-batch-results.md'), 'utf8');
  assert.match(report, /LG PDF Batch Sweep/);
  assert.match(report, /Successful Verified Fit Extractions/);
  assert.match(report, /Fail-closed Buckets/);
  assert.match(report, /lg-missing-pdf/);
});
