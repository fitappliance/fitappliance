# Phase 1 Quarantine and Alias Registry Implementation Plan

Status: approved for execution  
Created: 2026-07-11  
Parent plan: [`remediation-master-plan.md`](./remediation-master-plan.md)  
Audit baseline: [`repository-architecture-audit.md`](./repository-architecture-audit.md)

## Objective

Resolve or permanently classify the nine remaining upright-fridge dimension
quarantines without using family similarity, colour assumptions, capacity
matching, or automatic width/height swapping.

The phase also replaces ad hoc `verified_alias` notes with a versioned,
reviewable alias registry. An unresolved product is an acceptable result. An
unsupported alias approval is not.

## Baseline

At the start of this plan:

- runtime products: 2,268;
- adapted in Architecture V2 shadow mode: 2,259;
- quarantined: 9;
- evidence-index matches: 427;
- official dimensions applied in shadow mode: 331;
- full tests: 1,560 passing;
- schema audit: 2,348 pages, 7,193 blocks, zero errors.

The baseline commit is `833dc3bf`, which added the durable architecture audit
and remediation plan. Data evidence through `b308983e` is included.

## Scope

### Included

- a strict alias-registry schema and deterministic loader;
- pending, approved, rejected, and superseded alias decisions;
- exact manufacturer proof for an alias relationship;
- field-scoped alias approval for dimensions only;
- research and disposition of the remaining nine products;
- regression fixtures for every approved alias;
- integration with Architecture V2 field-evidence approval;
- updated evidence index, shadow audit, and architecture baseline.

### Excluded

- broad canonical identity migration;
- automatic alias discovery approval;
- retailer availability ingestion;
- production FitDecision cutover;
- manufacturer clearance migration;
- public UI changes;
- deletion of legacy product rows.

## Required Invariants

1. Alias approval is manufacturer- and model-specific.
2. Alias approval is field-scoped. Approval for closed dimensions does not
   approve clearance, door swing, plumbing, operation, delivery, price, or
   availability.
3. A candidate alias cannot approve itself.
4. Exact identity remains distinct from alias identity.
5. A sibling model, matching capacity, or colour-code pattern is not proof.
6. Retailer-hosted evidence can support investigation but cannot independently
   approve a manufacturer alias.
7. Missing model evidence remains pending or rejected.
8. Unknown values remain `null`; no migration step fills missing clearance with
   zero.
9. The alias registry is append-oriented. A changed decision supersedes an old
   record instead of rewriting its history silently.
10. Production artifacts remain unchanged during this phase.

## Proposed Files

### Create

- `data/model-aliases.json`
- `src/domain/model-alias.mjs`
- `scripts/architecture-v2/audit-model-aliases.mjs`
- `tests/architecture-v2/model-alias.test.mjs`
- `tests/fixtures/architecture-v2/model-aliases.json`
- `reports/architecture-v2/phase1-quarantine-disposition.json`

### Modify

- `src/domain/evidence.mjs`
- `src/adapters/legacy-appliance.mjs`
- `scripts/build-evidence-index.js`
- `scripts/architecture-v2/shadow-audit.mjs`
- `tests/architecture-v2/evidence.test.mjs`
- `tests/architecture-v2/legacy-appliance.test.mjs`
- `tests/architecture-v2/shadow-audit.test.mjs`
- `package.json`
- `docs/architecture-v2/repository-architecture-audit.md`
- `docs/architecture-v2/remediation-master-plan.md`
- this plan

File names may change only when an existing repository convention clearly
provides a better location. The schema and trust boundaries may not be weakened
to avoid a new file.

## Alias Registry Schema

The initial durable shape is:

```json
{
  "schema_version": 1,
  "last_updated": "2026-07-11",
  "aliases": [
    {
      "id": "alias_westinghouse_example_v1",
      "brand": "Westinghouse",
      "target_model": "TARGET",
      "source_model": "SOURCE",
      "status": "pending",
      "identity_scope": "manufacturer_model",
      "candidate_fields": ["closedEnvelope.widthMm", "closedEnvelope.heightMm", "closedEnvelope.depthMm"],
      "approved_fields": [],
      "evidence": [
        {
          "source_url": "https://manufacturer.example/document.pdf",
          "document_sha256": "<64 lowercase hex characters>",
          "page": 1,
          "quote": "The document explicitly lists TARGET and SOURCE as the same dimensional variant.",
          "document_author_type": "manufacturer",
          "transport_host_type": "manufacturer"
        }
      ],
      "decision": {
        "reviewer": null,
        "reviewed_at": null,
        "rationale": "Awaiting explicit manufacturer relationship proof."
      },
      "supersedes": null
    }
  ]
}
```

### Validation rules

- `id` is unique and immutable.
- brand and both model fields are non-empty normalized manufacturer identifiers.
- `target_model` and `source_model` must differ after normalization.
- status is one of `pending`, `approved`, `rejected`, or `superseded`.
- only approved records may contain non-empty `approved_fields` used by runtime
  code.
- pending records may declare `candidate_fields`, but runtime code must ignore
  them.
- approved records require reviewer, review date, rationale, document hash,
  positive page number, quote, manufacturer authorship, and manufacturer
  transport.
- approved fields are selected from a fixed allowlist.
- Phase 1 allowlist contains only the three closed-envelope dimensions.
- duplicate active alias pairs fail validation.
- contradictory active aliases for the same target and field fail validation.
- a superseded record must point to an existing replacement decision.
- parsing and validation never mutate input.

## Execution Tasks

### Task 1: Freeze the nine-row baseline

Files:

- create `tests/fixtures/architecture-v2/model-aliases.json`;
- create the initial disposition report fixture.

Steps:

- [x] Capture all nine legacy IDs, brands, models, current dimensions, evidence
  tier, endpoint result, and blocking reason.
- [x] Add a deterministic test asserting the baseline contains exactly nine
  unique products.
- [x] Assert that each row remains quarantined before aliases are introduced.
- [x] Record source retrieval dates; do not store authenticated cookies or
  private feed URLs.

Verification:

```bash
node scripts/architecture-v2/shadow-audit.mjs
node --test tests/architecture-v2/shadow-audit.test.mjs
```

Commit boundary:

```text
test: freeze phase one quarantine baseline
```

### Task 2: Implement the alias domain contract

Files:

- create `src/domain/model-alias.mjs`;
- create `tests/architecture-v2/model-alias.test.mjs`;
- create `data/model-aliases.json` with pending records only.

TDD sequence:

- [x] Test valid pending and approved records.
- [x] Test exact-model self-alias rejection.
- [x] Test missing reviewer, hash, page, quote, authorship, or transport.
- [x] Test unsupported approved fields.
- [x] Test duplicate and contradictory active records.
- [x] Test supersession rules.
- [x] Test deterministic normalized lookup by brand and target model.
- [x] Confirm RED before implementation.
- [x] Implement the minimum immutable contract.
- [x] Confirm GREEN.

Required interface:

```js
createAliasRegistry(document)
findApprovedAlias(registry, { brand, targetModel, field })
evaluateAliasCandidate(record)
```

Commit boundary:

```text
feat: add reviewed model alias registry
```

### Task 3: Connect aliases to field evidence

Files:

- modify `src/domain/evidence.mjs`;
- modify `src/adapters/legacy-appliance.mjs`;
- update focused tests.

Steps:

- [x] Require an approved registry record when `identityMatch` is `alias`.
- [x] Require the requested field to be in the alias record's approved scope.
- [x] Preserve the alias decision ID in approved field evidence.
- [x] Reject an alias approved for dimensions when used for clearance.
- [x] Reject an alias whose brand, target model, or source model differs.
- [x] Keep retailer-only evidence below the manufacturer approval boundary.
- [x] Ensure exact-identity evidence remains unaffected.

Acceptance examples:

- an approved width/height/depth alias may provide closed-envelope geometry;
- the same alias cannot provide rear clearance;
- a rejected or pending alias cannot rescue quarantine;
- no alias record means the current quarantine behavior remains unchanged.

Commit boundary:

```text
feat: gate alias evidence by approved fields
```

### Task 4: Build the alias audit CLI

Files:

- create `scripts/architecture-v2/audit-model-aliases.mjs`;
- modify `package.json`;
- add CLI tests.

Output must include:

- counts by status;
- duplicate or contradictory records;
- missing provenance;
- approved fields by alias;
- aliases referenced by evidence but absent from the registry;
- approved aliases with no consuming product;
- quarantined products with pending candidates;
- deterministic sorted JSON.

Command:

```bash
npm run audit:model-aliases
```

The CLI exits non-zero for malformed or contradictory registry state. Pending
research is reported but does not fail the command.

Commit boundary:

```text
feat: audit model alias decisions
```

### Task 5: Research and classify the nine products

Research order for every model:

1. current manufacturer product/support API;
2. exact manufacturer factsheet endpoint;
3. official installation or user manual;
4. archived manufacturer page or static manufacturer PDF;
5. Australian GEMS or other authoritative registration that explicitly links
   model identifiers;
6. manufacturer packaging or compliance label showing both identifiers;
7. retailer document only as a non-authoritative investigation lead.

Do not use a search snippet as approval evidence. Save the final manufacturer
document and its hash before approval.

#### Research matrix

| Target | Candidate relationship to investigate | Current blocker | Approval requirement |
| --- | --- | --- | --- |
| `EBE5367BC` | `EBE5367SC` | Exact factsheet 404; guide lists only SC. | Manufacturer document explicitly linking BC and SC for dimensions. |
| `WTB2500AH` | `WTB2500WH` | Exact factsheet 404; guide lists only WH. | Manufacturer document explicitly linking AH and WH for dimensions. |
| `KTB2302AB` | `KTB2302WB` | Exact factsheet 404. | Manufacturer variant table or manual listing both AB and WB. |
| `KTB2502AB` | `KTB2502WB` | Exact factsheet 404. | Manufacturer variant table or manual listing both AB and WB. |
| `KTB2802AB` | `KTB2802WB` | Exact factsheet 404. | Manufacturer variant table or manual listing both AB and WB. |
| `WHE7074BA` | `WHE7074SA` | Exact factsheet 404. | Manufacturer document listing BA and SA with shared dimensions. |
| `WHE6000BB` | `WHE6000SB` | Exact factsheet 404; guide lists only SB. | Manufacturer document explicitly listing BB. |
| `WHE6060BB` | `WHE6060SB` | Exact factsheet 404; guide lists only SB. | Manufacturer document explicitly listing BB. |
| `WHE6874BA` | no default alias | Official factsheet is an error PDF; retailer PDF exists. | Valid manufacturer document for BA or explicit manufacturer alias. |

Disposition for each row must be one of:

- `resolved_exact`;
- `resolved_approved_alias`;
- `pending_more_evidence`;
- `rejected_alias`;
- `quarantined_no_manufacturer_evidence`.

Research may conclude with all nine unresolved. That is a valid phase result if
the evidence trail and stable reasons are recorded.

Commit boundaries:

- candidate records and reports: `data: record model alias candidates`;
- approved decisions and fixtures: one commit per independently reviewable alias
  family;
- do not mix unrelated brands into one approval commit.

### Task 6: Rebuild evidence and shadow geometry

Files:

- modify `scripts/build-evidence-index.js` only if alias decision IDs must be
  projected;
- update `public/data/evidence-index.json` through its generator;
- update Architecture V2 adapter and tests only through approved registry state.

Steps:

- [ ] Regenerate the evidence index.
- [ ] Run alias audit.
- [ ] Run shadow audit.
- [ ] Verify each repaired row uses expected W/H/D.
- [ ] Verify installation clearances remain unknown.
- [ ] Verify rejected and pending aliases do not change geometry.
- [ ] Compare before/after counts and write the disposition report.

Commands:

```bash
npm run build-evidence-index
npm run audit:model-aliases
npm run test:architecture-v2
node scripts/architecture-v2/shadow-audit.mjs
```

Commit boundary:

```text
data: apply reviewed dimension aliases
```

### Task 7: Phase verification and documentation closeout

Required verification:

```bash
npm run test:architecture-v2
npm test -- --runInBand
npm run build-evidence-index
npm run audit:model-aliases
node scripts/architecture-v2/shadow-audit.mjs
npm run validate-schema
git diff --check
```

Additional checks:

- [ ] production browser and generated-page artifacts remain unchanged;
- [ ] no new dependency was added without justification;
- [ ] no secrets or local absolute paths entered evidence files;
- [ ] every approved alias has a regression fixture;
- [ ] every unresolved row has a stable disposition reason;
- [ ] audit and master-plan baselines are updated;
- [ ] implementation ledger contains commits and measured outcomes.

Final documentation commit:

```text
docs: close architecture v2 phase one
```

## Stop Conditions

Stop automatic execution and leave the row quarantined when:

- the only evidence is a retailer page or retailer-hosted PDF;
- an official endpoint returns an error document;
- the manufacturer document lists only a sibling model;
- the variant relationship is inferred from colour-code conventions;
- OCR cannot preserve an exact model token and axis label;
- multiple sources disagree on an axis;
- an alias would require approving clearance without explicit clearance proof;
- the document cannot be hashed and reproduced;
- the product identity is ambiguous after normalization.

These are successful safety outcomes, not pipeline failures.

## Rollback Plan

Phase 1 remains shadow-only. Rollback consists of:

1. stop consuming the alias registry in the shadow adapter;
2. regenerate `public/data/evidence-index.json` from the prior approved manifest;
3. restore the previous shadow audit baseline;
4. leave source documents and rejected/pending alias history intact;
5. do not delete raw evidence during rollback.

No production URL, page, or Fit label should require rollback because this phase
does not cut over production behavior.

## Completion Record

Fill this section only after Task 7:

```text
Completion date:
Final commit:
Resolved exact:
Resolved by approved alias:
Still quarantined:
Architecture tests:
Full tests:
Schema pages / blocks / errors:
Production artifact diff:
Reviewer notes:
```
