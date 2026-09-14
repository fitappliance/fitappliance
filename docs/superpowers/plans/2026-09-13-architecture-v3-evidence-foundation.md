# FitAppliance Architecture V3 Evidence Foundation — Revision 3 Plan

> Status: EXECUTION STARTED — G0a and G0b complete; G1a passed local implementation review and awaits Node20 CI. No V3 receipt has been issued or production behavior enabled.
>
> Design authority: Revision 3 of [the V3 design](../specs/2026-09-13-architecture-v3-evidence-foundation-design.md).
>
> Product authority: [Product Core Brief](../../product-core-brief.md).
>
> Worker protocol: [Terra Max execution protocol](../../architecture-v3/terra-max-execution.md).
>
> Progress authority: this plan is the only durable task-progress index.

## 1. Outcome and plan-only boundary

V3 permits documented installation evidence to travel only through this chain:

```text
immutable source bytes
-> typed fragments / role-labelled anchors / witnessed relations
-> exact-product Claim V3
-> verified source-field binding + Claim receipt
-> review admission + complete candidate inventory + CurrentEligibility
-> resolved-context adjudication
-> EvidenceSnapshot + profile readiness
-> validated Fit V4 + existing release controls
```

Dimensions-only filtering remains useful under existing policy. It cannot become `VERIFIED_FIT` merely because an extractor found a number or because a URL/PDF looks official. Known, integrity-valid hard incompatibility may still yield `NO_FIT`; unknown evidence, context, uncertainty, rights, or source completion must stay unknown/insufficient.

This document fully replaces the former 15-task plan. It does not retain old shortcuts as active instructions.

This documentation revision adds common-standard legacy receipt repair to the existing plan, design and Terra Max execution protocol. It does not:

- write business code, public assets, data objects, reviews, receipts, ledgers, or release descriptors;
- re-run OCR/acquisition or create a source/Claim/receipt;
- merge a production branch, publish/promote data, deploy, or change a production Fit outcome;
- change the Product Core Brief in this documentation-only revision;
- reset, stash, delete, import, or merge dirty recovery work.

One Task ID means one independently reviewable PR. A task must not depend on a module or acceptance result from an unstated future task.

## 2. Authority, baseline, and non-negotiable contracts

### 2.1 Authority order

1. User-approved business, safety, rights, storage, and publication limits.
2. Applicable workspace/AGENTS instructions, including those supplied in the task.
3. Product Core Brief: product/lifecycle/Fit/public-claim promises.
4. V3 Revision 3 design: data and runtime contract.
5. This plan: task scope, dependencies, tests, acceptance, and progress.
6. Execution protocol: delegation, hand-off, review, and recovery process.

An executor does not silently choose between conflicting contracts. A physical meaning, evidence threshold, rights, or publication conflict pauses only its affected task and is recorded for main-agent judgment.

### 2.2 Frozen baseline

The original design-audit base was `99e53992112a664faaf09178f7fe299218bf7ef3`.
Revision 3 starts from reviewed execution commit `75603b0ad74eda4295a23f6666434f463e419b83`.
It preserves G0a/G0b acceptance and existing artifacts; it does not redefine their baseline.

At plan time:

| Artifact boundary | Known label | Required G0a treatment |
| --- | --- | --- |
| Default publication audit | 3,515 legacy records | Re-read its input/owner/hash; do not call it active release. |
| Active release/runtime | 3,513 records | Bind descriptor, manifest, runtime projection, code, and input hashes. |
| Current-retail lane | 349 records | Preserve its active-release denominator; do not infer it from legacy audit. |
| Dirty recovery checkout | Migration input only | Inventory path/hash/disposition; never import it as baseline authority. |

These counts are not implementation acceptance targets. G0a must verify current descriptor/manifest/code/input identities and keep legacy/default-audit, active-release, runtime, current-retail, historical, and reference lanes distinct.

Existing GitHub push capability does not grant automatic push/merge/promotion. V3 reuses the existing release candidate, active pointer, rollback, and publisher; it does not invent another publisher.

### 2.3 Mandatory semantics

Before conversion or multiplication, require `typeof raw === 'number'` and finite value. Validate the source unit/dimension and declared source precision, convert, then enforce canonical V2-tested field bounds/precision and ordered endpoints. Validate applicability and inclusion states on every branch. Reject `null`, booleans, strings, arrays, unknown objects, `NaN`, infinities, and negative dimensions/clearances where the field is non-negative. Explicit permitted zero remains valid; do not apply integer-mm validation to an unconverted decimal metre value.

Component inclusions are only `included`, `excluded`, or `unknown`. Missing is `unknown`. Legacy `includesHandle: null` and `includesDoor: null` never become `excluded`.

Every range has one explicit `rangeMeaning`:

- `adjustment`: selecting a smaller setting requires proof that it is achievable; the upper bound can support a positive result if the entire documented interval fits;
- `uncertainty`: a bounded measurement/requirement interval;
- `allowed_interval`: a membership interval.

Worktop present/removed and other discrete configurations are separate contextual Claims, not a continuous range.

### 2.4 EngineeringContext and resolved context

Every Claim carries a finite `EngineeringContext`:

```json
{
  "configurationKey": "underbench_worktop_removed",
  "conditions": [
    {"parameter": "installationMode", "operator": "eq", "value": "underbench"},
    {"parameter": "worktop", "operator": "eq", "value": "removed"}
  ],
  "referenceDatum": "finished_floor",
  "operatingState": {"kind": "closed", "angleDegrees": null}
}
```

Conditions are an allowlisted `allOf` of typed `eq` predicates only. The finite policy can express installation mode, worktop state, adjacent wall, opening state, and optional service configuration. It cannot execute general predicates.

`configurationKey: null` means unspecified, not universal. Reserved `unconditional` requires evidence across the evaluated configurations. Unknown values do not satisfy an `eq` condition. Unsupported conditions remain candidate gaps.

Reject contradictory `eq` predicates, a configuration key inconsistent with witnessed conditions, missing required angle, unsupported parameter/value/type, and datum/operating-state mismatch.

An unconditional Claim and an applicable conditional Claim with overlapping applicability must enter the same resolved evaluation context. Raw `configurationKey` values cannot hide their conflict. Only witnessed mutually disjoint configurations can be partitioned. One Fit evaluation cannot combine values from incompatible configurations.

### 2.5 Lineage, receipts, decisions, eligibility, snapshots

A Claim has one `sourceArtifactSha256`, independently resolvable `anchors[]`, and witnessed `relations[]`.

An anchor is `{ anchorId, role, fragmentSha256 }`; role is one of `subject`, `value`, `axis`, `unit`, `legend`, `condition`, `configuration`, or `reference_datum`.

A fragment uses exactly one typed locator: `pdf_bbox`, `json_pointer`, `html_selector`, `csv_cell`, or `text_span`. A PDF box binds one-based page, normalized top-left box, rendered-page hash, pixel dimensions, rotation, and crop transform.

Relation kinds are only `same_table_row`, `diagram_legend`, `explicit_continuation`, `exact_model_scope`, and `condition_applies`. Each has from/to anchor IDs and witness anchor IDs. Nearby numbers, matching letters, filenames, or a shared PDF do not prove a join.

A direct `VerifiedSourceBinding` proves exact case identity, product/market, field, typed semantic value/context, source anchors, authority/document role, and action-scoped rights. Same PDF hash/host is not sufficient. Initial production adapters are manufacturer verification and installation-field receipts only; government/provider/retailer remain V2 candidates/hints.

`ClaimReviewDecision` is exactly `admitted`, `rejected`, `quarantined`, or `superseded`. Admission only permits adjudication; `accepted` is adjudication output. A decision has sorted `supersedesDecisionIds[]`; normal replacement covers one head, explicit fork recovery covers every terminal head.

Current eligibility is separate from historical replay. It evaluates explicit `asOf`, active heads, source policy, extraction-profile status, dependency graph, and rights. Revocation propagates to derived Claims, adjudication, readiness, and future candidates without deleting history.

`EvidenceSnapshot` binds exact product/category/form factor/context, typed requirements, profile readiness, claim/receipt/source-binding IDs, conflicts/gaps, `adjudicationSha256`, `eligibilitySha256`, `semanticPolicySha256`, `requirementPolicySha256`, `asOf`, and `snapshotSha256`. A profile `receiptSetSha256` is a separate digest domain and never substitutes for snapshot integrity.

### 2.6 Fit V4 strict interval contract

Fit V4 has only this entrypoint:

```text
evaluateFitV4({ evidenceSnapshot, siteProfile, evaluationProfile })
```

The loader validates snapshot schema/canonical payload hash, expected active-release product/snapshot binding, context, and policy compatibility before pure physical calculation. It may not accept arbitrary caller requirements or compare only two receipt-looking hashes.

For required interval `R` and available interval `A` in the same datum/configuration:

```text
R.max <= A.min  => PASS
R.min > A.max   => FAIL
otherwise       => UNKNOWN
```

`A` is the bottleneck minimum derived from all relevant site measurement intervals and declared uncertainty. Missing uncertainty is unknown, not zero. An unselected adjustable `820–850` height with a `830` cavity remains placement `UNKNOWN`. `required=608`, `available=607–611` is `UNKNOWN`, not PASS or conservative-only FAIL.

V4 starts as separate `public/scripts/fit-v4.js`; old FitEngine exports and an independent legacy oracle remain until reviewed cutover. Calculation and drawer flags are independent.

## 3. Status protocol and task index

```text
NOT_STARTED -> READY -> RUNNING -> REVIEW_REQUIRED -> COMPLETE
                         |                |
                         +---- BLOCKED ---+
```

- `NOT_STARTED`: no prepared task package. All rows begin here.
- `READY`: predecessors, inputs, working-tree state, and write whitelist are verified.
- `RUNNING`: exactly one Terra Max executor is active.
- `REVIEW_REQUIRED`: executor submitted scoped change/check/witness report.
- `COMPLETE`: main agent recorded reviewed acceptance HEAD, report path, note, and next task.
- `BLOCKED`: state the fact, impact, preserved work, and exact recoverable input.

The main agent updates this table after each review. `.superpowers/sdd/` notes/reports are local auxiliary material only and cannot be the sole resume memory.

| Task ID | Deliverable | Required predecessors | Status | Acceptance HEAD | Report path | Blocker/note | Next task |
| --- | --- | --- | --- | --- | --- | --- | --- |
| G0a | Baseline + dirty migration inventory | — | COMPLETE | `ae7ac7d7d` | [G0a report](../../architecture-v3/execution/G0a-baseline-migration-inventory.md) | 13 tests passed; main rechecked 3 formerly failing witnesses and documentation audit. 176 recovery rows preserved; 2 stale migration inputs remain explicitly unaccepted. | G0b |
| G0b | CI/default test wiring | G0a | COMPLETE | `a6f9e0eca` | [G0b report](../../architecture-v3/execution/G0b-ci.md) | Local 2,982 tests passed; all six PR203 checks passed at `1a66dfee7`, including Node20 test/build/publication validation in run `34768449369`. Existing workflow and protected data are unchanged. | G1a |
| G1a | Semantics + EngineeringContext compiler + strict V3 codec | G0b | REVIEW_REQUIRED | — | [G1a report](../../architecture-v3/execution/G1a-semantics.md) | Local 3,007 tests passed; main reviewed source/context/hash boundaries and matched all 11 report input/artifact hashes. Node20 CI is still required. No legacy reissue or public writes. | G1b / G2a / G3a after CI acceptance |
| G1b | Lossless legacy adapters | G1a | NOT_STARTED | — | — | — | — |
| G2a | AU BrandRegistry | G1a | NOT_STARTED | — | — | Uses G1a's shared versioned V3 codec, not a separate hash implementation. | — |
| G2b | Family research graph/index | G2a, G1a | NOT_STARTED | — | — | — | — |
| G3a | Typed lineage/anchors/relations | G1a | NOT_STARTED | — | — | — | — |
| G3b | Region router + canary attestation | G3a, G2a | NOT_STARTED | — | — | — | — |
| G4a | Exact-product Claim V3 | G1b, G3a | NOT_STARTED | — | — | — | — |
| G4b | Direct source binding + receipt | G4a, G3b | NOT_STARTED | — | — | — | — |
| G5a | Append review store + CurrentEligibility | G4b | NOT_STARTED | — | — | — | — |
| G5b | Complete-inventory adjudication | G5a, G1a | NOT_STARTED | — | — | — | — |
| G6a | EvidenceSnapshot + readiness | G5b | NOT_STARTED | — | — | — | — |
| G6b | Exact-SKU vertical canary | G6a, G3b | NOT_STARTED | — | — | — | — |
| G6c | Legacy receipt repair and reissue batches | G6b | NOT_STARTED | — | — | Full origin inventory, field-scoped supplementation, same V3 checks; distinct from source-schema introduction and public cutover. | G9a after other predecessors |
| G7 | Finite one-hop family derivation | G2b, G6b | NOT_STARTED | — | — | — | — |
| G8a | Pure Fit V4 + snapshot loader | G6b | NOT_STARTED | — | — | — | — |
| G8b | Frozen legacy oracle shadow | G8a | NOT_STARTED | — | — | — | — |
| G9a | Whole-chain shadow | G7, G8b, G6c | NOT_STARTED | — | — | Includes complete legacy repair accounting, not only successful replacements. | — |
| G9b | Publication overlay | G9a | NOT_STARTED | — | — | — | — |
| G10a | Release candidate + bundle contract | G9b | NOT_STARTED | — | — | — | — |
| G10b | Mixed-client/rollback drill | G10a | NOT_STARTED | — | — | — | — |
| G11a | SearchCore calculation flag | G10b | NOT_STARTED | — | — | — | — |
| G11b | Evidence drawer | G11a | NOT_STARTED | — | — | — | — |

Each task package names its actual base/inputs/hashes, exact write whitelist, read-first files, test/witness expectation, stop condition, and report path. It specifies one `gpt-5.6-terra` executor with `reasoning_effort=max`, no subdelegation, no automatic next task, and no automatic release action.

Any statement below that a task becomes eligible is conditional on every predecessor in this table being reviewed COMPLETE. One predecessor passing never makes the other dependencies optional.

G0a is delivered in [Draft PR202](https://github.com/fitappliance/fitappliance/pull/202),
stacked on docs-only PR201. G0b is delivered in [Draft PR203](https://github.com/fitappliance/fitappliance/pull/203),
stacked on G0a. Neither PR was merged or promoted to production. Main reviewed
G0b's actual default-command failure witness, per-file checks and safe argument
handling, verified the report's final file hashes and retained the original
176-row recovery status/diff identities. The existing CI workflow is deliberately
unchanged: its single `npm test` call already reaches the new check. No duplicate
workflow hook or new dependency was needed. The executor report remains its
immutable REVIEW_REQUIRED handoff; this table records main acceptance separately.

### Execution direction — 2026-09-14, legacy receipts must be repaired

The private `canonicalJson` in `src/domain/historical-evidence-recovery-contract.mjs`
assigns sorted keys onto `{}` and uses `Array.map`. Read-only reproduction found:

- `{a:1}` and `JSON.parse('{"__proto__":{"x":2},"a":1}')` receive the same digest because an own `__proto__` entry is lost during normalization.
- `[null]` and a sparse `Array(1)` receive the same digest because a hole is normalized to `null`.

This is input-information loss before hashing, not a SHA-256 collision. A bounded
scan of checked-in V2 JSON found no own `__proto__` key text; external historical
objects have not been exhaustively audited. No old code, hash, receipt or data
was changed. The G1a instruction to extract this function as a strict shared
codec unchanged must therefore not be executed literally without resolution.

The user clarified: old receipts need missing information supplied and errors
repaired so that they meet the same standard as new receipts. Merely retaining
old replay as the permanent outcome does not satisfy that requirement.

The implementation is an evidence-backed reissue, not an in-place rewrite:
archive the original bytes/identity for traceability, resolve their case/source/
derived references, supplement or correct only with verified evidence, and
create new V3 Claims/receipts through the common factories and review path.
Unresolved fields remain evidence requests, never guessed values. The old
encoder remains historical compatibility code; all new and upgraded V3 JSON
identities use G1a's explicit `fit-evidence-json-v3-1` codec version. A raw-byte
source SHA-256 is not redefined by this codec change.

G1a owns the safe identity foundation; G1b exposes reusable candidates and gaps;
G4b owns identical source/field verification for new and repaired facts; G6b
proves a repaired/new-source canary pair; the separate G6c task owns exhaustive
receipt inventory, supplementation requests, durable reissue batches and old-to-
new lineage. G9a accounts for every origin and G9b/G10 alone govern later
consumer replacement. No second verification engine, review store or publisher
is added. A repaired dimension receipt is not complete installation evidence.

G0a/G0b stay complete. G1a's prior owner-choice blocker is resolved, but its
new task packet must bind Revision 3 and current inputs before implementation.
G2a now explicitly depends on that codec. G6c is a new 24th gate, not a claim
that historical repair has run. The goal of upgrading all old receipts remains
unfinished while evidence gaps or unreviewed exclusions remain.

The metadata audit found legacy manufacturer bindings already labelled
`schemaVersion: 3`; these are not the new Architecture V3 field-receipt contract.
The inventory must resolve named type, source/case owner and schema/policy/codec
together. Some old installation receipts already hold page/bbox/MinerU metadata;
replay summaries and candidate projections are not substitute receipt objects.
The bounded audit did not open original PDFs/derived objects or prove whole-store
coverage, so neither missing summary keys nor an old PASS can decide repair.

## 4. Mapping from the replaced 15-task plan

| Former task | New ownership |
| --- | --- |
| 1. Geometry/install semantics | G1a, G1b, G8a |
| 2. BrandRegistry | G2a |
| 3. ProductFamilyGraph | G2b, G7 |
| 4. DocumentFamilyRegistry | G3b |
| 5. PDF/MinerU/OCR lineage | G3a |
| 6. Extraction routing | G3b |
| 7. Claim V3 envelope | G4a |
| 8. Receipts/decision events | G4b, G5a |
| 9. Finite derivation | G7 |
| 10. Reconciliation | G5b |
| 11. Readiness/Fit V4 | G6a, G6b, G8a |
| 12. Complete-chain shadow | G8b, G9a |
| 13. Brand/document canaries | G3b, G6b |
| 14. Release control plane | G9b, G10a, G10b |
| 15. Drawer/Fit copy | G11a, G11b |

G0a and G0b are new baseline/CI gates. This mapping is traceability only; no former completion state, interface, or unsafe example carries forward.

## 5. Test, witness, and documentation-audit policy

Every gate follows this order:

1. Contract-negative test with a consumer-visible expected outcome.
2. Minimal pure implementation.
3. Existing-interface adapter compatibility test.
4. Portable witness; plus real-source witness where the gate owns real evidence.
5. Main-agent review and status update.

A module import error, absent fixture, syntax failure, skipped test, or a fixture regenerated by the implementation is not sufficient red-stage evidence.

The short JavaScript blocks below are assertion cores, not complete test files. The owning task must create imports and complete schema-valid fixtures in its declared test/fixture scope. First prove the positive fixture, then change only the targeted fact. All required receipts, policies, lookup maps and contexts must be supplied: a missing proof input does not demonstrate conflict handling. No helper may come from a future task.

Domain functions consume explicit hash-bound inputs or an injected resolver/store; they never discover optional files, trust `verified: true`, or access an undeclared global object store. Each new CLI needs argument/missing-input/exit-code tests in its owning task's suite. Operational report time is separate from truth-affecting `asOf`.

G0b makes V3 tests part of default `npm test`, keeps Node 20 `npm ci`, and checks every new `.mjs` individually. `node --check a.mjs b.mjs` is never accepted as multi-file validation because Node only checks the first target.

Portable canary expected facts/anchors/forbidden Claims must be independently checked against original evidence. CI verifies manifest/portable replay only; it does not claim it re-read unmounted original PDFs. Missing disk/object source is `NOT_RUN` or `BLOCKED`, preserves old attestation, and never writes an empty success.

A single `<!-- doc-audit: ignore -->` line immediately before a planned nonexistent script/test/source path or future script command skips only the next line. It always names the Task ID that will create the path; it never disables whole-file auditing.

## 6. Task packages

## G0a — baseline and dirty migration inventory

**Status:** COMPLETE · **Depends on:** none · **Worker:** `gpt-5.6-terra` / max

**Goal.** Bind active release, runtime, default legacy audit, manifest, code, policy inputs, and dirty migration input as separate hash-bound records without changing data or runtime.

**Files.**
<!-- doc-audit: ignore -->
- G0a creates `scripts/architecture-v3/audit-baseline.mjs`, `tests/architecture-v3/baseline-contract.test.mjs`, and `docs/architecture-v3/execution/G0a-baseline-migration-inventory.md`.
- It reads existing active-release/audit/manifest modules only; no build, sync, OCR, migration, or release output is allowed.

**Interface.**

```text
auditV3Baseline({ activeDescriptor, manifest, runtime, legacyAudit, code, policies,
  dirtyRecovery }) -> {
  baselineCommit, activeReleaseDescriptorSha256, activeManifestSha256,
  runtimeProjectionSha256, legacyAuditInputSha256, codeSha256, inputHashes,
  denominatorsByArtifact, dirtyMigrationInventory, auditedAt
}
```

**Must prove.**

- Mixed active descriptor hash plus legacy denominator rejects.
- Default audit cannot claim active-release ownership.
- Each dirty input has path/hash/disposition/unresolved reason; missing identity is an inventory gap.
- 3,515/3,513/349 are observed labels, not hard-coded pass criteria.
- Existing public/evidence/recovery objects remain unchanged.

**Run.**
<!-- doc-audit: ignore -->
```bash
node scripts/architecture-v3/audit-baseline.mjs --check-only
```

```bash
node --test tests/architecture-v3/baseline-contract.test.mjs
```

**Accept.** Report distinguishes all artifact owners/denominators, preserves dirty work, and makes only G0b eligible.

**Main review (2026-09-13).** Code acceptance is `ae7ac7d7d`; the report binds the reviewed implementation/test bytes, input hashes, and pre-commit execution identity. Source semantics now reuse the existing V2 validators. Live identity-migration input is correctly matched; candidate shadow and official-market migration inputs genuinely differ and are preserved as migration-only gaps. Former false-stale, whitespace-path and literal-pathspec failures now pass independent targeted checks. The public projection, active descriptor, policies and original recovery state were not changed. This gate does not attest PDF/source completeness or authorize release. The implementation branch is stacked on docs-only PR 201, not merged into production.

## G0b — CI and default-test wiring

**Status:** COMPLETE · **Depends on:** G0a · **Worker:** `gpt-5.6-terra` / max

**Goal.** Ensure future V3 tests and per-file syntax checks are mandatory in default local/Node-20 CI execution without adding business behavior.

**Files.**

- Modify `package.json` and `.github/workflows/pr-validation.yml` only for default test/CI wiring.
<!-- doc-audit: ignore -->
- G0b creates `scripts/architecture-v3/check-v3-syntax.mjs`, `tests/architecture-v3/ci-contract.test.mjs`, and `docs/architecture-v3/execution/G0b-ci.md`.

**Interface.**

```text
checkV3Syntax({ explicitMjsPaths }) -> pass | path_missing | syntax_error | empty_list_error
```

The runner invokes `node --check` separately for every listed file. Default `npm test` reaches V3 tests as they appear.

**Must prove.**

- A V3 test outside default discovery fails the contract.
- Invalid syntax in a second file fails, proving the first-file-only trap is avoided.
- Missing syntax/test inputs fail. Real canary-manifest enforcement is introduced with its producer in G3b, not required from a future module here.
- Existing V2 tests and Node 20 `npm ci` remain valid.

**Run.**
<!-- doc-audit: ignore -->
```bash
node scripts/architecture-v3/check-v3-syntax.mjs
```

```bash
npm ci
npm test
```

**Accept.** Default test coverage and individual syntax checks are demonstrable; G1a and G2a become eligible.

## G1a — semantics compiler and EngineeringContext validation

**Status:** REVIEW_REQUIRED · **Depends on:** G0b · **Worker:** `gpt-5.6-terra` / max

**Goal.** Compile V2 field/rights/applicability policy plus narrow versioned overlay into closed V3 semantics; validate numeric values, inclusions, ranges, and finite contexts.

**Files.**

- Read `data/architecture-v2/policies/product-data-field-rights-dictionary.json`, `data/architecture-v2/generated/installation-evidence-applicability-matrix.json`, `src/domain/dimension-evidence-claim.mjs`, and `src/domain/installation-knowledge-v3.mjs`.
<!-- doc-audit: ignore -->
- G1a creates `src/domain/architecture-v3/semantics.mjs`, `src/domain/architecture-v3/engineering-context.mjs`, `tests/architecture-v3/semantics.test.mjs`, and `docs/architecture-v3/execution/G1a-semantics.md`.
<!-- doc-audit: ignore -->
- G1a creates `data/architecture-v3/policies/semantics-overlay.json`, `src/shared/canonical-evidence-json.mjs`, and `tests/architecture-v3/canonical-evidence-json.test.mjs`.
- Keep `src/domain/historical-evidence-recovery-contract.mjs` and its existing `canonicalJsonSha256` behavior unchanged for historical/V2 replay. Implement the corrected strict V3 codec in the shared browser-safe module; do not extract the information-loss defect unchanged. No new SHA algorithm or per-module serializer.

**Interfaces.**

```text
compileV3Semantics({ fieldDictionary, installationMatrix, overlay })
  -> { semanticPolicy, semanticPolicySha256 }

canonicalEvidenceJson(value) -> canonical UTF-8 JSON text | invalid JSON error
CANONICAL_EVIDENCE_JSON_VERSION = 'fit-evidence-json-v3-1'

normalizeV3FieldValue({ rawValue, unit, fieldPath, inclusions, applicability, semantics })
  -> normalized value | typed validation error

validateEngineeringContext({ context, semantics, witnessedConditions })
  -> normalized context | typed validation error

resolveEvaluationContext({ product, requestedContext, candidateContext, semantics, witnessedConditions })
  -> applicable | inapplicable | unknown | invalid
```

`product` supplies exact `canonicalProductId` and `market`. Each structured
configuration assertion in `witnessedConditions` supplies those same two subject
keys plus `configurationKey`, the complete `conditions`, `applicability`
(`conditional` or `unconditional`) and `membership: exact_product_market`.
This explicit input closes the original resolver's missing applicability-input
contract; it is not source verification, which remains G4b's responsibility.
The validator returns the normalized context itself, not a wrapper.

Conditional keys define required base predicates and may carry additional
allowlisted predicates. Reserved `unconditional` permits no predicates and still
requires its own exact-product/market assertion. Before excluding a candidate as
inapplicable, require that assertion. Missing requested predicates or differing
reference datums remain unknown; known contrary configuration predicates may
prove disjoint applicability. `openingState` agrees with `operatingState.kind`.

**Must prove.**

```js
assert.throws(
  () => normalizeV3FieldValue({ ...validFieldInput, rawValue: null }),
  /finite JavaScript number/
);
assert.throws(
  () => validateEngineeringContext({
    context: {
      configurationKey: 'underbench_worktop_removed',
      conditions: [
        { parameter: 'worktop', operator: 'eq', value: 'removed' },
        { parameter: 'worktop', operator: 'eq', value: 'present' }
      ],
      referenceDatum: 'finished_floor',
      operatingState: { kind: 'closed', angleDegrees: null }
    },
    semantics,
    witnessedConditions: []
  }),
  /contradictory/
);
```

Also reject false/string/negative/non-finite input before conversion; preserve allowed zero; map legacy null inclusion to `unknown`; reject context key/witness mismatch; retain null key as unspecified; reject unsupported predicates; retain only three range meanings; prohibit discrete configuration-to-range conversion.

The V3 codec preserves an own `__proto__` key and rejects sparse arrays,
undefined/non-finite values, accessors, symbol keys and non-JSON objects without
lossy coercion. Reject non-enumerable object entries and extra non-index array
properties rather than silently dropping them (array length is intrinsic).
Keep recursive object-key ordering and meaningful array order.
Prove the two preflight witnesses, deterministic valid input, and unchanged
historical golden bytes/digests. Every new V3 canonical-JSON identity payload,
including semantic policies, contains `canonicalizationVersion` before hashing;
factories set it and validators reject absent/unknown versions. Raw artifact
byte hashes and hashes of immutable V2 input files retain their original domains.
No V3 verifier retries a failed digest with the old codec. Reissued old receipts
also use the new version and therefore the same contract as new receipts.

**Run.**

```bash
node --test tests/architecture-v3/semantics.test.mjs
node --test tests/architecture-v3/canonical-evidence-json.test.mjs
npm test
```

**Accept.** V2 bounds/applicability/inclusions and archive replay are preserved; the strict V3 codec passes its negative witnesses, no arbitrary condition engine exists, and G1b/G2a/G3a become eligible.

## G1b — lossless legacy consumer adapters

**Status:** NOT_STARTED · **Depends on:** G1a · **Worker:** `gpt-5.6-terra` / max

**Goal.** Adapt V2 geometry/install inputs into reusable V3 candidates and explicit supplementation gaps; retain old consumers/bytes, without treating the adapter as a completed receipt upgrade.

**Files.**

- Existing read/compatibility boundaries are `src/domain/dimension-evidence-claim.mjs` and `src/domain/installation-knowledge-v3.mjs`; modify only their adapter calls if needed, preserving public outputs and tests.
<!-- doc-audit: ignore -->
- G1b creates `src/domain/architecture-v3/legacy-semantics-adapter.mjs`, `tests/architecture-v3/legacy-semantics-adapter.test.mjs`, and `docs/architecture-v3/execution/G1b-legacy-adapters.md`.

**Interfaces.**

```text
adaptLegacyGeometryCandidate({ legacyObject, semantics })
  -> { candidate, losses[], unresolved[] }

adaptLegacyInstallationCandidate({ legacyObject, semantics })
  -> { candidate, losses[], unresolved[] }
```

**Must prove.**

- Legacy null inclusion stays unknown.
- Unknown scope/datum/configuration/range meaning remains unresolved.
- A legacy W/H/D receipt cannot authorize a new installation field.
- Old object bytes and old caller output do not change.
- An adapter candidate is not an admitted Claim.
- Resolve fields at their real source/case/index owner before flagging a summary-field absence as missing evidence. Preserve original labels/order and origin references in candidate metadata.
- Each missing semantic facet has a typed unresolved reason and required witness kind, never a guessed replacement. G1b uses G1a semantics only and must not call future G4b/G6c validators.

**Run.**

```bash
node --test tests/architecture-v3/legacy-semantics-adapter.test.mjs
npm test
```

**Accept.** Losses are explicit, V2 stays compatible, and G4a becomes eligible.

## G2a — AU BrandRegistry

**Status:** NOT_STARTED · **Depends on:** G1a · **Worker:** `gpt-5.6-terra` / max

**Goal.** Add market-scoped brand identity and aliases without duplicating existing host/source authority.

**Files.**
<!-- doc-audit: ignore -->
- G2a creates `src/domain/architecture-v3/brand-registry.mjs`, `tests/architecture-v3/brand-registry.test.mjs`, and `docs/architecture-v3/execution/G2a-brand-registry.md`.
<!-- doc-audit: ignore -->
- G2a creates versioned `data/architecture-v3/policies/brand-registry-input.json` and bounded `data/architecture-v3/generated/brand-registry.json`, seeded from existing canonical brands and `data/architecture-v2/policies/manufacturer-source-policy.json`; unproved aliases stay research-only.

**Interfaces.**

```text
buildBrandRegistry({ brands, officialHostPolicyRefs, market })
  -> { registry, registrySha256 }

resolveBrandAlias({ registry, market, alias })
  -> exact brand ID | ambiguous | unknown
```

**Must prove.**

- Same-market alias collision rejects.
- Cross-market alias cannot resolve in AU without AU entry.
- Parent group grants no child host/source/document/field authority.
- Brand-name match alone cannot create product/document binding.

**Run.**

```bash
node --test tests/architecture-v3/brand-registry.test.mjs
npm test
```

**Accept.** Registry is identity/index-only, policy references are not copied, and G2b becomes eligible.

## G2b — family research graph and relation index

**Status:** NOT_STARTED · **Depends on:** G2a, G1a · **Worker:** `gpt-5.6-terra` / max

**Goal.** Record finite product relationship research without any field inheritance.

**Files.**
<!-- doc-audit: ignore -->
- G2b creates `src/domain/architecture-v3/product-family-graph.mjs`, `src/domain/architecture-v3/product-relationship-assertion.mjs`, `tests/architecture-v3/product-family-graph.test.mjs`, and `docs/architecture-v3/execution/G2b-family-research.md`.
<!-- doc-audit: ignore -->
- G2b creates bounded `data/architecture-v3/research/product-family-input.json` and `data/architecture-v3/generated/product-family-graph.json`. Suffix/naming hypotheses are research annotations, not geometry rules.

**Interfaces.**

```text
buildProductFamilyGraph({ nodes, edges }) -> { graph, graphSha256 }

createProductRelationshipAssertion({
  relation, market, namedModels, sharedFields, contexts, evidence
}) -> assertion | typed validation error
```

Nodes distinguish `brand`, `marketing_series`, `official_model_group`, `platform`, and `canonical_product`. G2b validates graph, finite membership and G1a context shape; assertions and proof references are research candidates only. It does not call the future G3 anchor verifier. G7 owns original-source/anchor verification and the relationship receipt.

**Must prove.**

- Variant cycle and unbounded model set reject.
- Omitted target/field/context/market means not derivation-eligible.
- Graph lookup cannot return a field value.
- Platform/series language without exact shared field evidence remains research-only.

**Run.**

```bash
node --test tests/architecture-v3/product-family-graph.test.mjs
npm test
```

**Accept.** G2b grants no field/receipt/public authority; G7 waits for G6b too.

## G3a — typed artifact lineage, anchors, and relations

**Status:** NOT_STARTED · **Depends on:** G1a · **Worker:** `gpt-5.6-terra` / max

**Goal.** Model immutable artifacts/fragments and multi-anchor proof without undocumented cross-page/region composition.

**Files.**
<!-- doc-audit: ignore -->
- G3a creates `src/domain/architecture-v3/artifact-lineage.mjs`, `src/domain/architecture-v3/evidence-anchors.mjs`, `tests/architecture-v3/artifact-lineage.test.mjs`, and `docs/architecture-v3/execution/G3a-lineage.md`.

**Interfaces.**

```text
createArtifactRecord({ sha256, parentSha256, mediaType, toolRevision, optionsSha256 })
  -> immutable artifact record

createFragment({ fragmentSha256, parentArtifactSha256, locator })
  -> typed fragment | validation error

validateEvidenceAnchors({
  sourceArtifactSha256, anchors, relations, artifactRecords, fragments
})
  -> normalized proof | validation error
```

Artifact/fragment records are explicit hash-indexed inputs. Validate fragment payload hashes, ancestor/root links and referenced IDs against them, not the presence of hash-shaped strings. Original source-byte replay remains a separate G4b acceptance requirement.

**Must prove.**

- Two locator kinds, missing crop transform, invalid role/relation kind, or missing witness anchor rejects.
- PDF page/box/render hash/pixel/rotation/crop properties are required.
- Duplicate IDs and unresolved fragment hashes reject.
- Numeric cell + cross-page legend without witnessed relation cannot form proof.
- Existing source bytes may be referenced but are never rewritten.

**Run.**

```bash
node --test tests/architecture-v3/artifact-lineage.test.mjs
npm test
```

**Accept.** Every join is independently resolvable and witnessed; G3b/G4a become eligible.

## G3b — region router and portable/real canary attestation

**Status:** NOT_STARTED · **Depends on:** G3a, G2a · **Worker:** `gpt-5.6-terra` / max

**Goal.** Select one extraction profile per relevant region and prove early canary behavior without claiming portable replay re-read original sources.

**Files.**
<!-- doc-audit: ignore -->
- G3b creates `src/domain/architecture-v3/document-family-registry.mjs`, `src/domain/architecture-v3/region-router.mjs`, `scripts/architecture-v3/run-profile-canaries.mjs`, `tests/architecture-v3/region-router.test.mjs`, and `docs/architecture-v3/execution/G3b-router-canaries.md`.
<!-- doc-audit: ignore -->
- G3b creates `tests/fixtures/architecture-v3/profile-canaries/manifest.json` plus its bounded portable fixture set.
<!-- doc-audit: ignore -->
- G3b creates `data/architecture-v3/policies/document-family-profiles.json`; profile brand IDs resolve through G2a. Region observations come from existing native/MinerU outputs, not caller guesses about PDF type.

**Interfaces.**

```text
selectDocumentProfile({ registry, brandId, category, documentType, regionObservation })
  -> selected profile | typed candidate failure

inspectExtractionRegions({ nativeObservations, mineruDocument, pageImageMetadata })
  -> region observations | typed incomplete inspection

routeExtractionRegion({ regionObservation, selectedProfile })
  -> native | mineru | ocr_or_vision | unresolved

verifyProfileCanaryAttestation({ manifest, portableFixtures, codeIdentity })
  -> pass | fail | not_run | blocked
```

The canary runner supports separately tested `--portable` and `--original-objects` modes. The latter uses the configured evidence store; portable success alone does not complete a real-source gate. PDF acceptance keeps the original PDF / policy-pinned MinerU content_list_v2 pair. OCR/native/vision candidates never bypass it; new cross-region verification requires a versioned, canary-tested verifier delta in G4b.

**Must prove.**

- Native header glyphs plus unreadable scanned drawing route the drawing to image extraction.
- Multiple eligible profiles are ambiguous failure, never first success.
- Missing/mixed units, axis/legend gap, capacity beside dimensions, multi-model row, hybrid page, cross-page continuation, rotation/crop, worktop variants, and door angles stay typed candidates unless proof completes.
- Tested parser cannot generate expected facts/anchors/forbidden-Claims.
- Missing original mount returns `NOT_RUN`/`BLOCKED` and preserves prior attestation.

**Run.**
<!-- doc-audit: ignore -->
```bash
node scripts/architecture-v3/run-profile-canaries.mjs --portable
```

```bash
node --test tests/architecture-v3/region-router.test.mjs
npm test
```

**Accept.** Each active profile has at least one positive and two negative source-hash witnesses; attestation binds policy/code/tool/source/expected hashes; G4b/G6b can proceed when their other dependencies complete.

## G4a — immutable exact-product Claim V3

**Status:** NOT_STARTED · **Depends on:** G1b, G3a · **Worker:** `gpt-5.6-terra` / max

**Goal.** Create canonical schema-3 exact-product Claims with explicit semantics, context, source representation, and typed evidence.

**Files.**
<!-- doc-audit: ignore -->
- G4a creates `src/domain/architecture-v3/evidence-claim-v3.mjs`, `tests/architecture-v3/evidence-claim-v3.test.mjs`, and `docs/architecture-v3/execution/G4a-claim-v3.md`.

**Interface.**

```text
createEvidenceClaimV3({
  subject, field, value, semantics, context, sourceRepresentation, evidence,
  applicabilityProof, semanticPolicySha256, extractionProfileSha256,
  derivedFromClaimId, validationInputs
}) -> Claim V3 | typed validation error
```

`validationInputs` contains the compiled semantic policy and G3a artifact/fragment records needed to validate fields, context, policy digest and proof references. It is not persisted as a second Claim payload; only bound references remain in the Claim. Schema-valid construction is not source approval.

The closed envelope includes:

```text
schemaVersion: 3
canonicalizationVersion: 'fit-evidence-json-v3-1'
claimId: canonical payload hash excluding claimId
subject: canonicalProductId, market
field, value, semantics, context
sourceRepresentation: ordered_dimensions | named_scalar | named_range |
                      boolean_statement | not_applicable_statement
evidence: sourceArtifactSha256, anchors[], relations[]
applicabilityProof: EXACT_MODEL | FINITE_OFFICIAL_RELATION,
                    namedModels[], relationshipAssertionIds[]
semanticPolicySha256, extractionProfileSha256, derivedFromClaimId
```

**Must prove.**

- Mixed value union, unordered/missing-rangeMeaning range, invalid source representation, unresolved anchor/relation, duplicate IDs, and changed hash-relevant payload reject/change `claimId`.
- Unknown legacy material becomes no value Claim, only a candidate gap.
- Only ordered dimensions have `axisOrder`; named scalar/range labels are anchored, not fake axes.
- Set IDs sort for hash while ordered tuples retain order.
- Missing/unknown canonicalizationVersion rejects; migration metadata cannot set an alternate codec or bypass schema checks.

**Run.**

```bash
node --test tests/architecture-v3/evidence-claim-v3.test.mjs
npm test
```

**Accept.** Exact subject/context/source representation/evidence are inside Claim identity; G4b becomes eligible.

## G4b — direct source binding and Claim receipt

**Status:** NOT_STARTED · **Depends on:** G4a, G3b · **Worker:** `gpt-5.6-terra` / max

**Goal.** Bind direct Claims only to exact verified facts for the same case/product/field/value/semantics/context/anchors/rights.

**Files.**

- Replay through `src/domain/evidence-source-verifier.mjs` (`verifyVerificationReceipt`) and `src/domain/installation-evidence-pipeline.mjs` (`replayInstallationFieldReceipt`). Any necessary field/cross-region extension is a versioned change limited to these boundaries, preserving old replay tests.
<!-- doc-audit: ignore -->
- G4b creates `src/domain/architecture-v3/verified-source-binding.mjs`, `src/domain/architecture-v3/evidence-claim-receipt.mjs`, `tests/architecture-v3/direct-source-binding.test.mjs`, and `docs/architecture-v3/execution/G4b-direct-binding.md`.

**Interfaces.**

```text
verifyAndBindSource({
  adapterKind, caseInput, originalSourceReceipt, sourceRecord,
  artifactRecords, fragments, readObject, fieldAttestations, historicalPolicies
}) -> binding | typed validation error

createDirectClaimReceipt({
  claim, sourceBinding, factBindingId, anchors, toolchain, policy, rightsDecisions
}) -> receipt | typed validation error
```

`verifyAndBindSource` replays the actual original receipt, case, source bytes and derived artifacts through the allowlisted verifier. Authority, role and `verifiedFactBindings` are outputs, never caller assertions. A copied `verified: true` or caller-made fact array cannot issue a binding. New fields/configurations require explicit re-attestation against source anchors; old receipt scope is not widened. The binding itself carries digest-bound replay inputs for later verification.

The new receipt's hashed envelope includes `receiptType: 'EvidenceClaimReceipt'`,
`schemaVersion: 3` and `canonicalizationVersion: 'fit-evidence-json-v3-1'` for
direct and later derived receipts. Existing manufacturer verification receipts
with schemaVersion3 are a different type; never use that number as an
already-upgraded test. Validators check the named contract and actual bindings.

**Must prove.**

- Same PDF/host but wrong SKU, unproved multi-model row, new field, changed datum/inclusion/configuration/source representation, or missing case identity rejects.
- Legacy W/H/D receipt proves only its historic field scope.
- Manufacturer/install adapters are end-to-end; government/provider/retailer remain typed V2 candidates/hints.
- Historical proof and current `public_display` right are separately evaluated.
- A repaired candidate and a newly acquired candidate use the same factories and acceptance checks. Old PASS/schema rewrite/rehashed payload alone cannot produce a new receipt.
- Failed historical replay is retained as a scoped failure; independent newly verified source evidence may support a replacement. Never bind the replacement to the failed old receipt or pretend the old assertion was valid.
- A legacy manufacturer schemaVersion3 binding or a download/acquisition receipt is not accepted as a new `EvidenceClaimReceipt` merely because its version number matches.

**Run.**

```bash
node --test tests/architecture-v3/direct-source-binding.test.mjs
npm test
```

**Accept.** Direct receipt is fact/case/context/anchor equality, never a PDF-hash shortcut; G5a becomes eligible.

## G5a — append review store and CurrentEligibility

**Status:** NOT_STARTED · **Depends on:** G4b · **Worker:** `gpt-5.6-terra` / max

**Goal.** Persist review decisions safely and compute transitive current eligibility without corrupting history.

**Files.**
<!-- doc-audit: ignore -->
- G5a creates `src/domain/architecture-v3/claim-review-store.mjs`, `src/domain/architecture-v3/current-eligibility.mjs`, `tests/architecture-v3/claim-review-store.test.mjs`, `tests/architecture-v3/current-eligibility.test.mjs`, and `docs/architecture-v3/execution/G5a-review-store.md`.
<!-- doc-audit: ignore -->
- G5a defines bounded `data/architecture-v3/` local ledger/head/manifest layout under existing storage rules only.

**Interfaces.**

```text
createClaimReviewStore({ storeRoot, io, lock, clock }) -> store

prepareClaimReviewDecisions({ store, decisions, expectedHeadSha256 })
  -> { events, proposedReviewHeads, basisHeadSha256 } | STALE_HEAD | validation error

appendClaimReviewDecision({ store, decision, expectedHeadSha256 })
  -> { event, headSha256 } | STALE_HEAD | idempotency conflict

commitImmutableEvidenceBatch({
  store, namespace, objects, manifest, expectedHeadSha256, idempotencyKey
}) -> { manifest, headSha256 } | STALE_HEAD | idempotency conflict

replayClaimReviewHistory({ store, claimId, asOf, policy }) -> decision graph

computeCurrentEligibility({
  asOf, activeHeads, sourcePolicy, profileStatus, dependencyGraph, rightsDecisions
}) -> eligible and ineligible typed results
```

The store owns the sole write path and uses existing persistence helpers where their guarantees suffice. Flush immutable events and required directory entries before committing the head, then flush its commit before acknowledging success. Fault injection covers flush/rename/head boundaries. Do not promise power-loss durability on an unsupported storage backend; errors cannot acknowledge a completed batch. The eligibility dependency graph includes resolved immutable input records, not dangling IDs or trusted booleans.

`prepareClaimReviewDecisions` validates the decision graph against an immutable
committed basis without writing; it is shared by the normal append API and G6c.
`commitImmutableEvidenceBatch` is the shared bounded JSON-object/manifest commit
primitive for the fixed namespaces `reviews` and `legacy-upgrades`. These are
typed object groupings, not independently advancing transaction heads: one
coordinated writer and one cumulative committed head govern both. It verifies
bytes/hashes, references, CAS and idempotency; storage is not semantic approval.
G6c stages actual receipts, prepared review events and upgrade mappings together,
validates the proposed common V3 path and eligibility at the bound basis, then
commits all references once. It must not append reviews first and advance a
separate upgrade pointer later. A changed basis returns STALE_HEAD for revalidation.
Migration audit records are never cast into ClaimReviewDecision events. G5a's
portable transaction tests need no future G6c module; G6c owns typed end-to-end
integration. Reuse this primitive rather than creating a second writer/database.

**Must prove.**

- `admitted` is not accepted/publication output.
- Stale CAS returns `STALE_HEAD`; same idempotency key+payload returns original event/time; different payload fails.
- Cross-Claim/missing/duplicate/cyclic parents reject.
- Normal `supersedesDecisionIds[]` covers one head; explicit reviewed resolution covers all fork heads.
- Temp event then crash before head commit leaves recoverable unreferenced history; committed head retry is once-only; batch B merges A.
- Source/profile/relationship/rights revocation lowers current eligibility/readiness but preserves historical replay.
- Old-to-new receipt lineage is an audit relation, not a cross-Claim review parent; reject migration attempts that bypass same-Claim parent validation or erase prior conflicts.
- Live writer lock is not stolen merely by elapsed time.
- Shared batch commit rejects unknown namespaces, dangling/mismatched object hashes and a stale common head. Preparing reviews or persisting unreferenced objects never admits a Claim; review-only and combined batches merge into the same committed history without losing each other's records.

**Run.**

```bash
node --test tests/architecture-v3/claim-review-store.test.mjs
node --test tests/architecture-v3/current-eligibility.test.mjs
npm test
```

**Accept.** Single-writer/CAS/idempotency/crash behavior is verified, storage remains local/immutable, and G5b becomes eligible.

## G5b — complete-inventory exact adjudication

**Status:** NOT_STARTED · **Depends on:** G5a, G1a · **Worker:** `gpt-5.6-terra` / max

**Goal.** Admit all relevant source candidates into deterministic field arbitration only after inventory completion, receipt/eligibility checks, and resolved-context grouping.

**Files.**
<!-- doc-audit: ignore -->
- G5b creates `src/domain/architecture-v3/claim-adjudication.mjs`, `tests/architecture-v3/claim-adjudication.test.mjs`, and `docs/architecture-v3/execution/G5b-adjudication.md`.

**Interface.**

```text
adjudicateField({
  candidateInventory, claims, receipts, sourceBindings, reviewHeads,
  currentEligibility, semantics, requestedEvaluationContext
}) -> {
  acceptedClaimIds, quarantinedClaimIds, gaps, conflicts,
  resolvedEvaluationContext, adjudicationSha256
}
```

Validate schema/hash/source-scope completion, receipt/current eligibility, subject/field/context/scope/inclusions/datum, relevant unresolved candidates, then source-tier policy. Reuse the V2 candidate-inventory completion gate or prove its adapter; empty list/first success never completes research.

**Must prove.**

```js
const result = adjudicateField({
  ...validAdjudicationInputs,
  candidateInventory: completeInventory,
  claims: [unconditionalWidth598, conditionalWidth600],
  requestedEvaluationContext: underbenchWorktopRemoved
});
assert.deepEqual(result.acceptedClaimIds, []);
assert.match(result.conflicts[0].reason, /overlapping applicable contexts/);
```

Also prove incomplete inventory blocks; a possibly conflicting quarantined Claim cannot be filtered; wrong-model/rejected disposition needs specific scope reason; raw keys cannot hide overlap; only proven mutual exclusion partitions; unknown applicability stays gap; same-source duplicate extraction is not corroboration; accepted results refer to Claim IDs.

**Run.**

```bash
node --test tests/architecture-v3/claim-adjudication.test.mjs
npm test
```

**Accept.** `admitted` is only arbitration eligibility, resolved context governs conflict grouping, and G6a becomes eligible.

## G6a — EvidenceSnapshot and profile readiness

**Status:** NOT_STARTED · **Depends on:** G5b · **Worker:** `gpt-5.6-terra` / max

**Goal.** Build immutable snapshot/readiness only from current-eligible adjudicated Claims, without turning readiness into a Fit verdict.

**Files.**
<!-- doc-audit: ignore -->
- G6a creates `src/domain/architecture-v3/evidence-snapshot.mjs`, `src/domain/architecture-v3/profile-readiness.mjs`, `tests/architecture-v3/evidence-snapshot.test.mjs`, `tests/architecture-v3/profile-readiness.test.mjs`, and `docs/architecture-v3/execution/G6a-snapshot-readiness.md`.

**Interfaces.**

```text
createEvidenceSnapshot({
  product, context, adjudication, claims, receipts, sourceBindings,
  currentEligibility, semantics, requirementPolicy, asOf
}) -> EvidenceSnapshot | typed validation error

computeProfileReadiness({
  resolvedRequirements, conflicts, gaps, requirementPolicy, evaluationContext
})
  -> profile states and product summary state
```

The factory verifies actual input payloads/hashes, resolves accepted Claim IDs, derives requirements from their bound values, and computes readiness before sealing the snapshot. Caller-supplied requirement values/profiles and digest strings are not independent authority. There is no snapshot→readiness→same-snapshot cycle. Product input includes exact identity/market/category/form factor with their existing provenance. Add a forged requirement with unchanged receipts as a required failing witness.

Profiles are `UNKNOWN`, `PARTIAL`, `FIT_READY`, or `CONFLICT_QUARANTINED`; product summary is `DIMENSIONS_UNKNOWN`, `DIMENSIONS_READY`, `INSTALLATION_PARTIAL`, `FIT_READY`, or `CONFLICT_QUARANTINED`.

**Must prove.**

- Alter product/value/context/policy/eligibility/asOf means changed hash or rejection.
- `snapshotSha256` and per-profile `receiptSetSha256` cannot be compared as proof.
- Requirement must equal accepted Claim-backed value.
- Contradictory `eq`, context/key mismatch, or raw-key partition instead of G5b resolved context rejects.
- Missing context/unknown applicability becomes a gap, not `FIT_READY`.
- Eligibility revocation can reduce readiness without erasing historical evidence.

**Run.**

```bash
node --test tests/architecture-v3/evidence-snapshot.test.mjs
node --test tests/architecture-v3/profile-readiness.test.mjs
npm test
```

**Accept.** Snapshot binds all specified IDs/hashes/context; readiness contains no physical Fit outcome; G6b becomes eligible.

## G6b — exact-SKU vertical canary

**Status:** NOT_STARTED · **Depends on:** G6a, G3b · **Worker:** `gpt-5.6-terra` / max

**Goal.** Prove one bounded exact-SKU direct source chain from source evidence through snapshot/readiness before family derivation or broader shadow.

**Files.**
<!-- doc-audit: ignore -->
- G6b creates `scripts/architecture-v3/run-exact-sku-canary.mjs`, `tests/architecture-v3/exact-sku-vertical.test.mjs`, `tests/fixtures/architecture-v3/exact-sku/manifest.json`, and `docs/architecture-v3/execution/G6b-exact-sku-canary.md`.

**Canary binding.**

```text
source/derived artifact hashes, source binding ID, Claim/receipt IDs,
candidate inventory hash, review head, eligibility/adjudication/snapshot hashes,
policy/profile/code/tool hashes, expected-fixture hash, real-source status
```

**Must prove.**

- Sibling row, same-PDF wrong field/context, incomplete inventory, or parser failure cannot complete the chain.
- Receipt/adjudication/eligibility/snapshot mismatch fails attestation.
- No family inheritance occurs.
- Portable expected facts are independently checked against original source.
- Missing original source preserves portable replay but reports real canary `NOT_RUN`/`BLOCKED`.
- A legacy receipt plus evidence-backed supplementation reaches the same V3 verification path as a new-source canary. Missing context, changed old payload or a schema-only rewrite fails. Compare acceptance rules, not an artificial requirement that different observations have identical IDs/timestamps.

**Run.**
<!-- doc-audit: ignore -->
```bash
node scripts/architecture-v3/run-exact-sku-canary.mjs --portable
```

```bash
node --test tests/architecture-v3/exact-sku-vertical.test.mjs
npm test
```

**Accept.** Direct exact-product and legacy-reissue canaries have inspectable source-to-snapshot chains; G6c/G7/G8a become eligible. This is not whole-inventory repair completion.

## G6c — legacy receipt repair, supplementation and reissue batches

**Status:** NOT_STARTED · **Depends on:** G6b · **Worker:** `gpt-5.6-terra` / max

**Goal.** Account for every legacy receipt origin and unresolved reference, supply missing evidence, and issue common-standard V3 replacements in recoverable bounded batches without rewriting originals or publishing.

**Files.**

- Read the existing source/installation receipt owners, `src/domain/receipt-bound-evidence-batch-runner.mjs`, G1b adapters, and reviewed G3–G6 modules. Reuse existing acquisition outputs; this task does not introduce a crawler or OCR service.
<!-- doc-audit: ignore -->
- G6c creates `src/domain/architecture-v3/legacy-receipt-upgrade.mjs`, `scripts/architecture-v3/upgrade-legacy-receipts.mjs`, `tests/architecture-v3/legacy-receipt-upgrade.test.mjs`, and `docs/architecture-v3/execution/G6c-legacy-receipt-upgrade.md`.
<!-- doc-audit: ignore -->
- G6c creates versioned non-public `data/architecture-v3/legacy-upgrade/` scope/inventory/selection/manifest records and sanitized `tests/fixtures/architecture-v3/legacy-upgrade/` witnesses. Operational state uses G5a's existing store/commit path, not a new ledger writer.

**Interfaces.**

```text
buildLegacyReceiptUpgradeInventory({
  legacyCollections, referenceIndexes, scopeManifest, targetPolicies
}) -> { inventory, inventorySha256 }

runLegacyReceiptUpgradeBatch({
  inventory, batchSelection, evidenceInputs, readObject,
  store, expectedHeadSha256, targetPolicies, asOf
}) -> { manifest, results, pendingEvidenceRequests, headSha256 }
```

The source scope manifest explicitly names every known receipt collection,
reference index and unresolved discovery location, with owner/schema/hash and
the active-release versus recovery epoch. Inventory totals cannot be inferred
from product counts, source counts, cases or old PASS reports. Preserve embedded
receipts by original container hash/JSON pointer plus resolved case/source
bindings. Unavailable referenced objects remain entries. Resolve duplicate
references by complete payload and scope; an equal old digest alone cannot
collapse contradictory objects. Incomplete source enumeration cannot claim
whole-inventory coverage. A bounded selection does not shrink the denominator.
Keep receipt kinds distinct and name each target contract. Initial field reissue
uses G4b's manufacturer/installation allowlist. Acquisition/discovery/provider
receipts cannot be cast into geometry facts; an unsupported target adapter stays
`BLOCKED_CONTRACT` with its origin retained until a scoped adapter is defined.
Freeze each origin's declared field/context scope. A source receipt may become
several field receipts; partial field success is retained but cannot silently
shrink the expected scope or mark the entire origin `UPGRADED`. Any exclusion
must be scoped and reviewed; an unresolved gap remains unfinished.

Each gap request identifies origin, exact product/field, missing semantic/proof
facet, required witness kind and existing artifact references. The existing
acquisition/extraction workflow can fulfil those requests; the runner consumes
and validates those resulting artifacts. Reuse verified original/derived
objects. No implicit online acquisition, parser installation or new network
authority occurs inside a replay or check-only operation.

The runner imports the actual G4a/G4b factories and G5a/G5b/G6a gates. It cannot
accept caller-declared `verified`, a migration bypass flag, fabricated bbox,
category default or replacement value without evidence. A failed old replay is
not laundered into a new receipt; any correction requires independently verified
source evidence and a visible disposition for the old assertion. Follow the
ordinary conflict policy rather than discarding old competing facts to pass.

A `LegacyReceiptUpgradeRecord` binds original locators/schema/IDs, target schema
and codec, field-level corrections and their evidence refs, new Claim/receipt
IDs, validation/review/adjudication outputs, asOf/code/policy identities and a
stable job/idempotency identity. Store this audit edge separately from family
`derivedFromClaimId` and same-Claim review `supersedesDecisionIds`. Same target
standards do not imply equal IDs or fabricated equal timestamps for different
observations. Record latest receipt-upgrade disposition independently from
current eligibility, profile readiness and publication state.

The selected batch binds expected committed head, inventory, target contracts,
inputs and selected origin IDs. It calls G5a's `commitImmutableEvidenceBatch`
with namespace `legacy-upgrades`, including the new receipt objects, validated
prepared review events and upgrade mappings in one manifest. Use G5a's pure
review preparation API and the proposed view for validation; no independent
review-head commit precedes this batch. G5a owns durable object/head commit and retry:
do not advance the manifest until all referenced objects verify; recover or
retain unreferenced objects after interruption; reject stale writers; retain
all prior batches and all unprocessed origins. Same job/key/input returns the
same committed result. New evidence creates a new attempt with explicit lineage,
not an overwritten historical outcome. No successful subset replaces history.

**Must prove.**

- An old binding summary with proof in its referenced source record is resolved, not blindly quarantined for absent summary keys.
- Old PASS plus an unknown field scope/configuration/axis/join, missing original bytes, or schema-only/hash-only rewrite cannot issue a V3 receipt.
- Independently verified supplementation/correction can issue a replacement through exactly the same gates as new evidence, while preserving original bytes/IDs/times and failed old assertions.
- Different original payloads sharing a legacy digest remain distinguishable. Wrong SKU, a W/H/D receipt used for installation, or cross-Claim review supersession rejects.
- Fault injection before event commit, between object/head commit, after head commit, same-key retry, stale writer and batch B preserves the complete origin inventory and earlier results without duplicate issuance.
- `UPGRADED`, `NEEDS_EVIDENCE`, `CONFLICT_QUARANTINED`, `BLOCKED_CONTRACT` and `REJECTED_WITH_REASON` are accounted separately; only successfully reissued common-standard receipts count as upgraded. Unsupported contract types are not evidence failures. A rejected or not-yet-processed item is never called repaired.
- A multi-field legacy origin with only one repaired field retains the successful field but remains incomplete; neither field nor origin coverage can be inflated by dropping the remaining scope.
- Rights/lifecycle/current eligibility remain independent. Upgraded dimensions can remain `INSTALLATION_PARTIAL`/`INSUFFICIENT_DATA`; no Verified Fit or public/active-pointer write is allowed.
- Portable fixtures work without the external store; real-source attempts become `NOT_RUN`/`BLOCKED` without deleting previous records when needed artifacts are unavailable.

**Run.**
<!-- doc-audit: ignore -->
```bash
node scripts/architecture-v3/upgrade-legacy-receipts.mjs --portable
```

```bash
node --test tests/architecture-v3/legacy-receipt-upgrade.test.mjs
npm test
```

The CLI also provides strict `--check-only` for explicitly bound inventory/input
paths with no write and no network; unknown or incomplete arguments fail. Real
reissue requires an explicit validated selection and expected head, with output
only in the existing non-public store. Do not default to applying the entire
catalogue when selection is absent.

**Accept.** A reviewed bounded repair batch and paired new/reissued witnesses
pass the common V3 gates, retry/failure boundaries preserve history, and the full
origin inventory retains every missing/conflicting/unprocessed entry. Report
code-gate completion separately from all-old-receipts repair completion. Missing
evidence remains an active recovery queue, not a finished migration. G9a becomes
eligible only after its other predecessors are complete; this gate authorizes
neither consumer cutover nor production publication.

## G7 — finite one-hop family derivation

**Status:** NOT_STARTED · **Depends on:** G2b, G6b · **Worker:** `gpt-5.6-terra` / max

**Goal.** Materialize a target Claim only from one eligible direct source Claim and one eligible finite official relationship assertion that explicitly covers source/target/field/context/market.

**Files.**
<!-- doc-audit: ignore -->
- G7 creates `src/domain/architecture-v3/family-derivation.mjs`, `tests/architecture-v3/family-derivation.test.mjs`, and `docs/architecture-v3/execution/G7-family-derivation.md`.
<!-- doc-audit: ignore -->
- G7 also creates `src/domain/architecture-v3/relationship-receipt.mjs` and its tests in the same suite; no earlier task has issued relationship receipts.

**Interface.**

```text
verifyRelationshipAssertion({
  assertion, sourceVerificationInputs, artifactRecords, fragments,
  relationshipPolicy, readObject
}) -> relationship receipt | typed validation error

deriveFiniteFamilyClaim({
  directSourceClaim, directReceipt, relationshipAssertion, relationshipReceipts,
  targetProduct, field, context, currentEligibility, asOf
}) -> derived Claim + receipt | typed validation error
```

The relationship verifier reuses G4b official-source replay and G3a anchor validation, then proves the finite product set and explicit shared fields/contexts. It does not pretend an official relationship is a manufacturer dimension receipt. Both the direct source receipt and this separate relationship receipt must replay and remain currently eligible.

**Must prove.**

- Transitive A→B→C route, unbounded family, omitted target/field/context/market, or source verifier masquerading as target verifier rejects.
- Relationship index alone cannot materialize a field.
- Profile/source/relationship/right revocation invalidates current derived eligibility.
- Target-specific conflict returns to normal G5b adjudication.

**Run.**

```bash
node --test tests/architecture-v3/family-derivation.test.mjs
npm test
```

**Accept.** Derivation is exact, finite, one-hop, current-eligible, and never general inheritance; G9a waits for G8b too.

## G8a — pure Fit V4 and validated snapshot loader

**Status:** NOT_STARTED · **Depends on:** G6b · **Worker:** `gpt-5.6-terra` / max

**Goal.** Add isolated Node/browser V4 evaluation from validated snapshot only, strict interval uncertainty, and a Core Brief 8.1 clarification without changing old FitEngine behavior.

**Files.**

- Modify `docs/product-core-brief.md` section 8.1 only to clarify V4 strict interval/adjustment semantics and intentional legacy-oracle difference.
<!-- doc-audit: ignore -->
- G8a creates `src/shared/fit-v4.mjs`, `src/shared/fit-v4-snapshot-loader.mjs`, `tests/architecture-v3/fit-v4.test.mjs`, and `docs/architecture-v3/execution/G8a-fit-v4.md`.
- Modify `scripts/vendor-fit-engine.js` to copy the new modules and G1a shared canonical codec without changing the existing FitEngine copy.
<!-- doc-audit: ignore -->
- Generated assets are `public/scripts/fit-v4.js` (ES module), `public/scripts/fit-v4-snapshot-loader.mjs`, and `public/scripts/canonical-evidence-json.mjs`; never implement a second handwritten browser evaluator.
- Preserve `src/shared/fit-engine.js`, existing browser FitEngine export, V2/V3 output and historical hash behavior. New V4 snapshot verification uses only the G1a versioned V3 codec; no fallback to the legacy encoder or new SHA algorithm.

**Interfaces.**

```text
loadValidatedEvidenceSnapshot({
  evidenceSnapshot, activeReleaseBinding, expectedProduct, expectedContext,
  supportedPolicies, evaluationProfile, crypto
}) -> validated immutable EvidenceSnapshot | typed unavailable error

evaluateFitV4({ evidenceSnapshot, siteProfile, evaluationProfile })
  -> typed Fit V4 result

evaluatePlacementInterval({ required, available }) -> typed check
```

The async loader uses the shared canonical codec and platform Web Crypto (injected Node/Web adapter, not a new hash implementation). Its output is the snapshot itself, never detached requirements. The synchronous pure evaluator derives requirements from that validated immutable snapshot. Node imports the shared modules; the browser loads their generated copies as modules. Test generated-byte/dependency parity, no Node-only imports in browser assets, and the actual loader→evaluator path. Changed site input invalidates pending results before display.

G8a defines/tests the minimal explicit expected-product/snapshot/policy binding without importing future G10 code. These are loader-contract fixtures, not a completed production release adapter; G10 supplies the real descriptor-to-binding join and tests it end to end.

**Must prove.**

```js
assert.equal(
  evaluatePlacementInterval({
    required: { min: 608, max: 608, datum: 'finished_floor' },
    available: { min: 607, max: 611, datum: 'finished_floor' }
  }).status,
  'UNKNOWN'
);
```

Also prove `608` versus `609–611` is PASS, `608` versus `606–607` is FAIL, missing uncertainty is not zero, incompatible datum/config rejects comparison, unselected `820–850` at available `830` is UNKNOWN, altered payload/wrong product/stale release/schema/policy failure occurs before physics, and old oracle behavior is unchanged.

The Core Brief clarification says maximum is conservatively positive only when `R.max <= A.min`; overlap is UNKNOWN, not conservative FAIL; V2/legacy stays frozen as an intentional V4 difference.

**Run.**

```bash
node --test tests/architecture-v3/fit-v4.test.mjs
npm test
```

**Accept.** Loader precedes physics, V4 receives no arbitrary requirements, interval inequalities are exact, and G8b becomes eligible.

## G8b — frozen legacy oracle and V4 shadow

**Status:** NOT_STARTED · **Depends on:** G8a · **Worker:** `gpt-5.6-terra` / max

**Goal.** Freeze independent legacy oracle code/inputs/outputs before comparison; classify V4 deltas without changing old output to make tests green.

**Files.**
<!-- doc-audit: ignore -->
- G8b creates `src/domain/architecture-v3/legacy-fit-oracle.mjs`, `scripts/architecture-v3/run-fit-v4-shadow.mjs`, `tests/architecture-v3/legacy-fit-oracle.test.mjs`, `tests/fixtures/architecture-v3/fit-oracle/manifest.json`, and `docs/architecture-v3/execution/G8b-legacy-oracle.md`.

**Interfaces.**

```text
evaluateFrozenLegacyOracle({ legacyInput, oracleManifest }) -> legacy result

compareFitV4Shadow({ oracleResult, v4Result, witness })
  -> equal | reviewed_intentional_difference | unexpected_difference
```

**Must prove.**

- Oracle importing V4, V4 generating oracle expected values, or shared-adapter comparison claiming independence rejects.
- Legacy code/input/output/V4 code hashes are manifest-bound.
- 608/607–611 and unselected adjustment differences are explicit reviewed range-semantics witnesses if legacy differs.
- New mismatch/context/digest discrepancy fails shadow.

**Run.**
<!-- doc-audit: ignore -->
```bash
node scripts/architecture-v3/run-fit-v4-shadow.mjs --portable
```

```bash
node --test tests/architecture-v3/legacy-fit-oracle.test.mjs
npm test
```

**Accept.** Oracle independence and each intentional difference are demonstrated; G9a becomes eligible.

## G9a — whole-chain shadow

**Status:** NOT_STARTED · **Depends on:** G7, G8b, G6c · **Worker:** `gpt-5.6-terra` / max

**Goal.** Compose the complete V3 chain over bounded approved inputs in shadow, retaining every unknown/conflict/ineligible disposition without public output.

**Files.**
<!-- doc-audit: ignore -->
- G9a creates `scripts/architecture-v3/run-v3-shadow.mjs`, `src/domain/architecture-v3/shadow-audit.mjs`, `tests/architecture-v3/whole-chain-shadow.test.mjs`, and `docs/architecture-v3/execution/G9a-whole-chain-shadow.md`.
<!-- doc-audit: ignore -->
- G9a creates only bounded non-public `data/architecture-v3/shadow/` manifests/audits.

**Must prove.**

- Default legacy audit cannot substitute for active baseline.
- Incomplete candidate, disabled profile, revoked display right, same-scope conflict, or mismatched manifest input remains explicit and blocks its affected field.
- Shadow binds source/derived/Claim/receipt/review/eligibility/adjudication/snapshot/oracle/V4/lifecycle/rights/code/policy identities.
- Existing V2/legacy/public artifacts remain unchanged.
- Bind G6c's complete origin inventory and all latest dispositions, including not-yet-selected entries. Report upgraded receipt/field counts separately from accounted origins, evidence gaps, conflicts, exclusions and product readiness. A successful subset or old-replay PASS is not whole-inventory repair completion.

**Run.**
<!-- doc-audit: ignore -->
```bash
node scripts/architecture-v3/run-v3-shadow.mjs --portable
```

```bash
node --test tests/architecture-v3/whole-chain-shadow.test.mjs
npm test
```

**Accept.** Full shadow is hash-bound, has no public/release write, and makes G9b eligible.

## G9b — publication overlay

**Status:** NOT_STARTED · **Depends on:** G9a · **Worker:** `gpt-5.6-terra` / max

**Goal.** Project accepted snapshot fields through existing lifecycle lanes and action-scoped rights without changing membership, publisher, CTA, price, availability, or Fit promotion.

**Files.**
<!-- doc-audit: ignore -->
- G9b creates `src/domain/architecture-v3/publication-overlay.mjs`, `tests/architecture-v3/publication-overlay.test.mjs`, and `docs/architecture-v3/execution/G9b-publication-overlay.md`.
- The existing consumption boundary is `src/domain/accepted-evidence-publication.mjs`; any adapter there must preserve legacy receipt/lifecycle tests and remain inactive until explicit G10 candidate binding. No standalone publisher is added.

**Interface.**

```text
buildEvidencePublicationOverlay({
  evidenceSnapshots, lifecycleLists, rightsDecisions, releaseContext
}) -> overlay | typed validation error
```

**Must prove.**

- Historical/reference row cannot donate current CTA/price/availability/readiness/Fit.
- Missing `public_display` omits field/provenance and cannot leave a contradictory candidate.
- Lifecycle membership change, snapshot mismatch, persisted successful Fit, `verifiedFitEligible`, or promotion flag rejects.
- Existing lifecycle source remains authoritative.
- Upgraded and newly acquired fields require the same V3 receipts. Missing upgrade evidence cannot fall back to old replay as V3 authority. Old immutable history and the unchanged deployed V2 bundle remain separate from a new V3 overlay.

**Run.**

```bash
node --test tests/architecture-v3/publication-overlay.test.mjs
npm test
```

**Accept.** Overlay is non-publishing and lane/rights-safe; G10a becomes eligible.

## G10a — release candidate and bundle contract

**Status:** NOT_STARTED · **Depends on:** G9b · **Worker:** `gpt-5.6-terra` / max

**Goal.** Extend existing candidate/descriptor control with a complete compatible V3 bundle, not a new publisher or promotion route.

**Files.**

- Modify `src/domain/retail-lifecycle-release-candidate.mjs`, `src/domain/active-retail-release.mjs`, and `scripts/architecture-v2/build-retail-lifecycle-release-candidate.mjs` only for explicit versioned V3 bindings and legacy replay.
<!-- doc-audit: ignore -->
- G10a creates `src/domain/architecture-v3/release-bundle-contract.mjs`, `scripts/architecture-v3/build-release-candidate.mjs`, `tests/architecture-v3/release-bundle-contract.test.mjs`, and `docs/architecture-v3/execution/G10a-release-candidate.md`.

**Interfaces.**

```text
createV3BundleContract({
  overlaySha256, snapshotIndexSha256, evidenceIndexSha256, assetManifestSha256,
  engineSchemaVersion, snapshotSchemaVersion, activeReleaseCompatibility
}) -> bundle | typed validation error

extendReleaseCandidate({ existingCandidate, v3BundleContract })
  -> candidate | typed validation error
```

The asset manifest binds every kernel, loader, codec and consuming client asset by URL/hash/module format and compatibility version, not only the kernel hash. G10a creates the bounded snapshot index, evidence index and asset manifest from G9b/G8a inputs under `data/architecture-v3/release-candidates/`; the snapshot index binds each exact product's snapshot hash. Extend the existing candidate's validated inputs/outputs without automatic active-pointer changes. Copying a manifest hash cannot substitute for checking its referenced payloads and dependency closure.

**Must prove.**

- Missing snapshot/index/engine/schema binding, incompatible schemas, optional-file discovery, or unsafe revoked rollback rejects.
- Candidate creation is not promotion.
- Legacy replay stays available where existing policy permits.
- Existing active pointer/publisher remains sole release mechanism.

**Run.**
<!-- doc-audit: ignore -->
```bash
node scripts/architecture-v3/build-release-candidate.mjs --check-only
```

```bash
node --test tests/architecture-v3/release-bundle-contract.test.mjs
npm test
```

**Accept.** Complete bundle identity is enforced without promotion; G10b becomes eligible.

## G10b — mixed-client compatibility and rollback drill

**Status:** NOT_STARTED · **Depends on:** G10a · **Worker:** `gpt-5.6-terra` / max

**Goal.** Prove old/new client/data/cache/rollback behavior fails closed rather than displaying stale verified Fit.

**Files.**
<!-- doc-audit: ignore -->
- G10b creates `scripts/architecture-v3/verify-bundle-compatibility.mjs`, `tests/architecture-v3/bundle-compatibility.test.mjs`, `tests/fixtures/architecture-v3/bundle-compatibility/manifest.json`, and `docs/architecture-v3/execution/G10b-mixed-client-rollback.md`.

**Required matrix.**

Use the existing legacy consumer and an executable G8a loader/evaluator client harness. Do not import not-yet-implemented G11 SearchCore integration. G11 then repeats the affected matrix in the actual user flow; a harness pass alone is not UI acceptance.

| Condition | Required outcome |
| --- | --- |
| Old client + old data | Existing behavior remains readable. |
| Old client + V3 data | Unsupported V3 safely ignored; no positive V4 Fit. |
| New client + old data | Legacy-safe unknown route; no V3 assumption. |
| New client + V3 bundle | Uses bound compatible snapshot/index/engine/schema only. |
| Delayed/out-of-order or changed site input | Current binding wins; old result suppressed. |
| Stale cache/missing index | Unknown/unavailable; never stale badge. |
| Compatible rollback | Allowed only if currently safe. |
| Safety-revoked rollback | Rejected/disabled through existing controls. |

Cache by complete bundle/snapshot identity, not only a fixed URL. A failed fetch cannot remain an indefinitely successful empty cache; retry must not revive a stale Verified Fit. Rehearse the existing active-pointer selection in isolated temporary release state; never change the real active release during the drill.

**Run.**
<!-- doc-audit: ignore -->
```bash
node scripts/architecture-v3/verify-bundle-compatibility.mjs --portable
```

```bash
node --test tests/architecture-v3/bundle-compatibility.test.mjs
npm test
```

**Accept.** Matrix is fixture-tested, no candidate is promoted, and G11a becomes eligible.

## G11a — SearchCore calculation flag

**Status:** NOT_STARTED · **Depends on:** G10b · **Worker:** `gpt-5.6-terra` / max

**Goal.** Add independently controlled SearchCore V4 calculation while preserving size filtering and old engine exports; do not add drawer UI yet.

**Files.**

- Modify `public/scripts/search-core.js` at its calculation boundary and `scripts/vendor-fit-engine.js` only if asset loading needs existing build wiring; preserve `tests/dual-mode-search-core.test.mjs`. G10's bound client bundle owns V4 loader/flag inputs.
<!-- doc-audit: ignore -->
- G11a creates `tests/architecture-v3/search-core-v4-flag.test.mjs` and `docs/architecture-v3/execution/G11a-search-core.md`.

**Required behavior.**

```text
sizeMatch: dimensions-only filtering result
fitDecisionV4: validated V4 result or typed unavailable state
```

**Must prove.**

- A passing `sizeMatch` plus unavailable V4 evidence cannot present verified Fit. Preserve the existing dimensional-result shape and its unknown state; do not conflate it with the V4 verdict.
- Calculation flag off preserves old SearchCore and does not load V4 result.
- Drawer flag cannot change calculation behavior.
- Changed site/evaluation hash invalidates old decision.
- Replacement path strips Fit/readiness.

**Run.**

```bash
node --test tests/architecture-v3/search-core-v4-flag.test.mjs
npm test
```

**Accept.** Calculation and drawer flags are independent, old FitEngine remains, and G11b becomes eligible.

## G11b — evidence drawer

**Status:** NOT_STARTED · **Depends on:** G11a · **Worker:** `gpt-5.6-terra` / max

**Goal.** Render honest evidence/readiness/current-session Fit detail after V4 calculation integration, subject to rights and no local-store leakage.

**Files.**

- Modify `public/scripts/ui/provenance.js`, `public/scripts/ui/product-card.js`, and `public/styles-deferred.css` only for the scoped drawer; retain `tests/provenance.test.mjs` and `tests/card-provenance-integration.test.mjs` compatibility coverage.
<!-- doc-audit: ignore -->
- G11b may create the dedicated view `public/scripts/ui/evidence-drawer.js`; do not add a second Fit calculator or general UI rewrite.
<!-- doc-audit: ignore -->
- G11b creates `tests/architecture-v3/evidence-drawer.test.mjs` and `docs/architecture-v3/execution/G11b-evidence-drawer.md`.

**Required behavior.**

The drawer binds displayed result to snapshot hash, profile, rule version, and canonical site-input hash. It distinguishes dimensions/search availability, readiness, current Fit/unavailable result, conflicts/gaps/conditions, and rights-approved provenance. It escapes text, validates URLs, binds any page/crop display to hash/box, and never exposes local object-store paths.

Numeric explanations use the engine's bound check components/required/available/margin, not a second calculation. Show unknown components as unknown. Index caches are bundle-keyed; preserve keyboard opening/closing, Escape and focus restoration. Require browser verification of the complete calculation/drawer flow and its stale-response case, not string-rendering tests alone.

**Must prove.**

- Raw local source path and rights-blocked content never render.
- Stale site/snapshot hash cannot render prior verified result.
- Conditional operation/service result is not verified.
- Drawer flag off does not change calculation.
- Source text/URLs are escaped/validated.

**Run.**

```bash
node --test tests/architecture-v3/evidence-drawer.test.mjs
npm test
```

**Accept.** Drawer is presentation-only, right-safe, and no release promotion is implied.

## 7. Cross-gate adversarial witness ownership

| Witness | Owner | Required downstream consumer |
| --- | --- | --- |
| null/false/string/non-finite/negative numeric | G1a | G1b, G4a, G8a |
| permitted zero / field bounds | G1a | G1b, G4a |
| unknown inclusion never false | G1a | G1b, G4a, G8a |
| contradictory `eq` / context-key mismatch | G1a | G5b, G6a |
| unconditional + overlapping conditional Claim | G5b | G6a, G6b |
| only witnessed exclusivity partitions context | G5b | G6a |
| worktop variants never continuous range | G1a | G4a, G8a |
| missing axis/legend/mixed unit/capacity confusion | G3a/G3b | G4a, G6b |
| cross-page legend/footnote/crop rotation | G3a/G3b | G4a, G6b |
| same PDF wrong SKU/field/context | G4b | G5a, G6b |
| legacy receipt scope | G4b | G5b, G6a |
| strict codec / legacy digest information loss | G1a | G4a, G6c, G8a |
| old binding summary versus referenced evidence | G1b/G4b | G6c |
| old-to-new repair uses identical verification gates | G4b/G6b | G6c, G9a, G9b |
| upgrade batch retry/old-digest collision/full inventory | G6c | G9a, G10a |
| admitted + unresolved competitor | G5b | G6a |
| incomplete candidate inventory / first success | G5b | G6b, G9a |
| CAS/retry/crash/fork | G5a | G9a |
| dependency/rights/profile revocation | G5a | G6a, G7, G9a, G10b |
| snapshot hash versus receipt-set hash | G6a | G8a, G10a |
| 608 required / 607–611 available | G8a | G8b, G9a |
| adjustment 820–850 / available 830 unselected | G8a | G8b, G9a |
| oracle independence | G8b | G9a, G10b |
| old/new client, cache, rollback | G10b | G11a, G11b |
| SearchCore flag distinct from drawer | G11a | G11b |

## 8. Main-agent review, recovery, and first dispatch

For every `REVIEW_REQUIRED` task, the main agent checks actual task dependency/HEAD/input hashes, precise red-test behavior, producer/consumer naming agreement, scope/rights/source identity, state/retry/crash/cache/rollback risks where applicable, real-versus-portable witness status, and absence of unapproved public/release writes.

A green suite does not prove source acquisition, public release, or completion beyond its task row. A report is evidence for the table; it never replaces the table.

A `BLOCKED` record contains:

```text
Task ID, blocker fact, affected interface/fields, predecessor HEAD,
preserved files/objects, last valid check, recovery input, responsible party,
and whether portable work may continue
```

Examples: absent source mount keeps portable replay possible while real canary is `NOT_RUN`/`BLOCKED`; unclear physical adjustment meaning pauses only semantic/Fit work; policy/rights change triggers CurrentEligibility recomputation; descriptor change triggers relevant baseline/bundle comparison.

Programme review is ready only when every row is `COMPLETE` and proves current-eligible exact context-to-snapshot paths, explicit gaps/quarantine, V4 integrity-before-physics with strict intervals, independent oracle deltas, existing release-control compatibility, separate SearchCore/drawer flags, and no accidental mutation of active lifecycle/source/recovery material. Completion never automatically authorizes promotion.

The separate all-old-receipts repair objective remains unfinished until every
inventoried origin has a common-standard replacement or an explicit reviewed
exclusion decision. Unresolved gaps, skipped origins and quarantines cannot be
counted as repaired. Code-gate completion, receipt upgrade, installation evidence
coverage and production cutover are four different claims.

**Next dispatch:** G1b after G1a's Node20 CI acceptance. G0a/G0b remain complete
and are not rerun without changed inputs, failure or new risk. Main freezes the
reviewed G1a interfaces and current input-owner hashes in the next packet. G1b
only adapts reusable candidates and typed supplementation gaps; it does not
re-convert already-canonical V2 mm values, rewrite historical receipts, run G6c
backfill or perform public cutover.
