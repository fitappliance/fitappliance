import { createHash } from 'node:crypto';

import {
  assertNoPrivateRetailerFeedPublication,
  PRIVATE_RETAILER_PUBLICATION_POLICY_VERSION,
  sanitizePrivateRetailerFeedPublication,
} from './public-projection.mjs';
import { hashHistoricalCatalogBinding } from './historical-catalog-binding.mjs';
import { validateRetailLifecycleReleaseCandidate } from './retail-lifecycle-release-candidate.mjs';

const POLICY_VERSION = 'active-retail-privacy-successor-v1';
const MODE = 'PRIVACY_SANITIZATION_ONLY';
const AUTHORIZATION = 'READY_FOR_PRIVACY_SANITIZATION_ONLY';
const RELEASE_ID = /^retail_lifecycle_release_[a-f0-9]{24}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const PUBLIC_LIFECYCLE_STATES = new Set([
  'CATALOG_ARCHIVED',
  'CURRENT_RETAIL',
  'UNKNOWN_RETAIL',
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export function semanticSha256(value) {
  return sha256(JSON.stringify(canonical(value)));
}

function required(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

function hash(value, label) {
  const result = required(value, label).toLowerCase();
  if (!SHA256.test(result)) throw new TypeError(`${label} must be a SHA-256`);
  return result;
}

function timestamp(value, label) {
  const result = new Date(required(value, label));
  if (Number.isNaN(result.valueOf())) throw new TypeError(`${label} must be an ISO timestamp`);
  return result.toISOString();
}

function parseJsonBytes(value, label) {
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    throw new TypeError(`${label} bytes required`);
  }
  try {
    return JSON.parse(Buffer.from(value));
  } catch {
    throw new TypeError(`${label} must contain JSON`);
  }
}

function identityRows(catalog) {
  if (!catalog || !Array.isArray(catalog.products)) {
    throw new TypeError('retail catalogue products required');
  }
  return catalog.products.map((product) => ({
    id: required(product?.id, 'retail catalogue product ID'),
    canonicalProductId: required(product?.canonicalProductId, 'retail catalogue canonical product ID'),
    cat: required(product?.cat, 'retail catalogue product category'),
    brand: required(product?.brand, 'retail catalogue product brand'),
    model: required(product?.model, 'retail catalogue product model'),
  }));
}

function integer(value, label, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) {
    throw new TypeError(`${label} must be an integer >= ${minimum}`);
  }
  return value;
}

function sortedUnique(values, label) {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  const normalized = values.map((value) => required(value, label));
  if (new Set(normalized).size !== normalized.length
    || normalized.some((value, index) => index > 0 && normalized[index - 1].localeCompare(value) > 0)) {
    throw new TypeError(`${label} must be sorted and unique`);
  }
  return normalized;
}

function semanticPayload(document) {
  const { releaseCandidateId, semanticSha256: ignored, ...payload } = document;
  return payload;
}

function retailerRows(catalog) {
  return catalog.products.reduce(
    (total, product) => total + (Array.isArray(product?.retailers) ? product.retailers.length : 0),
    0,
  );
}

function currentProducts(catalog) {
  return catalog.products.filter((product) => product?.unavailable === false).length;
}

function assertExplicitLifecycle(catalog) {
  const invalid = catalog.products.find((product) => (
    !PUBLIC_LIFECYCLE_STATES.has(product?.retailLifecycle?.lifecycleState)
    || product.retailLifecycle.canonicalProductId !== product.canonicalProductId
  ));
  if (invalid) {
    throw new Error(`privacy successor product lifecycle invalid: ${invalid.canonicalProductId ?? invalid.id}`);
  }
}

function referenceIdentityRows(reference) {
  if (!reference || !Array.isArray(reference.records)) {
    throw new TypeError('historical reference records required');
  }
  return reference.records.map((record) => ({
    referenceId: required(record?.referenceId, 'historical reference ID'),
    category: required(record?.category, 'historical reference category'),
    brand: required(record?.brand, 'historical reference brand'),
    model: required(record?.model, 'historical reference model'),
    catalogProductIds: [...(record?.catalogProductIds ?? [])],
  }));
}

function referenceContentWithoutCatalogBinding(reference) {
  const normalized = structuredClone(reference);
  if (normalized.sourceSnapshotHashes) {
    normalized.sourceSnapshotHashes['fitappliance:catalog'] = '<catalog-binding>';
  }
  for (const record of normalized.records ?? []) {
    for (const source of record.sources ?? []) {
      if (source.sourceId === 'fitappliance:catalog') source.snapshotSha256 = '<catalog-binding>';
    }
  }
  return semanticSha256(normalized);
}

function rebindHistoricalReference(reference, catalog) {
  const result = structuredClone(reference);
  const catalogBinding = hashHistoricalCatalogBinding(catalog);
  result.sourceSnapshotHashes = {
    ...(result.sourceSnapshotHashes ?? {}),
    'fitappliance:catalog': catalogBinding,
  };
  for (const record of result.records) {
    const catalogProductIds = record.catalogProductIds ?? [];
    const sources = record.sources ?? [];
    let boundSources = 0;
    record.sources = sources.map((source) => {
      if (source.sourceId !== 'fitappliance:catalog') return source;
      boundSources += 1;
      return { ...source, snapshotSha256: catalogBinding };
    });
    if (catalogProductIds.length > 0 && boundSources !== 1) {
      throw new Error(`historical reference catalogue source binding invalid: ${record.referenceId}`);
    }
    if (catalogProductIds.length === 0 && boundSources !== 0) {
      throw new Error(`historical reference unscoped catalogue source binding: ${record.referenceId}`);
    }
  }
  return result;
}

function changedProducts(before, after) {
  return before.products.reduce((count, product, index) => (
    count + Number(semanticSha256(product) !== semanticSha256(after.products[index]))
  ), 0);
}

export function validateActiveRetailPrivacySuccessorManifest(document) {
  if (!document || document.schemaVersion !== 1 || document.policyVersion !== POLICY_VERSION) {
    throw new TypeError('active retail privacy successor schema v1 required');
  }
  if (document.mode !== MODE) throw new TypeError('privacy successor mode required');
  timestamp(document.generatedAt, 'privacy successor generatedAt');
  const releaseCandidateId = required(document.releaseCandidateId, 'privacy successor release ID');
  if (!RELEASE_ID.test(releaseCandidateId)) throw new TypeError('privacy successor release ID invalid');

  const predecessor = document.predecessor ?? {};
  if (!RELEASE_ID.test(required(predecessor.releaseCandidateId, 'predecessor release ID'))) {
    throw new TypeError('predecessor release ID invalid');
  }
  for (const key of [
    'publicProjectionSha256',
    'publicProjectionSemanticSha256',
    'authorizationManifestSha256',
    'authorizationManifestSemanticSha256',
    'historicalReferenceSha256',
    'historicalReferenceSemanticSha256',
  ]) hash(predecessor[key], `predecessor ${key}`);
  if (predecessor.authorizationStatus !== 'READY_FOR_CUTOVER') {
    throw new TypeError('predecessor cutover authorization required');
  }

  const bindings = document.sourceBindings ?? {};
  if (bindings.sanitizerPolicyVersion !== PRIVATE_RETAILER_PUBLICATION_POLICY_VERSION) {
    throw new TypeError('privacy successor sanitizer policy mismatch');
  }
  for (const key of [
    'sanitizerImplementationSha256',
    'recoveryManifestSha256',
    'recoveryArchiveSha256',
    'sanitizedPublicProjectionSha256',
    'sanitizedPublicProjectionSemanticSha256',
    'historicalReferenceSha256',
    'historicalReferenceSemanticSha256',
  ]) hash(bindings[key], `privacy successor source binding ${key}`);

  const invariants = document.invariants ?? {};
  const productsBefore = integer(invariants.productsBefore, 'privacy successor products before');
  const productsAfter = integer(invariants.productsAfter, 'privacy successor products after');
  if (productsBefore !== productsAfter) throw new TypeError('privacy successor product membership drift');
  const identityBefore = hash(
    invariants.orderedIdentitySha256Before,
    'privacy successor ordered identity before',
  );
  const identityAfter = hash(
    invariants.orderedIdentitySha256After,
    'privacy successor ordered identity after',
  );
  if (identityBefore !== identityAfter) throw new TypeError('privacy successor ordered identity drift');
  const referencesBefore = integer(invariants.referencesBefore, 'privacy successor references before');
  const referencesAfter = integer(invariants.referencesAfter, 'privacy successor references after');
  if (referencesBefore !== referencesAfter) throw new TypeError('privacy successor reference membership drift');
  const referenceIdentityBefore = hash(
    invariants.orderedReferenceIdentitySha256Before,
    'privacy successor ordered reference identity before',
  );
  const referenceIdentityAfter = hash(
    invariants.orderedReferenceIdentitySha256After,
    'privacy successor ordered reference identity after',
  );
  if (referenceIdentityBefore !== referenceIdentityAfter) {
    throw new TypeError('privacy successor ordered reference identity drift');
  }
  const referenceContentBefore = hash(
    invariants.referenceContentSha256Before,
    'privacy successor reference content before',
  );
  const referenceContentAfter = hash(
    invariants.referenceContentSha256After,
    'privacy successor reference content after',
  );
  if (referenceContentBefore !== referenceContentAfter) {
    throw new TypeError('privacy successor reference content drift');
  }
  integer(invariants.changedProducts, 'privacy successor changed products', 1);
  integer(invariants.removedRetailerRows, 'privacy successor removed retailer rows');
  const currentBefore = integer(invariants.currentRetailProductsBefore, 'privacy successor current products before');
  const currentAfter = integer(invariants.currentRetailProductsAfter, 'privacy successor current products after');
  if (currentAfter > currentBefore) throw new TypeError('privacy successor cannot increase current products');
  if (integer(invariants.privateEvidenceViolationsAfter, 'privacy successor private violations') !== 0) {
    throw new TypeError('privacy successor must have zero private evidence violations');
  }

  if (document.authorization?.status !== AUTHORIZATION) {
    throw new TypeError('privacy sanitization authorization required');
  }
  const reasons = sortedUnique(document.authorization.reasonCodes, 'privacy successor reason codes');
  for (const requiredReason of ['LIFECYCLE_NOT_REVALIDATED', 'PRIVATE_PARTNERIZE_EVIDENCE_REMOVED']) {
    if (!reasons.includes(requiredReason)) throw new TypeError(`privacy successor reason ${requiredReason} required`);
  }
  const semantic = semanticSha256(semanticPayload(document));
  if (document.semanticSha256 !== semantic
    || releaseCandidateId !== `retail_lifecycle_release_${semantic.slice(0, 24)}`) {
    throw new Error('active retail privacy successor integrity mismatch');
  }
  return document;
}

export function validateLoadedActiveRetailPrivacySuccessor({
  manifest,
  catalog,
  catalogBytesSha256,
  historicalReference,
  historicalReferenceBytesSha256,
  predecessorManifest,
  predecessorManifestBytesSha256,
}) {
  validateActiveRetailPrivacySuccessorManifest(manifest);
  validateRetailLifecycleReleaseCandidate(predecessorManifest);
  assertNoPrivateRetailerFeedPublication(catalog);
  assertExplicitLifecycle(catalog);
  const catalogHash = hash(catalogBytesSha256, 'loaded privacy successor catalogue SHA-256');
  const referenceHash = hash(
    historicalReferenceBytesSha256,
    'loaded privacy successor historical reference SHA-256',
  );
  const predecessorManifestHash = hash(
    predecessorManifestBytesSha256,
    'loaded predecessor authorization manifest SHA-256',
  );
  if (manifest.sourceBindings.sanitizedPublicProjectionSha256 !== catalogHash
    || manifest.sourceBindings.sanitizedPublicProjectionSemanticSha256 !== semanticSha256(catalog)) {
    throw new Error('privacy successor public projection binding mismatch');
  }
  if (manifest.sourceBindings.historicalReferenceSha256 !== referenceHash
    || manifest.sourceBindings.historicalReferenceSemanticSha256
      !== semanticSha256(historicalReference)) {
    throw new Error('privacy successor historical reference binding mismatch');
  }
  if (manifest.predecessor.authorizationManifestSha256 !== predecessorManifestHash
    || manifest.predecessor.authorizationManifestSemanticSha256
      !== semanticSha256(predecessorManifest)) {
    throw new Error('predecessor authorization manifest binding mismatch');
  }
  if (predecessorManifest.releaseCandidateId !== manifest.predecessor.releaseCandidateId
    || predecessorManifest.authorization.status !== manifest.predecessor.authorizationStatus
    || predecessorManifest.sourceBindings.finalCandidateProjectionSha256
      !== manifest.predecessor.publicProjectionSha256
    || predecessorManifest.sourceBindings.finalCandidateProjectionSemanticSha256
      !== manifest.predecessor.publicProjectionSemanticSha256
    || predecessorManifest.sourceBindings.historicalReferenceCandidateSha256
      !== manifest.predecessor.historicalReferenceSha256
    || predecessorManifest.sourceBindings.historicalReferenceCandidateSemanticSha256
      !== manifest.predecessor.historicalReferenceSemanticSha256) {
    throw new Error('privacy successor predecessor release binding mismatch');
  }
  if (!Array.isArray(historicalReference?.records)) {
    throw new TypeError('active historical reference records required');
  }
  const identityHash = semanticSha256(identityRows(catalog));
  if (catalog.products.length !== manifest.invariants.productsAfter
    || identityHash !== manifest.invariants.orderedIdentitySha256After
    || currentProducts(catalog) !== manifest.invariants.currentRetailProductsAfter) {
    throw new Error('privacy successor loaded catalogue invariant mismatch');
  }
  if (historicalReference.records.length !== manifest.invariants.referencesAfter
    || semanticSha256(referenceIdentityRows(historicalReference))
      !== manifest.invariants.orderedReferenceIdentitySha256After
    || referenceContentWithoutCatalogBinding(historicalReference)
      !== manifest.invariants.referenceContentSha256After) {
    throw new Error('privacy successor loaded historical reference invariant mismatch');
  }
  return true;
}

export function buildActiveRetailPrivacySuccessor({
  predecessorCatalogBytes,
  predecessorAuthorizationManifestBytes,
  historicalReferenceBytes,
  sanitizerImplementationBytes,
  recoveryManifestBytes,
  generatedAt,
}) {
  const predecessorCatalog = parseJsonBytes(predecessorCatalogBytes, 'predecessor catalogue');
  const predecessorManifest = validateRetailLifecycleReleaseCandidate(
    parseJsonBytes(predecessorAuthorizationManifestBytes, 'predecessor authorization manifest'),
  );
  const predecessorHistoricalReference = parseJsonBytes(historicalReferenceBytes, 'historical reference');
  const recoveryManifest = parseJsonBytes(recoveryManifestBytes, 'private recovery manifest');
  if (predecessorManifest.authorization.status !== 'READY_FOR_CUTOVER') {
    throw new Error('privacy successor requires an authorized predecessor release');
  }
  const predecessorCatalogSha256 = sha256(predecessorCatalogBytes);
  const historicalReferenceSha256 = sha256(historicalReferenceBytes);
  if (predecessorManifest.sourceBindings.finalCandidateProjectionSha256 !== predecessorCatalogSha256
    || predecessorManifest.sourceBindings.finalCandidateProjectionSemanticSha256
      !== semanticSha256(predecessorCatalog)) {
    throw new Error('predecessor public projection binding mismatch');
  }
  if (predecessorManifest.sourceBindings.historicalReferenceCandidateSha256
      !== historicalReferenceSha256
    || predecessorManifest.sourceBindings.historicalReferenceCandidateSemanticSha256
      !== semanticSha256(predecessorHistoricalReference)) {
    throw new Error('predecessor historical reference binding mismatch');
  }
  if (!Array.isArray(predecessorHistoricalReference.records)) {
    throw new TypeError('historical reference records required');
  }
  const predecessorProjectionPath = `data/architecture-v2/releases/${predecessorManifest.releaseCandidateId}/public-catalog-projection.json`;
  if (recoveryManifest?.state !== 'PRIVATE_RECOVERY_ONLY'
    || !Array.isArray(recoveryManifest.paths)
    || !recoveryManifest.paths.includes(predecessorProjectionPath)) {
    throw new Error('private recovery manifest must bind the predecessor projection');
  }

  const catalog = sanitizePrivateRetailerFeedPublication(predecessorCatalog);
  assertNoPrivateRetailerFeedPublication(catalog);
  assertExplicitLifecycle(catalog);
  const historicalReference = rebindHistoricalReference(predecessorHistoricalReference, catalog);
  const beforeIdentity = semanticSha256(identityRows(predecessorCatalog));
  const afterIdentity = semanticSha256(identityRows(catalog));
  if (beforeIdentity !== afterIdentity) throw new Error('privacy sanitizer changed ordered product identity');
  const changed = changedProducts(predecessorCatalog, catalog);
  if (changed === 0) throw new Error('privacy successor did not remove private evidence');
  const catalogBytes = Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`);
  const manifest = {
    schemaVersion: 1,
    policyVersion: POLICY_VERSION,
    mode: MODE,
    generatedAt: timestamp(generatedAt, 'privacy successor generatedAt'),
    predecessor: {
      releaseCandidateId: predecessorManifest.releaseCandidateId,
      publicProjectionSha256: predecessorCatalogSha256,
      publicProjectionSemanticSha256: semanticSha256(predecessorCatalog),
      authorizationManifestSha256: sha256(predecessorAuthorizationManifestBytes),
      authorizationManifestSemanticSha256: semanticSha256(predecessorManifest),
      authorizationStatus: predecessorManifest.authorization.status,
      historicalReferenceSha256,
      historicalReferenceSemanticSha256: semanticSha256(predecessorHistoricalReference),
    },
    sourceBindings: {
      sanitizerPolicyVersion: PRIVATE_RETAILER_PUBLICATION_POLICY_VERSION,
      sanitizerImplementationSha256: sha256(sanitizerImplementationBytes),
      recoveryManifestSha256: sha256(recoveryManifestBytes),
      recoveryArchiveSha256: hash(recoveryManifest.archiveSha256, 'private recovery archive SHA-256'),
      sanitizedPublicProjectionSha256: sha256(catalogBytes),
      sanitizedPublicProjectionSemanticSha256: semanticSha256(catalog),
      historicalReferenceSha256: sha256(Buffer.from(`${JSON.stringify(historicalReference, null, 2)}\n`)),
      historicalReferenceSemanticSha256: semanticSha256(historicalReference),
    },
    invariants: {
      productsBefore: predecessorCatalog.products.length,
      productsAfter: catalog.products.length,
      orderedIdentitySha256Before: beforeIdentity,
      orderedIdentitySha256After: afterIdentity,
      referencesBefore: predecessorHistoricalReference.records.length,
      referencesAfter: historicalReference.records.length,
      orderedReferenceIdentitySha256Before: semanticSha256(
        referenceIdentityRows(predecessorHistoricalReference),
      ),
      orderedReferenceIdentitySha256After: semanticSha256(referenceIdentityRows(historicalReference)),
      referenceContentSha256Before: referenceContentWithoutCatalogBinding(
        predecessorHistoricalReference,
      ),
      referenceContentSha256After: referenceContentWithoutCatalogBinding(historicalReference),
      changedProducts: changed,
      removedRetailerRows: retailerRows(predecessorCatalog) - retailerRows(catalog),
      currentRetailProductsBefore: currentProducts(predecessorCatalog),
      currentRetailProductsAfter: currentProducts(catalog),
      privateEvidenceViolationsAfter: 0,
    },
    authorization: {
      status: AUTHORIZATION,
      reasonCodes: ['LIFECYCLE_NOT_REVALIDATED', 'PRIVATE_PARTNERIZE_EVIDENCE_REMOVED'],
    },
  };
  const semantic = semanticSha256(manifest);
  manifest.releaseCandidateId = `retail_lifecycle_release_${semantic.slice(0, 24)}`;
  manifest.semanticSha256 = semantic;
  validateActiveRetailPrivacySuccessorManifest(manifest);
  const successorHistoricalReferenceBytes = Buffer.from(
    `${JSON.stringify(historicalReference, null, 2)}\n`,
  );
  return Object.freeze({
    catalog,
    catalogBytes,
    historicalReference,
    historicalReferenceBytes: successorHistoricalReferenceBytes,
    predecessorManifest,
    predecessorAuthorizationManifestBytes: Buffer.from(predecessorAuthorizationManifestBytes),
    manifest,
    manifestBytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
  });
}
