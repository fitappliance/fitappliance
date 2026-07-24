import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  buildHistoricalParserGapPriority,
  validateHistoricalParserFixtureCorpus,
  validateHistoricalParserGapPriority,
} from '../../src/domain/historical-parser-gap-priority.mjs';
import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';

const GENERATED_AT = '2026-07-19T00:00:00.000Z';
const SHA = (value) => value.repeat(64);

function replay({ pdfSha256, model, reasonCode = 'PARSED_PARTIAL', claimFields = [] }) {
  return {
    pdfSha256,
    category: 'washing_machine',
    brand: 'Example',
    model,
    extractionState: reasonCode === 'PARSED_COMPLETE' ? 'ALL_AXIS_SCALAR'
      : reasonCode === 'PARSED_PARTIAL' ? 'PARTIAL_AXIS' : 'PARSER_GAP',
    identityScope: reasonCode === 'PARSED_COMPLETE' || reasonCode === 'PARSED_PARTIAL'
      ? 'EXACT_MODEL' : 'UNPROVEN',
    claimFields,
    grammarProfileIds: [],
    reasonCode,
  };
}

function expression({
  pdfSha256,
  model,
  parserDecision = 'SUPPORTED_EXPLICIT_LABELS',
  sourceLabel = 'Total width (mm) | Total height (mm)',
  sourceQuote = `${sourceLabel} | 600 | 850`,
  axisValues = [
    { axis: 'width', label: 'Total width (mm)', value: '600', valueShape: 'scalar' },
    { axis: 'height', label: 'Total height (mm)', value: '850', valueShape: 'scalar' },
  ],
  safeAxes = ['width', 'height'],
  patternKind = 'INDIVIDUALLY_LABELLED_AXES',
  modelBinding = 'SAME_PAGE_EXACT_MODEL',
}) {
  return {
    observationId: `observation-${pdfSha256.slice(0, 8)}-${model}`,
    pdfSha256,
    contentSha256: SHA('c'),
    page: 3,
    bbox: [10, 20, 300, 400],
    fragmentSha256: SHA('f'),
    identities: [{ category: 'washing_machine', brand: 'Example', model }],
    modelBinding,
    boundModels: modelBinding === 'UNRESOLVED_MODEL_EXPRESSION' ? [] : [model],
    patternKind,
    sourceLabel,
    sourceValue: axisValues.map((value) => value.value).join(' | '),
    sourceQuote,
    axisOrder: axisValues.map((value) => value.axis),
    safeAxes,
    unit: 'mm',
    unitPlacement: 'label',
    scope: 'product_closed_candidate',
    depthVariants: [],
    axisValues,
    parserDecision,
    semanticInterpretation: parserDecision,
  };
}

function familySpec({
  familyId,
  models,
  validity = 'VALID',
  proofLevel = 'EXACT_MODEL_PROVEN',
  reasonCode = 'PARSED_PARTIAL',
  expressions = null,
  researchGaps = [],
  lifecycleState = 'CURRENT_RETAIL',
  priority = 'P0_CURRENT_RETAIL',
  sourceAuthority = 'OFFICIAL',
  parserProfileIds = [],
}) {
  const pdfSha256 = createHash('sha256').update(familyId).digest('hex');
  const documentId = `document-${familyId}`;
  const referenceIds = models.map((model) => `reference-${familyId}-${model}`);
  const familyExpressions = expressions ?? models.map((model) => expression({ pdfSha256, model }));
  return {
    graphFamily: {
      familyId,
      category: 'washing_machine',
      brand: 'Example',
      groupType: 'parser_family',
      groupName: familyId,
      documentIds: [documentId],
      pdfSha256s: [pdfSha256],
      grammarProfileIds: parserProfileIds,
      referenceIds,
    },
    graphDocument: {
      documentId,
      pdfSha256,
      validity,
      physicalPaths: [],
      physicalCopyCount: 0,
      sourceVersionIds: [],
      mineruObject: {
        schemaVersion: 1,
        format: 'content_list_v2',
        parserName: 'MinerU',
        parserVersion: '3.4.4',
        modelRevision: 'fixture',
        sourcePdfSha256: pdfSha256,
        contentSha256: validity === 'VALID' ? SHA('c') : null,
        objectPath: validity === 'VALID' ? `evidence/${SHA('c')}.json` : null,
        byteSize: validity === 'VALID' ? 100 : null,
        pageCount: validity === 'VALID' ? 1 : null,
      },
      grammarProfileIds: parserProfileIds,
      familyIds: [familyId],
      modelEdges: referenceIds.map((referenceId) => ({
        referenceId,
        proofLevel,
        proofLocators: [{ type: 'FIXTURE' }],
      })),
    },
    knowledgeFamily: {
      groupType: 'parser_family',
      groupName: familyId,
      models,
      pdfSha256s: [pdfSha256],
      sourceUrls: [`https://official.example/${familyId}.pdf`],
      seriesEvidence: [],
      parserProfiles: [],
      parserReplays: models.map((model) => replay({
        pdfSha256,
        model,
        reasonCode,
        claimFields: reasonCode === 'PARSED_PARTIAL'
          ? ['closedEnvelope.widthMm', 'closedEnvelope.heightMm'] : [],
      })),
      expressions: familyExpressions,
      researchGaps,
      parserProfileIds,
      completeParserReplay: reasonCode === 'PARSED_COMPLETE',
      expressionCoverageStatus: reasonCode === 'PARSED_COMPLETE'
        ? 'PARSER_REPLAY_COMPLETE' : 'OBSERVED_DIMENSION_EXPRESSIONS',
    },
    classificationRecords: referenceIds.map((referenceId, index) => ({
      schemaVersion: 1,
      referenceId,
      category: 'washing_machine',
      canonicalBrand: 'Example',
      model: models[index],
      lifecycleState,
      priority,
      sourceAuthority,
    })),
  };
}

function fixture(specs, fixtureCorpus = { schemaVersion: 1, profiles: [] }) {
  const graphDocuments = specs.map((row) => row.graphDocument);
  const graphFamilies = specs.map((row) => row.graphFamily);
  const graphSemantic = {
    schemaVersion: 1,
    policy: {},
    summary: {},
    sourceVersions: [],
    nonIndexedClassificationLinks: [],
    documents: graphDocuments,
    families: graphFamilies,
  };
  const indexedDocuments = graphDocuments.map((document) => ({
    pdfSha256: document.pdfSha256,
    contentSha256: document.mineruObject.contentSha256,
    validity: document.validity,
    ...(document.validity === 'INVALID' ? { invalidReason: 'FIXTURE_INVALID' } : {}),
    mappingStatus: 'MAPPED_TARGET_IDENTITY',
    sourceUrls: [],
    identities: [],
    mineruObject: document.mineruObject,
  }));
  const dimensionKnowledge = {
    schemaVersion: 4,
    generatedAt: GENERATED_AT,
    policy: {},
    summary: {
      mineruDocuments: indexedDocuments.length,
      validMineruDocuments: indexedDocuments.filter((row) => row.validity === 'VALID').length,
      invalidMineruDocuments: indexedDocuments.filter((row) => row.validity === 'INVALID').length,
    },
    indexedDocuments,
    categories: [{
      category: 'washing_machine',
      recordCount: specs.reduce((sum, row) => sum + row.knowledgeFamily.models.length, 0),
      brands: [{
        canonicalBrand: 'Example',
        rawBrandVariants: ['Example'],
        families: specs.map((row) => row.knowledgeFamily),
      }],
    }],
    unmappedDocuments: [],
    invalidDocuments: [],
  };
  const classification = {
    schemaVersion: 1,
    generatedAt: GENERATED_AT,
    semanticClassificationSha256: SHA('a'),
    records: specs.flatMap((row) => row.classificationRecords),
  };
  return {
    generatedAt: GENERATED_AT,
    dimensionKnowledge,
    documentGraph: {
      ...graphSemantic,
      generatedAt: GENERATED_AT,
      semanticGraphSha256: canonicalJsonSha256(graphSemantic),
    },
    classification,
    fixtureCorpus,
  };
}

function corpusCase({ caseId, expectation, model = 'MODEL1' }) {
  return {
    caseId,
    expectation,
    derivation: expectation === 'ACCEPT' ? 'SOURCE_FRAGMENT' : 'ADVERSARIAL_MUTATION',
    source: {
      pdfSha256: SHA('1'),
      contentSha256: SHA('2'),
      page: 3,
      fragmentSha256: SHA('3'),
      fragmentType: 'table',
      bbox: [10, 20, 300, 400],
    },
    identity: { category: 'washing_machine', brand: 'Example', model },
    semanticContext: {
      axisOrder: ['height', 'width', 'depth'],
      unit: 'mm',
      scope: 'product_closed_candidate',
      modelBinding: 'SAME_PAGE_EXACT_MODEL',
    },
    expectedClaims: expectation === 'ACCEPT'
      ? ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'] : [],
    rejectedSemantics: expectation === 'REJECT' ? ['delivery_package'] : [],
    contentList: [[{ type: 'table', bbox: [10, 20, 300, 400], content: { html: '<table></table>' } }]],
  };
}

test('priority queue ranks only repair-ready exact-model gaps and is deterministic', () => {
  const highImpact = familySpec({ familyId: 'family-high', models: ['A1', 'A2', 'A3'] });
  const lowImpact = familySpec({ familyId: 'family-low', models: ['B1'] });
  const input = fixture([lowImpact, highImpact]);
  const first = buildHistoricalParserGapPriority(input);
  const reversed = structuredClone(input);
  reversed.documentGraph.documents.reverse();
  reversed.documentGraph.families.reverse();
  reversed.dimensionKnowledge.categories[0].brands[0].families.reverse();
  reversed.classification.records.reverse();
  const graphSemantic = {
    schemaVersion: reversed.documentGraph.schemaVersion,
    ...(reversed.documentGraph.sourceBindings
      ? { sourceBindings: reversed.documentGraph.sourceBindings }
      : {}),
    policy: reversed.documentGraph.policy,
    summary: reversed.documentGraph.summary,
    sourceVersions: reversed.documentGraph.sourceVersions,
    nonIndexedClassificationLinks: reversed.documentGraph.nonIndexedClassificationLinks,
    documents: reversed.documentGraph.documents,
    families: reversed.documentGraph.families,
  };
  reversed.documentGraph.semanticGraphSha256 = canonicalJsonSha256(graphSemantic);
  const second = buildHistoricalParserGapPriority(reversed);

  assert.equal(first.selectedFamilyId, 'family-high');
  assert.deepEqual(first.rows.map((row) => row.familyId), ['family-high', 'family-low']);
  assert.deepEqual(second.rows, first.rows);
  assert.notEqual(second.semanticQueueSha256, first.semanticQueueSha256);
  assert.notEqual(second.sourceBindings.documentGraphSha256, first.sourceBindings.documentGraphSha256);
  assert.equal(first.rows[0].lane, 'REPAIR_READY');
  assert.equal(first.rows[0].affectedExactModels, 3);
});

test('tied repair scores use family ID as the stable final tie break', () => {
  const artifact = buildHistoricalParserGapPriority(fixture([
    familySpec({ familyId: 'family-z', models: ['Z1'] }),
    familySpec({ familyId: 'family-a', models: ['A1'] }),
  ]));
  assert.deepEqual(artifact.rows.map((row) => row.familyId), ['family-a', 'family-z']);
  assert.deepEqual(artifact.rows.map((row) => row.rank), [1, 2]);
});

test('invalid MinerU, family-only identity and image-only evidence are typed blockers', () => {
  const invalid = familySpec({ familyId: 'family-invalid', models: ['I1'], validity: 'INVALID' });
  const identity = familySpec({
    familyId: 'family-identity', models: ['ID1'], proofLevel: 'FAMILY_SCOPE_ONLY',
    reasonCode: 'EXACT_MODEL_IDENTITY_NOT_PROVEN',
  });
  const image = familySpec({
    familyId: 'family-image', models: ['IMG1'], reasonCode: 'NO_COMPLETE_EXPLICIT_AXES',
    expressions: [], researchGaps: [{ gapType: 'IMAGE_ONLY_DIMENSION_DIAGRAM', page: 2 }],
  });
  const artifact = buildHistoricalParserGapPriority(fixture([invalid, identity, image]));
  const lanes = Object.fromEntries(artifact.rows.map((row) => [row.familyId, row.lane]));
  assert.deepEqual(lanes, {
    'family-identity': 'IDENTITY_BLOCKED',
    'family-image': 'IMAGE_SEMANTICS_REQUIRED',
    'family-invalid': 'MINERU_BLOCKED',
  });
  assert.ok(artifact.rows.every((row) => row.rank === null && row.score === null));
  assert.equal(artifact.selectedFamilyId, null);
});

test('packaging and door-open diagnostics cannot become parser repair work', () => {
  const complete = familySpec({
    familyId: 'family-complete', models: ['C1'], reasonCode: 'PARSED_COMPLETE',
    researchGaps: [
      { gapType: 'UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION', page: 4, quote: 'Pack Dimensions Height Width Depth' },
      { gapType: 'IMAGE_ONLY_DIMENSION_DIAGRAM', page: 5, quote: 'door open' },
    ],
  });
  const artifact = buildHistoricalParserGapPriority(fixture([complete]));
  assert.equal(artifact.rows[0].lane, 'COMPLETE_DIAGNOSTIC_ONLY');
  assert.equal(artifact.rows[0].rank, null);
  assert.deepEqual(artifact.rows[0].riskFlags.sort(), ['DOOR_OPEN_OR_OPERATION', 'PACKAGE_OR_DELIVERY']);
});

test('explicit adjustable height remains repairable but unsupported axis ranges are blocked', () => {
  const heightRange = expression({
    pdfSha256: SHA('1'), model: 'R1', parserDecision: 'SUPPORTED_ADJUSTABLE_HEIGHT_RANGE',
    axisValues: [
      { axis: 'height', label: 'Adjustable height', value: '850-865 mm', valueShape: 'range' },
      { axis: 'width', label: 'Width', value: '600 mm', valueShape: 'scalar' },
      { axis: 'depth', label: 'Depth', value: '600 mm', valueShape: 'scalar' },
    ],
    safeAxes: ['height', 'width', 'depth'],
  });
  const widthRange = expression({
    pdfSha256: SHA('2'), model: 'R2', parserDecision: 'RESEARCH_UNSUPPORTED_AXIS_RANGE',
    axisValues: [{ axis: 'width', label: 'Width', value: '590-600 mm', valueShape: 'range' }],
    safeAxes: [],
  });
  const artifact = buildHistoricalParserGapPriority(fixture([
    familySpec({ familyId: 'family-height-range', models: ['R1'], expressions: [heightRange] }),
    familySpec({ familyId: 'family-width-range', models: ['R2'], expressions: [widthRange] }),
  ]));
  assert.equal(artifact.rows.find((row) => row.familyId === 'family-height-range').lane, 'REPAIR_READY');
  assert.equal(artifact.rows.find((row) => row.familyId === 'family-width-range').lane, 'AMBIGUITY_RESEARCH');
});

test('unqualified D, D-prime and D-double-prime variants stay ambiguity research', () => {
  const ambiguousDepth = expression({
    pdfSha256: SHA('1'), model: 'D1',
    parserDecision: 'SUPPORTED_DIAGRAM_PRIMARY_DEPTH_WITH_VARIANTS',
    sourceLabel: 'W | D | D\' | D" | H',
    sourceQuote: 'Dimension(mm) W 600 D 610 D\' 660 D" 1135 H 850',
    axisValues: [
      { axis: 'width', label: 'W', value: '600', valueShape: 'scalar' },
      { axis: 'depth', label: 'D', value: '610', valueShape: 'scalar' },
      { axis: 'depth', label: 'D\'', value: '660', valueShape: 'scalar' },
      { axis: 'depth', label: 'D"', value: '1135', valueShape: 'scalar' },
      { axis: 'height', label: 'H', value: '850', valueShape: 'scalar' },
    ],
    safeAxes: ['width', 'depth', 'height'],
    patternKind: 'ALTERNATING_AXIS_VALUE_CELLS',
  });
  const artifact = buildHistoricalParserGapPriority(fixture([
    familySpec({
      familyId: 'family-depth-variants', models: ['D1'], reasonCode: 'AMBIGUOUS_AXIS_VALUES',
      expressions: [ambiguousDepth],
    }),
  ]));
  assert.equal(artifact.rows[0].lane, 'AMBIGUITY_RESEARCH');
  assert.ok(artifact.rows[0].riskFlags.includes('UNRESOLVED_DEPTH_VARIANTS'));
});

test('fixture corpus requires accept and reject cases with complete evidence context', () => {
  const valid = {
    schemaVersion: 1,
    profiles: [{
      parserProfileId: 'example-profile-v1',
      familyId: 'family-high',
      cases: [
        corpusCase({ caseId: 'accept-real', expectation: 'ACCEPT' }),
        corpusCase({ caseId: 'reject-package', expectation: 'REJECT' }),
      ],
    }],
  };
  const result = validateHistoricalParserFixtureCorpus(valid);
  assert.equal(result.profilesById.size, 1);

  const noReject = structuredClone(valid);
  noReject.profiles[0].cases.pop();
  assert.throws(() => validateHistoricalParserFixtureCorpus(noReject), /positive and negative/i);

  const noAxis = structuredClone(valid);
  noAxis.profiles[0].cases[0].semanticContext.axisOrder = [];
  assert.throws(() => validateHistoricalParserFixtureCorpus(noAxis), /axis order/i);

  const noModel = structuredClone(valid);
  noModel.profiles[0].cases[0].identity.model = '';
  assert.throws(() => validateHistoricalParserFixtureCorpus(noModel), /exact model/i);
});

test('fixture coverage is reported without allowing it to override evidence gates', () => {
  const corpus = {
    schemaVersion: 1,
    profiles: [{
      parserProfileId: 'example-profile-v1',
      familyId: 'family-identity',
      cases: [
        corpusCase({ caseId: 'accept-real', expectation: 'ACCEPT' }),
        corpusCase({ caseId: 'reject-package', expectation: 'REJECT' }),
      ],
    }],
  };
  const artifact = buildHistoricalParserGapPriority(fixture([
    familySpec({
      familyId: 'family-identity', models: ['ID1'], proofLevel: 'FAMILY_SCOPE_ONLY',
      reasonCode: 'EXACT_MODEL_IDENTITY_NOT_PROVEN', parserProfileIds: ['example-profile-v1'],
    }),
  ], corpus));
  assert.equal(artifact.rows[0].fixtureCoverage, 'POSITIVE_AND_NEGATIVE');
  assert.equal(artifact.rows[0].lane, 'IDENTITY_BLOCKED');
  assert.equal(artifact.rows[0].rank, null);
});

test('fixture coverage survives derived family ID changes through an exact source-PDF set binding', () => {
  const spec = familySpec({ familyId: 'family-recomputed', models: ['ID1'] });
  const accept = corpusCase({ caseId: 'accept-real', expectation: 'ACCEPT' });
  accept.source.pdfSha256 = spec.graphDocument.pdfSha256;
  const corpus = {
    schemaVersion: 1,
    profiles: [{
      parserProfileId: 'example-profile-v1',
      familyId: 'family-before-parser-repair',
      cases: [accept, corpusCase({ caseId: 'reject-package', expectation: 'REJECT' })],
    }],
  };
  const artifact = buildHistoricalParserGapPriority(fixture([spec], corpus));
  assert.equal(artifact.rows[0].fixtureCoverage, 'POSITIVE_AND_NEGATIVE');
  assert.deepEqual(artifact.rows[0].fixtureProfileIds, ['example-profile-v1']);
});

test('artifact validation catches source binding and semantic queue drift', () => {
  const artifact = buildHistoricalParserGapPriority(fixture([
    familySpec({ familyId: 'family-ready', models: ['A1'] }),
  ]));
  validateHistoricalParserGapPriority(artifact);
  const mutated = structuredClone(artifact);
  mutated.rows[0].affectedExactModels += 1;
  assert.throws(() => validateHistoricalParserGapPriority(mutated), /semantic queue SHA-256/i);
});
