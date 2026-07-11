# Phase 10 Completion Audit

Date: 2026-07-11

## Outcome

Phase 10A-E moved Architecture V2 evidence storage to a durable SHA-256 object
store, normalized repository data ownership, reviewed a balanced 40-model
active-product batch, and adjudicated the nine frozen model aliases. The public
runtime remains fail-closed where evidence does not support fit claims.

## Evidence object store

- Storage root: `/Volumes/UGREEN-1TB/FitAppliance`.
- Addressing: immutable SHA-256 shards under `evidence/objects/sha256/`.
- Documents: 59 deduplicated PDFs.
- Product links: 60.
- Rendered review pages: 179.
- PDF bytes: 157,230,747.
- Extracted text bytes: 1,969,380.
- Approved-alias source and target PDFs are included in the same object index.
- `npm run verify:evidence-objects -- --storage-root /Volumes/UGREEN-1TB/FitAppliance`
  passed after import.

## Architecture and storage

- Architecture V2 data is separated into policies, decisions, reviews,
  observations, and generated artifacts.
- A shared path registry owns repository locations and the generated artifact
  dependency graph is acyclic.
- The public build no longer reads the removed flat
  `data/architecture-v2/public-catalog-projection.json` path.
- External binary evidence and review workspaces stay on the UGREEN volume;
  small manifests, decisions, hashes, and review records remain in Git.

## Forty-model review

- Selection: 40 active products, ten per core category, with bounded brand
  concentration and no Phase 8 overlap.
- Official PDFs acquired: 38.
- Exact-model approved outcomes: 36.
- Identity quarantine: 2.
  - Samsung SRF5300SD: available PDF identifies RF44A/RF50A family only.
  - Hisense HWF8I1015BX: rendered cover identifies HWF8I1015B; BX suffix is not
    proven.
- No official source: 2.
  - LG XD3A25MB.
  - Beko BDFB1410W (official endpoint returned 403).
- Approved fields: 153.
- Adjustable height ranges remain ranges; unknown installation, operation, and
  service fields remain unknown.

## Alias decisions

- Approved: 1 (`WHE6874BA -> WHE6874SA`, Tier B, W/H/D only).
- Pending: 1 (`EBE5367BC -> EBE5367SC`).
- Rejected: 7.
- WTB2500AH was rejected because a no-suffix family coexists with older `-X`
  generation evidence with a conflicting envelope.
- Rejected records have a reviewer, date, and rationale. Registry/disposition
  drift is now a failing audit.
- At the initial Phase 10 closeout, `ao-88474` remained in publication
  quarantine because its dimensions-only approval could not release unrelated
  legacy fields. The subsequent automated-resolution loop found the exact
  manufacturer page, approved W/H/D, 90-degree door depth, top air space and
  plumbing, stripped all other legacy fit fields, and released the product.

## Verification

- Main tests: 1,568 passed, 0 failed.
- Architecture V2 tests: 143 passed, 0 failed.
- Lint: passed.
- Production build: passed after fixing the stale product-page projection path.
- Schema validation: 2,331 pages, 7,138 blocks, 0 errors.
- Documentation drift: none.
- Portability violations: none (warnings remain advisory).
- Geometry migration: 0 impossible-value issues.
- Alias audit: 1 approved, 1 pending, 7 rejected, 0 inconsistent dispositions.
- Browser QA:
  - 1440 x 1000 homepage and Phase 10 dimensions-only product page.
  - 390 x 844 homepage, dimensions-only product page, and Verified Fit page.
  - No horizontal overflow and no browser console errors.
- Production deployment `dpl_BVyEeQbKuuh7EPydFYEATUirJa8G` reached Ready at
  `https://fitappliance-17mtmald4-fitappliances-projects.vercel.app` and owns
  both `fitappliance.com.au` aliases.
- Production Sentinel: 30 uptime checks with 0 failures, 28,676 links with 0
  broken links, 2,331 pages with 0 orphans.
- Production browser verification passed on the homepage and Bosch KFD96AXEAA
  evidence page with no console errors or horizontal overflow. WHE6874BA was
  still redirected at this historical closeout; that redirect is removed by
  the subsequent automated-resolution change.

## Residual risks

- Dimension-axis audit still reports 17 blockers in raw evidence and 32 shape
  warnings. It reports zero `catalog-final` drift blockers; no automatic axis
  swap was performed.
- 3,507 of 3,521 canonical products still lack approved installation-space
  evidence.
- 1,956 of 2,005 source documents remain quarantined under current V2
  provenance rules.
- The two no-source and two identity-quarantined Phase 10 products require new
  manufacturer evidence before promotion.
- Automated evidence resolution is fail-closed: unresolved or contradictory
  cases remain quarantined after the configured search-attempt limit.

## Commits

- `2f1358e5` - durable evidence object store.
- `149fc0cf` - Architecture V2 storage normalization.
- `15b0c91d` - forty-model exact evidence review.
- `22e8959c` - model-alias adjudication.
- `31233d5d` - production build path and product-page trust-copy fixes.
