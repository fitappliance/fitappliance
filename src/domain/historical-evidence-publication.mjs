import {
  auditHistoricalEvidenceRecoveryBundle,
} from './historical-evidence-recovery-audit.mjs';
import {
  canonicalJsonSha256,
  validateHistoricalEvidenceRecoveryAcceptanceBundle,
} from './historical-evidence-recovery-contract.mjs';
import { isCurrentRetailProduct } from './historical-appliance-reference.mjs';

const AXIS_FIELDS = Object.freeze({
  width: 'closedEnvelope.widthMm',
  height: 'closedEnvelope.heightMm',
  depth: 'closedEnvelope.depthMm',
});

function text(value) {
  return String(value ?? '').trim();
}

function identityKey(value) {
  return [value?.brand, value?.model, value?.category ?? value?.cat]
    .map((part) => text(part).toUpperCase())
    .join('\0');
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function fixedHeight(value) {
  if (positiveInteger(value)) return value;
  const minimum = positiveInteger(value?.minimumMm);
  const maximum = positiveInteger(value?.maximumMm);
  return minimum !== null && minimum === maximum ? minimum : null;
}

export function scalarHistoricalDimensions(geometryProjection) {
  const closed = geometryProjection?.geometry?.closedEnvelope;
  const dimensions = {
    width: positiveInteger(closed?.widthMm),
    height: fixedHeight(closed?.heightMm),
    depth: positiveInteger(closed?.depthMm),
  };
  return Object.values(dimensions).every((value) => value !== null) ? dimensions : null;
}

function projectedSources(entry) {
  return entry.sources.map((source) => ({
    authority: source.authority,
    sourceType: source.sourceType,
    sourceUrl: source.sourceUrl,
    finalUrl: source.finalUrl,
    contentType: source.contentType,
    contentSha256: source.contentSha256,
    receiptBindingSha256: source.verificationReceipt.bindingSha256,
    verifiedAt: source.verificationReceipt.verifiedAt,
  }));
}

function modelReceipts(entry) {
  const evidence = entry.geometryProjection?.fieldEvidence ?? {};
  return entry.sources.map((source) => {
    const fields = {};
    for (const [axis, field] of Object.entries(AXIS_FIELDS)) {
      const locator = evidence[field];
      if (locator?.contentSha256 !== source.contentSha256) continue;
      fields[axis] = {
        page: locator.page ?? null,
        fragmentSha256: locator.fragmentSha256,
      };
    }
    return {
      targetId: entry.targetId,
      sourceUrl: source.sourceUrl,
      contentSha256: source.contentSha256,
      receiptBindingSha256: source.verificationReceipt.bindingSha256,
      verifiedAt: source.verificationReceipt.verifiedAt,
      fields,
    };
  });
}

function currentAcceptance(entry) {
  const sources = projectedSources(entry);
  const identityOutcomes = [...new Set(entry.sources.map((source) => source.identity.outcome))];
  if (identityOutcomes.length !== 1) {
    throw new Error(`mixed source identity outcomes for ${entry.targetId}`);
  }
  const primary = sources[0];
  const contentTypes = [...new Set(sources.map((source) => source.contentType))];
  const artifactType = contentTypes.length === 1
    ? contentTypes[0] === 'application/pdf' ? 'pdf' : 'html'
    : 'mixed';
  const projection = entry.geometryProjection;
  return Object.freeze({
    acceptanceId: entry.targetId,
    identityOutcome: identityOutcomes[0],
    sourceModel: entry.sources[0].identity.sourceModel ?? null,
    artifactType,
    sourceType: primary.sourceType,
    sourceUrl: primary.sourceUrl,
    contentSha256: primary.contentSha256,
    receiptBindingSha256: primary.receiptBindingSha256,
    verifiedAt: primary.verifiedAt,
    sources,
    geometry_v2: structuredClone(projection.geometry),
    geometry_v2_provenance: {
      schemaVersion: 1,
      evidenceLevel: projection.evidenceLevel,
      fieldEvidence: structuredClone(projection.fieldEvidence),
      activeSourceHashes: [...projection.activeSourceHashes],
      missingForVerifiedFit: [...projection.missingForVerifiedFit],
      verifiedFitEligible: projection.verifiedFitEligible,
      successfulFitOutcome: projection.successfulFitOutcome,
    },
  });
}

function assertEntryIdentity(entry, product) {
  if (identityKey(entry) !== identityKey(product)) {
    throw new Error(`historical recovery catalog identity mismatch for ${entry.targetId}`);
  }
}

export function buildHistoricalEvidencePublication({ bundle, products }) {
  validateHistoricalEvidenceRecoveryAcceptanceBundle(bundle);
  const offline = auditHistoricalEvidenceRecoveryBundle(bundle);
  if (offline.status !== 'passed') {
    throw new Error(`historical recovery bundle replay failed: ${offline.violations.join('; ')}`);
  }
  if (!Array.isArray(products)) throw new TypeError('catalog products required');

  const productById = new Map();
  for (const product of products) {
    const id = text(product?.id).toLowerCase();
    if (!id) throw new TypeError('catalog product id required');
    if (productById.has(id)) throw new TypeError(`duplicate catalog product ${id}`);
    productById.set(id, product);
  }

  const currentAcceptanceByLegacyId = new Map();
  const historicalRecords = [];
  const referenceIds = new Set();
  for (const entry of bundle.entries) {
    if (referenceIds.has(entry.referenceId)) {
      throw new Error(`duplicate historical recovery reference ${entry.referenceId}`);
    }
    referenceIds.add(entry.referenceId);
    const product = productById.get(text(entry.legacyRuntimeId).toLowerCase());
    if (product) assertEntryIdentity(entry, product);

    if (entry.lifecycleState === 'CURRENT_RETAIL') {
      if (!product) throw new Error(`current recovery catalog product missing: ${entry.legacyRuntimeId}`);
      if (!isCurrentRetailProduct(product)) {
        throw new Error(`current recovery lifecycle drift for ${entry.targetId}`);
      }
      if (entry.acceptanceStatus === 'accepted' && scalarHistoricalDimensions(entry.geometryProjection)) {
        if (currentAcceptanceByLegacyId.has(entry.legacyRuntimeId)) {
          throw new Error(`duplicate current recovery product ${entry.legacyRuntimeId}`);
        }
        currentAcceptanceByLegacyId.set(entry.legacyRuntimeId, currentAcceptance(entry));
      }
    } else if (entry.lifecycleState === 'CATALOG_ARCHIVED') {
      if (product && isCurrentRetailProduct(product)) {
        throw new Error(`archived recovery lifecycle drift for ${entry.targetId}`);
      }
    } else {
      throw new Error(`unsupported recovery publication lifecycle: ${entry.lifecycleState}`);
    }

    historicalRecords.push(Object.freeze({
      targetId: entry.targetId,
      referenceId: entry.referenceId,
      legacyRuntimeId: entry.legacyRuntimeId,
      canonicalProductId: entry.canonicalProductId,
      brand: entry.brand,
      model: entry.model,
      category: entry.category,
      lifecycleState: entry.lifecycleState,
      acceptanceStatus: entry.acceptanceStatus,
      dimensionsMm: scalarHistoricalDimensions(entry.geometryProjection),
      geometryProjection: structuredClone(entry.geometryProjection),
      modelReceipts: modelReceipts(entry),
    }));
  }

  historicalRecords.sort((left, right) => left.referenceId.localeCompare(right.referenceId));
  return Object.freeze({
    currentAcceptanceByLegacyId,
    historicalEvidenceProjection: Object.freeze({
      schemaVersion: 1,
      bundleId: bundle.bundleId,
      bundleSha256: canonicalJsonSha256(bundle),
      records: Object.freeze(historicalRecords),
      summary: Object.freeze({
        records: historicalRecords.length,
        scalarDimensions: historicalRecords.filter((record) => record.dimensionsMm).length,
        nonScalar: historicalRecords.filter((record) => !record.dimensionsMm).length,
      }),
    }),
  });
}
