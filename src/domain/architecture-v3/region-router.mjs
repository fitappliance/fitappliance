import { createHash } from 'node:crypto';

import { createFragment } from './artifact-lineage.mjs';
import { inspectExtractionRegions, replayInspectedRegion } from './extraction-region-observation.mjs';
export { inspectExtractionRegions, replayInspectedRegion } from './extraction-region-observation.mjs';
import { selectDocumentProfile } from './document-family-registry.mjs';
import { canonicalEvidenceJson } from '../../shared/canonical-evidence-json.mjs';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ALLOWED_ROTATIONS = new Set([0, 90, 180, 270]);
const SELECTED_PROFILE_KEYS = ['status', 'candidateStatus', 'reasons', 'profile', 'selectionBinding'];
const SELECTION_BINDING_KEYS = [
  'schemaVersion',
  'bindingVersion',
  'registry',
  'selector',
  'regionIdentity',
  'profileIdentity',
  'policySha256',
  'brandRegistrySha256',
];
const SELECTOR_KEYS = ['brandId', 'category', 'documentType'];
const REGION_IDENTITY_KEYS = ['regionId', 'sourceJsonPointer', 'fragmentSha256', 'parentArtifactSha256'];
const PROFILE_IDENTITY_KEYS = ['profileId', 'profileSha256'];
const ATTESTATION_MANIFEST_KEYS = [
  'schemaVersion',
  'fixtureSetId',
  'purpose',
  'status',
  'acceptedBatch',
  'policy',
  'brandRegistry',
  'codeIdentity',
  'toolIdentity',
  'sourceExpectations',
  'profileWitnesses',
  'fixtures',
  'historicalOcrAttempt',
  'manifestSha256',
];
const ATTESTATION_ACCEPTED_BATCH_KEYS = ['objectPath', 'sha256'];
const ATTESTATION_POLICY_KEYS = ['path', 'sha256', 'policySha256'];
const ATTESTATION_BRAND_REGISTRY_KEYS = ['path', 'fileSha256', 'registrySha256'];
const ATTESTATION_CODE_IDENTITY_KEYS = ['schemaVersion', 'files'];
const ATTESTATION_CODE_FILE_KEYS = ['path', 'sha256'];
const ATTESTATION_TOOL_IDENTITY_KEYS = ['selectedMineru', 'renderer'];
const ATTESTATION_MINERU_TOOL_KEYS = ['format', 'acceptedToolRevisions'];
const ATTESTATION_RENDERER_KEYS = ['binarySha256', 'version', 'commandOptions'];
const ATTESTATION_RENDERER_OPTIONS_KEYS = ['format', 'pageRotationInspection', 'pageSelection', 'resolutionDpi'];
const ATTESTATION_SOURCE_KEYS = [
  'sourceId',
  'sourcePdfSha256',
  'sourcePdfObjectPath',
  'selectedMineruJsonSha256',
  'selectedMineruJsonObjectPath',
  'selectedMineruToolRevision',
  'pageCount',
  'lineageObjectPath',
  'lineageSha256',
  'blocks',
  'renderedPages',
];
const ATTESTATION_SOURCE_BLOCK_KEYS = ['sourceJsonPointer', 'pageNumber', 'fragmentSha256', 'rawBlockCanonicalSha256'];
const ATTESTATION_RENDERED_PAGE_KEYS = ['pageNumber', 'objectPath', 'sha256', 'renderedPixels', 'rotationDegreesClockwise', 'transform'];
const ATTESTATION_PROFILE_WITNESS_KEYS = [
  'profileId',
  'profileSha256',
  'positiveSourceSha256s',
  'negativeSourceSha256s',
  'fixtureIds',
  'negativeWitnesses',
  'sourceIdentityTamper',
];
const ATTESTATION_NEGATIVE_WITNESS_KEYS = ['fixtureId', 'sourcePdfSha256', 'expected'];
const ATTESTATION_NEGATIVE_SELECTION_KEYS = ['status', 'profileId', 'route'];
const ATTESTATION_NEGATIVE_MUTATION_KEYS = ['kind', 'target', 'expected'];
const ATTESTATION_NEGATIVE_EXPECTED_KEYS = ['status', 'reason'];
const ATTESTATION_FIXTURE_KEYS = ['fixtureId', 'fixtureFile', 'fixtureFileSha256', 'sourceId', 'target', 'expected'];
const ATTESTATION_FIXTURE_TARGET_KEYS = ['sourceJsonPointer', 'pageNumber', 'fragmentSha256'];
const ATTESTATION_FIXTURE_EXPECTED_KEYS = ['profileId', 'profileSha256', 'route', 'requiresPageRender'];
const ATTESTATION_HISTORICAL_OCR_KEYS = [
  'recordObjectPath',
  'recordSha256',
  'status',
  'unrecordedProfileFlags',
  'completeToolAttestation',
];
const ATTESTATION_INPUT_KEYS = ['schemaVersion', 'mode', 'registry', 'fixtures'];
const ATTESTATION_INPUT_ORIGINAL_KEYS = [...ATTESTATION_INPUT_KEYS, 'originalObjects'];
const ATTESTATION_FIXTURE_PAYLOAD_KEYS = ['fixtureId', 'fileSha256', 'payload'];
const ORIGINAL_OBJECT_KEYS = ['schemaVersion', 'acceptedBatch', 'historicalOcrAttempt', 'sources'];
const ORIGINAL_BYTES_KEYS = ['objectPath', 'bytesBase64'];
const ORIGINAL_SOURCE_KEYS = ['sourceId', 'sourcePdf', 'selectedMineruJson', 'lineage', 'renderedPages'];
const ORIGINAL_RENDERED_PAGE_KEYS = ['pageNumber', 'objectPath', 'bytesBase64'];
const CANARY_ROUTE_VALUES = new Set(['native', 'mineru', 'ocr_or_vision']);
const G3B_FROZEN_SOURCE_CONTRACT_SHA256 = '57a6b4f2c60cb46bb5d8e8ba347551f47d3e77134e87df77ebd9283e5efc4f70';
const G3B_CODE_IDENTITY_PATHS = new Set([
  'src/domain/architecture-v3/document-family-registry.mjs',
  'src/domain/architecture-v3/region-router.mjs',
  'src/domain/architecture-v3/extraction-region-observation.mjs',
  'src/domain/architecture-v3/artifact-lineage.mjs',
  'src/domain/architecture-v3/evidence-anchors.mjs',
  'src/domain/architecture-v3/brand-registry.mjs',
  'src/shared/canonical-evidence-json.mjs',
  'scripts/architecture-v3/run-profile-canaries.mjs',
  'data/architecture-v3/policies/document-family-profiles.json',
  'data/architecture-v3/generated/brand-registry.json',
]);

function isPlainObject(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function strictJsonClone(value) {
  try {
    return JSON.parse(canonicalEvidenceJson(value));
  } catch {
    return null;
  }
}

function exactKeys(value, expectedKeys) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function allowedKeys(value, allowed) {
  return isPlainObject(value) && Object.keys(value).every((key) => allowed.includes(key));
}

function without(value, keys) {
  const copy = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function validSha256(value) {
  return typeof value === 'string' && SHA256_PATTERN.test(value);
}

function pageFromRawPointer(pointer) {
  if (typeof pointer !== 'string') return null;
  const match = /^\/(0|[1-9]\d*)\/(0|[1-9]\d*)$/.exec(pointer);
  return match ? Number(match[1]) + 1 : null;
}

function unresolvedEnvelope(reason) {
  return {
    status: 'unresolved',
    route: 'unresolved',
    candidateStatus: 'STRUCTURAL_CANDIDATE_ONLY',
    reasons: [reason],
  };
}

function attestationEnvelope(status, reasons, extra = {}) {
  return {
    status,
    candidateStatus: 'STRUCTURAL_CANDIDATE_ONLY',
    reasons: sortedUnique(reasons),
    ...extra,
  };
}


function validateSelectedProfileEnvelope(untrustedSelection) {
  const selection = strictJsonClone(untrustedSelection);
  if (!exactKeys(selection, SELECTED_PROFILE_KEYS)
    || selection.status !== 'selected'
    || selection.candidateStatus !== 'STRUCTURAL_CANDIDATE_ONLY'
    || !Array.isArray(selection.reasons)
    || !isPlainObject(selection.profile)
    || !exactKeys(selection.selectionBinding, SELECTION_BINDING_KEYS)) {
    return { ok: false, reason: 'UNBOUND_SELECTED_PROFILE' };
  }
  const binding = selection.selectionBinding;
  if (binding.schemaVersion !== 1
    || binding.bindingVersion !== 'fitappliance-document-profile-selection-v1'
    || !isPlainObject(binding.registry)
    || !exactKeys(binding.selector, SELECTOR_KEYS)
    || !exactKeys(binding.regionIdentity, REGION_IDENTITY_KEYS)
    || !exactKeys(binding.profileIdentity, PROFILE_IDENTITY_KEYS)
    || typeof binding.selector.brandId !== 'string'
    || typeof binding.selector.category !== 'string'
    || typeof binding.selector.documentType !== 'string'
    || !validSha256(binding.regionIdentity.fragmentSha256)
    || !validSha256(binding.regionIdentity.parentArtifactSha256)
    || !validSha256(binding.profileIdentity.profileSha256)
    || !validSha256(binding.policySha256)
    || !validSha256(binding.brandRegistrySha256)) {
    return { ok: false, reason: 'UNBOUND_SELECTED_PROFILE' };
  }
  return { ok: true, selection };
}

/**
 * Routes a replayed structural candidate only. It re-runs inspection and
 * profile selection from the serializable binding, then ignores caller-authored
 * observation text/flags and profile extractor chains.
 */
export function routeExtractionRegion(input = {}) {
  const routingInput = strictJsonClone(input);
  if (!exactKeys(routingInput, ['regionObservation', 'selectedProfile'])) {
    return unresolvedEnvelope('INVALID_ROUTING_INPUT');
  }
  const replayedRegion = replayInspectedRegion(routingInput.regionObservation);
  if (!replayedRegion.ok) return unresolvedEnvelope(replayedRegion.reason);
  if (replayedRegion.region.status !== 'inspected') return unresolvedEnvelope('UNINSPECTED_REGION');

  const selectedValidation = validateSelectedProfileEnvelope(routingInput.selectedProfile);
  if (!selectedValidation.ok) return unresolvedEnvelope(selectedValidation.reason);
  const { selection } = selectedValidation;
  const binding = selection.selectionBinding;
  const region = replayedRegion.region;
  if (binding.regionIdentity.regionId !== region.regionId
    || binding.regionIdentity.sourceJsonPointer !== region.sourceJsonPointer
    || binding.regionIdentity.fragmentSha256 !== region.fragmentSha256
    || binding.regionIdentity.parentArtifactSha256 !== region.rawBlockIdentity.parentArtifactSha256) {
    return unresolvedEnvelope('PROFILE_REGION_BINDING_MISMATCH');
  }

  const replayedSelection = selectDocumentProfile({
    registry: binding.registry,
    brandId: binding.selector.brandId,
    category: binding.selector.category,
    documentType: binding.selector.documentType,
    regionObservation: region,
  });
  if (replayedSelection.status !== 'selected'
    || replayedSelection.profile.profileId !== binding.profileIdentity.profileId
    || replayedSelection.profile.profileSha256 !== binding.profileIdentity.profileSha256
    || replayedSelection.selectionBinding.policySha256 !== binding.policySha256
    || replayedSelection.selectionBinding.brandRegistrySha256 !== binding.brandRegistrySha256
    || canonicalEvidenceJson(replayedSelection.profile) !== canonicalEvidenceJson(selection.profile)) {
    return unresolvedEnvelope('PROFILE_SELECTION_REPLAY_MISMATCH');
  }

  const profile = replayedSelection.profile;
  let route = 'unresolved';
  if (typeof region.nativeText === 'string' && region.nativeText.length > 0
    && profile.extractorChain.includes('native')) {
    route = 'native';
  } else if (typeof region.mineruText === 'string' && region.mineruText.length > 0
    && profile.extractorChain.includes('mineru')) {
    route = 'mineru';
  } else if (profile.extractorChain.includes('ocr_or_vision')) {
    route = 'ocr_or_vision';
  }

  const reasons = sortedUnique([
    'STRUCTURAL_ROUTING_ONLY',
    ...region.routingGaps,
    ...(route === 'unresolved' ? ['NO_SUPPORTED_EXTRACTION_ROUTE'] : []),
  ]);
  return {
    status: route === 'unresolved' ? 'unresolved' : 'routed',
    route,
    candidateStatus: 'STRUCTURAL_CANDIDATE_ONLY',
    profileId: profile.profileId,
    regionId: region.regionId,
    fragmentSha256: region.fragmentSha256,
    reasons,
  };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalSha256(value) {
  return sha256(Buffer.from(canonicalEvidenceJson(value), 'utf8'));
}

function validRelativeObjectPath(value) {
  return typeof value === 'string'
    && value.length > 0
    && !value.startsWith('/')
    && !value.includes('\\')
    && !value.includes('\0')
    && value.split('/').every((component) => component !== '' && component !== '.' && component !== '..');
}

function validPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function validRenderedPixels(value) {
  return isPlainObject(value)
    && exactKeys(value, ['width', 'height'])
    && validPositiveInteger(value.width)
    && validPositiveInteger(value.height);
}

function sameStringSet(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((value) => typeof value === 'string')
    && right.every((value) => typeof value === 'string')
    && new Set(left).size === left.length
    && new Set(right).size === right.length
    && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function sameCanonical(left, right) {
  try {
    return canonicalEvidenceJson(left) === canonicalEvidenceJson(right);
  } catch {
    return false;
  }
}

function resultFailure(reason, extra = {}) {
  return { ok: false, reason, ...extra };
}

function resultSuccess(extra = {}) {
  return { ok: true, ...extra };
}

function validateCodeIdentityShape(value) {
  if (!exactKeys(value, ATTESTATION_CODE_IDENTITY_KEYS)
    || value.schemaVersion !== 1
    || !Array.isArray(value.files)
    || value.files.length === 0) {
    return resultFailure('INVALID_CODE_IDENTITY');
  }
  const paths = new Set();
  for (const file of value.files) {
    if (!exactKeys(file, ATTESTATION_CODE_FILE_KEYS)
      || !validRelativeObjectPath(file.path)
      || !validSha256(file.sha256)
      || paths.has(file.path)) {
      return resultFailure('INVALID_CODE_IDENTITY');
    }
    paths.add(file.path);
  }
  return resultSuccess();
}

function validateSourceExpectation(source) {
  if (!exactKeys(source, ATTESTATION_SOURCE_KEYS)
    || typeof source.sourceId !== 'string'
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(source.sourceId)
    || !validSha256(source.sourcePdfSha256)
    || !validRelativeObjectPath(source.sourcePdfObjectPath)
    || !validSha256(source.selectedMineruJsonSha256)
    || !validRelativeObjectPath(source.selectedMineruJsonObjectPath)
    || typeof source.selectedMineruToolRevision !== 'string'
    || source.selectedMineruToolRevision === ''
    || !validPositiveInteger(source.pageCount)
    || !validRelativeObjectPath(source.lineageObjectPath)
    || !validSha256(source.lineageSha256)
    || !Array.isArray(source.blocks)
    || source.blocks.length === 0
    || !Array.isArray(source.renderedPages)
    || source.renderedPages.length === 0) {
    return resultFailure('INVALID_SOURCE_EXPECTATION');
  }
  const pointers = new Set();
  for (const block of source.blocks) {
    if (!exactKeys(block, ATTESTATION_SOURCE_BLOCK_KEYS)
      || typeof block.sourceJsonPointer !== 'string'
      || pageFromRawPointer(block.sourceJsonPointer) !== block.pageNumber
      || !validPositiveInteger(block.pageNumber)
      || block.pageNumber > source.pageCount
      || !validSha256(block.fragmentSha256)
      || !validSha256(block.rawBlockCanonicalSha256)
      || pointers.has(block.sourceJsonPointer)) {
      return resultFailure('INVALID_SOURCE_EXPECTATION');
    }
    pointers.add(block.sourceJsonPointer);
  }
  const pages = new Set();
  for (const page of source.renderedPages) {
    if (!exactKeys(page, ATTESTATION_RENDERED_PAGE_KEYS)
      || !validPositiveInteger(page.pageNumber)
      || page.pageNumber > source.pageCount
      || !validRelativeObjectPath(page.objectPath)
      || !validSha256(page.sha256)
      || !validRenderedPixels(page.renderedPixels)
      || !ALLOWED_ROTATIONS.has(page.rotationDegreesClockwise)
      || !isPlainObject(page.transform)
      || !exactKeys(page.transform, ['kind'])
      || page.transform.kind !== 'full_page'
      || pages.has(page.pageNumber)) {
      return resultFailure('INVALID_SOURCE_EXPECTATION');
    }
    pages.add(page.pageNumber);
  }
  return resultSuccess();
}

function validateManifest(untrustedManifest) {
  const manifest = strictJsonClone(untrustedManifest);
  if (!exactKeys(manifest, ATTESTATION_MANIFEST_KEYS)
    || manifest.schemaVersion !== 3
    || manifest.fixtureSetId !== 'g3b-profile-canary-attestation-v1'
    || typeof manifest.purpose !== 'string'
    || manifest.status !== 'STRUCTURAL_CANARY_ATTESTATION_ONLY'
    || !validSha256(manifest.manifestSha256)
    || manifest.manifestSha256 !== canonicalSha256(without(manifest, ['manifestSha256']))) {
    return resultFailure('INVALID_CANARY_MANIFEST');
  }
  if (!exactKeys(manifest.acceptedBatch, ATTESTATION_ACCEPTED_BATCH_KEYS)
    || !validRelativeObjectPath(manifest.acceptedBatch.objectPath)
    || !validSha256(manifest.acceptedBatch.sha256)
    || !exactKeys(manifest.policy, ATTESTATION_POLICY_KEYS)
    || !validRelativeObjectPath(manifest.policy.path)
    || !validSha256(manifest.policy.sha256)
    || !validSha256(manifest.policy.policySha256)
    || !exactKeys(manifest.brandRegistry, ATTESTATION_BRAND_REGISTRY_KEYS)
    || !validRelativeObjectPath(manifest.brandRegistry.path)
    || !validSha256(manifest.brandRegistry.fileSha256)
    || !validSha256(manifest.brandRegistry.registrySha256)) {
    return resultFailure('INVALID_CANARY_MANIFEST');
  }
  const codeIdentity = validateCodeIdentityShape(manifest.codeIdentity);
  if (!codeIdentity.ok) return resultFailure('INVALID_CANARY_MANIFEST');
  if (!exactKeys(manifest.toolIdentity, ATTESTATION_TOOL_IDENTITY_KEYS)
    || !exactKeys(manifest.toolIdentity.selectedMineru, ATTESTATION_MINERU_TOOL_KEYS)
    || manifest.toolIdentity.selectedMineru.format !== 'content_list_v2'
    || !Array.isArray(manifest.toolIdentity.selectedMineru.acceptedToolRevisions)
    || manifest.toolIdentity.selectedMineru.acceptedToolRevisions.length < 1
    || !manifest.toolIdentity.selectedMineru.acceptedToolRevisions.every((value) => typeof value === 'string' && value !== '')
    || new Set(manifest.toolIdentity.selectedMineru.acceptedToolRevisions).size !== manifest.toolIdentity.selectedMineru.acceptedToolRevisions.length
    || !exactKeys(manifest.toolIdentity.renderer, ATTESTATION_RENDERER_KEYS)
    || !validSha256(manifest.toolIdentity.renderer.binarySha256)
    || typeof manifest.toolIdentity.renderer.version !== 'string'
    || !exactKeys(manifest.toolIdentity.renderer.commandOptions, ATTESTATION_RENDERER_OPTIONS_KEYS)
    || manifest.toolIdentity.renderer.commandOptions.format !== 'png'
    || manifest.toolIdentity.renderer.commandOptions.pageRotationInspection !== 'pdfinfo -f PAGE -l PAGE'
    || manifest.toolIdentity.renderer.commandOptions.pageSelection !== 'one_page_per_invocation'
    || manifest.toolIdentity.renderer.commandOptions.resolutionDpi !== 150) {
    return resultFailure('INVALID_CANARY_MANIFEST');
  }
  if (!Array.isArray(manifest.sourceExpectations) || manifest.sourceExpectations.length !== 3) {
    return resultFailure('INVALID_CANARY_MANIFEST');
  }
  const sourceIds = new Set();
  const sourceHashes = new Set();
  for (const source of manifest.sourceExpectations) {
    const validation = validateSourceExpectation(source);
    if (!validation.ok || sourceIds.has(source.sourceId) || sourceHashes.has(source.sourcePdfSha256)) {
      return resultFailure('INVALID_CANARY_MANIFEST');
    }
    sourceIds.add(source.sourceId);
    sourceHashes.add(source.sourcePdfSha256);
    if (!manifest.toolIdentity.selectedMineru.acceptedToolRevisions.includes(source.selectedMineruToolRevision)) {
      return resultFailure('INVALID_CANARY_MANIFEST');
    }
  }
  if (canonicalSha256({
    acceptedBatch: manifest.acceptedBatch,
    toolIdentity: manifest.toolIdentity,
    sourceExpectations: manifest.sourceExpectations,
    historicalOcrAttempt: manifest.historicalOcrAttempt,
  }) !== G3B_FROZEN_SOURCE_CONTRACT_SHA256) {
    return resultFailure('FROZEN_SOURCE_CONTRACT_MISMATCH');
  }
  return resultSuccess({ manifest });
}

function validateAttestationInputShape(value) {
  const fixtures = strictJsonClone(value);
  if (!isPlainObject(fixtures)
    || fixtures.schemaVersion !== 1
    || !['portable', 'original-objects'].includes(fixtures.mode)
    || !(fixtures.mode === 'portable'
      ? exactKeys(fixtures, ATTESTATION_INPUT_KEYS)
      : (exactKeys(fixtures, ATTESTATION_INPUT_KEYS) || exactKeys(fixtures, ATTESTATION_INPUT_ORIGINAL_KEYS)))
    || !isPlainObject(fixtures.registry)
    || !Array.isArray(fixtures.fixtures)) {
    return resultFailure('INVALID_PORTABLE_FIXTURES');
  }
  return resultSuccess({ fixtures });
}

function validateFixtureExpectation(fixture, sourceIds) {
  if (!exactKeys(fixture, ATTESTATION_FIXTURE_KEYS)
    || typeof fixture.fixtureId !== 'string'
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(fixture.fixtureId)
    || typeof fixture.fixtureFile !== 'string'
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/u.test(fixture.fixtureFile)
    || !validSha256(fixture.fixtureFileSha256)
    || !sourceIds.has(fixture.sourceId)
    || !exactKeys(fixture.target, ATTESTATION_FIXTURE_TARGET_KEYS)
    || typeof fixture.target.sourceJsonPointer !== 'string'
    || pageFromRawPointer(fixture.target.sourceJsonPointer) !== fixture.target.pageNumber
    || !validPositiveInteger(fixture.target.pageNumber)
    || !validSha256(fixture.target.fragmentSha256)
    || !exactKeys(fixture.expected, ATTESTATION_FIXTURE_EXPECTED_KEYS)
    || typeof fixture.expected.profileId !== 'string'
    || !validSha256(fixture.expected.profileSha256)
    || !CANARY_ROUTE_VALUES.has(fixture.expected.route)
    || typeof fixture.expected.requiresPageRender !== 'boolean') {
    return resultFailure('INVALID_CANARY_MANIFEST');
  }
  return resultSuccess();
}

function validateProfileWitnessExpectation(witness, sourceHashes, fixtureIds) {
  if (!exactKeys(witness, ATTESTATION_PROFILE_WITNESS_KEYS)
    || typeof witness.profileId !== 'string'
    || !validSha256(witness.profileSha256)
    || !Array.isArray(witness.positiveSourceSha256s)
    || witness.positiveSourceSha256s.length < 1
    || !witness.positiveSourceSha256s.every(validSha256)
    || new Set(witness.positiveSourceSha256s).size !== witness.positiveSourceSha256s.length
    || !Array.isArray(witness.negativeSourceSha256s)
    || witness.negativeSourceSha256s.length < 2
    || !witness.negativeSourceSha256s.every(validSha256)
    || new Set(witness.negativeSourceSha256s).size !== witness.negativeSourceSha256s.length
    || witness.positiveSourceSha256s.some((hash) => witness.negativeSourceSha256s.includes(hash))
    || !witness.positiveSourceSha256s.every((hash) => sourceHashes.has(hash))
    || !witness.negativeSourceSha256s.every((hash) => sourceHashes.has(hash))
    || !Array.isArray(witness.fixtureIds)
    || witness.fixtureIds.length < 1
    || !witness.fixtureIds.every((fixtureId) => typeof fixtureId === 'string' && fixtureIds.has(fixtureId))
    || new Set(witness.fixtureIds).size !== witness.fixtureIds.length
    || !Array.isArray(witness.negativeWitnesses)
    || witness.negativeWitnesses.length < 2
    || !exactKeys(witness.sourceIdentityTamper, ATTESTATION_NEGATIVE_MUTATION_KEYS)
    || witness.sourceIdentityTamper.kind !== 'source_pdf_sha256'
    || witness.sourceIdentityTamper.target !== 'document.sourcePdfSha256'
    || !exactKeys(witness.sourceIdentityTamper.expected, ATTESTATION_NEGATIVE_EXPECTED_KEYS)
    || witness.sourceIdentityTamper.expected.status !== 'fail'
    || witness.sourceIdentityTamper.expected.reason !== 'FIXTURE_SOURCE_PDF_MISMATCH') {
    return resultFailure('INVALID_CANARY_MANIFEST');
  }
  for (const negative of witness.negativeWitnesses) {
    if (!exactKeys(negative, ATTESTATION_NEGATIVE_WITNESS_KEYS)
      || !fixtureIds.has(negative.fixtureId)
      || !validSha256(negative.sourcePdfSha256)
      || !witness.negativeSourceSha256s.includes(negative.sourcePdfSha256)
      || !exactKeys(negative.expected, ATTESTATION_NEGATIVE_SELECTION_KEYS)
      || negative.expected.status !== 'selected'
      || typeof negative.expected.profileId !== 'string'
      || negative.expected.profileId === witness.profileId
      || !CANARY_ROUTE_VALUES.has(negative.expected.route)) {
      return resultFailure('INVALID_CANARY_MANIFEST');
    }
  }
  if (!sameStringSet(witness.negativeWitnesses.map((negative) => negative.sourcePdfSha256), witness.negativeSourceSha256s)) {
    return resultFailure('INVALID_CANARY_MANIFEST');
  }
  return resultSuccess();
}

function validateManifestRelationships(manifest) {
  const codeFilesByPath = new Map(manifest.codeIdentity.files.map((file) => [file.path, file.sha256]));
  if (codeFilesByPath.size !== G3B_CODE_IDENTITY_PATHS.size
    || ![...G3B_CODE_IDENTITY_PATHS].every((path) => codeFilesByPath.has(path))
    || codeFilesByPath.get(manifest.policy.path) !== manifest.policy.sha256
    || codeFilesByPath.get(manifest.brandRegistry.path) !== manifest.brandRegistry.fileSha256) {
    return resultFailure('INVALID_CANARY_MANIFEST');
  }
  const sourcesById = new Map(manifest.sourceExpectations.map((source) => [source.sourceId, source]));
  const sourceHashes = new Set(manifest.sourceExpectations.map((source) => source.sourcePdfSha256));
  const fixtureIds = new Set();
  for (const fixture of manifest.fixtures) {
    const validation = validateFixtureExpectation(fixture, new Set(sourcesById.keys()));
    const source = sourcesById.get(fixture.sourceId);
    if (!validation.ok
      || fixtureIds.has(fixture.fixtureId)
      || !source.blocks.some((block) => (
        block.sourceJsonPointer === fixture.target.sourceJsonPointer
        && block.pageNumber === fixture.target.pageNumber
        && block.fragmentSha256 === fixture.target.fragmentSha256
      ))) {
      return resultFailure('INVALID_CANARY_MANIFEST');
    }
    fixtureIds.add(fixture.fixtureId);
  }
  if (fixtureIds.size === 0 || !Array.isArray(manifest.profileWitnesses) || manifest.profileWitnesses.length === 0) {
    return resultFailure('INVALID_CANARY_MANIFEST');
  }
  const profileIds = new Set();
  for (const witness of manifest.profileWitnesses) {
    const validation = validateProfileWitnessExpectation(witness, sourceHashes, fixtureIds);
    if (!validation.ok || profileIds.has(witness.profileId)) return resultFailure('INVALID_CANARY_MANIFEST');
    profileIds.add(witness.profileId);
    for (const negative of witness.negativeWitnesses) {
      const fixture = manifest.fixtures.find((entry) => entry.fixtureId === negative.fixtureId);
      if (sourcesById.get(fixture.sourceId).sourcePdfSha256 !== negative.sourcePdfSha256) {
        return resultFailure('INVALID_CANARY_MANIFEST');
      }
    }
  }
  if (!exactKeys(manifest.historicalOcrAttempt, ATTESTATION_HISTORICAL_OCR_KEYS)
    || !validRelativeObjectPath(manifest.historicalOcrAttempt.recordObjectPath)
    || !validSha256(manifest.historicalOcrAttempt.recordSha256)
    || manifest.historicalOcrAttempt.status !== 'INCOMPLETE_RECORDED_TOOL_PROVENANCE'
    || !sameStringSet(manifest.historicalOcrAttempt.unrecordedProfileFlags, ['tableEnabled', 'formulaEnabled'])
    || manifest.historicalOcrAttempt.completeToolAttestation !== false) {
    return resultFailure('INVALID_CANARY_MANIFEST');
  }
  return resultSuccess({ sourcesById, fixtureIds, profileIds });
}

function validateRegistryForAttestation(untrustedRegistry, manifest) {
  const registry = strictJsonClone(untrustedRegistry);
  if (!exactKeys(registry, ['brandRegistry', 'brandRegistrySha256', 'profilePolicy'])
    || registry.brandRegistrySha256 !== manifest.brandRegistry.registrySha256
    || canonicalSha256(registry.brandRegistry) !== manifest.brandRegistry.registrySha256
    || !isPlainObject(registry.profilePolicy)
    || registry.profilePolicy.policySha256 !== manifest.policy.policySha256) {
    return resultFailure('REGISTRY_OR_POLICY_IDENTITY_MISMATCH');
  }
  return resultSuccess({ registry });
}

function validateSuppliedCodeIdentity(untrustedCodeIdentity, expectedCodeIdentity) {
  const codeIdentity = strictJsonClone(untrustedCodeIdentity);
  const shape = validateCodeIdentityShape(codeIdentity);
  if (!shape.ok || !sameCanonical(codeIdentity, expectedCodeIdentity)) {
    return resultFailure('CODE_IDENTITY_MISMATCH');
  }
  return resultSuccess({ codeIdentity });
}

function sourceBlockExpectation(source, pointer) {
  return source.blocks.find((block) => block.sourceJsonPointer === pointer) ?? null;
}

function sourcePageExpectation(source, pageNumber) {
  return source.renderedPages.find((page) => page.pageNumber === pageNumber) ?? null;
}

function validatedPortablePayload(payload, expectedFixture, source, originalSourceState = null) {
  if (!exactKeys(payload, ['fixtureKind', 'sourceBytesIncluded', 'document', 'mineruDocument', 'nativeObservations', 'pageImageMetadata'])
    || payload.fixtureKind !== 'sanitized_portable_region_fixture'
    || payload.sourceBytesIncluded !== false
    || !exactKeys(payload.document, ['brandId', 'category', 'documentType', 'sourcePdfSha256'])
    || typeof payload.document.brandId !== 'string'
    || typeof payload.document.category !== 'string'
    || payload.document.documentType !== 'manufacturer_product_sheet'
    || !exactKeys(payload.mineruDocument, ['contentSha256', 'pageCount', 'blocks'])
    || !validSha256(payload.mineruDocument.contentSha256)
    || !validPositiveInteger(payload.mineruDocument.pageCount)
    || !Array.isArray(payload.mineruDocument.blocks)
    || !Array.isArray(payload.nativeObservations)
    || !Array.isArray(payload.pageImageMetadata)) {
    return resultFailure('INVALID_FIXTURE_PAYLOAD');
  }
  if (payload.document.sourcePdfSha256 !== source.sourcePdfSha256) {
    return resultFailure('FIXTURE_SOURCE_PDF_MISMATCH');
  }
  if (payload.mineruDocument.contentSha256 !== source.selectedMineruJsonSha256
    || payload.mineruDocument.pageCount !== source.pageCount) {
    return resultFailure('FIXTURE_MINERU_IDENTITY_MISMATCH');
  }
  const pointers = new Set();
  for (const block of payload.mineruDocument.blocks) {
    if (!exactKeys(block, ['sourceJsonPointer', 'pageNumber', 'fragmentSha256', 'rawBlock'])
      || typeof block.sourceJsonPointer !== 'string'
      || !validPositiveInteger(block.pageNumber)
      || !validSha256(block.fragmentSha256)
      || !isPlainObject(block.rawBlock)
      || pointers.has(block.sourceJsonPointer)) {
      return resultFailure('INVALID_FIXTURE_PAYLOAD');
    }
    pointers.add(block.sourceJsonPointer);
    const expectedBlock = sourceBlockExpectation(source, block.sourceJsonPointer);
    if (!expectedBlock
      || expectedBlock.pageNumber !== block.pageNumber
      || expectedBlock.fragmentSha256 !== block.fragmentSha256
      || expectedBlock.rawBlockCanonicalSha256 !== canonicalSha256(block.rawBlock)) {
      return resultFailure('FIXTURE_RAW_BLOCK_MISMATCH');
    }
    if (originalSourceState) {
      const actualBlock = originalSourceState.blocks.get(block.sourceJsonPointer);
      if (!actualBlock || !sameCanonical(actualBlock, block.rawBlock)) {
        return resultFailure('ORIGINAL_RAW_BLOCK_MISMATCH');
      }
    }
  }
  const targetBlock = payload.mineruDocument.blocks.find((block) => (
    block.sourceJsonPointer === expectedFixture.target.sourceJsonPointer
    && block.pageNumber === expectedFixture.target.pageNumber
    && block.fragmentSha256 === expectedFixture.target.fragmentSha256
  ));
  if (!targetBlock) return resultFailure('FIXTURE_TARGET_MISMATCH');

  const metadataPages = new Set();
  let targetMetadata = null;
  for (const metadata of payload.pageImageMetadata) {
    if (!exactKeys(metadata, [
      'sourcePdfSha256',
      'pageNumber',
      'renderedPageArtifactSha256',
      'renderedPixels',
      'rotationDegreesClockwise',
      'transform',
      'artifactRecords',
      'fragments',
    ])
      || !validSha256(metadata.sourcePdfSha256)
      || !validPositiveInteger(metadata.pageNumber)
      || !validSha256(metadata.renderedPageArtifactSha256)
      || !validRenderedPixels(metadata.renderedPixels)
      || !ALLOWED_ROTATIONS.has(metadata.rotationDegreesClockwise)
      || !isPlainObject(metadata.transform)
      || !Array.isArray(metadata.artifactRecords)
      || !Array.isArray(metadata.fragments)
      || metadataPages.has(metadata.pageNumber)) {
      return resultFailure('INVALID_FIXTURE_PAGE_PROVENANCE');
    }
    metadataPages.add(metadata.pageNumber);
    const expectedPage = sourcePageExpectation(source, metadata.pageNumber);
    if (!expectedPage
      || metadata.sourcePdfSha256 !== source.sourcePdfSha256
      || metadata.renderedPageArtifactSha256 !== expectedPage.sha256
      || !sameCanonical(metadata.renderedPixels, expectedPage.renderedPixels)
      || metadata.rotationDegreesClockwise !== expectedPage.rotationDegreesClockwise
      || !sameCanonical(metadata.transform, expectedPage.transform)) {
      return resultFailure('FIXTURE_PAGE_PROVENANCE_MISMATCH');
    }
    if (originalSourceState) {
      const actualPage = originalSourceState.renderedPages.get(metadata.pageNumber);
      if (!actualPage
        || actualPage.sha256 !== metadata.renderedPageArtifactSha256
        || !sameCanonical(actualPage.renderedPixels, metadata.renderedPixels)
        || actualPage.rotationDegreesClockwise !== metadata.rotationDegreesClockwise
        || !sameCanonical(actualPage.transform, metadata.transform)) {
        return resultFailure('ORIGINAL_PAGE_PROVENANCE_MISMATCH');
      }
      if (metadata.artifactRecords.some((record) => !sameCanonical(
        record, originalSourceState.artifactRecords.get(record?.sha256),
      )) || metadata.fragments.some((fragment) => !sameCanonical(
        fragment, originalSourceState.pdfBboxFragments.get(fragment?.fragmentSha256),
      ))) {
        return resultFailure('ORIGINAL_IMAGE_ANCHOR_MISMATCH');
      }
    }
    if (metadata.pageNumber === expectedFixture.target.pageNumber) targetMetadata = metadata;
  }
  if (expectedFixture.expected.requiresPageRender && !targetMetadata) {
    return resultFailure('MISSING_REQUIRED_PAGE_RENDER');
  }
  return resultSuccess({ targetBlock });
}

function evaluateFixture({ fixturePayload, expectedFixture, source, registry, originalSourceState = null }) {
  const payloadValidation = validatedPortablePayload(
    fixturePayload.payload,
    expectedFixture,
    source,
    originalSourceState,
  );
  if (!payloadValidation.ok) return payloadValidation;
  const inspection = inspectExtractionRegions({
    nativeObservations: fixturePayload.payload.nativeObservations,
    mineruDocument: {
      ...fixturePayload.payload.mineruDocument,
      sourcePdfSha256: fixturePayload.payload.document.sourcePdfSha256,
    },
    pageImageMetadata: fixturePayload.payload.pageImageMetadata,
  });
  if (inspection.status !== 'inspected') return resultFailure('FIXTURE_INSPECTION_INCOMPLETE');
  const region = inspection.regions.find((candidate) => (
    candidate.sourceJsonPointer === expectedFixture.target.sourceJsonPointer
    && candidate.pageNumber === expectedFixture.target.pageNumber
    && candidate.fragmentSha256 === expectedFixture.target.fragmentSha256
  ));
  if (!region) return resultFailure('FIXTURE_TARGET_MISMATCH');
  const selectedProfile = selectDocumentProfile({
    registry,
    brandId: fixturePayload.payload.document.brandId,
    category: fixturePayload.payload.document.category,
    documentType: fixturePayload.payload.document.documentType,
    regionObservation: region,
  });
  if (selectedProfile.status !== 'selected'
    || selectedProfile.profile.profileId !== expectedFixture.expected.profileId
    || selectedProfile.profile.profileSha256 !== expectedFixture.expected.profileSha256) {
    return resultFailure('FIXTURE_PROFILE_MISMATCH');
  }
  const route = routeExtractionRegion({ regionObservation: region, selectedProfile });
  if (route.status !== 'routed'
    || route.candidateStatus !== 'STRUCTURAL_CANDIDATE_ONLY'
    || route.profileId !== expectedFixture.expected.profileId
    || route.fragmentSha256 !== expectedFixture.target.fragmentSha256
    || route.route !== expectedFixture.expected.route) {
    return resultFailure('FIXTURE_ROUTE_MISMATCH');
  }
  return resultSuccess({
    inspectionStatus: inspection.status,
    selectionStatus: selectedProfile.status,
    result: {
      fixtureId: expectedFixture.fixtureId,
      sourceId: expectedFixture.sourceId,
      sourcePdfSha256: source.sourcePdfSha256,
      profileId: route.profileId,
      route: route.route,
      regionId: route.regionId,
      status: 'pass',
      gaps: route.reasons.filter((reason) => reason !== 'STRUCTURAL_ROUTING_ONLY'),
    },
  });
}

function mapFixturePayloads(manifest, suppliedFixtures) {
  if (!Array.isArray(suppliedFixtures) || suppliedFixtures.length !== manifest.fixtures.length) {
    return resultFailure('FIXTURE_SET_MISMATCH');
  }
  const expectedById = new Map(manifest.fixtures.map((fixture) => [fixture.fixtureId, fixture]));
  const payloadsById = new Map();
  for (const fixturePayload of suppliedFixtures) {
    if (!exactKeys(fixturePayload, ATTESTATION_FIXTURE_PAYLOAD_KEYS)
      || typeof fixturePayload.fixtureId !== 'string'
      || !validSha256(fixturePayload.fileSha256)
      || !isPlainObject(fixturePayload.payload)
      || payloadsById.has(fixturePayload.fixtureId)) {
      return resultFailure('INVALID_PORTABLE_FIXTURES');
    }
    const expected = expectedById.get(fixturePayload.fixtureId);
    if (!expected || fixturePayload.fileSha256 !== expected.fixtureFileSha256) {
      return resultFailure('FIXTURE_FILE_IDENTITY_MISMATCH');
    }
    payloadsById.set(fixturePayload.fixtureId, fixturePayload);
  }
  if (payloadsById.size !== expectedById.size) return resultFailure('FIXTURE_SET_MISMATCH');
  return resultSuccess({ payloadsById, expectedById });
}

function verifyActiveProfileWitnesses({ manifest, registry, fixtureResultsById, payloadsById, sourcesById, originalStates }) {
  const profiles = registry.profilePolicy.profiles;
  if (!Array.isArray(profiles)) return resultFailure('REGISTRY_OR_POLICY_IDENTITY_MISMATCH');
  const activeProfiles = profiles.filter((profile) => profile?.status === 'active');
  const witnessById = new Map(manifest.profileWitnesses.map((witness) => [witness.profileId, witness]));
  if (activeProfiles.length === 0 || activeProfiles.length !== witnessById.size) {
    return resultFailure('ACTIVE_PROFILE_WITNESS_MISMATCH');
  }
  const negativeResults = [];
  const sourceIdentityTamperResults = [];
  for (const profile of activeProfiles) {
    const witness = witnessById.get(profile.profileId);
    if (!witness
      || profile.profileSha256 !== witness.profileSha256
      || !isPlainObject(profile.canaryWitnesses)
      || !sameStringSet(profile.canaryWitnesses.positiveSourceSha256s, witness.positiveSourceSha256s)
      || !sameStringSet(profile.canaryWitnesses.negativeSourceSha256s, witness.negativeSourceSha256s)) {
      return resultFailure('ACTIVE_PROFILE_WITNESS_MISMATCH');
    }
    for (const fixtureId of witness.fixtureIds) {
      const fixtureResult = fixtureResultsById.get(fixtureId);
      if (!fixtureResult
        || fixtureResult.profileId !== profile.profileId
        || !witness.positiveSourceSha256s.includes(fixtureResult.sourcePdfSha256)) {
        return resultFailure('ACTIVE_PROFILE_WITNESS_MISMATCH');
      }
    }
    for (const negative of witness.negativeWitnesses) {
      const alternate = manifest.fixtures.find((fixture) => fixture.fixtureId === negative.fixtureId);
      const source = sourcesById.get(alternate.sourceId);
      const evaluated = evaluateFixture({
        fixturePayload: payloadsById.get(negative.fixtureId),
        expectedFixture: alternate,
        source,
        registry,
        originalSourceState: originalStates?.get(alternate.sourceId) ?? null,
      });
      if (!evaluated.ok
        || evaluated.inspectionStatus !== 'inspected'
        || evaluated.selectionStatus !== negative.expected.status
        || evaluated.result.profileId === profile.profileId
        || evaluated.result.profileId !== negative.expected.profileId
        || evaluated.result.route !== negative.expected.route) {
        return resultFailure('NEGATIVE_PROFILE_WITNESS_MISMATCH');
      }
      negativeResults.push({
        profileId: profile.profileId,
        fixtureId: negative.fixtureId,
        sourcePdfSha256: source.sourcePdfSha256,
        sourceJsonPointer: alternate.target.sourceJsonPointer,
        fragmentSha256: alternate.target.fragmentSha256,
        inspectionStatus: evaluated.inspectionStatus,
        selectionStatus: evaluated.selectionStatus,
        selectedProfileId: evaluated.result.profileId,
        route: evaluated.result.route,
        status: 'pass',
        reason: 'TARGET_PROFILE_NOT_SELECTED',
      });
    }
    const fixtureId = witness.fixtureIds[0];
    const expectedFixture = manifest.fixtures.find((fixture) => fixture.fixtureId === fixtureId);
    const source = sourcesById.get(expectedFixture.sourceId);
    const fixturePayload = payloadsById.get(fixtureId);
    for (const replacementSourcePdfSha256 of witness.negativeSourceSha256s) {
      const mutatedPayload = structuredClone(fixturePayload);
      mutatedPayload.payload.document.sourcePdfSha256 = replacementSourcePdfSha256;
      const negative = evaluateFixture({
        fixturePayload: mutatedPayload,
        expectedFixture,
        source,
        registry,
      });
      if (negative.ok
        || negative.reason !== witness.sourceIdentityTamper.expected.reason
        || witness.sourceIdentityTamper.expected.status !== 'fail') {
        return resultFailure('SOURCE_IDENTITY_TAMPER_DID_NOT_FAIL');
      }
      sourceIdentityTamperResults.push({
        profileId: profile.profileId,
        sourcePdfSha256: replacementSourcePdfSha256,
        status: 'pass',
        reason: negative.reason,
      });
    }
  }
  return resultSuccess({ negativeResults, sourceIdentityTamperResults, activeProfiles });
}

function decodeBase64Bytes(value) {
  if (typeof value !== 'string' || value.length === 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    return null;
  }
  const bytes = Buffer.from(value, 'base64');
  return bytes.toString('base64') === value ? bytes : null;
}

function parseJsonBytes(bytes) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    return null;
  }
}

function strictPointer(document, pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) return null;
  let current = document;
  for (const encoded of pointer.slice(1).split('/')) {
    const key = encoded.replaceAll('~1', '/').replaceAll('~0', '~');
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, key)) return null;
    current = current[key];
  }
  return current;
}

function pngPixels(bytes) {
  if (!Buffer.isBuffer(bytes)
    || bytes.length < 24
    || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    return null;
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function decodeObservedBytes(value, expectedPath) {
  if (!exactKeys(value, ORIGINAL_BYTES_KEYS) || value.objectPath !== expectedPath) return null;
  return decodeBase64Bytes(value.bytesBase64);
}

function verifyAcceptedBatch({ observed, manifest }) {
  const bytes = decodeObservedBytes(observed, manifest.acceptedBatch.objectPath);
  if (!bytes || sha256(bytes) !== manifest.acceptedBatch.sha256) {
    return resultFailure('ACCEPTED_BATCH_IDENTITY_MISMATCH');
  }
  const batch = parseJsonBytes(bytes);
  if (!isPlainObject(batch)
    || batch.kind !== 'real_canary_preparation_batch_report'
    || batch.schemaVersion !== 2
    || batch.researchStatus !== 'RAW_OBSERVATIONS_REQUIRE_G3B_G4_WITNESS'
    || batch.publicationStatus !== 'NOT_EVALUATED_CANDIDATE_ONLY'
    || !isPlainObject(batch.scope)
    || batch.scope.targetCount !== 3
    || batch.scope.sourceCount !== 3
    || batch.scope.denominator !== 'three_explicit_selected_source_owners_only'
    || !isPlainObject(batch.outputs)
    || !Array.isArray(batch.outputs.lineageChunks)
    || !Array.isArray(batch.outputs.renderedPageObjects)
    || !Array.isArray(batch.parallelCandidateConversions)) {
    return resultFailure('ACCEPTED_BATCH_SCHEMA_MISMATCH');
  }
  for (const source of manifest.sourceExpectations) {
    if (!batch.outputs.lineageChunks.some((chunk) => (
      chunk?.contentSha256 === source.lineageSha256 && chunk?.objectPath === source.lineageObjectPath
    ))) {
      return resultFailure('ACCEPTED_BATCH_LINEAGE_MISMATCH');
    }
    for (const expectedPage of source.renderedPages) {
      if (!batch.outputs.renderedPageObjects.some((page) => (
        page?.contentSha256 === expectedPage.sha256
        && page?.objectPath === expectedPage.objectPath
        && page?.pageNumber === expectedPage.pageNumber
        && sameCanonical(page?.renderedPixels, expectedPage.renderedPixels)
        && page?.rotationDegreesClockwise === expectedPage.rotationDegreesClockwise
      ))) {
        return resultFailure('ACCEPTED_BATCH_RENDER_MISMATCH');
      }
    }
  }
  const historical = manifest.historicalOcrAttempt;
  const batchAttempt = batch.parallelCandidateConversions.find((attempt) => (
    attempt?.recordObjectPath === historical.recordObjectPath && attempt?.recordSha256 === historical.recordSha256
  ));
  if (!batchAttempt
    || batchAttempt?.toolProvenance?.status !== historical.status
    || !sameStringSet(batchAttempt?.toolProvenance?.unrecordedProfileFlags, historical.unrecordedProfileFlags)
    || batchAttempt?.requiredRegion?.completion !== 'NOT_SUPPLIED'
    || batchAttempt?.selectionDisposition !== 'PARALLEL_CANDIDATE_NOT_SELECTED') {
    return resultFailure('HISTORICAL_OCR_LIMITATION_MISMATCH');
  }
  return resultSuccess({ batch });
}

function verifyHistoricalOcrRecord({ observed, manifest }) {
  const expected = manifest.historicalOcrAttempt;
  const bytes = decodeObservedBytes(observed, expected.recordObjectPath);
  if (!bytes || sha256(bytes) !== expected.recordSha256) {
    return resultFailure('HISTORICAL_OCR_RECORD_IDENTITY_MISMATCH');
  }
  const record = parseJsonBytes(bytes);
  if (!isPlainObject(record)
    || record.kind !== 'real_canary_bdf1620w_p2_local_mineru_attempt'
    || record.schemaVersion !== 1
    || record.status !== 'SUCCEEDED'
    || record.outputDisposition !== 'PARALLEL_CANDIDATE_NOT_SELECTED'
    || record.readjudication !== 'NOT_PERFORMED'
    || record.publicationStatus !== 'NOT_EVALUATED_CANDIDATE_ONLY'
    || !isPlainObject(record.result)
    || record.result?.inspection?.format !== 'content_list_v2'
    || record.result?.inspection?.pageCount !== 2) {
    return resultFailure('HISTORICAL_OCR_RECORD_SCHEMA_MISMATCH');
  }
  return resultSuccess();
}

function matchingLineageFragment(lineage, pointer) {
  if (!Array.isArray(lineage.fragments)) return null;
  return lineage.fragments.find((fragment) => fragment?.pointer === pointer) ?? null;
}

function verifyOriginalSource({ observed, expected, manifest }) {
  if (!exactKeys(observed, ORIGINAL_SOURCE_KEYS)
    || observed.sourceId !== expected.sourceId
    || !Array.isArray(observed.renderedPages)
    || observed.renderedPages.length !== expected.renderedPages.length) {
    return resultFailure('ORIGINAL_SOURCE_OBSERVATION_MISMATCH');
  }
  const pdfBytes = decodeObservedBytes(observed.sourcePdf, expected.sourcePdfObjectPath);
  const mineruBytes = decodeObservedBytes(observed.selectedMineruJson, expected.selectedMineruJsonObjectPath);
  const lineageBytes = decodeObservedBytes(observed.lineage, expected.lineageObjectPath);
  if (!pdfBytes || sha256(pdfBytes) !== expected.sourcePdfSha256) {
    return resultFailure('ORIGINAL_PDF_IDENTITY_MISMATCH');
  }
  if (!mineruBytes || sha256(mineruBytes) !== expected.selectedMineruJsonSha256) {
    return resultFailure('ORIGINAL_MINERU_IDENTITY_MISMATCH');
  }
  if (!lineageBytes || sha256(lineageBytes) !== expected.lineageSha256) {
    return resultFailure('ORIGINAL_LINEAGE_IDENTITY_MISMATCH');
  }
  const mineruDocument = parseJsonBytes(mineruBytes);
  const lineage = parseJsonBytes(lineageBytes);
  if (!Array.isArray(mineruDocument)
    || mineruDocument.length !== expected.pageCount
    || !isPlainObject(lineage)
    || lineage.kind !== 'g3a_real_canary_candidate_lineage_chunk'
    || lineage.targetId === undefined
    || !isPlainObject(lineage.original)
    || lineage.original.sourcePdfSha256 !== expected.sourcePdfSha256
    || lineage.original.sourceObjectPath !== expected.sourcePdfObjectPath
    || lineage.original.selectedMineruJsonSha256 !== expected.selectedMineruJsonSha256
    || lineage.original.selectedMineruJsonObjectPath !== expected.selectedMineruJsonObjectPath
    || lineage.original?.inspection?.format !== manifest.toolIdentity.selectedMineru.format
    || lineage.original?.inspection?.pageCount !== expected.pageCount
    || lineage.renderingAttestation?.status !== 'SUCCEEDED'
    || lineage.renderingAttestation?.renderer?.binarySha256 !== manifest.toolIdentity.renderer.binarySha256
    || lineage.renderingAttestation?.renderer?.version !== manifest.toolIdentity.renderer.version
    || !sameCanonical(lineage.renderingAttestation?.renderer?.commandOptions, manifest.toolIdentity.renderer.commandOptions)) {
    return resultFailure('ORIGINAL_LINEAGE_SCHEMA_MISMATCH');
  }
  const mineruArtifact = Array.isArray(lineage.artifactRecords)
    ? lineage.artifactRecords.find((artifact) => artifact?.sha256 === expected.selectedMineruJsonSha256)
    : null;
  if (!mineruArtifact
    || mineruArtifact.parentSha256 !== expected.sourcePdfSha256
    || mineruArtifact.mediaType !== 'application/json'
    || mineruArtifact.toolRevision !== expected.selectedMineruToolRevision) {
    return resultFailure('ORIGINAL_TOOL_IDENTITY_MISMATCH');
  }

  const renderedPages = new Map();
  const renderedPageNumbers = new Set();
  for (const observedPage of observed.renderedPages) {
    if (!exactKeys(observedPage, ORIGINAL_RENDERED_PAGE_KEYS)
      || !validPositiveInteger(observedPage.pageNumber)
      || renderedPageNumbers.has(observedPage.pageNumber)) {
      return resultFailure('ORIGINAL_RENDER_OBSERVATION_MISMATCH');
    }
    renderedPageNumbers.add(observedPage.pageNumber);
    const expectedPage = sourcePageExpectation(expected, observedPage.pageNumber);
    const bytes = expectedPage && observedPage.objectPath === expectedPage.objectPath
      ? decodeBase64Bytes(observedPage.bytesBase64)
      : null;
    const pixels = bytes ? pngPixels(bytes) : null;
    const lineagePage = expectedPage && Array.isArray(lineage.renderedPages)
      ? lineage.renderedPages.find((page) => page?.pageNumber === expectedPage.pageNumber)
      : null;
    if (!expectedPage
      || !bytes
      || sha256(bytes) !== expectedPage.sha256
      || !pixels
      || !sameCanonical(pixels, expectedPage.renderedPixels)
      || !lineagePage
      || lineagePage.contentSha256 !== expectedPage.sha256
      || lineagePage.objectPath !== expectedPage.objectPath
      || !sameCanonical(lineagePage.renderedPixels, expectedPage.renderedPixels)
      || lineagePage.rotationDegreesClockwise !== expectedPage.rotationDegreesClockwise) {
      return resultFailure('ORIGINAL_RENDER_PROVENANCE_MISMATCH');
    }
    renderedPages.set(expectedPage.pageNumber, {
      sha256: expectedPage.sha256,
      renderedPixels: expectedPage.renderedPixels,
      rotationDegreesClockwise: expectedPage.rotationDegreesClockwise,
      transform: expectedPage.transform,
    });
  }

  const blocks = new Map();
  for (const expectedBlock of expected.blocks) {
    const rawBlock = strictPointer(mineruDocument, expectedBlock.sourceJsonPointer);
    const lineageFragment = matchingLineageFragment(lineage, expectedBlock.sourceJsonPointer);
    const expectedPage = sourcePageExpectation(expected, expectedBlock.pageNumber);
    const jsonPointerFragment = lineageFragment?.jsonPointerFragment;
    const pdfBboxFragment = lineageFragment?.pdfBboxFragment;
    const locator = pdfBboxFragment?.locator;
    if (!isPlainObject(rawBlock)
      || canonicalSha256(rawBlock) !== expectedBlock.rawBlockCanonicalSha256
      || !lineageFragment
      || lineageFragment.pageNumber !== expectedBlock.pageNumber
      || !isPlainObject(jsonPointerFragment)
      || jsonPointerFragment.fragmentSha256 !== expectedBlock.fragmentSha256
      || jsonPointerFragment.parentArtifactSha256 !== expected.selectedMineruJsonSha256
      || !sameCanonical(jsonPointerFragment.content, rawBlock)
      || jsonPointerFragment?.locator?.kind !== 'json_pointer'
      || jsonPointerFragment?.locator?.pointer !== expectedBlock.sourceJsonPointer
      || !isPlainObject(pdfBboxFragment)
      || pdfBboxFragment.parentArtifactSha256 !== expected.sourcePdfSha256
      || !sameCanonical(pdfBboxFragment.content, rawBlock)
      || !isPlainObject(locator)
      || locator.kind !== 'pdf_bbox'
      || locator.pageNumber !== expectedBlock.pageNumber
      || !sameCanonical(locator.normalizedTopLeftBox, rawBlock.bbox)
      || locator.renderedPageArtifactSha256 !== expectedPage.sha256
      || !sameCanonical(locator.renderedPixels, expectedPage.renderedPixels)
      || locator.rotationDegreesClockwise !== expectedPage.rotationDegreesClockwise
      || !sameCanonical(locator.transform, expectedPage.transform)) {
      return resultFailure('ORIGINAL_RAW_BLOCK_PROVENANCE_MISMATCH');
    }
    try {
      createFragment({
        fragmentSha256: expectedBlock.fragmentSha256,
        content: rawBlock,
        parentArtifactSha256: expected.selectedMineruJsonSha256,
        locator: { kind: 'json_pointer', pointer: expectedBlock.sourceJsonPointer },
      });
    } catch {
      return resultFailure('ORIGINAL_RAW_FRAGMENT_IDENTITY_MISMATCH');
    }
    blocks.set(expectedBlock.sourceJsonPointer, rawBlock);
  }
  return resultSuccess({ sourceState: {
    blocks, renderedPages,
    artifactRecords: new Map(lineage.artifactRecords.map((record) => [record.sha256, record])),
    pdfBboxFragments: new Map(lineage.fragments.map((entry) => [entry.pdfBboxFragment.fragmentSha256, entry.pdfBboxFragment])),
  } });
}

function verifyOriginalObjects({ originalObjects, manifest }) {
  if (!exactKeys(originalObjects, ORIGINAL_OBJECT_KEYS)
    || originalObjects.schemaVersion !== 1
    || !Array.isArray(originalObjects.sources)
    || originalObjects.sources.length !== manifest.sourceExpectations.length) {
    return resultFailure('INVALID_ORIGINAL_OBJECT_OBSERVATION');
  }
  const batch = verifyAcceptedBatch({ observed: originalObjects.acceptedBatch, manifest });
  if (!batch.ok) return batch;
  const historical = verifyHistoricalOcrRecord({ observed: originalObjects.historicalOcrAttempt, manifest });
  if (!historical.ok) return historical;
  const expectedById = new Map(manifest.sourceExpectations.map((source) => [source.sourceId, source]));
  const statesById = new Map();
  for (const source of originalObjects.sources) {
    if (!isPlainObject(source) || statesById.has(source.sourceId)) {
      return resultFailure('INVALID_ORIGINAL_OBJECT_OBSERVATION');
    }
    const expected = expectedById.get(source.sourceId);
    if (!expected) return resultFailure('ORIGINAL_SOURCE_OBSERVATION_MISMATCH');
    const verified = verifyOriginalSource({ observed: source, expected, manifest });
    if (!verified.ok) return verified;
    statesById.set(source.sourceId, verified.sourceState);
  }
  if (statesById.size !== expectedById.size) return resultFailure('ORIGINAL_SOURCE_OBSERVATION_MISMATCH');
  return resultSuccess({ statesById });
}

/**
 * Pure canary boundary. The CLI supplies file bytes and parsed portable fixture
 * payloads; this module never reads an evidence store or treats caller counts
 * or a caller-authored status as an attestation result.
 */
export function verifyProfileCanaryAttestation(input = {}) {
  const attestationInput = strictJsonClone(input);
  if (!isPlainObject(attestationInput)
    || !Object.hasOwn(attestationInput, 'manifest')
    || !Object.hasOwn(attestationInput, 'portableFixtures')
    || !Object.hasOwn(attestationInput, 'codeIdentity')) {
    return attestationEnvelope('not_run', ['MISSING_CANARY_INPUT']);
  }
  const manifestValidation = validateManifest(attestationInput.manifest);
  if (!manifestValidation.ok) return attestationEnvelope('fail', [manifestValidation.reason]);
  const { manifest } = manifestValidation;
  const relationshipValidation = validateManifestRelationships(manifest);
  if (!relationshipValidation.ok) return attestationEnvelope('fail', [relationshipValidation.reason]);
  const inputValidation = validateAttestationInputShape(attestationInput.portableFixtures);
  if (!inputValidation.ok) return attestationEnvelope('fail', [inputValidation.reason]);
  const { fixtures } = inputValidation;
  if (fixtures.mode === 'original-objects' && !Object.hasOwn(fixtures, 'originalObjects')) {
    return attestationEnvelope('blocked', ['MISSING_ORIGINAL_OBJECTS'], {
      mode: fixtures.mode,
      historicalOcrToolAttestation: 'INCOMPLETE_RECORDED_TOOL_PROVENANCE',
    });
  }
  const codeIdentity = validateSuppliedCodeIdentity(attestationInput.codeIdentity, manifest.codeIdentity);
  if (!codeIdentity.ok) return attestationEnvelope('fail', [codeIdentity.reason], { mode: fixtures.mode });
  const registry = validateRegistryForAttestation(fixtures.registry, manifest);
  if (!registry.ok) return attestationEnvelope('fail', [registry.reason], { mode: fixtures.mode });
  const payloads = mapFixturePayloads(manifest, fixtures.fixtures);
  if (!payloads.ok) return attestationEnvelope('fail', [payloads.reason], { mode: fixtures.mode });

  let originalStates = null;
  if (fixtures.mode === 'original-objects') {
    const originals = verifyOriginalObjects({ originalObjects: fixtures.originalObjects, manifest });
    if (!originals.ok) return attestationEnvelope('fail', [originals.reason], { mode: fixtures.mode });
    originalStates = originals.statesById;
  }

  const fixtureResults = [];
  const fixtureResultsById = new Map();
  const sourcesById = new Map(manifest.sourceExpectations.map((source) => [source.sourceId, source]));
  for (const expectedFixture of manifest.fixtures) {
    const evaluated = evaluateFixture({
      fixturePayload: payloads.payloadsById.get(expectedFixture.fixtureId),
      expectedFixture,
      source: sourcesById.get(expectedFixture.sourceId),
      registry: registry.registry,
      originalSourceState: originalStates?.get(expectedFixture.sourceId) ?? null,
    });
    if (!evaluated.ok) {
      return attestationEnvelope('fail', [evaluated.reason], {
        mode: fixtures.mode,
        fixtureResults,
        failedFixtureId: expectedFixture.fixtureId,
      });
    }
    fixtureResults.push(evaluated.result);
    fixtureResultsById.set(expectedFixture.fixtureId, evaluated.result);
  }
  const witnesses = verifyActiveProfileWitnesses({
    manifest,
    registry: registry.registry,
    fixtureResultsById,
    payloadsById: payloads.payloadsById,
    sourcesById,
    originalStates,
  });
  if (!witnesses.ok) {
    return attestationEnvelope('fail', [witnesses.reason], {
      mode: fixtures.mode,
      fixtureResults,
    });
  }
  return attestationEnvelope('pass', [], {
    mode: fixtures.mode,
    fixtureResults,
    negativeWitnessResults: witnesses.negativeResults,
    sourceIdentityTamperResults: witnesses.sourceIdentityTamperResults,
    summary: {
      fixtures: fixtureResults.length,
      activeProfiles: witnesses.activeProfiles.length,
      negativeSourceWitnesses: witnesses.negativeResults.length,
      sourceIdentityTamperControls: witnesses.sourceIdentityTamperResults.length,
      originalObjectsBound: fixtures.mode === 'original-objects',
    },
    historicalOcrToolAttestation: 'INCOMPLETE_RECORDED_TOOL_PROVENANCE',
  });
}
