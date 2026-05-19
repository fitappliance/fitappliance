import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  extractMieleDownloadLinks,
  extractMieleProductUrls,
  findMieleOfficialPdf,
  findMielePdf,
  findMieleManualEvidencePdf,
  mieleEvidenceModelMatchesTarget
} = require('../../scripts/pdf-pipeline/miele-official.js');

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
  assert.equal(found.sourceUrl, 'https://media.miele.com/FS_11738290.pdf');
  assert.equal(found.verifiedAlias, 'FNS7794E');
});
