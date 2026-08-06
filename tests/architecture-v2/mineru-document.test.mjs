import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  buildMineruDerivedArtifact,
  findMineruImageOnlyDimensionPages,
  inspectMineruContentListV2,
  mineruGrammarProfiles,
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

function titleFragment(content, bbox = [80, 80, 500, 120]) {
  return {
    type: 'title',
    content: { title_content: [{ type: 'text', content }], level: 2 },
    bbox,
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

function structuredListFragment(entries, {
  type = 'list',
  bbox = [410, 760, 700, 900],
} = {}) {
  return {
    type,
    content: {
      list_type: 'text_list',
      list_items: entries.map((entry) => ({
        item_type: 'text',
        item_content: [{ type: 'text', content: entry }],
      })),
    },
    bbox,
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

function chiqOfficialSpecJson({
  model = 'CTM200NSS5E',
  tableHtml = `<table>
    <tr><td>Packing Dimensions (WHD)mm</td><td>580 x 1510 x 630</td><td>Shipping</td></tr>
    <tr><td>Product Dimensions (WHD)mm</td><td>545 x 1465 x 590</td><td>Refrigerator</td></tr>
  </table>`,
} = {}) {
  return Buffer.from(JSON.stringify([
    [
      { type: 'title', content: { title_content: [{ type: 'text', content: 'TOP MOUNT FRIDGE' }], level: 2 }, bbox: [80, 60, 600, 110] },
      paragraph(model, [80, 120, 400, 160]),
    ],
    [
      pageHeader(model),
      tableFragment(tableHtml),
    ],
  ]));
}

const chiqFields = [
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
];
const missingChiqEvidence = /no exact-model MinerU evidence|requested MinerU evidence fields missing/i;

function parseChiqOfficialSpec(bytes, overrides = {}) {
  return parseMineruContentListV2(bytes, {
    pdfSha256,
    parserVersion: '3.4.4',
    modelRevision,
    caseIdentity: { brand: 'CHIQ', model: 'CTM200NSS5E', category: 'fridge' },
    fields: chiqFields,
    sourceUrls: ['https://chiq.com.au/cdn/shop/files/CTM200NSS5E_SPEC.pdf'],
    claimSemanticsVersion: 2,
    ...overrides,
  });
}

test('MinerU maps CHIQ exact-model official Product Dimensions WHD without consuming packing values', () => {
  const parsed = parseChiqOfficialSpec(chiqOfficialSpecJson());

  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 545 },
    'closedEnvelope.heightMm': { kind: 'fixed', mm: 1465 },
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 590 },
  });
  assert.deepEqual(parsed.claims.map((claim) => claim.sourceLabel), [
    'Product Width', 'Product Height', 'Product Depth',
  ]);
  assert.ok(parsed.claims.every((claim) => !/packing/i.test(claim.sourceLabel)));
  assert.ok(parsed.claims.every((claim) => (
    JSON.stringify(claim.sourceAxisOrder) === JSON.stringify(['width', 'height', 'depth'])
  )));
  assert.deepEqual(parsed.grammarProfileIds, ['chiq-au-exact-spec-product-whd-v1']);
  assert.equal(
    mineruGrammarProfiles[parsed.grammarProfileIds[0]].parserProfileId,
    parsed.grammarProfileIds[0],
  );
});

test('MinerU maps CHIQ Product Dimensions without a repeated WHD suffix when the packing row proves WHD millimetres', () => {
  const bytes = chiqOfficialSpecJson({
    tableHtml: `<table>
      <tr><td>Packing Dimensions (WHD)mm</td><td>745 x 1740 x 735</td></tr>
      <tr><td>Product Dimensions</td><td>700 x 1680 × 700</td><td>FREEZER COMPARTMENT</td></tr>
    </table>`,
  });
  const parsed = parseChiqOfficialSpec(bytes);

  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 700 },
    'closedEnvelope.heightMm': { kind: 'fixed', mm: 1680 },
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 700 },
  });
});

test('MinerU accepts CHIQ product-explicit WHD when OCR leaves the separate packing value cell empty', () => {
  const bytes = chiqOfficialSpecJson({
    tableHtml: `<table>
      <tr><td>Finish</td><td>1685 x 890 x 780</td><td>WARRANTY</td></tr>
      <tr><td>Packing Dimensions (WHD)mm</td><td></td><td>Freezer</td></tr>
      <tr><td>Product Dimensions (WHD)mm</td><td>1650 x 835 x 735</td><td>Compressor</td></tr>
    </table>`,
  });
  const parsed = parseChiqOfficialSpec(bytes);

  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 1650 },
    'closedEnvelope.heightMm': { kind: 'fixed', mm: 835 },
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 735 },
  });
});

test('MinerU accepts explicitly ordered CHIQ chest-freezer widths above the old upright-fridge limit', () => {
  const bytes = chiqOfficialSpecJson({
    model: 'CCF700WE',
    tableHtml: `<table>
      <tr><td>Packing Dimensions (WHD)mm</td><td>1910 x 1045 x 780</td></tr>
      <tr><td>Product Dimensions (WHD)mm</td><td>1880 x 945 x 735</td></tr>
    </table>`,
  });
  const parsed = parseChiqOfficialSpec(bytes, {
    caseIdentity: { brand: 'CHIQ', model: 'CCF700WE', category: 'fridge' },
    sourceUrls: ['https://chiq.com.au/cdn/shop/files/CCF700WE_SPEC.pdf'],
  });

  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 1880 },
    'closedEnvelope.heightMm': { kind: 'fixed', mm: 945 },
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 735 },
  });
});

test('MinerU rejects unsafe CHIQ spec-table variants instead of guessing product dimensions', () => {
  const cases = [
    {
      name: 'packing row only',
      html: '<table><tr><td>Packing Dimensions (WHD)mm</td><td>580 x 1510 x 630</td></tr></table>',
    },
    {
      name: 'duplicate product rows',
      html: '<table><tr><td>Packing Dimensions (WHD)mm</td><td>580 x 1510 x 630</td></tr><tr><td>Product Dimensions (WHD)mm</td><td>545 x 1465 x 590</td></tr><tr><td>Product Dimensions (WHD)mm</td><td>546 x 1465 x 590</td></tr></table>',
    },
    {
      name: 'merged packing and product OCR row',
      html: '<table><tr><td>Packing Dimensions (WHD)mm Product Dimensions</td><td>515 x 1020 x 615 475 × 977 x 565</td></tr></table>',
    },
    {
      name: 'extra text in product value cell',
      html: '<table><tr><td>Packing Dimensions (WHD)mm</td><td>580 x 1510 x 630</td></tr><tr><td>Product Dimensions (WHD)mm</td><td>545 x 1465 x 590 including handle</td></tr></table>',
    },
    {
      name: 'missing explicit WHD and unit context',
      html: '<table><tr><td>Packing Dimensions</td><td>580 x 1510 x 630</td></tr><tr><td>Product Dimensions</td><td>545 x 1465 x 590</td></tr></table>',
    },
  ];

  for (const fixture of cases) {
    assert.throws(
      () => parseChiqOfficialSpec(chiqOfficialSpecJson({ tableHtml: fixture.html })),
      missingChiqEvidence,
      fixture.name,
    );
  }
});

test('MinerU rejects CHIQ spec grammar when the source URL or document identity is not exact', () => {
  assert.throws(() => parseChiqOfficialSpec(chiqOfficialSpecJson(), {
    sourceUrls: ['https://chiq.com.au/cdn/shop/files/CTM200NSS5E_and_CTM255NW5E_SPEC.pdf'],
  }), missingChiqEvidence);

  assert.throws(() => parseChiqOfficialSpec(chiqOfficialSpecJson({ model: 'CTM255NW5E' })),
    /structured exact-model identity signal required|no exact-model MinerU evidence|requested MinerU evidence fields missing/i);
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

test('MinerU accepts an exact-model table whose Size values carry the W D H axis order', () => {
  const bytes = mineruJson(`<table>
    <tr><td>Model</td><td>TD-H802SJW</td></tr>
    <tr><td>Power supply</td><td>220 - 240 V, 50 Hz</td></tr>
    <tr><td>Size</td><td>600 mm (W) X 690 mm (D) X 850 mm(H)</td></tr>
    <tr><td>Product weight</td><td>54 - 57 kg</td></tr>
  </table>`, 'LG Dryer Owner Manual');
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'LG', model: 'TD-H802SJW', category: 'dryer' },
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
    claimSemanticsVersion: 2,
  });

  assert.deepEqual(parsed.claims.map((claim) => [
    claim.field, claim.value, claim.sourceAxisOrder,
  ]), [
    ['closedEnvelope.widthMm', { kind: 'fixed', mm: 600 }, ['width', 'depth', 'height']],
    ['closedEnvelope.heightMm', { kind: 'fixed', mm: 850 }, ['width', 'depth', 'height']],
    ['closedEnvelope.depthMm', { kind: 'fixed', mm: 690 }, ['width', 'depth', 'height']],
  ]);
  assert.ok(parsed.claims.every((claim) => claim.page === 1));
  assert.ok(parsed.claims.every((claim) => claim.sourceLabel === 'Size'));
  assert.deepEqual(parsed.grammarProfileIds, [
    'lg-au-dryer-exact-model-size-wdh-v1',
  ]);
});

test('MinerU rejects Size values without three axes, packaging scope, or conflicting label order', () => {
  const parse = (label, value) => parseMineruContentListV2(mineruJson(`<table>
    <tr><td>Model</td><td>TD-H802SJW</td></tr>
    <tr><td>${label}</td><td>${value}</td></tr>
  </table>`, 'LG Dryer Owner Manual'), {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'LG', model: 'TD-H802SJW', category: 'dryer' },
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
    claimSemanticsVersion: 2,
  });

  assert.throws(() => parse('Size', '600 x 690 x 850 mm'), /no exact-model MinerU evidence/i);
  assert.throws(() => parse('Pack Size', '600 mm (W) x 690 mm (D) x 850 mm (H)'), /no exact-model MinerU evidence/i);
  assert.throws(() => parse(
    'Size (W x H x D)',
    '600 mm (W) x 690 mm (D) x 850 mm (H)',
  ), /no exact-model MinerU evidence/i);
});

test('LG exact-model Size grammar does not classify a shared sibling-model row as exact', () => {
  assert.throws(() => parseMineruContentListV2(mineruJson(`<table>
      <tr><td>Model</td><td>TD-H802SJW / TD-H901MW</td></tr>
      <tr><td>Size</td><td>600 mm (W) x 690 mm (D) x 850 mm (H)</td></tr>
    </table>`, 'LG Dryer Owner Manual'), {
      pdfSha256, parserVersion: '3.4.4', modelRevision,
      caseIdentity: { brand: 'LG', model: 'TD-H802SJW', category: 'dryer' },
      fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
      claimSemanticsVersion: 2,
    }), /unresolved family manual|multiple models/i);
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
        html: '<table><tr><td>Dimensions</td><td>Product Height (H) (mm)</td><td>Product Width (W) (mm)</td><td>Product Depth (D) (mm)</td><td>Product Depth (D2) (Door Open) (mm)</td></tr><tr><td>WBB3700AH/WH</td><td>1755</td><td>598</td><td>650</td><td>1199</td></tr><tr><td>WBB3400AH/WH</td><td>1645</td><td>598</td><td>650</td><td>1199</td></tr></table>',
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
  assert.ok(parsed.evidenceObservations.every((observation) => (
    observation.fragmentType === 'derived_layout_scope'
      && observation.fragmentSha256
      && observation.quote
      && observation.parserProfileId === 'beko_au_dishwasher_product_spec_parallel_lists_v1'
  )));
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

test('MinerU replays the Beko min-height inline specification without inventing door-open depth', () => {
  const document = (packagedText) => Buffer.from(JSON.stringify([[
    pageHeader('DSN28435X 60 cm Semi Integrated Stainless Steel Dishwasher'),
    {
      type: 'title',
      content: { title_content: [{ type: 'text', content: 'Dimensions & Weights' }] },
      bbox: [536, 669, 719, 686],
    },
    paragraph(
      'Unpackaged Height (min): 850 mm Height (max - feet adjustment): 865 mm '
      + 'Unpackaged Width: 598 mm Unpackaged Depth: 600 mm',
      [534, 687, 838, 759],
    ),
    paragraph(packagedText, [534, 776, 840, 870]),
  ]]));
  const options = {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Beko', model: 'DSN28435X', category: 'dishwasher' },
    claimSemanticsVersion: 2,
    fields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm',
      'closedEnvelope.depthMm', 'operation.doorOpenDepthMm',
    ],
  };
  const packaged = 'Unpackaged Weight: 45 kg Packaged Height: 889 mm '
    + 'Packaged Width: 644 mm Packaged Depth: 661 mm Packaged Weight: 48 kg';

  const parsed = parseMineruContentListV2(document(packaged), options);
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 598 },
    'closedEnvelope.heightMm': { kind: 'range', minMm: 850, maxMm: 865 },
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 600 },
  });
  assert.deepEqual(parsed.grammarProfileIds, [
    'beko_au_dishwasher_product_spec_min_height_inline_pairs_v1',
  ]);
  const incomplete = parseMineruContentListV2(document('Packaged Height: 889 mm'), options);
  assert.equal(incomplete.grammarProfileIds.includes(
    'beko_au_dishwasher_product_spec_min_height_inline_pairs_v1',
  ), false);
  assert.equal(incomplete.claims.some((claim) => claim.field === 'closedEnvelope.heightMm'), false);
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

test('MinerU replays the Beko AU truncated-label product-card variant without mixing packaged values', () => {
  const labels = [
    'Unpackaged Height:',
    'Height (max - feet adjustment):',
    'Unpackaged Width:',
    'Unpackaged Depth:',
    'Depth with Door Opened:',
    'Unpackaged Weight:',
  ];
  const values = [
    '850 mm', '865 mm', '598 mm', '600 mm', '1150 mm',
    '44.3 kg', '897 mm', '657 mm', '674 mm', '49.9 kg',
  ];
  const document = (labelEntries = labels, valueEntries = values) => Buffer.from(JSON.stringify([[
    pageHeader('BDF1410X 14 Place Setting Freestanding Dishwasher Stainless'),
    titleFragment('Dimensions & Weights', [529, 644, 710, 661]),
    structuredListFragment(labelEntries, { bbox: [527, 663, 749, 770] }),
    structuredListFragment(valueEntries, { type: 'index', bbox: [763, 662, 831, 844] }),
  ]]));
  const options = {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Beko', model: 'BDF1410X', category: 'dishwasher' },
    claimSemanticsVersion: 2,
    fields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm',
      'closedEnvelope.depthMm', 'operation.doorOpenDepthMm',
    ],
  };

  const parsed = parseMineruContentListV2(document(), options);
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 598 },
    'closedEnvelope.heightMm': { kind: 'range', minMm: 850, maxMm: 865 },
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 600 },
    'operation.doorOpenDepthMm': { kind: 'fixed', mm: 1150 },
  });
  assert.deepEqual(parsed.grammarProfileIds, [
    'beko_au_dishwasher_product_spec_truncated_labels_v1',
  ]);
  assert.throws(
    () => parseMineruContentListV2(document(labels.slice(0, -1), values), options),
    /no exact-model MinerU evidence/i,
  );
  assert.throws(
    () => parseMineruContentListV2(document(labels, values.with(8, '674 kg')), options),
    /no exact-model MinerU evidence/i,
  );
});

test('MinerU binds the exact LG top-loader Size (mm) W/D/H suffix row', () => {
  const document = (model = 'WF-T8582', label = 'Size (mm)', value = '632(W) × 670(D) × 1020(H)') => (
    Buffer.from(JSON.stringify([[
      pageHeader('Specification'),
      tableFragment(`<table>
        <tr><td>Model</td><td>${model}</td></tr>
        <tr><td>Power supply</td><td>220-240 V~, 50Hz</td></tr>
        <tr><td>${label}</td><td>${value}</td></tr>
      </table>`),
    ]]))
  );
  const options = {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'LG', model: 'WF-T8582', category: 'washing_machine' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  };
  const parsed = parseMineruContentListV2(document(), options);
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 632,
    'closedEnvelope.heightMm': 1020,
    'closedEnvelope.depthMm': 670,
  });
  assert.deepEqual(parsed.grammarProfileIds, ['lg-au-washer-exact-model-size-wdh-v1']);
  assert.throws(() => parseMineruContentListV2(document('WF-T8582 / WF-T8582B'), options), /identity|evidence|scope/i);
  assert.throws(() => parseMineruContentListV2(
    document('WF-T8582', 'Packaged Size (mm)', '700(W) × 750(D) × 1100(H)'), options,
  ), /no exact-model MinerU evidence/i);
});

test('MinerU binds the audited LG fridge A/B/C diagram only to the complete declared manual model list', () => {
  const sourceHash = '5ceaeaaafb54c39b263672efb8dd54b24e4302aea61a18de6134758ab5f54ca1';
  const models = 'GS-D635PLC / GS-D635MBLC / GS-L635PLF / GS-L635PL / GS-L635MBL / '
    + 'GS-N635PL / GS-N635MBL / GS-V635PLC / GS-V635MBLC / GS-D600PLC / '
    + 'GS-D600MBLC / GS-V600MBLC / GS-L600PL / GS-N600PL / GS-L600MBL';
  const image = (bbox) => ({
    type: 'image', content: { image_source: { path: 'images/diagram.jpg' }, image_caption: [], image_footnote: [] }, bbox,
  });
  const dimensionTable = (c = 735) => tableFragment(`<table>
    <tr><td>I</td><td>Size (mm)</td></tr>
    <tr><td>A</td><td>913</td></tr><tr><td>B</td><td>1790</td></tr>
    <tr><td>C</td><td>${c}</td></tr><tr><td>D</td><td>620</td></tr>
    <tr><td>E</td><td>691</td></tr><tr><td>F</td><td>735</td></tr>
    <tr><td>G</td><td>1180</td></tr><tr><td>H</td><td>1635</td></tr>
  </table>`);
  const contentList = (coverModels = models, c = 735) => {
    const pages = Array.from({ length: 12 }, () => []);
    pages[0] = [titleFragment("OWNER'S MANUAL FRIDGE & FREEZER"), paragraph(coverModels)];
    pages[11] = [
      titleFragment('Dimensions and Clearances'),
      paragraph('Allow over 50 mm of clearance between the back of the appliance and the wall.'),
      image([78, 280, 245, 465]), image([254, 307, 459, 426]), dimensionTable(c),
    ];
    return Buffer.from(JSON.stringify(pages));
  };
  const options = {
    pdfSha256: sourceHash, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'LG', model: 'GS-V600MBLC', category: 'fridge' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
    sourceUrls: ['https://gscs-b2c.lge.com/open/downloadFile?fileId=4dEfGRBm7iKDAciS6QAuA'],
  };
  const parsed = parseMineruContentListV2(contentList(), options);
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 913,
    'closedEnvelope.heightMm': 1790,
    'closedEnvelope.depthMm': 735,
  });
  assert.deepEqual(parsed.grammarProfileIds, ['lg-au-fridge-a-b-c-dimension-diagram-v1']);
  for (const declaredModel of models.split(' / ')) {
    const canary = parseMineruContentListV2(contentList(), {
      ...options,
      caseIdentity: { ...options.caseIdentity, model: declaredModel },
    });
    assert.deepEqual(canary.claims.map(({ field, value }) => [field, value.mm]), [
      ['closedEnvelope.widthMm', 913],
      ['closedEnvelope.heightMm', 1790],
      ['closedEnvelope.depthMm', 735],
    ], declaredModel);
  }
  assert.throws(() => parseMineruContentListV2(contentList(), {
    ...options, pdfSha256: 'b'.repeat(64),
  }), /identity|evidence|scope|unresolved family/i);
  assert.throws(() => parseMineruContentListV2(contentList(`${models} / GS-UNKNOWN`), options), /identity|evidence|scope/i);
});

test('MinerU selects Esatto Physical W/D/H and rejects Packaged dimensions on exact product cards', () => {
  const document = ({ model = 'ETLW55', physicalLabel = 'Physical (w, d, h mm)', physical = '530 × 542 × 925mm' } = {}) => (
    Buffer.from(JSON.stringify([[
      titleFragment(`Model Code: ${model}`),
      paragraph('Product Dimensions:', [664, 154, 774, 174]),
      paragraph('Packaged (w, d, h mm)', [664, 179, 777, 200]),
      paragraph('→ 600 × 615 × 1,000mm', [664, 206, 787, 225]),
      paragraph(physicalLabel, [664, 230, 771, 252]),
      paragraph(`→ ${physical}`, [664, 257, 780, 277]),
    ]]))
  );
  const options = {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Esatto', model: 'ETLW55', category: 'washing_machine' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
    sourceUrls: ['https://esatto.house/s/Esatto_ProductCard-ETLW55.pdf'],
  };
  const parsed = parseMineruContentListV2(document(), options);
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 530,
    'closedEnvelope.heightMm': 925,
    'closedEnvelope.depthMm': 542,
  });
  assert.deepEqual(parsed.grammarProfileIds, ['esatto-au-product-card-physical-wdh-v1']);
  assert.ok(parsed.claims.every((claim) => !/packaged|600|615|1,000/i.test(claim.quote)));
  assert.throws(() => parseMineruContentListV2(document({ model: 'ETLW55 / ETLW55B' }), options), /identity|evidence|scope/i);
  assert.throws(() => parseMineruContentListV2(
    document({ physicalLabel: 'Packaged (w, d, h mm)' }), options,
  ), /no exact-model MinerU evidence/i);
  assert.throws(() => parseMineruContentListV2(
    document({ physical: '530 × 542 × 925' }), options,
  ), /no exact-model MinerU evidence/i);
  assert.throws(() => parseMineruContentListV2(
    document({ physical: '630 × 700 × 1,100mm' }), options,
  ), /no exact-model MinerU evidence/i);
});

test('MinerU binds Beko AU dryer unpacked dimensions from an exact aligned label-value block', () => {
  const labels = 'Unpacked Height: Unpacked Width: Unpacked Depth: Unpacked Weight: '
    + 'Packed Height: Packed Width: Packed Depth: Packed Weight:';
  const values = [
    '846 mm', '597 mm', '589 mm', '45 kg',
    '885 mm', '650 mm', '600 mm', '46.5 kg',
  ];
  const document = ({
    header = 'BDP810W 8 kg Sensor Controlled Heat Pump Tumble Dryer',
    labelText = labels,
    valueEntries = values,
    valueBbox = [763, 625, 830, 770],
  } = {}) => Buffer.from(JSON.stringify([[
    pageHeader(header),
    titleFragment('Dimensions & Weights', [526, 607, 709, 625]),
    paragraph(labelText, [526, 626, 658, 770]),
    structuredListFragment(valueEntries, { type: 'index', bbox: valueBbox }),
    captionedTableFragment(
      '<table><tr><td>W</td><td>D</td><td>H</td><td>C</td><td>Unit</td></tr>'
        + '<tr><td>597</td><td>568</td><td>846</td><td>31</td><td>mm</td></tr></table>',
      'Dimensions',
    ),
  ]]));
  const options = {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Beko', model: 'BDP810W', category: 'dryer' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  };

  const parsed = parseMineruContentListV2(document(), options);
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 597 },
    'closedEnvelope.heightMm': { kind: 'fixed', mm: 846 },
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 589 },
  });
  assert.deepEqual(parsed.grammarProfileIds, [
    'beko_au_dryer_product_spec_parallel_lists_v1',
  ]);
  assert.equal(parsed.claims.some((claim) => claim.value?.mm === 568), false);

  for (const unsafe of [
    { valueEntries: values.slice(0, -1) },
    { labelText: labels.replace('Unpacked Depth:', 'Packed Depth:') },
    { valueEntries: values.with(2, '589 kg') },
    { valueBbox: [100, 850, 200, 995] },
    { header: 'BDP810W / BDP83HW Heat Pump Tumble Dryers' },
  ]) {
    assert.throws(() => parseMineruContentListV2(document(unsafe), options),
      /identity|family|model|evidence/i);
  }
  assert.throws(() => parseMineruContentListV2(document(), {
    ...options,
    caseIdentity: { brand: 'Beko', model: 'BDP810W', category: 'dishwasher' },
  }), /identity|model|evidence/i);
});

test('MinerU binds Beko AU fridge dimensions from the exact mixed-section specification list', () => {
  const labels = 'Dimensions& Weights Unpackaged Height: Unpackaged Width: '
    + 'Depth(incl. Doors): Unpackaged Weight: Packaged Height: Packaged Width: '
    + 'Packaged Depth: Packaged Weight:';
  const dimensions = [
    '1770 mm', '756 mm', '700 mm', '85 kg',
    '1854 mm', '813 mm', '775 mm', '91 kg',
  ];
  const document = ({
    header = 'BBMB445PX 445 L Bottom Mount Fridge/Freezer Pearl Steel',
    labelText = labels,
    values = ['2 x Twist Ice Cube Maker', '2', ...dimensions, '8700000927', '8859377108749'],
  } = {}) => Buffer.from(JSON.stringify([[
    pageHeader(header),
    paragraph(labelText, [526, 592, 705, 753]),
    structuredListFragment(values, { type: 'index', bbox: [763, 554, 937, 588] }),
  ]]));
  const options = {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Beko', model: 'BBMB445PX', category: 'fridge' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  };

  const parsed = parseMineruContentListV2(document(), options);
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 756 },
    'closedEnvelope.heightMm': { kind: 'fixed', mm: 1770 },
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 700 },
  });
  assert.equal(parsed.claims.find((claim) => (
    claim.field === 'closedEnvelope.depthMm'
  )).includesDoor, true);
  assert.deepEqual(parsed.grammarProfileIds, [
    'beko_au_fridge_product_spec_mixed_section_list_v1',
  ]);

  for (const [name, unsafe] of Object.entries({
    incomplete_labels: { labelText: labels.replace('Unpackaged Width:', 'Packaged Width:') },
    reordered_axes: { labelText: labels.replace('Unpackaged Width: Depth(incl. Doors):', 'Depth(incl. Doors): Unpackaged Width:') },
    mixed_units: { values: ['2 x Twist Ice Cube Maker', '2', ...dimensions.with(2, '700 cm')] },
    duplicate_sequences: { values: [...dimensions, 'separator', ...dimensions] },
    sibling_model: { header: 'BBMB445PX / BBM450X Bottom Mount Fridges' },
  })) {
    assert.throws(() => parseMineruContentListV2(document(unsafe), options),
      /identity|family|model|evidence/i, name);
  }
  assert.throws(() => parseMineruContentListV2(document(), {
    ...options,
    caseIdentity: { brand: 'Beko', model: 'BBMB445PX', category: 'dryer' },
  }), /identity|model|evidence/i);
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
        html: '<table><tr><td>W</td><td>600 mm</td><td>D</td><td>475 mm</td><td>D&quot;</td><td>1015 mm</td></tr><tr><td>H</td><td>850 mm</td><td>D&#x27;</td><td>535 mm</td><td></td><td></td></tr></table>',
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
    tableFragment('<table><tr><td>W</td><td>600 mm</td><td>D</td><td>690 mm</td><td>D&quot;</td><td>1115 mm</td></tr><tr><td>H</td><td>850 mm</td><td>D&#x27;</td><td>615 mm</td><td></td><td></td></tr></table>'),
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

test('MinerU applies the Hisense AU washer indexed dimension diagram to listed sibling models', () => {
  const bytes = Buffer.from(JSON.stringify([[
    tableFragment('<table><tr><td>Model</td><td>HWF3S7514X</td><td>HWF3S8514X</td></tr><tr><td>Maximum load</td><td>7.5kg</td><td>8.5kg</td></tr></table>'),
    captionedTableFragment('<table><tr><td>Index</td><td>Dimensions (mm)</td></tr><tr><td>A</td><td>595</td></tr><tr><td>B</td><td>845</td></tr><tr><td>C</td><td>480</td></tr><tr><td>D</td><td>510</td></tr><tr><td>E</td><td>540</td></tr><tr><td>F</td><td>1020</td></tr></table>', 'DIMENSIONS (MM)'),
    {
      type: 'image',
      content: {
        image_source: { path: 'images/hisense-dimension-diagram.jpg' },
        content: 'F E 135 degrees',
        image_caption: [],
        image_footnote: [
          { type: 'text', content: 'E = appliance depth' },
          { type: 'text', content: 'F = Depth with door open' },
        ],
      },
      bbox: [240, 547, 500, 717],
    },
  ]]));

  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Hisense', model: 'HWF3S8514X', category: 'washing_machine' },
    claimSemanticsVersion: 2,
    fields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
      'operation.doorOpenDepthMm',
    ],
  });

  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 595,
    'closedEnvelope.heightMm': 845,
    'closedEnvelope.depthMm': 540,
    'operation.doorOpenDepthMm': 1020,
  });
  assert.deepEqual(parsed.grammarProfileIds, ['hisense-au-washer-indexed-dimension-diagram-v1']);
  assert.equal(
    mineruGrammarProfiles[parsed.grammarProfileIds[0]].parserProfileId,
    parsed.grammarProfileIds[0],
  );
});

test('MinerU leaves D/D-prime diagram depth variants unresolved without a declared profile', () => {
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
      ...tableFragment('<table><tr><td>W</td><td>600 mm</td><td>D</td><td>660 mm</td><td>D&quot;</td><td>1115 mm</td></tr><tr><td>H</td><td>850 mm</td><td>D&#x27;</td><td>614 mm</td><td></td><td></td></tr></table>'),
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
  });
  assert.deepEqual(parsed.claims.map((claim) => claim.sourceAxisOrder), [
    ['width'],
    ['height'],
  ]);
  assert.equal(parsed.claims.some((claim) => claim.field === 'closedEnvelope.depthMm'), false);
});

test('MinerU applies the hash-bound LG dryer diagram profile to closed depth only', () => {
  const bytes = Buffer.from(JSON.stringify([[
    tableFragment('<table><tr><td>Description</td><td>Value</td></tr><tr><td>Model</td><td>DVH1-08WP</td></tr></table>'),
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
    pdfSha256: '22c0a224a7a41de6589acfd7ae69cfb5d2b2e531eb0058dfb1ab7e6a3bcd3957',
    parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'LG', model: 'DVH1-08WP', category: 'dryer' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });

  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 600,
    'closedEnvelope.heightMm': 850,
    'closedEnvelope.depthMm': 660,
  });
  assert.deepEqual(parsed.grammarProfileIds, ['lg-au-dryer-dimension-diagram-v1']);
  assert.equal(parsed.claims.some((claim) => claim.sourceLabel === "D'"), false);
  assert.equal(parsed.claims.some((claim) => claim.sourceLabel === 'D"'), false);
});

test('LG dryer diagram profile accepts an explicit model list but rejects structural drift', () => {
  const sourceTable = '<table><tr><td>W</td><td>600</td><td>D</td><td>690</td><td>D&quot;</td><td>1115</td></tr><tr><td>H</td><td>850</td><td>D&#x27;</td><td>615</td><td></td><td></td></tr></table>';
  const modelTable = tableFragment('<table><tr><td>Description</td><td>Value</td></tr><tr><td>Model</td><td>DVH10-10B / DVH10-10W / DVH9-10B / DVH5-10G</td></tr></table>');
  const image = {
    type: 'image',
    content: {
      image_source: { path: 'images/dimension-side-view.jpg' },
      image_caption: [], image_footnote: [],
    },
    bbox: [200, 230, 800, 520],
  };
  const parse = (items, model = 'DVH10-10B') => parseMineruContentListV2(
    Buffer.from(JSON.stringify([items])),
    {
      pdfSha256: '521077b559417d620664ead6be32ee1738e575ae50a7ffb3734b3fc24458d462',
      parserVersion: '3.4.4', modelRevision,
      caseIdentity: { brand: 'LG', model, category: 'dryer' },
      claimSemanticsVersion: 2,
      fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
    },
  );

  const accepted = parse([
    modelTable,
    paragraph('Dimension(mm)', [80, 180, 300, 210]),
    image,
    captionedTableFragment(sourceTable, 'Dimensions (mm)'),
  ]);
  assert.equal(accepted.claims.find((claim) => claim.field === 'closedEnvelope.depthMm').value.mm, 690);
  assert.deepEqual(accepted.grammarProfileIds, ['lg-au-dryer-dimension-diagram-v1']);

  const noImage = parse([
    modelTable,
    paragraph('Dimension(mm)', [80, 180, 300, 210]),
    captionedTableFragment(sourceTable, 'Dimensions (mm)'),
  ]);
  assert.equal(noImage.claims.some((claim) => claim.field === 'closedEnvelope.depthMm'), false);
  assert.deepEqual(noImage.grammarProfileIds, []);

  assert.throws(() => parse([
    modelTable,
    paragraph('Dimension(mm)', [80, 180, 300, 210]),
    image,
    captionedTableFragment(sourceTable, 'Dimensions (mm)'),
  ], 'DVH11-10B'), /identity|exact-model/i);
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
    tableFragment('<table><tr><td>W</td><td>600 mm</td><td>D</td><td>690 mm</td><td>D&quot;</td><td>1115 mm</td></tr><tr><td>H</td><td>850 mm</td><td>D&#x27;</td><td>615 mm</td><td></td><td></td></tr></table>'),
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
    captionedTableFragment('<table><tr><td>W</td><td>595 mm</td><td>D</td><td>560 mm</td><td>D&quot;</td><td>1100 mm</td></tr><tr><td>H</td><td>845 mm</td><td>D&#x27;</td><td>620 mm</td><td></td><td></td></tr></table>', 'WV9-1410B / WV9-1410W'),
    paragraph('WV9-1412W / WV9-1412B', [80, 550, 400, 575]),
    tableFragment('<table><tr><td>W</td><td>600 mm</td><td>D</td><td>610 mm</td><td>D&quot;</td><td>1135 mm</td></tr><tr><td>H</td><td>850 mm</td><td>D&#x27;</td><td>660 mm</td><td></td><td></td></tr></table>'),
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

test('MinerU binds a Samsung AU washer wildcard specification only with explicit variant semantics', () => {
  const variantDefinition = paragraph(
    '“*” Asterisk(s) means variant model and can be varied (0-9) or (A-Z).',
    [120, 180, 598, 197],
  );
  const specification = tableFragment(`<table>
    <tr><td colspan="3">Type</td><td>Front loading washing machine</td></tr>
    <tr><td colspan="3">Model name</td><td>WW12BB******</td></tr>
    <tr><td rowspan="3">Dimensions</td><td colspan="2">Width</td><td>600 mm</td></tr>
    <tr><td colspan="2">Height</td><td>850 mm</td></tr>
    <tr><td colspan="2">Depth</td><td>695 mm</td></tr>
    <tr><td colspan="3">Water pressure</td><td>50-800 kPa</td></tr>
  </table>`);
  const otherSpecification = tableFragment(`<table>
    <tr><td colspan="3">Type</td><td>Front loading washing machine</td></tr>
    <tr><td colspan="3">Model name</td><td>WW90BB******</td></tr>
    <tr><td rowspan="3">Dimensions</td><td colspan="2">Width</td><td>600 mm</td></tr>
    <tr><td colspan="2">Height</td><td>850 mm</td></tr>
    <tr><td colspan="2">Depth</td><td>595 mm</td></tr>
  </table>`);
  const bytes = Buffer.from(JSON.stringify([[variantDefinition, specification, otherSpecification]]));
  const sourceUrl = 'https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_AU&ModelName=WW12BB944DGB&CttFileID=11396073&CDCttType=UM';
  const options = {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Samsung', model: 'WW12BB944DGB', category: 'washing_machine' },
    sourceUrls: [sourceUrl], claimSemanticsVersion: 2,
    fields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
    ],
  };

  const parsed = parseMineruContentListV2(bytes, options);
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 600 },
    'closedEnvelope.heightMm': { kind: 'fixed', mm: 850 },
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 695 },
  });
  assert.deepEqual(parsed.grammarProfileIds, ['samsung-au-washer-wildcard-specification-v1']);
  assert.ok(parsed.identitySignals.some((signal) => (
    signal.type === 'mineru_samsung_washer_wildcard_specification'
  )));

  assert.throws(() => parseMineruContentListV2(
    Buffer.from(JSON.stringify([[specification, otherSpecification]])),
    options,
  ), /identity|variant|wildcard/i);
  assert.throws(() => parseMineruContentListV2(bytes, {
    ...options,
    caseIdentity: { ...options.caseIdentity, model: 'WW12BB944DGBX' },
  }), /identity|model|wildcard/i);
  assert.throws(() => parseMineruContentListV2(bytes, {
    ...options,
    sourceUrls: [sourceUrl.replace('UNI_AU', 'UNI_US')],
  }), /identity|source|AU/i);
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

test('MinerU keeps alternating W H D cells with separate page unit context out of fresh claims', () => {
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

  assert.throws(() => parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'LG', model: 'WD1275A1', category: 'washing_machine' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  }), /explicit unit|evidence/i);
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

test('MinerU inherits one trailing unit across an x-separated labelled dimension sequence', () => {
  const bytes = Buffer.from(JSON.stringify([[
    pageHeader('SBI8EDS01A'),
    paragraph('Product Dimensions (H x W x D)'),
    paragraph('- Height 865-925 x Width 598 mm x Depth 573 mm'),
  ]]));

  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Bosch', model: 'SBI8EDS01A', category: 'dishwasher' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });

  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 598 },
    'closedEnvelope.heightMm': { kind: 'range', minMm: 865, maxMm: 925 },
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

test('MinerU preserves Smeg W-D-H suffix order and an explicitly bounded adjustable height', () => {
  for (const [model, expression, expectedHeight] of [
    ['DWAI6314X', 'Size 598mmW x 570mmD x 818–868mmH max', { minMm: 818, maxMm: 868 }],
    ['DWAU6315X', 'Size 598mmW x 570mmD x 818mm-888mmH max', { minMm: 818, maxMm: 888 }],
    ['DWAFI6314', 'Size 598mmW x 570mmD x 818mm–888mmH', { minMm: 818, maxMm: 888 }],
  ]) {
    const bytes = Buffer.from(JSON.stringify([[
      pageHeader(`${model} SMEG DISHWASHER`),
      paragraph(expression),
    ]]));
    const parsed = parseMineruContentListV2(bytes, {
      pdfSha256, parserVersion: '3.4.4', modelRevision,
      caseIdentity: { brand: 'Smeg', model, category: 'dishwasher' },
      claimSemanticsVersion: 2,
      fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
    });

    assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
      'closedEnvelope.widthMm': { kind: 'fixed', mm: 598 },
      'closedEnvelope.heightMm': { kind: 'range', ...expectedHeight },
      'closedEnvelope.depthMm': { kind: 'fixed', mm: 570 },
    });
    assert.ok(parsed.claims.every((claim) => (
      claim.sourceAxisOrder.join(',') === 'width,depth,height'
    )));
  }
});

test('MinerU parses an exact-model Smeg fixed W-H-D size row inside a larger table', () => {
  const bytes = Buffer.from(JSON.stringify([[
    titleFragment('DWA314W smeg freestanding/built-in dishwasher'),
    titleFragment('ALSO AVAILABLE IN STAINLESS STEEL: DWA314X', [20, 130, 500, 165]),
    tableFragment(`<table>
      <tr><td>size</td><td>598mmW × 850mmH x 595mmD</td></tr>
      <tr><td>capacity</td><td>14 place settings</td></tr>
      <tr><td>water connection</td><td>single, cold/hot water max 60°C</td></tr>
    </table>`),
  ]]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    sourceUrls: ['https://sys.smeg.com.au/Product/Techspecs/DWA314W.pdf'],
    caseIdentity: { brand: 'Smeg', model: 'DWA314W', category: 'dishwasher' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });

  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 598 },
    'closedEnvelope.heightMm': { kind: 'fixed', mm: 850 },
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 595 },
  });
  assert.ok(parsed.claims.every((claim) => (
    claim.sourceAxisOrder.join(',') === 'width,height,depth'
  )));
  assert.deepEqual(parsed.grammarProfileIds, [
    'smeg-au-dishwasher-size-whd-suffix-fixed-v1',
  ]);
});

test('Smeg fixed Size paragraphs retain the generic receipt semantics', () => {
  const bytes = Buffer.from(JSON.stringify([[
    pageHeader('DWA315W smeg freestanding/built-in dishwasher'),
    paragraph('size 598mmW x 850mmH x 596mmD'),
  ]]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Smeg', model: 'DWA315W', category: 'dishwasher' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });

  assert.deepEqual(parsed.grammarProfileIds, []);
  assert.ok(parsed.claims.every((claim) => (
    claim.quote === undefined
      && claim.sourceAxisOrder.join(',') === 'width,height,depth'
  )));
});

test('MinerU parses strict Smeg fixed suffix permutations without reordering axes', () => {
  for (const [model, expression, expected] of [
    ['DWA6314B', 'Size 598mmW x 600mmD x 850mmH', {
      'closedEnvelope.widthMm': { kind: 'fixed', mm: 598 },
      'closedEnvelope.heightMm': { kind: 'fixed', mm: 850 },
      'closedEnvelope.depthMm': { kind: 'fixed', mm: 600 },
    }],
    ['DWA4510X', 'dimensions 850mmH x 448mmW x 600mmD', {
      'closedEnvelope.widthMm': { kind: 'fixed', mm: 448 },
      'closedEnvelope.heightMm': { kind: 'fixed', mm: 850 },
      'closedEnvelope.depthMm': { kind: 'fixed', mm: 600 },
    }],
  ]) {
    const bytes = Buffer.from(JSON.stringify([[
      pageHeader(`${model} smeg dishwasher`),
      paragraph(expression),
    ]]));
    const parsed = parseMineruContentListV2(bytes, {
      pdfSha256, parserVersion: '3.4.4', modelRevision,
      caseIdentity: { brand: 'Smeg', model, category: 'dishwasher' },
      claimSemanticsVersion: 2,
      fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
    });

    assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), expected);
    assert.deepEqual(parsed.grammarProfileIds, [
      'smeg-au-dishwasher-fixed-axis-suffix-permutation-v1',
    ]);
  }
});

test('MinerU preserves a strict Smeg parenthetical maximum as a height range', () => {
  const bytes = Buffer.from(JSON.stringify([[
    pageHeader('DWAI315XT smeg dishwasher'),
    paragraph('size 598mmW x 858mmH (928mmH max) x 570mmD'),
  ]]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Smeg', model: 'DWAI315XT', category: 'dishwasher' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 598 },
    'closedEnvelope.heightMm': { kind: 'range', minMm: 858, maxMm: 928 },
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 570 },
  });
  assert.deepEqual(parsed.grammarProfileIds, [
    'smeg-au-dishwasher-size-whd-parenthetical-height-max-v1',
  ]);
});

test('MinerU document-scopes a Smeg parenthetical height range through its exact footer and official URL', () => {
  const bytes = Buffer.from(JSON.stringify([[
    paragraph('size 598mmW x 858mmH (928mmH max) x 570mmD'),
    {
      type: 'page_footer',
      content: { page_footer_content: [{ type: 'text', content: 'Code DWAI315XT' }] },
      bbox: [796, 966, 956, 982],
    },
  ], [
    pageHeader('DWAI315XT smeg semi-integrated dishwasher, TALL TANK'),
  ]]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Smeg', model: 'DWAI315XT', category: 'dishwasher' },
    sourceUrls: ['https://sys.smeg.com.au/Product/Techspecs/DWAI315XT.pdf'],
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 598 },
    'closedEnvelope.heightMm': { kind: 'range', minMm: 858, maxMm: 928 },
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 570 },
  });
  assert.deepEqual(parsed.grammarProfileIds, [
    'smeg-au-dishwasher-size-whd-parenthetical-height-max-v1',
  ]);
});

test('Smeg fixed suffix parsing keeps excluding-door depth blocked', () => {
  const expression = 'size 598mmW x 928mmH max x 550mmD (excluding door)';
  const bytes = Buffer.from(JSON.stringify([[
    pageHeader('DWAFI152T smeg dishwasher'),
    paragraph(expression),
  ]]));
  assert.throws(() => parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Smeg', model: 'DWAFI152T', category: 'dishwasher' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  }), /no exact-model MinerU evidence/i);
});

test('Smeg suffix-range grammar rejects packaging, non-height ranges, duplicate axes, and trailing prose', () => {
  for (const expression of [
    'Package Size 598mmW x 570mmD x 818–868mmH max',
    'Size 598–620mmW x 570mmD x 818mmH max',
    'Size 598mmW x 570mmW x 818–868mmH max',
    'Size 598mmW x 570mmD x 888–818mmH max',
    'Size 598mmW x 570mmD x 818–868mmH including hoses',
  ]) {
    const bytes = Buffer.from(JSON.stringify([[
      pageHeader('DWAI6314X SMEG DISHWASHER'),
      paragraph(expression),
    ]]));
    assert.throws(() => parseMineruContentListV2(bytes, {
      pdfSha256, parserVersion: '3.4.4', modelRevision,
      caseIdentity: { brand: 'Smeg', model: 'DWAI6314X', category: 'dishwasher' },
      claimSemanticsVersion: 2,
      fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
    }), /no exact-model MinerU evidence/i, expression);
  }
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
      <tr><td>Width</td><td>mm</td><td>580</td></tr>
      <tr><td>Box</td><td>Depth</td><td></td><td></td></tr>
      <tr><td>Height</td><td>mm</td><td>566</td></tr>
      <tr><td></td><td>mm</td><td>1482</td></tr>
      <tr><td>Weight</td><td>Net / Gross</td><td>kg</td><td>38/41</td></tr>
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
  assert.deepEqual(parsed.grammarProfileIds, ['hisense-au-legacy-spec-net-box-axes-v1']);
  assert.ok(parsed.claims.every((claim) => /net with handle/i.test(claim.sourceLabel)));
  const sourceTableHash = inspectMineruContentListV2(bytes).pages[1].fragments
    .find((fragment) => fragment.type === 'table').fragmentSha256;
  assert.ok(parsed.claims.every((claim) => claim.fragmentSha256 === sourceTableHash));
  assert.ok(parsed.identitySignals.every((signal) => !signal.type.startsWith('mineru_hisense_')));
});

test('MinerU applies the exact Hisense legacy Net and Box grammar to one combined axis list', () => {
  const bytes = Buffer.from(JSON.stringify([[
    paragraph('HRBC140 Beverage Cabinet', [590, 220, 800, 260]),
    titleFragment('Dimensions', [130, 810, 250, 840]),
    paragraph('Net With handle', [175, 840, 260, 870]),
    paragraph('Box', [200, 880, 260, 905]),
    structuredListFragment([
      'Width mm 595', 'Depth mm 647', 'Height mm 862',
      'Width mm 640', 'Depth mm 696', 'Height mm 947',
      'Net / Gross kg 44.5 / 48',
    ], { bbox: [410, 835, 650, 925] }),
  ]]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    sourceUrls: ['https://dtc-aus-api.hisense.com/medias/HRBC140-Spec.pdf'],
    caseIdentity: { brand: 'Hisense', model: 'HRBC140', category: 'fridge' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 595,
    'closedEnvelope.heightMm': 862,
    'closedEnvelope.depthMm': 647,
  });
  assert.deepEqual(parsed.grammarProfileIds, ['hisense-au-legacy-spec-net-box-axes-v1']);
  assert.ok(parsed.claims.every((claim) => /net with handle/i.test(claim.sourceLabel)));
});

test('MinerU applies the exact Hisense legacy Net and Box grammar to separate indexed triples', () => {
  const bytes = Buffer.from(JSON.stringify([[
    paragraph('Manufacturer model HRCF300 Description Chest Freezer', [390, 245, 710, 285]),
    titleFragment('Dimensions', [125, 745, 240, 775]),
    paragraph('Net With handle', [165, 775, 250, 805]),
    structuredListFragment([
      'Width mm 1114', 'Depth mm 630', 'Height mm 847',
    ], { type: 'index', bbox: [470, 770, 650, 808] }),
    paragraph('Box', [195, 815, 250, 842]),
    structuredListFragment([
      'Width mm 1145', 'Depth mm 647', 'Height mm 880',
    ], { type: 'index', bbox: [470, 812, 650, 850] }),
  ]]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    sourceUrls: ['https://dtc-aus-api.hisense.com/medias/HRCF300-Spec.pdf'],
    caseIdentity: { brand: 'Hisense', model: 'HRCF300', category: 'fridge' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 1114,
    'closedEnvelope.heightMm': 847,
    'closedEnvelope.depthMm': 630,
  });
  assert.deepEqual(parsed.grammarProfileIds, ['hisense-au-legacy-spec-net-box-axes-v1']);
});

test('MinerU applies the exact Hisense legacy grammar to a collapsed Net and Box table', () => {
  const bytes = Buffer.from(JSON.stringify([
    [titleFragment('HRCD585BWB', [640, 230, 800, 260])],
    [tableFragment(`<table>
      <tr><td>Dimensions Net</td><td></td><td></td><td></td></tr>
      <tr><td>With handle</td><td>Width Depth</td><td>mm mm</td><td>912 725</td></tr>
      <tr><td rowspan="4">Box</td><td>Height</td><td>mm</td><td>1785</td></tr>
      <tr><td></td><td></td><td></td></tr>
      <tr><td>Width</td><td></td><td></td></tr>
      <tr><td>Depth</td><td>mm</td><td>968</td></tr>
      <tr><td></td><td>Height</td><td>mm</td><td>778</td></tr>
      <tr><td>Weight</td><td>Net / Gross</td><td>mm</td><td>1901</td></tr>
    </table>`)],
  ]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    sourceUrls: ['https://dtc-aus-api.hisense.com/medias/HRCD585BWB-Spec.pdf'],
    caseIdentity: { brand: 'Hisense', model: 'HRCD585BWB', category: 'fridge' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 912,
    'closedEnvelope.heightMm': 1785,
    'closedEnvelope.depthMm': 725,
  });
  assert.deepEqual(parsed.grammarProfileIds, ['hisense-au-legacy-spec-net-box-axes-v1']);
});

test('MinerU applies the exact Hisense legacy grammar to a recovered Net and Box rowspan table', () => {
  const bytes = Buffer.from(JSON.stringify([
    [
      paragraph('Manufacturer Model Description Warranty Period'),
      structuredListFragment([
        'HRCD610TS', 'French Door refrigerator/freezer', '3 years',
      ]),
    ],
    [tableFragment(`<table>
      <tr><td colspan="4">Dimensions</td></tr>
      <tr><td rowspan="3">Net With handle</td><td>Width</td><td>mm</td><td>912</td></tr>
      <tr><td>Depth</td><td>mm</td><td>725</td></tr>
      <tr><td>Height</td><td>mm</td><td>1785</td></tr>
      <tr><td rowspan="3">Box</td><td>Width</td><td>mm</td><td>968</td></tr>
      <tr><td>Depth</td><td>mm</td><td>778</td></tr>
      <tr><td>Height</td><td>mm</td><td>1901</td></tr>
      <tr><td>Weight</td><td>Net / Gross</td><td>kg</td><td>118.5/127.5</td></tr>
    </table>`)],
  ]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    sourceUrls: ['https://dtc-aus-api.hisense.com/medias/HRCD610TS-Spec.pdf'],
    caseIdentity: { brand: 'Hisense', model: 'HRCD610TS', category: 'fridge' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 912,
    'closedEnvelope.heightMm': 1785,
    'closedEnvelope.depthMm': 725,
  });
  assert.deepEqual(parsed.grammarProfileIds, ['hisense-au-legacy-spec-net-box-axes-v1']);
  assert.ok(parsed.claims.every((claim) => /net with handle/i.test(claim.sourceLabel)));
  assert.ok(parsed.claims.every((claim) => ![968, 778, 1901].includes(claim.value.mm)));
});

test('MinerU binds a cross-page exact Hisense Net and Packaged WHD table', () => {
  const bytes = Buffer.from(JSON.stringify([
    [
      pageHeader('Hisense HSBE15FS'),
      tableFragment('<table><tr><td>Model Number</td><td>HSBE15FS</td></tr></table>'),
    ],
    [tableFragment(`<table>
      <tr><td>Dimensions</td><td></td></tr>
      <tr><td>Dimensions (Packaged) (W X H X D)</td><td>680x890x656 (mm)</td></tr>
      <tr><td>Dimensions (Net) (W X H X D)</td><td>600x845x596 (mm)</td></tr>
    </table>`)],
  ]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    sourceUrls: ['https://dtc-aus-api.hisense.com/medias/HSBE15FS-Spec.pdf'],
    caseIdentity: { brand: 'Hisense', model: 'HSBE15FS', category: 'dishwasher' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 600,
    'closedEnvelope.heightMm': 845,
    'closedEnvelope.depthMm': 596,
  });
  assert.deepEqual(parsed.grammarProfileIds, ['hisense-au-exact-spec-net-package-whd-v1']);
  assert.ok(parsed.claims.every((claim) => /net/i.test(claim.sourceLabel)));
  assert.ok(parsed.claims.every((claim) => ![680, 890, 656].includes(claim.value.mm)));
});

test('MinerU rejects unsafe Hisense exact-spec variants instead of inferring dimensions', () => {
  const fields = ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'];
  const parseLegacy = (bytes, overrides = {}) => parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    sourceUrls: ['https://dtc-aus-api.hisense.com/medias/HRBC140-Spec.pdf'],
    caseIdentity: { brand: 'Hisense', model: 'HRBC140', category: 'fridge' },
    claimSemanticsVersion: 2, fields, ...overrides,
  });
  const legacyPage = (identityText, netEntries, boxEntries = [
    'Width mm 640', 'Depth mm 696', 'Height mm 947',
  ]) => Buffer.from(JSON.stringify([[
    paragraph(identityText, [590, 220, 850, 260]),
    titleFragment('Dimensions', [130, 810, 250, 840]),
    paragraph('Net With handle', [175, 840, 260, 870]),
    structuredListFragment(netEntries, { type: 'index', bbox: [410, 835, 650, 875] }),
    paragraph('Box', [200, 880, 260, 905]),
    structuredListFragment(boxEntries, { type: 'index', bbox: [410, 880, 650, 925] }),
  ]]));

  assert.throws(() => parseLegacy(legacyPage('HRBC140 Beverage Cabinet', [
    'Width mm 595', 'Depth mm 647', 'Height mm 862',
  ]), { sourceUrls: ['https://example.com/HRBC140-Spec.pdf'] }), /evidence|identity/i);
  assert.throws(() => parseLegacy(legacyPage('HRBC140 HRBC141 Beverage Cabinets', [
    'Width mm 595', 'Depth mm 647', 'Height mm 862',
  ])), /family|multiple models|scope|evidence/i);
  assert.throws(() => parseLegacy(legacyPage('HRBC140 Beverage Cabinet', [
    'Width mm 595', 'Depth mm 647.5', 'Height mm 862',
  ])), /evidence/i);

  const unitlessWasher = Buffer.from(JSON.stringify([
    [pageHeader('Hisense HWF5S1214'), tableFragment('<table><tr><td>Model Number</td><td>HWF5S1214</td></tr></table>')],
    [
      titleFragment('Packaging'),
      paragraph('Net dimensions(W x H x D)', [90, 115, 310, 131]),
      paragraph('595*845*640', [413, 115, 522, 131]),
      paragraph('Package dimensions(W x H x D)', [90, 131, 347, 149]),
      paragraph('650*890*720', [413, 131, 522, 148]),
    ],
  ]));
  assert.throws(() => parseMineruContentListV2(unitlessWasher, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    sourceUrls: ['https://dtc-aus-api.hisense.com/medias/HWF5S1214-Spec.pdf'],
    caseIdentity: { brand: 'Hisense', model: 'HWF5S1214', category: 'washing_machine' },
    claimSemanticsVersion: 2, fields,
  }), /evidence/i);

  const structuredNetBoxTable = ({ netWidthUnit = 'mm', boxWidth = 968 } = {}) => tableFragment(`<table>
    <tr><td colspan="4">Dimensions</td></tr>
    <tr><td rowspan="3">Net With handle</td><td>Width</td><td>${netWidthUnit}</td><td>912</td></tr>
    <tr><td>Depth</td><td>mm</td><td>725</td></tr>
    <tr><td>Height</td><td>mm</td><td>1785</td></tr>
    <tr><td rowspan="3">Box</td><td>Width</td><td>mm</td><td>${boxWidth}</td></tr>
    <tr><td>Depth</td><td>mm</td><td>778</td></tr>
    <tr><td>Height</td><td>mm</td><td>1901</td></tr>
    <tr><td>Weight</td><td>Net / Gross</td><td>kg</td><td>118.5/127.5</td></tr>
  </table>`);
  const parseStructured = (tables) => parseMineruContentListV2(Buffer.from(JSON.stringify([
    [paragraph('Manufacturer Model HRCD610TS French Door refrigerator/freezer')],
    tables,
  ])), {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    sourceUrls: ['https://dtc-aus-api.hisense.com/medias/HRCD610TS-Spec.pdf'],
    caseIdentity: { brand: 'Hisense', model: 'HRCD610TS', category: 'fridge' },
    claimSemanticsVersion: 2, fields,
  });
  assert.throws(() => parseStructured([structuredNetBoxTable({ netWidthUnit: '' })]), /evidence/i);
  assert.throws(() => parseStructured([structuredNetBoxTable({ boxWidth: 900 })]), /evidence/i);
  assert.throws(() => parseStructured([
    structuredNetBoxTable(), structuredNetBoxTable(),
  ]), /evidence/i);
});

test('fresh V2 claims require an explicit unit in the bound fragment, not separate page context', () => {
  const fields = ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'];
  const options = {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    sourceUrls: ['https://dtc-aus-api.hisense.com/medias/HRCD640TBW.pdf'],
    caseIdentity: { brand: 'Hisense', model: 'HRCD640TBW', category: 'fridge' },
    claimSemanticsVersion: 2, fields,
  };
  const contextOnly = Buffer.from(JSON.stringify([[
    pageHeader('Hisense HRCD640TBW'),
    paragraph('Dimensions (mm)', [80, 90, 300, 120]),
    tableFragment('<table><tr><td>H</td><td>850</td><td>W</td><td>600</td><td>D</td><td>635</td></tr></table>'),
  ]]));
  assert.throws(() => parseMineruContentListV2(contextOnly, options), /explicit unit|evidence/i);

  const explicit = Buffer.from(JSON.stringify([[
    pageHeader('Hisense HRCD640TBW'),
    paragraph('Product dimensions (H x W x D): 850 mm x 600 mm x 635 mm'),
  ]]));
  const parsed = parseMineruContentListV2(explicit, options);
  assert.deepEqual(parsed.claims.map((claim) => claim.value.mm), [600, 850, 635]);
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

test('MinerU binds a shared product-dimension table only to explicitly listed finish variants', () => {
  const title = {
    type: 'title',
    content: {
      title_content: [{ type: 'text', content: 'dishwasher DW60CD2' }],
      level: 1,
    },
    bbox: [245, 79, 754, 184],
  };
  const finishTable = tableFragment(`<table>
    <tr><td>Finish:</td></tr>
    <tr><td>Available in Brushed Stainless Steel (DW60CDX2) and White (DW60CDW2) finish</td></tr>
  </table>`);
  const dimensionsTable = tableFragment(`<table>
    <tr><td colspan="3">Product Dimensions (mm):</td></tr>
    <tr><td>A</td><td>Overall height of product</td><td>850</td></tr>
    <tr><td>B</td><td>Overall width of product</td><td>600</td></tr>
    <tr><td>C</td><td>Overall depth of product (without curvature)</td><td>600</td></tr>
    <tr><td>D</td><td>Depth of open door</td><td>595</td></tr>
    <tr><td colspan="3">Cabinetry Dimensions (mm):</td></tr>
    <tr><td>F</td><td>Inside height of cavity</td><td>855</td></tr>
  </table>`);
  const bytes = Buffer.from(JSON.stringify([
    [title, finishTable],
    [dimensionsTable],
    [tableFragment(`<table>
      <tr><td>Product width</td><td>610 mm</td></tr>
      <tr><td>Product height</td><td>860 mm</td></tr>
      <tr><td>Product depth</td><td>620 mm</td></tr>
    </table>`)],
  ]));
  const options = (model) => ({
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Fisher & Paykel', model, category: 'dishwasher' },
    claimSemanticsVersion: 2,
    fields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm',
      'closedEnvelope.depthMm',
    ],
  });

  for (const model of ['DW60CDW2', 'DW60CDX2']) {
    const parsed = parseMineruContentListV2(bytes, options(model));
    assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
      'closedEnvelope.widthMm': { kind: 'fixed', mm: 600 },
      'closedEnvelope.heightMm': { kind: 'fixed', mm: 850 },
      'closedEnvelope.depthMm': { kind: 'fixed', mm: 600 },
    });
    assert.ok(parsed.identitySignals.some((signal) => (
      signal.type === 'mineru_structured_finish_variant_model'
    )));
    assert.ok(parsed.claims.every((claim) => claim.page === 2));
  }

  assert.throws(
    () => parseMineruContentListV2(bytes, options('DW60CDB2')),
    /structured exact-model identity|no exact-model MinerU evidence/i,
  );
  assert.throws(() => parseMineruContentListV2(bytes, {
    ...options('DW60CDW2'),
    fields: ['operation.doorOpenDepthMm'],
  }), /no exact-model MinerU evidence/i);
});

test('MinerU binds Fisher and Paykel DW60 installation dimensions through its model applicability matrix', () => {
  const modelTable = tableFragment(`<table>
    <tr><td></td><td>DW60FC1 models</td><td>DW60FC2DW60FC4DW60FC6 models</td></tr>
    <tr><td>Capacity</td><td>14 place settings</td><td>15 place settings</td></tr>
    <tr><td>Colour White Stainless Steel</td><td>DW60FC1W1DW60FC1X1</td><td>DW60FC2W1 DW60FC4W1DW60FC6W1 DW60FC2X1 DW60FC4X1DW60FC6X1</td></tr>
  </table>`);
  const productDimensions = tableFragment(`<table>
    <tr><td>PRODUCT DIMENSIONS</td><td></td></tr>
    <tr><td>A Overall height of product</td><td></td></tr>
    <tr><td>with top panel in place with top panel removed*</td><td>850 - 870** 820 - 840**</td></tr>
    <tr><td>B Overall width of product</td><td>597</td></tr>
    <tr><td>C Overall depth of product</td><td>600</td></tr>
    <tr><td>D Depth of open door (measured from front of kickstrip)</td><td>595</td></tr>
  </table>`);
  const cabinetryDimensions = tableFragment(`<table>
    <tr><td>CABINETRY DIMENSIONS</td><td>MM</td></tr>
    <tr><td>Inside height of cavity with top panel in place</td><td>855 - 875</td></tr>
    <tr><td>Minimum inside width of cavity</td><td>600</td></tr>
  </table>`);
  const contextOnlyBytes = Buffer.from(JSON.stringify([
    [{ type: 'paragraph', content: { paragraph_content: [{ type: 'text', content: 'DW60 models' }] }, bbox: [450, 570, 550, 600] }],
    [],
    [modelTable],
    [productDimensions, cabinetryDimensions],
  ]));
  const options = (model, sourceModel = model) => ({
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Fisher & Paykel', model, category: 'dishwasher' },
    sourceUrls: [`https://dam.fisherpaykel.com/FP-InstallGuide-${sourceModel}-FreestandingDishwasher-AU-NZ.pdf`],
    claimSemanticsVersion: 2,
    fields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm',
      'closedEnvelope.depthMm',
    ],
  });

  for (const model of ['DW60FC4W1', 'DW60FC4X1']) {
    assert.throws(
      () => parseMineruContentListV2(contextOnlyBytes, options(model)),
      /explicit unit|evidence/i,
    );
  }

  const boundProductDimensions = tableFragment(`<table>
    <tr><td>PRODUCT DIMENSIONS</td><td>MM</td></tr>
    <tr><td>A Overall height of product</td><td></td></tr>
    <tr><td>with top panel in place with top panel removed*</td><td>850 - 870** 820 - 840**</td></tr>
    <tr><td>B Overall width of product</td><td>597</td></tr>
    <tr><td>C Overall depth of product</td><td>600</td></tr>
    <tr><td>D Depth of open door (measured from front of kickstrip)</td><td>595</td></tr>
  </table>`);
  const bytes = Buffer.from(JSON.stringify([
    [{ type: 'paragraph', content: { paragraph_content: [{ type: 'text', content: 'DW60 models' }] }, bbox: [450, 570, 550, 600] }],
    [],
    [modelTable],
    [boundProductDimensions, cabinetryDimensions],
  ]));

  for (const model of ['DW60FC4W1', 'DW60FC4X1']) {
    const parsed = parseMineruContentListV2(bytes, options(model));
    assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
      'closedEnvelope.widthMm': { kind: 'fixed', mm: 597 },
      'closedEnvelope.heightMm': { kind: 'range', minMm: 850, maxMm: 870 },
      'closedEnvelope.depthMm': { kind: 'fixed', mm: 600 },
    });
    assert.ok(parsed.identitySignals.some((signal) => (
      signal.type === 'mineru_fp_dw60_model_applicability'
    )));
    assert.ok(parsed.claims.every((claim) => claim.page === 4));
  }

  assert.throws(
    () => parseMineruContentListV2(bytes, options('DW60FC4B1')),
    /identity|model/i,
  );
  assert.throws(
    () => parseMineruContentListV2(bytes, options('DW60FC4W1', 'DW60FC4X1')),
    /identity|model/i,
  );
  assert.throws(() => parseMineruContentListV2(bytes, {
    ...options('DW60FC4W1'),
    fields: ['operation.doorOpenDepthMm'],
  }), /no exact-model MinerU evidence/i);
});

test('MinerU binds the RF610A support family only to its explicit RF610/RF540A product column', () => {
  const identity = { brand: 'Fisher & Paykel', model: 'RF610ADUQSX4', category: 'fridge' };
  const cover = {
    type: 'paragraph',
    content: { paragraph_content: [{ type: 'text', content: 'Ice & Water and Non-Ice & Water E372B, E402B, E406B, E442B, E522B, RF522W, RF522A, RF610A & RF540A models' }] },
    bbox: [88, 828, 384, 902],
  };
  const dimensions = {
    type: 'table',
    content: { html: '<table><tr><td>Product dimensions (mm)</td><td>RF522W</td><td>RF522A</td><td>RF610/RF540A</td></tr><tr><td>A overall height of product</td><td>1715</td><td>1715</td><td>1790</td></tr><tr><td>B overall width of product</td><td>790</td><td>790</td><td>900</td></tr><tr><td>overall depth of product (excludes handle, includes evaporator)</td><td>695</td><td>695</td><td>695</td></tr><tr><td>Cabinetry dimensions (mm)</td><td></td><td></td><td></td></tr><tr><td>D inside height of cavity</td><td>1735</td><td>1735</td><td>1810</td></tr></table>' },
    bbox: [57, 131, 940, 833],
  };
  const bytes = Buffer.from(JSON.stringify([[cover], [], [dimensions]]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: identity, claimSemanticsVersion: 2, boundSupportFamilyModel: 'RF610A',
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });

  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.heightMm': 1790,
    'closedEnvelope.widthMm': 900,
    'closedEnvelope.depthMm': 695,
  });
  assert.ok(parsed.grammarProfileIds.includes('fisher-paykel-rf610a-support-family-v1'));
  assert.ok(parsed.identitySignals.some((signal) => signal.type === 'mineru_fp_rf610a_support_family'));
  assert.equal(
    parsed.claims.find((claim) => claim.field === 'closedEnvelope.depthMm').includesHandle,
    false,
  );

  for (const [label, pages, options = {}] of [
    ['missing cover', [[], [], [dimensions]]],
    ['wrong table heading', [[cover], [], [{ ...dimensions, content: { html: dimensions.content.html.replace('RF610/RF540A', 'RF610/RF540') } }]]],
    ['duplicate table', [[cover], [], [dimensions, dimensions]]],
    ['missing depth axis', [[cover], [], [{ ...dimensions, content: { html: dimensions.content.html.replace(/<tr><td>overall depth[\s\S]*?<\/tr>/, '') } }]]],
  ]) {
    assert.throws(() => parseMineruContentListV2(Buffer.from(JSON.stringify(pages)), {
      pdfSha256, parserVersion: '3.4.4', modelRevision,
      caseIdentity: identity, claimSemanticsVersion: 2, boundSupportFamilyModel: 'RF610A',
      fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
      ...options,
    }), /bound support family|identity signal/i, label);
  }

  assert.throws(() => parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { ...identity, model: 'RF605QNUVB1' }, claimSemanticsVersion: 2,
    boundSupportFamilyModel: 'RF610A',
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  }), /bound support family|identity signal/i);
});

test('MinerU binds a DW60CH support family only through the shared AU/NZ cover and product table', () => {
  const identity = { brand: 'Fisher & Paykel', model: 'DW60CHW1', category: 'dishwasher' };
  const cover = paragraph('DW60CH, DW60CHP and DW60CK models');
  const market = paragraph('NZ AU', [420, 650, 560, 690]);
  const dimensions = tableFragment(`<table>
    <tr><td colspan="2">Product Dimensions</td><td>mm</td></tr>
    <tr><td>A</td><td>Overall height of productwith top panel in placewith top panel removed*</td><td>850 (min) -870 (max)**820 (min) -840 (max)**</td></tr>
    <tr><td>B</td><td>Overall width of product</td><td>598</td></tr>
    <tr><td>C</td><td>Overall depth of product</td><td>612</td></tr>
    <tr><td>D</td><td>Depth of open door(measured from front of kickstrip)</td><td>595</td></tr>
    <tr><td colspan="3">Cabinetry Dimensions</td></tr>
    <tr><td>F</td><td>min. inside width of cavity</td><td>600</td></tr>
  </table>`);
  const bytes = Buffer.from(JSON.stringify([
    [cover, market], [], [], [], [], [], [], [], [], [dimensions],
  ]));
  const options = {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: identity, claimSemanticsVersion: 2,
    boundSupportFamilyModel: 'DW60CH',
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  };
  const parsed = parseMineruContentListV2(bytes, options);

  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 598 },
    'closedEnvelope.heightMm': { kind: 'range', minMm: 850, maxMm: 870 },
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 612 },
  });
  assert.ok(parsed.grammarProfileIds.includes('fisher-paykel-dw60ch-support-family-v1'));
  assert.ok(parsed.identitySignals.some((signal) => (
    signal.type === 'mineru_fp_dw60ch_support_family'
  )));
  assert.ok(parsed.claims.every((claim) => claim.page === 10));

  for (const [label, pages, family = 'DW60CH'] of [
    ['missing AU/NZ market', [[cover], [], [], [], [], [], [], [], [], [dimensions]]],
    ['missing cover', [[], [], [], [], [], [], [], [], [], [dimensions]]],
    ['duplicate dimensions', [[cover, market], [], [], [], [], [], [], [], [], [dimensions, dimensions]]],
    ['sibling family', [[cover, market], [], [], [], [], [], [], [], [], [dimensions]], 'DW60CK'],
    ['two height ranges without removed-panel semantics', [[cover, market], [], [], [], [], [], [], [], [], [{
      ...dimensions,
      content: { html: dimensions.content.html.replace('placewith top panel removed*', 'place*') },
    }]]],
    ['two height ranges without in-place semantics', [[cover, market], [], [], [], [], [], [], [], [], [{
      ...dimensions,
      content: { html: dimensions.content.html.replace('with top panel in placewith top panel removed*', 'with top panel removed*') },
    }]]],
    ['two height ranges with reversed panel semantics', [[cover, market], [], [], [], [], [], [], [], [], [{
      ...dimensions,
      content: { html: dimensions.content.html.replace('with top panel in placewith top panel removed*', 'with top panel removed with top panel in place*') },
    }]]],
  ]) {
    assert.throws(() => parseMineruContentListV2(Buffer.from(JSON.stringify(pages)), {
      ...options, boundSupportFamilyModel: family,
    }), /bound support family|identity signal/i, label);
  }
});

test('MinerU binds a legacy WA60 family only through its cover, market, main table and capacity table', () => {
  const identity = { brand: 'Fisher & Paykel', model: 'WA7060G1', category: 'washing_machine' };
  const cover = paragraph('WA1060E, WA8560E, WA8060E, WA7560E, WA7060E, WA1060G, WA9060G, WA8560G, WA8060G, WA7060G and WA7060M Models');
  const market = paragraph('INSTALLATION GUIDE / USER GUIDE NZ AU SG ROW', [260, 820, 720, 910]);
  const dimensions = tableFragment(`<table>
    <tr><td></td><td>WA⁺'60</td></tr>
    <tr><td>PRODUCT DIMENSIONS</td><td>mm</td></tr>
    <tr><td>A Overall height of product† (to highest point on console)</td><td>1045 - 1075</td></tr>
    <tr><td>B Overall width of product</td><td>600</td></tr>
    <tr><td>© Depth of product</td><td>600</td></tr>
    <tr><td>D Height of product to top of lid† (closed)</td><td>950 - 980</td></tr>
    <tr><td>E Height of lid open† (measured from bottom of product)</td><td>1350 - 1385</td></tr>
    <tr><td>Standpipe height</td><td>min. 850 - 1200</td></tr>
    <tr><td>MINIMUM CLEARANCES</td><td>mm</td></tr>
    <tr><td>F Minimum cavity width</td><td>640</td></tr>
    <tr><td>G Minimum depth clearance (including inlet hoses, drain hose and bowed front)</td><td>660</td></tr>
    <tr><td>H Minimum clearance to either side or wall</td><td>20</td></tr>
  </table>`);
  const capacity = tableFragment(`<table>
    <tr><td></td><td>WA7060*</td><td>WA7560*</td><td>WA8060*</td><td>WA8560*</td><td>WA9060G</td><td>WA1060*</td></tr>
    <tr><td>Maximum capacity (kg)</td><td>7.0</td><td>7.5</td><td>8.0</td><td>8.5</td><td>9.0</td><td>10.0</td></tr>
  </table>`);
  const pages = [[cover, market], [], [], [], [], [], [dimensions, capacity]];
  const options = {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: identity, claimSemanticsVersion: 2,
    boundSupportFamilyModel: 'WA7060G',
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  };
  const parsed = parseMineruContentListV2(Buffer.from(JSON.stringify(pages)), options);

  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 600 },
    'closedEnvelope.heightMm': { kind: 'range', minMm: 1045, maxMm: 1075 },
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 600 },
  });
  assert.ok(parsed.grammarProfileIds.includes('fisher-paykel-wa60-legacy-support-family-v1'));
  assert.ok(parsed.identitySignals.some((signal) => signal.type === 'mineru_fp_wa60_support_family'));

  for (const [label, candidatePages, candidateOptions = {}] of [
    ['missing cover', [[market], [], [], [], [], [], [dimensions, capacity]]],
    ['missing market', [[cover], [], [], [], [], [], [dimensions, capacity]]],
    ['missing capacity table', [[cover, market], [], [], [], [], [], [dimensions]]],
    ['duplicate dimensions table', [[cover, market], [], [], [], [], [], [dimensions, dimensions, capacity]]],
    ['wrong table family marker', [[cover, market], [], [], [], [], [], [{
      ...dimensions,
      content: { ...dimensions.content, html: dimensions.content.html.replace("WA⁺'60", 'WA70') },
    }, capacity]]],
    ['sibling not on cover', pages, { caseIdentity: { ...identity, model: 'WA8060P1' }, boundSupportFamilyModel: 'WA8060P' }],
  ]) {
    assert.throws(() => parseMineruContentListV2(Buffer.from(JSON.stringify(candidatePages)), {
      ...options, ...candidateOptions,
    }), /bound support family|identity signal/i, label);
  }
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

test('MinerU preserves a Bosch Tall Tub height range from shorthand H W D labels with inherited units', () => {
  const bytes = Buffer.from(JSON.stringify([[
    pageHeader('Series 8, fully-integrated dishwasher, 60 cm, Tall Tub SBV8ECX01A'),
    paragraph('Product Dimensions (H x W x D)', [80, 120, 420, 150]),
    paragraph('- H: 865-925 x W: 598 mm x D: 550 mm', [80, 155, 520, 185]),
  ]]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Bosch', model: 'SBV8ECX01A', category: 'dishwasher' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 598 },
    'closedEnvelope.heightMm': { kind: 'range', minMm: 865, maxMm: 925 },
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 550 },
  });
  assert.ok(parsed.grammarProfileIds.includes(
    'bosch-au-dishwasher-shorthand-hwd-inherited-unit-v1',
  ));
});

test('MinerU scopes a Bosch Dimensions section through repeated exact titles and an exact official PDF URL', () => {
  const bytes = Buffer.from(JSON.stringify([
    [],
    [titleFragment('Serie | 6, built-under dishwasher, 60 cm, White SMP66MX02A')],
    [
      titleFragment('Dimensions'),
      paragraph('- Height 815-875 mm x Width 598 mm x Depth 573 mm'),
    ],
    [titleFragment('Serie | 6, built-under dishwasher, 60 cm, White SMP66MX02A')],
  ]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Bosch', model: 'SMP66MX02A', category: 'dishwasher' },
    claimSemanticsVersion: 2,
    sourceUrls: ['https://media3.bosch-home.com/Documents/specsheet/en-AU/SMP66MX02A.pdf'],
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 598 },
    'closedEnvelope.heightMm': { kind: 'range', minMm: 815, maxMm: 875 },
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 573 },
  });
  assert.ok(parsed.claims.every((claim) => claim.page === 3));
  assert.ok(parsed.grammarProfileIds.includes(
    'bosch-au-dishwasher-dimensions-section-explicit-axes-v1',
  ));
});

test('MinerU document-scopes an explicit Bosch product HxWxD row through repeated exact titles', () => {
  const bytes = Buffer.from(JSON.stringify([
    [paragraph('Dimensions of the product (HxWxD) : 845 x 600 x 600 mm')],
    [
      titleFragment('Serie | 6, free-standing dishwasher, 60 cm, White'),
      titleFragment('SMS66MW01A'),
    ],
    [titleFragment('Serie | 6, free-standing dishwasher, 60 cm, White SMS66MW01A')],
  ]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Bosch', model: 'SMS66MW01A', category: 'dishwasher' },
    claimSemanticsVersion: 2,
    sourceUrls: ['https://media3.bosch-home.com/Documents/specsheet/en-AU/SMS66MW01A.pdf'],
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 600 },
    'closedEnvelope.heightMm': { kind: 'fixed', mm: 845 },
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 600 },
  });
  assert.ok(parsed.claims.every((claim) => claim.page === 1));
});

test('MinerU prefers a Bosch adjustable height range when the product height is its exact lower endpoint', () => {
  const identity = { brand: 'Bosch', model: 'SMP66MX01A', category: 'dishwasher' };
  const bytes = Buffer.from(JSON.stringify([
    [
      titleFragment('Serie | 6, built-under dishwasher, 60 cm, Stainless steel SMP66MX01A'),
      paragraph('Dimensions of the product (HxWxD) : 815 x 598 x 573 mm'),
    ],
    [],
    [
      titleFragment('Dimensions'),
      paragraph('- Height 815-875 mm x Width 598 mm x Depth 573 mm'),
    ],
    [titleFragment('Serie | 6, built-under dishwasher, 60 cm, Stainless steel SMP66MX01A')],
  ]));
  const options = {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: identity,
    claimSemanticsVersion: 2,
    sourceUrls: ['https://media3.bosch-home.com/Documents/specsheet/en-AU/SMP66MX01A.pdf'],
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  };

  const parsed = parseMineruContentListV2(bytes, options);
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 598 },
    'closedEnvelope.heightMm': { kind: 'range', minMm: 815, maxMm: 875 },
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 573 },
  });
  assert.ok(parsed.claims.every((claim) => claim.page === 3));

  const conflicting = Buffer.from(JSON.stringify([
    [
      titleFragment('Serie | 6, built-under dishwasher, 60 cm, Stainless steel SMP66MX01A'),
      paragraph('Dimensions of the product (HxWxD) : 815 x 598 x 573 mm'),
    ],
    [],
    [
      titleFragment('Dimensions'),
      paragraph('- Height 820-875 mm x Width 598 mm x Depth 573 mm'),
    ],
    [titleFragment('Serie | 6, built-under dishwasher, 60 cm, Stainless steel SMP66MX01A')],
  ]));
  assert.throws(() => parseMineruContentListV2(conflicting, options), /ambiguous MinerU values/i);
});

test('MinerU does not document-scope contextual or unbound Bosch dimension sections', () => {
  const options = {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Bosch', model: 'SMP66MX02A', category: 'dishwasher' },
    claimSemanticsVersion: 2,
    sourceUrls: ['https://media3.bosch-home.com/Documents/specsheet/en-AU/SMP66MX02A.pdf'],
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  };
  for (const [label, heading, sourceUrls = options.sourceUrls] of [
    ['niche', 'Required niche dimensions'],
    ['packaging', 'Packaging dimensions'],
    ['unbound URL', 'Dimensions', []],
  ]) {
    const bytes = Buffer.from(JSON.stringify([
      [titleFragment('Serie | 6 dishwasher SMP66MX02A')],
      [],
      [titleFragment(heading), paragraph('- Height 815-875 mm x Width 598 mm x Depth 573 mm')],
    ]));
    assert.throws(() => parseMineruContentListV2(bytes, {
      ...options, sourceUrls,
    }), /no exact-model MinerU evidence|identity signal/i, label);
  }
});

test('MinerU rejects inherited-unit shorthand triples with incomplete, duplicate, mixed, or contextual axes', () => {
  for (const value of [
    '- H: 865-925 x W: 598 mm',
    '- H: 865-925 x W: 598 mm x H: 550 mm',
    '- H: 865-925 x W: 59.8 cm x D: 550 mm',
    'Required niche H: 865-925 x W: 600 mm x D: 550 mm',
  ]) {
    const bytes = Buffer.from(JSON.stringify([[
      pageHeader('Series 8 dishwasher SBV8ECX01A'),
      paragraph('Product Dimensions (H x W x D)'),
      paragraph(value),
    ]]));
    assert.throws(() => parseMineruContentListV2(bytes, {
      pdfSha256, parserVersion: '3.4.4', modelRevision,
      caseIdentity: { brand: 'Bosch', model: 'SBV8ECX01A', category: 'dishwasher' },
      claimSemanticsVersion: 2,
      fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
    }), /no exact-model MinerU evidence/i, value);
  }
});

test('MinerU parses Bosch standalone per-value H W D labels without trusting a malformed grouped label', () => {
  const bytes = Buffer.from(JSON.stringify([
    [
      pageHeader('Serie | 6 dishwasher SCE53M05AU'),
      paragraph('Dimensions of the product (width x depth) : 595 x 595 x 500'),
    ],
    [
      pageHeader('Serie | 6 dishwasher SCE53M05AU'),
      paragraph('Dimensions'),
      paragraph('- H: 595 mm x W: 595 mm x D: 500 mm'),
    ],
  ]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Bosch', model: 'SCE53M05AU', category: 'dishwasher' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 595,
    'closedEnvelope.heightMm': 595,
    'closedEnvelope.depthMm': 500,
  });
  assert.ok(parsed.claims.every((claim) => claim.page === 2));
  assert.ok(parsed.claims.every((claim) => claim.sourceAxisOrder.join(',') === 'height,width,depth'));
  assert.ok(parsed.claims.every((claim) => claim.sourceLabel === 'Dimensions (H x W x D)'));
});

test('MinerU rejects Bosch grouped values when the label names only width and depth', () => {
  const bytes = Buffer.from(JSON.stringify([[
    pageHeader('Serie | 6 dishwasher SCE53M05AU'),
    paragraph('Dimensions of the product (width x depth) : 595 x 595 x 500'),
  ]]));
  assert.throws(() => parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Bosch', model: 'SCE53M05AU', category: 'dishwasher' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  }), /no exact-model MinerU evidence/i);
});

test('MinerU parses an explicit HxWxD sequence from an exact-model structured index entry', () => {
  const bytes = Buffer.from(JSON.stringify([[
    pageHeader('Series 6 dryer WTG86400AU'),
    {
      type: 'index',
      content: {
        list_type: 'text_list',
        list_items: [
          'Length electrical supply cord: 145.0 cm',
          'Dimensions (HxWxD): 842x598x613 mm',
          'Net weight: 41.5 kg',
        ].map((content) => ({
          item_type: 'text', item_content: [{ type: 'text', content }],
        })),
      },
      bbox: [500, 180, 920, 700],
    },
  ]]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Bosch', model: 'WTG86400AU', category: 'dryer' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 598,
    'closedEnvelope.heightMm': 842,
    'closedEnvelope.depthMm': 613,
  });
  assert.ok(parsed.claims.every((claim) => claim.sourceAxisOrder.join(',') === 'height,width,depth'));
});

test('MinerU receipt replay pins an earlier exact claim fragment without trusting parser preference order', () => {
  const pageTwo = [
    pageHeader('Series 6 dryer WTG86400AU'),
    paragraph('- Dimensions (H x W x D): 84.2 cm x 59.8 cm x 61.3 cm'),
  ];
  const priorBytes = Buffer.from(JSON.stringify([
    [pageHeader('Series 6 dryer WTG86400AU')],
    pageTwo,
  ]));
  const options = {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Bosch', model: 'WTG86400AU', category: 'dryer' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  };
  const prior = parseMineruContentListV2(priorBytes, options);
  assert.ok(prior.claims.every((claim) => claim.page === 2));

  const currentBytes = Buffer.from(JSON.stringify([[
    pageHeader('Series 6 dryer WTG86400AU'),
    {
      type: 'index',
      content: {
        list_type: 'text_list',
        list_items: [{
          item_type: 'text',
          item_content: [{ type: 'text', content: 'Dimensions (HxWxD): 842x598x613 mm' }],
        }],
      },
      bbox: [500, 180, 920, 700],
    },
  ], pageTwo]));
  const preferred = parseMineruContentListV2(currentBytes, options);
  assert.ok(preferred.claims.every((claim) => claim.page === 1));

  const replayed = parseMineruContentListV2(currentBytes, {
    ...options,
    expectedClaims: prior.claims,
  });
  assert.deepEqual(replayed.claims, prior.claims);

  const forged = structuredClone(prior.claims);
  forged[0].fragmentSha256 = 'f'.repeat(64);
  assert.throws(() => parseMineruContentListV2(currentBytes, {
    ...options,
    expectedClaims: forged,
  }), /expected receipt claim.*not rederived/i);
});

test('MinerU receipt replay does not let a pinned fragment bypass conflicting document values', () => {
  const options = {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Bosch', model: 'WTG86400AU', category: 'dryer' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  };
  const priorBytes = Buffer.from(JSON.stringify([[
    pageHeader('Series 6 dryer WTG86400AU'),
    paragraph('- Dimensions (H x W x D): 84.2 cm x 59.8 cm x 61.3 cm'),
  ]]));
  const prior = parseMineruContentListV2(priorBytes, options);
  const conflictingBytes = Buffer.from(JSON.stringify([[
    pageHeader('Series 6 dryer WTG86400AU'),
    paragraph('- Dimensions (H x W x D): 84.2 cm x 59.8 cm x 61.3 cm'),
    paragraph('Dimensions (H x W x D): 842 x 598 x 614 mm'),
  ]]));
  assert.throws(() => parseMineruContentListV2(conflictingBytes, {
    ...options,
    expectedClaims: prior.claims,
  }), /ambiguous MinerU values/i);
});

test('MinerU keeps product dimensions separate from cut-out and packed grouped envelopes', () => {
  const bytes = Buffer.from(JSON.stringify([[
    pageHeader('Series 6 built-in freezer GIN81AC30A'),
    paragraph('- Dimensions (H x W x D): 1772 mm x 558 mm x 545 mm'),
    paragraph('- Cut-out Dimension (H x W x D): 1775 mm x 560 mm x 550 mm'),
    paragraph('- Dimensions of the packed product (H x W x D): 1840 mm x 610 mm x 640 mm'),
  ]]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Bosch', model: 'GIN81AC30A', category: 'fridge' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 558,
    'closedEnvelope.heightMm': 1772,
    'closedEnvelope.depthMm': 545,
  });
  assert.ok(parsed.claims.every((claim) => !/cut-out|packed/i.test(claim.sourceLabel)));
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
    tableFragment('<table><tr><td>Dimensions</td><td>Product Height (H) (mm)</td><td>Product Width (W) (mm)</td><td>Product Depth (D) (mm)</td><td>Product Depth (D2) (Door Open) (mm)</td></tr><tr><td>WBB3700AH/ WH</td><td>1755</td><td>598</td><td>650</td><td>1199</td></tr><tr><td>WBB3400AH/ WH</td><td>1645</td><td>598</td><td>650</td><td>1199</td></tr></table>'),
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

test('MinerU keeps an exact Electrolux total-only table on the generic explicit-axis path', () => {
  const bytes = Buffer.from(JSON.stringify([[
    titleFragment('DIMENSIONS'),
    tableFragment('<table><tr><td>PRODUCT</td><td></td></tr><tr><td>Total height (mm)</td><td>850</td></tr><tr><td>Total width (mm)</td><td>600</td></tr><tr><td>Total depth (mm)</td><td>575</td></tr></table>'),
    pageHeader('EWW7524ADWA'),
  ]]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Electrolux', model: 'EWW7524ADWA', category: 'washing_machine' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });

  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 600,
    'closedEnvelope.heightMm': 850,
    'closedEnvelope.depthMm': 575,
  });
  assert.ok(parsed.claims.every((claim) => claim.grammarProfileId == null));
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

test('MinerU joins an exact axis label and value split into aligned paragraph fragments', () => {
  const bytes = Buffer.from(JSON.stringify([[
    pageHeader('QUICK REFERENCE GUIDE > DD60SDFTX9'),
    paragraph('Height', [354, 82, 388, 100]),
    paragraph('478 mm', [595, 84, 634, 100]),
    paragraph('Width 599 mm', [354, 110, 634, 132]),
    paragraph('Depth 573 mm', [354, 142, 634, 164]),
  ]]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Fisher & Paykel', model: 'DD60SDFTX9', category: 'dishwasher' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 599,
    'closedEnvelope.heightMm': 478,
    'closedEnvelope.depthMm': 573,
  });
});

test('MinerU joins unit-bearing axis labels to vertically aligned scalar values', () => {
  const bytes = Buffer.from(JSON.stringify([[
    paragraph('HDW15G3W', [27, 82, 130, 98]),
    titleFragment('Dimensions', [500, 558, 594, 571]),
    paragraph('Height(mm)', [32, 217, 114, 233]),
    paragraph('850', [34, 239, 78, 258]),
    paragraph('Width(mm)', [32, 286, 109, 301]),
    paragraph('598', [35, 309, 78, 328]),
    paragraph('Depth (mm)', [32, 356, 114, 371]),
    paragraph('598', [35, 378, 78, 397]),
    paragraph('The product dimensions and specifications in this page apply to the specific product and model.', [26, 862, 962, 895]),
  ]]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Haier', model: 'HDW15G3W', category: 'dishwasher' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });

  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 598,
    'closedEnvelope.heightMm': 850,
    'closedEnvelope.depthMm': 598,
  });
  assert.deepEqual(parsed.grammarProfileIds, ['haier-au-exact-spec-vertical-axis-values-v1']);
});

test('Haier vertical axis grammar rejects packaging scope and missing model-specific disclaimer', () => {
  const parse = (heading, disclaimer = null) => parseMineruContentListV2(Buffer.from(JSON.stringify([[
    paragraph('HDW15G3W', [27, 82, 130, 98]),
    titleFragment(heading, [500, 558, 700, 571]),
    paragraph('Height(mm)', [32, 217, 114, 233]), paragraph('850', [34, 239, 78, 258]),
    paragraph('Width(mm)', [32, 286, 109, 301]), paragraph('598', [35, 309, 78, 328]),
    paragraph('Depth (mm)', [32, 356, 114, 371]), paragraph('598', [35, 378, 78, 397]),
    ...(disclaimer ? [paragraph(disclaimer, [26, 862, 962, 895])] : []),
  ]])), {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Haier', model: 'HDW15G3W', category: 'dishwasher' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  const disclaimer = 'The product dimensions and specifications in this page apply to the specific product and model.';

  assert.throws(() => parse('Packaging Dimensions', disclaimer), /no exact-model MinerU evidence/i);
  assert.throws(() => parse('Dimensions'), /no exact-model MinerU evidence/i);
});

test('Haier TFE3 grammar binds listed finish SKUs to one corroborated product envelope', () => {
  const productDimensions = `<table>
    <tr><td></td><td colspan="2">Product dimensions(mm)</td></tr>
    <tr><td>A</td><td>overall height of productwith top panel in placewith top panel removed*</td><td>850 (min) - 870 (max)** 820 (min) - 840 (max)**</td></tr>
    <tr><td>B</td><td>overall width of product</td><td>450</td></tr>
    <tr><td>C</td><td>overall depth of product</td><td>600</td></tr>
    <tr><td>D</td><td>depth of open door (measured from front of kickstrip)</td><td>595</td></tr>
    <tr><td></td><td>Cabinetry dimensions(mm)</td><td></td></tr>
    <tr><td>E</td><td>inside height of cavity</td><td>855 - 875</td></tr>
    <tr><td>F</td><td>inside width of cavity</td><td>455</td></tr>
    <tr><td>G</td><td>inside depth of cavity</td><td>605</td></tr>
  </table>`;
  const technicalData = `<table>
    <tr><td>Width 450 mm</td></tr>
    <tr><td>Depth 600 mm</td></tr>
    <tr><td>Height 850 mm</td></tr>
  </table>`;
  const document = (overrides = {}) => Buffer.from(JSON.stringify([
    [
      titleFragment('TFE3 Series Instructions for Use'),
      paragraph(overrides.cover ?? 'HDW9-TFE3WH HDW9-TFE3SS'),
    ],
    [tableFragment(overrides.productDimensions ?? productDimensions)],
    [titleFragment('Technical data'), tableFragment(overrides.technicalData ?? technicalData)],
  ]));
  const options = (model) => ({
    pdfSha256,
    parserVersion: '3.4.4',
    modelRevision,
    caseIdentity: { brand: 'Haier', model, category: 'dishwasher' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });

  for (const model of ['HDW9TFE3WH', 'HDW9TFE3SS']) {
    const parsed = parseMineruContentListV2(document(), options(model));
    assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
      'closedEnvelope.depthMm': { kind: 'fixed', mm: 600 },
      'closedEnvelope.heightMm': { kind: 'range', minMm: 850, maxMm: 870 },
      'closedEnvelope.widthMm': { kind: 'fixed', mm: 450 },
    });
    assert.deepEqual(parsed.grammarProfileIds, ['haier-au-tfe3-finish-family-product-dimensions-v1']);
    assert.ok(parsed.identitySignals.some((signal) => (
      signal.type === 'mineru_haier_tfe3_explicit_finish_model'
    )));
  }

  assert.throws(
    () => parseMineruContentListV2(document(), options('HDW9TFE3BK')),
    /identity|model|family/i,
  );
  assert.throws(
    () => parseMineruContentListV2(document({
      technicalData: technicalData.replace('Width 450 mm', 'Width 460 mm'),
    }), options('HDW9TFE3WH')),
    /identity|evidence|corroborat|dimension/i,
  );
  assert.throws(
    () => parseMineruContentListV2(document({
      productDimensions: productDimensions.replace('with top panel in place', 'adjustable height'),
    }), options('HDW9TFE3WH')),
    /identity|evidence|height|dimension/i,
  );
});

test('Haier HBM340 technical table binds each listed finish to its own model column', () => {
  const technicalData = `<table>
    <tr><td>Trade mark</td><td colspan="2">Haier</td></tr>
    <tr><td>Model No.</td><td>HBM315WH1HBM315SA1</td><td>HBM340WH1HBM340SA1</td></tr>
    <tr><td>Category of the model</td><td>Refrigerator</td><td>Refrigerator</td></tr>
    <tr><td>Dimension (DxWxH)</td><td>642x595x1600mm</td><td>642x595x1700mm</td></tr>
  </table>`;
  const bytes = Buffer.from(JSON.stringify([[
    titleFragment('TECHNICAL DATA'),
    tableFragment(technicalData),
  ]]));
  const options = (model) => ({
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Haier', model, category: 'fridge' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });

  for (const model of ['HBM340WH1', 'HBM340SA1']) {
    const parsed = parseMineruContentListV2(bytes, options(model));
    assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
      'closedEnvelope.depthMm': 642,
      'closedEnvelope.heightMm': 1700,
      'closedEnvelope.widthMm': 595,
    });
    assert.deepEqual(parsed.grammarProfileIds, ['haier-au-hbm-technical-data-family-v1']);
    assert.ok(parsed.identitySignals.some((signal) => (
      signal.type === 'mineru_haier_hbm_technical_family_model'
    )));
  }

  assert.throws(
    () => parseMineruContentListV2(bytes, options('HBM315WH1')),
    /identity|family|model/i,
  );
  const unknownVariantBytes = Buffer.from(JSON.stringify([[
    titleFragment('TECHNICAL DATA'),
    tableFragment(technicalData.replace(
      'HBM340WH1HBM340SA1',
      'HBM340WH1HBM340SA1HBM340BSA1',
    )),
  ]]));
  assert.throws(
    () => parseMineruContentListV2(unknownVariantBytes, options('HBM340SA1')),
    /identity|family|model/i,
  );
});

test('Haier HBM450 technical list binds only the complete shared family tuple', () => {
  const document = (overrides = {}) => Buffer.from(JSON.stringify([[
    titleFragment('Technical Data'),
    structuredListFragment([
      'Trade mark Haier',
      'HBM450WH1',
      'HBM450SA1',
      overrides.thirdModel ?? 'Model No. HBM450HSA1',
      'Category of the model Refrigerator-freezer',
      overrides.dimension ?? 'Dimension (DxWxH) 676x700x1725mm',
    ], { type: 'index' }),
    tableFragment('<table><tr><td>Model</td><td>Appliance width in mm</td><td>Appliance depth in mm</td></tr><tr><td>HBM450WH1 HBM450SA1 HBM450HSA1</td><td>1100</td><td>1323</td></tr></table>'),
  ]]));
  const options = (model) => ({
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Haier', model, category: 'fridge' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });

  for (const model of ['HBM450WH1', 'HBM450SA1', 'HBM450HSA1']) {
    const parsed = parseMineruContentListV2(document(), options(model));
    assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
      'closedEnvelope.depthMm': 676,
      'closedEnvelope.heightMm': 1725,
      'closedEnvelope.widthMm': 700,
    });
    assert.deepEqual(parsed.grammarProfileIds, ['haier-au-hbm-technical-data-family-v1']);
  }

  assert.throws(
    () => parseMineruContentListV2(document({ thirdModel: 'Model No. HBM450BSA1' }), options('HBM450SA1')),
    /identity|family|model/i,
  );
  assert.throws(
    () => parseMineruContentListV2(document({
      thirdModel: 'Model No. HBM450HSA1 HBM450BSA1',
    }), options('HBM450SA1')),
    /identity|family|model/i,
  );
  assert.throws(
    () => parseMineruContentListV2(document({ dimension: 'Dimension (WxDxH) 676x700x1725mm' }), options('HBM450SA1')),
    /identity|dimension|evidence|axis/i,
  );
});

test('MinerU keeps repeated exact-model page-header scope when a later matrix lists a colour sibling', () => {
  const bytes = Buffer.from(JSON.stringify([
    [
      pageHeader('KTM5402WC'),
      tableFragment('<table><tr><td>Total height (mm)</td><td>1718</td></tr><tr><td>Total width (mm)</td><td>796</td></tr><tr><td>Total depth (mm)</td><td>727</td></tr></table>'),
    ],
    [
      pageHeader('KTM5402WC'),
      tableFragment('<table><tr><td>Model Number</td><td>Product Height</td><td>Product Width</td><td>Product Depth</td></tr><tr><td>KTM5402AC / KTM5402WC</td><td>1718</td><td>796</td><td>727</td></tr></table>'),
      tableFragment('<table><tr><td>Model Number</td><td>Airspace (Side - both)</td><td>Airspace (Top)</td><td>Airspace (Behind)</td></tr><tr><td>KTM5402AC / KTM5402WC</td><td>30</td><td>30</td><td>50</td></tr></table>'),
      paragraph('K_DIM_KTM5402AC_KTM5402WC_Sep21'),
    ],
  ]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Kelvinator', model: 'KTM5402WC', category: 'fridge' },
    claimSemanticsVersion: 2,
    sourceUrls: ['https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=KTM5402WC&brand=Kelvinator'],
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value.mm])), {
    'closedEnvelope.widthMm': 796,
    'closedEnvelope.heightMm': 1718,
    'closedEnvelope.depthMm': 727,
  });
  assert.throws(() => parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Kelvinator', model: 'KTM5402WC', category: 'fridge' },
    claimSemanticsVersion: 2,
    sourceUrls: ['https://resource.electrolux.com.au/Factsheet/RequestPdf'],
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  }), /unresolved family/i);
});

test('MinerU prefers an exact-model dimension matrix over repeated-header scalar duplicates', () => {
  const bytes = Buffer.from(JSON.stringify([
    [
      pageHeader('KTM5402WC'),
      tableFragment('<table><tr><td>Total height (mm)</td><td>1718</td></tr><tr><td>Total width (mm)</td><td>796</td></tr><tr><td>Total depth (mm)</td><td>727</td></tr></table>'),
    ],
    [
      pageHeader('KTM5402WC'),
      paragraph('Dimensions (mm)'),
      tableFragment('<table><tr><td>Model Number</td><td>Product Height</td><td>Product Width</td><td>Product Depth</td></tr><tr><td>KTM5402AC / KTM5402WC</td><td>1718 mm</td><td>796 mm</td><td>727 mm</td></tr></table>'),
      tableFragment('<table><tr><td>Model Number</td><td>Airspace (Side - both)</td><td>Airspace (Top)</td><td>Airspace (Behind)</td></tr><tr><td>KTM5402AC / KTM5402WC</td><td>30</td><td>30</td><td>50</td></tr></table>'),
    ],
  ]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Kelvinator', model: 'KTM5402WC', category: 'fridge' },
    claimSemanticsVersion: 2,
    sourceUrls: ['https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=KTM5402WC&brand=Kelvinator'],
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.ok(parsed.claims.every((claim) => claim.page === 2));
  assert.deepEqual(parsed.claims.map((claim) => claim.sourceLabel).sort(), [
    'Product Depth', 'Product Height', 'Product Width',
  ]);
});

test('MinerU aligned scalar recovery only fills a field missing stronger structured evidence', () => {
  const bytes = Buffer.from(JSON.stringify([
    [
      pageHeader('DD60SDFX9'),
      paragraph('Height', [354, 82, 388, 100]),
      paragraph('410 mm', [595, 84, 634, 100]),
      paragraph('Width 599 mm', [354, 110, 634, 132]),
      paragraph('Depth 573 mm', [354, 142, 634, 164]),
    ],
    [
      pageHeader('DD60SDFX9'),
      tableFragment('<table><tr><td>Height</td><td>410 mm</td></tr></table>'),
    ],
  ]));
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256, parserVersion: '3.4.4', modelRevision,
    caseIdentity: { brand: 'Fisher & Paykel', model: 'DD60SDFX9', category: 'dishwasher' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.equal(parsed.claims.find((claim) => claim.field === 'closedEnvelope.heightMm').page, 2);
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
    [
      {
        type: 'title',
        content: { title_content: [{ type: 'text', content: 'Dimensions' }] },
        bbox: [40, 60, 220, 90],
      },
      {
        type: 'image',
        content: { image_caption: ['Product photograph'], image_footnote: [] },
        bbox: [40, 100, 320, 500],
      },
      structuredListFragment([
        'Width mm 1114', 'Depth mm 630', 'Height mm 847',
      ], { type: 'index', bbox: [400, 120, 700, 260] }),
    ],
  ]));
  assert.deepEqual(findMineruImageOnlyDimensionPages(bytes), [1, 5]);
});

test('Fisher Paykel WA dimension grid requests hybrid parsing when the primary table loses its family caption', () => {
  const bytes = Buffer.from(JSON.stringify([[
    {
      type: 'title',
      content: { title_content: [{ type: 'text', content: 'Product and minimum clearance dimensions' }] },
      bbox: [50, 70, 510, 100],
    },
    {
      type: 'image',
      content: { image_source: { path: 'images/front-view.jpg' }, image_caption: [], image_footnote: [] },
      bbox: [100, 120, 420, 440],
    },
    {
      type: 'table',
      content: {
        html: '<table><tr><td>PRODUCT DIMENSIONS</td><td>MM</td></tr><tr><td>AOverall height of product (to highest point on console)</td><td>1045 - 1075</td></tr><tr><td>BOverall width of product</td><td>600</td></tr><tr><td>©Overall depth of product</td><td>600</td></tr><tr><td>EHeight of product lid open</td><td>1350 - 1385</td></tr><tr><td>Standpipe height</td><td>min. 850 - 1200</td></tr><tr><td>MINIMUM CLEARANCES</td><td>MM</td></tr><tr><td>Minimum cavity width</td><td>640</td></tr></table>',
        table_caption: [], table_footnote: [],
      },
      bbox: [55, 480, 945, 860],
    },
  ]]));

  assert.deepEqual(findMineruImageOnlyDimensionPages(bytes), [1]);
});

test('image fallback detects a dimension grid whose value columns disappeared from the primary parse', () => {
  const bytes = Buffer.from(JSON.stringify([[
    {
      type: 'title',
      content: { title_content: [{ type: 'text', content: 'Dimensions' }] },
      bbox: [100, 500, 240, 540],
    },
    {
      type: 'paragraph',
      content: { paragraph_content: [{ type: 'text', content: 'Net With handle' }] },
      bbox: [150, 545, 240, 575],
    },
    {
      type: 'paragraph',
      content: { paragraph_content: [{ type: 'text', content: 'Box' }] },
      bbox: [180, 595, 240, 620],
    },
    {
      type: 'paragraph',
      content: { paragraph_content: [{ type: 'text', content: 'Weight' }] },
      bbox: [175, 635, 240, 660],
    },
  ]]));
  assert.deepEqual(findMineruImageOnlyDimensionPages(bytes), [1]);
});

test('image fallback detects an installation recess figure whose dimensions remain in the image', () => {
  const bytes = Buffer.from(JSON.stringify([[
    {
      type: 'title',
      content: { title_content: [{ type: 'text', content: 'Installation under Worktop' }] },
      bbox: [100, 100, 360, 140],
    },
    {
      type: 'image',
      content: { image_source: { path: 'images/recess.jpg' }, image_caption: [], image_footnote: [] },
      bbox: [100, 150, 420, 520],
    },
    {
      type: 'paragraph',
      content: { paragraph_content: [{
        type: 'text',
        content: 'The dimensions of the recess should at least agree with the dimensions in the figure.',
      }] },
      bbox: [450, 150, 800, 220],
    },
  ]]));

  assert.deepEqual(findMineruImageOnlyDimensionPages(bytes), [1]);
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

test('official exact-cover binding scopes ASKO product-sheet dimension paragraphs without door or package leakage', () => {
  const bytes = Buffer.from(JSON.stringify([
    [paragraph('W4104C.W.AU')],
    [
      titleFragment('Dimensions'),
      paragraph('Width: 595 mm'),
      paragraph('Height: 850 mm'),
      paragraph('Depth: 700 mm'),
      paragraph('Depth with door open: 1057 mm'),
      titleFragment('Logistic information'),
      paragraph('Packaging width: 640 mm'),
      paragraph('Packaging height: 920 mm'),
      paragraph('Packaging depth: 776 mm'),
    ],
  ]));
  const options = {
    pdfSha256,
    parserVersion: '3.4.4',
    modelRevision,
    caseIdentity: { brand: 'ASKO', model: 'W4104C.W.AU', category: 'washing_machine' },
    claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
    boundExactCoverModel: 'W4104C.W.AU',
  };
  const parsed = parseMineruContentListV2(bytes, options);
  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 700 },
    'closedEnvelope.heightMm': { kind: 'fixed', mm: 850 },
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 595 },
  });
  assert.deepEqual(parsed.grammarProfileIds, ['asko-au-product-sheet-dimension-section-v1']);
});

function esattoEdwTechnicalManual({
  coverModel = 'EDW456S',
  technicalModel = 'EDW456S',
  height = '845mm',
  width = '448mm',
  d1 = '600mm (with the door closed)',
  d2 = '1150mm (with the door opened 90°)',
  extraRows = '',
} = {}) {
  const pages = Array.from({ length: 24 }, () => []);
  pages[0] = [
    titleFragment('Everything you need for your 45cm Compact Freestanding Dishwasher is in this User Manual', [80, 238, 864, 448]),
    pageHeader(`Model/s ${coverModel}`),
    pageHeader('Version V2.1 0523'),
  ];
  pages[23] = [
    titleFragment('Technical Information', [109, 121, 569, 155]),
    titleFragment('DIMENSIONS', [106, 176, 218, 191]),
    {
      type: 'table',
      content: {
        image_source: { path: 'images/6b5efe79afe3b58d10b682165f4ad62725c6cd7ecef74098b3910cd1e39cf30b.jpg' },
        table_caption: [],
        table_footnote: [],
        html: `<table><tr><td rowspan=1 colspan=1>Height (H)</td><td rowspan=1 colspan=1>${height}</td></tr><tr><td rowspan=1 colspan=1>Width (W)</td><td rowspan=1 colspan=1>${width}</td></tr><tr><td rowspan=1 colspan=1>Depth (D1)</td><td rowspan=1 colspan=1>${d1}</td></tr><tr><td rowspan=1 colspan=1>Depth (D2)</td><td rowspan=1 colspan=1>${d2}</td></tr>${extraRows}</table>`,
        table_type: 'complex_table',
        table_nest_level: 1,
      },
      bbox: [122, 501, 537, 577],
    },
    titleFragment('RATING LABEL', [109, 633, 227, 649]),
    paragraph(`45cm Freestanding Dishwasher Model: ${technicalModel}`, [122, 668, 292, 693]),
  ];
  return Buffer.from(JSON.stringify(pages));
}

const esattoEdwOptions = Object.freeze({
  pdfSha256: 'b326268b2ca19065d915e05100dac8ada4e9bbd54a97da0ff671dbb02ffc1c93',
  parserVersion: '3.4.4',
  modelRevision,
  caseIdentity: { brand: 'Esatto', model: 'EDW456S', category: 'dishwasher' },
  claimSemanticsVersion: 2,
  fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  sourceUrls: [
    'https://esatto.house/s/EDW456S_UserManual_V21-0523.pdf',
    'https://static1.squarespace.com/static/example/EDW456S_UserManual_V2.1+0523.pdf',
  ],
});

test('MinerU binds the Esatto EDW technical-information family and keeps D1 closed depth distinct from D2 door-open depth', () => {
  const parsed = parseMineruContentListV2(esattoEdwTechnicalManual(), esattoEdwOptions);

  assert.deepEqual(Object.fromEntries(parsed.claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.depthMm': { kind: 'fixed', mm: 600 },
    'closedEnvelope.heightMm': { kind: 'fixed', mm: 845 },
    'closedEnvelope.widthMm': { kind: 'fixed', mm: 448 },
  });
  assert.deepEqual(parsed.grammarProfileIds, ['esatto-au-dishwasher-technical-information-d1-d2-v1']);
  assert.ok(parsed.identitySignals.some((signal) => (
    signal.type === 'mineru_esatto_edw_technical_information_exact_model'
  )));
  assert.ok(parsed.claims.every((claim) => claim.page === 24));
  assert.ok(parsed.claims.every((claim) => (
    JSON.stringify(claim.bbox) === JSON.stringify([122, 501, 537, 577])
      && claim.fragmentSha256 === 'e1367605f353e447530019f66a022eb79951ead6bc96708ceb5f5e826663c365'
  )));
  assert.ok(parsed.evidenceObservations.every((observation) => (
    observation.fragmentType === 'table'
      && observation.parserProfileId === 'esatto-au-dishwasher-technical-information-d1-d2-v1'
      && observation.sourceUnit === 'mm'
      && JSON.stringify(observation.axisOrder) === JSON.stringify(['height', 'width', 'depth'])
      && observation.quote
  )));
  assert.equal(parsed.evidenceObservations.some((observation) => (
    /1150|door opened/i.test(observation.quote)
  )), false);
});

test('Esatto EDW technical-information grammar fails closed across identity, qualifier, unit, conflict, and category mutations', () => {
  const cases = [
    ['sibling technical-page model', esattoEdwTechnicalManual({ technicalModel: 'EDW456S2' }), esattoEdwOptions],
    ['sibling cover model', esattoEdwTechnicalManual({ coverModel: 'EDW456S2' }), esattoEdwOptions],
    ['D1 has no closed qualifier', esattoEdwTechnicalManual({ d1: '600mm' }), esattoEdwOptions],
    ['D2 has no open qualifier', esattoEdwTechnicalManual({ d2: '1150mm' }), esattoEdwOptions],
    ['D1 and D2 meanings are swapped', esattoEdwTechnicalManual({
      d1: '600mm (with the door opened 90°)',
      d2: '1150mm (with the door closed)',
    }), esattoEdwOptions],
    ['conflicting second closed depth', esattoEdwTechnicalManual({
      extraRows: '<tr><td rowspan=1 colspan=1>Depth (D1)</td><td rowspan=1 colspan=1>620mm (with the door closed)</td></tr>',
    }), esattoEdwOptions],
    ['missing measurement units', esattoEdwTechnicalManual({ height: '845', width: '448' }), esattoEdwOptions],
    ['wrong brand', esattoEdwTechnicalManual(), {
      ...esattoEdwOptions,
      caseIdentity: { ...esattoEdwOptions.caseIdentity, brand: 'Other' },
    }],
    ['wrong category', esattoEdwTechnicalManual(), {
      ...esattoEdwOptions,
      caseIdentity: { ...esattoEdwOptions.caseIdentity, category: 'fridge' },
    }],
    ['source URL lacks exact model', esattoEdwTechnicalManual(), {
      ...esattoEdwOptions,
      sourceUrls: ['https://esatto.house/s/user-manual.pdf'],
    }],
  ];

  for (const [label, bytes, options] of cases) {
    assert.throws(
      () => parseMineruContentListV2(bytes, options),
      /identity|exact-model|evidence|missing|ambiguous|scope/i,
      label,
    );
  }

  const malformed = JSON.parse(esattoEdwTechnicalManual());
  malformed[23][2].bbox = [122, 501, 122, 577];
  assert.throws(() => parseMineruContentListV2(
    Buffer.from(JSON.stringify(malformed)), esattoEdwOptions,
  ), /bbox invalid/i);
});
