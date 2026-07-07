# Canonical Host Follow-up

Date: 2026-07-07

## Problem

Search Console has separate properties for `fitappliance.com.au` and `www.fitappliance.com.au`. The site had already selected `https://www.fitappliance.com.au` in canonical tags, sitemap URLs, hreflang, and IndexNow payloads, but the apex host was still returning Vercel's default temporary redirect:

- `https://fitappliance.com.au/` -> `307` -> `https://www.fitappliance.com.au/`
- `https://fitappliance.com.au/sitemap.xml` -> `307` -> `https://www.fitappliance.com.au/sitemap.xml`

That made Search Console property totals look more divergent and gave Google a weaker host-consolidation signal than a permanent redirect.

## Changes

- `c96d7e58` added a repository guardrail redirect from apex to `www`, moved guide Article JSON-LD URLs to `https://www.fitappliance.com.au`, and added regression coverage.
- `e6ccc801` documented that the active redirect is controlled by the Vercel project-domain setting.
- The Vercel project-domain config for `fitappliance.com.au` now has:
  - `redirect`: `www.fitappliance.com.au`
  - `redirectStatusCode`: `308`

## Production Verification

Verified after deployment:

```text
https://fitappliance.com.au/            -> 308 https://www.fitappliance.com.au/
https://fitappliance.com.au/sitemap.xml -> 308 https://www.fitappliance.com.au/sitemap.xml
https://www.fitappliance.com.au/sitemap.xml -> 200
```

Current production sitemap and robots signals:

- `robots.txt` lists `https://www.fitappliance.com.au/sitemap.xml`.
- `sitemap.xml` contains 1,960 URLs.
- Sitemap URL hosts are `https://www.fitappliance.com.au`.
- Homepage canonical, hreflang, WebSite, SoftwareApplication, Organization, and HowTo JSON-LD use `https://www.fitappliance.com.au`.
- Guide Article JSON-LD now uses `https://www.fitappliance.com.au` for `url`, `image`, publisher `url`, and publisher logo URL.

## Validation

Commands run:

```bash
npm test
npm run lint
npm run build
npm run audit-indexability-policy
npm run gsc-indexing-audit
npm run audit-geo-metadata
```

Results:

- `npm test`: 1,519 passing.
- `npm run lint`: passing.
- `npm run build`: passing; sitemap generated with 1,960 URLs.
- `audit-indexability-policy`: PASS, sitemap violations 0, missing noindex 0.
- `gsc-indexing-audit`: PASS, sitemap 1,960, product URLs 1,754.
- `audit-geo-metadata`: 17 targets, blockers 0, warnings 0.

## IndexNow

Changed guide pages were submitted after the host/canonical cleanup:

- `/guides/appliance-fit-sizing-handbook`
- `/guides/dishwasher-cavity-sizing`
- `/guides/dryer-ventilation-guide`
- `/guides/fridge-clearance-requirements`
- `/guides/washing-machine-doorway-access`

Evidence file: `reports/indexnow-canonical-host-2026-07-07.json`

Response summary:

- IndexNow API: HTTP 200 for 5 URLs.
- Bing: HTTP 200 for 5 URLs.

## GSC Operating Steps

Use `sc-domain:fitappliance.com.au` as the main reporting property. Keep the `https://www.fitappliance.com.au/` URL-prefix property for canonical URL debugging. Keep the non-www URL-prefix property only for redirect cleanup and old URL samples.

Submit `https://www.fitappliance.com.au/sitemap.xml` in both the Domain property and the `www` URL-prefix property.

For URL Inspection, prioritize:

- `https://www.fitappliance.com.au/`
- `https://www.fitappliance.com.au/about/editorial-standards`
- `https://www.fitappliance.com.au/guides/appliance-fit-sizing-handbook`
- one high-evidence product URL from `/products/`
- one current fit-check URL from `/fit-check/`

Expected Search Console interpretation:

- Non-www URLs should increasingly fall under redirect or alternate/canonical buckets.
- Indexed and submitted canonical URLs should accumulate under `www` and the Domain property.
- Do not compare non-www and `www` URL-prefix totals as if they should match; they are different reporting scopes.
