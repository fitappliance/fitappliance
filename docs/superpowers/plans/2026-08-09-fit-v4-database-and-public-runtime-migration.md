# Fit V4 Database Readiness and Public Runtime Migration Plan

> **Execution rule:** Before every implementation slice, read this document,
> verify its predecessor gate, and run the stated RED test first. The primary
> conversation owns architecture and integration. One bounded
> `gpt-5.6-sol` subagent at reasoning effort `medium` implements an approved
> slice. One independent `gpt-5.6-sol` subagent at reasoning effort `max`
> audits each substantial plan revision. Do not use `ultra` for this workflow.

**Status:** IN PROGRESS; WP0A, WP0B-A, B0, WP1, WP2 and WP3 are complete; B1 worker-exclusion slice is authorized after max-audit corrections, while production rights remain blocked
**Date:** 2026-08-09
**Supersedes:** The public-migration ordering in Task 12 and the later cutover
remediation sections of
[2026-08-08-engineering-fit-standard-and-ranking.md](2026-08-08-engineering-fit-standard-and-ranking.md).
The engineering research, V4 evidence contracts, shadow evaluator, and passing
tests from that programme remain inputs; this plan does not claim they are
publicly deployed.

### Implementation checkpoint - 2026-08-09

- WP0A completed by one bounded `gpt-5.6-sol` medium implementation agent
  after an observed failing test (`2` passed, `1` failed).
- The corrected baseline now binds the active release, catalog/reference
  populations, current readiness and form-factor coverage, rights coverage,
  blocked cutover candidate, deployment surface, and two preserved legacy
  characterization witnesses.
- Baseline semantic SHA-256:
  `cb84cbe741d0471de28067b883dcb075a713c2540ab797c91b79aefdeff1511e`.
- Deployment-surface tree SHA-256:
  `3a978d666e292c4cc14e59a54e0e23e37d91ab7800d4172cef06a2df3d08f60e`.
- Verification: `45/45` focused V4 tests and `1597/1597` Architecture V2
  tests pass; syntax checks and `git diff --check` pass.
- No public bytes, active release pointer, deployment, or public Fit behavior
  changed. WP0B is the only authorized next implementation slice.

### WP0B-A implementation checkpoint - 2026-08-09

- The first design received an independent `gpt-5.6-sol` max verdict of
  `DRAFT`. After separating source recovery from deployment containment, the
  focused closure review found no unresolved P0 or P1 issue and authorized
  WP0B-A only.
- One bounded `gpt-5.6-sol` medium implementation agent followed TDD: the
  initial test failed because the new recovery module did not exist, then the
  completed focused suite passed `6/6`.
- The generated recovery anchor binds production deployment
  `dpl_BY3B3AatSC56LXVeMKnX2cr5F22M`, source commit
  `35a4ea0a180f0f9f2d4c35b281cf618d8c93023a`, source tree
  `901ca311f85a00600457185bb51d121b6b4398f3`, the active retail release and
  selected live byte fingerprints. Anchor file SHA-256:
  `14b99727e5efe61b931ea13281b0b3af2c76284b23db3d3ed417f3a2794a2e3e`.
- Offline reconstruction restored and verified all `7,941` tracked blobs
  (`383,780,028` bytes) from local Git objects. It passed with an explicitly
  unusable `HOME` and a forbidden `FITAPPLIANCE_STORAGE_ROOT`, while source
  guards reject network-client imports and external-storage coupling.
- Primary review corrected the path probe so only `ENOENT` means absent;
  permission and other filesystem failures now stop recovery instead of being
  swallowed.
- Verification: `6/6` focused recovery tests and `1603/1603` Architecture V2
  tests pass; all three new modules pass `node --check`, and
  `git diff --check` passes.
- No deployment, public byte, service worker, route, package, active-release
  pointer, commit or push occurred. The observed broad static output remains a
  production P0: internal repository Markdown, context and Architecture V2
  control data are currently HTTP-accessible.
- This checkpoint proves a source-level recovery anchor only. It does not prove
  exact remote output recovery, dependency-offline rebuild, client-cache
  recovery or whole-site rollback. WP0B-B remains blocking for WP4A and public
  release work. WP1 is independently authorized by the completed WP0A gate and
  must not consume or relabel WP0B artifacts.

### WP0B-B max-review checkpoint - 2026-08-09

- The independent `gpt-5.6-sol` max review first rejected the expanded plan
  because it did not close the predecessor race, private/static source scope,
  final output identity, service-worker generation handshake, legacy RED
  witnesses, staging semantics, toolchain/environment closure, or redirect
  terminal-resolution contract.
- The revised plan separated B3 into a containment baseline (`B3A`) and a
  mandatory post-WP8 final rematerialization (`B3B`), made B3B the only output
  eligible for preview or activation, and blocked activation unless an
  authoritative complete remote deployment receipt binds every final output
  manifest entry. URL sampling is explicitly insufficient.
- The focused closure review reported no unresolved P0/P1 findings and returned
  `READY`. The next bounded medium-agent TDD slice is B0/B1; B2 and B3A remain
  separate successor slices and no production deployment is authorized.

### WP0B-B0/B1 implementation checkpoint - 2026-08-09

- One bounded `gpt-5.6-sol` medium agent observed the initial focused RED state
  (`11/11` failed because the deployment module did not exist), then implemented
  the closed environment/toolchain contract, exact-manifest materializer,
  private staging/output manifest, bounded route terminal resolver and
  `dist/` Vercel containment.
- Primary integration review added RED witnesses and corrected three defects:
  `public/scripts/**` had been accidentally forbidden; Vercel runtime selection
  had incorrectly used a patch pin instead of supported major `22.x` while the
  local build remains exactly `22.23.1`; and a pre-existing private output
  manifest could be overwritten. The corrected focused suite passes `14/14`;
  the affected deployment, route and security suite passes `34/34`; syntax and
  `git diff --check` pass.
- The deployment command is intentionally blocked before output with
  `SOURCE_MANIFEST_BLOCKED` / `PUBLIC_RIGHTS_REVIEW_REQUIRED`. Existing
  directory placement, Git tracking and current public deployment are not
  treated as publication authority for the 3,281 eligible files. No `dist/` or
  private output was left behind.
- Local Vercel CLI `50.5.0` is pinned and available. Complete offline dependency
  bytes remain explicitly unretained as
  `OFFLINE_DEPENDENCY_BYTES_NOT_RETAINED`; this is not relabelled as an offline
  build proof.
- B0 is implemented. B1's safety machinery is implemented but its real-source
  gate remains blocked pending an exact file-level rights review. Therefore B2
  and B3A do not start. The independent WP1 private-data lane remains authorized
  by WP0A and is the next medium-agent slice.

### WP0B-B1 rights-closure max-review checkpoint - 2026-08-10

- A complete rights-closure slice was added after inventorying `3,281` eligible
  static files and separating first-party, generated, open-source, government,
  verification-token and affiliate-feed dependencies.
- The first independent `gpt-5.6-sol` max review returned `DRAFT`. It found that
  the existing schema-1 materializer could accept arbitrary free-text
  `ALLOWED` rows, static-rights state did not invalidate downstream candidates,
  decision clocks and withdrawals were not activation/rollback gates, and
  generated outputs did not inherit all transitive source dependencies.
- The revision introduces strict schema-2 action-scoped decisions authenticated
  by production issuers, an evidence-free inventory, exact generated provenance,
  detached private-evidence verification, structured attribution fulfillment,
  frozen and fresh clock checks, canonical hashing, a separate
  `staticPublicationAuthorizationId`, and downstream
  B3/WP4A/WP4B/B4/B5/WP9 bindings.
- Review generation and gate success are now distinct: a complete blocked
  review may be produced successfully, while `verify:b1-rights-gate` must remain
  nonzero with a zero-row manifest until every exact dependency is authorized.
- The same max reviewer performed one focused closure review and again returned
  `DRAFT`, narrowed to three findings: the production authority set lacked an
  independent trust root, the B0 successor was scheduled before its bound code
  existed, and the final semantic inventory still pointed at B3A rather than a
  post-WP8 B3B successor.
- The primary correction leaves the production authority set empty until an
  out-of-repository owner trust root authorizes its exact hash, moves B0
  successor generation after final executable hashes, and splits WP4 into a
  B3A containment baseline plus a mandatory post-WP8/final-B1/B3B WP4B receipt.
  B4 and WP9 must consume WP4B. This exhausts the planned two review rounds;
  primary integration review now owns closure and will not start an agent
  review loop.
- One bounded medium-agent foundation implementation is authorized only after
  local plan consistency checks. It must leave production authorities empty,
  the source manifest zero-row blocked and the B1 gate nonzero. B2, B3A, WP4A,
  preview and release remain closed until separately authorized decisions pass.

## 1. Objective and Completion Boundary

Improve Fit coverage across the database without converting weak dimensions
into installation truth, then expose Fit V4 on the website through one
rights-safe, browser-compatible, reversible release path.

This programme is complete only when:

1. every catalog and historical-reference record has a versioned role and
   evidence-readiness classification;
2. current-retail products are partitioned into supported, unsupported,
   evidence-incomplete, conflict, or executable states without legacy fallback;
3. every persisted synthetic V4 result is bound to one immutable
   product-knowledge release, one policy epoch, one scenario-set manifest, and
   one scenario member; live browser results use a separate ephemeral binding;
4. FitRank compares products only inside the same outcome, evidence, policy,
   configuration, category, and site-scenario class;
5. the browser evaluates real household measurements locally from a
   rights-safe compiled knowledge release and matches the trusted Node oracle;
6. all deployable Fit producers and consumers are represented by a semantic
   deployment manifest and runtime behavior tests;
7. calibration, browser QA, detached owner authorization, atomic release, and
   full rollback gates pass; and
8. public activation remains a separate owner decision. This plan does not
   authorize deployment.

## 2. Verified Baseline

Baseline release: `retail_lifecycle_release_6c42c754aeb1ff49097b32b4`.

| Universe or surface | Current measured state |
| --- | ---: |
| Catalog products | 3,513 |
| `CURRENT_OUTPUT` products | 349 |
| `HISTORICAL_INPUT_ONLY` catalog products | 3,087 |
| `MARKET_REFERENCE_ONLY` catalog products | 77 |
| Separate historical-reference records | 8,087 |
| Current products with `geometry_v2` | 103 |
| Current products with `geometry_v2.formFactor` | 100 |
| Current products without a form factor | 249 |
| V4 field mappings requiring `public_display` rights | 0 of 85 |
| Public V4 adapters | 0 |
| Publicly eligible V4 categories | 0 of 4 |
| Source-backed calibration labels | 0 |

Current website behavior still reads legacy `fitScore`,
`fitScoreNumeric`, PDF-presence flags, and generic fallbacks. The current V4
engine imports Node built-ins and is an audit oracle, not a browser runtime.
The historical replacement flow is a separate product mode and may use scalar
W/H/D only after its confirmation policy; it must never call `FitDecision`.

## 3. Locked Product and Safety Decisions

1. **Two user modes remain separate.** Cavity mode evaluates installation Fit.
   Old-appliance mode ranks current products by confirmed outside-dimension
   difference. Replacement similarity is not installation Fit.
2. **Lifecycle is not evidence.** Current, archived, discontinued, or market
   reference status never proves a dimension or installation requirement.
3. **Dimensions are field-scoped.** W/H/D may support closed-envelope checks
   only when all three axes share exact identity, units, datum, source rights,
   and receipt binding. They do not prove clearances, operation, utilities,
   ventilation, delivery, or service space.
4. **Unknown stays unknown, but evaluation state and uncertain outcomes remain
   distinct.** Unsupported policy, missing identity/form factor, or an invalid
   configuration blocks evaluation and has no Fit outcome. Once a product and
   scenario are eligible, missing/conflicting placement evidence produces
   `INSUFFICIENT_DATA`; unresolved operation, service, utility, or professional
   requirements produce `CONDITIONAL_FIT` under the canonical precedence table.
5. **Outcome precedes rank.** Hard failure and unknown status cannot be repaired
   by a score. Numeric or vector ranking is allowed only within one comparable
   outcome and evidence class.
6. **No mixed engine collection.** One search, filter, sort, comparison table,
   restored URL, or generated route cannot contain both legacy Fit and V4 Fit.
   A non-ready product receives an explicit unranked V4 readiness state.
7. **Real site data stays local.** The preferred runtime is an offline compiler
   plus a pure browser evaluator. No real household measurement is persisted,
   transmitted, logged, or content-addressed.
8. **Evidence bytes stay private when rights require it.** The browser receives
   normalized allowed facts, source labels safe for display, and hashes needed
   for attestation; it does not receive private source bytes or internal notes.
9. **One immutable release is the rollback unit.** HTML, JavaScript, CSS, public
   data, generated routes, sitemap, service worker, cache version, activation
   configuration, and knowledge release move and roll back together.
10. **Simple code is a gate.** Prefer explicit manifests, pure functions, and
    append-only immutable artifacts. Add no framework, generic state machine,
    database, or server API unless a listed acceptance case requires it.
11. **Public display is a separate right.** Internal processing, caching, audit
    retention, and document linking do not imply permission to display a field.
    Each public field needs a bound disposition for display, attribution,
    conditions, validity period, and withdrawal.

## 4. State Model

The implementation must not overload a single `verified`, `fit`, or lifecycle
field. It uses these independent states:

### 4.1 Product universes

- **RetailCatalogEntry:** one product in an immutable retail release. It owns
  `canonicalProductId`, lifecycle visibility, retail observations, and public
  listing eligibility.
- **HistoricalReferenceEntry:** one searchable old-model reference. It owns
  reference identity, dimension evidence action, and zero or more explicit
  overlap mappings to catalog products.
- **CatalogReferenceMapping:** `EXACT_SAME_MODEL`, `SIBLING_ONLY`,
  `REGIONAL_VARIANT`, `CONFLICT`, or `NO_MAPPING`. Only exact mappings may reuse
  field evidence, and only when the receipt's model scope permits it.

### 4.2 Readiness and execution

- **ProductEvidenceReadiness:** per-field accepted, unknown, conflict, stale,
  rights-blocked, or unsupported state.
- **PolicyApplicability:** `SUPPORTED`, `POLICY_UNSUPPORTED`,
  `FORM_FACTOR_REQUIRED`, `CONFIGURATION_REQUIRED`, or `CATEGORY_UNSUPPORTED`.
- **ScenarioEligibility:** whether the supplied observations satisfy the
  selected policy's required site fields.
- **EvaluationStatus:** `NOT_RUN`, `BLOCKED`, `COMPLETED`, or `INVALIDATED`.
- **FitOutcome:** emitted only for a completed eligible evaluation.
- **PublicationEligibility:** a release-level decision, never inferred from a
  product outcome.
- **PublicationRightsDisposition:** per field/source, `ALLOWED`, `DENIED`,
  `EXPIRED`, `WITHDRAWN`, `ATTRIBUTION_UNMET`, or `UNKNOWN`, with authorization
  bytes/hash, validity interval, attribution requirements, and withdrawal link.

The required transition table is:

| Condition | Evaluation status | Fit outcome |
| --- | --- | --- |
| unsupported category/policy or missing form factor | `BLOCKED` | none |
| invalid identity/configuration or untrusted knowledge | `BLOCKED` | none |
| eligible evaluation with hard failure | `COMPLETED` | `NO_FIT` |
| eligible evaluation with missing/conflicting placement input | `COMPLETED` | `INSUFFICIENT_DATA` |
| placement passes with unresolved non-placement hard requirement | `COMPLETED` | `CONDITIONAL_FIT` |
| all hard checks pass with explicit estimate | `COMPLETED` | `LIKELY_FIT_ESTIMATED` |
| all applicable hard checks are exact and pass | `COMPLETED` | `VERIFIED_FIT` |

### 4.3 Authoritative dependency graph and append-only readiness epochs

There is one dependency direction; no descendant may restate an unbound copy
of an ancestor:

```text
evidence + rights + lifecycle + identity inputs
  -> readiness epoch
  -> rights-safe knowledge release

readiness epoch + policy/schema + scenario context
  -> run manifest

run manifest + knowledge release
  -> result
  -> rank
```

Every descendant stores the semantic ID of each direct predecessor. Changing
or withdrawing any predecessor requires a successor and invalidates unchanged
descendants; accepted historical objects are never mutated.

Each readiness epoch binds:

- active catalog and historical-reference hashes;
- catalog/reference overlap-map hash;
- identity, receipt, rights, field-map, schema, policy, and source-registry
  hashes;
- frozen `asOf` and evidence clock bindings;
- policy-applicability matrix hash;
- publication-rights disposition registry hash;
- predecessor epoch and supersession/withdrawal records; and
- semantic output hash.

Epochs are append-only. Fresh run, exact repeat, crash/resume, concurrent
writer, supersession, withdrawal, lifecycle change, schema change, missing
optional external storage, and rollback are required tests. Real site profiles
never enter a readiness epoch.

## 5. Scenario and Rank Contracts

### 5.1 Scenario-set binding

A scenario-set manifest is synthetic-only. It contains a non-empty sorted list
of complete synthetic scenario members plus schema, category/configuration
scope, and frozen metadata. Its hash is distinct from every member hash. One
builder creates the complete manifest; one selector accepts that manifest and a
member ID and derives the member profile and all bindings. Evaluation callers
cannot supply a second raw profile or separate binding object. Each persisted
synthetic evaluation input and result binds both:

- `scenarioSetSha256`; and
- `siteScenarioSha256`, which must be a member of that set.

Added, removed, reordered, or substituted members create a different set and
invalidate any run pinned to the predecessor set ID and full SHA-256. A complete
rehashed successor may be structurally valid but is never accepted as the
original authority. A live browser evaluation instead uses
`scenarioBindingKind: LIVE_EPHEMERAL` and only the original opaque object
identity shared by products in that in-memory comparison. It has no string
session ID, persisted set/member hash or stable comparison token, and its result
cannot be serialized, cached, restored, logged, or sent. Current URL and
saved-search dimension persistence must be removed for live measurements unless
a later consent/retention contract is explicitly approved.

### 5.2 Comparability key

FitRank exposes an immutable comparability key containing:

- active catalog release, readiness epoch, and public knowledge release IDs;
- engine artifact, engine schema, and rank schema/policy versions;
- category;
- category policy hash and policy epoch;
- form factor and resolved-configuration digest;
- synthetic scenario-set/member hashes or the same in-memory capability object;
- installation outcome; and
- evidence class.

`compareFitV4Ranks()` may order only when both keys are identical. Otherwise it
returns or throws a typed `NOT_COMPARABLE` result. `NO_FIT`,
`INSUFFICIENT_DATA`, policy-unsupported, and readiness-only rows have no numeric
rank components. Public Fit ordering remains disabled until calibration passes.

## 6. Runtime and Release Architecture

```text
private/official evidence + receipts + rights
        |
        v
trusted Node evidence compiler
        |
        +--> immutable readiness epoch (no site data)
        |
        +--> rights-safe Installation Knowledge Release
                         |
                         v
              pure browser Fit evaluator
              + local ephemeral Site Profile
                         |
                         v
              Fit outcome / readiness / explanation
```

The trusted Node evaluator remains the oracle. The browser evaluator must be a
pure ESM module with no `node:*` imports. Shared relation and policy logic may
be factored into pure modules only when parity tests require it. The compiler
must omit original private source bytes, disallowed quotations, internal paths,
real site profiles, and non-public contact data. It also rejects every public
field whose bound publication-rights disposition is absent, denied, expired,
withdrawn, or missing required attribution.

The release manifest binds every deployed byte and generated route. The service
worker cache namespace is derived from the same release ID. Assets are
content-addressed. A worker verifies the complete manifest before activation,
then performs a page/worker release handshake; it does not delete the predecessor
generation until the successor is healthy and the rollback retention gate has
closed. A client may use only assets and data carrying one release ID;
mixed-generation cache reads fail closed and prompt a controlled refresh.

## 7. Dependency DAG

```text
WP0A baseline witnesses + contract map
  -> WP1 universe separation + overlap mapping
  -> WP2 authoritative readiness graph + policy/rights applicability
  -> WP3 synthetic/live scenario binding

WP0B-A source recovery anchor
  -> WP0B-B0 pinned deployment toolchain and environment contract
  -> WP0B-B1 reviewed static-output allowlist
  -> WP0B-B2 B2_GENERATION_READY worker receipt
  -> WP0B-B3A deterministic containment baseline

WP3 + WP0B-B1 + WP0B-B3A
  -> WP4A semantic deployment/consumer containment inventory
  -> WP5 current-catalog evidence/readiness expansion and final epoch
  -> WP6 rights-safe knowledge compiler + browser evaluator parity
  -> WP7A rank schema-v2 generation-bound comparability
  -> WP7B independent calibration and public-ordering gate
  -> WP8 disabled complete source integration + B2 handshake
  -> final WP0B-B1 authorization successor
  -> WP0B-B3B final deterministic output
  -> WP4B final semantic inventory + zero-legacy receipt
  -> WP0B-B4 immutable preview QA
  -> WP9/B5 detached owner activation gate

WP0B-B1 technical closure -> WP0B-B2 fixture-only release-handshake contract
WP0B-B1 authorization -> WP0B-B2 B2_GENERATION_READY -> WP0B-B3A
WP7B + WP0B-B2 contract + WP0B-B3A
  -> WP8 full-surface migration + WP0B-B2 integration
  -> WP0B-B3B mandatory final rematerialization and complete output identity
  -> WP0B-B4 exact-prebuilt preview/browser/accessibility QA
  -> WP9 atomic candidate + WP0B-B5 fresh predecessor/authorization gate
```

The private WP1-WP3 data lane does not depend on an unprovable claim that the
current remote deployment bytes are archived. Deployment containment joins the
data lane before WP4A, and complete cache/preview proof joins before WP9. Rank
schema v2 cannot begin until WP2, WP3, WP5, and WP6 provide every generation
binding required by its final comparability key.

## 8. Work Packages

### WP0A - Freeze corrected baseline witnesses

**Deliverables**

- extend the existing generated baseline to bind the active release, 3,513
  catalog rows, 8,087
  reference rows, 349 current rows, readiness counts, category/form-factor
  coverage, current V4 candidate, rights coverage, and complete deployment hash;
- an audit-disposition matrix mapping every max finding to a work package; and
- regression witnesses for cross-outcome ranking, scenario-set/member
  confusion, unsupported WashTower, missing form factor, hidden root-HTML
  consumer, and mixed service-worker generations.

**Gate:** repeated baseline generation is semantically identical; it changes no
public bytes; each witness records the intended current defect without changing
behavior. The rank-v1 cross-outcome and same-result/different-site observations
are frozen before schema-v2 work.

### WP0B - Establish source recovery and deployment containment

Bind the observed production source and active catalog/reference release without
claiming unavailable remote bytes, then establish a contained and reproducible
successor deployment path. External evidence storage and acquisition network
access cannot be normal deployment dependencies.

WP0B-A proves source-level recovery and records the remote-byte gaps. WP0B-B0
and B1 establish the reviewed source boundary; B2 generates the worker from
that boundary; B3 establishes deterministic containment over their complete
composition before WP4A. B2's page/worker handshake integrates with the
complete public surface only in WP8; B4 proves that exact prebuilt surface in
preview; B5 performs the fresh predecessor and authorization gate inside WP9.
No unavailable remote file tree is relabelled as a restorable predecessor
snapshot.

#### WP0B max-audit correction

The first WP0B candidate is rejected. It captured a clean feature-branch tree,
not the production deployment, omitted deployable build output, overclaimed
service-worker recovery, lacked atomic and bounded extraction, and let its own
builder define the expected answer. The independent max verdict was `DRAFT`.

Live read-only verification established the actual production baseline:

- Vercel deployment: `dpl_BY3B3AatSC56LXVeMKnX2cr5F22M`;
- production source commit:
  `35a4ea0a180f0f9f2d4c35b281cf618d8c93023a` on `main`;
- source tree: `901ca311f85a00600457185bb51d121b6b4398f3`;
- target/status: `production` / `READY`;
- production aliases include `www.fitappliance.com.au` and
  `fitappliance.com.au`;
- Vercel created the deployment on 2026-07-29 and reports Node `24.x` plus
  three Sydney Node functions;
- the Vercel deployment-file API returns `404 File tree not found`, so exact
  remote deployment bytes cannot be claimed from that endpoint; and
- an isolated `vercel build --prod` at the exact source commit succeeds, but
  produces about 381 MB and 7,953 files because output directory `.` copies
  broad repository content. Live HTTP probes confirm that repository Markdown,
  `.openclaw_context`, product-core documentation, and the active-release JSON
  are unintentionally public. This is a deployment-boundary P0.

WP0B is therefore split into two non-overclaiming slices.

#### WP0B-A - Production recovery anchor

WP0B-A records a point-in-time recovery anchor. It does not claim that the
production deployment is permanently retained or independently deployable
offline.

**Deliverables**

- a strict schema and validator for one sanitized production anchor;
- a committed anchor binding Vercel project/team/deployment IDs, target,
  ready-state, aliases, creation time, Git source commit/tree, Node version,
  normalized build and complete Vercel route/header configuration, lambda
  path/runtime/region/size/digest metadata, active retail release identity,
  service-worker cache version, and selected live public-byte fingerprints;
- explicit capabilities and gaps:
  `REMOTE_PROMOTION_CANDIDATE_POINT_IN_TIME`,
  `OFFLINE_GIT_SOURCE_RECONSTRUCTION`,
  `REMOTE_FILE_TREE_UNAVAILABLE`,
  `EXACT_REMOTE_OUTPUT_BYTES_NOT_CAPTURED`,
  `OFFLINE_DEPENDENCY_INSTALL_NOT_PROVEN`,
  `CLIENT_CACHE_STATE_NOT_CAPTURED`, and
  `OVERBROAD_STATIC_OUTPUT_CONFIRMED`;
- a pure offline source-reconstruction verifier that checks the production
  commit/tree and reconstructs the full tracked tree into an empty temporary
  directory through local Git objects only; and
- a read-only source replay that validates the active retail release from the
  reconstructed production tree without invoking publication/audit writers.

The semantic anchor identity uses canonical JSON and excludes only its own
`semanticSha256` field. Capture time and observed remote state remain part of
the point-in-time identity. Tests must use hand-authored legal and adversarial
fixtures before the production anchor is generated.

**WP0B-A TDD order**

1. RED: pure validator rejects a missing document, unknown fields, unsafe
   aliases/URLs, invalid IDs/hashes/timestamps, secret-shaped fields, incomplete
   Vercel route/header semantics, duplicate function paths, and contradictory
   capability claims.
2. GREEN: implement only schema normalization, canonical identity, and the
   hand-authored fixture tests.
3. RED: offline source reconstruction rejects a missing commit/tree, non-empty
   destination, tree mismatch, links/special entries, path normalization or
   case-fold collisions, and any network/external-storage call.
4. GREEN: stream `git archive` into a private `0700` staging directory, enforce
   file-count, total-size, single-file-size and path-length limits, verify the
   complete tree, then atomically rename staging to the requested absent target.
   On failure, remove staging only.
5. Build the committed production anchor from the separately captured sanitized
   Vercel response and selected live fingerprints. Production fixture values
   are never derived from the validator under test.
6. Reconstruct the real production source offline, validate the restored active
   release, compare the tree before/after read-only replay, and prove no fetch,
   DNS, socket, HOME fallback or `/Volumes/UGREEN-1TB` access occurred.

**WP0B-A gate**

- production source commit is an ancestor of the active branch and is present
  in local Git object storage;
- source reconstruction is byte- and mode-identical for the full Git tree;
- the anchor remains explicitly `BASELINE_RECOVERY_ANCHOR_ONLY` with every gap
  above preserved;
- focused adversarial tests, full Architecture V2 regression, syntax checks and
  `git diff --check` pass; and
- no public, Vercel, service-worker, package, active-release pointer, route or
  deployment mutation occurs.

#### WP0B-B - Deployment containment and rollback protocol

WP0B-B establishes a contained, reproducible successor-deployment protocol
without pretending WP0B-A captured unavailable remote bytes. The private WP1
data lane may proceed after WP0A; WP0B-B joins it before WP4A and becomes a hard
gate for WP8-WP9. Its slices are ordered so static containment, cache behavior
and release evidence cannot define or verify themselves.

**Locked boundaries**

- The dedicated static output is repository-root `dist/`; `vercel.json` names
  it explicitly. The normal source tree is never an output-directory fallback.
- Static source inputs come from a separately generated and reviewed manifest
  containing every exact path, mode, size, SHA-256 and public-rights
  disposition. The initial eligible families are root `index.html`, the two
  exact Google verification HTML files, reviewed files under `public/**`, and
  reviewed files under `pages/**`, except the exact tracked legacy witness
  `public/service-worker.js`. That file is never copied as a B1 source; B2
  generates the deployable worker from reviewed inputs into private staging.
  A directory name is never authority.
  Untracked, newly generated, changed or undeclared entries fail until the
  manifest is regenerated and reviewed.
- `data/pdf-evidence/**`, `/pdf-evidence/*` and all raw/manual/review evidence
  paths are removed from the deployable surface. Root dotfiles, package files,
  source, scripts, tests, reports, docs, private context and
  `data/architecture-v2/**` are forbidden regardless of Git status.
- `api/**` remains a Vercel Function source boundary under Vercel's native
  root-level API contract. It is never copied into static output. Local Vercel
  output must contain exactly the expected three function routes and no static
  API source.
- `dist/` is generated and ignored. Each candidate build starts with an absent
  target, writes a private sibling staging directory, rejects links and special
  files, enforces path/file/byte limits, verifies the completed tree, then
  renames to the absent target. A separate cleanup command may remove only an
  independently verified generated output before a new build; cleanup plus
  rename is not described as atomic and production never reads local `dist/`.
- The deployment-output manifest is stored outside `dist/`, contains canonical
  relative path, mode, size and SHA-256 rows, and has no wall-clock field. It is
  not publicly deployable.
- Production aliases, promotion and activation remain prohibited in WP0B-B.
  A Vercel preview may be created only from the reviewed candidate and may not
  acquire a production alias.

#### WP0B-B0 - Toolchain and environment closure

1. Pin exact build Node, npm and repository-local Vercel CLI versions before
   any release identity is generated. Reject a floating global CLI.
2. Define the closed build environment: `TZ=UTC`, fixed locale, empty HOME,
   no optional external volume, and an allowlist of Vercel-provided build
   variables that may affect output. Secrets and unrelated environment values
   cannot enter manifests or static bytes.
3. Replace Vercel's current `npm run build` command with a deployment-only
   command that verifies and materializes reviewed artifacts. Evidence
   acquisition, active-pointer mutation, catalog publication and page
   generation remain separate pre-review workflows.
4. Bind exact package-lock bytes and the deployment scripts/configuration into
   the toolchain contract. Record dependency availability honestly: installed
   dependencies may be used for local proof, but offline installation remains
   a typed gap until verified package bytes or an equivalent reproducible build
   environment are retained.

**Gate:** version or environment drift fails before output generation; the
deployment command performs no network acquisition or source/publication
mutation; an empty HOME and unavailable `/Volumes/UGREEN-1TB` do not affect its
bytes.

#### WP0B-B1 - Allowlisted static materialization

**Generated-worker handoff:** B1 approves a source set, not a complete
deployable tree. The tracked `public/service-worker.js` is a legacy behavior
witness for B2 RED tests and is outside the B1 source inventory and manifest.
B2 must generate the candidate worker after B1 materialization and emit an
exact generation/cache-coverage receipt. B3 rejects a tree that lacks that
receipt or contains the tracked witness bytes. This is an explicit staged
composition, not a reduced-site approval: B1 output alone is never eligible
for preview, deployment or activation.

**TDD order**

1. RED fixtures reject undeclared roots, dotfiles, traversal, Unicode/case-fold
   collisions, symlinks, special files, resource-limit overflow, an existing
   unowned target, a source-manifest row for `public/service-worker.js`, and any
   output containing forbidden path families.
2. Validate the reviewed source manifest independently, including exact bytes,
   Git-tracked provenance and `ALLOWED` public-rights disposition for every
   entry. Missing, changed, extra and untracked files under eligible families
   all fail closed.
3. Implement one materializer that copies only exact manifest entries into an
   absent staged target and emits a canonical private output manifest. No glob
   or directory traversal broadens the reviewed set.
4. Update `vercel.json` to `outputDirectory: "dist"`, point `buildCommand` at
   the B0 deployment-only command, remove the `/pdf-evidence/*` rewrite/header,
   and ignore generated `dist/`.
5. Resolve every internal redirect and rewrite destination against the
   materialized tree, including clean-URL HTML resolution and bounded dynamic
   route families. Follow redirect chains with cycle/depth limits; each must
   terminate at a static 2xx target, expected function or an explicit reviewed
   tombstone. Every generated sitemap URL must resolve through the same model.

**Gate:** repeated materialization is byte-identical; `dist/` contains no
source, tests, reports, docs, private context, recovery artifact or Architecture
V2 control file; intended route/header semantics are preserved except for the
explicit removal of private PDF-evidence routing; API sources are absent from
static output; no redirect terminates at an accidental 404.

##### WP0B-B1 rights-adjudication closure slice

The materializer gate above is mechanically complete, but the production
manifest remains correctly blocked. The eligible count is derived from the
exact Git tree and never hardcoded in a test or authorization. The 2026-08-10
pre-exclusion snapshot contains 3,284 paths; the corrected current snapshot is
expected to contain 3,283 after excluding the tracked worker witness. It mixes
first-party work, generated pages, third-party code, government data,
service-verification tokens and private-observation-derived lifecycle state.
Repository location, Git history, an existing deployment and the root MIT
licence are provenance signals, not file-level publication authority.

The closure slice has an evidence-free inventory, explicit provenance,
authenticated decisions and derived outputs. None may infer another:

1. `deployment/static-source-inventory.json` freezes the complete eligible Git
   set by exact path, mode, size, byte hash and Git blob, without assigning any
   right. Its canonical semantic hash is `staticSourceInventoryId`.
2. `deployment/static-generated-provenance.json` maps each generated output to
   its exact producer/tool/font hashes and every direct input-manifest hash. The
   builder computes the transitive union of all input authority dependencies.
   Missing, ambiguous, cyclic or incompatible receipts leave the output
   unclassified.
3. `deployment/static-publication-authorities.json` starts empty and contains
   only production issuer IDs, public verification keys, roles and allowed
   action namespaces after enrollment. Enrollment or modification requires a
   detached owner-authorized trust-root record binding the exact authority-set
   hash. The trusted owner-key fingerprint is supplied through a read-only
   out-of-repository root selected by the owner; repository state, B1 code and
   the authority set cannot establish or replace that root. Test issuers and
   private signing keys are forbidden from production inputs.
4. `deployment/static-rights-source-registry.json` contains detached signed
   decision envelopes. Each envelope binds issuer/role, required action, exact
   authority and source-object hashes, scope hash, inventory ID, evidence
   hashes, attribution obligations, `decisionAsOf`, `validFrom`, `validThrough`,
   review deadline, withdrawal-head hash and predecessor/supersession ID. The
   classifier consumes verified decisions but cannot create `ALLOWED`.
5. `deployment/static-rights-review.json` is a deterministic generated review
   of the complete inventory. Every file has one or more action-scoped
   dependency keys, one active decision per key, inherited provenance,
   attribution fulfillment and exact blockers. It contains no private agreement
   bytes, account identifiers or secrets.
6. `deployment/reviewed-static-source-manifest.json` schema 2 remains the only
   materializer source input. Each row binds the review and exact dependency
   decisions; free-text `basis` and hand-authored `ALLOWED` rows are rejected.
   It is `APPROVED` only when every dependency passes, otherwise it is a typed
   `BLOCKED` manifest with zero rows.

`staticPublicationAuthorizationId` is a separate canonical semantic hash over
the inventory, provenance, authority set, verified decision registry, review,
approved source manifest, attribution fulfillment, classifier/schema identity,
frozen clock and withdrawal head. `deploymentOutputId` remains a byte-only
identity. B3A, B3B, WP4A, WP4B, B4, B5 and WP9 bind both identities so unchanged public
bytes cannot preserve a stale authorization.

**Current source classes and initial decisions**

| Source class | Initial boundary |
| --- | --- |
| First-party source, copy, icons and generated presentation | Evidence candidate: explicit owner attestation scoped to the final inventory and action. Git authorship and MIT alone do not grant the decision. |
| Generated OG PNG/WebP | Evidence candidates: owner attestation, exact producer/input receipts and Outfit licence review. The reviewer decides whether any obligation applies to rendered outputs; repository font redistribution is a separate scope. |
| `web-vitals` 4.2.4 vendored browser bytes | Evidence candidates: exact package/output hashes and upstream Apache-2.0 material. A reviewer supplies obligations; code only verifies their candidate-output fulfillment. |
| Google Search Console verification HTML | Evidence candidate: official unchanged-root-file workflow plus exact issued path/hash. A signed decision scopes only those files and cannot generalize to other Google content. |
| Australian Government Energy Rating derivatives | Evidence candidates: exact dataset metadata/licence and field-source manifests. A signed decision scopes files/fields and declares attribution obligations; origin alone is insufficient. |
| Partnerize/The Good Guys supplied fields or byte-derived presentation | Permanently forbidden from public output under the owner's `PRIVATE_EVIDENCE_ONLY` decision. No production decision may authorize raw/copy feed redistribution. A coarse lifecycle conclusion may lose the public `RETAILER_FEED` dependency only through the exact private-to-public declassification contract below. |
| Unknown or multi-source content | Block. Content-pattern absence cannot prove that a generated value was not derived from a restricted source. |

Official evidence references are version/scope inputs, not live build
dependencies: Google Search Console's file-verification instructions,
`GoogleChrome/web-vitals` tag `v4.2.4` and its Apache-2.0 licence, Google Fonts'
Outfit OFL 1.1 file, the exact Energy Rating dataset metadata/licence, and the
active Partnerize campaign terms retained outside Git. A URL without captured
scope and bytes cannot yield `ALLOWED`.

**Classification contract**

- Classification is closed and ordered by exact path, generator/source
  manifest and explicit provenance metadata. Broad positive regexes cannot
  grant rights. A narrow detector may add dependencies or blockers, never
  remove them.
- A file may depend on multiple authorities. A first-party product page
  containing any retailer-supplied title, price, URL, retailer identity,
  product ID, timestamp, source hash or other supplied field remains forbidden;
  no first-party decision can mask that private dependency.
- Generated product, brand, comparison, location, fit-check and catalog data
  families are conservatively feed-dependent until their generation graph
  proves a narrower source set. Searching rendered text for Partnerize domains
  is diagnostic only and cannot establish non-use.
- Binary files are classified by exact path, producer and hash. Binary content
  is never guessed from metadata or extension.
- Every generated output inherits the full transitive dependency union of its
  exact public inputs. The sole exception is a typed
  `PRIVATE_TO_PUBLIC_LIFECYCLE_DECLASSIFICATION_V1` receipt produced by the
  exact reviewed sanitizer. It may emit only canonical first-party product ID,
  the closed lifecycle/visibility enums and reason codes defined by the public
  schema. The private receipt and source bytes remain outside Git. Paired-input
  tests must prove changes to title, price, URL, retailer identity, product ID,
  timestamps and raw hashes cannot change or enter public bytes when the closed
  lifecycle conclusion is held constant. Any extra key, string, number, URL,
  raw hash, unknown enum, producer/tool drift or missing private receipt blocks
  declassification and restores the private-feed blocker. The public receipt
  binds the sanitizer, schema and sanitized output hash and classifies the
  resulting editorial lifecycle state as `FIRST_PARTY`; it never asserts that
  the private observation had no influence and never grants feed redistribution
  rights.
- Decision evidence is immutable and content-addressed. A rights or source
  change creates a successor registry/review/manifest; it does not edit an
  approved historical decision in place.
- The generator reads Git and local reviewed evidence only. It performs no
  network access, does not read `/Volumes/UGREEN-1TB`, and does not copy private
  evidence into Git or `dist/`.
- All JSON artifacts use one strict canonical subset: UTF-8, NFC strings,
  recursively byte-sorted object keys and semantically sorted ID/path arrays;
  integers only for numeric fields and no duplicate IDs or unknown keys. Every
  hash declares its domain and schema version.
- Private campaign evidence is replayed before review by a separate offline
  verifier. It verifies retained bytes against declared hashes and reviewer
  scope, then emits only a signed allowlisted detached envelope. Deployment
  consumes the envelope, never private bytes. Missing evidence prevents a fresh
  decision or replay; a byte hash alone never establishes authenticity, scope
  or reviewer authority.
- The production trust root is not bootstrapped by this implementation. The
  foundation ships with an empty authority set and a typed
  `PRODUCTION_TRUST_ROOT_NOT_ENROLLED` blocker. Tests inject fixture-only roots;
  no command generates a production key, enrolls an issuer or interprets an
  implementation commit as owner authorization.
- Generation uses the bound frozen `decisionAsOf`. Every downstream gate also
  performs a fresh non-output-affecting validity/withdrawal check. A stale,
  expired or withdrawn predecessor is not an eligible rollback target.
- Attribution obligations use stable IDs and bind an exact public path/hash and
  reachable route or a declared embedded location. Existence alone does not
  prove fulfillment; wrong, stale, unreachable and orphaned fulfillment fails.

**TDD and execution order**

1. Preserve the current zero-row blocked manifest. RED: freeze every path in
   the dynamically enumerated eligible set without assigning rights; additions,
   removals, renames, byte/mode drift and untracked eligible files invalidate
   the ID. A numeric count is a generated diagnostic, never fixture authority.
2. RED: reject unknown keys/actions/classes, empty scope, missing source or
   evidence hash, duplicate/contradictory decisions, expired/withdrawn state,
   wrong inventory, unbound or test issuer, invalid signature, unmet
   attribution, hand-authored `ALLOWED`, and secret-shaped fields.
3. GREEN: implement strict schema-2 validators, action keys, signature
   verification, canonical hashing, the explicit classifier/provenance resolver
   and blocked gate. Keep the production authority set empty and require an
   injected read-only trust root; create no production key or enrollment.
4. RED: prove every current eligible source path is inventoried, the exact
   tracked service-worker witness is excluded rather than silently copied,
   all generated catalog families receive their conservative data dependencies,
   inherit transitive dependencies, and invalidate every derivative after one
   input withdrawal.
5. GREEN: after the implementation hashes are final, create one B0 toolchain
   successor binding executable classifier, validator and schema files only;
   mutable inventory, decisions and reviews belong exclusively to the
   authorization ID. Runtime validation rejects missing, duplicate or extra
   required executable bindings.
6. Generate the real deterministic Git-bound review. Add no generic legal
   inference model. `review:b1-rights` may exit zero after writing a complete
   blocked report and zero-row blocked manifest.
7. RED: require every file's full dependency/action set, authenticated decision,
   clock and attribution fulfillment before any row can enter schema-2. Prove
   `verify:b1-rights-gate` exits nonzero unless all rows and the exact
   `staticPublicationAuthorizationId` validate.
8. Remediate only mechanically verifiable licence/attribution delivery, then
   regenerate the final inventory/provenance hashes. Never manufacture an owner
   attestation or campaign permission in code.
9. Replay private evidence and present only the final exact owner/trust-root,
   authority-enrollment and campaign decisions for signing. Regenerate the
   registry, review, zero-row/approved manifest and authorization ID through the
   same pipeline.
10. Run two clean reconstructions, adversarial tests and fresh clock/withdrawal
   checks; clean generated outputs. The exact successful gate authorizes B2 to
   generate a worker from this source set; it does not authorize deployment.

**B1 rights gate**

- the review covers the exact eligible Git set with no unknown class;
- every file has at least one dependency and every dependency is `ALLOWED`,
  action-scoped, signed by an authorized production issuer, in date, not
  withdrawn and attribution-complete;
- all required public licence and attribution files are themselves included in
  the reviewed output; each obligation binds exact bytes and a reachable route
  or reviewed embedded location;
- the approved schema-2 source manifest is derived from, and hash-binds, the
  exact inventory, provenance, authorities, registry and review; free-text
  authority and hand-authored approval rows are invalid;
- the exact `staticPublicationAuthorizationId` is present, fresh and required by
  every downstream package; artifact existence or a successful blocked review
  command is never a completion signal;
- two runs from the same tree are byte-identical, while any source, registry,
  evidence, attribution, clock, withdrawal or eligible-path change blocks
  reuse; and
- focused/adversarial tests, deployment regression tests, syntax checks and
  `git diff --check` pass with no `dist/`, deployment, pointer, public activation,
  commit or push.

Before this gate passes, B2 may implement and test only its pure protocol with
fixtures and the tracked legacy worker as a RED witness. Real worker generation,
B3A, WP4A and every preview/release task remain closed. After B1 passes, B2
must add the generated worker before B3A; a B1-only reduced tree is never
silently substituted for the intended site.
Rollback also remains blocked unless its predecessor satisfies the fresh
current static-publication authorization floor.

#### WP0B-B2 - Release-bound service-worker protocol

B2 has two explicit states. `B2_PROTOCOL_READY` is fixture-only implementation
and adversarial proof; it may be reached while B1 rights decisions are still
blocked. `B2_GENERATION_READY` requires a successful B1 authorization, then
generates the real worker into private staging and binds its reviewed inputs,
application generation and cache coverage. Only `B2_GENERATION_READY` may feed
B3A. WP8 later completes page/worker integration; neither earlier state is a
release candidate.

Three identities remain explicit. `applicationSourceId` binds the exact B1
source-manifest bytes before release-marker injection. `applicationGenerationId`
is the semantic hash of a closed generation manifest containing
`applicationSourceId`, the exact `staticPublicationAuthorizationId`, active
retail release, Fit-bearing module/data identities, cache protocol version and
captured predecessor identity. It never hashes marker-stamped output bytes, so
embedding it into pages and the worker is not self-referential.
`deploymentOutputId` is computed later by B3 over every final
`.vercel/output` byte, including marker-stamped HTML, the generated worker,
function bundles and `config.json`; it is detached and is the sole candidate,
preview and authorization identity. None of these identities is represented as
another.

`workerGenerationReceiptId` is the canonical hash of the exact B1
`staticPublicationAuthorizationId`, B0 toolchain-contract hash,
`applicationSourceId`, `applicationGenerationId`, active-retail-release ID,
worker output path/hash, producer/tool/input hashes, cache-protocol version,
predecessor-capture/cache identity and cache-coverage-manifest ID. B3 accepts
the worker only through this receipt and compares every bound identity; a stale
or cross-build worker cannot be paired with a fresh B1 authorization.

The generated worker receives the complete application release identity and a
closed retained-version set containing the current release plus the exact
captured production predecessor cache version bound by its receipt. Activation
may remove only FitAppliance cache versions outside that set. It must never
delete the immediate predecessor cache during candidate install or activation.

B2 first builds the pure protocol and adversarial browser harness. WP8 integrates
the release marker into every HTML bootstrap and every Fit-bearing public data
or module request, then requires a page/worker handshake before Fit execution.
Missing or mismatched release markers disable Fit rather than refreshing into a
mixed calculation. Offline rollback is claimed only for paths listed in a
verified cache-coverage receipt; unlisted pages remain explicitly online-only.

**TDD order**

1. RED tests reject Git-SHA-only, environment-only, missing-predecessor and
   self-referential release identities. Convert the current Git/environment
   version and delete-all-old-caches tests in `pwa.test.mjs`,
   `sw-version.test.mjs` and `sw-cache-strategy.test.mjs` into explicit RED
   legacy witnesses before changing implementation.
2. Generate the deployed worker into the private staging output, not by trusting
   the tracked `public/service-worker.js` bytes, and emit the fully bound
   `workerGenerationReceiptId` described above.
3. Test marker absence/mismatch, old-page/new-worker, new-page/old-worker,
   failed precache, failed activation, stale tab, offline reload and
   rollback-worker combinations.
4. Prove a failed install/activation preserves predecessor caches and clients.
   Build a cache-coverage receipt from actual candidate precache bytes and prove
   only those routes can claim offline rollback while successor caches exist.

**Gate:** the same application inputs produce the same worker and cache names;
any bound input changes the release identity; predecessor caches survive until
the later successor-health decision; no mixed or unmarked generation can run
Fit; offline claims cannot exceed the verified cache-coverage receipt. Protocol
tests may pass before WP8, but B2 is complete only after WP8 integration and
real-browser instrumentation.

#### WP0B-B3 - Deterministic Vercel output

B3 has two mandatory executions. `B3A` runs before WP4A to prove the contained
materializer and toolchain contract. `B3B` runs after WP8 from the integrated
source and produces the only output eligible for B4 or WP9. A B3A output is a
test baseline, never a release candidate.

1. From two clean source reconstructions using the exact B0 contract, validate
   the B1 source manifest and materialize it into an absent private staging
   target with no tracked worker bytes.
2. Fail if the separately reviewed source manifest does not match either clean
   reconstruction or its exact `staticPublicationAuthorizationId` is absent,
   stale, expired, withdrawn or otherwise invalid. Then validate the exact B2
   `workerGenerationReceiptId`, regenerate/verify its worker, and add only that
   worker to the staging target. Reject a missing receipt, identity mismatch,
   pre-existing worker path, tracked-witness byte reuse or any extra file.
3. Run repository-local `vercel build --prod` only from that verified complete
   B1+B2 composition, with no external evidence volume or
   acquisition/publication writer.
4. Build an independent canonical `.vercel/output` manifest covering static
   files, functions and `config.json` by path, mode, size and SHA-256. Ignore no
   byte-bearing file and do not compare compressed archive bytes or mtimes.
5. Define `deploymentOutputId` as the canonical semantic hash of that complete
   final manifest. Compare the two IDs/manifests and independently assert the
   three expected Node functions, Sydney region, route/header semantics and
   absence of forbidden static files. Bind, but do not fold,
   `staticPublicationAuthorizationId` into each B3 witness.
5. For B3A, retain the manifests and IDs as containment witnesses only. After
   WP8, repeat all B1, B2 and B3 checks as B3B from two clean reconstructions;
   retain the exact B3B `.vercel/output` used by B4 long enough for preview
   verification. Never ask Vercel to rebuild it for preview.

**Gate:** within each execution, both complete manifests,
`deploymentOutputId` values and static-publication authorization bindings are
identical; the deployment-only build works
without network acquisition, source mutation or `/Volumes/UGREEN-1TB`; any
toolchain, route, static byte or function-bundle drift is typed and blocking.
B3B additionally proves the final output contains WP8's release markers,
worker protocol and zero active legacy Fit reads. Offline dependency
installation remains a declared gap unless separately proven; it cannot be
closed by a version string.

#### WP0B-B4 - Candidate and preview QA

1. Materialize one immutable, non-production candidate bound only to the B3B
   output manifest, `deploymentOutputId`, fresh
   `staticPublicationAuthorizationId`, WP4B zero-legacy-read receipt and
   application-generation identity.
2. Run local route/header/function/sitemap checks before any network action.
3. Deploy the retained exact B3B output only through Vercel's prebuilt path;
   rebuilding from source is forbidden. Create at most one preview with no
   production aliases, then record its deployment ID and output binding without
   secrets.
4. Obtain an authoritative complete deployment receipt that binds the immutable
   Vercel deployment ID to every B3B static, function and `config.json` manifest
   entry and its content digest. Selected URL probes, a successful CLI exit and
   normalized route behavior are supplementary checks, not complete identity
   proof. If Vercel cannot return or attest that complete mapping, record
   `REMOTE_DEPLOYMENT_RECEIPT_UNAVAILABLE`: browser QA may continue, but B4 and
   activation remain blocked.
5. Verify representative immutable-preview URL bytes, all function behavior and
   normalized route behavior against the B3B manifest and complete deployment
   receipt before browser QA.
6. Run desktop/mobile browser, keyboard, accessibility, console, cache-update,
   offline and representative route checks against the preview. Explicitly
   confirm the previously exposed internal URLs return `404`.

**Gate:** the authoritative complete receipt, local output and immutable preview
bind the same B3B `deploymentOutputId` and
`staticPublicationAuthorizationId`; a fresh non-output-affecting check confirms
its decision clock and withdrawal head; intended routes and three functions
remain available; internal files are absent; no production deployment or alias
changes occur. Sampling alone cannot satisfy this gate.

#### WP0B-B5 - Fresh-predecessor and owner-authorization gate

WP0B-B owns the strict capture schema, stale-binding validator and a read-only
rehearsal against current production. It does **not** claim that today's capture
will still be the immediate predecessor at WP9. Immediately before any WP9
production activation, WP9 must invoke the same protocol again and reject a
changed deployment, aliases, source, output manifest or promotion eligibility.
The fresh capture, candidate identity check and alias promotion must form one
CAS-equivalent owner-authorized WP9 operation. A read followed later by an
unconditional alias change is rejected. This removes the previous WP0B/WP9
circular dependency without pretending a stale capture is a true predecessor.

Detached owner authorization is specified and tested here but remains absent.
Only WP9 may consume a separately supplied authorization bound to the final
candidate hash; repository state, this plan and preview success are not owner
authorization.

B5 also revalidates the final candidate's static-publication decisions against
the current clock and withdrawal head immediately before activation. A changed,
expired or withdrawn authorization aborts without alias mutation. The retained
rollback predecessor must pass that same current rights floor; if it does not,
rollback is not represented as available and activation remains blocked.
The fresh predecessor capture must equal the predecessor-capture and cache
identity in the final B2 worker receipt. Any drift invalidates that receipt,
B3B output, B4 preview evidence and detached owner authorization; the mandatory
recovery path is fresh capture followed by B2 regeneration, B3B reconstruction,
B4 QA and a new owner authorization. B5 never patches a retained-cache list or
promotes an older preview in place.

**Milestone gates**

- `WP0B_CONTAINMENT_READY`: the B0 successor and B1 pass, B2 reaches
  `B2_GENERATION_READY`, and B3A passes with the same
  `staticPublicationAuthorizationId`; deployment output is complete, contained
  and deterministic. This is required by WP4A but does not claim final WP8
  handshake integration, cache coverage for all routes or preview completion.
- `WP0B_PREVIEW_PROVEN`: WP8 has integrated B2, B3B rematerializes the complete
  final output, and B4 binds every local manifest entry to an authoritative
  immutable-deployment receipt before proving browser behavior. The
  production-boundary P0 is absent from that preview. This is required by WP9.
- `WP0B_ACTIVATION_READY`: inside WP9 only, B5 binds a fresh predecessor,
  retained rollback target, final candidate and detached owner authorization in
  one CAS-equivalent operation. Until then production remains unchanged.

WP1 is authorized by WP0A and does not consume a WP0B milestone. The plan stores
candidate, preview, manifest and test evidence without credentials; none of
these records substitutes for owner authorization.

The existing active descriptor's `PROVEN_BYTE_IDENTICAL` means only the public
catalog projection was restored. It must not be cited as whole-site rollback
proof; a successor schema will call this scope
`PUBLIC_PROJECTION_BYTES_PROVEN`.

**Typed stops**

- `PRODUCTION_DEPLOYMENT_IDENTITY_DRIFT`
- `REMOTE_FILE_TREE_UNAVAILABLE`
- `SOURCE_COMMIT_OR_TREE_MISSING`
- `SOURCE_RECONSTRUCTION_DRIFT`
- `OVERBROAD_STATIC_OUTPUT`
- `SERVICE_WORKER_NOT_RELEASE_BOUND`
- `DEPLOYMENT_OUTPUT_UNOWNED`
- `DEPLOYMENT_OUTPUT_FORBIDDEN_PATH`
- `DEPLOYMENT_TOOLCHAIN_DRIFT`
- `DEPLOYMENT_OUTPUT_NONDETERMINISTIC`
- `DEPLOYMENT_SOURCE_MANIFEST_DRIFT`
- `STATIC_PUBLICATION_AUTHORIZATION_MISSING_OR_STALE`
- `STATIC_PUBLICATION_DECISION_EXPIRED_OR_WITHDRAWN`
- `STATIC_PUBLICATION_ATTRIBUTION_UNMET`
- `STATIC_PUBLICATION_ROLLBACK_RIGHTS_BLOCKED`
- `DEPLOYMENT_FINAL_IDENTITY_MISMATCH`
- `PREBUILT_OUTPUT_NOT_EXACT`
- `REMOTE_DEPLOYMENT_RECEIPT_UNAVAILABLE`
- `PREDECESSOR_CACHE_NOT_RETAINED`
- `RELEASE_HANDSHAKE_MISSING_OR_MISMATCHED`
- `OFFLINE_CACHE_COVERAGE_UNPROVEN`
- `PREVIEW_OUTPUT_MISMATCH`
- `IMMEDIATE_PREDECESSOR_STALE`
- `OWNER_AUTHORIZATION_MISSING`

WP0B-A's focused max closure review remains valid only for WP0B-A. This expanded
WP0B-B sequence changes deployment and release boundaries, so the whole plan is
`DRAFT` until a new independent `gpt-5.6-sol` max review closes all P0/P1
findings. No implementation slice is authorized before that review.

### WP1 - Separate catalog and historical-reference universes

**TDD order**

1. Reject ambiguous or implicit catalog/reference reuse.
2. Validate explicit overlap dispositions and exact model scope.
3. Derive a reconciliation ledger without modifying either source universe.
4. Tighten replacement actions: exact three-axis receipt and rights are
   required for `AUTO_FILL`; sibling, range, conflict, or missing-axis records
   become confirmation, measurement, or quarantine.
5. Require every replacement output candidate to be a `CURRENT_OUTPUT` member
   of the bound active catalog release, with eligible retailer observations and
   complete outside dimensions. `unavailable: false` and a plausible URL are
   insufficient.

**Gate:** all 3,513 catalog and 8,087 reference records reconcile exactly once;
no record disappears; generation is deterministic and does not mutate either
universe; replacement mode never imports or calls FitDecision; archived and
market-reference outputs are rejected even when legacy availability fields and
URLs look current.

### WP1 implementation checkpoint - 2026-08-09

- One bounded `gpt-5.6-sol` medium implementation slice followed TDD. The
  initial focused test failed with `ERR_MODULE_NOT_FOUND`; adversarial follow-up
  tests then exposed invalid-axis and missing-canonical-ID handling before the
  minimal pure implementation was completed.
- Primary integration review added five RED witnesses. They proved that the
  first implementation recorded release hashes without verifying the input
  JSON bytes, allowed an arbitrary catalog array to impersonate the bound
  release, did not reject duplicate unmapped identities, accepted incomplete or
  future-dated receipt locators, and omitted per-row replacement eligibility.
  The corrected implementation now fails closed on each case.
- The private reconciliation artifact binds active release
  `retail_lifecycle_release_6c42c754aeb1ff49097b32b4`, catalog bytes
  `d29bce5366a3467f9aa4887d26268284681184fb4a1f9097e8f2ed477f66da90`,
  and historical-reference bytes
  `bc71b7af5bd3e68ce388ab7897df726cfae8980dc84db961eac531270aabd882`.
- It reconciles all `3,513` catalog rows and `8,087` historical rows exactly
  once: `3,510` exact mappings, `4,577` historical rows with no mapping, and
  `3` catalog-only WashTower rows. All `349` lifecycle-authorized current rows
  are explicitly marked as replacement candidates; archived and market-only
  rows are rejected. Empty explicit rights produce zero effective `AUTO_FILL`
  actions and the typed blocker
  `PUBLICATION_RIGHTS_DISPOSITION_MISSING`.
- Two generations were byte-identical. Artifact SHA-256:
  `6b2f5d0738c440df7c41925fbc9799eddd2b3e5ac0b491325c3132bec0ed63bc`;
  semantic SHA-256:
  `519cf85e8121ea25d50dbbfaeee161636fc4564e1574369745d903d93dac397f`.
- Focused WP1 tests pass `11/11`; active-release, historical-reference,
  replacement-audit and runtime replacement regressions pass `37/37`; syntax
  checks and `git diff --check` pass. The
  broader Architecture V2 run passed `1,608/1,611`; its three failures are the
  already-open WP0B deployment-surface/cutover baseline drift caused by B0's
  containment changes, not WP1 source or historical behavior. WP1 does not
  rebaseline or conceal that separate blocker.
- No source universe, active release pointer, `public/**` file, deployment,
  commit, or push changed. WP2 may consume this private ledger; B2/B3A remain
  blocked by B1's exact file-level rights review.

### WP2 - Build readiness epochs and applicability partition

**TDD order**

1. Implement the authoritative predecessor graph, independent readiness and
   applicability schemas, and direct semantic-ID bindings.
2. Generate an applicability matrix for all 349 current products.
3. Represent both WashTowers as `POLICY_UNSUPPORTED` until a dedicated policy
   and cohort exist.
4. Treat all missing/unknown form factors as readiness blockers.
5. Bind the publication-rights disposition registry and reject implicit
   `public_display` permission.
6. Add immutable epoch materialization, exact repeat, interruption/resume,
   concurrent-writer, supersession, withdrawal, and rollback tests.

**Gate:** all 349 current products appear exactly once in the partition; no
unsupported row receives a Fit outcome; normal build/test works without
`/Volumes/UGREEN-1TB`; changing any predecessor rejects unchanged descendants;
a second run cannot delete or weaken accepted state.

#### WP2 bounded implementation design

WP2 remains a private-data slice. It must not read B1/B2/B3 artifacts, write
`public/**`, alter the active retail release, call a Fit evaluator, or infer
installation facts from legacy `w/h/d`, `clearance_requirements`, flags or
`fitScore` fields.

**Exact predecessor set and clocks**

1. the active retail release descriptor and its already-verified catalog and
   historical-reference byte hashes;
2. the immutable WP1 reconciliation artifact byte hash plus its declared
   semantic hash, explicitly in the `identity_map` predecessor role;
3. Fit V4 field-map bytes/version and a versioned readiness-epoch schema
   definition/hash;
4. validated policy-pack version and one semantic hash per category;
5. product-data rights-dictionary bytes and default `unknown_blocked`;
6. one receipt bundle produced and revalidated by the existing Fit V4 receipt
   bundle validator. The initial bundle is explicitly empty, not inferred from
   a missing file;
7. one source registry. The initial registry is a hash-bound typed
   `NOT_MATERIALIZED` manifest with zero sources, not an implicit empty lookup;
8. a new explicit Fit V4 publication-rights registry and its rights-evidence
   inventory; and
9. the pure producer and materializer source hashes.

Every predecessor appears once in an ordered graph with its role, ID, byte
hash and semantic hash where defined. A frozen explicit `asOf` and separate
catalog, receipt, source and rights clock bindings are semantic inputs. Rights
validity uses only that `asOf`; `Date.now()` and filesystem mtimes are forbidden
from semantic generation. An epoch is a point-in-time decision and cannot be
cited as a still-current grant at a later activation without a fresh gate.

The readiness epoch ID hashes this graph, the normalized per-field partition,
schema/policy versions and producer hashes. Reusing an epoch ID after any
predecessor or producer change is rejected. No test may fabricate a WP5
knowledge release; synthetic receipt/source/rights bytes are allowed only as
bounded validator fixtures and never enter the real active-release epoch.

**Publication-rights registry contract**

The initial committed registry contains zero grants. A future non-empty row is
accepted only when all of these are exact and replayable:

- the dictionary binding key `providerId + sourceId + dictionaryFieldId +
  actionId`, where `actionId` is `public_display` or the associated
  `attribution` decision;
- source content hash, exact receipt ID/hash, exact AU canonical-product/model
  scope, authorization-evidence byte hash, validity interval, conditions and
  attribution fulfillment or explicit no-attribution proof;
- a predecessor decision for supersession or withdrawal; and
- authorization evidence bytes whose hash is independently replayed at build
  time. A string, URL or self-asserted hash alone is insufficient.

Missing, denied, expired, withdrawn, ambiguous or attribution-incomplete rows
map exhaustively to the Section 4.2 `PublicationRightsDisposition` enum.
`UNMAPPED_BLOCKED` fields cannot receive an allowed public disposition
regardless of registry content. Unknown registry states are rejected, not
mapped through a default branch. Internal receipt-processing rights remain the
existing receipt validator's concern and are stored separately from public
display rights.

**Independent row state**

Each of the 349 `CURRENT_OUTPUT` catalog rows is bound to its WP1 row identity,
canonical product ID and catalog-row semantic hash, and appears exactly once.
The population is enumerated directly from the active catalog by
`lifecycleVisibility === CURRENT_OUTPUT`; it is never filtered through WP1's
replacement eligibility. The join to WP1 must match `sourceOrdinal`, catalog
product ID and canonical product ID. Form factor comes from the bound catalog
row, and the row hash uses the plan's canonical JSON algorithm.

The frozen policy applicability enum is exactly `SUPPORTED`,
`POLICY_UNSUPPORTED`, `FORM_FACTOR_REQUIRED`, `CONFIGURATION_REQUIRED` and
`CATEGORY_UNSUPPORTED`. The frozen per-field evidence enum is exactly
`ACCEPTED`, `UNKNOWN`, `CONFLICT`, `STALE`, `RIGHTS_BLOCKED` and `UNSUPPORTED`.
Rights states use the exhaustive Section 4.2 uppercase mapping; source
dictionary decision strings are converted only by an explicit total mapping.

For every policy-applicable field, store independently:

- policy applicability and reason codes;
- receipt/evidence readiness and exact receipt/bundle binding when present;
- internal-processing rights readiness;
- public-display and attribution readiness; and
- private and public knowledge-compilation blockers.

Product-level summaries are pure reductions of these field rows. WP2 emits
`privateKnowledgeCompilationEligibility` and
`publicKnowledgeCompilationEligibility`; it does not emit or consume a
knowledge release and does not decide evaluation eligibility. A later run
manifest may authorize evaluation only after it binds both this epoch and its
successor knowledge release, closing the dependency direction in Section 4.3.

Only catalog category `fridge` normalizes to policy category `refrigerator`;
other category names remain exact. Missing form factor maps to
`FORM_FACTOR_REQUIRED`. `washtower_combo` and a present but unrecognized
category/form-factor pair map to `POLICY_UNSUPPORTED` pending dedicated policy
evidence. An unknown category maps to `CATEGORY_UNSUPPORTED`. An invalid
policy-pack hash or malformed pack is the global typed stop `POLICY_DEFECT`,
not a conveniently unsupported row.

The measured active-release expectation is `96 SUPPORTED`,
`247 FORM_FACTOR_REQUIRED` and `6 POLICY_UNSUPPORTED`: two current LG
WashTower rows and four dishwasher rows whose legacy `front_loader` form factor
is not recognized by the dishwasher policy. These are regression witnesses,
not hard-coded production logic.

Legacy geometry/provenance may be counted as a migration observation but cannot
satisfy V4 evidence readiness. The validator-confirmed initial V4 receipt bundle
is empty, so the initial epoch must produce zero private or public
knowledge-compilation-eligible rows. It contains no Fit outcome, evaluation
status, rank, score, required cavity, knowledge payload or synthetic scenario.
For policy-applicable fields, `public_display` permission is checked explicitly
against the publication-rights registry even though the current field map does
not list that action; omission from `requiredActions` is not a grant. Lack of
public-display rights does not by itself block future private oracle or
calibration work when receipt evidence and internal-processing rights are valid.

**Immutable epoch store**

- Store each epoch once under a content-addressed private Architecture V2
  directory. Existing identical bytes are a replay; differing bytes at the
  same ID are corruption.
- Store every activation, supersession and rollback transition as a separate
  immutable hash-bound record. A small mutable head contains only the active
  transition/epoch IDs and sequence.
- Require an explicit expected head for compare-and-swap. Serialize writers
  with an exclusive local lock. The lock binds an owner token, PID, host,
  process-start fingerprint and expected-head hash. Recovery requires the
  exact lock-byte hash, matching host, minimum age and proof that the recorded
  process is dead; otherwise the lock is never removed.
- Write and verify the epoch, then transition, then atomically replace the head.
  Fault injection after each durable boundary must leave either the old valid
  head or a resumable unreferenced immutable artifact.
- A repeated run reuses identical artifacts and cannot overwrite, delete or
  weaken prior state. If the same byte-identical epoch is already active, it is
  a no-op and creates no transition. A rights withdrawal creates a new blocked
  successor epoch bound to the changed registry; it never edits the prior
  epoch.
- Each epoch carries a non-regressing safety floor containing the current
  active lifecycle release, receipt bundle including receipt withdrawals,
  source registry, rights registry and withdrawal set, frozen `asOf`, and
  minimum epoch/field-map/policy schema versions.
- Rollback may point at a retained epoch only when its safety floor equals the
  currently revalidated safety floor. A prior grant, withdrawn receipt, older
  lifecycle release or lower schema/policy floor cannot be reactivated. The
  safe recovery path is to generate a new blocked successor using current
  safety inputs and any still-usable older evidence. Rollback appends a
  transition and never deletes the failed successor or rewrites history.

Default materialization paths stay under
`data/architecture-v2/epochs/fit-v4-readiness/`; tests use isolated temporary
roots. Runtime code must not import network clients or require
`/Volumes/UGREEN-1TB`.

**WP2 RED order and acceptance cases**

1. reject missing/drifted/duplicated predecessors and a forged WP1 binding;
2. partition synthetic rows for applicable, missing form factor, WashTower,
   unrecognized form factor and malformed policy without calling Fit;
3. prove missing/denied/expired/withdrawn/attribution-incomplete or
   self-asserted `public_display` decisions stay blocked, and prove a synthetic
   positive fixture requires replayed authorization bytes and an EXACT-mapped
   dictionary field;
4. prove the exact 349-row active-release counts and zero private/public
   knowledge-compilation-eligible rows;
5. prove deterministic generation, source non-mutation and no external-volume
   dependency;
6. prove exact replay, interruption/resume at every durable boundary,
   concurrent-writer rejection, safely proven stale-lock recovery and
   stale-head CAS rejection;
7. prove explicit rights withdrawal produces a blocked successor without
   mutating the predecessor, and that no old grant can be reactivated; and
8. prove rollback accepts only an equal current safety floor while all epochs
   and transitions remain byte-identical and loadable.

Exact-schema and dependency tests reject any epoch key or source import related
to Fit outcomes, evaluation, rank, score, cavity, scenarios or an evaluator;
this makes the no-outcome gate substantive rather than vacuously true.

The smallest intended write set is one pure readiness/applicability module, one
bounded materializer, one strict empty publication-rights registry, one focused
test file, generated private epoch artifacts, and this checkpoint. The empty
receipt bundle and typed source-registry absence manifest may be embedded
immutable predecessors produced by existing validators rather than separate
frameworks. Reuse
existing Fit V4 field/policy validators; do not add a framework, database,
generic workflow engine or second active-release pointer.

### WP2 max-review checkpoint - 2026-08-09

- The first independent `gpt-5.6-sol` max review returned `DRAFT`. It found a
  circular knowledge/evaluation dependency, rollback that could reactivate
  withdrawn evidence or rights, incomplete predecessor and clock bindings,
  insufficient positive-rights proof, mixed internal/public rights, aggregate
  rather than per-field state, an indirect 349-row population, unsafe lock
  recovery, and weak no-evaluator schema tests.
- The revised design confines WP2 to receipt/evidence readiness and knowledge
  compilation eligibility, binds every predecessor and clock explicitly,
  requires replayable exact authorization evidence, separates internal and
  public rights per field, enumerates all current rows directly from the active
  release, and makes rollback subject to a non-regressing current safety floor.
- A focused closure review checked only those prior P0/P1 findings and returned
  `READY`: all were closed with explicit fail-closed contracts and substantive
  acceptance tests. One bounded `gpt-5.6-sol` medium implementation slice is
  now authorized; WP3 remains blocked until WP2 passes primary integration and
  regression verification.

### WP2 implementation checkpoint - 2026-08-09

- **Status:** `COMPLETE`, after primary clean rematerialization and regression
  verification. The focused WP2 suite passes `8/8`; the directly related WP1,
  field-map, policy, receipt, rights and active-release regressions pass `53/53`.
- Safety floors carry sorted receipt/decision inventories and explicit
  withdrawals. Successor and rollback checks reject silent history loss or
  self-asserted revalidation. Epoch/product/field schemas, derived summaries,
  stored path identities, active head-transition replay, transition lifecycle,
  atomic temporary-file cleanup and path-safe reads are fail-closed.
- The clean active private epoch is
  `fit_v4_readiness_a3a77a90d939f77b77f15e1b`, with semantic SHA-256
  `a3a77a90d939f77b77f15e1b1c6e9c28e67261ab7153e59d0d83b4b17c40676e`,
  file SHA-256
  `6c3d190c7ce5d8b2696412f2528479019f72f690f4bf427c69934f3d4f4d435d`,
  and safety-floor SHA-256
  `76bd72613d50842aaa4bd171bfb27e9e14d3104f5e9e445741f046e2f9610f67`.
  Its activation transition is
  `fit_v4_readiness_transition_4022e5c79942c765900da446`; the transition file
  SHA-256 is
  `ca1123792aebb8d01c89616846279cb0a7f72bbb767d14dd1c9ada395691c254`
  and the four-field head file SHA-256 is
  `b16fd23437b8683ad7cf6a7ace803b06f25ee282b39ea1c39ef12b45f3ad7780`.
- The clean store contains exactly one epoch and one transition at head sequence
  `1`. A second materialization returned `NO_OP`, retained the same IDs and
  hashes, and created no additional immutable or mutable artifacts.
- The epoch enumerates all `349` `CURRENT_OUTPUT` rows directly and joins WP1
  by source ordinal, catalog ID and canonical ID. Applicability is exactly `96`
  `SUPPORTED`, `247` `FORM_FACTOR_REQUIRED`, and `6`
  `POLICY_UNSUPPORTED`; the explicit empty V4 receipt bundle and zero-grant
  publication-rights registry produce `0` private and `0` public
  knowledge-compilation-eligible products.
- Epochs and transitions are content-addressed, append-only and independently
  revalidated after durable writes. The head is a four-field CAS pointer;
  fault-boundary resume, active-lock rejection, proven stale-lock recovery,
  rights withdrawal, non-regressing successor activation and equal-floor-only
  rollback are covered by tests.
- Source non-mutation checks preserve the active catalog, historical reference,
  WP1 artifact, field-map and publication-rights registry hashes. `public/**`,
  the active release descriptor and B1/B2/B3 artifacts were not changed or
  consumed. No commit, push or deployment was performed.
- The complete Architecture V2 suite ran `1,622` tests: `1,619` passed and only
  the same three registered B0 drift assertions failed (`498` and `502` in the
  cutover candidate, `520` in the migration baseline). They were not rebaselined
  or concealed and are outside WP2. WP3 may now begin its own bounded
  design/review cycle.

### WP3 - Separate synthetic scenario sets from live scenarios

**Status:** `IMPLEMENTED AND VERIFIED IN THE PRIVATE LANE`. WP3 does not satisfy
or bypass B1, and it does not unlock B2, B3A, WP4A or any public cutover while
source-display rights remain blocked.

**Problem statement**

The current run manifest stores one `scenarioSetSha256`, but the evaluator
compares it directly to the selected site-profile hash. A set and a member are
therefore indistinguishable: two members of one set cannot prove both common set
identity and distinct member identity. The evaluator also accepts a raw
`real_site` profile and hashes it into a serializable result. This violates the
privacy boundary for live user observations.

WP3 introduces one exact union with no legacy fallback:

1. `PERSISTED_SYNTHETIC`: a persisted run binds an immutable synthetic set and
   one exact member; and
2. `LIVE_EPHEMERAL`: an in-memory evaluation binds an opaque capability and can
   never enter a manifest, checkpoint, audit artifact, pointer or result store.

`consented_offline` remains a valid site-profile source kind, but is rejected by
both WP3 run modes until a separate consent, retention, revocation and replay
contract is designed. It cannot silently masquerade as synthetic or live.

**Synthetic scenario-set contract**

- Add one pure scenario-binding module with exactly one builder and one selector.
  The exact-schema semantic payload contains a schema version, fixed artifact
  type, declared purpose, category/configuration scope, frozen metadata and a
  non-empty canonical member list. Two members are required by the distinction
  test, not by production policy.
- Each member contains one validated `synthetic` site profile. Its member hash
  is the canonical profile hash, and its member ID is derived from that hash.
  IDs and hashes are unique. Members are sorted canonically; a validator rejects
  duplicate, omitted, reordered, mutated or extra members rather than repairing
  caller input.
- The set hash and set ID are derived from the complete canonical semantic
  payload, excluding their own derived fields. A fully rehashed mutation is a
  different structurally valid set, not the same authority. Resume, replay and
  pointer activation remain pinned to the independently stored predecessor set
  ID and full SHA-256 and reject that successor as drift.
- The selector accepts only the full validated set manifest and exact member ID.
  It derives the selected profile, set manifest ID, set SHA-256, member ID and
  member SHA-256 as one frozen envelope. Run and evaluator APIs never accept a
  raw caller profile, caller-authored binding, or separate member hash. A member
  from another set, stale copy, collision or substituted profile fails before
  Fit evaluation.

**Persisted run and result bindings**

- Bump the run-manifest schema. `createFitV4RunManifest` receives the complete
  set manifest plus selected member ID and invokes the selector; it replaces the
  scalar `scenarioSetSha256` with the selector's exact
  `PERSISTED_SYNTHETIC` envelope.
- Bind `clockBindings.siteObservation.bundleSha256` to the selected member hash,
  not the set hash. The set and member bindings both participate in semantic
  manifest, manifest ID and run ID derivation, so two members of one set produce
  distinct runs.
- Bump the shadow-result/audit contract. Persisted synthetic results expose only
  the set/member IDs and hashes needed for replay; the audit validates exact
  keys, schema versions and equality with the trusted manifest/evaluation
  envelope. Remove the ambiguous `hashes.siteScenario` field rather than
  retaining a fallback.
- Bump the checkpoint schema and bind every checkpoint to the full
  `manifestSha256` in addition to manifest/run IDs. Checkpoint build/write,
  writer, resume, immutable audit and rollback accept only a complete validated
  schema-2 manifest and reject schema 1 before filesystem work.
- Replace the callback-based pointer CAS with a schema-2 API that accepts the
  complete next manifest and reads its exact persisted copy. The exact pointer
  contains only pointer schema/type, manifest ID, run ID and full
  `manifestSha256`. Existing pointer bytes are exact-validated before comparison;
  no caller-provided `verify` callback can authorize a run ID.
- Separately named historical schema-1 readers may inspect old manifests and
  pointers. No schema-1 object can be upgraded, resumed, rolled back, passed to
  the current writer, or advanced as the active schema-2 pointer.

**Live capability contract**

- Construct a frozen opaque capability whose live profile is held only in
  module-private weak storage. The capability has no enumerable profile, hash,
  identity or observation fields, no string session identifier, and a
  non-enumerable `toJSON` that throws.
- The evaluator receives the capability, resolves it by object identity, and
  never accepts a raw `real_site` profile. A clone, spread, parse/stringify
  result, reconstructed lookalike or cross-process object lacks the weak binding
  and is rejected.
- Keep the complete live evaluation, including observations, available operands,
  margins, intersections and witnesses, only in module-private weak storage.
  Return a separate opaque result with no enumerable values and only
  non-enumerable safe outcome/reason accessors. Spread, `Object.assign` and
  structured clone yield an unusable lookalike; JSON serialization throws. The
  in-memory auditor accepts only the original result/capability identities and
  never hashes a live profile or full live evaluation input.
- Live validation and evaluation failures are fixed-code errors with no input,
  value, hash, identifier, `cause` or interpolated detail. Error construction
  must not serialize or hash the rejected profile.
- All persistent entry points reject `LIVE_EPHEMERAL` before filesystem work:
  manifest creation/write, checkpoint build/write, resume, shadow audit
  materialization, rollback and latest-pointer advancement. No live input or
  result may appear under `data/**`, `deployment/**`, `public/**` or an external
  evidence root.

**Compatibility and ownership**

- Keep `fit-v4-baseline.json` byte-identical. Validate its predecessor hash and
  historical conflation witness by reading that frozen artifact rather than
  regenerating the witness through schema 2. Add one named private successor
  proof/test, bound to the predecessor's full hash, for corrected WP3 behavior.
  Pin the only allowed B0 failures by full test name and expected assertion:
  cutover route delta, cutover public-delta audit and migration-baseline
  deployment hash. Changed diagnostics or any additional failure fail the gate.
- Choose the non-evaluated cohort path now. Rename/type `SCENARIOS` as
  `COHORT_CASES`, use `caseSetId` and `cases`, remove `scenarioSetId`, and add a
  fixed non-evaluated artifact type. Update cohort generation/audit/tests and
  prove the scenario-set validator rejects the descriptor.
- Keep evaluation math and Fit outcome precedence unchanged. Rank schema 1 may
  continue to consume schema-1 results only. `fit-rank-v4.mjs` must reject a
  schema-2 result before hashing or reading scenario fields with typed stop
  `RANK_SCHEMA_V2_REQUIRED`; scenario-aware rank remains deferred to WP7A.

**WP3 RED order**

1. prove a one-member set is valid, while two synthetic profiles in one test
   share one set hash but have different member hashes, run IDs and replayable
   results;
2. reject foreign members, profile mutation, duplicate IDs/hashes, order drift,
   omitted members and extra keys; prove a fully rehashed mutation becomes a new
   set and cannot satisfy a run/resume/pointer pinned to the predecessor set;
3. prove run manifest, observation clock, evaluator, result and audit preserve
   the same set/member bindings with no scalar fallback;
4. prove checkpoints bind full manifest SHA-256; exact pointer CAS validates a
   persisted schema-2 manifest and rejects malformed pointer bytes, fabricated
   run IDs and caller callbacks;
5. prove schema-1 manifests, checkpoints and pointers remain historically
   readable but cannot resume, write, roll back or advance a current pointer;
6. prove live evaluation works only with the original capability and rejects a
   raw profile, clone, spread, reconstructed object and structured clone;
7. prove live capability/result enumeration is empty, safe accessors reveal no
   operands, spread/assignment/clone are unusable, JSON throws, errors are fixed
   and detail-free, and the live path invokes no site hash or persistent audit;
8. prove persistent manifest, checkpoint, audit, rollback and pointer APIs reject
   live mode before creating files, including when roots do not yet exist;
9. prove `consented_offline` is rejected by both WP3 constructors before hashing
   or persistence while its generic site-profile validator remains unchanged;
10. prove schema-2 rank stops with `RANK_SCHEMA_V2_REQUIRED`, the non-evaluated
    cohort descriptor cannot validate as a scenario set, the frozen baseline is
    byte-identical, the successor proof binds its full predecessor hash, and
    focused/source/non-public regression gates hold.

**Bounded write set**

- one new pure scenario-binding module;
- the existing run-manifest, shadow evaluator and result-audit modules;
- the existing shadow-audit runner and trusted evaluation fixture;
- the private pointer rehearsal in the cutover-candidate builder;
- `fit-rank-v4.mjs` only for the typed schema-2 stop;
- the shadow-cohort builder/auditor only for the explicit `COHORT_CASES` rename;
- focused WP3, run/pointer, rank, cohort, baseline and directly broken V4 tests;
- this plan checkpoint and one mandatory private successor migration-risk proof.

Do not add a database, generic capability framework, browser storage layer,
network dependency or public compatibility shim.

**Gate:** every persisted synthetic result proves set and member membership;
every live evaluation is non-exportable and non-restorable; `consented_offline`
cannot bypass either boundary; full relevant regression is green apart from the
three exactly named and diagnostic-pinned B0 drift assertions; the frozen
baseline bytes are unchanged; no public file, commit, push or deployment change.

### WP3 max-review checkpoint - 2026-08-09

- The first independent `gpt-5.6-sol` max audit returned `DRAFT`. It found that
  the plan lacked an independent predecessor identity for rehashed scenario
  sets, that current checkpoint/pointer APIs could not enforce schema-2-only
  activation, and that a nominally opaque live result would still enumerate raw
  household operands. It also found omitted rank, frozen-baseline and cohort
  consumers plus two unnecessary policy ambiguities.
- The revision closes those findings with one builder/selector authority path,
  full manifest hashes in checkpoints and exact pointers, schema-2-only current
  lifecycle APIs, weak-stored live evaluations with safe opaque results,
  detail-free errors, an explicit rank stop, a predecessor-bound successor
  proof, a non-evaluated cohort descriptor, object identity only for live
  comparison, and non-empty rather than two-member production sets.
- The same reviewer then performed a bounded closure review of only those
  findings and returned `READY` with no remaining P0/P1 findings. One
  `gpt-5.6-sol` medium TDD implementation is authorized within the stated write
  set; primary integration review remains mandatory.

### WP3 implementation checkpoint - 2026-08-09

- RED-first tests established the missing scenario authority, scalar set/member
  conflation, absent full-manifest checkpoint/pointer binding, missing opaque
  live APIs, old cohort descriptor and pre-replay rank stop. Each focused RED
  failed for the intended missing or legacy behavior before its implementation.
- One pure scenario-binding module now builds and exact-validates immutable
  synthetic sets and selects one member into a derived
  `PERSISTED_SYNTHETIC` envelope. Run manifest, observation clock, evaluator,
  result and result audit preserve the same set/member IDs and hashes; raw
  profiles and scalar hash fallbacks are rejected.
- Current manifests, checkpoints, writers, resume, rollback and pointers are
  schema 2 only. Checkpoints and exact five-field pointers bind the full
  `manifestSha256`; pointer CAS reads the exact persisted manifest and has no
  caller verification callback. Separately named schema-1 readers are
  inspection only.
- Live profiles and full evaluations are weak-stored. Capabilities and results
  enumerate no values, reject JSON serialization, expose only safe outcome and
  reason accessors, and reject clones or lookalikes by object identity. Live and
  `consented_offline` inputs are rejected with fixed codes before persistence
  or filesystem work.
- Rank schema 1 stops on schema-2 results with
  `RANK_SCHEMA_V2_REQUIRED` before replay, hashing or scenario-field access.
  The cohort descriptor is now fixed non-evaluated `COHORT_CASES` with
  `caseSetId`/`cases`, and cannot validate as a scenario set.
- The frozen predecessor baseline remains byte-identical at SHA-256
  `4c13f4bdbcdba079e874b880f2c67f979009ed9759ffc0597492e1d8a3154aa3`.
  The private successor proof binds that full hash and verifies corrected WP3
  set/member and rank-stop behavior without regenerating the historical
  conflation witness through schema 2.
- Primary integration review made the run manifest self-contained by embedding
  the exact scenario-set predecessor and selected member, rejected duplicate
  caller authority, deep-validated historical schema-1 manifests, marked both
  live results and live audit results as non-persistable, and froze the legacy
  baseline builder behind `FIT_V4_BASELINE_FROZEN_USE_SUCCESSOR_PROOF`.
- Pointer activation now requires the persisted run's completed PASS
  `shadow-audit.json` plus its schema-2 checkpoint before the shadow root is
  created. The checkpoint binds the exact audit input and bytes; the activation
  validator rejects empty/forged summaries, incomplete binding checks,
  self-rehashed IDs and any structure the production auditor cannot emit.
- Focused WP3 suites pass `80/80`. The diagnostic B0 group passes `10/13` and
  retains exactly the same three registered failures by full test name:
  cutover route delta, cutover public-delta audit and migration-baseline
  deployment hash. The complete Architecture V2 run executed `1,636` tests:
  `1,633` passed and only those three failed. `npm run lint`, schema validation
  (`2,330` pages and `6,145` blocks), explicit module syntax checks and
  `git diff --check` pass.
- `public/**`, the frozen baseline bytes, rights state, B2, B3A and WP4A were not
  modified. The frozen baseline file remains
  `4c13f4bdbcdba079e874b880f2c67f979009ed9759ffc0597492e1d8a3154aa3`.
  No commit, push, deployment or external-service action occurred. B1 remains
  rights-blocked, so B2, B3A and WP4A remain closed.

### WP0B-B1 integration and generation-replay checkpoint - 2026-08-10

- Primary integration review rejected the first implementation as complete.
  The production gate had no success path, authenticated decisions did not
  enforce their exact dependency path scope, attribution reachability was a
  caller boolean, the withdrawal head was a zero placeholder, and
  `fit-check`, cavity and doorway families were omitted from conservative
  generated-source classification.
- TDD now proves a fully bound production fixture can pass the same CLI gate,
  while the real repository remains blocked. Decisions bind the exact action,
  inventory and dependency path-set hash; attribution requires exact published
  bytes plus a route-validation receipt hash; the gate binds provenance,
  authority set, decision registry, review, manifest, attribution, clock and
  withdrawal identities. Case/Unicode manifest collisions and malformed dates,
  authorities and classification coverage fail closed.
- Generated-provenance receipts now bind output bytes, producer, helper tools,
  fonts and direct inputs. Repository validation requires every bound file to
  be a clean tracked regular file with the declared SHA-256. A generated input
  without its own receipt leaves every derivative blocked; a downstream
  receipt cannot hide a missing upstream generation chain.
- The corrected complete inventory remains `3,281` files with
  `staticSourceInventoryId`
  `3db88b158d21fd7dabedc73c0623763f75a42e72a7b57f61627330f119b196ef`.
  The conservative provenance-required set is now `3,217`: 2,345 generated
  retail/catalog presentation files, 870 generated OG files, and the two
  first-party-classified generated outputs `public/scripts/fit-engine.js` and
  `public/service-worker.js`.
- An isolated replay from source commit
  `651401a31fb16e3eeb077a252054bd066153bb48` reproduced 2,306 page-family
  files byte-for-byte: products 1,739, brands 291, compare 141, cavity 62,
  doorway 32 and location 41. Their baseline/replay family tree hashes were
  identical. A second source-only replay also reproduced `pages/products.html`,
  all six `pages/guides/**` outputs, 13 public data outputs and the vendored
  `public/scripts/fit-engine.js`.
- The replay builder now emits 2,327 exact content-bound receipts and leaves
  890 provenance-required outputs unresolved. Product pages, the product index
  and doorway pages have complete generation chains, although their publication
  rights decisions remain absent. Brand, compare, cavity, location and guide
  receipts remain transitively blocked by unproved `public/data/clearance.json`
  and/or `public/data/brands/metadata.json` inputs.
- The replay still rejects both high-drift generated families. All 10
  `pages/fit-check/**` outputs drifted: one changed in place, nine predecessor
  paths disappeared and nine successor paths appeared. All 870 OG outputs
  drifted: 760 changed in place, 110 predecessor paths disappeared and 110
  successor paths appeared. No receipt may be issued for either family until
  their output-generation state is reconciled or a reviewed successor inventory
  deliberately replaces the predecessor bytes.
- `public/sitemap.xml`, `public/image-sitemap.xml` and `public/rss.xml` also
  drifted. `public/service-worker.js` was byte-identical only because its
  generator read the predecessor cache version from that same output, so it is
  intentionally left without a receipt until B2 binds the version as an
  independent input. Six other public data/source outputs remain unproved.
- Two complete builder/review runs produced identical artifact hashes:
  provenance `cd6ffcbed0256bbac4f185a21b112725a03d0a5461cb6849f9927e1f23ad5f4a`,
  inventory `c4d029f198d7e385060930c34f10170578036879dda439fa5e56318a5de3aa1a`,
  review `3e91e0974632d1ba8e8af6f22f5ae68115270218d8db512daf10414cea3d00cc`
  and blocked manifest
  `28b27e08f590b8765dcd1ee2625c8f469cffa8888cecbd3fdef6162bc4b23bd4`.
- The real review remains a zero-row `BLOCKED` manifest. Current global/action
  blockers include missing production trust-root enrollment, an unestablished
  withdrawal head, missing first-party/Google/Outfit/web-vitals/retailer-feed
  decisions, 890 missing generated receipts and the two transitive public-data
  blockers. No production key, attestation, campaign permission, public
  activation, commit, push or deployment was created. The B0 schema-2 toolchain
  successor now binds the final seven executable/configuration paths for this
  slice, and its materializer/route/toolchain suite passes 14/14. B1 is not
  complete, so B2, B3A and WP4A remain closed by the existing dependency DAG.
- Final verification for this slice passes all 50 focused B0/B1/Vercel tests,
  lint, syntax checks, schema validation (`2,330` pages, `6,145` blocks, zero
  errors) and `git diff --check`. The complete Architecture V2 run remains
  `1,633/1,636`, with exactly the three previously registered B0 diagnostic
  failures and no new regression. The real rights gate exits nonzero with
  `PRODUCTION_TRUST_ROOT_NOT_ENROLLED`; `build:deploy` stops at
  `SOURCE_MANIFEST_BLOCKED` before creating `dist/`. `public/**` has no worktree
  change, `.deployment-private` is absent, and the frozen baseline remains
  `4c13f4bdbcdba079e874b880f2c67f979009ed9759ffc0597492e1d8a3154aa3`.
- The next valid transition is B1 step 8-9: retain the exact private evidence
  for first-party ownership, Google verification, Outfit, web-vitals, Energy
  Rating and the active Partnerize campaign; then present the scoped trust-root,
  production-authority and rights decisions for detached owner signing. The
  implementation must not synthesize those decisions or start B2 while the
  production registry and trust root remain empty.

**B1 owner-enrollment checkpoint (2026-08-10)**

- The owner explicitly authorized creation of the out-of-repository production
  trust root and enrollment of one FitAppliance rights-review issuer. The
  Ed25519 trust-root public injection is retained read-only at
  `$HOME/.fitappliance/static-rights/production/trust-root.json`; the active
  reviewer private key remains outside Git with mode `0600`. The owner-root
  private key was removed from the active local directory and placed in cold
  storage at
  `/Volumes/UGREEN-1TB/FitAppliance/private/static-rights/owner-root/`.
- `deployment/static-publication-authorities.json` now contains only the
  production reviewer public key, required role/action and the detached owner
  signature over authority-set hash
  `b5671ef404bdb935e44ee539c400807287baee1fa7731d9311604935cae00510`.
  Real validation succeeds with issuer `FITAPPLIANCE_RIGHTS_REVIEWER`; no real
  private key is present in the repository.
- The real gate advances from `PRODUCTION_TRUST_ROOT_NOT_ENROLLED` to
  `WITHDRAWAL_HEAD_NOT_ESTABLISHED`. This is progress, not B1 approval. No
  rights decision, campaign permission, withdrawal head, authorization,
  materialization, commit, push or deployment was created. The next step is to
  retain and replay exact evidence for each dependency, establish a verifiable
  withdrawal-log genesis, and ask for the final scoped signing approval only
  after the evidence packet is complete.

**B1 evidence, attribution and withdrawal checkpoint (2026-08-10)**

- The active Partnerize/The Good Guys campaign terms were downloaded through
  the authenticated publisher account and retained outside Git with SHA-256
  `e1f925d8881d0c568e9277cc3daf012c19bba2e77bf514140894928aedf7a358`.
  The acknowledgement control was not selected. The terms allow affiliate
  links and supplied licensed materials but do not expressly authorize caching
  and public redistribution of the complete product feed. `RETAILER_FEED`
  therefore remains blocked pending written permission; a private clarification
  draft exists but has not been sent.
- The real Partnerize source policy no longer claims an authorized feed. It is
  `collection_blocked` with `FEED_RIGHTS_REVIEW_BLOCKED`; authorized fixture
  copies preserve acquisition positive-path tests. The focused acquisition,
  lifecycle, shadow, coverage and observation regression set passes `35/35`.
- Exact public evidence is retained outside Git for Google HTML verification,
  `web-vitals` 4.2.4 Apache-2.0, Outfit OFL 1.1, Energy Rating package metadata
  and CC BY 3.0 AU. Public licence copies and one discoverable credits route are
  now present in the worktree. Energy Rating attribution names the Department
  of Climate Change, Energy, the Environment and Water and links the exact
  dataset and licence. Route receipts remain pending the final materialized
  inventory.
- Classification no longer adds `RETAILER_FEED` to the five exact
  `public/data/replacement-reference/**` outputs or first-party
  `public/data/ui-copy.json` after their complete receipts prove narrower
  sources. Against the predecessor inventory, retailer-feed scope falls from
  `3,215` to `3,209` paths; the five government outputs resolve only to
  `ENERGY_RATING_CC_BY` plus `FIRST_PARTY`. Other generated catalog paths stay
  conservatively feed-bound.
- A signed append-only withdrawal-log contract is now enforced. Every head
  binds the exact prior head and event prefix; every event binds its prior head,
  withdrawn decision, dependency, evidence, effective time and reviewer
  signature. Missing logs, random nonzero heads, omitted events, tampering and
  signer drift fail closed. Fixture genesis, successor and production-gate
  tests pass. The production genesis candidate hash is
  `cef60f7d2836e14449aff2ab7a9384ca03ef2b698ea1a2dee4171acd390a08c8`,
  retained outside Git with a null signature until explicit approval.
- A six-dependency private decision packet is retained with draft hash
  `84b2efb55f77e91342b0326c94541b26e114fb1c0c4b1a3c318fcfe619daf2f6`.
  Google, web-vitals, Outfit and Energy Rating have evidence candidates;
  `FIRST_PARTY` still needs an exact owner attestation and `RETAILER_FEED` is
  blocked. Final scope hashes, route receipts, decision signatures and the
  authorization cannot be created before the intended static changes are
  committed and a clean Git-bound inventory is regenerated.
- The complete static route audit exposed two pre-existing redirects whose
  destinations did not exist: the Smeg/Miele comparison alias and five
  Panasonic NR-TC221BUSA fit-check aliases. They now terminate at the existing
  exact comparison page and the Panasonic fridge page that contains the exact
  model. A full copied-static-tree replay resolves all `2,428` discovered,
  explicit and sitemap routes to `STATIC_2XX` or a declared function with zero
  accidental 404s. The B0 toolchain contract binds the corrected
  `vercel.json` and the final rights/gate modules by their new exact hashes.
- Attribution route receipts are no longer accepted merely because they carry
  a syntactically valid configuration hash. Both registry validation and the
  direct publication gate require the receipt to bind the exact active
  `vercel.json` SHA-256; the materializer's full route-resolution pass remains
  the independent terminal-reachability gate.
- This closure slice passes `74/74` focused static-rights, materializer,
  provenance, Vercel and retailer-policy tests. Lint, module syntax, JSON
  parsing and schema validation also pass (`2,331` pages, `6,145` blocks, zero
  errors), and `git diff --check` is clean. The real inventory command remains
  intentionally blocked while eligible static changes are untracked; this is
  the required clean-Git source-set guard, not a test exception.
- No production withdrawal signature, rights decision, Partnerize
  acknowledgement, email, commit, push, deployment or activation occurred.
  B1 remains blocked; B2 and later public migration work remain closed.

### WP0B-B1 private-feed isolation and worker-handoff checkpoint - 2026-08-10

- The owner decided that Partnerize/The Good Guys feed data is private internal
  evidence only. It must not be redistributed, named as a public publication
  dependency or included in a production signing scope. The reviewed private
  source policy is `PRIVATE_EVIDENCE_ONLY`; public projection sanitization is
  the only approved path from a feed-observed product to public catalog state.
- The current lifecycle shadow contains 3,515 canonical products, a cleaned
  legacy-current baseline of 1,348, 121 `CURRENT_RETAIL` products, 703 excluded
  Partnerize observations and 12 unresolved legacy-current products. Cutover
  remains correctly `BLOCKED`. The active public projection contains 3,513
  products and exposes 117 as `CURRENT_RETAIL`; it does not promote the blocked
  shadow candidate.
- The sanitizer-bound provenance chain is now exact and transitive. The current
  B1 review covers 3,284 static source objects; zero review rows and zero
  blockers contain `RETAILER_FEED`. Replay produced 3,211 exact receipts and
  only `public/service-worker.js` remains unresolved. The inventory ID is
  `3ea5e6176e17db7b915dd0aa39727ed004826b1253d4449eb0ba6a9b07e3b5a7`;
  rights review ID is
  `dafaba416586acca6fbd1a90debf60f1fb6b5cce7f89569ac6faf460a92f2922`.
- The remaining production blockers are the worker provenance handoff, signed
  decisions for `FIRST_PARTY`, `GOOGLE_VERIFICATION`,
  `WEB_VITALS_APACHE_2`, `OUTFIT_FONT` and `ENERGY_RATING_CC_BY`, trust-root
  enrollment in the active gate input, and signed withdrawal genesis. The real
  gate exits nonzero at `PRODUCTION_TRUST_ROOT_NOT_ENROLLED`; this is required
  failure-closed behavior, not B1 completion.
- Public-boundary audit passes 19 workflows and 2,331 public artifacts with no
  violations. Schema validation passes 2,331 pages, 5,963 structured-data
  blocks and zero errors. The complete deployment-static suite passes 47/47;
  the current toolchain seal is commit `5ab770051` after the private-feed and
  replay-family closures in commits `949791697` through `3e25ed23c`.
- A dependency-cycle audit found that the prior plan required B1 to authorize
  tracked `public/service-worker.js`, required B2 to replace it with a worker
  generated from an independent release identity, and prohibited B2 until B1
  passed. The corrected contract treats the tracked worker only as a B2 legacy
  RED witness: it is excluded from the B1 source inventory and manifest, B1
  alone is never deployable, B2 generates and receipts the worker in private
  staging, and B3 rejects any output without both the B1 authorization and B2
  worker receipt.
- Because this changes a deployment dependency boundary, the plan returns to
  `DRAFT` until one independent `gpt-5.6-sol` max review closes the revised
  B1/B2/B3 sequence. After that review, one medium implementation slice must
  first add RED tests for worker exclusion and incomplete-output rejection,
  then make the smallest source-inventory/materializer change. Production
  signing, B3A, preview, push and deployment remain prohibited.

**Max-audit disposition:** the independent review returned `NOT_READY` with
three P0 and three P1 findings. Primary closure incorporated each finding
without starting a second reviewer/fixer loop:

| Finding | Contract correction |
| --- | --- |
| P0 stale/cross-build worker can pair with B1 | `workerGenerationReceiptId` binds the exact B1 authorization, toolchain, source/generation/release IDs, worker bytes, predecessor and coverage manifest; B3 compares every field. |
| P0 self-referential application generation | Added pre-stamp `applicationSourceId`; `applicationGenerationId` hashes a structured generation manifest, while B3 alone hashes marker-stamped output bytes. |
| P0 private-feed rules contradicted zero public dependency | Raw/copy feed material is permanently forbidden; only the closed `PRIVATE_TO_PUBLIC_LIFECYCLE_DECLASSIFICATION_V1` sanitizer contract can emit first-party coarse lifecycle state, with paired non-leakage tests and fail-closed schema/tool checks. |
| P1 B3 did not consume B2 explicitly | B3 now materializes B1 without a worker, validates/regenerates the exact B2 receipt, composes one worker into the absent path, then runs Vercel and hashes the complete result. |
| P1 normative count was stale | Eligible count is dynamically derived; snapshot counts are diagnostics and cannot authorize a fixture or manifest. |
| P1 B5 predecessor could differ from worker cache set | Any fresh-predecessor mismatch invalidates B2, B3B, B4 and owner authorization and forces the complete regeneration sequence. |

The corrected normative DAG and work-package text have no remaining known
dependency cycle. This primary disposition changes status from `DRAFT` to
`READY_FOR_B1_WORKER_EXCLUSION_SLICE` only. It does not authorize production
signing, real B2 worker generation, B3A, preview, push, deployment or
activation.

### WP0B-B1 worker-exclusion implementation checkpoint - 2026-08-10

- One bounded `gpt-5.6-sol` medium agent implemented the exact worker boundary
  with TDD. RED recorded three rights-test failures and one materializer failure;
  GREEN passed the two focused files 41/41. Primary review rejected and restored
  one attempted weakening of the real-repository review/gate integration test,
  then strengthened its terminal assertions to require zero unresolved outputs,
  no worker review row and no missing-provenance blocker.
- B1 inventory and materializer eligibility now exclude only the exact tracked
  `public/service-worker.js` witness. The witness cannot enter a schema-2 source
  manifest; another public path, including `public/service-worker.js.map`, still
  causes ordinary source-set drift. The worker bytes themselves were not
  changed. The two changed executable hashes are resealed in the B0 toolchain
  contract.
- The clean replay now emits 3,211 content-bound receipts with zero unresolved
  outputs. The B1 inventory and rights review each contain 3,283 rows, no worker
  row, no `GENERATED_PROVENANCE_MISSING`, and zero `RETAILER_FEED` rows or
  blockers. Inventory ID is
  `8ef9c64b370ca7c85c1267f48d861ed01c63aa8bc4ee696084642bf7bd86f791`;
  rights review ID is
  `018d4e645c73e017f0ecd5ed98efe9330571eba1d2bd1e6e277b9fbf975fa0b7`.
- Exact generated artifact file hashes are: provenance
  `d455ee96104933bd00b745291f5670f9e496773b0bd150fd352ab317532d8135`,
  inventory
  `d19cc0f51f3a08b8dd08851148960db5dc90eff3f6133a038acab28380fbd3e8`,
  review
  `a3060d52474ab964c8ccfa9beae620a13eb4df035a260d807a4dd7c596d9099a`
  and blocked manifest
  `74b6c5c4c09f1a2ffbcf716330312bc1e8ae2a6ba576305ea64ca2a8a5e6deb3`.
- The complete deployment-static suite passes 48/48, including the retained
  real-repository review/gate test. Lint passes; publication-boundary audit
  passes 19 workflows and 2,331 public artifacts; schema validation passes
  2,331 pages, 5,963 blocks and zero errors; `git diff --check` passes.
- The production trust-root public file is present read-only at the documented
  external path. Injecting it advances the real gate from
  `PRODUCTION_TRUST_ROOT_NOT_ENROLLED` to `WITHDRAWAL_HEAD_NOT_ESTABLISHED`.
  B1 therefore still needs the signed withdrawal genesis, the five scoped
  decisions (`FIRST_PARTY`, `GOOGLE_VERIFICATION`,
  `WEB_VITALS_APACHE_2`, `OUTFIT_FONT`, `ENERGY_RATING_CC_BY`), final route
  receipts and detached publication authorization. `RETAILER_FEED` is excluded
  from that signing packet.
- No private key was read, no signature was created, and no Partnerize browser
  state, feed download, public worker generation, B3 build, push, deployment or
  activation occurred. The next code slice may implement only B2's fixture
  protocol/receipt contract; real worker generation remains blocked on B1.

### WP0B-B2 fixture-protocol implementation checkpoint - 2026-08-10

- One bounded `gpt-5.6-sol` medium implementation slice built the pure B2
  protocol and fixture tests only. Its first RED proved the module did not
  exist; its initial GREEN passed 11/11. Primary review then added six failing
  adversarial assertions for unversioned artifacts, ambiguous duplicate binding
  paths, non-namespaced cache deletion, impossible activation state and unsafe
  cache-version input. The minimum implementation now passes all 11/11.
- `applicationSourceId`, `applicationGenerationId` and
  `workerGenerationReceiptId` are separate schema-1 identities. The source ID
  binds canonical pre-stamp path/hash rows and rejects the tracked worker; the
  generation ID binds the closed release inputs without hashing marker-stamped
  bytes; the worker receipt binds the B1 authorization, toolchain, source and
  generation identities, active retail release, exact worker/producer/tool/input
  bytes, predecessor, cache protocol and coverage manifest.
- B3 fixture composition accepts only the exact generated worker bytes and
  receipt and rejects reuse of the tracked legacy witness. The generation
  handshake fails closed on absent or mixed page, worker or Fit-resource
  identities. Cache retention owns only the explicit
  `fitappliance-app-shell-*`, `fitappliance-data-*` and
  `fitappliance-static-*` namespaces, preserves both current and predecessor
  versions, never deletes after failed install/activation and cannot delete a
  generic third-party cache.
- The legacy PWA characterization suite passes 25/25, proving this slice did not
  change the tracked worker, registration or current cache behavior. The B2
  module is syntax-valid and the focused fixture protocol is deterministic.
- This reaches `B2_PROTOCOL_READY` only. `B2_GENERATION_READY`, B3A and every
  preview or release action remain blocked until B1 has a signed withdrawal
  genesis, the five scoped rights decisions, final route receipts and detached
  static-publication authorization. Partnerize remains private internal
  evidence, is excluded from that signing packet and was not accessed here.
  No private key was read, no signature was created, and no real worker,
  production output, push, deployment or activation was produced.

### WP0B-B1 unsigned signing-candidate checkpoint - 2026-08-10

- The real B1 inventory remains fixed at 3,283 eligible static rows. Generated
  provenance replay binds 3,211 receipts, with zero unresolved outputs, zero
  public `RETAILER_FEED` rows and zero public-source blockers. The final
  inventory ID remains
  `8ef9c64b370ca7c85c1267f48d861ed01c63aa8bc4ee696084642bf7bd86f791`.
- The earlier free-form draft could not be used because it retained a private
  retailer-feed dependency and did not bind the final inventory. The first
  schema-1 candidate at
  `2026-08-10-b1-signing-candidate.json` is also superseded by the hardened
  schema below. Both files are retained as private audit history and must not
  be signed.
- The hardened unsigned candidate is stored outside Git at
  `/Volumes/UGREEN-1TB/FitAppliance/private/static-rights/decision-packets/2026-08-10-b1-signing-candidate-v2.json`.
  It has candidate ID
  `a794b630f2731b2b38e91a033c65ba865bb65f46f6087321df50e016adaf0b81`,
  mode `0600`, one link, and deterministic repeat generation. Its bound
  toolchain hash is
  `56da5dbd6165d0915910cefa39b7c1bb68387ac6c82300bb10a3d537b38662ac`;
  its generator hash is
  `970947f8ad2e024d40953c4f43fb421b42df94fef401d3b9a9d68817feeff4e1`.
- Candidate construction replays the exact five public dependencies only:
  `FIRST_PARTY`, `GOOGLE_VERIFICATION`, `WEB_VITALS_APACHE_2`,
  `OUTFIT_FONT` and `ENERGY_RATING_CC_BY`. It binds exact official evidence
  bytes, capture checks, Git-bound generated provenance, route receipts and
  fixed attribution targets. Missing, changed, symlinked or substituted
  evidence fails closed. Partnerize, The Good Guys and retailer-feed URLs are
  absent; `RETAILER_FEED` appears only in the forbidden-source constraint.
- Owner attestation is no longer arbitrary text. It is a separately signed,
  canonical schema-1 assertion for `PRODUCTION`,
  `PUBLIC_STATIC_DISTRIBUTION`, `FIRST_PARTY`, the exact inventory, scope and
  source-object hashes. Its public root must also be enrolled by the production
  authority root. The generator reads no private key and creates no signature.
- One focused `gpt-5.6-sol` max audit returned six P1 findings: provenance was
  not replayed from repository bytes, owner attestation was under-bound,
  attribution mappings were caller-controlled, generated routes were too
  permissive, evidence paths could traverse symlinks, and private output writes
  lacked complete inode/link durability checks. Primary remediation closed all
  six with adversarial tests. The withdrawal payload is also fixed to schema 1
  with exact array validation.
- Full route replay found three dangling Vercel comparison aliases. They now
  redirect only to existing reviewed pages. The sole deferred generated route
  is the exact B2 handoff `/service-worker.js` to
  `public/service-worker.js`; arbitrary generated routes remain rejected and
  are labelled `DEFERRED_B2_ARTIFACT`, not published artifacts.
- Final verification passes 87/87 focused static-rights, materializer, route,
  PWA and service-worker tests; lint and syntax/JSON checks pass; publication
  boundary audit reports 19 workflows and 2,331 public artifacts with no
  violations. Candidate regeneration is byte-identical. The live production
  gate still exits nonzero at `WITHDRAWAL_HEAD_NOT_ESTABLISHED`.
- This checkpoint is intentionally `BLOCKED_OWNER_ATTESTATION`. Advancing B1
  requires a cold-owner-root-signed attestation for this exact candidate,
  followed by a separate explicit authorization to sign withdrawal genesis,
  five scoped rights decisions and detached publication authorization. No
  private key, signature, push, deployment or activation is authorized here.
- Partnerize is authorized only as private internal evidence. The Chrome
  extension currently redirects its attached tab to the Partnerize login page,
  so no browser feed was accessed in this slice. Login state is not a B1
  dependency and must never be used to weaken the public-source gate.

### WP0B-B1 pinned owner-attestation request checkpoint - 2026-08-11

- The schema-1 candidate, hardened candidate v2, candidate v3 and owner request
  v1 are superseded private audit history. None may be signed, promoted or used
  as an authorization input. Candidate v3 and request v1 exposed three P1
  design gaps found by the final `gpt-5.6-sol` max review: a caller could supply
  a self-consistent substitute candidate, the owner root was not independently
  pinned, and the owner signature covered only the FIRST_PARTY inventory tuple
  rather than every release-affecting binding.
- The replacement path now replays the unsigned candidate from the current
  repository, public evidence manifest and withdrawal draft, then requires
  exact canonical byte equality with the candidate presented for signing. A
  tracked production trust anchor pins the owner root ID, Ed25519 public-key
  fingerprint and PEM hash, owner metadata hash, trust-root hash and exact
  authority-set enrollment hash. The trust anchor and both request/candidate
  generators are bound by `deployment/toolchain-contract.json`.
- Owner attestation schema 2 signs the exact candidate ID and byte hash,
  authority-set ID and byte hash, inventory/scope/source-object hashes,
  trust-anchor hash, toolchain/generator/route hashes, public evidence manifest
  hash, withdrawal genesis hash and a maximum 24-hour issue/expiry window. A
  signature cannot be reused after any of those values drift. Input reads reject
  symlinked ancestors, link-count or inode changes, and size/mtime/ctime changes
  during the read.
- The current unsigned candidate is retained outside Git at
  `/Volumes/UGREEN-1TB/FitAppliance/private/static-rights/decision-packets/2026-08-11-b1-signing-candidate-v4.json`.
  It has candidate ID
  `0d8fdeeeb183960ef9b25f5ec0a6f1c388059d84a06fc5b86b4cceb5d032c1da`,
  file SHA-256
  `2e8e514f87be28094f978dcfb7877a99da44da5e000b595357b4a2c1844123ce`,
  mode `0600`, one link and status `BLOCKED_OWNER_ATTESTATION`. Repeated
  generation produced the same ID and bytes.
- The matching unsigned request is retained outside Git at
  `/Volumes/UGREEN-1TB/FitAppliance/private/static-rights/decision-packets/2026-08-11-owner-attestation-request-v2.json`.
  It has request ID
  `be5632fec30e7914137cfaa62d05b120e9839ceea9e995775e576d23ce8c2564`,
  file SHA-256
  `5adf7f47c7fe91d13f62029e8190a50d87f6c2f2b03e644ad999552e939222ad`,
  mode `0600`, one link and state `UNSIGNED`. It expires at
  `2026-08-11T16:25:00.000Z`; after expiry it must be regenerated from the
  then-current repository and must not be signed retroactively.
- The adversarial suite covers candidate substitution, semantic and dependency
  drift, private-feed markers, root/anchor/enrollment substitution, signature
  reuse, expiry, symlink ancestors, hardlinks, unsafe permissions and unstable
  reads. The selected regression suite passes 97/97. Lint passes; schema
  validation reports 2,331 pages, 5,963 blocks and zero errors; publication
  boundary audit reports 19 workflows and 2,331 public artifacts with no
  violations. The production gate still exits nonzero at
  `WITHDRAWAL_HEAD_NOT_ESTABLISHED`.
- The owner's confirmation authorizes continued preparation only. No cold
  private key was read, no owner or production signature was produced, and no
  push, deployment, promotion or activation occurred. Partnerize remains
  private internal evidence only: it is absent from the candidate and request,
  excluded from public output and excluded from every static-publication
  signing dependency.

### WP0B-B1 offline owner-signer implementation plan - 2026-08-11

**Status:** `FROZEN_AFTER_MAX_REVIEW`. This slice prepares a bounded offline
signer and a one-time acceptance protocol. It does not authorize or perform a
production signature. The 2026-08-11 max review found one P0 and four P1
defects in the draft; every finding is incorporated below.

1. Use a one-time acceptance receipt, not descendant expiry. An owner
   attestation is valid only while `issuedAt <= trustedNow < expiresAt` and may
   be consumed once into an immutable acceptance receipt for the exact request
   and candidate. The acceptance process captures `acceptedAt` from the system
   clock, rechecks the clock immediately before durable publication, and binds
   request ID, attestation hash, candidate ID, `issuedAt`, `expiresAt` and
   `acceptedAt` into the successor candidate. Once that receipt is durably
   accepted before expiry, descendants bind its ID and bytes and do not revive
   or backdate the short-lived attestation. Remove production
   `--owner-attestation-as-of`; test-only clocks stay dependency-injected below
   the CLI. Exact-expiry, rollback, backdating and expiry-between-validation-
   and-commit all fail closed.
2. Extract a pure owner-request contract module. It owns exact schema keys,
   canonicalization, semantic IDs and strict schema-3 request validation, and
   imports no candidate replay, deployment, filesystem, network, browser,
   dynamic-import or subprocess code. The online request generator and offline
   signer both depend on this pure module; the signer never imports the online
   generator. Schema-2 requests remain parseable only for an explicit
   `UNSUPPORTED_SUPERSEDED_REQUEST` result and can never be upgraded or signed.
3. Add a minimal offline-signer contract. It binds exact bytes for the signer,
   pure validator/canonicalizer and tracked trust anchor, plus the exact Node
   runtime version. The request and attestation schema bind this contract ID
   and byte hash. The signer verifies the contract, its own source, dependency
   hashes, runtime and trust-anchor bytes before opening the private key. Bump
   the B0 executable binding set to version 2 while retaining read-only
   validation of historical version 1. The dependency graph stays acyclic:
   online replay -> pure contract <- offline signer.
4. Add one offline owner-attestation signer. Its production CLI accepts only
   the schema-3 request, pinned trust anchor, offline-signer contract, owner
   metadata, owner public key, cold owner private key, absent output path,
   exact expected request ID, exact expected candidate ID and literal token
   `SIGN_EXACT_OWNER_ATTESTATION`. It rejects preload, inspector and dynamic
   loader options. The production wrapper disables core dumps and runs with an
   OS-level network-denial and child-process-denial boundary. The signer and
   its transitive import graph are statically allowlisted and forbid network,
   browser, shell, `child_process` and dynamic imports.
5. Harden all signer I/O rather than reuse the existing direct writer. Traverse
   inputs without following symlinks, hold and compare parent directory
   descriptors, require private owner-only ancestors, regular single-link
   `0600` files, and compare inode, link count, size, mtime and ctime before and
   after reads. Publish complete canonical bytes through a same-directory
   owner-only temporary file, fsync the file, atomically link it to an absent
   final path without clobbering, fsync the parent, remove only the temporary
   inode created by this process, then fsync the parent again. Any existing
   output fails before key access. Injected tests replace ancestors, race
   concurrent writers and fail every open/write/fsync/link/cleanup boundary.
6. Finish every non-secret check before key access: request, authorization
   token, expected IDs, clock, absent output, output parent, anchor, metadata,
   public key, signer contract, runtime and import closure. Opening the private
   key is the final pre-sign operation. Accept only canonical unencrypted
   Ed25519; derive and match its public key against the independent anchor and
   metadata. Recheck time before signing and again before durable publication.
   Every rejected precondition must prove the key reader and signer were not
   called. Zero caller-owned key buffers in `finally`, never export the
   `KeyObject`, and document that internal key memory lasts for the deliberately
   short signer process lifetime and cannot be promised zeroized by Node.
7. Sign only the request's already-bound payload and emit exactly canonical
   `{payload, signature}` bytes. Output and diagnostics exclude private-key
   bytes and paths, request paths, Partnerize data and unrelated metadata.
   Production key media stays absent from implementation and regression runs.
   A real signing invocation remains forbidden without a new action-time user
   authorization naming the exact request ID, candidate ID and output path.
8. TDD covers ephemeral Ed25519 success; schema and canonical-byte failures;
   request/candidate confirmation mismatch; semantic and nested binding drift;
   old, expired and future requests; backdated production CLI attempts; signer
   and dependency drift; Node runtime drift; anchor, metadata, public/private
   key and trust-root substitution; non-Ed25519 and encrypted keys; unsafe and
   racing paths; partial writes and crash points; fail-before-secret-read; and
   absence of secret material in output/errors. Production keys are never read.
9. Implement the separate one-time acceptance command and receipt tests before
   declaring the signer usable. It validates the detached attestation with the
   current system clock, writes the immutable acceptance receipt atomically,
   and makes candidate generation consume that receipt rather than an
   arbitrary caller timestamp. No signed attestation alone may advance B1.
10. After hashes settle, bind every new executable and contract in B0,
    supersede candidate v4/request v2, generate unsigned candidate v5 and
    schema-3 request v3 twice, and retain older files as `MUST_NOT_SIGN` audit
    history. Run focused/adversarial rights tests, selected B0/B1/B2 and PWA
    regression, lint, schema validation, publication-boundary audit, syntax and
    exact toolchain replay. The production gate must remain nonzero at
    `WITHDRAWAL_HEAD_NOT_ESTABLISHED`. Commit locally only; do not push, deploy,
    promote or activate.

**Exit:** signer, one-time acceptance implementation and unsigned v5/v3
preparation are complete; no production secret was read. The next external
transition is a separately confirmed owner-signing action followed by bounded
acceptance before expiry. Even a valid acceptance receipt does not approve B1:
withdrawal genesis, five reviewer decisions, the approved manifest and
detached static publication authorization remain subsequent signed artifacts.

### WP0B-B1 offline owner-signer implementation checkpoint - 2026-08-11

**Status:** `IMPLEMENTED_UNSIGNED_AWAITING_FINAL_VERIFICATION`. The pure
schema-3 request contract, exact-runtime offline signer contract, hardened
no-clobber I/O, production wrapper, one-time acceptance receipt and schema-3
successor candidate path are implemented. B0 executable bindings are version
2; version 1 is historical read-only. Production candidate generation rejects
the superseded direct attestation and caller-supplied as-of paths.

The wrapper verifies the host controls before use, disables core dumps, denies
network through `sandbox-exec`, denies child processes through Node permission
mode, and grants read access only to the four signer-closure modules plus the
exact caller-supplied inputs. No production owner private key was located,
opened, inspected or used, and no signing action occurred.

The current unsigned chain is:

- candidate v7: `5e2e49e04852d507bb1c56533beb558373c46d71c5d5c02987de704f74f2a8e8`,
  SHA-256 `cc839b30a4f81eb1c5b4e3c1aeca18cdac4bde01ef105b7412855840ba324c1a`;
- request v5: `9917471c523f412ee94c3db476c2c8c339af1dabf39226ac61f7e5b4865565e7`,
  SHA-256 `0bbdb77ec2d89b2f654f0cde2dfc4d4db2c85e4ba20bb44c591000b8cc65240e`.

Both were generated twice with identical bytes. Candidate v5/request v3 were
superseded after acceptance-time hardening; candidate v6/request v4 were
superseded after narrowing the wrapper read allowlist. All four remain
immutable `MUST_NOT_SIGN` audit history. The private supersession ledger is
`2026-08-11-owner-signing-supersession-v3.json` outside Git.

The next transition still requires a new action-time authorization naming the
exact request ID, candidate ID and absent output path. The short-lived request
must be regenerated if it expires before that authorization.

### WP0B-B1 offline owner-signer final verification checkpoint - 2026-08-11

**Status:** `IMPLEMENTED_UNSIGNED_AWAITING_EXACT_SIGNING_AUTHORIZATION`. The
max-review findings and the primary integration review are closed in the
implementation: request expiry cannot be caller-bypassed, the signer imports a
pure schema-3 request contract, the runtime and every signer-closure byte are
pinned, all public checks finish before private-key access, the output writer
rejects parent and temporary-inode replacement, and the one-time acceptance
receipt binds the complete canonical request and signature.

The active unsigned chain is:

- candidate v9: `800bcb56c34ab7d143d0771c7431a4880c4bca71d4768d8d9d332159355f81bd`,
  SHA-256 `67298d23f673c15e4a1d12911fb40b7d7aa2ec456a4ea1e36d7b00afaa3f6435`;
- request v7: `54d8b3202fb0c36edf7aaaa9e387a5b8f07f20c6a647e01e4e6ec64e1b42000e`,
  SHA-256 `9685cc57288996832270f0bcfe4709f2a05f026df8ebfc69f0a507020895e947`,
  issued `2026-08-10T17:37:00.000Z` and expiring
  `2026-08-11T16:37:00.000Z`;
- offline signer contract:
  `d1c91de16033b69c6d1ebb24a92a377c8feac87bde51134251658bd4e7aede07`,
  SHA-256 `fb4cd62dec03904b785c5eb360bf2c0328833a896f58b1cf2a7ab0b0dd4d2bd5`;
- toolchain contract SHA-256:
  `50de144ab86c7603732daaf4efc52979f3f72bd326c67266cdf53571faa239fa`.

Candidate v9 and request v7 were each generated twice with byte-identical
outputs, mode `0600`, one link and no private-feed marker. The private
supersession ledger is
`2026-08-11-owner-signing-supersession-v4.json`; every candidate through v8
and request through v6 is immutable `MUST_NOT_SIGN` history.

Verification passes 113/113 focused and integration tests across B0/B1,
static rights, route resolution, PWA, the B2 worker protocol, signer security
and one-time acceptance. Lint, explicit module/shell syntax checks, schema
validation (`2,331` pages, `5,963` blocks, zero errors), publication-boundary
audit (`19` workflows, `2,331` public artifacts, zero violations), exact
toolchain replay and Git diff checks pass. With the injected public production
trust root, the production rights gate exits nonzero at the intended
`WITHDRAWAL_HEAD_NOT_ESTABLISHED` boundary.

The owner's current confirmation authorizes continued preparation and local
commit only. It does not name the exact request, candidate and absent output
path and therefore is not an action-time production signing authorization. No
production private key was located, opened, inspected or used; no signature,
push, deployment, promotion or activation occurred. Partnerize and The Good
Guys remain `PRIVATE_EVIDENCE_ONLY`, absent from Git, candidate/request bytes,
public output and static-publication signing dependencies.

The next external transition is optional exact owner-attestation signing and
bounded acceptance before request expiry. Even after acceptance, B1 remains
blocked until withdrawal genesis, the five scoped rights decisions, the
approved source manifest and detached publication authorization are completed
through their separate signed contracts.

### WP0B-B1 offline rights-reviewer signing-chain plan - 2026-08-11

**Status:** `READY_AFTER_PRIMARY_MAX_CLOSURE`. This is the next bounded security
slice. It prepares the reviewer side of B1 without signing anything and without
weakening the existing owner-attestation boundary. B2 real generation, B3A,
WP4A, preview, push, deployment, promotion and activation remain prohibited.

1. Add one pure reviewer-request contract with no filesystem, network,
   browser, subprocess, dynamic-import or online-generator dependency. It owns
   canonical JSON, exact schema keys and semantic IDs for exactly two artifact
   types: `WITHDRAWAL_GENESIS_HEAD` and `STATIC_RIGHTS_DECISION`. It validates
   the existing schema-1 withdrawal-head and decision payloads rather than
   defining competing rights semantics. A request binds the exact artifact ID
   and payload, authority-set ID and byte hash, reviewer issuer/key/fingerprint,
   injected owner trust-root hash, reviewer metadata hash, reviewer signer
   contract ID/hash, issue/expiry window and request ID. Unknown artifact types,
   schema upgrades and cross-type payloads fail closed.
2. Keep online construction and offline signing separate. The online request
   builder validates the production authority enrollment through the injected
   owner trust root, exact reviewer metadata/public key and the current B1
   candidate. It may build the existing zero-event withdrawal genesis request
   now. A decision request cannot be built from free-form CLI fields: it must
   derive dependency ID, inventory, scope, source-object hash, evidence hashes
   and attribution obligations from the current candidate; bind the accepted
   owner-attestation receipt as FIRST_PARTY evidence; bind the current signed
   withdrawal head; and use one explicit frozen decision clock and validity
   window for the whole five-decision set. `RETAILER_FEED` and unknown
   dependencies are unrepresentable.
3. Add a separate reviewer offline-signer contract. It pins Node `22.23.1`, the
   request contract, static-rights validator, reviewer signer, hardened shared
   I/O, tracked owner trust anchor and wrapper bytes. It independently checks
   the injected trust root, authority enrollment, reviewer metadata and exact
   canonical Ed25519 public key before private-key access. Owner and reviewer
   contracts and confirmation tokens are not interchangeable.
4. The production reviewer signer accepts only request, authority set, owner
   trust root, owner trust anchor, reviewer metadata, reviewer public/private
   keys, signer contract, absent output path, exact expected request/artifact
   IDs and literal `SIGN_EXACT_STATIC_RIGHTS_REVIEWER_ARTIFACT`. It reuses the
   hardened stable readers and atomic no-clobber writer. All request, clock,
   runtime, contract, trust, metadata, public-key and output checks complete
   before opening the private key. It signs only canonical payload bytes and
   writes the exact existing-domain envelope: `{withdrawalHeadHash,payload,
   signature}` or `{decisionId,payload,signature}`. Production signing remains
   forbidden without a fresh action-time authorization naming request ID,
   artifact ID and absent output path.
5. Use separate acceptance/assembly gates. A signed genesis is validated by
   `validateWithdrawalLog` before an immutable zero-event production log is
   written. Decisions are staged outside Git and accepted only as one exact
   five-dependency set after all signatures validate against the same
   candidate, owner-acceptance receipt, decision clock and withdrawal head.
   Partial, duplicated, mixed-generation, expired, withdrawn or predecessor
   decisions never mutate the active registry. The generated registry and
   route fulfillments then pass the ordinary B1 builder; no alternate approval
   path is introduced.
6. Build `static-publication-authorization.json` deterministically only after
   the ordinary review and schema-2 source manifest are `APPROVED`. It remains
   the existing content-bound authorization object, not an invented unsigned
   substitute for reviewer decisions. Re-run the production gate with the
   injected trust root and require success before B2 may leave fixture-only
   state.
7. TDD uses ephemeral owner/reviewer keys only. RED/GREEN covers canonical and
   semantic drift, artifact-type confusion, authority enrollment substitution,
   reviewer key/metadata substitution, wrong candidate or dependency scope,
   missing owner acceptance, stale withdrawal head, mixed decision clocks,
   partial five-decision sets, request expiry, output races, fail-before-secret-
   read, key mismatch, wrapper network/child-process denial and absence of
   private/Partnerize markers in every request and envelope. Existing owner
   signer, static-rights, B1, B2 protocol, PWA and publication-boundary tests
   remain regression gates.
8. After code hashes settle, reseal the B0 executable binding set and reviewer
   signer contract, regenerate the blocked B1 review, and produce only one
   deterministic unsigned withdrawal-genesis request outside Git. Decision
   requests wait for a valid owner-acceptance receipt and signed genesis. Add a
   private supersession ledger; retain all earlier artifacts as immutable
   `MUST_NOT_SIGN` history. Commit locally only.

**Normative max-review closure.** The independent max review returned `DRAFT`
with four P0 and two P1 findings. The following corrections override any less
specific wording above; implementation may start only against this corrected
contract:

| Finding | Required correction |
| --- | --- |
| P0 signer trusts an online-built request | Add one pure `deriveExpectedReviewerArtifact` operation used unchanged by builder, offline signer and acceptance. Before private-key access, the signer stable-reads and independently validates the immutable B1 base-candidate ID/bytes, accepted owner receipt, authority document/enrollment, and current withdrawal state. Genesis derives only from the owner-accepted candidate's exact genesis hash and a create-only no-prior-head condition; decisions additionally derive from the accepted signed genesis. Presented payload and artifact ID must equal the derivation byte-for-byte. |
| P0 executable self-verification is circular | Put a minimal operator-authenticated bootstrap before either owner or reviewer signer receives private-key read permission. Exact action-time authorization must name bootstrap SHA-256, signer-contract ID and SHA-256, wrapper SHA-256, resolved Node executable SHA-256, request ID, artifact/candidate ID and absent output path. The bootstrap uses the pre-existing OS `shasum`/sandbox boundary to verify these exact bytes before launching a filesystem-permissioned immutable bundle. Internal Node contract checks remain defense-in-depth; a version string alone is insufficient. This correction also hardens the existing owner signer before any owner-root use. |
| P0 acceptance and publication are separable | Add one fail-closed finalization entry point. It validates the injected owner root, authority enrollment, exact accepted owner receipt, signed genesis/current head, all decision signatures, candidate-derived descriptors, attribution and actual system `acceptanceNow`; it separately preserves the frozen `decisionAsOf`. It rechecks decision validity and withdrawal continuity immediately before committing one generation-specific packet, then rederives review, schema-2 manifest and publication authorization through the existing builder/gate. Low-level content hashes alone cannot activate B1. |
| P0 five decisions/private-feed exclusion are conventional | Define one canonical sorted production dependency set: `ENERGY_RATING_CC_BY`, `FIRST_PARTY`, `GOOGLE_VERIFICATION`, `OUTFIT_FONT`, `WEB_VITALS_APACHE_2`. Derive and bind every full descriptor plus `decisionSetId`. Production registry validation, signer derivation, acceptance and the final gate require exact descriptor-set equality; four, six, duplicate, substituted, unknown or signed `RETAILER_FEED` decisions fail. String-marker absence remains diagnostic only. |
| P1 withdrawal and registry commits can roll back or tear | Genesis acceptance is create-only and its no-prior-head proof is the owner-accepted candidate binding the exact genesis draft. Persist the accepted head as the CAS predecessor for future append operations. Stage envelopes privately, but assemble all five decisions and fulfillments into one canonical generation packet in memory and atomically write one generation-specific file. A partial staging set is never a registry input. Tracked artifacts are derived in an isolated worktree and become active only through one local Git commit whose pre-commit gate consumes that exact packet. |
| P1 identity/separation/supersession is ambiguous | Bind `b1BaseCandidateId` and canonical byte SHA-256, owner-acceptance receipt ID/SHA-256, authority-enrollment payload ID, full authority-document SHA-256, frozen decision clock and accepted withdrawal head. Reject equal owner/reviewer SPKI fingerprints. Initial decision predecessor and supersedes IDs must both be `null`. Requests use a maximum 24-hour exclusive-expiry window. The private supersession ledger remains audit-only and is never claimed as signer authority; freshness comes from exact action-time authorization, bound current inputs and expiry. |

The bootstrap does not make repository code magically self-trusting. Its trust
root is the operator's fresh authorization of exact hashes before private-key
read permission is granted. Tests must demonstrate that the signer process
cannot open the private key when any authorized bootstrap, Node, contract,
wrapper, request or derived-input byte differs.

**Exit:** the reviewer request/signer/acceptance machinery is production-ready,
the unsigned genesis request is byte-reproducible, no production secret was
read and no signature exists. The next external action remains an exact,
separately authorized signing operation. B1 is not complete until the owner
attestation is accepted, genesis and all five decisions are signed and
accepted, the generated review/manifest become approved and the deterministic
publication authorization passes the real gate.

#### WP0B-B1 implementation checkpoint - 2026-08-11

**State:** `IMPLEMENTED_LOCAL_UNSIGNED`. The corrected owner/reviewer chain is
implemented and verified in the isolated worktree. This state is not a signing
authorization, publication approval, deployment approval or activation.

Implemented security closures:

- the reviewer builder, offline signer and finalizer share the same pure
  candidate-derived artifact operation;
- accepted owner evidence is bound to the exact candidate, FIRST_PARTY scope,
  source object, owner signer contract, pinned trust anchor, authority
  enrollment and withdrawal-genesis draft;
- every signed decision carries the same candidate-derived `decisionSetId`, so
  individually valid decisions from different candidates cannot be assembled;
- production accepts exactly the sorted five-dependency set and cannot
  represent a sixth, missing, duplicate, unknown or `RETAILER_FEED` decision;
- the finalizer validates actual acceptance time separately from frozen
  `decisionAsOf`, rejects expiry and system-clock rollback, then writes one
  atomic generation packet;
- the owner and reviewer wrappers require action-time bootstrap, wrapper,
  signer-contract and resolved Node hashes before private-key access;
- the reviewer signer contract transitively binds the owner-request contract,
  and the current withdrawal-head hash is revalidated against each decision.

Mechanically resealed contracts:

- owner signer contract ID:
  `3f6a63b76388156b2a2d7898f23e4dbbd7ee72bb4649b9caaf65a3b0901df0b6`;
- owner signer contract file SHA-256:
  `021ded9bd9f26221aaad1b7e4c3d1a01e966089d3df3f5faaa572097e04f1dfe`;
- reviewer signer contract ID:
  `e75b62c317316a868aae9482318041368cbd56ca97e1e9e3a5c4a907967bc086`;
- reviewer signer contract file SHA-256:
  `7dfbdc4769c26fc6076705fa34372ed355b64371cf47a25e0f6f068d1ee9d036`;
- toolchain contract SHA-256:
  `c069c76006f3678e4f61ef9377cdd41b82e24752a737972aad1606c618ed0775`.

Current unsigned external artifacts:

- active candidate v10 ID
  `4ff4ba9acbf0dbba30fe18de8c4e42de2f8ea65facf1243140790d299ba9ac23`,
  SHA-256
  `124367e2dbd8e23dfd2f3eafc1eaf7a15bf3a9a2366e1f11e4b5dc70292e4158`;
- active owner request v8 ID
  `b81f70d5596d1ba79fc0b2f51152113618ae11e932bd97abdf9593c1628a19a7`,
  SHA-256
  `1f2b03eb35334bbd9440dc2d75f31c7f14c774863ef16c5ef90dbb52fd7b3412`,
  exclusive expiry `2026-08-11T18:38:00.000Z`;
- supersession ledger v5 SHA-256
  `ea37c4d2b0af92354d580603a929f1f167da2365e2ee7e2c8afa71ab330a795f`;
  it names v10/v8 as active and marks all 16 predecessor artifacts
  `MUST_NOT_SIGN`;
- all three files are outside Git, owner-only mode `0600` with one hard link;
  the proposed owner-attestation output remains absent.

Verification evidence:

- focused reviewer/static-rights suites: `39/39` passed;
- owner, reviewer, materializer, PWA, service-worker and publication regression
  selection: `113/113` passed;
- lint, changed-module syntax, shell syntax and both signer-contract validators
  passed;
- schema validation: 2,331 pages, 5,963 blocks, zero errors;
- publication-boundary audit: 19 workflows and 2,331 public artifacts, zero
  violations;
- production rights gate fails closed with
  `WITHDRAWAL_HEAD_NOT_ESTABLISHED`, as required before genesis exists.

The reviewer-genesis request is intentionally not generated yet. Its pure
derivation requires an accepted owner receipt, so generating it from the
unsigned candidate would recreate the online-request trust flaw closed by this
slice. After a separately authorized owner signature is accepted, the next
sequence is: derive unsigned genesis request, obtain a separately authorized
reviewer signature, accept genesis, derive all five decision requests, obtain
and atomically finalize the five signed decisions, then rerun the ordinary B1
gate.

Partnerize login and feed data remain private internal evidence only. They are
not a production rights dependency, are excluded from reviewer decisions,
tracked public artifacts and publication authorization, and must never be
copied into Git or a public release packet.

### WP0B-B0/B1 privacy-successor checkpoint - 2026-08-11

**State:** `IMPLEMENTED_LOCAL_UNSIGNED`. A privacy-only successor now replaces
the predecessor release in the local active-release descriptor without claiming
new lifecycle, Fit, publication or deployment authorization.

- active successor:
  `retail_lifecycle_release_30f746d33cd37b95496a9036`;
- authorized predecessor:
  `retail_lifecycle_release_6c42c754aeb1ff49097b32b4`;
- public membership remains 3,513 products in the same ordered identity set;
  117 are `CURRENT_RETAIL`, 309 are `UNKNOWN_RETAIL`, and 3,087 are
  `CATALOG_ARCHIVED`;
- every lifecycle or retailer field derived from the private Partnerize feed is
  removed from the tracked/public projection. Affected products fail closed to
  unknown/unavailable until a public-authorized source revalidates them;
- the removed bytes are bound to the external private recovery manifest and
  archive under `/Volumes/UGREEN-1TB/FitAppliance/private`; those bytes are not
  a normal build input and must not be copied back into Git;
- publication, Fit and active-release audits pass with zero private-evidence
  violations. This checkpoint does not authorize V4 cutover, owner/reviewer
  signing, push or deployment;
- committed-state clean replay for `a5b495da655a3d2d23bb2127d730efdc4bc485d3`
  produced 3,211 content-bound receipts with zero unresolved outputs. The
  resealed B1 inventory contains 3,283 rows and has ID
  `d5cd66101ea84c9123ab8d04cf26335a02f0743a3058ae58a1a63be449226cc4`;
  the B0/B1 deployment-static regression passes 60/60;
- B1 remains correctly blocked by the five unsigned rights decisions,
  un-enrolled production trust root, and missing withdrawal genesis/head. No
  private retailer dependency or Partnerize row is present in the inventory;
- the previous owner request is expired. A fresh request can be prepared only
  after the committed tree is replayed and B1 inventory/provenance is resealed.
  The non-secret owner public key, owner metadata and trust-root/anchor inputs
  are not currently available, so no signing operation is permitted.

Partnerize acquisition remains an independent private evidence operation. It
may write immutable CSV bytes and a secret-safe receipt to the external
evidence store, but no raw URL, token, row or derived retailer fact may enter a
tracked artifact, public build, rights packet or Fit decision.

### WP0B-B0/B1 privacy audit-remediation checkpoint - 2026-08-11

**State:** `SUPERSEDED_BY_MAX_AUDIT_REPAIR`. The bounded final review of the
privacy successor found three release-integrity gaps, and the primary review
found one additional laundering path. All four are closed without changing
the private-only Partnerize authorization boundary.

- manual and public projection classifiers now evaluate `source`,
  `sourceType`, `adapterId` and `sourcePolicyId` independently. A public-looking
  `source: manual` value cannot mask an affiliate-feed or private policy
  binding;
- a retailer row containing a private feed-only field, affiliate URL residue,
  or Partnerize-labelled source is removed as a whole. Removing only the
  identifying field while retaining the retailer fact is forbidden;
- the privacy successor builder opens the sibling private recovery archive
  without following symlinks, requires a regular file, hashes the actual bytes,
  and compares them with the bound manifest before using that manifest;
- the three tracked sanitization targets use an external deterministic journal.
  An interrupted rename resumes from old/new content hashes, while target,
  temp or journal drift fails closed. The journal contains no private rows or
  recovery bytes and is removed only after all targets match the intended
  hashes;
- the real external recovery archive was verified at
  `df9919e96109effae2ad870e6580bf9e25a20595a8e486507d4a0e1b4b5ebe96`.
  Its bytes remain outside Git and outside normal build inputs;
- changing `src/domain/public-projection.mjs` advanced the controlled
  publication epoch. The scale controller was regenerated as
  `historical-dimensions-scale-42ceaae2850b27c9f5960990`, the active recovery
  audit remained at zero issues, and the downstream system contract was
  regenerated as `historical_evidence_system_425177deeeb29b7bc79de3f4`;
- focused privacy regression passed 48/48, the complete Architecture V2 test
  set exited 0, lint passed, the private-evidence audit checked 5,831 files with
  zero violations, the publication audit checked 19 workflows and 2,331
  artifacts with zero violations, and active-release/Fit audits reported zero
  issues or publication violations;
- Architecture V2 tests that use `cp -al` must keep their temporary directory
  on the repository filesystem. Test logs and clean replay workspaces may live
  on `UGREEN-1TB`, but setting the whole suite's `TMPDIR` to that external volume
  causes an expected cross-device hard-link failure;
- unsigned signing candidate
  `e57b351a55a11e4d7c9dcb2f395843b80a98d938f41e7ff62497d38e27e46aa7`
  is stale after these controlled-source changes and must not be signed. A new
  candidate may be generated only after committed-state replay and B1
  provenance resealing;
- one `gpt-5.6-sol` medium implementation agent was used for the bounded code
  slice. The requested max reviewer was not rerun because its model quota is
  unavailable before 2026-08-17; the primary bounded review is recorded as the
  current review evidence, not misreported as an independent max approval.

No private key was read, no owner or reviewer signature was created, and no
push, deployment, promotion or activation occurred.

#### Committed replay and unsigned-candidate refresh

- privacy remediation and its controlled historical successors were committed
  locally as `c9d6aff396a9315775d5c2453b42c17a8db39bd3`;
- a clean `git archive` of that commit was generated under
  `/Volumes/UGREEN-1TB/FitAppliance/tmp/b1-replay-c9d6aff39-20260811T123801`.
  The normal build plus evidence index, fit-check pages, OG optimization, image
  sitemap, RSS and final sitemap completed successfully;
- replay produced 3,211 content-bound receipts and zero unresolved outputs.
  A second run was byte-identical. The resealed files have SHA-256 values
  `a2bf65f050ae70a9164f931de0fb4ec002a2db6304eab93c16246bee4f66aace`
  for generated provenance,
  `41d983803001929016d478e0eded63cfdb58f6d0beabc8987b2cf7f3bfae31a2`
  for the blocked rights review, and
  `cf9141255f940d09b8e0d547eacbfd7d5452bb6d7a8d86d205b783c412201c39`
  for the reviewed manifest;
- inventory ID remains
  `d5cd66101ea84c9123ab8d04cf26335a02f0743a3058ae58a1a63be449226cc4`
  because no public path or output byte changed. Rights review ID advanced to
  `215a8ea62967c99c2f3b4f2b84a8d69f8100018fc9f41352bff3f886ce72ed3a`.
  The reseal was committed locally as
  `40c346831`;
- the 60-test deployment-static regression passed 60/60. The real production
  gate remains correctly nonzero at `PRODUCTION_TRUST_ROOT_NOT_ENROLLED`;
- unsigned candidate v12 is stored at
  `/Volumes/UGREEN-1TB/FitAppliance/private/static-rights/decision-packets/2026-08-11-b1-signing-candidate-v12.json`.
  It is mode `0600`, has one link, status `BLOCKED_OWNER_ATTESTATION`, candidate
  ID `e57b351a55a11e4d7c9dcb2f395843b80a98d938f41e7ff62497d38e27e46aa7`
  and file SHA-256
  `b88fb0778f1a3ae2e6bb1f3226b8e9e52561f36b8fbe096a39b82bc07e9df4ed`.
  Two generations were byte-identical. Its equality with the superseded v11
  bytes is expected: public inventory, exact output bytes and rights scopes did
  not change, while provenance was independently resealed and revalidated;
- no owner request was produced because the required non-secret owner metadata,
  owner public key and enrolled trust-root/anchor inputs are not available.
  The private owner key was not read and must not be used to invent those
  missing public inputs.

No push, deployment, signing, promotion or activation occurred in this replay.

### WP0B-B0/B1 independent max-audit repair checkpoint - 2026-08-11

**State:** `VERIFIED_LOCAL_PUSH_READY_DEPLOYMENT_BLOCKED`. The now-available
independent max reviewer found four remaining privacy and recovery gaps in the
previous local checkpoint. They are treated as blockers, not as a passed
review.

- recovery manifests and archives must be regular files opened without
  following symlinks. Manifest paths must be unique canonical repository-
  relative paths; absolute paths, empty segments, dot segments, backslashes,
  NULs and non-NFC forms are rejected;
- the sanitization transaction now binds old and new hashes, adjacent staging
  files, and external old-byte backups in a versioned journal. A caught failure
  restores all targets; a later run also repairs a mixed old/new crash state
  before retrying. Symlinked targets, staging files, backups or journals fail
  closed;
- this is a recoverable, publication-isolated multi-file update, not a claim of
  filesystem-level multi-file atomicity. Git provenance and static publication
  gates must reject any uncommitted intermediate tree;
- manual retailer enrichment, public projection and the static publication
  audit now share the complete known set of private Partnerize-only field
  markers, including commission exclusion terms. A manual source label cannot
  launder those fields into public artifacts;
- focused regression covers symlink rejection, path escape rejection, failed-
  rename rollback, mixed-state resume and unchanged-document handling.

The next mandatory sequence is controlled generated-artifact replay, relevant
regression and audit gates, one bounded re-review by the same max reviewer,
commit and push. Production deployment remains separately fail-closed until
the rights registry, withdrawal head and detached authorization gates pass.

#### Repair verification and deployment-gate result

- implementation, tests and plan correction were committed as `d96548e10`;
  controlled historical policy artifacts were resealed as `0560c7fef`; static
  replay provenance was resealed as `f936d3af5`;
- the clean replay root is
  `/Volumes/UGREEN-1TB/FitAppliance/tmp/b1-replay-0560c7fef-20260811T114357Z`.
  It produced 3,211 receipts, zero unresolved outputs, and a second complete
  build had byte-identical `public/` and `pages/` hashes;
- the focused privacy/deployment regression passed 105/105. Lint passed; the
  private boundary checked 5,831 tracked operational files, the publication
  boundary checked 19 workflows and 2,331 public artifacts, and active-release
  and Fit audits reported zero violations;
- the same independent `gpt-5.6-sol` max reviewer rechecked only its four
  findings and marked all four closed, with no remaining Critical or Important
  issue in that bounded scope;
- the external production trust root is now readable and accepted far enough
  for the live gate to reach `WITHDRAWAL_HEAD_NOT_ESTABLISHED`. The deployment
  materializer remains correctly blocked by `SOURCE_MANIFEST_BLOCKED`: 4,161
  blockers comprise 3,280 `FIRST_PARTY`, 871 `OUTFIT_FONT`, five
  `ENERGY_RATING_CC_BY`, two `GOOGLE_VERIFICATION`, one
  `WEB_VITALS_APACHE_2`, one withdrawal-head and one withdrawal-log blocker.

No private key was read, no signature or rights decision was synthesized, and
no production artifact was materialized. The branch may be pushed for CI and
review; production deployment must wait for the independent authorization
chain rather than bypassing the gate.

### WP0B-B0 managed Vercel Node patch checkpoint - 2026-08-11

**State:** `VERIFIED_LOCAL_PUSH_READY_DEPLOYMENT_BLOCKED`. The preview created
from commit `54a982c2c` failed before the publication-rights gate because the
repository contract pinned local Node `22.23.1` while Vercel supplied managed
Node `22.22.2`. Vercel's documented deployment contract selects the Node major
through `engines.node`; Vercel manages the minor and patch versions.

The deployment validator therefore keeps exact Node, npm and Vercel CLI
versions for local builds and retained replays. Managed Node mode requires both
the contract-bound Vercel build command's explicit `--managed-vercel-node` flag
and `VERCEL=1`; an inherited `VERCEL=1` alone remains strict. Only in that mode
may Node vary within the already reviewed `vercelNodeMajor` (`22.x`). It still
rejects Node 20/24 or any npm, Vercel CLI, executable-binding or bound-file
drift, and historical replay cannot select managed mode. The focused RED test
proved the old validator rejected the managed patch, then passed after the
minimum change; the complete static-materializer suite passed 15/15.

The bounded max review found that the first implementation trusted
caller-controlled `VERCEL=1` by itself. That finding was accepted: process-mode
tests now prove the explicit flag/environment conjunction, managed-mode npm,
Vercel CLI and bound-file drift rejection, and historical-mode rejection.

The first pushed preview then exposed managed npm `10.9.7` versus the exact
contract pin `10.9.8`. Preview now enables Vercel's documented Corepack path,
which consumes the existing `packageManager: npm@10.9.8` declaration rather
than weakening npm validation. A redeploy confirmed npm `10.9.8`, then correctly
found that Vercel's default `npm install` had changed `package-lock.json`.
`vercel.json` now binds installation to `npm ci --ignore-scripts`, preserving the
reviewed lock bytes and preventing dependency lifecycle scripts. Production
Corepack configuration remains a separate pre-deployment prerequisite; its
absence fails closed at the exact npm gate.

The first clean-install attempt also exposed one pre-existing lock mismatch:
`hasown@2.0.3` no longer satisfied the committed dependency requirement
`^2.0.4`. Regenerating lock metadata with the pinned npm changed only that
transitive entry to `2.0.4`; `npm ci --ignore-scripts --dry-run` then passed.

Vercel subsequently normalized `vercel.json` to compact JSON plus one LF before
the build command. Diagnostic hashes proved the exact actual value equals
`sha256(JSON.stringify(reviewedConfig) + "\\n")`. The toolchain contract now
binds both the Git source bytes and that single deterministic managed transform;
only explicit managed Vercel mode accepts the second hash. Local/replay mode,
other files and any other `vercel.json` bytes remain exact-hash failures.

This compatibility rule does not authorize generation, publication or
activation. A post-push Vercel build must advance to the existing
`SOURCE_MANIFEST_BLOCKED`/withdrawal/rights stop and remain non-deployable until
the independent authorization chain is complete.

### WP4A/WP4B - Replace the fixed consumer count with semantic inventory

Create one explicit deployment-surface manifest covering root HTML, public
modules/data, generated pages, templates/generators, API routes, sitemap,
Vercel configuration, service worker, and activation configuration. Classify
each Fit producer and consumer by behavior, not by a regex match count.

WP4A follows B3A and is a containment baseline. It binds B3A's
`deploymentOutputId` and `staticPublicationAuthorizationId`, may contain
classified pending migrations, and is the predecessor for WP5-WP8. It is not a
final release inventory.

After WP8 changes public source, the order is mandatory: final B1 authorization
successor, B3B materialization, then WP4B. WP4B regenerates the semantic
inventory against the final `deploymentOutputId` and successor
`staticPublicationAuthorizationId`, requires zero active legacy Fit reads and
emits the receipt consumed by B4 and WP9. The WP4A receipt cannot satisfy B4.
A rights-registry, clock, attribution or withdrawal change invalidates either
artifact even when deployable bytes are unchanged.

Use three complementary gates:

1. explicit source/deployment ownership manifest;
2. focused module/output tests for each listed producer and consumer; and
3. declared migration status and an owning behavior test for each entry.

**Gate:** both versions have zero unclassified consumers. WP4A allows classified
pending migrations until WP8. WP4B allows none, proves zero active legacy Fit
reads, binds the final B1/B3B identities and is mandatory for B4/WP9. Mutation
adding a hidden deployable Fit read fails either inventory gate, and renaming a
symbol cannot make a pending migration appear complete.

### WP5 - Expand current-catalog readiness and freeze the successor epoch

Prioritize the 349 current products, not the entire historical corpus. For each
category and form factor, measure exact identity, closed envelope,
installation clearance, operation envelope, ventilation, water, power, drain,
delivery, service, and policy-applicability coverage separately.

No coverage target permits evidence invention. Products may be publicly shown
as `FIT_DATA_INCOMPLETE`; they may not fall back to legacy Fit within an active
V4 surface. Historical-reference work continues only for replacement mode and
cannot inflate current Fit coverage.

**Gate:** each current product has a stable readiness reason; every accepted
hard field is evaluated or explicitly not applicable; deterministic invariant
fixtures cannot promote missing, conflicting, stale, rights-blocked, or
unsupported evidence. Materialize and freeze the successor readiness epoch;
all descendants of the predecessor epoch are invalidated. Measured
false-acceptance claims wait for WP7B labels.

### WP6 - Compile rights-safe knowledge and add browser parity

**TDD order**

1. Specify the public Installation Knowledge Release schema, omission rules,
   and publication-rights disposition contract.
2. Compile only receipt-bound facts from the final WP5 readiness epoch whose
   display rights are allowed, in date, not withdrawn, and
   attribution-complete.
3. Extract pure evaluator code without changing Node oracle semantics.
4. Run identical synthetic inputs through Node and a real browser.
5. Add tamper, stale-release, predecessor-invalidation, private-byte,
   Node-built-in, and site-data exfiltration tests.

**Gate:** byte-stable compiler output for the same semantic inputs; browser and
Node results match; tampering fails closed; network instrumentation confirms
real site measurements are neither sent nor persisted. A changed readiness
epoch invalidates all predecessor descendants, but this gate regenerates and
validates only the final knowledge and browser-parity artifacts. Rank and
calibration regeneration belong to WP7A and WP7B. Dedicated rights tests reject
absent, denied, expired, withdrawn, and unmet-attribution display rights.

### WP7A - Introduce generation-bound rank schema v2

- preserve the rank-v1 defects in WP0A, then add failing schema-v2 tests;
- make v1/v2 comparison explicitly incompatible;
- bind active release, final readiness epoch, final knowledge release,
  engine artifact/schema, category policy/epoch, form factor, resolved
  configuration, synthetic scenario set/member or live session, outcome, and
  evidence class into one comparability key;
- return typed `NOT_COMPARABLE` before numeric comparison when any component
  differs;
- remove numeric rank components from prohibited outcomes; and
- retain independent replay validation.

**Gate:** `fit-rank-v4-generation-dependencies` tests reject any missing binding
and every one-field mismatch; prohibited outcomes expose no numeric rank;
v1/v2 comparison fails explicitly; the final WP5 epoch and WP6
knowledge/parity artifacts reject predecessor rank artifacts and produce a
generation-consistent rank-v2 artifact; public and complete deployment tree
hashes remain unchanged.

### WP7B - Bind independent calibration and gate all Fit ordering

Every label binds source/review bytes, exact product, scenario member, policy
epoch, reviewer authorization, independence, and review timestamp. A trusted
reviewer-authorization registry binds reviewer and producer roles, validity
intervals, and detached authorization bytes; a boolean self-assertion is not
authority. Branch
coverage is derived from evaluator traces rather than declared IDs. Calibration
and holdout sets are frozen before fitting.

The calibration manifest also binds the final WP5 readiness epoch, WP6
knowledge release and browser-parity evidence, engine artifact/schema, WP7A
rank schema/policy, and comparability-key schema. It rejects predecessor or
mixed-generation inputs before reading labels.

**Gate:** unknown, expired, self-reviewing, role-conflicted, self-asserted, or
hash-forged reviewers fail, as do evaluator-derived labels, changed labels,
unexecuted branches, and post-split mutation. Held-out strata have zero
false `VERIFIED_FIT` plus predeclared false-rejection and within-class ordering
thresholds. Descendant-invalidation and calibration-generation-binding tests
prove E2 rejects K1/parity1/rank1/calibration1, then accept only
K2/parity2/rank2/calibration2. Until then, all public Fit-based ordering is
disabled.

### WP8 - Integrate a disabled complete public surface

Integrate the browser evaluator and readiness states across one isolated,
non-promoted release. Do not activate a subset by individual product. An
activation scope is one complete user-visible collection and its related
routes and cache. Live measurements must be removed from URL/history, local and
session storage, IndexedDB, CacheStorage, service-worker messages, network and
logs. Saved measurement restoration requires a future explicit consent and
retention decision and is out of scope here.

Complete WP0B-B2 in this package: stamp every HTML document and Fit-bearing
public data/module with the same `applicationGenerationId`, add the page/worker
handshake, and disable all Fit behavior on a missing or mismatched generation.
The worker may retain the immediate predecessor but may claim offline support
only for paths listed in the signed cache-coverage receipt. Convert the legacy
Git-SHA-only and eager-cache-deletion expectations into RED characterization
witnesses before implementing the successor protocol. After integration,
the integrated source must pass a final B1 authorization successor, then
WP0B-B3B rematerializes it and WP4B regenerates the semantic inventory with
zero active legacy Fit reads. WP0B-B4 deploys only that exact retained
`.vercel/output` and consumes the WP4B receipt; the preview must not rebuild
from source.

**Gate:** desktop/mobile, keyboard, screen-reader, long copy, zero-result,
unknown, conflict, unsupported policy, stale tab, old/new service worker,
offline, and legacy restored-URL tests pass safely. Browser instrumentation
finds neither injected measurements nor deterministic digests in persistence or
egress. No collection mixes engines or exposes a generic score fallback, and
WP4B reports zero active legacy Fit reads against the final B1/B3B identities.

### WP9 - Build one atomic candidate and rehearse rollback

Materialize a candidate that binds HTML, JS, CSS, data, routes, sitemap,
service worker/cache version, knowledge release, policy/configuration,
calibration, browser QA, activation scope, the final
`staticPublicationAuthorizationId`, its frozen decision clock and withdrawal
head, and the WP4B zero-legacy-read receipt. Owner authorization is detached and
references the immutable candidate hash. Any changed byte, static-rights input
or WP4B identity invalidates it.

Inject a failure after every publication step. Rollback must restore the prior
release byte-for-byte and pass the same browser suite, including stale clients
and offline caches.

The service-worker protocol tests old-page/new-worker, new-page/old-worker,
failed install/verification/activation boundaries, stale tabs, and offline
rollback. The predecessor complete generation remains retained until the
successor health and rollback-retention gates pass.

Execute WP0B-B5 as part of the activation transaction, not as an earlier
observation. Immediately before alias promotion, bind the then-current
production deployment and retained rollback bytes, the final candidate
`deploymentOutputId`, freshly valid static-publication authorization and
detached owner authorization in one CAS-equivalent operation. If production,
the decision clock or withdrawal head changed after inspection, abort with
`IMMEDIATE_PREDECESSOR_STALE`; a prior read followed by unconditional alias
mutation is not an activation protocol.

**Gate:** candidate remains `BLOCKED` until all technical gates pass and the
owner separately authorizes activation. No commit, push, deployment, or public
claim is implied by a generated candidate.

## 9. Required Scenario Traces by Artifact Class

No work package may depend on a later package's fixtures or manifests.

- **Pure contract/schema changes:** malformed input, version mismatch,
  predecessor-hash drift, deterministic replay, and unsupported state.
- **Readiness/knowledge persistence:** fresh run, exact repeat, interruption and
  resume at every durable boundary, concurrent writer/stale lock, source
  conflict, withdrawal, lifecycle change, schema/policy upgrade, rollback to a
  retained head, and missing optional external storage.
- **Browser/runtime integration:** Node/browser parity, live-site privacy,
  unsupported state, stale input invalidation, and zero active legacy reads.
- **Release work only:** partial publication failure, old/new page-worker
  combinations, stale tabs, offline mode, mixed-generation rejection, and
  complete rollback.

Each work package lists only predecessor artifacts it may load. Tests fail on
undeclared fixtures, later-package manifests, or hidden external dependencies.

## 10. Typed Stop Conditions

Stop and preserve a resume record when:

- catalog/reference identity or evidence rights are ambiguous;
- a required axis, datum, unit, range endpoint, or model scope is missing;
- an unsupported policy could reach a Fit outcome;
- public display rights are absent, denied, expired, withdrawn, or incomplete;
- a comparison surface would mix V4 and legacy values;
- a persisted synthetic scenario result cannot prove set membership;
- a live scenario value, digest, or result would be persisted or transmitted;
- a rank comparison crosses its comparability key;
- calibration provenance or reviewer independence is not loadable;
- browser output differs from the trusted replay;
- real site data would leave the browser;
- any deployable byte is outside the release manifest;
- service-worker generations can mix;
- repeated execution weakens prior accepted evidence; or
- rollback cannot restore the complete previous release.

## 11. Verification and Agent Protocol

For every implementation slice:

1. Primary conversation reads this plan and verifies predecessor artifacts.
2. Primary conversation gives one `gpt-5.6-sol` medium subagent a bounded write
   scope, invariants, RED test, and commands.
3. The medium agent demonstrates RED, writes the smallest implementation, and
   runs focused tests.
4. Primary conversation reviews the diff for correctness, privacy, data loss,
   publication leakage, unnecessary abstraction, and dirty-worktree safety.
5. Primary conversation reruns focused tests and the smallest relevant
   Architecture V2 regression gate.
6. One `gpt-5.6-sol` max subagent audits a coherent substantial plan revision or
   final implementation batch. Do not create implement-review-fix loops.

Minimum completion commands for a code slice are its focused `node --test`
file, relevant Architecture V2 tests, `git diff --check`, and syntax/lint checks
for changed modules. Full build is reserved for release-surface work because it
materializes publication inputs.

## 12. Max-Audit Disposition Matrix

| 2026-08-09 finding | Planned closure |
| --- | --- |
| P0 lifecycle and historical evidence conflated | WP1 separate universes and explicit overlap ledger |
| P0 activation does not close comparison surfaces | WP4A/WP4B semantic inventory and WP8 whole-surface activation |
| P0 policy applicability and scenario binding incomplete | WP2 applicability partition and WP3 synthetic/live binding |
| P0 rank permits forbidden comparisons | WP7A generation-bound comparability key and prohibited-outcome handling |
| P0 website runtime boundary undefined | Section 6 and WP6 offline compiler/browser evaluator |
| P0 fixed 58-consumer count is not proof | WP4A/WP4B explicit deployment manifests plus behavior and browser tests |
| P1 readiness ledger mutability/resume unclear | WP2 append-only epochs and scenario traces |
| P1 calibration independence self-asserted | WP7B immutable review evidence and replay-derived coverage |
| P1 rollout, QA, authorization and rollback fragmented | WP8-WP9 one release protocol |

First max re-review dispositions:

| Finding | Incorporated correction |
| --- | --- |
| P0 public-display rights absent | Decisions 11, readiness rights disposition, WP2 and WP6 rights gate |
| P0 uncertain outcome semantics contradicted | Locked decision 4 and the explicit state/outcome transition table |
| P0 rank key under-bound | Section 5.2 binds release, epoch, knowledge, engine, configuration and scenario generation |
| P0 synthetic/live scenario privacy conflict | Section 5.1 separates persisted synthetic and non-exportable live bindings; WP8 removes measurement persistence |
| P0 manifest dependency graph ambiguous | Section 4.3 defines the sole predecessor graph and descendant invalidation |
| P0 WP4 gate depended on later migration | WP4A requires exhaustive classification; final zero active legacy reads are proved by WP4B after WP8 and B3B |
| P0 rollout lacked deployable generation protocol | WP0B-B0/B1/B3 contain and identify output; WP8 completes B2 handshake integration; WP9 executes B5 fresh-predecessor retention and authorization |
| P1 replacement ignored lifecycle authority | WP1 requires bound `CURRENT_OUTPUT` membership and retailer eligibility |
| P1 early rank work lacked later generation inputs | WP0A is first; complete rank schema v2 moved to WP7A after WP2, WP3, WP5, and WP6 |
| P1 gates consumed later artifacts | Section 9 scopes traces and prohibits undeclared/later fixtures |
| P1 reviewer independence self-asserted | WP7B adds a trusted reviewer authorization and role registry |

Second max re-review dispositions:

| Finding | Incorporated correction |
| --- | --- |
| Rank schema required later generation inputs | Complete rank schema v2 moved to WP7A after scenario, final readiness, knowledge, and parity artifacts exist |
| Evidence expansion invalidated an earlier knowledge release | Evidence expansion now freezes WP5 successor epoch before WP6 compiles and parity-tests its descendants |
| Package gates still consumed later artifacts | Revised DAG and Section 9 require declared predecessors only; WP0A remains the first slice |
| WP6 gate required future rank/calibration artifacts | WP6 now regenerates only knowledge/parity; WP7A owns rank and WP7B binds/regenerates calibration |

Final focused max closure review: all prior P0/P1 findings `RESOLVED`; WP0A
confirmed safe as the first medium-agent TDD slice; verdict `READY`.

Any substantial dependency, state, rights, runtime, or release-boundary change
returns this document to `DRAFT` and requires another max review.
