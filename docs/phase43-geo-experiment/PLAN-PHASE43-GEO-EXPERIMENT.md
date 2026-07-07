# Phase 43 GEO Experiment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the WeChat “GEO” idea into a safe, evidence-first FitAppliance experiment that improves AI/search answer visibility without amplifying inaccurate appliance dimensions.

**Architecture:** Do not add generic AI content at scale. First add deterministic data-accuracy gates, then select a small treatment cohort of high-confidence pages, add answer-target/evidence blocks to those pages only, and measure against a matched control cohort in GSC plus manual AI citation checks.

**Tech Stack:** Static HTML generation, Node.js scripts, `node --test`, JSON data under `public/data`, generated pages under `pages/`, reports under `reports/`, GSC tooling via `scripts/gsc-fetch.js`.

## Global Constraints

- Do **not** publish more GEO pages until high-priority dimension-axis issues are gated.
- Do **not** claim “GEO gets Google ranking in 3 days”; treat it as an unverified growth hypothesis.
- Do **not** fabricate AI Overview/Gemini citations; every citation observation must include query, date, country/device context, and evidence notes.
- Do **not** add schema that contradicts visible page content.
- Prefer small deterministic scripts over LLM-only generation.
- Any new generated copy must remain installation-first: fit, clearance, cavity, doorway, manual/source verification.
- GSC credentials must be restored before the experiment is considered measurable.

---

## 1. Background and Evidence

### 1.1 Source article being evaluated

A WeChat article argued that sites can “do GEO instead of SEO” by using Gemini to convert keywords into natural-language questions, writing short answer paragraphs, adding FAQ/Q&A schema, and distributing similar answers across multiple platforms. It claimed an example site reached Google first position in three days.

### 1.2 Truth assessment

| Claim | Assessment | FitAppliance implication |
|---|---:|---|
| Convert keywords into user questions | High confidence | Strong fit: FitAppliance already has `Will X fit Y cavity?` pages. |
| Make answer paragraphs easy for AI systems to quote | Medium/high confidence | Add concise answer-target blocks to selected pages. |
| FAQ/Q&A schema helps machine understanding | Medium confidence | Useful only when visible content is accurate; FitAppliance already has large FAQ coverage. |
| Multi-platform brand mentions help AI recall | Medium/low confidence | Use cautiously; avoid spam. Prioritise site evidence and genuine helpful answers. |
| “3 days to Google #1” | Low confidence / unverified | Do not use as planning assumption. Measure over 4–8 weeks. |
| GEO replaces SEO | False framing | GEO is an expression layer on top of crawl/index/ranking fundamentals. |

### 1.3 Current FitAppliance assets discovered

Observed locally in `/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2`:

```text
HTML pages: 2574
products pages: 1754
brands pages: 291
fit-check pages: 239
compare pages: 140
cavity pages: 61
location pages: 40
doorway pages: 31
guides pages: 5
```

Structured-data scale:

```text
FAQPage: 2316
Question: 7395
Answer: 7395
Article: 386
Product: 1308
BreadcrumbList: 2217
```

Existing high-fit pattern:

```text
/fit-check/westinghouse-wbe4302wc-in-620mm-cavity
Title: Will the Westinghouse WBE4302WC fit a 620mm cavity?
```

### 1.4 Critical blocker found during research

The live/generated page for `Westinghouse WBE4302WC` currently reports:

```text
Width: 1725mm
Height: 699mm
Depth: 723mm
```

External evidence from Westinghouse / retailer specs indicates the likely correct mapping is:

```text
Height: 1725mm
Width: 699mm
Depth: 723mm
```

The local data currently contains:

```json
{
  "id": "fridge-arf2745",
  "cat": "fridge",
  "brand": "Westinghouse",
  "model": "WBE4302WC",
  "w": 1725,
  "h": 699,
  "d": 723
}
```

A rough anomaly scan found:

```text
public/data/fridges.json fridges=1376 suspect_w_gt_h_and_h_lt_1000=194
public/data/appliances.json fridges=1376 suspect_w_gt_h_and_h_lt_1000=194
```

Some of these may be chest freezers or horizontal appliances, but at least WBE4302WC is a clear high-risk example. **This must be gated before GEO treatment is expanded.**

---

## 2. Desired Experiment Shape

### 2.1 Hypothesis

If FitAppliance adds concise, evidence-backed, answer-target blocks to a small set of accurate high-intent pages, then selected pages should improve one or more of:

- GSC impressions for question-shaped queries.
- Average position for long-tail fit/clearance queries.
- Click-through rate on high-intent queries.
- Manual AI search/Gemini/AI Overview citation frequency.
- Affiliate/product-click downstream behavior.

### 2.2 Treatment definition

A treated page must include:

1. A visible short-answer block near the top.
2. A deterministic evidence block.
3. A clear source-confidence label.
4. A manual-verification reminder.
5. Matching Article/FAQPage schema when applicable.
6. No dimensions from suspect or blocked products.

Example visible answer block:

```html
<section class="answer-target" aria-labelledby="answer-target-heading">
  <p class="eyebrow">Short answer</p>
  <h2 id="answer-target-heading">Will the Westinghouse WBE4302WC fit a 620mm cavity?</h2>
  <p>No. The Westinghouse WBE4302WC is about 699mm wide, 1725mm high and 723mm deep. A 620mm cavity is narrower than the appliance before side clearance is added, so choose a narrower fridge or remeasure the cavity before ordering.</p>
</section>
```

Example visible evidence block:

```html
<section class="evidence-box" aria-labelledby="evidence-box-heading">
  <h2 id="evidence-box-heading">Evidence used by FitAppliance</h2>
  <ul>
    <li>Model: Westinghouse WBE4302WC</li>
    <li>Dimensions used: H 1725mm / W 699mm / D 723mm</li>
    <li>Source type: retailer or manufacturer specification sheet</li>
    <li>Verified: 2026-05-09</li>
    <li>Clearance status: manufacturer clearance not fully verified; practical buffer applied</li>
  </ul>
</section>
```

### 2.3 Control definition

A control page should be similar by category, brand strength, page type, and current indexability, but must not receive the new answer/evidence treatment during the test window.

### 2.4 Experiment window

Recommended measurement window:

```text
Baseline: 14 days before deploy
Observation: 28–56 days after deploy
Review checkpoint: day 14, day 28, day 56
```

Do not judge the experiment by day-3 ranking movement.

---

## 3. Files Likely to Change

### Create

- `scripts/audit-dimension-axis.js`
- `tests/dimension-axis-audit.test.mjs`
- `data/geo-treatment-pages.json`
- `scripts/generate-geo-baseline-report.js`
- `tests/geo-baseline-report.test.mjs`
- `reports/geo/phase43-treatment-plan.json` generated by script
- `reports/geo/phase43-ai-citation-log.csv` manually maintained or script-initialized
- `docs/phase43-geo-experiment/phase43-geo-measurement.md`

### Modify

- `scripts/generate-product-pages.js`
- `scripts/generate-guides.js`
- `scripts/generate-brand-pages.js`
- `scripts/generate-sitemap.js` only if new pages are created; not needed for treatment-only edits to existing pages.
- `scripts/validate-schema.js`
- `package.json`

### Avoid modifying at first

- Full data sync pipeline unless required by the dimension-axis fix.
- All 2,574 generated pages at once.
- Broad multi-platform publishing automation.

---

## 4. Task Plan

### Task 1: Add a deterministic dimension-axis audit

**Objective:** Detect likely W/H swaps before answer-target content can be generated.

**Files:**
- Create: `scripts/audit-dimension-axis.js`
- Create: `tests/dimension-axis-audit.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `auditDimensionAxis({ repoRoot, outputPath, failOnHighRisk }) -> Promise<report>`
- Report shape:

```json
{
  "schema_version": 1,
  "method": "dimension-axis-audit",
  "productsChecked": 0,
  "highRisk": 0,
  "mediumRisk": 0,
  "issues": []
}
```

**Implementation details:**

- Read `public/data/appliances.json`.
- Flag fridge products where:
  - `cat === "fridge"`
  - `w >= 1200`
  - `h <= 1000`
  - `readableSpec` or `features` do not clearly indicate chest/freezer/horizontal form factor.
- Include WBE4302WC as an explicit regression fixture in the test.
- Write report to `reports/data/dimension-axis-audit.json`.
- Exit non-zero only when `--fail-on-high-risk` is passed.

**Steps:**

- [ ] Write `tests/dimension-axis-audit.test.mjs` with a minimal fixture containing WBE4302WC as `w=1725, h=699, d=723` and assert it is `high-risk`.
- [ ] Add `scripts/audit-dimension-axis.js` with a pure helper `classifyDimensionAxisIssue(product)`.
- [ ] Export `classifyDimensionAxisIssue` and `auditDimensionAxis` for tests.
- [ ] Add npm script:

```json
"audit-dimension-axis": "node scripts/audit-dimension-axis.js"
```

- [ ] Run:

```bash
npm test -- tests/dimension-axis-audit.test.mjs
npm run audit-dimension-axis
```

Expected:

```text
node --test exits 0
audit writes reports/data/dimension-axis-audit.json
WBE4302WC appears as high-risk until fixed
```

- [ ] Commit:

```bash
git add scripts/audit-dimension-axis.js tests/dimension-axis-audit.test.mjs package.json reports/data/dimension-axis-audit.json
git commit -m "test: add dimension axis audit"
```

---

### Task 2: Fix verified high-risk dimension swaps before GEO treatment

**Objective:** Correct confirmed product dimension-axis errors without guessing for unverified products.

**Files:**
- Modify: `public/data/appliances.json`
- Modify: `public/data/fridges.json`
- Modify if source-of-truth exists: `data/catalog-final.json` or the actual upstream source used by `npm run sync`
- Modify: `data/manual-evidence.json` if it stores the WBE4302WC mapping
- Test: `tests/dimension-axis-audit.test.mjs`

**Interfaces:**
- Consumes: Task 1 audit output.
- Produces: No high-risk issue for WBE4302WC after fix.

**Verified correction for WBE4302WC:**

```json
{
  "model": "WBE4302WC",
  "w": 699,
  "h": 1725,
  "d": 723
}
```

**Steps:**

- [ ] Locate the canonical source for `fridge-arf2745` by searching `WBE4302WC` across data files.
- [ ] Update the canonical source first, then regenerate derived files if the project pipeline supports it.
- [ ] If no source-of-truth is available, patch both `public/data/appliances.json` and `public/data/fridges.json` and record the manual evidence source URL already present on the product.
- [ ] Re-run:

```bash
npm run audit-dimension-axis
```

Expected:

```text
WBE4302WC no longer appears as high-risk
Any remaining high-risk rows are listed for manual triage
```

- [ ] Rebuild affected pages:

```bash
npm run generate-product-pages
npm run repair-fit-check-links
npm run generate-sitemap
```

- [ ] Verify the generated page no longer says `Width | 1725mm` for WBE4302WC:

```bash
python3 - <<'PY'
from pathlib import Path
html = Path('pages/fit-check/westinghouse-wbe4302wc-in-620mm-cavity.html').read_text()
assert 'Width</th><td>699mm' in html or 'Width | 699mm' in html
assert 'Width</th><td>1725mm' not in html
print('WBE4302WC dimension mapping OK')
PY
```

- [ ] Run:

```bash
npm test
npm run validate-schema
npm run build
```

- [ ] Commit:

```bash
git add public/data/appliances.json public/data/fridges.json pages/fit-check pages/products public/sitemap.xml reports/data/dimension-axis-audit.json
git commit -m "fix: correct verified fridge dimension axes"
```

---

### Task 3: Define a small GEO treatment/control cohort

**Objective:** Select a measurable page cohort instead of changing the whole site.

**Files:**
- Create: `data/geo-treatment-pages.json`
- Create: `scripts/generate-geo-baseline-report.js`
- Create: `tests/geo-baseline-report.test.mjs`
- Modify: `package.json`

**Interfaces:**
- `data/geo-treatment-pages.json` shape:

```json
{
  "schema_version": 1,
  "experiment": "phase43-geo",
  "created_at": "2026-07-06",
  "treatment": [
    {
      "url": "/guides/fridge-clearance-requirements",
      "type": "guide",
      "primary_query": "How much clearance does a fridge need in Australia?",
      "reason": "High-intent evergreen guide"
    }
  ],
  "control": []
}
```

**Initial treatment candidates:**

```text
/guides/fridge-clearance-requirements
/guides/dishwasher-cavity-sizing
/guides/washing-machine-doorway-access
/guides/dryer-ventilation-guide
/guides/appliance-fit-sizing-handbook
```

Add fit-check pages only after Task 2 confirms their product data is accurate.

**Steps:**

- [ ] Write `data/geo-treatment-pages.json` with 5 guide pages as treatment and 5 comparable non-treated or delayed-treatment URLs as control.
- [ ] Write `scripts/generate-geo-baseline-report.js` to validate that every listed URL maps to an existing HTML file.
- [ ] Write test ensuring missing URLs fail validation.
- [ ] Add npm script:

```json
"geo-baseline-report": "node scripts/generate-geo-baseline-report.js"
```

- [ ] Run:

```bash
npm test -- tests/geo-baseline-report.test.mjs
npm run geo-baseline-report
```

Expected:

```text
reports/geo/phase43-treatment-plan.json created
all treatment/control URLs resolve to local HTML files
```

- [ ] Commit:

```bash
git add data/geo-treatment-pages.json scripts/generate-geo-treatment-report.js tests/geo-treatment-report.test.mjs package.json reports/geo/phase43-treatment-plan.json
git commit -m "chore: define phase 43 GEO cohort"
```

---

### Task 4: Add reusable answer-target and evidence-box renderers

**Objective:** Add reusable, deterministic HTML snippets for pages that pass data gates.

**Files:**
- Create: `scripts/common/geo-answer-blocks.js`
- Create: `tests/geo-answer-blocks.test.mjs`

**Interfaces:**

```js
function renderAnswerTargetBlock({ eyebrow, heading, answer })
function renderEvidenceBox({ model, dimensions, sourceType, verifiedAt, clearanceStatus })
function plainTextAnswer({ product, cavityWidth, fitResult })
```

**Rules:**

- Escape all HTML.
- Do not render if required facts are missing.
- Do not render if `product.dimension_axis_status === "high-risk"` or equivalent audit lookup says blocked.
- Keep answer paragraph under roughly 90 words.

**Steps:**

- [ ] Write tests for escaping, missing facts, and WBE4302WC corrected dimensions.
- [ ] Implement `scripts/common/geo-answer-blocks.js`.
- [ ] Run:

```bash
npm test -- tests/geo-answer-blocks.test.mjs
```

Expected:

```text
all geo-block renderer tests pass
```

- [ ] Commit:

```bash
git add scripts/common/geo-answer-blocks.js tests/geo-answer-blocks.test.mjs
git commit -m "feat: add GEO answer block renderers"
```

---

### Task 5: Apply treatment to guide pages first

**Objective:** Add answer-target blocks to the safest pages before touching product-specific fit-check pages.

**Files:**
- Modify: `scripts/generate-guides.js`
- Modify generated pages under: `pages/guides/*.html`
- Test: add coverage to existing guide-generation tests if present; otherwise add `tests/guides-content.test.mjs`.

**Guide answer examples:**

For `/guides/fridge-clearance-requirements`:

```text
Short answer: In Australia, check the fridge cavity width, height and depth after adding the model’s side, rear and top clearance requirements. A fridge can match the bare width and still fail if ventilation space, door swing or the delivery route is too tight.
```

For `/guides/washing-machine-doorway-access`:

```text
Short answer: Measure the washing machine’s width, depth and height against the narrowest doorway, hallway turn and laundry opening before delivery. A model can fit the laundry cavity but still fail if the delivery path cannot handle the appliance box or rotation.
```

**Steps:**

- [ ] Add a guide-level `answerTarget` field in the guide data structure inside `scripts/generate-guides.js`.
- [ ] Render `renderAnswerTargetBlock` immediately below the opening intro.
- [ ] Regenerate guides:

```bash
npm run generate-guides
```

- [ ] Verify generated guide pages contain exactly one `.answer-target` section:

```bash
python3 - <<'PY'
from pathlib import Path
for p in Path('pages/guides').glob('*.html'):
    html = p.read_text()
    assert html.count('class="answer-target"') == 1, p
print('guide answer-target blocks present')
PY
```

- [ ] Run:

```bash
npm test
npm run validate-schema
npm run build
```

- [ ] Commit:

```bash
git add scripts/generate-guides.js pages/guides tests package.json reports/schema-validation.json public/sitemap.xml
git commit -m "feat: add answer targets to guide pages"
```

---

### Task 6: Apply treatment to verified fit-check pages only

**Objective:** Add answer/evidence blocks to selected fit-check pages whose dimensions pass gates.

**Files:**
- Modify: the script that generates `pages/fit-check/*.html`.
- Modify generated treatment pages under: `pages/fit-check/*.html`.
- Test: create or update tests for fit-check page generation.

**Treatment eligibility gates:**

A fit-check page is eligible only if:

```text
product has source evidence
product has no high-risk dimension-axis issue
fit result uses corrected W/H/D mapping
visible answer matches FAQPage acceptedAnswer
page is listed in data/geo-treatment-pages.json treatment set
```

**Steps:**

- [ ] Find the fit-check generator by searching for `Will the` and `fit a` inside `scripts/`.
- [ ] Load `data/geo-treatment-pages.json` in the generator or a helper.
- [ ] Skip GEO blocks for any URL not listed as treatment.
- [ ] Skip GEO blocks for products flagged by `audit-dimension-axis`.
- [ ] Generate selected pages.
- [ ] Verify WBE4302WC page uses corrected width if it is included; otherwise leave it out of treatment until corrected.
- [ ] Run:

```bash
npm test
npm run audit-dimension-axis
npm run validate-schema
npm run build
```

- [ ] Commit:

```bash
git add scripts pages/fit-check data/geo-treatment-pages.json reports/data/dimension-axis-audit.json reports/schema-validation.json
git commit -m "feat: add GEO treatment to verified fit checks"
```

---

### Task 7: Restore GSC measurement before deployment review

**Objective:** Make the experiment measurable with Search Console data.

**Files:**
- Modify local environment only; do not commit secrets.
- Create: `docs/phase43-geo-experiment/phase43-geo-measurement.md`

**Current observed blocker:**

```text
npm run gsc-fetch
[gsc-fetch] GSC credentials not configured. Set GSC_SA_EMAIL+GSC_SA_PRIVATE_KEY+GSC_SA_PROJECT_ID (preferred) or legacy GSC_SA_JSON.
```

**Steps:**

- [ ] Configure environment variables outside the repo:

```bash
export GSC_SA_EMAIL='...'
export GSC_SA_PRIVATE_KEY='...'
export GSC_SA_PROJECT_ID='...'
```

- [ ] Run:

```bash
npm run gsc-fetch
```

Expected:

```text
reports/gsc/*.json or equivalent output updates successfully
```

- [ ] Write `docs/phase43-geo-experiment/phase43-geo-measurement.md` with:
  - treatment/control URLs
  - baseline start/end dates
  - deploy date
  - review dates
  - primary query per URL
  - GSC metrics to compare
  - manual AI search observation protocol

- [ ] Commit only documentation/report outputs, not credentials:

```bash
git add docs/phase43-geo-experiment/phase43-geo-measurement.md reports/gsc
git commit -m "docs: add phase 43 GEO measurement protocol"
```

---

### Task 8: Add manual AI citation log

**Objective:** Avoid vague “AI cited us” claims by creating a structured observation log.

**Files:**
- Create: `reports/geo/phase43-ai-citation-log.csv`

**CSV columns:**

```csv
date,query,platform,country,device_or_browser,result_type,fitappliance_cited,fitappliance_url,other_sources,notes,evidence_path
```

**Allowed `platform` values:**

```text
Google AI Overview
Google organic
Gemini
Perplexity
ChatGPT Search
Bing Copilot
```

**Steps:**

- [ ] Create the CSV with header only.
- [ ] Add instructions in `docs/phase43-geo-experiment/phase43-geo-measurement.md` for manual entries.
- [ ] Add a review rule: no claim is valid without a row in this CSV.
- [ ] Commit:

```bash
git add docs/phase43-geo-experiment/geo-ai-citation-log.csv docs/phase43-geo-experiment/phase43-geo-measurement.md
git commit -m "chore: add GEO AI citation log"
```

---

### Task 9: Final pre-deploy verification

**Objective:** Verify the experiment is safe enough to deploy.

**Files:**
- No new source files unless verification exposes a bug.

**Run:**

```bash
npm run audit-dimension-axis
npm run geo-baseline-report
npm test
npm run validate-schema
npm run build
npm run broken-link-check
npm run gsc-indexing-audit
```

Expected:

```text
Dimension audit report exists; known high-risk products are either fixed or excluded from treatment.
Treatment report exists and all URLs resolve.
node --test exits 0.
Schema validation exits 0.
Build exits 0.
Broken-link check exits 0.
GSC indexing audit exits 0 or reports only known non-blocking buckets.
```

Manual review checklist:

- [ ] No treatment page displays a known wrong width/height/depth mapping.
- [ ] No FAQ answer contradicts visible page text.
- [ ] No schema-only facts are hidden from the visible page.
- [ ] Every treated fit-check page includes source confidence.
- [ ] Every treated guide page includes a concise short-answer block.
- [ ] `robots.txt` still allows crawl and lists `sitemap.xml`.
- [ ] `public/sitemap.xml` includes treated URLs.
- [ ] GSC measurement is configured or deployment notes explicitly state that live measurement is blocked.

Commit after successful verification:

```bash
git add .
git commit -m "feat: launch phase 43 GEO experiment"
```

---

## 5. Success Metrics

### Primary metrics

- Treatment pages have greater lift than controls in question-shaped GSC impressions over 28–56 days.
- Treatment pages show stable or improved average position for exact and near-exact question queries.
- Manual AI citation log records FitAppliance being cited or surfaced for at least one treatment query.

### Secondary metrics

- Affiliate outbound clicks from treated pages improve without misleading copy.
- No increase in schema validation errors.
- No increase in broken links.
- No known high-risk dimension pages are included in treatment.

### Failure criteria

Stop or roll back treatment if:

- A treated page contains an incorrect dimension claim.
- GSC impressions drop materially versus matched controls after index stabilization.
- AI citation checks surface FitAppliance with wrong facts.
- Schema validation or broken-link checks fail and cannot be fixed quickly.

---

## 6. Recommended Initial Query Set

Use these for GSC filtering and manual AI checks:

```text
How much clearance does a fridge need in Australia?
Will a 600mm dishwasher fit a 600mm cavity?
What fridge fits a 620mm cavity?
How do I measure a fridge cavity before buying?
How much space behind a fridge is needed?
Can a washing machine fit through a 600mm doorway?
What size cavity does a built-in dishwasher need?
How do I check appliance dimensions before delivery?
```

Avoid spending Phase 43 effort on broad review/commercial queries:

```text
best fridge Australia
cheap fridge Australia
Samsung fridge review
LG vs Samsung fridge
```

Reason: FitAppliance’s differentiator is not generic reviews; it is fit, clearance, doorway, cavity, delivery and evidence-backed appliance dimensions.

---

## 7. Open Questions to Resolve During Execution

1. What is the canonical source-of-truth file for appliance dimensions before `public/data/appliances.json` is generated?
2. Which of the 194 fridge dimension anomalies are true errors versus horizontal freezer/chest formats?
3. Are GSC service account credentials still available for this repo outside committed files?
4. Does the current deployment host automatically publish generated pages after `npm run build`, or is there a separate deploy step?
5. Should Phase 43 include only guides first, or also 5 verified fit-check pages after Task 2?

---

## 8. Execution Recommendation

Implement in this order:

1. Task 1 dimension audit.
2. Task 2 confirmed data fixes.
3. Task 3 cohort definition.
4. Task 4 reusable block renderer.
5. Task 5 guide treatment.
6. Restore GSC measurement.
7. Only then consider Task 6 fit-check treatment.

Do not start with broad content generation. The highest-leverage improvement is making FitAppliance’s existing answer-shaped pages accurate, quotable, and measurable.
