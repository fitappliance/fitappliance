# PDF Failure Baseline: 100 Stratified Candidates

**Built:** 2026-07-27

**Artifact SHA-256:** `adce6cbaad3e212e9f4f0535406cde8dfadf47aa59f7c1f0b23e536e24ab67cc`
**Parser mutations during baseline:** 0

## Scope

This is a frozen diagnostic baseline, not a parser acceptance result. It selects 25
recovery candidates from each of the four appliance categories and assigns exactly one
primary failure: the first pipeline layer that does not have durable evidence.

The current recovery queue mostly contains legacy source references without immutable
PDF hashes. A URL path can supply a family hint, but it does not prove whether a PDF is
scanned, tabular, multi-model or diagram-only. Those characteristics remain unconfirmed
until acquisition and MinerU indexing succeed.

## Selection

| Category | Candidates |
| --- | ---: |
| dishwasher | 25 |
| dryer | 25 |
| fridge | 25 |
| washing_machine | 25 |

- Total candidates: **100**
- Distinct brands: **30**
- Distinct source hosts: **25**
- Distinct acquisition routes: **4**
- Existing immutable PDF objects in the sample: **5**
- Policy-compatible MinerU objects in the sample: **5**

## Primary Failure

| First failed layer | Candidates |
| --- | ---: |
| acquisition | 95 |
| page_table_association | 5 |

This distribution means parser-rule work is not yet the first operation for most of the
sample. The source PDF must be acquired, hashed and validated before document layout or
axis semantics can be diagnosed. Existing acquired objects continue to the first later
unclosed layer rather than being counted as acquisition failures.

## Candidate Families

| Rank | Family | Category | Brand | URL hint | Candidate upper bound | Acquired sample PDFs |
| ---: | --- | --- | --- | --- | ---: | ---: |
| 1 | pdf_family_e2762b4b26f7b34c8975 | fridge | Westinghouse | specification_sheet | 86 | 1 |
| 2 | pdf_family_dafd5dbfa43b0dd425b3 | dishwasher | Bosch | specification_sheet | 71 | 0 |
| 3 | pdf_family_5de15841e8f5df531aef | fridge | Smeg | specification_sheet | 45 | 0 |
| 4 | pdf_family_3f739d7852af0591c730 | fridge | Beko | specification_sheet | 40 | 0 |
| 5 | pdf_family_ef1a40e75d86b14e4605 | washing_machine | LG | specification_sheet | 39 | 0 |

The candidate count is only an upper bound. A family becomes eligible for a shared parser
rule after acquisition and replay demonstrate at least
10 exact-model receipts from
one reusable change. URL similarity alone does not approve a parser rule.

## Next Gate

1. Acquire and content-address the selected candidates without changing extraction rules.
2. Re-run this baseline to expose MinerU, association, identity and geometry failures.
3. Confirm document patterns from MinerU regions, not filenames.
4. Approve only families whose projected recovery is at least ten exact-model receipts.
