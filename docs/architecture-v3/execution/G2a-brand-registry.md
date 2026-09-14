# G2a — AU BrandRegistry

Worker handoff: **REVIEW_REQUIRED**. This report records the bounded G2a
implementation only; the plan remains the only task-status authority and main
owns acceptance, Git, build, publication, and rollback verification.

## Scope and frozen boundary

| field | value |
| --- | --- |
| worktree / branch / HEAD | `.../architecture-v3-g0a-baseline` / `codex/architecture-v3-g2a-brand-registry` / `d4d4244c11d097f1265fc02276bdd2ca957ca817` |
| continuation brief | `G2a-continuation-brief.md` / `965d9511a177cdf64d0859ee86e70978f935f2649383ce2e43d6a3a82f35cd07` |
| finite task brief | `G2a-brief.md` / `70f7f0be78f4dc946ed6ef48e5bd20ebb1320d425913d201be77c390470b011d` |
| main-owned plan | `docs/superpowers/plans/2026-09-13-architecture-v3-evidence-foundation.md` / `ba2c91be057b18fdff607b0d7ba1f291cbe49b3e0107d33509b7c7cbb986ca56` |
| package / lock | `9b317c68418d69ae2ca01dac7bfb797cf0d236233ffc604e156a3a25f4d550f1` / `ad45d58a7bf0e4c88a0b26edc9c73100810358286f2f39354b978bc25238d0e7` |
| V3 strict codec | `src/shared/canonical-evidence-json.mjs` / `9bdf42c479827662497e1cf74c1ffd13a13d85085675c024c5809dd69647d451` |

Only the five approved G2a paths were authored. Pre-existing, main-owned dirty
plan/protocol/release-boundary files were neither edited nor used as G2a output.
No dependency installation, source acquisition, receipt work, Fit change,
commit, push, build, sync, publish, or public-data write was performed.

## Contract delivered

`buildBrandRegistry({ brands, officialHostPolicyRefs, market })` uses the V3
strict codec before inspecting caller data and returns `{ registry,
registrySha256 }`. `resolveBrandAlias({ registry, market, alias })` returns
only `{ status: 'resolved', brandId }`, `{ status: 'ambiguous', brandIds }`, or
`{ status: 'unknown' }`; invalid input/registry shape throws
`BrandRegistryValidationError` with `INVALID_BRAND_REGISTRY`.

Brand IDs hash this versioned identity payload with Node SHA-256 over the shared
codec:

```json
{
  "brandIdDomain": "fitappliance.brand-registry.id.v1",
  "canonicalizationVersion": "fit-evidence-json-v3-1",
  "market": "AU",
  "schemaVersion": 1,
  "stableBrandKey": "legacy-display:<trim-collapse-lowercase spelling>"
}
```

The generated snapshot is exactly the `buildBrandRegistry` result. Its closed
registry shape is:

```text
registry = {
  schemaVersion, registryVersion, canonicalizationVersion, brandIdDomain,
  aliasNormalizationVersion, market, brands, officialHostPolicyRefs
}
brand = {
  brandId, stableBrandKey, displayName, observedSpellings, aliases,
  researchAliases, parentGroup
}
officialHostPolicyRef = {
  brandId, policyPath, policySchemaVersion, policyVersion, policySha256,
  brandPointer
}
```

The build input is separately closed to `{ market, brands,
officialHostPolicyRefs }`. The versioned seed wrapper adds `schemaVersion`,
`inputVersion`, `canonicalizationVersion`, and `sourceInputs`; it is not passed
unchanged to the build API. The local shared field-normalization path preserves
the resolver's stricter required `parentGroup`, closed keys, original sorted
set-like arrays, brand-ID consistency, and duplicate detection.

Policy pointers must be exactly `/brands/<one JSON-Pointer token>`; descendants
and malformed `~` escapes reject, while valid `~0`/`~1` escapes remain valid.
Structural validation deliberately does **not** claim to verify policy source
bytes. The portable seed-closure test independently binds the three frozen raw
input hashes and every policy reference's path/schema/version/digest/pointer.

## Seed and snapshot closure

| item | result |
| --- | --- |
| canonical source | 3,515 records; 157 raw brand spellings |
| seed | 152 trim/collapse-whitespace/lowercase groups; all 157 spellings preserved in `observedSpellings` |
| group identity closure | each seed brand's observed spellings have exactly one normalized key; `displayName` has that key and `stableBrandKey` is exactly `legacy-display:<key>` |
| semantic merges | none; case/whitespace-only groups are the only grouped spellings; `Mitsubishi` and `Mitsubishi Electric` remain distinct |
| parent groups | 0 non-null; no ownership inference |
| resolver/research aliases | 0 / 0 in this frozen seed; current `brand-canon` has no non-case-only alias mapping |
| policy closure | all 26 policy keys map uniquely to one selected `legacy-display:` stable key and one exact `/brands/<key>` pointer |
| generated registry | AU, 152 brands, 26 policy references, `registrySha256` `9f462e007851692a191fe47d462dce390129afd4d6edf0b047a41e9492bd04eb` |

Frozen raw inputs:

| path | SHA-256 |
| --- | --- |
| `data/brand-canon.json` | `fc78352526e25ed6288b6f6f157f1598e1e2c24759b680e75154f33a776ce5b6` |
| `data/architecture-v2/generated/canonical-registry.json` | `2459a3a6254c336c875a1fc8d5e070d0271175dd08786bba6477b94ef410336f` |
| `data/architecture-v2/policies/manufacturer-source-policy.json` | `35e35b0bda7b5df46b3044e25404e30fd512141e4b29a66aa9d43ae6e9ff3db1` |

Final G2a artifact hashes:

| path | SHA-256 |
| --- | --- |
| `src/domain/architecture-v3/brand-registry.mjs` | `48ef3cf23f6df1473e00d6eb559d3fe450742207dbac76ea0cd442bf0f61ae0b` |
| `tests/architecture-v3/brand-registry.test.mjs` | `92f13efccf77d65d40efc2166f855001bda850b5ba1da260b44794551eb87e37` |
| `data/architecture-v3/policies/brand-registry-input.json` | `939d0a29294bce255880bd5bc7d11e4bbb37c817dddf06c10dd9362c3424e50b` |
| `data/architecture-v3/generated/brand-registry.json` | `cbb4dac77938ae0f9bf40278325b42a33b0e61c6403a5212eff9e9a05e7dbf0d` |

## Deterministic snapshot regeneration

The source-derived seed is intentionally hash-bound and fails closed if a
frozen input changes. With that seed already validated, this command reproduces
the only generated G2a artifact and writes no public output:

```bash
node --input-type=module <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
import { buildBrandRegistry } from './src/domain/architecture-v3/brand-registry.mjs';

const input = JSON.parse(readFileSync(
  'data/architecture-v3/policies/brand-registry-input.json', 'utf8',
));
const snapshot = buildBrandRegistry({
  brands: input.brands,
  officialHostPolicyRefs: input.officialHostPolicyRefs,
  market: input.market,
});
writeFileSync(
  'data/architecture-v3/generated/brand-registry.json',
  `${JSON.stringify(snapshot, null, 2)}\n`,
  'utf8',
);
NODE
```

The seed-closure test rebuilds in memory and requires deep equality with the
committed snapshot, so any altered source hash, raw spelling, policy metadata,
selected stable key, pointer, or snapshot byte-derived structure fails locally.

## TDD evidence and checks

Observed RED → GREEN witnesses in this task:

1. Versioned ID identity: the new expected payload initially produced
   `fa_brand_a56b...`, while the partial implementation produced
   `fa_brand_60a3...` because it omitted `canonicalizationVersion`; adding the
   V3 version to the hashed payload made the focused suite pass.
2. A `/brands/alpha/0` reference initially built without error; after the
   single-entry pointer check it rejects deterministic descendants.
3. A `/brands/alpha~2` reference initially built without error; malformed JSON
   Pointer escaping now rejects while `~0` and `~1` remain accepted.

The seed test first failed because both new bounded artifacts were absent; this
was artifact-creation evidence, not a substitute for the three behavioral RED
witnesses above.

| command | final result |
| --- | --- |
| `node --test tests/architecture-v3/brand-registry.test.mjs` | 16 pass, 0 fail |
| `node --test tests/architecture-v2/canonical-registry.test.mjs tests/architecture-v2/evidence-source-verifier.test.mjs tests/architecture-v3/canonical-evidence-json.test.mjs` | 41 pass, 0 fail; final default suite subsequently reran these paths |
| `npm run lint` | exit 0 |
| `npm run validate-schema` | exit 0; 2,330 pages, 6,145 blocks, 0 errors |
| `npm test` | 3,072 pass, 0 fail/skip; V3 syntax runner included `brand-registry.mjs` and its test |
| read-only docs audit | `auditDocs({ repoRoot: process.cwd(), writeReport: false })`: exit 0; 110 files scanned, 0 drift issues |
| final scope / whitespace audit | 5 approved paths plus 4 recorded pre-existing paths; 0 unexpected paths, 0 `public/` paths; tracked and untracked `git diff --check` clean |

## Limits and handoff

This registry is an AU research/index identity artifact only. It does not prove
current AU sale, source rights, official-host validity, exact product/document
identity, field evidence, dimensions, source receipts, Fit, or publication
eligibility. A policy reference retains path/version/raw digest/exact brand
pointer only; it copies no hosts or authority verdict. Parent text grants no
inheritance. G2b and all later work remain unstarted.

**REVIEW_REQUIRED:** main should independently inspect the five-file diff,
confirm the seed/policy closure against the frozen sources and packaging boundary,
then decide acceptance. No commit, push, merge, build, publication, browser
verification, or next task was executed by this worker.
