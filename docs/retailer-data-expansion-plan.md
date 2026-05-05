# Retailer Data Expansion Plan

Status: active from 2026-05-05.

This plan separates the sizing catalog from retailer inventory evidence. Do not count raw specs as retailer inventory. A raw spec row means FitAppliance has dimensions and energy fields for a model. A retailer-verified product means at least one manually reviewed product-page URL exists for one of the five tracked Australian retailers.

## Current Baseline

| Metric | Count | Meaning |
| --- | ---: | --- |
| Raw specs catalog | 2,188 | Sizing/spec rows across fridges, dishwashers, dryers, and washing machines. |
| Retailer-verified products | 66 | Products with at least one verified product-page link from the five tracked retailers. |
| Verified retailer links | 139 | Total product-page links across JB Hi-Fi, Appliances Online, The Good Guys, Harvey Norman, and Bing Lee. |
| Live price rows | 0 | Positive retailer prices captured with enough evidence to show as price data. |

## Coverage By Category

| Category | Raw specs | Retailer-verified products | Verified retailer links | Link coverage |
| --- | ---: | ---: | ---: | ---: |
| Fridge | 1,325 | 36 | 108 | 2.7% |
| Dishwasher | 359 | 12 | 12 | 3.3% |
| Dryer | 74 | 4 | 4 | 5.4% |
| Washing machine | 430 | 14 | 15 | 3.3% |
| **Total** | **2,188** | **66** | **139** | **3.0%** |

## Retailer Gaps On Already-Linked Products

This table does not mean every retailer truly sells every product. It shows the maximum remaining product-page links if every currently linked product had all five retailer URLs.

| Category | Current links | Maximum links for currently linked products | Upper-bound missing links |
| --- | ---: | ---: | ---: |
| Fridge | 108 | 180 | 72 |
| Dishwasher | 12 | 60 | 48 |
| Dryer | 4 | 20 | 16 |
| Washing machine | 15 | 70 | 55 |
| **Total** | **139** | **330** | **191** |

## Batch 1: Complete Existing Linked Products

Goal: add retailer alternatives to products that already have at least one verified link.

Priority order:

1. Dishwasher: fill The Good Guys, Harvey Norman, Bing Lee, and JB Hi-Fi for the 12 Appliances Online-only products where true product pages exist.
2. Washing machine: fill The Good Guys, Harvey Norman, Bing Lee, and JB Hi-Fi for the 14 linked products, starting with LG, Hisense, Fisher & Paykel, and Electrolux.
3. Dryer: fill The Good Guys, Bing Lee, Harvey Norman, and JB Hi-Fi for the 4 linked products.
4. Fridge: fill The Good Guys, Harvey Norman, and Bing Lee gaps for the 36 linked products, but skip category/search pages even when they contain the model in results.

Acceptance rules:

- Only product detail pages are allowed.
- Search, category, collection, checkout, cart, and retailer home pages are rejected.
- Redirects must land on the same product, not a broader category.
- `p` stays `null` unless a price is captured with a fresh `verified_at` date.

Target: add 40 to 70 verified links without increasing the product count.

## Batch 2: Add New Retailer-Verified Products

Goal: expand the number of products with at least one verified link.

Priority order:

1. Top cavity matches that users are likely to search: 600 mm fridges, 900 to 920 mm large fridges, 600 mm dishwashers, 600 mm washing machines, and compact dryers.
2. Mainstream AU brands first: LG, Hisense, Haier, Westinghouse, Fisher & Paykel, Bosch, Electrolux, Miele, Samsung, CHiQ, and Midea.
3. Products that appear in old-appliance replacement suggestions.
4. Products present at two or more tracked retailers.

Target: grow retailer-verified products from 66 to 120.

## Batch 3: Category Balance

Goal: avoid a fridge-heavy dataset.

Targets:

- Fridge: 60 retailer-verified products.
- Dishwasher: 30 retailer-verified products.
- Dryer: 15 retailer-verified products.
- Washing machine: 30 retailer-verified products.

This creates enough linked rows for normal searches without pretending the site has complete retailer inventory.

## Batch 4: Price Evidence

Only start this after link coverage is stable.

Rules:

- Capture price only from product detail pages.
- Store `verified_at`.
- Treat prices older than 30 days as stale.
- UI must keep saying "Check retailer price" unless fresh positive price rows exist.

Initial target: 20 fresh price rows for high-traffic fridge products.

## Operator Checklist

For every proposed retailer link:

1. Open the URL in a private browser session.
2. Confirm the page title/model matches the FitAppliance product model.
3. Confirm the final URL is a product detail page after redirects.
4. Confirm the retailer name matches one of the five tracked retailers.
5. Record `verified_at` and `source: "manual"`.
6. Run `npm run enrich-manual-retailers`.
7. Run `npm test` and `npm run audit-data-accuracy`.

## Reporting

Every expansion PR should report:

- Retailer-verified products before and after.
- Verified retailer links before and after.
- Category coverage before and after.
- Any rejected links and why they were rejected.
- Confirmation that live price rows remain 0 unless prices were intentionally captured.
