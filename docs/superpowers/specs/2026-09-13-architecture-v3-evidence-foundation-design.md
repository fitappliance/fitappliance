# FitAppliance Architecture V3 Evidence Foundation Design

- **Status:** REVISED DESIGN — implementation status is tracked only in the linked plan
- **Revision:** 3, 2026-09-14, requiring legacy evidence repair to the same V3 standard
- **Owner:** FitAppliance
- **Product contract:** [Product Core Brief](../../product-core-brief.md)
- **Implementation authority:** [original implementation plan](../plans/2026-09-13-architecture-v3-evidence-foundation.md)
- **Worker protocol:** [Terra Max execution](../../architecture-v3/terra-max-execution.md)

This revision replaces the original unsafe examples and ambiguous joins. It
specifies target contracts, not completed implementation. The plan owns task
order/progress and the worker protocol owns delegation. The Product Core Brief
remains the authority for product promises, lifecycle and Fit. The completed V2
system-first repair programme remains migration history; V3 does not reopen it.
A green documentation PR verifies documents/current code, not future V3 behavior.
The user's 2026-09-14 direction requires old receipts to be supplemented,
corrected and reissued to the same standard as new receipts. Historical replay
is retained for provenance and compatibility, not as the final repair outcome.

## 1. Result and architecture

FitAppliance screens appliances against Australian users' measured space and
documented conditions. Useful W/H/D filtering remains available with incomplete
installation evidence. That evidence cannot produce a positive Verified Fit;
a known, integrity-valid hard incompatibility can still produce `NO_FIT`.

Four registries remain independent:

1. `BrandRegistry`: brand identity, market aliases and references to existing
   official-host policies. Parent groups grant no authority.
2. `ProductFamilyGraph`: series, finite official model groups and platform
   relationships. Index membership grants no field inheritance.
3. `DocumentFamilyRegistry`: inspected document/region structure and versioned
   extraction profiles. A shared manual is not a shared chassis.
4. `GeometryAndInstallationSemantics`: fields, units, range meanings, inclusions,
   configuration and applicability, compiled from the existing field/rights
   dictionary and installation matrix plus a narrow overlay.

```text
source observation -> immutable bytes -> derived artifacts
  -> role-labelled anchors + witnessed joins -> candidate exact-product Claim
  -> verified source/field binding + claim receipt
  -> review admission + complete source inventory + current eligibility
  -> field adjudication -> EvidenceSnapshot + profile readiness
  -> existing release control plane
  -> validated runtime snapshot + current site input -> pure Fit V4
```

OCR, MinerU and vision run offline and propose candidates. No online search
requires an LLM, OCR service, vector store or external disk. This programme adds
no authoritative database, generic RAG framework or arbitrary expression engine.

## 2. Current-state contract and migration map

| Boundary | Current owner | V3 treatment |
| --- | --- | --- |
| Product IDs/quarantine | `src/domain/canonical-registry.mjs` | Preserve canonical identities |
| Candidate acquisition | `src/domain/evidence-source-adapter-contract.mjs` | Retain typed candidate outcomes |
| Immutable source acquisition | `src/domain/evidence-artifact-pipeline.mjs` | Add lineage adapters, preserve bytes |
| Source/MinerU receipts | `src/domain/evidence-source-verifier.mjs` | Preserve case and field-scoped replay |
| Dimension value bounds | `src/domain/dimension-evidence-claim.mjs` | Compile shared semantics without weakening validation |
| Installation knowledge | `src/domain/installation-knowledge-v3.mjs` | Exact aliases and context-aware adapter |
| Required source completion | `src/domain/evidence-candidate-inventory.mjs` | Carry completion and all dispositions into V3 |
| Conflict/supersession | `src/domain/evidence-claim-reconciliation.mjs` | Preserve tested resolution and stopping rules |
| Manual deduplication | `src/domain/historical-document-family-graph.mjs` | Keep separate from parsing profiles |
| Receipt-bound projection | `src/domain/accepted-evidence-publication.mjs` | Consume an explicit reviewed overlay |
| Active release/rollback | `src/domain/active-retail-release.mjs` and `src/domain/retail-lifecycle-release-candidate.mjs` | Extend versioned bindings, retain sole publisher |
| Browser/rich shadow Fit | `src/shared/fit-engine.js` and `src/domain/fit-v3.mjs` | Freeze independent legacy oracle before convergence |

The reviewed local plan base has 3,515 legacy generated records; its bound
active release/runtime has 3,513 records, including 349 current-retail records.
These are different artifacts/denominators, not acceptance targets or a fresh
website observation. G0a must re-read code, descriptor, manifest, input hashes
and counts. The default publication audit's legacy input is not the active
release owner.

The dirty recovery checkout is migration input only. Inventory its paths and
hashes without stash/reset/delete/merge. Reuse validated source objects and
regression witnesses. Its static Fit ledger and implicit optional-file merges
cannot become V3 authority. Preserve each original object and its disposition.

## 3. Global invariants

1. Existing immutable source, derived, claim and receipt objects are never
   rewritten or deleted by migration code.
2. Unknown remains `null` or `UNKNOWN`; it never becomes zero, false or an
   unproved category/configuration default.
3. Product identity, evidence identity, current sale status, rights, visibility,
   evidence readiness and runtime Fit are independent facts.
4. Parent groups, series, filenames, URLs, prefixes and cosmetic suffixes never
   grant exact-model field authority.
5. Every accepted field has an exact subject, explicit semantics, compatible
   configuration and replay-valid source/field proof.
6. OCR, MinerU, vision and LLM output is candidate material, not source authority.
7. Axis, unit, inclusion, range and reference datum are proved, not assigned
   from physical plausibility or an unlabelled value order.
8. A complete source inventory and relevant unresolved conflicts participate in
   adjudication; first success is not source-set completion.
9. Historical receipt integrity and current eligibility are separate checks.
   Revocation may lower readiness without erasing historical evidence.
10. Dimensions-only evidence may support filtering and a valid hard `NO_FIT`,
    but never `VERIFIED_FIT`.
11. Static products may carry profile-scoped `FIT_READY`; only runtime evaluation
    of a validated snapshot and adequate current site inputs yields `VERIFIED_FIT`.
12. Replacement remains independent of cavity Fit and consumes neither Fit V4
    nor evidence-readiness verdicts.
13. Normal builds, portable tests and runtime are independent of the external
    evidence store. Missing required acquisition evidence is an explicit
    incomplete run, never an empty successful overwrite.
14. Fixed-input replay is semantically deterministic. New retrieval, OCR or
    review observations may create new immutable objects.
15. V3 extends the existing release candidate, active pointer and rollback
    controls; an adapter never expands publication/lifecycle authority.
16. Schema introduction, historical backfill and public cutover are not combined
    in one implementation PR.
17. Repaired and newly acquired facts pass the same V3 source/Claim/receipt,
    review, eligibility and adjudication gates. A migration flag, old PASS,
    schema-number change or recomputed digest cannot waive a missing fact.

## 4. Contract deltas and owners

| Audit risk | Required change | Compatibility invariant | Gate |
| --- | --- | --- | --- |
| Numeric coercion | Raw type/finite checks before conversion; field bounds | V2 invalid-input witnesses still reject | G1a/G1b |
| Inclusion ambiguity | Included/excluded/unknown component states | Legacy null never means false | G1a/G4a |
| Configurations become ranges | Explicit context and range meaning | Unsupported context stays candidate-only | G1a/G8a |
| Native header hides scan | Region-readable routing | Existing byte/MinerU gates retained | G3b |
| Cross-page evidence lost/guessed | Role anchors and witnessed joins | No arbitrary number concatenation | G3a/G4a |
| Same-PDF SKU/field leakage | Direct fact equality or finite derivation | Old receipt proves only its actual scope | G4b/G7 |
| Legacy encoding loses fields | Versioned strict V3 JSON identity codec | Original bytes and historical replay remain unchanged | G1a |
| Legacy objects remain permanently weaker | Supplement evidence and reissue through the common V3 chain | No migration-only approval path or in-place edits | G1b/G4b/G6b/G6c |
| Conflicts filtered away | Admission distinct from adjudication | V2 complete-inventory gate retained | G5b |
| Permanent event fork | CAS append and all-head resolution | History immutable; retries idempotent | G5a |
| Stale derived eligibility | Transitive revocation evaluation | Historical replay is preserved | G5a/G7 |
| Receipt hash used as snapshot hash | Separate digests; values inside snapshot | Runtime loader binds active expected digest | G6a/G8a |
| Wrong publication baseline | Explicit active/legacy/candidate bindings | Preserve artifact identity and denominator | G0a/G9a |
| CI does not execute V3 | Default test inclusion; per-file syntax check | Locked install, Node 20 compatibility | G0b |
| Oracle equals implementation | Freeze independent V2/V3 comparison | Never regenerate expected results with V4 | G8b |
| Partial client cutover | Separate calculation/drawer flags; bound asset bundle | Mixed-client and rollback validation | G10/G11 |

## 5. Brand and product-family registries

A brand has stable ID, market-scoped collision-rejecting aliases, optional parent
group and references to the existing manufacturer-host/source-strategy policies.
The registry hashes those inputs and never copies parent hosts into child policy.

Family nodes distinguish `brand`, `marketing_series`, `official_model_group`,
`platform` and `canonical_product`. Edge kinds are `MARKETED_AS_SERIES`,
`LISTED_IN_OFFICIAL_MODEL_GROUP`, `ASSERTED_SHARED_PLATFORM`,
`HYPOTHESISED_SHARED_PLATFORM` and `VARIANT_OF`. Validate endpoint types, finite
membership, canonical identity, duplicate IDs and variant cycles.

Research edges can have no shared fields/receipts. An official platform statement
without field sharing can also be retained as a relationship, but is ineligible
for derivation. `ProductRelationshipAssertion` is an immutable finite product
set, relation, market, exact shared fields/contexts and anchored official proof.
Its own receipt proves a relationship, not a product measurement; use the same
PDF/HTML/JSON/CSV locator union as field evidence.

G7 permits one direct source claim and one finite official route to an exact
target. Both products, the requested field and context must be covered explicitly.
Materialize an exact-target claim and derived receipt binding the source claim
receipt and relationship receipts. No unbounded/transitive platform fan-out.
A source-product verifier is never called as though it directly proved the target.
Current eligibility of every dependency is rechecked at projection time; target-
specific conflicting evidence remains part of normal adjudication.

## 6. Shared engineering semantics

### 6.1 Field definitions

Compile `data/architecture-v2/policies/product-data-field-rights-dictionary.json`
with the installation applicability matrix and a narrow V3 overlay. Preserve
existing field identity, rights and Fit roles; require explicit versioned deltas
for actual semantic refinements. Canonical paths follow runtime geometry, plus
separate product-body, cavity and capacity fields. Litres never enter Fit math.

Aliases are exact mappings, including `installationClearance.rearMm` to
`installation.rearMm`. Ambiguous `operationEnvelope.depthMm` stays review-only.
`powerConnection.voltage` is a requirement-group ID, satisfied by `voltageV` or
the minimum/maximum voltage pair, and can never be a claim field.

Each field defines numeric type, permitted value kinds, canonical unit/precision,
source-unit conversions, typed bounds and endpoint inclusivity, axis, scope,
inclusion components, allowed applicability/range meanings, Fit role and evidence
requirements. Non-negative dimensions/clearances and explicit zero rules preserve
V2 protections. Other signed quantities require their own explicit field policy.

### 6.2 Strict normalization

Before multiplication, require each raw number/range endpoint to be a finite
JavaScript number. Reject null, booleans, strings, arrays, non-finite numbers and
unknown object keys. Then check allowed unit dimension/conversion, precision,
bounds and ordered range endpoints. Reject unjustified rounding. Decimal units
such as A, kPa and m3 retain their declared precision; do not apply a universal
integer-mm rule. Validate allowed applicability/inclusions on every value branch.

Inclusions are a component map with `included`, `excluded`, `unknown` values.
Missing components mean unknown. Old `includesDoor`/`includesHandle` nulls cannot
be converted to exclusion. A not-applicable claim has null value/unit and cannot
fill a hard numeric requirement unless the requirement policy makes it N/A.

### 6.3 EngineeringContext

Every claim contains a closed context object; this is a schema fixture, not a
measurement for a real SKU:

```json
{
  "configurationKey": "underbench_worktop_removed",
  "conditions": [
    {"parameter": "installationMode", "operator": "eq", "value": "underbench"},
    {"parameter": "worktop", "operator": "eq", "value": "removed"}
  ],
  "referenceDatum": "finished_floor",
  "operatingState": {"kind": "closed", "angleDegrees": null}
}
```

Conditions initially form only an `allOf` of allowlisted equality predicates.
The policy defines finite parameter names/types/values for installation mode,
worktop, adjacent wall, opening state and optional service configuration. Unknown
condition values do not satisfy a predicate. Unsupported conditions are preserved
as candidate gaps, never evaluated as arbitrary code or guessed false.

Configuration keys are exact-product/market-scoped. Null means unspecified;
reserved `unconditional` requires evidence of applicability across the evaluated
configurations. Reference datums initially include `envelope_extent`,
`finished_floor`, `product_front_plane`, `product_rear_plane`,
`cavity_front_plane` and `unknown`. Operating-state kind is `closed`, `door_open`,
`lid_open` or `unknown`, with an explicit angle where required. Unknown context
blocks the checks that require it, not unrelated proved fields.

One evaluation selects compatible values across all fields. Do not independently
choose small dimensions from different configurations. Composing ventilation and
service gaps with max requires compatible reference planes and an explicit rule.
Reject contradictory equality predicates and configuration keys inconsistent with
their witnessed conditions. An unconditional claim applies to every configuration
it proves; an applicable conditional claim does not silently override it. Compare
overlapping applicable claims together, unless a witnessed supersession resolves
them. Only demonstrably disjoint configurations avoid such a conflict.

### 6.4 Range meaning and compatibility

Range meaning is `adjustment`, `uncertainty` or `allowed_interval`. Discrete
worktop-present/removed heights are separate contextual claims, not a continuous
range. Preserve original endpoints and unsupported distinctions.

For uncertain required space, the upper bound supports a conservative positive
result and a lower bound exceeding available space supports a hard failure.
Overlapping uncertain values need confirmation. Allowed operating intervals use
membership checks. An adjustment needs evidence of an achievable setting and the
relevant configuration/site inputs before selecting that value.

An adjustment range 820–850 with cavity height 830 and no selected setting gives
placement UNKNOWN, not a max-only NO_FIT. Conservative maximum still supports a
positive result when it fits and all documented conditions hold. G8a clarifies
Product Core Brief section 8.1 accordingly; old V2/V3 output stays frozen and any
V4 difference is an explicit, reviewed range-semantics delta.

## 7. Artifacts, evidence anchors and extraction

### 7.1 Immutable lineage and typed locators

Root identity is the SHA-256 of original response bytes, not URL/filename. Roots
can be PDF, HTML, JSON, CSV or another approved format. Derived artifacts include
native text, MinerU/OCR JSON, Markdown, chunks, tables, page images, crops and
vision annotations. Bind own hash, parent, media type, tool/model revision and
options hash. Different nondeterministic outputs are distinct observations.
Paths are validated locators, not identity; large objects stay in the configured
store, while normal builds use bounded portable records and accepted snapshots.

Fragments bind content, parent artifact and a typed locator: `pdf_bbox`,
`json_pointer`, `html_selector`, `csv_cell`, `text_span`. PDF receipts use one-
based pages and 0..1000 top-left `[x0,y0,x1,y1]` boxes bound to rendered-page hash,
pixel dimensions, rotation and crop transform. Retain raw PDF/OCR coordinates
for replay; a crop cannot reuse full-page coordinates without its transform.

### 7.2 Multi-anchor field proof

An anchor is `{ anchorId, role, fragmentSha256 }`. Roles are `subject`, `value`,
`axis`, `unit`, `legend`, `condition`, `configuration`, `reference_datum`.
Each anchor resolves independently. A direct claim has one source root and can
use several anchors across pages/regions. Independent roots create separate
claims for corroboration, not an undocumented composite claim.

Relations contain kind, from/to anchor IDs and witness anchor IDs. Closed kinds
are `same_table_row`, `diagram_legend`, `explicit_continuation`,
`exact_model_scope`, `condition_applies`. Joins must prove the same finite model/
row and diagram context. Proximity or a matching letter is insufficient where
multiple diagrams could match. Unit headers and installation footnotes are
retained as evidence rather than guessed into the numeric fragment.

### 7.3 Region-based DocumentFamilyRegistry

Profiles contain ID, brandIds, categories, document types, content modes,
required/forbidden structural signals, extractor chain, version and status.
Different brands can share grammar only with appropriate positive/negative
witnesses; brand alone never assigns dimensions or parsing scope.

Inspect relevant regions for native text readability, numeric/label coverage,
raster content and vector/table/diagram structure. Native header glyphs do not
prove that a scanned dimension drawing is readable. Mixed regions on one page
and mixed page types require distinct observations. Select exactly one eligible
profile per extraction region/context; unsupported/ambiguous regions return typed
candidate failures. Independent proved regions can be retained, but unresolved
relevant diagrams/footnotes remain part of completion/conflict handling.

Native extraction preserves vector precision; MinerU supplies structured layout;
OCR/vision operates on required unreadable/image regions. Every result remains
candidate-only. Disabling a profile also affects eligibility of earlier derived
fields under section 10, not just future routing.
Direct PDF acceptance retains the original PDF plus validated, policy-pinned
MinerU content_list_v2 artifact pair and source-receipt replay. Native text,
Markdown, OCR or vision output cannot bypass that gate. New cross-region proof
support is an explicit, canary-tested verifier-policy delta; it never upgrades
an older receipt beyond the fields and model scope it actually verified.

### 7.4 Canary evidence and portability

G3b introduces real structural canaries before the complete chain. Cover W/H/D
orders, missing/mixed units, multi-model rows, scanned bodies with native headers,
same-page hybrid regions, cross-page legends/footnotes, rotation/crops, capacity
next to dimensions, distinct top-cover configurations and multiple door angles.
Each active profile has at least one positive and two negative source-hash
witnesses; this is a coverage floor, not statistical proof of accuracy.

Expected subject/value/unit/context/anchors and forbidden claims are independently
checked against original evidence, never generated by the tested extractor.
G6b adds complete Claim/Receipt canaries. A bounded attestation binds code commit,
profile/policy hashes, source/derived hashes, expected-fixture hash, results and
review identity. Sanitized portable fixtures permit CI replay. CI can verify the
manifest/portable cases, not claim it re-read unmounted PDFs. Missing original
objects/mount gives NOT_RUN or BLOCKED and cannot overwrite valid prior results
with empty output. Acquisition validation separately requires original objects.

Additional OCR tools, including Unlimited OCR Works, are optional executors only
after existing extraction fails the required region. Record license, pinned
source/model revisions, output contract and measured canaries before adoption.
Installing new OCR tools is not part of this documentation change.

## 8. Immutable Claim V3

The closed envelope is:

```text
schemaVersion: 3
canonicalizationVersion: 'fit-evidence-json-v3-1'
claimId: canonical payload hash excluding claimId
subject: canonicalProductId, market
field: canonical path
value: fixed | range | boolean | not_applicable
semantics: axis, measurementScope, component inclusions, applicability
context: EngineeringContext
sourceRepresentation: ordered_dimensions | named_scalar | named_range |
                      boolean_statement | not_applicable_statement
evidence: sourceArtifactSha256, anchors[], relations[]
applicabilityProof: EXACT_MODEL | FINITE_OFFICIAL_RELATION,
                    namedModels[], relationshipAssertionIds[]
semanticPolicySha256, extractionProfileSha256
derivedFromClaimId: direct source claim ID or null
```

Fixed has canonical value/unit; range has minimumCanonical, maximumCanonical,
unit and rangeMeaning; boolean has boolean canonical value/null unit; N/A has
null value/unit. Unknown produces no value claim and stays in disposition and
readiness. Reject mixed union keys. Preserve original source labels, units,
values/statements and declared order. Only ordered dimensions carry axisOrder;
other kinds prove their labels via the anchored mapping, without fake axes.

Hashes cover subject, semantics, context, source representation, anchors/joins
and declared semantic/profile hashes. Sort set-valued IDs but retain meaningful
ordered arrays such as axisOrder and value tuples. Reject duplicate IDs and
normalize decimal representation before hashing. G1a owns one browser-safe
strict V3 serializer and exports `CANONICAL_EVIDENCE_JSON_VERSION` with value
`fit-evidence-json-v3-1`. Every new V3 canonical-JSON identity payload includes
`canonicalizationVersion` with that value before computing its digest; validators
reject absent/unsupported versions. Raw source/derived byte SHA-256 and existing
V2 input hashes keep their original domains and bytes. No new SHA algorithm is
introduced, and individual V3 modules cannot invent their own serializer.

Keep the existing historical encoder/export unchanged for archive replay and
the unchanged V2 path. The new strict codec preserves own `__proto__` keys,
rejects sparse arrays, undefined/non-finite values, accessors, symbol keys and
other non-JSON inputs rather than silently dropping information. Preserve array
order and deterministically order object keys; reject non-enumerable object
entries and extra non-index array properties rather than dropping them (the
array's built-in length is not a data entry). Golden legacy bytes/digests and
negative V3 witnesses make the compatibility boundary explicit. Reissued V3
receipts use the corrected codec, never the defective historical encoder.

V2 wrappers create V3 candidates only without semantic loss. Old objects retain
schema versions/bytes. Unknown legacy scope/inclusion cannot become proved V3
context through an alias or wrapper.

## 9. Source bindings and Claim Receipts

The initial adapter allowlist covers manufacturer verification and installation
field receipts. Replay original case identity, source hash and verified field
set under their own historical policy/version. `VerifiedSourceBinding` contains
trusted authority/document role, rights decisions and `verifiedFactBindings`.
Each fact binding identifies exact product/market, field, typed value, semantic/
context proof and source-anchor proof.
The binding producer receives original receipt/case/objects and replays the
allowlisted verifier; authority and fact bindings are derived outputs. A caller-
constructed `verified: true` or fact array cannot substitute for that replay.

Direct claim receipts require equality with the verified fact after explicit
legacy mapping. Same PDF hash or official host is insufficient. Prove the exact
multi-model row, not merely that the SKU appears somewhere in the manual.
Legacy W/H/D receipts cannot authorize a new installation field or stronger
configuration claim; obtain compatible field verification/re-attestation first.
Document classification needs anchored official title/metadata. Unclassified
manufacturer material does not gain a stronger tier by parser declaration.

Government/provider/retailer observations remain existing typed candidates/hints
under V2 policy in the first implementation. A policy unit test may use a clearly
labelled adapter stub; that is not end-to-end acceptance. Additional production
adapters need a separately defined field/rights-verification task and authority.

A new `EvidenceClaimReceipt` has `receiptType: 'EvidenceClaimReceipt'`,
`schemaVersion: 3` and the section 8 `canonicalizationVersion`, all inside its
identity payload. A legacy manufacturer verification receipt may already have
`schemaVersion: 3`; it is a different contract and is not already upgraded.
Dispatch by named contract/schema/policy/codec, never a schema integer alone.
A direct `EvidenceClaimReceipt` binds claim ID/payload, exact fact binding,
source binding, anchor set, toolchain/policy and rights decisions. A derived
receipt instead binds its direct source and finite relationship receipts. Replay
checks exact binding equality, not the presence of digest-looking strings.

Internal validity grants no `public_display`, `quote_excerpt`, `link_documents`
or image right. Evaluate each existing action-scoped right independently.
Historical proof can remain valid when present-day use is forbidden.

### 9.1 Repair legacy receipts to the common V3 standard

All old receipt types belong in a versioned upgrade inventory, including
unresolved references and rejected/incomplete old assertions. Inventory coverage
is not the count of product rows, acceptance cases or old PASS summaries. Each
origin retains an immutable container byte hash and a JSON pointer (empty for a
standalone receipt), original schema/ID where present, and the exact case/source
bindings needed by its type. Two origins with the same old digest are not
silently collapsed; distinguish copies from contradictory payloads and scopes
using resolved objects, not an old hash alone. Missing referenced objects stay
explicit inventory entries. Do not modify or reserialize archived source bytes.
Each type targets its corresponding new contract: acquisition/discovery proof
cannot become a geometry fact receipt. The initial field-reissue allowlist is
the same manufacturer/installation set as G4b. An unsupported source/target
contract is `BLOCKED_CONTRACT`, not missing evidence, automatic field authority
or a silently excluded origin; it needs a separately defined adapter before
that origin can be declared upgraded.
Freeze the declared field/context scope of each origin. One source receipt may
require multiple new field receipts; a partial success cannot shrink that scope
or mark the whole origin upgraded. Keep successful field outputs and outstanding
gaps separately, with scoped reviewed exclusions rather than silent omission.

Repair follows the existing chain, not a second verification engine:

1. Resolve receipt, case, source record, original artifact, derived index/object
   and historical policies. Some source receipts are only small binding
   summaries; an absent field in that summary is not proof that the source
   evidence is missing. Check the referenced owners first.
2. Reuse valid anchors and artifacts where the common V3 validators can verify
   them. Record missing exact-model/market, field scope, units/axes, inclusion,
   configuration/range meaning, reference datum, region joins, parser lineage,
   policy or rights proof as field-scoped evidence requests. Re-extract only
   where required; do not guess missing values or require unnecessary new OCR.
3. Supplement or correct facts only from verified source evidence. A rejected
   historical assertion can be replaced by independently proved new evidence;
   its replay failure and conflict disposition remain visible. Never relabel an
   invalid old binding as valid or extend an old dimension proof to installation.
4. Feed the supplemented candidate to the same G4a/G4b factories as a new
   acquisition, then the same G5a/G5b/G6a review, eligibility, complete-source
   adjudication and snapshot path. Current review times and policy identities
   are genuine new records; original observation/review times are not rewritten.
5. G6c commits a separate immutable `LegacyReceiptUpgradeRecord` connecting old
   origin references to new exact Claim/receipt IDs, field-level corrections,
   supplementation evidence, target contract versions and validation outputs.
   This is an audit relation, not field authority or family inheritance. Do not
   overload `derivedFromClaimId` or cross-Claim `supersedesDecisionIds` for it.

The latest per-origin upgrade disposition is `UPGRADED`, `NEEDS_EVIDENCE`,
`CONFLICT_QUARANTINED`, `BLOCKED_CONTRACT` or `REJECTED_WITH_REASON`. `UPGRADED` requires the common
V3 receipt checks, and is not an assertion of current eligibility, complete
installation evidence, publication or Verified Fit. Report those independently.
Missing source/context/proof cannot produce a stronger receipt; retain useful
size filtering under its existing policy and show `INSUFFICIENT_DATA` for an
unsupported Fit conclusion.

The bounded batch manifest binds inventory scope/hash, selected origin IDs,
target schema/codec/policies, source inputs, code identity and prior committed
head. Reuse G5a's single-writer/CAS/durable immutable commit path; no second
ledger writer. Retry returns the same committed objects, a changed input creates
a new attempt, and batch B retains A. The inventory records both processed and
unprocessed origins; no successful subset can replace the cumulative manifest.
An unavailable external store does not mark repair complete or erase prior work.

Coverage and success use separate denominators: accounted origins, upgraded
origins/fields, unresolved evidence, conflicts and reasoned rejections. No
pending item is counted as repaired. A small canary or completed runner task is
not whole-inventory repair completion. New V3 release consumers require the new
receipts; historical replay is not a fallback when V3 evidence is incomplete.
Actual consumer replacement and any rollback remain G9b/G10 release decisions,
never an automatic effect of repair. The currently deployed V2 bundle is not
mutated by this programme's backfill or the plan revision.

## 10. Review, persistence and current eligibility

### 10.1 Admission and recoverable event history

`ClaimReviewDecision` has admitted/rejected/quarantined/superseded decisions.
Admission only permits participation in adjudication; accepted fields are an
adjudication output. Events bind claim ID, typed reason/scope, policy, actor,
decidedAt, idempotencyKey and sorted `supersedesDecisionIds`.

Normal decisions replace one head. An explicit reviewed resolution can reference
all terminal heads of a fork for that claim. Validate same-claim parents,
existence, unique IDs and an acyclic graph. Multiple heads remain quarantined
until resolved, without making recovery structurally impossible.

### 10.2 Durable single-writer commit

Use a local single-writer lock/lease and `expectedHeadSha256` compare-and-swap.
A stale writer receives STALE_HEAD and reloads. Same idempotency key/payload
returns the original event/time; a conflicting payload under that key fails.

G5a exposes pure `prepareClaimReviewDecisions` and one bounded
`commitImmutableEvidenceBatch` primitive for the fixed `reviews` and
`legacy-upgrades` object namespaces. They share one cumulative committed head
and coordinated writer; they do not advance separate transaction pointers.
The preparation API validates against a committed basis without writing. G6c
validates its proposed common V3 chain, then commits new receipts, prepared
review events and audit mappings together. A changed basis fails CAS and must
be revalidated; do not commit review admission first and the upgrade pointer
later. The commit primitive checks hashes/references and durability, not source
truth or review authority. An upgrade audit is not a cross-Claim review event.
Reject unknown namespaces. G5a's portable transaction tests require no future
G6c module; G6c supplies the later typed integration tests. Do not create a
second writer/database for repair.

Write and validate temporary immutable events, then atomically rename them.
Commit the head/batch manifest only after all referenced inputs/events verify.
Flush event bytes and required parent-directory entries before advancing the
manifest, then durably flush its commit before acknowledging success. Reuse
existing persistence helpers after checking these guarantees; do not claim
power-loss durability on a storage backend that cannot provide them.
An atomic event write is not an atomic whole-batch commit. Define recovery for:

- crash before event commit: old head remains authoritative;
- event committed, head not committed: retain the unreferenced object; resume
  validates job/key/expected parent before attaching it once or retaining it as
  unreferenced history;
- head committed: retry returns the same head/result;
- concurrent/stale lock: do not steal a live writer's lock on elapsed time alone;
- batch B: merge stable records with committed batch A, never replace cumulative
  state with only B's successes.

Small operational ledger/head/manifest state stays in the internal workspace
under existing storage rules; large artifacts stay in the optional object store.
This adds no runtime database or second publisher. Evidence/operational ledgers
are not the orchestration progress ledger and must not be deleted with scratch.

### 10.3 Transitive CurrentEligibility

Use fixed explicit asOf and eligibility policy with active review heads, source
policy, extraction-profile status, source/relationship dependencies and rights.
Historical replay at a receipt's original verification date is a separate check.
Revocation invalidates current use of dependent derived claims, accepted views,
readiness and future release candidates. Preserve all historical objects;
rebuild in dependency order and reject missing/cyclic dependency graphs.

Readiness can decrease after new conflicts or revocation. Protect history from
silent loss, not public eligibility from legitimate correction. Disabling a
parser cannot leave earlier fields eligible solely because their hashes match.
A deployed static bundle changes through the existing release process; a current
safety revocation may also disqualify an otherwise replay-valid rollback bundle.

## 11. Complete-source adjudication

Inputs include exact claims/receipts/source bindings, review heads, eligibility,
semantic policy and a hash-bound candidate inventory declaring required source/
discovery scope and every typed candidate disposition. Preserve V2 completion or
prove an adapter; an empty list/first success is not completed research.

Validate input/schema/hash/source-set completion, then receipt integrity/current
eligibility, then subject/field/context/scope/inclusions/datum, then relevant
unresolved claims, before source-tier resolution. A definitely wrong-model or
invalid candidate can be excluded with scoped proof. A valid competing claim
awaiting review blocks that field; unclear scope blocks possibly affected
requirements. Unrelated fields remain usable. Transport/parser failures are
accounted for by completion policy, never silently dropped.

Conflict keys and results are partitioned by product, context and field, not a
catalogue-wide field name. Accepted results refer to claim IDs, not a second
unproved value store. Equivalent independent sources corroborate; two extraction
outputs of one source are not independent evidence.
The partition is the resolved evaluation context, not merely the claim's raw
configuration key. An unconditional width and an applicable conditional width
enter the same field decision for that configuration; differing keys cannot hide
a real disagreement. Unknown condition applicability remains an explicit gap.

Apply the installation-manual/specification/lower-authority policy only after
eligibility and semantics, retaining V2 corroboration/anomaly rules. Tier cannot
repair ambiguous axes. Same-scope official disagreement quarantines unless a
witnessed supersession or existing approved resolution applies. Package/body/
cavity/open-door values do not conflict merely because their numbers differ.

## 12. EvidenceSnapshot and profile readiness

An immutable snapshot binds schemaVersion, exact product/market/category/form
factor/context, requirements with typed values and accepted claim/receipt refs,
profile plans/readiness/receipt sets, conflicts/gaps, claim/receipt/source-binding
IDs, adjudicationSha256, eligibilitySha256, semanticPolicySha256,
requirementPolicySha256, asOf and snapshotSha256.

Snapshot hash covers the whole canonical payload except itself. Each profile's
receiptSetSha256 covers only its sorted receipt IDs; these different digest
domains are never compared for equality. Every requirement equals its claim-
backed value. Changed product/value/context/policy/eligibility/asOf changes the
snapshot. Output path/report-generation time is metadata; a time affecting
eligibility is not removed merely for deterministic tests.

Profiles are cavity_placement, operation, services, delivery and full_installation.
Profile states are UNKNOWN/PARTIAL/FIT_READY/CONFLICT_QUARANTINED, with required and
alternative fields, conflicts, missing hard fields, site-dependent conditions
and receipt sets. Product summary states are DIMENSIONS_UNKNOWN,
DIMENSIONS_READY, INSTALLATION_PARTIAL, FIT_READY and CONFLICT_QUARANTINED.
Top-level FIT_READY means full-installation evidence for the stated context.
Delivery does not block cavity-only readiness. Readiness never proves that site
conditions are satisfied and cannot contain a Fit outcome.
The snapshot factory resolves actual adjudicated Claims/receipts and current
eligibility, derives requirements, computes readiness from those requirements,
then seals the snapshot. Neither values nor readiness arrive as independent
caller authority. There is no circular snapshot/readiness construction.

## 13. Fit V4 and independent comparison

### 13.1 Validated loader, pure calculation

The loader verifies snapshot schema, canonical payload hash, policy compatibility
and expected product/snapshot binding from the active release. Use Node/Web
Crypto adapters with the versioned shared V3 serialization from section 8;
reject unknown canonicalization versions and do not retry V3 verification with
the legacy codec. No new SHA algorithm.
The pure entrypoint is `evaluateFitV4({ evidenceSnapshot, siteProfile,
evaluationProfile })`. It derives requirements only from that validated snapshot.
No separately supplied numbers or caller-declared equal receipt hashes can
approve requirements. Reject altered payload, wrong subject/context or unsupported
schema before a physical verdict. Invalid evidence yields typed unavailable/
insufficient data, not a positive Fit or a physical NO_FIT from untrusted numbers.

Bind displayed results to snapshot hash, profile, rule version and canonical
site-input hash. Input changes or delayed responses invalidate previous results.
Use documented minimum site measurements and explicit uncertainty.
For a bounded required-space interval R and available-space interval A in the
same datum/configuration: R.max <= A.min proves PASS; R.min > A.max proves FAIL;
overlap is UNKNOWN. Derive the available interval from the minimum of the relevant
site measurements and their declared uncertainty, not a generic penalty. Missing
uncertainty is not silently zero. A selected achievable adjustment is resolved
under section 6.4 before these checks. Preserve legacy results in the oracle and
record any resulting V4 differences explicitly.

### 13.2 Physical outcomes and range policy

For valid input: applicable hard FAIL -> NO_FIT; unknown hard placement ->
INSUFFICIENT_DATA; operation/service uncertainty -> existing check-class
CONDITIONAL_FIT; explicit estimates -> LIKELY_FIT_ESTIMATED; all applicable checks
passed with ready exact evidence and adequate inputs -> VERIFIED_FIT.

Known lower bounds precede completeness checks but must themselves be proved and
context-compatible. Section 6 range rules apply. Do not broaden professional,
electrical or plumbing promises beyond approved product policies; unsupported
requirements stay conditional/insufficient by established check class.

SearchCore separates sizeMatch and fitDecisionV4, retains useful insufficient-
evidence manufacturer-mode results, and strips Fit/readiness from replacement.

### 13.3 Safe convergence and flags

Use one pure V4 implementation for Node/browser as a separate initial browser
asset. Preserve the old FitEngine asset/export until consumer cutover. Calculation
and drawer flags are independent.

Before sharing old evaluator code, freeze an independent legacy oracle at its
code hash and preserve reviewed inputs/outputs. Comparing a V3 adapter to V4
when both call V4 proves adapter parity only. Every intentional difference has
a reviewed witness/reason; expected results are never regenerated by V4.

## 14. Existing publication and client compatibility

The overlay consumes accepted snapshot fields plus explicit lifecycle lists.
It emits current-retail and historical-dimension lanes without changing membership.
Historical/reference rows donate no current CTA, price, availability, readiness
or Fit outcome. Existing visibility rules remain authoritative.

Check each current action-scoped right. Blocked display rights exclude fields
and block inconsistent candidates; excerpt, link and image actions are separate.
Static output never carries verifiedFitEligible, successfulFitOutcome, persisted
fitDecision or verified_fit promotion. Legacy values remain readable for audit.

Extend the existing candidate/descriptor with versioned bindings for overlay,
product snapshots, evidence index, engine/schema compatibility and public asset
bundle; retain legacy replay. Promotion selects a complete validated bundle,
not files discovered by existence. Candidate creation is not promotion authority.

Test old client/new data, new client/old data, delayed mixed responses, stale
cache, missing index and compatible rollback. Unknown schema/digest/product
mismatch cannot fall back to a stale Verified Fit badge. A safety-revoked prior
bundle cannot be promoted just because historical replay works; select a safe
compatible bundle or disable affected Fit through the existing release controls.

The drawer follows calculation integration, with honest readiness and current-
session Fit copy. Render only rights-approved source/locator/receipt details and
content-addressed images; bind page/crop hash and bbox, escape text, validate URLs
and never expose local object-store paths.

## 15. Persistence and deterministic replay

Versioned policy, generated views and bounded audit manifests follow the existing
layout under `data/architecture-v3/`. Every view declares exact input identities/
hashes. No optional-file discovery affects a release. Sort sets, preserve ordered
tuples, validate a temporary complete output, then atomically replace its manifest.
Batch/resume uses persisted input/job/parent identity, not in-memory recollection.

Fixed-input projection replay is semantic-deterministic; old immutable receipts
also replay byte-for-byte under their own versions. A new OCR/retrieval/review is
a new observation and may differ. Acquisition and projection replay are different
commands. Disposable query indexes are outside this programme's implementation.

## 16. Delivery dependencies

| Gates | Independent deliverable | Requires |
| --- | --- | --- |
| G0a | Active baseline/migration inventory | Current main and revised plan |
| G0b | Default CI coverage | G0a |
| G1a | Strict semantic compiler/shared canonical codec | G0b |
| G1b | Lossless legacy adapters | G1a |
| G2a | Brand registry using the shared V3 identity codec | G1a |
| G2b | Research-only family registry | G2a, G1a |
| G3a | Multi-anchor lineage | G1a |
| G3b | Regional router and early canaries | G3a, G2a |
| G4a | Exact-product Claim | G1b, G3a |
| G4b | Replayed direct source/fact receipts | G4a, G3b |
| G5a | Durable review/current eligibility | G4b |
| G5b | Complete-source adjudication | G5a, G1a |
| G6a | Bound snapshot/readiness | G5b |
| G6b | Direct vertical canary | G6a, G3b |
| G6c | Legacy receipt inventory, supplementation and reissue batches | G6b |
| G7 | Verified relationship receipt and single-hop derivation | G2b, G6b |
| G8a | Shared Fit V4 and snapshot loader | G6b |
| G8b | Independent legacy shadow | G8a |
| G9a | Whole-chain shadow including legacy upgrade dispositions | G7, G8b, G6c |
| G9b | Publication overlay | G9a |
| G10a | Existing release integration | G9b |
| G10b | Compatibility and rollback drill | G10a |
| G11a | Flagged SearchCore calculation | G10b |
| G11b | Evidence drawer | G11a |

The plan contains exact files/interfaces/tests for each small task; downstream
work consumes reviewed commits and bound outputs. A gate cannot require a future
module to pass. Label unit stubs separately from real adapter/canary completion.

## 17. Required adversarial scenarios

| Scenario | Expected observable result |
| --- | --- |
| Null/false/string/negative clearance | Rejected before conversion; proved permitted zero works |
| Unknown handle inclusion | Preserved through wrapper, Claim and Fit |
| Missing axis legend or mixed units | Typed unresolved candidate, no guessed mapping |
| Separate top-cover configurations | No synthetic continuous range or mixed-config Fit |
| Unconditional and conditional conflicting values | Adjudicated together wherever applicability overlaps |
| Adjustment 820–850, available 830, unselected setting | Placement UNKNOWN, not max-only NO_FIT |
| Required 608, available 607–611 | Placement UNKNOWN, not optimistic PASS or conservative-only FAIL |
| Door depth 90 vs 135 degrees | Distinct context and selection |
| Native header over scanned drawing | Image extraction for relevant region |
| Cross-page row/legend/footnote | Witnessed joins or explicit unresolved evidence |
| Same PDF, different SKU/unverified field | No direct Claim Receipt |
| Admitted 598 and unresolved competing 600 | Relevant field quarantined |
| Unfinished required source set | No acceptance from first successful source |
| Repeat batch/retry | Prior history retained, no duplicate committed event |
| Crash at event/head boundaries | Old coherent head or once-only recovered new head |
| Concurrent writer and review fork | Stale CAS rejected; all-head resolution possible |
| Upstream parser/claim/relationship/rights revocation | Current dependencies invalidated; history replays |
| Old schema/range migration | No in-place edits; legacy oracle independently retained |
| Old receipt missing a field in its summary | Resolve actual case/source/index owners before declaring an evidence gap |
| Legacy manufacturer schemaVersion3 / acquisition receipt | Not already a V3 Claim Receipt; preserve kind, no cross-contract promotion |
| Old PASS plus missing configuration/anchor | No V3 receipt until the same new-acquisition checks pass |
| Own __proto__ key / sparse array | V3 retains the key / rejects the sparse input; historical bytes remain unchanged |
| Two legacy payloads share an old digest | Preserve both origins; no digest-only deduplication or approval |
| Repaired versus newly acquired equivalent evidence | Same validators and acceptance rules, not a migration bypass |
| Reissue commit interrupted / second batch | No partial committed head, no duplicate receipt or loss of earlier origins |
| Corrected new receipt / conflicting old assertion | Preserve the old conflict and require scoped adjudication, not silent overwrite |
| Changed requirement with old digest | Loader rejects before Fit display |
| Profile subset vs full snapshot | Different hash domains handled correctly |
| Changed input/delayed result | Old evaluation suppressed |
| Archived/reference target | Authorized historical lane only, no current donation |
| Missing external evidence store | Normal build passes; canary not run; prior result retained |
| New source bytes/tool revision | New object, dependent attestation revalidated |
| Shared implementation used as oracle | Classified as parity only, not independent comparison |
| Mixed-client and rollback | Compatible complete bundle or fail-closed Fit surface |

Implementer tests cover producer, consumer, replay and repeated operation as
applicable. Publication gates inspect actual bound final artifacts. An initial
ERR_MODULE_NOT_FOUND is not proof that the dangerous counterexample was tested;
red/green evidence must demonstrate the intended assertion after imports resolve.

## 18. Completion and escalation

Each gate records code commit, tests, artifact hashes, canary/review evidence,
unresolved dispositions and the main agent's decision. Programme completion
requires the intended release's authorization, compatibility and rollback gates.
Coverage and truth have separate denominators; zero false positives in tested
fixtures does not mean all catalogue models have complete evidence.
The user-requested legacy repair is not complete merely because every old object
has been inventoried or can replay under its old policy. It must have common-
standard V3 replacements, or explicit reviewed exclusion decisions for entries
that cannot support a valid assertion; outstanding gaps remain unfinished work.

Pause the dependent task for a first-principles decision when the evidence cannot
establish required meaning, product promises/rights/source scope need new
authority, or migration would damage user-owned state. Preserve candidates and
continue independent authorized work. Routine implementation choices and settled
constraints do not require repeated owner confirmation. Do not label structural
failures minor merely to continue.
