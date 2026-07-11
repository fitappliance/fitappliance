# Architecture V2 Phase 1-7 Execution Status

Status: pre-cutover checkpoint
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

- `data/architecture-v2/canonical-registry.json` contains 2,259 canonical
  products, 2,259 reversible legacy mappings, and nine quarantine rows.
- The current catalog has no exact brand/model/category collision.
- Canonical IDs are deterministic and do not depend on retailer identifiers.

## Phase 3 - Retailer observations

- `data/architecture-v2/retailer-observations.json` contains 183 historical
  observations across 66 products and five retailers.
- Twenty-five observations originate from Partnerize and 158 are explicitly
  marked as legacy catalog observations.
- Collection failure cannot synthesize product unavailability.
- Retailer dimensions remain hints and cannot become canonical geometry.

## Phase 4 - Source documents

- A strict document state machine now gates discovery, fetch, hash, extraction,
  identity, parsing, review, and approval.
- The migration registry contains 2,005 legacy source records. All remain
  quarantined because the legacy records do not consistently preserve V2 page,
  quote, hash, parser, and transport provenance.
- This zero-approval baseline is intentional. Legacy `approved` labels are not
  silently grandfathered into V2.

## Phase 5 - Category geometry

- Category contracts exist for refrigerators, dishwashers, washing machines,
  and dryers.
- Installation, operation, service, and delivery geometry remain separate.
- Missing requirements remain null; dimensions cannot populate clearance.
- Full evidence migration remains shadow-only until source documents clear the
  V2 approval gate.

## Phase 6 - FitDecision cutover preparation

- The legacy static width verdict and V2 width decision were compared across
  2,268 products and eight cavity widths: 18,144 comparisons, zero mismatches.
- This parity result covers the legacy page generator's width semantics only.
  It does not claim parity for operation, service, delivery, or verified-fit
  semantics.
- Production still uses the legacy projection. Cutover requires owner approval.

## Phase 7 - Projection and deletion preparation

- `data/architecture-v2/public-catalog-projection.json` is a non-production V2
  projection for 2,259 non-quarantined products.
- Legacy IDs remain the public URL identity and each row carries its canonical
  product ID.
- No legacy runtime path has been deleted. Deletion must wait for production
  cutover, browser QA, and the rollback window.

## Owner decision gate

The next irreversible-looking step is still reversible in implementation, but
changes public behavior: wire generators and browser search to the V2
projection behind a feature flag, deploy, run mobile/desktop browser QA, and
start the rollback window. Do not perform this step without explicit owner
confirmation.
