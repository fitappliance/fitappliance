# Electrolux Group Alias Investigation

Status: relationship evidence captured; all nine candidates remain pending.

## Authority evidence

- Dataset: Australian Government Energy Rating for Household Appliances,
  `rf_2026_07_10.csv`.
- Dataset URL: `https://data.gov.au/data/dataset/559708e5-480e-4f94-8429-c49571e82761/resource/0eabca18-49bb-4a9e-8019-28d5d56501c4/download/rf_2026_07_10.csv`.
- Retrieved: 2026-07-11.
- SHA-256: `cceb22f8a1879ee66cfd0c929a78c441bd08f18933f8ba6a0ae1d1efec202775`.

The register places both ends of every candidate pair in the same submission,
registration, family, manufacturing country, and sales markets:

| Target | Source | Registration | Family | Submit ID | Sold in |
| --- | --- | --- | --- | --- | --- |
| EBE5367BC | EBE5367SC | ARF4011 | EBE5367** | 177949 | Australia, New Zealand |
| WTB2500AH | WTB2500WH | ARF2581 | WTB2500** | 139409 | Australia, Fiji, New Zealand |
| KTB2302AB | KTB2302WB | ARF3931 | KTB2302** | 177959 | Australia, Fiji, New Zealand |
| KTB2502AB | KTB2502WB | ARF3963 | KTB2502** | 177960 | Australia, Fiji, New Zealand |
| KTB2802AB | KTB2802WB | ARF3964 | KTB2802** | 177962 | Australia, Fiji, New Zealand |
| WHE6000BB | WHE6000SB | ARF3968 | WHE6000*B | 177966 | Australia, New Zealand |
| WHE6060BB | WHE6060SB | ARF3969 | WHE6060** | 177993 | Australia, New Zealand |
| WHE6874BA | WHE6874SA | ARF3970 | WHE6874** | 177994 | Australia, New Zealand |
| WHE7074BA | WHE7074SA | ARF3916 | WHE7074** | 178002 | Australia, New Zealand |

## Axis warning

The dataset's `Depth`, `Height`, and `Width` columns do not express physical
W/H/D in the order expected by the current importer for these rows. For
example, WHE6874 is stored as Depth 749, Height 913, Width 1782 while the
physical envelope is W913 x H1782 x D749. The regulator data is accepted only
as relationship evidence and must not populate geometry.

## Decision

This evidence moves WHE6874BA from "no relationship evidence" to a pending
alias candidate. It does not approve any alias. Tier B still requires an
official manufacturer document for the source model and two independent public
market sources that report the same explicitly ordered target-model W/H/D.
Clearance, plumbing, door swing, ventilation, and operation fields are never
inherited through this route.
