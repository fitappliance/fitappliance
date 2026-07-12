# Historical MinerU and Publication Coverage Design

**Date:** 2026-07-12
**Status:** Implemented; delivery verification pending
**Scope:** Architecture V2 evidence ingestion, model identity, geometry projection, and publication safety

## Problem

FitAppliance currently has reliable point solutions but poor population coverage:

- 69 stored PDF files represent 65 unique SHA-256 objects.
- Only 10 of those 65 hashes have a current MinerU `content_list_v2` index.
- The production projection contains 3,521 products, but only one product has receipt-bound dimensions and none has receipt-bound verified fit.
- Ten brand canaries already pass exact evidence and receipt validation, but their projected geometry is not joined into the public catalog.
- Older reviews can approve dimensions without current per-field provenance, so publication correctly downgrades them.
- Adjustable height ranges are supported by `geometry_v2`, but three legacy reviews were limited by a scalar review format.
- Family manuals, regional suffix variants, filename/cover disagreements, and invisible target SKUs remain identity failures.

The target is not to turn every document into verified evidence. The target is to make every document reproducibly parsed, every identity conflict automatically investigated, and every publication decision fail closed.

## Non-negotiable Invariants

1. A parsed PDF is not automatically a trusted source.
2. A trusted source is not automatically an exact-model match.
3. Exact dimensions do not imply installation clearance or verified fit.
4. Model suffixes are semantic until official evidence proves otherwise.
5. Family or series manuals cannot donate fields to a target SKU unless an approved alias decision specifies the transferable fields.
6. Adjustable height remains a range. It must never be collapsed to an arbitrary scalar.
7. Every published geometry field must have a source URL, content hash, receipt binding hash, and page or fragment locator when available.
8. Active evidence conflicts stop publication rather than selecting a preferred value silently.
9. Historical parsing must be resumable, content-addressed, and idempotent.
10. `VERIFIED_FIT` remains unavailable while required placement, operation, or service fields are missing.

## Architecture

### 1. Historical PDF inventory and MinerU backfill

A new inventory domain module discovers physical PDFs under the configured evidence roots, verifies PDF magic bytes, calculates SHA-256, and groups duplicate paths by content hash. It compares each unique hash with the MinerU cache index and emits one deterministic record per document:

- `indexed`: current parser/model cache is valid and replayable.
- `missing`: no current cache exists.
- `stale`: cache exists for a different parser/model policy.
- `invalid`: path, PDF payload, hash, or cache integrity failed.
- `failed`: MinerU attempted the document and returned a terminal error.

The backfill command runs one unique hash at a time, checkpoints after each result, and resumes from the audit file. Concurrency defaults to one because MinerU is resource intensive. Duplicate physical paths are never parsed twice.

The inventory report is diagnostic evidence only. Completing the MinerU index does not alter public trust labels.

### 2. Receipt-bound acceptance projection

The ten-brand acceptance batch and results are joined by canary ID and then validated against the production catalog:

- `legacyRuntimeId` exists exactly once.
- canonical brand, model, category, and form factor agree.
- acceptance outcome is accepted and has source receipts.
- source receipts replay for the same brand/model/category identity.
- `projectEvidenceGeometry` produces complete W/H/D.
- any existing receipt-bound geometry is identical; otherwise the build fails.

The public product receives:

- `geometry_v2` from the receipt-verified projector.
- `geometry_v2_provenance` with evidence level, field evidence, active source hashes, missing verified-fit fields, and outcome.
- evidence metadata that distinguishes dimensions-only from verified fit.

No acceptance result can bypass the projector or synthesize provenance.

### 3. Identity resolution queue

Unresolved identity failures are represented as machine-readable cases rather than weakened matching rules. Each case records:

- target and observed identities;
- failure class: `target_not_visible`, `suffix_mismatch`, `filename_cover_conflict`, or `family_only`;
- current sources and contradictions;
- required next evidence tier;
- transferable field scope, initially empty;
- deterministic terminal state: `resolved`, `quarantined`, or `needs_research`.

Automated research follows the existing alias adjudication policy:

- Tier A: an official variant table or direct cross-reference may approve explicitly supported fields.
- Tier B: dimensions only may transfer when regulator-family evidence, an official W/H/D source, and two independent target-market model sources agree without contradiction.
- Similar strings, regional assumptions, family membership, retailer-only claims, or filenames never approve an alias by themselves.

Every resolution is replayed through the same receipt and publication gates. No human approval flag is required, but insufficient evidence remains quarantined.

### 4. Adjustable-height migration

Legacy scalar review outcomes are audited against MinerU claims. An explicit minimum/maximum pair becomes `closedEnvelope.heightMm` as a range. The placement engine uses the maximum for required cavity height while preserving the minimum for user-facing compatibility.

The migration rejects:

- a range inferred from two unrelated numbers;
- adjustable feet values treated as total product height;
- packaged or door-open height substituted for closed-envelope height;
- a range without exact axis labels or table context.

### 5. Installation and operation evidence

Missing installation, door, lid, ventilation, plumbing, and service dimensions are tracked per product in `missingForVerifiedFit`. A secondary evidence candidate can add those fields only through verified receipts and exact identity or an approved field-scoped alias.

The system does not estimate manufacturer clearances. Until all category-required fields are present:

- dimensions may publish;
- fit can be `INSUFFICIENT_DATA`, `CONDITIONAL_FIT`, or `LIKELY_FIT_ESTIMATED` as defined by the engine;
- `VERIFIED_FIT` is prohibited.

## Failure Mapping

| Failure | Automated response | Publication effect |
| --- | --- | --- |
| Series manual omits exact SKU | Create identity research case | No field transfer |
| Rendered page omits target model | Capture rendered/source discrepancy and seek official alternate | No field transfer |
| Target suffix differs | Require Tier A or Tier B alias proof | Quarantine by default |
| Filename and cover disagree | Treat document content as authoritative identity signal; investigate filename separately | Quarantine by default |
| Family-only manual | Require explicit model membership and field equivalence | No automatic sharing |
| Adjustable height range | Preserve `{minimumMm, maximumMm}` | Dimensions may publish when receipt-bound |
| Missing installation/service space | Record precise missing fields | Block `VERIFIED_FIT` |

## Outputs

- Historical MinerU inventory/backfill audit JSON.
- Deterministic acceptance-to-catalog projection module.
- Automated identity research queue JSON.
- Adjustable-height migration audit JSON.
- Updated fit publication audit and public catalog projection.
- Focused tests for duplicates, resumability, stale/corrupt caches, identity mismatches, range preservation, receipt replay, source conflict, and fit-label safety.

## Acceptance Criteria

1. All 65 unique stored PDF hashes are accounted for; the target is 65 valid current MinerU indexes, with every terminal failure named if the target cannot be reached.
2. Re-running the backfill invokes MinerU zero times for valid cached documents.
3. Physical duplicate PDFs produce one parse and multiple provenance paths.
4. The ten accepted brand canaries increase receipt-bound dimension coverage without weakening identity checks.
5. No outcome with an identity mismatch or receipt failure reaches publication.
6. The three known adjustable-height cases are represented as ranges when exact evidence exists, never as guessed scalars.
7. The publication audit reports zero provenance violations and zero falsely promoted `VERIFIED_FIT` products.
8. Focused Architecture V2 tests, the relevant full test suite, build, deployment, and live browser checks pass.

## Implementation Result Before Delivery

- The inventory expanded to 77 physical PDF files and 69 unique hashes during official-source recovery. All 69 hashes have current replayable MinerU `content_list_v2` indexes; missing, stale, failed, and invalid counts are zero.
- Receipt-bound dimension coverage increased from 1 to 21 of 3,521 products. Receipt-bound `VERIFIED_FIT` remains zero because required placement or operation evidence is still incomplete, and the publication audit reports zero violations.
- Eight of nine historical identity cases resolved through exact or strict field-scoped official evidence. `WW12BB944DGB` remains quarantined instead of receiving a weak suffix/family approval.
- All three adjustable-height products preserve 850-895 mm ranges and use 895 mm for cavity placement. Generated pages, cards, FAQs, and JSON-LD expose the range rather than the former fixed 850 mm value.
- Receipt-bound fields now replace or clear stale retailer-era top-level dimensions, clearances, door-open depth, plumbing, and ventilation flags. The post-build drift audit reports zero conflicts across all 21 receipt-bound products.
- Local verification passed with 286 Architecture V2 tests, 1,590 full tests, lint, both builds, the PDF JSON-first audit, the 69-document historical replay audit, and the fit publication audit. Deployment and live-browser evidence remain pending.

## Implementation result

The implementation completed the technical and data-quality criteria before deployment:

- Official-source recovery added four unique PDFs, so the final inventory is 77 physical paths representing 69 unique hashes rather than the 65-hash starting baseline. Current MinerU coverage is 69/69 (100%), with zero missing, stale, failed, or invalid documents.
- Receipt-bound dimension coverage is 21/3,521 products, up from 1/3,521. Publication remains conservative at 0 receipt-bound `VERIFIED_FIT` products and zero audit violations.
- Eight of nine historical identity failures now resolve through exact evidence or a strict dimensions-only official marketing alias. `WW12BB944DGB` remains quarantined because the official AU PDF still lacks sufficient structured exact-model identity.
- Three adjustable-height cases retain explicit minimum/maximum ranges with zero scalar coercions.
- The MinerU table normalizer now supports strict single-cell specification rows. This recovered receipt-bound left, right, top, and rear installation clearances for `RF605QZUVB1` without inventing its still-missing door-open depth.
- Receipt policy `2026-07-12.2` binds the current source identity, claims, immutable source hash, MinerU artifact hash, and extraction-policy state.
