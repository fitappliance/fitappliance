# Evidence Merge Audit — 2026-05-11

## Summary

- Approved evidence files scanned: 1,495
- Products in `data/catalog-final.json` after re-merge: 3,515
- Official PDF merged products after re-merge: 1,479
- Newly recovered product: `LG WTP357B` (`ao-103064`)
- Remaining unmatched evidence files: 15
- Duplicate evidence files after re-merge: 0

## Fix Applied

`WTP357B.json` was previously blocked because the merge index normalized `WTP-357B` and `WTP357B` to the same SKU token. The old logic treated the second raw evidence file as a global duplicate and discarded it before checking the exact `product_id`.

The merge logic now treats colliding SKU/model tokens as ambiguous fallback keys only. Exact `product_id` matches still merge safely.

## Recovered Product

| Product ID | Brand | Model | Category | Evidence |
| --- | --- | --- | --- | --- |
| `ao-103064` | LG | `WTP357B` | washing_machine | `data/pdf-evidence-raw/WTP357B.json` |

## Remaining Unmatched Evidence

These are intentionally left unmatched because an equivalent dotted/no-dot or base-model variant is already present in `catalog-final`. They should not be force-added without a human dedupe decision.

| Raw evidence | Product ID | Model | Category |
| --- | --- | --- | --- |
| `data/pdf-evidence-raw/CBM394NSS.json` | `ao-103819` | `CBM394NSS` | fridge |
| `data/pdf-evidence-raw/CTM202NW.json` | `ao-130135` | `CTM202NW` | fridge |
| `data/pdf-evidence-raw/DBI654IBSAU.json` | `ao-66168` | `DBI654IBSAU` | dishwasher |
| `data/pdf-evidence-raw/DBI654IBXXLSAU.json` | `ao-66169` | `DBI654IBXXLSAU` | dishwasher |
| `data/pdf-evidence-raw/DFI654BXXLAU.json` | `ao-66173` | `DFI654BXXLAU` | dishwasher |
| `data/pdf-evidence-raw/DFI666GXXLAU.json` | `ao-66174` | `DFI666GXXLAU` | dishwasher |
| `data/pdf-evidence-raw/HWF8I1015BX.json` | `ao-178021` | `HWF8I1015BX` | washing_machine |
| `data/pdf-evidence-raw/T208HW.json` | `ao-66212` | `T208HW` | dryer |
| `data/pdf-evidence-raw/T408HDW.json` | `ao-66213` | `T408HDW` | dryer |
| `data/pdf-evidence-raw/T410HDW.json` | `ao-66214` | `T410HDW` | dryer |
| `data/pdf-evidence-raw/W2084CW.json` | `ao-66215` | `W2084CW` | washing_machine |
| `data/pdf-evidence-raw/W4086CW.json` | `ao-66216` | `W4086CW` | washing_machine |
| `data/pdf-evidence-raw/W4086PW.json` | `ao-66217` | `W4086PW` | washing_machine |
| `data/pdf-evidence-raw/W4104CW.json` | `ao-66218` | `W4104CW` | washing_machine |
| `data/pdf-evidence-raw/WH1260P1.json` | `ao-62058` | `WH1260P1` | washing_machine |

## Verification

- `node --test tests/pdf-pipeline/4-merge.test.mjs`
- `node scripts/pdf-pipeline/4-merge.js`

