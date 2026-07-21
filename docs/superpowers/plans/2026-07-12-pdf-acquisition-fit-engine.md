# PDF Acquisition and Unified Fit Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans and superpowers:test-driven-development. Keep PDF parsing under parsing-appliance-pdfs-with-mineru and alias decisions under adjudicating-appliance-model-aliases.

**Goal:** Build a production-grade official-document acquisition broker and make the public fit result a deterministic projection of field-scoped PDF evidence through one geometry and decision engine.

**Architecture:** Product discovery produces ranked official-document candidates, not approvals. A transport layer fetches and caches immutable bytes, MinerU produces replayable JSON, a field projector creates provenance-bound `geometry_v2`, and both server/build and browser views call one fit contract. Unknown installation, operation, service, or delivery values stay unknown and may never become zero by normalization.

**Tech Stack:** Node.js ESM, native fetch plus bounded `curl` transport fallback, Cheerio, MinerU 3.4.4 `content_list_v2`, SHA-256 object storage, `node:test`, browser UMD adapter over the domain fit contract.

## Global Constraints

- Manufacturer domains and redirects remain allowlisted by brand and market.
- Retailer PDFs remain candidate or retailer evidence and cannot become manufacturer authority.
- A PDF, product URL, model alias, or dimension triple alone never proves installation fit.
- Preserve source PDF, MinerU JSON, page, bbox, fragment hash, quote, field scope and receipt.
- `null` means unknown; only explicit evidence can produce numeric zero or boolean false.
- Public fit outcomes are `NO_FIT`, `INSUFFICIENT_DATA`, `CONDITIONAL_FIT`, `LIKELY_FIT_ESTIMATED`, or `VERIFIED_FIT`.
- Existing unrelated worktree changes are never staged or reverted.

---

### Phase 1: Baseline and contract audit

**Files:**
- Create: `data/architecture-v2/reviews/automated/core-technology-baseline.json`
- Modify: `tests/architecture-v2/browser-fit-contract.test.mjs`
- Modify: this plan

- [x] Record acquisition outcomes by stage for the cross-brand canary set.
- [x] Record public products using top-level dimensions, geometry_v2, default clearance, and evidence-backed clearance.
- [x] Add failing tests proving missing clearance must not normalize to zero and browser fit cannot claim verified from a trust label alone.
- [x] Preserve the executable baseline for the release commit.

### Phase 2: Official document acquisition broker

**Files:**
- Create: `src/domain/official-document-candidate.mjs`
- Create: `src/domain/official-document-discovery.mjs`
- Create: `data/architecture-v2/policies/manufacturer-document-strategies.json`
- Modify: `src/domain/evidence-source-discovery.mjs`
- Test: `tests/architecture-v2/official-document-discovery.test.mjs`

- [x] Define a candidate contract with URL, authority, document type, discovery method, model signal, market signal and rank reason.
- [x] Add strategies for direct static assets, exact-model product-page links, support/download APIs, sitemaps and bounded official search.
- [x] Dedupe by canonical URL and later by content hash; prefer exact-model installation/QRG/spec sheets over family manuals.
- [x] Reject search snippets, cross-brand hosts and retailer fallbacks at the manufacturer tier.
- [x] Cover ranked discovery with deterministic fixtures.

### Phase 3: Resilient acquisition and replay cache

**Files:**
- Create: `src/domain/official-artifact-transport.mjs`
- Modify: `src/domain/evidence-research-runner.mjs`
- Modify: `scripts/architecture-v2/run-pdf-brand-acceptance.mjs`
- Test: `tests/architecture-v2/official-artifact-transport.test.mjs`

- [x] Implement bounded fetch with redirect recording, payload limits, magic-byte checks and explicit stage errors.
- [x] Add an `execFile`-based curl fallback for official endpoints that fail under Node fetch; validate the returned bytes through the same policy.
- [x] Persist PDF and MinerU JSON before claim extraction so parser upgrades replay without downloading or OCR again.
- [x] Add per-candidate checkpoints, retry budgets, cooldowns and terminal reason taxonomy.
- [x] Re-run Westinghouse and Electrolux canaries and preserve transport evidence.

### Phase 4: Evidence-to-geometry projector

**Files:**
- Create: `src/domain/evidence-geometry-projector.mjs`
- Modify: `src/domain/category-geometry.mjs`
- Modify: `src/domain/public-projection.mjs`
- Test: `tests/architecture-v2/evidence-geometry-projector.test.mjs`

- [x] Project each approved claim into exactly one closed-envelope, installation, operation, service, or delivery field.
- [x] Bind every projected field to its source receipt and reject mixed-model or superseded conflicts.
- [x] Preserve adjustable height as a range and use maximum height for cavity fit while displaying the range.
- [x] Distinguish closed depth, cabinet depth, handle depth, door-open depth, rear services and ventilation.
- [x] Calculate required cavity dimensions only when every required term for that axis is known.
- [x] Preserve deterministic geometry fixtures from the accepted brand evidence.

### Phase 5: One fit decision and rating contract

**Files:**
- Modify: `src/domain/fit-decision.mjs`
- Create: `public/scripts/fit-engine.js`
- Modify: `public/scripts/search-core.js`
- Modify: `scripts/generate-ui-copy.js`
- Test: `tests/architecture-v2/browser-fit-contract.test.mjs`
- Test: `tests/architecture-v2/fit-decision.test.mjs`

- [x] Make the browser adapter consume geometry_v2 and call the same fit outcome rules as the domain engine.
- [x] Remove default-zero clearance from evidence-backed manufacturer mode.
- [x] Separate hard installation checks from operation/service advisories and delivery-path checks.
- [x] Replace numeric-score-first verdicts with outcome-first ratings; numeric score may rank only products with equivalent evidence completeness.
- [x] Require complete, current, receipt-backed fields before `VERIFIED_FIT`; dimensions-only results remain estimated or insufficient.
- [x] Cover browser/domain parity for fail, unknown, conditional, estimated and verified outcomes.

### Phase 6: Catalog migration and publication gates

**Files:**
- Create: `scripts/architecture-v2/audit-fit-publication.mjs`
- Modify: `scripts/architecture-v2/build-public-projection.mjs`
- Modify: `package.json`
- Create: `tests/architecture-v2/fit-publication-audit.test.mjs`

- [x] Audit every current product for legacy-vs-geometry disagreement and provenance completeness.
- [x] Quarantine conflicts instead of silently preferring either representation.
- [x] Ensure generated product and interactive fit surfaces use the same outcome vocabulary.
- [x] Add the audit to build and deployment gates.
- [x] Preserve migration reports without changing unknown values into defaults.

### Phase 7: Real acquisition, acceptance, adversarial QA and deployment

**Files:**
- Update: `data/architecture-v2/reviews/automated/pdf-brand-acceptance-results.json`
- Create: `docs/architecture-v2/core-technology-acceptance-2026-07-12.md`
- Update: project and local evidence skills with proven brand patterns

- [x] Run one exact current canary across ten major brands plus explicit wrong-family and sibling candidates; record the shallow-per-brand coverage limit.
- [x] Measure discovery, download, MinerU, identity, geometry and fit-decision readiness separately.
- [x] Test family manuals, regional SKUs, packaged dimensions, grouped axes, conflicting clearances, timeouts, HTML masquerading as PDF and stale receipts.
- [x] Run final full tests, lint, build, object replay and browser parity checks.
- [x] Commit, push, verify the production aliases and record residual unknowns rather than hiding them.

## Acceptance thresholds

- Official PDF acquisition: at least 90% of reachable canary endpoints downloaded through an allowed transport.
- Exact-model evidence: no false acceptance in adversarial fixtures; family/wildcard documents remain quarantined without alias proof.
- Geometry: 100% field-level provenance and zero unknown-to-zero coercions.
- Fit parity: browser and domain outcomes match for every golden case.
- Publication: no `VERIFIED_FIT` without complete receipt-backed required fields and applicable advisory checks.
