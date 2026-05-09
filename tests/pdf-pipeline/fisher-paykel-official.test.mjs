import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractPdfResources,
  extractProductPageUrls,
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
