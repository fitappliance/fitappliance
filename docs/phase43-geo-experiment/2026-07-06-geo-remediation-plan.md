# FitAppliance GEO Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` before implementing. This plan is a remediation plan, not permission to expand GEO pages without gates.

**Goal:** Turn the rejected Gemini GEO proposal into a measured, evidence-first FitAppliance roadmap that improves AI/search citation visibility without adding hidden content, fake claims, schema drift, or inaccurate dimension advice.

**Architecture:** Keep Phase43 as the control plane. Add only small, testable improvements around metadata auditing, visible answer/evidence blocks, conservative schema eligibility, measurement, and changed-URL notification. Do not create a parallel GEO pipeline.

**Tech Stack:** Node.js CommonJS scripts, `node:test`, static HTML generators, existing Search Console import/export workflow, existing IndexNow script, existing schema/data/copy audits.

---

## Research Inputs

### Official sources

- Google Search Central, "Optimizing your website for generative AI features on Google Search", last updated 2026-06-29: GEO/AEO is still SEO from Google's perspective; AI features use core Search ranking and quality systems, RAG, query fan-out, and indexed pages.
- Google Search Central structured data guidelines: structured data must represent visible page content and must not be misleading, hidden, fake, or irrelevant.
- Google Product structured data docs: Product markup belongs on product pages and must match the page purpose. Compare pages and fit-check reference pages should not be treated as single-product merchant pages.
- Search Console Generative AI performance report: access is rolling out and may be unavailable; when available it groups impressions by page, country, date, and device.
- IndexNow docs: HTTP 200 means the search engine received the URL list, not that it indexed, ranked, or cited it.

### Agent Reach research

Agent Reach status during this research:

- `doctor`: `github`, `youtube`, `bilibili`, `v2ex`, `rss`, `exa_search`, and `web` are usable.
- `reddit`, `twitter`, and `xiaohongshu` are still `warn` because OpenCLI reports the Chrome extension as not connected.
- Direct Reddit search did not work because the MCP route still tried `rdt`, while the installer recommends OpenCLI. Use Exa/web search over public Reddit pages until that route is repaired.

Public practitioner/community patterns found through Agent Reach Exa/web search:

- Reddit SEO discussions are split on whether "GEO" is new or just SEO with new measurement. Common practical questions are tracking, ChatGPT/Perplexity citations, and whether AI Overviews cite different pages than classic organic rankings.
- Case-study posts should be treated as marketing claims, but their repeated operational patterns are useful: fixed query sets, weekly citation logging, visible question-answer blocks, original data/evidence, source attribution, date freshness, and platform-specific measurement.
- The strongest usable lesson for FitAppliance is not "add more schema"; it is "make high-confidence answers visible, concise, attributed, and measurable".

Representative external examples found:

- `https://www.reddit.com/r/SEO/comments/1lvnfjn/is_geo_generative_engine_optimization_a_new_skill/`
- `https://www.reddit.com/r/SEO/comments/1hl94a6/is_generative_engine_optimization_geo_or_ai/`
- `https://www.reddit.com/r/SEO/comments/1gxbj8c/whats_your_take_on_generative_engine_optimization/`
- `https://growthengineer.ai/blog/programmatic-seo-ai-citations-audit`
- `https://jetdigitalpro.com/ai-search-audit-case-study/`

## Current Local Baseline

Verified on 2026-07-06 from `/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2`:

- `npm run audit-dimension-axis -- --no-write`
  - `blockerCount: 0`
  - `warningCount: 42`
- `npm run validate-schema`
  - `pages=2346`
  - `blocks=7191`
  - `errors=0`
- `npm run gsc-indexing-audit`
  - 2026-07-06 baseline: `PASS sitemap=2345 products=1754`
  - 2026-07-07 GSC reset: `PASS sitemap=1960 products=1754`
- `npm run audit-indexability-policy`
  - 2026-07-07 GSC reset: `PASS sitemap=1960 sitemapViolations=0 missingNoindex=0`
- Existing Phase43 treatment/control manifest: `data/geo-treatment-pages.json`
  - 5 guide treatment pages
  - 5 fit-check treatment pages
  - 5 fit-check control pages
- Existing visible GEO blocks:
  - `scripts/common/geo-answer-blocks.js`
  - `tests/geo-answer-blocks.test.mjs`
  - guide and fit-check tests enforce visible answer/evidence blocks on treatment pages.
- Existing schema guard:
  - `scripts/audit-fit-check-schema.js`
  - `tests/fit-check-schema-audit.test.mjs`
  - fit-check pages must not include Product JSON-LD.
- Existing IndexNow path:
  - `scripts/ping-indexnow.js`
  - `tests/indexnow-batch.test.mjs`
  - `npm run ping-indexnow`

## Decisions

### Rejected from Gemini plan

- Do not create a new broad push-indexnow script; improve `scripts/ping-indexnow.js` only if needed.
- Do not add Product JSON-LD to fit-check or compare pages.
- Do not add schema-only clearance claims that are not visible in the HTML body.
- Do not create "zero-click defense" copy whose purpose is to withhold useful information.
- Do not publish fake soft-fail statistics such as "85% of users fit..." unless backed by real analytics.
- Do not use a 120-word meta description rule. That is too long and likely to be truncated.
- Do not rely on `.claude` or `.openclaw_context` as the enforcement layer for project rules.
- Do not treat IndexNow submission as proof of indexing, ranking, or AI citation.
- Do not expand programmatic GEO pages while GSC is reporting `Crawled - currently not indexed` samples from those same page families. Follow `docs/phase43-geo-experiment/2026-07-07-gsc-indexability-reset.md` first.

### Accepted with changes

- Add a GEO metadata audit, but start in report/warn mode and only make treatment-page violations blocking.
- Consider `WebApplication` or `SoftwareApplication` schema only for `index.html` and `pages/tools/fit-checker.html`, if it matches visible tool content.
- Improve README/data-veracity documentation, but use exact current mechanics and limitations instead of "AI authority score" claims.
- Keep external AI citation tracking, but define query sets, engines, dates, locations, and cited URL evidence before interpreting results.

## Execution Corrections Before Implementation

The initial plan was still too broad for a first remediation pass. Apply these corrections before writing code:

1. Freeze a Phase 0 baseline before changing metadata, copy, schema, or IndexNow behavior.
2. Keep Phase A scoped to the current Phase43 treatment/control manifest plus `/` and `/tools/fit-checker`.
3. Do not scan every static page in the first metadata audit; that would create warning noise without proving experiment readiness.
4. Use type-specific JSON-LD checks. Do not attempt broad "schema text appears in body" matching in V1.
5. Defer schema additions, changed-URL IndexNow logic, and trust documentation until the baseline and scoped audit are stable.
6. Keep a rollback path: remove a route from `data/geo-treatment-pages.json` or fail `--strict-treatment` if treatment pages drift.

## Phase 0: Baseline Freeze and Query Set

**Objective:** Make GEO measurement falsifiable before remediation changes.

**Files:**

<!-- doc-audit: ignore -->
- Create: `data/geo-query-set.json`
<!-- doc-audit: ignore -->
- Create: `scripts/generate-geo-baseline-report.js`
<!-- doc-audit: ignore -->
- Create: `tests/geo-query-set.test.mjs`
<!-- doc-audit: ignore -->
- Create: `tests/geo-baseline-report.test.mjs`
- Modify: `package.json`
- Modify: `docs/phase43-geo-experiment/phase43-geo-measurement.md`

**Rules:**

- Query set must declare baseline dates, observation window, engines, country, locale, device, and raw evidence capture requirements.
- Every Phase43 treatment and control route must be covered by at least one query.
- Every query route must resolve to an existing generated HTML file.
- Baseline report should summarize query coverage, manifest coverage, route existence, schema validation, dimension-axis audit, and GSC Generative AI import status when those reports exist.
- Missing or uncovered treatment/control routes are blockers.

**Commands:**

```text
node --test tests/geo-query-set.test.mjs tests/geo-baseline-report.test.mjs
npm run geo-baseline-report -- --no-write
```

**Package script:**

```json
"geo-baseline-report": "node scripts/generate-geo-baseline-report.js"
```

## Phase A-lite: Scoped Metadata and Claim Audit

**Objective:** Prevent future GEO copy drift without forcing mass rewrites.

**Files:**

<!-- doc-audit: ignore -->
- Create: `scripts/audit-geo-metadata.js`
<!-- doc-audit: ignore -->
- Create: `tests/geo-metadata-audit.test.mjs`
- Modify: `package.json`
- Modify: `docs/phase43-geo-experiment/phase43-geo-measurement.md`

**Rules:**

- Parse only `index.html`, `pages/tools/fit-checker.html` when present, and routes declared in `data/geo-treatment-pages.json`.
- Extract `<title>`, `<meta name="description">`, canonical URL, JSON-LD blocks, and visible body text.
- For Phase43 treatment pages only, flag as blocker when:
  - meta description is missing;
  - description contains unsupported guarantees, fake user statistics, or installation hacks;
  - description lacks at least one domain entity such as `cavity`, `clearance`, `width`, `height`, `depth`, `doorway`, `ventilation`, `mm`, `fridge`, `dishwasher`, `washing machine`, or `dryer`;
  - JSON-LD is invalid or missing required type-specific fields for `Article` or `FAQPage`;
  - a fit-check page includes Product JSON-LD.
- For controls and core pages, report warnings first.
- Write `reports/geo/metadata-audit-latest.json`.
- In V1, do not attempt broad JSON-LD body parity. Validate only JSON parseability, Product-on-fit-check bans, and basic type-specific fields for `Article` and `FAQPage`.

**Commands:**

```text
node --test tests/geo-metadata-audit.test.mjs
npm run audit-geo-metadata -- --no-write
npm run audit-geo-metadata -- --strict-treatment
```

**Package script:**

```json
"audit-geo-metadata": "node scripts/audit-geo-metadata.js"
```

**Do not wire into `npm run build` yet.** Add it to release gates first. Promote to build blocker only after the first clean report.

**Execution scope for this pass:** implement Phase 0 and Phase A-lite only. Phase B through Phase F stay planned but deferred until the baseline report and scoped audit produce stable outputs.

## Phase B: Schema Eligibility Cleanup

**Objective:** Add only schema that is both eligible and visibly supported.

**Files:**

- Modify: `scripts/validate-schema.js`
<!-- doc-audit: ignore -->
- Modify: `tests/schema.test.mjs` or create `tests/geo-schema-eligibility.test.mjs`
<!-- doc-audit: ignore -->
- Optional create: `scripts/common/tool-schema.js`
- Optional modify: `index.html`
- Optional modify: `pages/tools/fit-checker.html`

**Rules:**

- Keep Product JSON-LD only on evidence-backed product pages that satisfy product snippet or merchant listing requirements.
- Keep the existing fit-check Product JSON-LD ban.
- Do not add Product schema to compare pages unless the page becomes an explicit product page for one product.
- If adding tool schema:
  - use `WebApplication` or `SoftwareApplication`;
  - target only `index.html` and `pages/tools/fit-checker.html`;
  - ensure the tool name, description, input fields, and category are visible in page text;
  - validate JSON-LD with existing `npm run validate-schema`.

**Commands:**

```text
node --test tests/geo-schema-eligibility.test.mjs
npm run audit-geo-schema-eligibility -- --no-write
npm run validate-schema
node --test tests/fit-check-schema-audit.test.mjs
```

## Phase C: Treatment Content Upgrade

**Objective:** Improve AI extractability through visible, evidence-backed blocks, not hidden markup.

**Files:**

- Modify: `scripts/common/geo-answer-blocks.js`
- Modify: `tests/geo-answer-blocks.test.mjs`
- Modify: `scripts/generate-guides.js`
- Modify: `scripts/generate-fit-check-pages.js`
- Modify: `tests/guides-content.test.mjs`
- Modify: `tests/fit-check-pages.test.mjs`

**Rules:**

- Every treatment page keeps exactly one `.geo-answer-target` and one `.geo-evidence-box`.
- Evidence boxes should prefer:
  - visible source page links;
  - source confidence labels;
  - verified date when available;
  - dimensions shown as `W / H / D` and never inferred silently.
- Fit-check answer copy must state uncertainty conservatively:
  - allowed: "based on the current verified dimensions"
  - allowed: "remeasure the finished cavity before ordering"
  - banned: fake success rates, forced-click language, or renovation advice such as trimming cabinetry.
- Zero-match or near-match copy must provide safe next steps:
  - remeasure width, height, and depth;
  - check door swing and rear plumbing/power protrusion;
  - show nearest lower-width alternatives only when data is verified;
  - never claim a workaround is common without evidence.

**Commands:**

```bash
node --test tests/geo-answer-blocks.test.mjs tests/guides-content.test.mjs tests/fit-check-pages.test.mjs
npm run audit-copy
npm run audit-dimension-axis -- --strict
```

## Phase D-lite: Measurement Report Upgrade

**Objective:** Make GEO success falsifiable.

**Files:**

<!-- doc-audit: ignore -->
- Create: `scripts/generate-geo-measurement-report.js`
<!-- doc-audit: ignore -->
- Create: `tests/geo-measurement-report.test.mjs`
- Modify: `docs/phase43-geo-experiment/phase43-geo-measurement.md`
- Modify: `docs/phase43-geo-experiment/geo-ai-citation-log.csv`

**Query-set schema:**

```json
{
  "schema_version": 1,
  "queries": [
    {
      "id": "guide-fridge-clearance-au",
      "query": "How much clearance does a fridge need in Australia?",
      "intent": "informational",
      "expected_routes": ["/guides/fridge-clearance-requirements"],
      "engines": ["google_ai_overviews", "google_ai_mode", "perplexity", "chatgpt_browsing"]
    }
  ]
}
```

**Report rules:**

- Join `data/geo-treatment-pages.json`, Phase 0 `data/geo-query-set.json`, GSC Generative AI import output, normal GSC exports, and manual citation CSV.
- Report treatment vs control by route and measurement bucket.
- Treat a citation as useful only when:
  - the cited URL is a treatment/control route or matched canonical;
  - the answer claim is materially correct;
  - date, country, device, engine, and prompt are recorded.
- Do not expand treatment until day 28 unless a blocker fix requires removing pages.

**Commands:**

```text
npm run gsc-fetch
npm run keyword-gap
npm run gsc-genai-import -- --input-dir reports/gsc-genai-exports
npm run geo-measurement-report -- --no-write
```

## Phase E: IndexNow and Crawl Notification

**Objective:** Notify engines only about changed pages and keep reports honest.

**Files:**

- Modify: `scripts/ping-indexnow.js`
- Modify: `tests/indexnow-batch.test.mjs`
- Optional create: `reports/indexnow/`

**Rules:**

- Keep current script name.
- Add optional `--changed-from=<git-ref>` mode.
- Add optional `--manifest=data/geo-treatment-pages.json` mode for treatment/control pages.
- Keep `--include-prefix` support.
- Report endpoint status, URL count, and selected routes.
- Never state that a successful ping means indexing, ranking, or AI citation.

**Commands:**

```bash
node --test tests/indexnow-batch.test.mjs
npm run ping-indexnow -- --include-prefix=/guides/ --report=reports/indexnow/guides-latest.json
```

## Phase F: Trust Documentation

**Objective:** Make the project externally legible without making unverified authority claims.

**Files:**

- Modify: `README.md`
- Optional modify: `docs/data-accuracy-audit.md`
- Optional create: `docs/data-veracity-and-fit-logic.md`

**Content requirements:**

- Explain data sources: retailer specs, manufacturer/PDF evidence where available, runtime catalog, and evidence tiers.
- Explain fitting logic: product dimensions, cavity dimensions, practical clearance defaults, door swing/access caveats, and manual verification reminder.
- Explain limitations: prices/availability change, clearance may be unverified, installation conditions vary by home, and FitAppliance is a pre-purchase fit tool, not an installer certification.
- Link to existing audits and scripts instead of claiming an abstract "AI authority score".

**Commands:**

```bash
npm run audit-copy
npm run audit-docs
```

## Release Gate

Before any GEO remediation PR is merged:

```bash
npm test
npm run audit-dimension-axis -- --strict
npm run validate-schema
npm run gsc-indexing-audit
npm run gsc-bucket-audit
npm run audit-copy
```

If Phase A is implemented:

```text
npm run audit-geo-metadata -- --strict-treatment
```

If Phase D is implemented:

```text
npm run geo-baseline-report -- --no-write
npm run geo-measurement-report -- --no-write
```

If Phase B is implemented:

```text
npm run audit-geo-schema-eligibility -- --no-write
```

## Suggested Implementation Order

1. Phase 0: baseline query set and route/report coverage.
2. Phase A-lite: scoped metadata and claim audit, report-only first, then strict treatment gate.
3. Phase D-lite: measurement report using the frozen query set.
4. Phase B: cautious tool schema on `index.html` and `pages/tools/fit-checker.html` only.
5. Phase C: improve existing treatment blocks without expanding page count.
6. Phase E: changed-URL IndexNow reporting.
7. Phase F: README/data-veracity documentation.
8. Review 28 days of treatment/control data before expanding beyond the current cohort.

## Expansion Criteria

Expand the treatment cohort only when all are true:

- dimension-axis blocker count is zero;
- schema validation errors are zero;
- treatment pages pass metadata/claim audit;
- no Product JSON-LD appears on fit-check pages;
- at least 28 days of GSC or manual citation data exists;
- treatment pages show better or equal performance than matched controls on at least one meaningful metric without a drop in click-through quality.
