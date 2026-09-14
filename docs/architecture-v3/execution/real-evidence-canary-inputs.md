# Real evidence canary inputs — fix round 1

Implementation/TDD/self-test handoff only. Independent audit v1 remains CHANGES_REQUIRED; this document does not override it, grant semantic approval, issue receipts, or establish publishability. Only the three explicit BDF1620W / BDP810W / EWF7524CDWA source owners are counted; the 590-source baseline is a different denominator.

## Candidate identity and non-consumption boundary

New append-only [candidate batch](/Volumes/UGREEN-1TB/FitAppliance/evidence/architecture-v3/canary-preparation/records/sha256/93/4d/934db1b37339d66a5843fa7a6cc9234283f2d5a90f3ea80573d81a42794d8733.json), SHA-256 `934db1b37339d66a5843fa7a6cc9234283f2d5a90f3ea80573d81a42794d8733`. Its schema-v3 selection uses `raw_source_observations_v1`; it is not a ledger, accepted head, migration, review event, or receipt.

The earlier batch `404721ce590473439738b589bda74a97dbbc4024c967d8479efe0c38386cb380` and its objects are preserved byte-for-byte as `UNACCEPTED_HISTORICAL_OUTPUT_DO_NOT_CONSUME`. The new batch explicitly references that supersession/non-consumption status; it does not inherit its typed candidates.

Frozen implementer files (raw-byte SHA-256):

| File | SHA-256 |
| --- | --- |
| [runner](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/scripts/architecture-v3/prepare-evidence-canary-inputs.mjs) | `93e71ef259b528bf2a0dc91521a620f2af5a70709623c064bed2f68dd6e137ed` |
| [tests](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/tests/architecture-v3/evidence-canary-inputs.test.mjs) | `8afc28ff327cfb891ef0ed0483be272b5392eb90a1744171b6fb286889ba6c1b` |
| [selection](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/data/architecture-v3/research/legacy-evidence-canary-selection.json) | `16c08e974338f88431adadacd96c575533ad7a130f4ae81d7f18022b08ba883a` |

This handoff's final hash, exact four-file round-1 diff, all seven new object hashes, captured full-suite exit/log hashes, and before/after input identities are recorded in the [executor freeze record](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/real-canary-inputs-round1-freeze.json). That record is implementation evidence only and is not an independent audit.

## Repairs and remaining limits

1. Manifest fields now contain only an exact historical claim pointer and its field name. Unsupported numeric/axis/range/unit/label candidates are rejected. Every new raw observation is derived from the exact selected source JSON block with page/pointer and fragment hashes. JSON-pointer fragment content is the original block; visual notes remain outside it. All raw observations remain research-only, `fieldAssociation: NOT_WITNESSED`, `extractionWitness: NOT_SUPPLIED`, `typedGeometry: NOT_PRODUCED`. Historical adapter claims remain explicitly historical, not new numeric evidence. No second numeric/axis validator was introduced.
2. The historical MinerU attempt's eight recorded identity/configuration fields are checked individually against the frozen evidence-resolution profile, including when a modified record is rehashed under the same profile name. Timestamp, status/gaps/disposition, cache and exact source-page/range mapping must also agree. Policy SHA-256: `4b5072aa7f85cf59640cc464a1217de5aff11e218589989a31b0e30a5a864f7b`. Its absent historical `tableEnabled` and `formulaEnabled` are not fabricated: actual recorded profile, policy defaults, and `INCOMPLETE_RECORDED_TOOL_PROVENANCE` are separate.
3. The BDF p2 attempt `6d5088dcab372bb3d4018354fd34a711e768a8a067b6cb6d11559f5753767b63` / JSON `45e9e43bf173c314152cceb64cb878fbff6392f104542ba09c85bb5ac514a7fb` remains a referenced historical, parallel, unselected conversion. Conversion SUCCEEDED and record typedGap null do not clear required image `/1/4`: `DIAGRAM_LABELS_UNREADABLE`, completion `NOT_SUPPLIED`. No new OCR attempt or automatic selection/readjudication was performed.
4. Preparation validates the existing source/JSON hashes and reuses prior observations; it does not rerun the historical source verifier. The 3 historical as-of replay passes reference checkpoint `c3216a655e327e33f1d7ddd28068485cee982605b7eecc42997d9e2f304a0b7d`, observed at **2026-09-14T13:41:47.237Z**. That is not a present-day release verdict. Repeated prepare keeps this observation and identical persisted report; each execution time appears only in stdout/log.
5. Six existing pages are reused with prior render attestation `f79e8562c4606ecd020069f5f1f007028a4b24f1ad6656981c7e6a1f445be657`: pdftoppm 26.06.0, binary SHA-256 `76126535b3a04b7be1db84808e39c4e71218903d4d7cbe846b9b4514c97caf0a`, PNG at 150 dpi. That earlier attestation already records six exact same-hash reproductions. No render or source replay was repeated this fix round.
6. Output writes remain content-addressed, refuse path-chain symlinks and unequal existing bytes, and never replace original sources, old reports, indexes, receipts, or public state. CLI still requires explicit selection and storage root and rejects unknown/missing options.

## Actual counts and raw contexts

| Stage | Count |
| --- | ---: |
| Explicit source owners / source PDFs / selected JSONs verified | 3 / 3 / 3 |
| Selected conversions reused | 3 |
| Existing historical local OCR attempts referenced | 1 |
| OCR conversions executed by prepare in this round | 0 |
| Unresolved OCR provenance records / required diagram regions | 1 / 1 |
| Historical replay sources referenced / passed / failed | 3 / 3 / 0 |
| Existing full-page PNGs reused / new renders | 6 / 0 |
| New lineage chunks / supplementation chunks / batch reports | 3 / 3 / 1 |
| Fragment candidates / isolated structural proofs | 30 / 30 |
| Witnessed cross-artifact relations / retained unwitnessed joins | 0 / 15 |
| Historical-field supplementation entries / new V3 receipts | 9 / 0 |

Initial prepare created seven objects. Retry reused all seven with the same batch hash and zero new objects. Structural self-tests do not establish source-field semantics or complete G3a/G3b lineage.

| Source | Preserved source context and unresolved semantics |
| --- | --- |
| BDF1620W | p1 `/0/14`, `/0/15` retain labelled height850–865, width598, depth600. p2 `/1/4` image region and `/1/5` exact model remain. Upper598/598, lower570, top30, cabinet min598 are visual candidates only; no height deduction, zero clearance, or cavity-to-body mapping. p1/p2 datum and extent are unresolved. |
| BDP810W | p1 `/0/30` labels, `/0/47` values846/597/**589**, and `/0/52` model remain separate from p2 `/1/7` W/D/H597/**568**/846 and `/1/9` model. No value chosen, no body-only label, no declaration of an adjudicated same-semantic conflict. |
| EWF7524CDWA | p3 `/2/3`, `/2/4`, `/2/10` and p6 full image `/5/1` plus manual disclaimer `/5/3` remain. Depth575 with hose20 footnote is not595 or rear ventilation clearance. Complete installation-manual evidence is still missing. |

Exact raw image paths, JSON objects/pointers and fragment identities remain in the batch's three lineage chunks and six rendered-page references. Main's separate semantic review is not edited by this implementation.

## Self-test evidence and freeze

All evidence files below are in the task package, not production reports:

- RED: `real-canary-inputs-round1-red.capture.json`, SHA-256 `6ddac7452ed568b3bc95ac177c0fa1bf49817a0698635f75e8c7ccdcf72e8461`. The full valid baseline passes; 16 P1 mutation cases demonstrate the old defects. TAP totals include their two failing parents: 22 tests, 4 pass, 18 fail; captured child exit1. Complete log SHA-256 `98b943d4db6b1effdb5db67ce8549c875d206ccb4e8f9b13cd67eeb1be9a1324`.
- GREEN: `real-canary-inputs-round1-green.capture.json`, SHA-256 `aa95d550458f63c1e0f830b81e3a5aac711d3a09b988eb8e3ff8df3430c4978b`. Affected suite 39/39, exit0, including EWF595, axis/field/label, range/unit, 27 OCR/config/time/status/page-map drifts, no-write failures, retry, raw BDP589/568 and immutable-write checks. Complete log SHA-256 `ed3009339972f8fb324d25a92ea0d503667d0c6ddc733d365cb2f957d75cf1a9`.
- Actual prepare/retry: `real-canary-inputs-round1-{prepare,retry}.capture.json`, both child exit0, original/code input hashes unchanged during each process.
- Lint: `real-canary-inputs-round1-lint.capture.json`, child exit0. HTML schema: `real-canary-inputs-round1-schema.capture.json`, child exit0, 2,330 pages / 6,145 JSON-LD blocks / 0 errors. The existing exported validator is reused unchanged; only its report destination is redirected into permitted scratch. Real MinerU JSON/fragment schema checks are performed by prepare, not inferred from the unrelated HTML schema check.
- Full suite: [actual child-process capture](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/real-canary-inputs-round1-full.capture.json) and [complete log](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/real-canary-inputs-round1-full.log). The freeze record records the actual exit, test totals, command/cwd/start/end/pid, log hash and all captured before/after code/input hashes. `npm test` includes the explicit V3 syntax checker and V3 tests. The original v1 TAP log is preserved; its old uncaptured exit claim is not used as new proof.

No Git, OCR/render, delegation, acceptance, or publication action is authorized or performed by this handoff. Remaining extraction witnesses, physical scope/datum decisions, complete OCR provenance and installation evidence stay unresolved for later authorized work. The implementer stops writing after the final freeze record; independent re-review remains required.
