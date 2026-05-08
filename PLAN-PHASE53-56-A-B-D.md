# PLAN-PHASE53-56: A + B + D Execution Plan

**Start**: 2026-05-07
**Estimated duration**: 18-21 days, 7 PRs
**Goal**: Programmatic SEO + PDF data pipeline + 2.5D fit-viz tab

---

## Strategic Context (Codex MUST read this first)

### Three parallel tracks

- **Track B (foundational)**: PDF extraction pipeline turning manufacturer install manuals into structured catalog data. Replaces manual entry. Improves data accuracy.
- **Track D (independent UX)**: 2.5D isometric fit visualization tab added to the existing Front/Top/Side modal. Visual differentiation vs e-commerce competitors.
- **Track A (high-volume SEO)**: Programmatic generation of "Will [Model] fit [Width]mm cavity?" pages — ~1600 long-tail SEO pages built from existing catalog.

### Why this order

1. **B before A**: SEO page quality depends on catalog data quality. Improving data first means SEO pages launch with stronger evidence.
2. **D in parallel with B/A**: D touches `fit-visualization.js` and CSS only — does not collide with B (data pipeline) or A (page generator).
3. **B1 (foundation) before B2 (real run)**: The pipeline must be tested on a fixture PDF before processing 50 real products. Avoids wasted runs.
4. **A1 (generator) before A2 (mass generate)**: The template + generator must be reviewed on ~10 sample pages before generating 1600.

### Hard rules across ALL Phase 53-56 PRs

1. TDD: every PR has RED → GREEN cycle.
2. Each PR is independent (own branch, own CI, label `phase-53` to `phase-56` as appropriate). Never auto-merge.
3. Red lines (DO NOT touch in any PR unless explicitly noted in that PR's scope):
   - `public/data/*.json` (catalog raw data)
   - `data/popularity-research.json`
   - `data/brand-canon.json`
   - `scripts/research-popularity.js`
   - `scripts/enrich-appliances.js`
   - `public/scripts/search-core.js` (search algorithm)
   - `public/scripts/rum.js`
   - `public/scripts/sw-register.js`
   - `public/service-worker.js`
   - `api/rum.js`
   - `.github/workflows/**` (unless adding pipeline-specific workflow)
4. Determinism: `npm run generate-all` twice = zero diff (excluding OG binary platform churn which is a known issue handled separately).
5. Existing test count must not regress. New tests added per PR.
6. Performance budgets: search <50ms / 2170 rows; LCP <2s; a11y ≥0.97.
7. PR body MUST include red-line proof:
   ```
   git diff --stat origin/main...HEAD -- public/data/ data/popularity-research.json data/brand-canon.json scripts/research-popularity.js scripts/enrich-appliances.js public/scripts/search-core.js public/scripts/rum.js public/scripts/sw-register.js public/service-worker.js api/rum.js
   ```
   Must output empty (unless PR's scope explicitly includes one of these paths).

---

## Timeline

```
Day 1-4    PR #1  B1: PDF pipeline foundation        Critical path
Day 1-3    PR #2  D1: 2.5D isometric renderer        Parallel branch
Day 5-7    PR #3  A1: SEO page template + generator  After B1 (uses pipeline output schema)
Day 5-6    PR #4  D2: fit-viz modal 2.5D tab         After D1
Day 8-11   PR #5  B2: First 50 products real run     After B1
Day 12-14  PR #6  A2: Generate 1600 long-tail pages  After A1
Day 15-17  PR #7  A3: Schema + sitemap + IndexNow    After A2
```

**Slack**: 3-4 days for review cycles + visual verification.

---

## Phase B: PDF Extraction Pipeline

### B Goal

Build a Node.js pipeline that:
1. Downloads manufacturer install manual PDFs (publicly available)
2. Extracts text via `pdf-parse`
3. Sends text to LLM with structured extraction prompt
4. Validates extracted JSON against schema + dimension sanity rules
5. Produces a `catalog patch` for human review (not auto-merge)

### B Architecture

```
scripts/pdf-pipeline/
├── README.md
├── 1-fetch.js
├── 2-extract-text.js
├── 3-ai-parse.js
├── 4-validate.js
├── 5-merge.js
└── lib/
    ├── schema.js
    └── prompt-template.js

data/pdf-evidence/
├── README.md  (.gitignore for PDF binaries; commit only extracted JSON + status)
└── <brand>/<model>/
    ├── source.pdf       (NOT committed; downloaded on demand)
    ├── text.txt         (committed for audit)
    ├── extracted.json   (committed; AI parse output)
    └── status.json      (committed; review state)

reports/pdf-pipeline/
└── <date>-batch-N.json  (audit log per batch run)
```

### B1 (PR #1): Foundation

**Scope**: Build framework + tests + fixture. DO NOT process real PDFs. DO NOT touch catalog.

**Codex prompt** (paste verbatim):

```
You are the sole implementer for FitAppliance v2. Repo root: /Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2.

Phase 53 PR #1: PDF Extraction Pipeline Foundation (B1)

Goal: Build infrastructure for extracting structured product data from manufacturer install manual PDFs. THIS PR ONLY BUILDS THE FRAMEWORK + TESTS + ONE FIXTURE PDF. No real PDFs processed. No catalog data touched.

## §0 Startup
1. cd repo root, git checkout main && git pull --ff-only
2. git switch -c phase-53-pdf-pipeline-foundation
3. Do not auto-merge. Label: phase-53

## §1 Directory structure (create)

scripts/pdf-pipeline/
├── README.md
├── 1-fetch.js
├── 2-extract-text.js
├── 3-ai-parse.js
├── 4-validate.js
├── 5-merge.js
└── lib/
    ├── schema.js
    └── prompt-template.js

data/pdf-evidence/
└── README.md  (explain layout + .gitignore for PDFs)

tests/pdf-pipeline/
├── fixtures/
│   └── sample-bosch-fridge.pdf  (≤200 KB; truly downloadable Bosch install manual; document URL in README)
├── 1-fetch.test.mjs
├── 2-extract-text.test.mjs
├── 3-ai-parse.test.mjs
├── 4-validate.test.mjs
├── 5-merge.test.mjs
└── e2e.test.mjs

## §2 Stage 1: scripts/pdf-pipeline/1-fetch.js
- export `fetchPdf(url, destPath, opts = {})` async
- Use Node fetch + stream to file
- Validate Content-Type starts with "application/pdf"
- Retry 3 times with exponential backoff on transient failures (5xx, network)
- Cache: skip if destPath exists and size > 0 (unless opts.force)
- User-Agent: `FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)`

## §3 Stage 2: scripts/pdf-pipeline/2-extract-text.js
- Add `pdf-parse` to package.json devDependencies
- export `extractText(pdfPath)` async → `{ text, pageCount, info }`
- Strip common noise: page numbers (lines matching ^\d+$), copyright headers, repeated footers
- Trim excess whitespace but preserve paragraph breaks

## §4 Stage 3: scripts/pdf-pipeline/3-ai-parse.js + lib/prompt-template.js

lib/prompt-template.js exports `PROMPT_TEMPLATE` (multi-line string):

```
You are a product specification extractor. Given the text of a home appliance install manual, output ONLY a single JSON object matching the schema below. No prose, no markdown, no explanations.

Schema:
{
  "brand": "string",
  "model": "string (SKU as printed on rating plate)",
  "category": "fridge" | "dishwasher" | "dryer" | "washing_machine",
  "dimensions_mm": { "width": number, "height": number, "depth": number },
  "clearance_mm": { "side": number, "top": number, "rear": number, "front": number },
  "capacity_litres": number | null,
  "energy_stars": number | null,
  "annual_kwh": number | null,
  "door_swing_mm": number | null,
  "weight_kg": number | null,
  "noise_db": number | null,
  "confidence": "high" | "medium" | "low",
  "source_quote": "string (exact phrase from text containing the dimensions, max 200 chars)"
}

Rules:
- Use only data explicitly stated in the text. Do not infer or estimate.
- If a field is missing, use null.
- For dimensions, use OVERALL dimensions including handles unless install dimensions are explicitly given.
- For clearance, use the manufacturer's stated minimum.
- confidence: "high" if all required fields are explicit, "medium" if some inferred from context, "low" if mostly missing.

Text:
{{TEXT}}
```

3-ai-parse.js:
- export `extractStructuredData(text, options = {})` async
- options.llmCaller: `(prompt: string, text: string) => Promise<string>` — dependency injection
- Default llmCaller is a STUB that returns hard-coded fixture JSON for testing (do NOT call any external API in this PR)
- Replace `{{TEXT}}` token in PROMPT_TEMPLATE with actual text (truncate text to 50 KB chars to stay within LLM context)
- Parse llmCaller's response as JSON, throw clear error if invalid

## §5 Stage 4: scripts/pdf-pipeline/4-validate.js + lib/schema.js

lib/schema.js: export the JSON schema as a JS object (not JSON Schema spec, just shape definition for runtime checks).

4-validate.js export `validateExtracted(data)` synchronous → `{ valid: boolean, errors: string[] }`

Validation rules:
- Required fields present: brand, model, category, dimensions_mm.{width,height,depth}, clearance_mm.{side,top,rear}
- Category in allowed set
- Dimension sanity (per category):
  - fridge: w 400-1200, h 800-2200, d 400-800
  - dishwasher: w 440-650, h 800-900, d 550-650
  - dryer: w 580-650, h 820-870, d 580-680
  - washing_machine: w 580-700, h 820-870, d 540-680
- Clearance sanity: side 0-100, top 0-150, rear 0-100, front 0-50
- Optional fields if present must be plausible (capacity 0-2000 L, stars 1-7, kwh 0-2000, swing 0-2000, weight 5-300 kg, noise 30-90 dB)
- confidence in {"high","medium","low"}

## §6 Stage 5: scripts/pdf-pipeline/5-merge.js
- export `prepareCatalogPatch(extracted, catalog)` async → `{ matched: object|null, patch: object, conflicts: array }`
- Find candidate catalog product by fuzzy match (brand + SKU prefix, ignoring case + hyphens)
- patch: fields where extracted differs from catalog, ONLY for confidence ≥ medium
- conflicts: dimension differences ≥ 5 mm, listed for human review
- DO NOT write to public/data/*.json — return patch only

## §7 README files

scripts/pdf-pipeline/README.md:
- Pipeline overview (5 stages)
- Each stage's input → output
- How to run a single product end-to-end manually
- llmCaller interface contract (what B2 will implement)
- Limitations: scanned PDFs not supported (text-based PDFs only)

data/pdf-evidence/README.md:
- Folder layout (brand/model/...)
- What is committed (text.txt, extracted.json, status.json) and what is NOT (source.pdf — too large)
- Status states: "pending" | "approved" | "rejected" | "needs-review"

## §8 Tests RED→GREEN

Each stage has a unit test using small mock data.
e2e.test.mjs runs all 5 stages on the fixture PDF:
- fetchPdf can be skipped (fixture is local)
- extractText reads sample-bosch-fridge.pdf → expect text length > 1000 chars, pageCount > 0
- extractStructuredData with stub llmCaller → returns fixture JSON
- validateExtracted on fixture JSON → valid: true
- prepareCatalogPatch against current catalog → returns reasonable patch object
- All assertions document expected behavior, not implementation

Fixture PDF MUST be a real publicly downloadable Bosch / LG / Westinghouse install manual; document the source URL in tests/pdf-pipeline/fixtures/README.md so we can re-download if lost.

## §9 Global rules
1. TDD; independent PR; not auto-merge
2. branch phase-53-pdf-pipeline-foundation, label phase-53
3. Scope: scripts/pdf-pipeline/** + data/pdf-evidence/README.md + tests/pdf-pipeline/** + package.json (add pdf-parse devDep)
4. Forbidden: public/data/*.json, data/brand-canon.json, data/popularity-research.json, public/scripts/**, api/, .github/workflows/, public/service-worker.js
5. Red-line zero diff
6. Determinism: generate-all twice = zero diff
7. Existing 815+ tests must not regress

## §10 PR body MUST include
1. 6-7 commit SHAs (5 stages + fixture + tests)
2. Fixture PDF source URL + license rationale (manufacturer install manual = factual reference data)
3. e2e test pass output (assertions met)
4. Stub llmCaller demonstration (called once in test, returns hard-coded JSON)
5. Determinism + red-line proof
6. npm test total (≥835) + new tests added
7. One-paragraph note: "B2 will implement real llmCaller and process 50 products."

## §11 Completion report
PR URL + above metrics + a note on what B2 needs.

Begin. NEVER touch catalog data, search algorithm, brand-canon, RUM, SW.
```

### B2 (PR #5): First 50 products real run

**Pre-condition**: B1 merged. User has chosen LLM provider (Claude API or Codex inline).

**Scope**: Process 50 real PDFs (Bosch + LG fridges, top by priorityScore). Output 50 evidence files + diff report. Catalog NOT modified.

**Codex prompt skeleton** (refine with concrete LLM choice when B1 lands):

```
You are the sole implementer for FitAppliance v2.

Phase 53 PR #5: PDF Pipeline B2 — Process 50 real products

Pre-conditions:
- B1 (PR #1) merged. Pipeline framework + fixture exist.
- LLM caller decision documented (default: use anthropic Claude API via process.env.ANTHROPIC_API_KEY; fallback: emit prompt+text to a file for offline manual processing).

## §0 Startup
git switch -c phase-53-pdf-batch-1, label phase-53.

## §1 Select 50 products
node script: pick top 50 by priorityScore from public/data/fridges.json, filter to brands with publicly available install manual PDFs (Bosch, LG, Westinghouse, Fisher & Paykel, Hisense).

For each, document the public PDF URL (manufacturer support site, not a scraping target). If a product has no findable PDF, skip and pick next.

## §2 Process all 50 through pipeline
For each:
- fetchPdf
- extractText
- extractStructuredData using real llmCaller
- validateExtracted
- prepareCatalogPatch (NOT applied)

Write to data/pdf-evidence/<brand>/<model>/text.txt, extracted.json, status.json (status="pending").

## §3 Batch report
Write reports/pdf-pipeline/2026-05-XX-batch-1.json with:
- 50 product IDs processed
- pass/fail per stage
- conflicts found per product (catalog dim vs PDF dim mismatch ≥5mm)

## §4 PR body
- 50 products processed list
- Conflict summary table (top 10 worst conflicts)
- Schema validation pass rate
- Token cost estimate (if using API)

## §5 Forbidden
DO NOT modify public/data/*.json. DO NOT auto-merge any patches. The catalog stays untouched. The user reviews the report and decides which patches to apply in B3.
```

### B3 + B4 (later PRs): Auto-merge + scale

**B3**: Build a `pnpm review` CLI that lists pending evidence, lets user approve/reject, and on approval applies the patch to catalog.

**B4**: Scheduled GitHub Actions workflow that runs B2 weekly on new SKUs. Auto-approve high-confidence diffs (≤1mm difference). Manual queue for the rest.

These prompts will be drafted closer to the time, after B2 lessons learned.

---

## Phase D: 2.5D Isometric Fit-Viz

### D Goal

Add a 4th tab "[3D]" to the existing fit-viz modal showing isometric (2.5D) projection of cavity + product. Default tab remains "[Front]". 3D tab is opt-in for users who prefer spatial overview.

### D1 (PR #2): Isometric Renderer

**Codex prompt** (paste verbatim):

```
You are the sole implementer for FitAppliance v2.

Phase 53 PR #2: 2.5D Isometric Fit Visualization Renderer (D1)

Goal: Build a pure-function SVG isometric projection renderer that draws cavity + product in 30° isometric view. NO UI changes in this PR; renderer only. The modal tab UI is added in D2 (PR #4).

This PR can run in parallel with B1 (no file overlap).

## §0 Startup
1. cd repo root, git checkout main && git pull --ff-only
2. git switch -c phase-53-iso-renderer
3. Do not auto-merge. Label: phase-53

## §1 New file: public/scripts/iso-projection.js

export function `renderIsoFitSvg({ cavity, product, clearance, bindingAxis })`:
- cavity: { w, h, d } in mm (cavity dimensions)
- product: { w, h, d } in mm
- clearance: { side, top, rear } in mm
- bindingAxis: 'width' | 'height' | 'depth' | null

Returns: SVG string (single-element top-level <svg>)

Math: classic isometric projection at 30° angle:
- For 3D point (x, y, z): screen_x = (x - y) * cos(30°), screen_y = (x + y) * sin(30°) - z
- Use cos(30°) = √3/2 ≈ 0.866, sin(30°) = 0.5
- viewBox: 0 0 280 280
- Scale factor: largest dimension fills ~70% of viewBox

Visual rules:
- Cavity drawn as wireframe cube using 3 visible faces (top, front, right). Stroke #2c2c2c, stroke-width 1.4, fill rgba(245,243,238,0.4) for each face
- Product drawn as inner cube, offset from cavity walls by clearance. Stroke #2c2c2c, stroke-width 1.2, fill rgba(232,230,225,0.7)
- Visible cavity edges drawn solid; hidden edges (back/bottom/left) drawn dashed (stroke-dasharray 4,3) at low opacity
- Binding axis face on cavity wireframe drawn in #d97706 stroke-width 1.8 (highlight the constraining face)
- Dimension labels: along cavity outer edges, with arrows. Width on bottom-front edge, Height on right-front edge, Depth on top-right edge. Font: 11px sans-serif #2c2c2c, font-variant-numeric tabular-nums
- Gap labels: small numbers in the cavity-product gap on each visible face, font-size 9px #6b6b6b
- Background: none (transparent)

Helper functions (all internal):
- toIso(x, y, z) → { sx, sy }
- drawFace(p1, p2, p3, p4, opts) → SVG path string
- drawEdge(p1, p2, opts) → SVG line string
- formatDimensionLabel(value) → "600 mm"
- formatGapLabel(value) → "12mm" or "0mm" or "−5mm"

## §2 Tests RED → GREEN

tests/iso-projection.test.mjs:

- renderIsoFitSvg returns a string starting with "<svg" and ending with "</svg>"
- viewBox is "0 0 280 280"
- For a cavity 600×1900×650 with product 595×1850×600:
  - SVG contains "600" (width label) and "1900" (height label) and "650" (depth label) somewhere
  - SVG contains gap labels for the visible faces
- bindingAxis = 'width' → at least one stroke="#d97706" appears
- bindingAxis = null → no orange stroke
- Edge case: cavity smaller than product → still renders (gap labels show negative)
- XSS safety: cavity/product are objects not strings; no user input rendered into SVG text without sanitization (but current API has no string inputs, document this assumption)

Performance test:
- 100 renders complete in under 50 ms total

## §3 Visual sanity (for PR review)

Generate 3 sample SVG strings in PR body:
- Sample 1: 600×1900×650 cavity, 595×1850×600 product, clearance 25/25/50, bindingAxis 'width' → sample shows orange highlight
- Sample 2: 1000×2000×800 cavity, 700×1700×600 product (loose fit, no binding) → sample shows all gaps comfortable
- Sample 3: 600×1900×650 cavity, 600×1900×700 product (depth doesn't fit) → sample shows depth gap negative

For each, paste the rendered SVG inside <details> in PR body so reviewers can copy-paste into a viewer.

## §4 Global rules
1. TDD; independent PR; not auto-merge
2. branch phase-53-iso-renderer, label phase-53
3. Scope: public/scripts/iso-projection.js (new) + tests/iso-projection.test.mjs (new)
4. Forbidden: everything else (this PR is purely a new pure-function module)
5. Red-line zero diff
6. Determinism: generate-all twice = zero diff (this file is not consumed by generators yet)
7. Existing tests must not regress

## §5 PR body MUST include
1. 1-2 commit SHAs
2. 3 sample SVG strings (in <details>)
3. Performance bench (100 renders under 50 ms)
4. Test pass count (existing + 8+ new)
5. Red-line proof
6. Note: "D2 (PR #4) will integrate this into the fit-viz modal as a 4th tab."

Begin. NO modifications outside the two new files.
```

### D2 (PR #4): Tab UI Integration

**Pre-condition**: D1 merged.

**Scope**: Add `[3D]` tab to existing fit-viz modal in `public/scripts/fit-visualization.js` and `public/scripts/search-dom.js`. Wire up isoRenderer when 3D tab is active.

**Codex prompt skeleton** (refine after D1):

```
You are the sole implementer for FitAppliance v2.

Phase 53 PR #4: Fit-viz Modal 2.5D Tab Integration (D2)

Pre-conditions:
- D1 (PR #2) merged. iso-projection.js exists.

## §0 Startup
git switch -c phase-53-iso-tab, label phase-53.

## §1 Modal tab structure
Existing fit-viz modal has tabs: [Front] [Top] [Side]. Add [3D] as 4th tab.

In public/scripts/fit-visualization.js (or wherever the modal is rendered):
- Add 'iso' to the view list
- When view === 'iso', call window.IsoProjection.renderIsoFitSvg(...) to get SVG
- Tab label: "3D"
- aria-label and accessibility same as other tabs

In public/scripts/search-dom.js if it generates the panes/tabs:
- Same change

## §2 Module loading
public/scripts/iso-projection.js must expose renderIsoFitSvg on window.IsoProjection (UMD-style) since current site uses script tags not ES modules. Update D1 module if needed (this PR can include the export-style fix).

Add <script src="/scripts/iso-projection.js"></script> to index.html before fit-visualization script.

## §3 Tests
- Modal renders 4 tabs
- Clicking [3D] tab triggers iso renderer
- Tab keyboard navigation works for all 4 tabs
- ESC closes modal regardless of active tab

## §4 Mobile
- 3D view fits within mobile modal (viewBox stays 280×280; container max-width 100%)
- Tab labels truncate gracefully on small screens

## §5 Scope
- public/scripts/fit-visualization.js
- public/scripts/search-dom.js (if needed)
- public/scripts/iso-projection.js (only if export needs adjusting)
- index.html (script tag)
- public/styles.css or styles-deferred.css (tab styles consistent)
- tests/*

NOT touched: search-core, catalog data, RUM, SW.

## §6 PR body
1. Commit SHAs
2. Modal screenshot description (4 tabs visible, 3D tab active state)
3. Tab keyboard nav test pass
4. Mobile description
5. Red-line proof
6. Test count

Begin.
```

---

## Phase A: Programmatic SEO

### A Goal

Generate ~1600 long-tail SEO pages targeting "Will [Brand] [Model] fit [W]mm cavity?" search queries. Each page must have UNIQUE content based on the specific product+cavity combination — not a doorway page.

### A URL structure

`/fit-check/[brand-slug]-[model-slug]-in-[width]mm-cavity`

Examples:
- `/fit-check/lg-gth560npl-in-600mm-cavity`
- `/fit-check/bosch-kgn396lbas-in-650mm-cavity`

### A Page selection (avoid bloat)

Not Cartesian product of all products × all cavities (that's 40,000+ thin pages → SEO penalty).

Instead:
- Top 200 products by priorityScore (covers popular)
- 8 cavity widths: 540, 580, 600, 620, 640, 700, 800, 900 (covers AU standard kitchen sizes)
- = **1600 pages**

### A Page content (each page must be unique)

Required sections (per page):
1. **H1**: "Will the [Brand] [Model] fit a [W]mm cavity?"
2. **Verdict box**: Yes / Tight / No / Needs-more-cavity (color-coded)
3. **Product dimensions table** (W/H/D)
4. **Clearance breakdown**: side / top / rear required
5. **Cavity-fit math**: Required cavity = product + clearance × 2 (etc.)
6. **3 alternatives**: If verdict is "No" or "Tight", list 3 products that fit the cavity
7. **Buy links** (if product has retailer URLs)
8. **FAQ block** (3-5 Q&A specific to this product+cavity)
9. **Related searches**: links to other cavity widths for same product, and other products for same cavity

### A1 (PR #3): Template + Generator

**Pre-condition**: B1 merged (so the page schema is consistent with future PDF data).

**Codex prompt** (paste verbatim):

```
You are the sole implementer for FitAppliance v2.

Phase 54 PR #3: Programmatic Fit-Check SEO Pages — Template + Generator (A1)

Goal: Build the page template and generator for "Will [Model] fit [W]mm cavity?" pages. Generate only 10 sample pages in this PR (not 1600). Mass generation is in PR #6 (A2).

## §0 Startup
1. cd repo root, git checkout main && git pull --ff-only
2. git switch -c phase-54-fit-check-template
3. Do not auto-merge. Label: phase-54

## §1 New script: scripts/generate-fit-check-pages.js

Functions:
- selectFitCheckCombinations(catalog, options) → array of {product, cavityW}
  - options.topN (default 200) — how many top products by priorityScore
  - options.cavityWidths (default [540, 580, 600, 620, 640, 700, 800, 900])
  - options.limit (for sample generation, default Infinity)
- buildFitCheckPage(product, cavityW, allProducts) → { slug, html, meta }
  - slug: "[brand]-[model]-in-[cavityW]mm-cavity"
  - html: full page HTML
  - meta: { title, description, jsonLd: [...] }
- writePages(combinations, options) → number of pages written

Page output path: pages/fit-check/[slug].html (matching existing pages/ convention)
Vercel route: /fit-check/[slug] → pages/fit-check/[slug].html (add to vercel.json rewrites)

## §2 Template structure (HTML)

Every page must include:

<head>:
- <title>: "Will the [Brand] [Model] fit a [W]mm cavity? — FitAppliance"
- <meta description>: "[Brand] [Model] requires [X]mm cavity width with [Y]mm side clearance. See if it fits your [W]mm cavity."
- <link rel="canonical">
- <link rel="alternate" hreflang="en-AU">
- Schema.org Article + FAQPage JSON-LD blocks
- OG tags (use existing brand placeholder OG image OR generate per-page if cheap)

<body> sections:

1. Site nav (reused from main site)
2. Breadcrumb: Home → Fit Check → [Brand] [Model] → [W]mm cavity
3. <h1>Will the [Brand] [Model] fit a [W]mm cavity?</h1>
4. Verdict block:
   - Compute fit using existing search-core.js logic (in node, not browser)
   - States: "perfect" (≥20mm spare on all axes) / "tight" (5-20mm spare) / "binding" (<5mm) / "no-fit" (negative)
   - Big colored box with icon + headline (e.g., "✅ Yes — fits with 12mm to spare")
5. Dimensions section: 3 spec chips W/H/D
6. Clearance breakdown table: side/top/rear required vs available
7. Cavity-fit math, in plain English: "Your 600mm cavity. Bosch needs 595mm + 5mm side clearance × 2 = 605mm. Result: 5mm short."
8. If verdict is no-fit / tight: "3 alternatives that fit better in your 600mm cavity":
   - Use search-core to find top 3 alternatives in same category that fit cavity-W with comfort
   - Each alternative as a card: brand, model, dimensions, link to product detail
9. Buy section: if product.retailers has entries, render retailer chip strip with real URLs (use existing retailer rendering helper)
10. FAQ block (5 Q&A, generated from product+cavity facts):
    - Q: "What size cavity does the [Model] need?"
    - Q: "Can I install [Model] in a [W-50]mm cavity?"
    - Q: "Does the [Model] need top clearance?"
    - Q: "How much does [Brand] need on each side for ventilation?"
    - Q: "Where can I buy [Model] in Australia?"
    - Each answer is 1-3 sentences pulled from product data
    - Wrap in FAQPage schema.org JSON-LD
11. Related links: 6 links to other cavity widths for same product + 6 links to other products for same cavity width (for internal linking matrix)
12. Footer (reused)

## §3 Content uniqueness requirement (avoid Google doorway pages)

Each page must have UNIQUE text content:
- Verdict math is per-product+cavity, naturally unique
- FAQ answers reference specific dimensions, naturally unique
- Alternatives list is computed per cavity, naturally unique

If two pages have ≥80% identical text, the generator should warn and skip.

## §4 vercel.json
Add: { "source": "/fit-check/:slug", "destination": "/pages/fit-check/:slug.html" }

## §5 sitemap
generate-sitemap.js must include all generated /fit-check/ URLs.

## §6 In this PR: only generate 10 sample pages

To validate quality before mass-generating:
- generator runs with options.limit = 10
- pick 10 covering: 5 fits + 3 tight + 2 no-fit (for variety)
- pages committed to repo for review
- write to reports/fit-check/sample-validation.json: list of 10 pages with sample headlines

## §7 Tests RED → GREEN

tests/fit-check-pages.test.mjs:
- selectFitCheckCombinations returns expected count given limit
- buildFitCheckPage returns html with required H1, dimensions, FAQ
- Two adjacent products in same cavity produce ≠ 80% similar HTML
- All pages contain Article + FAQPage JSON-LD
- Sample 10 pages have valid HTML (load through cheerio + check structure)

## §8 Global rules
1. TDD; independent PR; not auto-merge
2. branch phase-54-fit-check-template, label phase-54
3. Scope:
   - scripts/generate-fit-check-pages.js (new)
   - vercel.json (add 1 route)
   - pages/fit-check/*.html (10 sample pages committed)
   - reports/fit-check/sample-validation.json
   - scripts/generate-sitemap.js (extend if needed)
   - tests/fit-check-pages.test.mjs (new)
4. Forbidden: public/data/*.json, data/*, search-core, brand-canon, RUM, SW
5. Red-line zero diff
6. Determinism: generate-all twice = zero diff
7. Existing tests must not regress

## §9 PR body MUST include
1. Commit SHAs
2. List of 10 sample slugs with their verdicts
3. One full sample page HTML (in <details>, choose verdict-tight for visual interest)
4. Content uniqueness check pass (no two pages ≥80% similar)
5. Schema validation pass for sample pages
6. Determinism + red-line proof
7. npm test count + new tests
8. Mass-generation estimate: "PR #6 will run with limit=Infinity to produce ~1600 pages"

Begin. NO touching of catalog data, search-core algorithm, brand-canon, RUM, SW.
```

### A2 (PR #6): Mass Generation

**Pre-condition**: A1 merged. Sample 10 pages reviewed and approved.

**Codex prompt skeleton**:

```
You are the sole implementer for FitAppliance v2.

Phase 54 PR #6: Mass Generate 1600 Fit-Check SEO Pages (A2)

Pre-conditions: A1 (PR #3) merged. Template + generator validated on 10 samples.

## §0 Startup
git switch -c phase-54-fit-check-mass-gen, label phase-54.

## §1 Run generator with full options
node scripts/generate-fit-check-pages.js (no limit) → ~1600 pages in pages/fit-check/

## §2 Update sitemap
Run generate-sitemap to include all new pages.

## §3 Verify
- npm run generate-all twice → zero diff after second run
- Spot-check 5 random pages: valid HTML, unique content, working links
- Sitemap URL count increased by ~1600

## §4 Quarantine
Before commit, run uniqueness check: any pair of pages ≥80% similar text → quarantine to reports/fit-check/quarantined/. PR body lists quarantined pages.

## §5 PR body
- 1600 pages added (commit summary stat)
- Sitemap before/after count
- Quarantined page count + reasons
- Lighthouse spot check on 3 sample pages (perf, a11y, SEO)
- Red-line proof

Begin.
```

### A3 (PR #7): Schema + Sitemap + IndexNow

**Pre-condition**: A2 merged.

**Codex prompt skeleton**:

```
You are the sole implementer for FitAppliance v2.

Phase 54 PR #7: Fit-Check Pages Schema + Sitemap + IndexNow (A3)

Pre-conditions: A2 (PR #6) merged. ~1600 pages live.

## §1 Validate schema on all generated pages
node scripts/validate-schema.js across pages/fit-check/ → 0 errors

## §2 Sitemap optimization
- Split sitemap.xml if >50,000 URLs (we're ~2000+ now, no split needed yet, but add the capability)
- Set priority/changefreq for fit-check pages: priority 0.6, changefreq monthly

## §3 IndexNow batch ping
Run scripts/ping-indexnow.js to notify Bing/Yandex of new URLs.
For Google, rely on sitemap re-crawl + GSC submission.

## §4 GSC manual step (document for user)
PR body should remind user to: log into Google Search Console, sitemap section, "Resubmit sitemap.xml" to expedite Google indexing.

## §5 PR body
- Schema validation report
- Sitemap URL counts (per file if split)
- IndexNow ping result (200 OK from each engine)
- GSC manual step reminder

Begin.
```

---

## Success Metrics

After all 7 PRs merged:

| Metric | Baseline (2026-05-07) | Target (after Phase 53-56) |
|---|---|---|
| Test count | 815 | ≥870 |
| SEO surface (sitemap URLs) | ~470 | **~2070** (+1600 fit-check) |
| Catalog products with verified dimensions (PDF-extracted) | 0 | ≥50 |
| 2.5D fit-viz tab present | No | Yes |
| Retailer coverage | 3% | 3% (B2 may bump to 5-7% if PDF includes retailer hints, but not the goal) |
| Time to add new product spec | minutes (manual) | seconds (PDF + AI) |

---

## Risk Register

| Risk | Mitigation |
|---|---|
| LLM extraction wrong dimensions | Stage 4 sanity validation + human review queue, no auto-merge in B2 |
| 1600 SEO pages flagged as doorway pages | A1's content uniqueness rule + each page references unique alternatives |
| 2.5D math wrong → SVG broken on edge cases | D1 includes negative-gap test + edge case (cavity smaller than product) |
| pdf-parse fails on scanned PDFs | Documented limitation; B2 picks text-based PDFs only |
| Vercel build time exceeds limit due to 1600 pages | Vercel handles 50k+ static files; this is fine |
| GSC slow to index 1600 new pages | IndexNow ping + manual sitemap submit |

---

## Dependencies + Sequencing Diagram

```
              ┌─────────────────────────────┐
              │  Polish PR #85 (DONE)       │
              └──────────────┬──────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
  ┌──────────┐         ┌──────────┐         (Track A waits for B1)
  │  PR #1   │         │  PR #2   │
  │  B1      │         │  D1      │
  │ Pipeline │         │ Iso      │
  │ Foundation│        │ Renderer │
  └─────┬────┘         └─────┬────┘
        │                    │
        ├─────┬──────────────┤
        ▼     ▼              ▼
   ┌────────┐ ┌────────┐ ┌────────┐
   │ PR #5  │ │ PR #3  │ │ PR #4  │
   │ B2     │ │ A1     │ │ D2     │
   │ Real   │ │ SEO    │ │ Tab    │
   │ Run 50 │ │ Template│ │ UI    │
   └────────┘ └────┬───┘ └────────┘
                   │
              ┌────┴────┐
              ▼         ▼
         ┌────────┐ ┌────────┐
         │ PR #6  │ │ PR #7  │
         │ A2     │ │ A3     │
         │ Mass   │ │ Schema │
         │ Gen    │ │ +Sitemap│
         └────────┘ └────────┘
```

---

## How to use this file

When starting any of PR #1 through PR #7:

1. Open this file
2. Find the relevant section (e.g., "B1" or "A1")
3. Copy the Codex prompt verbatim
4. Paste to Codex in a fresh session
5. After Codex completes, update the PR's section with actual SHA + outcomes for future reference

When B2 / B3 / D2 / A2 / A3 are ready (i.e., their pre-condition PRs merged), refine the skeleton prompts with concrete details from the merged PRs (e.g., LLM caller decision for B2).

---

**Last updated**: 2026-05-07
**Status**: PR #1 (B1) and PR #2 (D1) ready to start in parallel.

---

## Burst Orchestration (single-paste Codex prompts)

The 7 PRs are grouped into 5 bursts. Each burst is one Codex session and produces 1-2 PRs. Between bursts, the user reviews and merges. This minimizes user touchpoints and maximizes Codex autonomy.

### BURST 1 — B1 + D1 (parallel)

```
You are operating in burst-execution mode for FitAppliance v2. Repo root: /Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2.

Read PLAN-PHASE53-56-A-B-D.md fully before starting. Pay special attention to "Hard rules across ALL Phase 53-56 PRs" and the per-PR prompts in the B1 and D1 sections.

This burst executes TWO PRs sequentially in this single session, on TWO independent branches off main:

## Step 1: Execute B1 (Phase 53 PR #1)

Read the full B1 prompt from PLAN-PHASE53-56-A-B-D.md section "B1 (PR #1): Foundation". Execute it verbatim:
- Branch: phase-53-pdf-pipeline-foundation
- Build PDF pipeline framework (5 stages + tests + fixture)
- Push and open PR
- Wait for CI to go green
- Capture PR URL and SHAs

Do NOT auto-merge.

## Step 2: Execute D1 (Phase 53 PR #2)

After B1's PR is open and CI green:
- git checkout main && git pull --ff-only
- Branch: phase-53-iso-renderer
- Read D1 prompt from PLAN-PHASE53-56-A-B-D.md section "D1 (PR #2): Isometric Renderer"
- Execute verbatim: build public/scripts/iso-projection.js + tests
- Push and open PR
- Wait for CI green
- Capture PR URL and SHAs

Do NOT auto-merge.

## Step 3: Final report

Output exactly:

```
BURST_1_COMPLETE
PR #B1 URL: <url>
PR #B1 commits: <SHAs>
PR #B1 CI: <pass/fail summary>
PR #D1 URL: <url>
PR #D1 commits: <SHAs>
PR #D1 CI: <pass/fail summary>
Total new tests: <N>
Red-line proof: <empty/clean>
Awaiting user to merge both PRs and reply 'merged 1' before BURST 2.
```

End session.

## Hard constraints
- Both PRs must be CI green before reporting
- Both must follow red-line zero diff
- Both must follow scope locks per their individual prompts
- If either PR's RED test does not initially fail, STOP and report which one
- If a CI check fails after 1 retry, STOP and report the failure with logs
```

### BURST 2 — E1: Card Refactor (RTINGS-style, no-price utility-first)

```
You are operating in burst-execution mode for FitAppliance v2. Repo root: /Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2.

Pre-condition: BURST 1 (B1 + D1) merged to main. Verify by:
- git fetch origin main
- git log origin/main --oneline -5 should show "PDF Pipeline Foundation" and "Iso Renderer" commits
- If not present, STOP and report "BURST 1 not yet merged"

# Phase 55 PR #X: Product Card RTINGS-style Refactor (E1)

## Role & Context
FitAppliance is a millimeter-accurate spatial matching tool ("Will it fit?"). We do NOT have reliable real-time price data. Our value is cavity-fit calculation, not price comparison. The card refactor must reflect this: NO price tags, NO "from $X" claims, NO "$XX/yr energy cost" inflated to look like a price.

## Stack reality
- This project uses VANILLA JS + plain CSS (NOT React, NOT Tailwind, NOT Lucide React)
- Existing card renderer is `public/scripts/ui/product-card.js` exporting `buildRow` (list) and `buildCard` (grid)
- Existing CSS in `public/styles.css` and `public/styles-deferred.css`
- Icons are inline SVG strings — sustain this pattern

DO NOT introduce React, Tailwind, Lucide React, or any new framework. Adapt the design to vanilla.

## §0 Startup
1. cd repo root, git checkout main && git pull --ff-only
2. git switch -c phase-55-card-rtings-refactor
3. Do not auto-merge. Label: phase-55

## §1 Three-zone card refactor

Refactor `buildRow` AND `buildCard` in `public/scripts/ui/product-card.js` into 3 vertical zones:

### Zone A: Fit Hero (top)
- Replace current brand-avatar-only thumb with a horizontal split:
  - Left half (60×60 desktop / 50×50 mobile): brand color block + 1-2 letter brand initials (preserve existing renderProductThumb)
  - Right half (60×60 desktop / 50×50 mobile): mini front-view SVG wireframe — cavity outer + product inner, no labels (just visual silhouette). Use a NEW helper `renderMiniFrontWireframe(product, cavity)` written for this PR. Reuses fit-visualization.js math but outputs a tiny 60×60 SVG. If cavity dimensions are unknown (no search yet), render only the brand block.
- Top-right of zone A: existing fit-badge (Perfect / Tight / Won't fit) — KEEP existing buildFitHealthHtml, do not reinvent
- Click anywhere in Zone A → opens existing fit-viz modal (re-use existing modal infrastructure)

### Zone B: Data Core (middle)
- Title row: brand + model (already done — preserve)
- Replace the existing static W/H/D spec chips with **clearance progress bars**:
  - 3 horizontal bars stacked, one per axis (W, H, D)
  - Each bar shows: cavity dimension as full bar background (#e5e3de), product+clearance fill from left in semantic color
  - Color logic:
    - Spare ≥ 20mm → fill color #2e7d32 (green)
    - Spare 5-20mm → fill color #b06900 (amber)
    - Spare 0-5mm → fill color #c62828 (red, indicates binding)
    - Spare < 0 → fill color #c62828 + striped pattern (indicates won't fit, this case shouldn't appear in default search but handle gracefully)
  - Each bar has an inline label: "W: 595mm + 5mm clearance / 600mm cavity (5mm spare)"
  - Use font-variant-numeric: tabular-nums for all numbers (already a project convention from PR #85)
- Tech specs row below bars (compact text, max 1-2 lines):
  - Energy stars (existing)
  - Door hinge reversibility (if available in product.features; check for "reversible" / "hinge" tokens)
  - Total volume in litres (if product.capacity_litres or product.kwh_year exists; for fridges this is typically available)
  - Estimated annual energy cost: "~$XX/yr" — labeled as estimate, NOT shown as a price tag
- KEEP existing data-trust line (PR #85's "Retailer link checked..." stamp) — do not reinvent

### Zone C: CTA & Affiliate (bottom)
- **CRITICAL: Do NOT render any price tag anywhere in the card. No "$549", no "from $X". The annual energy cost from Zone B is fine (it's labeled estimate).**
- Primary button: `<button class="card-cta-availability">Check Availability</button>` (full width on mobile, fit-content on desktop)
- Click behaviour: toggle accordion-style inline reveal within the card showing:
  - Up to 5 retailer entries from product.retailers, each rendered as a button with retailer name + arrow icon
  - Buttons: `<a class="retailer-link" rel="sponsored nofollow noopener" target="_blank">JB Hi-Fi →</a>`
  - If product has 0 retailers: show "Search online" link (existing buildSearchOnlineUrl) instead
  - Below retailer buttons: small text "We may earn a commission. <a>Disclosure</a>" (small, #6b6b6b, 11px) — single line
- Implementation: use `<details>` HTML element for the accordion (no JS state needed), or a vanilla JS toggle with aria-expanded
- The existing retailer-modal can be RETAINED as-is for the deeper "Compare" action elsewhere. This change only affects card-inline expansion.

## §2 CSS — section in styles-deferred.css

Add new section `/* Card RTINGS refactor (Phase 55) */` with:
- `.card-zone-a` — flex container for thumb + mini wireframe + fit badge
- `.mini-front-wireframe` — 60×60 SVG container
- `.clearance-bar` — bar wrapper, height 8px, border-radius 4px, background #e5e3de, position relative
- `.clearance-bar-fill` — absolute left, height 100%, transition width 0.2s
- `.clearance-bar--green / --amber / --red` — fill colors per state
- `.clearance-bar-label` — caption above bar, font-size 11px, font-variant-numeric tabular-nums
- `.card-cta-availability` — primary button, copper/orange theme matching existing
- `.retailer-accordion-content` — when details opens, gentle slide-down animation
- Mobile @media: collapse Zone A to single row, stack progress bars full-width

DO NOT modify existing classes that don't relate to card layout (preserve fit-badge, p-row-name etc styles).

## §3 New helper: renderMiniFrontWireframe

Add new export to `public/scripts/ui/product-card.js` (or new file `public/scripts/ui/mini-wireframe.js`, your choice but document):
- `renderMiniFrontWireframe(product, cavity)` → SVG string
- viewBox 60×60
- If cavity W/H provided: draw cavity as outer wireframe rect (stroke #2c2c2c sw 1.2) + product as inner rect (stroke #2c2c2c sw 1, fill #eeece6 with 0.7 opacity)
- If cavity not provided: draw just the product rect centered, with placeholder text "—"
- This is purely cosmetic for card; the precise diagrams are in the existing modal

## §4 Tests RED → GREEN

tests/card-rtings-refactor.test.mjs new:
- buildRow output contains card-zone-a / card-zone-b / card-zone-c structure
- Card output contains 3 clearance-bar elements (W/H/D)
- Card output does NOT contain any text matching /\$\d{2,5}/ in the rendering body (sanity check for no leaked prices). Use a clean fixture product.
- "Check Availability" button is present and uses <details> or aria-expanded
- Accordion content includes retailer.url for products with retailers
- Accordion content shows search-online fallback for products without retailers
- Mini wireframe renders with cavity → has 2 rect elements
- Mini wireframe without cavity → has 1 rect element + "—" text

tests/card-clearance-bar.test.mjs new:
- Function deriving bar fill color: ≥20mm → green class, 5-20 → amber, <5 → red, <0 → red+striped
- Bar fill width % calculation correct (relative to cavity dimension)

Existing card tests: update assertions if structure changed; do NOT lower assertion strength.

## §5 Visual safety

Render 3 sample cards with different fit states and embed in PR body (as <details>):
- Sample 1: Perfect fit (W 600 cavity, 580mm product, 20mm spare on W axis) → green bar
- Sample 2: Tight (W 600 cavity, 595mm product, 5mm spare) → amber bar
- Sample 3: Binding (W 600 cavity, 599mm product, 1mm spare) → red bar

These let reviewer eyeball the bar color logic.

## §6 Hard constraints / red lines

DO NOT touch:
- public/data/*.json (catalog raw data)
- data/popularity-research.json / data/brand-canon.json
- scripts/research-popularity.js / scripts/enrich-appliances.js
- public/scripts/search-core.js (search algorithm)
- public/scripts/iso-projection.js (D1 module, untouched)
- public/scripts/fit-visualization.js (D1/D2 module, untouched)
- public/scripts/rum.js / public/scripts/sw-register.js / public/service-worker.js
- api/rum.js
- .github/workflows/

DO touch:
- public/scripts/ui/product-card.js (the refactor target)
- public/scripts/ui/product-thumb.js (if mini-wireframe goes here)
- public/scripts/ui/mini-wireframe.js (new file, optional)
- public/styles.css and/or public/styles-deferred.css (card CSS)
- index.html (only if accordion CSS hook needs an inline style override; usually not needed)
- tests/* (new test files)

Red-line proof: 
git diff --stat origin/main...HEAD -- public/data/ data/popularity-research.json data/brand-canon.json scripts/research-popularity.js scripts/enrich-appliances.js public/scripts/search-core.js public/scripts/fit-visualization.js public/scripts/iso-projection.js public/scripts/rum.js public/scripts/sw-register.js public/service-worker.js api/rum.js .github/workflows/
must output empty.

## §7 Execution Plan
1. git switch -c phase-55-card-rtings-refactor
2. Read public/scripts/ui/product-card.js to understand current buildRow / buildCard structure
3. Read public/scripts/ui/product-thumb.js for existing avatar
4. Read existing CSS for card layout
5. Add renderMiniFrontWireframe helper
6. Refactor buildRow (list view first, since it's primary; grid view second)
7. Add CSS for 3-zone layout, clearance bars, accordion
8. Write RED tests, then GREEN implementation
9. Run npm run generate-all twice → confirm zero diff
10. Run npm test → all green
11. Push, open PR, wait for CI green
12. Final report

## §8 Final report

Output:
```
BURST_2_COMPLETE (E1: Card Refactor)
PR URL: <url>
Commits: <SHAs>
CI: <pass summary>
Total new tests: <N>
Red-line proof: <empty>
Sample cards rendered: 3 (perfect / tight / binding) embedded in PR body
Awaiting user to merge and reply 'merged 2' before BURST 3.
```

End session. Do not auto-merge. If any CI step fails, retry once; if still fails, STOP and report.
```

### BURST 3 — A1 + D2 (parallel after burst 2 merged)

```
You are operating in burst-execution mode for FitAppliance v2. Repo root: /Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2.

Pre-condition: BURST 2 (E1: Card Refactor) merged to main. This means:
- BURST 1 (B1 + D1) was previously merged
- BURST 2 (E1 card refactor) is now merged
- Latest 5 main commits should include "Card Refactor (Phase 55)" plus B1+D1 commits

Verify with:
- git fetch origin main
- git log origin/main --oneline -8 should show all four merged
- If not present, STOP and report which is missing

A1 must use the NEW card design from E1 (so SEO pages render with the refactored card).

Read PLAN-PHASE53-56-A-B-D.md sections A1 and D2.

## Step 1: Execute A1 (Phase 54 PR #3)

- Branch: phase-54-fit-check-template (off main)
- Execute A1 prompt verbatim
- Generate exactly 10 sample fit-check pages (limit=10)
- Push and open PR
- Wait for CI green

## Step 2: Execute D2 (Phase 53 PR #4)

After A1 PR open:
- git checkout main && git pull --ff-only
- Branch: phase-53-iso-tab (off main)
- Execute D2 prompt verbatim
- Add 4th tab "[3D]" to fit-viz modal, wire iso-projection
- Push and open PR
- Wait for CI green

## Step 3: Report

```
BURST_3_COMPLETE
PR #A1 URL: <url>
PR #A1 sample slugs: <list of 10>
PR #D2 URL: <url>
Total new tests: <N>
Awaiting user to merge both PRs and reply 'merged 3' before BURST 4.
```

End session.
```

### BURST 4 — B2 (real PDF run, requires user decision)

```
You are operating in burst-execution mode for FitAppliance v2. Repo root: /Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2.

Pre-condition: BURST 3 (A1 + D2) merged. Verify before proceeding.

This burst requires a user decision before code work. STOP at decision point and ask:

LLM provider for PDF extraction:
  Option A: ANTHROPIC_API_KEY=<key> (set as env var or GitHub secret)
  Option B: USE_CODEX_INLINE (you, Codex, do extraction by reading PDF text and outputting JSON during this session)
  Option C: DEFER_B2 (skip B2, proceed to BURST 4)

Output:
```
BURST_4_DECISION_NEEDED
Reply with one of: ANTHROPIC | CODEX | DEFER
```

After user replies:

If ANTHROPIC: implement llmCaller calling Claude API with ANTHROPIC_API_KEY env var.
If CODEX: implement llmCaller as a function that, in this session, loops through PDFs and you (Codex) directly produce the JSON for each.
If DEFER: end session, return "BURST_4_DEFERRED".

Then execute B2 prompt verbatim from PLAN-PHASE53-56-A-B-D.md:
- Branch: phase-53-pdf-batch-1
- Process 50 real Bosch + LG fridge PDFs
- Output 50 evidence files + diff report
- DO NOT modify catalog
- Open PR with batch report

Final report:
```
BURST_4_COMPLETE
PR URL: <url>
50 products processed: <list>
High-confidence patches ready: <count>
Conflicts requiring review: <count>
Awaiting 'merged 4' before BURST 5.
```
```

### BURST 5 — A2 (mass generate 1600 SEO pages)

```
You are operating in burst-execution mode for FitAppliance v2. Repo root: /Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2.

Pre-condition: BURST 4 merged (or deferred — A2 does not depend on B2 data, only on A1 template + E1 card design).

Read PLAN-PHASE53-56-A-B-D.md section A2.

## Execute A2

- Branch: phase-54-fit-check-mass-gen
- Run scripts/generate-fit-check-pages.js with no limit → ~1600 pages
- Generate-all twice → zero diff
- Sitemap update
- Quarantine any pages ≥80% similar
- Push and open PR

Final report:
```
BURST_5_COMPLETE
PR URL: <url>
Pages generated: <N>
Quarantined: <M>
Sitemap URL count before/after: <X>/<Y>
Lighthouse spot-check on 3 pages: <perf/a11y/SEO scores>
Awaiting 'merged 5' before BURST 6.
```
```

### BURST 6 — A3 (final schema + sitemap + IndexNow)

```
You are operating in burst-execution mode for FitAppliance v2. Repo root: /Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2.

Pre-condition: BURST 5 merged.

Read PLAN-PHASE53-56-A-B-D.md section A3.

## Execute A3

- Branch: phase-54-fit-check-schema-indexnow
- Validate schema across all /fit-check/ pages
- Update sitemap (split if needed)
- Run scripts/ping-indexnow.js
- Document GSC manual step for user
- Push and open PR

Final report:
```
PHASE_53_56_COMPLETE
PR #A3 URL: <url>
Schema errors: 0
Sitemaps split: <yes/no>
IndexNow ping: <Bing/Yandex 200 OK>
GSC manual reminder: <yes>
Total Phase 53-56 outcome:
  - 8 PRs merged (B1, D1, E1, A1, D2, B2, A2, A3)
  - <N> new tests added
  - <M> SEO pages added
  - <K> products with PDF-extracted spec data
  - 2.5D fit-viz tab live
  - Card UI refactored to RTINGS-style 3-zone layout (no price, clearance bars, accordion CTA)
End of plan execution.
```
```

### Operating notes for the user

The 6 bursts produce 8 PRs total:

| Burst | Contents | PR count |
|---|---|---|
| 1 | B1 (PDF pipeline foundation) + D1 (2.5D iso renderer) — parallel | 2 |
| 2 | **E1 (Card RTINGS refactor)** — solo | 1 |
| 3 | A1 (SEO template + 10 samples) + D2 (2.5D tab UI) — parallel | 2 |
| 4 | B2 (PDF batch run, needs LLM decision) — solo | 1 |
| 5 | A2 (mass gen 1600 pages) — solo | 1 |
| 6 | A3 (schema + sitemap + IndexNow) — solo | 1 |

Sequence:

1. Paste BURST 1 to Codex now. Wait for `BURST_1_COMPLETE`.
2. Review and merge both PRs from BURST 1 in your terminal (`gh pr merge <N> --squash --delete-branch ...`).
3. Reply to me: `merged 1`. I will paste BURST 2 prompt for you.
4. Repeat through BURST 6.

If at any burst Codex reports an error or stuck state, share the report and we triage before continuing.

If a burst takes longer than expected (>4 hours), Codex's session may time out; in that case, paste the same burst prompt to a fresh session — Codex re-reads the plan and resumes from where it left off (it checks branch state, existing PRs, etc.).
