# FitAppliance Architecture V3 Evidence Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic brand, product-family, document-family and engineering-semantics foundation that carries each accepted appliance field from immutable source evidence to a receipt-bound exact-product projection without weakening Fit safety.

**Architecture:** Add small, pure Architecture V3 domain modules and versioned JSON overlays around the working Architecture V2 evidence pipeline. Compile existing field/rights contracts instead of duplicating them, run new registries, source bindings, claim envelopes, receipts, adjudication, evidence-readiness and Fit V4 in shadow, then feed only reviewed fields into the existing release control plane after replay, parity, determinism and publication gates pass.

**Tech Stack:** Node.js ESM, built-in `node:test`, SHA-256 content addressing, canonical JSON, existing MinerU `content_list_v2`, static JSON projections, vanilla browser ES modules.

**Spec:** [`../specs/2026-09-13-architecture-v3-evidence-foundation-design.md`](../specs/2026-09-13-architecture-v3-evidence-foundation-design.md)

## Global Constraints

- Existing immutable source, PDF, MinerU, OCR and receipt objects are never rewritten or deleted by migration code.
- Unknown values remain `null` or an explicit `UNKNOWN`/`unknown` state; missing values are never converted to zero.
- Product-family membership alone never authorises a field claim for another SKU.
- Parent-group membership never expands a brand's official-host allowlist.
- Filename, URL, retailer text and model-prefix matches are discovery hints, not publication evidence.
- OCR, MinerU, vision and LLM outputs are derived candidate artifacts, never source authority.
- Axis assignment requires an explicit label, ordered legend, table header or diagram anchor from the evidence fragment.
- Unit conversion requires an explicit source unit and stores both source and canonical values.
- `capacity.netLitres` and compartment capacity are not physical-envelope dimensions and cannot participate in cavity Fit arithmetic.
- A claim receipt binds the claim ID, exact subject, source artifact hash, derived artifact hash when used, fragment hash, locator, policy version and toolchain version.
- Source authority and reuse rights come from an authority-specific replay-valid source binding, never a claim/parser-provided tier.
- An unresolved same-field conflict quarantines that field; it cannot be hidden by last-write-wins.
- Dimensions-only evidence may power size filtering and can prove `NO_FIT` when a known hard dimension exceeds the cavity, but it cannot produce `VERIFIED_FIT`.
- Product evidence may be called `FIT_READY`; `VERIFIED_FIT` is reserved for a runtime evaluation with receipt-bound product evidence and required user measurements.
- Replacement and cavity-fit projections remain separate consumers.
- Search results keep `sizeMatch` separate from runtime `fitDecisionV4`; replacement consumes neither Fit evidence readiness nor Fit V4.
- Every new projection is shadow-only until old/new comparison, full tests, publication audit and deterministic second-run checks pass.
- No new runtime database, vector store or online model dependency is added in this programme.
- Architecture V3 extends the current retail release candidate, active-release pointer and rollback path; it never becomes a parallel publisher.
- `doc-audit: ignore` appears only on paths and commands that the plan deliberately creates later; remove each marker in the same implementation PR that makes its target real.

---

## Execution contract

Read the spec and `docs/product-core-brief.md` before each implementation PR.
Each task below is a review gate and should normally be one PR. Do not combine a
schema introduction, historical backfill and public cutover.

Before Task 1, record a clean baseline from the implementation worktree:

```bash
git fetch origin
git status --short --branch
npm install
npm test
npm run audit:fit-publication
```

Expected baseline: clean feature worktree, all tests pass, and the publication
audit reports zero violations. Existing dependency-audit findings are recorded
but are outside this programme unless a changed package introduces a new one.

If any task exposes an ambiguous product relationship, axis, measurement scope
or source applicability, stop that task and ask the owner which exact claim the
user should be allowed to rely on. Do not encode a guess as policy.

## Delivery map

| Task | Implementation PR | Depends on | Public effect |
| --- | --- | --- | --- |
| 1 | semantic registry | none | none |
| 2 | brand registry | 1 | none |
| 3 | product-family graph | 2 | none |
| 4 | document-family registry | 1, 2 | none |
| 5 | artifact lineage | 4 | none |
| 6 | extraction router | 4, 5 | none |
| 7 | Claim V3 envelope | 1, 5 | none |
| 8 | source bindings, claim receipts and decisions | 7 | none |
| 9 | finite-model derivation | 3, 7, 8 | none |
| 10 | deterministic adjudication | 7, 8, 9 | none |
| 11 | profile readiness and Fit V4 | 1, 10 | shadow only |
| 12 | whole-chain shadow build and audit | 2-11 | shadow only |
| 13 | real document-profile canaries | 4-12 | bounded candidate data only |
| 14 | existing release-control integration | 12, 13 | bounded release candidate |
| 15 | evidence drawer and fit copy | 14 | staged UI flag |

## File responsibility map

### New domain modules

| File | Single responsibility |
| --- | --- |
| `src/domain/geometry-installation-semantics.mjs` | Compile the existing field/rights contract with a narrow V3 overlay and validate source representation/applicability |
| `src/domain/brand-registry.mjs` | Build and query canonical AU brand records without granting source authority |
| `src/domain/product-family-graph.mjs` | Validate evidence-backed product relationship nodes and edges |
| `src/domain/document-family-registry.mjs` | Validate structural extraction profiles and select exactly one profile |
| `src/domain/evidence-artifact-lineage.mjs` | Validate source-to-derived-to-fragment hash lineage |
| `src/domain/document-extraction-router.mjs` | Execute a selected profile and emit candidates only |
| `src/domain/evidence-claim-v3.mjs` | Create and replay immutable exact-subject claim IDs |
| `src/domain/evidence-source-binding.mjs` | Adapt authority-specific source verifiers into one trusted binding contract |
| `src/domain/evidence-claim-receipt.mjs` | Bind one Claim V3 to a verified source or finite-relationship derivation |
| `src/domain/evidence-claim-decision.mjs` | Create immutable review/adjudication decision events |
| `src/domain/product-family-claim-derivation.mjs` | Materialise a field claim for one exact target through a verified finite relation |
| `src/domain/evidence-adjudication-v3.mjs` | Select, corroborate or quarantine receipt-valid claims deterministically |
| `src/domain/evidence-readiness.mjs` | Compute product evidence readiness without computing Fit |
| `src/shared/fit-v4.js` | Canonical Node/browser Fit V4 implementation and lower-bound-first outcomes |
| `src/domain/fit-v4.mjs` | ESM wrapper for the shared Fit V4 implementation |
| `src/domain/architecture-v3-evidence-overlay.mjs` | Project reviewed V3 evidence into separate current and historical lanes without owning publication |

### New policies and generated artifacts

| File | Responsibility |
| --- | --- |
| `data/architecture-v3/policies/geometry-installation-semantics-overlay.json` | V3-only aliases, units, additions and evaluation-profile requirements |
| `data/architecture-v3/policies/brand-relationships.json` | Market aliases and informational parent groups |
| `data/architecture-v3/policies/product-family-relationships.json` | Reviewed/official family relationship inputs |
| `data/architecture-v3/policies/document-family-profiles.json` | Versioned structural selectors and extractor chains |
| `data/architecture-v3/policies/evidence-claim-policy.json` | Claim and receipt schema/policy versions |
| `data/architecture-v3/policies/evidence-arbitration-policy.json` | Authority ordering and explicit resolution rules |
| `data/architecture-v3/policies/document-profile-canaries.json` | Hash-bound positive and negative profile witnesses |
| `data/architecture-v3/generated/brand-registry.json` | Deterministic brand read model |
| `data/architecture-v3/generated/product-family-graph.json` | Deterministic relationship graph |
| `data/architecture-v3/generated/document-family-registry.json` | Deterministic parser-profile read model |
| `data/architecture-v3/generated/geometry-installation-semantics.json` | Compiled field/rights/requirement read model |
| `data/architecture-v3/reviews/automated/evidence-foundation-shadow.json` | Old/new counts, differences and safety violations |

### New scripts and tests

Scripts live in `scripts/architecture-v3/`; focused tests live in
`tests/architecture-v3/`. No Architecture V2 file is renamed during shadow
migration.

### Implementation conventions

- Import `canonicalJsonSha256` from
  `src/domain/historical-evidence-recovery-contract.mjs`; do not add another
  canonical hash implementation.
- New domain modules use the repository's local `requiredText`, `exactKeys` and
  recursive `freezeDeep` pattern. These are private functions, not a new shared
  utility package.
- Returned registries and graphs contain only deeply frozen arrays and plain
  objects. `Map` and `Set` may be local builder variables but are never exposed,
  because `Object.freeze(new Map())` does not prevent `.set()`.
- Every builder sorts arrays by stable IDs before hashing and excludes Maps,
  timestamps and output paths from its semantic hash.
- Every validator rejects unknown keys. Schema expansion requires a version
  change and a fixture proving legacy replay.
- Private helper signatures named in a task are part of that task and live in
  the same module unless an existing exported function is named explicitly.

### Task 1: Establish the shared geometry and installation semantics

**Files:**
- Create: `data/architecture-v3/policies/geometry-installation-semantics-overlay.json`
- Create: `data/architecture-v3/generated/geometry-installation-semantics.json`
- Create: `src/domain/geometry-installation-semantics.mjs`
- Create: `scripts/architecture-v3/build-geometry-installation-semantics.mjs` <!-- doc-audit: ignore -->
- Create: `tests/architecture-v3/geometry-installation-semantics.test.mjs` <!-- doc-audit: ignore -->
- Modify: `package.json`
- Modify after the new tests pass: `src/domain/dimension-evidence-claim.mjs`
- Modify after the new tests pass: `src/domain/installation-knowledge-v3.mjs`
- Read only: `data/architecture-v2/policies/product-data-field-rights-dictionary.json`
- Test: `tests/architecture-v2/dimension-evidence-claim.test.mjs`
- Test: `tests/architecture-v2/installation-knowledge-fit-v3.test.mjs`

**Interfaces:**
- Consumes: `{ fieldRightsDictionary, installationMatrix, overlay }`; the V2
  dictionary remains authoritative for field identity, base scope, Fit role,
  required evidence and action-scoped rights.
- Produces: `buildGeometryAndInstallationSemantics(input) -> frozen registry`,
  `verifyGeometryAndInstallationSemantics(registry, input) -> true`,
  `resolveCanonicalFieldPath(registry, field) -> string`,
  `getFieldDefinition(registry, field) -> FieldDefinition`,
  `getRequirementPlan(registry, { category, formFactor, evaluationProfile,
  valuesByField }) -> { requiredFields, alternativeGroups }`, and
  `validateSemanticValue(registry, input) -> normalized input`.
- `FieldDefinition` is `{ field, baseFieldId, valueType, canonicalUnit,
  canonicalPrecision, allowedSourceUnits, axis, measurementScope, allowZero,
  allowedInclusions, allowedApplicability, fitRole, requiredEvidence }`.
- The overlay may add fields or refine units/requirements, but cannot change an
  existing base field's axis, scope, Fit role or rights action definitions.

- [ ] **Step 1: Write failing compilation and semantic-boundary tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGeometryAndInstallationSemantics,
  getFieldDefinition,
  getRequirementPlan,
  resolveCanonicalFieldPath,
  validateSemanticValue,
} from '../../src/domain/geometry-installation-semantics.mjs';

test('existing field semantics and rights have one authoritative base', () => {
  const registry = buildGeometryAndInstallationSemantics(fixture());
  const width = getFieldDefinition(registry, 'closedEnvelope.widthMm');
  assert.equal(width.baseFieldId, 'closedEnvelope.widthMm');
  assert.equal(width.axis, 'width');
  assert.deepEqual(registry.rights.actions, fixture().fieldRightsDictionary.rights.actions);
  assert.equal(registry.fields.filter((field) => field.field === width.field).length, 1);
});

test('capacity is separate and compatibility aliases are exact', () => {
  const registry = buildGeometryAndInstallationSemantics(fixture());
  assert.equal(getFieldDefinition(registry, 'capacity.netLitres').fitRole, 'none');
  assert.equal(getFieldDefinition(registry, 'closedEnvelope.widthMm').fitRole, 'hard');
  assert.equal(resolveCanonicalFieldPath(registry, 'installationClearance.rearMm'), 'installation.rearMm');
  assert.equal(resolveCanonicalFieldPath(registry, 'operationEnvelope.doorOpenDepthMm'), 'operation.doorOpenDepthMm');
  assert.throws(() => resolveCanonicalFieldPath(registry, 'operationEnvelope.unknownMm'), /unsupported/);
});

test('power voltage is an alternative group, not a claim field', () => {
  const registry = buildGeometryAndInstallationSemantics(fixture());
  assert.throws(() => getFieldDefinition(registry, 'powerConnection.voltage'), /unsupported/);
  const plan = getRequirementPlan(registry, {
    category: 'dishwasher', formFactor: 'built_in', evaluationProfile: 'services',
    valuesByField: { 'powerConnection.required': true },
  });
  assert.deepEqual(plan.alternativeGroups.find((group) => group.id === 'powerConnection.voltage'), {
    id: 'powerConnection.voltage',
    alternatives: [
      ['powerConnection.voltageV'],
      ['powerConnection.minimumVoltageV', 'powerConnection.maximumVoltageV'],
    ],
  });
});

test('source unit, axis, decimal precision and zero follow field policy', () => {
  const registry = buildGeometryAndInstallationSemantics(fixture());
  assert.deepEqual(validateSemanticValue(registry, {
    field: 'closedEnvelope.widthMm', value: 59.8, sourceUnit: 'cm',
    sourceAxis: 'width', measurementScope: 'product_closed_external',
    inclusions: ['body', 'door'], applicability: 'required',
  }).canonicalValue, 598);
  assert.throws(() => validateSemanticValue(registry, {
    field: 'closedEnvelope.widthMm', value: 598, sourceUnit: null,
    sourceAxis: 'width', measurementScope: 'product_closed_external',
    inclusions: ['body'], applicability: 'required',
  }), /source unit/);
  assert.throws(() => validateSemanticValue(registry, {
    field: 'closedEnvelope.widthMm', value: 0, sourceUnit: 'mm',
    sourceAxis: 'width', measurementScope: 'product_closed_external',
    inclusions: ['body'], applicability: 'required',
  }), /zero/);
  assert.equal(validateSemanticValue(registry, {
    field: 'ventilation.minimumRoomVolumeM3', value: 1.25, sourceUnit: 'm3',
    sourceAxis: null, measurementScope: 'minimum_room_volume', inclusions: [],
    applicability: 'required',
  }).canonicalValue, 1.25);
});
```

- [ ] **Step 2: Run the focused test and verify the missing module fails**

Run: `node --test tests/architecture-v3/geometry-installation-semantics.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for
`geometry-installation-semantics.mjs`.

- [ ] **Step 3: Add the overlay, compiler and strict validator**

Compile every field currently present in the V2 field/rights dictionary and
`INSTALLATION_KNOWLEDGE_FIELDS`. Use the current runtime paths
`installation.*`, `operation.*`, `service.*` and `delivery.*` as canonical. Add
`productBody.*`, `cavityOpening.*` and the five explicit capacity fields only in
the overlay. Preserve the base dictionary's complete `rights` object and reject
an overlay that changes it.

Compatibility aliases are an exact-key object, never prefix replacement. Map
the five installation clearances, three named operation fields and delivery
fields individually. Keep ambiguous legacy `operationEnvelope.depthMm`
review-only until evidence proves that it means `doorOpenDepthMm`. Encode
`powerConnection.voltage` as an alternative requirement group, never as a
claim field. Requirements are grouped by `cavity_placement`, `operation`,
`services`, `delivery` and `full_installation`; delivery is not part of cavity
placement. Use these exact normalisation rules:

```js
const UNITS = Object.freeze({ mm: 1, cm: 10, m: 1000, L: 1, kPa: 1, V: 1, A: 1, kg: 1, mm2: 1, m3: 1 });
const APPLICABILITY = new Set(['required', 'optional', 'not_applicable', 'unknown']);

export function getFieldDefinition(registry, field) {
  const canonicalField = resolveCanonicalFieldPath(registry, field);
  const result = registry.fieldsByPath[canonicalField];
  if (!result) throw new TypeError(`unsupported semantic field: ${field}`);
  return result;
}

export function resolveCanonicalFieldPath(registry, field) {
  const path = String(field);
  const result = registry.fieldsByPath[path] ? path : registry.legacyPathAliases[path];
  if (!result) throw new TypeError(`unsupported semantic field: ${path}`);
  return result;
}

export function validateSemanticValue(registry, input) {
  const definition = getFieldDefinition(registry, input?.field);
  const field = resolveCanonicalFieldPath(registry, input?.field);
  if (!APPLICABILITY.has(input?.applicability)) throw new TypeError('applicability invalid');
  if (input.applicability === 'unknown') {
    if (input.value != null) throw new TypeError('unknown field cannot carry a value');
    return Object.freeze({ ...input, field, canonicalValue: null, canonicalUnit: definition.canonicalUnit });
  }
  if (input.applicability === 'not_applicable') {
    if (input.value != null || input.sourceUnit != null) throw new TypeError('not-applicable field cannot carry a value');
    return Object.freeze({ ...input, field, canonicalValue: null, canonicalUnit: null });
  }
  if (definition.valueType === 'boolean') {
    if (typeof input.value !== 'boolean' || input.sourceUnit != null) throw new TypeError('boolean value requires a null unit');
    return Object.freeze({ ...input, field, canonicalValue: input.value, canonicalUnit: null });
  }
  if (!definition.allowedSourceUnits.includes(input?.sourceUnit)
      || !Object.hasOwn(UNITS, input?.sourceUnit)) throw new TypeError('explicit source unit required');
  if (definition.axis !== null && input.sourceAxis !== definition.axis) throw new TypeError('source axis mismatch');
  if (input.measurementScope !== definition.measurementScope) throw new TypeError('measurement scope mismatch');
  const rangeInput = input.value && typeof input.value === 'object';
  if (rangeInput && !['range', 'number_or_range'].includes(definition.valueType)) throw new TypeError('range not allowed for field');
  if (!rangeInput && definition.valueType === 'range') throw new TypeError('range required for field');
  const convert = (value) => normalizeCanonicalNumber(
    value * UNITS[input.sourceUnit], definition.canonicalPrecision,
  );
  const canonicalValue = rangeInput
    ? {
      minimum: convert(input.value.minimum),
      maximum: convert(input.value.maximum),
    }
    : convert(input.value);
  const values = typeof canonicalValue === 'object'
    ? [canonicalValue.minimum, canonicalValue.maximum] : [canonicalValue];
  if (values.some((value) => !Number.isFinite(value))) throw new TypeError('canonical value must be finite');
  if (definition.valueType.startsWith('integer') && values.some((value) => !Number.isInteger(value))) {
    throw new TypeError('canonical value must contain integers');
  }
  if (values.some((value) => value === 0) && !definition.allowZero) throw new RangeError('zero is not allowed for this field');
  if (typeof canonicalValue === 'object' && canonicalValue.minimum > canonicalValue.maximum) {
    throw new RangeError('canonical range minimum exceeds maximum');
  }
  return Object.freeze({ ...input, field, canonicalValue, canonicalUnit: definition.canonicalUnit });
}
```

`normalizeCanonicalNumber(value, precision)` rejects more precision than the
field permits and returns `Number(value.toFixed(precision))`. The compiler
hashes the base dictionary, installation matrix and overlay and stores all
three input hashes in the generated registry. Existing modules consume the
compiled registry through dependency injection and preserve their exports and
current result shapes.

Add `"test:architecture-v3": "node --test tests/architecture-v3/*.test.mjs"`
to `package.json`.

- [ ] **Step 4: Run focused and regression tests**

Run:

```bash
node scripts/architecture-v3/build-geometry-installation-semantics.mjs # <!-- doc-audit: ignore -->
cp data/architecture-v3/generated/geometry-installation-semantics.json /tmp/fitappliance-semantics-first.json
node scripts/architecture-v3/build-geometry-installation-semantics.mjs # <!-- doc-audit: ignore -->
cmp /tmp/fitappliance-semantics-first.json data/architecture-v3/generated/geometry-installation-semantics.json
npm run test:architecture-v3 # <!-- doc-audit: ignore -->
node --test tests/architecture-v2/dimension-evidence-claim.test.mjs
node --test tests/architecture-v2/installation-knowledge-fit-v3.test.mjs
```

Expected: all tests PASS; current Claim V2 and installation schema outputs are
byte-equivalent for existing fixtures.

- [ ] **Step 5: Commit the semantic registry**

```bash
git add package.json data/architecture-v3/policies/geometry-installation-semantics-overlay.json data/architecture-v3/generated/geometry-installation-semantics.json src/domain/geometry-installation-semantics.mjs scripts/architecture-v3/build-geometry-installation-semantics.mjs src/domain/dimension-evidence-claim.mjs src/domain/installation-knowledge-v3.mjs tests/architecture-v3/geometry-installation-semantics.test.mjs
git commit -m "feat(evidence): centralise engineering field semantics"
```

### Task 2: Build the AU BrandRegistry without duplicating authority policy

**Files:**
- Create: `data/architecture-v3/policies/brand-relationships.json`
- Create: `src/domain/brand-registry.mjs`
- Create: `scripts/architecture-v3/build-brand-registry.mjs` <!-- doc-audit: ignore -->
- Create: `tests/architecture-v3/brand-registry.test.mjs` <!-- doc-audit: ignore -->
- Create: `data/architecture-v3/generated/brand-registry.json`
- Read only: `data/brand-canon.json`
- Read only: `data/architecture-v2/policies/manufacturer-source-policy.json`
- Read only: `data/architecture-v2/policies/manufacturer-document-strategies.json`

**Interfaces:**
- Consumes: `{ brandCanon, manufacturerSourcePolicy, documentStrategies, relationships }`.
- Produces: `buildBrandRegistry(input) -> BrandRegistry`, `findBrandByAlias(registry, { name, market }) -> BrandRecord | null`.
- `BrandRecord` is `{ brandId, canonicalName, market, aliases, parentGroupId, officialHostPolicyId, officialHosts, sourceStrategyIds, status }`.
- Private helpers: `normalizeBrand(value) -> NFKC lowercase alphanumeric string`, `buildRecords(input) -> BrandRecord[]`, and `freezeRegistry(input) -> frozen BrandRegistry` with a frozen plain-object `brandsByAlias` lookup omitted from generated JSON.

- [ ] **Step 1: Write failing collision and parent-group tests**

```js
test('aliases resolve within AU and parent groups grant no hosts', () => {
  const registry = buildBrandRegistry(fixture());
  const brand = findBrandByAlias(registry, { name: 'F&P', market: 'AU' });
  assert.equal(brand.brandId, 'brand_fisher_paykel');
  assert.equal(brand.parentGroupId, 'group_haier');
  assert.deepEqual(brand.officialHosts, ['fisherpaykel.com']);
  assert.equal(brand.officialHosts.includes('haier.com'), false);
});

test('two active AU brands cannot own the same normalized alias', () => {
  const input = fixture();
  input.relationships.brands[1].aliases.push('F&P');
  assert.throws(() => buildBrandRegistry(input), /alias collision/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/architecture-v3/brand-registry.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `brand-registry.mjs`.

- [ ] **Step 3: Implement deterministic brand construction**

Use `brandCanon.policies.alias_map` only for canonical display aliases. Read
official hosts only from `manufacturerSourcePolicy.brands`; read acquisition
strategy IDs only from `documentStrategies.brands`; read parent groups and
additional reviewed aliases only from `brand-relationships.json`.

```js
export function findBrandByAlias(registry, { name, market }) {
  const key = `${String(market).toUpperCase()}\0${normalizeBrand(name)}`;
  return registry.brandsByAlias[key] ?? null;
}

export function buildBrandRegistry(input) {
  const records = buildRecords(input).sort((a, b) => a.brandId.localeCompare(b.brandId));
  const aliases = new Map();
  for (const record of records) {
    for (const alias of [record.canonicalName, ...record.aliases]) {
      const key = `${record.market}\0${normalizeBrand(alias)}`;
      if (aliases.has(key) && aliases.get(key).brandId !== record.brandId) {
        throw new Error(`brand alias collision: ${alias}`);
      }
      aliases.set(key, record);
    }
  }
  return freezeRegistry({
    schemaVersion: 1,
    policyVersion: '2026-09-13.1',
    brands: records,
    brandsByAlias: Object.fromEntries(aliases),
  });
}
```

The build script must canonicalise key order, omit runtime Maps from JSON,
write `semanticSha256` over the semantic payload, and refuse to write if a
parent group's hosts appear in a child brand record without being present in
that child's existing manufacturer policy.

- [ ] **Step 4: Build twice and verify deterministic output**

Run:

```bash
node scripts/architecture-v3/build-brand-registry.mjs # <!-- doc-audit: ignore -->
cp data/architecture-v3/generated/brand-registry.json /tmp/fitappliance-brand-registry-first.json
node scripts/architecture-v3/build-brand-registry.mjs # <!-- doc-audit: ignore -->
cmp /tmp/fitappliance-brand-registry-first.json data/architecture-v3/generated/brand-registry.json
node --test tests/architecture-v3/brand-registry.test.mjs
```

Expected: `cmp` exits 0 and all focused tests PASS.

- [ ] **Step 5: Commit the BrandRegistry**

```bash
git add data/architecture-v3/policies/brand-relationships.json data/architecture-v3/generated/brand-registry.json src/domain/brand-registry.mjs scripts/architecture-v3/build-brand-registry.mjs tests/architecture-v3/brand-registry.test.mjs
git commit -m "feat(identity): add evidence-neutral brand registry"
```

### Task 3: Build ProductFamilyGraph as relationships, not inherited truth

**Files:**
- Create: `data/architecture-v3/policies/product-family-relationships.json`
- Create: `src/domain/product-family-graph.mjs`
- Create: `scripts/architecture-v3/build-product-family-graph.mjs` <!-- doc-audit: ignore -->
- Create: `tests/architecture-v3/product-family-graph.test.mjs` <!-- doc-audit: ignore -->
- Create: `data/architecture-v3/generated/product-family-graph.json`
- Read only: `data/series-dictionary.json`
- Read only: `data/architecture-v2/generated/canonical-registry.json`

**Interfaces:**
- Consumes: `{ canonicalRegistry, brandRegistry, relationships, seriesDictionary }`.
- Produces: `buildProductFamilyGraph(input) -> ProductFamilyGraph`, `findProductRelationshipEdges(graph, canonicalProductId) -> ProductFamilyEdge[]`.
- `ProductFamilyGraph` contains typed `nodes`, immutable relationship
  `assertions` and `edges`; every endpoint and assertion reference resolves at
  build time.
- `ProductFamilyEdge` is `{ edgeId, fromId, toId, edgeType, status, authority, relationshipAssertionIds, sharedFieldPaths, market }`.
- Produces `createProductRelationshipAssertion(input) -> ProductRelationshipAssertion` with a finite product-ID set, exact shared fields and source-fragment locator; the assertion is not a Claim V3 and cannot be projected as a product field.
- Private `normalizeRelationshipAssertion(input)` requires at least two sorted, unique canonical product IDs, at least one canonical shared field, `market: AU`, source artifact/fragment SHA-256, page and bbox. Private `validateEdge(edge, nodesById, assertionsById, fieldPaths)` validates both endpoint types and every assertion reference; `findVerifiedSharedFieldRoute(graph, sourceProductId, targetProductId, field) -> { targetModel, relationshipAssertionIds } | null` is added in Task 9.

- [ ] **Step 1: Write failing non-inheritance tests**

```js
test('marketing prefix hints remain research-only', () => {
  const graph = buildProductFamilyGraph(fixtureWithSeriesPrefixOnly());
  const edge = graph.edges.find((item) => item.edgeType === 'MARKETED_AS_SERIES');
  assert.equal(edge.authority, 'discovery_hint');
  assert.deepEqual(edge.sharedFieldPaths, []);
  assert.deepEqual(edge.relationshipAssertionIds, []);
});

test('official shared platform requires claims and explicit shared fields', () => {
  const input = fixtureWithOfficialPlatform();
  input.relationships.edges[0].sharedFieldPaths = [];
  assert.throws(() => buildProductFamilyGraph(input), /shared fields required/);
  input.relationships.edges[0].sharedFieldPaths = ['closedEnvelope.widthMm'];
  input.relationships.edges[0].relationshipAssertionIds = [];
  assert.throws(() => buildProductFamilyGraph(input), /relationship assertion/);
});

test('every endpoint and relationship assertion must resolve with the right type', () => {
  const input = fixtureWithOfficialPlatform();
  input.relationships.edges[0].toId = 'platform_missing';
  assert.throws(() => buildProductFamilyGraph(input), /unknown edge endpoint/);
  input.relationships.edges[0].toId = 'series_bosch_6';
  assert.throws(() => buildProductFamilyGraph(input), /endpoint type/);
  input.relationships.edges[0].toId = 'platform_bosch_60_dishwasher_v1';
  input.relationships.edges[0].relationshipAssertionIds = ['relationship_assertion_missing'];
  assert.throws(() => buildProductFamilyGraph(input), /unknown relationship assertion/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/architecture-v3/product-family-graph.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `product-family-graph.mjs`.

- [ ] **Step 3: Implement typed graph validation**

```js
const EDGE_TYPES = new Set([
  'MARKETED_AS_SERIES', 'LISTED_IN_OFFICIAL_MODEL_GROUP',
  'ASSERTED_SHARED_PLATFORM', 'HYPOTHESISED_SHARED_PLATFORM', 'VARIANT_OF',
]);

const EDGE_ENDPOINTS = Object.freeze({
  MARKETED_AS_SERIES: ['canonical_product', 'marketing_series'],
  LISTED_IN_OFFICIAL_MODEL_GROUP: ['canonical_product', 'official_model_group'],
  ASSERTED_SHARED_PLATFORM: ['canonical_product', 'platform'],
  HYPOTHESISED_SHARED_PLATFORM: ['canonical_product', 'platform'],
  VARIANT_OF: ['canonical_product', 'canonical_product'],
});

function validateEdge(edge, nodesById, assertionsById, fieldPaths) {
  if (!EDGE_TYPES.has(edge.edgeType)) throw new TypeError('product-family edge type invalid');
  const from = nodesById.get(edge.fromId);
  const to = nodesById.get(edge.toId);
  if (!from || !to) throw new TypeError('unknown edge endpoint');
  const [fromType, toType] = EDGE_ENDPOINTS[edge.edgeType];
  if (from.type !== fromType || to.type !== toType) throw new TypeError('invalid edge endpoint type');
  const assertions = edge.relationshipAssertionIds.map((id) => assertionsById.get(id));
  if (assertions.some((assertion) => !assertion)) throw new TypeError('unknown relationship assertion');
  if (edge.authority === 'official') {
    if (assertions.length === 0) throw new TypeError('official relationship assertion required');
    if (edge.edgeType === 'ASSERTED_SHARED_PLATFORM' && edge.sharedFieldPaths.length === 0) {
      throw new TypeError('shared fields required for asserted platform');
    }
    for (const assertion of assertions) {
      for (const endpoint of [from, to].filter((node) => node.type === 'canonical_product')) {
        if (!assertion.canonicalProductIds.includes(endpoint.id)) throw new TypeError('assertion does not cover product endpoint');
      }
    }
  }
  if (edge.sharedFieldPaths.some((field) => !fieldPaths.has(field))) throw new TypeError('unknown shared field');
}

export function createProductRelationshipAssertion(input) {
  const payload = normalizeRelationshipAssertion(input);
  return freezeDeep({
    ...payload,
    relationshipAssertionId: `relationship_assertion_${canonicalJsonSha256(payload)}`,
  });
}
```

Convert `data/series-dictionary.json` entries to
`MARKETED_AS_SERIES/discovery_hint` edges only. Preserve the original dictionary
as an input during shadow operation. Build canonical-product nodes only from the
canonical registry and all other node types only from reviewed relationship
policy. Reject duplicate node IDs, unknown node types, unresolved assertion IDs
and cycles formed by `VARIANT_OF` edges. Compute all IDs from canonical semantic
payloads.

- [ ] **Step 4: Build and test determinism and safety**

Run:

```bash
node scripts/architecture-v3/build-product-family-graph.mjs # <!-- doc-audit: ignore -->
node --test tests/architecture-v3/product-family-graph.test.mjs
node scripts/architecture-v3/build-product-family-graph.mjs # <!-- doc-audit: ignore -->
git diff --exit-code data/architecture-v3/generated/product-family-graph.json
```

Expected: all tests PASS and the second build has no diff.

- [ ] **Step 5: Commit the ProductFamilyGraph**

```bash
git add data/architecture-v3/policies/product-family-relationships.json data/architecture-v3/generated/product-family-graph.json src/domain/product-family-graph.mjs scripts/architecture-v3/build-product-family-graph.mjs tests/architecture-v3/product-family-graph.test.mjs
git commit -m "feat(identity): add non-authoritative product family graph"
```

### Task 4: Add structural DocumentFamilyRegistry and exact profile selection

**Files:**
- Create: `data/architecture-v3/policies/document-family-profiles.json`
- Create: `src/domain/document-family-registry.mjs`
- Create: `scripts/architecture-v3/build-document-family-registry.mjs` <!-- doc-audit: ignore -->
- Create: `tests/architecture-v3/document-family-registry.test.mjs` <!-- doc-audit: ignore -->
- Create: `data/architecture-v3/generated/document-family-registry.json`
- Read only: `data/architecture-v2/policies/manufacturer-document-strategies.json`
- Read only: `data/architecture-v2/generated/historical-document-family-graph.json`
- Test: `tests/architecture-v2/historical-document-family-graph.test.mjs`

**Interfaces:**
- Consumes: `{ profiles, brandRegistry, semantics }`.
- Produces: `buildDocumentFamilyRegistry(input) -> DocumentFamilyRegistry` and `selectDocumentFamilyProfile(registry, observation) -> { status, profileId, reasonCodes }`.
- `observation` is `{ brandId, category, documentType, contentMode, structuralSignals }`; `structuralSignals` is a sorted set produced by inspection, never filename guessing.
- `DocumentFamilyRegistry` exposes sorted `profiles` plus a deeply frozen plain-object `profilesById`; the generated JSON contains `profiles` only.

- [ ] **Step 1: Write failing exact, ambiguous and unsupported selection tests**

```js
test('one inspected structure selects one profile', () => {
  const registry = buildDocumentFamilyRegistry(fixture());
  assert.deepEqual(selectDocumentFamilyProfile(registry, {
    brandId: 'brand_smeg', category: 'dishwasher', documentType: 'installation_manual',
    contentMode: 'vector', structuralSignals: ['dimension_legend_letters', 'technical_diagram'],
  }), { status: 'matched', profileId: 'smeg_dishwasher_legend_v1', reasonCodes: ['EXACT_STRUCTURAL_PROFILE'] });
});

test('ambiguous profile selection emits no profile', () => {
  const registry = buildDocumentFamilyRegistry(overlappingFixture());
  assert.deepEqual(selectDocumentFamilyProfile(registry, inspectedDocument()), {
    status: 'ambiguous', profileId: null, reasonCodes: ['MULTIPLE_STRUCTURAL_PROFILES'],
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/architecture-v3/document-family-registry.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for
`document-family-registry.mjs`.

- [ ] **Step 3: Implement exact structural matching**

```js
export function selectDocumentFamilyProfile(registry, observation) {
  const signals = new Set(observation.structuralSignals);
  const matches = registry.profiles.filter((profile) => (
    profile.status !== 'disabled'
    && profile.brandIds.includes(observation.brandId)
    && profile.categories.includes(observation.category)
    && profile.documentTypes.includes(observation.documentType)
    && profile.contentModes.includes(observation.contentMode)
    && profile.requiredSignals.every((signal) => signals.has(signal))
    && profile.forbiddenSignals.every((signal) => !signals.has(signal))
  ));
  if (matches.length === 0) return Object.freeze({ status: 'unsupported', profileId: null, reasonCodes: ['NO_STRUCTURAL_PROFILE'] });
  if (matches.length > 1) return Object.freeze({ status: 'ambiguous', profileId: null, reasonCodes: ['MULTIPLE_STRUCTURAL_PROFILES'] });
  return Object.freeze({ status: 'matched', profileId: matches[0].profileId, reasonCodes: ['EXACT_STRUCTURAL_PROFILE'] });
}
```

Initial production policy contains disabled skeleton records for known
acquisition brands and canary-active records only where a hash-bound positive
and negative fixture exists. Keep URL templates and transport settings in the
existing manufacturer-document strategy file; the new registry stores parsing
structure only.

- [ ] **Step 4: Run new and existing graph tests**

Run:

```bash
node scripts/architecture-v3/build-document-family-registry.mjs # <!-- doc-audit: ignore -->
node --test tests/architecture-v3/document-family-registry.test.mjs
node --test tests/architecture-v2/historical-document-family-graph.test.mjs
```

Expected: all tests PASS; the V2 graph still reports family membership as
non-authoritative for exact model proof.

- [ ] **Step 5: Commit the DocumentFamilyRegistry**

```bash
git add data/architecture-v3/policies/document-family-profiles.json data/architecture-v3/generated/document-family-registry.json src/domain/document-family-registry.mjs scripts/architecture-v3/build-document-family-registry.mjs tests/architecture-v3/document-family-registry.test.mjs
git commit -m "feat(evidence): add structural document family registry"
```

### Task 5: Make PDF, MinerU, OCR, Markdown, chunks and diagrams one artifact lineage

**Files:**
- Create: `src/domain/evidence-artifact-lineage.mjs`
- Create: `tests/architecture-v3/evidence-artifact-lineage.test.mjs` <!-- doc-audit: ignore -->
- Modify: `src/domain/source-document.mjs`
- Modify: `src/domain/mineru-document.mjs`
- Modify: `src/domain/evidence-artifact-pipeline.mjs`
- Test: `tests/architecture-v2/source-document.test.mjs`
- Test: `tests/architecture-v2/evidence-artifact-pipeline.test.mjs`

**Interfaces:**
- Consumes: `{ sourceArtifacts, derivedArtifacts, fragments }` built from existing content-addressed objects.
- Produces: `buildEvidenceArtifactLineage(input) -> ArtifactLineage` and `resolveFragmentLineage(lineage, fragmentSha256) -> { sourceArtifact, derivedChain, fragment }`.
- `ArtifactLineage` exposes sorted arrays plus deeply frozen plain-object `artifactsById` and `fragmentsByHash` lookups; generated JSON omits the lookup copies.
- A source artifact is `{ artifactId, kind: 'source_artifact', mediaType,
  contentSha256, objectPath }`; PDF is one media type, not the graph's only root.
- A derived artifact is `{ artifactId, kind, mediaType, contentSha256,
  objectPath, parentArtifactId, tool, pageRange }` where `tool` is `{ name,
  version, modelRevision, optionsSha256 }`.
- A fragment is `{ fragmentSha256, parentArtifactId, contentSha256, locator }`.
  `locator.kind` is one of `pdf_bbox`, `json_pointer`, `html_selector`,
  `csv_cell` or `text_span`. A `pdf_bbox` locator binds one-based page, 0..1000
  bbox, rendered-page artifact ID and pixel dimensions.

- [ ] **Step 1: Write failing complete-lineage and tamper tests**

```js
test('fragment resolves through OCR JSON to its original PDF', () => {
  const lineage = buildEvidenceArtifactLineage(fixture());
  const resolved = resolveFragmentLineage(lineage, HASH_FRAGMENT);
  assert.equal(resolved.sourceArtifact.contentSha256, HASH_PDF);
  assert.equal(resolved.sourceArtifact.mediaType, 'application/pdf');
  assert.deepEqual(resolved.derivedChain.map((item) => item.kind), ['page_image', 'ocr_page_json']);
  assert.equal(resolved.fragment.locator.page, 7);
  assert.equal(resolved.fragment.locator.renderedPageArtifactId, PAGE_ARTIFACT_ID);
});

test('structured source fragments do not require fake PDF coordinates', () => {
  const resolved = resolveFragmentLineage(buildEvidenceArtifactLineage(jsonFixture()), HASH_JSON_FRAGMENT);
  assert.equal(resolved.sourceArtifact.mediaType, 'application/json');
  assert.equal(resolved.fragment.locator.kind, 'json_pointer');
});

test('orphan, cycle and parent-hash tampering fail closed', () => {
  assert.throws(() => buildEvidenceArtifactLineage(orphanFixture()), /unknown parent/);
  assert.throws(() => buildEvidenceArtifactLineage(cycleFixture()), /cycle/);
  assert.throws(() => buildEvidenceArtifactLineage(tamperedParentFixture()), /parent binding/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/architecture-v3/evidence-artifact-lineage.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for
`evidence-artifact-lineage.mjs`.

- [ ] **Step 3: Implement hash-bound graph validation**

```js
export function resolveFragmentLineage(lineage, fragmentSha256) {
  const fragment = lineage.fragmentsByHash[fragmentSha256];
  if (!fragment) throw new TypeError('unknown evidence fragment');
  const derivedChain = [];
  let node = lineage.artifactsById[fragment.parentArtifactId];
  const visited = new Set();
  while (node?.parentArtifactId) {
    if (visited.has(node.artifactId)) throw new Error('artifact lineage cycle');
    visited.add(node.artifactId);
    derivedChain.unshift(node);
    node = lineage.artifactsById[node.parentArtifactId];
  }
  if (!node || node.kind !== 'source_artifact') throw new Error('fragment has no source artifact');
  return Object.freeze({ sourceArtifact: node, derivedChain: Object.freeze(derivedChain), fragment });
}
```

Add optional `derivedArtifacts` and `fragmentRefs` fields to the source-document
read model without changing old records. Existing constructors must default
them to empty arrays. The acquisition pipeline records only metadata and hashes;
it does not copy or rewrite external objects. Source media type and object-path
validation continue to come from the existing source-specific verifier. MinerU
nodes retain `sourcePdfSha256`, parser version, model revision and content hash
already validated by `currentMineruEvidenceProfile`. The lineage builder rejects
a PDF-only transform whose root media type is not `application/pdf`, and
validates each locator by kind instead of inventing page/bbox data for
structured sources.

- [ ] **Step 4: Run focused and V2 compatibility tests**

Run:

```bash
node --test tests/architecture-v3/evidence-artifact-lineage.test.mjs
node --test tests/architecture-v2/source-document.test.mjs
node --test tests/architecture-v2/evidence-artifact-pipeline.test.mjs
```

Expected: all tests PASS; existing source documents serialise as before when
the optional arrays are absent.

- [ ] **Step 5: Commit artifact lineage**

```bash
git add src/domain/evidence-artifact-lineage.mjs src/domain/source-document.mjs src/domain/mineru-document.mjs src/domain/evidence-artifact-pipeline.mjs tests/architecture-v3/evidence-artifact-lineage.test.mjs
git commit -m "feat(evidence): bind derived artifacts to source PDFs"
```

### Task 6: Route extraction by inspected document structure

**Files:**
- Create: `src/domain/document-extraction-router.mjs`
- Create: `tests/architecture-v3/document-extraction-router.test.mjs` <!-- doc-audit: ignore -->
- Modify: `src/domain/document-source-adapter.mjs`
- Modify: `src/domain/mineru-runner.mjs`
- Test: `tests/architecture-v2/evidence-artifact-verifier.test.mjs`

**Interfaces:**
- Consumes: `createDocumentExtractionRouter({ documentFamilyRegistry, executors })` where executor keys are `native_pdf`, `mineru_layout`, `render_pages`, `ocr_pages`, `diagram_crop`, `vision_candidate`, `manual_review`.
- Produces: `inspectDocumentStructure({ brandId, category, documentType, pages }) -> { brandId, category, documentType, contentMode, structuralSignals }`; each page inspection is `{ nativeGlyphs, nativeTextBlocks, rasterAreaRatio, vectorLineCount, tableCount, figureCount }`.
- Produces: `router.extract({ sourceArtifact, observation }) -> Promise<{ profileId, derivedArtifacts, candidateFragments, approvalState }>`.
- `approvalState` is always `extracted_not_approved`; no executor may return an accepted claim.

- [ ] **Step 1: Write failing routing tests**

```js
test('vector profile does not invoke OCR', async () => {
  const calls = [];
  const router = createDocumentExtractionRouter({
    documentFamilyRegistry: vectorRegistry(),
    executors: recordingExecutors(calls),
  });
  const result = await router.extract(vectorDocument());
  assert.deepEqual(calls, ['native_pdf', 'mineru_layout']);
  assert.equal(result.approvalState, 'extracted_not_approved');
});

test('ambiguous structure invokes no executor', async () => {
  const calls = [];
  const router = createDocumentExtractionRouter({
    documentFamilyRegistry: ambiguousRegistry(),
    executors: recordingExecutors(calls),
  });
  await assert.rejects(router.extract(hybridDocument()), /MULTIPLE_STRUCTURAL_PROFILES/);
  assert.deepEqual(calls, []);
});

test('inspection distinguishes vector, scan and hybrid without reading filenames', () => {
  assert.equal(inspectDocumentStructure(vectorInspection()).contentMode, 'vector');
  assert.equal(inspectDocumentStructure(scanInspection()).contentMode, 'scanned');
  assert.equal(inspectDocumentStructure(hybridInspection()).contentMode, 'hybrid');
  assert.equal(JSON.stringify(inspectDocumentStructure(vectorInspection())).includes('.pdf'), false);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/architecture-v3/document-extraction-router.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for
`document-extraction-router.mjs`.

- [ ] **Step 3: Implement candidate-only routing**

```js
export function createDocumentExtractionRouter({ documentFamilyRegistry, executors }) {
  return Object.freeze({
    async extract({ sourceArtifact, observation }) {
      const selection = selectDocumentFamilyProfile(documentFamilyRegistry, observation);
      if (selection.status !== 'matched') throw new Error(selection.reasonCodes.join(','));
      const profile = documentFamilyRegistry.profilesById[selection.profileId];
      let state = { sourceArtifact, derivedArtifacts: [], candidateFragments: [] };
      for (const executorId of profile.extractorChain) {
        const execute = executors[executorId];
        if (typeof execute !== 'function') throw new TypeError(`missing extraction executor: ${executorId}`);
        state = await execute(Object.freeze({ ...state, profile }));
      }
      return Object.freeze({ profileId: profile.profileId, ...state, approvalState: 'extracted_not_approved' });
    },
  });
}
```

`inspectDocumentStructure` uses only page-level native/raster/vector/layout
counts. A page is native when `nativeGlyphs > 0`; scanned when
`nativeGlyphs === 0 && rasterAreaRatio >= 0.8`; a document is hybrid when both
page classes occur. Structural signals are deterministic booleans from table,
figure, vector-line and extracted-label observations; URL and filename are not
inputs.

`inspectDocumentPayload` remains the byte/type gate. `createOcrExtraction`
remains image-only and requires rendered-page verification. The MinerU executor
must use the current profile validator; a vision executor receives only the
selected diagram crop and returns candidate labels, values and bboxes.

- [ ] **Step 4: Run routing and artifact-verifier tests**

Run:

```bash
node --test tests/architecture-v3/document-extraction-router.test.mjs
node --test tests/architecture-v2/evidence-artifact-verifier.test.mjs
```

Expected: all tests PASS; no path can return an approved field or receipt.

- [ ] **Step 5: Commit the extraction router**

```bash
git add src/domain/document-extraction-router.mjs src/domain/document-source-adapter.mjs src/domain/mineru-runner.mjs tests/architecture-v3/document-extraction-router.test.mjs
git commit -m "feat(evidence): route extraction by document structure"
```

### Task 7: Add immutable Claim V3 envelopes

**Files:**
- Create: `src/domain/evidence-claim-v3.mjs`
- Create: `tests/architecture-v3/evidence-claim-v3.test.mjs` <!-- doc-audit: ignore -->
- Modify: `src/domain/dimension-evidence-claim.mjs`
- Modify: `src/domain/installation-evidence-pipeline.mjs`
- Test: `tests/architecture-v2/dimension-evidence-claim.test.mjs`
- Test: `tests/architecture-v2/installation-evidence-pipeline.test.mjs`

**Interfaces:**
- Consumes: `createEvidenceClaimV3(input, { semantics, lineage, canonicalRegistry })` where `input` contains exact `subject`, `field`, `value`, `semantics`, `sourceRepresentation`, `evidence`, `applicabilityProof` and optional `derivedFromClaimId`.
- Produces: frozen `EvidenceClaimV3` with `schemaVersion: 3` and deterministic `claimId`; `verifyEvidenceClaimV3(claim, context) -> true`; `canonicalEvidenceClaimPayload(claim) -> object`.
- Claim workflow state is deliberately absent.
- `value.kind` is exactly `fixed`, `range`, `boolean` or `not_applicable`; no Claim V3 object represents unknown.
- `sourceRepresentation.kind` is exactly `ordered_dimensions`, `named_scalar`,
  `named_range`, `boolean_statement` or `not_applicable_statement`. Only the
  first kind accepts `axisOrder`.

- [ ] **Step 1: Write failing identity, axis and replay tests**

```js
test('claim ID covers subject, semantics and evidence locator', () => {
  const claim = createEvidenceClaimV3(validClaimInput(), context());
  assert.match(claim.claimId, /^claim_[a-f0-9]{64}$/);
  assert.equal(verifyEvidenceClaimV3(claim, context()), true);
  assert.throws(() => verifyEvidenceClaimV3({
    ...claim,
    evidence: { ...claim.evidence, page: claim.evidence.page + 1 },
  }, context()), /claim ID mismatch/);
});

test('ordered source values must prove the claimed axis', () => {
  const input = validClaimInput();
  input.sourceRepresentation = {
    kind: 'ordered_dimensions', label: 'Dimensions H x W x D',
    axisOrder: ['height', 'width', 'depth'],
    values: [850, 598, 600], unit: 'mm',
  };
  input.field = 'closedEnvelope.widthMm';
  input.value = { kind: 'fixed', canonical: 850, unit: 'mm' };
  assert.throws(() => createEvidenceClaimV3(input, context()), /axis value mismatch/);
});

test('boolean and not-applicable claims bind statements without fake axes', () => {
  const booleanInput = validBooleanClaimInput({
    sourceRepresentation: {
      kind: 'boolean_statement', label: 'Professional installation required',
      statement: 'Installation must be completed by a licensed installer',
    },
  });
  assert.equal(createEvidenceClaimV3(booleanInput, context()).value.canonical, true);
  const invalid = structuredClone(booleanInput);
  invalid.sourceRepresentation.axisOrder = ['width'];
  assert.throws(() => createEvidenceClaimV3(invalid, context()), /axisOrder not allowed/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/architecture-v3/evidence-claim-v3.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `evidence-claim-v3.mjs`.

- [ ] **Step 3: Implement canonical claim creation and replay**

```js
export function canonicalEvidenceClaimPayload(claim) {
  const { claimId: ignored, ...payload } = claim;
  return structuredClone(payload);
}

export function createEvidenceClaimV3(input, context) {
  const payload = normalizeAndValidate(input, context);
  const digest = canonicalJsonSha256(payload);
  return freezeDeep({ ...payload, claimId: `claim_${digest}` });
}

export function verifyEvidenceClaimV3(claim, context) {
  const rebuilt = createEvidenceClaimV3(canonicalEvidenceClaimPayload(claim), context);
  if (rebuilt.claimId !== claim.claimId) throw new Error('claim ID mismatch');
  return true;
}
```

`normalizeAndValidate` must resolve the fragment through Task 5, require the
source artifact hash to match that lineage, require the exact canonical product
to exist, validate the field through Task 1 and preserve source values and unit.
For `ordered_dimensions`, prove the claimed value at its position in
`axisOrder`; for named scalar/range and statement kinds, prove label and value
or statement co-location in the same fragment and reject `axisOrder`. Validate
the complete closed union with exact keys so one representation cannot leak
fields from another. Existing Claim V2 constructors remain supported and gain a
one-way wrapper that creates a V3 candidate without changing V2 bytes.

- [ ] **Step 4: Run Claim V3 and compatibility tests**

Run:

```bash
node --test tests/architecture-v3/evidence-claim-v3.test.mjs
node --test tests/architecture-v2/dimension-evidence-claim.test.mjs
node --test tests/architecture-v2/installation-evidence-pipeline.test.mjs
```

Expected: all tests PASS; Claim V2 output and current installation receipts are
unchanged.

- [ ] **Step 5: Commit Claim V3**

```bash
git add src/domain/evidence-claim-v3.mjs src/domain/dimension-evidence-claim.mjs src/domain/installation-evidence-pipeline.mjs tests/architecture-v3/evidence-claim-v3.test.mjs
git commit -m "feat(evidence): add immutable exact-subject claims"
```

### Task 8: Bind receipts to Claim V3 and separate decision events

**Files:**
- Create: `data/architecture-v3/policies/evidence-claim-policy.json`
- Create: `src/domain/evidence-source-binding.mjs`
- Create: `src/domain/evidence-claim-receipt.mjs`
- Create: `src/domain/evidence-claim-decision.mjs`
- Create: `tests/architecture-v3/evidence-source-binding.test.mjs` <!-- doc-audit: ignore -->
- Create: `tests/architecture-v3/evidence-claim-receipt.test.mjs` <!-- doc-audit: ignore -->
- Create: `tests/architecture-v3/evidence-claim-decision.test.mjs` <!-- doc-audit: ignore -->
- Read only: `src/domain/evidence-source-verifier.mjs`
- Read only: `src/domain/installation-evidence-pipeline.mjs`
- Read only: `src/domain/provider-response-shadow-acceptance.mjs`
- Test: `tests/architecture-v2/evidence-source-verifier.test.mjs`
- Test: `tests/architecture-v2/installation-evidence-pipeline.test.mjs`

**Interfaces:**
- Consumes: `createVerifiedSourceBinding({ sourceReceiptKind, source,
  sourceReceipt, caseIdentity, documentRoleEvidence, rightsDecisions }, context)`
  where `context.sourceVerifierAdapters[sourceReceiptKind]` replays an existing
  authority-specific receipt.
- Produces: immutable `VerifiedSourceBinding` schema 1 with trusted
  `authorityClass`, source artifact hash, source receipt digest, optional
  document-role proof and action-scoped rights decision IDs.
- Produces: `createEvidenceClaimReceipt({ claim, sourceBinding }, context) ->
  EvidenceClaimReceipt` schema 1 and `verifyEvidenceClaimReceipt(...) -> true`.
- Produces: `createEvidenceClaimDecision(input) -> EvidenceClaimDecision`,
  `verifyEvidenceClaimDecision(event) -> true`, and
  `reduceEvidenceClaimDecisions(events, claimId) -> active terminal event`.
- Decision input is `{ claimId, decision, reasonCodes, policyVersion, actor,
  decidedAt, supersedesDecisionId }`.

- [ ] **Step 1: Write failing source-authority, receipt and decision tests**

```js
test('a parser cannot assign its own authority tier', () => {
  assert.throws(() => createVerifiedSourceBinding({
    ...manufacturerSourceInput(),
    authorityClass: 'official_installation_engineering',
  }, sourceBindingContext()), /unknown key|authority.*adapter/);
});

test('a replayed source receipt and role proof create the authority binding', () => {
  const binding = createVerifiedSourceBinding(
    manufacturerInstallationSourceInput(), sourceBindingContext(),
  );
  assert.equal(binding.authorityClass, 'official_installation_engineering');
  assert.equal(binding.sourceArtifactSha256, HASH_PDF);
  assert.match(binding.sourceBindingId, /^source_binding_[a-f0-9]{64}$/);
});

test('claim receipt binds exactly one claim and its verified source', () => {
  const claim = claimA();
  const receipt = createEvidenceClaimReceipt({
    claim, sourceBinding: verifiedSourceBinding(),
  }, claimReceiptContext());
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.claimId, claim.claimId);
  assert.equal(verifyEvidenceClaimReceipt(receipt, {
    claim, sourceBinding: verifiedSourceBinding(),
  }, claimReceiptContext()), true);
  assert.throws(() => verifyEvidenceClaimReceipt(receipt, {
    claim: { ...claim, field: 'closedEnvelope.heightMm' },
    sourceBinding: verifiedSourceBinding(),
  }, claimReceiptContext()), /claim|digest mismatch/);
});

test('decision history has exactly one terminal event', () => {
  const rejected = createEvidenceClaimDecision(rejectedDecisionInput());
  const accepted = createEvidenceClaimDecision({
    ...acceptedDecisionInput(), supersedesDecisionId: rejected.decisionId,
  });
  assert.equal(reduceEvidenceClaimDecisions([rejected, accepted], CLAIM_ID).decision, 'accepted');
  const fork = createEvidenceClaimDecision({
    ...quarantinedDecisionInput(), supersedesDecisionId: rejected.decisionId,
  });
  assert.throws(() => reduceEvidenceClaimDecisions([rejected, accepted, fork], CLAIM_ID), /multiple terminal/);
});
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```bash
node --test tests/architecture-v3/evidence-source-binding.test.mjs
node --test tests/architecture-v3/evidence-claim-receipt.test.mjs
node --test tests/architecture-v3/evidence-claim-decision.test.mjs
```

Expected: all three tests FAIL with `ERR_MODULE_NOT_FOUND` for the new modules.

- [ ] **Step 3: Add independent source bindings, claim receipts and decisions**

Add this policy contract:

```json
{
  "schemaVersion": 1,
  "policyVersion": "2026-09-13.1",
  "claimSchemaVersion": 3,
  "sourceBindingSchemaVersion": 1,
  "claimReceiptSchemaVersion": 1,
  "sourceVerifierAdapters": [
    {
      "sourceReceiptKind": "manufacturer_verification_receipt",
      "verifierId": "evidence_source_verifier_v2",
      "allowedAuthorityClasses": [
        "official_installation_engineering",
        "official_product_specification",
        "official_manufacturer_unclassified"
      ]
    },
    {
      "sourceReceiptKind": "installation_field_receipt",
      "verifierId": "installation_evidence_pipeline_v1",
      "allowedAuthorityClasses": ["official_installation_engineering"]
    }
  ]
}
```

The adapter registry is dependency-injected and closed by policy. Its adapter
must replay the source-specific receipt, match the source artifact hash and
return the authority owner. An installation/engineering or product-specification
subclass additionally requires hash-bound document-role evidence from official
metadata or an anchored document title; without it, the class is
`official_manufacturer_unclassified`. Government, retailer and provider source
kinds stay unsupported until their own verifier adapter and rights fixtures are
implemented; a parser label cannot unlock them.

```js
export function createVerifiedSourceBinding(input, context) {
  rejectUnknownKeys(input);
  const adapter = requireAllowedAdapter(input.sourceReceiptKind, context);
  const verified = adapter.verify(input, context);
  const payload = normalizeSourceBinding({
    ...verified,
    documentRole: verifyDocumentRoleEvidence(input.documentRoleEvidence, verified, context),
    rights: verifyRightsDecisions(input.rightsDecisions, verified, context),
  });
  return freezeDeep({ ...payload,
    sourceBindingId: `source_binding_${canonicalJsonSha256(payload)}`,
  });
}

export function createEvidenceClaimReceipt({ claim, sourceBinding }, context) {
  verifyEvidenceClaimV3(claim, context.claimContext);
  verifySourceBinding(sourceBinding, context.sourceBindingContext);
  if (claim.evidence.sourceArtifactSha256 !== sourceBinding.sourceArtifactSha256) {
    throw new Error('claim source artifact does not match source binding');
  }
  const payload = normalizeClaimReceipt({ claim, sourceBinding, context });
  return freezeDeep({ ...payload,
    claimReceiptId: `claim_receipt_${canonicalJsonSha256(payload)}`,
  });
}
```

The claim receipt stores `claimId`, claim payload hash, exact canonical product,
source binding ID, source/derived/fragment hashes, locator hash, policy and
toolchain hashes. Rights remain action-scoped: a valid internal claim receipt
may still have `public_display: unknown_blocked`; Task 14 must block that field
from a public candidate.

Implement decisions as canonical immutable events and reduce them as a graph:

```js
export function createEvidenceClaimDecision(input) {
  const payload = normalizeDecision(input);
  return freezeDeep({
    ...payload,
    decisionId: `claim_decision_${canonicalJsonSha256(payload)}`,
  });
}

export function reduceEvidenceClaimDecisions(events, claimId) {
  const verified = events.map(verifyEvidenceClaimDecisionFor(claimId));
  assertNoMissingSupersededEventOrCycle(verified);
  const terminals = terminalEvents(verified);
  if (terminals.length !== 1) throw new Error('claim decision requires exactly one terminal event');
  return terminals[0];
}
```

Legacy source receipt schemas 2 and 3 and installation-field receipt schema 1
must replay unchanged through their existing modules. V3 adds an outer binding;
it does not add schema 4 to, or regenerate, either legacy receipt family.

- [ ] **Step 4: Run new and legacy replay tests**

Run:

```bash
node --test tests/architecture-v3/evidence-source-binding.test.mjs
node --test tests/architecture-v3/evidence-claim-receipt.test.mjs
node --test tests/architecture-v3/evidence-claim-decision.test.mjs
node --test tests/architecture-v2/evidence-source-verifier.test.mjs
node --test tests/architecture-v2/installation-evidence-pipeline.test.mjs
node --test tests/architecture-v2/evidence-claim-reconciliation.test.mjs
```

Expected: all tests PASS; legacy receipt fixtures are byte-identical and an
unsupported authority class cannot create a source binding.

- [ ] **Step 5: Commit claim-bound receipts**

```bash
git add data/architecture-v3/policies/evidence-claim-policy.json src/domain/evidence-source-binding.mjs src/domain/evidence-claim-receipt.mjs src/domain/evidence-claim-decision.mjs tests/architecture-v3/evidence-source-binding.test.mjs tests/architecture-v3/evidence-claim-receipt.test.mjs tests/architecture-v3/evidence-claim-decision.test.mjs
git commit -m "feat(evidence): bind claims to verified source authority"
```

### Task 9: Materialise only field-specific finite-model derivations

**Files:**
- Create: `src/domain/product-family-claim-derivation.mjs`
- Create: `tests/architecture-v3/product-family-claim-derivation.test.mjs` <!-- doc-audit: ignore -->
- Modify: `src/domain/product-family-graph.mjs`
- Modify: `src/domain/evidence-claim-receipt.mjs`
- Test: `tests/architecture-v2/evidence-source-verifier.test.mjs`

**Interfaces:**
- Consumes: `deriveEvidenceClaimForExactProduct({ sourceClaim,
  sourceClaimReceipt, targetProductId, graph, relationshipAssertions,
  relationshipReceipts }, context)` where `context.sourceBindingsById` resolves
  the source binding named by the source claim receipt.
- Produces: `{ claim, claimReceipt }`; the Claim V3 subject is
  `targetProductId`, `derivedFromClaimId` names the source claim and
  `applicabilityProof.relationshipAssertionIds` is non-empty. The target has its
  own derived-claim receipt rather than reusing the source product's receipt.
- Produces `createProductRelationshipAssertionReceipt({ assertion,
  sourceBinding, verifiedAt }, context)` and
  `verifyProductRelationshipAssertionReceipt(...) -> true`.
- A valid route requires two active official edges to the same finite group/platform, the field in both `sharedFieldPaths`, and replay-valid receipts for every relationship assertion.
- Adds `findVerifiedSharedFieldRoute(graph, sourceProductId, targetProductId, field)` to `product-family-graph.mjs`; it returns `null` unless the exact source and target edges share one finite node, `authority: official`, `status: active`, the requested field and at least one common relationship assertion ID.
- Private `verifyRelationshipRoute(route, assertions, receipts) -> boolean` verifies assertion IDs, exact finite membership, source-fragment lineage and receipt digests before derivation.

- [ ] **Step 1: Write failing official, hypothesis and wildcard tests**

```js
test('official finite shared-field relation creates one exact target claim', () => {
  const { claim, claimReceipt } = deriveEvidenceClaimForExactProduct({
    sourceClaim: exactSourceClaim(), targetProductId: TARGET_ID,
    sourceClaimReceipt: exactSourceClaimReceipt(),
    graph: officialFiniteGraph(),
    relationshipAssertions: [relationshipAssertion()],
    relationshipReceipts: [relationshipAssertionReceipt()],
  }, context());
  assert.equal(claim.subject.canonicalProductId, TARGET_ID);
  assert.equal(claim.derivedFromClaimId, exactSourceClaim().claimId);
  assert.deepEqual(claim.applicabilityProof.relationshipAssertionIds, [RELATIONSHIP_ASSERTION_ID]);
  assert.equal(claimReceipt.canonicalProductId, TARGET_ID);
  assert.equal(claimReceipt.derivation.sourceClaimReceiptId, SOURCE_CLAIM_RECEIPT_ID);
  assert.deepEqual(claimReceipt.derivation.relationshipAssertionReceiptIds, [RELATIONSHIP_RECEIPT_ID]);
});

test('series, hypothesis and prefix routes cannot donate claims', () => {
  for (const graph of [marketingSeriesGraph(), hypothesisGraph(), wildcardGraph()]) {
    assert.throws(() => deriveEvidenceClaimForExactProduct({
      sourceClaim: exactSourceClaim(), targetProductId: TARGET_ID, graph,
      relationshipAssertions: [], relationshipReceipts: [],
    }, context()), /finite official shared-field relation required/);
  }
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/architecture-v3/product-family-claim-derivation.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for
`product-family-claim-derivation.mjs`.

- [ ] **Step 3: Implement the narrow derivation gate**

```js
export function createProductRelationshipAssertionReceipt({ assertion, sourceBinding, verifiedAt }) {
  const payload = {
    schemaVersion: 1,
    relationshipAssertionId: assertion.relationshipAssertionId,
    relationshipAssertionSha256: assertion.relationshipAssertionId.slice('relationship_assertion_'.length),
    sourceBindingId: sourceBinding.sourceBindingId,
    sourceArtifactSha256: sourceBinding.sourceArtifactSha256,
    fragmentSha256: assertion.fragmentSha256,
    locatorSha256: canonicalJsonSha256(assertion.locator),
    verifiedAt: new Date(verifiedAt).toISOString(),
  };
  return freezeDeep({ ...payload,
    relationshipReceiptId: `relationship_receipt_${canonicalJsonSha256(payload)}`,
  });
}

export function deriveEvidenceClaimForExactProduct(input, context) {
  const sourceBinding = context.sourceBindingsById[input.sourceClaimReceipt.sourceBindingId];
  if (!sourceBinding) throw new Error('source claim receipt binding is missing');
  verifyEvidenceClaimReceipt(input.sourceClaimReceipt, {
    claim: input.sourceClaim, sourceBinding,
  }, context.claimReceiptContext);
  const route = findVerifiedSharedFieldRoute(
    input.graph, input.sourceClaim.subject.canonicalProductId,
    input.targetProductId, input.sourceClaim.field,
  );
  if (!route || !verifyRelationshipRoute(
    route, input.relationshipAssertions, input.relationshipReceipts,
  )) {
    throw new Error('finite official shared-field relation required');
  }
  const claim = createEvidenceClaimV3({
    ...canonicalEvidenceClaimPayload(input.sourceClaim),
    subject: { ...input.sourceClaim.subject, canonicalProductId: input.targetProductId },
    applicabilityProof: {
      bindingType: 'FINITE_OFFICIAL_RELATION',
      namedModels: [route.targetModel],
      relationshipAssertionIds: [...route.relationshipAssertionIds].sort(),
    },
    derivedFromClaimId: input.sourceClaim.claimId,
  }, context);
  const claimReceipt = createDerivedEvidenceClaimReceipt({
    claim,
    sourceClaim: input.sourceClaim,
    sourceClaimReceipt: input.sourceClaimReceipt,
    relationshipAssertionReceipts: receiptsForRoute(route, input.relationshipReceipts),
  }, context.claimReceiptContext);
  return freezeDeep({ claim, claimReceipt });
}
```

`createDerivedEvidenceClaimReceipt` verifies the source claim receipt and every
relationship assertion receipt, binds their IDs and requires the target subject
to be in each finite assertion. It never calls the manufacturer source verifier
with the target identity, because that would falsely present a source-product
receipt as an exact-target receipt. Do not create batch claims. Call this
function once per exact product so every target receives its own immutable
claim and receipt. A field not listed on the official edge fails even if another
field is shared.

- [ ] **Step 4: Run derivation and existing variant-policy tests**

Run:

```bash
node --test tests/architecture-v3/product-family-claim-derivation.test.mjs
node --test tests/architecture-v2/evidence-source-verifier.test.mjs
```

Expected: all tests PASS; existing strict dimensions-only official variant
policy remains unchanged.

- [ ] **Step 5: Commit finite-model derivation**

```bash
git add src/domain/product-family-claim-derivation.mjs src/domain/product-family-graph.mjs src/domain/evidence-claim-receipt.mjs tests/architecture-v3/product-family-claim-derivation.test.mjs
git commit -m "feat(evidence): gate exact claims through finite relations"
```

### Task 10: Reconcile Claim V3 with deterministic arbitration and quarantine

**Files:**
- Create: `data/architecture-v3/policies/evidence-arbitration-policy.json`
- Create: `src/domain/evidence-adjudication-v3.mjs`
- Create: `tests/architecture-v3/evidence-adjudication-v3.test.mjs` <!-- doc-audit: ignore -->
- Modify: `src/domain/evidence-claim-reconciliation.mjs`
- Test: `tests/architecture-v2/evidence-claim-reconciliation.test.mjs`

**Interfaces:**
- Consumes: `adjudicateEvidenceClaimsV3({ claims, claimReceipts,
  sourceBindings, decisions, policy, asOf, semantics, lineage,
  canonicalRegistry })`.
- Produces: `{ status, acceptedByField, quarantinedByField, anomalies, missingFields, inputSha256, semanticSha256 }`.
- `acceptedByField[field]` stores an ordered list of accepted claim IDs; public projection later reads values from those claims, never from the adjudication summary alone.

- [ ] **Step 1: Write failing authority and conflict tests**

```js
test('explicit official axis proof beats a lower-authority permutation without editing it', () => {
  const result = adjudicateEvidenceClaimsV3(explicitOfficialVsRegistryPermutation());
  assert.equal(result.status, 'accepted_with_anomalies');
  assert.deepEqual(result.acceptedByField['closedEnvelope.widthMm'], ['claim_official_width']);
  assert.deepEqual(result.anomalies.map((item) => item.code), ['LOWER_AUTHORITY_AXIS_PERMUTATION']);
});

test('ambiguous official and same-authority conflicts quarantine', () => {
  assert.equal(adjudicateEvidenceClaimsV3(ambiguousOfficialAxis()).status, 'conflict_quarantined');
  const result = adjudicateEvidenceClaimsV3(twoCurrentOfficialValues());
  assert.deepEqual(result.quarantinedByField['closedEnvelope.widthMm'].reasonCodes, ['SAME_AUTHORITY_VALUE_CONFLICT']);
});

test('different scopes are not treated as one field conflict', () => {
  const result = adjudicateEvidenceClaimsV3(closedDepthAndCavityDepth());
  assert.equal(result.status, 'accepted');
  assert.equal(Object.keys(result.quarantinedByField).length, 0);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/architecture-v3/evidence-adjudication-v3.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for
`evidence-adjudication-v3.mjs`.

- [ ] **Step 3: Implement gate ordering and canonical output**

The policy has this exact authority order after semantic eligibility:

```json
{
  "policyVersion": "2026-09-13.1",
  "authorityOrder": [
    "official_installation_engineering",
    "official_product_specification",
    "official_au_registry",
    "retailer_observation"
  ],
  "reviewOnlyAuthorityClasses": ["official_manufacturer_unclassified"],
  "automaticResolutionRules": [
    "identical_independent_official_corroboration",
    "explicit_supersession",
    "explicit_official_axis_over_lower_authority_permutation"
  ]
}
```

Implement this order:

```js
for (const claim of claims) {
  verifyEvidenceClaimV3(claim, context);
  const trust = requireValidClaimReceipt(claim, claimReceipts, sourceBindings);
  const activeDecision = reduceEvidenceClaimDecisions(decisions, claim.claimId);
  if (activeDecision.decision !== 'accepted') continue;
  buckets.add(semanticConflictKey(claim), { claim, authorityClass: trust.authorityClass });
}
for (const bucket of buckets.values()) {
  outcomes.push(adjudicateCompatibleClaims(bucket, policy));
}
return canonicalAdjudication(outcomes, inputSha256);
```

`semanticConflictKey` includes exact subject, field, measurement scope,
applicability and inclusions. Plausibility ranges may emit
`OUTSIDE_CATEGORY_REVIEW_RANGE`; they cannot reorder axes or alter a claim.
Authority comes only from the replayed source binding carried by the claim
receipt. A review-only or unknown class cannot win a tier comparison; it either
corroborates an identical value or causes quarantine. Keep the existing
reconciliation entrypoint as a V2 adapter during shadow operation.

- [ ] **Step 4: Run V3 and V2 reconciliation tests**

Run:

```bash
node --test tests/architecture-v3/evidence-adjudication-v3.test.mjs
node --test tests/architecture-v2/evidence-claim-reconciliation.test.mjs
```

Expected: all tests PASS, including exact current V2 acceptance and quarantine
fixtures.

- [ ] **Step 5: Commit deterministic arbitration**

```bash
git add data/architecture-v3/policies/evidence-arbitration-policy.json src/domain/evidence-adjudication-v3.mjs src/domain/evidence-claim-reconciliation.mjs tests/architecture-v3/evidence-adjudication-v3.test.mjs
git commit -m "feat(evidence): adjudicate claim conflicts deterministically"
```

### Task 11: Compute profile-scoped evidence readiness and converge Fit V4

**Files:**
- Create: `src/domain/evidence-readiness.mjs`
- Create: `src/shared/fit-v4.js`
- Create: `src/domain/fit-v4.mjs`
- Create: `tests/architecture-v3/evidence-readiness.test.mjs` <!-- doc-audit: ignore -->
- Create: `tests/architecture-v3/fit-v4.test.mjs` <!-- doc-audit: ignore -->
- Create: `tests/architecture-v3/evidence-readiness-fit-boundary.test.mjs` <!-- doc-audit: ignore -->
- Modify: `src/domain/fit-v3.mjs`
- Modify: `scripts/vendor-fit-engine.js`
- Modify: `tests/architecture-v2/fit-engine-vendor.test.mjs`
- Modify: `src/domain/accepted-evidence-publication.mjs`
- Test: `tests/architecture-v2/installation-knowledge-fit-v3.test.mjs`
- Test: `tests/architecture-v2/accepted-evidence-publication.test.mjs`
- Test: `tests/architecture-v2/browser-fit-contract.test.mjs`

**Interfaces:**
- Consumes: `buildEvidenceReadiness({ canonicalProductId, category, formFactor,
  acceptedClaims, claimReceipts, conflictFields, semantics })`.
- Produces: `{ schemaVersion: 1, canonicalProductId, state, dimensionsState,
  profiles, acceptedClaimIds, acceptedClaimReceiptIds, receiptSetSha256,
  conflictFields }`.
- Each profile in `profiles` is `{ profileId, state, requiredFields,
  missingHardFields, conflictFields, acceptedClaimIds,
  acceptedClaimReceiptIds, receiptSetSha256 }`; `state` is `UNKNOWN`,
  `PARTIAL`, `FIT_READY` or `CONFLICT_QUARANTINED`.
- Top-level `state` is one of `DIMENSIONS_UNKNOWN`, `DIMENSIONS_READY`,
  `INSTALLATION_PARTIAL`, `FIT_READY`, `CONFLICT_QUARANTINED`; top-level
  `FIT_READY` means `full_installation` is ready, not merely W/H/D.
- Produces `evaluateFitV4({ requirements, siteProfile, readinessProfile,
  evidenceSnapshotSha256, evaluationProfile }) -> FitDecisionV4` from one pure
  implementation shared by Node and browser. The evidence-readiness object
  itself has no outcome.

- [ ] **Step 1: Write failing readiness, lower-bound and parity tests**

```js
test('delivery evidence does not block cavity-placement readiness', () => {
  const result = buildEvidenceReadiness(cavityCompleteDeliveryUnknown());
  assert.equal(result.profiles.cavity_placement.state, 'FIT_READY');
  assert.equal(result.profiles.delivery.state, 'PARTIAL');
  assert.equal(result.state, 'INSTALLATION_PARTIAL');
  assert.equal(Object.hasOwn(result, 'outcome'), false);
});

test('receipt-bound W/H/D remains dimensions-only when clearance is absent', () => {
  const result = buildEvidenceReadiness(dimensionsOnlyInput());
  assert.equal(result.state, 'DIMENSIONS_READY');
  assert.equal(result.profiles.cavity_placement.state, 'PARTIAL');
  assert.ok(result.profiles.cavity_placement.missingHardFields.includes('installation.rearMm'));
});

test('known bare-product failure wins even when clearance is unknown', () => {
  const blocked = evaluateFitV4(knownWidthFailureWithOtherUnknowns());
  assert.equal(blocked.outcome, 'NO_FIT');
  assert.equal(blocked.checks.find((check) => check.id === 'placement.width').basis, 'known_lower_bound');
  const incomplete = evaluateFitV4(dimensionsOnlyPassingLowerBounds());
  assert.equal(incomplete.outcome, 'INSUFFICIENT_DATA');
});

test('VERIFIED_FIT requires ready profile and matching receipt set', () => {
  assert.equal(evaluateFitV4(completeExactInput()).outcome, 'VERIFIED_FIT');
  assert.equal(evaluateFitV4(receiptSetMismatch()).outcome, 'INSUFFICIENT_DATA');
});

test('Node and vendored browser Fit V4 return identical canonical output', () => {
  assert.deepEqual(evaluateFitV4(nodeFixture()), browserFitEngine.evaluateFitV4(nodeFixture()));
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
node --test tests/architecture-v3/evidence-readiness.test.mjs
node --test tests/architecture-v3/fit-v4.test.mjs
node --test tests/architecture-v3/evidence-readiness-fit-boundary.test.mjs
```

Expected: new modules are missing; the current engine also returns
`INSUFFICIENT_DATA`, not `NO_FIT`, for a bare width failure when side clearances
are unknown.

- [ ] **Step 3: Implement receipt-set readiness and one Fit V4 algorithm**

```js
export function buildEvidenceReadiness(input) {
  const accepted = indexReceiptValidAcceptedClaims(input);
  const valuesByField = valuesForRequirements(accepted);
  const profiles = Object.fromEntries(EVALUATION_PROFILES.map((evaluationProfile) => {
    const plan = getRequirementPlan(input.semantics, {
      category: input.category, formFactor: input.formFactor,
      evaluationProfile, valuesByField,
    });
    return [evaluationProfile, readinessForPlan(
      evaluationProfile, plan, accepted, input.conflictFields,
    )];
  }));
  const acceptedClaimIds = [...accepted.keys()].sort();
  const acceptedClaimReceiptIds = acceptedClaimIds
    .map((id) => accepted.get(id).claimReceiptId).sort();
  return freezeDeep({
    schemaVersion: 1,
    canonicalProductId: input.canonicalProductId,
    state: summarizeReadinessState(profiles, accepted, input.conflictFields),
    dimensionsState: dimensionsState(accepted),
    profiles,
    acceptedClaimIds,
    acceptedClaimReceiptIds,
    receiptSetSha256: canonicalJsonSha256(acceptedClaimReceiptIds),
    conflictFields: sortedUnique(input.conflictFields ?? []),
  });
}
```

`indexReceiptValidAcceptedClaims` rejects a claim without its exact Claim V3
receipt. `readinessForPlan` counts only fixed/range/boolean claims as satisfying
a required value; a `not_applicable` claim is evidence but cannot fill a hard
numeric requirement unless the category/form-factor plan itself marks that
field non-applicable. Profile conflicts are intersected with that profile's
fields. Delivery fields occur only in `delivery` and `full_installation`.

Fit V4 ports the existing rich Fit V3 check set into `src/shared/fit-v4.js` and
adds lower-bound checks before completeness checks:

```js
function evaluateAxis({ id, bareProductMm, completeRequiredMm, availableMm }) {
  if (Number.isFinite(bareProductMm) && Number.isFinite(availableMm)
      && bareProductMm > availableMm) {
    return axisResult(id, 'FAIL', bareProductMm, availableMm, 'known_lower_bound');
  }
  if (![completeRequiredMm, availableMm].every(Number.isFinite)) {
    return axisResult(id, 'UNKNOWN', completeRequiredMm, availableMm, 'incomplete_requirement');
  }
  return axisResult(
    id, completeRequiredMm <= availableMm ? 'PASS' : 'FAIL',
    completeRequiredMm, availableMm, 'complete_requirement',
  );
}
```

`evaluateFitV4` validates that `readinessProfile.profileId` equals the requested
evaluation profile and that its `receiptSetSha256` equals
`evidenceSnapshotSha256`. Outcome order is hard `FAIL`, placement `UNKNOWN`,
other required `UNKNOWN`, estimate use, then `VERIFIED_FIT`; the last outcome
also requires `readinessProfile.state === 'FIT_READY'`. It returns
`publicationEligible: false` in shadow.

Move reusable Fit V3 check logic into the shared V4 implementation rather than
copying it. `fit-v3.mjs` becomes a compatibility adapter with its existing
result shape and remains shadow-only. `vendor-fit-engine.js` vendors the exact
shared V4 bytes to `public/scripts/fit-engine.js`; the vendor test proves the
hash and Node/browser output parity. The shared browser build exposes only
`globalThis.FitEngineV4`; the Node wrapper imports that same implementation.
Keep the existing `FitEngine` global in place until Task 15 switches its
consumers, so shadow introduction cannot silently change current behaviour.

Add readiness only to the shadow acceptance projection. Do not write it into
active public JSON in this task. Preserve explicit zero only when allowed and
leave missing installation values `null`.

- [ ] **Step 4: Run focused, compatibility, publication and browser tests**

Run:

```bash
node scripts/vendor-fit-engine.js
node --test tests/architecture-v3/evidence-readiness.test.mjs tests/architecture-v3/fit-v4.test.mjs tests/architecture-v3/evidence-readiness-fit-boundary.test.mjs
node --test tests/architecture-v2/installation-knowledge-fit-v3.test.mjs
node --test tests/architecture-v2/fit-engine-vendor.test.mjs
node --test tests/architecture-v2/accepted-evidence-publication.test.mjs
node --test tests/architecture-v2/browser-fit-contract.test.mjs
```

Expected: all tests PASS; Fit V3 compatibility fixtures preserve their current
shape, V4 Node/browser results are identical, and no active public file changes
except the generated engine asset expected by the vendor hash test.

- [ ] **Step 5: Commit evidence readiness and Fit V4**

```bash
git add src/domain/evidence-readiness.mjs src/shared/fit-v4.js src/domain/fit-v4.mjs src/domain/fit-v3.mjs scripts/vendor-fit-engine.js public/scripts/fit-engine.js src/domain/accepted-evidence-publication.mjs tests/architecture-v3/evidence-readiness.test.mjs tests/architecture-v3/fit-v4.test.mjs tests/architecture-v3/evidence-readiness-fit-boundary.test.mjs tests/architecture-v2/fit-engine-vendor.test.mjs
git commit -m "feat(fit): add receipt-bound fit v4 shadow evaluation"
```

### Task 12: Build and audit the complete V3 chain in shadow

**Files:**
- Create: `scripts/architecture-v3/build-evidence-foundation-shadow.mjs` <!-- doc-audit: ignore -->
- Create: `scripts/architecture-v3/audit-evidence-foundation-shadow.mjs` <!-- doc-audit: ignore -->
- Create: `src/domain/evidence-foundation-shadow.mjs`
- Create: `tests/architecture-v3/evidence-foundation-shadow.test.mjs` <!-- doc-audit: ignore -->
- Create: `data/architecture-v3/reviews/automated/evidence-foundation-shadow.json`
- Modify: `package.json`
- Read only: `data/architecture-v2/generated/canonical-registry.json`
- Read only: `data/architecture-v2/generated/historical-document-family-graph.json`
- Read only: `data/architecture-v2/reviews/automated/installation-evidence-receipts.json`
- Read only: `data/architecture-v2/generated/public-catalog-projection.json`

**Interfaces:**
- Consumes: hashes and records from the existing V2 identity/evidence artifacts
  plus V3 registries, source bindings, claims, claim/relationship receipts,
  decisions, adjudication, readiness and fixed Fit V3/V4 comparison cases.
- Produces: a shadow report with `{ schemaVersion, generatedAt, inputHashes, summary, safetyViolations, differences, semanticSha256 }`.
- The builder accepts `--generated-at-from-input`; tests use a fixed timestamp. The audit exits non-zero when `safetyViolations` is non-empty.
- Private helpers in `evidence-foundation-shadow.mjs`:
  `verifyInputHashes(input) -> true`; `buildRegistries(input) -> { brand,
  productFamily, documentFamily, semantics }`; `loadV3TrustInputs(input,
  registries) -> { sourceBindings, claims, claimReceipts,
  relationshipReceipts, decisions }`; `buildAllEvidenceReadiness(...) ->
  EvidenceReadiness[]`; `compareFitV3V4(cases) -> FitComparison[]`;
  `summarize(...)`; `auditSafety(...) -> SafetyViolation[]`; and
  `compareWithV2(...) -> field-level differences`.

- [ ] **Step 1: Write failing shadow isolation tests**

```js
test('shadow build records independent stage counts and zero public writes', () => {
  const result = buildEvidenceFoundationShadow(fixture());
  assert.deepEqual(Object.keys(result.summary).sort(), [
    'acceptedClaims', 'artifactFragments', 'brands', 'cavityReadyProducts',
    'claimReceiptValidClaims', 'conflictFields', 'documentProfiles',
    'fitV4ParityCases', 'fullFitReadyProducts', 'productFamilyEdges',
    'verifiedSourceBindings',
  ]);
  assert.deepEqual(result.safetyViolations, []);
  assert.equal(result.summary.fullFitReadyProducts <= result.summary.cavityReadyProducts, true);
});

test('family-only field projection is a release-blocking violation', () => {
  const result = buildEvidenceFoundationShadow(familyLeakFixture());
  assert.deepEqual(result.safetyViolations.map((item) => item.code), ['FAMILY_SCOPE_PUBLICATION']);
});

test('unverified authority and replacement Fit leakage are release blockers', () => {
  const result = buildEvidenceFoundationShadow(untrustedAuthorityAndReplacementFitFixture());
  assert.deepEqual(result.safetyViolations.map((item) => item.code).sort(), [
    'REPLACEMENT_FIT_V4_LEAK', 'UNVERIFIED_SOURCE_AUTHORITY',
  ]);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/architecture-v3/evidence-foundation-shadow.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for
`evidence-foundation-shadow.mjs`.

- [ ] **Step 3: Implement one-way shadow assembly and audit**

```js
export function buildEvidenceFoundationShadow(input) {
  verifyInputHashes(input);
  const registries = buildRegistries(input);
  const trust = loadV3TrustInputs(input, registries);
  const adjudication = adjudicateEvidenceClaimsV3({ ...input, ...trust });
  const readiness = buildAllEvidenceReadiness(input, trust, adjudication, registries.semantics);
  const fitComparisons = compareFitV3V4(input.fitComparisonCases);
  const semantic = {
    inputHashes: input.inputHashes,
    summary: summarize(registries, trust, adjudication, readiness, fitComparisons),
    safetyViolations: auditSafety(registries, trust, adjudication, readiness, fitComparisons),
    differences: compareWithV2(input.publicProjection, adjudication, readiness, fitComparisons),
  };
  return { schemaVersion: 1, generatedAt: input.generatedAt, ...semantic, semanticSha256: canonicalJsonSha256(semantic) };
}
```

Add package scripts:

```json
{
  "build:architecture-v3:shadow": "node scripts/architecture-v3/build-evidence-foundation-shadow.mjs --generated-at-from-input",
  "audit:architecture-v3:shadow": "node scripts/architecture-v3/audit-evidence-foundation-shadow.mjs"
}
```

The builder may write only under `data/architecture-v3/`. It must reject output
paths under `public/`, `data/architecture-v2/releases/` and the external object
store.

- [ ] **Step 4: Prove isolation, determinism and full regression**

Run:

```bash
find public -type f -exec shasum -a 256 {} \; | LC_ALL=C sort > /tmp/fitappliance-public-before.sha256
npm run build:architecture-v3:shadow # <!-- doc-audit: ignore -->
npm run audit:architecture-v3:shadow # <!-- doc-audit: ignore -->
cp data/architecture-v3/reviews/automated/evidence-foundation-shadow.json /tmp/fitappliance-v3-shadow-first.json
npm run build:architecture-v3:shadow # <!-- doc-audit: ignore -->
cmp /tmp/fitappliance-v3-shadow-first.json data/architecture-v3/reviews/automated/evidence-foundation-shadow.json
find public -type f -exec shasum -a 256 {} \; | LC_ALL=C sort > /tmp/fitappliance-public-after.sha256
cmp /tmp/fitappliance-public-before.sha256 /tmp/fitappliance-public-after.sha256
npm test
npm run audit:fit-publication
```

Expected: both `cmp` commands exit 0, all tests PASS, the shadow audit has zero
safety violations and the active Fit publication audit has zero violations.

- [ ] **Step 5: Commit the shadow control plane**

```bash
git add package.json src/domain/evidence-foundation-shadow.mjs scripts/architecture-v3/build-evidence-foundation-shadow.mjs scripts/architecture-v3/audit-evidence-foundation-shadow.mjs tests/architecture-v3/evidence-foundation-shadow.test.mjs data/architecture-v3/reviews/automated/evidence-foundation-shadow.json
git commit -m "feat(evidence): add architecture v3 shadow audit"
```

### Task 13: Validate brand and document-family differences with real canaries

**Files:**
- Create: `data/architecture-v3/policies/document-profile-canaries.json`
- Create: `src/domain/document-profile-canary.mjs`
- Create: `scripts/architecture-v3/build-document-profile-canaries.mjs` <!-- doc-audit: ignore -->
- Create: `scripts/architecture-v3/audit-document-profile-canaries.mjs` <!-- doc-audit: ignore -->
- Create: `tests/architecture-v3/document-profile-canary.test.mjs` <!-- doc-audit: ignore -->
- Modify: `data/architecture-v3/policies/document-family-profiles.json`
- Modify: `package.json`
- Read external, never modify: `/Volumes/UGREEN-1TB/FitAppliance/manual-evidence/`

**Interfaces:**
- Consumes: `runDocumentProfileCanary({ canary, profile, sourceArtifact, derivedArtifacts })`.
- Produces: `{ canaryId, profileId, status, candidateClaims, expectedClaims, forbiddenClaims, artifactHashes, reasonCodes }`.
- Every active profile requires at least one positive source hash and two negative source hashes. A negative source is one that resembles the profile but must not produce the protected claim.

- [ ] **Step 1: Write failing coverage and extraction tests**

```js
test('active profiles require one positive and two negative hash-bound witnesses', () => {
  assert.throws(() => validateCanaryCoverage({
    profiles: [activeProfile('profile_a')],
    canaries: [positiveCanary('profile_a')],
  }), /two negative canaries required/);
});

test('H x W x D, capacity and open-door values remain distinct', () => {
  const result = runDocumentProfileCanary(mixedSemanticFixture());
  assert.deepEqual(result.candidateClaims.map((claim) => claim.field).sort(), [
    'capacity.netLitres', 'closedEnvelope.depthMm', 'closedEnvelope.heightMm',
    'closedEnvelope.widthMm', 'operation.doorOpenDepthMm',
  ]);
  assert.equal(result.status, 'pass');
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/architecture-v3/document-profile-canary.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for
`document-profile-canary.mjs`.

- [ ] **Step 3: Implement canary selection and activation gates**

The canary policy stores hashes and expected semantics, never machine-specific
paths:

```js
const canaryRecord = {
  canaryId: 'canary_smeg_dishwasher_legend_positive_1',
  profileId: 'smeg_dishwasher_legend_v1',
  polarity: 'positive',
  sourcePdfSha256: sourceArtifact.contentSha256,
  derivedArtifactSha256: derivedArtifact.contentSha256,
  expectedClaims: [
    { field: 'closedEnvelope.widthMm', canonicalValue: 598, page: 7 },
  ],
  forbiddenFields: ['delivery.widthMm'],
};
```

The inventory builder groups available PDFs by inspected structure, then selects
coverage for all of these classes: vector table, multi-model matrix, scanned
page, hybrid page, letter legend, technical diagram, each observed W/H/D order,
centimetre source, adjustable height and capacity adjacent to dimensions. Brand
is a grouping dimension, not a parser assumption.

Add package scripts:

```json
{
  "build:architecture-v3:document-canaries": "node scripts/architecture-v3/build-document-profile-canaries.mjs",
  "audit:architecture-v3:document-canaries": "node scripts/architecture-v3/audit-document-profile-canaries.mjs"
}
```

If the installed MinerU image fallback cannot recover a required scan or
diagram, benchmark an OCR executor behind the Task 6 interface. Unlimited OCR
Works may be evaluated as one candidate only after recording its repository URL,
license, pinned commit, model assets, install commands, output schema and five
positive/five negative canary results. It cannot be installed by piping remote
code into a shell and cannot become a receipt authority.

- [ ] **Step 4: Run canaries against the mounted evidence and re-run shadow audit**

Run:

```bash
FIT_EVIDENCE_ROOT=/Volumes/UGREEN-1TB/FitAppliance/manual-evidence
node scripts/architecture-v3/build-document-profile-canaries.mjs --evidence-root "$FIT_EVIDENCE_ROOT" # <!-- doc-audit: ignore -->
node scripts/architecture-v3/audit-document-profile-canaries.mjs # <!-- doc-audit: ignore -->
npm run test:architecture-v3 # <!-- doc-audit: ignore -->
npm run build:architecture-v3:shadow # <!-- doc-audit: ignore -->
npm run audit:architecture-v3:shadow # <!-- doc-audit: ignore -->
```

Expected: every active profile passes all positive and negative canaries; any
unsupported or ambiguous document remains candidate-only; shadow safety
violations remain zero.

- [ ] **Step 5: Commit only policies, code and hash-bound results**

```bash
git add package.json data/architecture-v3/policies/document-profile-canaries.json data/architecture-v3/policies/document-family-profiles.json src/domain/document-profile-canary.mjs scripts/architecture-v3/build-document-profile-canaries.mjs scripts/architecture-v3/audit-document-profile-canaries.mjs tests/architecture-v3/document-profile-canary.test.mjs
git commit -m "test(evidence): gate document profiles with real canaries"
```

Do not stage PDFs, page images, OCR model assets, absolute external paths or
unreviewed extracted claims.

### Task 14: Feed reviewed V3 evidence into the existing release control plane

**Files:**
- Create: `src/domain/architecture-v3-evidence-overlay.mjs`
- Create: `scripts/architecture-v3/build-evidence-publication-overlay.mjs` <!-- doc-audit: ignore -->
- Create: `scripts/architecture-v3/audit-evidence-publication-overlay.mjs` <!-- doc-audit: ignore -->
- Create: `tests/architecture-v3/architecture-v3-evidence-overlay.test.mjs` <!-- doc-audit: ignore -->
- Create: `tests/architecture-v3/verified-fit-publication-boundary.test.mjs` <!-- doc-audit: ignore -->
- Create: `data/architecture-v3/reviews/automated/evidence-publication-overlay.json`
- Modify: `src/domain/accepted-evidence-publication.mjs`
- Modify: `src/domain/public-projection.mjs`
- Modify: `src/domain/retail-lifecycle-release-candidate.mjs`
- Modify: `src/domain/active-retail-release.mjs`
- Modify: `scripts/architecture-v2/build-public-projection.mjs`
- Modify: `scripts/architecture-v2/build-historical-appliance-reference.mjs`
- Modify: `scripts/architecture-v2/build-retail-lifecycle-release-candidate.mjs`
- Modify: `scripts/architecture-v2/publish-active-retail-release.mjs`
- Modify: `scripts/architecture-v2/audit-fit-publication.mjs`
- Modify: `scripts/build-evidence-index.js`
- Modify: `scripts/generate-product-pages.js`
- Modify: `scripts/schema.js`
- Test: `tests/architecture-v2/accepted-evidence-publication.test.mjs`
- Test: `tests/architecture-v2/retail-lifecycle-release-candidate.test.mjs`
- Test: `tests/architecture-v2/active-retail-release.test.mjs`
- Test: `tests/architecture-v2/fit-publication-audit.test.mjs`
- Test: `tests/architecture-v2/historical-replacement-audit.test.mjs`

**Interfaces:**
- Consumes: receipt-valid accepted Claim V3 IDs, verified source bindings,
  action-scoped rights, evidence readiness, canonical identity, current retail
  lifecycle IDs and historical-reference IDs.
- Produces: `buildArchitectureV3EvidenceOverlay(input) -> {
  currentCatalogByProductId, historicalDimensionsByProductId,
  publicEvidenceIndex, readinessByProductId, violations, semanticSha256 }`.
- The overlay never decides sales lifecycle, writes active public files or owns
  a release pointer. Existing public/historical builders consume separate
  lanes; the existing retail release-candidate schema v2 binds the overlay hash
  and remains the only promotion/rollback control plane.
- Private helpers: `indexReceiptValidClaims(...)`,
  `requirePublicDisplayRight(...)`, `projectCurrentEvidence(...)`,
  `projectHistoricalDimensions(...)`, `projectPublicEvidenceIndex(...)` and
  `auditEvidenceOverlay(...)`.

- [ ] **Step 1: Write failing field, rights and release-integration tests**

```js
test('current overlay emits only accepted, receipt-valid, display-authorised fields', () => {
  const result = buildArchitectureV3EvidenceOverlay(receiptBoundWidthOnly());
  const product = result.currentCatalogByProductId[CURRENT_ID];
  assert.equal(product.geometry.closedEnvelope.widthMm, 598);
  assert.equal(product.geometry.operation?.doorOpenDepthMm ?? null, null);
  assert.deepEqual(result.violations, []);
  assert.throws(() => buildArchitectureV3EvidenceOverlay(publicDisplayUnknown()), /PUBLIC_DISPLAY_RIGHT_BLOCKED/);
});

test('current and historical replacement lanes cannot donate to each other', () => {
  const result = buildArchitectureV3EvidenceOverlay(archivedReplacementFixture());
  assert.equal(Object.hasOwn(result.currentCatalogByProductId, ARCHIVED_ID), false);
  assert.deepEqual(Object.keys(result.historicalDimensionsByProductId[ARCHIVED_ID]).sort(), [
    'depthMm', 'heightMm', 'widthMm',
  ]);
  assert.equal(Object.hasOwn(result.historicalDimensionsByProductId[ARCHIVED_ID], 'evidenceReadiness'), false);
});

test('static projections contain readiness but never Fit outcomes', () => {
  const result = buildArchitectureV3EvidenceOverlay(fitReadyFixture());
  const product = result.currentCatalogByProductId[CURRENT_ID];
  assert.equal(product.evidenceReadiness.profiles.cavity_placement.state, 'FIT_READY');
  for (const key of ['fitDecision', 'fitDecisionV4', 'successfulFitOutcome', 'verifiedFitEligible']) {
    assert.equal(Object.hasOwn(product, key), false);
  }
  assert.notEqual(product.evidence?.trust_level, 'verified_fit');
});

test('existing release candidate v2 binds the V3 overlay and v1 still replays', () => {
  const release = buildRetailLifecycleReleaseCandidate(releaseFixtureWithV3Overlay());
  assert.equal(release.schemaVersion, 2);
  assert.equal(release.sourceBindings.architectureV3EvidenceOverlaySha256, OVERLAY_SHA256);
  assert.doesNotThrow(() => validateRetailLifecycleReleaseCandidate(legacyV1Release()));
});
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```bash
node --test tests/architecture-v3/architecture-v3-evidence-overlay.test.mjs tests/architecture-v3/verified-fit-publication-boundary.test.mjs
node --test tests/architecture-v2/retail-lifecycle-release-candidate.test.mjs tests/architecture-v2/active-retail-release.test.mjs
```

Expected: the overlay module is missing and release schema 1 does not yet bind
the Architecture V3 input.

- [ ] **Step 3: Build two narrow overlays and extend, not replace, release v1**

```js
export function buildArchitectureV3EvidenceOverlay(input) {
  verifyOverlayInputs(input);
  const accepted = indexReceiptValidClaims(input);
  const current = projectCurrentEvidence(
    accepted, input.currentCanonicalProductIds, input.readinessByProductId,
  );
  const historical = projectHistoricalDimensions(
    accepted, input.historicalCanonicalProductIds,
  );
  const publicEvidenceIndex = projectPublicEvidenceIndex(accepted, input);
  const violations = auditEvidenceOverlay({ current, historical, publicEvidenceIndex, accepted });
  if (violations.length) throw new Error(violations.map((item) => item.code).join(','));
  const semantic = {
    inputHashes: input.inputHashes,
    currentCatalogByProductId: current,
    historicalDimensionsByProductId: historical,
    publicEvidenceIndex,
    readinessByProductId: pickCurrentReadiness(input.readinessByProductId, current),
  };
  return freezeDeep({ schemaVersion: 1, ...semantic,
    semanticSha256: canonicalJsonSha256(semantic), violations: [],
  });
}
```

`indexReceiptValidClaims` replays Claim V3, claim receipt, source binding,
decision and adjudication. `requirePublicDisplayRight` evaluates the existing
field/action rights contract for each source/field/action tuple. A missing,
expired, withdrawn or denied `public_display` decision excludes the field and
blocks a candidate. `quote_excerpt` and `link_documents` are checked separately;
the evidence index omits content that lacks that action right.

The current lane may contain accepted fields plus evidence readiness. The
historical replacement lane may contain only accepted closed-envelope W/H/D and
receipt references; it contains no clearance, operation, service, readiness or
Fit state. Neither lane can add/remove current retail membership.

Extend `build-public-projection.mjs` and
`build-historical-appliance-reference.mjs` to accept the appropriate lane as an
explicit hash-bound input. Extend `retail-lifecycle-release-candidate.mjs` to
schema 2 with `architectureV3EvidenceOverlaySha256` in `sourceBindings`; retain
a complete schema-1 validation/replay branch. The existing candidate builder,
impact decision, active-release pointer, `publish:active-retail-release` and
rollback remain the only release flow. No Architecture V3 script copies to
`public/data` or creates another authorization manifest.

Make product/evidence page generators consume the active projection's
`evidenceReadiness`; render `Fit requirements verified` only for the selected
ready profile and never translate a geometry level into `verified_fit`.
`verified_fit` remains readable solely for legacy audit/replay, and an
Architecture V3 candidate containing it is a publication violation.

- [ ] **Step 4: Run all overlay and existing release gates without promotion**

Run:

```bash
node --test tests/architecture-v3/architecture-v3-evidence-overlay.test.mjs tests/architecture-v3/verified-fit-publication-boundary.test.mjs
node --test tests/architecture-v2/accepted-evidence-publication.test.mjs
node --test tests/architecture-v2/retail-lifecycle-release-candidate.test.mjs tests/architecture-v2/active-retail-release.test.mjs
node --test tests/architecture-v2/fit-publication-audit.test.mjs tests/architecture-v2/historical-replacement-audit.test.mjs
node scripts/architecture-v3/build-evidence-publication-overlay.mjs # <!-- doc-audit: ignore -->
node scripts/architecture-v3/audit-evidence-publication-overlay.mjs # <!-- doc-audit: ignore -->
npm run build:retail-lifecycle-release-candidate -- --architecture-v3-overlay data/architecture-v3/reviews/automated/evidence-publication-overlay.json
npm test
npm run audit:fit-publication
```

Expected: all tests and audits PASS; the existing candidate impact report lists
every changed product/field, existing active-release/public hashes remain
unchanged, release v1 fixtures replay, and no promotion command runs.

- [ ] **Step 5: Review impact and commit only overlay/candidate machinery**

Review the existing retail cutover impact report with the owner. This task does
not run `decide:retail-cutover` or `publish:active-retail-release`; a later,
explicit authorization uses those existing controls.

```bash
git add data/architecture-v3/reviews/automated/evidence-publication-overlay.json src/domain/architecture-v3-evidence-overlay.mjs src/domain/accepted-evidence-publication.mjs src/domain/public-projection.mjs src/domain/retail-lifecycle-release-candidate.mjs src/domain/active-retail-release.mjs scripts/architecture-v3/build-evidence-publication-overlay.mjs scripts/architecture-v3/audit-evidence-publication-overlay.mjs scripts/architecture-v2/build-public-projection.mjs scripts/architecture-v2/build-historical-appliance-reference.mjs scripts/architecture-v2/build-retail-lifecycle-release-candidate.mjs scripts/architecture-v2/publish-active-retail-release.mjs scripts/architecture-v2/audit-fit-publication.mjs scripts/build-evidence-index.js scripts/generate-product-pages.js scripts/schema.js tests/architecture-v3/architecture-v3-evidence-overlay.test.mjs tests/architecture-v3/verified-fit-publication-boundary.test.mjs tests/architecture-v2/retail-lifecycle-release-candidate.test.mjs tests/architecture-v2/active-retail-release.test.mjs
git commit -m "feat(evidence): bind v3 evidence into the existing release candidate"
```

### Task 15: Add the staged evidence drawer and honest Fit copy

**Files:**
- Create: `public/scripts/ui/evidence-drawer.js`
- Create: `tests/evidence-drawer.test.mjs` <!-- doc-audit: ignore -->
- Create: `tests/architecture-v3/search-core-evidence-readiness.test.mjs` <!-- doc-audit: ignore -->
- Modify: `public/scripts/search-core.js`
- Modify: `public/scripts/search-dom.js`
- Modify: `public/scripts/ui/product-card.js`
- Modify: `public/scripts/ui/provenance.js`
- Modify: `public/scripts/ui/range-filters.js`
- Modify: `public/styles.css`
- Modify: `public/styles-deferred.css`
- Modify: `tests/evidence-ui.test.mjs`
- Modify: `tests/provenance.test.mjs`
- Modify: `tests/card-fit-score-integration.test.mjs`
- Modify: `tests/range-filters.test.mjs`
- Modify: `tests/search-dom.test.mjs`

**Interfaces:**
- Consumes: public `evidenceReadiness`, accepted field receipts and an optional
  current-session `fitDecisionV4` produced by `SearchCore` after cavity input.
- Produces: `renderEvidenceDrawer({ readiness, fieldReceipts }) -> string` and revised provenance/card rendering.
- `SearchCore` emits independent `sizeMatch` and `fitDecisionV4` objects and
  never reads persisted product Fit decisions; replacement may emit
  `sizeMatch` but strips Fit V4 and evidence readiness.
- Product evidence never causes the copy `Verified Fit`; only a current-session
  `fitDecisionV4.outcome === 'VERIFIED_FIT'` may do so.

- [ ] **Step 1: Write failing trust-copy and accessible-drawer tests**

```js
test('legacy product fitDecision cannot display Verified Fit', () => {
  const html = buildCard(productWithStoredVerifiedFit(), { evidenceIndex: readinessIndex() });
  assert.doesNotMatch(html, /Verified Fit/);
  assert.match(html, /Fit requirements verified/);
});

test('dimension readiness remains useful without a positive fit claim', () => {
  const html = buildCard(dimensionsReadyProduct(), { evidenceIndex: dimensionsIndex() });
  assert.match(html, /Dimensions verified/);
  assert.match(html, /Installation evidence incomplete/);
  assert.doesNotMatch(html, /Verified Fit/);
});

test('manufacturer mode keeps an insufficient-data dimension match', () => {
  const [result] = SearchCore.findSearchMatches(
    [dimensionsReadyProduct()], completeCavityFilters(),
    { clearanceMode: 'manufacturer' },
  );
  assert.equal(result.fitDecisionV4.outcome, 'INSUFFICIENT_DATA');
  assert.equal(result.sizeMatch.status, 'MATCH');
  assert.equal(result.w, 598);
});

test('evidence filter means FIT_READY, not any captured PDF', () => {
  const rows = applySliderFilters([capturedPdfOnly(), fitReadyProduct()], { verifiedOnly: true });
  assert.deepEqual(rows.map((row) => row.id), ['fit-ready']);
});

test('drawer links every field to source, page and receipt', () => {
  const html = renderEvidenceDrawer(validDrawerInput());
  assert.match(html, /<details/);
  assert.match(html, /Width.*598 mm/s);
  assert.match(html, /Page 7/);
  assert.match(html, /Official source/);
  assert.match(html, /Receipt/);
});

test('replacement emits sizeMatch but never Fit V4', () => {
  const [result] = SearchCore.findReplacementMatches([replacementProduct()], replacementInput());
  assert.equal(result.sizeMatch.status, 'MATCH');
  assert.equal(Object.hasOwn(result, 'fitDecisionV4'), false);
  assert.equal(Object.hasOwn(result, 'evidenceReadiness'), false);
});
```

- [ ] **Step 2: Run UI tests and verify they fail**

Run:

```bash
node --test tests/evidence-drawer.test.mjs
node --test tests/architecture-v3/search-core-evidence-readiness.test.mjs
node --test tests/evidence-ui.test.mjs tests/provenance.test.mjs tests/card-fit-score-integration.test.mjs tests/range-filters.test.mjs tests/search-dom.test.mjs
```

Expected: the new module is missing and at least the stored-`Verified Fit` copy
assertion fails under the old renderer.

- [ ] **Step 3: Implement a no-framework, fail-closed drawer**

```js
export function renderEvidenceDrawer({ readiness, fieldReceipts }) {
  if (!readiness || !Array.isArray(fieldReceipts) || fieldReceipts.length === 0) return '';
  const rows = fieldReceipts.map((receipt) => renderFieldReceipt(receipt)).join('');
  return `<details class="evidence-drawer">
    <summary>View measurement evidence</summary>
    <dl class="evidence-drawer__fields">${rows}</dl>
  </details>`;
}
```

In the same module, `renderFieldReceipt(receipt)` returns one escaped `<dt>` and
`<dd>` pair containing field label, canonical value/unit, source link, page and
short receipt ID. `isSafePublicSourceUrl(value)` accepts only `http:` and
`https:` and rejects credentials. Both helpers are private and covered by a
`javascript:` URL negative test.

When the public evidence index contains a rights-approved rendered-page image,
the drawer may show it with a CSS/SVG highlight derived from the normalised
bbox. The image must be a public content-addressed asset and the bbox must bind
the same rendered-page hash. Local object-store paths, raw PDF paths and
unapproved excerpts never reach HTML.

Escape all text and allow only HTTP(S) public source URLs. Render page/bbox
metadata but never local object paths. Change `getEvidenceTrustLevel` and
`renderProvenanceBlock` so product evidence renders `Dimensions verified`,
`Installation evidence incomplete`, or `Fit requirements verified`. Pass the
current-session Fit V4 decision from `SearchCore`; do not read persisted Fit
decisions when choosing trust copy. In `search-core.js`, replace the local
receipt-field reimplementation with the selected
`evidenceReadiness.profiles.cavity_placement` object and call
`FitEngineV4.evaluateFitV4` with the active evidence snapshot hash. Remove the
branch that discards manufacturer-mode `INSUFFICIENT_DATA`. Return independent
`sizeMatch` and `fitDecisionV4` so W/H/D filtering stays useful. In
`range-filters.js`, accept only
`evidenceReadiness.profiles.cavity_placement.state === 'FIT_READY'`; in
`search-dom.js`, change the facet copy from `Verified Fit only` to
`Fit requirements verified` while retaining the `verifiedOnly` URL key for
backward-compatible links. Rename the internal and exported range helper from
`isVerifiedFit` to `isFitReady(product, profileId = 'cavity_placement')` and
update all local consumers in the same commit. Gate the drawer behind
`globalThis.FITAPPLIANCE_FLAGS?.evidenceDrawerV1 === true` for the first release.

- [ ] **Step 4: Run automated and browser verification**

Run:

```bash
node --test tests/evidence-drawer.test.mjs tests/architecture-v3/search-core-evidence-readiness.test.mjs tests/evidence-ui.test.mjs tests/provenance.test.mjs tests/card-fit-score-integration.test.mjs tests/range-filters.test.mjs tests/search-dom.test.mjs
npm test
npm run build
```

Then verify desktop and mobile with the flag off and on:

1. dimensions-only card keeps size filtering and never displays `Verified Fit`;
2. missing installation evidence shows `INSUFFICIENT_DATA` after cavity entry;
3. known oversize width shows `NO_FIT`;
4. drawer keyboard focus, summary expansion, source link and page label work;
5. replacement results show `Size Match` and contain no `fitDecisionV4`; and
6. no local path, claim payload or internal object-store URL is exposed.

Expected: all tests and production build PASS; screenshots at 390 px and 1440 px
show no overlap or misleading badge.

- [ ] **Step 5: Commit the staged UI**

```bash
git add public/scripts/search-core.js public/scripts/search-dom.js public/scripts/ui/evidence-drawer.js public/scripts/ui/product-card.js public/scripts/ui/provenance.js public/scripts/ui/range-filters.js public/styles.css public/styles-deferred.css tests/evidence-drawer.test.mjs tests/architecture-v3/search-core-evidence-readiness.test.mjs tests/evidence-ui.test.mjs tests/provenance.test.mjs tests/card-fit-score-integration.test.mjs tests/range-filters.test.mjs tests/search-dom.test.mjs
git commit -m "feat(ui): show field receipts without overstating fit"
```

## Programme verification

After Task 15, run all checks on the same commit:

```bash
npm run test:architecture-v3 # <!-- doc-audit: ignore -->
npm test
npm run lint
npm run build:architecture-v3:document-canaries # <!-- doc-audit: ignore -->
npm run audit:architecture-v3:document-canaries # <!-- doc-audit: ignore -->
npm run build:architecture-v3:shadow # <!-- doc-audit: ignore -->
npm run audit:architecture-v3:shadow # <!-- doc-audit: ignore -->
node scripts/architecture-v3/audit-evidence-publication-overlay.mjs # <!-- doc-audit: ignore -->
npm run audit:fit-publication
npm run audit:historical-replacement
npm run build
git status --short
```

Expected final state:

- all tests and builds pass;
- zero V3 shadow safety violations;
- zero active Fit publication violations;
- zero replacement/cavity destination leaks;
- Node and browser Fit V4 produce identical canonical decisions;
- every active parser profile has one positive and two negative real canaries;
- every accepted Claim V3 has a replay-valid Claim Receipt schema 1 and
  authority-specific Source Binding schema 1;
- every publicly projected field has the required action-scoped rights;
- every accepted family-derived field has an exact target claim plus verified
  relationship assertions;
- dimensions-only products remain filterable but cannot display
  `VERIFIED_FIT`;
- two same-input V3 builds are byte-identical; and
- `git status` contains only the intended implementation changes.

## Rollback contract

Rollback never deletes evidence. Revert the affected implementation PR and
select the previous release manifest. Keep Claim V3 objects, decision events,
canary results and derived artifacts for audit history. If a parser profile is
unsafe, set its policy status to `disabled`, rebuild the shadow outputs and
leave affected fields unknown until reviewed evidence is available.

## Plan completion record

For each task, append the implementation PR URL, commit SHA, focused-test result,
full-test result, generated artifact hashes, unresolved quarantines and reviewer
decision beneath that task. Do not mark the programme complete while any
cutover gate in the specification is unmet.
