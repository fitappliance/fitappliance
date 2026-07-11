# Phase 9 Space Evidence Pilot Report

Status: production verified
Reviewed: 2026-07-11

## Scope

Phase 9 audited the ten Phase 8 documents that already had exact model identity
and complete approved width, height and depth fields. It did not search sibling
models or add new PDFs. Installation, operation and service space were reviewed
as separate field families.

## Results

- Documents audited: 10
- Documents with approved space fields: 5
- Documents with an explicit no-candidate outcome: 5
- Approved installation fields: 16
- Approved operation fields: 2
- Approved service fields: 0
- New V2 `verified_fit` promotions: 0

Approved models:

| Model | Approved installation fields | Approved operation fields |
| --- | --- | --- |
| Fisher & Paykel RF605QZUVB1 | left 20 mm, right 20 mm, top 20 mm, rear 30 mm | none |
| Hisense HRBF126 | left 50 mm, right 50 mm, top 100 mm, rear 50 mm | none |
| Hisense HRCD640TBW | left 50 mm, right 50 mm, top 100 mm, rear 50 mm | none |
| LG DVH5-08W | top 20 mm | door-open total depth 1115 mm |
| LG WV9-1412W | left 20 mm, right 20 mm, rear 100 mm | door-open total depth 1135 mm |

The remaining Electrolux, Westinghouse and Hisense fact sheets did not contain
an explicit numeric installation, operation or service-space field that passed
the semantic gate.

## Semantic decisions

- `Sides` and `each side` may populate both left and right only when that label
  is present in the page quote.
- LG `D''` values were approved only after the rendered diagrams visibly
  terminated at the open appliance door.
- `D''` remains total door-open depth. It was not converted into a swing delta.
- Missing front clearance remains `null`; it was not filled with zero.
- General prose such as keeping the rear away from a wall or ensuring service
  access was not converted into a numeric field.

## Architecture outcome

The five partial-space products expose approved values under
`evidence.v2_review.approved_space_values`. All ten complete-dimension pilot
products now have `geometry_v2`; unapproved installation, operation and service
fields remain `null`.

For RF605QZUVB1, FitDecision can evaluate width and height from approved facts,
but depth remains `UNKNOWN` because `installation.frontMm` is absent. The
outcome is therefore `INSUFFICIENT_DATA`, not `VERIFIED_FIT`.

The full public catalog still contains legacy `verified_fit` labels from the
pre-V2 evidence system. Phase 9 did not add to that count and does not treat
those historical labels as V2 field approval.

## Provenance correction

The audit found stale transport-host classification for official Hisense, LG
and Haier asset domains. A shared classifier now recognises `hisense.com`,
`lge.com` and `haier.com.au` manufacturer subdomains while retaining retailer
mirrors such as Appliances Online as retailer transport. Document authorship
and exact identity remain separate approval gates.

## Verification

- Architecture V2: 118 tests passed, 0 failed.
- Full repository: 1568 tests passed, 0 failed.
- Schema: 2331 pages, 7138 JSON-LD blocks, 0 errors.
- Desktop RF605QZUVB1: no overflow, no console errors, partial fields visible.
- Mobile 390 x 844 LG WV9-1412W: no overflow, no console errors, door-open total
  depth shown as 1135 mm.

## Production verification

- Commit: `3f025f72`.
- Vercel deployment: `dpl_HuUGrCyMeTLcRmbGcU8Piv7EHb9u`, Ready and aliased to
  `www.fitappliance.com.au`.
- Production RF605QZUVB1 JSON retains `installation.frontMm: null` and exposes
  four approved installation fields.
- Production LG WV9-1412W at 390 x 844 shows the approved 1135 mm door-open
  total depth with no horizontal overflow or console errors.
- Sentinel: 30 URLs checked with zero failures; 28,676 links checked with zero
  broken links; 2,331 pages with zero indexable orphans.
