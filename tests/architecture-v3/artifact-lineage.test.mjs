import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  createArtifactRecord,
  createFragment,
} from '../../src/domain/architecture-v3/artifact-lineage.mjs';
import {
  CANONICAL_EVIDENCE_JSON_VERSION,
  canonicalEvidenceJson,
} from '../../src/shared/canonical-evidence-json.mjs';
import { validateEvidenceAnchors } from '../../src/domain/architecture-v3/evidence-anchors.mjs';

const ROOT_SHA256 = 'a'.repeat(64);
const PAGE_ONE_SHA256 = 'b'.repeat(64);
const PAGE_TWO_SHA256 = 'c'.repeat(64);
const OPTIONS_SHA256 = 'd'.repeat(64);

function assertLineageValidationError(operation, pattern) {
  assert.throws(
    operation,
    (error) => error?.name === 'ArtifactLineageValidationError'
      && error.code === 'INVALID_ARTIFACT_LINEAGE'
      && pattern.test(error.message),
  );
}

function assertAnchorValidationError(operation, pattern) {
  assert.throws(
    operation,
    (error) => error?.name === 'EvidenceAnchorValidationError'
      && error.code === 'INVALID_EVIDENCE_ANCHORS'
      && pattern.test(error.message),
  );
}

function fragmentIdentity({ content, parentArtifactSha256, locator }) {
  return createHash('sha256').update(canonicalEvidenceJson({
    fragmentIdentityDomain: 'fitappliance.fragment.v1',
    schemaVersion: 1,
    canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
    content,
    parentArtifactSha256,
    locator,
  }), 'utf8').digest('hex');
}

function derivedArtifact({
  sha256,
  parentSha256 = ROOT_SHA256,
  mediaType = 'image/png',
  toolRevision = 'pdf-render@1',
  optionsSha256 = OPTIONS_SHA256,
}) {
  return createArtifactRecord({
    sha256,
    parentSha256,
    mediaType,
    toolRevision,
    optionsSha256,
  });
}

function pdfLocator({ pageNumber, renderedPageArtifactSha256 }) {
  return {
    kind: 'pdf_bbox',
    pageNumber,
    normalizedTopLeftBox: [10.25, 20.5, 300.75, 400.25],
    renderedPageArtifactSha256,
    renderedPixels: { width: 2000, height: 3000 },
    rotationDegreesClockwise: 0,
    transform: { kind: 'full_page' },
    rawCoordinates: {
      coordinateSpace: 'pdf_user_space',
      values: [10.25, 20.5, 300.75, 400.25],
    },
  };
}

function fragmentFor({ content, parentArtifactSha256 = ROOT_SHA256, locator }) {
  return createFragment({
    fragmentSha256: fragmentIdentity({ content, parentArtifactSha256, locator }),
    content,
    parentArtifactSha256,
    locator,
  });
}

function witnessedPairFixture({
  valueLocator = pdfLocator({ pageNumber: 1, renderedPageArtifactSha256: PAGE_ONE_SHA256 }),
  legendLocator = pdfLocator({ pageNumber: 2, renderedPageArtifactSha256: PAGE_TWO_SHA256 }),
  witnessContent = null,
} = {}) {
  const root = createArtifactRecord({
    sha256: ROOT_SHA256,
    parentSha256: null,
    mediaType: 'application/pdf',
    toolRevision: null,
    optionsSha256: null,
  });
  const pageOne = derivedArtifact({ sha256: PAGE_ONE_SHA256 });
  const pageTwo = derivedArtifact({ sha256: PAGE_TWO_SHA256 });
  const value = fragmentFor({
    content: { type: 'measurement', value: 20 },
    locator: valueLocator,
  });
  const legend = fragmentFor({
    content: { type: 'legend', label: 'minimum clearance' },
    locator: legendLocator,
  });
  const witness = fragmentFor({
    content: witnessContent ?? {
      kind: 'relation_witness',
      relationKind: 'diagram_legend',
      fromFragmentSha256: value.fragmentSha256,
      toFragmentSha256: legend.fragmentSha256,
    },
    locator: { kind: 'text_span', startUtf16CodeUnit: 0, endUtf16CodeUnit: 1 },
  });
  const input = {
    sourceArtifactSha256: ROOT_SHA256,
    anchors: [
      { anchorId: 'value-anchor', role: 'value', fragmentSha256: value.fragmentSha256 },
      { anchorId: 'legend-anchor', role: 'legend', fragmentSha256: legend.fragmentSha256 },
      { anchorId: 'witness-anchor', role: 'reference_datum', fragmentSha256: witness.fragmentSha256 },
    ],
    relations: [{
      kind: 'diagram_legend',
      fromAnchorId: 'value-anchor',
      toAnchorId: 'legend-anchor',
      witnessAnchorIds: ['witness-anchor'],
    }],
    artifactRecords: [root, pageOne, pageTwo],
    fragments: [value, legend, witness],
  };
  return { input, root, pageOne, pageTwo, value, legend, witness };
}

test('createArtifactRecord returns a frozen root record without a derived metadata hash', () => {
  const record = createArtifactRecord({
    sha256: ROOT_SHA256,
    parentSha256: null,
    mediaType: 'application/pdf',
    toolRevision: null,
    optionsSha256: null,
  });

  assert.deepEqual(record, {
    schemaVersion: 1,
    sha256: ROOT_SHA256,
    parentSha256: null,
    mediaType: 'application/pdf',
    toolRevision: null,
    optionsSha256: null,
  });
  assert.equal(Object.isFrozen(record), true);
  assert.throws(() => {
    record.mediaType = 'text/plain';
  }, TypeError);
});

test('createArtifactRecord rejects a derived record with incomplete tool provenance', () => {
  assertLineageValidationError(
    () => createArtifactRecord({
      sha256: 'b'.repeat(64),
      parentSha256: ROOT_SHA256,
      mediaType: 'application/json',
      toolRevision: null,
      optionsSha256: 'c'.repeat(64),
    }),
    /derived.*toolRevision/i,
  );
});

test('createArtifactRecord rejects an accessor without invoking it', () => {
  let accessed = false;
  const input = {
    parentSha256: null,
    mediaType: 'application/pdf',
    toolRevision: null,
    optionsSha256: null,
  };
  Object.defineProperty(input, 'sha256', {
    enumerable: true,
    get() {
      accessed = true;
      return ROOT_SHA256;
    },
  });

  assertLineageValidationError(
    () => createArtifactRecord(input),
    /accessor properties are not supported/i,
  );
  assert.equal(accessed, false);
});

test('createArtifactRecord rejects malformed hashes, extra keys, and incomplete derived options provenance', () => {
  const rootInput = {
    sha256: ROOT_SHA256,
    parentSha256: null,
    mediaType: 'application/pdf',
    toolRevision: null,
    optionsSha256: null,
  };

  assertLineageValidationError(
    () => createArtifactRecord({ ...rootInput, sha256: 'A'.repeat(64) }),
    /lowercase SHA-256/i,
  );
  assertLineageValidationError(
    () => createArtifactRecord({ ...rootInput, unknown: true }),
    /unknown key/i,
  );
  assertLineageValidationError(
    () => createArtifactRecord({
      ...rootInput,
      sha256: PAGE_ONE_SHA256,
      parentSha256: ROOT_SHA256,
      toolRevision: 'pdf-render@1',
      optionsSha256: null,
    }),
    /derived artifact optionsSha256/i,
  );
});

test('createFragment replays its complete strict-JSON identity and deep-freezes it', () => {
  const content = { label: 'Minimum side clearance', value: 20 };
  const locator = { kind: 'json_pointer', pointer: '/installation/sideClearanceMm' };
  const fragmentSha256 = fragmentIdentity({
    content,
    parentArtifactSha256: ROOT_SHA256,
    locator,
  });

  const fragment = createFragment({
    fragmentSha256,
    content,
    parentArtifactSha256: ROOT_SHA256,
    locator,
  });

  assert.deepEqual(fragment, {
    schemaVersion: 1,
    canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
    fragmentSha256,
    content,
    parentArtifactSha256: ROOT_SHA256,
    locator,
  });
  assert.equal(Object.isFrozen(fragment), true);
  assert.equal(Object.isFrozen(fragment.content), true);
  assert.equal(Object.isFrozen(fragment.locator), true);
  assert.throws(() => {
    fragment.locator.pointer = '/tampered';
  }, TypeError);
});

test('createFragment rejects a nested locator accessor before invoking it', () => {
  let getterReads = 0;
  const locator = { pointer: '/value' };
  Object.defineProperty(locator, 'kind', {
    enumerable: true,
    get() {
      getterReads += 1;
      return 'json_pointer';
    },
  });

  assertLineageValidationError(
    () => createFragment({
      fragmentSha256: 'e'.repeat(64),
      content: { value: 20 },
      parentArtifactSha256: ROOT_SHA256,
      locator,
    }),
    /accessor properties are not supported/i,
  );
  assert.equal(getterReads, 0);
});

test('createFragment rejects a declared fragment hash that does not replay content, parent, and locator', () => {
  assertLineageValidationError(
    () => createFragment({
      fragmentSha256: 'e'.repeat(64),
      content: { value: 20 },
      parentArtifactSha256: ROOT_SHA256,
      locator: { kind: 'json_pointer', pointer: '/value' },
    }),
    /complete canonical identity payload/i,
  );
});

test('createFragment accepts each closed locator with declared non-coercing index conventions', () => {
  const pdf = pdfLocator({ pageNumber: 1, renderedPageArtifactSha256: PAGE_ONE_SHA256 });
  pdf.rawCoordinates.values = [300.75, 400.25, 10.25, 20.5];
  const locators = [
    { kind: 'json_pointer', pointer: '/installation/sideClearanceMm' },
    { kind: 'html_selector', selectorLanguage: 'css', selector: 'table.specs > tr:nth-child(2)' },
    { kind: 'csv_cell', rowIndex: 0, columnIndex: 2 },
    { kind: 'text_span', startUtf16CodeUnit: 2, endUtf16CodeUnit: 9 },
    pdf,
  ];

  for (const [index, locator] of locators.entries()) {
    const fragment = fragmentFor({ content: { position: index }, locator });
    assert.deepEqual(fragment.locator, locator);
  }
});

test('createFragment rejects mixed locator keys and invalid PDF/index bounds without coercion', () => {
  const validPdf = pdfLocator({ pageNumber: 1, renderedPageArtifactSha256: PAGE_ONE_SHA256 });
  const { transform: ignoredTransform, ...missingTransform } = validPdf;
  const cases = [
    [
      { kind: 'json_pointer', pointer: '/value', rowIndex: 0 },
      /unknown key/i,
    ],
    [
      { ...validPdf, pageNumber: 0 },
      /pageNumber.*positive safe integer/i,
    ],
    [
      { ...validPdf, normalizedTopLeftBox: [300, 20, 10, 400] },
      /ordered non-zero-area/i,
    ],
    [
      { ...validPdf, renderedPixels: { width: 2000.5, height: 3000 } },
      /width.*positive safe integer/i,
    ],
    [
      { ...validPdf, rotationDegreesClockwise: 45 },
      /rotationDegreesClockwise/i,
    ],
    [
      missingTransform,
      /fragment locator is missing key: transform/i,
    ],
    [
      {
        ...validPdf,
        transform: {
          kind: 'crop_from_full_page',
          fullPageArtifactSha256: PAGE_ONE_SHA256,
        },
      },
      /normalizedCropBox/i,
    ],
    [
      { kind: 'csv_cell', rowIndex: 0.5, columnIndex: 2 },
      /rowIndex.*non-negative safe integer/i,
    ],
    [
      { kind: 'text_span', startUtf16CodeUnit: 9, endUtf16CodeUnit: 2 },
      /end-exclusive UTF-16 span/i,
    ],
  ];

  for (const [locator, pattern] of cases) {
    assertLineageValidationError(
      () => createFragment({
        fragmentSha256: 'e'.repeat(64),
        content: { value: 20 },
        parentArtifactSha256: ROOT_SHA256,
        locator,
      }),
      pattern,
    );
  }
});

test('validateEvidenceAnchors returns a frozen, permutation-stable complete closure for a witnessed multi-page proof', () => {
  const root = createArtifactRecord({
    sha256: ROOT_SHA256,
    parentSha256: null,
    mediaType: 'application/pdf',
    toolRevision: null,
    optionsSha256: null,
  });
  const pageOne = derivedArtifact({ sha256: PAGE_ONE_SHA256 });
  const pageTwo = derivedArtifact({ sha256: PAGE_TWO_SHA256 });
  const value = fragmentFor({
    content: { type: 'measurement', value: 20 },
    locator: pdfLocator({ pageNumber: 1, renderedPageArtifactSha256: PAGE_ONE_SHA256 }),
  });
  const legend = fragmentFor({
    content: { type: 'legend', label: 'minimum clearance' },
    locator: pdfLocator({ pageNumber: 2, renderedPageArtifactSha256: PAGE_TWO_SHA256 }),
  });
  const witness = fragmentFor({
    content: {
      kind: 'relation_witness',
      relationKind: 'diagram_legend',
      fromFragmentSha256: value.fragmentSha256,
      toFragmentSha256: legend.fragmentSha256,
    },
    locator: { kind: 'text_span', startUtf16CodeUnit: 0, endUtf16CodeUnit: 1 },
  });
  const anchors = [
    { anchorId: 'witness-anchor', role: 'reference_datum', fragmentSha256: witness.fragmentSha256 },
    { anchorId: 'legend-anchor', role: 'legend', fragmentSha256: legend.fragmentSha256 },
    { anchorId: 'value-anchor', role: 'value', fragmentSha256: value.fragmentSha256 },
  ];
  const relations = [{
    kind: 'diagram_legend',
    fromAnchorId: 'value-anchor',
    toAnchorId: 'legend-anchor',
    witnessAnchorIds: ['witness-anchor'],
  }];
  const input = {
    sourceArtifactSha256: ROOT_SHA256,
    anchors,
    relations,
    artifactRecords: [pageTwo, root, pageOne],
    fragments: [legend, witness, value],
  };

  const proof = validateEvidenceAnchors(input);
  const permutedProof = validateEvidenceAnchors({
    ...input,
    anchors: [...anchors].reverse(),
    relations: [...relations].reverse(),
    artifactRecords: [...input.artifactRecords].reverse(),
    fragments: [...input.fragments].reverse(),
  });

  assert.equal(proof.schemaVersion, 1);
  assert.equal(proof.canonicalizationVersion, CANONICAL_EVIDENCE_JSON_VERSION);
  assert.equal(proof.sourceArtifactSha256, ROOT_SHA256);
  assert.deepEqual(
    proof.artifactRecords.map((record) => record.sha256),
    [ROOT_SHA256, PAGE_ONE_SHA256, PAGE_TWO_SHA256],
  );
  assert.deepEqual(
    proof.fragments.map((fragment) => fragment.fragmentSha256),
    [value.fragmentSha256, legend.fragmentSha256, witness.fragmentSha256].sort(),
  );
  assert.deepEqual(
    proof.anchors.map((anchor) => anchor.anchorId),
    ['legend-anchor', 'value-anchor', 'witness-anchor'],
  );
  assert.deepEqual(proof.relations, [{
    kind: 'diagram_legend',
    fromAnchorId: 'value-anchor',
    toAnchorId: 'legend-anchor',
    witnessAnchorIds: ['witness-anchor'],
  }]);
  assert.equal(Object.isFrozen(proof), true);
  assert.equal(Object.isFrozen(proof.artifactRecords), true);
  assert.deepEqual(proof, permutedProof);
});

test('validateEvidenceAnchors rejects a structural proof without anchors', () => {
  const root = createArtifactRecord({
    sha256: ROOT_SHA256,
    parentSha256: null,
    mediaType: 'application/pdf',
    toolRevision: null,
    optionsSha256: null,
  });

  assertAnchorValidationError(
    () => validateEvidenceAnchors({
      sourceArtifactSha256: ROOT_SHA256,
      anchors: [],
      relations: [],
      artifactRecords: [root],
      fragments: [],
    }),
    /at least one anchor/i,
  );
});

test('validateEvidenceAnchors rejects a crop transform that names a same-root sibling instead of its full-page ancestor', () => {
  const cropSha256 = 'f'.repeat(64);
  const root = createArtifactRecord({
    sha256: ROOT_SHA256,
    parentSha256: null,
    mediaType: 'application/pdf',
    toolRevision: null,
    optionsSha256: null,
  });
  const fullPage = derivedArtifact({ sha256: PAGE_ONE_SHA256 });
  const wrongSameRootPage = derivedArtifact({ sha256: PAGE_TWO_SHA256 });
  const crop = derivedArtifact({
    sha256: cropSha256,
    parentSha256: PAGE_ONE_SHA256,
    toolRevision: 'crop-render@1',
  });
  const locator = {
    ...pdfLocator({ pageNumber: 1, renderedPageArtifactSha256: cropSha256 }),
    transform: {
      kind: 'crop_from_full_page',
      fullPageArtifactSha256: PAGE_TWO_SHA256,
      normalizedCropBox: [100.5, 200.25, 900.75, 800.5],
    },
  };
  const fragment = fragmentFor({
    content: { type: 'measurement', value: 20 },
    locator,
  });

  assertAnchorValidationError(
    () => validateEvidenceAnchors({
      sourceArtifactSha256: ROOT_SHA256,
      anchors: [{ anchorId: 'value-anchor', role: 'value', fragmentSha256: fragment.fragmentSha256 }],
      relations: [],
      artifactRecords: [root, fullPage, wrongSameRootPage, crop],
      fragments: [fragment],
    }),
    /distinct actual ancestor/i,
  );
});

test('validateEvidenceAnchors accepts a crop transform bound to its distinct full-page ancestor', () => {
  const cropSha256 = 'f'.repeat(64);
  const root = createArtifactRecord({
    sha256: ROOT_SHA256,
    parentSha256: null,
    mediaType: 'application/pdf',
    toolRevision: null,
    optionsSha256: null,
  });
  const fullPage = derivedArtifact({ sha256: PAGE_ONE_SHA256 });
  const crop = derivedArtifact({
    sha256: cropSha256,
    parentSha256: PAGE_ONE_SHA256,
    toolRevision: 'crop-render@1',
  });
  const fragment = fragmentFor({
    content: { value: 20 },
    locator: {
      ...pdfLocator({ pageNumber: 1, renderedPageArtifactSha256: cropSha256 }),
      rotationDegreesClockwise: 90,
      transform: {
        kind: 'crop_from_full_page',
        fullPageArtifactSha256: PAGE_ONE_SHA256,
        normalizedCropBox: [100.5, 200.25, 900.75, 800.5],
      },
    },
  });

  const proof = validateEvidenceAnchors({
    sourceArtifactSha256: ROOT_SHA256,
    anchors: [{ anchorId: 'value-anchor', role: 'value', fragmentSha256: fragment.fragmentSha256 }],
    relations: [],
    artifactRecords: [crop, root, fullPage],
    fragments: [fragment],
  });

  assert.deepEqual(
    proof.artifactRecords.map((record) => record.sha256),
    [ROOT_SHA256, PAGE_ONE_SHA256, cropSha256],
  );
  assert.equal(proof.fragments[0].locator.rotationDegreesClockwise, 90);
});

test('validateEvidenceAnchors rejects tampered fragment content or locator during identity replay', () => {
  const root = createArtifactRecord({
    sha256: ROOT_SHA256,
    parentSha256: null,
    mediaType: 'application/json',
    toolRevision: null,
    optionsSha256: null,
  });
  const fragment = fragmentFor({
    content: { value: 20 },
    locator: { kind: 'json_pointer', pointer: '/value' },
  });
  const inputFor = (tamperedFragment) => ({
    sourceArtifactSha256: ROOT_SHA256,
    anchors: [{ anchorId: 'value-anchor', role: 'value', fragmentSha256: fragment.fragmentSha256 }],
    relations: [],
    artifactRecords: [root],
    fragments: [tamperedFragment],
  });

  assertAnchorValidationError(
    () => validateEvidenceAnchors(inputFor({ ...fragment, content: { value: 21 } })),
    /complete canonical identity payload/i,
  );
  assertAnchorValidationError(
    () => validateEvidenceAnchors(inputFor({
      ...fragment,
      locator: { kind: 'json_pointer', pointer: '/different-value' },
    })),
    /complete canonical identity payload/i,
  );
});

test('validateEvidenceAnchors binds valid artifact metadata changes in normalized proof content without asserting raw-byte replay', () => {
  const root = createArtifactRecord({
    sha256: ROOT_SHA256,
    parentSha256: null,
    mediaType: 'application/pdf',
    toolRevision: null,
    optionsSha256: null,
  });
  const fragment = fragmentFor({
    content: { value: 20 },
    locator: pdfLocator({ pageNumber: 1, renderedPageArtifactSha256: PAGE_ONE_SHA256 }),
  });
  const proofFor = (pageRecord) => validateEvidenceAnchors({
    sourceArtifactSha256: ROOT_SHA256,
    anchors: [{ anchorId: 'value-anchor', role: 'value', fragmentSha256: fragment.fragmentSha256 }],
    relations: [],
    artifactRecords: [root, pageRecord],
    fragments: [fragment],
  });
  const first = proofFor(derivedArtifact({
    sha256: PAGE_ONE_SHA256,
    toolRevision: 'pdf-render@1',
  }));
  const second = proofFor(derivedArtifact({
    sha256: PAGE_ONE_SHA256,
    toolRevision: 'pdf-render@2',
  }));

  assert.equal(first.artifactRecords[1].toolRevision, 'pdf-render@1');
  assert.equal(second.artifactRecords[1].toolRevision, 'pdf-render@2');
  assert.notEqual(canonicalEvidenceJson(first), canonicalEvidenceJson(second));
});

test('validateEvidenceAnchors rejects absent and endpoint-mismatched relation witnesses', () => {
  const fixture = witnessedPairFixture();
  assertAnchorValidationError(
    () => validateEvidenceAnchors({
      ...fixture.input,
      relations: [{
        ...fixture.input.relations[0],
        witnessAnchorIds: [],
      }],
    }),
    /witnessAnchorIds must be a non-empty array/i,
  );
  assertAnchorValidationError(
    () => validateEvidenceAnchors({
      ...fixture.input,
      relations: [{
        ...fixture.input.relations[0],
        witnessAnchorIds: ['value-anchor'],
      }],
    }),
    /witness anchor must be distinct from its endpoints/i,
  );
  assertAnchorValidationError(
    () => validateEvidenceAnchors({
      ...fixture.input,
      relations: [{
        ...fixture.input.relations[0],
        fromAnchorId: 'legend-anchor',
        toAnchorId: 'value-anchor',
      }],
    }),
    /exact ordered endpoint fragments/i,
  );
  assertAnchorValidationError(
    () => validateEvidenceAnchors({
      ...fixture.input,
      relations: [{ ...fixture.input.relations[0], kind: 'same_table_row' }],
    }),
    /relation kind does not match/i,
  );

  const mismatchedWitness = fragmentFor({
    content: {
      kind: 'relation_witness',
      relationKind: 'diagram_legend',
      fromFragmentSha256: fixture.value.fragmentSha256,
      toFragmentSha256: 'f'.repeat(64),
    },
    locator: { kind: 'text_span', startUtf16CodeUnit: 0, endUtf16CodeUnit: 1 },
  });
  assertAnchorValidationError(
    () => validateEvidenceAnchors({
      ...fixture.input,
      anchors: fixture.input.anchors.map((anchor) => (
        anchor.anchorId === 'witness-anchor'
          ? { ...anchor, fragmentSha256: mismatchedWitness.fragmentSha256 }
          : anchor
      )),
      fragments: [fixture.value, fixture.legend, mismatchedWitness],
    }),
    /exact ordered endpoint fragments/i,
  );

  const unrelatedFragment = fragmentFor({
    content: { label: 'an unrelated existing fragment' },
    locator: { kind: 'text_span', startUtf16CodeUnit: 0, endUtf16CodeUnit: 1 },
  });
  assertAnchorValidationError(
    () => validateEvidenceAnchors({
      ...fixture.input,
      anchors: fixture.input.anchors.map((anchor) => (
        anchor.anchorId === 'witness-anchor'
          ? { ...anchor, fragmentSha256: unrelatedFragment.fragmentSha256 }
          : anchor
      )),
      fragments: [fixture.value, fixture.legend, unrelatedFragment],
    }),
    /relation witness .*content.*(unknown key|missing key)/i,
  );
});

test('validateEvidenceAnchors rejects an unwitnessed CSV value joined to a cross-page legend', () => {
  const fixture = witnessedPairFixture({
    valueLocator: { kind: 'csv_cell', rowIndex: 4, columnIndex: 2 },
  });

  assertAnchorValidationError(
    () => validateEvidenceAnchors({
      ...fixture.input,
      anchors: fixture.input.anchors.filter((anchor) => anchor.anchorId !== 'witness-anchor'),
      relations: [],
    }),
    /require witnessed connectivity/i,
  );
});

test('validateEvidenceAnchors rejects missing parents, cycles, unrelated roots, and a non-root source artifact', () => {
  const root = createArtifactRecord({
    sha256: ROOT_SHA256,
    parentSha256: null,
    mediaType: 'application/json',
    toolRevision: null,
    optionsSha256: null,
  });
  const fragment = fragmentFor({
    content: { value: 20 },
    locator: { kind: 'json_pointer', pointer: '/value' },
  });
  const base = {
    sourceArtifactSha256: ROOT_SHA256,
    anchors: [{ anchorId: 'value-anchor', role: 'value', fragmentSha256: fragment.fragmentSha256 }],
    relations: [],
    artifactRecords: [root],
    fragments: [fragment],
  };
  const missingParent = derivedArtifact({
    sha256: PAGE_ONE_SHA256,
    parentSha256: 'e'.repeat(64),
  });
  const cycleLeft = derivedArtifact({ sha256: PAGE_ONE_SHA256, parentSha256: PAGE_TWO_SHA256 });
  const cycleRight = derivedArtifact({ sha256: PAGE_TWO_SHA256, parentSha256: PAGE_ONE_SHA256 });
  const unrelatedRoot = createArtifactRecord({
    sha256: 'e'.repeat(64),
    parentSha256: null,
    mediaType: 'application/json',
    toolRevision: null,
    optionsSha256: null,
  });
  const page = derivedArtifact({ sha256: PAGE_ONE_SHA256 });
  const pageFragment = fragmentFor({
    content: { value: 20 },
    parentArtifactSha256: PAGE_ONE_SHA256,
    locator: { kind: 'json_pointer', pointer: '/value' },
  });

  assertAnchorValidationError(
    () => validateEvidenceAnchors({ ...base, artifactRecords: [root, missingParent] }),
    /parent does not resolve/i,
  );
  assertAnchorValidationError(
    () => validateEvidenceAnchors({ ...base, artifactRecords: [root, cycleLeft, cycleRight] }),
    /ancestry has a cycle/i,
  );
  assertAnchorValidationError(
    () => validateEvidenceAnchors({ ...base, artifactRecords: [root, unrelatedRoot] }),
    /unrelated source root/i,
  );
  assertAnchorValidationError(
    () => validateEvidenceAnchors({
      ...base,
      sourceArtifactSha256: PAGE_ONE_SHA256,
      artifactRecords: [root, page],
      fragments: [pageFragment],
      anchors: [{ anchorId: 'value-anchor', role: 'value', fragmentSha256: pageFragment.fragmentSha256 }],
    }),
    /must identify a root artifact/i,
  );
});

test('validateEvidenceAnchors rejects every unresolved proof reference', () => {
  const fixture = witnessedPairFixture();
  const missingParentFragment = fragmentFor({
    content: { type: 'measurement', value: 20 },
    parentArtifactSha256: 'e'.repeat(64),
    locator: { kind: 'json_pointer', pointer: '/value' },
  });
  const missingRenderedFragment = fragmentFor({
    content: { type: 'measurement', value: 20 },
    locator: pdfLocator({ pageNumber: 1, renderedPageArtifactSha256: 'f'.repeat(64) }),
  });
  const cases = [
    [
      { ...fixture.input, sourceArtifactSha256: 'f'.repeat(64) },
      /sourceArtifactSha256 does not resolve/i,
    ],
    [
      {
        ...fixture.input,
        anchors: [{ anchorId: 'value-anchor', role: 'value', fragmentSha256: missingParentFragment.fragmentSha256 }],
        relations: [],
        fragments: [missingParentFragment],
      },
      /parentArtifactSha256 does not resolve/i,
    ],
    [
      {
        ...fixture.input,
        anchors: [{ anchorId: 'value-anchor', role: 'value', fragmentSha256: missingRenderedFragment.fragmentSha256 }],
        relations: [],
        fragments: [missingRenderedFragment],
      },
      /renderedPageArtifactSha256 does not resolve/i,
    ],
    [
      {
        ...fixture.input,
        anchors: fixture.input.anchors.map((anchor, index) => (
          index === 0 ? { ...anchor, fragmentSha256: 'f'.repeat(64) } : anchor
        )),
      },
      /anchors\[0\] fragmentSha256 does not resolve/i,
    ],
    [
      {
        ...fixture.input,
        relations: [{ ...fixture.input.relations[0], toAnchorId: 'missing-anchor' }],
      },
      /endpoint anchor does not resolve/i,
    ],
    [
      {
        ...fixture.input,
        relations: [{ ...fixture.input.relations[0], witnessAnchorIds: ['missing-anchor'] }],
      },
      /witness anchor does not resolve/i,
    ],
  ];

  for (const [input, pattern] of cases) {
    assertAnchorValidationError(() => validateEvidenceAnchors(input), pattern);
  }
});

test('validateEvidenceAnchors rejects duplicate hash-indexed records, fragments, anchor IDs, and relation tuples', () => {
  const fixture = witnessedPairFixture();

  assertAnchorValidationError(
    () => validateEvidenceAnchors({
      ...fixture.input,
      artifactRecords: [...fixture.input.artifactRecords, fixture.root],
    }),
    /duplicate sha256/i,
  );
  assertAnchorValidationError(
    () => validateEvidenceAnchors({
      ...fixture.input,
      fragments: [...fixture.input.fragments, fixture.value],
    }),
    /duplicate fragmentSha256/i,
  );
  assertAnchorValidationError(
    () => validateEvidenceAnchors({
      ...fixture.input,
      anchors: [...fixture.input.anchors, fixture.input.anchors[0]],
    }),
    /duplicate anchorId/i,
  );
  assertAnchorValidationError(
    () => validateEvidenceAnchors({
      ...fixture.input,
      relations: [...fixture.input.relations, fixture.input.relations[0]],
    }),
    /duplicate kind\/from\/to tuple/i,
  );
});

test('validateEvidenceAnchors rejects unsupported record versions and anchor/relation allowlist values', () => {
  const fixture = witnessedPairFixture();

  assertAnchorValidationError(
    () => validateEvidenceAnchors({
      ...fixture.input,
      artifactRecords: [
        { ...fixture.root, schemaVersion: 2 },
        fixture.pageOne,
        fixture.pageTwo,
      ],
    }),
    /schemaVersion is unsupported/i,
  );
  assertAnchorValidationError(
    () => validateEvidenceAnchors({
      ...fixture.input,
      fragments: [
        { ...fixture.value, canonicalizationVersion: 'fit-evidence-json-v3-2' },
        fixture.legend,
        fixture.witness,
      ],
    }),
    /canonicalizationVersion is unsupported/i,
  );
  assertAnchorValidationError(
    () => validateEvidenceAnchors({
      ...fixture.input,
      anchors: [
        { ...fixture.input.anchors[0], role: 'relation_witness' },
        ...fixture.input.anchors.slice(1),
      ],
    }),
    /role is unsupported/i,
  );
  assertAnchorValidationError(
    () => validateEvidenceAnchors({
      ...fixture.input,
      relations: [{ ...fixture.input.relations[0], kind: 'cross_page_legend' }],
    }),
    /kind is unsupported/i,
  );
});

test('validateEvidenceAnchors structurally accepts every closed relation kind only with its exact witness payload', () => {
  const relationKinds = [
    'same_table_row',
    'diagram_legend',
    'explicit_continuation',
    'exact_model_scope',
    'condition_applies',
  ];

  for (const kind of relationKinds) {
    const fixture = witnessedPairFixture();
    const witness = fragmentFor({
      content: {
        kind: 'relation_witness',
        relationKind: kind,
        fromFragmentSha256: fixture.value.fragmentSha256,
        toFragmentSha256: fixture.legend.fragmentSha256,
      },
      locator: { kind: 'text_span', startUtf16CodeUnit: 0, endUtf16CodeUnit: 1 },
    });
    const proof = validateEvidenceAnchors({
      ...fixture.input,
      anchors: fixture.input.anchors.map((anchor) => (
        anchor.anchorId === 'witness-anchor'
          ? { ...anchor, fragmentSha256: witness.fragmentSha256 }
          : anchor
      )),
      relations: [{ ...fixture.input.relations[0], kind }],
      fragments: [fixture.value, fixture.legend, witness],
    });
    assert.equal(proof.relations[0].kind, kind);
  }
});

test('validateEvidenceAnchors normalizes multiple relation and witness-set permutations deterministically', () => {
  const fixture = witnessedPairFixture();
  const secondLegendWitness = fragmentFor({
    content: {
      kind: 'relation_witness',
      relationKind: 'diagram_legend',
      fromFragmentSha256: fixture.value.fragmentSha256,
      toFragmentSha256: fixture.legend.fragmentSha256,
    },
    locator: { kind: 'text_span', startUtf16CodeUnit: 1, endUtf16CodeUnit: 2 },
  });
  const unit = fragmentFor({
    content: { type: 'unit', value: 'mm' },
    locator: { kind: 'text_span', startUtf16CodeUnit: 2, endUtf16CodeUnit: 4 },
  });
  const unitWitness = fragmentFor({
    content: {
      kind: 'relation_witness',
      relationKind: 'same_table_row',
      fromFragmentSha256: fixture.value.fragmentSha256,
      toFragmentSha256: unit.fragmentSha256,
    },
    locator: { kind: 'text_span', startUtf16CodeUnit: 4, endUtf16CodeUnit: 5 },
  });
  const anchors = [
    ...fixture.input.anchors,
    { anchorId: 'witness-two', role: 'reference_datum', fragmentSha256: secondLegendWitness.fragmentSha256 },
    { anchorId: 'unit-anchor', role: 'unit', fragmentSha256: unit.fragmentSha256 },
    { anchorId: 'unit-witness', role: 'reference_datum', fragmentSha256: unitWitness.fragmentSha256 },
  ];
  const relations = [
    {
      ...fixture.input.relations[0],
      witnessAnchorIds: ['witness-two', 'witness-anchor'],
    },
    {
      kind: 'same_table_row',
      fromAnchorId: 'value-anchor',
      toAnchorId: 'unit-anchor',
      witnessAnchorIds: ['unit-witness'],
    },
  ];
  const input = {
    ...fixture.input,
    anchors,
    relations,
    fragments: [...fixture.input.fragments, secondLegendWitness, unit, unitWitness],
  };

  const first = validateEvidenceAnchors(input);
  const second = validateEvidenceAnchors({
    ...input,
    anchors: [...anchors].reverse(),
    relations: [...relations].reverse(),
    artifactRecords: [...input.artifactRecords].reverse(),
    fragments: [...input.fragments].reverse(),
  });

  assert.deepEqual(first, second);
  assert.deepEqual(first.relations[0].witnessAnchorIds, ['witness-anchor', 'witness-two']);
  assert.deepEqual(first.relations.map((relation) => relation.kind), ['diagram_legend', 'same_table_row']);
});

test('validateEvidenceAnchors rejects a rendered PDF page from a different source root', () => {
  const otherRootSha256 = 'e'.repeat(64);
  const renderedOtherRootSha256 = 'f'.repeat(64);
  const root = createArtifactRecord({
    sha256: ROOT_SHA256,
    parentSha256: null,
    mediaType: 'application/pdf',
    toolRevision: null,
    optionsSha256: null,
  });
  const otherRoot = createArtifactRecord({
    sha256: otherRootSha256,
    parentSha256: null,
    mediaType: 'application/pdf',
    toolRevision: null,
    optionsSha256: null,
  });
  const foreignRenderedPage = derivedArtifact({
    sha256: renderedOtherRootSha256,
    parentSha256: otherRootSha256,
  });
  const fragment = fragmentFor({
    content: { value: 20 },
    locator: pdfLocator({ pageNumber: 1, renderedPageArtifactSha256: renderedOtherRootSha256 }),
  });

  assertAnchorValidationError(
    () => validateEvidenceAnchors({
      sourceArtifactSha256: ROOT_SHA256,
      anchors: [{ anchorId: 'value-anchor', role: 'value', fragmentSha256: fragment.fragmentSha256 }],
      relations: [],
      artifactRecords: [root, otherRoot, foreignRenderedPage],
      fragments: [fragment],
    }),
    /unrelated source root/i,
  );
});

test('validateEvidenceAnchors rejects accessor, prototype, and sparse-array hazards before reading them', () => {
  const fixture = witnessedPairFixture();
  let getterReads = 0;
  const accessorInput = {
    sourceArtifactSha256: fixture.input.sourceArtifactSha256,
    relations: fixture.input.relations,
    artifactRecords: fixture.input.artifactRecords,
    fragments: fixture.input.fragments,
  };
  Object.defineProperty(accessorInput, 'anchors', {
    enumerable: true,
    get() {
      getterReads += 1;
      return fixture.input.anchors;
    },
  });
  const prototypeInput = Object.assign(Object.create({ inherited: true }), fixture.input);
  const sparseRelations = [];
  sparseRelations[1] = fixture.input.relations[0];

  assertAnchorValidationError(
    () => validateEvidenceAnchors(accessorInput),
    /accessor properties are not supported/i,
  );
  assert.equal(getterReads, 0);
  assertAnchorValidationError(
    () => validateEvidenceAnchors(prototypeInput),
    /non-plain objects are not supported/i,
  );
  assertAnchorValidationError(
    () => validateEvidenceAnchors({ ...fixture.input, relations: sparseRelations }),
    /sparse array entry/i,
  );
});

test('validateEvidenceAnchors detaches its frozen proof from later caller mutation', () => {
  const fixture = witnessedPairFixture();
  const input = {
    ...fixture.input,
    anchors: fixture.input.anchors.map((anchor) => ({ ...anchor })),
    relations: fixture.input.relations.map((relation) => ({
      ...relation,
      witnessAnchorIds: [...relation.witnessAnchorIds],
    })),
    artifactRecords: [...fixture.input.artifactRecords],
    fragments: [...fixture.input.fragments],
  };
  const proof = validateEvidenceAnchors(input);
  const beforeMutation = canonicalEvidenceJson(proof);

  input.anchors[0].role = 'subject';
  input.relations[0].witnessAnchorIds.push('value-anchor');
  input.artifactRecords.reverse();
  input.fragments.reverse();

  assert.equal(canonicalEvidenceJson(proof), beforeMutation);
  assert.equal(Object.isFrozen(proof.anchors[0]), true);
  assert.equal(Object.isFrozen(proof.relations[0].witnessAnchorIds), true);
});
