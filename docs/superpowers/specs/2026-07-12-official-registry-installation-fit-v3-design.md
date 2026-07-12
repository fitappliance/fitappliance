# Official Registry, Installation Knowledge, and Fit V3 Design

**Date:** 2026-07-12
**Status:** Approved for implementation
**Scope:** A shadow-only pilot for 50 currently listed refrigerators and 50 currently listed dishwashers

## Decision

FitAppliance will add a multi-source evidence broker beside the existing PDF and Fit V2 pipeline. Government registries improve Australian model identity, market status, and candidate dimensions, but they do not replace exact-model manufacturer installation evidence. The pilot must not change public dimensions, trust labels, or fit outcomes until a separate publication gate proves field-level agreement and complete provenance.

The pilot covers refrigerators and dishwashers because together they exercise the hardest placement and installation constraints: closed dimensions, adjustable height, ventilation, door operation, plumbing, drainage, power location, and rear service space.

## Source Roles

| Source | Permitted role | Prohibited role |
| --- | --- | --- |
| Retailer and affiliate feeds | Current listing, price, retailer SKU, product URL | Manufacturer installation truth |
| Energy Rating register | Australian identity, registration and availability signals, candidate W/H/D | Blindly overwriting catalog or PDF dimensions |
| WELS register | Dishwasher identity, variant and registration/status corroboration | Clearance, service-space, drainage-route or electrical claims |
| EESS | Responsible supplier and electrical identity corroboration | Product geometry or installation envelope |
| GS1 NPC, Icecat, direct brand feed | Candidate product-master fields and assets, subject to licence and AU SKU coverage | Publication before rights, identity and field provenance are proven |
| Exact-model official PDF, HTML, CAD or technical sheet | Manufacturer installation and operation truth for explicitly supported fields | Sharing fields across family or suffix variants without alias evidence |

No source is globally authoritative. Authority is field-scoped. A source that proves model registration does not prove clearance; a source that proves a dimension does not prove current retail availability.

## Non-negotiable Invariants

1. Raw source bytes are immutable and SHA-256 bound to source URL, retrieval time, media type, licence record, parser version and derived artifacts.
2. Full raw CSV, Excel, PDF and rendered files live under `FITAPPLIANCE_STORAGE_ROOT`, normally `/Volumes/UGREEN-1TB/FitAppliance`; normal tests, builds and deploys must work without the drive.
3. Repository artifacts contain policy, source manifests, hashes, normalized summaries, the frozen pilot reconciliation slice, deterministic pilot queues and small attributed fixtures. Full-source and full-reconciliation objects remain in external content-addressed storage.
4. Brand normalization may use the existing canonical brand map. Model normalization may remove cosmetic separators and case only; it may not remove suffixes, regional tokens, hinge/colour markers or family numbers.
5. Government W/H/D are observations, not accepted geometry. Axis labels, original values, units and source row identity remain available for replay.
6. Registry records with duplicate exact model keys and conflicting dimensions are quarantined as `REGISTRY_INTERNAL_CONFLICT`.
7. A dimension mismatch never resolves by majority vote or source rank alone. It creates a field conflict and an exact-model evidence research task.
8. `null` means unknown. Missing clearances, service spaces, water, power, drain or ventilation requirements never become zero, false or generic brand defaults.
9. The pilot is shadow-only. It cannot write `data/catalog-final.json`, the public projection, top-level legacy dimensions, `geometry_v2`, or public fit labels.
10. `VERIFIED_FIT` requires exact-model, receipt-bound evidence for every applicable hard condition plus sufficient site inputs. A registry match or complete W/H/D can never produce it.

## Snapshot Contract

Every external registry acquisition produces one immutable snapshot manifest:

```json
{
  "schemaVersion": 1,
  "sourceId": "energy-rating:fridge",
  "sourceUrl": "https://...",
  "retrievedAt": "2026-07-12T00:00:00.000Z",
  "contentSha256": "...",
  "byteLength": 123,
  "mediaType": "text/csv",
  "licence": {
    "name": "Creative Commons Attribution 3.0 Australia",
    "url": "https://creativecommons.org/licenses/by/3.0/au/",
    "attribution": "Commonwealth of Australia"
  },
  "storage": {
    "rootEnv": "FITAPPLIANCE_STORAGE_ROOT",
    "objectPath": "objects/sha256/ab/cd/..."
  }
}
```

An unknown or incompatible licence blocks persistence beyond a temporary research cache and blocks downstream publication. Source discovery metadata and payload bytes receive separate hashes.

## Normalized Registry Observation

Each source row becomes a lossless observation with:

- source, snapshot hash, source row number and stable row fingerprint;
- raw and canonical brand;
- raw and comparison model keys;
- exact registration/status/market fields available from the source;
- width, height and depth as independently labelled observations;
- raw values, units and any numeric conversion;
- quality flags such as missing axis, implausible range, suspected W/H swap, duplicate registration, or conflicting exact-model row;
- no accepted catalog field and no public trust level.

CSV parsing must support quoted commas, escaped quotes, CRLF and quoted multiline fields. Parsing a malformed row fails the snapshot or records a named row error; it must not shift columns silently.

## Reconciliation State Machine

Catalog-to-registry reconciliation is deterministic and exact-model only:

| State | Meaning | Action |
| --- | --- | --- |
| `EXACT_CONSISTENT` | One exact key, no registry conflict, dimensions agree within explicit tolerance | Keep as corroborating candidate evidence |
| `EXACT_DIMENSION_CONFLICT` | Exact identity but one or more axes disagree | Queue exact official installation evidence; no overwrite |
| `EXACT_NO_DIMENSIONS` | Exact identity but registry lacks usable W/H/D | Use identity/status only |
| `REGISTRY_INTERNAL_CONFLICT` | Exact registry key has incompatible records | Quarantine registry fields and investigate registration variants |
| `AXIS_SUSPECT` | Values are plausible only after an unproven axis permutation | Preserve raw values and seek exact official evidence |
| `NO_EXACT_REGISTRY_MATCH` | No exact brand/model key | Try WELS/EESS/product-master identity sources; never fuzzy-publish |
| `CATALOG_IDENTITY_AMBIGUOUS` | Catalog identity cannot map to one canonical product | Exclude from pilot publication and create identity task |

Tolerance is a comparison aid, not a mutation rule. The report records exact differences and the policy version used.

## Deterministic 100-model Pilot

The selector freezes 50 refrigerators and 50 dishwashers from the current public catalog. A product is currently listed when it is not marked unavailable, is not explicitly out of stock, and has at least one retailer URL verified within 90 days of the source snapshot. Selection uses stable sorting and a per-brand cap to avoid allowing one large brand to dominate.

Each category targets three strata:

- 20 `EXACT_CONSISTENT` models to validate the clean path;
- 15 conflict or registry-internal-conflict models to validate investigation and fail-closed behavior;
- 15 exact-without-dimensions or no-exact-match models to validate WELS, direct-brand and PDF recovery paths.

If a stratum has fewer candidates, the deficit is filled from the next highest-risk stratum and recorded in `selectionShortfalls`. Once generated, the pilot is frozen by canonical product ID and source snapshot hashes; reruns validate it rather than silently replacing products.

## Installation Knowledge Contract

Installation knowledge is split into three layers:

1. `normativeRule`: standards and general safety requirements. It can produce warnings but cannot create a model-specific measurement.
2. `modelRequirement`: exact-model manufacturer evidence. It can satisfy applicable Fit hard conditions when receipt-bound.
3. `siteObservation`: user measurements and connection locations, including measurement uncertainty.

The model requirement schema covers:

- `closedEnvelope`: width, adjustable height range and depth variants;
- `installationClearance`: left, right, top, rear and front working clearance;
- `operationEnvelope`: door-open depth, hinge-side space, door/lid opening angle and drawer/rack withdrawal;
- `ventilation`: rear/top/side gaps, grille/open-area or room-volume requirements;
- `waterConnection`: required/optional, inlet position, hose reach, pressure and isolation access;
- `powerConnection`: supply requirements, plug/socket location, lead reach and prohibition zones;
- `drainConnection`: required route, hose reach, standpipe/spigot height range and high-loop requirement;
- `deliveryEnvelope`: packaged dimensions, weight, doorway/path requirements and removable components;
- `professionalInstallation`: conditions that require a licensed trade or manufacturer procedure.

Every leaf is independently receipt-bound to URL, artifact hash, page or DOM locator, quote/fragment hash, exact applicable models, extraction policy and confidence class. Brand-level knowledge may guide search but cannot populate model fields.

## Fit V3 Shadow Decision

Fit V3 extends, rather than replaces, the outcome-first Fit V2 engine. It evaluates named hard checks and returns all evidence and input gaps.

- `NO_FIT`: at least one applicable hard condition fails.
- `INSUFFICIENT_DATA`: placement cannot be assessed because a required product or site value is unknown.
- `CONDITIONAL_FIT`: placement passes, but an applicable operation, service, connection or professional-installation condition is unresolved.
- `LIKELY_FIT_ESTIMATED`: all tested hard conditions pass, but at least one accepted input is explicitly estimated.
- `VERIFIED_FIT`: all applicable hard conditions pass using current exact-model receipts and sufficiently precise site observations.

The evaluator checks cavity axes, adjustable-height maximum, front working space, door operation, ventilation, rear services, inlet reach/location, drainage route/height, socket location/lead reach, delivery path and declared measurement uncertainty. A numeric score may rank products only inside the same outcome and evidence-completeness band.

The shadow artifact records current Fit V2 and Fit V3 side by side. Any unexplained disagreement is an audit failure; no V3 result reaches the public projection during this pilot.

## Research and Commercial Channel Queue

For each missing or conflicting field, the queue records the next bounded evidence action rather than a generic web-search task:

1. exact AU manufacturer product page and downloadable installation/QRG/spec assets;
2. official support/download endpoint, product API, sitemap or trade portal;
3. WELS/Energy/EESS exact identity and status corroboration;
4. GS1 NPC and Icecat AU exact-SKU coverage probe with rights assessment;
5. direct request to brand PIM, e-commerce, trade/specification or data-governance contact;
6. quarantine with a terminal reason when no reliable path remains.

The channel matrix records expected fields, exact-AU-SKU coverage, refresh cadence, redistribution/display rights, attribution, cost, sample results and decision. No paid source is adopted before a measured sample.

## Acceptance Criteria

1. Every ingested source snapshot is hash-, licence- and retrieval-bound and replayable from external storage.
2. Real Energy Rating fixtures for known axis/mismatch cases produce conflicts, never silent W/H/D replacement.
3. WELS is represented as a separate identity/status source and cannot satisfy geometry fields.
4. The selector deterministically freezes 50 current refrigerators and 50 current dishwashers with no duplicate canonical IDs and documented stratum shortfalls.
5. All 100 queue entries name exact missing fields and the next evidence route.
6. Installation knowledge rejects unknown-to-zero, brand-default and mixed-model field donation.
7. Fit V3 returns check-level reasons and cannot emit `VERIFIED_FIT` without complete receipt and site-input gates.
8. Existing public catalog, public Fit outcomes and production build hashes remain unchanged by shadow generation.
9. Focused tests, relevant Architecture V2 regressions, lint, build and publication audits pass.
10. The production deployment remains healthy and a live check confirms no pilot artifact is exposed as a public claim.
