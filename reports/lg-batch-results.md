# LG PDF Batch Sweep

Run at: 2026-05-19T14:12:15.282Z

## Summary

- Total LG pending SKUs processed: 118
- Successful "Verified Fit" extractions: 16
- Fail-closed: 102

## Successful Verified Fit Extractions

| Product ID | SKU | Category | Confidence | Source |
|---|---:|---|---:|---|
| ao-79126 | GT-279BPL | fridge | 0.9 | https://gscs-b2c.lge.com/open/downloadFile?fileId=TZeDKr8byA9LNdheupkg |
| fridge-arf2311 | GF-V570PNL | fridge | 0.9 | https://gscs-b2c.lge.com/open/downloadFile?fileId=4BVmESxM2waikj04qc4fUg |
| fridge-arf2548 | GF-B590BLE | fridge | 0.9 | https://gscs-b2c.lge.com/open/downloadFile?fileId=gHqp5PhnAxC8JH3sckpkVw |
| fridge-arf2773 | GF-V570MBLC | fridge | 0.9 | https://gscs-b2c.lge.com/open/downloadFile?fileId=4BVmESxM2waikj04qc4fUg |
| fridge-arf2853 | GF-B530BL | fridge | 0.9 | https://gscs-b2c.lge.com/open/downloadFile?fileId=gHqp5PhnAxC8JH3sckpkVw |
| fridge-arf3215 | GS-N600PL | fridge | 0.9 | https://gscs-b2c.lge.com/open/downloadFile?fileId=4dEfGRBm7iKDAciS6QAuA |
| fridge-arf3255 | GS-D600MBLC | fridge | 0.9 | https://gscs-b2c.lge.com/open/downloadFile?fileId=4dEfGRBm7iKDAciS6QAuA |
| fridge-arf3257 | GS-V600MBLC | fridge | 0.9 | https://gscs-b2c.lge.com/open/downloadFile?fileId=4dEfGRBm7iKDAciS6QAuA |
| fridge-arf3259 | GS-B600MBL | fridge | 0.9 | https://gscs-b2c.lge.com/open/downloadFile?fileId=R7d8TnMM55jQiIKQn92WA |
| fridge-arf3369 | GS-B599PL | fridge | 0.9 | https://gscs-b2c.lge.com/open/downloadFile?fileId=doLEvu69LVO4mSljEhHGDA |
| fridge-arf3383 | GS-B500MB | fridge | 0.9 | https://gscs-b2c.lge.com/open/downloadFile?fileId=dULQ9mWiNttaK8UmRxKtjQ |
| fridge-arf3411 | GB-B300MBL | fridge | 0.9 | https://gscs-b2c.lge.com/open/downloadFile?fileId=c3NATjI0w03U3bkNvJTJaw |
| fridge-arf3412 | GB-W300MBL | fridge | 0.9 | https://gscs-b2c.lge.com/open/downloadFile?fileId=c3NATjI0w03U3bkNvJTJaw |
| fridge-arf3451 | GB-V300MBL | fridge | 0.9 | https://gscs-b2c.lge.com/open/downloadFile?fileId=5ouq1nL856o4jsao2rViIA |
| fridge-arf3517 | GS-B599PLB | fridge | 0.9 | https://gscs-b2c.lge.com/open/downloadFile?fileId=DkauLu0LKvARJsbA0PCiA |
| fridge-arf3780 | GS-D600BML | fridge | 0.9 | https://gscs-b2c.lge.com/open/downloadFile?fileId=R7d8TnMM55jQiIKQn92WA |

## Successes By Category

- fridge: 16

## Fail-closed Buckets

- Clearance Missing: 1
- Missing PDF: 8
- Model Mismatch: 17
- Other: 19
- Unreadable Layout: 57

## Failure Details

| Product ID | SKU | Category | Bucket | Reason |
|---|---:|---|---|---|
| ao-113119 | GT-3S | fridge | Model Mismatch | LG parser could not verify SKU GT-3S against document model tokens. |
| ao-113121 | GT-5S | fridge | Model Mismatch | LG parser could not verify SKU GT-5S against document model tokens. |
| ao-146948 | WVC9-1412W | washing_machine | Unreadable Layout | LG category mismatch: target WASHING_MACHINE but document text indicates DRYER. |
| ao-163198 | GT-6MB | fridge | Unreadable Layout | LG fridge parser could not find the Type 1 / Type 2 dimensions table. |
| ao-55509 | GF-5D712BSL | fridge | Unreadable Layout | LG fridge parser could not find the Type 1 / Type 2 dimensions table. |
| ao-67209 | GT-427HPLE | fridge | Model Mismatch | LG parser could not verify SKU GT-427HPLE against document model tokens. |
| dishwasher-adw1132 | XD4B24UPS | dishwasher | Unreadable Layout | LG dishwasher parser could not find Width X Height X Depth dimensions. |
| fridge-arf2546 | GF-L677SL | fridge | Model Mismatch | LG parser could not verify SKU GF-L677SL against document model tokens. |
| fridge-arf2569 | MF-B664 | fridge | Unreadable Layout | LG fridge parser could not find the Type 1 / Type 2 dimensions table. |
| fridge-arf2596 | GS-V635PLC | fridge | Other | LG old fridge single-column table does not match catalog W/H/D. |
| fridge-arf2599 | GS-L635PLF | fridge | Other | LG old fridge single-column table does not match catalog W/H/D. |
| fridge-arf2603 | GS-VB655PL | fridge | Other | LG old fridge single-column table does not match catalog W/H/D. |
| fridge-arf2608 | GS-D635PLC | fridge | Other | LG old fridge single-column table does not match catalog W/H/D. |
| fridge-arf2762 | GT-5W | fridge | Model Mismatch | LG parser could not verify SKU GT-5W against document model tokens. |
| fridge-arf2790 | GT-4W | fridge | Model Mismatch | LG parser could not verify SKU GT-4W against document model tokens. |
| fridge-arf3069 | GT-1S | fridge | Model Mismatch | LG parser could not verify SKU GT-1S against document model tokens. |
| fridge-arf3095 | GF-D700MBLC | fridge | Model Mismatch | LG parser could not verify SKU GF-D700MBLC against document model tokens. |
| fridge-arf3096 | GF-MV600 | fridge | Unreadable Layout | LG fridge parser could not find the Type 1 / Type 2 dimensions table. |
| fridge-arf3380 | GT-8S | fridge | Model Mismatch | LG parser could not verify SKU GT-8S against document model tokens. |
| fridge-arf3458 | GT-7MB | fridge | Model Mismatch | LG parser could not verify SKU GT-7MB against document model tokens. |
| fridge-arf3463 | GF-B400P | fridge | Model Mismatch | LG parser could not verify SKU GF-B400P against document model tokens. |
| fridge-arf3675 | GF-VN600BM | fridge | Other | LG old fridge single-column table does not match catalog W/H/D. |
| washing_machine-acw1125 | WD1216HTE | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1178 | WD1610NSW | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1182 | WV10-1412W | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1185 | WV10-1410W | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1268 | WV9-1609B | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1274 | WTG6520 | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1276 | WV9-1610B | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1293 | WVC9-1412W | washing_machine | Unreadable Layout | LG category mismatch: target WASHING_MACHINE but document text indicates DRYER. |
| washing_machine-acw1332 | WTG8020W | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1335 | WTL3-09G | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1336 | WTL9-14W | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1412 | WTG1434BHF | washing_machine | Model Mismatch | LG parser could not verify SKU WTG1434BHF against document model tokens. |
| washing_machine-acw1415 | WTG8521 | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1417 | WTG1234WF | washing_machine | Model Mismatch | LG parser could not verify SKU WTG1234WF against document model tokens. |
| washing_machine-acw1427 | WXLS-1014G | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1443 | WV5-1275W | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1447 | WV6-1409W | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1450 | WV1-1208W | washing_machine | Clearance Missing | LG washing machine parser requires explicit side and rear clearance figures. |
| washing_machine-acw1455 | WTG7520 | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1456 | WTL1-85W | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1484 | WVC5-1409W | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1505 | WXLC-1016GX | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1506 | WX9-1409W | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1507 | WX9-1410MB | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1515 | WTX10-16G | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1574 | WTX9-14W | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1580 | WV6-1410W | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1631 | WTX5-12G | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1684 | WXC101412MB | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1685 | WX10-1412MB | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1745 | WX3-1409W | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1747 | WX3-1410W | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1750 | WTX3-09G | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1751 | WTX3-08W | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1769 | WX3-1208W | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| washing_machine-acw1773 | WX3-1408G | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| discovery-dryer-lg-dxh9-09mb | DXH9-09MB | dryer | Unreadable Layout | LG dryer parser could not find a W/H/D dimensions block. |
| discovery-dryer-lg-dxh9-10mb | DXH9-10MB | dryer | Unreadable Layout | LG dryer parser could not find a W/H/D dimensions block. |
| discovery-dryer-lg-dxh9-10w | DXH9-10W | dryer | Unreadable Layout | LG dryer parser could not find a W/H/D dimensions block. |
| discovery-fridge-lg-f324mbl | F324MBL | fridge | Missing PDF | No source_url in data/manual-evidence.json and LG support API returned no PDF |
| discovery-fridge-lg-gb-455btl | GB-455BTL | fridge | Other | LG old fridge table could not safely disambiguate the requested model column. |
| discovery-fridge-lg-gb-455mbl | GB-455MBL | fridge | Other | LG old fridge table could not safely disambiguate the requested model column. |
| discovery-fridge-lg-gb-455wl | GB-455WL | fridge | Other | LG old fridge table could not safely disambiguate the requested model column. |
| discovery-fridge-lg-gb-b300mwh | GB-B300MWH | fridge | Other | LG old fridge single-column table does not match catalog W/H/D. |
| discovery-fridge-lg-gb-b300pl | GB-B300PL | fridge | Other | LG old fridge single-column table does not match catalog W/H/D. |
| discovery-fridge-lg-gb455pl | GB455PL | fridge | Missing PDF | No source_url in data/manual-evidence.json and LG support API returned no PDF |
| discovery-fridge-lg-gf-b505pl | GF-B505PL | fridge | Other | LG old fridge single-column table does not match catalog W/H/D. |
| discovery-fridge-lg-gf-l500mbl | GF-L500MBL | fridge | Model Mismatch | LG parser could not verify SKU GF-L500MBL against document model tokens. |
| discovery-fridge-lg-gf-l500pl | GF-L500PL | fridge | Other | LG old fridge single-column table does not match catalog W/H/D. |
| discovery-fridge-lg-gf-l700mbl | GF-L700MBL | fridge | Other | LG old fridge table could not safely disambiguate the requested model column. |
| discovery-fridge-lg-gf-ln500pl | GF-LN500PL | fridge | Other | LG old fridge single-column table does not match catalog W/H/D. |
| discovery-fridge-lg-gf-v900mb | GF-V900MB | fridge | Missing PDF | No source_url in data/manual-evidence.json and LG support API returned no PDF |
| discovery-fridge-lg-gf-vn500pl | GF-VN500PL | fridge | Other | LG old fridge single-column table does not match catalog W/H/D. |
| discovery-fridge-lg-gs-d600plc | GS-D600PLC | fridge | Other | LG old fridge single-column table does not match catalog W/H/D. |
| discovery-fridge-lg-gs-l600mbl | GS-L600MBL | fridge | Other | LG old fridge single-column table does not match catalog W/H/D. |
| discovery-fridge-lg-gs-l600pl | GS-L600PL | fridge | Other | LG old fridge single-column table does not match catalog W/H/D. |
| discovery-fridge-lg-gs-n635pl | GS-N635PL | fridge | Model Mismatch | LG parser could not verify SKU GS-N635PL against document model tokens. |
| discovery-fridge-lg-gt-2wi | GT-2WI | fridge | Other | LG old fridge table could not safely disambiguate the requested model column. |
| discovery-fridge-lg-gt-3s | GT-3S | fridge | Model Mismatch | LG parser could not verify SKU GT-3S against document model tokens. |
| discovery-fridge-lg-gt-5mb | GT-5MB | fridge | Unreadable Layout | LG fridge parser could not find the Type 1 / Type 2 dimensions table. |
| discovery-fridge-lg-gt-5s | GT-5S | fridge | Model Mismatch | LG parser could not verify SKU GT-5S against document model tokens. |
| discovery-fridge-lg-r386mbl | R386MBL | fridge | Missing PDF | No source_url in data/manual-evidence.json and LG support API returned no PDF |
| discovery-washing-machine-lg-1014gx | 1014GX | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| discovery-washing-machine-lg-1014wx | 1014WX | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| discovery-washing-machine-lg-1016gx | 1016GX | washing_machine | Unreadable Layout | LG washing_machine parser could not find a W/H/D dimensions block. |
| discovery-washing-machine-lg-1210bx | 1210BX | washing_machine | Unreadable Layout | LG WashTower dimensions do not match the Floor Installation table. |
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

