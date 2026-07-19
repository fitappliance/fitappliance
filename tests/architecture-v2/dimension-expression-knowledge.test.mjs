import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildDimensionExpressionKnowledge,
  extractDimensionExpressions,
  renderDimensionExpressionKnowledgeMarkdown,
} from '../../src/domain/dimension-expression-knowledge.mjs';
import { loadMineruDocuments } from '../../scripts/architecture-v2/build-dimension-expression-knowledge.mjs';

const bbox = [50, 100, 900, 500];

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function table(html) {
  return {
    type: 'table',
    content: { html, table_caption: [], table_footnote: [] },
    bbox,
  };
}

function paragraph(content) {
  return {
    type: 'paragraph',
    content: { paragraph_content: [{ type: 'text', content }] },
    bbox,
  };
}

function textBlock(type, content, blockBbox = bbox) {
  return {
    type,
    content: { [`${type}_content`]: [{ type: 'text', content }] },
    bbox: blockBbox,
  };
}

function structuredList(type, entries, blockBbox) {
  return {
    type,
    content: {
      list_type: 'text_list',
      list_items: entries.map((content) => ({
        item_type: 'text',
        item_content: [{ type: 'text', content }],
      })),
    },
    bbox: blockBbox,
  };
}

test('dimension research classifies grouped, scoped, labelled, and ambiguous diagram expressions', () => {
  const contentList = [[
    paragraph('LG Series 5 WD1275A1'),
    table('<table><tr><td>Unit(W x D x H)</td><td>600mm x 535mm x 850mm</td></tr><tr><td>Dimensions (Packaged) (W x D x H)</td><td>660mm x 580mm x 890mm</td></tr></table>'),
    paragraph('Dimension(mm)'),
    table('<table><tr><td>W</td><td>600</td><td>D</td><td>475</td><td>D&quot;</td><td>1015</td></tr><tr><td>H</td><td>850</td><td>D&#x27;</td><td>535</td><td></td><td></td></tr></table>'),
    table('<table><tr><td>Total width (mm)</td><td>600</td></tr><tr><td>Total height (mm)</td><td>850</td></tr><tr><td>Total depth (mm)</td><td>535</td></tr></table>'),
    table('<table><tr><td>Product dimensions</td></tr><tr><td>Height 850 - 895 mm</td></tr><tr><td>Width 597 mm</td></tr><tr><td>Depth 599 mm</td></tr></table>'),
    table('<table><tr><td>Total height (mm)</td><td>1718</td></tr><tr><td>Cabinet height (mm)</td><td>1705</td></tr><tr><td>Total width (mm)</td><td>796</td></tr><tr><td>Cabinet width (mm)</td><td>790</td></tr><tr><td>Total depth (mm)</td><td>727</td></tr><tr><td>Cabinet depth (mm)</td><td>641</td></tr></table>'),
  ]];

  const result = extractDimensionExpressions({
    pdfSha256: 'a'.repeat(64),
    contentSha256: 'b'.repeat(64),
    contentList,
    sourceUrls: ['https://www.lg.com/au/example.pdf'],
    identities: [{ brand: 'LG', model: 'WD1275A1', category: 'washing_machine' }],
  });

  assert.equal(result.seriesEvidence[0].seriesName, 'Series 5');
  assert.ok(result.observations.some((row) => (
    row.patternKind === 'GROUPED_AXIS_SEQUENCE'
      && row.axisOrder.join(',') === 'width,depth,height'
      && row.parserDecision === 'SUPPORTED_EXPLICIT_GROUPED'
      && row.modelBinding === 'SAME_PAGE_EXACT_MODEL'
  )));
  assert.ok(result.observations.some((row) => (
    row.scope === 'delivery_package' && row.parserDecision === 'REJECTED_NON_PRODUCT_SCOPE'
  )));
  assert.ok(result.observations.some((row) => (
    row.patternKind === 'ALTERNATING_AXIS_VALUE_CELLS'
      && row.parserDecision === 'SUPPORTED_PARTIAL_REJECT_AMBIGUOUS_DEPTH'
      && row.safeAxes.join(',') === 'width,height'
  )));
  assert.ok(result.observations.some((row) => (
    row.patternKind === 'INDIVIDUALLY_LABELLED_AXES'
      && row.parserDecision === 'SUPPORTED_EXPLICIT_LABELS'
  )));
  assert.ok(result.observations.some((row) => (
    row.patternKind === 'INDIVIDUALLY_LABELLED_AXES'
      && row.parserDecision === 'SUPPORTED_ADJUSTABLE_HEIGHT_RANGE'
      && row.safeAxes.join(',') === 'height,width,depth'
  )));
  assert.ok(result.observations.some((row) => (
    row.patternKind === 'INDIVIDUALLY_LABELLED_AXES'
      && row.scope === 'product_body'
      && row.parserDecision === 'REJECTED_NON_PRODUCT_SCOPE'
  )));
  assert.ok(result.observations.every((row) => !(
    /packaged/i.test(row.sourceLabel) && row.parserDecision === 'SUPPORTED_EXPLICIT_GROUPED'
  )));
  assert.ok(result.observations.every((row) => row.fragmentSha256.length === 64));
});

test('dimension research rejects generic D/D-prime semantics even beside a diagram', () => {
  const diagram = {
    type: 'image',
    content: {
      image_source: { path: 'images/dimension-side-view.jpg' },
      image_caption: [], image_footnote: [],
    },
    bbox: [200, 230, 800, 520],
  };
  const contentList = [[
    paragraph('LG DVH1-08WP'),
    paragraph('Dimension(mm)'),
    diagram,
    table('<table><tr><td>W</td><td>600</td><td>D</td><td>660</td><td>D&quot;</td><td>1115</td></tr><tr><td>H</td><td>850</td><td>D&#x27;</td><td>614</td><td></td><td></td></tr></table>'),
    table('<table><tr><td>DIMENSIONS</td><td></td></tr><tr><td>Height</td><td>1792mm</td></tr><tr><td>Width</td><td>914mm</td></tr><tr><td>Depth</td><td></td></tr><tr><td>Without Door</td><td>685mm</td></tr><tr><td>Without Handle</td><td>729mm</td></tr><tr><td>With Door &amp; Handle</td><td>729mm</td></tr></table>'),
  ]];

  const result = extractDimensionExpressions({
    pdfSha256: 'a'.repeat(64),
    contentSha256: 'b'.repeat(64),
    contentList,
    sourceUrls: ['https://www.lg.com/au/example.pdf'],
    identities: [{ brand: 'LG', model: 'DVH1-08WP', category: 'dryer' }],
  });

  const diagramPrimary = result.observations.find((row) => (
    row.patternKind === 'ALTERNATING_AXIS_VALUE_CELLS'
      && row.parserDecision === 'SUPPORTED_PARTIAL_REJECT_AMBIGUOUS_DEPTH'
  ));
  assert.deepEqual(diagramPrimary.safeAxes, ['width', 'height']);
  assert.deepEqual(diagramPrimary.depthVariants, ['D"', "D'"]);

  const hierarchy = result.observations.find((row) => (
    row.patternKind === 'HIERARCHICAL_DEPTH_VARIANTS'
  ));
  assert.equal(hierarchy.parserDecision, 'SUPPORTED_EXPLICIT_HANDLE_INCLUSIVE_DEPTH');
  assert.deepEqual(hierarchy.safeAxes, ['depth']);
  assert.equal(hierarchy.axisValues[0].value, '729mm');
});

test('dimension research records model matrices and image-only diagram gaps without inventing model bindings', () => {
  const contentList = [[
    paragraph('Westinghouse WHE6874BA'),
    paragraph('All measurements are in millimetres (mm).'),
    table('<table><tr><td>Dimensions</td><td>Product Height (H)</td><td>Product Width (W)</td><td>Product Depth (D)</td><td>Product Depth (D2) (Door Open)</td></tr><tr><td>WHE6874BA</td><td>1782</td><td>913</td><td>803</td><td>1505</td></tr><tr><td>WTB3700AH/ WH</td><td>1755</td><td>598</td><td>650</td><td>1199</td></tr></table>'),
    table('<table><tr><td>Dimensions</td><td>Product Height (H)</td><td>Product Width (W)</td><td>Product Depth (D)</td><td>Product Depth (D2)</td></tr><tr><td>WHE6874BA</td><td>1782</td><td>913</td><td>803</td><td>1505</td></tr></table>'),
  ], [
    paragraph('Measurements in mm'),
    { type: 'image', content: { image_caption: ['Installation dimensions'], image_footnote: [] }, bbox },
  ], [
    paragraph('Product dimensions are shown as W, H and D in the following diagram.'),
    { type: 'image', content: { image_caption: ['Front and side view'], image_footnote: [] }, bbox },
  ], [
    table('<table><tr><td>Dimensions (H x W x D)</td><td>1782 mm x 913 mm x 803 mm</td></tr></table>'),
  ]];
  const result = extractDimensionExpressions({
    pdfSha256: '7'.repeat(64),
    contentSha256: '8'.repeat(64),
    contentList,
    identities: [{ brand: 'Westinghouse', model: 'WHE6874BA', category: 'fridge' }],
  });
  const exact = result.observations.find((row) => (
    row.patternKind === 'MODEL_ROW_DIMENSION_MATRIX' && row.modelExpression === 'WHE6874BA'
  ));
  assert.equal(exact.parserDecision, 'SUPPORTED_EXACT_MODEL_ROW_MATRIX');
  assert.deepEqual(exact.safeAxes, ['height', 'width', 'depth']);
  const shorthand = result.observations.find((row) => row.modelExpression === 'WTB3700AH/ WH');
  assert.equal(shorthand.parserDecision, 'RESEARCH_MODEL_ROW_BINDING_REQUIRED');
  assert.deepEqual(shorthand.safeAxes, []);
  const duplicateDepth = result.observations.find((row) => (
    row.modelExpression === 'WHE6874BA'
      && row.depthVariants.includes('Product Depth (D2)')
  ));
  assert.equal(duplicateDepth.parserDecision, 'SUPPORTED_PARTIAL_REJECT_AMBIGUOUS_AXIS_COLUMNS');
  assert.deepEqual(duplicateDepth.safeAxes, ['height', 'width']);
  assert.equal(result.researchGaps.find((row) => row.page === 2).gapType, 'IMAGE_ONLY_DIMENSION_DIAGRAM');
  assert.equal(result.researchGaps.find((row) => row.page === 3).gapType, 'UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION');
  const documentBound = result.observations.find((row) => row.page === 4);
  assert.equal(documentBound.modelBinding, 'SAME_DOCUMENT_EXACT_MODEL');
  assert.equal(documentBound.parserDecision, 'SUPPORTED_EXPLICIT_GROUPED');
});

test('dimension research records a later column matrix without treating document identity as row identity', () => {
  const result = extractDimensionExpressions({
    pdfSha256: '3'.repeat(64),
    contentSha256: '4'.repeat(64),
    sourceUrls: ['https://assets.kogan.com/files/usermanuals/KAMFREN522A_UG.pdf'],
    identities: [{ brand: 'Kogan', model: 'KAMFREN522A', category: 'fridge' }],
    contentList: [[{
      type: 'page_footer',
      content: { page_footer_content: [{ type: 'text', content: 'KAMFREN522A' }] },
      bbox,
    }], [
      table('<table><tr><td>Width</td><td>Overall Height</td><td>Depth</td><td>Depth OnlyCabinet</td><td>Depth doorsopen 135°</td><td>Width doorsopen 135°</td></tr><tr><td>A</td><td>B</td><td>C</td><td>C1</td><td>D</td><td>E</td></tr><tr><td>750mm</td><td>1692mm</td><td>785mm</td><td>705mm</td><td>1038mm</td><td>1277mm</td></tr></table>'),
    ]],
  });

  const matrix = result.observations.find((row) => (
    row.patternKind === 'DOCUMENT_SCOPED_DIMENSION_MATRIX'
  ));
  assert.ok(matrix);
  assert.equal(matrix.modelBinding, 'SAME_DOCUMENT_EXACT_MODEL');
  assert.equal(matrix.syntaxDecision, 'SUPPORTED_EXPLICIT_COLUMN_MATRIX');
  assert.equal(matrix.parserDecision, 'RESEARCH_DOCUMENT_UNIQUE_SCOPE_REQUIRED');
  assert.deepEqual(matrix.axisOrder, ['width', 'height', 'depth']);
  assert.deepEqual(matrix.safeAxes, []);
  assert.match(matrix.sourceQuote, /Width 750mm/);
  assert.doesNotMatch(matrix.sourceQuote, /cabinet|doors?open/i);
});

test('dimension syntax remains research-only when the PDF never states the mapped exact model', () => {
  const result = extractDimensionExpressions({
    pdfSha256: '5'.repeat(64),
    contentSha256: '6'.repeat(64),
    contentList: [[
      paragraph('Family installation guide'),
      table('<table><tr><td>Dimensions (H x W x D)</td><td>850 mm x 600 mm x 600 mm</td></tr></table>'),
    ]],
    identities: [{ brand: 'Example', model: 'EXACT100', category: 'dryer' }],
  });
  assert.equal(result.observations[0].modelBinding, 'DOCUMENT_IDENTITY_ONLY');
  assert.equal(result.observations[0].parserDecision, 'RESEARCH_MODEL_SCOPE_REQUIRED');
  assert.deepEqual(result.observations[0].safeAxes, []);
});

test('long text keeps explicit grouped axis order while isolating qualified depth variants', () => {
  const result = extractDimensionExpressions({
    pdfSha256: 'a'.repeat(64),
    contentSha256: 'c'.repeat(64),
    contentList: [[
      paragraph('Series 6 WGG254Z1AU - Dimensions (H x W x D): 84.5 cm x 59.8 cm x 59.0 cm (63.6 cm including door handle)'),
      paragraph('Net dimensions(W x H x D) (mm) 595x 845x 595'),
    ]],
    identities: [{ brand: 'Bosch', model: 'WGG254Z1AU', category: 'washing_machine' }],
  });
  const qualified = result.observations.find((row) => (
    row.patternKind === 'GROUPED_AXIS_SEQUENCE_WITH_VARIANT'
  ));
  assert.equal(qualified.parserDecision, 'SUPPORTED_EXPLICIT_GROUPED_WITH_INCLUDED_HANDLE_DEPTH');
  assert.deepEqual(qualified.axisOrder, ['height', 'width', 'depth']);
  assert.deepEqual(qualified.safeAxes, ['height', 'width', 'depth']);
  assert.match(qualified.depthVariants[0], /including door handle/i);
  assert.equal(qualified.axisValues.find((value) => value.axis === 'depth').value, '59 cm');
  assert.equal(qualified.axisValues.find((value) => value.axis === 'depth').overallValue, '63.6 cm');
  const net = result.observations.find((row) => /Net dimensions/i.test(row.sourceLabel));
  assert.equal(net.parserDecision, 'SUPPORTED_EXPLICIT_GROUPED');
  assert.deepEqual(net.axisOrder, ['width', 'height', 'depth']);
});

test('dimension knowledge recognizes QRG inline axes, continued rows, suffix axes, and net sections', () => {
  const result = extractDimensionExpressions({
    pdfSha256: '1'.repeat(64),
    contentSha256: '2'.repeat(64),
    sourceUrls: ['https://manufacturer.example/EX100.pdf'],
    identities: [{ brand: 'Example', model: 'EX100', category: 'dishwasher' }],
    contentList: [[
      paragraph('EX100 Height 820 - 880 mm Width 599 mm Depth 573 mm'),
      table('<table><tr><td>Dimensions (Net) (W X H X D)</td><td></td></tr><tr><td></td><td>550 x 1456 x 562 mm</td></tr></table>'),
      paragraph('Dimensions 598mmW x 818mmH x 570mmD'),
      table(`<table>
        <tr><td>Dimensions</td><td></td><td>mm</td></tr>
        <tr><td>Net</td><td>Height Width</td><td>845 mm 595</td></tr>
        <tr><td></td><td>Depth mm</td><td>590</td></tr>
        <tr><td>Shrink Film Package</td><td></td><td>mm 885</td></tr>
        <tr><td>Width</td><td>mm</td><td>648</td></tr>
      </table>`),
    ]],
  });

  const inline = result.observations.find((row) => row.patternKind === 'INLINE_LABELLED_AXES');
  assert.deepEqual(inline.safeAxes, ['height', 'width', 'depth']);
  assert.equal(inline.parserDecision, 'SUPPORTED_ADJUSTABLE_HEIGHT_RANGE');
  const continued = result.observations.find((row) => /Dimensions \(Net\)/i.test(row.sourceLabel));
  assert.deepEqual(continued.safeAxes, ['width', 'height', 'depth']);
  const suffixed = result.observations.find((row) => row.patternKind === 'SUFFIXED_VALUE_AXIS_SEQUENCE');
  assert.deepEqual(suffixed.axisOrder, ['width', 'height', 'depth']);
  const net = result.observations.find((row) => row.patternKind === 'NET_DIMENSION_SECTION');
  assert.deepEqual(net.safeAxes, ['height', 'width', 'depth']);
  assert.doesNotMatch(net.sourceQuote, /package/i);
});

test('knowledge records actual parser replay per PDF and model instead of inferring readiness from syntax', () => {
  const contentList = [[
    paragraph('QUICK REFERENCE GUIDE > DD60D4NX9'),
    paragraph('Height 820 - 880 mm Width 599 mm Depth 573 mm'),
  ]];
  const knowledge = buildDimensionExpressionKnowledge({
    generatedAt: '2026-07-14T00:00:00.000Z',
    historicalRecords: [{ category: 'dishwasher', brand: 'Fisher & Paykel', model: 'DD60D4NX9' }],
    documents: [{
      pdfSha256: '3'.repeat(64), contentSha256: '4'.repeat(64),
      parserVersion: '3.4.4', modelRevision: 'ed6b654c018d742e65a17671e379c5e6ecc87ec9',
      sourceUrls: ['https://www.fisherpaykel.com/QRG-AU-DD60D4NX9.pdf'],
      identities: [{ category: 'dishwasher', brand: 'Fisher & Paykel', model: 'DD60D4NX9' }],
      contentList,
    }],
  });
  const family = knowledge.categories[1].brands[0].families[0];
  assert.deepEqual(family.parserReplays, [{
    pdfSha256: '3'.repeat(64),
    category: 'dishwasher',
    brand: 'Fisher & Paykel',
    model: 'DD60D4NX9',
    extractionState: 'ALL_AXIS_RANGE',
    identityScope: 'EXACT_MODEL',
    claimFields: ['closedEnvelope.depthMm', 'closedEnvelope.heightMm', 'closedEnvelope.widthMm'],
    grammarProfileIds: [],
    reasonCode: 'PARSED_COMPLETE',
  }]);
});

test('knowledge groups strict Beko spec variants under one declared grammar family', () => {
  const labels = [
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
  ];
  const values = [
    '850 mm', '865 mm', '598 mm', '600 mm', '1150 mm',
    '42.9 kg', '889 mm', '644 mm', '661 mm', '45.9 kg',
  ];
  const inlineExpression = [
    'Unpackaged Height: 850 mm',
    'Height (max - feet adjustment): 865 mm',
    'Unpackaged Width: 598 mm',
    'Unpackaged Depth: 600 mm',
    'Depth with Door Opened: 1150 mm',
    'Unpackaged Weight: 42.9 kg',
    'Packaged Height: 889 mm',
    'Packaged Width: 644 mm',
    'Packaged Depth: 661 mm',
    'Packaged Weight: 45.9 kg',
  ].join(' ');
  const documents = [
    {
      pdfSha256: '5'.repeat(64), contentSha256: '6'.repeat(64),
      parserVersion: '3.4.4', modelRevision: 'ed6b654c018d742e65a17671e379c5e6ecc87ec9',
      sourceUrls: ['https://www.beko.com/content/dam/bekoglobal/au/en/pdf/product/7610769077.pdf'],
      identities: [{ category: 'dishwasher', brand: 'Beko', model: 'BDF1620X' }],
      contentList: [[
        textBlock('page_header', 'Beko BDF1620X Product Specification'),
        textBlock('title', 'Dimensions & Weights', [30, 300, 240, 340]),
        textBlock('paragraph', inlineExpression, [30, 350, 700, 600]),
      ]],
    },
    {
      pdfSha256: '7'.repeat(64), contentSha256: '8'.repeat(64),
      parserVersion: '3.4.4', modelRevision: 'ed6b654c018d742e65a17671e379c5e6ecc87ec9',
      sourceUrls: ['https://www.beko.com/content/dam/bekoglobal/au/en/pdf/product/7679159077.pdf'],
      identities: [{ category: 'dishwasher', brand: 'Beko', model: 'BDF1640AX' }],
      contentList: [[
        textBlock('page_header', 'Beko BDF1640AX Product Specification'),
        structuredList('list', labels, [30, 300, 250, 850]),
        structuredList('index', values, [300, 330, 390, 850]),
      ]],
    },
  ];
  const knowledge = buildDimensionExpressionKnowledge({
    generatedAt: '2026-07-14T00:00:00.000Z',
    historicalRecords: [
      { category: 'dishwasher', brand: 'Beko', model: 'BDF1620X' },
      { category: 'dishwasher', brand: 'Beko', model: 'BDF1640AX' },
    ],
    documents,
  });
  const brand = knowledge.categories.find((row) => row.category === 'dishwasher').brands[0];

  assert.equal(brand.families.length, 1);
  assert.equal(brand.completeParserReplayCount, 1);
  assert.equal(brand.families[0].groupType, 'parser_family');
  assert.equal(brand.families[0].groupName, 'Beko AU dishwasher product specification');
  assert.deepEqual(brand.families[0].models, ['BDF1620X', 'BDF1640AX']);
  assert.deepEqual(brand.families[0].parserProfileIds, [
    'beko_au_dishwasher_product_spec_inline_pairs_v1',
    'beko_au_dishwasher_product_spec_parallel_lists_v1',
  ]);
  assert.equal(brand.families[0].completeParserReplay, true);
  assert.match(brand.families[0].expressionCoverageStatus, /^PARSER_REPLAY_COMPLETE/);
  assert.ok(brand.families[0].parserReplays.every((replay) => (
    replay.extractionState === 'ALL_AXIS_RANGE' && replay.identityScope === 'EXACT_MODEL'
  )));

  const markdown = renderDimensionExpressionKnowledgeMarkdown(knowledge);
  assert.match(markdown, /Parallel label and value lists/);
  assert.match(markdown, /Inline labelled pairs/);
  assert.match(markdown, /packaged values are excluded/i);
  assert.match(markdown, /complete exact-model parser replays: 1/i);
});

test('knowledge documents the strict Smeg W-D-H adjustable-height grammar', () => {
  const knowledge = buildDimensionExpressionKnowledge({
    generatedAt: '2026-07-17T00:00:00.000Z',
    historicalRecords: [
      { category: 'dishwasher', brand: 'Smeg', model: 'DWAI6314X' },
    ],
    documents: [{
      pdfSha256: '9'.repeat(64), contentSha256: '8'.repeat(64),
      parserVersion: '3.4.4', modelRevision: 'ed6b654c018d742e65a17671e379c5e6ecc87ec9',
      sourceUrls: ['https://sys.smeg.com.au/Product/Techspecs/DWAI6314X.pdf'],
      identities: [{ category: 'dishwasher', brand: 'Smeg', model: 'DWAI6314X' }],
      contentList: [[
        textBlock('title', 'DWAI6314X SMEG SEMI-INTEGRATED DISHWASHER'),
        paragraph('Size 598mmW x 570mmD x 818–868mmH max'),
      ]],
    }],
  });
  const family = knowledge.categories.find((row) => row.category === 'dishwasher')
    .brands[0].families[0];

  assert.equal(family.groupType, 'parser_family');
  assert.equal(family.groupName, 'Smeg Australia dishwasher technical specification');
  assert.deepEqual(family.parserProfileIds, [
    'smeg-au-dishwasher-size-wdh-suffix-range-v1',
  ]);
  assert.equal(family.completeParserReplay, true);
  const markdown = renderDimensionExpressionKnowledgeMarkdown(knowledge);
  assert.match(markdown, /W\/D\/H order/);
  assert.match(markdown, /adjustable height range is preserved/i);
  assert.match(markdown, /Packaging, installation, cavity/i);
});

test('knowledge documents the strict Smeg two-cell fixed W-H-D grammar', () => {
  const knowledge = buildDimensionExpressionKnowledge({
    generatedAt: '2026-07-17T00:00:00.000Z',
    historicalRecords: [
      { category: 'dishwasher', brand: 'Smeg', model: 'DWA314W' },
    ],
    documents: [{
      pdfSha256: '7'.repeat(64), contentSha256: '6'.repeat(64),
      parserVersion: '3.4.4', modelRevision: 'ed6b654c018d742e65a17671e379c5e6ecc87ec9',
      sourceUrls: ['https://sys.smeg.com.au/Product/Techspecs/DWA314W.pdf'],
      identities: [{ category: 'dishwasher', brand: 'Smeg', model: 'DWA314W' }],
      contentList: [[
        textBlock('title', 'DWA314W smeg freestanding/built-in dishwasher'),
        table('<table><tr><td>size</td><td>598mmW × 850mmH x 595mmD</td></tr><tr><td>capacity</td><td>14 place settings</td></tr></table>'),
      ]],
    }],
  });
  const family = knowledge.categories.find((row) => row.category === 'dishwasher')
    .brands[0].families[0];

  assert.equal(family.groupType, 'parser_family');
  assert.equal(family.groupName, 'Smeg Australia dishwasher technical specification');
  assert.deepEqual(family.parserProfileIds, [
    'smeg-au-dishwasher-size-whd-suffix-fixed-v1',
  ]);
  assert.equal(family.completeParserReplay, true);
  const markdown = renderDimensionExpressionKnowledgeMarkdown(knowledge);
  assert.match(markdown, /two-cell Size row/i);
  assert.match(markdown, /W\/H\/D order/i);
  assert.match(markdown, /multiple matching Size rows/i);
});

test('knowledge documents strict Smeg fixed suffix axis permutations', () => {
  const documents = [
    ['DWA6314B', 'Size 598mmW x 600mmD x 850mmH'],
    ['DWA4510X', 'dimensions 850mmH x 448mmW x 600mmD'],
  ].map(([model, expression], index) => ({
    pdfSha256: String(index + 1).repeat(64),
    contentSha256: String(index + 3).repeat(64),
    parserVersion: '3.4.4',
    modelRevision: 'ed6b654c018d742e65a17671e379c5e6ecc87ec9',
    sourceUrls: [`https://sys.smeg.com.au/Product/Techspecs/${model}.pdf`],
    identities: [{ category: 'dishwasher', brand: 'Smeg', model }],
    contentList: [[
      textBlock('title', `${model} SMEG DISHWASHER`),
      paragraph(expression),
    ]],
  }));
  const knowledge = buildDimensionExpressionKnowledge({
    generatedAt: '2026-07-17T00:00:00.000Z',
    historicalRecords: documents.flatMap((document) => document.identities),
    documents,
  });
  const family = knowledge.categories.find((row) => row.category === 'dishwasher')
    .brands[0].families[0];

  assert.equal(family.groupName, 'Smeg Australia dishwasher technical specification');
  assert.deepEqual(family.models, ['DWA4510X', 'DWA6314B']);
  assert.deepEqual(family.parserProfileIds, [
    'smeg-au-dishwasher-fixed-axis-suffix-permutation-v1',
  ]);
  assert.equal(family.completeParserReplay, true);
  const markdown = renderDimensionExpressionKnowledgeMarkdown(knowledge);
  assert.match(markdown, /explicit W\/D\/H or H\/W\/D suffix order/i);
  assert.match(markdown, /parentheses, qualifiers and trailing text are excluded/i);
});

test('knowledge documents the strict Smeg parenthetical maximum height grammar', () => {
  const knowledge = buildDimensionExpressionKnowledge({
    generatedAt: '2026-07-17T00:00:00.000Z',
    historicalRecords: [
      { category: 'dishwasher', brand: 'Smeg', model: 'DWAI315XT' },
    ],
    documents: [{
      pdfSha256: '4'.repeat(64), contentSha256: '5'.repeat(64),
      parserVersion: '3.4.4', modelRevision: 'ed6b654c018d742e65a17671e379c5e6ecc87ec9',
      sourceUrls: ['https://sys.smeg.com.au/Product/Techspecs/DWAI315XT.pdf'],
      identities: [{ category: 'dishwasher', brand: 'Smeg', model: 'DWAI315XT' }],
      contentList: [[
        textBlock('title', 'DWAI315XT SMEG SEMI-INTEGRATED DISHWASHER, TALL TANK'),
        paragraph('size 598mmW x 858mmH (928mmH max) x 570mmD'),
      ]],
    }],
  });
  const family = knowledge.categories.find((row) => row.category === 'dishwasher')
    .brands[0].families[0];

  assert.deepEqual(family.parserProfileIds, [
    'smeg-au-dishwasher-size-whd-parenthetical-height-max-v1',
  ]);
  assert.equal(family.completeParserReplay, true);
  const markdown = renderDimensionExpressionKnowledgeMarkdown(knowledge);
  assert.match(markdown, /repeated H suffix and a parenthetical explicit maximum/i);
  assert.match(markdown, /complete increasing height range is preserved/i);
});

test('lettered explicit axes are distinct from unlabelled dimension triples', () => {
  const result = extractDimensionExpressions({
    pdfSha256: 'd'.repeat(64),
    contentSha256: 'e'.repeat(64),
    contentList: [[
      paragraph('WW11CG60ADLE Dimensions A (Width) 600 mm B (Height) 850 mm C (Depth) 600 mm'),
      paragraph('Dimensions of the product: .845x598x590 mm'),
    ]],
    identities: [{ brand: 'Samsung', model: 'WW11CG60ADLE', category: 'washing_machine' }],
  });
  const lettered = result.observations.find((row) => row.patternKind === 'LETTERED_EXPLICIT_AXIS_LIST');
  assert.equal(lettered.parserDecision, 'SUPPORTED_EXPLICIT_LETTERED_AXES');
  assert.deepEqual(lettered.axisOrder, ['width', 'height', 'depth']);
  assert.deepEqual(lettered.safeAxes, ['width', 'height', 'depth']);
  const unlabelled = result.observations.find((row) => row.patternKind === 'UNLABELLED_DIMENSION_TRIPLE');
  assert.equal(unlabelled.parserDecision, 'RESEARCH_UNLABELLED_AXIS_ORDER');
  assert.deepEqual(unlabelled.axisOrder, []);
  assert.deepEqual(unlabelled.safeAxes, []);
});

test('knowledge records Bosch inline value-labelled axes while leaving malformed grouped labels unsupported', () => {
  const result = extractDimensionExpressions({
    pdfSha256: '1'.repeat(64),
    contentSha256: '2'.repeat(64),
    contentList: [[
      paragraph('Serie | 6 dishwasher SCE53M05AU'),
      paragraph('Dimensions of the product (width x depth) : 595 x 595 x 500'),
      paragraph('- H: 595 mm x W: 595 mm x D: 500 mm'),
    ]],
    identities: [{ brand: 'Bosch', model: 'SCE53M05AU', category: 'dishwasher' }],
  });
  const inline = result.observations.find((row) => (
    row.patternKind === 'INLINE_VALUE_LABELLED_AXIS_SEQUENCE'
  ));
  assert.equal(inline.parserDecision, 'SUPPORTED_EXPLICIT_INLINE_AXIS_SEQUENCE');
  assert.deepEqual(inline.axisOrder, ['height', 'width', 'depth']);
  assert.deepEqual(inline.safeAxes, ['height', 'width', 'depth']);
  assert.equal(inline.unit, 'mm');
  assert.equal(inline.unitPlacement, 'per_value');
  assert.equal(inline.modelBinding, 'SAME_PAGE_EXACT_MODEL');
  assert.doesNotMatch(inline.sourceQuote, /width x depth/i);
  assert.ok(!result.observations.some((row) => (
    /width x depth/i.test(row.sourceQuote)
      && /^SUPPORTED_/.test(row.parserDecision)
  )));
});

test('knowledge preserves grouped envelope qualifiers before classifying product, cut-out, and package dimensions', () => {
  const result = extractDimensionExpressions({
    pdfSha256: '3'.repeat(64),
    contentSha256: '4'.repeat(64),
    contentList: [[
      paragraph('Example EX100'),
      paragraph('Product Dimensions (H x W x D): 850 x 600 x 600 mm'),
      paragraph('Cut-out Dimensions (H x W x D): 820 x 605 x 605 mm'),
      paragraph('Package Dimensions (H x W x D): 900 x 650 x 650 mm'),
      paragraph('Dimensions (Cavity) (H x W x D): 825 x 610 x 610 mm'),
      paragraph('Dimensions (Packaged) (H x W x D): 905 x 655 x 655 mm'),
    ]],
    identities: [{ brand: 'Example', model: 'EX100', category: 'dishwasher' }],
  });
  const grouped = result.observations.filter((row) => row.patternKind === 'GROUPED_AXIS_SEQUENCE');
  assert.equal(grouped.length, 5);

  const product = grouped.find((row) => /^Product Dimensions/i.test(row.sourceLabel));
  assert.equal(product.scope, 'product_closed_candidate');
  assert.equal(product.parserDecision, 'SUPPORTED_EXPLICIT_GROUPED');
  assert.deepEqual(product.safeAxes, ['height', 'width', 'depth']);

  const cutOut = grouped.find((row) => /^Cut-out Dimensions/i.test(row.sourceLabel));
  assert.equal(cutOut.scope, 'cavity_opening');
  assert.equal(cutOut.parserDecision, 'REJECTED_NON_PRODUCT_SCOPE');
  assert.deepEqual(cutOut.safeAxes, []);
  assert.match(cutOut.sourceQuote, /^Cut-out Dimensions/i);

  const packaged = grouped.find((row) => /^Package Dimensions/i.test(row.sourceLabel));
  assert.equal(packaged.scope, 'delivery_package');
  assert.equal(packaged.parserDecision, 'REJECTED_NON_PRODUCT_SCOPE');
  assert.deepEqual(packaged.safeAxes, []);
  assert.match(packaged.sourceQuote, /^Package Dimensions/i);

  for (const qualified of grouped.filter((row) => /Cavity|Packaged/.test(row.sourceLabel))) {
    assert.match(qualified.scope, /^(?:cavity_opening|delivery_package)$/);
    assert.equal(qualified.parserDecision, 'REJECTED_NON_PRODUCT_SCOPE');
    assert.deepEqual(qualified.safeAxes, []);
    assert.match(qualified.sourceQuote, /Dimensions \((?:Cavity|Packaged)\)/);
  }
});

test('knowledge base inventories every category and brand without inventing series from model prefixes', () => {
  const historicalRecords = [
    { category: 'fridge', brand: 'WESTINGHOUSE', model: 'WTB2800WH' },
    { category: 'fridge', brand: 'Westinghouse', model: 'WTB3700WH' },
    { category: 'dishwasher', brand: 'Bosch', model: 'SMS66JI01A' },
    { category: 'washing_machine', brand: 'LG', model: 'WD1275A1' },
    { category: 'dryer', brand: 'Miele', model: 'TCA220WP' },
    { category: 'dryer', brand: 'No Sample Brand', model: 'NSB100' },
  ];
  const documents = [
    {
      pdfSha256: 'c'.repeat(64), contentSha256: 'd'.repeat(64), mappingStatus: 'MAPPED_EXACT_MODEL',
      sourceUrls: ['https://resource.electrolux.com.au/example.pdf'],
      identities: [
        { brand: 'Westinghouse', model: 'WTB2800WH', category: 'fridge' },
        { brand: 'Westinghouse', model: 'WTB3700WH', category: 'fridge' },
      ],
      contentList: [[
        paragraph('Models WTB2800WH and WTB3700WH'),
        table('<table><tr><td>Total width (mm)</td><td>598</td></tr><tr><td>Total height (mm)</td><td>1755</td></tr><tr><td>Total depth (mm)</td><td>650</td></tr></table>'),
      ]],
    },
    {
      pdfSha256: 'e'.repeat(64), contentSha256: 'f'.repeat(64), mappingStatus: 'MAPPED_EXACT_MODEL',
      sourceUrls: ['https://www.lg.com/au/example.pdf'],
      identities: [{ brand: 'LG', model: 'WD1275A1', category: 'washing_machine' }],
      contentList: [[
        paragraph('LG Series 5 WD1275A1'),
        table('<table><tr><td>Unit(W x D x H)</td><td>600mm x 535mm x 850mm</td></tr></table>'),
      ]],
    },
    {
      pdfSha256: '9'.repeat(64), contentSha256: '0'.repeat(64), mappingStatus: 'MAPPED_EXACT_MODEL',
      sourceUrls: ['https://www.miele.com.au/example.pdf'],
      identities: [{ brand: 'Miele', model: 'TCA220WP', category: 'dryer' }],
      contentList: [[paragraph('Operating instructions for TCA220WP')]],
    },
  ];

  const knowledge = buildDimensionExpressionKnowledge({
    generatedAt: '2026-07-13T14:00:00.000Z',
    historicalRecords,
    documents,
    invalidDocuments: [{
      indexFile: `${'1'.repeat(64)}.json`,
      pdfSha256: '1'.repeat(64),
      contentSha256: '2'.repeat(64),
      reason: 'ORPHANED_SOURCE_PDF',
      mappingStatus: 'MAPPED_TARGET_IDENTITY',
      sourceUrls: ['https://resource.electrolux.com.au/orphaned.pdf'],
      identities: [{ brand: 'Westinghouse', model: 'WHE6874BA', category: 'fridge' }],
    }],
    brandAliasMap: { WESTINGHOUSE: 'Westinghouse' },
  });

  assert.equal(knowledge.summary.historicalRecords, 6);
  assert.equal(knowledge.summary.categories, 4);
  assert.equal(knowledge.summary.mineruDocuments, 4);
  assert.equal(knowledge.summary.validMineruDocuments, 3);
  assert.equal(knowledge.summary.invalidMineruDocuments, 1);
  assert.equal(knowledge.summary.documentsWithObservations, 2);
  assert.equal(knowledge.summary.documentsWithoutObservations, 1);
  assert.equal(knowledge.summary.researchGaps, 1);
  assert.equal(
    knowledge.summary.validMineruDocuments + knowledge.summary.invalidMineruDocuments,
    knowledge.summary.mineruDocuments,
  );
  const fridge = knowledge.categories.find((row) => row.category === 'fridge');
  assert.equal(fridge.brands.length, 1);
  assert.deepEqual(fridge.brands[0].rawBrandVariants, ['WESTINGHOUSE', 'Westinghouse']);
  assert.equal(fridge.brands[0].families[0].groupType, 'document_family');
  const lg = knowledge.categories.find((row) => row.category === 'washing_machine').brands[0];
  assert.equal(lg.families[0].groupType, 'marketing_series');
  assert.equal(lg.families[0].groupName, 'Series 5');
  const noSample = knowledge.categories.find((row) => row.category === 'dryer')
    .brands.find((row) => row.canonicalBrand === 'No Sample Brand');
  assert.equal(noSample.coverageStatus, 'NO_MINERU_SAMPLE');
  assert.equal(noSample.seriesCountStatus, 'UNKNOWN');
  const miele = knowledge.categories.find((row) => row.category === 'dryer')
    .brands.find((row) => row.canonicalBrand === 'Miele');
  assert.equal(miele.families[0].expressionCoverageStatus, 'NO_RECOGNIZED_DIMENSION_EXPRESSION');

  const markdown = renderDimensionExpressionKnowledgeMarkdown(knowledge);
  assert.match(markdown, /# Appliance Dimension Expression Knowledge Base/);
  assert.match(markdown, /## How to Use/);
  assert.match(markdown, /## Observed Pattern Taxonomy/);
  assert.match(markdown, /GROUPED_AXIS_SEQUENCE/);
  assert.match(markdown, /INDIVIDUALLY_LABELLED_AXES/);
  assert.match(markdown, /## Refrigerators/);
  assert.match(markdown, /### Westinghouse/);
  assert.match(markdown, /Document family cccccccccccc/);
  assert.match(markdown, /### No Sample Brand/);
  assert.match(markdown, /NO_MINERU_SAMPLE/);
  assert.match(markdown, /must not authorise model claims/i);
  assert.match(markdown, /## Invalid or Orphaned MinerU Documents/);
  assert.match(markdown, /ORPHANED_SOURCE_PDF/);
  assert.match(markdown, /WHE6874BA/);
  assert.match(markdown, /NO_RECOGNIZED_DIMENSION_EXPRESSION/);
});

test('knowledge base groups repeated brand PDF grammars without pretending they are marketing series', () => {
  const historicalRecords = [
    { category: 'fridge', brand: 'CHIQ', model: 'CBC064BG' },
    { category: 'fridge', brand: 'CHIQ', model: 'CBC094BG' },
  ];
  const documents = [
    {
      pdfSha256: 'a'.repeat(64), contentSha256: 'b'.repeat(64),
      sourceUrls: ['https://chiq.com.au/cdn/shop/files/CBC064BG_SPEC.pdf'],
      identities: [{ brand: 'CHIQ', model: 'CBC064BG', category: 'fridge' }],
      contentList: [[
        paragraph('CBC064BG Bar Fridge'),
        paragraph('WIDTH 470mm'),
        paragraph('HEIGHT 635mm'),
        paragraph('DEPTH 439mm'),
      ]],
    },
    {
      pdfSha256: 'c'.repeat(64), contentSha256: 'd'.repeat(64),
      sourceUrls: ['https://chiq.com.au/cdn/shop/files/CBC094BG_SPEC.pdf'],
      identities: [{ brand: 'CHIQ', model: 'CBC094BG', category: 'fridge' }],
      contentList: [[
        paragraph('CBC094BG Bar Fridge'),
        paragraph('DEPTH 439mm'),
        paragraph('WIDTH 474mm'),
        paragraph('HEIGHT 833mm'),
      ]],
    },
  ];

  const knowledge = buildDimensionExpressionKnowledge({
    generatedAt: '2026-07-13T16:30:00.000Z',
    historicalRecords,
    documents,
  });
  const brand = knowledge.categories.find((row) => row.category === 'fridge').brands[0];

  assert.equal(brand.observedMarketingSeriesCount, 0);
  assert.equal(brand.observedParserProfileCount, 1);
  assert.equal(brand.families.length, 1);
  assert.equal(brand.families[0].groupType, 'parser_family');
  assert.match(brand.families[0].groupName, /^PDF grammar pdf_grammar_[a-f0-9]{16}$/);
  assert.deepEqual(brand.families[0].models, ['CBC064BG', 'CBC094BG']);
  assert.equal(brand.families[0].parserProfileIds.length, 1);
  assert.match(brand.families[0].parserProfileIds[0], /^pdf_grammar_[a-f0-9]{16}$/);

  const markdown = renderDimensionExpressionKnowledgeMarkdown(knowledge);
  assert.match(markdown, /## Brand and PDF Family Index/);
  assert.match(markdown, /PDF grammar profiles/);
  assert.match(markdown, /syntax reuse only/i);
});

test('marketing series evidence accepts explicit numeric series but rejects model-shaped series text', () => {
  const result = extractDimensionExpressions({
    pdfSha256: 'e'.repeat(64),
    contentSha256: 'f'.repeat(64),
    contentList: [[
      paragraph('Haier Series 5 HWF75AN1'),
      paragraph('Product Dimensions (W x D x H) 595 x 600 x 850 mm'),
      paragraph('Series HWFS7514S HWF75AN1'),
    ]],
    identities: [{ brand: 'Haier', model: 'HWF75AN1', category: 'washing_machine' }],
  });

  assert.deepEqual(result.seriesEvidence.map((row) => row.seriesName), ['Series 5']);
});

test('MinerU loader quarantines a missing source PDF but rejects derived-content corruption', async (context) => {
  const storageRoot = await fs.mkdtemp(join(tmpdir(), 'fitappliance-mineru-kb-'));
  context.after(() => fs.rm(storageRoot, { recursive: true, force: true }));
  const pdfSha256 = '3'.repeat(64);
  const contentBytes = Buffer.from(JSON.stringify([[paragraph('Dimensions W x H x D 600 x 850 x 600 mm')]]));
  const contentSha256 = hash(contentBytes);
  const contentPath = `derived/mineru/${contentSha256}.json`;
  await fs.mkdir(join(storageRoot, 'cache/mineru-index'), { recursive: true });
  await fs.mkdir(join(storageRoot, 'derived/mineru'), { recursive: true });
  await fs.writeFile(join(storageRoot, contentPath), contentBytes);
  const indexPath = join(storageRoot, 'cache/mineru-index', `${pdfSha256}.json`);
  const index = {
    sourcePdfSha256: pdfSha256,
    derivedArtifact: {
      sourcePdfSha256: pdfSha256,
      contentSha256,
      objectPath: contentPath,
    },
  };
  await fs.writeFile(indexPath, `${JSON.stringify(index)}\n`);
  const metadata = new Map([[pdfSha256, {
    sourceUrls: ['https://www.westinghouse.com.au/example.pdf'],
    identities: [{ brand: 'Westinghouse', model: 'WHE6874BA', category: 'fridge' }],
    objectPaths: [],
  }]]);

  const loaded = await loadMineruDocuments({ storageRoot, metadata });
  assert.equal(loaded.totalIndexes, 1);
  assert.deepEqual(loaded.documents, []);
  assert.equal(loaded.invalidDocuments[0].reason, 'ORPHANED_SOURCE_PDF');
  assert.equal(loaded.invalidDocuments[0].pdfSha256, pdfSha256);
  assert.equal(loaded.invalidDocuments[0].contentSha256, contentSha256);
  assert.equal(loaded.invalidDocuments[0].identities[0].model, 'WHE6874BA');
  assert.equal(loaded.invalidDocuments[0].mineruObject.sourcePdfSha256, pdfSha256);
  assert.equal(loaded.invalidDocuments[0].mineruObject.contentSha256, contentSha256);

  index.derivedArtifact.contentSha256 = '4'.repeat(64);
  await fs.writeFile(indexPath, `${JSON.stringify(index)}\n`);
  await assert.rejects(
    loadMineruDocuments({ storageRoot, metadata }),
    /MinerU content hash mismatch/,
  );
});

test('generated dimension-expression knowledge preserves inventory and fail-closed safety invariants', async () => {
  const knowledge = JSON.parse(await fs.readFile(new URL(
    '../../data/architecture-v2/generated/dimension-expression-observations.json',
    import.meta.url,
  ), 'utf8'));
  const historical = JSON.parse(await fs.readFile(new URL(
    '../../data/architecture-v2/generated/historical-appliance-reference.json',
    import.meta.url,
  ), 'utf8'));
  assert.equal(knowledge.summary.historicalRecords, historical.records.length);
  assert.equal(knowledge.categories.length, 4);
  assert.equal(
    knowledge.categories.reduce((sum, category) => sum + category.recordCount, 0),
    historical.records.length,
  );
  assert.equal(
    knowledge.summary.validMineruDocuments + knowledge.summary.invalidMineruDocuments,
    knowledge.summary.mineruDocuments,
  );
  assert.equal(
    knowledge.summary.documentsWithObservations + knowledge.summary.documentsWithoutObservations,
    knowledge.summary.validMineruDocuments,
  );
  const expectedBrandGroups = new Set(historical.records.map((record) => (
    `${record.category}\0${String(record.brand).trim().toLowerCase()}`
  )));
  const actualBrandGroups = new Set(knowledge.categories.flatMap((category) => (
    category.brands.flatMap((brand) => brand.rawBrandVariants.map((rawBrand) => (
      `${category.category}\0${rawBrand.toLowerCase()}`
    )))
  )));
  assert.deepEqual(actualBrandGroups, expectedBrandGroups);

  const expressions = new Map();
  for (const category of knowledge.categories) {
    for (const brand of category.brands) {
      for (const family of brand.families) {
        for (const expression of family.expressions) expressions.set(expression.observationId, expression);
      }
    }
  }
  const invalidHashes = new Set(knowledge.invalidDocuments.map((document) => document.pdfSha256));
  for (const expression of expressions.values()) {
    assert.match(expression.pdfSha256, /^[a-f0-9]{64}$/);
    assert.match(expression.contentSha256, /^[a-f0-9]{64}$/);
    assert.match(expression.fragmentSha256, /^[a-f0-9]{64}$/);
    assert.ok(!invalidHashes.has(expression.pdfSha256));
    if (/^SUPPORTED_/.test(expression.parserDecision)) {
      assert.ok(!['DOCUMENT_IDENTITY_ONLY', 'UNRESOLVED_MODEL_EXPRESSION'].includes(expression.modelBinding));
      assert.notEqual(expression.scope, 'delivery_package');
    }
    if (expression.parserDecision === 'RESEARCH_ADJUSTABLE_RANGE') {
      for (const value of expression.axisValues ?? []) {
        if (value.valueShape === 'range') assert.ok(!expression.safeAxes.includes(value.axis));
      }
    }
  }
});
