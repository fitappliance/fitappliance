import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildArchitectureV2ResolverAdapters,
  createElectroluxGroupResolverAdapter,
  createFisherPaykelResolverAdapter,
  createLegacyFinderResolverAdapter,
  createLgResolverAdapter,
} from '../../scripts/pdf-pipeline/architecture-v2-resolver-adapters.mjs';

test('Fisher and Paykel adapter maps discovery metadata without parsed facts', async () => {
  const calls = [];
  const adapter = createFisherPaykelResolverAdapter({
    finder: async (target) => {
      calls.push(target);
      return {
        sourceUrl: 'https://www.fisherpaykel.com/on/demandware.static/QRG/AU/QRG-AU-123.pdf',
        productPageUrl: 'https://www.fisherpaykel.com/au/laundry/washing-machines/WD8560F1.html',
        matchedSku: 'WD8560F1',
        resourceType: 'Quick Reference Guide',
        dimensions: { widthMm: 600, heightMm: 850, depthMm: 645 },
      };
    },
  });
  const result = await adapter.resolve({ brand: 'Fisher & Paykel', model: 'WD8560F1' });
  assert.equal(result.completion, 'complete');
  assert.deepEqual(calls, [{ brand: 'Fisher & Paykel', model: 'WD8560F1', sku: 'WD8560F1' }]);
  assert.deepEqual(result.candidates.map((row) => [row.documentType, row.sourceModelHint]), [
    ['quick_reference_guide', 'WD8560F1'],
    ['product_page', 'WD8560F1'],
  ]);
  assert.equal('dimensions' in result.candidates[0], false);
});

test('LG adapter treats an exhausted exact lookup as complete zero, not discovery failure', async () => {
  const adapter = createLgResolverAdapter({
    finder: async () => { throw new Error('LG official PDF not found for WD1275A1'); },
  });
  const result = await adapter.resolve({ brand: 'LG', model: 'WD1275A1' });
  assert.equal(result.completion, 'complete');
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.failures, []);
});

test('LG adapter preserves Australian support API provenance for a global official download', async () => {
  const artifactUrl = 'https://gscs-b2c.lge.com/open/downloadFile?fileId=fixture';
  const adapter = createLgResolverAdapter({
    finder: async () => ({
      sourceUrl: artifactUrl,
      resourceType: 'Owner Manual',
      lookupSku: 'WD1275A1',
      modelName: 'WD1275A1',
      docId: '20152207223286',
      discoveryUrl: 'https://www.lg.com/ncms/asia/api/v1/support/proxy/retrieveManualSoftwareList?locale=AU',
    }),
  });
  const result = await adapter.resolve({ brand: 'LG', model: 'WD1275A1' });
  assert.equal(result.candidates[0].authorityMode, 'official');
  assert.deepEqual(result.candidates[0].discoveryProvenance, {
    schemaVersion: 1,
    method: 'official_market_api',
    market: 'AU',
    discoveryUrl: 'https://www.lg.com/ncms/asia/api/v1/support/proxy/retrieveManualSoftwareList?locale=AU',
    requestedModel: 'WD1275A1',
    matchedModel: 'WD1275A1',
    artifactUrl,
    documentId: '20152207223286',
  });
});

test('LG transport error remains incomplete while preserving no false candidate', async () => {
  const adapter = createLgResolverAdapter({
    finder: async () => { throw new Error('LG support API failed with HTTP 503'); },
  });
  const result = await adapter.resolve({ brand: 'LG', model: 'WD1275A1' });
  assert.equal(result.completion, 'failed');
  assert.equal(result.failures[0].code, 'resolver_failed');
});

test('Electrolux group adapter supports exact official factsheet candidates only', async () => {
  const adapter = createElectroluxGroupResolverAdapter({
    finder: async () => ({
      sourceUrl: 'https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WHE5264SC&brand=Westinghouse',
      resourceType: 'fact_sheet',
      verifiedAlias: 'WHE5264SC',
      width: 699,
    }),
  });
  const result = await adapter.resolve({ brand: 'Westinghouse', model: 'WHE5264SC' });
  assert.equal(result.completion, 'complete');
  assert.equal(result.candidates[0].authorityMode, 'official');
  assert.equal(result.candidates[0].documentType, 'specification_sheet');
  assert.equal('width' in result.candidates[0], false);
});

test('Electrolux group adapter does not request wildcard family tokens as exact models', async () => {
  let calls = 0;
  const adapter = createElectroluxGroupResolverAdapter({
    finder: async () => {
      calls += 1;
      return { sourceUrl: 'https://resource.electrolux.com.au/should-not-run.pdf' };
    },
  });
  const result = await adapter.resolve({ brand: 'Westinghouse', model: 'WTB3700**' });
  assert.equal(calls, 0);
  assert.equal(result.completion, 'complete');
  assert.deepEqual(result.candidates, []);
});

test('adapter router enables only compatible pilot brand discovery', () => {
  assert.deepEqual(buildArchitectureV2ResolverAdapters({ brand: 'LG', model: 'WD1275A1' })
    .map((row) => row.resolverId), ['lg-official-support']);
  assert.deepEqual(buildArchitectureV2ResolverAdapters({ brand: 'Westinghouse', model: 'WHE5264SC' })
    .map((row) => row.resolverId), ['electrolux-group-official-factsheet']);
  assert.deepEqual(buildArchitectureV2ResolverAdapters({ brand: 'Samsung', model: 'WW90T504DAW' })
    .map((row) => row.resolverId), ['samsung-official-discovery']);
});

test('all migration brands route through typed discovery-only adapters', () => {
  const brands = [
    'Fisher & Paykel', 'Haier', 'Electrolux', 'Westinghouse', 'LG', 'Samsung',
    'Beko', 'Hisense', 'Miele', 'Liebherr', 'Midea', 'CHiQ',
    'Artusi', 'Esatto', 'Euromaid', 'InAlto', 'Kogan', 'Omega', 'Robinhood',
    'Sub-Zero', 'Teco', 'Vogue',
  ];
  for (const brand of brands) {
    assert.equal(buildArchitectureV2ResolverAdapters({ brand, model: 'MODEL100' }).length, 1, brand);
  }
});

test('generic adapter preserves exact, regional, sibling, family and retailer discovery boundaries', async () => {
  const adapter = createLegacyFinderResolverAdapter({
    brandKey: 'samsung',
    resolverId: 'samsung-fixture',
    finder: async () => ({
      sourceUrl: 'https://www.samsung.com/au/support/model/ABC100-AU/spec-sheet.pdf',
      matchedSku: 'ABC100-AU',
      resourceType: 'specification_sheet',
      resources: [
        { sourceUrl: 'https://www.samsung.com/au/support/model/ABC101/family-manual.pdf', resourceType: 'family_manual', sourceModelHint: 'ABC101' },
        { sourceUrl: 'https://retailer.example/manuals/ABC100.pdf', resourceType: 'user_manual' },
      ],
    }),
  });
  const result = await adapter.resolve({ brand: 'Samsung', model: 'ABC100' });
  assert.equal(result.completion, 'complete');
  assert.deepEqual(result.candidates.map((candidate) => ({
    url: candidate.sourceUrl,
    authority: candidate.authorityMode,
    type: candidate.documentType,
    hint: candidate.sourceModelHint,
  })), [
    {
      url: 'https://www.samsung.com/au/support/model/ABC100-AU/spec-sheet.pdf',
      authority: 'official', type: 'specification_sheet', hint: 'ABC100-AU',
    },
    {
      url: 'https://www.samsung.com/au/support/model/ABC101/family-manual.pdf',
      authority: 'official', type: 'family_manual', hint: 'ABC101',
    },
    {
      url: 'https://retailer.example/manuals/ABC100.pdf',
      authority: 'reference', type: 'user_manual', hint: 'ABC100-AU',
    },
  ]);
  assert.ok(result.candidates.every((candidate) => !Object.hasOwn(candidate, 'dimensions')));
});

test('generic adapter bounds candidate expansion and marks overflow incomplete', async () => {
  const adapter = createLegacyFinderResolverAdapter({
    brandKey: 'haier', resolverId: 'haier-fixture', maximumCandidates: 3,
    finder: async () => ({
      sourceUrl: 'https://www.haier.com.au/au/MODEL100/a.pdf',
      resources: Array.from({ length: 5 }, (_, index) => ({
        sourceUrl: `https://www.haier.com.au/au/MODEL100/${index}.pdf`,
        resourceType: 'user_manual',
      })),
    }),
  });
  const result = await adapter.resolve({ brand: 'Haier', model: 'MODEL100' });
  assert.equal(result.completion, 'truncated');
  assert.equal(result.candidates.length, 3);
});

test('generic adapter requires Australian discovery provenance for an approved global manufacturer download', async () => {
  const withoutProvenance = createLegacyFinderResolverAdapter({
    brandKey: 'lg', resolverId: 'lg-global-unbound',
    finder: async () => ({
      sourceUrl: 'https://gscs-b2c.lge.com/open/downloadFile?fileId=ABC100',
      matchedSku: 'ABC100', resourceType: 'user_manual',
    }),
  });
  const unbound = await withoutProvenance.resolve({ brand: 'LG', model: 'ABC100' });
  assert.equal(unbound.candidates[0].authorityMode, 'reference');

  const withProvenance = createLegacyFinderResolverAdapter({
    brandKey: 'lg', resolverId: 'lg-global-bound',
    finder: async () => ({
      sourceUrl: 'https://gscs-b2c.lge.com/open/downloadFile?fileId=ABC100',
      matchedSku: 'ABC100', resourceType: 'user_manual',
      discoveryProvenance: {
        schemaVersion: 1,
        method: 'official_market_api',
        market: 'AU',
        discoveryUrl: 'https://www.lg.com/ncms/asia/api/v1/support/proxy/retrieveManualSoftwareList?locale=AU',
        requestedModel: 'ABC100',
        matchedModel: 'ABC100',
        artifactUrl: 'https://gscs-b2c.lge.com/open/downloadFile?fileId=ABC100',
      },
    }),
  });
  const bound = await withProvenance.resolve({ brand: 'LG', model: 'ABC100' });
  assert.equal(bound.candidates[0].authorityMode, 'official');
});

test('generic adapter accepts object product-page entries without fabricating URLs', async () => {
  const adapter = createLegacyFinderResolverAdapter({
    brandKey: 'haier', resolverId: 'haier-product-page-object',
    finder: async () => ({
      productUrls: [{ sourceUrl: 'https://www.haier.com.au/au/products/ABC100', sourceModelHint: 'ABC100' }],
    }),
  });
  const result = await adapter.resolve({ brand: 'Haier', model: 'ABC100' });
  assert.equal(result.completion, 'complete');
  assert.equal(result.candidates[0].sourceUrl, 'https://www.haier.com.au/au/products/ABC100');
  assert.equal(result.candidates[0].documentType, 'product_page');
});

test('generic adapter converts malformed legacy URLs into a typed resolver failure', async () => {
  const adapter = createLegacyFinderResolverAdapter({
    brandKey: 'haier', resolverId: 'haier-invalid-url',
    finder: async () => ({ sourceUrl: 'https://' }),
  });
  const result = await adapter.resolve({ brand: 'Haier', model: 'ABC100' });
  assert.equal(result.completion, 'failed');
  assert.deepEqual(result.candidates, []);
  assert.equal(result.failures[0].code, 'invalid_candidate_url');
});

test('Architecture V2 adapters have no parser, merge, batch or vault imports', async () => {
  const source = await readFile(new URL('../../scripts/pdf-pipeline/architecture-v2-resolver-adapters.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /pdf-pipeline\/parsers\//);
  assert.doesNotMatch(source, /(?:parse|merge|batch|vault)[-_a-z]*\.(?:m?js|cjs)['"]/i);
  assert.match(source, /findFisherPaykelOfficialPdf/);
  assert.match(source, /findLgOfficialPdf/);
  assert.match(source, /findElectroluxGroupFactsheet/);
});
