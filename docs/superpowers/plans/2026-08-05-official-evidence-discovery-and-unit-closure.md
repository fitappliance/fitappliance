# Official Evidence Discovery and Unit Closure Implementation Plan

> **For agentic workers:** The primary conversation owns this plan. One independent `gpt-5.6-sol` subagent at reasoning effort `ultra` has completed the required adversarial audit. Execute each approved slice with one `gpt-5.6-sol` subagent at reasoning effort `medium`; use TDD and primary-session verification before accepting it.

**Status:** READY, with the lifecycle entry gate below still unsatisfied

**Goal:** Rebuild official-source discovery on active-release lifecycle inputs, capture AnySearch leads without treating search as evidence, preserve missing-unit dimension rows as honest shadow observations, and promote only explicit-unit evidence through the existing receipt contract.

**Architecture:** The lifecycle-reconciled control plane selects targets. AnySearch is an agent-operated, bounded public discovery aid whose output enters a separate non-authoritative lead schema and is absent from builds and CI. Existing official validators, artifact transport, exact-model identity, MinerU and claim-semantics-v2 remain the evidence path. `H 850 x W 600 x L 635` can be normalized as a high-confidence shadow observation, but this plan permits a verified V2 claim only when the bound claim fragment explicitly states its unit.

**Tech stack:** Node.js ESM, Architecture V2 contracts, MinerU `content_list_v2`, content-addressed external evidence storage, Node test runner, AnySearch v3.0.1 for public discovery only.

## Permanent Agent Governance

- The primary conversation designs and maintains the whole task plan.
- Before implementation, one `gpt-5.6-sol` subagent at `ultra`, the highest available effort, audits the plan against current code. This audit completed on 2026-08-05 and is recorded below.
- Implementation uses one bounded `gpt-5.6-sol` subagent at `medium` per approved slice. The primary conversation supplies the allowed files, invariants, failing test and acceptance commands, then reviews the diff and reruns verification.
- Do not form implement-review-fix agent loops. One audit and one implementation agent per coherent slice are the default.
- Model choice never relaxes TDD, provenance, fail-closed behaviour, publication isolation or verification.

## Entry Gate: Lifecycle Reconciliation Must Finish First

This plan must not run against the current generated failure inventory. The prior 30-record “current-retail” cohort is stale. In the activated release, the sampled Whirlpool `WWEB9602IW`, Fisher & Paykel `DE5060M1`, Miele `TWD364`, Beko `BTM345PX` and TCL `P421CDN` rows are archived.

Before Task 1, complete and verify Tasks 1-4 of
`docs/superpowers/plans/2026-07-30-lifecycle-reconciled-p0-evidence-epoch-2.md`:

1. reconcile the 8,087 active historical identities and the two generated-only pseudo-models;
2. make the active retail release the source for lifecycle and public visibility while preserving the active historical-reference identity set;
3. make active-release publication the sole writer of runtime catalogue and replacement-reference artifacts;
4. rebuild classification, queues, candidate manifest, controller and audits from the active-release-bound graph.

The gate passes only when all of the following are true:

- `loadActiveRetailRelease()` validates every bound artifact and its hashes;
- the generated historical reference is no longer used as an independent lifecycle/publication owner;
- archived and market-reference rows cannot enter current target manifests;
- old refresh/build commands cannot write public replacement/runtime files;
- the fresh failure inventory and every bounded manifest bind the active-release epoch;
- receipt replay, active-release audit, replacement audit and Fit audit pass.

Until this gate passes, the five named models above are historical/offline parser and semantics fixtures only. They are not current-retail success canaries and do not contribute to a current-retail denominator.

## Global Constraints

- Read `docs/product-core-brief.md`, this plan and the lifecycle entry plan before every implementation slice.
- Prefer the smallest direct extension of an existing contract. No general search framework, new receipt schema or new publication lane is authorized here.
- AnySearch receives only public brand, exact model and approved official-domain query fields. Never send private feed URLs, email content, local paths, credentials, cookies, tokens or unpublished evidence.
- AnySearch output is a lead, never authority. Only fetched official bytes accepted by the existing verifier can become an official candidate or evidence source.
- AnySearch, browser automation and the evidence volume are absent from normal build, CI and offline replay.
- Historical and archived models may support old-appliance lookup but cannot receive retailer CTA, price, stock, current availability or current Fit output.
- Preserve raw values, raw labels, axis order, missing-unit state, scope, identity, URL, content hash and location for every observation.
- Missing unit never becomes fabricated text. Do not append `mm` to a quote or claim the source stated it.
- `L -> depth` is a field-scoped decision for a complete product-envelope tuple, not a global alias.
- Retailer W/H/D remain hints under `docs/product-core-brief.md`. Multiple retailer domains or wording variants cannot prove independent origin; unknown lineage is dependent.
- A retailer-supported or document-context unit inference cannot issue a receipt under claim semantics v2. Promotion requires explicit unit text in the bound claim fragment. Any future context-based promotion requires a separately audited claim-semantics contract.
- Existing claim-semantics-v2 and receipt schema 2/3 remain unchanged and replay byte-for-byte.
- Exact-model aliases remain limited to the existing reviewed W/H/D contract. Installation, operation and service fields require exact manual scope under a separate future contract.
- No dimension-only evidence may create `VERIFIED_FIT`.
- False acceptance and publication violations must remain zero.
- This plan ends at reviewed shadow readiness. Publication and deployment require a separate owner-approved release plan.

## Corrected Baseline

- The 43-total/30-current failure inventory is a historical generated snapshot, not an active-release truth set.
- The five high-value research cases remain useful offline fixtures:
  - Whirlpool `WWEB9602IW`: exact official H/W/L row without unit; AU retailer hints state W/H/D in mm.
  - Fisher & Paykel `DE5060M1`: exact suffix in official URL, family token `DE5060M` inside the manual.
  - Miele `TWD364`: official document identifies `TWD 364 WP`; alias remains unproven for the target.
  - Beko `BTM345PX`: official lead with ordinary HTTP 403.
  - TCL `P421CDN`: exact official product page, no proven installation PDF.
- Samsung exact AU support pages expose dynamic document routes; Electrolux/Westinghouse exposes stable official resource endpoints.
- Known search false positives include CHiQ `WDFL8T48W2 -> WFL8T48W2`, Mitsubishi AU `MR-BF325EK-W-A -> ...-A2`, and third-party manual mirrors.
- Fresh current-retail counts and canaries are intentionally unknown until the lifecycle gate rebuilds them.

## Runtime Flow

```text
active-release-bound controller manifest
  -> existing official brand resolvers
  -> bounded public search packet for typed unresolved targets only
  -> per-query AnySearch capture in external content-addressed storage
  -> non-authoritative search-lead import
  -> existing official host/artifact validator
  -> official artifact acquisition with persisted transport provenance
  -> identity-only extraction and W/H/D alias review where needed
  -> MinerU or official HTML extraction
  -> explicit V2 claims OR missing-unit shadow observations
  -> conflict/revocation epoch check
  -> existing receipt replay and shadow materialization
  -> publication and Fit isolation audits
```

## State Models

### Search lead

`QUERY_PENDING -> CAPTURED -> LEAD_IMPORTED -> OFFICIAL_URL_VALIDATED -> ARTIFACT_ACQUIRED`

Typed stops:

- `NO_PUBLIC_LEAD`
- `NON_OFFICIAL_LEAD_ONLY`
- `MODEL_MISMATCH`
- `REGIONAL_MISMATCH`
- `DYNAMIC_ROUTE_REQUIRED`
- `OFFICIAL_TRANSPORT_BLOCKED`
- `NO_DOCUMENT_FOR_PRODUCT_PAGE`

### Unit and axis observation

- `EXPLICIT_METRIC`: the bound fragment states `mm` or `cm`; eligible for existing V2 verification after all other checks.
- `DOCUMENT_METRIC_CONTEXT`: the same manufacturer artifact establishes a metric convention governing the row; shadow-only under claim semantics v2.
- `DOMAIN_INFERRED_MM`: exact official AU appliance row, labelled orthogonal axes, appliance-scale whole-number values, no contrary unit; shadow-only.
- `RETAILER_HINT_CORROBORATED`: exact-AU retailer hints agree with the inferred tuple and map L to depth; shadow-only because lineage/authority is insufficient.
- `UNIT_CONFLICT` or `UNIT_UNKNOWN`: quarantined.

Axis outcome is independent:

- `EXPLICIT_DEPTH`
- `ORTHOGONAL_LENGTH_AS_DEPTH_HINT`
- `AXIS_AMBIGUOUS`

For Whirlpool `H 850 x W 600 x L 635`, the expected result is `DOMAIN_INFERRED_MM` plus `ORTHOGONAL_LENGTH_AS_DEPTH_HINT`. Matching retailer W/H/D produces `RETAILER_HINT_CORROBORATED`, not a receipt. Removing retailer hints leaves the original shadow observation unchanged.

### Evidence epoch

- Identical source and policy hashes are replay: accepted state must be identical.
- New required-source hash, policy version or conflict source creates a new evidence epoch.
- An accepted target re-enters reconciliation in a new epoch; it cannot be excluded merely because an older receipt exists.
- A new conflict produces `ACCEPTANCE_REVOKED` or `ACCEPTANCE_QUARANTINED` before any new public projection is materialized.
- Revocation is append-only and preserves the old receipt, reason, superseding evidence hashes and effective epoch.

## File Map

### New domain and test files

- `src/domain/dimension-unit-observation.mjs`
- `tests/architecture-v2/dimension-unit-observation.test.mjs`
- `src/domain/public-search-lead.mjs`
- `tests/architecture-v2/public-search-lead.test.mjs`
- `src/domain/evidence-epoch-reconciliation.mjs`
- `tests/architecture-v2/evidence-epoch-reconciliation.test.mjs`

### New scripts and tests

- `scripts/architecture-v2/build-public-search-research-packet.mjs`
- `tests/architecture-v2/public-search-research-packet.test.mjs`
- `scripts/architecture-v2/import-public-search-leads.mjs`
- `tests/architecture-v2/public-search-lead-import.test.mjs`
- `scripts/architecture-v2/validate-public-search-leads.mjs`
- `tests/architecture-v2/public-search-lead-validation.test.mjs`

### Existing files modified only when required by a passing canary

- `src/domain/historical-official-candidate-manifest.mjs`
- `scripts/architecture-v2/run-historical-official-candidate-discovery.mjs`
- `src/domain/official-artifact-transport.mjs`
- `src/domain/evidence-artifact-pipeline.mjs`
- `src/domain/historical-evidence-recovery-batch.mjs`
- `src/domain/historical-evidence-recovery-audit.mjs`
- `src/domain/historical-evidence-publication.mjs`
- `src/domain/model-alias.mjs`
- `src/domain/mineru-document.mjs`
- `scripts/pdf-pipeline/architecture-v2-resolver-adapters.mjs`
- the specific brand resolver and its existing test file;
- `data/architecture-v2/policies/manufacturer-document-strategies.json`
- `package.json`

No composite receipt file, receipt-kind discriminator, bundle migration or new geometry-projector lane is part of this plan.

## Task 0: Complete and Verify the Lifecycle Entry Gate

**Execution source:** Tasks 1-4 of `2026-07-30-lifecycle-reconciled-p0-evidence-epoch-2.md`.

- [x] Execute those tasks with the permanent agent governance above.
- [x] Prove the active-release loader, identity partition, sole publication owner and active-bound control graph.
- [x] Rebuild the failure inventory only after all four tasks pass.
- [x] Freeze a new current-retail denominator and at most seven current canaries selected from that fresh inventory by failure mechanism and brand family.
- [x] Retain the five archived research cases in a separate historical/offline fixture set.

**Acceptance commands:**

```bash
npm run audit:active-retail-release
npm run audit:historical-replacement
npm run audit:historical-acceptance-receipts
npm run audit:fit-publication
npm run build:pdf-acquisition-failure-inventory
```

**Stop:** Any stale generated publication owner, lifecycle mismatch, orphaned receipt or archived current target keeps this plan blocked.

## Task 1: Add Honest Missing-Unit and Axis Observations

**Produces:** deterministic shadow observations only; no claims or receipts.

- [x] Write failing fixtures for explicit mm/cm, same-document metric context, H/W/L missing unit, package-length ambiguity, mixed units, decimal centimetres, adjustable ranges, D/D'/D\" and impossible values.
- [x] Implement `createDimensionUnitObservation(input)` in `src/domain/dimension-unit-observation.mjs`.
- [x] Bind the observation to source content hash, exact target identity, raw tuple, raw label, scope, category, page/fragment/bbox where available and policy version.
- [x] Return the unit and axis states above without synthesizing source text.
- [x] Add Whirlpool as an archived fixture and prove it remains non-receipted with or without retailer hints.
- [x] Keep retailer copy-family analysis diagnostic: same asset URL, tuple, wording or known syndication owner collapses to one family; unknown lineage is dependent and never unlocks promotion.

**Acceptance commands:**

```bash
node --test tests/architecture-v2/dimension-unit-observation.test.mjs
node --test tests/architecture-v2/dimension-expression-knowledge.test.mjs
npm run audit:historical-acceptance-receipts
```

## Task 2: Add Evidence-Epoch Re-entry and Revocation

**Produces:** deterministic replay for identical inputs and fail-closed re-evaluation for changed inputs.

- [x] Write failing tests showing an accepted target re-enters reconciliation when a required source hash, source set or policy version changes.
- [x] Implement an epoch descriptor containing target ID, prior receipt binding, sorted required-source hashes, conflict hashes and policy versions.
- [x] Preserve identical-input second-run semantics.
- [x] On changed input, append a new outcome: retained, superseded, revoked or quarantined. Never mutate or delete the old receipt.
- [x] Update batch selection so “previously accepted” is skipped only when the current epoch descriptor is identical.
- [x] Update recovery audit and shadow publication so revoked/quarantined evidence cannot project geometry.
- [x] Test crash/resume after epoch creation and before shadow materialization.

**Acceptance commands:**

```bash
node --test tests/architecture-v2/evidence-epoch-reconciliation.test.mjs
node --test tests/architecture-v2/historical-evidence-recovery-batch.test.mjs
node --test tests/architecture-v2/historical-evidence-recovery-audit.test.mjs
node --test tests/architecture-v2/historical-evidence-publication.test.mjs
npm run audit:historical-acceptance-receipts
```

## Task 3: Build a Separate, Resumable AnySearch Lead Lane

**Produces:** non-authoritative lead objects; it does not alter the official candidate enum.

- [x] Define `publicSearchLead` separately from `EvidenceSourceResolverResult`. It carries query ID/hash, result rank/title/URL/snippet, capture object hash, target binding and typed rejection state.
- [x] Reject query packets with free-form targets, more than 25 targets, absent lifecycle binding, local paths, email addresses, credentialed URLs, private feed hosts or fields outside `brand`, `exactModel`, `Australia` and approved official domains.
- [x] Emit at most two deterministic queries per target and request at most five results per query.
- [x] The primary session executes AnySearch v3.0.1. Implementation agents do not call arbitrary search services from project code.
- [x] Persist every raw query response immediately as a content-addressed object plus a per-query run pointer before processing the next query. Resume skips only a pointer whose query hash and response object verify.
- [x] Import leads without assigning authority.
- [x] In a separate validation step, pass each lead URL through the existing official brand host/artifact validator; only its output may enter the normal manifest as `official`.
- [x] Reject the CHiQ sibling, Mitsubishi region suffix and mirror fixtures.
- [x] Keep AnySearch out of `package.json`, `npm run build`, CI and offline replay.

**External checkpoint layout:**

```text
$FITAPPLIANCE_STORAGE_ROOT/evidence/discovery/public-search/runs/<run-id>/queries/<query-id>.json
$FITAPPLIANCE_STORAGE_ROOT/evidence/discovery/sha256/<aa>/<bb>/<sha256>.json
```

**Acceptance commands:**

```bash
node --test tests/architecture-v2/public-search-lead.test.mjs
node --test tests/architecture-v2/public-search-research-packet.test.mjs
node --test tests/architecture-v2/public-search-lead-import.test.mjs
node --test tests/architecture-v2/public-search-lead-validation.test.mjs
node --test tests/architecture-v2/evidence-source-verifier.test.mjs
```

## Task 4: Improve Reusable Official Resolvers and Persist Transport Provenance

**Produces:** existing-contract official candidates and acquired artifacts.

- [x] Run existing resolvers first on the fresh current canaries; use public-search leads only for typed unresolved targets.
- [x] Implement a stable brand route only when two exact-model canaries prove the family. One-off URLs remain research fixtures.
- [x] Preserve transport method already returned by `official-artifact-transport.mjs` in the persisted artifact and receipt replay inputs.
- [x] Extend Electrolux/Westinghouse static resource discovery only if current canaries prove the official endpoint family.
- [x] Extend Samsung support-page API discovery by content-addressing the exact network response that exposes document URLs.
- [x] Use F&P/Miele/Beko/TCL archived cases for offline resolver/parser regression only unless a fresh current model exhibits the same failure family.
- [x] Defer browser transport unless a fresh current canary remains blocked after ordinary fetch, curl, Scrapling and official API-route discovery.
- [x] If browser transport becomes necessary, first add an anonymous clean-profile contract that records browser engine/version, executable identity, profile hash, cookie count zero, requested/final/network-response URLs, status, redirects, response headers subset, byte hash/size and capture time. Accept response bytes only; rendered DOM or downloaded mirror bytes are not PDF evidence.

**Acceptance commands:**

```bash
node --test tests/architecture-v2/official-artifact-transport.test.mjs
node --test tests/architecture-v2/evidence-artifact-pipeline.test.mjs
node --test tests/architecture-v2/architecture-v2-resolver-adapters.test.mjs
node --test tests/pdf-pipeline/electrolux-group-official.test.mjs
node --test tests/pdf-pipeline/samsung-official.test.mjs
```

Only run a brand-specific test when that brand file changes.

## Task 5: Resolve Identity Before Field Extraction

**Produces:** exact identity, existing reviewed W/H/D alias, or quarantine.

- [x] Perform identity-only extraction from official route, cover/footer/model table and official support records before field parsing.
- [x] Keep the existing alias record requirements for reviewer, date and rationale; this plan does not remove or automate that gate.
- [x] Permit aliases only for `closedEnvelope.widthMm`, `heightMm` and `depthMm`, matching the current contract.
- [x] Treat spacing as normalization only when tokens are otherwise exact. Suffix removal, `WP`, colour, country and sibling changes require the existing reviewed alias record.
- [x] Keep all installation, operation and service claims quarantined for family/suffix manuals until a separate exact manual-scope design is audited and approved.
- [x] Add accepted W/H/D alias, insufficient bridge, conflicting sibling, regional variant and later-conflict revocation fixtures.

**Acceptance commands:**

```bash
node --test tests/architecture-v2/model-alias.test.mjs
node --test tests/architecture-v2/model-alias-audit.test.mjs
node --test tests/architecture-v2/official-identity-evidence.test.mjs
npm run audit:model-aliases
```

## Task 6: Parse Explicit Claims and Preserve Inferred Observations

**Produces:** existing V2 claims when explicit; shadow observations otherwise.

- [x] Keep explicit-unit PDF/HTML extraction on claim semantics v2.
- [x] Emit `dimensionUnitObservation` for same-document metric context and all other missing-unit rows. Only a bound fragment containing an explicit unit may enter V2.
- [x] Preserve MinerU page, bbox, fragment hash, axis order and model scope.
- [x] Reject packaging rows, fixed representations of ranges, family tables without model-column association and unresolved alternate depths.
- [x] Do not parse installation/service fields through a W/H/D alias.
- [x] Prove all pre-existing V2 receipts replay unchanged.

**Acceptance commands:**

```bash
node --test tests/architecture-v2/mineru-document.test.mjs
node --test tests/architecture-v2/evidence-artifact-verifier.test.mjs
node --test tests/architecture-v2/evidence-artifact-pipeline.test.mjs
npm run audit:historical-acceptance-receipts
```

## Task 7: Run a Bounded Fresh Current-Retail Shadow Epoch

**Entry gate:** Tasks 0-6 pass and online acquisition is authorized.

- [x] Use only controller-issued `BOUNDED_DISCOVERY` manifests with at most 25 fresh current-retail targets.
- [x] Run resolver, bounded search-lead fallback, official validation, acquisition, identity and extraction in dependency order.
- [x] Record each target’s funnel state, source hashes, time and typed stop.
- [x] Count explicit V2 receipts separately from missing-unit observations; inferred observations never count as receipt yield.
- [x] Stop a family after two consecutive no-yield attempts unless a new epoch changes a named resolver, transport, parser or identity capability.
- [x] Materialize shadow outputs only.

**Execution deviation:** The first one-target Miele manifest failed closed on exact identity and exposed a controller loop that reissued an already checkpointed cohort after the bounded window was regenerated. After a TDD fix made completed cohorts non-repeatable across regenerated windows within the current capability epoch, the controller issued the next one-target Beko manifest. A capability-epoch rebaseline may deliberately reopen a cohort; a release-DAG reconciliation may not. No manifest was selected manually or run without controller authorization.

**Measured success:**

- at least 20% of the fresh unresolved current cohort moves to a verified official artifact or exact official HTML stage;
- explicit V2 receipt gain is reported but has no fabricated minimum;
- every inferred-unit case remains non-receipted;
- false acceptance, public mutation, Fit publication violations and dimensions-only `VERIFIED_FIT` gains remain zero.

**Measured result:** one of two unique fresh current-retail targets reached verified official artifacts (50%). Beko `BFR575PX` produced one explicit-unit V2 receipt and zero inferred-unit observations; Miele `G7609SCUXXLCLST` remained fail-closed. Public catalogue, replacement reference and active-release hashes remained unchanged.

## Task 8: Verify Shadow Readiness and Stop

- [x] Replay the full existing receipt corpus and new epoch outcomes twice; semantic results must match on identical inputs.
- [x] Simulate interruption after each per-query checkpoint, artifact write, MinerU write, identity decision, epoch decision and shadow write.
- [x] Hash the pre-run public catalogue, historical replacement reference and active release; verify the hashes are unchanged after the shadow run.
- [x] Remove only the new run pointers in an isolated copy to test shadow rollback; content-addressed evidence objects remain append-only.
- [x] Run syntax checks for every new or changed `.mjs` executable because repository lint does not cover them.
- [x] Run the full offline build after the lifecycle gate has removed stale publication writers.
- [x] Mark this plan complete at reviewed shadow readiness. Candidate publication, public rollback, deployment and the next live cohort require a separate owner-approved task.

**Acceptance commands:**

```bash
node --check src/domain/dimension-unit-observation.mjs
node --check src/domain/public-search-lead.mjs
node --check src/domain/evidence-epoch-reconciliation.mjs
node --check scripts/architecture-v2/build-public-search-research-packet.mjs
node --check scripts/architecture-v2/import-public-search-leads.mjs
node --check scripts/architecture-v2/validate-public-search-leads.mjs
npm run lint
npm run validate-schema
npm run audit:historical-acceptance-receipts
npm run audit:historical-replacement
npm run audit:fit-publication
npm run audit:active-retail-release
npm test
npm run build
```

## Execution Checkpoint Protocol

Before each medium-effort implementation slice, record in this plan:

1. current task and unchecked step;
2. active release, manifest and input artifact hashes;
3. files the subagent may edit;
4. focused failing test and expected failure;
5. acceptance commands;
6. control-plane, shadow-only or publication capability;
7. result, diff review and primary-session verification.

The implementation subagent returns a bounded diff and test evidence. The primary conversation inspects the diff, reruns focused tests and updates the checkpoint. Planning authority and final acceptance remain in the primary conversation.

## Independent Audit Record

**Reviewer:** one `gpt-5.6-sol` subagent, reasoning effort `ultra`

**Date:** 2026-08-05

**Initial verdict:** NOT READY

**Resolved P0 findings:**

1. Stale current-retail baseline: corrected with a hard lifecycle prerequisite, fresh active-release-bound denominator and archived-only status for the five research fixtures.
2. Unsafe composite receipt: removed. Missing-unit and retailer-corroborated tuples remain non-receipted observations; promotion uses only existing V2 authority rules.

**Resolved P1 findings:**

1. Receipt schema migration risk: removed the composite lane and all new receipt schema work.
2. Later-conflict blind spot: added evidence-epoch re-entry, append-only revocation/quarantine and identical-input replay semantics.
3. AnySearch contract mismatch/resume gap: added a separate lead schema, per-query content-addressed checkpoints and a distinct official-validation conversion step.
4. Alias scope/order mismatch: retained the existing reviewed W/H/D-only alias contract and moved identity extraction before field parsing; installation/service aliasing is out of scope.
5. Browser provenance gap: browser support is deferred by default and requires a clean-profile, network-byte provenance contract before use.

**Resolved P2 finding:**

Shadow rollback now checks unchanged public hashes and append-only objects; candidate publication/rollback is a separate plan. Verification adds explicit `node --check` coverage and a full offline build after lifecycle reconciliation.

**Post-correction verdict:** READY after the lifecycle entry gate passes. No implementation, publication or deployment is authorized by this status.

## Task 8 Adversarial Closure

The final ultra review initially returned `NOT READY` with four execution blockers and four integrity or coverage gaps. The reviewed correction closed them as follows:

1. Identity-less MinerU output now fails preflight even when no sibling model is present. Exact hash-bound product, market API, support API and reviewed family contexts remain supported.
2. A completed legacy shadow run resumes from its persisted state and result before consulting the regenerated manifest window. The report body hash is recomputed rather than trusted.
3. Every new incomplete run stores a selected, content-addressed input snapshot beside its state. Missing, changed or state-unbound snapshots fail closed; completed legacy runs remain resumable without a retroactive snapshot.
4. Multi-target discovery restart validates the immutable run pointer before applying prior-manifest duplicate protection.
5. `reconciliationContext.evidenceEpoch` is now a directly validated optional contract with an ID derived from its descriptor SHA-256; the batch runner no longer strips it before validation.
6. Receipt-audit timestamp reuse first recomputes the prior semantic audit hash.
7. Interruption coverage includes `IDENTITY_VERIFIED` and `DECISION_PREPARED`, in addition to discovery, MinerU, artifact, family-history and final checkpoints.
8. Scale-control coverage proves that a capability rebaseline may reopen work and a later release-DAG reconciliation does not erase the post-capability cohort checkpoint.

**Final verdict:** `READY_FOR_REVIEWED_SHADOW_ONLY`. This verdict authorizes no promotion, deployment, commit, push or email action.
