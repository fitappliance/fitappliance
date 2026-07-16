# Historical Evidence Recovery Runbook

Status: canonical operations guide
Last verified: 2026-07-13
Owner: FitAppliance data and evidence pipeline

This runbook operates the only supported path from a historical document
candidate to a receipt-bound public or replacement-reference dimension. Read
the [product core brief](../product-core-brief.md), the
[recovery plan](../superpowers/plans/2026-07-13-historical-evidence-coverage-recovery.md),
and the
[dimension-expression knowledge base](appliance-dimension-expression-knowledge-base.md)
before changing evidence semantics.

## 1. Safety contract

1. Queue inclusion, download success, MinerU output and parser output are not
   publication approval.
2. Every accepted axis must replay from an immutable raw object, immutable
   MinerU JSON, exact-model identity scope, field semantics and a receipt.
3. A batch with any `retryable_failure`, incomplete resolver inventory, object
   mismatch or receipt mismatch cannot be promoted.
4. Reference or retailer-mirror artifacts are discovery-only. They cannot
   create claims, geometry or receipts.
5. `CURRENT_RETAIL` evidence may enter the current projection only after an
   exact catalogue identity match. `CATALOG_ARCHIVED` evidence may enter only
   the historical replacement reference.
6. W/H/D receipts remain dimensions-only and cannot create `VERIFIED_FIT`.
7. Old run directories and immutable objects are append-only diagnostics. Do
   not edit an old receipt to make a later parser replay pass. Start a new run.
8. The release transaction is one reviewed Git commit containing the cumulative
   acceptance bundle and every projection, reference, shard, manifest and
   audit rebuilt from it.

## 2. Storage and tool preflight

The evidence root is outside Git:

```bash
export FITAPPLIANCE_STORAGE_ROOT=/Volumes/UGREEN-1TB/FitAppliance
test -r "$FITAPPLIANCE_STORAGE_ROOT/.fitappliance-storage-root.json"
jq -e '
  .schemaVersion == 1 and
  .projectId == "fitappliance" and
  .storageRole == "architecture-v2-evidence" and
  .volumeUuid == "5125E5C5-EFF3-3C42-94B7-DF4B340A6AD4"
' "$FITAPPLIANCE_STORAGE_ROOT/.fitappliance-storage-root.json"
diskutil info /Volumes/UGREEN-1TB | rg \
  'Volume Name|Volume UUID|Mounted|Read-Only|Free Space'
node --version
mineru --version
```

The runner also verifies the marker hash, mounted volume UUID, pinned MinerU
version, model revision, queue SHA, policy SHA and batch SHA. Do not bypass a
preflight failure by editing state or marker files.

Run a network-free preflight against a bounded selection:

```bash
npm run recover:historical-evidence -- \
  --dry-run \
  --require-selection \
  --route OFFICIAL_SOURCE_DISCOVERY_REQUIRED \
  --limit 1
```

The CLI is selection-required by default. `--require-selection` makes that
operator intent visible in recorded commands; omitting all `--job-id`, `--route`
and `--limit` values still fails. A future owner-approved all-batch operation
must use explicit `--allow-all`, which cannot be combined with any selection.
The current 1,556-job graph must not use that override.

## 3. Build and inspect the execution graph

Regenerate the next-epoch queue only after the previous release is committed:

```bash
npm run build:historical-evidence-recovery-queue
npm run build:historical-evidence-recovery-batch
```

Inspect route counts before selecting work:

```bash
jq '
  .artifactJobs
  | group_by(.acquisitionRoute)
  | map({route: .[0].acquisitionRoute, jobs: length})
' data/architecture-v2/reviews/automated/historical-evidence-recovery-batch.json
```

Create an explicit job-ID file and verify both job and expanded-target counts:

```bash
jq -r '
  .artifactJobs[]
  | select(.acquisitionRoute == "OFFICIAL_SOURCE_DISCOVERY_REQUIRED")
  | .jobId
' data/architecture-v2/reviews/automated/historical-evidence-recovery-batch.json \
  > /tmp/fitappliance-recovery-job-ids.txt

wc -l /tmp/fitappliance-recovery-job-ids.txt
jq --rawfile ids /tmp/fitappliance-recovery-job-ids.txt '
  ($ids | split("\n") | map(select(length > 0))) as $selected
  | {
      jobs: [.artifactJobs[] | select(.jobId as $id | $selected | index($id))] | length,
      targets: [
        .targets[]
        | select(.candidateJobIds | any(. as $id | $selected | index($id)))
      ] | length
    }
' data/architecture-v2/reviews/automated/historical-evidence-recovery-batch.json
```

Stop if the count is not the reviewed count. A route filter is retained in the
run command as a second boundary even when every job ID is explicit.

## 4. Start a bounded run

Use a unique run ID. Results belong beside state on the evidence disk, not in a
tracked repository file during acquisition:

```bash
job_args=()
while IFS= read -r id; do
  job_args+=(--job-id "$id")
done < /tmp/fitappliance-recovery-job-ids.txt

run_id=historical-recovery-YYYYMMDD-group-a
run_dir="$FITAPPLIANCE_STORAGE_ROOT/runs/historical-evidence-recovery/$run_id"

node scripts/architecture-v2/run-historical-evidence-recovery.mjs \
  --require-selection \
  --route OFFICIAL_SOURCE_DISCOVERY_REQUIRED \
  "${job_args[@]}" \
  --run-id "$run_id" \
  --output "$run_dir/results.json"
```

The run directory contains `batch.json`, `state.json`, `events.ndjson`, the
temporary `lock.json`, and `results.json` after complete accounting. The policy
caps network concurrency at 2, per-host concurrency at 1 and MinerU concurrency
at 1. Operators may reduce these values but cannot exceed the policy.

After completion, verify accounting and build the brand funnel:

```bash
jq '{runId, status, targets: (.targets | length)}' "$run_dir/state.json"
jq '.summary' "$run_dir/results.json"
node scripts/architecture-v2/build-historical-evidence-brand-funnel.mjs \
  --state "$run_dir/state.json" \
  --output "$run_dir/brand-funnel.json"
```

The sum of accepted, retryable and typed terminal outcomes must equal the
selected target count. Zero running or unaccounted targets are allowed.

## 5. Interrupt, resume and lock recovery

Use `SIGINT` or `SIGTERM` for an intentional stop. The runner marks the run
`interrupted`, checkpoints completed objects and targets, and releases its lock.
Resume by run ID. With no new selection flags, the runner loads the immutable
`batch.json` and writes `results.json` in that run directory. This avoids
reconstructing a long job selection at the command line; the state store still
rejects input, policy, queue, storage or toolchain drift:

```bash
node scripts/architecture-v2/run-historical-evidence-recovery.mjs \
  --resume \
  --run-id "$run_id"
```

Do not combine `--resume` with `--allow-all`. Supplying
`--require-selection` on resume intentionally restores the stricter legacy
form and requires the complete original selection.

Do not manually delete `lock.json`. A lock is reclaimable only after the
90-second policy timeout and after its recorded PID plus process-start identity
is no longer live. The runner atomically captures and replaces a stale lock. A
live or non-stale owner must cause the second runner to stop.

If an over-broad batch was started accidentally:

1. interrupt it immediately;
2. verify `state.json` is `interrupted` and inspect its target count;
3. retain the run directory as a diagnostic record;
4. start a new run ID with verified job IDs;
5. never resume the over-broad run merely to reuse its run ID.

The 2026-07-13 `task16-discovery-group-a-20260713` run is the permanent example:
an incorrect shell selection expanded to 1,591 targets, was interrupted before
any target completed, and was superseded by an explicit 17-job run.

## 6. Failure taxonomy

| Outcome or failure | Meaning | Required action |
| --- | --- | --- |
| `accepted` | Complete inventory and replayable exact official receipt | Eligible for online audit, not yet publication |
| `claims_incomplete` | Identity or authority may be valid, but requested axes are incomplete | Keep unknown; improve source or parser in a new run |
| `identity_rejected` | Document does not prove the exact target model | Quarantine; research official alias or exact document |
| `conflict_quarantined` | Exact sources or lower-level evidence expose unresolved conflict | Research supersession or semantic scope; do not choose a value |
| `retryable_failure` | Resolver, network or tool work is incomplete | Resume or rerun; batch cannot promote |
| `source_authority` | Candidate is reference-only or outside current official policy | Keep as discovery input only |
| `artifact attestation receipt mismatch` | Current replay differs from immutable receipt | Treat the old run as non-promotable; restore compatibility or create a new receipt in a new audited run |
| `candidate inventory discovery incomplete` | A required resolver did not finish | Complete discovery; never promote a partial inventory |
| storage/input/tool drift | Run no longer matches its bound environment | Start a new run under an explicit new epoch |

Unknown fields remain unknown. Do not add brand defaults, copy sibling values,
swap axes, flatten ranges or use retailer dimensions to close a failed batch.

## 7. Online audit and explicit promotion

Run full replay with the external evidence root mounted:

```bash
node scripts/architecture-v2/audit-historical-evidence-recovery.mjs \
  --mode online \
  --full \
  --results "$run_dir/results.json" \
  --output "$run_dir/audit-full.json"

jq -e '.status == "passed" and (.violations | length) == 0' \
  "$run_dir/audit-full.json"
```

`--full` replays prior cumulative objects as well as the selected batch. Only a
passing online audit may be promoted:

```bash
node scripts/architecture-v2/promote-historical-evidence-recovery.mjs \
  --results "$run_dir/results.json" \
  --audit "$run_dir/audit-full.json"
```

Promotion appends accepted entries and lineage to the tracked cumulative
bundle. It cannot erase earlier evidence. Re-promoting the same audited batch
must be idempotent.

## 8. Release transaction and rollback

Record the pre-release hashes before promotion:

```bash
sha256sum \
  data/architecture-v2/reviews/automated/historical-evidence-recovery-acceptance-bundle.json \
  data/architecture-v2/generated/public-catalog-projection.json \
  data/architecture-v2/generated/historical-appliance-reference.json \
  data/architecture-v2/generated/historical-reference-publication-manifest.json \
  data/architecture-v2/reviews/automated/historical-replacement-audit.json
```

Rebuild and verify the release as one working-tree transaction. Historical
reference construction is deliberately absent from normal CI because it opens
immutable government snapshots on the external evidence disk. Run the steps in
this order:

```bash
# 1. Project the newly promoted cumulative bundle.
node scripts/architecture-v2/build-public-projection.mjs

# 2. Reconcile registry snapshots, public projection and recovery receipts.
FITAPPLIANCE_STORAGE_ROOT=/Volumes/UGREEN-1TB/FitAppliance \
  npm run build:historical-reference

# 3. Publish and audit all historical shards from that rebuilt reference.
npm run publish:historical-reference
npm run audit:historical-replacement

# 4. Only after the historical reference is published, derive the next epoch.
#    These queues read the released reference and must never be built before it.
npm run build:historical-model-evidence-classification
npm run build:historical-evidence-recovery-queue
npm run build:historical-model-pdf-acquisition-queue
npm run build:historical-executable-recovery-queue
npm run build:historical-evidence-recovery-batch

# 5. Run repository gates. This must replay the tracked reference without disk access.
npm run lint
npm test
env -u FITAPPLIANCE_STORAGE_ROOT npm run build:architecture-v2
env -u FITAPPLIANCE_STORAGE_ROOT npm run build
git diff --check
```

The next-epoch queue step is intentionally outside `build:architecture-v2`.
Rebuilding it before the historical reference creates a mixed epoch: each
individual command may pass, but the committed queue no longer hashes to the
released reference. The queue parity test is the final guard against that
ordering error.

Review all changed tracked artifacts together, including:

- cumulative acceptance bundle;
- append-only attempt ledger, source-level acceptances and failure resolutions;
- acceptance receipt replay audit;
- public catalogue projection and runtime category projections;
- historical reference, four replacement-reference shards and metadata;
- historical publication manifest and replacement audit;
- any source-document or generated identity artifacts deterministically changed
  by the same build.

Commit these files together. Do not deploy an uncommitted partial rebuild.
Normal build and deployment must pass with `FITAPPLIANCE_STORAGE_ROOT` unset.

Rollback is a Git release rollback:

1. revert the complete release commit;
2. rebuild and deploy the reverted tracked artifacts;
3. rerun offline and historical replacement audits;
4. retain immutable external raw, MinerU and run-state objects for diagnosis.

Never delete content-addressed evidence objects as part of a release rollback.

## 9. Controlled scale status on 2026-07-13

| Stage | Measured result | Decision |
| --- | --- | --- |
| Direct official vertical slice | WD8560F1 exact QRG accepted; shared Electrolux sibling isolated | Passed |
| Direct resolver migration | 23 brands, 24 targets, 6 accepted, 0 retryable, 18 typed terminal | Discovery/parser diagnostic complete; interim receipts not promoted |
| Official-host route | 254 planned jobs, 288 targets, 89 accepted, 199 typed terminal, 180 raw/MinerU objects replayed | Passed with zero violations |
| Discovery group A final | 22 targets, 10 accepted, 1 retryable, 11 typed terminal | Not promotable as a whole |
| Discovery group B | 24 targets, 0 accepted, 0 retryable, 24 typed terminal | Full online audit passed; current Esatto/Euromaid authority policy remains fail closed |
| Discovery group C | 16 targets, 0 accepted, 8 retryable, 8 typed terminal | Not promotable |
| Westinghouse release subset | 12 targets, 10 accepted, 0 retryable, 2 identity-rejected; 24 objects replayed | Full online audit passed and eligible for explicit promotion |
| Retailer mirror route | 1,223 jobs not launched | Blocked by `scaleAllowed: false`; single reviewed canary only |

Across the three discovery groups, all 62 target nodes have typed outcomes: 10
accepted, 9 retryable and 43 terminal. No unsafe source or `VERIFIED_FIT`
promotion occurred.

The audited Westinghouse subset increased the cumulative bundle from 2 to 12
entries. Its 10 new entries are all archived models, so the current public
catalogue projection remained byte-stable. Rebuilding the historical reference
changed `MODEL_RECEIPT` and `AUTO_FILL` from 2/13 to 12/23, reduced
`REGISTRY_CONSISTENT` from 4,940 to 4,930, retained 90 quarantines, and passed
the 8,095-record replacement audit.

The release hash ledger is retained below. The unchanged public-projection hash
is the lifecycle-isolation proof for the 10 archived receipts.

| Artifact | Before promotion | Release candidate |
| --- | --- | --- |
| cumulative acceptance bundle | `06fd2debf07999404a541523f51d313719da66521343f07f2c37564bb29bccbb` | `679964cc6543f4d113cc74986eabc733ecc23e3a9bf9c068d2a0e74282a23781` |
| current public projection | `ba699ce0c63b28e5bffa5268b00276918f6eb62ab3fb4f0752c839630aea9047` | `ba699ce0c63b28e5bffa5268b00276918f6eb62ab3fb4f0752c839630aea9047` |
| historical reference | `702527dd0ccbe78a2d00cb143c155def6478e45573774ccbeee4fe544c385254` | `686791586e88bb0b0b4bf5a65aaddb5233bfa13b3ea5163b818f6854a96a346a` |
| historical publication manifest | `ae116e4a48d24ddfb770d2df623919e08a9c8831fc1bfaafb027f86bda6ed8dc` | `176fd4a859a92b4d6e0d23358d9734d41c04e5a8b4239d065123416fd4bf3c8d` |
| historical replacement audit | `998eb26dce3ab7f3f2ffed4c8d938ef76c6067879854e2f6624fd853afbc002d` | `966176a1a3835fbe22cbfcc76e13e3b436767667734937b8e2caa15a3f30053e` |

## 10. Policy epochs and retained legacy code

Esatto and Euromaid have current official web paths that are not yet represented
by the current receipt authority epoch. Do not silently expand an allowlist in a
release that reuses older receipts. A new manufacturer-policy version requires
fresh candidate discovery, object replay and receipt issuance for every affected
entry.

The numbered PDF pipeline, its text parsers, fuzzy merge and vault are retained
only for tests and research compatibility. They cannot issue Architecture V2
receipts or write public data. The `*-official.js` finder modules are still live:
`architecture-v2-resolver-adapters.mjs` imports their discovery exports. Do not
delete those finders until equivalent native resolvers have parity fixtures and
repository search proves no production or Architecture V2 caller remains.

## 11. Automated evidence closure checkpoint on 2026-07-16

Policy `2026-07-16.1` closes the loop at two independent levels:

1. a candidate source can move from a typed failure to a source-level accepted
   fact without erasing the original attempt;
2. the product target is promoted only when all accepted exact-model sources
   reconcile. A source-level acceptance never overrides a target conflict.

Promotion writes three bound artifacts as one operation: the cumulative
acceptance bundle, the append-only attempt ledger and the acceptance-receipt
replay audit. The ledger retains terminal and transient failures, appends
audited resolutions, and records official candidates that parsed successfully
even when the enclosing product remains quarantined. Same-policy terminal
sources and same-policy accepted sources are removed from future fetch edges;
the target remains resolver-only so alternative official evidence can still be
researched. Changing the recovery policy hash deliberately reopens those edges.

The real Hisense `HWF3S8514X` run proves the distinction. Its official user
manual now parses page 11 as width `595`, height `845`, appliance depth `540`
and door-open depth `1020`. The exact-model 2026 specification PDF states
`595 x 845 x 510 mm`. Both sources are retained as successful evidence, but the
target remains `conflict_quarantined`; it is not in the acceptance bundle and
cannot issue a public dimension or Fit claim.

Current measured state:

- cumulative bundle: 251 accepted targets and 276 source receipts, all 276
  replayed from the external evidence store with zero failures;
- attempt ledger: 132 failure entries, 17 resolution events, 151 source-level
  acceptances, 76 active same-policy suppressions and 42 transient retries;
- historical reference: 8,095 records, 218 `AUTO_FILL` and 88 quarantined;
- evidence classification: 270 `COMPLETE_RECEIPT`, 6,417
  `OFFICIAL_DISCOVERY`, 1,171 `REFERENCE_REDISCOVERY`, 154
  `IDENTITY_RESEARCH` and 83 `CONFLICT_QUARANTINE`;
- dimension corpus: 703 MinerU indexes, 702 valid bindings, 974 observations,
  177 parser profiles and 770 parser replays;
- next acquisition epoch: 7,825 queued models, of which 270 complete receipts
  are excluded. The executable view contains 7,742 targets, 7,741 of them
  resolver-only, so future runs must remain explicitly bounded.

Do not use `--allow-all` on a batch containing thousands of resolver-only
targets. It intentionally selects those targets and can launch broad online
discovery. For a reviewed canary or policy replay, pass explicit `--job-id`
values. Use `--allow-all` only when the materialized target and job counts are
small, inspected and intentionally in scope.

## 12. Official structured product API evidence

Manufacturer product APIs may issue a dimensions-only receipt without a PDF,
but only when the stored JSON itself is the immutable source artifact. This is
not a generic permission to trust API or product-feed dimensions.

The source is eligible only when all of these checks pass:

1. the URL belongs to the policy-approved Australian manufacturer API host and
   resolves to one exact product-detail record rather than a search list;
2. the discovery bytes are reused as the source artifact, stored by SHA-256 and
   replayed as valid `application/json`; a second mutable fetch cannot replace
   the bytes used for discovery;
3. the record provides one model identity and a complete explicit width,
   height and depth triple in millimetres;
4. exact identity passes, or the configured market-suffix policy proves a
   punctuation-only spelling variant with identical alphanumeric characters;
5. replay derives the same three claims and identity signals from the stored
   JSON before the receipt is accepted;
6. the projection contains only approved W/H/D. Clearance, door operation,
   plumbing, ventilation and service fields remain unknown and
   `verifiedFitEligible` remains false.

The two ASKO Australia canaries exercised fifteen dishwasher targets. Two exact
API models and eight punctuation-only `.AU` variants were accepted; five older
or sibling forms remained typed `claims_incomplete` or `source_authority`
outcomes. The ten accepted records increased current receipt-bound dimension
publication from 192 to 202 without creating a `VERIFIED_FIT` product or
publication-audit violation. The second, homogeneous DBI canary accepted all
five selected targets and the full online audit replayed 544 cumulative objects
with zero violations. This route must stay manufacturer-specific and
test-backed; do not generalize its spelling policy to another brand without a
new canary and policy epoch.
