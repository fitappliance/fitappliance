import {
  auditHistoricalEvidenceRecoveryBundle,
} from './historical-evidence-recovery-audit.mjs';
import {
  canonicalJsonSha256,
  validateHistoricalEvidenceRecoveryAcceptanceBundle,
} from './historical-evidence-recovery-contract.mjs';
import { isCurrentRetailProduct } from './historical-appliance-reference.mjs';
import { inferApplianceFormFactor } from './appliance-form-factor.mjs';
import { isStandaloneOfficialHtmlMarketingAlias } from './evidence-claim-reconciliation.mjs';
import { projectEvidenceGeometry } from './evidence-geometry-projector.mjs';
import { isStrictOfficialModelVariantSource } from './official-model-variant-policy.mjs';

const AXIS_FIELDS = Object.freeze({
  width: 'closedEnvelope.widthMm',
  height: 'closedEnvelope.heightMm',
  depth: 'closedEnvelope.depthMm',
});

const PUBLICATION_LIFECYCLE_STATES = Object.freeze([
  'CURRENT_RETAIL',
  'CATALOG_ARCHIVED',
  'REGISTRY_ONLY',
  'UNKNOWN_RETAIL',
]);

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

function artifactTypeForContentType(contentType) {
  if (contentType === 'application/pdf') return 'pdf';
  if (contentType === 'text/html') return 'html';
  if (contentType === 'application/json') return 'json';
  throw new TypeError(`unsupported historical evidence content type: ${contentType}`);
}

function modelReceipts(entry) {
  const evidence = entry.geometryProjection?.fieldEvidence ?? {};
  return entry.sources.map((source) => {
    const fields = {};
    for (const [axis, field] of Object.entries(AXIS_FIELDS)) {
      const primary = evidence[field];
      const locators = [primary, ...(primary?.corroborating ?? [])];
      const locator = locators.find((candidate) => (
        candidate?.contentSha256 === source.contentSha256
        && candidate?.receiptBindingSha256 === source.verificationReceipt.bindingSha256
      ));
      if (!locator) continue;
      if (source.contentType === 'application/pdf') {
        fields[axis] = {
          locatorKind: 'PDF_FRAGMENT',
          page: locator.page ?? null,
          fragmentSha256: locator.fragmentSha256 ?? null,
        };
      } else if (source.contentType === 'text/html') {
        fields[axis] = {
          locatorKind: 'HTML_ARTIFACT',
          artifactSha256: source.contentSha256,
        };
      } else if (source.contentType === 'application/json') {
        fields[axis] = {
          locatorKind: 'JSON_ARTIFACT',
          artifactSha256: source.contentSha256,
        };
      } else {
        throw new TypeError(`unsupported historical evidence content type: ${source.contentType}`);
      }
    }
    return {
      targetId: entry.targetId,
      sourceUrl: source.sourceUrl,
      contentType: source.contentType,
      objectPath: source.objectPath,
      contentSha256: source.contentSha256,
      receiptBindingSha256: source.verificationReceipt.bindingSha256,
      verifiedAt: source.verificationReceipt.verifiedAt,
      fields,
    };
  }).filter((receipt) => Object.keys(receipt.fields).length > 0);
}

function currentProjection(entry, product) {
  const stored = entry.geometryProjection;
  const storedFormFactor = stored?.geometry?.formFactor ?? null;
  const inferredFormFactor = inferApplianceFormFactor(product);
  if (storedFormFactor && inferredFormFactor && storedFormFactor !== inferredFormFactor) {
    throw new Error(`historical recovery form factor conflict for ${entry.targetId}`);
  }
  const formFactor = storedFormFactor ?? inferredFormFactor;
  if (!formFactor || formFactor === storedFormFactor) return stored;
  const projected = projectEvidenceGeometry({
    brand: entry.brand,
    model: entry.model,
    category: entry.category,
    formFactor,
    sources: entry.sources,
  });
  return assertHistoricalPublicationEvidenceCeiling(stored, projected, entry.targetId);
}

export function assertHistoricalPublicationEvidenceCeiling(stored, projected, targetId) {
  const promotesVerified = stored?.evidenceLevel !== 'verified'
    && projected?.evidenceLevel === 'verified';
  const promotesEligibility = stored?.verifiedFitEligible !== true
    && projected?.verifiedFitEligible === true;
  const promotesOutcome = stored?.successfulFitOutcome !== 'VERIFIED_FIT'
    && projected?.successfulFitOutcome === 'VERIFIED_FIT';
  if (promotesVerified || promotesEligibility || promotesOutcome) {
    throw new Error(`form-factor restoration cannot promote Fit for ${targetId}`);
  }
  return projected;
}

function assertCurrentAliasPublicationSafe(entry) {
  const identity = { brand: entry.brand, model: entry.model, category: entry.category };
  for (const source of entry.sources) {
    if (source.identity?.outcome !== 'official_marketing_alias') continue;
    if (isStandaloneOfficialHtmlMarketingAlias(source)
      || isStrictOfficialModelVariantSource(source, identity)) continue;
    throw new Error(`current official marketing alias lacks strict publication binding: ${entry.targetId}`);
  }
}

function currentAcceptance(entry, product) {
  const sources = projectedSources(entry);
  const identityOutcomes = [...new Set(entry.sources.map((source) => source.identity.outcome))];
  if (identityOutcomes.length !== 1) {
    throw new Error(`mixed source identity outcomes for ${entry.targetId}`);
  }
  if (identityOutcomes[0] === 'official_marketing_alias') {
    assertCurrentAliasPublicationSafe(entry);
  }
  const primary = sources[0];
  const contentTypes = [...new Set(sources.map((source) => source.contentType))];
  const artifactType = contentTypes.length === 1
    ? artifactTypeForContentType(contentTypes[0])
    : 'mixed';
  const projection = currentProjection(entry, product);
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

function effectiveLifecycleState(entry, product) {
  if (!product) {
    if (entry.lifecycleState === 'CURRENT_RETAIL') {
      throw new Error(`current recovery catalog product missing: ${entry.legacyRuntimeId}`);
    }
    return entry.lifecycleState;
  }

  const productId = text(product.canonicalProductId);
  const entryProductId = text(entry.canonicalProductId);
  const decision = product.retailLifecycle;
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)) {
    throw new Error(`current retail lifecycle decision missing for ${entry.targetId}`);
  }
  const lifecycleState = text(decision.lifecycleState);
  if (!PUBLICATION_LIFECYCLE_STATES.includes(lifecycleState)) {
    throw new Error(`unsupported current retail lifecycle: ${lifecycleState || 'missing'}`);
  }
  if (!productId || !entryProductId
    || text(decision.canonicalProductId) !== productId
    || entryProductId !== productId) {
    throw new Error(`historical recovery lifecycle product binding mismatch for ${entry.targetId}`);
  }
  if (lifecycleState !== 'CURRENT_RETAIL' && decision.authorizingObservation !== null) {
    throw new Error(`non-current retail lifecycle carries an authorizer for ${entry.targetId}`);
  }
  return lifecycleState;
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

    const lifecycleState = effectiveLifecycleState(entry, product);

    if (lifecycleState === 'CURRENT_RETAIL') {
      if (!isCurrentRetailProduct(product)) {
        throw new Error(`current recovery lifecycle drift for ${entry.targetId}`);
      }
      if (entry.acceptanceStatus === 'accepted') {
        if (currentAcceptanceByLegacyId.has(entry.legacyRuntimeId)) {
          throw new Error(`duplicate current recovery product ${entry.legacyRuntimeId}`);
        }
        currentAcceptanceByLegacyId.set(entry.legacyRuntimeId, currentAcceptance(entry, product));
      }
    } else if (lifecycleState === 'CATALOG_ARCHIVED' || lifecycleState === 'UNKNOWN_RETAIL') {
      if (product && isCurrentRetailProduct(product)) {
        throw new Error(`non-current recovery lifecycle drift for ${entry.targetId}`);
      }
    } else if (lifecycleState === 'REGISTRY_ONLY') {
      if (product && product.retailLifecycle?.lifecycleState !== 'REGISTRY_ONLY') {
        throw new Error(`registry-only recovery catalog identity drift for ${entry.targetId}`);
      }
    } else {
      throw new Error(`unsupported recovery publication lifecycle: ${lifecycleState}`);
    }

    historicalRecords.push(Object.freeze({
      targetId: entry.targetId,
      referenceId: entry.referenceId,
      legacyRuntimeId: entry.legacyRuntimeId,
      canonicalProductId: entry.canonicalProductId,
      brand: entry.brand,
      model: entry.model,
      category: entry.category,
      lifecycleState,
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
