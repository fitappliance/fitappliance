# Phase 8 Evidence Pilot Report

Status: production verified
Reviewed: 2026-07-11

## Scope

The pilot selected 20 active products from the single Architecture V2 public
projection: five fridges, five dishwashers, five dryers and five washing
machines. Every selected product has a current retailer product-page link, an
exact canonical link to a candidate source document, and no brand contributes
more than three samples.

All 20 source URLs returned real PDF payloads. The review recorded final
content hash, page count, parser version, dimension-page number, source quote
and rendered-page confirmation. PDF presence alone did not grant approval.

## Results

- 20 documents downloaded and visually reviewed.
- 60 candidate dimension fields reviewed.
- 36 fields approved and 24 quarantined.
- 10 documents approved with complete width, height and depth evidence.
- 3 documents reviewed with width/depth approved but adjustable height kept
  unresolved.
- 7 documents remained quarantined because the exact sales model was absent
  from the rendered dimension page or an adjacent model was shown.
- 0 installation-clearance fields approved; the pilot creates no new
  `Verified Fit` claims.

| # | Category | Brand | Model | Result | Approved fields |
| ---: | --- | --- | --- | --- | --- |
| 1 | fridge | Fisher & Paykel | RF605QZUVB1 | dimensions approved | depth, height, width |
| 2 | fridge | Fisher & Paykel | RF522ADUSX5 | quarantined | none |
| 3 | fridge | Fisher & Paykel | RF610ADUSX5 | quarantined | none |
| 4 | fridge | Hisense | HRBF126 | dimensions approved | depth, height, width |
| 5 | fridge | Hisense | HRCD640TBW | dimensions approved | depth, height, width |
| 6 | dishwasher | Haier | HDW15F1B1 | partial | depth, width |
| 7 | dishwasher | Haier | HDW15F3S1 | partial | depth, width |
| 8 | dishwasher | Haier | HDW15F4B1 | partial | depth, width |
| 9 | dishwasher | Westinghouse | WSF6604XB | quarantined | none |
| 10 | dishwasher | Westinghouse | WSF6606XB | quarantined | none |
| 11 | dryer | Electrolux | EDV605H3WC | dimensions approved | depth, height, width |
| 12 | dryer | Electrolux | EDV705H3WC | dimensions approved | depth, height, width |
| 13 | dryer | LG | DVH5-08W | dimensions approved | depth, height, width |
| 14 | dryer | Samsung | DV90BB9440GB | quarantined | none |
| 15 | dryer | Westinghouse | WDV457H3WB | dimensions approved | depth, height, width |
| 16 | washing machine | Electrolux | EWF1043R7WC | dimensions approved | depth, height, width |
| 17 | washing machine | Hisense | HWFS1015E | dimensions approved | depth, height, width |
| 18 | washing machine | LG | WV9-1412W | dimensions approved | depth, height, width |
| 19 | washing machine | Samsung | WW11CG60ADLE | quarantined | none |
| 20 | washing machine | Samsung | WW12BB944DGB | quarantined | none |

## Publication Behaviour

Complete three-axis reviews publish as `Dimensions Verified`. Partial and
quarantined reviews publish as `Retailer Spec`, even if the legacy evidence
record previously used a stronger label. Product pages show the review date,
approved fields and the fact that installation clearance remains unapproved.

The reproducible inputs are:

- `data/architecture-v2/evidence-pilot.json`
- `data/architecture-v2/evidence-review-bundles.json`
- `data/architecture-v2/evidence-pilot-review-input.json`
- `data/architecture-v2/evidence-pilot-review-manifest.json`

Downloaded PDFs and rendered contact sheets are temporary review artifacts and
are not committed. Their SHA-256 values are retained in the review manifest and
the source-document registry.

## Production Verification

- Deployment commit: `c431362a`.
- RF605QZUVB1 renders `Dimensions Verified`, the three approved axes, review
  date and an explicit unapproved-clearance limitation.
- DV90BB9440GB renders `Retailer Spec`, no approved dimensions and the failed
  identity-gate explanation.
- Desktop and 390 x 844 mobile checks had zero console errors and no horizontal
  overflow.
- Sentinel checked 30 URLs with zero failures and 28,676 links with zero broken
  links; the 2,331-page graph has zero indexable orphans.
