import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  buildMineruDerivedArtifact,
  findMineruImageOnlyDimensionPages,
  inspectMineruContentListV2,
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

function captionedTableFragment(html, caption) {
  const fragment = tableFragment(html);
  fragment.content.table_caption = [{ type: 'text', content: caption }];
  return fragment;
}

test('MinerU empty-page sentinel is ignored without relaxing bbox validation for evidence fragments', () => {
  const bytes = Buffer.from(JSON.stringify([
    [paragraph('HRCD640TBW')],
    [{ type: 'paragraph', content: { paragraph_content: [] }, bbox: [0, 0, 1001, 1000] }],
  ]));
  const inspected = inspectMineruContentListV2(bytes);
  assert.equal(inspected.pageCount, 2);
  assert.equal(inspected.pages[1].fragments.length, 0);
  assert.equal(inspected.pages[1].text, '');
  assert.equal(buildMineruDerivedArtifact(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
  }).pageCount, 2);

  const invalid = Buffer.from(JSON.stringify([[
    { type: 'paragraph', content: { paragraph_content: [{ type: 'text', content: 'evidence' }] }, bbox: [0, 0, 1001, 1000] },
  ]]));
  assert.throws(() => inspectMineruContentListV2(invalid), /bbox invalid/i);
});

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

test('MinerU preserves a table caption as an independent exact-model identity signal', () => {
  const dimensionTable = tableFragment('<table><tr><td>Width</td><td>597 mm</td></tr><tr><td>Height</td><td>850 - 895 mm</td></tr><tr><td>Depth</td><td>599 mm</td></tr></table>');
  dimensionTable.content.table_caption = [{ type: 'text', content: 'QUICK REFERENCE GUIDE > HDW15F2B1' }];
  const bytes = Buffer.from(JSON.stringify([
    [pageHeader('QUICK REFERENCE GUIDE > HDW15F2B1')],
    [dimensionTable],
  ]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Haier', model: 'HDW15F2B1', category: 'dishwasher' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });

  assert.deepEqual(parsed.identitySignals.map((signal) => signal.type), [
    'mineru_page_header_model',
    'mineru_table_model',
  ]);
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 597 },
    'closedEnvelope.heightMm': { kind: 'range', minMm: 850, maxMm: 895 },
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 599 },
  });
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

test('MinerU replays the Beko AU dishwasher parallel-list specification grammar without mixing envelopes', () => {
  const listItem = (content) => ({
    item_type: 'text', item_content: [{ type: 'text', content }],
  });
  const bytes = Buffer.from(JSON.stringify([[
    pageHeader('BDF1640AX 16 Place Setting Freestanding Dishwasher with Autodosing'),
    {
      type: 'list',
      content: {
        list_type: 'text_list', attribute: 'unordered',
        list_items: [
          'Dimensions & Weights',
          'Unpackaged Height:',
          'Height (max - feet adjustment):',
          'Unpackaged Width:',
          'Unpackaged Depth:',
          'Depth with Door Opened:',
          'Unpackaged Weight:',
          'Packaged Height:',
          'Packaged Width:',
          'Packaged Depth:',
          'Packaged Weight:',
        ].map(listItem),
      },
      bbox: [526, 573, 744, 731],
    },
    {
      type: 'index',
      content: {
        list_type: 'text_list',
        list_items: [
          '850 mm', '865 mm', '598 mm', '600 mm', '1150 mm',
          '52.3 kg', '897 mm', '657 mm', '674 mm', '57.6 kg',
        ].map(listItem),
      },
      bbox: [764, 752, 830, 933],
    },
  ]]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Beko', model: 'BDF1640AX', category: 'dishwasher' },
    claimSemanticsVersion: 2,
    fields: [
      'closedEnvelope.widthMm',
      'closedEnvelope.heightMm',
      'closedEnvelope.depthMm',
      'operation.doorOpenDepthMm',
    ],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 598 },
    'closedEnvelope.heightMm': { kind: 'range', minMm: 850, maxMm: 865 },
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 600 },
    'operation.doorOpenDepthMm': { kind: 'fixed', mm: 1150 },
  });
  assert.deepEqual(parsed.grammarProfileIds, [
    'beko_au_dishwasher_product_spec_parallel_lists_v1',
  ]);
});

test('MinerU replays the Beko split-title parallel-list specification variant', () => {
  const listItem = (content) => ({
    item_type: 'text', item_content: [{ type: 'text', content }],
  });
  const bytes = Buffer.from(JSON.stringify([[
    {
      type: 'title',
      content: { title_content: [{ type: 'text', content: 'BDF1640DX 16 Place Setting Freestanding Dishwasher' }] },
      bbox: [40, 30, 700, 70],
    },
    {
      type: 'title',
      content: { title_content: [{ type: 'text', content: 'Dimensions & Weights' }] },
      bbox: [529, 697, 709, 714],
    },
    {
      type: 'list',
      content: {
        list_type: 'text_list', attribute: 'unordered',
        list_items: [
          'Unpackaged Height:', 'Height (max - feet adjustment):',
          'Unpackaged Width:', 'Unpackaged Depth:', 'Depth with Door Opened:',
          'Unpackaged Weight:', 'Packaged Height:', 'Packaged Width:',
          'Packaged Depth:', 'Packaged Weight:',
        ].map(listItem),
      },
      bbox: [527, 717, 754, 897],
    },
    {
      type: 'index',
      content: {
        list_type: 'text_list',
        list_items: [
          '850 mm', '865 mm', '598 mm', '600 mm', '1150 mm',
          '50.0 kg', '897 mm', '657 mm', '674 mm', '55.1 kg',
        ].map(listItem),
      },
      bbox: [763, 717, 831, 897],
    },
  ]]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Beko', model: 'BDF1640DX', category: 'dishwasher' },
    claimSemanticsVersion: 2,
    fields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm',
      'closedEnvelope.depthMm', 'operation.doorOpenDepthMm',
    ],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 598 },
    'closedEnvelope.heightMm': { kind: 'range', minMm: 850, maxMm: 865 },
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 600 },
    'operation.doorOpenDepthMm': { kind: 'fixed', mm: 1150 },
  });
  assert.deepEqual(parsed.grammarProfileIds, [
    'beko_au_dishwasher_product_spec_split_title_parallel_lists_v1',
  ]);
});

test('MinerU replays the Beko AU dishwasher inline-pairs variant as the same envelope semantics', () => {
  const bytes = Buffer.from(JSON.stringify([[
    pageHeader('BDF1620X'),
    {
      type: 'title',
      content: { title_content: [{ type: 'text', content: 'Dimensions & Weights' }] },
      bbox: [527, 715, 710, 733],
    },
    paragraph(
      'Unpackaged Height: 850 mm Height (max - feet adjustment): 865 mm '
      + 'Unpackaged Width: 598 mm Unpackaged Depth: 600 mm '
      + 'Depth with Door Opened: 1150 mm Unpackaged Weight: 51.1 kg '
      + 'Packaged Height: 897 mm Packaged Width: 657 mm '
      + 'Packaged Depth: 674 mm Packaged Weight: 56.7 kg',
      [526, 733, 833, 916],
    ),
  ]]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Beko', model: 'BDF1620X', category: 'dishwasher' },
    claimSemanticsVersion: 2,
    fields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm',
      'closedEnvelope.depthMm', 'operation.doorOpenDepthMm',
    ],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 598 },
    'closedEnvelope.heightMm': { kind: 'range', minMm: 850, maxMm: 865 },
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 600 },
    'operation.doorOpenDepthMm': { kind: 'fixed', mm: 1150 },
  });
  assert.deepEqual(parsed.grammarProfileIds, [
    'beko_au_dishwasher_product_spec_inline_pairs_v1',
  ]);
});

test('Beko spec grammar can use a unique structured exact-model identity on another page', () => {
  const dimensions = [
    'Unpackaged Height: 850 mm',
    'Height (max - feet adjustment): 865 mm',
    'Unpackaged Width: 598 mm',
    'Unpackaged Depth: 600 mm',
    'Depth with Door Opened: 1150 mm',
    'Unpackaged Weight: 50.6 kg',
    'Packaged Height: 897 mm',
    'Packaged Width: 657 mm',
    'Packaged Depth: 674 mm',
    'Packaged Weight: 56.2 kg',
  ].join(' ');
  const document = (secondPageItems) => Buffer.from(JSON.stringify([
    [
      {
        type: 'title',
        content: { title_content: [{ type: 'text', content: 'Dimensions & Weights' }] },
        bbox: [527, 715, 710, 733],
      },
      paragraph(dimensions, [526, 733, 833, 916]),
    ],
    secondPageItems,
  ]));
  const options = {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Beko', model: 'BDF1620W', category: 'dishwasher' },
    claimSemanticsVersion: 2,
    fields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm',
      'closedEnvelope.depthMm', 'operation.doorOpenDepthMm',
    ],
  };

  const parsed = parseMineruContentListV2(document([
    pageHeader('BDF1620W 16 Place Setting Freestanding Dishwasher White'),
  ]), options);
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 598 },
    'closedEnvelope.heightMm': { kind: 'range', minMm: 850, maxMm: 865 },
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 600 },
    'operation.doorOpenDepthMm': { kind: 'fixed', mm: 1150 },
  });
  assert.deepEqual(parsed.grammarProfileIds, [
    'beko_au_dishwasher_product_spec_inline_pairs_v1',
  ]);

  assert.throws(() => parseMineruContentListV2(document([
    pageHeader('BDF1620W / BDF1620X Freestanding Dishwashers'),
  ]), options), /unresolved family|no exact-model MinerU evidence/i);
});

test('MinerU rejects incomplete or cross-brand lookalikes of the Beko parallel-list grammar', () => {
  const listItem = (content) => ({
    item_type: 'text', item_content: [{ type: 'text', content }],
  });
  const content = (brand, values) => Buffer.from(JSON.stringify([[
    pageHeader('BDF1640AX Freestanding Dishwasher'),
    {
      type: 'list',
      content: {
        list_type: 'text_list', attribute: 'unordered',
        list_items: [
          'Dimensions & Weights', 'Unpackaged Height:',
          'Height (max - feet adjustment):', 'Unpackaged Width:',
          'Unpackaged Depth:', 'Depth with Door Opened:',
          'Unpackaged Weight:', 'Packaged Height:', 'Packaged Width:',
          'Packaged Depth:', 'Packaged Weight:',
        ].map(listItem),
      },
      bbox: [526, 573, 744, 731],
    },
    {
      type: 'index',
      content: { list_type: 'text_list', list_items: values.map(listItem) },
      bbox: [764, 752, 830, 933],
    },
    paragraph(brand, [30, 900, 120, 930]),
  ]]));
  const options = {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  };
  const completeValues = [
    '850 mm', '865 mm', '598 mm', '600 mm', '1150 mm',
    '52.3 kg', '897 mm', '657 mm', '674 mm', '57.6 kg',
  ];
  assert.throws(() => parseMineruContentListV2(content('Beko', completeValues.slice(0, -1)), {
    ...options,
    caseIdentity: { brand: 'Beko', model: 'BDF1640AX', category: 'dishwasher' },
  }), /no exact-model MinerU evidence/i);
  assert.throws(() => parseMineruContentListV2(content('Not Beko', completeValues), {
    ...options,
    caseIdentity: { brand: 'Other', model: 'BDF1640AX', category: 'dishwasher' },
  }), /no exact-model MinerU evidence/i);
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
  assert.deepEqual(parsed.claims.map((claim) => claim.sourceAxisOrder), [
    ['width'],
    ['height'],
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

test('MinerU accepts only the unqualified primary depth from a dimension diagram with primed variants', () => {
  const bytes = Buffer.from(JSON.stringify([[
    tableFragment('<table><tr><td>Model</td><td>DVH1-08WP</td></tr></table>'),
    paragraph('Dimension(mm)', [80, 180, 300, 210]),
    {
      type: 'image',
      content: {
        image_source: { path: 'images/dimension-side-view.jpg' },
        image_caption: [], image_footnote: [],
      },
      bbox: [200, 230, 800, 520],
    },
    {
      ...tableFragment('<table><tr><td>W</td><td>600</td><td>D</td><td>660</td><td>D&quot;</td><td>1115</td></tr><tr><td>H</td><td>850</td><td>D&#x27;</td><td>614</td><td></td><td></td></tr></table>'),
      bbox: [80, 550, 900, 760],
    },
  ]]));

  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'LG', model: 'DVH1-08WP', category: 'dryer' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });

  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 600,
    'closedEnvelope.heightMm': 850,
    'closedEnvelope.depthMm': 660,
  });
  assert.deepEqual(parsed.claims.map((claim) => claim.sourceAxisOrder), [
    ['width'],
    ['height'],
    ['depth'],
  ]);
  const depth = parsed.claims.find((claim) => claim.field === 'closedEnvelope.depthMm');
  assert.equal(depth.sourceLabel, 'Depth (mm)');
});

test('MinerU resolves a Depth parent row to the explicit door-and-handle external depth', () => {
  const bytes = Buffer.from(JSON.stringify([[
    pageHeader('GF-L700PL 637L French Door Fridge'),
    tableFragment('<table><tr><td>DIMENSIONS</td><td></td></tr><tr><td>Height</td><td>1792mm</td></tr><tr><td>Width</td><td>914mm</td></tr><tr><td>Depth</td><td></td></tr><tr><td>Without Door</td><td>685mm</td></tr><tr><td>Without Handle</td><td>729mm</td></tr><tr><td>With Door &amp; Handle</td><td>729mm</td></tr><tr><td>Product Weight</td><td>128kg</td></tr><tr><td>Packaging (W x D x H)</td><td>972mm x 770mm x 1881mm</td></tr></table>'),
  ]]));

  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'LG', model: 'GF-L700PL', category: 'fridge' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });

  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 914,
    'closedEnvelope.heightMm': 1792,
    'closedEnvelope.depthMm': 729,
  });
  const depth = parsed.claims.find((claim) => claim.field === 'closedEnvelope.depthMm');
  assert.match(depth.sourceLabel, /depth with door (?:&|and) handle/i);
  assert.equal(depth.includesDoor, true);
  assert.equal(depth.includesHandle, true);
});

test('MinerU scopes an LG trailing-wildcard family row to one shared dimension table', () => {
  const bytes = Buffer.from(JSON.stringify([[
    paragraph('DVH9-09B installation manual'),
    paragraph('Asterisk means one model variant (0-9 or A-Z).'),
    tableFragment('<table><tr><td>Model</td><td>DVH45-08* / DVH5-08* / DVH9-08* / DVH9-09*</td></tr></table>'),
    paragraph('Dimension(mm)', [80, 180, 300, 210]),
    tableFragment('<table><tr><td>W</td><td>600</td><td>D</td><td>690</td><td>D&quot;</td><td>1115</td></tr><tr><td>H</td><td>850</td><td>D&#x27;</td><td>615</td><td></td><td></td></tr></table>'),
  ]]));

  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'LG', model: 'DVH9-09B', category: 'dryer' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });

  assert.deepEqual(parsed.claims.map((claim) => [claim.field, claim.value]), [
    ['closedEnvelope.widthMm', { kind: 'fixed', mm: 600 }],
    ['closedEnvelope.heightMm', { kind: 'fixed', mm: 850 }],
  ]);
});

test('MinerU selects only the exact LG model-group dimension table on a shared page', () => {
  const bytes = Buffer.from(JSON.stringify([[
    paragraph('WV9-1412B installation manual'),
    tableFragment('<table><tr><td>Model</td><td>WV9-1410B / WV9-1410W</td><td>WV9-1412W / WV9-1412B</td></tr></table>'),
    paragraph('Dimension(mm)', [80, 180, 300, 210]),
    captionedTableFragment('<table><tr><td>W</td><td>595</td><td>D</td><td>560</td><td>D&quot;</td><td>1100</td></tr><tr><td>H</td><td>845</td><td>D&#x27;</td><td>620</td><td></td><td></td></tr></table>', 'WV9-1410B / WV9-1410W'),
    paragraph('WV9-1412W / WV9-1412B', [80, 550, 400, 575]),
    tableFragment('<table><tr><td>W</td><td>600</td><td>D</td><td>610</td><td>D&quot;</td><td>1135</td></tr><tr><td>H</td><td>850</td><td>D&#x27;</td><td>660</td><td></td><td></td></tr></table>'),
  ]]));

  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'LG', model: 'WV9-1412B', category: 'washing_machine' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });

  assert.deepEqual(parsed.claims.map((claim) => [claim.field, claim.value]), [
    ['closedEnvelope.widthMm', { kind: 'fixed', mm: 600 }],
    ['closedEnvelope.heightMm', { kind: 'fixed', mm: 850 }],
  ]);
});

test('MinerU does not let one trailing family wildcard absorb multiple model characters', () => {
  const bytes = Buffer.from(JSON.stringify([[
    paragraph('DVH9-090B installation manual'),
    tableFragment('<table><tr><td>Model</td><td>DVH9-09*</td></tr></table>'),
    paragraph('Dimension(mm)', [80, 180, 300, 210]),
    tableFragment('<table><tr><td>W</td><td>600</td><td>H</td><td>850</td></tr></table>'),
  ]]));

  assert.throws(() => parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'LG', model: 'DVH9-090B', category: 'dryer' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm'],
  }), /unresolved family|no exact-model MinerU evidence/i);
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
  assert.deepEqual(parsed.identitySignals.map((signal) => signal.type), [
    'mineru_page_footer_model',
    'source_url_exact_model',
  ]);

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

test('MinerU preserves adjustable height while parsing multiple explicit axes from one QRG paragraph', () => {
  const bytes = Buffer.from(JSON.stringify([[
    pageHeader('QUICK REFERENCE GUIDE > DD60D4NX9'),
    paragraph('Height 820 - 880 mm Width 599 mm Depth 573 mm'),
  ]]));

  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Fisher & Paykel', model: 'DD60D4NX9', category: 'dishwasher' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });

  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 599 },
    'closedEnvelope.heightMm': { kind: 'range', minMm: 820, maxMm: 880 },
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 573 },
  });
});

test('MinerU reconnects an explicit grouped dimension label to its next-row value', () => {
  const bytes = mineruJson(`<table>
    <tr><td>Model Number</td><td>HRTF206</td></tr>
    <tr><td>Dimensions (Packaged) (W X H X D)</td><td>581 x 1508 x 594 mm</td></tr>
    <tr><td>Dimensions (Net) (W X H X D)</td><td></td></tr>
    <tr><td></td><td>550 x 1456 x 562 mm</td></tr>
  </table>`, 'Hisense HRTF206');

  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Hisense', model: 'HRTF206', category: 'fridge' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });

  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 550,
    'closedEnvelope.heightMm': 1456,
    'closedEnvelope.depthMm': 562,
  });
  assert.ok(parsed.claims.every((claim) => /net/i.test(claim.sourceLabel)));
});

test('MinerU parses explicit value-unit-axis suffixes without position heuristics', () => {
  const bytes = Buffer.from(JSON.stringify([[
    pageHeader('DWAU615DB3'),
    paragraph('Dimensions 598mmW x 818mmH x 570mmD Finish Black'),
  ]]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Smeg', model: 'DWAU615DB3', category: 'dishwasher' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 598,
    'closedEnvelope.heightMm': 818,
    'closedEnvelope.depthMm': 570,
  });
});

test('MinerU uses the explicit including-handle depth variant for the overall closed envelope', () => {
  const bytes = Buffer.from(JSON.stringify([[
    pageHeader('Series 6 WQG235DRAU'),
    paragraph('Dimensions (H x W x D): 84.2 cm x 59.8 cm x 61.3 cm (64.8 cm including door handle)'),
  ]]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Bosch', model: 'WQG235DRAU', category: 'dryer' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 598,
    'closedEnvelope.heightMm': 842,
    'closedEnvelope.depthMm': 648,
  });
  assert.equal(parsed.claims.find((claim) => claim.field === 'closedEnvelope.depthMm').includesHandle, true);
});

test('MinerU parses an explicit net-dimensions section while rejecting the following package section', () => {
  const bytes = Buffer.from(JSON.stringify([
    [paragraph('HWFS1015E')],
    [tableFragment(`<table>
      <tr><td>Dimensions</td><td></td><td>mm</td></tr>
      <tr><td>Net</td><td>Height Width</td><td>845 mm 595</td></tr>
      <tr><td></td><td>Depth mm</td><td>590</td></tr>
      <tr><td>Shrink Film Package</td><td></td><td>mm 885</td></tr>
      <tr><td>Height</td><td></td><td></td></tr>
      <tr><td>Width</td><td>mm</td><td>648</td></tr>
      <tr><td>Depth</td><td>mm</td><td>670</td></tr>
    </table>`)],
  ]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    sourceUrls: ['https://dtc-aus-api.hisense.com/medias/HWFS1015E-Spec.pdf'],
    caseIdentity: { brand: 'Hisense', model: 'HWFS1015E', category: 'washing_machine' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 595,
    'closedEnvelope.heightMm': 845,
    'closedEnvelope.depthMm': 590,
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, {
    sourceLabel: claim.sourceLabel,
    sourceAxisOrder: claim.sourceAxisOrder,
  }])), {
    'closedEnvelope.widthMm': { sourceLabel: 'Width', sourceAxisOrder: ['width'] },
    'closedEnvelope.heightMm': { sourceLabel: 'Height', sourceAxisOrder: ['height'] },
    'closedEnvelope.depthMm': { sourceLabel: 'Depth', sourceAxisOrder: ['depth'] },
  });
  assert.ok(parsed.claims.every((claim) => !/package/i.test(claim.sourceLabel)));
});

test('MinerU reconstructs a Hisense net-with-handle table split across axis and value rows', () => {
  const bytes = Buffer.from(JSON.stringify([
    [paragraph('HRAF242 Refrigerator')],
    [tableFragment(`<table>
      <tr><td>Dimensions</td><td></td><td></td><td></td></tr>
      <tr><td>Net With handle</td><td>Width Depth</td><td>mm</td><td>550</td></tr>
      <tr><td></td><td>Height</td><td>mm mm</td><td>542 1434</td></tr>
      <tr><td></td><td></td><td></td><td></td></tr>
      <tr><td></td><td>Width</td><td>mm</td><td>580</td></tr>
      <tr><td>Box</td><td>Depth</td><td></td><td></td></tr>
      <tr><td></td><td>Height</td><td>mm</td><td>566</td></tr>
      <tr><td></td><td></td><td>mm</td><td>1482</td></tr>
    </table>`)],
  ]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    sourceUrls: ['https://dtc-aus-api.hisense.com/medias/HRAF242-Spec.pdf'],
    caseIdentity: { brand: 'Hisense', model: 'HRAF242', category: 'fridge' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 550,
    'closedEnvelope.heightMm': 1434,
    'closedEnvelope.depthMm': 542,
  });
  assert.ok(parsed.claims.every((claim) => /net with handle/i.test(claim.sourceLabel)));
});

test('MinerU binds concatenated colour variants to one exact model column using an explicit model list', () => {
  const specificationTable = `<table>
    <tr><td colspan="2">Model</td><td>ETM207XETM207W</td><td>ETM239XETM239W</td><td>ETM268XETM268W</td></tr>
    <tr><td rowspan="3">Dimensions</td><td>Height</td><td>1372mm</td><td>1522mm</td><td>1657mm</td></tr>
    <tr><td>Width</td><td>545mm</td><td>545mm</td><td>545mm</td></tr>
    <tr><td>Depth</td><td>623mm</td><td>623mm</td><td>623mm</td></tr>
  </table>`;
  const bytes = Buffer.from(JSON.stringify([
    [paragraph('Model Code/s: ETM207X ETM207W ETM239X ETM239W ETM268X ETM268W')],
    [tableFragment(specificationTable)],
  ]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Esatto', model: 'ETM207X', category: 'fridge' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 545,
    'closedEnvelope.heightMm': 1372,
    'closedEnvelope.depthMm': 623,
  });
  assert.ok(parsed.claims.every((claim) => (
    JSON.stringify(claim.sourceAxisOrder) === JSON.stringify(['height', 'width', 'depth'])
  )));

  const unscoped = Buffer.from(JSON.stringify([
    [paragraph('Refrigerator specifications')],
    [tableFragment(specificationTable)],
  ]));
  assert.throws(() => parseMineruContentListV2(unscoped, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Esatto', model: 'ETM207X', category: 'fridge' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  }), /identity|model/i);
});

test('MinerU reconnects a Bosch grouped dimension heading to an explicitly labelled next paragraph', () => {
  const bytes = Buffer.from(JSON.stringify([[
    pageHeader('Series 4 dishwasher SMS4HVI01A'),
    paragraph('Product Dimensions (H x W x D)', [80, 120, 420, 150]),
    paragraph('- H: 845 x W: 600 mm x D: 600 mm', [80, 155, 520, 185]),
  ]]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Bosch', model: 'SMS4HVI01A', category: 'dishwasher' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 600,
    'closedEnvelope.heightMm': 845,
    'closedEnvelope.depthMm': 600,
  });
  assert.ok(parsed.claims.every((claim) => claim.sourceAxisOrder.join(',') === 'height,width,depth'));
});

test('MinerU uses unique exact-model cover and source URL to scope a later Bosch dimension paragraph', () => {
  const bytes = Buffer.from(JSON.stringify([
    [{
      type: 'title',
      content: { title_content: [{ type: 'text', content: 'Series 8 heat pump tumble dryer WQG235D8AU' }] },
      bbox: [40, 30, 700, 70],
    }],
    [paragraph('- Dimensions (H x W x D): 84.2 cm x 59.8 cm x 61.3 cm (64.8 cm including door handle)')],
  ]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    sourceUrls: ['https://media3.bosch-home.com/Documents/specsheet/en-AU/WQG235D8AU.pdf'],
    caseIdentity: { brand: 'Bosch', model: 'WQG235D8AU', category: 'dryer' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 598,
    'closedEnvelope.heightMm': 842,
    'closedEnvelope.depthMm': 648,
  });
});

test('MinerU expands an explicit Electrolux colour-suffix shorthand only inside an exact matrix row', () => {
  const bytes = Buffer.from(JSON.stringify([[
    pageHeader('WBB3700WH - 346L bottom freezer fridge - White'),
    tableFragment('<table><tr><td>Dimensions</td><td>Product Height (H)</td><td>Product Width (W)</td><td>Product Depth (D)</td><td>Product Depth (D2) (Door Open)</td></tr><tr><td>WBB3700AH/ WH</td><td>1755</td><td>598</td><td>650</td><td>1199</td></tr><tr><td>WBB3400AH/ WH</td><td>1645</td><td>598</td><td>650</td><td>1199</td></tr></table>'),
    paragraph('These dimensions are a guide only. All measurements are in millimetres (mm).'),
  ]]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Westinghouse', model: 'WBB3700WH', category: 'fridge' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 598,
    'closedEnvelope.heightMm': 1755,
    'closedEnvelope.depthMm': 650,
  });

  assert.throws(() => parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Westinghouse', model: 'WBB3700BH', category: 'fridge' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm'],
  }), /identity|exact-model/i);
});

test('MinerU parses a single-cell exact-model net dimension sequence', () => {
  const bytes = Buffer.from(JSON.stringify([[
    pageHeader('Hisense HWF5I1215 Specifications'),
    tableFragment('<table><tr><td>Model Number</td><td>HWF5I1215</td></tr><tr><td colspan="2">Net dimensions(W x H x D) (mm) 595x 845x 595</td></tr></table>'),
  ]]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Hisense', model: 'HWF5I1215', category: 'washing_machine' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 595,
    'closedEnvelope.heightMm': 845,
    'closedEnvelope.depthMm': 595,
  });
});

test('MinerU ignores malformed multi-axis scalar labels when a complete explicit table is present', () => {
  const bytes = Buffer.from(JSON.stringify([
    [
      pageHeader('QUICK REFERENCE GUIDE > HRF510BHC'),
      tableFragment('<table><tr><td>Height</td><td>1725 mm</td></tr><tr><td>Width</td><td>790 mm</td></tr><tr><td>Depth</td><td>707 mm</td></tr></table>'),
    ],
    [
      pageHeader('QUICK REFERENCE GUIDE > HRF510BHC'),
      tableFragment('<table><tr><td>Product dimensions</td></tr><tr><td>Depth 707 mm 1725 mm</td></tr><tr><td>Height Width 790 mm</td></tr></table>'),
    ],
  ]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Haier', model: 'HRF510BHC', category: 'fridge' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 790,
    'closedEnvelope.heightMm': 1725,
    'closedEnvelope.depthMm': 707,
  });
});

test('MinerU repairs a dimension-section label shifted into the next axis row', () => {
  const bytes = Buffer.from(JSON.stringify([[
    pageHeader('QUICK REFERENCE GUIDE > DH9060H1'),
    tableFragment('<table><tr><td>Product dimensions</td><td>655 mm</td></tr><tr><td>Depth Height</td><td>850 mm</td></tr><tr><td>Width</td><td>600 mm</td></tr><tr><td>SKU</td><td>92293</td></tr></table>'),
  ]]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Fisher & Paykel', model: 'DH9060H1', category: 'dryer' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 600,
    'closedEnvelope.heightMm': 850,
    'closedEnvelope.depthMm': 655,
  });
  assert.ok(parsed.claims.every((claim) => claim.sourceAxisOrder.join(',') === 'depth,height,width'));
  assert.deepEqual(parsed.claims.map((claim) => claim.sourceLabel).sort(), ['Depth', 'Height', 'Width']);
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

test('image-only dimension detection selects only pages needing bounded hybrid parsing', () => {
  const bytes = Buffer.from(JSON.stringify([
    [
      {
        type: 'title',
        content: { title_content: [{ type: 'text', content: 'DW60CHPX1 Dishwasher' }] },
        bbox: [40, 40, 300, 80],
      },
      {
        type: 'image',
        content: { image_caption: ['Dimensions'], image_footnote: [] },
        bbox: [350, 140, 650, 520],
      },
    ],
    [
      {
        type: 'table',
        content: {
          html: '<table><tr><td>Width</td><td>598 mm</td></tr><tr><td>Height</td><td>820 - 870 mm</td></tr><tr><td>Depth</td><td>612 mm</td></tr></table>',
          table_caption: [], table_footnote: [], table_type: 'simple_table', table_nest_level: 1,
        },
        bbox: [350, 140, 650, 520],
      },
    ],
    [{
      type: 'image',
      content: { image_caption: ['Product photograph'], image_footnote: [] },
      bbox: [100, 100, 500, 700],
    }],
    [
      {
        type: 'paragraph',
        content: { paragraph_content: [{
          type: 'text',
          content: 'The product dimensions and specifications may change at any time. Check customer care for current details.',
        }] },
        bbox: [40, 80, 600, 140],
      },
      {
        type: 'image',
        content: { image_caption: ['Brand mark'], image_footnote: [] },
        bbox: [700, 80, 760, 140],
      },
    ],
    [
      {
        type: 'page_header',
        content: { page_header_content: [{ type: 'text', content: 'QUICK REFERENCE GUIDE > DH8060P3' }] },
        bbox: [35, 40, 222, 58],
      },
      {
        type: 'index',
        content: { list_type: 'text_list', list_items: [] },
        bbox: [40, 80, 322, 346],
      },
      {
        type: 'paragraph',
        content: { paragraph_content: [{
          type: 'text',
          content: 'The product dimensions and specifications in this page apply to the specific product and model.',
        }] },
        bbox: [354, 502, 632, 608],
      },
    ],
    [
      {
        type: 'page_header',
        content: { page_header_content: [{ type: 'text', content: 'QUICK REFERENCE GUIDE > DH8060P3' }] },
        bbox: [35, 40, 222, 58],
      },
      {
        type: 'table',
        content: {
          html: '<table><tr><td>Depth</td><td>650 mm</td></tr><tr><td>Height</td><td>850 mm</td></tr><tr><td>Width</td><td>600 mm</td></tr></table>',
          table_caption: [], table_footnote: [], table_type: 'simple_table', table_nest_level: 1,
        },
        bbox: [357, 300, 637, 368],
      },
    ],
  ]));
  assert.deepEqual(findMineruImageOnlyDimensionPages(bytes), [1, 5]);
});

test('hybrid derived artifact records the pinned profile and original page map', () => {
  const bytes = Buffer.from(JSON.stringify([[], [{
    type: 'table',
    content: {
      html: '<table><tr><td>Width</td><td>598 mm</td></tr></table>',
      table_caption: [], table_footnote: [], table_type: 'simple_table', table_nest_level: 1,
    },
    bbox: [350, 140, 650, 220],
  }], []]));
  const artifact = buildMineruDerivedArtifact(bytes, {
    pdfSha256,
    parserVersion: '3.4.4',
    modelRevision: 'bff20d4ae2bf202df9f45284b4d43681555a97ed',
    profile: {
      profileId: 'hybrid-image-high-v1', backend: 'hybrid-engine', method: 'auto',
      effort: 'high', imageAnalysis: true,
    },
    processedPages: [2],
    sourcePageCount: 3,
  });
  assert.equal(artifact.profileId, 'hybrid-image-high-v1');
  assert.deepEqual(artifact.processedPages, [2]);
  assert.equal(artifact.sourcePageCount, 3);
  assert.equal(artifact.pageCount, 3);
});

test('hybrid dimensions can use hash-bound single-model primary identity context', () => {
  const primaryBytes = Buffer.from(JSON.stringify([[
    {
      type: 'paragraph',
      content: { paragraph_content: [{ type: 'text', content: 'LG GF-B505BB Owner Manual' }] },
      bbox: [40, 30, 500, 70],
    },
    {
      type: 'image', content: { image_caption: ['Product dimensions'], image_footnote: [] },
      bbox: [80, 140, 800, 500],
    },
  ]]));
  const primaryHash = createHash('sha256').update(primaryBytes).digest('hex');
  const hybridBytes = Buffer.from(JSON.stringify([[
    {
      type: 'table', content: {
        html: '<table><tr><td>Width</td><td>835 mm</td></tr><tr><td>Height</td><td>1787 mm</td></tr><tr><td>Depth</td><td>730 mm</td></tr></table>',
      }, bbox: [80, 140, 800, 500],
    },
  ]]));
  const options = {
    pdfSha256,
    parserVersion: '3.4.4',
    modelRevision: 'bff20d4ae2bf202df9f45284b4d43681555a97ed',
    caseIdentity: { brand: 'LG', model: 'GF-B505BB', category: 'fridge' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  };
  assert.throws(() => parseMineruContentListV2(hybridBytes, options), /identity/i);
  const parsed = parseMineruContentListV2(hybridBytes, {
    ...options,
    identityContextJsonBytes: primaryBytes,
    identityContextContentSha256: primaryHash,
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 835,
    'closedEnvelope.heightMm': 1787,
    'closedEnvelope.depthMm': 730,
  });
  assert.ok(parsed.identitySignals.some((signal) => signal.type === 'mineru_body_model'));
});

test('primary identity context cannot document-scope a sibling-model family manual', () => {
  const primaryBytes = Buffer.from(JSON.stringify([[
    {
      type: 'paragraph',
      content: { paragraph_content: [{
        type: 'text', content: 'Models HWF3S8514X / HWF3S8514B washing machine',
      }] },
      bbox: [40, 30, 600, 70],
    },
    {
      type: 'image', content: { image_caption: ['Product dimensions'], image_footnote: [] },
      bbox: [80, 140, 800, 500],
    },
  ]]));
  const primaryHash = createHash('sha256').update(primaryBytes).digest('hex');
  const hybridBytes = Buffer.from(JSON.stringify([[
    {
      type: 'table', content: {
        html: '<table><tr><td>Width</td><td>595 mm</td></tr><tr><td>Height</td><td>845 mm</td></tr><tr><td>Depth</td><td>540 mm</td></tr></table>',
      }, bbox: [80, 140, 800, 500],
    },
  ]]));
  assert.throws(() => parseMineruContentListV2(hybridBytes, {
    pdfSha256,
    parserVersion: '3.4.4',
    modelRevision: 'bff20d4ae2bf202df9f45284b4d43681555a97ed',
    caseIdentity: { brand: 'Hisense', model: 'HWF3S8514X', category: 'washing_machine' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
    identityContextJsonBytes: primaryBytes,
    identityContextContentSha256: primaryHash,
  }), /family|multiple models|exact-model/i);
});

test('official exact-cover binding scopes a shared ASKO dishwasher technical table and preserves height range', () => {
  const bytes = Buffer.from(JSON.stringify([
    [paragraph('DBI343ID.W.AU DBI343ID.S.AU')],
    [tableFragment('<table><tr><td>Technical data</td></tr><tr><td>Height:</td><td>819-872 mm</td></tr><tr><td>Width:</td><td>596 mm</td></tr><tr><td>Depth:</td><td>554 mm</td></tr><tr><td>Weight:</td><td>45 kg</td></tr></table>')],
  ]));
  const options = {
    pdfSha256,
    parserVersion: '3.4.4',
    modelRevision: 'bff20d4ae2bf202df9f45284b4d43681555a97ed',
    caseIdentity: { brand: 'ASKO', model: 'DBI343ID.W.AU', category: 'dishwasher' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  };
  assert.throws(() => parseMineruContentListV2(bytes, options), /family|multiple models|exact-model/i);
  const parsed = parseMineruContentListV2(bytes, {
    ...options,
    boundExactCoverModel: 'DBI343ID.W.AU',
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 554 },
    'closedEnvelope.heightMm': { kind: 'range', minMm: 819, maxMm: 872 },
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 596 },
  });
  assert.ok(parsed.identitySignals.some((signal) => signal.type === 'mineru_bound_exact_cover_model'));
});
