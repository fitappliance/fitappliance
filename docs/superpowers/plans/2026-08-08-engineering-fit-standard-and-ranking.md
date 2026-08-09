# Engineering Fit Standard and Ranking Implementation Plan

> **Execution rule:** Before each task, reread the invariants and that task's
> acceptance block. Use one bounded `gpt-5.6-sol` medium subagent for the
> approved implementation slice, run TDD, and review its diff in the primary
> conversation. Do not execute dependent tasks concurrently.

**Status:** Isolated shadow implementation complete; public cutover remains blocked
**Research basis:** [Appliance Fit Engineering Standard Research](../../architecture-v2/appliance-fit-engineering-standard-research.md)
**Goal:** Build a versioned, evidence-bound engineering Fit standard for
refrigerators, dishwashers, washing machines and dryers; validate it in an
isolated shadow programme; and prepare, but not authorize, a scoped public
migration.

**Architecture:** Preserve public V2 and the V3 evidence pilot. Introduce a
canonical V4 field/context map, immutable V4 receipts, a run manifest,
relation-specific engineering primitives, closed conditional policies,
Installation Knowledge V4, Site Profile V4, a shadow Fit evaluator and a
namespaced within-outcome rank vector. Real site evaluation stays ephemeral.
Shadow artifacts stay outside public/runtime writers until a separate cutover
decision.

**Tech stack:** Node.js ESM, `node:test`, immutable JSON artifacts, SHA-256
bindings, active-release loader, existing Architecture V2 evidence receipts and
isolated browser test harness.

---

## 1. Locked Invariants

1. Outcome truth is lexicographic. A score cannot override a hard failure,
   unknown input, evidence conflict or lower evidence band.
2. Exact-model Australian manufacturer evidence is the authority for model
   installation requirements. Registry/provider/retailer data remain
   candidates unless a field policy explicitly permits them.
3. Applicability is `required`, `conditional`, `not_applicable`, `prohibited` or
   `unknown`. Missing applicability never becomes zero or false.
4. Site observations, model requirements, normative rules, product identity,
   retail lifecycle, result freshness and publication eligibility are separate
   contracts.
5. Every accepted applicable hard field must be evaluated or explicitly
   `NOT_APPLICABLE`. Accepted-but-unevaluated blocks the run.
6. V2/V3 interfaces, receipts, build graph and runtime public files remain
   unchanged during V4 shadow development.
7. No generic brand/sibling/family/regional-suffix, tolerance, clearance, unit,
   route or non-applicability inference enters a receipt.
8. Conditional predicates are declarative, finite and allowlisted. No `eval`,
   dynamic function construction or arbitrary object paths.
9. Installation Fit and selected delivery feasibility are separate outcomes.
10. `VERIFIED_FIT` is scoped to supplied observations, exact evidence and the
    evaluated policy. It is not regulatory certification or a guarantee.
11. Real site profiles and results are ephemeral by default. Only synthetic or
    explicitly consented offline fixtures may be content-addressed.
12. `/Volumes/UGREEN-1TB` may hold immutable evidence/large research output;
    ordinary build, test and runtime cannot depend on it.
13. Generated artifacts are atomic and immutable. A run binds a frozen `asOf`;
    `generatedAt` is metadata and not semantic identity.
14. Old runs are retained. Resume validates every checkpoint; rollback restores
    a prior isolated pointer rather than deleting evidence.
15. Public migration, deployment, score copy and policy activation require a
    later explicit owner gate.

## 2. Current Contracts and Measured Risks

### Public compatibility boundary

- `src/domain/fit-decision.mjs` re-exports V2 from
  `src/shared/fit-engine.js`.
- `public/scripts/fit-engine.js` is the browser-vendored counterpart.
- `public/scripts/search-core.js` produces legacy `fitScore` and
  `fitScoreNumeric`.
- score/filter/card/compare consumers include
  `public/scripts/ui/range-filters.js`, `fit-score-ring.js`,
  `score-breakdown.js`, `compare-table.js`, `product-card.js` and
  `public/scripts/search-dom.js`.

These consumers do not share one safe score contract: a PDF can be treated as
verified, the ring does not suppress every ineligible outcome, and compare can
fall back to a generic `product.score`. V4 must use namespaced fields and audit
every consumer before public migration.

### Shadow evidence boundary

- `src/domain/installation-knowledge-v3.mjs` validates four-category,
  exact-model receipt-bound requirements.
- `src/domain/fit-v3.mjs` evaluates a subset of placement, operation, utility,
  delivery and professional checks.
- the V3 pilot is repository/publication isolated.
- `src/domain/installation-evidence-pipeline.mjs` rejects fields outside the V3
  registry; V4-only fields therefore need a new receipt contract.
- `data/architecture-v2/policies/product-data-field-rights-dictionary.json`
  already has partly overlapping field names that must be reconciled, not
  duplicated silently.

### Executable regression witnesses

Task 0 records these current defects without changing them:

1. accepted but unevaluated front clearance;
2. accepted but unevaluated ventilation open area/room volume;
3. accepted but unevaluated delivery weight;
4. missing required clearance hidden by `maximumKnown()`;
5. additive rear service space undercounted by `max()`;
6. negative/stale/arbitrary site-profile values accepted;
7. opaque normative rules and unsafe `powerConnection.required` semantics;
8. unselected delivery blocking cavity Fit;
9. V2 "advisory" failure producing `NO_FIT`;
10. legacy scores appearing comparable across outcome classes;
11. cross-category `formFactor: front_loader` in a current dishwasher record;
12. `washtower_combo` records with no dedicated combination policy.

## 3. Corrected Dependency Order

```text
baseline witnesses
  -> canonical field/context/receipt/run contracts
  -> relation and uncertainty algebra
  -> closed conditional/configuration rules
  -> knowledge and site schemas
  -> four category policies
  -> Fit V4 shadow evaluator
  -> fridge/dishwasher exact-evidence cohort
  -> washer/dryer exact-evidence cohort and scope decision
  -> isolated fresh/repeat/resume/conflict/publication audit
  -> namespaced rank calibration
  -> non-deployed UX harness
  -> owner-reviewed scoped cutover packet
```

Every task has local acceptance. A later audit is not required to declare an
earlier schema task complete; it independently validates the composed system.

---

## Task 0: Freeze Baseline and Regression Witnesses

**Create:**

- tests/architecture-v2/fit-v4-migration-risks.test.mjs
- scripts/architecture-v2/build-fit-v4-baseline.mjs

**Generated, never hand-edit:**

- `data/architecture-v2/reviews/automated/fit-v4-baseline.json`

**Inspect only:** V2/V3 engines, V3 schema, public score consumers, active
release and current V3 pilot artifacts.

**TDD steps:**

1. Create fixtures for the twelve measured risks.
2. Record current outcome/score, source hashes and risk class.
3. Build a deterministic baseline whose semantic hash excludes `generatedAt`.
4. Run twice and require equal semantic hash and byte-identical public files.

**Acceptance:** all twelve risks reproduce or the plan is corrected; V2/V3 and
public files are unchanged; baseline binds source/fixture hashes.

## Task 1: Define Canonical Field, Context, Receipt and Run Contracts

**Create:**

- `data/architecture-v2/policies/fit-v4-field-map.json`
- `src/domain/fit-v4-contract.mjs`
- `src/domain/installation-evidence-receipt-v4.mjs`
- `src/domain/fit-v4-run-manifest.mjs`
- tests/architecture-v2/fit-v4-contract.test.mjs
- tests/architecture-v2/installation-evidence-receipt-v4.test.mjs
- tests/architecture-v2/fit-v4-run-manifest.test.mjs

**Field/context contract:**

- canonical field ID, value type/unit, coordinate frame and permitted relations;
- source-authority/use boundary and rights-dictionary mapping;
- selector domains, configuration variables and allowed context paths;
- category/form-factor applicability and explicit unknown policy;
- mapping from a V3 field only when lossless; no field name alone proves
  equivalence.

**V4 receipt contract:**

- immutable exact model/identity binding;
- source bytes/content, fragment, locator and receipt hashes;
- original value/unit plus normalized value, relation and endpoint semantics;
- authority, jurisdiction, language, document revision, observed/retrieved time,
  parser/policy/field-map versions and rights actions;
- append-only merge, field-level conflict, supersession and withdrawal states;
- replay from immutable source/receipt bundle;
- V3 adapters retain original V3 receipt references; V4-only values require new
  receipts.

**Run manifest:**

- run ID is a semantic hash of active release ID/catalog/reference hashes,
  identity map, V4 receipt bundle, field map, schemas, policies, scenario set and
  frozen `asOf`;
- `generatedAt` is outside semantic identity;
- each checkpoint binds run ID, stage, inputs and output hash;
- one isolated writer per run, atomic temp-write/verify/rename;
- explicit manifest ID is required for resume; mismatched checkpoint fails;
- old runs remain immutable; an isolated active-shadow pointer uses
  compare-and-swap and is not a public release pointer.

**Use:** `loadActiveRetailRelease()` for validated lifecycle binding. Keep
document revision, retail freshness, site age and policy epoch separate.
Publication eligibility is derived outside knowledge/receipt objects.

**Tests first:** unknown field/path, lossy V3 mapping, cross-model receipt,
insufficient rights/authority, active conflict, superseded receipt, changed
active release, changed `asOf`, duplicate/concurrent writer, mismatched resume
and pointer rollback.

**Acceptance:** round-trip/replay is deterministic; V3 receipts are byte
identical; every V4 hard field is representable; no public writer/import exists.

## Task 2: Implement Relation and Uncertainty Algebra

**Create:**

- `src/domain/fit-relation-v4.mjs`
- tests/architecture-v2/fit-relation-v4.test.mjs

**Relations:** `MIN_REQUIRED`, `MAX_ALLOWED`, `WITHIN_RANGE`, `CONTAINS`,
`PROHIBITED_ZONE`, `NO_INTERSECTION` and only the minimal geometry primitives
needed by the four policies.

**Contract:**

- typed open/closed endpoints; equality follows the field relation;
- deterministic bound, coverage interval and estimate are distinct;
- repeated measurements combine only when they share a declared datum/geometry;
- scalar `MAX`/`SUM` requires coordinate-compatible composition proof;
- route/sweep/zone checks use coordinate geometry, not scalar substitution;
- result includes `PASS`/`FAIL`/`UNKNOWN`, limiting values, relation, margins or
  intersection witness and reason code;
- no implicit tolerance, risk probability, unit or default interval.

**Tests first:** inclusive/exclusive boundaries; minimum and maximum; bounded
range; prohibited-zone and no-intersection; deterministic vs coverage interval;
repeated limiting measurements; asymmetric bounds; invalid/inverted/non-finite
values; wrong unit/datum; invalid composition; exact repeatability.

**Acceptance:** every relation has independent pass/fail/overlap tests; invalid
numeric/geometry input cannot coerce to zero or a pass.

## Task 3: Implement Closed Conditional and Configuration Rules

**Create:**

- `src/domain/fit-rule-v4.mjs`
- tests/architecture-v2/fit-rule-v4.test.mjs

**Language:** allowlisted Task 1 context paths; operators `eq`, `neq`, `lt`,
`lte`, `gt`, `gte`, `in`, `all`, `any`, `not`; bounded depth/array size; scalar
enum/boolean/finite-number operands; no executable strings.

**Conditional group contract:**

- finite selector domain;
- complete mutually exclusive branches;
- no implicit default;
- overlap/gap audit and generated truth table;
- explicit quantifier: `FIXED_SELECTED`, `INSTALLER_SELECTABLE`,
  `UNKNOWN_FIXED`, or `PROHIBITED`;
- one consistent configuration assignment across linked fields.

`INSTALLER_SELECTABLE` may return a feasible required setting but cannot hide
the installation condition. `UNKNOWN_FIXED` passes only when every feasible
assignment passes, fails only when every assignment fails, otherwise unknown.

**Tests:** unknown selector, branch overlap/gap, inconsistent linked assignment,
prototype/unknown paths, excessive complexity, proud/flush, hinge, adjustable
height and exact stacked combination.

**Acceptance:** generated truth tables cover every selector value/unknown state;
branch traces are deterministic; no dynamic evaluation.

## Task 4: Create Installation Knowledge V4 and Site Profile V4

**Create:**

- `src/domain/installation-knowledge-v4.mjs`
- `src/domain/site-profile-v4.mjs`
- tests/architecture-v2/installation-knowledge-v4.test.mjs
- tests/architecture-v2/site-profile-v4.test.mjs

**Do not mutate:** V3 objects/receipts.

**Knowledge V4 contains:** coordinate/configuration identity; body/door/handle/
feet/trim/panel extents; adjustment domains; relation/composition references;
operation sweeps/removal zones; service exits/routes/connectors/occupancy;
environment/support/stability/anchoring/access; typed normative-rule references;
and receipt references. It does not store lifecycle or publication eligibility.

**Site V4 contains:** repeated measurements with datum, method, observation time
and deterministic bound/coverage/estimate type; walls/cabinet/skirting/floor;
level/square facts; selected/unknown configurations; obstacles/operation zones;
service endpoints/routes/holes/connectors/access; environment/support;
professional/jurisdiction confirmations; and optional selected delivery path.

**Privacy:** validators support ephemeral real-site input. Persisted test/run
artifacts accept only `synthetic` or separately approved `consented_offline`
profiles. Raw addresses and stable household identifiers are forbidden.

**Tests:** four categories; unknown/not-applicable/prohibited; stale/negative/
cross-model/conflict/authority failures; measurement datum mismatch; real-site
persistence rejection; V3 immutability.

**Acceptance:** schema tests pass and every persisted leaf is attributable to a
V4 receipt, policy rule or typed synthetic site observation.

## Task 4A: Correct Relation Semantics and Missing Site Endpoints

Task 5 may start only after a generated compatibility audit proves every field
value type has an executable relation and every evaluated policy endpoint has a
typed Site Profile representation. This execution-time gate was added after
the first Task 5 RED run exposed predecessor contract gaps.

**Correct:**

- categorical and boolean fields use explicit exact, required-true,
  prohibited-membership or set-containment relations rather than numeric or
  geometry operators;
- scalar product/installation requirements use minimum-required,
  maximum-allowed or range semantics according to operand direction;
- water and drain permitted routes are evidence-bound permitted zones that can
  contain a selected site route; no route schematic is treated as a tolerance
  corridor;
- door sweep and available operation-zone endpoints share polygon dimensionality
  and an installed-appliance coordinate frame;
- Site Profile adds typed dishwasher panel and dryer duct observations without
  reusing drainage subjects or inventing policy-owned values.

**Tests:** generated value-type/relation compatibility, categorical truth
tables, scalar operand direction, route-zone containment, door polygon
containment, new Site Profile subject/group contracts, predecessor replay and
public isolation.

**Acceptance:** no field keeps an operator that its normalized value type cannot
execute; no Task 5-required endpoint is fabricated or conflated; Task 0-4 and
adjacent V3/browser/publication regressions remain green.

## Task 4B: Close the Policy-to-Evaluator Executability Contract

Task 6 may not start until policy operands are executable against a typed Site
Profile. This gate was added after the restarted Task 5 produced internally
consistent coverage cases that still could not be evaluated safely.

**Correct:**

- selector/applicability paths are not treated as numeric, categorical or
  geometry operands;
- every available operand binds one exact Site Profile subject or one typed
  selected-configuration value, with value type, unit and axis compatibility;
- scalar magnitude projections across product/site frames are explicit and
  translation-safe; geometry never changes frame without an evidence-bound
  transform;
- direct checks do not use meaningless singleton `MAX`/`SUM` composition;
  physically additive or overlapping requirements declare an executable,
  acyclic composition, otherwise the field remains a typed blocking gap;
- conditional branches carry the correct configuration quantifier; an unknown
  selector cannot be counted as an ordinary fixed selection;
- range direction is executable (`WITHIN_RANGE` for a selected site value in a
  permitted product range); delivery path capacity/geometry is separate from
  the boolean that enables delivery evaluation.

**Tests:** policy-to-Site-subject compatibility for every evaluated field;
selector/operand separation; scalar projection and same-frame geometry gates;
composition dependency/cycle/orphan checks; adjusted-range direction; unknown
quantifier; delivery endpoint separation; representative false-accept cases
for width plus side clearances, rear occupancy and route/operation geometry.

**Acceptance:** a generated dry-run can construct both operands for every
evaluated relation or emits a typed blocking gap before evaluation; no
configuration label can be consumed as a measurement; no singleton arithmetic
composition remains; Task 0-4A and public/runtime isolation remain green.

## Task 5: Define Four Category Policy Packs

**Create:**

- `src/domain/fit-policies-v4/fridge.mjs`
- `src/domain/fit-policies-v4/dishwasher.mjs`
- `src/domain/fit-policies-v4/washing-machine.mjs`
- `src/domain/fit-policies-v4/dryer.mjs`
- `src/domain/fit-policies-v4/index.mjs`
- tests/architecture-v2/fit-policies-v4.test.mjs

Each versioned policy enumerates recognized form factors/configurations, hard
installation checks, professional confirmations, selected delivery checks and
advisories. It declares relation, endpoint, composition, selector domain,
configuration quantifier, required fields and coverage manifest. No numeric
default exists without permitted evidence or a usable normative rule.

**Coverage generation:** category x form factor x installation mode x selector
branch x relation. Generate truth-table cases rather than rely on five examples.
Include proud/flush refrigerator, integrated dishwasher panel/toe-kick, washer
drain route, dryer technology/duct/drain, exact stacking-kit and unknown mode.

**Identity quarantine:** cross-category form factors fail policy selection.
`washtower_combo` is excluded from washer/dryer policies until a dedicated
combination policy and exact evidence cohort exist.

**Acceptance:** each declared field has a local evaluated/advisory/excluded
disposition; all selector domains are exhaustive/disjoint; coverage manifest has
no orphan branch or relation.

## Task 6: Build Fit V4 Shadow Evaluator

**Create:**

- `src/domain/fit-v4-shadow.mjs`
- `src/domain/fit-v4-audit.mjs`
- tests/architecture-v2/fit-v4-shadow.test.mjs

**Output:** run/schema/policy/field-map versions; immutable product/receipt and
synthetic-site scenario hashes; separate `installationOutcome` and
`deliveryOutcome`; precedence reason; typed checks with relation, endpoints,
branch/config assignment, hard/advisory class, values/margins/intersections,
receipt references and reason codes; typed gaps/conflicts. Shadow result has no
publication-eligibility field and cannot be consumed by public code.

**Installation precedence:** hard fail -> `NO_FIT`; missing/overlapping placement
-> `INSUFFICIENT_DATA`; unresolved operation/service/environment/professional ->
`CONDITIONAL_FIT`; all hard pass with estimate/coverage-only input ->
`LIKELY_FIT_ESTIMATED`; all hard pass with permitted exact evidence and bounded
site input -> `VERIFIED_FIT`.

**Tests:** every precedence path, all relation types, branch quantifiers,
accepted-but-unevaluated detection, additive/geometry service zones, route
failure, delivery separation, normative confirmation and estimate handling.
V2/V3 fixtures remain unchanged.

**Acceptance:** zero false acceptance in golden/adversarial fixtures; every
applicable hard field produces a check; no public import/writer.

## Task 7: Convert the Locked Refrigerator/Dishwasher Cohort

**Create:**

- scripts/architecture-v2/build-fit-v4-shadow-cohort.mjs
- scripts/architecture-v2/audit-fit-v4-shadow-cohort.mjs
- tests/architecture-v2/fit-v4-shadow-cohort.test.mjs

Use the locked 50 refrigerator + 50 dishwasher pilot. Load lifecycle only via
`loadActiveRetailRelease()`. Losslessly map V3 receipt references; issue new V4
receipts for V4-only exact claims; otherwise record typed unknown. Use only fixed
synthetic site scenarios.

Run V2/V3/V4 and classify disagreement as intended correction, missing V4
evidence, policy defect, identity defect or regression. Bind the run manifest
and emit immutable isolated artifacts.

**Acceptance:** no public delta, no cross-model/rights-invalid receipt, no
unresolved false-accept disagreement, all unknown reasons typed, active-release
hashes recorded.

## Task 8: Add Washer/Dryer Exact-Evidence Cohort and Decide Scope

**Create:**

- scripts/architecture-v2/build-fit-v4-laundry-cohort.mjs
- tests/architecture-v2/fit-v4-laundry-cohort.test.mjs
- generated category/form-factor/branch coverage report

Freeze 50 washing machines and 50 dryers, stratified by current lifecycle,
brand, form factor, dryer technology, freestanding/under-bench/stacked mode and
conditional branch. Exact evidence acquisition follows the existing
PDF/MinerU/HTML receipt workflow; unavailable evidence remains unknown.

Quarantine misclassified dishwasher `front_loader` and report the identity
correction through the existing identity workflow. Exclude `washtower_combo`
from four-category claims unless a separately versioned combo policy is built.

**Scope decision:**

- a category/configuration enters calibration only when every supported policy
  branch has at least one receipt-bound exact-model case and adversarial case;
- uncovered combinations remain explicitly unsupported;
- if washer/dryer evidence is insufficient, first public candidate is scoped to
  refrigerator/dishwasher only. Unit fixtures never substitute for real evidence
  coverage.

**Acceptance:** immutable cohort/coverage report, no forced evidence promotion,
and an explicit supported/unsupported category-policy matrix.

## Task 9: Add Isolated Run, Replay, Conflict and Publication Audits

**Create:**

- scripts/architecture-v2/audit-fit-v4-shadow.mjs
- tests/architecture-v2/fit-v4-shadow-audit.test.mjs
- isolated V4 shadow pointer/manifest path in
  `src/domain/architecture-v2-paths.mjs` only if the path has no public consumer

**Do not modify:** `build-historical-evidence-system-contract.mjs`, global build
chain or public writers in the shadow phase.

**Audit:** every applicable hard field maps to a check; no public import/result;
all manifest hashes/versions match; active-release binding validates; source
revision/conflict/policy epoch/site age are separate; fresh and repeated runs
match semantically; resume rejects mismatched checkpoints; old run remains;
pointer rollback restores prior run.

**Failure injection:** interrupt before/after each temporary write, rename,
checkpoint and pointer compare-and-swap. Simulate concurrent writer, source
supersession, active-release change, receipt withdrawal and policy change.

**Acceptance:** all recovery paths converge or fail closed with inputs/hashes and
safe resume point; public/runtime files remain byte-identical.

## Task 10: Build Namespaced FitRank and Calibration

**Create:**

- `src/domain/fit-rank-v4.mjs`
- tests/architecture-v2/fit-rank-v4.test.mjs
- `tests/fixtures/architecture-v2/fit-v4-labelled-cases.json`
- scripts/architecture-v2/build-fit-v4-calibration-report.mjs
- generated `docs/architecture-v2/fit-v4-calibration-report.md`

**Rank contract:** input is a completed V4 result; output uses only
`fitV4Rank.*`; stable comparator is outcome, evidence band, dimensionless
critical reserve, operation reserve, inverse installation complexity. No legacy
`fitScore`, `fitScoreNumeric` or generic `score` fallback. `NO_FIT`,
`INSUFFICIENT_DATA` and public `CONDITIONAL_FIT` have no total.

Initial 40/25/20/15 weights are a shadow hypothesis. Reserve normalization and
applicable-field denominators come from versioned category policy. The vector
must work with total disabled.

**Frozen calibration protocol:** minimum 50 source-backed cases per eligible
category, with all supported policy branches and boundary/adversarial cases;
freeze labels and a stratified 30% holdout before tuning. The label builder does
not import the V4 evaluator/ranker. Report outcome-specific false acceptance and
false rejection; for within-band ordering report pairwise agreement and Kendall
rank correlation against the frozen preference protocol and a documented legacy
baseline. Never hide `NO_FIT` errors in aggregate accuracy.

**Consumer inventory:** enumerate and test every filter, sorter, card, compare,
generated-page and data writer that currently reads any score/verified marker.

**Acceptance:** zero known false acceptance; deterministic vector; no cross-band
comparison; total remains shadow-only unless holdout improves ordering without
claims ambiguity and owner approves weights/copy.

## Task 11: Prototype Measurement and Explanation UX Outside Deployment

**Create in a non-deployed test harness:**

- `tests/fixtures/fit-v4-ui/`
- tests/fit-v4-ui-harness.test.mjs
- a harness module under `tests/helpers/`, not `public/`

The harness collects repeated datum-specific measurements and bound type,
relevant configuration/service questions and optional delivery. It shows
installation outcome, separate delivery outcome, limiting/unresolved checks,
policy/evidence scope and measurement age before rank. It preserves replacement
mode as separate direct old/new dimensional matching.

Use synthetic profiles only. Verify keyboard/accessibility, desktop/mobile
layout, long labels, zero-result and no-score states. Do not edit deployed
`public/` scripts or add a feature flag in this task.

**Acceptance:** V4 UX can be evaluated in tests; repository isolation still
proves no public import or artifact change.

## Task 12: Prepare, But Do Not Execute, Scoped Public Cutover

**Create:**

- `docs/architecture-v2/fit-v4-cutover-runbook.md`;
- release-candidate manifest binding active release/catalog/reference, identity
  map, field/rights map, receipt bundles, schemas, policies, evaluation epoch,
  cohorts, calibration, consumer audit, browser QA and rollback hashes;
- byte-identical public baseline and pointer-based rollback proof.

Only now may a candidate branch adapt the smallest public runtime/UI surface.
Rerun full V4 isolation/baseline logic as a deliberate transition audit because
public source isolation will no longer be true. Audit every legacy score
consumer and prohibit generic fallbacks.

The decision packet states supported categories/configurations, V2/V3/V4
disagreements, evidence/unknown distributions, false acceptance/rejection,
rank decision/copy, privacy posture, route/sitemap/public-data delta,
desktop/mobile QA, deployment steps and rollback.

**Owner gate:** no adapter switch, public score, deployment or claim change
without explicit approval. If Task 8 lacks washer/dryer coverage, the candidate
cannot claim all-four-category V4 support.

---

## 4. Medium-Agent Execution Protocol

For each implementation task:

1. Primary conversation reads this plan, current task files and predecessor
   artifacts, then confirms predecessor acceptance.
2. Primary conversation gives one `gpt-5.6-sol` medium subagent only the bounded
   task, write scope, invariants, failing-test requirement and commands.
3. Medium agent writes a focused failing test, confirms expected failure,
   implements the smallest direct change and runs focused tests.
4. Primary conversation reviews behavior, security, privacy, data loss,
   publication leakage and unnecessary abstraction.
5. Primary conversation runs focused tests plus the relevant isolated audit and
   records hashes/checkpoint.
6. A passing unit test without pipeline/replay acceptance is not completion.

No implementer/reviewer/fixer loop is permitted. One independent final review is
used for a coherent implementation batch.

## 5. Typed Stop Conditions

Stop the current task and preserve a safe resume record when:

- source/field authority or rights boundary is unresolved;
- exact model identity is absent/conflicting;
- a hard field is accepted but unevaluated;
- V3 evidence is mutated or V4-only evidence lacks a V4 receipt;
- relation, endpoint, datum, composition or configuration quantifier is absent;
- conditional branches overlap or leave a selector value uncovered;
- fresh/repeat/resume semantic output differs;
- checkpoint/run/active-release hashes differ;
- a shadow artifact is reachable from a public writer;
- a false acceptance is found;
- real site data would be persisted without approved consent/retention rules;
- inaccessible/unlicensed standards text is required;
- score wording implies probability, guarantee or cross-class comparability;
- normal build would depend on external evidence storage.

## 6. Verification Matrix

| Layer | Minimum gate |
| --- | --- |
| Contract/relation/rule/schema | focused `node --test` file plus malformed/adversarial fixtures |
| Policy/evaluator | generated branch coverage plus all V4 golden/adversarial cases |
| Evidence cohort | exact receipt/identity/rights audit and active-release binding |
| Pipeline | fresh, repeat, every-boundary interruption/resume, conflict and pointer rollback |
| Rank | frozen holdout, outcome-specific error, ordering metric and all-consumer inventory |
| UX harness | unit DOM, keyboard/accessibility, desktop/mobile and privacy tests |
| Completion | `git diff --check`, focused tests, `npm run test:architecture-v2`, isolated audit; full build only when its publication inputs are intentionally available |

## 7. Ultra Audit Findings and Dispositions

The 2026-08-08 independent `gpt-5.6-sol` ultra review initially returned
`NOT READY`. The revised plan records every finding:

| Finding | Disposition |
| --- | --- |
| P0 relation algebra too narrow | Tasks 2-3 now define multiple relation types, endpoint semantics, bound quality, geometry and configuration quantifiers before policies |
| P0 V4 evidence not representable/replayable | Task 1 adds canonical field map, V4 receipt, merge/conflict/supersession/replay and lossless V3 references |
| P0 disabled public feature flag breaks isolation | Task 11 moved to a non-deployed test harness; public files are untouched until Task 12 owner gate |
| P1 run/resume/rollback inconsistent | Task 1 defines frozen `asOf`, semantic run ID, checkpoints, atomic writer/pointer and retained old runs; Task 9 injects boundary failures |
| P1 circular DAG | Contract precedes primitives/rules/schemas/policies/evaluator; every task now has local acceptance |
| P1 conditional branches incomplete | Task 3 requires finite domains, exhaustive/disjoint branches and generated truth tables |
| P1 lifecycle/freshness/publication collapsed | Tasks 1, 7 and 12 bind active release and keep document, retail, site, policy and publication states separate |
| P1 four-category evidence incomplete | Task 8 adds 50+50 laundry cohort, branch matrix and scoped-cutover fallback; malformed form factors and WashTower are quarantined/excluded |
| P1 delivery semantics contradictory | research and Tasks 4/6/11 return a separate selected-delivery outcome |
| P1 score consumers/calibration incomplete | Task 10 namespaces V4 rank, inventories all consumers, freezes labels/holdout and defines outcome/order metrics |
| P1 generic pages mislabeled exact | research sources are split into exact-model and discovery/advisory groups; Task 1 requires claim-to-model receipts |
| P2 global system-contract coupling too early | Task 9 stays isolated and explicitly forbids global build-graph integration before cutover |
| P2 site privacy absent | invariant 11, Tasks 4/6/11 and stop conditions make real site evaluation ephemeral by default |

The same ultra reviewer rechecked only these dispositions and marked all 13
`RESOLVED`, with a final verdict of `READY`. This is plan readiness only. It
does not authorize public migration, deployment or external mutation, and each
implementation task still requires its predecessor and owner gates.

## 8. Final Ultra Implementation Audit Remediation

The completed Task 12 implementation received one final independent ultra
audit. Its candidate remains `BLOCKED`; the audit found eleven defects that
must be repaired before any owner cutover decision. This section is the sole
remediation sequence and replaces point-by-point patching.

### Slice A: Establish the executable trust envelope

1. Bind the trusted knowledge-reference, rights, consent and receipt registries
   into the semantic run manifest. Export and reuse one manifest validator.
2. Make the shadow evaluator accept only a validated manifest-bound context:
   validated Installation Knowledge, validated persisted or ephemeral Site
   Profile, usable/replayed V4 receipts, exact identity and frozen `asOf`.
3. Make rank derivation and independent shadow audit replay that context and
   compare the complete immutable result. Result objects, caller-declared hard
   fields and self-authenticated hashes are never authority.

**Gate:** forged receipts/results/labels/consent registries fail closed; a real
validated context still evaluates deterministically.

### Slice B: Correct measurement and placement semantics

1. Preserve every repeated observation reference. For range checks, use the
   conservative observed interval so every reading must satisfy the permitted
   range; reject unsupported mixed or geometric repetitions.
2. Build placement requirements from receipt-bound appliance dimensions and
   required clearances, not measured gaps. Require explicit site observations
   sharing coordinate system, datum, axis and geometry identity; never invent
   spans or datums.
3. Cover every supported installation mode deliberately. Modes without a
   meaningful cavity-depth constraint remain explicit non-applicable branches,
   not accidental omissions.

**Gate:** the 590/605 versus 600-610 adversarial case fails, all evidence refs
are retained, and incoherent placement measurements cannot produce a pass.

### Slice C: Bind calibration and the complete deployment surface

1. Replace assertion-only calibration labels with a trusted frozen label
   registry containing immutable evidence hashes, reviewer identity,
   independence and review timestamp. Zero labels remains a valid blocked state.
2. Replace Git-index-dependent consumer discovery with a deterministic explicit
   source/deployment manifest and classify V4 constants separately from legacy
   score or verification consumers.
3. Bind every deployable surface used by Vercel (`vercel.json`, root HTML,
   `public/`, `pages/`, `api/` and deployed PDF evidence) and derive route,
   sitemap and public-data deltas from those bindings. Do not hard-code zero.

**Gate:** committing an unchanged worktree cannot alter the inventory or
candidate identity, and mutation of any deployed byte invalidates the candidate.

### Slice D: Harden isolation, recovery and UX state

1. Resolve real paths, reject symlink traversal into protected deployment
   roots, and add explicit ownership-, age- and dead-process-verified stale-lock
   recovery. Never silently remove a lock.
2. Invalidate the current Fit result whenever delivery input changes, matching
   every other Fit-affecting input.

**Gate:** symlink escape and live/foreign-lock tests fail closed; a stale owned
lock can be explicitly recovered; delivery changes expose no stale decision.

### Final acceptance

Run focused tests after each slice, then all Fit V4/UX tests and the complete
Architecture V2 suite. Regenerate the candidate and decision packet from the
new bindings. The candidate must remain `BLOCKED` while real receipt-bound
evaluations, calibration labels, real-browser QA, public adapter, rollback
snapshot and owner approval are absent. Recheck public bytes and active-release
pointer bytes. No production mutation, deployment, commit or push is authorized.

### Remediation completion evidence

All eleven final ultra findings are closed in the isolated implementation:

- evaluator, rank and audit independently replay the manifest-bound receipt,
  rights, identity, policy, reference, site and consent evidence envelope;
- repeated measurements use conservative interval semantics and placement uses
  evidence-bound appliance extents plus coherent real site observations;
- calibration labels require a frozen evidence/reviewer registry, legacy
  consumer discovery uses explicit roots, and the complete Vercel deployment
  surface is hash-bound with derived route, sitemap and public-data deltas;
- isolated paths reject symbolic-link traversal, stale locks require exact
  ownership/age/dead-process proof, and delivery edits invalidate stale UX
  results.

Final verification on 2026-08-08:

- Fit V4 and UX: **210/210 passed**;
- complete Architecture V2: **1,596/1,596 passed**;
- lint, syntax, independent candidate replay and deterministic repeated
  materialization: passed;
- candidate: `BLOCKED`, 11 typed blockers, 0 source-backed labels, 0/4 eligible
  categories and no numeric total;
- public tree SHA-256:
  `b9ee61351177e40f5a10a3e89647646d9b3a1e69587b57f1547500f3466732cf`;
- complete deployment surface SHA-256:
  `3a978d666e292c4cc14e59a54e0e23e37d91ab7800d4172cef06a2df3d08f60e`.

No public adapter, publication writer, production deployment, commit or push
was performed.
