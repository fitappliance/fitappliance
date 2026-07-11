import { createCategoryGeometry } from './category-geometry.mjs';
import { isSourceFresh, verifyVerificationReceipt } from './evidence-source-verifier.mjs';
import { containsExactModel, validateClaimsSemantics } from './evidence-claim-semantics.mjs';

const SUPPORTED_FIELDS = new Set([
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
  'installation.leftMm',
  'installation.rightMm',
  'installation.topMm',
  'installation.rearMm',
  'installation.frontMm',
  'operation.doorOpenDepthMm',
  'operation.hingeSideSpaceMm',
  'operation.lidOpenHeightMm',
  'service.plumbingRearMm',
  'service.rearServicesMm',
  'service.rearVentilationMm',
  'flags.requiresPlumbing',
]);

const REQUIRED_RELEASE_FIELDS = Object.freeze([
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
]);

const RESEARCH_LABELS = Object.freeze({
  'flags.requiresPlumbing': ['plumbed water supply required', 'water connection', 'ice and water installation'],
  'installation.leftMm': ['left side clearance', 'side air space', 'minimum side gap'],
  'installation.rightMm': ['right side clearance', 'side air space', 'minimum side gap'],
  'installation.topMm': ['air space above cabinet', 'top clearance', 'overhead ventilation gap'],
  'installation.rearMm': ['rear clearance', 'air space behind cabinet', 'back ventilation gap'],
  'operation.doorOpenDepthMm': ['depth door open 90 degree', 'door open depth', 'overall depth with door open'],
});

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

function requiredText(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

export function validateResolutionObjectPath(value, contentSha256) {
  const objectPath = requiredText(value, 'resolution object path');
  if (objectPath.startsWith('/') || objectPath.split('/').includes('..')) {
    throw new TypeError('resolution object path must be relative');
  }
  const hash = requiredText(contentSha256, 'content SHA-256');
  if (!objectPath.includes(hash)) throw new TypeError('resolution object path must contain content hash');
  const expectedPrefix = `evidence/web/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/`;
  if (!objectPath.startsWith(expectedPrefix)) throw new TypeError('resolution object path must use SHA-256 shards');
  return objectPath;
}

function normalizedSourceText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function verifyResolutionSourceText(source, extractedText) {
  const text = normalizedSourceText(extractedText);
  const model = requiredText(source?.identity?.model, 'source identity model');
  if (!containsExactModel(text, model)) {
    throw new Error(`resolution source missing exact model ${model}`);
  }
  for (const claim of source.claims ?? []) {
    const quote = normalizedSourceText(requiredText(claim.quote, 'claim quote'));
    if (!text.toLowerCase().includes(quote.toLowerCase())) {
      throw new Error(`resolution source missing claim quote for ${claim.field}`);
    }
  }
  return true;
}

function validateCase(input) {
  const attempt = Number(input?.attempt);
  const maxAttempts = Number(input?.maxAttempts);
  if (!Number.isInteger(attempt) || attempt < 1) throw new TypeError('positive attempt required');
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || attempt > maxAttempts) {
    throw new TypeError('valid maxAttempts required');
  }
  return {
    ...input,
    id: requiredText(input.id, 'resolution case id'),
    legacyRuntimeId: requiredText(input.legacyRuntimeId, 'legacy runtime ID'),
    brand: requiredText(input.brand, 'brand'),
    model: requiredText(input.model, 'model'),
    category: requiredText(input.category, 'category'),
    releasableQuarantineReasons: [...new Set((input.releasableQuarantineReasons ?? [])
      .map((reason) => requiredText(reason, 'releasable quarantine reason').toLowerCase()))].sort(),
    initialFailure: {
      ...input.initialFailure,
      code: requiredText(input?.initialFailure?.code, 'initial failure code'),
      conflictingFields: [...new Set(input?.initialFailure?.conflictingFields ?? [])].sort(),
    },
    attempt,
    maxAttempts,
    sources: Array.isArray(input.sources) ? input.sources : [],
  };
}

function researchFields(caseRecord) {
  const fields = new Set(caseRecord.initialFailure.conflictingFields);
  for (const field of REQUIRED_RELEASE_FIELDS) fields.add(field);
  return [...fields].sort();
}

export function resolutionFieldsForCase(input) {
  return freezeDeep(researchFields(validateCase(input)));
}

export function buildResolutionPlan(input) {
  const caseRecord = validateCase(input);
  const hypotheses = caseRecord.initialFailure.code === 'approved_scope_conflicts_with_legacy_projection'
    ? [
      'legacy_field_is_stale',
      'approved_scope_is_narrower_than_public_projection',
      'exact_model_source_can_resolve_conflict',
    ]
    : ['source_identity_or_field_scope_is_incomplete', 'exact_model_source_can_resolve_conflict'];
  const researchTasks = researchFields(caseRecord).map((field) => {
    const labels = RESEARCH_LABELS[field] ?? [field.replace(/[A-Z]/g, (char) => ` ${char.toLowerCase()}`)];
    return {
      field,
      authorityOrder: ['manufacturer_product_page', 'manufacturer_manual', 'regulator', 'independent_market'],
      query: `${caseRecord.brand} ${caseRecord.model} ${labels.join(' OR ')}`,
      exactModelRequired: true,
    };
  });
  return freezeDeep({
    caseId: caseRecord.id,
    status: caseRecord.sources.length > 0 ? 'evidence_collected' : 'research_required',
    hypotheses,
    researchTasks,
    attempt: caseRecord.attempt,
    maxAttempts: caseRecord.maxAttempts,
    requiresHumanReview: false,
  });
}

function normalizeSource(source, caseRecord, options = {}) {
  if (source?.authority !== 'manufacturer') return null;
  verifyVerificationReceipt(source, {
    brand: caseRecord.brand,
    model: caseRecord.model,
    category: caseRecord.category,
  }, { asOf: source?.verificationReceipt?.verifiedAt });
  if (options.asOf && !isSourceFresh(source, options.asOf)) return null;
  validateClaimsSemantics(source.claims, { category: caseRecord.category });
  const url = new URL(requiredText(source.sourceUrl, 'source URL'));
  if (url.protocol !== 'https:') throw new TypeError('source URL must use HTTPS');
  if (!/^\d{4}-\d{2}-\d{2}T/.test(requiredText(source.retrievedAt, 'retrievedAt'))) {
    throw new TypeError('retrievedAt must be ISO-8601');
  }
  if (!/^[a-f0-9]{64}$/.test(requiredText(source.contentSha256, 'content SHA-256'))) {
    throw new TypeError('content SHA-256 invalid');
  }
  if (source?.identity?.outcome !== 'exact'
    || requiredText(source?.identity?.brand, 'source identity brand').toLowerCase() !== caseRecord.brand.toLowerCase()
    || requiredText(source?.identity?.model, 'source identity model').toUpperCase() !== caseRecord.model.toUpperCase()) {
    return null;
  }
  const claims = (source.claims ?? []).map((claim) => {
    const field = requiredText(claim.field, 'claim field');
    if (!SUPPORTED_FIELDS.has(field)) throw new TypeError(`unsupported resolution field ${field}`);
    const expectedUnit = field === 'flags.requiresPlumbing' ? 'boolean' : 'mm';
    if (claim.unit !== expectedUnit) throw new TypeError(`invalid unit for ${field}`);
    if (expectedUnit === 'mm' && (!Number.isInteger(claim.value) || claim.value < 0 || claim.value > 5000)) {
      throw new TypeError(`invalid millimetre value for ${field}`);
    }
    if (expectedUnit === 'boolean' && typeof claim.value !== 'boolean') throw new TypeError(`invalid boolean for ${field}`);
    return {
      field,
      value: claim.value,
      unit: claim.unit,
      label: requiredText(claim.label, 'claim label'),
      quote: requiredText(claim.quote, 'claim quote'),
      sourceUrl: url.toString(),
      contentSha256: source.contentSha256,
      objectPath: validateResolutionObjectPath(source.objectPath, source.contentSha256),
      retrievedAt: source.retrievedAt,
      sourceType: requiredText(source.sourceType ?? (
        url.pathname.toLowerCase().endsWith('.pdf')
          ? 'official_exact_model_pdf'
          : 'official_exact_model_product_page'
      ), 'source type'),
    };
  });
  return { source, claims };
}

function groupClaims(caseRecord, options = {}) {
  const entries = caseRecord.sources.map((source) => normalizeSource(source, caseRecord, options)).filter(Boolean);
  const byHash = new Map(entries.map((entry) => [entry.source.contentSha256, entry]));
  const superseded = new Set();
  for (const entry of entries) {
    for (const hash of entry.source.supersedesContentSha256 ?? []) {
      const previous = byHash.get(hash);
      if (!previous) throw new TypeError(`superseded source ${hash} missing from case`);
      const currentUrl = new URL(entry.source.finalUrl);
      const previousUrl = new URL(previous.source.finalUrl);
      currentUrl.search = ''; currentUrl.hash = ''; currentUrl.pathname = currentUrl.pathname.replace(/\/+$/, '');
      previousUrl.search = ''; previousUrl.hash = ''; previousUrl.pathname = previousUrl.pathname.replace(/\/+$/, '');
      if (currentUrl.toString() !== previousUrl.toString()) throw new TypeError('supersession requires the same official resource');
      if (Date.parse(entry.source.retrievedAt) <= Date.parse(previous.source.retrievedAt)) {
        throw new TypeError('superseding source must be newer');
      }
      superseded.add(hash);
    }
  }
  const byField = new Map();
  for (const entry of entries) {
    if (superseded.has(entry.source.contentSha256)) continue;
    for (const claim of entry.claims) {
      if (!byField.has(claim.field)) byField.set(claim.field, []);
      byField.get(claim.field).push(claim);
    }
  }
  return { byField, supersededSourceHashes: [...superseded].sort() };
}

export function adjudicateResolutionCase(input, options = {}) {
  const caseRecord = validateCase(input);
  const { byField, supersededSourceHashes } = groupClaims(caseRecord, options);
  const values = {};
  const provenance = {};
  const contradictions = [];
  for (const [field, claims] of [...byField.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const uniqueValues = [...new Set(claims.map((claim) => JSON.stringify(claim.value)))];
    if (uniqueValues.length > 1) {
      contradictions.push({ field, values: uniqueValues.map((value) => JSON.parse(value)), sources: claims.map((claim) => claim.sourceUrl) });
      continue;
    }
    values[field] = claims[0].value;
    provenance[field] = claims.map((claim) => ({
      sourceUrl: claim.sourceUrl,
      contentSha256: claim.contentSha256,
      objectPath: claim.objectPath,
      retrievedAt: claim.retrievedAt,
      sourceType: claim.sourceType,
      label: claim.label,
      quote: claim.quote,
    }));
  }
  const approvedFields = Object.keys(values).sort();
  const missingReleaseFields = researchFields(caseRecord).filter((field) => !(field in values));
  if (contradictions.length > 0) {
    const exhausted = caseRecord.attempt >= caseRecord.maxAttempts;
    return freezeDeep({
      caseId: caseRecord.id, status: exhausted ? 'quarantined' : 'reconciliation_required',
      terminalReason: exhausted ? 'authoritative_evidence_conflict' : null,
      approvedFields, values, provenance, contradictions, supersededSourceHashes,
      publication: { release: false, stripUnapprovedLegacyFields: true }, requiresHumanReview: false,
    });
  }
  if (missingReleaseFields.length > 0) {
    const exhausted = caseRecord.attempt >= caseRecord.maxAttempts;
    return freezeDeep({
      caseId: caseRecord.id, status: exhausted ? 'quarantined' : 'research_required',
      terminalReason: exhausted ? 'evidence_search_exhausted' : null,
      approvedFields, values, provenance, contradictions: [], missingReleaseFields, supersededSourceHashes,
      publication: { release: false, stripUnapprovedLegacyFields: true }, requiresHumanReview: false,
    });
  }
  return freezeDeep({
    caseId: caseRecord.id, status: 'resolved', terminalReason: null,
    approvedFields, values, provenance, contradictions: [], missingReleaseFields: [], supersededSourceHashes,
    publication: { release: true, stripUnapprovedLegacyFields: true }, requiresHumanReview: false,
  });
}

export function buildResolutionManifest(input, options = {}) {
  if (input?.schemaVersion !== 1 || !Array.isArray(input.cases)) {
    throw new TypeError('resolution input schemaVersion 1 with cases required');
  }
  const caseIds = new Set();
  const legacyIds = new Set();
  const results = input.cases.map((caseInput) => {
    const caseRecord = validateCase(caseInput);
    if (caseIds.has(caseRecord.id)) throw new TypeError(`duplicate resolution case ${caseRecord.id}`);
    if (legacyIds.has(caseRecord.legacyRuntimeId)) throw new TypeError(`duplicate resolution product ${caseRecord.legacyRuntimeId}`);
    caseIds.add(caseRecord.id);
    legacyIds.add(caseRecord.legacyRuntimeId);
    return {
      legacyRuntimeId: caseRecord.legacyRuntimeId,
      brand: caseRecord.brand,
      model: caseRecord.model,
      plan: buildResolutionPlan(caseRecord),
      decision: adjudicateResolutionCase(caseRecord, options),
    };
  }).sort((left, right) => left.legacyRuntimeId.localeCompare(right.legacyRuntimeId));
  const releasedLegacyIds = results
    .filter((row) => row.decision.status === 'resolved' && row.decision.publication.release)
    .map((row) => row.legacyRuntimeId);
  const releaseGrants = results
    .filter((row) => row.decision.status === 'resolved' && row.decision.publication.release)
    .map((row) => {
      const caseRecord = validateCase(input.cases.find((candidate) => candidate.id === row.decision.caseId));
      return {
        legacyRuntimeId: row.legacyRuntimeId,
        caseId: row.decision.caseId,
        reasons: caseRecord.releasableQuarantineReasons,
      };
    });
  const activeQuarantines = results
    .filter((row) => row.decision.status !== 'resolved' || row.decision.publication.release !== true)
    .map((row) => ({
      legacyRuntimeId: row.legacyRuntimeId,
      reason: `evidence_resolution_${row.decision.status}`,
      caseId: row.decision.caseId,
    }));
  const count = (status) => results.filter((row) => row.decision.status === status).length;
  return freezeDeep({
    schemaVersion: 1,
    results,
    releasedLegacyIds,
    releaseGrants,
    activeQuarantines,
    summary: {
      cases: results.length,
      resolved: count('resolved'),
      researchRequired: count('research_required'),
      reconciliationRequired: count('reconciliation_required'),
      quarantined: count('quarantined'),
      requiresHumanReview: results.filter((row) => row.decision.requiresHumanReview).length,
    },
  });
}

export function buildResolutionFieldEvidence(manifest) {
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.results)) {
    throw new TypeError('resolution manifest required');
  }
  return freezeDeep(manifest.results
    .filter((row) => row?.decision?.status === 'resolved')
    .flatMap((row) => Object.entries(row.decision.values)
      .filter(([field, value]) => !field.startsWith('flags.') && Number.isInteger(value))
      .map(([field, value]) => ({
        legacyRuntimeId: row.legacyRuntimeId,
        field,
        value,
        unit: 'mm',
        status: 'approved',
        sourceDocumentId: `resolution:${row.decision.caseId}`,
      })))
    .sort((left, right) => (
      left.legacyRuntimeId.localeCompare(right.legacyRuntimeId) || left.field.localeCompare(right.field)
    )));
}

function value(values, field) {
  return Object.hasOwn(values, field) ? values[field] : null;
}

export function applyResolutionToProduct(input, resolution) {
  if (resolution?.status !== 'resolved' || resolution?.publication?.release !== true) {
    throw new TypeError('resolved publication decision required');
  }
  const product = structuredClone(input);
  delete product.door_swing_mm;
  const dimensions = {};
  const dimensionMap = {
    'closedEnvelope.widthMm': 'width_mm',
    'closedEnvelope.heightMm': 'height_mm',
    'closedEnvelope.depthMm': 'depth_mm',
    'operation.doorOpenDepthMm': 'door_open_90_depth_mm',
  };
  for (const [field, key] of Object.entries(dimensionMap)) {
    if (Object.hasOwn(resolution.values, field)) dimensions[key] = resolution.values[field];
  }
  const clearances = {};
  const clearanceMap = {
    'installation.leftMm': 'left_mm',
    'installation.rightMm': 'right_mm',
    'installation.topMm': 'top_mm',
    'installation.rearMm': 'rear_mm',
    'installation.frontMm': 'front_mm',
  };
  for (const [field, key] of Object.entries(clearanceMap)) {
    if (Object.hasOwn(resolution.values, field)) clearances[key] = resolution.values[field];
  }
  const flags = {};
  if (Object.hasOwn(resolution.values, 'flags.requiresPlumbing')) {
    flags.requires_plumbing = resolution.values['flags.requiresPlumbing'];
  }
  product.w = resolution.values['closedEnvelope.widthMm'];
  product.h = resolution.values['closedEnvelope.heightMm'];
  product.d = resolution.values['closedEnvelope.depthMm'];
  product.dimensions = dimensions;
  product.clearance_requirements = clearances;
  product.flags = flags;
  product.geometry_v2 = createCategoryGeometry(product.cat, {
    closedEnvelope: {
      widthMm: value(resolution.values, 'closedEnvelope.widthMm'),
      heightMm: value(resolution.values, 'closedEnvelope.heightMm'),
      depthMm: value(resolution.values, 'closedEnvelope.depthMm'),
    },
    installation: {
      leftMm: value(resolution.values, 'installation.leftMm'),
      rightMm: value(resolution.values, 'installation.rightMm'),
      topMm: value(resolution.values, 'installation.topMm'),
      rearMm: value(resolution.values, 'installation.rearMm'),
      frontMm: value(resolution.values, 'installation.frontMm'),
    },
    operation: {
      doorOpenDepthMm: value(resolution.values, 'operation.doorOpenDepthMm'),
      hingeSideSpaceMm: value(resolution.values, 'operation.hingeSideSpaceMm'),
      lidOpenHeightMm: value(resolution.values, 'operation.lidOpenHeightMm'),
    },
    service: {
      plumbingRearMm: value(resolution.values, 'service.plumbingRearMm'),
      rearServicesMm: value(resolution.values, 'service.rearServicesMm'),
      rearVentilationMm: value(resolution.values, 'service.rearVentilationMm'),
    },
    delivery: {},
  });
  product.data_source = 'official_manufacturer_exact_model';
  const primarySource = Object.values(resolution.provenance).flat()[0];
  const {
    source_url: _legacySourceUrl,
    verified_at: _legacyVerifiedAt,
    source_type: _legacySourceType,
    confidence_score: _legacyConfidence,
    ...retainedEvidence
  } = product.evidence ?? {};
  product.evidence = {
    ...retainedEvidence,
    has_pdf_evidence: product.evidence?.has_pdf_evidence === true,
    has_official_evidence: true,
    source_url: primarySource.sourceUrl,
    verified_at: primarySource.retrievedAt.slice(0, 10),
    source_type: primarySource.sourceType === 'official_exact_model_product_page'
      ? 'official_manufacturer_html'
      : primarySource.sourceType,
    trust_level: 'dimensions_verified',
    verified_fields: ['dimensions'],
    clearance_verified: false,
    v2_resolution: {
      case_id: resolution.caseId,
      status: resolution.status,
      approved_fields: resolution.approvedFields,
      provenance: resolution.provenance,
      unapproved_legacy_fields_removed: true,
    },
  };
  return freezeDeep(product);
}
