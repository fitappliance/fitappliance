# Fisher & Paykel Official PDF Ingest

Run date: 2026-05-09

## Scope

This ingest targets stalled Fisher & Paykel discovery candidates that did not have reliable source URLs in `data/manual-evidence.json`.

The pipeline now uses the official Fisher & Paykel AU product page as the source of truth, extracts all PDF resources from the PDP, and applies a multi-document strategy:

- Prefer Quick Reference Guide or specification-sheet PDFs for product dimensions.
- If a fridge QRG lacks explicit air-clearance fields, also fetch Installation Guide PDFs from the same official PDP.
- Parse QRG + Installation Guide together only when both documents are official Fisher & Paykel assets.
- Keep fail-closed behavior when dimensions or clearances remain ambiguous.

The abandoned Appliances Online blind User Manual fallback is intentionally not used.

## Result

| Metric | Count |
| --- | ---: |
| F&P candidates attempted | 74 |
| Validated evidence files added | 53 |
| Failed / held for manual review | 21 |
| Significant legacy-vs-PDF discrepancies in this run | 0 |

## Added Evidence By Category

| Category | Added |
| --- | ---: |
| Dishwasher | 13 |
| Dryer | 13 |
| Fridge | 8 |
| Washing machine | 19 |

## Remaining Failures

| Failure class | Count | Notes |
| --- | ---: | --- |
| Product page not found | 3 | `E450LXFD`, `RF610ADUQSX4`, `DK4W` could not be resolved on the official AU PDP search path. |
| Manifest category mismatch | 1 | `DE7060G2` is a dryer in the official PDF, but the manifest target row is marked as washing machine. The parser correctly rejected it. |
| Missing explicit fridge clearance | 17 | Official QRG / Installation Guide resources were found, but no explicit air-clearance values could be extracted. These remain blocked rather than guessed. |

## Verification

- Targeted parser and batch tests: passed.
- `npm run generate-all`: passed twice with unchanged worktree status on the second run.
- `npm test`: 979 / 979 passing.
- Red-line modules (`search-core`, `search-dom`, RUM, SW, API, workflows, brand canon, clearance config) are unchanged.
