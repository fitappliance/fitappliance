# Autonomous Evidence Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fail-closed, reproducible appliance evidence research and adjudication pipeline that never requires a human approval decision.

**Architecture:** Separate network discovery/acquisition from a deterministic verifier and adjudicator. Bind every accepted claim to an immutable source object and a policy-derived receipt, then make canonical quarantine coverage and typed release grants mandatory publication gates.

**Tech Stack:** Node.js 20+, ES modules, native `fetch`, Cheerio, MinerU 3.4.4 pipeline, Poppler for visual renders only, Node test runner, JSON policy and state artifacts.

## Global Constraints

- Unknown evidence remains unknown and may never be inferred from retailer data.
- A non-resolved case is always quarantined from public projection.
- Only exact evidence-hold reasons may be released; identity and product-kind reasons are permanent.
- Normal builds are deterministic and network-free.
- Receipt generation requires access to the immutable raw object.
- No secrets or external storage paths are committed.

---

### Task 1: Publication Safety Boundary

**Files:**
- Modify: `src/domain/canonical-registry.mjs`
- Modify: `scripts/architecture-v2/build-canonical-registry.mjs`
- Modify: `scripts/architecture-v2/build-public-projection.mjs`
- Test: `tests/architecture-v2/canonical-registry.test.mjs`
- Test: `tests/architecture-v2/evidence-resolution-loop.test.mjs`

- [ ] Add failing tests proving a resolution grant cannot release product-kind,
  identity, or unrelated quarantine reasons.
- [ ] Add a failing integration test proving every unresolved case is excluded
  even when it was absent from the old quarantine file.
- [ ] Replace bare release IDs with case-bound, reason-scoped grants and derive
  automatic pending quarantine rows from the manifest.
- [ ] Run focused tests and commit the safety boundary.

### Task 2: Source Policy and Content-Bound Receipts

**Files:**
- Create: `data/architecture-v2/policies/manufacturer-source-policy.json`
- Create: `data/architecture-v2/policies/evidence-resolution-policy.json`
- Create: `src/domain/evidence-source-verifier.mjs`
- Modify: `src/domain/evidence-resolution-loop.mjs`
- Modify: `src/domain/architecture-v2-paths.mjs`
- Test: `tests/architecture-v2/evidence-source-verifier.test.mjs`

- [ ] Add failing adversarial tests for spoofed hosts, redirects, malformed or
  future timestamps, missing receipts, edited claims, and receipt replay.
- [ ] Implement brand-bound host policy, strict time parsing, source metadata
  validation, canonical receipt payloads, and SHA-256 receipt digests.
- [ ] Require valid receipts before claims enter adjudication.
- [ ] Run focused tests and commit the trust boundary.

### Task 3: Identity and Field Semantics

**Files:**
- Create: `src/domain/evidence-claim-semantics.mjs`
- Create: `src/domain/evidence-artifact-verifier.mjs`
- Modify: `scripts/architecture-v2/verify-evidence-resolution-objects.mjs`
- Test: `tests/architecture-v2/evidence-artifact-verifier.test.mjs`

- [ ] Add failing tests for `ABC1`/`ABC12`, cross-product HTML, wrong axes,
  quote/value mismatch, boolean inversion, unit mismatch, impossible category
  dimensions, and door-open depth below closed depth.
- [ ] Implement bounded model tokens, structured HTML identity signals, PDF page
  scope, label dictionaries, value parsing, and geometry invariants.
- [ ] Make raw-object verification emit the only acceptable receipt payload.
- [ ] Verify the existing WHE6874BA snapshot and commit the semantic gate.

### Task 4: Automated Research Runner

**Files:**
- Create: `src/domain/evidence-research-state.mjs`
- Create: `src/domain/evidence-source-discovery.mjs`
- Create: `scripts/architecture-v2/run-evidence-resolution.mjs`
- Test: `tests/architecture-v2/evidence-research-state.test.mjs`
- Test: `tests/architecture-v2/evidence-source-discovery.test.mjs`

- [ ] Add failing tests for sitemap discovery, hostile redirects, interrupted
  execution, retry progression, idempotent replay, exhausted searches, and
  automatic conflict reconciliation.
- [ ] Implement bounded sitemap/candidate discovery, retrying acquisition,
  content-addressed writes, automatic fact extraction, atomic state updates,
  transition history, supersession, and terminal quarantine.
- [ ] Add `resolve:evidence` and `resolve:evidence:dry-run` commands.
- [ ] Run a no-network fixture simulation and a live WHE refresh, then commit.

### Task 5: Production Gate and Observability

**Files:**
- Modify: `scripts/architecture-v2/build-evidence-resolution-manifest.mjs`
- Create: `scripts/architecture-v2/audit-evidence-resolution.mjs`
- Modify: `package.json`
- Modify: `docs/architecture-v2/automated-evidence-resolution.md`
- Test: `tests/architecture-v2/evidence-resolution-audit.test.mjs`

- [ ] Add failing tests for stale receipts, unresolved public coverage, summary
  drift, duplicate active cases, missing raw-verification attestations, and
  policy-version changes.
- [ ] Fail the production build on invalid receipts or quarantine coverage and
  emit counts for states, attempts, age, failures, and terminal reasons.
- [ ] Update durable operating and recovery documentation.
- [ ] Run focused tests and commit the production gate.

### Task 5A: JSON-first PDF Evidence

**Files:**
- Create: `src/domain/mineru-document.mjs`
- Create: `src/domain/mineru-runner.mjs`
- Create: `scripts/architecture-v2/parse-pdf-with-mineru.mjs`
- Modify: PDF acquisition, research, replay and legacy compatibility workflows
- Test: `tests/architecture-v2/mineru-*.test.mjs`

- [x] Install MinerU and model assets outside Git on project external storage.
- [x] Require policy-pinned `content_list_v2` JSON for every new PDF receipt.
- [x] Bind PDF hash, JSON hash, parser configuration, page, bbox, fragment and
  axis semantics; reject packaged or unlabeled dimensions.
- [x] Migrate the automated runner, Phase 10 v2 acquisition, replay verifier
  and legacy brand-parser adapter to JSON-first processing.
- [x] Validate real Hisense table and Haier QRG/range layouts.
- [ ] Complete full regression, review and production integration.

### Task 6: Adversarial Regression and Reusable Skill

**Files:**
- Create: `tests/architecture-v2/evidence-resolution-adversarial.test.mjs`
- Modify: `/Users/clawdbot_jz/.codex/skill-library/codex-user/automating-appliance-evidence-resolution/SKILL.md`
- Modify: `/Users/clawdbot_jz/.codex/skill-library/codex-user/adjudicating-appliance-model-aliases/SKILL.md`

- [ ] Convert every audit finding and predicted failure into an automated test.
- [ ] Run a baseline skill pressure scenario, update the reusable skill with the
  new trust and publication gates, then rerun the scenario.
- [ ] Run Architecture V2 tests, main tests, lint, full build, schema, geometry,
  alias, object, and documentation audits.
- [ ] Request one independent final review and resolve confirmed findings.

### Task 7: Integrate and Verify Production

**Files:**
- Modify only generated artifacts changed by verified build commands.

- [ ] Rebase or merge the isolated branch without touching user-owned dirty
  files, then commit and push related changes only.
- [ ] Deploy the exact pushed commit to Vercel production.
- [ ] Verify deployment readiness, aliases, WHE desktop/mobile output, console,
  horizontal overflow, links, schema, and production Sentinel.
- [ ] Record final commit, deployment ID, test totals, residual risks, and
  untouched user files.
