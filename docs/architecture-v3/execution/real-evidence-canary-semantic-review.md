# Three real-source canaries — independent original-page review

Status: **SOURCE OBSERVATIONS REVIEWED; SEMANTIC ADJUDICATION AND V3 REISSUE NOT COMPLETE**.

Reviewed 2026-09-14. This is the main agent's review of six full-page renders of
the actual PDFs, independently of the preparation runner's expected values. It
is neither an EvidenceClaimReceipt nor an approval/review-store event. No current
rights, complete installation requirements, public eligibility or Verified Fit
are established by this document.

## Scope and reproducible inputs

The selection is exactly BDF1620W, BDP810W and EWF7524CDWA, each with one source
owner in the historical acceptance bundle. Paths below are relative to the
external evidence root `/Volumes/UGREEN-1TB/FitAppliance`; JSON pointers use
zero-based array indices and PDF page numbers are one-based.

Acceptance bundle SHA-256:
`d947f8bcf15173ceb23fbba98a62459140f8ed9b93bf15c7d5fc5314f6785550`.

The initial replay/render checkpoint is
`evidence/architecture-v3/canary-preparation/records/sha256/c3/21/c3216a655e327e33f1d7ddd28068485cee982605b7eecc42997d9e2f304a0b7d.json`.
Its raw bytes match that SHA-256; its actual observation time is
`2026-09-14T13:41:47.237Z`. It records genuine
`auditHistoricalAcceptanceReceipts` replay: 3 entries, 3 sources, 3 passed,
0 failed, 10 checked referenced objects, with no lower-level fallback used.
This checkpoint is evidence of the bounded replay, not full test-suite proof or
source-semantic approval. Execution logs and exit codes belong in the executor's
separate handoff.

The earlier checkpoint with SHA-256
`9f55fc62b03def82910023caee5de8731a76e9b6b2144a94f85826751c828dc2`
has an incorrect midnight observation timestamp. It is retained as history but
superseded for observation-time evidence by the checkpoint above; it must not be
silently overwritten or used as a current observation.

These three PDF digests are **not in** the older 590-unique-PDF manifest.
Consequently this is 3/3 of the explicit selected-source universe, not 3/590 of
that earlier inventory. No remaining-corpus coverage is inferred.

## Beko BDF1620W

- Owner: `/entries/289/sources/0`; product `fa_prod_c03f70546b84eff87f02746a`.
- PDF SHA-256: `fe7384670caa100d2845dd16570af6143a7bf649cb670742d5b399af18c2e283`.
- MinerU JSON SHA-256: `f79e8b2f1130389a1257bf5dcc2317a8f2c18b6754f46eab99ddf98702bf182c`.
- Source: <https://www.beko.com/content/dam/bekoglobal/au/en/pdf/product/7610669077.pdf>.
- Conversion profile: `hybrid-image-high-v1`; original PDF pages 1 and 2 reviewed.

Page 1 explicitly labels unpackaged width 598 mm, height 850 mm, maximum height
with feet adjustment 865 mm, depth 600 mm and depth with door opened 1150 mm.
The page carries the exact model BDF1620W and SKU 7610669077. The original
Dimensions & Weights paragraph is JSON `/0/15`, with heading `/0/14`.
Packaged dimensions occur in the same paragraph and are not appliance dimensions.

Page 2 has an additional Dimensions diagram at JSON `/1/4`, raw MinerU bbox
`[67,543,915,909]`, and exact model header `/1/5`. Its upper drawing has two
598 mm labels, a lower 570 mm label, height 850 mm (+15), a 30 mm top-board
dimension, and rear-recess labels. The adjacent cabinet drawing shows minimum
598 mm and height 850–865 mm. MinerU preserved this as an image region with an
empty body-text field: **retaining the image is not equivalent to having OCR
transcribed its dimension labels**. These main-agent visual observations must
remain explicitly distinguished from the old OCR text.

Required constraints:

- Retain page 1's 600 mm depth alongside the page 2 diagram. Their datum/scope
  relationship is unresolved; do not invent a tolerance explanation or choose
  598 mm as a replacement closed-envelope depth.
- Preserve the feet-adjustment height range. The 30 mm top-board drawing alone
  does not authorize removing a worktop or subtracting 30 mm from that range.
- Do not map the cabinet minimum to a product dimension or a zero side clearance.
- Do not map 570 mm to total product depth without interpreting its dimension
  endpoints under an approved profile.
- Door-open 1150 mm does not itself establish an opening angle or service access.
- Door/handle inclusion and complete installation requirements remain unresolved.

The legacy bbox `[526,715,833,916]` covers the title plus paragraph; the current
paragraph bbox is `[526,732,833,916]`. This difference is not by itself evidence
of source corruption. Preserve both owners/representations rather than rejecting
correct source data on rectangle equality alone.

## Beko BDP810W

- Owner: `/entries/175/sources/0`; product `fa_prod_5fa0e9d93b2bd1d9c0240b57`.
- PDF SHA-256: `bfef66f009e1bbb2dcec74172f749be9e99b336dde7d1a7c922785a26e1cdcc6`.
- MinerU JSON SHA-256: `3947274f218015c9d56093f20b58b3942b902c1ac8cdb2c3ef4f15caa2f9fd1f`.
- Source: <https://www.beko.com/content/dam/bekoglobal/au/en/pdf/product/7188231280.pdf>.
- Conversion profile: `pipeline-auto-v1`; original PDF pages 1 and 2 reviewed.

Page 1 explicitly labels unpacked height 846 mm, width 597 mm and depth 589 mm.
The PDF's label and value columns are separate OCR blocks: `/0/30` contains the
labels and `/0/47` the ordered values. `/0/29` is the Dimensions & Weights
heading; `/0/52` is the exact model header. Their row relationship was checked
against the original page, not a universal H/W/D assumption.

Page 2 table `/1/7` gives W=597, D=568, H=846, A=1054, B=523, C=31, E=496,
F=215, unit mm, next to dimension drawings. `/1/9` is the exact model header.
The 589 mm and 568 mm depths are both genuinely printed; neither is an OCR-only
typographical error established by this review.

Required constraints:

- Keep both depth values with their respective page/representation. Do not
  overwrite the historic 589 mm with 568 mm merely because the latter is in a
  compact W/D/H table.
- The original page does not explicitly label D=568 mm as “body only”. Do not
  invent body-vs-protrusion semantics, a 21 mm hose allowance, or a tolerance.
- Until scope/datum are established, retain an unresolved relationship rather
  than automatically declaring either same-semantics conflict or agreement.
- The separate page 1 maximum door-opening-angle specification (178 degrees)
  does not prove the illustrated A=1054 mm was measured at that angle.
- Preserve both label and value blocks; no detached numeral may stand in for
  its axis, product row, unit and geometric context.

## Electrolux EWF7524CDWA

- Owner: `/entries/135/sources/0`; product `fa_prod_753f1244da4a93aeab2c6008`.
- PDF SHA-256: `1b8980e6e6e287657658fd2b5c7b58c6013f21d544cf7b2c5393cd7d877e5244`.
- MinerU JSON SHA-256: `f9fee3fa81c18dfa8db90301491d669d33c9e9793ef5eeccf813a70b7387c181`.
- Source: <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=EWF7524CDWA&brand=Electrolux>.
- Conversion profile: `hybrid-image-high-v1`; original PDF pages 3 and 6 reviewed.

Page 3 table `/2/4` gives total product height 850 mm, width 600 mm and depth
575 mm. The exact model header is `/2/10`.

Page 6 image block `/5/1` shows 600 mm, 850 mm and 575* mm. The original-page
footnote reads “*Add 20mm for the hose protrusion at the back.” Preserve the
unchanged OCR spelling separately from this visually checked transcription.
Paragraph `/5/3` says the document is a product-dimensions guide and directs the
reader to the manual for complete installation instructions.

Required constraints:

- The 20 mm is observed rear hose protrusion, not ventilation clearance.
- Do not replace raw product depth 575 mm with a derived 595 mm or claim that
  595 mm is a complete installation-depth requirement.
- Preserve the footnote and disclaimer as required source context. An accepted
  width/height/depth table is not evidence that the installation manual is present.
- Any future service/plumbing mapping must satisfy the versioned semantic and
  installation-context contract; the preparation cannot invent a new inclusion
  component or issue a Claim simply because the arithmetic is easy.
- Complete installation-manual coverage, door/handle scope and other operational
  or service requirements remain gaps for this selected source set.

## Original page-image bindings checked by main

All six are full-page, rotation 0, rendered from the selected PDF, and were
visually inspected at original image resolution. Stored objects use
`evidence/architecture-v3/canary-preparation/objects/sha256/<first2>/<next2>/<sha256>.png`.

| Model | PDF page | Pixels | Rendered PNG SHA-256 |
| --- | --- | --- | --- |
| BDF1620W | 1 | 1241 × 1754 | `9d473a6bd008d2acde3d7f17668df263c2fdaada17315002e3190758a3fd1681` |
| BDF1620W | 2 | 1241 × 1754 | `35331eb7214e9367637210ce6050da365f7f21b223e0f73fadd8ff083023d3f9` |
| BDP810W | 1 | 1241 × 1754 | `bae37c330d14558f206e9e7dc780b6758e4754e8d338a1ac8056f903c8954cd0` |
| BDP810W | 2 | 1241 × 1754 | `f998ee095d1f417749e5fe0c8e12f013941748b8dd21de9a3f4d385ef60aa767` |
| EWF7524CDWA | 3 | 1275 × 1650 | `584ada38e72a7e0959d876ed7aeaa79d8a20a47c29129642337df75c62386970` |
| EWF7524CDWA | 6 | 1275 × 1650 | `a9ef7651e4cb4c502c869bad029cabb61ca49c58c18f4851b7cef5df1b738a75` |

## What this advances, and what it does not

The real-data checkpoint reuses 3 existing MinerU conversions and has 6 original
page renders. It has 0 newly OCR-converted documents and 0 new V3 receipts.
The thin preparation runner's G3a records, typed fragments, negative tests and
reproducible handoff require their own acceptance; the checkpoint is not a
substitute for them. G3b routing/profile attestation and G4–G6 common-standard
receipt construction/replay/review/readiness remain unfinished.

The source-specific layout differences and newly found omissions are now
explicit regression cases. A future active extraction profile must independently
show that it preserves those distinctions and fails closed when required labels,
footnotes, geometry or model context are missing. A public Fit result cannot be
upgraded on the strength of this preparation report.

## Later same-day observations — real OCR and renderer provenance

One actual local MinerU attempt processed BDF1620W page 2 only, using the existing
`hybrid-image-high-v1` profile, MinerU 3.4.4, model revision
`bff20d4ae2bf202df9f45284b4d43681555a97ed`, with cache disabled. It did not
replace the old PDF/JSON pair or write an approval. Attempt start:
`2026-09-14T13:57:59.035Z`.

- Attempt record SHA-256: `6d5088dcab372bb3d4018354fd34a711e768a8a067b6cb6d11559f5753767b63`.
- New candidate JSON SHA-256: `45e9e43bf173c314152cceb64cb878fbff6392f104542ba09c85bb5ac514a7fb`.
- New candidate JSON path: `evidence/architecture-v3/canary-preparation/objects/sha256/45/e9/45e9e43bf173c314152cceb64cb878fbff6392f104542ba09c85bb5ac514a7fb.json`.

Main checked both raw hashes and compared the parsed page against the old JSON:
the entire page-2 structure is identical. `/1/4/content/content` remains an empty
string. Thus **the conversion succeeded but required diagram-label extraction
did not**. The attempt's `SUCCEEDED` status and null conversion-error field do
not clear the source-content gap. Retain `DIAGRAM_LABELS_UNREADABLE` (or an
equivalent explicitly scoped gap) for this region. Do not repeatedly run the
same whole-page profile or count this as an upgraded receipt.

Main additionally ran non-writing `pdftotext -f 2 -l 2 -layout` and
`pdfimages -f 2 -l 2 -list` diagnostics against the same PDF (both exit 0).
The selectable text contains the model and Dimensions heading but not the
dimension numerals visible in the diagram; the page contains multiple embedded
images. Therefore plain text search is not a sufficient path to those labels.
This is a diagnostic observation, not a source-approval alternative. Region-level
image recognition plus dimension-endpoint interpretation remains necessary;
the diagnostics alone do not identify the scope of any numeric label.

A separate bounded render replay at `2026-09-14T14:02:01.307Z` reproduced all six
PNG hashes exactly, with individual page-number/rotation checks. Attestation
record SHA-256:
`f79e8562c4606ecd020069f5f1f007028a4b24f1ad6656981c7e6a1f445be657`.
It binds Poppler `pdftoppm` 26.06.0, its binary SHA-256
`76126535b3a04b7be1db84808e39c4e71218903d4d7cbe846b9b4514c97caf0a`, PNG output
and 150 dpi. Main checked the attestation's raw hash and the current executable
hash. This is a new reproducibility observation, not a retroactive invented
timestamp/version for the initial run. Reuse the existing page-image objects.

Updated actual activity: 3 existing conversions reused; 1 new selected-page
conversion; 0 newly recovered diagram labels in that page; 6 page-image objects
with a matching render replay; 0 new V3 receipts. Formal preparation acceptance
and downstream source-semantic gates still require their separate results.

## Preparation audit boundary — raw observation is not a typed extraction

The separate Anscombe audit of the frozen v1 preparation returned
CHANGES_REQUIRED. The observed PDF labels above remain valid source-review
notes; they do not make arbitrary numeric entries in a selection manifest
mechanically witnessed facts. Main's fix-round ruling is to retain exact raw
JSON blocks and fragment identities without emitting unbound normalized geometry.
Historical claims stay labelled historical, and numerical/axis/unit/range
extraction must acquire its own later profile/claim witnesses. This keeps the
preparation a small adapter rather than a competing source verifier.

The existing local OCR attempt records parser name/version, model revision,
backend, method, profile ID, effort and image-analysis mode. It does **not**
record `tableEnabled` or `formulaEnabled` in the attempt's profile. Those absent
observations cannot be filled from current policy defaults or represented as
complete tool attestation. Keep the original attempt immutable, validate its
recorded metadata exactly, and preserve the remaining provenance limitation.

The preparation runner only references that historical attempt; it does not
execute another OCR conversion. Conversion activity above describes the actual
earlier one-off run, not every subsequent prepare/check-only invocation.
Unaccepted batch `404721ce590473439738b589bda74a97dbbc4024c967d8479efe0c38386cb380`
must not be consumed as accepted G3b input. Preserve it as history while the
executor produces a repaired batch for separate independent re-review.
