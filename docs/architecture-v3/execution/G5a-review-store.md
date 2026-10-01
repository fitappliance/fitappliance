# G5a review store and CurrentEligibility

Current coordinator status (2026-10-01): **LOCAL_APPROVED_PENDING_CI**.
Complete local store/eligibility scope is independently approved at exact source
commit `307a774f3c5ea78193522ae83a2ccdd6b6f19e00`. Focused tests and full3,465
pass with zero skips; exact-head Node20 CI/canonical build/release remain pending.
The initial and continuation executor handoffs below are retained as history;
the final coordinator acceptance record supersedes their pending-review status.
No production receipt admission, publication, Fit enablement or release is
claimed.

## Initial pure increment handoff (2026-09-30, historical)

The initial executor handoff and subsequent coordinator acceptance are retained
verbatim as history through the continuation section below.

Original handoff status: **REVIEW_REQUIRED for this increment only**. This is executor self-test
and handoff evidence. Independent review is **NOT_STARTED** at handoff; full
G5a acceptance, durable persistence and CurrentEligibility remain pending.

## Scope and execution identity

Execution date: 2026-09-30. Branch: `codex/g5a-review-graph`. Base:
`55020ed9673e772c84652ed6ef8f0c7aad6d09cd`, containing the preserved documentation
checkpoint on the released G4b/D-1 and separate trust-display baseline.
The task's current model/storage instructions supersede the execution protocol's
older Terra/internal-storage defaults. Implementation, cache, temporary files
and logs used the authorized isolated UGREEN workspace.

The three implementation files are:

- [Decision and graph module](../../../src/domain/architecture-v3/claim-review-decision.mjs).
- [Decision and graph tests](../../../tests/architecture-v3/claim-review-decision.test.mjs).
- This execution report.

The main agent separately owns the canonical plan's progress-only edits. No
store, writer, publisher, CurrentEligibility implementation or placeholder API
was added. Product behavior, source producers, identity gates, policies,
public data and generated assets were not edited by the executor.

Required inputs read: original repository `AGENTS.md`, Product Core Brief,
canonical V3 plan section 2.5/G5a, V3 design section 10, execution-role protocol,
ClaimV3 implementation/tests and the canonical evidence JSON codec.

| Frozen input | SHA-256 |
| --- | --- |
| Canonical plan at dispatch/base | `1f91fe8c66c0a78f79dd4ee18d940405e4bb90bb43fdc17546a1f6ded765b8f1` |
| V3 design | `bf126bbaaed6ce62d57aa71118a9d7cc0e253fdfd46eab9de242dffde96c6367` |
| Product Core Brief | `9be84a660f55c998cf9c4b7999d0461609a66ed43abc4225af8aed9052781719` |
| New module at verification | `2acc711be73be60d61e837fa2e7ae934ecab27593dcffcabc2b425dff2536c61` |
| New tests at verification | `149fff6edc47d2163cffa0c01f82a96c326489c357d711ebda21727b3d8abbed` |

The main agent's later plan status/progress changes intentionally change its
file hash without changing this increment's frozen semantic contract.

## Exact exported API

The module exports only `ClaimReviewDecisionValidationError` and these four
pure functions:

```text
createClaimReviewDecision({
  claim, validationInputs, state, reason: { code, scope }, policyId,
  policySha256, actor, decidedAt, idempotencyKey, supersedesDecisionIds,
  forkResolution
}) -> frozen decision

validateClaimReviewDecision({ decision, claim, validationInputs })
  -> frozen canonical decision

validateClaimReviewHistory({ decisions, claims: [{ claim, validationInputs }] })
  -> frozen { decisions, reviewHeads, historySha256 }

validateProposedClaimReviewDecisions({
  basis: { decisions, claims: [{ claim, validationInputs }] }, decisions
}) -> frozen {
  events, proposedReviewHeads, basisHistorySha256, proposedHistorySha256
}
```

Invalid inputs throw `ClaimReviewDecisionValidationError`, a `TypeError` with
code `INVALID_CLAIM_REVIEW_DECISION`. There are no filesystem operations,
callbacks, implicit current-time inputs or hidden writes.

Every resolved Claim is validated by the existing
`validateEvidenceClaimV3({ claim, validationInputs })`. Events store `claimId`,
not another copy of the Claim. Exact required metadata keys reject missing or
extra fields, null/blank text, unsupported states, non-finite numbers,
accessors, symbols and JSON coercion. The states are exactly `admitted`,
`rejected`, `quarantined` and `superseded`.

An event contains schema version 1, the existing canonicalization version,
`decisionIdentityDomain: fit-claim-review-decision-v1`, its Claim reference and
all supplied metadata. `decisionId` is
`fa_claim_review_decision_<64 lowercase SHA-256 hex digits>` over the canonical
payload excluding only `decisionId`. The existing canonical JSON helper is
reused. `decidedAt` must be a real UTC date in exact
`YYYY-MM-DDTHH:mm:ss.sssZ` form. The factory sorts unique parent IDs; stored
validation rejects a noncanonical representation or changed identity payload.

Reason code/scope are nonempty strings without an invented taxonomy. Actor,
policy, reason/scope and the explicit boolean `forkResolution` are recorded
metadata. Their structure and hashes do not authenticate reviewer authority,
prove source truth, establish current eligibility or authorize publication.
Admission only permits later adjudication; it is not an accepted field or
public Fit result.

## Historical DAG and proposed-transition semantics

History validation checks every known Claim, unique decision IDs, resolvable
same-Claim parents and an acyclic graph, then validates every event's canonical
identity. Structural cycle diagnostics precede payload-hash validation so that
malformed cyclic histories do not hide behind the impossible circular hashes.

`reviewHeads` contains rows only for Claims with decisions:
`{ claimId, headDecisionIds, state, forked }`. Each head set is sorted. A single
terminal head supplies its recorded state. Multiple terminal heads are retained
and the aggregate state is `quarantined`, including when one branch is newer or
admitted. No timestamp or lexical-ID winner is selected. Claims without decisions
have no invented review state.

Historical validation accepts structurally valid concurrent forks. It does not
invent an unavailable committed order or retrospectively prove that a historical
resolution covered the exact commit basis at its creation. Exact current-head
coverage is the proposed-transition validator's job. A first decision has no
parents; a normal replacement must name the sole current head. A fork resolution
must explicitly name every current terminal head, with no extra ancestor or
cross-Claim parent. Fork-resolution metadata requires multiple parents; normal
events have at most one.

The proposal's `decisions` array is an explicit **sequential batch in caller
order**. Each event is checked against the supplied basis plus all preceding
proposed events. Reversing a dependent chain fails; independent history/Claim
input order does not change the basis digest. Duplicate existing/proposed IDs
are rejected. The history digest has a separate
`fit-claim-review-history-v1` domain and binds sorted known Claim IDs and sorted
validated events, including their metadata. Output arrays/objects are deeply
frozen detached snapshots; caller inputs and historical records remain unchanged.

These digests bind validated pure inputs and outputs. They are not a committed
store head, CAS token, durability guarantee or authenticated admission record.
Idempotency keys are recorded and hashed; retry replay and conflicting-key
handling belong to the future store and are not guaranteed by this increment.

## Verification evidence

The executor applied the TDD and verification-before-completion skills and read
`writing-good-tests.md` from the installed local skill cache after the packaged
resource link failed. The tests use real ClaimV3 fixtures with compiled semantics,
engineering witnesses, typed artifacts/fragments and anchors; Claim validation
was not stubbed. They attest synthetic portable validation, not original-source
replay or runtime parser correctness.

Logs are retained outside Git in the UGREEN review directory, with basenames
listed below. Runtime: Node `v22.23.1`. Commands used external `TMPDIR` and
`npm_config_cache`.

| Check | Result | Log basename |
| --- | --- | --- |
| Initial test import | Module absent; not counted as behavior RED | `g5a-initial-import-red.log` |
| Callable event behavior RED | 5 tests, 0 pass, 5 fail | `g5a-event-behavior-red.log` |
| Callable graph/transition behavior RED | 27 tests, 1 pass, 26 fail | `g5a-graph-behavior-red.log` |
| `node --test tests/architecture-v3/claim-review-decision.test.mjs` | 27 pass, 0 fail/skip; 0.69 seconds | `g5a-targeted-green.log` |
| `npm run lint` | Exit 0 | `g5a-lint.log` |
| `npm test`, bounded to 180 seconds | Exit 0; 3,367 pass, 0 fail/skip/cancelled; 45.94 seconds | `g5a-full-suite.log` |

The dangerous RED cases called the actual exported functions: unknown/accepted
states, malformed reasons, metadata substitution, cross-Claim edges, dangling
parents, duplicate IDs, cycles, incomplete fork recovery and wrong current-head
replacement failed with assertion evidence, including `Missing expected
exception`. The callable seam used real ClaimV3 validation. The already passing
positive metadata identity test was not counted as a failing regression.

The first strict implementation run had 25 pass and two assertion failures:
`historical parent edges cannot cross Claim boundaries` and
`proposed decisions cannot reuse existing IDs or smuggle cross-Claim parents`.
Both threw the intended domain validation error, but the message's capitalized
`Claim` did not match the test's lowercase regex. Only the error-message
capitalization was corrected; rejection behavior and the tests were preserved.
The subsequent 27-pass run and full suite use the final verified module bytes.

The full build was not run because it regenerates public outputs and this is a
private pure-module increment. Main-owned documentation and unchanged-path gates
remain outside this executor's check results. No commits, pushes, PRs, merge or
deployment were performed by the executor.

## Remaining G5a work and handoff

Still pending: the common cumulative immutable store/head, coordinated live-writer
lock, expected-head CAS, same-key replay/conflict handling, event/directory/head
flush guarantees, atomic batch manifests, fault-injected crash/recovery behavior,
fixed `reviews`/`legacy-upgrades` namespaces, real committed-basis preparation,
shared G6c batch integration and transitive CurrentEligibility/revocation.
Historical replay/current eligibility/adjudication/publication remain distinct.
This increment does not make G5b eligible or complete any real receipt repair.

The executor stops writing after this report and hands the three-file increment
back to the main agent for freezing and a different agent's independent review.
No independent approval is claimed here.

## Coordinator record: independent increment acceptance

The preceding NOT_STARTED review status describes the executor handoff. A distinct independent reviewer, `/root/g5a_graph_review` (6.1 Sol), subsequently approved frozen commit `da296e4bd40db616b6f765098530452b0e02f362` against base `55020ed9673e772c84652ed6ef8f0c7aad6d09cd`. Executor `/root/g5a_graph_implementation` and reviewer are different agent identities.

Received verdict: **APPROVED for the bounded pure G5a increment only**, with no Critical or Important findings. Reviewer independently verified exact HEAD, clean four-file scope and frozen module/test identities, reproduced focused27/27 with zero failures/skips, passed16 additional counterchecks (including three-head recovery, typed hash domains, tampered references, cycles, cross-Claim parents,20 historical permutations, getter non-execution and deep immutability), and passed lint plus explicit source/test syntax checks. These checks use real ClaimV3 validation; they do not authenticate actor/policy/fork metadata or grant receipt/public/Fit authority. Historical structural history and exact proposed-head coverage remain separate guarantees. The reviewer did not edit product, tests or report files or repeat the full suite/build/remote CI.

Coordinator verified the executor's mounted full suite3367/3367, zero skips/failures, and lint exit0. Documentation audit passed; portability0violations with263 warnings in unchanged preexisting scan roots. Existing G4b25-package/source/lock build identity gate passed. Public assets/data, dependencies, production evidence producer/receipt and policy paths are unchanged. This increment adds private unconsumed domain logic; canonical generation/schema checks were not rerun because no generated public schema/data changed. Exact-commit remote Node20 CI remains NOT_RUN: no push/PR/deployment occurred. It is still required before any future release.

Core/test SHA-256 remain `2acc711be73be60d61e837fa2e7ae934ecab27593dcffcabc2b425dff2536c61` / `149fff6edc47d2163cffa0c01f82a96c326489c357d711ebda21727b3d8abbed`; this follow-up changes progress/report documentation only. The previous local documentation commit55020ed96 remains an ancestor, preserved without changing released production8b87ecbcf. All task work/cache/artifacts stay on UGREEN; original dirty main/G4b worktrees remain untouched.

The selected pure increment is locally verified. Full G5a is not accepted and G5b is not unlocked: the next implementation is the single cumulative committed-head store shared by reviews/legacy-upgrades, with preparation, writer coordination, CAS, idempotent recovery, validated references and honest supported-backend flush semantics. CurrentEligibility and transitive source/profile/relationship/rights revocation must also be completed before full G5a acceptance. G6 receipt repair/whole-inventory coverage remain pending. No new release scope is authorized or deployed by this local handoff.

## G5a continuation: shared store and CurrentEligibility

Continuation date: 2026-10-01 UTC. Base is
`53ae24b7e8a4d972caf1ad90c25d352d7bd86de0`; the earlier increment, its independent
acceptance and the original dispatch/release history above are preserved.
Continuation status: **REVIEW_REQUIRED**, subject to the final verification
record below and a distinct independent reviewer. The approved corrected design
was reviewed before implementation. This executor does not declare independent
approval, full G5a acceptance, or an unlocked G5b prerequisite.

The sole executor adds the store/eligibility modules and their two tests and
appends this report. The coordinator alone edits canonical plan progress. The
approved graph core/test retain SHA-256 identities
`2acc711be73be60d61e837fa2e7ae934ecab27593dcffcabc2b425dff2536c61` and
`149fff6edc47d2163cffa0c01f82a96c326489c357d711ebda21727b3d8abbed`.
The current user instruction to use 6.1 Sol and UGREEN supersedes the older
execution protocol's Terra/internal-storage defaults. Worktree, review state,
synthetic bytes, runtime temporary files, cache and logs remain on UGREEN. No
production ledger, public data, source producer, policy, generated asset or
publication/Fit consumer was written by this continuation.

### Store API and schema

The store module exports exactly the five planned functions:

```text
createClaimReviewStore({ storeRoot, io, lock, clock }) -> frozen store handle
prepareClaimReviewDecisions({ store, decisions, expectedHeadSha256 })
  -> frozen preparation | STALE_HEAD
appendClaimReviewDecision({ store, decision, expectedHeadSha256 })
  -> frozen { event, headSha256 } | STALE_HEAD
commitImmutableEvidenceBatch({
  store, namespace, objects, manifest, expectedHeadSha256, idempotencyKey
}) -> frozen { status: committed, manifest, headSha256 } | STALE_HEAD
replayClaimReviewHistory({ store, claimId, asOf, policy }) -> frozen graph
```

The caller supplies an absolute local store root. Its fixed layout is
`objects/{reviews,legacy-upgrades}/<sha256>.json`,
`requests/<hash-of-key>.json`, `batches/<sha256>.json`,
`heads/<sha256>.json`, one atomically replaced `head.json` and a permanent
`writer.lock`. There are no separately advancing review/upgrade pointers.
Objects and records use the existing strict canonical evidence JSON codec;
regular files, canonical bytes, exact typed record keys, hashes and references
are validated when reading. Symlink store paths reject.

An object is `{ namespace, sha256, value }`; `value` must be a plain JSON
object. Nested null and zero remain valid; top-level primitives reject before
request/head publication. A review object is exactly a real resolved Claim
record `{ recordType: claim, claim, validationInputs }` or an event record
`{ recordType: decision, decision }`. Claim inputs use the actual V3 validator;
opaque legacy-upgrade metadata conveys storage integrity, not semantic review.
Migration audit objects cannot be cast into decision events. Cross-Claim review
parents remain rejected by the unchanged graph core.

A manifest contains schema version 1, domain
`fit-immutable-evidence-batch-v1`, sorted unique object references and unique
`reviewDecisionIds` in explicit semantic order. Physical object order does not
choose review order. Every staged object is referenced; referenced records must
be staged or retained by the current cumulative basis. Review IDs resolve
exactly to staged events, and the actual proposal validator checks their order
and complete current-head coverage at that basis.

A staged request records its operation type, namespace/key, exact original
semantic payload/hash, original basis head, minted commit time, staged objects
and manifest. The stage is reconstructed from that payload and time before any
retry publication; key/type/namespace must also bind the caller and fixed
filename. Expected-head metadata and store-minted decision time do not alter
the semantic retry fingerprint. Caller-supplied explicit decision time remains
part of the payload. A committed same-key/same-payload retry returns the
original event/time/head even after later commits or with a stale expected
head; a changed payload conflicts. A pending operation resumes only at its
original basis, retaining orphan immutable data when that basis becomes stale.

A batch binds its request hash, manifest and commit time. A cumulative head
binds the preceding head, sequence, batch hash and the union of all committed
references. The mutable pointer identifies that single head. Read/retry
validation walks the immutable chain, validates request/batch joins, timing,
reference retention and the real review history; corruption never resets a
nonempty store. Absence has a distinct sentinel from parsed JSON null. Missing
pointers recover only verified empty-genesis final/temporary files; a nonempty
committed history with a missing pointer rejects.

Preparation is pure and returns bound events, proposed heads, basis hash and
staged object/manifest inputs for the common commit primitive. It creates no
files and advances no head. A stale CAS returns typed `STALE_HEAD`; neither
preparation nor unreferenced files admits a Claim. Combined review and metadata
batch B retains A through the same head.

### Lock and durability boundary

Default Darwin acquisition uses native `lockf` and Linux uses `flock`. The
writer opens the permanent lock inode and passes that same open file
description as descriptor 3 to native acquisition. The writer retains its FD
through every write and flush; acquisition helper exit does not release its
ownership. No elapsed-time lease, PID takeover or helper-liveness race is used.
A live contending writer fails, and writer process death releases the kernel FD
lock. Real separate Node processes verify both behaviors. Process tests have
30-second bounds, ready waits and cleanup. Unsupported platforms fail closed
unless an explicit compatible process lock is supplied.

Injected IO is an explicit trusted filesystem-compatible backend. Injected
locks must assert `exclusiveAcrossProcesses: true` and keep exclusive ownership
through the awaited task; those provider claims are not authenticated by this
module. Default local IO/native locking are exercised with actual filesystem
operations. All required fsync errors, including unsupported directory flushes,
propagate. The previous recovery helper's swallowed directory-flush errors are
not reused as durability proof.

The writer flushes immutable objects and required directory entries before
publishing a head, then flushes the renamed pointer before acknowledging a
commit. Ambiguous committed retries revalidate and flush retained objects,
requests, batches, heads, directories and the pointer before returning success.
The coordinator's UGREEN syscall probe passed file/directory flush and rename
operations. This establishes tested syscall sequencing, **not hardware
power-loss durability**. Logical injected faults and process death tests do not
claim to simulate a device losing acknowledged writes or prove an unsupported
filesystem/backend.

### Historical causal replay

Store ingress rejects review `decidedAt` later than its batch's committed time
and a commit clock earlier than the previous batch. These conditions are also
validated on stored referenced history. Earlier decision metadata may be
out of timestamp order within those bounds; timestamps do not select a winner.

Replay uses the cumulative committed prefix as of explicit `asOf`, preserving
all causal parent ancestry and returning that historical basis head. Its
requested `{ policyId, policySha256 }` must match every relevant terminal
review head. Older-policy ancestors remain validated and retained, so v1
before a v2 replacement and v2 after it replay correctly; v1 at the v2 terminal
basis rejects. A fork is retained and quarantined rather than filtering out an
inconvenient head. This is the store's historical knowledge/commit boundary,
separate from a source receipt's original verification time or current policy.

### Eligibility API and resolved inputs

The eligibility module exports only:

```text
computeCurrentEligibility({
  asOf, activeHeads, sourcePolicy, profileStatus, dependencyGraph, rightsDecisions
}) -> Promise<deeply frozen typed results>
```

All inputs are explicit strict JSON snapshots. There are no caller fetch
callbacks, implicit current-time reads or writes. `asOf` is canonical UTC with
milliseconds. Current intervals are half-open: `validFrom <= asOf < validUntil`.
Invalid dates or schema/hash failures reject; missing, unknown, future, expired
or revoked current statuses produce typed ineligible results.

The dependency graph has schema version 1 and domain
`fit-current-eligibility-graph-v1`, resolved nodes and a corpus of
`{ objectPath, sha256, bytesBase64 }` records. Paths are bounded relative names;
base64 bytes and raw hashes are validated before use. A node contains
`{ nodeId, kind, recordSha256, record, dependencies }`; its canonical ID uses
domain `fit-current-eligibility-node-v1` and binds kind/record hash. Every
reference resolves; duplicate nodes, dangling edges, cycles, omitted or extra
payload dependencies and type/hash substitutions reject.

Supported immutable record kinds are:

- `claim`: real `{ claim, validationInputs, relationshipAssertionIds }`. The
  relation list must exactly match the actual Claim applicability proof. Direct
  Claims depend on their matching resolved receipt when present; missing
  receipt evidence blocks eligibility. Derived Claims require the exact parent
  Claim and every referenced resolved relationship.
- `receipt`: `{ receipt }`, replayed by the actual `verifyDirectClaimReceipt`
  against verified corpus bytes. It joins the exact graph Claim, its validation
  proof and the exact resolved source binding; a receipt cannot invent a ghost
  Claim, accept a self-resealed policy substitution or hide a missing binding.
- `source-binding`: `{ sourceBinding }`, replayed by the actual source-binding
  verifier from immutable original/source/profile bytes.
- `relationship`: `{ assertion, semantics }`, reproduced by the actual
  relationship factory. The current producer records research candidates with
  unverified proof; they never authorize derivation here.
- `adjudication`, `readiness`, `release-candidate`: dependency-use witnesses
  with schema/domain, matching kind, resolved artifact reference and exact
  `inputNodeIds`. They require a direct Claim ancestor. Eligibility only reports
  that these witness dependencies are currently usable; it does not validate a
  G5b adjudication, readiness report, release candidate or accepted field.

`activeHeads` resolves the exact same graph Claims/validation records, complete
canonical decisions and a declared review policy. The unchanged history
validator supplies terminal heads. Missing/nonadmitted reviews, future heads,
policy mismatch and unresolved forks block eligibility without selecting an
older or newer timestamp winner.

Current authority snapshots have their own schema/domain and a canonical
`sha256` over all fields except that digest:

- `sourcePolicy` resolves current compiled semantics, the exact review policy,
  actual manufacturer/resolution policy JSON plus their hashes, scoped source
  statuses and relationship statuses. It also selects one finite `purpose`.
  Historical source/semantic identities must equal these current identities;
  successfully replaying a v1 receipt does not qualify it under v2.
- `profileStatus` resolves the actual current profile policy JSON and brand
  registry, explicit `expectedProfilePolicySha256`, and scoped profile records
  with the same expected policy identity. The existing profile selector
  validates the policy/registry and current selection; historical profile,
  current policy and current status must bind exactly.
- `rightsDecisions` resolves the existing rights dictionary and exact
  provider/source/field/action decisions, verified evidence hashes, intervals,
  recorded conditions, actor and reason. The actual dictionary's action
  records use `{ id, description }`; its state IDs and scope keys are reused.
  No new grant/physical policy taxonomy is introduced.

Every source/profile/relationship/rights status records canonical intervals,
nonempty actor and `{ code, scope }` reason metadata. Snapshot hashes verify
integrity, **not authentication or external authority**. The caller must supply
trusted current authority snapshots; ordinary caller booleans, arbitrary
annotations, retailer/provider hints, admission metadata and historical
`unknown_blocked` receipt rights do not establish grants.

Purpose `adjudication` requires the existing `cache_source`,
`cache_normalized_fields`, and `retain_audit_copy` actions. Purposes
`public_display`, `quote_excerpt`, and `link_documents` additionally require
their respective existing action. Each needed action requires exactly one
unconditional `granted` decision for the exact receipt scope with present
hash-verified evidence bytes and a current interval. Missing/conflicting scope,
conditional/unknown/withdrawn/expired/denied state or missing evidence blocks;
a cache grant cannot grant display, excerpts or document links. Eligibility
reports action usability and does not publish anything. The immutable direct
receipt's derived `unknown_blocked` decisions remain unchanged.

Each node result is `{ nodeId, kind, status, reasons }`, with
`status: eligible | ineligible` and typed `{ code, originNodeId }` reasons.
Reasons propagate through every dependency, preserving their origin even when
a descendant is already blocked. Derived Claims always include
`DERIVATION_PROOF_UNAVAILABLE`; research relationships include
`RELATIONSHIP_UNVERIFIED`. Actual direct Claims and dependency-use witnesses
prove eligible-to-ineligible source/profile/rights propagation without
manufacturing derived proof or G5b acceptance. Output binds explicit time,
finite purpose, sorted graph/history and current snapshot digests, and all
results are detached, deeply frozen and deterministic for those inputs.

### Continuation TDD and independent findings

Initial store callable RED had four tests fail actual behavior: cumulative
CAS/retry/payload handling, minted-time stability, namespace rejection and
frozen preparation. A dependent batch ordering counterexample failed before
manifest ordering drove the transition validator. The initial strict store
run was 15/17: one test accidentally reused a key before reaching its intended
cross-Claim guard, and one empty-genesis recovery was too conservative. The
fixture key was corrected and empty-genesis recovery fixed. The first native
process harness waited with stdin still open after durable acknowledgement;
that dedicated test process was stopped, stdin cleanup/bounds were corrected,
and the interrupted log is retained. No unsupported backend was hidden.

Independent review of the first 22-test store freeze reported five Important
findings: unbound pending staged output, genesis temporary-file recovery,
parsed-null/absence confusion, timestamp-filtered causal replay and rejected
valid policy transitions. The coordinator authorized only these corrections.
The final-contract regression run captured 26 pass/10 actual failures before
fixes. New tests also reach the **non-genesis final pointer** rename/directory
flush and demand retry reference reflush before acknowledgement. A later narrow
R1 follow-up changed only a pending batch key; its RED log captured premature
publication before the explicit caller/key/type/namespace binding correction.
Immutable v1/v2 corrected snapshots and all original reviewer repro stores are
preserved externally. The first review verdict is history; final independent
re-review is still required.

Automatic approval review rejected the initial TDD eligibility seam because
it would temporarily mark every node eligible without required validation.
That write did not happen. A fail-closed callable seam was used instead; five
real behavior tests failed after actual direct receipt replay succeeded.
A first adapter attempt incorrectly treated the existing structured rights
records as strings; the adapter was corrected against actual dictionary bytes,
without changing dictionary or fixture policy. Expanded eligibility tests
passed 55/57 before exact joins were completed. One relationship test initially
only distinguished error codes; it was strengthened to omit one of multiple
actual payload references. The resulting two join tests both failed actual
rejection behavior before the guards, with separate RED evidence. Tests use a
cached real synthetic G4b fixture and independent detached snapshots per test;
Claim, source, profile and receipt validation are never stubbed.

Continuation logs remain outside Git in the UGREEN review directory:
`g5a-store-behavior-red.log`, `g5a-store-order-red.log`,
`g5a-store-harness-interrupted.log`,
`g5a-store-review-regressions-red-final-contract.log`,
`g5a-store-key-binding-red.log`, `g5a-store-targeted.log`,
`g5a-eligibility-behavior-red.log`, `g5a-eligibility-regressions-red.log`,
`g5a-eligibility-joins-red.log`, and `g5a-eligibility-targeted.log`.
The coordinator retains the independent review report/counterchecks and the
storage probe; executor test results are not independent approval.

### Final verification and continuation handoff

Runtime: Node `v22.23.1`. All commands used external TMPDIR/npm cache.
The complete suite includes the existing V3 syntax gate.

| Check | Verified executor result | External log |
| --- | --- | --- |
| Store targeted tests | 37 pass; 0 fail/skip/cancelled; 8.513 seconds | `g5a-store-targeted.log` |
| Eligibility targeted tests | 61 pass; 0 fail/skip/cancelled; 41.182 seconds | `g5a-eligibility-targeted.log` |
| `npm test`, bounded to 180 seconds | Exit 0; 3,465 pass; 0 fail/skip/cancelled; 58.283 seconds | `g5a-store-eligibility-full-suite.log` |
| Suite bound/status | No timeout; wrapper 59.273 seconds | `g5a-store-eligibility-full-suite-status.json` |
| Whitespace diff check | Exit 0 | Executor read-only check |

| Frozen continuation file | SHA-256 |
| --- | --- |
| `claim-review-store.mjs` | `14a5f940c95397d44008c9a3e4125569b9c8814a70c86a74bb3e7deec84b0045` |
| `claim-review-store.test.mjs` | `c46aa1a12db3f5ffd6ac2077da00a320ae41c619d792aecc39dcc10884d9681c` |
| `current-eligibility.mjs` | `a8a17dde125ff0ca2d1f2677fc9ef5b8c914176ec6d39794914dd24866220bf9` |
| `current-eligibility.test.mjs` | `0bd42e2b67b97cd360e2088b292262e23533f23958a605fe5538bb4098ee0ab7` |

Copies of the current store files are in `g5a-store-fixed-snapshot-v2/` and
eligibility files in `g5a-eligibility-frozen-snapshot/`, in the external review
directory. Earlier snapshots and counterexample logs are preserved. The
executor is frozen for a different review agent's final combined review;
no independent signoff is self-certified here.

The coordinator owns lint, documentation/portability checks, the unchanged
G4b build-identity gate, publication-boundary check and final progress/acceptance
record. Their logs use `g5a-root-final-*` names. They are not rerun or silently
counted as executor tests. Tracked public data/assets, dependencies, source
producers, policies and graph-core paths are unchanged. The canonical build
and generated-data schema checks were not run by this executor because these
private modules add no generated/public data and build regenerates outputs.
Remote exact-commit Node20 CI, canonical build/release, final independent
acceptance and actual downstream G5b/G6 integration remain pending.

The portable fixtures attest synthetic byte replay through existing actual
G4b/Claim/source/profile validators, not original PDF/OCR quality, historical
field acceptance or inventory completeness. No commit, push, PR, merge,
deployment, production ledger or new real admitted/public receipt was created
by this executor. Retained unrelated original worktrees remain outside scope.
The earlier deferred store/eligibility implementation now exists; its local
completion remains subject to independent final review and coordinator
acceptance before the full G5a prerequisite can be marked accepted.


## Coordinator acceptance: complete local G5a scope (2026-10-01)

Accepted locally at exact source/test commit
`307a774f3c5ea78193522ae83a2ccdd6b6f19e00`, base
`53ae24b7e8a4d972caf1ad90c25d352d7bd86de0`. The source commit adds exactly
the four store/eligibility module/test files. The original graph core is
unchanged; documentation55020ed96 and graph checkpoint53ae24b7e remain
ancestors. Current remote main was read-only verified as
`8b87ecbcfe5bb7672b42f84a35f02d20ad88a203`; this local change is unshipped.

Different implementation and reviewer agent identities are recorded above.
The final independent combined verdict is APPROVED, with no remaining Critical
or Important findings, at the exact source commit. It independently reproduced
37 store tests and10 store countercheck groups,61 eligibility tests and18
additional combined groups. Two original-source historical canaries passed
without skips: BDF stays SOURCE_RELATION_CANDIDATE_GAP and genuine installation
receipts still lack G3a closure. Neither canary is newly accepted field evidence.

External reports are preserved under the task UGREEN review directory:
`g5a-store-independent-review.md` (initial findings),
`g5a-store-fixed-independent-review.md` (key follow-up),
`g5a-store-fixed-v2-independent-review.md` (store approval), and
`g5a-combined-independent-review.md` (final source/design approval).
Final combined report SHA-256: `e0b57df9f5013ccb84c8c97d763c04603c5f72dfacd699015d0f6a04851e0fb8`.
The latter includes reproducible command/log identities and actual retained
shared-store replay artifacts. All earlier failed runs and snapshots remain.

| Coordinator gate | Verified result | External log |
| --- | --- | --- |
| Lint | Exit0 | `g5a-root-final-lint.log` |
| G4b build identity | Exit0; actual resolved Cheerio/parse5 closure/source/lock checks pass | `g5a-root-final-identity.log` |
| Publication boundary | Exit0;19 workflows,0 violations | `g5a-root-final-publication.log` |
| Portability | Exit0;0 violations,263 existing warnings after final documentation | `g5a-root-acceptance-portability.log` |
| Documentation | Exit0; no drift after final acceptance record | `g5a-root-acceptance-docs.log` |
| Sitemap | Exit0;1,983 routes | `g5a-root-final-sitemap.log` |
| Review-content | Exit0; checked0/failed0, no new active review claims | `g5a-root-final-review-content.log` |
| Whitespace | Exit0 for frozen source and final documentation | Coordinator diff check |

The executor full-suite log was inspected:3,465/3,465 pass,zero skips/failures.
There is no baseline failure waiver. Full build/generated-output/schema
regeneration and browser rendering were NOT_RUN for this private, unconsumed
module slice; no generated/public data, policy/dependency file or consumer
changed. The remote Node20 exact-final-commit PR workflow remains NOT_RUN and
must include canonical build, publication audit, sitemap/review gates and
generated-output drift checks before release. Local Node22/Darwin tests do
not certify Linux/Node20 native locking. No push, PR, merge or deployment occurred.

This local acceptance is bounded by trusted external current-authority
snapshots, dependency-use witnesses only, fail-closed research/derived proof,
and the tested filesystem syscall boundary rather than hardware power-loss
proof. No actual right, official product Claim admission, accepted field,
Verified Fit or publication was created. G5b complete-inventory adjudication,
G6 common-standard legacy repair, real official source coverage and later Fit
consumer/release gates remain separate work. The external OCR assessment is
future G6 context, not a human benchmark or a reason to relax exact-model proof.

Original dirty main175/oldG4b13 changes and their HEADs remain untouched.
All task worktrees/cache/tmp/review outputs stay on UGREEN; Git common metadata
remains with the original checkout. Source patch: `g5a-final-source.patch`.
