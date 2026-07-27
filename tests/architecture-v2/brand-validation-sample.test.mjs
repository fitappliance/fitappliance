import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BRAND_VALIDATION_COLUMNS,
  buildBrandValidationManifest,
  buildBrandValidationRows,
  serializeBrandValidationCsv,
} from '../../src/domain/brand-validation-sample.mjs';

const pilot = {
  schemaVersion: 1,
  generatedAt: null,
  products: [
    {
      canonicalProductId: 'fa_prod_b',
      legacyRuntimeId: 'dishwasher-b',
      category: 'dishwasher',
      brand: 'Example Brand',
      model: 'MODEL-2.AU',
      reconciliationState: 'EXACT_DIMENSION_CONFLICT',
      reasonCodes: ['SOURCE_DIMENSIONS_DISAGREE'],
    },
    {
      canonicalProductId: 'fa_prod_a',
      legacyRuntimeId: 'fridge-a',
      category: 'fridge',
      brand: 'Another Brand',
      model: 'MODEL-1/B',
      reconciliationState: 'EXACT_CONSISTENT',
      reasonCodes: ['EXACT_IDENTITY_AND_WHD_AGREE'],
    },
  ],
};

const canonicalRegistry = {
  products: [
    {
      id: 'fa_prod_a', category: 'fridge', brand: 'Another Brand', model: 'MODEL-1/B',
      identifiers: [{ scheme: 'manufacturer_model', value: 'MODEL-1/B' }],
    },
    {
      id: 'fa_prod_b', category: 'dishwasher', brand: 'Example Brand', model: 'MODEL-2.AU',
      identifiers: [
        { scheme: 'manufacturer_model', value: 'MODEL-2.AU' },
        { scheme: 'gtin', value: '09312345678901' },
      ],
    },
  ],
};

const publicProjection = {
  products: [
    {
      id: 'fridge-a', canonicalProductId: 'fa_prod_a', cat: 'fridge', brand: 'Another Brand', model: 'MODEL-1/B',
      w: 700, h: 1700, d: 680, unavailable: false,
      evidence: {
        trust_level: 'retailer_spec', has_official_evidence: false,
        source_url: 'https://retailer.example/private-feed/product-a',
      },
    },
    {
      id: 'dishwasher-b', canonicalProductId: 'fa_prod_b', cat: 'dishwasher', brand: 'Example Brand', model: 'MODEL-2.AU',
      unavailable: true,
      geometry_v2: {
        closedEnvelope: {
          widthMm: 600,
          heightMm: { minimumMm: 820, maximumMm: 880 },
          depthMm: 570,
        },
      },
      geometry_v2_provenance: {
        evidenceLevel: 'dimensions',
        fieldEvidence: {
          'closedEnvelope.widthMm': {
            sourceUrl: 'https://manufacturer.example/model-2-install.pdf',
            receiptBindingSha256: 'a'.repeat(64),
          },
          'closedEnvelope.heightMm': {
            sourceUrl: 'https://manufacturer.example/model-2-install.pdf',
            receiptBindingSha256: 'a'.repeat(64),
          },
          'closedEnvelope.depthMm': {
            sourceUrl: 'https://manufacturer.example/model-2-install.pdf',
            receiptBindingSha256: 'a'.repeat(64),
          },
        },
        missingForVerifiedFit: ['installation.leftMm', 'installation.rightMm'],
      },
      evidence: {
        trust_level: 'dimensions_verified',
        has_official_evidence: true,
        source_url: 'https://manufacturer.example/model-2-install.pdf',
      },
    },
  ],
};

const sourceDocuments = {
  documents: [
    {
      id: 'doc_b', authorType: 'manufacturer', transportHostType: 'manufacturer',
      sourceUrl: 'https://manufacturer.example/model-2-install.pdf',
      productLinks: [{ canonicalProductId: 'fa_prod_b', legacyRuntimeId: 'dishwasher-b' }],
    },
  ],
};

test('builds deterministic rows without changing exact model identity or range semantics', () => {
  const rows = buildBrandValidationRows({ pilot, canonicalRegistry, publicProjection, sourceDocuments });

  assert.deepEqual(rows.map((row) => row.canonical_product_id), ['fa_prod_b', 'fa_prod_a']);
  assert.equal(rows[0].model, 'MODEL-2.AU');
  assert.equal(rows[0].gtin, '09312345678901');
  assert.equal(rows[0].height_min_mm, 820);
  assert.equal(rows[0].height_max_mm, 880);
  assert.equal(rows[0].dimension_source_class, 'receipt_bound');
  assert.equal(rows[0].source_receipt_hashes, 'a'.repeat(64));
  assert.equal(rows[0].missing_for_verified_fit, 'installation.leftMm|installation.rightMm');
  assert.equal(rows[0].official_evidence_url, 'https://manufacturer.example/model-2-install.pdf');

  assert.equal(rows[1].model, 'MODEL-1/B');
  assert.equal(rows[1].width_min_mm, 700);
  assert.equal(rows[1].width_max_mm, 700);
  assert.equal(rows[1].dimension_source_class, 'catalog_hint');
  assert.equal(rows[1].official_evidence_url, '');
  assert.equal(rows[1].market_state, 'unknown');
  assert.equal(rows[1].catalog_availability, 'listed');
  assert.doesNotMatch(JSON.stringify(rows), /private-feed/);
});

test('rejects a pilot row whose canonical identity differs by model suffix', () => {
  const mismatchedRegistry = structuredClone(canonicalRegistry);
  mismatchedRegistry.products[1].model = 'MODEL-2';

  assert.throws(
    () => buildBrandValidationRows({ pilot, canonicalRegistry: mismatchedRegistry, publicProjection, sourceDocuments }),
    /exact identity mismatch.*MODEL-2\.AU.*MODEL-2/i,
  );
});

test('allows a case-only brand spelling difference without changing the exported brand', () => {
  const caseVariantRegistry = structuredClone(canonicalRegistry);
  caseVariantRegistry.products[1].brand = 'EXAMPLE BRAND';

  const rows = buildBrandValidationRows({
    pilot,
    canonicalRegistry: caseVariantRegistry,
    publicProjection,
    sourceDocuments,
  });

  assert.equal(rows[0].brand, 'Example Brand');
  assert.equal(rows[0].model, 'MODEL-2.AU');
});

test('serializes a stable RFC 4180-style CSV and hashes its declared inputs', () => {
  const rows = buildBrandValidationRows({ pilot, canonicalRegistry, publicProjection, sourceDocuments });
  rows[0].brand = 'Example, "Quoted" Brand';

  const csv = serializeBrandValidationCsv(rows);
  const manifest = buildBrandValidationManifest({
    rows,
    csv,
    csvPath: 'data/architecture-v2/generated/brand-validation-sample-100.csv',
    sourceFiles: [
      { path: 'z.json', sha256: 'f'.repeat(64) },
      { path: 'a.json', sha256: 'e'.repeat(64) },
    ],
  });

  assert.equal(csv.split('\n')[0], BRAND_VALIDATION_COLUMNS.join(','));
  assert.match(csv, /"Example, ""Quoted"" Brand"/);
  assert.equal(csv.endsWith('\n'), true);
  assert.deepEqual(manifest.sourceFiles.map((row) => row.path), ['a.json', 'z.json']);
  assert.equal(manifest.csv.rowCount, 2);
  assert.match(manifest.csv.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(manifest.summary.byCategory, { dishwasher: 1, fridge: 1 });
  assert.equal(manifest.summary.receiptBoundDimensions, 1);
  assert.equal(manifest.summary.catalogHintDimensions, 1);

  const repeatedCsv = serializeBrandValidationCsv(rows);
  const repeatedManifest = buildBrandValidationManifest({
    rows,
    csv: repeatedCsv,
    csvPath: manifest.csv.path,
    sourceFiles: [...manifest.sourceFiles].reverse(),
  });
  assert.equal(repeatedCsv, csv);
  assert.deepEqual(repeatedManifest, manifest);
});
