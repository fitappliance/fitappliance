# G3b independent frozen audit

## Identity and frozen object

- Auditor agent: 01a0a2c0-4b22-7cb0-884c-f2e03755915b, distinct from Dalton 01a0a264-0a86-7ae0-a250-764c686e384d.
- Model: GPT-5 (Codex session; no more specific runtime preset was exposed).
- Audit mode: independent, read-only on implementation, Git, source evidence and plan. This report is the sole auditor write.
- Base HEAD: c83aa475d892e5bdb8bc7f65a0cee4cb05292a50.
- Frozen review package: .superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/G3b-review-v1.md, SHA-256 26ed0870422a47d4ba063cab4852180352417132b2c122ab3db0d3d81e5284ae.
- Freeze manifest: .superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/G3b-freeze-v1.json. Pre-write recheck found base HEAD, package hash, and all 14 declared file byte/hash pairs unchanged.

## Explicit verdicts

| Dimension | Verdict | Basis |
| --- | --- | --- |
| Spec compliance | CHANGES_REQUIRED | P1 negative-witness discrimination and P1 G3a crop-contract incompatibility violate required G3b contracts. |
| Code quality | CHANGES_REQUIRED | The replay/original-object hardening is substantive, but witness validation is hard-wired to one pre-selection hash guard and image provenance duplicates a weaker crop schema. |
| Whole branch ready to merge | NO | Do not merge this frozen version. Require Dalton’s fixes, new focused/attestation captures, a fresh freeze, and a new independent audit. Main remains the release authority. |

## Coverage and confirmed boundaries

| Coverage item | Evidence reviewed |
| --- | --- |
| Independent-audit scope, structural-only boundary, no self-test substitution | .superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/G3b-auditor-brief.md:8-17, 35-56, 85-99 |
| Selection/inspection/routing and source/attestation requirements | .superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/G3b-router-brief.md:77-99, 101-162 |
| Checkpoint A replay clarification and no semantic/public authority | docs/superpowers/plans/2026-09-13-architecture-v3-evidence-foundation.md:888-917, 972-1018 |
| Original-page constraints and unresolved BDF/BDP/EWF semantics | docs/architecture-v3/execution/real-evidence-canary-semantic-review.md:55-80, 90-113, 123-143, 160-173, 187-217 |
| Closed policy, real G2a brand resolution, and profile selection | src/domain/architecture-v3/document-family-registry.mjs:230-328, 397-430 |
| Raw-region replay and route re-selection | src/domain/architecture-v3/region-router.mjs:374-527, 529-660 |
| Original-object bytes, raw pointer and page provenance checks | src/domain/architecture-v3/region-router.mjs:1385-1458, 1461-1485 |
| Strict no-default CLI, regular-file reads, and bounded output | scripts/architecture-v3/run-profile-canaries.mjs:50-75, 127-160, 163-205 |
| No runtime/publication consumer wiring | Static reference query over src, scripts, package.json and .github found only the new router, registry and runner imports; no active pointer, publisher or public consumer reference. This matches G3b-main-integration-notes.md:7-24. |

The complete inspection-to-route path does replay its raw input and rejects a forged region at route time. The fixed six current original records are full-page records, and no finding claims a semantic fact, Claim, Receipt, Fit result, installation requirement, or public authority.

## Targeted read-only diagnostics

No unchanged full suite was rerun. The executor capture totals remain execution evidence only, as required by G3b-auditor-brief.md:85-91. Each diagnostic below read only the frozen worktree and manifest-declared external objects.

| Diagnostic | Exit | Result |
| --- | ---: | --- |
| G3b-audit-original-object-and-target-binding | 0 | Verified 3 exact PDF magic/hash pairs, 3 selected MinerU JSONs, 3 lineages, 6 rendered PNGs, and 6 fixture targets. Each target’s raw JSON pointer, canonical raw-block hash, fragment identity, page, pixels, rotation and transform matched its manifest-declared original object. |
| G3b-audit-negative-witness-discrimination | 0 | Reproduced a portable attestation with 12 negative rows; every row had the sole reason FIXTURE_SOURCE_PDF_MISMATCH, and the declaration-hash gate precedes inspection/profile selection. Exit 0 means the defect was reproduced. |
| G3b-audit-g3a-crop-contract-replay | 0 | A valid G3a-shaped crop_from_full_page input for BDF p2 /1/4 returned incomplete with INVALID_PAGE_TRANSFORM. Exit 0 means the incompatibility was reproduced. |
| G3b-audit-selection-status-spoof | 0 | A missing-image-metadata region was incomplete, but changing only its submitted status to inspected made selectDocumentProfile return selected; routeExtractionRegion then correctly rejected the same submission with REGION_REPLAY_MISMATCH. Exit 0 means the boundary distinction was reproduced. |

I also checked the executor portable/original-object capture and log SHA-256 values against the execution record. Both exact captured outputs contain six positive fixture results and twelve negative rows, all stopping at FIXTURE_SOURCE_PDF_MISMATCH; their before/after inventories each contain 36 identical inputs. I did not re-run the recorded 3196-test suite.

## Findings

### P1 — negative source witnesses do not test profile discrimination

Required behavior is not merely a count of hashes: each active profile needs one positive and two negative source-hash witnesses, with independently specified mutations/outcomes that distinguish adversarial fixture changes from real source bytes. See G3b-router-brief.md:151-162 and G3b-main-integration-notes.md:33-40.

The implementation restricts every admissible negative mutation to document.sourcePdfSha256 and the one expected failure FIXTURE_SOURCE_PDF_MISMATCH at src/domain/architecture-v3/region-router.mjs:865-892. It then mutates only that declaration at lines 1179-1205. validatedPortablePayload rejects the changed declaration at lines 969-987 before inspectExtractionRegions, selectDocumentProfile, or routeExtractionRegion can execute.

The exact frozen portable and original-object logs confirm all 12 negatives have that one reason. Consequently a regression in selector signals, category/content-mode discrimination, or extraction-chain choice can leave all twelve negatives green. These rows prove a useful source-identity tamper guard, but not that each profile rejects two real non-matching source structures.

Residual/risk: current positive source replay and original byte binding are real; this finding does not assert that the six current profiles select incorrectly. It blocks the claimed negative-witness contract and the profile-readiness implication of attestation PASS.

Required repair by executor: retain the hash-tamper control separately, but make every negative profile witness replay independently bound alternate source/region bytes and assert the specified non-selection/typed outcome after inspection/selection. Re-freeze the changed manifest/tests/captures for audit.

### P1 — image/crop handling weakens and rejects the existing G3a contract

G3b must retain the G3a page/rotation/transform contract for image/crop representations, not replace it with box containment. See G3b-auditor-brief.md:37-47, G3b-router-brief.md:84-93, and the plan clarification at docs/superpowers/plans/2026-09-13-architecture-v3-evidence-foundation.md:1000-1010.

G3a permits transform kind crop_from_full_page with a fullPageArtifactSha256 and normalized crop box, and its PDF locator also binds raw coordinates, page, rendered-page identity, pixels and rotation: src/domain/architecture-v3/artifact-lineage.mjs:134-194. G3a additionally requires the full-page object to be an actual source-root ancestor of the crop artifact: src/domain/architecture-v3/evidence-anchors.mjs:221-245.

G3b instead accepts only a new transform kind crop with normalizedTopLeftBox and tests only box containment at src/domain/architecture-v3/region-router.mjs:317-340. It has no full-page-artifact ancestry or raw-coordinate binding, and source expectations reject any transform except full_page at lines 704-753. The targeted replay proves a valid G3a crop is rejected as INVALID_PAGE_TRANSFORM.

Residual/risk: all six fixed canary renders happen to be full-page/rotation 0, so their current raw objects are not corrupted. The public API nevertheless cannot consume valid G3a crop evidence and can accept a weaker crop record; the required rotation/crop mismatch contract is therefore not met.

Required repair by executor: consume or validate the G3a locator/transform shape rather than a parallel crop schema, including full-page ancestry, raw coordinate frame and rotation-aware crop verification. Add real valid-crop and same-PDF wrong-page/crop/rotation counterexamples.

### P2 — direct selection accepts a submitted inspected status without replay

The contract says a claimed inspected status cannot replace validated raw-region/profile bindings. document-family-registry.mjs:331-394 validates snapshot shape and raw fragment identity but does not re-run inspection before selectDocumentProfile at lines 411-424. The targeted diagnostic changed only an incomplete image region’s status to inspected and received selected.

The complete routing path is protected: replayInspectedRegion recomputes from raw input at src/domain/architecture-v3/region-router.mjs:495-527 and routeExtractionRegion rejected the spoof as REGION_REPLAY_MISMATCH. Therefore this is not evidence of an end-to-end route bypass in the current code, but the exported selection API itself is not fail-closed and could mislead a future direct consumer.

Required repair by executor: make direct selection consume the same replayed inspection result, or narrow the API so un-replayed region snapshots cannot produce selected.

## Remaining non-G3b-completion boundaries

- Historical OCR tool provenance remains explicitly incomplete; tableEnabled/formulaEnabled must remain absent rather than inferred. See real-evidence-canary-semantic-review.md:230-242.
- BDF diagram labels, BDP depth-scope relationship, and EWF hose/disclaimer/installation semantics remain structural/source-review context, not G3b approvals.
- G4b semantic source proof, Claim/Receipt work, eligibility, public projection and Fit remain out of scope and unfinished.

No code, plan, raw evidence, OCR record, old credential, Git state, capture or external object was changed by this audit.
