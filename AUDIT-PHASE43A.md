# Phase 43a — Full-Site Audit Report

**Date**: 2026-04-22
**Author**: Claude (designer/reviewer role)
**Scope**: 4-way parallel audit post Phase 42a merge (SEO, Performance+A11y, Security, Dead-code+Data hygiene)
**Source runs**: Explore agents × 4 + direct repo verification

---

## 0. Executive summary

Phase 42a successfully landed search UX + market popularity scaffold. Post-merge audit uncovered **one P0 data-integrity crisis** that materially affects Phase 42b scope and may require re-ordering the roadmap.

| Severity | Count | Headline |
|---|---|---|
| **P0** | 1 | **~99% of catalog is flagged `unavailable:true` with empty `retailers[]`** — current search surfaces products users cannot buy |
| **P1** | 7 | Missing CSP (Lighthouse BP 0.73 root cause), OG image 30MB unoptimised, 1 orphan page, guides missing schema, unescaped `innerHTML` in fit-checker, RUM endpoint unauthenticated, a11y contrast fail on `--ink-3` |
| **P2** | 12 | Dead scripts, 24 brand-casing conflicts, series-dict only 5 brands, stale SW cache, GitHub Actions over-permissioned, missing hreflang, cavity/compare/guides no OG image, fit-checker inputs missing labels, inline 115KB critical CSS, GSC SA JSON in secrets, home input aria, og-image workflow helper residue |

## Status (closed 2026-04-26)

**P1 (7 items): all closed**
- §2.1 CSP headers — closed via Phase 43a quick wins
- §2.2 OG image optimization — closed via Phase 43a quick wins
- §2.3 sitemap drift — closed via `scripts/verify-sitemap.js`
- §2.4 Guides Article schema — closed by PR #19
- §2.5 fit-checker XSS — closed via Phase 43a quick wins
- §2.6 RUM rate limit — closed by PR #20
- §2.7 contrast (`--ink-3`) — closed via Phase 43a quick wins

**P2 (13 items): 13/13 closed or reclassified**
- §3.1 dead `fit-score.js` — closed by PR #24
- §3.2 measurement scripts — reclassified live (PR #24 verified)
- §3.3 series-dictionary 5 brands — deferred to Phase 42c
- §3.4 brand casing — closed by Phase 42b alias_map
- §3.5 inline CSS 115KB → 10KB — closed by PR #23
- §3.6 SW cache invalidation — closed by PR #22
- §3.7 hreflang en-AU — closed by PR #21
- §3.8 OG image meta — closed by PR #21
- §3.9 fit-checker labels — closed by PR #21
- §3.10 GitHub Actions least-privilege — closed by PR #21
- §3.11 GSC SA split — closed by PR #25
- §3.12 og-sync.yml temp helper — verified absent (PR #24)
- §3.13 date drift wallclock audit — closed by PR #24

**P0 retailer backfill**: cursor reached 609 (saturation for tier1/tier2 with empty retailers); deferred to Phase 42c after alias merge stabilizes in GSC index (≥ 7 days from 2026-04-24).

---

## 1. P0 — Data availability crisis (escalates 42b + 43b)

### 1.1 Finding (verified)

Direct `node -e` query across `public/data/*.json`:

```
fridges           total=1319  unavail=1310  zeroRetailers=1310  hasRetailers=9
dishwashers       total=354   unavail=350   zeroRetailers=350   hasRetailers=4
dryers            total=73    unavail=69    zeroRetailers=69    hasRetailers=4
washing-machines  total=424   unavail=420   zeroRetailers=420   hasRetailers=4
```

**Only 21 products out of 2,170 (0.97%) have any retailer data.** The Phase 42a popularity research covered 20 products (cursor=20); the rest inherited `retailers: []`, `unavailable: true` from prior pipeline runs.

### 1.2 Why this matters

- Phase 42a search UI now shows market popularity scoring — but popularity defaults to 0 for 99% of rows, so fit-score ordering collapses to dimension-match only. Users see products we explicitly tagged as unpurchasable.
- Phase 42b's brand-drop plan (Sub-Zero/CHIQ/SEIKI) is a rounding error compared to the availability hole. Running 42b alone would drop ~50 slugs while leaving 2,100+ "zombie" pages.
- Phase 43b (hot-model backfill dishwasher/dryer/washer) cannot proceed until retailer data is re-synced or the availability flag is reinterpreted.

### 1.3 Recommendation (requires user decision)

**Option A — Pause 42b, run retailer re-sync first (recommended):**
1. Codex: extend `scripts/research-popularity.js` to run against full catalog in batches (500/run cap respected, cursor persistence).
2. Trigger GitHub Actions `workflow_dispatch` nightly until cursor = catalog size.
3. Then run 42b brand-drop + generator filter; expected `unavailable && excluded` filter will now prune legitimately unavailable stock, not 99% of the catalog.

**Option B — Decouple `unavailable` from `retailers.length === 0`:**
- Treat empty-retailer as "not yet researched" rather than "confirmed unavailable".
- Change generator filter to `unavailable === true` only (not `retailers.length === 0`).
- Risk: keeps showing products without a confirmed AU retail channel — contradicts user's "quality > quantity" directive.

**Option C — Ship 42b as-specced, accept the slug bleed:**
- Fastest, but post-42b catalog could be ~50 products total. SEO collapse risk.

**My recommendation**: Option A. User should confirm before 42b dispatch.

---

## 2. P1 findings

### 2.1 Missing Content-Security-Policy (SEC + PERF)
- **File**: `vercel.json` headers block
- **Impact**: Lighthouse Best Practices 0.73 — CSP absence is the dominant deduction
- **Fix**: Add `Content-Security-Policy` + `X-Frame-Options: DENY` + `Referrer-Policy: strict-origin-when-cross-origin` to all routes. Allow `youtube-nocookie.com` for Phase 41 embed facade.
- **Owner**: Codex (quick-win bundle)

### 2.2 OG image assets 30MB unoptimised (PERF)
- **Dir**: `public/og/*.png` (fridge/dishwasher/dryer/washer × variants)
- **Fix**: Convert to WebP @ quality 85, or re-render at 1200×630 exact; expected ~2MB total.
- **Owner**: Codex (quick-win bundle)

### 2.3 Sitemap ↔ filesystem drift (SEO)
- `public/sitemap.xml` = 466 URLs, page file count = 467. One orphan page.
- **Fix**: `scripts/verify-sitemap.js` — RED test + fail build on mismatch.
- **Owner**: Codex (quick-win bundle)

### 2.4 Guides pages missing schema (SEO)
- `public/pages/guides/*.html` have no `Article` or `HowTo` JSON-LD.
- **Fix**: Add `Article` schema in `scripts/generate-guides.js`.
- **Owner**: Codex (small PR)

### 2.5 `innerHTML` injection surface in fit-checker (SEC)
- `public/scripts/fit-checker.js:92-96` — recent-query chips built via template literal with `${row.cat}` etc.
- `row.cat` comes from localStorage which is user-controlled.
- **Fix**: Use `textContent` + DOM construction or escape via helper.
- **Owner**: Codex (small PR, include test)

### 2.6 RUM endpoint unauthenticated (SEC)
- `api/rum.js` accepts anonymous POSTs with no rate limit.
- **Fix**: Add per-IP rate limit via Vercel KV or Edge middleware; reject payloads > 4KB.
- **Owner**: Codex (medium PR)

### 2.7 Color contrast fail (`--ink-3`) (A11Y)
- `public/styles.css` token `--ink-3: #8a8a8a` against `--paper` fails 4.5:1 at <18pt.
- **Fix**: Darken to `#6b6b6b`. Re-run axe.
- **Owner**: Codex (quick-win bundle)

---

## 3. P2 findings (backlog — group into Phase 44)

| # | Area | File | Finding |
|---|---|---|---|
<!-- doc-audit: ignore -->
| 3.1 | Dead | `scripts/common/fit-score.js` | Not imported outside its own test. Move logic into `search-core.js` or delete. |
| 3.2 | Dead | `scripts/generate-measurement-content.js`, `generate-measurement-svg.js` | Never called from `generate-all`. |
| 3.3 | Data | `data/series-dictionary.json` | Only 5 brands. Need tier2 expansion when 43b runs. |
| 3.4 | Data | `public/data/*.json` | 24 brand-casing conflicts (e.g. `MIDEA` vs `Midea`). 42b handles via `brand-canon.json`. |
| 3.5 | Perf | `public/index.html` | 115KB inline critical CSS — extract non-critical, load async. |
| 3.6 | Perf | `public/sw.js` | Cache-first with no version invalidation — users see stale content after deploy. |
| 3.7 | SEO | All pages | No `hreflang="en-AU"` declaration. |
| 3.8 | SEO | cavity/compare/guides pages | No OG image declared in meta. |
| 3.9 | A11y | `public/index.html` fit-checker inputs | Missing associated `<label for>` — screen readers announce input but not purpose. |
| 3.10 | Sec | `.github/workflows/*.yml` | `permissions:` block missing → defaults to `contents: write`. Apply least-privilege per job. |
| 3.11 | Sec | `secrets.GSC_SA_JSON` | Service account JSON should be split into SA email + private key secrets. |
| 3.12 | Repo | `.github/workflows/og-sync.yml` | Temporary helper from PR #11 Linux byte-fix — confirm deleted. |
| 3.13 | CI | `scripts/generate-sitemap.js`, `reports/link-graph.json`, `reports/schema-validation.json` | Date drift: `lastmod` / `generatedAt` use wallclock → any PR stale >1 day fails `test-and-verify`. Fix: derive `lastmod` from git log per file; remove or freeze `generatedAt` in reports. |
| 3.14 | CI | GitHub Actions event dispatch | `pull_request` event trigger stopped firing on this repo since 2026-04-22 13:42 UTC. `workflow_dispatch` still works. Cause unknown (possibly platform cache issue around workflow-file-modifying PRs). Monitor; if persists >48h, file GH support ticket. |

---

## 4. Recommended dispatch — quick-win bundle for Codex

Single PR, branch `phase-43a-quick-wins`, label `phase-43a`:

1. `vercel.json` — CSP + X-Frame-Options + Referrer-Policy headers (2.1)
2. OG images → WebP 85% + regenerate (2.2)
3. `scripts/verify-sitemap.js` + CI wire (2.3)
4. fit-checker recent-chip XSS hardening + RED test (2.5)
5. `--ink-3` contrast fix (2.7)

Estimated Codex effort: 1 session, ~10 files, ~40 test lines added.

**Excluded from quick-win** (need design discussion):
- Option A vs B vs C for P0 retailer backfill (user decision)
- RUM rate-limit (needs KV provisioning decision)
- SW cache strategy (needs rollout plan)
- Schema-on-guides (needs content audit first)

---

## 5. Phasing impact summary

| Phase | Current plan | Audit impact |
|---|---|---|
| 42b | Brand canon + drop + 301+IndexNow | **BLOCKED on P0 decision** — see §1.3 Option A/B/C |
| 43a | (This audit) | Delivered. Quick-win PR queued to Codex. |
| 43b | Hot-model backfill DW/DR/WM | Depends on P0 resolution; series-dict must expand first. |
| 44 | Backlog | Absorb §3 items |

---

## 6. Next action required from user

Please pick one:

1. **"Option A"** — I dispatch Codex to extend research-popularity to full catalog before 42b (+2-3 days, highest quality)
2. **"Option B"** — Codex decouples `unavailable` from `retailers.length === 0` and ships 42b as-specced (+1 day, medium risk)
3. **"Option C"** — Ship 42b as-specced, accept ~50-product post-drop catalog (fastest, SEO collapse risk)
4. **"quick-wins first"** — dispatch §4 PR to Codex now; decide P0 after that lands

Default if silent 24h: option 4 (quick-wins) — safe, unblocks other work, doesn't prejudice P0 decision.
