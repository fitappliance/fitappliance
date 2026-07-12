# Major-brand PDF acceptance, 2026-07-12

## Result

The JSON-first evidence path was exercised against nine official manufacturer
PDF endpoints. Five exact-model documents passed download, MinerU conversion,
field extraction, identity proof and receipt replay. Four remained quarantined.
No result was promoted to the public catalog by this batch.

| Brand | Model | Outcome | Reason |
| --- | --- | --- | --- |
| Bosch | WAN24126AU | Accepted | Exact-model URL and document scope; H/W/D paragraph parsed as 845/598/590 mm |
| Fisher & Paykel | RF605QZUVB1 | Accepted | Repeated exact-model QRG scope; W/H/D 905/1790/688 mm |
| Haier | HDW15F4B1 | Accepted | Exact QRG scope; W/D 597/599 mm and adjustable height 850-895 mm |
| Hisense | HRBC137 | Accepted | Exact model table; net W/H/D 595/819/575 mm |
| Smeg | DWAU615DB3 | Accepted | Exact-model URL and suffix-axis dimensions 598mmW x 818mmH x 570mmD |
| LG | DVH5-08W | Quarantined | Family specification sheet lacks a structured exact SKU signal |
| Samsung | DV90BB9440GH | Quarantined | Manual uses wildcard family model rather than the exact SKU |
| Westinghouse | WHE5264SC | Quarantined | Dynamic official factsheet endpoint exceeded the 30-second URL budget |
| Electrolux | EQE6160BA | Quarantined | Dynamic official factsheet endpoint exceeded the 30-second URL budget |

## Improvements proven by the run

- Explicit official candidates may use opaque document IDs, but exact identity
  is still proven inside MinerU JSON and at receipt attestation.
- AU-scoped Samsung requests may redirect within Samsung's official host family;
  cross-brand redirects remain rejected.
- Failed candidates retain immutable PDF and MinerU JSON diagnostic artifacts.
- The batch checkpoints after each brand, so a timeout cannot erase prior work.
- Paragraph dimensions, repeated QRG headers, mixed separators, adjustable
  ranges and suffix-axis notation have regression coverage.
- One internal model signal can support parsing, but a receipt still requires an
  independent exact-model signal. Family and wildcard documents fail closed.

The authoritative detail, hashes, object paths, claims and failure messages are
in `data/architecture-v2/reviews/automated/pdf-brand-acceptance-results.json`.
