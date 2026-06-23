# GSC Indexing Readiness Audit

Generated: 2026-06-23T05:50:40.461Z

## Summary

- Sitemap URLs: 2573
- Product URLs: 1754
- Missing route files: 0
- Pages with noindex: 0
- Canonical mismatches: 0
- Missing canonical tags: 0
- Status: PASS

## Blocking Issues

### Missing Files

- None

### Noindex Directives

- None

### Canonical Mismatches

- None

### Missing Canonicals

- None

## GSC Operating Notes

- The current sitemap is technically ready for resubmission when this report is PASS.
- A `Not indexed` count in Search Console is not automatically a code defect. Google often leaves new programmatic URLs in "Discovered" or "Crawled" states until it allocates crawl and indexing budget.
- Highest-priority manual inspections should be: homepage, `/products`, one high-value product URL, one `/fit-check/` URL, and one `/compare/` URL.
- After deployment, submit `https://www.fitappliance.com.au/sitemap.xml` again and use URL Inspection on 3-5 representative URLs to request indexing.
- If GSC reports duplicate/canonical reasons, inspect the listed sample URLs against this report before changing generation logic.

## Current GSC Reason Triage

These rows were inspected from the live Search Console `https://www.fitappliance.com.au/` URL-prefix property on 2026-06-23.

- Current GSC overview: `2,472 indexed` and `1,165 not indexed` pages. This report still shows `PASS` locally because every sitemap URL resolves to a generated file with a self-canonical URL and no `noindex`.
- `Page with redirect`: 492 URLs. Treat as expected only for non-canonical URL variants; if exported samples include `https://www.fitappliance.com.au/` URLs, add precise redirect/canonical fixes from those samples.
- `Alternate page with proper canonical tag`: 282 URLs. This is acceptable for duplicate query/canonical variants, but sample exports should be checked before changing generation logic.
- `Not found (404)`: 36 URLs. This is the highest-priority actionable bucket; export samples from GSC before adding redirects so legacy paths are mapped exactly instead of guessed.
- `Crawled - currently not indexed`: 54 URLs and `Discovered - currently not indexed`: 292 URLs. These need post-deploy URL Inspection requests for high-value page patterns after schema fixes are live.
- `Duplicate without user-selected canonical`: 234 URLs, validation started. Keep monitoring; code changes should be based on exported affected URL patterns, not the aggregate count.
- Shopping signal on 2026-06-23: Product snippets showed `0 valid / 20 invalid` on overview and detail report had 6 invalid examples for `Either "offers", "review", or "aggregateRating" should be specified`. Product page generation now omits Product JSON-LD unless a real rich-result qualifier is present.
