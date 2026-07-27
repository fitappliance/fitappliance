import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  buildFisherPaykelSkuSearchVariants,
  classifyFisherPaykelProductPage,
  extractExactSupportHit,
  extractPdfResources,
  extractProductPageUrls,
  extractSupportProductResources,
  findFisherPaykelProductPage,
  findFisherPaykelOfficialPdf,
  resolveSalesforceDistributionPdf
} from '../../scripts/pdf-pipeline/fisher-paykel-official.js';

test('Fisher & Paykel official finder classifies an exact accessory page without trusting navigation text', () => {
  const accessoryUrl = 'https://www.fisherpaykel.com/au/accessories/cooling-accessories/door-panel-for-integrated-ice-and-water-refrigerator-freezer-80cm-french-door-rd80u-25622.html';
  const accessory = classifyFisherPaykelProductPage(`
    <title>Door Panel for Integrated Refrigerator Freezer, 80cm, RD80U</title>
    <h1>Door Panel for Integrated Refrigerator Freezer, 80cm</h1>
    <span>RD80U</span>
  `, accessoryUrl, 'RD80U');
  assert.equal(accessory.classification, 'NON_APPLIANCE_ACCESSORY');
  assert.equal(accessory.reasonCode, 'official_non_appliance_accessory');

  const appliance = classifyFisherPaykelProductPage(`
    <nav>Accessories</nav>
    <title>538L Series 7 Quad Door Refrigerator Freezer, RF605QNUVB1</title>
    <h1>538L Series 7 Quad Door Refrigerator Freezer</h1>
    <span>RF605QNUVB1</span>
  `, 'https://www.fisherpaykel.com/au/cooling/freestanding/rf605qnuvb1-26552.html', 'RF605QNUVB1');
  assert.equal(appliance.classification, 'UNRESOLVED_APPLIANCE_IDENTITY');
  assert.equal(appliance.reasonCode, null);
});

test('Fisher & Paykel official finder closes all persisted source lanes for an exact accessory', async () => {
  const written = new Map();
  const result = await findFisherPaykelOfficialPdf({ sku: 'RD80U' }, {
    writeObject: async (path, bytes) => written.set(path, Buffer.from(bytes)),
    fetchImpl: async (url) => {
      const href = String(url);
      if (href.includes('/au/search/')) {
        return new Response(`
          <a class="pdp" href="/au/accessories/cooling-accessories/door-panel-rd80u-25622.html">RD80U</a>
        `, { status: 200, headers: { 'content-type': 'text/html' } });
      }
      if (href.includes('/au/accessories/')) {
        return new Response(`
          <title>Door Panel for Integrated Refrigerator Freezer, 80cm, RD80U</title>
          <h1>Door Panel for Integrated Refrigerator Freezer, 80cm</h1><span>RD80U</span>
        `, { status: 200, headers: { 'content-type': 'text/html' } });
      }
      if (href.includes('/api/search')) {
        return new Response(JSON.stringify({ hits: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request: ${href}`);
    },
  });

  assert.equal(result.productIdentityFinding.reasonCode, 'official_non_appliance_accessory');
  assert.deepEqual(result.resources, []);
  assert.ok(result.sourceLanes.filter((lane) => lane.required).every((lane) => lane.status === 'complete'));
  assert.ok(result.sourceLanes.filter((lane) => lane.required).every((lane) => lane.provenance.length > 0));
  const laneProvenance = result.sourceLanes.flatMap((lane) => lane.provenance);
  assert.ok(laneProvenance.every((entry) => entry.market === 'AU'));
  assert.ok(laneProvenance.every((entry) => !/[?&]market=NZ(?:&|$)/.test(entry.discoveryUrl)));
  assert.ok(written.size >= 3);
});

test('Fisher & Paykel official finder extracts matching PDP URLs from search HTML', () => {
  const html = `
    <a href="/au/cooling/freestanding/538l-series-7-rf605qnuvb1-26552.html"
      class="pdp">RF605QNUVB1</a>
    <a href="/au/cooling/freestanding/other-model-rf605qduvx2-123.html" class="pdp">Other</a>
  `;

  assert.deepEqual(extractProductPageUrls(html, 'RF605QNUVB1'), [
    'https://www.fisherpaykel.com/au/cooling/freestanding/538l-series-7-rf605qnuvb1-26552.html'
  ]);
});

test('Fisher & Paykel official finder builds conservative SKU fallback variants', () => {
  assert.deepEqual(buildFisherPaykelSkuSearchVariants('RF610ADUQSX4'), [
    'RF610ADUQSX4',
    'RF610ADU'
  ]);
  assert.deepEqual(buildFisherPaykelSkuSearchVariants('E450LXFD'), [
    'E450LXFD',
    'E450LXFD1',
    'E450L'
  ]);
  assert.deepEqual(buildFisherPaykelSkuSearchVariants('DK4W'), [
    'DK4W'
  ]);
});

test('Fisher & Paykel official finder retries safe SKU variants when exact PDP is absent', async () => {
  const calls = [];
  const result = await findFisherPaykelProductPage('RF610ADUQSX4', {
    fetchImpl: async (url) => {
      calls.push(url);
      if (String(url).includes('RF610ADUQSX4')) {
        return new Response('<a class="pdp" href="/au/cooling/freestanding/unrelated.html">Other</a>', { status: 200 });
      }
      return new Response(`
        <a class="pdp" href="/au/cooling/freestanding/569l-series-7-french-door-refrigerator-freezer-ice-and-water-rf610adub5-26493.html">
          RF610ADUB5
        </a>
      `, { status: 200 });
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(result.matchedSku, 'RF610ADU');
  assert.match(result.productPageUrl, /rf610adub5/);
});

test('Fisher & Paykel official finder retries revision-1 SKU suffix when exact PDP is absent', async () => {
  const calls = [];
  const result = await findFisherPaykelProductPage('E450LXFD', {
    fetchImpl: async (url) => {
      calls.push(url);
      if (String(url).includes('E450LXFD1')) {
        return new Response(`
          <a class="pdp" href="/au/cooling/freestanding/451l-vertical-refrigerator-e450lxfd1-24854.html">
            E450LXFD1
          </a>
        `, { status: 200 });
      }
      return new Response('<a class="pdp" href="/au/cooling/freestanding/unrelated.html">Other</a>', { status: 200 });
    }
  });

  assert.equal(calls.length, 2);
  assert.equal(result.matchedSku, 'E450LXFD1');
  assert.match(result.productPageUrl, /e450lxfd1/);
});

test('Fisher & Paykel official finder extracts SKU PDP URLs even when search markup omits the pdp class', () => {
  const html = `
    <a href="/au/cooling/integrated/91cm-series-7-integrated-refrigerator-freezer-ice-and-water-rs9120wru1-26536.html">
      Integrated fridge freezer
    </a>
  `;

  assert.deepEqual(extractProductPageUrls(html, 'RS9120WRU1'), [
    'https://www.fisherpaykel.com/au/cooling/integrated/91cm-series-7-integrated-refrigerator-freezer-ice-and-water-rs9120wru1-26536.html'
  ]);
});

test('Fisher & Paykel official finder prefers QRG PDFs over install and energy PDFs', () => {
  const html = `
    <a href="/on/demandware.static/-/Sites-fpa-master-catalog/default/energy.pdf">Energy Label</a>
    <a href="https://dam.fisherpaykel.com/KZ3PKN00/at/install.pdf">Installation Manual</a>
    <a href="/on/demandware.static/-/Sites-fpa-master-catalog/default/dw260843d2/QRG/AU/QRG-AU-26552.pdf">
      Quick Reference guide
    </a>
  `;
  const resources = extractPdfResources(html);

  assert.equal(resources[0].type, 'quick_reference_guide');
  assert.equal(
    resources[0].url,
    'https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw260843d2/QRG/AU/QRG-AU-26552.pdf'
  );
  assert.equal(resources[1].type, 'installation_manual');
});

test('Fisher & Paykel official finder captures RS9120WRU1 QRG and supporting guides from PDP resources', () => {
  const html = `
    <a class="link" href="/on/demandware.static/-/Sites-fpa-master-catalog/default/dwabab1581/QRG/AU/QRG-AU-26536.pdf">
      Quick Reference guide
    </a>
    <a class="link" href="https://dam.fisherpaykel.com/KZ3PKN00/at/gv5wgtngqwnw44hw96qwfb/FP-InstallGuide-en-IntegratedFridgeFreezer-RS9120W-RS36W80-0-845689D-NZ-AU-UK-IE-ASIA-SG-US-CA.pdf">
      Installation Guide
    </a>
  `;
  const resources = extractPdfResources(html);

  assert.equal(resources[0].type, 'quick_reference_guide');
  assert.equal(
    resources[0].url,
    'https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwabab1581/QRG/AU/QRG-AU-26536.pdf'
  );
  assert.ok(resources.some((resource) => resource.type === 'installation_manual'));
});

test('Fisher & Paykel official finder extracts PDF URLs embedded in JSON state', () => {
  const html = `
    <script>
      window.__INITIAL_STATE__ = {
        "resources": [{
          "title": "Quick Reference guide",
          "url": "https:\\/\\/www.fisherpaykel.com\\/on\\/demandware.static\\/-\\/Sites-fpa-master-catalog\\/default\\/dw56dad114\\/QRG\\/AU\\/QRG-AU-26156.pdf"
        }]
      };
    </script>
  `;
  const resources = extractPdfResources(html);

  assert.equal(resources[0].type, 'quick_reference_guide');
  assert.equal(
    resources[0].url,
    'https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw56dad114/QRG/AU/QRG-AU-26156.pdf'
  );
});

test('Fisher & Paykel official finder searches product page and returns best PDF', async () => {
  const calls = [];
  const result = await findFisherPaykelOfficialPdf({ sku: 'RF605QNUVB1' }, {
    fetchImpl: async (url) => {
      calls.push(url);
      if (String(url).includes('/au/search/')) {
        return new Response(`
          <a class="pdp" href="/au/cooling/freestanding/rf605qnuvb1-26552.html">RF605QNUVB1</a>
        `, { status: 200, headers: { 'content-type': 'text/html' } });
      }
      return new Response(`
        <a href="/on/demandware.static/-/Sites-fpa-master-catalog/default/dw260843d2/QRG/AU/QRG-AU-26552.pdf">
          Quick Reference guide
        </a>
        <a href="https://dam.fisherpaykel.com/KZ3PKN00/at/install-guide.pdf">
          Installation Guide
        </a>
      `, { status: 200, headers: { 'content-type': 'text/html' } });
    },
    supportMarkets: [],
  });

  assert.equal(calls.length, 2);
  assert.equal(result.resourceType, 'quick_reference_guide');
  assert.equal(result.source, 'fisher-paykel-official-quick_reference_guide');
  assert.match(result.sourceUrl, /QRG-AU-26552\.pdf$/);
  assert.deepEqual(result.resources.map((resource) => resource.type), [
    'quick_reference_guide',
    'installation_manual',
    'product_page',
  ]);
});

test('Fisher & Paykel official finder runs product-page and support discovery concurrently', async () => {
  let supportStarted;
  const supportReady = new Promise((resolve) => { supportStarted = resolve; });
  const sourceUrl = 'https://content.fisherpaykel.com/guides/DW60CDW2.pdf';
  const run = findFisherPaykelOfficialPdf({ sku: 'DW60CDW2' }, {
    supportMarkets: ['AU'],
    fetchImpl: async (url) => {
      const href = String(url);
      if (href.includes('/au/search/')) {
        await supportReady;
        return new Response('<p>No product page</p>', { status: 200 });
      }
      if (href.includes('/api/search') && href.includes('market=AU')) {
        supportStarted();
        return new Response(JSON.stringify({
          hits: [{ document: { model_no: 'DW60CDW2', name: 'Exact', sku: '80539' } }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (href.endsWith('/au/api/support/products/DW60CDW2')) {
        return new Response(JSON.stringify({
          canonicalPath: '/au/support/products/dishwasher-dw60cdw2--DW60CDW2',
          product: {
            modelNumber: 'DW60CDW2',
            articles: [{
              id: 'ka0exact', title: 'DW60CDW2 specification sheet',
              articleBody: `<p>DW60CDW2</p><a href="${sourceUrl}">Specification</a>`,
              articleType: 'Specification Sheet',
            }],
          },
          documentResources: [],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`Unexpected request: ${href}`);
    },
  });

  const result = await Promise.race([
    run,
    new Promise((_, reject) => setTimeout(() => reject(new Error('finder remained sequential')), 250)),
  ]);
  assert.equal(result.sourceUrl, sourceUrl);
  assert.equal(result.resourceType, 'specification_sheet');
});

test('Fisher & Paykel support discovery survives a failed consumer product-page request', async () => {
  const sourceUrl = 'https://content.fisherpaykel.com/guides/DE4560M1.pdf';
  const result = await findFisherPaykelOfficialPdf({ sku: 'DE4560M1' }, {
    supportMarkets: ['AU'],
    fetchImpl: async (url) => {
      const href = String(url);
      if (href.includes('/au/search/')) throw new TypeError('consumer search unavailable');
      if (href.includes('/api/search') && href.includes('market=AU')) {
        return new Response(JSON.stringify({
          hits: [{ document: { model_no: 'DE4560M1', name: 'Exact', sku: '92276' } }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (href.endsWith('/au/api/support/products/DE4560M1')) {
        return new Response(JSON.stringify({
          canonicalPath: '/au/support/products/dryer-de4560m1--DE4560M1',
          product: {
            modelNumber: 'DE4560M1',
            articles: [{
              id: 'ka0exact', title: 'DE4560M1 specification sheet',
              articleBody: `<p>DE4560M1</p><a href="${sourceUrl}">Specification</a>`,
              articleType: 'Specification Sheet',
            }],
          },
          documentResources: [],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`Unexpected request: ${href}`);
    },
  });

  assert.equal(result.sourceUrl, sourceUrl);
  assert.ok(result.failures.some((failure) => failure.stage === 'product_search'));
});

test('Fisher & Paykel official finder augments product-page PDFs with support API provenance', async () => {
  const installUrl = 'https://dam.fisherpaykel.com/KZ3PKN00/at/exact/FP-InstallGuide-en-DH9060HG1-NZ-AU.pdf';
  const result = await findFisherPaykelOfficialPdf({ sku: 'DH9060HG1' }, {
    supportMarkets: ['AU'],
    fetchImpl: async (url) => {
      const href = String(url);
      if (href.includes('/au/search/')) {
        return new Response('<a href="/au/laundry/dryers/dh9060hg1-93296.html">DH9060HG1</a>', { status: 200 });
      }
      if (href.endsWith('/au/laundry/dryers/dh9060hg1-93296.html')) {
        return new Response(`
          <a href="/on/demandware.static/-/Sites-fpa-master-catalog/default/qrg/QRG/AU/QRG-AU-93296.pdf">Quick Reference guide</a>
          <a href="${installUrl}">Installation Guide</a>
        `, { status: 200 });
      }
      if (href.includes('/api/search') && href.includes('market=AU')) {
        return new Response(JSON.stringify({
          hits: [{ document: { model_no: 'DH9060HG1', name: 'Exact', sku: '93296' } }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (href.endsWith('/au/api/support/products/DH9060HG1')) {
        return new Response(JSON.stringify({
          canonicalPath: '/au/support/products/dryer-dh9060hg1--DH9060HG1',
          product: {
            modelNumber: 'DH9060HG1',
            articles: [{
              id: 'install-exact',
              title: 'DH9060HG1 installation guide',
              articleBody: `<p>DH9060HG1</p><a href="${installUrl}">Installation guide</a>`,
              articleType: 'Installation Guide',
            }],
          },
          documentResources: [],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`Unexpected request: ${href}`);
    },
  });

  const supportResource = result.resources.find((resource) => resource.url === installUrl);
  assert.equal(result.sourceUrl.endsWith('QRG-AU-93296.pdf'), true);
  assert.equal(supportResource.discoveryProvenance.method, 'official_support_api');
  assert.equal(supportResource.discoveryProvenance.sourceMarket, 'AU');
  assert.equal(supportResource.discoveryProvenance.matchedModel, 'DH9060HG1');
});

test('Fisher & Paykel support discovery persists the exact product API response as bound JSON evidence', async () => {
  const sourceUrl = 'https://content.fisherpaykel.com/guides/RF610ADUQSX4-install.pdf';
  const productPayload = {
    canonicalPath: '/nz/support/products/refrig-rf610aduqsx4-fp-aa--RF610ADUQSX4',
    product: {
      modelNumber: 'RF610ADUQSX4',
      articles: [{
        id: 'ka0-rf610-install',
        title: 'RF610ADUQSX4 installation guide',
        articleBody: `<p>RF610ADUQSX4</p><a href="${sourceUrl}">Installation guide</a>`,
        articleType: 'Installation Guide',
      }],
    },
    documentResources: [],
  };
  const productBytes = Buffer.from(JSON.stringify(productPayload));
  const productHash = createHash('sha256').update(productBytes).digest('hex');
  const writes = [];
  const result = await findFisherPaykelOfficialPdf({ sku: 'RF610ADUQSX4' }, {
    supportMarkets: ['NZ'],
    writeObject: async (path, bytes) => writes.push({ path, bytes: Buffer.from(bytes) }),
    fetchImpl: async (url) => {
      const href = String(url);
      if (href.includes('/au/search/')) return new Response('<p>No product page</p>', { status: 200 });
      if (href.includes('/api/search')) {
        return new Response(JSON.stringify({
          hits: [{ document: { model_no: 'RF610ADUQSX4', name: 'Exact', sku: '24314' } }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (href.endsWith('/nz/api/support/products/RF610ADUQSX4')) {
        return new Response(productBytes, { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`Unexpected request: ${href}`);
    },
  });

  const productObjectPath = `evidence/web/sha256/${productHash.slice(0, 2)}/${productHash.slice(2, 4)}/${productHash}.json`;
  const persistedProduct = writes.find((write) => write.path === productObjectPath);
  assert.ok(persistedProduct);
  assert.deepEqual(persistedProduct.bytes, productBytes);
  assert.deepEqual(result.resources[0].discoveryProvenance, {
    schemaVersion: 1,
    method: 'official_support_api',
    market: 'AU',
    sourceMarket: 'NZ',
    discoveryUrl: 'https://mf-support.mfe.fisherpaykel.com/nz/api/support/products/RF610ADUQSX4',
    requestedModel: 'RF610ADUQSX4',
    matchedModel: 'RF610ADUQSX4',
    artifactUrl: sourceUrl,
    artifactLinkUrl: sourceUrl,
    discoveryContentSha256: productHash,
    discoveryObjectPath: productObjectPath,
    discoveryByteSize: productBytes.length,
    documentId: 'ka0-rf610-install',
    originalFileName: 'RF610ADUQSX4-install.pdf',
  });
});

test('Fisher & Paykel support discovery hash-binds direct document resources', async () => {
  const sourceUrl = 'https://dam.fisherpaykel.com/KZ3PKN00/at/install/FP-Washsmart-installation-guide-WA60-models.pdf';
  const productPayload = {
    canonicalPath: '/au/support/laundry/washing-machines/75kg-series-7-top-loader-washer--WA7560E1',
    product: { modelNumber: 'WA7560E1', articles: [] },
    documentResources: [{
      url: sourceUrl,
      name: 'FP-Washsmart-installation-guide-WA60-models.pdf',
      subType: 'Installation',
      resourceTitle: 'Installation Guide (English)',
    }],
  };
  const productBytes = Buffer.from(JSON.stringify(productPayload));
  const productHash = createHash('sha256').update(productBytes).digest('hex');
  const result = await findFisherPaykelOfficialPdf({ sku: 'WA7560E1' }, {
    supportMarkets: ['AU'],
    writeObject: async () => {},
    fetchImpl: async (url) => {
      const href = String(url);
      if (href.includes('/au/search/')) return new Response('<p>No product page</p>', { status: 200 });
      if (href.includes('/api/search')) {
        return new Response(JSON.stringify({
          hits: [{ document: { model_no: 'WA7560E1', name: 'Exact', sku: '92244' } }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (href.endsWith('/au/api/support/products/WA7560E1')) {
        return new Response(productBytes, { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`Unexpected request: ${href}`);
    },
  });

  assert.deepEqual(result.resources[0].discoveryProvenance, {
    schemaVersion: 1,
    method: 'official_support_api',
    market: 'AU',
    sourceMarket: 'AU',
    discoveryUrl: 'https://mf-support.mfe.fisherpaykel.com/au/api/support/products/WA7560E1',
    requestedModel: 'WA7560E1',
    matchedModel: 'WA7560E1',
    artifactUrl: sourceUrl,
    artifactLinkUrl: sourceUrl,
    discoveryContentSha256: productHash,
    discoveryObjectPath: `evidence/web/sha256/${productHash.slice(0, 2)}/${productHash.slice(2, 4)}/${productHash}.json`,
    discoveryByteSize: productBytes.length,
    discoveryRecordType: 'support_document_resource',
    documentId: 'documentResources:0',
    documentTitleKey: 'Installation|Installation Guide (English)',
    originalFileName: 'FP-Washsmart-installation-guide-WA60-models.pdf',
  });
});

test('Fisher & Paykel support discovery does not hash-bind incomplete direct document metadata', async () => {
  const sourceUrl = 'https://dam.fisherpaykel.com/KZ3PKN00/at/install/unnamed.pdf';
  const productBytes = Buffer.from(JSON.stringify({
    canonicalPath: '/au/support/laundry/washing-machines/75kg-series-7-top-loader-washer--WA7560E1',
    product: { modelNumber: 'WA7560E1', articles: [] },
    documentResources: [{ url: sourceUrl }],
  }));
  const result = await findFisherPaykelOfficialPdf({ sku: 'WA7560E1' }, {
    supportMarkets: ['AU'],
    writeObject: async () => {},
    fetchImpl: async (url) => {
      const href = String(url);
      if (href.includes('/au/search/')) return new Response('<p>No product page</p>', { status: 200 });
      if (href.includes('/api/search')) {
        return new Response(JSON.stringify({
          hits: [{ document: { model_no: 'WA7560E1', name: 'Exact', sku: '92244' } }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (href.endsWith('/au/api/support/products/WA7560E1')) {
        return new Response(productBytes, { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`Unexpected request: ${href}`);
    },
  });

  assert.equal(result.resources[0].discoveryProvenance.artifactUrl, sourceUrl);
  for (const field of [
    'artifactLinkUrl', 'discoveryContentSha256', 'discoveryObjectPath', 'discoveryByteSize',
    'discoveryRecordType', 'documentId', 'documentTitleKey',
  ]) {
    assert.equal(result.resources[0].discoveryProvenance[field], undefined);
  }
  assert.equal(result.resources[0].discoveryProvenance.originalFileName, 'unnamed.pdf');
});

test('Fisher & Paykel exact support evidence outranks a sibling page found through a broad search variant', async () => {
  const siblingPage = 'https://www.fisherpaykel.com/au/cooling/freestanding/rf610adub5-26493.html';
  const siblingQrg = 'https://www.fisherpaykel.com/on/demandware.static/QRG/AU/QRG-AU-26493.pdf';
  const supportInstall = 'https://content.fisherpaykel.com/guides/RF610ADUQSX4-install.pdf';
  const supportSlug = 'refrig-rf610aduqsx4-fp-aa--RF610ADUQSX4';
  const result = await findFisherPaykelOfficialPdf({ sku: 'RF610ADUQSX4' }, {
    supportMarkets: ['AU', 'NZ'],
    fetchImpl: async (url) => {
      const href = String(url);
      if (href.includes('/au/search/') && href.includes('RF610ADUQSX4')) {
        return new Response('<p>No exact product</p>', { status: 200 });
      }
      if (href.includes('/au/search/') && href.includes('RF610ADU')) {
        return new Response(`<a class="pdp" href="${siblingPage}">RF610ADUB5</a>`, { status: 200 });
      }
      if (href === siblingPage) {
        return new Response(`<a href="${siblingQrg}">Quick Reference guide</a>`, { status: 200 });
      }
      if (href.includes('/api/search') && href.includes('market=AU')) {
        return new Response(JSON.stringify({ hits: [] }), { status: 200 });
      }
      if (href.includes('/api/search') && href.includes('market=NZ')) {
        return new Response(JSON.stringify({
          hits: [{ document: {
            model_no: 'RF610ADUQSX4', name: 'REFRIG RF610ADUQSX4 FP AA', sku: '24314',
          } }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (href.endsWith('/nz/api/support/products/RF610ADUQSX4')) {
        return new Response(null, {
          status: 301,
          headers: { location: `/nz/support/products/${supportSlug}/` },
        });
      }
      if (href.endsWith(`/nz/api/support/products/${supportSlug}`)) {
        return new Response(JSON.stringify({
          canonicalPath: `/nz/support/products/${supportSlug}`,
          product: {
            modelNumber: 'RF610ADUQSX4',
            articles: [{
              id: 'exact-install',
              title: 'RF610ADUQSX4 installation guide',
              articleBody: `<p>RF610ADUQSX4</p><a href="${supportInstall}">Guide</a>`,
              articleType: 'Installation Guide',
            }],
          },
          documentResources: [],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`Unexpected request: ${href}`);
    },
  });

  assert.equal(result.sourceUrl, supportInstall);
  assert.equal(result.resourceType, 'installation_manual');
  assert.equal(result.productPageUrl, `https://www.fisherpaykel.com/nz/support/products/${supportSlug}`);
  assert.equal(result.fallbackProductPageUrl, siblingPage);
  assert.equal(result.dimensionResourceCount, 1);
  assert.equal(
    result.resources.find((resource) => resource.url === siblingQrg)?.evidenceScope,
    'research_only_search_variant',
  );
});

test('Fisher & Paykel support search accepts only an exact model hit', () => {
  const payload = {
    hits: [
      { document: { model_no: 'DW60CDW1', name: 'Sibling', sku: '80428' } },
      { document: { model_no: 'DW60CDW2', name: 'Exact model', sku: '80539' } },
      { document: { model_no: 'DW60CDW20', name: 'Longer sibling', sku: '99999' } }
    ]
  };

  assert.deepEqual(extractExactSupportHit(payload, 'DW60CDW2'), {
    model_no: 'DW60CDW2',
    name: 'Exact model',
    sku: '80539'
  });
  assert.equal(extractExactSupportHit(payload, 'DW60CDX2'), null);
});

test('Fisher & Paykel support resources reject product and article sibling leakage', () => {
  const siblingProduct = {
    product: {
      modelNumber: 'DW60CDW1',
      articles: [{
        id: 'sibling',
        title: 'Installation guide',
        articleBody: '<p>DW60CDW2</p><a href="https://example.com/exact.pdf">Guide</a>',
        articleType: 'Installation Guide'
      }]
    }
  };
  assert.deepEqual(extractSupportProductResources(siblingProduct, 'DW60CDW2'), []);

  const exactProductWithSiblingArticle = {
    product: {
      modelNumber: 'DW60CDW2',
      articles: [
        {
          id: 'sibling',
          title: 'DW60CDW1 installation guide',
          articleBody: '<p>DW60CDW1</p><a href="https://example.com/sibling.pdf">Guide</a>',
          articleType: 'Installation Guide'
        },
        {
          id: 'exact',
          title: '60cm dishwasher installation guide',
          articleBody: '<p>Applies to DW60CDW2 only.</p><a href="https://content.fisherpaykel.com/guides/exact.pdf">Guide</a>',
          articleType: 'Installation Guide'
        }
      ]
    }
  };

  assert.deepEqual(
    extractSupportProductResources(exactProductWithSiblingArticle, 'DW60CDW2').map((resource) => resource.url),
    ['https://content.fisherpaykel.com/guides/exact.pdf']
  );
});

test('Fisher & Paykel support resources retain dimension-capable articles attached to the exact product', () => {
  const installUrl = 'https://fisherpaykel.my.salesforce.com/sfc/p/90000000kftP/a/Jw000000K2Gz/install-token';
  const specUrl = 'https://fisherpaykel.my.salesforce.com/sfc/p/90000000kftP/a/Jw0000011Iwn/spec-token';
  const siblingUrl = 'https://content.fisherpaykel.com/guides/DW60CHW2-install.pdf';
  const resources = extractSupportProductResources({
    product: {
      modelNumber: 'DW60CHW1',
      articles: [
        {
          id: 'install-attached',
          title: 'Dishwasher Classic Handle - Installation Guide (2837)',
          articleBody: `<p>Cavity preparation and required clearances.</p><a href="${installUrl}">Guide</a>`,
          articleType: 'Installation Guide',
        },
        {
          id: 'family-spec-attached',
          title: 'DW60CH1 - Specification Sheet',
          articleBody: `<p>Product dimensions and specifications.</p><a href="${specUrl}">Specification</a>`,
          articleType: 'Troubleshooting',
        },
        {
          id: 'sibling-explicit',
          title: 'DW60CHW2 installation guide',
          articleBody: `<p>Applies to DW60CHW2.</p><a href="${siblingUrl}">Guide</a>`,
          articleType: 'Installation Guide',
        },
      ],
    },
  }, 'DW60CHW1');

  assert.deepEqual(resources.map((resource) => [
    resource.articleId,
    resource.type,
    resource.evidenceScope,
  ]), [
    ['family-spec-attached', 'specification_sheet', 'exact_support_product_article'],
    ['install-attached', 'installation_manual', 'exact_support_product_article'],
  ]);
});

test('Fisher & Paykel support resources retain parts manuals only as non-dimension diagnostics', () => {
  const partsUrl = 'https://content.fisherpaykel.com/CBW/service/fpa-dishwashers/fpa-parts-dishwashers/Dishwasher/80914-A-DW60CHW1.pdf';
  const resources = extractSupportProductResources({
    product: {
      modelNumber: 'DW60CHW1',
      articles: [{
        id: 'parts-exact',
        title: 'Spare parts manual for 80914-A',
        articleBody: `<p>Parts diagrams for model DW60CHW1.</p><a href="${partsUrl}">Parts</a>`,
        articleType: 'Parts Manual',
      }],
    },
  }, 'DW60CHW1');

  assert.equal(resources.length, 1);
  assert.equal(resources[0].type, 'parts_manual');
  assert.equal(resources[0].evidenceScope, 'exact_model_identity_article');
  assert.ok(resources[0].score <= 0);
});

test('Fisher & Paykel Salesforce distribution resolver returns an original PDF URL', async () => {
  const publicUrl = 'https://fisherpaykel.my.salesforce.com/sfc/p/90000000kftP/a/Jw000004hSYD/content-token';
  const calls = [];
  const result = await resolveSalesforceDistributionPdf(publicUrl, {
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      if (String(url).includes('contentDistributionApp.app')) {
        return new Response(JSON.stringify({
          auraConfig: {
            context: {
              fwuid: 'framework-id',
              loaded: { 'APPLICATION@markup://forceContent:contentDistributionApp': 'app-version' }
            }
          }
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        actions: [{
          state: 'SUCCESS',
          returnValue: {
            versionId: '068Jw00000ecUKeIAM',
            viewId: '05HJw00000Q8wuHMAR',
            allowOriginalDownload: true,
            fileType: 'PDF',
            name: 'Exact installation guide'
          }
        }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[1].init.method, 'POST');
  assert.match(result.url, /^https:\/\/fisherpaykel\.my\.salesforce\.com\/sfc\/dist\/version\/download\//);
  assert.match(result.url, /oid=00D90000000kftP/);
  assert.match(result.url, /ids=068Jw00000ecUKeIAM/);
  assert.equal(result.name, 'Exact installation guide');
});

test('Fisher & Paykel official finder falls back to exact NZ/AU support records', async () => {
  const calls = [];
  const supportSlug = 'dishwasher-dw60cdw2-fp-nzau--DW60CDW2';
  const distributionUrl = 'https://fisherpaykel.my.salesforce.com/sfc/p/90000000kftP/a/Jw000004hSYD/content-token';
  const result = await findFisherPaykelOfficialPdf({ sku: 'DW60CDW2' }, {
    fetchImpl: async (url, init = {}) => {
      const href = String(url);
      calls.push({ href, init });
      if (href.includes('/au/search/')) {
        return new Response('<p>No product page</p>', { status: 200 });
      }
      if (href.includes('/api/search') && href.includes('market=AU')) {
        return new Response(JSON.stringify({ hits: [] }), { status: 200 });
      }
      if (href.includes('/api/search') && href.includes('market=NZ')) {
        return new Response(JSON.stringify({
          hits: [
            { document: { model_no: 'DW60CDW1', name: 'Sibling', sku: '80428' } },
            { document: { model_no: 'DW60CDW2', name: 'Exact', sku: '80539' } }
          ]
        }), { status: 200 });
      }
      if (href.endsWith('/nz/api/support/products/DW60CDW2')) {
        return new Response(null, {
          status: 301,
          headers: { location: `/nz/support/products/${supportSlug}/` }
        });
      }
      if (href.endsWith(`/nz/api/support/products/${supportSlug}`)) {
        return new Response(JSON.stringify({
          canonicalPath: `/nz/support/products/${supportSlug}`,
          product: {
            modelNumber: 'DW60CDW2',
            articles: [{
              id: 'ka0exact',
              title: '60cm dishwasher installation guide',
              articleBody: `<p>DW60CDW2</p><iframe src="${distributionUrl}"></iframe>`,
              articleType: 'Installation Guide'
            }]
          },
          documentResources: []
        }), { status: 200 });
      }
      if (href.includes('contentDistributionApp.app')) {
        return new Response(JSON.stringify({
          auraConfig: {
            context: {
              fwuid: 'framework-id',
              loaded: { 'APPLICATION@markup://forceContent:contentDistributionApp': 'app-version' }
            }
          }
        }), { status: 200 });
      }
      if (href.includes('/aura?')) {
        return new Response(JSON.stringify({
          actions: [{
            state: 'SUCCESS',
            returnValue: {
              versionId: '068Jw00000ecUKeIAM',
              viewId: '05HJw00000Q8wuHMAR',
              allowOriginalDownload: true,
              fileType: 'PDF',
              name: 'DW60CDW2 installation guide'
            }
          }]
        }), { status: 200 });
      }
      throw new Error(`Unexpected request: ${href}`);
    }
  });

  assert.equal(result.matchedSku, 'DW60CDW2');
  assert.equal(result.supportMarket, 'NZ');
  assert.equal(result.resourceType, 'installation_manual');
  assert.match(result.sourceUrl, /\/sfc\/dist\/version\/download\//);
  assert.match(result.productPageUrl, new RegExp(`/nz/support/products/${supportSlug}$`));
  assert.deepEqual(result.resources[0].discoveryProvenance, {
    schemaVersion: 1,
    method: 'official_support_api',
    market: 'AU',
    sourceMarket: 'NZ',
    discoveryUrl: `https://mf-support.mfe.fisherpaykel.com/nz/api/support/products/${supportSlug}`,
    requestedModel: 'DW60CDW2',
    matchedModel: 'DW60CDW2',
    artifactUrl: result.resources[0].url,
    documentId: 'ka0exact',
    originalFileName: 'DW60CDW2 installation guide',
  });
  assert.ok(calls.some(({ href }) => href.includes('market=AU')));
  assert.ok(calls.some(({ href }) => href.includes('market=NZ')));
});
