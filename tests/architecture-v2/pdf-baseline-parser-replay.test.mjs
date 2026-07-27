import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  buildPdfBaselineParserReplay,
  classifyPdfParserFailure,
} from '../../src/domain/pdf-baseline-parser-replay.mjs';

const FIELDS = [
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function originalSample(id, overrides = {}) {
  return {
    sampleId: id,
    brand: 'Example',
    model: id.toUpperCase(),
    category: 'dishwasher',
    sourceHost: 'retailer.example',
    acquisitionRoute: 'MIRROR_PARSE_AND_OFFICIAL_REDISCOVERY',
    documentPattern: { hint: 'specification_sheet' },
    publicationEligible: false,
    ...overrides,
  };
}

function indexedSample(original, jsonBytes, overrides = {}) {
  const pdfBytes = Buffer.from(`%PDF-1.7\n${original.model}`);
  const pdfHash = sha256(pdfBytes);
  const jsonHash = sha256(jsonBytes);
  return {
    ...structuredClone(original),
    sourcePdfSha256: pdfHash,
    acquisition: {
      status: 'indexed',
      officialSourceUrl: `https://manufacturer.example/${original.model}.pdf`,
      finalUrl: `https://manufacturer.example/${original.model}.pdf`,
      documentType: 'specification_sheet',
      contentSha256: pdfHash,
      objectPath: `pdf/${pdfHash}.pdf`,
      byteSize: pdfBytes.length,
      derivedArtifact: {
        format: 'content_list_v2',
        parserName: 'MinerU',
        parserVersion: '3.4.4',
        modelRevision: 'fixture-revision',
        sourcePdfSha256: pdfHash,
        contentSha256: jsonHash,
        objectPath: `json/${jsonHash}.json`,
        byteSize: jsonBytes.length,
        pageCount: 1,
      },
    },
    publicationEligible: false,
    _objects: new Map([
      [`pdf/${pdfHash}.pdf`, pdfBytes],
      [`json/${jsonHash}.json`, jsonBytes],
    ]),
    ...overrides,
  };
}

test('failure classifier separates source errors, identity failures, ambiguity and grammar gaps', () => {
  assert.equal(classifyPdfParserFailure(
    new Error('no exact-model MinerU evidence with explicit axes extracted'),
    Buffer.from('[{"text":"An unexpected error has occurred. Please contact the technical team."}]'),
  ).outcome, 'SOURCE_CONTENT_ERROR');
  assert.equal(classifyPdfParserFailure(
    new Error('structured exact-model identity signal required in MinerU JSON'),
    Buffer.from('[{"text":"Dimensions Width 600 mm Height 850 mm Depth 600 mm"}]'),
  ).outcome, 'IDENTITY_SCOPE_FAILURE');
  assert.equal(classifyPdfParserFailure(
    new Error('ambiguous MinerU values for closedEnvelope.depthMm'),
    Buffer.from('[{"text":"Dimensions Width 600 mm Height 850 mm Depth 600 mm"}]'),
  ).outcome, 'DIMENSION_SEMANTICS_AMBIGUOUS');
  assert.equal(classifyPdfParserFailure(
    new Error('no exact-model MinerU evidence with explicit axes extracted'),
    Buffer.from('[{"text":"Dimensions Width 600 mm Height 850 mm Depth 600 mm"}]'),
  ).outcome, 'PARSER_GRAMMAR_GAP');
  assert.equal(classifyPdfParserFailure(
    new Error('no exact-model MinerU evidence with explicit axes extracted'),
    Buffer.from('[{"text":"Warranty and product features"}]'),
  ).outcome, 'MINERU_STRUCTURE_INSUFFICIENT');
});

test('replay verifies immutable objects, records complete claims and ranks only real grammar gaps', async () => {
  const gap = originalSample('gap');
  const sourceError = originalSample('source-error', { brand: 'BrokenSource' });
  const complete = originalSample('complete', { brand: 'CompleteBrand' });
  const missing = originalSample('missing', { brand: 'MissingBrand' });
  const originals = [gap, sourceError, complete, missing];
  const gapJson = Buffer.from('[{"text":"GAP Dimensions Width 598 mm Height 850 mm Depth 600 mm"}]');
  const sourceErrorJson = Buffer.from('[{"text":"An unexpected error has occurred. Please contact the technical team."}]');
  const completeJson = Buffer.from('[{"text":"COMPLETE Dimensions Width 600 mm Height 820 mm Depth 570 mm"}]');
  const indexed = [
    indexedSample(gap, gapJson),
    indexedSample(sourceError, sourceErrorJson),
    indexedSample(complete, completeJson),
  ];
  const rerunSamples = [
    ...indexed.map(({ _objects, ...sample }) => sample),
    {
      ...missing,
      acquisition: { status: 'official_candidate_not_found' },
      publicationEligible: false,
    },
  ];
  const objects = new Map(indexed.flatMap(({ _objects }) => [..._objects]));
  const parse = (bytes) => {
    const text = bytes.toString();
    if (text.includes('COMPLETE')) {
      return {
        claims: FIELDS.map((field, index) => ({
          field,
          value: { kind: 'fixed', mm: [600, 820, 570][index] },
          page: 1,
          quote: `claim ${index}`,
        })),
        grammarProfileIds: ['fixture-complete-v1'],
      };
    }
    throw new Error('no exact-model MinerU evidence with explicit axes extracted');
  };
  const originalBaseline = {
    baselineId: 'pdf-failure-baseline-100-2026-07-27',
    samples: originals,
    familyBacklog: {
      eligibilityThresholdExactModelReceipts: 10,
      ranked: [
        { familyId: 'source-family', category: 'dishwasher', brand: 'BrokenSource', sourceHost: 'retailer.example', sourceFamilyHint: 'specification_sheet', acquisitionRoute: 'MIRROR_PARSE_AND_OFFICIAL_REDISCOVERY', candidateTargets: 100 },
        { familyId: 'gap-family', category: 'dishwasher', brand: 'Example', sourceHost: 'retailer.example', sourceFamilyHint: 'specification_sheet', acquisitionRoute: 'MIRROR_PARSE_AND_OFFICIAL_REDISCOVERY', candidateTargets: 50 },
        { familyId: 'complete-family', category: 'dishwasher', brand: 'CompleteBrand', sourceHost: 'retailer.example', sourceFamilyHint: 'specification_sheet', acquisitionRoute: 'MIRROR_PARSE_AND_OFFICIAL_REDISCOVERY', candidateTargets: 40 },
      ],
    },
  };
  const replay = await buildPdfBaselineParserReplay({
    originalBaseline,
    wp7aRerun: {
      baselineId: 'pdf-failure-baseline-100-2026-07-27-wp7a-rerun',
      selection: { sampleCount: 4, sampleIds: originals.map(({ sampleId }) => sampleId) },
      samples: rerunSamples,
    },
    sourceRerunSha256: 'ab'.repeat(32),
    builtOn: '2026-07-27',
    loadObject: async (path) => objects.get(path),
    parse,
  });

  assert.deepEqual(replay.summary.byOutcome, {
    ACQUISITION_UNAVAILABLE: 1,
    COMPLETE_3_AXIS: 1,
    PARSER_GRAMMAR_GAP: 1,
    SOURCE_CONTENT_ERROR: 1,
  });
  assert.equal(replay.summary.publicationEligible, 0);
  assert.equal(replay.samples.find(({ sampleId }) => sampleId === 'complete').claims.length, 3);
  assert.deepEqual(replay.familyBacklog.rankedForParserResearch.map(({ familyId }) => familyId), [
    'gap-family',
  ]);
  assert.equal(replay.familyBacklog.rankedForParserResearch[0].eligibleForSharedRulePublication, false);
  assert.match(replay.familyBacklog.rankedForParserResearch[0].sharedRuleBlocker, /10 exact-model/i);
});

test('replay rejects a derived object whose bytes do not match its immutable hash', async () => {
  const original = originalSample('tampered');
  const jsonBytes = Buffer.from('[{"text":"Dimensions Width 600 mm Height 850 mm Depth 600 mm"}]');
  const indexed = indexedSample(original, jsonBytes);
  const sample = structuredClone(indexed);
  delete sample._objects;
  const objects = new Map(indexed._objects);
  objects.set(sample.acquisition.derivedArtifact.objectPath, Buffer.from('tampered'));

  await assert.rejects(() => buildPdfBaselineParserReplay({
    originalBaseline: { baselineId: 'baseline', samples: [original], familyBacklog: { ranked: [] } },
    wp7aRerun: { baselineId: 'rerun', selection: { sampleCount: 1, sampleIds: ['tampered'] }, samples: [sample] },
    sourceRerunSha256: 'ab'.repeat(32),
    builtOn: '2026-07-27',
    loadObject: async (path) => objects.get(path),
    parse: () => ({ claims: [] }),
  }), /integrity mismatch/i);
});
