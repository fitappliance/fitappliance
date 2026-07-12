const RESEARCH_FIELDS = Object.freeze({
  fridge: Object.freeze([
    'closedEnvelope.widthMm',
    'closedEnvelope.heightMm',
    'closedEnvelope.depthMm',
    'installationClearance.leftMm',
    'installationClearance.rightMm',
    'installationClearance.topMm',
    'installationClearance.rearMm',
    'ventilation.rearMm',
    'waterConnection.required',
    'waterConnection.hoseReachMm',
    'waterConnection.minimumPressureKpa',
    'waterConnection.maximumPressureKpa',
    'powerConnection.required',
    'powerConnection.leadReachMm',
    'powerConnection.voltageV',
    'powerConnection.currentA',
    'professionalInstallation.required',
    'deliveryEnvelope.widthMm',
    'deliveryEnvelope.heightMm',
    'deliveryEnvelope.depthMm',
  ]),
  dishwasher: Object.freeze([
    'closedEnvelope.widthMm',
    'closedEnvelope.heightMm',
    'closedEnvelope.depthMm',
    'installationClearance.leftMm',
    'installationClearance.rightMm',
    'installationClearance.topMm',
    'installationClearance.rearMm',
    'operationEnvelope.doorOpenDepthMm',
    'ventilation.rearMm',
    'waterConnection.required',
    'waterConnection.hoseReachMm',
    'waterConnection.minimumPressureKpa',
    'waterConnection.maximumPressureKpa',
    'powerConnection.required',
    'powerConnection.leadReachMm',
    'powerConnection.voltageV',
    'powerConnection.currentA',
    'drainConnection.required',
    'drainConnection.hoseReachMm',
    'drainConnection.minimumHeightMm',
    'drainConnection.maximumHeightMm',
    'drainConnection.highLoopRequired',
    'professionalInstallation.required',
    'deliveryEnvelope.widthMm',
    'deliveryEnvelope.heightMm',
    'deliveryEnvelope.depthMm',
  ]),
});

function researchFieldsFor(row) {
  const fields = [...(RESEARCH_FIELDS[row.category] ?? [])];
  if (row.category === 'fridge') {
    if (row.formFactor === 'chest') fields.push('operationEnvelope.lidOpenHeightMm');
    else if (row.formFactor === 'upright') fields.push('operationEnvelope.doorOpenDepthMm', 'operationEnvelope.hingeSideSpaceMm');
    else fields.push('formFactor');
  }
  return [...new Set(fields)].sort();
}

const EXISTING_TO_V3 = Object.freeze({
  'closedEnvelope.widthMm': 'closedEnvelope.widthMm',
  'closedEnvelope.heightMm': 'closedEnvelope.heightMm',
  'closedEnvelope.depthMm': 'closedEnvelope.depthMm',
  'installation.leftMm': 'installationClearance.leftMm',
  'installation.rightMm': 'installationClearance.rightMm',
  'installation.topMm': 'installationClearance.topMm',
  'installation.rearMm': 'installationClearance.rearMm',
  'operation.doorOpenDepthMm': 'operationEnvelope.doorOpenDepthMm',
  'operation.hingeSideSpaceMm': 'operationEnvelope.hingeSideSpaceMm',
  'service.rearVentilationMm': 'ventilation.rearMm',
});

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freezeDeep(item);
  }
  return value;
}

function modelKey(value) {
  return String(value ?? '').normalize('NFKC').toUpperCase().replace(/[\s._-]+/g, '');
}

function hasLegacyReceipt(evidence) {
  return /^[a-f0-9]{64}$/.test(evidence?.receiptBindingSha256 ?? '');
}

function hasV3Receipt(evidence, model) {
  return hasLegacyReceipt(evidence)
    && /^[a-f0-9]{64}$/.test(evidence?.artifactSha256 ?? evidence?.contentSha256 ?? '')
    && /^[a-f0-9]{64}$/.test(evidence?.fragmentSha256 ?? '')
    && evidence?.identityOutcome === 'exact'
    && evidence?.sourceStatus === 'current'
    && (evidence?.applicableModels ?? []).map(modelKey).includes(modelKey(model));
}

function nextAction(row, wels) {
  if (row.reconciliationState === 'CATALOG_IDENTITY_AMBIGUOUS') {
    return { strategy: 'canonical_identity_resolution', tier: 0, reason: 'Catalog identity must resolve before field research.' };
  }
  if (row.category === 'dishwasher' && (!wels || wels.state === 'NO_EXACT_WELS_MATCH' || wels.state === 'WELS_IDENTITY_CONFLICT')) {
    return { strategy: 'wels_then_exact_official_document', tier: 1, reason: 'Confirm exact AU registration identity, then acquire the exact official installation asset.' };
  }
  return { strategy: 'exact_official_installation_document', tier: 1, reason: 'Acquire exact-model AU installation, QRG, specification or trade asset and parse through MinerU.' };
}

export function buildInstallationResearchQueue({ pilot, catalogProducts, welsReconciliations = [] }) {
  const productById = new Map(catalogProducts.map((product) => [product.canonicalProductId, product]));
  const welsById = new Map(welsReconciliations.map((row) => [row.canonicalProductId, row]));
  const cases = pilot.products.map((row) => {
    const product = productById.get(row.canonicalProductId);
    const existingFieldEvidence = product?.geometry_v2_provenance?.fieldEvidence ?? {};
    const legacyReceiptBoundFields = new Set(Object.entries(existingFieldEvidence)
      .filter(([, evidence]) => hasLegacyReceipt(evidence))
      .map(([field]) => EXISTING_TO_V3[field])
      .filter(Boolean));
    const acceptedFields = new Set(Object.entries(existingFieldEvidence)
      .filter(([, evidence]) => hasV3Receipt(evidence, row.model))
      .map(([field]) => EXISTING_TO_V3[field])
      .filter(Boolean));
    const required = researchFieldsFor(row);
    const missingFields = required.filter((field) => !acceptedFields.has(field));
    const wels = welsById.get(row.canonicalProductId) ?? null;
    return {
      schemaVersion: 1,
      caseId: `fitv3_${row.canonicalProductId}`,
      canonicalProductId: row.canonicalProductId,
      legacyRuntimeId: row.legacyRuntimeId,
      category: row.category,
      brand: row.brand,
      model: row.model,
      formFactor: row.formFactor ?? null,
      energyReconciliationState: row.reconciliationState,
      energyReasonCodes: row.reasonCodes,
      welsIdentityState: wels?.state ?? (row.category === 'dishwasher' ? 'NOT_EVALUATED' : 'NOT_APPLICABLE'),
      legacyReceiptBoundFields: [...legacyReceiptBoundFields].sort(),
      acceptedV3Fields: [...acceptedFields].sort(),
      missingFields,
      nextAction: nextAction(row, wels),
      sourceOrder: ['exact_au_manufacturer_asset', 'official_support_or_trade_endpoint', 'official_registry_identity', 'licensed_product_master', 'direct_brand_data_request'],
      publicationState: 'shadow_quarantined',
      terminalState: missingFields.length === 0 ? 'ready_for_shadow_fit' : 'needs_research',
    };
  }).sort((left, right) => left.caseId.localeCompare(right.caseId));
  const missingByField = {};
  for (const item of cases) for (const field of item.missingFields) missingByField[field] = (missingByField[field] ?? 0) + 1;
  return freezeDeep({
    schemaVersion: 1,
    sourcePilotFrozen: pilot.frozen === true,
    cases,
    summary: {
      total: cases.length,
      readyForShadowFit: cases.filter((item) => item.terminalState === 'ready_for_shadow_fit').length,
      needsResearch: cases.filter((item) => item.terminalState === 'needs_research').length,
      missingByField: Object.fromEntries(Object.entries(missingByField).sort()),
    },
  });
}

export const INSTALLATION_RESEARCH_FIELDS = RESEARCH_FIELDS;
