# Pre-Response Evidence Expansion

**Created:** 2026-07-28

**Status:** Task 5 complete; commit and push pending

**Branch:** `codex/pre-response-evidence-expansion`

**Depends on:** `2026-07-27-brand-data-and-pdf-yield-program.md` WP0-WP10

## Objective

Increase exact-Australian-model evidence before manufacturer replies arrive,
without rerunning an unchanged frozen cohort, opening historical P1 early, or
promoting dimensions-only research into the public catalog or FitDecision.

The work is successful only when it produces immutable official artifacts or
receipt-bound fields. Search hits, retailer mirrors, downloaded files and parsed
text are intermediate states, not evidence completion.

## Frozen Starting State

- repository `main`: `1dba9cbaecc61fd3ec012af41a575deb3735cbaa`;
- historical references classified: 8,089 / 8,089;
- current valid dimension receipts: 401 / 8,089;
- current P0 eligible targets: 947;
- historical P1 eligible targets: 3,939, and P1 remains blocked;
- unique historical PDF content indexed by MinerU: 516 / 516;
- valid indexed graph nodes: 927 / 942;
- exact or internal-model-list document edges: 548 / 3,761;
- frozen WP7A failures: 37 candidate-not-found, 5 transport failures and
  1 exact-model identity failure;
- frozen WP8 replay: 33 complete three-axis samples, 7 parser grammar gaps,
  2 MinerU structure gaps, 2 partial-axis samples and 1 source-content error;
- public receipt-bound dimensions: 332 / 3,515;
- public receipt-bound Verified Fit: 0;
- publication violations: 0.

## Non-Negotiable Boundaries

1. Preserve the original dirty worktree and all user-owned changes.
2. Do not rerun the full frozen 100-sample cohort unless a bound source,
   transport, resolver, parser or policy epoch changes.
3. Retailer mirrors may seed discovery but cannot satisfy official authority.
4. Exact model or explicit internal model-list proof is required. Do not infer
   sibling, regional or colour-suffix equivalence.
5. Keep all new source objects content-addressed and outside public paths.
6. Run only the controller-authorized P0 manifest. Do not start P1 while any
   eligible P0 current target remains.
7. Dimensions alone cannot produce Verified Fit. Installation, operation,
   service, water, power, drainage and ventilation requirements remain separate.
8. Provider fixtures and replies enter quarantine first; no external file may
   overwrite canonical or public data directly.

## Dependency Order

```text
freeze state and repair documentation truth
  -> classify the 43 typed failures by reusable failure mechanism
  -> change one bounded official discovery or transport epoch under TDD
  -> replay only affected frozen samples
  -> require a real exact-model yield before running the Esatto P0 manifest
  -> record the P0 discovery/recovery checkpoint atomically
  -> dry-run quarantined provider-response ingestion
  -> run repository gates and update this checkpoint
```

The current controller manifest is
`historical_batch_7cf4d9ad9d3efdd48f07e3c4`. It contains one current Esatto
dishwasher target, `DW42CS`, in `BOUNDED_DISCOVERY`. Earlier Esatto discovery
epochs stopped for zero yield. The manifest must not be executed until a
relevant source/resolver/transport epoch has changed and passed a real canary.

## Task 0: State Truth And Recovery Contract

- [x] Correct stale outreach documentation from two sent threads to eight.
- [x] Record this plan as the active pre-response execution checklist.
- [x] Confirm the original dirty worktree remains unchanged.
- [x] Bind baseline hashes and the controller manifest before network work.

Frozen bindings:

- WP7A report SHA-256:
  `6050a0ee7f0cf0ab7198d8993e47b54b704aaa371b439a83e3a8d3837fa3b169`;
- WP7A checkpoint SHA-256:
  `cf1f0f3376a46d34240c63c5eecb7249e4f4542b66f13d3ec6dec9c8ebec528c`;
- WP7A checkpoint policy SHA-256:
  `8a990ba19339788d57dd8c60168e78bd4296d8098e281ef1f7379c7733bd35ac`;
- scale-control SHA-256:
  `cc59575c05b25d907aa60b2648e5307602ff4acbab475b8065af73957eee147c`;
- manufacturer strategy SHA-256:
  `8ff339b3f253ffca5d9f152af2313a1f1505148d28d972ffb1eccbf240ebf7c9`;
- manufacturer source-policy SHA-256:
  `35e35b0bda7b5df46b3044e25404e30fd512141e4b29a66aa9d43ae6e9ff3db1`;
- authorized manifest:
  `historical_batch_7cf4d9ad9d3efdd48f07e3c4`.

Acceptance:

- documentation audit passes;
- no contradictory sent/draft state remains in canonical outreach docs;
- the clean worktree contains only intentional plan/document changes.

## Task 1: Typed Failure Inventory

- [x] Produce a deterministic shadow report for all 43 WP7A acquisition failures.
- [x] Separate candidate absence, official-route absence, transport failure,
  exact-model identity failure and source-content error.
- [x] Group by organization, brand, host, category and resolver contract.
- [x] Rank mechanisms by recoverable exact-model targets, not URL similarity.

Result:

- inventory:
  `pdf_acquisition_failure_inventory_e9c8830a5fd98dda28de51bc`;
- 43 failures representing 45 targets;
- 25 official-candidate absent, 7 official-route absent, 5 official artifact
  absent behind a product-page route, 5 official transport failures and 1
  exact-model identity failure;
- source-content errors: 0;
- publication-eligible records: 0.

Acceptance:

- all 43 failures have exactly one primary typed mechanism;
- report input hashes bind the immutable WP7A artifact and source policies;
- no sample becomes publication eligible.

## Task 2: New Discovery Or Transport Epoch

- [x] Select the highest-yield proven mechanism from Task 1.
- [x] Write a focused failing test using a real-shaped official fixture.
- [x] Implement the smallest reusable resolver, product-page extraction or
  transport-policy change needed for that mechanism.
- [x] Add dangerous counterexamples for cross-brand, sibling-model, redirect,
  HTML error payload and package-versus-product ambiguity.
- [x] Replay only samples affected by the changed epoch.

Result:

- resolver/policy epoch: `official-discovery-seed-policy@2026-07-28.1`;
- immutable canary checkpoint SHA-256:
  `5e52a0d9595f12d2e6f337bf08a6ef08199e85fbc87c0616b3afee02604dabea`;
- durable review:
  `data/architecture-v2/reviews/residentia-provenance-canary-20260728.json`;
- 3 / 3 exact-model product pages produced provenance-bound official PDFs;
- 3 / 3 PDFs passed transport, immutable storage and MinerU
  `content_list_v2` indexing;
- exact model text was retained for 3 / 3 documents;
- only 1 / 3 documents exposed a complete explicit physical W/D/H tuple;
  the other two remain parser-structure work and are not receipts;
- publication-eligible records: 0; Fit promotions: 0.

Go gate:

- at least one current P0 exact model, or at least three frozen exact models,
  acquire immutable official artifacts; and
- zero identity relaxation, zero public projection changes and zero Fit
  promotion.

Stop gate:

- two bounded executions with zero new valid exact-model artifacts stop that
  mechanism until another relevant epoch changes.

## Task 3: Controller-Authorized Current P0

- [x] Rebuild dependent control artifacts only after Task 2 changes a relevant
  epoch.
- [x] Confirm the controller still authorizes exactly one manifest and P1 is
  blocked.
- [x] Execute `historical_batch_7cf4d9ad9d3efdd48f07e3c4` or its deterministic
  successor if the changed epoch legitimately rekeys it.
- [x] Run discovery-object verification, publication audit and cumulative
  receipt replay.
- [x] Record the dimensions-scale checkpoint as one atomic state transition.

Result:

- discovery run: `p0-esatto-dw42cs-provenance-epoch-20260728`;
- immutable discovery object SHA-256:
  `4d147369937834fa8f6bbc3362319b49736f7e26f36229cbbc49a01f7c38ee25`;
- target outcome: `DW42CS` / Esatto / dishwasher became
  `NO_CANDIDATE_COMPLETE` after all five required source lanes completed;
- the Appliances Online specification PDF remained a retailer reference and
  did not become an official candidate;
- scale checkpoint:
  `historical-dimensions-checkpoint-b412d3658a003a4c030eb956`;
- release-DAG rebaseline:
  `historical-dimensions-rebaseline-0be79ad0ca9dff3b09fe96d9`;
- P0 eligible targets changed from 947 to 936 after the rebuilt DAG; P1
  eligible targets changed from 3,939 to 3,938 and remain blocked;
- receipt replay passed 408 / 408 sources; Fit publication violations: 0;
- current controller authorizes only
  `historical_batch_0bc627ff63fcb781f82803b5` and does not authorize the
  completed manifest again;
- system contract:
  `historical_evidence_system_49ace62b7b8d19b944c6d710`.

Acceptance:

- the run has a typed terminal result for `DW42CS`;
- any accepted field is exact-model and receipt-bound;
- cumulative replay and publication audits have zero violations;
- a zero-yield run advances only the relevant stage/cohort stop state.

## Task 4: Provider Response Ingestion Drill

- [x] Define one quarantined envelope for CSV, XLSX and JSON provider samples.
- [x] Preserve original bytes, file hash, organization, rights state, schema
  mapping, exact input/output model strings and row-level diagnostics.
- [x] Reject silent suffix collapse, missing axis definitions, package/product
  dimension mixing, unsupported AU identity and unknown cache/display rights.
- [x] Generate candidates and conflict reports only; do not publish fixtures.

Measured result:

- current plus historical exact identity allowlist: 8,092 unique
  category/brand/model tuples, including the explicit `washtower_combo`
  category used by the production catalogue;
- equivalent CSV, JSON and XLSX fixtures produce the same shadow claims;
- original provider and rights bytes are stored only under the external private
  outreach root using SHA-256 object paths;
- unknown or unbound rights, unsupported AU identity, suffix mismatch, scope or
  axis drift, formulas, macros, external XLSX objects and archive expansion all
  fail closed;
- persistence revalidates the private quarantine classification, all three
  rights actions and both publication/Fit isolation flags instead of trusting
  an upstream report object;
- CLI summaries expose hashes and counts only; exact provider rows and absolute
  private paths are not printed;
- every candidate remains `publicationEligible: false` and `fitEligible: false`.

Acceptance:

- equivalent CSV, XLSX and JSON fixtures normalize to the same shadow claims;
- malformed or rights-unknown fixtures fail closed;
- no fixture or private metadata appears in public output.

## Task 5: Verification And Closeout

- [x] Run focused tests after every TDD cycle.
- [x] Run Architecture V2, receipt replay, publication isolation, schema, lint,
  build and generated-output drift gates.
- [x] Update measured results and the recovery checkpoint below.
- [ ] Commit, push, review and merge only after all required checks pass.

Measured result:

- provider-response focused suite: 19 / 19 passed;
- complete repository suite: 2,944 / 2,944 passed;
- schema validation: 2,330 pages, 6,145 blocks, 0 errors;
- external receipt replay: 408 / 408 sources passed;
- public geometry: 3,515 products, 332 receipt-bound dimensions, 0 Verified
  Fit and 0 publication violations;
- Architecture V2 and ordinary production builds passed; the ordinary build
  succeeded without `FITAPPLIANCE_STORAGE_ROOT` and published the existing
  active release with 3,513 products, 349 current-retail products, 8,087
  historical replacement records and 0 release audit issues;
- generated site: 1,738 product pages and 1,983 sitemap URLs;
- production dependency audit retains one pre-existing moderate `qs` advisory
  through `googleapis`. The available bulk audit fix changes dozens of unrelated
  packages and is deferred to a separate dependency-upgrade batch.

## Recovery Checkpoint

**Last updated:** 2026-07-28

**Last completed:** Task 5, verification and closeout

**Current task:** commit, push and independent review

**Next allowed action:** review the final diff, commit and push the isolated
branch; merge requires a separate explicit decision

**Blocked action:** open historical P1 or publish any canary-derived dimensions

**External schedule:** first follow-up 2026-08-01; final follow-up 2026-08-06;
WP12 decision gate no earlier than 2026-08-10

**Do not do next:** rerun all 100 samples, open P1, weaken exact-model identity,
or publish any diagnostic result
