# GSC Post-sitemap URL Inspection Queue

Date: 2026-07-07

## Context

The sitemap `https://www.fitappliance.com.au/sitemap.xml` has been submitted in Google Search Console after the canonical host cleanup.

Current production host signals:

- `https://fitappliance.com.au/` returns `308` to `https://www.fitappliance.com.au/`.
- `https://fitappliance.com.au/sitemap.xml` returns `308` to `https://www.fitappliance.com.au/sitemap.xml`.
- `https://www.fitappliance.com.au/sitemap.xml` returns `200`.
- `robots.txt` lists `https://www.fitappliance.com.au/sitemap.xml`.
- The submitted sitemap contains 1,960 URLs.

Local audit status after sitemap submission:

- `npm run audit-indexability-policy`: PASS, sitemap 1,960, sitemap violations 0, missing noindex 0.
- `npm run gsc-indexing-audit`: PASS, sitemap 1,960, product URLs 1,754.
- `npm run audit-geo-metadata`: 17 targets, blockers 0, warnings 0.

## URL Inspection Samples

Use these URLs in Search Console URL Inspection. Inspect them under the Domain property when possible, and cross-check the `https://www.fitappliance.com.au/` URL-prefix property for canonical debugging.

| Priority | URL | Page type | Live status | Expected canonical | Expected robots |
| --- | --- | --- | --- | --- | --- |
| 1 | `https://www.fitappliance.com.au/` | Homepage / tool entry | `200` | `https://www.fitappliance.com.au/` | indexable |
| 2 | `https://www.fitappliance.com.au/about/editorial-standards` | Trust page | `200` | `https://www.fitappliance.com.au/about/editorial-standards` | indexable |
| 3 | `https://www.fitappliance.com.au/guides/appliance-fit-sizing-handbook` | Core guide | `200` | `https://www.fitappliance.com.au/guides/appliance-fit-sizing-handbook` | indexable |
| 4 | `https://www.fitappliance.com.au/products/artusi-adw5009x-dishwasher-adw1249` | High-evidence product page | `200` | `https://www.fitappliance.com.au/products/artusi-adw5009x-dishwasher-adw1249` | indexable |
| 5 | `https://www.fitappliance.com.au/fit-check/electrolux-ewf1043r7wc-in-640mm-cavity` | Fit-check treatment page | `200` | `https://www.fitappliance.com.au/fit-check/electrolux-ewf1043r7wc-in-640mm-cavity` | indexable |

## Expected GSC Outcomes

For each inspected URL, the preferred live-test outcome is:

- Page fetch is successful.
- User-declared canonical equals the inspected `www` URL.
- Google-selected canonical is either the same URL or still pending recrawl.
- The page is not blocked by `robots.txt`.
- No `noindex` directive is detected.
- The page is in the submitted sitemap.

If Google still reports `Crawled - currently not indexed`, do not treat that as an immediate code defect while the live test passes. Record the sample and wait for the next crawl cycle unless the issue shows a concrete blocker such as redirect, blocked by robots, noindex, duplicate without selected canonical, soft 404, or discovered but not crawled across multiple high-priority samples.

## Operating Rule

Do not restart broad validation based only on aggregate non-indexed counts. Use URL Inspection on the five samples above first, then expand only if the same concrete issue appears on multiple indexable `www` URLs.
