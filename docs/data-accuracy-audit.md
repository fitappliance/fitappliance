# Data Accuracy Audit

FitAppliance now has a report-only audit for catalog accuracy:

```bash
npm run audit-data-accuracy
```

The command scans the four runtime product catalogs under `public/data/` and writes:

- `reports/data-accuracy/latest.json`
- `reports/data-accuracy/latest.md`

It does **not** edit catalog data. That is intentional: the audit is a triage layer, not an automatic correction tool.

## Current Baseline

After the 2026-05-04 catalog sync and display-accuracy review, the report is expected to show:

- Products scanned: `2188`
- Blockers: `0`
- Invalid retailer product URLs: `0`
- Stale price rows: `0`
- Brand duplicate groups: `0`
- Accuracy grades: `B=66`, `C=2122`

The remaining `C` rows are primarily historical catalog entries that do not yet carry field-level evidence metadata. That is a data provenance backlog, not a runtime rendering blocker. New manual curation should improve rows by adding verified product-page URLs, `verified_at`, and confidence/source evidence rather than guessing missing fields.

There are currently no positive verified retailer price rows, so UI copy must avoid implying live prices or purchase-price-inclusive total cost. Display-layer copy guardrails live in `tests/display-accuracy-copy.test.mjs` and are summarized in `docs/display-data-accuracy-audit.md`.

## What It Checks

### Retailer URL Quality

Retailer links are treated as product-page links only when they match known safe patterns:

- `jbhifi.com.au/products/...`
- `appliancesonline.com.au/product/...`
- `thegoodguys.com.au/<product-slug>`
- `harveynorman.com.au/...html`
- `binglee.com.au/products/...`

The audit flags retailer homepages, search pages, category pages, carts, checkout URLs, and malformed URLs as blockers. These should not appear as buy links in the UI.

### Price Freshness

Any positive retailer price should have `verified_at`.

- Missing `verified_at` is a warning.
- Prices older than 30 days are warnings.
- Future strict mode can turn these into blockers once current data has been cleaned.

### Schema And Range Sanity

The audit reuses `scripts/schema.js` to catch invalid dimensions, invalid `kwh_year`, invalid star ratings, invalid retailer rows, and malformed product records.

### Brand Casing Duplicates

The audit groups brands by category and normalized casing. It reports duplicates such as `HAIER` + `Haier` because those duplicates fragment facets and make the site look less trustworthy.

### Evidence Coverage

Core fields are checked for field-level evidence metadata:

- `brand`
- `model`
- `w`
- `h`
- `d`
- `kwh_year`
- `stars`

Most historical catalog rows do not yet expose evidence metadata. That is currently a warning, not a blocker. New manual curation should add `source_url`, `verified_at`, and `confidence` where possible.

## Accuracy Grades

The report assigns internal product grades:

- `A`: has verified retailer product link and fresh price.
- `B`: has verified retailer product link but no fresh price.
- `C`: has inferred fields or missing evidence metadata.
- `D`: low-evidence row without concrete URL/schema blockers.
- `F`: invalid retailer URL or schema blocker.

These grades are not shown to users yet. They are for prioritizing cleanup.

## Review Workflow

1. Run `npm run audit-data-accuracy`.
2. Open `reports/data-accuracy/latest.md`.
3. Fix blockers first, especially invalid retailer links.
4. Review stale prices before using them in any “best price” UI.
5. Add evidence metadata gradually through manual retailer/product review.
6. Only after blocker count is intentionally zero should CI use `node scripts/audit-data-accuracy.js --strict`.

## Why Report-Only First

The current catalog has a long history of mixed data sources. Turning every warning into a CI blocker immediately would stop normal development before the cleanup work is done. This first version makes the risks visible and repeatable without pretending the catalog is already perfect.
