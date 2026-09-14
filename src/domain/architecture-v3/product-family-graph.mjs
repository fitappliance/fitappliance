import { createHash } from 'node:crypto';

import {
  CANONICAL_EVIDENCE_JSON_VERSION,
  canonicalEvidenceJson,
} from '../../shared/canonical-evidence-json.mjs';

export const PRODUCT_FAMILY_GRAPH_SCHEMA_VERSION = 1;
export const PRODUCT_FAMILY_GRAPH_VERSION = 'fitappliance-product-family-graph-v1';
export const PRODUCT_FAMILY_GRAPH_HASH_DOMAIN = 'fitappliance.product-family-graph.hash.v1';
export const PRODUCT_FAMILY_RESEARCH_NODE_ID_DOMAIN = 'fitappliance.product-family-graph.research-node-id.v1';
export const G2A_BRAND_ID_PATTERN = /^fa_brand_[a-f0-9]{64}$/u;
export const CANONICAL_PRODUCT_ID_PATTERN = /^fa_prod_[a-f0-9]{24}$/u;
export const PRODUCT_FAMILY_RESEARCH_NODE_ID_PATTERN = /^fa_product_family_[a-f0-9]{64}$/u;

const NODE_KINDS = new Set([
  'brand',
  'marketing_series',
  'official_model_group',
  'platform',
  'canonical_product',
]);
const RESEARCH_NODE_KINDS = new Set(['marketing_series', 'official_model_group', 'platform']);
export const PRODUCT_RELATIONSHIP_TARGET_KIND_BY_KIND = Object.freeze(Object.assign(Object.create(null), {
  MARKETED_AS_SERIES: 'marketing_series',
  LISTED_IN_OFFICIAL_MODEL_GROUP: 'official_model_group',
  ASSERTED_SHARED_PLATFORM: 'platform',
  HYPOTHESISED_SHARED_PLATFORM: 'platform',
  VARIANT_OF: 'canonical_product',
}));
const MARKET_PATTERN = /^[A-Z]{2,3}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const LOCATOR_KINDS = new Set(['json_pointer', 'text_anchor', 'url_fragment']);

export class ProductFamilyGraphValidationError extends TypeError {
  constructor(message) {
    super(message);
    this.name = 'ProductFamilyGraphValidationError';
    this.code = 'INVALID_PRODUCT_FAMILY_GRAPH';
  }
}

function invalid(message) {
  throw new ProductFamilyGraphValidationError(message);
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
  const market = stableText(value, label);
  if (!MARKET_PATTERN.test(market)) invalid(`${label} must be a 2-3 letter uppercase market code`);
  return market;
}

function brandId(value, label) {
  const id = stableText(value, label);
  if (!G2A_BRAND_ID_PATTERN.test(id)) invalid(`${label} must reuse an exact G2a brand ID`);
  return id;
}

function nodeId(value, label) {
  return stableText(value, label);
}

export function isExactResearchModelName(value) {
  return typeof value === 'string'
    && value.trim() !== ''
    && value === value.trim()
    && !/[*?\[\]{}|^$]/u.test(value)
    && !/\.\.\./u.test(value)
    && !/^(?:all|any)[\s_-]/iu.test(value);
}

function exactModelName(value, label) {
  const name = stableText(value, label);
  if (!isExactResearchModelName(name)) {
    invalid(`${label} must be one exact model name, not a wildcard or model set`);
  }
  return name;
}

function researchNodeIdFor({ kind, market, brandId: ownerBrandId, researchKey }) {
  const identity = {
    canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
    schemaVersion: PRODUCT_FAMILY_GRAPH_SCHEMA_VERSION,
    researchNodeIdDomain: PRODUCT_FAMILY_RESEARCH_NODE_ID_DOMAIN,
    kind,
    market,
    brandId: ownerBrandId,
    researchKey,
  };
  return `fa_product_family_${sha256(canonicalEvidenceJson(identity))}`;
}

function normalizeLocator(value, label) {
  exactObject(value, label, ['kind', 'value']);
  const kind = stableText(value.kind, `${label} kind`);
  if (!LOCATOR_KINDS.has(kind)) invalid(`${label} kind is unsupported`);
  const locatorValue = stableText(value.value, `${label} value`);
  if (kind === 'json_pointer') {
    if (!locatorValue.startsWith('/') || /~(?:[^01]|$)/u.test(locatorValue)) {
      invalid(`${label} must be a non-root JSON Pointer with valid escapes`);
    }
  }
  return { kind, value: locatorValue };
}

function normalizeCandidateReference(value, label) {
  exactObject(value, label, ['locator', 'sourcePath', 'sourceSha256', 'status']);
  const sourcePath = value.sourcePath === null ? null : stableText(value.sourcePath, `${label} sourcePath`);
  const sourceSha256 = value.sourceSha256 === null ? null : stableText(value.sourceSha256, `${label} sourceSha256`);
  if (sourceSha256 !== null && !SHA256_PATTERN.test(sourceSha256)) {
    invalid(`${label} sourceSha256 must be a lowercase SHA-256 hex digest`);
  }
  if (value.status !== 'unverified') invalid(`${label} status must be unverified`);
  return {
    sourcePath,
    sourceSha256,
    locator: normalizeLocator(value.locator, `${label} locator`),
    status: 'unverified',
  };
}

/**
 * Normalizes closed, unverified research-candidate references. Their locator
 * values are only source-discovery hints, not G3 typed Fragment locators or
 * proof of source authority, receipt, or verification.
 */
export function normalizeUnverifiedResearchCandidateReferences(value, label) {
  if (!Array.isArray(value)) invalid(`${label} must be an array`);
  const keys = new Set();
  const references = value.map((reference, index) => {
    const normalized = normalizeCandidateReference(reference, `${label}[${index}]`);
    const key = canonicalEvidenceJson(normalized);
    if (keys.has(key)) invalid(`${label} has a duplicate candidate reference`);
    keys.add(key);
    return normalized;
  });
  return references.sort((left, right) => stableCompare(
    canonicalEvidenceJson(left),
    canonicalEvidenceJson(right),
  ));
}

function normalizeNode(value, index) {
  plainObject(value, `nodes[${index}]`);
  const kind = stableText(value.kind, `nodes[${index}] kind`);
  if (!NODE_KINDS.has(kind)) invalid(`nodes[${index}] kind is unsupported: ${kind}`);
  const keys = RESEARCH_NODE_KINDS.has(kind)
    ? ['brandId', 'id', 'kind', 'market', 'name', 'references', 'researchKey']
    : ['brandId', 'id', 'kind', 'market', 'name', 'references'];
  exactObject(value, `nodes[${index}]`, keys);

  const normalized = {
    id: nodeId(value.id, `nodes[${index}] id`),
    kind,
    market: marketCode(value.market, `nodes[${index}] market`),
    brandId: brandId(value.brandId, `nodes[${index}] brandId`),
    name: kind === 'canonical_product'
      ? exactModelName(value.name, `nodes[${index}] name`)
      : stableText(value.name, `nodes[${index}] name`),
    references: normalizeUnverifiedResearchCandidateReferences(value.references, `nodes[${index}] references`),
  };

  if (kind === 'brand') {
    if (normalized.id !== normalized.brandId) invalid(`nodes[${index}] brand ID must equal its owner brand ID`);
    return normalized;
  }
  if (kind === 'canonical_product') {
    if (!CANONICAL_PRODUCT_ID_PATTERN.test(normalized.id)) {
      invalid(`nodes[${index}] canonical product must reuse an exact canonical product ID`);
    }
    return normalized;
  }

  const researchKey = stableText(value.researchKey, `nodes[${index}] researchKey`);
  const expectedId = researchNodeIdFor({ ...normalized, researchKey });
  if (normalized.id !== expectedId) {
    invalid(`nodes[${index}] research group ID does not match its versioned identity payload`);
  }
  return { ...normalized, researchKey };
}

function normalizeNodes(value) {
  if (!Array.isArray(value)) invalid('nodes must be an array');
  const nodeById = new Map();
  const nodes = value.map((node, index) => {
    const normalized = normalizeNode(node, index);
    if (nodeById.has(normalized.id)) invalid(`nodes has duplicate node ID: ${normalized.id}`);
    nodeById.set(normalized.id, normalized);
    return normalized;
  });
  const brands = new Map(nodes
    .filter((node) => node.kind === 'brand')
    .map((node) => [node.brandId, node]));
  for (const node of nodes) {
    const owner = brands.get(node.brandId);
    if (!owner) invalid(`node ${node.id} has no explicit brand owner`);
    if (owner.market !== node.market) invalid(`node ${node.id} market does not match its brand owner`);
  }
  return {
    nodeById,
    nodes: nodes.sort((left, right) => stableCompare(left.id, right.id)),
  };
}

function edgeKey(edge) {
  return [edge.kind, edge.fromId, edge.toId].join('\u0000');
}

function outputEdgeKey(edge) {
  return `${edgeKey(edge)}\u0000${canonicalEvidenceJson(edge.references)}`;
}

function normalizeEdges(value, nodeById) {
  if (!Array.isArray(value)) invalid('edges must be an array');
  const keys = new Set();
  const edges = value.map((edge, index) => {
    exactObject(edge, `edges[${index}]`, ['fromId', 'kind', 'references', 'toId']);
    const kind = stableText(edge.kind, `edges[${index}] kind`);
    if (!Object.hasOwn(PRODUCT_RELATIONSHIP_TARGET_KIND_BY_KIND, kind)) {
      invalid(`edges[${index}] kind is unsupported: ${kind}`);
    }
    const targetKind = PRODUCT_RELATIONSHIP_TARGET_KIND_BY_KIND[kind];
    const fromId = nodeId(edge.fromId, `edges[${index}] fromId`);
    const toId = nodeId(edge.toId, `edges[${index}] toId`);
    if (fromId === toId) invalid(`edges[${index}] must not be a self edge`);
    const normalized = {
      kind,
      fromId,
      toId,
      references: normalizeUnverifiedResearchCandidateReferences(edge.references, `edges[${index}] references`),
    };
    const duplicateKey = edgeKey(normalized);
    if (keys.has(duplicateKey)) invalid(`edges has duplicate edge: ${kind} ${fromId} -> ${toId}`);
    keys.add(duplicateKey);

    const source = nodeById.get(fromId);
    const target = nodeById.get(toId);
    if (!source || !target) invalid(`edges[${index}] has a dangling node ID`);
    if (source.kind !== 'canonical_product' || target.kind !== targetKind) {
      invalid(`edges[${index}] endpoint kinds are invalid for ${kind}`);
    }
    if (source.market !== target.market) invalid(`edges[${index}] endpoints must share the same market`);
    if (source.brandId !== target.brandId) invalid(`edges[${index}] endpoints must share the same brand owner`);
    return normalized;
  });
  return edges.sort((left, right) => stableCompare(outputEdgeKey(left), outputEdgeKey(right)));
}

function hasVariantCycle(edges) {
  const adjacency = new Map();
  for (const edge of edges) {
    if (edge.kind !== 'VARIANT_OF') continue;
    const successors = adjacency.get(edge.fromId) ?? [];
    successors.push(edge.toId);
    adjacency.set(edge.fromId, successors);
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (nodeId) => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const successor of adjacency.get(nodeId) ?? []) {
      if (visit(successor)) return true;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };
  return [...adjacency.keys()].some((nodeId) => visit(nodeId));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

/**
 * Builds a closed, research-only relationship graph. It records no fields,
 * measurements, authority verdicts, receipts, inheritance or publication fit.
 */
export function buildProductFamilyGraph(rawInput) {
  const input = strictJsonClone(rawInput, 'product family graph input');
  exactObject(input, 'product family graph input', ['edges', 'nodes']);
  const { nodeById, nodes } = normalizeNodes(input.nodes);
  const edges = normalizeEdges(input.edges, nodeById);
  if (hasVariantCycle(edges)) invalid('VARIANT_OF edges contain a cycle');

  const graph = {
    schemaVersion: PRODUCT_FAMILY_GRAPH_SCHEMA_VERSION,
    graphVersion: PRODUCT_FAMILY_GRAPH_VERSION,
    canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
    graphHashDomain: PRODUCT_FAMILY_GRAPH_HASH_DOMAIN,
    researchNodeIdDomain: PRODUCT_FAMILY_RESEARCH_NODE_ID_DOMAIN,
    nodes,
    edges,
  };
  const graphSha256 = sha256(canonicalEvidenceJson({
    canonicalizationVersion: CANONICAL_EVIDENCE_JSON_VERSION,
    schemaVersion: PRODUCT_FAMILY_GRAPH_SCHEMA_VERSION,
    graphHashDomain: PRODUCT_FAMILY_GRAPH_HASH_DOMAIN,
    graph,
  }));
  return deepFreeze({ graph, graphSha256 });
}
