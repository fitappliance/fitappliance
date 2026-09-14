# G1a common-standard legacy receipt semantics

Status: Main review accepted; task progress is recorded in the original plan.

## Scope and byte binding

| field | value |
| --- | --- |
| execution branch / base HEAD | `codex/architecture-v3-g1a-semantics` / `e9a02d6887e46e60dd48d9a84b63a732e9e175cb` |
| G1a brief | `.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/G1a-brief.md` / `5b458166d46ffacfb124f15cc32778c25932bf12dcecc1b7b46ffe6bc78cbeed` |
| compiled policy | `fit-semantics-v3-1` / `716e6f13199569c5b35c1c3525ef383e71fa6ed18e7b5c396aa3cc0d43ce0df8` / 56 claim fields |
| main-owned plan | pre-existing modified `docs/superpowers/plans/2026-09-13-architecture-v3-evidence-foundation.md`; read as contract, not modified by the worker |

| frozen input | raw SHA-256 |
| --- | --- |
| `data/architecture-v2/policies/product-data-field-rights-dictionary.json` | `69c1dac30edb4b736777592eb70be541f7aa99fbe7e4f0982c6be5b573291d03` |
| `data/architecture-v2/generated/installation-evidence-applicability-matrix.json` | `96182572d9d8da3aa6b6bb688dbf1cdbb55724e8252f4493722620aadba1a80f` |
| `src/domain/dimension-evidence-claim.mjs` | `8aebd1ad1a2817227d3ab95d2fdc48630a96dd125ffdf7590755741b724e44d4` |
| `src/domain/installation-knowledge-v3.mjs` | `847b023f930ada57a9874b60a9863ff3c49ddc06bb947e99dcf22a8c37b289e6` |
| `src/domain/historical-evidence-recovery-contract.mjs` | `ee48fe338f14aaad6193c655899e79e3f988874ab2482b10869866461c77ee2e` |

## Implemented contract

`canonicalEvidenceJson(value)` is a direct strict serializer, not a wrapper around the historical hash function. It lexically orders own object keys, preserves array order, serializes an own `__proto__` key as data, and rejects sparse arrays, accessors, symbols, non-enumerable data, non-plain objects, cycles, `undefined`, and non-finite numbers. It imports no Node hash API; callers opt into hashing separately.

Historical `canonicalJsonSha256` remains intentionally unchanged for this foundation: its omitted own `__proto__` data and a one-hole sparse array can produce equal digests to lossy JSON alternatives. The regression witnesses describe lossy encoding equality, not a cryptographic collision; strict V3 rejects the sparse input.

`compileV3Semantics({ fieldDictionary, installationMatrix, overlay })` returns a frozen policy plus its strict-codec SHA-256. `requireV3Semantics` requires `schemaVersion: 1`, the supported codec version, a valid hash, and canonicalizable policy bytes. `normalizeV3FieldValue(input)` returns one of:

```text
null
{ kind: 'fixed', fieldPath, value, unit, inclusions, applicability }
{ kind: 'range', fieldPath, minimum, maximum, unit, rangeMeaning, inclusions, applicability }
{ kind: 'boolean', fieldPath, value, unit: null, inclusions, applicability }
{ kind: 'not_applicable', fieldPath, value: null, unit: null, inclusions, applicability }
```

Raw declared decimals are converted through a small decimal-fraction path before integer-mm validation. Thus `1.001 m` becomes exactly `1001 mm`; no blanket rounding is introduced. The conversion table is exact and dimension-scoped, so an overlay cannot add `L -> mm` or alter a permitted ratio. Non-V2 owner fields retain nonnegative finite values without a universal integer or `10,000 mm` ceiling.

The 17 `DimensionEvidenceClaimV2` field paths are restored as fixed-or-range claims with their V2 axes, V2 canonical scopes, and V2 integer-mm bounds. The semantic field record retains dictionary facts independently in `sourceDefinitions`; for example, its dictionary `product_closed` scope remains metadata while the V2 claim scope is `product_closed_external`. The three `service.*` fields are present without changing legacy source files.

Existing `DimensionEvidenceClaimV2.value.mm`, `minMm`, and `maxMm` remain already-canonical millimetres even where `sourceUnit` is `cm`. G1a normalizes raw V3 candidate input only. A later G1b must not re-convert those existing canonical V2 values from their source-unit label, and legacy upgrade inference is not V3 proof.

`validateEngineeringContext({ context, semantics, witnessedConditions })` returns the normalized, frozen closed context. Its exact `operatingState` shape is `{ kind, angleDegrees }`; finite allowlisted `eq` predicates, configuration-key base predicates, datum/state rules, and `openingState === operatingState.kind` are enforced. A null configuration key stays unspecified.

`resolveEvaluationContext({ candidateContext, requestedContext, product, witnessedConditions, semantics })` returns exactly `applicable`, `inapplicable`, `unknown`, or `invalid`. A named key supplies required base predicates but can carry extra allowlisted predicates. Every candidate predicate must appear with the same value in requested facts; absence is `unknown` and a known conflict is `inapplicable`. Reserved `unconditional` contexts and witnesses have no conditions, while a valid unconditional candidate can apply to a known underbench request. Differing known reference datums remain `unknown` without a witnessed transform; an explicit contrary predicate still remains `inapplicable`. Before any `inapplicable` result, the resolver requires an exact product-market witness for the candidate; missing or other-product/market witnesses remain `unknown`.

`witnessedConditions` records are structured assertions only. They are not source receipts, do not establish evidence provenance, do not approve a Fit outcome, and do not grant global authority merely because a configuration key is shared.

## Test evidence

| phase | result |
| --- | --- |
| production semantics RED | `node --test tests/architecture-v3/semantics.test.mjs`: 7 pass / 4 fail for missing service fields, blanket owner bound, tiny-number underflow, and cross-dimension conversion |
| import-resolved context RED | real fail-closed interim module: 12 pass / 3 behavioral failures; no test-local compiler or normalizer fallback was used |
| acceptance-gap RED | production module: 15 pass / 3 fail for the required context return, named-key extra predicates, and schema/error handling |
| datum / unconditional RED | `node --test tests/architecture-v3/semantics.test.mjs`: 16 pass / 2 fail for datum mismatch and nonempty unconditional conditions |
| final focused G1a set | `node --test tests/architecture-v3/canonical-evidence-json.test.mjs tests/architecture-v3/semantics.test.mjs`: 25 pass / 0 fail |
| syntax runner | explicit five-file V3 set passed; the final `npm test` runner also passed |
| full suite | `npm test`: 3,007 pass / 0 fail |
| lint | `npm run lint`: exit 0 |

## Final artifact hashes

| G1a path | raw SHA-256 |
| --- | --- |
| `src/shared/canonical-evidence-json.mjs` | `9bdf42c479827662497e1cf74c1ffd13a13d85085675c024c5809dd69647d451` |
| `src/domain/architecture-v3/semantics.mjs` | `5b096ae9b2ef154e63b108bc19adcc6803eb8bb2e1dfe2db660c8b39f90be807` |
| `src/domain/architecture-v3/engineering-context.mjs` | `99a4088a0b5e6499e1bb284bb1236a4c3ee47212d176feb619546071daf9b893` |
| `data/architecture-v3/policies/semantics-overlay.json` | `b08b15a0c9134231f280ae03b1919409e566f62784031cc736897cc6e2554b44` |
| `tests/architecture-v3/canonical-evidence-json.test.mjs` | `197debaf373d99c86a82ed326543774f55fa64b47da608dab8b62b34951a484a` |
| `tests/architecture-v3/semantics.test.mjs` | `767e0ad1a2e3c003df939dd75471f5ef1af2bee6b92c8d5a58dd9d8b02499b62` |
| `docs/architecture-v3/execution/G1a-semantics.md` | self-hash supplied in the final handoff rather than recursively attested here |

The worker did not rewrite legacy inputs or run build, publication, sync, OCR/recovery, evidence promotion, commit or push. G1b and later work were not started.

## Main acceptance

Main reviewed the actual codec, numeric and context implementation and the
behavioral counterexamples, matched all 11 input/artifact hashes above, and
checked the seven-file worker boundary plus the two main-owned plan/spec edits.
Code commit `3a9df43567cb774d6f9ea4f1d836a36d7f7ac1d0` was pushed in
[Draft PR205](https://github.com/fitappliance/fitappliance/pull/205), stacked on
the docs-only Revision 3 PR204. All six checks passed at that code commit.
Run `34800123395` used Node20.20.2 and passed 3,007 tests with zero failures or
skips, followed by build and publication-boundary validation. No local duplicate
whole-suite rerun or second reviewer agent was used. This accepts G1a only, not
source facts, repaired/reissued receipts, Verified Fit coverage or production
promotion. The plan/spec now match the explicit resolver witness contract.
