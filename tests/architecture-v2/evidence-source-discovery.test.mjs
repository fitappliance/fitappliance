import test from 'node:test';
import assert from 'node:assert/strict';

import {
  discoverCandidateUrls,
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
