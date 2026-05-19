import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearOmegaCaches,
  extractOmegaSpecResources,
  findOmegaOfficialPdf,
  normalizeSku
} from '../../scripts/pdf-pipeline/omega-official.js';

const SPEC_HTML = `
  <a href="https://cdn.shopify.com/s/files/1/0722/3433/6499/files/Omega-Dishwashers-Specifications-OFI604.pdf">Specifications: OFI604</a>
  <a href="https://cdn.shopify.com/s/files/1/0722/3433/6499/files/Omega-Dishwashers-Specifications-OFI604A.pdf">Specifications: OFI604A</a>
  <a href="https://cdn.shopify.com/s/files/1/0722/3433/6499/files/Omega-Dishwashers-Specifications-ODW300XN.pdf">Specifications: ODW300XN</a>
`;

test('Omega finder extracts exact specification resources from official spec sheet page', () => {
  const resources = extractOmegaSpecResources(SPEC_HTML);

  assert.deepEqual(resources.map((resource) => resource.sku), ['OFI604', 'OFI604A', 'ODW300XN']);
  assert.equal(resources[0].resourceType, 'specification_sheet');
  assert.equal(resources[0].source, 'omega-official-spec_sheet');
});

test('Omega finder exact-matches SKU and does not let OFI604 match OFI604A', async () => {
  clearOmegaCaches();
  const fetchImpl = async (url, options = {}) => {
    if (String(url).includes('/pages/specification-sheets')) {
      return new Response(SPEC_HTML, { status: 200, headers: { 'content-type': 'text/html' } });
    }
    if (options.method === 'GET' && String(url).includes('OFI604.pdf')) {
      return new Response('%PDF-1.7', { status: 206, headers: { 'content-type': 'application/pdf' } });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  const result = await findOmegaOfficialPdf({ brand: 'Omega', sku: 'OFI604' }, { fetchImpl });

  assert.equal(result.sourceUrl, 'https://cdn.shopify.com/s/files/1/0722/3433/6499/files/Omega-Dishwashers-Specifications-OFI604.pdf');
  assert.equal(normalizeSku(result.sku), 'OFI604');
});

test('Omega finder rejects close-but-not-exact spec sheet matches', async () => {
  clearOmegaCaches();
  const fetchImpl = async (url) => {
    if (String(url).includes('/pages/specification-sheets')) {
      return new Response(`
        <a href="https://cdn.shopify.com/s/files/1/0722/3433/6499/files/Omega-Dishwashers-Specifications-OFI604A.pdf">Specifications: OFI604A</a>
      `, { status: 200 });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  await assert.rejects(
    () => findOmegaOfficialPdf({ brand: 'Omega', sku: 'OFI604' }, { fetchImpl }),
    /not found/
  );
});
