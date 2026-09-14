# G0a–G2a foundation-only production release — 2026-09-14

Status: **production verified**. This report is main-owned release evidence;
it does not claim common-standard legacy receipt repair or V3 Fit activation.

## Authorization and exact integration

After G2a acceptance the user requested “合并 发布 继续下一步”. GitHub login
`fitappliance` and repository push/admin permissions were checked before writes.
[PR209](https://github.com/fitappliance/fitappliance/pull/209) was retargeted from
the G1b branch to `main` as the aggregate of already-reviewed PR201–206 and G2a.
Every historical task head was proven an ancestor; unrelated PRs and the dirty
recovery checkout were not imported. PR201 was automatically marked merged;
PR202–206 were closed as incorporated after rechecking each exact head. Their
branches, commits and review records are retained. Their inclusion here is not
a second release or a claim every PR was individually merged.

| Binding | Exact identity |
| --- | --- |
| Previous production main | `2315b30cf0309d0da23e2de8781362d30865f17a` |
| Reviewed feature head | `f36623e0940c1c400570ce7470bb32b30dbe73b7` |
| Merge commit | `7f4c988407d0cf61e61624d49b2c309839867d26` |
| Feature, GitHub test-merge and production merge tree | `230166ddfbd058a2c61951b17743da153729ca52` |
| Production deployment | `dpl_D77p8czQMYPj8DNfYj2hTyQ1w22B` |
| Cloud artifact SHA256 | `4d513216621ab80f0a554240c98c8ad72debd50c090b0e20aef9cb597ff916b7` |

Relative to the previous main, the27-file change contains V3 domain modules,
policies, tests, offline audit scripts and documentation; the only edit to an
existing file adds mandatory V3 test/syntax discovery in `package.json`.
The application, dependencies, public files, active pointer and source policies
are unchanged. No runtime path imports the new modules. The merge result was
verified byte-identical to the accepted feature tree, not assumed from ancestry.

## Tests and production artifact

The six final-feature checks were read immediately before integration.
[Node20 validation run34827186136](https://github.com/fitappliance/fitappliance/actions/runs/34827186136),
job103921931015, proves3,072 pass/0fail/0skip plus lint, canonical build,
publication boundary, generated diff, sitemap and review-content validation.
No redundant local whole-suite was run on the identical tree.

The [production deployment](https://fitappliance-18fsrsh8b-fitappliances-projects.vercel.app)
is READY with exact merge metadata, Node24.x and outputDirectory `.site-public`.
The cloud build logged3,281 files/54,856,568 bytes and the artifact hash above.
Main independently reproduced that digest from the previous full local manifest
by changing only the service-worker commit version to `7f4c988`; every other
public file digest is unchanged.

The active release remains `retail_lifecycle_release_6c42c754aeb1ff49097b32b4`:
3,513 catalogue products,349 current-retail,8,087 historical-reference records,
and0 Fit publication violations. Those are active-release counts, not legacy
registry or new-evidence counts.

## Live verification

-15 immutable-host HTTP controls: homepage, hero script and service worker200
  with exact application bytes;9 private source/test/policy/document paths404;
  three API routes accept no GET writes and return405.
-11 canonical-host controls: exact homepage, hero, service worker, appliances
  data and historical metadata bytes; fit-checker, brand and sitemap200; two
  internal files404; apex308 to the exact canonical `www` URL.
- Vercel aliases include both public domains and resolve to the new deployment.
- Post-release error-level log query (15-minute window, limit50) returned0
  entries. This is a snapshot, not a continuous monitoring guarantee or proof
  that every possible user interaction has been exercised.
- No API POSTs, cookie persistence, deployment-protection changes or raw secret
  reads. The existing authenticated CLI was used because the app connection
  required reauthentication.
- A duplicate browser flow suite was not run: application bytes and data match
  the separately browser-verified PR208; actual new-host/cache-version and
  publication-boundary controls were checked above.

Local QA results are retained in the ignored plan workspace as
`G2a-preview-7f4c988.json` and `G2a-production-7f4c988.json`. They contain response
status/digests, no original private evidence. This versioned report holds the
durable acceptance summary.

## Preservation and rollback

The previously safe production deployment
`dpl_DAimuMY5sAEaX4CqZiWAXzW5UBG7` is retained. No rollback was executed; it remains
the fallback if new release-specific failure appears. Do not roll back to a
pre-PR207 root-output deployment. No data migration means no receipt/ledger
reverse migration is required for this foundation release.

Original recovery checkout begins this turn with176 status rows, SHA256
`199e6e9f1c1799b9b61d8b921f82a282844102b6f157af27b4247730daed2e2f`; its binary diff
SHA256 remains `fea1454bddd5afba9dd779f54f498353bb5b6c4d45a88a49711cdf9c87447f93`.
Do not reuse the previous175-row status identity as this turn's baseline.
No original evidence, untracked user material, old branch, worktree or audit
history was deleted.

## Continuation boundary

G2b proceeds from merged foundation7f4c988 in a separate feature branch with one
Terra/max implementer. It adds only finite relationship research, with no field
inheritance or public consumer. Actual evidence proof, old-receipt repair and
V3 consumption still require the later gates in the canonical plan.
