# GSC Growth Audit - 2026-06-23

## Snapshot

- Property inspected: `https://www.fitappliance.com.au/`
- Performance: 306 clicks, 22.2K impressions, 1.4% CTR, average position 10.0 over the visible 3-month window.
- Indexing overview: 2,472 indexed pages and 1,165 not indexed pages.
- Product snippets overview: 0 valid and 20 invalid.
- Product snippets detail: 6 invalid examples for `Either "offers", "review", or "aggregateRating" should be specified`.
- Videos enhancement: 2 valid and 0 invalid. The prior `Missing field "uploadDate"` issue is now passed.
- Breadcrumbs: 7 valid and 0 invalid.
- FAQ: 11 valid and 0 invalid.

## Fix Applied

GSC's current Product snippets issue was valid: product pages emitted `Product` JSON-LD even when the product had no `offers`, `review`, or `aggregateRating` qualifier.

The generator now gates Product JSON-LD behind a real rich-result qualifier:

- Pages with priced retailer offers keep `Product` JSON-LD and `Offer` schema.
- Pages without priced offers keep Breadcrumb and FAQ JSON-LD, but no longer emit ineligible `Product` JSON-LD.
- This avoids feeding Google Merchant/Product snippets pages that cannot qualify for Product rich results.

Local generated-page audit after regeneration:

- Product HTML pages scanned: 1,754.
- Product JSON-LD blocks emitted: 1,308.
- Product JSON-LD blocks missing `offers`, `review`, or `aggregateRating`: 0.

## Indexing Buckets

- `Page with redirect`: 492. Expected for non-canonical variants only; export samples before adding any new redirect rules.
- `Alternate page with proper canonical tag`: 282. Usually acceptable for duplicate variants; sample review required before code changes.
- `Not found (404)`: 36. Highest-priority actionable bucket after Product snippets validation. Export GSC examples and map exact legacy redirects.
- `Crawled - currently not indexed`: 54. Use URL Inspection on high-value pages after this schema fix is deployed.
- `Discovered - currently not indexed`: 292. This is crawl-budget and freshness dependent; request indexing for the strongest page templates first.
- `Duplicate without user-selected canonical`: 234. Validation is started; keep waiting unless exported examples show a current canonical defect.

## CTR Opportunities

Queries visible in GSC indicate that dimension and comparison intent is working, but titles can be tightened further after this schema fix settles:

- `fridge 600mm wide`: 0 clicks / 67 impressions.
- `600mm fridge`: 0 clicks / 52 impressions.
- `kleenmaid washing machine`: 0 clicks / 44 impressions.
- `hisense 223l top mount refrigerator`: 0 clicks / 40 impressions.
- `lg vs fisher and paykel washing machine`: 1 click / 18 impressions.

High-value page patterns visible in GSC:

- `/cavity/600mm-fridge`
- `/compare/fisher-paykel-vs-lg-washing-machine`
- `/compare/lg-vs-westinghouse-washing-machine`
- `/?cat=dishwasher&w=600&h=820&d=550`

## Post-Deploy GSC Actions

1. Open Product snippets and run `Validate fix` for `Either "offers", "review", or "aggregateRating" should be specified`.
2. Inspect one priced product URL and confirm Product rich result eligibility.
3. Inspect one unpriced product URL and confirm it no longer emits Product snippets eligibility.
4. Request indexing for `/cavity/600mm-fridge`, `/compare/fisher-paykel-vs-lg-washing-machine`, and one high-value priced product URL.
5. Export samples from the 36-url `Not found (404)` bucket before adding redirects.

## Expected Timeline

- Product snippets issue count: should begin dropping after Google recrawls affected product pages, usually 3-7 days after validation starts.
- Indexing buckets: expect slower movement, typically 7-14 days. Do not change canonical logic from aggregate GSC counts alone; use exported affected URLs.
