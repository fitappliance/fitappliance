# Evidence Trust Tier Rerun Summary

Generated: 2026-05-20

## Rules Applied

- Verified Fit requires explicit physical dimensions and explicit installation/cavity/air-clearance evidence.
- Dimensions Verified allows PDF-backed bare dimensions only, with clearance treated as estimated and not as Verified Fit.
- Retailer Spec proves retail/spec-sheet dimensions only and cannot claim installation safety.
- SKU/model token mismatches, ambiguous aliases, missing clearance, and catalog cross-check mismatches remain fail-closed.

## Brand Rerun Results

| Brand | Success | Failure | Discrepancies | Report |
|---|---:|---:|---:|---|
| Fisher & Paykel | 112 | 142 | 5 | `reports/pdf-reruns/fisher-paykel-2026-05-20.md` |
| LG | 11 | 182 | 2 | `reports/pdf-reruns/lg-2026-05-20.md` |
| Westinghouse | 0 | 183 | 0 | `reports/pdf-reruns/westinghouse-2026-05-20.md` |
| Haier | 1 | 178 | 0 | `reports/pdf-reruns/haier-2026-05-20.md` |
| Hisense | 38 | 86 | 0 | `reports/pdf-reruns/hisense-2026-05-20.md` |
| Midea | 0 | 104 | 0 | `reports/pdf-reruns/midea-2026-05-20.md` |
| Esatto | 1 | 90 | 0 | `reports/pdf-reruns/esatto-2026-05-20.md` |
| Miele | 4 | 74 | 0 | `reports/pdf-reruns/miele-2026-05-20.md` |
| Kogan | 0 | 55 | 0 | `reports/pdf-reruns/kogan-2026-05-20.md` |
| CHIQ / CHiQ | 20 | 88 | 3 | `reports/pdf-reruns/chiq-2026-05-20.md` |
| Beko / BEKO | 7 | 102 | 0 | `reports/pdf-reruns/beko-2026-05-20.md` |
| Electrolux | 0 | 79 | 0 | `reports/pdf-reruns/electrolux-2026-05-20.md` |
| Omega | 8 | 57 | 0 | `reports/pdf-reruns/omega-2026-05-20.md` |
| Artusi | 0 | 52 | 0 | `reports/pdf-reruns/artusi-2026-05-20.md` |
| Liebherr | 2 | 50 | 0 | `reports/pdf-reruns/liebherr-2026-05-20.md` |
| Robinhood | 3 | 37 | 0 | `reports/pdf-reruns/robinhood-2026-05-20.md` |
| Inalto | 0 | 34 | 0 | `reports/pdf-reruns/inalto-2026-05-20.md` |
| VOGUE | 0 | 39 | 0 | `reports/pdf-reruns/vogue-2026-05-20.md` |
| TECO | 0 | 36 | 0 | `reports/pdf-reruns/teco-2026-05-20.md` |

## Totals

- Brands rerun: 19
- Successful parser runs: 207
- Fail-closed outcomes: 1668
- Discrepancies detected: 10

## Lessons By Brand

- **Fisher & Paykel:** Most successful refreshes were already represented. Keep QRG/installation-guide matching strict; do not infer clearance from family docs without explicit installation dimensions.
- **LG:** Exact-model evidence remains mandatory. Support-page aliases are useful only when the PDF text proves the exact SKU or a verified_alias is local to the product.
- **Westinghouse:** Resource endpoints and retailer-hosted PDFs frequently lack clear install airspace. Parser should stay fail-closed instead of upgrading retailer facts.
- **Haier:** Haier parser correctly requires official Specification Guide plus cavity dimensions; AO spec sheets remain retailer_spec unless installation clearance is explicit.
- **Hisense:** OCC failures, SKU token mismatches, and missing clearance dominate. Successful fetches mostly refreshed known evidence; do not relax model-token checks.
- **Midea:** Most pages either missing or provide dimensions without clearance. Need a future Midea-specific finder before further batch value is likely.
- **Esatto:** Many documents lack Product Dimensions W x D x H or explicit clearance. Do not accept generic appliance spec blocks.
- **Miele:** Miele integrated products need niche dimensions. Product sheets without niche/install dimensions should not become Verified Fit.
- **Kogan:** Kogan assets often 403 or fail catalog cross-checks. Cross-check mismatch is a hard reject, not a parser bug to bypass.
- **CHIQ / CHiQ:** CHIQ/CHiQ has mixed casing and wildcard SKUs. Concrete SKU and ventilation text are required; avoid running both casings as separate logic branches.
- **Beko / BEKO:** Beko evidence is often retailer-backed. Official sheets need explicit H/W/D plus freestanding/built-in context before upgrading trust.
- **Electrolux:** No recoveries under current direct path. Resource-hosted manuals still need explicit dimensions and clearances, not just product pages.
- **Omega:** Recoveries did not improve trust level. Continue treating spec-only documents as lower-tier evidence unless install clearance is present.
- **Artusi:** No recoveries; existing parser/finder cannot safely prove dimensions and clearance for current missing set.
- **Liebherr:** A few PDFs were reachable, but no net trust gain. Premium/integrated products need install/niche data before Verified Fit.
- **Robinhood:** Some PDFs reachable, but no net trust gain. Maintain category-specific clearance requirements.
- **Inalto:** No recoveries; future work needs a dedicated source discovery path rather than parser loosening.
- **VOGUE:** No recoveries; current inputs do not provide sufficient PDF evidence.
- **TECO:** No recoveries; keep fail-closed.

## Current Audit Snapshot

## Summary

- Total SKUs: 3541
- Verified Fit: 280
- Dimensions Verified: 148
- Retailer Spec: 1377
- Missing evidence: 1736
- Evidence coverage: 51.0%
- Verified Fit coverage: 7.9%
