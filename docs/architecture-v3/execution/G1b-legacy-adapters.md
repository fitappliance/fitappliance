# G1b — Lossless legacy-candidate adapters

Status: **REVIEW_REQUIRED**
Worktree: `/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline`
Branch / base: `codex/architecture-v3-g1b-legacy-adapters` / `38883f4e466dc5ab5eb69f653bb45958020ede1e`

## Frozen boundary

- Requirements brief accepted in the bounded preflight: `G1b-brief.md`, SHA-256 `28da5e8ba6742e269f786e1e6a0a12bae58426acffcd85ff3da48cbd12d112b5`.
- The accepted G1a semantics/context, canonical JSON, V2 dimension/installation, historical recovery, policy, and test/lint inputs were not reread or rehashed after that preflight.
- Authoring scope is limited to this handoff, `src/domain/architecture-v3/legacy-semantics-adapter.mjs`, and `tests/architecture-v3/legacy-semantics-adapter.test.mjs`.

## Adapter contract

`adaptLegacyGeometryCandidate({ legacyObject, semantics })` accepts only `dimension_claim_v2` and `manufacturer_verification_binding`; `adaptLegacyInstallationCandidate(...)` accepts only `installation_requirement_v2` and `installation_field_receipt_v1`.

- Each requires the strict `{ kind, record, origin, owner }` envelope. Invalid JSON shape, extra envelope keys, invalid JSON Pointer syntax, or a non-integer/negative `claimIndex` throws `LegacySemanticsAdapterValidationError`; no coercion occurs.
- Each returns `{ candidate, losses, unresolved }`. Candidates are only `candidate_only`; unsupported contracts remain `unsupported_legacy_candidate` with the full legacy record retained.
- `assertion.rawValue` is the **stored legacy value** (canonical mm in a V2 claim), not the original unconverted PDF numeric token. Its name infers neither source proof nor field proof.
- Inputs are copied, never frozen or aliased; repeated adaptation is deterministic. No adapter output adds admission, acceptance, verification, receipt type, or publication state.

## Semantic handling

- V2 geometry stored in canonical mm stays mm even when `sourceUnit` is `cm`; it is never converted again. Missing axis/unit/inclusion/applicability/range-meaning/context/scope facets stay explicit unresolved gaps.
- A stored `fixed.mm: null` remains partial with `VALUE_NOT_NORMALIZABLE` at `/record/value/mm`; it is never changed to zero or N/A. Legacy installation `{ minimumMm, maximumMm }` endpoints are canonical mm: no range meaning produces `RANGE_MEANING_UNSPECIFIED`; an explicit non-mm unit produces `RANGE_UNIT_CONFLICT` at `/record/unit`, preserves both declarations, and is never converted. Explicit `unit: 'mm'` plus an allowed range meaning normalizes the endpoints unchanged.
- Geometry validates exact scope against the G1a field policy. A missing or mismatched scope never implies an external dimension.
- Present context is checked with G1a `validateEngineeringContext({ context, semantics, witnessedConditions: [] })`. `[]` asserts no witnesses; it validates only the closed context/policy and does not establish product, source, or eligibility proof. Explicit unknown facets retain their facet gaps; G1a errors become `CONTEXT_<G1a-code>_INVALID` unresolved entries.
- Compact manufacturer bindings resolve only a selected owner claim with a matching supplied receipt. When a case is supplied, its source membership and explicit nonempty exact brand/model assertions must also match; a missing optional case never proves product identity. Their semantic gaps and losses root at `/owner/source/claims/<index>/...`; direct claims root at `/record/...`. An absent `source.verificationReceipt` is an ordinary unresolved association, not a codec exception.

## Review evidence

- Focused adapter test: **PASS** — 21 tests, including strict pointer/index behavior, wrong-owner isolation, context policy negatives, null-mm supplementation, range retention/unit conflict, immutability, and legacy helper compatibility.
- Direct legacy/foundation compatibility tests: **PASS** — 66 tests (`dimension-evidence-claim`, historical recovery contract, installation knowledge/pipeline, canonical JSON, and G1a semantics).
- Full suite: **PASS** — `npm test`, 3,028 tests passed; the V3 syntax check included this adapter and its test.
- Lint: **PASS** — `npm run lint`.
- Documentation audit: **PASS** — `auditDocs({ repoRoot: process.cwd(), writeReport: false })`; no documentation drift.
- Diff check: **PASS** — tracked diff whitespace check is clean. The only pre-existing out-of-scope modification remains the main-owned plan-status file.
- Deliberately not run: source canary, OCR/PDF/recovery replay, build/sync/publish. G1b is a pure lossless adapter and does not perform G4 evidence replay.

### Observed behavioural RED → GREEN

The first canonical-V2 fixture initially reached the bounded fail-closed adapter as unsupported, then passed after the implementation retained stored `598` mm despite its `cm` source label. Later counterexamples each produced a real RED before their minimal correction: unsupported/invalid closed contexts were incorrectly normalized; `fixed.mm: null` returned no supplementation gap; and canonical `{ minimumMm, maximumMm }` endpoints with declared `cm` were multiplied to `8500–8950` mm. The corresponding GREEN runs retained explicit context/null/unit-conflict gaps and normalized an explicit-mm adjustment range unchanged at `850–895` mm; all observations were local adapter tests, with no source replay.

### Compact metadata fixture boundary

The compact manufacturer metadata fixture is an excerpt exercised with its declared origin reference (for example, `/entries/0/sources/0/verificationReceipt`). It tests owner/claim association only; it is not raw-container attestation, byte verification, or evidence replay.

## Final verification and hashes

- `src/domain/architecture-v3/legacy-semantics-adapter.mjs`: `12b3a6dbb860b2a4e035bd348ac82c68b809bee4561ca7fc895252c036696505`
- `tests/architecture-v3/legacy-semantics-adapter.test.mjs`: `9e838800f6ca1bf0483363f1cbec978cbeea1641476f8ef3145ae00af6e3a778`
- Handoff-document SHA-256 is recorded with the final handoff, after this content is finalized.

## Main review

Main verified the code/test hashes above and all16 frozen input hashes, and
independently reproduced and rechecked null-mm supplementation, conflicting
range-unit isolation and consistent850–895mm normalization. The original recovery
checkout's HEAD,175-row status digest and tracked-diff digest match this turn's
before snapshot. No old source, receipt, public data or release pointer changed.
The original plan records the accepted transport union and optional-case limit.
Exact-commit Node20 CI is still required before G1b becomes COMPLETE.
