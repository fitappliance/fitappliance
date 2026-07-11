# Architecture V2 Phase 1-7 Execution Status

Status: production cutover verified; Phase 7 observation window active
Last updated: 2026-07-11

## Phase 1 - Alias and quarantine

- Nine legacy rows remain quarantined.
- Nine alias candidates exist; none is approved.
- Tier A requires explicit manufacturer relationship evidence.
- Tier B is dimensions-only and requires regulator family linkage, an
  axis-labelled manufacturer source document, and matching ordered W/H/D from
  two independent public market hosts.
- The Energy Rating investigation is recorded under
  `reports/architecture-v2/alias-investigations/`.

## Phase 2 - Canonical identity

- `data/architecture-v2/generated/canonical-registry.json` contains 3,593 canonical
  products and 3,593 reversible legacy mappings across the runtime and
  evidence-page source sets. Ten rows are quarantined.
- Nine runtime rows remain quarantined. `ao-88474` is additionally quarantined
  in the evidence-page source set because it collides with `fridge-arf3970` on
  Westinghouse WHE6874BA while the attached source PDF fails exact-product
  evidence checks.
- Canonical IDs are deterministic and do not depend on retailer identifiers.

## Phase 3 - Retailer observations

- `data/architecture-v2/observations/retailer-observations.json` contains 183 historical
  observations across 66 products and five retailers.
- Twenty-five observations originate from Partnerize and 158 are explicitly
  marked as legacy catalog observations.
- Collection failure cannot synthesize product unavailability.
- Retailer dimensions remain hints and cannot become canonical geometry.
- New collection adapters require a reviewed host policy, rate floor, raw
  payload hash and source reference. Bing Lee is historical-only after a 403
  robots response; TGG collection is Partnerize-feed-only. AO, HN and JB remain
  disabled pending documented terms review.

## Phase 4 - Source documents

- A strict document state machine now gates discovery, fetch, hash, extraction,
  identity, parsing, review, and approval.
- The migration registry contains 2,005 legacy source records. All remain
  quarantined because the legacy records do not consistently preserve V2 page,
  quote, hash, parser, and transport provenance.
- This zero-approval baseline is intentional. Legacy `approved` labels are not
  silently grandfathered into V2.
- Every migrated document now retains its legacy product link and, when the
  product is not quarantined, its canonical product link.

## Phase 5 - Category geometry

- Category contracts exist for refrigerators, dishwashers, washing machines,
  and dryers.
- Installation, operation, service, and delivery geometry remain separate.
- Missing requirements remain null; dimensions cannot populate clearance.
- Full evidence migration remains shadow-only until source documents clear the
  V2 approval gate.
- The full-catalog audit reports 0 approved installation migrations, 2,268
  unknown installation records and zero impossible-value outliers.

## Phase 6 - FitDecision cutover

- The legacy static width verdict and V2 width decision were compared across
  2,268 products and eight cavity widths: 18,144 comparisons, zero mismatches.
- This parity result covers the legacy page generator's width semantics only.
  It does not claim parity for operation, service, delivery, or verified-fit
  semantics.
- The owner authorised production cutover on 2026-07-11. Build output and the
  canonical production host now use the V2 runtime projection.
- Desktop search, zero-result handling, mobile search, horizontal overflow and
  browser console behavior passed production QA. See
  `production-cutover-baseline.md`.

## Phase 7 - Projection and deletion preparation

- `data/architecture-v2/generated/public-catalog-projection.json` is the V2 runtime view
  for 2,259 non-quarantined products.
- `data/architecture-v2/generated/public-catalog-projection.json` is the only public
  projection: 3,520 products after 21 evidence/geometry quarantine decisions.
- Product, brand, comparison and browser outputs all consume this projection;
  1,739 products currently satisfy the evidence-page publication gate.
- Legacy IDs remain the public URL identity and each row carries its canonical
  product ID.
- The legacy runtime snapshot, dual page projection, runtime selector and
  environment-variable switch were deleted after owner approval on 2026-07-11.
- Historical identifier mappings remain in
  `data/architecture-v2/generated/historical-identifier-mappings.json` for audit and URL
  traceability.

## Rollback gate

The legacy runtime rollback was retired with owner approval on 2026-07-11.
Rollback now means reverting the Phase 7 commit and redeploying; there is no
runtime environment switch and no second production catalog.

The detailed requirement audit is in [`completion-audit.md`](./completion-audit.md).

## Phase 7 production closeout

Commit `7381c96d` was deployed and verified on 2026-07-11. Production serves
only the schema-2 V2 marker with 3,520 products. Desktop and 390 x 844 mobile
search checks passed without console errors or horizontal overflow. Sentinel
reported 30/30 URLs available, 28,676 links with zero broken links, and zero
indexable orphan pages.
