# Codex SOP: FitAppliance Data Lifecycle

Last updated: 2026-05-09

This file is the operating runbook Codex must read before running FitAppliance data acquisition, evidence, or discovery workflows.

## Permanent Prompt Library Rule

Whenever Codex builds a new pipeline, tool, automation, or updates this SOP, the final response must end with a copy/paste-ready markdown block for the user's personal Notes app.

The block must include:

- Feature name
- Codex wake phrase
- Exact commands or files when relevant

## Lifecycle Overview

```text
Scout -> Search/Seed URLs -> Fetch PDF -> Extract Text/Layout -> AI Parse -> Validate -> Vault -> Merge -> Audit
```

## 1. Scout: Retailer Radar

Purpose: discover new retailer-listed products missing from `data/catalog-final.json`.

Primary command:

```bash
node scripts/discovery-pipeline/1-scout.js --retailer=appliancesonline
```

Supported retailers:

- `appliancesonline`
- `the-good-guys` / `tgg`
- `jb-hi-fi` / `jbhifi` / `jb`
- `bing-lee` / `binglee` / `bl`
- `harvey-norman` / `harveynorman` / `hn` (adapter contract exists, but current sitemap fetch may return bot challenge HTML)

Optional safer command:

```bash
node scripts/discovery-pipeline/1-scout.js \
  --retailer=appliancesonline \
  --delay-ms=1000 \
  --max-sitemaps=25 \
  --output=data/discovery-report.json
```

Current files:

- `scripts/discovery-pipeline/1-scout.js` - CLI runner
- `scripts/discovery-pipeline/adapters/index.js` - adapter registry
- `scripts/discovery-pipeline/adapters/appliances-online.js` - pilot retailer adapter
- `scripts/discovery-pipeline/adapters/the-good-guys.js` - The Good Guys sitemap adapter
- `scripts/discovery-pipeline/adapters/jb-hi-fi.js` - JB Hi-Fi sitemap adapter
- `scripts/discovery-pipeline/adapters/bing-lee.js` - Bing Lee sitemap adapter; uses browser-like user agent because transparent bot UA is challenged
- `scripts/discovery-pipeline/adapters/harvey-norman.js` - Harvey Norman sitemap adapter; use browser/代理 follow-up if Node fetch is challenged
- `scripts/discovery-pipeline/adapters/url-discovery.js` - shared URL slug parser for retailer adapters
- `scripts/discovery-pipeline/lib/sitemap.js` - sitemap XML fetch and parsing helpers
- `scripts/discovery-pipeline/lib/catalog.js` - catalog diff and report writer
- `data/discovery-report.json` - output report

Rules:

- Prefer XML sitemaps and product APIs over HTML scraping.
- Use polite delays; default is 1000ms between sitemap fetches.
- Do not scrape checkout, account, or private API surfaces.
- Treat scout output as candidates only. Do not write directly into runtime catalog.
- If a retailer serves bot-challenge HTML instead of XML, stop that retailer run and report it rather than escalating to heavy scraping inside the standard scout.

## 2. Search And Seed Evidence URLs

Purpose: add direct PDF source URLs for candidate products before extraction.

Primary manifest:

- `data/manual-evidence.json`

Primary command:

```bash
node scripts/discovery-pipeline/2-seed-evidence.js \
  --discovery=reports/discovery-pipeline/discovery-the-good-guys-YYYYMMDD.json \
  --output=reports/discovery-pipeline/evidence-seed-the-good-guys-YYYYMMDD.json \
  --delay-ms=1000
```

Accepted URL sources:

- Official manufacturer PDF URLs are preferred.
- Trusted fallback PDF hosts are allowed only when manufacturer endpoints are blocked or timed out:
  - `appliancesonline.com.au`
  - `commercial.appliancesonline.com.au`
  - `harveynorman.com.au`
  - `thegoodguys.com.au`

Rules:

- Prefer direct PDF links.
- For Bosch AU models, try the direct official media pattern before using search engines:
  - `https://media3.bosch-home.com/Documents/specsheet/en-AU/<MODEL>.pdf`
- Discovery report rows must preserve `retailer_key` so seeded entries know whether they came from Appliances Online, The Good Guys, JB Hi-Fi, Bing Lee, or another adapter.
- Non-Appliances-Online discovery entries are allowed. If a direct PDF is found, seed the evidence URL and create a reviewable runtime product slot. If no accepted PDF is found, keep the product slot with `status: "needs_source"` and record the failure in the seed report.
- Search engine discovery is best-effort only. DuckDuckGo and Yahoo HTML can time out or throttle. Do not block the full ingest on those failures; record `needs_source` and continue.
- Candidate entries must remain reviewable.
- Do not hallucinate model-to-PDF matches. If uncertain, mark for manual review.

## 3. Fetch PDF

Primary script:

- `scripts/pdf-pipeline/1-fetch.js`

Rules:

- First check `data/manual-evidence.json` for `source_url`.
- If `source_url` exists, bypass Google/CSE search completely.
- PDF download timeout is 60000ms.
- Accept `application/pdf`.
- Also accept `application/octet-stream` only when magic bytes start with `%PDF-`.
- Abort oversized files according to the fetch script's limit.

Environment:

- `OPENAI_API_KEY` is read from `.env` for downstream parse steps.
- If missing, pipeline entry scripts must print `Missing API Key in .env file`.

## 4. Extract Text/Layout

Primary script:

- `scripts/pdf-pipeline/2-extract-text.js`

Rules:

- Preserve enough context for layout-aware parsing.
- Be cautious with table extraction because plain text extraction can destroy row/column relationships.
- If a PDF is ambiguous, fail for manual review rather than guessing.

## 5. AI Parse

Primary script:

- `scripts/pdf-pipeline/3-ai-parse.js`

Rules:

- Use `OPENAI_API_KEY` from `.env`.
- Support optional `OPENAI_BASE_URL` for proxy/gateway routing.
- Round decimal dimensions to nearest integer before validation.
- Prompt must extract:
  - physical dimensions: height, width, depth
  - door open 90 depth when available
  - clearances: top, left, right, rear
  - flags: plumbing, ventilation, reversible door
  - source URL and confidence score
- Zero hallucination: ambiguous values must be returned as low confidence or fail validation.

## 6. Validate

Primary validation files:

- `scripts/pdf-pipeline/4-validate.js`
- `scripts/pdf-pipeline/lib/appliance-dimension-schema.js`

Rules:

- Use Zod validation.
- Reject null required dimensions.
- Reject non-integer dimensions after rounding logic should have normalized them.
- Flag confidence scores below review threshold for manual audit.

## 7. Vault And Manifest

Primary files:

- `scripts/pdf-pipeline/lib/vault.js`
- `data/pdf-evidence-raw/*.json`
- `data/manual-evidence.json`

Rules:

- Save validated extraction JSON to `data/pdf-evidence-raw/[sku].json`.
- Update `data/manual-evidence.json` with evidence metadata.
- Do not hardcode absolute local paths in manifests.
- If a physical PDF file path is needed, store only relative paths and resolve them through `EVIDENCE_ROOT_DIR`.

## 8. Merge

Primary script:

- `scripts/pdf-pipeline/4-merge.js`

Output:

- `data/catalog-final.json`

Rules:

- Merge verified raw evidence into catalog output.
- Discovery evidence entries from any registered retailer are valid when they include `discovery.retailer_key` and a verified `source_url`; do not restrict merge/batch processing to Appliances Online.
- Do not overwrite live `public/data/*.json` directly from the batch runner.
- Add `data_source: "official_pdf"` when dimensions come from validated PDF evidence.
- Keep audit visibility for significant dimension conflicts.

## 9. Audit Reports

Primary reports:

- `reports/pdf-batch-results.md`
- `reports/pdf-evidence-audit.*`
- `data/discovery-report.json`

Rules:

- Record success/failure per SKU.
- Record significant dimension differences against legacy catalog values.
- Record PDF fetch failures separately from AI parse failures.

## 10. Tests And Verification

Discovery pipeline tests:

```bash
node --test tests/discovery-pipeline.test.mjs
```

Full test suite:

```bash
npm test
```

Syntax checks for discovery scripts:

```bash
node --check scripts/discovery-pipeline/1-scout.js
node --check scripts/discovery-pipeline/adapters/appliances-online.js
node --check scripts/discovery-pipeline/lib/catalog.js
node --check scripts/discovery-pipeline/lib/sitemap.js
```

## 11. When Adding A New Retailer Adapter

Create a new file:

```text
scripts/discovery-pipeline/adapters/<retailer>.js
```

Export:

- `retailer`
- `displayName`
- `sitemapUrls`
- `extractDiscoveries(urls)`

Then register it in:

```text
scripts/discovery-pipeline/adapters/index.js
```

Add tests to:

```text
tests/discovery-pipeline.test.mjs
```
