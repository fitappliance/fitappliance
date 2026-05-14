import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
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
