import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

import {
  parseCanaryCliArguments,
  prepareEvidenceCanaryInputs,
  writeImmutableCandidateObject,
} from '../../scripts/architecture-v3/prepare-evidence-canary-inputs.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const selectionPath = 'data/architecture-v3/research/selection.json';
const checkpointObservedAt = '2026-09-14T13:41:47.237Z';
const targets = [
  {
    targetId: 'recovery_target_c4295ee36eb7c14ebebe7c87',
    canonicalProductId: 'fixture-bdf', brand: 'Beko', model: 'BDF1620W', category: 'dishwasher', pages: [1, 2],
  },
  {
    targetId: 'recovery_target_7638b53459b92a54af9a6109',
    canonicalProductId: 'fixture-bdp', brand: 'Beko', model: 'BDP810W', category: 'dryer', pages: [1, 2],
  },
  {
    targetId: 'recovery_target_5f8e2af40b047d20e6ef4573',
    canonicalProductId: 'fixture-ewf', brand: 'Electrolux', model: 'EWF7524CDWA', category: 'washing_machine', pages: [1],
  },
];

const frozenPaths = {
  acceptanceBundle: 'data/architecture-v2/reviews/automated/historical-evidence-recovery-acceptance-bundle.json',
  targetState: 'data/architecture-v2/reviews/automated/historical-evidence-target-state.json',
  recoveryPolicy: 'data/architecture-v2/policies/historical-evidence-recovery-policy.json',
  artifactLineage: 'src/domain/architecture-v3/artifact-lineage.mjs',
  evidenceAnchors: 'src/domain/architecture-v3/evidence-anchors.mjs',
  legacyAdapter: 'src/domain/architecture-v3/legacy-semantics-adapter.mjs',
  sourceVerifier: 'src/domain/evidence-source-verifier.mjs',
  historicalAudit: 'src/domain/historical-evidence-recovery-audit.mjs',
};

const runtimePaths = {
  evidenceResolutionPolicy: 'data/architecture-v2/policies/evidence-resolution-policy.json',
  semanticsModule: 'src/domain/architecture-v3/semantics.mjs',
  fieldDictionary: 'data/architecture-v2/policies/product-data-field-rights-dictionary.json',
  installationMatrix: 'data/architecture-v2/generated/installation-evidence-applicability-matrix.json',
  semanticsOverlay: 'data/architecture-v3/policies/semantics-overlay.json',
};

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function jsonBytes(value) {
  return Buffer.from(JSON.stringify(value, null, 2));
}

async function writeBytes(root, relativePath, bytes) {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  return path;
}

function pngFixture(salt, width = 10, height = 20) {
  const bytes = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes, 0);
  bytes[8] = salt;
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function mineruPage(text) {
  return [{
    type: 'paragraph',
    content: { content: text },
    bbox: [1, 1, 999, 999],
  }];
}

function imagePage() {
  return [{
    type: 'image',
    content: {
      image_source: { path: 'images/fixture-diagram.jpg' },
      content: '',
      image_caption: [{ type: 'text', content: 'Dimensions' }],
      image_footnote: [],
    },
    bbox: [10, 10, 990, 990],
  }];
}

function claim(field, mm, targetId) {
  return {
    field,
    value: { kind: 'fixed', mm },
    sourceLabel: field,
    sourceAxisOrder: ['width'],
    sourceUnit: 'mm',
    measurementScope: 'product_closed_external',
    includesDoor: null,
    includesHandle: null,
    page: 1,
    fragmentSha256: sha256(`${targetId}:${field}`),
    bbox: [1, 1, 999, 999],
  };
}

function descriptor(path, bytes) {
  return { path, sha256: sha256(bytes) };
}

async function copyFrozenInputs(root, acceptanceBundleBytes) {
  const descriptors = {};
  for (const [name, path] of Object.entries(frozenPaths)) {
    const bytes = name === 'acceptanceBundle'
      ? acceptanceBundleBytes
      : await readFile(join(repositoryRoot, path));
    await writeBytes(root, path, bytes);
    descriptors[name] = descriptor(path, bytes);
  }
  const runtimeDescriptors = {};
  for (const [name, path] of Object.entries(runtimePaths)) {
    const bytes = await readFile(join(repositoryRoot, path));
    await writeBytes(root, path, bytes);
    runtimeDescriptors[name] = descriptor(path, bytes);
  }
  return { descriptors, runtimeDescriptors };
}

async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), 'real-canary-inputs-'));
  const repo = join(root, 'repo');
  const storage = join(root, 'storage');
  await mkdir(repo, { recursive: true });
  await mkdir(storage, { recursive: true });

  // Synthetic bytes exercise orchestration only; they are not proof of a real PDF or renderer.
  const entries = [];
  const targetSources = [];
  const checkpointSources = [];
  const attestedPages = [];
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const pdfBytes = Buffer.from(`%PDF-1.4 synthetic ${target.targetId}\n`, 'utf8');
    const document = target.model === 'BDF1620W'
      ? [mineruPage('BDF1620W dimensions Unpackaged Height 850 mm Height max 865 mm'), imagePage()]
      : target.model === 'BDP810W'
        ? [mineruPage('BDP810W dimensions Unpacked Height/Width/Depth: 846/597/589 mm'), [{
          type: 'table', bbox: [1, 1, 999, 999], content: {
            html: '<table><tr><td>W</td><td>D</td><td>H</td></tr><tr><td>597</td><td>568</td><td>846</td></tr></table>',
            table_caption: [{ type: 'text', content: 'Dimensions mm' }],
          },
        }]]
        : [mineruPage('EWF7524CDWA dimensions Total depth 575 mm; Add 20mm for the hose protrusion at the back; installation manual required')];
    const mineruBytes = jsonBytes(document);
    const pdfPath = `evidence/originals/${target.targetId}.pdf`;
    const jsonPath = `evidence/derived/${target.targetId}.json`;
    await writeBytes(storage, pdfPath, pdfBytes);
    await writeBytes(storage, jsonPath, mineruBytes);
    const claims = [
      claim('closedEnvelope.widthMm', 600, target.targetId),
      claim('closedEnvelope.heightMm', 850, target.targetId),
      claim('closedEnvelope.depthMm', 575, target.targetId),
    ];
    const source = {
      contentSha256: sha256(pdfBytes), objectPath: pdfPath, contentType: 'application/pdf', byteSize: pdfBytes.length,
      identity: { brand: target.brand, model: target.model, outcome: 'exact' },
      claims,
      derivedArtifact: {
        format: 'content_list_v2', parserName: 'MinerU', parserVersion: '3.4.4',
        modelRevision: 'bff20d4ae2bf202df9f45284b4d43681555a97ed', backend: 'hybrid-engine', method: 'auto',
        tableEnabled: true, formulaEnabled: false, sourcePdfSha256: sha256(pdfBytes),
        contentSha256: sha256(mineruBytes), objectPath: jsonPath, byteSize: mineruBytes.length, pageCount: document.length,
        profileId: 'hybrid-image-high-v1', effort: 'high', imageAnalysis: true, processedPages: target.pages,
        sourcePageCount: document.length,
      },
      verificationReceipt: {
        schemaVersion: 3, policyVersion: 'fixture-policy', manufacturerPolicyVersion: 'fixture-manufacturer',
        discoveryPolicyVersion: 'fixture-discovery', verifiedAt: checkpointObservedAt, bindingSha256: sha256(`receipt:${target.targetId}`),
      },
    };
    entries.push({
      targetId: target.targetId, canonicalProductId: target.canonicalProductId,
      brand: target.brand, model: target.model, category: target.category, sources: [source],
    });
    targetSources.push({ target, source, claims, document });
    const checkpointPageRows = [];
    for (const pageNumber of target.pages) {
      const pageBytes = pngFixture(index * 10 + pageNumber);
      const pagePath = `evidence/rendered/${target.targetId}-p${pageNumber}.png`;
      await writeBytes(storage, pagePath, pageBytes);
      const row = {
        pageNumber, rotationDegreesClockwise: 0, renderedPixels: { width: 10, height: 20 },
        contentSha256: sha256(pageBytes), objectPath: pagePath,
      };
      checkpointPageRows.push(row);
      attestedPages.push({
        targetId: target.targetId, model: target.model, sourcePdfSha256: source.contentSha256,
        sourceObjectPath: source.objectPath, pageNumber, expectedContentSha256: row.contentSha256,
        actualContentSha256: row.contentSha256, matchesExpected: true,
        renderedPixels: row.renderedPixels, rotationDegreesClockwise: 0,
      });
    }
    checkpointSources.push({
      targetId: target.targetId, brand: target.brand, model: target.model, category: target.category,
      owner: {
        bundleEntryPointer: `/entries/${index}`, sourcePointer: `/entries/${index}/sources/0`,
        receiptPointer: `/entries/${index}/sources/0/verificationReceipt`,
      },
      original: {
        sourcePdfSha256: source.contentSha256, sourceObjectPath: source.objectPath, sourceByteSize: source.byteSize,
        selectedMineruJsonSha256: source.derivedArtifact.contentSha256,
        selectedMineruJsonObjectPath: source.derivedArtifact.objectPath,
        selectedMineruJsonByteSize: source.derivedArtifact.byteSize,
        inspection: { pageCount: document.length, schemaVersion: 1, format: 'content_list_v2' },
      },
      renderedPages: checkpointPageRows,
    });
  }
  const bundle = { entries };
  const bundleBytes = jsonBytes(bundle);
  const { descriptors: frozenInputs, runtimeDescriptors: runtimeBindings } = await copyFrozenInputs(repo, bundleBytes);

  const checkpoint = {
    schemaVersion: 1, kind: 'fixture_checkpoint', observedAt: checkpointObservedAt,
    acceptanceBundleSha256: frozenInputs.acceptanceBundle.sha256, publicationStatus: 'NOT_EVALUATED_CANDIDATE_ONLY',
    replay: {
      method: 'fixtureHistoricalReplay',
      audit: {
        outcomes: targetSources.map(({ target, source }) => ({
          targetId: target.targetId, sourcePdfSha256: source.contentSha256, status: 'passed', failureCode: null,
        })),
        summary: { entries: 3, sources: 3, passed: 3, failed: 0 },
      },
    },
    sources: checkpointSources,
  };
  const checkpointBytes = jsonBytes(checkpoint);
  const checkpointPath = 'inputs/checkpoint.json';
  await writeBytes(storage, checkpointPath, checkpointBytes);
  const attestation = {
    schemaVersion: 1, kind: 'fixture_render_attestation', status: 'SUCCEEDED',
    renderer: {
      executablePath: '/fixture/pdftoppm', binarySha256: sha256('fixture-pdftoppm'),
      versionOutput: 'pdftoppm version 26.06.0 fixture',
      commandOptions: { format: 'png', resolutionDpi: 150, pageSelection: 'one_page_per_invocation' },
    },
    renderedPages: attestedPages, typedGap: null, publicationStatus: 'NOT_EVALUATED_CANDIDATE_ONLY',
  };
  const attestationBytes = jsonBytes(attestation);
  const attestationPath = 'inputs/render-attestation.json';
  await writeBytes(storage, attestationPath, attestationBytes);

  const bdf = targetSources[0];
  const candidateBytes = jsonBytes([mineruPage('BDF1620W dimensions'), imagePage()]);
  const candidatePath = 'inputs/bdf-parallel.json';
  await writeBytes(storage, candidatePath, candidateBytes);
  const candidateRecord = {
    schemaVersion: 1, kind: 'fixture_bdf_local_mineru_attempt', attemptedAt: '2026-09-14T13:57:59.035Z',
    targetId: bdf.target.targetId, model: bdf.target.model, sourcePdfSha256: bdf.source.contentSha256,
    sourceObjectPath: bdf.source.objectPath, requestedProfile: 'hybrid-image-high-v1', selectedPages: [2], sourcePageCount: 2,
    cache: false, outputDisposition: 'PARALLEL_CANDIDATE_NOT_SELECTED', readjudication: 'NOT_PERFORMED',
    publicationStatus: 'NOT_EVALUATED_CANDIDATE_ONLY', status: 'SUCCEEDED', typedGap: null,
    result: {
      candidateJsonSha256: sha256(candidateBytes), candidateJsonObjectPath: candidatePath, byteSize: candidateBytes.length,
      processing: { strategy: 'selected_page_ranges', ranges: [[1, 1]], selectedPages: [2], sourcePageCount: 2 },
      profile: { parserName: 'MinerU', parserVersion: '3.4.4', modelRevision: 'bff20d4ae2bf202df9f45284b4d43681555a97ed', backend: 'hybrid-engine', method: 'auto', profileId: 'hybrid-image-high-v1', effort: 'high', imageAnalysis: true },
      inspection: { format: 'content_list_v2', schemaVersion: 1, pageCount: 2, pageTwoFragmentTypes: ['image'] },
    },
  };
  const candidateRecordBytes = jsonBytes(candidateRecord);
  const candidateRecordPath = 'inputs/bdf-parallel-record.json';
  await writeBytes(storage, candidateRecordPath, candidateRecordBytes);

  const selection = {
    schemaVersion: 3, manifestId: 'fixture-selection', preparationContract: 'raw_source_observations_v1', frozenInputs, runtimeBindings,
    initialReplayRenderCheckpoint: {
      kind: checkpoint.kind, objectPath: checkpointPath, sha256: sha256(checkpointBytes), observedAt: checkpointObservedAt,
      scope: 'three_explicit_selected_source_owners_only', publicationStatus: 'NOT_EVALUATED_CANDIDATE_ONLY',
    },
    renderingAttestation: {
      kind: attestation.kind, objectPath: attestationPath, sha256: sha256(attestationBytes), status: 'SUCCEEDED',
      renderer: { binarySha256: attestation.renderer.binarySha256, version: '26.06.0', format: 'png', resolutionDpi: 150 },
    },
    targets: targetSources.map(({ target, source, claims }, index) => ({
      targetId: target.targetId, canonicalProductId: target.canonicalProductId, brand: target.brand, model: target.model, category: target.category,
      bundleEntryPointer: `/entries/${index}`, sourcePointer: `/entries/${index}/sources/0`, receiptPointer: `/entries/${index}/sources/0/verificationReceipt`,
      sourcePdfSha256: source.contentSha256, selectedMineruJsonSha256: source.derivedArtifact.contentSha256,
      renderPages: target.pages,
      modelScopeBlocks: [{ pointer: '/0/0', pageNumber: 1, expectedText: target.model }],
      contextBlocks: [{ pointer: '/0/0', pageNumber: 1, expectedText: 'dimensions' }],
      valueBlocks: [{ pointer: '/0/0', pageNumber: 1, expectedText: 'dimensions' },
        ...(target.model === 'BDP810W' ? [{ pointer: '/1/0', pageNumber: 2, expectedText: '568' }] : [])],
      ...(target.model === 'BDF1620W' ? {
        visualCandidateBlocks: [{ pointer: '/1/0', pageNumber: 2, expectedText: 'Dimensions', observationsToPreserve: ['fixture visual note'] }],
        parallelCandidateConversions: [{
          recordObjectPath: candidateRecordPath, recordSha256: sha256(candidateRecordBytes),
          candidateJsonObjectPath: candidatePath, candidateJsonSha256: sha256(candidateBytes),
          attemptedAt: candidateRecord.attemptedAt, profileId: 'hybrid-image-high-v1', selectedPages: [2], sourcePageCount: 2,
          cache: false, status: 'SUCCEEDED_WITH_DIAGRAM_LABELS_UNREADABLE', typedGap: 'DIAGRAM_LABELS_UNREADABLE',
          attemptRecordStatus: 'SUCCEEDED', attemptRecordTypedGap: null,
          expectedProcessing: { strategy: 'selected_page_ranges', ranges: [[1, 1]], selectedPages: [2], sourcePageCount: 2 },
          readjudication: 'NOT_PERFORMED', publicationStatus: 'NOT_EVALUATED_CANDIDATE_ONLY',
          selectionDisposition: 'PARALLEL_CANDIDATE_NOT_SELECTED',
        }],
      } : {}),
      fields: claims.map((item, claimIndex) => ({
        legacyClaimPointer: `/entries/${index}/sources/0/claims/${claimIndex}`, field: item.field,
      })),
      semanticNotes: ['synthetic fixture only'],
    })),
  };
  await writeBytes(repo, selectionPath, jsonBytes(selection));
  return { root, repo, storage, targetSources };
}

async function closeFixture(fixture) {
  await rm(fixture.root, { recursive: true, force: true });
}

function prepareArgs(fixture, options = {}) {
  return {
    repositoryRoot: fixture.repo,
    storageRoot: fixture.storage,
    selectionPath,
    ...options,
  };
}

test('requires an explicit bounded CLI selection and storage root', () => {
  assert.throws(() => parseCanaryCliArguments([]), /--selection/i);
  assert.throws(() => parseCanaryCliArguments(['--selection', selectionPath]), /--storage-root/i);
  assert.throws(() => parseCanaryCliArguments(['--selection', selectionPath, '--storage-root', '/tmp/x', '--bad']), /unknown argument/i);
  assert.deepEqual(parseCanaryCliArguments([
    '--check-only', '--selection', selectionPath, '--storage-root', '/tmp/fixture',
  ]), { checkOnly: true, selectionPath, storageRoot: '/tmp/fixture' });
});

test('prepares only a full valid fixture, keeps raw blocks exact, and reuses the same report', async (t) => {
  const fixture = await makeFixture();
  t.after(() => closeFixture(fixture));
  const bdfPdfPath = join(fixture.storage, fixture.targetSources[0].source.objectPath);
  const originalPdf = await readFile(bdfPdfPath);

  const checked = await prepareEvidenceCanaryInputs(prepareArgs(fixture, { checkOnly: true }));
  assert.equal(checked.status, 'checked');
  assert.equal(checked.counts.writes, 0);
  await assert.rejects(access(join(fixture.storage, 'evidence/architecture-v3/canary-preparation/lineage')));

  const first = await prepareEvidenceCanaryInputs(prepareArgs(fixture));
  const second = await prepareEvidenceCanaryInputs(prepareArgs(fixture, {
    now: () => new Date('2099-01-01T00:00:00.000Z'),
  }));
  assert.equal(first.report.contentSha256, second.report.contentSha256);
  assert.ok(second.outputs.every((output) => output.disposition === 'reused'));
  assert.deepEqual(await readFile(bdfPdfPath), originalPdf);

  const report = JSON.parse(await readFile(join(fixture.storage, first.report.objectPath), 'utf8'));
  assert.equal(report.observation.observedAt, checkpointObservedAt);
  assert.equal(report.historicalReplay.execution, 'REFERENCED_EXISTING_CHECKPOINT_NOT_EXECUTED_BY_PREPARE');
  assert.equal(report.counts.historicalReplaySourcesReferencedFromCheckpoint, 3);
  assert.equal(Object.hasOwn(report.counts, 'replayedSources'), false);
  assert.equal(Object.hasOwn(report, 'executionAt'), false);
  assert.equal(report.counts.selectedConversionsReused, 3);
  assert.equal(report.counts.referencedExistingLocalOcrAttempts, 1);
  assert.equal(report.counts.newConversionsExecutedByPrepare, 0);
  assert.equal(Object.hasOwn(report.counts, 'newConversions'), false);
  assert.equal(report.parallelCandidateConversions[0].requiredRegion.status, 'DIAGRAM_LABELS_UNREADABLE');
  assert.equal(report.parallelCandidateConversions[0].attemptRecordTypedGap, null);
  const provenance = report.parallelCandidateConversions[0].toolProvenance;
  assert.equal(provenance.status, 'INCOMPLETE_RECORDED_TOOL_PROVENANCE');
  assert.deepEqual(provenance.unrecordedProfileFlags, ['tableEnabled', 'formulaEnabled']);
  assert.equal(Object.hasOwn(provenance.recordedProfile, 'tableEnabled'), false);
  assert.equal(Object.hasOwn(provenance.recordedProfile, 'formulaEnabled'), false);
  assert.equal(provenance.policyExpectedProfile.tableEnabled, true);

  const lineage = JSON.parse(await readFile(join(fixture.storage, report.outputs.lineageChunks[0].objectPath), 'utf8'));
  const jsonFragment = lineage.fragments.find((fragment) => fragment.pointer === '/0/0').jsonPointerFragment;
  assert.deepEqual(jsonFragment.content, JSON.parse(await readFile(join(fixture.storage, fixture.targetSources[0].source.derivedArtifact.objectPath), 'utf8'))[0][0]);
  assert.deepEqual(lineage.fragments.find((fragment) => fragment.pointer === '/1/0').visualObservationsToPreserve, ['fixture visual note']);
  for (const item of lineage.supplementation) {
    assert.equal(item.actualEvidence.status, 'RAW_SOURCE_OBSERVATIONS_RESEARCH_ONLY');
    assert.equal(item.actualEvidence.extractionWitness, 'NOT_SUPPLIED');
    assert.equal(item.actualEvidence.fieldAssociation, 'NOT_WITNESSED');
    assert.equal(Object.hasOwn(item.actualEvidence, 'candidateValues'), false);
  }
  const bdp = JSON.parse(await readFile(join(fixture.storage, report.outputs.lineageChunks[1].objectPath), 'utf8'));
  const raw = bdp.supplementation[2].actualEvidence.rawObservations;
  assert.deepEqual(raw.map((observation) => observation.rawBlock), fixture.targetSources[1].document.flat());
  assert.match(JSON.stringify(raw[0].rawBlock), /589/);
  assert.match(JSON.stringify(raw[1].rawBlock), /568/);
  assert.equal(raw[0].pageNumber, 1);
  assert.equal(raw[1].pageNumber, 2);
  assert.equal(bdp.supplementation[2].actualEvidence.typedGeometry, 'NOT_PRODUCED');
  assert.equal(report.publicationStatus, 'NOT_EVALUATED_CANDIDATE_ONLY');
  assert.equal(report.counts.newV3Receipts, 0);
});

test('fails closed on frozen-input, owner, pointer, and candidate-block mutations without replacing an earlier report', async (t) => {
  const fixture = await makeFixture();
  t.after(() => closeFixture(fixture));
  const first = await prepareEvidenceCanaryInputs(prepareArgs(fixture));
  const reportPath = join(fixture.storage, first.report.objectPath);
  const successfulReport = await readFile(reportPath);
  const selectionFile = join(fixture.repo, selectionPath);
  const baselineSelection = JSON.parse(await readFile(selectionFile, 'utf8'));

  await writeFile(join(fixture.repo, frozenPaths.targetState), Buffer.from('mutated'));
  await assert.rejects(prepareEvidenceCanaryInputs(prepareArgs(fixture, { checkOnly: true })), /targetState.*hash mismatch/i);
  await writeFile(join(fixture.repo, frozenPaths.targetState), await readFile(join(repositoryRoot, frozenPaths.targetState)));

  const wrongReceipt = structuredClone(baselineSelection);
  wrongReceipt.targets[0].receiptPointer = '/entries/0/sources/0/notReceipt';
  await writeFile(selectionFile, jsonBytes(wrongReceipt));
  await assert.rejects(prepareEvidenceCanaryInputs(prepareArgs(fixture, { checkOnly: true })), /receipt pointer/i);

  const wrongClaim = structuredClone(baselineSelection);
  wrongClaim.targets[0].fields[0].legacyClaimPointer = '/entries/0/sources/0/claims/1';
  await writeFile(selectionFile, jsonBytes(wrongClaim));
  await assert.rejects(prepareEvidenceCanaryInputs(prepareArgs(fixture, { checkOnly: true })), /field mismatch/i);

  const wrongBlock = structuredClone(baselineSelection);
  wrongBlock.targets[0].valueBlocks[0].pointer = '/0/99';
  await writeFile(selectionFile, jsonBytes(wrongBlock));
  await assert.rejects(prepareEvidenceCanaryInputs(prepareArgs(fixture, { checkOnly: true })), /JSON pointer does not resolve/i);

  const wrongPage = structuredClone(baselineSelection);
  wrongPage.targets[0].valueBlocks[0].pageNumber = 2;
  await writeFile(selectionFile, jsonBytes(wrongPage));
  await assert.rejects(prepareEvidenceCanaryInputs(prepareArgs(fixture, { checkOnly: true })), /declared page/i);

  await writeFile(selectionFile, jsonBytes(baselineSelection));
  await writeFile(join(fixture.storage, fixture.targetSources[0].source.objectPath), Buffer.from('%PDF-mutated'));
  await assert.rejects(prepareEvidenceCanaryInputs(prepareArgs(fixture, { checkOnly: true })), /source PDF bytes mismatch/i);
  assert.deepEqual(await readFile(reportPath), successfulReport);
});

test('candidate writer rejects output-chain symlinks and unequal existing bytes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'real-canary-writer-'));
  const storage = join(root, 'storage');
  const escape = join(root, 'escape');
  await mkdir(storage);
  await mkdir(escape);
  t.after(() => rm(root, { recursive: true, force: true }));
  await symlink(escape, join(storage, 'evidence'));
  await assert.rejects(writeImmutableCandidateObject({
    storageRoot: storage, objectPath: 'evidence/architecture-v3/canary-preparation/records/x.json', bytes: Buffer.from('x'),
  }), /symlink/i);

  const safeStorage = join(root, 'safe-storage');
  await mkdir(safeStorage);
  await writeImmutableCandidateObject({ storageRoot: safeStorage, objectPath: 'evidence/object.json', bytes: Buffer.from('first') });
  await assert.rejects(writeImmutableCandidateObject({
    storageRoot: safeStorage, objectPath: 'evidence/object.json', bytes: Buffer.from('second'),
  }), /collision/i);
});

test('P1 rejects manifest numeric, axis, range, unit and label injection after a valid fixture', async (t) => {
  const fixture = await makeFixture();
  t.after(() => closeFixture(fixture));
  assert.equal((await prepareEvidenceCanaryInputs(prepareArgs(fixture, { checkOnly: true }))).status, 'checked');
  const selectionFile = join(fixture.repo, selectionPath);
  const baseline = JSON.parse(await readFile(selectionFile, 'utf8'));
  const mutations = [
    ['EWF wrong 595 over 575', (field) => { field.candidateValues = [{ valuePointer: '/0/0', value: { kind: 'fixed', mm: 595 } }]; }],
    ['swapped axis', (field) => { field.sourceAxisOrder = ['height', 'width', 'depth']; }],
    ['corrupted range endpoint', (field) => { field.observedValue = { kind: 'range', minMm: 850, maxMm: 8 }; }],
    ['corrupted unit', (field) => { field.unit = 'cm'; }],
    ['unwitnessed label association', (field) => { field.labelPointer = '/0/0'; }],
    ['swapped historical field', (field) => { field.field = 'closedEnvelope.widthMm'; }],
  ];
  for (const [name, mutate] of mutations) {
    await t.test(name, async () => {
      const selection = structuredClone(baseline);
      mutate(selection.targets[2].fields[2]);
      await writeFile(selectionFile, jsonBytes(selection));
      await assert.rejects(prepareEvidenceCanaryInputs(prepareArgs(fixture)), /unsupported.*(field|typed|observation)|field mismatch/i);
      await assert.rejects(access(join(fixture.storage, 'evidence/architecture-v3/canary-preparation/records')));
    });
  }
});

test('P1 rejects rehashed OCR metadata drift under the unchanged approved profile name', async (t) => {
  const fixture = await makeFixture();
  t.after(() => closeFixture(fixture));
  assert.equal((await prepareEvidenceCanaryInputs(prepareArgs(fixture, { checkOnly: true }))).status, 'checked');
  const selectionFile = join(fixture.repo, selectionPath);
  const baseline = JSON.parse(await readFile(selectionFile, 'utf8'));
  const recordPath = join(fixture.storage, baseline.targets[0].parallelCandidateConversions[0].recordObjectPath);
  const record = JSON.parse(await readFile(recordPath, 'utf8'));
  const mutations = [
    ['parserName', (row) => { row.result.profile.parserName = 'AnotherParser'; }],
    ['parserVersion', (row) => { row.result.profile.parserVersion = '3.4.5'; }],
    ['modelRevision', (row) => { row.result.profile.modelRevision = '0'.repeat(40); }],
    ['backend', (row) => { row.result.profile.backend = 'pipeline'; }],
    ['method', (row) => { row.result.profile.method = 'ocr'; }],
    ['effort', (row) => { row.result.profile.effort = 'low'; }],
    ['imageAnalysis', (row) => { row.result.profile.imageAnalysis = false; }],
    ['profileId', (row) => { row.result.profile.profileId = 'pipeline-auto-v1'; }],
    ['missing parserVersion', (row) => { delete row.result.profile.parserVersion; }],
    ['recorded table flag drift', (row) => { row.result.profile.tableEnabled = false; }],
    ['recorded formula flag drift', (row) => { row.result.profile.formulaEnabled = true; }],
    ['attemptedAt', (row) => { row.attemptedAt = '2026-09-14T14:00:00.000Z'; }],
    ['descriptor status', (_row, desc) => { desc.status = 'FAILED'; }],
    ['descriptor cache', (_row, desc) => { desc.cache = true; }],
    ['descriptor attemptedAt', (_row, desc) => { desc.attemptedAt = '2026-09-14T14:00:00.000Z'; }],
    ['record status', (row, desc) => { row.status = desc.attemptRecordStatus = 'FAILED'; }],
    ['record typed gap', (row, desc) => { row.typedGap = desc.attemptRecordTypedGap = 'FAILED'; }],
    ['descriptor attempt gap', (_row, desc) => { desc.attemptRecordTypedGap = 'NONE'; }],
    ['descriptor region gap', (_row, desc) => { desc.typedGap = null; }],
    ['selection disposition', (_row, desc) => { desc.selectionDisposition = 'SELECTED'; }],
    ['readjudication', (_row, desc) => { desc.readjudication = 'PERFORMED'; }],
    ['record cache', (row) => { row.cache = true; }],
    ['processing selected pages', (row) => { row.result.processing.selectedPages = [1]; }],
    ['processing page count', (row) => { row.result.processing.sourcePageCount = 3; }],
    ['descriptor processing', (_row, desc) => { desc.expectedProcessing.ranges = [[0, 0]]; }],
    ['missing processing', (row) => { delete row.result.processing; }],
    ['processing page ranges', (row) => { row.result.processing = { strategy: 'selected_page_ranges', ranges: [[0, 0]], selectedPages: [2], sourcePageCount: 2 }; }],
  ];
  for (const [name, mutate] of mutations) {
    await t.test(name, async () => {
      const selection = structuredClone(baseline);
      const changedRecord = structuredClone(record);
      const desc = selection.targets[0].parallelCandidateConversions[0];
      mutate(changedRecord, desc);
      const bytes = jsonBytes(changedRecord);
      await writeFile(recordPath, bytes);
      desc.recordSha256 = sha256(bytes);
      await writeFile(selectionFile, jsonBytes(selection));
      await assert.rejects(prepareEvidenceCanaryInputs(prepareArgs(fixture)), /parallel conversion|OCR|profile|processing/i);
      await assert.rejects(access(join(fixture.storage, 'evidence/architecture-v3/canary-preparation/records')));
    });
  }
});
