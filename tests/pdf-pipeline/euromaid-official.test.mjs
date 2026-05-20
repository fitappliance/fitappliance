import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractEuromaidDownloadLinks,
  findEuromaidOfficialPdf
} from '../../scripts/pdf-pipeline/euromaid-official.js';

test('Euromaid downloads parser keeps exact SKU PDFs and prefers spec sheets', () => {
  const html = `
    <a class="downloads-file-link" data-filename="E14DWX User Manual" href="/sites/g/files/emiian466/files/2021-03/E14DWX_User-Manual.pdf">Manual</a>
    <a class="downloads-file-link" data-filename="EUROMAID E14DWX Spec Sheet" href="/sites/g/files/emiian466/files/2021-03/EUROMAID-EclipseSeries_E14DWX_SpecSheet.pdf">Spec</a>
    <a class="downloads-file-link" data-filename="E14FID Spec Sheet" href="/sites/g/files/emiian466/files/2024-09/E14FID.pdf">Other model</a>
  `;

  const links = extractEuromaidDownloadLinks(html, 'https://www.euromaid.com/en-au/downloads?keywords=E14DWX', 'E14DWX');

  assert.equal(links.length, 2);
  assert.equal(links[0].resourceType, 'specification_sheet');
  assert.match(links[0].sourceUrl, /E14DWX_SpecSheet\.pdf$/);
  assert.ok(links.every((link) => /E14DWX/i.test(`${link.label} ${link.sourceUrl}`)));
});

test('Euromaid official finder fetches downloads search and returns ranked resources', async () => {
  const html = `
    <a class="downloads-file-link" data-filename="ETM221W User Manual" href="/sites/g/files/emiian466/files/2022-01/ETM221W_User_Manual.pdf">Manual</a>
    <a class="downloads-file-link" data-filename="Spec Sheet - 198 Litre Top Mount White - ETM221W" href="/sites/g/files/emiian466/files/2022-01/Spec%20Sheet%20-%20198%20Litre%20Top%20Mount%20White%20-%20ETM221W.pdf">Spec</a>
  `;
  const requested = [];
  const result = await findEuromaidOfficialPdf(
    { sku: 'ETM221W', brand: 'Euromaid' },
    {
      fetchImpl: async (url) => {
        requested.push(url);
        return {
          ok: true,
          text: async () => html
        };
      }
    }
  );

  assert.deepEqual(requested, ['https://www.euromaid.com/en-au/downloads?keywords=ETM221W']);
  assert.equal(result.resourceType, 'specification_sheet');
  assert.equal(result.resources.length, 2);
  assert.match(result.sourceUrl, /ETM221W\.pdf$/);
});
