# Display Data Accuracy Audit

Status: active guardrails added on 2026-05-04.

This audit checks the claims users actually see in the interface, not just whether
catalog JSON is schema-valid. The current catalog has 2,188 products, 66 products
with at least one verified retailer product-page link, and 0 positive retailer
price rows. That means the UI must be careful about three words: price, stock,
and requirement.

## Current Findings

| Area | Finding | Risk | Resolution |
| --- | --- | --- | --- |
| Retailer availability | The UI said products were "in stock" or "available" at major retailers. The data only proves a verified product-page link exists. | Users may think FitAppliance checks live inventory. | Copy now says "verified retailer product links" instead of stock/availability. |
| Price and TCO | Some card paths displayed "10yr TCO" even when no purchase price was captured. | Users may think the estimate includes appliance purchase price. | No-price cards now show "10yr energy"; "10yr total" is only allowed when a positive price exists. |
| Rebate eligibility | Product-card warnings inferred possible state rebates from star rating alone. | FitAppliance does not calculate VEU/ESS or other rebate eligibility. | Rebate warning copy was removed from visible card rendering. |
| Clearance requirements | Brand pages and home copy used strong wording such as "require" and "per manufacturer installation guidelines". | The search default is practical clearance, while manufacturer figures are advisory and model-specific manuals still matter. | Copy now says planning/advisory figures and tells users to confirm the model manual. |
| Retailer prices | Sidebar/home copy said retailer links and prices appear where feed data is available. | Current manual retailer records have links but no verified prices. | Copy now separates product-page links from separately captured prices. |

## Data Snapshot

| Category | Products | Products with retailer links | Positive price rows |
| --- | ---: | ---: | ---: |
| Fridges | 1,325 | 36 | 0 |
| Dishwashers | 359 | 12 | 0 |
| Dryers | 74 | 4 | 0 |
| Washing machines | 430 | 14 | 0 |
| **Total** | **2,188** | **66** | **0** |

## Guardrails

- `tests/display-accuracy-copy.test.mjs` blocks unsupported display claims such as live stock, broad availability, rebate eligibility, and hard manufacturer-clearance claims.
- `tests/task9-product-card.test.mjs` now verifies no-price cards label ten-year cost as energy-only, while priced cards may use "10yr total".
- `tests/retailer-only-ui.test.mjs` now expects verified-retailer-link wording instead of stock wording.

## Follow-Up Plan

1. Add price capture only when a retailer product page exposes a verifiable current price and `verified_at` date.
2. Keep retailer-only search wording link-based until true stock status exists.
3. Treat manufacturer clearance as advisory unless a product-specific manual citation is stored with the product.
4. Keep rebate content out of product cards unless there is a maintained policy source and eligibility engine.
