# G3a — typed artifact lineage, anchors, and relations

**Status:** REVIEW_REQUIRED — bounded implementation and local validation are
recorded; exact final full-suite totals remain for exact-head CI. This is not an
acceptance, receipt, source replay, or evidence-coverage claim.

## Scope and identity boundary

G3a is a pure, portable structural validator. It never acquires, reads, hashes,
replays, approves, or issues a receipt for original source bytes. An artifact
record's `sha256` is the supplied raw-byte observation identity; it is not a
canonical metadata digest. G3a creates no metadata self-hash.

The normalized proof returns the complete, sorted and deeply frozen artifact
closure, fragment closure, anchors, and relations. Its canonical JSON therefore
binds parent/media-type/tool/options metadata together with the validated proof
without conflating that metadata with a raw-byte SHA-256. A later consumer may
define a separate proof-hash domain if it needs one; G3a does not.

## Minimal closed schemas

`ArtifactRecord` is:

```text
{
  schemaVersion: 1,
  sha256: lowercase SHA-256,
  parentSha256: lowercase SHA-256 | null,
  mediaType: lowercase type/subtype,
  toolRevision: non-empty text | null,
  optionsSha256: lowercase SHA-256 | null
}
```

A root has `parentSha256`, `toolRevision`, and `optionsSha256` all `null`.
A derived artifact requires all three derived-provenance fields. The raw hash
remains its byte-observation identity.

`Fragment` is:

```text
{
  schemaVersion: 1,
  canonicalizationVersion: "fit-evidence-json-v3-1",
  fragmentSha256: lowercase SHA-256,
  content: strict JSON,
  parentArtifactSha256: lowercase SHA-256,
  locator: Locator
}
```

`fragmentSha256` must equal SHA-256 of the canonical identity payload containing
the fragment identity domain, schema version, canonicalization version, complete
`content`, parent artifact hash, and complete locator. Raw source/derived bytes
are never substituted into that payload.

`Locator` is exactly one of:

```text
{ kind: "pdf_bbox", pageNumber, normalizedTopLeftBox: [x0,y0,x1,y1],
  renderedPageArtifactSha256, renderedPixels: { width, height },
  rotationDegreesClockwise, transform,
  rawCoordinates: { coordinateSpace, values: [x0,y0,x1,y1] } }
{ kind: "json_pointer", pointer }
{ kind: "html_selector", selectorLanguage: "css", selector }
{ kind: "csv_cell", rowIndex, columnIndex }
{ kind: "text_span", startUtf16CodeUnit, endUtf16CodeUnit }
```

`pdf_bbox.pageNumber` is one-based. `normalizedTopLeftBox` uses top-left axes
and finite numeric values (including fractional coordinates) in the inclusive
0..1000 domain with
`x0 < x1` and `y0 < y1`; values are rejected rather than sorted or coerced.
`renderedPixels.width` and `.height` are positive integers;
`rotationDegreesClockwise` is `0`, `90`, `180`, or `270`. `transform` is either
`{ kind: "full_page" }` or
`{ kind: "crop_from_full_page", fullPageArtifactSha256, normalizedCropBox }`.
The crop box has the same normalized-box rules and maps the crop to its declared
full-page artifact. Raw coordinates retain source order and their declared
coordinate space without axis/unit inference. Page numbers, rendered pixels,
`csv_cell` indexes, and `text_span` offsets are safe integers. `csv_cell`
`rowIndex` and `columnIndex` are zero-based parsed-record indexes, with row zero
representing a header record when one is present; physical line numbers and
quoted embedded newlines do not change that convention. This is a replay locator
convention, not CSV parsing. `text_span` offsets are zero-based UTF-16 code units
with an end-exclusive end.

The PDF coordinate frame is closed as follows. `normalizedTopLeftBox` and
`renderedPixels` always describe the final `renderedPageArtifactSha256` image.
`rotationDegreesClockwise` records the clockwise rotation from the original PDF
page to the complete rendered-page image. For `crop_from_full_page`,
`normalizedCropBox` is in the coordinate frame of that already-rotated complete
`fullPageArtifactSha256`; the crop artifact has no further rotation, flip, or
perspective transform. A consumer can therefore recover a normalized full-page
coordinate uniquely as
`fullX = cropX0 + (cropX1 - cropX0) * cropLocalX / 1000` (and equivalently for
`fullY`). Any output needing another transform is unsupported by this schema;
it must not be represented as `crop_from_full_page`. G3a stores and validates
the declaration but does not implement a coordinate mapper or infer physical
meaning.

An anchor is exactly `{ anchorId, role, fragmentSha256 }`; `role` is one of
`subject`, `value`, `axis`, `unit`, `legend`, `condition`, `configuration`, or
`reference_datum`.

A relation is exactly
`{ kind, fromAnchorId, toAnchorId, witnessAnchorIds }`, where `kind` is one of
`same_table_row`, `diagram_legend`, `explicit_continuation`,
`exact_model_scope`, or `condition_applies`. Each non-empty witness set contains
unique anchor IDs. A witness's resolved fragment content is exactly:

```text
{
  kind: "relation_witness",
  relationKind: RelationKind,
  fromFragmentSha256: lowercase SHA-256,
  toFragmentSha256: lowercase SHA-256
}
```

Every witness must bind the relation kind and the exact ordered endpoint
fragments. A matching document, page, visual proximity, shared root, or random
existing witness never supplies a join.

The normalized structural `Proof` is:

```text
{
  schemaVersion: 1,
  canonicalizationVersion: "fit-evidence-json-v3-1",
  sourceArtifactSha256: lowercase SHA-256,
  artifactRecords: ArtifactRecord[],
  fragments: Fragment[],
  anchors: Anchor[],
  relations: Relation[]
}
```

All arrays are deterministically sorted and deeply frozen. The source artifact
must be the sole root of the complete referenced artifact closure. Every parent,
fragment parent, rendered-page reference, and crop full-page reference resolves
within that root. A crop's declared full-page artifact must be a distinct actual
ancestor of its rendered crop artifact, not merely an image on the same source
root. Cycles, duplicates, ambiguous hashes, unrelated roots, and unwitnessed
multi-fragment components reject. This is candidate-extraction structure only.
G4b separately verifies original-source support and model/row/diagram meaning.

## Later replay boundary

G4b must bind an original-source replay to a digest of the complete normalized
proof closure — all returned artifact provenance records, fragments, locators,
anchors, relations, schema version, and canonicalization version. It must not
consume only an original-file hash or an anchors-only subset. G3a deliberately
does not create that proof digest, perform replay, or approve a candidate.

## Execution evidence

### Task and scope

- **Task/status:** G3a / REVIEW_REQUIRED after the final checks below.
- **Base/current HEAD:** `e529d64045f6aa46b3ce2ebfd4cf5868da47393e` / unchanged
  (the deliverable is intentionally uncommitted for main integration).
- **Branch/worktree:** `codex/architecture-v3-g3a-lineage` /
  `/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline`.
- **Writable deliverables:** only `artifact-lineage.mjs`, `evidence-anchors.mjs`,
  `artifact-lineage.test.mjs`, and this report. The concurrent changed canonical
  plan remains main-owned and untouched.

### Frozen inputs and produced code artifacts

| Item | SHA-256 | Status |
| --- | --- | --- |
| G3a packet | `c4b62580968eeccce0b376d39be08f020455cddfbc848e2fca30b6fc629df16e` | verified |
| READY plan packet | `08e65042a1987b92e16b05398bbc018798f6b9cec1b0144e65631c6fa76400d4` | supplied historic READY input |
| canonical plan, main-owned current status edit | `78f888e172924f53179d78bc42e3bf0f29232cd38b7e61a761bbd789b7838076` | main-reported permitted edit; not reread |
| V3 design | `bf126bbaaed6ce62d57aa71118a9d7cc0e253fdfd46eab9de242dffde96c6367` | verified |
| Terra/Max execution protocol | `2cba6492b913d194c243beeaf776cd7ee47c5636475977ee7ac5b7e5e43fd925` | verified |
| shared canonical codec | `9bdf42c479827662497e1cf74c1ffd13a13d85085675c024c5809dd69647d451` | verified |
| G1a EngineeringContext | `99a4088a0b5e6499e1bb284bb1236a4c3ee47212d176feb619546071daf9b893` | verified |
| G1a semantics | `5b096ae9b2ef154e63b108bc19adcc6803eb8bb2e1dfe2db660c8b39f90be807` | verified |
| `package.json` / lock | `9b317c68418d69ae2ca01dac7bfb797cf0d236233ffc604e156a3a25f4d550f1` / `ad45d58a7bf0e4c88a0b26edc9c73100810358286f2f39354b978bc25238d0e7` | verified |
| active retail pointer | `976a1463dd747763d20c959d52ecceaa1617a52eff6b06f17d9d8f59b2a6f222` | verified, untouched |
| `artifact-lineage.mjs` | `bb375d5a809d3b4137a79e526b21980a1a73ea5d49961c6d73472facd9660eb0` | final output hash |
| `evidence-anchors.mjs` | `19f76808cf5886cf397af31429fc3c7c8e5e497b5e912b8ba3b2dd999286524c` | final output hash |
| focused test file | `09a7cf21a789741af893f1da69768e4be0d12aefee3a7c9937276c5806e0fe99` | final output hash |

The only artifact IDs in tests are synthetic SHA-shaped fixture values
(`a…f` repeated 64 times) and fragment identities computed from portable JSON.
No original source object, response bytes, PDF, OCR output, or receipt was read
or altered.

### Implemented exports and proof semantics

- `createArtifactRecord(input)` returns a frozen schema-1 root or derived record.
  Root raw-byte `sha256` is distinct from metadata; derived records require
  parent hash, media type, non-empty tool revision, and options hash.
- `createFragment(input)` returns a frozen schema-1 fragment carrying the codec
  version. Its declared hash must replay SHA-256 over the explicit fragment
  identity domain, schema/codec versions, content, parent hash, and locator.
- `validateEvidenceAnchors(input)` returns the schema-1 proof shown above: a
  sorted, frozen, referenced provenance closure and only structurally witnessed
  anchor joins. It has no proof digest, source approval, receipt verdict, or
  original-byte replay claim.
- Public failures throw `ArtifactLineageValidationError` with
  `INVALID_ARTIFACT_LINEAGE`, or `EvidenceAnchorValidationError` with
  `INVALID_EVIDENCE_ANCHORS`.

### Behavioral RED then GREEN

The initial absent-module failures were not counted as behavioral RED. Recorded
behavioral RED witnesses were:

1. `createArtifactRecord` returning `null` instead of the required frozen root
   record.
2. A derived record with `toolRevision: null` producing “Missing expected
   exception.”
3. `createFragment` returning `null` instead of the full replayed fragment.
4. `validateEvidenceAnchors` returning `null` instead of a normalized proof.
5. An empty-anchor proof producing “Missing expected exception.”
6. The temporary public locator helper accepting an enumerable `kind` getter;
   the strict-rejection assertion failed, and direct reproduction counted three
   getter reads. The helper is now private; the public constructor witness has
   `getterReads === 0`.

After each minimal implementation/fix, the focused command
`node --test tests/architecture-v3/artifact-lineage.test.mjs` was rerun. Its
latest complete pre-final result was **25 passed, 0 failed**; the final `npm test`
invocation below called the expanded full test glob, but its terminal TAP totals
were truncated. Coverage includes all five
locators, fractional PDF boxes, rotated/cropped positive path, wrong same-root
crop page, missing/ambiguous/cyclic/cross-root ancestry, payload tampering,
versions, roles/kinds, duplicate IDs, exact witness bindings, an unwitnessed
CSV/cross-page legend, input hazards/mutation, and repeated set permutations.

The final changed-surface run passed **2/2** using this compact mutation table
over the existing witnessed-pair fixture:

| Mutation | Required rejection |
| --- | --- |
| `pdf_bbox` omits `transform` | closed locator key is missing |
| source artifact ID | source does not resolve |
| fragment parent artifact ID | fragment parent does not resolve |
| rendered page artifact ID | render reference does not resolve |
| anchor `fragmentSha256` | anchor fragment does not resolve |
| relation endpoint anchor ID | relation endpoint does not resolve |
| relation witness anchor ID | relation witness does not resolve |

### Read-only and boundary checks

- No source acquisition, OCR, private-object read, receipt issuance, runtime Fit
  change, publication mutation, dependency install, commit, push, or build was
  run.
- The active pointer, package/lock, source material, recovery evidence, and the
  main-owned plan were not modified.
- **Real canary:** NOT_RUN by design. G3a uses only portable synthetic fixtures;
  a real source replay/attestation is a later G3b/G4b responsibility.

### Final command record

The following final commands are refreshed immediately before handoff:

| Command | Result |
| --- | --- |
| final changed-surface `node --test --test-name-pattern='(mixed locator keys|every unresolved proof reference)' tests/architecture-v3/artifact-lineage.test.mjs` | PASS — 2 passed, 0 failed |
| `npm run lint` | PASS |
| `npm test` | INCONCLUSIVE — command invoked the V3 syntax check and full test glob; tool output was truncated before TAP totals and its `exit_code` was not retained |
| `validateSchema({outputPath:'/dev/null'})` | PASS — pages=2330, blocks=6145, errors=0 |
| `auditDocs({writeReport:false})` | PASS |
| `git diff --check` | PASS |

`npm test` evidence locator: the single full-test tool invocation immediately
after `npm run lint` reported `Warning: truncated output (original token count:
37114)` and `Total output lines: 3821`. Its visible prefix records the V3 syntax
check as `status: "pass"` and the exact `node --test ... tests/architecture-v3/*.test.mjs`
glob, but the response does not contain the terminal TAP `pass`, `fail`,
`skipped`, or `cancelled` totals. The invocation wrapper emitted only command
output, not `exec_command.exit_code`; those values cannot be recovered honestly
without a rerun. Exact-head CI is the authoritative next full-suite evidence.

### Remaining boundaries for main review

1. Main must independently review the four-file diff and decide integration;
   this implementer does not self-accept, commit, or start G3b.
2. G4b must bind its original-source replay to the digest of this *entire*
   normalized provenance closure, as stated above; G3a neither creates that
   digest nor can detect forged but well-shaped raw provenance metadata.
3. G3a does not establish a model, row, diagram, axis, unit, configuration,
   physical-installation, source-authority, or receipt conclusion.
