# Release-boundary preflight — 2026-09-14

Status at preflight: publication blocker confirmed; no merge, deployment or production-setting
change had been performed. Subsequently resolved for current production by standalone
[PR207](https://github.com/fitappliance/fitappliance/pull/207); see the [release proof](2026-09-14-publication-boundary-release.md).
The observations below remain the pre-fix historical record. This is a bounded release audit, not an exhaustive security scan
or proof that the remaining V3 stages are complete.

## Confirmed behavior and cause

At approximately 05:22 UTC, the active Vercel project used the repository root
(`outputDirectory: "."`) as its static output directory. Three unauthenticated
requests to the canonical production site returned HTTP 200 with bytes identical
to the corresponding files at production commit
`35a4ea0a180f0f9f2d4c35b281cf618d8c93023a`:

| Direct path | Bytes | Response SHA256 |
| --- | --- | --- |
| `/src/domain/active-retail-release.mjs` | 6331 | `4f6872d98c7509e7c4b3a4b6dfa34208eaced9d6882996f2c8c58bddd191b373` |
| `/docs/product-core-brief.md` | 60028 | `9be84a660f55c998cf9c4b7999d0461609a66ed43abc4225af8aed9052781719` |
| `/data/architecture-v2/decisions/active-retail-release.json` | 1122 | `976a1463dd747763d20c959d52ecceaa1617a52eff6b06f17d9d8f59b2a6f222` |

These are real file responses, not a generic HTML success fallback. Only these
bounded, known files were downloaded and hashed; no secrets, customer records or
raw evidence bodies were fetched. This audit does not claim credentials leaked.
GitHub currently reports the repository as public. The sampled source files are
therefore already accessible through GitHub: this is a deployment-scope/control-
plane separation issue, not proof of newly disclosed private source code. Whether
any other served material violates its action-scoped rights remains unverified.

The result matches [Vercel's output-directory contract](https://vercel.com/docs/builds/configure-a-build#output-directory):
the contents of that directory are statically served. `noindex` and cache headers
do not enforce access boundaries. `.vercelignore` is not a public-artifact
allowlist and currently does not exclude these files.

This bypasses the intended distinction between internal evidence/control-plane
files and explicitly published projections. New receipt/review material must not
be released through the same unrestricted directory boundary.

## Why existing green checks were insufficient

`scripts/audit-publication-boundary.js` audits workflow commands and the reviewed
publication route. It does not inspect the deployed static-file inventory.
`tests/vercel-production.test.mjs` checks routes, canonical redirects, caching and
known script shadowing, but not the absence of internal data/source/docs in the
deployment artifact. Their previous passes do not establish this missing property.

## Current release and authority

- User authorized supplementation followed by merge and release after acceptance.
- GitHub push/admin permission was verified. The main branch has no protection
  rule and the ruleset list is empty; exact-final-commit gates must be enforced
  before any merge, not delegated to an assumed repository restriction.
- Existing local Vercel login can inspect the correct FitAppliance project.
  The separate connector requires reauthentication, but it is not a deployment
  access blocker while the legitimate local login works.
- Active production deployment: `dpl_BY3B3AatSC56LXVeMKnX2cr5F22M`, READY,
  commit `35a4ea0a180f0f9f2d4c35b281cf618d8c93023a`. Git integration targets main,
  deployment creation is enabled and custom domains are automatically assigned.
- Production is configured for Node 24.x; existing PR validation uses Node 20
  and local execution uses Node 22. Final acceptance must include the actual
  production build/runtime compatibility, not treat those runtimes as identical.
- Read-only active-release loading still validates the existing V2 descriptor,
  manifest and artifact hashes: 3,513 products, 349 current-retail products and
  8,087 historical-reference records. This is not V3 completion evidence.

## Required correction and release gate

Remove internal files from the actual deployment artifact. Preserve legitimate
pages, public assets, API functions, redirects and explicitly rights-approved
evidence; do not solve this by deleting original evidence, disabling permissions,
adding only a noindex rule or denying only the three sampled paths.

Acceptance must include an artifact allowlist check, negative HTTP checks for
internal and newly introduced paths, positive route/data/function checks, and
an exact-commit preview followed by production verification and a safe rollback
target. The existing service-worker mixed-cache/current-input tests remain
necessary; HTTP cache headers alone cannot prevent stale positive Fit results.

At this preflight, merge, production release and further preview pushes were held pending resolution
of this boundary. The user was asked whether to prioritize a separately validated
publication-boundary hotfix or include the correction in the full-upgrade release.
Independent G2a local implementation could continue. Remediation was not claimed
at this preflight. The later release proof resolves current production only; old
V3 branches still require the same boundary before any further preview push.
