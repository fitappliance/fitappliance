# FitAppliance Architecture V3 Evidence Foundation Design

- **Status:** APPROVED DESIGN — IMPLEMENTATION NOT STARTED
- **Date:** 2026-09-13
- **Owner:** FitAppliance
- **Product contract:** [`../../product-core-brief.md`](../../product-core-brief.md)
- **Implementation plan:** [`../plans/2026-09-13-architecture-v3-evidence-foundation.md`](../plans/2026-09-13-architecture-v3-evidence-foundation.md)

## 1. Decision

FitAppliance will evolve from a collection of acquisition, PDF parsing and
static-publication workflows into one deterministic evidence system. The
upgrade is incremental: it formalises and connects capabilities already on
`main`; it does not replace the working Architecture V2 pipelines in one cut.

The foundation has four explicit registries:

1. `BrandRegistry` owns canonical brand identity, market aliases, parent-group
   relationships and official source boundaries.
2. `ProductFamilyGraph` owns marketing-series, finite official model-group and
   platform hypotheses without treating family membership as product truth.
3. `DocumentFamilyRegistry` owns the structural differences between brand,
   category and document layouts and chooses an extraction profile from
   inspected content.
4. `GeometryAndInstallationSemantics` owns field meaning, axis, scope, unit,
   inclusion, applicability and category/form-factor requirements.

They feed an immutable chain:

```text
official source observation
  -> content-addressed source artifact
  -> content-addressed derived artifacts (native text / MinerU / OCR / images)
  -> evidence fragment with a media-specific locator (page/bbox, JSON pointer,
     HTML selector, CSV cell or text span)
  -> authority-specific verified source binding
  -> immutable claim
  -> claim receipt binding the claim to source or finite derivation
  -> deterministic adjudication or quarantine
  -> exact-product evidence snapshot
  -> public projection
  -> runtime FitEvaluation + user cavity measurements
```

The online Fit Engine remains deterministic and does not call an LLM, vector
database or OCR service. LLM and vision components may propose offline
candidates; they cannot approve a claim, resolve product identity or produce a
Fit outcome.

## 2. Why this is an incremental V3, not a rewrite

The live repository already has strong parts of this design:

- canonical product identity and quarantine in
  `src/domain/canonical-registry.mjs`;
- official-source discovery and candidate-only adapter contracts in
  `src/domain/evidence-source-adapter-contract.mjs`;
- content-addressed acquisition in `src/domain/evidence-artifact-pipeline.mjs`;
- PDF/MinerU validation and source receipts in
  `src/domain/evidence-source-verifier.mjs`;
- dimension Claim V2 semantics in
  `src/domain/dimension-evidence-claim.mjs`;
- conflict quarantine and exact-model reconciliation in
  `src/domain/evidence-claim-reconciliation.mjs`;
- installation requirements and exact-model receipts in
  `src/domain/installation-knowledge-v3.mjs`;
- content-hash document grouping in
  `src/domain/historical-document-family-graph.mjs`;
- receipt-bounded projection in
  `src/domain/accepted-evidence-publication.mjs`; and
- fail-closed runtime outcomes in `src/shared/fit-engine.js`.

V3 adds the missing shared ontology and claim-level joins around those modules.
Existing receipts and public artifacts remain valid under their own schema and
policy versions. New schemas run in shadow until their replay and publication
audits pass.

### 2.1 Gaps confirmed in the current implementation

The upgrade addresses concrete joins that are still missing on `main`:

- `data/series-dictionary.json` is a small model-prefix presentation hint, not a
  brand/product-family ontology.
- `historical-document-family-graph.mjs` safely groups content-hash documents
  for recovery, but does not define versioned brand/layout extraction profiles.
- source receipts bind normalised source claim payloads, but there is no stable
  cross-pipeline claim ID or append-preserved claim decision event.
- source-document and MinerU records do not yet expose one complete graph for
  PDF -> OCR/Markdown/chunk/diagram -> fragment provenance.
- runtime geometry, Claim V2 and installation knowledge use two field naming
  vocabularies.
- `product-data-field-rights-dictionary.json` already contains field semantics
  and action-scoped rights. V3 must compile and extend it, not create a second
  authoritative field dictionary.
- the current manufacturer source verifier cannot prove a government, GS1 or
  retailer authority class. Arbitration therefore cannot trust a tier supplied
  by a parser or claim; it needs an authority-specific, replay-valid source
  binding.
- the installation requirement matrix uses `powerConnection.voltage` as an
  internal alternative-group label even though the real claim fields are
  `voltageV` or the `minimumVoltageV`/`maximumVoltageV` pair.
- `evidence-geometry-projector.mjs` can emit product-level
  `verifiedFitEligible` and `successfulFitOutcome`, and current UI code can read
  a persisted product `fitDecision`. Those legacy fields blur evidence readiness
  with a user-specific Fit evaluation and are excluded from V3 publication.
- manufacturer-clearance search currently drops an otherwise useful result when
  its runtime outcome is `INSUFFICIENT_DATA`. V3 keeps the dimension match and
  displays the incomplete-evidence state, as required by the product contract.
- the rich `fit-v3.mjs` shadow evaluator and the smaller browser Fit Engine are
  separate implementations. Fit V4 must converge them behind one shared pure
  contract before the UI relies on a new outcome.

These are migration targets, not grounds to discard the existing evidence and
publication controls.

## 3. Goals

1. Represent brand, product-family, document-family and engineering semantics as
   separate versioned concepts.
2. Preserve the original PDF and every derived OCR/MinerU/vision artifact in a
   hash-bound lineage.
3. Bind every accepted field to one immutable claim, one exact subject and one
   source fragment.
4. Support different dimension orders, units, diagrams and installation methods
   without global brand regexes or plausibility-based axis swapping.
5. Allow safe reuse of a multi-model document while preventing implicit sibling
   or platform inheritance.
6. Keep evidence readiness separate from a user-specific Fit decision.
7. Publish only deterministic projections that can be replayed from immutable
   inputs.
8. Add the minimum code required: pure domain functions, versioned JSON policy,
   content-addressed artifacts and tests. No database is required for this
   migration.

## 4. Non-goals

- Building a general-purpose RAG chatbot.
- Sending online product searches through an LLM.
- Migrating existing immutable evidence objects into a database.
- Treating a brand, parent group, series, suffix or chassis as proof that two
  products have the same geometry.
- Automatically correcting W/H/D from typical appliance proportions.
- Treating OCR confidence, model confidence or source tier as a substitute for
  explicit identity and semantic evidence.
- Reclassifying retailer dimensions as manufacturer-verified evidence.
- Changing replacement-search publication rules.
- Displaying `VERIFIED_FIT` before a user supplies the required site inputs.

## 5. Non-negotiable invariants

These exact constraints govern every implementation PR:

1. Existing immutable source, PDF, MinerU, OCR and receipt objects are never
   rewritten or deleted by migration code.
2. Unknown values remain `null` or an explicit `UNKNOWN`/`unknown` state; missing
   values are never converted to zero.
3. Product-family membership alone never authorises a field claim for another
   SKU.
4. Parent-group membership never expands a brand's official-host allowlist.
5. Filename, URL, retailer text and model-prefix matches are discovery hints,
   not publication evidence.
6. OCR, MinerU, vision and LLM outputs are derived candidate artifacts, never
   source authority.
7. Axis assignment requires an explicit label, ordered legend, table header or
   diagram anchor from the evidence fragment.
8. Unit conversion requires an explicit source unit and stores both source and
   canonical values.
9. `capacity.netLitres` and compartment capacity are not physical-envelope
   dimensions and cannot participate in cavity Fit arithmetic.
10. A claim receipt binds the claim ID, exact subject, source artifact hash,
    derived artifact hash when used, fragment hash, locator, policy version and
    toolchain version.
11. Source authority and public-display rights come only from a replay-valid,
    authority-specific source binding. A claim, parser or model cannot declare
    its own authority tier.
12. An unresolved same-field conflict quarantines that field; it cannot be
    hidden by last-write-wins.
13. Dimensions-only evidence may power size filtering and can prove `NO_FIT`
    when a known hard dimension exceeds the cavity, but it cannot produce
    `VERIFIED_FIT`.
14. Product evidence may be called `FIT_READY`; `VERIFIED_FIT` is reserved for a
    runtime evaluation with receipt-bound product evidence and required user
    measurements.
15. Replacement and cavity-fit projections remain separate consumers.
16. Every new projection is shadow-only until old/new comparison, full tests,
    publication audit and deterministic second-run checks pass.
17. No new runtime database, vector store or online model dependency is added in
    this programme.
18. Architecture V3 feeds the existing retail release candidate, active-release
    pointer and rollback controls; it does not create a parallel publisher.

## 6. Architecture boundaries

```text
Identity plane       BrandRegistry -> CanonicalProduct -> ProductFamilyGraph
                                         |
Document plane       SourceDocument -> ArtifactLineage -> DocumentFamilyRegistry
                                         |
Semantic plane       GeometryAndInstallationSemantics -> EvidenceClaim
                                         |
Trust plane          VerifiedSourceBinding -> ClaimReceipt -> Decision/Adjudication
                                         |
Read plane           EvidenceSnapshot -> PublicProjection -> FitEvaluation
```

Dependencies flow downward. A read-plane result must never mutate an upstream
claim, receipt, relationship or artifact. Generated files contain hashes of
their authoritative inputs and are always rebuildable.

### 6.1 What remains independent

The following axes must not be collapsed into one status:

- canonical identity;
- Australian market/lifecycle state;
- official-source authority;
- field/action reuse rights;
- document acquisition state;
- document-to-model applicability;
- field extraction state;
- claim receipt validity;
- field conflict state;
- evidence readiness;
- public visibility; and
- user-specific Fit outcome.

## 7. BrandRegistry

`BrandRegistry` replaces scattered display aliases and source-host assumptions
with one validated read model. It is not a product data source.

Each brand record contains:

```json
{
  "brandId": "brand_fisher_paykel",
  "canonicalName": "Fisher & Paykel",
  "market": "AU",
  "aliases": ["Fisher and Paykel", "F&P"],
  "parentGroupId": "group_haier",
  "officialHostPolicyId": "manufacturer_fisher_paykel_au_v1",
  "sourceStrategyIds": ["fisher_paykel_product", "fisher_paykel_support"],
  "status": "active"
}
```

Rules:

- `brandId` is stable and is not derived from the current display label at
  runtime.
- Alias lookup is market-scoped and collision-rejecting.
- `parentGroupId` is informational; it grants no domain, model or evidence
  authority.
- Official hosts continue to be governed by the existing manufacturer source
  policy; the registry references that policy instead of duplicating it.
- A brand may use several acquisition strategies and several document-family
  profiles.

## 8. ProductFamilyGraph

This graph describes product relationships without converting them into field
truth. It has separate node and edge types:

### 8.1 Nodes

- `brand`
- `marketing_series`
- `official_model_group`
- `platform`
- `canonical_product`

### 8.2 Edges

- `MARKETED_AS_SERIES`
- `LISTED_IN_OFFICIAL_MODEL_GROUP`
- `ASSERTED_SHARED_PLATFORM`
- `HYPOTHESISED_SHARED_PLATFORM`
- `VARIANT_OF`

Every edge has a status and evidence:

```json
{
  "edgeId": "family_edge_...",
  "fromId": "fa_prod_...",
  "toId": "platform_bosch_60_dishwasher_v1",
  "edgeType": "ASSERTED_SHARED_PLATFORM",
  "status": "active",
  "authority": "official",
  "relationshipAssertionIds": ["relationship_assertion_..."],
  "sharedFieldPaths": ["closedEnvelope.widthMm"],
  "market": "AU"
}
```

`sharedFieldPaths` is required before any field-specific derivation. An official
statement that models share a series or platform does not imply that dimensions,
door geometry, ventilation and installation requirements are all equal.

### 8.3 Publication rule

A relationship may help create a target claim only when all conditions hold:

1. the relationship is official, active and receipt-bound;
2. the target SKU is named in a finite model list or exact official relation;
3. the requested field appears in `sharedFieldPaths`, or the same evidence
   fragment explicitly binds that field to every named model;
4. a new immutable claim is materialised for the exact target product;
5. the target claim retains `derivedFromClaimId` and every
   `relationshipAssertionId`; and
6. the target claim passes normal reconciliation and publication gates.

`marketing_series`, `HYPOTHESISED_SHARED_PLATFORM`, wildcard suffix rules and
open-ended model prefixes can prioritise research only. They never donate data.

Every edge endpoint must resolve to a declared node, and each edge type has an
explicit allowed `(fromType, toType)` matrix. Canonical-product nodes must exist
in the canonical registry; group/platform/series nodes must exist in the V3
relationship policy. Relationship assertion IDs must resolve to immutable
assertion objects whose finite product set contains every product endpoint.

The existing strict official marketing/variant rule remains dimensions-only and
continues to require its current finite evidence signals. This design does not
broaden it.

### 8.4 Relationship assertions are not product-field claims

An immutable `ProductRelationshipAssertion` contains a finite set of canonical
product IDs, relation type, exact `sharedFieldPaths`, source artifact hash,
fragment locator and its own receipt binding. Its ID is
`relationship_assertion_<sha256>`. It cannot be projected as a product field.
Claim V3 remains a simpler exact-product field contract; a derived Claim V3
only references receipt-valid relationship assertion IDs in its applicability
proof.

## 9. DocumentFamilyRegistry

Product families and document families are different graphs. A shared manual is
not proof of a shared chassis, and a shared chassis is not proof of a shared PDF
layout.

The existing historical document-family graph continues to own content-hash
deduplication and model proof levels. The new registry owns parsing behaviour.

### 9.1 Profile key

A profile is selected by inspected structure, not by brand alone:

```json
{
  "profileId": "smeg_dishwasher_install_matrix_v1",
  "brandId": "brand_smeg",
  "categories": ["dishwasher"],
  "documentTypes": ["installation_manual"],
  "contentModes": ["vector", "hybrid"],
  "structuralSignals": [
    "model_dimension_matrix",
    "dimension_legend_letters",
    "technical_diagram"
  ],
  "extractorChain": [
    "native_pdf",
    "mineru_layout",
    "diagram_crop",
    "vision_candidate",
    "manual_review"
  ],
  "parserVersion": "smeg_dishwasher_install_matrix_v1",
  "status": "canary"
}
```

One brand may have many profiles; unrelated brands may share a structural
profile only after negative fixtures prove the grammar is safe. If zero or more
than one profile matches, the router returns `unsupported` or `ambiguous` and no
claim is accepted.

### 9.2 Required structural variation

Profiles must express, rather than assume:

- `W x H x D`, `H x W x D`, `D x W x H` and named-value layouts;
- millimetres, centimetres and mixed source display, with explicit unit per
  value group;
- separate product body, door, handle, installed envelope, cut-out/niche,
  operation, service and delivery/package dimensions;
- fixed and adjustable-height ranges;
- top/front/side diagrams and their view orientation;
- letter legends such as `A`, `B`, `C` mapped to field paths;
- multi-model row/column matrices;
- installation variants such as freestanding, built-in, under-bench, integrated
  and removable-worktop configurations; and
- capacity labels such as gross, net, refrigerator compartment and freezer
  compartment, kept outside geometry arithmetic.

## 10. GeometryAndInstallationSemantics

One compiled semantic registry removes duplicate field lists and prevents
parsers from assigning meaning by position. Its authoritative base is the
existing `product-data-field-rights-dictionary.json`; a small V3 overlay adds
explicit aliases, source-unit rules, capacity fields and category/form-factor
requirement profiles. The generated registry is a rebuildable read model, not a
second field policy.

Each field definition includes:

```json
{
  "field": "operation.doorOpenDepthMm",
  "valueType": "integer",
  "canonicalUnit": "mm",
  "axis": "depth",
  "measurementScope": "product_door_open_90",
  "allowedInclusions": ["body", "door", "handle"],
  "allowedApplicability": ["required", "optional", "not_applicable", "unknown"],
  "fitRole": "advisory_or_hard_by_category",
  "publicationClass": "installation"
}
```

The registry covers:

- `closedEnvelope.*`
- `productBody.*`
- `installation.*`
- `cavityOpening.*`
- `operation.*`
- `service.*`
- `ventilation.*`
- `waterConnection.*`, `powerConnection.*`, `drainConnection.*`
- `delivery.*`
- `capacity.netLitres`, `capacity.grossLitres`,
  `capacity.refrigeratorNetLitres`, `capacity.freezerNetLitres` and
  `capacity.variableZoneNetLitres`
- `professionalInstallation.required`

The canonical field paths deliberately follow the existing runtime geometry and
Claim V2 paths to avoid a second geometry model. The semantic registry carries
an explicit field-by-field compatibility table for the longer
installation-knowledge names. Prefix wildcards are forbidden because similarly
named fields can have different scope. Representative mappings are:

```text
installationClearance.rearMm          -> installation.rearMm
operationEnvelope.doorOpenDepthMm     -> operation.doorOpenDepthMm
operationEnvelope.hingeSideSpaceMm    -> operation.hingeSideSpaceMm
operationEnvelope.lidOpenHeightMm     -> operation.lidOpenHeightMm
deliveryEnvelope.widthMm              -> delivery.widthMm
```

The aliases are accepted only at the existing installation-knowledge boundary;
all new Claim V3 IDs use the canonical path on the right. `service.*`,
`ventilation.*` and connection fields retain their existing distinct meanings.
An envelope volume calculated from W/H/D, if ever shown, is a labelled derived
display metric and not a manufacturer capacity claim.

Category and form-factor applicability is a separate matrix referencing these
field definitions. It must represent `unknown` and `not_applicable` separately.
An explicit source zero is valid only for fields whose semantic definition
allows zero.

Numeric definitions distinguish integers from bounded decimals; source values
are preserved and canonical decimals are normalised at the field's declared
precision before hashing. Conditional requirements use explicit `allOf`/`oneOf`
groups. For example,
power voltage is satisfied by either `powerConnection.voltageV` or both
`powerConnection.minimumVoltageV` and
`powerConnection.maximumVoltageV`; `powerConnection.voltage` is a requirement
group ID and can never be emitted as a field claim.

## 11. Artifact lineage and multimodal extraction

### 11.1 Source preservation

The original response bytes are the root artifact. The canonical identity is
its SHA-256, not its filename or URL. A root is `source_artifact` plus an
explicit media type; it may be PDF, HTML, JSON, CSV, CAD or another policy-
approved format. PDF-specific transformations require a PDF root, but Claim V3
lineage is not restricted to PDFs. URLs and retrieval records point to the root
object and may have multiple content versions.

### 11.2 Derived artifacts

Each transformation writes a new immutable node:

- native PDF text and vector metadata;
- MinerU `content_list_v2` JSON;
- readable Markdown;
- retrieval chunks with page/span locators;
- rendered page images;
- OCR page JSON;
- table structures;
- diagram crops; and
- vision candidate annotations.

Every derived node records:

- its own content hash and object path;
- parent artifact hash;
- tool name, version/model revision and options hash;
- page range;
- creation time; and
- validation status.

Claim locators use a zero-based source-page index internally only where the
existing MinerU object requires it; the public/receipt locator uses one-based
page numbers. `bbox` is `[x0, y0, x1, y1]` in a 0..1000 coordinate space with a
top-left origin, bound to the rendered-page artifact hash and its pixel
dimensions. Raw PDF-point or OCR-pixel coordinates remain in the derived
artifact so the normalisation is reproducible.

No Markdown or chunk becomes a new authority. A claim always traces back to the
original source artifact and the exact derived fragment used to locate it.

### 11.3 Extraction routing

```text
validate PDF bytes
  -> inspect native text/vector/image coverage
  -> select one DocumentFamily profile
  -> execute the profile's deterministic extractor chain
  -> emit candidate fragments
  -> validate model binding + semantic binding
  -> create candidate claims
  -> receipt/reconciliation/review
```

Raster OCR is used when the relevant page content is image-based or native
extraction is insufficient. Vector PDFs are not rasterised as the primary path.
Diagram vision is invoked only for selected diagram regions and returns
candidates with bboxes; it does not make final axis or field decisions.

## 12. Immutable claims and receipts

### 12.1 Claim envelope

Architecture V3 wraps existing dimension and installation values in one claim
envelope:

```json
{
  "schemaVersion": 3,
  "claimId": "claim_...",
  "subject": {
    "type": "canonical_product",
    "canonicalProductId": "fa_prod_...",
    "market": "AU"
  },
  "field": "closedEnvelope.widthMm",
  "value": {"kind": "fixed", "canonical": 598, "unit": "mm"},
  "semantics": {
    "axis": "width",
    "measurementScope": "product_closed_external",
    "inclusions": ["body", "door"],
    "applicability": "required"
  },
  "sourceRepresentation": {
    "kind": "ordered_dimensions",
    "label": "Dimensions H x W x D",
    "axisOrder": ["height", "width", "depth"],
    "values": [850, 598, 600],
    "unit": "mm"
  },
  "evidence": {
    "sourceArtifactSha256": "...",
    "derivedArtifactSha256": "...",
    "fragmentSha256": "...",
    "page": 7,
    "bbox": [120, 340, 450, 680]
  },
  "applicabilityProof": {
    "bindingType": "EXACT_MODEL",
    "namedModels": ["EXAMPLE100"],
    "relationshipAssertionIds": []
  },
  "derivedFromClaimId": null
}
```

`claimId` is the SHA-256 of the complete canonical semantic payload, excluding
only `claimId` itself. Review state is not stored in the claim; it is an
append-preserved decision event.

The claim `value` union is closed and explicit:

- `{ "kind": "fixed", "canonical": 598, "unit": "mm" }`;
- `{ "kind": "range", "minimumCanonical": 820, "maximumCanonical": 850,
  "unit": "mm" }`;
- `{ "kind": "boolean", "canonical": true, "unit": null }`; or
- `{ "kind": "not_applicable", "canonical": null, "unit": null }`.

Unknown does not create a claim. It remains an absent field plus an explicit
missing/unknown readiness state.

`sourceRepresentation` is also a closed union: `ordered_dimensions`,
`named_scalar`, `named_range`, `boolean_statement` or `not_applicable_statement`.
Only `ordered_dimensions` carries `axisOrder`; non-axis fields must instead bind
their label and value/range/statement in the same fragment. This prevents the
axis rule from making boolean and applicability claims impossible.

### 12.2 Receipt

`EvidenceClaimReceipt` schema 1 is a new envelope over, not a replacement for,
the existing source receipt schemas 2 and 3 and installation-field receipts.
It binds one Claim V3 ID, the exact subject, a replay-valid
`VerifiedSourceBinding`, source and derived artifact hashes, fragment locator,
toolchain/policy versions and rights decisions. `VerifiedSourceBinding` is
created only by an allowlisted verifier adapter (manufacturer, official
registry, licensed supplier or retailer observation) and supplies the trusted
authority class. Unsupported source kinds cannot receive a claim receipt.

For a target claim derived through a finite official relationship, the target's
claim receipt binds the source claim receipt and every relationship-assertion
receipt. It does not pretend that the source product's exact-model receipt was
issued directly for the target SKU. Any change to value, subject, axis, scope,
inclusion, locator, source authority, rights, toolchain, policy or relationship
proof invalidates replay.

### 12.3 Decision events

Allowed decisions are:

- `accepted`
- `rejected`
- `quarantined`
- `superseded`

Every decision stores claim ID, reason codes, policy version, actor and time.
Automated decisions use a named deterministic policy actor. Human review is
required where the policy returns ambiguity.

The active decision is reduced from the append-only event graph: event IDs are
unique, every superseded ID must exist for the same claim, the graph must be
acyclic and exactly one terminal event may remain. Zero or multiple terminal
events quarantine the claim.

## 13. Deterministic arbitration

The source hierarchy is a tie-break framework, not the first gate:

```text
official installation/engineering manual
  > official product specification
  > official AU government registry
  > retailer observation
```

Before hierarchy is considered, claims must have the same exact subject, field,
measurement scope, applicability and compatible inclusion semantics. Authority
order is read from the verified claim receipt's source binding, never from the
claim or extraction output.

Rules:

1. Identical claims from independent official artifacts corroborate each other.
2. A newer official artifact may supersede an older one only through explicit
   content/version lineage or a policy-approved current-document relation.
3. An official field with explicit axis proof may be accepted while a lower
   authority axis permutation is recorded as an anomaly. The lower claim is not
   silently edited.
4. Tier alone never repairs an ambiguous official axis. Ambiguous high-tier
   evidence is quarantined.
5. Same-tier, same-scope disagreement is quarantined unless explicit
   supersession resolves it.
6. Package, cavity, body, open-door and closed-envelope measurements never
   conflict merely because their values differ; they are different semantics.
7. Plausibility ranges may reject impossible candidates or prioritise review,
   but cannot assign an axis.

## 14. Evidence readiness versus Fit evaluation

The product-level read model uses evidence states only:

```text
DIMENSIONS_UNKNOWN
DIMENSIONS_READY
INSTALLATION_PARTIAL
FIT_READY
CONFLICT_QUARANTINED
```

It also lists accepted claim IDs, conflicts and readiness by evaluation profile:
`cavity_placement`, `operation`, `services`, `delivery` and
`full_installation`. Delivery evidence is required only when delivery is in the
selected evaluation profile; it cannot make cavity readiness falsely negative.
It never stores a `VERIFIED_FIT` boolean.

Runtime evaluation continues to return:

- `NO_FIT`
- `INSUFFICIENT_DATA`
- `CONDITIONAL_FIT`
- `LIKELY_FIT_ESTIMATED`
- `VERIFIED_FIT`

`VERIFIED_FIT` requires `FIT_READY`, valid claim receipts and all required user
site measurements. A product with W/H/D but unknown clearances keeps useful
dimension filtering and returns `INSUFFICIENT_DATA` for a positive fit claim.
A known hard failure remains `NO_FIT` even if other fields are unknown.

### 14.1 Fit V4 convergence contract

Fit V4 is one pure implementation shared by Node tests and the browser. It
reuses the existing Fit V3 checks and replaces the smaller browser-only outcome
path; Fit V3 remains a compatibility adapter during shadow comparison.
SearchCore emits two independent objects:

- `sizeMatch`: W/H/D filter facts only; and
- `fitDecisionV4`: the selected evaluation profile, typed checks, evidence and
  site-input gaps, margins, outcome and receipt-set hash.

Outcome precedence is fail-closed. A known lower bound such as bare product
width exceeding cavity width produces `NO_FIT` even when clearance is unknown.
If the known lower bound passes but a required product field or user input is
unknown, the result is `INSUFFICIENT_DATA` or `CONDITIONAL_FIT` according to the
check class. `VERIFIED_FIT` requires the selected readiness profile to be
`FIT_READY`, a receipt-set hash matching the published evidence snapshot and no
estimated input. Replacement mode never consumes or emits `fitDecisionV4`.

## 15. Storage design

The authoritative implementation uses the repository's current pattern:

- versioned JSON policy under `data/architecture-v3/policies/`;
- deterministic generated read models under `data/architecture-v3/generated/`;
- audit and shadow comparison under `data/architecture-v3/reviews/automated/`;
- immutable large/source objects in the configured evidence object store; and
- pure ESM domain functions under `src/domain/`.

SQLite, DuckDB and vector indexes may later be disposable query projections.
They must be rebuildable and cannot become claim or receipt authority. This
decision avoids a dual-source-of-truth migration before the schemas stabilise.

## 16. Migration and PR sequence

This design is delivered through small PRs. The current PR contains only this
specification and the executable plan.

| PR | Working result | Publication effect |
| --- | --- | --- |
| 0 | Design, file map, tests and gates | none |
| 1 | Brand, product-family and semantic registries | none; generated shadow data only |
| 2 | Document-family registry, routing and artifact lineage | none; candidate extraction only |
| 3 | Claim V3 envelope, source bindings, claim receipts and decision events | none; dual-read/shadow write |
| 4 | Finite-model relationship derivation and deterministic arbitration | none; shadow accepted set |
| 5 | Profile-scoped evidence readiness, Fit V4 and end-to-end shadow projection | none until comparison gate passes |
| 6 | Real PDF/MinerU/OCR/diagram canaries by structural profile | no broad fan-out |
| 7 | Feed accepted fields into the existing release control plane | bounded, reversible release candidate |
| 8 | Evidence drawer and transparent fit arithmetic | staged UI flag |

No PR may combine schema introduction, historical backfill and public cutover.

## 17. Required test matrix

Every affected field path must have positive and negative witnesses across five
boundaries: producer, consumer, receipt replay, public projection and repeated
run.

Mandatory adversarial cases include:

- `W x H x D`, `H x W x D` and `D x W x H`;
- a value-only triple with no axis legend -> no claim;
- centimetre conversion with preserved source values;
- mixed or absent units -> quarantine;
- product depth, depth including handle, cavity depth and open-door depth in one
  document -> four distinct fields;
- adjustable height range, including removable-worktop configuration;
- capacity litres next to dimensions -> no geometry cross-assignment;
- a multi-model table with exact finite rows;
- a shared manual with no finite model binding -> family scope only;
- a cosmetic suffix with no official relation -> no inheritance;
- an official shared-field assertion -> exact target derived claim with full
  lineage;
- same-authority conflict -> quarantine;
- lower-authority axis permutation -> anomaly, no mutation;
- OCR text that disagrees with native text -> quarantine/review;
- bbox or fragment-hash tampering -> receipt replay failure;
- parser-supplied authority tier -> rejected unless reproduced by a source
  verifier adapter;
- boolean and not-applicable statements -> no fake axis requirement;
- decimal `m3`, `kPa`, `A` or `kg` value -> preserved at declared precision;
- missing installation data -> `INSUFFICIENT_DATA`, never `VERIFIED_FIT`;
- known width failure plus other unknowns -> `NO_FIT`; and
- replacement results never entering the cavity-fit publication path.

## 18. Cutover gates

Public cutover is authorised only when all gates pass on the same commit and
evidence mount:

1. all repository tests pass;
2. Architecture V3 focused tests pass;
3. every Claim V3 receipt replays byte-for-byte;
4. every accepted claim has a replay-valid authority-specific source binding
   and sufficient action-scoped rights for its publication surface;
5. zero accepted claim has an unresolved identity, axis, scope, unit or
   applicability state;
6. zero family-scope or hypothesis edge produces a public field;
7. zero unsupported legacy field leaks through an accepted W/H/D receipt;
8. Fit V4 passes Node/browser parity and V3 shadow-difference review;
9. full publication audit reports zero violations;
10. two consecutive builds produce byte-identical semantic outputs;
11. the candidate-versus-active impact report is reviewed; and
12. rollback uses the existing active-release pointer, not evidence deletion.

## 19. Stop conditions

Implementation pauses for a first-principles product decision when any of these
occurs:

- an official source relation names a product group but does not state which
  fields are shared;
- a document profile can match more than one axis or measurement scope;
- an apparent platform relation depends only on model prefixes, suffixes,
  retailer text or physical plausibility;
- the proposed schema cannot represent a source distinction without discarding
  information;
- migration would require rewriting immutable evidence or accepting a receipt
  that cannot replay;
- a new requirement would make product evidence readiness and runtime Fit
  outcome the same state; or
- a public cutover would alter unrelated lifecycle or replacement data.

The question to resolve is always: **what exact product claim may a user rely on,
what evidence proves that exact meaning, and what information would make the
claim false?**
