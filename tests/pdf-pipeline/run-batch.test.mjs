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

  await assert.rejects(() => runBatch({
    repoRoot,
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
