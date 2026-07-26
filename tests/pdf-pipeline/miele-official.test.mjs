import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  buildMieleSearchQueries,
  extractMieleDownloadLinks,
  extractMieleProductRecords,
  extractMieleProductUrls,
  findMieleOfficialPdf,
  findMielePdf,
  findMieleManualEvidencePdf,
  mieleEvidenceModelMatchesTarget
} = require('../../scripts/pdf-pipeline/miele-official.js');

test('Miele search queries restore the official spaced model form from compact catalogue IDs', () => {
  assert.deepEqual(buildMieleSearchQueries({ sku: 'G7130SCCLST' }), [
    'G 7130 SC CLST',
    'G7130SCCLST',
    'G 7130 SC',
    'G7130SC',
  ]);
});

test('Miele manual-evidence finder can use conservative family suffix matches', () => {
  const manualEvidence = {
    products: {
      'ao-g5000-quick': {
        brand: 'Miele',
        category: 'dishwasher',
        model: 'G5000BKBRWS',
        evidence: [
          {
            type: 'spec_sheet',
            status: 'candidate',
            source_url: 'https://www.appliancesonline.com.au/G5000BKBRWS_Miele_Quick_Guide.pdf'
          }
        ]
      },
      'ao-g5000': {
        brand: 'Miele',
        category: 'dishwasher',
        model: 'G5000SCUCLST',
        evidence: [
          {
            type: 'spec_sheet',
            status: 'candidate',
            source_url: 'https://www.appliancesonline.com.au/G5000SCUCLST_Miele_Specifications_Sheet.pdf'
          }
        ]
      }
    }
  };

  const found = findMieleManualEvidencePdf({
    brand: 'Miele',
    sku: 'G 5000',
    category: 'dishwasher'
  }, manualEvidence);

  assert.equal(found.sourceUrl, 'https://www.appliancesonline.com.au/G5000SCUCLST_Miele_Specifications_Sheet.pdf');
  assert.equal(found.source, 'manual-evidence:miele-family-spec_sheet');
  assert.equal(found.verifiedAlias, 'G5000SCUCLST');
});

test('Miele manual-evidence finder rejects cross-category and broad wildcard matches', () => {
  assert.equal(mieleEvidenceModelMatchesTarget({
    evidenceModel: 'G5000BKBRWS',
    targetSku: 'G 5000',
    evidenceCategory: 'dishwasher',
    targetCategory: 'fridge'
  }), false);
  assert.equal(mieleEvidenceModelMatchesTarget({
    evidenceModel: 'G6999SCVIXXL',
    targetSku: 'G 6xxx',
    evidenceCategory: 'dishwasher',
    targetCategory: 'dishwasher'
  }), false);
});

test('Miele official finder extracts Product Sheet URLs from Miele shop search and download pages', async () => {
  const productUrl = 'https://shop.miele.com.au/en/kitchen/dishwashers/g-7130-scu-dishwasher-zid12531620/';
  const searchHtml = `<a href="${productUrl}">G 7130 SCU</a>`;
  const downloadHtml = `
    <table>
      <tr><td>Operating instructions</td><td>pdf</td><td><a href="https://media.miele.com/manual.pdf">Download</a></td></tr>
      <tr><td>Product Sheet</td><td>pdf</td><td><a href="https://www.miele.com.au/media/ex/au/specsheets/12531620.pdf">Download</a></td></tr>
      <tr><td>EnergyLabel</td><td>pdf</td><td><a href="https://media.miele.com/energy.pdf">Download</a></td></tr>
    </table>
  `;

  assert.deepEqual(extractMieleProductUrls(searchHtml), [productUrl]);
  assert.deepEqual(extractMieleDownloadLinks(downloadHtml).map((link) => link.label), [
    'Operating instructions',
    'Product Sheet',
    'EnergyLabel'
  ]);

  const seenUrls = [];
  const found = await findMieleOfficialPdf({
    brand: 'Miele',
    sku: 'G 7130 SCU',
    category: 'dishwasher'
  }, {
    fetchImpl: async (url) => {
      seenUrls.push(String(url));
      return {
        ok: true,
        text: async () => (String(url).includes('ViewParametricSearch') ? searchHtml : downloadHtml)
      };
    }
  });

  assert.equal(found.sourceUrl, 'https://www.miele.com.au/media/ex/au/specsheets/12531620.pdf');
  assert.equal(found.source, 'miele-official-product-sheet');
  assert.equal(found.verifiedAlias, 'G7130SCU');
  assert.equal(found.materialNumber, '12531620');
  assert.ok(seenUrls.some((url) => url.includes('SearchTerm=G+7130+SCU')));
  assert.ok(seenUrls.some((url) => url.includes('mat=12531620')));
});

test('Miele official finder binds a finish-suffixed target to one exact product card and persists source lanes', async () => {
  const exactProductUrl = 'https://shop.miele.com.au/en/kitchen/dishwashers/freestanding-dishwashers/g-7130-sc-front-autodos-zid12531610/';
  const siblingScuUrl = 'https://shop.miele.com.au/en/kitchen/dishwashers/built-under-dishwashers/g-7130-scu-autodos-zid12531620/';
  const siblingSciUrl = 'https://shop.miele.com.au/en/kitchen/dishwashers/integrated-dishwashers/g-7130-sci-autodos-zid12531640/';
  const productCard = (url, material, title) => `
    <div class="product-tile" data-tracking-product-sku="${material}">
      <a class="product-title js-product-click" data-product-sku="${material}" href="${url}">
        <span>${title}</span>
      </a>
    </div>
  `;
  const searchHtml = [
    productCard(exactProductUrl, '12531610', 'G 7130 SC Front AutoDos'),
    productCard(siblingScuUrl, '12531620', 'G 7130 SCU AutoDos'),
    productCard(siblingSciUrl, '12531640', 'G 7130 SCi AutoDos'),
  ].join('');
  const productHtml = `
    <html><head><link rel="canonical" href="${exactProductUrl}"></head>
    <body><h1>G 7130 SC Front AutoDos</h1></body></html>
  `;
  const downloadHtml = `
    <html><body><h1>G 7130 SC Front AutoDos</h1>
      <table><tr><td>Operating instructions</td><td>pdf</td>
      <td><a href="https://media.miele.com/manual.pdf">Download</a></td></tr></table>
    </body></html>
  `;
  const objects = new Map();

  assert.deepEqual(extractMieleProductRecords(searchHtml).map((record) => ({
    materialNumber: record.materialNumber,
    title: record.title,
  })), [
    { materialNumber: '12531610', title: 'G 7130 SC Front AutoDos' },
    { materialNumber: '12531620', title: 'G 7130 SCU AutoDos' },
    { materialNumber: '12531640', title: 'G 7130 SCi AutoDos' },
  ]);

  const found = await findMieleOfficialPdf({
    brand: 'Miele',
    sku: 'G7130SCCLST',
    category: 'dishwasher',
  }, {
    writeObject: async (path, bytes) => objects.set(path, Buffer.from(bytes)),
    fetchImpl: async (url) => {
      const value = String(url);
      return {
        ok: true,
        text: async () => (
          value.includes('ViewParametricSearch')
            ? searchHtml
            : value.includes('product-details-1995')
              ? downloadHtml
              : productHtml
        ),
      };
    },
  });

  assert.equal(found.materialNumber, '12531610');
  assert.equal(found.productUrl, exactProductUrl);
  assert.equal(found.sourceUrl, 'https://www.miele.com.au/media/ex/au/specsheets/12531610.pdf');
  assert.deepEqual(found.resources.map((resource) => [
    resource.sourceLaneId,
    resource.sourceUrl,
  ]), [
    ['official_product_detail', exactProductUrl],
    ['official_document_cdn', 'https://www.miele.com.au/media/ex/au/specsheets/12531610.pdf'],
  ]);
  const specification = found.resources.find((resource) => (
    resource.sourceLaneId === 'official_document_cdn'
  ));
  assert.deepEqual(specification.discoveryProvenance, {
    schemaVersion: 1,
    method: 'official_product_material',
    market: 'AU',
    discoveryUrl: exactProductUrl,
    requestedModel: 'G7130SCCLST',
    matchedModel: 'G 7130 SC',
    artifactUrl: 'https://www.miele.com.au/media/ex/au/specsheets/12531610.pdf',
    materialNumber: '12531610',
    discoveryContentSha256: specification.discoveryProvenance.discoveryContentSha256,
    discoveryObjectPath: specification.discoveryProvenance.discoveryObjectPath,
    discoveryByteSize: Buffer.byteLength(productHtml),
  });
  assert.match(specification.discoveryProvenance.discoveryContentSha256, /^[a-f0-9]{64}$/);
  assert.equal(found.sourceLanes.find((lane) => lane.laneId === 'current_product').status, 'complete');
  assert.equal(found.sourceLanes.find((lane) => lane.laneId === 'official_product_detail').status, 'complete');
  assert.equal(found.sourceLanes.find((lane) => lane.laneId === 'official_document_cdn').status, 'complete');
  assert.equal(found.sourceLanes.find((lane) => lane.laneId === 'discontinued_archive').status, 'unsupported');
  assert.ok(objects.size >= 3);
});

test('Miele official finder preserves the XXL marker after an integrated model token', async () => {
  const exactProductUrl = 'https://shop.miele.com.au/en/kitchen/dishwashers/integrated-dishwashers/g-7609-sci-xxl-autodos-zid12531690/';
  const siblingProductUrl = 'https://shop.miele.com.au/en/kitchen/dishwashers/integrated-dishwashers/g-7609-sci-autodos-zid99999999/';
  const productCard = (url, material, title) => `
    <a class="product-title" data-product-sku="${material}" href="${url}">
      <span>${title}</span>
    </a>
  `;
  const searchHtml = [
    productCard(exactProductUrl, '12531690', 'G 7609 SCi XXL AutoDos'),
    productCard(siblingProductUrl, '99999999', 'G 7609 SCi AutoDos'),
  ].join('');
  const productHtml = '<h1>G 7609 SCi XXL AutoDos</h1>';
  const downloadHtml = '<h1>Downloads for G 7609 SCi XXL</h1>';
  const objects = new Map();

  assert.deepEqual(extractMieleProductRecords(searchHtml).map((record) => ({
    materialNumber: record.materialNumber,
    model: record.model,
    modelLabel: record.modelLabel,
  })), [
    { materialNumber: '12531690', model: 'G7609SCIXXL', modelLabel: 'G 7609 SCi XXL' },
    { materialNumber: '99999999', model: 'G7609SCI', modelLabel: 'G 7609 SCi' },
  ]);

  const found = await findMieleOfficialPdf({
    brand: 'Miele',
    sku: 'G7609SCIXXLCLST',
    category: 'dishwasher',
  }, {
    writeObject: async (path, bytes) => objects.set(path, Buffer.from(bytes)),
    fetchImpl: async (url) => ({
      ok: true,
      text: async () => (
        String(url).includes('ViewParametricSearch')
          ? searchHtml
          : String(url).includes('product-details-1995')
            ? downloadHtml
            : productHtml
      ),
    }),
  });

  assert.equal(found.materialNumber, '12531690');
  assert.equal(found.productUrl, exactProductUrl);
  assert.equal(found.sourceUrl, 'https://www.miele.com.au/media/ex/au/specsheets/12531690.pdf');
  assert.equal(found.resources[0].sourceModelHint, 'G 7609 SCi XXL');
  assert.ok(found.resources.every((resource) => !resource.sourceUrl.includes('99999999')));
  assert.ok(found.sourceLanes.filter((lane) => lane.required).every((lane) => lane.status === 'complete'));
});

test('Miele official finder fails closed when one model stem maps to multiple materials', async () => {
  const productCard = (material) => `
    <div class="product-tile" data-tracking-product-sku="${material}">
      <a class="product-title" data-product-sku="${material}"
        href="https://shop.miele.com.au/en/kitchen/dishwashers/g-7130-sc-front-autodos-zid${material}/">
        <span>G 7130 SC Front AutoDos</span>
      </a>
    </div>
  `;
  const found = await findMieleOfficialPdf({
    brand: 'Miele',
    sku: 'G7130SCCLST',
    category: 'dishwasher',
  }, {
    writeObject: async () => {},
    fetchImpl: async () => ({
      ok: true,
      text: async () => `${productCard('12531610')}${productCard('99999999')}`,
    }),
  });

  assert.equal(found.sourceUrl, null);
  assert.deepEqual(found.resources, []);
  assert.match(found.reason, /ambiguous/i);
  assert.equal(found.sourceLanes.find((lane) => lane.laneId === 'current_product').status, 'retryable');
});

test('Miele PDF finder prefers official Product Sheets over exact manual-evidence URLs without an alias', async () => {
  const productUrl = 'https://shop.miele.com.au/en/kitchen/refrigeration/freezers/fns-7794-e-integrated-freezer-zid11738290/';
  const found = await findMielePdf({
    brand: 'Miele',
    sku: 'FNS 7794 E',
    category: 'fridge'
  }, {
    products: {
      'fridge-fns-7794-e': {
        brand: 'Miele',
        category: 'fridge',
        model: 'FNS 7794 E',
        source_url: 'https://www.appliancesonline.com.au/FNS_7794_E.pdf'
      }
    }
  }, {
    fetchImpl: async (url) => ({
      ok: true,
      text: async () => (String(url).includes('ViewParametricSearch')
        ? `<a href="${productUrl}">FNS 7794 E</a>`
        : '<tr><td>Product Sheet</td><td>pdf</td><td><a href="https://media.miele.com/FS_11738290.pdf">Download</a></td></tr>')
    })
  });

  assert.equal(found.source, 'miele-official-product-sheet');
  assert.equal(found.sourceUrl, 'https://www.miele.com.au/media/ex/au/specsheets/11738290.pdf');
  assert.equal(found.verifiedAlias, 'FNS7794E');
});
