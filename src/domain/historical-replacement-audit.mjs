import { createHash } from 'node:crypto';

const CATEGORIES = Object.freeze(['fridge', 'dishwasher', 'dryer', 'washing_machine']);
const ENERGY_SOURCE_IDS = Object.freeze(CATEGORIES.map((category) => `energy-rating:${category}`));
const PUBLIC_RECORD_FIELDS = new Set([
  'id', 'brand', 'model', 'lifecycle', 'evidence', 'action', 'registryMarket', 'aliases', 'dimensionsMm',
]);
const RUNTIME_FIT_FIELDS = Object.freeze([
  'fitScore', 'fitScoreNumeric', 'fitDecision', 'requiredCavityMm', 'clearance',
  'clearanceMode', 'manufacturerClearance', 'fitAxisGaps', 'exactFit', 'fitsTightly',
  'bindingAxis', 'tightestGapMm', 'sortScore', 'sizeMatchGaps',
]);

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function issue(issues, code, message, details = {}) {
  issues.push({ code, message, ...details });
}

function sameDimensions(left, right) {
  return ['width', 'height', 'depth'].every((axis) => Number(left?.[axis]) === Number(right?.[axis]));
}

function completeDimensions(value) {
  return ['width', 'height', 'depth'].every((axis) => Number.isFinite(Number(value?.[axis])) && Number(value[axis]) > 0);
}

function compareAliases(left, right) {
  return left.brand.localeCompare(right.brand, 'en-AU', { sensitivity: 'base' })
    || left.model.localeCompare(right.model, 'en-AU', { sensitivity: 'base' });
}

function expectedAliases(record) {
  const seen = new Set();
  const aliases = [];
  for (const variant of record?.rawIdentityVariants ?? []) {
    const brand = String(variant?.brand ?? '').trim();
    const model = String(variant?.model ?? '').trim();
    if (!brand || !model || (brand === record.brand && model === record.model)) continue;
    const key = `${brand}\0${model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    aliases.push({ brand, model });
  }
  return aliases.sort(compareAliases);
}

function publicAliases(row) {
  if (row?.aliases === undefined) return [];
  if (!Array.isArray(row.aliases)) return null;
  const aliases = [];
  for (const alias of row.aliases) {
    if (!alias || typeof alias !== 'object' || Array.isArray(alias)) return null;
    if (Object.keys(alias).some((key) => !['brand', 'model'].includes(key))) return null;
    const brand = String(alias.brand ?? '').trim();
    const model = String(alias.model ?? '').trim();
    if (!brand || !model) return null;
    aliases.push({ brand, model });
  }
  return aliases.sort(compareAliases);
}

function countBy(rows, field) {
  return rows.reduce((counts, row) => {
    const key = String(row?.[field] ?? 'UNKNOWN');
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function auditCanaries(referenceRecords, expectations, issues) {
  const results = [];
  for (const expectation of expectations ?? []) {
    const record = referenceRecords.find((row) => (
      (!expectation.category || row.category === expectation.category)
      && (!expectation.brand || row.brand === expectation.brand)
      && (!expectation.model || row.model === expectation.model)
      && (!expectation.modelKey || row.modelKey === expectation.modelKey)
    ));
    const checks = {
      found: Boolean(record),
      evidenceState: !expectation.evidenceState || record?.evidenceState === expectation.evidenceState,
      lookupAction: !expectation.lookupAction || record?.lookupAction === expectation.lookupAction,
      registryDimensionState: !expectation.registryDimensionState
        || record?.registryDimensionState === expectation.registryDimensionState,
      dimensionsMm: !expectation.dimensionsMm || sameDimensions(record?.dimensionsMm, expectation.dimensionsMm),
    };
    const ok = Object.values(checks).every(Boolean);
    results.push({ id: expectation.id, ok, checks, referenceId: record?.referenceId ?? null });
    if (!ok) issue(issues, 'KNOWN_ANOMALY_CANARY_FAILED', `Known anomaly canary failed: ${expectation.id}`, { canaryId: expectation.id });
  }
  return results;
}

export function auditHistoricalReplacement({
  reference,
  publicationManifest,
  publicDocuments,
  publicBytesByCategory,
  publicMetaBytes,
  publicCatalog,
  currentCatalogBindingSha256,
  sitemapXml,
  replacementEngineSource,
  runtimeReplacementRows,
  canaryExpectations = [],
}) {
  const issues = [];
  const referenceRecords = Array.isArray(reference?.records) ? reference.records : [];
  if (!Array.isArray(reference?.records)) issue(issues, 'REFERENCE_RECORDS_MISSING', 'Historical reference records are missing');
  for (const sourceId of [...ENERGY_SOURCE_IDS, 'fitappliance:catalog']) {
    if (!/^[a-f0-9]{64}$/.test(String(reference?.sourceSnapshotHashes?.[sourceId] ?? ''))) {
      issue(issues, 'REFERENCE_SOURCE_HASH_MISSING', `Missing source hash for ${sourceId}`, { sourceId });
    }
  }
  if (!/^[a-f0-9]{64}$/.test(String(currentCatalogBindingSha256 ?? ''))) {
    issue(issues, 'CURRENT_CATALOG_BINDING_HASH_MISSING', 'Current catalog binding SHA-256 is missing');
  } else if (reference?.sourceSnapshotHashes?.['fitappliance:catalog'] !== currentCatalogBindingSha256) {
    issue(issues, 'HISTORICAL_CATALOG_SNAPSHOT_STALE', 'Historical reference was built from a different semantic catalog binding');
  }

  const referenceById = new Map();
  for (const record of referenceRecords) {
    if (referenceById.has(record.referenceId)) {
      issue(issues, 'DUPLICATE_REFERENCE_ID', `Duplicate reference ID ${record.referenceId}`, { referenceId: record.referenceId });
    }
    referenceById.set(record.referenceId, record);
    if (!CATEGORIES.includes(record.category)) issue(issues, 'REFERENCE_CATEGORY_INVALID', `Invalid category ${record.category}`);
    const acceptsDimensions = ['AUTO_FILL', 'CONFIRM_REQUIRED'].includes(record.lookupAction);
    if (acceptsDimensions !== completeDimensions(record.dimensionsMm)) {
      issue(issues, 'REFERENCE_DIMENSION_ACTION_MISMATCH', `Dimension/action mismatch for ${record.referenceId}`, { referenceId: record.referenceId });
    }
  }
  for (const category of CATEGORIES) {
    if (!referenceRecords.some((record) => record.category === category)) {
      issue(issues, 'REFERENCE_CATEGORY_EMPTY', `Historical reference category is empty: ${category}`, { category });
    }
  }
  if (!referenceRecords.some((record) => record.registryMarketState === 'INACTIVE_AU')) {
    issue(issues, 'HISTORICAL_INACTIVE_RECORDS_MISSING', 'Historical reference contains no inactive Australian records');
  }

  const publicById = new Map();
  let publicRecordCount = 0;
  for (const category of CATEGORIES) {
    const document = publicDocuments?.[category];
    const bytes = publicBytesByCategory?.[category];
    const file = publicationManifest?.files?.[category];
    if (!document || document.category !== category || !Array.isArray(document.records)) {
      issue(issues, 'PUBLIC_CATEGORY_DOCUMENT_INVALID', `Invalid public document for ${category}`, { category });
      continue;
    }
    if (!bytes || hash(bytes) !== file?.contentSha256 || bytes.length !== file?.byteLength) {
      issue(issues, 'PUBLIC_FILE_HASH_MISMATCH', `Public hash or byte length mismatch for ${category}`, { category });
    }
    if (file?.records !== document.records.length) {
      issue(issues, 'PUBLIC_FILE_COUNT_MISMATCH', `Public manifest count mismatch for ${category}`, { category });
    }
    publicRecordCount += document.records.length;
    for (const row of document.records) {
      for (const key of Object.keys(row)) {
        if (!PUBLIC_RECORD_FIELDS.has(key)) {
          issue(issues, 'PUBLIC_FORBIDDEN_FIELD', `Forbidden public record field ${key}`, { category, referenceId: row.id, field: key });
        }
      }
      if (publicById.has(row.id)) issue(issues, 'DUPLICATE_PUBLIC_REFERENCE_ID', `Duplicate public reference ID ${row.id}`, { referenceId: row.id });
      publicById.set(row.id, { ...row, category });
      if (['QUARANTINED', 'MEASURE_REQUIRED'].includes(row.action) && Object.hasOwn(row, 'dimensionsMm')) {
        issue(issues, 'PUBLIC_CONFLICT_DIMENSIONS', `Non-accepted dimensions exposed for ${row.id}`, { referenceId: row.id });
      }
      if (['AUTO_FILL', 'CONFIRM_REQUIRED'].includes(row.action) && !completeDimensions(row.dimensionsMm)) {
        issue(issues, 'PUBLIC_ACCEPTED_DIMENSIONS_MISSING', `Accepted dimensions missing for ${row.id}`, { referenceId: row.id });
      }
    }
  }

  for (const record of referenceRecords) {
    const row = publicById.get(record.referenceId);
    if (!row) {
      issue(issues, 'REFERENCE_NOT_PUBLISHED', `Reference record not found in public projection: ${record.referenceId}`, { referenceId: record.referenceId });
      continue;
    }
    const scalarFields = [
      ['category', 'category'], ['brand', 'brand'], ['model', 'model'],
      ['lifecycleState', 'lifecycle'], ['evidenceState', 'evidence'],
      ['lookupAction', 'action'], ['registryMarketState', 'registryMarket'],
    ];
    for (const [internalField, publicField] of scalarFields) {
      if (record[internalField] !== row[publicField]) {
        issue(issues, 'PUBLIC_REFERENCE_STATE_MISMATCH', `${publicField} mismatch for ${record.referenceId}`, {
          referenceId: record.referenceId,
          field: publicField,
        });
      }
    }
    if (['AUTO_FILL', 'CONFIRM_REQUIRED'].includes(record.lookupAction)
      && !sameDimensions(record.dimensionsMm, row.dimensionsMm)) {
      issue(issues, 'PUBLIC_REFERENCE_DIMENSION_MISMATCH', `Dimension mismatch for ${record.referenceId}`, { referenceId: record.referenceId });
    }
    if (JSON.stringify(expectedAliases(record)) !== JSON.stringify(publicAliases(row))) {
      issue(issues, 'PUBLIC_REFERENCE_ALIAS_MISMATCH', `Alias mismatch for ${record.referenceId}`, { referenceId: record.referenceId });
    }
  }
  for (const referenceId of publicById.keys()) {
    if (!referenceById.has(referenceId)) issue(issues, 'PUBLIC_REFERENCE_UNKNOWN', `Unknown public reference ${referenceId}`, { referenceId });
  }

  if (!publicMetaBytes
    || hash(publicMetaBytes) !== publicationManifest?.meta?.contentSha256
    || publicMetaBytes.length !== publicationManifest?.meta?.byteLength) {
    issue(issues, 'PUBLIC_META_HASH_MISMATCH', 'Public meta hash or byte length mismatch');
  }
  if ((publicCatalog?.products ?? []).some((product) => String(product?.id ?? '').startsWith('fa_ref_'))) {
    issue(issues, 'HISTORICAL_ID_IN_CURRENT_CATALOG', 'Historical reference ID leaked into current public catalog');
  }
  if (/fa_ref_|replacement-reference/i.test(String(sitemapXml ?? ''))) {
    issue(issues, 'HISTORICAL_ID_IN_SITEMAP', 'Historical reference data leaked into sitemap');
  }
  if (typeof replacementEngineSource !== 'string' || replacementEngineSource.trim() === '') {
    issue(issues, 'REPLACEMENT_ENGINE_SOURCE_MISSING', 'Replacement engine source is missing');
  } else if (/\b(?:FitEngine|evaluateFit|fitDecision|fitScore|requiredCavity|clearance|cavity)\b/i.test(replacementEngineSource)) {
    issue(issues, 'REPLACEMENT_ENGINE_FIT_DEPENDENCY', 'Replacement engine contains a Fit or cavity dependency');
  }

  const runtimeRows = Array.isArray(runtimeReplacementRows) ? runtimeReplacementRows : [];
  if (runtimeRows.length === 0) issue(issues, 'REPLACEMENT_RUNTIME_CANARY_MISSING', 'Replacement runtime canary produced no rows');
  for (const row of runtimeRows) {
    if (row?.searchMode !== 'replacement' || !row?.replacementMatch) {
      issue(issues, 'REPLACEMENT_RUNTIME_CONTRACT_MISSING', `Replacement runtime contract missing for ${row?.id ?? 'unknown'}`);
    }
    for (const field of RUNTIME_FIT_FIELDS) {
      if (Object.hasOwn(row ?? {}, field)) {
        issue(issues, 'REPLACEMENT_FIT_FIELD_LEAK', `Replacement runtime leaked ${field}`, { productId: row?.id, field });
      }
    }
  }

  const canaries = auditCanaries(referenceRecords, canaryExpectations, issues);
  const summary = {
    referenceRecords: referenceRecords.length,
    publicRecords: publicRecordCount,
    currentCatalogProducts: Array.isArray(publicCatalog?.products) ? publicCatalog.products.length : 0,
    quarantinedRecords: referenceRecords.filter((record) => record.lookupAction === 'QUARANTINED').length,
    inactiveAustralianRecords: referenceRecords.filter((record) => record.registryMarketState === 'INACTIVE_AU').length,
    byCategory: countBy(referenceRecords, 'category'),
    byLifecycle: countBy(referenceRecords, 'lifecycleState'),
    byEvidence: countBy(referenceRecords, 'evidenceState'),
    byLookupAction: countBy(referenceRecords, 'lookupAction'),
    issueCount: issues.length,
  };
  return Object.freeze({
    schemaVersion: 1,
    generatedAt: reference?.generatedAt ?? null,
    ok: issues.length === 0,
    summary,
    canaries,
    issues,
  });
}

export function assertHistoricalReplacementAudit(audit) {
  if (!audit?.ok) {
    const codes = [...new Set((audit?.issues ?? []).map((row) => row.code))].join(', ');
    throw new Error(`historical replacement audit failed: ${codes || 'unknown failure'}`);
  }
  return audit;
}
