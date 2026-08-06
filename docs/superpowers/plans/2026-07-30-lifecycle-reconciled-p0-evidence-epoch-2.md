# Lifecycle-Reconciled P0 Evidence Epoch 2 Implementation Plan

> **Execution rule:** Use `superpowers:executing-plans` for implementation, `superpowers:test-driven-development` for behavior changes, and `superpowers:verification-before-completion` before reporting completion. Use `parsing-appliance-pdfs-with-mineru` only after the controller selects a viable official PDF target.

**Status:** Ready to execute

**Goal:** Make the historical evidence recovery pipeline consume the currently activated retail release, materialize only the controller-authorized bounded manifest, and safely execute one new P0 canary without changing public lifecycle or Fit decisions by accident.

**Architecture:** Keep historical identity, active retail lifecycle, evidence recovery, public projection, and Fit publication as separate contracts. Reuse the hash-validating `loadActiveRetailRelease()` loader, preserve its historical-reference identity set, and overlay lifecycle only from catalog products bound by `catalogProductIds`. Downstream artifacts remain content-addressed; the scale controller remains the only scheduler; the recovery runner remains fail closed.

**Tech stack:** Node.js ESM, `node:test`, JSON artifacts, SHA-256 bindings, MinerU `content_list_v2`, existing Architecture V2 builders and audits.

---

## 1. Confirmed Starting State

As of 2026-07-30 on `main`:

- Active retail release: `retail_lifecycle_release_6c42c754aeb1ff49097b32b4`.
- The active release contains 8,087 historical reference records and 3,513 public products, of which 349 are current.
- The ordinary generated historical reference contains 8,089 records. Its two extra descriptive pseudo-model identities have no cumulative acceptance receipts, but still require an explicit alias, quarantine, or proven-removal decision.
- Active-release reference `fa_ref_213e1031e4bc66748bb7d644` (`LG LD1482T4`) is `CATALOG_ARCHIVED`.
- The ordinary generated historical reference still marks the same model `CURRENT_RETAIL`.
- The active historical-reference artifact is not by itself a complete lifecycle authority: it marks some catalogue-bound current products as `UNKNOWN_RETAIL` because its build did not receive the retailer observation ledger.
- `catalogProductIds` bind 3,510 active historical references to active catalogue products without multi-product or lifecycle conflicts: 347 current, 3,086 archived, and 77 unknown.
- That stale lifecycle flows through classification, acquisition, executable queue, bounded batches, and scale control.
- The controller therefore authorizes `historical_batch_eece52785389de6009b8cddf` as a P0 current-dimensions batch even though its only target is archived in the active release.
- The tracked materialized recovery batch is older again and contains an Esatto target, so it does not match the controller manifest.
- The runner catches that mismatch late, but the batch builder cannot currently materialize by `--manifest-id`.
- `refresh:historical-evidence-recovery:inputs` also rebuilds and publishes the legacy historical reference. Running it can replace the active 8,087-row public replacement dataset with the stale 8,089-row dataset before an active-release audit sees the change.

This is an ordering and source-authority defect. It must be fixed before further PDF acquisition.

## 2. Non-Negotiable Invariants

1. The recovery identity set equals the 8,087 records in the activated historical reference. The two generated-only legacy pseudo-model identities require an explicit alias, quarantine, or proven-removal decision before the switch is accepted.
2. An active-release `CATALOG_ARCHIVED` model cannot enter `CURRENT_DIMENSIONS`, a P0 current priority, or a current Fit input.
3. A model is current only when the activated release says `CURRENT_RETAIL`; generated legacy catalogue state cannot revive it.
4. Historical and archived models remain searchable as old-appliance replacement inputs.
5. Unknown lifecycle stays unknown; absence of a listing is not automatically archived unless the active release already made that decision.
6. A controller decision authorizes exactly one bounded manifest. The materialized target set must equal that manifest's target bindings.
7. Dimensions evidence cannot promote installation, service-space, or `VERIFIED_FIT` claims.
8. No generated artifact is hand-edited. Rebuilds happen in the isolated worktree and are accepted only after diff review.
9. Ordinary build and deploy do not require `/Volumes/UGREEN-1TB`; acquisition that needs evidence bytes fails closed when the volume is absent.
10. Brand or provider responses remain quarantined until rights, exact AU identity, field normalization, conflict checks, and receipts pass.

## 3. Dependency Order

```text
active-retail-release descriptor + bound artifacts
  -> active historical identities + catalogProductIds lifecycle overlay
  -> recovery lifecycle binding audit
  -> classification and recovery queues
  -> acquisition/executable queues
  -> family canaries and target state
  -> bounded manifests
  -> scale controller
  -> manifest-bound materialization
  -> one P0 canary
  -> receipt audit and publication isolation
```

Supplier outreach is a parallel calendar lane. It must not alter this transaction.

---

## Task 0: Freeze the Baseline and Reproduce the Defect

**Inspect only:**

- `data/architecture-v2/decisions/active-retail-release.json`
- `data/architecture-v2/generated/historical-appliance-reference.json`
- `data/architecture-v2/generated/historical-model-evidence-classification.json`
- `data/architecture-v2/reviews/automated/historical-executable-evidence-recovery-queue.json`
- `data/architecture-v2/reviews/automated/historical-evidence-next-batches.json`
- `data/architecture-v2/reviews/automated/historical-dimensions-scale-control.json`

**Steps:**

1. Record the branch, commit, active release ID, active catalogue hash, active historical-reference hash, controller manifest ID, and current audit counts.
2. Diff generated and active historical identities. Prove the disposition of the two generated-only descriptive pseudo-model records and verify that no valid receipt becomes orphaned.
3. Reproduce the mismatch with a read-only assertion: the controller target is current in generated recovery artifacts but archived in the activated catalogue.
4. Record `LG LD1482T4` as the repository regression witness, while defining the defect as a general invariant rather than an LG special case.

**Expected result:** the preflight is intentionally red and blocks all acquisition or batch execution.

## Task 1: Build the Activated Recovery View

**Create:**

- `src/domain/historical-recovery-active-release.mjs`
- `tests/architecture-v2/historical-recovery-active-release.test.mjs`

**Modify:**

- `scripts/architecture-v2/build-historical-model-evidence-classification.mjs`
- `scripts/architecture-v2/build-historical-evidence-recovery-queue.mjs`
- `scripts/architecture-v2/build-dimension-expression-knowledge.mjs`
- Recovery-only direct consumers of `historicalApplianceReference` identified by the preflight inventory:
  - `scripts/architecture-v2/audit-legacy-pdf-library.mjs`
  - `scripts/architecture-v2/build-historical-model-pdf-baseline.mjs`
  - `scripts/architecture-v2/build-historical-pdf-image-repair-queue.mjs`
  - `scripts/architecture-v2/audit-historical-pdf-image-repair.mjs`
  - `scripts/architecture-v2/build-historical-pdf-offline-replay-queue.mjs`
- `package.json`
- `tests/architecture-v2/historical-replacement-audit.test.mjs`

**Do not modify:**

- `build-historical-appliance-reference.mjs`, `build-official-market-lifecycle.mjs`, or release-candidate builders merely to solve recovery prioritisation. They produce candidate releases and have a different contract.

**Steps:**

1. Write focused failing tests for the general overlay behavior and the `LD1482T4` repository regression.
2. Import and call the existing `loadActiveRetailRelease({ root })`.
3. Use `release.reference` as the recovery identity and evidence base.
4. Build a lifecycle overlay only through each reference's `catalogProductIds` against `release.catalog.products[*].id`.
5. For a bound record, use the catalogue product's validated `retailLifecycle.lifecycleState`; do not infer from `unavailable`, retailer links, model text, or exact-key guessing.
6. For an unbound record, preserve the active historical-reference lifecycle.
7. Reject missing catalogue IDs, multiple bound products, conflicting lifecycle states, invalid lifecycle decisions, and duplicate reference IDs.
8. Use `release.catalog` wherever recovery logic needs the active public product projection.
9. Keep current cumulative receipt and MinerU inputs unchanged; they may enrich evidence but may not alter identity or lifecycle.
10. Remove the unconditional legacy historical-reference rebuild from `refresh:historical-evidence-recovery:inputs`; recovery should not silently replace its lifecycle authority before classifying.
11. Remove legacy public-projection generation and direct historical publication from the recovery refresh; make it a control-plane rebuild followed by `audit:active-retail-release`.
12. Remove direct historical-reference publication from `build:architecture-v2`. Only `publish-active-retail-release.mjs` may write runtime catalogue and replacement-reference files as one bound publication action.
13. Keep the underlying historical publisher callable by the active-release publisher, but remove or fail closed its standalone package/CLI path so it cannot publish the generated legacy reference by default.
14. Keep generated candidate-release artifacts available for the separate release-building workflow.

**Acceptance:**

- The output contains exactly the 8,087 active historical-reference IDs.
- The two generated-only identities have an audited disposition and no valid receipt is orphaned.
- The measured overlay remains internally consistent: no missing product binding, no multi-product binding, and no conflicting bound lifecycle.
- `LD1482T4` classifies as archived and is absent from current P0 targets.
- All 347 in-scope references bound to current active products classify as current; current products outside the four historical categories are reported, not coerced into this programme.
- No public files are published by this task.
- No package script can leave public replacement files sourced from the generated legacy reference.

## Task 2: Add a Cross-Artifact Active-Release Audit

**Create:**

- `scripts/architecture-v2/audit-historical-recovery-active-release.mjs`

**Modify:**

- `package.json`
- `src/domain/historical-recovery-active-release.mjs`
- `tests/architecture-v2/historical-recovery-active-release.test.mjs`
- `scripts/architecture-v2/audit-historical-replacement.mjs`
- `scripts/architecture-v2/build-historical-evidence-system-contract.mjs`

**Minimal contract:**

The audit loads the activated release through the existing validated loader and checks:

1. Classification identity set equals the active historical-reference identity set.
2. For catalogue-bound references, classification lifecycle equals the bound active catalogue `retailLifecycle` decision.
3. For unbound references, classification lifecycle equals the active historical-reference lifecycle.
4. Acquisition, executable, target-state, bounded-manifest, and controller current lanes contain only references that the recovery view marks current.
5. Archived, registry-only, and unknown models never receive a current P0 priority.
6. The output records the active release ID and its bound catalogue/reference hashes plus binding counts.

Add `audit:historical-recovery-active-release` before bounded-batch and scale-control generation. Make the system contract invoke the same pure assertion so CI cannot bypass it.

Make the default historical replacement audit resolve the active release through `loadActiveRetailRelease()`; explicit paths remain available only to active-release candidate/rollback tests. This prevents a stale generated reference and stale public files from auditing each other successfully.

**Tests:**

- Pass for aligned current, archived, unknown, and unbound registry fixtures.
- Fail for stale current classification.
- Fail for a later queue re-labelling an archived record as current.
- Fail for identity loss, an orphaned receipt, an unbound active-release artifact, a missing `catalogProductId`, or conflicting product bindings.
- Preserve unknown lifecycle without promotion.

## Task 3: Rebuild the Recovery Graph and Review the Delta

**Generated outputs only:** classification, acquisition queue, official candidate manifest, executable queue, family canaries, target state, bounded batches, programme status, scale control, and system contract.

**Steps:**

1. Rebuild in this isolated worktree.
2. Run the active-release audit before and after downstream generation.
3. Review lifecycle and priority deltas by category and brand.
4. Confirm the active public catalogue and public replacement files are byte-identical during this control-plane rebuild.
5. Recompute the controller; do not assume the next target will be LG or Esatto.

**Hard gates:**

- 8,087 active historical identities remain, with the generated-only identity delta explicitly accounted for.
- Active public catalogue remains 3,513 products with 349 current unless a separate active release is deliberately activated.
- Public replacement entry for `LD1482T4` remains archived with no purchase CTA.
- Receipt replay remains fully passing at the then-current cumulative count.
- Fit publication violations remain zero and receipt-bound `VERIFIED_FIT` is not increased by lifecycle repair.

Any unexpected identity, public-catalogue, or Fit delta stops execution before Task 4.

## Task 4: Materialize by Controller Manifest, Not Ad Hoc Filters

**Modify:**

- `scripts/architecture-v2/build-historical-evidence-recovery-batch.mjs`
- `tests/architecture-v2/historical-evidence-recovery-batch.test.mjs`

**Reuse:**

- `resolveHistoricalEvidenceBoundedManifest()` from `src/domain/historical-evidence-bounded-batch.mjs`.

**TDD behavior:**

1. Add `--manifest-id` to the batch-builder CLI.
2. Load bounded batches, executable queue, target state, family canaries, and scale control.
3. Resolve and validate the requested manifest using the existing hash and authorization checks.
4. Derive the exact target IDs from `manifest.targetBindings`.
5. Reject mixing `--manifest-id` with `--target-id`, `--job-id`, `--route`, `--priority`, `--brand`, or `--limit`.
6. Refuse a manifest not authorized by the current scale controller.
7. Write atomically only after exact target-set equality is proven.
8. Keep ad hoc selection available only for explicit diagnostic output paths; it must not overwrite the tracked execution batch.

**Focused tests:**

- Authorized manifest materializes exact targets.
- Wrong or stale manifest fails.
- Queue, target-state, or canary hash drift fails.
- Mixed selector modes fail.
- Tracked default output rejects ad hoc selection.

## Task 5: Inspect and Execute One Recomputed P0 Canary

**Precondition:** Tasks 0-4 pass and the controller returns a new authorized manifest.

**Steps:**

1. Inspect the selected target's exact AU model identity, lifecycle, required fields, resolver contract, suppression state, and document family.
2. Probe only official, policy-allowed routes.
3. If no resolver or parser capability changed since the last terminal attempt, record a typed stop instead of repeating network work.
4. If an official PDF is found, verify host, redirect chain, magic bytes, size limits, content hash, exact model coverage, and rights metadata.
5. Parse through MinerU `content_list_v2`; preserve pages, tables, bounding boxes, units, axis order, model scope, source hash, and raw claims.
6. Issue receipts only for exact, field-scoped claims. Alternate depths, ranges, family manuals, and suffix aliases remain unresolved unless their specific rule passes.
7. Run the recovery runner first in dry-run mode, then live only for the same authorized manifest.

**Stop conditions:**

- Active lifecycle changed after materialization.
- Exact model is absent from the source.
- Axis semantics are ambiguous.
- Source bytes or MinerU artifact are unavailable.
- Two consecutive unchanged attempts produce no new valid receipt.

## Task 6: Promote Only Valid Evidence and Re-Audit Publication

Run only if Task 5 yields a valid receipt.

1. Audit the recovery result and append the attempt ledger.
2. Promote to the cumulative acceptance bundle only through the existing receipt audit.
3. Replay all cumulative receipts.
4. Rebuild recovery classification and queues to prove the accepted target leaves the missing-dimensions lane.
5. Run replacement, installation, Fit, and active-release audits.
6. Keep installation fields unknown unless independently evidenced.

**Required commands:**

```bash
npm run audit:historical-acceptance-receipts
npm run audit:historical-replacement
npm run audit:fit-publication
npm run build:historical-evidence-system-contract
npm run test:architecture-v2
npm test
npm run build
```

The external evidence volume is used only for deep evidence verification. Repeat ordinary tests/build with it unavailable before completion.

## Task 7: Keep Supplier Outreach on Its Date-Gated Lane

This work can proceed in parallel but is not a dependency for Tasks 0-6.

- **2026-08-01:** Run the outreach status checker and send only due first follow-ups for original brand threads that have no reply.
- Do not follow up Icecat while its coverage study is active.
- **2026-08-03:** Process due first follow-ups for the later six brand threads.
- **2026-08-06 / 2026-08-08:** Send final follow-ups only where still due.
- **2026-08-10:** Run WP12 only if provider and PDF-family metrics are comparable.
- Any reply remains `RECEIVED` until rights and field-level validation pass; it cannot change public data directly.

## Task 8: Documentation, Review, and Delivery

**Modify after successful verification:**

- `docs/product-core-brief.md` only if the active-release recovery invariant is not already explicit.
- `docs/superpowers/plans/2026-07-27-brand-data-and-pdf-yield-program.md` checkpoint/status only; do not duplicate this plan.
- This plan's status and execution checkpoint.

**Review checklist:**

1. Inspect the complete diff for hand-edited generated data or unrelated files.
2. Confirm the dirty user-owned root worktree was untouched.
3. Run one adversarial review focused on lifecycle revival, stale manifests, P1 leakage, identity loss, and Fit promotion.
4. Commit with a conventional message.
5. Push a branch and open one PR after all gates pass.
6. Merge only after CI and review; then verify `origin/main` and the deployed active-release audit separately.

---

## Completion Definition

This task is complete only when:

- Recovery lifecycle and priorities are derived from the activated release.
- No archived active-release model is scheduled as current P0.
- Historical replacement identities remain available.
- The materialized batch is exactly the controller-authorized manifest.
- One recomputed P0 canary either yields a valid receipt or ends in a typed, non-repeating stop.
- Receipt, replacement, Fit, active-release, full test, and build gates pass.
- The plan checkpoint records measured before/after counts and the next authorized action.

The next execution must begin at Task 0. It must not run the currently tracked LG or Esatto batch before lifecycle reconciliation and manifest-bound materialization are complete.
