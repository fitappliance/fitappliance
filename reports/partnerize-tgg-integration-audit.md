# Partnerize TGG Integration Audit

Generated: 2026-06-01T12:26:10.251Z

## Executive Summary

- Tracking campaign captured from Partnerize: The Good Guys Australia, camref `1011l5JNxE`.
- Manual source keeps canonical The Good Guys product URLs and adds separate Partnerize `affiliate_url` fields for outbound clicks.
- Partnerize product feed is visible in the backend, but it is currently marked `Not Processed`; direct download returned 404 during audit, so it is not safe to replace manual curation yet.

## Manual Retailer Ledger

| Metric | Count |
|---|---:|
| The Good Guys rows | 30 |
| Canonical product URLs valid | 30 |
| Partnerize affiliate URLs valid | 30 |
| Missing affiliate URLs | 0 |
| Bad canonical URLs | 0 |
| Bad affiliate URLs | 0 |

## Runtime Catalog Source

| Metric | Count |
|---|---:|
| The Good Guys rows in data/catalog-final.json | 101 |
| Canonical product URLs valid | 101 |
| Partnerize affiliate URLs valid | 101 |
| Missing affiliate URLs | 0 |
| Bad canonical URLs | 0 |
| Bad affiliate URLs | 0 |

## Generated Public Data

| Metric | Count |
|---|---:|
| The Good Guys rows across public/data | 60 |
| Canonical product URLs valid | 60 |
| Partnerize affiliate URLs valid | 60 |
| Missing affiliate URLs | 0 |
| Bad canonical URLs | 0 |
| Bad affiliate URLs | 0 |

## Partnerize Feed Check

- Backend creative overview shows `Feed: 1` for The Good Guys Australia.
- Feed id observed: `1101l1365`.
- Feed name observed: `The Good Guys Product Feed`.
- Download status observed: `Not Processed / direct download 404`.
- The private feed URL must not be committed. Future importer should read it from `PARTNERIZE_TGG_FEED_URL`.

## Bug Audit

- Canonical retailer URLs are preserved for validation, SEO, and transparency.
- Click destinations use `affiliate_url` only when present and valid.
- Search/category URLs are still rejected by product-page validation.
- No Partnerize private feed URL is stored in the repository.
- Product feed cannot replace manual retailer curation until the backend feed moves from `Not Processed` to a downloadable state.
