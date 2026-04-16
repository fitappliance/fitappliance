# Door Swing Research Notes

This file records the manual backfill pass for `public/data/appliances.json`
`door_swing_mm` values that are currently `null`.

`appliances.json` cannot safely contain inline comments, so source notes and
non-adoption reasons are tracked here instead.

## Result

No numeric `door_swing_mm` values were backfilled in this pass.

Reason: the current hardcoded appliance records are not always a reliable
one-to-one match for the official product pages or manuals that were found. In
several cases, the model suffix, capacity, or published dimensions differ
materially from the current JSON record, so importing those official
measurements would create a false sense of precision.

For dryers, there is also a field-semantics problem: the UI currently presents
`door_swing_mm` as hinge-side clearance for 90 degree opening, while official
dryer sheets usually publish cabinet depth, reversible-door notes, or total
front-open depth. Those values are not safely interchangeable.

Per the project rule for data credibility, unresolved records remain `null`.
The dryer records `dr1`-`dr4` were also normalised from an omitted field to an
explicit `null` so the schema stays consistent.

## Reviewed Records

### `f1` Samsung `SRF7500WFH French Door 740L`

- Source checked:
  [Samsung AU product page for SRF7500SB](https://www.samsung.com/au/refrigerators/french-door-srf719dls/)
- Source checked:
  [Samsung AU support page for SRF7500SB](https://www.samsung.com/au/support/model/RF59A7670SR/SA/)
- Source checked:
  [Samsung NZ brochure for SRF7500SB](https://images.samsung.com/is/content/samsung/assets/nz/ha/guides/fridge/SRF7500SB.pdf)
- Why not adopted:
  official model surfaced as `SRF7500SB`, not `SRF7500WFH`, and the official
  published dimensions also differ from the current JSON record.

### `f2` LG `GF-L708MBL French Door 708L`

- Source checked:
  [LG AU GF-D708BSL](https://www.lg.com/au/fridge-freezers/french-door/gf-d708bsl/)
- Source checked:
  [LG AU GF-V708MBSL](https://www.lg.com/au/fridges/lg-GF-V708MBSL)
- Source checked:
  [LG AU GF-L708PL](https://www.lg.com/au/fridges/lg-GF-L708PL)
- Why not adopted:
  I found the `GF-D708*`, `GF-V708*`, and `GF-L708PL` families, but not an
  official `GF-L708MBL` page with a matching published size set or a clearly
  stated door-opening clearance for this exact record.

### `f3` Fisher & Paykel `RF730QZUVX1 French Door 726L`

- Source checked:
  [Fisher & Paykel installation guide 431084A](https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw94ab8fe5/InstallationManuals-FisherPaykelAU/FP-InstallGuide-en-RF730QZUVB1-RF730QNUVX1-RF730QNUVB1-FreestandingQuadDoorRefrigeratorFreezer-0-431084A-NZ-AU.pdf)
- Source checked:
  [Fisher & Paykel support page RF730QNUVB1](https://www.fisherpaykel.com/nz/support/products/RF730QNUVB1)
- Why not adopted:
  the official family guide is for `RF730QZUVB1` / `RF730QNUVX1` /
  `RF730QNUVB1`, not the current `RF730QZUVX1` record, and the official
  published dimensions differ from the current JSON values.

### `f5` Westinghouse `WBE5314SA Bottom Mount 528L`

- Source checked:
  [Westinghouse AU WBE5314SA-R](https://www.westinghouse.com.au/fridges-and-freezers/fridges/wbe5314sa-r/)
- Why not adopted:
  the official page publishes `Depth door open 90degree`, but the current JSON
  record uses different base dimensions from the official model page and does
  not establish that this field should be stored as a front-opening depth delta
  rather than side-wall clearance.

### `f6` Bosch `KGN396LBAS Top Mount 368L`

- Why not adopted:
  I did not find a trustworthy official Bosch AU product or support document for
  this exact model code during this pass, so the record remains `null`.

### `f7` Haier `HRF520BHS French Door 520L`

- Source checked:
  [Haier AU user manual covering HRF520BHS](https://www.haier.com.au/on/demandware.static/-/Sites-haier-master-catalog/default/dw01c5120c/GeneralFiles-HaierAU/Haier790_user_manual_2019-5-31.pdf)
- Why not adopted:
  the official manual covers `HRF520BHS`, but its published dimensions and door
  layout do not match the current JSON record, so importing its door-clearance
  figures would be unsafe.

### `f8` Electrolux `EHE5267B Bottom Mount 520L`

- Source checked:
  [Electrolux AU EHE5267BB fact sheet](https://www.electrolux.com.au/documenthandler.ashx?file=aHR0cHM6Ly9yZXNvdXJjZS5lbGVjdHJvbHV4LmNvbS5hdS9GYWN0c2hlZXQvUmVxdWVzdFBkZj9tb2RlbE51bWJlcj1FSEU1MjY3QkImYnJhbmQ9RWxlY3Ryb2x1eA2&lang=)
- Why not adopted:
  the official `EHE5267BB` / `EHE5267SA` family documents point to a French-door
  product with dimensions that do not match the current JSON record.

### `f9` Mitsubishi `MR-CGX680ZG French Door 680L`

- Source checked:
  [Mitsubishi Electric AU refrigeration brochure](https://www.mitsubishielectric.com.au/wp-content/uploads/2024/09/Refrigeration_Brochure-2024-09.pdf)
- Why not adopted:
  I did not find an official Mitsubishi Electric AU page or outline-dimensions
  PDF for the exact `MR-CGX680ZG` record, so the value remains `null`.

### `dr1` Bosch `WTH85209AU Series 4 Heat Pump — 8kg`

- Why not adopted:
  I did not find a trustworthy official Bosch AU product or support document
  for the exact `WTH85209AU` code during this pass, so no defensible
  `door_swing_mm` value could be extracted.

### `dr2` LG `RC802HM2F DualInverter Condenser — 8kg`

- Why not adopted:
  I did not find a trustworthy official LG product or support page for the
  exact `RC802HM2F` code during this pass, so the value remains `null`.

### `dr3` Electrolux `EDH803BEWA Heat Pump — 8kg`

- Source checked:
  [Electrolux AU EDH803BEWA product page](https://www.electrolux.com.au/laundry/dryers/edh803bewa/)
- Why not adopted:
  the official page is for the exact model, but it publishes cabinet depth and
  reversible-door guidance rather than a hinge-side clearance value. The
  published total depth is also `665 mm`, which does not match the current JSON
  record's `580 mm`, so importing a derived figure would be unsafe.

### `dr4` Samsung `DV90T6240LE Vented — 9kg`

- Source checked:
  [Samsung product fiche for DV90T6240LE](https://images.samsung.com/is/content/samsung/p6/common/energylabel/common-energylabel-dv90t6240le-s6-energylabel.pdf)
- Why not adopted:
  the official Samsung document confirms the exact model family, but it does
  not publish a hinge-clearance or 90 degree side-opening measurement that can
  be mapped safely to `door_swing_mm`, so the value remains `null`.

## Phase 17 Research Engine Batch Audit

Date: 2026-04-16
Scope: fridge category, brands CHIQ, Kogan, HELLER, TECO
Missing definition: `door_swing_mm` is missing only when value is `null` or `undefined`
Coverage definition: value `0` is covered

### Batch Summary

- Total mixed batches: 10
- Total missing records in mixed batches: 21
- Total research inputs added in this phase: 21
- Adoptable candidate ratio: 21 of 21, 100 percent

Brand distribution:

- CHIQ: 5 batches, 14 missing, adoptable 14 of 14
- Kogan: 3 batches, 5 missing, adoptable 5 of 5
- HELLER: 1 batch, 1 missing, adoptable 1 of 1
- TECO: 1 batch, 1 missing, adoptable 1 of 1

### Added Research Inputs, High Confidence

Rules used for high confidence:

- Same brand
- Same category, fridge
- Same width group
- Batch already has at least one covered sample with `door_swing_mm = 0`
- Covered values in the same batch are consistent as `0`

Adoptable suggestion for all IDs below: set `door_swing_mm = 0`

#### CHIQ

- Width 545mm, covered sample `fridge-arf2509`: `fridge-arf3201`, `fridge-arf3396`, `fridge-arf2861`, `fridge-arf2457`, `fridge-arf2863`, `fridge-arf3214`
- Width 595mm, covered samples `fridge-arf2728`, `fridge-arf3385`: `fridge-arf2518`, `fridge-arf2521`, `fridge-arf2858`, `fridge-arf3117`
- Width 547mm, covered samples `fridge-arf3397`, `fridge-arf3400`: `fridge-arf3398`, `fridge-arf3399`
- Width 475mm, covered samples `fridge-arf3718`, `fridge-arf3376`: `fridge-arf3725`
- Width 710mm, covered samples `fridge-arf2820`, `fridge-arf2484`: `fridge-arf2818`

#### Kogan

- Width 550mm, covered sample `fridge-arf3788`: `fridge-arf3491`, `fridge-arf2747`
- Width 595mm, covered sample `fridge-arf3243`: `fridge-arf2753`, `fridge-arf2661`
- Width 790mm, covered sample `fridge-arf3066`: `fridge-arf3291`

#### HELLER

- Width 545mm, covered sample `fridge-arf3327`: `fridge-arf3146`

#### TECO

- Width 540mm, covered sample `fridge-arf3234`: `fridge-arf3438`

## Phase 17 Zero Anchor Slog

Date: 2026-04-16
Scope: pure-missing fridge batches with no covered anchor in-batch
Target batches:

- Kogan 480mm, 5 models
- CHIQ 470mm, 4 models
- CHIQ 700mm, 4 models

Historical sources used in repository:

- `docs/research-groups.json`
- `docs/door-swing-research-sheet.md`

### Research Summary

- Total research inputs added in this pass: 13
- Adoptable now: 4
- Unknown pending manual evidence: 9
- Batch-level adoptable confidence index: 46 percent

Confidence method:

- CHIQ 700mm group: medium-high, 72 percent
- Kogan 480mm group: low, 35 percent
- CHIQ 470mm group: low-medium, 40 percent

Rationale:

- History shows repeated heuristic recommendation of `20` for these groups in both `research-groups.json` and research-sheet commands.
- Zero-anchor groups carry higher risk than mixed groups.
- CHIQ 700mm models are uniform in geometry and type code (`5T`) and align with a dedicated historical group.
- Kogan 480mm and CHIQ 470mm are compact upright sets with mixed type codes and no verified manual links inside repo artifacts.

### Adoptable, Proposed Value

Adoptable in this pass, proposed `door_swing_mm = 20`:

- CHIQ 700mm:
  `fridge-arf3724` `CTM40*N*S5E`,
  `fridge-arf2511` `CTM407NB`,
  `fridge-arf3720` `CTM407NB4`,
  `fridge-arf3384` `CTM408NSS5E`

Reason:

- Historical group C5 maps these IDs together and recommends value `20`.
- All four records share `w=700`, `h=1680`, `d=700`, config `Upright`, type `5T`.
- This group is internally consistent and matches the wide top-mount profile where non-zero offset is plausible.

### Unknown, Pending Manual PDF Evidence

#### Kogan 480mm, pending evidence

- `fridge-arf3785` `KAH085LTMFA`
- `fridge-arf3758` `KAH125LTMFA`
- `fridge-arf3160` `KAH75BARFRA`
- `fridge-arf2743` `KAM43BEVFGF`
- `fridge-arf2749` `KAM93BEVFGA`

Required PDF links to verify before adoption:

- Installation or user manual PDF for each model with one of:
  90 degree door opening depth, door projection, hinge clearance diagram
- Located links in this pass:
  - KAH125LTMFA, KAH125LTMFB User Guide PDF:
    https://assets.kogan.com/files/usermanuals/KAH125LTMFA_KAH125LTMFB_UG_V1.1.pdf
  - KAH75BARFRA User Guide PDF:
    https://assets.kogan.com/files/usermanuals/KAH75BARFRA_UG.pdf
  - KAM43BEVFGA, KAM93BEVFGA User Guide PDF:
    https://assets.kogan.com/files/usermanuals/KAM43BEVFGA-KAM93BEVFGA_UG.pdf
- Gap still open:
  - Direct official PDF for KAH085LTMFA was not found in this pass

#### CHIQ 470mm, pending evidence

- `fridge-arf3374` `CBC064BG`
- `fridge-arf3375` `CBC094BG`
- `fridge-arf3202` `CSR046DW`
- `fridge-arf3200` `CTM086DW`

Required PDF links to verify before adoption:

- Installation or user manual PDF for each model with one of:
  90 degree door opening depth, door projection, hinge clearance diagram
- Located links in this pass:
  - CHIQ user manual index page:
    https://www.chiq.com.au/pages/user-manual-download
  - CTM086DW User Manual PDF:
    https://cdn.shopify.com/s/files/1/0714/2345/9578/files/CTM086DW_USER_MANUAL.pdf?v=1746608179
  - CSR046DW User Manual PDF:
    https://cdn.shopify.com/s/files/1/0714/2345/9578/files/CSR046DW_USER_MANUAL.pdf?v=1746600357
  - CBC064BG User Manual PDF:
    https://cdn.shopify.com/s/files/1/0714/2345/9578/files/CBC064BG_USER_MANUAL.pdf?v=1745908962
  - CBC094BG User Manual PDF:
    https://cdn.shopify.com/s/files/1/0714/2345/9578/files/CBC094BG_USER_MANUAL.pdf?v=1745910232

### Notes For Next Apply Pass

If CHIQ 700mm is accepted, apply:

`node scripts/add-door-swing.js --ids fridge-arf3724,fridge-arf2511,fridge-arf3720,fridge-arf3384 --value 20`

Leave Kogan 480mm and CHIQ 470mm as unresolved until manual PDFs are attached in this notes file.

### PDF Extraction Results, 2026-04-16

Source links checked:

- https://assets.kogan.com/files/usermanuals/KAH125LTMFA_KAH125LTMFB_UG_V1.1.pdf
- https://assets.kogan.com/files/usermanuals/KAH75BARFRA_UG.pdf
- https://assets.kogan.com/files/usermanuals/KAM43BEVFGA-KAM93BEVFGA_UG.pdf
- https://cdn.shopify.com/s/files/1/0714/2345/9578/files/CTM086DW_USER_MANUAL.pdf?v=1746608179
- https://cdn.shopify.com/s/files/1/0714/2345/9578/files/CSR046DW_USER_MANUAL.pdf?v=1746600357
- https://cdn.shopify.com/s/files/1/0714/2345/9578/files/CBC064BG_USER_MANUAL.pdf?v=1745908962
- https://cdn.shopify.com/s/files/1/0714/2345/9578/files/CBC094BG_USER_MANUAL.pdf?v=1745910232

Applied extraction rule in this pass:

- When manual provides W, D and a full-open space dimension B in the space-demand table, use `door_swing_mm = B - D`.
- This is treated as full-open requirement class, `400+` range.

Adoptable from PDF data:

- `fridge-arf3758` KAH125LTMFA, extracted from KAH125 manual:
  D=530, G=960 at 90 degree, inferred full-open clearance `430` mm
- `fridge-arf3200` CTM086DW:
  D=498, B=925, inferred full-open clearance `427` mm
- `fridge-arf3202` CSR046DW:
  D=447, B=874, inferred full-open clearance `427` mm
- `fridge-arf3374` CBC064BG:
  D=439, B=883, inferred full-open clearance `444` mm
- `fridge-arf3375` CBC094BG:
  D=439, B=883, inferred full-open clearance `444` mm

PDF check done, no data found:

- `fridge-arf3160` KAH75BARFRA:
  PDF parsed, no 90 degree door-open dimension or equivalent door projection value found
- `fridge-arf2743` KAM43BEVFGA:
  PDF parsed, installation clearances found only (top and side ventilation), no door-open projection value
- `fridge-arf2749` KAM93BEVFGA:
  same manual as KAM43BEVFGA, no door-open projection value

## Dometic Audit, 2026-04-16

Scope:

- Brand `Dometic`, fridge records in `appliances.json`
- Total audited: 18

Decision rule used for this pass:

- If installation data indicates a side-hinged door assembly that projects beyond cabinet body in recess installs, set `door_swing_mm = 20`.
- If product is drawer type with no side-hinged 90 degree swing, set `door_swing_mm = 0`.

Manual and spec sources checked:

- RUC install manual with recess and overall dimensions:
  https://www.dometic.com/externalassets/ruc8408x_9600028645_119246.pdf
- NRX install manual with recess and fitment dimensions:
  https://www.caravansplus.com.au/pdf/Dometic-NRX-Fridge-installation-2.pdf
- RCD10.5XES installation manual with recess and overall dimensions:
  https://www.rvworldstore.co.nz/media/wysiwyg/manuals2/RCD10_5XES_Manual_1.pdf
- DM50C D product page showing `Hinge type` as `Drawer`:
  https://www.dometic.com/en-au/product/dometic-dm50c-d-9105330215
- CL460LDC install and operating manual family:
  https://www.manualslib.es/manual/229811/Dometic-Cl460Ldc.html
- C40 and C60 minibar install manual family:
  https://www.dometic.com/en/professional/hospitality-solutions/minibars/c40gr2-265469?v=9620000663

Applied value `20`:

- `fridge-arf2731` C40G1
- `fridge-arf2716` C40G2
- `fridge-arf3047` C60S1
- `fridge-arf3325` C60SFS CARE
- `fridge-arf2514` CL460LDC
- `fridge-arf2506` CL460LGC
- `fridge-arf2513` CRX1110
- `fridge-arf2488` CRX1140
- `fridge-arf3187` NRX1115
- `fridge-arf3173` NRX1130
- `fridge-arf3172` RCD10.5XES
- `fridge-arf2730` RUC5208X
- `fridge-arf3326` RUC5308X
- `fridge-arf2738` RUC6408X
- `fridge-arf3320` RUC6508X
- `fridge-arf2729` RUC8408X
- `fridge-arf3319` RUC8508X

Applied value `0`:

- `fridge-arf2512` DM50C D
