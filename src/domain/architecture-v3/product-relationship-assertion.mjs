import { createHash } from 'node:crypto';

import {
  CANONICAL_EVIDENCE_JSON_VERSION,
  canonicalEvidenceJson,
} from '../../shared/canonical-evidence-json.mjs';
import {
  CANONICAL_PRODUCT_ID_PATTERN,
  ProductFamilyGraphValidationError,
  PRODUCT_RELATIONSHIP_TARGET_KIND_BY_KIND,
  PRODUCT_FAMILY_RESEARCH_NODE_ID_PATTERN,
  isExactResearchModelName,
  normalizeUnverifiedResearchCandidateReferences,
} from './product-family-graph.mjs';
import { validateEngineeringContext } from './engineering-context.mjs';
import { requireV3Semantics } from './semantics.mjs';

export const PRODUCT_RELATIONSHIP_ASSERTION_SCHEMA_VERSION = 1;
export const PRODUCT_RELATIONSHIP_ASSERTION_VERSION = 'fitappliance-product-relationship-assertion-v1';
export const PRODUCT_RELATIONSHIP_ASSERTION_ID_DOMAIN = 'fitappliance.product-relationship-assertion.id.v1';

const MARKET_PATTERN = /^[A-Z]{2,3}$/u;

export class ProductRelationshipAssertionValidationError extends TypeError {
  constructor(message) {
    super(message);
    this.name = 'ProductRelationshipAssertionValidationError';
    this.code = 'INVALID_PRODUCT_RELATIONSHIP_ASSERTION';
  }
}

function invalid(message) {
  throw new ProductRelationshipAssertionValidationError(message);
}

function stableCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function strictJsonClone(value, label) {
  try {
    return JSON.parse(canonicalEvidenceJson(value));
  } catch (error) {
    invalid(`${label} must be strict JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    invalid(`${label} must be a plain object`);
  }
  return value;
}

function exactObject(value, label, keys) {
  plainObject(value, label);
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) invalid(`${label} has unknown key: ${key}`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) invalid(`${label} is missing key: ${key}`);
  }
  return value;
}

function stableText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') invalid(`${label} must be a non-empty string`);
  if (value !== value.trim()) invalid(`${label} must not have leading or trailing whitespace`);
  return value;
}

function marketCode(value, label) {
  if (value === null) return null;
  const market = stableText(value, label);
  if (!MARKET_PATTERN.test(market)) invalid(`${label} must be a 2-3 letter uppercase market code`);
  return market;
}

function canonicalProductId(value, label) {
  const id = stableText(value, label);
  if (!CANONICAL_PRODUCT_ID_PATTERN.test(id)) invalid(`${label} must use an exact canonical product ID`);
  return id;
}

function exactModelName(value, label) {
  const name = stableText(value, label);
  if (!isExactResearchModelName(name)) {
    invalid(`${label} must be one exact model name, not a wildcard or model set`);
  }
  return name;
}

function normalizeCandidateReferences(value, label) {
  try {
    return normalizeUnverifiedResearchCandidateReferences(value, label);
  } catch (error) {
    if (error instanceof ProductFamilyGraphValidationError) invalid(error.message);
    throw error;
  }
}

function normalizeRelation(value) {
  exactObject(value, 'relation', ['kind', 'target']);
  const kind = stableText(value.kind, 'relation kind');
  if (!Object.hasOwn(PRODUCT_RELATIONSHIP_TARGET_KIND_BY_KIND, kind)) {
    invalid(`relation kind is unsupported: ${kind}`);
  }
  const expectedTargetKind = PRODUCT_RELATIONSHIP_TARGET_KIND_BY_KIND[kind];
  if (value.target === null) return { kind, target: null };
  exactObject(value.target, 'relation target', ['id', 'kind']);
  const targetKind = stableText(value.target.kind, 'relation target kind');
  if (targetKind !== expectedTargetKind) {
    invalid(`relation target kind must be ${expectedTargetKind} for ${kind}`);
  }
  const targetId = targetKind === 'canonical_product'
    ? canonicalProductId(value.target.id, 'relation target id')
    : stableText(value.target.id, 'relation target id');
  if (targetKind !== 'canonical_product' && !PRODUCT_FAMILY_RESEARCH_NODE_ID_PATTERN.test(targetId)) {
    invalid('relation target id must use a product-family research node ID');
  }
  return { kind, target: { id: targetId, kind: targetKind } };
}

function normalizeNamedModels(value) {
  if (!Array.isArray(value)) invalid('namedModels must be an array');
  if (value.length === 0) invalid('namedModels must name at least one exact canonical product');
  const seenIds = new Set();
  const models = value.map((model, index) => {
    exactObject(model, `namedModels[${index}]`, ['canonicalProductId', 'model']);
    const productId = canonicalProductId(model.canonicalProductId, `namedModels[${index}] canonicalProductId`);
    if (seenIds.has(productId)) invalid(`namedModels has duplicate canonical product ID: ${productId}`);
    seenIds.add(productId);
    return {
      canonicalProductId: productId,
      model: exactModelName(model.model, `namedModels[${index}] model`),
    };
  });
  return models.sort((left, right) => stableCompare(left.canonicalProductId, right.canonicalProductId));
}

function normalizeSharedFields(value, semanticPolicy) {
  if (!Array.isArray(value)) invalid('sharedFields must be an array');
  const seen = new Set();
  const fields = value.map((fieldPath, index) => {
    const field = stableText(fieldPath, `sharedFields[${index}]`);
    if (!Object.hasOwn(semanticPolicy.fields, field)) {
      invalid(`shared field is absent from the compiled policy: ${field}`);
    }
    if (seen.has(field)) invalid(`sharedFields has a duplicate field: ${field}`);
    seen.add(field);
    return field;
  });
  return fields.sort(stableCompare);
}

function normalizeContexts(value, semantics) {
  if (!Array.isArray(value)) invalid('contexts must be an array');
  const seen = new Set();
  const contexts = value.map((context, index) => {
    let normalized;
    try {
      normalized = validateEngineeringContext({
        context,
        semantics,
        witnessedConditions: [],
      });
    } catch (error) {
      invalid(`contexts[${index}] is not a valid G1a engineering context: ${error instanceof Error ? error.message : String(error)}`);
    }
    const detached = JSON.parse(canonicalEvidenceJson(normalized));
    const key = canonicalEvidenceJson(detached);
    if (seen.has(key)) invalid(`contexts has a duplicate context`);
    seen.add(key);
    return detached;
  });
  return contexts.sort((left, right) => stableCompare(canonicalEvidenceJson(left), canonicalEvidenceJson(right)));
}

function normalizeEvidence(value) {
  exactObject(value, 'evidence', ['references', 'status']);
  if (value.status !== 'unverified_candidate') {
    invalid('evidence status must be unverified_candidate');
  }
  return {
    status: 'unverified_candidate',
    references: normalizeCandidateReferences(value.references, 'evidence references'),
  };
}

function researchGaps({ relation, market, sharedFields, contexts, evidence }) {
  const gaps = ['unverified_proof'];
  if (relation.target === null) gaps.push('missing_target');
  if (market === null) gaps.push('missing_market');
  if (sharedFields.length === 0) gaps.push('missing_shared_fields');
  if (contexts.length === 0) gaps.push('missing_contexts');
  if (evidence.references.length === 0) gaps.push('missing_candidate_references');
  return gaps.sort(stableCompare);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function createProductRelationshipAssertion(rawInput) {
  const input = strictJsonClone(rawInput, 'product relationship assertion input');
  exactObject(input, 'product relationship assertion input', [
    'contexts',
    'evidence',
    'market',
    'namedModels',
    'relation',
    'semantics',
    'sharedFields',
  ]);
  let semanticPolicy;
  try {
    semanticPolicy = requireV3Semantics(input.semantics);
  } catch (error) {
    invalid(`semantics must be a compiled V3 policy: ${error instanceof Error ? error.message : String(error)}`);
  }
  const relation = normalizeRelation(input.relation);
  const market = marketCode(input.market, 'market');
  const namedModels = normalizeNamedModels(input.namedModels);
  const sharedFields = normalizeSharedFields(input.sharedFields, semanticPolicy);
  const contexts = normalizeContexts(input.contexts, input.semantics);
  const evidence = normalizeEvidence(input.evidence);
  const semanticPolicySha256 = input.semantics.semanticPolicySha256;
  const assertionId = `fa_product_relationship_${sha256(canonicalEvidenceJson({
    canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
    schemaVersion: PRODUCT_RELATIONSHIP_ASSERTION_SCHEMA_VERSION,
    assertionIdDomain: PRODUCT_RELATIONSHIP_ASSERTION_ID_DOMAIN,
    relation,
    market,
    namedModels,
    sharedFields,
    contexts,
    evidence,
    semanticPolicySha256,
  }))}`;
  return deepFreeze({
    schemaVersion: PRODUCT_RELATIONSHIP_ASSERTION_SCHEMA_VERSION,
    assertionVersion: PRODUCT_RELATIONSHIP_ASSERTION_VERSION,
    canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
    assertionIdDomain: PRODUCT_RELATIONSHIP_ASSERTION_ID_DOMAIN,
    assertionId,
    relation,
    market,
    namedModels,
    sharedFields,
    contexts,
    evidence,
    semanticPolicySha256,
    researchStatus: 'research_candidate',
    gaps: researchGaps({ relation, market, sharedFields, contexts, evidence }),
    derivationEligible: false,
  });
}
