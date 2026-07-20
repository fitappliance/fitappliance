# FitAppliance Product Core Brief

Status: canonical product memory
Last verified: 2026-07-19
Product: [fitappliance.com.au](https://www.fitappliance.com.au)
Repository: `/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2`

This is the durable product, data, evidence, and Fit-decision brief for
FitAppliance. Future plans and implementations must start here, then consult
the Architecture V2 acceptance and remediation documents for implementation
detail. Time-sensitive counts and provider capabilities must be re-verified
before use.

The active cross-cutting workflow-repair authority is the
[FitAppliance System-First Repair Control Plan](superpowers/plans/2026-07-20-fitappliance-system-first-repair-control-plan.md).
Earlier phase and scale plans remain implementation history unless that control
plan explicitly delegates work back to them.

## 1. Product Problem and Commercial Model

Australian appliance retailers generally optimise product discovery around
category, brand, features, and price. Buyers replacing a large or built-in
appliance still have to measure their finished space, open many product pages,
find dimensions in inconsistent locations, and separately interpret
installation manuals. Product dimensions alone also omit ventilation,
door/lid travel, hoses, sockets, drainage, and delivery access.

FitAppliance is a pre-purchase fit-screening tool for Australian homes. A user
supplies the relevant site measurements and constraints; FitAppliance returns
products whose documented physical, installation, operation, and service
requirements are compatible with those inputs. The buyer can then refine the
shortlist by brand, price, features, and retailer.

The commercial model is affiliate referral. FitAppliance earns a commission
when a user follows a disclosed partner link and completes a purchase. Retailer
commercial relationships must never strengthen evidence or Fit labels.

FitAppliance is not an installer, engineer, certifier, electrician, or plumber.
Its strongest defensible promise is:

> Verified for the measurements supplied and the documented installation
> conditions available for this exact model.

It must not promise an unconditional or universal "perfect fit".

## 2. Non-Negotiable Product Principles

1. Product identity, current sale status, dimensions, installation requirements,
   and commercial links are separate facts with separate sources.
2. A downloaded or parsed PDF is candidate evidence, not verified evidence.

### 2.1 Two independent search contracts

FitAppliance has two separate user intents and they must not share decision
semantics:

- **Cavity search:** the user enters available site space. The Fit engine may
  apply installation, operation, service, ventilation and evidence rules.
- **Old-appliance replacement:** the user enters or selects the old appliance
  outside W/H/D. The Replacement Match Engine ranks current retailer-backed
  products by direct `new - old` axis differences. It must not call
  `FitDecision`, convert the old appliance to a cavity, add a fixed clearance
  buffer, or describe the result as a Fit verdict.

Historical and unavailable models may be replacement inputs, but never outputs.
Replacement outputs must be current retailer products with complete W/H/D.
Slightly larger products remain visible; signed differences tell the user which
axes are larger or smaller. Any installation conclusion requires a separate
cavity search.
3. Government, retailer, GS1, Icecat, and manufacturer data may all contain
   errors or different measurement scopes. No source bypasses field-level
   validation.
4. Exact-model evidence is required. Family, sibling, colour, regional, and
   suffix variants remain quarantined unless a field-scoped official bridge is
   proven.
5. Unknown remains `null`/`UNKNOWN`. It is never converted to `0`, `false`, or a
   category default in a verified result.
6. Closed-product dimensions, installation clearance, operation space, service
   space, and packaged/delivery dimensions are different geometries.
7. Adjustable dimensions remain ranges. Fit uses the conservative endpoint
   relevant to the check and preserves the original range for users.
8. Any hard incompatibility produces `NO_FIT`. A weighted score cannot override
   it.
9. Evidence provenance survives every transformation through publication.
10. Public claims must be evidence-backed and reproducible. Affiliate incentives
    never alter ranking truth or Fit truth.

## 3. Current Production Baseline

The 2026-07-12 production acceptance established:

- 3,521 public products;
- 77 physical PDF files representing 69 unique hashes;
- 69/69 current MinerU `content_list_v2` indexes;
- 21 receipt-bound dimension products, up from one;
- zero receipt-bound `VERIFIED_FIT` products;
- zero publication violations;
- nine historical identity-failure cases: eight resolved and one quarantined;
- three adjustable-height products published as 850-895 mm ranges;
- 286 Architecture V2 tests and 1,590 full tests passing at delivery.

Zero `VERIFIED_FIT` is currently a safety result, not a failure. Most exact-model
sources still omit one or more applicable installation, operation, or service
requirements.

Detailed evidence:

- [`architecture-v2/core-technology-acceptance-2026-07-12.md`](architecture-v2/core-technology-acceptance-2026-07-12.md)
- [`architecture-v2/pdf-brand-acceptance-2026-07-12.md`](architecture-v2/pdf-brand-acceptance-2026-07-12.md)
- [`superpowers/specs/2026-07-12-historical-mineru-publication-coverage-design.md`](superpowers/specs/2026-07-12-historical-mineru-publication-coverage-design.md)
- [`superpowers/plans/2026-07-12-historical-mineru-publication-coverage.md`](superpowers/plans/2026-07-12-historical-mineru-publication-coverage.md)

## 4. Data Strategy: Multi-Source Evidence Broker

PDF-only acquisition is not the target architecture. A single commercial data
provider is also insufficient because product master data rarely contains all
installation and service geometry.

The target is a multi-source evidence broker:

```text
retailer and affiliate observations
        -> current-sale candidates and prices

Australian government registries
        -> exact market identity, registration, compliance, candidate W/H/D

GS1 / Icecat / direct manufacturer feeds
        -> structured product master data, GTINs, variants, documents, media

exact-model manufacturer PDF / HTML / CAD
        -> installation, operation, service, and connection requirements

field receipts + conflict policy
        -> geometry_v2 + FitDecision + public projection
```

Every source enters as an observation or candidate claim. Publication requires
identity validation, semantic field binding, source receipts, conflict checks,
and the relevant release gate.

## 5. External Data Research Baseline

### 5.1 Australian Energy Rating registered-product data

The Australian Government Energy Rating Product Database contains data supplied
when products are registered for sale in Australia or New Zealand. Data.gov.au
publishes category CSV files under Creative Commons Attribution 3.0 Australia.
The four FitAppliance categories include brand, model, country/market,
availability, registration identifiers, energy fields, product URLs, and
Width/Height/Depth columns.

Primary references:

- [Registered appliance and equipment data](https://www.energyrating.gov.au/about-us/gems-regulator/registered-appliance-and-equipment-data)
- [Energy Rating labelled-products dataset](https://data.gov.au/data/dataset/energy-rating-for-household-appliances)
- [Energy Rating label and data integration guidance](https://www.energyrating.gov.au/industry-information/understand-requirements/labelling/displaying-label-and-icon)

The 2026-07-12 CSV snapshot was downloaded and compared with the local public
catalogue using normalized exact `brand + model` keys.

| Category | AU Available rows | Unique models | Unique models with W/H/D | Catalog exact identity | Catalog exact + W/H/D | Current dimensions agree | Conflicting registry keys |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Dishwasher | 1,285 | 1,125 | 822 | 416 | 375 | 288 | 31 |
| Dryer | 804 | 765 | 489 | 92 | 71 | 60 | 5 |
| Fridge/freezer | 3,710 | 3,514 | 2,939 | 1,169 | 1,136 | 966 | 25 |
| Clothes washer | 1,304 | 1,234 | 764 | 408 | 353 | 318 | 0 |
| **Total** | **7,103** | **6,638** | **5,014** | **2,085** | **1,935** | **1,632** | **61** |

Across the 3,518 products in the four category files, exact identity coverage
was 59.3% and exact identity with government W/H/D was 55.0%. Of 1,935 matched
products with dimensions, 303 disagreed with the current catalogue.

The government data is therefore valuable but not publication truth by itself:

- `EQE6160BA` was registered as W 1782 x H 913 x D 749, while the exact
  manufacturer factsheet proves W 913 x H 1782 x D 749.
- `WHE5264SC` had the same width/height inversion pattern.
- `HDW15F3S1` was registered as 598 x 850 x 610, while exact-model installation
  evidence supports W 597, adjustable H 850-895, and D 599.
- some exact registry keys have multiple, conflicting dimension triplets.

Policy: use Energy Rating data as a high-value identity, registration, market,
and candidate-dimension source. Dimensions must pass axis, duplicate,
plausibility, source-agreement, and exact-document checks before promotion.

Snapshot hashes:

| File | SHA-256 |
| --- | --- |
| Dishwasher CSV | `f38af6b50c49bd808318d4b3b361a77666b31a0ff1286e52309fc1ffc0cab5a8` |
| Dryer CSV | `dc1d443dac44ad3310356376df8e3418caed7265f99105f6918141cf5f3ff099` |
| Fridge/freezer CSV | `cceb22f8a1879ee66cfd0c929a78c441bd08f18933f8ba6a0ae1d1efec202775` |
| Clothes washer CSV | `f31f1981b00e48f7816f7de678d71fccd18bdecb702b780211389dd63e2009a3` |

The temporary files used for this research are not repository inputs. A future
ingestion implementation must discover current CKAN resources, retain licensed
raw snapshots on external evidence storage, and produce a deterministic audit.

### 5.2 WELS Product Register

The Water Efficiency Labelling Scheme registers dishwashers and clothes washing
machines using brand, model name, model code, and registration number. The
official register states that supplied brand/model details must match the
registration, distinguishes Registered/Ceasing/Expired status, refreshes
frequently, and provides an overnight full Excel export.

References:

- [WELS Product Register help](https://wels-public-register.environment.gov.au/help/)
- [Data.gov.au WELS dataset record](https://data.gov.au/data/dataset/wels)

Policy: WELS is a strong exact-identity, variant, registration, and Australian
sale-status source for washers and dishwashers. It is not a source of cavity,
clearance, water-connection geometry, or drainage geometry.

### 5.3 EESS

The Electrical Equipment Safety Scheme provides responsible-supplier,
equipment-registration, and certification records for in-scope electrical
equipment in Australia and New Zealand.

Reference: [EESS Registration Database](https://www.eess.gov.au/registration/eess-registration-database/)

Policy: EESS can support market identity, responsible-supplier, and compliance
checks. It must not be treated as dimensional or installation evidence unless
an exact field is actually present and independently validated.

### 5.4 GS1 Australia NPC and GDSN

The GS1 Australia National Product Catalogue supports real-time product and
image exchange between trading partners. GS1 also defines a standard method for
product and package Width/Height/Depth axes.

References:

- [GS1 Australia National Product Catalogue](https://www.gs1au.org/services/data-and-content/national-product-catalogue)
- [GS1 Package and Product Measurement Standard](https://www.gs1.org/standards/gs1-package-and-product-measurement-standard/current-standard)

Policy: investigate FitAppliance becoming a data recipient. Before paying or
integrating, obtain a target-brand/category sample and written answers on:

- Australian exact-SKU and GTIN coverage;
- consumer-unit versus packaging dimensions;
- product lifecycle and availability fields;
- document, image, and variant links;
- recipient rights to cache, transform, cite, and publicly display fields;
- update cadence, delta delivery, fees, and termination handling.

NPC/GDSN should not be assumed to contain installation clearance, water, power,
drainage, ventilation, or operation envelopes.

### 5.5 Icecat

Icecat offers standardized product data in XML, CSV, JSON, and HTML. Open
Icecat distributes brand-authorized data for sponsoring brands; Full Icecat
offers wider paid coverage. Datasheets may include specifications, documents,
manuals, PDFs, images, and variant relationships.

Reference: [Icecat structured product content](https://icecat.com/structured-data-content-users/)

Policy: run a no-commit coverage probe against the priority Australian exact
SKUs before subscribing. Measure exact identity, W/H/D scope, installation
field coverage, document URLs, freshness, AU suffix handling, and licence terms.
Do not infer that global or family coverage means Australian exact-SKU coverage.

### 5.6 Direct manufacturer and trade channels

Direct brand outreach is feasible and should target product-data, PIM,
e-commerce, trade/specifier, and technical-content teams rather than only
consumer support. Fisher & Paykel's Australian Trade Resources already exposes
comprehensive dimensions, datasheets, CAD, installation guides, a trade portal,
and Design Support contact paths.

Reference: [Fisher & Paykel Australia Trade Resources](https://www.fisherpaykel.com/au/trade-resources/)

The initial outreach priority by 2026-07-12 active catalogue size is:

| Priority | Brand | Active products | Receipt-bound products at baseline |
| ---: | --- | ---: | ---: |
| 1 | Fisher & Paykel | 205 | 3 |
| 2 | Bosch | 147 | 1 |
| 3 | Haier | 132 | 3 |
| 4 | LG | 131 | 1 |
| 5 | Westinghouse | 117 | 3 |
| 6 | Smeg | 96 | 1 |
| 7 | Samsung | 92 | 4 |
| 8 | Beko | 82 | 0 |
| 9 | Hisense | 78 | 1 |
| 10 | Electrolux | 52 | 0 active / 1 historical |

The standard request package should ask for:

- Australian current and discontinued SKU lists;
- brand, exact model, GTIN/EAN, variant and regional suffix relationships;
- physical W/H/D with explicit axis and measurement scope;
- installation, ventilation, door/lid, service, water, power, and drainage data;
- official product, installation guide, specification sheet, and CAD URLs;
- product lifecycle and update cadence;
- machine-readable CSV/XML/JSON/API delivery and delta support;
- rights to cache, normalize, cite, and display factual fields;
- separate permissions for images, documents, logos, and marketing copy.

## 6. Source Role and Publication Matrix

| Source | Primary role | May establish exact model? | May establish W/H/D? | May establish installation/service fields? | Publication rule |
| --- | --- | --- | --- | --- | --- |
| Retailer/affiliate feed | current sale, URL, price, image candidate | candidate/observation | hint only | no | timestamped retailer observation |
| Energy Rating CSV | AU/NZ registration, market, identity, energy, candidate dimensions | yes, subject to duplicate/conflict checks | candidate; never blind overwrite | no | receipt plus corroboration/anomaly gate |
| WELS | washer/dishwasher identity, variant, status, water rating | yes | no | no | identity/status receipt |
| EESS | supplier/equipment compliance identity | supporting | no | no | supporting receipt only |
| GS1 NPC/GDSN | product master data and standardized trade-item geometry | yes when exact GTIN/model | candidate after product/package scope validation | not assumed | contract and field-level receipt required |
| Open/Full Icecat | standardized content, documents, media, variants | candidate to strong, depending on brand authorization | candidate after scope validation | candidate only | licence and exact-SKU checks required |
| Manufacturer HTML | exact product and structured specs | yes | yes | yes when explicit | official-source receipt |
| Manufacturer PDF/QRG/CAD | exact installation and geometry truth | yes | yes | primary source | MinerU/CAD extraction plus field receipt |
| Standards/regulator guidance | normative safety/compliance rules | no | no | category/jurisdiction rule only | cite public guidance or licensed material |

## 7. Installation Knowledge Base

Installation knowledge must be stored as claims, not prose summaries or brand
defaults. Each claim requires:

- canonical product and exact model identity;
- field path and typed value;
- unit and range semantics;
- applicability condition and form factor;
- source URL, content hash, page/fragment/bbox or structured locator;
- quote or diagram label;
- author type, transport host, jurisdiction, and language;
- retrieval date, parser/model/policy versions, and receipt binding;
- conflict, supersession, quarantine, and publication state.

### 7.1 Knowledge layers

1. `normative_rule`: public regulatory guidance or licensed standard content.
   It provides jurisdiction/category obligations, not product dimensions.
2. `model_requirement`: exact-model manufacturer requirements. This is the only
   layer that can establish product installation and service geometry.
3. `site_observation`: user-supplied measurements and connection locations,
   including measurement method and uncertainty.
4. `advisory_heuristic`: clearly labelled non-verified guidance. It can explain
   risk but cannot produce `VERIFIED_FIT`.

### 7.2 Required field families

#### Physical and adjustable envelope

- body width, height range, and depth;
- handle/control/door protrusions where measurement scope differs;
- adjustable feet, removable doors, trim, and levelling ranges;
- packaged dimensions, weight, and removable delivery components separately.

#### Installation and ventilation

- left, right, top, rear, and front installation clearances;
- enclosed, freestanding, under-bench, stacked, alcove, and cabinetry rules;
- intake/exhaust ventilation openings and prohibited obstruction zones;
- anti-tip, anchoring, floor strength, level, and ambient-temperature conditions.

#### Operation

- door-open depth and angle;
- hinge-side space and adjacent-wall restrictions;
- lid-open height;
- drawer/rack/pull-out projection;
- required user standing or loading space where explicitly documented.

#### Water supply

- applicability as `true`/`false`/`unknown`, never default false;
- hot/cold/plumbed-water requirements;
- inlet connection type and size;
- pressure/temperature limits;
- hose length and permitted extension;
- connection location or allowed zone relative to the product/cabinet.

#### Power supply

- voltage, frequency, current/power, plug type, and dedicated-circuit requirement;
- cord length and exit location;
- socket accessibility and allowed/prohibited placement zones;
- hardwired versus plug-connected installation;
- licensed-electrician or jurisdictional validation requirement.

#### Drainage

- drain hose length and route;
- standpipe/spigot compatibility;
- minimum/maximum drain height;
- high-loop, air-gap, fall, bend, and backflow constraints when documented;
- rear service zone consumed by hoses and fittings.

#### Delivery

- package/body dimensions and weight;
- minimum doorway, hallway, lift, stair and turning constraints;
- door removal and reassembly conditions;
- delivery-path uncertainty kept separate from cavity Fit.

### 7.3 Regulatory boundary

AS/NZS 3000 and the AS/NZS 3500 plumbing and drainage series are relevant to
electrical and plumbing installation, but standards content is not assumed to
be freely reusable. FitAppliance may encode public regulator guidance or
properly licensed requirements, and should otherwise direct users to licensed
trades and exact manufacturer instructions.

Reference: [Standards Australia overview of AS/NZS 3500](https://www.standards.org.au/blog/spotlight-on-as-nzs-3500)

## 8. FitDecision Target Architecture

The current shared Fit engine already uses hard axis checks and tri-state
`PASS`/`FAIL`/`UNKNOWN` outcomes. Preserve this architecture and extend it; do
not replace it with a weighted Fit score.

### 8.1 Inputs

- exact-model `geometry_v2` and field receipts;
- category and form-factor applicability contract;
- user site profile: finished minimum W/H/D, measurement uncertainty, adjacent
  walls/cabinetry, floor/skirting, door/lid path, service points and zones,
  ventilation/duct, and delivery path where selected;
- jurisdiction and professional-validation requirements;
- rule/evidence version and evaluation timestamp.

The cavity should use the minimum of multiple user measurements. Product and
installation ranges should use the conservative maximum for required space.
Measurement uncertainty must be represented explicitly rather than hidden in a
generic 10 mm penalty.

### 8.2 Checks

Checks are independent, explainable, and typed as hard or advisory:

- closed-envelope placement;
- manufacturer clearance/ventilation;
- operation envelope;
- water inlet compatibility and reach;
- power compatibility and connection-zone reach;
- drainage compatibility and reach;
- category-specific rear service envelope;
- delivery path;
- professional/jurisdictional validation.

Each check returns `PASS`, `FAIL`, `UNKNOWN`, or `NOT_APPLICABLE`, plus required,
available, spare/margin when numeric, evidence references, and a user-readable
reason.

### 8.3 Outcome precedence

1. Any applicable hard `FAIL` -> `NO_FIT`.
2. Missing hard placement evidence or required site input ->
   `INSUFFICIENT_DATA`.
3. Placement passes but an applicable operation/service/professional check is
   unknown or requires confirmation -> `CONDITIONAL_FIT`.
4. All applicable hard checks pass, but one or more requirements use explicit
   estimates -> `LIKELY_FIT_ESTIMATED`.
5. All applicable hard checks pass using exact-model, receipt-bound evidence and
   adequate site inputs -> `VERIFIED_FIT`.

`VERIFIED_FIT` is scoped to the user's supplied measurements and documented
conditions. It is not a substitute for code compliance or licensed
installation.

### 8.4 Numeric scoring

A 0-100 number may rank products only within the same outcome class. It may
summarize dimensional margin, evidence completeness, or installation complexity,
but it must remain separate from Fit truth:

- a high score cannot override `NO_FIT`, `UNKNOWN`, or missing evidence;
- a low positive margin does not become a failure if all hard requirements pass;
- `INSUFFICIENT_DATA` suppresses a misleading score;
- UI must display the outcome and limiting checks before the score.

This is also the safer claims posture under Australian Consumer Law, which
requires advertised claims to be accurate, truthful, and supported by
reasonable grounds.

Reference: [ACCC false or misleading claims guidance](https://www.accc.gov.au/business/advertising-and-promotions/false-or-misleading-claims)

## 9. Roadmap

### Phase A: Official registry shadow ingestion

- discover current Energy Rating CKAN resource URLs rather than hard-code dated
  filenames;
- download Energy Rating and WELS data to immutable external snapshots;
- record licence, retrieval time, URL, bytes, and SHA-256;
- normalize exact brand/model/registration identifiers without fuzzy approval;
- classify missing W/H/D, invalid values, duplicate registrations, axis
  anomalies, and conflicting dimension triplets;
- join in shadow mode and publish no changed dimensions;
- produce coverage, conflict, and current-sale disagreement reports.

### Phase B: 100-model installation knowledge pilot

Recommended scope pending owner approval:

- 50 active refrigerators across priority brands;
- 50 active dishwashers across priority brands.

This pair gives the strongest early learning: refrigerators stress ventilation,
hinges, doors and optional plumbing; dishwashers stress niche geometry, door
operation, water, power, drainage and rear services.

For each model, collect all applicable field families, not only W/H/D. Record
unavailable facts as explicit gaps rather than estimates.

### Phase C: Provider and brand channel probes

- request a target-SKU sample and rights matrix from GS1 Australia NPC;
- test Open Icecat exact-AU-SKU coverage before considering Full Icecat;
- approach the ten priority brands with the standard data request package;
- register for relevant trade/specifier portals where terms permit;
- compare coverage, freshness, data rights, integration effort, and annual cost;
- do not buy a provider based on headline catalogue size.

### Phase D: Service-geometry domain model

- extend Architecture V2 with typed water, power, drain, ventilation and
  connection-zone contracts;
- preserve `true`/`false`/`unknown` applicability;
- add model-requirement and site-observation schemas;
- add evidence receipts and supersession/conflict rules for every new field;
- keep legacy boolean/default-zero fields outside verified publication.

### Phase E: Fit engine extension and shadow evaluation

- extend category contracts and site-profile inputs;
- implement hard/advisory check definitions and deterministic precedence;
- add golden cases for exact pass, hard fail, unknown, conditional, estimate,
  range, connection reach, and contradictory evidence;
- shadow-run against production without changing user-visible verdicts;
- audit false accepts, false rejects, unknown reasons, and category coverage.

### Phase F: Controlled public rollout

- release one category and one outcome class at a time;
- require zero provenance and false-accept violations;
- verify generated pages, public JSON, desktop/mobile browser flows, analytics,
  and stale-client behaviour;
- keep rollback artifacts and compare live outcomes before expanding coverage.

### 9.1 Implementation checkpoint: official registry and Fit V3 pilot

The first shadow pilot was approved and executed on 2026-07-12. Its durable
design, task framework, source assessment and outreach package are:

- [Official Registry, Installation Knowledge, and Fit V3 Design](superpowers/specs/2026-07-12-official-registry-installation-fit-v3-design.md)
- [Official Registry, Installation Knowledge, and Fit V3 Implementation Plan](superpowers/plans/2026-07-12-official-registry-installation-fit-v3.md)
- [Product Data Source and Brand Outreach Package](architecture-v2/product-data-source-outreach.md)

Current implementation facts:

- Energy Rating metadata, refrigerator, dishwasher, dryer and washing-machine
  CSVs, plus the complete WELS register CSV are stored as six immutable external
  SHA-256 objects. A second acquisition reproduced the same six-object manifest,
  proving idempotent replay.
- The live snapshots contained 3,985 Energy Rating refrigerator rows, 1,426
  dishwasher rows, and 73,855 WELS rows. The WELS normalizer identified 2,652
  dishwasher rows, 696 of which were Registered or Ceasing.
- Exact Energy Rating reconciliation across the scoped catalogue found 1,258
  consistent identities, 203 dimension conflicts, 27 suspected axis
  permutations, 23 internal registry conflicts, 74 exact records without full
  W/H/D, and 1,103 products without an active exact match. No registry dimension
  was promoted.
- The frozen pilot contains 50 currently listed refrigerators and 50 currently
  listed dishwashers, with a 90-day retailer-verification limit and an eight
  product per-brand cap. It deliberately includes clean, conflicting, and
  recovery cases.
- The form-factor gate identified 48 upright/front-opening refrigerator cases
  and two chest freezers. Chest freezers require lid-open height; they are not
  assigned front-door or hinge-side requirements.
- Within the 50 dishwasher pilot, WELS produced 42 current Registered exact
  identity matches, four Expired matches, three identity conflicts, and one no
  match. These results remain identity/status evidence only.
- Seven pilot products currently have legacy V2 receipt-bound closed-envelope
  dimensions, but those receipts do not yet carry every V3 exact-model,
  current-source and applicable-model attestation. V3 placement readiness is
  therefore zero, none is eligible for `VERIFIED_FIT`, and all 100 remain in
  the research queue for V3 re-attestation and missing installation fields.
- The Fit V3 contract now requires current exact-model receipt and fragment
  hashes, form-factor-specific operation evidence, ventilation, water pressure,
  power capacity, drainage height/high-loop, delivery path, professional
  installation applicability, and sufficiently precise site observations.
- The shadow isolation audit reports zero public hash drift, zero dimension
  promotions, zero false `VERIFIED_FIT` eligibility, and zero object replay
  failures.

The pilot is not a public data release. It is the acceptance harness for later
exact-model PDF, brand-feed, GS1, or Icecat evidence work.

### 9.2 Implementation checkpoint: historical reference and replacement matching

The first four-category historical reference release was generated from the
2026-07-12 official snapshot batch and the receipt-gated public catalogue.
Durable design and implementation details are in:

- [Historical Appliance Reference and Replacement Match Engine Design](superpowers/specs/2026-07-12-historical-reference-replacement-engine-design.md)
- [Historical Appliance Reference and Replacement Match Engine Plan](superpowers/plans/2026-07-12-historical-reference-replacement-engine.md)

Measured release facts:

- four Energy Rating CSVs contained 7,710 raw rows; 7,149 rows named Australia
  as a market, including current and unavailable/superseded registrations;
- exact category/brand/model grouping plus catalogue-only identities produced
  8,095 historical reference records: 4,336 refrigerators, 1,419 dishwashers,
  843 dryers and 1,497 washing machines;
- retail lifecycle is independent: 1,384 records are current retailer products,
  2,134 are archived catalogue identities and 4,577 are registry-only;
- dimension disposition is independent: 11 receipt-bound catalogue records may
  auto-fill, 4,940 registry-consistent records require explicit user
  confirmation, 3,054 identity-only records require measurement, and 90
  conflict/invalid records are quarantined from dimension publication;
- 12 exact identities exist only in inactive Australian registry rows and 33
  combine active and inactive registry rows;
- public files are category-split and lazy-loaded, total approximately 1.95 MB;
  they contain identity, lifecycle, evidence action and accepted W/H/D only;
- public history has no prices, retailers, affiliate links, clearance, Fit
  outcomes, product routes or sitemap entries and is served with
  `X-Robots-Tag: noindex`;
- the runtime audit executes replacement search with a deliberately throwing
  FitEngine and still succeeds, proving the independent call path;
- EQE6160BA and WHE5264SC remain permanent W/H-axis canaries: receipt-bound
  dimensions win while the government conflict remains visible internally;
  HDW15F3S1 remains confirmation-only, not auto-fill.

### 9.3 Coverage-recovery diagnosis (2026-07-13)

The `11 / 4,940 / 3,054 / 90` split is not an acceptable steady state. It is
also not evidence that MinerU succeeds on only 11 products. The current release
mix combines three separate conditions:

- 4,951 records, or 61.2%, already expose a complete W/H/D triplet: 11 from
  receipt-bound catalogue evidence and 4,940 from internally consistent Energy
  Rating rows that still require user confirmation;
- 3,054 records have no publishable triplet. Of these, 1,630 have registry rows
  with missing dimensions and 1,424 have catalogue dimensions without a V2
  receipt;
- only 69 unique historical PDF files had been passed through the current MinerU
  cache at the time of this audit. The 11 auto-fill records therefore measure
  completed evidence migration, not parser capability.

The historical source-document registry contains a much larger recoverable
backlog. The deterministic recovery queue currently identifies:

- 1,600 legacy documents with exact identity and complete legacy W/H/D hints;
- 1,556 unique fetch jobs after URL deduplication;
- 1,591 unique historical target nodes backed by 1,600 candidate edges; nine
  targets retain two candidate documents rather than becoming duplicate work;
- 1,092 targets are `MEASURE_REQUIRED`, 472 are `CONFIRM_REQUIRED`, and 27 are
  quarantined conflict targets;
- 1,064 of the 1,115 current-retail `MEASURE_REQUIRED` references, or 95.4%, as
  having at least one exact-identity, complete legacy document candidate;
- only 23 jobs ready for direct official receipt rebuilding, 254 requiring
  official-host author validation, 1,223 retailer mirrors that must lead to an
  official equivalent, and 56 requiring new official-source discovery.

This establishes an architecture and throughput failure: historical acquisition
found many candidates, but legacy source discovery, content-addressed fetching,
MinerU extraction, field receipts, and historical publication were never joined
into one resumable production path.

The conservative publication policy remains necessary. Among 1,897
registry-confirmation records that also have complete catalogue W/H/D, 262
disagree and 28 are direct axis permutations. Registry consistency means that
registry rows agree with each other; it does not prove that width, height and
depth are physically correct. Legacy dimensions therefore remain hints until
the exact-model document proves axis meaning and measurement scope.

The repair programme is defined in
[Historical Evidence Coverage Recovery Plan](superpowers/plans/2026-07-13-historical-evidence-coverage-recovery.md).
Its first artifact is
`data/architecture-v2/reviews/automated/historical-evidence-recovery-queue.json`.
The queue downloads a shared document once but retains separate model targets,
and every target must pass fetch/hash, MinerU JSON, exact identity, axis/range
semantics, official authority, conflict checks, and receipt-bound projection.
Queue inclusion never makes a dimension public.

Runtime catalogue ownership:

- `data/catalog-final.json`, Architecture V2 evidence artifacts and
  `data/popularity-research.json` are build inputs; `public/data/appliances.json`
  and its category splits are generated runtime projections, not independent
  databases;
- scheduled retailer research must rebuild the canonical runtime projection and
  run the historical replacement audit. It must not write a second competing
  interpretation directly into public JSON;
- a successful retailer observation may update that retailer's price and
  verification date, but matching must preserve Affiliate, dimension-hint and
  provenance fields. An omitted retailer is not removal evidence because the
  current research schema cannot distinguish an unavailable page from a fetch
  failure;
- canonical non-empty product display names are preserved. Generated display
  names are fallback-only.

Evidence and lifecycle rules:

- `CATALOG_RECEIPT -> AUTO_FILL` uses exact receipt-bound outside dimensions;
- `REGISTRY_CONSISTENT -> CONFIRM_REQUIRED` shows official candidate W/H/D only
  after the user confirms against the label, manual or measurement;
- `IDENTITY_ONLY -> MEASURE_REQUIRED` publishes identity without dimensions;
- conflict, invalid or axis-suspect candidate dimensions are not exposed;
- fuzzy and prefix matches are suggestions only. Exact brand+model or a unique
  exact model is required for automatic identity resolution.

Refresh and rollback:

- immutable source objects live under
  `/Volumes/UGREEN-1TB/FitAppliance/registries/objects/sha256/` and are addressed
  by content hash;
- run official acquisition and `npm run refresh:historical-reference` weekly,
  before a material catalogue release, or when an official resource changes;
- ordinary builds republish committed derived artifacts and do not require the
  external drive. Historical staleness is checked against a deterministic
  semantic binding of exact identity, current-retail state, accepted product-page
  URLs and receipt-bound geometry evidence;
- prices, priority scores, presentation copy and Affiliate metadata are excluded
  from that binding because they do not alter historical lookup identity,
  lifecycle or accepted W/H/D. Identity, lifecycle, product-page and receipt
  geometry changes still fail the audit until the historical reference is
  rebuilt;
- every refresh must preserve source URL, retrieval time, bytes, SHA-256 and CC
  BY 3.0 AU attribution, then pass the historical replacement audit;
- rollback by reverting the reference, publication manifest, four public files,
  meta file and audit as one commit, then redeploying that exact commit. Immutable
  source snapshots remain available for replay.

### 9.4 Coverage-recovery implementation checkpoint (2026-07-13)

The resumable Architecture V2 recovery path is implemented and verified on the
release branch. These are branch/release-candidate facts, not a claim that the
live website has already deployed the changes:

- the queue contains 1,556 content-deduplicated jobs and 1,591 exact target
  nodes: 23 direct official rebuilds, 254 official-host validations, 56
  official-source discovery jobs and 1,223 retailer-mirror rediscovery jobs;
- the direct resolver migration exercised 23 brands and 24 targets. The full
  official-host route accounted for 288 targets with 89 accepted and 199 typed
  terminal outcomes; full replay checked 180 raw PDF/MinerU objects with zero
  violations;
- all 62 targets in the three official-discovery groups have outcomes: 10
  accepted, nine retryable and 43 typed terminal. A batch containing retryable
  discovery remains non-promotable;
- a final Westinghouse release subset accounted for 12 targets: 10 exact-model
  three-axis receipts, two identity rejections and zero retryable outcomes. Its
  full online audit replayed 24 objects with zero violations;
- promotion increased the cumulative acceptance bundle from two to 12 entries.
  All 10 new entries are `CATALOG_ARCHIVED`, so the current public catalogue
  projection remained byte-stable;
- after the required external-snapshot rebuild, the 8,095-record historical
  reference contains 12 `MODEL_RECEIPT` records and 23 `AUTO_FILL` records,
  compared with two and 13 before the release candidate. Registry-consistent
  confirmation rows fell from 4,940 to 4,930 and quarantines remained 90;
- the current Fit publication audit reports 3,521 products, 22 receipt-bound
  dimension products, zero receipt-bound `VERIFIED_FIT` products and zero
  violations. Historical replacement remains a separate direct W/H/D contract;
- the permanent dimension-expression corpus now accounts for 480 MinerU
  indexes, 479 valid source bindings, 645 hash/page/fragment-bound observations,
  606 typed research gaps and 130 syntax-only grammar profiles across all four
  categories and 358 category-brand groups;
- retailer mirror scale remains disabled. The reviewed policy has
  `scaleAllowed: false`, so only the bounded discovery canary ran and none of
  the 1,223 mirror jobs was launched;
- Esatto and Euromaid current official web ownership requires a new source-policy
  epoch and fresh receipts. Existing authority policy is intentionally not
  widened in place.

Operational commands, staged outcomes, resume rules, release ordering and
rollback are canonical in
[Historical Evidence Recovery Runbook](architecture-v2/historical-evidence-recovery-runbook.md).

### 9.5 Automated evidence closure checkpoint (2026-07-16)

Evidence recovery is a two-level state machine. Candidate-source success means
that a specific official artifact, content hash, exact-model identity and set of
field claims passed the current parser and policy. Product-target acceptance is
a separate decision requiring all applicable exact-model sources to reconcile.
The first state may be true while the second remains quarantined.

The append-only attempt ledger is the durable control plane for that distinction.
It retains failed attempts, appends audited resolutions, records source-level
acceptances and suppresses redundant same-policy downloads. Failures are never
deleted; a changed parser or policy hash can reopen them. A successful source
does not make its product publishable, and an unresolved target continues to be
available for alternative-source research.

The production canary is Hisense `HWF3S8514X`. Its official user manual identifies
the exact model and maps diagram `A/B/E/F` to `595/845/540/1020 mm`, where `E` is
appliance depth and `F` is door-open depth. Its official 2026 specification PDF
states net dimensions `595 x 845 x 510 mm`. The source-level parser failure is
resolved, but the exact-model official conflict remains quarantined. No value is
chosen by majority, recency or retailer agreement.

The current tracked evidence state contains 246 cumulative accepted targets and
271 replay-valid source receipts. The 8,095-model replacement reference contains
213 `AUTO_FILL`, 4,856 `REGISTRY_CONSISTENT`, 2,938 `IDENTITY_ONLY` and 88
quarantined rows. The evidence classifier contains 265 `COMPLETE_RECEIPT`, 6,417
`OFFICIAL_DISCOVERY`, 1,176 `REFERENCE_REDISCOVERY`, 154 `IDENTITY_RESEARCH` and
83 `CONFLICT_QUARANTINE` records. The dimension-expression corpus contains 703
MinerU indexes, 702 valid source bindings, 974 observations, 177 parser profiles
and 770 parser replays. These figures measure evidence processing, not Fit
completeness.

The locked publication rules are:

- exact official depth may override a lower-authority registry hint only when
  the source explicitly scopes depth to the closed product, door or handle;
- official-versus-official disagreement remains quarantined until an exact-model
  source explains the measurement scope or supersession;
- successful W/H/D evidence cannot produce `VERIFIED_FIT`; installation,
  operation, service and connection requirements remain independently required;
- an official manufacturer product-detail API may supply dimensions-only
  evidence when one Australian-market record, immutable JSON bytes, exact or
  policy-bounded punctuation-only model identity, complete W/H/D and receipt
  replay all agree. Search-list JSON, family records and sibling variants are
  not eligible, and API evidence cannot populate clearance or service fields;
- old-appliance replacement continues to compare external W/H/D directly and
  remains separate from cavity Fit decisions;
- broad online recovery must use explicit bounded selections. `--allow-all` is
  prohibited for large resolver-only batches unless the entire run is an
  intentional, reviewed scale operation.

### 9.6 Independent installation and Fit evidence checkpoint (2026-07-19)

Dimensions recovery and full Fit recovery now have separate receipts, queues,
metrics and publication gates. The installation contract is schema v2 and
covers refrigerators, dishwashers, washing machines and dryers. It keeps closed
product geometry, installation clearance, ventilation/service space,
door-or-lid operation, water, power, drainage, delivery and professional
installation as independently evidenced fields.

An accepted installation field receipt must bind all of the following:

- exact canonical product, category, brand, model and form factor;
- current official manufacturer URL and immutable PDF SHA-256;
- MinerU `content_list_v2` object SHA/path, parser version and model revision;
- one-based page, item index/type, bbox, exact quote and fragment hash;
- exact-model identity locators and field applicability;
- a field-specific semantic label and value in the same paragraph, table row,
  or header-value column.

Numbers elsewhere in the same table cannot be donated to another field.
Unknown cannot create a receipt, explicit zero remains zero, and
`not_applicable` requires an exact negative statement plus the correct field
label. Adjustable height and voltage remain ranges. Side, top and rear
ventilation evidence participates in conservative Fit geometry and cannot be
ignored after acceptance.

A hard field is complete only when its receipt applicability is `required` and
it carries the typed value needed by the check. `optional`, `unknown` and
`not_applicable` receipts remain useful evidence states but cannot fill a hard
numeric requirement. A scalar voltage is only a documented nominal value: the
engine does not invent a +/-10% operating range, and a different site voltage
stays conditional unless the exact model provides an explicit accepted range.
Top-loading washers are evaluated against lid-open overhead clearance, not a
front-door envelope.

The frozen 100-model refrigerator/dishwasher pilot currently has:

| Grain | Result |
| --- | ---: |
| Pilot products | 100 |
| Receipt-partial products | 2 |
| Exact installation field receipts | 21 |
| Online MinerU replays | 21/21 pass |
| Installation field conflicts | 0 |
| Source discovery required | 87 |
| Identity blocked | 11 |
| Deterministic bounded batches | 99 |
| Receipt-bound `VERIFIED_FIT` | 0 |
| Installation publication violations | 0 |

The exact canaries are Fisher & Paykel `RF605QZUVB1` (11 accepted fields) and
`DW60UT4I2` (10 accepted fields). The dishwasher's exact QRG proves
`integrated`, overriding only the pilot's `built_in` inference; missing
clearance, operation, hose, drainage, delivery and professional-installation
requirements remain unknown. Neither canary is eligible for
`VERIFIED_FIT`.

Batch fan-out is keyed to the canonical content-hash document-family graph.
Targets without one resolved document family are target-only; a family without
a replayed partial canary exposes only one canary target. A partial canary may
open only a bounded same-family batch and does not imply complete Fit evidence.

The cumulative installation bundle is append-safe. Destructive replacement is
rejected unless the operator supplies the exact current bundle SHA-256, and all
old and new MinerU objects are replayed before writing. Normal builds validate a
tracked replay audit and remain external-drive-independent. Online acquisition,
receipt creation and replay require the evidence drive explicitly.

Canonical operations and stop conditions are in
[Historical Evidence Recovery Runbook](architecture-v2/historical-evidence-recovery-runbook.md#42-independent-installation-and-fit-evidence-pipeline).

### 9.7 System-first lifecycle release checkpoint (2026-07-20)

This checkpoint is a branch release candidate, not a live-site cutover. The
current rebuilt Architecture V2 state contains 3,515 catalogue products, 8,089
historical references, 401 models with current valid receipts, 321 replacement
auto-fill records, 332 receipt-bound public dimensions, zero receipt-bound
`VERIFIED_FIT` products, and zero Fit publication violations.

Retail lifecycle now has its own append-safe evidence path. The cumulative
ledger contains 3,058 observations, of which 1,406 are authoritative typed
observations, and 1,190 immutable collection attempts. Partnerize complete-feed
and Appliances Online bounded exact-product runs retain raw bytes, source policy,
catalogue scope, observed time, success/failure state, and listing-level identity
quarantines. An HTTP success with invalid response structure is evidence of an
attempt, not evidence of availability. Replaying identical affiliate-feed bytes
under a later time cannot make the listing appear fresh.

The lifecycle shadow is deliberately blocked:

| State | Products |
| --- | ---: |
| `CURRENT_RETAIL` | 345 |
| `CATALOG_ARCHIVED` | 3,089 |
| `UNKNOWN_RETAIL` | 81 |

The 81 unknown prior-current products are not one interchangeable backlog. Of
them, 58 depend on retailer sources whose automation policy is blocked, 22 need
a genuinely new authorised The Good Guys feed epoch, and one needs exact-model
rediscovery after Appliances Online returned a sibling identity. Known model
pollution (`1910FGX` versus `WWT-1910FGX`, `1910BX` versus `WWT-1910BX`, and
`CTM202NW` versus `CTM202NW3`) must be repaired as canonical identity. It must
not be treated as a colour/suffix availability alias.

Consequently, no lifecycle cutover or deployment is authorised. Unknown rows
remain hidden from current-product results, archived rows remain available only
to the old-appliance replacement reference, and immutable observations remain
available for replay. A lifecycle-neutral safety projection removes unsupported
legacy door fields from 36 rows and reduces 35 Fit-audit violations to zero, but
does not change lifecycle, retailer data, dimensions, clearances, receipts, or
Fit levels.

The release unit is the complete Git epoch containing observations, lifecycle,
public and historical projections, audits, queues, controller state, generated
runtime data, and documentation. An intermediate task commit is not a supported
rollback target. Rollback restores the complete pre-cutover release and never
deletes content-addressed evidence from external storage.

## 10. Success Metrics

Track coverage and truth separately:

- active catalogue exact-identity coverage by source and brand;
- exact-model source coverage;
- receipt-bound W/H/D coverage;
- applicable installation, operation, service and delivery field coverage;
- products eligible for each Fit outcome;
- unknown reasons by category and field;
- source conflicts, axis anomalies, duplicate registrations and quarantines;
- false acceptance count, which must remain zero in adversarial fixtures;
- current-retail `MEASURE_REQUIRED` rate and its reason distribution;
- recovery funnel counts from candidate URL through fetch, MinerU, exact-model
  binding, per-axis extraction, official authority, conflict resolution and
  receipt-bound publication;
- recovery yield and failure reasons by brand, category, transport host and
  lifecycle state;
- source freshness and successful delta-replay rate;
- retailer in-stock coverage and affiliate-link freshness;
- user measurement completion, result-to-retailer click-through, and returns or
  fit-problem feedback where available.

Raw download success, PDF count, and parser extraction rate are diagnostics, not
product-success metrics.

## 11. Locked Decisions and Open Decisions

### Locked

- preserve the existing evidence and Architecture V2 investment;
- use a multi-source evidence broker;
- retain PDF -> MinerU structured JSON for new PDF evidence;
- permit exact manufacturer product-detail JSON as a separate receipt-bound
  dimensions source; keep it manufacturer-specific, content-addressed and
  dimensions-only rather than treating it as a PDF substitute;
- use government and structured provider data as candidates subject to quality
  and rights gates;
- keep installation truth exact-model and field-scoped;
- preserve tri-state hard Fit checks and outcome precedence;
- keep scores separate from outcomes;
- keep unknown values unknown and fail closed on conflicts.
- freeze the first installation-knowledge pilot at 50 refrigerators and 50
  dishwashers with current-listing and brand-concentration controls;
- keep Energy Rating and WELS data shadow-only for current-catalog field
  promotion and all Fit outcomes. Energy Rating identity and candidate W/H/D may
  appear only in the isolated historical replacement input library under the
  confirmation, measurement and quarantine rules in section 9.2.

### Open and requiring owner approval or external confirmation

- GS1 NPC recipient eligibility, sample coverage, cost, and redistribution rights;
- Icecat Australian exact-SKU coverage and licence fit;
- which manufacturers will provide machine-readable data or written reuse rights;
- exact category rules for when power, water, drainage, delivery, and licensed
  installer checks block `VERIFIED_FIT` versus produce `CONDITIONAL_FIT`;
- whether future categories such as ovens and gas appliances enter scope after
  the four current categories are stable.

Any later document that conflicts with the locked principles must identify the
conflict explicitly and update this brief rather than silently overriding it.
