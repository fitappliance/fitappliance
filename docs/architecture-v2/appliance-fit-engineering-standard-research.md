# Appliance Fit Engineering Standard Research

**Status:** Ready as research basis after independent ultra audit
**Research date:** 2026-08-08
**Scope:** Australian refrigerators, dishwashers, washing machines and dryers

## 1. Purpose

This document defines the engineering basis for the next FitAppliance Fit
standard. It does not authorize a production scoring change. Its purpose is to
turn exact-model evidence and user site observations into explainable,
fail-closed decisions without pretending that FitAppliance certifies regulatory
compliance or guarantees installation.

The existing outcome architecture remains correct:

- physical and installation requirements are independent checks;
- every applicable hard check is `PASS`, `FAIL`, `UNKNOWN`, or
  `NOT_APPLICABLE`;
- one hard failure cannot be averaged away by a score;
- unknown evidence remains unknown;
- a numeric value may rank products only after the Fit outcome and evidence band
  have been fixed.

The required improvement is not a more aggressive score. It is a better
engineering model of uncertainty, installation configurations, moving
envelopes, service routes and category-specific constraints.

## 2. Research Method and Authority Order

Research used official Australian government sources, international measurement
guidance, Australian consumer-claims guidance, and exact manufacturer
installation documents. Search results and retailer descriptions may discover a
candidate, but they cannot establish installation truth.

| Authority | Permitted use | Prohibited use |
| --- | --- | --- |
| Exact-model Australian manufacturer installation guide, planning guide, CAD or current product page | Model geometry, configuration, clearance, operation, service and installation requirements | Sharing a field with an unlisted sibling or regional suffix |
| Public Australian regulator or register | Market identity, registration, public normative guidance and product-scope corroboration | Replacing exact-model installation geometry |
| Properly licensed standard or public standards guidance | Jurisdiction-specific normative rule with version and scope | Copying inaccessible standards text or treating it as a model fact |
| GS1 product/package measurement rules | Normalize stated product and package W/D/H orientation and hierarchy | Derive cavity, operation, ventilation or service requirements |
| Government registry W/H/D | Candidate dimensions and conflict detection | Silent overwrite of manufacturer installation evidence |
| Retailer or structured provider feed | Current listing observation, candidate identity, price and discovery | `VERIFIED_FIT`, installation clearance or model alias approval |
| Engineering inference | Internal research hypothesis only | Receipt, public fact or hard Fit requirement |

Every executable model requirement must retain exact model scope, source
authority, jurisdiction, source version/status, retrieval time, immutable bytes
or content hash, locator, verbatim fragment, parser/policy version and conflict
state.

Before a source value becomes a hard requirement, its receipt must answer:

| Question | Required answer |
| --- | --- |
| Which claim? | Canonical V4 field/relation ID and original value/unit |
| Which product? | Exact AU model identity; aliases need their own approved evidence |
| Where? | URL, immutable content hash, page/region/locator and quoted fragment |
| When? | Document revision/status, retrieval time and supersession state |
| Who says it? | Manufacturer, regulator, licensed standard or other typed authority |
| Where does it apply? | Jurisdiction, installation configuration and conditional branch |
| Can it be used? | Rights action for internal evaluation, cache, quotation and public display |

Generic manufacturer support pages may identify questions or rule families, but
cannot fill an exact-model field unless the page explicitly binds the target
model and the resulting receipt passes the same matrix.

## 3. Findings From Authoritative Sources

### 3.1 Product dimensions are not an installation envelope

The GS1 Package and Product Measurement Standard provides a consistent way to
describe nominal product and package dimensions through a product hierarchy.
That solves axis and package-level normalization, but it does not define a
cabinet cavity, moving door, ventilation path, hose route or service zone.

FitAppliance must therefore keep these objects separate:

1. closed product envelope;
2. packaged/delivery envelope;
3. installation envelope;
4. ventilation and rear-service envelope;
5. operation and component-removal envelope;
6. utility routing envelope.

Combining these into one W/H/D triplet loses information and can create false
acceptance.

### 3.2 Measurement uncertainty requires typed decision relations

The BIPM/JCGM measurement vocabulary and NIST conformity-assessment guidance
distinguish a measured value, its uncertainty and the decision rule used to
accept or reject it. A formal coverage interval has a stated coverage
probability; it is not automatically a guaranteed bound. FitAppliance must keep
three value qualities distinct:

- `DETERMINISTIC_BOUND`: a documented lower/upper error bound suitable for
  worst-case decisions;
- `COVERAGE_INTERVAL`: an interval plus method and stated coverage probability;
- `ESTIMATE`: a value/range without a validated deterministic bound.

Only a deterministic bound can support a public claim based on a "guaranteed
margin". Coverage intervals and estimates can support shadow analysis or
`LIKELY_FIT_ESTIMATED` under a versioned risk policy, but not silently become
`VERIFIED_FIT`.

One comparison operator is insufficient. The policy must select a typed
relation and inclusive/exclusive endpoints:

| Relation | Example |
| --- | --- |
| `MIN_REQUIRED` | cavity width is at least installed width |
| `MAX_ALLOWED` | rear gap does not exceed a documented maximum |
| `WITHIN_RANGE` | drain height or pressure is inside a permitted range |
| `CONTAINS` | permitted service zone contains the required fitting/route |
| `PROHIBITED_ZONE` | socket, obstruction or exhaust does not intersect a forbidden region |
| `NO_INTERSECTION` | door sweep, drawer, hose or delivery geometry avoids an obstacle |

For `MIN_REQUIRED`, with deterministic available interval `[A_low, A_high]` and
required interval `[R_low, R_high]`:

```text
guaranteed margin = A_low - R_high
possible margin   = A_high - R_low

PASS    when the declared endpoint rule accepts guaranteed margin
FAIL    when even the possible margin violates the endpoint rule
UNKNOWN otherwise
```

`MAX_ALLOWED`, `WITHIN_RANGE` and geometry relations use their own dual-sided
rules; they cannot be rewritten as `MIN_REQUIRED` without proving equivalence.
Equality is not globally pass or fail. The exact field policy declares whether
each endpoint is inclusive.

For repeated cavity measurements at different physical points and documented
deterministic bound `b_i`, the limiting interval is:

```text
A_low  = min(m_i - b_i)
A_high = min(m_i + b_i)
```

Measurements of different datums or geometries are not pooled merely because
they share an axis. Manufacturer-stated tolerance, an adjustable domain and a
site measurement bound remain separate records. FitAppliance must not invent a
generic manufacturer tolerance or consumer-measurement bound.

FitAppliance should not use root-sum-square uncertainty or Monte Carlo
probability in public Fit decisions unless future evidence supplies defensible
distributions and an approved risk rule. Conservative deterministic relations
are the initial auditable path.

### 3.3 Requirements are conditional and sometimes bounded on both sides

Manufacturer guidance demonstrates that installation requirements cannot be
stored only as unconditional minimum offsets:

- Electrolux refrigerator guidance changes top clearance when rear clearance is
  below a threshold, distinguishes proud and flush installation, uses
  hinge-side clearances, and can state a maximum rear gap;
- integrated refrigerator planning guides define cavity, hinge articulation,
  door opening and service zones as separate geometry;
- integrated dishwasher guides combine adjustable appliance height, matching
  cavity ranges, panel/toe-kick geometry, condensation gaps, cabinet
  square/level requirements and service-hole positions;
- heat-pump dryer guides can include model dimensional tolerance, cavity mode,
  adjacent-wall clearance, power/water/drain routing and environmental
  conditions;
- washer/dryer stacking guides require an exact appliance combination and an
  approved kit rather than only compatible W/H/D.

The executable schema therefore needs typed predicates and both minimum and
maximum constraints. A conditional group declares a finite selector domain and
complete mutually exclusive branches. Overlap, uncovered values or an implicit
default make the policy invalid. A rule uses only allowlisted field paths and
operators; arbitrary JavaScript or free-text expressions are not allowed.

Configuration quantifiers are explicit:

- `FIXED_SELECTED`: evaluate the selected configuration;
- `INSTALLER_SELECTABLE`: solve for one consistent assignment across all linked
  fields and return the required setting as a condition;
- `UNKNOWN_FIXED`: `PASS` only if every feasible assignment passes, `FAIL` only
  if every assignment fails, otherwise `UNKNOWN`;
- `PROHIBITED`: fail when the prohibited assignment is selected.

The engine cannot choose height from one adjustment setting and service/door
geometry from another. All constraints in one solution share the same
configuration assignment.

### 3.4 Straight-line connection reach is insufficient

Official washer and dishwasher guides require routed hoses without kinks,
specific drain heights, high loops or insertion conditions, accessible
isolation and power, and model-specific connection types. Service reach must
describe a valid route, not only Euclidean distance.

The minimum route contract is:

- appliance connection exit coordinate/zone;
- site endpoint coordinate/zone;
- permitted service-hole coordinates and minimum diameter;
- route polyline length or conservative routed length;
- maximum permitted length and extension policy;
- bend, kink, fall, high-loop, insertion or air-gap constraints where
  applicable;
- connector type/size and hot/cold applicability;
- accessible isolation and electrical disconnection after installation;
- service occupancy added to the rear/side envelope when the route occupies
  physical space.

### 3.5 User operability and engineering fit are different

An exact manufacturer requirement for door articulation, drawer/rack
projection, bin/shelf removal or an unobstructed operating path is a hard model
requirement. A generic preference for comfortable working space is advisory.
Human-factors suggestions must not become hard Fit facts unless a licensed or
publicly usable normative rule applies to the selected site profile.

### 3.6 Claims need a visible scope

ACCC guidance requires claims to be truthful, accurate and supported by
reasonable grounds. `VERIFIED_FIT` must therefore mean:

> All applicable hard checks represented by the selected Fit policy passed for
> the supplied site observations and documented exact-model conditions.

It does not mean code-compliant installation, universal compatibility, safe DIY
work or a guarantee. The UI must show the limiting check, unresolved conditions,
measurement date, policy version and evidence scope before any ranking number.
The phrase "perfect fit" should not be used as an absolute claim.

### 3.7 Evidence, lifecycle and replay are separate contracts

V4-only hard fields require V4 receipts. A V3 receipt can be referenced by a
lossless field-map entry, but it is never mutated or relabelled. Every V4 run
binds the canonical field map, receipt bundle, identity map, active retail
release, source revisions, conflict/supersession decisions, schema, policy,
site-scenario fixture and a frozen `asOf`.

Document revision, retail-listing freshness, site-observation age and policy
epoch are independent. Publication eligibility is derived for a release; it is
not stored as a model fact. Immutable old runs are retained, resume validates
every checkpoint against the run manifest, and rollback restores an earlier
active pointer rather than deleting evidence.

### 3.8 Real site evaluations are private and ephemeral by default

Content-addressed hashes are appropriate for synthetic fixtures and consented
offline research. A real user's measurements, obstacle locations, service
points and timestamps can reveal household details. The production evaluator
must keep them ephemeral unless a separately approved retention purpose,
consent, expiry and keyed/pseudonymous identifier contract exists. No raw site
profile or reversible hash belongs in public/static artifacts.

## 4. Target Engineering Model

### 4.1 Coordinate and configuration contract

All geometry uses the installed appliance orientation:

- width: left to right when facing the appliance;
- height: finished support surface to highest installed point;
- depth: rear installation datum to foremost installed point;
- coordinates: origin and axis orientation declared by the schema;
- body, door, handle, control, feet, panel and trim extents retained separately
  where they affect a check;
- installation mode, hinge/door state, panel/toe-kick configuration and stacked
  combination are explicit inputs.

Unknown configuration stays unknown. Reversible doors are not treated as
reversed until the selected configuration and any required work are confirmed.

### 4.2 Field applicability

Every field has one state:

- `required`: applies unconditionally;
- `conditional`: applies when its typed predicate is true;
- `not_applicable`: exact evidence proves it does not apply;
- `prohibited`: the configuration or connection is not permitted;
- `unknown`: applicability is unresolved.

`optional` is not sufficient for a hard engineering field because it conflates
unknown, user-selected and genuinely non-applicable conditions.

### 4.3 Check classes

| Check class | Effect |
| --- | --- |
| Hard placement | Failure is `NO_FIT`; missing evidence or site input is `INSUFFICIENT_DATA` |
| Hard operation/service/environment | Failure is `NO_FIT`; unresolved input/evidence is `CONDITIONAL_FIT` |
| Professional/jurisdiction confirmation | Cannot create physical Fit; unresolved required confirmation is `CONDITIONAL_FIT` |
| User-selected delivery | Evaluated only when selected and returned as a separate delivery outcome |
| Advisory convenience | Never changes the Fit outcome; displayed separately |

Every check records its type, applicability branch, required and available
intervals, guaranteed and possible margin, evidence references, policy version,
evaluation time and user-readable reason.

### 4.4 Spatial composition

Requirements may be:

- `MAX`: overlapping alternatives, such as a body offset and a ventilation
  minimum that occupy the same zone;
- `SUM`: physically additive items, such as appliance depth plus a rear fitting
  and bend radius;
- `SEPARATE`: independent zones that must each be checked;
- `CONDITIONAL`: composition changes with installation mode or service route.

The policy must declare composition. The engine must not infer that all rear
requirements can be combined with `max()`.

Composition is coordinate-aware. `MAX` is valid only for requirements proven to
occupy the same axis-aligned zone; `SUM` is valid only for physically serial
occupancy. Sweeps, routes and prohibited regions use geometry intersection, not
scalar addition. The chosen composition and configuration assignment are part
of every check trace.

## 5. Category Profiles

### 5.1 Refrigerator

Required profile dimensions include:

- body/door/handle envelope and adjustable levelling range;
- freestanding, recessed, integrated, flush or proud mode;
- minimum and maximum rear/side/top constraints;
- ventilation opening and room-volume requirement when documented;
- hinge side, door angle/swept path, adjacent wall and bin/shelf removal path;
- water connection type, location, pressure and routing for plumbed models;
- socket zone and post-install accessibility;
- anti-tip or cabinetry attachment requirements;
- ambient temperature/location limitations;
- selected delivery path.

### 5.2 Dishwasher

Required profile dimensions include:

- niche and body envelope, adjustable feet and cavity height range;
- cabinet square/level and floor support conditions;
- integrated panel weight/geometry, toe-kick/plinth and door-swing interaction;
- mounting/anchoring and condensation gaps;
- service-hole diameter and permitted position;
- water type, pressure, temperature, fitting and isolation;
- drain route, maximum hose length, height range, high loop/air gap/backflow,
  insertion and kink constraints;
- power connection type, zone and accessibility;
- rack/door operation envelope;
- selected delivery path.

### 5.3 Washing machine

Required profile dimensions include:

- body/door/lid envelope and adjustable levelling range;
- solid, level support, stability and vibration clearance;
- transit-bolt removal and anti-tip/anchoring when applicable;
- hot/cold inlet topology, fitting, pressure, temperature and routed reach;
- drain route, standpipe/spigot type, diameter, height, insertion, fall and
  maximum length;
- plug/socket type, circuit constraints and accessibility;
- stacked or side-by-side mode with exact kit and companion-model identity;
- selected delivery path.

### 5.4 Dryer

Required profile dimensions include:

- dryer technology: vented, condenser, heat pump or combination;
- body/door envelope, adjustable height and support/level conditions;
- cavity and room ventilation or duct diameter, length, elbows and termination;
- condensate tank/drain mode and route where applicable;
- adjacent-wall and operating-door envelope;
- exact stacking combination, kit, load/support and total installed envelope;
- plug/socket/circuit and accessibility;
- selected delivery path.

## 6. Fit Outcome and Ranking Contract

### 6.1 Installation outcome precedence

1. Any applicable hard `FAIL` -> `NO_FIT`.
2. Missing or interval-overlapped placement evidence/site observation ->
   `INSUFFICIENT_DATA`.
3. Placement passes but an applicable operation, service, environment,
   professional or jurisdiction check is unresolved -> `CONDITIONAL_FIT`.
4. All applicable hard checks pass, but at least one requirement or site input
   is explicitly estimated -> `LIKELY_FIT_ESTIMATED`.
5. All applicable hard checks pass with exact-model receipt-bound requirements,
   adequate measured site inputs and no unresolved conflict -> `VERIFIED_FIT`.

An accepted-but-unevaluated hard field blocks `VERIFIED_FIT` and is a repository
audit violation.

Selected delivery returns a separate `deliveryOutcome` with its own `PASS`,
`FAIL`, `UNKNOWN` or `NOT_SELECTED` result and limiting route checks. A delivery
failure cannot be reported as cavity `NO_FIT`, and a cavity pass cannot conceal
an impossible selected delivery path.

### 6.2 Ranking is lexicographic before it is numeric

The namespaced V4 stable sort key is:

```text
[outcome class, evidence band, critical spatial reserve,
 operation reserve, inverse installation complexity]
```

No item in a lower outcome class can outrank one in a higher class because of a
number. `NO_FIT` and `INSUFFICIENT_DATA` have no public score.
`CONDITIONAL_FIT` exposes unresolved checks rather than a reassuring total.
Legacy `fitScore`, generic `score` and `fitScoreNumeric` are not V4 inputs or
fallbacks.

### 6.3 Shadow FitRank proposal

After category calibration, `LIKELY_FIT_ESTIMATED` and `VERIFIED_FIT` products
may receive a within-class `FitRank` from 0 to 100:

| Component | Provisional weight | Meaning |
| --- | ---: | --- |
| Critical spatial reserve | 40 | Smallest guard-banded reserve across applicable hard spatial checks, capped by a category/axis policy so excess space is not over-rewarded |
| Evidence completeness | 25 | Coverage and freshness of applicable receipt-bound fields within the already fixed evidence band |
| Installation simplicity | 20 | Deterministic severity of required routes, service holes, professional work, special kits and configuration constraints |
| Operational reserve | 15 | Guard-banded reserve for manufacturer-required door, lid, drawer and removal envelopes |

These weights are a calibration hypothesis, not a production rule. The first
implementation emits the component vector and a provisional internal total in
shadow mode. Public display requires:

- labelled four-category cases, including boundary and conditional cases;
- zero false acceptance in adversarial fixtures;
- installer/technical review of category policies;
- evidence that the total improves ordering within a class;
- explicit owner approval of labels and weights.

Calibration uses a frozen independently adjudicated label set and an untouched
holdout. It reports outcome-specific false acceptance/false rejection and a
within-band ordering metric against a documented baseline. Sample size and
branch coverage are fixed before results are inspected. Applicable-field
denominators and dimensionless category-policy normalization prevent a category
with fewer fields or larger millimetre values from winning by construction.

The score is never described as probability, confidence in installation,
regulatory compliance or product quality.

## 7. Known Defects in the Current Executable Contract

Repository inspection on 2026-08-08 found:

- `installationClearance.frontMm`, ventilation open area/room volume and
  delivery weight are accepted fields but are not evaluated by Fit V3;
- `maximumKnown()` can hide a missing required clearance behind a known
  ventilation value and produce the wrong outcome class;
- rear requirements use `max(clearance, ventilation)` without an additive
  fitting/service zone;
- one global site uncertainty is applied to every measurement; repeated
  measurements, per-field uncertainty and manufacturer tolerance are absent;
- site inputs lack a strict boundary schema and can accept negative distances,
  stale observations and arbitrary estimated-field names;
- power, water and drain checks do not model complete connection type or routed
  geometry;
- normative rules are opaque and not executed;
- delivery is always checked even though the product brief makes it
  user-selected;
- checks omit hard/advisory type, applicability branch, evidence reference and
  policy version;
- the public V2 interface can treat a caller-supplied "advisory" failure as
  `NO_FIT`, so the label is unsafe;
- the public UI still has legacy `fitScore` and `fitScoreNumeric` paths whose
  meaning differs from the proposed FitRank.

These defects justify a versioned V4 shadow contract. They do not authorize an
in-place mutation of V2/V3 receipts or public results.

## 8. Non-Goals

- no regulatory or licensed-trade certification;
- no generic brand clearance defaults;
- no sibling, family or regional-model evidence sharing;
- no government-registry dimensions promoted to installation truth;
- no hidden 10 mm penalty;
- no assumed unit, tolerance, service route or non-applicability;
- no public probability of successful installation;
- no new appliance category until the four-category contract passes shadow
  acceptance.

## 9. Sources

Sources were checked through AnySearch and direct source extraction where the
site permitted it. Access date: 2026-08-08.

### Measurement, registry and claims

- [Energy Rating registered appliance and equipment data](https://www.energyrating.gov.au/about-us/gems-regulator/registered-appliance-and-equipment-data)
- [WELS public product register](https://wels-public-register.environment.gov.au/search-all-products/)
- [GS1 Package and Product Measurement Standard](https://ref.gs1.org/standards/ppm/)
- [JCGM 100: Evaluation of measurement data](https://www.bipm.org/documents/20126/2071204/JCGM_100_2008_E.pdf)
- [JCGM 106: Role of measurement uncertainty in conformity assessment](https://www.bipm.org/documents/20126/2071204/JCGM_106_2012_E.pdf)
- [BIPM VIM 2.36: Coverage interval](https://jcgm.bipm.org/vim/en/2.36.html)
- [NIST conformity assessment decision rules and risk analysis](https://www.nist.gov/publications/assessment-conformity-decision-rules-and-risk-analysis)
- [ACCC false or misleading claims guidance](https://www.accc.gov.au/consumers/advertising-and-promotions/false-or-misleading-claims)
- [WaterMark product search example](https://watermark.abcb.gov.au/product-search/product/118505)

### Exact-model manufacturer engineering examples

- [Fisher & Paykel integrated refrigerator planning guide](https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/en_AU/v1748016937262/DesignPlanning-FisherPaykelAU/FP-PlanningGuide-en-RS90A-RS90AU-RS80A-RS80AU-IntegratedFrenchDoorRefrigeratorFreezer-0-90004832A-NZ-AU-UK-IE-EU-CN-ASIA.pdf)
- [Fisher & Paykel heat-pump dryer installation guide](https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw3b2219ae/technical-content/product/dryers/heat-pump-clothes-dryer-install-guide-DH9060FS-428278A.pdf)
- [Fisher & Paykel washer/dryer stacking compatibility guide](https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw5f060dcb/DesignPlanning-FisherPaykelAU/front-load-washer-dryer-stacking-compatibility-install-combinations-428355A.pdf)
- [Fisher & Paykel front-loader installation guide](https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwa03853a3/technical-content/product/washing-machines/front-loaders/front-loader-washing-machine-user-installation-guide-FL600-430218B.pdf)
- [Fisher & Paykel dishwasher installation guide](https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dw19f2e10b/technical-content/product/dishwashing/dishwasher/dishwasher-installation-guide-DW60UC-models-592219C.pdf)
- [Fisher & Paykel integrated DishDrawer installation guide](https://www.fisherpaykel.com/on/demandware.static/-/Sites-fpa-master-catalog/default/dwe39916ca/InstallationManuals-FisherPaykelNZ/FP-InstallGuide-en-DD60DTX611-DD60DTX6HI1-DoubleDishdrawer-0-592363C-NZ-AU-UK-IE-SG-ASIA.pdf)

### Manufacturer discovery and advisory examples

These sources demonstrate possible rule families and instruct users to consult
model-specific material. They cannot create exact-model hard requirements by
themselves.

- [Electrolux Australia refrigerator installation/temperature guidance](https://supporthub.electrolux.com.au/support-articles/article/temperature-issues-troubleshooting-refrigeration)
- [Bosch Australia washing machine installation guidance](https://www.bosch-home.com.au/experience-bosch/kitchen-installation-guide/washing-machines-tips)
- [Samsung Australia washing machine fill/drain guidance](https://www.samsung.com/au/support/home-appliances/washing-machine-does-not-fill-up-or-drain/)
- [Bosch Australia dishwasher installation FAQ](https://www.bosch-home.com.au/products/dishwashers/underbench-and-integrated-dishwashers/installation-faq)
