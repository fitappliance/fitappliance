# GSC Indexing Readiness Audit

Generated: 2026-05-18T16:38:40.898Z

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

## Current GSC Reason Triage

These rows were inspected from the live Search Console `https://fitappliance.com.au/` URL-prefix property on 2026-05-19.

- `Page with redirect` currently points at non-www URLs such as `https://fitappliance.com.au/cavity/500mm-fridge`. This is expected because production canonical URLs use `https://www.fitappliance.com.au`; track indexing in the `https://www.fitappliance.com.au/` URL-prefix property or a domain property.
- `Redirect error` examples now resolve live via non-www to www and then HTTP 200. Use Search Console's Validate Fix action after deployment.
- `Not found (404)` examples are legacy URLs and must be kept behind durable redirects: `/compare/euro-vs-robinhood-dryer-clearance`, `/compare/smeg-vs-miele-dishwasher-clearance`, and `/location/canberra`.
- `Crawled - currently not indexed` examples are live HTTP 200 pages: `/guides/appliance-fit-sizing-handbook`, `/brands/hisense-fridge-clearance`, and `/brands/altus-washing-machine-clearance`. Use URL Inspection request-indexing for these after confirming canonical and schema are valid.
