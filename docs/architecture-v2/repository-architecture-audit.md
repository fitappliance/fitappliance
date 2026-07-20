# FitAppliance Repository Architecture Audit

Status: current-code living audit
Last verified: 2026-07-20
Scope: product ingestion, manufacturer evidence, dimensions, installation
requirements, Fit decisions, generated pages, and legacy migration

## Purpose

This document preserves the architectural findings that led to Architecture V2.
It is not a claim that every file has been rewritten or every data row is
correct. It records the current system boundaries, verified baseline, known
failure modes, and decisions that future work must not silently reverse.

The active cross-cutting execution authority is the
[`FitAppliance System-First Repair Control Plan`](../superpowers/plans/2026-07-20-fitappliance-system-first-repair-control-plan.md).
`remediation-master-plan.md` is an index and may not override that plan.

## Executive Finding

FitAppliance should be progressively replaced inside the existing repository,
not rewritten as a new project. The current site has valuable production URLs,
retailer observations, manufacturer evidence, static generators, tests, and
reviewer-facing trust pages. A clean rewrite would discard provenance and create
a high-risk data migration without first resolving product identity or Fit
semantics.

The central problem is not the number of scripts. It is that source
observations, approved facts, derived geometry, Fit decisions, and public
presentation have historically been allowed to overlap. Architecture V2 creates
explicit boundaries and runs beside the legacy system until parity and evidence
gates are proven.

## Verified Baseline

Task 0 now produces a deterministic, tracked whole-system contract at
`data/architecture-v2/reviews/automated/historical-evidence-system-contract.json`.
The builder rereads tracked source artifacts, recomputes native semantic hashes,
replays target state, bounded planning, programme status, and scale control, and
then binds the complete release graph. It does not read the external evidence
drive.

The following values were reproduced in the Architecture V2 worktree on
2026-07-20 from the released 2026-07-19 artifact epoch:

| Measure | Current value |
| --- | ---: |
| Persisted contract stages | 23 |
| Independently bound policy/tool epochs | 10 |
| Historical model references | 8,089 |
| Models with document links | 1,768 |
| Models with current valid receipts | 401 |
| Cumulative recovery acceptances | 382 |
| Replacement auto-fill models | 321 |
| Unique / valid PDF graph nodes | 941 / 926 |
| Proven / mapped document-model edges | 548 / 3,761 |
| Current catalogue products | 3,515 |
| Receipt-bound dimensions | 332 |
| Receipt-bound `VERIFIED_FIT` | 0 |
| Public rows with retailer links | 1,384 |
| Retailer links missing immutable observations | 1,614 |
| Unavailable or history-only public rows | 2,131 |

Reproduce the contract and focused architecture gates with:

```bash
npm run build:historical-evidence-system-contract
node --test tests/architecture-v2/historical-evidence-system-contract.test.mjs \
  tests/architecture-v2/architecture-v2-paths.test.mjs
```

The 2026-07-11 Phase 0 snapshot recorded 2,268 runtime products, 2,259 shadow
adapters, nine quarantines, and 1,560 passing tests. Those values are retained
in Git history as the migration starting point; they are not current programme
counts.

## Current Data Flow

```mermaid
flowchart TD
  O["Retailer and registry observations"] --> R["Canonical identity and lifecycle reference"]
  B["Cumulative receipt bundle"] --> R
  R --> C["Evidence classification"]
  C --> Q["Acquisition and discovery queues"]
  Q --> E["Executable queue and family canaries"]
  E --> T["Target state and bounded planner"]
  B --> P["Architecture V2 public projection"]
  P --> H["Historical replacement projection"]
  P --> F["Fit publication audit"]
  T --> S["Stage controller"]
  H --> S
  F --> S
  P --> X["Runtime compatibility projection"]
  X --> G["Static generators and browser search"]
```

The normal catalogue build now generates the Architecture V2 public projection
before publishing the runtime compatibility catalogue. The browser-facing shape
is still legacy-compatible, and zero products currently qualify for
receipt-bound `VERIFIED_FIT`; therefore the compatibility projection must not be
described as a fully migrated Fit engine.

### Current contract gaps

The system contract deliberately records, rather than conceals, three release
gaps:

1. The 1,614 legacy retailer links are not yet bound to immutable retailer
   observations, so lifecycle still depends on legacy catalogue state. Task 2
   owns this migration.
2. Target state stores source timestamps rather than source hashes. Task 0
   supplies an external recomputed binding; Task 3 owns the schema migration.
3. `ARCHITECTURE_V2_BUILD_GRAPH` is still a partial graph. The system contract
   attests the complete current DAG, while Task 9 owns the executable release
   graph and rollback drill.

## Existing Assets Worth Preserving

- Stable public routes, canonical URLs, sitemap policy, and static deployment.
- Retailer observations and affiliate links with historical availability data.
- Manufacturer PDF files, extraction records, source URLs, and manual review
  metadata.
- Existing page generators and their regression suite.
- GSC remediation, reviewer-readiness, disclosure, business identity, and
  editorial trust work.
- Category pages, cavity pages, doorway pages, product pages, guides, and
  comparison pages that already have search history.

## Architectural Debt

### 1. Product identity is not canonical

Legacy IDs, retailer IDs, discovery IDs, GEMS identifiers, model strings, and
display names have served as interchangeable identity keys. Normalized model
strings are useful lookup keys but are not sufficient canonical identity.

Risks:

- colour or hinge variants can be attached to the wrong document;
- duplicate retailer rows can be mistaken for separate manufacturer products;
- a renamed display model can break joins;
- fuzzy matching can attach dimensions from a related model family.

Architecture V2 requires scheme-specific identifiers and exact or explicitly
approved alias mappings.

### 2. Retailer observations and manufacturer facts are mixed

Retailer feeds are useful for price, URL, availability, title, image, and a
dimension hint. They are not automatically authoritative for installation
clearance or manufacturer geometry.

The PDF pipeline now prevents known retailer-hosted evidence from taking
priority over an available manufacturer factsheet for Electrolux Group models.
This policy must become a general source-document rule rather than remain a
brand-specific branch.

### 3. PDF presence has historically been too easy to confuse with verification

A downloaded PDF proves only that bytes were retrieved. It does not prove:

- the PDF belongs to the target model;
- width, height, and depth were mapped to the correct axes;
- clearance values are installation requirements rather than diagram labels;
- the document is manufacturer-authored;
- the PDF is complete rather than an error document;
- the extracted fields are sufficient for a Fit decision.

The current strict path separates `dimensions_verified` from `verified_fit`.
Factsheets without installation clearance remain dimensions-only evidence.

### 4. Unknown clearance has been vulnerable to zero substitution

An explicit manufacturer requirement of `0 mm` is valid. Missing clearance is
unknown and must not be represented as zero in the domain model. Some legacy
pipeline schemas still need numeric placeholders, so trust metadata must prevent
those placeholders from becoming verified installation requirements.

Architecture V2 represents unknown installation values as `null` and never
promotes factsheet dimensions into clearance evidence.

### 5. Dimension axes have contained systematic inversions

The initial real shadow audit found 32 upright refrigerators whose legacy width
and height were obviously reversed. Exact manufacturer factsheets and strict
label parsing reduced that quarantine to 9 without swapping axes heuristically.

The approved method is:

1. bind a source to an exact model;
2. parse explicit `Total height`, `Total width`, and `Total depth` labels;
3. save dimensions-only evidence;
4. project the verified dimensions into the slim evidence index;
5. let the shadow adapter replace legacy axes only after identity and confidence
   checks pass.

Automatic `w/h` swapping is prohibited.

### 6. Fit logic has multiple historical representations

Legacy code contains scores, labels, clearance rules, and browser calculations
that do not yet share one authoritative contract. A high score must never
override a failed physical constraint.

Architecture V2 defines deterministic outcomes:

- `NO_FIT`
- `INSUFFICIENT_DATA`
- `CONDITIONAL_FIT`
- `LIKELY_FIT_ESTIMATED`
- `VERIFIED_FIT`

Production has not yet cut over to this engine.

### 7. Availability is a retailer observation, not a permanent product fact

The current catalog combines archived and current products, while retailer
availability can change independently. Future ingestion must retain observation
time, retailer, source URL, and status instead of overwriting one global
`available` truth.

### 8. Generated output magnifies upstream errors

One incorrect product or clearance rule can propagate into product, brand,
cavity, doorway, location, comparison, sitemap, schema, and browser-search
artifacts. Generator tests are strong compatibility protection, but they cannot
make an unverified source fact correct.

## Architecture V2 Boundaries

### Source observation

An immutable record of what a retailer, feed, manufacturer page, PDF, GEMS
record, or manual review stated at a particular time.

### Source document

A fetched document with URL, author type, transport host, retrieval time, hash,
document type, model binding, and processing state.

### Approved field evidence

One field value with model identity, document hash, page, quote, parser version,
and approval status. Approval is field-level, not document-level.

### Canonical product

A stable internal entity with explicit external identifiers. Retailer offers and
source documents link to it but do not define its identity.

### Product geometry

Separate envelopes for closed dimensions, installation requirements, operation
space, and delivery constraints. Missing values remain unknown.

### Fit decision

A deterministic evaluation of required and advisory checks. Evidence level and
physical outcome remain separate.

### Public projection

A compatibility artifact for static pages and browser search. It is generated
from approved domain state and must not become a second source of truth.

## Current Evidence Quarantine

The current historical reference contains 88 quarantined models: 69 registry
conflicts and 19 invalid-dimension records. The classification additionally
isolates source conflicts and identity ambiguity at field/model grain. The
authoritative list is generated, not copied into this document:

- `data/architecture-v2/generated/historical-appliance-reference.json`
- `data/architecture-v2/generated/historical-model-evidence-classification.json`
- `data/architecture-v2/reviews/automated/historical-evidence-target-state.json`

The nine Phase 0 rows formerly listed here were a 2026-07-11 shadow-adapter
snapshot and are not a complete current quarantine. Exact manufacturer proof or
an evidence-bound alias remains mandatory; similar dimensions, matching
capacity, colour assumptions, and sibling-model evidence are insufficient.

## Completed Architecture Ledger

| Commit | Result |
| --- | --- |
| `0b417daf` | Added explicit geometry contract. |
| `9b262688` | Added reproducible field-evidence gate. |
| `33fc102a` | Added deterministic Fit decisions and golden fixtures. |
| `70a08fdc` | Added conservative legacy shadow adapter. |
| `23dafc98` | Added deterministic real-catalog shadow audit. |
| `a3f35b61` | Recorded Phase 0 completion. |
| `902c0a32` | Added exact Electrolux Group factsheet ingestion. |
| `2057cacd` | Added verified dimension overlay in shadow mode. |
| `1e79081b` | Added exact factsheet fallback and official-source priority. |
| `b308983e` | Added seven additional exact group dimension records. |
| Task 0 (2026-07-20) | Added a deterministic 23-stage, 10-epoch system contract and current-code audit. |

The commit ledger is supporting evidence, not a substitute for this audit or
the remediation plan.

## Non-Negotiable Guardrails

1. Do not derive canonical identity from mutable display text.
2. Do not fuzzy-match a PDF to a model.
3. Do not treat a retailer feed as manufacturer clearance evidence.
4. Do not represent unknown domain values as zero.
5. Do not convert dimensions-only evidence into `verified_fit`.
6. Do not auto-swap width and height.
7. Do not approve a sibling model without an explicit alias record.
8. Do not change production Fit labels before shadow parity is measured.
9. Do not rewrite public URLs as part of the domain migration.
10. Do not remove legacy paths until rollback artifacts and parity gates pass.

## Related Documents

- [`Architecture V2 Phase 0 Design`](../superpowers/specs/2026-07-11-architecture-v2-phase0-design.md)
- [`Architecture V2 Phase 0 Plan`](../superpowers/plans/2026-07-11-architecture-v2-phase0.md)
- [`Data Accuracy Audit`](../data-accuracy-audit.md)
- [`PDF Evidence Audit`](../pdf-evidence-audit.md)
- [`Manual Evidence Pipeline`](../manual-evidence-pipeline.md)
- [`Retailer Data Expansion Plan`](../retailer-data-expansion-plan.md)
