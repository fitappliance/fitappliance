# Historical Appliance Reference and Replacement Match Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans and execute each phase with TDD. Keep one final review for the coherent batch.

**Goal:** Store all four official appliance categories as a historical old-model reference and replace the coupled replacement-search branch with a direct-dimension engine whose outputs are current retail products only.

**Architecture:** Resolve source identity, lifecycle and dimension evidence before generating a category-split lookup index. Replacement matching is a pure W/H/D comparison module and never calls the cavity Fit engine; the existing cavity path remains unchanged.

**Tech Stack:** Node.js ESM/CommonJS, native `node:test`, static JSON projections, Architecture V2 path registry, Vercel static deployment.

**Design:** [Historical Appliance Reference and Replacement Match Engine Design](../specs/2026-07-12-historical-reference-replacement-engine-design.md)

## Global Constraints

- Preserve exact model suffixes and fail closed on identity or dimension conflicts.
- Keep raw registry bytes on `/Volumes/UGREEN-1TB/FitAppliance`; normal builds must work without that volume.
- Do not mutate the current active catalog from registry data.
- Do not generate historical product pages, sitemap URLs, offers or Fit claims.
- Run focused RED/GREEN tests for every behavior change before regression gates.

## Phase 1: Semantics, states and path ownership

**Files:**
- Create `src/domain/historical-appliance-reference.mjs`
- Modify `src/domain/architecture-v2-paths.mjs`
- Test `tests/architecture-v2/historical-appliance-reference.test.mjs`
- Test `tests/architecture-v2/architecture-v2-data-layout.test.mjs`

- [x] Define lifecycle, evidence and lookup-action enums as separate fields.
- [x] Validate exact identity groups, complete dimensions, source hashes and allowed state combinations.
- [x] Add authoritative reference, audit and public-projection paths to the Architecture V2 registry and dependency graph.
- [x] Prove lifecycle cannot promote dimensions and evidence cannot imply current retail state.

**Gate:** pure contracts pass without network, external storage or generated public files.

## Phase 2: Four-category immutable source acquisition

**Files:**
- Modify `scripts/architecture-v2/acquire-official-registries.mjs`
- Modify `src/domain/official-registry-acquisition.mjs`
- Modify `tests/architecture-v2/official-registry-acquisition.test.mjs`

- [x] Select refrigerator, dishwasher, dryer and washing-machine resources from current CKAN metadata.
- [x] Acquire all four CSVs plus metadata and WELS into content-addressed external storage.
- [x] Validate required headers, allowed redirects, size limits, licence metadata and replay hashes.
- [x] Preserve idempotent second-run reuse and report six snapshot hashes.

**Gate:** six manifests replay exactly; no raw CSV enters Git.

## Phase 3: Exact identity, lifecycle and dimension classification

**Files:**
- Modify `src/domain/historical-appliance-reference.mjs`
- Create `scripts/architecture-v2/build-historical-appliance-reference.mjs`
- Test `tests/architecture-v2/historical-appliance-reference.test.mjs`

- [x] Normalize all four source categories losslessly and group exact category/brand/model keys.
- [x] Join current and archived catalog rows only by exact normalized identity.
- [x] Classify `CURRENT_RETAIL`, `CATALOG_ARCHIVED`, `REGISTRY_ONLY` and `UNKNOWN_RETAIL` independently of dimensions.
- [x] Classify receipt agreement, registry consistency, missing dimensions, internal conflict, axis suspicion and invalid geometry.
- [x] Retain raw variants and source receipts while quarantining suffix, axis and duplicate conflicts.
- [x] Generate deterministic summary counts and known anomaly canaries.

**Gate:** repeated builds are byte-identical and no historical record changes the active catalog.

## Phase 4: Minimal, category-split, lazy public projection

**Files:**
- Create `scripts/architecture-v2/publish-historical-reference.mjs`
- Create `public/data/replacement-reference/meta.json`
- Create four category JSON projections under `public/data/replacement-reference/`
- Test `tests/architecture-v2/historical-reference-publication.test.mjs`

- [x] Project only minimal lookup fields and attribution.
- [x] Exclude retailer, price, affiliate, Fit, clearance and route fields.
- [x] Split by category with deterministic ordering and content hashes in metadata.
- [x] Prove historical IDs are absent from product pages, sitemap and active catalog.

**Gate:** projection validates without the external drive and remains covered by `/data/*` noindex headers.

## Phase 5: Independent Replacement Match Engine

**Files:**
- Create `public/scripts/replacement-match-engine.js`
- Modify `public/scripts/search-core.js`
- Modify `tests/dual-mode-search-core.test.mjs`
- Modify `tests/replacement-logic.test.mjs`

- [x] Write RED tests proving replacement search works when `FitEngine.evaluateFit` throws.
- [x] Implement signed per-axis deltas, absolute deltas, maximum difference, normalized distance and relation.
- [x] Sort by maximum axis difference before aggregate distance and stable identity.
- [x] Return slightly larger close products instead of treating them as cavity failures.
- [x] Hard-filter outputs to current retailer products with complete dimensions.
- [x] Remove replacement `fitDecision`, clearance score and required-cavity fields while preserving cavity-mode behavior.

**Gate:** replacement branch has no Fit evaluation; all existing cavity contract tests remain green.

## Phase 6: Historical lookup and exact selection

**Files:**
- Modify `public/scripts/replacement-matcher.mjs`
- Create `public/scripts/replacement-reference-loader.mjs`
- Modify `tests/replacement-matcher.test.mjs`
- Create `tests/replacement-reference-loader.test.mjs`

- [x] Pass old dimensions through unchanged and delete the fixed practical buffer.
- [x] Resolve exact brand/model or unique exact model automatically.
- [x] Return ambiguous and fuzzy candidates for explicit selection without auto-fill.
- [x] Support `AUTO_FILL`, `CONFIRM_REQUIRED`, `MEASURE_REQUIRED` and `QUARANTINED` states.
- [x] Lazy-load and cache only the selected category reference file.

**Gate:** historical models can be selected without retailer links; no uncertain match silently populates dimensions.

## Phase 7: Homepage and result-card integration

**Files:**
- Modify `index.html`
- Modify `public/scripts/ui/product-card.js`
- Modify `public/styles.css`
- Modify `tests/dual-mode-ui.test.mjs`
- Modify `tests/search-ux.test.mjs`

- [x] Load historical data only after replacement mode/category activation.
- [x] Present source/evidence state and require confirmation for registry-only dimensions.
- [x] Keep manual old W/H/D entry available for identity-only or quarantined records.
- [x] Render new-minus-old W/H/D differences and relation instead of cavity/clearance copy.
- [x] Keep result retailer actions current-only and remove misleading replacement Fit labels.
- [x] Verify keyboard, screen-reader status and mobile/desktop layout.

**Gate:** one old reference produces current results with direct deltas; cavity mode network and UI remain unchanged.

## Phase 8: Repository audit, real data generation and scale report

**Files:**
- Create `scripts/architecture-v2/audit-historical-replacement.mjs`
- Create `data/architecture-v2/reviews/automated/historical-replacement-audit.json`
- Modify `package.json`
- Update `docs/product-core-brief.md`

- [x] Add repository-only audit to normal Architecture V2 build.
- [x] Acquire current six-source snapshot set and generate the complete four-category reference.
- [x] Report raw rows, exact keys, lifecycle states, evidence states, dispositions, conflicts and public file sizes.
- [x] Assert zero active-catalog mutations, historical routes, affiliate fields, Fit outcomes and replay failures.
- [x] Record attribution, refresh cadence and rollback procedure in the product core brief.

**Gate:** real data passes every audit and normal build succeeds with `FITAPPLIANCE_STORAGE_ROOT` unset.

## Phase 9: Final verification and release

- [x] Run focused tests, `npm test`, `npm run lint`, schema validation and production build.
- [x] Run one final correctness/security/regression review and fix validated findings.
- [x] Commit only worktree-owned files with conventional commits and integrate into `main` without touching the user's dirty files.
- [x] Push and deploy the exact final commit.
- [x] Verify Vercel commit metadata, apex/www behavior, cavity search, historical lookup lazy request, direct replacement deltas, current-only results and zero public Fit leakage.
- [x] Update this plan with measured results and remaining evidence gaps.

**Gate:** deployment is `READY/PROMOTED`, live behavior matches the final SHA and every objective requirement has direct evidence.

## Measured pre-release evidence (2026-07-13)

- Historical reference: 8,095 exact-identity records across fridge 4,336, dishwasher 1,419, dryer 843 and washing machine 1,497.
- Evidence actions: 11 `AUTO_FILL`, 4,940 `CONFIRM_REQUIRED`, 3,054 `MEASURE_REQUIRED` and 90 `QUARANTINED`; repository audit reports zero issues.
- Public isolation: 8,095 minimal public rows match the private reference; sitemap contains 1,994 URLs with no historical routes; `/data/*` remains `noindex`; no reference JSON is precached.
- Runtime separation: a clean cavity session requests zero historical files; fresh replacement sessions request exactly one category file for each of the four categories.
- Identity canaries: `EQE6160BA` auto-fills 913x1782x749mm; `HDW15F3S1` keeps inputs empty until keyboard confirmation of 598x850x610mm; `DD60DAW9` remains blank and quarantined.
- State-safety canary: changing from a confirmed model to a conflicting, identity-only, ambiguous or missing model clears the previous dimensions and hides stale results before resolution.
- Cross-mode state canary: changing appliance category clears the prior category's old-model identity and dimensions; manually editing an accepted lookup removes stale model provenance.
- Matching canary: manual dishwasher dimensions 598x850x610mm retain a current product with `D +2mm`; rendered replacement rows contain direct deltas and no Fit score, clearance bar or fixed delivery buffer.
- Runtime geometry canary: `HRTF206` ranks as 550x1456x562mm from `geometry_v2`, not its stale legacy 550x1410x490mm fields; replacement URLs use `sort=closest-size`.
- Concurrent-catalog canary: retailer backfill commit `5e0650e78` changed the V2 public projection; the first build failed with `HISTORICAL_CATALOG_SNAPSHOT_STALE`, then passed only after the historical receipt was rebuilt against the new catalog hash. Public reference counts and content hashes remained stable.
- Backfill regression canary: the same retailer update exposed adjacent same-brand fit-check samples with 0.895 text similarity; selection now preserves the chosen `topN` while interleaving brands where possible, and the original `<0.8` uniqueness gate passes without weakening its threshold.
- Accessibility/layout: aria-live status is polite; Space, Tab and Enter complete registry confirmation; 1,440px desktop and 390px mobile layouts have no horizontal overflow or control overlap.
- Gates: 1,952 tests passed; lint passed; schema validation checked 2,334 pages and 7,145 JSON-LD blocks with zero errors; indexability audit passed; production build passed with `FITAPPLIANCE_STORAGE_ROOT` unset.
- Release evidence: the Git deployment reached `READY` in `syd1`; apex redirects permanently to `www`; the public fridge reference hash matches its manifest and carries `X-Robots-Tag: noindex`; fresh cavity sessions load no historical file; replacement sessions load one selected category, preserve confirmation gates and expose direct W/H/D deltas for current-only products.
- Remaining evidence gap: none for the requested release. Future government-registry and retailer refreshes remain subject to the documented hash-drift rebuild gate.
