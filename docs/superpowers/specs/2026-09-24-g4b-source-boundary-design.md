# G4b original-source boundary contract

Status: REVISED LOCAL CANDIDATE — user selected D-1 release-boundary option 1; full design/code acceptance pending. Original 2026-09-24 review snapshot is preserved in the G4b worktree.
Main agent owns this design; a separate GPT-5.6 Terra / Max audits it.
No implementation, receipt reissue, commit or release is authorized by this document.

Authority: [product core](../../product-core-brief.md),
[V3 design](2026-09-13-architecture-v3-evidence-foundation-design.md),
[canonical plan](../plans/2026-09-13-architecture-v3-evidence-foundation.md),
[R3 blocking evidence](../../architecture-v3/execution/G4b-source-boundary-hold.md).
This is a local clarification of G4b source replay, not a replacement programme.

## 1. Intent, scope and decision

The user approved a design-and-independent-review round after repeated source
scope bypasses. A receipt must not silently lose relevant original content
when the HTML parser repairs a document. Preserve valid bounded layouts, the
original PDF/MinerU objects, historic failures, and dimensions-only search.
Unknown scope remains a field candidate gap, not an incorrect-PDF verdict.

The scope is the existing explicit-caption, plain two-cell scalar table path
in `replaySourceRelations`, for both manufacturer HTML and selected MinerU HTML.
No new brand/family inference, PDF interpretation, OCR, generic HTML grammar,
owner rewrite, database, UI or Fit change. It does not claim complete document
interpretation, current eligibility or full-source reconciliation.

Options considered:

| Option | Effect | Decision |
| --- | --- | --- |
| Explicit original table boundaries AND faithful inner coverage AND existing exact relation semantics | Closes the missing scope premise while preserving one parser and the public API | Recommended |
| Treat the whole HTML item/page as one indivisible table | Can reject legitimate explicit sibling tables and surrounding page content; conflates table proof with document completion | Not selected |
| New tokenizer/parser, reserialized HTML or generic recovery grammar | Introduces a second interpretation or wider parsing ownership; repaired output is not the immutable original | Not selected |

Explicit boundaries are necessary for this supported automatic route, not
sufficient for a receipt. The proposed acceptance predicate is:

`existing source/identity gates AND B(boundary) AND C(coverage) AND R(relation)`.

## 2. Current-code contract map and root cause

| Boundary | Current owner | Design delta / non-delta |
| --- | --- | --- |
| Exact case, source bytes, policy, PDF/MinerU lineage | `verifyAndBindSource`, existing manufacturer/installation owners and G3a anchor validation | Unchanged; original objects are read and hash/length checked before relation replay |
| MinerU page/item and HTML-to-original-JSON offsets | `replaySourceRelations` selected locator and unique canonical string mapping | Unchanged; no number-only search or reserialized replacement source |
| Parsed table semantics and original positions | One Cheerio/parse5 fragment parse with source locations | Add B before C and R; never introduce a different AST |
| Original token/text coverage | Existing R3 coverage in the same relation function | Retain atomic coverage; make the ignored-gap alphabet explicit |
| Typed source result | `SOURCE_RELATION_CANDIDATE_GAP` | Reuse; failure is local to the requested relation/Claim, not an automatic deletion or quarantine of the PDF |
| Stored binding and receipt replay | `replayVerifiedSourceBinding` → producer; `createDirectClaimReceipt` and `verifyDirectClaimReceipt` | Unchanged APIs, no cached completeness flag; the new condition runs on both fresh and stored paths |
| Persistence, review, completion, publication | Later G5/G6 gates and existing V2 release owners | No new writes or authority; G4b alone does not publish or reconcile all sources |

At the inspected worktree HEAD `7b0764b0c5b099ed19b8af9b46860408c4121083`,
R3 binding SHA is `13ffa057142de8f46aa1c0a18db3f8c39c4f843cc08ae9da62068447b4a3b18d`.
Only the unaccepted receipt module imports it in src/scripts/public; no runtime
search/UI integration was found. G4b code remains uncommitted and blocked.

R3-1 proves a complete 197-code-unit source can yield a selected table span
`[0,147)` with no explicit end tag. The current algorithm covers that shortened
interval perfectly and misses the conflicting tail. The parser's element end
offset is therefore not, on its own, an original-boundary proof.

Primary basis, checked 2026-09-24:

- [HTML table rules](https://html.spec.whatwg.org/multipage/tables.html#the-table-element)
  require both table tags; [tbody rules](https://html.spec.whatwg.org/multipage/tables.html#the-tbody-element)
  permit specific omissions. This supports distinguishing the outer boundary
  from legitimate implicit grouping; it does not classify the source PDF.
- [parse5 ElementLocation](https://parse5.js.org/interfaces/parse5.Token.ElementLocation.html)
  exposes optional start/end-tag locations, distinct from the overall element
  end. The installed implementation is the executable dependency to verify,
  not the latest web documentation alone.
- Installed `parse5` `_attachElementToTree` records the opening token location;
  `_setEndLocation` adds `endTag` only for a matching end-tag token, otherwise
  it uses the triggering token's start as the element end. The installed
  tree adapter retains these source locations. No dependency upgrade proposed.

## 3. B — original boundary proof

Let `H` be the exact HTML string from the already resolved immutable source;
`T` the selected HTML-namespace table in the single parse. Let `S` and `E` be
that node's own source `startTag` and `endTag` locations.

B requires all of the following:

1. Both S and E exist on T from the same parse of H. A whole-element end offset,
   EOF, a sibling's start, or the next text occurrence of a closing tag is not E.
2. All offsets are finite integers in H's original UTF-16 code-unit coordinates,
   with `0 <= S.start < S.end <= E.start < E.end <= H.length`.
3. The node starts at S.start and ends at E.end. The proved interval is
   `[S.start, E.end)`, not an independently chosen or caller-supplied range.
4. The endpoints belong to this exact parsed HTML table. Comments, quoted
   attribute text, other tables and foreign-namespace lookalikes cannot provide
   an endpoint. Matching source positions come from installed parser token
   locations, never regex searching for `<table` / `</table>` strings.
5. Existing nested-table, hidden/inert-context and supported-layout restrictions
   still apply. Source-mapped fragment positions must remain within the proved
   table and preserve existing exact caption/row/cell ownership.

A table closed implicitly by another table, ancestor closure or EOF cannot
establish B. Preserve its original material as a candidate for later scoped
repair; do not synthesize a closing tag or accept the repaired DOM as source.
This is not a rule that every child element needs explicit opening/closing
tags. The current supported implicit tbody and compatible row/cell endings
must remain available where C and R independently hold.

## 4. C — faithful content accounting within a proved interval

Run only after B. Reuse R3's same-parse token/text accounting; do not count an
entire parent's enclosing span as if every character inside had been checked.

- Cover actual individual start/end tokens of supported descendants and the
  table, plus original text spans whose raw content equals parsed text after
  only the existing CR/CRLF normalization. Keep exact original coordinates.
- A text span that coalesces across discarded markup is not faithful, even
  if its visible substring contains the desired number.
- Sort atomic ranges. Reject reversed/empty/out-of-bounds or overlapping
  ranges and every unaccounted non-formatting character up to E.end.
- Gaps may contain only HTML formatting whitespace: TAB, LF, FF, CR or SPACE.
  Do not use broad Unicode trimming to silently discard content. This is a
  narrow specification of the current R3 gap check, not a change to units,
  scalar grammar, field normalization or the historic verifier.
- Implicit nodes contribute no invented source tokens. Existing supported
  implicit grouping can pass through its real descendants. Unsupported
  comments/annotations/representations inside the selected table remain gaps;
  expanding their support is not necessary for this repair.

Thus migrated-out or discarded content inside a proved interval cannot become
irrelevant merely because it is no longer a DOM descendant. B prevents interval
shortening; C prevents content loss inside it. Neither replaces the other.

## 5. R — exact relation semantics and outside content

Retain the existing exact-model caption, allowed header, one scalar row, two
plain cells, full value/unit-cell consumption, exact original fragment offsets,
and unique supported-row requirement. Retain axis/unit/context/profile/authority
gates; the new scope proof does not authorize more field meanings.

A different table following an explicit closing boundary cannot donate its
caption, value or unit. Legitimate explicitly separated tables remain supported
when the selected table independently satisfies B/C/R and the existing anchor
selection is unique. Conversely, an implicit break followed by another table
does not acquire the status of legitimate separation.

Outside content is not automatically false or irrelevant. This local proof
only establishes a supported table relation; it does not resolve page-wide
footnotes, cross-source conflicts or engineering applicability. Existing
profile/context rules and later G5 complete-source adjudication remain required.
Unknown conditions stay unknown; passing this route cannot declare Verified Fit.

## 6. Replay, identity, storage and lifecycle invariants

No new public type, serialized boundary object, trust boolean or global cache.
B/C are local checks in the existing producer. All serialized bindings/receipts
are verified by reconstructing the source through that producer. Same accepted
inputs preserve their payload and IDs; a stored bad receipt must fail even when
its own digest is correct and all original objects are present.

The new checks harden unreleased G4b only. Historical manufacturer/installation
replay is unchanged and its old PASS is not permission for a new receipt. Stored
replay rechecks original objects and B/C/R using the currently reviewed code; it
does not prove that an arbitrary runtime uses the historical parser version.
Build/release acceptance must record the actually resolved Cheerio/parse5
adapter, locked dependency and exact code identities, and rerun affected checks
and independent review when any of them changes. The resolved parser for the
reviewed runtime is Cheerio's nested parse5 7.3.0, not top-level parse5 8.0.0.
No parser identity is added to a receipt or checked on every invocation.
Unsupported serialized schema versions still reject through their existing API
guard; that is separate from parser-version control. Any dependency or ownership
change requires renewed affected checks, not automatic receipt promotion.

| Scenario | Required consequence |
| --- | --- |
| Normal valid exact-model source | Fresh producer and receipt replay agree; existing positive IDs unchanged |
| Wrong model/field, relocated text, discarded token, implicit boundary | Typed relation gap; receipt construction/stored receipt verification reject |
| Same input repeated or retried after interruption | Same deterministic result; no persistence is owned here, so no replacement of earlier evidence |
| Previously stored erroneous receipt | Re-resolve original objects and reject from source proof, not missing-file or hash failures |
| Missing external drive/object | Explicit unavailable/failure through existing reader; no empty success, fallback trust or deletion; portable tests/build remain independent |
| Archived/reference-only model | Source proof creates no current-sale or public visibility authority |
| Parser or adapter upgrade | Build/release acceptance rechecks the actual resolved runtime, affected tests and independent review; stored replay alone cannot certify the historical parser |
| Serialized schema upgrade | Unsupported version rejects through the existing API guard; no automatic rewriting or migration flag |
| Rollback | Preserve originals and failures; G4b stays disconnected from online consumption; no unsafe receipt eligibility is restored by this document |
| Another PDF/table conflicts with this one | Keep complete-source reconciliation required; local success is not first-success adjudication |

BrandRegistry still owns identity; ProductFamily/Platform still grants no
geometry inheritance; DocumentFamily/Profile owns supported extraction shape;
Artifact/Claim/Receipt identities remain separate. This local repair changes
none of those registries or sales/rights/publication owners.

## 7. Required acceptance matrix — future implementation, not results

Each new row must assert the promised typed result through actual factories
and stored replay, not merely observe a DOM or supply a fabricated PASS flag.
Use the existing full-object fixture/capture approach. Preserve prior REDs and
real original-object controls; do not regenerate expected positives from the
implementation under test.

| Group | Required controls and expected result |
| --- | --- |
| R3-1 exact | Replay the preserved bad envelope `f5471da39bccc40f5fe58c78c96886f00e852b34ae211f850b3e74e45c5eb4b4`; fresh and stored paths reject with source relation/replay errors |
| Boundary termination | Missing table end at EOF; implicit table/ancestor closure; later unrelated end tag: candidate gap |
| Literal vs token | Closing-tag text in comment/attribute cannot rescue an absent own end; case/allowed spacing in genuine tags remains parser-defined |
| Valid separate scopes | Normal explicit end; explicit first table then second table/heading: selected relation passes; cross-table borrowed anchors reject |
| Supported omissions | Implicit tbody and compatible omitted child end tags remain positive controls when original owner replay and B/C/R are satisfied; implicit table boundary never becomes positive |
| R1/R2/R3 content loss | Orphan conflicting cells, fostered heading/text, discarded token between rows or inside coalesced text remain rejected, including old stored erroneous envelopes |
| Coordinates | Existing normal/Unicode-prefix/CRLF controls and supported five receipt IDs unchanged; wrong raw-JSON/HTML/UTF-8 offset substitutions reject |
| Gap alphabet | Formatting whitespace permitted; unaccounted non-ASCII content cannot be silently trimmed; content already faithfully represented is not rejected merely for being Unicode |
| Semantics | Existing fractional scalar/hose controls stay valid; wrong SKU/unit/axis/cell/model scope and unresolved profile remain unpromoted |
| Integrity / portability | Full original objects still replay; missing/hash-tampered objects fail; CI absent-store exceptions are explicit and do not suppress portable boundary tests |

Both source adapters call the same relation path. Do not close the repair with
only a MinerU-specific guard: demonstrate that the contract applies to direct
HTML as well, using an owner-valid positive and relevant negative controls.

## 8. Design review and subsequent work boundary

This design may be called review-complete only when a different Terra / Max
auditor has challenged: (a) paired endpoints from repaired topology, (b) false
rejection of supported omissions/separation, (c) original string coordinates,
(d) fresh/stored path equality and (e) separation from global source completion.
If a counterexample or unresolved premise remains, keep DRAFT and pause the
dependent next step rather than claiming the architecture is proved.

Future implementation, if the written design is accepted, remains limited to
the existing binding relation function (at most a small local helper if it
clarifies ownership), focused tests and implementation report. No new module
framework or duplicated schema. An executor performs TDD and affected tests;
a different auditor reviews a frozen delivery. Main verifies evidence and
integration/publication boundaries without rerunning unchanged full suites.

Dependency: accepted source-boundary design → authorized bounded implementation
→ independent code review → exact-commit CI/release gates. G5/G6 are not tests
or prerequisites manufactured to make this local repair appear complete.

This document does not close R3-1, prove new code correct, repair real receipts,
authorize public evidence or report corpus coverage. No source/test modification
or release takes place during the present design-only round.

## 2026-09-30 local candidate checkpoint

The later isolated `codex/g4b-source-boundary-repair` worktree applies B/C/R to
the unreleased G4b producer and corrects D-1 as specified in section 6. This
does not rewrite the 2026-09-24 design/audit history above. The candidate's
implementation, test results, independent patch review and remaining gates are
recorded in [G4b R3 source-boundary repair](../../architecture-v3/execution/G4b-r3-source-boundary-repair.md).

The user subsequently chose D-1 option 1. The candidate now runs
`verify:g4b-build-identity` before both `npm run build` (Vercel's configured
build command) and direct `build:public-deployment`. A reviewed manifest pins
the Cheerio ESM entry resolved from the binding producer and its package tree,
the parse5 and HTMLparser2 tree-adapter packages resolved within that parse
path, the adapter's parse5 and DOMhandler dependencies, the HTMLparser2
alternate parser dependency, `package-lock.json`, and the two G4b
producer/receipt source files. A mismatch fails the build. This is a controlled
build/release acceptance check, not a per-invocation runtime assertion or a
new receipt field. A deployment that bypasses the declared build command is
outside this gate and must not be treated as accepted.
