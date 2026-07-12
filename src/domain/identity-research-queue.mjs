import { buildReceiptBoundAcceptanceProjection } from './accepted-evidence-publication.mjs';

const DIMENSION_FIELDS = Object.freeze([
  'closedEnvelope.depthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.widthMm',
]);

const FAILURE_LABELS = Object.freeze({
  target_not_visible: 'targetNotVisible',
  suffix_mismatch: 'suffixMismatch',
  series_manual_missing_exact_sku: 'seriesManualMissingExactSku',
  family_only: 'familyOnly',
  filename_cover_conflict: 'filenameCoverConflict',
});

function text(value) {
  return String(value ?? '').trim();
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

export function classifyIdentityFailure(reason) {
  const value = text(reason).toLowerCase();
  if (!value) return null;
  if (value.includes('filename') && value.includes('cover')) return 'filename_cover_conflict';
  if (value.includes('rendered_document_identifies_') && value.includes('_not_')) return 'suffix_mismatch';
  if (value.includes('series_manual') && value.includes('exact_sales_model')) return 'series_manual_missing_exact_sku';
  if (value.includes('famil') && (value.includes('does not print') || value.includes('does not show'))) return 'family_only';
  if (value.includes('exact_sales_model_not_visible')) return 'target_not_visible';
  return null;
}

function observedModels(reason, failureClass) {
  const value = text(reason);
  if (failureClass === 'suffix_mismatch') {
    const match = /identifies_([A-Z0-9-]+)_not_/i.exec(value);
    return match ? [match[1].toUpperCase()] : [];
  }
  if (failureClass === 'filename_cover_conflict') {
    const match = /cover prints\s+([A-Z0-9-]+)/i.exec(value);
    return match ? [match[1].toUpperCase()] : [];
  }
  if (failureClass === 'family_only') {
    const match = /covers\s+([A-Z0-9-]+)(?:\s+and\s+([A-Z0-9-]+))?/i.exec(value);
    return match ? [match[1], match[2]].filter(Boolean).map((model) => model.toUpperCase()) : [];
  }
  return [];
}

function caseRecord({ product, reason, failureClass, sourceDocument = null }) {
  return {
    id: `identity-${text(product.legacyRuntimeId).toLowerCase()}`,
    legacyRuntimeId: text(product.legacyRuntimeId).toLowerCase(),
    canonicalProductId: text(product.canonicalProductId) || null,
    brand: text(product.brand),
    category: text(product.category),
    targetModel: text(product.model),
    observedModels: observedModels(reason, failureClass),
    failureClass,
    reason: text(reason),
    status: 'needs_research',
    requiresHumanReview: false,
    researchAttempts: 0,
    maximumResearchAttempts: 3,
    resolutionRoutes: ['official_exact_model_source', 'tier_a', 'tier_b'],
    allowedApprovalTiers: ['tier_a', 'tier_b'],
    tierBFieldLimit: [...DIMENSION_FIELDS],
    approvedFields: [],
    sourceDocument: sourceDocument ? {
      sourceUrl: text(sourceDocument.sourceUrl),
      contentSha256: text(sourceDocument.sha256),
      transportHostType: text(sourceDocument.transportHostType),
      authorType: text(sourceDocument.authorType),
    } : null,
    publication: {
      release: false,
      terminalWithoutEvidence: 'quarantined',
      transferableFields: [],
    },
    resolution: null,
  };
}

function applyRecoveryOutcomes(cases, batch, results) {
  if (!batch || !results) return cases;
  if (!Array.isArray(batch.entries) || !Array.isArray(results.outcomes)
    || text(batch.batchId) !== text(results.batchId)) {
    throw new TypeError('identity recovery acceptance batch/results required');
  }
  const syntheticProducts = batch.entries.map((entry) => ({
    id: text(entry.legacyRuntimeId).toLowerCase(),
    brand: entry.brand,
    model: entry.model,
    cat: entry.category,
  }));
  const accepted = buildReceiptBoundAcceptanceProjection({
    batch,
    results,
    products: syntheticProducts,
  });
  const entryByLegacy = new Map(batch.entries.map((entry) => [
    text(entry.legacyRuntimeId).toLowerCase(), entry,
  ]));
  const outcomeById = new Map(results.outcomes.map((outcome) => [text(outcome.id), outcome]));
  return cases.map((entry) => {
    const projection = accepted.get(entry.legacyRuntimeId);
    const recoveryEntry = entryByLegacy.get(entry.legacyRuntimeId);
    const outcome = recoveryEntry ? outcomeById.get(text(recoveryEntry.id)) : null;
    if (projection) {
      const approvedFields = DIMENSION_FIELDS.filter(
        (field) => projection.geometry_v2_provenance.fieldEvidence[field],
      );
      if (approvedFields.length !== DIMENSION_FIELDS.length || !outcome?.source?.verificationReceipt) {
        throw new Error(`identity recovery dimensions incomplete: ${entry.legacyRuntimeId}`);
      }
      return {
        ...entry,
        status: 'resolved',
        researchAttempts: 1,
        approvedFields: [...approvedFields],
        publication: {
          release: true,
          terminalWithoutEvidence: 'quarantined',
          transferableFields: [...approvedFields],
        },
        resolution: {
          acceptanceId: text(recoveryEntry.id),
          identityOutcome: projection.identityOutcome,
          sourceModel: projection.sourceModel,
          sourceUrl: projection.sourceUrl,
          receiptBindingSha256: outcome.source.verificationReceipt.bindingSha256,
        },
      };
    }
    if (outcome?.outcome === 'quarantined' && outcome.acquisition === 'passed') {
      return {
        ...entry,
        status: 'quarantined',
        researchAttempts: 1,
        terminalReason: (outcome.failures ?? []).map((failure) => text(failure.reason)).filter(Boolean).join('; ')
          || 'no_releasable_exact_model_evidence',
      };
    }
    return entry;
  });
}

export function buildIdentityResearchQueue(input) {
  const generatedAt = new Date(input?.generatedAt ?? '').toISOString();
  const selectionByLegacy = new Map((input?.phase8Selection?.products ?? [])
    .map((product) => [text(product.legacyRuntimeId).toLowerCase(), product]));
  const bundleByLegacy = new Map((input?.phase8Bundles?.bundles ?? [])
    .map((bundle) => [text(bundle?.product?.legacyRuntimeId).toLowerCase(), bundle]));
  const cases = [];
  for (const review of input?.phase8ReviewInput?.reviews ?? []) {
    const failureClass = classifyIdentityFailure(review.reason);
    if (!failureClass) continue;
    const legacyRuntimeId = text(review.id).toLowerCase();
    const selected = selectionByLegacy.get(legacyRuntimeId);
    const bundle = bundleByLegacy.get(legacyRuntimeId);
    if (!selected || !bundle?.product) throw new Error(`identity research provenance missing: ${legacyRuntimeId}`);
    cases.push(caseRecord({
      product: { ...bundle.product, ...selected, legacyRuntimeId },
      reason: review.reason,
      failureClass,
      sourceDocument: bundle.sourceDocument,
    }));
  }
  for (const outcome of input?.phase10Outcomes ?? []) {
    const failureClass = classifyIdentityFailure(outcome.reason);
    if (!failureClass) continue;
    cases.push(caseRecord({
      product: outcome,
      reason: outcome.reason,
      failureClass,
    }));
  }
  const resolvedCases = applyRecoveryOutcomes(cases, input?.recoveryBatch, input?.recoveryResults);
  resolvedCases.sort((left, right) => left.legacyRuntimeId.localeCompare(right.legacyRuntimeId));
  if (new Set(resolvedCases.map((entry) => entry.legacyRuntimeId)).size !== resolvedCases.length) {
    throw new Error('duplicate identity research product');
  }
  const summary = {
    cases: resolvedCases.length,
    needsResearch: resolvedCases.filter((entry) => entry.status === 'needs_research').length,
    resolved: resolvedCases.filter((entry) => entry.status === 'resolved').length,
    quarantined: resolvedCases.filter((entry) => entry.status === 'quarantined').length,
  };
  for (const [failureClass, label] of Object.entries(FAILURE_LABELS)) {
    summary[label] = resolvedCases.filter((entry) => entry.failureClass === failureClass).length;
  }
  return freezeDeep({
    schemaVersion: 1,
    generatedAt,
    policy: {
      exactSourceMayResolve: true,
      tierARequiresOfficialCrossReference: true,
      tierBRequiresRegulatorFamily: true,
      tierBRequiresOfficialDimensions: true,
      tierBIndependentTargetMarketSources: 2,
      tierBDimensionsOnly: true,
      similarityNeverApproves: true,
    },
    summary,
    cases: resolvedCases,
  });
}
