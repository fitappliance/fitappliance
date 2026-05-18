# GSC Indexing Readiness Audit

Generated: 2026-05-18T15:28:21.435Z

## Summary

- Sitemap URLs: 2380
- Product URLs: 1562
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
