# Historical Model PDF Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` to implement this plan task-by-task. Use
> `parsing-appliance-pdfs-with-mineru` for every PDF-derived claim and
> `superpowers:test-driven-development` for behavior changes. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Classify and account for all 8,095 historical appliance models,
repair every reusable legacy PDF through the current MinerU/receipt rules, and
acquire the remaining discoverable official documents without unsafe
publication.

**Architecture:** Add a deterministic model-level classification sidecar above
the existing category/brand/series PDF grammar knowledge base. A separate
legacy-library audit joins old JSON summaries, source-document metadata,
content-addressed PDFs, MinerU indexes, exact-model mappings, grammar profiles
and receipts. Offline repair runs before network acquisition; online work is
then generated from typed next actions and executes in lifecycle- and
brand-bounded batches through the existing resumable Architecture V2 runner.

**Tech Stack:** Node.js ESM, deterministic JSON/Markdown generators, MinerU
3.4.4 `content_list_v2`, Architecture V2 evidence objects and receipts, Node
test runner, external content-addressed storage at
`/Volumes/UGREEN-1TB/FitAppliance`.

## Global Constraints

- A model classification is a derived research view, never evidence authority.
- No PDF claim may be read directly; raw PDF and current policy-pinned MinerU
  JSON must both exist and replay before receipt issuance.
- Product identity, PDF identity, lifecycle, source authority, extraction state,
  conflict state and publication eligibility remain independent fields.
- A model does not need one unique PDF. Shared manuals are deduplicated by PDF
  SHA-256 and may serve a model only where exact model/page scope is proven.
- Some models legitimately have no discoverable official PDF. Completion means
  a typed terminal outcome, not a fabricated document or retailer substitution.
- Legacy `data/pdf-evidence-raw/*.json`, `pdftotext` fields and reviewer labels
  are discovery hints only. They cannot be promoted directly.
- Retailer PDFs are reference fingerprints only until an official equivalent is
  independently rediscovered and reprocessed.
- Existing cumulative receipts are append/merge state. No batch may replace,
  weaken or delete prior accepted evidence.
- `CURRENT_RETAIL` may project to the current catalogue; `CATALOG_ARCHIVED` and
  `REGISTRY_ONLY` may project only to historical replacement data.
- Normal builds and deployment must remain independent of the external volume.
- W/H/D evidence alone can never produce `VERIFIED_FIT`.

---

## 1. Current-State Contract Map

| Boundary | Current producer | Current persisted state | Consumer | Required change |
| --- | --- | --- | --- | --- |
| Historical models | `build-historical-appliance-reference.mjs` | 8,095 records | replacement search, recovery queue | Add derived classification only; do not mutate model truth |
| Brand/PDF grammar | `build-dimension-expression-knowledge.mjs` | 4 categories, 358 category-brand groups, 480-index snapshot | parser research | Rebuild against current 491 indexes and expose model joins |
| Legacy summaries | old PDF pipeline | 1,789 JSON files | legacy source-document seed | Audit as untrusted hints; never issue receipts |
| Source metadata | source-document builders | 2,005 records | recovery queue | Link document identity, URL, authority and content hash to model audit |
| Raw evidence | fetch/recovery runners | content-addressed external PDFs | MinerU and online audit | Inventory every physical path, deduplicate by hash, detect missing objects |
| MinerU evidence | `runMineruPdfToJson` | content-addressed JSON + cache indexes | exact-model parser | Validate parser/model epoch, source binding and content hash |
| Accepted evidence | promotion command | cumulative acceptance bundle | current/historical projectors | Append/merge only after full online replay |
| Public current data | public projector | current catalogue | live fit search | Explicit `CURRENT_RETAIL` lifecycle filter remains mandatory |
| Historical data | historical reference publisher | category shards | old-appliance lookup | Accept archived/registry-only receipts without current visibility |

## 2. Classification Contract

Every historical model receives exactly one record with the following
orthogonal axes. The record must retain every linked document/evidence edge;
the summary state is a roll-up and must never hide a stale, conflicting or
unprocessed document attached to the same model.

### 2.1 Hierarchy

1. `category`: `fridge`, `dishwasher`, `dryer`, `washing_machine`.
2. `canonicalBrand` plus all observed raw variants.
3. `groupType`: `marketing_series`, `document_family`, `parser_family`,
   `model_specific`, or `unclassified`.
4. `groupName` and related PDF grammar profile IDs when observed.
5. exact `referenceId`, brand, model and lifecycle.

### 2.2 Evidence axes

- `bestCorpusState`: `RECEIPT_BOUND`, `CURRENT_MINERU`, `STORED_PDF`,
  `LEGACY_METADATA_ONLY`, `SOURCE_URL_ONLY`, or `NO_SOURCE`.
- `sourceAuthority`: `OFFICIAL`, `REFERENCE`, `MIXED`, or `NONE`.
- `identityScope`: `EXACT_MODEL`, `PAGE_SCOPED_EXACT`, `DOCUMENT_FAMILY`,
  `ALIAS_CANDIDATE`, `AMBIGUOUS`, or `UNPROVEN`.
- `extractionState`: `ALL_AXIS_SCALAR`, `ALL_AXIS_RANGE`, `PARTIAL_AXIS`,
  `NO_DIMENSION_EXPRESSION`, `PARSER_GAP`, or `NOT_PARSED`.
- `conflictState`: `NONE`, `REGISTRY_CONFLICT`, `SOURCE_CONFLICT`,
  `IDENTITY_CONFLICT`, or `INVALID_DIMENSIONS`.
- `receiptState`: `CURRENT_VALID`, `LEGACY_UNBOUND`, `STALE_POLICY`, or `NONE`.
- `documentLinks`: all linked document IDs, object hashes, grammar profiles,
  evidence states and repair actions, sorted deterministically.
- `corpusSummary`: counts of every linked document state rather than only the
  strongest state.

The model-resolution queue and document-repair queue are separate. A model can
already have safe evidence while an old duplicate PDF still requires corpus
repair; conversely, a fully indexed PDF does not prove model identity.

### 2.3 Operational classes

| Class | Meaning | Required next action |
| --- | --- | --- |
| `COMPLETE_RECEIPT` | Current exact receipt already supplies safe model dimensions | `NO_ACTION` |
| `OFFLINE_REPLAY` | Current MinerU and exact identity exist but receipt is missing | `REPLAY_CURRENT_MINERU` |
| `OFFLINE_PARSER_REPAIR` | Current MinerU is bound but grammar/axis extraction failed | `REPAIR_SHARED_GRAMMAR` |
| `PDF_RECONVERT` | Immutable PDF exists but current MinerU is missing/stale/corrupt | `CONVERT_STORED_PDF` |
| `OFFICIAL_REACQUIRE` | Official URL exists but immutable current object does not | `REACQUIRE_OFFICIAL_SOURCE` |
| `REFERENCE_REDISCOVERY` | Only retailer/reference PDF evidence exists | `REDISCOVER_OFFICIAL_SOURCE` |
| `OFFICIAL_DISCOVERY` | No usable source exists | `DISCOVER_OFFICIAL_SOURCE` |
| `IDENTITY_RESEARCH` | Family, suffix, alias or page scope is unresolved | `RUN_IDENTITY_CLOSURE` |
| `CONFLICT_QUARANTINE` | Competing exact evidence or invalid dimensions exist | `RUN_CONFLICT_CLOSURE` |
| `OFFICIAL_HTML_ONLY` | Official source proves no PDF path but exact HTML evidence exists | `RECORD_NO_PDF_HTML_TERMINAL` |
| `NO_OFFICIAL_SOURCE` | Bounded official research exhausted without PDF or exact HTML | `RECORD_NO_SOURCE_TERMINAL` |

Precedence is fail closed and policy-driven. Unresolved exact-authority source,
identity or invalid-dimension conflicts outrank `COMPLETE_RECEIPT`. A government
registry dimension conflict remains recorded independently but may be
superseded for model dimensions by an exact official receipt under explicit
policy; it is not silently erased.

Priority is independent of class: `P0_CURRENT_RETAIL`,
`P1_CATALOG_ARCHIVED`, `P2_REGISTRY_ONLY`, then `P3_CONFLICT`. This preserves
commercial current coverage while still completing the old-device lookup corpus.

## 3. Persistence Semantics

| Artifact | Semantics | Second-run rule |
| --- | --- | --- |
| model classification JSON/Markdown | deterministic replaceable snapshot | same inputs produce same semantic payload |
| legacy PDF audit | deterministic replaceable snapshot | physical paths may change; object hashes and outcomes may not drift silently |
| raw PDF/MinerU objects | immutable append-only by SHA-256 | never rewrite or delete on retry/rollback |
| run state/events | append/checkpoint in run-local directory | resume only the persisted batch and pending targets |
| cumulative acceptance bundle | append/merge by target + receipt binding | later batches cannot erase prior entries |
| current/historical projections | derived release artifacts | rebuilt and committed atomically with bundle/manifest/audits |

## 4. Dependency DAG

```text
Baseline freeze
  -> Classification schema
  -> Legacy library inventory
  -> Model-level classification snapshot
  -> Offline MinerU repair
  -> Shared grammar repair
  -> Reclassify all 8,095
  -> Build typed acquisition queue
  -> Current-retail official acquisition
  -> Archived acquisition
  -> Registry-only acquisition
  -> Terminal no-PDF/no-source closure
  -> Cumulative promotion + lifecycle projections
  -> Final full replay and coverage report
```

No online acquisition begins before the offline model classification and old
library audit are complete. No promotion begins before every selected online
batch has a passing full replay audit.

---

### Task 0: Freeze a reproducible baseline

**Files:**
- Create: `data/architecture-v2/reviews/automated/historical-model-pdf-baseline.json`
- Create: `scripts/architecture-v2/build-historical-model-pdf-baseline.mjs`
- Test: `tests/architecture-v2/historical-model-evidence-classification.test.mjs`

- [ ] Record hashes and counts for the 8,095-record historical reference,
  1,789 legacy JSON summaries, 2,005 source documents, current PDF objects,
  MinerU indexes, cumulative receipts and public/historical projections.
- [ ] Record external storage marker, volume UUID, free space, MinerU version and
  model revision without placing machine-specific paths in public data. Keep
  volatile environment observations outside the deterministic baseline digest.
- [ ] Fail if reference IDs are duplicated, category totals do not sum to 8,095,
  or a current receipt is missing from the historical reference.

**Gate:** later coverage claims use this immutable denominator and source hash
set rather than changing totals mid-run.

### Task 1: Implement the model classification schema

**Files:**
- Create: `src/domain/historical-model-evidence-classification.mjs`
- Create: `data/architecture-v2/policies/historical-model-evidence-classification-policy.json`
- Test: `tests/architecture-v2/historical-model-evidence-classification.test.mjs`

- [ ] Write failing tests for every enum, operational-class precedence,
  lifecycle priority, exact 8,095 accounting and deterministic ordering.
- [ ] Keep evidence axes orthogonal; never derive source authority from a URL
  substring or extraction confidence.
- [ ] Require explicit reason codes and evidence object IDs for every class
  stronger than `OFFICIAL_DISCOVERY`.
- [ ] Ensure receipt-bound archived models remain absent from the current public
  projection.

**Gate:** every input record receives exactly one valid operational class and
one next action; no class itself grants publication.

### Task 2: Build the unified legacy PDF library audit

**Files:**
- Create: `src/domain/legacy-pdf-library-audit.mjs`
- Create: `scripts/architecture-v2/audit-legacy-pdf-library.mjs`
- Create: `data/architecture-v2/reviews/automated/legacy-pdf-library-audit.json`
- Test: `tests/architecture-v2/legacy-pdf-library-audit.test.mjs`

- [ ] Inventory and SHA-deduplicate all external PDFs across `evidence/objects`
  and `evidence/web`; retain all physical provenance paths.
- [ ] Validate PDF magic, size, hash-addressed path, MinerU index filename,
  parser/model epoch, derived JSON hash and source-PDF binding.
- [ ] Join 1,789 legacy JSON summaries and 2,005 source documents by canonical
  model/product/URL without trusting old extracted fields.
- [ ] Classify old zero clearances, boolean plumbing/ventilation flags and
  `pdftotext` approvals as `LEGACY_UNBOUND`, not valid current claims.
- [ ] Report duplicate models, duplicate content, orphan PDFs, orphan MinerU,
  source-authority mismatch, exact/family/ambiguous identity and repair action.

**Gate:** every physical PDF and every legacy summary is accounted for once;
unknown or broken joins remain explicit.

### Task 3: Generate the 8,095-model classification and Markdown index

**Files:**
- Create: `scripts/architecture-v2/build-historical-model-evidence-classification.mjs`
- Create: `data/architecture-v2/generated/historical-model-evidence-classification.json`
- Create: `docs/architecture-v2/historical-model-evidence-classification.md`
- Test: `tests/architecture-v2/historical-model-evidence-classification.test.mjs`

- [ ] Join the historical reference, dimension-expression knowledge, legacy
  audit, source documents, recovery queue and cumulative bundle.
- [ ] Store one JSON record per model; render Markdown by category, brand,
  series/document family, operational class, next action and lifecycle.
- [ ] Preserve every model-to-document edge and report document-state counts;
  never collapse multiple documents into a single lossy corpus state.
- [ ] Include rates as well as counts and list the highest-impact parser/source
  gaps without dumping all 8,095 rows into Markdown.
- [ ] Regeneration requires an explicit deterministic `generatedAt`; normal
  offline build does not require the external volume.

**Gate:** JSON contains exactly 8,095 unique reference IDs and Markdown totals
reconcile to JSON at every category/class/lifecycle level.

### Task 4: Repair the stored PDF corpus offline

**Files:**
- Modify: `src/domain/historical-mineru-backfill.mjs`
- Modify: `scripts/architecture-v2/backfill-historical-mineru.mjs`
- Modify: `data/architecture-v2/reviews/automated/historical-mineru-backfill-audit.json`
- Test: `tests/architecture-v2/historical-mineru-backfill.test.mjs`

- [ ] Rebuild the inventory against all current physical PDFs, not the obsolete
  69-document snapshot.
- [ ] Convert only `missing` and `stale` unique hashes; quarantine corrupt PDFs
  and indexes instead of deleting them.
- [ ] Checkpoint after each hash and prove a second run invokes MinerU zero times
  for valid cached objects.
- [ ] Rebuild dimension-expression knowledge after backfill and regenerate the
  model classification.

**Gate:** all stored unique valid PDFs are either current-indexed or have a typed
terminal parser failure; duplicate paths never trigger duplicate conversion.

### Task 5: Repair shared PDF grammars by category and document family

**Files:**
- Modify: `src/domain/mineru-document.mjs`
- Modify: `src/domain/dimension-expression-knowledge.mjs`
- Modify: category/brand fixtures under `tests/fixtures/architecture-v2/`
- Test: `tests/architecture-v2/mineru-document.test.mjs`
- Test: `tests/architecture-v2/dimension-expression-knowledge.test.mjs`

- [ ] Cluster parser failures by category, brand, document family and grammar
  profile rather than patching one model at a time.
- [ ] For each grammar change, add adversarial exact/sibling/family, axis-order,
  unit, range, packaged-size and multi-depth tests before implementation.
- [ ] Permit only structures proven by current MinerU fragments; keep ambiguous
  diagrams and D/D'/D'' depth variants quarantined.
- [ ] Re-run all documents sharing the grammar and compare semantic receipts,
  not volatile timestamps.

**Gate:** a grammar fix improves a measured family cohort with zero new false
identity, axis or scope acceptance.

### Task 6: Replay repairable models before any network acquisition

**Files:**
- Create: `scripts/architecture-v2/build-historical-pdf-offline-replay-batch.mjs`
- Modify: cumulative acceptance bundle only through the existing promotion CLI
- Test: `tests/architecture-v2/historical-pdf-offline-replay.test.mjs`

- [ ] Select only `OFFLINE_REPLAY` and repaired `OFFLINE_PARSER_REPAIR` models
  with current immutable objects and exact identity.
- [ ] Replay raw PDF, MinerU JSON, claims and receipt bindings through the same
  attestation/projector used by online recovery.
- [ ] Split batches by lifecycle and brand; any conflict or incomplete source
  inventory blocks the whole selected promotion batch.
- [ ] Promote only after full object replay and cumulative-bundle mutation tests.

**Gate:** old local evidence is exhausted safely before downloading duplicate
documents.

### Task 7: Build the post-repair acquisition queue

**Files:**
- Create: `src/domain/historical-model-pdf-acquisition.mjs`
- Create: `scripts/architecture-v2/build-historical-model-pdf-acquisition-queue.mjs`
- Create: `data/architecture-v2/reviews/automated/historical-model-pdf-acquisition-queue.json`
- Test: `tests/architecture-v2/historical-model-pdf-acquisition.test.mjs`

- [ ] Generate jobs only after the repaired classification snapshot is stable.
- [ ] Deduplicate by normalized official URL/document fingerprint while keeping
  all target edges.
- [ ] Route official reacquisition, reference rediscovery, official discovery,
  identity research and conflict closure separately.
- [ ] Order `P0_CURRENT_RETAIL`, `P1_CATALOG_ARCHIVED`,
  `P2_REGISTRY_ONLY`, `P3_CONFLICT`; then category, brand, series and model.
- [ ] Exclude `COMPLETE_RECEIPT` and every already accepted target.

**Gate:** every nonterminal model appears in exactly one next-action queue; no
retailer/reference job is receipt-eligible.

### Task 8: Acquire current-retail official documents in bounded batches

**Files:**
- Reuse: `scripts/architecture-v2/run-historical-evidence-recovery.mjs`
- Update: classification and acquisition reports after each audited promotion

- [ ] Run one canary per category, then one brand at a time with verified job
  counts, run-local state and full online replay.
- [ ] Repair systemic resolver/parser failures before widening the same cohort.
- [ ] Promote only zero-retryable, fully accounted batches.
- [ ] Regenerate current and historical projections and prove no unknown field
  or dimensions-only evidence becomes `VERIFIED_FIT`.

**Gate:** after bounded retries, all P0 models end accepted or in a replayable
typed terminal state. Retryable items are incomplete and must be zero before
the P0 cohort closes.

### Task 9: Acquire archived and registry-only documents

**Files:**
- Reuse the Task 8 runner and Task 7 queue
- Update: historical reference, replacement shards and classification reports

- [ ] Process archived models before registry-only models, grouped by
  category/brand/series to maximize shared-document reuse.
- [ ] Preserve government registry status and dimension conflicts as independent
  evidence; exact official receipts may supersede dimensions but never erase the
  conflict record.
- [ ] Prevent every archived/registry-only acceptance from entering the current
  public catalogue.
- [ ] Stop or reduce a brand cohort when retryable/systemic failure thresholds
  are exceeded.

**Gate:** old-device lookup coverage improves while the current catalogue hash
changes only for separately audited current-retail receipts.

### Task 10: Close no-PDF and identity/conflict outcomes

**Files:**
- Modify: automated evidence-resolution cases and model classification outputs
- Test: identity, no-PDF and conflict terminal fixtures

- [ ] After bounded official PDF discovery is exhausted, test exact official
  product/support HTML through the existing receipt rules.
- [ ] Record `OFFICIAL_HTML_ONLY` only with exact model, AU market, immutable
  HTML object and all claimed dimensions; otherwise retain unknown.
- [ ] Run alias closure for suffix, regional, hinge/colour and family cases;
  transfer only fields explicitly approved by evidence policy.
- [ ] Record `NO_OFFICIAL_SOURCE` only after required resolvers complete with a
  deterministic source-set receipt; never infer it from one failed URL.

**Gate:** every unresolved model has a replayable terminal reason and can
automatically re-enter research when policy/source epochs change.

### Task 11: Release, audit and document final coverage

**Files:**
- Modify: `docs/product-core-brief.md` with measured final outcomes
- Modify: `docs/architecture-v2/historical-model-evidence-classification.md`
- Modify: generated bundle/reference/manifest/audit artifacts atomically

- [ ] Run a full online replay over every newly accepted object and an offline
  replay over the complete cumulative bundle.
- [ ] Rebuild historical reference with external snapshots, publish shards, then
  run normal builds with `FITAPPLIANCE_STORAGE_ROOT` unset.
- [ ] Report model coverage by category, brand, lifecycle, operational class,
  source authority, identity, extraction state and terminal reason.
- [ ] Report document coverage separately: physical PDFs, unique hashes,
  current MinerU indexes, exact mappings, grammar coverage and receipts.
- [ ] Commit each reviewed release transaction; keep immutable external objects
  through rollback. Deploy only after the user separately authorizes it.

**Final gates:**

```bash
npm test
npm run lint
env -u FITAPPLIANCE_STORAGE_ROOT npm run build:architecture-v2
env -u FITAPPLIANCE_STORAGE_ROOT npm run build
git diff --check
```

**Gate:** all 8,095 models are classified and accounted for; every stored PDF is
current-indexed or terminally explained; every discoverable missing official
document has a bounded result; no unsafe publication or prior-evidence loss is
possible.

---

## 5. Adversarial Preflight Review

The plan must remain fail closed in these scenarios:

1. **Duplicate PDF paths:** one hash is parsed once and retains every model/path
   edge.
2. **Parser upgrade:** previous JSON becomes `STALE_POLICY`; it is never reused
   silently.
3. **Family manual:** a family PDF may classify the family but cannot donate a
   model claim without page/model scope.
4. **Wrong suffix/region:** similar SKU and global-host URLs remain identity
   research until AU evidence closes the alias.
5. **Multiple depths:** product closed, handle, door-open and installation depth
   stay separate; ambiguity blocks the closed envelope.
6. **Legacy zero clearance:** `0` remains an untrusted old value, not a verified
   manufacturer requirement.
7. **Retry/resume:** a crash resumes from persisted batch/state and cannot
   broaden selection.
8. **Repeated promotion:** cumulative evidence is idempotent and cannot delete a
   prior receipt.
9. **Archived acceptance:** historical lookup changes; current public catalogue
   does not.
10. **No external disk:** normal build succeeds without opening evidence objects.
11. **No official PDF:** exact official HTML may become a separate terminal
    evidence route; retailer data never impersonates a PDF.
12. **No source found:** the model remains typed unknown and can be retried under
    a new policy epoch.

## 6. Success Metrics

- Model classification coverage: **8,095 / 8,095**.
- Duplicate reference IDs or model records: **0**.
- Stored valid PDF accounting: **100%** by unique SHA-256.
- Current MinerU coverage: **100% of stored valid unique PDFs**, excluding named
  terminal parser failures.
- Legacy JSON direct promotions: **0**.
- Retailer/reference-only receipts: **0**.
- Exact accepted fields with source/model/page/hash/receipt proof: **100%**.
- Accepted dimensions incorrectly promoted to `VERIFIED_FIT`: **0**.
- Archived/registry-only records appearing in current catalogue: **0**.
- Final model outcomes accepted + replayable terminal: **100%**; retryable or
  unaccounted outcomes: **0**.
- Normal build external-volume object reads: **0**.

## 7. Execution Checkpoint - 2026-07-15

This checkpoint records measured state, not final completion:

- All **8,095** historical models remain classified. **96** now have a current
  receipt; the remaining **7,999** stay in typed acquisition/research classes.
- The cumulative acceptance bundle contains **77** entries and **93** source
  receipts. Full receipt replay passed **93 / 93**.
- The current public catalogue contains **77** receipt-bound dimension
  projections and **0** receipt-bound `VERIFIED_FIT` projections. Dimension
  evidence alone has not been promoted into an installation guarantee.
- ASKO `T408HD.W`, `T208H.W`, and `W4086P.W` were accepted as dimensions-only
  exact-market evidence. `D5456SS` reached a typed `source_authority` terminal
  because its exact product record exposed no eligible PDF. `DBI243IBS`,
  `W2084C.W`, and `T410HD.W` reached the same terminal class when the current AU
  API no longer returned an exact model; no sibling alias was substituted.
- ASKO dishwasher `DBI343ID.W.AU` was accepted from an exact AU API-linked
  manual with page-40 dimensions `W596 / H819-872 / D554`. The adjustable
  height remains a range. Historical replacement keeps `CONFIRM_REQUIRED`
  rather than choosing a false installed height; a future partial-fill UI may
  prefill W/D while asking the user to measure H.
- ASKO `DBI364ID.S.AU` proved the duplicate product-code path: two exact AU
  product codes had different EANs and manuals but identical PIM W/H/D. Both
  PDFs independently produced `W596 / H819-872 / D554` on page 43 and were
  retained as corroborating sources. Multi-code discovery now fetches every
  exact detail before persistence and fails closed if any PIM axis is missing
  or differs.

The ASKO canaries required three reusable workflow corrections:

1. **Bound series manuals:** ASKO manuals using an explicit cover grammar such
   as `W4086X/1/2/3` may bind only to an exact AU product API record in the same
   four-digit series, only when the API directly links that document, and only
   when all PDF W/H/D values equal the exact PIM W/H/D values. A mismatch fails
   closed. This grants document scope, not cross-model field sharing.
2. **Transactional promotion:** promotion constructs the prospective cumulative
   bundle and replays every receipt against the object store before publishing
   the bundle. The receipt audit is written first and the bundle second, so a
   crash cannot expose an unaudited cumulative acceptance state.
3. **Run-local outcomes:** every recovery run writes immutable
   `runs/.../<run-id>/results.json` before updating the canonical latest-results
   view. Later canaries can no longer overwrite the only promotable result from
   an earlier run.
4. **Exact cover lists:** an ASKO manual may document-scope a later technical
   table when its cover explicitly names the exact target, the exact AU product
   API directly links the PDF, and all three PDF dimensions match exact PIM.
   Fixed PIM height may match only an endpoint of a preserved PDF height range.
   Binding priority is exact cover, then explicit series placeholder, then
   delimited suffix family.
5. **Multiple exact product revisions:** a shared modelMark does not authorize
   arbitrary product-code selection. Every exact detail must preserve the model
   and expose the same complete PIM W/H/D before its documents become
   candidates; PDF-level disagreement is still handled by normal reconciliation.
6. **Operational single-page fallback:** a primary pipeline command failure may
   transfer only the failed page to the pinned high-effort hybrid profile after
   chunk bisection reaches one page. The primary artifact retains an empty,
   hash-bound page gap and the trigger records
   `operational_page_failure / MINERU_COMMAND_FAILED`; verifier replay rejects a
   non-empty claimed gap. The full trigger semantics are part of the cache key,
   so operational recovery cannot reuse a legacy image-signal cache.

The current acquisition queue has **7,999** models: **31** bounded-ready,
**4,605** discovery-ready, **3,087** resolver gaps, and **276** research-required
models excluded from automatic execution. Task 8 therefore remains in progress.
The executable queue contains **7,723** targets; the next generated batch
contains **7,722** after excluding one already accepted target. The next safe
expansion unit remains a brand-bounded official cohort with zero retryable
outcomes and a passing online replay before promotion.

The first ASKO dishwasher cohort accepted **8 / 8** exact AU models from **14**
official PDF candidates with **0** failed candidates. Seven models retain
`W596 / H819-872 / D554`; `DBI766IQXXL.BS.AU` retains
`W596 / H859-912 / D554`. `DBI766IQ.S.AU` now replays two independent PDF
hashes after the operational page-39 fallback repair. All eight remain
dimensions-only and ineligible for `VERIFIED_FIT`.

Checkpoint verification:

- Full repository tests: **2,274 passed, 0 failed**.
- Offline cumulative bundle audit: **77 entries, 0 violations**.
- Online ASKO cohort audit: **8 targets, 41 objects, 0 violations**.
- Cumulative receipt replay: **93 passed, 0 failed**.
- Historical replacement audit: **8,095 records, 0 issues**.
- Adjustable-height audit: **3 ranges, 0 scalar coercions**.
- Fit publication audit: **3,521 products, 77 receipt-bound dimensions,
  0 receipt-bound Verified Fit, 0 violations**.
- Dimension grammar inventory: **611** MinerU indexes, **610** valid,
  **866** observations, **153** parser profiles.
