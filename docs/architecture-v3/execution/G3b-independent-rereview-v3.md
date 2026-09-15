# G3b independent scoped re-review v3 — fix2 / N1

Date: 2026-09-15 (Australia/Perth). Reviewer: **Dewey**, agent ID `01a0a2c0-4b22-7cb0-884c-f2e03755915b` (current task environment confirmed). Independent auditor, not implementer. Executor Dalton `01a0a264-0a86-7ae0-a250-764c686e384d` is closed according to main's handoff; no delegation or executor activity was initiated by this review.

Requested/controller model setting: **`gpt-5.6-terra / max`**, retained as requested. Self-visible generic model label: **GPT-5 / Codex**. Exact serving-model identity and runtime effort are not independently exposed; this report does not infer them or amend earlier model records.

## Verdicts

| Decision | Verdict | Scope / condition |
| --- | --- | --- |
| N1 | **ADDRESSED** | Closed raw-kind validation in the shared observer fixes the unsupported-kind fallback without losing valid neighbouring regions. |
| New concrete findings | **NONE FOUND** | Only the supplied v2→v3 fix diff and its directly affected N1 boundaries were reviewed. |
| Spec compliance | **APPROVED** | N1/fix2 scope; F1/F2/F3 remain ADDRESSED from v2 and were not reopened. |
| Code quality | **APPROVED** | One existing shared validation owner, no parallel raw-kind checker, new module or import edge. |
| Whole-branch ready-to-merge | **CONDITIONAL APPROVAL — NOT YET MERGE-READY** | Code review is approved. Main must obtain passing full exact-head CI after the first commit/PR, confirm it covers the reviewed version, and perform final acceptance before merge. This is not a current CI PASS or release authorization. |

No implementation change is requested by this re-review. The remaining verification gate is full exact-head CI owned by main, not an omitted repeat suite for this uncommitted audit.

## Frozen scope and preservation

Workspace: `/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline`.

Base HEAD: `c83aa475d892e5bdb8bc7f65a0cee4cb05292a50`; branch: `codex/architecture-v3-g3b-region-canaries`. Current HEAD, branch, and all **17** frozen file byte lengths / SHA-256 identities were checked before source review. Review uses the supplied snapshot-derived patch, not a reconstructed HEAD~1 or expanded branch diff.

| Evidence | SHA-256 |
| --- | --- |
| [Freeze v3](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/G3b-freeze-v3.json) | `5e106a112a45c1feadabb96a11bdbd3f4b229780c31174cdc69990fd1c97e5eb` |
| [Complete v3 package](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/G3b-review-v3.md), 337445 bytes | `d76d09b88c5e598a52d5d3246dc46668e3d38099d6620c5149e7740a1d42856d` |
| [Directed v2→v3 fix package](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/G3b-fix-review-v2-v3.md), 60626 bytes | `7bc4a4387831fa6de7ec7e7443d20841529aee30f6fa7c2e447457930c45d6d8` |
| [Executor report, fix2 starts at line 187](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/docs/architecture-v3/execution/G3b-router-canaries.md) | `7b80cceaeb409ab4967dc9589aa1dba3b3e527c8fe64973d631cc44b148d06e1` |
| [Unchanged original audit](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/docs/architecture-v3/execution/G3b-independent-audit.md) | `ce1cff3c900cfb1d4c2d7004488d3d2e3fb9779c23dd979f72ce432731906a39` |
| [Unchanged v2 re-review](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/docs/architecture-v3/execution/G3b-independent-rereview-v2.md) | `2eb7c34daecc704402a8b3f03ca3f836cc9b105c460547e38e93d370bcef2b8b` |
| [Shared observer](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/src/domain/architecture-v3/extraction-region-observation.mjs) | `1a62e4d492a575fd3046553a7eba0b0180d5dcafe57bc51fe0031b24fce7dff3` |
| [Affected tests](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/tests/architecture-v3/region-router.test.mjs) | `8b17b55951f04d5287661ca9d8d5371d8b324cac0514fb8371b5d3e278a7f14c` |
| [Manifest file](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/tests/fixtures/architecture-v3/profile-canaries/manifest.json) | `d01e84bf90bcd2ecdd503264f0477c41b49db8b0c5cb89a788901879041916da` |

The executor report's entire v2 prefix was compared byte-for-byte with the preserved v2 snapshot: **22191 bytes**, SHA-256 `fd3b2f06f3df2f1b4a7bdedeacab3065bd2098ffa6d884c1b637f0200d6d1e63`, identical. The snapshot observer identity is `78b2f60c2e517c92cbd2e8e924a009198da30bf59e9453ab44459fd081a07c18`. The snapshot/prefix check completed at `2026-09-15T03:20:46.196Z`, actual exit **0**.

Scope authority is [fix round2 brief](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/G3b-fix-round2-brief.md). I read N1 in the v2 report (lines 76–95) and the corresponding old diagnostic source (lines 110–153); the historical diagnostic was not rerun. In the directed package, I reviewed the new observer/test/manifest hunks and execution/plan status updates. The carried-forward v2 report addition is a preserved audit artifact, not a request to re-audit its resolved findings. The complete v3 package was hash-bound, not treated as authorization for another full audit.

The manifest diff changes only the observer code identity and manifest self identity (`985ca87f91c1669e44d1e88a74baadf205d23139557f028982a368aa3cf758f0`). No policy, profile, parser kind, source expectation or raw fixture was changed. Documentation remains REVIEW_REQUIRED pending this independent review and main's gates; it does not claim premature release or CI approval.

## N1 decision and coverage

The prior failure was a real permissive fallback: with a correctly rehashed BDP `/0/47` raw block, deleting or changing `type` could still yield `structured_text`, selection and MinerU routing while losing the index-specific axis gap. Fix2 changes the source of that decision, not merely the test expectation.

| Boundary | Current file:line coverage | Independent assessment |
| --- | --- | --- |
| Raw kind is a closed vocabulary | `/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/src/domain/architecture-v3/extraction-region-observation.mjs:7`, `:123`; `/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/tests/architecture-v3/region-router.test.mjs:587`, `:626` | Only string own-keys `title`, `paragraph`, `page_header`, `index`, `image`, `table` are accepted. Unknown/missing types, non-string JSON values, empty/space-padded malformed strings, prototype names (`constructor`, `__proto__`) and derived signal names cannot fall through or be normalized into an accepted kind. |
| Unsupported is retained, not guessed or discarded | `/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/src/domain/architecture-v3/extraction-region-observation.mjs:399`, `:420`, `:453`; `/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/tests/architecture-v3/region-router.test.mjs:591` | For otherwise valid raw JSON/pointer/bbox/fragment identity, every unsupported region remains in the output with `incomplete`, `contentMode: unsupported`, `UNSUPPORTED_RAW_KIND`, original raw block, pointer, PDF/parent/fragment identities and bbox. It has only `raw_block_identity`, not inferred structural or axis evidence. The envelope is incomplete without discarding valid neighbours. |
| No false page-context contribution | `/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/src/domain/architecture-v3/extraction-region-observation.mjs:134`, `:138`, `:156`, `:405`, `:413` | Page-context and split-column computation receive only supported raw blocks. Unsupported blocks also return from signal derivation before text/context inference. Thus they cannot donate dimension, split-column or image/disclaimer page signals to supported neighbours. This claim is based on the source data flow, not an assertion that the mixed-neighbour test separately isolates every possible context signal. |
| Supported neighbour stays usable | `/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/src/domain/architecture-v3/extraction-region-observation.mjs:421`, `:484`; `/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/tests/architecture-v3/region-router.test.mjs:643` | The incomplete document retains both BDF regions; supported `/0/15` remains inspected and independently selectable/routable even when `/0/14` is unknown. Replay selects the target region rather than using the overall incomplete envelope as a blanket rejection. |
| Legitimate index retains its limitation | `/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/src/domain/architecture-v3/extraction-region-observation.mjs:11`, `:193`; `/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/tests/architecture-v3/region-router.test.mjs:571` | Unchanged BDP `/0/47`, without invented page-image metadata, remains selected as `beko-au-dryer-split-columns-v1`, routes MinerU and keeps `AXIS_OR_LEGEND_GAP`. Unknown types instead receive their own unsupported-kind gap, not a fabricated index/axis meaning. |
| Direct selection and routing share replay | `/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/src/domain/architecture-v3/extraction-region-observation.mjs:467`; `/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/src/domain/architecture-v3/document-family-registry.mjs:274`; `/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/src/domain/architecture-v3/region-router.mjs:215`, `:231`; `/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/tests/architecture-v3/region-router.test.mjs:606`, `:613` | Both callers replay before their inspected-status gate. Actual unsupported regions fail as `UNINSPECTED_REGION`; changing serialized status to `inspected` changes the submitted core and fails `REGION_REPLAY_MISMATCH`. The new test explicitly checks selector spoof rejection; router rejection follows the same unchanged replay entry before selected-profile handling. No new parallel raw-kind validator or bypass was introduced. |

Malformed **type values** are distinguished from already-invalid documents, non-JSON objects/accessors, bad coordinates or bad fragment hashes. Fix2 does not promise to retain input that the pre-existing strict JSON/identity contract cannot accept. Retained raw text is not itself permission to select an unsupported region or create a Claim/receipt.

No imports or runtime edges were added by this patch. The shared observer remains the existing owner; registry, router and CLI implementations are byte-identical to v2. The only behavioural change is the closed raw-kind gate plus supported-only context participation. No new concrete correctness, quality or scope finding was identified.

## Checks, provenance and limits

This auditor performed read-only freeze/package/old-report identity checks, preserved-prefix comparison, directed source review and examination of recorded N1 RED/GREEN/final affected assertions. These are independent review activities, not fresh execution of the implementation suites. Main already verified the final four captures' actual exits, log hashes, all 39 current input byte lengths / hashes and before=after; I did not repeat that full inventory or read external originals again.

| Recorded executor evidence | Actual result | Evidentiary use |
| --- | --- | --- |
| `G3b-fix2-red-n1` | exit **1**; 5 tests, 1 pass / 4 assertion failures, no skip/cancel | Legitimate index control passes on v2; four N1 groups fail on `inspected` versus expected `incomplete`. This is intended RED, not a spawn/dependency failure. The multi-value group stops at its first failing value in RED; it is not evidence that every value ran before the fix. |
| `G3b-fix2-green-n1` | exit **0**; 5/5 | All new groups pass after the behavioural fix. This run predates final manifest identity and is TDD evidence only. |
| `G3b-fix2-affected-final` | exit **0**; 26/26; no fail/skip/cancel | Final affected-suite log includes the five N1 groups as tests 13–17, plus complete totals. This is final frozen-input execution evidence, not full CI. |
| `G3b-fix2-portable` | exit **0**; 6 positives / 12 genuine negatives / 12 separate tamper controls | Portable binding only; `originalObjectsBound: false`. No N1-specific test rerun by this reviewer. |
| `G3b-fix2-original-objects` | exit **0**; same counts | Only this mode has `originalObjectsBound: true`; main verified current original-input bindings. |
| `G3b-fix2-missing-store` | exit **2**, BLOCKED / EVIDENCE_STORE_UNAVAILABLE | Expected unavailable-store boundary, not a successful original-object run. |

Capture/log directory: `/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/`.

| Stem (each has `.capture.json` and `.log`) | Capture SHA-256 | Log SHA-256 |
| --- | --- | --- |
| `G3b-fix2-red-n1` | `124be14394169110ad73f9b254373f09ca1fb38649cf1acb407b82074f6f20f9` | `2483f6ba63e1c12bc94cca65779df29b31a5ede80d284dc94476eb38883416fd` |
| `G3b-fix2-green-n1` | `bc5fa0c41800770b87ea0fa2c3fadf51117fb66d8474da84cbe92ee9582d8ef7` | `9125e6a059187bac2e202c7b7ed407bc709d5ebdd8edc0abf07c61fe72d95d0b` |
| `G3b-fix2-affected-final` | `b4611789926f42c2935845503a9c7ffda6f5312f3a578536b18d894555fc6ca4` | `ff6c0b93324783f4f8abfffdeefae9c042157f0db47a45e9e5440855f83a1f17` |
| `G3b-fix2-portable` | `11737a2f6acbad2257b57db9f3596c7e63a63208953c9476a4409ebb0498ac5c` | `6918bc401edb1a94782eaec5a6e0b41827ede46b799daef8e079fe763b794210` |
| `G3b-fix2-original-objects` | `bb98e27991710a0a636e8b68eab483b9b25e7af0b16711baa7d6cf097347bed2` | `f5d1a6dc26a8a977692cf94b665c0724d251a8d7dded350edfc4b602c415c3f3` |
| `G3b-fix2-missing-store` | `b7be33b37da913bf62cfb91cdeef20adce2cd4353dc6255dad2b716091c27724` | `d4616e3534f630974efa193638444dbe7b06e2dbaffad1d26065a7fcec1d2bbb` |

Recorded execution details and identities are corroborated by the bound executor report at lines 207–265 and main's verified capture handoff. Existing logs/captures were neither regenerated nor overwritten.

Not run in this review: N1 tests again, affected suites again, the three CLI modes again, G3a/full3196, full build/lint/CI, OCR/render/source acquisition, original-page reinterpretation, or a new independent runtime diagnostic. No concrete new doubt remained that justified duplicating those checks. Historical full3196 and fix1 affected47 are not substituted for fix-version full CI.

Residual scope boundaries remain unchanged: structural synthetic crop tests do not prove new original crop/render acquisition; the six existing original full-page objects are not new evidence; historical tool-provenance flags and semantic/source gaps remain unresolved outside N1. This review does not issue a receipt, approve installation semantics, promote Fit behaviour or authorize publication. The pre-existing local docs-audit EISDIR limitation remains disclosed; main's final exact-head gates must not silently treat an unrun gate as PASS.

Only this new report was authored. No isolated diagnostic file was needed. No implementation, plan, Git state, prior audit, execution report, evidence or capture was written.

Final read-only identity verification at `2026-09-15T03:25:16.116Z`: actual exit **0**, all 17 file byte lengths/hashes, both package hashes, unchanged prior audits, HEAD and branch match. The report's advisory JSON schema validation also exited **0**. For completeness, the first final-check attempt exited **1** because this auditor's inline helper used `entry.path` instead of the freeze's `entry.file`; it failed before checking the files, made no writes, and was corrected only in the transient read-only command. This was not an implementation/test failure or a frozen-file mismatch. Final report SHA is delivered separately to avoid self-hashing.

## Advisory patch-risk record

The patch-risk and completion-evidence skills separate code approval from merge authorization. The advisory `hold_for_evidence` below refers solely to main's outstanding exact-head CI gate; it is not a request to fix approved code or reopen F1/F2/F3.

```json
{
  "schemaVersion": 1,
  "patch": {
    "repository": "/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline",
    "sourceType": "patch_file",
    "base": "frozen-v2 over c83aa475d892e5bdb8bc7f65a0cee4cb05292a50",
    "head": "uncommitted frozen-v3; N1/fix2 scope only",
    "changedFiles": [
      "docs/architecture-v3/execution/G3b-independent-rereview-v2.md",
      "docs/architecture-v3/execution/G3b-router-canaries.md",
      "docs/superpowers/plans/2026-09-13-architecture-v3-evidence-foundation.md",
      "src/domain/architecture-v3/extraction-region-observation.mjs",
      "tests/architecture-v3/region-router.test.mjs",
      "tests/fixtures/architecture-v3/profile-canaries/manifest.json"
    ],
    "sha256": "7bc4a4387831fa6de7ec7e7443d20841529aee30f6fa7c2e447457930c45d6d8"
  },
  "recommendation": "hold_for_evidence",
  "workflowLabel": "hold_for_evidence",
  "impact": { "rating": "moderate", "rationale": "The shared observer affects both structural profile selection and routing; unsupported kinds must not acquire evidence meaning." },
  "regressionLikelihood": { "rating": "low", "rationale": "Closed raw-kind mapping, supported-only page context, unchanged callers and five recorded N1 test groups support this narrowly scoped repair." },
  "regressionProtection": { "rating": "partial", "rationale": "Main-verified frozen-input affected26 and three CLI modes are available. Full exact-head CI is a later main-owned merge gate, not a current PASS.", "exactHeadChecksPassed": false },
  "recoverability": { "rating": "easy", "rationale": "Uncommitted, local behavioural change; no migration, persistent evidence write or release in the reviewed repair." },
  "confidence": { "rating": "high", "rationale": "The original N1 path and shared callers were traced against the immutable directed diff; confidence is scoped to N1, not a fresh whole-repository audit." },
  "applicability": { "status": "confirmed", "rationale": "The v2 fallback is replaced at the existing shared observer entry used by both callers." },
  "statusQuoRisk": { "rating": "moderate", "rationale": "Without the fix, rehashed unknown or missing raw types can become structured text and lose the index axis limitation." },
  "autoMergeExclusions": ["architecture_specific_rollout", "other"],
  "affectedRuntimeRoots": ["inspectExtractionRegions", "selectDocumentProfile", "routeExtractionRegion"],
  "materialBoundaries": [
    {
      "id": "raw_kind_identity",
      "invariant": "Unsupported raw types retain identity as incomplete/unsupported without fabricated structural meaning.",
      "runtimeRoot": "inspectExtractionRegions",
      "counterexample": "Unknown, missing, non-string, malformed, prototype-name and derived-signal values with otherwise valid raw identity.",
      "legitimateControl": "BDP /0/47 index remains selected/MinerU with AXIS_OR_LEGEND_GAP.",
      "result": "supported"
    },
    {
      "id": "neighbour_context",
      "invariant": "Unsupported regions remain visible but cannot donate page context or blanket-reject supported neighbours.",
      "runtimeRoot": "inspectExtractionRegions",
      "counterexample": "Unsupported blocks with dimension text or split-column geometry are excluded before page-context calculation.",
      "legitimateControl": "Mixed BDF page retains usable supported /0/15 while unknown /0/14 remains incomplete.",
      "result": "supported"
    },
    {
      "id": "shared_replay_status",
      "invariant": "Neither direct selection nor routing trusts caller-forged inspected status.",
      "runtimeRoot": "replayInspectedRegion",
      "counterexample": "Serialized unsupported region with status changed to inspected fails core replay equality before either caller proceeds.",
      "legitimateControl": "Serialized supported neighbour remains selectable and routable through the same replay.",
      "result": "supported"
    }
  ],
  "validation": [
    { "name": "Independent frozen17/package identity and snapshot-prefix checks", "status": "passed", "protects": "Binds this scoped review to preserved v2 and current frozen v3 bytes." },
    { "name": "Independent directed N1 source and caller review", "status": "passed", "protects": "Closed raw-kind decision, retained identity, context isolation and shared replay." },
    { "name": "Recorded executor N1 RED/GREEN", "status": "passed", "protects": "Intended RED assertion failures with a passing index control, followed by five passing fix groups; not rerun by auditor." },
    { "name": "Main-verified final affected26 and CLI modes", "status": "passed", "protects": "Frozen-input affected coverage and unchanged portable/original/missing-store boundaries; not full CI." },
    { "name": "New independent runtime diagnostic", "status": "skipped", "protects": "No concrete new doubt warranted duplicating the captured tests." },
    { "name": "Full exact-head CI after first commit/PR", "status": "unavailable", "protects": "Mandatory main-owned whole-branch merge gate; old full3196 is not a substitute." }
  ],
  "unknowns": [
    { "summary": "Full CI result for the eventual exact committed/PR head is not yet available in this uncommitted scoped review.", "decisionCritical": true }
  ],
  "evidencePlan": [
    {
      "question": "Does the exact commit/PR head containing the reviewed v3 change pass all required full CI gates?",
      "action": "Main runs and checks the complete required CI after first commit/PR, verifies version binding, and owns final acceptance/release. Auditor does not run or initiate it here.",
      "outcomes": { "same_reviewed_version_all_required_checks_pass_and_main_accepts": "merge", "new_relevant_failure_or_behavioural_change": "revise", "not_run_or_version_not_bound": "hold_for_evidence" }
    }
  ]
}
```
