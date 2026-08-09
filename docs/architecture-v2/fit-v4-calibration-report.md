# Fit V4 Calibration and Legacy Consumer Inventory

## Decision

- Status: `TOTAL_DISABLED_INSUFFICIENT_SOURCE_BACKED_LABELS`
- Fit V4 total enabled: **no**
- Source-backed frozen labels: **0**
- Eligible categories: **0/4**
- Calibrated weights: **0 / 0 / 0 / 0**
- Outcome and ordering metrics: **NOT_MEASURABLE**

The 40/25/20/15 values in the rank contract are uncalibrated shadow metadata.
They are not multiplied into a total. No accuracy, false-acceptance,
false-rejection, pairwise-agreement or Kendall correlation claim is measurable
from the current source-backed label set.

## Calibration Gate

| Category | Source-backed cases | Eligible | Blocking reasons |
| --- | ---: | --- | --- |
| dishwasher | 0 | no | MINIMUM_SOURCE_BACKED_CASES_NOT_MET, SUPPORTED_POLICY_BRANCH_COVERAGE_NOT_PROVEN, BOUNDARY_AND_ADVERSARIAL_COVERAGE_NOT_PROVEN |
| dryer | 0 | no | MINIMUM_SOURCE_BACKED_CASES_NOT_MET, SUPPORTED_POLICY_BRANCH_COVERAGE_NOT_PROVEN, BOUNDARY_AND_ADVERSARIAL_COVERAGE_NOT_PROVEN |
| refrigerator | 0 | no | MINIMUM_SOURCE_BACKED_CASES_NOT_MET, SUPPORTED_POLICY_BRANCH_COVERAGE_NOT_PROVEN, BOUNDARY_AND_ADVERSARIAL_COVERAGE_NOT_PROVEN |
| washing_machine | 0 | no | MINIMUM_SOURCE_BACKED_CASES_NOT_MET, SUPPORTED_POLICY_BRANCH_COVERAGE_NOT_PROVEN, BOUNDARY_AND_ADVERSARIAL_COVERAGE_NOT_PROVEN |

Labels must come from independent source-backed review. The V4 evaluator and
ranker are prohibited label sources. Eligibility requires at least 50 cases,
all declared policy branches, boundary and adversarial cases, and the frozen
deterministic 30% holdout.

## Legacy Consumer Inventory

Unique matching files from the explicit legacy scan roots: **58**.

### compare_or_generated_page (4)

- `public/scripts/ui/compare-table.js`
- `scripts/generate-compare-vs-pages.js`
- `scripts/generate-fit-check-pages.js`
- `scripts/generate-product-pages.js`

### filter (5)

- `public/scripts/fit-engine.js`
- `public/scripts/search-core.js`
- `public/scripts/search-dom.js`
- `public/scripts/ui/range-filters.js`
- `src/shared/fit-engine.js`

### other (6)

- `public/scripts/replacement-matcher.mjs`
- `public/scripts/ui/fit-score-ring.js`
- `public/scripts/ui/fit-score.js`
- `public/scripts/ui/provenance.js`
- `public/scripts/ui/score-breakdown.js`
- `public/scripts/ui/tooltips-dictionary.js`

### product_card (1)

- `public/scripts/ui/product-card.js`

### public_data (6)

- `public/data/appliances.json`
- `public/data/dishwashers.json`
- `public/data/dryers.json`
- `public/data/evidence-index.json`
- `public/data/fridges.json`
- `public/data/washing-machines.json`

### sorter (5)

- `public/scripts/search-core.js`
- `public/scripts/search-dom.js`
- `public/scripts/ui/compare-table.js`
- `public/scripts/ui/range-filters.js`
- `src/domain/historical-replacement-audit.mjs`

### writer_or_domain (40)

- `scripts/affiliate/partnerize-tgg.js`
- `scripts/analyze-samsung-gaps.js`
- `scripts/architecture-v2/audit-retail-cutover-impact.mjs`
- `scripts/architecture-v2/build-historical-evidence-system-contract.mjs`
- `scripts/architecture-v2/build-official-registry-fit-v3-pilot.mjs`
- `scripts/architecture-v2/build-public-projection.mjs`
- `scripts/architecture-v2/run-pdf-brand-acceptance.mjs`
- `scripts/audit-pdf-coverage.js`
- `scripts/build-evidence-index.js`
- `scripts/discovery-pipeline/2-seed-evidence.js`
- `scripts/enrich-evidence.js`
- `scripts/generate-compare-vs-pages.js`
- `scripts/generate-fit-check-pages.js`
- `scripts/generate-product-pages.js`
- `scripts/pdf-pipeline/4-merge.js`
- `scripts/pdf-pipeline/lg-pdf-hunter.js`
- `scripts/pdf-pipeline/lib/vault.js`
- `scripts/pdf-pipeline/run-batch.js`
- `scripts/pdf-pipeline/run-discovery-batch.js`
- `scripts/pdf-pipeline/run-lg-sweep.js`
- `scripts/schema.js`
- `src/adapters/legacy-appliance.mjs`
- `src/domain/accepted-evidence-publication.mjs`
- `src/domain/brand-validation-sample.mjs`
- `src/domain/evidence-geometry-projector.mjs`
- `src/domain/evidence-resolution-loop.mjs`
- `src/domain/evidence-review.mjs`
- `src/domain/fit-v3-pilot-audit.mjs`
- `src/domain/fit-v3.mjs`
- `src/domain/geometry-publication.mjs`
- `src/domain/historical-dimensions-scale-control.mjs`
- `src/domain/historical-evidence-program-status.mjs`
- `src/domain/historical-evidence-publication.mjs`
- `src/domain/historical-replacement-audit.mjs`
- `src/domain/installation-evidence-pipeline.mjs`
- `src/domain/phase10-evidence-review.mjs`
- `src/domain/public-projection.mjs`
- `src/domain/space-evidence-review.mjs`
- `src/domain/wels-registry.mjs`
- `src/shared/fit-engine.js`

None of the legacy consumers are migrated by Task 10. Public cutover remains
blocked until Task 12, owner approval, source-backed calibration eligibility,
and a separate consumer migration with rollback evidence.
