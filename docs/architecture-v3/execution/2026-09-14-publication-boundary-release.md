# Publication-boundary hotfix — production verification

Status: COMPLETE for the standalone current-production boundary correction.
This is not completion of Architecture V3, G2a, old-receipt repair, or installation
evidence coverage. The user explicitly chose this correction for independent release.

## Immutable identities

- [PR207](https://github.com/fitappliance/fitappliance/pull/207), merged alone.
- Tested head: `89cfd6b8c27e4019d0eca9d57c8ce9f20bf3b556`.
- Merge: `87b2a8cda2e9ee1ddce4320e2bf56585fd85b8fa`.
- Both Git trees: `7c5f344fa01306ede192ea0821e4eeba87a86641`.
- Preview: `dpl_3CrBMA6oFNrUWCFcr95WwUPWPjQC`, READY on tested head.
- Production: `dpl_p9NRxdBZWK4i5hNCsrgNrDTYrA8W`, READY on merge; www/apex aliases
  assigned. Resolved Node24 and output directory `.site-public` confirmed.
- Production build finished2026-09-14T06:56:14Z; live verification06:56–06:58UTC.

The exact-head [PR validation](https://github.com/fitappliance/fitappliance/actions/runs/34815031133),
documentation, portability, copy-lint and Vercel checks passed before merge.
The local GitHub CLI credential failed; the existing authenticated GitHub
connection retained fitappliance push/admin permission. Remote GitData tree
identity was checked against the reviewed local index before branch/PR creation.
No credentials were exposed or protection settings disabled; preview authentication
used the existing Vercel login. Its temporary QA cookie was deleted after testing.

## What changed and what stayed fixed

Only9 hotfix files changed: the fixed static-artifact packager, tests, build/config
wiring, ignores and documentation. The exact original canonical build sequence
was retained, with packaging appended after the active-release audit. Only the3
existing root HTML files plus public/pages enter the artifact. Source, internal
data/docs, reviews, tests, raw/local PDFs and future unknown roots do not.
Symlinks, symlinked ancestors, hidden/special inputs and stale-output behavior
are explicitly handled. No original evidence or recovery changes were deleted.

Local artifact:3,281 files,54,854,799 bytes, SHA256
`08c7917052eac35900e7ed08c16d472fc4a5bef3d27eff3b706b4eb5ab3abbb5`.
Preview artifact: same count/bytes, SHA256
`5cb0efcc5c6f621d57a60534eaab09e073c811ecf319fd2c29164d3532c787e0`.
Production artifact: same count/bytes, SHA256
`16e0549e309c0285182c5e0bb74e23b1b67400393d983d24a8ba0393a8f23987`.
Main independently reproduced both cloud hashes from the local artifact by
changing only the service-worker commit version. The public source bytes otherwise
match. No runtime-data, API, UI, Fit-policy, page, dependency-lock or V3 code change.

## Acceptance evidence

- Implementer:2,971/2,971 full tests;18 boundary/config and73 route/search contracts
  pass; CLI failure, lint/syntax, complete build, schema and indexability pass.
- Main: complete patch review, actual output inventory/byte parity, documentation
  audit, original dirty-worktree status/diff comparison and live/provider checks.
  Documentation audit writes an audit report, but changes no documentation/source.
- Build before/after snapshot:7,944 files unchanged. Active release remains3,513
  products /349 current-retail /8,087 historical;0 publication/replacement issues.
- Production:22 intended public routes200;17 internal/encoded paths404;3 API GETs
  405 with `Allow: POST`. API writes/subscriptions were not sent during QA.
- 21 public sample bodies equal the pre-release production bytes; only the
  service-worker commit version differs. Preview additionally injects the known
  Vercel feedback script into homepage HTML; production does not.
- Desktop/mobile normal-ready-state searches:23 cavity and158 replacement matches
  for600×1900×650; displayed result text equals baseline. Fresh and service-worker-
  controlled reload flows both pass; deliberate source fetch remains404. No
  failed runtime assets or uncaught application errors. Apex controls remain308.

Full non-credential logs, inventories, HTTP JSON and screenshots are preserved in
the hotfix worktree's ignored `.superpowers/sdd/2026-09-14-publication-boundary-hotfix/verification/`.
The merged PR description carries the portable release proof; these local records
supplement it, not substitute for the canonical plan's progress table.

## Remaining boundaries and safe continuation

The repository is already public. This repairs deployment scope, not a proven
secret/customer-data leak. Old immutable deployments were not removed. Do not
automatically roll back to the known-exposed pre-fix artifact; recover using the
corrected packaging and unchanged runtime data, with the same acceptance checks.

No V3 PR was merged. Main's fix does not amend older V3 branches: keep their new
preview pushes held until they incorporate the reviewed boundary and pass its
artifact/affected release gates. Preserve all dirty G2a work while doing so.

Historical PR207 follow-up: sample buttons could race initial category loading;
`loadedCats` is checked before await and PRODUCTS appended afterward. A live early
click produced46/316 versus the normal23/158; no new packaging code participates
in that path. This was outside the publication-packaging fix.

## Subsequent resolution and V3 integration

The category-loading/search-intent race was separately fixed and production-
verified in [PR208](https://github.com/fitappliance/fitappliance/pull/208), merged
as `2315b30cf0309d0da23e2de8781362d30865f17a`. Its PR description and committed
[hotfix plan](../../superpowers/plans/2026-09-14-category-loading-hotfix.md) carry
the separate scope and validation. This does not imply unrelated UI issues are fixed.

Both merged fixes are now included in the G2a branch at integration `fbcc4e225`
(same tree as preserved local merge `d4d4244c1`).
Its45 affected tests passed with the V3 default-test entry preserved. The six
pre-existing dirty files were copied and byte-checked before merging. G2a code
`cf4a632a2` subsequently passed all6 checks in Draft PR209, the complete build and
15 protected-preview HTTP checks. The [canonical plan](../../superpowers/plans/2026-09-13-architecture-v3-evidence-foundation.md)
records that acceptance. Other old V3 branches are not updated by this integration.
Production remains on PR208, not on V3.
