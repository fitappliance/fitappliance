import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  compareDimensions,
  findPdfSourceUrl,
  loadBatchTargets,
  runBatch,
  writeBatchReport
} from '../../scripts/pdf-pipeline/run-batch.js';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function makeRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-pdf-batch-'));
  const products = [
    {
      id: 'active-missing',
      cat: 'fridge',
      brand: 'Hisense',
      model: 'HRTF206',
      w: 550,
      h: 1410,
      d: 490,
      unavailable: false,
      retailers: [{ n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/hisense-hrtf206' }]
    },
    {
      id: 'active-done',
      cat: 'fridge',
      brand: 'LG',
      model: 'GF-A',
      w: 700,
      h: 1700,
      d: 700,
      unavailable: false,
      evidence: { has_pdf_evidence: true }
    },
    {
      id: 'archived-missing',
      cat: 'fridge',
      brand: 'Old',
      model: 'OLD',
      w: 600,
      h: 1600,
      d: 600,
      unavailable: true
    }
  ];
  writeJson(path.join(repoRoot, 'public', 'data', 'fridges.json'), { products });
  for (const fileName of ['dishwashers.json', 'dryers.json', 'washing-machines.json']) {
    writeJson(path.join(repoRoot, 'public', 'data', fileName), { products: [] });
  }
  writeJson(path.join(repoRoot, 'data', 'manual-evidence.json'), {
    schema_version: 1,
    storage: {
      root_env: 'EVIDENCE_ROOT_DIR',
      path_rule: 'Each evidence.local_path is relative to EVIDENCE_ROOT_DIR.'
    },
    products: {
      'active-missing': {
        category: 'fridge',
        brand: 'Hisense',
        model: 'HRTF206',
        evidence: [
          {
            type: 'spec_sheet',
            status: 'candidate',
            source_url: 'https://example.com/HRTF206-Spec.pdf',
            verified_at: '2026-05-08'
          }
        ]
      }
    }
  });
  return repoRoot;
}

const strictData = {
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

test('batch target identification selects active products missing PDF evidence only', () => {
  const repoRoot = makeRepo();
  const targets = loadBatchTargets({ repoRoot });

  assert.deepEqual(targets.map((target) => target.id), ['active-missing']);
  assert.equal(targets[0].brand, 'Hisense');
  assert.equal(targets[0].sku, 'HRTF206');
});

test('batch target identification can reprocess weak evidence tiers under the new trust model', () => {
  const repoRoot = makeRepo();
  const catalogPath = path.join(repoRoot, 'data', 'catalog-final.json');
  writeJson(catalogPath, {
    products: [
      { id: 'missing', cat: 'fridge', brand: 'LG', model: 'MISS', unavailable: false },
      { id: 'dims', cat: 'fridge', brand: 'LG', model: 'DIMS', unavailable: false, evidence: { has_pdf_evidence: true, trust_level: 'dimensions_verified' } },
      { id: 'retailer', cat: 'fridge', brand: 'LG', model: 'RETAIL', unavailable: false, evidence: { has_pdf_evidence: false, trust_level: 'retailer_spec' } },
      { id: 'fit', cat: 'fridge', brand: 'LG', model: 'FIT', unavailable: false, evidence: { has_pdf_evidence: true, trust_level: 'verified_fit' } },
    ],
  });

  const targets = loadBatchTargets({
    repoRoot,
    brand: 'LG',
    targetTrustLevels: 'missing,dimensions_verified,retailer_spec',
  });

  assert.deepEqual(targets.map((target) => target.id), ['missing', 'dims', 'retailer']);
});

test('batch target identification prefers catalog-final when available', () => {
  const repoRoot = makeRepo();
  writeJson(path.join(repoRoot, 'data', 'catalog-final.json'), {
    products: [
      {
        id: 'final-missing',
        cat: 'dishwasher',
        brand: 'Miele',
        model: 'G5000SCUBRWS',
        w: 598,
        h: 805,
        d: 570,
        unavailable: true
      },
      {
        id: 'final-done',
        cat: 'dishwasher',
        brand: 'Miele',
        model: 'G4203SCIACTIVE',
        w: 598,
        h: 805,
        d: 570,
        unavailable: true,
        evidence: { has_pdf_evidence: true }
      }
    ]
  });

  const targets = loadBatchTargets({ repoRoot, includeArchived: true, brand: 'Miele' });

  assert.deepEqual(targets.map((target) => target.id), ['final-missing']);
  assert.equal(targets[0].category, 'dishwasher');
});

test('batch target identification can include archived products for coverage expansion sweeps', () => {
  const repoRoot = makeRepo();
  const targets = loadBatchTargets({ repoRoot, includeArchived: true });

  assert.deepEqual(targets.map((target) => target.id), ['active-missing', 'archived-missing']);
});

test('batch target identification can filter by brand for coverage expansion sweeps', () => {
  const repoRoot = makeRepo();
  const fridgesPath = path.join(repoRoot, 'public', 'data', 'fridges.json');
  const fridges = JSON.parse(fs.readFileSync(fridgesPath, 'utf8'));
  fridges.products.push({
    id: 'archived-lg',
    cat: 'fridge',
    brand: 'LG',
    model: 'GB-335PL',
    w: 595,
    h: 1720,
    d: 677,
    unavailable: true
  });
  writeJson(fridgesPath, fridges);

  const targets = loadBatchTargets({ repoRoot, includeArchived: true, brand: 'LG' });

  assert.deepEqual(targets.map((target) => target.id), ['archived-lg']);
});

test('batch target identification can limit processing to explicit SKUs', () => {
  const repoRoot = makeRepo();
  const fridgesPath = path.join(repoRoot, 'public', 'data', 'fridges.json');
  const fridges = JSON.parse(fs.readFileSync(fridgesPath, 'utf8'));
  fridges.products.push({
    id: 'active-second',
    cat: 'fridge',
    brand: 'Fisher & Paykel',
    model: 'RF605QDVX2',
    w: 905,
    h: 1790,
    d: 688,
    unavailable: false
  });
  writeJson(fridgesPath, fridges);

  const targets = loadBatchTargets({ repoRoot, skus: ['RF605QDVX2'] });

  assert.deepEqual(targets.map((target) => target.sku), ['RF605QDVX2']);
});

test('batch target identification accepts short SKU filters for catalog models with title suffixes', () => {
  const repoRoot = makeRepo();
  const fridgesPath = path.join(repoRoot, 'public', 'data', 'fridges.json');
  const fridges = JSON.parse(fs.readFileSync(fridgesPath, 'utf8'));
  fridges.products.push({
    id: 'active-title-suffix',
    cat: 'fridge',
    brand: 'Fisher & Paykel',
    model: 'RF730QZUVX1 French Door 726L',
    w: 905,
    h: 1900,
    d: 748,
    unavailable: false
  });
  writeJson(fridgesPath, fridges);

  const targets = loadBatchTargets({ repoRoot, skus: ['RF730QZUVX1'] });

  assert.deepEqual(targets.map((target) => target.id), ['active-title-suffix']);
});

test('batch target identification does not match short incidental SKU tokens', () => {
  const repoRoot = makeRepo();
  const fridgesPath = path.join(repoRoot, 'public', 'data', 'fridges.json');
  const fridges = JSON.parse(fs.readFileSync(fridgesPath, 'utf8'));
  fridges.products.push({
    id: 'active-short-token',
    cat: 'fridge',
    brand: 'Haier',
    model: 'HRF520BHS French Door 520L',
    sku: 'RF',
    w: 790,
    h: 1725,
    d: 686,
    unavailable: false
  });
  writeJson(fridgesPath, fridges);

  const targets = loadBatchTargets({ repoRoot, skus: ['RF730QNUVX1'] });

  assert.deepEqual(targets.map((target) => target.id), []);
});

test('findPdfSourceUrl prefers manual-evidence source URLs before search APIs', async () => {
  const repoRoot = makeRepo();
  const target = loadBatchTargets({ repoRoot })[0];
  const result = await findPdfSourceUrl(target, {
    repoRoot,
    searchPdf: async () => {
      throw new Error('search should not run when manual source exists');
    }
  });

  assert.equal(result.sourceUrl, 'https://example.com/HRTF206-Spec.pdf');
  assert.equal(result.source, 'manual-evidence');
});

test('compareDimensions reports significant legacy-vs-PDF deltas', () => {
  const deltas = compareDimensions(
    { w: 550, h: 1410, d: 490 },
    strictData,
    { thresholdMm: 5 }
  );

  assert.deepEqual(deltas, [
    { axis: 'height', legacy: 1410, pdf: 1456, delta_mm: 46 },
    { axis: 'depth', legacy: 490, pdf: 562, delta_mm: 72 }
  ]);
});

test('runBatch continues after failures and writes an audit report', async () => {
  const repoRoot = makeRepo();
  const extraFailure = {
    id: 'active-failure',
    cat: 'fridge',
    brand: 'FailCo',
    model: 'FAIL1',
    w: 600,
    h: 1600,
    d: 600,
    unavailable: false
  };
  const fridgesPath = path.join(repoRoot, 'public', 'data', 'fridges.json');
  const fridges = JSON.parse(fs.readFileSync(fridgesPath, 'utf8'));
  fridges.products.push(extraFailure);
  writeJson(fridgesPath, fridges);
  const evidencePath = path.join(repoRoot, 'data', 'manual-evidence.json');
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  evidence.products['active-failure'] = {
    category: 'fridge',
    brand: 'FailCo',
    model: 'FAIL1',
    evidence: [
      {
        type: 'spec_sheet',
        status: 'candidate',
        source_url: 'https://example.com/FAIL1-Spec.pdf',
        verified_at: '2026-05-08'
      }
    ]
  };
  writeJson(evidencePath, evidence);

  const result = await runBatch({
    repoRoot,
    delayMs: 0,
    fetchPdfImpl: async (_url, destPath) => {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, '%PDF fixture');
      return { path: destPath, cached: false, bytes: 12 };
    },
    extractTextImpl: async () => ({ text: 'fixture text', pageCount: 1, info: {} }),
    parseTextImpl: async (_text, { target }) => {
      if (target.id === 'active-failure') throw new Error('PDF not found');
      return strictData;
    },
    validateStrictImpl: (candidate) => ({
      valid: candidate.sku === 'HRTF206',
      errors: [],
      requiresManualReview: false,
      data: candidate
    }),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 1);
  assert.equal(result.discrepancies.length, 2);
  assert.equal(fs.existsSync(path.join(repoRoot, 'reports', 'pdf-batch-results.md')), true);
  const report = fs.readFileSync(path.join(repoRoot, 'reports', 'pdf-batch-results.md'), 'utf8');
  assert.match(report, /Successful Runs/);
  assert.match(report, /Significant Discrepancies/);
  assert.match(report, /PDF not found/);
});

test('runBatch fails fast with a clear .env error when the OpenAI key is missing', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'generic-missing',
    brand: 'Generic',
    sku: 'GEN100',
    category: 'fridge',
    product: {
      id: 'generic-missing',
      cat: 'fridge',
      brand: 'Generic',
      model: 'GEN100',
      w: 600,
      h: 1600,
      d: 600,
      unavailable: false
    }
  };

  await assert.rejects(() => runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    env: {},
    logger: { log() {}, warn() {}, error() {} }
  }), /Missing API Key in \.env file/);
});

test('runBatch processes Fisher & Paykel targets with official QRG plus install guide without an API key', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'fp-rf500',
    brand: 'Fisher & Paykel',
    sku: 'RF500QNB1',
    category: 'fridge',
    product: {
      id: 'fp-rf500',
      cat: 'fridge',
      brand: 'Fisher & Paykel',
      model: 'RF500QNB1',
      w: 790,
      h: 1790,
      d: 692,
      unavailable: false
    }
  };
  const fetchedUrls = [];
  const fetchMaxBytes = [];

  const result = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    env: {},
    fisherPaykelOfficialFinder: async () => ({
      sourceUrl: 'https://www.fisherpaykel.com/qrg-rf500qnb1.pdf',
      source: 'fisher-paykel-official-quick_reference_guide',
      resourceType: 'quick_reference_guide',
      resources: [
        {
          url: 'https://www.fisherpaykel.com/qrg-rf500qnb1.pdf',
          type: 'quick_reference_guide',
          score: 100
        },
        {
          url: 'https://www.fisherpaykel.com/install-rf500qnb1.pdf',
          type: 'installation_manual',
          score: 70
        }
      ]
    }),
    fetchPdfImpl: async (url, _destPath, opts = {}) => {
      fetchedUrls.push(url);
      fetchMaxBytes.push(opts.maxBytes);
      return { path: url, cached: false, bytes: 12 };
    },
    extractTextImpl: async (url) => {
      if (String(url).includes('qrg')) {
        return {
          text: `
            QUICK REFERENCE GUIDE > RF500QNB1
            Refrigerator Freezer
            DIMENSIONS
            Height 1790 mm
            Width 790 mm
            Depth 692 mm
          `,
          pageCount: 1,
          info: {}
        };
      }
      return {
        text: `
          INSTALLATION GUIDE
          Refrigerator
          MIN. CLEARANCES
          RF500QNB1  RF500QNUB1
          MM MM
          G Rear 30 30
          H Sides*** 20 20
        `,
        pageCount: 1,
        info: {}
      };
    },
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.deepEqual(fetchedUrls, [
    'https://www.fisherpaykel.com/qrg-rf500qnb1.pdf',
    'https://www.fisherpaykel.com/install-rf500qnb1.pdf'
  ]);
  assert.ok(fetchMaxBytes.every((maxBytes) => maxBytes >= 30 * 1024 * 1024));
  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 0);
  const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'RF500QNB1.json'), 'utf8'));
  assert.deepEqual(raw.extracted.clearance_requirements, {
    top_mm: 0,
    left_mm: 20,
    right_mm: 20,
    rear_mm: 30
  });
});

test('runBatch processes Samsung targets with the official finder and layout-aware parser without an API key', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'samsung-ww11',
    brand: 'Samsung',
    sku: 'WW11CG604DLE',
    category: 'washing_machine',
    product: {
      id: 'samsung-ww11',
      cat: 'washing_machine',
      brand: 'Samsung',
      model: 'WW11CG604DLE',
      w: 600,
      h: 850,
      d: 600,
      unavailable: false
    }
  };

  const result = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    env: {},
    samsungOfficialFinder: async () => ({
      sourceUrl: 'https://org.downloadcenter.samsung.com/ww11.pdf',
      source: 'samsung-official-user_manual',
      resourceType: 'user_manual'
    }),
    fetchPdfImpl: async (url) => ({ path: url, cached: false, bytes: 12 }),
    extractTextImpl: async () => ({
      text: `
        Washing Machine
        User manual
        Installation requirements
        Alcove installation
        Minimum clearance for stable operation:
        Sides 25 mm
        Top 25 mm
        Rear 50 mm
        Front 550 mm
        Specification sheet
        Type Front loading washing machine
        Model name WW11CG******
        Dimensions
        A (Width) 600 mm
        B (Height) 850 mm
        C (Depth) 600 mm
      `,
      pageCount: 1,
      info: {}
    }),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 0);
  assert.equal(result.successes[0].source, 'samsung-official-user_manual');
  const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'WW11CG604DLE.json'), 'utf8'));
  assert.deepEqual(raw.extracted.dimensions, {
    height_mm: 850,
    width_mm: 600,
    depth_mm: 600,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(raw.extracted.clearance_requirements, {
    top_mm: 25,
    left_mm: 25,
    right_mm: 25,
    rear_mm: 50
  });
});

test('runBatch routes LG targets through the strict LG parser without an API key', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'lg-wv9',
    brand: 'LG',
    sku: 'WV9-1412W',
    category: 'washing_machine',
    product: {
      id: 'lg-wv9',
      cat: 'washing_machine',
      brand: 'LG',
      model: 'WV9-1412W',
      w: 600,
      h: 850,
      d: 610,
      unavailable: false
    }
  };
  writeJson(path.join(repoRoot, 'data', 'manual-evidence.json'), {
    schema_version: 1,
    products: {
      'lg-wv9': {
        category: 'washing_machine',
        brand: 'LG',
        model: 'WV9-1412W',
        evidence: [
          {
            type: 'user_manual',
            status: 'candidate',
            source_url: 'https://www.lg.com/au/support/product/lg-WV9-1412W'
          }
        ]
      }
    }
  });

  const result = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    env: {},
    fetchPdfImpl: async (url) => ({ path: url, cached: false, bytes: 12 }),
    extractTextImpl: async () => ({
      text: `
        LG Washing Machine
        INSTALLATION
        Specifications
        Dimension(mm)
        WV9-1410B / WV9-1410W
        WV9-1412W / WV9-1412B
        Model WV9-1410B / WV9-1410W WV9-1412W / WV9-1412B
        Product Weight 70 kg 73 kg
        W 600 D 560 D" 1100
        H 850 D' 620
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

  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 0);
  assert.equal(result.successes[0].source, 'manual-evidence');
  const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'WV9-1412W.json'), 'utf8'));
  assert.deepEqual(raw.extracted.dimensions, {
    height_mm: 850,
    width_mm: 600,
    depth_mm: 610,
    door_open_90_depth_mm: 1135
  });
  assert.deepEqual(raw.extracted.clearance_requirements, {
    top_mm: 0,
    left_mm: 20,
    right_mm: 20,
    rear_mm: 100
  });
});

test('runBatch can discover LG official manuals without manual-evidence URLs', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'lg-gb335pl',
    brand: 'LG',
    sku: 'GB-335PL',
    category: 'fridge',
    product: {
      id: 'lg-gb335pl',
      cat: 'fridge',
      brand: 'LG',
      model: 'GB-335PL',
      w: 595,
      h: 1720,
      d: 677,
      unavailable: true
    }
  };

  const result = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    env: {},
    lgOfficialFinder: async () => ({
      sourceUrl: 'https://gscs-b2c.lge.com/open/downloadFile?fileId=gb335pl',
      source: 'lg-official-support-manual',
      resourceType: 'Owner Manual'
    }),
    fetchPdfImpl: async (url) => ({ path: url, cached: false, bytes: 12 }),
    extractTextImpl: async () => ({
      text: `
        OWNER'S MANUAL
        FRIDGE & FREEZER
        GB-335WL / GB-335PL / GB-W335MBL / GB-335MBL
        Dimensions and Clearances
        Allow over 50 mm of clearance from each adjacent wall when installing the appliance.
        Size (mm)
        a b
        A 595 595
        B 1720/1860/2030 1720/1860/2030
        C 682 677
        D 615 610
        E 682 677
        F 1230 1225
        G 995 995
      `,
      pageCount: 1,
      info: {}
    }),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.successes.length, 1);
  assert.equal(result.successes[0].source, 'lg-official-support-manual');
  const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'GB-335PL.json'), 'utf8'));
  assert.deepEqual(raw.extracted.clearance_requirements, {
    top_mm: 0,
    left_mm: 50,
    right_mm: 50,
    rear_mm: 50
  });
});

test('runBatch falls back to trusted third-party PDFs for LG only after official lookup fails', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'lg-gb335pl',
    brand: 'LG',
    sku: 'GB-335PL',
    category: 'fridge',
    product: {
      id: 'lg-gb335pl',
      cat: 'fridge',
      brand: 'LG',
      model: 'GB-335PL',
      w: 595,
      h: 1720,
      d: 677,
      unavailable: true
    }
  };

  const result = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    env: {},
    lgOfficialFinder: async () => {
      throw new Error('official lookup failed');
    },
    thirdPartyFinder: async () => ({
      sourceUrl: 'https://commercial.appliancesonline.com.au/manuals/GB-335PL_Specifications_Sheet.pdf',
      source: 'third-party-fallback:commercial.appliancesonline.com.au'
    }),
    fetchPdfImpl: async (url) => ({ path: url, cached: false, bytes: 12 }),
    extractTextImpl: async () => ({
      text: `
        OWNER'S MANUAL
        FRIDGE & FREEZER
        GB-335WL / GB-335PL / GB-W335MBL / GB-335MBL
        Dimensions and Clearances
        Allow over 50 mm of clearance from each adjacent wall when installing the appliance.
        Size (mm)
        a b
        A 595 595
        B 1720/1860/2030 1720/1860/2030
        C 682 677
        D 615 610
        E 682 677
        F 1230 1225
        G 995 995
      `,
      pageCount: 1,
      info: {}
    }),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 0);
  assert.equal(result.successes[0].source, 'third-party-fallback:commercial.appliancesonline.com.au');
  const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'GB-335PL.json'), 'utf8'));
  assert.equal(raw.extracted.metadata.source_type, 'third-party-fallback:commercial.appliancesonline.com.au');
});

test('runBatch processes Westinghouse targets with the official finder and parser without an API key', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'west-wbb3400ah',
    brand: 'Westinghouse',
    sku: 'WBB3400AH',
    category: 'fridge',
    product: {
      id: 'west-wbb3400ah',
      cat: 'fridge',
      brand: 'Westinghouse',
      model: 'WBB3400AH',
      w: 598,
      h: 1645,
      d: 650,
      unavailable: true
    }
  };

  let finderOptions = null;
  const result = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    env: {},
    westinghouseOfficialFinder: async (_target, options) => {
      finderOptions = options;
      return ({
      sourceUrl: 'https://www.westinghouse.com.au/documenthandler.ashx?assetid=511925',
      source: 'westinghouse-official-dimension_sheet',
      resourceType: 'dimension_sheet'
      });
    },
    fetchPdfImpl: async (url) => ({ path: url, cached: false, bytes: 12 }),
    extractTextImpl: async () => ({
      text: `
        Dimension and installation guide
        Dimensions Product Height (H) Product Width (W) Product Depth (D) Product Depth (D2)
        WBB3700AH/ WH 1755 598 650 1199
        WBB3400AH/ WH 1645 598 650 1199
        Airspace Side - both Top Behind
        WBB3700AH/ WH 30 50 50
        WBB3400AH/ WH 30 50 50
      `,
      pageCount: 1,
      info: {}
    }),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 0);
  assert.notEqual(finderOptions?.knownOnly, true);
  assert.equal(result.successes[0].source, 'westinghouse-official-dimension_sheet');
  const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'WBB3400AH.json'), 'utf8'));
  assert.deepEqual(raw.extracted.dimensions, {
    height_mm: 1645,
    width_mm: 598,
    depth_mm: 650,
    door_open_90_depth_mm: 1199
  });
});

test('runBatch processes Electrolux targets with the official finder and parser without an API key', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'electrolux-ebe4507sc',
    brand: 'Electrolux',
    sku: 'EBE4507SC',
    category: 'fridge',
    product: {
      id: 'electrolux-ebe4507sc',
      cat: 'fridge',
      brand: 'Electrolux',
      model: 'EBE4507SC',
      w: 699,
      h: 1725,
      d: 773,
      unavailable: true
    }
  };

  const result = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    env: {},
    electroluxOfficialFinder: async () => ({
      sourceUrl: 'https://resource.electrolux.com.au/Public/File/?Id=51297',
      source: 'electrolux-official-known-dimension_sheet',
      resourceType: 'dimension_sheet'
    }),
    fetchPdfImpl: async (url, _path, options = {}) => {
      assert.equal(options.userAgent, 'curl/8.7.1');
      return { path: url, cached: false, bytes: 12 };
    },
    extractTextImpl: async () => ({
      text: `
        Refrigeration Dimension Guide
        Models:
        EBE4507BC, EBE4507SC
        Dimensions Product Height Product Width Product Depth Product Depth (Door Open)
        EBE4507BC 1725 699 773 1360
        EBE4507SC 1725 699 773 1360
        Airspace Side - both Top Behind
        EBE4507BC 30 50 50
        EBE4507SC 30 50 50
      `,
      pageCount: 1,
      info: {}
    }),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 0);
  assert.equal(result.successes[0].source, 'electrolux-official-known-dimension_sheet');
  const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'EBE4507SC.json'), 'utf8'));
  assert.deepEqual(raw.extracted.clearance_requirements, {
    top_mm: 50,
    left_mm: 30,
    right_mm: 30,
    rear_mm: 50
  });
});

test('runBatch processes Kelvinator targets through the exact group factsheet endpoint', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'fridge-kbm5302ac',
    brand: 'KELVINATOR',
    sku: 'KBM5302AC',
    category: 'fridge',
    product: {
      id: 'fridge-kbm5302ac',
      cat: 'fridge',
      brand: 'KELVINATOR',
      model: 'KBM5302AC',
      w: 1725,
      h: 796,
      d: 723,
      unavailable: true
    }
  };

  const result = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    env: {},
    kelvinatorOfficialFinder: async () => ({
      sourceUrl: 'https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=KBM5302AC&brand=Kelvinator',
      source: 'kelvinator-official-fact_sheet',
      resourceType: 'fact_sheet',
      verifiedAlias: 'KBM5302AC'
    }),
    fetchPdfImpl: async (url, _path, options = {}) => {
      assert.equal(typeof options.fetchImpl, 'function');
      return { path: url, cached: false, bytes: 12 };
    },
    extractTextImpl: async () => ({
      text: `
        PRODUCT PROFILE DIMENSIONS
        Total height (mm) 1718
        Cabinet height (mm) 1705
        Total width (mm) 796
        Cabinet width (mm) 790
        Total depth (mm) 727
        Cabinet depth (mm) 641
      `,
      pageCount: 1,
      info: {}
    }),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 0);
  assert.equal(result.successes[0].source, 'kelvinator-official-fact_sheet');
  const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'KBM5302AC.json'), 'utf8'));
  assert.deepEqual(raw.extracted.dimensions, {
    height_mm: 1718,
    width_mm: 796,
    depth_mm: 727,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(raw.extracted.clearance_requirements, {
    top_mm: 0,
    left_mm: 0,
    right_mm: 0,
    rear_mm: 0
  });
  assert.equal(raw.extracted.metadata.verified_alias, 'KBM5302AC');
  assert.equal(raw.extracted.metadata.source_type, 'kelvinator-official-fact_sheet');

  const rerun = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    env: {},
    kelvinatorOfficialFinder: async () => {
      throw new Error('saved exact evidence should be preferred');
    },
    fetchPdfImpl: async (url) => ({ path: url, cached: false, bytes: 12 }),
    extractTextImpl: async () => ({
      text: 'Total height (mm) 1718\nTotal width (mm) 796\nTotal depth (mm) 727',
      pageCount: 1,
      info: {}
    }),
    logger: { log() {}, warn() {}, error() {} }
  });
  assert.equal(rerun.successes.length, 1);
  assert.equal(rerun.failures.length, 0);
  assert.equal(rerun.successes[0].source, 'kelvinator-official-fact_sheet');
});

test('runBatch processes Hisense targets with the official finder and parser without an API key', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'hisense-hrbm418s',
    brand: 'Hisense',
    sku: 'HRBM418S',
    category: 'fridge',
    product: {
      id: 'hisense-hrbm418s',
      cat: 'fridge',
      brand: 'Hisense',
      model: 'HRBM418S',
      w: 704,
      h: 1720,
      d: 694,
      unavailable: true
    }
  };

  const result = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    env: {},
    hisenseOfficialFinder: async () => ({
      sourceUrl: 'https://dtc-aus-api.hisense.com/medias/HRBM418S-Spec.pdf',
      source: 'hisense-official-specification_doc',
      resourceType: 'specification_doc'
    }),
    fetchPdfImpl: async (url) => ({ path: url, cached: false, bytes: 12 }),
    extractTextImpl: async () => ({
      text: `
        Model Number HRBM418S
        Dimensions (Net) (W X H X D) 704x1720x694 mm
        Cabinet clearance [Sides / Back / Top] 50 / 50 / 100 mm
      `,
      pageCount: 1,
      info: {}
    }),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 0);
  assert.equal(result.successes[0].source, 'hisense-official-specification_doc');
  const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'HRBM418S.json'), 'utf8'));
  assert.deepEqual(raw.extracted.clearance_requirements, {
    top_mm: 100,
    left_mm: 50,
    right_mm: 50,
    rear_mm: 50
  });
});

test('runBatch processes CHIQ targets with the official finder and parser without an API key', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'chiq-cbc064bg',
    brand: 'CHIQ',
    sku: 'CBC064BG',
    category: 'fridge',
    product: {
      id: 'chiq-cbc064bg',
      cat: 'fridge',
      brand: 'CHIQ',
      model: 'CBC064BG',
      w: 470,
      h: 635,
      d: 439,
      unavailable: true
    }
  };

  const result = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    env: {},
    chiqOfficialFinder: async () => ({
      sourceUrl: 'https://chiq.com.au/cdn/shop/files/CBC064BG_SPEC.pdf',
      source: 'chiq-official-spec_sheet',
      resourceType: 'spec_sheet'
    }),
    fetchPdfImpl: async (url) => ({ path: url, cached: false, bytes: 12 }),
    extractTextImpl: async () => ({
      text: `
        CBC064BG
        Product Dimensions
        (WHD)mm
        470 x 635 x 439
        Ventilation Requirements
        5 cm Left & Right sides
        5 cm Back
      `,
      pageCount: 1,
      info: {}
    }),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 0);
  assert.equal(result.successes[0].source, 'chiq-official-spec_sheet');
  const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'CBC064BG.json'), 'utf8'));
  assert.deepEqual(raw.extracted.clearance_requirements, {
    top_mm: 0,
    left_mm: 50,
    right_mm: 50,
    rear_mm: 50
  });
});

test('runBatch processes Artusi dishwasher targets with official finder resources without an API key', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'artusi-adw5009x',
    brand: 'Artusi',
    sku: 'ADW5009X',
    category: 'dishwasher',
    product: {
      id: 'artusi-adw5009x',
      cat: 'dishwasher',
      brand: 'Artusi',
      model: 'ADW5009X',
      w: 598,
      h: 845,
      d: 600,
      unavailable: true
    }
  };

  const result = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    env: {},
    artusiOfficialFinder: async () => ({
      sourceUrl: 'https://artusi.com.au/wp-content/uploads/2025/11/PF_ADW5009_Artusi-1.pdf',
      source: 'artusi-official-specification_sheet',
      resourceType: 'specification_sheet',
      resources: [
        {
          sourceUrl: 'https://artusi.com.au/wp-content/uploads/2025/11/PF_ADW5009_Artusi-1.pdf',
          source: 'artusi-official-specification_sheet',
          resourceType: 'specification_sheet',
          score: 100
        },
        {
          sourceUrl: 'https://artusi.com.au/wp-content/uploads/2025/11/ADW5009-User-Manual.pdf',
          source: 'artusi-official-user_manual',
          resourceType: 'user_manual',
          score: 80
        }
      ]
    }),
    fetchPdfImpl: async (url) => ({ path: url, cached: false, bytes: 12 }),
    extractTextImpl: async () => ({
      text: `
        ARTUSI ADW5009X ADW5009B ADW5009W ADW5009MB
        Positioning The Appliance
        The back should rest against the wall behind it, and the sides, along the adjacent cabinets or walls.
        The height of the dishwasher, 845 mm, has been designed in order to allow the machine to be fitted between existing cabinets of the same height.
        TECHNICAL INFORMATION
        Height (H)
        Width (W)
        Depth (D1)
        Depth (D2)
        845mm
        598mm
        600mm (with the door closed)
        1175mm (with the door opened 90°)
      `,
      pageCount: 1,
      info: {}
    }),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 0);
  assert.equal(result.successes[0].source, 'artusi-official-specification_sheet+artusi-official-user_manual');
  const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'ADW5009X.json'), 'utf8'));
  assert.deepEqual(raw.extracted.clearance_requirements, {
    top_mm: 0,
    left_mm: 0,
    right_mm: 0,
    rear_mm: 0
  });
});

test('runBatch processes Esatto targets with the official finder and parser without an API key', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'esatto-ebf124w',
    brand: 'Esatto',
    sku: 'EBF124W',
    category: 'fridge',
    product: {
      id: 'esatto-ebf124w',
      cat: 'fridge',
      brand: 'Esatto',
      model: 'EBF124W',
      w: 501,
      h: 858,
      d: 540,
      unavailable: true
    }
  };

  const result = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    env: {},
    esattoOfficialFinder: async () => ({
      sourceUrl: 'https://esatto.house/s/EBF124W_UserManual.pdf',
      source: 'esatto-official-user_manual'
    }),
    fetchPdfImpl: async (url) => ({ path: url, cached: false, bytes: 12 }),
    extractTextImpl: async () => ({
      text: `
        Model: EBF124W
        Clearances: Allow at least 10cm clear space at the back, 10cm at the sides of the unit and 20cm between the top and any surface above.
        Product Dimensions: W 501 × D 540 × H 858 (mm)
      `,
      pageCount: 1,
      info: {}
    }),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 0);
  assert.equal(result.successes[0].source, 'esatto-official-user_manual');
  const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'EBF124W.json'), 'utf8'));
  assert.equal(raw.extracted.metadata.source_type, 'esatto-official-user_manual');
  assert.deepEqual(raw.extracted.clearance_requirements, {
    top_mm: 200,
    left_mm: 100,
    right_mm: 100,
    rear_mm: 100
  });
});

test('runBatch processes Midea targets with official spec plus manual documents without an API key', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'dishwasher-mdw6099b15bdx',
    brand: 'Midea',
    sku: 'MDW6099B15BDX',
    category: 'dishwasher',
    product: {
      id: 'dishwasher-mdw6099b15bdx',
      cat: 'dishwasher',
      brand: 'Midea',
      model: 'MDW6099B15BDX',
      w: 598,
      h: 815,
      d: 570,
      unavailable: true
    }
  };

  const result = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    mideaOfficialFinder: async () => ({
      sourceUrl: 'https://www.midea.com/spec-mdw6099b15bdx.pdf',
      source: 'midea-official-specification_sheet',
      resourceType: 'specification_sheet',
      resources: [
        {
          sourceUrl: 'https://www.midea.com/spec-mdw6099b15bdx.pdf',
          source: 'midea-official-specification_sheet',
          resourceType: 'specification_sheet',
          score: 100
        },
        {
          sourceUrl: 'https://www.midea.com/manual-mdw6099b15bdx.pdf',
          source: 'midea-official-user_manual',
          resourceType: 'user_manual',
          score: 90
        }
      ]
    }),
    fetchPdfImpl: async (url) => ({ path: url, cached: false, bytes: 12 }),
    extractTextImpl: async (filePath) => ({
      text: filePath.includes('spec')
        ? 'MDW6099B15BDX Product Dimensions W x D x H 598 x 570 x 815mm 1175mm'
        : 'Selecting the best location for the dishwasher Less than 5 mm between the top of dishwasher and cabinet. 90 ° 90 ° 580mm 820mm Space between cabinet bottom and floor 600 mm(for 60cm model)',
      pageCount: 1,
      info: {}
    }),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 0);
  assert.match(result.successes[0].source, /midea-official-specification_sheet/);
  const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'MDW6099B15BDX.json'), 'utf8'));
  assert.equal(raw.extracted.dimensions.height_mm, 815);
  assert.equal(raw.extracted.clearance_requirements.rear_mm, 10);
});

test('runBatch processes Euromaid official specification sheets without an API key', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'fridge-etm221w',
    brand: 'Euromaid',
    sku: 'ETM221W',
    category: 'fridge',
    product: {
      id: 'fridge-etm221w',
      cat: 'fridge',
      brand: 'Euromaid',
      model: 'ETM221W',
      w: 550,
      h: 1430,
      d: 600,
      unavailable: true
    }
  };

  const result = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    env: {},
    euromaidOfficialFinder: async () => ({
      sourceUrl: 'https://www.euromaid.com/sites/g/files/emiian466/files/2022-01/Spec%20Sheet%20-%20198%20Litre%20Top%20Mount%20White%20-%20ETM221W.pdf',
      source: 'euromaid-official-specification_sheet',
      resourceType: 'specification_sheet',
      resources: [
        {
          sourceUrl: 'https://www.euromaid.com/sites/g/files/emiian466/files/2022-01/Spec%20Sheet%20-%20198%20Litre%20Top%20Mount%20White%20-%20ETM221W.pdf',
          source: 'euromaid-official-specification_sheet',
          resourceType: 'specification_sheet',
          score: 100
        }
      ]
    }),
    fetchPdfImpl: async (url) => ({ path: url, cached: false, bytes: 12 }),
    extractTextImpl: async () => ({
      text: `
        Euromaid ETM221W Top Mount Fridge
        DIMENSIONS (H x W x D)
        Product (mm) 1430 x 550 x 600
        Min Clearance* (mm) 1480 x 650 x 650
      `,
      pageCount: 1,
      info: {}
    }),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 0);
  assert.equal(result.successes[0].source, 'euromaid-official-specification_sheet');
  const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'ETM221W.json'), 'utf8'));
  assert.deepEqual(raw.extracted.clearance_requirements, {
    top_mm: 50,
    left_mm: 50,
    right_mm: 50,
    rear_mm: 50
  });
});

test('runBatch processes TECO official user manuals without an API key', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'fridge-tff334wntah',
    brand: 'TECO',
    sku: 'TFF334WNTAH',
    category: 'fridge',
    product: {
      id: 'fridge-tff334wntah',
      cat: 'fridge',
      brand: 'TECO',
      model: 'TFF334WNTAH',
      w: 600,
      h: 1700,
      d: 665,
      unavailable: true
    }
  };

  const result = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    env: {},
    tecoOfficialFinder: async () => ({
      sourceUrl: 'https://appliances.teco.com.au/wp-content/uploads/sites/2/2024/07/TFF334WNTAH-User-Manual.pdf',
      source: 'teco-official-user_manual',
      resourceType: 'user_manual',
      resources: [
        {
          sourceUrl: 'https://appliances.teco.com.au/wp-content/uploads/sites/2/2024/07/TFF334WNTAH-User-Manual.pdf',
          source: 'teco-official-user_manual',
          resourceType: 'user_manual',
          score: 100
        }
      ]
    }),
    fetchPdfImpl: async (url) => ({ path: url, cached: false, bytes: 12 }),
    extractTextImpl: async () => ({
      text: `
        TECO REFRIGERATOR/ FREEZER User Manual
        Model:
        TFF334WNTAH
        TFF334SNTAH
        Leave a minimum of 50mm between each side of the appliance and the wall.
        The top of the appliance should have a minimum of 100mm clearance.
        This allows for proper air circulation.
        SPECIFICATIONS
        TFF334WNTAH
        Width 600
        Dimension Depth 665
        (mm)
        Height 1700
      `,
      pageCount: 1,
      info: {}
    }),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 0);
  assert.equal(result.successes[0].source, 'teco-official-user_manual');
  const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'TFF334WNTAH.json'), 'utf8'));
  assert.deepEqual(raw.extracted.clearance_requirements, {
    top_mm: 100,
    left_mm: 50,
    right_mm: 50,
    rear_mm: 50
  });
});

test('runBatch processes Miele manual-evidence spec sheets with the strict Miele parser without an API key', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'dishwasher-g5000',
    brand: 'Miele',
    sku: 'G 5000',
    category: 'dishwasher',
    product: {
      id: 'dishwasher-g5000',
      cat: 'dishwasher',
      brand: 'Miele',
      model: 'G 5000',
      w: 598,
      h: 805,
      d: 570,
      unavailable: true
    }
  };
  writeJson(path.join(repoRoot, 'data', 'manual-evidence.json'), {
    schema_version: 1,
    products: {
      'ao-g5000': {
        category: 'dishwasher',
        brand: 'Miele',
        model: 'G5000BKBRWS',
        evidence: [
          {
            type: 'spec_sheet',
            status: 'candidate',
            source_url: 'https://www.appliancesonline.com.au/G5000BKBRWS_Miele_Specifications_Sheet.pdf'
          }
        ]
      }
    }
  });

  const result = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    env: {},
    fetchPdfImpl: async (url) => ({ path: url, cached: false, bytes: 12 }),
    extractTextImpl: async () => ({
      text: `
        Miele G 5000 SC BRWS
        Technical data
        Niche width in mm 600
        Niche height in mm 805
        Niche depth in mm 570
        Appliance width in mm 598
        Appliance height in mm 805
        Appliance depth in mm 570
        Depth with door open in cm 116.5
      `,
      pageCount: 1,
      info: {}
    }),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 0);
  assert.equal(result.successes[0].source, 'manual-evidence:miele-family-spec_sheet');
  const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'G-5000.json'), 'utf8'));
  assert.equal(raw.extracted.metadata.verified_alias, 'G5000SCBRWS');
  assert.deepEqual(raw.extracted.clearance_requirements, {
    top_mm: 0,
    left_mm: 1,
    right_mm: 1,
    rear_mm: 0
  });
});

test('runBatch processes Miele official Product Sheets with verified aliases without an API key', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'dishwasher-g7130',
    brand: 'Miele',
    sku: 'G 7130 SCU',
    category: 'dishwasher',
    product: {
      id: 'dishwasher-g7130',
      cat: 'dishwasher',
      brand: 'Miele',
      model: 'G 7130 SCU',
      w: 598,
      h: 805,
      d: 570,
      unavailable: true
    }
  };

  const result = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    env: {},
    mielePdfFinder: async () => ({
      sourceUrl: 'https://www.miele.com.au/media/ex/au/specsheets/12531620.pdf',
      source: 'miele-official-product-sheet',
      verifiedAlias: 'G7130SCU'
    }),
    fetchPdfImpl: async (url) => ({ path: url, cached: false, bytes: 12 }),
    extractTextImpl: async () => ({
      text: `
        Product Sheet
        Technical data
        Niche width minimal in mm 600
        Niche width max in mm 600
        Niche height minimal in mm 805
        Niche height maximal in mm 870
        Niche depth in mm 570
        Appliance width in mm 598
        Appliance height in mm 805
        Appliance depth in mm 570
        Depth with door open in cm 116.5
      `,
      pageCount: 1,
      info: {}
    }),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 0);
  assert.equal(result.successes[0].source, 'miele-official-product-sheet');
  const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'G-7130-SCU.json'), 'utf8'));
  assert.equal(raw.extracted.metadata.verified_alias, 'G7130SCU');
  assert.deepEqual(raw.extracted.clearance_requirements, {
    top_mm: 0,
    left_mm: 1,
    right_mm: 1,
    rear_mm: 0
  });
});

test('runBatch processes Kogan official washer manuals through the strict Kogan parser without an API key', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'washing-machine-kamfwash90a',
    brand: 'Kogan',
    sku: 'KAMFWASH90A',
    category: 'washing_machine',
    product: {
      id: 'washing-machine-kamfwash90a',
      cat: 'washing_machine',
      brand: 'Kogan',
      model: 'KAMFWASH90A',
      w: 595,
      h: 850,
      d: 535,
      unavailable: true
    }
  };

  const result = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    env: {},
    koganOfficialFinder: async () => ({
      sourceUrl: 'https://assets.kogan.com/files/usermanuals/KAMFWASH90A_UG.pdf',
      source: 'kogan-official-user_manual',
      resourceType: 'user_manual'
    }),
    fetchPdfImpl: async (url) => ({ path: url, cached: false, bytes: 12 }),
    extractTextImpl: async () => ({
      text: `
        9KG FRONT LOAD BLDC INVERTER WASHING MACHINE
        KAMFWASH90A
        Placement
        Ensure there is 20mm of space on the back and sides of the washing machine.
        Specifications
        Dimension 595 x 535 x 850mm
      `,
      pageCount: 1,
      info: {}
    }),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 0);
  assert.equal(result.successes[0].source, 'kogan-official-user_manual');
  const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'KAMFWASH90A.json'), 'utf8'));
  assert.deepEqual(raw.extracted.clearance_requirements, {
    top_mm: 0,
    left_mm: 20,
    right_mm: 20,
    rear_mm: 20
  });
});

test('runBatch processes Liebherr retailer-hosted spec plus installation documents without an API key', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'fridge-liebherr-cnef4315',
    brand: 'Liebherr',
    sku: 'CNef 4315',
    category: 'fridge',
    product: {
      id: 'fridge-liebherr-cnef4315',
      cat: 'fridge',
      brand: 'Liebherr',
      model: 'CNef 4315',
      w: 600,
      h: 1850,
      d: 665,
      unavailable: true
    }
  };
  writeJson(path.join(repoRoot, 'data', 'manual-evidence.json'), {
    schema_version: 1,
    products: {
      'fridge-liebherr-cnef4315': {
        category: 'fridge',
        brand: 'Liebherr',
        model: 'CNef 4315',
        evidence: [
          {
            type: 'spec_sheet',
            status: 'candidate',
            source_url: 'https://www.appliancesonline.com.au/public/manuals/CNEF4315-Liebherr-Specifications-Sheet.pdf'
          }
        ]
      }
    }
  });
  let officialFinderCalled = false;

  const result = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    env: {},
    liebherrOfficialFinder: async () => {
      officialFinderCalled = true;
      return {
        sourceUrl: 'https://www.appliancesonline.com.au/public/manuals/CNEF4315-Liebherr-Specifications-Sheet.pdf',
        source: 'liebherr-retailer-specification_sheet',
        resourceType: 'specification_sheet',
        resources: [
          {
            sourceUrl: 'https://www.appliancesonline.com.au/public/manuals/CNEF4315-Liebherr-Specifications-Sheet.pdf',
            source: 'liebherr-retailer-specification_sheet',
            resourceType: 'specification_sheet',
            score: 100
          },
          {
            sourceUrl: 'https://www.appliancesonline.com.au/public/manuals/CNEF4315-Liebherr-User-Manual.pdf',
            source: 'liebherr-retailer-user_manual',
            resourceType: 'user_manual',
            score: 70
          }
        ]
      };
    },
    fetchPdfImpl: async (url) => ({ path: url, cached: false, bytes: 12 }),
    extractTextImpl: async (filePath) => ({
      text: filePath.includes('Specifications')
        ? `
          Liebherr CNef 4315 freestanding fridge freezer
          Product dimensions (H/W/D) cm
          185 / 60 / 66.5
        `
        : `
          Liebherr CNef 4315
          Ventilation requirements
          The depth of the ventilation shaft must be at least 50 mm.
        `,
      pageCount: 1,
      info: {}
    }),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(officialFinderCalled, true);
  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 0);
  assert.match(result.successes[0].source, /liebherr-retailer-specification_sheet/);
  const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'CNef-4315.json'), 'utf8'));
  assert.deepEqual(raw.extracted.clearance_requirements, {
    top_mm: 0,
    left_mm: 0,
    right_mm: 0,
    rear_mm: 50
  });
});

test('runBatch preserves Samsung verified_alias metadata from manual evidence', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'samsung-srf7300bss',
    brand: 'Samsung',
    sku: 'SRF7300BSS',
    category: 'fridge',
    product: {
      id: 'samsung-srf7300bss',
      cat: 'fridge',
      brand: 'Samsung',
      model: 'SRF7300BSS',
      w: 912,
      h: 1779,
      d: 723,
      unavailable: false
    }
  };
  writeJson(path.join(repoRoot, 'data', 'manual-evidence.json'), {
    schema_version: 1,
    products: {
      'samsung-srf7300bss': {
        category: 'fridge',
        brand: 'Samsung',
        model: 'SRF7300BSS',
        verified_alias: 'RF59A7010B1/SA',
        source_url: 'https://downloadcenter.samsung.com/content/UM/202604/OID38284-04_T-TYPE_RF7000A_EN_260417.pdf',
        type: 'user_manual',
        status: 'candidate',
        evidence: [
          {
            type: 'user_manual',
            status: 'candidate',
            source_url: 'https://downloadcenter.samsung.com/content/UM/202604/OID38284-04_T-TYPE_RF7000A_EN_260417.pdf',
            verified_alias: 'RF59A7010B1/SA'
          }
        ]
      }
    }
  });

  const result = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    env: {},
    samsungOfficialFinder: async () => {
      throw new Error('official finder should be bypassed');
    },
    fetchPdfImpl: async (url) => ({ path: url, cached: false, bytes: 12 }),
    extractTextImpl: async () => ({
      text: `
        Refrigerator
        User manual
        STEP 1 Select a site
        Clearance
        Depth “A” 723 mm
        Width “B” 912 mm
        Height “C” 1748 mm
        Overall Height “D” 1779 mm
        01 more than 50 mm
        03 1472 mm
      `,
      pageCount: 1,
      info: {}
    }),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 0);
  const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'SRF7300BSS.json'), 'utf8'));
  assert.equal(raw.extracted.metadata.verified_alias, 'RF59A7010B1/SA');
});

test('runBatch lets Fisher & Paykel manual-evidence spec sheets rescue models without PDPs', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'ao-1053',
    brand: 'Fisher & Paykel',
    sku: 'E450LXFD',
    category: 'fridge',
    product: {
      id: 'ao-1053',
      cat: 'fridge',
      brand: 'Fisher & Paykel',
      model: 'E450LXFD',
      w: 635,
      h: 1695,
      d: 695,
      unavailable: false
    }
  };
  writeJson(path.join(repoRoot, 'data', 'manual-evidence.json'), {
    schema_version: 1,
    products: {
      'ao-1053': {
        category: 'fridge',
        brand: 'Fisher & Paykel',
        model: 'E450LXFD',
        source_url: 'https://commercial.appliancesonline.com.au/public/manuals/Fisher---Paykel-E450LXFD1-451L-Upright-Fridge-Specifications-Sheet.pdf',
        type: 'spec_sheet',
        status: 'candidate',
        product: target.product,
        evidence: [
          {
            type: 'spec_sheet',
            status: 'candidate',
            source_url: 'https://commercial.appliancesonline.com.au/public/manuals/Fisher---Paykel-E450LXFD1-451L-Upright-Fridge-Specifications-Sheet.pdf'
          }
        ]
      }
    }
  });

  const fetchedUrls = [];
  const result = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    env: {},
    fisherPaykelOfficialFinder: async () => {
      throw new Error('product_page_not_found');
    },
    fetchPdfImpl: async (url) => {
      fetchedUrls.push(url);
      return { path: url, cached: false, bytes: 12 };
    },
    extractTextImpl: async () => ({
      text: `
        SPEC SHEET > E450LXFD1
        Freestanding Refrigerator
        DIMENSIONS
        Depth 695mm
        Height 1695mm
        Width 635mm
        Minimum air clearance - at rear 30mm
        Minimum air clearance - each side 20mm
        Minimum air clearance - on top 50mm
      `,
      pageCount: 1,
      info: {}
    }),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.deepEqual(fetchedUrls, [
    'https://commercial.appliancesonline.com.au/public/manuals/Fisher---Paykel-E450LXFD1-451L-Upright-Fridge-Specifications-Sheet.pdf'
  ]);
  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 0);
  const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'E450LXFD.json'), 'utf8'));
  assert.deepEqual(raw.extracted.clearance_requirements, {
    top_mm: 50,
    left_mm: 20,
    right_mm: 20,
    rear_mm: 30
  });
});

test('runBatch falls back to trusted third-party PDFs for Fisher & Paykel after official resources fail', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'ao-1053',
    brand: 'Fisher & Paykel',
    sku: 'E450LXFD',
    category: 'fridge',
    product: {
      id: 'ao-1053',
      cat: 'fridge',
      brand: 'Fisher & Paykel',
      model: 'E450LXFD',
      w: 635,
      h: 1695,
      d: 695,
      unavailable: false
    }
  };
  writeJson(path.join(repoRoot, 'data', 'manual-evidence.json'), {
    schema_version: 1,
    products: {}
  });

  const result = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    env: {},
    fisherPaykelOfficialFinder: async () => {
      throw new Error('product_page_not_found');
    },
    thirdPartyFinder: async () => ({
      sourceUrl: 'https://commercial.appliancesonline.com.au/public/manuals/Fisher---Paykel-E450LXFD1-451L-Upright-Fridge-Specifications-Sheet.pdf',
      source: 'third-party-fallback:commercial.appliancesonline.com.au'
    }),
    fetchPdfImpl: async (url) => ({ path: url, cached: false, bytes: 12 }),
    extractTextImpl: async () => ({
      text: `
        SPEC SHEET > E450LXFD1
        Freestanding Refrigerator
        DIMENSIONS
        Depth 695mm
        Height 1695mm
        Width 635mm
        Minimum air clearance - at rear 30mm
        Minimum air clearance - each side 20mm
        Minimum air clearance - on top 50mm
      `,
      pageCount: 1,
      info: {}
    }),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 0);
  assert.equal(result.successes[0].source, 'third-party-fallback:commercial.appliancesonline.com.au');
});

test('runBatch uses generic third-party fallback only when PDF text contains the exact SKU', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'midea-mxyz123',
    brand: 'Midea',
    sku: 'MXYZ123',
    category: 'dishwasher',
    product: {
      id: 'midea-mxyz123',
      cat: 'dishwasher',
      brand: 'Midea',
      model: 'MXYZ123',
      w: 598,
      h: 845,
      d: 600,
      unavailable: true
    }
  };

  const result = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    searchPdf: async () => {
      throw new Error('official search failed');
    },
    thirdPartyFinder: async () => ({
      sourceUrl: 'https://commercial.appliancesonline.com.au/manuals/MXYZ123_Midea_Specifications_Sheet.pdf',
      source: 'third-party-fallback:commercial.appliancesonline.com.au'
    }),
    fetchPdfImpl: async (url) => ({ path: url, cached: false, bytes: 12 }),
    extractTextImpl: async () => ({
      text: 'Midea dishwasher model MXYZ123 installation dimensions and clearance.',
      pageCount: 1,
      info: {}
    }),
    parseTextImpl: async (_text, { sourceUrl }) => ({
      brand: 'Midea',
      sku: 'MXYZ123',
      category: 'DISHWASHER',
      dimensions: {
        height_mm: 845,
        width_mm: 598,
        depth_mm: 600,
        door_open_90_depth_mm: null
      },
      clearance_requirements: {
        top_mm: 0,
        left_mm: 5,
        right_mm: 5,
        rear_mm: 10
      },
      flags: {
        requires_plumbing: false,
        ventilation_required: true,
        reversible_door: null
      },
      metadata: {
        source_pdf_url: sourceUrl,
        extraction_date: '2026-05-16T00:00:00.000Z',
        confidence_score: 0.91
      }
    }),
    validateStrictImpl: (candidate) => ({
      valid: true,
      errors: [],
      requiresManualReview: false,
      data: candidate
    }),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 0);
  assert.equal(result.successes[0].source, 'third-party-fallback:commercial.appliancesonline.com.au');
  const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'MXYZ123.json'), 'utf8'));
  assert.equal(raw.extracted.metadata.source_type, 'third-party-fallback:commercial.appliancesonline.com.au');
});

test('runBatch rejects generic third-party fallback before parsing when exact SKU is absent', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'midea-mxyz123',
    brand: 'Midea',
    sku: 'MXYZ123',
    category: 'dishwasher',
    product: {
      id: 'midea-mxyz123',
      cat: 'dishwasher',
      brand: 'Midea',
      model: 'MXYZ123',
      w: 598,
      h: 845,
      d: 600,
      unavailable: true
    }
  };
  let parseCalls = 0;

  const result = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    searchPdf: async () => {
      throw new Error('official search failed');
    },
    thirdPartyFinder: async () => ({
      sourceUrl: 'https://commercial.appliancesonline.com.au/manuals/OTHER_Midea_Specifications_Sheet.pdf',
      source: 'third-party-fallback:commercial.appliancesonline.com.au'
    }),
    fetchPdfImpl: async (url) => ({ path: url, cached: false, bytes: 12 }),
    extractTextImpl: async () => ({
      text: 'Midea dishwasher model OTHER installation dimensions and clearance.',
      pageCount: 1,
      info: {}
    }),
    parseTextImpl: async () => {
      parseCalls += 1;
      return strictData;
    },
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(parseCalls, 0);
  assert.equal(result.successes.length, 0);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].reason, /does not contain exact SKU MXYZ123/);
});

test('runBatch processes only explicit SKUs when skus is provided', async () => {
  const repoRoot = makeRepo();
  const fridgesPath = path.join(repoRoot, 'public', 'data', 'fridges.json');
  const fridges = JSON.parse(fs.readFileSync(fridgesPath, 'utf8'));
  fridges.products.push({
    id: 'active-second',
    cat: 'fridge',
    brand: 'Fisher & Paykel',
    model: 'RF605QDVX2',
    w: 905,
    h: 1790,
    d: 688,
    unavailable: false
  });
  writeJson(fridgesPath, fridges);
  const evidencePath = path.join(repoRoot, 'data', 'manual-evidence.json');
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  evidence.products['active-second'] = {
    category: 'fridge',
    brand: 'Fisher & Paykel',
    model: 'RF605QDVX2',
    evidence: [
      {
        type: 'spec_sheet',
        status: 'candidate',
        source_url: 'https://example.com/RF605QDVX2.pdf',
        verified_at: '2026-05-09'
      }
    ]
  };
  writeJson(evidencePath, evidence);

  const processed = [];
  const result = await runBatch({
    repoRoot,
    skus: ['RF605QDVX2'],
    delayMs: 0,
    fetchPdfImpl: async (_url, destPath) => {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, '%PDF fixture');
      return { path: destPath, cached: false, bytes: 12 };
    },
    extractTextImpl: async () => ({ text: 'fixture text', pageCount: 1, info: {} }),
    parseTextImpl: async (_text, { target }) => {
      processed.push(target.sku);
      return {
        ...strictData,
        brand: 'Fisher & Paykel',
        sku: target.sku,
        metadata: {
          ...strictData.metadata,
          source_pdf_url: 'https://example.com/RF605QDVX2.pdf'
        }
      };
    },
    validateStrictImpl: (candidate) => ({
      valid: true,
      errors: [],
      requiresManualReview: false,
      data: candidate
    }),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.deepEqual(processed, ['RF605QDVX2']);
  assert.equal(result.targets.length, 1);
  assert.equal(result.successes.length, 1);
});

test('writeBatchReport renders empty sections without throwing', () => {
  const repoRoot = makeRepo();
  const outputPath = writeBatchReport({
    repoRoot,
    successes: [],
    discrepancies: [],
    failures: [],
    runAt: '2026-05-08T00:00:00.000Z'
  });

  const report = fs.readFileSync(outputPath, 'utf8');
  assert.match(report, /No successful runs/);
  assert.match(report, /No significant discrepancies/);
  assert.match(report, /No failures/);
});

test('runBatch processes Robinhood targets with official manual plus technical sheet without an API key', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'robinhood-rhbfd121w',
    brand: 'Robinhood',
    sku: 'RHBFD121W',
    category: 'fridge',
    product: {
      id: 'robinhood-rhbfd121w',
      cat: 'fridge',
      brand: 'Robinhood',
      model: 'RHBFD121W',
      w: 495,
      h: 840,
      d: 560,
      unavailable: true
    }
  };
  const fetchedUrls = [];

  const result = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    env: {},
    robinhoodOfficialFinder: async () => ({
      sourceUrl: 'https://cdn.shopify.com/files/RHBFD121W_RHBFD121X_Manual.pdf',
      source: 'robinhood-official-user_manual',
      resourceType: 'user_manual',
      resources: [
        {
          sourceUrl: 'https://cdn.shopify.com/files/RHBFD121W_RHBFD121X_Manual.pdf',
          source: 'robinhood-official-user_manual',
          resourceType: 'user_manual',
          score: 190
        },
        {
          sourceUrl: 'https://cdn.shopify.com/files/RHBFD121X_RHBFD121W_Technical_Sheet.pdf',
          source: 'robinhood-official-specification_sheet',
          resourceType: 'specification_sheet',
          score: 180
        }
      ]
    }),
    fetchPdfImpl: async (url) => {
      fetchedUrls.push(url);
      return { path: url, cached: false, bytes: 12 };
    },
    extractTextImpl: async (url) => {
      if (String(url).includes('Manual')) {
        return {
          text: `
            ROBINHOOD BAR FRIDGE 121L
            Model Numbers: RHBFD121W, RHBFD121X
            Allow at least 10 cm of space around the back and sides of the appliance,
            which allows the proper air circulation, and at least 20cm above the unit.
          `,
          pageCount: 1,
          info: {}
        };
      }
      return {
        text: `
          ROBINHOOD BAR FRIDGE 121L STAINLESS STEEL & WHITE
          RHBFD121X (Stainless Steel); RHBFD121W (White)
          Product Dimension (mm) W495 x D560 x H840
        `,
        pageCount: 1,
        info: {}
      };
    },
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.deepEqual(fetchedUrls, [
    'https://cdn.shopify.com/files/RHBFD121W_RHBFD121X_Manual.pdf',
    'https://cdn.shopify.com/files/RHBFD121X_RHBFD121W_Technical_Sheet.pdf'
  ]);
  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 0);
  const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'RHBFD121W.json'), 'utf8'));
  assert.deepEqual(raw.extracted.clearance_requirements, {
    top_mm: 200,
    left_mm: 100,
    right_mm: 100,
    rear_mm: 100
  });
});

test('runBatch processes Omega exact official specification sheets without an API key', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'omega-odw707x',
    brand: 'Omega',
    sku: 'ODW707X',
    category: 'dishwasher',
    product: {
      id: 'omega-odw707x',
      cat: 'dishwasher',
      brand: 'Omega',
      model: 'ODW707X',
      w: 598,
      h: 845,
      d: 600,
      unavailable: true
    }
  };

  const result = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    env: {},
    omegaOfficialFinder: async () => ({
      sourceUrl: 'https://cdn.shopify.com/s/files/Omega-Dishwashers-Specifications-ODW707X.pdf',
      source: 'omega-official-spec_sheet',
      resourceType: 'specification_sheet',
      resources: [
        {
          sourceUrl: 'https://cdn.shopify.com/s/files/Omega-Dishwashers-Specifications-ODW707X.pdf',
          source: 'omega-official-spec_sheet',
          resourceType: 'specification_sheet',
          score: 100
        }
      ]
    }),
    fetchPdfImpl: async (url) => ({ path: url, cached: false, bytes: 12 }),
    extractTextImpl: async () => ({
      text: `
        OMEGA DISHWASHERS ODW707X
        Dimensions/Weight
        Overall Dimensions (mm): 845(h) x 598(w) x 594(d)
        Technical Details
        Dishwasher Type: Freestanding, with a Removable Worktop
        WARNING: technical specifications and product sizes can be varied by the manufacturer without notice.
        Cutouts for appliances should only be by physical product measurements.
      `,
      pageCount: 1,
      info: {}
    }),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 0);
  const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'ODW707X.json'), 'utf8'));
  assert.equal(raw.extracted.metadata.source_type, 'omega-official-spec_sheet');
  assert.deepEqual(raw.extracted.clearance_requirements, {
    top_mm: 0,
    left_mm: 0,
    right_mm: 0,
    rear_mm: 0
  });
});

test('runBatch processes Sub-Zero official built-in QRGs without an API key', async () => {
  const repoRoot = makeRepo();
  const target = {
    id: 'sub-zero-icbbi-36f',
    brand: 'Sub-Zero',
    sku: 'ICBBI-36F/O-RH',
    category: 'fridge',
    product: {
      id: 'sub-zero-icbbi-36f',
      cat: 'fridge',
      brand: 'Sub-Zero',
      model: 'ICBBI-36F/O-RH',
      w: 914,
      h: 2134,
      d: 610,
      unavailable: true
    }
  };

  const result = await runBatch({
    repoRoot,
    targets: [target],
    delayMs: 0,
    env: {},
    subZeroOfficialFinder: async () => ({
      sourceUrl: 'https://au.subzero-wolf.com/en/products/assets/sub-zero/built-in-refrigeration/qr-sheets/icbbi-36f/icb-built-in-refrigeration-qr-sheet-36fo-st.pdf',
      source: 'sub-zero-official-quick_reference_guide',
      resourceType: 'quick_reference_guide',
      resources: [
        {
          sourceUrl: 'https://au.subzero-wolf.com/en/products/assets/sub-zero/built-in-refrigeration/qr-sheets/icbbi-36f/icb-built-in-refrigeration-qr-sheet-36fo-st.pdf',
          source: 'sub-zero-official-quick_reference_guide',
          resourceType: 'quick_reference_guide',
          score: 100
        }
      ]
    }),
    fetchPdfImpl: async (url) => ({ path: url, cached: false, bytes: 12 }),
    extractTextImpl: async () => ({
      text: `
        91 CM BUILT-IN FREEZER - PANEL READY
        I C B B I - 3 6 F / O

        PRODUCT SPECIFICATIONS
        Model ICBBI-36F/O
        Dimensions 914mmW x 2134mmH x 610mmD
        Plumbing Supply 6.35 mm OD copper line

        DIMENSIONS
        STANDARD INSTALLATION
        OPENING HEIGHT
        OPENING DEPTH
        OPENING WIDTH
      `,
      pageCount: 1,
      info: {}
    }),
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 0);
  const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'pdf-evidence-raw', 'ICBBI-36F-O-RH.json'), 'utf8'));
  assert.equal(raw.extracted.metadata.source_type, 'sub-zero-official-quick_reference_guide');
  assert.deepEqual(raw.extracted.dimensions, {
    height_mm: 2134,
    width_mm: 914,
    depth_mm: 610,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(raw.extracted.clearance_requirements, {
    top_mm: 0,
    left_mm: 0,
    right_mm: 0,
    rear_mm: 0
  });
});
