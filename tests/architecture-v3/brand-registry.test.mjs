import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { canonicalEvidenceJson } from '../../src/shared/canonical-evidence-json.mjs';
import {
  BrandRegistryValidationError,
  buildBrandRegistry,
  resolveBrandAlias,
} from '../../src/domain/architecture-v3/brand-registry.mjs';

const POLICY_SHA256 = 'a'.repeat(64);

function brand(overrides = {}) {
  return {
    stableBrandKey: 'legacy-display:alpha',
    displayName: 'Alpha',
    observedSpellings: ['Alpha'],
    aliases: [],
    researchAliases: [],
    parentGroup: null,
    ...overrides,
  };
}

function policyRef(overrides = {}) {
  return {
    brandStableKey: 'legacy-display:alpha',
    policyPath: 'data/architecture-v2/policies/manufacturer-source-policy.json',
    policySchemaVersion: 1,
    policyVersion: '2026-07-21.1',
    policySha256: POLICY_SHA256,
    brandPointer: '/brands/alpha',
    ...overrides,
  };
}

function buildFixture(overrides = {}) {
  return buildBrandRegistry({
    market: 'AU',
    brands: [brand()],
    officialHostPolicyRefs: [],
    ...overrides,
  });
}

function brandByKey(registry, stableBrandKey) {
  return registry.brands.find((candidate) => candidate.stableBrandKey === stableBrandKey);
}

function assertValidationError(operation, pattern) {
  assert.throws(operation, (error) => (
    error instanceof BrandRegistryValidationError
      && error.code === 'INVALID_BRAND_REGISTRY'
      && pattern.test(error.message)
  ));
}

function outputKeys(value, keys = []) {
  if (Array.isArray(value)) {
    for (const child of value) outputKeys(child, keys);
    return keys;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      keys.push(key);
      outputKeys(value[key], keys);
    }
  }
  return keys;
}

function readRepositoryJson(relativePath) {
  return JSON.parse(readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8'));
}

function rawSha256(relativePath) {
  return createHash('sha256')
    .update(readFileSync(new URL(`../../${relativePath}`, import.meta.url)))
    .digest('hex');
}

test('derives each brand ID from the versioned V3 identity payload', () => {
  const { registry } = buildFixture();
  const expectedIdentity = {
    canonicalizationVersion: 'fit-evidence-json-v3-1',
    schemaVersion: 1,
    brandIdDomain: 'fitappliance.brand-registry.id.v1',
    market: 'AU',
    stableBrandKey: 'legacy-display:alpha',
  };
  const expectedBrandId = `fa_brand_${createHash('sha256')
    .update(canonicalEvidenceJson(expectedIdentity), 'utf8')
    .digest('hex')}`;

  assert.equal(registry.brands[0].brandId, expectedBrandId);
});

test('resolves a same-market case and whitespace alias without treating punctuation-stripped research text as an identity', () => {
  const { registry } = buildBrandRegistry({
    market: 'AU',
    brands: [{
      stableBrandKey: 'legacy-display:fisher-&-paykel',
      displayName: 'Fisher & Paykel',
      observedSpellings: ['Fisher & Paykel'],
      aliases: ['  FISHER   & PAYKEL  '],
      researchAliases: ['Fisher Paykel'],
    }],
    officialHostPolicyRefs: [],
  });

  const brandId = registry.brands[0].brandId;
  assert.deepEqual(
    resolveBrandAlias({ registry, market: 'AU', alias: 'fisher & paykel' }),
    { status: 'resolved', brandId },
  );
  assert.deepEqual(
    resolveBrandAlias({ registry, market: 'AU', alias: 'Fisher Paykel' }),
    { status: 'unknown' },
  );
  assert.deepEqual(
    resolveBrandAlias({ registry, market: 'NZ', alias: 'Fisher & Paykel' }),
    { status: 'unknown' },
  );
});

test('preserves punctuation and diacritics in market-scoped identity lookups', () => {
  const { registry } = buildBrandRegistry({
    market: 'AU',
    brands: [{
      stableBrandKey: 'legacy-display:de’longhi',
      displayName: 'De’Longhi',
      observedSpellings: ['De’Longhi'],
      aliases: ['CAFÉ'],
      researchAliases: ['DeLonghi'],
      parentGroup: null,
    }],
    officialHostPolicyRefs: [],
  });
  const brandId = registry.brands[0].brandId;

  assert.deepEqual(
    resolveBrandAlias({ registry, market: 'AU', alias: '  de’longhi  ' }),
    { status: 'resolved', brandId },
  );
  assert.deepEqual(
    resolveBrandAlias({ registry, market: 'AU', alias: 'café' }),
    { status: 'resolved', brandId },
  );
  assert.deepEqual(
    resolveBrandAlias({ registry, market: 'AU', alias: 'DeLonghi' }),
    { status: 'unknown' },
  );
  assert.deepEqual(
    resolveBrandAlias({ registry, market: 'AU', alias: 'CAFE' }),
    { status: 'unknown' },
  );
});

test('rejects a same-market normalized alias collision instead of selecting a brand by input order', () => {
  const north = brand({
    stableBrandKey: 'legacy-display:north-star',
    displayName: 'North Star',
    observedSpellings: ['North Star'],
    aliases: ['Shared Brand'],
  });
  const south = brand({
    stableBrandKey: 'legacy-display:south-star',
    displayName: 'South Star',
    observedSpellings: ['South Star'],
    aliases: ['  shared   brand  '],
  });

  for (const brands of [[north, south], [south, north]]) {
    assertValidationError(
      () => buildFixture({ brands }),
      /alias collision.*shared brand/i,
    );
  }
});

test('keeps semantic brand names distinct without an explicit alias', () => {
  const mitsubishi = brand({
    stableBrandKey: 'legacy-display:mitsubishi',
    displayName: 'Mitsubishi',
    observedSpellings: ['Mitsubishi'],
  });
  const electric = brand({
    stableBrandKey: 'legacy-display:mitsubishi-electric',
    displayName: 'Mitsubishi Electric',
    observedSpellings: ['Mitsubishi Electric'],
  });
  const { registry } = buildFixture({ brands: [electric, mitsubishi] });

  const mitsubishiId = brandByKey(registry, mitsubishi.stableBrandKey).brandId;
  const electricId = brandByKey(registry, electric.stableBrandKey).brandId;
  assert.notEqual(mitsubishiId, electricId);
  assert.deepEqual(
    resolveBrandAlias({ registry, market: 'AU', alias: 'Mitsubishi' }),
    { status: 'resolved', brandId: mitsubishiId },
  );
  assert.deepEqual(
    resolveBrandAlias({ registry, market: 'AU', alias: 'Mitsubishi Electric' }),
    { status: 'resolved', brandId: electricId },
  );
  assert.deepEqual(
    resolveBrandAlias({ registry, market: 'AU', alias: 'MitsubishiElectric' }),
    { status: 'unknown' },
  );
});

test('retains parent text as research metadata and never copies a parent policy reference to its child', () => {
  const parent = brand({
    stableBrandKey: 'legacy-display:parent-co',
    displayName: 'Parent Co',
    observedSpellings: ['Parent Co'],
  });
  const child = brand({
    stableBrandKey: 'legacy-display:child-co',
    displayName: 'Child Co',
    observedSpellings: ['Child Co'],
    parentGroup: 'Parent Co research label',
  });
  const { registry } = buildFixture({
    brands: [child, parent],
    officialHostPolicyRefs: [policyRef({
      brandStableKey: parent.stableBrandKey,
      brandPointer: '/brands/parentco',
    })],
  });

  const parentId = brandByKey(registry, parent.stableBrandKey).brandId;
  const childRecord = brandByKey(registry, child.stableBrandKey);
  assert.equal(childRecord.parentGroup, 'Parent Co research label');
  assert.equal(
    registry.officialHostPolicyRefs.some((reference) => reference.brandId === childRecord.brandId),
    false,
  );
  assert.deepEqual(registry.officialHostPolicyRefs, [{
    brandId: parentId,
    policyPath: 'data/architecture-v2/policies/manufacturer-source-policy.json',
    policySchemaVersion: 1,
    policyVersion: '2026-07-21.1',
    policySha256: POLICY_SHA256,
    brandPointer: '/brands/parentco',
  }]);
});

test('keeps IDs stable across aliases and policy references while making the registry hash input-complete', () => {
  const baseBrand = brand({
    stableBrandKey: 'legacy-display:alpha',
    displayName: 'Alpha',
    observedSpellings: ['Alpha'],
  });
  const base = buildFixture({ brands: [baseBrand] });
  const expanded = buildFixture({
    brands: [brand({
      ...baseBrand,
      aliases: ['ALPHA APPLIANCES'],
      researchAliases: ['Alpha Appliances Pty Ltd'],
    })],
    officialHostPolicyRefs: [policyRef()],
  });

  assert.equal(base.registry.brands[0].brandId, expanded.registry.brands[0].brandId);
  assert.notEqual(base.registrySha256, expanded.registrySha256);
  assert.equal(
    expanded.registrySha256,
    createHash('sha256').update(canonicalEvidenceJson(expanded.registry), 'utf8').digest('hex'),
  );
});

test('sorts set-like seed inputs so permutations and repeats produce identical snapshots', () => {
  const alpha = brand({
    stableBrandKey: 'legacy-display:alpha',
    displayName: 'Alpha',
    observedSpellings: ['ALPHA', 'Alpha'],
    aliases: ['Alpha Appliances', 'A Appliances'],
    researchAliases: ['Alpha Research', 'A Research'],
  });
  const beta = brand({
    stableBrandKey: 'legacy-display:beta',
    displayName: 'Beta',
    observedSpellings: ['Beta'],
    aliases: ['Beta Appliances'],
    researchAliases: [],
  });
  const alphaRef = policyRef();
  const betaRef = policyRef({
    brandStableKey: beta.stableBrandKey,
    brandPointer: '/brands/beta',
  });

  const first = buildFixture({
    brands: [alpha, beta],
    officialHostPolicyRefs: [alphaRef, betaRef],
  });
  const second = buildFixture({
    brands: [
      { ...beta, aliases: [...beta.aliases].reverse() },
      {
        ...alpha,
        observedSpellings: [...alpha.observedSpellings].reverse(),
        aliases: [...alpha.aliases].reverse(),
        researchAliases: [...alpha.researchAliases].reverse(),
      },
    ],
    officialHostPolicyRefs: [betaRef, alphaRef],
  });
  const repeated = buildFixture({
    brands: [alpha, beta],
    officialHostPolicyRefs: [alphaRef, betaRef],
  });

  assert.deepEqual(second, first);
  assert.deepEqual(repeated, first);
});

test('does not mutate inputs and rejects accessors, symbol keys, prototype data and unknown reference authority fields', () => {
  const input = {
    market: 'AU',
    brands: [brand({ observedSpellings: ['Alpha', 'ALPHA'] })],
    officialHostPolicyRefs: [],
  };
  const before = canonicalEvidenceJson(input);
  const result = buildBrandRegistry(input);
  assert.equal(canonicalEvidenceJson(input), before);
  assert.notStrictEqual(result.registry.brands[0].observedSpellings, input.brands[0].observedSpellings);

  let getterRan = false;
  const accessorInput = {};
  Object.defineProperty(accessorInput, 'market', {
    enumerable: true,
    get() {
      getterRan = true;
      throw new Error('must not run');
    },
  });
  assertValidationError(() => buildBrandRegistry(accessorInput), /accessor/i);
  assert.equal(getterRan, false);

  const symbolInput = { market: 'AU', brands: [], officialHostPolicyRefs: [] };
  symbolInput[Symbol('unsafe')] = true;
  assertValidationError(() => buildBrandRegistry(symbolInput), /symbol/i);

  const prototypeInput = JSON.parse('{"market":"AU","brands":[],"officialHostPolicyRefs":[],"__proto__":{"unsafe":true}}');
  assertValidationError(() => buildBrandRegistry(prototypeInput), /unknown key/i);

  assertValidationError(
    () => buildFixture({ officialHostPolicyRefs: [policyRef({ hosts: ['not-permitted.example'] })] }),
    /unknown key/i,
  );
});

test('does not output host, source-authority, product, document, field or value bindings', () => {
  const { registry } = buildFixture({ officialHostPolicyRefs: [policyRef()] });
  const forbiddenKeys = new Set([
    'host', 'hosts', 'source', 'sourceAuthority', 'product', 'document', 'field', 'value',
  ]);

  assert.deepEqual(outputKeys(registry).filter((key) => forbiddenKeys.has(key)), []);
});

test('rejects policy descendants instead of treating a host-row pointer as a brand binding', () => {
  assertValidationError(
    () => buildFixture({
      officialHostPolicyRefs: [policyRef({ brandPointer: '/brands/alpha/0' })],
    }),
    /brandPointer.*one policy brand entry/i,
  );
});

test('rejects malformed JSON Pointer escapes in otherwise single-entry policy pointers', () => {
  assertValidationError(
    () => buildFixture({
      officialHostPolicyRefs: [policyRef({ brandPointer: '/brands/alpha~2' })],
    }),
    /brandPointer.*JSON Pointer escape/i,
  );
});

test('permits valid JSON Pointer escapes in a single-entry policy pointer', () => {
  for (const brandPointer of ['/brands/alpha~0', '/brands/alpha~1']) {
    assert.doesNotThrow(() => buildFixture({
      officialHostPolicyRefs: [policyRef({ brandPointer })],
    }));
  }
});

test('replays the AU seed into a source-bound, policy-reference-only snapshot', () => {
  const input = readRepositoryJson('data/architecture-v3/policies/brand-registry-input.json');
  const snapshot = readRepositoryJson('data/architecture-v3/generated/brand-registry.json');
  const brandCanon = readRepositoryJson('data/brand-canon.json');
  const canonicalRegistry = readRepositoryJson('data/architecture-v2/generated/canonical-registry.json');
  const sourcePolicy = readRepositoryJson('data/architecture-v2/policies/manufacturer-source-policy.json');
  const rawBrands = [...new Set(canonicalRegistry.products.map((product) => product.brand))].sort();
  const observedSpellings = input.brands.flatMap((candidate) => candidate.observedSpellings).sort();
  const expectedSources = [
    {
      path: 'data/architecture-v2/generated/canonical-registry.json',
      rawSha256: '2459a3a6254c336c875a1fc8d5e070d0271175dd08786bba6477b94ef410336f',
      role: 'observed_raw_brand_spellings',
    },
    {
      path: 'data/architecture-v2/policies/manufacturer-source-policy.json',
      policySchemaVersion: 1,
      policyVersion: '2026-07-21.1',
      rawSha256: '35e35b0bda7b5df46b3044e25404e30fd512141e4b29a66aa9d43ae6e9ff3db1',
      role: 'official_host_policy_references',
    },
    {
      path: 'data/brand-canon.json',
      rawSha256: 'fc78352526e25ed6288b6f6f157f1598e1e2c24759b680e75154f33a776ce5b6',
      role: 'case_only_display_spelling_selection',
    },
  ];

  assert.equal(input.schemaVersion, 1);
  assert.equal(input.inputVersion, 'fitappliance-brand-registry-input-v1');
  assert.equal(input.canonicalizationVersion, 'fit-evidence-json-v3-1');
  assert.equal(input.market, 'AU');
  assert.deepEqual(input.sourceInputs, expectedSources);
  for (const source of input.sourceInputs) {
    assert.equal(rawSha256(source.path), source.rawSha256);
  }

  assert.equal(input.brands.length, 152);
  assert.equal(observedSpellings.length, 157);
  assert.deepEqual(observedSpellings, rawBrands);
  for (const brand of input.brands) {
    const observedKeys = new Set(brand.observedSpellings
      .map((spelling) => spelling.trim().replace(/\s+/gu, ' ').toLowerCase()));
    assert.equal(observedKeys.size, 1);
    const [observedKey] = observedKeys;
    assert.equal(brand.displayName.trim().replace(/\s+/gu, ' ').toLowerCase(), observedKey);
    assert.equal(brand.stableBrandKey, `legacy-display:${observedKey}`);
  }
  assert.deepEqual(input.brands.map((candidate) => candidate.aliases).flat(), []);
  assert.deepEqual(input.brands.map((candidate) => candidate.researchAliases).flat(), []);
  assert.deepEqual(new Set(input.brands.map((candidate) => candidate.parentGroup)), new Set([null]));

  const nonCaseOnlyCanonAliases = Object.entries(brandCanon.policies.alias_map)
    .filter(([source, target]) => source.trim().replace(/\s+/gu, ' ').toLowerCase()
      !== target.trim().replace(/\s+/gu, ' ').toLowerCase());
  assert.deepEqual(nonCaseOnlyCanonAliases, []);

  assert.equal(input.officialHostPolicyRefs.length, 26);
  const sourcePolicyPath = 'data/architecture-v2/policies/manufacturer-source-policy.json';
  const sourcePolicySha256 = rawSha256(sourcePolicyPath);
  const pointedPolicyKeys = input.officialHostPolicyRefs
    .map((reference) => reference.brandPointer.slice('/brands/'.length))
    .sort();
  assert.deepEqual(pointedPolicyKeys, Object.keys(sourcePolicy.brands).sort());
  for (const reference of input.officialHostPolicyRefs) {
    const policyKey = reference.brandPointer.slice('/brands/'.length);
    assert.match(reference.brandPointer, /^\/brands\/[^/]+$/u);
    assert.equal(Object.hasOwn(sourcePolicy.brands, policyKey), true);
    assert.equal(reference.policyPath, sourcePolicyPath);
    assert.equal(reference.policySchemaVersion, sourcePolicy.schemaVersion);
    assert.equal(reference.policyVersion, sourcePolicy.policyVersion);
    assert.equal(reference.policySha256, sourcePolicySha256);
    const matchingStableKeys = input.brands
      .filter((brand) => brand.stableBrandKey.startsWith('legacy-display:')
        && brand.stableBrandKey.slice('legacy-display:'.length)
          .toLowerCase().replace(/[^a-z0-9]/gu, '') === policyKey)
      .map((brand) => brand.stableBrandKey);
    assert.deepEqual(matchingStableKeys, [reference.brandStableKey]);
  }

  const built = buildBrandRegistry({
    brands: input.brands,
    officialHostPolicyRefs: input.officialHostPolicyRefs,
    market: input.market,
  });
  assert.deepEqual(snapshot, built);
  assert.deepEqual(
    rawBrands.filter((alias) => resolveBrandAlias({
      registry: snapshot.registry,
      market: 'AU',
      alias,
    }).status !== 'resolved'),
    [],
  );
});

test('keeps external registry validation stricter than build-time brand normalization', () => {
  const inputBrand = brand();
  delete inputBrand.parentGroup;
  const { registry } = buildFixture({ brands: [inputBrand] });
  assert.equal(registry.brands[0].parentGroup, null);

  const missingParentGroup = structuredClone(registry);
  delete missingParentGroup.brands[0].parentGroup;
  assertValidationError(
    () => resolveBrandAlias({ registry: missingParentGroup, market: 'AU', alias: 'Alpha' }),
    /missing key: parentGroup/i,
  );

  const unsortedObservedSpellings = structuredClone(registry);
  unsortedObservedSpellings.brands[0].observedSpellings = ['Zulu', 'Alpha'];
  assertValidationError(
    () => resolveBrandAlias({ registry: unsortedObservedSpellings, market: 'AU', alias: 'Alpha' }),
    /set-like arrays must be sorted/i,
  );
});

test('fails closed for malformed registry IDs and returns ambiguity only for a collision-bearing external registry', () => {
  const alpha = brand({
    stableBrandKey: 'legacy-display:alpha',
    displayName: 'Alpha',
    observedSpellings: ['Alpha'],
  });
  const beta = brand({
    stableBrandKey: 'legacy-display:beta',
    displayName: 'Beta',
    observedSpellings: ['Beta'],
  });
  const { registry } = buildFixture({ brands: [alpha, beta] });

  const badId = structuredClone(registry);
  badId.brands[0].brandId = 'brand_tampered';
  assertValidationError(
    () => resolveBrandAlias({ registry: badId, market: 'AU', alias: 'Alpha' }),
    /brand ID/i,
  );

  const collision = structuredClone(registry);
  const alphaId = brandByKey(collision, alpha.stableBrandKey).brandId;
  const betaId = brandByKey(collision, beta.stableBrandKey).brandId;
  brandByKey(collision, beta.stableBrandKey).aliases = ['Alpha'];
  assert.deepEqual(
    resolveBrandAlias({ registry: collision, market: 'AU', alias: 'Alpha' }),
    { status: 'ambiguous', brandIds: [alphaId, betaId].sort() },
  );
  assert.deepEqual(
    resolveBrandAlias({ registry: collision, market: 'AU', alias: 'Beta' }),
    { status: 'unknown' },
  );
});
