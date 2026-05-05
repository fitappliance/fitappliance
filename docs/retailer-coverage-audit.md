# Retailer Coverage Audit

Status: 2026-05-05

This audit explains why some searches still show few or no verified retailer links even after the semi-manual retailer data work.

## Summary

The issue is not that the result cards are hiding retailer links. The current verified-link pool is still small, especially outside fridges.

Manual retailer data has been approved for 66 catalog products. After enrichment, the public catalog exposes verified retailer links for 66 products across 2,188 total products.

## Current Verified Coverage

| Category | Total products | Products with verified links | Coverage | Retailer mix |
| --- | ---: | ---: | ---: | --- |
| Fridge | 1,325 | 36 | 2.7% | JB Hi-Fi 34, Appliances Online 36, The Good Guys 15, Harvey Norman 13, Bing Lee 10 |
| Dishwasher | 359 | 12 | 3.3% | Appliances Online 12 |
| Dryer | 74 | 4 | 5.4% | Appliances Online 4 |
| Washing machine | 430 | 14 | 3.3% | Appliances Online 14, Bing Lee 1 |

## Why the visible pool is still small

1. The semi-manual expansion is shallow outside fridges. Fridge rows have multi-retailer coverage, but dishwasher/dryer/washing-machine rows are mostly Appliances Online only.
2. The site intentionally defaults to verified product-page links. Search pages, category pages, collection pages, and retailer search URLs are rejected because they caused bad user landings.
3. Clearance and dimensions still apply after retailer filtering. A product can have a verified link and still be removed if it does not fit the user's cavity.
4. Old-appliance matching previously used the matched product's raw dimensions as the cavity. Practical clearance then reduced the usable space and could eliminate the retailer-backed replacement pool. PR #65 fixes this by using product dimensions plus the practical clearance buffer.

## Old Appliance Matcher Status

The old-appliance suggestion list now favors products with more verified retailer links before falling back to priority score. This makes the default suggestions more likely to produce useful, buyable replacements.

Current top old-appliance suggestions:

| Category | Top suggestion | Verified links | Estimated cavity |
| --- | --- | ---: | --- |
| Fridge | Hisense HRCD640TBW | 5 | 922×1805×735 |
| Dishwasher | Fisher & Paykel DW60UT4I2 | 1 | 610×877×590 |
| Dryer | Electrolux EDH803BEWA | 1 | 607×870×590 |
| Washing machine | Fisher & Paykel WH1060P4 | 2 | 665×870×610 |

Regression coverage now asserts that every real old-appliance suggestion returns at least one verified-retailer result after the practical buffer is applied.

## Recommended Next Data Sprint

1. Dishwasher: add JB Hi-Fi, The Good Guys, Harvey Norman, and Bing Lee rows for the existing 12 Appliances Online products first.
2. Washing machine: expand the current 14 products beyond Appliances Online, prioritizing the models that fit common 600×850×650 cavities.
3. Dryer: expand beyond the current 4 products, prioritizing heat-pump and vented models with common 600×850×650 dimensions.
4. Keep rejecting search/category URLs. It is better to show fewer links than send users to incorrect retailer pages.

