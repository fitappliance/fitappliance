import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  buildLookupCandidates,
  buildLgDownloadUrl,
  findLgOfficialPdf,
  selectBestManualRow
} = require('../../scripts/pdf-pipeline/lg-official.js');

test('LG official finder selects the English PDF owner manual and builds the GSCS download URL', async () => {
  const payload = {
    retrieveManualSoftwareList: {
      modelList: { modelName: 'WV9-1412W' },
      manualList: {
        manualList: [
          {
            originalFileName: 'MFL71485444.zip',
            fileName: 'zip-id',
            manualType: 'Online Manual',
            fileType: 'HTML2'
          },
          {
            originalFileName: 'WM_EAP_MFL71485444_05_240704_00_OM_WEB.pdf',
            fileName: 'pdf-id',
            docId: '20151494701297',
            fileNamePrint: 'English',
            manualType: 'Owner’s Manual',
            MANUAL_CODE: 'OWM',
            fileType: 'PDF'
          }
        ]
      }
    }
  };
  const result = await findLgOfficialPdf({ sku: 'WV9-1412W' }, {
    fetchImpl: async (_url, options) => {
      assert.equal(options.method, 'POST');
      assert.equal(JSON.parse(options.body).csSalesCode, 'WV9-1412W');
      return {
        ok: true,
        json: async () => payload
      };
    }
  });

  assert.equal(result.sourceUrl, 'https://gscs-b2c.lge.com/open/downloadFile?fileId=pdf-id');
  assert.equal(result.source, 'lg-official-support-manual');
  assert.equal(result.originalFileName, 'WM_EAP_MFL71485444_05_240704_00_OM_WEB.pdf');
});

test('LG official finder retries discovered full SKU from retailer product URL when shorthand SKU misses', async () => {
  const calls = [];
  const payloadFor = (sku) => ({
    retrieveManualSoftwareList: {
      modelList: { modelName: sku },
      manualList: {
        manualList: sku === 'WWT-1910BX'
          ? [{
              originalFileName: 'WM_EAP_MFL71983233_00_241022_00_OM_WEB.pdf',
              fileName: 'washtower-pdf-id',
              docId: 'doc-1910',
              fileNamePrint: 'English',
              manualType: 'Owner’s Manual',
              MANUAL_CODE: 'OWM',
              fileType: 'PDF'
            }]
          : []
      }
    }
  });

  const result = await findLgOfficialPdf({
    sku: '1910BX',
    product: {
      discovery: {
        product_url: 'https://www.thegoodguys.com.au/lg-washtower-19kg-10kg-combo-washer-dryer-wwt-1910bx'
      }
    }
  }, {
    fetchImpl: async (_url, options) => {
      const sku = JSON.parse(options.body).csSalesCode;
      calls.push(sku);
      return {
        ok: true,
        json: async () => payloadFor(sku)
      };
    }
  });

  assert.deepEqual(calls, ['1910BX', 'WWT-1910BX']);
  assert.equal(result.lookupSku, 'WWT-1910BX');
  assert.equal(result.sourceUrl, 'https://gscs-b2c.lge.com/open/downloadFile?fileId=washtower-pdf-id');
});

test('LG lookup candidate builder extracts full laundry tower model from retailer slug', () => {
  assert.deepEqual(buildLookupCandidates({
    sku: '1016GX',
    product: {
      discovery: {
        product_url: 'https://www.thegoodguys.com.au/lg-16kg-10kg-combo-washer-dryer-wxlc-1016gx'
      }
    }
  }), ['1016GX', 'WXLC-1016GX']);
});

test('LG official finder fails closed when the support API returns no PDF rows', async () => {
  await assert.rejects(() => findLgOfficialPdf({ sku: 'UNKNOWN' }, {
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        retrieveManualSoftwareList: {
          manualList: {
            manualList: []
          }
        }
      })
    })
  }), /LG official PDF not found/);
});

test('LG official manual row selection ignores non-PDF online manuals', () => {
  const row = selectBestManualRow([
    { fileType: 'HTML2', fileName: 'zip-id', manualType: 'Online Manual' },
    { fileType: 'PDF', fileName: 'pdf-id', manualType: 'Owner Manual', fileNamePrint: 'English' }
  ]);
  assert.equal(row.fileName, 'pdf-id');
  assert.equal(buildLgDownloadUrl('abc 123'), 'https://gscs-b2c.lge.com/open/downloadFile?fileId=abc%20123');
});
