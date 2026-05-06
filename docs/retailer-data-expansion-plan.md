# Retailer Data Expansion Plan

Status: active from 2026-05-06.

This plan separates the sizing catalog from retailer inventory evidence. Do not
count raw specs as retailer inventory. A raw spec row means FitAppliance has
dimensions and energy fields for a model. A retailer-verified product means at
least one manually reviewed product-page URL exists for one of the five tracked
Australian retailers.

## Current Baseline

| Metric | Count | Meaning |
| --- | ---: | --- |
| Raw specs catalog | 2,188 | Sizing/spec rows across fridges, dishwashers, dryers, and washing machines. |
| Retailer-verified products | 66 | Products with at least one verified product-page link from the five tracked retailers. |
| Verified retailer links | 177 | Total product-page links across JB Hi-Fi, Appliances Online, The Good Guys, Harvey Norman, and Bing Lee. |
| Multi-retailer products | 58 | Products with two or more verified retailer product-page links. |
| Live price rows | 0 | Positive retailer prices captured with enough evidence to show as price data. |

## Coverage By Category

| Category | Raw specs | Retailer-verified products | Verified retailer links | Multi-retailer products | Link coverage |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fridges | 1,325 | 36 | 108 | 35 | 2.7% |
| Dishwashers | 359 | 12 | 30 | 10 | 3.3% |
| Dryers | 74 | 4 | 8 | 2 | 5.4% |
| Washing machines | 430 | 14 | 31 | 11 | 3.3% |
| **Total** | **2,188** | **66** | **177** | **58** | **3.0%** |

## Retailer Gaps On Already-Linked Products

This table does not mean every retailer truly sells every product. It shows the
maximum remaining product-page links if every currently linked product had all
five retailer URLs.

| Category | Current links | Maximum links for currently linked products | Upper-bound missing links |
| --- | ---: | ---: | ---: |
| Fridge | 108 | 180 | 72 |
| Dishwasher | 30 | 60 | 30 |
| Dryer | 8 | 20 | 12 |
| Washing machine | 31 | 70 | 39 |
| **Total** | **177** | **330** | **153** |

## Batch 1: Complete Existing Linked Products

Goal: add retailer alternatives to products that already have at least one
verified link.

Priority order:

1. Dishwasher: fill remaining JB Hi-Fi, Harvey Norman, The Good Guys, and Bing Lee gaps for the 12 linked products where true product pages exist.
2. Washing machine: fill remaining retailer gaps for the 14 linked products, starting with LG, Hisense, Fisher & Paykel, Westinghouse, and Electrolux.
3. Dryer: fill The Good Guys, Bing Lee, Harvey Norman, and JB Hi-Fi gaps for the 4 linked products.
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

This creates enough linked rows for normal searches without pretending the site
has complete retailer inventory.

## Batch 4: Price Evidence

Only start this after link coverage is stable.

Rules:

- Capture price only from product detail pages.
- Store `verified_at`.
- Treat prices older than 30 days as stale.
- UI must keep saying "Check retailer price" unless fresh positive price rows exist.

Initial target: 20 fresh price rows for high-traffic fridge products.
