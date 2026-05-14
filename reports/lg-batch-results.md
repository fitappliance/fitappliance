# LG PDF Batch Sweep

Run at: 2026-05-14T12:21:05.094Z

## Summary

- Total LG pending SKUs processed: 63
- Successful "Verified Fit" extractions: 10
- Fail-closed: 53

## Successful Verified Fit Extractions

| Product ID | SKU | Category | Confidence | Source |
|---|---:|---|---:|---|
| ao-65625 | XD3A15BS | dishwasher | 0.88 | https://gscs-b2c.lge.com/open/downloadFile?fileId=irYywwLMKQrdaYb9RwmJA |
| fridge-manual-lg-gf-l706pl | GF-L706PL | fridge | 0.9 | https://gscs-b2c.lge.com/open/downloadFile?fileId=fedUnZXjQscQf6x6ynOeEQ |
| discovery-dishwasher-lg-xd2a25mb | XD2A25MB | dishwasher | 0.88 | https://gscs-b2c.lge.com/open/downloadFile?fileId=XFUDD7WCYvPmtwnCUJg7w |
| discovery-dryer-lg-dvh1-08wp | DVH1-08WP | dryer | 0.88 | https://gscs-b2c.lge.com/open/downloadFile?fileId=qBtD6KGnaeJRgOsUCABlvQ |
| discovery-dryer-lg-dvh10-10b | DVH10-10B | dryer | 0.88 | https://gscs-b2c.lge.com/open/downloadFile?fileId=l3ZnOgt0HYfuYHxXjG8Fw |
| discovery-dryer-lg-dvh5-08w | DVH5-08W | dryer | 0.88 | https://gscs-b2c.lge.com/open/downloadFile?fileId=pUof6XKiAKggTDi5Im6WeA |
| discovery-dryer-lg-dvh9-09b | DVH9-09B | dryer | 0.88 | https://gscs-b2c.lge.com/open/downloadFile?fileId=pUof6XKiAKggTDi5Im6WeA |
| discovery-dryer-lg-dvh9-09w | DVH9-09W | dryer | 0.88 | https://gscs-b2c.lge.com/open/downloadFile?fileId=pUof6XKiAKggTDi5Im6WeA |
| discovery-washing-machine-lg-wv9-1412b | WV9-1412B | washing_machine | 0.88 | https://gscs-b2c.lge.com/open/downloadFile?fileId=HJoJF6sjLmW0vxZag11e5g |
| discovery-washing-machine-lg-wv9-1412w | WV9-1412W | washing_machine | 0.88 | https://gscs-b2c.lge.com/open/downloadFile?fileId=HJoJF6sjLmW0vxZag11e5g |

## Successes By Category

- dishwasher: 2
- dryer: 5
- fridge: 1
- washing_machine: 2

## Fail-closed Buckets

- Missing PDF: 14
- Model Mismatch: 18
- Unreadable Layout: 21

## Failure Details

| Product ID | SKU | Category | Bucket | Reason |
|---|---:|---|---|---|
| ao-113119 | GT-3S | fridge | Model Mismatch | LG parser could not verify SKU GT-3S against document model tokens. |
| ao-113121 | GT-5S | fridge | Model Mismatch | LG parser could not verify SKU GT-5S against document model tokens. |
| ao-146948 | WVC9-1412W | washing_machine | Unreadable Layout | LG category mismatch: target WASHING_MACHINE but document text indicates DRYER. |
| ao-163198 | GT-6MB | fridge | Unreadable Layout | LG fridge parser could not find the Type 1 / Type 2 dimensions table. |
| ao-55509 | GF-5D712BSL | fridge | Unreadable Layout | LG fridge parser could not find the Type 1 / Type 2 dimensions table. |
| ao-67209 | GT-427HPLE | fridge | Model Mismatch | LG parser could not verify SKU GT-427HPLE against document model tokens. |
| ao-79126 | GT-279BPL | fridge | Model Mismatch | LG parser could not verify SKU GT-279BPL against document model tokens. |
| discovery-dryer-lg-dxh9-09mb | DXH9-09MB | dryer | Unreadable Layout | LG dryer parser could not find a W/H/D dimensions block. |
| discovery-dryer-lg-dxh9-10mb | DXH9-10MB | dryer | Unreadable Layout | LG dryer parser could not find a W/H/D dimensions block. |
| discovery-dryer-lg-dxh9-10w | DXH9-10W | dryer | Unreadable Layout | LG dryer parser could not find a W/H/D dimensions block. |
| discovery-fridge-lg-f324mbl | F324MBL | fridge | Missing PDF | No source_url in data/manual-evidence.json and LG support API returned no PDF |
| discovery-fridge-lg-gb-455btl | GB-455BTL | fridge | Unreadable Layout | LG fridge parser could not find the Type 1 / Type 2 dimensions table. |
| discovery-fridge-lg-gb-455mbl | GB-455MBL | fridge | Unreadable Layout | LG fridge parser could not find the Type 1 / Type 2 dimensions table. |
| discovery-fridge-lg-gb-455wl | GB-455WL | fridge | Unreadable Layout | LG fridge parser could not find the Type 1 / Type 2 dimensions table. |
| discovery-fridge-lg-gb-b300mwh | GB-B300MWH | fridge | Model Mismatch | LG parser could not verify SKU GB-B300MWH against document model tokens. |
| discovery-fridge-lg-gb-b300pl | GB-B300PL | fridge | Model Mismatch | LG parser could not verify SKU GB-B300PL against document model tokens. |
| discovery-fridge-lg-gb455pl | GB455PL | fridge | Missing PDF | No source_url in data/manual-evidence.json and LG support API returned no PDF |
| discovery-fridge-lg-gf-b505pl | GF-B505PL | fridge | Model Mismatch | LG parser could not verify SKU GF-B505PL against document model tokens. |
| discovery-fridge-lg-gf-l500mbl | GF-L500MBL | fridge | Model Mismatch | LG parser could not verify SKU GF-L500MBL against document model tokens. |
| discovery-fridge-lg-gf-l500pl | GF-L500PL | fridge | Model Mismatch | LG parser could not verify SKU GF-L500PL against document model tokens. |
| discovery-fridge-lg-gf-l700mbl | GF-L700MBL | fridge | Model Mismatch | LG parser could not verify SKU GF-L700MBL against document model tokens. |
| discovery-fridge-lg-gf-ln500pl | GF-LN500PL | fridge | Model Mismatch | LG parser could not verify SKU GF-LN500PL against document model tokens. |
| discovery-fridge-lg-gf-v900mb | GF-V900MB | fridge | Missing PDF | No source_url in data/manual-evidence.json and LG support API returned no PDF |
| discovery-fridge-lg-gf-vn500pl | GF-VN500PL | fridge | Model Mismatch | LG parser could not verify SKU GF-VN500PL against document model tokens. |
| discovery-fridge-lg-gs-d600plc | GS-D600PLC | fridge | Model Mismatch | LG parser could not verify SKU GS-D600PLC against document model tokens. |
| discovery-fridge-lg-gs-l600mbl | GS-L600MBL | fridge | Model Mismatch | LG parser could not verify SKU GS-L600MBL against document model tokens. |
| discovery-fridge-lg-gs-l600pl | GS-L600PL | fridge | Model Mismatch | LG parser could not verify SKU GS-L600PL against document model tokens. |
| discovery-fridge-lg-gs-n635pl | GS-N635PL | fridge | Model Mismatch | LG parser could not verify SKU GS-N635PL against document model tokens. |
| discovery-fridge-lg-gt-2wi | GT-2WI | fridge | Unreadable Layout | LG fridge parser could not find the Type 1 / Type 2 dimensions table. |
| discovery-fridge-lg-gt-3s | GT-3S | fridge | Model Mismatch | LG parser could not verify SKU GT-3S against document model tokens. |
| discovery-fridge-lg-gt-5mb | GT-5MB | fridge | Unreadable Layout | LG fridge parser could not find the Type 1 / Type 2 dimensions table. |
| discovery-fridge-lg-gt-5s | GT-5S | fridge | Model Mismatch | LG parser could not verify SKU GT-5S against document model tokens. |
| discovery-fridge-lg-r386mbl | R386MBL | fridge | Missing PDF | No source_url in data/manual-evidence.json and LG support API returned no PDF |
| discovery-washing-machine-lg-1014gx | 1014GX | washing_machine | Missing PDF | No source_url in data/manual-evidence.json and LG support API returned no PDF |
| discovery-washing-machine-lg-1014wx | 1014WX | washing_machine | Missing PDF | No source_url in data/manual-evidence.json and LG support API returned no PDF |
| discovery-washing-machine-lg-1016gx | 1016GX | washing_machine | Missing PDF | No source_url in data/manual-evidence.json and LG support API returned no PDF |
| discovery-washing-machine-lg-1210bx | 1210BX | washing_machine | Missing PDF | No source_url in data/manual-evidence.json and LG support API returned no PDF |
| discovery-washing-machine-lg-1910bx | 1910BX | washing_machine | Missing PDF | No source_url in data/manual-evidence.json and LG support API returned no PDF |
| discovery-washing-machine-lg-1910fgx | 1910FGX | washing_machine | Missing PDF | No source_url in data/manual-evidence.json and LG support API returned no PDF |
| discovery-washing-machine-lg-wd18db8995bz | WD18DB8995BZ | washing_machine | Missing PDF | No source_url in data/manual-evidence.json and LG support API returned no PDF |
| discovery-washing-machine-lg-wd85sw1 | WD85SW1 | washing_machine | Missing PDF | No source_url in data/manual-evidence.json and LG support API returned no PDF |
| discovery-washing-machine-lg-wd90t554dbw | WD90T554DBW | washing_machine | Missing PDF | No source_url in data/manual-evidence.json and LG support API returned no PDF |
| discovery-washing-machine-lg-wtx5-12w | WTX5-12W | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| discovery-washing-machine-lg-wv10-1412b | WV10-1412B | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| discovery-washing-machine-lg-wv5-1208w | WV5-1208W | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| discovery-washing-machine-lg-wv5-1409w | WV5-1409W | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| discovery-washing-machine-lg-wv5-1410w | WV5-1410W | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| discovery-washing-machine-lg-wv9-1409b | WV9-1409B | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| discovery-washing-machine-lg-wvc9-1412b | WVC9-1412B | washing_machine | Missing PDF | No source_url in data/manual-evidence.json and LG support API returned no PDF |
| discovery-washing-machine-lg-wx10-1410mb | WX10-1410MB | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| discovery-washing-machine-lg-wx9-1409mb | WX9-1409MB | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| discovery-washing-machine-lg-wx9-1412w | WX9-1412W | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| discovery-washing-machine-lg-wxc10-1412w | WXC10-1412W | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |

