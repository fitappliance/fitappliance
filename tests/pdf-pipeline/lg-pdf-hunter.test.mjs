import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  applyHunterWriteUpdates,
  buildHunterLookupCandidates,
  huntLgPdfTargets
} = require('../../scripts/pdf-pipeline/lg-pdf-hunter.js');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function makeRepo(manifest) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-lg-hunter-'));
  writeJson(path.join(repoRoot, 'data', 'manual-evidence.json'), manifest);
  return repoRoot;
}

test('LG PDF hunter expands retailer shorthand and title-embedded lookup candidates safely', () => {
  assert.deepEqual(buildHunterLookupCandidates({
    sku: '1016GX',
    category: 'washing_machine'
  }).slice(0, 7), [
    '1016GX',
    'WXLC-1016GX',
    'WXLS-1016GX',
    'WWT-1016GX',
    'WXT-1016GX',
    'WXL-1016GX',
    'WXC-1016GX'
  ]);

  assert.ok(buildHunterLookupCandidates({
    sku: 'GF-L708MBL French Door 708L',
    category: 'fridge'
  }).includes('GF-L708MBL'));

  assert.ok(buildHunterLookupCandidates({
    sku: 'GS-VB600PL',
    category: 'fridge'
  }).includes('GS-B600PL'));

  assert.ok(buildHunterLookupCandidates({
    sku: 'WV*-1208',
    category: 'washing_machine'
  }).includes('WV5-1208W'));

  assert.ok(buildHunterLookupCandidates({
    sku: 'GT-515*DC',
    category: 'fridge'
  }).includes('GT-515SDC'));

  assert.ok(buildHunterLookupCandidates({
    sku: 'GT-W6S',
    category: 'fridge'
  }).includes('GT-6S'));
});

test('huntLgPdfTargets tries expanded official lookup candidates before falling back to existing source URLs', async () => {
  const calls = [];
  const result = await huntLgPdfTargets({
    targets: [{
      id: 'lg-short',
      sku: '1016GX',
      category: 'washing_machine',
      brand: 'LG',
      product: { id: 'lg-short', brand: 'LG', model: '1016GX', cat: 'washing_machine' },
      sourceUrl: 'https://example.com/existing.pdf'
    }],
    officialFinder: async (target) => {
      calls.push(target.sku);
      if (target.sku === 'WXLC-1016GX') {
        return {
          sourceUrl: 'https://gscs-b2c.lge.com/open/downloadFile?fileId=official-id',
          source: 'lg-official-support-manual',
          lookupSku: 'WXLC-1016GX',
          originalFileName: 'WM_EAP_MANUAL.pdf'
        };
      }
      throw new Error('not found');
    },
    logger: { log() {}, warn() {} }
  });

  assert.deepEqual(calls.slice(0, 2), ['1016GX', 'WXLC-1016GX']);
  assert.equal(result.found.length, 1);
  assert.equal(result.found[0].lookupSku, 'WXLC-1016GX');
  assert.equal(result.found[0].sourceUrl, 'https://gscs-b2c.lge.com/open/downloadFile?fileId=official-id');
  assert.equal(result.missing.length, 0);
});

test('applyHunterWriteUpdates seeds official candidates without overwriting existing source URLs by default', () => {
  const repoRoot = makeRepo({
    schema_version: 1,
    last_updated: '2026-05-19',
    products: {
      'lg-new': {
        category: 'fridge',
        brand: 'LG',
        model: 'GB-B300MWH',
        status: 'needs_source',
        has_pdf_evidence: false
      },
      'lg-existing': {
        category: 'fridge',
        brand: 'LG',
        model: 'GF-L706PL',
        source_url: 'https://example.com/already-seeded.pdf',
        status: 'candidate',
        has_pdf_evidence: false
      }
    }
  });

  const summary = applyHunterWriteUpdates({
    repoRoot,
    found: [
      {
        id: 'lg-new',
        sku: 'GB-B300MWH',
        category: 'fridge',
        brand: 'LG',
        sourceUrl: 'https://gscs-b2c.lge.com/open/downloadFile?fileId=new-id',
        source: 'lg-official-support-manual',
        lookupSku: 'GB-B300MWH',
        originalFileName: 'REF_GAP.pdf'
      },
      {
        id: 'lg-existing',
        sku: 'GF-L706PL',
        category: 'fridge',
        brand: 'LG',
        sourceUrl: 'https://gscs-b2c.lge.com/open/downloadFile?fileId=replacement-id',
        source: 'lg-official-support-manual',
        lookupSku: 'GF-L706PL',
        originalFileName: 'replacement.pdf'
      }
    ],
    runAt: '2026-05-19T00:00:00.000Z'
  });

  assert.deepEqual(summary, { written: 1, skippedExisting: 1 });

  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'manual-evidence.json'), 'utf8'));
  assert.equal(manifest.products['lg-new'].source_url, 'https://gscs-b2c.lge.com/open/downloadFile?fileId=new-id');
  assert.equal(manifest.products['lg-new'].status, 'candidate');
  assert.equal(manifest.products['lg-new'].has_pdf_evidence, false);
  assert.equal(manifest.products['lg-new'].lookup_sku, 'GB-B300MWH');
  assert.equal(manifest.products['lg-existing'].source_url, 'https://example.com/already-seeded.pdf');
});
