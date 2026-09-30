# G4b direct source binding and Claim receipt

Status: **R3 REVIEW_REQUIRED — STOP WRITING; AWAITING INDEPENDENT MEITNER RE-REVIEW**.
Current results and identities are in the appended **R3 — complete original
table-range accounting** section. Independent v3 closed R1-1 but opened R2-1;
its CHANGES_REQUIRED verdict remains pending independent R3 re-review.
The R2 record below is historical. R2 changed
only the allowed binding source, focused tests, this report and new private
`G4b-r2-*` executor artifacts. Independent v2 found **F1 NOT ADDRESSED;
F2/F3 ADDRESSED**. The R2 results do not replace that independent verdict or
constitute self-acceptance. No NEEDS_CONTEXT remains at handoff.

The following R1 record is preserved as history. Its report-only checkpoint
was **2026-09-23**, after the final execution capture of
**2026-09-15**. This update changes only this report; no source/test edits or
test-suite reruns were made at that earlier report-only checkpoint. This is an
implementation handoff, not a source acceptance, rights grant, review
admission, Fit result, publication event, or release claim for Architecture V3.

The task brief, main's `G4b-main-review-ruling-v1.md`, and
`docs/architecture-v3/execution/G4b-independent-audit.md` remain the governing
records for R1. The unchanged task brief, approved `G4b-r2-brief.md`, main's
`G4b-main-review-ruling-v2.md`, independent v2 report and approved
`G4b-r2-offset-boundary-note.md` additionally govern R2. The independent v1/v2
verdicts are **CHANGES_REQUIRED**; all repair results below are implementer
evidence, not a replacement independent acceptance.

## Scope and preserved owners

The implementation is based on
`7b0764b0c5b099ed19b8af9b46860408c4121083` and adds only the G4b
source-binding producer, named receipt consumer, focused tests, and this
report. It changes no original object, historic receipt, profile, registry,
router, source verifier, installation verifier, policy, public data, runtime
path, plan, or release state.

| Item | Bound identity |
| --- | --- |
| Compiled V3 semantics | `716e6f13199569c5b35c1c3525ef383e71fa6ed18e7b5c396aa3cc0d43ce0df8` |
| V2 field/rights dictionary canonical identity | `899195b34e31a00a288de0ec10aac2406315cd3ba3ca95ff9a2455da16d01d28` |
| G3b profile policy owner | `7eda21ad3693e8934808d4ff7e38203ba4b97e93c61d54a7fd8f52af270294a8` |
| G3b brand registry owner | `cbb4dac77938ae0f9bf40278325b42a33b0e61c6403a5212eff9e9a05e7dbf0d` |

`caseInput` is only an immutable container hash/path/strict-pointer locator.
The selected owner supplies canonical product ID, brand, model and category;
caller product or market fields are rejected. Market is derived from replayed
discovery evidence when available, otherwise from the existing
`isOfficialBrandMarketUrl` policy. A source without that market proof fails
closed for a market-scoped Claim.

## Binding and Claim-receipt contract

`verifyAndBindSource` has two isolated adapters:

- Manufacturer input replays the selected immutable source through unchanged
  `verifyAttestedResolutionArtifact`, including original, derived, fallback and
  discovery bytes.
- Standalone installation input replays its own immutable installation receipt
  through unchanged `replayInstallationFieldReceipt`, plus its original PDF
  magic/hash/size, MinerU object, index provenance and G3a byte closure. It has
  no manufacturer W/H/D prerequisite.

Both adapters derive facts from replayed records and exact anchored source
representations. Unproved multi-model rows, mutable source records, object-byte
drift, dangling anchors, unsupported field semantics, self-consistent caller
policies and accessor input fail with typed errors. Only byte-resolved
`text_span` and `json_pointer` fragments are accepted; other locator kinds
remain an explicit fail-closed candidate gap rather than a new verification
grammar.

The full normalized G3a closure has a distinct
`g3aProof.g3aProofSha256`. It is not a profile digest. A fact obtains
`extractionProfileSha256` only when a closed replay request reads the frozen
G3b profile/brand owners, resolves the owner brand, selects a profile, routes
the existing region and proves that region is a G3a JSON-pointer fragment under
the same original source root. No caller profile ID, profile SHA or per-source
profile is accepted.

G4a already defines `Claim.evidence` as exactly
`{ sourceArtifactSha256, anchors, relations }`. The new receipt module makes
one private closed projection of the replayed full `fact.evidence` to that
three-key shape, then compares validated Claim evidence to the projection. It
does not add a grammar or alter G4a/G3a/source/profile owners.

The complete proof remains required and independently bound: it stays in
`fact.evidence`, receipt input/output `anchors`, and `binding.g3aProof`, with
`normalizeAnchors` retaining full-equality. `g3aProofSha256`, toolchain/profile
equality, validation inputs, byte replay, and serialized source replay all use
the full binding closure. Thus a Claim is only the G4a reference projection; it
cannot replace, hide, or weaken the complete original/provenance/schema/codec
proof.

`createDirectClaimReceipt` and `verifyDirectClaimReceipt` re-run the stored
binding using `readObject`; a self-rehashed serialized binding is not trusted.
The named envelope is `EvidenceClaimReceipt`, schema 3 and the V3 codec. Exact
subject, field, value, semantics, context, source representation,
applicability, full anchors, G3a digest, profile identity and policy projection
must reproduce from the fact. Existing schema-3 manufacturer receipts remain a
different contract.

Rights input is only a closed, independently byte-checked reference request.
The output emits every existing dictionary action with
`providerId/sourceId/fieldId/actionId` and `unknown_blocked`. It grants no
action from source type, official domain, parser, receipt history or caller
metadata; no public-use or CurrentEligibility mechanism is added.

`UNKNOWN_CONTEXT` is recursively frozen before either adapter exposes it. The
focused regression covers both adapters: nested `conditions` and
`operatingState` mutation throws, and fresh plus replayed bindings remain
identical after the attempt. This preserves unknown context; it does not turn
an unknown condition into a known one.

## R1 bounded audit repairs (historical; F1 reopened by v2)

### F1 — replay relations from the actual source structure

The private `replaySourceRelations` check in the new binding module now uses
the already-replayed original HTML or MinerU object, not a caller witness's
self-description. Manufacturer MinerU selection reuses
`inspectMineruContentListV2` and the historical page/bbox/fragment identity;
installation selection uses its own replayed receipt's page/item locator.
Relation endpoints must be byte-resolved `text_span` fragments directly on
that selected source object. A caller-derived table, even under the same PDF
root with all hashes recomputed, cannot replace those endpoints.

The supported relation shape is deliberately narrow:

- Exactly one `exact_model_scope` relation from subject to label, and two
  `same_table_row` relations from label to value and value to unit. Every
  emitted relation is checked; additional asserted relations are rejected.
- An explicit HTML table with one direct, plain-text caption equal to the
  immutable owner's exact model, one two-cell scalar row, and at most the
  ordinary `Dimensions` / `Value` header. Label, number and unit spans must
  resolve to that exact row, consuming the complete scalar cell.
- No inferred headings, multi-model caption, intervening model/configuration
  heading, extra scalar row, nested/merged table, hidden-node layout, encoded
  scalar entity, range/prefix-number truncation or unsupported markup.
- MinerU must actually contain a table with `content.html`. Its raw JSON must
  reproduce standard `JSON.stringify` encoding (compact or 2/4-space indent,
  with outer whitespace allowed), and the selected HTML string literal must
  be unique. Other encodings or duplicated/copied literals remain a candidate
  gap; an equal string in metadata cannot stand in for the selected JSON path.

The installation adapter additionally passes the exact source row quote to
the unchanged `createInstallationFieldReceipt` owner to recheck field/value
semantics. That local check is discarded, not stored or issued as a replacement
receipt. It prevents a same-valued Depth row from proving Width merely because
the broader historical quote includes both. Original receipt replay remains
mandatory and independent of any manufacturer receipt.

Unsupported relationships return `SOURCE_RELATION_CANDIDATE_GAP` for the
requested Claim. They do not classify the whole PDF as bad, erase a historical
PASS, quarantine a source, or authorize new OCR/receipt repair. There is no
audit-tool/hash blacklist, new dependency, general table/relationship engine,
or change to the existing G3a/parser/profile/policy owners.

### F2 — decimal lexical recognition without precision changes

The decimal regex literal's doubled escape was corrected to recognize a
literal decimal point. Tests exercise the actual binding factory in both
adapters, not a copied helper or VM:

- Manufacturer: explicit `59.8 cm` normalizes to `598 mm`, while the source
  representation remains `59.8 cm`. The existing V2 manufacturer's integer
  canonical-mm requirement is unchanged.
- Installation: policy-supported `waterConnection.hoseReachMm = 598.5 mm`
  survives binding, receipt construction, JSON round-trip and replay.
- `closedEnvelope.widthMm = 598.5 mm` still rejects with
  `FIELD_SEMANTICS_MISMATCH` under the existing whole-mm rule; it is not rounded.
  Exponent, sign, leading-zero, repeated-dot and backslash numeric tokens are
  rejected through the actual manufacturer factory.

No precision/bounds/unit policy, range handling, OCR repair or inferred-unit
rule was added. The failed fractional-width positive attempt is retained and
distinguished from the supported fractional-hose regression below.

### F3 — correct the capture reference

The old v1 manifest reference omitted its final `c`. Its correct 64-character
SHA-256 is
`57dabc8028df0ef3d592dbb49e3c3d94ebd8a1cdad43b26d3ce4b6b48599fb0c`
for `G4b-final-verification-20260915T105417Z-manifest.json`; its input snapshot
SHA-256 remains
`72df929096df0bfe5bfeccb5b08392eae035bc67600158aef35b85b753f0f9de`.
The complete v1 19/3290 captures remain historical, pre-repair evidence, not
proof that F1/F2 were absent. No old capture was rewritten. The historical R1
repair manifest and source identities are recorded below; current R2 identities
are in the appended section.

## R1 positive path and receipt accounting (historical)

The supported positive is now an in-memory synthetic Electrolux washer product
sheet with an actual HTML table in byte-bound MinerU JSON, not the old Beko
paragraph merely renamed as a table. It uses independently created
`installation_field_receipt_v1` inputs, synthetic PDF/MinerU/index bytes, full
G3a closure, the existing official AU-policy verifier, and the existing
`electrolux-au-washer-table-v1` profile, SHA-256
`9791f3b295cefaa62840b610ad156a9be8223747eb10ae4ce6aac28b3369b4e2`.
The original Beko paragraph is retained as a negative. No profile was changed.

Three distinct synthetic receipt identities complete
`createDirectClaimReceipt -> JSON serialize/parse -> verifyDirectClaimReceipt`:

| Scenario | Receipt ID |
| --- | --- |
| Table width | `bd1f6483796bc571e7623eaeddcf028f85271b068ab48d29c10d40d5158e4204` |
| Fractional hose reach | `c8abff40245ce897f838668555d3d2217b19085ad249e8f95b06ffba203fe91c` |
| Truthful rehashed row witness | `157efe959d05ec42a437e035ed465dea1eaa27089c2f4160b2548801e479f248` |

The third preserves the actual width row but changes the complete witness
closure, yielding a distinct binding/receipt identity, never the unchanged old
binding. Thus this is three receipt IDs across two source/field scenarios, not
three independent real sources. Explicitly `required` applicability and UNKNOWN
context are synthetic test inputs, not inferences about real evidence. No fake
`VerifiedSourceBinding`, `verified: true` stub, real PDF extraction, live source
acquisition or real-source upgrade is claimed by these portable tests.

| Classification | Count | Meaning |
| --- | ---: | --- |
| Portable synthetic constructed `EvidenceClaimReceipt` identities | 3 | In-memory success paths above; repeated constructions are not counted as new sources. |
| Real historical source replays represented in focused tests | 3 PASS | BDF1620W manufacturer plus RF605QZUVB1 and DW60UT4I2 installation receipts; not new G4b bindings. |
| Real G4b bindings constructed | 0 | Historical replay success does not settle source relationships, complete closure, applicability or profile gates. |
| Real constructed `EvidenceClaimReceipt` | 0 | No real source crosses all G4b receipt gates. |
| Independently reviewed/admitted new receipt | 0 | Implementation audit is not receipt review admission. |
| Accepted receipt | 0 | No acceptance workflow ran. |
| Public receipt | 0 | No publication workflow exists or ran. |

The portable success path also rejects mutations to source bytes, Claim
`sourceArtifactSha256`, Claim anchors, Claim relations, full receipt anchors,
profile identity, policy, rights request, and proof-only metadata. The latter
mutation leaves the three-key Claim projection unchanged but causes original
source-binding replay to reject; it cannot validate as the old binding.

## Real-source disposition

| Input | What replayed in G4b tests | Direct receipt disposition |
| --- | --- | --- |
| BDF1620W manufacturer source | Actual original/derived/fallback/discovery bytes replay PASS under the existing historical owner. | Its paragraph cannot support the asserted table-row relation: typed candidate gap, no G4b binding/receipt. Legacy applicability/context remains unknown. The earlier profile-selection diagnostic is not source-relation acceptance. |
| RF605QZUVB1 rear 30 mm, p2 item5 (`inst_receipt_7a78ab6806465717a18f37f8`) | Actual immutable receipt, PDF magic/hash/size, MinerU JSON and matching historical MinerU index replay PASS. No G3a closure was fabricated. | Candidate only: complete G3a closure is absent; frozen profiles contain no compatible Fisher & Paykel installation-document owner. |
| DW60UT4I2 width 597 mm, p1 item9 (`inst_receipt_a13c0761a515ef294f80de6e`) | Actual immutable receipt, PDF magic/hash/size, MinerU JSON and matching historical MinerU index replay PASS. Height remains the 857–917 mm range. | Candidate only: complete G3a closure is absent; frozen profiles contain no compatible Fisher & Paykel installation-document owner. |

The real installation index owner is
`data/architecture-v2/reviews/automated/historical-mineru-backfill-audit.json`,
matched by `sourcePdfSha256`; it was not fabricated. Separate bounded
Westinghouse HTML and Fisher & Paykel table fixtures are **synthetic** factual
candidates with no compatible frozen profile, not additional real-source PASS
or receipt counts.

The real-source gaps are deliberately unchanged. In particular, no real
applicability is promoted to `required`, no market/profile inference is added,
and no historic receipt is upgraded or newly accepted. Unknown title/document
role is not strengthened from parser/source type; the RF legacy title's trailing
metadata `2` is not newly asserted literal source text. No new OCR, original
inspection claim, historical receipt reissue, CurrentEligibility, public right
or Verified Fit result is part of this repair.

## R1 raw RED/GREEN repair evidence (historical)

Every row below names an immutable capture family. Its manifest filename is
`G4b-repair-<run>-manifest.json`; the corresponding `-focused.stdout.log`,
`-focused.stderr.log`, command metadata and input-hash snapshot remain in the
private task diagnostics. These are automatic complete child-process captures,
not reconstructed TAP. The run name does not determine its result.

| Run | Actual result | Classification and observed behavior | Manifest SHA-256 |
| --- | --- | --- | --- |
| `red-20260915T113533584Z` | exit 1; 0/7 pass | Two genuine F1 failures: paragraph and fully rehashed false witness both report `Missing expected exception`. Five fixture/setup failures: four unsupported washer `freestanding` form-factor inputs and one fractional canonical-mm manufacturer input rejected by the unchanged V2 producer. Those five are not behavioral RED proof. | `cc433b1d6ef0aa410a5fe8e581a9968764b90021b9a04b1551529a5a678dcf11` |
| `red-20260915T113637478Z` | exit 1; 1/7 pass | Corrected structured positive passes on pre-fix code. Paragraph, fully rehashed witness, same-PDF wrong SKU and cross-row cases still fail to reject (four genuine F1 REDs). Both factory decimal paths reach `UNSUPPORTED_SOURCE_VALUE`; the width case alone is not proof of permitted fractional-width acceptance. | `714ff829febd5de4c01d8862d2c06a27dd3abd25e9f0c88c22159998dd5b1dac` |
| `green-20260915T113827152Z` | **exit 1; 6/7 pass** | Intermediate failed run despite its filename. F1 and manufacturer decimal cases pass; fractional installation width reaches the existing `FIELD_SEMANTICS_MISMATCH` whole-mm guard. Kept as a failed positive-fixture assumption, not GREEN and not a reason to relax precision. | `8a0c46a20a80b73f71f410d0d2c81654e4934807543a2860c743aa8e94ff47ec` |
| `red-20260915T114043222Z` | exit 1; 0/2 pass | Supported fractional hose through the real factory fails `UNSUPPORTED_SOURCE_VALUE` with the old decimal regex reinstated for this RED. Same-valued Depth-as-Width row also fails to reject. These are genuine behavioral REDs, not construction errors. | `a990fe010650a2fdbbcccbef46cd17e23f991b84395b5dedfe3c1985be62bb97` |
| `green-20260915T114123760Z` | exit 0; 27/27 pass | Source-row field semantics and supported fractional hose pass; fractional width remains an explicit rejection. | `ef9f29cec9c5bd2c9071d6895659f5c7c8eedc0c46ec467e208baf049a971fb1` |
| `green-20260915T114323127Z` | exit 0; 31/31 pass | Adds complete-relation, caller-derived-table, truthful-rehashed-binding and malformed-number regressions. | `7610ee9cb71b2619741dee977eac5519086b0d1da027a2ceba3034dc6b50606c` |
| `red-20260915T114526690Z` | exit 1; 0/1 pass | Intervening wrong-SKU heading incorrectly borrows an earlier exact caption: `Missing expected exception`. | `a0c93160e2b14ccababbc23065cf460e27d8173183e55e23814f6dd23ea9267c` |
| `green-20260915T114626579Z` | exit 0; 32/32 pass | Narrow single-scalar-row/ordinary-header scope rejects that unsupported heading. | `0bdf5fbf875f306cb6e0e8300973348a52a737a2008158cc35bdafe82304be2a` |
| `red-20260915T114851130Z` | exit 1; 1/2 pass | Noncanonical JSON encoding lets copied metadata impersonate the selected table string: genuine `Missing expected exception`. The refined two-table wrong-field case passes, exercising the exact-row semantic owner. | `36da9927306af4e476e63af3d55333574e4b19deda7a3861fcc38ecb88490ea4` |
| `green-20260915T114925356Z` | exit 0; 33/33 pass | Selected-string encoding/uniqueness boundary closes the metadata redirection; all focused regressions pass. | `a6690041828239158f38212826f4b528beb12577bbdd61e944c445de878970e0` |

Historical `G4b-green-007` and `G4b-red-008` TAP files remain **historical
diagnostic summaries / raw run evidence unavailable**. Their individual run
evidence is **INCONCLUSIVE**: complete original diagnostics/footer are missing.
They are not counted as complete TDD runs, and their observed failures are not
denied or retroactively relabeled. All earlier failures/captures remain intact.

## R1 final verification evidence and frozen identity (historical)

The repair final capture used direct child-process spawn with exclusive full stdout and
stderr files, real exit/signal/time metadata, all G4b source/test/dependency
input identities, and before/after invariance checks. It used a byte-identical
copy of the existing package/schema script in a private isolated workspace with
the original HTML inputs symlinked; the tracked schema report and source HTML
remained unchanged.

| Command | Result |
| --- | --- |
| `node --test tests/architecture-v3/direct-source-binding.test.mjs` | exit 0; 33/33 pass; 0 fail/cancelled/skipped; 10673.359042 ms. |
| `npm test` | exit 0; 3304/3304 pass; 0 fail/cancelled/skipped; 65025.616542 ms. |
| `npm run lint` | exit 0. |
| `npm run validate-schema` in isolated workspace | exit 0; pages=2330, blocks=6145, errors=0. |

R1 manifest: `G4b-repair-final-20260915T115218515Z-manifest.json`,
captured at `2026-09-15T11:53:37.516Z`, SHA-256
`bf91f8901047e0bb5869e79050d8cf6a62102144d0da5c1dee9f07350507d8ba`.
Its `G4b-repair-final-20260915T115218515Z-inputs.json` snapshot SHA-256 is
`28e742e72d5a5f286471bf9f541163ca8fff3d87b59563fceb864a53374dc93d`.

| Complete stdout capture | Bytes | SHA-256 |
| --- | ---: | --- |
| Focused | 8969 | `da13b5877231c091683f5cdc8a65b53281ebe2d2c4aad8fbf3253271274a5348` |
| Full suite | 757973 | `12bfba5f89ad55dc25b731a189cd732dd7fee051381705ef6da44ad24f2e48ff` |
| Lint | 209 | `4eb29efff98ecd28f4f305dec9c9fb83f6b8af44e31c46ebd35ae361f689f4ee` |
| Isolated schema | 137 | `a3f3c67dc9f7b85d98b750e93b7b47d54e8f26656a9e942d7695312c5e8529dc` |

All four final commands have `signal: null`, no spawn error and zero-byte
stderr. Outputs are complete raw captures, not tails or reconstructed TAP.
The full suite also executes the existing V3 syntax check. The capture records
unchanged source/test/dependency inputs, protected audit/old-capture files,
HEAD/index, tracked schema report and HTML inputs. The report and main-owned
plan are excluded from execution inputs; `reportWrittenAfterTests: true` marks
the separate reporting boundary, not a source-input drift.

| Frozen execution file | SHA-256 |
| --- | --- |
| `src/domain/architecture-v3/verified-source-binding.mjs` | `69373ebea2fdc42509a2d0692d1c0b2a486f4ab76f509e1753044338a09a4282` |
| `src/domain/architecture-v3/evidence-claim-receipt.mjs` | `a08e82f80f2649a8e0a92d7942b8e4d2bf1fe1dfbdee64f6d5d925dced11f95f` |
| `tests/architecture-v3/direct-source-binding.test.mjs` | `cc63d3e73b1e38f6bf1f0e04a61eea43f03b08712b0b3a8a3db1cfe04f3a07fc` |

The receipt consumer is byte-identical to the v1 audited consumer; repair code
changes are confined to the new binding producer and focused tests. On
2026-09-23 main reported all 263 manifest-referenced files still byte/hash
identical. At this report-only checkpoint the implementer rechecked the
manifest, three execution-file identities and raw capture references; no
unchanged full/focused/lint/schema command was rerun. This report is a later
documentation correction, not a newly dated test result.

A separate post-run `G4b-repair-seal-handoff.mjs` diagnostic failed by comparing
the TAP top-level plan with total tests despite a nested suite. It produced no
handoff seal. That helper failure does not replace or invalidate the complete
final command captures; no successful seal artifact is claimed here.

## R1 handoff boundary (historical)

**STOP WRITING / REVIEW_REQUIRED.** Implementation and this report are frozen
for the different Meitner auditor's re-review of the whitelisted diff and
immutable capture set. No independent acceptance is asserted by this report.
No source, test, plan, audit, old capture, original/data object, profile, policy,
HEAD or index was changed during the 2026-09-23 report-only closeout. Do not
treat this handoff as authorization to issue a Claim, change a profile, upgrade
a historic receipt, grant rights, publish data, commit, merge or deploy.

## R2 — single-parse semantic/location convergence (historical; R2-1 opened by v3)

### Repair and exact scope

The independent v2 R1-1 bypass was reproduced through the actual factory:
orphan wrong-model `th` and `td` cells were omitted from the old
location-enabled htmlparser2 row topology, while the existing parse5 owners
repaired them into implicit rows. Successful byte/hash replay alone therefore
did not prove the asserted exact-model table relationship.

Within the existing private `replaySourceRelations` function, one
`load(html, { sourceCodeLocationInfo: true }, false)` now supplies both
semantics and original locations using the existing Cheerio/parse5 path.
Original table, semantic row, scalar element and text spans must have valid
exclusive-end UTF-16 bounds on that same parse. An implicit `tbody` may group
explicit rows; an implicit semantic row has no original span and cannot prove
scope. The old location-only interpretation was removed, not retained as a
second AST or fallback. No parser service, dependency, blacklist, generic
table grammar or existing owner was added or changed.

The approved CRLF boundary is preserved: parse5 text normalizes CR/LF, whereas
its locations slice original CRLF. The verifier compares only HTML CR/LF
preprocessing with the parsed text, then uses the **original substring** for
all scalar matching and offset arithmetic. It never treats normalized text
indices as original indices. Leading/trailing CRLF with an astral/non-ASCII
prefix completes actual receipt construction and JSON replay. Interior CRLF
between value/unit and encoded-space entities remain typed candidate gaps;
this is not a syntax expansion or inferred source location.

Diff sizes against main's immutable `G4b-r2-base.json` snapshots:

| Allowed file | R2 change |
| --- | --- |
| `src/domain/architecture-v3/verified-source-binding.mjs` | +26 / -8 lines, within the existing relation-replay function. |
| `tests/architecture-v3/direct-source-binding.test.mjs` | +112 / -3 lines; seven new factory regressions, 33 to 40 tests. |
| `docs/architecture-v3/execution/G4b-direct-binding.md` | Current status/history labels and this R2 append, written after execution. |

The receipt consumer remains byte-identical. The main-owned base manifest,
seven snapshots and review-package helper, independent audits/PoCs, old
captures, originals/data, parsers/verifiers, G3a/G4a, profiles/policies, plan,
HEAD/index and recovery checkout were not edited. The executor did not run
main's review-package helper, dispatch an auditor or commit/push/release.

### Actual factory RED, GREEN and stored replay

Both initial malformed-source fixtures completed historical installation
replay and actual `createDirectClaimReceipt -> JSON -> verifyDirectClaimReceipt`
before the new rejection assertions failed with `Missing expected rejection`.
They reproduced the independently observed bad receipt IDs:

| Pre-R2 erroneous diagnostic receipt | Receipt ID |
| --- | --- |
| Orphan `th` wrong-model heading | `99fe9a4bdecca1557b67a1a69a02839cf9351c7f6c675d706c476a96fd2f47b3` |
| Orphan `td` wrong-model heading | `47ec69bb5432f223b80d9fc38e56e3af2d479ad29a0115f1eac7a65c41ec2d87` |

The complete serialized erroneous envelopes are preserved in the automatic
RED stdout. The private replay diagnostic reads those actual envelopes,
reconstructs their immutable fixture objects, confirms case/normalized
attestation equality and historical PASS, then calls the unchanged receipt
consumer. On the final source, both reject with `SOURCE_BINDING_REPLAY_FAILED`
from the source-row check. This is not a fake binding or rejection caused only
by changing a receipt digest. Fresh issuance rejects with
`SOURCE_RELATION_CANDIDATE_GAP`. Supported regular tables and the explicit
wrong-model-row negative control remain covered.

The UTF-16 positive independently asserts a 12-code-unit raw JSON offset
shift from the literal prefix; the CRLF positive asserts that same subject/
label shift and a 16-unit value/unit shift. The valid CRLF factory test first
failed after historical replay and literal offset assertions had passed. Its
RED is a real position-handling regression, not a fixture construction error.
An implicit scalar row without an original span remains rejected.

Each run below retains its full stdout/stderr, actual exit/signal, command
metadata and before/after input snapshot. Names expand to
`G4b-r2-<run>-manifest.json` under
`.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/`.

| Run | Actual result and classification | Manifest SHA-256 |
| --- | --- | --- |
| `red-20260923T134916625Z` | exit 1; 4/6 pass. Two genuine orphan factory REDs after historical PASS and successful bad receipt creation/replay; no fixture setup failure. | `9ad7aaf10ad71cdfe153ae1ac86d3cee858dc34700240094c0827901cd9e6e74` |
| `green-20260923T135027606Z` | exit 0; 37/37 focused pass after the single-parse repair. | `deb6e874b94ade8dc324e579d24a31e66ef36044b0c05029c6165b80860899ad` |
| `replay-20260923T135049679Z` | exit 1; diagnostic setup assertion compared normalized anchor/object-reference sets to unsorted builder arrays, before stored-source replay. Not behavioral RED or a production rejection. Original helper/failure retained. | `c7361d589591e6a4011468aba4109f7ae4873ccadf90a6787f473d905bcd8d79` |
| `replay-20260923T135135851Z` | exit 0; new v2 helper replays both actual stored bad receipts and confirms source-relation rejection, with historical PASS. | `2424736944d1cbffabd98da205814055cbae32e36eec201c34ea93e50dd41b0f` |
| `final-20260923T135213577Z` | Complete intermediate PASS: focused 37/37, full 3308/3308, lint/schema exit 0. The approved CRLF addition arrived during this run; subsequent source/test changes supersede it. Not the current final and not relabeled a failure. | `e3888730743c71c1634682aef432a7f31bf62e046149096dcc9134f5e81ae1a2` |
| `red-20260923T135436590Z` | exit 1; 2/3 pass. Valid CRLF edge positive reaches the actual factory and fails with `SOURCE_RELATION_CANDIDATE_GAP`; interior CRLF/entity negatives pass. Genuine behavior RED, no setup failure. | `7f0f8414559dd5c5fd043f305e3b867ed99ee972d8e9709c8fcc7b1d2f0cb976` |
| `green-20260923T135502475Z` | exit 0; 40/40 focused pass, including original-substring CRLF handling. | `9edd5fa4d9de90c4e06944af251886c2a810b0a13161bac32bd2edd766ebe877` |
| `replay-20260923T135535360Z` | exit 0 on the final source; both stored erroneous receipts still reject from source replay, not identity mismatch. | `311cee620f0595baff1db18e745175fdf25b7ebc994db2cf7a603a41c9b3247e` |
| `final-20260923T135535974Z` | Current final: focused 40/40, full 3311/3311, lint/schema exit 0. All execution inputs unchanged. | `94bd9b1b7e42089672cc1beb7e7bf3abe281222ace943576a562be633e6b2171` |

No failed run was deleted or redated. Earlier `G4b-green-007` /
`G4b-red-008` remain INCONCLUSIVE historical diagnostic summaries with raw run
evidence unavailable, as recorded above. Neither those summaries nor the old
green suite prove absence of the independently reproduced bypass.

### Current final raw capture and frozen execution identity

Manifest: `G4b-r2-final-20260923T135535974Z-manifest.json`, captured at
`2026-09-23T13:56:38.941Z`, SHA-256
`94bd9b1b7e42089672cc1beb7e7bf3abe281222ace943576a562be633e6b2171`.
Input snapshot: `G4b-r2-final-20260923T135535974Z-inputs.json`, 136715 bytes,
SHA-256 `11e50cebfae73955960b5eac1c67a930da20d37f7e71d951bd2d7124743a8c5f`.

Focused/full/lint working directory:
`/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline`.
Schema working directory is that same absolute root plus
`/.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/G4b-r2-final-20260923T135535974Z-schema-workspace`.
The recorded spawn commands/arguments and UTC times are:

| Command | UTC start to end on 2026-09-23 | Result |
| --- | --- | --- |
| `/Users/clawdbot_jz/.hermes/node/bin/node --test tests/architecture-v3/direct-source-binding.test.mjs` | 13:55:36.191 to 13:55:47.471 | exit 0; 40/40; 11253.840584 ms. |
| `npm test` | 13:55:47.494 to 13:56:37.890 | exit 0; 3311/3311, one nested suite; 49584.760708 ms. |
| `npm run lint` | 13:56:37.950 to 13:56:38.469 | exit 0. |
| `npm run validate-schema` in the isolated workspace | 13:56:38.554 to 13:56:38.807 | exit 0; 2330 pages, 6145 blocks, 0 errors. |

Both TAP runs have zero failures, cancellations, skips and todos. All four
commands have null signals, no spawn errors and zero-byte stderr. Each stdout
below is a complete direct child-process capture in an exclusive file, not a
tail or hand-authored TAP. Command JSON files contain the exact absolute cwd.

| Complete stdout suffix under the current final prefix | Bytes | SHA-256 |
| --- | ---: | --- |
| `-focused.stdout.log` | 11043 | `c7546a62bcbf0e2422ad6fbd757ad129b9a83a37d61c26da72e64037ca3ecfda` |
| `-npm-test.stdout.log` | 759815 | `47df1b71749795ff60ea035b03a56b243bad1db4b20a46bf90aa0794b5ff1146` |
| `-lint.stdout.log` | 209 | `4eb29efff98ecd28f4f305dec9c9fb83f6b8af44e31c46ebd35ae361f689f4ee` |
| `-validate-schema.stdout.log` | 137 | `a3f3c67dc9f7b85d98b750e93b7b47d54e8f26656a9e942d7695312c5e8529dc` |

The final manifest's 901 file-reference records, covering 642 unique paths,
were checked against current bytes and hashes at report closeout. Installed
Cheerio/parse5 and relevant adapter/entity/DOM dependency bytes are included,
along with source/tests, fixtures, policies, actual bounded original objects
and protected artifacts. The manifest records `inputsUnchanged`,
`protectedFilesUnchanged`, `gitUnchanged`, `rootSchemaReportUnchanged` and
`schemaHtmlUnchanged` as true. Schema uses the byte-identical package/script
and original HTML inputs, with output isolated from the tracked report.

| Current frozen execution file | Bytes | SHA-256 |
| --- | ---: | --- |
| `src/domain/architecture-v3/verified-source-binding.mjs` | 60797 | `cc0dac3d3d4e0efcdacf52701c652d1088e804653ba5082f32761c48a70cd78e` |
| `tests/architecture-v3/direct-source-binding.test.mjs` | 83843 | `d541f8a62b2b99e3ef4bc02c7bdf415d5dc8abc263f8a13cf69bbfaeb7046f6e` |
| Unchanged `src/domain/architecture-v3/evidence-claim-receipt.mjs` | 16625 | `a08e82f80f2649a8e0a92d7942b8e4d2bf1fe1dfbdee64f6d5d925dced11f95f` |

The source/test files have not changed after this final capture. This report
and the private executor ledger were updated afterward and intentionally are
not execution inputs; the manifest marks `reportWrittenAfterTests: true`.
No unchanged final command was rerun for reporting. HEAD remains
`7b0764b0c5b099ed19b8af9b46860408c4121083`; index SHA-256 remains
`72fb1672d8e93f3025f3b199f4842d1aeeb7aa57d0f71aa5410f6a89d26d0de8`.
Main's immutable R2 base manifest remains
`80c2cf18f706d7f124aef35b14cb5a212fd2c312f9654d8437442a89d40e5880`.

### Current receipt accounting and remaining limitations

There are **five distinct successful portable synthetic receipt identities**:
the three R1 controls above remain byte-identical, plus these two new complete
factory/JSON/replay positives:

| R2 synthetic source-position scenario | Receipt ID |
| --- | --- |
| UTF-16/non-ASCII prefix | `f8c9c97d5ed703833a361d6d6da32b9c292722ed13c934b8cca0b7b1ed7f855d` |
| CRLF scalar edges after that prefix | `eb5a700ee6f8f7d805a4a839ced9b76d30c66acf03f5016c402ce62a91c364e1` |

The two erroneous pre-R2 diagnostic envelopes are counted separately as
reproduced failures, now rejected; they are not successful current positives,
real receipts, reviewed receipts or accepted/public output. Repeated test
construction is not an additional source count.

| Classification | Current count |
| --- | ---: |
| Successful portable synthetic receipt identities | 5 |
| Real historical replays in focused tests (BDF, RF, DW) | 3 PASS |
| Real new G4b bindings | 0 |
| Real new `EvidenceClaimReceipt` | 0 |
| Independently reviewed/admitted new receipts | 0 |
| Accepted receipts | 0 |
| Public receipts | 0 |

The earlier real-source disposition remains unchanged: BDF's paragraph does
not prove the asserted table relations and its legacy applicability/context
stays unknown; RF/DW retain complete-closure and compatible frozen-profile
gaps despite genuine historical PDF/MinerU/index replay. Rejection is of the
unsupported assertion, not a declaration that the entire PDF is bad. Complex,
multi-model, cross-page, ambiguous/implicit-row, noncanonical JSON and unresolved
profile cases remain explicit candidate gaps, not silently accepted coverage.

Both decimal adapter regressions, whole-mm restrictions, complete G3a closure,
three-key Claim projection, truthful full-proof rehash, same-PDF wrong-SKU and
cross-row rejections, nested UNKNOWN immutability, and all `unknown_blocked`
rights actions remain covered. No real applicability becomes `required`, no
profile/market/rights inference is added, and no public use, CurrentEligibility,
Fit result, source acquisition, OCR, old receipt reissue or corpus repair is
claimed. Missing-external-drive execution was not separately rerun or proved
by this R2 verification.

### R2 handoff

**STOP WRITING / REVIEW_REQUIRED.** No NEEDS_CONTEXT. The final source, tests,
complete raw capture set and this later report are ready for main's exact-diff
freeze and independent Meitner re-review. This is implementer evidence only;
R1-1 closure and acceptance remain the independent reviewer/main's decision.
No further implementation, audit dispatch, commit, push, publication or release
is authorized by this handoff.

## R3 — complete original table-range accounting (current)

2026-09-23; authority: approved `G4b-r3-brief.md`, independent v3 R2-1 and
main's v3 ruling. Against the eight-file main R3 baseline, the binding changes
**+30/-1 lines**, focused tests **+52/-2**; this report only changes status
labels and appends this section. Consumer, owners, profiles/policies, originals,
prior captures/audits, main baseline/plan, HEAD/index and recovery remain untouched.

The existing relation function accounts for the selected **original table
range** using the same parse5 tree's own start/end-tag tokens and faithful text
spans, never enclosing subtree spans. Any uncovered non-whitespace or text span
that swallows discarded markup rejects. This catches relocation and loss, not
just `h2` or moved nodes. No second parse, blacklist or new semantic grammar is
added. Implicit `tbody`, benign whitespace and the original UTF-16/CRLF offset
rules remain supported; non-faithful/unsupported layouts remain field-scoped
candidate gaps, not bad-PDF declarations.

### Actual RED/GREEN and replay

These run identifiers expand to `G4b-r3-<run>-manifest.json`; complete raw
outputs, inputs, snapshots, exact commands/times and hashes are in those
automatic captures, not repeated here.

| Run | Observed result / classification |
| --- | --- |
| `red-20260923T143321817Z` | 2/7 pass: four actual factory behavior failures after historical PASS and receipt JSON replay; one separate whitespace-test argument-name error (`binding` vs `sourceBinding`), not behavioral RED. All retained. |
| `red-20260923T143345149Z` | Corrected test call, production unchanged: 3/7 pass; four `Missing expected rejection` failures. Exact audited heading/text IDs reproduced; discarded `</section>` between rows and inside coalesced header text also incorrectly issue/replay receipts. |
| `replay-20260923T143408418Z` | exit 1: both actual stored fostered envelopes still accepted. Normal control and old orphan-th/td rejections pass; no object/hash/setup mismatch. |
| `green-20260923T143458165Z` | 45/45 focused PASS after the range-accounting repair. |
| `replay-20260923T143524574Z` | exit 0: normal stored control passes; all four actual old/new bad envelopes reject from source replay. |

Stored replay uses the auditor's exact captured envelopes and original object
bytes, without regenerating builders or substituting proof. Fresh bad inputs
reject with `SOURCE_RELATION_CANDIDATE_GAP`; unchanged receipt-consumer replay
rejects with `SOURCE_BINDING_REPLAY_FAILED` from the source-row check. Prior
failed runs and INCONCLUSIVE historical summary classifications are unchanged.

### Final identity and boundary

One final full run: `G4b-r3-final-20260923T143559884Z-manifest.json`,
SHA-256 **`885e6820ab05fb67f4d4435b60b2abdd9d800ff2fad3a88754a6545044adb4ae`**.
Its frozen execution identities are:

- Binding: `13ffa057142de8f46aa1c0a18db3f8c39c4f843cc08ae9da62068447b4a3b18d`.
- Focused test: `1d4202f49d2170fb4330a74c094ef84524ca2169e80ee0f3958279e705f56385`.

Final **focused 45/45, full 3316/3316, lint exit 0, isolated schema exit 0**
(2330 pages / 6145 blocks / 0 errors). All commands have null signals/no spawn
errors/empty stderr; no failures, skips or cancellations. Full raw output,
before/after identities and byte-identical isolated schema inputs are retained.
The final manifest's 1081 direct file-reference records / 732 paths were
byte/hash checked; all input/protected/HEAD/index/schema invariance flags are
true. This report and private ledger were written afterward, excluded from
execution inputs. No subsequent source/test edits or unchanged-suite reruns.

**Counts:** five supported portable synthetic receipt IDs remain unchanged;
the added whitespace control is binding/replay-only, not a sixth receipt.
Three real historical replays PASS; real new binding/receipt, reviewed/admitted,
accepted and public counts are all **0**. Erroneous RED envelopes are diagnostic
failures, not positives. BDF relation/applicability and RF/DW closure/profile
gaps remain; UNKNOWN, complete proof, decimal precision and blocked rights
are unchanged. No exhaustive HTML/corpus proof, new OCR, real-source upgrade,
external-store CI, CurrentEligibility or public Fit/release is claimed.

**STOP WRITING / REVIEW_REQUIRED. No NEEDS_CONTEXT.** Main owns the exact R3
diff freeze and different Meitner's independent decision; this is not
self-acceptance. No delegation, commit, push or release was performed.
