# GSC Offer Schema + Duplicate/Canonical Cleanup

Generated: 2026-05-26

## Product Offer Schema

- Product JSON-LD now emits `Offer` only when a retailer product-page URL and a captured numeric price are present.
- Multiple priced retailer links emit `AggregateOffer` with `lowPrice`, `highPrice`, and nested retailer `Offer` rows.
- Products with retailer links but no captured price intentionally do **not** emit `offers`; this avoids inventing price data purely for rich results.

## GSC Buckets Reviewed

### Alternate page with proper canonical tag

Status in GSC: 258 affected pages, validation failed.

Sample URLs were query-state result pages such as:

- `https://www.fitappliance.com.au/?cat=fridge&brand=Haier`
- `https://www.fitappliance.com.au/?cat=dishwasher&w=450&h=850&d=600`
- `https://www.fitappliance.com.au/?cat=fridge&w=900&h=1800&d=700&door=810`
- `https://www.fitappliance.com.au/?cat=dishwasher&intent=compare&brand=Fisher%20%26%20Paykel&vs=Omega`

Live verification: sampled URLs return `200` and declare canonical `https://www.fitappliance.com.au/`.

Decision: this bucket is not a product-page schema failure. It is caused by crawlable interactive search-state URLs.

### Duplicate without user-selected canonical

Status in GSC: 233 affected pages, validation started.

Sample URLs:

- `https://www.fitappliance.com.au/?cat=washing_machine&brand=LG&compare=LG-vs-Hisense&vs=Hisense`
- `https://www.fitappliance.com.au/?cat=fridge&brand=MIELE`
- `https://www.fitappliance.com.au/?cat=fridge&brand=Imprasio`
- `https://www.fitappliance.com.au/?cat=dishwasher&brand=MIELE&h=845`
- `https://www.fitappliance.com.au/?cat=dishwasher&brand=BEKO&h=850`
- `https://www.fitappliance.com.au/?cat=dishwasher&brand=KLEENMAID`

Live verification: sampled URLs return `200` and declare canonical `https://www.fitappliance.com.au/`.

## Cleanup Applied

- Replaced crawlable static links to `/?cat=...&brand=...` with clean brand/compare URLs where an equivalent canonical page exists.
- Replaced static "run fit checker" query URLs with buttons that preserve user navigation but are no longer crawlable anchors.
- Left the main interactive app behavior intact; users can still land on query-state URLs when shared or clicked from the app.

## Expected GSC Effect

- New crawls should find fewer internal links pointing at query-state duplicates.
- Existing `Alternate page with proper canonical tag` rows may remain until Google recrawls them; this is expected lag, not necessarily a new defect.
- Product snippets should improve only for product pages with real captured prices, because `Offer` is now emitted from actual retailer price data.
