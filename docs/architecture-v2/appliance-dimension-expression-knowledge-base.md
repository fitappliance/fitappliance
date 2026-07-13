# Appliance Dimension Expression Knowledge Base

Generated: 2026-07-13T20:02:32.000Z

> This is a non-authoritative research sidecar. Brand, category, series and
> document-family patterns must not authorise model claims, resolve ambiguous
> axes, or bypass exact-model source verification and receipts.

## Coverage

| Metric | Count |
| --- | ---: |
| Historical records | 8095 |
| Categories | 4 |
| Category-brand groups | 358 |
| MinerU documents | 480 |
| Valid MinerU documents | 479 |
| Invalid or orphaned MinerU documents | 1 |
| Documents with recognised expressions | 248 |
| Documents without recognised expressions | 231 |
| Mapped MinerU documents | 467 |
| Unmapped MinerU documents | 12 |
| Dimension-expression observations | 645 |
| Reusable PDF grammar profiles | 130 |
| Research gaps | 606 |

A marketing-series count is a proven minimum, never an estimate of the
manufacturer's complete range. `UNKNOWN` is intentional when official text
does not bind an exact model to a named series.

## How to Use

1. Start with the appliance category and canonical brand; retain the listed raw brand variants for matching.
2. Prefer an officially proven marketing series. Otherwise treat a document family or model-specific group only as a research scope.
3. Match the observed pattern, parser decision and model-binding level. Never copy a value from the pattern into product geometry.
4. Re-run exact-model source verification, MinerU hash checks and receipt generation before any claim or publication change.

A `marketing_series` exists only when official text puts an exact model and an
explicit numeric series name on the same page. A `document_family` is one
official PDF shared by multiple exact models. A `parser_family` groups repeated
PDF syntax only; it is never evidence that models share dimensions or installation
requirements.

Regenerate explicitly with:

```sh
node scripts/architecture-v2/build-dimension-expression-knowledge.mjs \
  --storage-root "$FITAPPLIANCE_STORAGE_ROOT" \
  --generated-at <ISO-8601 timestamp>
```

This command is intentionally outside the normal build and publication graph.

## Brand and PDF Family Index

The series count is a proven minimum. PDF grammar profiles are syntax reuse only,
and every extracted value still requires exact-model identity and receipt checks.

### Refrigerators

| Brand | Inventory models | Indexed PDFs | Proven marketing series | PDF grammar profiles | Coverage |
| --- | ---: | ---: | ---: | ---: | --- |
| AEG | 6 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Airflo | 6 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| AKAI | 9 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Altus | 6 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Anko | 8 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| ARTIC | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Artusi | 27 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| AUCMA | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Beko | 51 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Bellini | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Bertazzoni | 4 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Blaupunkt | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Bosch | 19 | 1 | 1 | 1 | `MINERU_SAMPLE_OBSERVED` |
| Brabantia | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| BROMIC | 9 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| CASA | 20 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| CHIQ | 251 | 26 | 0 | 4 | `MINERU_SAMPLE_OBSERVED` |
| Coldstream | 14 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Crossray Infrared BBQ | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| De Dietrich | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Devanti | 33 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Dometic | 24 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Electrolux | 79 | 9 | 0 | 5 | `MINERU_SAMPLE_OBSERVED` |
| Esatto | 84 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| EURO | 12 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Euromaid | 25 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| EUROMATIC | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Eurotech | 32 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Fhiaba | 365 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Fisher & Paykel | 263 | 63 | 1 | 23 | `MINERU_SAMPLE_OBSERVED` |
| GAGGENAU | 15 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Galanz | 8 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Gasmate | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Germanica | 4 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| GRAM | 5 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Haier | 219 | 7 | 0 | 5 | `MINERU_SAMPLE_OBSERVED` |
| Harbour | 7 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| HELLER | 61 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Hisense | 176 | 43 | 0 | 3 | `MINERU_SAMPLE_OBSERVED` |
| Hitachi | 36 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| HOOVER | 14 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Husky | 47 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| ICELAND | 13 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Ikea | 15 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Ilve | 18 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Imprasio | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Inalto | 37 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| KELVINATOR | 20 | 2 | 0 | 1 | `MINERU_SAMPLE_OBSERVED` |
| Kenmore | 6 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| KingsBottle | 6 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| KLEENMAID | 4 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Kogan | 409 | 2 | 0 | 2 | `MINERU_SAMPLE_OBSERVED` |
| KOLNER | 4 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| KONKA | 11 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| LG | 207 | 22 | 0 | 1 | `MINERU_SAMPLE_OBSERVED` |
| LICENSING ESSENTIALS | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Liebherr | 69 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Linarie | 35 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Living & Co | 17 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| majestic | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Makita | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| meisda | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Midea | 47 | 3 | 0 | 1 | `MINERU_SAMPLE_OBSERVED` |
| Miele | 40 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Mistral | 20 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Mitsubishi | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| MITSUBISHI ELECTRIC | 91 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| modello | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Mykin | 55 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| NAKITA | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| NCE | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| NEFF | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Nero | 10 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Nisbets Essentials | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Norj | 23 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Novello | 7 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Nulon | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Omega | 36 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Panasonic | 13 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| PARMCO | 7 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Polar Refrigeration | 4 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Prinetti | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Pulmuone | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| RHINO | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Robinhood | 37 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| RYOBI | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Samsung | 53 | 1 | 0 | 0 | `MINERU_SAMPLE_OBSERVED` |
| SAMSUNG ELECTRONICS | 42 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Schmick | 13 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| SEIKI | 13 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| SHARP | 5 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Sheffield | 19 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| SHOME I SEIKI | 6 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| SIEMENS | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Simmons | 7 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Smeg | 191 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Solt | 38 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Stirling | 13 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Sub-Zero | 138 | 8 | 0 | 0 | `MINERU_SAMPLE_OBSERVED` |
| SUN PACIFIC TRADE | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Supreme | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| TCL | 62 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| TECO | 67 | 1 | 0 | 1 | `MINERU_SAMPLE_OBSERVED` |
| Teka | 5 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Thermaster | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Throne | 8 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Trade Tested | 8 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Tuscany | 9 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| V-ZUG | 10 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Vinopro | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| VOGUE | 24 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Warrior Refrigeration | 5 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Westinghouse | 290 | 34 | 0 | 20 | `MINERU_SAMPLE_OBSERVED` |
| WHIRLPOOL | 25 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| WINTERWULF | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| yokohama | 22 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |

### Dishwashers

| Brand | Inventory models | Indexed PDFs | Proven marketing series | PDF grammar profiles | Coverage |
| --- | ---: | ---: | ---: | ---: | --- |
| AEG | 15 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Anko | 5 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| ARISTON | 9 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Artusi | 58 | 2 | 0 | 1 | `MINERU_SAMPLE_OBSERVED` |
| ASKO | 67 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Astivita | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| AWARD | 9 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Baumatic | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Beko | 35 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Belling | 4 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Bellini | 26 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Bellissimo | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Bertazzoni | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| BLANCO | 5 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Blaupunkt | 6 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Bosch | 112 | 2 | 2 | 0 | `MINERU_SAMPLE_OBSERVED` |
| CASA | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Comfee | 9 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| De Dietrich | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| De’Longhi | 9 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Devanti | 16 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Di Lusso | 9 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Domain | 9 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Duos | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Electrolux | 20 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Emilia | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Esatto | 21 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| EURO | 33 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Euromaid | 15 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| EUROMATIC | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Eurotech | 4 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Everdure | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| EVOKE | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Fisher & Paykel | 98 | 87 | 1 | 18 | `MINERU_SAMPLE_OBSERVED` |
| FOTILE | 5 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Franke | 6 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| FUJIYAMA | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Fulgor | 5 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| FURON | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| GAGGENAU | 6 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Glen Dimplex | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Hafele | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Haier | 43 | 6 | 0 | 5 | `MINERU_SAMPLE_OBSERVED` |
| HELLER | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Hisense | 12 | 2 | 1 | 2 | `MINERU_SAMPLE_OBSERVED` |
| Home Appliances | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Ikea | 7 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Ilve | 27 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Inalto | 16 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| KLEENMAID | 8 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Kogan | 46 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| LG | 30 | 3 | 0 | 2 | `MINERU_SAMPLE_OBSERVED` |
| majestic | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Master Kitchen | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Midea | 40 | 1 | 0 | 1 | `MINERU_SAMPLE_OBSERVED` |
| Miele | 81 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Milano | 6 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Mistral | 24 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Mykin | 6 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| NEFF | 8 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Norj | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Omega | 59 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| ONIX | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Panasonic | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| PARMCO | 5 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Platinum | 5 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| POLO | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| ROBAM | 4 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Robinhood | 12 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Samsung | 10 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| SAMSUNG ELECTRONICS | 13 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| SEIKI | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| SHARP | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| SIEMENS | 5 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Smeg | 124 | 1 | 0 | 0 | `MINERU_SAMPLE_OBSERVED` |
| Solt | 16 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Stirling | 4 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Technika | 12 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| TECO | 11 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Teka | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Tisira | 7 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Toshiba | 9 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| TRIESTE | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Tuscany | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| V-ZUG | 23 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Veneto | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Venini | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| VOGUE | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Westinghouse | 43 | 2 | 0 | 1 | `MINERU_SAMPLE_OBSERVED` |
| WHIRLPOOL | 32 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| zzz | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |

### Washing Machines

| Brand | Inventory models | Indexed PDFs | Proven marketing series | PDF grammar profiles | Coverage |
| --- | ---: | ---: | ---: | ---: | --- |
| 3J | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| AEG | 25 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| AKAI | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Altus | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Anko | 5 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| ARISTON | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Artusi | 6 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| ASKO | 24 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| AWARD | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| BEKO | 41 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| BL | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| BOSCH | 61 | 3 | 3 | 1 | `MINERU_SAMPLE_OBSERVED` |
| CAMEC | 4 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| carson | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| CHIQ | 41 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Devanti | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Duos | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Electrolux | 59 | 1 | 0 | 1 | `MINERU_SAMPLE_OBSERVED` |
| Esatto | 50 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| EURO | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Euroclean | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Euromaid | 15 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Eurotech | 5 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Everdure | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| EVOKE | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Finch Australia | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Fisher & Paykel | 98 | 70 | 1 | 19 | `MINERU_SAMPLE_OBSERVED` |
| GAGGENAU | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Germanica | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Hafele | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Haier | 77 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| HELLER | 6 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Hisense | 34 | 6 | 1 | 2 | `MINERU_SAMPLE_OBSERVED` |
| Hitachi | 8 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| HOOVER | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Inalto | 50 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| KLEENMAID | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Kogan | 111 | 3 | 0 | 0 | `MINERU_SAMPLE_OBSERVED` |
| LG | 175 | 6 | 0 | 4 | `MINERU_SAMPLE_OBSERVED` |
| Livable | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Living & Co | 11 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| majestic | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| MALBER | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Midea | 50 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Miele | 44 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Mistral | 5 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| MOBORV | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Mykin | 33 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| NCE | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Norj | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Omega | 16 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| ONIX | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Panasonic | 13 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| PARMCO | 7 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| QFLOW | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Robinhood | 14 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| RV ECOWASHER | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Samsung | 55 | 7 | 0 | 3 | `MINERU_SAMPLE_OBSERVED` |
| SAMSUNG ELECTRONICS | 45 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| SEIKI | 16 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| SHARP | 5 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| SHOME I SEIKI | 4 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| SIEMENS | 5 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Smeg | 4 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Solt | 47 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Speed Queen | 29 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Sphere | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Stirling | 16 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Swift | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| TCL | 17 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Technika | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| TECO | 9 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Teka | 5 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| TELEFUNKEN | 6 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Tisira | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Toshiba | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Tuscany | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| V-ZUG | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Vision | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| VOGUE | 13 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Westinghouse | 31 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| WHIRLPOOL | 39 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| yokohama | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |

### Dryers

| Brand | Inventory models | Indexed PDFs | Proven marketing series | PDF grammar profiles | Coverage |
| --- | ---: | ---: | ---: | ---: | --- |
| AEG | 21 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| AKAI | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Altus | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Anko | 7 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| ARISTON | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Artusi | 8 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| ASKO | 24 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| AWARD | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| BEKO | 31 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Bosch | 25 | 4 | 2 | 2 | `MINERU_SAMPLE_OBSERVED` |
| carson | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| CHIQ | 16 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Devanti | 4 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Electrolux | 43 | 2 | 0 | 1 | `MINERU_SAMPLE_OBSERVED` |
| Esatto | 56 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| EURO | 5 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Euroclean | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Euromaid | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Eurotech | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| EVOKE | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Fisher & Paykel | 69 | 32 | 1 | 9 | `MINERU_SAMPLE_OBSERVED` |
| FUJIYAMA | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| GAGGENAU | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Germanica | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Hafele | 6 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Haier | 43 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Hisense | 14 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Hitachi | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| HOOVER | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Inalto | 19 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Kogan | 68 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| LG | 68 | 3 | 0 | 1 | `MINERU_SAMPLE_OBSERVED` |
| majestic | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Midea | 15 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Miele | 49 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Mistral | 4 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Mykin | 15 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Norj | 7 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Omega | 17 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| ONIX | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| OSVO | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| PARMCO | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Platinum | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Prinetti | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Robinhood | 7 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Samsung | 12 | 1 | 0 | 0 | `MINERU_SAMPLE_OBSERVED` |
| SAMSUNG ELECTRONICS | 26 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| SEIKI | 5 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| SHARP | 4 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Sheffield | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| SHOME I SEIKI | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| SIEMENS | 4 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| SIMPSON | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Smeg | 4 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Solt | 35 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| SPEED QUEEN | 18 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Stirling | 12 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| TCL | 4 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Technika | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Teka | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| TELEFUNKEN | 5 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Toshiba | 3 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Tuscany | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| VOGUE | 2 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Westinghouse | 17 | 1 | 0 | 1 | `MINERU_SAMPLE_OBSERVED` |
| WHIRLPOOL | 13 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| Winia | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |
| yokohama | 1 | 0 | 0 | 0 | `NO_MINERU_SAMPLE` |

## Observed Pattern Taxonomy

| Pattern | Unique observations | Meaning |
| --- | ---: | --- |
| `ALTERNATING_AXIS_VALUE_CELLS` | 7 | Diagram table alternating axis tokens and values, including D variants. |
| `DOCUMENT_SCOPED_DIMENSION_MATRIX` | 1 | Dimension axes occupy columns but the exact model identity is elsewhere in the document. |
| `GROUPED_AXIS_SEQUENCE` | 61 | Explicit axis order followed by one three-value sequence. |
| `GROUPED_AXIS_SEQUENCE_WITH_VARIANT` | 7 | Explicit three-axis sequence plus a qualified alternative depth. |
| `INDIVIDUAL_LABELLED_AXIS` | 180 | One named axis/value pair; combine only through independently proven model scope. |
| `INDIVIDUALLY_LABELLED_AXES` | 191 | Two or more dimensions expressed as separate named axis/value pairs. |
| `LETTERED_EXPLICIT_AXIS_LIST` | 6 | Diagram letters explicitly map to axis names and values. |
| `MODEL_COLUMN_DIMENSION_MATRIX` | 1 | Models occupy columns and dimension axes occupy rows. |
| `MODEL_ROW_DIMENSION_MATRIX` | 172 | Models occupy rows and dimension axes occupy columns. |
| `UNLABELLED_DIMENSION_TRIPLE` | 3 | Three values are present without a stated axis order. |

| Parser decision | Unique observations |
| --- | ---: |
| `REJECTED_NON_PRODUCT_SCOPE` | 68 |
| `RESEARCH_ADJUSTABLE_RANGE` | 28 |
| `RESEARCH_DOCUMENT_UNIQUE_SCOPE_REQUIRED` | 1 |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | 131 |
| `RESEARCH_MODEL_SCOPE_REQUIRED` | 19 |
| `RESEARCH_MULTIPLE_VALUES_PER_AXIS` | 6 |
| `RESEARCH_UNIT_MISSING` | 31 |
| `RESEARCH_UNLABELLED_AXIS_ORDER` | 3 |
| `SUPPORTED_EXACT_MODEL_COLUMN_MATRIX` | 1 |
| `SUPPORTED_EXACT_MODEL_ROW_MATRIX` | 13 |
| `SUPPORTED_EXPLICIT_GROUPED` | 33 |
| `SUPPORTED_EXPLICIT_LABELS` | 279 |
| `SUPPORTED_PARTIAL_REJECT_AMBIGUOUS_AXIS_COLUMNS` | 2 |
| `SUPPORTED_PARTIAL_REJECT_AMBIGUOUS_DEPTH` | 7 |
| `SUPPORTED_PARTIAL_REJECT_QUALIFIED_DEPTH_VARIANT` | 7 |

Model binding strength is ordered `SAME_FRAGMENT_EXACT_MODEL` >
`SAME_PAGE_EXACT_MODEL` > `SAME_DOCUMENT_EXACT_MODEL` >
`DOCUMENT_IDENTITY_ONLY`. `UNRESOLVED_MODEL_EXPRESSION` never authorises a
model claim.

## Refrigerators

Inventory: 4336 models across 116 category-brand groups.

### AEG

- Raw brand variants: `AEG`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Airflo

- Raw brand variants: `Airflo`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### AKAI

- Raw brand variants: `AKAI`
- Inventory models: 9
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Altus

- Raw brand variants: `Altus`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Anko

- Raw brand variants: `Anko`
- Inventory models: 8
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### ARTIC

- Raw brand variants: `ARTIC`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Artusi

- Raw brand variants: `Artusi`
- Inventory models: 27
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### AUCMA

- Raw brand variants: `AUCMA`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Beko

- Raw brand variants: `BEKO`, `Beko`
- Inventory models: 51
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Bellini

- Raw brand variants: `Bellini`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Bertazzoni

- Raw brand variants: `Bertazzoni`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Blaupunkt

- Raw brand variants: `Blaupunkt`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Bosch

- Raw brand variants: `BOSCH`, `Bosch`
- Inventory models: 19
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 1
- Proven marketing series: 1; total series count: `PROVEN_MINIMUM_ONLY`
- PDF grammar profiles: 1

#### Series 6

- Group type: `marketing_series`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `KFD96AXEAA`
- PDF SHA-256: `e974d1e890e7411358f1dff86fabb6f9bba2f4b89340062e20e596f1a645f43c`
- PDF grammar profiles: `pdf_grammar_991b34dddad165fd`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://media3.bosch-home.com/Documents/specsheet/en-AU/KFD96AXEAA.pdf>
- Series evidence: page 1, `Series 6, Multi Door Fridge Freezer, 183 x 90.5 cm, Brushed black steel anti-fingerprint, Total NoFrost KFD96AXEAA`; page 2, `Series 6, Multi Door Fridge Freezer, 183 x 90.5 cm, Brushed black steel anti-fingerprint, Total NoFrost KFD96AXEAA`; page 3, `Series 6, Multi Door Fridge Freezer, 183 x 90.5 cm, Brushed black steel anti-fingerprint, Total NoFrost KFD96AXEAA Measurements in mm A: ...`

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Dimensions ( H x W x D) 1830 mm x 905 mm x 731 mm | p.2, `4d7178dc8ef1` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 3: shed black steel anti-fingerprint, Total NoFrost KFD96AXEAA Measurements in mm A: Front is adjustable 1830–1847 mm, with front levellíng feet fully extended

### Brabantia

- Raw brand variants: `Brabantia`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### BROMIC

- Raw brand variants: `BROMIC`
- Inventory models: 9
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### CASA

- Raw brand variants: `CASA`
- Inventory models: 20
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### CHIQ

- Raw brand variants: `CHIQ`
- Inventory models: 251
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 26
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 4

#### CCF142WE

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `CCF142WE`
- PDF SHA-256: `d82a82458da86d88f5f18b4c0d41caa1515f19cb9d43283da484df8f6fe524a3`
- Official/source URLs: <https://chiq.com.au/cdn/shop/files/CCF142WE_SPEC.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: 0a Wire Mesh Partition 1 Finish White LED Light Yes Packing Dimensions (WHD)mm 666 x 882 x 582 WARRANTY 3 years Product Dimensions (WHD)mm 635 x 835 x 556 Fr...

#### CCF199WE

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `CCF199WE`
- PDF SHA-256: `ecaebaf9461605a18d083029bef06a9aae30ba322aed6595de4357b77e426c00`
- Official/source URLs: <https://chiq.com.au/cdn/shop/files/CCF199WE_SPEC.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: 0a Wire Mesh Partition 1 Finish White LED Light Yes Packing Dimensions (WHD)mm 854 x 882 x 582 WARRANTY Product Dimensions (WHD)mm 823 x 835 x 556 Freezer Co...

#### CCF500W5E

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `CCF500W5E`
- PDF SHA-256: `375d609cf27303e5a2b5b3e249207695bbde3c70ddf478de38031aca84f57da0`
- Official/source URLs: <https://chiq.com.au/cdn/shop/files/CCF500W5E_SPEC.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: hite LED Light Yes Finish 1685 x 890 x 780 WARRANTY Packing Dimensions (WHD)mm Freezer 3 years 10 years parts warranty Product Dimensions (WHD)mm 1650 x 835 ...

#### CCF500WE

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `CCF500WE`
- PDF SHA-256: `ecaf939fc211da118c320f2929884651077a1490a2b47b7a23758aa02ac146d6`
- Official/source URLs: <https://chiq.com.au/cdn/shop/files/CCF500WE_SPEC.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: hite LED Light Yes Finish 1685 x 890 x 780 WARRANTY Packing Dimensions (WHD)mm Freezer Compressor 3 years 10 years parts warranty Product Dimensions (WHD)mm ...

#### CSH121NBS

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `CSH121NBS`
- PDF SHA-256: `8d8b77699b2e36dfaf8465457676b21534d44eb56078cba098387b9a9c216480`
- Official/source URLs: <https://chiq.com.au/cdn/shop/files/CSH121NBS_SPEC.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: 00a Pull-out Tray 2 Finish Black Steel Door Shelf 1 Packing Dimensions (WHD)mm 515 x 1188 x 615 Easy-to-Get Ice Box Yes Product Dimensions (WHD)mm 475 x 1155...

#### CSH164NBS

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `CSH164NBS`
- PDF SHA-256: `780aec85a8e6b4f2a7affb8a083774446de3bcc896d3f9c734813daeea8c6402`
- Official/source URLs: <https://chiq.com.au/cdn/shop/files/CSH164NBS_SPEC.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: Fingerprint-free Black Steel Easy-to-Get Ice Box 1 Packing Dimensions (WHD)mm 580 x 1485 x 630 WARRANTY Product Dimensions (WHD)mm 540 x 1443 x 590 Freezer C...

#### CTM347NB5E

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `CTM347NB5E`
- PDF SHA-256: `b052f810a56fd10f9392239bd92a7db034cd5e5fc4dda752a343e31c0fa19d06`
- Official/source URLs: <https://chiq.com.au/cdn/shop/files/CTM347NB5E_SPEC.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: pe R600a Glass Shelves 2 Finish Black Door Basket 4 Packing Dimensions (WHD)mm 638 x 1749 x 729 Butter Box 1 Product Dimensions 595 x 1700 x 685 Crisper with...

#### CTM408NSS5E

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `CTM408NSS5E`
- PDF SHA-256: `c5bf0483ca089eb269ea073f6ffcf5520964eb591f12ce05aa6faa9ec13f84c6`
- Official/source URLs: <https://chiq.com.au/cdn/shop/files/CTM408NSS5E_SPEC.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: / Butter Box 4/1 Finish Stainless Steel Wine Rack 1 Packing Dimensions (WHD)mm 750 x 1751 x 756 Fresh Room 1 Product Dimensions 700 x 1680 × 700 Hanging draw...

#### CTM512NSS5E

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `CTM512NSS5E`
- PDF SHA-256: `85e1a6867403bcb37777fc051a41f467e0ddd219eef8f84c605ecbc73349ecfb`
- Official/source URLs: <https://chiq.com.au/cdn/shop/files/CTM512NSS5E_SPEC.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: / Butter Box 4/1 Finish Stainless Steel Wine Rack 1 Packing Dimensions (WHD)mm 775 x 1760 x 830 Fresh Room 1 Product Dimensions 750 x 1680 x 785 Hanging draw...

#### PDF grammar pdf_grammar_1527a999293b656a

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `CBC064BG`, `CBC094BG`, `CBC233BG`, `CCD499NWS`, `CRSR125DB`, `CSH145NW`, `CSR124DBS`, `CSS556NBD4E`, `CTM086DW`, `CTM118DW`
- PDF SHA-256: `0ed8cb064296a6858ac88c9a14a57bd0e27f1b27453613ce077030c9732dcd38`, `1b5ce99e383ea6b76b13a9206b7351fc95e54965d88195c2e3477a2237b7452d`, `29cb3c6554a962c231b52819401eb5ef34c8a8b93187c0d27e38579a22904f68`, `36574a44500c74b792ad988bb9bbe3fa2a32ea1254596aadfb819871063b1bdc`, `44669176ff8d0354fd56927c6f9e674c45e7463b9bbda969db2ad125c4809b61`, `47a86fb1ded86e5092ca0a113b5baafad615fa054aec2b89b45a850c9fbcfda3`, `5e2f588a8b7ae5fe869dfd7686b3f6581f85cd414020dc2a41294acc0a136be6`, `d45ecb4ed1f1ba6d4725e734641b331a8aab89f54f58a9aa41394e754ce3241d`, `d65a3992c0f2635a9fe511e4f243b06f89aa6e5a0550980e625ad5a070a7881d`, `e350f0f31352130729afd1d15230c805770454645c5e14aefe0f0423eb253467`
- PDF grammar profiles: `pdf_grammar_1527a999293b656a`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://chiq.com.au/cdn/shop/files/CBC064BG_SPEC.pdf>, <https://chiq.com.au/cdn/shop/files/CBC094BG_SPEC.pdf>, <https://chiq.com.au/cdn/shop/files/CBC233BG_SPEC.pdf>, <https://chiq.com.au/cdn/shop/files/CCD499NWS_SPEC.pdf>, <https://chiq.com.au/cdn/shop/files/CRSR125DB_SPEC.pdf>, <https://chiq.com.au/cdn/shop/files/CSH145NW_SPEC.pdf>, <https://chiq.com.au/cdn/shop/files/CSR124DBS_SPEC.pdf>, <https://chiq.com.au/cdn/shop/files/CSS556NBD4E_SPEC.pdf>, <https://chiq.com.au/cdn/shop/files/CTM086DW_SPEC.pdf>, <https://chiq.com.au/cdn/shop/files/CTM118DW_SPEC.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | DEPTH 551mm | p.1, `9a023cc2882c` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | HEIGHT 1137mm | p.1, `2fc4e6a8fc76` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | WIDTH 853mm | p.1, `7e7c4459ad3a` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | DEPTH 498mm | p.1, `045c4f8f7ed4` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | WIDTH 912mm | p.1, `24647bfc5afe` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | DEPTH 551mm | p.1, `9a023cc2882c` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | WIDTH 494mm | p.1, `b7f3e8b6a353` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | WIDTH 474mm | p.1, `7c1f5fea75cc` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | DEPTH 439mm | p.1, `1958d344de85` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | DEPTH 704mm | p.1, `4e9785759325` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | HEIGHT 1440mm | p.1, `35cff0255c7a` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | DEPTH 520mm | p.1, `e788197a1288` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | HEIGHT 845mm | p.1, `b095324e1498` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | HEIGHT 1775mm | p.1, `ef13d1ddbdd3` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | DEPTH 685mm | p.1, `ff4b77347b3d` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | DEPTH 694mm | p.1, `efbb6296cdca` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | HEIGHT 833mm | p.1, `271a1ab303d6` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | DEPTH 500mm | p.1, `b8a7331e8021` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | HEIGHT 847mm | p.1, `a6e7657d3759` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | HEIGHT 635mm | p.1, `a28c711f4958` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | HEIGHT 900mm | p.1, `9b7ad28d99b8` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | WIDTH 494mm | p.1, `b7f3e8b6a353` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | DEPTH 439mm | p.1, `f020dde18b81` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | WIDTH 540mm | p.1, `7bda9be48e5a` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | WIDTH 474mm | p.1, `fcd90771a8c1` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | HEIGHT 847mm | p.1, `a6e7657d3759` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | WIDTH 600mm | p.1, `4e7547726561` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | WIDTH 470mm | p.1, `52fb7b1b0917` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | HEIGHT 1770mm | p.1, `97b0a4a8e557` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | WIDTH 470mm | p.1, `62efcebcb4e7` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: Black Frame Fridge 3 years 10 years parts warranty Packing Dimensions (WHD)mm 580 x 1480 x 590 Compressor (*3 years parts & labour Product Dimensions (WHD)mm...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: e Fridge Compressor 3 years 10 years parts warranty Packing Dimensions (WHD)mm 526 x 890 x 514 (*3 years parts & labour Product Dimensions 474 x 833 x 439 +7...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: ant Type R600a Crisper 2 Finish Black Door Basket 3 Packing Dimensions (WHD)mm 987 x 1844 x 780 Water Dispenser Yes Product Dimensions (WHD)mm 912 x 1770 x 7...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: R600a Tray 2 Finish White 643 x 980 x 724 WARRANTY Packing Dimensions (WHD)mm Product Dimensions Freezer Compressor 3 years (WHD)mm 600 x 900 × 685 10 years ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: or Basket 5 Finish Black Crisper with Glass Cover 1 Packing Dimensions (WHD)mm 528 x 880 x 571 Ice Box 15L Product Dimensions (WHD)mm 494 x 847 x 551 WARRANT...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: ket 5 Finish Black Steel Crisper with Glass Cover 1 Packing Dimensions (WHD)mm 528 x 880 x 571 Ice Box 15L Product Dimensions (WHD)mm 494 x 847 x 551 WARRANT...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: R600a Crisper 1 Finish White Steel Care+ Crisper 1 Packing Dimensions (WHD)mm 918 x 1877 x 747 Door Basket 6 Product Dimensions (WHD)mm 853 x 1775 x 694 FREE...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: or Basket 3 Finish White Crisper with Glass Cover 1 Packing Dimensions (WHD)mm 520 x 1170 x 550 FREEZER COMPARTMENT Product Dimensions (WHD)mm 474 x 1137 x 4...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: or Basket 2 Finish White Crisper with Glass Cover 1 Packing Dimensions (WHD)mm 520 x 879 x 550 FREEZER COMPARTMENT Product Dimensions (WHD)mm 470 × 845 x 500...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: e Fridge Compressor 3 years 10 years parts warranty Packing Dimensions (WHD)mm 495 x 665 x 463 (*3 years parts & labour Product Dimensions (WHD)mm 470 x 635 ...

#### PDF grammar pdf_grammar_24ab514920303947

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `CTM200NSS5E`
- PDF SHA-256: `a18fa4a0562d07615c8228a97c2d87c1c9c0ab68753bf95fe8553dfdc521d613`
- PDF grammar profiles: `pdf_grammar_24ab514920303947`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://chiq.com.au/cdn/shop/files/CTM200NSS5E_SPEC.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | HEIGHT 1465mm | p.1, `370d6987c9d4` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: lass Shelves 2 Finish Stainless Steel Door Basket 3 Packing Dimensions (WHD)mm 580 x 1510 x 630 Crisper with Glass Cover 1 Product Dimensions (WHD)mm 545 x 1...

#### PDF grammar pdf_grammar_944fcad8129c057a

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `CCF700WE`, `CSH206NW`, `CTM255NW5E`, `CTM407NB4`
- PDF SHA-256: `1a68f4ad5d09a32b63aa1b4a9f0e181643ebc9765ac4b484d91c6f38b4a58f3a`, `2fab0be5bf64aabbca94d8317e876e5aa0bc0900c00daa18b915f7c83d012680`, `783e444dcc5a0297c9cad3b14ae081ac712a5af4e224697806d61120d096781b`, `96550b4165789518bb823bffb99aebf4e4b4650c3e9523d7c108bdd3740f861f`
- PDF grammar profiles: `pdf_grammar_944fcad8129c057a`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://chiq.com.au/cdn/shop/files/CCF700WE_SPEC.pdf>, <https://chiq.com.au/cdn/shop/files/CSH206NW_SPEC.pdf>, <https://chiq.com.au/cdn/shop/files/CTM255NW5E_SPEC.pdf>, <https://chiq.com.au/cdn/shop/files/CTM407NB4_SPEC.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | DEPTH 590mm | p.1, `f3f776856b02` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | HEIGHT 945mm | p.1, `e39fd644bdf1` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | HEIGHT 1680mm | p.1, `06d508cac5e4` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | HEIGHT 1700mm | p.1, `e3fd5f5a3fad` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | HEIGHT 1700mm | p.1, `352ec6759cf4` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | DEPTH 735mm | p.1, `8a2262b3dac7` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | DEPTH 700mm | p.1, `e7a1dca1a19c` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | DEPTH 590mm | p.1, `9f472c8ee39d` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: pe R600a Glass Shelves 2 Finish White Door Basket 2 Packing Dimensions (WHD)mm 580 x 1745 × 630 Easy-to-Get Ice Box 1 Product Dimensions (WHD)mm 540 x 1700 x...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: R600a Hanging Drawer 1 Finish Black Glass Shelves 2 Packing Dimensions (WHD)mm 750 × 1751 x 756 Door Basket 4 Product Dimensions 700 x 1680 × 700 Butter Box ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: pe R600a Glass Shelves 3 Finish White Door Basket 3 Packing Dimensions (WHD)mm 580 x 1740 x 630 Crisper with Glass Cover 1 Product Dimensions (WHD)mm 545 x 1...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: rant Type R600a LED Light Yes Finish White WARRANTY Packing Dimensions (WHD)mm 1910 x 1045 x 780 Freezer 3 years 10 years parts warranty Product Dimensions (...

#### PDF grammar pdf_grammar_b43e7538fc63e19b

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `CCF299WE`, `CSH093NW`
- PDF SHA-256: `dc148ede1a0ee91d6c9fb4b7d757d1efeeb6602bd318bacd74d6a10a42db51a9`, `de9b452e494502f89f2ef4331ad639d060f3c022e449042ab2e8498b06696d90`
- PDF grammar profiles: `pdf_grammar_b43e7538fc63e19b`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://chiq.com.au/cdn/shop/files/CCF299WE_SPEC.pdf>, <https://chiq.com.au/cdn/shop/files/CSH093NW_SPEC.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | DEPTH 565mm | p.1, `6ada7d44b654` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | DEPTH 610mm | p.1, `9fa7b951dd50` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: rant Type R600a LED Light Yes Finish White WARRANTY Packing Dimensions (WHD)mm 1160 x 885 x 640 Freezer 3 years Product Dimensions (WHD)mm 1125x 835× 610 Com...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: nt Type R600a Pull-out Tray 1 Finish White WARRANTY Packing Dimensions (WHD)mm Product Dimensions 515 x 1020 x 615 475 × 977 x 565 Freezer Compressor 3 years...

### Coldstream

- Raw brand variants: `Coldstream`
- Inventory models: 14
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Crossray Infrared BBQ

- Raw brand variants: `Crossray Infrared BBQ`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### De Dietrich

- Raw brand variants: `De Dietrich`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Devanti

- Raw brand variants: `Devanti`
- Inventory models: 33
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Dometic

- Raw brand variants: `Dometic`
- Inventory models: 24
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Electrolux

- Raw brand variants: `Electrolux`
- Inventory models: 79
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 9
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 5

#### PDF grammar pdf_grammar_1d93bef07f74f173

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `EBE4507SC`
- PDF SHA-256: `22dfff4536e442b208a836a55eaf113032665b36b7fb47527d5c162af45a49c4`
- PDF grammar profiles: `pdf_grammar_1d93bef07f74f173`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://resource.electrolux.com.au/Public/File/?Id=51297>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `SAME_FRAGMENT_EXACT_MODEL` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height \| Product Width \| Product Depth \| Product Depth (Door Open) \| EBE4507SC \| 1725 \| 699 \| 773 \| 1360 | p.1, `8b85799ace3a` |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height \| Product Width \| Product Depth \| Product Depth (Door Open) \| EBE4507BC \| 1725 \| 699 \| 773 \| 1360 | p.1, `8b85799ace3a` |

#### PDF grammar pdf_grammar_22627d510feaafd6

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `EBE4507SC`, `EBE5307SC`
- PDF SHA-256: `56d1e415086b21e05605724e268e1d72ccf76bfc21571b98285f7a3c78ec2f1d`, `70cf7c1be1f505eb6886348818f6cbd1682072453a17a3935cc5ac76ce9fe67f`
- PDF grammar profiles: `pdf_grammar_22627d510feaafd6`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=EBE4507SC&brand=Electrolux>, <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=EBE5307SC&brand=Electrolux>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | width -> depth -> height -> width -> depth -> depth | none | `mixed_product_and_operation` | Door width (W) \| Total depth (D) \| Maximum height (H) \| Cabinet width (W1) \| Cabinet depth (D1) \| Depth door open (D2) \| EBE4507BB, EBE4507SB \| 699 \| 773 \| 1725 \| 693 ... | p.9, `db88d7d6263b` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1705 \| Cabinet width (mm) 790 \| Cabinet depth (mm) 641 | p.5, `11a26ef4455d` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1705 \| Cabinet width (mm) 693 \| Cabinet depth (mm) 641 | p.5, `619a3de92e29` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1725 \| Total width (mm) 796 \| Total depth (mm) 773 | p.5, `11a26ef4455d` |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | width -> depth -> height -> width -> depth -> depth | none | `mixed_product_and_operation` | Door width (W) \| Total depth (D) \| Maximum height (H) \| Cabinet width (W1) \| Cabinet depth (D1) \| Depth door open (D2) \| EBE5367SB, EBE5307BB, EBE5307SB \| 796 \| 773 \| 1... | p.9, `db88d7d6263b` |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | width -> depth -> height -> width -> depth -> depth | none | `mixed_product_and_operation` | Door width (W) \| Total depth (D) \| Maximum height (H) \| Cabinet width (W1) \| Cabinet depth (D1) \| Depth door open (D2) \| EBE4507BB, EBE4507SB \| 699 \| 773 \| 1725 \| 693 ... | p.9, `db88d7d6263b` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1725 \| Total width (mm) 699 \| Total depth (mm) 773 | p.5, `619a3de92e29` |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | width -> depth -> height -> width -> depth -> depth | none | `mixed_product_and_operation` | Door width (W) \| Total depth (D) \| Maximum height (H) \| Cabinet width (W1) \| Cabinet depth (D1) \| Depth door open (D2) \| EBE5367SB, EBE5307BB, EBE5307SB \| 796 \| 773 \| 1... | p.9, `db88d7d6263b` |

#### PDF grammar pdf_grammar_3cbada3885e4897f

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `EBE5307SC`
- PDF SHA-256: `9433d82d34958bcc942616d3f82e301a7a6403c26fdbc1ab749827af92d66fcb`
- PDF grammar profiles: `pdf_grammar_3cbada3885e4897f`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://resource.electrolux.com.au/Public/File/?Id=51296>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height \| Product Width \| Product Depth \| Product Depth (Door Open) \| EBE5307BC \| 1725 \| 796 \| 773 \| 1457 | p.1, `70025cf94ae0` |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `SAME_FRAGMENT_EXACT_MODEL` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height \| Product Width \| Product Depth \| Product Depth (Door Open) \| EBE5307SC \| 1725 \| 796 \| 773 \| 1457 | p.1, `70025cf94ae0` |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height \| Product Width \| Product Depth \| Product Depth (Door Open) \| EBE5367SC \| 1725 \| 796 \| 773 \| 1457 | p.1, `70025cf94ae0` |

#### PDF grammar pdf_grammar_f2196c80f14b773b

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `EQE5607BA`
- PDF SHA-256: `ea76f7679798934a5dc6fc1bc44c5ec282623935ca21725a2368fba05421bfc9`
- PDF grammar profiles: `pdf_grammar_f2196c80f14b773b`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=EQE5607BA&brand=Electrolux>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `mixed_product_and_operation` | Product Height \| Product Width \| Product Depth \| Product Depth (Door Open) \| EQE5657BA \| 1795 \| 896 \| 755* \| 1112 | p.7, `70e651d028ce` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1795 \| Total width (mm) 896 \| Total depth (mm) 755 | p.4, `802b8cc0272d` |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `SAME_FRAGMENT_EXACT_MODEL` | height -> width -> depth | none | `mixed_product_and_operation` | Product Height \| Product Width \| Product Depth \| Product Depth (Door Open) \| EQE5607BA \| 1795 \| 896 \| 755* \| 1112 | p.7, `70e651d028ce` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1776 \| Cabinet width (mm) 890 \| Cabinet depth (mm) 643 | p.4, `802b8cc0272d` |

#### PDF grammar pdf_grammar_fd6fd1396552b04a

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `EFE4227SC`, `EHE6899SA`, `EQE6870SA`, `ERE5047SC`
- PDF SHA-256: `3ab92a1a4bfce91a70b0ba0d88aeb75a417d0c0456f9f06f0f2ea249ff03995a`, `44406695f25f673c44fef0940f4a9d7566f0ecc319b392da5f70c1fa771e9cd6`, `fb58322ec3a249089855c3a32e7d2bd3c840844dd1057c8b0369b30026a650b3`, `ffce4801e11c9baee7f4eab2f060a26131241141f27ab6181c73c28a1bb05c03`
- PDF grammar profiles: `pdf_grammar_fd6fd1396552b04a`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=EFE4227SC&brand=Electrolux>, <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=EHE6899SA&brand=Electrolux>, <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=EQE6870SA&brand=Electrolux>, <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=ERE5047SC&brand=Electrolux>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1782 \| Total width (mm) 913 \| Total depth (mm) 746 | p.6, `7249070bcbe7` |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height \| Product Width \| Product Depth \| Product Depth (Door Open) \| EHE5267BC \| 1782 \| 913 \| 625 \| 1189 | p.9, `8feb5af58781` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1782 \| Total width (mm) 913 \| Total depth (mm) 749 | p.4, `9efcd43c4019` |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height \| Product Width \| Product Depth \| Product Depth (Door Open) \| EHE6899BA \| 1782 \| 913 \| 746 \| 1189 | p.10, `1e7908f1a5dd` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1756 \| Cabinet width (mm) 908 \| Cabinet depth (mm) 625 | p.6, `7249070bcbe7` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1705 \| Cabinet width (mm) 693 \| Cabinet depth (mm) 640 | p.4, `ecf63ec7ad3f` |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height \| Product Width \| Product Depth \| Product Depth (Door Open) \| ERE5047SC \| 1725 \| 699 \| 773 \| 1360 | p.6, `1856f931314f` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1725 \| Total width (mm) 699 \| Total depth (mm) 773 | p.4, `e17b1191c832` |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `SAME_FRAGMENT_EXACT_MODEL` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height \| Product Width \| Product Depth \| Product Depth (Door Open) \| EHE6899SA \| 1782 \| 913 \| 746 \| 1189 | p.10, `1e7908f1a5dd` |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height \| Product Width \| Product Depth \| Product Depth (Door Open) \| EFE4227SC \| 1725 \| 699 \| 773 \| 1360 | p.7, `ac100a9a1b77` |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `SAME_FRAGMENT_EXACT_MODEL` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height \| Product Width \| Product Depth \| Product Depth (Door Open) \| ERE5047SC \| 1725 \| 699 \| 773 \| 1360 | p.7, `ac100a9a1b77` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1705 \| Cabinet width (mm) 693 \| Cabinet depth (mm) 641 | p.4, `e17b1191c832` |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height \| Product Width \| Product Depth \| Product Depth (Door Open) \| EHE5267SC \| 1782 \| 913 \| 625 \| 1189 | p.9, `8feb5af58781` |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `SAME_FRAGMENT_EXACT_MODEL` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height \| Product Width \| Product Depth \| Product Depth (Door Open) \| EFE4227SC \| 1725 \| 699 \| 773 \| 1360 | p.6, `1856f931314f` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1756 \| Cabinet width (mm) 908 \| Cabinet depth (mm) 625 | p.4, `9efcd43c4019` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1725 \| Total width (mm) 699 \| Total depth (mm) 773 | p.4, `ecf63ec7ad3f` |

### Esatto

- Raw brand variants: `Esatto`
- Inventory models: 84
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### EURO

- Raw brand variants: `EURO`
- Inventory models: 12
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Euromaid

- Raw brand variants: `Euromaid`
- Inventory models: 25
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### EUROMATIC

- Raw brand variants: `EUROMATIC`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Eurotech

- Raw brand variants: `Eurotech`
- Inventory models: 32
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Fhiaba

- Raw brand variants: `Fhiaba`
- Inventory models: 365
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Fisher & Paykel

- Raw brand variants: `Fisher & Paykel`
- Inventory models: 263
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 63
- Proven marketing series: 1; total series count: `PROVEN_MINIMUM_ONLY`
- PDF grammar profiles: 23

#### Document family b5ff35773bed

- Group type: `document_family`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `RF610ADUQSX4`, `RF610ADUSX5`
- PDF SHA-256: `b5ff35773bed6d1f8434e83314bfe7cfd4e812b0be852ac686c7d000c5171af8`
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw0301a71d/QRG/AU/QRG-AU-26493.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

#### Document family e2bb5c28d7c6

- Group type: `document_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `RF730QNUVB1`, `RF730QNUVX1`
- PDF SHA-256: `e2bb5c28d7c61eb156b1b3c0c2849f105f03e6acb5ba28a9ce48b2cf0042f483`
- PDF grammar profiles: `pdf_grammar_67d50cf41babfba5`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw4535b78e/QRG/AU/QRG-AU-26616.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw465c28eb/QRG/AU/QRG-AU-26616.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MULTIPLE_VALUES_PER_AXIS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> depth -> height | height | `product_closed_candidate` | Depth 748 mm \| Depth (less door) 660 mm \| Height 1900 mm | p.2, `8d0c946f7531` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

#### Series 9

- Group type: `marketing_series`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `RS6019S2R1`
- PDF SHA-256: `3f6fb3425ac252050cb2ad6bc304eadf257b065a41e2ce5193f1695b6e67844e`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/7jrn8bzsws7t9bk7skpstb/FP-PlanningGuide-en-RS6019-IntegratedRefrigeratorFreezer-0-90002833D-NZ-AU-UK-IE-SG-EU-CN-ASIA.pdf>
- Series evidence: page 1, `text_list text 60cm Series 9 Integrated Refrigerator Freezer, Ice & Water \| RS6019BRU1 text 60cm Series 9 Integrated Dual Zone Refrigera...`; page 5, `Product Hinge Model Product Hinge Model Product Hinge Model Product Hinge Model Product Hinge Model ① 60cm Series 9 Integrated Right* Ref...`; page 8, `RS6019S2R1 - 60cm Series 9 Integrated Dual Zone Refrigerator`

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 10
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 12: Product Dimensions mm Overall height of product 1880 BOverall width of product 592 ©Overall depth of product (excl. front door panels) 579 Minimum cabinetry ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 13: Product Dimensions mm ROverall height of product 1880 BOverall width of product 592 ©Overall depth of product 579 ①Minimum cabinetry clearance from side of d...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 14: Product Dimensions mm Overall height of product 1880 Overall width of product 592 ©Overall depth of product (excl. front door panels) 579 ⑥Minimum cabinetry ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 15: Product Dimensions mm Overall height of product 1880 BOverall width of product 592 ©Overall depth of product 579 ⑥Minimum cabinetry clearance from side of do...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 20: PRODUCT DIMENSIONS DOUBLE DOOR SINGLE DOOR Dimensions mm mm Overall height of product 1880 1880 Overall width of product 592 592 ©Overall depth of product (n...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 21: Dimensions Door panel height - single door Top door panel height - double door © Gap between door panels Bottom door panel height - double door Door panel wi...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 22: Dimensions Overall height of cavity Overall width of cavity ©Minimum overall depth of cavity (services located at outside of cavity) Minimum overall depth of...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 23: CLEARANCES CUSTOM PANEL Dimensions mm Horizontal gaps between doors 3 Horizontal gaps between door and neighbouring cabinetry 3 ©Vertical gaps between doors ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 24: TOE KICK AND DOOR PANELS CUSTOM PANEL Dimensions mm Overall product height 1880 Minimum cabinetry clearance from top of door panel 3 ©Door panel height - sin...
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 27
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 29: Dimensions mm Overall height of supply routing area at rear of cavity 37 Supply 230 V, 50 Hz Overall width of supply routing area at rear of cavity 600 Servi...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 32: 1 Vertical Handle Top Door Dimensions mm Overall length of handle 524 Overall height of handle 41 ©Overall width of handle 16 ◎Length of off-stand 120 Length...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 33: 1 Vertical Handle Top Door Dimensions mm Overall length of handle 524 Overall height of handle 41 ©Overall width of handle 17 ◎ Length of off-stand 120 Lengt...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 34: 1 Vertical Handle Top Door Dimensions mm Overall length of handle 524 Overall height of handle 55 ©Overall width of handle 22 Length of off-stand 80 ELength ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 35: 1 Vertical Handle Top Door Dimensions mm Overall length of handle 499 Overall height of handle 58 ©Overall width of handle 37 Length of off-stand 60 Distance...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 36: Handle Dimensions mm Overall length of handle 852 Overall height of handle 41 ©Overall width of handle 15 ◎ Length of off-stand 120 Distance between attachme...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 37: Handle Dimensions mm Overall length of handle 852 Overall height of handle 41 ©Overall width of handle 17 Length of off-stand 120 Distance between attachment...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 38: Handle Dimensions mm Overall length of handle 852 Overall height of handle 55 ©Overall width of handle 22 ◎ Length of off-stand 80 Distance between attachmen...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 39: Handle Dimensions mm Overall length of handle 802 Overall height of handle 58 ©Overall width of handle 37 Length of off-stand 60 Distance between attachment ...
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 9

#### RF500QNUX1

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `RF500QNUX1`
- PDF SHA-256: `b8c954080c96bde57c3a3310b0fa8eb2befaf19448228258f8b87ae8ae4e5cc8`
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw979a5de4/QRG/AU/QRG-AU-26619.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: s 2 text Ice bin and scoop text Ice Boost text Installation Dimensions text Minimum inside width of cabinetry frame 830 mm text Minimum internal depth of cab...

#### RF500QNX1

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `RF500QNX1`
- PDF SHA-256: `0ca6a95c649e6b7a8571750d42a304807e4f4c06848f70572bb951921b553670`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/m47brxqq5987r3p6tftjcwv8/FP-UserGuide-en-RF500QNUB1-RF500QNUX1-RF500QNB1-RF500QNX1-QuadDoorRefrigerator-Freezer-0-431113C-NZ-AU-UK-IE.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### RF522BLPW6

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `RF522BLPW6`
- PDF SHA-256: `78b967dd77acd2215cba253f7767cae0307ea44959c7bec92d450142add81323`, `b63e94fd449aca667c4fe8e7215b16af67c89a91d47a4ec4434ddac8e13939e2`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/287znsp3s78kbgj86p7zvbj/FP-DataSheet-RF522BLPW6-FreestandingFridgeFreezer-AU-NZ-90001266A.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/hhr8kktzkrm36z4x93nhqnr/FP-UserInstall-en-E372B-E402B-E442B-E522B-RF372B-RF402B-RF442B-RF522B-RF522W-RF522A-RF610A-RF540A-ActivesmartFridge-0-847797B-NZ-AU-UK-IE-EU-AS-SG.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 1: Product Dimensions in Overall height* of fridge 67 3/4" BOverall width of fridge 31 1/8" © Depth of fridge door and gasket 2 3/4" Depth of fridge door and ch...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 15: E372BRF372B E402BRF402B E442BRF442B E522BRF522B PRODUCT DIMENSIONS mm A Overall height of product 1620 1720 1720 1720 B Overall width of product 635 635 680 ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 17: RF610A/ RF522W RF522A RF540A PRODUCT DIMENSIONS mm AOverall height of product 1720 1720 1800 BOverall width of product 790 790 900 Overall depth of product (...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: Product Dimensions mm Overall height* of fridge 1720 BOverall width of fridge 790 © Depth of fridge door and gasket 70 Depth of fridge door and chassis 695 D...

#### RF522BRPW6

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `RF522BRPW6`
- PDF SHA-256: `f30a427d41a00fa6ea756320936950114814741dfc05b48521496148dafd545e`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/prqp5vvjx92nn5294pv8c7tf/FP-DataSheet-RF522BRPW6-FreestandingFridgeFreezer-AU-NZ-90001265A.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 1: Product Dimensions mm Overall height* of fridge 1720 BOverall width of fridge 790 ©Depth of fridge door and gasket 70 Depth of fridge door and chassis 695 De...

#### RF605QDUVX2

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `RF605QDUVX2`
- PDF SHA-256: `3e975e0b2ea175cf980779af8d292ed7625108c26f6d2843095c542683b36291`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/pb4vxjsp8gr5tnvgb4tzc92v/FP-DataSheet-RF605QDUVX2-FreestandingQuadDoorFridgeFreezer-AU-90001457A.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 1: Product Dimensions in Overall height* of fridge 70 1/2″ B Overall width of fridge 35 5/8″ © Depth of fridge door and gasket (excludes handle) 3 1/16″ Depth o...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: Product Dimensions mm Overall height* of fridge 1790 B Overall width of fridge 905 © Depth of fridge door and gasket (excludes handle) 78 Depth of fridge doo...

#### RF605QDVB2

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `RF605QDVB2`
- PDF SHA-256: `281b6d23d315786de144b47b6e0b23df435c9d5240ba9eb307039f027aa6a7be`, `e7eadeef2cc64361f1e15b1d189d4dab587c226167563ec25d6d4a1d070f2830`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/brfvf8554mmwxs3cp6bjmmgn/FP-UserGuide-en-RF605QDU-RF605QN-RF605QZ-RF605QD-FridgeFreezer-0-867164D-NZ-AU-EU-UK-IE-SG.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Library-Sites-FisherPaykelSharedLibrary/default/dwd1b277cb/pdfs/legal-documents/FP-ACS-en-SecurityDeclaration-AllFactories-0-433450B.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### RF605QNUVX1

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `RF605QNUVX1`
- PDF SHA-256: `5132822e7c3a4efe836e230b9d5f0ab88a99724b6c0f3f7c219fe9ea55773eb0`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/4j8nphwm55wb9vvq6446gn5q/FP-InstallGuide-en-RF605QDUVX1-RF605QDUVX2-RF605QDVX2-RF605QDUVB2-RF605QDVB2-RF605QNUVX1-RF605QNUVB1-RF605QZUVB1-FreestandingQuadDoorFridgeFreezer-0-864778C-NZ-AU-UK-IE-SG.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 6: PRODUCT DIMENSIONS MM AOverall height of product 1790 B Overall width of product 905 © Overall depth of product (excludes handle) 688 D Depth with door open ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 7: CABINETRY DIMENSIONS* RF605QD RF605QN/QZ MM MM A Inside height of cavity** 1810 1810 BInside width90°rotation***full rotation 1025 985 945 945 © Overall dept...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 8: CABINETRY DIMENSIONS RF605QD RF605QN/QZ MM MM A Inside height of cavity* 1810 1835 BInside width90°rotation**full rotation 1105 1065 1105 1105 © Inside depth...

#### RF610ADUQSX4

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `RF610ADUQSX4`
- PDF SHA-256: `4f79dcc3b01fcc50c0bbea0ccc49dc348494828ee623018fdaa55d5a9fe438f9`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/m7wjbsvtj7795m7ggxms9cn/FP-DataSheet-RF610ADUB5-FreestandingFrenchDoorFridgeFreezer-AU-90001308A.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 1: Product Dimensions mm Overall height* of fridge 1790 BOverall width of fridge 900 © Depth of fridge door and gasket (excludes handle) 70 Depth of fridge door...

#### RF610ANUB5

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `RF610ANUB5`
- PDF SHA-256: `e0581f21ff7b4c3cef5d54cd4835669248f56014c5aef57c7d30b6c2048a3bd9`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/fqhnkbnwnq6fvc3f93b3g7w/FP-UserGuide-en-RF3-RF4-RF5-RF6-E3-E4-E5-FreestandingRefrigeratorFreezer-0-867158D-NZ-AU-UK-IE-EU-Asia-SG.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### RF730QNUVX1

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `RF730QNUVX1`
- PDF SHA-256: `2b477acd23f3e2b7c7574207200f44decc59e5be974f84dfcb358171884dbced`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/rm2q4txk7xjxkb68qzqtfx8x/FP-InstallGuide-en-RF730QZUVB1-RF730QNUVX1-RF730QNUVB1-FreestandingQuadDoorRefrigeratorFreezer-0-431084B-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 12: PRODUCT DIMENSIONS MM AOverall height of product 1900 BOverall width of product 905 ©Overall depth of product (excludes handle) 748 DDepth with door open - f...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 13: CABINETRY DIMENSIONS (incI. minimum air clearances) RF730Q MM A Inside height of cavity* 1920 B Inside width 90°rotation** • full rotation 985 945 © Overall ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 14: MINIMUM CLEARANCE DIMENSIONS RF730Q MM A Vent (above refrigerator cabinet or around top of cupboard) 50 B Side clearance • 90° rotation* 60 full rotation 20 ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 15: CABINETRY DIMENSIONS (incl. minimum air clearances) RF730Q MM A Inside height of cavity* 1945 B Inside width • 90°rotation** 1075 full rotation 1125 © Inside...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 16: MINIMUM CLEARANCE DIMENSIONS RF730Q MM A Vent (above refrigerator cabinet or around top of cupboard) 50 B • Side clearance 90° rotation* 60 full rotation 110...

#### RS4621FRJE1

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `RS4621FRJE1`
- PDF SHA-256: `0b8018a821f9665636599eb3250fff1cab8eab65c4cc1e89b391e10eeec9c8e3`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/qhrgtp77fqv927jrwrhhpc/FP-UserGuide-en-RS4621FLJE1-RS4621FRJE1-RS6121FLJE1-RS6121FRJE1-RS7621FLJE1-RS7621FRJE1-IntegratedColumnFreezer-0-432433A-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 9: z Check the dimensions — height, width, depth, floor level, finished alcove returns.

#### RS4621FRJK1

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `RS4621FRJK1`
- PDF SHA-256: `5cc72f920c368ab9305b64b211c881f4c1a82621a7ea5bc1e353010932bd0593`, `77464ce88fea24d9739fa7ecb982bf5bd1f04d11d94560b70ab00daf94c5f80d`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/mkg65cgxc824cv3tmjjhj6cx/FP-UserGuide-zh-RS4621F-RS6121F-RS7621F-RS6121S-RS7621S-Fridge-0-851965A-CN.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/xcxvkp6xgwmkf8rbs9n4q/FP-UserGuide-en-RS6121S-RS7621S-RS4621F-RS6121F-RS7621F-IntegratedRefrigeratorAndFreezer-0-866277E-NZ-AU-UK-IE-SG-Asia.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### RS6009SBL1

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `RS6009SBL1`
- PDF SHA-256: `673ad1ab61ef0a10dcc2defb0353807f2a622e5edcb5879c89d5ebd9a7157956`, `af45ac42a6eef9011d0a6de9569408dbe3dcb13f077fbe384a5365406f3e53df`, `e618c2d8866b1da27b3c296fbb4dc9a4cf9578742a628ffdb47cc2a08e8af47f`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/7ssv9g3kncwz6nvg2tvwh9t/FP-InstallGuide-en-OPIN1-RS6009V2RT1-RS6009V2R1-RS6009SBLT1-RS6009SBL1-IntegratedRefrigeration-AssistedOpeningAccessory-433182A-NZ-AU-SG.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/8qb3sg5h4qfprmcbcvcgbgvj/FP-UserGuide-en-RS6009SBLT1-RS6009SBL1-IntegratedBeverageCentre-0-431766A-NZ-AU-UK-IE-SG-ASIA.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/kxcfkfwwh7nqxfwrwnhwtr6r/FP-InstallGuide-en-RS6009V2RT1-RS6009V2R1-RS6009SBLT1-RS6009SBL1-RS6009V2RT1-RS6009V2R1-RS6009SBLT1-RS6009SBL1-IntegratedRefrigeration-0-431799A-NZ-AU-UK-IE-SG-ASIA.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 5
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 6: CUSTOM PANEL DIMENSIONS MM A Minimum panel height 756 B Minimum panel width 592 © Toe kick width 596 D Toe kick height* 100 - 131 三 Panel thickness 16-19
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 9: z Check the dimensions – height, width, depth, floor level, finished alcove returns.

#### RS6019BRU1

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `RS6019BRU1`
- PDF SHA-256: `1bbaa94c44f12f73171e1ff895d2ec26ce48bc864e9bdef68039dd71a4408840`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/2wmtfjwk2zr6fj3s597vk7g/FP-UserGuide-en-RS6019B-RS6019S-RS6019F-IntegratedFridgeFreezer-0-867351A-NZ-AU-UK-IE-EU-SG-HK.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### RS6121WLUK1

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `RS6121WLUK1`
- PDF SHA-256: `3ccd61aac62af977012279884c214afa73253ffad490d897c0f422e517d239e4`, `ff17c1180129639d875021818b920339bbb3830f565c7feb8ccddf64f45c5ccf`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/433s74qtncswn6mqwrrcxzr3/FP-UserGuide-en-RS6121W-RS7621W-IntegratedRefrigeratorFreezer-0-863030F-NZ-AU-UK-IE-SG-HK.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/79ppqjhb7w8fnvvwpggx5xc/FP-InstallGuide-en-RS4621-RS6121-RS3084-RS2484-RS1884-RS7621-IntegratedColumns-ToeKick-866716A-US-CA-NZ-AU-UK-IE-EU-SG-Asia-CN.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### RS7621SRK1

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `RS7621SRK1`
- PDF SHA-256: `b00c55b49341b6e6d63052cc21eeda89ee314601c7c08b5d1355396c6c4d3e53`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/xfscr9vtc5z3s67c329w8v/FP-PlanningGuide-en-RS4621-RS6121-RS7621-RS9121-IntegratedRefrigeration-0-90003524G-AU-NZ-UK-IE-EU-CN-ASIA-SG.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 13: :Custom Door Panel (stainless steel panel optional) Product Dimensions mm A Overall height of chassis 2134 B Overall width of chassis 451 ©Overall depth of c...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 14: :Custom Door Panel (stainless steel panel optional) Product Dimensions mm AOverall height of chassis 2134 B Overall width of chassis 603 c Overall depth of c...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 15: :Custom Door Panel (stainless steel panel optional) Product Dimensions mm AOverall height of chassis 2134 B Overall width of chassis 603 ©Overall depth of ch...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 16: :Custom Door Panel (stainless steel panel optional) Product Dimensions mm AOverall height of chassis 2134 BOverall width of chassis 603 COverall depth of cha...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 17: Custom Door Panel (stainless steel panel optional) Product Dimensions mm A Overall height of chassis 2134 B Overall width of chassis 756 © Overall depth of c...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 18: Product Dimensions mm AOverall height of chassis 2134 BOverall width of chassis 756 ©Overall depth of chassis (excluding door panel) 610 DFloor to bottom of ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 19: :Custom Door Panel (stainless steel panel optional) Product Dimensions mm AOverall height of chassis 2134 BOverall width of chassis 908 G Overall depth of ch...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 20: Custom Door Panel (stainless steel panel optional) Product Dimensions mm A Overall height of chassis 2134 B Overall width of chassis 908 c Overall depth of c...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 22: SINGLE CAVITY DIMENSIONS 46cm 61cm 76cm 91cm mm mm mm mm AOverall height of cavity 2134 2134 2134 2134 BOverall width of cavity 457 609 762 914 ©Minimum over...
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 23
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 29: Model no: Freezer RS4621FRJE1, RS4621FLJE1 Custom Panel Dimensions mm Centerline of panel RS4621 Single cavityRS4621 Dual/triple cavity 225.5 226.5 BHeight o...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 30: Custom Panel Dimensions mm RCenterline of panel RS6121 Single cavityRS6121 Dual/triple cavity 301.5302.5 RS7621 Single cavityRS7621 Dual/triple cavity 378379...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 31: Custom Panel Dimensions mm A Centerline of panel - single cavity Dual/triple cavity 301.5 302.5 B Height of door panel (standard 102mm from floor) 2029 © Hei...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 32: Custom Panel Dimensions mm ACenterline of panel RS6121W Single cavityRS6121W Dual/triple cavity 301.5 302.5 RS7621W Single cavityRS7621W Dual/triple cavity 3...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 33: Custom Panel Dimensions mm Centerline of door panel - single cavityCenterline of door panel - dual cavity 226 226.75 BCenterline of drawer panel - single cav...

#### RS9120WRU1

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `RS9120WRU1`
- PDF SHA-256: `98206a585aa776101ccd6661b51c12f47ef3d7fc4f20fa32b6348be05a998c2c`, `bd31483c38c10627a364744479f64af4e236be38eeebe4583d83068a485d5f43`, `c1d0c89bd8e486745054f777134731b94e5df48daa9e0aa9a8ae2cb0cf590155`, `ee815cd4890e3fc0b4590b2f30a257f70df24742d8dfc70e02463a6549a20cd8`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/7fgb8x8c6t3fvv68p6rx96k/FP-UserGuide-en-RS80A-RS90A-RS9120W-IntegratedRefrigeratorFreezer-0-867292C-NZ-AU-UK-IE-SG-ASIA.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/9mpt78hhk37b6vp8j3pn4w/FP-PlanningGuide-RS9120WRU1-IntegratedFridgeFreezer-AU-90001400A.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/st7kprvwb6fg56j9mth6jpm/FP-DataSheet-RS9120WRU1-IntegratedFridgeFreezer-AU-90001400A.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwabab1581/QRG/AU/QRG-AU-26536.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 1: Product Dimensions mm Overall height of fridge 2130 BOverall width of fridge 906 ©Depth of fridge front panels (excl. handles) 19 Overall depth of fridge (ex...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 10: Model no: RS9120WRJ1 RS9120WLJ1 Custom Panel Preparation Dimensions are shown in Metric (mm) Dimensions apply for the preparation and installation of custom ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 11: Cavity Dimensions mm Overall height of cavity (stainless steel panels) 2134 Overall height of cavity* (custom panels) 2032 /2134 BOverall width of cavity 914...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 12: Cavity Dimensions mm Overall height of cavity (stainless steel panels) 2134 Overall height of cavity* (custom panels) 2032 /2134 BOverall width of cavity 914...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 13: Cavity Dimensions mm Overall height of cavity (stainless steel panels) 2134 Overall height of cavity* (custom panels) 2032 /2134 ⑥Overall width of cavity 914...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 3: Cavity Dimensions mm Overall height of cavity 2134 BOverall width of cavity 914 ©Overall minimum depth of cavity 635
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 4: Cavity Dimensions mm Overall height of cavity 2134 BOverall width of cavity 914 ©Overall minimum depth of cavity 635
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 5: Door Opening & Clearance Dimensions mm Depth of door (widest opening) measured from front of door 940 ⑥Depth of drawer (open) measured from front of drawer,i...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 6: Cavity Dimensions mm Overall height of cavity* 2032/2134 BOverall width of cavity 914 ©Overall minimum depth of cavity** 635
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 7: Door Opening & Clearance Dimensions mm Depth of door (widest opening) measured from front of door 940 ⑥ Depth of drawer (open) measured from front of cabinet...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 8: Custom Panel Dimensions mm Height of top door panel* 1150 /1252 ⑥ Width of top door and bottom drawer panel 906 © Height of bottom drawer panel** 722 - 772 H...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 9: a mirrored version of image shown Custom Panel Preparation Dimensions are shown in Metric (mm) Dimensions apply for the preparation and installation of custo...

#### PDF grammar pdf_grammar_0ab2ce2ad9383387

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `RS4621FLJK1`, `RS4621FRJK1`
- PDF SHA-256: `0b979b83f3e9ac994c0daf39033dfd8d67a3fa8ad43fe9a517803804c25fd5b5`, `9a26841f7992ddde71b1b2e903c13a0a587042e395bc54317b65e4b7c3c9d9fc`
- PDF grammar profiles: `pdf_grammar_0ab2ce2ad9383387`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw43cc2d03/QRG/AU/QRG-AU-26155.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw56dad114/QRG/AU/QRG-AU-26156.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 2134 mm \| Width 451 mm \| Depth 610 mm | p.1, `7d3030f18e93` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 610 mm | p.2, `fa68cabd7fef` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 610 mm | p.2, `fa68cabd7fef` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 2134 mm \| Width 451 mm \| Depth 610 mm | p.1, `c493ee3f4a40` |

#### PDF grammar pdf_grammar_1aff9b5bfb7c5b3b

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `RS6019F3LJ1`
- PDF SHA-256: `08db3ef47be3f1f2777d3f00fdd8f44539e9540f3861941becb39b14b59624c0`
- PDF grammar profiles: `pdf_grammar_1aff9b5bfb7c5b3b`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwdee1d8f4/QRG/AU/QRG-AU-26199.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 1870 mm \| Width 592 mm \| Depth 576 mm | p.1, `4664eb24e993` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 3

#### PDF grammar pdf_grammar_1ecd5c081274a595

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `RS7621FRJE1`
- PDF SHA-256: `ceaf1a153f2baca773932af0aee42b164b7c4f0f4b943e55ad3e35784df60dde`
- PDF grammar profiles: `pdf_grammar_1ecd5c081274a595`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw37973d29/QRG/AU/QRG-AU-26961.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 2134 mm \| Width 756 mm \| Depth 610 mm | p.1, `5313db5f229a` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 610 mm | p.3, `95a92dd21a38` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | Height 2134 mm | p.3, `45a6cf191e45` |

#### PDF grammar pdf_grammar_2358d2487e9939bc

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `RF605QDUVX2`, `RF605QNUVB1`, `RF605QZUVB1`
- PDF SHA-256: `7d34bf14bd95a23c44df476fce0a2f52654dd3667d9c0c37431c811bb74a6494`, `925f6d440b773831f48712de16ca012263b7fac82490875c942b51f498dd7f73`, `aca565bfc66098bc7ee0ed17993f7a730a7b6087b32407e78b7338f87d00f840`
- PDF grammar profiles: `pdf_grammar_2358d2487e9939bc`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw1ff970d5/QRG/AU/QRG-AU-26553.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw260843d2/QRG/AU/QRG-AU-26552.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwd165f836/QRG/AU/QRG-AU-26547.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 688 mm | p.1, `6f7674bf9c18` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | Height 1790 mm | p.1, `81bf74e8c3fb` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 688 mm | p.1, `6f7674bf9c18` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 688 mm \| Height 1790 mm \| Width 905 mm | p.2, `08f70eadb238` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 905 mm | p.1, `05c479036594` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 688 mm \| Height 1790 mm \| Width 905 mm | p.2, `3767681537d3` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | Height 1790 mm | p.1, `4c79edc4764c` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 688 mm | p.1, `e128322c2ce4` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | Height 1790 mm | p.1, `6d06ab5bb94e` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 688 mm \| Height 1790 mm \| Width 905 mm | p.2, `08f70eadb238` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 905 mm | p.1, `2856cf94c5af` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 905 mm | p.1, `fe783e4a78cf` |

#### PDF grammar pdf_grammar_57c69466643bce8f

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `RF522ADUSX5`, `RF610ADX5`
- PDF SHA-256: `ee493062e968e61b7ad60b1c9fd18eae4365edcf1d986d83532aedabbec8285a`, `fdfd4107f7caa241eb3c29668296780378b5db639ab04bb5e44f408c9ed17ef4`
- PDF grammar profiles: `pdf_grammar_57c69466643bce8f`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw16a75371/QRG/AU/QRG-AU-26504.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw8b42e8ee/QRG/AU/QRG-AU-26404.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MULTIPLE_VALUES_PER_AXIS` | `INDIVIDUALLY_LABELLED_AXES` | `DOCUMENT_IDENTITY_ONLY` | depth -> depth -> height -> width | height, width | `product_closed_candidate` | Depth 695 mm \| Depth (including handles) 735 mm \| Height 1715 mm \| Width 790 mm | p.2, `901222ec8b06` |
| `RESEARCH_MULTIPLE_VALUES_PER_AXIS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> depth -> height -> width | height, width | `product_closed_candidate` | Depth 695 mm \| Depth (including handles) 735 mm \| Height 1790 mm \| Width 900 mm | p.2, `fe648841eff7` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

#### PDF grammar pdf_grammar_67d50cf41babfba5

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `RF730QNUVX1`
- PDF SHA-256: `1ec8a23521fb4d6ab4877e7a2ca6908785eb63e9cf6bc211c2cb45a723a2828e`
- PDF grammar profiles: `pdf_grammar_67d50cf41babfba5`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw0b42c80d/QRG/AU/QRG-AU-26615.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MULTIPLE_VALUES_PER_AXIS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> depth -> height | height | `product_closed_candidate` | Depth 748 mm \| Depth (less door) 660 mm \| Height 1900 mm | p.2, `55145dfe6c94` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

#### PDF grammar pdf_grammar_6825008015cb1df6

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `RF500QNX1`
- PDF SHA-256: `7802661c9ce044c7d63c8058471520bc45a80babc02b68f3a512694e6d5da602`
- PDF grammar profiles: `pdf_grammar_6825008015cb1df6`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw999e7360/QRG/AU/QRG-AU-26621.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwd649c9af/QRG/AU/QRG-AU-26621.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MULTIPLE_VALUES_PER_AXIS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> depth -> height -> width | height, width | `product_closed_candidate` | Depth 692 mm \| Depth (less door) 614 mm \| Height 1790 mm \| Width 790 mm | p.2, `f177e460f5b8` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

#### PDF grammar pdf_grammar_6b9d0fa7f6dd3378

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `RS7621FLJK1`
- PDF SHA-256: `333bb51c590d9f4dd361a08bf2f2b308ac35c94c34586dbc8628b3cef96b4be8`
- PDF grammar profiles: `pdf_grammar_6b9d0fa7f6dd3378`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw60e2175f/QRG/AU/QRG-AU-26163.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 610 mm | p.1, `7848fc10634a` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 756 mm | p.1, `c4c94be872c9` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: requency 50 Hz text Supply voltage 220 - 240 V text Product dimensions text Depth 610 mm text Height 2134 mm text Width 756 mm text Product information text ...

#### PDF grammar pdf_grammar_6da37d24a8f9fc43

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `RS7621WRUK1`
- PDF SHA-256: `bff4cad71c39aa4da5384f520866f0ec79e7e1fcb35037005198c4010f099b00`
- PDF grammar profiles: `pdf_grammar_6da37d24a8f9fc43`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw321ac9c6/QRG/AU/QRG-AU-25691.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 756 mm | p.3, `5ea348aaf837` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height | depth, height | `product_closed_candidate` | Depth 610 mm \| Height 2134 mm | p.2, `7f59544b3964` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 2134 mm \| Width 756 mm \| Depth 610 mm | p.1, `f891cc0f78bd` |

#### PDF grammar pdf_grammar_7a89e99ea6eb7bbe

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `RS6121WLUK1`
- PDF SHA-256: `d2bc6b8855eb1640e7f0949d1efdf264777a2b779342a3b2f9efd84101c77696`
- PDF grammar profiles: `pdf_grammar_7a89e99ea6eb7bbe`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw768f3f01/QRG/AU/QRG-AU-25692.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 603 mm | p.3, `2612e61069c3` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 2134 mm \| Width 603 mm \| Depth 610 mm | p.1, `9002bee5c595` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | Height 2134 mm | p.3, `5d3083407b60` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2

#### PDF grammar pdf_grammar_7f670d9bf9b3e342

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `RS6009SBL1`
- PDF SHA-256: `2f46c8b6797a0a5c36a7f1a418064e6cb01dd30b11465efed5942871aa097b15`
- PDF grammar profiles: `pdf_grammar_7f670d9bf9b3e342`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/fpqjgh8s8fj3wvzg7wprpp9/FP-PlanningGuide-en-RS6009V2RT1-RS6009V2R1-RS6009SBLT1-RS6009SBL1-Refrigeration-0-90003295H-NZ-AU-UK-IE-EU-CN-SG-Asia.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_UNIT_MISSING` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width | none | `product_closed_candidate` | Height 864 - 900 \| Width 600 | p.9, `dbea2ec83864` |
| `RESEARCH_UNIT_MISSING` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | none | `product_closed_candidate` | Height 864 - 900 | p.10, `8055faf893f8` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 12: Product Dimensions mm Overall height of product* 876 Overall width of product 592 ©Overall depth of product (excl. front door panels) 579 Height from top of ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 13: Product Dimensions mm Overall height of product 864-900 BOverall width of product 592 ©Overall depth of product (excl. front door panels) 579 Minimum height ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 15: Dimensions mm Overall product height* 864 - 900 Height from top of door panel to under benchtop 3 ©Minimum custom door panel height min 761 ⑥ Custom toe kick...
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 20
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 22
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 24: Handle Dimensions mm Overall length of handle 442 Overall height of handle 58 © Overall width of handle 37 Length of off-stand 60 Distance between attachment...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 25: Handle Dimensions mm Overall length of handle 493 Overall height of handle 41 ©Overall width of handle 15 Length of off-stand 120 Distance between attachment...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 26: Handle Dimensions mm Overall length of handle 493 Overall height of handle 41 © Overall width of handle 17 Length of off-stand 120 Distance between attachmen...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 27: Handle Dimensions mm Overall length of handle 414 Overall height of handle 55 © Overall width of handle 22 Length of off-stand 80 Distance between attachment...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 7: Model No. RS2435V2RT1, RS2435V2R1 Product Dimensions H 864-900mm W 592mm D 579mm Electrical Supply 220-240 V, 50 Hz Service 10 A Connection Plug with flex co...

#### PDF grammar pdf_grammar_8d500b3f80c31fe9

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `RF605QDUVB2`, `RS7621SRK1`
- PDF SHA-256: `753f053a5f0f6a242122d35921f8764aeb98c70091a9819b0468e9c471c35189`, `f11e201bea5565bae85814a541b114f1205cfca3c8a17474bad0486a3387d223`
- PDF grammar profiles: `pdf_grammar_8d500b3f80c31fe9`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw11f2bc18/QRG/AU/QRG-AU-26549.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwc2242f2d/QRG/AU/QRG-AU-26162.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 688 mm \| Height 1790 mm \| Width 905 mm | p.2, `2c638d179e6b` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 610 mm \| Height 2134 mm \| Width 756 mm | p.2, `898ba6a6c586` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

#### PDF grammar pdf_grammar_939d2824fd13982a

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `RS4621FRJE1`, `RS6121FRJE1`
- PDF SHA-256: `009ba8cc134edaa64f0b767be62d257bc3b966e8858d84136af27ca3ae14af6d`, `b3f01fca6289fbd08dfb32e139bccab8581d79c6f0e1d9add5239e3cbe2fce16`
- PDF grammar profiles: `pdf_grammar_939d2824fd13982a`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw15716aa1/QRG/AU/QRG-AU-26951.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwc8eebcc3/QRG/AU/QRG-AU-26941.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 2134 mm \| Width 603 mm \| Depth 610 mm | p.1, `9002bee5c595` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 2134 mm \| Width 451 mm \| Depth 610 mm | p.1, `a9de527b6e1b` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 3: Supply frequency Supply voltage 50 Hz 230 - 240 V Product dimensions Depth 610 mm 2134 mm Height Width 603 mm Product information Packaged weight 137 kg Unpa...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 3: nt 10 A Supply frequency Supply voltage 50 Hz 230 V Product dimensions Depth 610 mm 2134 mm 451 mm Height Width Product information 118 kg 100 kg 26941 Packa...

#### PDF grammar pdf_grammar_948dd9d17cba62b9

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `RS6019S3RH1`
- PDF SHA-256: `18ea9a43a2ddbed7a3dde1bec6dc6df07e68749dcbe3b519830eed5befe4367e`
- PDF grammar profiles: `pdf_grammar_948dd9d17cba62b9`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw9f4befcb/QRG/AU/QRG-AU-26197.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 1870 mm \| Width 592 mm \| Depth 576 mm | p.1, `4664eb24e993` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height | depth, height | `product_closed_candidate` | Depth 576 mm \| Height 1870 mm | p.2, `248d4b24ac1f` |

#### PDF grammar pdf_grammar_98abe7d57717aa88

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `RF442B*`
- PDF SHA-256: `4724033778c37ea9d35c728c6ab48342a70f08b3b2656c77ecc162539c4c8015`
- PDF grammar profiles: `pdf_grammar_98abe7d57717aa88`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwdc84d0fc/QRG/AU/QRG-AU-26364.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_SCOPE_REQUIRED` | `INDIVIDUALLY_LABELLED_AXES` | `DOCUMENT_IDENTITY_ONLY` | depth -> height -> width | none | `product_closed_candidate` | Depth 695 mm \| Height 1720 mm \| Width 680 mm | p.2, `5c70b771b3b7` |

#### PDF grammar pdf_grammar_991bb138fa968044

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `RF522BLPW6`, `RF522BRPW6`
- PDF SHA-256: `293aa283bd5f5e95ff0dff89e84d91ebedf369c33cdc5c2dbc2fb12888590739`, `9e24c5709f5e067bdb858f9316b67c63faf245a2eb514ab6a28cde836cc08dc1`
- PDF grammar profiles: `pdf_grammar_991bb138fa968044`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw0d68eecf/QRG/AU/QRG-AU-26442.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwf01911b1/QRG/AU/QRG-AU-26421.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 695 mm | p.1, `d88abdd8dc7c` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 695 mm | p.1, `d88abdd8dc7c` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 695 mm \| Height 1720 mm \| Width 790 mm | p.2, `3c4cc522e85f` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 695 mm \| Height 1720 mm \| Width 790 mm | p.2, `3c4cc522e85f` |

#### PDF grammar pdf_grammar_a5ffe9d3d611636d

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `RS6121FLJK1`
- PDF SHA-256: `d52fbaae49bd6a301c5e52f86a2bf6323e1d583bbf8b19946bf691b5d1868103`
- PDF grammar profiles: `pdf_grammar_a5ffe9d3d611636d`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw5946fef9/QRG/AU/QRG-AU-26159.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 603 mm | p.1, `9a1c3c702649` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 610 mm | p.1, `7cb644f0934c` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 610 mm \| Height 2134 mm \| Width 603 mm | p.2, `6c2bbd859afc` |

#### PDF grammar pdf_grammar_b43e7538fc63e19b

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `RF605QDVB2`
- PDF SHA-256: `f0529d511c65661b44362a6374d04bc98701b118b78c54edb04490a363dff5c2`
- PDF grammar profiles: `pdf_grammar_b43e7538fc63e19b`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwfcf51c89/QRG/AU/QRG-AU-26550.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 688 mm | p.1, `6a38d7bab408` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2

#### PDF grammar pdf_grammar_c0913f1ea569b3dd

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `RF500QNX1`
- PDF SHA-256: `74a998ae67f5bff99b6ea95e458535ac44ba8145804903d3d265565af71ee0cc`
- PDF grammar profiles: `pdf_grammar_c0913f1ea569b3dd`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/wvjgrh4t242jpkbrhfc679w/FP-DataSheet-en-RF500QNB1-RF500QNX1-QuadDoorFridgeFreezer-0-90002834-NZ-AU.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUAL_LABELLED_AXIS` | `DOCUMENT_IDENTITY_ONLY` | depth -> depth | none | `operation_envelope` | Depth with door open – from rear of fridge - 90° rotation 1030 \| Depth with door open - from flush with door - 90 rotation 338 | p.1, `900baf9c8522` |

#### PDF grammar pdf_grammar_d6cdd1621fc4e12b

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `RS6009SBLT1`
- PDF SHA-256: `490d1ee6e011936941fb1ddecdbe764f360e8ef09ebe10ab31a1dc58923c0dec`
- PDF grammar profiles: `pdf_grammar_d6cdd1621fc4e12b`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwc984dcd8/QRG/AU/QRG-AU-26702.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 592 mm | p.1, `862ea5eb29b0` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 579 mm | p.1, `bfd5bb2dfe45` |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | none | `product_closed_candidate` | Height 864 - 900 mm | p.1, `4ad5e48ef578` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2

#### PDF grammar pdf_grammar_de3ef0e994082bdb

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `RF730QNUVB1`
- PDF SHA-256: `14ec3833d2686516d5cf647400f7f2725f60de6fc0bb23c588f69bd2244865ad`
- PDF grammar profiles: `pdf_grammar_de3ef0e994082bdb`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/jrjg97c3xkjx42b3jk43zs7/FP-DataSheet-en-RF730QNUVX1-RF730QNUVB1-QuadDoorFridgeFreezer-0-90002819-NZ-AU.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MULTIPLE_VALUES_PER_AXIS` | `INDIVIDUALLY_LABELLED_AXES` | `DOCUMENT_IDENTITY_ONLY` | width -> depth -> width -> depth | none | `product_closed_candidate` | Overall width 945 \| Overall depth 690 \| Overall width 1125 \| Overall depth 778 | p.1, `2d953912c9e8` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUAL_LABELLED_AXIS` | `DOCUMENT_IDENTITY_ONLY` | depth -> depth | none | `operation_envelope` | Depth with door open - from rear of fridge – 90° rotation 1142 \| Depth with door open - from flush with door - 90° rotation 394 | p.1, `2d953912c9e8` |

#### PDF grammar pdf_grammar_ea173f5f11b0c9a0

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `RS6009SBL1`
- PDF SHA-256: `e78dd9f8b5ac428f54c0d4dfdead596241ca4506493f837ca51b4168b4358110`
- PDF grammar profiles: `pdf_grammar_ea173f5f11b0c9a0`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw7599cfc7/QRG/AU/QRG-AU-26703.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 592 mm | p.1, `374d4284a21e` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 579 mm | p.1, `bfd5bb2dfe45` |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | none | `product_closed_candidate` | Height 864 - 900 mm | p.1, `4ad5e48ef578` |

#### PDF grammar pdf_grammar_fa4e96e9408d0085

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `RF605QNUVX1`, `RF610ANUB5`, `RS6019BRU1`, `RS6019F2L1`, `RS6019S2R1`
- PDF SHA-256: `3fbcdcf04c54b19038dd25a38b4a32cbb2fc5a50ba11e0b3b3e90a9373154f92`, `4c96b42cda6646bb5137d1cd70da2426da3cb8c5bdc3e72a1c2eea91d32e4ec9`, `739040983ad00485e79aac045508dbd932d8d3d425716fc8fb515c5b34980a4f`, `c87f07f2683c712d9d6298d6ad203d0f1ea615c4a6595c7c4c0d6ca0d3b74cc4`, `e1ec3db07ee947852d3a98a35f71b6a1edee3792dd7c3bc2d5b2e8dbb79c586a`
- PDF grammar profiles: `pdf_grammar_fa4e96e9408d0085`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw0697870b/QRG/AU/QRG-AU-26200.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw19e549a9/QRG/AU/QRG-AU-26198.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw1c8c5f86/QRG/AU/QRG-AU-26551.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw20a04e43/QRG/AU/QRG-AU-26509.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw8267d0ef/QRG/AU/QRG-AU-26196.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 695 mm \| Height 1790 mm \| Width 900 mm | p.2, `b66ad664dd2a` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 688 mm \| Height 1790 mm \| Width 905 mm | p.2, `6817e70021ce` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 1790 mm \| Width 900 mm \| Depth 695 mm | p.1, `1547bce5b419` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 576 mm \| Height 1870 mm \| Width 592 mm | p.2, `c2aba7206055` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 1790 mm \| Width 905 mm \| Depth 688 mm | p.1, `ee2e9f528126` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 1870 mm \| Width 592 mm \| Depth 576 mm | p.1, `b247bf07d559` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 576 mm \| Height 1870 mm \| Width 592 mm | p.2, `302a104f3c82` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 1870 mm \| Width 592 mm \| Depth 576 mm | p.1, `8cbc68e1dbf1` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 576 mm \| Height 1870 mm \| Width 592 mm | p.2, `95ccd31540bd` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 1870 mm \| Width 592 mm \| Depth 576 mm | p.1, `38b42b6f9ea1` |

### GAGGENAU

- Raw brand variants: `GAGGENAU`
- Inventory models: 15
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Galanz

- Raw brand variants: `Galanz`
- Inventory models: 8
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Gasmate

- Raw brand variants: `Gasmate`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Germanica

- Raw brand variants: `Germanica`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### GRAM

- Raw brand variants: `GRAM`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Haier

- Raw brand variants: `Haier`
- Inventory models: 219
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 7
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 5

#### HRF130UW

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `HRF130UW`
- PDF SHA-256: `8ef36dc72029754b76c588829b1b347a187e4c367eaa016629ba6ccad583191c`
- Official/source URLs: <https://www.haier.com.au/on/demandware.static/-/Sites-haier-master-catalog/default/dw366ab621/QRG/AU/QRG-AU-62231.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 1: Manual defrost text Manual temperature control text Product dimensions text Depth 560 mm text Height 828 mm text Width 495 mm text Refrigerator features text...

#### HRF505VW

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `HRF505VW`
- PDF SHA-256: `7938231bb5a68a084a5d90aaf8139b346e709a089f7295197d1a18b06d6032d2`
- Official/source URLs: <https://www.haier.com.au/on/demandware.static/-/Sites-haier-master-catalog/default/dw5653a84c/QRG/AU/QRG-AU-62198.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

#### PDF grammar pdf_grammar_08bae037fd286cc6

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `HRF420BHS`
- PDF SHA-256: `04e5b398db4bf1ec38857c5d8c9146a1d923639aea789b87bcb306779de79fc3`
- PDF grammar profiles: `pdf_grammar_08bae037fd286cc6`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.haier.com.au/on/demandware.static/-/Sites-haier-master-catalog/default/dw23400534/QRG/AU/QRG-AU-62271.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 1725 mm \| Width 700 mm \| Depth 675 mm | p.1, `6a82ac031037` |

#### PDF grammar pdf_grammar_210fa825d6426e27

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `HRF90UW2`
- PDF SHA-256: `f6779463a8e7dada40f38512fafc1c224ab22269912d9c13dc425e4e26bb94f1`
- PDF grammar profiles: `pdf_grammar_210fa825d6426e27`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.haier.com.au/on/demandware.static/-/Sites-haier-master-catalog/default/dw31058f38/QRG/AU/QRG-AU-62401.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 850 mm \| Width 445 mm \| Depth 478 mm | p.1, `944ae035fc16` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 445 mm | p.2, `32d7c78fd4df` |

#### PDF grammar pdf_grammar_58d08a7f3d6f1923

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `HRF520BHS French Door 520L`
- PDF SHA-256: `e33187a4e62b8bfde014654fb1225ec0ead450b0d1524074273850896282ea06`
- PDF grammar profiles: `pdf_grammar_58d08a7f3d6f1923`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.haier.com.au/on/demandware.static/-/Sites-haier-master-catalog/default/dwe8c6d1bb/QRG/AU/QRG-AU-62207.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_SCOPE_REQUIRED` | `INDIVIDUALLY_LABELLED_AXES` | `DOCUMENT_IDENTITY_ONLY` | depth -> height -> width | none | `product_closed_candidate` | Depth 686 mm \| Height 1725 mm \| Width 790 mm | p.2, `8fde143c2736` |
| `RESEARCH_MODEL_SCOPE_REQUIRED` | `INDIVIDUALLY_LABELLED_AXES` | `DOCUMENT_IDENTITY_ONLY` | height -> width -> depth | none | `product_closed_candidate` | Height 1725 mm \| Width 790 mm \| Depth 686 mm | p.1, `70e1f5c3a4d6` |

#### PDF grammar pdf_grammar_939d2824fd13982a

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `HRF510BHC`
- PDF SHA-256: `77cf61dc0dc612235257a10763201e8b0950f0611d285bf614fb2d92d2ecc716`
- PDF grammar profiles: `pdf_grammar_939d2824fd13982a`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.haier.com.au/on/demandware.static/-/Sites-haier-master-catalog/default/dw57e105ea/QRG/AU/QRG-AU-62293.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 1725 mm \| Width 790 mm \| Depth 707 mm | p.1, `79da59f8cb38` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: eezer Inverter controlled compressor Multi-Zone Air Product dimensions Depth 707 mm 1725 mm Height Width 790 mm Refrigerator features Adjustable glass shelve...

#### PDF grammar pdf_grammar_fa4e96e9408d0085

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `HRF420BS`
- PDF SHA-256: `2b772df94084a9af0f268dad20ea21e4e56676d096d5f491428ad4079d84d1f8`
- PDF grammar profiles: `pdf_grammar_fa4e96e9408d0085`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.haier.com.au/on/demandware.static/-/Sites-haier-master-catalog/default/dwd0f727cb/QRG/AU/QRG-AU-62269.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 675 mm \| Height 1725 mm \| Width 700 mm | p.2, `9be8d89236ce` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 1725 mm \| Width 700 mm \| Depth 675 mm | p.1, `7c46b5f8ee1f` |

### Harbour

- Raw brand variants: `Harbour`
- Inventory models: 7
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### HELLER

- Raw brand variants: `HELLER`
- Inventory models: 61
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Hisense

- Raw brand variants: `Hisense`
- Inventory models: 176
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 43
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 3

#### HRBC140

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `HRBC140`
- PDF SHA-256: `11946b5097cb6459fb44e3658498ec5003c8546b13104456222e2f60dd4adaed`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HRBC140-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwyMDQzNjh8YXBwbGljYXRpb24vcGRmfGFHSTNMMmhrWmk4NE9EQTBNVEF3T1RZME16Z3lMMGhTUWtNeE5EQXRVM0JsWXk1d1pHWXxlNTc3YjM1ZDFjYzliNGExNDg5YTY5NWZlMmI1ZjFkNTMzOGMwNmJjZDYzMGY4YjU5MzE4N2VlYzA3OGMwODk5>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

#### HRBF125

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `HRBF125`
- PDF SHA-256: `7da25de52ab24dbda4065067707d133280ec2147639674532db3ed6ff7f0fc9c`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HRBF125-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxMjU1ODh8YXBwbGljYXRpb24vcGRmfGFHSTRMMmd3WXk4NE9EQTBNVEEzTkRFNU5qYzRMMGhTUWtZeE1qVXRVM0JsWXk1d1pHWXwxMWIxOGE4YjA5ZGZkNjQ5MGE2YmNlYzcyZGRjNTkyYmYyM2NjY2JhZDhhMDkwNmU2ZDZkMDQzZjk4ZjNkZDc2>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

#### HRBF179B

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `HRBF179B`
- PDF SHA-256: `77f0fd4a86eb2d4e214b077a80af06fd5521af019ba0d96a76e4c568c50efd98`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HRBF179B-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxNzI1NTl8YXBwbGljYXRpb24vcGRmfGFHSmpMMmhqTVM4NE9EQTBNRGsxTWpJNU9UZ3lMMGhTUWtZeE56bENMVk53WldNdWNHUm18Njc3YzdlOWU0MjUzNGMzNDU2NmIzOTFjYTMxMmUyNDIxYWU3Nzc5ZjUyODRkYTBjNWRhNjlkZjA2ZTVhMWE1OA>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

#### HRBM417C

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `HRBM417C`
- PDF SHA-256: `49b880bca658cf1e4ac075cefea647a9df86cda6c0090b3ff6664cd61525fd65`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HRBM417C-Spec.pdf?context=bWFzdGVyfG1hbnVhbHw2ODcyNXxhcHBsaWNhdGlvbi9wZGZ8YUdRMUwyZzRZUzg0T0RBME1UQXhNekkwT0RNd0wwaFNRazAwTVRkRExWTndaV011Y0dSbXxjYmM4ZDhiYmE5ZjU5ZjNiM2JiNWMwOTM0ZmU5OGU1N2M4MzUxNTM5MWNkMjQ5MjIwZGYxODI3YmI5ZGE4ZGYz>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: Light Super Freeze/Cool Multi-function Touch Control Panel Dimensions Counter Depth Holiday Power-saving Function Net With handle Width Depth mm mm 704 694 H...

#### HRBM482SW

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `HRBM482SW`
- PDF SHA-256: `858400aa88cbf89e2eeffe84dd4b13a7dca1b83c9fe36610d23bafb75b3daf53`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/manual-HRBM482SW-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxNzQ0OTl8YXBwbGljYXRpb24vcGRmfGFEWXhMMmc0WkM4NE56azRPRGszTnpZMk5ETXdMMGhTUWswME9ESlRWeTFUY0dWakxuQmtaZ3w5Y2U5OTgwMmYwZmMwYzA2ZDM5YWNjMTY1YTgxMDZlYTNjM2ViNTI5NDk0NWM2OTIwZTMwMmViODRiNmQxM2Zl>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2

#### HRCD454BW

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `HRCD454BW`
- PDF SHA-256: `ffbdcb0c981f5df4f8be66e0bb16a0a66fa67bb03262d9635d1c38a35d94db0d`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HRCD454BW-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxNDcwNTh8YXBwbGljYXRpb24vcGRmfGFEazJMMmhrT0M4NE9EQTBNVEE1T1RjMU5UZ3lMMGhTUTBRME5UUkNWeTFUY0dWakxuQmtaZ3xiMjVkNWE0YjkxNWMyNWZlNTg0NTcxMDliNzViYWY5OGViYjM0YjQ2MWJkMGMzNzk2MWZjODdjYWY1YTUyYjFi>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2

#### HRCD483TBW

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `HRCD483TBW`
- PDF SHA-256: `712d919522add1b9a67227f204042753b688130703bdbb52e434aa201fe97c58`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HRCD483TBW-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxMDIwMDR8YXBwbGljYXRpb24vcGRmfGFEQTJMMmd4Tnk4NE9EQTBNVEF5TmpBeU56Z3lMMGhTUTBRME9ETlVRbGN0VTNCbFl5NXdaR1l8NTNhY2MyMTk4MDBjZjY3NTdhNWVjY2ZhZDRhMGQzMTQ0NmY3MDgwMTA2NGQ3MGE1N2NjYzNiM2EzNGQyYmFjZg>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2

#### HRCD585BWB

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `HRCD585BWB`
- PDF SHA-256: `16de3b8f24d928fb45f4df71f524eea20b7a02e3d9723f925dca5feb7ced42d0`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/manual-HRCD585BWB-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxODAxMTF8YXBwbGljYXRpb24vcGRmfGFERTJMMmd6T0M4NE56azRPRGswT0RFM016RXdMMGhTUTBRMU9EVkNWMEl0VTNCbFl5NXdaR1l8MmRjNzM4M2FjNWE3NmU0NDU0OTg5MzVmZjQ0M2ZhMWZiM2VjNmQ5ZGNkZjAwNjViMjQzNTQyMzRkZmZlNzZjOA>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: th Multi Air Flow System Twin Cooling Technology Snacks Box Dimensions Net With handle Width Depth mm mm 912 725 Box Height mm 1785 Width Depth mm 968 Height...

#### HRCD586TBWB

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `HRCD586TBWB`
- PDF SHA-256: `3ec7d94b19f35fc6518b9b3f0dce6d95b1bfa13c0a8aad00a3719a1b36f959af`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HRCD586TBWB-Spec.pdf?context=bWFzdGVyfG1hbnVhbHw1MjcxNnxhcHBsaWNhdGlvbi9wZGZ8YURWbUwyZ3daaTg0T0RBME1UQTNNemcyT1RFd0wwaFNRMFExT0RaVVFsZENMVk53WldNdWNHUm18NzQ0NDA1YzQ2YzQ4MmRiNGNkY2RhMTcxMDgyZjA3N2EyNmYxZGIzNTE4ZjkwMDdjODM5OTNjNTg3Yjk1YmQ4MQ>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2

#### HRCD609B

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `HRCD609B`
- PDF SHA-256: `b08cdfe9ca28a8b37c45815ab0da820e3bb112ac20112e474aaaf2ebefcf88bf`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/manual-HRCD609B-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwyMzYzMDN8YXBwbGljYXRpb24vcGRmfGFEVTFMMmcyT0M4NE56azRPVEExTWpNM05UTTBMMGhTUTBRMk1EbENMVk53WldNdWNHUm18MTBhYjlmMzBhNmMwMmI5YTM4NDNmYzMxOTY0YTQ0MjFkMDNkYjRjMDM1ZTRmNzA4NjQ4ODNmODMwZDliZDQ0ZQ>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2

#### HRCD610TS

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `HRCD610TS`
- PDF SHA-256: `89a1969c69a438fd30d4cf526e1651e14df6c63717810c9768c70a8b135bd9c7`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HRCD610TS-Spec.pdf?context=bWFzdGVyfG1hbnVhbHw4NTQzNXxhcHBsaWNhdGlvbi9wZGZ8YURWaEwyZzBOaTg0T0RBME1EazJOemN3TURjNEwwaFNRMFEyTVRCVVV5MVRjR1ZqTG5Ca1pnfDkxNTFjOTdjMmNlN2U5N2JlZGU2YmZkMDM0N2E1OWQ4MWZhNWQ3ZjlkOTMxODAxY2I2ODY4ZWE0YWY4NDFkNTk>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2

#### HRCF144

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `HRCF144`
- PDF SHA-256: `16094aaa6d6d420d70b11388efa7d0325fc460eb7108395d0c3b48df08c1984a`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HRCF144-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxODMwNDd8YXBwbGljYXRpb24vcGRmfGFHVTJMMmhrWmk4NE9EQTBNVEExTkRVek5UazRMMGhTUTBZeE5EUXRVM0JsWXk1d1pHWXw3YTA5MzZhNzU5NzM5OGZmODhlZWJiOWQyYTJhYzUwOWZhNzZlMmQzNDQ2NzIxNGQ5YTMwMDAwYmExM2Y2YTQ2>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### HRCF199

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `HRCF199`
- PDF SHA-256: `3095c80d8135e2082feadd4363ba91f5ed2ceb13679b62637c13750287f28b40`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HRCF199-Spec-0105update.pdf?context=bWFzdGVyfG1hbnVhbHwxNzc0NzF8YXBwbGljYXRpb24vcGRmfGFHRTFMMmhsTVM4NE9ERTBNalEyTlRJM01EQTJMMGhTUTBZeE9Ua3RVM0JsWXkwd01UQTFkWEJrWVhSbExuQmtaZ3xjMTZiODNiOTIwMTdiMGNiZjBjOWJkZWJiYmMxMjVkZTNlMThiM2QwZjFhNjkzOTE0Y2EzNmEyYzg1NTE2ZWJk>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2

#### HRCF297

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `HRCF297`
- PDF SHA-256: `5ac06a8443a5faad864d2ce8738a2c329c87d629c2c324a4b87ec10bcf16adf7`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HRCF297-Spec-0105update.pdf?context=bWFzdGVyfG1hbnVhbHwxOTEzODh8YXBwbGljYXRpb24vcGRmfGFHVTBMMmhsTUM4NE9ERTBNalEyTlRreU5UUXlMMGhTUTBZeU9UY3RVM0JsWXkwd01UQTFkWEJrWVhSbExuQmtaZ3xkMTE1ZjZjNDU2Mzg5NGRhMjVhOTI5OGUxOGMzOTI0ZjQzYTcyMWU1Mzc1YzdmOTY2OTcxZDY3ZDA4YTEwNTA1>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2

#### HRCF300

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `HRCF300`
- PDF SHA-256: `77b856e688cc7c2ff7cfc2132ba1bb7283cb01ee5f25620ac913f8f2e44115dc`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/manual-HRCF300-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxOTg5NzZ8YXBwbGljYXRpb24vcGRmfGFEUXlMMmcyWWk4NE56azRPVEF6TWpNNE5qZzJMMGhTUTBZek1EQXRVM0JsWXk1d1pHWXxjZmM4ZmZhMGNhM2ExN2FkOGJiNjI2NjFlYmFlYjY2YTdmZDUwOTMwNjM5M2E3MTBlNDU2MGJjMDY4ZWI1Nzc0>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

#### HRCF439

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `HRCF439`
- PDF SHA-256: `a6c891f60aa8c851295d5cefde22b77ecb133eb1c9077083b98f9b6f7f3cc09e`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HRCF439-Spec.pdf?context=bWFzdGVyfG1hbnVhbHw0NzA0NnxhcHBsaWNhdGlvbi9wZGZ8YUdVMEwyZ3hOaTg0T0RFNU1UY3hPREU1TlRVd0wwaFNRMFkwTXprdFUzQmxZeTV3WkdZfDBhMGIwNTVmMWQxYjdkNTMyNjRiOTcwZTJjOTI5ZjJjZmZlYTg4MmM2OTg5MWNjYzMyZmFlNzcxZjJiNzgxNzU>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: Temperature Control Convenient Water Drain Ultrathin Hings Dimensions Product Weight (Packaged) 64.5 kg Product Weight (Net) 57 kg Dimensions (Packaged) (W X...

#### HRCF500

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `HRCF500`
- PDF SHA-256: `97f07c87e00b6033ef33922597feec28463739e8549247158486f87f54ab7583`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HRCF500-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxOTQzMTF8YXBwbGljYXRpb24vcGRmfGFHRmtMMmc0TWk4NE9EQTBNRGs0TkRReE1qUTJMMGhTUTBZMU1EQXRVM0JsWXk1d1pHWXw5YzQ0NjRiNzRhOWJjZTIyNDQzNmIxN2VkOTQ1OTBmMmJmMDcyODRkMjgxMjlkNmY3M2E3OTEzNTVhYTc5NzZh>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2

#### HRFD634BW

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `HRFD634BW`
- PDF SHA-256: `0ef2794cd3db622ed54e2acf14e1581f702f89da242e9eda81682947ef68b47f`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HRFD634BW-Spec.pdf?context=bWFzdGVyfG1hbnVhbHw4NTg4OHxhcHBsaWNhdGlvbi9wZGZ8YUdFMEwyZzNPQzg0T0RBME1Ea3pOalUzTVRFNEwwaFNSa1EyTXpSQ1Z5MVRjR1ZqTG5Ca1pnfGNiMjc4YTBkZjllZmVmM2QxMzU3NmYzZDc3YWNkY2I1ZWQ3MDFiNzEyZmY2Mzc1MDI1YWZjOTMxMjg0NGRhZTU>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: Double metal rail drawer in freezer Soft Interior LED Light Dimensions Width mm 914 Net With handle Depth mm 730 Height mm 1785 Box Width mm 968 Depth mm 778...

#### HRSBS632BW

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `HRSBS632BW`
- PDF SHA-256: `5cfc76a00d9e9ed3c09f974279142bf8e38c8c48f3b21d6dd26324787f172e1d`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HRSBS632BW-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxNjU5NTF8YXBwbGljYXRpb24vcGRmfGFHWXhMMmhsWXk4NE9EQTBNRGs1TkRnNU9ESXlMMGhTVTBKVE5qTXlRbGN0VTNCbFl5NXdaR1l8YWI1ZGFmNDA2MDUzN2ViNWY0ZWVlMGU5MTlhZThlMDk1NDQyZmU4NTQ5N2IwZTg5NmNmNGNmZWIxNGQ5MTk2MA>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: rol Interior LED lighting Snack box Super Cool Super Freeze Dimensions Dual fruit and vegetable crisper Dual freezer drawer Net Width mm 910 With handle Dept...

#### HRTF205S

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `HRTF205S`
- PDF SHA-256: `061c1af8a5ad011fc5c194c4f786e784a967d34cf845c0f1e039fee1e4c15f98`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HRTF205S-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxNjc1NDV8YXBwbGljYXRpb24vcGRmfGFHTXdMMmhrTlM4NE9EQTBNVEExTnpRNE5URXdMMGhTVkVZeU1EVlRMVk53WldNdWNHUm18YjEwMjNmYjViZDRkYjQ3MzZmMTAxYTBiZGYzZTViMTU2YzU0OTYxNzc5MWNkM2NlOWRlZGUzNjljM2M5NmRmZg>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2

#### HRVF240

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `HRVF240`
- PDF SHA-256: `e8ed3ee062d67ca5c62ac36d8680ea71c423f6b5e289ed58f22801cd30bc36c2`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HRVF240-Spec.pdf?context=bWFzdGVyfG1hbnVhbHw2MjQ4OXxhcHBsaWNhdGlvbi9wZGZ8YUdKaUwyZzBaaTg0T0RBME1URXhOamM1TlRFNEwwaFNWa1l5TkRBdFUzQmxZeTV3WkdZfGU2MmY1MjQ4NzM5YTE3Y2FiMDcwYzNhYTc5OTBjYjE0OTVhNTA3MjhmOGIzNTYxNDRiMzRlOTE5NDg3OTFlNzc>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: Soft LED Lighting Super Freeze/Cooling Big Box Compartment Dimensions Net With handle Width Depth mm mm 595 590 Box Height mm 1720 Width mm 647 Depth mm 628 ...

#### HRVF384S

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `HRVF384S`
- PDF SHA-256: `ac142feb701a8b034a9af0bc304a1dc85f439ca02b4f32e687e2c1d1d928c24d`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HRVF384S-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwyNjM3OTB8YXBwbGljYXRpb24vcGRmfGFHUTJMMmcyWmk4NE9EQTBNVEEyTmpBd05EYzRMMGhTVmtZek9EUlRMVk53WldNdWNHUm18ZDExOGRhYjc5NWVlMmQ1YTY5YjVlZTlmODIzOTQyNjRkM2FlOTFmMjY5Nzk1YTYyN2VhZjYyYjFjOThhY2U1Mw>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### PDF grammar pdf_grammar_5b2962b2a4e94b2b

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `HRCD483E`
- PDF SHA-256: `0ab19c8d21c410c0ecea9cf2a6b418c681c77c86f1043140e5f7b092f257b2e3`
- PDF grammar profiles: `pdf_grammar_5b2962b2a4e94b2b`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HRCD483E-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxNjM1MDB8YXBwbGljYXRpb24vcGRmfGFEZGlMMmc0WXk4NE9EQTBNRGs0TnpBek16a3dMMGhTUTBRME9ETkZMVk53WldNdWNHUm18NDhjNjc2YWFkMzMwY2UyNGE4MjZhZmI4NzQ2YzJhYTk5ZGU5OTMyMDNhODYxMzU3Mjg1Zjk2MjNlZGZlYjZhNg>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Dimensions (Net) (W X H X D) 794×1785x698 mm | p.1, `439336b9b6b6` |

#### PDF grammar pdf_grammar_92b27441330b8de3

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `HRTF206`
- PDF SHA-256: `f9439245bffd313d6c3ba841d72eb466ea25172f1108426a1b4f789b5c16b4eb`
- PDF grammar profiles: `pdf_grammar_92b27441330b8de3`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HRTF206-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxNDI1MDh8YXBwbGljYXRpb24vcGRmfGFHSTJMMmd3Wmk4NE9EQTBNVEEzTXpVME1UUXlMMGhTVkVZeU1EWXRVM0JsWXk1d1pHWXw5MDY2ZmY5ODYyNWFkNmZmY2NlMjM5Yzg5YzY4YWFmM2RkNGJmYWIwNzhhNmE3YmZkM2UyZTMzYjBmZDU3Nzdi>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | none | `delivery_package` | Dimensions (Packaged) (W X H X D) 581×1508x594 mm | p.1, `05f1ed5146b6` |

#### PDF grammar pdf_grammar_a7d008deaf855262

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `HRBC113`, `HRBF126`, `HRBM418B`, `HRBM418S`, `HRBM419B`, `HRCD483G`, `HRCD483TSW`, `HRCD615TBWV`, `HRCD640TBW`, `HRCF146`, `HRCF201`, `HRCF301`, `HRCF501`, `HRCF702`, `HRFD635SW`, `HRSBS613BWX`, `HRSBS633BW`, `HRTF325`, `HRTF497SW`
- PDF SHA-256: `0d1faf6ce987ac2d53282f2a6945f1cca462a790048adc41e61811fe49271453`, `119cbd7d1b51c6ffd59207cb02b1e1df3083529ffce0a4d7f6f99d76b9efd39b`, `16ac9b2064a0efcda3931a0bb6a32629894588783f0d91275f4002e39ed74f5f`, `175da4b89dbfd1900ac3595a5f813aca80f7c5333d2b07140dcbd133ebd03867`, `2f42de6ce291f4bb94a2b6c553f33cf4657c8b50ba0e7cce7d85b1d58870b6db`, `3d7327becb221a1f22b6571445805f9e7c6814d79ebff772507d389850a1fca4`, `43430d37720c1ab1935062cae4bd3cc9cd7ad27f9d40c945175d2eca16c9d714`, `4569097abf1b64c0adcba558283aaf2e60e04382812ef4a3ce1f3be6a08f09b7`, `4eddd718829ed49e33910d7c4284f5b0ca5ed3bf7341d1460a141945a04412e0`, `576ab58647e444301953e41b3459910e583b37b40d62f65932702524db045bcb`, `67c38fc3a2128a9afbd2081ba596af63ee4832c138d8eb5faa585a447307356f`, `6c9b8413e7027756b02248f0ff847320958cf0369fb67b9ce3819d55e2521f94`, `a373434cd72bfe8823019df5e222eedf9312e3afc33e46406ae4d9975f801490`, `a43c858b0895c0190cbd238a2517292e29a2c8afc3ccbf9b53f607a810e49cd8`, `b629896919dc27ab9c7d8f8c2352b9aa3bbc1f46c93bb3d4fbe5c355e55ec4aa`, `dabd1e7097fc2541e03fb54b28cef294509dcd48ba4c1f675af8f189a270f0ba`, `ee2b42864372c75564e55a54b04b44cc93418485ac1ddfb1c2b95d4ab03160c3`, `fbf3d6a289300a7830c831b5cc83aff011f43a3ab69ae6459540dbb1d88bbdfa`, `ff9c1735a4871bc809e0baa42ee366d5780e298a6dedad0ca17dd6ef01e8d667`
- PDF grammar profiles: `pdf_grammar_a7d008deaf855262`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HRBC113-Specs-for-consumer-1.pdf?context=bWFzdGVyfE1hbnVhbHw1MzM1NDl8YXBwbGljYXRpb24vcGRmfGFHVmtMMmc0WWk4NE9EUTVPVGN6TlRFd01UYzBMMGhTUWtNeE1UTmZVM0JsWTNNZ1ptOXlJR052Ym5OMWJXVnlJREV1Y0dSbXwzZDdiNTNlZjA1ZTBmZTAzN2QzZWQ1YWYxYzFhOTlhMjk4ZmVjN2ZhYzVmZWQ5MzY3NDQ0ODZjNGUzZjY1ZGRi>, <https://dtc-aus-api.hisense.com/medias/HRBF126-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxNDU4NTN8YXBwbGljYXRpb24vcGRmfGFESTNMMmd3TXk4NE9ETXpPREV4TlRjNE9URXdMMGhTUWtZeE1qWXRVM0JsWXk1d1pHWXw4NWU4M2Y1YjExODUyZGRmMjc4ZjdmY2QwOGJkMTE4NjUxOGRjMzA4MWE0ZTQ4MjU1ZjJhZGRjZDhkZGEzYzY3>, <https://dtc-aus-api.hisense.com/medias/HRBM418B-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxNzEzMjd8YXBwbGljYXRpb24vcGRmfGFHTmpMMmd4TXk4NE9EQTBNVEV3T0RJM05UVXdMMGhTUWswME1UaENMVk53WldNdWNHUm18NzE3MGFhNGFmYzQxZTI4OTYzYzU5MTFiMWVkNzhjMTM5ZWRmZmRmMzc1NDcxMjYxYTYyZDVhNjBlNTg1YmJiYg>, <https://dtc-aus-api.hisense.com/medias/HRBM418S-Spec.pdf?context=bWFzdGVyfG1hbnVhbHw0OTY5NjJ8YXBwbGljYXRpb24vcGRmfGFHVXpMMmhsTVM4NE9EQTBNRGswTmpBM016a3dMMGhTUWswME1UaFRMVk53WldNdWNHUm18MjUzZjE0NjQwNGViNjkzMzMxYTZiYWViMzQ3NjkxZTBiMzI0NzllOGQyMWQyZDA2YjQ2NmI4NmE4YzFjZGFiNA>, <https://dtc-aus-api.hisense.com/medias/HRBM419B-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxODIxOTF8YXBwbGljYXRpb24vcGRmfGFHWTFMMmd6TUM4NE9URTJNVFkzTURZMU5qTXdMMGhTUWswME1UbENMVk53WldNdWNHUm18MjY3NTQyMGVhNWFmYjZmNGU4Yzg5MzZkY2UwYjRhZDMwNTg4NWNiNDEyZDg2Y2EyNzlkY2FkZWM3MzczODY4Nw>, <https://dtc-aus-api.hisense.com/medias/HRCD483G-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxNTg3NTV8YXBwbGljYXRpb24vcGRmfGFESmxMMmhrTlM4NE9EQTBNVEE1T0RjM01qYzRMMGhTUTBRME9ETkhMVk53WldNdWNHUm18ODZlYjY4NTk0MjQ4ODQwMGU5MWMxZGRlMTY1YzY5N2U1NzQ0NjEyODU3NTRhZDAzZTYxNTJlN2YwZTRiODVmZg>, <https://dtc-aus-api.hisense.com/medias/HRCD483TSW-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwyODI5NDB8YXBwbGljYXRpb24vcGRmfGFHWmhMMmczT0M4NE9EQTBNRGt6TmpnNU9EZzJMMGhTUTBRME9ETlVVMWN0VTNCbFl5NXdaR1l8Mzk5ZDBmZDUwMTgwZjFkMzU5N2U0NWI5OGEyMjNmNDEyNzAzMTY3MzAwNzlkOGFjMWVmNTcxMWYxNGM4OGU5Nw>, <https://dtc-aus-api.hisense.com/medias/HRCD640TBW-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwyNjYzMDR8YXBwbGljYXRpb24vcGRmfGFERm1MMmhsTXk4NE9EQTBNVEF3T0RZMk1EYzRMMGhTUTBRMk5EQlVRbGN0VTNCbFl5NXdaR1l8MGRhNTM3OGQyMDRhMTM4MzA5YmQyMTA0ZTIzZDVjMDNjYzYxMzBhZGMzNmFhNGJlYTYwYTM2MGZiYTRhYmYyMw>, <https://dtc-aus-api.hisense.com/medias/HRCF146-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxMjY2NDF8YXBwbGljYXRpb24vcGRmfGFEUmlMMmd3WlM4NE9EQTBNRGt5TmpBNE5UUXlMMGhTUTBZeE5EWXRVM0JsWXk1d1pHWXxmYzE3MWViNmNkZGNhYjhiNGM0YzA2NzEzNDBhNjU1MjIxNTk2MDhiZDdiZWE1MWRlNzk3NTMwYjA5MGUzM2Nh>, <https://dtc-aus-api.hisense.com/medias/HRCF201-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxMzg3Nzl8YXBwbGljYXRpb24vcGRmfGFHSmxMMmhrTnk4NE9EQTBNRGswTXpFeU5EYzRMMGhTUTBZeU1ERXRVM0JsWXk1d1pHWXwzNzg0MjBhZTZiZTY0NDA0NjJhZmQ1MGFmNWNkNDMzODUwYTQ1NjQwNGM5M2ZhMGVhZDFkN2Q3MzFkNDM2ZTEz>, <https://dtc-aus-api.hisense.com/medias/HRCF301-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxMjY1MTR8YXBwbGljYXRpb24vcGRmfGFEVTNMMmd4Tmk4NE9EQTBNVEF5TmpZNE16RTRMMGhTUTBZek1ERXRVM0JsWXk1d1pHWXwwMTJmNjgyYzFiNjc0ZTY4MmQyMzJkM2I0NjNiNzJiN2I5OWE5ZmQ5NTlmNWRiNmZlZDY1OTAzODYzNzYxN2M2>, <https://dtc-aus-api.hisense.com/medias/HRCF501-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxMzUwOTB8YXBwbGljYXRpb24vcGRmfGFEbGlMMmczWmk4NE9EQTBNRGs0TXpjMU56RXdMMGhTUTBZMU1ERXRVM0JsWXk1d1pHWXw2NzA4NTQ0ZmRlMDgxYmZiMzVlYzAyM2YzM2VlNzIwY2Y0OTc1YTc2MmQwNjgyMDFmNDg1NmNmZmI0NTc4NWYz>, <https://dtc-aus-api.hisense.com/medias/HRCF702-Spec.pdf?context=bWFzdGVyfG1hbnVhbHw5NjQ5NnxhcHBsaWNhdGlvbi9wZGZ8YURkaEwyZ3hOaTg0T0RFNU1UY3hPRFV5TXpFNEwwaFNRMFkzTURJdFUzQmxZeTV3WkdZfDZhOGIzMzc0NjZhMDc2NjQyZjQzNzkyZWU0YjZjZWRhM2JlMTE2YTg0YWRlNmE1YjgxMTlmMjM1ZmIwMzkzOTQ>, <https://dtc-aus-api.hisense.com/medias/HRFD635SW-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxOTcxMTd8YXBwbGljYXRpb24vcGRmfGFEWmtMMmc0TlM4NE9ERTVNakV5TVRVMk9UVTRMMGhTUmtRMk16VlRWeTFUY0dWakxuQmtaZ3wzOWU4MWU5ZDljNzQ2MjgwZTE3ZTlmZWQ4NjEwZjlhM2YwN2Q4ZjgyYmMyYmRhZTc1ZGVhNTAxMzIxYTZlNGRi>, <https://dtc-aus-api.hisense.com/medias/HRSBS613BWX-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwyNTA1MDV8YXBwbGljYXRpb24vcGRmfGFHUTNMMmd4WXk4NE9ETTFORFEzTnpnek5EVTBMMGhTVTBKVE5qRXpRbGRZTFZOd1pXTXVjR1JtfGQ1ZGE4YTg4YjkxNWE5ZmMyMzU4MzQzZDRlMzMyYjAwZjc1ZDc0NmRmYmI1ZTVhYjdlN2FjYmFmYjdiNWVmYTg>, <https://dtc-aus-api.hisense.com/medias/HRSBS633BW-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwyMzk5ODV8YXBwbGljYXRpb24vcGRmfGFEaGhMMmhrTUM4NE9ESTJORGN5TkRZME5ERTBMMGhTVTBKVE5qTXpRbGN0VTNCbFl5NXdaR1l8OTljNDMzYTE4MmI5NWYyNzYxZjFjZTBmYWNjOWVhMmRjY2RhOTc1M2ExYTE1YWMwMjdkOWIyNWJhNGMxNDBiZA>, <https://dtc-aus-api.hisense.com/medias/HRTF325-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxMzgzOTJ8YXBwbGljYXRpb24vcGRmfGFETTBMMmczWXk4NE9EQTBNRGs0TWpjM05EQTJMMGhTVkVZek1qVXRVM0JsWXk1d1pHWXw5NDkzMGRlMDk4ODc5ZmU0NWMwNDRjYjkxYmE4NWZhODk4ZDY2NmE5ZmFjNmU3Yzk5MjNmNjc4MzdkNjRhYTFh>, <https://dtc-aus-api.hisense.com/medias/HRTF497SW-Spec.pdf?context=bWFzdGVyfG1hbnVhbHw1MzA2NDF8YXBwbGljYXRpb24vcGRmfGFEVmlMMmcxWmk4NE9ETXpPREV5TXpNeU5UYzBMMGhTVkVZME9UZFRWeTFUY0dWakxuQmtaZ3w1MDdiNDMyYjRhNTkyMjkyNDY3ZjBmMzU2NTRjMjQzMjkwYWMxN2RlOTY3MmE5MmM0ZmExOTYzYWYyMzZlNWNl>, <https://dtc-aus-api.hisense.com/medias/Specs-HRCD615TBWV.pdf?context=bWFzdGVyfE1hbnVhbHw0NTQ4NDh8YXBwbGljYXRpb24vcGRmfGFHSmhMMmhtT0M4NE9EVTFPRGN4TXpJME1Ua3dMMU53WldOelgwaFNRMFEyTVRWVVFsZFdMbkJrWmd8NDM3YzBiNDkyYmI2MGQ2YWVjNDZlYzNjMDA0Yjk5NDA2MTkwMGIxMWFmYmRhNWIxMzRiYjNiNGE0ODFiNmE3Yg>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | none | `delivery_package` | Dimensions (Packaged) (W X H X D) 655×890x575 mm | p.1, `82efef4fc45b` |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Dimensions (Net) (W X H X D) 910 x 1790 x 730 mm | p.1, `fcc94e2659ff` |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Dimensions (Net) (W X H X D) 1646×847×717 mm | p.1, `a87e6cc3337a` |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Dimensions (Net) (W X H X D) 475 x 840 x 448 mm | p.1, `efc0be4569aa` |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | none | `delivery_package` | Dimensions (Packaged) (W X H X D) 2200 x 879 x 797 mm | p.1, `6bf319a5a8ec` |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_DOCUMENT_EXACT_MODEL` | width -> height -> depth | none | `delivery_package` | Dimensions (Packaged) (W X H X D) 750x1834x738 mm | p.2, `18b6553a3d30` |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Dimensions (Net) (W X H X D) 794 x 1785 x 698 mm | p.1, `09b6fbad0a4a` |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | none | `delivery_package` | Dimensions (Packaged) (W X H X D) 750x1834x738 mm | p.1, `ac220131b637` |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_DOCUMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Dimensions (Net) (W X H X D) 704x1720x694 mm | p.2, `18b6553a3d30` |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Dimensions (Net) (W X H X D) 704x1720x694 mm | p.1, `0f8745d12ffa` |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Dimensions (Net) (W X H X D) 794x1785x698 mm | p.1, `982fe5b320a5` |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Dimensions (Net) (W X H X D) 2145 x 826 x 758 mm | p.1, `6bf319a5a8ec` |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Dimensions (Net) (W X H X D) 914 x 1790 x 730 mm | p.1, `2cbc47525965` |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | none | `delivery_package` | Dimensions (Packaged) (W X H X D) 968 x 1896 x 778 mm | p.1, `41baa2bee837` |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Dimensions (Net) (W X H X D) 595×1696x650 mm | p.1, `38030e310723` |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | none | `delivery_package` | Dimensions (Packaged) (W X H X D) 842x1885x744 mm | p.1, `982fe5b320a5` |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | none | `delivery_package` | Dimensions (Packaged) (W X H X D) 498 x 872 x 574 mm | p.1, `51a880442235` |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Dimensions (Net) (W X H X D) 625×854x559 mm | p.1, `82efef4fc45b` |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | none | `delivery_package` | Dimensions (Packaged) (W X H X D) 495 x 887 x 468 mm | p.1, `efc0be4569aa` |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | none | `delivery_package` | Dimensions (Packaged) (W X H X D) 968 x 1901 x 778 mm | p.1, `2f044bec1a4d` |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Dimensions (Net) (W X H X D) 475 x 840 x 556 mm | p.1, `51a880442235` |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | none | `delivery_package` | Dimensions (Packaged) (W X H X D) 968 x 1896 x 778 mm | p.1, `2cbc47525965` |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | none | `delivery_package` | Dimensions (Packaged) (W X H X D) 1145×880×647 mm | p.1, `32198911d78c` |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Dimensions (Net) (W X H X D) 910 x 1790 x 730 mm | p.1, `0b92b802df35` |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | none | `delivery_package` | Dimensions (Packaged) (W X H X D) 750x1834x738 mm | p.1, `0f8745d12ffa` |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | none | `delivery_package` | Dimensions (Packaged) (W X H X D) 833×890x575 mm | p.1, `cb2a974f9a04` |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Dimensions (Net) (W X H X D) 914 x 1790 x 730 mm | p.1, `41baa2bee837` |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Dimensions (Net) (W X H X D) 914 x 1785 x 730 mm | p.1, `2f044bec1a4d` |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_DOCUMENT_EXACT_MODEL` | width -> height -> depth | none | `delivery_package` | Dimensions (Packaged) (W X H X D) 843 x 1795 x 734 mm | p.2, `357fb00d9bc2` |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | none | `delivery_package` | Dimensions (Packaged) (W X H X D) 1688×889×753 mm | p.1, `a87e6cc3337a` |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | none | `delivery_package` | Dimensions (Packaged) (W X H X D) 978 x 1860 x 787 mm | p.1, `fcc94e2659ff` |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | none | `delivery_package` | Dimensions (Packaged) (W X H X D) 641×1760x686 mm | p.1, `38030e310723` |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Dimensions (Net) (W X H X D) 704x1720x694 mm | p.1, `ac220131b637` |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_DOCUMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Dimensions (Net) (W X H X D) 794 x 1720 x 685 mm | p.2, `357fb00d9bc2` |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | none | `delivery_package` | Dimensions (Packaged) (W X H X D) 842 x 1885 x 744 mm | p.1, `09b6fbad0a4a` |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Dimensions (Net) (W X H X D) 1114×847×630 mm | p.1, `32198911d78c` |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Dimensions (Net) (W X H X D) 802×854x559 mm | p.1, `cb2a974f9a04` |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | none | `delivery_package` | Dimensions (Packaged) (W X H X D) 980 x 1890 x 778 mm | p.1, `0b92b802df35` |

### Hitachi

- Raw brand variants: `Hitachi`
- Inventory models: 36
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### HOOVER

- Raw brand variants: `HOOVER`
- Inventory models: 14
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Husky

- Raw brand variants: `Husky`
- Inventory models: 47
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### ICELAND

- Raw brand variants: `ICELAND`
- Inventory models: 13
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Ikea

- Raw brand variants: `Ikea`
- Inventory models: 15
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Ilve

- Raw brand variants: `Ilve`
- Inventory models: 18
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Imprasio

- Raw brand variants: `Imprasio`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Inalto

- Raw brand variants: `Inalto`
- Inventory models: 37
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### KELVINATOR

- Raw brand variants: `KELVINATOR`
- Inventory models: 20
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 2
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 1

#### PDF grammar pdf_grammar_b56ff9ab0cbbc9f2

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `KBM4502WC`, `KBM5302AC`
- PDF SHA-256: `6197fb9ddb360437f82fcaebaab22e775fab7dd89627a89f56a537d3f589ea7a`, `6f654a43956eb1971fec97124cd7cfb9e8413c4cc9b576b5a8f98dfa56d1ca30`
- PDF grammar profiles: `pdf_grammar_b56ff9ab0cbbc9f2`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=KBM4502WC&brand=Kelvinator>, <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=KBM5302AC&brand=Kelvinator>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1718 \| Total width (mm) 796 \| Total depth (mm) 727 | p.3, `836ea07e1e93` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1705 \| Cabinet width (mm) 693 \| Cabinet depth (mm) 641 | p.3, `4297ace1d332` |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `SAME_FRAGMENT_EXACT_MODEL` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height \| Product Width \| Product Depth \| Product Depth(Door Open) \| KBM4502AC/KBM4502WC \| 1718 \| 699 \| 730 \| 1360 | p.6, `14b9f52b9ecf` |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `mixed_product_and_operation` | Product Height \| Product Width \| Product Depth \| Product Depth(Door Open) \| KBM5302AC/KBM5302WC \| 30 \| 30 \| 50 \| | p.6, `776efc7202eb` |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height \| Product Width \| Product Depth \| Product Depth(Door Open) \| KBM5302AC/KBM5302WC \| 1718 \| 796 \| 727 \| 1457 | p.6, `776efc7202eb` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1705 \| Cabinet width (mm) 790 \| Cabinet depth (mm) 641 | p.3, `836ea07e1e93` |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `SAME_FRAGMENT_EXACT_MODEL` | height -> width -> depth | none | `mixed_product_and_operation` | Product Height \| Product Width \| Product Depth \| Product Depth(Door Open) \| KBM4502AC/KBM4502WC \| 30 \| 30 \| 50 \| | p.6, `14b9f52b9ecf` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1718 \| Total width (mm) 699 \| Total depth (mm) 730 | p.3, `4297ace1d332` |

### Kenmore

- Raw brand variants: `Kenmore`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### KingsBottle

- Raw brand variants: `KingsBottle`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### KLEENMAID

- Raw brand variants: `KLEENMAID`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Kogan

- Raw brand variants: `Kogan`
- Inventory models: 409
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 2
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 2

#### PDF grammar pdf_grammar_3ec1b0a072bd83b1

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `KATFSBS503A`
- PDF SHA-256: `80704021eb7205679cf70ccb7c97b3cce260816a8ee2162498e1523b4ac7f2c8`
- PDF grammar profiles: `pdf_grammar_3ec1b0a072bd83b1`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://assets.kogan.com/files/usermanuals/KATFSBS503A_UG.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_DOCUMENT_EXACT_MODEL` | width -> depth -> height | width, depth, height | `product_closed_candidate` | Dimension (W x D x H) 920 x 630 x 1768mm | p.26, `7d01ffc0be25` |

#### PDF grammar pdf_grammar_49ff76df90a9122a

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `KAMFREN522A`
- PDF SHA-256: `357edc8ad27ea2f37b9a89a3948b053a8cea015e2e27dbf651dacd5848ad7d94`
- PDF grammar profiles: `pdf_grammar_49ff76df90a9122a`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://assets.kogan.com/files/usermanuals/KAMFREN522A_UG.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_DOCUMENT_UNIQUE_SCOPE_REQUIRED` | `DOCUMENT_SCOPED_DIMENSION_MATRIX` | `SAME_DOCUMENT_EXACT_MODEL` | width -> height -> depth | none | `product_closed_candidate` | Width 750mm \| Overall,Height 1692mm \| Depth 785mm | p.9, `5ebd03f96295` |

### KOLNER

- Raw brand variants: `KOLNER`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### KONKA

- Raw brand variants: `KONKA`
- Inventory models: 11
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### LG

- Raw brand variants: `LG`
- Inventory models: 207
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 22
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 1

#### Document family 1c4c1e1db1f0

- Group type: `document_family`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `GF-B700PL`, `GF-B705MBL`
- PDF SHA-256: `1c4c1e1db1f0fa1d2e951b79f9721092d0a25978fe7fcc9b2fabd7164fc200a9`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=j2YvjRAcs71zGaEKRiNdQ>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 11

#### Document family 5ceaeaaafb54

- Group type: `document_family`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `GS-D600MBLC`, `GS-N600PL`, `GS-V600MBLC`
- PDF SHA-256: `5ceaeaaafb54c39b263672efb8dd54b24e4302aea61a18de6134758ab5f54ca1`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=4dEfGRBm7iKDAciS6QAuA>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 12

#### Document family 6260a2216a20

- Group type: `document_family`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `GB-455BLE`, `GB-W455MBL`
- PDF SHA-256: `6260a2216a20ec650a142490f6b0c814e995b33178eee7fa858c9b3f8bdf0226`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=V0vh6JCWRhumlf01kQSig>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 11

#### Document family 6fc98bd5e3ad

- Group type: `document_family`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `GB-B300MBL`, `GB-W300MBL`
- PDF SHA-256: `6fc98bd5e3ad5019cfdc57309de1e7b2929554c7771c4f9b6ed5d56f9c00e5f6`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=c3NATjI0w03U3bkNvJTJaw>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 11

#### Document family 7ceaec7eb479

- Group type: `document_family`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `GS-B600MBL`, `GS-D600BML`, `GS-VB600PL`
- PDF SHA-256: `7ceaec7eb479da9eab88338d944ba7481fb367dea507836ce330c2e0c70331d0`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=R7d8TnMM55jQiIKQn92WA>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 12

#### Document family 84e5aa785d44

- Group type: `document_family`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `GT-1SI`, `GT-2SI`
- PDF SHA-256: `84e5aa785d44ff9617a754c17af4224a078be95fb8815cb68bd6ffadd1a028c4`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=sy7QbebvamiaOLA1j1WoBg>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 11

#### Document family b86d8eebd403

- Group type: `document_family`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `GF-LN700MBL`, `GF-V700MBLC`
- PDF SHA-256: `b86d8eebd403bb7684605690a751857f33e705fa3304dae3e8c07df8d3624dd6`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=S9KtCjoQL26KeRDXtNn2w>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 12

#### Document family c40bbeb07ba8

- Group type: `document_family`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `GF-LN500MBL`, `GF-V500MBLC`
- PDF SHA-256: `c40bbeb07ba870f53b5b958b8de46b2327e156b371dd2ff22fbec3411209724e`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=TrD7hKGAvk5a68JgwLfnmg>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 12

#### Document family e36b816dec61

- Group type: `document_family`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `GB-335PL`, `GB-W335MBL`
- PDF SHA-256: `e36b816dec61e51c2037095160b9dd925a92a4a30d9f6f363862e67fdade9a8a`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=h8kS0aDP3UiEAwMJDvnjvQ>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 11

#### Document family e60c6d39e390

- Group type: `document_family`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `GF-V570MBLC`, `GF-V570PNL`
- PDF SHA-256: `e60c6d39e390cccfc9ba236b859bf1a095b156be1d596ff5080584138112357b`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=4BVmESxM2waikj04qc4fUg>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 12

#### Document family e7df61b3ff54

- Group type: `document_family`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `GF-B530BL`, `GF-B590BLE`
- PDF SHA-256: `e7df61b3ff541d7edb698f90450c1c119762910bd50f00d886219b95914b9f73`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=gHqp5PhnAxC8JH3sckpkVw>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 11

#### GB-V300MBL

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `GB-V300MBL`
- PDF SHA-256: `31f521b50d14f9072d97ea3ea2c3093ebe7e5b6639004dae94e8641e410cd3be`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=5ouq1nL856o4jsao2rViIA>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 11

#### GF-B505BB

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `GF-B505BB`
- PDF SHA-256: `76dead0f063d33255ea041eabbaab32c183fd2ab884d1fc5c6923c638c2a61c2`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=e90biPiGzIqrNrTcShSiIA>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 11

#### GF-V706MBLC

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `GF-V706MBLC`
- PDF SHA-256: `1ada38b86a24bf695238bf1d9fa209135b2de8cdcf0d5aa5210cca61ab44029d`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=qnKDotrworMx9VsLukCvw>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 11

#### GF-V910MBL

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `GF-V910MBL`
- PDF SHA-256: `983ba914f9daed3c952c788c4522647dae9d33ae8aeb93b009733fb366f4313b`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=fedUnZXjQscQf6x6ynOeEQ>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 11

#### GF-V910MBLC

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `GF-V910MBLC`
- PDF SHA-256: `6061a352ef81529a3f747f4382bce1175bb784afa22d1958fdcd4c8f5b7185d2`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=q3ft1itHU07FJfSYJmH0Dg>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 11

#### GS-B500MB

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `GS-B500MB`
- PDF SHA-256: `d67fc4ca21e4de60c0f06a0bb60dc5acb537c0ae9d60b8df3e5f8ff732cdc8f9`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=dULQ9mWiNttaK8UmRxKtjQ>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 11

#### GS-B599PL

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `GS-B599PL`
- PDF SHA-256: `e9f3e84d64e84d3110fa8491673c144927faccfe844e85eb5693c13c94d57b1d`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=doLEvu69LVO4mSljEhHGDA>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 11

#### GS-B599PLB

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `GS-B599PLB`
- PDF SHA-256: `3aa3be432c7a873d9d5c8c4f51f848e47d4a82cc48f108e2b2f0791543d7540d`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=DkauLu0LKvARJsbA0PCiA>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 11

#### GS-B655PL

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `GS-B655PL`
- PDF SHA-256: `fd56b69371587cd1ccb4dcc64a88ec8198dac09a868bf8692651fbdc80115fce`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=TCA8L39ERMmdd8YMLQNkbg>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 12

#### GT-279BPL

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `GT-279BPL`
- PDF SHA-256: `a22398ff7c969c3fdf770485d8cfc6b256aa2a2a00abe38d84fcc3585afd64d6`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=TZeDKr8byA9LNdheupkg>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 11

#### PDF grammar pdf_grammar_4647d47adef4ed52

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `GF-L700PL`
- PDF SHA-256: `e83dbc78ce964e2eea26f81a43d1b4607c24d1ec852baeeb96df9180a5157d25`
- PDF grammar profiles: `pdf_grammar_4647d47adef4ed52`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.lg.com/content/dam/channel/wcms/au/pdfs/GF-L700PL_Specsheet_V2_230809_2.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_PAGE_EXACT_MODEL` | width -> depth -> height | none | `delivery_package` | Packaging (W x D x H) 972mm × 770mm ×1881mm | p.1, `986a59030e80` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width | height, width | `product_closed_candidate` | Height 1792mm \| Width 914mm | p.1, `986a59030e80` |

### LICENSING ESSENTIALS

- Raw brand variants: `LICENSING ESSENTIALS`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Liebherr

- Raw brand variants: `Liebherr`
- Inventory models: 69
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Linarie

- Raw brand variants: `Linarie`
- Inventory models: 35
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Living & Co

- Raw brand variants: `Living & Co`
- Inventory models: 17
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### majestic

- Raw brand variants: `majestic`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Makita

- Raw brand variants: `Makita`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### meisda

- Raw brand variants: `meisda`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Midea

- Raw brand variants: `Midea`
- Inventory models: 47
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 3
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 1

#### MDRC284FZE01APE

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `MDRC284FZE01APE`
- PDF SHA-256: `b7bc1ea2727120a85d724a33a1400d97059c37a1a6fcb750575a23560e9c05aa`
- Official/source URLs: <https://www.midea.com/content/dam/midea-aem/au/au-new/pdp/refrigerator/chest-freezer/mdrc284fze01ape/MDRC154-211-284FZE01AP-User-Manual.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 3: 00a,46 R600a,46 R600a,53 Foaming Agent Cyclopentane Overall Dimension (mm) 547x446x850 600x560x850 770x560x850
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 4

#### MDRC499FZF01AP

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `MDRC499FZF01AP`
- PDF SHA-256: `900f2e280d68035ea9ce9b0d683a76534b5b5825b966cb28698b0568f9063346`
- Official/source URLs: <https://www.midea.com/content/dam/midea-aem/au/au-new/pdp/refrigerator/chest-freezer/mdrc499fzf01ap/MDRC499FZF01AP-User-Manual.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 4: artment Volume(L) 362 Refrigerant,Amount(g) R290,80 Overall Dimension (mm) 1255x745x853
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 6

#### PDF grammar pdf_grammar_ddd567e27da0b9e2

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `MDRC284FZE01APE`
- PDF SHA-256: `db07b1bfa7bdc1027c7b9d76771a510438df745e87d1e821f445b207220740af`
- PDF grammar profiles: `pdf_grammar_ddd567e27da0b9e2`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.midea.com/content/dam/midea-aem/au/au-new/pdp/refrigerator/chest-freezer/mdrc284fze01ape/MDRC284FZE01APE-198L-Chest-Freezer-Spec-Sheet.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_PAGE_EXACT_MODEL` | width -> depth -> height | width, depth, height | `product_closed_candidate` | Product Dimensions W x D x H 770 x 560 × 850mm | p.2, `ac7f3fddd463` |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_PAGE_EXACT_MODEL` | width -> depth -> height | none | `delivery_package` | Package Dimensions W x D x H 797 × 578 × 888mm | p.2, `ac7f3fddd463` |

### Miele

- Raw brand variants: `Miele`
- Inventory models: 40
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Mistral

- Raw brand variants: `Mistral`
- Inventory models: 20
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Mitsubishi

- Raw brand variants: `Mitsubishi`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### MITSUBISHI ELECTRIC

- Raw brand variants: `MITSUBISHI ELECTRIC`, `Mitsubishi Electric`
- Inventory models: 91
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### modello

- Raw brand variants: `modello`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Mykin

- Raw brand variants: `Mykin`
- Inventory models: 55
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### NAKITA

- Raw brand variants: `NAKITA`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### NCE

- Raw brand variants: `NCE`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### NEFF

- Raw brand variants: `NEFF`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Nero

- Raw brand variants: `Nero`
- Inventory models: 10
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Nisbets Essentials

- Raw brand variants: `Nisbets Essentials`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Norj

- Raw brand variants: `Norj`
- Inventory models: 23
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Novello

- Raw brand variants: `Novello`
- Inventory models: 7
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Nulon

- Raw brand variants: `Nulon`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Omega

- Raw brand variants: `Omega`
- Inventory models: 36
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Panasonic

- Raw brand variants: `Panasonic`
- Inventory models: 13
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### PARMCO

- Raw brand variants: `PARMCO`
- Inventory models: 7
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Polar Refrigeration

- Raw brand variants: `Polar Refrigeration`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Prinetti

- Raw brand variants: `Prinetti`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Pulmuone

- Raw brand variants: `Pulmuone`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### RHINO

- Raw brand variants: `RHINO`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Robinhood

- Raw brand variants: `Robinhood`
- Inventory models: 37
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### RYOBI

- Raw brand variants: `RYOBI`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Samsung

- Raw brand variants: `SAMSUNG`, `Samsung`
- Inventory models: 53
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 1
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

#### SRF5300SD

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `SRF5300SD`
- PDF SHA-256: `2e8a8341d7b50aef67f84bceea136763a67e2b3535717f6559ce1447feefafae`
- Official/source URLs: <https://downloadcenter.samsung.com/content/UM/202605/20260518184516600/DA68-04132R-02_FDR_RF5000A_EN_260414.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 20

### SAMSUNG ELECTRONICS

- Raw brand variants: `SAMSUNG ELECTRONICS`
- Inventory models: 42
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Schmick

- Raw brand variants: `Schmick`
- Inventory models: 13
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SEIKI

- Raw brand variants: `SEIKI`
- Inventory models: 13
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SHARP

- Raw brand variants: `SHARP`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Sheffield

- Raw brand variants: `Sheffield`
- Inventory models: 19
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SHOME I SEIKI

- Raw brand variants: `SHOME I SEIKI`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SIEMENS

- Raw brand variants: `SIEMENS`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Simmons

- Raw brand variants: `Simmons`
- Inventory models: 7
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Smeg

- Raw brand variants: `Smeg`
- Inventory models: 191
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Solt

- Raw brand variants: `Solt`
- Inventory models: 38
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Stirling

- Raw brand variants: `Stirling`
- Inventory models: 13
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Sub-Zero

- Raw brand variants: `Sub-Zero`
- Inventory models: 138
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 8
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

#### ICBBI-36F/O-RH

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `ICBBI-36F/O-RH`
- PDF SHA-256: `23733272c00aed94cd96260fad6a953020fb6f2d1b5ab77a766d798581d5a055`, `8a02d76bf0fd66d418045dfc26b0257df4cc454fbe629a85ee48f86ef864e565`
- Official/source URLs: <https://au.subzero-wolf.com/en/products/assets/sub-zero/built-in-refrigeration/qr-sheets/icbbi-36f/icb-built-in-refrigeration-qr-sheet-36fo-st.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: Model ICBBI-36F/O Dimensions 914mmW x 2134mmH x 610mmD Freezer Capacity 620 L Weight 184 kg Electrical Supply 220-240 VAC; 50/60 Hz Electrical Service ≤4A Pl...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: Model ICBBI-36F/O Dimensions 914mmW x 2134mmH x 610mmD Freezer Capacity 620 L Weight 184 kg Electrical Supply 220-240 VAC; 50/60 Hz Electrical Service ≤4A Pl...

#### ICBBI-36R/O-LH

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `ICBBI-36R/O-LH`
- PDF SHA-256: `a7bc2ba8c07c49b6594454c41e371a31a9b889318243c37a652a6e44ccc19850`
- Official/source URLs: <https://au.subzero-wolf.com/en/products/assets/sub-zero/built-in-refrigeration/qr-sheets/icbbi-36r/icb-built-in-refrigeration-qr-sheet-36ro-st.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: Model ICBBI-36R/O Dimensions 914mmW x 2134mmH x 610mmD Refrigerator Capacity 644 L Weight 191 kg Electrical Supply 220-240 VAC; 50/60 Hz Electrical Service ≤...

#### ICBBI-36S/S/TH

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `ICBBI-36S/S/TH`
- PDF SHA-256: `9e4b672f1566cda88288221a7842f823f36331bebef6d61dd93d905f5001ded8`
- Official/source URLs: <https://au.subzero-wolf.com/en/products/assets/sub-zero/built-in-refrigeration/qr-sheets/icbbi-36s/icb-built-in-refrigeration-qr-sheet-36ss-st.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: Model ICBBI-36S/S Dimensions 914mmW x 2134mmH x 610mmD Refrigerator Capacity 341 L Freezer Capacity 235 L Weight 244 kg Electrical Supply 220-240 VAC; 50/60 ...

#### ICBBI-36UFDID/S/TH

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `ICBBI-36UFDID/S/TH`
- PDF SHA-256: `33361e634d5f3c6e4a253f42cf12abac22f935ef99d0ca2212e133f0876d5779`
- Official/source URLs: <https://au.subzero-wolf.com/en/products/assets/sub-zero/built-in-refrigeration/qr-sheets/icb-bi-36ufdid/icb-built-in-refrigeration-qr-sheet-36ufdids-st.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: Model ICBBI-36UFDID/S Dimensions 914mmW x 2134mmH x 610mmD Refrigerator Capacity 409L Freezer Capacity 147 L Weight 240 kg Electrical Supply 220-240 VAC; 50/...

#### ICBBI-36UID/O-LH

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `ICBBI-36UID/O-LH`
- PDF SHA-256: `c8c0f6c22c7ef5ca3e25f70ab4bafdd92102fabec73cbced51822a77525f3565`
- Official/source URLs: <https://au.subzero-wolf.com/en/products/assets/sub-zero/built-in-refrigeration/qr-sheets/icbbi-36uid/icb-built-in-refrigeration-qr-sheet-36uido-st.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: Model ICBBI-36UID/O Dimensions 914mmW x 2134mmH x 610mmD Refrigerator Capacity 438L Freezer Capacity 147 L Weight 234 kg Electrical Supply 220-240 VAC; 50/60...

#### ICBBI-42UFDID/S/TH

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `ICBBI-42UFDID/S/TH`
- PDF SHA-256: `50579a985d503a8bfa6e09dc90b6961973c7611e68665d88d174d6ef7d94c6cc`
- Official/source URLs: <https://au.subzero-wolf.com/en/products/assets/sub-zero/built-in-refrigeration/qr-sheets/icbbi-42ufdid/icb-built-in-refrigeration-qr-sheet-42ufdids-st.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: Model ICBBI-42UFDID/S Dimensions 1067mmW x 2134mmH x 610mmD Refrigerator Capacity 514 L Freezer Capacity 179L Weight 264 kg Electrical Supply 220-240 VAC; 50...

#### ICBBI-48S/O

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `ICBBI-48S/O`
- PDF SHA-256: `dd963f9bcd2700e5d872643eb725416d8b9cf99d05ba9d02553adc80ea57410d`
- Official/source URLs: <https://au.subzero-wolf.com/en/products/assets/sub-zero/built-in-refrigeration/qr-sheets/icbbi-48s/icb-built-in-refrigeration-qr-sheet-48so-st.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: Model ICBBI-48S/O Dimensions 1219mmW x 2134mmH x 610mmD Refrigerator Capacity 524 L Freezer Capacity 276 L Weight 286 kg Electrical Supply 220-240 VAC; 50/60...

### SUN PACIFIC TRADE

- Raw brand variants: `SUN PACIFIC TRADE`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Supreme

- Raw brand variants: `Supreme`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### TCL

- Raw brand variants: `TCL`
- Inventory models: 62
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### TECO

- Raw brand variants: `TECO`
- Inventory models: 67
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 1
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 1

#### PDF grammar pdf_grammar_4292fef22850d0bc

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `TFF334WNTAH`
- PDF SHA-256: `a91d0b798c9a413fea5f466a8f19683dbc261a6593a67bd69cac47ed1afda901`
- PDF grammar profiles: `pdf_grammar_4292fef22850d0bc`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://appliances.teco.com.au/wp-content/uploads/sites/2/2024/07/TFF334WNTAH-User-Manual.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_DOCUMENT_EXACT_MODEL` | width -> depth -> height | width, depth, height | `product_closed_candidate` | Width 600 \| Depth 665 \| Height 1700 | p.18, `3bc9b7a85ae6` |

### Teka

- Raw brand variants: `Teka`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Thermaster

- Raw brand variants: `Thermaster`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Throne

- Raw brand variants: `Throne`
- Inventory models: 8
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Trade Tested

- Raw brand variants: `Trade Tested`
- Inventory models: 8
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Tuscany

- Raw brand variants: `Tuscany`
- Inventory models: 9
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### V-ZUG

- Raw brand variants: `V-ZUG`
- Inventory models: 10
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Vinopro

- Raw brand variants: `Vinopro`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### VOGUE

- Raw brand variants: `VOGUE`
- Inventory models: 24
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Warrior Refrigeration

- Raw brand variants: `Warrior Refrigeration`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Westinghouse

- Raw brand variants: `Westinghouse`
- Inventory models: 290
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 34
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 20

#### Document family a792faf4dd33

- Group type: `document_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WHE6874BA`, `WHE6874SA`
- PDF SHA-256: `a792faf4dd337ea4fde2fcd9fa9b4904b7270c227be664765b95176a6ff7979a`
- PDF grammar profiles: `pdf_grammar_100af9c8141cceb2`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WHE6874SA&brand=Westinghouse>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1782 \| Total width (mm) 913 \| Total depth (mm) 803 | p.4, `9f17dff35fa6` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1756 \| Cabinet width (mm) 908 \| Cabinet depth (mm) 625 | p.4, `9f17dff35fa6` |

#### Document family b93c83bd4afe

- Group type: `document_family`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `WHE6000SB`, `WHE6060SB`, `WHE6170SB`, `WHE6270**`, `WQE6000SB`, `WQE6060BB`, `WQE6870SA`
- PDF SHA-256: `b93c83bd4afe217da18418c378c281b0745be1e13e6dd9694a9c543167d41f80`
- Official/source URLs: <https://resource.electrolux.com.au/Public/File/?Id=51196>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 1: These dimensions are a guide only. All measurements are in millimetres (mm). For complete installation instructions, refer to the manual provided with produc...

#### Document family bb77070e5331

- Group type: `document_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WBB3400AH`, `WBB3700AH`
- PDF SHA-256: `bb77070e533179e0de3e870ad70ad3a6d19b06d8d9ea38228f1e7fcc3d45cbcb`
- PDF grammar profiles: `pdf_grammar_69524ec285a85e26`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://resource.electrolux.com.au/Public/File/?Id=51192>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WBB3400AH/WH \| 1645 \| 598 \| 650 \| 1199 | p.1, `dccca0cb91d5` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WBB3700AH/WH \| 1755 \| 598 \| 650 \| 1199 | p.1, `dccca0cb91d5` |

#### Document family e316fc226e4d

- Group type: `document_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WFB4204WC`, `WFM1700WE`, `WRB3504*A`, `WRB3504SA`, `WRB5004WC`, `WRM2400WE`
- PDF SHA-256: `e316fc226e4dce0c2ce9f5c00b3d33659718a997b1a121883822fa75f35de954`
- PDF grammar profiles: `pdf_grammar_0ec14965bf7d3f23`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://resource.electrolux.com.au/Public/File/?Id=51198>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WFB4204SC/WC \| 1725 \| 699 \| 769 \| 1360 | p.1, `ca5a33a87eda` |
| `SUPPORTED_EXACT_MODEL_ROW_MATRIX` | `MODEL_ROW_DIMENSION_MATRIX` | `SAME_FRAGMENT_EXACT_MODEL` | height -> width -> depth -> depth | height, width, depth | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WRB3504SA/ WA \| 1746 \| 595 \| 700 \| 1175 | p.1, `ca5a33a87eda` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WFB2804SA/WA \| 1746 \| 595 \| 700 \| 1175 | p.1, `ca5a33a87eda` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WRB5004SC/WC \| 1725 \| 699 \| 641 \| 1360 | p.1, `ca5a33a87eda` |
| `SUPPORTED_EXACT_MODEL_ROW_MATRIX` | `MODEL_ROW_DIMENSION_MATRIX` | `SAME_FRAGMENT_EXACT_MODEL` | height -> width -> depth -> depth | height, width, depth | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WRM2400WE \| 1434 \| 550 \| 545 \| 1050 | p.1, `ca5a33a87eda` |
| `SUPPORTED_EXACT_MODEL_ROW_MATRIX` | `MODEL_ROW_DIMENSION_MATRIX` | `SAME_FRAGMENT_EXACT_MODEL` | height -> width -> depth -> depth | height, width, depth | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WFM1700WE \| 1434 \| 550 \| 560 \| 1065 | p.1, `ca5a33a87eda` |

#### Document family fa1629688c89

- Group type: `document_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WTB3100AK`, `WTB3100WK`, `WTB3400WK`
- PDF SHA-256: `fa1629688c89d0fec483a35539f4cf4ec7c078c2fe9f2f87bf024393b74db543`
- PDF grammar profiles: `pdf_grammar_c4bef6e07fdfa9df`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://resource.electrolux.com.au/Public/File/?Id=53211>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXACT_MODEL_ROW_MATRIX` | `MODEL_ROW_DIMENSION_MATRIX` | `SAME_FRAGMENT_EXACT_MODEL` | height -> width -> depth -> depth | height, width, depth | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WTB3400WK \| 1756 \| 598 \| 650 \| 1199 | p.1, `c4ae47aeec52` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WTB3400AK \| 1756 \| 598 \| 650 \| 1199 | p.1, `c4ae47aeec52` |
| `SUPPORTED_EXACT_MODEL_ROW_MATRIX` | `MODEL_ROW_DIMENSION_MATRIX` | `SAME_FRAGMENT_EXACT_MODEL` | height -> width -> depth -> depth | height, width, depth | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WTB3100WK \| 1646 \| 598 \| 650 \| 1199 | p.1, `c4ae47aeec52` |
| `SUPPORTED_EXACT_MODEL_ROW_MATRIX` | `MODEL_ROW_DIMENSION_MATRIX` | `SAME_FRAGMENT_EXACT_MODEL` | height -> width -> depth -> depth | height, width, depth | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WTB3100AK \| 1646 \| 598 \| 650 \| 1199 | p.1, `c4ae47aeec52` |

#### Document family fd329081b852

- Group type: `document_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WTB2300WH`, `WTB2800AH`, `WTB2800WH`, `WTB3400AH`, `WTB3400WH`, `WTB3700**`, `WTB3700WH`
- PDF SHA-256: `fd329081b8523c1a23adf30143d6f3c4c02c0c6726434993770595a8f3290ef6`
- PDF grammar profiles: `pdf_grammar_8fa44d420c63784c`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://resource.electrolux.com.au/Public/File/?Id=51194>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXACT_MODEL_ROW_MATRIX` | `MODEL_ROW_DIMENSION_MATRIX` | `SAME_FRAGMENT_EXACT_MODEL` | height -> width -> depth -> depth | height, width, depth | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WTB2300WH \| 1405 \| 540 \| 615 \| 1108 | p.1, `0a0dd5c2dccf` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WTB2500WH \| 1470 \| 540 \| 615 \| 1108 | p.1, `0a0dd5c2dccf` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WTB3700AH/ WH \| 1755 \| 598 \| 650 \| 1199 | p.1, `0a0dd5c2dccf` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WTB2800AH/WH \| 1605 \| 540 \| 615 \| 1108 | p.1, `0a0dd5c2dccf` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WTB3400AH/WH \| 1645 \| 598 \| 650 \| 1199 | p.1, `0a0dd5c2dccf` |

#### PDF grammar pdf_grammar_100af9c8141cceb2

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WHE6170SB`, `WHE6874BA`
- PDF SHA-256: `148c96022fe394b0ad19d6342fc5bc686ba1671a221cfc80d26e717e221f07dc`, `6358121dd57a859b11cb90c7653c90ae2e112c033f55111e5e4716bdf3d736f0`
- PDF grammar profiles: `pdf_grammar_100af9c8141cceb2`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WHE6170SB&brand=Westinghouse>, <https://www.appliancesonline.com.au/ak/0/1/9/2/0192e04f906bcc306046551bd4bf2f3a8373e7f2_WHE6874BA_Westinghouse_Specifications_Sheet.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1756 \| Cabinet width (mm) 908 \| Cabinet depth (mm) 625 | p.4, `b2aabcc1e1af` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1782 \| Total width (mm) 913 \| Total depth (mm) 750 | p.4, `07d1fa3bf9f8` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1782 \| Total width (mm) 913 \| Total depth (mm) 803 | p.4, `b2aabcc1e1af` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1756 \| Cabinet width (mm) 908 \| Cabinet depth (mm) 625 | p.4, `07d1fa3bf9f8` |

#### PDF grammar pdf_grammar_16b1caee4e18da81

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WTB2800WH`
- PDF SHA-256: `ba1cc555cddd723fe1f94af9dd70a5732e3de3fbdd45076be4ca41d92bb9d787`
- PDF grammar profiles: `pdf_grammar_16b1caee4e18da81`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WTB2800WH&brand=Westinghouse>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB3400AH/WH \| 1645 \| 598 \| 650 \| 1199 | p.6, `d819c09c1cc5` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB3700AH/ WH \| 1755 \| 598 \| 650 \| 1199 | p.6, `d819c09c1cc5` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB2500WH \| 1470 \| 540 \| 615 \| 1108 | p.6, `d819c09c1cc5` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB2800AH/ WH \| 1605 \| 540 \| 615 \| 1108 | p.6, `d819c09c1cc5` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | width -> depth | none | `product_body` | Cabinet width (mm) 540 \| Cabinet depth (mm) 540 | p.3, `4f6fb6be816f` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1605 \| Total width (mm) 540 \| Total depth (mm) 615 | p.3, `4f6fb6be816f` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB2300WH \| 1405 \| 540 \| 615 \| 1108 | p.6, `d819c09c1cc5` |

#### PDF grammar pdf_grammar_1cb932102aaee1e6

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `WBB3400WK`, `WHE5204BC`, `WRB3504SA`, `WTB3100AK`, `WTB3100WK`, `WTB3400WK`
- PDF SHA-256: `7fa339058db3d8c012bdecc7be64a68c886c0ec7432da85ab1e8f64a70846f37`, `b330fc963a0bccdcf4f22b489a652e22248bcf7d3b3881b1b10c90a60d247940`, `b998d27ecff08c424d176fb891716753737971a29faad91cb10e79fa728c9871`, `b9ebd6cf6defbff55552142dc979d68658586576bc305379edab25ec66d4a3cf`, `f795d1457c810856200687804f79a568632024b753ad2d45023f95fed7625a8c`, `f94a7bd25f0a3c037fe50ae6420e43180935f16122e2e10f646893ed427a07e3`
- PDF grammar profiles: `pdf_grammar_1cb932102aaee1e6`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WBB3400WK&brand=Westinghouse>, <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WHE5204BC&brand=Westinghouse>, <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WRB3504SA&brand=Westinghouse>, <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WTB3100AK&brand=Westinghouse>, <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WTB3100WK&brand=Westinghouse>, <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WTB3400WK&brand=Westinghouse>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1746 \| Total width (mm) 595 \| Total depth (mm) 700 | p.3, `dc1269e47d28` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1746 \| Cabinet width (mm) 595 \| Cabinet depth (mm) 560 | p.3, `dc1269e47d28` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1650 \| Cabinet width (mm) 595 \| Cabinet depth (mm) 575 | p.3, `78c3d8e002b2` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1756 \| Cabinet width (mm) 595 \| Cabinet depth (mm) 575 | p.3, `34a859306c28` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1740 \| Cabinet width (mm) 595 \| Cabinet depth (mm) 575 | p.3, `0b5dad19f06e` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1705 \| Cabinet width (mm) 790 \| Cabinet depth (mm) 641 | p.4, `00df4a84ef5d` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1650 \| Total width (mm) 598 \| Total depth (mm) 650 | p.3, `78c3d8e002b2` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1650 \| Cabinet width (mm) 595 \| Cabinet depth (mm) 575 | p.3, `78c3d8e002b2` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1756 \| Total width (mm) 598 \| Total depth (mm) 650 | p.3, `34a859306c28` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1756 \| Total width (mm) 598 \| Total depth (mm) 650 | p.3, `0b5dad19f06e` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1725 \| Total width (mm) 796 \| Total depth (mm) 769 | p.4, `00df4a84ef5d` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1650 \| Total width (mm) 598 \| Total depth (mm) 650 | p.3, `78c3d8e002b2` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 5: These dimensions are a guide only. All measurements are in millimetres (mm). For complete installation instructions, refer to the manual provided with produc...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 6: These dimensions are a guide only. All measurements are in millimetres (mm). For complete installation instructions, refer to the manual provided with produc...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 6: These dimensions are a guide only. All measurements are in millimetres (mm). For complete installation instructions, refer to the manual provided with produc...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 6: These dimensions are a guide only. All measurements are in millimetres (mm). For complete installation instructions, refer to the manual provided with produc...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 6: These dimensions are a guide only. All measurements are in millimetres (mm). For complete installation instructions, refer to the manual provided with produc...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 8: text_list unordered text These dimensions are a guide only. All measurements are in millimetres (mm). For complete installation instructions, refer to the ma...

#### PDF grammar pdf_grammar_1d0ba4027a75b5ef

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WQE6000SB`, `WQE6060BB`, `WQE6870SA`
- PDF SHA-256: `0e42655cc2428c89620b7e384015ac5d71d124fd22d67864f4a2335c7a721b97`, `1114024145d0ff43d97b1b63a89afcd06fe96a0f048d0e915a0891c9c3b29c87`, `472b0ed613801ea601da1d96d4f88e4a92f560b1065d3b30400bbe003a0f53e9`
- PDF grammar profiles: `pdf_grammar_1d0ba4027a75b5ef`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WQE6000SB&brand=Westinghouse>, <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WQE6060BB&brand=Westinghouse>, <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WQE6870SA&brand=Westinghouse>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WQE6000BB/SB \| 1725 \| 896 \| 641 \| 1105 | p.9, `83719444fa94` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WQE6060BB/SB \| 1725 \| 896 \| 641 \| 1105 | p.8, `9eb9d762e306` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WHE6000SB \| 1725 \| 896 \| 641 \| 1105 | p.8, `9eb9d762e306` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WHE6060SB \| 1725 \| 896 \| 641 \| 1105 | p.9, `83719444fa94` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WHE6060SB \| 1725 \| 896 \| 641 \| 1105 | p.8, `9eb9d762e306` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WQE6060BB/SB \| 1725 \| 896 \| 641 \| 1105 | p.8, `9eb9d762e306` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WQE6870BA/SA \| 1782 \| 913 \| 749 \| 1189 | p.9, `83719444fa94` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WQE6000BB/SB \| 1725 \| 896 \| 641 \| 1105 | p.8, `9eb9d762e306` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1725 \| Total width (mm) 896 \| Total depth (mm) 781 | p.4, `8922117cfc22` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WHE6170BB/SB \| 1782 \| 913 \| 813 \| 1189 | p.8, `9eb9d762e306` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WHE6170BB/SB \| 1782 \| 913 \| 813 \| 1189 | p.9, `83719444fa94` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WHE6270SB \| 1782 \| 913 \| 813 \| 1189 | p.8, `9eb9d762e306` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WQE6060BB/SB \| 1725 \| 896 \| 641 \| 1105 | p.9, `83719444fa94` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WHE6000SB \| 1725 \| 896 \| 641 \| 1105 | p.8, `9eb9d762e306` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WHE6000SB \| 1725 \| 896 \| 641 \| 1105 | p.9, `83719444fa94` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1705 \| Cabinet width (mm) 890 \| Cabinet depth (mm) 641 | p.4, `e715afa160bd` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1725 \| Total width (mm) 896 \| Total depth (mm) 781 | p.4, `e715afa160bd` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WQE6000BB/SB \| 1725 \| 896 \| 641 \| 1105 | p.8, `9eb9d762e306` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WHE6270SB \| 1782 \| 913 \| 813 \| 1189 | p.8, `9eb9d762e306` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1756 \| Cabinet width (mm) 908 \| Cabinet depth (mm) 625 | p.4, `ff940d7ff7c0` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1782 \| Total width (mm) 913 \| Total depth (mm) 749 | p.4, `ff940d7ff7c0` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WQE6870BA/SA \| 1782 \| 913 \| 749 \| 1189 | p.8, `9eb9d762e306` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WHE6270SB \| 1782 \| 913 \| 813 \| 1189 | p.9, `83719444fa94` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1705 \| Cabinet width (mm) 890 \| Cabinet depth (mm) 641 | p.4, `8922117cfc22` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WHE6170BB/SB \| 1782 \| 913 \| 813 \| 1189 | p.8, `9eb9d762e306` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WQE6870BA/SA \| 1782 \| 913 \| 749 \| 1189 | p.8, `9eb9d762e306` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WHE6060SB \| 1725 \| 896 \| 641 \| 1105 | p.8, `9eb9d762e306` |

#### PDF grammar pdf_grammar_2d4b6ff55811ccdc

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WBB3700AH`
- PDF SHA-256: `3433c28d75c05b2d19a3abbcb37a97c2489d756f7d0f55f95e328e0f855e7cc1`
- PDF grammar profiles: `pdf_grammar_2d4b6ff55811ccdc`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WBB3700AH&brand=Westinghouse>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WBB3700AH/WH \| 30 \| 50 \| 50 \| millimetres (mm). For c to the manual provided | p.7, `e21cf92ebb78` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1755 \| Total width (mm) 598 \| Total depth (mm) 650 | p.4, `132f2cb3cc01` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WBB3400AH/ WH \| 30 \| 50 \| 50 \| © 2021 Electrolux Home 341. W DIM CBM Oct2 | p.7, `e21cf92ebb78` |
| `SUPPORTED_EXACT_MODEL_ROW_MATRIX` | `MODEL_ROW_DIMENSION_MATRIX` | `SAME_FRAGMENT_EXACT_MODEL` | height -> width -> depth -> depth | height, width, depth | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WBB3700AH/ WH \| 1755 \| 598 \| 650 \| 1199 | p.7, `e21cf92ebb78` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1741 \| Cabinet width (mm) 595 \| Cabinet depth (mm) 575 | p.4, `132f2cb3cc01` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WBB3400AH/ WH \| 1645 \| 598 \| 650 \| 1199 | p.7, `e21cf92ebb78` |

#### PDF grammar pdf_grammar_360bfc8ead68f688

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WTB2300WH`
- PDF SHA-256: `3dd61145ed4f25750ed963d8a0ab0fc06fee0644d1e3d4d9cd065dd1e188497f`
- PDF grammar profiles: `pdf_grammar_360bfc8ead68f688`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WTB2300WH&brand=Westinghouse>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | width -> depth | none | `product_body` | Cabinet width (mm) 540 \| Cabinet depth (mm) 540 | p.3, `096088f39298` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB3400AH/WH \| 1645 \| 598 \| 650 \| 1199 | p.6, `d819c09c1cc5` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1405 \| Total width (mm) 540 \| Total depth (mm) 615 | p.3, `096088f39298` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB2800AH/ WH \| 1605 \| 540 \| 615 \| 1108 | p.6, `d819c09c1cc5` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB3700AH/ WH \| 1755 \| 598 \| 650 \| 1199 | p.6, `d819c09c1cc5` |
| `SUPPORTED_PARTIAL_REJECT_AMBIGUOUS_AXIS_COLUMNS` | `MODEL_ROW_DIMENSION_MATRIX` | `SAME_FRAGMENT_EXACT_MODEL` | height -> width -> depth -> depth | height, width | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB2300WH \| 1405 \| 540 \| 615 \| 1108 | p.6, `d819c09c1cc5` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB2500WH \| 1470 \| 540 \| 615 \| 1108 | p.6, `d819c09c1cc5` |

#### PDF grammar pdf_grammar_3d4a6e7607c06952

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WBE4500WC`
- PDF SHA-256: `2ea2e33d92ed6f2dcead71948979fb4b37804789983674bfae1d8710436fbfed`
- PDF grammar profiles: `pdf_grammar_3d4a6e7607c06952`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WBE4500WC&brand=Westinghouse>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (Door Open) (D2) \| WBE4500BC/SC/WC \| 1725 \| 699 \| 723 \| 1360 | p.7, `ace1d63faf0e` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (Door Open) (D2) \| WBE5300BC/SC/WC \| 1725 \| 796 \| 723 \| 1457 | p.7, `ace1d63faf0e` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1718 \| Cabinet width (mm) 693 \| Cabinet depth (mm) 641 | p.4, `6fc86a6b3807` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (Door Open) (D2) \| WBE5304BC/SC \| 1725 \| 796 \| 769 \| 1457 | p.7, `ace1d63faf0e` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1725 \| Total width (mm) 699 \| Total depth (mm) 723 | p.4, `6fc86a6b3807` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (Door Open) (D2) \| WBE4504BC/SC \| 1725 \| 699 \| 769 \| 1360 | p.7, `ace1d63faf0e` |

#### PDF grammar pdf_grammar_46e7687d8947bc3b

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WBE4500WC`
- PDF SHA-256: `4d63434cb2468d2c6fd64d2a38ad1f86518b85d4bceb991457001fd104e02a5d`
- PDF grammar profiles: `pdf_grammar_46e7687d8947bc3b`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://resource.electrolux.com.au/Public/File/?Id=51195>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WBE4500BC/SC/WC \| 1725 \| 699 \| 723 \| 1360 | p.1, `781f0fa9e711` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WBE5304BC/SC \| 1725 \| 796 \| 769 \| 1457 | p.1, `781f0fa9e711` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WBE5300BC/SC/WC \| 1725 \| 796 \| 723 \| 1457 | p.1, `781f0fa9e711` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WBE4504BC/SC \| 1725 \| 699 \| 769 \| 1360 | p.1, `781f0fa9e711` |

#### PDF grammar pdf_grammar_49a5f912538c8ab9

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WHE6000SB`, `WHE6060SB`
- PDF SHA-256: `147256f7acd15d9cabfd60c5eb333c8fd4bedb4f58d5ed4d67fe4182c90a8421`, `95faa1605404bd0eacb6804297f826bd73f827f39cd77d7311ce9d1bd376f2e5`
- PDF grammar profiles: `pdf_grammar_49a5f912538c8ab9`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WHE6000SB&brand=Westinghouse>, <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WHE6060SB&brand=Westinghouse>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXACT_MODEL_ROW_MATRIX` | `MODEL_ROW_DIMENSION_MATRIX` | `SAME_FRAGMENT_EXACT_MODEL` | height -> width -> depth -> depth | height, width, depth | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WHE6000SB \| 1725 \| 896 \| 641 \| 1105 | p.8, `9eb9d762e306` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WHE6170BB/SB \| 1782 \| 913 \| 813 \| 1189 | p.8, `9eb9d762e306` |
| `SUPPORTED_EXACT_MODEL_ROW_MATRIX` | `MODEL_ROW_DIMENSION_MATRIX` | `SAME_FRAGMENT_EXACT_MODEL` | height -> width -> depth -> depth | height, width, depth | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WHE6060SB \| 1725 \| 896 \| 641 \| 1105 | p.8, `9eb9d762e306` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1725 \| Total width (mm) 896 \| Total depth (mm) 781 | p.4, `4dfb3ecab659` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WQE6060BB/SB \| 1725 \| 896 \| 641 \| 1105 | p.8, `9eb9d762e306` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1705 \| Cabinet width (mm) 890 \| Cabinet depth (mm) 641 | p.4, `671d883900d5` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WQE6870BA/SA \| 1782 \| 913 \| 749 \| 1189 | p.8, `9eb9d762e306` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WHE6270SB \| 1782 \| 913 \| 813 \| 1189 | p.8, `9eb9d762e306` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WQE6870BA/SA \| 1782 \| 913 \| 749 \| 1189 | p.8, `9eb9d762e306` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WHE6060SB \| 1725 \| 896 \| 641 \| 1105 | p.8, `9eb9d762e306` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WHE6270SB \| 1782 \| 913 \| 813 \| 1189 | p.8, `9eb9d762e306` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WQE6060BB/SB \| 1725 \| 896 \| 641 \| 1105 | p.8, `9eb9d762e306` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1725 \| Total width (mm) 896 \| Total depth (mm) 781 | p.4, `671d883900d5` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WHE6170BB/SB \| 1782 \| 913 \| 813 \| 1189 | p.8, `9eb9d762e306` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WQE6000BB/SB \| 1725 \| 896 \| 641 \| 1105 | p.8, `9eb9d762e306` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WHE6000SB \| 1725 \| 896 \| 641 \| 1105 | p.8, `9eb9d762e306` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WQE6000BB/SB \| 1725 \| 896 \| 641 \| 1105 | p.8, `9eb9d762e306` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1705 \| Cabinet width (mm) 890 \| Cabinet depth (mm) 641 | p.4, `4dfb3ecab659` |

#### PDF grammar pdf_grammar_521baab91653d9a9

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WBB3400AH`
- PDF SHA-256: `eb7dea9936b9030beb89739f3a0e6abb09bd16ce6d81784e0539aae457eb3c76`
- PDF grammar profiles: `pdf_grammar_521baab91653d9a9`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WBB3400AH&brand=Westinghouse>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXACT_MODEL_ROW_MATRIX` | `MODEL_ROW_DIMENSION_MATRIX` | `SAME_FRAGMENT_EXACT_MODEL` | height -> width -> depth | height, width, depth | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WBB3400AH/ WH \| 30 \| 50 \| 50 \| © 2021 Electrolux Home 341. W DIM CBM Oct2 | p.7, `fd30a0fad364` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1631 \| Cabinet width (mm) 595 \| Cabinet depth (mm) 575 | p.4, `2afa2d65eb17` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WBB3400AH/WH \| 1645 \| 598 \| 650 \| 1199 | p.7, `fd30a0fad364` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WBB3700AH/ WH \| 1755 \| 598 \| 650 \| 1199 | p.7, `fd30a0fad364` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WBB3700AH/WH \| 30 \| 50 \| 50 \| millimetres (mm). For c to the manual provided | p.7, `fd30a0fad364` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1645 \| Total width (mm) 598 \| Total depth (mm) 650 | p.4, `2afa2d65eb17` |

#### PDF grammar pdf_grammar_54c02d74452c542a

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WTB3400AH`, `WTB3400WH`, `WTB3700WH`
- PDF SHA-256: `093085695070187f0bd284554635e3dd85876aab21416153ab0ea313632d7e99`, `5c8f1af45db3563e15c154a8d7c1878768a496dee568fd6a236b944a86619c31`, `6efe163d127f7a5f94e55db069b7929c54a47a9408122753467e3fc876f2f16a`
- PDF grammar profiles: `pdf_grammar_54c02d74452c542a`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WTB3400AH&brand=Westinghouse>, <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WTB3400WH&brand=Westinghouse>, <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WTB3700WH&brand=Westinghouse>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1630 \| Cabinet width (mm) 595 \| Cabinet depth (mm) 575 | p.4, `b763d6892d52` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB3400AH/WH \| 1645 \| 598 \| 650 \| 1199 | p.8, `c987586519ef` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB3700AH/ WH \| 1755 \| 598 \| 650 \| 1199 | p.7, `4992e9af17b2` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1630 \| Cabinet width (mm) 595 \| Cabinet depth (mm) 575 | p.3, `efc1915d5d82` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1740 \| Cabinet width (mm) 595 \| Cabinet depth (mm) 575 | p.4, `b3ad0479c69b` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB2500WH \| 1470 \| 540 \| 615 \| 1108 | p.7, `4992e9af17b2` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB2800AH/ WH \| 1605 \| 540 \| 615 \| 1108 | p.7, `4992e9af17b2` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1645 \| Total width (mm) 598 \| Total depth (mm) 650 | p.3, `efc1915d5d82` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB2800AH/ WH \| 1605 \| 540 \| 615 \| 1108 | p.8, `c987586519ef` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB2300WH \| 1405 \| 540 \| 615 \| 1108 | p.8, `c987586519ef` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB2300WH \| 1405 \| 540 \| 615 \| 1108 | p.7, `4992e9af17b2` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB3400AH/WH \| 1645 \| 598 \| 650 \| 1199 | p.7, `4992e9af17b2` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB3700AH/ WH \| 1755 \| 598 \| 650 \| 1199 | p.8, `c987586519ef` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB3700AH/ WH \| 1755 \| 598 \| 650 \| 1199 | p.8, `c987586519ef` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB2300WH \| 1405 \| 540 \| 615 \| 1108 | p.8, `c987586519ef` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB3400AH/WH \| 1645 \| 598 \| 650 \| 1199 | p.8, `c987586519ef` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1645 \| Total width (mm) 598 \| Total depth (mm) 650 | p.4, `b763d6892d52` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB2800AH/ WH \| 1605 \| 540 \| 615 \| 1108 | p.8, `c987586519ef` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1755 \| Total width (mm) 598 \| Total depth (mm) 650 | p.4, `b3ad0479c69b` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB2500WH \| 1470 \| 540 \| 615 \| 1108 | p.8, `c987586519ef` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB2500WH \| 1470 \| 540 \| 615 \| 1108 | p.8, `c987586519ef` |

#### PDF grammar pdf_grammar_5e419e6b68c17c2c

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WFB4204WC`, `WRB5004WC`
- PDF SHA-256: `3cad4157389834f8300e0008f89ff4e3d0e2ad8dfbbd383d7bc2eb9f817c5b25`, `4972dc62d2a9e06e2e283391e38927426ac7db7448e33db48a8d54b49556f964`
- PDF grammar profiles: `pdf_grammar_5e419e6b68c17c2c`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WFB4204WC&brand=Westinghouse>, <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WRB5004WC&brand=Westinghouse>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WRB3504AB/WB \| 1720 \| 597 \| 652 \| 1115 | p.6, `375a85b21bf4` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WRM2400WF \| 1434 \| 550 \| 545 \| 1050 | p.6, `375a85b21bf4` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WRM2400WF \| 1434 \| 550 \| 545 \| 1050 | p.6, `375a85b21bf4` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WFB2804AB/WB \| 1720 \| 595 \| 652 \| 1115 | p.6, `375a85b21bf4` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WFB4204SC/WC \| 1725 \| 699 \| 769 \| 1360 | p.6, `375a85b21bf4` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1725 \| Total width (mm) 699 \| Total depth (mm) 769 | p.3, `ce5e64e8a411` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WFB4204SC/WC \| 1725 \| 699 \| 769 \| 1360 | p.6, `375a85b21bf4` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WFB2804AB/WB \| 1720 \| 595 \| 652 \| 1115 | p.6, `375a85b21bf4` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WRB3504AB/WB \| 1720 \| 597 \| 652 \| 1115 | p.6, `375a85b21bf4` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WFM1700WE \| 1434 \| 550 \| 560 \| 1065 | p.6, `375a85b21bf4` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1725 \| Total width (mm) 699 \| Total depth (mm) 769 | p.3, `99d6a453d165` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WRB5004SC/WC \| 1725 \| 699 \| 641 \| 1360 | p.6, `375a85b21bf4` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WRB5004SC/WC \| 1725 \| 699 \| 641 \| 1360 | p.6, `375a85b21bf4` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1718 \| Cabinet width (mm) 693 \| Cabinet depth (mm) 641 | p.3, `99d6a453d165` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WFM1700WE \| 1434 \| 550 \| 560 \| 1065 | p.6, `375a85b21bf4` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1718 \| Cabinet width (mm) 693 \| Cabinet depth (mm) 641 | p.3, `ce5e64e8a411` |

#### PDF grammar pdf_grammar_aa27ff5cbc948a0a

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WFM1700WE`
- PDF SHA-256: `55305ddb10a848249ba2ff2e67e7136538f1de020e42e5fb1c2d942364f6b428`
- PDF grammar profiles: `pdf_grammar_aa27ff5cbc948a0a`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WFM1700WE&brand=Westinghouse>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WRM2400WF \| 1434 \| 550 \| 545 \| 1050 | p.5, `aa32f3f4edd3` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1434 \| Total width (mm) 550 \| Total depth (mm) 560 | p.3, `b273010b375d` |
| `SUPPORTED_EXACT_MODEL_ROW_MATRIX` | `MODEL_ROW_DIMENSION_MATRIX` | `SAME_FRAGMENT_EXACT_MODEL` | height -> width -> depth -> depth | height, width, depth | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WFM1700WE \| 1434 \| 550 \| 560 \| 1065 | p.5, `aa32f3f4edd3` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WFB2804AB/WB \| 1720 \| 595 \| 652 \| 1115 | p.5, `aa32f3f4edd3` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WRB5004SC/WC \| 1725 \| 699 \| 641 \| 1360 | p.5, `aa32f3f4edd3` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WFB4204SC/WC \| 1725 \| 699 \| 769 \| 1360 | p.5, `aa32f3f4edd3` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WRB3504AB/WB \| 1720 \| 597 \| 652 \| 1115 | p.5, `aa32f3f4edd3` |

#### PDF grammar pdf_grammar_cd5b1932a482a334

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `WRM2400WE`
- PDF SHA-256: `be055e8510b6054159a80b9368d7590d90f9d0fa4bea90357bfccf9e63fde3b3`
- PDF grammar profiles: `pdf_grammar_cd5b1932a482a334`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WRM2400WE&brand=Westinghouse>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | none | `product_body` | Cabinet width (mm) 550 | p.3, `4bcd71e12ff1` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1434 \| Total width (mm) 550 \| Total depth (mm) 545 | p.3, `4bcd71e12ff1` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 5: These dimensions are a guide only. All measurements are in millimetres (mm). For complete installation instructions, refer to the manual provided with produc...

#### PDF grammar pdf_grammar_dbf3e0b2699437a2

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WTB2800AH`
- PDF SHA-256: `f2346bc64c2a7dc568f98a92abdc43eca7394531f3fbd699a55f9eae6341831a`
- PDF grammar profiles: `pdf_grammar_dbf3e0b2699437a2`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WTB2800AH&brand=Westinghouse>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB3400AH/WH \| 1645 \| 598 \| 650 \| 1199 | p.7, `4992e9af17b2` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB2300WH \| 1405 \| 540 \| 615 \| 1108 | p.7, `4992e9af17b2` |
| `SUPPORTED_PARTIAL_REJECT_AMBIGUOUS_AXIS_COLUMNS` | `MODEL_ROW_DIMENSION_MATRIX` | `SAME_FRAGMENT_EXACT_MODEL` | height -> width -> depth -> depth | height, width | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB2800AH/ WH \| 1605 \| 540 \| 615 \| 1108 | p.7, `4992e9af17b2` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB2500WH \| 1470 \| 540 \| 615 \| 1108 | p.7, `4992e9af17b2` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1590 \| Cabinet width (mm) 540 \| Cabinet depth (mm) 540 | p.3, `00914fd440af` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1605 \| Total width (mm) 540 \| Total depth (mm) 615 | p.3, `00914fd440af` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB3700AH/ WH \| 1755 \| 598 \| 650 \| 1199 | p.7, `4992e9af17b2` |

#### PDF grammar pdf_grammar_f77a3bb1503ef8aa

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WBB3400WK`
- PDF SHA-256: `073ebcb4c670c093141cae247ed177d1dee48087abb0b6b0c6c47c4f239e1735`
- PDF grammar profiles: `pdf_grammar_f77a3bb1503ef8aa`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://resource.electrolux.com.au/Public/File/?Id=53210>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WBB3100WK \| 1646 \| 598 \| 650 \| 1199 | p.1, `f0834ee47cb4` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WBB3400AK \| 1756 \| 598 \| 650 \| 1199 | p.1, `f0834ee47cb4` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WBB3100AK \| 1646 \| 598 \| 650 \| 1199 | p.1, `f0834ee47cb4` |
| `SUPPORTED_EXACT_MODEL_ROW_MATRIX` | `MODEL_ROW_DIMENSION_MATRIX` | `SAME_FRAGMENT_EXACT_MODEL` | height -> width -> depth -> depth | height, width, depth | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WBB3400WK \| 1756 \| 598 \| 650 \| 1199 | p.1, `f0834ee47cb4` |

### WHIRLPOOL

- Raw brand variants: `WHIRLPOOL`, `Whirlpool`
- Inventory models: 25
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### WINTERWULF

- Raw brand variants: `WINTERWULF`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### yokohama

- Raw brand variants: `yokohama`
- Inventory models: 22
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

## Dishwashers

Inventory: 1419 models across 91 category-brand groups.

### AEG

- Raw brand variants: `AEG`
- Inventory models: 15
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Anko

- Raw brand variants: `Anko`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### ARISTON

- Raw brand variants: `ARISTON`
- Inventory models: 9
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Artusi

- Raw brand variants: `Artusi`
- Inventory models: 58
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 2
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 1

#### ADW5009X

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `ADW5009X`
- PDF SHA-256: `1c5edce84593807c62ca2a975c42373e75d96c2c35b3ffa6884efb8bfbc23a68`
- Official/source URLs: <https://artusi.com.au/wp-content/uploads/2025/11/PF_ADW5009_Artusi-1.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 2

#### PDF grammar pdf_grammar_86d30e2b33f39e6d

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `ADW5009X`
- PDF SHA-256: `8f9dcb39e08164a629d4a0736ea14e4addd8cf5da1ee5320d4e8250d6b9e2eef`
- PDF grammar profiles: `pdf_grammar_86d30e2b33f39e6d`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://artusi.com.au/wp-content/uploads/2025/11/16076000B36026-General-combined-User-Manual-ADW5009XBWMBWQP12-U7609W-AUArtusi.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_DOCUMENT_EXACT_MODEL` | height -> width | height, width | `product_closed_candidate` | Height (H) 845mm \| Width (W) 598mm | p.45, `730c2fc8a143` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 19

### ASKO

- Raw brand variants: `ASKO`
- Inventory models: 67
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Astivita

- Raw brand variants: `Astivita`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### AWARD

- Raw brand variants: `AWARD`
- Inventory models: 9
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Baumatic

- Raw brand variants: `Baumatic`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Beko

- Raw brand variants: `BEKO`, `Beko`
- Inventory models: 35
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Belling

- Raw brand variants: `Belling`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Bellini

- Raw brand variants: `Bellini`
- Inventory models: 26
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Bellissimo

- Raw brand variants: `Bellissimo`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Bertazzoni

- Raw brand variants: `Bertazzoni`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### BLANCO

- Raw brand variants: `BLANCO`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Blaupunkt

- Raw brand variants: `Blaupunkt`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Bosch

- Raw brand variants: `BOSCH`, `Bosch`
- Inventory models: 112
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 2
- Proven marketing series: 2; total series count: `PROVEN_MINIMUM_ONLY`
- PDF grammar profiles: 0

#### Series 4

- Group type: `marketing_series`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `SMS4HVI01A`
- PDF SHA-256: `9ddcdcf99e13652eb09b91bd593b167a861100e41359a8df9f538fe0756a39e0`
- Official/source URLs: <https://media3.bosch-home.com/Documents/specsheet/en-AU/SMS4HVI01A.pdf>
- Series evidence: page 1, `Series 4, free-standing dishwasher, 60 cm, Brushed steel anti-fingerprint SMS4HVI01A`; page 2, `Series 4, free-standing dishwasher, 60 cm, Brushed steel anti-fingerprint SMS4HVI01A`; page 3, `Series 4, free-standing dishwasher, 60 cm, Brushed steel anti-fingerprint SMS4HVI01A`

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: Product Dimensions (H x W x D)
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 3: measurements in mm

#### Series 6

- Group type: `marketing_series`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `SMS6HCI02A`
- PDF SHA-256: `4dc43bd18a6ea7d92edbcefe260bea1d6440e778b66c11ca8f52413a94b21575`
- Official/source URLs: <https://media3.bosch-home.com/Documents/specsheet/en-AU/SMS6HCI02A.pdf>
- Series evidence: page 1, `Series 6, free-standing dishwasher, 60 cm, Brushed steel anti-fingerprint SMS6HCI02A`; page 2, `Series 6, free-standing dishwasher, 60 cm, Brushed steel anti-fingerprint SMS6HCI02A`; page 3, `Series 6, free-standing dishwasher, 60 cm, Brushed steel anti-fingerprint SMS6HCI02A`

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: Product Dimensions (H x W x D)
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 3: measurements in mm

### CASA

- Raw brand variants: `CASA`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Comfee

- Raw brand variants: `Comfee`
- Inventory models: 9
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### De Dietrich

- Raw brand variants: `De Dietrich`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### De’Longhi

- Raw brand variants: `De’Longhi`
- Inventory models: 9
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Devanti

- Raw brand variants: `Devanti`
- Inventory models: 16
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Di Lusso

- Raw brand variants: `Di Lusso`
- Inventory models: 9
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Domain

- Raw brand variants: `Domain`
- Inventory models: 9
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Duos

- Raw brand variants: `Duos`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Electrolux

- Raw brand variants: `Electrolux`
- Inventory models: 20
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Emilia

- Raw brand variants: `Emilia`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Esatto

- Raw brand variants: `Esatto`
- Inventory models: 21
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### EURO

- Raw brand variants: `EURO`
- Inventory models: 33
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Euromaid

- Raw brand variants: `Euromaid`
- Inventory models: 15
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### EUROMATIC

- Raw brand variants: `EUROMATIC`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Eurotech

- Raw brand variants: `Eurotech`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Everdure

- Raw brand variants: `Everdure`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### EVOKE

- Raw brand variants: `EVOKE`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Fisher & Paykel

- Raw brand variants: `Fisher & Paykel`
- Inventory models: 98
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 87
- Proven marketing series: 1; total series count: `PROVEN_MINIMUM_ONLY`
- PDF grammar profiles: 18

#### Document family e7adc05013ac

- Group type: `document_family`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `DD60DI9`, `DD60SI9`, `DD60STI9`
- PDF SHA-256: `e7adc05013ac240671f02d0876cb17735fb527dc771ef427d43cf586a9465edc`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/bj87mrck695v88s6gm768r/FP-QuickStartGuide-DD60STI9-IntegratedSingleDishDrawer-AU-NZ-591379B.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/cxgqrr3vm82x5kctx8pmqmb6/FP-QuickStartGuide-DD60DI9-IntegratedDoubleDishDrawer-AU-NZ-591379B.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/fkmhzwpvf3csjv3vtts8xh/FP-QuickStartGuide-DD60SI9-IntegratedSingleDishDrawer-AU-NZ-591379B.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### Series 11

- Group type: `marketing_series`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `DD60DTX6I1`, `DD60STX6I1`
- PDF SHA-256: `1dcf17d4cdd9d746e3a7a84b412da39be2a66d92c17c80eaf0dc98e75b3d4022`, `eafd213b394ea5a05acba608d52e5978dfbe8e75a4006157367cf1886512bd24`
- PDF grammar profiles: `pdf_grammar_d2966356badf2086`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/j59m7qx3566xt729hmgbjw/FP-PlanningGuide-en-DD60DTX6-DishDrawer-DoubleTall-90004476B-NZ-AU-UK-IE-SG-ASIA.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/qcgwhnrznvtzgrnkpzrnmw9z/FP-PlanningGuide-en-DD60STX6I1-DD60STX6HI1-DishDrawer-SingleTall-90004490A-NZ-AU-UK-IE-EU-SG-ASIA.pdf>
- Series evidence: page 1, `SERIES 11 \| DD60STX6I1 \| DD60STX6HI1`; page 9, `DD60STX6I1 Series 11, Integrated Tall Single DishDrawer™ DishwasherDD60STX6HI1 Series 11, Integrated Tall Single DishDrawer™ DishwasherSh...`; page 1, `SERIES 11 \| DD60DTX6I1 \| DD60DTX6HI1`

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ①Contemporary Single DishDrawer™ Series 7 \| 410mm \| 599mm \| 573mm | p.4, `a91b6f871165` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ⑥Integrated Built-Under Dishwasher Series 7 \| 820-880mm \| 598mm \| 554mm | p.5, `5b9e4d400785` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ① \| 410mm \| 599mm \| 553mm | p.5, `5b9e4d400785` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ⑥Contemporary Dishwasher Series 7 \| 850-895mm \| 597mm \| 600mm | p.4, `a91b6f871165` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ④Integrated Double DishDrawer™ Series 9 \| 820-880mm \| 599mm \| 571mm | p.5, `1b0e07d8cc05` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ③ Integrated Tall Single DishDrawer Series 11 \| 455mm \| 599mm \| 553mm | p.5, `5b9e4d400785` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ⑦Integrated Built-Under Dishwasher Series 9 \| 820-880mm \| 598mm \| 554mm | p.5, `5b9e4d400785` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ⑤Contemporary Built-Under Dishwasher Series 7 \| 820-880mm \| 597mm \| 574mm | p.4, `3972eaa114da` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ⑦ \| 857 - 917mm \| 597mm \| 574mm | p.4, `3972eaa114da` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ③ Integrated Tall Single DishDrawer™ Series 11 \| 455mm \| 599mm \| 553mm | p.5, `1b0e07d8cc05` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ③Contemporary Double DishDrawer™ Series 7④Contemporary Double DishDrawer™ Series 9 \| 820-880mm \| 599mm \| 573mm | p.4, `3972eaa114da` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ④ \| 820-880mm \| 599mm \| 571mm | p.5, `5b9e4d400785` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ② Integrated Tall Single DishDrawer™ Series 9 \| 455mm \| 599mm \| 553mm | p.5, `1b0e07d8cc05` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ③Contemporary Double DishDrawer™ Series 7④Contemporary Double DishDrawer™ Series 9 \| 820-880mm \| 599mm \| 573mm | p.4, `a91b6f871165` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ⑥Integrated Built-Under Dishwasher Series 7 \| 820-880mm \| 598mm \| 554mm | p.5, `1b0e07d8cc05` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ②Contemporary Tall Single DishDrawer™ Series 9 \| 454mm \| 599mm \| 573mm | p.4, `a91b6f871165` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ⑦ \| 857 - 917mm \| 597mm \| 574mm | p.4, `a91b6f871165` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ① \| 410mm \| 599mm \| 553mm | p.5, `1b0e07d8cc05` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ⑤Contemporary Built-Under Dishwasher Series 7 \| 820-880mm \| 597mm \| 574mm | p.4, `a91b6f871165` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ⑤Integrated Tall Double DishDrawer™ Series 11 \| 865-925mm \| 599mm \| 553mm | p.5, `5b9e4d400785` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ⑥Contemporary Dishwasher Series 7 \| 850-895mm \| 597mm \| 600mm | p.4, `3972eaa114da` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ①Contemporary Single DishDrawer™ Series 7 \| 410mm \| 599mm \| 573mm | p.4, `3972eaa114da` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ⑤Integrated Tall Double DishDrawer™ Series 11 \| 865-925mm \| 599mm \| 553mm | p.5, `1b0e07d8cc05` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ② Integrated Tall Single DishDrawer™ Series 9 \| 455mm \| 599mm \| 553mm | p.5, `5b9e4d400785` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ⑦Integrated Tall Dishwasher Series 9 \| 820-880mm \| 598mm \| 554mm | p.5, `1b0e07d8cc05` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ②Contemporary Tall Single DishDrawer™ Series 9 \| 454mm \| 599mm \| 573mm | p.4, `3972eaa114da` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 10: Product Dimensions mm Overall height* 867 - 925 Overall width of chassis 599 ©Overall depth of chassis 553 Height of chassis 854 Height of feet* 10 - 70 Heig...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 13: Steel - ADDD6ODTPXBlack Stainless Steel - ADDD6ODTPB Panel Dimensions mm Width of panels 596 B Height of top drawer panel 442 © Height of bottom drawer panel...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 14: Panel Dimensions mm Width of panel 595 BHeight of panel 447 ©Handle fixing point from top of panel 72 ①Handle fixing point from side of panel 81.5 ERecessed ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 15: Cavity Dimensions mm Cavity height* 869-927 B Minimum cavity width 600 © Minimum cavity depth** 578
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 16: Cavity Dimensions mm Cavity minimum height 457 B Cavity width 600 © Minimum cavity depth* 578 ① Minimum toe kick height** 100 E Minimum toe kick depth** 60
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 16: Dimensions mm Width between packers 600 B Center of fixing points from top of chassis 640
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 17: Dimensions mm Width between spacers 600 B Chassis center of fixing point from top of cavity 340
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 17: Dimensions mm Toe kick height 45 - 123 B Toe kick width 595 © floor Minimum clearance between toe kick panel and 12 ⑥ Depth of toe kick recess* 40 - 56 *Back...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 18: Dimensions mm Minimum panel width 596 B Minimum panel height 452 © Minimum clearance gap between drawers 2 Maximum lower panel extension 50
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 18: Toe kick Dimensions mm Product height 867 - 925 B Top panel height minimum 442 © Bottom panel height minimum 311 ① Bottom panel maximum extension 50 E Minimu...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 19: Dimensions mm Cavity width 600 B Minimum custom panel width* 596 © Pre-finished panel width 595
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 19: Dimensions mm Height of cavity 869-927 B Minimum panel width 596 © Minimum top panel height 442 D Minimum clearance gap to adjacent cabinetry 2 E Minimum bot...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 20: Cooldrawer Dimensions mm Cooldrawer™ minimum cavity height 665 - 764 B Cooldrawer™ cavity width 864 © Cooldrawer™ minimum panel height min 476 ① Cooldrawer™ ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 21: Panel Dimensions mm ④Minimum panel width 596 B Top drawer panel minimum height 442 ©Bottom drawer panel minimum height 311 ⑥Maximum bottom drawer panel exten...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 22: s 11, Integrated Tall Single DishDrawer™ Dishwasher Product Dimensions mm A Overall height of main body including locating tabs 40 B Height of main body excl...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 23: Cavity Dimensions mm Height of cavity* min 513 BCavity width 600 © Minimum cavity depth** 578 ① Minimum panel height to cover AOA* 509 E Distance from back o...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 24: Service dimensions mm Minimum distance from floor to top of hose support 750 B Minimum distance from floor to end of drain hoses* 500 © Minimum distance from...
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 25
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 25: Panel Dimensions mm Minimum panel width 596 B Minimum panel height 452 © Maximum panel extension at bottomMinimum panel extension to cover assistedopening ac...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 27: Handle Dimensions mm Overall length of handle 565 Overall depth of handle 15 ©Overall height of handle 41 Length of off-stand 100 Distance between attachment...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 28: Dimensions mm Duct cut out width 100 B Duct cut out length 220 © Minimum toe kick height 100 ① Minimum toe kick depth 60
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 28: Handle Dimensions mm Overall length of handle 565 Overall depth of handle 17 ©Overall height of handle 41 Length of off-stand 100 Distance between attachment...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 29: Handle Dimensions mm Overall length of handle 544 Overall depth of handle 22 ©Overall height of handle 55 Length of off-stand 80 Distance between attachment ...
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 30
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 30: Service dimensions mm Minimum distance from floor to top of hose support 750 B Minimum distance from floor to end of drain hoses* 500 © Minimum distance from...
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 32
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 34: Handle Dimensions mm Overall length of handle 565 Overall depth of handle 15 ©Overall height of handle 41 Length of off-stand 100 Distance between attachment...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 35: Handle Dimensions mm Overall length of handle 565 Overall depth of handle 17 ©Overall height of handle 41 Length of off-stand 100 Distance between attachment...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 36: Handle Dimensions mm Overall length of handle 544 Overall depth of handle 22 ©Overall height of handle 55 Length of off-stand 80 Distance between attachment ...
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 37
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 9: 5-OBDD-60SX Contemporary Square Fine Handle, 60cm** Product Dimensions mm A Overall height of chassis 455 B Overall width of chassis 599 G Overall depth of c...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 9: Product Dimensions mm Overall height* 867 - 925 Overall width of chassis 599 ©Overall depth of chassis 553 ◎Height of chassis 854 E Height of feet* 10 - 70 H...

#### DD60D4ZB9

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `DD60D4ZB9`
- PDF SHA-256: `27fe801c2f3380f546e60310f0091551d0e07c3281cd9832f26c1c1aa50bc254`, `f58f4e87c4b980b3d935a041444b868a4932c72ba0e6199bd4734037520ba829`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/9933r9ps9pqtcf8bvwmwtm2w/FP-InstallGuide-en-DD60DA9-DD60DC9-DD60DDF9-DD60DN9-DD60DZ9-DishDrawer-0-431374B-NZ-AU.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwcd04375e/QRG/AU/QRG-AU-82882.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwd8639737/QRG/AU/QRG-AU-82882.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 4: Dimensions mm AChassis height* 820 - 880 BChassis width 599 ©Chassis depth 553 DOverall depth 573 E Cavity minimum height 822 FCavity minimum width 600 GCavi...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 5: Dimensions DD60D4 DD60D2 DD60DDF DD60DC mm mm mm mm A Drawer panel height 398 398 398 393 B Bottom panel height 309 309 312 312 © Drawer panel width 596 596 ...

#### DD60DDFB9

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `DD60DDFB9`
- PDF SHA-256: `6f18ecc77054b8ee2ae8ad16979b9a9ab50cbfaac059c7594bad39fe11a011d5`, `fa88e6763ff90e61f02c2bebefe1332634e4ecfe54ab3e36e53e9bae72190875`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/2h8sw5nrjbtvx5wjnsr5bq36/FP-FirstUse-en-DD60SDFTX9-DD60SDFTB9-DD60DDFX9-DD60DDFB9-DishDrawer-0-433407B-NZ-AU-UK-IE-SG.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/mtbhhz3849kqjjh64j4ftx/FP-EnergyWater-en-DD60SCTX9-DD60DDFX9-DD60DDFB9-DishDrawer-0-591485D-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### DD60DI9

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `DD60DI9`
- PDF SHA-256: `2c65cf579f4d7352f15a3235f3ed6eac95ac99128c4b6109e57650b3c942f7dc`, `69de4d5d037f5d9af810c5b0f0963a718af43d293fe183b7436316eb01226229`, `bb9fdca93e5dc179fea495a28ab47029fc73642718e1a1b492dc7ef04ef527f3`, `d8ae1754b4560f485bd20dc73bb846e46b208439b068d8f027dbf67e63248fe7`, `ebbb68b9e371252c990b72f635b04fa8571b1eddbeba77cae6bb2cb3b472606a`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/7k87w74f2f29fvgw4bg6ht/FP-EnergyWater-en-DD60DI9-IntegratedDoubleDishDrawer-0-431910B-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/8rsrmfnnfc4xxnpb6f59ggk/FP-InstallGuide-en-DD60DI9-DD60DHI9-DoubleDishDrawer-0-592334C-NZ-AU-IE-UK-EU-SG-CN.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/rmc7b6r3gs767j2sf3bbq5rg/FP-FirstUse-en-DD60DI9-DD60STI9-DD60SI9-DD60DHI9-DD60SHTI9-DD60SHI9-IntegratedDishDrawer-0-432901A-NZ-AU-UK-IE-SG.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/tvnpq653sq8tmwqrwx9zw3h8/FP-WashProgramData-en-DD60D2HNX9-DD60D2HNB9-DishDrawer-0-592834C-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/vzxn8zppnstc8p3tsczv3/FP-PlanningGuide-en-DD60DI9-DD60DHI9-DishDrawer-Double-90004521A-AU-NZ-UK-IE-EU-ASIA.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 10: Product Dimensions mm Overall height* 820 - 880 Overall width of chassis 599 ©Overall depth of chassis** 553 Height of chassis 811 E Height of feet* 10 - 70 ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 15: Cavity Dimensions mm Cavity height* 822-882 B Minimum cavity width 600 © Minimum cavity depth** 579
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 16: Dimensions mm Width between packers 600 B Center of fixing points from top of chassis 640
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 17: Dimensions mm Height of cavity 822 - 882 B Minimum panel width 596 © Minimum top panel height 398 D Minimum clearance gap to adjacent cabinetry 2 E Minimum b...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 18: Dimensions mm Toe kick maximum height 118 B Toe kick width 595 © Minimum clearance between toe kick panel and floor 12 D Depth of toe kick recess* 40 - 56 *F...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 19: Toe kick Dimensions mm Product height 820 - 880 B Top panel height minimum 398 © Bottom panel height minimum 311 ① Bottom panel maximum extension 50 E Minimu...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 21: Panel Dimensions mm Minimum panel width 596 B Top drawer panel minimum height 398 © Bottom drawer panel minimum height 311 ⑥Maximum bottom drawer panel exten...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 24: Service dimensions mm Minimum distance from floor to top of hose support 750 B Minimum distance from floor to end of drain hoses* 500 © Minimum distance from...
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 25
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 27: Handle Dimensions mm Overall length of handle 565 Overall depth of handle 15 ©Overall height of handle 41 Length of off-stand 100 Distance between attachment...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 28: Handle Dimensions mm Overall length of handle 565 Overall depth of handle 17 ©Overall height of handle 41 Length of off-stand 100 Distance between attachment...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 29: Handle Dimensions mm Overall length of handle 544 Overall depth of handle 22 ©Overall height of handle 55 Length of off-stand 80 Distance between attachment ...
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 30
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 4: Dimensions mm A Overall height (includes feet) 820 - 880 BChassis width 599 ©Chassis depth* 553 D Cavity height 822 - 882 E Cavity minimum width 600 FCavity ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 5: Custom Panel Dimensions mm ATop panel minimum height 398 BBottom panel minimum height 311 ©Minimum Gap between drawer panels* 8 DMinimum panel width 596 ECus...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 8: Product Dimensions mm Overall height* 820 - 880 Overall width of chassis 599 ©Overall depth of chassis** 553 Height of chassis 811 EHeight of feet* 10 - 70 H...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 9: Product Dimensions mm Overall height* 820 - 880 Overall width of chassis 599 ©Overall depth of chassis** 553 Height of chassis 811 E Height of feet* 10 - 70 ...

#### DD60DTX6I1

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `DD60DTX6I1`
- PDF SHA-256: `aa5233d442a42e6ccc5f4f268c74388cd9d6053a8a654a366f78d4ff76d151a9`, `ec0485c64dfd94e78951a9f0a48223ff81462253c6b014715ffe96524660c835`, `f2846be544d1ffc19a57c6883ccd21b354e91e8c327319832595682bf4c49728`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/6k9656ps6m4m5tjswvxxq5fq/FP-InstallGuide-en-DD60DTX611-DD60DTX6HI1-DoubleDishdrawer-0-592363C-NZ-AU-UK-IE-SG-ASIA.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/bn49gc6kpttp3wzh7x68s8p/FP-EnergyWater-en-DD60DTX6I1-IntegratedDoubleDishDrawer-0-592500A-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/wb7rsh4mvx3stpq9b6z/FP-FirstUse-en-DD60DTX6I1-DD60STX6I1-DD60DTX6HI1-DD60STX6HI1-IntegratedDishDrawer-0-432859A-NZ-AU-UK-IE-SG.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 4: Dimensions mm A Overall height (includes feet) 867 - 925 BChassis width 599 ©Chassis depth* 553 DCavity height 869 - 927 E Cavity minimum width 600 FCavity m...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 5: Custom Panel Dimensions mm ATop panel minimum height 442 BBottom panel minimum height 311 ©Minimum Gap between drawer panels* 8 DMinimum panel width 596 ECus...

#### DD60SCTX9

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `DD60SCTX9`
- PDF SHA-256: `599b25fcbc6b33b791f00883df0886f5d2620cb3f1c52334ba1a20c2bb98548e`, `c06bedefba85dfca26ea5897c844139ea4dea70ab7965c94957c0f487ded5cc3`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/gwj6vb5437fqn3kgp6pzjr2b/FP-DataSheet-DD60SCTX9-SingleDishDrawer-AU-NZ-90001687A.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/xr5x4xwv55364js7vwh73pck/FP-FirstUse-en-DD60SCTX9-DD60SCX9-DD60DCX9-DD60SCTX9-DD60SCX9-DishDrawer-0-433406B-NZ-AU-UK-IE-SG.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 1: Dimensions mm Overall height of DishDrawer™ 454 BOverall width of DishDrawer™ 599 ©Overall depth of DishDrawer 573 Depth of chassis 553 E Depth of front pane...

#### DD60SCX9

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `DD60SCX9`
- PDF SHA-256: `3031e527077f690b5192ea8f522552108186b9bc44ef002064224397111cadb2`, `3c989c121fabcedc2101ca7eeb196d42d76e2019219a566628e5f83286466f71`, `c7d6a6e46cb94eef1295d30b4041bbb9271531658d0a9e453ef2cc3f85f337df`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/mbgjjcxf7cxwbpcsjxqp2f/FP-EnergyWater-en-DD60DAX9-DD60SAX9-DD60SCX9-DishDrawer-0-431911B-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/svj5rn2w44qrt9rn84mwrjg/FP-DataSheet-DD60SCX9-SingleDishDrawer-AU-NZ-90001685A.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/tmv34w2gtfct6r3hs82nnkq7/FP-CareGuide-en-DD60D2NX9-DD60D2NB9-DD60SCTX9-DD60SCX9-DD60DCX9-DD60SCTX9-DD60SCX9-DD60D4NX9-DD60D4NB9-DD60D4ZB9-DD60ST4NX9-DD60ST4NB9-DD60ST4ZB9-DishDrawer-0-433469B-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 1: Dimensions mm Overall height of DishDrawer™ 410 B Overall width of DishDrawer™ 599 ©Overall depth of DishDrawer™ 573 Depth of chassis 553 Depth of front pane...

#### DD60SDFTB9

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `DD60SDFTB9`
- PDF SHA-256: `40d415ddb0edbc891dd836e54aaba60d868ce5df0d8e1e2c6f93b3d807acb28e`, `56fa3bdeca36000178980a57e24df111ae7d92c8246aa330fdbc7713779cea93`, `a1eabc7adffc7b5fbaf047540abd9b691150b65aeeef55f2aa3a774acd10ad70`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/4f8j6j38vkc7wrhbwg9gqr/FP-EnergyWater-en-DD60SDFTX9-DD60SDFTB9-SingleDishDrawer-0-431912B-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/nxvmq5p6bjpbqf737mxw7nz/FP-WashProgramData-en-DD60A-DD60C-DD60D-DD60D9-DD60ST49-DishDrawer-0-592835C-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/q9t9pv3p9s7jss22q8ph9ph/FP-CareGuide-en-DD60DDFX9-DD60DDFB9-DD60DDFHX9-DD60DDFHB9-DD60SDFX9-DD60SDFTX9-DD60SDFTB9-DD60SDFHX9-DD60SDFHTX9-DishDrawer-0-433470A-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### DD60SI9

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `DD60SI9`
- PDF SHA-256: `53169c2371e81973c79785c5c6ac1bea1157da62584f948f81edc85e27c075ac`, `a11e5bfe5467651f7116e3f86ed0f44d9621edd45e64df1a81782f79e93aff50`, `bffcc997b39ccc1b72fc5dfd0a6b4ce56f34ea7964ab0628d7a41fd217817d5f`, `d117d4b14f52e9f880c61995d46ec15ae68a2fe9f9ae349b5c17e9995de90cd6`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/jqs8s55zkj2vt8szf3vxgsj/FP-EnergyWater-en-DD60STI9-DD60SI9-IntegratedSingleDishDrawer-0-431913B-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/msph57nqtbs7tvbcq6xww9r/FP-DataSheet-DD60SI9-IntegratedSingleDishDrawer-AU-NZ-90001576A.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/rwfjb7r6vvrmr2xhgmk3cp3/FP-CareGuide-en-DD60DI9-DD60STI9-DD60SI9-DD60DHI9-DD60SHTI9-DD60SHI9-IntegratedDishDrawer-0-433128A-NZ-AU-UK-IE-SG.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/wkw75k389b39wbfhvpm96qg/FP-SafetyWarnings-en-DD60S-DD60D-DishDrawer-0-432860C-NZ-AU-UK-IE-SG.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 1: Dimensions mm Overall height of DishDrawer™ 410 BOverall width of DishDrawer™ 599 ©Overall depth of DishDrawer™(assuming front panel thickness of 18mm) 571 D...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: Dimensions mm Minimum height of drawer panel* 408 Width of drawer panel 596 - 615 © Depth of front panel 16-20 Minimum height of ventilation gap below front ...

#### DD60ST4ZB9

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `DD60ST4ZB9`
- PDF SHA-256: `24cc9cefd1e2312826b59d3e51ae26f5c37af30e2010b0ea16660cab948cc68e`, `4c6a3e96a150fcbe582f6471db69cb3306e83a3697d07c693a3c543336f454bc`, `d46d274b288be7ea9f991e81cb6a6fa712a29d90ef2eca2db6b4bdbb9be8d123`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/79xxgf3js7vvp9t95gwpm6q/FP-InstallGuide-en-DD60ST4-DD60ST4HNX9-DD60SDFHTX9-DD60SC-DD60SAX9-DishDrawer-0-431375C-NZ-AU-UK-IE-SG.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/gmfkn8q6kg84xm5jwb5ghk/FP-FirstUse-en-DD60D4NX9-DD60D4NB9-DD60D4ZB9-DD60ST4NX9-DD60ST4NB9-DD60ST4ZB9-DishDrawer-0-433502A-NZ-AU-UK-IE-SG.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw2923350e/QRG/AU/QRG-AU-82885.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwf8128091/QRG/AU/QRG-AU-82885.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 4: Chassis Dimensions DD60SCX9,DD60SAX9 DD60SCTX9,DD60ST4 Models DD60SDFHTX9 mm mm mm AChassis height 410 454 478 BChassis width 599 599 599 ©Chassis depth 553 ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 5: Panel Dimensions DD60SCX9,DD60SAX9mm DD60SCTX9 DD60ST4 DD60SDFHTX9 mm Models mm mm ADrawer panel height 394 438 442 470 A Drawer panel depth 20 20 20 20
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 6: Cavity Dimensions DD60SCX9,DD60SAX9 DD60SCTX9,DD60ST4 Models DD60SDFHTX9 mm mm mm ACavity height min 412 min 456 480 BCavity width 600-610 600-610 600-610 ©C...

#### DD60STI9

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `DD60STI9`
- PDF SHA-256: `bd3923d07e476256760d82ad46c9b66c55382a87588016137278d1090b747641`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/s5h3s7pf99s6s7639snhfjst/FP-DataSheet-DD60STI9-IntegratedSingleDishDrawer-AU-NZ-90001575A.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 1: Product Dimensions mm Overall height* of DishDrawer™ 454 Overall width* of DishDrawer™M 599 © Depth of DishDrawer™ chassis* 553 Depth of drawer (open) (measu...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: Dimensions mm Minimum height of drawer panel* 452 Width of drawer panel 596 - 615 © Depth of front panel 16-20 Minimum height of ventilation gap below front ...

#### DD60STX6I1

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `DD60STX6I1`
- PDF SHA-256: `2e5789ac66aaef26c3e05cb88a2dd258a7f62ed59a119318ac2098d9ea53f008`, `360468c8de9e45417099c80968cbf1f58fc2f4af31c5fad7abde7e9f3e2a934f`, `841910de11366bc2ffe478f1f414172535f544cccfcf7ff41c292617ad854acb`, `9e15c9f31b13d6143053f558c7685f76230d260ac4cf328eda98ee6688aa790d`, `f21e7242c0d210e29355275bc95ccaf65673c6c22e627dbc4cfb52f51fa91e9f`, `fb6adedc3157bc37b38f653fcae6ac2787f78a2ce5863c131d55efff50b7c732`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/2n6x5vsbgpxr5h3qt66342c/FP-PlanningGuide-en-DD60SI9-DD60SHI9-DD60STI9-DD60STHI9-DD60STX6I1-DD60STX6HI1-IntegratedSingleDishDrawer-0-90003201A-AU-NZ.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/5h3x6s9pjbjt2srjs57zt797/FP-UserGuide-en-DD60DTX6I1-DD60STX6I1-DD60DTX6HI1-DD60STX6HI1-IntegratedDishDrawer-0-432861-NZ-AU-UK-IE.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/9z75w4w59bjnpbmw2vtbt4/FP-InstallGuide-en-OPEX1-DD60STX611-DD60STX6HI1-IntegratedDishDrawer-AssistedOpeningAccessory-592970B-NZ-AU-SG.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/hwp8vzcf3853brgthwfjvc/FP-InstallGuide-en-DD60STX611-DD60STX6HI1-SingleDishDrawer-0-592364D-NZ-AU-UK-IE-EU-SG-ASIA-CN.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/jskhhqxp6sk9sn4h6qwkn8vv/FP-EnergyWater-en-DD60STX6I1-IntegratedSingleDishDrawer-0-592514A-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/vfcjfr366r9tz5hb6cpc9mg/FP-WashProgramData-en-DD60DTX6I1-DD60STX6I1-DishDrawer-0-592565B-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 10: Product Dimensions mm Overall height of product 454 ⑥ Overall width of product 599 ©Overall depth of product* 553 Height of chassis 454 E Depth of chassis 55...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 11: Product Dimensions mm Overall height of product 454 ⑥Overall width of product 599 © Overall depth of product* 553 Height of chassis 454 E Depth of chassis 55...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 12: Product Dimensions mm Overall height of product 454 BOverall width of product 599 ©Overall depth of product* 553 Height of chassis 454 E Depth of chassis 553...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 14: Product Dimensions mm Overall height of product 454 ⑥ Overall width of product 599 ©Overall depth of product* 553 Height of chassis 454 E Depth of chassis 55...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 15: Product Dimensions mm Overall height of product 454 ⑥ Overall width of product 599 ©Overall depth of product* 553 Height of chassis 454 E Depth of chassis 55...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 16: Product Dimensions mm Overall height of product 454 Overall width of product 599 ©Overall depth of product* 553 Height of chassis 454 E Depth of chassis 553 ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 17: Product Dimensions mm Overall height of product 454 Overall width of product 599 ©Overall depth of product* 553 Height of chassis 454 E Depth of chassis 553 ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 19: Handle Dimensions mm Overall length of handle 565 ⑥Overall depth of handle 41 © Overall height of handle 16 Length of off-stand 100 E Distance between attach...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 20: Handle Dimensions mm Overall length of handle 565 ⑥ Overall depth of handle 41 ©Overall height of handle 15 Length of off-stand 100 EDistance between attachm...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 21: Handle Dimensions mm Overall length of handle 565 ⑥ Overall depth of handle 41 ©Overall height of handle 17 Length of off-stand 100 Distance between attachme...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 22: Handle Dimensions mm Overall length of handle 515 ⑥Overall depth of handle 58 ©Overall height of handle 38 Length of off-stand 60 Distance between attachment...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 23: Handle Dimensions mm Overall length of handle 544 ⑥ Overall depth of handle 55 ©Overall height of handle 22 Length of off-stand 80 Distance between attachmen...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 4: Product and Panel Dimensions mm A Chassis height 455 B Chassis width 599 © Chassis depth 553 D Panel height 508 E Panel minimum width 596 F Panel thickness 1...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 4: Product and Panel Dimensions mm AChassis height 455 B Chassis width 599 © Chassis depth 553 DPanel minimum height 452 E Panel minimum width 596 FPanel thickn...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 5: measured to fit the final Assisted Opening Accessory cavity dimensions.
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 5: Cavity Dimensions mm A Cavity minimum height 457 B Cavity minimum width 600 © Cavity minimum depth* D Minimum cabinet toe kick height** 578 100 E Minimum cab...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 6: Product Dimensions mm Overall height of product 410 ⑥ Overall width of product 599 © Overall depth of product* 553 Height of chassis 410 E Depth of chassis 5...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 6: Dimensions mm AOverall Dishwasher cavity minimum height (includes fixed shelf) 513 BDishwasher chassis cavity minimum height 457 ©Cavity minimum width 600 DC...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 7: Product Dimensions mm Overall height of product 410 ⑥Overall width of product 599 ©Overall depth of product* 553 Height of chassis 410 E Depth of chassis 553...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 9: Product Dimensions mm Overall height of product 454 ⑥Overall width of product 599 © Overall depth of product* 553 Height of chassis 454 E Depth of chassis 55...

#### DW60FC1B2

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `DW60FC1B2`
- PDF SHA-256: `48fb34143a6e3657dc5d78f6d1ad1af2d003c867c1623fb058def8acc50d08f9`, `8a1faf6a729ea38a964c22de1179fe12e6f91395bad297fbef5fe9b01a558823`, `e81f8fd2b1b055a73ca820be277495964cdfbe39a39dc2def56a45a507dbac18`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/gf37mp5s68m8v3j9xgwr864/FP-UserGuide-en-DW60FC1X2-DW60FC1X3-DW60FC1B2-Dishwasher-0-431201C-AU-NZ.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/pcsgn5g5r7ckbwhn6745s7mj/FP-Planningguide-en-DW60FC3B3-DW60FC3X3-DW60FC2B2-DW60FC2X2-DW60FC1B4-DW60FC1B2-DW60FC1X2-DW60FC2X3-DW60FC1X3-0-90006256A-AU-NZ.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/pqjs5g2tvfhf9t84vzj9665r/FP-EnergyWater-en-DW60FC1X2-DW60FC1X3-DW60FC1B2-FreestandingDishwasher-0-431503B-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 10: Product Dimensions mm AOverall height of product (incl. top panel)* 850 - 895 BOverall width of product** 598 COverall depth of product (incl. top panel) 600...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 8: W60FC3X3Series 5 DW60FC2X2 \| DW60FC1B2 \| DW60FC1X2DW60FC2X3 Dimensions H 850 - 895mm* W 598mm D 605mm Weight 54 kg Packaged Weight 62 kg Packaged dimension...

#### DW60FC1X2

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `DW60FC1X2`
- PDF SHA-256: `6790258c07604c46298625a1e22ac91a7b5f58f01aabd6bf343fe3a2b4529d4d`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/86mssh6nm3bsk3cn2z978695/FP-DataSheet-en-DW60FC4X2-DW60FC1X2-DW60FC2X2-Dishwasher-0-90002984A-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 1: Model nos:DW60FC4X2DW60FC1X2DW60FC2X2 Product Dimensions mm Overall height of product* (incl. top panel) 850 - 895 BOverall width of product 597 © Overall de...

#### DW60FC1X3

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `DW60FC1X3`
- PDF SHA-256: `97e86bee93ec1cf430cf85962057c570fd8c5ff71fc37ed02ba04195ae370996`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/jnrjmmh4r4j45pmrpn937n4c/FP-DataSheet-en-DW60FC4X3-DW60FC2X3-DW60FC1X3-Dishwasher-0-90003391B-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 1: Product Dimensions mm Overall height of product* (incl. top panel) 850 - 895 BOverall width of product 597 © Overall depth of product (incl. top panel) 600 ⑥...

#### DW60FC2B2

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `DW60FC2B2`
- PDF SHA-256: `53039280684997819bf7ba2dd1222474b7f19a7f666859d90a6827f2af4ca06a`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/hxrqtgscz9fth5rckhcpth/FP-EnergyWater-en-DW60UN2B2-DW60FC2B2-Dishwasher-0-432356A-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### DW60FC2X3

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `DW60FC2X3`
- PDF SHA-256: `5cc1402861166a2d802d6aa9738fd4dd73b4ce0185b92522d2dc6df5cfb6329f`, `b5a036b18078a267010b61d3071fe91081fa2833384c7605acb86395b2128a3e`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/4k9bh6qpnsgmfsjjt5rgsn87/FP-InstallSheet-en-DW60-DD60-DishdrawerDishwasher-0-433749A-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/qrw9wvc9x493gk25tjr9cnwk/FP-EnergyWater-en-DW60FC2X2-DW60UC2X2-DW60UN2X2-DW60FC2X3-Dishwasher-0-431502B-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### DW60FC4B2

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `DW60FC4B2`
- PDF SHA-256: `b7f6b8bb37df358aaf60211c4db5cb0306e445d7cb6f8237fe9042239683c325`, `d2a7a9c49f7d71f53be56cafeeeb9701fd9d20d450ba4dfe68fd29de883373e4`, `ec7a5bf28b75684045117e71bf8ce618fd6a3454ddc19144fe3a5c16fa06e5db`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/24wphh3zjvbwx7qxf6xbhf6k/FP-DataSheet-en-DW60FC4B2-DW60FC2B2-DW60FC1B2-Dishwasher-0-90003411A-AU-NZ-SG.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/65hxc4356tnk9zx9gb2vswq/FP-EnergyWater-en-DW60FC4X3-DW60U4I2-DW60UT4I2-DW60FC4X2-DW60FC4B2-Dishwasher-0-431353B-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/xmgr3g4rfbjftm76hhshv6/FP-UserGuide-en-DW60FC4X2-DW60UC4X2-DW60UN4X2-DW60FC4X3-DW60FC4B2-DW60UN4B2-Dishwasher-0-431199D-NZ-AU-SG.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 1: Product Dimensions mm Overall height of product* (incl. top panel) 850 - 895 BOverall width of product 597 ©Overall depth of product (incl. top panel) 600 De...

#### DW60U4I2

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `DW60U4I2`
- PDF SHA-256: `1e79e9203b7cd5f5193e98a5c3735eeb9ec5b2f13a0a393644b5d4efba2e5e29`, `9d77096f9dbddc665c438b5e20415ee6785847b49e9f6632b6d4a8577b8ad542`, `bf1d812c8a8b647b43a6122314ffd2ed4962c8e416c34ace514d7ab9bd603189`, `c90503f1ab723ffcfc9b15d22d35226246eaf099891606d935780c59b869ef82`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/2663j9cc47brvvss4ggggx6v/FP-DataSheet-en-DW60U4I2-DW60U4HI2-IntegratedDishwasher-0-90002306B-AU-NZ-UK-IE-CN.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/bk4zhb4vtknf74vvn9stwxcc/FP-DoorTemplate-en-DW60U4I2-IntegratedDishwasher-0-90002329-AU-NZ.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/wcqfvz5pmg7q4g5xwr8g5j7v/FP-UserGuide-en-DW60UNT4X2-DW60UNT4B2-DW60UZT4B2-DW60UT4I2-DW60U4I2-Dishwasher-0-592874B-NZ-AU-SG.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw12e0a78a/QRG/AU/QRG-AU-82436.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 1: Product Dimensions mm Overall height of product* 820 - 880 ⑥Overall width of product** 597 © Overall depth of product (incl. inner door) ** 554 Height of cha...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: Product Dimensions mm Minimum height of custom door panel for full coverage of theinner door 677 ⑥ Minimum door panel width 596 © Door panel depth 16 - 25 Di...

#### DW60UC2X

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `DW60UC2X`
- PDF SHA-256: `2331c85c7ed202e018a0dc6593b9d4f01377a67a28da7b2f46e77e7b9de5ebb8`, `5b17b0f46694764ecea97e1dca3dfb0800ae0d0ec7e05c73b2f88d42fa726e88`, `716fcc2d2996404a0150b8e7ef9490ec963419be1123d3de273ee06cd7cfeda5`, `b4860a689546e8c561d8d9cb8a496da4f174f4f258870576927605c6c0bcba23`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/89r9wkn3g8jb7jw8n9f7f/FP-WashProgramDataASNZS-en-DW60-DishWasher-0-592890A-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/s8b64p3kb4rnhcnrg5fqxwv/FP-UserGuide-en-DW60FC2X2-DW60UC2X2-DW60UN2X2-DW60UN4B2-DW60FC2X3-DW60FC2B2-Dishwasher-0-431200C-AU-NZ.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/x82zwspc659vx3w369xw3w3m/FP-DataSheet-en-DW60UC4X2-DW60UC2X2-Dishwasher-0-90002985A-NZ-AU.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw971e0333/QRG/AU/QRG-AU-82428.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwe73d757b/QRG/AU/QRG-AU-82428.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 1: Model nos:DW60UC4X2DW60UC2X2 Product Dimensions mm Overall height of product* 820 - 880 ⑥Overall width of product 597 ©Overall depth of product 570 Height of...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2

#### DW60UN2X2

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `DW60UN2X2`
- PDF SHA-256: `d0708864ea26f0625bf4d92528c8f0f5a08d6121f71be5305e9335d4409e20be`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/mpfhvf53nntrp2vbxnv4vxg/FPA-PlanningGuide-eng-DW60UM4G4-DW60UD4X4-DW60UD4B4-DW60UN4X4-UN60UN4B4-DW60UN42B2-DW60UN2X2-0-90006026B-AU-NZ.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 10: Model No. DW60UD4X4, DW60UD4B4 Dimensions H 820 - 880mm* W 598mm D 580mm Weight 54 kg Packaged Weight 62 kg Packaged dimensions H 890mm x W 700mm x D 660mm E...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 12: Model No. DW60UN4X4, DW60UN4B4 Dimensions H 820 - 880mm* W 598mm D 580mm Weight 54 kg Packaged Weight 62 kg Packaged dimensions H 890mm × W 700mm × D 660mm E...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 14: Model No. DW60UN2X2, DW60UN2B2 Dimensions H 820 - 880mm* W 598mm D 580mm Weight 54 kg Packaged Weight 62 kg Packaged dimensions H 890mm x W 700mm x D 660mm E...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 16: Product Dimensions mm Overall height of product* 820 - 880 BOverall width of product** 598 COverall depth of product (excl handle) 580 DHeight of chassis 820...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 17: Product Dimensions mm aOverall height of product* 820 - 880 BOverall width of product** 598 COverall depth of product (excl handle) 580 DHeight of chassis 82...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 18: Product Dimensions mm aOverall height of product* 820 - 880 BOverall width of product** 598 COverall depth of product (excl handle) 580 DHeight of chassis 82...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 19: Product Dimensions mm aOverall height of product* 820 - 880 BOverall width of product** 598 COverall depth of product (excl handle) 580 DHeight of chassis 82...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 21: SERVICE DIMENSIONS LEFT SIDE RIGHT SIDE mm A Length of drain hose 1980 1650 B Length of power cord* 950 1450 C Length of inlet hose 1450 1300 D Distance from...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 8: Model No. DW60UM4G4 Dimensions H 820 - 880mm* W 598mm D 580mm Weight 54 kg Packaged Weight 62 kg Packaged dimensions H 890mm × W 700mm × D 660mm Electrical D...

#### DW60UN4X2

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `DW60UN4X2`
- PDF SHA-256: `27bd8a58dd6898386a536ba7a6e5ac3b07291542c1a69b8397c3ded5a59bbdd4`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/wx65r5qrsq3fvjmbggt2hx9/FP-EnergyWater-en-DW60UC4X2-DW60UN4X2-DW60UN4B2-BuiltUnderDishwasher-0-431504A-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### DW60UNT4B2

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `DW60UNT4B2`
- PDF SHA-256: `041da9ad3a826a32544767ac3fa44f3ae697c36091344f6975a61cd5e47b8b68`, `67b9da09ad4504ffa83f027cf1fc2d320dac85f8a7720a210393d21a3757fd93`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/46342q3mj3npj6z6t5m4fh5/FP-PlanningGuide-en-DW60UDT4X2-DW60UZT4B2-DW60UNT4B2-DW60UNT4X2-Dishwasher-0-90006028A-AU-NZ.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/xtwn3c5cw4kjbjgnwx9x74/FP-EnergyWater-en-DW60UNT4X2-DW60UNT4B2-BuiltUnderDishwasher-0-431354A-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 10: Model No. DW60UZT4B2, DW60UNT4B2, DW60UNT4X2 Dimensions H 857-917mm W 598mm D 580mm Weight 54 kg Packaged Weight 62 kg Packaged dimensions H 890 x W 700 × D ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 12: Product Dimensions mm Overall height of product* 857 - 917 Overall width of product** 598 ©Overall depth of product (excl. handle) 580 Height of chassis 857 ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 13: Product Dimensions mm Overall height of product* 857 - 917 BOverall width of product** 598 © Overall depth of product (excl. handle) 580 Height of chassis 85...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 8: Model No. DW60UDT4X4 Dimensions H 857-917mm W 598mm D 580mm Weight 54 kg Packaged Weight 62 kg Packaged dimensions H 890 × W 700 × D 660 Electrical Dedicated...

#### DW60UZT4B2

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `DW60UZT4B2`
- PDF SHA-256: `7741f12200eeca6faea4b5d9d34f9f81144bf61c1743251cffb3771da5d6bbf6`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/8ht5j48mvjr7hkgs68prcv/FP-EnergyWater-en-DW60UZT4B2-BuiltUnderDishwasher-0-431355A-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### PDF grammar pdf_grammar_0643fe3e0b04853a

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `DD60D2NB9`, `DD60D4NX9`, `DD60DDFB9`, `DW60FC1X2`, `DW60FC1X3`, `DW60UNT4B2`
- PDF SHA-256: `19d1fb386eadb09f4a0d1fbc07ea26b9de0f65079b636627b266e90f78e6680a`, `40d17cefe10087be1f573254662fcec2aa9a48648c7cdbb1a174a1ef8dc065db`, `9aca8386a1ea8aa5999d6cc83a308ffcf692ccad7ec77db4bcb495b3406bbd9c`, `b2da4b687254dc5cba3f1c01984e076fb23f1b319f4cb35cf36898323dce794d`, `e017dc444fb715ecdaba0ec1bb2af029bc9edb3075451549f2c4563185899cdc`, `e505935b3ae6731d76a20c4a1ecbacdcc67e6fcbab9ebe0455bc330af68db45a`
- PDF grammar profiles: `pdf_grammar_0643fe3e0b04853a`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw01615582/QRG/AU/QRG-AU-84900.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw072a3815/QRG/AU/QRG-AU-84900.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw336f3817/QRG/AU/QRG-AU-82879.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw383cdb25/QRG/AU/QRG-AU-82438.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw3d89644a/QRG/AU/QRG-AU-82879.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw526c147b/QRG/AU/QRG-AU-82326.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw79740695/QRG/AU/QRG-AU-82326.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw9f17b837/QRG/AU/QRG-AU-82426.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwb228e5e6/QRG/AU/QRG-AU-82426.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwf9542760/QRG/AU/QRG-AU-82880.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwf9fe82ca/QRG/AU/QRG-AU-82438.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, width | `product_closed_candidate` | Depth 573 mm \| Height 820 - 880 mm \| Width 599 mm | p.2, `73834883d6ed` |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, width | `product_closed_candidate` | Depth 600 mm \| Height 850 - 895 mm \| Width 597 mm | p.2, `22f950b3d063` |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, width | `product_closed_candidate` | Depth 600 mm \| Height 850 - 895 mm \| Width 597 mm | p.2, `c91b5c15656b` |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, width | `product_closed_candidate` | Depth 574 mm \| Height 857 - 917 mm \| Width 597 mm | p.2, `adbb55c420e1` |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, width | `product_closed_candidate` | Depth 573 mm \| Height 820 - 880 mm \| Width 599 mm | p.2, `5f093b3c5365` |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, width | `product_closed_candidate` | Depth 573 mm \| Height 820 - 880 mm \| Width 599 mm | p.2, `5f093b3c5365` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

#### PDF grammar pdf_grammar_143969909e10b1e0

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `DW60UN4B2`, `DW60UN4X2`
- PDF SHA-256: `1d7a36222e6978b1835131ac7bba7a0ad684a6f0b43ffeb4885e0ba71a02200b`, `6da2ecc1786e3becae8ee7adab069096b77325cfc29a9d15642a653ab4059fe7`
- PDF grammar profiles: `pdf_grammar_143969909e10b1e0`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw5eea8727/QRG/AU/QRG-AU-82435.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw9fc2fcbb/QRG/AU/QRG-AU-82434.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwbe048c9a/QRG/AU/QRG-AU-82435.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwecd0d542/QRG/AU/QRG-AU-82434.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | width, depth | `product_closed_candidate` | Height 820 - 880 mm \| Width 597 mm \| Depth 574 mm | p.1, `382197161874` |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | width, depth | `product_closed_candidate` | Height 820 - 880 mm \| Width 597 mm \| Depth 574 mm | p.1, `382197161874` |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, width | `product_closed_candidate` | Depth 574 mm \| Height 820 - 880 mm \| Width 597 mm | p.2, `d9ae4786b58c` |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, width | `product_closed_candidate` | Depth 574 mm \| Height 820 - 880 mm \| Width 597 mm | p.2, `d9ae4786b58c` |

#### PDF grammar pdf_grammar_196412b84f22c6ac

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `DW60UZT4B2`
- PDF SHA-256: `d63220dae52e934a1546d71f9241680bd3bd0a92a68ad66d79e05c2a3527d5d0`
- PDF grammar profiles: `pdf_grammar_196412b84f22c6ac`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw567152d4/QRG/AU/QRG-AU-82439.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwd48341a3/QRG/AU/QRG-AU-82439.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, width | `product_closed_candidate` | Depth 574 mm \| Height 857 - 917 mm \| Width 597 mm | p.2, `62ed249ec720` |

#### PDF grammar pdf_grammar_208d4add5f2db08c

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `DW60UT4I2`
- PDF SHA-256: `05bf7d5a88fac296f09cd7fcf7d2e3b4f562ac31e4a6c96895b62bb922ffcc35`
- PDF grammar profiles: `pdf_grammar_208d4add5f2db08c`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw3adf5920/QRG/AU/QRG-AU-82440.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 597 mm | p.3, `1e13b35a0033` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2

#### PDF grammar pdf_grammar_399ad26528b9c24d

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `DW60FC4X3`
- PDF SHA-256: `603cb31a8ceda8f4e2980e3f02df06e64fc9c00910211afc24874f9d637cdc0d`
- PDF grammar profiles: `pdf_grammar_399ad26528b9c24d`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw8b5cbf50/QRG/AU/QRG-AU-84902.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw9d1d11ec/QRG/AU/QRG-AU-84902.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, width | `product_closed_candidate` | Depth 600 mm \| Height 850 - 895 mm \| Width 597 mm | p.3, `abce946681a0` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2

#### PDF grammar pdf_grammar_3a662e6e1bb36067

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `DW60UN2B2`, `DW60UN2X2`
- PDF SHA-256: `089a7cf640e9508f21b1bfe67607dbd73df933d07715ba202979ca539aea8677`, `b317ba65bf5bc4f5cddb583e7687f0a01751240ce79dc7cfbb4b21df55df79b3`
- PDF grammar profiles: `pdf_grammar_3a662e6e1bb36067`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw01c946cf/QRG/AU/QRG-AU-82430.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw098e82ba/QRG/AU/QRG-AU-82429.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw6f1c3873/QRG/AU/QRG-AU-82430.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw924b68ab/QRG/AU/QRG-AU-82429.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 597 mm | p.2, `0b7cdf14867b` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 597 mm | p.2, `0b7cdf14867b` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

#### PDF grammar pdf_grammar_402a90fdb3f4b2e4

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `DD60SI9`
- PDF SHA-256: `8a8882a1f78888598a5e6484dcb76afcc3ab982d344481b744c5cce74994c40a`
- PDF grammar profiles: `pdf_grammar_402a90fdb3f4b2e4`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw9488b99a/QRG/AU/QRG-AU-82321.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwd8cf63cf/QRG/AU/QRG-AU-82321.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 599 mm | p.1, `f6df67902fe9` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height | depth, height | `product_closed_candidate` | Depth 553 mm \| Height 410 mm | p.2, `7fdd90a45f56` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | Height 410 mm | p.1, `fd3571ec3a2e` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 553 mm | p.1, `6026daca3ad6` |

#### PDF grammar pdf_grammar_4b328de20fedfe4f

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `DW60FC4B2`
- PDF SHA-256: `64668ad5dd97c534b34f92a4d2e91f55ef2b5f44b06ec24031d3a9d5acb5588d`
- PDF grammar profiles: `pdf_grammar_4b328de20fedfe4f`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw12cb4842/QRG/AU/QRG-AU-84223.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw1f9b72c3/QRG/AU/QRG-AU-84223.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, width | `product_closed_candidate` | Depth 600 mm \| Height 850 - 895 mm \| Width 597 mm | p.2, `c91985861394` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 600 mm | p.1, `d8f91800802c` |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | none | `product_closed_candidate` | Height 850 - 895 mm | p.1, `7c1fb1d331c3` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 597 mm | p.1, `ccebad224f10` |

#### PDF grammar pdf_grammar_6512ec3fd2ef4307

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `DD60DI9`
- PDF SHA-256: `8e13e6ec6aad8081cc49ed9209a6df531f80b28731209096c02a2192bd6abb9c`
- PDF grammar profiles: `pdf_grammar_6512ec3fd2ef4307`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw64758f22/QRG/AU/QRG-AU-82319.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw883fd184/QRG/AU/QRG-AU-82319.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 599 mm | p.1, `f45e678510bb` |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, width | `product_closed_candidate` | Depth 571 mm \| Height 820 - 880 mm \| Width 599 mm | p.2, `dc287108f56f` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 571 mm | p.1, `fefbc3a21bfd` |

#### PDF grammar pdf_grammar_6b9d0fa7f6dd3378

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `DD60SCTX9`, `DD60SCX9`
- PDF SHA-256: `27211d1c92d89590c2f6f1c91fe82fb43dd7aa802c3397880a59077207867968`, `3e3f819472bf5ef16f1c027e1440772cf4c029787f4affeb2a1d3b5c8d0f9365`
- PDF grammar profiles: `pdf_grammar_6b9d0fa7f6dd3378`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw276d83c8/QRG/AU/QRG-AU-82316.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw6e24f1a7/QRG/AU/QRG-AU-82316.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwc41d1c28/QRG/AU/QRG-AU-82318.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dweb2041ee/QRG/AU/QRG-AU-82318.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 573 mm | p.1, `13e386daf1b6` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 599 mm | p.1, `f45e678510bb` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 599 mm | p.1, `93fc7b7390ad` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 573 mm | p.1, `13e386daf1b6` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2

#### PDF grammar pdf_grammar_8d500b3f80c31fe9

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `DD60SDFTB9`
- PDF SHA-256: `0d12441906d2d8d57f6e90c50064dd91da4815f9322ef335b7fa97138e1afd98`
- PDF grammar profiles: `pdf_grammar_8d500b3f80c31fe9`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw62551c40/QRG/AU/QRG-AU-82327.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw7d126a2f/QRG/AU/QRG-AU-82327.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 573 mm \| Height 478 mm \| Width 599 mm | p.2, `b88eaa01e468` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

#### PDF grammar pdf_grammar_939d2824fd13982a

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `DD60STX6I1`
- PDF SHA-256: `3a4846b1b7c3af22b838132643ec07ecfe4f74ecb98dc852d55dd58bf96cf53b`
- PDF grammar profiles: `pdf_grammar_939d2824fd13982a`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw113a7954/QRG/AU/QRG-AU-82170.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwec374218/QRG/AU/QRG-AU-82170.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 454 mm \| Width 599 mm \| Depth 553 mm | p.1, `de5b0b7aecc7` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2

#### PDF grammar pdf_grammar_947709dbc1550c2b

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `DD60STI9`
- PDF SHA-256: `b8aebfdd1f5682219150d35b5589d13a2fb87c9a06d61768a65f00b68dad98ee`
- PDF grammar profiles: `pdf_grammar_947709dbc1550c2b`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw8072da17/QRG/AU/QRG-AU-82320.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwdf81343e/QRG/AU/QRG-AU-82320.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | Height 454 mm | p.1, `d48cbbe7ab78` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 553 mm | p.1, `256d698aa300` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 599 mm | p.1, `b69f8699c8da` |

#### PDF grammar pdf_grammar_a2263be490bb780a

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `DD60STI9`
- PDF SHA-256: `2c3fc7bc6023a917a0e4439eb51cf97864a435e94212799dbcd6a328b6ecdbba`
- PDF grammar profiles: `pdf_grammar_a2263be490bb780a`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/wnm4b7ps745ngmnt8xjb3pqq/FP-PlanningGuide-en-DD60STI9-DD60SHTI9-DD60SI9-DD60SHI9-SingleDishDrawer-90004507A-AU-NZ-UK-IE-EU-SG-ASIA.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ①Integrated Single DishDrawer™ Tall Series 11 \| 455 \| 599 \| 553 | p.4, `ad316ba538e1` |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ③Integrated Single DishDrawer™ Series 9 \| 410 \| 599 \| 553 | p.4, `ad316ba538e1` |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `product_closed_candidate` | HEIGHT \| WIDTH \| DEPTH \| ②Integrated Single DishDrawer™ Tall Series 9 \| 455 \| 599 \| 553 | p.4, `ad316ba538e1` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 15: Panel Dimensions mm Width of panel 595 BHeight of panel 447 ©Handle fixing point from top of panel 72 ⑥Handle fixing point from side of panel 81.5 ERecessed ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 16: Panel Dimensions mm @Width of panel 595 BHeight of panel 403 © Handle fixing point from top of panel 72 ①Handle fixing point from side of panel 81.5 ERecesse...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 18: Cavity Dimensions mm Cavity minimum height DD60STI9, DD60SHTI9 457 DD60SI9, DD60SHI9 412 B Cavity width 600 © Minimum cavity depth* 578 ① Minimum toe kick he...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 19: Dimensions mm Width between spacers 600 B Chassis center of fixing point from top of cavity DD60STI9, DD60SHTI9 340 DD60SI9, DD60SHI9 295
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 20: Dimensions mm Minimum panel width 596 B Minimum panel height DD60STI9, DD60SHTI9 452 DD60SI9, DD60SHI9 408 © Minimum clearance gap between drawers 2 Maximum ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 21: Dimensions mm Cavity width 600 B Minimum custom panel width* 596 © Pre-finished panel width 595
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 24: Panel Dimensions mm Minimum panel width 596 B Minimum panel height 452 © Maximum panel extension at bottomMinimum panel extension to cover assistedopening ac...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 25: Panel Dimensions mm Minimum panel width 596 B Minimum panel height 408 © Maximum panel extension at bottomMinimum panel extension to cover assistedopening ac...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 28: Dimensions mm Duct cut out width 100 B Duct cut out length 220 © Minimum toe kick height 100 ① Minimum toe kick depth 60
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 30: Service dimensions mm Minimum distance from floor to top of hose support 750 B Minimum distance from floor to end of drain hoses* 500 © Minimum distance from...
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 32
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 34: Handle Dimensions mm Overall length of handle 565 Overall depth of handle 15 ©Overall height of handle 41 Length of off-stand 100 Distance between attachment...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 35: Handle Dimensions mm Overall length of handle 565 Overall depth of handle 17 ©Overall height of handle 41 Length of off-stand 100 Distance between attachment...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 36: Handle Dimensions mm Overall length of handle 544 Overall depth of handle 22 ©Overall height of handle 55 Length of off-stand 80 Distance between attachment ...
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 37

#### PDF grammar pdf_grammar_bef725562accd4ce

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `DW60FC2X3`
- PDF SHA-256: `f2657ad1af9e0c350480fc4ba6a0f48ccff6b2d450d7769a5b56062533360f76`
- PDF grammar profiles: `pdf_grammar_bef725562accd4ce`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw32448b41/QRG/AU/QRG-AU-84901.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwfe7619c8/QRG/AU/QRG-AU-84901.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 597 mm | p.2, `edcbfe600aa6` |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height | depth | `product_closed_candidate` | Depth 600 mm \| Height 850 - 895 mm | p.2, `4160cb54ddde` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

#### PDF grammar pdf_grammar_d93964e654f6feec

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `DD60DTX6I1`
- PDF SHA-256: `7ea89a2521b3cb642d8eb391dedb5f54d5cce2d87d342bd5ca0966f50b66237b`
- PDF grammar profiles: `pdf_grammar_d93964e654f6feec`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwd3125a0b/QRG/AU/QRG-AU-82168.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwf3509547/QRG/AU/QRG-AU-82168.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> depth | depth | `product_closed_candidate` | Height 865 - 925 mm \| Depth 553 mm | p.1, `ae18b68265fe` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2

#### PDF grammar pdf_grammar_ea173f5f11b0c9a0

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `DW60FC1B2`, `DW60FC2B2`
- PDF SHA-256: `0d350d694cbba67f0aa3acacb80f45e2ac62d3e11cc2a98fbaebe7bc24496cb5`, `244b390f5855ad70bf0f78a0825461abef1089ef6191cadf243021c76f6a2610`
- PDF grammar profiles: `pdf_grammar_ea173f5f11b0c9a0`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw101cc9ac/QRG/AU/QRG-AU-84221.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw2493289d/QRG/AU/QRG-AU-84221.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw943aff8c/QRG/AU/QRG-AU-84222.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwca518196/QRG/AU/QRG-AU-84222.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 600 mm | p.1, `fe4fc0572a92` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 597 mm | p.1, `7386db3a6a05` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 600 mm | p.1, `fe4fc0572a92` |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | none | `product_closed_candidate` | Height 850 - 895 mm | p.1, `a60e4e40e820` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 597 mm | p.1, `7386db3a6a05` |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | none | `product_closed_candidate` | Height 850 - 895 mm | p.1, `c1dae38d9e86` |

### FOTILE

- Raw brand variants: `FOTILE`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Franke

- Raw brand variants: `Franke`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### FUJIYAMA

- Raw brand variants: `FUJIYAMA`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Fulgor

- Raw brand variants: `Fulgor`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### FURON

- Raw brand variants: `FURON`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### GAGGENAU

- Raw brand variants: `GAGGENAU`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Glen Dimplex

- Raw brand variants: `Glen Dimplex`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Hafele

- Raw brand variants: `Hafele`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Haier

- Raw brand variants: `Haier`
- Inventory models: 43
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 6
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 5

#### PDF grammar pdf_grammar_4b328de20fedfe4f

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `HDW15F2B1`, `HDW15F3S1`
- PDF SHA-256: `8327f5e18360b8103005c7b062d2ede456931df19e2c881431aa2dfefb7caecb`, `8c230fe497ca443859a8bb1b01521ce661b71923589ed4a1540e208b05766e02`
- PDF grammar profiles: `pdf_grammar_4b328de20fedfe4f`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.haier.com.au/on/demandware.static/-/Sites-haier-master-catalog/default/dw7db79904/QRG/AU/QRG-AU-61616.pdf>, <https://www.haier.com.au/on/demandware.static/-/Sites-haier-master-catalog/default/dwbb887907/QRG/AU/QRG-AU-61614.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_DOCUMENT_EXACT_MODEL` | depth -> height -> width | depth, width | `product_closed_candidate` | Depth 599 mm \| Height 850 - 895 mm \| Width 597 mm | p.2, `340b16bab2da` |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | none | `product_closed_candidate` | Height 850 - 895 mm | p.1, `f072418077af` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 597 mm | p.1, `01c696292aa1` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 597 mm | p.1, `65038f5293b4` |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | none | `product_closed_candidate` | Height 850 - 895 mm | p.1, `5aa5227718fd` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 599 mm | p.1, `1866241b16e6` |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, width | `product_closed_candidate` | Depth 599 mm \| Height 850 - 895 mm \| Width 597 mm | p.2, `3e58424b783a` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 599 mm | p.1, `895f97d1682d` |

#### PDF grammar pdf_grammar_5bd74ef0183ec7fc

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `HDW15F1B1`
- PDF SHA-256: `b3b49a4bcb56a5c30f4e958f0f88185aa3810cdbc6365eab9a0aaddff80fe557`
- PDF grammar profiles: `pdf_grammar_5bd74ef0183ec7fc`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.haier.com.au/on/demandware.static/-/Sites-haier-master-catalog/default/dw154d412d/QRG/AU/QRG-AU-61659.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | none | `product_closed_candidate` | Height 850 - 895 mm | p.1, `269ef38f0808` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 599 mm | p.2, `9ed45ddadf70` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 597 mm | p.1, `b4ffd2e25098` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 599 mm | p.1, `e52b79ac6913` |

#### PDF grammar pdf_grammar_af416262d9bd48b9

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `HDW15U2I1`
- PDF SHA-256: `a979ba676c8b6fb4c2ff23145600d452bb29e3882896721272b2a22a53010463`
- PDF grammar profiles: `pdf_grammar_af416262d9bd48b9`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.haier.com.au/on/demandware.static/-/Sites-haier-master-catalog/default/dwa742cfeb/QRG/AU/QRG-AU-61615.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | none | `product_closed_candidate` | Height 820 - 880 mm | p.1, `03bd955d4047` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 597 mm | p.1, `65038f5293b4` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 554 mm | p.1, `5308c679d5df` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_DOCUMENT_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 597 mm | p.2, `4c1c60cff992` |

#### PDF grammar pdf_grammar_b8fc98139a3cc065

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `HDW15V2B2`
- PDF SHA-256: `6febf17d417e8a001c6d6755556eef32dc232c4420b595a7169bf691961dff54`
- PDF grammar profiles: `pdf_grammar_b8fc98139a3cc065`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.haier.com.au/on/demandware.static/-/Sites-haier-master-catalog/default/dw8aa1b475/QRG/AU/QRG-AU-61611.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 598 mm | p.2, `511d0f2b0311` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 598 mm | p.1, `1349623d9c68` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | width -> depth | width, depth | `product_closed_candidate` | Width 598 mm \| Depth 598 mm | p.1, `c31cab804f66` |

#### PDF grammar pdf_grammar_ea173f5f11b0c9a0

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `HDW15F4B1`
- PDF SHA-256: `658a7534c9bc1e033d5e635fc36185deb41bca28ac6ede41e31064c882bab6c5`
- PDF grammar profiles: `pdf_grammar_ea173f5f11b0c9a0`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.haier.com.au/on/demandware.static/-/Sites-haier-master-catalog/default/dw76609ae6/QRG/AU/QRG-AU-61668.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 599 mm | p.1, `6445076d3484` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 597 mm | p.1, `4cc40dd67c72` |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | none | `product_closed_candidate` | Height 850 - 895 mm | p.1, `2a887c8aeded` |

### HELLER

- Raw brand variants: `HELLER`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Hisense

- Raw brand variants: `Hisense`
- Inventory models: 12
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 2
- Proven marketing series: 1; total series count: `PROVEN_MINIMUM_ONLY`
- PDF grammar profiles: 2

#### Series 5

- Group type: `marketing_series`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `HSBE15FS`
- PDF SHA-256: `d013680dacc44d0774f178bb5d1d99b0ed5ffcc280f110e3024edad0df709360`
- PDF grammar profiles: `pdf_grammar_a7d008deaf855262`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HSBE15FS-SPEC.pdf?context=bWFzdGVyfG1hbnVhbHwxMTkyNzN8YXBwbGljYXRpb24vcGRmfGFETXpMMmhqT1M4NE9ESTJORGN4TlRjNU5qYzRMMGhUUWtVeE5VWlRMVk5RUlVNdWNHUm18YjdhMTdkYTgxYzZkZjhmYTBhZGMyNzEyM2ZiOWQwZmViYjZlMzlkMGEwOTc0OTgxN2U3MWFlZDcxYmYzYmE3Yw>
- Series evidence: page 1, `Model Model Number HSBE15FS Series 5 Category Freestanding Dishwasher Color/Apparence Silver Steel Warranty Period 3 years Model Year 202...`

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_DOCUMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Dimensions (Net) (W X H X D) 600x845x596 (mm) | p.2, `cad7a4f39409` |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_DOCUMENT_EXACT_MODEL` | width -> height -> depth | none | `delivery_package` | Dimensions (Packaged) (W X H X D) 680x890x656 (mm) | p.2, `cad7a4f39409` |

#### PDF grammar pdf_grammar_b09cce2dc429d020

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `HSCM15FS`
- PDF SHA-256: `b6cc7df066501a8db6fbd6b6b6164532b7a7793e6ab9aa9fc5e00ba18173bdd4`
- PDF grammar profiles: `pdf_grammar_b09cce2dc429d020`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HSCM15FS-Spec.pdf?context=bWFzdGVyfE1hbnVhbHwyMjA2NzV8YXBwbGljYXRpb24vcGRmfGFESTJMMmd6T1M4NE9EQTFOVFl6T1RVM01qYzRMMGhUUTAweE5VWlRMVk53WldNdWNHUm18NGRjYzgwZjhkMDdhN2M2ZWM4ZmY0YzE5MGI4YzIyMmYxYmUzYzBkNjdmNTY3MzAyNWYzMzBkNjhkYzRlNDg3NQ>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_DOCUMENT_EXACT_MODEL` | width -> height -> depth | none | `delivery_package` | Packaging dimension (WxHxD) mm 645 × 890 × 645 | p.3, `f93ec7b15897` |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Net dimension (WxHxD) mm 598 × 845 × 600 | p.1, `e0b9c600805d` |

### Home Appliances

- Raw brand variants: `Home Appliances`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Ikea

- Raw brand variants: `Ikea`
- Inventory models: 7
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Ilve

- Raw brand variants: `Ilve`
- Inventory models: 27
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Inalto

- Raw brand variants: `Inalto`
- Inventory models: 16
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### KLEENMAID

- Raw brand variants: `KLEENMAID`
- Inventory models: 8
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Kogan

- Raw brand variants: `Kogan`
- Inventory models: 46
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### LG

- Raw brand variants: `LG`
- Inventory models: 30
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 3
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 2

#### Document family 425da1b10d07

- Group type: `document_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `XD3`, `XD3A15BS`
- PDF SHA-256: `425da1b10d0740f4dfb06456ae886f5a68ed553e1f0b4ddf269ee07f975de7c6`
- PDF grammar profiles: `pdf_grammar_78cc564e6ec06ecf`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=irYywwLMKQrdaYb9RwmJA>, <https://gscs-b2c.lge.com/open/downloadFile?fileId=jgKGpTUBKxpnjNpGPXQzUA>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Dimension(Width X Height X Depth) 600 mm X 850 mm X 600 mm | p.12, `9c08c824995e` |

#### PDF grammar pdf_grammar_78cc564e6ec06ecf

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `XD3A25UMB`
- PDF SHA-256: `118d88ef1194512f83bbf1f8277cca64905d0554c4a9a5bf479bb368cd98c153`
- PDF grammar profiles: `pdf_grammar_78cc564e6ec06ecf`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=emu7beepFnNfwAFPbsIIvw>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Dimension(Width X Height X Depth) 600 mm X 815 mm X 567 mm | p.12, `66a9b20ed281` |

#### PDF grammar pdf_grammar_797b3d5d58b7347f

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `XD2A25MB`
- PDF SHA-256: `cde14b717d6353dca7585bc4d02665b033157dee55e3a709175fb06806bfb8b0`
- PDF grammar profiles: `pdf_grammar_797b3d5d58b7347f`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=XFUDD7WCYvPmtwnCUJg7w>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_SCOPE_REQUIRED` | `GROUPED_AXIS_SEQUENCE` | `DOCUMENT_IDENTITY_ONLY` | width -> height -> depth | none | `product_closed_candidate` | Dimension(Width X Height X Depth) 600 mm X 850 mm X 600 mm | p.12, `986a1b1f591b` |

### majestic

- Raw brand variants: `majestic`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Master Kitchen

- Raw brand variants: `Master Kitchen`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Midea

- Raw brand variants: `Midea`
- Inventory models: 40
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 1
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 1

#### PDF grammar pdf_grammar_2d2f29886119f490

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `MDW6099B15BDX`
- PDF SHA-256: `bc38415a01186d4b2995fd714b9c08e7648c825eb7e6d5322f06f2a9829ea660`
- PDF grammar profiles: `pdf_grammar_2d2f29886119f490`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.midea.com/content/dam/midea-aem/au/au-new/pdp/kitchen%20appliances/dishwashers/mdw6099b15bdx/MDW6099B15BDX-60cm-15-Place-Dishwasher-Easy-Lift-Spec-Sheet.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_PAGE_EXACT_MODEL` | width -> depth -> height | none | `delivery_package` | Carton Dimensions W x D x H 645 × 645 × 890mm | p.2, `cbfbd1d57ea5` |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_PAGE_EXACT_MODEL` | width -> depth -> height | width, depth, height | `product_closed_candidate` | Product Dimensions W x D x H 598 × 570 × 815mm | p.2, `cbfbd1d57ea5` |

### Miele

- Raw brand variants: `Miele`
- Inventory models: 81
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Milano

- Raw brand variants: `Milano`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Mistral

- Raw brand variants: `Mistral`
- Inventory models: 24
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Mykin

- Raw brand variants: `Mykin`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### NEFF

- Raw brand variants: `NEFF`
- Inventory models: 8
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Norj

- Raw brand variants: `Norj`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Omega

- Raw brand variants: `Omega`
- Inventory models: 59
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### ONIX

- Raw brand variants: `ONIX`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Panasonic

- Raw brand variants: `Panasonic`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### PARMCO

- Raw brand variants: `PARMCO`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Platinum

- Raw brand variants: `Platinum`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### POLO

- Raw brand variants: `POLO`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### ROBAM

- Raw brand variants: `ROBAM`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Robinhood

- Raw brand variants: `Robinhood`
- Inventory models: 12
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Samsung

- Raw brand variants: `Samsung`
- Inventory models: 10
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SAMSUNG ELECTRONICS

- Raw brand variants: `SAMSUNG ELECTRONICS`
- Inventory models: 13
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SEIKI

- Raw brand variants: `SEIKI`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SHARP

- Raw brand variants: `SHARP`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SIEMENS

- Raw brand variants: `SIEMENS`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Smeg

- Raw brand variants: `Smeg`
- Inventory models: 124
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 1
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

#### DWAU615DB3

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `DWAU615DB3`
- PDF SHA-256: `25b2864064cb0c75a3edbb901b83b07132c6fa2b18389e3e20fe92097bff7c43`
- Official/source URLs: <https://sys.smeg.com.au/Product/Techspecs/DWAU615DB3.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

### Solt

- Raw brand variants: `Solt`
- Inventory models: 16
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Stirling

- Raw brand variants: `Stirling`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Technika

- Raw brand variants: `Technika`
- Inventory models: 12
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### TECO

- Raw brand variants: `TECO`
- Inventory models: 11
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Teka

- Raw brand variants: `Teka`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Tisira

- Raw brand variants: `Tisira`
- Inventory models: 7
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Toshiba

- Raw brand variants: `Toshiba`
- Inventory models: 9
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### TRIESTE

- Raw brand variants: `TRIESTE`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Tuscany

- Raw brand variants: `Tuscany`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### V-ZUG

- Raw brand variants: `V-ZUG`
- Inventory models: 23
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Veneto

- Raw brand variants: `Veneto`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Venini

- Raw brand variants: `Venini`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### VOGUE

- Raw brand variants: `VOGUE`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Westinghouse

- Raw brand variants: `Westinghouse`
- Inventory models: 43
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 2
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 1

#### WSF6604XB

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `WSF6604XB`
- PDF SHA-256: `70124dade32350086dd2f556371322384974494cfc7255b213c97e78ad2df1f5`
- Official/source URLs: <https://commercial.appliancesonline.com.au/manuals/ak/3/0/6/6/3066951a7ccf5fafcdc3e0eeb91d98ade3945e25_WSF6604WB_Westinghouse_User_Manual.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 9

#### PDF grammar pdf_grammar_ff97975981e54ff6

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `WSF6606XB`
- PDF SHA-256: `c3f814fbe48d311b7004c0144556cd712d4f1c8b8c4eed8f20a5c41416c9573c`
- PDF grammar profiles: `pdf_grammar_ff97975981e54ff6`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://commercial.appliancesonline.com.au/public/manuals/WSF6606X-Westinghouse-Specifications-Sheet.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_SCOPE_REQUIRED` | `INDIVIDUALLY_LABELLED_AXES` | `DOCUMENT_IDENTITY_ONLY` | height -> width -> depth | none | `product_closed_candidate` | Total height (mm) 850 \| Total width (mm) 598 \| Total depth (mm) 598 | p.3, `10978410cb33` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 4
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 5: Shipping Volume (m3) 0.3822 Shipping Weight (Kg) 49 Pack Dimensions Height (mm) 895 Pack Dimension Width (mm) 645 Pack Dimension Depth (mm) 662

### WHIRLPOOL

- Raw brand variants: `WHIRLPOOL`, `Whirlpool`
- Inventory models: 32
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### zzz

- Raw brand variants: `zzz`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

## Washing Machines

Inventory: 1497 models across 83 category-brand groups.

### 3J

- Raw brand variants: `3J`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### AEG

- Raw brand variants: `AEG`
- Inventory models: 25
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### AKAI

- Raw brand variants: `AKAI`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Altus

- Raw brand variants: `Altus`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Anko

- Raw brand variants: `Anko`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### ARISTON

- Raw brand variants: `ARISTON`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Artusi

- Raw brand variants: `Artusi`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### ASKO

- Raw brand variants: `ASKO`
- Inventory models: 24
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### AWARD

- Raw brand variants: `AWARD`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### BEKO

- Raw brand variants: `BEKO`, `Beko`
- Inventory models: 41
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### BL

- Raw brand variants: `BL`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### BOSCH

- Raw brand variants: `BOSCH`, `Bosch`
- Inventory models: 61
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 3
- Proven marketing series: 3; total series count: `PROVEN_MINIMUM_ONLY`
- PDF grammar profiles: 1

#### Series 4

- Group type: `marketing_series`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `WAN28227AU`
- PDF SHA-256: `3b05c53d73812d2432a3f7b667a775300b37297f6c410f0d3c7d4b172c8596d7`
- PDF grammar profiles: `pdf_grammar_b3ae11d01d73fd76`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://media3.bosch-home.com/Documents/specsheet/en-AU/WAN28227AU.pdf>
- Series evidence: page 1, `Series 4, washing machine, front loader, 9 kg, 1400 rpm WAN28227AU`; page 2, `Series 4, washing machine, front loader, 9 kg, 1400 rpm WAN28227AU`; page 3, `Series 4, washing machine, front loader, 9 kg, 1400 rpm WAN28227AU`

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_UNLABELLED_AXIS_ORDER` | `UNLABELLED_DIMENSION_TRIPLE` | `SAME_PAGE_EXACT_MODEL` | n/a | none | `product_closed_candidate` | Dimensions of the product: .845x598x590 mm | p.1, `a58bd7dba3e4` |
| `SUPPORTED_PARTIAL_REJECT_QUALIFIED_DEPTH_VARIANT` | `GROUPED_AXIS_SEQUENCE_WITH_VARIANT` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width | `product_closed_candidate` | Dimensions (H x W x D) 84.5 cm x 59.8 cm x 59.0 cm | p.2, `9fbd37a0e298` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 3: Measurements in mm

#### Series 6

- Group type: `marketing_series`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `WGG254Z1AU`
- PDF SHA-256: `da79e62cf90971677c018bbad35c47588a3c42b87c92c9bc9d9e96b08d1fb450`
- PDF grammar profiles: `pdf_grammar_b3ae11d01d73fd76`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://media3.bosch-home.com/Documents/specsheet/en-AU/WGG254Z1AU.pdf>
- Series evidence: page 1, `Series 6, washing machine, front loader, 10 kg, 1400 rpm WGG254Z1AU`; page 2, `Series 6, washing machine, front loader, 10 kg, 1400 rpm WGG254Z1AU`; page 3, `Series 6, washing machine, front loader, 10 kg, 1400 rpm WGG254Z1AU`

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_PARTIAL_REJECT_QUALIFIED_DEPTH_VARIANT` | `GROUPED_AXIS_SEQUENCE_WITH_VARIANT` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width | `product_closed_candidate` | Dimensions (H x W x D) 84.5 cm x 59.8 cm x 59.0 cm | p.2, `59ff501b0631` |
| `RESEARCH_UNLABELLED_AXIS_ORDER` | `UNLABELLED_DIMENSION_TRIPLE` | `SAME_PAGE_EXACT_MODEL` | n/a | none | `product_closed_candidate` | Dimensions of the product: .845x598x590 mm | p.1, `590fd18870b2` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 3: Measurements in mm

#### Series 8

- Group type: `marketing_series`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `WGG24402AU`
- PDF SHA-256: `7da89e80cb17fda5af7337a7f331d13a48a9dbd9326d0ef633b5d9a71ef3ef4d`
- PDF grammar profiles: `pdf_grammar_b3ae11d01d73fd76`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://media3.bosch-home.com/Documents/specsheet/en-AU/WGG24402AU.pdf>
- Series evidence: page 1, `Series 8, washing machine, front loader, 9 kg, 1400 rpm WGG24402AU`; page 2, `Series 8, washing machine, front loader, 9 kg, 1400 rpm WGG24402AU`; page 3, `Series 8, washing machine, front loader, 9 kg, 1400 rpm WGG24402AU`

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_UNLABELLED_AXIS_ORDER` | `UNLABELLED_DIMENSION_TRIPLE` | `SAME_PAGE_EXACT_MODEL` | n/a | none | `product_closed_candidate` | Dimensions of the product: .848x598x590 mm | p.1, `b1981e93605d` |
| `SUPPORTED_PARTIAL_REJECT_QUALIFIED_DEPTH_VARIANT` | `GROUPED_AXIS_SEQUENCE_WITH_VARIANT` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width | `product_closed_candidate` | Dimensions (H x W x D) 84.8 cm x 59.8 cm x 59.0 cm | p.2, `e9d2e5f0f6b8` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 3: Measurements in mm

### CAMEC

- Raw brand variants: `CAMEC`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### carson

- Raw brand variants: `carson`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### CHIQ

- Raw brand variants: `CHIQ`
- Inventory models: 41
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Devanti

- Raw brand variants: `Devanti`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Duos

- Raw brand variants: `Duos`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Electrolux

- Raw brand variants: `Electrolux`
- Inventory models: 59
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 1
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 1

#### PDF grammar pdf_grammar_8f60826f847a01df

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `EWF1043R7WC`
- PDF SHA-256: `2ac969549bd7c5e18b6d65d72c95566b044a459ad371318299b1655db17f0fdf`
- PDF grammar profiles: `pdf_grammar_8f60826f847a01df`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://commercial.appliancesonline.com.au/manuals/ak/f/f/3/e/ff3e125e7880481b455a8cd38a4a4073efdb7892_Electrolux_EWF1043R7WC_Factsheet.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 850 \| Total width (mm) 600 \| Total depth (mm) 659 | p.4, `9c008fa881e8` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 6: Shipping Weight (Kg) 78 Pack Dimensions Height (mm) 870 Pack Dimension Width (mm) 635 Pack Dimension Depth (mm) 698

### Esatto

- Raw brand variants: `Esatto`
- Inventory models: 50
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### EURO

- Raw brand variants: `EURO`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Euroclean

- Raw brand variants: `Euroclean`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Euromaid

- Raw brand variants: `Euromaid`
- Inventory models: 15
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Eurotech

- Raw brand variants: `Eurotech`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Everdure

- Raw brand variants: `Everdure`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### EVOKE

- Raw brand variants: `EVOKE`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Finch Australia

- Raw brand variants: `Finch Australia`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Fisher & Paykel

- Raw brand variants: `Fisher & Paykel`
- Inventory models: 98
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 70
- Proven marketing series: 1; total series count: `PROVEN_MINIMUM_ONLY`
- PDF grammar profiles: 19

#### Series 7

- Group type: `marketing_series`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `WH1260RG5`
- PDF SHA-256: `848d799c19412cb980199e1c52d97b18e4c212d622174ed4e7059afa37d544b6`
- PDF grammar profiles: `pdf_grammar_f977275dc082e98b`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/rh65pgjg6tnt6vf9mbpr3rpx/FP-PlanningGuide-en-WH1260R5-WH1260RG5-DH1060R5-DH1060RG5-FC1260H-FabricCare-0-90005542C-AU-NZ.pdf>
- Series evidence: page 1, `Series 7 Front Loader Washer \| WH1260R5 \| WH1260RG5`

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_DOCUMENT_EXACT_MODEL` | height | height | `product_closed_candidate` | Overall height 201 | p.16, `1060ea020bb2` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_DOCUMENT_EXACT_MODEL` | depth | none | `operation_envelope` | Depth with the door open*** 1167 | p.13, `b3c764991453` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_DOCUMENT_EXACT_MODEL` | width -> depth | width, depth | `product_closed_candidate` | Overall width including chassis form 602 \| Overall depth 682 | p.13, `b3c764991453` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_DOCUMENT_EXACT_MODEL` | height | height | `product_closed_candidate` | Overall height 104 | p.15, `e7222554d883` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 10: inet, White FC1260HG2 Fabric Care Cabinet, Graphite Product Dimensions H 1900mm W 6 00mm D 660mm Electrical Supply 220-240 V, 50 Hz Service 10 A Connection 3...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 12: Product Dimensions mm Overall height 850 BOverall width including chassis formOverall width excluding chassis form 602 595 ©Overall width front panel 592 DOv...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 14: Product Dimensions mm AOverall height 1900 BOverall width 600 ©Overall depth 663 DDepth with the door open 1240 EDoor clearance to adjacent wall min 235 FDoo...
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 18
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 19
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 20
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 22: Product Dimensions mm Maximum standpipe or tub heightwith storage plinth* 1000 1200 BMinimum standpipe or tub heightwith storage plinth* 600800 ©Maximum dist...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 23: Product Dimensions mm Maximum standpipe or tub heightwith storage plinth 10001200 BMinimum standpipe or tub heightwith storage plinth 600 800 ©Maximum distan...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 24: Product Dimensions mm A Maximum standpipe or tub height with storage plinth* 1000 1200 B Minimum standpipe or tub height 600 © with storage plinth* 800 Maxim...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 25: Product Dimensions mm AMaximum standpipe or tub heightwith storage plinth 1000 1200 BMinimum standpipe or tub heightwith storage plinth 600 800 ©Maximum dist...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 26: Product Dimensions mm Maximum standpipe or tub heightwith storage plinth 1000 1200 BMinimum standpipe or tub heightwith storage plinth 600800 ©Maximum distan...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 27: Product Dimensions mm Maximum power cord length from power outlet 1400 BMaximum power cord length from power outlet 1400 ©Maximum power cord length from powe...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 28: Product Dimensions mm A Maximum standpipe or tub height with storage plinth* 1000 1200 B Minimum standpipe or tub height 600 © with storage plinth* 800 Maxim...
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 29
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 8
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 9: yer, White DH1060RG5 10kg Heat Pump Dryer, Graphite Product Dimensions H 850mm W 60 2mm D 682mm Electrical Supply 220-240 V, 50 Hz Service 10 A Connection 3-...

#### WD8560F1

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `WD8560F1`
- PDF SHA-256: `34b7bab8a0fb3bbc39def76d7d788c7443266761b55f99bbec6d705b92721253`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/5wr6sg9qbcx47fcwcw4bhn3r/FP-EnergyWater-en-WD8560F1-CombiFrontLoaderWasherDryer-0-431560A-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### WH1060DG5

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `WH1060DG5`
- PDF SHA-256: `c82ad18f6dc8c63740bf950caffbf3fcd8eeb3476382fcbd0d6792c44b5ad7f8`, `cc97e28c9e2614cfd5190a0b913111bc19609cc8023d73e37b39473f2057d23a`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/rw6gb8ckv9bv96gsmz878vg/FP-UserGuide-en-WH9060D5-WH9060DG5-WH1060D5-WH1260D5-WH1060DG5-WH1260DG5-Washer-0-433286A-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/xq2j8svq7288rw39mxkhfk/FP-EnergyWater-en-WH1060D5-WH1060DG5-FrontLoaderWasher-0-433574A-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### WH1060P5

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `WH1060P5`
- PDF SHA-256: `4c1c140806b4f11f9c6a9d2cc3b83d11f9ecb74c417481076b1f7a8551a61fb0`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/p837sxsjkh3n9rhfkxqs9kn/FP-EnergyWater-en-WH1060P5-WH1060PG5-FrontLoaderWasher-0-433575A-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### WH1060SG1

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `WH1060SG1`
- PDF SHA-256: `6a20fb3149e07758d5c125382dc60b3e933f78378a616fefdb38c276cd0be05e`, `bd997261fd42b45a5c38573e746d7e658b71510861af83920390b412abec8297`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/ksvfg8w5675xj5wtxzsht/FP-UserGuide-en-WH1060S-WH1160S-FrontLoaderWashingMachine-0-430237E-NZ-AU-SG.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/rmjx235wfbqcnn3tfntk44s/FP-EnergyWater-en-WH1060SG1-FrontLoaderWashingMachine-0-430347A-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### WH1160F2

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `WH1160F2`
- PDF SHA-256: `15e4612db7621617a2abcee039c9f2203d74e2bb6e275010b67608ae95167892`, `44d5e1b0d401d4776dde991f38c04b7fcf9ecb2ae73e099ddd0b590b4ee69b9b`, `4f27f13d2ff6c74bffaf2669e5a3a6fce97facdc17f7d7324de5ae568dd77ed1`, `9e9a791744e8e8cfd858ce58f60fe93dc4ffb565b045d44c9bb164550fb9ed7f`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/45tcxqmn9pp3zrx3ng7qn/FP-InstallGuide-en-WH-DE-DH-FrontLoaderWashingMachineAndDryer-PairingGuide-428281BC-EU-UK-IE.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/kwsfjfj6hv9pvgvxf84qg9/FP-UserGuide-en-WH1160F-FrontLoaderWashingMachine-0-430238D-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/mw7tkrqm5k7vmhvrcnhr6ssm/FP-EnergyWater-en-WH1160F2-FrontLoaderWashingMachine-0-431588A-NZ-AU.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw8e7cf94d/QRG/AU/QRG-AU-93328.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 10: CAVITY DIMENSIONS MM AMinimum cavity height 1750 BMinimum cavity width 640 © Minimum cavity depthFlush with front panel of the productIn cupboard 655715 CLEA...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 11: SERVICE DIMENSION WASHER DRYER MM MM Length of drain hoses 1600 1300 BLength of power cord 2000 1500 ©Length of cold water inlet hose1 1500 650* ⑥ Length of ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 12: CAVITY DIMENSIONS MM AMinimum cavity height 1750 BMinimum cavity width 640 © Minimum cavity depth•Flush with front panel of the product1In cupboard 635685 CL...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 13: SERVICE DIMENSION WASHER DRYER MM MM Length of drain hoses 1600 1300 B Length of power cord 1500 1500 ©Length of cold water inlet hose1 1500 n/a ⑥ Length of ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 14: CAVITY DIMENSIONS MM AMinimum cavity height 1750 BMinimum cavity width 640 © Minimum cavity depthFlush with front panel of the productIn cupboard 650695 CLEA...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 15: SERVICE DIMENSION WASHER DRYER MM MM Length of drain hoses 1500 1300 B Length of power cord 1500 1500 ©Length of cold water inlet hose1 1500 n/a ⑥ Length of ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 4: CAVITY DIMENSIONS MM AMinimum cavity height 870 BMinimum cavity width 1260 © Minimum cavity depthFlush with front panel of the productIn cupboard 655715 CLEA...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 5: SERVICE DIMENSION WASHER DRYER MM MM Length of drain hoses 1600 1300 B Length of power cord 2000 1500 ©Length of cold water inlet hose 1500 650* ⑥ Length of ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 6: CAVITY DIMENSIONS MM AMinimum cavity height 870 BMinimum cavity width 1260 © Minimum cavity depthFlush with front panel of the product1In cupboard 640705 CLE...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 7: SERVICE DIMENSION WASHER DRYER MM MM ALength of drain hoses 1600 1300 B Length of power cord 1500 1500 ©Length of cold water inlet hose 1500 650* ⑥ Length of...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 8: CAVITY DIMENSIONS MM AMinimum cavity height 870 BMinimum cavity width 1260 © Minimum cavity depthFlush with front panel of the productIn cupboard 650705 CLEA...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 9: SERVICE DIMENSION WASHER DRYER MM MM ALength of drain hoses 1500 1300 B Length of power cord 1500 1500 ©Length of cold water inlet hose 1500 650* ⑥ Length of...

#### WH1160HG1

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `WH1160HG1`
- PDF SHA-256: `6aa9e19c0d4dce1910cd1272fcb638e787ee985fb52aa63d87cb01a61291edc2`, `6bee34d7cb2fed152439a6885cc3f0d048e9bcae033cf0cf16b5118e3a0bb48c`, `8e988c19ef4da382ec9eb024ef04fc3058ec1c34b6a236c8a2f1520ed7156635`, `ccc7abda3914a58850eb09639c6c6ba7431da0b08633727a232bab862d725771`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/hk7ssvxhtpjb3mvrcqp49m2s/FP-InstallGuide-en-WH1160HG1-WH1160H1-FM2060SG1-FM2060S1-FabricCareSolution-0-431635A-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/sn6x4zgm6s2bmsg6s5xppvv/FP-EnergyWater-en-WH1160H1-WH1160HG1-FrontLoaderWashingMachine-0-431394A-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/t46b33mxpkrg2grp48gk6n4/FP-InstallGuide-en-WH1160HG1-WH1160H1-FrontLoaderWashingMachine-0-431187A-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/vg56f8cm5vgmzqx58jh9/FP-UserGuide-en-WH1160HG1-WH1160H-FrontLoaderWashingMachine-0-431278A-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### WH1260H5

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `WH1260H5`
- PDF SHA-256: `74aba7e73318e66fe3a728d9783e9d2348ccf19b3f9fd19f6a9295cd151abfeb`, `db191f88c7adb31203874a3bc40481597530db2a7e7850969f1e3a933a1d7ae2`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/6f2wppcm2vxvb7ps78hxpj29/FP-Sheet-en-IntroducingFabricCare-WasherDryerCabinet-0-433114A-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/8n9488968h84ttnpr5pzrj8z/FP-InstallGuide-en-DH80-DH90-DH10-WH80-WH90-WH10-WH12-WasherDryerStacked-0-432973A-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### WH1260HG5

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `WH1260HG5`
- PDF SHA-256: `465d63d7221f27fbf0579e0535e495473b1868f5cf9fc6b56c2a81d570bdf859`, `4d9933e0dbfcb91a73b572df28db359b089238f3cd8de96a2a384bd6dcddcfd8`, `a8d9d2457a4582cbb4790cc5a7c8fecb10e2ea1722e7ad5fc198b0b6fb4ce8db`, `fdc147c311d6d11502c4e6f4320bcc82bad5dcb62122889d4cefa9b93a0dbbc3`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/4rwtw6sv4fcwngv8757894z/FP-UserGuide-en-WH1260H-WH1260T-DH1060HL-FabricCareSolutions-MultiProductSetup-433053B-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/5bh7cbrwb7qqwj4tf8m574m/FP-InstallGuide-en-WH8060J5-WH9060J-WH8060P-WH9060P-WH1060P-WH1260P-WH9060D5-WH1060D5-WH1260D5-WH1260R5-WH1260MZB5-WH1260T5-WH1260H5-WH1260YZB5-Washer-0-432972A-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/cxpk6z4x7tf3f95wtwq7mjz/FP-EnergyWater-en-WH1260H5-WH1260HG5-FrontLoaderWasher-0-433577A-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/t9b5ng74xxchgp4swbcrnm/FP-UserGuide-en-WH1260H5-WH1260HG5-Washer-0-433052B-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### WH1260P5

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `WH1260P5`
- PDF SHA-256: `7f1e5243b26220c361d1903c6e777ddb9dd4dddb0aca2a3d95210bee2a72d1c4`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/vq5xxrsk283frj3g9345wp/FP-EnergyWater-en-WH1260P5-WH1260PG5-FrontLoaderWasher-0-433578A-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### WH1260RG5

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `WH1260RG5`
- PDF SHA-256: `55f65d4f7ec75ce6921a119b91293a03d9da22d2336f0dc2e604c154700a3107`, `7995e35673ed88d7e65e78d7227d6c0873f5a03c2d9179bc277a68c0c505b1e9`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/h546x55wmhbr55kx2b5zfj/FP-UserGuide-en-WH1260R5-WH1260RG5-Washer-0-433050A-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/wxntjt72npjjpbhf9vgcj2f/FP-EnergyWater-en-WH1260R5-WH1260RG5-FrontLoaderWashingMachine-0-433294A-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### WH1260TG5

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `WH1260TG5`
- PDF SHA-256: `cafa0d48c9b35f98dbad77d5b95f1cbf69047226fea090b66bc6a4fdfc0fd24a`, `ec19182b5fea41e4d2275e6532e22733bd7af0d8680924b59d1c9067842952ed`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/64gb43fpj86srm67zfjh32c/FP-UserGuide-en-WH1260T5-WH1260TG5-Washer-0-433051B-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/fcc3n66kntzkfn3j9hgrpng/FP-EnergyWater-en-WH1260T5-WH1260TG5-FrontLoaderWasher-0-433579A-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### WH8060J3

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `WH8060J3`
- PDF SHA-256: `b0e4d91a2f34d031c0153a4a6ab8949217f2b3b6eb4f39eeef1c80ba3aa2f938`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/mm789fc34fm9p84hqb48cxmx/FP-EnergyWater-en-WH8060J3-FrontLoaderWashingMachine-0-431591A-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### WH8060J5

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `WH8060J5`
- PDF SHA-256: `54b97d676eb19b474e7b8820e1739dd60802e85719b10ad9bac82d860f7d3512`
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw636a518e/QRG/AU/QRG-AU-92303.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

#### WH8560P3

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `WH8560P3`
- PDF SHA-256: `0ea67fc3121842c1e30ecedbf15c441e3d4dd0810b043adc52a0abd74eb480b5`, `a35d08700c8dacaeea4edf4d80a32cf1228a50ee186d814627876747f3e2b2f6`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/2cjh5kph3nsf8jvm49njbsn3/FP-UserGuide-en-WH1060P-WH1060J-WH9060P-WH9060J-WH8560F-WH8560P-WH8560J-WH8060F-WH8060P-WH8060J-WH7560P-WH7560J-FrontLoaderWashingMachine-0-430218C-NZ-AU-SG.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/kwjpwrqt7cqg44gj58hrq/FP-EnergyWater-en-WH8560P3-FrontLoaderWashingMachine-0-430272A-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 9: PRODUCT DIMENSIONS WH1060P/J WH9060P/J WH8560F/P/J WH8060F/P WH7560P/J WH8060J MM MM MM MM MM MM A Overall height* 850 850 850 850 850 850 B Overall width 60...

#### WH9060J3

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `WH9060J3`
- PDF SHA-256: `dbd98d038a443220af85d1d044aebf625f74fc1917cd1b5ad857be42b3cf1d6e`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/2x679hmbtrjwcmf7g56cqtvk/FP-EnergyWater-en-WH9060J3-FrontLoaderWashingMachine-0-431590A-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### WH9060P5

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `WH9060P5`
- PDF SHA-256: `e74b64a95bd9662507397fe8231d6b06d10e3d020db20c8deaee9ca0552db8c1`, `efcf9af15e72efb60ce95660ca1c2229f146099cf1bbc5f9c52c1fd4439c6061`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/7k262nvv95bq4m3xrghzn68/FP-EnergyWater-en-WH9060P5-WH9060PG5-FrontLoaderWashingMachine-0-433293A-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/nv848zx99qwsrjthbvmnp366/FP-UserGuide-en-WH8060P5-WH8060PG5-WH9060P5-WH9060PG5-WH1060P5-WH1060PG5-WH1260P5-WH1260PG5-Washer-0-433049A-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### WL1064G1

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `WL1064G1`
- PDF SHA-256: `471d7eaec94209191a23f23837beebcc4726f50eafbe15b052f771f2438f6eb1`, `d124c08b3c1691b0b53a16baa28a714d642c0afc6c1bb0d618ee5e6687c7ce3a`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/54q7bvmv7489wgrgc8v9tpx/FP-UserGuide-en-WL8058G1-WL9058G1-WL1064G1-TopLoaderWashingMachine-0-431392C-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/86ts73x2sfvqmmbxqcg54bv/FP-EnergyWater-en-WL1064G1-TopLoaderWashingMachine-0-431837A-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### WL1064P1

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `WL1064P1`
- PDF SHA-256: `485f35fa9859731bf7d9eca5ad09397ae155cfdab4da73e5cd74d5fa8c5c3036`, `5283d32889a566666f8b6912c325e01fe513de436d4278c9ef8a664df05efad3`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/555pwg78vksgwgbrrnpsp76s/FP-EnergyWater-en-WL1064P1-TopLoaderWashingMachine-0-431838A-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/89jp94nkc8fm5vwnpxsq87p/FP-InstallGuide-en-WL1264P1-WL1064P1-WL1064G1-WL9058G1-WL8058G1-TopLoaderWashingMachine-QuickInstall-432198C-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### WL1264P1

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `WL1264P1`
- PDF SHA-256: `8ea702ca296a070837410f057f9bc92d65c347bef3ca43a6643d8582563196ab`, `9adaea2ce926d099b15133c62884965c457134a2f4c8a6bfb7e8c287b201c987`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/6966sgbbkbvpc6ftwnww6bz/FP-UserGuide-en-WL1064P1-WL1264P1-TopLoaderWashingMachine-0-431552E-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/cnj5f469vkqm4vsrv4sfmmj/FP-EnergyWater-en-WL1264P1-TopLoaderWashingMachine-0-431839A-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### WL9058G1

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `WL9058G1`
- PDF SHA-256: `f54606793ea084184937173ddbab16031e08e981bb8ebddc53292fd843b96804`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/q4fgr38cpb96h45x4qx83g/FP-EnergyWater-en-WL9058G1-TopLoaderWashingMachine-0-431836A-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### PDF grammar pdf_grammar_1f676258dbfe930d

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `WH1060DG5`
- PDF SHA-256: `6ba6540e310628c18a7b4a8f85773b75e6c5c00a2ced390ea92fc4f05ee18139`
- PDF grammar profiles: `pdf_grammar_1f676258dbfe930d`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/5kngqgtz4b4t5pmk6rsvn9h9/FP-PlanningGuide-en-WH9060D-WH1060D-WH1260D-DH9060D-DH1060D-FC1260H-FabricCare-0-90005541B-AU-NZ.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_DOCUMENT_EXACT_MODEL` | depth | none | `operation_envelope` | Depth with the door open*** 1167 | p.15, `9e31176c98fd` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_DOCUMENT_EXACT_MODEL` | depth | none | `operation_envelope` | Depth with the door open 1167 | p.13, `668910b16e05` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_DOCUMENT_EXACT_MODEL` | height | height | `product_closed_candidate` | Overall height 104 | p.17, `9a2c14c785aa` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_DOCUMENT_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Overall depth 593 | p.13, `668910b16e05` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_DOCUMENT_EXACT_MODEL` | width -> depth | width, depth | `product_closed_candidate` | Overall width including chassis form 602 \| Overall depth 682 | p.15, `9e31176c98fd` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_DOCUMENT_EXACT_MODEL` | height | height | `product_closed_candidate` | Overall height 201 | p.18, `ce29f998632b` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 10
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 11: inet, White FC1260HG2 Fabric Care Cabinet, Graphite Product Dimensions H 1900mm W 600mm D 660mm Electrical Supply 220-240 V, 50 Hz Service 10 A Connection 3-...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 14: Product Dimensions mm AOverall height 850 BOverall width including chassis formOverall width excluding chassis form 602 595 ©Overall width front panel 592 DO...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 16: Product Dimensions mm AOverall height 1900 BOverall width 600 ©Overall depth 663 DDepth with the door open 1240 EDoor clearance to adjacent wall min 235 FDoo...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 20: CAVITY DIMENSIONS mm ① Overall cavity width 622 E Overall cavity height 1740 F Overall cavity depth 688
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 21
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 22: CAVITY DIMENSIONS mm Overall cavity width 1852 E Overall cavity height 1915 F Overall cavity depth 700
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 23
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 25: Product Dimensions mm Maximum standpipe or tub height 1000 With storage plinth* 1200 BMinimum standpipe or tub height 600 With storage plinth* 800 ©Maximum d...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 26: Product Dimensions mm Maximum standpipe or tub height 1000 With storage plinth 1200 BMinimum standpipe or tub height 600 With storage plinth 800 ©Maximum dis...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 27: Product Dimensions mm Maximum standpipe or tub height 1000 with storage plinth* 1200 BMinimum standpipe or tub height 600 with storage plinth* 800 ©Maximum d...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 28: Product Dimensions mm Maximum standpipe or tub height 1000 with storage plinth 1200 BMinimum standpipe or tub height 600 with storage plinth 800 ©Maximum dis...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 29: Product Dimensions mm a Maximum standpipe or tub height 1000 with storage plinth 1200 B Minimum standpipe or tub height 600 with storage plinth 800 CMaximum ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 30: Product Dimensions mm a Maximum power cord length from power outlet 1400 B Maximum power cord length from power outlet 1400 C Maximum power cord length from ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 31: Product Dimensions mm a Maximum standpipe or tub height 1000 with storage plinth* 1200 B Minimum standpipe or tub height 600 with storage plinth* 800 CMaximu...
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 32
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 8
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 9

#### PDF grammar pdf_grammar_2358d2487e9939bc

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WD8560F1`, `WH1060P4`
- PDF SHA-256: `4770512ae97b65aa1a0d797ff9d6127421bf684630568360c6e03f597a072e24`, `7fcec1d5a9dbe4a9bfe86d701c118d3dad9028173adc91012472a843db3ab098`
- PDF grammar profiles: `pdf_grammar_2358d2487e9939bc`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw911255f9/QRG/AU/QRG-AU-93235.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw950cf313/QRG/AU/QRG-AU-93292.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 655 mm \| Height 850 mm \| Width 600 mm | p.2, `0a9de3af21a3` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 600 mm | p.1, `e4bc637cb1e3` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 645 mm | p.1, `73e4eb30f514` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 645 mm \| Height 850 mm \| Width 600 mm | p.2, `458df54fb60e` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 655 mm | p.1, `6988457b4abe` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | Height 850 mm | p.1, `27a9d9739015` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | Height 850 mm | p.1, `27a9d9739015` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 600 mm | p.1, `e4bc637cb1e3` |

#### PDF grammar pdf_grammar_3c28d9e9e031905b

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WH1060DG5`
- PDF SHA-256: `1f5621975d569dd8f7f9965c5147b3c3a19a1ea1b500ee5e858eacb14f192bc9`
- PDF grammar profiles: `pdf_grammar_3c28d9e9e031905b`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw06fd2744/QRG/AU/QRG-AU-92330.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwca746bc7/QRG/AU/QRG-AU-92330.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 602 mm | p.1, `2c2762a49f39` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 661 mm | p.1, `eb0273f2729a` |

#### PDF grammar pdf_grammar_3e0436a156fe0bd4

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WH1060PG5`
- PDF SHA-256: `a7bd7aad4d4d45b3aec869f062918d950286cc88e347c911adf69d856a62cb71`
- PDF grammar profiles: `pdf_grammar_3e0436a156fe0bd4`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw227e58cc/QRG/AU/QRG-AU-92334.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw819a8534/QRG/AU/QRG-AU-92334.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | Height 850 mm | p.1, `4e5bc9a12eee` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 602 mm | p.1, `2dc94b4d89a0` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 593 mm | p.2, `baeef5ab9b02` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 593 mm | p.1, `2e32b8c8996a` |

#### PDF grammar pdf_grammar_3f632c3d532d5ad1

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WH9060PG5`
- PDF SHA-256: `4dbafd64e12faa941ff5ac526c5611878084d3a4451fa9e0109414d2c7023807`
- PDF grammar profiles: `pdf_grammar_3f632c3d532d5ad1`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw0e9e58ad/QRG/AU/QRG-AU-92308.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw76c8e233/QRG/AU/QRG-AU-92308.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 602 mm | p.3, `b5b3348303a7` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 593 mm | p.2, `baeef5ab9b02` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 850 mm \| Width 602 mm \| Depth 593 mm | p.1, `a380764ba7f1` |

#### PDF grammar pdf_grammar_4134bce35c24bce3

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WH8060J3`
- PDF SHA-256: `c2feabec456c1b01970719aedff9fa4b466d444a296a85f21c77dc4d024c5b78`
- PDF grammar profiles: `pdf_grammar_4134bce35c24bce3`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw639d453a/QRG/AU/QRG-AU-92279.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 600 mm | p.2, `c765856eb69c` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width | height, width | `product_closed_candidate` | Height 850 mm \| Width 600 mm | p.1, `283a3e55d000` |

#### PDF grammar pdf_grammar_54c399747d2bf607

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `WH1260DG5`
- PDF SHA-256: `54e96a80e3b7e1308f717f9a5273dcee81d727056b41c9db2572aee91466edb6`
- PDF grammar profiles: `pdf_grammar_54c399747d2bf607`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwc6aea06b/QRG/AU/QRG-AU-92331.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 602 mm | p.1, `2c2762a49f39` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 661 mm | p.1, `eb0273f2729a` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 3

#### PDF grammar pdf_grammar_58d08a7f3d6f1923

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WH1260P1`
- PDF SHA-256: `37e7015220388234de626db06139b630c5f50607b913406c9bbced5e958ada04`
- PDF grammar profiles: `pdf_grammar_58d08a7f3d6f1923`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw8684392f/QRG/AU/QRG-AU-92298.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_SCOPE_REQUIRED` | `INDIVIDUALLY_LABELLED_AXES` | `DOCUMENT_IDENTITY_ONLY` | depth -> height -> width | none | `product_closed_candidate` | Depth 600 mm \| Height 1020 mm \| Width 580 mm | p.2, `4c8cf597bca2` |
| `RESEARCH_MODEL_SCOPE_REQUIRED` | `INDIVIDUALLY_LABELLED_AXES` | `DOCUMENT_IDENTITY_ONLY` | height -> width -> depth | none | `product_closed_candidate` | Height 1020 mm \| Width 580 mm \| Depth 600 mm | p.1, `b25477ef56b6` |

#### PDF grammar pdf_grammar_69bdef4b32e8dbfe

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `WH1260HG5`
- PDF SHA-256: `88d10692427c71febbe13af96e48bd90a177c5654a7799f601f577f18001840f`
- PDF grammar profiles: `pdf_grammar_69bdef4b32e8dbfe`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/wkszjk8rhbtz76qn6frjsvsq/FP-PlanningGuide-en-WH1260H5-WH1260HG5-WH1260T5-WH1260TG5-DH1060H5-DH1060HG5-DH1060HL5-DH1060HLG5-DH1060T5-DH1060TG5-0-90004467H-AU-NZ.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_DOCUMENT_EXACT_MODEL` | height | height | `product_closed_candidate` | Overall height 1900 | p.16, `bd86291712c3` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 10: Dryer, Graphite *Right Hand Hinge, Reversible Hinge Product Dimensions H 850mm W 602mm D 682mm Electrical Supply 220-240 V, 50 Hz Service 10 A Connection 3-p...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 11: G2* Fabric Care Cabinet, Graphite *Right Hand Hinge Product Dimensions H 1900mm W 600mm D 660mm Electrical Supply 220-240 V, 50 Hz Service 10 A Connection 3-...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 13: Product Dimensions mm Overall height* 850 BOverall width including chassis form 602 Overall width excluding chassis form 595 ©Overall width front panel 592 ⑥...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 14: Product Dimensions mm Overall height* 850 BOverall width including chassis form 602 Overall width excluding chassis form 595 ©Overall width front panel 592 ①...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 15: Product Dimensions mm Overall height* 850 ⑥Overall width including chassis form 602 Overall width excluding chassis form 595 ©Overall width front panel 592 ①...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 18: INSTALLATION DIMENSION Product Dimensions mm Overall products widthWasher, Dryer, Plinth, Stacking Kit and Fabric Care Cabinet 1212 Overall product heightWas...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 19: INSTALLATION DIMENSION Product Dimensions mm Overall products widthWasher, Dryer, Plinth, Stacking Kit and Fabric Care Cabinets 1827 Overall product heightWa...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 20: INSTALLATION DIMENSION Product Dimensions mm Overall products widthWasher, Dryer and Storage Plinths 1214 Overall product heightWasher and Dryer and Storage ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 22: Product Dimensions mm AMaximum standpipe or tub height 1000 With storage plinth 1200 BMinimum standpipe or tub height 600 With storage plinth 800 ©Maximum di...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 23: Product Dimensions mm Maximum standpipe or tub height 1000 with storage plinth 1200 BMinimum standpipe or tub height 600 with storage plinth 800 CMaximum dis...
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 24: Product Dimensions mm Maximum power cord length from power outlet 1400
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 25: Product Dimensions mm Maximum standpipe or tub height 1000 with storage plinth 1200 BMinimum standpipe or tub height 600 with storage plinth 800 CMaximum dis...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 26: Product Dimensions mm AMaximum power cord length from power outlet 1400 BMaximum power cord length from power outlet 1400 CMaximum power cord length from pow...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 27: Product Dimensions mm ④Maximum standpipe or tub height 1000 with storage plinth 1200 BMinimum standpipe or tub height 600 with storage plinth 800 CMaximum di...
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 28
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 8: G5* Front Loader Washer, Graphite *Left Hand Hing e Product Dimensions H 850mm W 602m m D 661mm Electrical Supply 220-240 V, 50 Hz Service 10 A Connection 3-...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 9: ble is included **Left Hand Hinge, Reversible Hinge Product Dimensions H 850mm W 602mm D 682mm Electrical Supply Service 220-240 V, 50 Hz Connection 10 A 3-p...

#### PDF grammar pdf_grammar_6c24f0329d3740aa

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `WH9060P5`
- PDF SHA-256: `cbd7f9cd5b27dafeca262f2cdeb303ac27932fe2f54a2ffa25d7e3ece7124d48`
- PDF grammar profiles: `pdf_grammar_6c24f0329d3740aa`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw1bd5f589/QRG/AU/QRG-AU-92307.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwd9364a5d/QRG/AU/QRG-AU-92307.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 593 mm | p.2, `baeef5ab9b02` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 850 mm \| Width 602 mm \| Depth 593 mm | p.1, `a380764ba7f1` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 3

#### PDF grammar pdf_grammar_72cc319d973c51a6

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `WH9060P5`
- PDF SHA-256: `3924d1301519acda995f11be5e0667bd27b9916660b32c1a2390c478abac7f61`
- PDF grammar profiles: `pdf_grammar_72cc319d973c51a6`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/2mw6ff346c5trgc9v4g/FP-PlanningGuide-en-WH8060P-WH9060P-WH1060P-WH1260P-DH8060P-DH1060P-FC1260H-FabricCare-0-90005540B-AU-NZ.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_DOCUMENT_EXACT_MODEL` | width -> depth | width, depth | `product_closed_candidate` | Overall width including chassis form 602 \| Overall depth 682 | p.15, `9e31176c98fd` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_DOCUMENT_EXACT_MODEL` | depth | none | `operation_envelope` | Depth with the door open*** 1167 | p.15, `9e31176c98fd` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | none | `operation_envelope` | Depth with the door open 1167 | p.13, `42cd341db4f8` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> depth | height, depth | `product_closed_candidate` | Overall height 850 \| Overall depth 593 | p.13, `42cd341db4f8` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_DOCUMENT_EXACT_MODEL` | height | height | `product_closed_candidate` | Overall height 201 | p.18, `6f6d2707f728` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 10
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 11: inet, White FC1260HG2 Fabric Care Cabinet, Graphite Product Dimensions H 1900mm W 600mm D 660mm Electrical Supply 220-240 V, 50 Hz Service 10 A Connection 3-...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 14: Product Dimensions mm AOverall height 850 BOverall width including chassis formOverall width excluding chassis form 602 595 ©Overall width front panel 592 DO...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 16: Product Dimensions mm AOverall height 1900 BOverall width 600 ©Overall depth 663 DDepth with the door open 1240 EDoor clearance to adjacent wall min 235 FDoo...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 17: Product Dimensions mm AOverall height 104 BShelf height 52 ©Overall width 595 ①Overall depth 648 ETray extension 405
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 20: CAVITY DIMENSIONS mm ① Overall cavity width 622 E Overall cavity height 1740 F Overall cavity depth 688
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 21
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 22: CAVITY DIMENSIONS mm Overall cavity width 1852 Overall cavity height 1915 F Overall cavity depth 700
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 23
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 25: Product Dimensions mm Maximum standpipe or tub heightwith storage plinth* 1000 1200 BMinimum standpipe or tub heightwith storage plinth* 600800 ©Maximum dist...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 26: Product Dimensions mm Maximum standpipe or tub heightwith storage plinth 10001200 BMinimum standpipe or tub heightwith storage plinth 600 800 ©Maximum distan...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 27: Product Dimensions mm AMaximum standpipe or tub heightwith storage plinth* 1000 1200 BMinimum standpipe or tub heightwith storage plinth* 600800 ©Maximum dis...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 28: Product Dimensions mm A Maximum standpipe or tub height with storage plinth 1000 1200 B Minimum standpipe or tub height 600 800 © with storage plinth Maximum...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 29: Product Dimensions mm Maximum standpipe or tub heightwith storage plinth 1000 1200 BMinimum standpipe or tub heightwith storage plinth 600800 ©Maximum distan...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 30: Product Dimensions mm Maximum power cord length from power outlet 1400 BMaximum power cord length from power outlet 1400 ©Maximum power cord length from powe...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 31: Product Dimensions mm A Maximum standpipe or tub height with storage plinth* 1000 1200 B Minimum standpipe or tub height with storage plinth* 600 800 © Maxim...
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 32
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 8: White WH1060PG5* 10kg Front Loader Washer, Graphite Product Dimensions H 850mm W 6 02mm D 593mm Electrical Supply 220-240 V, 50 Hz Service 10 A Connection 3-...
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 9

#### PDF grammar pdf_grammar_8d500b3f80c31fe9

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `WH1160HG1`, `WH1260R5`, `WH1260T5`, `WH8560P3`
- PDF SHA-256: `119b11dc52a0df8d59926cdc56f674d8681d749cd8800195c5b8e6681ecee1a3`, `f151d4e4d094c215c0c2d402ae81cbd542e0b578e47f020429e5e52b60beeb15`, `fdf02c0e83e3f86cee67a553de49c2ee68757d0b35ac58493fbd7f9d0d5794a5`, `ff6421e430112c39012b77b2e54c1198daecdeba17751c7bc010defb4a5293e7`
- PDF grammar profiles: `pdf_grammar_8d500b3f80c31fe9`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw13a49a25/QRG/AU/QRG-AU-92314.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw9faf296e/QRG/AU/QRG-AU-92332.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwc2de7645/QRG/AU/QRG-AU-92297.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwc6e2c85b/QRG/AU/QRG-AU-92288.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwcee8a30a/QRG/AU/QRG-AU-92314.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwffed12aa/QRG/AU/QRG-AU-92332.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 661 mm \| Height 850 mm \| Width 602 mm | p.3, `adb99f0ea48c` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 661 mm \| Height 850 mm \| Width 602 mm | p.3, `761ca2b952d0` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 665 mm \| Height 850 mm \| Width 600 mm | p.2, `8ff18331fe5a` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 655 mm \| Height 850 mm \| Width 600 mm | p.2, `f7809f9e074a` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

#### PDF grammar pdf_grammar_a8ec637b6353aca3

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WH1260P5`, `WH1260PG5`
- PDF SHA-256: `2b84e922828baee4bb7ad1ff3808cda95d67fe7982037af6f33e9ec19b6ae890`, `e9c4228618b9df2fdd3c7151f6fd449b49459dd2a8752fb86dcf44fd80434525`
- PDF grammar profiles: `pdf_grammar_a8ec637b6353aca3`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw137b64b6/QRG/AU/QRG-AU-92309.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw5d46c371/QRG/AU/QRG-AU-92309.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwa0021509/QRG/AU/QRG-AU-92310.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwcd24174a/QRG/AU/QRG-AU-92310.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 661 mm | p.1, `28c5d59770db` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 602 mm | p.1, `2dc94b4d89a0` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 661 mm | p.2, `e225746453fb` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | Height 850 mm | p.1, `4e5bc9a12eee` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 602 mm | p.3, `b5b3348303a7` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | Height 850 mm | p.1, `4e5bc9a12eee` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 602 mm | p.1, `2dc94b4d89a0` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 602 mm | p.3, `b5b3348303a7` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 661 mm | p.1, `4115fde044a4` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 661 mm | p.2, `e225746453fb` |

#### PDF grammar pdf_grammar_b42f3a0196c9e9b1

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WD8560F1`
- PDF SHA-256: `10240bd1e62b41630662c7945ba72d4981c7f5209430788d1d7a0edba7453041`
- PDF grammar profiles: `pdf_grammar_b42f3a0196c9e9b1`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/sgxpjg6p5rjx9p4mh82h7x/FP-UserInstall-en-WD8560F1-WD7560P1-WD8060P1-FrontLoadingWasherDryer-0-429646E-NZ-AU-UK-IE-SG.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXACT_MODEL_COLUMN_MATRIX` | `MODEL_COLUMN_DIMENSION_MATRIX` | `SAME_FRAGMENT_EXACT_MODEL` | height -> width -> depth -> depth | height, width, depth | `mixed_product_and_operation` | WD8560F1 \| A Overall height of product 850 \| B Overall width of product 600 \| © Overall depth of product(including dial and doorwhen closed) 645 \| D Depth with door open 1065 | p.15, `7ce6c5e9fb17` |

#### PDF grammar pdf_grammar_c2159fa292bddcd7

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WL1264P1`
- PDF SHA-256: `66b5ed504091a31f23e91fca9ac9f415a2c12224208e166a8b3e2ba6e5f3836c`
- PDF grammar profiles: `pdf_grammar_c2159fa292bddcd7`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwe9bebb15/QRG/AU/QRG-AU-93299.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> width | depth, width | `product_closed_candidate` | Depth 1095 mm \| Width 640 mm | p.2, `f45cb53eed51` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 1095 mm \| Width 640 mm \| Depth 650 mm | p.1, `f0fa0c834292` |

#### PDF grammar pdf_grammar_e6d1847e16d9741c

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WH9060J3`
- PDF SHA-256: `5847ccb7097c24141abaff5cab2891fce341608ccffcdad3cdd67535f55cdb01`
- PDF grammar profiles: `pdf_grammar_e6d1847e16d9741c`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwf26f4376/QRG/AU/QRG-AU-92275.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 655 mm \| Height 850 mm \| Width 600 mm | p.2, `04372f69dafa` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 600 mm | p.1, `b503c6e11463` |

#### PDF grammar pdf_grammar_ecae38afc82e0cdc

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `WH1060P5`
- PDF SHA-256: `3b4408baf29dd810d4e4640e6585a50e8f73148df9cfca8d5ee047073908e956`
- PDF grammar profiles: `pdf_grammar_ecae38afc82e0cdc`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw9a99cdbe/QRG/AU/QRG-AU-92333.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwfd34f911/QRG/AU/QRG-AU-92333.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 593 mm | p.2, `baeef5ab9b02` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

#### PDF grammar pdf_grammar_fa4e96e9408d0085

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WH1060SG1`, `WH1260H5`, `WH1260HG5`, `WH1260RG5`, `WH1260TG5`, `WL1064G1`, `WL1064P1`, `WL9058G1`
- PDF SHA-256: `6f0949b387261f9efc65222be4364e6263d0eedc443a00c3acbbaf87caabc595`, `84fbbada984eb624c8906fcdfc26a4d2e5e9a5ff7750442c7f89f7eacdf6bb9f`, `8b6a6614a2142b1f22be0aca7d1d42207e08e2a38a6afd633409a02f1d57833a`, `b6dfc630105b3692c67dee8ddf6a9d9992a25244af8f7995014326bd0bf24457`, `c629483c0a504aaa596eb6cbe4b2767b3b16e10ea012cd4c72728a9185f379d0`, `d4c49f553c6fcf6accfa747c119a4e21caefc853ca2ab76b93a63f24d976748e`, `de929e1642bd10b1a99550b1c3272b8f78bb836362eb37ef5eba796448a21e90`, `e0a2b62a62436e3a3bd5073785f56eb58aa52e1b5e1c89c6f91a68ca346080b7`
- PDF grammar profiles: `pdf_grammar_fa4e96e9408d0085`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw14eed18e/QRG/AU/QRG-AU-92290.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw2362baad/QRG/AU/QRG-AU-93298.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw2b6402df/QRG/AU/QRG-AU-92315.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw48c5403b/QRG/AU/QRG-AU-92318.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw59beffbb/QRG/AU/QRG-AU-92315.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw6a68da0e/QRG/AU/QRG-AU-92312.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw922657a6/QRG/AU/QRG-AU-93297.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw96ed6823/QRG/AU/QRG-AU-92299.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwd97ec2b7/QRG/AU/QRG-AU-92312.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwe377ab23/QRG/AU/QRG-AU-92320.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwf9f0d66e/QRG/AU/QRG-AU-92318.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwfc41ca8f/QRG/AU/QRG-AU-92320.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 661 mm \| Height 850 mm \| Width 602 mm | p.2, `2292c11bbfb1` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 850 mm \| Width 602 mm \| Depth 661 mm | p.1, `74e4390751f7` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 661 mm \| Height 850 mm \| Width 602 mm | p.2, `fab59030d10a` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 850 mm \| Width 602 mm \| Depth 661 mm | p.1, `74e4390751f7` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 850 mm \| Width 602 mm \| Depth 661 mm | p.1, `74e4390751f7` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 850 mm \| Width 602 mm \| Depth 661 mm | p.1, `74e4390751f7` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 675 mm \| Height 850 mm \| Width 600 mm | p.2, `d403a69e8966` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 650 mm \| Height 1095 mm \| Width 640 mm | p.2, `34c4baecd3bf` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 1095 mm \| Width 640 mm \| Depth 650 mm | p.1, `f0fa0c834292` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 600 mm \| Height 1020 mm \| Width 580 mm | p.2, `013efa240be3` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 650 mm \| Height 1095 mm \| Width 640 mm | p.2, `655c3f245a39` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 661 mm \| Height 850 mm \| Width 602 mm | p.3, `1e51ad4206e1` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 850 mm \| Width 600 mm \| Depth 675 mm | p.1, `597d2ea95e6c` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 1020 mm \| Width 580 mm \| Depth 600 mm | p.1, `b25477ef56b6` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 1095 mm \| Width 640 mm \| Depth 650 mm | p.1, `f5eadf02ef13` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 661 mm \| Height 850 mm \| Width 602 mm | p.3, `07a55a2eed64` |

### GAGGENAU

- Raw brand variants: `GAGGENAU`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Germanica

- Raw brand variants: `Germanica`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Hafele

- Raw brand variants: `Hafele`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Haier

- Raw brand variants: `Haier`
- Inventory models: 77
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### HELLER

- Raw brand variants: `HELLER`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Hisense

- Raw brand variants: `Hisense`
- Inventory models: 34
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 6
- Proven marketing series: 1; total series count: `PROVEN_MINIMUM_ONLY`
- PDF grammar profiles: 2

#### Series 5

- Group type: `marketing_series`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `HWF5S1214`
- PDF SHA-256: `63decb781c54d8031f99f83186b72dadb5d850ef8f9538cd5c042c77be385351`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HWF5S1214-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxNTU3MDR8YXBwbGljYXRpb24vcGRmfGFHWXpMMmhoWWk4NE9EQTBNVEEwTVRReU9EYzRMMGhYUmpWVE1USXhOQzFUY0dWakxuQmtaZ3w2NGJjYzNiOTdlMzFkNjViYjE1NDljNTcwNzkyYWQyMjE1ODA0NmFiMmZlNDAwMzY2YmYyMWQwZGE4Zjk5ZmEx>
- Series evidence: page 1, `Model Model Number HWF5S1214 Series 5 Category Front load washer Warranty Period 3 years Model Year 2024 Specifications Cabinet colour Wh...`

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 3: Net dimensions(W x H x D)

#### HWF3S8514X

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `HWF3S8514X`
- PDF SHA-256: `f047b5110c58719612ae05ac7d6cccd1ed974d8086dba6632bf71b3df4b4653c`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HWF3S8514X-User-Manual.pdf?context=bWFzdGVyfE1hbnVhbHwxNTU3NzYzOHxhcHBsaWNhdGlvbi9wZGZ8YURsbUwyZzFNeTg0T0RrNE16TTVOelkyTXpBeUwwaFhSak5UT0RVeE5GZ2dMU0JWYzJWeUlFMWhiblZoYkM1d1pHWXw3NDIxMmUyNTA1ZjYwMjhjYjI2NjE2YzNhZmMxZGFjNDAzYzQzNDE1Mzg5MmZiOThlMWZkNjA1ODQwMTJlMTM4>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 11: Index Dimensions (mm) A 595 B 845 C 480 D 510 E 540 F 1020

#### HWF8I1015BX

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `HWF8I1015BX`
- PDF SHA-256: `1fb14dce702d4c6a84359c12c1b4d482e360ec68a98475342f4f4f1faa899fe3`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/User-Manul-HWF8I1015BX-0723.pdf?context=bWFzdGVyfE1hbnVhbHwxMTg0NjU2MnxhcHBsaWNhdGlvbi9wZGZ8YUdFNEwyaGtNQzg0T0RjM05qVTFNakk0TkRRMkwxVnpaWElnVFdGdWRXd3RTRmRHT0VreE1ERTFRbGd0TURjeU15NXdaR1l8MGQwOTMyODYyM2ZmZGZjNGI4YTBjYzZlYjA2OTk4ZjFiMmJmNTdiM2NlYjFlODQ4ZDZiNjVlZDAwNDU1YWM3Yw>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 12: Index Dimensions (mm) A 595 B 845 C 515 D 550 E 580 F 1075

#### HWFS1015E

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `HWFS1015E`
- PDF SHA-256: `1282141354ddd0d1d197d847a03ce9b4e99e256ee7bcb18c1a38b1c965eb0605`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HWFS1015E-Spec.pdf?context=bWFzdGVyfG1hbnVhbHw2Mjk5NHxhcHBsaWNhdGlvbi9wZGZ8YURkaUwyaGtaUzg0T0RBME1EazBOVEE1TURnMkwwaFhSbE14TURFMVJTMVRjR1ZqTG5Ca1pnfDg4YWU1MTE2NzA0NGE2MTBhMDI1NjhmYmY1MjAxMjk0NDE4M2RiZDYwNzEyZTI1OWFiMzE0ZDZkOWFlMzIzNGQ>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: Auto Yes Shirts Yes Delicates Yes Synthetics Yes Towels Yes Dimensions mm Net Height Width 845 mm 595 Depth mm 590 Shrink Film Package mm 885 Height Width mm...

#### PDF grammar pdf_grammar_452591a7c829e70f

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `HWFS7514S`
- PDF SHA-256: `e204a17de2750e310c90dec3599ab20fcf576cab714396064ef6ecf41fc6e3f7`
- PDF grammar profiles: `pdf_grammar_452591a7c829e70f`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HWFS7514S-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxMjAzNTI2fGFwcGxpY2F0aW9uL3BkZnxhRE5sTDJnME5TODRPREEwTVRFeE16VXhPRE00TDBoWFJsTTNOVEUwVXkxVGNHVmpMbkJrWmd8MWUyNjY3YzM2NDFiNDNlMzg2NzQ3ODE2MDAwNGI1NmUxNjJjN2NjZmVmMmUyY2YwYzEyOTY3M2VjNDc5ZmM2Yw>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_UNIT_MISSING` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | none | `product_closed_candidate` | Net dimensions(W x H x D) 595*845*540 | p.1, `514cc629d52a` |
| `RESEARCH_UNIT_MISSING` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | none | `delivery_package` | Package dimensions(W x H x D) 645*880*560 | p.1, `514cc629d52a` |

#### PDF grammar pdf_grammar_e630f236eb4059b3

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `HWF5I1215`
- PDF SHA-256: `a85ac2f1727da062b515901eda319f16147312c89d7136643509bd5498f17b06`
- PDF grammar profiles: `pdf_grammar_e630f236eb4059b3`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/2026-Hisense-AU-Consumer-Spec-HWF5I1215-.pdf?context=bWFzdGVyfE1hbnVhbHwxMzg1MDZ8YXBwbGljYXRpb24vcGRmfGFERmpMMmhsTXk4NE9EazRNekk1T1RNMU9UQXlMekl3TWpZZ1NHbHpaVzV6WlNCQlZTQXRJRU52Ym5OMWJXVnlJRk53WldNZ0tFaFhSalZKTVRJeE5Ta3VjR1JtfDI1YmYzMjZlMzY5OWIwOGMxZTJhNmI1ZDUxNjc4ZTU2OGVmZjI0NjUyZmJlNGYzYWRmZDhmMjhjYTVmY2YwODA>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Net dimensions(W x H x D) (mm) 595x 845x 595 | p.1, `8f3a224792d3` |

### Hitachi

- Raw brand variants: `Hitachi`
- Inventory models: 8
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### HOOVER

- Raw brand variants: `HOOVER`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Inalto

- Raw brand variants: `Inalto`
- Inventory models: 50
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### KLEENMAID

- Raw brand variants: `KLEENMAID`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Kogan

- Raw brand variants: `Kogan`
- Inventory models: 111
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 3
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

#### KAMFWASH80A

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `KAMFWASH80A`
- PDF SHA-256: `a8c67fa69928ebbe7c167fc0dbcd9213d5004ded9c0607c800866123317a1664`
- Official/source URLs: <https://assets.kogan.com/files/usermanuals/KAMFWASH80A_UG.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### KAMFWASH90A

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `KAMFWASH90A`
- PDF SHA-256: `ba24a3d8763031f188e71a764b8abbd7021b731d558234353532446cb42e18c4`
- Official/source URLs: <https://assets.kogan.com/files/usermanuals/KAMFWASH90A_UG.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### KATFWASH11A

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `KATFWASH11A`
- PDF SHA-256: `7841cd0cbca912789cf9d92bab4c7647710dcdc546e9e1dc2c3481df8ef99c79`
- Official/source URLs: <https://assets.kogan.com/files/usermanuals/KATFWASH11A_UG.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

### LG

- Raw brand variants: `LG`
- Inventory models: 175
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 6
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 4

#### Document family 2d559286f86e

- Group type: `document_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WV9-1412B`, `WV9-1412W`
- PDF SHA-256: `2d559286f86ecfd209c52ac6e5e02343f7515715d9674fc7e98c0e5028619a1b`
- PDF grammar profiles: `pdf_grammar_982e0761924cb008`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=HJoJF6sjLmW0vxZag11e5g>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_PARTIAL_REJECT_AMBIGUOUS_DEPTH` | `ALTERNATING_AXIS_VALUE_CELLS` | `SAME_PAGE_EXACT_MODEL` | width -> depth -> depth -> height -> depth | width, height | `product_closed_candidate` | Dimension(mm) W 600 D 560 D" 1100 H 850 D' 620 | p.12, `82b71f1ed934` |
| `SUPPORTED_PARTIAL_REJECT_AMBIGUOUS_DEPTH` | `ALTERNATING_AXIS_VALUE_CELLS` | `SAME_PAGE_EXACT_MODEL` | width -> depth -> depth -> height -> depth | width, height | `product_closed_candidate` | Dimension(mm) W 600 D 610 D" 1135 H 850 D' 660 | p.12, `3d53d627e79d` |

#### WD1216HTE

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `WD1216HTE`
- PDF SHA-256: `19d5a031054d6e1520aa83d45c025ccefb636a0234f9885e574358a37f53ef45`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=c5KT0VXQEkTcJ8ojmWFA>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### WD1610NSW

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `WD1610NSW`
- PDF SHA-256: `0f65461ffdc6f30da8bf11e952dacc250e64c68a52e8712bdf428123a8465107`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=9h6qB3b1EeYjHTHq8UfNig>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### PDF grammar pdf_grammar_5a6fb6981a511ec4

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WD1275A1`
- PDF SHA-256: `736c5c97437df0ac5168dce2a213c2a552bc492e3b4407cd8297cdf9ca35cee1`
- PDF grammar profiles: `pdf_grammar_5a6fb6981a511ec4`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=XSzB9y7vFqHz12fgVCRvHw>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_PARTIAL_REJECT_AMBIGUOUS_DEPTH` | `ALTERNATING_AXIS_VALUE_CELLS` | `SAME_PAGE_EXACT_MODEL` | width -> depth -> depth -> height -> depth | width, height | `product_closed_candidate` | Dimension(mm) W 600 D 475 D" 1015 H 850 D' 535 | p.11, `ac5ea0a069ae` |

#### PDF grammar pdf_grammar_c16293ad1361ce1b

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WTL9-12B`
- PDF SHA-256: `b989a2ed39f79d119d7a146024bb609558ca2e06ab409c33721300644334dcd4`
- PDF grammar profiles: `pdf_grammar_c16293ad1361ce1b`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=5dZGXMUYnBGTiZTytfPE7g>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_PARTIAL_REJECT_AMBIGUOUS_DEPTH` | `ALTERNATING_AXIS_VALUE_CELLS` | `SAME_PAGE_EXACT_MODEL` | width -> depth -> height -> depth -> height | width, height | `product_closed_candidate` | Dimension(mm) W 690 D 730 H 1070 D' 760 H' 1420 | p.9, `ff57a04469e1` |

#### PDF grammar pdf_grammar_fc79ad5b7905f579

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WTL9-12B`
- PDF SHA-256: `441c8cc4705cd5ab31fc62b89086e89eefeffa7e0bd2122f533460018e8efd28`
- PDF grammar profiles: `pdf_grammar_fc79ad5b7905f579`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.lg.com/content/dam/channel/wcms/au/images/wm/features/WTL9-12B_Specsheet_231010_V1.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Width 690mm \| Height 1070mm \| Depth 730mm | p.1, `1315aaa97e56` |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_PAGE_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Packing (W x H x D) 752mm ×1140mm x797mm | p.1, `1315aaa97e56` |

### Livable

- Raw brand variants: `Livable`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Living & Co

- Raw brand variants: `Living & Co`
- Inventory models: 11
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### majestic

- Raw brand variants: `majestic`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### MALBER

- Raw brand variants: `MALBER`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Midea

- Raw brand variants: `Midea`
- Inventory models: 50
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Miele

- Raw brand variants: `Miele`
- Inventory models: 44
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Mistral

- Raw brand variants: `Mistral`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### MOBORV

- Raw brand variants: `MOBORV`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Mykin

- Raw brand variants: `Mykin`
- Inventory models: 33
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### NCE

- Raw brand variants: `NCE`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Norj

- Raw brand variants: `Norj`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Omega

- Raw brand variants: `Omega`
- Inventory models: 16
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### ONIX

- Raw brand variants: `ONIX`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Panasonic

- Raw brand variants: `Panasonic`
- Inventory models: 13
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### PARMCO

- Raw brand variants: `PARMCO`
- Inventory models: 7
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### QFLOW

- Raw brand variants: `QFLOW`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Robinhood

- Raw brand variants: `Robinhood`
- Inventory models: 14
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### RV ECOWASHER

- Raw brand variants: `RV ECOWASHER`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Samsung

- Raw brand variants: `SAMSUNG`, `Samsung`
- Inventory models: 55
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 7
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 3

#### Document family 0f60add258fa

- Group type: `document_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WW90DG6U3ALB`, `WW90DG6U3ALE`
- PDF SHA-256: `0f60add258fa3da0c8250cddaddd435dd0f7d5b8c89b64add912f25f53a52b27`
- PDF grammar profiles: `pdf_grammar_59e49410096f0fd2`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://downloadcenter.samsung.com/content/UM/202604/20260408143907954/Web_IB_D-PJT_WASHER-MD_SimpleUX_EN_v1.pdf>, <https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_AU&OriginYN=N&ModelType=N&ModelName=WW90DG6U3ALB&CttFileID=11364936&CDCttType=UM&VPath=UM%2F202604%2F20260408143907954%2FWeb_IB_D-PJT_WASHER-MD_SimpleUX_EN_v1.pdf>, <https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_AU&OriginYN=N&ModelType=N&ModelName=WW90DG6U3ALE&CttFileID=11364936&CDCttType=UM&VPath=UM%2F202604%2F20260408143907954%2FWeb_IB_D-PJT_WASHER-MD_SimpleUX_EN_v1.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_SCOPE_REQUIRED` | `LETTERED_EXPLICIT_AXIS_LIST` | `DOCUMENT_IDENTITY_ONLY` | width -> height -> depth | none | `product_closed_candidate` | A (Width) 600 mm \| B (Height) 850 mm \| C (Depth) 595 mm | p.62, `778153986852` |

#### Document family 1f2460ba7366

- Group type: `document_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WW11CG60ADLB`, `WW11CG60ADLE`
- PDF SHA-256: `1f2460ba7366fa75d802d47a0bcf01b82c5578919e975d935a8d589b4154f9a0`
- PDF grammar profiles: `pdf_grammar_59e49410096f0fd2`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://downloadcenter.samsung.com/content/UM/202602/20260211103223036/DC68-04493F-00_IB_B-PJT_B11_WASHER-MD_SimpleUX_EN_240424.pdf>, <https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_AU&OriginYN=N&ModelType=N&ModelName=WW11CG60ADLB&CttFileID=11284915&CDCttType=UM&VPath=UM%2F202602%2F20260211103223036%2FDC68-04493F-00_IB_B-PJT_B11_WASHER-MD_SimpleUX_EN_240424.pdf>, <https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_AU&OriginYN=N&ModelType=N&ModelName=WW11CG60ADLE&CttFileID=11284915&CDCttType=UM&VPath=UM%2F202602%2F20260211103223036%2FDC68-04493F-00_IB_B-PJT_B11_WASHER-MD_SimpleUX_EN_240424.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_SCOPE_REQUIRED` | `LETTERED_EXPLICIT_AXIS_LIST` | `DOCUMENT_IDENTITY_ONLY` | width -> height -> depth | none | `product_closed_candidate` | A (Width) 600 mm \| B (Height) 850 mm \| C (Depth) 600 mm | p.63, `346abcd58491` |

#### Document family d075eefb8152

- Group type: `document_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WW12BB944DGB`, `WW12BB944DGH`
- PDF SHA-256: `d075eefb815236292b023180ec9edd2f78a81e49efb9131977c6fae95c9ef55b`
- PDF grammar profiles: `pdf_grammar_d9ff4d7551b11ed0`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://downloadcenter.samsung.com/content/UM/202604/20260427073944837/DC68-04464A-02_IB_B-PJT_WASHER-AD_SimpleUX_EN_260423.pdf>, <https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_AU&OriginYN=N&ModelType=N&ModelName=WW12BB944DGB&CttFileID=11396073&CDCttType=UM&VPath=UM%2F202604%2F20260427073944837%2FDC68-04464A-02_IB_B-PJT_WASHER-AD_SimpleUX_EN_260423.pdf>, <https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_AU&OriginYN=N&ModelType=N&ModelName=WW12BB944DGH&CttFileID=11396073&CDCttType=UM&VPath=UM%2F202604%2F20260427073944837%2FDC68-04464A-02_IB_B-PJT_WASHER-AD_SimpleUX_EN_260423.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_SCOPE_REQUIRED` | `INDIVIDUALLY_LABELLED_AXES` | `DOCUMENT_IDENTITY_ONLY` | width -> height -> depth | none | `product_closed_candidate` | Width 600 mm \| Height 850 mm \| Depth 595 mm | p.66, `a07b1b57bc05` |
| `RESEARCH_MODEL_SCOPE_REQUIRED` | `INDIVIDUALLY_LABELLED_AXES` | `DOCUMENT_IDENTITY_ONLY` | width -> height -> depth | none | `product_closed_candidate` | Width 600 mm \| Height 850 mm \| Depth 695 mm | p.66, `2f102d7d7337` |

#### PDF grammar pdf_grammar_59e49410096f0fd2

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WW11CG604DLE`, `WW11CGC0ADAE`
- PDF SHA-256: `07a3dfc0bbc15bdc52104c1b9002e53aaaa397ee875377b8ee8af5bba5b2ecbc`, `877d2c1d41af4840edef41036feba9e8130e91f6a1b0fe6b0d4eaddfb6f38428`
- PDF grammar profiles: `pdf_grammar_59e49410096f0fd2`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://downloadcenter.samsung.com/content/UM/202406/20240601161223350/DC68-04493F-00_IB_B-PJT_B11_WASHER-MD_SimpleUX_EN_240424.pdf>, <https://downloadcenter.samsung.com/content/UM/202408/20240805130241972/DC68-04493M-00_IB_B-PJT-B11_WASHER-MD_EN_240531.pdf>, <https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_AU&OriginYN=N&ModelType=N&ModelName=WW11CG604DLE&CttFileID=9716081&CDCttType=UM&VPath=UM%2F202406%2F20240601161223350%2FDC68-04493F-00_IB_B-PJT_B11_WASHER-MD_SimpleUX_EN_240424.pdf>, <https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_AU&OriginYN=N&ModelType=N&ModelName=WW11CGC0ADAE&CttFileID=9832270&CDCttType=UM&VPath=UM%2F202408%2F20240805130241972%2FDC68-04493M-00_IB_B-PJT-B11_WASHER-MD_EN_240531.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_SCOPE_REQUIRED` | `LETTERED_EXPLICIT_AXIS_LIST` | `DOCUMENT_IDENTITY_ONLY` | width -> height -> depth | none | `product_closed_candidate` | A (Width) 600 mm \| B (Height) 850 mm \| C (Depth) 600 mm | p.59, `f6ba4b975e20` |
| `RESEARCH_MODEL_SCOPE_REQUIRED` | `LETTERED_EXPLICIT_AXIS_LIST` | `DOCUMENT_IDENTITY_ONLY` | width -> height -> depth | none | `product_closed_candidate` | A (Width) 600 mm \| B (Height) 850 mm \| C (Depth) 600 mm | p.63, `346abcd58491` |

#### PDF grammar pdf_grammar_d9ff4d7551b11ed0

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WW12BB94ADGH`
- PDF SHA-256: `af50c51b9268902edacb2854408c22e405545f4616bce99aced15af7a0216ad9`
- PDF grammar profiles: `pdf_grammar_d9ff4d7551b11ed0`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://downloadcenter.samsung.com/content/UM/202602/20260225092633863/OID139018_IB_B-PJT_WASHER-AD_SimpleUX_EN_251211.pdf>, <https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_AU&OriginYN=N&ModelType=N&ModelName=WW12BB94ADGH&CttFileID=11298569&CDCttType=UM&VPath=UM%2F202602%2F20260225092633863%2FOID139018_IB_B-PJT_WASHER-AD_SimpleUX_EN_251211.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_SCOPE_REQUIRED` | `INDIVIDUALLY_LABELLED_AXES` | `DOCUMENT_IDENTITY_ONLY` | width -> height -> depth | none | `product_closed_candidate` | Width 600 mm \| Height 850 mm \| Depth 695 mm | p.66, `9093c1c588eb` |
| `RESEARCH_MODEL_SCOPE_REQUIRED` | `INDIVIDUALLY_LABELLED_AXES` | `DOCUMENT_IDENTITY_ONLY` | width -> height -> depth | none | `product_closed_candidate` | Width 600 mm \| Height 850 mm \| Depth 595 mm | p.66, `9a672ec2b67f` |

#### PDF grammar pdf_grammar_ed20989e61d1cca9

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WW90DG6U34LE`
- PDF SHA-256: `ad2dd912738c0c7bb63bb9d1ad4e53f9ade09c67bb40e9419d823766f4bd4b30`
- PDF grammar profiles: `pdf_grammar_ed20989e61d1cca9`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://downloadcenter.samsung.com/content/UM/202505/20250514163744690/OID80230_IB_D-PJT_WASHER-AD_SimpleUX_EN__250325.pdf>, <https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_AU&OriginYN=N&ModelType=N&ModelName=WW90DG6U34LESA&CttFileID=10388112&CDCttType=UM&VPath=UM%2F202505%2F20250514163744690%2FOID80230_IB_D-PJT_WASHER-AD_SimpleUX_EN__250325.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_SCOPE_REQUIRED` | `LETTERED_EXPLICIT_AXIS_LIST` | `DOCUMENT_IDENTITY_ONLY` | width -> height -> depth | none | `product_closed_candidate` | A (Width) 600 mm \| B (Height) 850 mm \| C (Depth) 595 mm | p.68, `1b9ca16e2b6a` |
| `RESEARCH_MODEL_SCOPE_REQUIRED` | `LETTERED_EXPLICIT_AXIS_LIST` | `DOCUMENT_IDENTITY_ONLY` | width -> height -> depth | none | `product_closed_candidate` | A (Width) 600 mm \| B (Height) 850 mm \| C (Depth) 595 mm | p.68, `9ba3e68ef4a0` |

### SAMSUNG ELECTRONICS

- Raw brand variants: `SAMSUNG ELECTRONICS`
- Inventory models: 45
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SEIKI

- Raw brand variants: `SEIKI`
- Inventory models: 16
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SHARP

- Raw brand variants: `SHARP`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SHOME I SEIKI

- Raw brand variants: `SHOME I SEIKI`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SIEMENS

- Raw brand variants: `SIEMENS`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Smeg

- Raw brand variants: `Smeg`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Solt

- Raw brand variants: `Solt`
- Inventory models: 47
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Speed Queen

- Raw brand variants: `SPEED QUEEN`, `Speed Queen`
- Inventory models: 29
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Sphere

- Raw brand variants: `Sphere`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Stirling

- Raw brand variants: `Stirling`
- Inventory models: 16
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Swift

- Raw brand variants: `Swift`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### TCL

- Raw brand variants: `TCL`
- Inventory models: 17
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Technika

- Raw brand variants: `Technika`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### TECO

- Raw brand variants: `TECO`
- Inventory models: 9
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Teka

- Raw brand variants: `Teka`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### TELEFUNKEN

- Raw brand variants: `TELEFUNKEN`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Tisira

- Raw brand variants: `Tisira`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Toshiba

- Raw brand variants: `Toshiba`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Tuscany

- Raw brand variants: `Tuscany`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### V-ZUG

- Raw brand variants: `V-ZUG`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Vision

- Raw brand variants: `Vision`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### VOGUE

- Raw brand variants: `VOGUE`
- Inventory models: 13
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Westinghouse

- Raw brand variants: `Westinghouse`
- Inventory models: 31
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### WHIRLPOOL

- Raw brand variants: `WHIRLPOOL`, `Whirlpool`
- Inventory models: 39
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### yokohama

- Raw brand variants: `yokohama`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

## Dryers

Inventory: 843 models across 68 category-brand groups.

### AEG

- Raw brand variants: `AEG`
- Inventory models: 21
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### AKAI

- Raw brand variants: `AKAI`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Altus

- Raw brand variants: `Altus`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Anko

- Raw brand variants: `Anko`
- Inventory models: 7
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### ARISTON

- Raw brand variants: `ARISTON`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Artusi

- Raw brand variants: `Artusi`
- Inventory models: 8
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### ASKO

- Raw brand variants: `ASKO`
- Inventory models: 24
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### AWARD

- Raw brand variants: `AWARD`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### BEKO

- Raw brand variants: `BEKO`, `Beko`
- Inventory models: 31
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Bosch

- Raw brand variants: `BOSCH`, `Bosch`
- Inventory models: 25
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 4
- Proven marketing series: 2; total series count: `PROVEN_MINIMUM_ONLY`
- PDF grammar profiles: 2

#### Series 6

- Group type: `marketing_series`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `WQG235DRAU`, `WQG24200AU`
- PDF SHA-256: `08b952e6c0bfdbe21ee9aa9a8f6ad7faced3358f5721450359e408d9885da840`, `cbd890b096473a6e036e620083e06cf1e5e688650bb497f559af0ff36f72fe00`
- PDF grammar profiles: `pdf_grammar_204215076a2c17f3`, `pdf_grammar_9123208c84c6ea6e`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://media3.bosch-home.com/Documents/specsheet/en-AU/WQG235DRAU.pdf>, <https://media3.bosch-home.com/Documents/specsheet/en-AU/WQG24200AU.pdf>
- Series evidence: page 1, `Series 6, heat pump tumble dryer, 8 kg, Cast iron grey WQG235DRAU`; page 2, `Series 6, heat pump tumble dryer, 8 kg, Cast iron grey WQG235DRAU`; page 3, `Series 6, heat pump tumble dryer, 8 kg, Cast iron grey WQG235DRAU`; page 1, `Series 6, heat pump tumble dryer, 9 kg WQG24200AU`; page 2, `Series 6, heat pump tumble dryer, 9 kg WQG24200AU`; page 3, `Series 6, heat pump tumble dryer, 9 kg WQG24200AU`

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_PARTIAL_REJECT_QUALIFIED_DEPTH_VARIANT` | `GROUPED_AXIS_SEQUENCE_WITH_VARIANT` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width | `product_closed_candidate` | Dimensions (H x W x D) 84.2 cm x 59.8 cm x 61.3 cm | p.2, `6033961777c2` |
| `SUPPORTED_PARTIAL_REJECT_QUALIFIED_DEPTH_VARIANT` | `GROUPED_AXIS_SEQUENCE_WITH_VARIANT` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width | `product_closed_candidate` | Dimensions (H x W x D) 84.2 cm x 59.8 cm x 61.3 cm | p.2, `4a129d1c7cf4` |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Dimensions (HxWxD) 842x598x613 mm | p.1, `57d1a4276abc` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 1: ge: ..Right text Length electrical supply cord: 145 cm text Dimensions (HxWxD): .842x598x613 mm text Net weight: .55.7 kg text Fluorinated greenhouse gases: ...
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 3: Measurements in mm
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 3: Measurements in mm

#### Series 8

- Group type: `marketing_series`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `WQG235D8AU`, `WQG24201AU`
- PDF SHA-256: `ae265001f3f720fa66b31049117b1ad6937a2e4890c68eb870cf04005141557f`, `d230e3d6d25a008a09b58479140e62d5f610ecbf46bc2e05eb2e83301f7f8d46`
- PDF grammar profiles: `pdf_grammar_204215076a2c17f3`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://media3.bosch-home.com/Documents/specsheet/en-AU/WQG235D8AU.pdf>, <https://media3.bosch-home.com/Documents/specsheet/en-AU/WQG24201AU.pdf>
- Series evidence: page 1, `Series 8, heat pump tumble dryer, 8 kg WQG235D8AU`; page 3, `Series 8, heat pump tumble dryer, 8 kg WQG235D8AU`; page 1, `Series 8, heat pump tumble dryer, 9 kg WQG24201AU`; page 2, `Series 8, heat pump tumble dryer, 9 kg WQG24201AU`; page 3, `Series 8, heat pump tumble dryer, 9 kg WQG24201AU`

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_PARTIAL_REJECT_QUALIFIED_DEPTH_VARIANT` | `GROUPED_AXIS_SEQUENCE_WITH_VARIANT` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width | `product_closed_candidate` | Dimensions (H x W x D) 84.2 cm x 59.8 cm x 61.3 cm | p.2, `5aaa8c0602e3` |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Dimensions (HxWxD) 842x598x613 mm | p.1, `7b23baa3981c` |
| `SUPPORTED_PARTIAL_REJECT_QUALIFIED_DEPTH_VARIANT` | `GROUPED_AXIS_SEQUENCE_WITH_VARIANT` | `SAME_DOCUMENT_EXACT_MODEL` | height -> width -> depth | height, width | `product_closed_candidate` | Dimensions (H x W x D) 84.2 cm x 59.8 cm x 61.3 cm | p.2, `9e305634ff35` |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Dimensions (HxWxD) 842x598x613 mm | p.1, `d5cde1ff6f47` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 3: Measurements in mm
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 3: Measurements in mm

### carson

- Raw brand variants: `carson`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### CHIQ

- Raw brand variants: `CHIQ`
- Inventory models: 16
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Devanti

- Raw brand variants: `Devanti`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Electrolux

- Raw brand variants: `Electrolux`
- Inventory models: 43
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 2
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 1

#### PDF grammar pdf_grammar_8f60826f847a01df

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `EDV605H3WC`, `EDV705H3WC`
- PDF SHA-256: `858bcfe2625fee4321045b82065d2805ea4a43b5fddf2948ffe51a4de7acbbb8`, `8a7e470a1a7346035ac67ca27ab693732cf5b3c56aa58b29ee0c623a211a585d`
- PDF grammar profiles: `pdf_grammar_8f60826f847a01df`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://commercial.appliancesonline.com.au/manuals/ak/b/5/7/e/b57e4730d952fa76093dfb152bc519c36d67fd23_Electrolux_EDV705H3WC_Factsheet.pdf>, <https://commercial.appliancesonline.com.au/manuals/ak/d/7/e/2/d7e29d214f2e4ae675965724e2bfae2f462549a0_Electrolux_EDV605H3WC_Factsheet.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 795 \| Total width (mm) 600 \| Total depth (mm) 600 | p.3, `e9a45e5b13e3` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 795 \| Total width (mm) 560 \| Total depth (mm) 600 | p.3, `3c4199a6c327` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 5: Pack Dimensions Height (mm) 845 Pack Dimension Width (mm) 625 Pack Dimension Depth (mm) 635
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 5: Pack Dimensions Height (mm) 845 Pack Dimension Width (mm) 625 Pack Dimension Depth (mm) 595

### Esatto

- Raw brand variants: `Esatto`
- Inventory models: 56
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### EURO

- Raw brand variants: `EURO`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Euroclean

- Raw brand variants: `Euroclean`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Euromaid

- Raw brand variants: `Euromaid`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Eurotech

- Raw brand variants: `Eurotech`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### EVOKE

- Raw brand variants: `EVOKE`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Fisher & Paykel

- Raw brand variants: `Fisher & Paykel`
- Inventory models: 69
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 32
- Proven marketing series: 1; total series count: `PROVEN_MINIMUM_ONLY`
- PDF grammar profiles: 9

#### Series 5

- Group type: `marketing_series`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `DH8060J5`
- PDF SHA-256: `dd25fc263f162d5fee7e60d1b901347e6a73cab942d36fc268e6aed1401906d5`
- PDF grammar profiles: `pdf_grammar_9c288f61ddf36903`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/r8cg2m5xhsz7bm5rhbhnjm/FP-PlanningGuide-en-WH8060J5-WH9060J5-DH8060J5-DH9060J5-FabricCare-090005539A-AU-NZ.pdf>
- Series evidence: page 1, `text_list text Series 5 Front Loader Washer \| WH8060J5 \| WH9060J5 text Series 5 Heat Pump Dryer \| DH8060J5 \| DH9060J5`; page 4, `Series 5 Front Loader Washers WH8060J5 8kg Series 5 Front Loader Washer White WH9060J5 9kg Series 5 Front Loader Washer White Series 5 Fr...`

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_DOCUMENT_EXACT_MODEL` | depth | none | `operation_envelope` | Depth with the door open 1167 | p.11, `0ce20a631b97` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_DOCUMENT_EXACT_MODEL` | height | height | `product_closed_candidate` | Overall height 850 | p.11, `0ce20a631b97` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | Overall height 850 | p.12, `3464d5a04541` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_DOCUMENT_EXACT_MODEL` | height | height | `product_closed_candidate` | Overall height 104 | p.13, `e760583d2f75` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 15: PRODUCT DIMENSIONS mm A Overall products widthWasher, Dryer and Stacking Kit 602 B Overall product heightWasher, Dryer and Stacking Kit 1720 © Overall produc...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 17: Product Dimensions mm Maximum standpipe or tub height 1000 With storage plinth 1200 ③Minimum standpipe or tub height 600 With storage plinth 800 ©Maximum dis...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 18: Product Dimensions mm )Maximum standpipe or tub height 1000 With storage plinth 1200 ③Minimum standpipe or tub height 600 With storage plinth 800 ©Maximum di...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 19: Product Dimensions mm Maximum standpipe or tub height 1000 with storage plinth 1200 ⑥Minimum standpipe or tub height 600 with storage plinth 800 © Maximum di...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 20: Product Dimensions mm Maximum standpipe or tub height 1000 with storage plinth 1200 BMinimum standpipe or tub height 600 with storage plinth 800 ©Maximum dis...
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 8
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 9: mp Dryer, White DH9060J5 9kg Heat Pump Dryer, White Product Dimensions H 850mm W 60 2mm D 682mm Electrical Supply 220-240 V, 50 Hz Service 10 A Connection 3-...

#### DH1060DG5

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `DH1060DG5`
- PDF SHA-256: `908f0d5cef1cf07e97a94ee13068183954549e23f0e7269a6a79d7fb329b4920`
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw09738459/QRG/AU/QRG-AU-93327.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: mbling Full reverse tumbling TangleProtect Time dry Product dimensions 682 mm Depth Height 850 mm Width 602 mm SKU 93327

#### DH1060RG5

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `DH1060RG5`
- PDF SHA-256: `452ff6fe366e6a827c2757586bb853e7b939a989f37740b3a6a99928f859ca31`, `6b2b1ce975bdcc87c3e1e4383dd7181ffed51ca0caac9ae26a979c569ac4f4c1`, `b0eaf866cfe90a7a77b8e55dd69455447981856437ff55523f90fbffc91193f6`, `b6738a0603e775c279dc0193de009f84b927b054b4256bed7fb152c879f781b7`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/8z9fcq99brrtgnk33bt9ct6/FP-InstallGuide-en-DH8060J-DH9060J-DH8060P-DH1060P-DH1060R-DH1060T-DH1060MZB-DH1060H-DH1060Y-DH1060D-DH1060DG-DH9060DG-Dryer-0-432975A-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/bhjphqshwx5xtn2ncxhcgspj/FP-PerformanceGuide-en-DH80J5-DH90J5-DH80P5-DH80PG5-DH10P5-DH10PG5-DH10R5-DH10RG5-DH10T5-DH10TG5-DH10MZB5-DH10H5-DH10HG5-DH10HL5-DH10YZB5-DH10YLZB5-DH10D5-DH10HLG5-DH90D5-DH10DG5-DH90DG5-HeatPumpDryer-0-433723A-N.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/jq2gmj67gjhwnhc696gnqm2b/FP-UserGuide-en-DH1060R5-DH1060RG5-HeatPumpDryer-0-432966A-NZ-AU.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw4fd4ee55/QRG/AU/QRG-AU-93309.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwb178c40f/QRG/AU/QRG-AU-93309.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

#### DH8060J5

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `DH8060J5`
- PDF SHA-256: `dc5bddc2c1c6898d70159e5a2334c483c5e949a115c130eeaeb1fc7b710b733f`, `ead91d881c1389e738e87fc0315bcaa12c9f4ebbf0e06432ac47ca50b9223314`, `ee04c28502ccadb1dba097f69a2223ccee11985af89904ff117c47211644eedb`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/9527ngqgpf7s9t3r6jqz99vx/FP-UserGuide-en-DH8060J5-DH9060J5-HeatPumpDryer-0-432964A-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/w8x38mjv9mc3wnpt4vghx9f3/FP-InstallGuide-en-DH80-DH90-DH10-WH80-WH90-WH10-WH12-WasherDryerSideBySide-0-432974A-NZ-AU.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw5f84806d/QRG/AU/QRG-AU-93302.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwc96a5614/QRG/AU/QRG-AU-93302.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

#### DH8060P3

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `DH8060P3`
- PDF SHA-256: `2c783a97668f5812f9a6a1429718c6c69c785370ae5e71aa0ab53880ad5557d4`, `df2bbb0d90a5ace08bb335ec4facc163d7245b26cc68d9ce46bcadee16310636`, `fbe70d9dc8bbe306d05175521876b483cdafce4a400cbd91c324749cb233b585`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/s7qjg92b8msrwkptc9nh/FP-UserGuide-DH8060P3-HeatPumpCondensingDryer-AU-NZ-479829A.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/svvvrhqfnbgfknczwkqzr763/FP-InstallGuide-DH8060P3-HeatPumpCondensingDryer-AU-NZ-479829A.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/xfsc99shp9b9xgb8nwwjq7f/FP-PerformanceGuide-en-DH8060C-DH8060P1-DH8060P2-DH8060P3-DH9060C-DH9060FS1-DH9060FSG1-DH9060H1-DH9060HG1-DH9060HL1-DH9060HLG1-DH9060P1-DH9060P2-DH9060PG2-Heat_Pump_Dryer-0-433129B.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw8cd42baa/QRG/AU/QRG-AU-93281.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 9: PRODUCT DIMENSIONS MM AOverall height of product* 845 BOverall width of product 595 ©Overall depth of product 650 Length of drain hose 1300 MINIMUM CLEARANCE...

#### DH9060FS1

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `DH9060FS1`
- PDF SHA-256: `16d655edffcaafb9645cf9e3b43235b45491e34a56c4ed44560f55b1588ffd80`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/gwrjctmq9gg936bq9j4ncn/FP-UserGuide-en-DH9060FS-HeatPumpClothesDryer-0-428277C-NZ-AU.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### DH9060HG1

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `DH9060HG1`
- PDF SHA-256: `ae50220570b061547ab1366d4fcf10647dfb4435ca3704e9941039b0d19de2c1`, `c652263ff5366b957422eb10db916f719d34dfb2673722074068ade820fc8cd9`, `e4ef91be1c8a7543ed6b33f1ae377ecf54d4875d9538247bb0e9404cf0915bb8`, `fabd150e7826a63eb9696447a6956cbe39c49878d3b479208c7fb22b130d8db7`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/gz9jpn3385kb2tjrf28365v/FP-InstallGuide-en-WH1160HG1-WH1160H1-DH9060HG1-DH9060H1-DH9060HLG1-DH9060HL1-FC1260HG1-FC1260H1-FM2060SG1-FM2060S1-FabricCareSolution-0-431988A-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/pwrw8968tkc65vr27vhmj5r/FP-UserGuide-en-DH9060HG1-DH9060H1-HeatPumpDryer-0-431279A-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/xmtm2gcqjhrsfcw6srw4vb77/FP-InstallGuide-en-DH9060HG1-DH9060H1-HeatPumpDryer-0-431188A-NZ-AU.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw966cf444/QRG/AU/QRG-AU-93296.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 3: Product dimensions Depth 655 mm 850 mm Height Width 600 mm Refresh By Steam Delicate Refresh Mixed Refresh Sanitise Refresh • Shirts Refresh SKU 93296

#### DH9060HLG1

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `DH9060HLG1`
- PDF SHA-256: `55aa96e39e2b32ea32953bd6863df9572352c69d0674f08376ba380d88a01e57`, `5bce77eed2510344ed24d3a7c2597d94e30829e075b8af4e3d6d11f0ff9d7806`, `8d5336cca4a716944a6725915535cd73e9f56f8e265f03be78d79a13158df392`, `e0ee3c93f4775f82d2a77a7214de74a55932d3837df81de23e67c28ca299ef1f`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/5qjfs8gg5hpv4pvvb8vkhs3/FP-UserGuide-en-WH1160HG1-WH1160H-DH9060HLG1-DH9060HL1-FabricCareSolutions-MultiProductSetup-431281A-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/mfb9n86kqfmj73n72w5hjn9w/FP-InstallGuide-en-WH1160HG1-WH1160H1-DH9060HG1-DH9060H1-DH9060HLG1-DH9060HL1-FC1260HG1-FC1260H1-FM2060SG1-FM2060S1-FabricCareSolution-0-431190A-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/xnbztbpgkjcbrrmh2jqqfprz/FP-InstallGuide-en-DH9060HG1-DH9060H1-DH9060HLG1-DH9060HL1-FM2060SG1-FM2060S1-FabricCareSolution-0-431987A-NZ-AU.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw69956652/QRG/AU/QRG-AU-93295.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 3

#### DH9060PG2

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `DH9060PG2`
- PDF SHA-256: `edd03091ae4db5b544671bc2244c92bde287856e05786451cabbf3fe3aba7b02`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/pn862csjsnmr27cwmgrfqv/FP-UserGuide-en-DH9060P2-DH9060PG2-HeatPumpClothesDryer-0-428315C-NZ-AU-SG.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### PDF grammar pdf_grammar_2358d2487e9939bc

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `DE6060M2`, `DE7060P2`
- PDF SHA-256: `75e03fc6624c94dc685ebc2d35fb88ce4ff4407882cef8d4ba202fa94a0018e3`, `b35f817f7e6e5d2a75e0f5c31c985519f346e998a60f9efd9e378a9796af8b4a`
- PDF grammar profiles: `pdf_grammar_2358d2487e9939bc`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw19265157/QRG/AU/QRG-AU-93275.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwac9dda29/QRG/AU/QRG-AU-92277.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 600 mm | p.1, `6252b6ef7a8f` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 575 mm \| Height 830 mm \| Width 600 mm | p.2, `e823e7d283d9` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 580 mm | p.1, `ac85c1030734` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | Height 830 mm | p.1, `83c473306ff0` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 600 mm | p.1, `51a8b9831d77` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 580 mm \| Height 830 mm \| Width 600 mm | p.2, `77ea89db5207` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 575 mm | p.1, `1f2ef617950b` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | Height 830 mm | p.1, `83c473306ff0` |

#### PDF grammar pdf_grammar_402a90fdb3f4b2e4

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `DE7060G2`
- PDF SHA-256: `d669580695342bc85672ec86387c464744f7dfc696489ce367f516746ea0f8fe`
- PDF grammar profiles: `pdf_grammar_402a90fdb3f4b2e4`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwcee94f3f/QRG/AU/QRG-AU-92278.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height | depth, height | `product_closed_candidate` | Depth 575 mm \| Height 830 mm | p.2, `5d3482a91e83` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 575 mm | p.1, `24f57f4e966e` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | Height 830 mm | p.1, `8efdac97aa56` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 600 mm | p.1, `0f15b86057b7` |

#### PDF grammar pdf_grammar_5233c9ae76c1bf1f

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `DE5060**`
- PDF SHA-256: `655000d5cdd7df90b61a9921234c194fb5abd3100b634b8873f2c425b8b176b5`
- PDF grammar profiles: `pdf_grammar_5233c9ae76c1bf1f`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw556b2a32/QRG/AU/QRG-AU-93277.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_SCOPE_REQUIRED` | `INDIVIDUALLY_LABELLED_AXES` | `DOCUMENT_IDENTITY_ONLY` | depth -> height -> width | none | `product_closed_candidate` | Depth 600 mm \| Height 830 mm \| Width 600 mm | p.2, `5d085010f66b` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

#### PDF grammar pdf_grammar_65858e1594a8f17d

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `DE7060G2`
- PDF SHA-256: `946474b05d948e38b249b02738e68a2faf853525dee9df07de3e372a98ed5101`
- PDF grammar profiles: `pdf_grammar_65858e1594a8f17d`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/74mzqwj6v2m9kn6kcm2bpz/FP-UserGuide-en-DE7060P-DE7060G-VentedDryer-0-428108K-NZ-AU.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_SCOPE_REQUIRED` | `INDIVIDUALLY_LABELLED_AXES` | `DOCUMENT_IDENTITY_ONLY` | width -> depth -> height | none | `product_closed_candidate` | Width 600 \| Depth 571 \| Height 825 | p.17, `9573fba9035c` |

#### PDF grammar pdf_grammar_7e33a76b59add102

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `DH9060HLG1`
- PDF SHA-256: `e44af57e0a028a1a4b7196e4a4c3468356d7d6c8b068b43c7a3a33afa8881f12`
- PDF grammar profiles: `pdf_grammar_7e33a76b59add102`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/jn6mn73ztw5wpbgq7c6mq96/90003059D-FP-PlanningGuide-en-FC1260HG1-FC1260H1_-WH1160HG1-WH1160H1-DH9060HG1-DH9060H1-DH9060HLG1-DH9060HL1-Laundry-0-90003059D-NZ-AU-CN.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_DOCUMENT_EXACT_MODEL` | height | height | `product_closed_candidate` | Overall height 200 | p.18, `fc32b2d09f0e` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_DOCUMENT_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Overall depth 700 | p.28, `2761eede59dc` |
| `RESEARCH_UNIT_MISSING` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_DOCUMENT_EXACT_MODEL` | width | none | `product_closed_candidate` | Overall width 624 | p.10, `f1bda7c57d36` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_DOCUMENT_EXACT_MODEL` | height | height | `product_closed_candidate` | Overall height 1900 | p.17, `9dcfb4ada338` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_DOCUMENT_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Overall depth 700 | p.29, `9f4b115e45c7` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 11: Model No. DH9060HL1,DH9060HLG11 Dimensions H 850mm W 600mm D 655mm Weight 53kg Electrical Supply 220-240V,50Hz Service 10 Amps Outlet 3-prong grounding-type ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 12: Model No. FC1260HG1, FC1260H1 Dimensions H 1900mm W 600mm D 700mm Weight 130kg Electrical Supply 220-240V,50Hz Service 10 Amps Outlet 3-prong grounding-type
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 14: Product Dimensions mm Overall height* 850 BOverall width 600 ©Overall depth 665 DDepth with the door open 1080 EDoor clearance to adjacent wall min 355 F Hei...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 15: Product Dimensions mm Overall height* 850 BOverall width 600 COverall depth 655 ⑥ Depth with the door open 1080 EDoor clearance to adjacent wall** min 344 F ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 16: Product Dimensions mm Overall height* 850 B Overall width 600 C Overall depth 665 ⑥ Depth with the door open 1080 E Door clearance to adjacent wall** min 344...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 26: Product Dimensions mm AOverall width Washer, Dryer and Stacking Kit 600 BOverall height Washer, Dryer and Stacking Kit 1730 ©Overall depth Washer, Dryer and ...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 27: Product Dimensions mm AOverall width Washer, Dryer, Plinth and Stacking Kit 600 BOverall height Washer, Dryer, Plinth and Stacking Kit 1900 COverall depth Wa...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 30: Product Dimensions mm Overall width Washer, Dryer, Plinth,Stacking Kit and FabricCare Cabinet 1220 ⑥ Overall height Washer, Dryer, Plinth,Stacking Kit and Fa...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 31: Product Dimensions mm Overall width Washer, Dryer, Plinth,Stacking Kit and 2x FabricCare Cabinets 1840 B Overall height Washer, Dryer, Plinth,Stacking Kit an...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 36: Product Dimensions mm ④Maximum standpipe or tub height 1000 With storage plinth 1200 BMinimum standpipe or tub height 600 With storage plinth 800 ©Maximum di...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 37: Product Dimensions mm ④Maximum standpipe or tub height 1000 with storage plinth 1200 BMinimum standpipe or tub height 600 with storage plinth 800 ©Maximum di...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 38: Product Dimensions mm Maximum power cord length from power outlet 1400 ⑥Maximum communication cable length between products 1300
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 39: Product Dimensions mm ④Maximum standpipe or tub height 1000 with storage plinth 1200 BMinimum standpipe or tub height 600 with storage plinth 800 ©Maximum di...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 40: Product Dimensions mm AMaximum power cord length from power outlet 1400 BMaximum power cord length from power outlet 1400 CMaximum power cord length from pow...
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 41: Product Dimensions mm Maximum standpipe or tub height 1000 with storage plinth 1200 BMinimum standpipe or tub height 600 with storage plinth 800 ©Maximum dis...
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 42
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 9: Model No. WH116OH1, WH116OHG1 Dimensions H 850mm W 600mm D 665mm Weight 82kg Electrical Supply 220-240V,50Hz Service 10 Amps Outlet 3-prong grounding-type Pl...

#### PDF grammar pdf_grammar_8bf6595e68db3b0a

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `DH9060PG2`
- PDF SHA-256: `2b06660ee04d550ec67bb788603d133b64b55e3aa47caf2d9ce0d26964596f81`
- PDF grammar profiles: `pdf_grammar_8bf6595e68db3b0a`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw203770c9/QRG/AU/QRG-AU-93289.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 850 mm \| Width 600 mm \| Depth 670 mm | p.1, `359ef59f4387` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 2

#### PDF grammar pdf_grammar_8d500b3f80c31fe9

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `DH8060P5`, `DH9060FS1`
- PDF SHA-256: `3acdeb48d01472efc819a93b7f7d81a659acd3ac38f6ddd9f9cd4dd57ef49a05`, `eb728821fc93ca4ba5dedadbad827ab9c7dbc744bd3ce6c2bec0ef848793c9d1`
- PDF grammar profiles: `pdf_grammar_8d500b3f80c31fe9`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw638d352c/QRG/AU/QRG-AU-93304.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwf305af4c/QRG/AU/QRG-AU-93283.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 682 mm \| Height 850 mm \| Width 602 mm | p.2, `973ce368af55` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 670 mm \| Height 850 mm \| Width 600 mm | p.2, `82a0adb19cf0` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

#### PDF grammar pdf_grammar_d1578622bfaec937

- Group type: `parser_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `DH9060H1`
- PDF SHA-256: `c7375afcae85282b37fb59daeb237e6d74844a6d16586f04d1e6fe81a6d75a98`
- PDF grammar profiles: `pdf_grammar_d1578622bfaec937`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw8e5cecb9/QRG/AU/QRG-AU-92293.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 600 mm | p.3, `4faec25320ba` |

### FUJIYAMA

- Raw brand variants: `FUJIYAMA`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### GAGGENAU

- Raw brand variants: `GAGGENAU`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Germanica

- Raw brand variants: `Germanica`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Hafele

- Raw brand variants: `Hafele`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Haier

- Raw brand variants: `Haier`
- Inventory models: 43
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Hisense

- Raw brand variants: `Hisense`
- Inventory models: 14
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Hitachi

- Raw brand variants: `Hitachi`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### HOOVER

- Raw brand variants: `HOOVER`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Inalto

- Raw brand variants: `Inalto`
- Inventory models: 19
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Kogan

- Raw brand variants: `Kogan`
- Inventory models: 68
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### LG

- Raw brand variants: `LG`
- Inventory models: 68
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 3
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 1

#### Document family 2fe3cc8c8972

- Group type: `document_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `DVH5-08W`, `DVH9-09B`, `DVH9-09W`
- PDF SHA-256: `2fe3cc8c897293245b4667f18c487ea2ec0f1cde687f361701b6790da7d2bee1`
- PDF grammar profiles: `pdf_grammar_bf4902a9bcd6139b`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=pUof6XKiAKggTDi5Im6WeA>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_PARTIAL_REJECT_AMBIGUOUS_DEPTH` | `ALTERNATING_AXIS_VALUE_CELLS` | `SAME_DOCUMENT_EXACT_MODEL` | width -> depth -> depth -> height -> depth | width, height | `product_closed_candidate` | Dimension(mm) W 600 D 690 D" 1115 H 850 D' 615 | p.10, `e3eb08ce7c85` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 14

#### PDF grammar pdf_grammar_bf4902a9bcd6139b

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `DVH1-08WP`, `DVH10-10B`
- PDF SHA-256: `22c0a224a7a41de6589acfd7ae69cfb5d2b2e531eb0058dfb1ab7e6a3bcd3957`, `521077b559417d620664ead6be32ee1738e575ae50a7ffb3734b3fc24458d462`
- PDF grammar profiles: `pdf_grammar_bf4902a9bcd6139b`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=l3ZnOgt0HYfuYHxXjG8Fw>, <https://gscs-b2c.lge.com/open/downloadFile?fileId=qBtD6KGnaeJRgOsUCABlvQ>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_PARTIAL_REJECT_AMBIGUOUS_DEPTH` | `ALTERNATING_AXIS_VALUE_CELLS` | `SAME_PAGE_EXACT_MODEL` | width -> depth -> depth -> height -> depth | width, height | `product_closed_candidate` | Dimension(mm) W 600 D 690 D" 1115 H 850 D' 615 | p.10, `e3eb08ce7c85` |
| `SUPPORTED_PARTIAL_REJECT_AMBIGUOUS_DEPTH` | `ALTERNATING_AXIS_VALUE_CELLS` | `SAME_PAGE_EXACT_MODEL` | width -> depth -> depth -> height -> depth | width, height | `product_closed_candidate` | Dimension(mm) W 600 D 660 D" 1115 H 850 D' 614 | p.12, `14c5e7f03d58` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 13
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 15

### majestic

- Raw brand variants: `majestic`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Midea

- Raw brand variants: `Midea`
- Inventory models: 15
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Miele

- Raw brand variants: `Miele`
- Inventory models: 49
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Mistral

- Raw brand variants: `Mistral`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Mykin

- Raw brand variants: `Mykin`
- Inventory models: 15
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Norj

- Raw brand variants: `Norj`
- Inventory models: 7
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Omega

- Raw brand variants: `Omega`
- Inventory models: 17
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### ONIX

- Raw brand variants: `ONIX`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### OSVO

- Raw brand variants: `OSVO`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### PARMCO

- Raw brand variants: `PARMCO`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Platinum

- Raw brand variants: `Platinum`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Prinetti

- Raw brand variants: `Prinetti`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Robinhood

- Raw brand variants: `Robinhood`
- Inventory models: 7
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Samsung

- Raw brand variants: `Samsung`
- Inventory models: 12
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 1
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

#### Document family d5682f81974d

- Group type: `document_family`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `DV90BB9440GB`, `DV90BB9440GH`
- PDF SHA-256: `d5682f81974da77f17d2db44b6192ec3b897c9f889a7ac7ef0baa18747c23741`
- Official/source URLs: <https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_AU&OriginYN=N&ModelType=N&ModelName=DV90BB9440GB&CttFileID=9157242&CDCttType=UM&VPath=UM%2F202304%2F20230425115323308%2FDC68-04400M-00_IB_B-PJT_DV9400B_SimpleUX_EN_pdf.pdf>, <https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_AU&OriginYN=N&ModelType=N&ModelName=DV90BB9440GH&CttFileID=9157242&CDCttType=UM&VPath=UM%2F202304%2F20230425115323308%2FDC68-04400M-00_IB_B-PJT_DV9400B_SimpleUX_EN_pdf.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 55: PE FRONT LOADING DRYER MODEL NAME DV9*BB94**** DV9*BB74**** DIMENSIONS A 600 mm 600 mm B 850 mm 850 mm C 600 mm 600 mm D 650 mm 650 mm E 1100 mm 1100 mm WEIG...

### SAMSUNG ELECTRONICS

- Raw brand variants: `SAMSUNG ELECTRONICS`
- Inventory models: 26
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SEIKI

- Raw brand variants: `SEIKI`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SHARP

- Raw brand variants: `SHARP`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Sheffield

- Raw brand variants: `Sheffield`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SHOME I SEIKI

- Raw brand variants: `SHOME I SEIKI`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SIEMENS

- Raw brand variants: `SIEMENS`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SIMPSON

- Raw brand variants: `SIMPSON`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Smeg

- Raw brand variants: `Smeg`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Solt

- Raw brand variants: `Solt`
- Inventory models: 35
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SPEED QUEEN

- Raw brand variants: `SPEED QUEEN`, `Speed Queen`
- Inventory models: 18
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Stirling

- Raw brand variants: `Stirling`
- Inventory models: 12
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### TCL

- Raw brand variants: `TCL`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Technika

- Raw brand variants: `Technika`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Teka

- Raw brand variants: `Teka`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### TELEFUNKEN

- Raw brand variants: `TELEFUNKEN`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Toshiba

- Raw brand variants: `Toshiba`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Tuscany

- Raw brand variants: `Tuscany`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### VOGUE

- Raw brand variants: `VOGUE`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Westinghouse

- Raw brand variants: `Westinghouse`
- Inventory models: 17
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 1
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 1

#### PDF grammar pdf_grammar_8eb9ae3a8581b2b4

- Group type: `parser_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `WDV457H3WB`
- PDF SHA-256: `bb4765aed8b51db365365a2352cbf797538c662442e1400ca6d38b19feacd1f5`
- PDF grammar profiles: `pdf_grammar_8eb9ae3a8581b2b4`
- Reuse boundary: syntax reuse only; model identity, values and field semantics must be proven again for every PDF.
- Official/source URLs: <https://www.appliancesonline.com.au/ak/1/c/f/6/1cf68b28d8b60a42560ce0587728fe2b3f8e9e7b_WDV457H3WB_Westinghouse_Specifications_Sheet.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 795 \| Total width (mm) 600 \| Total depth (mm) 520 | p.3, `85920484bee5` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 4: Shipping Volume (m3) 0.293 Shipping Weight (Kg) 26.6 Pack Dimensions Height (mm) 845 Pack Dimension Width (mm) 625 Pack Dimension Depth (mm) 555
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 5: These dimensions are a guide only. All measurements are in millimetres (mm). For complete installation instructions, refer to the manual provided with product

### WHIRLPOOL

- Raw brand variants: `WHIRLPOOL`, `Whirlpool`
- Inventory models: 13
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Winia

- Raw brand variants: `Winia`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### yokohama

- Raw brand variants: `yokohama`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`
- PDF grammar profiles: 0

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

## Unmapped MinerU Documents

These documents remain in coverage accounting but cannot be assigned to a brand, category or series.

| PDF SHA-256 | Mapping status | Sources |
| --- | --- | --- |
| `21ff130ee8811d8b9b475b0687b9e636140fb1a1f007a110211647a43d273da3` | `UNMAPPED_SOURCE_PDF` | unknown |
| `32a4aff96986090c9eac5a45c55f5856ae4a88fc49b6b013d664416681d1a5ee` | `UNMAPPED_SOURCE_PDF` | unknown |
| `372f69cf9eac9fc0695fa9c3cb054f5375a546126220fadaee130d48963cbbf5` | `UNMAPPED_SOURCE_PDF` | unknown |
| `459a7a142a4637f03d2e7a695a5c9a277d0bfdb45a38550dcb01b29a7569fc48` | `UNMAPPED_SOURCE_PDF` | unknown |
| `5abb65a48d029999cd55c8a5f2c2672a4ac9d66ae5d1feb83ec58bed50c2ce99` | `UNMAPPED_SOURCE_PDF` | unknown |
| `742e6a82d96b085b5060bde11a1a4d6d18cacfa0f60e712b8bbf5d724ae5d205` | `UNMAPPED_SOURCE_PDF` | unknown |
| `7f64674ff156b4018b60e9b2ac30f4f64b72542f0769a6b65845b80d9830811b` | `UNMAPPED_SOURCE_PDF` | unknown |
| `a8721a1d33ab03917b66285548fc496136ca5c3caa28b1f46a0899e108f94c06` | `UNMAPPED_SOURCE_PDF` | unknown |
| `baab65e8c66c7c30a0bd4238dab524a9c4aed38934b82ce2551b83db76b703d1` | `UNMAPPED_SOURCE_PDF` | unknown |
| `d1b06298dcc262b6b6019f04076a88a0cc96529e7ff60776e3194456a500f39a` | `UNMAPPED_SOURCE_PDF` | unknown |
| `eeca4528ae36bc5317c225b56abfc70c8a95a677ebf26ebfd47b5f6433eb5062` | `UNMAPPED_SOURCE_PDF` | unknown |
| `f75c0981fd9bd9ffe8796d70536e6153d7cfb68f8381050d6cf2288460f10402` | `UNMAPPED_SOURCE_PDF` | unknown |

## Invalid or Orphaned MinerU Documents

These indexes remain in total coverage accounting but their derived content is excluded from all expression, brand-family and parser research.

| PDF SHA-256 | Reason | Mapping | Intended identities | Sources |
| --- | --- | --- | --- | --- |
| `0c4a4d7124ff9c41a18fc538a0a65c2cc5ef68bea37effab0def3993ee41cbfe` | `ORPHANED_SOURCE_PDF` | `UNMAPPED_SOURCE_PDF` | unknown | unknown |

