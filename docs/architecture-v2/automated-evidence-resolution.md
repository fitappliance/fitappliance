# Automated Evidence Resolution

## Purpose

Architecture V2 now closes evidence failures without human adjudication. A case
either publishes a field-scoped, sanitized product or remains quarantined after
a bounded search. Missing evidence never becomes an inferred value.

## Flow

1. Record the initial machine-readable failure and conflicting public fields in
   `data/architecture-v2/reviews/automated/evidence-resolution-cases.json`.
2. Generate field-specific research tasks with `buildResolutionPlan`.
3. Collect exact-model manufacturer sources. HTML is verified directly. Every
   PDF is first converted by MinerU 3.4.4 `pipeline` into
   `content_list_v2.json`; direct PDF text extraction is not an approval path.
4. Store the immutable PDF and MinerU JSON separately by SHA-256. The derived
   artifact records the source PDF hash, JSON hash, parser version, model
   revision, backend, page count and relative object path.
5. Rebuild PDF claims only from the stored JSON. Each claim carries page,
   0-1000 bbox, fragment hash, source unit and explicit axis order or label.
   The verifier replays this extraction before issuing a receipt.
6. Run `npm run build:evidence-resolution`.
7. The manifest deterministically returns `resolved`, `research_required`, or
   `quarantined`; `requiresHumanReview` is always false.
8. `build:canonical-registry` releases only resolved evidence quarantine IDs.
   Manufacturer identity collisions cannot be released by this mechanism.
9. `build-public-projection` reconstructs resolved products from approved
   claims and removes every unapproved legacy fit field.

## Failure Policy

- Conflicting exact manufacturer claims terminate as quarantine.
- MinerU output is untrusted derived evidence. Missing JSON, parser-version
  drift, malformed page geometry, mismatched hashes or claim replay drift
  terminate the candidate as research failure.
- The local wrapper verifies that MinerU is configured to the policy-pinned
  model snapshot before execution. Environment variables cannot attest or
  override the model revision, and PDFs above 100 MB fail before process start.
- A QRG page header scopes claims to that page but is not two identity proofs.
  It needs an exact-model official PDF URL or another independent structured
  model signal before a receipt can be issued.
- Grouped dimensions are accepted only with an explicit axis sequence such as
  `W x H x D` or `H x W x D`; packaged dimensions and unlabeled triples are
  rejected. Adjustable height remains a range.
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

## Major-brand PDF acceptance

The repeatable acceptance batch is declared in
`data/architecture-v2/reviews/automated/pdf-brand-acceptance-batch.json` and run
with `npm run accept:pdf-brands`. It checkpoints after every brand, retains the
PDF and MinerU JSON even when identity or claim verification fails, and never
publishes its results directly.

The 2026-07-12 run accepted exact-model dimensions for Bosch WAN24126AU,
Fisher & Paykel RF605QZUVB1, Haier HDW15F4B1, Hisense HRBC137 and Smeg
DWAU615DB3. LG DVH5-08W and Samsung DV90BB9440GH remained quarantined because
their downloaded documents did not contain an exact-model structured identity
signal. Westinghouse WHE5264SC and Electrolux EQE6160BA remained quarantined
because their dynamic factsheet endpoints exceeded the per-URL network budget.
The complete machine-readable result is stored in
`data/architecture-v2/reviews/automated/pdf-brand-acceptance-results.json`.

## Commands

```bash
npm run parse:pdf:mineru -- --input /path/to/manual.pdf --storage-root "$FITAPPLIANCE_STORAGE_ROOT"
npm run accept:pdf-brands -- --storage-root "$FITAPPLIANCE_STORAGE_ROOT"
npm run audit:pdf-json-first
npm run build:evidence-resolution
npm run verify:evidence-resolution-objects -- --storage-root /Volumes/UGREEN-1TB/FitAppliance
npm run build:architecture-v2
npm run test:architecture-v2
npm run audit:model-aliases
```

The MinerU executable and model cache live outside Git. Set
`FITAPPLIANCE_MINERU_BIN`, `MINERU_TOOLS_CONFIG_JSON`, `MINERU_MODEL_SOURCE=local`
and the model cache variables in the local execution environment. No absolute
machine path is committed.
