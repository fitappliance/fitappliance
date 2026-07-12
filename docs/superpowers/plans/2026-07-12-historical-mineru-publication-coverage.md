# Historical MinerU and Publication Coverage Plan

**Design:** `docs/superpowers/specs/2026-07-12-historical-mineru-publication-coverage-design.md`

## Baseline

- [x] Confirm MinerU `3.4.4` and pinned model revision are installed.
- [x] Confirm the evidence disk is mounted with enough free space.
- [x] Confirm 69 physical PDFs collapse to 65 unique hashes.
- [x] Confirm 10 current MinerU indexes and 55 missing hashes.
- [x] Confirm 3,521 public products, one receipt-bound dimension product, zero receipt-bound verified-fit products, and zero publication violations.

## Phase 1: Durable inventory and resumable backfill

- [x] Add failing unit tests for PDF deduplication, invalid magic bytes, current/stale index classification, deterministic ordering, and resume behavior.
- [x] Implement a filesystem-independent inventory classifier in `src/domain`.
- [x] Add a CLI that scans both external evidence roots, computes content hashes, resumes from cache, and checkpoints after each unique PDF.
- [x] Add `--audit-only`, `--limit`, and `--sha256` controls for safe canaries and recovery.
- [x] Add an npm script and deterministic generated audit path.
- [x] Verify one cached document performs no parse and one missing document produces replayable `content_list_v2` JSON.

## Phase 2: Receipt-bound publication integration

- [x] Add failing tests for joining acceptance batch/results, exact catalog identity, receipt replay, duplicate mappings, and geometry conflicts.
- [x] Implement a pure acceptance projection builder using `projectEvidenceGeometry`.
- [x] Merge accepted evidence into `build-public-projection.mjs` before legacy review projection.
- [x] Persist complete `geometry_v2_provenance`; do not manufacture provenance for old reviews.
- [x] Assert dimensions-only canaries remain below `VERIFIED_FIT` when placement or category-required fields are absent.
- [x] Rebuild and measure the exact increase in receipt-bound products.

## Phase 3: Identity and range closure

- [x] Add a deterministic identity-failure taxonomy and queue schema for the known family/suffix/rendering cases.
- [x] Encode Tier A/Tier B evidence requirements and field-scoped transfer limits.
- [x] Add tests proving suffix similarity, family membership, and filenames alone cannot approve fields.
- [x] Generate a research queue from Phase 8/10 outcomes without duplicating already resolved cases.
- [x] Add a range migration audit that identifies legacy scalar blockers and current MinerU range evidence.
- [x] Project every receipt-bound adjustable height as `{minimumMm, maximumMm}` and use the maximum for placement.

## Phase 4: Historical MinerU execution

- [x] Run a small missing-document canary and inspect pages, tables, bounding boxes, axis order, hashes, and cache replay.
- [x] Run the full missing-document resumable backfill on the external disk.
- [x] Re-run in audit-only mode and require all currently discovered unique hashes to be accounted for.
- [x] Record exact failures, retries, elapsed time, and parser/model versions; do not relabel failed documents as indexed.

## Phase 5: Coverage and safety audit

- [x] Rebuild the Architecture V2 public projection and fit publication audit.
- [x] Report receipt-bound dimensions, verified fit, missing field distribution, identity queue state, and MinerU coverage.
- [x] Require zero identity false accepts, zero receipt/provenance violations, and zero unsubstantiated verified-fit labels.
- [x] Run focused tests, all Architecture V2 tests, relevant full tests, lint, and production build.
- [x] Perform one final code/data review for correctness, regressions, security, and missing tests.

## Phase 6: Delivery

- [ ] Commit only task-owned files with a conventional commit message.
- [ ] Push `main` and wait for the deployment to finish.
- [ ] Verify the production catalog and representative product pages in a browser, including one adjustable-height product and one dimensions-only product.
- [ ] Update the design/plan checkboxes and final measured metrics.

## Measured result before delivery

- Historical inventory expanded during official-source recovery to 77 physical files and 69 unique PDF hashes; all 69 have current MinerU `content_list_v2` indexes. Missing, stale, failed, and invalid counts are all zero.
- Public coverage increased from 1 to 21 receipt-bound dimension products. No product is labelled receipt-bound `VERIFIED_FIT`, and the publication audit reports zero violations.
- The identity queue contains nine historical failure cases: eight resolved by current exact or strict official evidence and one (`WW12BB944DGB`) remains quarantined because exact structured identity is still insufficient.
- All three adjustable-height cases publish receipt-bound `{minimumMm, maximumMm}` ranges. Scalar coercions are zero.
- Receipt-bound products now project the same geometry through `geometry_v2`, legacy top-level fields, generated product pages, cards, FAQs, and structured data. The post-build legacy drift audit reports zero dimension, door-open, clearance, plumbing, and ventilation leaks.
- MinerU now preserves strict single-cell specification rows. `RF605QZUVB1` publishes manufacturer clearances of 20 mm left/right/top and 30 mm rear from the same receipt-bound PDF, while missing door-open depth keeps the outcome at `CONDITIONAL_FIT` rather than `VERIFIED_FIT`.
- Validation passed: 286 Architecture V2 tests, 1,590 full tests, lint, Architecture V2 build, production build, PDF JSON-first audit, historical MinerU replay audit, and fit publication audit.

## Stop Conditions

- Stop publication, not parsing, on identity ambiguity.
- Stop the affected document on hash/cache corruption; continue other independent documents and report the failure.
- Stop the build on conflicting receipt-bound active evidence.
- Never coerce a range into a scalar or fill an unknown clearance with an estimate.
- Never claim complete backfill or deployment without replay and live verification.
