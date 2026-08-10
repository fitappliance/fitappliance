import { createHash } from 'node:crypto';

import { registryBrandKey, registryModelKey } from './energy-rating-registry.mjs';
import { historicalReferenceIdFor } from './historical-appliance-reference.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const RELEASE_ID = /^retail_lifecycle_release_[a-f0-9]{24}$/;
const AXES = Object.freeze(['width', 'height', 'depth']);
const FIELDS = Object.freeze({
  width: 'closedEnvelope.widthMm',
  height: 'closedEnvelope.heightMm',
  depth: 'closedEnvelope.depthMm',
});
const EXPLICIT_DISPOSITIONS = new Set(['SIBLING_ONLY', 'REGIONAL_VARIANT', 'CONFLICT']);
const REQUIRED_USE_ACTIONS = Object.freeze(['replacement_lookup', 'public_display']);
const ACTION_WEIGHT = Object.freeze({
  AUTO_FILL: 0,
  CONFIRM_REQUIRED: 1,
  MEASURE_REQUIRED: 2,
  QUARANTINED: 3,
});

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

function semanticSha256(value) {
  return sha256(JSON.stringify(canonical(value)));
}

function documentSha256(value) {
  return sha256(`${JSON.stringify(value, null, 2)}\n`);
}

function requiredString(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} must be a non-empty string`);
  return result;
}

function requireSha256(value, label) {
  const result = requiredString(value, label).toLowerCase();
  if (!SHA256.test(result)) throw new TypeError(`${label} must be a SHA-256 value`);
  return result;
}

function validateReleaseBinding(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('active release binding is required');
  }
  const releaseCandidateId = requiredString(value.releaseCandidateId, 'active release ID');
  if (!RELEASE_ID.test(releaseCandidateId)) throw new TypeError('active release ID is invalid');
  const activatedAt = new Date(requiredString(value.activatedAt, 'active release timestamp'));
  if (Number.isNaN(activatedAt.valueOf())) throw new TypeError('active release timestamp is invalid');
  return Object.freeze({
    releaseCandidateId,
    activatedAt: activatedAt.toISOString(),
    catalogSha256: requireSha256(value.catalogSha256, 'catalog bytes hash'),
    historicalReferenceSha256: requireSha256(
      value.historicalReferenceSha256,
      'historical reference bytes hash',
    ),
  });
}

function exactKey(category, brand, model) {
  return `${category}\0${registryBrandKey(brand)}\0${registryModelKey(model)}`;
}

function identityForCatalog(product) {
  const category = requiredString(product.cat, 'catalog category');
  const brandKey = requiredString(
    registryBrandKey(requiredString(product.brand, 'catalog brand')),
    'catalog normalized brand',
  );
  const modelKey = requiredString(
    registryModelKey(requiredString(product.model, 'catalog model')),
    'catalog normalized model',
  );
  return Object.freeze({
    category,
    registryBrandKey: brandKey,
    registryModelKey: modelKey,
  });
}

function identityForReference(record) {
  const category = requiredString(record.category, 'historical category');
  const brand = requiredString(record.brand, 'historical brand');
  const model = requiredString(record.model, 'historical model');
  if (record.referenceId !== historicalReferenceIdFor(category, brand, model)) {
    throw new Error(`historical reference identity mismatch: ${record.referenceId}`);
  }
  return Object.freeze({
    category,
    registryBrandKey: requiredString(registryBrandKey(brand), 'historical normalized brand'),
    registryModelKey: requiredString(registryModelKey(model), 'historical normalized model'),
  });
}

function validateUniverses(catalogDocument, historicalReferenceDocument) {
  if (!catalogDocument || !historicalReferenceDocument
    || catalogDocument === historicalReferenceDocument
    || catalogDocument?.products === historicalReferenceDocument?.records) {
    throw new TypeError('catalog and historical reference must be separate immutable universes');
  }
  if (!Array.isArray(catalogDocument.products) || !Array.isArray(historicalReferenceDocument.records)) {
    throw new TypeError('explicit catalog products and historical records roles are required');
  }
  if (catalogDocument.products === historicalReferenceDocument.records) {
    throw new TypeError('catalog and historical reference must be separate immutable universes');
  }
  for (const [ordinal, product] of catalogDocument.products.entries()) {
    if (!product || typeof product !== 'object' || Array.isArray(product)
      || product.referenceId !== undefined || !product.id || !product.cat) {
      throw new TypeError(`catalog row ${ordinal} violates the catalog role`);
    }
    identityForCatalog(product);
  }
  for (const [ordinal, record] of historicalReferenceDocument.records.entries()) {
    if (!record || typeof record !== 'object' || Array.isArray(record)
      || !record.referenceId || !record.category || record.cat !== undefined) {
      throw new TypeError(`historical row ${ordinal} violates the historical role`);
    }
    identityForReference(record);
  }
}

function groupRows(rows, identityFor, role) {
  const groups = new Map();
  rows.forEach((row, sourceOrdinal) => {
    const identity = identityFor(row);
    const key = exactKey(identity.category, identity.registryBrandKey, identity.registryModelKey);
    if (groups.has(key)) {
      throw new Error(`ambiguous ${role} exact identity: ${key.replaceAll('\0', '/')}`);
    }
    groups.set(key, [{ row, sourceOrdinal, identity }]);
  });
  return groups;
}

function explicitMappingsFor({ mappings, catalogRows, historicalRows, automaticPairs }) {
  if (!Array.isArray(mappings)) throw new TypeError('explicit mappings must be an array');
  const catalogById = new Map();
  const historicalById = new Map();
  catalogRows.forEach((entry) => {
    const id = requiredString(entry.row.id, 'catalog product ID');
    if (catalogById.has(id)) throw new Error(`duplicate catalog product ID: ${id}`);
    catalogById.set(id, entry);
  });
  historicalRows.forEach((entry) => {
    const id = requiredString(entry.row.referenceId, 'historical reference ID');
    if (historicalById.has(id)) throw new Error(`duplicate historical reference ID: ${id}`);
    historicalById.set(id, entry);
  });
  const automaticCatalog = new Set(automaticPairs.map((pair) => pair.catalogSourceOrdinal));
  const automaticHistorical = new Set(automaticPairs.map((pair) => pair.historicalSourceOrdinal));
  const seenPairs = new Set();
  const seenCatalog = new Set();
  const seenHistorical = new Set();
  return mappings.map((mapping, index) => {
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
      throw new TypeError(`explicit mapping ${index} must be an object`);
    }
    if (!EXPLICIT_DISPOSITIONS.has(mapping.disposition)) {
      throw new TypeError(`explicit mapping ${index} disposition is invalid`);
    }
    const catalog = catalogById.get(requiredString(mapping.catalogProductId, 'mapping catalog product ID'));
    const historical = historicalById.get(
      requiredString(mapping.historicalReferenceId, 'mapping historical reference ID'),
    );
    if (!catalog || !historical) throw new Error(`explicit mapping ${index} has wrong universe scope`);
    const expected = {
      category: catalog.identity.category,
      catalogRegistryBrandKey: catalog.identity.registryBrandKey,
      catalogRegistryModelKey: catalog.identity.registryModelKey,
      historicalRegistryBrandKey: historical.identity.registryBrandKey,
      historicalRegistryModelKey: historical.identity.registryModelKey,
    };
    if (Object.entries(expected).some(([field, value]) => mapping[field] !== value)
      || mapping.category !== historical.identity.category) {
      throw new Error(`explicit mapping ${index} mapping scope does not match source identities`);
    }
    const catalogKey = exactKey(
      catalog.identity.category,
      catalog.identity.registryBrandKey,
      catalog.identity.registryModelKey,
    );
    const historicalKey = exactKey(
      historical.identity.category,
      historical.identity.registryBrandKey,
      historical.identity.registryModelKey,
    );
    if (catalogKey === historicalKey) {
      throw new Error('exact same model cannot use an explicit non-exact mapping');
    }
    if (automaticCatalog.has(catalog.sourceOrdinal) || automaticHistorical.has(historical.sourceOrdinal)) {
      throw new Error(`explicit mapping ${index} is ambiguous with an automatic exact mapping`);
    }
    const pairKey = `${catalog.sourceOrdinal}\0${historical.sourceOrdinal}`;
    if (seenPairs.has(pairKey) || seenCatalog.has(catalog.sourceOrdinal)
      || seenHistorical.has(historical.sourceOrdinal)) {
      throw new Error(`duplicate or ambiguous explicit mapping ${index}`);
    }
    seenPairs.add(pairKey);
    seenCatalog.add(catalog.sourceOrdinal);
    seenHistorical.add(historical.sourceOrdinal);
    return Object.freeze({
      disposition: mapping.disposition,
      catalogSourceOrdinal: catalog.sourceOrdinal,
      catalogProductId: catalog.row.id,
      historicalSourceOrdinal: historical.sourceOrdinal,
      historicalReferenceId: historical.row.referenceId,
    });
  });
}

function normalizeRightsDispositions(dispositions) {
  if (!Array.isArray(dispositions)) throw new TypeError('rights dispositions must be an array');
  return dispositions.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError(`rights disposition ${index} must be an object`);
    }
    const validFrom = new Date(requiredString(value.validFrom, 'rights validFrom'));
    const validUntil = new Date(requiredString(value.validUntil, 'rights validUntil'));
    if (Number.isNaN(validFrom.valueOf()) || Number.isNaN(validUntil.valueOf())) {
      throw new TypeError(`rights disposition ${index} validity is invalid`);
    }
    if (validFrom > validUntil) {
      throw new TypeError(`rights disposition ${index} validity range is invalid`);
    }
    const withdrawnAt = value.withdrawnAt == null ? null : new Date(value.withdrawnAt);
    if (withdrawnAt && Number.isNaN(withdrawnAt.valueOf())) {
      throw new TypeError(`rights disposition ${index} withdrawal is invalid`);
    }
    const axisBindings = {};
    for (const axis of AXES) {
      const binding = value.axisBindings?.[axis];
      if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
        throw new TypeError(`rights disposition ${index} ${axis} binding is required`);
      }
      axisBindings[axis] = Object.freeze({
        field: FIELDS[axis],
        contentSha256: requireSha256(binding.contentSha256, `rights ${axis} content hash`),
        receiptBindingSha256: requireSha256(
          binding.receiptBindingSha256,
          `rights ${axis} receipt binding hash`,
        ),
        sourceSnapshotSha256: requireSha256(
          binding.sourceSnapshotSha256,
          `rights ${axis} source snapshot hash`,
        ),
      });
    }
    return Object.freeze({
      disposition: requiredString(value.disposition, 'rights disposition'),
      referenceId: requiredString(value.referenceId, 'rights reference ID'),
      category: requiredString(value.category, 'rights category'),
      registryBrandKey: requiredString(value.registryBrandKey, 'rights brand key'),
      registryModelKey: requiredString(value.registryModelKey, 'rights model key'),
      useActions: Object.freeze([...new Set((value.useActions ?? []).map(String))].sort()),
      validFrom: validFrom.toISOString(),
      validUntil: validUntil.toISOString(),
      withdrawnAt: withdrawnAt?.toISOString() ?? null,
      axisBindings: Object.freeze(axisBindings),
    });
  });
}

function maxAction(...actions) {
  return actions.reduce((strictest, action) => (
    ACTION_WEIGHT[action] > ACTION_WEIGHT[strictest] ? action : strictest
  ), 'AUTO_FILL');
}

function scalarDimensionsState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || AXES.some((axis) => value[axis] === undefined || value[axis] === null)) {
    return 'MISSING';
  }
  return AXES.every((axis) => Number.isInteger(value[axis]) && value[axis] > 0)
    ? 'COMPLETE'
    : 'INVALID';
}

function validAxisLocator(locator, receipt) {
  if (!locator || typeof locator !== 'object' || Array.isArray(locator)) return false;
  if (locator.locatorKind === 'PDF_FRAGMENT') {
    return [null, undefined, 'application/pdf'].includes(receipt.contentType)
      && Number.isInteger(locator.page)
      && locator.page > 0
      && SHA256.test(String(locator.fragmentSha256 ?? ''));
  }
  if (locator.locatorKind === 'HTML_ARTIFACT') {
    return receipt.contentType === 'text/html'
      && locator.artifactSha256 === receipt.contentSha256;
  }
  if (locator.locatorKind === 'JSON_ARTIFACT') {
    return receipt.contentType === 'application/json'
      && locator.artifactSha256 === receipt.contentSha256;
  }
  return false;
}

function receiptForAllAxes(record, at) {
  return (record.modelReceipts ?? []).find((receipt) => (
    String(receipt?.targetId ?? '').trim().length > 0
    && /^https:\/\//.test(String(receipt?.sourceUrl ?? ''))
    && SHA256.test(String(receipt?.contentSha256 ?? ''))
    && SHA256.test(String(receipt?.receiptBindingSha256 ?? ''))
    && Number.isFinite(Date.parse(receipt?.verifiedAt))
    && Date.parse(receipt.verifiedAt) <= at
    && AXES.every((axis) => validAxisLocator(receipt?.fields?.[axis], receipt))
    && (record.sources ?? []).some((source) => (
      source?.snapshotSha256 === receipt.contentSha256
      && source?.sourceId === `historical-recovery:${receipt.targetId}`
    ))
  )) ?? null;
}

function rightsDecision({ record, receipt, dispositions, at }) {
  const identity = identityForReference(record);
  const candidates = dispositions.filter((rights) => rights.referenceId === record.referenceId);
  if (candidates.length === 0) return { allowed: false, reason: 'RIGHTS_DISPOSITION_MISSING' };
  if (candidates.length > 1) return { allowed: false, reason: 'RIGHTS_DISPOSITION_AMBIGUOUS' };
  const rights = candidates[0];
  if (rights.disposition !== 'ALLOWED') return { allowed: false, reason: 'RIGHTS_NOT_ALLOWED' };
  if (rights.category !== identity.category
    || rights.registryBrandKey !== identity.registryBrandKey
    || rights.registryModelKey !== identity.registryModelKey) {
    return { allowed: false, reason: 'RIGHTS_MODEL_SCOPE_MISMATCH' };
  }
  if (rights.withdrawnAt && Date.parse(rights.withdrawnAt) <= at) {
    return { allowed: false, reason: 'RIGHTS_WITHDRAWN' };
  }
  if (Date.parse(rights.validFrom) > at || Date.parse(rights.validUntil) < at) {
    return { allowed: false, reason: 'RIGHTS_EXPIRED' };
  }
  if (!REQUIRED_USE_ACTIONS.every((action) => rights.useActions.includes(action))) {
    return { allowed: false, reason: 'RIGHTS_USE_ACTION_MISSING' };
  }
  if (AXES.some((axis) => {
    const binding = rights.axisBindings[axis];
    return binding.contentSha256 !== receipt?.contentSha256
      || binding.receiptBindingSha256 !== receipt?.receiptBindingSha256
      || binding.sourceSnapshotSha256 !== receipt?.contentSha256;
  })) {
    return { allowed: false, reason: 'RIGHTS_EVIDENCE_BINDING_MISMATCH' };
  }
  return { allowed: true, reason: null };
}

function effectiveAction({ record, mappingDisposition, rightsDispositions, at }) {
  const declared = ACTION_WEIGHT[record.lookupAction] === undefined
    ? 'QUARANTINED'
    : record.lookupAction;
  const reasons = [];
  if (declared === 'QUARANTINED') reasons.push('DECLARED_QUARANTINE_PRESERVED');
  if (['INTERNAL_CONFLICT', 'AXIS_SUSPECT', 'INVALID_DIMENSIONS'].includes(record.evidenceState)
    || (record.reasonCodes ?? []).some((reason) => /CONFLICT|AXIS_SUSPECT|INVALID_DIMENSION/.test(reason))) {
    reasons.push('EVIDENCE_CONFLICT_OR_INVALID_AXIS');
    return { action: 'QUARANTINED', reasons };
  }
  if (['SIBLING_ONLY', 'REGIONAL_VARIANT', 'CONFLICT'].includes(mappingDisposition)) {
    reasons.push('NON_EXACT_MODEL_MAPPING');
    return { action: 'QUARANTINED', reasons };
  }
  const dimensionsState = scalarDimensionsState(record.dimensionsMm);
  if (dimensionsState === 'INVALID') {
    reasons.push('DIMENSIONS_INVALID');
    return { action: 'QUARANTINED', reasons };
  }
  if (dimensionsState === 'MISSING') {
    reasons.push('DIMENSIONS_INCOMPLETE');
    return { action: maxAction(declared, 'MEASURE_REQUIRED'), reasons };
  }
  const receipt = receiptForAllAxes(record, at);
  if (!receipt) {
    reasons.push((record.modelReceipts ?? []).length > 0 ? 'RECEIPT_AXIS_MISSING' : 'EXACT_RECEIPT_MISSING');
    return { action: maxAction(declared, 'MEASURE_REQUIRED'), reasons };
  }
  if ((record.reasonCodes ?? []).some((reason) => /NON_SCALAR|RANGE/.test(reason))) {
    reasons.push('NON_SCALAR_OR_RANGE_SIGNAL');
    return { action: maxAction(declared, 'CONFIRM_REQUIRED'), reasons };
  }
  if (record.evidenceState !== 'MODEL_RECEIPT') {
    reasons.push('EXACT_MODEL_SCOPE_UNPROVEN');
    return { action: maxAction(declared, 'CONFIRM_REQUIRED'), reasons };
  }
  const rights = rightsDecision({ record, receipt, dispositions: rightsDispositions, at });
  if (!rights.allowed) {
    reasons.push(rights.reason);
    return { action: maxAction(declared, 'CONFIRM_REQUIRED'), reasons };
  }
  return { action: declared, reasons };
}

function replacementCandidateDecision({ candidate, catalogDocument }) {
  const reasons = [];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)
    || !catalogDocument || !Array.isArray(catalogDocument.products)
    || !catalogDocument.products.includes(candidate)) {
    reasons.push('NOT_BOUND_CATALOG_ROW');
    return Object.freeze({ eligible: false, reasonCodes: Object.freeze(reasons) });
  }
  if (candidate.lifecycleVisibility !== 'CURRENT_OUTPUT') reasons.push('NOT_CURRENT_OUTPUT');
  if (!String(candidate.canonicalProductId ?? '').trim()) {
    reasons.push('CANONICAL_PRODUCT_ID_MISSING');
  }
  if (![candidate.w, candidate.h, candidate.d].every((value) => Number.isInteger(value) && value > 0)) {
    reasons.push('OUTSIDE_DIMENSIONS_INCOMPLETE');
  }
  const lifecycle = candidate.retailLifecycle;
  const observation = lifecycle?.authorizingObservation;
  if (lifecycle?.lifecycleState !== 'CURRENT_RETAIL') reasons.push('CURRENT_RETAIL_LIFECYCLE_MISSING');
  if (lifecycle?.canonicalProductId !== candidate.canonicalProductId
    || observation?.canonicalProductId !== candidate.canonicalProductId) {
    reasons.push('CANONICAL_PRODUCT_ID_MISMATCH');
  }
  if (observation?.availability !== 'available'
    || !['current', 'relisted'].includes(observation?.listingState)
    || observation?.freshnessState !== 'FRESH') {
    reasons.push('AUTHORIZING_OBSERVATION_INELIGIBLE');
  }
  if (!SHA256.test(String(observation?.rawSourceSha256 ?? ''))) {
    reasons.push('AUTHORIZING_SOURCE_HASH_INVALID');
  }
  return Object.freeze({ eligible: reasons.length === 0, reasonCodes: Object.freeze(reasons) });
}

export function isReplacementCandidateEligible({ candidate, catalogDocument, releaseBinding: rawBinding }) {
  const releaseBinding = validateReleaseBinding(rawBinding);
  if (!catalogDocument || documentSha256(catalogDocument) !== releaseBinding.catalogSha256) {
    return Object.freeze({
      eligible: false,
      reasonCodes: Object.freeze(['CATALOG_RELEASE_HASH_MISMATCH']),
    });
  }
  return replacementCandidateDecision({ candidate, catalogDocument });
}

export function buildFitV4UniverseReconciliation({
  releaseBinding: rawReleaseBinding,
  catalogDocument,
  historicalReferenceDocument,
  explicitMappings = [],
  rightsDispositions = [],
}) {
  const releaseBinding = validateReleaseBinding(rawReleaseBinding);
  validateUniverses(catalogDocument, historicalReferenceDocument);
  if (documentSha256(catalogDocument) !== releaseBinding.catalogSha256) {
    throw new Error('catalog release hash drift');
  }
  if (documentSha256(historicalReferenceDocument) !== releaseBinding.historicalReferenceSha256) {
    throw new Error('historical reference release hash drift');
  }
  const normalizedRights = normalizeRightsDispositions(rightsDispositions);
  const catalogGroups = groupRows(catalogDocument.products, identityForCatalog, 'catalog');
  const historicalGroups = groupRows(
    historicalReferenceDocument.records,
    identityForReference,
    'historical reference',
  );
  const catalogEntries = [...catalogGroups.values()].flat().sort((a, b) => a.sourceOrdinal - b.sourceOrdinal);
  const historicalEntries = [...historicalGroups.values()].flat().sort((a, b) => a.sourceOrdinal - b.sourceOrdinal);

  const automaticPairs = [];
  for (const [key, catalogs] of catalogGroups) {
    const historical = historicalGroups.get(key) ?? [];
    if (catalogs.length > 1 || historical.length > 1) {
      throw new Error(`ambiguous exact model scope: ${key.replaceAll('\0', '/')}`);
    }
    if (catalogs.length === 1 && historical.length === 1) {
      automaticPairs.push(Object.freeze({
        disposition: 'EXACT_SAME_MODEL',
        catalogSourceOrdinal: catalogs[0].sourceOrdinal,
        catalogProductId: catalogs[0].row.id,
        historicalSourceOrdinal: historical[0].sourceOrdinal,
        historicalReferenceId: historical[0].row.referenceId,
      }));
    }
  }
  const nonExactPairs = explicitMappingsFor({
    mappings: explicitMappings,
    catalogRows: catalogEntries,
    historicalRows: historicalEntries,
    automaticPairs,
  });
  const mappings = [...automaticPairs, ...nonExactPairs].sort((left, right) => (
    left.catalogSourceOrdinal - right.catalogSourceOrdinal
    || left.historicalSourceOrdinal - right.historicalSourceOrdinal
    || left.disposition.localeCompare(right.disposition)
  ));
  const mappingByCatalog = new Map(mappings.map((mapping) => [mapping.catalogSourceOrdinal, mapping]));
  const mappingByHistorical = new Map(mappings.map((mapping) => [mapping.historicalSourceOrdinal, mapping]));
  const at = Date.parse(releaseBinding.activatedAt);

  const catalogRows = catalogEntries.map(({ row, sourceOrdinal, identity }) => {
    const mapping = mappingByCatalog.get(sourceOrdinal);
    const replacementCandidate = replacementCandidateDecision({ candidate: row, catalogDocument });
    return Object.freeze({
      rowIdentity: `CATALOG:${sourceOrdinal}`,
      universeRole: 'RETAIL_CATALOG_ENTRY',
      sourceOrdinal,
      catalogProductId: row.id,
      canonicalProductId: row.canonicalProductId ?? null,
      ...identity,
      mappingDisposition: mapping?.disposition ?? 'NO_MAPPING',
      historicalReferenceId: mapping?.historicalReferenceId ?? null,
      replacementCandidateEligible: replacementCandidate.eligible,
      replacementCandidateReasonCodes: replacementCandidate.reasonCodes,
    });
  });
  const historicalRows = historicalEntries.map(({ row, sourceOrdinal, identity }) => {
    const mapping = mappingByHistorical.get(sourceOrdinal);
    const action = effectiveAction({
      record: row,
      mappingDisposition: mapping?.disposition ?? 'NO_MAPPING',
      rightsDispositions: normalizedRights,
      at,
    });
    return Object.freeze({
      rowIdentity: `HISTORICAL_REFERENCE:${sourceOrdinal}`,
      universeRole: 'HISTORICAL_REFERENCE_ENTRY',
      sourceOrdinal,
      historicalReferenceId: row.referenceId,
      ...identity,
      mappingDisposition: mapping?.disposition ?? 'NO_MAPPING',
      catalogProductId: mapping?.catalogProductId ?? null,
      declaredLookupAction: row.lookupAction,
      effectiveLookupAction: action.action,
      reasonCodes: Object.freeze(action.reasons),
    });
  });
  const summary = Object.freeze({
    catalogRecords: catalogDocument.products.length,
    historicalReferenceRecords: historicalReferenceDocument.records.length,
    catalogRowsReconciled: catalogRows.length,
    historicalRowsReconciled: historicalRows.length,
    exactSameModelMappings: automaticPairs.length,
    explicitNonExactMappings: nonExactPairs.length,
    noMappingHistorical: historicalRows.filter((row) => row.mappingDisposition === 'NO_MAPPING').length,
    catalogOnly: catalogRows.filter((row) => row.mappingDisposition === 'NO_MAPPING').length,
    replacementCandidatesEligible: catalogRows.filter((row) => row.replacementCandidateEligible).length,
    effectiveAutoFill: historicalRows.filter((row) => row.effectiveLookupAction === 'AUTO_FILL').length,
  });
  const artifact = {
    schemaVersion: 1,
    policyVersion: 'fit-v4-universe-reconciliation-v1',
    generatedAt: releaseBinding.activatedAt,
    releaseBinding,
    rightsInterface: Object.freeze({
      status: normalizedRights.length === 0 ? 'BLOCKED' : 'EXPLICIT_DISPOSITIONS_PROVIDED',
      blocker: normalizedRights.length === 0 ? 'PUBLICATION_RIGHTS_DISPOSITION_MISSING' : null,
      requiredFields: Object.freeze(Object.values(FIELDS)),
      requiredUseActions: REQUIRED_USE_ACTIONS,
    }),
    summary,
    mappings: Object.freeze(mappings),
    catalogRows: Object.freeze(catalogRows),
    historicalRows: Object.freeze(historicalRows),
  };
  return Object.freeze({ ...artifact, semanticSha256: semanticSha256(artifact) });
}
