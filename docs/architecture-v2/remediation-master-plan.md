# Architecture V2 Remediation Master Plan

Status: strategic migration baseline; active cross-cutting execution is
controlled by the
[`2026-07-20 system-first repair plan`](../superpowers/plans/2026-07-20-fitappliance-system-first-repair-control-plan.md)
Last updated: 2026-07-21
Decision owner: FitAppliance repository
Audit baseline: [`repository-architecture-audit.md`](./repository-architecture-audit.md)
Canonical product/data strategy: [`../product-core-brief.md`](../product-core-brief.md)

This document governs the progressive Architecture V2 migration. The product
brief governs product positioning, source roles, external-data research,
installation-knowledge scope, Fit outcome semantics, and the post-migration
roadmap. If an older task or phase document conflicts with the locked principles
in the product brief, the conflict must be resolved explicitly rather than
silently reviving a legacy default or publication path.

## Objective

Replace FitAppliance's overlapping legacy identity, evidence, geometry,
availability, and Fit logic with one evidence-backed domain model while
preserving production routes, static deployment, retailer history, and rollback
capability.

This is a progressive migration. No phase may claim production completion just
because its unit tests pass. Every cutover requires real catalog audit results,
generated artifact checks, and browser/runtime verification.

## Definition of Done

Architecture V2 is complete only when:

- every public product resolves to one canonical product or an explicit
  quarantine record;
- retailer observations are timestamped and separated from manufacturer facts;
- source documents have reproducible identity and lifecycle state;
- promoted dimensions and installation requirements have field-level evidence;
- category geometry includes applicable installation, operation, service, and
  delivery constraints without invented values;
- production Fit outcomes come from the deterministic V2 engine;
- generated pages and browser search consume one public projection;
- legacy calculation and evidence paths are removed after a measured rollback
  window;
- full tests, schema validation, shadow parity, and production browser checks
  remain green.

## Status Summary

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Domain contracts and read-only shadow audit | Complete |
| 1 | Verified dimension overlay and quarantine reduction | Guardrails complete; 9 pending |
| 2 | Canonical identity mapping | Shadow registry complete |
| 3 | Retailer observation ledger and current-sale reconciliation | Typed adapters and replay complete; cutover blocked by 79 unresolved prior-current products |
| 4 | Source-document registry and PDF evidence state machine | State machine and quarantine baseline complete |
| 5 | Category geometry and clearance migration | Contracts complete; evidence migration pending |
| 6 | FitDecision parity and production cutover | Safety audit passes with zero violations; lifecycle cutover not authorised |
| 7 | Runtime modularization and legacy deletion | Canonical views wired; deletion prohibited while Task 9 is blocked |

### Current system-first release gate

Tasks 0-8 of the active system-first control plan are complete. Task 9 has
passed the available-source runs, full evidence replay, offline builds,
deterministic rebuild, safety projection, and rollback-baseline checks, but its
lifecycle prerequisite is still `BLOCKED`. The 3,515-product shadow resolves
348 current and 3,088 archived products while preserving 79 as unknown. No
production cutover, deployment, or legacy deletion is authorised.

The unresolved set has independent owners and must not be collapsed into one
generic retry queue:

- 76 products require an authorised source or explicit automation permission;
- one product requires the already-proven identity merge to be applied only
  as part of an atomic lifecycle/canonical cutover;
- LG `GS-B655PL` requires authorised exact-model discovery after a sibling AO
  response;
- Fisher & Paykel `RF730QZUVX1` conflicts with captured `RF730QZUVB1` retailer
  listings and requires exact-model rediscovery before any identity mutation.

Seventeen of 18 identity mismatch cases have been automatically adjudicated
from raw-bound retailer evidence and official AU identity snapshots. The
remaining conflict is explicitly excluded from migration. The released registry
remains at 3,515 products; the 3,514-product migration candidate is a separate
control artifact and must not leak into the released public epoch.

The branch may retain the lifecycle-neutral safety projection because it only
removes unsupported legacy door fields. It is not evidence that the lifecycle
migration is complete.

## Completed Work

### Phase 0: Domain kernel and shadow audit

Completed deliverables:

- canonical and shadow identity contracts;
- explicit geometry with unknown-value preservation;
- field-level evidence approval gate;
- deterministic FitDecision outcomes and golden fixtures;
- conservative legacy adapter;
- deterministic full-catalog shadow audit;
- proof that production artifacts remained unchanged.

Detailed implementation record:
[`../superpowers/plans/2026-07-11-architecture-v2-phase0.md`](../superpowers/plans/2026-07-11-architecture-v2-phase0.md).

### Phase 1 baseline: verified dimensions in shadow mode

Completed deliverables:

- exact Electrolux, Kelvinator, and Westinghouse factsheet endpoint support;
- strict official endpoint, brand, model, and PDF checks;
- explicit `Total height`, `Total width`, and `Total depth` parsing;
- dimensions-only trust when clearance is absent;
- retailer-hosted source demotion when an official source is available;
- verified dimensions in the slim runtime evidence index;
- exact identity and confidence checks before shadow geometry override;
- quarantine reduction from 32 to 9 without heuristic axis swapping.

Acceptance evidence:

- 2,268 rows audited;
- 2,259 adapted and 9 quarantined;
- 331 shadow products use verified official dimensions;
- 1,560 tests pass;
- schema audit checks 2,348 pages and 7,193 blocks with zero errors.

## Phase 1: Finish Dimension Quarantine

Detailed execution plan:
[`phase1-quarantine-alias-plan.md`](./phase1-quarantine-alias-plan.md).

### Goal

Resolve each of the remaining nine rows through exact evidence or an explicit
reviewed alias. A non-resolution is acceptable; an unsupported inference is not.

### Tasks

- [ ] Create an alias registry with source model, target model, manufacturer
  proof, affected fields, reviewer, date, and status.
- [ ] Search manufacturer support APIs, archived official pages, installation
  manuals, energy-registration documents, and packaging labels for exact model
  references.
- [ ] Add OCR only when the official PDF is image-based and exact identity can
  still be proven.
- [ ] Keep retailer dimensions as `retailer_spec` when no manufacturer source is
  available.
- [ ] Add one regression fixture for every approved alias family.
- [ ] Re-run shadow audit and record the new baseline in both architecture docs.

### Acceptance gate

- Every repaired row has exact or approved-alias field evidence.
- No repaired row derives clearance from dimensions-only evidence.
- Remaining unresolved rows stay quarantined with a stable reason.
- Full test and schema gates pass.

## Phase 2: Canonical Identity Mapping

### Goal

Create one durable canonical product identity independent of retailer and legacy
IDs.

### Tasks

- [ ] Inventory all identifier schemes: legacy runtime ID, manufacturer model,
  retailer product ID, feed SKU, GEMS registration, GTIN/EAN, and approved alias.
- [ ] Generate candidate clusters using exact identifiers only.
- [ ] Quarantine collisions, reused model strings, and ambiguous authority.
- [ ] Create a versioned canonical mapping artifact with migration provenance.
- [ ] Link source documents and retailer observations to canonical IDs.
- [ ] Preserve legacy IDs as external identifiers for URL and rollback support.
- [ ] Add duplicate, collision, alias, and rename fixtures.

### Deliverables

- canonical product registry;
- identifier mapping registry;
- conflict report and manual review queue;
- deterministic migration command;
- compatibility projection back to legacy IDs.

### Acceptance gate

- No duplicate canonical IDs.
- No automatic fuzzy identity approvals.
- Every active public row maps once or is quarantined.
- Re-running the mapper is deterministic and does not mutate source inputs.

## Phase 3: Retailer Observation Ledger

### Goal

Represent current-sale lists, retailer URLs, prices, availability, titles,
images, and dimension hints as timestamped observations rather than canonical
facts.

### Tasks

- [ ] Define an immutable observation schema with retailer, observed time,
  product identifier, URL, status, price, title, image, and raw source reference.
- [ ] Build source adapters for the selected major Australian appliance
  retailers and approved affiliate feeds.
- [ ] Separate collection, normalization, identity resolution, and publication.
- [ ] Preserve raw feed rows and HTTP evidence for reproducibility.
- [ ] Add stale, unavailable, redirected, duplicate, and relisted states.
- [ ] Reconcile current-sale lists per retailer without deleting historical
  observations.
- [ ] Add rate limits, retry policy, robots/terms review, and failure reporting.

### Acceptance gate

- A retailer outage cannot mark all products permanently unavailable.
- Availability always has retailer and observation time.
- Retailer dimensions remain hints until separately approved.
- Reconciliation is idempotent and produces a human-readable delta report.

## Phase 4: Source-Document Registry and PDF State Machine

### Goal

Replace brand-specific “download and parse” success flags with a common,
reproducible document lifecycle.

### Required states

```text
discovered -> fetched -> hashed -> text_extracted -> identity_matched
           -> fields_parsed -> reviewed -> approved

Any state may transition to rejected or quarantined with a reason.
```

### Tasks

- [ ] Register source URL, final URL, author type, transport host, content type,
  retrieval time, hash, page count, and parser version.
- [ ] Detect HTML/error documents returned with PDF-like endpoints.
- [ ] Deduplicate identical documents by hash without merging product identity.
- [ ] Store exact, alias, family, ambiguous, and mismatch identity outcomes.
- [ ] Capture page and quote for every promoted field.
- [ ] Add OCR as a controlled extraction stage with confidence and rendered-page
  verification.
- [ ] Consolidate brand-specific resolvers behind a common adapter contract.
- [ ] Preserve candidates without promoting them to approved evidence.

### Acceptance gate

- A PDF cannot become approved because it downloaded successfully.
- Every promoted field is reproducible from document hash, page, quote, and
  parser version.
- Error PDFs such as the current `WHE6874BA` factsheet are rejected.
- Retailer-hosted and manufacturer-hosted documents retain distinct trust.

## Phase 5: Category Geometry and Installation Requirements

### Goal

Move from generic `w/h/d + clearance` to category-specific physical contracts.

### Shared geometry

- closed product envelope;
- installation envelope;
- operation envelope;
- service and plumbing envelope;
- delivery envelope;
- adjustable ranges and removable components.

### Category priorities

1. Refrigerators: ventilation, hinge side, door opening, plumbing, handle depth,
   and cabinet proud requirements.
2. Dishwashers: niche size, hoses, rear services, door opening, and benchtop
   constraints.
3. Washing machines and dryers: hoses, taps, drain, door, stacking, and heat
   ventilation.
4. Ovens and other built-ins: cut-out geometry, electrical/gas services, and
   ventilation.

### Tasks

- [ ] Define required, optional, and non-applicable fields per category.
- [ ] Migrate manufacturer clearance from approved field evidence only.
- [ ] Separate exact requirements from project-wide estimates.
- [ ] Add category-specific golden fixtures and impossible-value audits.
- [ ] Compare V2 requirements against legacy calculations without changing
  production output.

### Acceptance gate

- Unknown is never converted to zero.
- A dimension fact cannot populate a clearance field.
- Applicable operation/service constraints are represented in Fit checks.
- Every category can produce `INSUFFICIENT_DATA` honestly.

## Phase 6: FitDecision Shadow Parity and Cutover

### Goal

Make the V2 deterministic decision the single production Fit outcome.

### Tasks

- [ ] Run V2 and legacy decisions side by side for representative cavities.
- [ ] Classify disagreements as legacy defect, V2 defect, evidence difference,
  or intentional semantic change.
- [ ] Add disagreement fixtures before changing logic.
- [ ] Define public copy for every V2 outcome and evidence level.
- [ ] Keep ranking separate from physical pass/fail checks.
- [ ] Add browser tests for search, result cards, details, zero-result paths, and
  mobile/desktop layouts.
- [ ] Release behind a reversible projection or feature flag.

### Acceptance gate

- Any hard-axis failure returns `NO_FIT`.
- Unknown required geometry returns `INSUFFICIENT_DATA`.
- `VERIFIED_FIT` requires verified dimensions and installation requirements.
- Production screenshots and real browser flows match the approved copy and
  evidence state.
- Rollback can restore the previous projection without data loss.

## Phase 7: Public Projection and Legacy Deletion

### Goal

Remove duplicated legacy logic only after V2 has operated successfully through
the rollback window.

### Tasks

- [ ] Generate one stable public catalog projection from canonical state.
- [ ] Move browser search and all page generators to the same projection.
- [ ] Remove duplicate clearance and Fit calculations module by module.
- [ ] Retain migration maps and raw observations as historical artifacts.
- [ ] Update contributor instructions and operational runbooks.
- [ ] Archive obsolete reports instead of leaving ambiguous active copies.

### Acceptance gate

- No generator or browser module reads a removed legacy source.
- Canonical URLs, sitemap membership, and redirect policy remain correct.
- Full tests, schema validation, browser QA, and production smoke checks pass.
- The rollback window has completed with no unresolved severity-1 data issue.

## Cross-Phase Quality Gates

Every coherent implementation batch must run the smallest focused tests first,
then the relevant subset of these gates:

```bash
npm run test:architecture-v2
npm test -- --runInBand
npm run build-evidence-index
node scripts/architecture-v2/shadow-audit.mjs
npm run validate-schema
git diff --check
```

For changes that affect generated pages or browser behavior, also run the
relevant generator and browser screenshot/interaction checks before completion.

## Change-Control Rules

- Keep source data, derived state, and generated artifacts in separate commits
  when practical.
- Record each completed batch in the implementation ledger below.
- Update the audit baseline when counts or quarantine reasons change.
- Do not mark a phase complete while required production verification remains.
- Do not merge unrelated dirty files from the main worktree.
- Do not store secrets, authenticated cookies, or private feed credentials in
  repository evidence.

## Implementation Ledger

| Date | Commit | Phase | Verified result |
| --- | --- | --- | --- |
| 2026-07-11 | `0b417daf` through `a3f35b61` | 0 | Domain kernel, shadow adapter, real catalog audit, compatibility verification. |
| 2026-07-11 | `902c0a32` | 1/4 | Exact Electrolux Group factsheet resolver and four Kelvinator records. |
| 2026-07-11 | `2057cacd` | 1 | Field-level official dimensions projected into shadow geometry. |
| 2026-07-11 | `1e79081b` | 1/4 | Official factsheet fallback and retailer-source precedence correction. |
| 2026-07-11 | `b308983e` | 1 | Seven additional exact dimension records; quarantine reached 9. |
| 2026-07-11 | `d742e71e` | 1 | Frozen nine-row baseline and immutable pending/approved alias registry. |
| 2026-07-11 | `1b787822` | 1 | Field evidence requires registry-backed alias approval; alias audit reports 8 pending and 1 no-source quarantine. |

Future batches must append a row with the measured audit result, not only a
description of code changes.

## Immediate Next Actions

1. Add a verified acquisition receipt for Partnerize source time, then capture
   and replay a new authorised feed epoch; identical old bytes cannot refresh
   lifecycle state.
2. Correct the three known canonical model identities with exact official AU
   evidence and rebuild their retailer-link bindings. Do not use an alias to
   transfer availability.
3. Obtain authorised feeds or explicit automation permission for Bing Lee,
   Harvey Norman, and JB Hi-Fi. Until then, preserve those products as unknown
   and hidden from current results.
4. Rediscover the exact LG `GS-B655PL` source and keep the sibling response
   quarantined.
5. Rerun the complete release DAG. Authorise cutover only when the shadow is
   `READY`, every prior-current ID has a safe disposition, two builds are
   semantically identical, and the whole-release rollback drill passes.
