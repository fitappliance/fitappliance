# Official Registry, Installation Knowledge, and Fit V3 Implementation Plan

> **Execution rule:** Use TDD for each behavior change, the data-quality workflow for reconciliation, research-intelligence for source/licence claims, the MinerU appliance workflow for PDF evidence, and one final code review plus verification pass. This is a shadow pilot; no public Fit mutation is allowed.

**Goal:** Build and validate a multi-source pilot for 50 current refrigerators and 50 current dishwashers that converts official registry data and exact-model installation evidence into auditable Fit V3 shadow decisions.

**Design:** [Official Registry, Installation Knowledge, and Fit V3 Design](../specs/2026-07-12-official-registry-installation-fit-v3-design.md)

## Phase 1: Contracts, policies, paths, and baseline

**Primary skills:** writing-plans, data-quality analysis

- [x] Add source policy for Energy Rating, WELS, EESS, GS1, Icecat and direct-brand data, including roles, licence requirements and prohibited field promotion.
- [x] Add Architecture V2 paths for snapshot manifests, normalized observations, reconciliation, pilot, research queue, channel matrix and Fit V3 shadow report.
- [x] Record a baseline hash/count for the public catalog and current Fit publication audit so shadow zero-impact can be proven.
- [x] Add fixtures for exact match, axis inversion, adjustable height, internal duplicate conflict and no-match cases.

**Gate:** policy and fixtures validate without reading the external drive or changing generated public files.

## Phase 2: Immutable official-registry snapshots

**Primary skills:** test-driven-development, data-quality analysis

- [x] Add a strict snapshot manifest domain contract with SHA-256, byte length, media type, retrieval metadata, licence and portable object path.
- [x] Add a structured CSV parser dependency and fail on malformed or shifted rows.
- [x] Implement current Energy Rating metadata discovery and pilot-category acquisition into the external content-addressed store.
- [x] Add a WELS source contract and acquire the official complete overnight CSV without scraping result cards.
- [x] Verify payload replay against the recorded hash and prove a second acquisition reuses every object.

**Gate:** changing one source byte, licence field or object path makes replay fail; no raw third-party dataset is committed.

## Phase 3: Normalization and reconciliation

**Primary skills:** test-driven-development, data-quality analysis, systematic-debugging for real-source anomalies

- [x] Normalize source rows losslessly while retaining raw labels, row fingerprints and axis values.
- [x] Join only by canonical brand plus exact cosmetic-normalized model key.
- [x] Detect duplicate exact-model conflicts, suspected axis permutations, implausible values, missing dimensions and catalog disagreements.
- [x] Produce deterministic state, reason codes, per-axis deltas and next evidence actions.
- [x] Prove the known Electrolux, Westinghouse and Haier cases fail closed.

**Gate:** zero government observations mutate accepted geometry; every mismatch is visible and actionable.

## Phase 4: Deterministic 50 + 50 pilot and evidence queue

**Primary skills:** data-quality analysis, research-intelligence

- [x] Define current-listing eligibility from catalog availability plus retailer evidence, including a 90-day freshness bound and explicit out-of-stock exclusion.
- [x] Select category strata and enforce a stable per-brand cap.
- [x] Freeze 100 unique canonical product IDs against source snapshot hashes.
- [x] Generate one machine-readable research case per product with exact missing/conflicting fields, official-domain strategy and terminal state taxonomy.
- [x] Report category, brand, form-factor, reconciliation-state and evidence-coverage balance.

**Gate:** rerunning identical inputs produces byte-identical product selection and no duplicate IDs; insufficient strata are explicitly reported.

## Phase 5: Installation knowledge model

**Primary skills:** test-driven-development, MinerU appliance PDF parsing, appliance alias adjudication

- [x] Implement normative, exact-model and site-observation layers.
- [x] Model placement, operation, ventilation, water, power, drainage, delivery and professional-installation requirements.
- [x] Require current field-scoped receipt/fragment hashes for every model requirement and reject family/suffix sharing without an approved alias scope.
- [x] Add completeness audits by category and form factor, including chest-freezer lid operation.
- [x] Record legacy V2 receipt-bound field coverage separately, but require full V3 current/exact/applicable-model re-attestation before removing a research gap; do not change current `geometry_v2`.

**Gate:** unknown, non-applicable and explicit zero remain distinct; mixed-model and source-conflict fixtures fail.

## Phase 6: Fit V3 hard-constraint shadow evaluator

**Primary skills:** test-driven-development, systematic-debugging

- [x] Define precise site inputs for cavity, front/side operation, connection locations, pressure, power capacity, drainage, delivery path and measurement uncertainty.
- [x] Evaluate all applicable hard checks and expose pass/fail/unknown reasons, evidence gaps and site-input gaps.
- [x] Preserve the current outcome vocabulary and restrict numeric ranking to equivalent outcome/completeness bands.
- [x] Enforce current receipt binding, exact identity, applicable-field completeness and site precision before `VERIFIED_FIT`.
- [x] Generate Fit V3 readiness entries for all 100 models while keeping public Fit V2 unchanged.

**Gate:** adversarial tests cannot produce false `VERIFIED_FIT`; production Fit code and outputs remain unchanged.

## Phase 7: Data-channel and brand outreach package

**Primary skills:** research-intelligence, humanized business writing when available

- [x] Build a GS1 NPC/Icecat evaluation matrix for AU exact-SKU sample coverage, fields, rights, refresh and current published cost; leave coverage explicitly unmeasured until providers return the frozen sample.
- [x] Build brand data-request templates for PIM/e-commerce/trade teams, asking for machine-readable master data, installation assets, CAD and update cadence.
- [x] Prioritize all 12 brands represented in the pilot and record official contact route, requested field set and follow-up state without inventing email addresses.
- [x] Document attribution and public-display obligations for each adopted source.

**Gate:** every proposed channel has a go/probe/reject decision backed by measured coverage or a named unanswered question.

## Phase 8: Audit, release isolation, commit, deploy, and live verification

**Primary skills:** requesting-code-review, verification-before-completion, Vercel deployment and browser verification

- [x] Run focused tests, Architecture V2 regressions, lint, build, PDF JSON-first audit and fit publication audit.
- [x] Run an adversarial review for axis swaps, suffix aliases, stale snapshots, malformed CSV, rights gaps, missing external drive and public projection leakage.
- [x] Prove public catalog and Fit outputs are unchanged except for explicitly approved non-runtime documentation or policy artifacts.
- [x] Commit only task-owned files with a conventional message and push `main`.
- [x] Deploy the exact commit and verify aliases, live product search, representative product pages and zero false public Fit promotion.
- [x] Update the design and plan with measured results, residual risks and next-scale thresholds.

**Gate:** all checks pass, deployment is READY, live verification matches the commit, and shadow artifacts remain non-public.

### Measured execution results (2026-07-12)

- Implementation commit `438539a3dbffa856f35fbbfa1de2651d9b923fa8` was pushed to `main` and deployed as Vercel deployment `dpl_5WQbWV8m3vGMZDRBZKnhfKP3xkRn` (`READY`, `PROMOTED`). Vercel build logs confirm that exact Git SHA.
- Immutable acquisition captured four official-source objects totalling 18,046,278 bytes. A second acquisition reused all four content-addressed objects and reproduced byte-identical repository manifests.
- Normalization retained 3,706 current Australian refrigerator registrations, 1,285 current Australian dishwasher registrations and 696 WELS dishwasher records marked for sale.
- Exact-model reconciliation classified 1,258 catalog products as consistent, 203 as dimension conflicts, 27 as suspected axis permutations, 23 as registry-internal conflicts, 74 as exact matches without dimensions and 1,103 as having no exact registry match. No registry value was promoted to public geometry.
- The frozen pilot contains 50 refrigerators and 50 dishwashers across 12 brands. All 100 have deterministic research cases; zero fields satisfy the stricter Fit V3 receipt contract and zero products are eligible for `VERIFIED_FIT`.
- Test and build gates passed: 1,906 tests, 314 Architecture V2 tests, lint, production build, PDF JSON-first audit, Fit publication audit and both repository-only and external-storage Fit V3 audits. The production build reported zero publication violations, zero public hash drift, zero dimension promotions and zero false verified outcomes.
- Live `public/data/appliances.json` is byte-identical to the local approved projection (`sha256:504a03ffa665ba81003b0c57881c215ca0d51dc08e82f4de414c3cdb0f02277b`), contains 3,521 products and exposes no Fit V3 or official-registry keys and no `VERIFIED_FIT` value.
- Browser verification passed for the 900 x 1900 x 800 mm refrigerator query and representative Westinghouse refrigerator and Omega dishwasher product pages. Both product pages returned 200, exposed the exact model, used the `www` canonical and produced no console errors. The apex host permanently redirects to `www` while preserving path and query.
- Remaining constraints are explicit: government registries remain identity and baseline-dimension evidence rather than installation truth; GS1/Icecat exact-AU-SKU coverage is unmeasured pending provider responses; 11 of 12 pilot brands still need a confirmed structured-data route; and all 100 models remain quarantined from Fit V3 release until current exact-model installation receipts and precise site inputs exist.
- `npm audit --omit=dev --audit-level=high` found no high-severity issue; one pre-existing moderate `qs` advisory remains outside this pilot. The documentation audit still reports four pre-existing stale references in the older PDF/Fit-engine plan and no new drift from this work.

## Scale Decision After Pilot

Scale beyond 100 products only when:

- registry snapshot replay and licence checks are 100%;
- exact-model false joins are zero in adversarial review;
- every conflict has a deterministic next action or quarantine reason;
- at least 90% of selected models have an actionable exact official evidence route;
- Fit V3 has zero false `VERIFIED_FIT` outcomes;
- measured GS1/Icecat/direct-brand coverage justifies cost and rights obligations;
- the run can resume safely without the external drive affecting normal production builds.
