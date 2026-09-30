# G5a: bounded pure decision and review-graph increment

Status: **REVIEW_REQUIRED for this increment only**. This is executor self-test
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
