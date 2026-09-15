# G4a — immutable exact-product Claim V3

**Task/status:** G4a / REVIEW_REQUIRED. This is executor self-test evidence,
not an independent audit, source approval, receipt, review decision, or Fit
promotion.

## Frozen scope

- **Worktree / branch / base:**
  `/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline` /
  `codex/architecture-v3-g4a-claims` /
  `34e7ae033c63bd2fb96d74d313e5d4c540f42b89`.
- **Pre-existing dirty checkpoint:** only the main-owned canonical plan was
  dirty; its observed SHA-256 was
  `2c6b76c242617cd7d7a9f9438eb95165d9a7f5e895355bb3ef0f80e152cbeef8`.
  It was not edited.
- **Written deliverables:**
  `src/domain/architecture-v3/evidence-claim-v3.mjs`,
  `tests/architecture-v3/evidence-claim-v3.test.mjs`, and this report.
  The local command capture is the permitted G4a-prefixed SDD scratch artifact:
  `.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/G4a-command-record.md` (local-only evidence).

## Implemented contract

`createEvidenceClaimV3` constructs a deeply frozen schema-3 Claim with the
supported codec version and a SHA-256 Claim ID over the closed payload excluding
`claimId`. `validateEvidenceClaimV3` reconstructs and rejects unsupported or
missing codec versions, non-canonical stored representations, extra keys, and
ID drift.

The constructor reuses the strict V3 codec, `requireV3Semantics` /
`normalizeV3FieldValue`, `validateEngineeringContext`, and
`validateEvidenceAnchors`. `validationInputs` is replay-only and never retained
in the Claim. Source representations are closed to `ordered_dimensions`,
`named_scalar`, `named_range`, `boolean_statement`, and
`not_applicable_statement`; only ordered dimensions carry `axisOrder`.

`FINITE_OFFICIAL_RELATION` retains sorted, unique structural reference IDs and
named exact models, but grants no source authority. G4b must still replay and
bind the complete normalized G3a proof closure and original-source evidence.
Unknown material raises the typed `UNKNOWN_VALUE_CANDIDATE_GAP` instead of
creating a null-value Claim.

## Input identities

| Input | SHA-256 |
| --- | --- |
| G4a task brief | `8ee50f6211e02966965ba0905882a1e39822012af2fa5a22a0c5d239af667f29` |
| V3 design | `bf126bbaaed6ce62d57aa71118a9d7cc0e253fdfd46eab9de242dffde96c6367` |
| Product Core Brief | `9be84a660f55c998cf9c4b7999d0461609a66ed43abc4225af8aed9052781719` |
| Terra/Max execution protocol | `26c1607f2a81bfd021325114158b35bbf6ab1a961c8cd38da39e119538e469e0` |
| strict canonical codec | `9bdf42c479827662497e1cf74c1ffd13a13d85085675c024c5809dd69647d451` |
| V3 semantics / context / anchors / lineage | `5b096ae9b2ef154e63b108bc19adcc6803eb8bb2e1dfe2db660c8b39f90be807` / `99a4088a0b5e6499e1bb284bb1236a4c3ee47212d176feb619546071daf9b893` / `19f76808cf5886cf397af31429fc3c7c8e5e497b5e912b8ba3b2dd999286524c` / `bb375d5a809d3b4137a79e526b21980a1a73ea5d49961c6d73472facd9660eb0` |
| field dictionary / applicability matrix / V3 overlay | `69c1dac30edb4b736777592eb70be541f7aa99fbe7e4f0982c6be5b573291d03` / `96182572d9d8da3aa6b6bb688dbf1cdbb55724e8252f4493722620aadba1a80f` / `b08b15a0c9134231f280ae03b1919409e566f62784031cc736897cc6e2554b44` |
| package manifest / lock | `9b317c68418d69ae2ca01dac7bfb797cf0d236233ffc604e156a3a25f4d550f1` / `ad45d58a7bf0e4c88a0b26edc9c73100810358286f2f39354b978bc25238d0e7` |

The portable fixtures compiled semantic policy SHA-256
`716e6f13199569c5b35c1c3525ef383e71fa6ed18e7b5c396aa3cc0d43ce0df8`.

## Output identities

| Output | SHA-256 |
| --- | --- |
| Claim implementation | `6d437558e4084cd98f3d5084ad420adf429b7401df43b256ff51a457fb695ac7` |
| Focused test | `53ebc5744d1134084397ae42c256c4a0f97e4ea5780c81cd65449df6be4c5fff` |
| command record | `03ddd70e3a85092964fe6109bb8e0992ca0ec841fea4861b360598c9e706447c` |

## TDD and checks

- Behavioural RED→GREEN cycles covered fixed Claim construction, named ranges,
  ordered tuples, boolean/N/A, and finite relation references. The initial
  missing-module failure is separately recorded and was not treated as a
  behavioural RED.
- Final focused command: exit **0**, **10 pass, 0 fail, 0 skipped, 0 cancelled**.
- Final `npm test`: exit **0**, **3,216 pass, 0 fail, 0 skipped, 0 cancelled**.
- Final `npm run lint`: exit **0**.
- Final `npm run validate-schema`: exit **0**; `pages=2330`, `blocks=6145`,
  `errors=0`. It was validation-only; no active dataset or schema data changed.
- Scoped syntax check and `git diff --check`: exit **0**.

The focused suite proves closed value unions; missing/invalid range meaning;
source representation shape; source-to-canonical equality; anchored evidence
and unresolved references; duplicate IDs; strict JSON hazards without getter
execution; set sorting versus tuple order; hash-relevant identity changes;
unknown candidate gaps; and stored-version/ID/migration bypass rejection.

## Residual boundary and handoff

No original PDF/OCR object was read or processed; no source was approved; no
receipt, persistence record, lifecycle/publication state, active runtime import,
or Fit behaviour was added. Real-source canary: **NOT_RUN by design**. The next
authorized action is a different Terra/Max agent's read-only audit of this
frozen diff; G4b source replay and complete proof-closure binding remain out of
scope.

## Evidence addendum — 2026-09-15 final verification

**Status remains REVIEW_REQUIRED.** This is an evidence-only correction, not
new implementation, reconstructed TDD, an independent audit, or release
preflight. The original report text above is preserved except for converting
its ignored-directory Markdown link to plain local-only path text. Main owns
the subsequent scoped documentation check; it was not run in this correction.

### Historical evidence and preservation

No applicable complete raw capture was recovered from the G4a SDD artifacts,
matching report/log files, or prior command output. The previous full-suite
command was `zsh -o pipefail -c 'npm test 2>&1 | tail -n 90'`, without a durable
full-output capture. The existing `real-canary-inputs-npm-test.log` contains
3,145 tests and no G4a focused test, so it was not reused. Historical RED and
prior final-check entries remain **summarized evidence only**; the new logs
below prove the current final state and do not retroactively prove RED.

Before the link edit, the original report was copied byte-for-byte into
`.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/G4a-original-handoff-20260915T050620Z.md`
and made read-only (`0444`): **5,315 bytes**, SHA-256
`e1c698046ee1f6de8283dfaf97a645a912f201106bf7db669589457a9e3e190f`.
The original `G4a-command-record.md` was not edited: **1,831 bytes**, SHA-256
`03ddd70e3a85092964fe6109bb8e0992ca0ec841fea4861b360598c9e706447c`.

### Fresh final verification, not historical RED

Each command below ran exactly once during this correction, between
`2026-09-15T05:06:20.749Z` and `2026-09-15T05:07:12.149Z`, using Node
`v22.23.1` and npm `10.9.8`. The capture helper used direct child stdout/stderr
file descriptors, no shell pipeline or output truncation, and recorded the
actual child's exit code, signal, arguments, cwd, timestamps, byte counts and
SHA-256 identities. The capture helper itself exited **0**.

| Run | Exact command | Child exit | Result |
| --- | --- | --- | --- |
| focused | `node --test tests/architecture-v3/evidence-claim-v3.test.mjs` | `0` | 10 pass; 0 fail/skipped/cancelled/todo; 178.741 ms |
| npm-test | `npm test` | `0` | 3,216 pass; 0 fail/skipped/cancelled/todo; 49,327.231333 ms; includes existing V3 syntax check |
| lint | `npm run lint` | `0` | Existing lint command completed |
| validate-schema | `npm run validate-schema` | `0` | 2,330 pages; 6,145 JSON-LD blocks; 0 errors |

All four child signals and spawn errors were `null`. No baseline failure was
observed in these checks.

The existing schema CLI normally writes `reports/schema-validation.json`.
To keep this correction within its write scope, that one command ran in the
private SDD directory `G4a-final-verification-20260915T050620Z-schema-workspace`,
using byte-identical copies of `package.json` and `scripts/validate-schema.js`
and symlinks to the original `index.html` and `pages` inputs. Its generated
report stayed inside that directory. All 2,330 HTML input hashes were checked
before/after; the original `reports/schema-validation.json` remained unchanged
at SHA-256 `19fb21884c2e5cf52a73a3c0b968f9f2ee6bef4ceeb75ca8d5d33f50f8748375`.
This is the existing schema check with an isolated output location, not a
dataset/schema edit or a different validator.

### Durable local-only capture and input binding

All paths in this subsection are local-only evidence under
`.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/`, not portable
repository Markdown links. No scratch artifacts or raw logs were committed.
The common filename prefix is `G4a-final-verification-20260915T050620Z`.

- Capture manifest: `G4a-final-verification-20260915T050620Z-manifest.json`,
  SHA-256 `ac7ebb0bb0285eaaee9b54cf1d4caf65e0b0ecae33f1a74a2ee254c03613971d`.
  Its identity is also saved in
  `G4a-final-verification-20260915T050620Z-manifest-sha256.json`.
- Current source/test/policy/dependency inputs:
  `G4a-final-verification-20260915T050620Z-inputs.json`, SHA-256
  `8aed68e8bcf4bbd07d50aee45e4ff9495c386bfa6e5fd8fb862a654e58eb8c03`.
  Every command's metadata records exact before/after input identities; all
  were unchanged. This includes the frozen Claim source/test, reused codec
  and validators, three policy files, package/lock and validation scripts.
- Schema page/copy identities:
  `G4a-final-verification-20260915T050620Z-schema-inputs.json`, SHA-256
  `bc121fe0fe8d3669a9e38b3dafe0cf4c0040f2e3e32fa9dfe9bd5b31f74f735b`.
- Capture helper: `G4a-capture-final-verification.mjs`, SHA-256
  `90e157abb93bd602be15d708aed8207f548397cfbb024314eb4f5c7ed4d01eea`.

Fresh source, test and policy identities were:

| Input | SHA-256 |
| --- | --- |
| `src/domain/architecture-v3/evidence-claim-v3.mjs` | `6d437558e4084cd98f3d5084ad420adf429b7401df43b256ff51a457fb695ac7` |
| `tests/architecture-v3/evidence-claim-v3.test.mjs` | `53ebc5744d1134084397ae42c256c4a0f97e4ea5780c81cd65449df6be4c5fff` |
| `data/architecture-v2/policies/product-data-field-rights-dictionary.json` | `69c1dac30edb4b736777592eb70be541f7aa99fbe7e4f0982c6be5b573291d03` |
| `data/architecture-v2/generated/installation-evidence-applicability-matrix.json` | `96182572d9d8da3aa6b6bb688dbf1cdbb55724e8252f4493722620aadba1a80f` |
| `data/architecture-v3/policies/semantics-overlay.json` | `b08b15a0c9134231f280ae03b1919409e566f62784031cc736897cc6e2554b44` |

For each run, complete streams are named `<prefix>-<run>.stdout.log` and
`<prefix>-<run>.stderr.log`; exact command/exit/input metadata is
`<prefix>-<run>.json`. The manifest binds all these files by size and hash.

| Run | Full stdout bytes | Full stdout SHA-256 |
| --- | --- | --- |
| focused | 2,267 | `1cf457b64915c5a9195acefa03d6b5f2f05d0360227dfdbd33f95e14979b2d5c` |
| npm-test | 736,037 | `9f25e9dbc1e30eca10cbc04e738a22c35ac3f1bed5105c0816b1a6982d7cbfe3` |
| lint | 209 | `4eb29efff98ecd28f4f305dec9c9fb83f6b8af44e31c46ebd35ae361f689f4ee` |
| validate-schema | 137 | `a3f3c67dc9f7b85d98b750e93b7b47d54e8f26656a9e942d7695312c5e8529dc` |

Each complete stderr file is **0 bytes**, SHA-256
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
Capture identities were re-read and verified after all children exited.
The main-owned plan, original command record, functional source/tests and
policy inputs were preserved. No auditor, Git operation, source approval,
runtime integration, installation, or downstream release check was performed.

The plan-preservation snapshot covers the capture interval only. Main's later
plan-only update to REVIEW_REQUIRED is outside the frozen functional inputs;
it was not reverted or retested.

## F1/F2 bounded correction — 2026-09-15

**REVIEW_REQUIRED.** Applied only the two corrections authorized by
`G4a-fix-brief.md` (SHA-256
`454f04649dc9f044fb6572533c49766c3c177a1a0dccaa07061b904bd5fbeccb`)
after reading the independent audit (SHA-256
`ced136a72710c41e0eaef8c3415c3f0e4641421ee8481ada257442bc7e3f0bf1`).
The audit verdict and all prior reports/captures were not rewritten.

- F1: finite relationship references now require `fa_product_relationship_`
  followed by exactly 64 lowercase hex digits. Factory and rehashed stored
  negatives cover opaque, uppercase, short, long, non-hex and wrong-prefix
  IDs; the positive case consumes an ID from the existing assertion producer.
  No relationship resolution, derivation eligibility or receipt was added.
- F2: the existing context validator accepts optional `product` and reuses
  its existing product/witness normalization and exact structural matcher.
  Named configurations, including unconditional, require one matching
  product/market/key/complete-condition witness; unrelated valid witnesses
  cannot substitute for that match. Claim factory and stored replay supply
  the exact subject. Legacy three-field calls remain shape-only. Null
  configuration and unknown datum/state remain valid without asserting runtime
  applicability; no resolver requirement, predicate matcher or policy was added.

### Fresh bounded TDD evidence

Complete stdout/stderr and actual child exits were captured before each fix
and after it, without pipelines/truncation. F1 RED's 12 failures were missing
expected exceptions. F2 RED's 34 failures were 18 missing Claim exceptions
and 16 tests for the not-yet-supported optional-product API. These are fresh
behavioral RED records, separate from the earlier summarized TDD history.

| Capture phase | Test files | Child exit | Pass / fail | Complete stdout SHA-256 |
| --- | --- | --- | --- | --- |
| F1-red | Claim | 1 | 11 / 12 | `81ae27abc0e8975424beda1b29de79e5eae8334b125f6d9849a597005e514341` |
| F1-green | Claim | 0 | 23 / 0 | `1783f724080b761e4e970ee85b963cc91d1d757be70f93529e3917c12a38f7cd` |
| F2-red | Claim + semantics | 1 | 49 / 34 | `d6c76ddd20afca563acbdeea217048900f0578b834bc2414380fce25c22620e6` |
| F2-green | Claim + semantics | 0 | 83 / 0 | `1fab635aacf22f33382b1d6e938008d73cf0b9017eff2f7721965aa63f5bfae5` |

The final command was `node --test tests/architecture-v3/evidence-claim-v3.test.mjs tests/architecture-v3/semantics.test.mjs`:
**48 Claim + 35 semantics tests**, no skips/cancellations/todos. The existing
V3 syntax checker, with explicit paths for the four affected `.mjs` files,
also exited **0**; stdout SHA-256
`42c43f25b3c044fe4fcbafc4522955ca1fabb0d7f27a36f25391edca8036bb35`.

### Updated frozen identities and local captures

| File | SHA-256 |
| --- | --- |
| `src/domain/architecture-v3/evidence-claim-v3.mjs` | `30b55f2fa23ac55eb91663f3e9cdf0621fffe7d49e3710f998bf1a08f49907a3` |
| `tests/architecture-v3/evidence-claim-v3.test.mjs` | `4562a2fb59a4104bb3dfbb31b2821bcfc96cc14cd6f49252d15481f926a9e1b2` |
| `src/domain/architecture-v3/engineering-context.mjs` | `8e5495aebecab28e42945f021fbeb35e98ac54a59bf6383605c417a09e3669ff` |
| `tests/architecture-v3/semantics.test.mjs` | `e4a3d02aa851e85127336ce7415a87cb1b775de3e62f4406bcf7cbb4b1da7736` |

Local-only evidence directory:
`.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/`.
`G4a-F1-F2-<phase>.json` records exact commands, child exits, timestamps and
before/after source/test/policy input hashes; corresponding `.stdout.log` and
`.stderr.log` files retain complete raw bytes. Every stderr is empty, SHA-256
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
`G4a-F1-F2-manifest.json` binds the captures and final inputs; its hash is in
`G4a-F1-F2-manifest-sha256.json`. The final non-Git diff/whitespace and original
report-prefix check is recorded with its actual exit in `G4a-F1-F2-diff.json`.
The pre-fix report is preserved as read-only `G4a-F1-F2-before-report.md`,
SHA-256 `5a7275765bd6441b4ea5507334588feb4b25ca22a25672109a640a470a5a40d9`.

No unresolved semantics decision remains within this correction. No full
`npm test`, lint or schema repeat was run; the earlier 3,216-test result proves
only the pre-fix source, not these new hashes. Exact-head whole-suite CI and
independent re-review remain pending with main. No data, receipt, main-plan,
auditor, Git, runtime, source-approval or release writes were performed.
