# G4b boundary design — main decision hold

2026-09-24 Australia/Perth. **DRAFT / CHANGES_REQUIRED.**
The design round and independent audit are complete; design acceptance and
implementation are not. Auditor Pasteur is stopped/closed. No code/test,
dependency, original evidence, receipt, commit, push or release was changed.

## Reviewed outcome

[The design](../../superpowers/specs/2026-09-24-g4b-source-boundary-design.md)
is retained byte-for-byte as the reviewed draft, SHA
`f78e442f9037ba237d138ee221230c87bf54943b4072c44c93072695f0343549`.
Its pending-review header is the initial snapshot status; this ruling and the
canonical plan record the current outcome.

[Independent audit v1](G4b-source-boundary-design-audit-v1.md), SHA
`0d7a649d58e7d3de7d7709b551fcc513bd73d2899d133c9e23e564bd08e138b2`,
found no new bypass satisfying all written B(boundary)/C(coverage)/R(relation)
conditions within the bounded review. This is limited design analysis, not
an exhaustive HTML proof or an implementation result. R3-1 still exists in code.

The auditor identified Important D-1: the design's parser/schema-upgrade row
promises rejection of unsupported versions, but neither stored binding nor
receipt identifies or checks the actual runtime parser. Main confirms the
schema/canonicalization guards and current `expectedToolchain` fields in code;
the latter contain G3a proof/profile identity, not parser identity. The design
must not imply that the current replay API verifies something it cannot read.
This is a design overstatement, not a new demonstrated production exploit.

Actual runtime resolution matters: Cheerio1.2.0 imports nested parse5 **7.3.0**,
not the separately installed top-level8.0.0. Main verified ESM/CJS resolution
and the actual nested source. The two inspected boundary-location methods match
the top-level implementation; no full-package equivalence or upgrade is claimed.

## Narrow decision requested

**Main recommendation: keep parser identity enforcement at the controlled
build/release boundary, and correct the stronger replay claim.**

The intended distinction would be:

- Stored replay rechecks the original objects and B/C/R using the currently
  reviewed implementation. It is not proof that an arbitrary machine is using
  the historical parser version.
- Build/release acceptance must record the actual resolved parser/adapter,
  locked dependency and exact code identities. A changed dependency requires
  affected checks and independent review before release; no silent promotion
  follows from an unchanged receipt ID.
- Unsupported serialized schema versions still reject at the current API.
  This existing guard is separate from parser-version release control.
- No new per-receipt field, runtime module loader/checker or second verifier
  is needed for this narrower G4b contract. Product evidence/Fit thresholds
  remain unchanged; only an unsupported capability claim is removed.

Alternative: require every fresh/stored invocation itself to verify an approved
runtime identity before parsing. That requires an explicit new local mechanism,
trusted runtime artifact identity and ESM/CJS loading contract, with tests; it
is additional implementation scope and has not been designed or authorized.

Await the user's decision before revising that premise or dispatching further
work. If the recommended boundary is chosen, revise the draft and obtain a
limited independent D-1 re-review. Do not rerun unrelated owner audits or call
that document correction proof that R3-1 has been fixed. The normal written
design/implementation/code-review/release gates remain separate.

## Evidence and verification limits

Main read the complete audit, diagnostic script/record and relevant code.
All six frozen objects matched their original byte counts/hashes before this
post-review ruling; source/tests/lock remain unchanged. No duplicate product
suite or parser probe was run by main.

The auditor's single parser-only diagnostic is not a receipt factory test.
Its mislabeled `implicitOuterBoundary` input actually contains an explicit
first end tag and cannot be counted as a new R3-1 reproduction; the report
discloses that limitation. Its import-display typo is not the real import.
Only inputs and summarized observations are in the private record; do not
represent it as a full raw product-test capture. The earlier preserved actual
factory/serialized-replay R3-1 capture remains authoritative for the defect.

Private probe script SHA
`7bc855ddbb5b0075915c8701f3d664c833f7d14448ca8ebb1f49de6903230d5a`;
probe note SHA `74f95fa3182bae3466c8df8e7ac948abaf47643b8c3405454057caea1740a16d`;
dependency correction SHA `51c2227ee07e7c8d62a8c015543ebd2e6e17bd342501240da0f9f44d6c0834c0`.
These are auxiliary diagnostic records, not public installation evidence.

Real new/reissued/admitted/accepted/public receipts and new OCR remain0.
Original PDF/MinerU and historical failures are retained; dimensions-only
search is unchanged. The whole-corpus repair objective remains unfinished.

## 2026-09-30 decision and local continuation

The user explicitly selected recommended D-1 option 1: verify parser, lockfile
and reviewed code identity at build/release acceptance, while stored replay uses
the current reviewed parser. This resolves the *choice* requested above; it
does not retroactively convert the 2026-09-24 draft into an accepted design.
The isolated `codex/g4b-source-boundary-repair` candidate implements the gate
and records checks in [its repair report](G4b-r3-source-boundary-repair.md).
Independent design/code review and release gates remain separate. No claim is
made that a receipt proves the parser version used on arbitrary machines.
