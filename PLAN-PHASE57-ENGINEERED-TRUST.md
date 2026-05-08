# PLAN-PHASE57: Engineered Trust — Data Provenance & Verification UX

**Start**: 2026-05-08 (after Phase 53-56 complete)
**Estimated duration**: 14-18 days, 5 PRs
**Goal**: Transform FitAppliance from "another data site" into a tool users **cross-reference before purchase decisions** by exposing the manufacturer-PDF data chain and adding verification UX.

---

## Strategic Context (Codex MUST read first)

### The Trust Thesis

For tool-utility sites, **trust ≠ pretty UI**. Trust = **data provenance** + **transparency** + **engineering rigor**. Users don't pick FitAppliance because it looks nice; they pick it because they can verify the data isn't made up.

This phase converts our backend PDF pipeline (built in Phase 53-56) into a **visible evidence chain** the user can audit:

1. **"Show your receipts"** — link to the actual manufacturer PDF that produced the dimensions
2. **Verification tier system** — green badge for human-checked data, neutral for inferred
3. **Math made visible** — never just "Required: 650mm"; always "600mm appliance + 25mm × 2 sides = 650mm"
4. **Discrepancy feedback loop** — confident sites invite corrections
5. **Instrument-grade visuals** — angular, monospaced, technical-spec-sheet feel

### How this builds on Phase 53-56

| Phase 53-56 produced | Phase 57 exposes / extends |
|---|---|
| B1 PDF pipeline framework (5 stages) | T1: provenance UI surfaces this |
| 1 manual-evidence seed (Hisense HRTF206) | T5: expand to top 50 products |
| E1 card refactor (3-zone, no-price) | T2 + T4 add badges + visual rigor |
| A1/A2 fit-check pages (239 unique) | T3 adds tooltips + discrepancy CTA |

### Hard rules (apply to ALL Phase 57 PRs)

1. TDD: every PR has RED → GREEN cycle.
2. Each PR is independent (own branch, own CI, label `phase-57`). Never auto-merge.
3. Red lines (DO NOT touch unless explicitly noted):
   - `public/data/*.json` (catalog raw data)
   - `data/popularity-research.json`
   - `scripts/research-popularity.js`
   - `scripts/enrich-appliances.js`
   - `public/scripts/search-core.js` (search algorithm)
   - `public/scripts/iso-projection.js` (D1, frozen)
   - `public/scripts/fit-visualization.js` (D1/D2, frozen)
   - `public/scripts/rum.js`
   - `public/scripts/sw-register.js`
   - `public/service-worker.js`
   - `api/rum.js`
   - `.github/workflows/**`
4. **Manual evidence handling** (T1-T4 only): Read from `data/manual-evidence.json` (created by B1+B2 work). NEVER write to it from UI PRs. Writing to it is exclusively T5's territory or future B2 PRs.
5. Determinism: `npm run generate-all` twice = zero diff.
6. Existing test count must not regress.
7. PR body MUST include red-line proof:
   ```bash
   git diff --stat origin/main...HEAD -- public/data/ data/popularity-research.json scripts/research-popularity.js scripts/enrich-appliances.js public/scripts/search-core.js public/scripts/iso-projection.js public/scripts/fit-visualization.js public/scripts/rum.js public/scripts/sw-register.js public/service-worker.js api/rum.js .github/workflows/
   ```
   Empty (unless T5, which writes to `data/manual-evidence.json`).
8. **Graceful degradation rule**: When evidence is missing for a product, UI MUST fall back cleanly (e.g., "Source: public sources" instead of broken link). NO empty placeholders. NO "TODO". NO error states.

---

## Timeline

```
Week 1
  Day 1-3   PR #1  T1: Provenance UI (PDF link + extraction timestamp)
  Day 1-2   PR #2  T4: Visual Instrument Aesthetic (CSS-only, parallel)

Week 2
  Day 4-6   PR #3  T2: Verification Badge + Clearance Math
  Day 4-5   PR #4  T3: Micro-copy Tooltips + Discrepancy Loop (parallel)

Week 3
  Day 7-12  PR #5  T5: Manual Evidence Expansion (top 50 products via PDF pipeline)
```

**Slack**: 4-5 days for review + visual verification + iterations.

---

## Track Breakdown

### T1 — Data Provenance UI

**Goal**: Every product card / detail panel shows where its dimensions came from. PDF link if we have evidence; honest fallback otherwise.

**New UX elements**:

```
┌─────────────────────────────────────────────────┐
│  [Card content as before — Phase 55 E1]         │
│                                                  │
│  ┌──── Data source ──────────────────────────┐  │
│  │ 📄 Source of truth:                         │  │
│  │    Hisense HRTF206 install manual (PDF)     │  │
│  │ ⏱️ Extracted & verified: 2026-05-04         │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

When evidence missing:

```
┌─────────────────────────────────────────────────┐
│  ┌──── Data source ──────────────────────────┐  │
│  │ Specs from publicly listed retailer feeds.  │  │
│  │ Manufacturer PDF verification pending.       │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**Module**: New helper `public/scripts/ui/provenance.js`
- `getProductProvenance(productId)` reads from inlined evidence index (built at generate time)
- Returns: `{ verified: bool, pdfUrl, extractedAt, source }` or null
- `renderProvenanceBlock(product)` returns HTML string

**Build-time injection**: `scripts/build-evidence-index.js` reads `data/manual-evidence.json`, produces a slim `public/data/evidence-index.json` mapping product IDs to provenance metadata. This way the runtime doesn't need to fetch the entire evidence corpus.

### T2 — Verification Badge + Clearance Math

**Goal**: Two related trust signals — a verification level badge, and visible clearance math.

**Verification levels**:

| Level | When | UI |
|---|---|---|
| `verified` | Has manual-evidence entry with `approved: true` AND human reviewer set `verified: true` | Green shield ✓ "Verified Fit" |
| `inferred` | Catalog data only, no evidence yet | Gray pill "Inferred from public data" |
| `pending` | Has manual-evidence entry but `verified: false` | Amber pill "Verification in progress" |

**Clearance math display**: Replace any "Required cavity: 650mm" with the explicit math:

```
Required cavity width:  600mm appliance + 25mm × 2 sides  =  650mm
Required cavity height: 1860mm appliance + 50mm top       =  1910mm
Required cavity depth:  660mm appliance + 25mm rear       =  685mm
```

This shows in the existing `clearance-bar` row labels (already gives us most of this — we sharpen the format).

**Module**: New helper `public/scripts/ui/verification.js`
- `getVerificationLevel(productId)` returns 'verified' | 'pending' | 'inferred'
- `renderVerificationBadge(product)` returns HTML string
- `renderClearanceMath(product, cavity, axis)` returns "600mm + 25mm × 2 = 650mm" string

### T3 — Micro-copy Tooltips + Discrepancy Loop

**Goal**: Replace technical jargon with clear plain-language explanations + invite user corrections.

**Tooltips on technical terms** (in card + detail pages):

| Term | Tooltip |
|---|---|
| "Door open 90° depth" | "If this fridge sits next to a wall, you need this exact depth to fully pull out the crisper drawers." |
| "Top clearance" | "Manufacturer-required ventilation gap above the appliance. Below this, warranty may be voided." |
| "Side clearance" | "Air gap on each side for compressor heat dissipation." |
| "Door swing radius" | "Space the door arc sweeps when fully open. Important if a wall is close to the hinge side." |
| "Reversible hinge" | "Door can be re-installed to swing the other direction at install time." |
| "Energy star rating" | "Australian GEMS rating; higher stars = lower running cost." |
| "Practical clearance buffer" | "FitAppliance applies a 5mm side / 20mm top / 10mm rear default. Manufacturer-stated clearances are shown separately as advisory." |

**"Report a discrepancy" CTA**: Footer of every card has a small text link:

```
Notice an error in these dimensions? Let us know →
```

Clicking opens a pre-filled GitHub issue (no backend needed):

```
https://github.com/fitappliance/fitappliance/issues/new
  ?title=Data discrepancy: <Brand> <Model>
  &labels=data-discrepancy
  &body=Product: <Brand> <Model> (<id>)
  Field with discrepancy:
  Expected value:
  Source / proof:
```

**Module**: New helper `public/scripts/ui/tooltips.js` + `public/scripts/ui/discrepancy.js`

### T4 — Visual Instrument Aesthetic

**Goal**: Move from "consumer e-commerce" feel to "professional instrument / inspection report" feel.

**Visual changes (CSS only, no DOM/JS)**:

| Element | Current | Phase 57 |
|---|---|---|
| Card border-radius | 12-16px | **4px** |
| Card shadow | soft 28px blur | **single 1px hairline** + barely-there 4px shadow |
| Numbers (W/H/D, prices, kWh) | already tabular-num from PR #85 | **monospace font** for numbers (not just tabular-num) |
| Section dividers | gradient backgrounds | **thin 1px #d0cfc8 lines** |
| Typography hierarchy | varied | **stricter scale**: H1 28px / H2 18px / H3 14px / body 14px / caption 12px (+1.4 line-height) |
| Color palette | warm beige + copper | retain but **darken ink to #1a1a1a** + slate gray secondary #6b6b6b + sharp accent #d97706 |
| Form inputs | rounded 8px | **2px** (rectangular, instrument-feel) |
| Spec values | regular weight | **600 weight + monospace** (e.g., "600 mm" looks like a measurement readout) |

**Implementation**: One CSS-only PR. No HTML/JS changes. This makes it safe to revert if visuals look wrong.

### T5 — Manual Evidence Expansion (B2 real run)

**Goal**: Process top 50 products through the PDF pipeline, populating `data/manual-evidence.json` with verified evidence. This is the original deferred BURST 4 from Phase 53-56.

**Pre-condition**: User decides LLM provider:
- Option ANTHROPIC: Anthropic API with `ANTHROPIC_API_KEY` env var
- Option CODEX_INLINE: Codex extracts JSON inline during this session
- Option DEFER: Skip T5; Phase 57 ships with 1 evidence seed only

**Note**: If DEFER, T1-T4 still ship and degrade gracefully. The user can run T5 later as a standalone PR.

---

## Per-PR Detailed Prompts

### T1 (PR #1): Provenance UI

```
You are operating in burst-execution mode for FitAppliance v2. Repo root: /Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2.

Read PLAN-PHASE57-ENGINEERED-TRUST.md fully before starting. Pay attention to "Hard rules" and the T1 section.

# Phase 57 PR #1: Data Provenance UI (T1)

Goal: Every product card / detail page shows where its dimensions came from. Show PDF link + extraction date when we have manual-evidence; honest fallback when we don't.

## §0 Setup
1. cd repo root, git checkout main && git pull --ff-only
2. git switch -c phase-57-provenance-ui
3. Do not auto-merge. Label: phase-57

## §1 Build-time evidence index

New file: scripts/build-evidence-index.js
- Read data/manual-evidence.json
- For each entry with status="approved" (or whatever the existing schema uses), produce a slim record:
  ```json
  {
    "<productId>": {
      "verified": true | false,
      "pdfUrl": "https://manufacturer-domain/install-manual.pdf",
      "extractedAt": "2026-05-04",
      "source": "manufacturer_install_manual"
    }
  }
  ```
- Write to public/data/evidence-index.json (new file, will ship to production)
- Hook into existing generate-all pipeline (after enrich-appliances, before generate-sitemap)

If data/manual-evidence.json doesn't have a clearly defined schema, READ the file's existing entries (Hisense HRTF206 from PR #91) and infer the schema. Document inferred schema in scripts/build-evidence-index.js comments.

If no entries are approved/verified, the script writes `{}` (empty object). UI must handle empty gracefully.

## §2 Provenance helper module

New file: public/scripts/ui/provenance.js

Exports:
- `loadEvidenceIndex(fetchImpl = fetch)`: async, fetches /data/evidence-index.json once, caches in module scope, returns the map. On 404 or fetch error, returns {} silently (graceful degrade).
- `getProductProvenance(productId, indexMap)`: synchronous, returns `{ verified, pdfUrl, extractedAt, source } | null`
- `renderProvenanceBlock(product, indexMap)`: returns HTML string

Three render states:

VERIFIED (has evidence, verified=true):
```html
<aside class="data-provenance data-provenance--verified" aria-label="Data source">
  <div class="provenance-row">
    <span class="provenance-icon" aria-hidden="true">📄</span>
    <span class="provenance-label">Source of truth:</span>
    <a class="provenance-link" href="..." target="_blank" rel="noopener">
      ${brand} ${model} install manual (PDF)
    </a>
  </div>
  <div class="provenance-row">
    <span class="provenance-icon" aria-hidden="true">⏱️</span>
    <span class="provenance-label">Extracted & verified:</span>
    <time datetime="2026-05-04">4 May 2026</time>
  </div>
</aside>
```

PENDING (has evidence, verified=false):
```html
<aside class="data-provenance data-provenance--pending">
  Data extracted from manufacturer manual; manual verification in progress.
</aside>
```

UNVERIFIED (no evidence):
```html
<aside class="data-provenance data-provenance--fallback">
  Specs from publicly listed retailer feeds. Manufacturer PDF verification pending.
</aside>
```

## §3 Wire into product card + fit-check page

In public/scripts/ui/product-card.js (existing E1-refactored card):
- Inside Zone B (data core), after the existing data-trust-line, render the provenance block
- Pass through existing options.indexMap or load lazily on first card render

In scripts/generate-fit-check-pages.js (existing A1 generator):
- Add provenance block to each generated /fit-check/ page (in the verdict body, after the dimensions section)
- These pages are static so the provenance HTML is baked in at build time

## §4 CSS

In public/styles-deferred.css, add `/* Phase 57 T1 — Provenance */` section:

```css
.data-provenance {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 12px;
  padding: 10px 12px;
  border-top: 1px solid #d0cfc8;
  font-size: 12px;
  color: #6b6b6b;
}
.data-provenance--verified { color: #2c2c2c; }
.data-provenance--verified .provenance-link {
  color: #1a1a1a;
  text-decoration: underline;
  text-decoration-color: #2e7d32;
  text-underline-offset: 3px;
}
.data-provenance--verified .provenance-link:hover { color: #2e7d32; }
.provenance-row { display: flex; gap: 6px; align-items: baseline; }
.provenance-icon { flex-shrink: 0; font-size: 11px; }
.provenance-label { font-weight: 500; }
.data-provenance time { font-variant-numeric: tabular-nums; }
.data-provenance--pending { color: #8a6500; }
.data-provenance--fallback { color: #6b6b6b; font-style: italic; }
```

Mobile @media: keep readable, no special collapse needed.

## §5 Tests RED → GREEN

tests/build-evidence-index.test.mjs:
- Reads sample manual-evidence.json fixture, builds index correctly
- Empty input → empty index
- Malformed entry skipped with warning, not crash

tests/provenance.test.mjs:
- getProductProvenance returns expected shape per state
- renderProvenanceBlock with verified evidence → contains PDF link + date
- renderProvenanceBlock with pending evidence → contains "verification in progress"
- renderProvenanceBlock with no evidence → contains "publicly listed retailer feeds"
- XSS: evidence with malicious PDF URL → escaped (anchor href is escaped)

tests/card-provenance-integration.test.mjs:
- buildRow output for product with evidence contains data-provenance--verified
- buildRow output for product without evidence contains data-provenance--fallback

## §6 Determinism

After E1 + provenance render is wired:
- generate-all twice → zero diff
- evidence-index.json must be deterministic (sort keys alphabetically)

## §7 Hard constraints

DO NOT touch:
- public/data/*.json (catalog), data/manual-evidence.json (read-only here)
- search-core.js, fit-visualization.js, iso-projection.js
- RUM, SW, API, workflows

DO touch:
- scripts/build-evidence-index.js (new)
- public/scripts/ui/provenance.js (new)
- public/scripts/ui/product-card.js (wire provenance into Zone B)
- scripts/generate-fit-check-pages.js (add provenance to static pages)
- public/styles-deferred.css (provenance CSS)
- tests/* (3 new test files)
- public/data/evidence-index.json (build artifact, committed)
- package.json (if generate-all script needs new step)

Red-line proof: empty (note: public/data/evidence-index.json is a build artifact, expected to change but not raw catalog).

## §8 PR body must include

1. 4-6 commit SHAs
2. Sample provenance HTML for the 3 render states (in <details>)
3. Determinism proof (generate-all twice zero diff)
4. Red-line proof
5. Test count: existing + 8+ new
6. Note: T2 verification badge + clearance math is next, will integrate with this provenance layer

## §9 Final report

```
T1_COMPLETE (Provenance UI)
PR URL: <url>
Commits: <SHAs>
CI: <pass summary>
Evidence index size: <N entries>
Render samples: 3 (verified / pending / unverified)
Tests added: <N>
Awaiting merge before T2.
```

End session.
```

### T2 (PR #3): Verification Badge + Clearance Math

```
You are operating in burst-execution mode for FitAppliance v2. Repo root: /Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2.

Pre-condition: T1 (Provenance UI, PR #1) merged. Verify:
- git fetch origin main
- main HEAD includes "Phase 57 T1" or "provenance" commit
- public/data/evidence-index.json exists on main

Read PLAN-PHASE57-ENGINEERED-TRUST.md section "T2".

# Phase 57 PR #3: Verification Badge + Clearance Math (T2)

Goal: Add a 3-tier verification badge next to product titles (verified/pending/inferred), and replace any opaque "Required: 650mm" with explicit math "600mm + 25mm × 2 = 650mm".

## §0 Setup
1. cd repo root, git checkout main && git pull --ff-only
2. git switch -c phase-57-verification-badges
3. Do not auto-merge. Label: phase-57

## §1 Verification helper module

New file: public/scripts/ui/verification.js

Exports:
- `getVerificationLevel(productId, evidenceIndex)`: returns 'verified' | 'pending' | 'inferred'
  - 'verified' if evidence exists AND `verified: true`
  - 'pending' if evidence exists AND `verified: false`
  - 'inferred' otherwise
- `renderVerificationBadge(product, evidenceIndex)`: returns HTML string

Three badge variants:

VERIFIED:
```html
<span class="verification-badge verification-badge--verified" data-verification="verified">
  <svg class="badge-icon" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3 7l3 3 5-6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="7" cy="7" r="6.5" fill="#2e7d32"/>
  </svg>
  <span>Verified Fit</span>
  <details class="verification-tooltip">
    <summary aria-label="What does Verified Fit mean?">?</summary>
    <p role="tooltip">Dimensions and clearance manually cross-checked against the manufacturer's official install manual.</p>
  </details>
</span>
```

PENDING:
```html
<span class="verification-badge verification-badge--pending" data-verification="pending">
  <span>Verification in progress</span>
  <details class="verification-tooltip">
    <summary aria-label="What does verification in progress mean?">?</summary>
    <p role="tooltip">Data extracted from manufacturer manual; manual cross-check not yet complete.</p>
  </details>
</span>
```

INFERRED:
```html
<span class="verification-badge verification-badge--inferred" data-verification="inferred">
  <span>From retailer data</span>
  <details class="verification-tooltip">
    <summary aria-label="What does this mean?">?</summary>
    <p role="tooltip">Specs from publicly listed retailer feeds. Manufacturer PDF verification not yet complete.</p>
  </details>
</span>
```

## §2 Clearance math display

In public/scripts/ui/product-card.js, the existing clearance-bar-label currently shows:

```
W: 580mm + 0mm clearance / 600mm cavity (20mm spare)
```

Replace with the explicit-math format:

```
W: 580mm appliance + 0mm side × 2 = 580mm required (in 600mm cavity, 20mm spare)
```

For axes where clearance is on one side only (top, rear), drop the "× 2":

```
H: 1850mm appliance + 25mm top = 1875mm required (in 1900mm cavity, 25mm spare)
D: 600mm appliance + 25mm rear = 625mm required (in 650mm cavity, 25mm spare)
```

New helper: `renderClearanceMath({ axis, applianceMm, clearanceMm, isDoubleSided, cavityMm, spareMm })` → label string.

The label STILL must use tabular numbers (existing CSS).

## §3 Wire into card

In product-card.js Zone B:
- After title row, BEFORE the clearance bars, insert the verification badge inline next to the title
- Update the clearance-bar-label generation to use renderClearanceMath

In fit-check static pages (scripts/generate-fit-check-pages.js):
- Verification badge added next to H1 product name
- Clearance math used in the "Cavity-fit math" plain-English section

## §4 CSS

In public/styles-deferred.css, add `/* Phase 57 T2 — Verification badges */`:

```css
.verification-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px 3px 4px;
  border-radius: 3px;
  font-size: 12px;
  font-weight: 500;
  margin-left: 8px;
  vertical-align: middle;
}
.verification-badge--verified {
  background: #e8f5e9;
  color: #1b5e20;
}
.verification-badge--pending {
  background: #fff8e1;
  color: #8a6500;
}
.verification-badge--inferred {
  background: #f0eeea;
  color: #6b6b6b;
}
.badge-icon { width: 14px; height: 14px; flex-shrink: 0; }
.verification-tooltip { display: inline-block; margin-left: 2px; }
.verification-tooltip summary {
  list-style: none;
  cursor: pointer;
  font-size: 10px;
  padding: 0 4px;
  border: 1px solid currentColor;
  border-radius: 50%;
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.verification-tooltip[open] summary::after { content: ""; }
.verification-tooltip p {
  position: absolute;
  background: #1a1a1a;
  color: #fff;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  max-width: 240px;
  z-index: 10;
  margin-top: 4px;
  font-weight: 400;
}
```

## §5 Tests

tests/verification.test.mjs:
- getVerificationLevel returns correct level for each input combination
- renderVerificationBadge contains expected text + ARIA + class per level
- Tooltip contains explanatory text appropriate to level
- XSS: malicious product name → escaped

tests/clearance-math.test.mjs:
- renderClearanceMath('width', 580, 0, true, 600) → "W: 580mm appliance + 0mm side × 2 = 580mm required (in 600mm cavity, 20mm spare)"
- renderClearanceMath('height', 1850, 25, false, 1900) → "H: 1850mm appliance + 25mm top = 1875mm required (in 1900mm cavity, 25mm spare)"
- Non-fitting case (negative spare): "+15mm cavity needed" instead of "spare"

Existing tests: update card-rtings-refactor + clearance-bar tests to assert NEW math format.

## §6 Hard constraints / red lines / determinism: same as Phase 57 standard

## §7 Final report

```
T2_COMPLETE (Verification Badge + Clearance Math)
PR URL: <url>
Commits: <SHAs>
Sample badges: 3 (verified / pending / inferred) embedded in PR body
Sample math labels: 3 axes (W with double-sided, H with top, D with rear)
Tests added: <N>
Awaiting merge before T3.
```
```

### T3 (PR #4): Micro-copy Tooltips + Discrepancy Loop

```
You are operating in burst-execution mode for FitAppliance v2. Repo root: /Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2.

Pre-condition: T2 (Verification, PR #3) merged. (T3 may run in PARALLEL with T4 since they touch different concerns.)

Read PLAN-PHASE57-ENGINEERED-TRUST.md section "T3".

# Phase 57 PR #4: Micro-copy Tooltips + Discrepancy Loop (T3)

Goal: Add plain-language tooltips to technical terms throughout the site, and add a "Report a discrepancy" CTA that opens a pre-filled GitHub issue (no backend needed).

## §0 Setup
1. cd repo root, git checkout main && git pull --ff-only
2. git switch -c phase-57-microcopy-discrepancy
3. Do not auto-merge. Label: phase-57

## §1 Tooltips dictionary

New file: public/scripts/ui/tooltips-dictionary.js

Export TOOLTIPS_DICT (object), keyed by stable ids:

```js
export const TOOLTIPS_DICT = {
  'door-open-90': "If this fridge sits next to a wall, you need this exact depth to fully pull out the crisper drawers.",
  'top-clearance': "Manufacturer-required ventilation gap above the appliance. Below this, warranty may be voided.",
  'side-clearance': "Air gap on each side for compressor heat dissipation.",
  'rear-clearance': "Space behind the appliance for cables, water inlets, and ventilation.",
  'door-swing-radius': "Space the door arc sweeps when fully open. Important if a wall is close to the hinge side.",
  'reversible-hinge': "Door can be re-installed to swing the other direction at install time.",
  'energy-stars': "Australian GEMS rating; higher stars = lower running cost.",
  'practical-buffer': "FitAppliance applies a 5mm side / 20mm top / 10mm rear default. Manufacturer-stated clearances are shown separately as advisory.",
  'manufacturer-clearance': "The exact clearance the manufacturer's install manual specifies. Required to keep warranty valid.",
  'cavity-width': "The widest point inside your cabinet, measured at the narrowest part.",
  'cavity-height': "Floor (or tile lip) to the underside of any cabinetry above.",
  'cavity-depth': "Wall (including any power outlet protrusion) to the front edge of the cavity.",
  'doorway-width': "The narrowest doorway the appliance must pass through during delivery.",
  'apartment-vented': "Vented dryers exhaust hot moist air; not allowed in NCC 2022 multi-unit dwellings without external venting.",
};
```

Maintain alphabetical order in the file (developer ergonomics).

## §2 Tooltips renderer

New file: public/scripts/ui/tooltips.js

Export `renderTooltip(id, anchor)`:
- Looks up TOOLTIPS_DICT[id]
- Returns a `<details class="info-tooltip">` HTML structure with anchor element + popover

Anchor is the term/label the user reads (e.g., "Top clearance").

```html
<details class="info-tooltip">
  <summary>${anchor}<span class="info-tooltip-trigger" aria-label="What does ${anchor} mean?">?</span></summary>
  <span role="tooltip" class="info-tooltip-body">${TOOLTIPS_DICT[id]}</span>
</details>
```

## §3 Wire into card + detail pages

Identify the technical terms currently used as plain text in:
- product-card.js (look for "clearance", "swing", "stars", "vented")
- generate-fit-check-pages.js (similar)
- pages/methodology.html / pages/about/editorial-standards.html

Replace plain-text occurrences with `renderTooltip('id', 'Term')` where appropriate, taking care not to:
- Render tooltips inside aria-label or alt attributes
- Apply more than once per visible term in a section (don't over-tooltip — once per page section is enough)

If unsure, prefer NOT adding a tooltip rather than spamming the UI. Document each tooltip's location in a comment.

## §4 Discrepancy CTA

New file: public/scripts/ui/discrepancy.js

Export `buildDiscrepancyUrl(product)`:
```js
export function buildDiscrepancyUrl(product) {
  const params = new URLSearchParams({
    title: `Data discrepancy: ${product.brand} ${product.model}`,
    labels: 'data-discrepancy',
    body: `Product: ${product.brand} ${product.model} (${product.id})
Page URL:
Field with discrepancy:
Expected value:
Manufacturer source / proof:`,
  });
  return `https://github.com/fitappliance/fitappliance/issues/new?${params.toString()}`;
}
```

Wire into product card Zone C (footer area, after retailer accordion):

```html
<div class="card-discrepancy-cta">
  <a class="discrepancy-link" href="${buildDiscrepancyUrl(product)}" target="_blank" rel="noopener">
    Notice an error in these dimensions?
  </a>
</div>
```

Style as small text, low visual prominence — not a primary CTA.

## §5 CSS

```css
.info-tooltip { display: inline; position: relative; }
.info-tooltip summary {
  list-style: none;
  cursor: pointer;
  display: inline;
}
.info-tooltip-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin-left: 4px;
  border: 1px solid #6b6b6b;
  border-radius: 50%;
  font-size: 9px;
  color: #6b6b6b;
  cursor: help;
}
.info-tooltip[open] .info-tooltip-body {
  display: block;
  position: absolute;
  top: 100%;
  left: 0;
  background: #1a1a1a;
  color: #fff;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  max-width: 260px;
  z-index: 20;
  margin-top: 4px;
}
.info-tooltip-body { display: none; }
.card-discrepancy-cta {
  margin-top: 8px;
  font-size: 11px;
  text-align: right;
}
.discrepancy-link {
  color: #6b6b6b;
  text-decoration: none;
  border-bottom: 1px dotted #6b6b6b;
}
.discrepancy-link:hover {
  color: #1a1a1a;
}
```

## §6 Tests

tests/tooltips-dictionary.test.mjs:
- TOOLTIPS_DICT has expected keys
- All values are non-empty strings
- All keys are kebab-case

tests/tooltips.test.mjs:
- renderTooltip returns HTML with <details> + role="tooltip"
- Unknown id returns just the anchor text without tooltip wrapper
- XSS: anchor text is escaped

tests/discrepancy.test.mjs:
- buildDiscrepancyUrl returns valid GitHub issue URL
- URL has correct title parameter (URL-encoded)
- URL has labels=data-discrepancy
- Body includes product brand+model+id
- XSS: malicious product fields are URL-encoded

## §7 Hard constraints / red lines / determinism: same

## §8 Final report

```
T3_COMPLETE (Microcopy + Discrepancy)
PR URL: <url>
Commits: <SHAs>
Tooltip terms added: <N> (list in PR body)
Discrepancy URL sample: <full URL example for one product>
Tests added: <N>
Awaiting merge before T5.
```
```

### T4 (PR #2): Visual Instrument Aesthetic

```
You are operating in burst-execution mode for FitAppliance v2. Repo root: /Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2.

Pre-condition: BURST 1 of Phase 57 (T1) merged. T4 may run in PARALLEL with T1 since T4 only touches CSS, no overlap with T1's JS additions.

Read PLAN-PHASE57-ENGINEERED-TRUST.md section "T4".

# Phase 57 PR #2: Visual Instrument Aesthetic (T4)

Goal: Move the entire site visual from "consumer e-commerce" to "instrument / technical inspection report" feel. CSS-ONLY changes — no DOM, no JS, no test fixture changes.

## §0 Setup
1. cd repo root, git checkout main && git pull --ff-only
2. git switch -c phase-57-instrument-aesthetic
3. Do not auto-merge. Label: phase-57

## §1 Apply visual changes

In public/styles.css and/or public/styles-deferred.css, audit + change:

### Card chrome
Find existing card / panel styles. Change:
- border-radius: from 12px / 16px → **4px**
- box-shadow: from "0 28px 80px rgba(0,0,0,.28)" or similar → **"0 0 0 1px #d0cfc8, 0 1px 4px rgba(0,0,0,0.04)"** (single hairline + barely-there shadow)
- background: from "#fff" gradients → **flat #fff or #fafaf7**

### Typography
Add new font stack at top of public/styles.css:

```css
:root {
  --font-display: 'Outfit', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --font-mono: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
  --ink-primary: #1a1a1a;
  --ink-secondary: #6b6b6b;
  --ink-tertiary: #9c9c9c;
  --line-default: #d0cfc8;
  --accent-orange: #d97706;
  --accent-green: #2e7d32;
  --accent-amber: #b06900;
  --accent-red: #c62828;
}

body {
  font-family: var(--font-display);
  color: var(--ink-primary);
  letter-spacing: 0.01em; /* unchanged from PR #85 */
}

.dim-tag, .clearance-bar-label, .spec-chip, .energy-line strong, .card-zone-tech-specs, .card-price, time, .field-unit {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0; /* monospace doesn't need extra letter-spacing */
}

h1 { font-size: 28px; font-weight: 700; line-height: 1.25; }
h2 { font-size: 18px; font-weight: 600; line-height: 1.3; }
h3 { font-size: 14px; font-weight: 600; line-height: 1.3; }
small, .caption { font-size: 12px; line-height: 1.4; }
```

### Form inputs
Existing inputs (cavity W/H/D, doorway, etc.) — change:
- border-radius: 8px → **2px**
- border: 1px solid var(--line-default)
- focus: outline 2px solid var(--accent-orange)
- background: #fff (flat)

### Section dividers
Replace gradient or shaded section backgrounds with:
- Single 1px line: border-top: 1px solid var(--line-default)
- Or: 24px white space between sections
- DO NOT use box-shadow as a divider

### Spec values
Existing dim-tag (W 600mm) and similar:
- Use --font-mono
- Add font-weight: 600
- letter-spacing: 0
- Make the unit (mm) slightly lighter color: var(--ink-secondary)

### Color palette migration
Throughout existing CSS, replace any:
- #2c2c2c (text dark) → var(--ink-primary)
- #6b6b6b (text muted) → var(--ink-secondary)
- #d97706 (accent) → var(--accent-orange)

(This may produce a large diff but it's mechanical. Use sed or scripted replace.)

## §2 What NOT to change

DO NOT touch:
- HTML markup / DOM structure
- JS files
- Test files
- Brand color block (still hash-derived per brand)
- Fit-viz SVG content
- Iso renderer output

If a CSS change requires a DOM change to look right, STOP and report — that's beyond T4 scope.

## §3 Mobile considerations

The aesthetic should hold on mobile. Particularly:
- Card border-radius 4px reads fine on small screens
- Mono font works for numbers; ensure body text remains readable
- Touch targets stay ≥44px even with thinner borders

## §4 Tests

This is CSS-only, but add a minimal smoke test:

tests/instrument-aesthetic.test.mjs:
- public/styles.css contains --font-mono variable
- public/styles.css contains --ink-primary etc CSS variables
- Card selectors use border-radius 4px (not 12px)
- Body uses font-family: var(--font-display) somewhere

These tests are intentionally light — visual changes are best verified by humans.

## §5 Visual verification (PR body must include)

Generate before/after CSS diffs for 3 representative components:
1. Product card (e.g., .p-row or .card-grid)
2. Search input (e.g., .field input)
3. Section divider area

Embed in PR body as <details> blocks for reviewer.

Also include 1 line: "Reviewer should open Vercel preview and visually inspect on desktop + mobile before merge."

## §6 Hard constraints / red lines: same as Phase 57 standard

Determinism: CSS-only changes mean generate-all output should be byte-identical. If determinism fails after CSS changes, something's wrong (CSS shouldn't affect HTML generation).

## §7 Final report

```
T4_COMPLETE (Instrument Aesthetic)
PR URL: <url>
Commits: <SHAs>
CSS diff size: ~<N> lines added/changed
Visual references: 3 component diffs in PR body
Tests added: <smoke tests count>
Reviewer note: visual inspection on Vercel preview required before merge.
Awaiting merge before T2.
```

Note: T2 expects T4 merged so the verification badges inherit the new color tokens.
```

### T5 (PR #5): Manual Evidence Expansion

```
You are operating in burst-execution mode for FitAppliance v2. Repo root: /Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2.

Pre-condition: T1 + T2 + T3 + T4 merged. The UI infrastructure is in place; T5 populates the data backend.

Read PLAN-PHASE57-ENGINEERED-TRUST.md section "T5".

# Phase 57 PR #5: Manual Evidence Expansion — top 50 products (T5)

Goal: Run the PDF pipeline (built in B1, hardened in B2 hardening, seeded in B2 evidence) on the top 50 products by priorityScore. Produce 50 evidence entries in data/manual-evidence.json.

## §0 LLM provider decision (REQUIRED before code work)

This burst requires an LLM provider for PDF text → structured JSON extraction. STOP after reading and request:

```
T5_DECISION_NEEDED
This PR requires an LLM provider. Choose one:

  ANTHROPIC: Use Anthropic Claude API. User must set ANTHROPIC_API_KEY as a GitHub repository secret. Estimated cost: ~$0.30 USD for 50 products at Sonnet rates.

  CODEX_INLINE: Codex (you) processes PDFs inline during this session by reading text and outputting JSON for each. Slower (1 product per session message), free, no API key needed.

  DEFER: Skip T5 for now. Phase 57 ships with 1 evidence seed only. T1-T4 still degrade gracefully.

Reply with one: ANTHROPIC | CODEX_INLINE | DEFER
```

WAIT for user reply before proceeding.

## §1 If user says ANTHROPIC

1. Verify GitHub secret ANTHROPIC_API_KEY is set (via gh secret list)
2. Implement scripts/pdf-pipeline/3-ai-parse.js's real llmCaller using @anthropic-ai/sdk
3. Add @anthropic-ai/sdk to package.json devDependencies
4. Run pipeline for top 50 products (selected by priorityScore desc)
5. Each product:
   - Find official manufacturer install manual PDF (use WebFetch / WebSearch to discover URL — manufacturer support pages typically have these publicly)
   - Run all 5 stages (fetch, extract, ai-parse, validate, prepare-patch)
   - Write entry to data/manual-evidence.json
6. Mark each entry: status="extracted", verified=false (human reviewer must set verified=true later)
7. Generate batch report at reports/pdf-pipeline/2026-05-XX-batch-1.json

## §2 If user says CODEX_INLINE

1. For each of top 50 products:
   - Codex (you) uses WebFetch to grab the manufacturer install manual PDF URL
   - Codex extracts text via pdf-parse locally (this works since pdf-parse is local)
   - Codex internally extracts JSON matching schema (no external API call — Codex IS the LLM)
   - Codex writes to data/manual-evidence.json
2. Same status/verified flags as ANTHROPIC path
3. Same batch report

This is slower (Codex must process serially in this session) but no API key needed.

## §3 If user says DEFER

End session immediately, output:
```
T5_DEFERRED
T1-T4 already shipped. Manual evidence expansion deferred to a future PR.
```

## §4 In all real-run cases (ANTHROPIC or CODEX_INLINE)

### Product selection
- Read public/data/{fridges,dishwashers,dryers,washing-machines}.json
- Compute priorityScore desc, take top 50 unique products
- Filter to brands with publicly accessible install manual PDFs (Bosch, LG, Westinghouse, Fisher & Paykel, Hisense, Samsung, Haier, Electrolux). Skip products from brands without public PDFs.

### Per-product processing
For each:
- WebSearch / WebFetch the manufacturer's support page → find PDF URL
- Validate PDF URL is from manufacturer's domain (not third-party scrape sites)
- If no PDF found, skip with note in batch report
- Run pipeline stages 1-5
- Compare extracted dimensions vs catalog dimensions:
  - Diff ≤ 5mm: high confidence, mark as approved+extracted (verified still false until human reviews)
  - Diff > 5mm: mark needs-review, flag in batch report

### data/manual-evidence.json schema (extend existing if needed)
Each entry:
```json
{
  "<productId>": {
    "brand": "Bosch",
    "model": "KGN396LBAS",
    "category": "fridge",
    "pdfUrl": "https://media.bosch-home.com/.../KGN396LBAS-install.pdf",
    "extractedAt": "2026-05-08",
    "extractedBy": "anthropic-claude-3.5" | "codex-inline",
    "verified": false,
    "verifiedAt": null,
    "verifiedBy": null,
    "extractedDimensions": {
      "width": 595, "height": 1860, "depth": 660
    },
    "extractedClearance": {
      "side": 25, "top": 50, "rear": 25
    },
    "catalogDimensions": {
      "width": 595, "height": 1860, "depth": 660
    },
    "diff": {
      "width": 0, "height": 0, "depth": 0
    },
    "status": "extracted" | "needs-review",
    "sourceQuote": "exact text from PDF where dimensions appear, max 200 chars"
  }
}
```

### Batch report
Write reports/pdf-pipeline/2026-05-08-batch-1.json:
- 50 product IDs attempted
- Per product: pdf URL, status, diff summary
- Aggregate: high-confidence count, needs-review count, skipped (no PDF) count
- Estimated cost (if ANTHROPIC) — token usage × pricing

## §5 Tests

tests/manual-evidence-batch.test.mjs:
- data/manual-evidence.json has ≥ 1 entry beyond seed (Hisense HRTF206 was the seed)
- All entries pass the schema validator (4-validate.js)
- All extractedAt dates are ISO 8601
- No verified=true entries (those require human review)
- Diff fields computed correctly for sample fixture

## §6 Constraints

- DO NOT auto-set verified=true (human must review)
- DO NOT modify catalog data (public/data/*.json) directly — diffs are stored in evidence file only
- DO modify data/manual-evidence.json — this is THIS PR's primary write target

Red-line note: data/manual-evidence.json IS in scope for T5 (this is the only Phase 57 PR that writes to it).

## §7 Final report

```
T5_COMPLETE (Manual Evidence Expansion)
PR URL: <url>
Commits: <SHAs>
LLM provider used: <ANTHROPIC | CODEX_INLINE>
Top 50 products processed: <success/skip/fail counts>
High-confidence entries: <N>
Needs-review entries: <M>
Total cost (if API): $<X> USD
Tests added: <N>
Awaiting merge to ship full evidence layer.
```

End of Phase 57 plan execution. Verification of evidence (setting verified=true) is a post-merge human task.
```

---

## Burst Orchestration

The 5 PRs can be parallelized as follows for fastest delivery:

### BURST 1 — T1 + T4 (parallel, ~3 days)

```
You are operating in burst-execution mode for FitAppliance v2. Repo root: /Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2.

Read PLAN-PHASE57-ENGINEERED-TRUST.md fully. Pay special attention to "Hard rules" and the T1 + T4 sections.

This burst executes TWO PRs sequentially in this single session, on TWO independent branches off main:

## Step 1: Execute T1 (Phase 57 PR #1)

Read T1 prompt from plan file. Execute verbatim:
- Branch: phase-57-provenance-ui
- Implement provenance UI (build-evidence-index + helper module + card wiring + CSS + tests)
- Push and open PR
- Wait for CI green

## Step 2: Execute T4 (Phase 57 PR #2)

After T1 PR open and CI green:
- git checkout main && git pull --ff-only
- Branch: phase-57-instrument-aesthetic
- Implement T4 verbatim (CSS-only — typography, monospace numbers, instrument feel)
- Push and open PR
- Wait for CI green

## Step 3: Final report

```
BURST_1_COMPLETE
PR #T1 URL: <url>
PR #T4 URL: <url>
Total new tests: <N>
Red-line proof: empty
Awaiting merge of both before BURST 2.
```

End session.
```

### BURST 2 — T2 + T3 (parallel, ~3 days)

```
You are operating in burst-execution mode for FitAppliance v2. Repo root: /Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2.

Pre-condition: BURST 1 (T1 + T4) merged. Verify before proceeding.

Read PLAN-PHASE57-ENGINEERED-TRUST.md sections T2 and T3.

## Step 1: Execute T2 (Verification Badge + Clearance Math)

- Branch: phase-57-verification-badges
- Implement T2 verbatim
- Push, open PR, wait for CI green

## Step 2: Execute T3 (Microcopy + Discrepancy)

- Branch: phase-57-microcopy-discrepancy
- Implement T3 verbatim
- Push, open PR, wait for CI green

## Step 3: Report

```
BURST_2_COMPLETE
PR #T2 URL: <url>
PR #T3 URL: <url>
Tests added: <N>
Awaiting merge before BURST 3 (T5).
```

End session.
```

### BURST 3 — T5 (single PR, requires user decision, ~5-7 days)

```
You are operating in burst-execution mode for FitAppliance v2. Repo root: /Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2.

Pre-condition: BURST 2 (T2 + T3) merged.

Read PLAN-PHASE57-ENGINEERED-TRUST.md section T5.

This burst requires LLM provider decision before code work. Output:

```
T5_DECISION_NEEDED
Reply with one of: ANTHROPIC | CODEX_INLINE | DEFER
```

After user replies, execute T5 prompt verbatim.

Final report:

```
T5_COMPLETE
PR URL: <url>
LLM provider: <choice>
Top 50 products processed: <stats>
Tests added: <N>
Awaiting final merge — Phase 57 complete after this.
```
```

---

## Operating Notes

The 3 bursts produce 5 PRs total:

| Burst | PRs | Duration |
|---|---|---|
| 1 | T1 (Provenance) + T4 (Aesthetic) — parallel branches | ~3 days |
| 2 | T2 (Verification) + T3 (Microcopy) — parallel branches | ~3 days |
| 3 | T5 (Evidence Expansion) — needs LLM decision | ~5-7 days |

Sequence:

1. Paste BURST 1 to Codex. Wait for `BURST_1_COMPLETE`.
2. Review and merge T1 + T4. Reply `merged 1`.
3. Paste BURST 2. Wait for `BURST_2_COMPLETE`.
4. Review and merge T2 + T3. Reply `merged 2`.
5. Paste BURST 3. Codex stops with `T5_DECISION_NEEDED`. Reply with provider choice.
6. Codex proceeds. Wait for `T5_COMPLETE`. Merge.
7. **Phase 57 complete.**

If at any burst Codex reports an error, share the report and triage before continuing.

If a burst session times out, paste the same burst prompt to a fresh Codex session — Codex re-reads this plan file and resumes from where it left off (it checks branch state and existing PRs).

---

## Success Metrics

After Phase 57 ships:

| Metric | Baseline (after Phase 53-56) | Target (after Phase 57) |
|---|---|---|
| Test count | 885 | ≥ 920 |
| Products with verified evidence | 1 (seed) | ≥ 50 |
| User-visible verification levels | 0 | 3 (verified / pending / inferred) |
| Tooltips on technical terms | partial | comprehensive (≥10 terms covered) |
| Discrepancy CTA present | no | yes |
| PDF source links exposed in UI | no | yes |
| Visual consistency with "instrument" feel | partial | full (mono numbers, hairline borders, instrument typography) |

**Trust signals visible to a fresh visitor**:
- Top 50 products show "Verified Fit" badge
- Each product card shows "Source of truth: [PDF link] · Extracted on [date]"
- Tech terms have inline tooltips
- "Report a discrepancy" link in card footer
- All numbers in monospace + tabular alignment
- Hairline section dividers, no consumer-grade rounded shadows

---

## Risk Register

| Risk | Mitigation |
|---|---|
| Manual evidence ingestion error sets bad clearance values | T5 stores data only in manual-evidence.json; UI reads it but does NOT mutate catalog. Verification flag must be human-set before "verified" badge shows. |
| LLM extraction wrong dimension on a verified entry | Diff > 5mm flags `needs-review`; human review prevents auto-publish. |
| User clicks Discrepancy CTA → GitHub issue without auth | Acceptable: anyone can file an issue; we triage. Spam handled by GitHub's standard mechanisms. |
| Visual aesthetic change breaks layout on mobile | T4 PR explicitly requires Vercel preview visual inspection on mobile before merge. |
| Tooltips misfire on small screens (popover off-screen) | CSS uses position:absolute with max-width; if it overflows, content remains accessible via the underlined anchor text. |
| Provenance UI shows broken PDF links if manufacturer changes URL | T1's evidence-index.json includes pdfUrl. If 404s become a problem, future PR adds link health check + fallback to "PDF moved" state. |

---

## Dependencies + Sequencing Diagram

```
                Phase 53-56 (DONE)
                       │
                       ▼
                ┌──────────────┐
                │   BURST 1    │
                │   T1 + T4    │
                │  (parallel)  │
                └──────┬───────┘
                       │
                       ▼
                ┌──────────────┐
                │   BURST 2    │
                │   T2 + T3    │
                │  (parallel)  │
                └──────┬───────┘
                       │
                       ▼
                ┌──────────────┐
                │   BURST 3    │
                │   T5 (LLM)   │
                │   (single)   │
                └──────┬───────┘
                       │
                       ▼
                  Phase 57 done
                  (Engineered Trust)
```

T2 depends on T4's color tokens. T3 is independent of T4 visually. T5 depends on T1 (provenance UI exists to display the new evidence).

---

## How to Use This File

When starting any of T1 through T5:

1. Open this file
2. Find the relevant section (e.g., "T1" or "T5")
3. Copy the Codex prompt verbatim
4. Paste to Codex in a fresh session
5. After Codex completes, update the section with actual SHA + outcomes for future reference

For burst execution (recommended for fastest delivery), use the Burst Orchestration prompts.

---

**Last updated**: 2026-05-08
**Status**: Plan ready. BURST 1 (T1 + T4) is the next action.

---

## Post-Phase 57 follow-ups (not in this plan)

These are explicitly NOT part of Phase 57 but flagged for future planning:

- **Verification workflow tool**: A small script that lets a human reviewer go through `data/manual-evidence.json`, compare extracted vs catalog dimensions side by side, and click "verify" to flip `verified=true`. (Required to actually populate "Verified Fit" badges beyond manual entry.)
- **PDF link health monitor**: Weekly cron that HEAD-checks every pdfUrl in evidence-index.json and flags 404s for re-research.
- **Discrepancy triage workflow**: GitHub action that auto-labels new discrepancy issues, summarizes them in a weekly digest, and assigns to a maintainer.
- **Evidence expansion to 200 products**: After T5 gets us 50, iterate to 200 using the same pipeline.
- **PDF mining for retailer URLs**: Some manufacturer manuals reference where to buy; could enrich retailer coverage as a side benefit.
