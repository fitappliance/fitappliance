# Phase 43 GEO Measurement

Phase 43 measures whether evidence-first guide and fit-check pages gain visibility in Search Console Generative AI exports and manual AI citation checks.

## Weekly Commands

Run these commands from the repository root:

```bash
npm run gsc-fetch
npm run keyword-gap
npm run gsc-genai-import -- --input-dir reports/gsc-genai-exports
npm run audit-dimension-axis -- --strict
npm run validate-schema
```

The importer reads CSV files exported from the Search Console Generative AI report when the property has access. Supported CSV headers are:

```csv
Page,Impressions
Country,Impressions
Device,Impressions
Date,Impressions
```

The default output is `reports/gsc-genai-import/latest.json`.

## Fallback

Search Console Generative AI report access may be unavailable for the property during rollout. If that happens, use `docs/phase43-geo-experiment/geo-ai-citation-log.csv` for manual citation checks and keep reviewing standard GSC query/page rows from `npm run gsc-fetch` and `npm run keyword-gap`.

For manual checks, record the exact prompt, engine, country, device, expected route, cited URL, cited domain, citation position, and the answer claim. Treat a citation as useful only when the cited URL is one of the Phase 43 treatment routes or an intentionally matched control route from `data/geo-treatment-pages.json`.

## Review Rule

Do not expand the treatment set until these checks pass:

- `npm run audit-dimension-axis -- --strict`
- `npm run validate-schema`
- `node --test tests/geo-treatment-cohort.test.mjs tests/fit-check-pages.test.mjs tests/fit-check-schema-audit.test.mjs`

Fit-check pages with dimension-axis blockers stay out of the experiment even if they appear in Search Console exports.
