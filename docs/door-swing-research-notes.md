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
