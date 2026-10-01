# G4b and separate trust-display release verification

Date: 2026-09-30. This coordinator record closes the documented release-pending gates; it does not rewrite historical reviewer reports or extend their evidence authority.

## Exact reviewed and production identities

| Release | Reviewed final PR head | Merge / verified production commit | READY production deployment |
| --- | --- | --- | --- |
| [PR215](https://github.com/fitappliance/fitappliance/pull/215), G4b + approved D-1 option1 | `f6401a7ea8279907e2c22268f2e3cbf440ee8658` | `56852cdd5316d06120b65f0d6509657d4a1d6619` | `dpl_85EQ7n4sigPX64fKGzmV97fBwxtj` |
| [PR216](https://github.com/fitappliance/fitappliance/pull/216), separate trust display | `2090a4abb57e345237da3326e67a5ed8c8950a5c` | `8b87ecbcfe5bb7672b42f84a35f02d20ad88a203` | `dpl_EBrBybamRsH3D5orvzKRpNsJmsKd` |

Each merged tree was compared to its reviewed final head with no differences. The current production alias `www.fitappliance.com.au` was verified against the second deployment and commit. G4b identities reviewed at `56228b996` are unchanged in both released trees. [Independent acceptance v5](G4b-independent-acceptance-v5.md) covers core code/design and original captured R3-1 replay; the [video unblock](G4b-video-release-review.md) and PR216 source/generated outputs received separate independent review. No self-certification replaces those reviews.

## Gates and absence accounting

| Gate | PR215 | PR216 |
| --- | --- | --- |
| Exact-head Node20 PR Validation | [run 36738429924](https://github.com/fitappliance/fitappliance/actions/runs/36738429924), SUCCESS | [run 36742104525](https://github.com/fitappliance/fitappliance/actions/runs/36742104525), SUCCESS |
| Remote full tests | 3328 total; 3324 pass, 0 fail, 4 explicit skips | 3340 total; 3336 pass, 0 fail, same 4 skips |
| Mounted local full tests | 3328/3328 pass, 0 skips | 3340/3340 pass, 0 skips |
| Focused tests | 64/64 pass; original captured failure and valid controls independently reproduced | 82/82 pass; final 100 comparison outputs separately reviewed, comparison tests 5/5 pass |
| Lint / schema | Pass; 2330 pages, 6145 blocks, 0 errors | Pass; 2330 pages, 5842 blocks, 0 errors |
| Required downstream CI | Canonical build, publication boundary, diff formatting, sitemap, review content and committed-generated-output checks all pass | Same, all pass |
| Other reported checks | Documentation audit, portability, copy lint, Vercel and Preview Comments all pass | Same, all pass |
| Exact-head preview / production smoke | 18/18 each | 18/18 each |

The four remote skips are original-store-dependent BDF paragraph replay, BDF direct-Claim rejection, genuine standalone-installation receipt replay, and original-object PDF/page/crop substitution. The bounded original evidence store is unavailable on GitHub; all four executed and passed locally with it mounted. No test, freshness threshold or gate was waived. Earlier missing local `fflate` was repaired by a clean locked dependency installation; expired video records were genuinely revalidated, not date-bumped without validation.

Both production builds logged the actual producer-resolved Cheerio/parse5 25-package closure, source/code and lock identity checks at both declared build entry points. Public artifact smoke compared selected data/JS/HTML/schema to the reviewed build and checked seven private module/plan/policy paths return 404. Only the intentional Service Worker cache token varied with the exact deployment commit; all remaining bytes matched.

Mac Google Chrome with an isolated test profile actually clicked the standard 600×1900×650 fridge example: 23 results, EBF91B unknown energy/stars no longer rendered as zero, and the installation-evidence caveat remained. The product price is labeled historical and has no unsupported Offer. With no eligible Offer/review/rating, the existing eligibility predicate omits its Product block; BreadcrumbList and FAQPage remain. Product rich-result eligibility can be reduced until supported price observations exist.

## EBF91B date provenance — no freshness upgrade

The price authority is `data/architecture-v2/observations/retailer-observations.json`, observation `obs_784e7c10147317ecc335ebc4`: `priceAud: 289`, `observedAt: 2026-07-20T17:36:17.000Z`, source type `public_retailer_api`, raw source SHA-256 `b005f1b788e6273694339f3614237e5bc6fa626240445b32e0309a61e67484f1`. This is a recorded price observation, not merely a newly checked link or a new release-time fetch.

`src/domain/retail-lifecycle-shadow.mjs` projects that observation into the matching retailer row: `p = observation.priceAud`, `verified_at = observation.observedAt.slice(0, 10)`, and `observation_id = observation.id`. The EBF91B projection in `public/data/appliances.json` / `public/data/fridges.json` therefore carries July20. The homepage's “Retailer link checked” label uses this projected retailer date; the label does not replace the underlying recorded price observation.

May9 belongs to the separate `evidence.verified_at: 2026-05-09` dimension/PDF evidence, whose verified fields are dimensions and whose installation clearance remains unverified. A prior May9 report must not be cited as the authoritative price date. Both timestamps, the observation ID, $289 and source hash were compared at pre-release baseline `7b0764b0c`, PR215 merge `56852cdd5` and PR216 merge `8b87ecbcf`: unchanged. PR216 reads the retailer observation date, does not copy the PDF date or generate a new date. The price is still stale on September30 and explicitly displayed as “Observed $289 on 2026-07-20; check current price”; no current quote/stock is asserted. No evidence of a release date-upgrade regression was found.

## Scope remaining

G4b module/code release is complete. No new real G4b Claim receipt, reviewed admission, public right or Verified Fit outcome is created. G5/G6, real receipt replay/reissue, whole-inventory repair and official exact-model source coverage remain pending. The original replay capture is an audit diagnostic, not a real production receipt.

D-1 option1 guarantees identity at declared build/release gates; stored receipt replay uses the current parser and rejects failed proof. It does not prove arbitrary historical runtime parser identity, and unsupported direct-script/prebuilt bypasses are outside that guarantee. No scraping, production data refresh or future-stage implementation was added.

Task logs, release identity JSON, HTTP/browser smoke JSON and screenshots are retained on UGREEN under the existing dated review workspace. The old dirty main and G4b worktrees were preserved. This documentation reconciliation is a local-only change and does not trigger deployment.
