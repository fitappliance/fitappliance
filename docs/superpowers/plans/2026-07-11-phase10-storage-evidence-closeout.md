# Phase 10 Storage and Evidence Closeout Plan

**Goal:** Make Architecture V2 evidence durable and reproducible, remove its
cyclic build dependencies, expand exact-model evidence across four categories,
and close every pending alias disposition without weakening approval gates.

## Global constraints

- Normal tests, builds and Vercel deploys must not require the external drive.
- External evidence is addressed by SHA-256 and is never overwritten.
- Moving a file cannot change identity, field approval or trust level.
- Unknown installation, operation and service values remain `null`.
- Retailer-hosted or family-only evidence cannot become manufacturer approval.
- All path migrations happen atomically with scripts and tests in the same
  commit; no individual JSON file is moved ahead of its consumers.

## Phase 10A: Evidence object store

- [x] Add TDD coverage for deterministic SHA shards, duplicate document links,
  page sets, content-hash mismatch and relative-path-only indexes.
- [x] Import Phase 8/9 PDFs and extracted text into the external SHA store.
- [x] Render every dimension and space review page into the SHA store.
- [x] Commit a small object index with hashes, sizes, page counts, source URLs,
  product links and relative object paths.
- [x] Verify every approved source-document hash has a restorable object.

## Phase 10B: Storage-normalised build graph

- [ ] Add one Architecture V2 path registry and path-contract tests.
- [ ] Split policies, decisions, reviews, observations and generated artifacts.
- [ ] Replace the source-document/review-bundle cycle with one-directional
  source inputs -> review decisions -> generated registries -> public output.
- [ ] Preserve compatibility for runtime/public URLs and historical IDs.
- [ ] Prove a clean build succeeds without the external drive.

## Phase 10C: Forty-model evidence batch

- [ ] Select ten active exact-model candidates per core category with bounded
  brand concentration and current retailer links.
- [ ] Acquire manufacturer product sheets and installation manuals through the
  common source contract.
- [ ] Review dimensions, installation, operation and service fields page by
  page; quarantine absent, family-only and mismatched documents.
- [ ] Import approved source objects and update public V2 geometry without
  inferring unknown fields.

## Phase 10D: Alias and quarantine closeout

- [ ] Research all nine pending aliases using regulator-family evidence and at
  least two independent market observations where Tier B applies.
- [ ] Approve only the exact fields allowed by the alias tier.
- [ ] Record each target as approved, rejected or pending-more-evidence with a
  durable investigation artifact.
- [ ] Regenerate canonical publication quarantine without silent drops.

## Phase 10E: Verification and production

- [ ] Run focused TDD, Architecture V2, full test, lint, schema, documentation,
  geometry, alias and object-integrity gates.
- [ ] Run desktop and 390 x 844 browser QA on representative trust states.
- [ ] Commit, push, wait for Vercel Ready and run production Sentinel.
- [ ] Update the completion audit, Phase 10 report and permanent project memory.

## Acceptance criteria

- Every Phase 8/9 reviewed PDF is recoverable by committed SHA index.
- Architecture V2 has no cyclic generated-input dependency.
- Forty new candidates have explicit reproducible outcomes.
- All nine alias records have current evidence-backed dispositions.
- No new `verified_fit` is created from partial evidence.
- Production build, schema, browser and Sentinel checks pass.
