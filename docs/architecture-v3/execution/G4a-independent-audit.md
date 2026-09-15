# G4a independent acceptance audit

**Overall verdict:** `CHANGES_REQUIRED` — not approved for main acceptance.

**Auditor:** Codex, a different actor from executor Dirac
`01a0a357-1dcd-7e91-ba8b-c5b97064d67e`. This was a read-only review of the
frozen uncommitted four-file patch on base
`34e7ae033c63bd2fb96d74d313e5d4c540f42b89`; no source, test, Git, release,
receipt, runtime, or real-source work was performed.

## Separate verdicts

- **Specification:** `PASS`. The G4a contract is appropriately bounded: it
  creates a structural Claim, while G4b owns original-source replay, rights and
  complete G3a proof closure; G7 owns finite-relationship verification and
  receipt creation. No change to those ownership boundaries is requested.
- **Code quality / acceptance:** `CHANGES_REQUIRED`. Two persisted-Claim
  validation paths accept an exact-context or finite-relationship assertion that
  the supplied validation inputs do not establish. Both are central to the
  closed Claim contract, so the focused/full self-test evidence cannot approve
  this frozen version.

## Findings

### Important — finite relationship Claims accept opaque reference identifiers

[evidence-claim-v3.mjs](../../../src/domain/architecture-v3/evidence-claim-v3.mjs)
lines 386–419 accept every non-empty text value as a
`relationshipAssertionId`; lines 561–586 replay that same permissive path for
stored Claims. A caller can therefore persist a closed
`FINITE_OFFICIAL_RELATION` proof containing an arbitrary non-assertion string.
The null `derivedFromClaimId` in the witness makes the example especially
ungrounded, but the immediate G4a defect is the missing typed reference check,
not an attempt to perform G7's source/receipt verification early.

Focused synthetic witness:

```text
relationshipAssertionIds: ["not-a-product-relationship-id"]
derivedFromClaimId: null
createEvidenceClaimV3: accepted
validateEvidenceClaimV3: accepted
```

The witness is in
`.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/G4a-independent-audit-counterexamples.mjs`.
The existing finite-relation test only covers sorting and duplicate text IDs
([evidence-claim-v3.test.mjs](../../../tests/architecture-v3/evidence-claim-v3.test.mjs),
lines 411–442).

**Minimal correction:** retain G4b/G7 ownership, but reject a finite relation
whose IDs do not use the established closed assertion-ID form. Add factory and
stored-validator negative tests for an opaque ID, while retaining a valid
syntactic-ID case. G7 must still resolve and replay the assertion/receipts
before it materializes any eligible derived Claim; this fix does not add that
future work to G4a.

### Important — context witnesses are shape-checked but never bound to the Claim subject

[evidence-claim-v3.mjs](../../../src/domain/architecture-v3/evidence-claim-v3.mjs)
lines 498–502 call `validateEngineeringContext`, which returns only normalized
context. The subject-aware matcher already exists in
[engineering-context.mjs](../../../src/domain/architecture-v3/engineering-context.mjs),
lines 281–309, but is not invoked. Consequently a Claim for one product/market
accepts a witness for another product/market and stores the first product's
context as though it were established. This does not confer source approval,
but it breaks the G4a promise that the candidate has an exact subject and a
validated context before later receipt replay.

Focused synthetic witness:

```text
Claim subject: fa_prod_111111111111111111111111 / AU
Only context witness: fa_prod_222222222222222222222222 / NZ
createEvidenceClaimV3: accepted
existing resolver for the same inputs: unknown
```

**Minimal correction:** after normalizing the subject and context, use the
existing resolver with the Claim subject and the same candidate/requested
context; reject a result other than `applicable`. Add wrong-subject,
wrong-market, missing-witness and positive exact-witness cases. This remains a
structural witness check; G4b continues to verify the underlying source proof.

## Evidence reviewed

- Frozen review packet SHA-256:
  `0d895052678ddc07847f2420e2b9cd9df4caae7f77a2d20dec06b95a1ce981bd`
  (82,412 bytes), matching `G4a-freeze-v1.json`.
- Frozen implementation SHA-256:
  `6d437558e4084cd98f3d5084ad420adf429b7401df43b256ff51a457fb695ac7`.
- Frozen focused-test SHA-256:
  `53ebc5744d1134084397ae42c256c4a0f97e4ea5780c81cd65449df6be4c5fff`.
- Complete self-test capture manifest SHA-256:
  `ac7ebb0bb0285eaaee9b54cf1d4caf65e0b0ecae33f1a74a2ee254c03613971d`.
  I rechecked the four recorded stdout hashes and inspected their complete
  result tails: focused `10 pass / 0 fail`; full `3,216 pass / 0 fail / 0
  skipped / 0 cancelled`; lint exit 0; schema `2,330 pages / 6,145 blocks / 0
  errors`. These are executor/main verification records, not independent proof
  of the two missing negative cases.
- Historical RED remains a documented summary only. It was neither recovered
  nor treated as a current raw-log result.
- I did not rerun the focused or full suite. The only new execution was the
  synthetic counterexample above; it reads no PDF/OCR/source object and has no
  side effects outside its permitted isolated diagnostic file.

## Bounded non-findings

The strict JSON path, canonical codec/version handling, canonical value
normalization, identity hashing, output freezing, closed top-level envelope,
and G3a reference-only anchor validation were reviewed against the frozen patch
and the named unchanged dependencies. No separate defect was found in those
areas. In particular, this audit does not request a second source parser,
real-evidence approval, G4b replay, G7 derivation, persistence, or runtime
integration.

## Re-review condition

The original executor should make the smallest repair within the G4a source and
test files, capture only the affected checks, then freeze a new packet. A
different auditor must re-review that new identity before G4a can be approved.
