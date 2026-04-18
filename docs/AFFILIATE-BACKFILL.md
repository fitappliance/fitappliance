# Affiliate Backfill Guide

This project supports affiliate links, but **ASIN/SKU values are intentionally not committed**.

## 1) Set environment variables

- `AMAZON_AU_TAG`
- `APPLIANCES_ONLINE_AFFILIATE_ID`
- Optional: `THE_GOOD_GUYS_AFFILIATE_ID`

Without these env vars, no affiliate buy links are rendered.

## 2) Add per-product affiliate fields (manual backfill)

Add optional `affiliate` blocks on products in:

- `/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/public/data/appliances.json`
- or your source-of-truth sync inputs before generation

Example:

```json
{
  "id": "f-westinghouse-WBB3100AK",
  "affiliate": {
    "amazonAU": { "asin": "" },
    "appliancesOnline": { "sku": "" },
    "theGoodGuys": { "sku": "" }
  }
}
```

Use real marketplace identifiers only:

- `amazonAU.asin`: Amazon AU ASIN
- `appliancesOnline.sku`: Appliances Online product slug/SKU
- `theGoodGuys.sku`: searchable model/SKU token

## 3) Rebuild pages

```bash
npm run build
```

This regenerates compare, brand, and location pages with affiliate CTAs where both:

1. product affiliate identifier is present, and
2. provider environment variable is present.

## 4) Compliance

- All affiliate links render with `rel="sponsored nofollow noopener"`.
- Disclosure text is rendered immediately under each affiliate CTA.
- `/affiliate-disclosure` remains the central policy page.
