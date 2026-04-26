# Claims Audit

_Created 2026-04-26 for Phase 47 claims cleanup._

## Scope

Searched these claim-risk terms across user-facing copy, generated pages, generator templates, and project docs:

`VEU`, `ESS`, `rebate`, `verified`, `certified`, `guaranteed`, `always`, `every`, `GEMS`, `weekly`, `daily`, `real-time`, `live data`.

The audit goal is conservative: keep claims that are directly supported by current product behaviour, soften claims that are plausible but not operationally guaranteed, and remove claims that the live tool cannot currently deliver.

## Summary

| Classification | Count | Meaning |
|---|---:|---|
| Red | 9 | False, unsupported, or too risky for ACCC/AdSense without a working feature or stronger evidence |
| Yellow | 13 | Verifiable in principle, but currently too broad or operationally unproven |
| Green | 11 | Supported by current code, data, docs, or intentionally internal process notes |

## Red: unsupported or false claims

| Location | Claim | Evidence / counter-evidence | Disposition |
|---|---|---|---|
| `index.html` topbar | `State rebates` | The homepage has legacy static rebate copy, but the current product positioning is not a rebate calculator and the claim is not central to the fit tool. | Remove. |
| `index.html` trust strip | `VEU & ESS rebates calculated` | Current public promise implies live eligibility calculation. Rebate data is not maintained as a reliable live policy engine. | Remove. |
| `index.html` sidebar | `Government Rebates` panel and state rebate prompt | The UI invites postcode rebate decisions that can become stale and policy-sensitive. | Remove visible panel. |
| `index.html` how-it-works | `applicable government rebates side by side` | Same issue as above; not core fit-tool behaviour. | Replace with price and energy-cost comparison only. |
| `index.html` structured data | `Government rebate eligibility checker` | Structured data advertises a feature we should not claim for AdSense/ACL. | Remove from `featureList`. |
| `index.html` FAQ JSON-LD | `What government rebates are available... VEU/ESS` | Gives specific program amounts/eligibility without a maintained policy source. | Remove the FAQ entry. |
| `README.md` SEO route notes | `veu rebate fridge victoria 2026` and `/victorian-energy-upgrades-fridge-rebate` | Historical growth notes point to a route/claim we are no longer pursuing in this phase. | Reframe as rejected/deferred keyword idea. |
| `docs/reddit-launch.md` | `Calculates VIC/NSW rebates` | Promotional draft overstates the live tool. | Replace with energy-cost and clearance copy. |
| `pages/privacy-policy.html` | `postcode ... calculate applicable government rebates` | The page describes a sensitive feature after the visible claim is being removed. | Update privacy copy to generic local fit preferences if postcode remains unused. |

## Yellow: verifiable but currently too broad

| Location | Claim | Evidence / uncertainty | Disposition |
|---|---|---|---|
| `index.html` topbar | `ACCC-compliant` | Affiliate disclosure exists, but legal compliance is a legal conclusion. | Replace with `Affiliate disclosure`. |
| `index.html` trust strip | `ACCC-compliant disclosures` | Same legal conclusion risk. | Replace with `Clear affiliate disclosure`. |
| `index.html` trust strip / data source | `GEMS-verified energy ratings` | Data comes from Energy Rating Australia/GEMS-aligned source, but "verified" implies endorsement or real-time certification. | Use `Energy star ratings` or `Energy Rating source data`. |
| `index.html` data source | `Prices ... updated weekly` | Backfill/sync workflows exist, but not all retailer prices are guaranteed weekly for every product. | Use `retailer feed data where available`. |
| `index.html` saved tip | `We update prices weekly` | Same operational guarantee issue. | Use `Price availability can change`. |
| `DEVGUIDE.md` overview | `refreshed weekly via a fully automated pipeline` | Some workflows are scheduled, but not every public data area has guaranteed weekly refresh. | Narrow to specific feeds/workflows. |
| `README.md` project status | `verified AU retailer data` | Retailer data is present for 609 products, but "verified" needs a documented verification process. | Use `AU retailer data`. |
| `scripts/generate-brand-pages.js` FAQ | `Insufficient clearance can void your warranty... premature motor failure` | Plausible, but absolute warranty/technical consequence wording is too strong for all brands. | Soften to `may affect warranty/support and appliance performance`. |
| `scripts/generate-brand-pages.js` FAQ | `${brand} service technicians inspect clearances during any warranty claim` | Over-specific and likely not supportable for every brand. | Remove. |
| `pages/affiliate-disclosure.html` | `Sponsored products still meet your dimensional requirements` | Depends on ad/sponsored implementation state. | Leave for now if sponsored system still enforces fit; otherwise revisit in a separate ad-placement audit. |
| `scripts/generate-doorway-pages.js` | `always confirm` | Safety advice, but `always` is absolute. | Acceptable as cautionary guidance, or soften to `confirm`. |
| `README.md` GEMS API notes | `verified appliance energy ratings` | Internal future/integration notes rather than public hero copy. | Keep only as implementation note, avoid using in marketing copy. |
| `docs/promotion-kit.md` | `important for warranty` | Promotional draft overstates warranty implication. | Soften when promotion kit is regenerated. |

## Green: supported or internal process claims

| Location | Claim | Evidence | Disposition |
|---|---|---|---|
| Homepage hero | `brand-specific airflow, door-swing and access checks` | Clearance rules, inferred door swing, and doorway fields exist. | Keep. |
| Homepage trust strip | `Brand-specific clearance rules` | Clearance data and generator pages use per-brand rules. | Keep. |
| Homepage trust strip | `Doorway delivery check` | Advanced doorway field and doorway pages exist. | Keep. |
| Homepage / structured data | `Energy star rating filter` | Search UI supports star/facet filtering and data includes stars. | Keep with neutral wording. |
| `README.md` project status | `~2170 products across 4 categories` | Public data contains the catalog. | Keep. |
| `README.md` workflow notes | `weekly` / `daily` workflow schedules | These refer to named GitHub Actions schedules, not user-facing product guarantees. | Keep as internal docs. |
| `DEVGUIDE.md` GEMS source note | `Energy Rating Australia (GEMS) active register` | Source integration exists in `scripts/sources/energyrating.js`. | Keep, but do not market as "GEMS-verified". |
| `pages/methodology.html` | `Brand organization metadata ... only when verified links exist` | Refers to metadata curation, not a broad product claim. | Keep. |
| `docs/date-sources-audit.md` | `Generation must be verified` | Internal engineering process. | Keep. |
| `scripts/generate-sitemap.js` | `changefreq: weekly` | Sitemap hints are crawl preferences, not promises to users. | Keep. |
| `scripts/validate-videos.js` / Phase 41 docs | `oEmbed validated` | Validation tool exists for video allow-list workflow. | Keep. |

## Follow-up

- Re-run this audit whenever adding public trust badges, structured-data feature lists, or promotional drafts.
- Prefer tool-centric, observable claims: fit checks, clearance math, doorway access, energy star ratings, retailer links where available.
- Avoid legal conclusions (`ACCC-compliant`), eligibility claims (`rebates calculated`), and update frequency guarantees (`updated weekly`) unless a maintained mechanism and test coverage exist.
