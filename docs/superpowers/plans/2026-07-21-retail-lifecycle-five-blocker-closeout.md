# Retail Lifecycle Five-Blocker Closeout

> **Execution rule:** This is the bounded Task 9 closeout plan under
> `2026-07-20-fitappliance-system-first-repair-control-plan.md`. Read the status,
> invariants, dependency order, and active task before every implementation
> batch. A local green test cannot advance a task unless its downstream release
> boundary also passes.

- **Status:** COMPLETED
- **Date:** 2026-07-21
- **Active task:** none
- **Release mode:** SHADOW_ONLY
- **Production cutover:** candidate authorized; materialization and deployment
  intentionally not executed by this repair
- **User-owned file:** do not modify, stage, or commit the untracked `typescript`

## 1. Scope

Close the five remaining Task 9 blocker classes without weakening source,
identity, current-retail, Fit, replay, or rollback guarantees:

1. 76 prior-current products whose old retailer pages cannot be collected under
   current source policy;
2. LG `GS-B655PL`, whose old retailer link resolves to exact sibling
   `GS-B655MBL`;
3. polluted Fisher & Paykel row `f3` / `RF730QZUVX1 French Door 726L`, whose
   links and alleged source document all identify `RF730QZUVB1`;
4. proven Haier duplicate `f7` / `HRF520BHS French Door 520L`, waiting for an
   atomic merge into exact `HRF520BHS`;
5. the release gate: zero unresolved prior-current identities, deterministic
   full-DAG replay, rollback proof, and Task 10 documentation closure.

## 2. Verified Cohort Baseline

The current 79-product refresh inventory contains:

| Disposition | Products |
| --- | ---: |
| `BLOCKED_BY_SOURCE_POLICY` | 76 |
| `REQUIRES_AUTHORIZED_SOURCE_DISCOVERY` | 1 |
| `REQUIRES_EXACT_MODEL_REDISCOVERY` | 1 |
| `PENDING_ATOMIC_IDENTITY_CUTOVER` | 1 |

The 76 source-policy products all have an exact brand+model reference record:

| Exact official-market result | Products |
| --- | ---: |
| `ACTIVE_AU` government registry | 67 |
| `MIXED_AU` government registry | 1 |
| no exact Energy Rating registry row | 8 |
| no exact reference identity | 0 |

The 76 products span 34 washing machines, 25 fridges, 10 dryers, and 7
dishwashers. Their blocked links are observations, not 102 independent products:
57 Bing Lee, 21 JB Hi-Fi, 16 absent from the complete Partnerize feed, and 8
Harvey Norman links.

## 3. Non-Negotiable State Model

Three axes remain independent:

1. `retailLifecycle` answers only whether a fresh authorized retailer
   observation proves sale availability. Only `CURRENT_RETAIL` may carry a
   current retailer CTA or enter current Fit results.
2. `marketLifecycle` answers only whether exact-model official evidence proves
   an Australian market identity/status. It cannot create price, stock,
   retailer, or `CURRENT_RETAIL` state.
3. `identityDisposition` answers whether a canonical identity is retained,
   corrected, merged, or quarantined. It cannot transfer dimensions,
   installation fields, Fit evidence, or availability between models.

Allowed market states:

- `ACTIVE_AU_REGISTERED`: exact model, exact brand, active Australian government
  registration, bound to immutable snapshot hash and source line;
- `ACTIVE_AU_OFFICIAL`: exact model and a structured current-availability signal
  on an official Australian manufacturer source, bound to one immutable
  acquisition receipt;
- `IDENTITY_AU_OFFICIAL`: exact model on an official Australian source, but no
  admissible current-availability signal; this proves identity only;
- `INACTIVE_AU_REGISTERED`: exact model has only inactive Australian registry
  evidence;
- `CONFLICT_AU`: exact official sources disagree;
- `UNKNOWN_AU`: no admissible exact-model market conclusion.

Safe visibility outcomes:

- `CURRENT_RETAIL` -> current results and current Fit input;
- non-current retail plus active market or exact official AU identity ->
  `MARKET_REFERENCE_ONLY`, no CTA, no price, no current Fit input;
- archived retail -> `HISTORICAL_INPUT_ONLY`;
- identity quarantine, market conflict, or unknown prior-current -> hidden and
  still blocks cutover unless a separate explicit identity disposition closes
  it.

`ACTIVE_AU_*` is not a synonym for in stock. Registry dimensions remain
candidate/reference evidence and cannot promote `VERIFIED_FIT`.

## 4. Dependency Order

```text
B0 frozen baseline and adversarial fixtures
  -> B1 market-evidence projection and validator
  -> B2 shadow integration and cutover accounting
  -> B3 exact special-case identity dispositions
  -> B4 complete 79-item resolution inventory
  -> B5 atomic candidate projection
  -> B6 full DAG, deterministic replay, and rollback drill
  -> B7 Task 10 docs, commit, and release recommendation
```

No task may consume an artifact produced by a later task. The release threshold
is not changed after B0.

## 5. Tasks

### B0 - Freeze contracts and red tests

- [x] Record current 349 `CURRENT_RETAIL`, 3,087 `CATALOG_ARCHIVED`, 79
  `UNKNOWN_RETAIL`, and blocked cutover.
- [x] Confirm all 76 policy-blocked identities have exact reference rows; 67 are
  `ACTIVE_AU`.
- [x] Add failing tests for exact registry binding, no retail promotion,
  conflicting/absent registry status, stale artifact binding, f3 quarantine,
  f7 merge, LG exact identity, complete prior-current accounting, cutover
  projection, repeat run, and rollback.

### B1 - Build independent market-lifecycle evidence

- [x] Create a schema-versioned, deterministic official-market projection from
  immutable registry/reference evidence.
- [x] Bind every conclusion to category, exact normalized brand+model,
  snapshot hash, source ID, and source line.
- [x] Reject marketing-polluted identities, multiple canonical matches,
  missing source hashes, mixed active/inactive rows, and stale source bindings.
- [x] Add official-manufacturer receipt support only for the nine non-active
  registry cases; extract availability only from structured exact-product
  metadata. An unreceipted URL or generic page text is not evidence.
- [x] Keep ordinary builds independent of `/Volumes/UGREEN-1TB`; immutable raw
  evidence is verified during acquisition, while the tracked normalized
  projection is replayed during builds.

### B2 - Integrate market and retail lifecycle without conflation

- [x] Add `marketLifecycle` to each shadow record and source bindings.
- [x] Keep `retailLifecycle.lifecycleState` unchanged.
- [x] Introduce `MARKET_REFERENCE_ONLY` visibility and prohibit retailers,
  price, current Fit input, and current-result publication for it.
- [x] Define cutover accounting as an exhaustive partition of all prior-current
  IDs: current retail, explicit unavailable/archive, active-market reference,
  atomic identity merge/quarantine, or unresolved.
- [x] Require every ID to appear in exactly one partition.

### B3 - Close the three exact identity cases

- [x] LG `GS-B655PL`: retain its canonical identity; bind exact official AU and
  exact government registration evidence; invalidate the `GS-B655MBL` link;
  publish only as market reference unless a fresh exact retailer observation is
  independently acquired.
- [x] Fisher & Paykel `f3`: add an explicit unsupported/polluted canonical
  quarantine action. Reassign only independently exact `RF730QZUVB1` retailer
  facts to the already-existing B1 canonical; never transfer f3 fields or claim
  X1/B1 alias equivalence.
- [x] Haier `f7`: apply the proven duplicate merge into exact `HRF520BHS`; remove
  the source duplicate atomically; preserve immutable event history; do not
  donate dimensions or Fit fields.

### B4 - Produce a zero-ambiguity closeout inventory

- [x] Resolve all 76 source-policy products through admissible market evidence,
  not prohibited retailer collection.
- [x] Resolve LG, f3, and f7 under B3 dispositions.
- [x] Require summary totals, per-ID reason codes, evidence IDs, and no overlap.
- [x] If any exact official identity remains unsupported, or an official-source
  conflict cannot be explained by a newer exact registration/offer, keep
  cutover blocked and report that ID; never force zero.

### B5 - Build one atomic candidate release

- [x] Apply identity changes, ledger events, lifecycle states, market states,
  visibility, current retailer projection, historical/reference projection, and
  Fit publication in one candidate build.
- [x] Require zero unresolved and zero unsafe removals before candidate
  authorization.
- [x] Ensure market-reference products have no retailer CTA, price, stock, or
  current Fit classification.
- [x] Keep released production bytes unchanged while mode is `SHADOW_ONLY`.

### B6 - Verify replay, determinism, and rollback

- [x] Run focused tests, Architecture V2, full test suite, lint, and build.
- [x] Run the complete offline release DAG twice and compare semantic and file
  hashes.
- [x] Replay process crash/resume, repeated batch, duplicate target,
  cross-source conflict, stale binding, schema upgrade, disconnected external
  drive, and isolated identity mismatch.
- [x] Perform a rollback drill from candidate to the current released epoch;
  immutable evidence must remain intact and released bytes must be restored.

### B7 - Close Task 10

- [x] Correct stale test/build counters in the parent control plan.
- [x] Update product-core and operations documentation for the three-axis model,
  acquisition/replay commands, visibility semantics, and rollback.
- [x] Record final hashes, counts, residual risks, and whether production
  cutover is authorized.
- [x] Commit only scoped files; leave `typescript` untracked and untouched.

## 6. Completion Evidence

- Release candidate
  `retail_lifecycle_release_6c42c754aeb1ff49097b32b4` is
  `READY_FOR_CUTOVER`: all 1,384 legacy-current products are accounted for,
  with zero unresolved IDs and zero unsafe removals.
- The exhaustive partition is 260 still-current, 1,045 explicitly
  unavailable, 77 market-reference-only, one evidence-bound identity merge,
  and one unsupported-canonical quarantine. The final candidate has 3,513
  products; 89 independently observed relistings bring candidate current retail
  to 349.
- Market-reference output has zero retailer, price, stock, offer, affiliate, or
  discovery-URL leakage. The final public candidate contains no collection
  attempts or conflict payloads; its 8,653,582 bytes remain below the enforced
  two-times-baseline ceiling. Fit publication has zero violations.
- Rollback is `PROVEN_BYTE_IDENTICAL` against released projection SHA-256
  `50a85830929e5298a1f484b0ea3367d7480a3ddb91247bf16d7bd93eab6e33b1`.
- `npm run test:architecture-v2` passed 1,186 tests; `npm test` passed 2,846
  tests; lint and the complete site build passed.
- Two successive offline Architecture V2 builds produced identical hashes for
  all 137 tracked architecture/reference files. Their combined manifest
  SHA-256 is
  `cae86752cdee37f7c1a873bff5f7da58a6dda607d02bcfa622ffcfec2abe9a9d`.
- A complete Architecture V2 build also passed with
  `FITAPPLIANCE_STORAGE_ROOT` pointed at a nonexistent directory.
- The 38-stage system contract is
  `historical_evidence_system_9b33eff3a2d26abab79c6c6c`, with semantic
  SHA-256
  `9b33eff3a2d26abab79c6c6c9ec768680f71022ccbf1f62809195792f813e9bf`.
- Production still serves the released 3,515-product baseline. Candidate
  materialization and deployment are separate explicit operational actions,
  not side effects of a normal build.

## 7. Acceptance Matrix

Every behavior change must pass all five boundaries:

| Boundary | Required proof |
| --- | --- |
| Producer | deterministic schema-valid artifact with immutable source bindings |
| Consumer | shadow/inventory rejects missing, conflicting, or wrong-model evidence |
| Replay | same inputs produce the same semantic result; prior decisions never weaken |
| Publication | only fresh retail evidence creates current CTA/Fit output |
| Rollback | prior released projection is restorable without deleting evidence |

## 8. Stop Rules

Stop and repair this plan before implementation continues if:

- a market source is used to claim retail stock;
- an identity merge would transfer product fields or Fit evidence;
- a tracked derivative lacks immutable source hash/locator binding;
- a normal build starts requiring the external evidence drive;
- a prior-current ID is omitted from the exhaustive disposition partition;
- candidate generation mutates released production while mode is
  `SHADOW_ONLY`;
- a test depends on a later task's not-yet-built artifact.
