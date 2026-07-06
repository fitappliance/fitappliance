# Phase 43 GEO Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a measured, evidence-first GEO experiment for FitAppliance without amplifying incorrect appliance dimensions or low-value programmatic pages.

**Architecture:** Treat GEO as SEO plus answer clarity, not as a separate hack layer. The rollout sequence is data gate, source-of-truth repair, cohort selection, visible answer/evidence blocks, measurement import, then deployment. All schema must match visible content and all fit-check treatment pages must pass deterministic dimension checks before publication.

**Tech Stack:** Node.js CommonJS scripts, `node:test`, existing `googleapis`, existing GSC/report scripts, static HTML generators, GitHub Actions/Vercel validation.

---

## Research Summary

External sources used for this plan:

- Google says AI Overviews and AI Mode use normal Search eligibility; there are no extra technical requirements beyond being indexed and snippet-eligible: https://developers.google.com/search/docs/appearance/ai-features
- Google's generative AI optimization guide says SEO fundamentals still apply, recommends unique non-commodity content, and says to ignore Google-specific hacks such as `llms.txt`, artificial chunking, AI-only rewrites, inauthentic mentions, and overfocusing on structured data: https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
- Google spam policies now explicitly cover manipulation of generative AI responses and scaled content abuse: https://developers.google.com/search/docs/essentials/spam-policies
- Google structured data policies require marked-up content to be visible and not misleading: https://developers.google.com/search/docs/appearance/structured-data/sd-policies
- FAQ rich results were removed from Google Search in June 2026 documentation updates; FAQPage may still describe visible Q&A, but it is no longer a rich-result growth lever: https://developers.google.com/search/updates#removing-faq-rich-result
- Search Console's Generative AI performance report is rolling out to a subset of site owners. It shows impressions by page, country, date, and device and supports export; the current repo's API script does not fetch this new report yet: https://support.google.com/webmasters/answer/16984139
- The original GEO paper reports visibility gains up to 40%, but performance varies by domain and engine, so FitAppliance should run a small controlled experiment: https://arxiv.org/abs/2311.09735

Local evidence used for this plan:

- Current static page inventory: 2,574 HTML pages; 1,754 product pages; 239 fit-check pages; 5 guides.
- Current schema validation: `node scripts/validate-schema.js` reports `pages=2574 blocks=7644 errors=0`.
- Current indexing gate: `node scripts/audit-gsc-indexing.js` reports `PASS sitemap=2573 products=1754`.
- Targeted tests passed: `node --test tests/data-accuracy-audit.test.mjs tests/guides-content.test.mjs tests/guides-schema.test.mjs tests/gsc.test.mjs tests/gsc-bucket-audit.test.mjs tests/gsc-credentials.test.mjs` reports 52/52 passing.
- Runtime data drift exists: `data/catalog-final.json` has `Westinghouse WBE4302WC` as `w=699, h=1725, d=723`, while `public/data/fridges.json` and `public/data/appliances.json` still have `w=1725, h=699, d=723`.
- Published product page for WBE4302WC is correct because product pages read `data/catalog-final.json`; fit-check pages are wrong because they read runtime `public/data/*`.
- Current data accuracy report has 0 blockers, 25 stale price warnings, and 2,252 products missing field-level evidence. GEO treatment must therefore be limited to high-evidence pages.
- GitHub repo `fitappliance/fitappliance` is public, MIT-licensed, and has open PR #181 touching affiliate/compare links; this plan must not break sponsored/no-follow retailer link behavior.

## Non-Negotiable Guardrails

- Do not publish more GEO/answer-target pages until dimension-axis blockers are zero.
- Do not create `llms.txt` or AI-only hidden content for Google Search.
- Do not add schema that describes content missing from the visible HTML body.
- Do not use automated Google result scraping. Use GSC exports, Search Console UI, approved APIs, and manual AI citation logging.
- Do not claim that GEO guarantees ranking, citations, or clicks within a fixed number of days.
- Do not generate doorway-style query variants whose only purpose is manipulating AI or organic rankings.

## File Map

- Create `scripts/audit-dimension-axis.js`: deterministic audit for swapped width/height/depth, raw-evidence mismatch, and public/catalog-final drift.
- Create `tests/dimension-axis-audit.test.mjs`: focused tests for WBE4302WC-style swaps, legitimate chest/underbench exceptions, and report output.
- Modify `package.json`: add `audit-dimension-axis` script.
- Modify `docs/data-accuracy-audit.md`: document the new dimension-axis gate.
- Create `scripts/apply-verified-catalog-overrides.js`: copy verified dimensions from `data/catalog-final.json` into `public/data/appliances.json` when raw evidence proves the runtime row is stale or swapped.
- Create `tests/verified-catalog-overrides.test.mjs`: verify WBE4302WC repair and no mutation for unverifiable rows.
- Modify `package.json`: run verified override before `split-data` in `sync`.
- Modify `scripts/generate-fit-check-pages.js`: exclude blocker rows from published fit-check pages and keep them in `reports/fit-check/quarantined`.
- Create `tests/fit-check-dimension-gate.test.mjs`: ensure flagged products are not published.
- Create `scripts/common/geo-answer-blocks.js`: reusable visible answer target and evidence box renderer.
- Create `tests/geo-answer-blocks.test.mjs`: escaping, visible-source, and no-hidden-content checks.
- Modify `scripts/generate-guides.js`: add answer/evidence blocks to five guide pages.
- Create `data/geo-treatment-pages.json`: explicit treatment/control cohort manifest.
- Create `tests/geo-treatment-cohort.test.mjs`: manifest schema and eligibility checks.
- Modify `scripts/generate-fit-check-pages.js`: add answer/evidence blocks only for treatment fit-check pages that pass dimension gate.
- Create `scripts/import-gsc-generative-ai-export.js`: parse Search Console Generative AI export CSV into `reports/gsc-genai-latest.json`.
- Create `tests/gsc-generative-ai-import.test.mjs`: parse pages/countries/devices/dates CSV exports.
- Create `docs/phase43-geo-experiment/phase43-geo-measurement.md`: measurement protocol and weekly review commands.
- Create `docs/phase43-geo-experiment/geo-ai-citation-log.csv`: manual AI citation log with fixed columns.

## Task 1: Add Dimension-Axis Audit

**Files:**
- Create: `scripts/audit-dimension-axis.js`
- Create: `tests/dimension-axis-audit.test.mjs`
- Modify: `package.json`
- Modify: `docs/data-accuracy-audit.md`

- [ ] **Step 1: Write failing tests**

Add tests that prove the audit catches the real WBE4302WC class of defect and avoids obvious false positives.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  findDimensionAxisIssues,
  summarizeDimensionAxisIssues
} = require('../scripts/audit-dimension-axis.js');

test('dimension-axis audit flags swapped public runtime dimensions against raw evidence', () => {
  const products = [{
    id: 'fridge-arf2745',
    cat: 'fridge',
    brand: 'Westinghouse',
    model: 'WBE4302WC',
    w: 1725,
    h: 699,
    d: 723,
    features: ['Upright', '5B']
  }];
  const rawEvidence = new Map([['fridge-arf2745', {
    dimensions: { width_mm: 699, height_mm: 1725, depth_mm: 723 },
    confidence_score: 0.9
  }]]);

  const issues = findDimensionAxisIssues({ products, rawEvidence });

  assert.equal(issues.some((issue) => issue.code === 'swapped_against_raw_evidence'), true);
  assert.equal(summarizeDimensionAxisIssues(issues).blockerCount, 1);
});

test('dimension-axis audit keeps chest-style wide fridges as review-only, not blockers', () => {
  const products = [{
    id: 'fridge-chest-1',
    cat: 'fridge',
    brand: 'AKAI',
    model: 'AK-688-CF',
    w: 1905,
    h: 865,
    d: 820,
    features: ['Chest', '6C']
  }];

  const issues = findDimensionAxisIssues({ products, rawEvidence: new Map() });

  assert.equal(issues.some((issue) => issue.severity === 'blocker'), false);
});
```

Run:

```bash
node --test tests/dimension-axis-audit.test.mjs
```

Expected: fail because `scripts/audit-dimension-axis.js` does not exist.

- [ ] **Step 2: Implement the audit**

Implementation requirements:

- Load runtime products from `public/data/fridges.json`, `dishwashers.json`, `dryers.json`, and `washing-machines.json`.
- Load raw PDF evidence from `data/pdf-evidence-raw/*.json` and index by `product_id`.
- Load `data/catalog-final.json` and index by product id.
- Emit blockers when raw evidence proves the runtime dimensions are swapped or different by 5mm or more.
- Emit review warnings for plausible upright fridge anomalies where `w > h` and the product is not chest-style.
- Support `--strict`, `--no-write`, and default report writing to `reports/dimension-axis/latest.json` and `reports/dimension-axis/latest.md`.

The core comparison should use these exact field mappings:

```js
const rawDims = {
  w: Number(raw.extracted?.dimensions?.width_mm),
  h: Number(raw.extracted?.dimensions?.height_mm),
  d: Number(raw.extracted?.dimensions?.depth_mm)
};
```

- [ ] **Step 3: Wire package script**

Update `package.json`:

```json
"audit-dimension-axis": "node scripts/audit-dimension-axis.js"
```

- [ ] **Step 4: Verify**

Run:

```bash
node --test tests/dimension-axis-audit.test.mjs
npm run audit-dimension-axis -- --no-write
```

Expected before repair: WBE4302WC is reported as a blocker because runtime public data is swapped against raw evidence.

## Task 2: Repair Verified Runtime Dimension Drift

**Files:**
- Create: `scripts/apply-verified-catalog-overrides.js`
- Create: `tests/verified-catalog-overrides.test.mjs`
- Modify: `package.json`
- Modify: `docs/data-accuracy-audit.md`

- [ ] **Step 1: Write failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  applyVerifiedCatalogOverrides
} = require('../scripts/apply-verified-catalog-overrides.js');

test('verified catalog overrides repair WBE4302WC dimensions in runtime data', () => {
  const runtime = {
    products: [{
      id: 'fridge-arf2745',
      cat: 'fridge',
      brand: 'Westinghouse',
      model: 'WBE4302WC',
      w: 1725,
      h: 699,
      d: 723,
      evidence: { trust_level: 'retailer_spec' }
    }]
  };
  const catalogFinal = {
    products: [{
      id: 'fridge-arf2745',
      cat: 'fridge',
      brand: 'Westinghouse',
      model: 'WBE4302WC',
      w: 699,
      h: 1725,
      d: 723,
      evidence: {
        raw_json_path: 'data/pdf-evidence-raw/WBE4302WC.json',
        confidence_score: 0.9,
        verified_fields: ['dimensions']
      }
    }]
  };

  const result = applyVerifiedCatalogOverrides({ runtime, catalogFinal });

  assert.equal(result.products[0].w, 699);
  assert.equal(result.products[0].h, 1725);
  assert.equal(result.summary.updatedProducts, 1);
});
```

Run:

```bash
node --test tests/verified-catalog-overrides.test.mjs
```

Expected: fail because the script does not exist.

- [ ] **Step 2: Implement verified override script**

Rules:

- Only copy `w`, `h`, `d`, and `evidence` from `data/catalog-final.json` when the final row has `evidence.raw_json_path` or `evidence.confidence_score >= 0.8`.
- Do not copy retailer links, affiliate fields, price, or availability from `catalog-final`.
- Preserve runtime product order.
- Write `public/data/appliances.json` atomically.
- Call existing `scripts/split-appliances.js` after writing, or leave splitting to the package script.

- [ ] **Step 3: Wire sync path**

Change `package.json`:

```json
"sync": "node scripts/sync.js && node scripts/apply-verified-catalog-overrides.js && node scripts/split-appliances.js"
```

- [ ] **Step 4: Verify repair**

Run:

```bash
npm run sync
npm run audit-dimension-axis -- --no-write
node -e "const f=require('./public/data/fridges.json'); const p=f.products.find(x=>x.id==='fridge-arf2745'); console.log(p.w,p.h,p.d)"
```

Expected:

```text
699 1725 723
```

## Task 3: Gate Fit-Check Publishing on Dimension Safety

**Files:**
- Modify: `scripts/generate-fit-check-pages.js`
- Create: `tests/fit-check-dimension-gate.test.mjs`

- [ ] **Step 1: Write failing tests**

Test that a product with a dimension-axis blocker cannot be written to `pages/fit-check/` and is instead reported under quarantine.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  selectFitCheckCombinations
} = require('../scripts/generate-fit-check-pages.js');

test('fit-check generator excludes dimension-axis blocker products from published combinations', () => {
  const catalog = [
    { id: 'bad', cat: 'fridge', brand: 'Westinghouse', model: 'WBE4302WC', w: 1725, h: 699, d: 723, priorityScore: 100 },
    { id: 'good', cat: 'fridge', brand: 'Electrolux', model: 'EBE4302BD', w: 699, h: 1725, d: 723, priorityScore: 90 }
  ];
  const blockedProductIds = new Set(['bad']);

  const combos = selectFitCheckCombinations(catalog, { topN: 20, cavityWidths: [620], blockedProductIds });

  assert.equal(combos.some((combo) => combo.product.id === 'bad'), false);
  assert.equal(combos.some((combo) => combo.product.id === 'good'), true);
});
```

- [ ] **Step 2: Implement generator gate**

Add an optional `blockedProductIds` set to `selectFitCheckCombinations`. The generated CLI should load `reports/dimension-axis/latest.json` when present and exclude blocker product ids from published combinations.

- [ ] **Step 3: Verify**

Run:

```bash
node --test tests/fit-check-dimension-gate.test.mjs
npm run generate-product-pages
npm run repair-fit-check-links
npm run validate-schema
```

Expected: no schema errors and no published fit-check page should claim WBE4302WC is 1725mm wide after Task 2.

## Task 4: Add Visible GEO Answer Blocks

**Files:**
- Create: `scripts/common/geo-answer-blocks.js`
- Create: `tests/geo-answer-blocks.test.mjs`

- [ ] **Step 1: Write failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  renderAnswerTarget,
  renderEvidenceBox
} = require('../scripts/common/geo-answer-blocks.js');

test('geo answer blocks render visible escaped content', () => {
  const html = renderAnswerTarget({
    question: 'Will a 600mm dishwasher fit a 600mm cavity?',
    answer: 'Usually no. Measure the real opening and allow service space.'
  });

  assert.match(html, /class="geo-answer-target"/);
  assert.match(html, /Will a 600mm dishwasher fit/);
  assert.doesNotMatch(html, /display:\s*none|hidden/i);
});

test('geo evidence box links to visible source pages without schema-only claims', () => {
  const html = renderEvidenceBox({
    title: 'Evidence used',
    items: [
      { label: 'FitAppliance guide', href: '/guides/dishwasher-cavity-sizing', detail: 'Visible buyer guide' }
    ]
  });

  assert.match(html, /Evidence used/);
  assert.match(html, /href="\/guides\/dishwasher-cavity-sizing"/);
});
```

- [ ] **Step 2: Implement renderer**

Implement:

- `renderAnswerTarget({ question, answer, caveat })`
- `renderEvidenceBox({ title, items })`
- `visibleTextFromGeoBlock(html)` for tests

Use the existing HTML escaping pattern from generators and do not add JSON-LD here.

- [ ] **Step 3: Verify**

Run:

```bash
node --test tests/geo-answer-blocks.test.mjs
```

Expected: pass.

## Task 5: Apply Treatment to Guides First

**Files:**
- Modify: `scripts/generate-guides.js`
- Modify: `tests/guides-content.test.mjs`
- Modify: `tests/guides-schema.test.mjs`

- [ ] **Step 1: Add guide-level tests**

Extend guide tests so every guide has:

- one visible `.geo-answer-target`
- one visible `.geo-evidence-box`
- exactly one Article JSON-LD block
- no FAQPage JSON-LD on guide pages

- [ ] **Step 2: Implement guide treatment**

Use `renderAnswerTarget` and `renderEvidenceBox` near the top of each guide. Keep content specific to the guide, for example:

- fridge guide answer: clearance equals product dimensions plus side/rear/top gaps and door-swing/delivery constraints.
- dishwasher guide answer: a 600mm dishwasher does not automatically fit a 600mm bay because cabinetry, services, and finished floors reduce usable space.
- washing machine guide answer: doorway fit must consider the narrowest point and turning space, not only appliance width.

- [ ] **Step 3: Verify guide treatment**

Run:

```bash
npm run generate-guides
node --test tests/guides-content.test.mjs tests/guides-schema.test.mjs tests/geo-answer-blocks.test.mjs
npm run validate-schema
```

Expected: guides pass content/schema tests and still expose exactly one Article JSON-LD block each.

## Task 6: Define and Enforce Treatment Cohort

**Files:**
- Create: `data/geo-treatment-pages.json`
- Create: `tests/geo-treatment-cohort.test.mjs`

- [ ] **Step 1: Create manifest schema test**

Required manifest shape:

```json
{
  "schema_version": 1,
  "experiment": "phase43-geo",
  "started_at": "2026-07-06",
  "treatment": [],
  "controls": []
}
```

Each row must include:

- `route`
- `template`
- `primary_query`
- `match_key`
- `evidence_level`
- `measurement_bucket`

- [ ] **Step 2: Seed treatment/control rows**

Use all five guides as treatment. Add 20 fit-check treatment pages only after Task 3 passes. Match each treatment fit-check with a control page from the same category and cavity width where possible.

Recommended query set:

- How much clearance does a fridge need in Australia?
- Will a 600mm dishwasher fit a 600mm cavity?
- What fridge fits a 620mm cavity?
- How do I measure a fridge cavity before buying?
- How much space behind a fridge is needed?
- Can a washing machine fit through a 600mm doorway?
- What size cavity does a built-in dishwasher need?
- How do I check appliance dimensions before delivery?

- [ ] **Step 3: Verify cohort**

Run:

```bash
node --test tests/geo-treatment-cohort.test.mjs
```

Expected: every treatment route exists, every control route exists, and no route appears in both groups.

## Task 7: Apply Treatment to Eligible Fit-Check Pages

**Files:**
- Modify: `scripts/generate-fit-check-pages.js`
- Modify: `tests/fit-check-pages.test.mjs`
- Modify: `tests/fit-check-schema-audit.test.mjs`

- [ ] **Step 1: Add tests**

For treatment fit-check pages:

- H1 remains the user question.
- answer block appears before long supporting detail.
- evidence box links to product page, guide page, and source/provenance block when available.
- no `Product` schema is added by fit-check treatment.
- FAQ answers use the same dimensions visible in the page body.

- [ ] **Step 2: Implement treatment**

Load `data/geo-treatment-pages.json` in the fit-check generator. Only routes listed in `treatment` get answer/evidence blocks.

- [ ] **Step 3: Verify**

Run:

```bash
npm run generate-product-pages
npm run repair-fit-check-links
node --test tests/fit-check-pages.test.mjs tests/fit-check-schema-audit.test.mjs tests/fit-check-dimension-gate.test.mjs
npm run validate-schema
```

Expected: no schema errors and no fit-check answer block on control pages.

## Task 8: Add Generative AI Measurement Import

**Files:**
- Create: `scripts/import-gsc-generative-ai-export.js`
- Create: `tests/gsc-generative-ai-import.test.mjs`
- Create: `docs/phase43-geo-experiment/phase43-geo-measurement.md`
- Create: `docs/phase43-geo-experiment/geo-ai-citation-log.csv`
- Modify: `package.json`

- [ ] **Step 1: Write importer tests**

Test CSV headers for GSC export files:

```text
Page,Impressions
Country,Impressions
Device,Impressions
Date,Impressions
```

Importer output:

```json
{
  "schema_version": 1,
  "source": "gsc-generative-ai-export",
  "summary": {
    "totalImpressions": 0,
    "pageRows": 0
  },
  "pages": []
}
```

- [ ] **Step 2: Implement importer**

Use the existing CSV parser style from `scripts/audit-gsc-buckets.js`. Do not add a dependency.

Add package script:

```json
"gsc-genai-import": "node scripts/import-gsc-generative-ai-export.js"
```

- [ ] **Step 3: Create manual citation log**

Create `docs/phase43-geo-experiment/geo-ai-citation-log.csv` with header:

```csv
date,engine,country,device,prompt,route_group,expected_route,cited_url,cited_domain,citation_position,answer_claim,notes
```

- [ ] **Step 4: Document weekly measurement**

`docs/phase43-geo-experiment/phase43-geo-measurement.md` must specify:

```bash
npm run gsc-fetch
npm run keyword-gap
npm run gsc-genai-import -- --input-dir reports/gsc-genai-exports
npm run audit-dimension-axis -- --strict
npm run validate-schema
```

It must also state that Search Console Generative AI report access may be unavailable for the property during rollout, in which case the manual citation log and standard GSC query/page rows are the fallback.

## Task 9: Final Verification and Deployment Gate

**Files:**
- Modify only files changed by Tasks 1-8.

- [ ] **Step 1: Full local validation**

Run:

```bash
npm run audit-dimension-axis -- --strict
npm run audit-data-accuracy -- --no-write
npm run build
npm run validate-schema
npm run gsc-indexing-audit
npm run gsc-bucket-audit
npm run audit-copy
npm test
```

Expected:

- dimension-axis strict gate passes.
- schema validation has 0 errors.
- no generated guide or treatment fit-check page contains schema-only claims.
- no product/retailer affiliate behavior regresses.

- [ ] **Step 2: Manual spot checks**

Inspect these local files after build:

```text
pages/guides/fridge-clearance-requirements.html
pages/guides/dishwasher-cavity-sizing.html
pages/fit-check/westinghouse-wbe4302wc-in-620mm-cavity.html
pages/products/westinghouse-wbe4302wc-fridge-arf2745.html
public/data/fridges.json
public/data/appliances.json
```

Expected:

- WBE4302WC is `699mm wide, 1725mm high, 723mm deep` everywhere.
- guide answer blocks are visible and useful.
- fit-check treatment pages link to evidence without overclaiming verified fit.

- [ ] **Step 3: Commit sequence**

Use small commits:

```bash
git add scripts/audit-dimension-axis.js tests/dimension-axis-audit.test.mjs package.json docs/data-accuracy-audit.md
git commit -m "test: gate appliance dimension axis accuracy"

git add scripts/apply-verified-catalog-overrides.js tests/verified-catalog-overrides.test.mjs public/data/appliances.json public/data/fridges.json public/data/appliances-meta.json
git commit -m "fix: sync verified appliance dimensions into runtime data"

git add scripts/common/geo-answer-blocks.js tests/geo-answer-blocks.test.mjs scripts/generate-guides.js tests/guides-content.test.mjs tests/guides-schema.test.mjs pages/guides
git commit -m "feat: add evidence-first answer blocks to guides"

git add data/geo-treatment-pages.json tests/geo-treatment-cohort.test.mjs scripts/generate-fit-check-pages.js tests/fit-check-pages.test.mjs tests/fit-check-schema-audit.test.mjs pages/fit-check reports/fit-check
git commit -m "feat: apply geo treatment to verified fit-check pages"

git add scripts/import-gsc-generative-ai-export.js tests/gsc-generative-ai-import.test.mjs docs/phase43-geo-experiment/phase43-geo-measurement.md docs/phase43-geo-experiment/geo-ai-citation-log.csv package.json
git commit -m "feat: add generative ai visibility measurement workflow"
```

## Success Criteria

- `npm run audit-dimension-axis -- --strict` passes.
- WBE4302WC and any raw-evidence-confirmed swapped products are corrected across product pages, fit-check pages, and runtime JSON.
- Treatment cohort is explicit and small.
- Guides and selected fit-check pages have visible answer/evidence blocks.
- No hidden AI-only content or new Google-specific special files are introduced.
- GSC standard reporting still works.
- Search Console Generative AI export can be imported when available.
- Manual AI citation log exists for ChatGPT/Gemini/Perplexity checks without scraping Google results.
