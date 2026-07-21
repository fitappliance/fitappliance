import { createHash } from 'node:crypto';

import { registryBrandKey, registryModelKey } from './energy-rating-registry.mjs';
import { createObservation } from './retailer-observation.mjs';
import { validateRetailerIdentityResolution } from './retailer-identity-resolution.mjs';
import { validateRetailerObservationLedger } from './retailer-observation-ledger.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const ACTIONS = new Set([
  'KEEP_CANONICAL_IDENTITY',
  'CORRECT_CANONICAL_MODEL',
  'MERGE_DUPLICATE_CANONICAL',
  'QUARANTINE_UNSUPPORTED_CANONICAL',
]);
const LINK_ACTIONS = new Set([
  'ACCEPT_AFTER_CANONICAL_CORRECTION',
  'REASSIGN_TO_EXISTING_CANONICAL',
  'INVALIDATE_WRONG_IDENTITY',
]);

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

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function canonicalSha256(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

function sameCanonical(left, right) {
  return canonicalSha256(left) === canonicalSha256(right);
}

function identityKey(category, brand, model) {
  return `${category}\0${registryBrandKey(brand)}\0${registryModelKey(model)}`;
}

function countBy(items, selector) {
  const result = {};
  for (const item of items) {
    const key = selector(item);
    result[key] = (result[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function semanticPayload(document) {
  const { migrationId, semanticSha256, ...payload } = document;
  return payload;
}

function normalizedIdentity(value, label) {
  return {
    category: required(value?.category, `${label} category`),
    brand: required(value?.brand, `${label} brand`),
    model: required(value?.model, `${label} model`),
  };
}

function observationForLink(caseRecord, disposition) {
  if (disposition.action === 'INVALIDATE_WRONG_IDENTITY') return null;
  const fact = disposition.resolvedListingFact;
  const destinationCanonicalProductId = required(
    disposition.destinationCanonicalProductId,
    'identity migration observation destination',
  );
  const idSeed = {
    resolutionTaskId: caseRecord.resolutionTaskId,
    baselineLinkId: disposition.baselineLinkId,
    action: disposition.action,
    destinationCanonicalProductId,
    rawSourceSha256: fact.rawSourceSha256,
  };
  return createObservation({
    id: `obs_identity_${canonicalSha256(idSeed).slice(0, 24)}`,
    canonicalProductId: destinationCanonicalProductId,
    retailer: fact.retailer,
    adapterId: fact.adapterId,
    observedAt: fact.observedAt,
    url: fact.receivedUrl,
    availability: fact.availability,
    priceAud: fact.priceAud,
    title: fact.title,
    imageUrl: fact.imageUrl,
    retailerProductId: fact.retailerProductId,
    sourceType: fact.sourceType,
    listingState: fact.listingState,
    sourceReference: fact.rawSourceReference,
    rawSourceSha256: fact.rawSourceSha256,
    policyVersion: fact.policyVersion,
    expectedCadenceHours: fact.expectedCadenceHours,
    maximumCurrentAgeHours: fact.maximumCurrentAgeHours,
  });
}

export function buildRetailerIdentityMigration({ resolution, publicProjection, ledger }) {
  validateRetailerIdentityResolution(resolution);
  validateRetailerObservationLedger(ledger);
  if (!publicProjection || !Array.isArray(publicProjection.products)) {
    throw new TypeError('identity migration public projection products required');
  }
  const projectionSemanticSha256 = canonicalSha256(publicProjection);
  if (projectionSemanticSha256 !== resolution.sourceBindings.publicProjectionSemanticSha256) {
    throw new Error('identity migration public projection drift');
  }
  const byCanonical = new Map();
  for (const product of publicProjection.products) {
    const canonicalProductId = required(product.canonicalProductId, 'public projection canonical product ID');
    if (byCanonical.has(canonicalProductId)) throw new TypeError(`duplicate public canonical product ${canonicalProductId}`);
    byCanonical.set(canonicalProductId, product);
  }
  const cases = [];
  const canonicalCorrections = [];
  const canonicalMerges = [];
  const canonicalQuarantines = [];
  const linkEvents = [];
  const rawBindings = new Set(ledger.sourceBindings.map((binding) => binding.sha256));
  for (const caseRecord of resolution.cases.filter((row) => row.decision.status === 'RESOLVED')) {
    const source = byCanonical.get(caseRecord.canonicalProductId);
    if (!source || String(source.id).toLowerCase() !== caseRecord.legacyRuntimeId
      || identityKey(source.cat, source.brand, source.model) !== identityKey(
        caseRecord.expectedIdentity.category,
        caseRecord.expectedIdentity.brand,
        caseRecord.expectedIdentity.model,
      )) {
      throw new Error(`identity migration source projection drift: ${caseRecord.canonicalProductId}`);
    }
    const action = caseRecord.decision.action;
    if (!ACTIONS.has(action)) throw new TypeError('identity migration case action invalid');
    const caseBinding = {
      resolutionTaskId: caseRecord.resolutionTaskId,
      resolutionSemanticSha256: resolution.semanticSha256,
      sourceCanonicalProductId: caseRecord.canonicalProductId,
      sourceLegacyRuntimeId: caseRecord.legacyRuntimeId,
      expectedIdentity: structuredClone(caseRecord.expectedIdentity),
      action,
      reasonCodes: [...caseRecord.decision.reasonCodes],
      baselineLinkIds: caseRecord.decision.linkDispositions
        .map((row) => row.baselineLinkId)
        .sort(),
      ...(caseRecord.decision.correctedModel ? { correctedModel: caseRecord.decision.correctedModel } : {}),
      ...(caseRecord.decision.targetCanonicalProductId
        ? { targetCanonicalProductId: caseRecord.decision.targetCanonicalProductId }
        : {}),
    };
    cases.push(caseBinding);
    if (action === 'CORRECT_CANONICAL_MODEL') {
      canonicalCorrections.push({
        resolutionTaskId: caseRecord.resolutionTaskId,
        legacyRuntimeId: caseRecord.legacyRuntimeId,
        canonicalProductId: caseRecord.canonicalProductId,
        category: source.cat,
        brand: source.brand,
        fromModel: source.model,
        toModel: caseRecord.decision.correctedModel,
      });
    } else if (['MERGE_DUPLICATE_CANONICAL', 'QUARANTINE_UNSUPPORTED_CANONICAL'].includes(action)) {
      const target = byCanonical.get(caseRecord.decision.targetCanonicalProductId);
      const receivedModels = [...new Set(caseRecord.mismatchSources.map((row) => registryModelKey(row.receivedModel)))];
      if (!target || receivedModels.length !== 1
        || target.cat !== source.cat
        || registryBrandKey(target.brand) !== registryBrandKey(source.brand)
        || registryModelKey(target.model) !== receivedModels[0]) {
        throw new Error(`identity migration merge target drift: ${caseRecord.canonicalProductId}`);
      }
      const canonicalRelationship = {
        resolutionTaskId: caseRecord.resolutionTaskId,
        sourceCanonicalProductId: caseRecord.canonicalProductId,
        sourceLegacyRuntimeId: caseRecord.legacyRuntimeId,
        sourceIdentity: { category: source.cat, brand: source.brand, model: source.model },
        targetCanonicalProductId: target.canonicalProductId,
        targetLegacyRuntimeId: String(target.id).toLowerCase(),
        targetIdentity: { category: target.cat, brand: target.brand, model: target.model },
      };
      if (action === 'MERGE_DUPLICATE_CANONICAL') {
        canonicalMerges.push(canonicalRelationship);
      } else {
        const receiptBoundUrls = new Set(caseRecord.mismatchSources.map((row) => row.url));
        canonicalQuarantines.push({
          ...canonicalRelationship,
          discardedUnverifiedRetailerLinks: (source.retailers ?? [])
            .filter((row) => !receiptBoundUrls.has(String(row?.url ?? '')))
            .map((row) => ({
              retailer: required(row?.n, 'quarantined retailer name'),
              url: new URL(required(row?.url, 'quarantined retailer URL')).toString(),
              reasonCode: 'NO_RECEIPT_BOUND_EXACT_LISTING_FACT',
            }))
            .sort((left, right) => left.url.localeCompare(right.url)),
        });
      }
    }
    for (const disposition of caseRecord.decision.linkDispositions) {
      const mismatch = caseRecord.mismatchSources.find((row) => row.baselineLinkId === disposition.baselineLinkId);
      if (!mismatch || !rawBindings.has(mismatch.rawSourceSha256)) {
        throw new Error(`identity migration raw source is not ledger-bound: ${disposition.baselineLinkId}`);
      }
      const observation = observationForLink(caseRecord, disposition);
      const destinationCanonicalProductId = disposition.destinationCanonicalProductId ?? null;
      const eventSeed = {
        resolutionTaskId: caseRecord.resolutionTaskId,
        baselineLinkId: disposition.baselineLinkId,
        action: disposition.action,
        sourceCanonicalProductId: caseRecord.canonicalProductId,
        destinationCanonicalProductId,
        rawSourceSha256: mismatch.rawSourceSha256,
      };
      linkEvents.push({
        id: `retail_identity_event_${canonicalSha256(eventSeed).slice(0, 24)}`,
        resolutionTaskId: caseRecord.resolutionTaskId,
        baselineLinkId: disposition.baselineLinkId,
        action: disposition.action,
        sourceCanonicalProductId: caseRecord.canonicalProductId,
        destinationCanonicalProductId,
        resolvedAt: resolution.generatedAt,
        sourceObservedAt: disposition.resolvedListingFact.observedAt,
        rawSourceSha256: mismatch.rawSourceSha256,
        resolutionSemanticSha256: resolution.semanticSha256,
        reasonCodes: [...caseRecord.decision.reasonCodes],
        observation,
      });
    }
  }
  canonicalCorrections.sort((left, right) => left.legacyRuntimeId.localeCompare(right.legacyRuntimeId));
  canonicalMerges.sort((left, right) => left.sourceLegacyRuntimeId.localeCompare(right.sourceLegacyRuntimeId));
  canonicalQuarantines.sort((left, right) => (
    left.sourceLegacyRuntimeId.localeCompare(right.sourceLegacyRuntimeId)
  ));
  linkEvents.sort((left, right) => left.baselineLinkId.localeCompare(right.baselineLinkId));
  const document = {
    schemaVersion: 4,
    policyVersion: 'retailer-identity-migration-v4',
    generatedAt: resolution.generatedAt,
    sourceBindings: {
      resolutionEpochs: [{
        resolutionId: resolution.resolutionId,
        semanticSha256: resolution.semanticSha256,
        generatedAt: resolution.generatedAt,
        summary: structuredClone(resolution.summary),
      }],
      publicProjectionSemanticSha256: projectionSemanticSha256,
      retailerLedgerSemanticSha256: ledger.semanticSha256,
    },
    sourceResolutionSummary: structuredClone(resolution.summary),
    cases,
    canonicalCorrections,
    canonicalMerges,
    canonicalQuarantines,
    linkEvents,
    summary: {
      cases: cases.length,
      canonicalCorrections: canonicalCorrections.length,
      canonicalMerges: canonicalMerges.length,
      canonicalQuarantines: canonicalQuarantines.length,
      linkEvents: linkEvents.length,
      generatedObservations: linkEvents.filter((event) => event.observation != null).length,
      byLinkAction: countBy(linkEvents, (event) => event.action),
    },
  };
  const semantic = canonicalSha256(document);
  document.migrationId = `retailer_identity_migration_${semantic.slice(0, 24)}`;
  document.semanticSha256 = semantic;
  return freezeDeep(validateRetailerIdentityMigration(document));
}

function resolutionEpochsFromMigration(migration) {
  if (migration.schemaVersion >= 4) {
    return structuredClone(migration.sourceBindings.resolutionEpochs);
  }
  return [{
    resolutionId: migration.sourceBindings.resolutionId,
    semanticSha256: migration.sourceBindings.resolutionSemanticSha256,
    generatedAt: migration.generatedAt,
    summary: structuredClone(migration.sourceResolutionSummary),
  }];
}

function mergeUniqueRecords(left, right, keyOf, label) {
  const result = new Map();
  for (const row of [...left, ...right]) {
    const key = required(keyOf(row), `${label} key`);
    const prior = result.get(key);
    if (prior && !sameCanonical(prior, row)) throw new Error(`conflicting cumulative ${label}: ${key}`);
    if (!prior) result.set(key, structuredClone(row));
  }
  return [...result.values()];
}

export function rollForwardRetailerIdentityMigration({
  existingMigration,
  resolution,
  publicProjection,
  ledger,
}) {
  validateRetailerIdentityMigration(existingMigration);
  validateRetailerObservationLedger(ledger);
  if (canonicalSha256(publicProjection) !== existingMigration.sourceBindings.publicProjectionSemanticSha256) {
    throw new Error('cumulative identity migration public projection drift');
  }
  if (!migrationAlreadyApplied(ledger, existingMigration)) {
    throw new Error('existing identity migration is not completely replayed into the input ledger');
  }
  const existingEpochs = resolutionEpochsFromMigration(existingMigration);
  if (existingEpochs.some((epoch) => epoch.semanticSha256 === resolution.semanticSha256)) {
    return freezeDeep(structuredClone(existingMigration));
  }
  const priorGeneratedAt = new Date(existingEpochs.at(-1).generatedAt);
  const nextGeneratedAt = new Date(required(resolution.generatedAt, 'new identity resolution time'));
  if (Number.isNaN(nextGeneratedAt.valueOf()) || nextGeneratedAt < priorGeneratedAt) {
    throw new Error('new identity resolution precedes the cumulative migration epoch');
  }
  const delta = buildRetailerIdentityMigration({ resolution, publicProjection, ledger });
  const existingDefaultSemantic = existingMigration.schemaVersion >= 4
    ? null
    : existingMigration.sourceBindings.resolutionSemanticSha256;
  const existingCases = existingMigration.cases.map((row) => ({
    ...structuredClone(row),
    ...(row.resolutionSemanticSha256 ? {} : {
      resolutionSemanticSha256: existingDefaultSemantic,
    }),
  }));
  const cases = mergeUniqueRecords(
    existingCases,
    delta.cases,
    (row) => row.resolutionTaskId,
    'identity migration case',
  ).sort((left, right) => left.resolutionTaskId.localeCompare(right.resolutionTaskId));
  const canonicalCorrections = mergeUniqueRecords(
    existingMigration.canonicalCorrections,
    delta.canonicalCorrections,
    (row) => row.legacyRuntimeId,
    'canonical correction',
  ).sort((left, right) => left.legacyRuntimeId.localeCompare(right.legacyRuntimeId));
  const canonicalMerges = mergeUniqueRecords(
    existingMigration.canonicalMerges,
    delta.canonicalMerges,
    (row) => row.sourceLegacyRuntimeId,
    'canonical merge',
  ).sort((left, right) => left.sourceLegacyRuntimeId.localeCompare(right.sourceLegacyRuntimeId));
  const canonicalQuarantines = mergeUniqueRecords(
    existingMigration.canonicalQuarantines ?? [],
    delta.canonicalQuarantines,
    (row) => row.sourceLegacyRuntimeId,
    'canonical quarantine',
  ).sort((left, right) => left.sourceLegacyRuntimeId.localeCompare(right.sourceLegacyRuntimeId));
  const linkEvents = mergeUniqueRecords(
    existingMigration.linkEvents,
    delta.linkEvents,
    (row) => row.baselineLinkId,
    'identity link event',
  ).sort((left, right) => left.baselineLinkId.localeCompare(right.baselineLinkId));
  const resolutionEpochs = [...existingEpochs, ...delta.sourceBindings.resolutionEpochs];
  const sourceResolutionSummary = {
    cases: cases.length + resolution.summary.unresolved,
    resolved: cases.length,
    unresolved: resolution.summary.unresolved,
    byAction: countBy(cases, (row) => row.action),
    byLinkAction: countBy(linkEvents, (row) => row.action),
  };
  const document = {
    schemaVersion: 4,
    policyVersion: 'retailer-identity-migration-v4',
    generatedAt: resolution.generatedAt,
    sourceBindings: {
      resolutionEpochs,
      publicProjectionSemanticSha256: existingMigration.sourceBindings.publicProjectionSemanticSha256,
      retailerLedgerSemanticSha256: ledger.semanticSha256,
      predecessorMigrationSemanticSha256: existingMigration.semanticSha256,
    },
    sourceResolutionSummary,
    cases,
    canonicalCorrections,
    canonicalMerges,
    canonicalQuarantines,
    linkEvents,
    summary: {
      cases: cases.length,
      canonicalCorrections: canonicalCorrections.length,
      canonicalMerges: canonicalMerges.length,
      canonicalQuarantines: canonicalQuarantines.length,
      linkEvents: linkEvents.length,
      generatedObservations: linkEvents.filter((event) => event.observation != null).length,
      byLinkAction: countBy(linkEvents, (event) => event.action),
    },
  };
  const semantic = canonicalSha256(document);
  document.migrationId = `retailer_identity_migration_${semantic.slice(0, 24)}`;
  document.semanticSha256 = semantic;
  return freezeDeep(validateRetailerIdentityMigration(document));
}

function sortedUnique(values, selector, label) {
  const ids = values.map(selector);
  if (new Set(ids).size !== ids.length
    || ids.some((id, index) => index > 0 && ids[index - 1].localeCompare(id) > 0)) {
    throw new TypeError(`${label} must be sorted and unique`);
  }
}

export function validateRetailerIdentityMigration(document) {
  if (!document || ![2, 3, 4].includes(document.schemaVersion)
    || document.policyVersion !== `retailer-identity-migration-v${document.schemaVersion}`
    || !Array.isArray(document.cases) || !Array.isArray(document.canonicalCorrections)
    || !Array.isArray(document.canonicalMerges) || !Array.isArray(document.linkEvents)
    || (document.schemaVersion >= 3 && !Array.isArray(document.canonicalQuarantines))) {
    throw new TypeError('retailer identity migration schema invalid');
  }
  const canonicalQuarantines = document.canonicalQuarantines ?? [];
  const allowedResolutionSemantics = new Set();
  if (document.schemaVersion >= 4) {
    const epochs = document.sourceBindings?.resolutionEpochs;
    if (!Array.isArray(epochs) || epochs.length === 0) {
      throw new TypeError('identity migration resolution epochs required');
    }
    let previousTime = null;
    for (const epoch of epochs) {
      required(epoch.resolutionId, 'identity migration resolution epoch ID');
      const semantic = hash(epoch.semanticSha256, 'identity migration resolution epoch semantic SHA-256');
      if (allowedResolutionSemantics.has(semantic)) {
        throw new TypeError('duplicate identity migration resolution epoch');
      }
      allowedResolutionSemantics.add(semantic);
      const generatedAt = new Date(required(epoch.generatedAt, 'identity migration resolution epoch time'));
      if (Number.isNaN(generatedAt.valueOf()) || (previousTime && generatedAt < previousTime)) {
        throw new TypeError('identity migration resolution epochs must be chronological');
      }
      previousTime = generatedAt;
      if (!epoch.summary || !Number.isSafeInteger(epoch.summary.cases)
        || !Number.isSafeInteger(epoch.summary.resolved)
        || !Number.isSafeInteger(epoch.summary.unresolved)) {
        throw new TypeError('identity migration resolution epoch summary invalid');
      }
    }
    if (document.sourceBindings.predecessorMigrationSemanticSha256 != null) {
      hash(
        document.sourceBindings.predecessorMigrationSemanticSha256,
        'identity migration predecessor semantic SHA-256',
      );
    }
  } else {
    required(document.sourceBindings?.resolutionId, 'identity migration resolution ID');
    allowedResolutionSemantics.add(hash(
      document.sourceBindings?.resolutionSemanticSha256,
      'identity migration resolution semantic SHA-256',
    ));
  }
  hash(document.sourceBindings?.publicProjectionSemanticSha256, 'identity migration projection semantic SHA-256');
  hash(document.sourceBindings?.retailerLedgerSemanticSha256, 'identity migration ledger semantic SHA-256');
  const sourceResolutionSummary = document.sourceResolutionSummary;
  if (!sourceResolutionSummary || !Number.isSafeInteger(sourceResolutionSummary.cases)
    || !Number.isSafeInteger(sourceResolutionSummary.resolved)
    || !Number.isSafeInteger(sourceResolutionSummary.unresolved)
    || sourceResolutionSummary.cases < 0 || sourceResolutionSummary.resolved < 0
    || sourceResolutionSummary.unresolved < 0
    || sourceResolutionSummary.cases !== sourceResolutionSummary.resolved + sourceResolutionSummary.unresolved
    || sourceResolutionSummary.resolved !== document.cases.length) {
    throw new TypeError('identity migration source resolution summary invalid');
  }
  sortedUnique(document.cases, (row) => required(row.resolutionTaskId, 'migration resolution task ID'), 'migration cases');
  sortedUnique(document.canonicalCorrections, (row) => required(row.legacyRuntimeId, 'correction legacy ID'), 'canonical corrections');
  sortedUnique(document.canonicalMerges, (row) => required(row.sourceLegacyRuntimeId, 'merge source legacy ID'), 'canonical merges');
  sortedUnique(
    canonicalQuarantines,
    (row) => required(row.sourceLegacyRuntimeId, 'quarantine source legacy ID'),
    'canonical quarantines',
  );
  sortedUnique(document.linkEvents, (row) => required(row.baselineLinkId, 'identity event baseline link ID'), 'identity link events');
  const caseByTask = new Map(document.cases.map((row) => [row.resolutionTaskId, row]));
  for (const row of document.cases) {
    required(row.sourceCanonicalProductId, 'migration source canonical product ID');
    required(row.sourceLegacyRuntimeId, 'migration source legacy ID');
    normalizedIdentity(row.expectedIdentity, 'migration expected identity');
    if (document.schemaVersion >= 4 && !allowedResolutionSemantics.has(hash(
      row.resolutionSemanticSha256,
      'migration case resolution semantic SHA-256',
    ))) {
      throw new TypeError('migration case resolution epoch binding invalid');
    }
    if (!ACTIONS.has(row.action) || !Array.isArray(row.reasonCodes) || row.reasonCodes.length === 0) {
      throw new TypeError('identity migration case decision invalid');
    }
    if (!Array.isArray(row.baselineLinkIds) || row.baselineLinkIds.length === 0) {
      throw new TypeError('migration case baseline links required');
    }
    sortedUnique(
      row.baselineLinkIds,
      (value) => required(value, 'migration case baseline link ID'),
      'migration case baseline links',
    );
  }
  for (const row of document.canonicalCorrections) {
    const caseRecord = caseByTask.get(row.resolutionTaskId);
    if (!caseRecord || caseRecord.action !== 'CORRECT_CANONICAL_MODEL'
      || caseRecord.sourceLegacyRuntimeId !== row.legacyRuntimeId
      || caseRecord.sourceCanonicalProductId !== row.canonicalProductId
      || caseRecord.correctedModel !== row.toModel
      || registryModelKey(row.fromModel) === registryModelKey(row.toModel)) {
      throw new TypeError('canonical correction binding invalid');
    }
    required(row.category, 'correction category');
    required(row.brand, 'correction brand');
  }
  for (const row of document.canonicalMerges) {
    const caseRecord = caseByTask.get(row.resolutionTaskId);
    const sourceIdentity = normalizedIdentity(row.sourceIdentity, 'merge source identity');
    const targetIdentity = normalizedIdentity(row.targetIdentity, 'merge target identity');
    if (!caseRecord || caseRecord.action !== 'MERGE_DUPLICATE_CANONICAL'
      || caseRecord.sourceCanonicalProductId !== row.sourceCanonicalProductId
      || caseRecord.sourceLegacyRuntimeId !== row.sourceLegacyRuntimeId
      || caseRecord.targetCanonicalProductId !== row.targetCanonicalProductId
      || row.sourceCanonicalProductId === row.targetCanonicalProductId
      || sourceIdentity.category !== targetIdentity.category
      || registryBrandKey(sourceIdentity.brand) !== registryBrandKey(targetIdentity.brand)) {
      throw new TypeError('canonical merge binding invalid');
    }
    required(row.targetLegacyRuntimeId, 'merge target legacy ID');
  }
  for (const row of canonicalQuarantines) {
    const caseRecord = caseByTask.get(row.resolutionTaskId);
    const sourceIdentity = normalizedIdentity(row.sourceIdentity, 'quarantine source identity');
    const targetIdentity = normalizedIdentity(row.targetIdentity, 'quarantine target identity');
    if (!caseRecord || caseRecord.action !== 'QUARANTINE_UNSUPPORTED_CANONICAL'
      || caseRecord.sourceCanonicalProductId !== row.sourceCanonicalProductId
      || caseRecord.sourceLegacyRuntimeId !== row.sourceLegacyRuntimeId
      || caseRecord.targetCanonicalProductId !== row.targetCanonicalProductId
      || row.sourceCanonicalProductId === row.targetCanonicalProductId
      || sourceIdentity.category !== targetIdentity.category
      || registryBrandKey(sourceIdentity.brand) !== registryBrandKey(targetIdentity.brand)
      || !Array.isArray(row.discardedUnverifiedRetailerLinks)) {
      throw new TypeError('canonical quarantine binding invalid');
    }
    required(row.targetLegacyRuntimeId, 'quarantine target legacy ID');
    sortedUnique(
      row.discardedUnverifiedRetailerLinks,
      (link) => new URL(required(link.url, 'discarded retailer URL')).toString(),
      'discarded unverified retailer links',
    );
    for (const link of row.discardedUnverifiedRetailerLinks) {
      required(link.retailer, 'discarded retailer name');
      if (link.reasonCode !== 'NO_RECEIPT_BOUND_EXACT_LISTING_FACT') {
        throw new TypeError('discarded retailer link reason invalid');
      }
    }
  }
  for (const event of document.linkEvents) {
    const caseRecord = caseByTask.get(event.resolutionTaskId);
    if (!caseRecord || !LINK_ACTIONS.has(event.action)
      || event.sourceCanonicalProductId !== caseRecord.sourceCanonicalProductId
      || !Array.isArray(event.reasonCodes) || !sameCanonical(event.reasonCodes, caseRecord.reasonCodes)) {
      throw new TypeError('identity link event case binding invalid');
    }
    hash(event.rawSourceSha256, 'identity event raw source SHA-256');
    if (!allowedResolutionSemantics.has(hash(
      event.resolutionSemanticSha256,
      'identity event resolution semantic SHA-256',
    ))) {
      throw new TypeError('identity event resolution semantic binding invalid');
    }
    const resolvedAt = new Date(required(event.resolvedAt, 'identity event resolvedAt'));
    const sourceObservedAt = new Date(required(event.sourceObservedAt, 'identity event source observedAt'));
    if (Number.isNaN(resolvedAt.valueOf()) || Number.isNaN(sourceObservedAt.valueOf())
      || resolvedAt < sourceObservedAt) {
      throw new TypeError('identity event timestamps invalid');
    }
    const expectedEventId = `retail_identity_event_${canonicalSha256({
      resolutionTaskId: event.resolutionTaskId,
      baselineLinkId: event.baselineLinkId,
      action: event.action,
      sourceCanonicalProductId: event.sourceCanonicalProductId,
      destinationCanonicalProductId: event.destinationCanonicalProductId,
      rawSourceSha256: event.rawSourceSha256,
    }).slice(0, 24)}`;
    if (event.id !== expectedEventId) throw new TypeError('identity event ID mismatch');
    if (event.action === 'INVALIDATE_WRONG_IDENTITY') {
      if (event.destinationCanonicalProductId !== null || event.observation !== null) {
        throw new TypeError('invalidated identity event cannot create availability');
      }
    } else {
      const observation = createObservation(event.observation);
      if (observation.canonicalProductId !== event.destinationCanonicalProductId
        || observation.rawSourceSha256 !== event.rawSourceSha256
        || observation.observedAt !== new Date(event.sourceObservedAt).toISOString()) {
        throw new TypeError('identity event observation binding invalid');
      }
      if (event.action === 'ACCEPT_AFTER_CANONICAL_CORRECTION'
        && event.destinationCanonicalProductId !== event.sourceCanonicalProductId) {
        throw new TypeError('corrected identity event destination invalid');
      }
      if (event.action === 'REASSIGN_TO_EXISTING_CANONICAL'
        && event.destinationCanonicalProductId === event.sourceCanonicalProductId) {
        throw new TypeError('reassigned identity event destination invalid');
      }
    }
  }
  const correctionsByTask = new Map(document.canonicalCorrections.map((row) => [row.resolutionTaskId, row]));
  const mergesByTask = new Map(document.canonicalMerges.map((row) => [row.resolutionTaskId, row]));
  const quarantinesByTask = new Map(canonicalQuarantines.map((row) => [row.resolutionTaskId, row]));
  if (correctionsByTask.size !== document.canonicalCorrections.length
    || mergesByTask.size !== document.canonicalMerges.length
    || quarantinesByTask.size !== canonicalQuarantines.length) {
    throw new TypeError('identity migration canonical action tasks must be unique');
  }
  const eventsByTask = new Map();
  for (const event of document.linkEvents) {
    if (!eventsByTask.has(event.resolutionTaskId)) eventsByTask.set(event.resolutionTaskId, []);
    eventsByTask.get(event.resolutionTaskId).push(event.baselineLinkId);
  }
  for (const row of document.cases) {
    if ((row.action === 'CORRECT_CANONICAL_MODEL') !== correctionsByTask.has(row.resolutionTaskId)
      || (row.action === 'MERGE_DUPLICATE_CANONICAL') !== mergesByTask.has(row.resolutionTaskId)) {
      throw new TypeError(`identity migration canonical action coverage mismatch: ${row.resolutionTaskId}`);
    }
    if ((row.action === 'QUARANTINE_UNSUPPORTED_CANONICAL')
      !== quarantinesByTask.has(row.resolutionTaskId)) {
      throw new TypeError(`identity migration canonical quarantine coverage mismatch: ${row.resolutionTaskId}`);
    }
    const eventLinkIds = (eventsByTask.get(row.resolutionTaskId) ?? []).sort();
    if (!sameCanonical(eventLinkIds, row.baselineLinkIds)) {
      throw new TypeError(`identity migration link event coverage mismatch: ${row.resolutionTaskId}`);
    }
  }
  if (!sameCanonical(sourceResolutionSummary.byAction, countBy(document.cases, (row) => row.action))
    || !sameCanonical(sourceResolutionSummary.byLinkAction, countBy(document.linkEvents, (row) => row.action))) {
    throw new TypeError('identity migration source resolution action summary mismatch');
  }
  const expectedSummary = {
    cases: document.cases.length,
    canonicalCorrections: document.canonicalCorrections.length,
    canonicalMerges: document.canonicalMerges.length,
    ...(document.schemaVersion >= 3 ? { canonicalQuarantines: canonicalQuarantines.length } : {}),
    linkEvents: document.linkEvents.length,
    generatedObservations: document.linkEvents.filter((event) => event.observation != null).length,
    byLinkAction: countBy(document.linkEvents, (event) => event.action),
  };
  if (!sameCanonical(document.summary, expectedSummary)) throw new TypeError('identity migration summary mismatch');
  const semantic = canonicalSha256(semanticPayload(document));
  if (document.semanticSha256 !== semantic
    || document.migrationId !== `retailer_identity_migration_${semantic.slice(0, 24)}`) {
    throw new Error('retailer identity migration integrity mismatch');
  }
  return document;
}

function replaceExactModel(value, fromModel, toModel) {
  if (typeof value !== 'string') return value;
  const escaped = fromModel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return value.replace(new RegExp(`(?<![A-Z0-9])${escaped}(?![A-Z0-9])`, 'gi'), toModel);
}

export function applyRetailerIdentityMigrationToCatalog({ catalog, migration }) {
  validateRetailerIdentityMigration(migration);
  if (!catalog || !Array.isArray(catalog.products)) throw new TypeError('identity migration catalog products required');
  const corrections = new Map(migration.canonicalCorrections.map((row) => [row.legacyRuntimeId, row]));
  const merges = new Map(migration.canonicalMerges.map((row) => [row.sourceLegacyRuntimeId, row]));
  const quarantines = new Map((migration.canonicalQuarantines ?? []).map((row) => [
    row.sourceLegacyRuntimeId,
    row,
  ]));
  const byLegacy = new Map(catalog.products.map((row) => [String(row.id).toLowerCase(), row]));
  for (const correction of corrections.values()) {
    const product = byLegacy.get(correction.legacyRuntimeId);
    if (!product || product.cat !== correction.category
      || registryBrandKey(product.brand) !== registryBrandKey(correction.brand)
      || ![registryModelKey(correction.fromModel), registryModelKey(correction.toModel)]
        .includes(registryModelKey(product.model))) {
      throw new Error(`catalog identity drift for ${correction.legacyRuntimeId}`);
    }
  }
  for (const merge of merges.values()) {
    const source = byLegacy.get(merge.sourceLegacyRuntimeId);
    if (source && identityKey(source.cat, source.brand, source.model) !== identityKey(
      merge.sourceIdentity.category,
      merge.sourceIdentity.brand,
      merge.sourceIdentity.model,
    )) throw new Error(`catalog identity drift for ${merge.sourceLegacyRuntimeId}`);
    const target = byLegacy.get(merge.targetLegacyRuntimeId);
    if (!target || identityKey(target.cat, target.brand, target.model) !== identityKey(
      merge.targetIdentity.category,
      merge.targetIdentity.brand,
      merge.targetIdentity.model,
    )) throw new Error(`catalog merge target identity drift for ${merge.targetLegacyRuntimeId}`);
  }
  for (const quarantine of quarantines.values()) {
    const source = byLegacy.get(quarantine.sourceLegacyRuntimeId);
    if (source && identityKey(source.cat, source.brand, source.model) !== identityKey(
      quarantine.sourceIdentity.category,
      quarantine.sourceIdentity.brand,
      quarantine.sourceIdentity.model,
    )) throw new Error(`catalog quarantine source identity drift for ${quarantine.sourceLegacyRuntimeId}`);
    const target = byLegacy.get(quarantine.targetLegacyRuntimeId);
    if (!target || identityKey(target.cat, target.brand, target.model) !== identityKey(
      quarantine.targetIdentity.category,
      quarantine.targetIdentity.brand,
      quarantine.targetIdentity.model,
    )) throw new Error(`catalog quarantine target identity drift for ${quarantine.targetLegacyRuntimeId}`);
  }
  const products = catalog.products.flatMap((row) => {
    const legacyId = String(row.id).toLowerCase();
    if (merges.has(legacyId) || quarantines.has(legacyId)) return [];
    const correction = corrections.get(legacyId);
    if (!correction || registryModelKey(row.model) === registryModelKey(correction.toModel)) {
      return [structuredClone(row)];
    }
    return [{
      ...structuredClone(row),
      model: correction.toModel,
      ...(row.displayName == null ? {} : {
        displayName: replaceExactModel(row.displayName, correction.fromModel, correction.toModel),
      }),
      ...(row.title == null ? {} : {
        title: replaceExactModel(row.title, correction.fromModel, correction.toModel),
      }),
    }];
  });
  const identities = products.map((row) => identityKey(row.cat, row.brand, row.model));
  if (new Set(identities).size !== identities.length) {
    throw new Error('catalog identity migration created a canonical identity collision');
  }
  return freezeDeep({ ...structuredClone(catalog), products });
}

function mergeById(existing, incoming, label) {
  const byId = new Map();
  for (const value of [...existing, ...incoming]) {
    const id = required(value.id, `${label} ID`);
    const prior = byId.get(id);
    if (prior && !sameCanonical(prior, value)) throw new Error(`conflicting ${label} ID ${id}`);
    if (!prior) byId.set(id, structuredClone(value));
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function ledgerSummary(document) {
  const observations = document.observations.map(createObservation);
  const currentBaselineObservations = Number(document.summary.currentBaselineObservations);
  return {
    observations: observations.length,
    currentBaselineObservations,
    preservedHistoricalObservations: observations.length - currentBaselineObservations,
    legacyUnknownObservations: observations.filter((row) => row.sourceType === 'legacy_catalog'
      && row.availability === 'unknown').length,
    authoritativeTypedObservations: observations.filter((row) => row.sourceType !== 'legacy_catalog').length,
    collectionAttempts: document.collectionAttempts.length,
    canonicalProducts: new Set(observations.map((row) => row.canonicalProductId)).size,
  };
}

function migrationResolutionSemantics(migration) {
  if (migration.schemaVersion >= 4) {
    return migration.sourceBindings.resolutionEpochs.map((epoch) => epoch.semanticSha256);
  }
  return [migration.sourceBindings.resolutionSemanticSha256];
}

function migrationAlreadyApplied(ledger, migration) {
  const events = new Map((ledger.identityResolutionEvents ?? []).map((event) => [event.id, event]));
  const observations = new Map(ledger.observations.map((observation) => [observation.id, observation]));
  const boundResolutions = new Set(ledger.sourceBindings
    .filter((row) => row.kind === 'IDENTITY_RESOLUTION')
    .map((row) => row.sha256));
  return migrationResolutionSemantics(migration).every((semantic) => boundResolutions.has(semantic))
    && migration.linkEvents.every((event) => (
    sameCanonical(events.get(event.id), event)
    && (event.observation == null || sameCanonical(observations.get(event.observation.id), event.observation))
  ));
}

export function applyRetailerIdentityMigrationToLedger({ ledger, migration }) {
  validateRetailerIdentityMigration(migration);
  validateRetailerObservationLedger(ledger);
  if (ledger.semanticSha256 !== migration.sourceBindings.retailerLedgerSemanticSha256) {
    if (migrationAlreadyApplied(ledger, migration)) return freezeDeep(structuredClone(ledger));
    throw new Error('retailer identity migration ledger epoch drift');
  }
  const boundHashes = new Set(ledger.sourceBindings.map((binding) => binding.sha256));
  for (const event of migration.linkEvents) {
    if (!boundHashes.has(event.rawSourceSha256)) {
      throw new Error(`retailer identity event lacks immutable raw binding: ${event.baselineLinkId}`);
    }
  }
  const observations = mergeById(
    ledger.observations,
    migration.linkEvents.map((event) => event.observation).filter(Boolean),
    'retailer observation',
  );
  const identityResolutionEvents = mergeById(
    ledger.identityResolutionEvents ?? [],
    migration.linkEvents,
    'retailer identity resolution event',
  );
  const sourceBindings = mergeById(ledger.sourceBindings, migrationResolutionSemantics(migration).map((semantic) => ({
    id: `retailer-identity-resolution:${semantic}`,
    sha256: semantic,
    kind: 'IDENTITY_RESOLUTION',
  })), 'retailer source binding');
  const document = {
    ...structuredClone(ledger),
    sourceBindings,
    observations,
    identityResolutionEvents,
  };
  document.summary = ledgerSummary(document);
  delete document.semanticSha256;
  document.semanticSha256 = canonicalSha256(document);
  validateRetailerObservationLedger(document);
  return freezeDeep(document);
}
