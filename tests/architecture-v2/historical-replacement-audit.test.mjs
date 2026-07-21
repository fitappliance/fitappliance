import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  assertHistoricalReplacementAudit,
  auditHistoricalReplacement,
} from '../../src/domain/historical-replacement-audit.mjs';

const categories = ['fridge', 'dishwasher', 'dryer', 'washing_machine'];

function fixture() {
  const referenceRecords = [
    {
      referenceId: 'fa_ref_111111111111111111111111',
      category: 'fridge',
      brand: 'Archive',
      model: 'OLD-1',
      lifecycleState: 'REGISTRY_ONLY',
      evidenceState: 'REGISTRY_CONSISTENT',
      lookupAction: 'CONFIRM_REQUIRED',
      registryMarketState: 'INACTIVE_AU',
      dimensionsMm: { width: 600, height: 1700, depth: 650 },
    },
    {
      referenceId: 'fa_ref_222222222222222222222222',
      category: 'fridge',
      brand: 'Archive',
      model: 'CONFLICT-1',
      lifecycleState: 'REGISTRY_ONLY',
      evidenceState: 'INTERNAL_CONFLICT',
      lookupAction: 'QUARANTINED',
      registryMarketState: 'ACTIVE_AU',
      dimensionsMm: null,
    },
    ...['dishwasher', 'dryer', 'washing_machine'].map((category, index) => ({
      referenceId: `fa_ref_${String(index + 3).repeat(24)}`,
      category,
      brand: 'Archive',
      model: `${category.toUpperCase()}-OLD-1`,
      lifecycleState: 'REGISTRY_ONLY',
      evidenceState: 'IDENTITY_ONLY',
      lookupAction: 'MEASURE_REQUIRED',
      registryMarketState: 'ACTIVE_AU',
      dimensionsMm: null,
    })),
  ];
  const publicDocuments = Object.fromEntries(categories.map((category) => [category, {
    schemaVersion: 1,
    generatedAt: '2026-07-12T12:40:00.000Z',
    category,
    attribution: {
      sourceName: 'Australian Government Energy Rating dataset',
      sourceUrl: 'https://data.gov.au/example',
      licenceId: 'cc-by-3.0-au',
      licenceName: 'Creative Commons Attribution 3.0 Australia',
      licenceUrl: 'https://creativecommons.org/licenses/by/3.0/au/',
      attribution: 'Australian Government',
    },
    records: referenceRecords.filter((record) => record.category === category).map((record) => ({
      id: record.referenceId,
      brand: record.brand,
      model: record.model,
      lifecycle: record.lifecycleState,
      evidence: record.evidenceState,
      action: record.lookupAction,
      registryMarket: record.registryMarketState,
      ...(record.dimensionsMm ? { dimensionsMm: record.dimensionsMm } : {}),
    })),
  }]));
  const publicBytesByCategory = Object.fromEntries(categories.map((category) => [
    category,
    Buffer.from(`${JSON.stringify(publicDocuments[category])}\n`),
  ]));
  const files = Object.fromEntries(categories.map((category) => [category, {
    category,
    records: publicDocuments[category].records.length,
    byteLength: publicBytesByCategory[category].length,
    contentSha256: createHash('sha256').update(publicBytesByCategory[category]).digest('hex'),
  }]));
  const publicMetaBytes = Buffer.from('{}\n');
  return {
    reference: {
      schemaVersion: 1,
      generatedAt: '2026-07-12T12:40:00.000Z',
      sourceSnapshotHashes: {
        'energy-rating:fridge': 'a'.repeat(64),
        'energy-rating:dishwasher': 'b'.repeat(64),
        'energy-rating:dryer': 'c'.repeat(64),
        'energy-rating:washing_machine': 'd'.repeat(64),
        'fitappliance:catalog': 'e'.repeat(64),
      },
      records: referenceRecords,
    },
    publicationManifest: {
      schemaVersion: 1,
      generatedAt: '2026-07-12T12:40:00.000Z',
      files,
      meta: {
        byteLength: publicMetaBytes.length,
        contentSha256: createHash('sha256').update(publicMetaBytes).digest('hex'),
      },
    },
    publicDocuments,
    publicBytesByCategory,
    publicMetaBytes,
    publicCatalog: { products: [{ id: 'fridge-current', unavailable: false }] },
    currentCatalogBindingSha256: 'e'.repeat(64),
    sitemapXml: '<urlset><url><loc>https://www.fitappliance.com.au/</loc></url></urlset>',
    replacementEngineSource: "function matchCurrentProducts() { return 'direct dimensions'; }",
    runtimeReplacementRows: [{
      id: 'fridge-current',
      searchMode: 'replacement',
      replacementMatch: {
        deltasMm: { width: 1, height: 0, depth: -2 },
        maxAbsoluteDeltaMm: 2,
        totalAbsoluteDeltaMm: 3,
        normalizedDistance: 0.01,
      },
    }],
  };
}

test('historical replacement audit proves publication, SEO and runtime isolation', () => {
  const audit = auditHistoricalReplacement(fixture());
  assert.equal(audit.ok, true);
  assert.equal(audit.summary.referenceRecords, 5);
  assert.equal(audit.summary.publicRecords, 5);
  assert.equal(audit.summary.quarantinedRecords, 1);
  assert.equal(audit.summary.inactiveAustralianRecords, 1);
  assert.doesNotThrow(() => assertHistoricalReplacementAudit(audit));
});

test('historical replacement audit rejects conflict dimensions, commercial leakage, SEO leakage and Fit fields', () => {
  const input = fixture();
  input.publicDocuments.fridge.records[1].dimensionsMm = { width: 1, height: 2, depth: 3 };
  input.publicDocuments.fridge.records[0].affiliateUrl = 'https://example.test';
  input.publicDocuments.fridge.records[0].aliases = [{ brand: 'Wrong Brand', model: 'OLD-1' }];
  input.sitemapXml = '<loc>https://www.fitappliance.com.au/fa_ref_111111111111111111111111</loc>';
  input.runtimeReplacementRows[0].fitDecision = { outcome: 'VERIFIED_FIT' };
  input.currentCatalogBindingSha256 = 'f'.repeat(64);
  const audit = auditHistoricalReplacement(input);
  assert.equal(audit.ok, false);
  assert.ok(audit.issues.some((issue) => issue.code === 'PUBLIC_CONFLICT_DIMENSIONS'));
  assert.ok(audit.issues.some((issue) => issue.code === 'PUBLIC_FORBIDDEN_FIELD'));
  assert.ok(audit.issues.some((issue) => issue.code === 'PUBLIC_REFERENCE_ALIAS_MISMATCH'));
  assert.ok(audit.issues.some((issue) => issue.code === 'HISTORICAL_ID_IN_SITEMAP'));
  assert.ok(audit.issues.some((issue) => issue.code === 'REPLACEMENT_FIT_FIELD_LEAK'));
  assert.ok(audit.issues.some((issue) => issue.code === 'HISTORICAL_CATALOG_SNAPSHOT_STALE'));
  assert.throws(() => assertHistoricalReplacementAudit(audit), /historical replacement audit failed/i);
});

test('normal build republishes and audits committed history without requiring external snapshots', () => {
  const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
  const activePublisher = readFileSync(
    'scripts/architecture-v2/publish-active-retail-release.mjs',
    'utf8',
  );
  assert.match(scripts['build:architecture-v2'], /publish:historical-reference/);
  assert.match(scripts['build:architecture-v2'], /audit:historical-replacement/);
  assert.match(scripts.build, /audit:active-retail-release/);
  assert.match(activePublisher, /runHistoricalReplacementAudit/);
  assert.match(activePublisher, /runFitPublicationAudit/);
  assert.doesNotMatch(scripts['build:architecture-v2'], /build:historical-reference|storage-root|FITAPPLIANCE_STORAGE_ROOT/);
  assert.doesNotMatch(scripts.build, /build:historical-reference|storage-root|FITAPPLIANCE_STORAGE_ROOT/);
  assert.match(scripts['refresh:historical-reference'], /build:historical-reference/);
});
