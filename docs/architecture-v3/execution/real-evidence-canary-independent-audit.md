# Real evidence canary — independent re-review v2 / fix round 1

Review date: 2026-09-14 (Australia/Perth)
Auditor: Anscombe, read-only independent auditor
Agent ID: `01a0a058-3493-7661-87e0-adb11909928e`
Dispatch configuration: `model=gpt-5.6-terra`, `reasoning_effort=max` — coordinator-recorded dispatch configuration; no independent observation of the backend model is claimed.
Executor: Euler `01a0a015-c1bb-7462-95fb-54f74f431358` (closed)
Scope: [frozen worktree](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline). Base/current HEAD declared by the package: `2deb71568c19b44af6bbca69a24d074fdb74d07a`; no Git command was used.

## Current versioned verdict

- Specification: **PASS — bounded raw/untyped preparation only**.
- Code quality: **APPROVED for this preparation scope**.
- V1 findings: **4/4 RESOLVED**; no new P1/P2 or other actionable regression found in the reviewed repair.
- Patch-risk recommendation: **`merge` / `human_review_required`**, advisory patch assessment only. It is not authorization for a Git action, publication or downstream gate completion.

The explicitly chosen raw-observation route satisfies the v1 alternative. Batch `934db1b3…` can be accepted as the bounded research preparation output. It does not establish formal G3b router/profile attestation, G4 field extraction/receipts, full legacy repair, a Fit verdict, or deployment. The physical and provenance gaps listed below remain open. The complete v1 report follows this section unchanged as historical evidence; its verdict applies to its v1 bytes.

## Exact reviewed identity

Frozen [package v2](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/real-canary-independent-review-package-v2.md): SHA-256 `ca454b5aca3c036bf88deedf29abe70dd1d7226b633bb1c422c6c98e08323594`.
Preserved [package v1](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/real-canary-independent-review-package-v1.md): SHA-256 `84da383eaae244427e4f12aaf8db8f44a2cd99aeb5ad817044dfea981fca32ce`.
Complete [four-file v1-to-round1 fixdiff](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/real-canary-inputs-round1-implementation.patch): SHA-256 `d4037152eb77f110ceaf55c836fe89eb50440bda341d7fdacccb4c0814b278f2`, 56,407 bytes. I rehashed all four before snapshots against the v1 identities and independently reproduced the full diff against current after files; both the patch file and its package-embedded copy agree byte-for-byte.

| Current scoped file | Bytes | SHA-256 |
| --- | ---: | --- |
| [scripts/architecture-v3/prepare-evidence-canary-inputs.mjs](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/scripts/architecture-v3/prepare-evidence-canary-inputs.mjs) | 58750 | `93e71ef259b528bf2a0dc91521a620f2af5a70709623c064bed2f68dd6e137ed` |
| [tests/architecture-v3/evidence-canary-inputs.test.mjs](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/tests/architecture-v3/evidence-canary-inputs.test.mjs) | 29282 | `8afc28ff327cfb891ef0ed0483be272b5392eb90a1744171b6fb286889ba6c1b` |
| [data/architecture-v3/research/legacy-evidence-canary-selection.json](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/data/architecture-v3/research/legacy-evidence-canary-selection.json) | 13434 | `16c08e974338f88431adadacd96c575533ad7a130f4ae81d7f18022b08ba883a` |
| [docs/architecture-v3/execution/real-evidence-canary-inputs.md](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/docs/architecture-v3/execution/real-evidence-canary-inputs.md) | 9998 | `b44779e85593baf1143f7bb6ad8915ca7e117b50e0206a60ad5e1ec1441080e0` |
| [docs/architecture-v3/execution/real-evidence-canary-semantic-review.md](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/docs/architecture-v3/execution/real-evidence-canary-semantic-review.md) | 14462 | `cc3d1768130a8cf2fe4e9e5ff5a55171a56efed252661e0edafd852e3b998dcb` |
| [docs/architecture-v3/terra-max-execution.md](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/docs/architecture-v3/terra-max-execution.md) | 18874 | `26c1607f2a81bfd021325114158b35bbf6ab1a961c8cd38da39e119538e469e0` |
| [docs/superpowers/plans/2026-09-13-architecture-v3-evidence-foundation.md](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/docs/superpowers/plans/2026-09-13-architecture-v3-evidence-foundation.md) | 110951 | `f1ec63369982136fdec4d70038c2f73f633a051cdd6d67fd06fb9d41558f7d60` |

The semantic-review document preserves its exact v1 contents as a prefix and adds only the raw-observation/provenance boundary. I reconstructed the plan's v1 bytes from the preserved patch hunks, obtained the v1 `dad2e519…` hash, and reviewed the complete current delta: audit identity, raw route, historical flags/counts, old-batch non-consumption and progress status. `terra-max-execution.md` is unchanged. No physical inference was added by these document changes.

New [candidate batch](/Volumes/UGREEN-1TB/FitAppliance/evidence/architecture-v3/canary-preparation/records/sha256/93/4d/934db1b37339d66a5843fa7a6cc9234283f2d5a90f3ea80573d81a42794d8733.json): SHA-256 `934db1b37339d66a5843fa7a6cc9234283f2d5a90f3ea80573d81a42794d8733`.
Executor [freeze record](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/real-canary-inputs-round1-freeze.json): SHA-256 `9c9192acf02edd783d589ff852f78e451904c5d5f2ce804490d30df3a4a21ce5`.

## Resolution of each v1 finding

### P1 — Manifest-authored typed candidate injection: RESOLVED

[Manifest validation](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/scripts/architecture-v3/prepare-evidence-canary-inputs.mjs:274) permits each field to contain only its exact historical claim pointer and field name; an incompatible historical field fails the owner/claim comparison. [Raw block selection](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/scripts/architecture-v3/prepare-evidence-canary-inputs.mjs:303) resolves the selected pointer in the hash-verified source JSON and retains the whole block. [Output construction](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/scripts/architecture-v3/prepare-evidence-canary-inputs.mjs:384) now copies that fragment content into `actualEvidence.rawObservations`; it no longer copies `candidateValues`, `observedValue`, units, ranges, axis order or label associations from the manifest.

`actualEvidence` explicitly states `RAW_SOURCE_OBSERVATIONS_RESEARCH_ONLY`, `fieldAssociation: NOT_WITNESSED`, `extractionWitness: NOT_SUPPLIED`, and `typedGeometry: NOT_PRODUCED`. Every field intentionally carries the source-level raw block set, not an implied per-field association. The adapter's numerical values still originate in the frozen historical claim and remain `legacy_geometry_candidate` / `candidate_only`, alongside `historicLegacyClaim` and historical replay context.

I independently compared all **45 nested raw observations across 9 historical-field entries** against **15 unique original source blocks**, including page/pointer, source JSON hash and both fragment identities. The three chunks' original-source fields, fragments, page references, notes and missing joins equal their v1 counterparts. Thus BDP p1 589 and p2 568, and the exact EWF 575/20-footnote/manual-disclaimer text, survive separately. [Six mutation subtests](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/tests/architecture-v3/evidence-canary-inputs.test.mjs:469) reject changed numeric value, range, unit, axis/label association and historical field after a valid baseline, before any report is written. This fix does not add a semantic verifier.

### P1 — Parallel OCR tool/observation provenance: RESOLVED as a retention contract

[OCR record validation](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/scripts/architecture-v3/prepare-evidence-canary-inputs.mjs:703) now compares all eight actually recorded profile fields against the frozen resolution policy: parser name/version, model revision, backend, method, profile ID, effort and image-analysis mode. Any recorded table/formula flag must also agree. The policy hash is `4b5072aa7f85cf59640cc464a1217de5aff11e218589989a31b0e30a5a864f7b`.

The validator binds canonical timestamp, attempt/descriptor status and gaps, cache=false, selection/readjudication/publication disposition, source/JSON hashes, format/schema/page count and the independently constructed selected-page ranges. The real attempt is page 2 of 2 with zero-based range `[[1,1]]`. [Twenty-seven OCR mutation subtests](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/tests/architecture-v3/evidence-canary-inputs.test.mjs:495) rehash changed records and reject metadata drift rather than relying on stale-hash failure.

The historical record `6d5088dcab372bb3d4018354fd34a711e768a8a067b6cb6d11559f5753767b63` and candidate JSON `45e9e43bf173c314152cceb64cb878fbff6392f104542ba09c85bb5ac514a7fb` remain unchanged. Its profile has no `tableEnabled` or `formulaEnabled`. [Emitted tool provenance](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/scripts/architecture-v3/prepare-evidence-canary-inputs.mjs:791) keeps the actual recorded profile separate from policy expectations, sets `INCOMPLETE_RECORDED_TOOL_PROVENANCE`, and lists both missing flags. This resolves the unsafe validation/representation defect; it does not recover those historical observations or make the attempt a complete tool attestation.

### P2 — Referenced versus executed OCR counts: RESOLVED

[Batch accounting](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/scripts/architecture-v3/prepare-evidence-canary-inputs.mjs:1021) reports selected conversions reused=3, historical local OCR attempts referenced=1, OCR conversions executed by prepare=0, incomplete OCR provenance records=1, and unreadable required diagram regions=1. The misleading `newConversions` key is gone. Historical replay is still explicitly referenced, not executed.

[Prior-batch handling](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/scripts/architecture-v3/prepare-evidence-canary-inputs.mjs:884) rehashes old batch `404721ce590473439738b589bda74a97dbbc4024c967d8479efe0c38386cb380` and records `UNACCEPTED_HISTORICAL_OUTPUT_DO_NOT_CONSUME`; it does not parse or inherit that batch's typed candidates. Producer-code and selection hashes now participate in the new report observation. All seven new objects match the freeze record, and independent check-only reproduces all seven hashes. The existing retry capture records the same batch with 0 created / 7 reused objects. All 27 external original/historical inputs recorded before the repair remain hash-identical.

### P2 — Full-suite actual exit and input binding: RESOLVED

I inspected the [capture harness](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/real-canary-inputs-round1-capture.mjs:63): it opens a new log exclusively, spawns the child without a shell, records `close(exitCode, signal)` and spawn errors, flushes the log, and captures before/after input hashes. The accepted evidence is this actual child-process record, not the handoff's PASS wording:

| Evidence | Verified identity / result |
| --- | --- |
| [Full capture](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/real-canary-inputs-round1-full.capture.json) | SHA-256 `48915773dc1d46196efb8b886450d40e57b9e632062b80da37e1cdf9d564f218`; command `npm test`; PID 96561; exitCode 0; signal/spawnError null |
| [Complete log](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/real-canary-inputs-round1-full.log) | SHA-256 `4f8c5370e2a574d87f0ae1cb3b6347d10f7eef190daccc700412f3c1146a67b0`; 726,734 bytes; 3,180 pass, 0 fail/cancelled/skipped/todo |
| [Harness](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/real-canary-inputs-round1-capture.mjs) | SHA-256 `da7071cb58c4f5b71b66564e3a44df89a9ab4f2a2d3795701f6d40ce1a3e8ce6` |
| Process interval / runtime | `2026-09-14T15:15:47.339Z`–`2026-09-14T15:16:22.971Z`; worktree above; Node v22.23.1, executable `/Users/clawdbot_jz/.hermes/node/bin/node` |
| Input capture | 5,281 distinct before/after entries, all equal; changedPaths/addedPaths empty; current functional code/data still match |

I rehashed all 5,281 recorded current paths. The only difference at review entry was the canonical plan's disclosed progress update: captured `cb414409de17d3f60d5325926f59e8208696c34d8f2a11af165414154ce554d2` (110,803 bytes) versus frozen v2 `f1ec63369982136fdec4d70038c2f73f633a051cdd6d67fd06fb9d41558f7d60` (110,951 bytes). The actual selected full capture already contains the final handoff, semantic-review and protocol hashes, so six of the seven scoped files match it exactly. I do not infer document equality from chronology or claim that the current plan hash ran in that earlier process. The final plan delta was separately source-reviewed; no functional difference is excused as metadata.

The full-suite evidence is **ACCEPTED**, with this explicit document distinction. I did not rerun the full suite. The old v1 3,145-pass log remains historical and is not used to supply the new exit proof.

## Independent checks and regression assessment

| Check actually performed in this re-review | Result / boundary |
| --- | --- |
| Package, snapshots, full fixdiff and seven current hashes | PASS; exact v1-to-v2 bytes established without Git |
| Source/output comparison | PASS; 45 raw observations / 15 unique blocks, 7 new objects, 27 old external objects; 6 page bindings unchanged |
| `node --test tests/architecture-v3/evidence-canary-inputs.test.mjs` | Independent PASS: 39 tests, 0 failures/skips/cancellations/todo, exit 0 |
| Real CLI `--check-only --selection data/architecture-v3/research/legacy-evidence-canary-selection.json --storage-root /Volumes/UGREEN-1TB/FitAppliance` | Independent PASS at `2026-09-14T15:27:44.874Z`, exit 0; 7 planned hashes including `934db1b3…`; writes=0 |
| Existing RED/GREEN/prepare/retry/lint/schema/full captures and logs | Hashes and recorded exits checked; RED exit 1 is historical TDD evidence, not a current failed check |
| Full-suite capture/log/harness and captured input inventory | PASS; existing 3,180-pass, actual exit-0 run accepted; not executed again |
| Patch-risk assessment JSON | Schema/invariant validator exit 0 |

The two independent executions used the recorded Node executable with a cleared environment and macOS sandbox denying network access. Targeted-test writes were confined to disposable `/private/tmp` fixtures; the real check-only denied filesystem writes. The repaired control flow validates all targets before reaching the writer. Existing owner/pointer/hash checks, CLI bounds, retry determinism, symlink and unequal-collision rejection remain intact. Imports and available callers show the explicit preparation CLI/test path; no receipt writer, publisher, router/runtime import, original-source mutation or new OCR/render execution was added.

Using the immutable-patch risk review, I rate impact **moderate**, regression likelihood **low**, protection **strong for this bounded preparation**, recoverability **managed**, and confidence **high**. No actionable new regression was established. This assesses the frozen local preparation contract; it is not a new CI, deployment or future general-purpose OCR-provenance guarantee.

## Remaining physical and metadata gaps

- **Extraction/relations:** typed field/axis/unit/range witnesses are absent. There are 30 isolated structural proofs but 0 witnessed relations and 15 explicitly unwitnessed joins. These cannot be promoted into full source-semantic proof.
- **BDF1620W:** the historical p2 OCR attempt succeeded, but image `/1/4` still has empty required content (`DIAGRAM_LABELS_UNREADABLE`, completion `NOT_SUPPLIED`). Cabinet/body/door-open labels, datum, extents and clearances remain unadjudicated. The p1 850–865 height range stays intact.
- **BDP810W:** p1 depth 589 and p2 depth 568 remain in separate source contexts. Neither is chosen, relabelled body-only, or declared a resolved same-semantic conflict.
- **EWF7524CDWA:** raw 575 mm depth, the 20 mm hose-protrusion footnote and product-guide/manual disclaimer remain together. No 595 mm installation depth or rear ventilation clearance is asserted; complete installation evidence and door/handle/service scope remain missing.
- **Historical OCR metadata:** table/formula flags remain unknown; pinned recorded profile agreement does not prove the actual values of absent settings.

The six page images and source bindings are unchanged from my v1 visual audit. I reused that audit and rechecked hashes/content bindings; I did not reopen the images, render pages, run OCR, replay the whole historical verifier, run a build, repeat the full suite, use Git/network, publish, issue receipts or delegate.

## Report preservation and freeze

This v2 section is the current versioned verdict for package `ca454b5a…` and batch `934db1b3…`. The entire 18,738-byte v1 report below is preserved verbatim; its SHA-256 is `e5e8ec8ac5268b2f75a3de770f83b194716b3faf21124d1189d55f9f8733f228`. Only this auditor-owned report is changed. Final read-only integrity verification binds its preserved v1 suffix and the unchanged seven frozen files; no implementation or evidence object is rewritten. Stop after freezing this report.

## Patch-risk assessment JSON — v2

```json
{
  "schemaVersion": 1,
  "patch": {
    "repository": "/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2",
    "sourceType": "patch_file",
    "base": "2deb71568c19b44af6bbca69a24d074fdb74d07a",
    "head": "2deb71568c19b44af6bbca69a24d074fdb74d07a",
    "changedFiles": [
      "scripts/architecture-v3/prepare-evidence-canary-inputs.mjs",
      "tests/architecture-v3/evidence-canary-inputs.test.mjs",
      "data/architecture-v3/research/legacy-evidence-canary-selection.json",
      "docs/architecture-v3/execution/real-evidence-canary-inputs.md",
      "docs/architecture-v3/execution/real-evidence-canary-semantic-review.md",
      "docs/architecture-v3/terra-max-execution.md",
      "docs/superpowers/plans/2026-09-13-architecture-v3-evidence-foundation.md"
    ],
    "sha256": "ca454b5aca3c036bf88deedf29abe70dd1d7226b633bb1c422c6c98e08323594"
  },
  "recommendation": "merge",
  "workflowLabel": "human_review_required",
  "impact": {
    "rating": "moderate",
    "rationale": "The bounded CLI produces immutable research inputs for later G3b/G4 work. It changes no receipt, public eligibility, or active Fit runtime."
  },
  "regressionLikelihood": {
    "rating": "low",
    "rationale": "Raw-source output replaces manifest-authored typed values; frozen-policy OCR comparisons reject the relevant rehashed drift cases. No new material regression was established."
  },
  "regressionProtection": {
    "rating": "strong",
    "rationale": "Independent 39-test run and sandboxed real check-only passed at the frozen functional bytes. Captured npm test has 3180 passes and actual exit 0. The later plan-only status change was separately reviewed.",
    "exactHeadChecksPassed": true
  },
  "recoverability": {
    "rating": "managed",
    "rationale": "Old immutable candidate objects remain historical and explicitly unaccepted. The new batch has a separate identity; downstream consumers must honor this versioned preparation verdict."
  },
  "confidence": {
    "rating": "high",
    "rationale": "Package, full four-file fixdiff, seven files, real raw blocks, capture/log/harness, input inventories, publication isolation and focused behavior were independently checked."
  },
  "applicability": {
    "status": "confirmed",
    "rationale": "The explicit preparation CLI and its three-source raw-observation artifacts are the intended scope. This recommendation is advisory patch acceptance only, not permission to merge or to advance downstream gates."
  },
  "statusQuoRisk": {
    "rating": "low",
    "rationale": "Deferring acceptance delays preparation while leaving production unchanged; the old v1 candidate batch remains do-not-consume."
  },
  "autoMergeExclusions": [
    "persistent_state",
    "architecture_specific_rollout"
  ],
  "affectedRuntimeRoots": [
    "prepare-evidence-canary-inputs.mjs explicit CLI",
    "external immutable canary-preparation research artifacts",
    "later G3b/G4 raw-observation review inputs"
  ],
  "importantCallers": [
    "explicit operator CLI invocation",
    "tests/architecture-v3/evidence-canary-inputs.test.mjs"
  ],
  "riskDrivers": [
    "Persistent candidate versions require explicit non-consumption of v1.",
    "Raw observations and incomplete historical OCR metadata cannot establish typed semantics or complete tool attestation."
  ],
  "protectiveFactors": [
    "Strict manifest key contract rejects numerical/axis/unit/range/label injection.",
    "45 emitted raw observations equal 15 original selected blocks.",
    "Eight recorded OCR profile fields bind to frozen policy; absent flags remain unknown.",
    "Check-only succeeded with filesystem writes denied.",
    "Full capture binds actual process exit, log bytes and unchanged functional inputs."
  ],
  "materialBoundaries": [
    {
      "id": "raw_source_observations",
      "invariant": "Preparation cannot promote manifest-authored numeric or field associations into new typed geometry.",
      "runtimeRoot": "selectedTargetSet / selectedBlocksForTarget / fieldSupplementation",
      "counterexample": "Add EWF depth 595, a changed range or unit, or a label/axis mapping while retaining valid raw hashes.",
      "legitimateControl": "Field allowlist rejects unsupported properties; historical field mismatch rejects; rawBlock comes from the source JSON fragment. Independent tests and real-object comparisons passed.",
      "result": "supported"
    },
    {
      "id": "parallel_ocr_metadata",
      "invariant": "Recorded OCR metadata must match frozen policy and attempt/page/disposition bindings; missing flags stay incomplete.",
      "runtimeRoot": "loadParallelCandidateConversions",
      "counterexample": "Change parser/model/effort or processing metadata and rehash the record under the same approved profile name.",
      "legitimateControl": "Eight identity fields, recorded optional flags, canonical timestamp, status/cache/disposition and derived page ranges are compared; 27 drift cases reject. Missing table/formula flags remain explicit gaps.",
      "result": "supported"
    },
    {
      "id": "accounting_and_versioning",
      "invariant": "Historical attempts are references, not newly executed OCR; old unsafe candidates cannot be inherited by the repaired batch.",
      "runtimeRoot": "prepareEvidenceCanaryInputs report construction",
      "counterexample": "Count the existing OCR record as a new conversion or reuse typed candidates from batch 404721ce.",
      "legitimateControl": "Counters distinguish reused 3/referenced 1/executed 0; old batch bytes are hashed but not parsed for observations. Real check-only reproduces new batch 934db1b3.",
      "result": "supported"
    },
    {
      "id": "immutable_output_and_isolation",
      "invariant": "Check-only writes nothing; preparation retries preserve prior objects and cannot issue receipts or public state.",
      "runtimeRoot": "checkOnly branch / writeImmutableCandidateObject / explicit CLI entrypoint",
      "counterexample": "An output-chain symlink, unequal existing object, failed validation or prepare-time replay could overwrite or misrepresent prior results.",
      "legitimateControl": "Writer and retry controls are unchanged and tested; all validation precedes writes; real check-only passes with writes denied; imports expose no publisher or receipt writer.",
      "result": "supported"
    },
    {
      "id": "full_suite_evidence",
      "invariant": "A claimed full-suite pass needs the actual child exit, complete log and the reviewed functional identities.",
      "runtimeRoot": "frozen child-process capture harness and full capture",
      "counterexample": "A passing TAP footer without process exit, or post-test functional drift, could be mistaken for current proof.",
      "legitimateControl": "Harness captures child close(exitCode,signal); capture 48915773 records npm test exit 0 and log 4f8c5370. All 5281 before/after entries agree; current functional inputs match, with only the declared plan progress difference.",
      "result": "supported"
    }
  ],
  "validation": [
    {
      "name": "package v2, v1 predecessor, seven files and four-file snapshot/fixdiff comparison",
      "status": "passed",
      "protects": "Exact current and historical review identities; no empty HEAD diff substituted."
    },
    {
      "name": "independent targeted tests",
      "status": "passed",
      "protects": "39/39 tests, exit 0, including 6 manifest and 27 OCR adversarial subtests plus existing controls."
    },
    {
      "name": "independent real check-only",
      "status": "passed",
      "protects": "Exit 0 with writes denied; new batch 934db1b3 and all seven planned hashes reproduced."
    },
    {
      "name": "real source/output equivalence",
      "status": "passed",
      "protects": "45 raw observations match 15 exact original blocks; original fragments, six page bindings and 27 historical external objects remain unchanged."
    },
    {
      "name": "full suite capture/log/harness audit",
      "status": "passed",
      "protects": "Accepted existing 3180-pass actual exit-0 evidence at the frozen functional inputs; no duplicate full-suite run."
    },
    {
      "name": "new image reads, rendering, OCR, full-suite execution, build and deployment",
      "status": "skipped",
      "protects": "Outside the authorized re-review scope; no downstream completion inferred."
    }
  ],
  "unknowns": [
    {
      "summary": "Historical OCR tableEnabled and formulaEnabled were not recorded. This does not block raw historical retention but does block calling the attempt a complete tool attestation.",
      "decisionCritical": false
    },
    {
      "summary": "Fifteen joins, field/axis/unit/range extraction witnesses, BDF diagram semantics, BDP depth scope and EWF installation evidence remain unresolved for downstream gates.",
      "decisionCritical": false
    },
    {
      "summary": "The current canonical plan hash differs from its full-test-time progress snapshot. Current functional inputs and six other scoped files match the full capture; this review separately binds the final plan.",
      "decisionCritical": false
    }
  ],
  "evidencePlan": []
}
```

---

# Historical audit v1 — preserved verbatim

# Real evidence canary — independent frozen audit

Date: 2026-09-14 (Australia/Perth)
Auditor: Anscombe, read-only independent auditor
Agent ID: `01a0a058-3493-7661-87e0-adb11909928e`
Dispatch configuration: `model=gpt-5.6-terra`, `reasoning_effort=max`
Executor: Euler `01a0a015-c1bb-7462-95fb-54f74f431358` (closed)
Scope: `/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline`, base/current HEAD `2deb71568c19b44af6bbca69a24d074fdb74d07a`.

## Verdict

- Specification: **CHANGES_REQUIRED**.
- Code quality: **Needs fixes**.
- Patch-risk recommendation: **`revise`** (not mergeable as a G3b preparation input).
- No V3 receipt, eligibility, Fit result, publication state, or original source was issued or changed by this audit.

The three present source pairs and stored candidate artifacts are correctly hash-bound and remain candidate-only. The blocker is the preparation runner: it can emit a typed `actualEvidence.candidateValues` value that is not mechanically shown by its selected MinerU block, and it does not fully bind the one parallel OCR record to its pinned parser/model configuration. Those defects are upstream of G3b/G4 and must be fixed before these candidate objects are accepted as safe input.

## Frozen identity

Frozen package: `.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/real-canary-independent-review-package-v1.md`, SHA-256 `84da383eaae244427e4f12aaf8db8f44a2cd99aeb5ad817044dfea981fca32ce`. Current bytes matched all seven package identities before this report was added:

| Path | SHA-256 |
| --- | --- |
| `scripts/architecture-v3/prepare-evidence-canary-inputs.mjs` | `3b3161e22e35c8c56580a25afde2880cc3ca0b43f182eaa1c35e43b0093081ed` |
| `tests/architecture-v3/evidence-canary-inputs.test.mjs` | `3bd40e00368f65e590f6df8cc486bf1a562b1566be1d319988e13a00df761e86` |
| `data/architecture-v3/research/legacy-evidence-canary-selection.json` | `01c32b759ef5075938dc2be0bc74d4bcf8fca0e00902baed87d2d24c192d5863` |
| `docs/architecture-v3/execution/real-evidence-canary-inputs.md` | `a9dc529d904a79a4af96210cadad4e1c00893f8f3965e6f4ff810ba66a1268f3` |
| `docs/architecture-v3/execution/real-evidence-canary-semantic-review.md` | `30f2e2578492ae224fb8874e71606cd9d134a0cd8e4dc9894f1a7e9b807c81d3` |
| `docs/architecture-v3/terra-max-execution.md` | `26c1607f2a81bfd021325114158b35bbf6ab1a961c8cd38da39e119538e469e0` |
| `docs/superpowers/plans/2026-09-13-architecture-v3-evidence-foundation.md` | `dad2e519c168023062f11592f9389c9e30d875925e1d57c50593aa927514909e` |

The package combines the five preparation artifacts with main-owned semantic/protocol/plan documents. The frozen diff alone cannot attribute authorship between those roles; this audit assesses their contents, not a guessed author.

## Independent source review

Acceptance bundle `d947f8bcf15173ceb23fbba98a62459140f8ed9b93bf15c7d5fc5314f6785550`, all three PDF/selected-MinerU pairs, the replay checkpoint `c321…a0b7d`, renderer attestation `f79e…be657`, and all six referenced full-page PNGs rehashed to their declared SHA-256 values. The checkpoint binds exactly three source owners and records 3 historical/as-of passes and 0 failures; it is not a new receipt or current-publication result.

- **BDF1620W** — PDF p1 / JSON `/0/15` visibly and structurally gives unpackaged W 598, H 850–865 (feet adjustment), D 600 mm; p2’s full-page diagram is retained as an unadjudicated image region. The 30 mm, min 598, 570, 850(+15), door-open and cabinet labels were not promoted to clearance or replacement geometry. The one additional p2 OCR candidate still has empty image text and is correctly retained as `DIAGRAM_LABELS_UNREADABLE`.
- **BDP810W** — p1 label/value blocks `/0/30` + `/0/47` visibly give W 597, H 846, D 589 mm; p2 `/1/7` explicitly orders W/D/H = 597/568/846 mm. The two depth candidates remain separate and unadjudicated, as required.
- **EWF7524CDWA** — p3 `/2/4` gives W 600, H 850, D 575 mm with model header `/2/10`; p6 `/5/1` visibly says `575* mm` and “Add 20mm for the hose protrusion at the back”, while `/5/3` limits the document to a product-dimensions guide. The output does not claim a 595 mm installation depth or ventilation clearance.

All six pages have `rotationDegreesClockwise: 0` and hash-bound full-page transforms. This review did not rerender, re-OCR, issue a receipt, or alter external evidence.

## Findings

### P1 — Typed candidate values are not witnessed by the selected raw content

`candidateValues()` returns manifest-supplied objects verbatim, and `fieldSupplementation()` only proves that each `valuePointer` names a selected block ([prepare-evidence-canary-inputs.mjs:353](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/scripts/architecture-v3/prepare-evidence-canary-inputs.mjs:353), [prepare-evidence-canary-inputs.mjs:379](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/scripts/architecture-v3/prepare-evidence-canary-inputs.mjs:379)). It neither parses the raw block nor compares the manifest’s `value` to a witnessed label/unit/value. A changed `595` on EWF’s `/2/4`, for example, would retain valid PDF/JSON hashes and a valid selected pointer yet be written under `actualEvidence`.

The existing negative case alters only a pointer ([evidence-canary-inputs.test.mjs:399](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/tests/architecture-v3/evidence-canary-inputs.test.mjs:399)); it has no red case for a wrong numeric value, range endpoint, unit, or label-to-value association. Do not merely compare every candidate to the historical claim: BDP p2’s 568 mm is deliberately a distinct unadjudicated candidate. Bind a typed candidate to an explicit source extraction witness, or preserve it only as raw observation until that witness exists.

### P1 — Parallel OCR provenance verifies a profile name, not the pinned tool configuration

The OCR loader validates source identity, hashes, selected pages, `profileId`, and the empty image block, but not `attemptedAt`, descriptor status, parser name/version, model revision, backend, method, effort, or image-analysis flags ([prepare-evidence-canary-inputs.mjs:697](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/scripts/architecture-v3/prepare-evidence-canary-inputs.mjs:697)). The manifest declares a specific MinerU profile and historical record ([legacy-evidence-canary-selection.json:145](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/data/architecture-v3/research/legacy-evidence-canary-selection.json:145)), but this code would accept drift behind the same profile ID after its bytes were re-declared.

That violates the task’s pinned-profile/tool-identity requirement. Add exact metadata comparisons and a negative test for model/version/profile metadata drift. The present record happens to carry the expected values; that does not protect later or reconstructed runs.

### P2 — Conversion accounting is ambiguous about what this invocation executed

The report explicitly marks historical replay as `REFERENCED_EXISTING_CHECKPOINT_NOT_EXECUTED_BY_PREPARE` ([prepare-evidence-canary-inputs.mjs:920](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/scripts/architecture-v3/prepare-evidence-canary-inputs.mjs:920)), yet counts every already-loaded parallel OCR record as `newConversions` ([prepare-evidence-canary-inputs.mjs:947](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/scripts/architecture-v3/prepare-evidence-canary-inputs.mjs:947)). The runner does not perform OCR. Rename/split the counts, e.g. `referencedExistingLocalOcrAttempts` versus `newConversionsExecutedByPrepare: 0`, and state the historical one-off attempt separately. This is needed for honest stage accounting, not receipt safety.

### P2 — Complete-suite exit evidence is not independently bound

The frozen TAP log hash and footer show 3,145 passes and 0 failures, but the log itself does not contain a shell exit record. `real-evidence-canary-inputs.md`’s `exit 0` is executor self-report ([real-evidence-canary-inputs.md:13](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/docs/architecture-v3/execution/real-evidence-canary-inputs.md:13)), not independently captured command evidence. Per the task brief, do not treat the full suite as independently PASS until a fresh exact-frozen-head capture or exact-head CI exposes command exit status. This is not a reason to rerun the unchanged suite before fixing P1s.

## Protected boundaries and risk assessment

| Dimension | Rating | Evidence |
| --- | --- | --- |
| Impact if wrong | Moderate | Candidate artifacts can become G3b/G4 inputs, but no receipt, public projection, or active runtime path is changed. |
| Regression likelihood | Moderate | Hash/owner/pointer checks are strong; typed-value and OCR configuration binding are incomplete. |
| Regression protection | Partial | Focused 4-test suite ran at the frozen bytes and check-only reproduces the stored report; neither tests the two P1 counterexamples. |
| Recoverability | Managed | Originals are preserved and no public state changes, but already-written immutable candidate objects must be quarantined/ignored by revised inputs rather than overwritten. |
| Confidence | High | Exact patch identity, source objects, page images, output hashes, changed roots, and counterexamples were independently inspected. |

Material boundary controls that held: exact three-target selection; owner/source/receipt pointer checking; rehashing PDFs, selected MinerU JSON, page images, and generated objects; `--check-only` zero writes; content-addressed write collision rejection; no publisher/receipt API in the new runner. These controls do not repair the P1 evidence-binding gaps.

## Checks actually run

| Check | Result | What it establishes |
| --- | --- | --- |
| SHA-256 of frozen package and seven scoped files | PASS | Current reviewed bytes match the package. |
| Acceptance bundle, 3 PDFs, 3 MinerU JSON, checkpoint/attestation/OCR record, 6 page PNGs, 7 generated objects | PASS | Exact source, render, and candidate-output identities. |
| Original-resolution visual review of BDF p1–2, BDP p1–2, EWF p3/6 | PASS | Labels, axis ordering, footnote/disclaimer limits described above. |
| `node scripts/architecture-v3/prepare-evidence-canary-inputs.mjs --check-only …` | PASS, 0 writes | Recomputed the existing batch report hash `404721ce…` and seven planned object hashes. |
| `node --test tests/architecture-v3/evidence-canary-inputs.test.mjs` | PASS, 4/4 | Current targeted implementation behavior only. |
| Full `npm test` | NOT_ACCEPTED_AS_INDEPENDENT_PASS | Complete frozen TAP footer exists, but fresh/exact-head process exit evidence was not available and was not rerun. |
| Build, lint, network, new render/OCR, receipt/publication/release actions | NOT_RUN | Outside this read-only audit scope. |

## Required return-to-executor scope

1. Make every emitted typed candidate value derive from a strict raw source witness (including field/axis/unit/range) or downgrade it to raw/untyped observation; add adversarial tests for altered value/range/unit and valid BDP-style parallel evidence.
2. Fully bind the parallel OCR record to the declared pinned configuration and timestamp/status semantics; add drift tests and unambiguous referenced-versus-executed conversion counters.
3. Freeze the repaired seven-file identity, rerun only affected checks plus the required full-suite evidence capture/CI, then request a new independent audit. Existing objects must remain preserved; do not overwrite them or issue receipts to demonstrate the fix.

## Patch-risk assessment JSON

```json
{
  "schemaVersion": 1,
  "patch": {
    "repository": "/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2",
    "sourceType": "patch_file",
    "base": "2deb71568c19b44af6bbca69a24d074fdb74d07a",
    "head": "2deb71568c19b44af6bbca69a24d074fdb74d07a",
    "changedFiles": [
      "scripts/architecture-v3/prepare-evidence-canary-inputs.mjs",
      "tests/architecture-v3/evidence-canary-inputs.test.mjs",
      "data/architecture-v3/research/legacy-evidence-canary-selection.json",
      "docs/architecture-v3/execution/real-evidence-canary-inputs.md",
      "docs/architecture-v3/execution/real-evidence-canary-semantic-review.md",
      "docs/architecture-v3/terra-max-execution.md",
      "docs/superpowers/plans/2026-09-13-architecture-v3-evidence-foundation.md"
    ],
    "sha256": "84da383eaae244427e4f12aaf8db8f44a2cd99aeb5ad817044dfea981fca32ce"
  },
  "recommendation": "revise",
  "workflowLabel": "revise",
  "impact": {
    "rating": "moderate",
    "rationale": "The runner writes candidate artifacts for later G3b/G4 use but cannot issue receipts, public eligibility, or active Fit state."
  },
  "regressionLikelihood": {
    "rating": "moderate",
    "rationale": "Source hashes, owners and pointers are checked, but candidate value semantics and complete OCR tool identity are not mechanically bound."
  },
  "regressionProtection": {
    "rating": "partial",
    "rationale": "The frozen targeted suite and real check-only replay pass, but they omit altered candidate-value and OCR metadata drift counterexamples.",
    "exactHeadChecksPassed": true
  },
  "recoverability": {
    "rating": "managed",
    "rationale": "Original evidence is preserved and no public state changed, but immutable candidate artifacts need explicit quarantine or non-consumption after repair."
  },
  "confidence": {
    "rating": "high",
    "rationale": "Exact patch bytes, callers, real source objects, six page renders, generated outputs and focused checks were independently examined."
  },
  "applicability": {
    "status": "confirmed",
    "rationale": "The CLI is the intended bounded producer for the real three-source canary artifacts."
  },
  "statusQuoRisk": {
    "rating": "low",
    "rationale": "Not merging delays candidate preparation but leaves production, receipts and V3 Fit behavior unchanged."
  },
  "autoMergeExclusions": [
    "persistent_state",
    "architecture_specific_rollout"
  ],
  "affectedRuntimeRoots": [
    "scripts/architecture-v3/prepare-evidence-canary-inputs.mjs CLI",
    "external evidence/architecture-v3/canary-preparation immutable candidate objects",
    "G3b/G4 consumers of candidate supplementation and lineage chunks"
  ],
  "importantCallers": [
    "explicit operator CLI invocation",
    "later G3b/G4 evidence-review workflow"
  ],
  "riskDrivers": [
    "Manifest supplied typed values are not extracted or compared against raw source content.",
    "Parallel OCR record validates only profileId instead of full pinned tool configuration.",
    "New-conversion count conflates an existing record with work done by this invocation."
  ],
  "protectiveFactors": [
    "Exact source, JSON, rendered-page and output hashes are verified.",
    "Owner, receipt and selected pointer checks fail closed.",
    "Candidate-only status prevents receipt and publication promotion.",
    "Immutable writer rejects unequal collisions and tested symlink chains."
  ],
  "materialBoundaries": [
    {
      "id": "candidate_value_witness",
      "invariant": "Every typed candidate value must be supported by its exact raw source field, label, unit and range witness.",
      "runtimeRoot": "fieldSupplementation",
      "counterexample": "Change an EWF candidate from 575 to 595 while retaining /2/4 and all source hashes; the current code emits the changed value as actualEvidence.",
      "legitimateControl": "The code verifies selected blocks and source hashes, but does not parse or compare candidate.value to those blocks.",
      "result": "contradicted"
    },
    {
      "id": "parallel_ocr_identity",
      "invariant": "A retained local OCR attempt must bind the exact approved parser/model/profile configuration and observation metadata.",
      "runtimeRoot": "loadParallelCandidateConversions",
      "counterexample": "Change parser version or model revision under the same profileId and re-declare the record hash; current comparisons still pass.",
      "legitimateControl": "Source hash, selected pages, profileId and candidate JSON hash are checked, but full profile metadata is not.",
      "result": "contradicted"
    },
    {
      "id": "immutable_output",
      "invariant": "A retry cannot overwrite unequal candidate bytes or escape the configured output root through a symlink.",
      "runtimeRoot": "writeImmutableCandidateObject",
      "counterexample": "An existing unequal object or output-chain symlink must be rejected.",
      "legitimateControl": "Focused test covers both cases and passed at the frozen bytes.",
      "result": "supported"
    },
    {
      "id": "publication_isolation",
      "invariant": "Preparation cannot create a V3 receipt, active publication decision or Fit verdict.",
      "runtimeRoot": "prepareEvidenceCanaryInputs",
      "counterexample": "A candidate output must not expose a receipt or public eligibility field that can bypass G4-G6.",
      "legitimateControl": "The emitted reports retain NOT_EVALUATED_CANDIDATE_ONLY and newV3Receipts 0; no publisher or receipt writer is imported.",
      "result": "supported"
    }
  ],
  "validation": [
    {
      "name": "frozen package and seven-file SHA-256 comparison",
      "status": "passed",
      "protects": "Audited live files are byte-identical to the supplied immutable review package."
    },
    {
      "name": "real three-source check-only invocation",
      "status": "passed",
      "protects": "Current source hashes, checkpoint, page lineage and deterministic planned output report are checked without writes."
    },
    {
      "name": "tests/architecture-v3/evidence-canary-inputs.test.mjs",
      "status": "passed",
      "protects": "CLI bounds, pointer/hash failures, check-only, retry and immutable writer behavior."
    },
    {
      "name": "frozen full npm test log exit binding",
      "status": "unavailable",
      "protects": "The TAP footer is present, but an independent exact-head command exit record was not available."
    }
  ],
  "unknowns": [
    {
      "summary": "The frozen full TAP log has a valid hash and passing footer, but no separately captured process exit binding to the frozen uncommitted patch.",
      "decisionCritical": false
    }
  ],
  "evidencePlan": []
}
```
