# Partnerize TGG Integration Audit

Generated: 2026-06-02T14:50:53.007Z

## Executive Summary

- Tracking campaign captured from Partnerize: The Good Guys Australia, camref `1011l5JNxE`.
- Manual source keeps canonical The Good Guys product URLs and adds separate Partnerize `affiliate_url` fields for outbound clicks.
- Partnerize product feed is used only as retailer availability / price / affiliate-link evidence; it does not replace PDF dimension or clearance evidence.

## Manual Retailer Ledger

| Metric | Count |
|---|---:|
| The Good Guys rows | 162 |
| Canonical product URLs valid | 162 |
| Partnerize affiliate URLs valid | 162 |
| Missing affiliate URLs | 0 |
| Bad canonical URLs | 0 |
| Bad affiliate URLs | 0 |

## Runtime Catalog Source

| Metric | Count |
|---|---:|
| The Good Guys rows in data/catalog-final.json | 172 |
| Canonical product URLs valid | 172 |
| Partnerize affiliate URLs valid | 172 |
| Missing affiliate URLs | 0 |
| Bad canonical URLs | 0 |
| Bad affiliate URLs | 0 |

## Generated Public Data

| Metric | Count |
|---|---:|
| The Good Guys rows across public/data | 72 |
| Canonical product URLs valid | 72 |
| Partnerize affiliate URLs valid | 72 |
| Missing affiliate URLs | 0 |
| Bad canonical URLs | 0 |
| Bad affiliate URLs | 0 |

## Partnerize Feed Check

- Backend creative overview shows `Feed: 1` for The Good Guys Australia.
- Feed id observed: `1101l1365`.
- Feed name observed: `The Good Guys Product Feed`.
- Download/import status: `available for local import via partnerize-tgg --import-feed`.
- The private feed URL must not be committed. Feed imports should use a local file path via `--feed` or `PARTNERIZE_TGG_FEED_PATH`.

## Bug Audit

- Canonical retailer URLs are preserved for validation, SEO, and transparency.
- Click destinations use `affiliate_url` only when present and valid.
- Search/category URLs are still rejected by product-page validation.
- No Partnerize private feed URL is stored in the repository.
- Product feed cannot upgrade a product to `Verified Fit`; only official PDF clearance evidence can do that.
