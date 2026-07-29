# P0 Current Dimensions Recovery Epoch 1

**Date:** 2026-07-28

**Status:** execution closed at a typed cohort stop; next P0 cohort is authorized but not started

**Branch:** `codex/p0-current-dimensions-epoch-1-run`

## Objective

Merge the approved pre-response evidence expansion, run only controller-authorized
P0 current-dimensions recovery, repair reusable workflow defects found by real
execution, and stop at the first statistically conclusive typed stop. P1 historical
expansion remains blocked.

This epoch does not treat a discovered URL, downloaded file, parsed document, or
dimension-shaped value as accepted evidence. Publication still requires official
bytes, exact identity, parser-bound claims, an acceptance receipt, replay, and the
existing Fit isolation gates.

## Execution Boundary

- Base: merge commit `7baef74008f2aefd321648e63b35484c824d3687` from PR #197.
- Isolated worktree: `.worktrees/p0-current-dimensions-epoch-1-run`.
- External evidence root was used only by acquisition and deep receipt replay.
- Ordinary tests and `npm run build` were executed without
  `FITAPPLIANCE_STORAGE_ROOT`.
- No P1 manifest was executed.
- No release, main-branch merge, contract signature, or commercial data purchase
  was authorized by this epoch.

## Reusable Repairs

### 1. Stop repeated legacy resolver diagnostics

Schema-v1 resolver output cannot prove source-lane completeness, so a target that
has already completed that exact diagnostic must not immediately run the same
target and contract again. The executable queue now defers only that diagnosed
target as `LEGACY_RESOLVER_CONTRACT`. A changed resolver version reopens it, while
unseen sibling models and targets with ready official candidates remain
executable.

An earlier implementation attempted to suppress every sibling sharing the same
resolver ID and would have incorrectly blocked 3,228 target-specific discovery
jobs. Adversarial review rejected that behavior. The final rebuilt queue contains
14 target-bound legacy deferrals and 4,968 bounded discovery targets.

The target-state projection represents the deferral as `BLOCKED_SAME_EPOCH` with
`RESOLVER_CONTRACT_CHANGED` as its reopening condition.

### 2. Stop permanent HTTP absence loops

Official candidate responses with HTTP 404 or 410 are now
`terminal_failure/payload`, not retryable transport failures. The attempt ledger
may suppress that exact URL without inventing a content hash. Timeouts and other
transport failures remain retryable, and a different official URL remains
eligible.

### 3. Bind acquisition semantics into processor epochs

`evidence-candidate-inventory.mjs` is now part of the recovery toolchain identity.
Changing acquisition failure semantics invalidates stale manifests and requires a
new processor-bound run. This prevented an old Esatto manifest from running under
new 404 semantics.

## Execution Record

The epoch completed bounded diagnostics for LG, Midea, Miele, Omega, Samsung,
Smeg, Westinghouse, Haier, Beko, CHiQ, and Esatto resolver paths. The detailed
immutable run and audit bindings remain in the scale ledger and recovery bundle.

The final Esatto sequence was:

| Target | Discovery run | Dimensions run | Final checkpoint |
| --- | --- | --- | --- |
| `EBF112S` | `historical-scale-p0-esatto-ebf112s-20260728-v3-ae` | `historical-scale-p0-esatto-ebf112s-dimensions-20260728-v3-ag` | `historical-dimensions-checkpoint-d8b90b668d22e80bfd6c501b` |
| `EBF112W` | `historical-scale-p0-esatto-ebf112w-20260728-v3-ah` | `historical-scale-p0-esatto-ebf112w-dimensions-20260728-v3-ai` | `historical-dimensions-checkpoint-8b99bc757ed4a4d9b874d50a` |
| `EBF129S` | `historical-scale-p0-esatto-ebf129s-20260728-v3-aj` | `historical-scale-p0-esatto-ebf129s-dimensions-20260728-v3-ak` | `historical-dimensions-checkpoint-d644f6507f2910b8250927b2` |
| `EBF46S` | `historical-scale-p0-esatto-ebf46s-20260728-v3-al` | not authorized | `historical-dimensions-checkpoint-46c3256f64684d4327da7f5c` |

`EBF46S` has discovered candidates but no acquisition run. Discovery is not a
receipt and must not be described as recovered evidence.

## Typed Stop

The controller records the following halted cohort in
`historical-dimensions-scale-control.json`:

- cohort: `historical_cohort_37314e88376dd01c3b824a19`;
- stage: `ACQUISITION`;
- conclusive yield: `0 / 11`;
- retryable units: `2`;
- stage floor: `80.00%`;
- Wilson upper bound: `19.74%`;
- reason: `WILSON_UPPER_BOUND_BELOW_STAGE_FLOOR`.

After the target-bound suppression repair, the control plane recorded explicit
rebaseline `historical-dimensions-rebaseline-8b1eea110ca6f55f2e82330d`.
Only queue counters changed: P0 assigned/eligible increased by `819 / 800`, and P1
assigned/eligible increased by `2,306 / 2,283`. Coverage counters did not change.

The controller subsequently selected P0 manifest
`historical_batch_eece52785389de6009b8cddf` in cohort
`historical_cohort_2f922ef1fca58313bc6ea201`, while retaining the halted cohort
and `p1Blocked: true`. That next epoch is intentionally not executed here.

## Safety and Yield Result

The counters did not inflate during this epoch:

- valid current receipts: `401`;
- historical replacement `AUTO_FILL`: `321`;
- receipt sources replayed: `408 / 408`;
- receipt-bound dimensions: `332`;
- receipt-bound `VERIFIED_FIT`: `0`;
- Fit publication violations: `0`.

The epoch therefore improved recoverability and stopped repeated resource use,
but produced no new accepted dimension receipt. That is a valid zero-yield result,
not a publication success.

## Verification

- Focused defect and regression suites: `104 / 104` passed.
- Processor/run-history suites: `56 / 56` passed.
- Full repository tests: `2951 / 2951` passed.
- Ordinary `npm run build` passed without the external evidence root.
- Offline historical recovery audit: `382` entries, `0` violations.
- Deep acceptance replay: `408 / 408` sources passed against external bytes.
- Canonical replacement audit: `8,089` records, `0` issues.
- Active retail release audit: `3,513` products, `349` current-retail products,
  `8,087` active historical records, `0` replacement issues, `0` Fit violations.
- Fit publication audit: `3,515` products, `332` receipt-bound dimensions,
  `0` receipt-bound Verified Fit, `0` violations.
- Historical evidence system contract replayed without external storage.

The canonical replacement audit and active release audit use separate reference
surfaces. The active release intentionally publishes its immutable 8,087-record
reference, while the canonical working reference contains 8,089 records. They
must be audited with their corresponding manifests rather than compared across
release boundaries.

## Next Epoch

The next task may execute only the newly controller-authorized P0 manifest. Before
external acquisition, it should first assess whether the expected Bosch or other
brand document family has a reusable official source route. The halted Esatto
acquisition cohort must remain closed until its source or processor epoch changes.

Do not proceed to P1, relax exact-model identity, infer missing dimensions, or
promote any product to `VERIFIED_FIT` merely to improve coverage metrics.
