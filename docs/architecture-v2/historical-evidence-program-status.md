# Historical Evidence Programme Status

Generated: 2026-07-28T15:53:54.152Z

> Counts are deliberately separated by grain. A PDF or MinerU document is not a model receipt, and W/H/D is not Verified Fit.

## Model evidence funnel

| Metric | Grain | Count | Denominator | Rate |
| --- | --- | ---: | ---: | ---: |
| Inventory classified | Historical Model Reference | 8089 | 8089 | 100.00% |
| Models with document links | Historical Model Reference | 1768 | 8089 | 21.86% |
| Models without document links | Historical Model Reference | 6321 | 8089 | 78.14% |
| Models with current valid receipts | Historical Model Reference | 401 | 8089 | 4.96% |
| Models queued for acquisition | Historical Model Reference | 7688 | 8089 | 95.04% |
| Executable model targets | Historical Model Reference | 4969 | 7688 | 64.63% |
| Models in cumulative recovery acceptance | Historical Model Reference | 382 | 8089 | 4.72% |
| Historical models eligible for replacement auto-fill | Historical Model Reference | 321 | 8089 | 3.97% |

## Target outcome funnel

| Metric | Grain | Count | Denominator | Rate |
| --- | --- | ---: | ---: | ---: |
| Models with scheduled evidence work | Historical Model Reference | 4969 | 8089 | 61.43% |
| Blocked models with scheduled evidence work | Historical Model Reference | 6 | 8089 | 0.07% |
| Completed model targets | Historical Model Reference | 401 | 8089 | 4.96% |
| Blocked model targets | Historical Model Reference | 2725 | 8089 | 33.69% |

## Document and parser funnel

| Metric | Grain | Count | Denominator | Rate |
| --- | --- | ---: | ---: | ---: |
| Unique PDF content | Physical Pdf File | 516 | 530 | 97.36% |
| Unique PDF content indexed | Unique Pdf Content | 516 | 516 | 100.00% |
| Indexed PDF content graph nodes | Unique Pdf Content | 1039 | 1039 | 100.00% |
| Valid indexed PDF graph nodes | Unique Pdf Content | 1025 | 1039 | 98.65% |
| Document-model edges with exact or internal model-list proof | Document Model Edge | 569 | 3973 | 14.32% |
| Valid MinerU knowledge documents | Mineru Knowledge Document | 1025 | 1039 | 98.65% |
| MinerU knowledge documents with recognized expressions | Mineru Knowledge Document | 543 | 1025 | 52.98% |
| Complete parser replays | Parser Replay | 455 | 1156 | 39.36% |

## Accepted source lanes

| Metric | Grain | Count | Denominator | Rate |
| --- | --- | ---: | ---: | ---: |
| PDF only | Accepted Model Entry | 291 | 382 | 76.18% |
| HTML only | Accepted Model Entry | 64 | 382 | 16.75% |
| JSON/API only | Accepted Model Entry | 13 | 382 | 3.40% |
| Mixed official source lanes | Accepted Model Entry | 14 | 382 | 3.66% |
| PDF involved | Accepted Model Entry | 305 | 382 | 79.84% |

## Fit publication funnel

| Metric | Grain | Count | Denominator | Rate |
| --- | --- | ---: | ---: | ---: |
| Current products with receipt-bound dimensions | Current Catalog Product | 332 | 3515 | 9.45% |
| Current products with receipt-bound Verified Fit | Current Catalog Product | 0 | 3515 | 0.00% |

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
