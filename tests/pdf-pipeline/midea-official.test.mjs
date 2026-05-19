import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  extractMideaDownloadLinks,
  extractManualDownloadPrefixes,
  findMideaOfficialPdf,
  urlMatchesTargetSku
} = require('../../scripts/pdf-pipeline/midea-official.js');

test('Midea official finder extracts manualsdownload AEM data endpoint and ranks spec plus user manual PDFs', async () => {
  const productPage = 'https://www.midea.com/au/kitchen-appliances/dishwashers/under-bench/midea-easy-lift-dishwasher.mdw6099b15bdx';
  const html = `
    <script>
      window.__AEM_CONF__ = {
        "urlPrefix":"\\/content\\/midea-aem\\/au\\/kitchen-appliances\\/dishwashers\\/under-bench\\/midea-easy-lift-dishwasher\\/jcr:content\\/root\\/container\\/productcontainer_cop\\/productsku\\/manualsdownload"
      };
    </script>
  `;
  const dataJson = {
    code: 200,
    data: [
      {
        link: '/content/dam/midea-aem/au/pdp/mdw6099b15bdx/User-manual-MDW6099B15BDX.pdf',
        name: 'User manual MDW6099B15BDX',
        fileType: 'PDF'
      },
      {
        link: '/content/dam/midea-aem/au/pdp/mdw6099b15bdx/MDW6099B15BDX-Spec-Sheet.pdf',
        name: 'MDW6099B15BDX 60cm Dishwasher Spec Sheet',
        fileType: 'PDF'
      }
    ]
  };
  const calls = [];

  const result = await findMideaOfficialPdf({ sku: 'MDW6099B15BDX' }, {
    sitemapUrl: 'https://www.midea.com/au/sitemap.xml',
    fetchImpl: async (url) => {
      calls.push(url);
      if (url === 'https://www.midea.com/au/sitemap.xml') {
        return {
          ok: true,
          text: async () => `<urlset><url><loc>${productPage}</loc></url></urlset>`
        };
      }
      if (url === productPage) {
        return { ok: true, text: async () => html };
      }
      if (url.endsWith('/manualsdownload.data.json')) {
        return { ok: true, json: async () => dataJson, text: async () => JSON.stringify(dataJson) };
      }
      throw new Error(`unexpected URL ${url}`);
    }
  });

  assert.ok(calls.includes(productPage));
  assert.equal(result.sourceUrl, 'https://www.midea.com/content/dam/midea-aem/au/pdp/mdw6099b15bdx/MDW6099B15BDX-Spec-Sheet.pdf');
  assert.equal(result.source, 'midea-official-specification_sheet');
  assert.equal(result.resources.length, 2);
  assert.deepEqual(result.resources.map((resource) => resource.resourceType), ['specification_sheet', 'user_manual']);
});

test('Midea download helpers decode escaped AEM prefixes and ignore non-PDF rows', () => {
  const html = String.raw`{"urlPrefix":"\/content\/midea-aem\/au\/product\/jcr:content\/manualsdownload"}`;
  assert.deepEqual(extractManualDownloadPrefixes(html), ['/content/midea-aem/au/product/jcr:content/manualsdownload']);

  const links = extractMideaDownloadLinks({
    data: [
      { link: '/a/spec.pdf', name: 'Spec Sheet', fileType: 'PDF' },
      { link: '/a/image.png', name: 'Image', fileType: 'PNG' },
      { link: '/a/manual.pdf', name: 'User Manual', fileType: 'PDF' }
    ]
  }, 'https://www.midea.com/au/item');

  assert.deepEqual(links.map((link) => link.resourceType), ['specification_sheet', 'user_manual']);
});

test('Midea finder matches target SKU in official product URLs only', () => {
  assert.equal(
    urlMatchesTargetSku('https://www.midea.com/au/laundry/washing-machines/front-load/midea-mf210-front-load-washer-mf210w100bw.mf210w100bw', { sku: 'MF210W100BW' }),
    true
  );
  assert.equal(
    urlMatchesTargetSku('https://www.midea.com/au/laundry/washing-machines/front-load/midea-mf210-front-load-washer-mf210w90bw.mf210w90bw', { sku: 'MF210W100BW' }),
    false
  );
});
