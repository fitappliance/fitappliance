# Historical Evidence Programme Status

Generated: 2026-07-26T14:40:12.165Z

> Counts are deliberately separated by grain. A PDF or MinerU document is not a model receipt, and W/H/D is not Verified Fit.

## Model evidence funnel

| Metric | Grain | Count | Denominator | Rate |
| --- | --- | ---: | ---: | ---: |
| Inventory classified | Historical Model Reference | 8087 | 8087 | 100.00% |
| Models with document links | Historical Model Reference | 1766 | 8087 | 21.84% |
| Models without document links | Historical Model Reference | 6321 | 8087 | 78.16% |
| Models with current valid receipts | Historical Model Reference | 408 | 8087 | 5.05% |
| Models queued for acquisition | Historical Model Reference | 7679 | 8087 | 94.95% |
| Executable model targets | Historical Model Reference | 4985 | 7679 | 64.92% |
| Models in cumulative recovery acceptance | Historical Model Reference | 389 | 8087 | 4.81% |
| Historical models eligible for replacement auto-fill | Historical Model Reference | 321 | 8087 | 3.97% |

## Target outcome funnel

| Metric | Grain | Count | Denominator | Rate |
| --- | --- | ---: | ---: | ---: |
| Models with scheduled evidence work | Historical Model Reference | 4985 | 8087 | 61.64% |
| Blocked models with scheduled evidence work | Historical Model Reference | 6 | 8087 | 0.07% |
| Completed model targets | Historical Model Reference | 408 | 8087 | 5.05% |
| Blocked model targets | Historical Model Reference | 2700 | 8087 | 33.39% |

## Document and parser funnel

| Metric | Grain | Count | Denominator | Rate |
| --- | --- | ---: | ---: | ---: |
| Unique PDF content | Physical Pdf File | 516 | 530 | 97.36% |
| Unique PDF content indexed | Unique Pdf Content | 516 | 516 | 100.00% |
| Indexed PDF content graph nodes | Unique Pdf Content | 942 | 942 | 100.00% |
| Valid indexed PDF graph nodes | Unique Pdf Content | 927 | 942 | 98.41% |
| Document-model edges with exact or internal model-list proof | Document Model Edge | 548 | 3760 | 14.57% |
| Valid MinerU knowledge documents | Mineru Knowledge Document | 927 | 942 | 98.41% |
| MinerU knowledge documents with recognized expressions | Mineru Knowledge Document | 497 | 927 | 53.61% |
| Complete parser replays | Parser Replay | 442 | 1052 | 42.02% |

## Accepted source lanes

| Metric | Grain | Count | Denominator | Rate |
| --- | --- | ---: | ---: | ---: |
| PDF only | Accepted Model Entry | 298 | 389 | 76.61% |
| HTML only | Accepted Model Entry | 64 | 389 | 16.45% |
| JSON/API only | Accepted Model Entry | 13 | 389 | 3.34% |
| Mixed official source lanes | Accepted Model Entry | 14 | 389 | 3.60% |
| PDF involved | Accepted Model Entry | 312 | 389 | 80.21% |

## Fit publication funnel

| Metric | Grain | Count | Denominator | Rate |
| --- | --- | ---: | ---: | ---: |
| Current products with receipt-bound dimensions | Current Catalog Product | 332 | 3513 | 9.45% |
| Current products with receipt-bound Verified Fit | Current Catalog Product | 0 | 3513 | 0.00% |

## Cross-artifact controls

| Control | Status |
| --- | --- |
| Classification inventory is unique and complete | PASS |
| Acquisition queue accounts for every classified model | PASS |
| Executable queue accounts for every acquisition target | PASS |
| Target outcome projection matches classification and executable work | PASS |
| Every accepted source replays without failure | PASS |
| Replacement reference matches the historical inventory | PASS |
| Current catalogue and Fit audit agree without violations | PASS |
| Every MinerU index has one content-hash graph node and typed model edges | PASS |

## Active diagnostics

| Severity | Code | Message |
| --- | --- | --- |
| CRITICAL | SOURCE_LINK_COVERAGE_LOW | Fewer than half of historical models have any document link. |
| HIGH | MINERU_OBSERVATION_GAP | Valid MinerU documents remain without recognized dimension expressions. |
| CRITICAL | MODEL_RECEIPT_COVERAGE_LOW | Fewer than half of historical models have a current valid evidence receipt. |
| HIGH | VERIFIED_FIT_ZERO | No current catalogue product has complete receipt-bound Fit evidence. |
