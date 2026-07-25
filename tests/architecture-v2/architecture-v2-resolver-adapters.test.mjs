import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildArchitectureV2ResolverAdapters,
  createBoschResolverAdapter,
  createElectroluxGroupResolverAdapter,
  createFisherPaykelResolverAdapter,
  createLegacyFinderResolverAdapter,
  createLgResolverAdapter,
  resolverAdapterIdsForBrand,
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

test('Fisher and Paykel adapter preserves exact archived support API provenance', async () => {
  const artifactUrl = 'https://content.fisherpaykel.com/guides/DW60CDW2-installation-guide.pdf';
  const discoveryProvenance = {
    schemaVersion: 1,
    method: 'official_support_api',
    market: 'AU',
    sourceMarket: 'NZ',
    discoveryUrl: 'https://mf-support.mfe.fisherpaykel.com/nz/api/support/products/dishwasher-dw60cdw2-fp-nzau--DW60CDW2',
    requestedModel: 'DW60CDW2',
    matchedModel: 'DW60CDW2',
    artifactUrl,
    documentId: 'ka0exact',
  };
  const adapter = createFisherPaykelResolverAdapter({
    finder: async () => ({
      sourceUrl: artifactUrl,
      resourceType: 'Installation Guide',
      matchedSku: 'DW60CDW2',
      resources: [{
        url: artifactUrl,
        type: 'installation_manual',
        discoveryProvenance,
      }],
    }),
  });

  const result = await adapter.resolve({
    brand: 'Fisher & Paykel', model: 'DW60CDW2', category: 'dishwasher',
  });
  assert.equal(result.completion, 'complete');
  assert.equal(result.candidates[0].authorityMode, 'official');
  assert.deepEqual(result.candidates[0].discoveryProvenance, discoveryProvenance);
});

test('Fisher and Paykel adapter excludes sibling resources discovered through a broad model search', async () => {
  const exactArtifact = 'https://content.fisherpaykel.com/guides/RF610ADUQSX4-install.pdf';
  const siblingArtifact = 'https://www.fisherpaykel.com/on/demandware.static/QRG/AU/QRG-AU-26493.pdf';
  const exactProductPage = 'https://www.fisherpaykel.com/nz/support/products/refrig-rf610aduqsx4--RF610ADUQSX4';
  const discoveryProvenance = {
    schemaVersion: 1,
    method: 'official_support_api',
    market: 'AU',
    sourceMarket: 'NZ',
    discoveryUrl: 'https://mf-support.mfe.fisherpaykel.com/nz/api/support/products/refrig-rf610aduqsx4--RF610ADUQSX4',
    requestedModel: 'RF610ADUQSX4',
    matchedModel: 'RF610ADUQSX4',
    artifactUrl: exactArtifact,
  };
  const adapter = createFisherPaykelResolverAdapter({
    finder: async () => ({
      sourceUrl: exactArtifact,
      resourceType: 'installation_manual',
      matchedSku: 'RF610ADUQSX4',
      productPageUrl: exactProductPage,
      fallbackProductPageUrl: 'https://www.fisherpaykel.com/au/cooling/rf610adub5-26493.html',
      resources: [
        {
          url: siblingArtifact,
          type: 'quick_reference_guide',
          evidenceScope: 'research_only_search_variant',
          sourceModelHint: 'RF610ADU',
        },
        {
          url: exactArtifact,
          type: 'installation_manual',
          evidenceScope: 'exact_support_product_article',
          discoveryProvenance,
        },
      ],
    }),
  });

  const result = await adapter.resolve({
    brand: 'Fisher & Paykel', model: 'RF610ADUQSX4', category: 'fridge',
  });

  assert.deepEqual(result.candidates.map((candidate) => candidate.sourceUrl), [
    exactArtifact,
    exactProductPage,
  ]);
  assert.equal(result.candidates[0].sourceModelHint, 'RF610ADUQSX4');
  assert.deepEqual(result.candidates[0].discoveryProvenance, discoveryProvenance);
});

test('Fisher and Paykel adapter excludes parts-only support resources from dimension discovery', async () => {
  const partsUrl = 'https://content.fisherpaykel.com/CBW/service/fpa-dishwashers/fpa-parts-dishwashers/Dishwasher/80914-A-DW60CHW1.pdf';
  const adapter = createFisherPaykelResolverAdapter({
    finder: async () => ({
      sourceUrl: partsUrl,
      resourceType: 'parts_manual',
      matchedSku: 'DW60CHW1',
      resources: [{
        url: partsUrl,
        type: 'parts_manual',
        evidenceScope: 'exact_model_identity_article',
      }],
    }),
  });

  const result = await adapter.resolve({
    brand: 'Fisher & Paykel', model: 'DW60CHW1', category: 'dishwasher',
  });

  assert.equal(result.completion, 'complete');
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.failures, []);
});

test('Fisher and Paykel adapter requires the exact product page when lower-authority dimensions conflict', async () => {
  const adapter = createFisherPaykelResolverAdapter({
    finder: async () => ({
      sourceUrl: 'https://www.fisherpaykel.com/on/demandware.static/QRG/AU/QRG-AU-93296.pdf',
      productPageUrl: 'https://www.fisherpaykel.com/au/laundry/dryers/dh9060hg1-93296.html',
      matchedSku: 'DH9060HG1',
      resourceType: 'Quick Reference Guide',
    }),
  });
  const result = await adapter.resolve({
    brand: 'Fisher & Paykel',
    model: 'DH9060HG1',
    category: 'dryer',
    reconciliationContext: {
      activeReceiptSources: [],
      registryHints: [{ dimensionsMm: { width: 600, height: 850, depth: 670 } }],
      legacyHints: [{ dimensionsMm: { width: 600, height: 850, depth: 655 } }],
    },
  });

  const productPage = result.candidates.find((candidate) => candidate.documentType === 'product_page');
  assert.equal(productPage.requiredAttempt, true);
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

test('legacy finder treats a curl 404 for an exact artifact as complete zero', async () => {
  const adapter = createLegacyFinderResolverAdapter({
    brandKey: 'westinghouse',
    resolverId: 'westinghouse-fixture',
    finder: async () => {
      throw new Error('curl: (56) The requested URL returned error: 404');
    },
  });
  const result = await adapter.resolve({ brand: 'Westinghouse', model: 'WBE4500SARH' });
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

test('LG adapter adds bounded exact-model Australian product-page candidates by category', async () => {
  const adapter = createLgResolverAdapter({
    finder: async () => ({
      sourceUrl: 'https://gscs-b2c.lge.com/open/downloadFile?fileId=fixture',
      resourceType: 'Owner Manual',
      lookupSku: 'WV9-1412B',
      modelName: 'WV9-1412B',
      discoveryUrl: 'https://www.lg.com/ncms/asia/api/v1/support/proxy/retrieveManualSoftwareList?locale=AU',
    }),
  });
  const result = await adapter.resolve({ brand: 'LG', model: 'WV9-1412B', category: 'washing_machine' });
  assert.deepEqual(result.candidates.map((candidate) => [
    candidate.documentType, candidate.sourceUrl, candidate.requiredAttempt,
  ]), [
    ['user_manual', 'https://gscs-b2c.lge.com/open/downloadFile?fileId=fixture', true],
    ['product_page', 'https://www.lg.com/au/washer-dryers/front-load-washing-machines/wv9-1412b/', true],
    ['product_page', 'https://www.lg.com/au/washer-dryers/top-load-washing-machines/wv9-1412b/', true],
  ]);
});

test('LG adapter includes current bounded product-form paths for fridges and dishwashers', async () => {
  const adapter = createLgResolverAdapter({ finder: async () => ({ sourceUrl: null }) });
  const fridge = await adapter.resolve({ brand: 'LG', model: 'GF-V500MBLC', category: 'fridge' });
  const dishwasher = await adapter.resolve({ brand: 'LG', model: 'XD2A25MB', category: 'dishwasher' });

  assert.ok(fridge.candidates.some((candidate) => candidate.sourceUrl
    === 'https://www.lg.com/au/fridge-freezers/french-door/gf-v500mblc/'));
  assert.ok(dishwasher.candidates.some((candidate) => candidate.sourceUrl
    === 'https://www.lg.com/au/dishwashers/free-standing/xd2a25mb/'));
});

test('LG transport error remains incomplete while preserving no false candidate', async () => {
  const adapter = createLgResolverAdapter({
    finder: async () => { throw new Error('LG support API failed with HTTP 503'); },
  });
  const result = await adapter.resolve({ brand: 'LG', model: 'WD1275A1' });
  assert.equal(result.completion, 'failed');
  assert.equal(result.failures[0].code, 'resolver_failed');
});

test('Electrolux group adapter adds bounded Westinghouse product pages for conflict corroboration', async () => {
  const adapter = createElectroluxGroupResolverAdapter({
    finder: async () => ({
      sourceUrl: 'https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WHE5264SC&brand=Westinghouse',
      resourceType: 'fact_sheet',
      verifiedAlias: 'WHE5264SC',
      width: 699,
    }),
  });
  const result = await adapter.resolve({
    brand: 'Westinghouse',
    model: 'WHE5264SC',
    category: 'fridge',
    reconciliationContext: {
      registryHints: [{ dimensionsMm: { width: 1728, height: 913, depth: 803 } }],
      legacyHints: [{ dimensionsMm: { width: 913, height: 1782, depth: 803 } }],
    },
  });
  assert.equal(result.completion, 'complete');
  assert.equal(result.candidates[0].authorityMode, 'official');
  assert.equal(result.candidates[0].documentType, 'specification_sheet');
  assert.equal('width' in result.candidates[0], false);
  assert.deepEqual(result.candidates.slice(1).map((candidate) => [
    candidate.sourceUrl, candidate.documentType, candidate.requiredAttempt,
  ]), [
    ['https://www.westinghouse.com.au/fridges-and-freezers/fridges/whe5264sc/', 'product_page', true],
    ['https://www.westinghouse.com.au/fridges-and-freezers/fridges/whe5264sc-l/', 'product_page', true],
    ['https://www.westinghouse.com.au/fridges-and-freezers/fridges/whe5264sc-r/', 'product_page', true],
  ]);
});

test('Electrolux group adapter reconstructs compact Westinghouse fridge hinge models', async () => {
  let finderCalls = 0;
  const adapter = createElectroluxGroupResolverAdapter({
    finder: async () => {
      finderCalls += 1;
      throw new Error('Official factsheet returned HTTP 404 for WBE4504BBL');
    },
  });
  const result = await adapter.resolve({
    brand: 'Westinghouse',
    model: 'WBE4504BBL',
    category: 'fridge',
  });

  assert.equal(result.completion, 'complete');
  assert.equal(finderCalls, 0);
  assert.deepEqual(result.candidates.map((candidate) => [
    candidate.sourceUrl,
    candidate.documentType,
  ]), [
    ['https://www.westinghouse.com.au/fridges-and-freezers/fridges/wbe4504bb-l/', 'product_page'],
    ['https://www.westinghouse.com.au/fridges-and-freezers/fridges/wbe4504bbl/', 'product_page'],
  ]);
});

test('Electrolux group adapter does not generalize compact hinge reconstruction to unknown series', async () => {
  let finderCalls = 0;
  const adapter = createElectroluxGroupResolverAdapter({
    finder: async (target) => {
      finderCalls += 1;
      return {
        sourceUrl: `https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=${target.model}&brand=Westinghouse`,
        resourceType: 'fact_sheet',
        verifiedAlias: target.model,
      };
    },
  });
  const result = await adapter.resolve({
    brand: 'Westinghouse',
    model: 'WBE9999XXR',
    category: 'fridge',
  });

  assert.equal(finderCalls, 1);
  assert.equal(result.candidates[0].documentType, 'specification_sheet');
  assert.match(result.candidates[0].sourceUrl, /modelNumber=WBE9999XXR/);
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
  assert.deepEqual(buildArchitectureV2ResolverAdapters({ brand: 'ASKO', model: 'T408HD.W' })
    .map((row) => row.resolverId), ['asko-official-manuals-api']);
  assert.deepEqual(buildArchitectureV2ResolverAdapters({ brand: 'Bosch', model: 'SMS68M38AU' })
    .map((row) => row.resolverId), ['bosch-official-product-documents']);
});

test('queue routing exposes specialized Bosch discovery and core discovery for remaining deterministic templates', () => {
  assert.deepEqual(resolverAdapterIdsForBrand('Bosch'), ['bosch-official-product-documents']);
  assert.deepEqual(resolverAdapterIdsForBrand('Smeg'), ['architecture-v2-core-official-discovery']);
  assert.deepEqual(resolverAdapterIdsForBrand('Unknown Brand'), []);
});

test('Bosch adapter preserves exact product-page provenance for every technical document', async () => {
  const model = 'SMS68M38AU';
  const productPageUrl = `https://www.bosch-home.com.au/en/mkt-product/${model}`;
  const artifactUrl = 'https://media3.bsh-group.com/Documents/9001069073_D.pdf';
  const provenance = {
    schemaVersion: 1,
    method: 'official_product_page',
    market: 'AU',
    discoveryUrl: productPageUrl,
    requestedModel: model,
    matchedModel: model,
    artifactUrl,
    artifactLinkUrl: artifactUrl,
    discoveryContentSha256: 'd'.repeat(64),
    discoveryObjectPath: `evidence/web/sha256/dd/dd/${'d'.repeat(64)}.html`,
    discoveryByteSize: 1234,
    discoveryRecordType: 'serialized_technical_document_manifest',
    documentId: 'user-1',
    documentTitleKey: 'user-manuals',
    originalFileName: '9001069073_D.pdf',
  };
  const adapter = createBoschResolverAdapter({
    finder: async () => ({
      sourceUrl: artifactUrl,
      productPageUrl,
      resources: [{
        url: artifactUrl,
        resourceType: 'user_manual',
        requiredAttempt: true,
        discoveryProvenance: provenance,
      }],
    }),
  });
  const result = await adapter.resolve({ brand: 'Bosch', model, category: 'dishwasher' });

  assert.equal(result.completion, 'complete');
  assert.deepEqual(result.candidates.map((row) => [row.documentType, row.authorityMode, row.requiredAttempt]), [
    ['user_manual', 'official', true],
    ['product_page', 'official', false],
  ]);
  assert.deepEqual(result.candidates[0].discoveryProvenance, provenance);
});

test('ASKO adapter preserves hash-bound exact-model Australian API provenance', async () => {
  const artifactUrl = 'https://partners.gorenje.com/fts/htmlNavodila/870866en.pdf';
  const discoveryProvenance = {
    schemaVersion: 1,
    method: 'official_market_api',
    market: 'AU',
    discoveryUrl: 'https://api-storefront.asko.com/ggcommercewebservices/v2/asko-au/products/manuals/search?query=T408HD.W&lang=en_AU&curr=AUD',
    requestedModel: 'T408HD.W',
    matchedModel: 'T408HD.W',
    artifactUrl,
    discoveryContentSha256: 'a'.repeat(64),
    discoveryObjectPath: `evidence/web/sha256/aa/aa/${'a'.repeat(64)}.json`,
    discoveryByteSize: 123,
  };
  const [adapter] = buildArchitectureV2ResolverAdapters(
    { brand: 'ASKO', model: 'T408HD.W', category: 'dryer' },
    { asko: { finder: async () => ({
      sourceUrl: artifactUrl,
      matchedSku: 'T408HD.W',
      resourceType: 'Instructions for use',
      discoveryProvenance,
    }) } },
  );

  const result = await adapter.resolve({ brand: 'ASKO', model: 'T408HD.W', category: 'dryer' });
  assert.equal(result.completion, 'complete');
  assert.equal(result.candidates[0].authorityMode, 'official');
  assert.equal(result.candidates[0].sourceModelHint, 'T408HD.W');
  assert.deepEqual(result.candidates[0].discoveryProvenance, discoveryProvenance);
});

test('ASKO adapter keeps official PIM JSON typed as structured manufacturer data', async () => {
  const sourceUrl = 'https://api-storefront.asko.com/ggcommercewebservices/v2/asko-au/products/000000000000732485?fields=FULL&lang=en_AU&curr=AUD';
  const discoveryProvenance = {
    schemaVersion: 1, method: 'official_market_api', market: 'AU', discoveryUrl: sourceUrl,
    requestedModel: 'DBI243IBS', matchedModel: 'DBI243IB.S.AU', artifactUrl: sourceUrl,
    discoveryContentSha256: 'a'.repeat(64),
    discoveryObjectPath: `evidence/web/sha256/aa/aa/${'a'.repeat(64)}.json`, discoveryByteSize: 123,
  };
  const [adapter] = buildArchitectureV2ResolverAdapters(
    { brand: 'ASKO', model: 'DBI243IBS', category: 'dishwasher' },
    { asko: { finder: async () => ({
      sourceUrl, matchedSku: 'DBI243IB.S.AU', resourceType: 'structured_product_data',
      discoveryProvenance,
    }) } },
  );
  const result = await adapter.resolve({ brand: 'ASKO', model: 'DBI243IBS', category: 'dishwasher' });
  assert.equal(result.candidates[0].documentType, 'structured_product_data');
  assert.equal(result.candidates[0].sourceRole, 'manufacturer_structured_data');
  assert.equal(result.candidates[0].authorityMode, 'official');
});

test('all migration brands route through typed discovery-only adapters', () => {
  const brands = [
    'Fisher & Paykel', 'Haier', 'Electrolux', 'Westinghouse', 'LG', 'Samsung',
    'Beko', 'Hisense', 'Miele', 'Liebherr', 'Midea', 'CHiQ',
    'ASKO', 'Artusi', 'Esatto', 'Euromaid', 'InAlto', 'Kogan', 'Omega', 'Robinhood',
    'Sub-Zero', 'Teco', 'Vogue', 'Bosch',
  ];
  for (const brand of brands) {
    assert.equal(buildArchitectureV2ResolverAdapters({ brand, model: 'MODEL100' }).length, 1, brand);
  }
});

test('Miele adapter declares schema-v2 lanes and preserves bounded official observations', async () => {
  const hash = 'b'.repeat(64);
  const provenance = {
    schemaVersion: 1,
    method: 'official_site_search',
    market: 'AU',
    discoveryUrl: 'https://shop.miele.com.au/search?SearchTerm=G7130SCCLST',
    requestedModel: 'G7130SCCLST',
    contentType: 'text/html',
    contentSha256: hash,
    objectPath: `evidence/web/sha256/bb/bb/${hash}.html`,
    byteSize: 500,
  };
  const sourceLanes = [
    {
      laneId: 'current_product', required: true, supported: true,
      status: 'complete', candidateCount: 0, provenance: [provenance], reason: null,
    },
    {
      laneId: 'discontinued_archive', required: false, supported: false,
      status: 'unsupported', candidateCount: 0, provenance: [], reason: 'No bounded archive resolver.',
    },
    {
      laneId: 'support_search_api', required: false, supported: false,
      status: 'unsupported', candidateCount: 0, provenance: [], reason: 'No bounded support API.',
    },
    {
      laneId: 'official_document_cdn', required: true, supported: true,
      status: 'complete', candidateCount: 1, provenance: [provenance], reason: null,
    },
    {
      laneId: 'official_product_detail', required: true, supported: true,
      status: 'complete', candidateCount: 1, provenance: [provenance], reason: null,
    },
  ];
  const documentUrl = 'https://www.miele.com.au/media/ex/au/specsheets/12531610.pdf';
  const productUrl = 'https://shop.miele.com.au/en/kitchen/dishwashers/g-7130-sc-front-autodos-zid12531610/';
  const [adapter] = buildArchitectureV2ResolverAdapters(
    { brand: 'Miele', model: 'G7130SCCLST', category: 'dishwasher' },
    { miele: { finder: async () => ({
      sourceUrl: documentUrl,
      sourceLanes,
      resources: [
        { sourceUrl: productUrl, resourceType: 'product_page', sourceLaneId: 'official_product_detail' },
        { sourceUrl: documentUrl, resourceType: 'specification_sheet', sourceLaneId: 'official_document_cdn' },
      ],
    }) } },
  );

  assert.equal(adapter.schemaVersion, 2);
  assert.equal(adapter.version, '3');
  const result = await adapter.resolve({
    brand: 'Miele', model: 'G7130SCCLST', category: 'dishwasher',
  });
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.completion, 'complete');
  assert.deepEqual(result.sourceLanes, sourceLanes);
  assert.deepEqual(result.candidates.map((candidate) => candidate.sourceLaneId).sort(), [
    'official_document_cdn',
    'official_product_detail',
  ]);
  const productPage = result.candidates.find((candidate) => (
    candidate.sourceLaneId === 'official_product_detail'
  ));
  assert.equal(productPage.sourceRole, 'manufacturer_product_page');
  assert.equal(productPage.requiredAttempt, false);
});

test('Esatto adapter preserves the schema-v2 source-lane contract and candidate observations', async () => {
  const hash = 'c'.repeat(64);
  const provenance = {
    schemaVersion: 1,
    method: 'official_sitemap',
    market: 'AU',
    discoveryUrl: 'https://esatto.house/sitemap.xml',
    requestedModel: 'EDW456S',
    contentType: 'application/xml',
    contentSha256: hash,
    objectPath: `evidence/web/sha256/cc/cc/${hash}.xml`,
    byteSize: 450,
  };
  const sourceLanes = [
    ['current_product', true, true, 'complete', 0, [provenance], null],
    ['discontinued_archive', true, true, 'complete', 0, [provenance], null],
    ['support_search_api', true, true, 'complete', 0, [provenance], null],
    ['official_document_cdn', true, true, 'complete', 1, [provenance], null],
    ['official_product_detail', true, true, 'complete', 1, [provenance], null],
  ].map(([laneId, required, supported, status, candidateCount, laneProvenance, reason]) => ({
    laneId, required, supported, status, candidateCount, provenance: laneProvenance, reason,
  }));
  const documentUrl = 'https://esatto.house/s/EDW456S_UserManual_V21-0523.pdf';
  const productUrl = 'https://esatto.house/discontinued-products/p/45cm-dishwasher-edw456s';
  const [adapter] = buildArchitectureV2ResolverAdapters(
    { brand: 'Esatto', model: 'EDW456S', category: 'dishwasher' },
    { esatto: { finder: async () => ({
      sourceUrl: documentUrl,
      sourceLanes,
      resources: [
        { sourceUrl: documentUrl, resourceType: 'user_manual', sourceLaneId: 'official_document_cdn' },
        { sourceUrl: productUrl, resourceType: 'product_page', sourceLaneId: 'official_product_detail' },
      ],
    }) } },
  );
  const result = await adapter.resolve({ brand: 'Esatto', model: 'EDW456S', category: 'dishwasher' });

  assert.equal(result.schemaVersion, 2);
  assert.equal(result.version, '2');
  assert.equal(result.completion, 'complete');
  assert.deepEqual(result.sourceLanes, sourceLanes);
  assert.deepEqual(result.candidates.map((candidate) => [candidate.sourceLaneId, candidate.sourceUrl]), [
    ['official_document_cdn', documentUrl],
    ['official_product_detail', productUrl],
  ]);
});

test('Esatto adapter preserves distinct current and archive observations of the same PDF', async () => {
  const laneHash = 'd'.repeat(64);
  const laneProvenance = {
    schemaVersion: 1,
    method: 'official_sitemap',
    market: 'AU',
    discoveryUrl: 'https://esatto.house/sitemap.xml',
    requestedModel: 'EDW456S',
    contentType: 'application/xml',
    contentSha256: laneHash,
    objectPath: `evidence/web/sha256/dd/dd/${laneHash}.xml`,
    byteSize: 450,
  };
  const laneDescriptors = [
    'current_product',
    'discontinued_archive',
    'support_search_api',
    'official_document_cdn',
    'official_product_detail',
  ];
  const documentUrl = 'https://esatto.house/s/EDW456S_UserManual_V21-0523.pdf';
  const discovery = (pageUrl, character) => {
    const hash = character.repeat(64);
    return {
      schemaVersion: 1,
      method: 'official_product_page',
      market: 'AU',
      discoveryUrl: pageUrl,
      requestedModel: 'EDW456S',
      matchedModel: 'EDW456S',
      artifactUrl: documentUrl,
      artifactLinkUrl: documentUrl,
      discoveryContentSha256: hash,
      discoveryObjectPath: `evidence/web/sha256/${character}${character}/${character}${character}/${hash}.html`,
      discoveryByteSize: 500,
    };
  };
  const currentPage = 'https://esatto.house/dishwashers/p/45cm-dishwasher-edw456s';
  const archivePage = 'https://esatto.house/discontinued-products/p/45cm-dishwasher-edw456s';
  const sourceLanes = laneDescriptors.map((laneId) => ({
    laneId,
    required: true,
    supported: true,
    status: 'complete',
    candidateCount: laneId === 'official_document_cdn' ? 2 : 0,
    provenance: [laneProvenance],
    reason: null,
  }));
  const [adapter] = buildArchitectureV2ResolverAdapters(
    { brand: 'Esatto', model: 'EDW456S', category: 'dishwasher' },
    { esatto: { finder: async () => ({
      sourceLanes,
      resources: [
        {
          sourceUrl: documentUrl,
          resourceType: 'user_manual',
          sourceLaneId: 'official_document_cdn',
          discoveryProvenance: discovery(currentPage, 'e'),
        },
        {
          sourceUrl: documentUrl,
          resourceType: 'user_manual',
          sourceLaneId: 'official_document_cdn',
          discoveryProvenance: discovery(archivePage, 'f'),
        },
      ],
    }) } },
  );

  const result = await adapter.resolve({ brand: 'Esatto', model: 'EDW456S', category: 'dishwasher' });
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.candidates.map((candidate) => candidate.discoveryProvenance.discoveryUrl), [
    currentPage,
    archivePage,
  ]);
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

test('generic adapter does not mistake an AEM ProductCatalog directory for a catalogue document', async () => {
  const productPageUrl = 'https://www.beko.com/au-en/home-appliances/freestanding-dishwasher/bdf1640ax';
  const artifactUrl = 'https://www.beko.com/content/dam/australia-au-aem/australia-au-aemProductCatalog/product-documents/7679159077-BDF1640AX/en-US-Installation-Diagram.pdf';
  const provenance = {
    schemaVersion: 1,
    method: 'official_product_page',
    market: 'AU',
    discoveryUrl: 'https://www.beko.com/au-en/support/user-manuals-result?search=BDF1640AX',
    requestedModel: 'BDF1640AX',
    matchedModel: 'BDF1640AX',
    artifactUrl,
    artifactLinkUrl: artifactUrl,
    discoveryContentSha256: 'a'.repeat(64),
    discoveryObjectPath: `evidence/web/sha256/aa/aa/${'a'.repeat(64)}.html`,
    discoveryByteSize: 1234,
  };
  const adapter = createLegacyFinderResolverAdapter({
    brandKey: 'beko', resolverId: 'beko-aem-fixture',
    finder: async () => ({
      sourceUrl: artifactUrl,
      resourceType: 'installation_guide',
      requiredAttempt: false,
      discoveryProvenance: provenance,
      resources: [{
        url: artifactUrl, resourceType: 'installation_guide', requiredAttempt: false,
        discoveryProvenance: provenance,
      }],
      productPageUrl,
    }),
  });
  const result = await adapter.resolve({ brand: 'Beko', model: 'BDF1640AX' });
  assert.deepEqual(result.candidates.map((candidate) => [
    candidate.documentType,
    candidate.authorityMode,
    candidate.discoveryProvenance?.artifactUrl ?? null,
    candidate.requiredAttempt,
  ]), [
    ['installation_guide', 'official', artifactUrl, false],
    ['product_page', 'official', null, false],
  ]);
});

test('Beko resolver uses the deterministic AU support-search contract epoch', () => {
  const [adapter] = buildArchitectureV2ResolverAdapters(
    { brand: 'Beko', model: 'BDF1640AX', category: 'dishwasher' },
    { beko: { finder: async () => null } },
  );
  assert.equal(adapter.resolverId, 'beko-official-discovery');
  assert.equal(adapter.version, '2');
  assert.equal(adapter.scope, 'beko_au_exact_support_search_result_and_product_documents');
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

test('Haier resolver v5 binds target-ready and archived-taxonomy support provenance', async () => {
  const artifactLinkUrl = 'https://fisherpaykel.my.salesforce.com/sfc/p/90000000kftP/a/Jw000000ZuKH/bvotDdcSLfdw.htXZGovkodua2Mar.7lUf1eqIawLh4';
  const artifactUrl = 'https://fisherpaykel.my.salesforce.com/sfc/dist/version/download/?oid=00D90000000kftP&ids=068Jw0000000001&d=%2Fa%2FJw000000ZuKH%2FbvotDdcSLfdw.htXZGovkodua2Mar.7lUf1eqIawLh4&operationContext=DELIVERY&viewId=05HJw0000000001&dpt=';
  const discoveryUrl = 'https://support.haier.com.au/s/help-and-support/article/Dishwasher-Installation-Guide-8875';
  const hash = 'a'.repeat(64);
  const discoveryProvenance = {
    schemaVersion: 1,
    method: 'official_product_page',
    market: 'AU',
    discoveryUrl,
    requestedModel: 'HDW9TFE3SS',
    matchedModel: 'HDW9TFE3SS',
    artifactUrl,
    artifactLinkUrl,
    discoveryContentSha256: hash,
    discoveryObjectPath: `evidence/web/sha256/aa/aa/${hash}.html`,
    discoveryByteSize: 100,
  };
  const [adapter] = buildArchitectureV2ResolverAdapters(
    { brand: 'Haier', model: 'HDW9TFE3SS', category: 'dishwasher' },
    { haier: { finder: async () => ({
      sourceUrl: artifactUrl,
      resourceType: 'installation_guide',
      discoveryProvenance,
      resources: [{
        url: artifactUrl,
        resourceType: 'installation_guide',
        discoveryProvenance,
      }],
    }) } },
  );
  const result = await adapter.resolve({ brand: 'Haier', model: 'HDW9TFE3SS', category: 'dishwasher' });

  assert.equal(result.version, '5');
  assert.equal(result.scope, 'haier_au_target_ready_and_archived_taxonomy_support_articles_resolved_pdf_and_current_product_pages');
  assert.equal(result.candidates[0].authorityMode, 'official');
  assert.equal(result.candidates[0].resolverVersion, '5');
  assert.deepEqual(result.candidates[0].discoveryProvenance.artifactUrl, artifactUrl);
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
