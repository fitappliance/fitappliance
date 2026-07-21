import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseEsattoText } = require('../../scripts/pdf-pipeline/parsers/esatto');
const {
  extractEsattoDownloadLinks,
  findEsattoOfficialPdf,
  urlMatchesTargetSku
} = require('../../scripts/pdf-pipeline/esatto-official');

test('Esatto official finder matches product URLs by SKU', () => {
  assert.equal(
    urlMatchesTargetSku('https://esatto.house/refrigeration/p/124l-bar-fridge-white-ebf124w', { sku: 'EBF124W' }),
    true
  );
  assert.equal(
    urlMatchesTargetSku('https://esatto.house/refrigeration/p/196l-bar-fridge-white-ebf196w', { sku: 'EBF124W' }),
    false
  );
  assert.equal(
    urlMatchesTargetSku('https://esatto.house/dishwashers/p/45cm-dishwasher-edw456s2', { sku: 'EDW456S' }),
    false
  );
});

test('Esatto finder rejects an exact-looking URL when the fetched page identifies a sibling model', async () => {
  const productUrl = 'https://esatto.house/dishwashers/p/45cm-dishwasher-edw456s';
  const result = await findEsattoOfficialPdf({ model: 'EDW456S' }, {
    fetchImpl: async (url) => ({
      ok: true,
      status: 200,
      text: async () => String(url).endsWith('/sitemap.xml')
        ? `<urlset><url><loc>${productUrl}</loc></url></urlset>`
        : String(url).includes('/search?')
          ? '<html><body>No matching products</body></html>'
          : '<html><body><h1>EDW456S2</h1><a href="/s/EDW456S2_UserManual.pdf">Manual</a></body></html>',
    }),
    writeObject: async () => {},
  });

  assert.deepEqual(result.resources, []);
  assert.equal(
    result.sourceLanes.find((lane) => lane.laneId === 'official_product_detail').status,
    'retryable'
  );
  assert.match(result.reason, /does not identify exact model EDW456S/i);
});

test('Esatto finder extracts downloads only from the exact Squarespace product context', async () => {
  const productUrl = 'https://esatto.house/dishwashers/p/45cm-dishwasher-edw456s';
  const exactManual = 'https://esatto.house/s/EDW456S_UserManual.pdf';
  const siblingManual = 'https://esatto.house/s/EDW6004B_UserManual.pdf';
  const context = JSON.stringify({
    product: {
      description: `<p>Model EDW456S</p><a href="${exactManual}">User Manual</a>`,
      variants: [{ sku: 'EDW456S' }],
      tags: ['sku-EDW456S'],
    },
  }).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const productHtml = `<html><body>
    <div class="product-detail tag-sku-edw456s" data-controller="ProductDetail" data-context="${context}"></div>
    <script type="application/json">{"otherProduct":"${siblingManual}"}</script>
  </body></html>`;
  const result = await findEsattoOfficialPdf({ model: 'EDW456S' }, {
    fetchImpl: async (url) => ({
      ok: true,
      status: 200,
      text: async () => String(url).endsWith('/sitemap.xml')
        ? `<urlset><url><loc>${productUrl}</loc></url></urlset>`
        : String(url).includes('/search?') ? '<html>No results</html>' : productHtml,
    }),
    writeObject: async () => {},
  });

  assert.deepEqual(result.resources
    .filter((resource) => resource.sourceLaneId === 'official_document_cdn')
    .map((resource) => resource.sourceUrl), [exactManual]);
});

test('Esatto official finder prefers user manual links over product cards', () => {
  const links = extractEsattoDownloadLinks(`
    <a href="/s/Esatto_ProductCard-EFLW800.pdf">Product Card</a>
    <a href="/s/EFLW500_EFLW600_EFLW800_UserManual.pdf">User Manual</a>
    <a href="/s/EFLW800_QSG.pdf">Quick Start Guide</a>
  `, 'https://esatto.house/laundry/p/8kg-front-load-washing-machine-eflw800');

  assert.equal(links[0].resourceType, 'user_manual');
  assert.equal(links[0].url, 'https://esatto.house/s/EFLW500_EFLW600_EFLW800_UserManual.pdf');
});

test('Esatto finder persists exact product-page discovery evidence for CDN redirects', async () => {
  const productUrl = 'https://esatto.house/discontinued-products/p/207l-top-mount-refrigerator-stainless-steel-etm207x';
  const artifactUrl = 'https://esatto.house/s/Esatto_UserManual_ETM207-239-268_0518.pdf';
  const productHtml = `<html><head><title>ETM207X refrigerator</title></head><body>
    <h1>ETM207X</h1><a href="${artifactUrl}">User Manual</a></body></html>`;
  const writes = [];
  const result = await findEsattoOfficialPdf({ model: 'ETM207X' }, {
    fetchImpl: async (url) => ({
      ok: true,
      status: 200,
      text: async () => String(url).endsWith('/sitemap.xml')
        ? `<urlset><url><loc>${productUrl}</loc></url></urlset>`
        : productHtml,
    }),
    writeObject: async (path, bytes) => writes.push([path, Buffer.from(bytes)]),
  });
  const hash = createHash('sha256').update(productHtml).digest('hex');
  assert.equal(result.sourceUrl, artifactUrl);
  assert.deepEqual(result.discoveryProvenance, {
    schemaVersion: 1,
    method: 'official_product_page',
    market: 'AU',
    discoveryUrl: productUrl,
    requestedModel: 'ETM207X',
    matchedModel: 'ETM207X',
    artifactUrl,
    artifactLinkUrl: artifactUrl,
    discoveryContentSha256: hash,
    discoveryObjectPath: `evidence/web/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.html`,
    discoveryByteSize: Buffer.byteLength(productHtml),
  });
  assert.equal(writes.length, 3);
  const pageWrite = writes.find(([path]) => path === result.discoveryProvenance.discoveryObjectPath);
  assert.ok(pageWrite);
  assert.equal(pageWrite[1].toString('utf8'), productHtml);
});

test('Esatto finder exhausts current and discontinued lanes and retains non-anchor PDF observations', async () => {
  const currentUrl = 'https://esatto.house/dishwashers/p/60cm-current-dishwasher-edw600';
  const archivedUrl = 'https://esatto.house/discontinued-products/p/45cm-dishwasher-edw456s';
  const artifactUrl = 'https://esatto.house/s/EDW456S_UserManual_V21-0523.pdf';
  const sitemap = `<urlset><url><loc>${currentUrl}</loc></url></urlset>`;
  const searchHtml = `<html><body><div class="search-result" data-url="${archivedUrl}">
    <span>Model <em>EDW456S</em></span></div></body></html>`;
  const productHtml = `<html><body><h1>EDW456S</h1><script type="application/json">${JSON.stringify({
    model: 'EDW456S',
    manual: artifactUrl,
  })}</script></body></html>`;
  const writes = [];
  const result = await findEsattoOfficialPdf({ model: 'EDW456S' }, {
    fetchImpl: async (url) => ({
      ok: true,
      status: 200,
      text: async () => String(url).endsWith('/sitemap.xml')
        ? sitemap
        : String(url).includes('/search?') ? searchHtml : productHtml,
    }),
    writeObject: async (path, bytes) => writes.push([path, Buffer.from(bytes)]),
  });

  assert.deepEqual(result.sourceLanes.map((lane) => [
    lane.laneId, lane.status, lane.supported,
  ]), [
    ['current_product', 'complete', true],
    ['discontinued_archive', 'complete', true],
    ['support_search_api', 'complete', true],
    ['official_document_cdn', 'complete', true],
    ['official_product_detail', 'complete', true],
  ]);
  assert.equal(result.catalogState, 'archived');
  assert.ok(result.resources.some((resource) => (
    resource.sourceUrl === archivedUrl
      && resource.sourceLaneId === 'official_product_detail'
      && resource.resourceType === 'product_page'
  )));
  assert.ok(result.resources.some((resource) => (
    resource.sourceUrl === artifactUrl
      && resource.sourceLaneId === 'official_document_cdn'
      && resource.resourceType === 'user_manual'
  )));
  assert.equal(writes.length, 3);
  assert.ok(result.sourceLanes
    .filter((lane) => lane.supported)
    .every((lane) => lane.provenance.length > 0));
});

test('Esatto parser extracts fridge dimensions and clearances from user manual text', () => {
  const parsed = parseEsattoText(`
    Model: EBF124W
    Installation
    Clearances: Ensure that air can circulate freely around the back of the cabinet.
    Allow at least 10cm clear space at the back, 10cm at the sides of the unit and 20cm between the top and any surface above.
    Specifications
    Model: EBF124W
    Product Dimensions: W 501 × D 540 × H 858 (mm)
    Other Features: Separate chilling compartment, reversible door
  `, {
    target: { brand: 'Esatto', sku: 'EBF124W', category: 'fridge' },
    sourceUrl: 'https://esatto.house/s/EBF124W_UserManual.pdf',
    extractionDate: '2026-05-19T00:00:00.000Z'
  });

  assert.deepEqual(parsed.data.dimensions, {
    width_mm: 501,
    depth_mm: 540,
    height_mm: 858,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(parsed.data.clearance_requirements, {
    top_mm: 200,
    left_mm: 100,
    right_mm: 100,
    rear_mm: 100
  });
  assert.equal(parsed.data.flags.reversible_door, true);
});

test('Esatto parser extracts colon-form fridge dimensions from the exact model block', () => {
  const parsed = parseEsattoText(`
    Model: EBF69W
    Product Dimensions: W: 445mm, D: 510mm, H: 630mm
    Model: EBF95W, EBF95S
    Product Dimensions: W: 472mm, D: 450mm, H: 860mm
    Clearances: Allow at least 10cm clear space at the back, 10cm at the sides of the unit and 30cm between the top and any surface above.
  `, {
    target: { brand: 'Esatto', sku: 'EBF95W', category: 'fridge' },
    sourceUrl: 'https://esatto.house/s/EBF69W_EBF95W_UserManual.pdf',
    extractionDate: '2026-05-19T00:00:00.000Z'
  });

  assert.deepEqual(parsed.data.dimensions, {
    width_mm: 472,
    depth_mm: 450,
    height_mm: 860,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(parsed.data.clearance_requirements, {
    top_mm: 300,
    left_mm: 100,
    right_mm: 100,
    rear_mm: 100
  });
});

test('Esatto parser refuses ambiguous multi-model fridge dimensions without a matching model block', () => {
  assert.throws(() => parseEsattoText(`
    Model: EBF69W
    Product Dimensions: W: 445mm, D: 510mm, H: 630mm
    Model: EBF95W
    Product Dimensions: W: 472mm, D: 450mm, H: 860mm
    Clearances: Allow at least 10cm clear space at the back, 10cm at the sides of the unit and 30cm between the top and any surface above.
  `, {
    target: { brand: 'Esatto', sku: 'EBF87D1', category: 'fridge' },
    sourceUrl: 'https://esatto.house/s/EBF87D1_UserManual.pdf'
  }), /requires a model-specific Product Dimensions row/);
});

test('Esatto parser extracts integrated dishwasher dimensions and opening-derived clearance', () => {
  const parsed = parseEsattoText(`
    Esatto integrated dishwasher user manual
    https://esatto.house/s/EDWI605S_UserManual.pdf
    Illustrations of cabinet dimensions and installation position of the dishwasher.
    90 ° 90 °
    580mm 580mm
    820mm 820mm
    misleading repeated diagram labels.
    1. Less than 5 mm between the top of dishwasher and cabinet and the outer door aligned to cabinet.
    90° 90°
    600 mm
    820 mm
    580 mm
    Technical Information
    DIMENSIONS
    Height (H)
    Width (W)
    Depth (D1)
    Depth (D2)
    845mm
    598mm
    600mm (with the door closed)
    1175mm (with the door opened 90°)
    Technical Information
    DIMENSIONS
    Height (H)
    Width (W)
    Depth (D1)
    Depth (D2)
    815mm
    598mm
    550mm (with the door closed)
    1150mm (with the door opened 90°)
  `, {
    target: { brand: 'Esatto', sku: 'EDWI605S', category: 'dishwasher' },
    sourceUrl: 'https://esatto.house/s/EDWI605S_UserManual.pdf',
    extractionDate: '2026-05-19T00:00:00.000Z'
  });

  assert.deepEqual(parsed.data.dimensions, {
    height_mm: 815,
    width_mm: 598,
    depth_mm: 550,
    door_open_90_depth_mm: null
  });
  assert.deepEqual(parsed.data.clearance_requirements, {
    top_mm: 5,
    left_mm: 1,
    right_mm: 1,
    rear_mm: 30
  });
  assert.equal(parsed.data.flags.requires_plumbing, true);
});

test('Esatto parser fails closed for laundry documents without explicit clearances', () => {
  assert.throws(() => parseEsattoText(`
    Model: EFLW800
    Product Dimensions: W 595 × D 565 × H 850 (mm)
  `, {
    target: { brand: 'Esatto', sku: 'EFLW800', category: 'washing_machine' },
    sourceUrl: 'https://esatto.house/s/EFLW800_UserManual.pdf'
  }), /requires explicit clearance rules/);
});
