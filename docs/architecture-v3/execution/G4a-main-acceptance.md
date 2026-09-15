# G4a main acceptance — release gates pending

Date: 2026-09-15. Base: `34e7ae033c63bd2fb96d74d313e5d4c540f42b89`.
Decision: **accepted for commit and PR validation, not yet merged or released**.
The canonical [plan](../../superpowers/plans/2026-09-13-architecture-v3-evidence-foundation.md)
owns final commit, CI and production status.

## Independent roles and findings

Executor Dirac `01a0a357-1dcd-7e91-ba8b-c5b97064d67e` and independent
auditor Einstein `01a0a37a-1c3b-7251-b737-392e8345ff19` were explicitly
dispatched as `gpt-5.6-terra` / `max`. Neither delegated. Both are closed.
Main owned scope, contract decisions, record checks and this acceptance.

The [v1 audit](G4a-independent-audit.md) correctly stopped approval despite
passing self-tests. The [v2 re-review](G4a-independent-rereview-v2.md) closes
F1/F2 with no new fix-only breakage; SHA-256
`7292e3b3034b104117944921f9469ef6327f0d16ecbbf146b8c62792ede5e9c7`.

- Relationship references use the existing producer's closed ID format.
  Format validation does not prove that a relationship exists or is eligible.
- A Claim's named configuration requires an exact product/market/key/complete
  condition witness. This reuses the existing context matcher through an
  optional product argument, rather than creating a second rule evaluator.
- Main narrowed the proposed blanket runtime-applicable requirement: unspecified
  configurations and unknown datum/state stay valid as incomplete context.
  Existing three-field shape-only context calls keep their prior behavior.
- Source replay, rights, relationship eligibility, receipt issuance and Fit
  remain outside this constructor. No runtime, public-data, active-release or
  replacement import was added.

## Evidence checked by main

The [executor report](G4a-claim-v3.md) preserves its original text and appended
corrections. Main checked exact source/test/input identities, complete captured
outputs and actual child exits; it did not duplicate the executor's suites.

| Scope | Result | Identity / limitation |
| --- | --- | --- |
| v1 full verification | 3216 pass; lint0; schema2330pages/6145blocks/0errors | manifest `ac7ebb0bb0285eaaee9b54cf1d4caf65e0b0ecae33f1a74a2ee254c03613971d`; proves only v1 |
| F1 correction | RED12fail -> GREEN23pass | actual exit1 ->0; complete raw capture |
| F2 correction | RED34fail -> GREEN83pass | final48Claim+35semantic tests; no skip/cancel/todo |
| final affected inputs | 20 checked; syntax and scoped whitespace pass | manifest `04bf984c92e32268b3d9383db000dfbd72ae339ee09641fdde7c46e94d2b54e8` |
| independent repair review | F1/F2 ADDRESSED, spec/quality PASS | fix packet35565bytes/SHA `1ab3384f0ba46571e8033c7dc06b8909a35bf3fc110a249c512e911c4fde260a` |

Final Claim source SHA:
`30b55f2fa23ac55eb91663f3e9cdf0621fffe7d49e3710f998bf1a08f49907a3`.
Final context source SHA:
`8e5495aebecab28e42945f021fbeb35e98ac54a59bf6383605c417a09e3669ff`.
All prior reports/captures remain. The v1 auditor report's ignored-directory
Markdown link was made portable without changing findings; original `ced136a7`
and link-normalized `61e38ebc` copies remain independently identified.
Historical initial RED is summarized evidence only; the F1/F2 RED records are
complete fresh raw captures.

The unchanged test entrypoint should yield **3271 total tests** after replacing
old10Claim+18semantic tests with83 current tests. Final-head Node20 CI must pass,
with only the existing explicit absent-original-store skip permitted. Do not
call the old3216 suite a final-source proof.

## Evidence and release accounting

G4a's new fixtures are synthetic structural assertions, not repaired product
facts. The executor's statement about no original-source processing applies
to the new G4a implementation, not every existing regression: the earlier full
suite included the mounted G3b original-object replay test with no skip. That
reuses prior evidence and does not count as new OCR, acquisition, installation
evidence or old-receipt reissue. G4b/G6 repair remains unfinished.

Release uses the existing Git integration and `.site-public` output boundary.
Main must verify exact-head CI and all PR checks, unchanged reviewed/merged
tree, complete public-artifact identity, protected preview/canonical response
controls, internal-path404s, and retained prior production. No new local deploy,
database, external storage dependency or feature flag is authorized by this
acceptance. Do not delete raw evidence, worktrees or historical captures.
