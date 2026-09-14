# Category Loading Race Hotfix Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. One GPT-5.6 Terra / max implementer owns code and TDD; the controller owns independent review and deployment validation.

**Goal:** Early or repeated homepage actions must not duplicate product data or let an older asynchronous action overwrite a newer search intent.

**Architecture:** Keep the static catalog and existing Fit/search engines. Make the existing category-loading owner single-flight and safe when the complete-catalog fallback wins; coordinate only the existing asynchronous UI entry points that reproduce the race. No new state framework or data migration.

**Tech Stack:** Existing browser JavaScript, Node test runner, JSDOM, bundled Playwright for controller QA; no new dependencies.

**Spec:** `docs/product-core-brief.md` sections 1–2 and the acceptance contract below. This is a corrective hotfix, not an Architecture V3 milestone.

## Global Constraints

- Start from main `87b2a8cda2e9ee1ddce4320e2bf56585fd85b8fa`, including PR #207's `.site-public` publication boundary.
- Preserve data/evidence bytes, active release, Fit rules, cavity/replacement isolation, links, generated pages and dependencies.
- Preserve original dirty checkout and all other worktrees. Do not resume V3 or publish its unfinished work.
- Do not mask duplicates by changing search ranking or deduplicating output cards.
- No production telemetry, subscription, customer-data or retailer writes during QA.
- Author code with apply_patch. Implementer does not commit, push, merge or spawn agents; controller publishes only the exact reviewed tree.
- Preserve this plan and ignored execution ledger; do not delete recovery artifacts.

## Confirmed Baseline

On current production, a held `/data/fridges.json` response plus an early click on `Standard fridge 600 × 1900 × 650` causes two category requests and duplicate product IDs. Both desktop and mobile produce 46 cavity / 316 replacement results; ready-state controls produce 23 / 158. Evidence: `/tmp/fit-category-qa.DmBz2b/baseline.json` and `race-qa.cjs`. Existing focused baseline: 30 tests pass. Original dirty checkout status/diff hashes remain unchanged.

### Task 1: Fix the category-loading and early-action race

**Files:** `index.html` (loading/bootstrap and narrowly related async UI entry points); `public/scripts/ui/hero-funnel.js` only where stale sample actions need a completion contract; behavioral tests under `tests/` (`category-loading.test.mjs` suggested). A small focused browser module under `public/scripts/ui/` is allowed only if necessary to test the real loader without duplicating production logic. Do not split unrelated homepage code.

**Interfaces:** Existing `loadCategory(cat)`, `bootstrapApplianceData()`, `setCategory(cat, options)`, `applyHeroSampleSearch(button, options)` and current UI event handlers. Existing callers must continue working; a stale action must not fill dimensions, run a search, or scroll over a newer selection.

- [x] Write deterministic regression tests against production functions, with deferred network responses. Observe the original duplicate-load failure before implementation. Do not use sleeps or copy loader logic into test fixtures.
- [x] Same-category concurrent callers share one in-flight fetch, commit one product batch, and all await actual readiness. A subsequent loaded request does no work. Independent categories can load independently.
- [x] Failed HTTP/JSON/payload requests do not mark loaded and must permit a later retry. All concurrent callers see failure; event entry points handle rejection without uncaught errors.
- [x] When bootstrap falls back to the full catalog, late category responses cannot append duplicates or replace its captured date. If a category completed first, the complete fallback replaces the aggregate once. Malformed fallback is not advertised as successful readiness.
- [x] Reproduce and fix any directly adjacent early-intent race: an early sample survives bootstrap; two sample clicks or a sample followed by a category selection leave the newest category/dimensions together, regardless of response order. Avoid disabling buttons as the only fix. Maintain URL/saved-search initialization semantics. If this requires broad unrelated refactoring, stop and explain the concrete dependency.
- [x] Keep implementation minimal. Expected loader shape is one per-category pending promise entry with cleanup in `finally`, plus a commit-time already-loaded guard; use a small intent/initialization mechanism only where behavioral tests prove it necessary. Do not add generic caches, cancellation frameworks or model-ID normalization.

Example invariant (hand-derived fixture values, adapt the harness to real production code):

```js
const first = loadCategory('fridge');
const second = loadCategory('fridge');
assert.equal(requests.length, 1);
response.resolve({ products: [{ id: 'fridge-one', cat: 'fridge' }] });
await Promise.all([first, second]);
assert.deepEqual(products.map(p => p.id), ['fridge-one']);
```

- [x] Run focused new/affected tests during iteration; run `npm run lint`, `npm test`, and `npm run build` once on the final candidate, recording exact commands and summaries. Verify no generated data drift; do not remove unrelated files to hide drift. Relevant tests include hero samples, search UX, dual mode, saved searches and public deployment.
- [x] Return a short status plus changed paths, RED/GREEN evidence, full-suite/build results and unresolved concerns. Full report goes to the task report path supplied by the controller.

### Task 2: Independent review and isolated publication

**Owner:** Controller. **Consumes:** Task 1's patch and test evidence. **Produces:** Exact tested commit/PR, preview and production verification.

- [ ] Review every changed production line, test realism, failure cleanup, fallback commit ordering, stale UI completions and publication scope. Do not repeat unchanged implementer tests without a failure or new concern.
- [ ] Run real desktop/mobile browser flows with controlled slow responses, repeated clicks, both cavity/replacement modes, reversed category order and fallback. Normal and delayed fridge search must both produce 23 / 158, with unique result IDs.
- [ ] Confirm runtime assets and current `.site-public` boundary remain intact. No new source/internal data exposure. Check service-worker-controlled reload once.
- [ ] Create a narrow PR through the authenticated GitHub connection; require exact-head CI and actual protected-preview verification. Merge only that SHA; verify production READY, merge tree identity, canonical routes and early-click behavior.
- [ ] Record portable proof in the PR and completion in the ignored ledger. Keep any unverified wider flows explicit; do not claim the V3/evidence program is completed.
