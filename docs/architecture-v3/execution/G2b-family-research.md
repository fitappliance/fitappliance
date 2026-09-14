# G2b — AU Product-family research graph

Worker handoff: **REVIEW_REQUIRED**. This is the bounded G2b implementation
only. Main remains the authority for plan/status, independent review, Git,
release, publication, and rollback work.

Main test-only amendment (2026-09-14): the original Terra/max implementer
completed the domain implementation and full suite, then hit its usage limit
before the final seed-test repair. Main completed only that test/report repair;
both domain modules, seed and generated graph retain the handoff hashes below.
The original 3,105-test full run predates the ten additional negative tests.

## Scope and boundary

| field | value |
| --- | --- |
| worktree / branch / HEAD | `architecture-v3-g0a-baseline` / `codex/architecture-v3-g2b-family-research` / `7f4c988407d0cf61e61624d49b2c309839867d26` |
| finite brief | `G2b-brief.md` / `64438d1f0310f920d821c2e2f625db78c576cf2c776c3685c50c3dee59beadda` |
| frozen market | `AU` |
| authored paths | exactly the six G2b paths listed below |

Concurrent main-owned plan, protocol, and release-note changes were preserved
and were not used as G2b business inputs. No commit, push, merge, dependency
installation, source acquisition, build, publication, public-data write, or
protected-path change was performed by this worker.

## Delivered contract

`buildProductFamilyGraph({ nodes, edges })` uses the strict V3 JSON codec,
closed input objects, deterministic ordering, domain-separated group/graph
hashes, detached immutable output, explicit same-market/same-brand ownership,
duplicate/dangling/self-edge rejection, and `VARIANT_OF` cycle rejection.

`createProductRelationshipAssertion(...)` remains research-only: all outputs
are `research_candidate`, always `derivationEligible: false`, preserve only
named model IDs, field names, G1a-validated contexts, and unverified candidate
references, and cannot carry fields, measurements, authority verdicts,
receipts, inheritance, or publication fit.

The shared relationship target allowlist is a null-prototype table and both
public APIs require an own allowlisted key before use. This rejects inherited
`toString`, `constructor`, and `__proto__` values rather than consulting the
prototype chain. Graph/assertion canonical-product validation shares the exact
`/^fa_prod_[a-f0-9]{24}$/` format; graph brand validation uses the exact
`/^fa_brand_[a-f0-9]{64}$/` G2a format. Syntax checking is intentionally not
authentication of arbitrary caller IDs.

Candidate-reference/locator normalization and the exact-model predicate now
have one narrow authority in the graph module. The assertion module delegates
then rethrows any shared validation failure as its own
`ProductRelationshipAssertionValidationError`, preserving both public APIs'
typed errors. A candidate `locator` is explicitly an unverified
source-discovery hint only: it is not a G3 typed Fragment locator, a receipt,
or source/authority proof.

## Bounded AU seed and closure

The versioned seed wrapper is closed to `schemaVersion`, `inputVersion`,
`canonicalizationVersion`, `market`, `sourceInputs`, `nodes`, and `edges`; only
`{ nodes, edges }` enters the graph builder.

| item | result |
| --- | --- |
| explicit brands | 2: Bosch and Fisher & Paykel |
| exact canonical products | 4: `SBI8ECS01A`, `SBI8EDS01A`, `DD60D2NB9`, `DD60D2NX9` |
| research nodes | 2 version-bound `platform` nodes |
| graph edges | 4, all `HYPOTHESISED_SHARED_PLATFORM` |
| asserted/official/series edges | 0 |
| actual relationship assertions | 0 |
| wildcard/prefix model sets | 0 |
| graph SHA-256 | `6ae2707d1e4996b452e2db19563d25c363f074a10dfa16ffcf369e2e10e2499c` |

The portable seed test independently rehashes both frozen source files and
binds every selected node to its exact canonical row ID/model/brand and exact
brand-registry row ID/display name/pointer. Closure also binds each input brand
node's label, AU market and exact source reference, requires one hypothesis
group per selected brand and its exact two product members, and forbids proof
references on these unproven seed groups/edges. Source-file digests and selected
canonical-row IDs are checked independently of snapshot regeneration.

| frozen source | SHA-256 | bound data |
| --- | --- | --- |
| `data/architecture-v3/generated/brand-registry.json` | `cbb4dac77938ae0f9bf40278325b42a33b0e61c6403a5212eff9e9a05e7dbf0d` | G2a brand IDs and `/registry/brands/0`, `/registry/brands/98` |
| `data/architecture-v2/generated/canonical-registry.json` | `2459a3a6254c336c875a1fc8d5e070d0271175dd08786bba6477b94ef410336f` | four exact product IDs/models/brands and `/products/120`, `/products/121`, `/products/294`, `/products/295` |

## TDD witnesses

Observed RED → GREEN behavior includes:

1. A two-node `VARIANT_OF` cycle initially produced “Missing expected
   exception”; it now rejects before graph output.
2. A complete-looking relationship candidate initially returned
   `derivationEligible: true`; it now remains a non-derivable research
   candidate.
3. Bare, truncated, and non-hex `fa_brand_` / `fa_prod_` IDs initially passed
   prefix checks; exact frozen ID syntax now rejects them in graph/assertion
   paths using valid-format synthetic fixture IDs for positive cases.
4. `toString`, `constructor`, and `__proto__` with `target: null` initially
   produced “Missing expected exception” in the assertion path; graph edges
   reached endpoint validation instead of an allowlist rejection. Both paths
   now reject them as unsupported relationship kinds.
5. Seed-closure negative mutations reject a changed source digest and an
   altered selected canonical-row ID; the generated snapshot must deep-equal a
   fresh in-memory build.
6. Main added ten negative seed mutations before strengthening the closure
   helper. All ten failed with `Missing expected exception (AssertionError)`:
   wrong brand label/market/source path/hash/pointer, missing or reassigned
   membership, both groups assigned to one brand, and unsupported group/edge
   proof references. The strengthened helper rejects all ten; all 43 focused
   tests pass. This closes a regression-test gap, not an observed seed-data error.

## Final artifact hashes

| path | SHA-256 |
| --- | --- |
| `src/domain/architecture-v3/product-family-graph.mjs` | `9d0a1f58027897e1c19c0bd5e6d460e5a31b197fc2e08e2a564979483cde085b` |
| `src/domain/architecture-v3/product-relationship-assertion.mjs` | `670def2be8acbc326575f1d889b9a21658cd201a3eb33596efd05695b15c1990` |
| `tests/architecture-v3/product-family-graph.test.mjs` | `9393ae18af936eb564dd5fdfc43bf851a767004dfc028b0ce0d57386c0c3c074` |
| `data/architecture-v3/research/product-family-input.json` | `5833e9a33e4a757fe202fe6efc3cbcf09b494fb3fc2aaf4ce763845b71bd89ef` |
| `data/architecture-v3/generated/product-family-graph.json` | `9b922c544db0380089184f8a6aa31d0d6d8cf6e37e85843f431fff243efab8ea` |

## Checks

| command | result |
| --- | --- |
| `node --test tests/architecture-v3/product-family-graph.test.mjs` | final main amendment: 43 pass, 0 fail/skip; original worker handoff: 33 pass |
| `npm run lint` | exit 0 |
| read-only `validateSchema({ outputPath: '/dev/null' })` | 2,330 pages, 6,145 JSON-LD blocks, 0 errors |
| `npm test` (worker's single full-suite run, before test-only amendment) | V3 syntax pass; 3,105 pass, 0 fail/skip; final-head remote CI remains a separate main acceptance gate |
| read-only `auditDocs({ writeReport: false })` | 112 Markdown files scanned, 0 drift issues |
| final scope / whitespace audit | six approved G2b paths only; concurrent main-owned documentation paths untouched; `git diff --check` clean and no trailing whitespace |

## Limits and review focus

This is a small, source-bound research graph, not evidence of a shared
platform, official model group, current AU sale, source rights, exact document
identity, dimensions, Fit, or publication eligibility. The two platform groups
are deliberately hypotheses only. Builder-level ID checks establish syntax and
consistency only; source-row closure is deliberately enforced by the bounded
seed test rather than pretending to authenticate arbitrary API callers.

**REVIEW_REQUIRED:** independently inspect the six G2b paths, replay the seed
closure against the frozen inputs, and confirm that no G3 locator/source-proof
meaning or derivation/publication capability can enter through the shared
helpers. No next-task work has been started.
