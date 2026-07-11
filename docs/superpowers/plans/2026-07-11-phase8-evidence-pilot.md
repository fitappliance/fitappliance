# Phase 8 Evidence Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce and review a deterministic 20-model evidence pilot that can promote only reproducible, field-level manufacturer evidence into Architecture V2 and expose the resulting evidence state honestly on product pages.

**Architecture:** A read-only selector ranks active canonical products, then a bundle generator joins catalog identity, source-document candidates and raw extraction records without granting approval. A strict review gate accepts a field only when document hash, page, quote, exact or approved-alias identity, parser provenance and rendered-page review are present. Product pages consume the resulting public evidence projection; unresolved samples remain visibly pending or quarantined.

**Tech Stack:** Node.js 22, native `node:test`, existing Architecture V2 domain modules, Poppler/PDF inspection, static HTML generators, Playwright, Vercel.

## Global Constraints

- Never infer approval from PDF presence, download success, retailer hosting or parser confidence alone.
- Never share fields across model aliases without an approved alias-registry decision for those exact fields.
- Preserve unknown values as `null`; do not infer clearance from cabinet dimensions.
- Keep all 20 pilot selections deterministic and reproducible from committed inputs.
- Do not mutate `data/catalog-final.json` during selection or review.
- Keep production claims at their current trust level until the V2 approval gate passes.

---

### Task 1: Deterministic Pilot Selection

**Skills:** `data-analytics:analyze-data-quality`, `superpowers:test-driven-development`

**Files:**
- Create: `src/domain/evidence-pilot.mjs`
- Create: `scripts/architecture-v2/build-evidence-pilot.mjs`
- Create: `tests/architecture-v2/evidence-pilot.test.mjs`
- Create: `data/architecture-v2/evidence-pilot.json`

**Interfaces:**
- `selectEvidencePilot({ products, sourceDocuments, limit, brandLimit, categoryTargets })`
- Produces `{ schemaVersion, generatedAt, selectionPolicy, products }` with exactly 20 unique canonical IDs.

- [x] Write failing tests for deterministic ordering, unique products, per-brand cap, category coverage and exclusion of missing/mismatched document candidates.
- [x] Run `node --test tests/architecture-v2/evidence-pilot.test.mjs` and confirm the missing module failure.
- [x] Implement the pure selector and CLI generator using the unified public projection and source-document registry.
- [x] Generate the committed pilot and rerun the focused test.

### Task 2: Field-Level Review Bundles

**Skills:** `pdf:pdf`, `data-analytics:analyze-data-quality`, `superpowers:test-driven-development`

**Files:**
- Create: `src/domain/evidence-review.mjs`
- Create: `scripts/architecture-v2/build-evidence-review-bundles.mjs`
- Create: `tests/architecture-v2/evidence-review.test.mjs`
- Create: `data/architecture-v2/evidence-review-bundles.json`

**Interfaces:**
- `createReviewBundle({ product, sourceDocument, rawExtraction })`
- `reviewField(bundle, decision)` returns approved evidence only when exact identity, hash, page, quote, parser version and rendered-page review are complete.

- [x] Write failing tests proving incomplete, retailer-authored, family-only, hashless and pageless evidence cannot be approved.
- [x] Implement bundle creation with explicit `pending`, `approved`, `rejected` and `quarantined` states.
- [x] Generate 20 review bundles without changing trust levels.
- [x] Fetch/render available PDFs, record page-level evidence and review decisions; leave unavailable or ambiguous samples blocked with reason codes.

### Task 3: V2 Evidence Projection and Page Presentation

**Skills:** `superpowers:test-driven-development`, `product-design:audit`, `browser:control-in-app-browser`

**Files:**
- Modify: `scripts/architecture-v2/build-source-document-registry.mjs`
- Modify: `scripts/generate-product-pages.js`
- Modify: `tests/technical-seo-product-pages.test.mjs`
- Create: `tests/architecture-v2/evidence-pilot-integration.test.mjs`

**Interfaces:**
- Approved review fields become source-document field evidence; pending/quarantined bundles remain non-promotable.
- Product pages render source type, reviewed date, approved field names and pending limitations without exposing local paths.

- [x] Write failing integration tests for approval import and non-promotion of pending bundles.
- [x] Add the smallest registry import path needed for approved pilot decisions.
- [x] Add an evidence-status section to generated product pages with factual labels.
- [x] Regenerate pages and verify structured data never claims `Verified Fit` from dimensions-only evidence.

### Task 4: Audit, Deploy and Observe

**Skills:** `superpowers:verification-before-completion`, `vercel:deployments-cicd`, `vercel:verification`

**Files:**
- Modify: `docs/architecture-v2/completion-audit.md`
- Create: `docs/architecture-v2/phase8-evidence-pilot-report.md`

- [x] Run focused tests, `npm run test:architecture-v2`, full tests, schema, model-alias, geometry and source-document audits.
- [x] Run `npm run build`, inspect generated product pages and use Playwright at desktop and 390 x 844 mobile viewports.
- [x] Record approved, pending, rejected and quarantined sample counts without inflating site-wide coverage.
- [x] Commit, push, wait for Vercel Ready, verify production pages and run Sentinel.

## Acceptance Criteria

- Exactly 20 deterministic pilot models with balanced category and bounded brand concentration.
- Every sample has a reproducible status and reason; no silent drops.
- Every approved field has document hash, exact/approved-alias identity, page, quote, parser version, reviewer and rendered-page confirmation.
- Pending and quarantined evidence cannot raise public trust level.
- Full repository, schema, browser and production Sentinel gates pass.
