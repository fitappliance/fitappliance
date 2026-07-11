# Phase 9 Space Evidence Pilot Implementation Plan

**Goal:** Promote only explicit, page-reviewed installation-clearance and operating-envelope facts from the ten Phase 8 dimension-approved manufacturer documents.

**Architecture:** A committed review input records every audited document, including documents with no usable space facts. A semantic gate accepts only supported Architecture V2 field paths, exact manufacturer identity, reproducible PDF provenance, explicit source labels and rendered-page verification. Approved facts are merged into the existing source-document lifecycle and public V2 review projection without upgrading a product to `verified_fit` while required fields remain unknown.

## Constraints

- Keep installation, operation and service facts separate.
- Preserve unknown values as `null`; never manufacture `frontMm: 0`.
- A source label of `Sides` may populate left and right only when the quote explicitly says `Sides`.
- `D''` may populate `operation.doorOpenDepthMm` only when the rendered dimension diagram visibly terminates at the open door.
- Do not convert total door-open depth into a swing delta.
- Do not treat general access, ventilation prose or packaging dimensions as numeric evidence.
- Every one of the ten audited documents must have either approved candidate fields or an explicit no-candidate reason.

## Tasks

### 1. Freeze the reviewed input

- Add the ten-document review input with PDF hash, page, quote, semantic basis and field value.
- Record no-candidate reasons for the five documents without explicit usable numeric space facts.
- Verify Fisher & Paykel, Hisense and LG source pages visually.

### 2. Add semantic approval gates with TDD

- Add failing tests for unsupported fields, inferred zero, unlabeled `D''`, non-explicit `Sides`, incomplete document provenance and missing audit coverage.
- Implement a pure space-review validator and projection builder.
- Generate a deterministic review manifest from the committed input.

### 3. Merge approved facts without inflating trust

- Merge approved space facts into the matching Phase 8 source documents.
- Add approved installation and operation values to the public V2 review projection.
- Keep `verified_fit` false because the category-required space contract is incomplete.
- Render human-readable approved space facts and explicit remaining limitations on product pages.

### 4. Verify and deploy

- Run focused, Architecture V2, full test, build and schema gates.
- Inspect representative desktop and mobile product pages.
- Commit, push, wait for Vercel and verify production plus Sentinel.
- Record actual approved, blocked and trust-level counts in the Phase 9 report.

## Acceptance Criteria

- Ten of ten Phase 8 dimension-approved documents have an explicit Phase 9 audit outcome.
- Every approved space fact has exact identity, manufacturer authorship, SHA-256, page, quote, parser version and rendered-page verification.
- No field is inferred from another dimension and no unknown is coerced to zero.
- Approved space facts reach source documents and public review metadata.
- No product is promoted to `verified_fit` unless the existing complete evidence contract passes.
