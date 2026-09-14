#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { lstat, link, mkdir, open, readFile, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createArtifactRecord, createFragment } from '../../src/domain/architecture-v3/artifact-lineage.mjs';
import { validateEvidenceAnchors } from '../../src/domain/architecture-v3/evidence-anchors.mjs';
import { adaptLegacyGeometryCandidate } from '../../src/domain/architecture-v3/legacy-semantics-adapter.mjs';
import { compileV3Semantics } from '../../src/domain/architecture-v3/semantics.mjs';
import { inspectMineruContentListV2 } from '../../src/domain/mineru-document.mjs';
import { CANONICAL_EVIDENCE_JSON_VERSION, canonicalEvidenceJson } from '../../src/shared/canonical-evidence-json.mjs';

const repositoryRootDefault = resolve(import.meta.dirname, '../..');
const outputPrefix = 'evidence/architecture-v3/canary-preparation';
const sha256Pattern = /^[a-f0-9]{64}$/u;
const exactTargetIds = new Set([
  'recovery_target_c4295ee36eb7c14ebebe7c87',
  'recovery_target_7638b53459b92a54af9a6109',
  'recovery_target_5f8e2af40b047d20e6ef4573',
]);
const frozenInputPaths = Object.freeze({
  acceptanceBundle: 'data/architecture-v2/reviews/automated/historical-evidence-recovery-acceptance-bundle.json',
  targetState: 'data/architecture-v2/reviews/automated/historical-evidence-target-state.json',
  recoveryPolicy: 'data/architecture-v2/policies/historical-evidence-recovery-policy.json',
  artifactLineage: 'src/domain/architecture-v3/artifact-lineage.mjs',
  evidenceAnchors: 'src/domain/architecture-v3/evidence-anchors.mjs',
  legacyAdapter: 'src/domain/architecture-v3/legacy-semantics-adapter.mjs',
  sourceVerifier: 'src/domain/evidence-source-verifier.mjs',
  historicalAudit: 'src/domain/historical-evidence-recovery-audit.mjs',
});
const runtimeBindingPaths = Object.freeze({
  evidenceResolutionPolicy: 'data/architecture-v2/policies/evidence-resolution-policy.json',
  semanticsModule: 'src/domain/architecture-v3/semantics.mjs',
  fieldDictionary: 'data/architecture-v2/policies/product-data-field-rights-dictionary.json',
  installationMatrix: 'data/architecture-v2/generated/installation-evidence-applicability-matrix.json',
  semanticsOverlay: 'data/architecture-v3/policies/semantics-overlay.json',
});
const loadedCodePaths = Object.freeze({
  artifactLineage: fileURLToPath(new URL('../../src/domain/architecture-v3/artifact-lineage.mjs', import.meta.url)),
  evidenceAnchors: fileURLToPath(new URL('../../src/domain/architecture-v3/evidence-anchors.mjs', import.meta.url)),
  legacyAdapter: fileURLToPath(new URL('../../src/domain/architecture-v3/legacy-semantics-adapter.mjs', import.meta.url)),
  semanticsModule: fileURLToPath(new URL('../../src/domain/architecture-v3/semantics.mjs', import.meta.url)),
});

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalSha256(value) {
  return sha256(Buffer.from(canonicalEvidenceJson(value), 'utf8'));
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(label + ' must be non-empty text');
  return value;
}

function requiredHash(value, label) {
  if (typeof value !== 'string' || !sha256Pattern.test(value)) throw new TypeError(label + ' must be a SHA-256 digest');
  return value;
}

function validTimestamp(value, label) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new TypeError(label + ' must be an ISO timestamp');
  return value;
}

function deepJson(value) {
  return JSON.parse(canonicalEvidenceJson(value));
}

function allowKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(label + ' must be an object');
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error('unsupported ' + label + ' property: ' + key);
  }
}

function strictPointer(document, pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) throw new TypeError('invalid JSON pointer: ' + pointer);
  let current = document;
  for (const encoded of pointer.slice(1).split('/')) {
    const key = encoded.replaceAll('~1', '/').replaceAll('~0', '~');
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, key)) {
      throw new Error('JSON pointer does not resolve: ' + pointer);
    }
    current = current[key];
  }
  return current;
}

function pageForContentListPointer(pointer) {
  const match = /^\/(\d+)(?:\/|$)/u.exec(pointer);
  if (!match) throw new Error('selected MinerU pointer does not identify a page: ' + pointer);
  return Number(match[1]) + 1;
}

function textOf(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textOf).join(' ');
  if (!value || typeof value !== 'object') return '';
  return Object.values(value).map(textOf).join(' ');
}

function resolveRelativeUnderRoot(root, relativePath, label) {
  if (typeof relativePath !== 'string' || relativePath === '' || relativePath.startsWith('/') || relativePath.includes('\0')) {
    throw new TypeError(label + ' must be a non-empty relative path');
  }
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(resolvedRoot, relativePath);
  const relation = relative(resolvedRoot, resolvedPath);
  if (relation === '..' || relation.startsWith('..' + sep)) throw new Error(label + ' escapes its root');
  return resolvedPath;
}

async function parseJsonBytes(bytes, label) {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch (error) {
    throw new Error('cannot read ' + label + ': ' + (error instanceof Error ? error.message : String(error)));
  }
}

async function lstatNoSymlink(path, label) {
  const status = await lstat(path);
  if (status.isSymbolicLink()) throw new Error('symlink in candidate output path chain: ' + label);
  return status;
}

async function ensureSafeOutputDirectory(storageRoot, directory) {
  const root = resolve(storageRoot);
  const resolvedDirectory = resolve(directory);
  const relation = relative(root, resolvedDirectory);
  if (relation === '..' || relation.startsWith('..' + sep)) throw new Error('candidate output directory escapes storage root');
  const rootStatus = await lstatNoSymlink(root, root);
  if (!rootStatus.isDirectory()) throw new Error('candidate storage root is not a directory');
  let current = root;
  for (const component of relation === '' ? [] : relation.split(sep)) {
    current = join(current, component);
    try {
      const status = await lstatNoSymlink(current, current);
      if (!status.isDirectory()) throw new Error('candidate output component is not a directory: ' + current);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      try {
        await mkdir(current);
      } catch (mkdirError) {
        if (mkdirError?.code !== 'EEXIST') throw mkdirError;
      }
      const created = await lstatNoSymlink(current, current);
      if (!created.isDirectory()) throw new Error('created candidate output component is not a directory: ' + current);
    }
  }
}

/**
 * Local bounded writer. It deliberately does not treat the shared lexical
 * under-root helper as a symlink-safety proof.
 */
export async function writeImmutableCandidateObject({ storageRoot, objectPath, bytes }) {
  requiredText(storageRoot, 'candidate storage root');
  const targetPath = resolveRelativeUnderRoot(storageRoot, objectPath, 'candidate object path');
  const payload = Buffer.from(bytes);
  if (payload.length === 0) throw new TypeError('candidate object bytes must be non-empty');
  await ensureSafeOutputDirectory(storageRoot, dirname(targetPath));
  try {
    const status = await lstatNoSymlink(targetPath, targetPath);
    if (!status.isFile()) throw new Error('candidate object is not a regular file: ' + targetPath);
    const existing = await readFile(targetPath);
    if (!existing.equals(payload)) throw new Error('content-addressed candidate object collision: ' + objectPath);
    return { objectPath, disposition: 'reused' };
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const temporaryPath = join(dirname(targetPath), '.' + randomUUID() + '.tmp');
  let handle;
  try {
    handle = await open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(payload);
    await handle.sync();
    await handle.close();
    handle = null;
    await ensureSafeOutputDirectory(storageRoot, dirname(targetPath));
    try {
      await link(temporaryPath, targetPath);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const existingStatus = await lstatNoSymlink(targetPath, targetPath);
      if (!existingStatus.isFile()) throw new Error('candidate object is not a regular file: ' + targetPath);
      const existing = await readFile(targetPath);
      if (!existing.equals(payload)) throw new Error('content-addressed candidate object collision: ' + objectPath);
      return { objectPath, disposition: 'reused' };
    }
    const createdStatus = await lstatNoSymlink(targetPath, targetPath);
    if (!createdStatus.isFile()) throw new Error('candidate object is not a regular file: ' + targetPath);
    return { objectPath, disposition: 'created' };
  } finally {
    await handle?.close();
    await unlink(temporaryPath).catch(() => {});
  }
}

function contentAddressedPath(kind, digest, extension) {
  return outputPrefix + '/' + kind + '/sha256/' + digest.slice(0, 2) + '/' + digest.slice(2, 4) + '/' + digest + '.' + extension;
}

function pngInfo(bytes) {
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('rendered page is not a PNG');
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function blockRole(groups) {
  if (groups.includes('modelScopeBlocks')) return 'subject';
  if (groups.includes('valueBlocks')) return 'value';
  if (groups.includes('visualCandidateBlocks')) return 'legend';
  return 'condition';
}

function createCandidateFragment({ content, parentArtifactSha256, locator }) {
  const fragmentSha256 = canonicalSha256({
    fragmentIdentityDomain: 'fitappliance.fragment.v1',
    schemaVersion: 1,
    canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
    content,
    parentArtifactSha256,
    locator,
  });
  return createFragment({ fragmentSha256, content, parentArtifactSha256, locator });
}

async function verifyDeclaredInputMap({ repositoryRoot, declared, expectedPaths, label }) {
  if (!declared || typeof declared !== 'object' || Array.isArray(declared)) throw new TypeError(label + ' must be an object');
  for (const name of Object.keys(expectedPaths)) {
    if (!Object.hasOwn(declared, name)) throw new Error(label + ' missing declared input: ' + name);
  }
  for (const name of Object.keys(declared)) {
    if (!Object.hasOwn(expectedPaths, name)) throw new Error(label + ' has unknown declared input: ' + name);
  }
  const verified = {};
  for (const [name, requiredPath] of Object.entries(expectedPaths)) {
    const descriptor = declared[name];
    if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) throw new TypeError(label + '.' + name + ' must be a descriptor');
    if (descriptor.path !== requiredPath) throw new Error(label + '.' + name + ' path mismatch');
    requiredHash(descriptor.sha256, label + '.' + name + ' hash');
    const bytes = await readFile(resolveRelativeUnderRoot(repositoryRoot, descriptor.path, label + '.' + name + ' path'));
    if (sha256(bytes) !== descriptor.sha256) throw new Error(label + '.' + name + ' hash mismatch');
    verified[name] = Object.freeze({ path: descriptor.path, sha256: descriptor.sha256, bytes });
  }
  return Object.freeze(verified);
}

async function verifyLoadedCodeIdentity(bindings) {
  for (const [name, loadedPath] of Object.entries(loadedCodePaths)) {
    if (!bindings[name]) continue;
    if (sha256(await readFile(loadedPath)) !== bindings[name].sha256) {
      throw new Error('loaded implementation code identity mismatch: ' + name);
    }
  }
}

async function loadSemantics(runtimeBindings) {
  const [fieldDictionary, installationMatrix, overlay] = await Promise.all([
    parseJsonBytes(runtimeBindings.fieldDictionary.bytes, 'verified field dictionary'),
    parseJsonBytes(runtimeBindings.installationMatrix.bytes, 'verified installation matrix'),
    parseJsonBytes(runtimeBindings.semanticsOverlay.bytes, 'verified semantics overlay'),
  ]);
  return compileV3Semantics({ fieldDictionary, installationMatrix, overlay });
}

function selectedTargetSet(selection) {
  if (!selection || typeof selection !== 'object' || !Array.isArray(selection.targets)) throw new TypeError('selection must contain targets');
  allowKeys(selection, ['schemaVersion', 'manifestId', 'purpose', 'preparationContract', 'frozenInputs', 'runtimeBindings',
    'initialReplayRenderCheckpoint', 'renderingAttestation', 'supersedesUnacceptedBatch', 'targets'], 'observation selection');
  if (selection.schemaVersion !== 3 || selection.preparationContract !== 'raw_source_observations_v1') {
    throw new Error('unsupported typed selection contract; raw_source_observations_v1 required');
  }
  if (selection.targets.length !== exactTargetIds.size) throw new Error('selection must contain exactly the three explicit targets');
  const ids = new Set(selection.targets.map((target) => target?.targetId));
  if (ids.size !== exactTargetIds.size || [...exactTargetIds].some((targetId) => !ids.has(targetId))) {
    throw new Error('selection must contain exactly the approved target IDs');
  }
  for (const target of selection.targets) {
    allowKeys(target, ['targetId', 'canonicalProductId', 'brand', 'model', 'category', 'bundleEntryPointer',
      'sourcePointer', 'receiptPointer', 'sourcePdfSha256', 'selectedMineruJsonSha256', 'renderPages',
      'modelScopeBlocks', 'contextBlocks', 'valueBlocks', 'visualCandidateBlocks', 'fields', 'semanticNotes',
      'parallelCandidateConversions'], 'source observation selection');
    if (!Array.isArray(target.fields) || target.fields.length === 0) throw new Error('historical field pointers required');
    for (const field of target.fields) allowKeys(field, ['legacyClaimPointer', 'field'], 'field observation');
  }
  return ids;
}

function replayOutcomes(checkpoint) {
  const outcomes = checkpoint?.replay?.audit?.outcomes ?? checkpoint?.replay?.outcomes;
  if (!Array.isArray(outcomes)) throw new Error('initial replay checkpoint lacks replay outcomes');
  return outcomes;
}

function selectedBlocksForTarget(target, rawJson) {
  const byPointer = new Map();
  for (const group of ['modelScopeBlocks', 'contextBlocks', 'valueBlocks', 'visualCandidateBlocks']) {
    for (const selection of target[group] ?? []) {
      allowKeys(selection, ['pointer', 'pageNumber', 'expectedText', 'semanticDisposition', 'observationsToPreserve'], 'raw observation block');
      const pointer = requiredText(selection.pointer, target.targetId + ' ' + group + ' pointer');
      if (!Number.isSafeInteger(selection.pageNumber) || selection.pageNumber < 1) {
        throw new TypeError(target.targetId + ' ' + pointer + ' has invalid page number');
      }
      if (pageForContentListPointer(pointer) !== selection.pageNumber) {
        throw new Error(target.targetId + ' ' + pointer + ' does not belong to declared page ' + selection.pageNumber);
      }
      const item = strictPointer(rawJson, pointer);
      const text = textOf(item.content).replace(/\s+/gu, ' ').trim();
      if (!text.includes(requiredText(selection.expectedText, target.targetId + ' ' + pointer + ' expected text'))) {
        throw new Error(target.targetId + ' selected JSON block text mismatch: ' + pointer);
      }
      if (!Array.isArray(item.bbox) || item.bbox.length !== 4) throw new Error(target.targetId + ' selected JSON block bbox missing: ' + pointer);
      const existing = byPointer.get(pointer) ?? {
        pointer,
        pageNumber: selection.pageNumber,
        type: item.type,
        rawBlock: deepJson(item),
        rawBbox: [...item.bbox],
        groups: [],
        visualObservations: [],
      };
      if (existing.pageNumber !== selection.pageNumber) throw new Error(target.targetId + ' selected JSON pointer has incompatible pages: ' + pointer);
      if (!existing.groups.includes(group)) existing.groups.push(group);
      if (Array.isArray(selection.observationsToPreserve)) existing.visualObservations.push(...selection.observationsToPreserve);
      byPointer.set(pointer, existing);
    }
  }
  return [...byPointer.values()].sort((left, right) => left.pointer.localeCompare(right.pointer));
}

function assertExactTargetOwner({ bundle, target, entry, source }) {
  for (const key of ['targetId', 'canonicalProductId', 'brand', 'model', 'category']) {
    if (entry?.[key] !== target?.[key]) throw new Error('selected entry product owner mismatch: ' + target.targetId + ' ' + key);
  }
  const sourcePrefix = requiredText(target.bundleEntryPointer, 'bundle entry pointer') + '/sources/';
  if (!requiredText(target.sourcePointer, 'source pointer').startsWith(sourcePrefix)) {
    throw new Error('source pointer is not under selected entry sources: ' + target.targetId);
  }
  const indexText = target.sourcePointer.slice(sourcePrefix.length);
  if (!/^(?:0|[1-9]\d*)$/u.test(indexText) || !Array.isArray(entry.sources) || entry.sources[Number(indexText)] !== source) {
    throw new Error('source pointer does not resolve selected entry source: ' + target.targetId);
  }
  if (target.receiptPointer !== target.sourcePointer + '/verificationReceipt'
    || strictPointer(bundle, target.receiptPointer) !== source.verificationReceipt) {
    throw new Error('receipt pointer does not resolve exact selected source receipt: ' + target.targetId);
  }
  if (source?.identity?.outcome !== 'exact' || source.identity.brand !== target.brand || source.identity.model !== target.model) {
    throw new Error('source exact product owner mismatch: ' + target.targetId);
  }
}

function claimIndexForField({ bundle, target, source, field }) {
  const pointer = requiredText(field.legacyClaimPointer, target.targetId + ' legacy claim pointer');
  const prefix = target.sourcePointer + '/claims/';
  if (!pointer.startsWith(prefix)) throw new Error('legacy claim pointer is not under selected source claims: ' + target.targetId);
  const indexText = pointer.slice(prefix.length);
  if (!/^(?:0|[1-9]\d*)$/u.test(indexText) || !Array.isArray(source.claims)) {
    throw new Error('legacy claim pointer does not resolve selected source claim: ' + target.targetId);
  }
  const claimIndex = Number(indexText);
  const claim = source.claims[claimIndex];
  if (!claim || strictPointer(bundle, pointer) !== claim) throw new Error('legacy claim pointer does not resolve exact selected source claim: ' + target.targetId);
  if (claim.field !== field.field) throw new Error('legacy claim field mismatch: ' + target.targetId);
  return { claimIndex, claim };
}

function fragmentReference(block) {
  return {
    pointer: block.pointer,
    pageNumber: block.pageNumber,
    jsonPointerFragmentSha256: block.jsonPointerFragment.fragmentSha256,
    pdfBboxFragmentSha256: block.pdfBboxFragment.fragmentSha256,
  };
}

function fieldSupplementation({ bundle, target, entry, source, field, bundleSha256, semantics, blocksByPointer, replayOutcome }) {
  const { claimIndex, claim } = claimIndexForField({ bundle, target, source, field });
  // Each field is a historical receipt pointer only. These whole raw blocks do
  // not assert a field/axis/unit/value association or an extraction witness.
  const rawObservations = [...blocksByPointer.values()].map((block) => ({
    ...fragmentReference(block),
    sourceJsonSha256: block.jsonPointerFragment.parentArtifactSha256,
    rawBlock: deepJson(block.jsonPointerFragment.content),
  }));
  const adapter = adaptLegacyGeometryCandidate({
    legacyObject: {
      kind: 'dimension_claim_v2',
      record: claim,
      origin: { containerSha256: bundleSha256, jsonPointer: field.legacyClaimPointer },
      owner: { case: entry, source, claimIndex },
    },
    semantics,
  });
  return {
    sourceOwner: {
      targetId: target.targetId,
      canonicalProductId: target.canonicalProductId,
      bundleEntryPointer: target.bundleEntryPointer,
      sourcePointer: target.sourcePointer,
      receiptPointer: target.receiptPointer,
      legacyClaimPointer: field.legacyClaimPointer,
    },
    field: field.field,
    historicLegacyClaim: deepJson(claim),
    actualEvidence: {
      status: 'RAW_SOURCE_OBSERVATIONS_RESEARCH_ONLY',
      rawObservations,
      fieldAssociation: 'NOT_WITNESSED',
      extractionWitness: 'NOT_SUPPLIED',
      typedGeometry: 'NOT_PRODUCED',
    },
    legacyReplay: replayOutcome.status === 'passed'
      ? { status: 'PASSED_HISTORICAL_AS_OF', failureCode: null }
      : { status: 'FAILED_HISTORICAL_AS_OF', failureCode: replayOutcome.failureCode ?? 'verification_replay_failure' },
    semanticConflict: { status: 'NOT_CLASSIFIED_BY_THIS_PREPARATION' },
    contractNotYetImplemented: ['G3B_G4_SEMANTIC_ADJUDICATION', 'G6B_G6C_ELIGIBILITY_AND_RECEIPT_ISSUANCE'],
    adapter,
    stillUnknown: [...adapter.unresolved, {
      path: '/actualEvidence/extractionWitness',
      reason: 'RAW_OBSERVATIONS_REQUIRE_EXTRACTION_AND_SEMANTIC_WITNESS',
      requiredWitnessKind: 'G3B_G4_EXTRACTED_FIELD_AXIS_UNIT_VALUE_WITNESS',
    }],
  };
}

function mineruOptions(artifact) {
  return {
    format: artifact.format,
    parserName: artifact.parserName,
    parserVersion: artifact.parserVersion,
    modelRevision: artifact.modelRevision,
    backend: artifact.backend,
    method: artifact.method,
    tableEnabled: artifact.tableEnabled,
    formulaEnabled: artifact.formulaEnabled,
    profileId: artifact.profileId ?? null,
    effort: artifact.effort ?? null,
    imageAnalysis: artifact.imageAnalysis ?? null,
    processedPages: artifact.processedPages ?? null,
    sourcePageCount: artifact.sourcePageCount ?? null,
  };
}

function buildSourceChunk({
  bundle, target, entry, source, rawJson, inspection, renderedPages, bundleSha256, semantics,
  replayOutcome, checkpoint, checkpointDescriptor, renderingAttestation,
}) {
  const sourceArtifact = createArtifactRecord({
    sha256: source.contentSha256, parentSha256: null, mediaType: source.contentType, toolRevision: null, optionsSha256: null,
  });
  const selectedJsonArtifact = createArtifactRecord({
    sha256: source.derivedArtifact.contentSha256,
    parentSha256: source.contentSha256,
    mediaType: 'application/json',
    toolRevision: source.derivedArtifact.parserName + '@' + source.derivedArtifact.parserVersion + ':' + source.derivedArtifact.modelRevision,
    optionsSha256: canonicalSha256(mineruOptions(source.derivedArtifact)),
  });
  const renderer = renderingAttestation.renderer;
  const pageArtifacts = renderedPages.map((page) => createArtifactRecord({
    sha256: page.contentSha256,
    parentSha256: source.contentSha256,
    mediaType: 'image/png',
    toolRevision: 'pdftoppm@' + renderer.version + ':sha256-' + renderer.binarySha256,
    optionsSha256: canonicalSha256({
      renderer: 'pdftoppm',
      binarySha256: renderer.binarySha256,
      version: renderer.version,
      commandOptions: renderer.commandOptions,
      pageNumber: page.pageNumber,
      rotationDegreesClockwise: page.rotationDegreesClockwise,
    }),
  }));
  const artifactRecords = [sourceArtifact, selectedJsonArtifact, ...pageArtifacts];
  const pagesByNumber = new Map(renderedPages.map((page) => [page.pageNumber, page]));
  const fragments = [];
  const standaloneProofs = [];
  const missingJoins = [];
  for (const block of selectedBlocksForTarget(target, rawJson)) {
    const page = pagesByNumber.get(block.pageNumber);
    if (!page) throw new Error(target.targetId + ' has no verified rendered page for ' + block.pointer);
    const role = blockRole(block.groups);
    const jsonPointerFragment = createCandidateFragment({
      content: block.rawBlock,
      parentArtifactSha256: selectedJsonArtifact.sha256,
      locator: { kind: 'json_pointer', pointer: block.pointer },
    });
    const pdfBboxFragment = createCandidateFragment({
      content: block.rawBlock,
      parentArtifactSha256: sourceArtifact.sha256,
      locator: {
        kind: 'pdf_bbox',
        pageNumber: block.pageNumber,
        normalizedTopLeftBox: block.rawBbox,
        renderedPageArtifactSha256: page.contentSha256,
        renderedPixels: page.renderedPixels,
        rotationDegreesClockwise: page.rotationDegreesClockwise,
        transform: { kind: 'full_page' },
        rawCoordinates: { coordinateSpace: 'mineru_normalized_top_left_1000', values: block.rawBbox },
      },
    });
    for (const fragment of [jsonPointerFragment, pdfBboxFragment]) {
      const proof = validateEvidenceAnchors({
        sourceArtifactSha256: sourceArtifact.sha256,
        artifactRecords,
        fragments: [fragment],
        anchors: [{ anchorId: role + '-' + fragment.fragmentSha256.slice(0, 12), role, fragmentSha256: fragment.fragmentSha256 }],
        relations: [],
      });
      standaloneProofs.push({ fragmentSha256: fragment.fragmentSha256, proof });
    }
    fragments.push({
      pointer: block.pointer,
      pageNumber: block.pageNumber,
      role,
      selectedGroups: [...block.groups],
      visualObservationsToPreserve: [...block.visualObservations],
      jsonPointerFragment,
      pdfBboxFragment,
    });
    missingJoins.push({
      status: 'UNWITNESSED_BY_G3A_RELATION',
      sourceJsonPointer: block.pointer,
      jsonPointerFragmentSha256: jsonPointerFragment.fragmentSha256,
      pdfBboxFragmentSha256: pdfBboxFragment.fragmentSha256,
      reason: 'No source-supplied G3a relation witness binds the structured MinerU block to the original-page region; both candidates are retained separately.',
    });
  }
  const blocksByPointer = new Map(fragments.map((fragment) => [fragment.pointer, fragment]));
  const supplementation = target.fields.map((field) => fieldSupplementation({
    bundle, target, entry, source, field, bundleSha256, semantics, blocksByPointer, replayOutcome,
  }));
  return {
    schemaVersion: 1,
    kind: 'g3a_real_canary_candidate_lineage_chunk',
    structuralStatus: 'CANDIDATE_LINEAGE_WITH_UNWITNESSED_JOINS',
    targetId: target.targetId,
    product: { canonicalProductId: target.canonicalProductId, brand: target.brand, model: target.model, category: target.category },
    sourceOwner: { bundleEntryPointer: target.bundleEntryPointer, sourcePointer: target.sourcePointer, receiptPointer: target.receiptPointer },
    original: {
      sourcePdfSha256: source.contentSha256,
      sourceObjectPath: source.objectPath,
      selectedMineruJsonSha256: source.derivedArtifact.contentSha256,
      selectedMineruJsonObjectPath: source.derivedArtifact.objectPath,
      inspection: { format: inspection.format, schemaVersion: inspection.schemaVersion, pageCount: inspection.pageCount },
    },
    historicalReplayContext: {
      execution: 'REFERENCED_EXISTING_CHECKPOINT_NOT_EXECUTED_BY_PREPARE',
      checkpointObjectPath: checkpointDescriptor.objectPath,
      checkpointSha256: checkpointDescriptor.sha256,
      checkpointObservedAt: checkpoint.observedAt,
      replayStatus: replayOutcome.status,
      replayFailureCode: replayOutcome.failureCode ?? null,
      verificationReceiptAsOf: source.verificationReceipt.verifiedAt,
      receiptPolicyVersion: source.verificationReceipt.policyVersion,
      manufacturerPolicyVersion: source.verificationReceipt.manufacturerPolicyVersion,
      discoveryPolicyVersion: source.verificationReceipt.discoveryPolicyVersion ?? null,
      currentPublicationStatus: 'NOT_EVALUATED_CANDIDATE_ONLY',
    },
    renderingAttestation: {
      objectPath: renderingAttestation.descriptor.objectPath,
      sha256: renderingAttestation.descriptor.sha256,
      status: renderingAttestation.record.status,
      renderer: deepJson(renderingAttestation.renderer),
      selectedPageHashesReproduced: true,
    },
    artifactRecords,
    renderedPages,
    fragments,
    standaloneProofs,
    missingJoins,
    semanticNotes: target.semanticNotes ?? [],
    supplementation,
    publicationStatus: 'NOT_EVALUATED_CANDIDATE_ONLY',
    newV3Receipts: 0,
  };
}

async function loadCheckpoint({ selection, storageRoot, acceptanceBundleSha256 }) {
  const descriptor = selection.initialReplayRenderCheckpoint;
  if (!descriptor || typeof descriptor !== 'object') throw new Error('selection lacks initial replay/render checkpoint');
  requiredHash(descriptor.sha256, 'initial replay/render checkpoint hash');
  const bytes = await readFile(resolveRelativeUnderRoot(storageRoot, descriptor.objectPath, 'initial replay/render checkpoint object path'));
  if (sha256(bytes) !== descriptor.sha256) throw new Error('initial replay/render checkpoint hash mismatch');
  const checkpoint = await parseJsonBytes(bytes, 'initial replay/render checkpoint');
  if (checkpoint.kind !== descriptor.kind) throw new Error('initial replay/render checkpoint kind mismatch');
  if (checkpoint.acceptanceBundleSha256 !== acceptanceBundleSha256) throw new Error('initial replay/render checkpoint bundle mismatch');
  if (checkpoint.publicationStatus !== 'NOT_EVALUATED_CANDIDATE_ONLY') throw new Error('initial replay/render checkpoint publication status mismatch');
  if (validTimestamp(checkpoint.observedAt, 'initial replay/render checkpoint observedAt') !== descriptor.observedAt) {
    throw new Error('initial replay/render checkpoint observedAt mismatch');
  }
  return { descriptor, checkpoint };
}

async function loadRenderingAttestation({ selection, storageRoot }) {
  const descriptor = selection.renderingAttestation;
  if (!descriptor || typeof descriptor !== 'object') throw new Error('selection lacks rendering attestation');
  requiredHash(descriptor.sha256, 'rendering attestation hash');
  const bytes = await readFile(resolveRelativeUnderRoot(storageRoot, descriptor.objectPath, 'rendering attestation object path'));
  if (sha256(bytes) !== descriptor.sha256) throw new Error('rendering attestation hash mismatch');
  const record = await parseJsonBytes(bytes, 'rendering attestation');
  if (record.kind !== descriptor.kind || record.status !== 'SUCCEEDED' || descriptor.status !== 'SUCCEEDED') {
    throw new Error('rendering attestation status or kind mismatch');
  }
  if (record.typedGap !== null) throw new Error('rendering attestation has unresolved typed gap');
  const renderer = record.renderer;
  if (!renderer || typeof renderer !== 'object') throw new Error('rendering attestation lacks renderer identity');
  requiredHash(renderer.binarySha256, 'rendering attestation renderer binary hash');
  if (renderer.binarySha256 !== descriptor.renderer?.binarySha256) throw new Error('rendering attestation renderer binary hash mismatch');
  const version = requiredText(descriptor.renderer?.version, 'rendering attestation renderer version');
  if (!requiredText(renderer.versionOutput, 'rendering attestation renderer version output').includes('pdftoppm version ' + version)) {
    throw new Error('rendering attestation renderer version mismatch');
  }
  if (!renderer.commandOptions || renderer.commandOptions.format !== descriptor.renderer?.format
    || renderer.commandOptions.resolutionDpi !== descriptor.renderer?.resolutionDpi) {
    throw new Error('rendering attestation renderer options mismatch');
  }
  const pagesByKey = new Map();
  if (!Array.isArray(record.renderedPages)) throw new Error('rendering attestation has no rendered pages');
  for (const page of record.renderedPages) {
    const key = page?.targetId + ':' + page?.pageNumber;
    if (pagesByKey.has(key)) throw new Error('rendering attestation duplicate page: ' + key);
    requiredHash(page.expectedContentSha256, 'rendering attestation expected hash ' + key);
    requiredHash(page.actualContentSha256, 'rendering attestation actual hash ' + key);
    if (page.matchesExpected !== true || page.expectedContentSha256 !== page.actualContentSha256) {
      throw new Error('rendering attestation page does not reproduce expected hash: ' + key);
    }
    pagesByKey.set(key, page);
  }
  return Object.freeze({
    descriptor,
    record,
    renderer: Object.freeze({
      executablePath: requiredText(renderer.executablePath, 'rendering attestation executable path'),
      binarySha256: renderer.binarySha256,
      version,
      versionOutput: renderer.versionOutput,
      commandOptions: deepJson(renderer.commandOptions),
    }),
    pagesByKey,
  });
}

function assertCheckpointSourceBinding({ checkpointSource, target, source }) {
  if (!checkpointSource || checkpointSource.targetId !== target.targetId) throw new Error('initial replay checkpoint source missing: ' + target.targetId);
  for (const key of ['bundleEntryPointer', 'sourcePointer', 'receiptPointer']) {
    if (checkpointSource.owner?.[key] !== target[key]) throw new Error('initial replay checkpoint owner binding mismatch: ' + target.targetId);
  }
  const original = checkpointSource.original;
  if (original?.sourcePdfSha256 !== source.contentSha256 || original?.sourceObjectPath !== source.objectPath
    || original?.sourceByteSize !== source.byteSize || original?.selectedMineruJsonSha256 !== source.derivedArtifact.contentSha256
    || original?.selectedMineruJsonObjectPath !== source.derivedArtifact.objectPath
    || original?.selectedMineruJsonByteSize !== source.derivedArtifact.byteSize) {
    throw new Error('initial replay checkpoint source binding mismatch: ' + target.targetId);
  }
}

async function verifiedRenderedPages({ checkpointSource, target, storageRoot, renderingAttestation }) {
  if (!checkpointSource || !Array.isArray(checkpointSource.renderedPages)) throw new Error(target.targetId + ' missing rendered pages in initial checkpoint');
  const wanted = new Set(target.renderPages);
  if (checkpointSource.renderedPages.length !== wanted.size) throw new Error(target.targetId + ' rendered-page count mismatch');
  const pages = [];
  for (const page of checkpointSource.renderedPages) {
    if (!wanted.delete(page.pageNumber)) throw new Error(target.targetId + ' unexpected rendered page ' + page.pageNumber);
    requiredHash(page.contentSha256, target.targetId + ' rendered page hash');
    const attested = renderingAttestation.pagesByKey.get(target.targetId + ':' + page.pageNumber);
    if (!attested || attested.sourcePdfSha256 !== target.sourcePdfSha256 || attested.expectedContentSha256 !== page.contentSha256
      || attested.actualContentSha256 !== page.contentSha256 || attested.matchesExpected !== true) {
      throw new Error(target.targetId + ' rendering attestation binding mismatch for page ' + page.pageNumber);
    }
    const bytes = await readFile(resolveRelativeUnderRoot(storageRoot, page.objectPath, 'rendered page object path'));
    if (sha256(bytes) !== page.contentSha256) throw new Error(target.targetId + ' rendered page hash mismatch for page ' + page.pageNumber);
    const pixels = pngInfo(bytes);
    if (pixels.width !== page.renderedPixels?.width || pixels.height !== page.renderedPixels?.height
      || pixels.width !== attested.renderedPixels?.width || pixels.height !== attested.renderedPixels?.height
      || page.rotationDegreesClockwise !== attested.rotationDegreesClockwise) {
      throw new Error(target.targetId + ' rendered page geometry mismatch for page ' + page.pageNumber);
    }
    if (![0, 90, 180, 270].includes(page.rotationDegreesClockwise)) throw new Error(target.targetId + ' rendered page rotation is invalid for page ' + page.pageNumber);
    pages.push({
      pageNumber: page.pageNumber,
      contentSha256: page.contentSha256,
      objectPath: page.objectPath,
      renderedPixels: pixels,
      rotationDegreesClockwise: page.rotationDegreesClockwise,
    });
  }
  if (wanted.size !== 0) throw new Error(target.targetId + ' is missing required rendered pages');
  return pages.sort((left, right) => left.pageNumber - right.pageNumber);
}

function equalJson(left, right) {
  return canonicalEvidenceJson(left) === canonicalEvidenceJson(right);
}

async function loadParallelCandidateConversions({ target, source, storageRoot, resolutionPolicy }) {
  const results = [];
  for (const descriptor of target.parallelCandidateConversions ?? []) {
    allowKeys(descriptor, ['recordObjectPath', 'recordSha256', 'candidateJsonObjectPath', 'candidateJsonSha256',
      'attemptedAt', 'profileId', 'selectedPages', 'sourcePageCount', 'cache', 'status', 'attemptRecordStatus',
      'attemptRecordTypedGap', 'typedGap', 'selectionDisposition', 'expectedProcessing', 'readjudication',
      'publicationStatus'], 'parallel conversion descriptor');
    requiredHash(descriptor.recordSha256, target.targetId + ' parallel conversion record hash');
    requiredHash(descriptor.candidateJsonSha256, target.targetId + ' parallel conversion JSON hash');
    const recordBytes = await readFile(resolveRelativeUnderRoot(storageRoot, descriptor.recordObjectPath, 'parallel conversion record object path'));
    if (sha256(recordBytes) !== descriptor.recordSha256) throw new Error(target.targetId + ' parallel conversion record hash mismatch');
    const record = await parseJsonBytes(recordBytes, 'parallel conversion record');
    const jsonBytes = await readFile(resolveRelativeUnderRoot(storageRoot, descriptor.candidateJsonObjectPath, 'parallel conversion JSON object path'));
    if (sha256(jsonBytes) !== descriptor.candidateJsonSha256) throw new Error(target.targetId + ' parallel conversion JSON hash mismatch');
    const candidateJson = await parseJsonBytes(jsonBytes, 'parallel conversion JSON');
    const inspection = inspectMineruContentListV2(jsonBytes);
    const expectedProfile = resolutionPolicy.pdfEvidenceProfiles?.find((profile) => profile.profileId === descriptor.profileId);
    if (!expectedProfile || expectedProfile.role !== 'image_dimension_fallback') {
      throw new Error(target.targetId + ' parallel conversion profile is not approved by the frozen resolution policy');
    }
    const recordedProfile = record.result?.profile;
    const requiredProfileKeys = ['parserName', 'parserVersion', 'modelRevision', 'backend', 'method', 'profileId', 'effort', 'imageAnalysis'];
    const optionalRecordedFlags = ['tableEnabled', 'formulaEnabled'];
    allowKeys(recordedProfile, [...requiredProfileKeys, ...optionalRecordedFlags], 'parallel conversion profile');
    for (const key of [...requiredProfileKeys, ...optionalRecordedFlags]) {
      if (optionalRecordedFlags.includes(key) && !Object.hasOwn(recordedProfile, key)) continue;
      if (!Object.hasOwn(recordedProfile, key) || recordedProfile[key] !== expectedProfile[key]) {
        throw new Error(target.targetId + ' parallel conversion pinned profile mismatch: ' + key);
      }
    }
    const unrecordedProfileFlags = optionalRecordedFlags.filter((key) => !Object.hasOwn(recordedProfile, key));
    const pages = descriptor.selectedPages;
    const pageCount = descriptor.sourcePageCount;
    if (!Number.isSafeInteger(pageCount) || pageCount < 1
      || pageCount !== source.derivedArtifact.pageCount
      || !Array.isArray(pages) || pages.length === 0
      || pages.some((page, index) => !Number.isSafeInteger(page) || page < 1 || page > pageCount || (index > 0 && page <= pages[index - 1]))) {
      throw new Error(target.targetId + ' parallel conversion processing page selection invalid');
    }
    const ranges = [];
    for (const page of pages) {
      if (ranges.at(-1)?.[1] === page - 2) ranges.at(-1)[1] = page - 1;
      else ranges.push([page - 1, page - 1]);
    }
    const processing = { strategy: 'selected_page_ranges', ranges, selectedPages: pages, sourcePageCount: pageCount };
    if (!descriptor.expectedProcessing || !record.result.processing
      || !equalJson(descriptor.expectedProcessing, processing) || !equalJson(record.result.processing, processing)) {
      throw new Error(target.targetId + ' parallel conversion contradictory processing page mappings');
    }
    const attemptedAt = validTimestamp(record.attemptedAt, 'parallel conversion attemptedAt');
    if (new Date(attemptedAt).toISOString() !== attemptedAt || attemptedAt !== descriptor.attemptedAt
      || descriptor.attemptRecordStatus !== record.status || descriptor.attemptRecordTypedGap !== record.typedGap
      || record.typedGap !== null || !Object.hasOwn(record, 'typedGap')
      || descriptor.status !== 'SUCCEEDED_WITH_DIAGRAM_LABELS_UNREADABLE'
      || descriptor.cache !== false || descriptor.selectionDisposition !== record.outputDisposition
      || descriptor.readjudication !== record.readjudication || descriptor.publicationStatus !== record.publicationStatus) {
      throw new Error(target.targetId + ' parallel conversion timestamp/status/disposition binding mismatch');
    }
    if (record.status !== 'SUCCEEDED' || record.targetId !== target.targetId || record.model !== target.model
      || record.sourcePdfSha256 !== source.contentSha256 || record.sourceObjectPath !== source.objectPath
      || record.requestedProfile !== descriptor.profileId || !equalJson(record.selectedPages, descriptor.selectedPages)
      || record.sourcePageCount !== descriptor.sourcePageCount || record.cache !== false
      || record.outputDisposition !== 'PARALLEL_CANDIDATE_NOT_SELECTED' || record.readjudication !== 'NOT_PERFORMED'
      || record.publicationStatus !== 'NOT_EVALUATED_CANDIDATE_ONLY'
      || record.result?.candidateJsonSha256 !== descriptor.candidateJsonSha256
      || record.result?.candidateJsonObjectPath !== descriptor.candidateJsonObjectPath
      || record.result?.byteSize !== jsonBytes.length || record.result?.profile?.profileId !== descriptor.profileId
      || record.result?.inspection?.pageCount !== inspection.pageCount || inspection.pageCount !== pageCount
      || record.result?.inspection?.format !== expectedProfile.requiredFormat || record.result?.inspection?.schemaVersion !== inspection.schemaVersion) {
      throw new Error(target.targetId + ' parallel conversion record binding mismatch');
    }
    if (descriptor.typedGap !== 'DIAGRAM_LABELS_UNREADABLE') throw new Error(target.targetId + ' parallel conversion must retain DIAGRAM_LABELS_UNREADABLE');
    const diagramSelection = (target.visualCandidateBlocks ?? []).find((block) => block.pageNumber === 2);
    if (!diagramSelection) throw new Error(target.targetId + ' parallel conversion lacks required diagram region selection');
    const diagramBlock = strictPointer(candidateJson, diagramSelection.pointer);
    if (diagramBlock?.type !== 'image' || diagramBlock?.content?.content !== '') {
      throw new Error(target.targetId + ' parallel conversion diagram region requires re-adjudication');
    }
    results.push({
      targetId: target.targetId,
      recordObjectPath: descriptor.recordObjectPath,
      recordSha256: descriptor.recordSha256,
      candidateJsonObjectPath: descriptor.candidateJsonObjectPath,
      candidateJsonSha256: descriptor.candidateJsonSha256,
      attemptedAt: descriptor.attemptedAt,
      attemptStatus: record.status,
      attemptRecordTypedGap: record.typedGap,
      profileId: descriptor.profileId,
      toolProvenance: {
        status: unrecordedProfileFlags.length ? 'INCOMPLETE_RECORDED_TOOL_PROVENANCE' : 'RECORDED_PROFILE_MATCHES_POLICY',
        recordedProfile: deepJson(recordedProfile),
        policyExpectedProfile: deepJson(expectedProfile),
        unrecordedProfileFlags,
        limitation: unrecordedProfileFlags.length ? 'Policy defaults do not establish the flags used by this historical attempt.' : null,
      },
      processing: deepJson(record.result.processing),
      selectedPages: deepJson(descriptor.selectedPages),
      sourcePageCount: descriptor.sourcePageCount,
      cache: false,
      selectionDisposition: descriptor.selectionDisposition,
      requiredRegion: {
        sourceJsonPointer: diagramSelection.pointer,
        pageNumber: diagramSelection.pageNumber,
        status: 'DIAGRAM_LABELS_UNREADABLE',
        completion: 'NOT_SUPPLIED',
        reason: 'The one bounded local conversion succeeded, but the required image block content is empty; no diagram-label extraction or semantic selection occurred.',
      },
      publicationStatus: 'NOT_EVALUATED_CANDIDATE_ONLY',
    });
  }
  return results;
}

function outputIntent(kind, value) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  const contentSha256 = sha256(bytes);
  return { kind, bytes, contentSha256, objectPath: contentAddressedPath(kind, contentSha256, 'json') };
}

function summarizeWrites(outputs) {
  return outputs.reduce((summary, output) => {
    summary[output.disposition] += 1;
    return summary;
  }, { created: 0, reused: 0, planned: 0 });
}

function shaMap(verified) {
  return Object.fromEntries(Object.entries(verified).map(([name, descriptor]) => [
    name,
    { path: descriptor.path, sha256: descriptor.sha256 },
  ]));
}

export function parseCanaryCliArguments(argv) {
  const result = { checkOnly: false, selectionPath: null, storageRoot: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--check-only') {
      if (result.checkOnly) throw new Error('duplicate --check-only argument');
      result.checkOnly = true;
    } else if (argument === '--selection' || argument === '--storage-root') {
      const key = argument === '--selection' ? 'selectionPath' : 'storageRoot';
      const value = argv[index + 1];
      if (result[key] !== null) throw new Error('duplicate ' + argument + ' argument');
      if (typeof value !== 'string' || value === '' || value.startsWith('--')) throw new Error(argument + ' requires a value');
      result[key] = value;
      index += 1;
    } else {
      throw new Error('unknown argument: ' + argument);
    }
  }
  if (result.selectionPath === null) throw new Error('--selection is required');
  if (result.storageRoot === null) throw new Error('--storage-root is required');
  return result;
}

export async function prepareEvidenceCanaryInputs({
  checkOnly = false,
  repositoryRoot = repositoryRootDefault,
  storageRoot,
  selectionPath,
  now = () => new Date(),
} = {}) {
  if (typeof checkOnly !== 'boolean') throw new TypeError('checkOnly must be boolean');
  requiredText(selectionPath, 'selection path');
  requiredText(storageRoot, 'storage root');
  if (!isAbsolute(storageRoot)) throw new Error('storage root must be an absolute path');
  const executionAt = validTimestamp(now().toISOString(), 'execution time');
  const selectionBytes = await readFile(resolveRelativeUnderRoot(repositoryRoot, selectionPath, 'selection path'));
  const selection = await parseJsonBytes(selectionBytes, 'selection');
  const targetIds = selectedTargetSet(selection);
  const frozenInputs = await verifyDeclaredInputMap({
    repositoryRoot, declared: selection.frozenInputs, expectedPaths: frozenInputPaths, label: 'frozenInputs',
  });
  const runtimeBindings = await verifyDeclaredInputMap({
    repositoryRoot, declared: selection.runtimeBindings, expectedPaths: runtimeBindingPaths, label: 'runtimeBindings',
  });
  await verifyLoadedCodeIdentity({ ...frozenInputs, ...runtimeBindings });
  const bundle = await parseJsonBytes(frozenInputs.acceptanceBundle.bytes, 'verified acceptance bundle');
  const semantics = await loadSemantics(runtimeBindings);
  const resolutionPolicy = await parseJsonBytes(runtimeBindings.evidenceResolutionPolicy.bytes, 'frozen OCR resolution policy');
  let supersedesUnacceptedBatch = null;
  if (selection.supersedesUnacceptedBatch !== undefined) {
    const prior = selection.supersedesUnacceptedBatch;
    allowKeys(prior, ['objectPath', 'sha256', 'status'], 'prior unaccepted batch');
    requiredHash(prior.sha256, 'prior unaccepted batch hash');
    const bytes = await readFile(resolveRelativeUnderRoot(storageRoot, prior.objectPath, 'prior unaccepted batch path'));
    if (sha256(bytes) !== prior.sha256 || prior.status !== 'UNACCEPTED_HISTORICAL_OUTPUT_DO_NOT_CONSUME') {
      throw new Error('prior unaccepted batch identity/status mismatch');
    }
    // Reference only: no field values or derived lineage are read from this batch.
    supersedesUnacceptedBatch = { objectPath: prior.objectPath, sha256: prior.sha256, status: prior.status };
  }
  const { descriptor: checkpointDescriptor, checkpoint } = await loadCheckpoint({
    selection, storageRoot, acceptanceBundleSha256: frozenInputs.acceptanceBundle.sha256,
  });
  const renderingAttestation = await loadRenderingAttestation({ selection, storageRoot });
  const outcomes = replayOutcomes(checkpoint);
  const outcomesByTargetId = new Map();
  for (const outcome of outcomes) {
    if (!targetIds.has(outcome?.targetId) || outcomesByTargetId.has(outcome.targetId)) {
      throw new Error('initial replay checkpoint outcomes do not bind exactly the selected source owners');
    }
    outcomesByTargetId.set(outcome.targetId, outcome);
  }
  if (outcomesByTargetId.size !== exactTargetIds.size) throw new Error('initial replay checkpoint outcome count does not match selected source owners');
  const checkpointSourcesByTargetId = new Map();
  for (const checkpointSource of checkpoint.sources ?? []) {
    if (!targetIds.has(checkpointSource?.targetId) || checkpointSourcesByTargetId.has(checkpointSource.targetId)) {
      throw new Error('initial replay checkpoint sources do not bind exactly the selected source owners');
    }
    checkpointSourcesByTargetId.set(checkpointSource.targetId, checkpointSource);
  }
  if (checkpointSourcesByTargetId.size !== exactTargetIds.size) throw new Error('initial replay checkpoint source count does not match selected source owners');

  const chunks = [];
  const parallelCandidateConversions = [];
  for (const target of selection.targets) {
    const entry = strictPointer(bundle, target.bundleEntryPointer);
    const source = strictPointer(bundle, target.sourcePointer);
    assertExactTargetOwner({ bundle, target, entry, source });
    if (source.contentSha256 !== target.sourcePdfSha256) throw new Error('selected source PDF hash mismatch: ' + target.targetId);
    if (source.derivedArtifact?.contentSha256 !== target.selectedMineruJsonSha256) throw new Error('selected MinerU JSON hash mismatch: ' + target.targetId);
    const pdfBytes = await readFile(resolveRelativeUnderRoot(storageRoot, source.objectPath, 'source PDF object path'));
    if (sha256(pdfBytes) !== source.contentSha256 || pdfBytes.length !== source.byteSize) throw new Error('source PDF bytes mismatch: ' + target.targetId);
    const jsonBytes = await readFile(resolveRelativeUnderRoot(storageRoot, source.derivedArtifact.objectPath, 'selected MinerU JSON object path'));
    if (sha256(jsonBytes) !== source.derivedArtifact.contentSha256 || jsonBytes.length !== source.derivedArtifact.byteSize) throw new Error('selected MinerU JSON bytes mismatch: ' + target.targetId);
    const inspection = inspectMineruContentListV2(jsonBytes);
    if (inspection.contentSha256 !== target.selectedMineruJsonSha256) throw new Error('selected MinerU schema/hash mismatch: ' + target.targetId);
    const replayOutcome = outcomesByTargetId.get(target.targetId);
    if (!replayOutcome || replayOutcome.sourcePdfSha256 !== source.contentSha256) throw new Error('initial replay outcome source binding mismatch: ' + target.targetId);
    const checkpointSource = checkpointSourcesByTargetId.get(target.targetId);
    assertCheckpointSourceBinding({ checkpointSource, target, source });
    const renderedPages = await verifiedRenderedPages({ checkpointSource, target, storageRoot, renderingAttestation });
    parallelCandidateConversions.push(...await loadParallelCandidateConversions({ target, source, storageRoot, resolutionPolicy }));
    chunks.push(buildSourceChunk({
      bundle,
      target,
      entry,
      source,
      rawJson: await parseJsonBytes(jsonBytes, target.targetId + ' selected MinerU JSON'),
      inspection,
      renderedPages,
      bundleSha256: frozenInputs.acceptanceBundle.sha256,
      semantics,
      replayOutcome,
      checkpoint,
      checkpointDescriptor,
      renderingAttestation,
    }));
  }

  const lineageIntents = chunks.map((chunk) => outputIntent('lineage', chunk));
  const supplementationIntents = chunks.map((chunk) => outputIntent('chunks', {
    schemaVersion: 1,
    kind: 'real_canary_field_supplementation_chunk',
    targetId: chunk.targetId,
    sourceOwner: chunk.sourceOwner,
    historicalReplayContext: chunk.historicalReplayContext,
    supplementation: chunk.supplementation,
    publicationStatus: 'NOT_EVALUATED_CANDIDATE_ONLY',
  }));
  const observation = {
    kind: 'source_checkpoint_observation',
    preparationContract: selection.preparationContract,
    observedAt: checkpoint.observedAt,
    initialReplayCheckpointSha256: checkpointDescriptor.sha256,
    selectionManifestSha256: sha256(selectionBytes),
    acceptanceBundleSha256: frozenInputs.acceptanceBundle.sha256,
    semanticPolicySha256: semantics.semanticPolicySha256,
    producerCodeSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
  };
  const report = {
    schemaVersion: 2,
    kind: 'real_canary_preparation_batch_report',
    researchStatus: 'RAW_OBSERVATIONS_REQUIRE_G3B_G4_WITNESS',
    supersedesUnacceptedBatch,
    observation: { ...observation, observationId: canonicalSha256(observation) },
    scope: { targetCount: chunks.length, sourceCount: chunks.length, denominator: 'three_explicit_selected_source_owners_only' },
    frozenInputs: {
      verified: shaMap(frozenInputs),
      runtimeBindings: shaMap(runtimeBindings),
      semanticPolicySha256: semantics.semanticPolicySha256,
      initialReplayRenderCheckpoint: {
        objectPath: checkpointDescriptor.objectPath,
        sha256: checkpointDescriptor.sha256,
        observedAt: checkpoint.observedAt,
      },
      renderingAttestation: {
        objectPath: renderingAttestation.descriptor.objectPath,
        sha256: renderingAttestation.descriptor.sha256,
        renderer: deepJson(renderingAttestation.renderer),
      },
    },
    historicalReplay: {
      execution: 'REFERENCED_EXISTING_CHECKPOINT_NOT_EXECUTED_BY_PREPARE',
      source: checkpointDescriptor.objectPath,
      sourceSha256: checkpointDescriptor.sha256,
      checkpointObservedAt: checkpoint.observedAt,
      method: checkpoint.replay.method,
      outcomes,
      summary: checkpoint.replay.audit?.summary ?? {
        entries: chunks.length,
        sources: chunks.length,
        passed: outcomes.filter((outcome) => outcome.status === 'passed').length,
        failed: outcomes.filter((outcome) => outcome.status !== 'passed').length,
      },
    },
    parallelCandidateConversions,
    outputs: {
      lineageChunks: lineageIntents.map(({ kind, bytes, ...intent }) => intent),
      supplementationChunks: supplementationIntents.map(({ kind, bytes, ...intent }) => intent),
      renderedPageObjects: chunks.flatMap((chunk) => chunk.renderedPages.map((page) => ({
        targetId: chunk.targetId,
        ...page,
        disposition: 'reused_from_initial_replay_render_checkpoint',
      }))),
    },
    counts: {
      selectedSourceOwners: chunks.length,
      sourcePdfObjectsVerified: chunks.length,
      selectedMineruJsonObjectsVerified: chunks.length,
      selectedConversionsReused: chunks.length,
      referencedExistingLocalOcrAttempts: parallelCandidateConversions.length,
      newConversionsExecutedByPrepare: 0,
      unresolvedOcrProvenanceRecords: parallelCandidateConversions.filter((conversion) => conversion.toolProvenance.unrecordedProfileFlags.length > 0).length,
      historicalReplaySourcesReferencedFromCheckpoint: outcomes.length,
      historicalReplayPassedReferencedFromCheckpoint: outcomes.filter((outcome) => outcome.status === 'passed').length,
      historicalReplayFailedReferencedFromCheckpoint: outcomes.filter((outcome) => outcome.status !== 'passed').length,
      renderedPageObjectsReused: chunks.reduce((total, chunk) => total + chunk.renderedPages.length, 0),
      newRenderedPageObjects: 0,
      artifactRecords: chunks.reduce((total, chunk) => total + chunk.artifactRecords.length, 0),
      candidateFragments: chunks.reduce((total, chunk) => total + chunk.fragments.length * 2, 0),
      standaloneG3aProofs: chunks.reduce((total, chunk) => total + chunk.standaloneProofs.length, 0),
      witnessedRelations: 0,
      retainedUnwitnessedJoins: chunks.reduce((total, chunk) => total + chunk.missingJoins.length, 0),
      supplementationEntries: chunks.reduce((total, chunk) => total + chunk.supplementation.length, 0),
      unresolvedRequiredDiagramRegions: parallelCandidateConversions.filter((conversion) => conversion.requiredRegion.status === 'DIAGRAM_LABELS_UNREADABLE').length,
      newV3Receipts: 0,
    },
    publicationStatus: 'NOT_EVALUATED_CANDIDATE_ONLY',
    releaseBoundary: 'This external candidate batch report is not a new audit ledger, active head, receipt, current publication decision, or semantic adjudication.',
  };
  const reportIntent = outputIntent('records', report);
  const intents = [...lineageIntents, ...supplementationIntents, reportIntent];
  if (checkOnly) {
    return {
      status: 'checked',
      checkOnly: true,
      executionAt,
      observation,
      outputs: intents.map(({ kind, bytes, ...intent }) => ({ ...intent, disposition: 'planned' })),
      report: { objectPath: reportIntent.objectPath, contentSha256: reportIntent.contentSha256 },
      counts: { ...report.counts, writes: 0 },
    };
  }
  const writes = [];
  for (const intent of intents) {
    writes.push(await writeImmutableCandidateObject({ storageRoot, objectPath: intent.objectPath, bytes: intent.bytes }));
  }
  return {
    status: 'prepared',
    checkOnly: false,
    executionAt,
    observation,
    report: { objectPath: reportIntent.objectPath, contentSha256: reportIntent.contentSha256 },
    outputs: writes,
    counts: { ...report.counts, writes: summarizeWrites(writes) },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await prepareEvidenceCanaryInputs(parseCanaryCliArguments(process.argv.slice(2)));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n');
    process.exitCode = 1;
  }
}
