# Phase 43 GEO Measurement

Phase 43 measures whether evidence-first guide and fit-check pages gain visibility in Search Console Generative AI exports and manual AI citation checks.

## Phase 0 Baseline

The frozen query set is `data/geo-query-set.json`. It records the baseline window, observation window, engines, AU locale/device scope, and raw evidence fields required for manual citation checks.

Run the baseline report before interpreting GEO changes:

```bash
npm run geo-baseline-report -- --no-write
```

## Weekly Commands

Run these commands from the repository root:

```bash
npm run geo-baseline-report -- --no-write
npm run audit-geo-metadata -- --strict-treatment
npm run gsc-fetch
npm run keyword-gap
npm run gsc-genai-import -- --input-dir reports/gsc-genai-exports
npm run geo-measurement-report -- --no-write
npm run audit-geo-schema-eligibility -- --no-write
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

The measurement join report writes to `reports/geo/measurement-latest.json` by default. It compares treatment and control routes by `measurement_bucket` and treats manual citations as useful only when the expected route, cited route, required observation fields, and `claim_status` all support the cited answer.

## Crawl Notification

Use the existing IndexNow script for GEO crawl notification. Do not create a second push script.

Before live submission, run a dry run that intersects the Phase 43 manifest with pages changed since the deployment base:

```bash
npm run ping-indexnow -- --manifest=data/geo-treatment-pages.json --changed-from=origin/main --dry-run --report=reports/indexnow/phase43-dry-run.json
```

After deployment, remove `--dry-run` and write a dated report for the same selected URL set. An HTTP 200 or 202 response means the endpoint received the URL list only; it is not evidence of indexing, ranking, or AI citation.

## Fallback

Search Console Generative AI report access may be unavailable for the property during rollout. If that happens, use `docs/phase43-geo-experiment/geo-ai-citation-log.csv` for manual citation checks and keep reviewing standard GSC query/page rows from `npm run gsc-fetch` and `npm run keyword-gap`.

For manual checks, record the exact prompt, engine, country, device, expected route, cited URL, cited domain, citation position, and the answer claim. Treat a citation as useful only when the cited URL is one of the Phase 43 treatment routes or an intentionally matched control route from `data/geo-treatment-pages.json`.

## Review Rule

Do not expand the treatment set until these checks pass:

- `npm run geo-baseline-report -- --no-write`
- `npm run audit-geo-metadata -- --strict-treatment`
- `npm run geo-measurement-report -- --no-write`
- `npm run audit-geo-schema-eligibility -- --no-write`
- `npm run audit-dimension-axis -- --strict`
- `npm run validate-schema`
- `npm run ping-indexnow -- --manifest=data/geo-treatment-pages.json --changed-from=origin/main --dry-run --report=reports/indexnow/phase43-dry-run.json`
- `node --test tests/geo-treatment-cohort.test.mjs tests/fit-check-pages.test.mjs tests/fit-check-schema-audit.test.mjs`

Fit-check pages with dimension-axis blockers stay out of the experiment even if they appear in Search Console exports.
