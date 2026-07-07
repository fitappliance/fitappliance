# GSC URL Inspection Results After Sitemap Submission

Date: 2026-07-07

## Context

The `https://www.fitappliance.com.au/sitemap.xml` sitemap was submitted in the `https://www.fitappliance.com.au/` Google Search Console URL-prefix property.

GSC sitemap table state:

- `/sitemap.xml`: submitted 2026-07-07, last read 2026-07-07, status success, discovered pages 2,345.
- `/image-sitemap.xml`: submitted 2026-05-19, last read 2026-07-05, status success, discovered pages 476.

The GSC discovered-page count is not the same metric as the local generated sitemap URL count. Treat it as a Search Console discovery count, not as a direct build regression.

## Inspection Results

| URL | GSC index status | Notes |
| --- | --- | --- |
| `https://www.fitappliance.com.au/` | Indexed | Shows "URL is on Google"; page indexing is indexed; HTTPS passes. |
| `https://www.fitappliance.com.au/about/editorial-standards` | Indexed | Shows "URL is on Google"; page indexing is indexed; HTTPS passes. |
| `https://www.fitappliance.com.au/guides/appliance-fit-sizing-handbook` | Not indexed | Status is `Crawled - currently not indexed`. Last crawl was 2026-04-19 18:44:39 with Googlebot Smartphone. GSC still records the user-declared canonical as the old apex URL `https://fitappliance.com.au/guides/appliance-fit-sizing-handbook`; sitemap discovery includes both the main sitemap and image sitemap. |
| `https://www.fitappliance.com.au/products/artusi-adw5009x-dishwasher-adw1249` | Indexed with enhancement issue | URL is indexed, HTTPS passes, breadcrumb is valid. Product summary reports one critical issue: Product item should specify `offers`, `review`, or `aggregateRating`. The GSC product crawl snapshot is from 2026-05-23 23:01:24. Current production HTML has no Product JSON-LD for this page, so this appears to be stale structured-data evidence that should clear after recrawl. |
| `https://www.fitappliance.com.au/fit-check/electrolux-ewf1043r7wc-in-640mm-cavity` | Discovered, not indexed | Indexed snapshot status is `Discovered - currently not indexed`; no crawl has happened yet. Live URL test on 2026-07-07 20:41 says the URL can be indexed and page availability is indexable. |

## Interpretation

The canonical-host cleanup is working for current production, but GSC still contains pre-cleanup crawl evidence on older pages. The guide sample proves this directly: Google last crawled it before the `www` canonical cleanup and still records the apex canonical.

The fit-check sample is different. GSC has discovered the URL from the submitted sitemap but has not crawled it yet. The live test says the page is indexable, so the blocker is crawl scheduling, not a current robots/noindex/canonical defect.

The product sample is indexed. Its Product rich-result issue should not be fixed by adding fake offers or ratings. Current production no longer emits Product JSON-LD for this dimensions-only product page, so the right next action is recrawl validation rather than schema inflation.

## Next GSC Actions

Request indexing only after the live test passes:

- Safe to request indexing now: `https://www.fitappliance.com.au/fit-check/electrolux-ewf1043r7wc-in-640mm-cavity`.
- Run live test before requesting indexing: `https://www.fitappliance.com.au/guides/appliance-fit-sizing-handbook`.
- Run live test before requesting indexing: `https://www.fitappliance.com.au/products/artusi-adw5009x-dishwasher-adw1249`, mainly to refresh the stale Product summary snapshot.

Do not submit the apex sitemap again. Keep both properties available for historical comparison, but make `https://www.fitappliance.com.au/` the operational property for sitemap submission, URL inspection, and recrawl requests.
