import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFisherPaykelSkuSearchVariants,
  extractPdfResources,
  extractProductPageUrls,
  findFisherPaykelProductPage,
  findFisherPaykelOfficialPdf
} from '../../scripts/pdf-pipeline/fisher-paykel-official.js';

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
    }
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
    }
  });

  assert.equal(calls.length, 2);
  assert.equal(result.resourceType, 'quick_reference_guide');
  assert.equal(result.source, 'fisher-paykel-official-quick_reference_guide');
  assert.match(result.sourceUrl, /QRG-AU-26552\.pdf$/);
  assert.deepEqual(result.resources.map((resource) => resource.type), [
    'quick_reference_guide',
    'installation_manual'
  ]);
});
