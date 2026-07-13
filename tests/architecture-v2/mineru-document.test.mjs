import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  buildMineruDerivedArtifact,
  parseMineruContentListV2,
} from '../../src/domain/mineru-document.mjs';

const identity = { brand: 'Hisense', model: 'HRCD640TBW', category: 'fridge' };
const pdfSha256 = 'a'.repeat(64);
const modelRevision = 'ed6b654c018d742e65a17671e379c5e6ecc87ec9';

function mineruJson(tableHtml, title = 'Hisense HRCD640TBW Specifications') {
  return Buffer.from(JSON.stringify([[
    {
      type: 'title',
      content: { title_content: [{ type: 'text', content: title }], level: 2 },
      bbox: [83, 66, 385, 121],
    },
    {
      type: 'table',
      content: {
        table_caption: [], table_footnote: [], html: tableHtml,
        table_type: 'complex_table', table_nest_level: 1,
      },
      bbox: [80, 262, 790, 925],
    },
  ]]));
}

const hisenseTable = `<table>
  <tr><td>Model Number</td><td>HRCD640TBW</td></tr>
  <tr><td>Cabinet clearance [Sides / Back / Top]</td><td>50 / 50 / 100 mm</td></tr>
  <tr><td>Dimensions (Packaged) (W X H X D)</td><td>968 x 1896 x 778 mm</td></tr>
  <tr><td>Dimensions (Net) (W X H X D)</td><td>914 x 1790 x 730 mm</td></tr>
</table>`;

function paragraph(content, bbox = [80, 120, 760, 180]) {
  return {
    type: 'paragraph',
    content: { paragraph_content: [{ type: 'text', content }] },
    bbox,
  };
}

function pageHeader(content) {
  return {
    type: 'page_header',
    content: { page_header_content: [{ type: 'text', content }] },
    bbox: [40, 30, 700, 70],
  };
}

function tableFragment(html) {
  return {
    type: 'table',
    content: {
      table_caption: [], table_footnote: [], html,
      table_type: 'simple_table', table_nest_level: 1,
    },
    bbox: [80, 220, 900, 760],
  };
}

test('MinerU content_list_v2 maps explicit grouped axes without using numeric heuristics', () => {
  const bytes = mineruJson(hisenseTable);
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256,
    parserVersion: '3.4.4',
    modelRevision,
    caseIdentity: identity,
    fields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
      'installation.leftMm', 'installation.rightMm', 'installation.rearMm', 'installation.topMm',
    ],
  });

  assert.equal(parsed.pageCount, 1);
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': 914,
    'closedEnvelope.heightMm': 1790,
    'closedEnvelope.depthMm': 730,
    'installation.leftMm': 50,
    'installation.rightMm': 50,
    'installation.rearMm': 50,
    'installation.topMm': 100,
  });
  assert.ok(parsed.claims.every((claim) => claim.page === 1));
  assert.ok(parsed.claims.every((claim) => claim.fragmentSha256?.length === 64));
  assert.deepEqual(parsed.claims.find((claim) => claim.field === 'closedEnvelope.widthMm').axisOrder, [
    'width', 'height', 'depth',
  ]);
  assert.deepEqual(parsed.identitySignals.map((signal) => signal.type).sort(), [
    'mineru_table_model', 'mineru_title_model',
  ]);
});

test('MinerU accepts exact-model same-page labelled axes with compact mm units', () => {
  const bytes = Buffer.from(JSON.stringify([[
    paragraph('CBC064BG', [80, 80, 300, 120]),
    paragraph('WIDTH 470mm', [80, 140, 300, 180]),
    paragraph('HEIGHT 635mm', [80, 190, 300, 230]),
    paragraph('DEPTH 439mm', [80, 240, 300, 280]),
  ]]));

  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'CHIQ', model: 'CBC064BG', category: 'fridge' },
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
    claimSemanticsVersion: 2,
  });

  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 470 },
    'closedEnvelope.heightMm': { kind: 'fixed', mm: 635 },
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 439 },
  });
});

test('MinerU maps Midea W x D x H product rows with compact units and rejects package rows', () => {
  const bytes = Buffer.from(JSON.stringify([
    [pageHeader('MDRC284FZE01APE 198L Chest Freezer | Hybrid | White')],
    [
      pageHeader('MDRC284FZE01APE 198L Chest Freezer | Hybrid | White'),
      tableFragment('<table><tr><td>Package Dimensions W x D x H</td><td>797 x 578 x 888mm</td></tr><tr><td>Product Dimensions W x D x H</td><td>770 x 560 x 850mm</td></tr></table>'),
    ],
  ]));

  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Midea', model: 'MDRC284FZE01APE', category: 'fridge' },
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
    claimSemanticsVersion: 2,
  });

  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 770 },
    'closedEnvelope.heightMm': { kind: 'fixed', mm: 850 },
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 560 },
  });
  assert.ok(parsed.claims.every((claim) => !/package/i.test(claim.label)));
});

test('MinerU preserves single-cell specification rows and maps explicit per-side clearances', () => {
  const bytes = Buffer.from(JSON.stringify([
    [
      {
        type: 'page_header',
        content: { page_header_content: [{ type: 'text', content: 'QUICK REFERENCE GUIDE > RF605QZUVB1' }] },
        bbox: [35, 40, 240, 58],
      },
      {
        type: 'table',
        content: {
          table_caption: [], table_footnote: [], table_type: 'simple_table', table_nest_level: 1,
          html: '<table><tr><td>Depth 688 mm</td></tr><tr><td>Height 1790 mm</td></tr><tr><td>Minimum air clearance - at rear 30 mm</td></tr><tr><td>Minimum air clearance - each side 20 mm</td></tr><tr><td>Minimum air clearance - on top 20 mm</td></tr><tr><td>Width 905 mm</td></tr></table>',
        },
        bbox: [670, 262, 956, 463],
      },
    ],
  ]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Fisher & Paykel', model: 'RF605QZUVB1', category: 'fridge' },
    fields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
      'installation.leftMm', 'installation.rightMm', 'installation.rearMm', 'installation.topMm',
    ],
  });

  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': 905,
    'closedEnvelope.heightMm': 1790,
    'closedEnvelope.depthMm': 688,
    'installation.leftMm': 20,
    'installation.rightMm': 20,
    'installation.rearMm': 30,
    'installation.topMm': 20,
  });
  assert.ok(parsed.claims.every((claim) => claim.page === 1));
  assert.ok(parsed.claims.every((claim) => claim.fragmentSha256?.length === 64));
});

test('MinerU grouped dimensions honour H x W x D and reject packaged rows', () => {
  const bytes = mineruJson(`<table>
    <tr><td>Model</td><td>HRCD640TBW</td></tr>
    <tr><td>Shipping dimensions (H x W x D)</td><td>1900 x 970 x 780 mm</td></tr>
    <tr><td>Overall product dimensions (H x W x D)</td><td>1790 x 914 x 730 mm</td></tr>
  </table>`);
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision, caseIdentity: identity,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(parsed.claims.map((claim) => [claim.field, claim.value]), [
    ['closedEnvelope.widthMm', 914],
    ['closedEnvelope.heightMm', 1790],
    ['closedEnvelope.depthMm', 730],
  ]);
  assert.throws(() => parseMineruContentListV2(mineruJson(`<table>
    <tr><td>Model</td><td>HRCD640TBW</td></tr>
    <tr><td>High door shelf</td><td>300 mm</td></tr>
  </table>`), {
    pdfSha256, parserVersion: '3.4.4', modelRevision, caseIdentity: identity,
    fields: ['closedEnvelope.heightMm'],
  }), /no exact-model MinerU evidence/i);
});

test('MinerU grouped dimensions accept an explicit H*W*D axis order', () => {
  const bytes = mineruJson(`<table>
    <tr><td>Model</td><td>HWF8I1015BX</td></tr>
    <tr><td>Dimensions (H*W*D) Unit: mm</td><td>845*595*550</td></tr>
  </table>`, 'Hisense HWF8I1015BX Specifications');
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Hisense', model: 'HWF8I1015BX', category: 'washing_machine' },
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(parsed.claims.map((claim) => [claim.field, claim.value]), [
    ['closedEnvelope.widthMm', 595],
    ['closedEnvelope.heightMm', 845],
    ['closedEnvelope.depthMm', 550],
  ]);
});

test('MinerU excludes Pack Dimension rows from primary product dimensions', () => {
  const bytes = mineruJson(`<table>
    <tr><td>Model</td><td>HRCD640TBW</td></tr>
    <tr><td>Total height (mm)</td><td>850</td></tr>
    <tr><td>Total width (mm)</td><td>598</td></tr>
    <tr><td>Total depth (mm)</td><td>598</td></tr>
    <tr><td>Pack Dimensions Height (mm)</td><td>881</td></tr>
    <tr><td>Pack Dimension Width (mm)</td><td>644</td></tr>
    <tr><td>Pack Dimension Depth (mm)</td><td>661</td></tr>
  </table>`);
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision, caseIdentity: identity,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(parsed.claims.map((claim) => [claim.field, claim.value]), [
    ['closedEnvelope.widthMm', 598],
    ['closedEnvelope.heightMm', 850],
    ['closedEnvelope.depthMm', 598],
  ]);
});

test('MinerU accepts compact explicit WxHxD axis notation without inferring axes', () => {
  const bytes = mineruJson(`<table>
    <tr><td>Model</td><td>HRCD640TBW</td></tr>
    <tr><td>Product dimensions (WxHxD)</td><td>914 x 1790 x 730 mm</td></tr>
  </table>`);
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision, caseIdentity: identity,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(parsed.claims.map((claim) => [claim.field, claim.value]), [
    ['closedEnvelope.widthMm', 914],
    ['closedEnvelope.heightMm', 1790],
    ['closedEnvelope.depthMm', 730],
  ]);
  assert.deepEqual(parsed.claims[0].axisOrder, ['width', 'height', 'depth']);
});

test('MinerU claim semantics v2 emits explicit scope and preserves H x W x D axis provenance', () => {
  const bytes = mineruJson(`<table>
    <tr><td>Model</td><td>HRCD640TBW</td></tr>
    <tr><td>Overall product dimensions (H x W x D)</td><td>1790 x 914 x 730 mm</td></tr>
  </table>`);
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision, caseIdentity: identity,
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.equal(parsed.claimSemanticsVersion, 2);
  assert.deepEqual(parsed.claims.map((claim) => [
    claim.field, claim.value, claim.sourceAxisOrder, claim.measurementScope,
  ]), [
    ['closedEnvelope.widthMm', { kind: 'fixed', mm: 914 }, ['height', 'width', 'depth'], 'product_closed_external'],
    ['closedEnvelope.heightMm', { kind: 'fixed', mm: 1790 }, ['height', 'width', 'depth'], 'product_closed_external'],
    ['closedEnvelope.depthMm', { kind: 'fixed', mm: 730 }, ['height', 'width', 'depth'], 'product_closed_external'],
  ]);
});

test('MinerU claim semantics v2 prefers handle-inclusive external depth and rejects body-only depth', () => {
  const included = parseMineruContentListV2(mineruJson(`<table>
    <tr><td>Model</td><td>HRCD640TBW</td></tr>
    <tr><td>Cabinet depth without door</td><td>650 mm</td></tr>
    <tr><td>Overall depth including handles</td><td>735 mm</td></tr>
  </table>`), {
    pdfSha256, parserVersion: '3.4.4', modelRevision, caseIdentity: identity,
    claimSemanticsVersion: 2, fields: ['closedEnvelope.depthMm'],
  });
  assert.deepEqual(included.claims[0].value, { kind: 'fixed', mm: 735 });
  assert.equal(included.claims[0].includesHandle, true);
  assert.equal(included.claims[0].includesDoor, null);

  assert.throws(() => parseMineruContentListV2(mineruJson(`<table>
    <tr><td>Model</td><td>HRCD640TBW</td></tr>
    <tr><td>Cabinet depth without door</td><td>650 mm</td></tr>
  </table>`), {
    pdfSha256, parserVersion: '3.4.4', modelRevision, caseIdentity: identity,
    claimSemanticsVersion: 2, fields: ['closedEnvelope.depthMm'],
  }), /no exact-model MinerU evidence/i);
});

test('MinerU claim semantics v2 rejects unresolved family-manual dimensions', () => {
  const bytes = mineruJson(`<table>
    <tr><td>Models</td><td>HRCD640TBW / HRCD640TBX</td></tr>
    <tr><td>Product dimensions (W x H x D)</td><td>914 x 1790 x 730 mm</td></tr>
  </table>`, 'Hisense HRCD640TBW / HRCD640TBX Specifications');
  assert.throws(() => parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision, caseIdentity: identity,
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  }), /family|multiple models|scope/i);
});

test('MinerU binds a multi-model dimension matrix to the exact requested model row', () => {
  const bytes = Buffer.from(JSON.stringify([[
    {
      type: 'paragraph',
      content: { paragraph_content: [{ type: 'text', content: 'WBB3700AH/WH WBB3400AH/WH' }] },
      bbox: [40, 40, 500, 75],
    },
    {
      type: 'table', content: {
        html: '<table><tr><td>Dimensions</td><td>Product Height (H)</td><td>Product Width (W)</td><td>Product Depth (D)</td><td>Product Depth (D2) (Door Open)</td></tr><tr><td>WBB3700AH/WH</td><td>1755</td><td>598</td><td>650</td><td>1199</td></tr><tr><td>WBB3400AH/WH</td><td>1645</td><td>598</td><td>650</td><td>1199</td></tr></table>',
        table_caption: [], table_footnote: [], table_type: 'complex_table', table_nest_level: 1,
      }, bbox: [40, 100, 950, 500],
    },
    {
      type: 'paragraph',
      content: { paragraph_content: [{ type: 'text', content: 'All measurements are in millimetres (mm).' }] },
      bbox: [40, 520, 700, 550],
    },
  ]]));

  for (const [model, expectedHeight] of [['WBB3400AH', 1645], ['WBB3700AH', 1755]]) {
    const parsed = parseMineruContentListV2(bytes, {
      pdfSha256, parserVersion: '3.4.4', modelRevision,
      caseIdentity: { brand: 'Westinghouse', model, category: 'fridge' },
      claimSemanticsVersion: 2,
      fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
    });
    assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
      'closedEnvelope.widthMm': 598,
      'closedEnvelope.heightMm': expectedHeight,
      'closedEnvelope.depthMm': 650,
    });
    assert.ok(parsed.claims.every((claim) => claim.page === 1));
    assert.equal(new Set(parsed.claims.map((claim) => claim.fragmentSha256)).size, 1);
    assert.ok(parsed.claims.every((claim) => !/door open/i.test(claim.sourceLabel)));
  }
});

test('MinerU accepts strictly labelled wide, high, and deep brand terminology', () => {
  const bytes = mineruJson(`<table>
    <tr><td>Model</td><td>HRCD640TBW</td></tr>
    <tr><td>Overall wide (mm)</td><td>914 mm</td></tr>
    <tr><td>Overall high (mm)</td><td>1790 mm</td></tr>
    <tr><td>Overall deep (mm)</td><td>730 mm</td></tr>
  </table>`);
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision, caseIdentity: identity,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(parsed.claims.map((claim) => [claim.field, claim.value]), [
    ['closedEnvelope.widthMm', 914],
    ['closedEnvelope.heightMm', 1790],
    ['closedEnvelope.depthMm', 730],
  ]);
});

test('MinerU accepts exact-model QRG page headers and preserves an adjustable height range', () => {
  const bytes = Buffer.from(JSON.stringify([[
    {
      type: 'page_header',
      content: { page_header_content: [{ type: 'text', content: 'QUICK REFERENCE GUIDE > HDW15F3S1' }] },
      bbox: [40, 20, 300, 45],
    },
    {
      type: 'paragraph', content: { paragraph_content: [{ type: 'text', content: 'Height 850 - 895 mm' }] },
      bbox: [355, 147, 633, 171],
    },
    {
      type: 'paragraph', content: { paragraph_content: [{ type: 'text', content: 'Width 597 mm' }] },
      bbox: [355, 183, 633, 205],
    },
    {
      type: 'paragraph', content: { paragraph_content: [{ type: 'text', content: 'Depth 599 mm' }] },
      bbox: [355, 218, 633, 242],
    },
  ]]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Haier', model: 'HDW15F3S1', category: 'dishwasher' },
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': 597,
    'closedEnvelope.heightMm': { minimumMm: 850, maximumMm: 895 },
    'closedEnvelope.depthMm': 599,
  });
  assert.equal(parsed.claims.find((claim) => claim.field === 'closedEnvelope.heightMm').semanticBasis, 'explicit_label_range');
  assert.deepEqual(parsed.identitySignals.map((signal) => signal.type), [
    'mineru_page_header_model',
  ]);
});

test('MinerU accepts individually labelled inline axes and excludes handle-qualified depth', () => {
  const bytes = Buffer.from(JSON.stringify([[
    {
      type: 'page_header',
      content: { page_header_content: [{ type: 'text', content: 'QUICK REFERENCE GUIDE > RF522ADUSX5' }] },
      bbox: [35, 40, 240, 58],
    },
    {
      type: 'paragraph',
      content: { paragraph_content: [{ type: 'text', content: 'Height 1715 mm Width 790 mm Depth 695 mm' }] },
      bbox: [354, 105, 634, 189],
    },
    {
      type: 'table',
      content: {
        table_caption: [], table_footnote: [], table_type: 'simple_table', table_nest_level: 1,
        html: '<table><tr><td>Depth</td><td>695 mm</td></tr><tr><td>Depth (including handles)</td><td>735 mm</td></tr><tr><td>Height</td><td>1715 mm</td></tr><tr><td>Width</td><td>790 mm</td></tr></table>',
      },
      bbox: [355, 381, 639, 534],
    },
  ]]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Fisher & Paykel', model: 'RF522ADUSX5', category: 'fridge' },
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': 790,
    'closedEnvelope.heightMm': 1715,
    'closedEnvelope.depthMm': 695,
  });
  assert.ok(parsed.claims.every((claim) => !/including handles/i.test(claim.label)));
});

test('handle-qualified depth alone cannot stand in for primary product depth', () => {
  const bytes = mineruJson(`<table>
    <tr><td>Model</td><td>HRCD640TBW</td></tr>
    <tr><td>Depth (including handles)</td><td>735 mm</td></tr>
  </table>`);
  assert.throws(() => parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision, caseIdentity: identity,
    fields: ['closedEnvelope.depthMm'],
  }), /no exact-model MinerU evidence/i);
});

test('MinerU rejects merged multi-axis paragraphs but accepts strict individual axis paragraphs', () => {
  const bytes = Buffer.from(JSON.stringify([[
    { type: 'page_header', content: { page_header_content: [{ type: 'text', content: 'QRG > HDW15F4B1' }] }, bbox: [10, 10, 300, 40] },
    { type: 'paragraph', content: { paragraph_content: [{ type: 'text', content: 'Depth 599 mm Height 850 - 895 mm Width 597 mm' }] }, bbox: [10, 50, 700, 80] },
    { type: 'paragraph', content: { paragraph_content: [{ type: 'text', content: 'Depth 599 mm' }] }, bbox: [10, 90, 200, 120] },
  ]]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Haier', model: 'HDW15F4B1', category: 'dishwasher' },
    fields: ['closedEnvelope.depthMm'],
  });
  assert.equal(parsed.claims[0].value, 599);
});

test('MinerU parses grouped dimension paragraphs and mixed compact separators', () => {
  const bytes = Buffer.from(JSON.stringify([[
    { type: 'title', content: { title_content: [{ type: 'text', content: 'DWAU615DB3 dishwasher' }], level: 1 }, bbox: [10, 10, 300, 40] },
    { type: 'paragraph', content: { paragraph_content: [{ type: 'text', content: 'Dimensions (W x H x D): 598 x 818x570 mm' }] }, bbox: [10, 50, 700, 80] },
    { type: 'text', content: { content: 'Model DWAU615DB3' }, bbox: [10, 90, 300, 120] },
  ]]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Smeg', model: 'DWAU615DB3', category: 'dishwasher' },
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(parsed.claims.map((claim) => claim.value), [598, 818, 570]);
});

test('MinerU treats repeated exact-model page headers as independently repeated document scope', () => {
  const bytes = Buffer.from(JSON.stringify([
    [
      { type: 'page_header', content: { page_header_content: [{ type: 'text', content: 'QRG > RF605QZUVB1' }] }, bbox: [10, 10, 300, 40] },
      { type: 'paragraph', content: { paragraph_content: [{ type: 'text', content: 'Width 905 mm' }] }, bbox: [10, 50, 300, 80] },
    ],
    [{ type: 'page_header', content: { page_header_content: [{ type: 'text', content: 'QRG > RF605QZUVB1' }] }, bbox: [10, 10, 300, 40] }],
  ]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Fisher & Paykel', model: 'RF605QZUVB1', category: 'fridge' },
    fields: ['closedEnvelope.widthMm'],
  });
  assert.ok(parsed.identitySignals.some((signal) => signal.type === 'mineru_repeated_page_header_model'));
});

test('MinerU accepts an exact model repeated in body headings without accepting sibling models', () => {
  const bytes = Buffer.from(JSON.stringify([
    [
      { type: 'paragraph', content: { paragraph_content: [{ type: 'text', content: 'TCA220WP Active' }] }, bbox: [10, 10, 300, 40] },
      {
        type: 'table', content: {
          html: '<table><tr><td></td><td>Technical data</td></tr><tr><td>Dimensions (W x H x D)</td><td></td></tr><tr><td>Dimensions in mm (width)</td><td>596</td></tr><tr><td>Dimensions in mm (height)</td><td>850</td></tr><tr><td>Dimensions in mm (depth)</td><td>640</td></tr><tr><td>Appliance depth in mm with opened door</td><td>1054</td></tr></table>',
          table_caption: [], table_footnote: [], table_type: 'complex_table', table_nest_level: 1,
        }, bbox: [10, 50, 800, 900],
      },
    ],
    [{ type: 'paragraph', content: { paragraph_content: [{ type: 'text', content: 'TCA220WP Active' }] }, bbox: [10, 10, 300, 40] }],
  ]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Miele', model: 'TCA220WP', category: 'dryer' },
    fields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
      'operation.doorOpenDepthMm',
    ],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': 596,
    'closedEnvelope.heightMm': 850,
    'closedEnvelope.depthMm': 640,
    'operation.doorOpenDepthMm': 1054,
  });
  assert.ok(parsed.identitySignals.some((signal) => signal.type === 'mineru_repeated_body_model'));

  assert.throws(() => parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Miele', model: 'TCA221WP', category: 'dryer' },
    fields: ['closedEnvelope.widthMm'],
  }), /identity|exact model/i);
});

test('MinerU scopes a separate dimension table to an exact Model row on the same page', () => {
  const bytes = Buffer.from(JSON.stringify([[
    {
      type: 'table', content: {
        html: '<table><tr><td>Model</td><td>WV3-1208W / WD1275A1</td></tr></table>',
        table_caption: [], table_footnote: [], table_type: 'simple_table', table_nest_level: 1,
      }, bbox: [50, 102, 945, 196],
    },
    {
      type: 'paragraph',
      content: { paragraph_content: [{ type: 'text', content: 'Dimension(mm)' }] },
      bbox: [50, 203, 200, 220],
    },
    {
      type: 'table', content: {
        html: '<table><tr><td>W</td><td>600</td><td>D</td><td>475</td><td>D&quot;</td><td>1015</td></tr><tr><td>H</td><td>850</td><td>D&#x27;</td><td>535</td><td></td><td></td></tr></table>',
        table_caption: [], table_footnote: [], table_type: 'complex_table', table_nest_level: 1,
      }, bbox: [52, 458, 945, 526],
    },
  ]]));

  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'LG', model: 'WD1275A1', category: 'washing_machine' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });

  assert.deepEqual(parsed.claims.map((claim) => [claim.field, claim.value]), [
    ['closedEnvelope.widthMm', { kind: 'fixed', mm: 600 }],
    ['closedEnvelope.heightMm', { kind: 'fixed', mm: 850 }],
  ]);
  assert.ok(parsed.claims.every((claim) => claim.page === 1));
  assert.ok(parsed.claims.every((claim) => /\(mm\)/i.test(claim.sourceLabel)));
});

test('MinerU scopes shared dimensions to a strict same-page sibling model list and keeps ambiguous depth blocked', () => {
  const bytes = Buffer.from(JSON.stringify([[
    tableFragment('<table><tr><td>Description</td><td>Value</td></tr><tr><td>Model</td><td>DVH10-10B / DVH10-10W / DVH9-10B / DVH5-10G</td></tr></table>'),
    paragraph('Dimension(mm)', [80, 180, 300, 210]),
    tableFragment('<table><tr><td>W</td><td>600</td><td>D</td><td>690</td><td>D&quot;</td><td>1115</td></tr><tr><td>H</td><td>850</td><td>D&#x27;</td><td>615</td><td></td><td></td></tr></table>'),
  ]]));

  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'LG', model: 'DVH10-10B', category: 'dryer' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });

  assert.deepEqual(parsed.claims.map((claim) => [claim.field, claim.value]), [
    ['closedEnvelope.widthMm', { kind: 'fixed', mm: 600 }],
    ['closedEnvelope.heightMm', { kind: 'fixed', mm: 850 }],
  ]);
});

test('MinerU does not carry sibling model-list scope to dimensions on another page', () => {
  const bytes = Buffer.from(JSON.stringify([
    [tableFragment('<table><tr><td>Model</td><td>DVH10-10B / DVH10-10W</td></tr></table>')],
    [
      paragraph('Dimension(mm)', [80, 180, 300, 210]),
      tableFragment('<table><tr><td>W</td><td>600</td><td>H</td><td>850</td></tr></table>'),
    ],
  ]));

  assert.throws(() => parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'LG', model: 'DVH10-10B', category: 'dryer' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm'],
  }), /unresolved family|no exact-model MinerU evidence/i);
});

test('MinerU binds a later dimension matrix to a unique cover identity and exact-model source URL', () => {
  const dimensionTable = tableFragment('<table><tr><td>Width</td><td>Overall Height</td><td>Depth</td><td>Cabinet Depth</td><td>Depth doors open 135°</td><td>Width doors open 135°</td></tr><tr><td>A</td><td>B</td><td>C</td><td>C1</td><td>D</td><td>E</td></tr><tr><td>750mm</td><td>1692mm</td><td>785mm</td><td>705mm</td><td>1038mm</td><td>1277mm</td></tr></table>');
  const bytes = Buffer.from(JSON.stringify([
    [{
      type: 'page_footer',
      content: { page_footer_content: [{ type: 'text', content: 'KAMFREN522A' }] },
      bbox: [40, 930, 300, 960],
    }],
    [dimensionTable],
  ]));
  const options = {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Kogan', model: 'KAMFREN522A', category: 'fridge' },
    sourceUrls: ['https://assets.kogan.com/files/usermanuals/KAMFREN522A_UG.pdf'],
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  };

  const parsed = parseMineruContentListV2(bytes, options);
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 750 },
    'closedEnvelope.heightMm': { kind: 'fixed', mm: 1692 },
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 785 },
  });
  assert.ok(parsed.claims.every((claim) => !/cabinet|doors open/i.test(claim.sourceLabel)));

  assert.throws(() => parseMineruContentListV2(bytes, { ...options, sourceUrls: [] }), /exact-model|identity|scope/i);
  assert.throws(() => parseMineruContentListV2(bytes, {
    ...options,
    sourceUrls: ['https://assets.kogan.com/files/usermanuals/KAMFREN522AUS_UG.pdf'],
  }), /exact-model|identity|scope/i);

  const siblingBytes = Buffer.from(JSON.stringify([
    JSON.parse(bytes.toString('utf8'))[0],
    [paragraph('Also applies to KAMFREN522B'), dimensionTable],
  ]));
  assert.throws(() => parseMineruContentListV2(siblingBytes, options), /exact-model|family|multiple models|scope/i);
});

test('page footer identity does not change receipts that already have structured model scope', () => {
  const bytes = Buffer.from(JSON.stringify([[
    {
      type: 'title',
      content: { title_content: [{ type: 'text', content: 'EX100' }] },
      bbox: [40, 40, 300, 80],
    },
    {
      type: 'page_footer',
      content: { page_footer_content: [{ type: 'text', content: 'EX100' }] },
      bbox: [40, 930, 300, 960],
    },
    tableFragment('<table><tr><td>Model</td><td>EX100</td></tr><tr><td>Width</td><td>600 mm</td></tr><tr><td>Height</td><td>850 mm</td></tr><tr><td>Depth</td><td>650 mm</td></tr></table>'),
  ]]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Example', model: 'EX100', category: 'washing_machine' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(parsed.identitySignals.map((signal) => signal.type), [
    'mineru_table_model',
    'mineru_title_model',
  ]);
});

test('MinerU parses alternating W H D cells only with explicit same-page unit context', () => {
  const bytes = Buffer.from(JSON.stringify([[
    {
      type: 'table', content: {
        html: '<table><tr><td>Model</td><td>WD1275A1</td></tr></table>',
        table_caption: [], table_footnote: [], table_type: 'simple_table', table_nest_level: 1,
      }, bbox: [50, 102, 945, 196],
    },
    {
      type: 'paragraph',
      content: { paragraph_content: [{ type: 'text', content: 'Dimensions (mm)' }] },
      bbox: [50, 203, 200, 220],
    },
    {
      type: 'table', content: {
        html: '<table><tr><td>W</td><td>600</td><td>D</td><td>535</td></tr><tr><td>H</td><td>850</td><td></td><td></td></tr></table>',
        table_caption: [], table_footnote: [], table_type: 'complex_table', table_nest_level: 1,
      }, bbox: [52, 458, 945, 526],
    },
  ]]));

  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'LG', model: 'WD1275A1', category: 'washing_machine' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });

  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 600,
    'closedEnvelope.heightMm': 850,
    'closedEnvelope.depthMm': 535,
  });
});

test('MinerU parsing fails closed when dimensions lack an explicit axis order', () => {
  const bytes = mineruJson(`<table>
    <tr><td>Model</td><td>HRCD640TBW</td></tr>
    <tr><td>Product dimensions</td><td>914 x 1790 x 730 mm</td></tr>
  </table>`);
  assert.throws(() => parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision, caseIdentity: identity,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  }), /explicit axis|no exact-model MinerU evidence/i);
});

test('MinerU parsing rejects missing exact-model scope and malformed page geometry', () => {
  assert.throws(() => parseMineruContentListV2(mineruJson(hisenseTable, 'Generic refrigerator'), {
    pdfSha256, parserVersion: '3.4.4', modelRevision, caseIdentity: { ...identity, model: 'OTHER1' },
    fields: ['closedEnvelope.widthMm'],
  }), /identity|exact model/i);

  const malformed = JSON.parse(mineruJson(hisenseTable));
  malformed[0][1].bbox = [790, 262, 80, 925];
  assert.throws(() => parseMineruContentListV2(Buffer.from(JSON.stringify(malformed)), {
    pdfSha256, parserVersion: '3.4.4', modelRevision, caseIdentity: identity,
    fields: ['closedEnvelope.widthMm'],
  }), /bbox/i);
});

test('derived artifact binds the MinerU JSON to the immutable source PDF', () => {
  const bytes = mineruJson(hisenseTable);
  const artifact = buildMineruDerivedArtifact(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision, pageCount: 1,
  });
  const jsonHash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(artifact.sourcePdfSha256, pdfSha256);
  assert.equal(artifact.contentSha256, jsonHash);
  assert.equal(artifact.format, 'content_list_v2');
  assert.match(artifact.objectPath, new RegExp(`${jsonHash}\\.json$`));
  assert.equal(artifact.byteSize, bytes.length);
});
