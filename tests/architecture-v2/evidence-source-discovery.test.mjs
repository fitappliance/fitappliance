import test from 'node:test';
import assert from 'node:assert/strict';

import {
  discoverCandidateUrls,
  discoverRankedEvidenceCandidates,
  discoverRankedCandidateUrls,
  extractSitemapLocations,
} from '../../src/domain/evidence-source-discovery.mjs';

test('sitemap parser returns canonical HTTP locations only', () => {
  assert.deepEqual(extractSitemapLocations(`<?xml version="1.0"?><urlset>
    <url><loc>https://www.westinghouse.com.au/fridges/whe6874ba/</loc></url>
    <url><loc>javascript:alert(1)</loc></url>
  </urlset>`), ['https://www.westinghouse.com.au/fridges/whe6874ba/']);
});

test('discovery combines existing official sources and bounded recursive sitemap matches', async () => {
  const responses = new Map([
    ['https://www.westinghouse.com.au/sitemap.xml', `<?xml version="1.0"?><sitemapindex>
      <sitemap><loc>https://www.westinghouse.com.au/products.xml</loc></sitemap>
      <sitemap><loc>https://evil.example/poison.xml</loc></sitemap>
    </sitemapindex>`],
    ['https://www.westinghouse.com.au/products.xml', `<?xml version="1.0"?><urlset>
      <url><loc>https://www.westinghouse.com.au/fridges/whe6874ba/</loc></url>
      <url><loc>https://www.westinghouse.com.au/fridges/whe6874ba-r/</loc></url>
    </urlset>`],
  ]);
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return new Response(responses.get(url) ?? '', { status: responses.has(url) ? 200 : 404 });
  };
  const urls = await discoverCandidateUrls({
    brand: 'Westinghouse', model: 'WHE6874BA',
    candidateUrls: ['https://evil.example/fake'],
    sources: [{ sourceUrl: 'https://www.westinghouse.com.au/legacy/whe6874ba/' }],
  }, {
    fetchImpl,
    sitemapUrls: ['https://www.westinghouse.com.au/sitemap.xml'],
    maximumSitemapDocuments: 4,
  });

  assert.deepEqual(urls, [
    'https://www.westinghouse.com.au/fridges/whe6874ba/',
    'https://www.westinghouse.com.au/legacy/whe6874ba/',
  ]);
  assert.equal(calls.includes('https://evil.example/poison.xml'), false);
});

test('sitemap discovery stops at its document budget', async () => {
  const fetchImpl = async (url) => new Response(`<?xml version="1.0"?><sitemapindex>
    <sitemap><loc>${url}/next.xml</loc></sitemap>
  </sitemapindex>`);
  await assert.rejects(() => discoverCandidateUrls({
    brand: 'Westinghouse', model: 'WHE6874BA', sources: [],
  }, {
    fetchImpl,
    sitemapUrls: ['https://www.westinghouse.com.au/sitemap.xml'],
    maximumSitemapDocuments: 2,
  }), /budget/i);
});

test('explicit candidate discovery keeps official query URLs for later PDF identity verification', async () => {
  const urls = await discoverCandidateUrls({
    brand: 'Westinghouse',
    model: 'WHE5264SC',
    candidateUrls: [
      'https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WHE5264SC&brand=Westinghouse',
      'https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WHE5264SCX&brand=Westinghouse',
    ],
  });
  assert.deepEqual(urls, [
    'https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WHE5264SC&brand=Westinghouse',
    'https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WHE5264SCX&brand=Westinghouse',
  ]);
});

test('explicit candidates may use opaque official document IDs because PDF identity is verified later', async () => {
  const url = 'https://www.fisherpaykel.com/on/demandware.static/QRG/AU/QRG-AU-26553.pdf';
  assert.deepEqual(await discoverCandidateUrls({
    brand: 'Fisher & Paykel', model: 'RF605QZUVB1', candidateUrls: [url],
  }), [url]);
});

test('ranked discovery adds deterministic manufacturer templates before legacy candidates', async () => {
  const urls = await discoverRankedCandidateUrls({
    brand: 'Electrolux', model: 'EQE6160BA', category: 'fridge',
    candidateUrls: ['https://www.electrolux.com.au/legacy/EQE6160BA/'],
  });
  assert.deepEqual(urls, [
    'https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=EQE6160BA&brand=Electrolux',
    'https://www.electrolux.com.au/legacy/EQE6160BA/',
  ]);
});

test('ranked discovery extracts model-bound PDFs from official product pages', async () => {
  const pageUrl = 'https://www.westinghouse.com.au/fridges/WHE5264SC/';
  const pdfUrl = 'https://resource.electrolux.com.au/manuals/WHE5264SC-installation-guide.pdf';
  const urls = await discoverRankedCandidateUrls({
    brand: 'Westinghouse', model: 'WHE5264SC', category: 'fridge', productPageUrls: [pageUrl],
  }, {
    fetchImpl: async (url) => new Response(url === pageUrl
      ? `<a href="${pdfUrl}">WHE5264SC installation guide</a>`
      : '', { status: url === pageUrl ? 200 : 404 }),
  });
  assert.equal(urls[0], pdfUrl);
  assert.ok(urls.includes('https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WHE5264SC&brand=Westinghouse'));
});

test('exact product page is optional and ranks between exact documents and a family manual', async () => {
  const productPageUrl = 'https://www.smeg.com/au/products/FAB32RWH5AU';
  const familyManualUrl = 'https://sys.smeg.com.au/Product/Manuals/family-user-manual.pdf';
  const result = await discoverRankedEvidenceCandidates({
    brand: 'Smeg', model: 'FAB32RWH5AU', category: 'fridge',
    candidateUrls: [
      productPageUrl,
      'https://sys.smeg.com.au/Product/Manuals/FAB32RWH5AU-installation.pdf',
      familyManualUrl,
      'https://www.smeg.com/it/products/FAB32RWH5AU',
      'https://retailer.example/FAB32RWH5AU.pdf',
    ],
    productPageUrls: [productPageUrl],
  }, {
    fetchImpl: async (url) => new Response('', { status: url === productPageUrl ? 200 : 404 }),
  });

  const official = result.candidates.filter((candidate) => candidate.authorityMode === 'official');
  const productPage = official.find((candidate) => candidate.sourceUrl === productPageUrl);
  assert.deepEqual({
    documentType: productPage.documentType,
    sourceRole: productPage.sourceRole,
    requiredAttempt: productPage.requiredAttempt,
  }, {
    documentType: 'product_page',
    sourceRole: 'manufacturer_product_page',
    requiredAttempt: false,
  });
  assert.ok(official.findIndex((candidate) => candidate.documentType === 'installation_guide')
    < official.indexOf(productPage));
  assert.ok(official.findIndex((candidate) => candidate.documentType === 'specification_sheet')
    < official.indexOf(productPage));
  assert.ok(official.indexOf(productPage)
    < official.findIndex((candidate) => candidate.sourceUrl === familyManualUrl));
  assert.equal(result.candidates.find((candidate) => candidate.sourceUrl.includes('/it/products/'))?.authorityMode, 'reference');
  assert.equal(result.candidates.find((candidate) => candidate.sourceUrl.includes('retailer.example'))?.authorityMode, 'reference');
});

test('typed discovery preserves ranking, resolver provenance and reference authority', async () => {
  const result = await discoverRankedEvidenceCandidates({
    brand: 'Electrolux',
    model: 'EQE6160BA',
    category: 'fridge',
    candidateUrls: [
      'https://www.electrolux.com.au/legacy/EQE6160BA/',
      'https://www.appliancesonline.com.au/manuals/EQE6160BA.pdf',
    ],
  });
  assert.equal(result.completion, 'complete');
  assert.deepEqual(result.candidates.map((candidate) => [
    candidate.sourceUrl,
    candidate.authorityMode,
    candidate.discoveryMethod,
  ]), [
    [
      'https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=EQE6160BA&brand=Electrolux',
      'official',
      'brand_template',
    ],
    ['https://www.electrolux.com.au/legacy/EQE6160BA/', 'official', 'explicit_registry'],
    ['https://www.appliancesonline.com.au/manuals/EQE6160BA.pdf', 'reference', 'reference_mirror_seed'],
  ]);
  assert.ok(result.candidates.every((candidate) => candidate.resolverId === result.resolverId));
});

test('reference fingerprint rediscovery adds a separate official candidate without promoting the mirror', async () => {
  const mirror = 'https://commercial.appliancesonline.com.au/public/manuals/Fisher---Paykel-E450LXFD1-Specifications.pdf';
  const official = 'https://mf-support.mfe.fisherpaykel.com/au/support/articles/450L-Vertical-refrigerator---User-Care-Guide-22309-ka0Jw000000NxXFIA0/';
  const result = await discoverRankedEvidenceCandidates({
    brand: 'Fisher & Paykel',
    model: 'E450LXFD',
    category: 'fridge',
    candidateUrls: [mirror],
  }, {
    rediscoverReferenceArtifact: async ({ sourceUrl }) => {
      assert.equal(sourceUrl, mirror);
      return {
        schemaVersion: 1,
        status: 'official_candidates_discovered',
        referenceContentSha256: 'a'.repeat(64),
        officialCandidates: [{
          sourceUrl: official,
          authorityMode: 'official',
          documentType: 'official_support_article',
          sourceModelHint: 'E450LXFD',
          matchBasis: 'exact_model_official_candidate',
          requiresOfficialAcquisition: true,
        }],
      };
    },
  });

  assert.equal(result.completion, 'complete');
  assert.deepEqual(result.candidates.map((candidate) => [
    candidate.sourceUrl,
    candidate.authorityMode,
    candidate.discoveryMethod,
    candidate.requiredAttempt,
  ]), [
    [mirror, 'reference', 'reference_mirror_seed', false],
    [official, 'official', 'reference_fingerprint_rediscovery', true],
  ]);
});

test('reference rediscovery failure is typed and prevents false complete discovery', async () => {
  const mirror = 'https://commercial.appliancesonline.com.au/public/manuals/Fisher---Paykel-E450LXFD1-Specifications.pdf';
  const result = await discoverRankedEvidenceCandidates({
    brand: 'Fisher & Paykel',
    model: 'E450LXFD',
    category: 'fridge',
    candidateUrls: [mirror],
  }, {
    rediscoverReferenceArtifact: async () => {
      throw new Error('reference MinerU conversion failed');
    },
  });

  assert.equal(result.completion, 'failed');
  assert.ok(result.candidates.some((candidate) => (
    candidate.sourceUrl === mirror && candidate.authorityMode === 'reference'
  )));
  assert.deepEqual(result.failures, [{
    code: 'reference_rediscovery_failed',
    sourceUrl: mirror,
    message: 'reference MinerU conversion failed',
  }]);
});

test('typed discovery never marks partial product-page discovery complete', async () => {
  const result = await discoverRankedEvidenceCandidates({
    brand: 'Westinghouse',
    model: 'WHE5264SC',
    category: 'fridge',
    productPageUrls: [
      'https://www.westinghouse.com.au/fridges/WHE5264SC/',
      'https://www.westinghouse.com.au/fridges/WHE5264SC/support/',
    ],
  }, {
    fetchImpl: async (url) => {
      if (url.endsWith('/WHE5264SC/')) {
        return new Response('<a href="https://resource.electrolux.com.au/manuals/WHE5264SC-installation-guide.pdf">guide</a>');
      }
      throw new Error('support page timeout');
    },
  });
  assert.equal(result.completion, 'failed');
  assert.ok(result.candidates.some((candidate) => candidate.documentType === 'installation_guide'));
  assert.equal(result.failures.length, 1);
});

test('typed discovery reports sitemap budget exhaustion as truncated with retained candidates', async () => {
  const result = await discoverRankedEvidenceCandidates({
    brand: 'Westinghouse', model: 'WHE5264SC', category: 'fridge',
  }, {
    fetchImpl: async (url) => new Response(`<?xml version="1.0"?><sitemapindex>
      <sitemap><loc>${url}/next.xml</loc></sitemap>
    </sitemapindex>`),
    sitemapUrls: ['https://www.westinghouse.com.au/sitemap.xml'],
    maximumSitemapDocuments: 1,
  });
  assert.equal(result.completion, 'truncated');
  assert.ok(result.candidates.some((candidate) => candidate.discoveryMethod === 'brand_template'));
});

test('legacy ranked string API excludes reference-only candidates and keeps old order', async () => {
  const urls = await discoverRankedCandidateUrls({
    brand: 'Electrolux', model: 'EQE6160BA', category: 'fridge',
    candidateUrls: ['https://www.appliancesonline.com.au/manuals/EQE6160BA.pdf'],
  });
  assert.deepEqual(urls, [
    'https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=EQE6160BA&brand=Electrolux',
  ]);
});
