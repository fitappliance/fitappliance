# Core Technology Acceptance - 2026-07-12

Status: accepted for deployment with fail-closed publication rules.

## Scope

This acceptance covers the two FitAppliance core capabilities:

1. discovering and acquiring exact-model official appliance documents; and
2. projecting field-scoped evidence into `geometry_v2` and the shared Fit
   outcome contract without confusing closed dimensions, installation space,
   operating space, service space, or packaging dimensions.

The real canary set contains one current exact-model product from ten major
Australian appliance brands. It also includes deliberately wrong family or
sibling PDFs for LG and Samsung to test rejection before official product-page
fallback. This is a cross-brand acceptance wave, not a statistical guarantee
for every document layout published by each manufacturer.

## Result

| Gate | Result |
| --- | ---: |
| Products attempted | 10 |
| Accepted exact-model evidence | 10 |
| Official PDF + MinerU | 8 |
| Official exact product-page fallback | 2 |
| Quarantined final outcomes | 0 |
| Receipt-bound dimension projections | 10 |
| Verified Fit eligible projections | 0 |
| Successful placement outcome: insufficient data | 9 |
| Successful placement outcome: conditional fit | 1 |
| False acceptance in adversarial tests | 0 |

The absence of `VERIFIED_FIT` is an expected success condition. None of the ten
canary sources proves every category-specific installation, operation, and
service field required for verified fit. A PDF with three dimensions is not a
fit certificate.

## Brand Outcomes

| Brand / model | Accepted source | Extra fields found | Missing before Verified Fit | Successful-fit ceiling |
| --- | --- | --- | --- | --- |
| Bosch WAN24126AU | PDF | none beyond W/H/D | four placement fields, door-open depth, rear services | `INSUFFICIENT_DATA` |
| LG DVH5-08W | exact product page | door-open depth | four placement fields, rear ventilation | `INSUFFICIENT_DATA` |
| Samsung DV90BB9440GH | exact product page | none beyond W/H/D | four placement fields, door-open depth, rear ventilation | `INSUFFICIENT_DATA` |
| Fisher & Paykel RF605QZUVB1 | PDF | none beyond W/H/D | four placement fields, door-open depth | `INSUFFICIENT_DATA` |
| Westinghouse WHE5264SC | PDF | top space, door-open depth | left, right, and rear placement | `INSUFFICIENT_DATA` |
| Electrolux EQE6160BA | PDF | top space, door-open depth | left, right, and rear placement | `INSUFFICIENT_DATA` |
| Haier HDW15F4B1 | PDF | none beyond W/H/D | four placement fields, door-open depth, rear services | `INSUFFICIENT_DATA` |
| Hisense HRBC137 | PDF | all four placement fields | door-open depth | `CONDITIONAL_FIT` |
| Smeg DWAU615DB3 | PDF | none beyond W/H/D | four placement fields, door-open depth, rear services | `INSUFFICIENT_DATA` |
| Miele TCA220WP | PDF | door-open depth | four placement fields, rear ventilation | `INSUFFICIENT_DATA` |

The machine-readable source of truth is
`data/architecture-v2/reviews/automated/pdf-brand-acceptance-results.json`.

## Acquisition Controls

- Candidate order is installation guide, QRG, specification sheet, user
  manual, then family manual.
- Deterministic exact-model URL strategies are enabled only after real
  verification: Electrolux group factsheets, Bosch AU specification sheets,
  and Smeg AU technical specifications.
- Other brands use exact official product pages, support/download endpoints,
  sitemaps, or explicit official registry URLs. A single observed URL is not
  generalized into a template.
- Fetch uses bounded redirects, official-host enforcement, byte limits,
  content-type plus magic-byte checks, and a validated curl fallback.
- Original bytes and MinerU JSON are immutable SHA-256 objects. Parser replay
  uses a parser/model/policy-bound cache and fails on cache corruption.
- Exact model identity requires structured evidence. Family patterns, sibling
  models, regional variants without a page-declared SKU bridge, and retailer
  mirrors remain quarantined.

## Geometry and Fit Controls

- MinerU JSON is the only new-PDF parsing input. Direct PDF text extraction is
  blocked by the build audit.
- Explicit grouped axes support `W x H x D`, `H x W x D`, and fully named axis
  sequences. Rows without an explicit axis order do not issue claims.
- Packaging, shipping, carton, and box dimensions are excluded before field
  projection.
- `door open`, `opened door`, and `with door closed` are distinct semantic
  states. Door-open depth can never satisfy closed-envelope depth.
- Field receipts preserve source URL, PDF hash, receipt binding, page, bbox,
  fragment hash, and quote. Conflicting active receipts fail closed.
- Research requests W/H/D, all four placement fields, and category/form-factor
  operation and service fields. Missing optional Fit fields do not block a
  dimensions-only release, but they do block `VERIFIED_FIT`.
- Browser and domain evaluations use the same vendored Fit engine. Front
  operating space is not added to cavity depth; category-specific rear service
  space is combined with rear installation space using the maximum.
- The public 0-100 number is explicitly a size-margin score, not an installation
  verdict. Cards render the independent outcome beside it as `Estimated
  clearance`, `Conditional fit`, `Verified fit`, or `Fit data incomplete`.
- `INSUFFICIENT_DATA` suppresses the numeric ring. A high dimensional margin can
  never be translated into `Excellent fit`, and a green binding axis is not
  styled as a failure merely because it is the tightest of three passing axes.
- Legacy trust labels and legacy reviewed fields cannot create a verified
  result without current receipt-bound `geometry_v2_provenance`.

## Verification

- Architecture V2 tests: 258 passed.
- Main test suite: 1,588 passed.
- Build audit: 266 files checked, zero direct PDF text extractors.
- Fit publication audit: 3,521 products, zero publication violations.
- Real acceptance: 10/10 accepted, with eight PDF sources and two exact
  official HTML fallbacks.
- Browser acceptance: desktop and 390px mobile search flows rendered 200 result
  rows with zero console errors and no horizontal overflow. Every result in the
  tested default-clearance search displayed `Estimated clearance`; none showed
  an unsupported `Verified Fit` badge or the former `Excellent fit` copy.

## Production Release Verification

- Core evidence and Fit changes were merged and deployed from `45428b0a4`;
  release-cache hardening followed in `88a7d0f7e` and `28173d209`.
- Verified behavior deployment `dpl_H19SUtn7wQ3ye4ryQfydyvmTKHZG` was Ready on
  the canonical `https://www.fitappliance.com.au` host. The apex host retained
  its permanent redirect to `www`.
- The production worker exposed cache version `28173d2`. Worker, JavaScript,
  CSS, and runtime JSON responses returned `Cache-Control: public, max-age=0,
  must-revalidate`; immutable generated media retained long-lived caching.
- A persistent browser session first reproduced the real stale-client failure:
  worker caches at `45428b0`, 25 visible `Verified Fit` strings, the former
  `Excellent fit` verdict, and no outcome-first labels.
- Without unregistering the worker or deleting browser caches, one explicit
  navigation after the final release caused exactly two document requests: the
  requested navigation and one guarded `controllerchange` reload. The final
  page used only `app-shell-28173d2`, `static-28173d2`, and `data-28173d2`.
- The migrated desktop page rendered 200 `Estimated clearance` outcomes, zero
  result-level `Verified Fit` labels, zero `Excellent fit` copy, zero console
  errors, and no horizontal overflow. The 390 x 844 viewport repeated those
  results with zero clipped result nodes.
- The live Westinghouse WHE6874BA product page emitted its known approved height
  requirement while explicitly retaining unknown width and depth clearance;
  no `nullmm`, `undefinedmm`, `NaNmm`, or unsupported verified claim appeared.

## Residual Risks

- Manufacturer sites can change DOMs, download APIs, bot policies, and PDF
  layouts. A failed refresh preserves the last valid receipt but records the
  outage; it does not silently approve new bytes.
- Many official documents omit installation or operating requirements. The
  correct outcome is unknown or conditional, not a default clearance.
- The canary set is intentionally broad across brands but shallow within each
  brand. Future scheduled batches should add a second product per category and
  form factor before claiming layout-wide coverage.
- The current production catalog contains legacy reviewed geometry that is
  retained as `evidence_pending`. Only new receipt-bound geometry can regain a
  dimensions or verified publication classification.
