# G4b original-source boundary design — independent audit v1

Status: **CHANGES_REQUIRED — design blocker D-1 remains.**

Scope: independent design review only. No product source, formal test, old
report, evidence/recovery object, dependency, commit, receipt, release, or
owner was modified. This does not reopen closed R1-1, R2-1, F2, or F3.

## Frozen review set

The designated design SHA-256 is exactly
`f78e442f9037ba237d138ee221230c87bf54943b4072c44c93072695f0343549`.
All six entries in
`.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/G4b-boundary-design-review-v1.json`
matched both recorded byte count and SHA-256 at review:

| Frozen path | Result |
| --- | --- |
| `docs/superpowers/specs/2026-09-24-g4b-source-boundary-design.md` | 16030 bytes; `f78e…3549` |
| `src/domain/architecture-v3/verified-source-binding.mjs` | 62344 bytes; `13ffa…18d` |
| `src/domain/architecture-v3/evidence-claim-receipt.mjs` | 16625 bytes; `a08e…95f` |
| `tests/architecture-v3/direct-source-binding.test.mjs` | 86886 bytes; `1d420…385` |
| `package-lock.json` | 174234 bytes; `ad45d…0e7` |
| `docs/architecture-v3/execution/G4b-source-boundary-hold.md` | 5208 bytes; `9efa…c3c` |

The manifest's top-level `parse5@8.0.0` is an inventory fact, not the parser
actually imported by `cheerio`. The subsequent read-only correction identifies
the actual ESM runtime as Cheerio `1.2.0` plus nested `parse5@7.3.0`, ESM parser
SHA-256 `23eb8e0f6b45abc36132c08f067899e0e615acbe9069762ba7780a66db78e65d`
([dependency correction](../../../.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/G4b-boundary-design-dependency-correction.md):5-30).
This audit used that runtime source, not the top-level package, for location
semantics. No broader equivalence of the two parse5 packages is asserted.

## What the written B/C/R contract does establish

Subject to actual implementation of every stated condition, the design is
locally executable and no new scope-completeness bypass was found in the bounded
review.

- **B is a viable boundary predicate.** The actual nested parser records an
  `endTag` only for a matching end-tag token; an implicit closure gets merely a
  computed element end. Requiring the selected HTML-namespace table's own
  `startTag` and `endTag`, their exact UTF-16 interval, and parser-originated
  locations addresses the specific R3-1 shortening mechanism (design §3,
  lines 79-104). The frozen R3 evidence remains the actual proof that the
  current implementation lacks this condition: its first table ended at 147
  without `endTag` and the tail was not counted
  ([hold](G4b-source-boundary-hold.md):21-42;
  [v4 note](../../../.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/G4b-audit-v4-boundary-note.md):13-30).

- **C has the necessary fail-closed shape.** Atomic token/text ranges,
  overlap and bounds rejection, raw-text-to-parsed-text CR/CRLF-only matching,
  and the literal five-character gap alphabet jointly prevent an in-interval
  migrated/discarded non-formatting fragment from becoming invisible (design
  §4, lines 106-129). An implementation must use that exact alphabet, not the
  current broad `\S` shortcut.

- **R stays within the supported relation rather than treating an entire page
  as a table.** The exact caption, one scalar row, two plain cells, full
  value/unit consumption, exact original fragment locations and unique-row
  rules are sufficient for the restricted visible-text shape; explicit sibling
  tables remain independently valid and cannot donate anchors (design §5,
  lines 131-148; frozen relation code
  `verified-source-binding.mjs:667-735`).

- **Supported child omissions and explicit siblings are not inherently
  rejected.** The single bounded parser probe recorded an own table end tag
  while implicit `tbody` had no location and omitted row/cell ends had no
  `endTag`; it also recorded distinct own boundaries for explicit siblings.
  The exact input/output and limits are retained in
  `.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/G4b-boundary-design-audit-v1-parser-location-probe.md`.
  This is parser capability evidence only, not a factory result.

- **Coordinates are sufficiently specified for the supported source forms.**
  The actual probe confirms UTF-16 positions after an astral-character/CRLF
  prefix and the existing canonical JSON-string mapping for escaped CRLF.
  The frozen test source's existing controls describe the same intended
  distinction (`direct-source-binding.test.mjs:1886-1944`); they were read,
  not executed. Alternative JSON serialization remains fail-closed under the
  current unique canonical-string rule (`verified-source-binding.mjs:611-627`).

- **Fresh and stored source replay share the intended producer route.** Fresh
  verification runs `verifyAndBindSource`; stored binding replay invokes it
  again (`verified-source-binding.mjs:1247-1339`). Receipt creation replays the
  binding before creating an identity, and stored receipt verification calls
  that same creation path (`evidence-claim-receipt.mjs:147-165,353-417`). Thus
  B/C placed in the stated producer would gate both paths.

- **The contract does not improperly assert global reconciliation, rights, or
  Verified Fit.** The design retains those boundaries (design §5 lines 144-148
  and §6 lines 171-179). Existing receipt code derives rights as
  `unknown_blocked` (`evidence-claim-receipt.mjs:324-333`); existing
  installation `claimEligible` is not a public-rights or Verified-Fit result
  (`verified-source-binding.mjs:1054-1083`).

Attributes are covered atomically as portions of source tag tokens, not given
new model/field/context semantics. That is compatible with this local,
text-shaped route only if implementation acceptance explicitly confirms that
no attribute can supply or override a semantic endpoint. For example,
`data-model="OTHER"` must not silently acquire authority over the exact caption
model. This is an acceptance clarification, not a demand for generic attribute
interpretation or page-wide conflict reconciliation.

## D-1 — parser runtime identity is not an enforceable stored-replay invariant

**Severity: Important design blocker.** This is distinct from the already-known
unimplemented R3-1; it is a contradiction between the written lifecycle claim
and the identity data currently available to the producer.

The design simultaneously says that B/C stay local with no new serialized
object, that future acceptance captures must carry parser lockfile/code
revision, and that an unsupported parser/schema upgrade rejects
(design §6 lines 150-172). But the frozen binding has only schema and
canonicalization versions before it reconstructs fresh inputs
(`verified-source-binding.mjs:1324-1339`), and the receipt's `toolchain`
contains only the G3a proof and extraction-profile identity
(`evidence-claim-receipt.mjs:185-198`). Neither records nor checks the actual
Cheerio-resolved parser/adapter identity. The actual 7.3.0-versus-top-level-8.0.0
correction makes this a concrete provenance distinction, not a hypothetical
version label.

Consequently, a stored binding/receipt replayed after a parser dependency change
has no specified local way to reject *because* the runtime is unsupported. It
will simply re-run the current producer. This can preserve an identity if output
is unchanged or fail only if unrelated output changes; neither outcome proves
the promised parser-version gate.

### Smallest required contract decision

Before authorizing implementation, choose one of these mutually exclusive
interpretations and state it in the design/implementation acceptance boundary:

1. Define a fail-closed, implementation-local runtime identity precondition
   for the actual Cheerio ESM/CJS parser/adapter before any fresh or stored
   parse. Specify the expected artifact(s), how all supported module-loading
   paths identify them, and that the same precondition runs before the shared
   producer. It need not add a public receipt field, but it must make
   “unsupported parser rejects” executable.
2. Keep parser identity only as an external exact-commit/release-capture
   requirement. In that case narrow the lifecycle statement: a stored replay
   is not a cross-runtime parser-version verification and the contract must not
   claim that unsupported parser upgrades are rejected by replay.

No implementation choice is made here. Until it is made, §6/§7 cannot prove
the requested fresh/stored identity behavior and this DRAFT design should not
advance to a bounded implementation task.

## Required future implementation acceptance (not performed now)

After D-1 is resolved, a bounded implementer must demonstrate through actual
factories and stored replay—not DOM observation alone—that:

1. B uses the selected **HTML-namespace** table's paired own parser tokens and
   exact location equality; comments, attribute text, foreign lookalikes,
   EOF and implicit table closures cannot substitute an endpoint.
2. C accounts only real tokens/text spans within `[S.start,E.end)`, rejects
   all non-listed gaps/overlap/out-of-bounds/coalesced text, and preserves
   supported implicit `tbody`/child-ending positives.
3. Direct HTML and MinerU both use the same gate; UTF-16, canonical JSON escape
   and CRLF controls remain exact.
4. The exact R3-1 envelope
   `f5471da39bccc40f5fe58c78c96886f00e852b34ae211f850b3e74e45c5eb4b4`
   rejects on fresh and stored paths, while explicit sibling-table positives
   and existing positive IDs remain unchanged.
5. No result is relabeled as complete-source reconciliation, rights approval,
   current-sale authority, or Verified Fit.

## Boundary of this conclusion

- **Not an implementation result:** R3-1 remains an actually reproduced,
  unimplemented code-acceptance defect. This review neither fixes nor retests
  it; the design itself says it does not close R3-1
  (design §8 lines 206-228).
- **Not an HTML exhaustiveness claim:** no generic grammar or whole-document
  proof was attempted. No counterexample satisfying all written B/C/R
  conditions was found in the authorized bounded review.
- **Not a reopening of prior findings:** R1-1, R2-1, F2 and F3 remain closed
  as directed; no owner/profile/rights/PDF redesign was reviewed.

**STOP WRITING.**
