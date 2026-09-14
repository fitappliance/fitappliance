import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalEvidenceJson } from '../../src/shared/canonical-evidence-json.mjs';
import {
  ProductRelationshipAssertionValidationError,
  createProductRelationshipAssertion,
} from '../../src/domain/architecture-v3/product-relationship-assertion.mjs';
import {
  ProductFamilyGraphValidationError,
  buildProductFamilyGraph,
} from '../../src/domain/architecture-v3/product-family-graph.mjs';
import { compileV3Semantics } from '../../src/domain/architecture-v3/semantics.mjs';

const BRAND_ID = `fa_brand_${'1'.repeat(64)}`;
const OTHER_BRAND_ID = `fa_brand_${'2'.repeat(64)}`;
const MISSING_BRAND_ID = `fa_brand_${'f'.repeat(64)}`;
const PRODUCT_A_ID = `fa_prod_${'1'.repeat(24)}`;
const PRODUCT_B_ID = `fa_prod_${'2'.repeat(24)}`;
const MISSING_PRODUCT_ID = `fa_prod_${'f'.repeat(24)}`;
const PRODUCT_MUTATION_ID = `fa_prod_${'3'.repeat(24)}`;
const PLATFORM_TARGET_ID = `fa_product_family_${'c'.repeat(64)}`;
const GRAPH_SCHEMA_VERSION = 1;
const GRAPH_HASH_DOMAIN = 'fitappliance.product-family-graph.hash.v1';
const RESEARCH_NODE_ID_DOMAIN = 'fitappliance.product-family-graph.research-node-id.v1';
const ASSERTION_SCHEMA_VERSION = 1;
const ASSERTION_ID_DOMAIN = 'fitappliance.product-relationship-assertion.id.v1';

const [fieldDictionary, installationMatrix, overlay] = await Promise.all([
  readFile('data/architecture-v2/policies/product-data-field-rights-dictionary.json', 'utf8').then(JSON.parse),
  readFile('data/architecture-v2/generated/installation-evidence-applicability-matrix.json', 'utf8').then(JSON.parse),
  readFile('data/architecture-v3/policies/semantics-overlay.json', 'utf8').then(JSON.parse),
]);
const SEMANTICS = compileV3Semantics({ fieldDictionary, installationMatrix, overlay });

function brandNode(overrides = {}) {
  return {
    id: BRAND_ID,
    kind: 'brand',
    market: 'AU',
    brandId: BRAND_ID,
    name: 'Fixture brand',
    references: [],
    ...overrides,
  };
}

function productNode(id, name, overrides = {}) {
  return {
    id,
    kind: 'canonical_product',
    market: 'AU',
    brandId: BRAND_ID,
    name,
    references: [],
    ...overrides,
  };
}

function researchNodeId({ kind, market, brandId, researchKey }) {
  const identity = {
    canonicalizationVersion: 'fit-evidence-json-v3-1',
    schemaVersion: GRAPH_SCHEMA_VERSION,
    researchNodeIdDomain: RESEARCH_NODE_ID_DOMAIN,
    kind,
    market,
    brandId,
    researchKey,
  };
  return `fa_product_family_${createHash('sha256')
    .update(canonicalEvidenceJson(identity), 'utf8')
    .digest('hex')}`;
}

function platformNode(overrides = {}) {
  const node = {
    kind: 'platform',
    market: 'AU',
    brandId: BRAND_ID,
    name: 'Fixture platform hypothesis',
    researchKey: 'fixture-platform-a',
    references: [],
    ...overrides,
  };
  return { ...node, id: node.id ?? researchNodeId(node) };
}

function candidateReference(overrides = {}) {
  return {
    sourcePath: 'data/fixture.json',
    sourceSha256: 'a'.repeat(64),
    locator: { kind: 'json_pointer', value: '/records/0' },
    status: 'unverified',
    ...overrides,
  };
}

function assertGraphError(operation, pattern) {
  assert.throws(operation, (error) => (
    error instanceof ProductFamilyGraphValidationError
      && error.code === 'INVALID_PRODUCT_FAMILY_GRAPH'
      && pattern.test(error.message)
  ));
}

function underbenchContext(overrides = {}) {
  return {
    configurationKey: 'underbench_worktop_removed',
    conditions: [
      { parameter: 'installationMode', operator: 'eq', value: 'underbench' },
      { parameter: 'worktop', operator: 'eq', value: 'removed' },
    ],
    referenceDatum: 'envelope_extent',
    operatingState: { kind: 'closed', angleDegrees: null },
    ...overrides,
  };
}

function relationshipInput(overrides = {}) {
  return {
    relation: {
      kind: 'ASSERTED_SHARED_PLATFORM',
      target: { id: PLATFORM_TARGET_ID, kind: 'platform' },
    },
    market: 'AU',
    namedModels: [
      { canonicalProductId: PRODUCT_A_ID, model: 'Fixture A' },
      { canonicalProductId: PRODUCT_B_ID, model: 'Fixture B' },
    ],
    sharedFields: ['closedEnvelope.widthMm'],
    contexts: [underbenchContext()],
    evidence: {
      status: 'unverified_candidate',
      references: [candidateReference({
        locator: { kind: 'text_anchor', value: 'Unverified source note' },
      })],
    },
    semantics: SEMANTICS,
    ...overrides,
  };
}

function assertRelationshipError(operation, pattern) {
  assert.throws(operation, (error) => (
    error instanceof ProductRelationshipAssertionValidationError
      && error.code === 'INVALID_PRODUCT_RELATIONSHIP_ASSERTION'
      && pattern.test(error.message)
  ));
}

const BRAND_SNAPSHOT_PATH = 'data/architecture-v3/generated/brand-registry.json';
const CANONICAL_REGISTRY_PATH = 'data/architecture-v2/generated/canonical-registry.json';
const PRODUCT_FAMILY_INPUT_PATH = 'data/architecture-v3/research/product-family-input.json';
const PRODUCT_FAMILY_GRAPH_PATH = 'data/architecture-v3/generated/product-family-graph.json';
const BRAND_SNAPSHOT_RAW_SHA256 = 'cbb4dac77938ae0f9bf40278325b42a33b0e61c6403a5212eff9e9a05e7dbf0d';
const BRAND_REGISTRY_SHA256 = '9f462e007851692a191fe47d462dce390129afd4d6edf0b047a41e9492bd04eb';
const CANONICAL_REGISTRY_RAW_SHA256 = '2459a3a6254c336c875a1fc8d5e070d0271175dd08786bba6477b94ef410336f';
const REAL_SEED_PRODUCTS = [
  {
    canonicalProductId: 'fa_prod_23e982600e8a5108ac9c8db9',
    model: 'SBI8ECS01A',
    brand: 'Bosch',
    brandId: 'fa_brand_014735a20237bd116392309fd1e4528127a7c6a32ca3a2737455c5e1432313b1',
    canonicalPointer: '/products/120',
    brandPointer: '/registry/brands/0',
  },
  {
    canonicalProductId: 'fa_prod_f4d4ad87e43eb868c9a4670b',
    model: 'SBI8EDS01A',
    brand: 'Bosch',
    brandId: 'fa_brand_014735a20237bd116392309fd1e4528127a7c6a32ca3a2737455c5e1432313b1',
    canonicalPointer: '/products/121',
    brandPointer: '/registry/brands/0',
  },
  {
    canonicalProductId: 'fa_prod_4c5dd632cbad6b5d410cb718',
    model: 'DD60D2NB9',
    brand: 'Fisher & Paykel',
    brandId: 'fa_brand_9bbfd8e1944afddcd625ec5d401ba9c39230fdb4b169b1a096d0994aacf7bf71',
    canonicalPointer: '/products/294',
    brandPointer: '/registry/brands/98',
  },
  {
    canonicalProductId: 'fa_prod_6868cdde53bfa347a96e1a20',
    model: 'DD60D2NX9',
    brand: 'Fisher & Paykel',
    brandId: 'fa_brand_9bbfd8e1944afddcd625ec5d401ba9c39230fdb4b169b1a096d0994aacf7bf71',
    canonicalPointer: '/products/295',
    brandPointer: '/registry/brands/98',
  },
];

function readRepositoryJson(relativePath) {
  return JSON.parse(readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8'));
}

function rawSha256(relativePath) {
  return createHash('sha256')
    .update(readFileSync(new URL(`../../${relativePath}`, import.meta.url)))
    .digest('hex');
}

function assertSeedSourceBindings(input) {
  assert.deepEqual(input.sourceInputs, [
    {
      path: BRAND_SNAPSHOT_PATH,
      rawSha256: BRAND_SNAPSHOT_RAW_SHA256,
      registrySha256: BRAND_REGISTRY_SHA256,
      role: 'g2a_brand_snapshot',
    },
    {
      path: CANONICAL_REGISTRY_PATH,
      rawSha256: CANONICAL_REGISTRY_RAW_SHA256,
      role: 'canonical_product_identity_rows',
      schemaVersion: 1,
    },
  ]);
  for (const source of input.sourceInputs) {
    assert.equal(rawSha256(source.path), source.rawSha256);
  }
}

function assertSeedProductClosure({ input, brandSnapshot, canonicalRegistry }) {
  for (const expected of REAL_SEED_PRODUCTS) {
    const node = input.nodes.find((candidate) => candidate.id === expected.canonicalProductId);
    assert.ok(node, `missing seed node for ${expected.model}`);
    assert.equal(node.kind, 'canonical_product');
    assert.equal(node.market, 'AU');
    assert.equal(node.brandId, expected.brandId);
    assert.equal(node.name, expected.model);
    assert.deepEqual(node.references, [{
      sourcePath: CANONICAL_REGISTRY_PATH,
      sourceSha256: CANONICAL_REGISTRY_RAW_SHA256,
      locator: { kind: 'json_pointer', value: expected.canonicalPointer },
      status: 'unverified',
    }]);

    const canonicalRow = canonicalRegistry.products[Number(expected.canonicalPointer.split('/').at(-1))];
    assert.equal(canonicalRow.id, expected.canonicalProductId);
    assert.equal(canonicalRow.model, expected.model);
    assert.equal(canonicalRow.brand, expected.brand);
    const brandRow = brandSnapshot.registry.brands[Number(expected.brandPointer.split('/').at(-1))];
    assert.equal(brandRow.brandId, expected.brandId);
    assert.equal(brandRow.displayName, expected.brand);
    assert.deepEqual(input.nodes.find((candidate) => candidate.id === expected.brandId), {
      id: brandRow.brandId,
      kind: 'brand',
      market: 'AU',
      brandId: brandRow.brandId,
      name: brandRow.displayName,
      references: [{
        sourcePath: BRAND_SNAPSHOT_PATH,
        sourceSha256: BRAND_SNAPSHOT_RAW_SHA256,
        locator: { kind: 'json_pointer', value: expected.brandPointer },
        status: 'unverified',
      }],
    });
  }
  for (const brandId of new Set(REAL_SEED_PRODUCTS.map((product) => product.brandId))) {
    const groups = input.nodes.filter((node) => node.kind === 'platform' && node.brandId === brandId);
    assert.equal(groups.length, 1, 'exactly one research group per selected brand');
    assert.equal(groups[0].market, 'AU');
    assert.deepEqual(groups[0].references, []);
    const members = input.edges.filter((edge) => edge.toId === groups[0].id);
    assert.deepEqual(
      members.map((edge) => edge.fromId).sort(),
      REAL_SEED_PRODUCTS.filter((product) => product.brandId === brandId)
        .map((product) => product.canonicalProductId).sort(),
    );
    for (const edge of members) {
      assert.equal(edge.kind, 'HYPOTHESISED_SHARED_PLATFORM');
      assert.deepEqual(edge.references, []);
    }
  }
}

test('replays the bounded AU seed with source-bound exact model rows and hypotheses only', () => {
  const input = readRepositoryJson(PRODUCT_FAMILY_INPUT_PATH);
  const snapshot = readRepositoryJson(PRODUCT_FAMILY_GRAPH_PATH);
  const brandSnapshot = readRepositoryJson(BRAND_SNAPSHOT_PATH);
  const canonicalRegistry = readRepositoryJson(CANONICAL_REGISTRY_PATH);

  assert.deepEqual(Object.keys(input).sort(), [
    'canonicalizationVersion',
    'edges',
    'inputVersion',
    'market',
    'nodes',
    'schemaVersion',
    'sourceInputs',
  ]);
  assert.equal(input.schemaVersion, 1);
  assert.equal(input.inputVersion, 'fitappliance-product-family-input-v1');
  assert.equal(input.canonicalizationVersion, 'fit-evidence-json-v3-1');
  assert.equal(input.market, 'AU');
  assertSeedSourceBindings(input);
  assertSeedProductClosure({ input, brandSnapshot, canonicalRegistry });

  assert.deepEqual(snapshot, buildProductFamilyGraph({ nodes: input.nodes, edges: input.edges }));
  assert.equal(snapshot.graph.nodes.filter((node) => node.kind === 'brand').length, 2);
  assert.equal(snapshot.graph.nodes.filter((node) => node.kind === 'canonical_product').length, 4);
  assert.equal(snapshot.graph.nodes.filter((node) => node.kind === 'platform').length, 2);
  assert.equal(snapshot.graph.nodes.length, 8);
  assert.equal(snapshot.graph.edges.length, 4);
  assert.equal(snapshot.graph.edges.every((edge) => edge.kind === 'HYPOTHESISED_SHARED_PLATFORM'), true);
  assert.equal(snapshot.graph.edges.some((edge) => [
    'ASSERTED_SHARED_PLATFORM',
    'LISTED_IN_OFFICIAL_MODEL_GROUP',
    'MARKETED_AS_SERIES',
  ].includes(edge.kind)), false);
  assert.deepEqual(
    input.nodes.filter((node) => node.kind === 'canonical_product').map((node) => node.name).sort(),
    REAL_SEED_PRODUCTS.map((product) => product.model).sort(),
  );

  const alteredDigest = structuredClone(input);
  alteredDigest.sourceInputs[1].rawSha256 = '0'.repeat(64);
  assert.throws(() => assertSeedSourceBindings(alteredDigest), assert.AssertionError);

  const alteredRegistry = structuredClone(canonicalRegistry);
  alteredRegistry.products[120].id = MISSING_PRODUCT_ID;
  assert.throws(
    () => assertSeedProductClosure({ input, brandSnapshot, canonicalRegistry: alteredRegistry }),
    assert.AssertionError,
  );
});

for (const [label, mutate] of [
  ['brand label', (input) => { input.nodes[0].name = 'Wrong brand'; }],
  ['brand market', (input) => { input.nodes[0].market = 'NZ'; }],
  ['brand source path', (input) => { input.nodes[0].references[0].sourcePath = CANONICAL_REGISTRY_PATH; }],
  ['brand source hash', (input) => { input.nodes[0].references[0].sourceSha256 = '0'.repeat(64); }],
  ['brand source pointer', (input) => { input.nodes[0].references[0].locator.value = '/registry/brands/98'; }],
  ['missing pair member', (input) => { input.edges.pop(); }],
  ['reassigned pair member', (input) => { input.edges[3].fromId = input.edges[2].fromId; }],
  ['two groups for one brand', (input) => {
    const groups = input.nodes.filter((node) => node.kind === 'platform');
    groups[1].brandId = groups[0].brandId;
    const oldId = groups[1].id;
    groups[1].id = researchNodeId(groups[1]);
    input.edges.filter((edge) => edge.toId === oldId).forEach((edge, index) => {
      edge.toId = groups[1].id;
      edge.fromId = REAL_SEED_PRODUCTS[index].canonicalProductId;
    });
  }],
  ['unsupported group proof', (input) => {
    input.nodes.find((node) => node.kind === 'platform').references = [candidateReference()];
  }],
  ['unsupported membership proof', (input) => { input.edges[0].references = [candidateReference()]; }],
]) {
  test(`seed closure rejects ${label}`, () => {
    const input = readRepositoryJson(PRODUCT_FAMILY_INPUT_PATH);
    const brandSnapshot = readRepositoryJson(BRAND_SNAPSHOT_PATH);
    const canonicalRegistry = readRepositoryJson(CANONICAL_REGISTRY_PATH);
    mutate(input);
    assert.throws(
      () => assertSeedProductClosure({ input, brandSnapshot, canonicalRegistry }),
      assert.AssertionError,
    );
  });
}

test('rejects a VARIANT_OF cycle instead of retaining a recursive family relation', () => {
  assert.throws(
    () => buildProductFamilyGraph({
      nodes: [
        brandNode(),
        productNode(PRODUCT_A_ID, 'Fixture A'),
        productNode(PRODUCT_B_ID, 'Fixture B'),
      ],
      edges: [
        { kind: 'VARIANT_OF', fromId: PRODUCT_A_ID, toId: PRODUCT_B_ID, references: [] },
        { kind: 'VARIANT_OF', fromId: PRODUCT_B_ID, toId: PRODUCT_A_ID, references: [] },
      ],
    }),
    (error) => error instanceof ProductFamilyGraphValidationError
      && error.code === 'INVALID_PRODUCT_FAMILY_GRAPH'
      && /cycle/i.test(error.message),
  );
});

test('rejects an edge with a dangling product ID', () => {
  assertGraphError(
    () => buildProductFamilyGraph({
      nodes: [brandNode(), productNode(PRODUCT_A_ID, 'Fixture A')],
      edges: [{
        kind: 'VARIANT_OF',
        fromId: PRODUCT_A_ID,
        toId: MISSING_PRODUCT_ID,
        references: [],
      }],
    }),
    /dangling/i,
  );
});

test('rejects inherited relationship-kind aliases in graph edges', () => {
  for (const kind of ['toString', 'constructor', '__proto__']) {
    assertGraphError(
      () => buildProductFamilyGraph({
        nodes: [brandNode(), productNode(PRODUCT_A_ID, 'Fixture A'), platformNode()],
        edges: [{
          kind,
          fromId: PRODUCT_A_ID,
          toId: platformNode().id,
          references: [],
        }],
      }),
      /kind is unsupported/i,
    );
  }
});

test('rejects bare, truncated and non-hex identifier syntax in graph nodes', () => {
  for (const invalidBrandId of [
    'fa_brand_',
    `fa_brand_${'a'.repeat(63)}`,
    `fa_brand_${'z'.repeat(64)}`,
  ]) {
    assertGraphError(
      () => buildProductFamilyGraph({
        nodes: [brandNode({ id: invalidBrandId, brandId: invalidBrandId })],
        edges: [],
      }),
      /G2a brand ID/i,
    );
  }
  for (const invalidProductId of [
    'fa_prod_',
    `fa_prod_${'a'.repeat(23)}`,
    `fa_prod_${'z'.repeat(24)}`,
  ]) {
    assertGraphError(
      () => buildProductFamilyGraph({
        nodes: [brandNode(), productNode(invalidProductId, 'Invalid fixture product')],
        edges: [],
      }),
      /canonical product ID/i,
    );
  }
});

test('rejects duplicate node IDs before they can collapse a graph owner', () => {
  assertGraphError(
    () => buildProductFamilyGraph({
      nodes: [brandNode(), brandNode({ name: 'Duplicate fixture brand' })],
      edges: [],
    }),
    /duplicate node/i,
  );
});

test('rejects a self edge instead of treating it as a product relation', () => {
  assertGraphError(
    () => buildProductFamilyGraph({
      nodes: [brandNode(), productNode(PRODUCT_A_ID, 'Fixture A')],
      edges: [{
        kind: 'VARIANT_OF',
        fromId: PRODUCT_A_ID,
        toId: PRODUCT_A_ID,
        references: [],
      }],
    }),
    /self edge/i,
  );
});

test('rejects duplicate edges even when their candidate references differ', () => {
  assertGraphError(
    () => buildProductFamilyGraph({
      nodes: [
        brandNode(),
        productNode(PRODUCT_A_ID, 'Fixture A'),
        productNode(PRODUCT_B_ID, 'Fixture B'),
      ],
      edges: [
        { kind: 'VARIANT_OF', fromId: PRODUCT_A_ID, toId: PRODUCT_B_ID, references: [] },
        {
          kind: 'VARIANT_OF',
          fromId: PRODUCT_A_ID,
          toId: PRODUCT_B_ID,
          references: [candidateReference()],
        },
      ],
    }),
    /duplicate edge/i,
  );
});

test('rejects a platform relation with a canonical-product endpoint', () => {
  assertGraphError(
    () => buildProductFamilyGraph({
      nodes: [
        brandNode(),
        productNode(PRODUCT_A_ID, 'Fixture A'),
        productNode(PRODUCT_B_ID, 'Fixture B'),
      ],
      edges: [{
        kind: 'HYPOTHESISED_SHARED_PLATFORM',
        fromId: PRODUCT_A_ID,
        toId: PRODUCT_B_ID,
        references: [],
      }],
    }),
    /endpoint/i,
  );
});

test('rejects a relationship across explicit markets', () => {
  const otherMarketPlatform = platformNode({ market: 'NZ' });
  assertGraphError(
    () => buildProductFamilyGraph({
      nodes: [brandNode(), productNode(PRODUCT_A_ID, 'Fixture A'), otherMarketPlatform],
      edges: [{
        kind: 'HYPOTHESISED_SHARED_PLATFORM',
        fromId: PRODUCT_A_ID,
        toId: otherMarketPlatform.id,
        references: [],
      }],
    }),
    /market/i,
  );
});

test('rejects a relationship across brand owners', () => {
  const otherBrandId = OTHER_BRAND_ID;
  const otherBrand = brandNode({
    id: otherBrandId,
    brandId: otherBrandId,
    name: 'Other fixture brand',
  });
  const otherBrandPlatform = platformNode({ brandId: otherBrandId });
  assertGraphError(
    () => buildProductFamilyGraph({
      nodes: [
        brandNode(),
        otherBrand,
        productNode(PRODUCT_A_ID, 'Fixture A'),
        otherBrandPlatform,
      ],
      edges: [{
        kind: 'HYPOTHESISED_SHARED_PLATFORM',
        fromId: PRODUCT_A_ID,
        toId: otherBrandPlatform.id,
        references: [],
      }],
    }),
    /brand owner/i,
  );
});

test('rejects a research group ID that is not bound to its versioned identity payload', () => {
  assertGraphError(
    () => buildProductFamilyGraph({
      nodes: [brandNode(), platformNode({ id: 'fa_product_family_tampered' })],
      edges: [],
    }),
    /identity/i,
  );
});

test('requires each node owner to be present as a same-market brand node', () => {
  assertGraphError(
    () => buildProductFamilyGraph({
      nodes: [productNode(PRODUCT_A_ID, 'Fixture A', { brandId: MISSING_BRAND_ID })],
      edges: [],
    }),
    /brand owner/i,
  );
});

test('rejects a field value payload on a graph node', () => {
  assertGraphError(
    () => buildProductFamilyGraph({
      nodes: [brandNode(), productNode(PRODUCT_A_ID, 'Fixture A', { fieldValue: 600 })],
      edges: [],
    }),
    /unknown key/i,
  );
});

test('rejects an inheritance payload on a graph edge', () => {
  const platform = platformNode();
  assertGraphError(
    () => buildProductFamilyGraph({
      nodes: [brandNode(), productNode(PRODUCT_A_ID, 'Fixture A'), platform],
      edges: [{
        kind: 'HYPOTHESISED_SHARED_PLATFORM',
        fromId: PRODUCT_A_ID,
        toId: platform.id,
        references: [],
        inheritedFields: ['closedEnvelope.widthMm'],
      }],
    }),
    /unknown key/i,
  );
});

test('rejects an authority verdict in a candidate graph reference', () => {
  assertGraphError(
    () => buildProductFamilyGraph({
      nodes: [brandNode({ references: [candidateReference({ authority: 'official' })] })],
      edges: [],
    }),
    /unknown key/i,
  );
});

test('rejects unknown graph input keys before accepting own JSON data', () => {
  const withOwnProto = JSON.parse('{"nodes":[],"edges":[],"__proto__":{"unsafe":true}}');
  assertGraphError(() => buildProductFamilyGraph(withOwnProto), /unknown key/i);
});

test('does not evaluate accessor input while rejecting non-strict JSON', () => {
  let getterRan = false;
  const accessorInput = { edges: [] };
  Object.defineProperty(accessorInput, 'nodes', {
    enumerable: true,
    get() {
      getterRan = true;
      throw new Error('must not run');
    },
  });

  assertGraphError(() => buildProductFamilyGraph(accessorInput), /strict JSON|accessor/i);
  assert.equal(getterRan, false);
});

test('sorts graph records, binds a domain-separated hash and returns detached immutable output', () => {
  const platform = platformNode();
  const input = {
    nodes: [
      productNode(PRODUCT_B_ID, 'Fixture B'),
      platform,
      brandNode(),
      productNode(PRODUCT_A_ID, 'Fixture A'),
    ],
    edges: [
      { kind: 'HYPOTHESISED_SHARED_PLATFORM', fromId: PRODUCT_B_ID, toId: platform.id, references: [] },
      { kind: 'HYPOTHESISED_SHARED_PLATFORM', fromId: PRODUCT_A_ID, toId: platform.id, references: [] },
    ],
  };
  const before = canonicalEvidenceJson(input);

  const result = buildProductFamilyGraph(input);
  const replay = buildProductFamilyGraph({
    nodes: [...input.nodes].reverse(),
    edges: [...input.edges].reverse(),
  });

  assert.equal(canonicalEvidenceJson(input), before);
  assert.deepEqual(result, replay);
  assert.deepEqual(
    result.graph.nodes.map((node) => node.id),
    [BRAND_ID, PRODUCT_A_ID, PRODUCT_B_ID, platform.id].sort(),
  );
  assert.deepEqual(
    result.graph.edges.map((edge) => edge.fromId),
    [PRODUCT_A_ID, PRODUCT_B_ID],
  );
  assert.equal(result.graph.schemaVersion, GRAPH_SCHEMA_VERSION);
  assert.equal(result.graph.graphHashDomain, GRAPH_HASH_DOMAIN);
  assert.equal(result.graph.researchNodeIdDomain, RESEARCH_NODE_ID_DOMAIN);
  assert.equal(
    result.graphSha256,
    createHash('sha256').update(canonicalEvidenceJson({
      canonicalizationVersion: 'fit-evidence-json-v3-1',
      schemaVersion: GRAPH_SCHEMA_VERSION,
      graphHashDomain: GRAPH_HASH_DOMAIN,
      graph: result.graph,
    }), 'utf8').digest('hex'),
  );
  assert.throws(() => result.graph.nodes.push(productNode(PRODUCT_MUTATION_ID, 'Mutation')), TypeError);
  assert.equal(Object.isFrozen(result.graph.edges[0]), true);
});

test('retains a complete-looking asserted platform relation as a non-derivable research candidate', () => {
  const assertion = createProductRelationshipAssertion(relationshipInput());

  assert.equal(assertion.researchStatus, 'research_candidate');
  assert.equal(assertion.derivationEligible, false);
  assert.equal(assertion.semanticPolicySha256, SEMANTICS.semanticPolicySha256);
  assert.equal(assertion.evidence.status, 'unverified_candidate');
  assert.equal(assertion.evidence.references[0].status, 'unverified');
  assert.equal(Object.hasOwn(assertion, 'receipt'), false);
});

test('retains incomplete research with explicit gaps and no derivation eligibility', () => {
  const assertion = createProductRelationshipAssertion(relationshipInput({
    relation: { kind: 'HYPOTHESISED_SHARED_PLATFORM', target: null },
    market: null,
    sharedFields: [],
    contexts: [],
    evidence: { status: 'unverified_candidate', references: [] },
  }));

  assert.equal(assertion.researchStatus, 'research_candidate');
  assert.equal(assertion.derivationEligible, false);
  assert.deepEqual(assertion.gaps, [
    'missing_candidate_references',
    'missing_contexts',
    'missing_market',
    'missing_shared_fields',
    'missing_target',
    'unverified_proof',
  ]);
});

test('rejects wildcard, regex and all-model labels in an exact named-model set', () => {
  for (const model of ['DD60***9', '^DD60.*$', 'all models']) {
    assertRelationshipError(
      () => createProductRelationshipAssertion(relationshipInput({
        namedModels: [{ canonicalProductId: PRODUCT_A_ID, model }],
      })),
      /exact model|wildcard|model set/i,
    );
  }
});

test('rejects a prefix membership object instead of accepting it as finite named models', () => {
  assertRelationshipError(
    () => createProductRelationshipAssertion(relationshipInput({ namedModels: { prefix: 'DD60' } })),
    /namedModels.*array/i,
  );
});

test('rejects bare, truncated and non-hex identifier syntax in named models', () => {
  for (const invalidProductId of [
    'fa_prod_',
    `fa_prod_${'a'.repeat(23)}`,
    `fa_prod_${'z'.repeat(24)}`,
  ]) {
    assertRelationshipError(
      () => createProductRelationshipAssertion(relationshipInput({
        namedModels: [{ canonicalProductId: invalidProductId, model: 'Invalid fixture product' }],
      })),
      /canonical product ID/i,
    );
  }
});

test('rejects a shared field absent from the compiled G1a policy', () => {
  assertRelationshipError(
    () => createProductRelationshipAssertion(relationshipInput({ sharedFields: ['closedEnvelope.notAFieldMm'] })),
    /shared field.*policy/i,
  );
});

test('rejects field values where an assertion may retain only field names', () => {
  assertRelationshipError(
    () => createProductRelationshipAssertion(relationshipInput({
      sharedFields: [{ field: 'closedEnvelope.widthMm', value: 600 }],
    })),
    /sharedFields.*string/i,
  );
});

test('validates contexts with G1a semantics without adding a configuration witness', () => {
  const assertion = createProductRelationshipAssertion(relationshipInput());
  assert.deepEqual(assertion.contexts, [underbenchContext()]);
  assert.equal(Object.hasOwn(assertion, 'witnessedConditions'), false);

  assertRelationshipError(
    () => createProductRelationshipAssertion(relationshipInput({
      contexts: [underbenchContext({
        conditions: [{ parameter: 'installationMode', operator: 'eq', value: 'integrated' }],
      })],
    })),
    /context|configuration/i,
  );
});

test('rejects a target kind that cannot receive the declared relationship', () => {
  assertRelationshipError(
    () => createProductRelationshipAssertion(relationshipInput({
      relation: {
        kind: 'ASSERTED_SHARED_PLATFORM',
        target: { id: PRODUCT_B_ID, kind: 'canonical_product' },
      },
    })),
    /target.*kind/i,
  );
});

test('rejects inherited relationship-kind aliases when no target has been found', () => {
  for (const kind of ['toString', 'constructor', '__proto__']) {
    assertRelationshipError(
      () => createProductRelationshipAssertion(relationshipInput({
        relation: { kind, target: null },
      })),
      /relation kind is unsupported/i,
    );
  }
});

test('rejects forged eligibility and receipt payloads outside the closed research input', () => {
  assertRelationshipError(
    () => createProductRelationshipAssertion(relationshipInput({ derivationEligible: true })),
    /unknown key/i,
  );
  assertRelationshipError(
    () => createProductRelationshipAssertion(relationshipInput({
      evidence: {
        status: 'unverified_candidate',
        references: [],
        receipt: { status: 'verified' },
      },
    })),
    /unknown key/i,
  );
});

test('keeps a candidate-locator hint validation failure typed as an assertion error after delegation', () => {
  assertRelationshipError(
    () => createProductRelationshipAssertion(relationshipInput({
      evidence: {
        status: 'unverified_candidate',
        references: [candidateReference({
          locator: { kind: 'json_pointer', value: 'records/0' },
        })],
      },
    })),
    /JSON Pointer/i,
  );
});

test('requires an untampered G1a policy rather than trusting an asserted policy digest', () => {
  const tamperedSemantics = structuredClone(SEMANTICS);
  tamperedSemantics.semanticPolicy.context.referenceDatums = ['invented'];
  assertRelationshipError(
    () => createProductRelationshipAssertion(relationshipInput({ semantics: tamperedSemantics })),
    /semantics.*SHA-256|semantic policy/i,
  );
});

test('sorts a relationship candidate, binds its semantic identity and freezes a detached result', () => {
  const base = relationshipInput({
    relation: {
      kind: 'HYPOTHESISED_SHARED_PLATFORM',
      target: { id: PLATFORM_TARGET_ID, kind: 'platform' },
    },
    namedModels: [
      { canonicalProductId: PRODUCT_B_ID, model: 'Fixture B' },
      { canonicalProductId: PRODUCT_A_ID, model: 'Fixture A' },
    ],
    sharedFields: ['closedEnvelope.depthMm', 'closedEnvelope.widthMm'],
    contexts: [
      underbenchContext(),
      {
        configurationKey: null,
        conditions: [],
        referenceDatum: 'unknown',
        operatingState: { kind: 'unknown', angleDegrees: null },
      },
    ],
    evidence: {
      status: 'unverified_candidate',
      references: [
        candidateReference({ sourceSha256: 'b'.repeat(64) }),
        candidateReference({ sourceSha256: 'a'.repeat(64) }),
      ],
    },
  });
  const before = canonicalEvidenceJson(base);

  const assertion = createProductRelationshipAssertion(base);
  const replay = createProductRelationshipAssertion({
    ...base,
    namedModels: [...base.namedModels].reverse(),
    sharedFields: [...base.sharedFields].reverse(),
    contexts: [...base.contexts].reverse(),
    evidence: { ...base.evidence, references: [...base.evidence.references].reverse() },
  });

  assert.equal(canonicalEvidenceJson(base), before);
  assert.deepEqual(assertion, replay);
  assert.deepEqual(
    assertion.namedModels.map((model) => model.canonicalProductId),
    [PRODUCT_A_ID, PRODUCT_B_ID],
  );
  assert.deepEqual(assertion.sharedFields, ['closedEnvelope.depthMm', 'closedEnvelope.widthMm']);
  assert.equal(assertion.schemaVersion, ASSERTION_SCHEMA_VERSION);
  assert.equal(assertion.semanticPolicySha256, SEMANTICS.semanticPolicySha256);
  assert.equal(
    assertion.assertionId,
    `fa_product_relationship_${createHash('sha256').update(canonicalEvidenceJson({
      canonicalizationVersion: 'fit-evidence-json-v3-1',
      schemaVersion: ASSERTION_SCHEMA_VERSION,
      assertionIdDomain: ASSERTION_ID_DOMAIN,
      relation: assertion.relation,
      market: assertion.market,
      namedModels: assertion.namedModels,
      sharedFields: assertion.sharedFields,
      contexts: assertion.contexts,
      evidence: assertion.evidence,
      semanticPolicySha256: assertion.semanticPolicySha256,
    }), 'utf8').digest('hex')}`,
  );
  assert.throws(() => assertion.sharedFields.push('closedEnvelope.heightMm'), TypeError);
  assert.equal(Object.isFrozen(assertion.contexts[0]), true);
});
