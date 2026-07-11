# Architecture V2 Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only Architecture V2 domain kernel and shadow audit without changing any production output.

**Architecture:** Pure ESM domain modules under `src/domain/` define canonical identity, geometry, evidence, and FitDecision contracts. A legacy adapter converts current runtime rows into unverified shadow products, and a CLI audits the current catalog without writing it. Production pages and generators do not import the new modules in Phase 0.

**Tech Stack:** Node.js 20+, ESM `.mjs`, built-in `node:test`, built-in `node:assert`, no new dependencies.

## Global Constraints

- Unknown values remain `null` or UNKNOWN and are never coerced to zero.
- New domain functions do not mutate inputs.
- Product identity uses exact scheme-scoped identifiers; no fuzzy matching.
- Temporary `fa_shadow_*` IDs are deterministic audit identifiers and are never
  persisted or emitted in public projections.
- Retailer observations cannot become manufacturer evidence.
- Phase 0 code is read-only with respect to `data/`, `public/data/`, `pages/`, and `reports/`.
- Existing URLs, labels, Fit behavior, and generated output remain unchanged.
- Every behavior change follows RED-GREEN-REFACTOR.

---

### Task 1: Canonical product identity

**Files:**
- Create: `src/domain/identity.mjs`
- Create: `tests/architecture-v2/identity.test.mjs`

**Interfaces:**
- Produces: `normalizeIdentifier(scheme, value) -> string`
- Produces: `createShadowProductId(legacyRuntimeId) -> string`
- Produces: `createCanonicalProduct(input) -> frozen CanonicalProduct`
- Produces: `findIdentifier(product, scheme) -> ExternalIdentifier | null`

- [ ] **Step 1: Write failing identity tests**

Cover opaque canonical IDs, scheme-scoped normalization, duplicate rejection,
invalid categories, and input immutability. Use `fa_00000001` as the fixture ID.
Also assert that `createShadowProductId` is deterministic, opaque, and starts
with `fa_shadow_`.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/architecture-v2/identity.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/domain/identity.mjs`.

- [ ] **Step 3: Implement the minimum identity contract**

Use explicit allowed categories and identifier schemes. Trim every identifier,
uppercase manufacturer and GEMS model identifiers, lowercase FitAppliance
legacy IDs, reject empty or duplicate `(scheme, value)` pairs, and return new
frozen objects and arrays. Use built-in `node:crypto` SHA-256 for temporary
shadow IDs; do not hash brand or display model text.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/architecture-v2/identity.test.mjs`

Expected: all identity tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/identity.mjs tests/architecture-v2/identity.test.mjs
git commit -m "feat: add canonical product identity contract"
```

### Task 2: Geometry contract

**Files:**
- Create: `src/domain/geometry.mjs`
- Create: `tests/architecture-v2/geometry.test.mjs`

**Interfaces:**
- Produces: `createGeometry(input) -> frozen ProductGeometry`
- Produces: `requiredInstallationEnvelope(geometry) -> envelope | null`
- Consumes: millimetre values or `null`; no string coercion.

- [ ] **Step 1: Write failing geometry tests**

Cover positive finite measurements, adjustable height ranges, unknown
clearances, rejection of zero/negative/NaN values, and no input mutation.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/architecture-v2/geometry.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/domain/geometry.mjs`.

- [ ] **Step 3: Implement geometry and installation-envelope calculation**

`requiredInstallationEnvelope` returns `null` when a closed dimension or its
required clearance is unknown. Width equals product width plus left and right;
height uses maximum product height plus top; depth equals closed depth plus rear
and front.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/architecture-v2/geometry.test.mjs`

Expected: all geometry tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/geometry.mjs tests/architecture-v2/geometry.test.mjs
git commit -m "feat: add explicit product geometry contract"
```

### Task 3: Field-level evidence approval gate

**Files:**
- Create: `src/domain/evidence.mjs`
- Create: `tests/architecture-v2/evidence.test.mjs`

**Interfaces:**
- Produces: `createFieldEvidence(input) -> frozen FieldEvidence`
- Produces: `canApproveEvidence(input) -> { approved, reasons }`
- Produces: `evidenceLevel(records) -> 'none' | 'dimensions' | 'verified'`

- [ ] **Step 1: Write failing evidence tests**

Cover required SHA-256, page, quote, parser version, exact/approved-alias
identity matching, retailer-hosted evidence rejection, and dimensions-only
versus dimensions-plus-clearance levels.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/architecture-v2/evidence.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/domain/evidence.mjs`.

- [ ] **Step 3: Implement evidence validation**

Return every rejection reason rather than stopping at the first. `approved`
status is accepted only when the approval gate is satisfied. Keep document
authorship separate from transport host.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/architecture-v2/evidence.test.mjs`

Expected: all evidence tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/evidence.mjs tests/architecture-v2/evidence.test.mjs
git commit -m "feat: require reproducible field evidence"
```

### Task 4: Deterministic FitDecision

**Files:**
- Create: `src/domain/fit-decision.mjs`
- Create: `tests/architecture-v2/fit-decision.test.mjs`
- Create: `tests/fixtures/architecture-v2/golden-fit-cases.json`

**Interfaces:**
- Consumes: `ProductGeometry`, cavity `{ widthMm, heightMm, depthMm }`,
  `evidenceLevel`, and applicable advisory checks.
- Produces: `evaluateFit(input) -> FitDecision`

- [ ] **Step 1: Add golden fixtures and failing tests**

Fixtures must cover `VERIFIED_FIT`, `NO_FIT`, `INSUFFICIENT_DATA`,
`LIKELY_FIT_ESTIMATED`, and `CONDITIONAL_FIT`. Assert per-axis required,
available, and spare values as well as final outcome.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/architecture-v2/fit-decision.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for
`src/domain/fit-decision.mjs`.

- [ ] **Step 3: Implement outcome precedence and tri-state checks**

Evaluate width, height, and depth as required checks. Apply the precedence from
the design document exactly. Do not create a numeric Fit score.

- [ ] **Step 4: Verify GREEN and fixture determinism**

Run: `node --test tests/architecture-v2/fit-decision.test.mjs`

Expected: all five outcome fixtures pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/fit-decision.mjs tests/architecture-v2/fit-decision.test.mjs tests/fixtures/architecture-v2/golden-fit-cases.json
git commit -m "feat: add deterministic fit decisions"
```

### Task 5: Legacy read-only adapter

**Files:**
- Create: `src/adapters/legacy-appliance.mjs`
- Create: `tests/architecture-v2/legacy-appliance.test.mjs`

**Interfaces:**
- Consumes: one legacy runtime product and optional slim evidence-index entry.
- Produces: `adaptLegacyAppliance(input) -> { status, product, geometry, warnings, errors }`.
- Consumes: `createCanonicalProduct` and `createGeometry` from Tasks 1 and 2.

- [ ] **Step 1: Write failing adapter tests**

Cover a valid `w/h/d` row, missing dimensions, obvious upright-fridge axis
inversion, retailer-only evidence, preservation of the legacy ID, and input
immutability.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/architecture-v2/legacy-appliance.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for the adapter.

- [ ] **Step 3: Implement conservative adaptation**

Use legacy dimensions only as unverified values. Never read generic
manufacturer clearance into verified installation requirements. Quarantine
invalid dimensions and obvious upright-fridge width/height inversions.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/architecture-v2/legacy-appliance.test.mjs`

Expected: all adapter tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/legacy-appliance.mjs tests/architecture-v2/legacy-appliance.test.mjs
git commit -m "feat: adapt legacy products in shadow mode"
```

### Task 6: Catalog shadow audit

**Files:**
- Create: `scripts/architecture-v2/shadow-audit.mjs`
- Create: `tests/architecture-v2/shadow-audit.test.mjs`
- Modify: `package.json:9-86`

**Interfaces:**
- Consumes: `public/data/appliances.json` and optionally
  `public/data/evidence-index.json`.
- Produces: deterministic JSON summary on stdout.
- Produces: `auditCatalog(document, evidenceIndex) -> summary` for tests.

- [ ] **Step 1: Write failing audit tests**

Assert deterministic category counts, quarantine counts, no input mutation,
and rejection of malformed top-level catalog documents.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/architecture-v2/shadow-audit.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for the audit module.

- [ ] **Step 3: Implement the read-only CLI and package scripts**

Add:

```json
"test:architecture-v2": "node --test tests/architecture-v2/*.test.mjs",
"audit:architecture-v2": "node scripts/architecture-v2/shadow-audit.mjs"
```

The CLI must not accept an output path in Phase 0 and must not call
`writeFile`, `mkdir`, or `rm`.

- [ ] **Step 4: Verify GREEN against fixtures and the real catalog**

Run: `npm run test:architecture-v2`

Expected: all Architecture V2 tests pass.

Run: `npm run audit:architecture-v2`

Expected: valid JSON on stdout with `totalProducts: 2268`; tracked files remain
unchanged.

- [ ] **Step 5: Commit**

```bash
git add scripts/architecture-v2/shadow-audit.mjs tests/architecture-v2/shadow-audit.test.mjs package.json
git commit -m "feat: audit legacy catalog in shadow mode"
```

### Task 7: Final compatibility verification

**Files:**
- Modify only when a failing verification exposes a Phase 0 defect.

**Interfaces:**
- Consumes all Phase 0 modules and existing project contracts.
- Produces a clean branch ready for review; no production output diff.

- [ ] **Step 1: Run focused tests**

Run: `npm run test:architecture-v2`

Expected: all Architecture V2 tests pass.

- [ ] **Step 2: Run existing quality gates**

Run: `npm test`

Expected: 1,551 tests pass, 0 fail.

Run: `npm run lint`

Expected: exit 0.

Run: `npm run validate-schema`

Expected: 2,348 pages, 0 errors.

- [ ] **Step 3: Prove production artifacts are unchanged**

Run:

```bash
git diff --exit-code main -- public/data data pages public/sitemap.xml vercel.json index.html
```

Expected: exit 0 with no diff.

- [ ] **Step 4: Review dependency and secret surface**

Run: `git diff --check main...HEAD`

Expected: exit 0.

Confirm `package-lock.json` has no Architecture V2 change and no credentials,
tokens, cookies, PDF downloads, or user data were added.

- [ ] **Step 5: Commit documentation updates if needed**

```bash
git add docs/superpowers/specs/2026-07-11-architecture-v2-phase0-design.md docs/superpowers/plans/2026-07-11-architecture-v2-phase0.md
git commit -m "docs: define architecture v2 phase zero"
```
