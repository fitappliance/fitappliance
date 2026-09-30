# G4b R3-1 source-boundary repair candidate

2026-09-30. **LOCAL CANDIDATE; NOT ACCEPTED OR RELEASED.** Branch
`codex/g4b-source-boundary-repair` at the PR214 merge base `7b0764b0c`.
The original `codex/architecture-v3-g4b-source-binding` worktree remains
unchanged. Its thirteen uncommitted plan, implementation, test and review files
were copied into this separate worktree before this repair. Its reviewed R3
binding SHA was `13ffa057142de8f46aa1c0a18db3f8c39c4f843cc08ae9da62068447b4a3b18d`.

## Why this is the next slice

G4a's Claim schema is merged and production verified, but it does not replay
original model/field/context evidence. G4b would supply that replay before any
new exact-model Claim receipt can enter later G5 review or G6 repair. Its R3
producer incorrectly accepted a selected table that parse5 implicitly ended
before a second table and contradictory heading. The original 197-code-unit
counterexample and bad receipt ID are recorded in
[the R3 hold](G4b-source-boundary-hold.md). This is a source-proof error, not a
reason to strengthen Fit from an unverified PDF.

## Candidate change

- The selected table must be in the HTML namespace and have its own parsed
  start and end tag tokens. Their finite integer offsets must bound the same
  table node's original interval. An implicit closure at another table, an
  ancestor closure or EOF cannot prove the boundary.
- Existing same-parse token/text coverage then checks the complete proved
  interval. Unaccounted content is ignored only when it consists of ASCII HTML
  formatting whitespace. Exact model, row, value, unit, profile, rights and
  source-replay gates remain unchanged.
- The D-1 design claim is narrowed: stored replay runs the current reviewed
  parser and B/C/R code; it cannot certify a historical parser identity on
  arbitrary runtimes. The release gate must record the resolved parser/adapter,
  lockfile and code identities and revalidate when they change. Unsupported
  serialized schemas still reject through their existing API guard.

The reviewed local runtime resolves Cheerio's nested parse5 **7.3.0** from
`node_modules/cheerio/node_modules/parse5`, not the top-level parse5 8.0.0.
The copied lockfile SHA-256 is
`ad45d58a7bf0e4c88a0b26edc9c73100810358286f2f39354b978bc25238d0e7`.
This records local identity only; exact-head CI and release identity are future
checks, and no parser identity field was added to receipts.

The user selected D-1 option 1. The local build gate now reads
`data/architecture-v3/policies/g4b-build-identity.json` and fails unless the
Cheerio package resolved from the binding producer and its ESM entry/tree,
the nested parse5 package, the active parse5 HTMLparser2 tree adapter and its
own parse5/DOMhandler dependencies, HTMLparser2, `package-lock.json` and the
G4b source-binding/receipt bytes match the reviewed
manifest. Both `npm run build` (the Vercel build command) and direct
`npm run build:public-deployment` invoke this gate before writing deployment
output. `npm run verify:g4b-build-identity` is also available as a focused
check. Changing dependencies or code requires a reviewed manifest update and
affected tests, not an automatic rehash during the build. A direct deployment
that bypasses these declared commands is outside this guarantee.

## Regression and review evidence

The new synthetic installation fixture first failed the unchanged R3 code with
`Missing expected exception`: original-source replay accepted the early-closed
table. After the repair, fresh binding rejects with
`SOURCE_RELATION_CANDIDATE_GAP`, and a resealed stored receipt rejects through
`SOURCE_BINDING_REPLAY_FAILED`. Additional controls cover manufacturer HTML,
EOF, literal closing-tag text in a comment, explicit later tables, implicit
child-cell closure and a non-ASCII source gap. Existing positive receipt and
R1/R2/R3 controls remain in the focused suite.

Focused `node --test tests/architecture-v3/direct-source-binding.test.mjs`:
**53 passed, 0 failed**. `npm run lint` and `npm run validate-schema` passed;
schema counted 2,330 pages, 6,145 blocks and 0 errors. An independent patch
review found no concrete new bypass or false rejection in the local delta.
`npm run build` passed, including `audit:active-retail-release` with zero Fit
publication violations; it produced 3,281 local deployment files and made no
tracked public-artifact diff. No production build or deployment occurred.
`npm test` counted **3,303 tests: 3,301 passed, 2 failed**. Both failures were
reproduced separately on untouched base `7b0764b0c`: the local dependency
tree lacks `fflate` for `provider-response-quarantine.test.mjs`, and
`videos.test.mjs` rejects an entry older than its 90-day validation window.
The full-suite gate is therefore **not green** in this environment. This
candidate does not alter those tests, dependency files or video records.

The exact historical R3-1 diagnostic was subsequently located in the preserved
private G4b SDD capture
`G4b-audit-v4-20260923T145134619Z-table-end-probe.stdout.log` (1,713,205
bytes; SHA-256 `dc904f926918626342c4f31b4f9a51784c314db9c451bde0325a58e8f4812082`).
Its four complete cases include the original 197-UTF-16-unit early-closed
synthetic MinerU HTML and serialized erroneous receipt
`f5471da39bccc40f5fe58c78c96886f00e852b34ae211f850b3e74e45c5eb4b4`.
All six captured object sizes and SHA-256 hashes for every case were checked
against their base64 bytes before replay. The old preserved G4b source accepts
the original fresh input, reproduces that same receipt ID and accepts its
stored replay. This candidate rejects fresh binding with
`SOURCE_RELATION_CANDIDATE_GAP` and stored replay with
`SOURCE_BINDING_REPLAY_FAILED`. The normal and explicitly separated table
controls retain identical receipt IDs and pass fresh/stored replay on both
versions. The earlier conflict-before-end control remains rejected. This is
the original *diagnostic synthetic* source, not newly acquired official
appliance evidence or a real product receipt. A second independent local
reviewer checked the capture hash, six decoded object identities and the
baseline/repaired fresh and stored outcomes without editing either worktree.

## Remaining acceptance gates

- Formal independent code/design acceptance is now APPROVED at `56228b996`; see [v5](G4b-independent-acceptance-v5.md). The current-parser and build/release guarantee remains bounded; it does not prove historical parser identity on arbitrary runtimes.
- The exact committed head needs the project's Node 20 CI, original-store
  availability handling, lock/parser identity and release checks. No real new
  source, receipt, review, CurrentEligibility, Fit outcome or public artifact
  was created by this repair. G5/G6 and whole-inventory legacy repair remain
  pending.

## 2026-09-30 release follow-up

A fresh lockfile installation on UGREEN resolves the local missing fflate dependency. All six video records were genuinely revalidated through official YouTube oEmbed by executor and independent reviewer, retaining useful data and upload dates; the heading now accurately says official refrigerator help videos. Final local full suite passes3328/3328 with no skips; canonical build/lint/schema/docs pass. This does not erase the earlier baseline failure evidence. Final committed Node20 CI and production identity verification remain required; [release preflight](G4b-release-preflight.md) records these gates and the verified external storage migration.
