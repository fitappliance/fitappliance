# Historical Evidence Recovery Runbook

Status: canonical operations guide
Last verified: 2026-07-16
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
12. A complete zero-candidate resolver pass may suppress only a resolver-only
    target under the same recovery policy and the same resolver contract (ID,
    version, scope and required flag). An incomplete resolver remains retryable;
    a policy change, resolver-contract change or new explicit official candidate
    job reopens the target automatically.
13. Every fresh run, including a dry-run, scans completed run state before it
    creates a run directory or invokes discovery. An unpromoted acceptance or
    complete zero-candidate inventory blocks the same policy and resolver
    contract; another terminal outcome additionally requires the same toolchain
    epoch. Resume is exempt because it continues the immutable run. A malformed
    historical state fails closed. Audit and promote an eligible prior run
    instead of rerunning it.

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
The production graph contains thousands of targets and must not use that
override.

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
