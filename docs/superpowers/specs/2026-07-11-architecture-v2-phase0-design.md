# Architecture V2 Phase 0 Design

## Decision

FitAppliance will use incremental replacement inside the existing repository.
The production URL estate, static deployment, raw source records, reviewer pages,
and current runtime projection remain in place. A new domain kernel will run in
shadow mode until its contracts are proven against explicit fixtures and legacy
data.

This phase does not change production search results, generated pages, sitemap
membership, retailer links, evidence tiers, or Fit labels.

## Problem

The repository currently mixes four concerns:

1. Source observations from retailers, GEMS, and manufacturer documents.
2. Derived catalog facts and evidence tiers.
3. Fit and clearance calculations.
4. Generated public pages and browser presentation.

The same product identity, evidence, clearance, and Fit concepts are derived in
multiple scripts and browser modules. The existing tests protect many visible
contracts, but they do not provide one authoritative domain model.

## Goals

- Define immutable canonical product identity independently of retailer IDs,
  GEMS registration IDs, discovery IDs, and legacy runtime IDs.
- Represent measurements and installation requirements without converting
  unknown values to zero.
- Require field-level evidence before facts can be promoted as verified.
- Produce one structured Fit decision with per-check PASS, FAIL, or UNKNOWN.
- Adapt legacy runtime rows into the new model without changing legacy files.
- Run a deterministic shadow audit over the current catalog.
- Establish golden contract fixtures before any production cutover.

## Non-goals

- No retailer crawling or feed reconciliation changes.
- No PDF discovery, download, OCR, or extraction changes.
- No catalog rewrite or automatic repair of legacy data.
- No browser UI, static page, URL, redirect, sitemap, or service-worker changes.
- No framework migration and no database introduction.
- No removal of old Fit, clearance, evidence, or generation code.

## Global Invariants

1. Unknown is represented as `null` or an UNKNOWN check, never numeric zero.
2. Canonical product IDs are opaque and never derived from mutable display text.
3. Source identifiers retain their scheme and normalized source value.
4. Retailer observations are not manufacturer evidence.
5. Approved field evidence requires document hash, page, quote, parser version,
   and an identity match to the canonical product.
6. A failed hard constraint always yields `NO_FIT`.
7. An unknown required hard constraint yields `INSUFFICIENT_DATA`.
8. `VERIFIED_FIT` requires verified dimensions, verified installation
   requirements, and no failed or unknown required checks.
9. Evidence confidence and Fit outcome are separate concepts.
10. Phase 0 output is diagnostic only and cannot overwrite public data.

## Domain Boundaries

### Canonical identity

`CanonicalProduct` owns the stable internal ID, category, display brand, display
model, and a list of external identifiers.

```js
{
  id: 'fa_00000001',
  category: 'fridge',
  brand: 'Fisher & Paykel',
  model: 'RF505ANUX1',
  identifiers: [
    {
      scheme: 'legacy_runtime_id',
      value: 'fridge-fisher-paykel-rf505anux1',
      authority: 'fitappliance'
    },
    {
      scheme: 'manufacturer_model',
      value: 'RF505ANUX1',
      authority: 'fisher-paykel'
    }
  ]
}
```

Identifiers are compared only within the same scheme. Normalization may trim,
case-fold, and remove formatting that a scheme explicitly declares irrelevant;
it must not perform fuzzy product matching. Multiple identifiers in one scheme
are valid when their normalized value or authority differs. Callers requesting a
single identifier must supply enough authority context to make the result unique;
ambiguous lookup fails instead of choosing by array order.

Phase 0 may derive a deterministic `fa_shadow_*` ID by hashing the normalized
`legacy_runtime_id`. Shadow IDs exist only in memory and diagnostic stdout.
They must never be accepted by the canonical constructor, persisted as canonical
mappings, or emitted in public data. A shadow candidate is built through a
separate factory that verifies its external legacy identifier matches the source
ID used to derive the shadow ID.

### Geometry

Geometry is split by purpose:

- `closedEnvelope`: overall closed width, height range, and depth.
- `installation`: left, right, top, rear, and front clearance.
- `operation`: open-door depth, hinge-side clearance, drawer extension, or
  lid-open height.
- `delivery`: packed and unpacked envelope, weight, removable components, and
  turning constraints.

Phase 0 implements closed-envelope and installation measurements. Operation and
delivery remain explicit unknown checks rather than invented values.

Measurements use millimetres. Closed dimensions are positive finite numbers;
clearances are non-negative finite numbers because an explicit manufacturer
requirement of `0 mm` is meaningful and is not equivalent to unknown `null`.
Height can be a range to support adjustable feet. Every promoted measurement can
point to field-level evidence.

### Evidence

`FieldEvidence` records one fact from one document:

```js
{
  id: 'ev_width_001',
  productId: 'fa_00000001',
  field: 'closedEnvelope.widthMm',
  value: 790,
  unit: 'mm',
  sourceDocumentId: 'doc_fp_rf505_guide',
  documentSha256: '<64 lowercase hex characters>',
  page: 5,
  quote: 'Overall width 790 mm',
  parserVersion: 'manual-v1',
  identityMatch: 'exact',
  aliasApproved: false,
  documentAuthorType: 'manufacturer',
  transportHostType: 'manufacturer',
  status: 'approved'
}
```

Only `exact` or explicitly approved `alias` identity matches may become
approved. Automatic Phase 0 approval also requires a manufacturer-authored
document retrieved from a manufacturer transport host. Authorship and transport
are recorded separately; retailer-authored or retailer-hosted candidates remain
pending until a later explicit review policy exists. Missing provenance keeps
evidence pending or rejected.

### Fit decision

The engine returns structured checks rather than only a score:

```js
{
  outcome: 'VERIFIED_FIT',
  checks: [
    { id: 'installation_width', status: 'PASS', requiredMm: 800, availableMm: 810, spareMm: 10 }
  ],
  required: { widthMm: 800, heightMm: 1800, depthMm: 720 },
  spare: { widthMm: 10, heightMm: 20, depthMm: 30 },
  evidenceLevel: 'verified'
}
```

Outcome precedence is deterministic:

1. Any required axis or applicable operation/service FAIL: `NO_FIT`.
2. Any required UNKNOWN: `INSUFFICIENT_DATA`.
3. Required checks pass but an applicable operation/service check is UNKNOWN:
   `CONDITIONAL_FIT`.
4. All applicable checks pass with estimated requirements:
   `LIKELY_FIT_ESTIMATED`.
5. All applicable checks pass with verified dimensions and requirements:
   `VERIFIED_FIT`.

No public 0-100 safety score is introduced in Architecture V2. A ranking score
may be designed later, only for products that already pass the same hard
constraints.

## Legacy Adapter

The legacy adapter reads a current `public/data/appliances.json` row and returns
either:

- a valid shadow-domain product plus migration warnings, or
- a quarantined result with explicit errors.

The adapter must preserve the legacy ID as an external identifier. It must not
silently infer manufacturer clearance, reinterpret `door_swing_mm`, or promote
retailer-hosted evidence. Legacy `w`, `h`, and `d` may seed unverified closed
dimensions only when all three are positive finite values.

Until a canonical mapping exists, the adapter assigns the temporary shadow ID
defined above. The returned product remains a migration candidate, not an
approved canonical catalog record.

## Shadow Audit

The audit is read-only and deterministic. It reports:

- total rows,
- valid shadow products,
- quarantined products,
- identity errors,
- invalid or suspicious geometry,
- missing dimensions,
- evidence readiness,
- category counts.

It exits non-zero only for malformed input or an internal audit failure in
Phase 0. Product-level migration problems are reported, not auto-fixed.

## Compatibility Contract

Until an explicit later cutover phase:

- `public/data/appliances.json` remains byte-for-byte controlled by legacy code.
- Existing generated routes and canonical URLs remain unchanged.
- Existing public evidence labels remain unchanged.
- Existing Fit behavior remains unchanged.
- New code may read legacy artifacts but may not write them.

## Testing Strategy

- Unit tests cover identity normalization, immutable return values, geometry
  validation, evidence approval gates, and Fit outcome precedence.
- Golden fixtures cover verified pass, hard failure, missing required data,
  estimated fit, and conditional operation space.
- Adapter tests use representative legacy rows, including malformed dimensions
  and retailer-only evidence.
- Shadow audit tests verify deterministic counts and no input mutation.
- Existing 1,551 tests, lint, and schema validation remain mandatory.

## Phase 0 Acceptance

- New domain tests pass independently.
- Existing tests, lint, and schema validation remain green.
- The shadow audit processes the current catalog without modifying tracked data.
- Unknown values are never converted to zero.
- No Architecture V2 module is imported by production browser or page-generator
  code.
- No new runtime dependency is added.

## Later Phases

1. Canonical identity mapping and conflict quarantine.
2. Retailer observation ledger and availability reconciliation.
3. Source-document registry and PDF evidence state machine.
4. Category-specific geometry and installation requirement migration.
5. FitDecision shadow parity and production cutover.
6. Browser/runtime modularization and legacy deletion.
