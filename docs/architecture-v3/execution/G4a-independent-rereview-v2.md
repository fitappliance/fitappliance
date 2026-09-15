# G4a independent re-review v2 — F1/F2 only

**Verdict: APPROVED for the frozen F1/F2 correction.** Specification compliance:
`PASS`; code quality: `PASS`. F1 and F2 are `ADDRESSED`; no new breakage was
identified in the fix-only diff. Final-commit CI, integration and release remain
with main.

Auditor: Codex, continuing the independent v1 review, distinct from executor
Dirac `01a0a357-1dcd-7e91-ba8b-c5b97064d67e` (closed per dispatch).
Base: `34e7ae033c63bd2fb96d74d313e5d4c540f42b89` plus the frozen uncommitted patch.

## Findings resolved

**F1 — Important — ADDRESSED.**
[Claim implementation](../../../src/domain/architecture-v3/evidence-claim-v3.mjs),
lines 21 and 416–423, requires `fa_product_relationship_` plus exactly 64
lowercase hex digits. This matches the actual
[assertion producer](../../../src/domain/architecture-v3/product-relationship-assertion.mjs),
lines 40–41 and 237–248. The
[Claim tests](../../../tests/architecture-v3/evidence-claim-v3.test.mjs),
lines 453–498, consume a producer-generated ID and reject six malformed ID
variants through both factory and stored validation. Stored negatives recompute
the payload hash, so rejection proves the typed guard rather than stale identity.
This is syntactic validation; relationship resolution and receipt eligibility
remain G7 responsibilities. A null derivation reference alone is not an F1 defect.

**F2 — Important — ADDRESSED under the unknown-preserving ruling.**
[Claim implementation](../../../src/domain/architecture-v3/evidence-claim-v3.mjs),
lines 502–507, supplies its exact subject to the optional-product API.
[Context validation](../../../src/domain/architecture-v3/engineering-context.mjs),
lines 260–285, reuses the existing normalized witness matcher at lines 250–254.
For every non-null key, including `unconditional`, one witness must match
product, market, key and the complete normalized condition set. Unrelated valid
witnesses cannot satisfy this requirement; a matching witness among them can.

Null configuration remains unspecified; unknown datum/state remains valid with
the required witness when the key is named. No runtime `applicable` result is
required. This corrects the overbroad remedy suggested in v1 without changing
the preserved historical report. Optional product is shape-validated, while
calls omitting it retain the previous shape-only behavior; the existing resolver
continues using that path. Coverage is in the Claim tests, lines 656–756, and
[semantics tests](../../../tests/architecture-v3/semantics.test.mjs), lines
741–878: factory/stored negative cases, complete reordered witness, unrelated
witnesses, unconditional, null/unknown preservation and old API compatibility.
Source replay remains G4b. No second predicate matcher was introduced.

## Frozen evidence

Local-only packet/capture directory:
`.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/`.

- Read the entire fix-only `G4a-fix-review-v2.md`: 35,565 bytes, SHA-256
  `1ab3384f0ba46571e8033c7dc06b8909a35bf3fc110a249c512e911c4fde260a`.
  `G4a-fix-freeze-v2.json` binds the before/after identities.
- Ruling: `G4a-fix-brief.md`, SHA-256
  `454f04649dc9f044fb6572533c49766c3c177a1a0dccaa07061b904bd5fbeccb`.
- Reviewed the final F1/F2 addendum in
  [executor report](G4a-claim-v3.md), lines 206–275, SHA-256
  `e51e2d1d669bd4ffb6f7c468c2fba1584b5e49919ed80374a0aa9a6e2781805b`.
- `G4a-F1-F2-manifest.json`, SHA-256
  `04bf984c92e32268b3d9383db000dfbd72ae339ee09641fdde7c46e94d2b54e8`.
  Rechecked all six captures' metadata/stdout/stderr sizes and hashes against
  this manifest, actual child exits and recorded test totals. F1: 12 missing
  expected exceptions at RED (exit 1), then 23 pass (exit 0). F2: 18 missing
  Claim exceptions plus 16 unsupported optional-product cases at RED (exit 1),
  then 83 pass (48 Claim + 35 semantics, exit 0). GREEN has no failures,
  skips, cancellations or todos. Syntax and diff captures both record exit 0.
- Full snapshot `G4a-freeze-v2.json` / package SHA-256
  `c28919f33757a6201ca6d16ab8bf7ad5aef3ea2e7a08bca5b46556770069b1b2`
  is reference-only; its full code packet was not re-reviewed.

Current changed-file hashes were rechecked:

| File | SHA-256 |
| --- | --- |
| `src/domain/architecture-v3/evidence-claim-v3.mjs` | `30b55f2fa23ac55eb91663f3e9cdf0621fffe7d49e3710f998bf1a08f49907a3` |
| `src/domain/architecture-v3/engineering-context.mjs` | `8e5495aebecab28e42945f021fbeb35e98ac54a59bf6383605c417a09e3669ff` |
| `tests/architecture-v3/evidence-claim-v3.test.mjs` | `4562a2fb59a4104bb3dfbb31b2821bcfc96cc14cd6f49252d15481f926a9e1b2` |
| `tests/architecture-v3/semantics.test.mjs` | `e4a3d02aa851e85127336ce7415a87cb1b775de3e62f4406bcf7cbb4b1da7736` |

Only this re-review report was written. No tests were rerun and no source, Git,
real-source or release action was performed. The prior 3,216-test capture proves
v1 only. Historical v1 audit `ced136a72710c41e0eaef8c3415c3f0e4641421ee8481ada257442bc7e3f0bf1`
and its link-normalized `61e38ebcbcb98dd7251ac862738cdbc183768a574b0120a852443111577366d4`
retain their original findings and verdict; this report records closure for v2.
