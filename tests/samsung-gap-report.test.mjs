import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BUCKETS,
  analyzeSamsungGapsData,
  renderSamsungGapReport
} from '../scripts/analyze-samsung-gaps.js';

test('Samsung gap report classifies failures into evidence buckets', () => {
  const analysis = analyzeSamsungGapsData({
    failures: [
      {
        sku: 'SRF7300BSS',
        brand: 'Samsung',
        category: 'fridge',
        reason: 'PDP Not Found / source missing',
        error: 'Samsung official fetch failed with HTTP 404'
      },
      {
        sku: 'DW60BG750FSL',
        brand: 'Samsung',
        category: 'dishwasher',
        reason: 'Missing Clearance Section',
        error: 'Samsung dishwasher parser requires explicit clearance figures in an installation section.'
      },
      {
        sku: 'SR399WTC',
        brand: 'Samsung',
        category: 'fridge',
        reason: 'Missing Dimensions Section',
        error: 'Samsung layout-aware parser could not locate installation/specification sections.'
      },
      {
        sku: 'MARKETING1',
        brand: 'Samsung',
        category: 'fridge',
        reason: 'Model mismatch',
        error: 'Document model RF59A7010B1/SA does not match target MARKETING1.'
      }
    ]
  });

  assert.equal(analysis.summary.total_failures, 4);
  assert.equal(analysis.buckets[BUCKETS.MISSING_SOURCE].items.length, 1);
  assert.equal(analysis.buckets[BUCKETS.MISSING_CLEARANCE].items.length, 1);
  assert.equal(analysis.buckets[BUCKETS.UNREADABLE_LAYOUT].items.length, 1);
  assert.equal(analysis.buckets[BUCKETS.UNVERIFIED_ALIAS].items.length, 1);
});

test('Samsung gap report renders stable markdown details', () => {
  const markdown = renderSamsungGapReport(analyzeSamsungGapsData({
    runDate: '2026-05-10T00:00:00.000Z',
    failures: [
      {
        sku: 'DW60BG750FSL',
        brand: 'Samsung',
        category: 'dishwasher',
        reason: 'Missing Clearance Section',
        error: 'Samsung dishwasher parser requires explicit clearance figures in an installation section.'
      }
    ]
  }));

  assert.match(markdown, /Samsung Evidence Gap Report/);
  assert.match(markdown, /Bucket B: Missing Clearance/);
  assert.match(markdown, /DW60BG750FSL/);
});

test('Samsung gap report separates failures already resolved by approved evidence', () => {
  const analysis = analyzeSamsungGapsData({
    failures: [
      {
        key: 'fridge-manual-samsung-srf7300bss',
        sku: 'SRF7300BSS',
        brand: 'Samsung',
        category: 'fridge',
        reason: 'PDP Not Found / source missing',
        error: 'Samsung official fetch failed with HTTP 404'
      }
    ]
  }, {
    manualEvidence: {
      products: {
        'fridge-manual-samsung-srf7300bss': {
          has_pdf_evidence: true,
          evidence: [{ status: 'approved', raw_json_path: 'data/pdf-evidence-raw/SRF7300BSS.json' }]
        }
      }
    }
  });

  assert.equal(analysis.summary.total_failures, 1);
  assert.equal(analysis.summary.resolved_after_run, 1);
  assert.equal(analysis.buckets[BUCKETS.MISSING_SOURCE].items.length, 0);
});
