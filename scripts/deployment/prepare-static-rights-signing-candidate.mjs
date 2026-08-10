import { createHash, verify } from 'node:crypto';
import {
  closeSync,
  constants,
  copyFileSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  STATIC_RIGHTS_ACTION,
  STATIC_RIGHTS_CLASSIFIER_ID,
  buildAttributionRouteReceipt,
  buildDependencyScopeHash,
  buildStaticSourceInventory,
  canonicalJson,
  classifyStaticSources,
  semanticId,
  validateAuthoritySet,
  validateGeneratedProvenanceRepositoryBindings,
} from '../../src/domain/static-publication-rights.mjs';
import {
  validateRouteTerminations,
  validateToolchainContract,
} from './reviewed-static-deployment.mjs';

const HEX_64 = /^[0-9a-f]{64}$/;
const EXPECTED_DEPENDENCIES = [
  'ENERGY_RATING_CC_BY',
  'FIRST_PARTY',
  'GOOGLE_VERIFICATION',
  'OUTFIT_FONT',
  'WEB_VITALS_APACHE_2',
];
const PUBLIC_EVIDENCE_BY_DEPENDENCY = {
  ENERGY_RATING_CC_BY: ['cc-by-3.0-au-legalcode', 'energy-rating-dataset-metadata'],
  FIRST_PARTY: [],
  GOOGLE_VERIFICATION: ['google-search-console-html-verification'],
  OUTFIT_FONT: ['outfit-ofl-1.1'],
  WEB_VITALS_APACHE_2: ['web-vitals-v4.2.4-license'],
};
const PUBLIC_EVIDENCE_SPECS = {
  'google-search-console-html-verification': {
    requestedUrl: 'https://support.google.com/webmasters/answer/9008080?hl=en',
    mediaType: 'text/html',
  },
  'web-vitals-v4.2.4-license': {
    requestedUrl: 'https://raw.githubusercontent.com/GoogleChrome/web-vitals/v4.2.4/LICENSE',
    mediaType: 'text/plain',
  },
  'outfit-ofl-1.1': {
    requestedUrl: 'https://raw.githubusercontent.com/google/fonts/main/ofl/outfit/OFL.txt',
    mediaType: 'text/plain',
  },
  'energy-rating-dataset-metadata': {
    requestedUrl: 'https://data.gov.au/data/api/3/action/package_show?id=559708e5-480e-4f94-8429-c49571e82761',
    mediaType: 'application/json',
  },
  'cc-by-3.0-au-legalcode': {
    requestedUrl: 'https://creativecommons.org/licenses/by/3.0/au/legalcode',
    mediaType: 'text/html',
  },
};
const EXPECTED_PUBLIC_EVIDENCE_IDS = Object.values(PUBLIC_EVIDENCE_BY_DEPENDENCY).flat().sort(byteSort);
const ATTRIBUTION_REQUIREMENTS = {
  ENERGY_RATING_CC_BY_ATTRIBUTION: {
    dependencyId: 'ENERGY_RATING_CC_BY',
    path: 'pages/third-party-licenses.html',
    route: '/third-party-licenses',
  },
  OUTFIT_OFL_1_1_LICENSE_COPY: {
    dependencyId: 'OUTFIT_FONT',
    path: 'public/licenses/outfit-ofl-1.1.txt',
    route: '/licenses/outfit-ofl-1.1.txt',
  },
  WEB_VITALS_APACHE_2_LICENSE_COPY: {
    dependencyId: 'WEB_VITALS_APACHE_2',
    path: 'public/licenses/web-vitals-4.2.4-apache-2.0.txt',
    route: '/licenses/web-vitals-4.2.4-apache-2.0.txt',
  },
};
const EXPECTED_ATTRIBUTION_OBLIGATIONS = Object.keys(ATTRIBUTION_REQUIREMENTS).sort(byteSort);
const EXPECTED_ENERGY_RESOURCES = [
  ['f734c56b-a255-4c4e-a3c1-e835c38b8774', 'CSV', 'b3cce9d2c4c2c8ed6ca0a29630dba2bc'],
  ['b8c66121-6683-4a01-957b-71205439f932', 'DOCX', ''],
  ['cbe7057d-e132-4297-b8be-eecf8322d4e6', 'CSV', '6f999b9d4b317b47f81c0cef55c85eb7'],
  ['4e0a2dc4-4d2f-49df-aedb-a389b03913db', 'DOCX', ''],
  ['eb3b9d8e-f39d-47b7-9db0-309856176951', 'CSV', '681dd55ffee2d8c9efbabe87a3c29bbb'],
  ['d748cc21-c4a1-49e0-ac3f-c6ee691a2737', 'DOCX', ''],
  ['0eabca18-49bb-4a9e-8019-28d5d56501c4', 'CSV', 'f06f87bbaace6c801599d415cd4c13a0'],
  ['eb7c7298-6d17-4208-a041-ca1c94db744b', 'DOCX', ''],
];
const PRIVATE_MARKERS = ['partnerize', 'retailer_feed', 'the-good-guys', '1101l4116'];
const DEFAULT_EVIDENCE_MANIFEST = '/Volumes/UGREEN-1TB/FitAppliance/outreach/rights/static-publication/2026-08-10/public-sources/evidence-manifest.json';
const DEFAULT_WITHDRAWAL_DRAFT = '/Volumes/UGREEN-1TB/FitAppliance/private/static-rights/withdrawal-log/2026-08-10-genesis.draft.json';
const DEFAULT_OUTPUT = '/Volumes/UGREEN-1TB/FitAppliance/private/static-rights/decision-packets/2026-08-10-b1-signing-candidate-v2.json';

export class StaticRightsSigningCandidateError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StaticRightsSigningCandidateError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new StaticRightsSigningCandidateError(code, message);
}

function byteSort(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function exactKeys(value, keys, label, code = 'SCHEMA_INVALID') {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).length !== keys.length
    || keys.some((key) => !Object.hasOwn(value, key))) {
    fail(code, `${label} must contain exactly: ${keys.join(', ')}`);
  }
}

function regularFile(absolutePath, code, label) {
  let stat;
  try {
    stat = lstatSync(absolutePath);
  } catch {
    fail(code, `${label} is unavailable`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) fail(code, `${label} must be a regular file`);
  return readFileSync(absolutePath);
}

function safeEvidencePath(root, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || relativePath.includes('\\')
    || relativePath.includes('\0') || path.posix.isAbsolute(relativePath)
    || relativePath.split('/').some((part) => !part || part === '.' || part === '..')) {
    fail('EVIDENCE_PATH_INVALID', `Evidence path is not canonical: ${String(relativePath)}`);
  }
  const absolutePath = path.resolve(root, ...relativePath.split('/'));
  if (!absolutePath.startsWith(`${path.resolve(root)}${path.sep}`)) {
    fail('EVIDENCE_PATH_INVALID', `Evidence path escapes its root: ${relativePath}`);
  }
  return absolutePath;
}

function sortedUnique(values, code = 'DUPLICATE_ID') {
  const sorted = [...values].sort(byteSort);
  if (new Set(sorted).size !== sorted.length) fail(code, 'Canonical arrays must contain unique values');
  return sorted;
}

function readJsonFile(absolutePath, code, label) {
  const bytes = regularFile(absolutePath, code, label);
  try {
    return { bytes, value: JSON.parse(bytes.toString('utf8')) };
  } catch {
    fail(code, `${label} must contain valid JSON`);
  }
}

function exactIsoTimestamp(value, code, label) {
  if (typeof value !== 'string') fail(code, `${label} must be an ISO timestamp`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail(code, `${label} must be an ISO timestamp`);
  }
  return value;
}

function readSecureFileWithinRoot(root, relativePath, code, label) {
  const absoluteRoot = path.resolve(root);
  const absolutePath = safeEvidencePath(absoluteRoot, relativePath);
  let current = absoluteRoot;
  let rootStat;
  try {
    rootStat = lstatSync(current);
  } catch {
    fail(code, `${label} root is unavailable`);
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail(code, `${label} root must be a real directory`);
  const parts = relativePath.split('/');
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    let stat;
    try {
      stat = lstatSync(current);
    } catch {
      fail(code, `${label} is unavailable`);
    }
    if (stat.isSymbolicLink() || (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) {
      fail(code, `${label} contains a symlink or invalid path component`);
    }
  }

  const before = lstatSync(absolutePath);
  let descriptor;
  try {
    descriptor = openSync(absolutePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
      fail(code, `${label} changed during validation`);
    }
    const bytes = readFileSync(descriptor);
    const after = lstatSync(absolutePath);
    if (after.isSymbolicLink() || after.dev !== opened.dev || after.ino !== opened.ino) {
      fail(code, `${label} changed during validation`);
    }
    return bytes;
  } catch (error) {
    if (error instanceof StaticRightsSigningCandidateError) throw error;
    fail(code, `${label} cannot be read safely`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function validateEvidenceCaptureState(manifest) {
  exactKeys(manifest.checks, [
    'googleVerificationInstructions', 'webVitalsApache2', 'outfitOfl11', 'energyApiSuccess',
    'energyDatasetId', 'energyLicenseTitle', 'energyTargetResources', 'ccBy3Au',
  ], 'public evidence checks', 'EVIDENCE_MANIFEST_INVALID');
  if (manifest.checks.googleVerificationInstructions !== true
    || manifest.checks.webVitalsApache2 !== true
    || manifest.checks.outfitOfl11 !== true
    || manifest.checks.energyApiSuccess !== true
    || manifest.checks.ccBy3Au !== true
    || manifest.checks.energyDatasetId !== '559708e5-480e-4f94-8429-c49571e82761'
    || manifest.checks.energyLicenseTitle !== 'Creative Commons Attribution 3.0 Australia'
    || !Array.isArray(manifest.checks.energyTargetResources)
    || manifest.checks.energyTargetResources.length !== EXPECTED_ENERGY_RESOURCES.length) {
    fail('EVIDENCE_MANIFEST_INVALID', 'Public evidence capture checks are incomplete');
  }
  manifest.checks.energyTargetResources.forEach((row, index) => {
    const allowedKeys = row && Object.keys(row).sort(byteSort);
    if (!row || (!['format,hash,id', 'format,hash,id,name'].includes(allowedKeys?.join(',')))
      || row.id !== EXPECTED_ENERGY_RESOURCES[index][0]
      || row.format !== EXPECTED_ENERGY_RESOURCES[index][1]
      || row.hash !== EXPECTED_ENERGY_RESOURCES[index][2]
      || (Object.hasOwn(row, 'name') && typeof row.name !== 'string')) {
      fail('EVIDENCE_MANIFEST_INVALID', `Energy evidence resource ${index} is invalid`);
    }
  });

  if (manifest.captureFailures.length === 0) return;
  if (manifest.captureFailures.length !== 1) {
    fail('EVIDENCE_MANIFEST_INVALID', 'Unexpected public evidence capture failures are forbidden');
  }
  const failure = manifest.captureFailures[0];
  exactKeys(failure, ['id', 'requestedUrl', 'status', 'reason', 'substituteEvidenceId'], 'capture failure', 'EVIDENCE_MANIFEST_INVALID');
  if (failure.id !== 'energy-rating-official-access-page'
    || failure.requestedUrl !== 'https://www.energyrating.gov.au/about-us/gems-regulator/registered-appliance-and-equipment-data'
    || failure.status !== 'UNAVAILABLE'
    || failure.reason !== 'HTTP2_INTERNAL_ERROR_THEN_120_SECOND_HTTP1_TIMEOUT'
    || failure.substituteEvidenceId !== 'energy-rating-dataset-metadata') {
    fail('EVIDENCE_MANIFEST_INVALID', 'Only the reviewed Energy Rating substituted capture is permitted');
  }
}

export function replayPublicEvidenceManifest({ manifestPath }) {
  const absoluteManifest = path.resolve(manifestPath);
  const { bytes: manifestBytes, value: manifest } = readJsonFile(
    absoluteManifest,
    'EVIDENCE_MANIFEST_INVALID',
    'Public evidence manifest',
  );
  exactKeys(manifest, ['schemaVersion', 'evidenceClass', 'records', 'captureFailures', 'checks'], 'public evidence manifest');
  if (manifest.schemaVersion !== 1 || manifest.evidenceClass !== 'PUBLIC_RIGHTS_SOURCES'
    || !Array.isArray(manifest.records) || !Array.isArray(manifest.captureFailures)) {
    fail('EVIDENCE_MANIFEST_INVALID', 'Public evidence manifest schema is invalid');
  }
  validateEvidenceCaptureState(manifest);

  const root = path.dirname(absoluteManifest);
  const seenIds = new Set();
  const seenPaths = new Set();
  const records = manifest.records.map((record, index) => {
    exactKeys(record, ['id', 'path', 'requestedUrl', 'mediaType', 'byteLength', 'sha256', 'retrievedAt'], `evidence record ${index}`);
    if (typeof record.id !== 'string' || !record.id || typeof record.path !== 'string'
      || typeof record.requestedUrl !== 'string'
      || !record.requestedUrl.startsWith('https://') || typeof record.mediaType !== 'string' || !record.mediaType
      || !Number.isSafeInteger(record.byteLength) || record.byteLength < 0 || !HEX_64.test(record.sha256 ?? '')) {
      fail('EVIDENCE_MANIFEST_INVALID', `Public evidence record ${index} is invalid`);
    }
    exactIsoTimestamp(record.retrievedAt, 'EVIDENCE_MANIFEST_INVALID', `Public evidence record ${index} retrieval time`);
    const expectedSpec = PUBLIC_EVIDENCE_SPECS[record.id];
    if (!expectedSpec || record.requestedUrl !== expectedSpec.requestedUrl || record.mediaType !== expectedSpec.mediaType) {
      fail('EVIDENCE_MANIFEST_INVALID', `Public evidence record ${index} source is not allowlisted`);
    }
    const markerText = `${record.id}\0${record.path}\0${record.requestedUrl}`.toLowerCase();
    if (PRIVATE_MARKERS.some((marker) => markerText.includes(marker))) {
      fail('PRIVATE_EVIDENCE_FORBIDDEN', `Public evidence record contains a private-source marker: ${record.id}`);
    }
    const collisionPath = record.path.normalize('NFKC').toLowerCase();
    if (seenIds.has(record.id) || seenPaths.has(collisionPath)) fail('DUPLICATE_ID', 'Evidence IDs and paths must be unique');
    seenIds.add(record.id);
    seenPaths.add(collisionPath);
    const evidenceBytes = readSecureFileWithinRoot(root, record.path, 'EVIDENCE_PATH_INVALID', `Evidence file ${record.id}`);
    if (evidenceBytes.length !== record.byteLength || sha256(evidenceBytes) !== record.sha256) {
      fail('EVIDENCE_HASH_MISMATCH', `Evidence bytes do not match the manifest: ${record.id}`);
    }
    return { id: record.id, sha256: record.sha256 };
  }).sort((left, right) => byteSort(left.id, right.id));

  const actualIds = records.map((record) => record.id);
  if (JSON.stringify(actualIds) !== JSON.stringify(EXPECTED_PUBLIC_EVIDENCE_IDS)) {
    fail('EVIDENCE_SET_INVALID', 'Public signing evidence must contain the exact allowlisted record set');
  }
  return Object.freeze({
    manifestSha256: sha256(manifestBytes),
    records: Object.freeze(records.map(Object.freeze)),
  });
}

function validateInventoryAndClassification(inventory, classification) {
  if (!inventory || inventory.schemaVersion !== 1 || !HEX_64.test(inventory.staticSourceInventoryId ?? '')
    || !Array.isArray(inventory.rows) || !classification || classification.schemaVersion !== 1
    || classification.classifierId !== STATIC_RIGHTS_CLASSIFIER_ID || !Array.isArray(classification.rows)) {
    fail('SOURCE_SET_INVALID', 'Inventory or classification schema is invalid');
  }
  const inventoryByPath = new Map(inventory.rows.map((row) => [row.path, row]));
  if (inventoryByPath.size !== inventory.rows.length || classification.rows.length !== inventory.rows.length) {
    fail('SOURCE_SET_INVALID', 'Classification must cover the exact inventory once');
  }
  const pathsByDependency = new Map();
  const classifiedPaths = new Set();
  for (const row of classification.rows) {
    exactKeys(row, ['path', 'sourceClass', 'dependencyIds', 'provenanceIds', 'blockers'], 'classification row', 'SOURCE_SET_INVALID');
    const inventoryRow = inventoryByPath.get(row?.path);
    if (!inventoryRow || classifiedPaths.has(row.path)
      || typeof row.sourceClass !== 'string' || !row.sourceClass
      || !Array.isArray(row.dependencyIds) || row.dependencyIds.length === 0
      || new Set(row.dependencyIds).size !== row.dependencyIds.length
      || !Array.isArray(row.provenanceIds) || new Set(row.provenanceIds).size !== row.provenanceIds.length
      || row.provenanceIds.some((value) => !HEX_64.test(value))
      || !Array.isArray(row.blockers) || row.blockers.length !== 0
      || !HEX_64.test(inventoryRow.sha256 ?? '')) {
      fail('SOURCE_SET_INVALID', `Classification row is invalid: ${String(row?.path)}`);
    }
    classifiedPaths.add(row.path);
    for (const dependencyId of row.dependencyIds) {
      if (dependencyId === 'RETAILER_FEED') {
        fail('PRIVATE_DEPENDENCY_FORBIDDEN', `Private dependency reached the signing candidate: ${row.path}`);
      }
      if (!EXPECTED_DEPENDENCIES.includes(dependencyId)) {
        fail('DEPENDENCY_SET_INVALID', `Unexpected signing dependency: ${dependencyId}`);
      }
      const rows = pathsByDependency.get(dependencyId) ?? [];
      rows.push({ path: row.path, sha256: inventoryRow.sha256 });
      pathsByDependency.set(dependencyId, rows);
    }
  }
  if (classifiedPaths.size !== inventoryByPath.size
    || [...inventoryByPath.keys()].some((sourcePath) => !classifiedPaths.has(sourcePath))) {
    fail('SOURCE_SET_INVALID', 'Classification omits one or more inventory paths');
  }
  const actualDependencies = [...pathsByDependency.keys()].sort(byteSort);
  if (JSON.stringify(actualDependencies) !== JSON.stringify(EXPECTED_DEPENDENCIES)) {
    fail('DEPENDENCY_SET_INVALID', 'Signing candidate must cover the exact public dependency set');
  }
  return { inventoryByPath, pathsByDependency };
}

function validateWithdrawalGenesis({ withdrawalGenesisDraft, authoritySet }) {
  exactKeys(withdrawalGenesisDraft, ['draftStatus', 'candidateLog'], 'withdrawal genesis draft');
  if (withdrawalGenesisDraft.draftStatus !== 'AWAITING_EXPLICIT_SIGNING_APPROVAL') {
    fail('WITHDRAWAL_GENESIS_INVALID', 'Withdrawal genesis must remain unsigned and approval-gated');
  }
  const log = withdrawalGenesisDraft.candidateLog;
  exactKeys(log, ['schemaVersion', 'environment', 'events', 'heads'], 'withdrawal genesis log');
  if (log.schemaVersion !== 1 || log.environment !== 'PRODUCTION'
    || !Array.isArray(log.events) || !Array.isArray(log.heads)
    || log.events.length !== 0 || log.heads.length !== 1) {
    fail('WITHDRAWAL_GENESIS_INVALID', 'Withdrawal genesis log shape is invalid');
  }
  const head = log.heads[0];
  exactKeys(head, ['withdrawalHeadHash', 'payload', 'signature'], 'withdrawal genesis head');
  if (head.signature !== null) fail('SIGNATURE_PRESENT_FORBIDDEN', 'Signing candidate cannot contain a production signature');
  exactKeys(head.payload, [
    'schemaVersion', 'environment', 'issuerId', 'keyId', 'role', 'action', 'sequence',
    'previousHeadHash', 'eventIds', 'issuedAt',
  ], 'withdrawal genesis payload', 'WITHDRAWAL_GENESIS_INVALID');
  exactIsoTimestamp(head.payload.issuedAt, 'WITHDRAWAL_GENESIS_INVALID', 'Withdrawal genesis issue time');
  if (!Array.isArray(head.payload.eventIds)) {
    fail('WITHDRAWAL_GENESIS_INVALID', 'Withdrawal genesis eventIds must be an array');
  }
  if (!Array.isArray(authoritySet?.authorities)) {
    fail('WITHDRAWAL_GENESIS_INVALID', 'Withdrawal genesis authority set is invalid');
  }
  const authority = authoritySet.authorities.find((row) => row?.issuerId === head.payload.issuerId);
  if (head.payload.schemaVersion !== 1 || authoritySet?.environment !== 'PRODUCTION' || !authority
    || authority.keyId !== head.payload.keyId || !Array.isArray(authority.roles)
    || !authority.roles.includes('RIGHTS_REVIEWER') || !Array.isArray(authority.actions)
    || !authority.actions.includes(STATIC_RIGHTS_ACTION)
    || head.payload.environment !== 'PRODUCTION' || head.payload.action !== STATIC_RIGHTS_ACTION
    || head.payload.role !== 'RIGHTS_REVIEWER' || head.payload.sequence !== 0
    || head.payload.previousHeadHash !== null || head.payload.eventIds?.length !== 0) {
    fail('WITHDRAWAL_GENESIS_INVALID', 'Withdrawal genesis signer or payload is not enrolled');
  }
  const expectedHash = semanticId('fitappliance.static-rights-withdrawal-head', 1, head.payload);
  if (head.withdrawalHeadHash !== expectedHash) fail('WITHDRAWAL_GENESIS_INVALID', 'Withdrawal genesis hash is invalid');
  return log;
}

function replayOwnerAttestation({ ownerAttestation, ownerTrustRoot, inventoryId, scopeHash, sourceObjectHash }) {
  if (ownerAttestation === null) return null;
  exactKeys(ownerAttestation, ['path', 'sha256'], 'owner attestation', 'OWNER_ATTESTATION_INVALID');
  exactKeys(ownerTrustRoot, ['source', 'publicKey'], 'owner trust root', 'OWNER_ATTESTATION_INVALID');
  if (ownerTrustRoot.source !== 'INJECTED_READ_ONLY' || typeof ownerTrustRoot.publicKey !== 'string'
    || !HEX_64.test(ownerAttestation.sha256 ?? '')) {
    fail('OWNER_ATTESTATION_INVALID', 'Owner attestation trust root or hash is invalid');
  }
  const absolutePath = path.resolve(ownerAttestation.path);
  const bytes = readSecureFileWithinRoot(
    path.dirname(absolutePath),
    path.basename(absolutePath),
    'OWNER_ATTESTATION_INVALID',
    'Owner attestation',
  );
  if (bytes.length === 0 || sha256(bytes) !== ownerAttestation.sha256) {
    fail('OWNER_ATTESTATION_INVALID', 'Owner attestation bytes do not match the declared hash');
  }
  let envelope;
  try {
    envelope = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('OWNER_ATTESTATION_INVALID', 'Owner attestation must contain canonical JSON');
  }
  if (canonicalJson(envelope) !== bytes.toString('utf8')) {
    fail('OWNER_ATTESTATION_INVALID', 'Owner attestation bytes must be canonical JSON');
  }
  exactKeys(envelope, ['payload', 'signature'], 'owner attestation envelope', 'OWNER_ATTESTATION_INVALID');
  exactKeys(envelope.payload, [
    'schemaVersion', 'environment', 'action', 'dependencyId', 'ownerId', 'inventoryId',
    'scopeHash', 'sourceObjectHash', 'issuedAt',
  ], 'owner attestation payload', 'OWNER_ATTESTATION_INVALID');
  const payload = envelope.payload;
  exactIsoTimestamp(payload.issuedAt, 'OWNER_ATTESTATION_INVALID', 'Owner attestation issue time');
  if (payload.schemaVersion !== 1 || payload.environment !== 'PRODUCTION'
    || payload.action !== STATIC_RIGHTS_ACTION || payload.dependencyId !== 'FIRST_PARTY'
    || payload.ownerId !== 'FITAPPLIANCE_OWNER' || payload.inventoryId !== inventoryId
    || payload.scopeHash !== scopeHash || payload.sourceObjectHash !== sourceObjectHash
    || typeof envelope.signature !== 'string' || !envelope.signature) {
    fail('OWNER_ATTESTATION_INVALID', 'Owner attestation does not bind the exact FIRST_PARTY source set');
  }
  let signatureValid = false;
  try {
    signatureValid = verify(
      null,
      Buffer.from(canonicalJson(payload)),
      ownerTrustRoot.publicKey,
      Buffer.from(envelope.signature, 'base64'),
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) fail('OWNER_ATTESTATION_INVALID', 'Owner attestation signature is invalid');
  return {
    attestationHash: ownerAttestation.sha256,
    trustRootHash: sha256(Buffer.from(canonicalJson(ownerTrustRoot))),
  };
}

function buildAttributionFulfillments({
  attributionSpecs,
  attributionRouteResolutions,
  inventoryByPath,
  inventoryId,
  routeConfigSha256,
}) {
  if (!HEX_64.test(routeConfigSha256 ?? '') || !Array.isArray(attributionSpecs)
    || !Array.isArray(attributionRouteResolutions)) {
    fail('ATTRIBUTION_SOURCE_DRIFT', 'Attribution inputs are invalid');
  }
  const actualObligationIds = attributionSpecs.map((spec) => spec?.obligationId).sort(byteSort);
  if (JSON.stringify(actualObligationIds) !== JSON.stringify(EXPECTED_ATTRIBUTION_OBLIGATIONS)) {
    fail('ATTRIBUTION_SET_INVALID', 'Signing candidate must contain the exact attribution obligation set');
  }
  const routeResolutionByRoute = new Map();
  for (const resolution of attributionRouteResolutions) {
    if (!resolution || typeof resolution.route !== 'string' || routeResolutionByRoute.has(resolution.route)) {
      fail('ATTRIBUTION_ROUTE_UNVERIFIED', 'Attribution route results must be unique');
    }
    routeResolutionByRoute.set(resolution.route, resolution);
  }
  const expectedRoutes = attributionSpecs.map((spec) => spec.route).sort(byteSort);
  const actualRoutes = [...routeResolutionByRoute.keys()].sort(byteSort);
  if (JSON.stringify(actualRoutes) !== JSON.stringify(expectedRoutes)) {
    fail('ATTRIBUTION_ROUTE_UNVERIFIED', 'Attribution route results must cover the exact obligation route set');
  }
  const obligations = new Set();
  return attributionSpecs.map((spec, index) => {
    exactKeys(spec, ['dependencyId', 'obligationId', 'path', 'sha256', 'route'], `attribution spec ${index}`);
    const requirement = ATTRIBUTION_REQUIREMENTS[spec.obligationId];
    const row = inventoryByPath.get(spec.path);
    if (!requirement || requirement.dependencyId !== spec.dependencyId
      || requirement.path !== spec.path || requirement.route !== spec.route
      || obligations.has(spec.obligationId)) {
      fail('ATTRIBUTION_SET_INVALID', `Attribution obligation mapping is invalid: ${String(spec.obligationId)}`);
    }
    if (!row || row.sha256 !== spec.sha256 || !HEX_64.test(spec.sha256 ?? '')) {
      fail('ATTRIBUTION_SOURCE_DRIFT', `Attribution source is absent or stale: ${String(spec.obligationId)}`);
    }
    const resolution = routeResolutionByRoute.get(spec.route);
    if (!resolution || resolution.terminal !== 'STATIC_2XX' || resolution.target !== spec.path) {
      fail('ATTRIBUTION_ROUTE_UNVERIFIED', `Attribution route is not an exact static terminal: ${spec.route}`);
    }
    obligations.add(spec.obligationId);
    return {
      obligationId: spec.obligationId,
      path: spec.path,
      route: spec.route,
      sha256: spec.sha256,
      routeReceipt: buildAttributionRouteReceipt({
        inventoryId,
        configSha256: routeConfigSha256,
        route: spec.route,
        sourcePath: spec.path,
        sourceSha256: spec.sha256,
        targetPath: spec.path,
      }),
    };
  }).sort((left, right) => byteSort(left.obligationId, right.obligationId));
}

export function buildStaticRightsSigningCandidate({
  inventory,
  classification,
  authoritySet,
  withdrawalGenesisDraft,
  publicEvidence,
  routeConfigSha256,
  toolchainContractSha256,
  candidateGeneratorSha256,
  attributionSpecs,
  attributionRouteResolutions,
  ownerAttestation = null,
  ownerTrustRoot = null,
}) {
  if (!HEX_64.test(toolchainContractSha256 ?? '') || !HEX_64.test(candidateGeneratorSha256 ?? '')) {
    fail('TOOLCHAIN_BINDING_INVALID', 'Signing candidate must bind its reviewed generator and toolchain contract');
  }
  const { inventoryByPath, pathsByDependency } = validateInventoryAndClassification(inventory, classification);
  const withdrawalGenesis = validateWithdrawalGenesis({ withdrawalGenesisDraft, authoritySet });
  const dependencyBindings = new Map(EXPECTED_DEPENDENCIES.map((dependencyId) => {
    const objects = pathsByDependency.get(dependencyId)
      .map((row) => ({ ...row }))
      .sort((left, right) => byteSort(left.path, right.path));
    const scopeHash = buildDependencyScopeHash({
      action: STATIC_RIGHTS_ACTION,
      dependencyId,
      inventoryId: inventory.staticSourceInventoryId,
      paths: objects.map((row) => row.path),
    });
    const sourceObjectHash = semanticId('fitappliance.static-rights-source-object-set', 1, {
      schemaVersion: 1,
      dependencyId,
      inventoryId: inventory.staticSourceInventoryId,
      scopeHash,
      objects,
    }, { sortedArrays: ['objects'] });
    return [dependencyId, { objects, scopeHash, sourceObjectHash }];
  }));
  const firstPartyBinding = dependencyBindings.get('FIRST_PARTY');
  const ownerReplay = replayOwnerAttestation({
    ownerAttestation,
    ownerTrustRoot,
    inventoryId: inventory.staticSourceInventoryId,
    scopeHash: firstPartyBinding.scopeHash,
    sourceObjectHash: firstPartyBinding.sourceObjectHash,
  });
  if (ownerReplay) {
    try {
      validateAuthoritySet({ authoritySet, trustRoot: ownerTrustRoot });
    } catch (error) {
      fail('OWNER_ATTESTATION_INVALID', `Owner trust root is not the enrolled production root: ${error.message}`);
    }
  }
  const ownerAttestationHash = ownerReplay?.attestationHash ?? null;
  const evidenceById = new Map(publicEvidence?.records?.map((row) => [row.id, row.sha256]));
  if (!HEX_64.test(publicEvidence?.manifestSha256 ?? '') || evidenceById.size !== EXPECTED_PUBLIC_EVIDENCE_IDS.length) {
    fail('EVIDENCE_SET_INVALID', 'Replayed public evidence is required');
  }
  const attributionFulfillments = buildAttributionFulfillments({
    attributionSpecs,
    attributionRouteResolutions,
    inventoryByPath,
    inventoryId: inventory.staticSourceInventoryId,
    routeConfigSha256,
  });
  const obligationsByDependency = new Map(EXPECTED_DEPENDENCIES.map((dependencyId) => [dependencyId, []]));
  for (const spec of attributionSpecs) obligationsByDependency.get(spec.dependencyId).push(spec.obligationId);

  const dependencies = EXPECTED_DEPENDENCIES.map((dependencyId) => {
    const { objects, scopeHash, sourceObjectHash } = dependencyBindings.get(dependencyId);
    const evidenceHashes = PUBLIC_EVIDENCE_BY_DEPENDENCY[dependencyId].map((id) => {
      const evidenceHash = evidenceById.get(id);
      if (!evidenceHash) fail('EVIDENCE_SET_INVALID', `Required public evidence is absent: ${id}`);
      return evidenceHash;
    });
    if (dependencyId === 'FIRST_PARTY' && ownerAttestationHash) evidenceHashes.push(ownerAttestationHash);
    for (const fulfillment of attributionFulfillments) {
      if (attributionSpecs.find((spec) => spec.obligationId === fulfillment.obligationId)?.dependencyId === dependencyId) {
        evidenceHashes.push(fulfillment.sha256);
      }
    }
    const canonicalEvidenceHashes = sortedUnique(evidenceHashes);
    const attributionObligationIds = sortedUnique(obligationsByDependency.get(dependencyId));
    return {
      dependencyId,
      status: dependencyId === 'FIRST_PARTY' && !ownerAttestationHash
        ? 'OWNER_ATTESTATION_REQUIRED'
        : 'EVIDENCE_REPLAYED',
      pathCount: objects.length,
      scopeHash,
      sourceObjectHash,
      evidenceHashes: canonicalEvidenceHashes,
      attributionObligationIds,
    };
  });
  const blockers = ['EXPLICIT_SIGNING_APPROVAL_REQUIRED'];
  if (!ownerAttestationHash) blockers.push('OWNER_ATTESTATION_REQUIRED');
  blockers.sort(byteSort);
  const payload = {
    schemaVersion: 1,
    status: ownerAttestationHash ? 'READY_FOR_EXPLICIT_SIGNING_APPROVAL' : 'BLOCKED_OWNER_ATTESTATION',
    inventoryId: inventory.staticSourceInventoryId,
    classifierId: classification.classifierId,
    authoritySetId: semanticId('fitappliance.static-publication-authority-set', 1, authoritySet, { sortedArrays: ['authorities'] }),
    publicEvidenceManifestSha256: publicEvidence.manifestSha256,
    routeConfigSha256,
    toolchainContractSha256,
    candidateGeneratorSha256,
    ownerTrustRootSha256: ownerReplay?.trustRootHash ?? null,
    withdrawalGenesis,
    constraints: {
      environment: 'PRODUCTION',
      allowedDependencies: EXPECTED_DEPENDENCIES,
      forbiddenDependencies: ['RETAILER_FEED'],
      signatureState: 'UNSIGNED',
      privateEvidenceAccess: 'PROHIBITED',
    },
    dependencies,
    attributionFulfillments,
    blockers,
  };
  return Object.freeze({
    ...payload,
    candidateId: semanticId('fitappliance.static-rights-signing-candidate', 1, payload, {
      sortedArrays: [
        'allowedDependencies', 'attributionFulfillments', 'attributionObligationIds', 'blockers',
        'dependencies', 'evidenceHashes', 'forbiddenDependencies',
      ],
    }),
  });
}

function argValue(name) {
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
}

export function writeCanonicalCandidateFile(outputPath, candidate) {
  const bytes = Buffer.from(canonicalJson(candidate, {
    sortedArrays: [
      'allowedDependencies', 'attributionFulfillments', 'attributionObligationIds', 'blockers',
      'dependencies', 'evidenceHashes', 'forbiddenDependencies',
    ],
  }));
  const requestedPath = path.resolve(outputPath);
  const requestedParent = path.dirname(requestedPath);
  let parentStat;
  let canonicalParent;
  try {
    parentStat = lstatSync(requestedParent);
    canonicalParent = realpathSync(requestedParent);
  } catch {
    fail('OUTPUT_PATH_INVALID', 'Candidate output parent directory must already exist');
  }
  const ownerId = typeof process.getuid === 'function' ? process.getuid() : parentStat.uid;
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
    fail('OUTPUT_PATH_INVALID', 'Candidate output parent must be a real directory');
  }
  if (parentStat.uid !== ownerId || (parentStat.mode & 0o777) !== 0o700) {
    fail('OUTPUT_PERMISSIONS_INVALID', 'Candidate output parent must be owner-only mode 0700');
  }
  const absolutePath = path.join(canonicalParent, path.basename(requestedPath));

  let descriptor;
  try {
    descriptor = openSync(absolutePath, 'wx', 0o600);
  } catch (error) {
    if (error?.code !== 'EEXIST') {
      fail('OUTPUT_PATH_INVALID', `Candidate output cannot be created: ${absolutePath}`);
    }
  }

  if (descriptor !== undefined) {
    let createdStat;
    try {
      fchmodSync(descriptor, 0o600);
      createdStat = fstatSync(descriptor);
      if (!createdStat.isFile() || createdStat.nlink !== 1) {
        fail('OUTPUT_PATH_INVALID', 'New candidate output must be a single-link regular file');
      }
      writeFileSync(descriptor, bytes);
      fsyncSync(descriptor);
      const finalDescriptorStat = fstatSync(descriptor);
      const finalPathStat = lstatSync(absolutePath);
      if ((finalDescriptorStat.mode & 0o777) !== 0o600) {
        fail('OUTPUT_PERMISSIONS_INVALID', 'New candidate output must have mode 0600');
      }
      if (!finalPathStat.isFile() || finalPathStat.isSymbolicLink() || finalPathStat.nlink !== 1
        || finalPathStat.dev !== finalDescriptorStat.dev || finalPathStat.ino !== finalDescriptorStat.ino) {
        fail('OUTPUT_PATH_INVALID', 'Candidate output changed during creation');
      }
    } catch (error) {
      closeSync(descriptor);
      try {
        const current = lstatSync(absolutePath);
        if (createdStat && current.dev === createdStat.dev && current.ino === createdStat.ino) unlinkSync(absolutePath);
      } catch {}
      if (error instanceof StaticRightsSigningCandidateError) throw error;
      fail('OUTPUT_WRITE_FAILED', `Candidate output could not be written: ${absolutePath}`);
    }
    closeSync(descriptor);
    return 'CREATED';
  }

  let stat;
  try {
    stat = lstatSync(absolutePath);
  } catch {
    fail('OUTPUT_PATH_INVALID', `Existing candidate output is unavailable: ${absolutePath}`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail('OUTPUT_PATH_INVALID', 'Existing candidate output must be a regular file');
  }
  if (stat.nlink !== 1) fail('OUTPUT_PATH_INVALID', 'Existing candidate output must have exactly one hard link');
  if ((stat.mode & 0o7177) !== 0) {
    fail('OUTPUT_PERMISSIONS_INVALID', 'Existing candidate output permissions are broader than 0600');
  }

  let existingDescriptor;
  try {
    existingDescriptor = openSync(
      absolutePath,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
    );
    const openedStat = fstatSync(existingDescriptor);
    if (!openedStat.isFile() || openedStat.nlink !== 1 || openedStat.dev !== stat.dev || openedStat.ino !== stat.ino) {
      fail('OUTPUT_PATH_INVALID', 'Candidate output changed during validation');
    }
    if ((openedStat.mode & 0o7177) !== 0) {
      fail('OUTPUT_PERMISSIONS_INVALID', 'Existing candidate output permissions are broader than 0600');
    }
    const existingBytes = readFileSync(existingDescriptor);
    const finalPathStat = lstatSync(absolutePath);
    if (finalPathStat.isSymbolicLink() || finalPathStat.nlink !== 1
      || finalPathStat.dev !== openedStat.dev || finalPathStat.ino !== openedStat.ino) {
      fail('OUTPUT_PATH_INVALID', 'Candidate output changed during validation');
    }
    if (!existingBytes.equals(bytes)) {
      fail('OUTPUT_COLLISION', 'Existing candidate output has different canonical bytes');
    }
  } catch (error) {
    if (error instanceof StaticRightsSigningCandidateError) throw error;
    fail('OUTPUT_PATH_INVALID', `Existing candidate output cannot be verified: ${absolutePath}`);
  } finally {
    if (existingDescriptor !== undefined) closeSync(existingDescriptor);
  }
  return 'UNCHANGED';
}

function repoInputs(repoRoot) {
  const inventoryPath = path.join(repoRoot, 'deployment/static-source-inventory.json');
  const provenancePath = path.join(repoRoot, 'deployment/static-generated-provenance.json');
  const authorityPath = path.join(repoRoot, 'deployment/static-publication-authorities.json');
  const inventory = readJsonFile(inventoryPath, 'SOURCE_SET_INVALID', 'Static source inventory').value;
  const currentInventory = buildStaticSourceInventory({ repoRoot });
  if (inventory.staticSourceInventoryId !== currentInventory.staticSourceInventoryId) {
    fail('SOURCE_SET_DRIFT', 'Stored inventory does not match the current Git-bound static source set');
  }
  const generatedProvenance = readJsonFile(provenancePath, 'SOURCE_SET_INVALID', 'Generated provenance').value;
  try {
    validateGeneratedProvenanceRepositoryBindings({ repoRoot, inventory, generatedProvenance });
  } catch (error) {
    fail('SOURCE_SET_INVALID', `Generated provenance repository replay failed: ${error.message}`);
  }
  const classification = classifyStaticSources({ inventory, generatedProvenance });
  const authoritySet = readJsonFile(authorityPath, 'AUTHORITY_SET_INVALID', 'Publication authority set').value;
  const toolchainPath = path.join(repoRoot, 'deployment/toolchain-contract.json');
  const { bytes: toolchainBytes, value: toolchainContract } = readJsonFile(
    toolchainPath,
    'TOOLCHAIN_BINDING_INVALID',
    'Toolchain contract',
  );
  const vercelPackage = readJsonFile(
    path.join(repoRoot, 'node_modules/vercel/package.json'),
    'TOOLCHAIN_BINDING_INVALID',
    'Vercel package metadata',
  ).value;
  try {
    validateToolchainContract({
      repoRoot,
      contract: toolchainContract,
      versions: {
        node: process.versions.node,
        npm: toolchainContract.npm,
        vercel: vercelPackage.version,
      },
    });
  } catch (error) {
    fail('TOOLCHAIN_BINDING_INVALID', `Toolchain contract replay failed: ${error.message}`);
  }
  const inventoryByPath = new Map(inventory.rows.map((row) => [row.path, row]));
  const attributionSpecs = [
    ['WEB_VITALS_APACHE_2', 'WEB_VITALS_APACHE_2_LICENSE_COPY', 'public/licenses/web-vitals-4.2.4-apache-2.0.txt', '/licenses/web-vitals-4.2.4-apache-2.0.txt'],
    ['OUTFIT_FONT', 'OUTFIT_OFL_1_1_LICENSE_COPY', 'public/licenses/outfit-ofl-1.1.txt', '/licenses/outfit-ofl-1.1.txt'],
    ['ENERGY_RATING_CC_BY', 'ENERGY_RATING_CC_BY_ATTRIBUTION', 'pages/third-party-licenses.html', '/third-party-licenses'],
  ].map(([dependencyId, obligationId, sourcePath, route]) => ({
    dependencyId,
    obligationId,
    path: sourcePath,
    sha256: inventoryByPath.get(sourcePath)?.sha256,
    route,
  }));
  return {
    inventory,
    classification,
    authoritySet,
    attributionSpecs,
    routeConfigSha256: sha256(regularFile(path.join(repoRoot, 'vercel.json'), 'ATTRIBUTION_SOURCE_DRIFT', 'Vercel route configuration')),
    toolchainContractSha256: sha256(toolchainBytes),
    candidateGeneratorSha256: sha256(regularFile(
      fileURLToPath(import.meta.url),
      'TOOLCHAIN_BINDING_INVALID',
      'Signing candidate generator',
    )),
  };
}

function validateCurrentRoutes({ repoRoot, inventory, attributionSpecs }) {
  const stageRoot = mkdtempSync(path.join(os.tmpdir(), 'fit-signing-routes-'));
  try {
    for (const row of inventory.rows) {
      const source = path.join(repoRoot, ...row.path.split('/'));
      const bytes = regularFile(source, 'SOURCE_SET_DRIFT', `Static source ${row.path}`);
      if (sha256(bytes) !== row.sha256) fail('SOURCE_SET_DRIFT', `Static source bytes drifted: ${row.path}`);
      const destination = path.join(stageRoot, ...row.path.split('/'));
      mkdirSync(path.dirname(destination), { recursive: true });
      copyFileSync(source, destination);
    }
    const config = readJsonFile(path.join(repoRoot, 'vercel.json'), 'ATTRIBUTION_ROUTE_UNVERIFIED', 'Vercel route configuration').value;
    const routes = new Set(attributionSpecs.map((spec) => spec.route));
    return validateRouteTerminations({
      distRoot: stageRoot,
      config,
      sitemapPath: 'public/sitemap.xml',
      expectedFunctionRoutes: ['/api/error', '/api/rum', '/api/subscribe'],
      expectedGeneratedRoutes: [
        { route: '/service-worker.js', target: 'public/service-worker.js' },
      ],
      explicitRoutes: attributionSpecs.map((spec) => spec.route),
    }).resolutions.filter((resolution) => routes.has(resolution.route));
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
}

async function main() {
  const repoRoot = process.cwd();
  const evidenceManifestPath = argValue('--evidence-manifest') ?? DEFAULT_EVIDENCE_MANIFEST;
  const withdrawalDraftPath = argValue('--withdrawal-draft') ?? DEFAULT_WITHDRAWAL_DRAFT;
  const ownerAttestationPath = argValue('--owner-attestation');
  const ownerTrustRootPath = argValue('--owner-trust-root');
  const outputPath = path.resolve(argValue('--output') ?? DEFAULT_OUTPUT);
  if (Boolean(ownerAttestationPath) !== Boolean(ownerTrustRootPath)) {
    fail('OWNER_ATTESTATION_INVALID', 'Owner attestation and injected trust root must be supplied together');
  }
  const absoluteAttestationPath = ownerAttestationPath ? path.resolve(ownerAttestationPath) : null;
  const ownerAttestationBytes = absoluteAttestationPath
    ? readSecureFileWithinRoot(
        path.dirname(absoluteAttestationPath),
        path.basename(absoluteAttestationPath),
        'OWNER_ATTESTATION_INVALID',
        'Owner attestation',
      )
    : null;
  const ownerAttestation = absoluteAttestationPath
    ? { path: absoluteAttestationPath, sha256: sha256(ownerAttestationBytes) }
    : null;
  let ownerTrustRoot = null;
  if (ownerTrustRootPath) {
    const absoluteTrustRootPath = path.resolve(ownerTrustRootPath);
    const trustRootBytes = readSecureFileWithinRoot(
      path.dirname(absoluteTrustRootPath),
      path.basename(absoluteTrustRootPath),
      'OWNER_ATTESTATION_INVALID',
      'Owner trust root',
    );
    try {
      ownerTrustRoot = JSON.parse(trustRootBytes.toString('utf8'));
    } catch {
      fail('OWNER_ATTESTATION_INVALID', 'Owner trust root must contain JSON');
    }
  }
  const inputs = repoInputs(repoRoot);
  const candidate = buildStaticRightsSigningCandidate({
    ...inputs,
    attributionRouteResolutions: validateCurrentRoutes({
      repoRoot,
      inventory: inputs.inventory,
      attributionSpecs: inputs.attributionSpecs,
    }),
    publicEvidence: replayPublicEvidenceManifest({ manifestPath: evidenceManifestPath }),
    withdrawalGenesisDraft: readJsonFile(path.resolve(withdrawalDraftPath), 'WITHDRAWAL_GENESIS_INVALID', 'Withdrawal genesis draft').value,
    ownerAttestation,
    ownerTrustRoot,
  });
  writeCanonicalCandidateFile(outputPath, candidate);
  process.stdout.write(canonicalJson({ candidateId: candidate.candidateId, outputPath, status: candidate.status }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = error instanceof StaticRightsSigningCandidateError ? error.code : 'SIGNING_CANDIDATE_FAILED';
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
