# Automated Evidence Resolution

## Purpose

Architecture V2 now closes evidence failures without human adjudication. A case
either publishes a field-scoped, sanitized product or remains quarantined after
a bounded search. Missing evidence never becomes an inferred value.

## Flow

1. Record the initial machine-readable failure and conflicting public fields in
   `data/architecture-v2/reviews/automated/evidence-resolution-cases.json`.
2. Generate field-specific research tasks with `buildResolutionPlan`.
3. Collect exact-model manufacturer sources, store immutable raw responses in
   the external SHA-256 object store, and commit only the relative object path,
   URL, retrieval time, SHA-256, exact labels, quotes, values, and units.
4. Run `npm run build:evidence-resolution`.
5. The manifest deterministically returns `resolved`, `research_required`, or
   `quarantined`; `requiresHumanReview` is always false.
6. `build:canonical-registry` releases only resolved evidence quarantine IDs.
   Manufacturer identity collisions cannot be released by this mechanism.
7. `build-public-projection` reconstructs resolved products from approved
   claims and removes every unapproved legacy fit field.

## Failure Policy

- Conflicting exact manufacturer claims terminate as quarantine.
- Incomplete searches retry until `maxAttempts`.
- Exhausted searches terminate as `evidence_search_exhausted`.
- Retailer claims cannot overrule manufacturer claims.
- Official exact-model HTML is accepted when a manufacturer PDF endpoint is
  broken or incomplete, provided provenance and explicit labels are stored.

## Current Regression Case

WHE6874BA is the first closed-loop case. Its exact Westinghouse page resolved
the stale plumbing flag and proved dimensions, 90-degree door depth, and top
air space. Side and rear installation values remain unknown. The public object
is released without the old unapproved fields.

## Commands

```bash
npm run build:evidence-resolution
npm run verify:evidence-resolution-objects -- --storage-root /Volumes/UGREEN-1TB/FitAppliance
npm run build:architecture-v2
npm run test:architecture-v2
npm run audit:model-aliases
```
