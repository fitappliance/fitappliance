# Appliance Dimension Expression Knowledge Base

Generated: 2026-07-13T14:00:00.000Z

> This is a non-authoritative research sidecar. Brand, category, series and
> document-family patterns must not authorise model claims, resolve ambiguous
> axes, or bypass exact-model source verification and receipts.

## Coverage

| Metric | Count |
| --- | ---: |
| Historical records | 8095 |
| Categories | 4 |
| Category-brand groups | 358 |
| MinerU documents | 82 |
| Valid MinerU documents | 81 |
| Invalid or orphaned MinerU documents | 1 |
| Documents with recognised expressions | 65 |
| Documents without recognised expressions | 16 |
| Mapped MinerU documents | 69 |
| Unmapped MinerU documents | 12 |
| Dimension-expression observations | 157 |
| Research gaps | 53 |

A marketing-series count is a proven minimum, never an estimate of the
manufacturer's complete range. `UNKNOWN` is intentional when official text
does not bind an exact model to a named series.

## How to Use

1. Start with the appliance category and canonical brand; retain the listed raw brand variants for matching.
2. Prefer an officially proven marketing series. Otherwise treat a document family or model-specific group only as a research scope.
3. Match the observed pattern, parser decision and model-binding level. Never copy a value from the pattern into product geometry.
4. Re-run exact-model source verification, MinerU hash checks and receipt generation before any claim or publication change.

Regenerate explicitly with:

```sh
node scripts/architecture-v2/build-dimension-expression-knowledge.mjs \
  --storage-root "$FITAPPLIANCE_STORAGE_ROOT" \
  --generated-at <ISO-8601 timestamp>
```

This command is intentionally outside the normal build and publication graph.

## Observed Pattern Taxonomy

| Pattern | Unique observations | Meaning |
| --- | ---: | --- |
| `ALTERNATING_AXIS_VALUE_CELLS` | 5 | Diagram table alternating axis tokens and values, including D variants. |
| `GROUPED_AXIS_SEQUENCE` | 14 | Explicit axis order followed by one three-value sequence. |
| `GROUPED_AXIS_SEQUENCE_WITH_VARIANT` | 7 | Explicit three-axis sequence plus a qualified alternative depth. |
| `INDIVIDUAL_LABELLED_AXIS` | 33 | One named axis/value pair; combine only through independently proven model scope. |
| `INDIVIDUALLY_LABELLED_AXES` | 35 | Two or more dimensions expressed as separate named axis/value pairs. |
| `LETTERED_EXPLICIT_AXIS_LIST` | 2 | Diagram letters explicitly map to axis names and values. |
| `MODEL_COLUMN_DIMENSION_MATRIX` | 1 | Models occupy columns and dimension axes occupy rows. |
| `MODEL_ROW_DIMENSION_MATRIX` | 27 | Models occupy rows and dimension axes occupy columns. |
| `UNLABELLED_DIMENSION_TRIPLE` | 3 | Three values are present without a stated axis order. |

| Parser decision | Unique observations |
| --- | ---: |
| `REJECTED_NON_PRODUCT_SCOPE` | 12 |
| `RESEARCH_ADJUSTABLE_RANGE` | 8 |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | 22 |
| `RESEARCH_MODEL_SCOPE_REQUIRED` | 6 |
| `RESEARCH_MULTIPLE_VALUES_PER_AXIS` | 2 |
| `RESEARCH_UNIT_MISSING` | 2 |
| `RESEARCH_UNLABELLED_AXIS_ORDER` | 3 |
| `SUPPORTED_EXACT_MODEL_COLUMN_MATRIX` | 1 |
| `SUPPORTED_EXACT_MODEL_ROW_MATRIX` | 1 |
| `SUPPORTED_EXPLICIT_GROUPED` | 8 |
| `SUPPORTED_EXPLICIT_LABELS` | 48 |
| `SUPPORTED_PARTIAL_REJECT_AMBIGUOUS_AXIS_COLUMNS` | 2 |
| `SUPPORTED_PARTIAL_REJECT_AMBIGUOUS_DEPTH` | 5 |
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

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Airflo

- Raw brand variants: `Airflo`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### AKAI

- Raw brand variants: `AKAI`
- Inventory models: 9
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Altus

- Raw brand variants: `Altus`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Anko

- Raw brand variants: `Anko`
- Inventory models: 8
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### ARTIC

- Raw brand variants: `ARTIC`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Artusi

- Raw brand variants: `Artusi`
- Inventory models: 27
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### AUCMA

- Raw brand variants: `AUCMA`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Beko

- Raw brand variants: `BEKO`, `Beko`
- Inventory models: 51
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Bellini

- Raw brand variants: `Bellini`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Bertazzoni

- Raw brand variants: `Bertazzoni`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Blaupunkt

- Raw brand variants: `Blaupunkt`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Bosch

- Raw brand variants: `BOSCH`, `Bosch`
- Inventory models: 19
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 1
- Proven marketing series: 1; total series count: `PROVEN_MINIMUM_ONLY`

#### Series 6

- Group type: `marketing_series`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `KFD96AXEAA`
- PDF SHA-256: `e974d1e890e7411358f1dff86fabb6f9bba2f4b89340062e20e596f1a645f43c`
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

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### BROMIC

- Raw brand variants: `BROMIC`
- Inventory models: 9
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### CASA

- Raw brand variants: `CASA`
- Inventory models: 20
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### CHIQ

- Raw brand variants: `CHIQ`
- Inventory models: 251
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Coldstream

- Raw brand variants: `Coldstream`
- Inventory models: 14
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Crossray Infrared BBQ

- Raw brand variants: `Crossray Infrared BBQ`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### De Dietrich

- Raw brand variants: `De Dietrich`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Devanti

- Raw brand variants: `Devanti`
- Inventory models: 33
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Dometic

- Raw brand variants: `Dometic`
- Inventory models: 24
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Electrolux

- Raw brand variants: `Electrolux`
- Inventory models: 79
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Esatto

- Raw brand variants: `Esatto`
- Inventory models: 84
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### EURO

- Raw brand variants: `EURO`
- Inventory models: 12
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Euromaid

- Raw brand variants: `Euromaid`
- Inventory models: 25
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### EUROMATIC

- Raw brand variants: `EUROMATIC`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Eurotech

- Raw brand variants: `Eurotech`
- Inventory models: 32
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Fhiaba

- Raw brand variants: `Fhiaba`
- Inventory models: 365
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Fisher & Paykel

- Raw brand variants: `Fisher & Paykel`
- Inventory models: 263
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 5
- Proven marketing series: 0; total series count: `UNKNOWN`

#### Document family b5ff35773bed

- Group type: `document_family`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `RF610ADUQSX4`, `RF610ADUSX5`
- PDF SHA-256: `b5ff35773bed6d1f8434e83314bfe7cfd4e812b0be852ac686c7d000c5171af8`
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw0301a71d/QRG/AU/QRG-AU-26493.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

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

#### RF522ADUSX5

- Group type: `model_specific`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `RF522ADUSX5`
- PDF SHA-256: `fdfd4107f7caa241eb3c29668296780378b5db639ab04bb5e44f408c9ed17ef4`
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw8b42e8ee/QRG/AU/QRG-AU-26404.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MULTIPLE_VALUES_PER_AXIS` | `INDIVIDUALLY_LABELLED_AXES` | `DOCUMENT_IDENTITY_ONLY` | depth -> depth -> height -> width | height, width | `product_closed_candidate` | Depth 695 mm \| Depth (including handles) 735 mm \| Height 1715 mm \| Width 790 mm | p.2, `901222ec8b06` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

#### RF605QZUVB1

- Group type: `model_specific`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `RF605QZUVB1`
- PDF SHA-256: `925f6d440b773831f48712de16ca012263b7fac82490875c942b51f498dd7f73`
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw1ff970d5/QRG/AU/QRG-AU-26553.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 688 mm | p.1, `6f7674bf9c18` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | Height 1790 mm | p.1, `4c79edc4764c` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 688 mm \| Height 1790 mm \| Width 905 mm | p.2, `08f70eadb238` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 905 mm | p.1, `2856cf94c5af` |

#### RF610ADX5

- Group type: `model_specific`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `RF610ADX5`
- PDF SHA-256: `ee493062e968e61b7ad60b1c9fd18eae4365edcf1d986d83532aedabbec8285a`
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw16a75371/QRG/AU/QRG-AU-26504.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MULTIPLE_VALUES_PER_AXIS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> depth -> height -> width | height, width | `product_closed_candidate` | Depth 695 mm \| Depth (including handles) 735 mm \| Height 1790 mm \| Width 900 mm | p.2, `fe648841eff7` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

### GAGGENAU

- Raw brand variants: `GAGGENAU`
- Inventory models: 15
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Galanz

- Raw brand variants: `Galanz`
- Inventory models: 8
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Gasmate

- Raw brand variants: `Gasmate`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Germanica

- Raw brand variants: `Germanica`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### GRAM

- Raw brand variants: `GRAM`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Haier

- Raw brand variants: `Haier`
- Inventory models: 219
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 2
- Proven marketing series: 0; total series count: `UNKNOWN`

#### HRF420BS

- Group type: `model_specific`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `HRF420BS`
- PDF SHA-256: `2b772df94084a9af0f268dad20ea21e4e56676d096d5f491428ad4079d84d1f8`
- Official/source URLs: <https://www.haier.com.au/on/demandware.static/-/Sites-haier-master-catalog/default/dwd0f727cb/QRG/AU/QRG-AU-62269.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 675 mm \| Height 1725 mm \| Width 700 mm | p.2, `9be8d89236ce` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 1725 mm \| Width 700 mm \| Depth 675 mm | p.1, `7c46b5f8ee1f` |

#### HRF510BHC

- Group type: `model_specific`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `HRF510BHC`
- PDF SHA-256: `77cf61dc0dc612235257a10763201e8b0950f0611d285bf614fb2d92d2ecc716`
- Official/source URLs: <https://www.haier.com.au/on/demandware.static/-/Sites-haier-master-catalog/default/dw57e105ea/QRG/AU/QRG-AU-62293.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Height 1725 mm \| Width 790 mm \| Depth 707 mm | p.1, `79da59f8cb38` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2: eezer Inverter controlled compressor Multi-Zone Air Product dimensions Depth 707 mm 1725 mm Height Width 790 mm Refrigerator features Adjustable glass shelve...

### Harbour

- Raw brand variants: `Harbour`
- Inventory models: 7
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### HELLER

- Raw brand variants: `HELLER`
- Inventory models: 61
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Hisense

- Raw brand variants: `Hisense`
- Inventory models: 176
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 4
- Proven marketing series: 0; total series count: `UNKNOWN`

#### HRBF126

- Group type: `model_specific`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `HRBF126`
- PDF SHA-256: `6c9b8413e7027756b02248f0ff847320958cf0369fb67b9ce3819d55e2521f94`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HRBF126-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxNDU4NTN8YXBwbGljYXRpb24vcGRmfGFESTNMMmd3TXk4NE9ETXpPREV4TlRjNE9URXdMMGhTUWtZeE1qWXRVM0JsWXk1d1pHWXw4NWU4M2Y1YjExODUyZGRmMjc4ZjdmY2QwOGJkMTE4NjUxOGRjMzA4MWE0ZTQ4MjU1ZjJhZGRjZDhkZGEzYzY3>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | none | `delivery_package` | Dimensions (Packaged) (W X H X D) 498 x 872 x 574 mm | p.1, `51a880442235` |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Dimensions (Net) (W X H X D) 475 x 840 x 556 mm | p.1, `51a880442235` |

#### HRCD640TBW

- Group type: `model_specific`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `HRCD640TBW`
- PDF SHA-256: `ff9c1735a4871bc809e0baa42ee366d5780e298a6dedad0ca17dd6ef01e8d667`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HRCD640TBW-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwyNjYzMDR8YXBwbGljYXRpb24vcGRmfGFERm1MMmhsTXk4NE9EQTBNVEF3T0RZMk1EYzRMMGhTUTBRMk5EQlVRbGN0VTNCbFl5NXdaR1l8MGRhNTM3OGQyMDRhMTM4MzA5YmQyMTA0ZTIzZDVjMDNjYzYxMzBhZGMzNmFhNGJlYTYwYTM2MGZiYTRhYmYyMw>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | none | `delivery_package` | Dimensions (Packaged) (W X H X D) 968 x 1896 x 778 mm | p.1, `41baa2bee837` |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Dimensions (Net) (W X H X D) 914 x 1790 x 730 mm | p.1, `41baa2bee837` |

#### HRTF206

- Group type: `model_specific`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `HRTF206`
- PDF SHA-256: `f9439245bffd313d6c3ba841d72eb466ea25172f1108426a1b4f789b5c16b4eb`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HRTF206-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxNDI1MDh8YXBwbGljYXRpb24vcGRmfGFHSTJMMmd3Wmk4NE9EQTBNVEEzTXpVME1UUXlMMGhTVkVZeU1EWXRVM0JsWXk1d1pHWXw5MDY2ZmY5ODYyNWFkNmZmY2NlMjM5Yzg5YzY4YWFmM2RkNGJmYWIwNzhhNmE3YmZkM2UyZTMzYjBmZDU3Nzdi>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | none | `delivery_package` | Dimensions (Packaged) (W X H X D) 581×1508x594 mm | p.1, `05f1ed5146b6` |

#### HRTF325

- Group type: `model_specific`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `HRTF325`
- PDF SHA-256: `4eddd718829ed49e33910d7c4284f5b0ca5ed3bf7341d1460a141945a04412e0`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HRTF325-Spec.pdf?context=bWFzdGVyfG1hbnVhbHwxMzgzOTJ8YXBwbGljYXRpb24vcGRmfGFETTBMMmczWXk4NE9EQTBNRGs0TWpjM05EQTJMMGhTVkVZek1qVXRVM0JsWXk1d1pHWXw5NDkzMGRlMDk4ODc5ZmU0NWMwNDRjYjkxYmE4NWZhODk4ZDY2NmE5ZmFjNmU3Yzk5MjNmNjc4MzdkNjRhYTFh>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Dimensions (Net) (W X H X D) 595×1696x650 mm | p.1, `38030e310723` |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | none | `delivery_package` | Dimensions (Packaged) (W X H X D) 641×1760x686 mm | p.1, `38030e310723` |

### Hitachi

- Raw brand variants: `Hitachi`
- Inventory models: 36
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### HOOVER

- Raw brand variants: `HOOVER`
- Inventory models: 14
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Husky

- Raw brand variants: `Husky`
- Inventory models: 47
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### ICELAND

- Raw brand variants: `ICELAND`
- Inventory models: 13
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Ikea

- Raw brand variants: `Ikea`
- Inventory models: 15
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Ilve

- Raw brand variants: `Ilve`
- Inventory models: 18
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Imprasio

- Raw brand variants: `Imprasio`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Inalto

- Raw brand variants: `Inalto`
- Inventory models: 37
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### KELVINATOR

- Raw brand variants: `KELVINATOR`
- Inventory models: 20
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 1
- Proven marketing series: 0; total series count: `UNKNOWN`

#### KBM5302AC

- Group type: `model_specific`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `KBM5302AC`
- PDF SHA-256: `6197fb9ddb360437f82fcaebaab22e775fab7dd89627a89f56a537d3f589ea7a`
- Official/source URLs: <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=KBM5302AC&brand=Kelvinator>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1718 \| Total width (mm) 796 \| Total depth (mm) 727 | p.3, `836ea07e1e93` |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth | none | `mixed_product_and_operation` | Product Height \| Product Width \| Product Depth \| Product Depth(Door Open) \| KBM5302AC/KBM5302WC \| 30 \| 30 \| 50 \| | p.6, `776efc7202eb` |
| `RESEARCH_UNIT_MISSING` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height \| Product Width \| Product Depth \| Product Depth(Door Open) \| KBM5302AC/KBM5302WC \| 1718 \| 796 \| 727 \| 1457 | p.6, `776efc7202eb` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1705 \| Cabinet width (mm) 790 \| Cabinet depth (mm) 641 | p.3, `836ea07e1e93` |

### Kenmore

- Raw brand variants: `Kenmore`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### KingsBottle

- Raw brand variants: `KingsBottle`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### KLEENMAID

- Raw brand variants: `KLEENMAID`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Kogan

- Raw brand variants: `Kogan`
- Inventory models: 409
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### KOLNER

- Raw brand variants: `KOLNER`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### KONKA

- Raw brand variants: `KONKA`
- Inventory models: 11
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### LG

- Raw brand variants: `LG`
- Inventory models: 207
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 2
- Proven marketing series: 0; total series count: `UNKNOWN`

#### GF-L700PL

- Group type: `model_specific`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `GF-L700PL`
- PDF SHA-256: `e83dbc78ce964e2eea26f81a43d1b4607c24d1ec852baeeb96df9180a5157d25`
- Official/source URLs: <https://www.lg.com/content/dam/channel/wcms/au/pdfs/GF-L700PL_Specsheet_V2_230809_2.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `REJECTED_NON_PRODUCT_SCOPE` | `GROUPED_AXIS_SEQUENCE` | `SAME_PAGE_EXACT_MODEL` | width -> depth -> height | none | `delivery_package` | Packaging (W x D x H) 972mm × 770mm ×1881mm | p.1, `986a59030e80` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width | height, width | `product_closed_candidate` | Height 1792mm \| Width 914mm | p.1, `986a59030e80` |

#### GF-V500MBLC

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `GF-V500MBLC`
- PDF SHA-256: `c40bbeb07ba870f53b5b958b8de46b2327e156b371dd2ff22fbec3411209724e`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=TrD7hKGAvk5a68JgwLfnmg>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 12

### LICENSING ESSENTIALS

- Raw brand variants: `LICENSING ESSENTIALS`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Liebherr

- Raw brand variants: `Liebherr`
- Inventory models: 69
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Linarie

- Raw brand variants: `Linarie`
- Inventory models: 35
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Living & Co

- Raw brand variants: `Living & Co`
- Inventory models: 17
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### majestic

- Raw brand variants: `majestic`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Makita

- Raw brand variants: `Makita`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### meisda

- Raw brand variants: `meisda`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Midea

- Raw brand variants: `Midea`
- Inventory models: 47
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Miele

- Raw brand variants: `Miele`
- Inventory models: 40
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Mistral

- Raw brand variants: `Mistral`
- Inventory models: 20
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Mitsubishi

- Raw brand variants: `Mitsubishi`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### MITSUBISHI ELECTRIC

- Raw brand variants: `MITSUBISHI ELECTRIC`, `Mitsubishi Electric`
- Inventory models: 91
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### modello

- Raw brand variants: `modello`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Mykin

- Raw brand variants: `Mykin`
- Inventory models: 55
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### NAKITA

- Raw brand variants: `NAKITA`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### NCE

- Raw brand variants: `NCE`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### NEFF

- Raw brand variants: `NEFF`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Nero

- Raw brand variants: `Nero`
- Inventory models: 10
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Nisbets Essentials

- Raw brand variants: `Nisbets Essentials`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Norj

- Raw brand variants: `Norj`
- Inventory models: 23
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Novello

- Raw brand variants: `Novello`
- Inventory models: 7
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Nulon

- Raw brand variants: `Nulon`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Omega

- Raw brand variants: `Omega`
- Inventory models: 36
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Panasonic

- Raw brand variants: `Panasonic`
- Inventory models: 13
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### PARMCO

- Raw brand variants: `PARMCO`
- Inventory models: 7
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Polar Refrigeration

- Raw brand variants: `Polar Refrigeration`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Prinetti

- Raw brand variants: `Prinetti`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Pulmuone

- Raw brand variants: `Pulmuone`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### RHINO

- Raw brand variants: `RHINO`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Robinhood

- Raw brand variants: `Robinhood`
- Inventory models: 37
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### RYOBI

- Raw brand variants: `RYOBI`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Samsung

- Raw brand variants: `SAMSUNG`, `Samsung`
- Inventory models: 53
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 1
- Proven marketing series: 0; total series count: `UNKNOWN`

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

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Schmick

- Raw brand variants: `Schmick`
- Inventory models: 13
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SEIKI

- Raw brand variants: `SEIKI`
- Inventory models: 13
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SHARP

- Raw brand variants: `SHARP`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Sheffield

- Raw brand variants: `Sheffield`
- Inventory models: 19
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SHOME I SEIKI

- Raw brand variants: `SHOME I SEIKI`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SIEMENS

- Raw brand variants: `SIEMENS`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Simmons

- Raw brand variants: `Simmons`
- Inventory models: 7
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Smeg

- Raw brand variants: `Smeg`
- Inventory models: 191
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Solt

- Raw brand variants: `Solt`
- Inventory models: 38
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Stirling

- Raw brand variants: `Stirling`
- Inventory models: 13
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Sub-Zero

- Raw brand variants: `Sub-Zero`
- Inventory models: 138
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SUN PACIFIC TRADE

- Raw brand variants: `SUN PACIFIC TRADE`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Supreme

- Raw brand variants: `Supreme`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### TCL

- Raw brand variants: `TCL`
- Inventory models: 62
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### TECO

- Raw brand variants: `TECO`
- Inventory models: 67
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Teka

- Raw brand variants: `Teka`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Thermaster

- Raw brand variants: `Thermaster`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Throne

- Raw brand variants: `Throne`
- Inventory models: 8
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Trade Tested

- Raw brand variants: `Trade Tested`
- Inventory models: 8
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Tuscany

- Raw brand variants: `Tuscany`
- Inventory models: 9
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### V-ZUG

- Raw brand variants: `V-ZUG`
- Inventory models: 10
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Vinopro

- Raw brand variants: `Vinopro`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### VOGUE

- Raw brand variants: `VOGUE`
- Inventory models: 24
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Warrior Refrigeration

- Raw brand variants: `Warrior Refrigeration`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Westinghouse

- Raw brand variants: `Westinghouse`
- Inventory models: 290
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 7
- Proven marketing series: 0; total series count: `UNKNOWN`

#### Document family a792faf4dd33

- Group type: `document_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WHE6874BA`, `WHE6874SA`
- PDF SHA-256: `a792faf4dd337ea4fde2fcd9fa9b4904b7270c227be664765b95176a6ff7979a`
- Official/source URLs: <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WHE6874SA&brand=Westinghouse>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1782 \| Total width (mm) 913 \| Total depth (mm) 803 | p.4, `9f17dff35fa6` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1756 \| Cabinet width (mm) 908 \| Cabinet depth (mm) 625 | p.4, `9f17dff35fa6` |

#### Document family fd329081b852

- Group type: `document_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WTB2300WH`, `WTB2800AH`, `WTB2800WH`, `WTB3400AH`, `WTB3400WH`, `WTB3700**`, `WTB3700WH`
- PDF SHA-256: `fd329081b8523c1a23adf30143d6f3c4c02c0c6726434993770595a8f3290ef6`
- Official/source URLs: <https://resource.electrolux.com.au/Public/File/?Id=51194>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXACT_MODEL_ROW_MATRIX` | `MODEL_ROW_DIMENSION_MATRIX` | `SAME_FRAGMENT_EXACT_MODEL` | height -> width -> depth -> depth | height, width, depth | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WTB2300WH \| 1405 \| 540 \| 615 \| 1108 | p.1, `0a0dd5c2dccf` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WTB2500WH \| 1470 \| 540 \| 615 \| 1108 | p.1, `0a0dd5c2dccf` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WTB3700AH/ WH \| 1755 \| 598 \| 650 \| 1199 | p.1, `0a0dd5c2dccf` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WTB2800AH/WH \| 1605 \| 540 \| 615 \| 1108 | p.1, `0a0dd5c2dccf` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `mixed_product_and_operation` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) (Door Open) \| WTB3400AH/WH \| 1645 \| 598 \| 650 \| 1199 | p.1, `0a0dd5c2dccf` |

#### WHE6874BA

- Group type: `model_specific`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WHE6874BA`
- PDF SHA-256: `148c96022fe394b0ad19d6342fc5bc686ba1671a221cfc80d26e717e221f07dc`
- Official/source URLs: <https://www.appliancesonline.com.au/ak/0/1/9/2/0192e04f906bcc306046551bd4bf2f3a8373e7f2_WHE6874BA_Westinghouse_Specifications_Sheet.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1756 \| Cabinet width (mm) 908 \| Cabinet depth (mm) 625 | p.4, `b2aabcc1e1af` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1782 \| Total width (mm) 913 \| Total depth (mm) 803 | p.4, `b2aabcc1e1af` |

#### WTB2300WH

- Group type: `model_specific`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WTB2300WH`
- PDF SHA-256: `3dd61145ed4f25750ed963d8a0ab0fc06fee0644d1e3d4d9cd065dd1e188497f`
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

#### WTB2800AH

- Group type: `model_specific`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WTB2800AH`
- PDF SHA-256: `f2346bc64c2a7dc568f98a92abdc43eca7394531f3fbd699a55f9eae6341831a`
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

#### WTB2800WH

- Group type: `model_specific`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WTB2800WH`
- PDF SHA-256: `ba1cc555cddd723fe1f94af9dd70a5732e3de3fbdd45076be4ca41d92bb9d787`
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

#### WTB3700WH

- Group type: `model_specific`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WTB3700WH`
- PDF SHA-256: `5c8f1af45db3563e15c154a8d7c1878768a496dee568fd6a236b944a86619c31`
- Official/source URLs: <https://resource.electrolux.com.au/Factsheet/RequestPdf?modelNumber=WTB3700WH&brand=Westinghouse>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB3400AH/WH \| 1645 \| 598 \| 650 \| 1199 | p.8, `c987586519ef` |
| `REJECTED_NON_PRODUCT_SCOPE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | none | `product_body` | Cabinet height (mm) 1740 \| Cabinet width (mm) 595 \| Cabinet depth (mm) 575 | p.4, `b3ad0479c69b` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB2800AH/ WH \| 1605 \| 540 \| 615 \| 1108 | p.8, `c987586519ef` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB2300WH \| 1405 \| 540 \| 615 \| 1108 | p.8, `c987586519ef` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB3700AH/ WH \| 1755 \| 598 \| 650 \| 1199 | p.8, `c987586519ef` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 1755 \| Total width (mm) 598 \| Total depth (mm) 650 | p.4, `b3ad0479c69b` |
| `RESEARCH_MODEL_ROW_BINDING_REQUIRED` | `MODEL_ROW_DIMENSION_MATRIX` | `UNRESOLVED_MODEL_EXPRESSION` | height -> width -> depth -> depth | none | `product_closed_candidate` | Product Height (H) \| Product Width (W) \| Product Depth (D) \| Product Depth (D2) \| WTB2500WH \| 1470 \| 540 \| 615 \| 1108 | p.8, `c987586519ef` |

### WHIRLPOOL

- Raw brand variants: `WHIRLPOOL`, `Whirlpool`
- Inventory models: 25
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### WINTERWULF

- Raw brand variants: `WINTERWULF`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### yokohama

- Raw brand variants: `yokohama`
- Inventory models: 22
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

## Dishwashers

Inventory: 1419 models across 91 category-brand groups.

### AEG

- Raw brand variants: `AEG`
- Inventory models: 15
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Anko

- Raw brand variants: `Anko`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### ARISTON

- Raw brand variants: `ARISTON`
- Inventory models: 9
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Artusi

- Raw brand variants: `Artusi`
- Inventory models: 58
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### ASKO

- Raw brand variants: `ASKO`
- Inventory models: 67
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Astivita

- Raw brand variants: `Astivita`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### AWARD

- Raw brand variants: `AWARD`
- Inventory models: 9
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Baumatic

- Raw brand variants: `Baumatic`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Beko

- Raw brand variants: `BEKO`, `Beko`
- Inventory models: 35
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Belling

- Raw brand variants: `Belling`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Bellini

- Raw brand variants: `Bellini`
- Inventory models: 26
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Bellissimo

- Raw brand variants: `Bellissimo`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Bertazzoni

- Raw brand variants: `Bertazzoni`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### BLANCO

- Raw brand variants: `BLANCO`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Blaupunkt

- Raw brand variants: `Blaupunkt`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Bosch

- Raw brand variants: `BOSCH`, `Bosch`
- Inventory models: 112
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 2
- Proven marketing series: 2; total series count: `PROVEN_MINIMUM_ONLY`

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

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Comfee

- Raw brand variants: `Comfee`
- Inventory models: 9
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### De Dietrich

- Raw brand variants: `De Dietrich`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### De’Longhi

- Raw brand variants: `De’Longhi`
- Inventory models: 9
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Devanti

- Raw brand variants: `Devanti`
- Inventory models: 16
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Di Lusso

- Raw brand variants: `Di Lusso`
- Inventory models: 9
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Domain

- Raw brand variants: `Domain`
- Inventory models: 9
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Duos

- Raw brand variants: `Duos`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Electrolux

- Raw brand variants: `Electrolux`
- Inventory models: 20
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Emilia

- Raw brand variants: `Emilia`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Esatto

- Raw brand variants: `Esatto`
- Inventory models: 21
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### EURO

- Raw brand variants: `EURO`
- Inventory models: 33
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Euromaid

- Raw brand variants: `Euromaid`
- Inventory models: 15
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### EUROMATIC

- Raw brand variants: `EUROMATIC`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Eurotech

- Raw brand variants: `Eurotech`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Everdure

- Raw brand variants: `Everdure`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### EVOKE

- Raw brand variants: `EVOKE`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Fisher & Paykel

- Raw brand variants: `Fisher & Paykel`
- Inventory models: 98
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 2
- Proven marketing series: 0; total series count: `UNKNOWN`

#### DD60D4NX9

- Group type: `model_specific`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `DD60D4NX9`
- PDF SHA-256: `40d17cefe10087be1f573254662fcec2aa9a48648c7cdbb1a174a1ef8dc065db`
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwf9542760/QRG/AU/QRG-AU-82880.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, width | `product_closed_candidate` | Depth 573 mm \| Height 820 - 880 mm \| Width 599 mm | p.2, `5f093b3c5365` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

#### DW60UT4I2

- Group type: `model_specific`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `DW60UT4I2`
- PDF SHA-256: `05bf7d5a88fac296f09cd7fcf7d2e3b4f562ac31e4a6c96895b62bb922ffcc35`
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw3adf5920/QRG/AU/QRG-AU-82440.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 597 mm | p.3, `1e13b35a0033` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 2

### FOTILE

- Raw brand variants: `FOTILE`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Franke

- Raw brand variants: `Franke`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### FUJIYAMA

- Raw brand variants: `FUJIYAMA`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Fulgor

- Raw brand variants: `Fulgor`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### FURON

- Raw brand variants: `FURON`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### GAGGENAU

- Raw brand variants: `GAGGENAU`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Glen Dimplex

- Raw brand variants: `Glen Dimplex`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Hafele

- Raw brand variants: `Hafele`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Haier

- Raw brand variants: `Haier`
- Inventory models: 43
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 5
- Proven marketing series: 0; total series count: `UNKNOWN`

#### HDW15F1B1

- Group type: `model_specific`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `HDW15F1B1`
- PDF SHA-256: `b3b49a4bcb56a5c30f4e958f0f88185aa3810cdbc6365eab9a0aaddff80fe557`
- Official/source URLs: <https://www.haier.com.au/on/demandware.static/-/Sites-haier-master-catalog/default/dw154d412d/QRG/AU/QRG-AU-61659.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | none | `product_closed_candidate` | Height 850 - 895 mm | p.1, `269ef38f0808` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 599 mm | p.2, `9ed45ddadf70` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 597 mm | p.1, `b4ffd2e25098` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 599 mm | p.1, `e52b79ac6913` |

#### HDW15F2B1

- Group type: `model_specific`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `HDW15F2B1`
- PDF SHA-256: `8c230fe497ca443859a8bb1b01521ce661b71923589ed4a1540e208b05766e02`
- Official/source URLs: <https://www.haier.com.au/on/demandware.static/-/Sites-haier-master-catalog/default/dwbb887907/QRG/AU/QRG-AU-61614.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_DOCUMENT_EXACT_MODEL` | depth -> height -> width | depth, width | `product_closed_candidate` | Depth 599 mm \| Height 850 - 895 mm \| Width 597 mm | p.2, `340b16bab2da` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 597 mm | p.1, `65038f5293b4` |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | none | `product_closed_candidate` | Height 850 - 895 mm | p.1, `5aa5227718fd` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 599 mm | p.1, `1866241b16e6` |

#### HDW15F3S1

- Group type: `model_specific`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `HDW15F3S1`
- PDF SHA-256: `8327f5e18360b8103005c7b062d2ede456931df19e2c881431aa2dfefb7caecb`
- Official/source URLs: <https://www.haier.com.au/on/demandware.static/-/Sites-haier-master-catalog/default/dw7db79904/QRG/AU/QRG-AU-61616.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | none | `product_closed_candidate` | Height 850 - 895 mm | p.1, `f072418077af` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 597 mm | p.1, `01c696292aa1` |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, width | `product_closed_candidate` | Depth 599 mm \| Height 850 - 895 mm \| Width 597 mm | p.2, `3e58424b783a` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 599 mm | p.1, `895f97d1682d` |

#### HDW15F4B1

- Group type: `model_specific`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `HDW15F4B1`
- PDF SHA-256: `658a7534c9bc1e033d5e635fc36185deb41bca28ac6ede41e31064c882bab6c5`
- Official/source URLs: <https://www.haier.com.au/on/demandware.static/-/Sites-haier-master-catalog/default/dw76609ae6/QRG/AU/QRG-AU-61668.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 599 mm | p.1, `6445076d3484` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 597 mm | p.1, `4cc40dd67c72` |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | none | `product_closed_candidate` | Height 850 - 895 mm | p.1, `2a887c8aeded` |

#### HDW15U2I1

- Group type: `model_specific`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `HDW15U2I1`
- PDF SHA-256: `a979ba676c8b6fb4c2ff23145600d452bb29e3882896721272b2a22a53010463`
- Official/source URLs: <https://www.haier.com.au/on/demandware.static/-/Sites-haier-master-catalog/default/dwa742cfeb/QRG/AU/QRG-AU-61615.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_ADJUSTABLE_RANGE` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | none | `product_closed_candidate` | Height 820 - 880 mm | p.1, `03bd955d4047` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 597 mm | p.1, `65038f5293b4` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 554 mm | p.1, `5308c679d5df` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_DOCUMENT_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 597 mm | p.2, `4c1c60cff992` |

### HELLER

- Raw brand variants: `HELLER`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Hisense

- Raw brand variants: `Hisense`
- Inventory models: 12
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Home Appliances

- Raw brand variants: `Home Appliances`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Ikea

- Raw brand variants: `Ikea`
- Inventory models: 7
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Ilve

- Raw brand variants: `Ilve`
- Inventory models: 27
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Inalto

- Raw brand variants: `Inalto`
- Inventory models: 16
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### KLEENMAID

- Raw brand variants: `KLEENMAID`
- Inventory models: 8
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Kogan

- Raw brand variants: `Kogan`
- Inventory models: 46
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### LG

- Raw brand variants: `LG`
- Inventory models: 30
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 1
- Proven marketing series: 0; total series count: `UNKNOWN`

#### XD2A25MB

- Group type: `model_specific`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `XD2A25MB`
- PDF SHA-256: `cde14b717d6353dca7585bc4d02665b033157dee55e3a709175fb06806bfb8b0`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=XFUDD7WCYvPmtwnCUJg7w>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_SCOPE_REQUIRED` | `GROUPED_AXIS_SEQUENCE` | `DOCUMENT_IDENTITY_ONLY` | width -> height -> depth | none | `product_closed_candidate` | Dimension(Width X Height X Depth) 600 mm X 850 mm X 600 mm | p.12, `986a1b1f591b` |

### majestic

- Raw brand variants: `majestic`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Master Kitchen

- Raw brand variants: `Master Kitchen`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Midea

- Raw brand variants: `Midea`
- Inventory models: 40
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Miele

- Raw brand variants: `Miele`
- Inventory models: 81
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Milano

- Raw brand variants: `Milano`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Mistral

- Raw brand variants: `Mistral`
- Inventory models: 24
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Mykin

- Raw brand variants: `Mykin`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### NEFF

- Raw brand variants: `NEFF`
- Inventory models: 8
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Norj

- Raw brand variants: `Norj`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Omega

- Raw brand variants: `Omega`
- Inventory models: 59
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### ONIX

- Raw brand variants: `ONIX`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Panasonic

- Raw brand variants: `Panasonic`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### PARMCO

- Raw brand variants: `PARMCO`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Platinum

- Raw brand variants: `Platinum`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### POLO

- Raw brand variants: `POLO`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### ROBAM

- Raw brand variants: `ROBAM`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Robinhood

- Raw brand variants: `Robinhood`
- Inventory models: 12
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Samsung

- Raw brand variants: `Samsung`
- Inventory models: 10
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SAMSUNG ELECTRONICS

- Raw brand variants: `SAMSUNG ELECTRONICS`
- Inventory models: 13
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SEIKI

- Raw brand variants: `SEIKI`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SHARP

- Raw brand variants: `SHARP`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SIEMENS

- Raw brand variants: `SIEMENS`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Smeg

- Raw brand variants: `Smeg`
- Inventory models: 124
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 1
- Proven marketing series: 0; total series count: `UNKNOWN`

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

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Stirling

- Raw brand variants: `Stirling`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Technika

- Raw brand variants: `Technika`
- Inventory models: 12
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### TECO

- Raw brand variants: `TECO`
- Inventory models: 11
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Teka

- Raw brand variants: `Teka`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Tisira

- Raw brand variants: `Tisira`
- Inventory models: 7
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Toshiba

- Raw brand variants: `Toshiba`
- Inventory models: 9
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### TRIESTE

- Raw brand variants: `TRIESTE`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Tuscany

- Raw brand variants: `Tuscany`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### V-ZUG

- Raw brand variants: `V-ZUG`
- Inventory models: 23
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Veneto

- Raw brand variants: `Veneto`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Venini

- Raw brand variants: `Venini`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### VOGUE

- Raw brand variants: `VOGUE`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Westinghouse

- Raw brand variants: `Westinghouse`
- Inventory models: 43
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 2
- Proven marketing series: 0; total series count: `UNKNOWN`

#### WSF6604XB

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `WSF6604XB`
- PDF SHA-256: `70124dade32350086dd2f556371322384974494cfc7255b213c97e78ad2df1f5`
- Official/source URLs: <https://commercial.appliancesonline.com.au/manuals/ak/3/0/6/6/3066951a7ccf5fafcdc3e0eeb91d98ade3945e25_WSF6604WB_Westinghouse_User_Manual.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 9

#### WSF6606XB

- Group type: `model_specific`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `WSF6606XB`
- PDF SHA-256: `c3f814fbe48d311b7004c0144556cd712d4f1c8b8c4eed8f20a5c41416c9573c`
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

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### zzz

- Raw brand variants: `zzz`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

## Washing Machines

Inventory: 1497 models across 83 category-brand groups.

### 3J

- Raw brand variants: `3J`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### AEG

- Raw brand variants: `AEG`
- Inventory models: 25
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### AKAI

- Raw brand variants: `AKAI`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Altus

- Raw brand variants: `Altus`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Anko

- Raw brand variants: `Anko`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### ARISTON

- Raw brand variants: `ARISTON`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Artusi

- Raw brand variants: `Artusi`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### ASKO

- Raw brand variants: `ASKO`
- Inventory models: 24
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### AWARD

- Raw brand variants: `AWARD`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### BEKO

- Raw brand variants: `BEKO`, `Beko`
- Inventory models: 41
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### BL

- Raw brand variants: `BL`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### BOSCH

- Raw brand variants: `BOSCH`, `Bosch`
- Inventory models: 61
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 3
- Proven marketing series: 3; total series count: `PROVEN_MINIMUM_ONLY`

#### Series 4

- Group type: `marketing_series`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `WAN28227AU`
- PDF SHA-256: `3b05c53d73812d2432a3f7b667a775300b37297f6c410f0d3c7d4b172c8596d7`
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

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### carson

- Raw brand variants: `carson`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### CHIQ

- Raw brand variants: `CHIQ`
- Inventory models: 41
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Devanti

- Raw brand variants: `Devanti`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Duos

- Raw brand variants: `Duos`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Electrolux

- Raw brand variants: `Electrolux`
- Inventory models: 59
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 1
- Proven marketing series: 0; total series count: `UNKNOWN`

#### EWF1043R7WC

- Group type: `model_specific`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `EWF1043R7WC`
- PDF SHA-256: `2ac969549bd7c5e18b6d65d72c95566b044a459ad371318299b1655db17f0fdf`
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

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### EURO

- Raw brand variants: `EURO`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Euroclean

- Raw brand variants: `Euroclean`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Euromaid

- Raw brand variants: `Euromaid`
- Inventory models: 15
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Eurotech

- Raw brand variants: `Eurotech`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Everdure

- Raw brand variants: `Everdure`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### EVOKE

- Raw brand variants: `EVOKE`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Finch Australia

- Raw brand variants: `Finch Australia`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Fisher & Paykel

- Raw brand variants: `Fisher & Paykel`
- Inventory models: 98
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 6
- Proven marketing series: 0; total series count: `UNKNOWN`

#### WD8560F1

- Group type: `model_specific`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `WD8560F1`
- PDF SHA-256: `10240bd1e62b41630662c7945ba72d4981c7f5209430788d1d7a0edba7453041`, `34b7bab8a0fb3bbc39def76d7d788c7443266761b55f99bbec6d705b92721253`, `7fcec1d5a9dbe4a9bfe86d701c118d3dad9028173adc91012472a843db3ab098`
- Official/source URLs: <https://dam.fisherpaykel.com/KZ3PKN00/at/5wr6sg9qbcx47fcwcw4bhn3r/FP-EnergyWater-en-WD8560F1-CombiFrontLoaderWasherDryer-0-431560A-NZ-AU.pdf>, <https://dam.fisherpaykel.com/KZ3PKN00/at/sgxpjg6p5rjx9p4mh82h7x/FP-UserInstall-en-WD8560F1-WD7560P1-WD8060P1-FrontLoadingWasherDryer-0-429646E-NZ-AU-UK-IE-SG.pdf>, <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw911255f9/QRG/AU/QRG-AU-93235.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 600 mm | p.1, `e4bc637cb1e3` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 645 mm | p.1, `73e4eb30f514` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 645 mm \| Height 850 mm \| Width 600 mm | p.2, `458df54fb60e` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | Height 850 mm | p.1, `27a9d9739015` |
| `SUPPORTED_EXACT_MODEL_COLUMN_MATRIX` | `MODEL_COLUMN_DIMENSION_MATRIX` | `SAME_FRAGMENT_EXACT_MODEL` | height -> width -> depth -> depth | height, width, depth | `mixed_product_and_operation` | WD8560F1 \| A Overall height of product 850 \| B Overall width of product 600 \| © Overall depth of product(including dial and doorwhen closed) 645 \| D Depth with door open 1065 | p.15, `7ce6c5e9fb17` |

Research gaps:
- `NO_RECOGNIZED_DIMENSION_EXPRESSION`

#### WH1060P4

- Group type: `model_specific`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WH1060P4`
- PDF SHA-256: `4770512ae97b65aa1a0d797ff9d6127421bf684630568360c6e03f597a072e24`
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw950cf313/QRG/AU/QRG-AU-93292.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 655 mm \| Height 850 mm \| Width 600 mm | p.2, `0a9de3af21a3` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 655 mm | p.1, `6988457b4abe` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | Height 850 mm | p.1, `27a9d9739015` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 600 mm | p.1, `e4bc637cb1e3` |

#### WH1260DG5

- Group type: `model_specific`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `WH1260DG5`
- PDF SHA-256: `54e96a80e3b7e1308f717f9a5273dcee81d727056b41c9db2572aee91466edb6`
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwc6aea06b/QRG/AU/QRG-AU-92331.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 602 mm | p.1, `2c2762a49f39` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 661 mm | p.1, `eb0273f2729a` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 3

#### WH8060J5

- Group type: `model_specific`
- Expression coverage: `IMAGE_ONLY_DIMENSION_DIAGRAM`
- Models observed: `WH8060J5`
- PDF SHA-256: `54b97d676eb19b474e7b8820e1739dd60802e85719b10ad9bac82d860f7d3512`
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw636a518e/QRG/AU/QRG-AU-92303.pdf>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

### GAGGENAU

- Raw brand variants: `GAGGENAU`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Germanica

- Raw brand variants: `Germanica`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Hafele

- Raw brand variants: `Hafele`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Haier

- Raw brand variants: `Haier`
- Inventory models: 77
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### HELLER

- Raw brand variants: `HELLER`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Hisense

- Raw brand variants: `Hisense`
- Inventory models: 34
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 4
- Proven marketing series: 0; total series count: `UNKNOWN`

#### HWF3S8514X

- Group type: `model_specific`
- Expression coverage: `NO_RECOGNIZED_DIMENSION_EXPRESSION`
- Models observed: `HWF3S8514X`
- PDF SHA-256: `f047b5110c58719612ae05ac7d6cccd1ed974d8086dba6632bf71b3df4b4653c`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/HWF3S8514X-User-Manual.pdf?context=bWFzdGVyfE1hbnVhbHwxNTU3NzYzOHxhcHBsaWNhdGlvbi9wZGZ8YURsbUwyZzFNeTg0T0RrNE16TTVOelkyTXpBeUwwaFhSak5UT0RVeE5GZ2dMU0JWYzJWeUlFMWhiblZoYkM1d1pHWXw3NDIxMmUyNTA1ZjYwMjhjYjI2NjE2YzNhZmMxZGFjNDAzYzQzNDE1Mzg5MmZiOThlMWZkNjA1ODQwMTJlMTM4>

`NO_RECOGNIZED_DIMENSION_EXPRESSION`: the indexed document cannot yet supply a reusable text/table expression pattern.

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 11: Index Dimensions (mm) A 595 B 845 C 480 D 510 E 540 F 1020

#### HWF5I1215

- Group type: `model_specific`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `HWF5I1215`
- PDF SHA-256: `a85ac2f1727da062b515901eda319f16147312c89d7136643509bd5498f17b06`
- Official/source URLs: <https://dtc-aus-api.hisense.com/medias/2026-Hisense-AU-Consumer-Spec-HWF5I1215-.pdf?context=bWFzdGVyfE1hbnVhbHwxMzg1MDZ8YXBwbGljYXRpb24vcGRmfGFERmpMMmhsTXk4NE9EazRNekk1T1RNMU9UQXlMekl3TWpZZ1NHbHpaVzV6WlNCQlZTQXRJRU52Ym5OMWJXVnlJRk53WldNZ0tFaFhSalZKTVRJeE5Ta3VjR1JtfDI1YmYzMjZlMzY5OWIwOGMxZTJhNmI1ZDUxNjc4ZTU2OGVmZjI0NjUyZmJlNGYzYWRmZDhmMjhjYTVmY2YwODA>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_GROUPED` | `GROUPED_AXIS_SEQUENCE` | `SAME_FRAGMENT_EXACT_MODEL` | width -> height -> depth | width, height, depth | `product_closed_candidate` | Net dimensions(W x H x D) (mm) 595x 845x 595 | p.1, `8f3a224792d3` |

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

### Hitachi

- Raw brand variants: `Hitachi`
- Inventory models: 8
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### HOOVER

- Raw brand variants: `HOOVER`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Inalto

- Raw brand variants: `Inalto`
- Inventory models: 50
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### KLEENMAID

- Raw brand variants: `KLEENMAID`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Kogan

- Raw brand variants: `Kogan`
- Inventory models: 111
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### LG

- Raw brand variants: `LG`
- Inventory models: 175
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 2
- Proven marketing series: 0; total series count: `UNKNOWN`

#### Document family 2d559286f86e

- Group type: `document_family`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WV9-1412B`, `WV9-1412W`
- PDF SHA-256: `2d559286f86ecfd209c52ac6e5e02343f7515715d9674fc7e98c0e5028619a1b`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=HJoJF6sjLmW0vxZag11e5g>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_PARTIAL_REJECT_AMBIGUOUS_DEPTH` | `ALTERNATING_AXIS_VALUE_CELLS` | `SAME_PAGE_EXACT_MODEL` | width -> depth -> depth -> height -> depth | width, height | `product_closed_candidate` | Dimension(mm) W 600 D 560 D" 1100 H 850 D' 620 | p.12, `82b71f1ed934` |
| `SUPPORTED_PARTIAL_REJECT_AMBIGUOUS_DEPTH` | `ALTERNATING_AXIS_VALUE_CELLS` | `SAME_PAGE_EXACT_MODEL` | width -> depth -> depth -> height -> depth | width, height | `product_closed_candidate` | Dimension(mm) W 600 D 610 D" 1135 H 850 D' 660 | p.12, `3d53d627e79d` |

#### WD1275A1

- Group type: `model_specific`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WD1275A1`
- PDF SHA-256: `736c5c97437df0ac5168dce2a213c2a552bc492e3b4407cd8297cdf9ca35cee1`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=XSzB9y7vFqHz12fgVCRvHw>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_PARTIAL_REJECT_AMBIGUOUS_DEPTH` | `ALTERNATING_AXIS_VALUE_CELLS` | `SAME_PAGE_EXACT_MODEL` | width -> depth -> depth -> height -> depth | width, height | `product_closed_candidate` | Dimension(mm) W 600 D 475 D" 1015 H 850 D' 535 | p.11, `ac5ea0a069ae` |

### Livable

- Raw brand variants: `Livable`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Living & Co

- Raw brand variants: `Living & Co`
- Inventory models: 11
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### majestic

- Raw brand variants: `majestic`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### MALBER

- Raw brand variants: `MALBER`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Midea

- Raw brand variants: `Midea`
- Inventory models: 50
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Miele

- Raw brand variants: `Miele`
- Inventory models: 44
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Mistral

- Raw brand variants: `Mistral`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### MOBORV

- Raw brand variants: `MOBORV`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Mykin

- Raw brand variants: `Mykin`
- Inventory models: 33
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### NCE

- Raw brand variants: `NCE`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Norj

- Raw brand variants: `Norj`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Omega

- Raw brand variants: `Omega`
- Inventory models: 16
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### ONIX

- Raw brand variants: `ONIX`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Panasonic

- Raw brand variants: `Panasonic`
- Inventory models: 13
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### PARMCO

- Raw brand variants: `PARMCO`
- Inventory models: 7
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### QFLOW

- Raw brand variants: `QFLOW`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Robinhood

- Raw brand variants: `Robinhood`
- Inventory models: 14
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### RV ECOWASHER

- Raw brand variants: `RV ECOWASHER`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Samsung

- Raw brand variants: `SAMSUNG`, `Samsung`
- Inventory models: 55
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 3
- Proven marketing series: 0; total series count: `UNKNOWN`

#### WW11CG60ADLE

- Group type: `model_specific`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WW11CG60ADLE`
- PDF SHA-256: `1f2460ba7366fa75d802d47a0bcf01b82c5578919e975d935a8d589b4154f9a0`
- Official/source URLs: <https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_AU&OriginYN=N&ModelType=N&ModelName=WW11CG60ADLE&CttFileID=11284915&CDCttType=UM&VPath=UM%2F202602%2F20260211103223036%2FDC68-04493F-00_IB_B-PJT_B11_WASHER-MD_SimpleUX_EN_240424.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_SCOPE_REQUIRED` | `LETTERED_EXPLICIT_AXIS_LIST` | `DOCUMENT_IDENTITY_ONLY` | width -> height -> depth | none | `product_closed_candidate` | A (Width) 600 mm \| B (Height) 850 mm \| C (Depth) 600 mm | p.63, `346abcd58491` |

#### WW12BB944DGB

- Group type: `model_specific`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WW12BB944DGB`
- PDF SHA-256: `d075eefb815236292b023180ec9edd2f78a81e49efb9131977c6fae95c9ef55b`
- Official/source URLs: <https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_AU&OriginYN=N&ModelType=N&ModelName=WW12BB944DGB&CttFileID=11396073&CDCttType=UM&VPath=UM%2F202604%2F20260427073944837%2FDC68-04464A-02_IB_B-PJT_WASHER-AD_SimpleUX_EN_260423.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_SCOPE_REQUIRED` | `INDIVIDUALLY_LABELLED_AXES` | `DOCUMENT_IDENTITY_ONLY` | width -> height -> depth | none | `product_closed_candidate` | Width 600 mm \| Height 850 mm \| Depth 595 mm | p.66, `a07b1b57bc05` |
| `RESEARCH_MODEL_SCOPE_REQUIRED` | `INDIVIDUALLY_LABELLED_AXES` | `DOCUMENT_IDENTITY_ONLY` | width -> height -> depth | none | `product_closed_candidate` | Width 600 mm \| Height 850 mm \| Depth 695 mm | p.66, `2f102d7d7337` |

#### WW90DG6U3ALE

- Group type: `model_specific`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `WW90DG6U3ALE`
- PDF SHA-256: `0f60add258fa3da0c8250cddaddd435dd0f7d5b8c89b64add912f25f53a52b27`
- Official/source URLs: <https://org.downloadcenter.samsung.com/downloadfile/ContentsFile.aspx?CDSite=UNI_AU&OriginYN=N&ModelType=N&ModelName=WW90DG6U3ALE&CttFileID=11364936&CDCttType=UM&VPath=UM%2F202604%2F20260408143907954%2FWeb_IB_D-PJT_WASHER-MD_SimpleUX_EN_v1.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEARCH_MODEL_SCOPE_REQUIRED` | `LETTERED_EXPLICIT_AXIS_LIST` | `DOCUMENT_IDENTITY_ONLY` | width -> height -> depth | none | `product_closed_candidate` | A (Width) 600 mm \| B (Height) 850 mm \| C (Depth) 595 mm | p.62, `778153986852` |

### SAMSUNG ELECTRONICS

- Raw brand variants: `SAMSUNG ELECTRONICS`
- Inventory models: 45
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SEIKI

- Raw brand variants: `SEIKI`
- Inventory models: 16
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SHARP

- Raw brand variants: `SHARP`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SHOME I SEIKI

- Raw brand variants: `SHOME I SEIKI`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SIEMENS

- Raw brand variants: `SIEMENS`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Smeg

- Raw brand variants: `Smeg`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Solt

- Raw brand variants: `Solt`
- Inventory models: 47
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Speed Queen

- Raw brand variants: `SPEED QUEEN`, `Speed Queen`
- Inventory models: 29
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Sphere

- Raw brand variants: `Sphere`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Stirling

- Raw brand variants: `Stirling`
- Inventory models: 16
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Swift

- Raw brand variants: `Swift`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### TCL

- Raw brand variants: `TCL`
- Inventory models: 17
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Technika

- Raw brand variants: `Technika`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### TECO

- Raw brand variants: `TECO`
- Inventory models: 9
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Teka

- Raw brand variants: `Teka`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### TELEFUNKEN

- Raw brand variants: `TELEFUNKEN`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Tisira

- Raw brand variants: `Tisira`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Toshiba

- Raw brand variants: `Toshiba`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Tuscany

- Raw brand variants: `Tuscany`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### V-ZUG

- Raw brand variants: `V-ZUG`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Vision

- Raw brand variants: `Vision`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### VOGUE

- Raw brand variants: `VOGUE`
- Inventory models: 13
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Westinghouse

- Raw brand variants: `Westinghouse`
- Inventory models: 31
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### WHIRLPOOL

- Raw brand variants: `WHIRLPOOL`, `Whirlpool`
- Inventory models: 39
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### yokohama

- Raw brand variants: `yokohama`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

## Dryers

Inventory: 843 models across 68 category-brand groups.

### AEG

- Raw brand variants: `AEG`
- Inventory models: 21
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### AKAI

- Raw brand variants: `AKAI`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Altus

- Raw brand variants: `Altus`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Anko

- Raw brand variants: `Anko`
- Inventory models: 7
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### ARISTON

- Raw brand variants: `ARISTON`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Artusi

- Raw brand variants: `Artusi`
- Inventory models: 8
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### ASKO

- Raw brand variants: `ASKO`
- Inventory models: 24
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### AWARD

- Raw brand variants: `AWARD`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### BEKO

- Raw brand variants: `BEKO`, `Beko`
- Inventory models: 31
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Bosch

- Raw brand variants: `BOSCH`, `Bosch`
- Inventory models: 25
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 4
- Proven marketing series: 2; total series count: `PROVEN_MINIMUM_ONLY`

#### Series 6

- Group type: `marketing_series`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `WQG235DRAU`, `WQG24200AU`
- PDF SHA-256: `08b952e6c0bfdbe21ee9aa9a8f6ad7faced3358f5721450359e408d9885da840`, `cbd890b096473a6e036e620083e06cf1e5e688650bb497f559af0ff36f72fe00`
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

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### CHIQ

- Raw brand variants: `CHIQ`
- Inventory models: 16
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Devanti

- Raw brand variants: `Devanti`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Electrolux

- Raw brand variants: `Electrolux`
- Inventory models: 43
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 2
- Proven marketing series: 0; total series count: `UNKNOWN`

#### EDV605H3WC

- Group type: `model_specific`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `EDV605H3WC`
- PDF SHA-256: `8a7e470a1a7346035ac67ca27ab693732cf5b3c56aa58b29ee0c623a211a585d`
- Official/source URLs: <https://commercial.appliancesonline.com.au/manuals/ak/d/7/e/2/d7e29d214f2e4ae675965724e2bfae2f462549a0_Electrolux_EDV605H3WC_Factsheet.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 795 \| Total width (mm) 560 \| Total depth (mm) 600 | p.3, `3c4199a6c327` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 5: Pack Dimensions Height (mm) 845 Pack Dimension Width (mm) 625 Pack Dimension Depth (mm) 595

#### EDV705H3WC

- Group type: `model_specific`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `EDV705H3WC`
- PDF SHA-256: `858bcfe2625fee4321045b82065d2805ea4a43b5fddf2948ffe51a4de7acbbb8`
- Official/source URLs: <https://commercial.appliancesonline.com.au/manuals/ak/b/5/7/e/b57e4730d952fa76093dfb152bc519c36d67fd23_Electrolux_EDV705H3WC_Factsheet.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | height -> width -> depth | height, width, depth | `product_closed_candidate` | Total height (mm) 795 \| Total width (mm) 600 \| Total depth (mm) 600 | p.3, `e9a45e5b13e3` |

Research gaps:
- `UNRECOGNIZED_TEXT_DIMENSION_EXPRESSION` on page 5: Pack Dimensions Height (mm) 845 Pack Dimension Width (mm) 625 Pack Dimension Depth (mm) 635

### Esatto

- Raw brand variants: `Esatto`
- Inventory models: 56
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### EURO

- Raw brand variants: `EURO`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Euroclean

- Raw brand variants: `Euroclean`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Euromaid

- Raw brand variants: `Euromaid`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Eurotech

- Raw brand variants: `Eurotech`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### EVOKE

- Raw brand variants: `EVOKE`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Fisher & Paykel

- Raw brand variants: `Fisher & Paykel`
- Inventory models: 69
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 4
- Proven marketing series: 0; total series count: `UNKNOWN`

#### DE6060M2

- Group type: `model_specific`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `DE6060M2`
- PDF SHA-256: `b35f817f7e6e5d2a75e0f5c31c985519f346e998a60f9efd9e378a9796af8b4a`
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwac9dda29/QRG/AU/QRG-AU-92277.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 600 mm | p.1, `6252b6ef7a8f` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 575 mm \| Height 830 mm \| Width 600 mm | p.2, `e823e7d283d9` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | depth | depth | `product_closed_candidate` | Depth 575 mm | p.1, `1f2ef617950b` |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | height | height | `product_closed_candidate` | Height 830 mm | p.1, `83c473306ff0` |

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

#### DH8060P5

- Group type: `model_specific`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `DH8060P5`
- PDF SHA-256: `eb728821fc93ca4ba5dedadbad827ab9c7dbc744bd3ce6c2bec0ef848793c9d1`
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw638d352c/QRG/AU/QRG-AU-93304.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUALLY_LABELLED_AXES` | `SAME_PAGE_EXACT_MODEL` | depth -> height -> width | depth, height, width | `product_closed_candidate` | Depth 682 mm \| Height 850 mm \| Width 602 mm | p.2, `973ce368af55` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 1

#### DH9060H1

- Group type: `model_specific`
- Expression coverage: `OBSERVED_DIMENSION_EXPRESSIONS`
- Models observed: `DH9060H1`
- PDF SHA-256: `c7375afcae85282b37fb59daeb237e6d74844a6d16586f04d1e6fe81a6d75a98`
- Official/source URLs: <https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw8e5cecb9/QRG/AU/QRG-AU-92293.pdf>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_EXPLICIT_LABELS` | `INDIVIDUAL_LABELLED_AXIS` | `SAME_PAGE_EXACT_MODEL` | width | width | `product_closed_candidate` | Width 600 mm | p.3, `4faec25320ba` |

### FUJIYAMA

- Raw brand variants: `FUJIYAMA`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### GAGGENAU

- Raw brand variants: `GAGGENAU`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Germanica

- Raw brand variants: `Germanica`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Hafele

- Raw brand variants: `Hafele`
- Inventory models: 6
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Haier

- Raw brand variants: `Haier`
- Inventory models: 43
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Hisense

- Raw brand variants: `Hisense`
- Inventory models: 14
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Hitachi

- Raw brand variants: `Hitachi`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### HOOVER

- Raw brand variants: `HOOVER`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Inalto

- Raw brand variants: `Inalto`
- Inventory models: 19
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Kogan

- Raw brand variants: `Kogan`
- Inventory models: 68
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### LG

- Raw brand variants: `LG`
- Inventory models: 68
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 2
- Proven marketing series: 0; total series count: `UNKNOWN`

#### Document family 2fe3cc8c8972

- Group type: `document_family`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `DVH5-08W`, `DVH9-09B`, `DVH9-09W`
- PDF SHA-256: `2fe3cc8c897293245b4667f18c487ea2ec0f1cde687f361701b6790da7d2bee1`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=pUof6XKiAKggTDi5Im6WeA>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_PARTIAL_REJECT_AMBIGUOUS_DEPTH` | `ALTERNATING_AXIS_VALUE_CELLS` | `SAME_DOCUMENT_EXACT_MODEL` | width -> depth -> depth -> height -> depth | width, height | `product_closed_candidate` | Dimension(mm) W 600 D 690 D" 1115 H 850 D' 615 | p.10, `e3eb08ce7c85` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 14

#### DVH1-08WP

- Group type: `model_specific`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `DVH1-08WP`
- PDF SHA-256: `22c0a224a7a41de6589acfd7ae69cfb5d2b2e531eb0058dfb1ab7e6a3bcd3957`
- Official/source URLs: <https://gscs-b2c.lge.com/open/downloadFile?fileId=qBtD6KGnaeJRgOsUCABlvQ>

| Parser decision | Pattern | Model binding | Axis order | Safe axes | Scope | Source expression | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED_PARTIAL_REJECT_AMBIGUOUS_DEPTH` | `ALTERNATING_AXIS_VALUE_CELLS` | `SAME_PAGE_EXACT_MODEL` | width -> depth -> depth -> height -> depth | width, height | `product_closed_candidate` | Dimension(mm) W 600 D 660 D" 1115 H 850 D' 614 | p.12, `14c5e7f03d58` |

Research gaps:
- `IMAGE_ONLY_DIMENSION_DIAGRAM` on page 15

### majestic

- Raw brand variants: `majestic`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Midea

- Raw brand variants: `Midea`
- Inventory models: 15
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Miele

- Raw brand variants: `Miele`
- Inventory models: 49
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Mistral

- Raw brand variants: `Mistral`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Mykin

- Raw brand variants: `Mykin`
- Inventory models: 15
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Norj

- Raw brand variants: `Norj`
- Inventory models: 7
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Omega

- Raw brand variants: `Omega`
- Inventory models: 17
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### ONIX

- Raw brand variants: `ONIX`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### OSVO

- Raw brand variants: `OSVO`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### PARMCO

- Raw brand variants: `PARMCO`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Platinum

- Raw brand variants: `Platinum`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Prinetti

- Raw brand variants: `Prinetti`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Robinhood

- Raw brand variants: `Robinhood`
- Inventory models: 7
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Samsung

- Raw brand variants: `Samsung`
- Inventory models: 12
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 1
- Proven marketing series: 0; total series count: `UNKNOWN`

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

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SEIKI

- Raw brand variants: `SEIKI`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SHARP

- Raw brand variants: `SHARP`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Sheffield

- Raw brand variants: `Sheffield`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SHOME I SEIKI

- Raw brand variants: `SHOME I SEIKI`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SIEMENS

- Raw brand variants: `SIEMENS`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SIMPSON

- Raw brand variants: `SIMPSON`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Smeg

- Raw brand variants: `Smeg`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Solt

- Raw brand variants: `Solt`
- Inventory models: 35
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### SPEED QUEEN

- Raw brand variants: `SPEED QUEEN`, `Speed Queen`
- Inventory models: 18
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Stirling

- Raw brand variants: `Stirling`
- Inventory models: 12
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### TCL

- Raw brand variants: `TCL`
- Inventory models: 4
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Technika

- Raw brand variants: `Technika`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Teka

- Raw brand variants: `Teka`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### TELEFUNKEN

- Raw brand variants: `TELEFUNKEN`
- Inventory models: 5
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Toshiba

- Raw brand variants: `Toshiba`
- Inventory models: 3
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Tuscany

- Raw brand variants: `Tuscany`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### VOGUE

- Raw brand variants: `VOGUE`
- Inventory models: 2
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Westinghouse

- Raw brand variants: `Westinghouse`
- Inventory models: 17
- Coverage: `MINERU_SAMPLE_OBSERVED`; MinerU documents: 1
- Proven marketing series: 0; total series count: `UNKNOWN`

#### WDV457H3WB

- Group type: `model_specific`
- Expression coverage: `OBSERVED_WITH_RESEARCH_GAPS`
- Models observed: `WDV457H3WB`
- PDF SHA-256: `bb4765aed8b51db365365a2352cbf797538c662442e1400ca6d38b19feacd1f5`
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

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### Winia

- Raw brand variants: `Winia`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

### yokohama

- Raw brand variants: `yokohama`
- Inventory models: 1
- Coverage: `NO_MINERU_SAMPLE`; MinerU documents: 0
- Proven marketing series: 0; total series count: `UNKNOWN`

`NO_MINERU_SAMPLE`: no PDF expression may be assumed for this brand.

## Unmapped MinerU Documents

These documents remain in coverage accounting but cannot be assigned to a brand, category or series.

| PDF SHA-256 | Mapping status | Sources |
| --- | --- | --- |
| `093085695070187f0bd284554635e3dd85876aab21416153ab0ea313632d7e99` | `UNMAPPED_SOURCE_PDF` | unknown |
| `372f69cf9eac9fc0695fa9c3cb054f5375a546126220fadaee130d48963cbbf5` | `UNMAPPED_SOURCE_PDF` | unknown |
| `459a7a142a4637f03d2e7a695a5c9a277d0bfdb45a38550dcb01b29a7569fc48` | `UNMAPPED_SOURCE_PDF` | unknown |
| `5abb65a48d029999cd55c8a5f2c2672a4ac9d66ae5d1feb83ec58bed50c2ce99` | `UNMAPPED_SOURCE_PDF` | unknown |
| `6efe163d127f7a5f94e55db069b7929c54a47a9408122753467e3fc876f2f16a` | `UNMAPPED_SOURCE_PDF` | unknown |
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

