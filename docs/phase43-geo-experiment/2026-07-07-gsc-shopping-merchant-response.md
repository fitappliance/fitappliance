# GSC Shopping / Merchant Response

Date: 2026-07-07

## GSC Signal

The `https://www.fitappliance.com.au/` Search Console property shows a merchant optimization notice dated 2026-07-03:

> Your products are not shown on the Google Search Shopping tab.

Current overview snapshot:

- Search clicks: 471.
- Indexed pages: 2,185.
- Not indexed pages: 1,546.
- Product snippets: 0 valid, 0 invalid.
- Merchant listings: 0 valid, 0 invalid.
- Breadcrumbs: 14 valid, 0 invalid.
- Video enhancements: 2 valid, 0 invalid.

## Local Product Markup State

Local generated product pages are not empty from a structured-data perspective:

- Product HTML pages: 1,754.
- Pages with `Product` JSON-LD: 1,308.
- Pages with single `Offer`: 1,246.
- Pages with `AggregateOffer`: 62.
- Pages with `BreadcrumbList`: 1,754.
- Pages with `FAQPage`: 1,754.

Catalog price coverage:

- Catalog products: 3,541.
- PDF-evidence products: 1,754.
- Products with retailer URLs: 1,400.
- Products with retailer price data: 1,309.

The current generator intentionally emits `Product` JSON-LD only when a real rich-result qualifier exists. Dimensions-only product pages keep `BreadcrumbList` and `FAQPage`, but avoid `Product` JSON-LD. This prevents the earlier GSC error where Product items lacked `offers`, `review`, or `aggregateRating`.

## Interpretation

This is not the same class of issue as ordinary page indexing. The GSC notice is about Shopping / Merchant Center visibility, not whether FitAppliance pages can appear in organic Search.

Google's public guidance separates:

- Product snippets: product pages where users cannot directly purchase the product.
- Merchant listings / free listings: product pages for products the site sells, with product data, shipping, and return information.

FitAppliance is currently an appliance fit and affiliate utility, not a direct checkout retailer. That matters because enabling Shopping visibility without a clear merchant model risks creating a mismatch between page purpose, offer data, shipping/returns, and buyer expectations.

## Recommendation

Do not click the GSC "Start" / Shopping onboarding button as an automatic SEO fix.

Keep the current conservative schema posture:

- Keep Product JSON-LD only on evidence-backed product pages with real priced retailer offers.
- Do not add fake reviews, fake aggregate ratings, placeholder offers, or sitewide Product schema.
- Do not add Product schema to fit-check, guide, compare, or brand pages.
- Let the recrawl requests submitted on 2026-07-07 refresh stale GSC Product summary evidence first.

## Partnerize / The Good Guys Evidence

The Good Guys Australia Partnerize campaign is active for FitAppliance and has real commercial terms:

- Cookie period: 7 days.
- Core FitAppliance appliance categories shown in the campaign rates are generally 3% CPA: white goods, fridges and freezers, laundry, cooking and dishwashers.
- Excluded brands include Apple, Playstation 5, Xbox, Nintendo, Asko, Miele, and Loewe.
- Excluded product/transaction cases include gift cards, service extras, home services, some "Shipped by Supplier" Fisher & Paykel and Smeg products, physical store transactions, phone sales, Pay Less Chat, commercial site orders, marketplace orders, and coupon codes intended for another affiliate.

This supports the current affiliate catalog model, but it still does not make FitAppliance the merchant of record. Partnerize feed rows can provide price, availability, and affiliate-link evidence for Product/Offer markup, but they should not be treated as proof that FitAppliance itself sells, ships, or accepts returns for the product.

Implementation guardrail: `scripts/affiliate/partnerize-tgg.js` stores the TGG campaign terms as code constants. Future TGG imports preserve excluded-brand product links for user utility, but mark them as zero-commission instead of counting them as commission-eligible or Merchant/Shopping proof.

If Shopping/free listings becomes a business goal, treat it as a separate Merchant Center project with explicit owner approval:

- Decide whether FitAppliance is legally and operationally a merchant, affiliate catalog, or comparison/referral site.
- Confirm whether product offers should point to FitAppliance URLs or retailer URLs.
- Add durable shipping and returns policy pages that match the actual transaction model.
- Audit price freshness and availability freshness before exposing merchant listings at scale.
- Add stronger product identifiers where available: GTIN when known, otherwise MPN plus brand.
- Run a Merchant Center pilot with a small priced product subset before enabling broad automatic product discovery.

## Next Check

Wait for GSC to recrawl the three URLs submitted on 2026-07-07:

- `/fit-check/electrolux-ewf1043r7wc-in-640mm-cavity`
- `/guides/appliance-fit-sizing-handbook`
- `/products/artusi-adw5009x-dishwasher-adw1249`

After the next crawl, re-check:

- Whether Product snippets still show 0/0.
- Whether the stale invalid Product summary issue remains.
- Whether Merchant listings remain 0/0 despite the 1,308 current Product JSON-LD pages.

Only then decide whether the next change belongs in schema generation, Merchant Center onboarding, or GSC recrawl operations.

## References

- Google Search Central: Product structured data introduction: https://developers.google.com/search/docs/appearance/structured-data/product
- Google Merchant Center Help: Free listings for products: https://support.google.com/merchants/answer/13889434
- Google Merchant Center Help: Upload products to Merchant Center: https://support.google.com/merchants/answer/11586438
