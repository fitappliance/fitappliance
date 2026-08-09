# Fit V4 Cutover Runbook

## Current State

Candidate `fit_v4_cutover_d144848e18f7c0558d00df11` is **BLOCKED**. This preparation does not authorize a public adapter, deployment, score, or claim change.

## Preparation Preflight

```sh
node --test tests/architecture-v2/fit-v4-cutover-candidate.test.mjs
node --check scripts/architecture-v2/build-fit-v4-cutover-candidate.mjs
node scripts/architecture-v2/build-fit-v4-cutover-candidate.mjs
git diff --check
```

The builder independently reloads the active retail release, rebuilds and audits both authoritative cohorts, validates the frozen label registry, rebuilds calibration and the complete consumer inventory, and binds the complete Vercel deployment surface before writing only non-public review artifacts.

## Required Sequence

1. Produce a real receipt-bound V4 evaluation epoch and replay its manifest.
2. Rebuild and audit both authoritative cohorts.
3. Collect independent source-backed labels and calibrate each category.
4. Migrate and verify all 58 legacy consumers without generic score fallback.
5. Materialize the smallest adapter in an isolated candidate branch.
6. Capture pre-change public, route, sitemap, public-data, deployment, and pointer bytes.
7. Run real desktop/mobile browser and assistive-technology QA for Fit V4. Retail-lifecycle QA cannot satisfy this gate.
8. Capture the real post-change snapshot, exercise rollback, and prove byte-identical restoration. The current private pointer rehearsal is not this proof.
9. Rebuild this packet from the changed candidate and present it for explicit owner approval.
10. Only after approval, deploy the approved category/configuration scope and monitor; rollback on any binding, privacy, false-acceptance, or rendering failure.

## Rollback Procedure for a Future Adapter Candidate

1. Stop new writes and preserve the failed deployment and evaluation manifests.
2. CAS the real candidate pointer only from the observed candidate ID to the captured prior ID; reject stale expectations.
3. Restore captured public and deployment artifacts, then verify every byte hash, route, sitemap and public-data inventory.
4. Rerun desktop/mobile smoke and accessibility checks against the restored version.
5. Record the rollback result as a new evidence object; never relabel the private pointer rehearsal as production proof.

## Prohibitions

No adapter switch, publication writer, numeric total, Perfect Fit claim, deployment, or persisted real-site profile is permitted while any typed blocker remains.
