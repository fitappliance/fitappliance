import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { createRequire } from 'node:module';

import { initializePrivateOutreachStore } from './outreach-evidence-store.mjs';
import { parseProviderTabularFile } from './provider-tabular-file.mjs';

const require = createRequire(import.meta.url);
const dictionary = require('../../data/architecture-v2/policies/product-data-field-rights-dictionary.json');

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,127}$/;
const REQUIRED_RIGHT_ACTIONS = Object.freeze([
  'cache_source',
  'cache_normalized_fields',
  'public_display',
]);
const FORMAT_EXTENSIONS = Object.freeze({ csv: 'csv', json: 'json', xlsx: 'xlsx' });
const SUPPORTED_CATEGORIES = new Set([
  'fridge',
  'dishwasher',
  'dryer',
  'washing_machine',
  'washtower_combo',
]);
const fieldById = new Map(dictionary.fields.map((field) => [field.id, field]));
const MAX_RIGHTS_EVIDENCE_OBJECTS = 20;
const MAX_RIGHTS_EVIDENCE_BYTES = 5 * 1024 * 1024;
const PERSISTABLE_STATUSES = new Set([
  'QUARANTINED_CANDIDATES',
  'QUARANTINED_WITH_CONFLICTS',
  'CONFLICT_QUARANTINED',
  'IDENTITY_UNPROVEN',
  'NO_CANDIDATE_FIELDS',
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freezeDeep(item);
  }
  return value;
}

function normalizeBytes(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof Uint8Array) return Buffer.from(bytes);
  if (typeof bytes === 'string') return Buffer.from(bytes);
  throw new TypeError('provider response bytes are required');
}

function requiredId(value, label) {
  const normalized = String(value ?? '').trim();
  if (!ID_PATTERN.test(normalized)) throw new TypeError(`${label} must be a stable lowercase id`);
  return normalized;
}

function requiredTimestamp(value, label) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be an ISO timestamp`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new TypeError(`${label} must be an exact ISO timestamp`);
  }
  return value;
}

function exactKey(value) {
  return typeof value === 'string' ? value.trim().toLocaleUpperCase('en-AU') : '';
}

function mappingSources(mapping) {
  if (mapping.minSource || mapping.maxSource) return [mapping.minSource, mapping.maxSource].filter(Boolean);
  return [mapping.source].filter(Boolean);
}

function validateSchemaMapping(schemaMapping, format) {
  if (!schemaMapping || typeof schemaMapping !== 'object') throw new TypeError('provider schema mapping is required');
  if (!Number.isInteger(schemaMapping.headerRow) || schemaMapping.headerRow < 1 || schemaMapping.headerRow > 100) {
    throw new TypeError('provider schema mapping headerRow must be an integer from 1 to 100');
  }
  if (format === 'xlsx' && (typeof schemaMapping.sheetName !== 'string' || !schemaMapping.sheetName.trim())) {
    throw new TypeError('provider XLSX schema mapping sheetName is required');
  }
  if (!Array.isArray(schemaMapping.columns) || schemaMapping.columns.length < 4) {
    throw new TypeError('provider schema mapping needs identity, market, and field columns');
  }

  const sourceNames = [];
  const fieldIds = [];
  let brandMappings = 0;
  let modelMappings = 0;
  let categoryMappings = 0;
  let marketMappings = 0;
  for (const mapping of schemaMapping.columns) {
    if (!mapping || typeof mapping !== 'object') throw new TypeError('provider column mapping must be an object');
    if (mapping.role === 'market') {
      marketMappings += 1;
      if (mapping.fieldId !== 'identity.market' || !fieldById.has(mapping.fieldId)) {
        throw new TypeError('provider market mapping must use the identity.market field');
      }
      fieldIds.push(mapping.fieldId);
      if (typeof mapping.source !== 'string' || !mapping.source.trim()) {
        throw new TypeError('provider market mapping needs a source column');
      }
      if (!Array.isArray(mapping.acceptedValues) || mapping.acceptedValues.length === 0) {
        throw new TypeError('provider market mapping needs acceptedValues');
      }
      sourceNames.push(mapping.source);
      continue;
    }
    const field = fieldById.get(mapping.fieldId);
    if (!field) throw new TypeError(`unknown provider field mapping: ${mapping.fieldId}`);
    fieldIds.push(field.id);
    if (field.id === 'identity.category') {
      categoryMappings += 1;
      if (!mapping.valueMap || typeof mapping.valueMap !== 'object' || Array.isArray(mapping.valueMap)) {
        throw new TypeError('provider category mapping needs an explicit valueMap');
      }
      const categories = Object.values(mapping.valueMap);
      if (categories.length === 0 || categories.some((category) => !SUPPORTED_CATEGORIES.has(category))) {
        throw new TypeError('provider category valueMap contains an unsupported category');
      }
    }
    if (field.id === 'identity.brand') brandMappings += 1;
    if (field.id === 'identity.model') modelMappings += 1;

    const sources = mappingSources(mapping);
    if (field.valueShape === 'range') {
      if (sources.length !== 2 || !mapping.minSource || !mapping.maxSource || mapping.source) {
        throw new TypeError(`${field.id} range mapping needs distinct minSource and maxSource columns`);
      }
    } else if (sources.length !== 1 || typeof mapping.source !== 'string' || !mapping.source.trim()) {
      throw new TypeError(`${field.id} mapping needs one source column`);
    }
    sourceNames.push(...sources);

    if (field.axis && mapping.axis !== field.axis) throw new TypeError(`${field.id} axis does not match the dictionary`);
    if (field.unit && mapping.unit !== field.unit) throw new TypeError(`${field.id} unit does not match the dictionary`);
    if (!field.id.startsWith('identity.') && mapping.sourceScope !== field.scope) {
      throw new TypeError(`${field.id} scope does not match the dictionary`);
    }
  }
  if (categoryMappings !== 1) throw new TypeError('provider schema mapping needs exactly one category mapping');
  if (brandMappings !== 1) throw new TypeError('provider schema mapping needs exactly one brand mapping');
  if (modelMappings !== 1) throw new TypeError('provider schema mapping needs exactly one model mapping');
  if (marketMappings !== 1) throw new TypeError('provider schema mapping needs exactly one market mapping');
  if (new Set(sourceNames).size !== sourceNames.length) throw new TypeError('provider source columns must be mapped once');
  if (new Set(fieldIds).size !== fieldIds.length) throw new TypeError('provider canonical fields must be mapped once');
  return freezeDeep({
    sheetName: format === 'xlsx' ? schemaMapping.sheetName.trim() : null,
    headerRow: schemaMapping.headerRow,
    columns: schemaMapping.columns.map((mapping) => ({ ...mapping })),
  });
}

function validateHeaders(headers, schemaMapping) {
  const available = new Set(headers);
  const missing = schemaMapping.columns
    .flatMap(mappingSources)
    .filter((source) => !available.has(source));
  if (missing.length > 0) throw new TypeError(`provider file is missing mapped headers: ${missing.join(', ')}`);
}

function normalizeRightsEvidence(evidence) {
  if (!Array.isArray(evidence) || evidence.length > MAX_RIGHTS_EVIDENCE_OBJECTS) {
    throw new TypeError(`rightsEvidence must contain at most ${MAX_RIGHTS_EVIDENCE_OBJECTS} objects`);
  }
  const objects = new Map();
  for (const [index, item] of evidence.entries()) {
    const bytes = normalizeBytes(item?.bytes);
    if (bytes.length === 0 || bytes.length > MAX_RIGHTS_EVIDENCE_BYTES) {
      throw new TypeError(`rights evidence object ${index + 1} exceeds its size limit`);
    }
    const hash = sha256(bytes);
    if (item?.contentSha256 !== hash) {
      throw new TypeError(`rights evidence object ${index + 1} hash mismatch`);
    }
    if (objects.has(hash)) throw new TypeError(`duplicate rights evidence object: ${hash}`);
    objects.set(hash, bytes);
  }
  return objects;
}

function evaluateRights(rights, providerId, sourceId, mappedFieldIds, rightsEvidence) {
  const decisions = Array.isArray(rights?.decisions) ? rights.decisions : [];
  const diagnostics = [];
  const actionState = new Map();
  for (const fieldId of mappedFieldIds) {
    for (const actionId of REQUIRED_RIGHT_ACTIONS) {
      const matches = decisions.filter((decision) => (
        decision?.providerId === providerId
        && decision?.sourceId === sourceId
        && decision?.fieldId === fieldId
        && decision?.actionId === actionId
      ));
      const only = matches.length === 1 ? matches[0] : null;
      const hashValid = HASH_PATTERN.test(only?.evidenceSha256 ?? '');
      const evidenceAvailable = hashValid && rightsEvidence.has(only.evidenceSha256);
      const evidenceValid = hashValid && evidenceAvailable;
      const granted = only?.decision === 'granted' && evidenceValid;
      const decision = matches.length === 0
        ? 'unknown'
        : matches.length > 1
          ? 'conflicting'
          : !hashValid
            ? 'invalid_evidence'
            : !evidenceAvailable
              ? 'missing_evidence_object'
              : evidenceValid
            ? only.decision
            : 'invalid_evidence';
      actionState.set(`${fieldId}\0${actionId}`, granted);
      if (!granted) diagnostics.push(freezeDeep({ fieldId, actionId, decision, outcome: 'BLOCKED' }));
    }
  }
  const allGranted = (actionId) => mappedFieldIds.every((fieldId) => actionState.get(`${fieldId}\0${actionId}`));
  return freezeDeep({
    cacheSourceAuthorized: allGranted('cache_source'),
    cacheNormalizedFieldsAuthorized: allGranted('cache_normalized_fields'),
    publicDisplayAuthorized: allGranted('public_display'),
    diagnostics,
  });
}

function exactIdentity(record, categoryMapping, brandMapping, modelMapping, marketMapping, knownModels) {
  const inputCategory = record[categoryMapping.source];
  const inputBrand = record[brandMapping.source];
  const inputModel = record[modelMapping.source];
  const inputMarket = record[marketMapping.source];
  const codes = [];
  const outputCategory = typeof inputCategory === 'string'
    ? categoryMapping.valueMap[inputCategory.trim()] ?? null
    : null;
  if (!outputCategory) codes.push('CATEGORY_UNSUPPORTED_OR_UNMAPPED');
  if (typeof inputBrand !== 'string' || !inputBrand.trim()) codes.push('BRAND_MISSING_OR_NON_STRING');
  if (typeof inputModel !== 'string' || !inputModel.trim()) codes.push('MODEL_MISSING_OR_NON_STRING');
  const acceptedMarkets = new Set(marketMapping.acceptedValues.map(exactKey));
  if (typeof inputMarket !== 'string' || !acceptedMarkets.has(exactKey(inputMarket))) {
    codes.push('AU_MARKET_NOT_PROVEN');
  }
  const matches = codes.length === 0
    ? knownModels.filter((known) => (
      known?.category === outputCategory
      && exactKey(known?.brand) === exactKey(inputBrand)
      && exactKey(known?.model) === exactKey(inputModel)
    ))
    : [];
  if (codes.length === 0 && matches.length === 0) codes.push('EXACT_MODEL_NOT_FOUND');
  if (matches.length > 1) codes.push('EXACT_MODEL_AMBIGUOUS');
  return {
    inputCategory,
    inputBrand,
    inputModel,
    inputMarket,
    outputCategory: matches.length === 1 ? matches[0].category : null,
    outputBrand: matches.length === 1 ? matches[0].brand : null,
    outputModel: matches.length === 1 ? matches[0].model : null,
    codes,
  };
}

function numberValue(value, label) {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value === 'boolean') throw new TypeError(`${label} must be numeric`);
  const number = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(number) || number < 0) throw new TypeError(`${label} must be a non-negative number`);
  return number;
}

function requiresPositiveDimension(fieldId) {
  return /^(closedEnvelope|packagedEnvelope|operationEnvelope)\.(widthMm|heightMm|depthMm)$/.test(fieldId);
}

function stringValue(value, label) {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string`);
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized;
}

function normalizeMappedValue(record, mapping, field) {
  if (field.valueShape === 'range') {
    const minimum = numberValue(record[mapping.minSource], `${field.id} minimum`);
    const maximum = numberValue(record[mapping.maxSource], `${field.id} maximum`);
    if (minimum === null && maximum === null) return null;
    if (minimum === null || maximum === null || minimum > maximum) {
      throw new TypeError(`${field.id} must have an ordered minimum and maximum`);
    }
    return {
      normalizedValue: { min: minimum, max: maximum },
      originalValue: { min: record[mapping.minSource], max: record[mapping.maxSource] },
      sourceColumn: { min: mapping.minSource, max: mapping.maxSource },
    };
  }
  const originalValue = record[mapping.source];
  let normalizedValue;
  if (field.valueShape === 'scalar' && field.unit) {
    normalizedValue = numberValue(originalValue, field.id);
    if (normalizedValue === 0 && requiresPositiveDimension(field.id)) {
      throw new TypeError(`${field.id} must be greater than zero`);
    }
  }
  else if (field.valueShape === 'uri') {
    const text = stringValue(originalValue, field.id);
    if (text === null) return null;
    const url = new URL(text);
    if (url.protocol !== 'https:') throw new TypeError(`${field.id} must use HTTPS`);
    normalizedValue = url.toString();
  } else if (field.valueShape === 'date') {
    const text = stringValue(originalValue, field.id);
    if (text === null) return null;
    const date = new Date(`${text}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
      throw new TypeError(`${field.id} must be YYYY-MM-DD`);
    }
    normalizedValue = text;
  } else normalizedValue = stringValue(originalValue, field.id);
  if (normalizedValue === null) return null;
  return { normalizedValue, originalValue, sourceColumn: mapping.source };
}

function claimKey(claim) {
  return `${claim.identity.category}\0${exactKey(claim.identity.brand)}\0${exactKey(claim.identity.model)}\0${claim.fieldId}`;
}

function isolateConflicts(claims, existingClaims) {
  const grouped = new Map();
  for (const claim of claims) {
    const key = claimKey(claim);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(claim);
  }
  const conflicts = [];
  const accepted = [];
  for (const [key, group] of grouped) {
    const values = new Map(group.map((claim) => [canonicalJson(claim.normalizedValue), claim.normalizedValue]));
    if (values.size > 1) {
      conflicts.push(freezeDeep({
        type: 'provider_internal_mismatch',
        fieldId: group[0].fieldId,
        identity: group[0].identity,
        values: [...values.values()].sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right), 'en')),
        rowNumbers: group.map((claim) => claim.provenance.rowNumber),
      }));
      continue;
    }
    const providerClaim = group[0];
    const existing = (existingClaims ?? []).filter((claim) => (
      claim?.category === providerClaim.identity.category
      && exactKey(claim?.brand) === exactKey(providerClaim.identity.brand)
      && exactKey(claim?.model) === exactKey(providerClaim.identity.model)
      && claim?.fieldId === providerClaim.fieldId
    ));
    const mismatches = existing.filter((claim) => canonicalJson(claim.normalizedValue) !== canonicalJson(providerClaim.normalizedValue));
    if (mismatches.length > 0) {
      conflicts.push(freezeDeep({
        type: 'existing_catalog_mismatch',
        fieldId: providerClaim.fieldId,
        identity: providerClaim.identity,
        values: [providerClaim.normalizedValue, ...mismatches.map((claim) => claim.normalizedValue)],
        rowNumbers: group.map((claim) => claim.provenance.rowNumber),
      }));
      continue;
    }
    accepted.push(providerClaim);
  }
  return { claims: accepted, conflicts };
}

function statusFor(claims, conflicts, rowDiagnostics) {
  if (conflicts.length > 0) return claims.length > 0 ? 'QUARANTINED_WITH_CONFLICTS' : 'CONFLICT_QUARANTINED';
  if (claims.length > 0) return 'QUARANTINED_CANDIDATES';
  if (rowDiagnostics.some(({ codes }) => codes.some((code) => (
    code === 'EXACT_MODEL_NOT_FOUND'
    || code === 'EXACT_MODEL_AMBIGUOUS'
    || code === 'AU_MARKET_NOT_PROVEN'
    || code === 'CATEGORY_UNSUPPORTED_OR_UNMAPPED'
    || code === 'BRAND_MISSING_OR_NON_STRING'
    || code === 'MODEL_MISSING_OR_NON_STRING'
  )))) return 'IDENTITY_UNPROVEN';
  return 'NO_CANDIDATE_FIELDS';
}

function providerResponseReportId(report) {
  const { reportId: ignoredReportId, ...semanticReport } = report;
  return `provider_response_${sha256(canonicalJson(semanticReport)).slice(0, 24)}`;
}

function sealProviderResponseReport(report) {
  return freezeDeep({ ...report, reportId: providerResponseReportId(report) });
}

export function buildProviderKnownModelCatalogue({ currentProjection, historicalClassification }) {
  if (!Array.isArray(currentProjection?.products)) {
    throw new TypeError('current projection products are required');
  }
  if (!Array.isArray(historicalClassification?.records)) {
    throw new TypeError('historical classification records are required');
  }
  const identities = [
    ...currentProjection.products.map((product) => ({
      category: product?.cat,
      brand: product?.brand,
      model: product?.model,
      source: 'current_projection',
    })),
    ...historicalClassification.records.map((record) => ({
      category: record?.category,
      brand: record?.canonicalBrand,
      model: record?.model,
      source: 'historical_classification',
    })),
  ];
  const byExactIdentity = new Map();
  for (const identity of identities) {
    if (!SUPPORTED_CATEGORIES.has(identity.category)
      || typeof identity.brand !== 'string' || !identity.brand.trim()
      || typeof identity.model !== 'string' || !identity.model.trim()) {
      throw new TypeError(`${identity.source} contains an invalid category/brand/model identity`);
    }
    const normalized = {
      category: identity.category,
      brand: identity.brand.trim(),
      model: identity.model.trim(),
    };
    const key = `${normalized.category}\0${exactKey(normalized.brand)}\0${exactKey(normalized.model)}`;
    if (!byExactIdentity.has(key)) byExactIdentity.set(key, normalized);
  }
  return freezeDeep([...byExactIdentity.values()].sort((left, right) => (
    left.category.localeCompare(right.category, 'en-AU')
    || left.brand.localeCompare(right.brand, 'en-AU')
    || left.model.localeCompare(right.model, 'en-AU')
  )));
}

export function buildProviderExistingGeometryClaims({ currentProjection }) {
  if (!Array.isArray(currentProjection?.products)) {
    throw new TypeError('current projection products are required');
  }
  const axisFields = [
    ['w', 'closedEnvelope.widthMm'],
    ['h', 'closedEnvelope.heightMm'],
    ['d', 'closedEnvelope.depthMm'],
  ];
  const claims = [];
  for (const product of currentProjection.products) {
    if (!SUPPORTED_CATEGORIES.has(product?.cat)
      || typeof product?.brand !== 'string' || !product.brand.trim()
      || typeof product?.model !== 'string' || !product.model.trim()) {
      throw new TypeError('current projection contains an invalid category/brand/model identity');
    }
    for (const [sourceField, fieldId] of axisFields) {
      const value = product[sourceField];
      if (!Number.isFinite(value) || value <= 0) continue;
      claims.push({
        category: product.cat,
        brand: product.brand.trim(),
        model: product.model.trim(),
        fieldId,
        normalizedValue: value,
        source: 'current_public_projection',
        authority: 'existing_value_requires_evidence_comparison',
      });
    }
  }
  return freezeDeep(claims);
}

export async function parseAndQuarantineProviderResponse(input) {
  const payload = normalizeBytes(input?.bytes);
  const format = String(input?.format ?? '').trim().toLowerCase();
  if (!FORMAT_EXTENSIONS[format]) throw new TypeError(`unsupported provider response format: ${input?.format}`);
  const fileName = basename(String(input?.fileName ?? ''));
  if (!fileName || fileName !== input.fileName || !fileName.toLowerCase().endsWith(`.${FORMAT_EXTENSIONS[format]}`)) {
    throw new TypeError('provider response fileName must be a basename matching its format');
  }
  const organizationId = requiredId(input.organizationId, 'organizationId');
  const providerId = requiredId(input.providerId, 'providerId');
  const sourceId = requiredId(input.sourceId, 'sourceId');
  const receivedAt = requiredTimestamp(input.receivedAt, 'receivedAt');
  const contentSha256 = sha256(payload);
  const schemaMapping = validateSchemaMapping(input.schemaMapping, format);
  const mappedFieldIds = schemaMapping.columns.filter(({ fieldId }) => fieldId).map(({ fieldId }) => fieldId);
  const rightsEvidence = normalizeRightsEvidence(input.rightsEvidence ?? []);
  const rights = evaluateRights(input.rights, providerId, sourceId, mappedFieldIds, rightsEvidence);
  const base = {
    schemaVersion: 1,
    classification: 'private_provider_response_quarantine',
    organizationId,
    providerId,
    sourceId,
    receivedAt,
    format,
    fileName,
    contentSha256,
    byteLength: payload.length,
    schemaMapping,
    schemaMappingSha256: sha256(canonicalJson(schemaMapping)),
    rightsStateSha256: sha256(canonicalJson(input.rights ?? { decisions: [] })),
    rightsEvidenceSha256: [...rightsEvidence.keys()].sort(),
    rightsDiagnostics: rights.diagnostics,
    cacheSourceAuthorized: rights.cacheSourceAuthorized,
    cacheNormalizedFieldsAuthorized: rights.cacheNormalizedFieldsAuthorized,
    publicDisplayAuthorized: rights.publicDisplayAuthorized,
    originalBytesPreserved: false,
    publicationEligible: false,
    fitEligible: false,
    publicProjection: null,
  };
  if (!rights.cacheSourceAuthorized || !rights.cacheNormalizedFieldsAuthorized || !rights.publicDisplayAuthorized) {
    return sealProviderResponseReport({
      ...base,
      status: 'RIGHTS_BLOCKED',
      claims: [],
      conflicts: [],
      rowDiagnostics: [],
    });
  }
  if (!Array.isArray(input.knownModels) || input.knownModels.length === 0) {
    throw new TypeError('provider response needs a non-empty knownModels catalogue');
  }
  if (input.existingClaims !== undefined && !Array.isArray(input.existingClaims)) {
    throw new TypeError('provider existingClaims must be an array');
  }

  const parsed = parseProviderTabularFile({
    format,
    bytes: payload,
    sheetName: schemaMapping.sheetName,
    headerRow: schemaMapping.headerRow,
  });
  validateHeaders(parsed.headers, schemaMapping);
  const categoryMapping = schemaMapping.columns.find(({ fieldId }) => fieldId === 'identity.category');
  const brandMapping = schemaMapping.columns.find(({ fieldId }) => fieldId === 'identity.brand');
  const modelMapping = schemaMapping.columns.find(({ fieldId }) => fieldId === 'identity.model');
  const marketMapping = schemaMapping.columns.find(({ role }) => role === 'market');
  const bindingFieldIds = new Set(['identity.category', 'identity.brand', 'identity.model', 'identity.market']);
  const valueMappings = schemaMapping.columns.filter(({ fieldId }) => fieldId && !bindingFieldIds.has(fieldId));
  const rawClaims = [];
  const rowDiagnostics = [];
  for (const { rowNumber, record } of parsed.rows) {
    const identity = exactIdentity(
      record,
      categoryMapping,
      brandMapping,
      modelMapping,
      marketMapping,
      input.knownModels,
    );
    const codes = [...identity.codes];
    let acceptedClaimCount = 0;
    if (codes.length === 0) {
      for (const mapping of valueMappings) {
        const field = fieldById.get(mapping.fieldId);
        try {
          const value = normalizeMappedValue(record, mapping, field);
          if (!value) {
            codes.push(`FIELD_EMPTY:${field.id}`);
            continue;
          }
          const claim = {
            fieldId: field.id,
            normalizedValue: value.normalizedValue,
            originalValue: value.originalValue,
            originalUnit: field.unit ?? null,
            axis: field.axis ?? null,
            scope: field.scope,
            identity: {
              inputCategory: identity.inputCategory,
              inputBrand: identity.inputBrand,
              inputModel: identity.inputModel,
              category: identity.outputCategory,
              brand: identity.outputBrand,
              model: identity.outputModel,
              outcome: 'exact',
            },
            market: { input: identity.inputMarket, normalized: 'AU' },
            rights: {
              cacheNormalizedFields: 'granted',
              publicDisplay: 'granted',
            },
            provenance: {
              providerId,
              sourceId,
              contentSha256,
              format,
              rowNumber,
              sourceColumn: value.sourceColumn,
            },
            publicationEligible: false,
            fitEligible: false,
          };
          rawClaims.push(freezeDeep({
            ...claim,
            claimId: `provider_claim_${sha256(canonicalJson(claim)).slice(0, 24)}`,
          }));
          acceptedClaimCount += 1;
        } catch (error) {
          codes.push(`FIELD_INVALID:${field.id}:${error.message}`);
        }
      }
    }
    rowDiagnostics.push(freezeDeep({
      rowNumber,
      inputCategory: identity.inputCategory ?? null,
      inputBrand: identity.inputBrand ?? null,
      inputModel: identity.inputModel ?? null,
      inputMarket: identity.inputMarket ?? null,
      outputCategory: identity.outputCategory,
      outputBrand: identity.outputBrand,
      outputModel: identity.outputModel,
      outcome: acceptedClaimCount > 0 ? 'CANDIDATE' : 'REJECTED',
      acceptedClaimCount,
      codes,
    }));
  }
  const isolated = isolateConflicts(rawClaims, input.existingClaims);
  const status = statusFor(isolated.claims, isolated.conflicts, rowDiagnostics);
  return sealProviderResponseReport({
    ...base,
    status,
    claims: isolated.claims,
    conflicts: isolated.conflicts,
    rowDiagnostics,
  });
}

async function writeImmutable(path, bytes) {
  try {
    await writeFile(path, bytes, { flag: 'wx' });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const existing = await readFile(path);
    if (!existing.equals(Buffer.from(bytes))) throw new Error(`immutable provider object mismatch: ${path}`);
  }
}

function validatePersistableQuarantineReport(report) {
  if (report?.schemaVersion !== 1
    || report?.classification !== 'private_provider_response_quarantine'
    || report?.originalBytesPreserved !== false
    || report?.publicationEligible !== false
    || report?.fitEligible !== false
    || report?.publicProjection !== null) {
    throw new TypeError('a valid private quarantine report is required before persistence');
  }
  if (!report.cacheSourceAuthorized) {
    throw new TypeError('cache_source rights are required before persistence');
  }
  if (!report.cacheNormalizedFieldsAuthorized || !report.publicDisplayAuthorized) {
    throw new TypeError('all provider response rights are required before persistence');
  }
  if (!PERSISTABLE_STATUSES.has(report.status)
    || !/^provider_response_[a-f0-9]{24}$/.test(report.reportId ?? '')
    || !HASH_PATTERN.test(report.contentSha256 ?? '')
    || !Number.isInteger(report.byteLength)
    || report.byteLength <= 0
    || !Array.isArray(report.claims)
    || !Array.isArray(report.conflicts)
    || !Array.isArray(report.rowDiagnostics)
    || !Array.isArray(report.rightsDiagnostics)
    || report.rightsDiagnostics.length !== 0
    || report.claims.some((claim) => claim?.publicationEligible !== false || claim?.fitEligible !== false)) {
    throw new TypeError('a complete private quarantine report is required before persistence');
  }
  if (providerResponseReportId(report) !== report.reportId) {
    throw new TypeError('a sealed private quarantine report is required before persistence');
  }
}

export async function persistQuarantinedProviderResponse(storageRoot, bytes, report, options = {}) {
  validatePersistableQuarantineReport(report);
  const payload = normalizeBytes(bytes);
  const hash = sha256(payload);
  if (hash !== report.contentSha256 || payload.length !== report.byteLength) {
    throw new Error('provider response bytes do not match the quarantine report');
  }
  const store = await initializePrivateOutreachStore(storageRoot);
  const rightsEvidence = normalizeRightsEvidence(options.rightsEvidence ?? []);
  const suppliedRightsHashes = [...rightsEvidence.keys()].sort();
  if (canonicalJson(suppliedRightsHashes) !== canonicalJson(report.rightsEvidenceSha256 ?? [])) {
    throw new Error('rights evidence objects do not match the quarantine report');
  }
  const extension = FORMAT_EXTENSIONS[report.format];
  if (!extension) throw new TypeError('quarantine report format is unsupported');
  const sourceRelativePath = join('provider-samples', 'sha256', hash.slice(0, 2), hash.slice(2, 4), `${hash}.${extension}`);
  const rightsRelativePaths = suppliedRightsHashes.map((rightsHash) => (
    join('rights', 'sha256', rightsHash.slice(0, 2), rightsHash.slice(2, 4), `${rightsHash}.bin`)
  ));
  const receipt = {
    ...report,
    originalBytesPreserved: true,
    storage: {
      rootEnv: 'FITAPPLIANCE_STORAGE_ROOT',
      sourceObjectPath: sourceRelativePath,
      rightsObjectPaths: rightsRelativePaths,
    },
  };
  const receiptBytes = Buffer.from(`${canonicalJson(receipt)}\n`);
  const receiptSha256 = sha256(receiptBytes);
  const receiptRelativePath = join(
    'provider-samples',
    'receipts',
    receiptSha256.slice(0, 2),
    receiptSha256.slice(2, 4),
    `${receiptSha256}.json`,
  );
  const sourcePath = join(store.root, sourceRelativePath);
  const receiptPath = join(store.root, receiptRelativePath);
  const rightsObjectPaths = rightsRelativePaths.map((relativePath) => join(store.root, relativePath));
  await mkdir(dirname(sourcePath), { recursive: true });
  await mkdir(dirname(receiptPath), { recursive: true });
  await Promise.all(rightsObjectPaths.map((path) => mkdir(dirname(path), { recursive: true })));
  await writeImmutable(sourcePath, payload);
  await Promise.all(suppliedRightsHashes.map((rightsHash, index) => (
    writeImmutable(rightsObjectPaths[index], rightsEvidence.get(rightsHash))
  )));
  await writeImmutable(receiptPath, receiptBytes);
  return freezeDeep({
    contentSha256: hash,
    receiptSha256,
    sourcePath,
    receiptPath,
    rightsObjectPaths,
    sourceRelativePath,
    receiptRelativePath,
    rightsRelativePaths,
  });
}
