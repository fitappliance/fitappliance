# Historical Evidence Recovery Runbook

Status: canonical operations guide
Last verified: 2026-07-19
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
9. An active receipt source embedded in a new batch must be the complete,
   replayable source snapshot: identity, claims, source URL, content hash and
   verification receipt. A compact hash reference is not an executable source.
10. An explicit manufacturer HTML marketing alias may anchor dimensions only
    when the stored page binds the marketing model to one canonical source
    model. Ordinary colour, hinge, suffix or sibling variants still require an
    exact-model anchor and cannot independently publish.
11. A product duplicated across a legacy acceptance lane and the cumulative
    lane may migrate only as a strictly newer equivalent receipt: normalized
    source model, source URL/type, geometry and Fit requirements must match.
    Geometry drift, weaker requirements, an equal timestamp or a reused receipt
    binding stops the build.
12. A complete zero-candidate resolver pass may suppress only the target's
    separately recorded bounded-discovery work under the same recovery policy
    and resolver contract (ID, version, scope and required flag). Resolver-only
    targets must never appear in the ordinary acquisition batch. An incomplete
    resolver remains retryable; a policy change, resolver-contract change or a
    new explicit official candidate reopens the target automatically.
13. Every fresh run, including a dry-run, scans completed run state before it
    creates a run directory or invokes discovery. An unpromoted acceptance or
    complete zero-candidate inventory blocks the same policy and resolver
    contract; another terminal outcome additionally requires the same toolchain
    epoch. Resume is exempt because it continues the immutable run. A malformed
    historical state fails closed. Audit and promote an eligible prior run
    instead of rerunning it.
14. The canonical document-family graph is an inventory and applicability
    control, not a receipt authority. Only `EXACT_MODEL_PROVEN` and
    `MODEL_LIST_PROVEN` edges have internal exact-model evidence. A
    `FAMILY_SCOPE_ONLY` edge may select a canary but cannot fan out dimensions
    or create a receipt for the other models in that family.
15. PDF identity is the immutable PDF SHA-256. Physical copies collapse to one
    node, while one source URL returning different hashes remains multiple
    unordered source versions. Never label one version current or latest unless
    a separate acquisition-time artifact proves that state.
16. Every fresh acquisition or discovery run must use one tracked bounded
    manifest. Legacy job, target, route, brand, category, reference, limit and
    `--allow-all` selectors are prohibited at the CLI boundary. Acquisition and
    discovery manifests are not interchangeable.

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
version, model revision, queue SHA, policy SHA, batch SHA and family-canary
parser contract. Do not bypass a preflight failure by editing state, gate or
marker files.

Run a network-free preflight against the tracked acquisition manifest:

```bash
MANIFEST_ID="$(jq -r '
  .manifests[] | select(.executionLane == "ACQUISITION") | .manifestId
' data/architecture-v2/reviews/automated/historical-evidence-next-batches.json)"
npm run recover:historical-evidence -- \
  --dry-run \
  --manifest-id "$MANIFEST_ID"
```

The CLI rejects every legacy selection flag. Discovery work uses the
candidate-discovery command in section 2.1 with a `BOUNDED_DISCOVERY` manifest.

### 2.1 Materialise official candidates before acquisition

The tracked official-candidate manifest is a network-free projection. Rebuild
it without the evidence disk to replay prior discoveries and classified
official seeds:

```bash
npm run build:historical-official-candidate-manifest
jq '.summary' \
  data/architecture-v2/reviews/automated/historical-official-candidate-manifest.json
```

Online discovery is a separate, manifest-bound operation. Select one tracked
`BOUNDED_DISCOVERY` manifest and supply a unique `--run-id`:

```bash
MANIFEST_ID="$(jq -r '
  .manifests[]
  | select(.workstreamId == "CURRENT_DIMENSIONS")
  | .manifestId
' data/architecture-v2/reviews/automated/historical-evidence-next-batches.json)"
npm run discover:historical-official-candidates -- \
  --manifest-id "$MANIFEST_ID" \
  --network-concurrency 2 \
  --run-id historical-current-discovery-YYYYMMDD-a
```

The runner verifies the external storage marker and volume UUID, writes the
immutable run payload under
`evidence/discovery/sha256/<sha-prefix>/<sha>.json`, then writes an immutable
run pointer under `evidence/discovery/runs/<run-id>.json`, and only then updates
the tracked manifest. If manifest persistence fails after those external
writes, rerun the identical command: the pointer, queue SHA, selection, marker,
content SHA and byte size must all match, and the runner resumes without
calling the network resolvers again. If the tracked manifest already contains
the run ID, the run is complete and duplicate execution is rejected.

`NO_CANDIDATE_COMPLETE` is legal only when every current **required** resolver
matches its declared ID, version, scope and required flag and reports
`complete`. Missing, failed, timed-out, truncated or version-drifted required
results remain `DISCOVERY_RETRYABLE`. Retailer, registry and mirror candidates
remain reference hints even when they contain an exact model string; they do
not satisfy the official-candidate inventory.

### 2.2 Keep acquisition, discovery and deferred work separate

Rebuild the executable graph only from a candidate manifest whose semantic SHA
is bound to the current acquisition queue. The graph has three disjoint target
partitions:

- `targets`: ordinary acquisition work; every row has at least one explicit
  candidate edge and may enter the evidence recovery batch;
- `discoveryTargets`: resolver-only work; these rows are control-plane inputs
  for separately bounded candidate-discovery batches and never enter the
  ordinary recovery batch;
- `deferredTargets`: non-executable rows carrying a target-level reason such as
  `RESEARCH_REQUIRED`, `NO_CANDIDATE_COMPLETE` or
  `ACTIVE_RESOLVER_SUPPRESSION`.

The current tracked graph contains six acquisition targets and six fetch jobs,
4,982 bounded-discovery targets, and 2,700 deferred targets. The six acquisition
targets are conflict-closure evidence work. Their products remain
`CONFLICT_QUARANTINE`; fetching new evidence does not release publication.

Never reconstruct fetch jobs from retailer hints or directly from unresolved
acquisition rows. Never copy a discovery target into `targets` to make the
recovery runner accept it. Rebuild the official-candidate manifest instead.

### 2.3 Rebuild and inspect the canonical document graph

The committed dimension-expression knowledge artifact contains one flat
`indexedDocuments` record for every MinerU index. Rebuilding the graph from
that committed index is network-free and does not require the evidence drive:

```bash
npm run build:historical-document-family-graph
jq '{
  indexed: .summary.indexedPdfDocuments,
  valid: .summary.validIndexedPdfDocuments,
  invalid: .summary.invalidIndexedPdfDocuments,
  unique: .summary.uniquePdfDocuments,
  families: .summary.documentFamilies,
  modelEdges: .summary.modelEdges,
  byProofLevel: .summary.byProofLevel,
  nonPdfLinks: .summary.nonIndexedClassificationLinksByLane
}' data/architecture-v2/generated/historical-document-family-graph.json
```

To refresh the committed MinerU index from immutable external objects, mount
the evidence drive and run the knowledge builder first:

```bash
FITAPPLIANCE_STORAGE_ROOT=/Volumes/UGREEN-1TB/FitAppliance \
  npm run build:dimension-expression-knowledge
npm run build:historical-document-family-graph
npm run build:historical-evidence-program-status
```

Every PDF hash must have exactly one graph node. `EXACT_MODEL_PROVEN` requires
a current exact-model receipt or an exact MinerU locator/replay;
`MODEL_LIST_PROVEN` requires an explicit internal model row or model-list
locator. Filenames, URL hints, family membership and classification
associations alone stay `FAMILY_SCOPE_ONLY` or `ALIAS_RESEARCH`. Classification
links to official HTML or JSON evidence remain in
`nonIndexedClassificationLinks`; do not fabricate PDF graph nodes from their
content hashes.

### 2.4 Build and inspect the family canary gate

Build the gate after both the canonical document graph and executable queue are
current. This command is network-free and external-drive-independent:

```bash
npm run build:historical-evidence-family-canaries
jq '{
  states: .summary.byFamilyState,
  unscopedSingletons: .summary.unscopedSingletonTargets,
  multiFamilySingletons: .summary.multiFamilySingletonTargets,
  runnerAllowed: .summary.runnerAllowedTargets,
  fanoutEligible: .summary.fanoutEligibleTargets
}' data/architecture-v2/reviews/automated/historical-evidence-family-canaries.json
```

`PASSED` means one exact-model representative overlaps a current materialised
source under the same family, resolver, policy and parser contract. Only that
state authorises sibling fan-out. `CANARY_READY` and `REOPENED` authorise only
the recorded representative. A failed family blocks all of its members until a
bound contract changes. Targets with no canonical family or multiple families
remain explicit singleton work; they never authorise either family.

Fresh runs read the tracked gate and persist the exact value as
`family-canaries.json` in the run directory. Resume reads only that run-local
snapshot. A legacy run without the snapshot fails closed; do not copy the
current tracked gate into an old run directory.

### 2.5 Build the deterministic next manifests

Build manifests only after the executable queue, target-state projection and
family gate are current:

```bash
npm run build:historical-evidence-bounded-batches
jq '{summary, workstreams, manifests: [.manifests[] | {
  manifestId, workstreamId, mode, executionLane, constraints,
  targets: (.targetBindings | length), reviewedTargetCount
}]}' data/architecture-v2/reviews/automated/historical-evidence-next-batches.json
```

The artifact contains at most one next manifest per workstream and at most ten
targets per manifest. A family canary and an unscoped or ambiguous singleton
contain one target. A passed-family expansion may contain up to ten targets but
must retain one exact priority, lifecycle, category, brand, family and execution
lane. Empty workstreams remain explicit. `CONFLICT_QUARANTINE` may enter only
conflict closure with an exact pending-work binding and remains publication
ineligible.

## 3. Build and inspect the execution graph

Regenerate the next-epoch queue only after the previous release is committed:

```bash
npm run build:historical-document-family-graph
npm run build:historical-model-pdf-acquisition-queue
npm run build:historical-official-candidate-manifest
npm run build:historical-executable-recovery-queue
npm run build:historical-evidence-family-canaries
npm run build:historical-evidence-target-state
npm run build:historical-evidence-bounded-batches
npm run build:historical-evidence-recovery-batch
```

Inspect and prove the partition before any runner invocation:

```bash
jq '{
  manifest: .sourceOfficialCandidateManifestSha256,
  acquisitionTargets: .summary.acquisitionTargets,
  discoveryTargets: .summary.discoveryTargets,
  deferredTargets: .summary.deferredTargets,
  fetchJobs: .summary.fetchJobs,
  candidateEdges: .summary.candidateEdges,
  resolverOnlyTargets: .summary.resolverOnlyTargets,
  deferredByReason: .summary.deferredByReason
}' data/architecture-v2/reviews/automated/historical-executable-evidence-recovery-queue.json
```

Stop if `acquisitionTargets` is non-zero while `fetchJobs` or `candidateEdges`
is zero, if `resolverOnlyTargets` is non-zero, or if the three target partitions
do not sum to `acquisitionRecords`.

Stop before runner invocation if the selected target has `runnerAllowed: false`
in the family-canary artifact. Do not alter the batch to substitute a sibling.

Inspect the tracked next manifests before selecting work:

```bash
jq '[.manifests[] | {
  manifestId,
  workstreamId,
  mode,
  executionLane,
  constraints,
  reviewedTargetCount,
  targets: (.targetBindings | length),
  estimatedSharedArtifactCount
}]' data/architecture-v2/reviews/automated/historical-evidence-next-batches.json
```

Stop if a manifest has more than ten targets, mixes constraints, names an empty
target list, or uses the wrong execution command for its lane. The runner
revalidates these bindings; the inspection is the operator review boundary.

## 4. Start a bounded acquisition run

Use a unique run ID. Results belong beside state on the evidence disk, not in a
tracked repository file during acquisition:

```bash
run_id=historical-recovery-YYYYMMDD-group-a
run_dir="$FITAPPLIANCE_STORAGE_ROOT/runs/historical-evidence-recovery/$run_id"
manifest_id="$(jq -r '
  .manifests[] | select(.executionLane == "ACQUISITION") | .manifestId
' data/architecture-v2/reviews/automated/historical-evidence-next-batches.json)"

node scripts/architecture-v2/run-historical-evidence-recovery.mjs \
  --manifest-id "$manifest_id" \
  --run-id "$run_id" \
  --output "$run_dir/results.json"
```

The run directory contains `batch.json`, `bounded-manifest.json`, `queue.json`,
`target-state.json`, `family-canaries.json`, `policy.json`, `state.json`,
`events.ndjson`, the temporary `lock.json`, and `results.json` after complete
accounting. The policy
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
Resume by run ID. The runner loads only the immutable run-local batch,
manifest, queue, target state, family gate and policy. The state store still
rejects input, storage or toolchain drift:

```bash
node scripts/architecture-v2/run-historical-evidence-recovery.mjs \
  --resume \
  --run-id "$run_id"
```

Do not supply a new input or manifest path on resume. An optional
`--manifest-id` must match the run-local snapshot.

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
npm run build:historical-evidence-family-canaries
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
- family-canary gate and its queue, policy, parser and processor bindings;
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
the target moves to separately bounded discovery when alternative official
evidence can still be researched. Changing the recovery policy hash
deliberately reopens those edges.

The real Hisense `HWF3S8514X` run proves the distinction. Its official user
manual now parses page 11 as width `595`, height `845`, appliance depth `540`
and door-open depth `1020`. The exact-model 2026 specification PDF states
`595 x 845 x 510 mm`. Both sources are retained as successful evidence, but the
target remains `conflict_quarantined`; it is not in the acceptance bundle and
cannot issue a public dimension or Fit claim.

Current measured state:

- cumulative bundle: 255 accepted targets and 280 source receipts, all 280
  replayed from the external evidence store with zero failures;
- attempt ledger: 140 failure entries, 17 resolution events, 155 source-level
  acceptances, 84 active same-policy suppressions and 42 transient retries;
- historical reference: 8,095 records, 219 `AUTO_FILL` and 88 quarantined;
- evidence classification: 274 `COMPLETE_RECEIPT`, 6,416
  `OFFICIAL_DISCOVERY`, 1,170 `REFERENCE_REDISCOVERY`, 152
  `IDENTITY_RESEARCH` and 83 `CONFLICT_QUARANTINE`;
- dimension corpus: 703 MinerU indexes, 702 valid bindings, 974 observations,
  177 parser profiles and 770 parser replays;
- next acquisition epoch: 7,821 queued models, of which 274 complete receipts
  are excluded. The executable view contains 7,738 resolver-only targets and
  no materialized fetch edge, so future runs must remain explicitly bounded.

The former `--allow-all`, `--job-id`, route and ad hoc resolver-only execution
paths have been removed. Historical examples below describe old runs but are
not valid current commands. Always rebuild and execute a tracked bounded
manifest.

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

## 13. Adjustable-height exact-model PDF evidence

The Fisher & Paykel `DW60UN4B2` and `DW60UN4X2` canary accepted two exact
Australian quick-reference PDFs. MinerU page-one evidence proves width `597`,
adjustable height `820-880` and depth `574` millimetres for each exact model.
The full online audit checked both targets and 550 cumulative objects with zero
repairs or violations; receipt replay then passed all 278 cumulative sources.

These receipts deliberately do not increase historical `AUTO_FILL`. The legacy
replacement index requires a scalar W/H/D triple and must not flatten an
adjustable-height range. The public projection may show the range through
`geometry_v2`, but installation, operation and rear-service fields remain
unknown, the successful Fit outcome remains `INSUFFICIENT_DATA`, and
`verifiedFitEligible` remains false.

The manufacturer resolver also found family and multi-model installation
guides whose filenames contain these models. Current identity attestation
rejected those guides, so they cannot donate clearance or service claims. Treat
that as a separate exact-scope research canary: prove the target model's scope
and field applicability from the stored document before changing identity
policy. Do not infer installation fields from the accepted QRG dimensions.

## 14. Fisher & Paykel DW60CH support-family evidence

`DW60CHW1` is the first accepted target from the Fisher & Paykel AU/NZ
`DW60CH`, `DW60CHP` and `DW60CK` installation family. The family document is
eligible only when a hash-bound official support API response proves the exact
product, links the stored installation article, and the document itself has one
AU/NZ cover scope plus one Product Dimensions table. A filename or sibling
model match is insufficient.

The real MinerU table collapses the height labels and values into one row. The
parser may repair only the observed local joins `productwith` and `placewith`.
It accepts the first of two height ranges only when the row explicitly orders
`with top panel in place` before `with top panel removed`; missing, reversed or
duplicated semantics fail closed. The accepted closed envelope is width `598`,
installed height `850-870` and depth `612` millimetres. The removed-panel
height, open-door depth, cavity dimensions and water or electrical fields are
not projected from this receipt.

The bounded run `historical-fp-dw60chw1-20260716-c` accepted one target. Its
full online audit checked 554 cumulative objects with zero repairs or
violations, and cumulative receipt replay passed all 279 sources. Public
receipt-bound dimensions increased to 205, while receipt-bound
`VERIFIED_FIT` remained zero. The product remains `INSUFFICIENT_DATA` for a
successful Fit conclusion because installation, operation and service-space
requirements are unknown.

`DW60CEW1` did not expose an exact official document under the same discovery
path. It remains `REFERENCE_REDISCOVERY`, stays in the executable queue without
a candidate fetch job, and is not publication eligible. Do not widen the
DW60CH family policy to absorb it.

## 15. Samsung SRF5300SD marketing-model migration

The Samsung Australia product page for `SRF5300SD` explicitly binds that
marketing model to technical model `RF44A5202SL/SA` and states width `817`,
height `1776` and depth `715` millimetres. The global family manual remains a
reference candidate only because it lacks Australian discovery provenance.
The exact AU HTML page is the sole executable source for this acceptance.

The bounded run `historical-samsung-srf5300sd-20260716-e` accepted one target
as `official_marketing_alias`. Its full audit replayed all prior objects without
a violation, and cumulative replay now passes 280 of 280 source receipts. The
receipt supersedes the older identity-range HTML receipt only at publication:
the source URL, normalized technical model, dimensions, form factor and Fit
requirements are equivalent, while the content hash, receipt binding and
verification timestamp are newer.

The release-level Fit audit reports 205 dimensions-only receipt-bound
products: 204 carry an acceptance projection and one earlier Westinghouse
`WHE6874BA` row carries direct receipt-bound manufacturer geometry. These are
two publication provenance paths under the same geometry classifier, not a
missing Samsung projection. Aggregate checks must use
`auditPublicFitProjection()` rather than counting `evidence.acceptance` rows.

Current publication also restores form factor from explicit catalogue wording
before calculating Fit requirements. `French Door` makes this product
`upright`, so missing door-open depth remains a mandatory Fit gap. Across the
release this safety projection affected 37 fridges and 14 washing machines:
W/H/D, clearance, retailer data and flags were unchanged; missing requirements
only increased, no product gained `VERIFIED_FIT`, and the Fit publication audit
reported zero violations. Do not infer a form factor from brand or dimensions
alone. Unrecognized wording must remain unknown. This re-projection is a
requirements safety correction only: it must fail the build if it would raise
the stored evidence level, make `verifiedFitEligible` true, or produce a
`VERIFIED_FIT` outcome. HTML marketing aliases likewise require all three
explicit `document_title`, `canonical_source_model`, and
`official_alias_binding` signals again at the publication boundary.

## 16. ASKO current API boundary and zero-candidate closure

The bounded run `historical-asko-current-au-dishwashers-20260716-b` tested the
remaining current ASKO dishwasher models already expressed as exact Australian
technical SKUs. The official ASKO PIM returned one exact record per target and
the run accepted all three as dimensions-only evidence:

| Model | Width | Height | Depth |
| --- | ---: | ---: | ---: |
| `DBI654IBXXL.S.AU` | 596 | 859 | 559 |
| `DFI654BXXL.AU` | 596 | 859 | 559 |
| `DFI666GXXL.AU` | 596 | 859 | 574 |

The full online audit replayed 558 cumulative objects with no repairs or
violations. Cumulative receipt replay now passes 283 of 283 sources. Historical
`MODEL_RECEIPT` is 211, `AUTO_FILL` is 222 and the public Fit audit reports 208
dimensions-only receipt-bound products, zero `VERIFIED_FIT` products and zero
violations. Installation, door-open and rear-service requirements remain
unknown for all three models.

The same adapter returned a complete zero-candidate inventory for `D5424SS`,
`D5436SS`, `D5436SSXXL`, `D5436WH`, `D5646SSXXL` and `DWCBI241`. The official
manuals/PIM resolver, core discovery and batch resolver all completed; no URL
was fetched and MinerU was never invoked. Treat this as an official historical
coverage gap, not a parser failure and not permission to promote the existing
retailer PDF hints.

Run `historical-asko-legacy-dishwashers-20260716-d` records those six outcomes
as target-level resolver attempts. Under the same policy they are omitted only
when they would otherwise be resolver-only; a newly discovered explicit
official URL still creates a job. The next executable epoch therefore contains
7,729 targets, with six prior resolver-only targets suppressed. Do not encode a
permanent brand exclusion: the queue binds the stored attempt to the actual
resolver contract, so a resolver version/scope change, policy revision or new
official candidate must reopen it.

## 17. Fisher & Paykel WA60 top-loader family evidence

The WA60 recovery uses two separate document grammars and must not collapse
them into one fuzzy family rule. `WA7560E1` is bound by an exact Australian
support API product response whose indexed `documentResources` record preserves
the document index, title key, original filename, API-response hash and direct
artifact URL. The current manual requires one AU/NZ cover expression containing
the target model without its final generation digit and one hybrid-confirmed
`WA**60*` Product Dimensions table. The primary MinerU parse lost that table
caption because the page combines diagrams and a complex table; automatic
fallback therefore reparses page 7 only with `hybrid-image-high-v1` and binds
the merged JSON to both the primary trigger hash and processed-page map.

`WA7060E1` and `WA7060G1` use the older installation manual. Their exact
support API products each bind the same installation article; a generic support
search result or sibling product is insufficient. The legacy grammar requires
all of the following in one immutable MinerU document: the exact base model on
the AU/NZ cover, one `WA⁺'60` dimensions table, and one same-page capacity table
containing the numeric family wildcard `WA7060*`. The capacity-table fragment
hash is part of the identity signal. This allows the shared physical table to
serve the explicitly listed E and G variants without allowing an unlisted
suffix or another WA family to inherit values.

Both grammars prove width `600`, adjustable overall height `1045-1075` and
closed depth `600` millimetres. The current grammar may accept `20` millimetres
per side only when the independent cavity equation `600 + 20 + 20 = 640`
reconciles, and may accept rear clearance only from an explicit rear row. The
legacy receipt publishes dimensions only. Never reinterpret its compound
`660` millimetre allowance as a `60` millimetre rear clearance, and never
project lid-open height, standpipe values, plumbing or service space from these
dimension receipts.

The immutable diagnostic run `historical-fpa-wa-washers-20260716-a` remains a
failed pre-fix record. Run `historical-fpa-wa60-washers-20260716-b` accepted
`WA7560E1` after the direct-resource and hybrid fixes; the two legacy targets
remained identity-rejected and were recorded before promotion. After a new
resolver/parser/policy epoch, run
`historical-fpa-wa60-legacy-washers-20260716-c` accepted only `WA7060E1` and
`WA7060G1`. The two full online audits replayed 571 and 575 cumulative objects
respectively with zero repairs or violations; cumulative receipt replay passes
all 290 sources.

These three products remain dimensions-only with `verifiedFitEligible=false`
and successful Fit outcome `INSUFFICIENT_DATA`. The historical replacement
reference intentionally records `MODEL_RECEIPT_NON_SCALAR`: its current public
schema requires a fixed W/H/D triple, so an adjustable-height receipt completes
PDF research but does not become `AUTO_FILL`. Do not flatten the range to its
minimum, maximum or midpoint. A later range-aware replacement design must ask
for the installed height or preserve the range explicitly.

Run `historical-fpa-wa60-followup-20260716-d` is also immutable and must not be
rerun. It found only New Zealand reference pages for `WA7060G2`, `WA8060E1`
and `WA8060P1`; `WA8060G1` had an exact Australian support route, but the
captured page was a generic shell with no supported dimension claims or bound
document resource. All four outcomes were terminal, with no retryable failure.

The attempt ledger treats a complete resolver inventory as exhausted when it
contains no accepted or retryable source and every discovered candidate is
either `reference_only` or has a typed terminal outcome. Such a result creates
a target-level suppression bound to the policy hash and resolver contract. It
prevents a resolver-only target from being selected again under the identical
epoch. A changed policy, resolver version/scope, or newly materialized official
source reopens the target; incomplete discovery and transport failures never
create this suppression. Re-auditing the same immutable results is idempotent:
the first valid audit receipt is retained unless a bound source or semantic
fact actually changes.

## 18. Beko DFN range evidence boundary and repeated-run guard

Run `historical-beko-dfn-20260716-a` selected `DFN16420W`, `DFN16420X`,
`DFN28430W` and `DFN28430X`. The batch resolver, generic official discovery
and Beko official resolver all completed with zero official candidates. The
full online audit checked four targets and 575 cumulative objects with zero
repairs or violations; promotion recorded four target-level
`complete_zero_candidate_inventory` attempts. The refreshed executable queue
contains 7,720 targets, with eight prior resolver-only targets suppressed.

Australian retailer mirrors contain Beko-authored specification pages for all
four models and express width `598`, depth `600` and adjustable height
`850-865` millimetres. They remain reference-only because their delivery host
and discovery path do not establish current manufacturer authority. The old
catalogue flattened the range inconsistently to either `850` or `865`; neither
scalar may be treated as the closed-envelope height. Expired WELS registrations
prove that the exact model identities existed in Australia, but WELS does not
prove dimensions or current availability. No Energy Rating active exact match
was found in the bound registry snapshot.

The existing Beko MinerU grammar correctly preserves the adjustable range and
rejects packaged dimensions. Do not weaken source authority merely because the
parser is ready. Reopen these targets only when a policy-approved exact official
artifact is materialized, the Beko resolver contract changes, or a reviewed
policy epoch explicitly admits a new source class. Retailer mirrors may guide
discovery and parser tests but cannot create a receipt or public geometry.

This run also exposed an operational hole: a completed but not yet promoted run
could previously be selected again because only the cumulative attempt ledger
was consulted. Fresh-run preflight now scans every immutable `state.json` under
`runs/historical-evidence-recovery`. A real canary against `DFN16420W` was
blocked before network or run-state creation with reason
`completed_exhausted_source_discovery`. Unit and runner-level tests assert the
same behavior. This guard is not a permanent model blacklist: policy, resolver
contract and, for parser terminals, toolchain identity define the rerun epoch.

## 19. Bosch Series 6 dishwasher specification evidence

Run `historical-bosch-series6-dishwashers-20260716-a` selected three current
Bosch Australia dishwasher models. The Bosch adapter bound each exact AU
product page and serialized technical-document manifest before acquiring the
manufacturer spec sheet. The accepted dimensions are:

| Model | Installation type | Width | Adjustable height | Depth |
| --- | --- | ---: | ---: | ---: |
| `SMU6HAS01A` | built-under | 598 | 815-875 | 573 |
| `SMU6HCS01A` | built-under | 598 | 815-875 | 573 |
| `SMV6HCX01A` | fully integrated | 598 | 815-875 | 550 |

Every value comes from page 2 of an exact-model `en-AU` Bosch spec sheet whose
heading states `Product Dimensions (H x W x D)`. MinerU retained the axis order,
millimetre unit, range, page, bounding box and fragment hash. Visual rendering
of all three evidence pages matched the receipt projections. The associated
60-page user manuals were processed and retained for provenance, but the spec
sheets alone supplied the accepted dimension claims; typed terminal outcomes
from non-contributing sources remain in the attempt ledger.

The full online audit checked three targets and 581 cumulative objects with no
repair or violation. Cumulative receipt replay passes all 293 sources. Public
receipt-bound dimensions increased from 215 to 218, while receipt-bound
`VERIFIED_FIT` remained zero. The installation, door-open and rear-service
requirements are unknown, so all three successful Fit outcomes remain
`INSUFFICIENT_DATA`.

These adjustable-height receipts increase `COMPLETE_RECEIPT` classification to
287 but do not increase historical `AUTO_FILL`. The replacement-reference
schema still requires a scalar W/H/D triple. Do not flatten `815-875` to a
minimum, maximum or midpoint; preserve it until the replacement mode becomes
range-aware or asks for the installed height.

## 20. Bosch Series 8 dishwasher specification evidence

Run `historical-bosch-series8-dishwashers-20260716-a` selected three current
Bosch Australia built-under dishwasher models. The accepted dimensions are:

| Model | Width | Adjustable height | Depth |
| --- | ---: | ---: | ---: |
| `SMU8ECS01A` | 598 | 815-875 | 573 |
| `SMU8EDS01A` | 598 | 815-875 | 573 |
| `SMU8ZCS01A` | 598 | 815-875 | 573 |

Every value comes from page 2 of an exact-model `en-AU` Bosch specification
sheet. The page heading states `Product Dimensions (H x W x D)` and the source
line states `Height 815-875 mm x Width 598 mm x Depth 573 mm`. Visual rendering
of all three pages matched the MinerU `content_list_v2` claims and their
receipt-bound projections. The model identifier, source URL, axis order, unit,
page, bounding box, fragment hash and original PDF hash remain independently
bound in each receipt.

The product-page manifests also exposed user and installation documents. Those
artifacts were attempted and their typed failures remain in the immutable run
history, but they did not contribute claims because they did not prove both
exact-model identity and explicit axes under the current policy. Feature text
such as `AutoDoor` is not evidence of a door-open envelope.

The full online audit checked three targets and 587 cumulative objects with no
repair or violation. Cumulative receipt replay passes all 296 sources. Public
receipt-bound dimensions increased from 218 to 221; receipt-bound
`VERIFIED_FIT` remains zero. Installation clearances, door-open depth and rear
service space remain unknown, so all three Fit outcomes are
`INSUFFICIENT_DATA`.

The executable queue decreased from 7,717 to 7,714 targets and current-retail
P0 missing-dimension targets decreased from 948 to 945. `COMPLETE_RECEIPT`
increased to 290 and `ALL_AXIS_RANGE` to 74, while historical `AUTO_FILL`
remains 226 because the replacement-reference schema cannot safely flatten an
adjustable height range.

## 21. Bosch Series 4 dishwasher specification evidence

Run `historical-bosch-series4-dishwashers-20260716-a` selected three current
Bosch Australia dishwashers. The accepted exact-model dimensions are:

| Model | Installation type | Width | Adjustable height | Depth |
| --- | --- | ---: | ---: | ---: |
| `SMU4HTS01A` | built-under | 598 | 815-875 | 573 |
| `SMU4HVS01A` | built-under | 598 | 815-875 | 573 |
| `SMV4HTX01A` | fully integrated | 598 | 815-875 | 550 |

Every claim comes from page 2 of an exact-model Bosch Australia specification
sheet. Each page explicitly states `Product Dimensions (H x W x D)`, and
visual inspection matched the MinerU axis order, range and fixed values. The
official product-page manifests and associated user manuals were also retained
with hash-bound discovery provenance. Bounded MinerU fallback processed only
selected page ranges when a long manual needed another pass; non-contributing
manual outcomes remain typed attempts and cannot replace the spec-sheet claims.

The full online audit checked three targets and 593 cumulative objects with no
repair or violation. Cumulative receipt replay passes all 299 sources. Public
receipt-bound dimensions increased from 221 to 224; receipt-bound
`VERIFIED_FIT` remains zero. Installation clearances, door-open depth and rear
service space are still unknown, so all three Fit outcomes remain
`INSUFFICIENT_DATA`.

The executable queue decreased from 7,714 to 7,711 and current-retail P0
missing-dimension targets decreased from 945 to 942. `COMPLETE_RECEIPT`
increased to 293 and `ALL_AXIS_RANGE` to 77. Historical `AUTO_FILL` remains
226 because the adjustable height cannot be flattened into the scalar
replacement-reference schema.

## 22. Beko minimum-height grammar and parser-epoch replay

Run `historical-beko-38450-dishwashers-20260716-a` selected `DDN38450`,
`DFN38450W`, `DFN38450X`, `DIN38450` and `DSN28435X`. The first four targets
completed all required resolvers with zero official candidates. Their
target-level attempts are retained as complete source-discovery exhaustion and
must not be run again under the same resolver and source-policy epoch.

`DSN28435X` exposed a parser gap rather than missing evidence. Page 1 of the
exact Beko Australia product PDF explicitly separates the unpackaged dimensions
from a later packaged block:

| Field | Accepted value |
| --- | ---: |
| Unpackaged width | 598 mm |
| Unpackaged height | 850-865 mm |
| Unpackaged depth | 600 mm |

The strict grammar
`beko_au_dishwasher_product_spec_min_height_inline_pairs_v1` requires the
unique exact-model page header, one `Dimensions & Weights` heading, the complete
minimum-height / maximum-feet-height / width / depth paragraph, and the complete
separate packaged paragraph. The packaged block proves envelope separation but
does not contribute values. The adjacent `570 mm without top lid` note is not
the closed product depth, and no door-open, installation, plumbing or service
claim is inferred.

The original five-target run passed a full online audit over 593 cumulative
objects and records the four zero-candidate outcomes. After the grammar change,
the unique run `historical-beko-dsn28435x-parser-replay-20260716-b` reopened only
the parser terminal and accepted the exact PDF. Its full online audit replayed
596 cumulative objects with zero repairs or violations. Promotion increased the
cumulative bundle to 275 targets and 300 source receipts; all 300 receipts
replay. The product remains dimensions-only with
`verifiedFitEligible=false` and successful Fit outcome `INSUFFICIENT_DATA`.
After the release transaction, `COMPLETE_RECEIPT` is 294,
`ALL_AXIS_RANGE` is 78, the executable queue contains 7,706 targets and the
current-retail missing-dimension P0 lane contains 937 targets. Historical
`AUTO_FILL` remains 226 because this adjustable range is not flattened.

Fresh-run toolchain identity now binds the explicit claim-parser revision and a
content hash over the claim parsing, identity verification, reconciliation and
geometry implementation files. A parser implementation change therefore opens
a new parser epoch even before commit, while complete zero-candidate source
discovery remains suppressed. A blocked dry run creates no state and must not be
blindly retried; fix or intentionally change the bound epoch first.

The regenerated dimension-expression corpus contains 755 MinerU indexes. Eleven
are deliberately excluded as `ORPHANED_SOURCE_PDF`: ten are unbound ASKO
single-page diagnostic cache entries and one predates this recovery batch. They
have no content-addressed source PDF, source URL or run-state identity and cannot
become parser observations, receipts or publication inputs. Diagnostic parsing
must use an isolated profile/cache or `cache: false`; only source-bound indexes
belong in the durable evidence corpus.

## 23. Westinghouse compact hinge models and cosmetic exact identity

The archived catalogue stores four bottom-mount fridge variants without the
separator used by Westinghouse Australia:

| Catalogue model | Official page model | Width | Height | Depth |
| --- | --- | ---: | ---: | ---: |
| `WBE4504BBL` | `WBE4504BB-L` | 699 | 1725 | 769 |
| `WBE4504BBR` | `WBE4504BB-R` | 699 | 1725 | 769 |
| `WBE4504SBL` | `WBE4504SB-L` | 699 | 1725 | 769 |
| `WBE4504SBR` | `WBE4504SB-R` | 699 | 1725 | 769 |

The resolver may reconstruct the final hinge separator only for the researched
Westinghouse `WBE4504BB` and `WBE4504SB` fridge series when the compact identifier
ends in `L` or `R`. It emits the explicit `base-L` or `base-R` product page and
the compact product-page fallback, marks both as required, and skips the compact-
model factsheet lookup that is known to return 404. Unknown series retain the
factsheet lane. This rule does not create a base-model PDF alias.

HTML identity treats punctuation as cosmetic only when one complete model token,
after removing `-`, `_`, `/` and `.`, equals the complete target identifier.
It must not accept a prefix. For example, `WBE4504BB-L` is exact for
`WBE4504BBL`, while `WTB4600SC-R` remains a field-limited official marketing
alias for `WTB4600SC`. The first full replay exposed this boundary by rejecting
two existing WTB receipts after an over-broad implementation added duplicate
identity signals. The token-exact rule restored both historical receipts before
promotion; no audit exception or receipt rewrite was used.

Runs `historical-westinghouse-wbe4504-fridges-20260716-a` and
`historical-westinghouse-wbe4504-hinge-replay-20260716-b` are diagnostic terminal
runs from before URL reconstruction and cosmetic exact identity respectively.
They must not be promoted or restarted. The unique final run
`historical-westinghouse-wbe4504-cosmetic-replay-20260716-c` accepted all four
models. Its full online audit checked four targets and 600 cumulative objects
with zero repairs and zero violations.

Promotion increased the cumulative bundle to 279 targets and 304 source
receipts; all 304 receipts replay. Public receipt-bound dimensions increased
from 225 to 229, while receipt-bound `VERIFIED_FIT` remains zero. The four
products remain dimensions-only with `verifiedFitEligible=false` and successful
Fit outcome `INSUFFICIENT_DATA`; installation clearances, door-open depth and
rear service space remain unknown. After the release transaction,
`COMPLETE_RECEIPT` is 298, historical `AUTO_FILL` is 230, the executable queue
contains 7,702 targets and the current-retail missing-dimension P0 lane contains
933 targets.

## 24. Bosch legacy dishwasher product-page recovery

Run `historical-bosch-legacy-dishwashers-20260716-e` selected four current Bosch
Australia dishwashers that had not been attempted in the current policy and
toolchain epoch:

| Model | Width | Height | Depth |
| --- | ---: | ---: | ---: |
| `SMI50M05AU` | 598 | 815 | 573 |
| `SMI68M25AU` | 598 | 815 | 573 |
| `SMP63M05AU` | 598 | 815 | 573 |
| `SMS40E02AU` | 600 | 845 | 600 |

Each accepted source is the exact Bosch Australia product page. Its canonical
URL, document title and structured product model bind the complete target
identifier, while the structured specification states `Dimensions of the
product (HxWxD)` with an explicit millimetre triple. The receipt therefore
preserves the source order as height, width, depth instead of treating the
legacy catalogue order as evidence.

The product-page manifests also exposed official user and installation PDFs.
Those documents were downloaded, converted to immutable MinerU
`content_list_v2` objects and attempted, but did not contribute claims because
their parsed bodies lacked the structured exact-model identity required by the
current policy. Deterministic legacy specification URLs that returned 404 are
typed transport attempts, not evidence gaps hidden by the accepted HTML source.

The full online audit checked four targets and 604 cumulative objects with zero
repairs and zero violations. Promotion increased the cumulative bundle to 283
targets and 308 source receipts; all 308 receipts replay. Public receipt-bound
dimensions increased from 229 to 233, while receipt-bound `VERIFIED_FIT`
remains zero. All four products are dimensions-only with
`verifiedFitEligible=false` and successful Fit outcome `INSUFFICIENT_DATA`.

After the release transaction, `COMPLETE_RECEIPT` is 302, historical
`AUTO_FILL` is 234, the executable queue contains 7,698 targets and the
current-retail missing-dimension P0 lane contains 929 targets. All four target
IDs are absent from the next-epoch executable queue and batch. The earlier ASKO
run `historical-asko-legacy-dishwashers-20260716-d` remains a separate terminal
run and must not be restarted under the same resolver and policy epoch.

## 25. Bosch legacy dishwasher PDF and product-page recovery

Run `historical-bosch-legacy-dishwashers-20260716-f` selected four additional
current Bosch Australia dishwashers with zero prior attempts:

| Model | Accepted source | Width | Height | Depth |
| --- | --- | ---: | ---: | ---: |
| `SMS50D08AU` | exact product page | 600 | 845 | 600 |
| `SMS50E38AU` | exact product page | 600 | 845 | 600 |
| `SMU46KS01A` | exact-model PDF | 598 | 815 | 573 |
| `SMU50D05AU` | exact product page | 598 | 815 | 573 |

The three product-page receipts use the same exact canonical URL, title,
structured model and explicit `Dimensions of the product (HxWxD)` boundary as
the preceding Bosch batch. `SMU46KS01A` instead uses the official `en-AU`
specification PDF. Its dimension fragment is on page 1 and states H/W/D in
millimetres; exact-model titles on pages 2 and 3, the exact-model PDF URL and
the source PDF hash establish document scope. The receipt keeps the page-1
bounding box, fragment hash and source axis order. The parser does not require
the model token to be duplicated inside the same dimension fragment when those
independent document-level signals are complete.

Other official manuals and deterministic legacy URLs remain typed attempts.
They cannot contribute claims when identity or field coverage is incomplete,
and 404 templates cannot weaken the accepted exact source. All four projections
remain dimensions-only with unknown clearance, door-open and rear-service
fields, `verifiedFitEligible=false` and successful Fit outcome
`INSUFFICIENT_DATA`.

The full online audit checked four targets and 609 cumulative objects with zero
repairs and zero violations. Promotion increased the cumulative bundle to 287
targets and 312 source receipts; all 312 receipts replay. After the release
transaction, public receipt-bound dimensions are 237, receipt-bound
`VERIFIED_FIT` remains zero, `COMPLETE_RECEIPT` is 306, historical `AUTO_FILL`
is 238, the executable queue contains 7,694 targets and the current-retail P0
missing-dimension lane contains 925 targets. All four target IDs are absent from
the next-epoch executable queue and batch.

## 26. Bosch SMU legacy dishwasher range preservation

Run `historical-bosch-legacy-dishwashers-20260716-g` selected eight additional
current Bosch Australia dishwashers with zero prior attempts. Seven models have
fixed `598 x 815 x 573 mm` W/H/D envelopes:

- product-page receipts: `SMU50E05AU`, `SMU50E65AU`, `SMU50L05AU`,
  `SMU50M05AU` and `SMU50M15AU`;
- exact-model PDF receipts: `SMU66JS01A` and `SMU66MS02A`.

`SMU50E75AU` has an exact-model PDF receipt for width 598 mm, adjustable height
815-875 mm and depth 573 mm. The public V2 projection preserves that range.
The scalar historical replacement-reference lane deliberately does not count
it as `AUTO_FILL`; an old-appliance lookup must not silently replace a height
range with one endpoint.

All exact PDFs passed through MinerU `content_list_v2` and retain source URL,
PDF and JSON hashes, page/bounding-box evidence, fragment hash, explicit H/W/D
order and exact-model scope. Product-page receipts retain exact canonical URL,
title and structured-model signals. Non-contributing manuals and 404 legacy
templates remain typed attempts. No source contributes installation clearance,
door-open depth or rear service space, so every projection remains
dimensions-only, `verifiedFitEligible=false` and `INSUFFICIENT_DATA`.

The full online audit checked eight targets and 620 cumulative objects with zero
repairs and zero violations. Promotion increased the cumulative bundle to 295
targets and 320 source receipts; all 320 receipts replay. After the release
transaction, public receipt-bound dimensions are 245, receipt-bound
`VERIFIED_FIT` remains zero, `COMPLETE_RECEIPT` is 314, `ALL_AXIS_RANGE` is 79,
historical `AUTO_FILL` is 245, the executable queue contains 7,686 targets and
the current-retail P0 missing-dimension lane contains 917 targets. All eight
target IDs are absent from the next-epoch executable queue and batch.

## 27. Bosch SMV and SMU fully integrated dishwasher recovery

Run `historical-bosch-legacy-dishwashers-20260716-h` selected eight more Bosch
Australia dishwashers with zero prior target attempts. The dry-run used a
separate preflight ID, and the completed run recorded exactly one attempt for
each target:

| Model | Accepted source | Width | Height | Depth |
| --- | --- | ---: | ---: | ---: |
| `SMU68M25AU` | exact product page | 598 | 815 | 573 |
| `SMU88TS02A` | exact product page | 598 | 815 | 573 |
| `SMU88TS03A` | exact product page | 598 | 815 | 573 |
| `SMU88TS04A` | exact product page | 598 | 815 | 573 |
| `SMV46GX01A` | exact-model PDF | 598 | 815-875 | 550 |
| `SMV50D00AU` | exact-model PDF | 598 | 815-875 | 550 |
| `SMV63M10AU` | exact product page | 598 | 815 | 550 |
| `SMV66JX01A` | exact-model PDF | 598 | 815-875 | 550 |

The three PDF receipts are Bosch Australia specification sheets. MinerU
`content_list_v2` preserves the page-2 dimension fragment, bounding box,
fragment hash, source PDF and JSON hashes, explicit axis labels and exact-model
scope. The five HTML receipts require an exact canonical URL, document title,
structured product model and the explicit `Dimensions of the product (HxWxD)`
label. Downloaded manuals that lack exact-model identity remain typed rejected
attempts and cannot contribute claims.

The 815-875 mm adjustable height is retained as a range in the public V2
projection. Those three records are intentionally excluded from scalar
historical `AUTO_FILL`; only the five fixed envelopes can auto-fill old-
appliance dimensions. All eight remain dimensions-only because installation,
door-open and rear-service evidence is absent, so `verifiedFitEligible=false`
and the successful Fit outcome is `INSUFFICIENT_DATA`.

The full online audit checked eight targets and 631 cumulative objects with zero
repairs and zero violations. Promotion increased the cumulative bundle to 303
targets and 328 source receipts; all 328 receipts replay. After the release
transaction, `COMPLETE_RECEIPT` is 322, `ALL_AXIS_RANGE` is 82,
`ALL_AXIS_SCALAR` is 377, historical `AUTO_FILL` is 250, the executable queue
contains 7,678 targets and the current-retail P0 missing-dimension lane contains
909 targets. Public receipt-bound dimensions are 253 and receipt-bound
`VERIFIED_FIT` remains zero. All eight target IDs are absent from the next-epoch
executable queue and batch.

## 28. Bosch SMV, SPS and SPU dishwasher lane completion

Run `historical-bosch-legacy-dishwashers-20260716-i` selected the final six
zero-attempt Bosch dishwasher targets in the current-retail P0 lane:

| Model | Accepted source | Width | Height | Depth |
| --- | --- | ---: | ---: | ---: |
| `SMV66MX01A` | exact-model PDF | 598 | 815-875 | 550 |
| `SMV88TX01A` | exact product page | 598 | 815 | 550 |
| `SMV88TX02A` | exact-model PDF | 598 | 815 | 550 |
| `SPS60M08AU` | exact-model PDF | 450 | 845 | 600 |
| `SPS6IKI01A` | exact-model PDF | 450 | 845 | 600 |
| `SPU6IMS01A` | exact-model PDF | 448 | 815-875 | 573 |

All five PDF sources are exact-model Bosch Australia specification sheets and
were converted to MinerU `content_list_v2` before claims were evaluated. Their
receipts retain the PDF and JSON hashes, exact-model identity signals, page and
fragment bindings and explicit dimension axes. `SMV88TX01A` instead uses an
exact Bosch Australia product page with canonical URL, title, structured model
and explicit H/W/D specification evidence. Other discovered manuals remain
typed non-contributing attempts when identity or field coverage is incomplete.

The adjustable heights for `SMV66MX01A` and `SPU6IMS01A` remain ranges and are
not flattened into historical replacement-reference scalars. The other four
fixed envelopes may use `AUTO_FILL`. No source supplies the complete
installation, operation and rear-service envelope, so all six remain
dimensions-only with `verifiedFitEligible=false` and `INSUFFICIENT_DATA`.

The full online audit checked six targets and 642 cumulative objects with zero
repairs and zero violations. Promotion increased the cumulative bundle to 309
targets and 334 source receipts; all 334 receipts replay. After the release
transaction, `COMPLETE_RECEIPT` is 328, `ALL_AXIS_RANGE` is 84,
`ALL_AXIS_SCALAR` is 381, historical `AUTO_FILL` is 254, the executable queue
contains 7,672 targets and the current-retail P0 missing-dimension lane contains
903 targets. Public receipt-bound dimensions are 259 and receipt-bound
`VERIFIED_FIT` remains zero. All six target IDs are absent from the next-epoch
queue and batch, and no Bosch dishwasher remains in the current-retail P0 lane.

## 29. Bosch dryer P0 lane completion

Run `historical-bosch-dryers-20260716-j` selected the three zero-attempt Bosch
dryers remaining in the current-retail P0 lane:

| Model | Accepted source | Width | Height | Depth |
| --- | --- | ---: | ---: | ---: |
| `WTH83002AU` | exact-model PDF | 598 | 842 | 654 |
| `WTW87564AU` | exact-model PDF | 598 | 842 | 665 |
| `WTY88701AU` | exact-model PDF | 598 | 842 | 634 |

Each source is an exact-model Bosch Australia specification PDF processed into
MinerU `content_list_v2`. The receipts preserve explicit axes, page/fragment
bindings and the source PDF and derived JSON hashes. The different depth values
are retained per model; no series-level dimension sharing occurs. Manuals that
lack exact-model identity or explicit dimension coverage remain typed failed
candidates and cannot contribute claims.

All three closed envelopes are fixed scalars and may populate historical
replacement-reference dimensions. They do not contain a complete installation,
ventilation, door-operation or rear-service envelope, so they remain
dimensions-only with `verifiedFitEligible=false` and `INSUFFICIENT_DATA`.

The full online audit checked three targets and 648 cumulative objects with zero
repairs and zero violations. Promotion increased the cumulative bundle to 312
targets and 337 source receipts; all 337 receipts replay. After the release
transaction, `COMPLETE_RECEIPT` is 331, `ALL_AXIS_RANGE` is 84,
`ALL_AXIS_SCALAR` is 384, historical `AUTO_FILL` is 257, the executable queue
contains 7,669 targets and the current-retail P0 missing-dimension lane contains
900 targets. Public receipt-bound dimensions are 262 and receipt-bound
`VERIFIED_FIT` remains zero. All three target IDs are absent from the next-epoch
queue and batch, and no Bosch dryer remains in the current-retail P0 lane.

## 30. Bosch fridge P0 lane completion

Run `historical-bosch-fridges-20260716-k` selected the eight zero-attempt Bosch
fridges remaining in the current-retail P0 lane:

| Model | Accepted source | Width | Height | Depth |
| --- | --- | ---: | ---: | ---: |
| `GSN33VI3A` | exact-model PDF | 600 | 1760 | 650 |
| `KDN53VL30A` | exact product page | 700 | 1710 | 740 |
| `KFI96AXEAA` | exact-model PDF | 905 | 1830 | 731 |
| `KFN96AXEAA` | exact-model PDF | 905 | 1830 | 731 |
| `KGN53XI25A` | exact-model PDF | 700 | 1700 | 770 |
| `KIN34P60AU` | exact-model PDF | 556 | 1772 | 545 |
| `KIN86AD30A` | exact-model PDF | 558 | 1772 | 545 |
| `KIR81AD30A` | exact-model PDF | 558 | 1772 | 545 |

The seven PDF receipts use exact-model Bosch Australia specification sheets
processed through MinerU `content_list_v2`. The `KDN53VL30A` receipt instead
uses the exact Bosch Australia product page with canonical URL, title,
structured model and explicit H/W/D evidence. Page, fragment, source PDF and
derived JSON hashes remain bound to every PDF claim. Similar series dimensions
are not shared: the 556 mm width of `KIN34P60AU` remains distinct from the 558
mm widths of `KIN86AD30A` and `KIR81AD30A`.

All eight closed envelopes are fixed scalars and may populate historical
replacement-reference dimensions. Door-open geometry, hinge-side space,
ventilation, installation clearance and rear services remain unknown, so the
products are dimensions-only with `verifiedFitEligible=false` and
`INSUFFICIENT_DATA`.

The full online audit checked eight targets and 664 cumulative objects with zero
repairs and zero violations. Promotion increased the cumulative bundle to 320
targets and 345 source receipts; all 345 receipts replay. After the release
transaction, `COMPLETE_RECEIPT` is 339, `ALL_AXIS_RANGE` is 84,
`ALL_AXIS_SCALAR` is 392, historical `AUTO_FILL` is 265, the executable queue
contains 7,661 targets and the current-retail P0 missing-dimension lane contains
892 targets. Public receipt-bound dimensions are 270 and receipt-bound
`VERIFIED_FIT` remains zero. All eight target IDs are absent from the next-epoch
queue and batch, and no Bosch fridge remains in the current-retail P0 lane.

## 31. Bosch washer lane L and transient retry isolation

Run `historical-bosch-washers-20260716-l` selected eight zero-attempt Bosch
washing machines. Five exact-model specification PDFs produced accepted fixed
closed envelopes:

| Model | Width | Height | Depth |
| --- | ---: | ---: | ---: |
| `WAK24161AU` | 600 | 850 | 600 |
| `WAN24121AU` | 598 | 848 | 600 |
| `WAN28288AU` | 598 | 845 | 632 |
| `WAT24440AU` | 598 | 848 | 590 |
| `WAW28460AU` | 598 | 848 | 590 |

The PDFs were processed through MinerU `content_list_v2`; their receipts bind
exact-model identity, explicit axes, page/fragment evidence and source/derived
hashes. The differing product depths remain model-specific. No accepted source
supplies complete installation, plumbing, operation or rear-service geometry,
so all five remain dimensions-only with `verifiedFitEligible=false` and
`INSUFFICIENT_DATA`.

`WAK24162AU` and `WAP28380AU` exhausted their complete current resolver sets
without a source that had both exact identity and complete dimensions. They are
target-level suppressed until the resolver or policy epoch changes.
`WAE22466AU` also lacked an acceptable exact-model source, but one candidate had
a transient transport failure. It therefore remains visible in the executable
queue for a future backoff-controlled retry; it must not be selected again in
the immediately following batch. Interactive batch selection must exclude the
union of target IDs in attempt-ledger `entries`, `targetAttempts` and accepted
bundle entries for the current work window, not only `targetAttempts`.

The full online audit checked eight targets and 674 cumulative objects with zero
repairs and zero violations. Promotion added only the five accepted targets,
increasing the cumulative bundle to 325 targets and 350 source receipts; all
350 receipts replay. The three rejected targets contribute attempt history only.
After the release transaction, `COMPLETE_RECEIPT` is 344,
`ALL_AXIS_RANGE` is 84, `ALL_AXIS_SCALAR` is 397, historical `AUTO_FILL` is
270, the executable queue contains 7,654 targets and the current-retail P0
missing-dimension lane contains 885 targets. Public receipt-bound dimensions
are 275 and receipt-bound `VERIFIED_FIT` remains zero.

## 32. Bosch washer lane M and parser-epoch suppression

Run `historical-bosch-washers-20260716-m` selected eight previously unattempted
current-retail Bosch washing machines after excluding the union of cumulative
source attempts, target-level attempts and accepted targets. Seven exact-model
Bosch Australia specification PDFs produced accepted fixed closed envelopes:

| Model | Width | Height | Depth |
| --- | ---: | ---: | ---: |
| `WAW32640AU` | 598 | 848 | 590 |
| `WAY32891AU` | 598 | 848 | 590 |
| `WGG24401AU` | 598 | 848 | 636 |
| `WGG24403AU` | 598 | 848 | 636 |
| `WGG24409AU` | 598 | 848 | 636 |
| `WGG2441RAU` | 598 | 845 | 636 |
| `WGG244A0AU` | 598 | 848 | 636 |

Every accepted source was processed through MinerU `content_list_v2` and binds
exact-model identity, explicit `H x W x D` axes, source page and fragment, raw
PDF hash and derived JSON hash. Where the specification sheet explicitly names
overall depth including the handle, that scoped depth is retained instead of a
smaller body-depth value. The receipts remain dimensions-only: installation,
plumbing, operation and rear-service requirements are unknown, so
`verifiedFitEligible=false` and the Fit outcome is `INSUFFICIENT_DATA`.

`WAW28640AU` completed all current resolvers but neither its official product
page nor either official PDF yielded a receipt with exact identity and all
three explicit axes. It is recorded as `claims_incomplete` with a MinerU parser
failure and target-level suppressed until the resolver, parser or policy epoch
changes. It must not be retried merely because it remains commercially useful.

The full online audit checked eight targets and 688 cumulative objects with zero
repairs and zero violations. Promotion added seven accepted targets, increasing
the cumulative bundle to 332 targets and 357 source receipts; all 357 receipts
replay. After the release transaction, `COMPLETE_RECEIPT` is 351,
`ALL_AXIS_RANGE` is 84, `ALL_AXIS_SCALAR` is 404, historical `AUTO_FILL` is
277, the executable queue contains 7,646 targets and the current-retail P0
missing-dimension lane contains 877 targets. Public receipt-bound dimensions
are 282 and receipt-bound `VERIFIED_FIT` remains zero.

## 33. Bosch washer lane N and zero-attempt lane closure

Run `historical-bosch-washers-20260716-n` selected the final five zero-attempt
current-retail Bosch washing machines after rebuilding the released queue.
Two exact-model Bosch Australia specification PDFs produced accepted fixed
closed envelopes:

| Model | Width | Height | Depth |
| --- | ---: | ---: | ---: |
| `WGG244A1AU` | 598 | 848 | 636 |
| `WGG244ARAU` | 598 | 848 | 636 |

Both PDFs were processed through MinerU `content_list_v2`. Their receipts bind
the exact model, explicit `H x W x D` axes, page and fragment, source PDF hash
and derived JSON hash. The 636 mm depth is the sheet's explicit overall depth
including the door handle. No complete installation, plumbing, operation or
rear-service evidence was present, so both remain dimensions-only with
`verifiedFitEligible=false` and `INSUFFICIENT_DATA`.

`WVG28420AU` and `WVH28441AU` completed their current candidate inventories but
failed exact-model identity or explicit-axis extraction. `WVH28490AU` completed
the same bounded search but supplied no source with all required claims. All
three are target-level suppressed until a resolver, parser or policy epoch
changes; no sibling or series dimension was substituted.

The full online audit checked five targets and 692 cumulative objects with zero
repairs and zero violations. Promotion added two accepted targets, increasing
the cumulative bundle to 334 targets and 359 source receipts; all 359 receipts
replay. After the release transaction, `COMPLETE_RECEIPT` is 353,
`ALL_AXIS_RANGE` is 84, `ALL_AXIS_SCALAR` is 406, historical `AUTO_FILL` is
279, the executable queue contains 7,641 targets and the current-retail P0
missing-dimension lane contains 872 targets. Public receipt-bound dimensions
are 284 and receipt-bound `VERIFIED_FIT` remains zero.

No zero-attempt Bosch current-retail washing machine remains. `WAE22466AU` is
the only Bosch washer still visible in the executable queue because one prior
candidate ended in a transient transport failure. It stays outside immediate
selection and may be retried only in a later backoff-controlled recovery
window, never as an automatic continuation of lanes L through N.

## 34. Haier dishwasher lanes O through T and bounded family-document recovery

The Haier dishwasher investigation used unique runs and never resumed a
completed or exhausted run. Lane O recorded the legacy zero-candidate outcome.
Lane P exposed HTML wrappers and discovery timeouts. Lane Q was interrupted
after the Salesforce support page waited indefinitely for network idle and was
not resumed or promoted. Lane R proved the bounded dynamic-page fix but stayed
diagnostic because its parser still rejected valid family documents. Lane S
was the first releasable six-target pass. Lane T contained only the one TFE3
finish target whose parser defect had just been repaired.

Haier support articles render document links dynamically and the final PDF is
served from `fisherpaykel.my.salesforce.com`. Discovery now waits for bounded
document selectors instead of global network idle, preserves the official
article HTML as a hash-bound object, validates the article-to-Salesforce link,
and then validates PDF magic bytes before MinerU processing.

Two strict document grammars were added:

- Exact G3 specification sheets bind vertical `Height`, `Width` and `Depth`
  labels only when the same page names the exact model and carries the
  model-specific product-dimension disclaimer. `HDW15G3W` and `HDW15G3X` both
  resolve to 598 x 850 x 598 mm.
- The TFE3 family grammar accepts only the cover-listed `HDW9TFE3WH` and
  `HDW9TFE3SS` finish SKUs. It requires the product-dimension table, preserves
  the installed top-panel height range of 850-870 mm, excludes the 820-840 mm
  top-removed range and cavity dimensions, and requires a separate technical
  table to corroborate width 450 mm, depth 600 mm and height 850 mm.

The TFE3 `SS` defect was in discovery attestation, not dimension extraction.
The official article named the `WH` finish while the linked PDF cover named
both `WH` and `SS`. The verifier now emits
`official_product_page_artifact_relationship` only when the PDF has already
produced the narrow `mineru_haier_tfe3_explicit_finish_model` signal. A generic
PDF still fails when the discovery page does not prove the exact model. The
immutable `SS` PDF, MinerU JSON, primary fallback object and discovery HTML all
replayed before lane T was run.

`HDW15V2S1` and `HDW15V3S1` remain unresolved. The official Haier family manual
names both models but exposes an installation recess rather than a closed
product envelope. Haier-authored exact-model specification sheets exist on a
retailer mirror and report 598 x 850 x 598 mm, but reference hosting is not
promoted as official evidence. Recess dimensions must never populate closed
width, height or depth. These targets require either an official exact-model
field source or a separately audited manufacturer-authored-mirror authority
tier.

Lane S promoted three accepted dimensions-only targets and three terminal
outcomes after an online audit replayed 704 objects with zero violations. Lane
T then promoted `HDW9TFE3SS` after replaying 705 objects with zero violations.
The cumulative bundle now contains 338 accepted entries and 363 source
receipts; all receipts replay. Historical classification contains 357 complete
receipts, public projection contains 288 receipt-bound dimensions and
receipt-bound `VERIFIED_FIT` remains zero.

The canonical executable queue is inventory, not permission to execute every
target. A parser-policy epoch may make many old targets visible for evaluation,
but production recovery lanes must use a unique run ID and explicit
`--target-id` filters. Accepted targets, complete exhausted inventories and
interrupted runs must not be automatically restarted. A transient target such
as `WAE22466AU` is eligible only after its separate backoff window.

## 35. Haier HBM fridge lanes U through W and technical-table grammar

The HBM recovery used three distinct run IDs and did not resume any completed
run. Lane U recorded five zero-candidate outcomes under Haier resolver v4.
Research then showed that archived refrigerators use the bounded support path
`refrigeration-and-freezers/fridges/top-fridge`, while the resolver had only
tried the legacy `refrigeration` path. Resolver v5 now tries both official
taxonomies and continues only after a 404, support shell or missing exact-model
signal. It does not weaken the Haier authority allowlist or exact-model checks.

Lane V proved that the corrected discovery path could bind official product
pages to Haier-hosted Salesforce PDFs for `HBM340SA1`, `HBM340WH1`,
`HBM450SA1` and `HBM450WH1`. Those four targets still terminated because the
MinerU parser did not yet understand the manuals' technical-data layout.
`HBM450HSA1` produced no receipt-bound discovery candidate and therefore stayed
outside the later acceptance run even though a family manual mentions it.
Lane U and lane V are permanent attempt history and must not be resumed.

Parser epoch `2026-07-16.17` adds the narrow
`haier-au-hbm-technical-data-family-v1` grammar:

- The HBM340 layout requires the `Technical Data` table, the explicit
  `HBM340WH1/HBM340SA1` model column and `Dimension (DxWxH)` unit context on the
  same page. It maps 642 x 595 x 1700 mm to closed D/W/H.
- The HBM450 layout requires the complete explicit model trio
  `HBM450WH1`, `HBM450SA1` and `HBM450HSA1`, the refrigerator-freezer category
  and `Dimension (DxWxH)` in one technical-data fragment. It maps
  676 x 700 x 1725 mm to closed D/W/H.
- The grammar excludes HBM315, incomplete or unknown finish sets, alternate
  axis labels, cavity dimensions, service clearances and door-operation
  measurements. In particular, W1=1100, D1=700 and D2=1323 from the HBM450
  operation diagram cannot replace the closed envelope.

Post-lane review raised the current parser epoch to `2026-07-16.18`. HBM model
tokens are now compared as a complete set, so a table containing all expected
models plus an unknown HBM variant is rejected instead of silently ignoring the
extra variant. This hardening does not rerun or rewrite lane W history.

Lane W selected only the four targets with both valid discovery provenance and
valid MinerU family identity. It accepted the following dimensions:

| Model | Width | Height | Depth |
| --- | ---: | ---: | ---: |
| `HBM340SA1` | 595 | 1700 | 642 |
| `HBM340WH1` | 595 | 1700 | 642 |
| `HBM450SA1` | 700 | 1725 | 676 |
| `HBM450WH1` | 700 | 1725 | 676 |

The HBM340 legacy height hint of 1702 mm remains a lower-authority conflict
hint; exact official axis proof supplies 1700 mm. The online lane W audit
checked four targets and 711 immutable objects with zero repairs and zero
violations. Promotion increased the cumulative bundle to 342 accepted entries
and 367 source receipts; all 367 receipts replay. Historical classification
now contains 361 complete receipts, public projection contains 292
receipt-bound dimensions and receipt-bound `VERIFIED_FIT` remains zero.

`HBM450HSA1` remains `IDENTITY_ONLY` with `MEASURE_REQUIRED`. Its dimensions
must not be inherited from the family manual until an immutable exact-model
discovery path binds that support product to the PDF artifact. A future fix
requires a new resolver/discovery contract and a new run ID; the presence of a
parseable family row alone is not execution permission.

## 36. Beko dryer lanes X and Y and parallel-list product sheets

Lane X selected six previously unattempted current-retail Beko dryers with a
single unique run ID. It was not resumed or repeated. The bounded Beko
resolver found no official candidate for `BDC830W`, `BDP710MG`, `BDV60W` or
`BDV70W`; those four discovery-gap targets were promoted as terminal attempt
history and remain suppressed until a resolver or source-authority epoch
changes. Their legacy catalog dimensions remain unbound hints and do not
create `geometry_v2`.

`BDP810W` and `BDP83HW` resolved to exact Australian Beko product pages and
Beko-hosted PDF specification sheets, but lane X exposed a parser gap. On page
1 each PDF presents `Dimensions & Weights` as one ordered label paragraph and
a separate aligned list of eight values. A second-page product diagram reports
the cabinet/body depth, which is smaller than the explicitly labelled
unpacked depth and must not replace the closed product envelope.

Parser epoch `2026-07-16.19` adds the narrow
`beko_au_dryer_product_spec_parallel_lists_v1` grammar. It requires the exact
dryer model, the unique `Dimensions & Weights` heading, the complete ordered
label sequence, one aligned eight-value list and the expected mm/kg unit
positions. It projects only unpacked height, width and depth; packed values,
operation dimensions and the second-page body diagram are excluded. Missing
values, changed labels, misaligned lists, wrong units, sibling models and other
categories are rejected.

Lane Y contained only the two targets whose immutable PDFs replayed under that
grammar. It accepted:

| Model | Width | Height | Depth |
| --- | ---: | ---: | ---: |
| `BDP810W` | 597 | 846 | 589 |
| `BDP83HW` | 597 | 846 | 654 |

Both receipts are dimensions-only. Installation, ventilation, plumbing and
operation requirements remain unknown, and receipt-bound `VERIFIED_FIT` is
not permitted. The full online lane Y audit checked two targets and 717
cumulative objects with zero repairs and zero violations. Promotion increased
the cumulative bundle to 344 accepted entries and 369 source receipts; all 369
receipts replay under parser epoch `.19`. Historical classification now
contains 363 complete receipts, public projection contains 294 receipt-bound
dimensions and receipt-bound `VERIFIED_FIT` remains zero.

Lanes X and Y are closed. Neither may be rerun merely because the four
discovery-gap models remain useful. A future attempt requires a changed
resolver/source-authority epoch and a new run ID; a parser-policy change alone
does not justify repeating a target that never produced an official artifact.

## 37. Non-appliance isolation and recovery refresh topology

Zero-attempt selection identified `SKWS54` and `USKTRR541` in the current Beko
dryer lane. Both retailer titles explicitly describe stacking kits rather than
complete tumble dryers. They must not be treated as appliance identities,
dimension-recovery targets, replacement references or public Fit candidates.
The canonical publication quarantine now records both legacy IDs with the
non-releasable reason `dryer_stacking_kit_is_not_a_complete_appliance`.

After rebuilding from the quarantine decision, the canonical appliance
registry contains 3,519 products with 22 quarantined rows. The historical
appliance denominator is 8,093 rather than 8,095: the two removed records were
retailer accessories, not historical appliances. The classification policy is
therefore version `historical-model-evidence-classification-v2` and pins the
8,093-record denominator. Dryer references decrease from 843 to 841; no
government-registry appliance record or accepted evidence receipt is removed.

This correction also exposed an invalid refresh order. Historical reference
generation binds the current public catalog projection, so rebuilding history
before rebuilding the projection can create a stale catalog snapshot and a
mixed-epoch queue. `refresh:historical-evidence-recovery` now builds the public
projection first, then the historical reference, the deterministic dimension-
expression knowledge snapshot, classification, acquisition queues and the
executable batch, followed by publication audits. Classification may therefore
consume only a knowledge snapshot bound to the same historical-reference
epoch. The replacement audit must fail with
`HISTORICAL_CATALOG_SNAPSHOT_STALE` if that dependency order regresses.

The dimension-expression builder must not read any generated recovery queue.
Tracked documents derive identity only from their source-document product
links; recovery artifacts derive identity from their immutable run state or
run-local batch. An older artifact without either binding remains unmapped
rather than inheriting a target from a later queue. This keeps the dependency
graph acyclic and prevents a previous execution epoch from changing the next
classification silently.

Neither stacking-kit target was executed. The next Beko dryer lane may contain
only `DCY7402GXB2`, `DCY8502XB1`, `DPE7400` and `DPY8500`, each selected from
the zero-attempt union after the corrected 8,093-record refresh.

## 38. Beko archived-dryer AA2 closure and resolver-safe retry control

Lane AA2 used the unique run ID
`historical-beko-dryers-20260717-aa2`. Its separate preflight used
`historical-beko-dryers-20260717-aa2-preflight`. The execution selected only
`DCY7402GXB2`, `DCY8502XB1`, `DPE7400` and `DPY8500`; all four resolvers
completed with zero official candidates. The passing online audit covered the
four targets and 717 immutable objects with zero repairs and zero violations.
Promotion appended four `complete_zero_candidate_inventory` target attempts,
bringing the cumulative attempt ledger to 61 resolver-only suppressions. Both
AA2 run IDs are closed and must never be resumed.

Beko's Australian support site exposes an AEM exact-model endpoint rather than
the generic support-page search assumed by resolver v1:

```text
https://www.beko.com/content/bekoglobal/au/en/support/user-manual/jcr:content/root/responsivegrid/responsivegrid/productsearch.ajax.html?search={MODEL}
```

Resolver v2 queries that bounded endpoint first, accepts only an exact model
link to `/au-en/support/user-manuals-result`, and then extracts Beko-hosted
product documents. A live smoke test for current model `BDF1640AX` returned an
exact Australian support result, product page, specification sheet,
installation guide and user manual. The four AA2 models returned the endpoint's
explicit no-result response in both Australia and New Zealand. The old direct
Australian product-spec paths derived from archived Beko stock IDs also return
real HTTP 404 responses:

| Model | Beko stock ID | Direct AU product-spec result |
| --- | --- | --- |
| `DCY7402GXB2` | `7182482930` | 404 |
| `DCY8502XB1` | `7187841320` | 404 |
| `DPE7400` | `7188232170` | 404 |
| `DPY8500` | `7188285530` | 404 |

Exact retailer-hosted Beko specification sheets were retained as research
references and processed through MinerU `content_list_v2`. They establish useful
closed-envelope hints but are not manufacturer-hosted evidence and therefore
cannot create acceptance receipts or public `geometry_v2`:

| Model | Width | Height | Depth | PDF SHA-256 |
| --- | ---: | ---: | ---: | --- |
| `DCY7402GXB2` | 597 | 846 | 558 | `cf0ae2b11c8f9f8077ba896261c6b3968792f359e916c6f6df1123f0e36904b7` |
| `DCY8502XB1` | 597 | 846 | 623 | `20c933298e9728ac070eb5cc58b6740ee5fbd975f5ec545a7440a96be587338c` |
| `DPE7400` | 597 | 846 | 558 | `0937d3d783dba7a00c8c2033419ade39f7c680d64f5d8ba2ed7004973286023a` |
| `DPY8500` | 597 | 846 | 623 | `95ea255c2ed79e353d39550d5d3fabdbcd2a3658b94b42e2abd42194c0ce13d9` |

The executable queue and direct-run history guard both treat a complete
zero-candidate discovery as durable across recovery-policy and resolver
implementation revisions. A version, scope or parser change may justify a
bounded source scout, but cannot automatically re-enqueue or manually rerun the
full evidence-recovery target. Only a newly materialized official source edge
reopens execution. A complete inventory that did contain candidate artifacts
retains the narrower policy-and-resolver-bound suppression because a relevant
parser or authority-policy revision may make that evidence actionable. This
keeps resolver improvements useful for unseen models without turning every
upgrade into a repeat of already exhausted targets. AA2 must not be rerun under
Beko resolver v2: live source research already produced zero official
candidates, and the retailer PDFs remain `REFERENCE/LEGACY_UNBOUND`.
Existing immutable target-attempt entries retain the historical advisory
disposition `AWAIT_RESOLVER_OR_POLICY_CHANGE`; execution permission is governed
by the queue and run-history guards above, not by rewriting that audit label.

## 39. Beko fridge AB1/AB2 parser closure and run-lineage identity

A bounded source scout checked the first eight zero-attempt P0 Beko fridge
targets before execution. `BBM335PX`, `BBM505X` and `BCF307W` returned no exact
Australian support result and were not placed in a recovery run. Exact support
results existed for `BBM407PX`, `BBM450AN`, `BBM450W`, `BBM450X` and
`BBMB445PX`.

Run `historical-beko-fridges-20260717-ab1` selected only those five exact-result
targets. It produced zero acceptances and five typed terminal outcomes. The run
exposed two implementation gaps: an exact optional manufacturer document was
not attempted after an official product page returned no claims, and the
two-page `BBMB445PX` product specification used a Beko fridge layout that the
parser did not yet understand. AB1 passed a full online audit over 717 prior
objects and was promoted only to preserve its immutable terminal-attempt
history. AB1 and its pre-change results are closed and must not be resumed.

Optional-document fallback is now candidate-specific rather than role-wide. A
document may be attempted in the second pass only when all of these conditions
are true:

- authority is official and source role is `manufacturer_document`;
- the required first pass ended as `identity_rejected` or `claims_incomplete`;
- discovery provenance records market `AU`;
- normalized target model, `requestedModel` and `matchedModel` are all equal;
- the provenance artifact URL is exactly the candidate source URL; and
- the candidate is still `not_attempted_optional`.

The eligible `candidateId` values are passed as an explicit allowlist to the
inventory expander. A single valid document cannot cause sibling, wrong-market
or wrong-URL documents with the same source role to be fetched. Conflict-driven
official corroboration retains its broader policy-controlled behavior.

The new grammar
`beko_au_fridge_product_spec_mixed_section_list_v1` accepts only one exact-model
Beko fridge page header, one complete ordered `Dimensions & Weights` label
paragraph and one adjacent value list containing exactly one contiguous
`mm/mm/mm/kg/mm/mm/mm/kg` sequence. Prefix values such as ice-maker details and
suffix values such as SKU or EAN are ignored. Reordered labels, mixed units,
duplicate sequences, sibling-model headers and other appliance categories fail
closed. For `BBMB445PX`, the receipt projects only:

| Field | Value | Source semantics |
| --- | ---: | --- |
| width | 756 mm | `Unpackaged Width` |
| height | 1770 mm | `Unpackaged Height` |
| depth | 700 mm | `Depth(incl. Doors)`; includes door, handle unknown |

Packaged dimensions, weight, `Cabin Width 76 cm`, the operation diagram and all
installation clearances remain excluded or unknown. The resulting dimensions
receipt is not eligible for `VERIFIED_FIT`.

The post-fix run used unique IDs
`historical-beko-fridges-20260717-ab2-preflight` and
`historical-beko-fridges-20260717-ab2`. AB2 accepted only `BBMB445PX`. The
manuals for `BBM407PX`, `BBM450AN`, `BBM450W` and `BBM450X` were downloaded and
MinerU-indexed but failed exact in-document identity; `BBM450W` and `BBM450X`
resolve to the same immutable PDF hash. They remain terminal and may be reopened
only after a separately tested identity grammar or a newly materialized exact
official source, never by resuming AB2. The full AB2 online audit checked 721
objects with zero repairs and zero violations.

AB1 and AB2 intentionally share the same selection-derived `batchId`. The
cumulative acceptance bundle previously treated that value as a unique run
lineage key and rejected the legal second promotion. Promotion now preserves
the original lineage and assigns a colliding new run the deterministic ID
`<batchId>--results-<results-sha-prefix>`. An identical re-promotion locates the
existing row by batch, queue and results hashes and remains byte-stable; it does
not create a third lineage or overwrite the first run.

After AB2 promotion and a full recovery refresh, the cumulative bundle contains
345 accepted entries and 370 replayable sources. All 370 receipts replay. The
historical classification contains 364 complete receipts, the public projection
contains 295 receipt-bound dimension records and zero receipt-bound
`VERIFIED_FIT` records. The executable queue contains 7,607 targets and 39
durably suppressed resolver-only targets; none of the five AB targets is
immediately executable under the current epoch.

## 40. Deterministic multi-cohort manifest window

`historical-evidence-next-batches.json` uses bounded-batch schema/planner v2.
It no longer publishes one `nextManifestId` per workstream. Each workstream
contains an ordered `manifestIds` window, and the top-level `manifestWindow`
binds the window schema, cohort-key version, maximum manifests per workstream,
and complete cross-workstream order.

The default cap is eight manifests per workstream. Every manifest has one exact
priority, lifecycle, category, brand, document family (or explicit unscoped
singleton), execution lane, and mode. A target and a `cohortKey` may occur in at
most one manifest. Priority remains the first ordering boundary; within one
priority the planner rotates deterministically across category, execution lane,
and brand so an alphabetically early category cannot occupy the whole window.
Operational timestamps are source bindings but never scheduling keys.

Inspect the candidate window with:

```bash
jq '{manifestWindow, summary, workstreams: [.workstreams[] | {
  workstreamId, eligibleTargets, eligibleCohorts, windowedCohorts,
  deferredCohorts, eligibleByPriority, manifestIds
}]}' data/architecture-v2/reviews/automated/historical-evidence-next-batches.json
```

The window is not execution authority. P1 manifests may be visible for audit
while P0 is still active, and conflict-closure manifests remain in their own
workstream. Discovery and recovery runners must still receive the exact
`historical-dimensions-scale-control.json` allowed manifest and revalidate its
queue, target-state, family, cohort, source hashes, and execution lane. Never
choose a convenient `manifestIds` entry manually.

## 41. Controlled P0/P1 dimensions scale loop

The dimensions programme is authorised by the tracked scale control, not by an
operator selecting a convenient queue row. The append-safe ledger is
`data/architecture-v2/ledgers/historical-dimensions-scale-ledger.json`; the
derived current decision is
`data/architecture-v2/reviews/automated/historical-dimensions-scale-control.json`.
Every new discovery or acquisition run must use the exact
`decision.allowedManifestId`. P1 stays blocked while any eligible P0 target
exists. A stopped control authorises no manifest.

Mount and attest the evidence drive, then rebuild the current inputs and
control before selecting work:

```bash
export FITAPPLIANCE_STORAGE_ROOT=/Volumes/UGREEN-1TB/FitAppliance
npm run refresh:historical-evidence-recovery
jq '{counters, checkpointCount, haltedCohorts, weeklyThroughput, projection, decision}' \
  data/architecture-v2/reviews/automated/historical-dimensions-scale-control.json
```

Resolve the approved manifest from the bounded-batch artifact and inspect its
lane before execution:

```bash
manifest_id="$(jq -r '.decision.allowedManifestId // empty' \
  data/architecture-v2/reviews/automated/historical-dimensions-scale-control.json)"
jq --arg id "$manifest_id" \
  '.manifests[] | select(.manifestId == $id) | {
    manifestId, workstreamId, executionLane, constraints, targetBindings
  }' data/architecture-v2/reviews/automated/historical-evidence-next-batches.json
```

Stop if the ID is empty, the manifest cannot be found, its workstream differs
from `decision.allowedWorkstreamId`, or the lane is not the expected discovery
or acquisition lane. Both runners independently revalidate the same control,
manifest, queue, target-state and family-gate bindings.

For `BOUNDED_DISCOVERY`, use a unique run ID, rebuild all materialised inputs,
then record the immutable discovery object and final candidate-manifest state:

```bash
run_id=historical-scale-p0-brand-category-model-YYYYMMDD-a
npm run discover:historical-official-candidates -- \
  --manifest-id "$manifest_id" \
  --run-id "$run_id"
npm run refresh:historical-evidence-recovery:inputs
npm run record:historical-dimensions-scale-checkpoint -- \
  --stage discovery \
  --run-id "$run_id"
```

Discovery yield is measured from the final materialised official-candidate
manifest. Raw resolver hints, retailer references and registry links do not
count. A complete zero-candidate inventory is a terminal outcome; an incomplete
required resolver is retryable.

For `ACQUISITION`, run the exact manifest, perform full online replay, promote
the audited result so terminal attempts and accepted receipts become cumulative,
then rebuild and checkpoint:

```bash
run_id=historical-scale-p0-brand-category-model-dimensions-YYYYMMDD-a
run_dir="$FITAPPLIANCE_STORAGE_ROOT/runs/historical-evidence-recovery/$run_id"
npm run recover:historical-evidence -- \
  --manifest-id "$manifest_id" \
  --run-id "$run_id" \
  --output "$run_dir/results.json"
node scripts/architecture-v2/audit-historical-evidence-recovery.mjs \
  --mode online \
  --full \
  --results "$run_dir/results.json" \
  --output "$run_dir/audit-full.json"
jq -e '.status == "passed" and (.violations | length) == 0' \
  "$run_dir/audit-full.json"
node scripts/architecture-v2/promote-historical-evidence-recovery.mjs \
  --results "$run_dir/results.json" \
  --audit "$run_dir/audit-full.json"
npm run refresh:historical-evidence-recovery:inputs
npm run record:historical-dimensions-scale-checkpoint -- \
  --stage dimensions \
  --run-id "$run_id" \
  --audit "$run_dir/audit-full.json"
```

A byte-bound official artifact counts as fetched even if MinerU or exact-model
identity later fails. It does not count as MinerU-valid, identity-proven or
dimensions-receipted. Only scalar receipt deltas may increase replacement
`AUTO_FILL`; every checkpoint also requires complete receipt replay, zero
replacement-audit issues and zero Fit-publication violations. Normal offline
builds consume only the tracked ledger/control and remain independent of the
mounted evidence drive.

The first controlled P0 cohort used five immutable checkpoints for Esatto
dishwashers:

| Run | Stage | Official candidate | Fetched | MinerU valid | Receipt | Terminal |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `historical-scale-p0-esatto-dw42cs-20260719-a` | discovery | 0 | 0 | 0 | 0 | 1 |
| `historical-scale-p0-esatto-edw456s-20260719-b` | discovery | 1 | 0 | 0 | 0 | 0 |
| `historical-scale-p0-esatto-edw456s-dimensions-20260719-c` | dimensions | 1 | 1 | 0 | 0 | 1 |
| `historical-scale-p0-esatto-edw6cs-20260719-d` | discovery | 0 | 0 | 0 | 0 | 1 |
| `historical-scale-p0-esatto-edw6sl-20260719-e` | discovery | 0 | 0 | 0 | 0 | 1 |

The EDW456S acquisition fetched the exact official PDF and added one valid
MinerU document to the indexed inventory, but the extracted content did not
prove exact-model axis claims, so it created no receipt. Across the five
checkpoints, P0 assigned/eligible targets decreased from `957/947` to
`953/943`; current valid receipts stayed at 401, replacement `AUTO_FILL` at
321, receipt-bound public dimensions at 332 and receipt-bound `VERIFIED_FIT` at
zero. Full online replay passed 408/408 prior receipt sources with zero
publication violations.

Those five entries predate typed stage metrics. Ledger schema v2 preserves each
entry and its original semantic hash, but reports it as
`LEGACY_CHECKPOINT_HAS_NO_TYPED_STAGE_METRICS`; legacy target-grain percentages
are not eligible to halt a stage. The current decision is therefore `RUN_P0`,
and P1 remains blocked while current-retail work exists.

New checkpoints record separate metrics and denominators for discovery,
candidate acquisition, MinerU, exact-model identity, W/H/D receipt, and
installation/Fit completeness. Installation/Fit is diagnostic only and cannot
be inferred from a dimensions receipt. Retryable units remain in throughput
reporting but are excluded from the conclusive statistical denominator.

A percentage halt requires all of the following:

1. the same stable cohort, stage, and relevant processor/policy epoch;
2. at least 10 conclusive units;
3. at least two distinct completed manifests; and
4. a one-sided 95% Wilson upper bound below that stage's configured floor.

Five misses can never halt. A qualifying halt removes only the affected
cohort; the controller selects the next visible P0 cohort and never opens P1
while runnable or deferred P0 work remains. Old halts reopen only when a
relevant lifecycle, resolver, source-authority, parser, MinerU/toolchain,
receipt-policy, or Fit-policy epoch changes. Queue and manifest hashes are not
processor epochs.

Global stops are limited to an explicit safety/audit failure, exhausted
resource budget, unavailable required online external state, or no runnable
manifest. Never edit or delete ledger history to bypass a stop; repair the
typed stage or advance its relevant tested epoch.

## 42. Independent installation and Fit evidence pipeline

Installation/Fit evidence is independent of the stopped dimensions P0 loop. A
W/H/D receipt cannot satisfy an installation field and cannot create
`VERIFIED_FIT`. The tracked task anchor is
`docs/superpowers/plans/2026-07-19-historical-evidence-scale-control-plane.md`;
read it before every implementation or operational batch.

The tracked contracts and outputs are:

| Grain | Canonical artifact |
| --- | --- |
| Applicability | `data/architecture-v2/generated/installation-evidence-applicability-matrix.json` |
| Exact canary recipes | `data/architecture-v2/policies/installation-evidence-canary-recipes.json` |
| Cumulative field receipts | `data/architecture-v2/reviews/automated/installation-evidence-receipts.json` |
| Object replay audit | `data/architecture-v2/reviews/automated/installation-evidence-receipt-replay-audit.json` |
| Per-model control state | `data/architecture-v2/generated/installation-evidence-pipeline.json` |
| Candidate projection | `data/architecture-v2/generated/installation-evidence-candidates.json` |
| Typed parser gaps | `data/architecture-v2/generated/installation-evidence-parser-gaps.json` |
| Family-aware batches | `data/architecture-v2/generated/installation-evidence-batches.json` |
| Rejected-source diagnostics | `data/architecture-v2/generated/installation-evidence-source-diagnostics.json` |
| Public release gate | `data/architecture-v2/reviews/automated/fit-publication-audit.json` |

### Online receipt creation and replay

Mount the evidence store and rebuild the exact frozen canaries:

```bash
export FITAPPLIANCE_STORAGE_ROOT=/Volumes/UGREEN-1TB/FitAppliance
npm run build:installation-evidence-pilot-receipts
npm run audit:installation-evidence-receipts:online
npm run build:installation-evidence-pipeline
npm run audit:fit-publication
```

The builder merges by default. It loads and replays every receipt in the merged
bundle, including objects not referenced by the current recipe file. Never use
`--replace` as a routine regeneration command. An intentional, reviewed reset
requires the exact current semantic bundle hash:

```bash
bundle_sha="$(jq -r .bundleSha256 \
  data/architecture-v2/reviews/automated/installation-evidence-receipts.json)"
node scripts/architecture-v2/build-installation-evidence-pilot-receipts.mjs \
  --replace \
  --expected-current-bundle-sha "$bundle_sha"
```

A missing or stale expected hash aborts without writing either tracked artifact.

### Offline build and publication gate

Ordinary builds must not read the external drive or network:

```bash
env -u FITAPPLIANCE_STORAGE_ROOT npm run audit:installation-evidence-receipts
env -u FITAPPLIANCE_STORAGE_ROOT npm run build:installation-evidence-pipeline
env -u FITAPPLIANCE_STORAGE_ROOT npm run audit:fit-publication
```

Offline audit validates that the replay artifact covers the exact current
bundle. A changed receipt bundle makes the audit stale and blocks publication
until a new full online replay is committed.

`official-registry-fit-v3-audit.json` is the immutable 2026-07-12 shadow-pilot
baseline result, not a current-state replay target. Do not overwrite it by
rerunning `audit:fit-v3-pilot` after an authorised public-catalogue release.
Ongoing repository isolation is checked by `npm run audit:fit-v3-repository`.

### Canary and fan-out rules

Every source PDF is mapped through
`historical-document-family-graph.json`. A model with no resolved family, or
with ambiguous top-ranked source families, receives a one-target
`DOCUMENT_FAMILY_REQUIRED` batch. A resolved family exposes one target until
its canary has at least one exact semantic receipt and current object replay.
Only then may `CANARY_PARTIAL_PASS` open the configured bounded same-family
batch. Partial means parser reuse is demonstrated; it does not mean the product
has complete installation evidence.

Stop and quarantine the affected field, product or family if any of these
conditions occurs:

- exact model identity or exact form factor cannot be replayed;
- a number and its field label are not bound in one paragraph, table row or
  header-value column;
- a negative, boolean or numeric claim is being borrowed from a different
  table row than its field label;
- an `optional` or `not_applicable` receipt is being used to satisfy a hard
  numeric Fit requirement;
- one PDF is assigned to multiple document families;
- two receipts disagree for the same product and field;
- a source is non-official, superseded, stale or cannot be provenance-bound;
- a sibling, regional suffix or family manual donates a field without a
  field-scoped exact-model bridge;
- page, bbox, quote, object hash, parser version or model revision drifts;
- unknown is being converted to zero/false, or a range is being flattened;
- a scalar nominal voltage is being expanded into an unevidenced tolerance;
- a top-loading washer is being checked with a front-door envelope instead of
  its lid-open height;
- a score or commercial signal would override a failed hard condition; or
- any dimensions-only or partial-evidence product is promoted to
  `VERIFIED_FIT`.

At the 2026-07-19 checkpoint the bundle has 21 receipts over two products,
21/21 online replay passes and zero field conflicts. The 100-model pilot has two
`RECEIPT_PARTIAL`, 87 `SOURCE_DISCOVERY_REQUIRED`, 11
`IDENTITY_BLOCKED`, 99 family-aware batches and zero
`FIT_EVIDENCE_COMPLETE`. These are separate grains and must not be combined
into one coverage percentage.

## 43. Retail lifecycle refresh, blocked cutover, and rollback

Retail lifecycle collection is online and external-state-dependent. Normal
builds only replay the committed ledger and must remain network- and
external-drive-independent. The active policy permits the authorised The Good
Guys Partnerize feed and bounded exact-product Appliances Online API. Bing Lee,
Harvey Norman, and JB Hi-Fi collection remains blocked until an authorised feed
or explicit automation approval is recorded in a new source-policy epoch.

### Partnerize complete-feed run

The feed file and its source acquisition record must be captured together.
`--observed-at` is the time the source snapshot was actually retrieved, not the
time the local file was parsed, copied, or applied. If source time cannot be
independently established, stop: do not substitute the current clock. The
collector does not store private feed URLs or credentials in Git.

```bash
export FITAPPLIANCE_STORAGE_ROOT=/Volumes/UGREEN-1TB/FitAppliance
run_id="partnerize-tgg-YYYYMMDDTHHMMSSZ"
captured_at="YYYY-MM-DDTHH:MM:SS.000Z"
feed_file="/absolute/path/to/newly-captured-partnerize-feed.csv"

node scripts/architecture-v2/run-retail-lifecycle-refresh.mjs \
  --storage-root "$FITAPPLIANCE_STORAGE_ROOT" \
  --run-id "$run_id" \
  --feed "$feed_file" \
  --observed-at "$captured_at"

node scripts/architecture-v2/apply-retail-lifecycle-refresh.mjs \
  --storage-root "$FITAPPLIANCE_STORAGE_ROOT" \
  --run-id "$run_id"
```

A completed run may be replayed with the same run ID and timestamp. A second
run with identical source bytes and a later timestamp is rejected because it
would advance freshness without proving a new acquisition. A future HTTPS
acquisition-receipt contract may permit content-equivalent snapshots only when
it independently binds a new response time and source host.

### Appliances Online bounded exact-product run

Use the source-policy limits. Do not raise concurrency or bypass 403/429 and
consecutive-failure stops. Every selected retailer link, not merely every
canonical product, must receive one outcome.

```bash
export FITAPPLIANCE_STORAGE_ROOT=/Volumes/UGREEN-1TB/FitAppliance
run_id="ao-scale-YYYYMMDDTHHMMSSZ-batch-N"
captured_at="YYYY-MM-DDTHH:MM:SS.000Z"

node scripts/architecture-v2/run-retail-lifecycle-refresh.mjs \
  --storage-root "$FITAPPLIANCE_STORAGE_ROOT" \
  --source-policy-id appliances-online-product-api-v1 \
  --run-id "$run_id" \
  --observed-at "$captured_at" \
  --batch-index N \
  --batch-size 100

node scripts/architecture-v2/apply-retail-lifecycle-refresh.mjs \
  --storage-root "$FITAPPLIANCE_STORAGE_ROOT" \
  --run-id "$run_id"
```

HTTP success with invalid JSON or an invalid response contract retains the raw
bytes as a failed, non-terminal attempt and publishes no availability. Exact
model or canonical-URI mismatch retains the raw bytes, quarantines only that
`baselineLinkId`, and does not transfer status from a sibling product. Resume
uses the original run ID and frozen plan:

```bash
node scripts/architecture-v2/run-retail-lifecycle-refresh.mjs \
  --storage-root "$FITAPPLIANCE_STORAGE_ROOT" \
  --source-policy-id appliances-online-product-api-v1 \
  --run-id "$run_id" \
  --observed-at "$captured_at" \
  --batch-index N \
  --batch-size 100 \
  --resume
```

### Rebuild and release gate

After every applied run, finish all online replay that can update a tracked
audit before rebuilding downstream control artifacts. Never run an online
receipt audit in parallel with scale-control or system-contract generation: the
contract must reject that mixed epoch. Then rebuild strictly in the canonical
DAG order and inspect the refresh inventory before considering a release:

```bash
FITAPPLIANCE_STORAGE_ROOT=/Volumes/UGREEN-1TB/FitAppliance \
  npm run audit:historical-evidence-recovery -- --full
FITAPPLIANCE_STORAGE_ROOT=/Volumes/UGREEN-1TB/FitAppliance \
  npm run audit:installation-evidence-receipts:online

npm run build:retailer-observation-coverage
npm run build:retail-lifecycle-shadow
npm run build:retail-lifecycle-refresh-inventory
env -u FITAPPLIANCE_STORAGE_ROOT npm run build:architecture-v2
env -u FITAPPLIANCE_STORAGE_ROOT npm run build
npm run build:historical-evidence-system-contract
npm run audit:historical-replacement
npm run audit:fit-publication
node --test tests/architecture-v2/historical-evidence-system-contract.test.mjs
```

Repeat both offline build commands and compare the full tracked-file hash
manifest. The second build must be byte-identical. Do not run another online
audit after system-contract generation; if one is required, restart this
sequence from the online replay step.

The release gate is fail-closed. `retail-lifecycle-shadow.json` must report
`cutover.status == "READY"`, an empty `unresolvedLegacyCurrentIds`, and an empty
`unsafeRemovedLegacyCurrentIds`. At the 2026-07-20 checkpoint it is `BLOCKED`
with 81 unresolved products and zero unsafe removals. Do not deploy the shadow
lifecycle projection while that state remains.

### Rollback unit

Observation ledger, lifecycle/reference projection, public and historical
projection, audits, queues, controller state, runtime data, and documentation
form one release unit. Never revert only a generated file or an intermediate
task commit. Before cutover, prove the full pre-cutover commit builds offline;
after cutover, rollback by redeploying that complete commit. Never delete or
rewrite content-addressed retailer, PDF, or MinerU objects during rollback.
