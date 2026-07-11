# Architecture V2 Production Cutover Baseline

Status: observation window active; legacy deletion requires owner confirmation
Cutover verified: 2026-07-11T07:08:50Z

## Release identity

- Production code: `89bdddfbdbd82f74424b90a509b57592bdb9c1a4`
- Catalog cutover commit: `4ce584a8`
- Deploy-input fix: `fe1a8ee3`
- RUM/CSP fixes: `c867e68d`, `89bdddfb`
- Vercel production deployment:
  `https://fitappliance-lreo7gk82-fitappliances-projects.vercel.app`
- Canonical host: `https://www.fitappliance.com.au`

## Production data baseline

- Active projection marker: `v2`
- Runtime products: 2,259
- Runtime products with canonical ID: 2,259
- Canonical registry products: 3,593
- Canonical registry quarantine rows: 10
- Evidence-page view: 3,534 products
- Generated evidence-backed product pages: 1,753
- Sitemap URLs: 1,960
- Runtime quarantine: nine legacy products

The removed WHE6874BA evidence page permanently redirects to the Westinghouse
fridge page. It was not retained because its attached source failed exact-model
evidence checks and its identity collides with a quarantined runtime row.

## Verification evidence

- Architecture tests: 98 passed, 0 failed.
- Full repository tests: 1,564 passed, 0 failed before the final cache-bust-only
  change; the focused RUM suite then passed 12/12.
- Schema validation: 2,347 pages, 7,190 blocks, 0 errors.
- Legacy/V2 width parity: 18,144 comparisons, 0 mismatches.
- Desktop production search: 600x1900x650 fridge search returned result cards.
- Production zero-result path: 300x300x300 showed an actionable
  `Nothing fits those dimensions` state.
- Mobile production search: 390x844 viewport returned result cards with no
  horizontal overflow.
- Production browser console: 0 errors after the self-hosted Web Vitals deploy.
- Browser artifacts: `fitappliance-v2-desktop-results.png` and
  `fitappliance-v2-mobile-results.png` in the Playwright task output.

## Rollback

The immutable rollback source is
`data/architecture-v2/legacy-public-catalog.json`, SHA-256:
`52de8580c71d18be4206d328db950e902bc7ff92c2bc497c33ba985ef50c5349`.

Set `FITAPPLIANCE_CATALOG_PROJECTION=legacy` and redeploy, or revert the
cutover commits. Do not delete or regenerate the immutable rollback source
during the observation window.

## Phase 7 exit gate

Legacy runtime deletion is not authorised by this cutover. It requires a
separate owner confirmation after observing production for indexing, search,
runtime-error, and data-integrity regressions. Until then, the rollback source
and projection selector remain supported production assets.

## Observation log

### 2026-07-11 - Observation 1

- Latest production deployment remained Ready.
- IndexNow post-deploy workflow completed successfully.
- Uptime check: 30 URLs checked, 0 failures.
- Broken-link check: 28,881 links checked, 0 broken links.
- Link graph: 2,347 pages and 24,556 edges.
- The initial Sentinel run identified `/subscribe/thanks` as an orphan. The
  page is an intentional form-confirmation destination with `noindex, follow`,
  so adding it to public navigation would have been incorrect.
- The link-graph audit now records every page's indexability and applies the
  orphan failure gate only to indexable pages. Focused tests passed 13/13.
- Final complete Sentinel result: 0 uptime failures, 0 broken links and 0
  indexable orphan pages.
- The missing GitHub `sentinel-auto` label was created so future failures can
  open an issue instead of failing during notification.
- GitHub Actions Sentinel run `29144112503` passed all production checks from a
  clean CI checkout.
