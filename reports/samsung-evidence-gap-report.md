# Samsung Evidence Gap Report

Source run: 2026-05-10

## Summary

Total failed Samsung candidates: 60
Resolved after source run: 1
Remaining unresolved candidates: 59

- Bucket A: Missing Source (PDP 404): 29
- Bucket B: Missing Clearance: 1
- Bucket C: Unverified Alias: 0
- Bucket D: Unreadable Layout: 29

## Interpretation

This report is diagnostic only. Parser improvements may increase format coverage, but no bucket authorizes guessed clearances, inferred aliases, or retailer-only conclusions.

## Resolved Since Source Run

| SKU | Category | Previous reason |
| --- | --- | --- |
| SRF7300BSS | fridge | PDP Not Found / source missing |

## Bucket A: Missing Source (PDP 404)

No official or approved source PDF could be located.

Count: 29

| SKU | Category | Reason | Error |
| --- | --- | --- | --- |
| DW60M6055FS | dishwasher | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| DV80T5420AB | dryer | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| DV80T5420AW | dryer | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| DV90T6440LB | dryer | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| DV90T7440BT | dryer | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| DV91T6440LE | dryer | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| HAFIN3 | fridge | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| SRF5300BD | fridge | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| SRF7100B | fridge | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| SRF7100S | fridge | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| SRF7300BA | fridge | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| SRF7400BB | fridge | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| SRF7500SB | fridge | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| SRF9900BFH | fridge | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| SRFX7600W | fridge | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| SRL4200S | fridge | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| SRL446DLS | fridge | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| SRL456LS | fridge | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| SRL4600BD | fridge | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| SRL4600S | fridge | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| SRS6100B | fridge | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| SRS6100S | fridge | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| SRS6300B | fridge | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| SRS6500BA | fridge | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| SRS6800BFH | fridge | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| WA12A8376GW | washing_machine | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| WW85T3040WW | washing_machine | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| WW85T504DAE | washing_machine | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
| WW90T504DAW | washing_machine | PDP Not Found / source missing | Samsung official fetch failed with HTTP 404 |
## Bucket B: Missing Clearance

A readable PDF exists and dimensions may be present, but explicit installation clearance is missing.

Count: 1

| SKU | Category | Reason | Error |
| --- | --- | --- | --- |
| DW60BG750FSL | dishwasher | Missing Clearance Section | Samsung dishwasher parser requires explicit clearance figures in an installation section. |
## Bucket C: Unverified Alias

A document appears to describe an engineering/family model rather than the target marketing SKU.

Count: 0

No failures in this bucket.
## Bucket D: Unreadable Layout

A source document exists, but the current layout-aware parser cannot extract safe dimensions.

Count: 29

| SKU | Category | Reason | Error |
| --- | --- | --- | --- |
| DW5343TGBSL | dishwasher | Missing Dimensions Section | Samsung dishwasher parser could not find Width x Depth x Height inside the specification section. |
| DW60H9950FS | dishwasher | Missing Dimensions Section | Samsung dishwasher parser could not find Width x Depth x Height inside the specification section. |
| DW60H9950FW | dishwasher | Missing Dimensions Section | Samsung dishwasher parser could not find Width x Depth x Height inside the specification section. |
| SR269MW | fridge | Missing Dimensions Section | Samsung layout-aware parser could not locate installation/specification sections. |
| SR270MLS | fridge | Missing Dimensions Section | Samsung layout-aware parser could not locate installation/specification sections. |
| SR343LSTC | fridge | Missing Dimensions Section | Samsung fridge parser could not find dimensions inside installation/specification sections. |
| SR397BTC | fridge | Missing Dimensions Section | Samsung fridge parser could not find dimensions inside installation/specification sections. |
| SR399WTC | fridge | Missing Dimensions Section | Samsung fridge parser could not find dimensions inside installation/specification sections. |
| SR627BCTC | fridge | Missing Dimensions Section | Samsung fridge parser could not find dimensions inside installation/specification sections. |
| SRL453DW | fridge | Missing Dimensions Section | Samsung layout-aware parser could not locate installation/specification sections. |
| SRL454DSP | fridge | Missing Dimensions Section | Samsung layout-aware parser could not locate installation/specification sections. |
| WA11M8700GV | washing_machine | Missing Dimensions Section | Samsung washing machine parser could not find a model-specific specification dimensions block. |
| WA14A8377GV | washing_machine | Missing Dimensions Section | Samsung washing machine parser could not find a model-specific specification dimensions block. |
| WD0754W8E | washing_machine | Missing Dimensions Section | Samsung washing machine parser could not find a model-specific specification dimensions block. |
| WD10F7S7SRP | washing_machine | Missing Dimensions Section | Samsung washing machine parser could not find a model-specific specification dimensions block. |
| WD10F8K9ABG | washing_machine | Missing Dimensions Section | Samsung washing machine parser could not find a model-specific specification dimensions block. |
| WD10J8420GW | washing_machine | Missing Dimensions Section | Samsung washing machine parser could not find a model-specific specification dimensions block. |
| WD13J7825KP | washing_machine | Missing Dimensions Section | Samsung washing machine parser could not find a model-specific specification dimensions block. |
| WD75J5410AW | washing_machine | Missing Dimensions Section | Samsung washing machine parser could not find a model-specific specification dimensions block. |
| WD856UHSAWQ | washing_machine | Missing Dimensions Section | Samsung washing machine parser could not find a model-specific specification dimensions block. |
| WD85K6410OW | washing_machine | Missing Dimensions Section | Samsung washing machine parser could not find a model-specific specification dimensions block. |
| WF16J9000KW | washing_machine | Missing Dimensions Section | Samsung layout-aware parser could not locate installation/specification sections. |
| WW11K8412OW | washing_machine | Missing Dimensions Section | Samsung layout-aware parser could not locate installation/specification sections. |
| WW12BB94ADGB | washing_machine | Missing Dimensions Section | Samsung washing machine parser could not find a model-specific specification dimensions block. |
| WW75J5210IW | washing_machine | Missing Dimensions Section | Samsung washing machine parser could not find a model-specific specification dimensions block. |
| WW75J54E0IW | washing_machine | Missing Dimensions Section | Samsung washing machine parser could not find a model-specific specification dimensions block. |
| WW75K5210WW | washing_machine | Missing Dimensions Section | Samsung washing machine parser could not find a model-specific specification dimensions block. |
| WW90DG6U34LB | washing_machine | Missing Dimensions Section | Samsung washing machine parser could not find a model-specific specification dimensions block. |
| WW95N54F5CW | washing_machine | Missing Dimensions Section | Samsung layout-aware parser could not locate installation/specification sections. |
