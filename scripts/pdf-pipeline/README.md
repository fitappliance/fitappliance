# PDF evidence pipeline

This directory contains the Phase 53 foundation for turning manufacturer PDF manuals into reviewable catalog patches.

The pipeline is deliberately staged so future product-data work can stop at any point for human review:

1. `1-fetch.js` downloads a manufacturer PDF with a transparent `FitApplianceBot` user agent, retries transient failures, checks `application/pdf`, enforces a 15MB default maximum file size, aborts slow requests, and reuses a local cache when present.
2. `2-extract-text.js` uses `pdf-parse` to extract text and basic metadata, then removes page-number/footer noise before an LLM sees the text.
3. `3-ai-parse.js` builds the prompt contract and accepts an injectable `llmCaller`. The default caller is a deterministic Bosch fixture stub for offline tests.
4. `4-validate.js` applies legacy schema and sanity-range checks before data can become a candidate patch. `lib/appliance-dimension-schema.js` provides the newer strict Zod contract for manufacturer-PDF dimension evidence.
5. `5-merge.js` fuzzy-matches the extracted product to the catalog by brand and SKU prefix, then returns a patch object plus conflicts. It never writes `public/data`.

Phase 53 B1 is framework-only. B2 can replace the stub `llmCaller` with a real extractor and run the first 50 PDF/manual candidates.

## Acquisition rules

Do not scrape retailer websites for PDFs. The PDF pipeline is for manufacturer domains and public manufacturer spec sheets / installation manuals. Search queries should target manufacturer domains with a pattern like:

```text
site:<manufacturer-domain> "<SKU>" ("specification sheet" OR "installation manual" OR "dimensions") filetype:pdf
```

Recommended starting domains are Bosch AU, Samsung AU, Fisher & Paykel AU, Kogan, and Heller. Any match that is not clearly a manufacturer PDF should be rejected for manual review.

## Extraction rules

Treat ordinary text extraction as a helper, not a source of truth. PDF text order can destroy tables and diagram labels. A future vision/layout-aware extraction stage should inspect only the pages containing "Specifications", "Dimensions", or "Installation" and must follow these rules:

- Extract physical product height, width, and depth in millimetres.
- Extract required installation clearances: top, left, right, and rear.
- If the manual gives a cavity dimension rather than a clearance, calculate the clearance only when both cavity and product dimensions are explicit.
- Extract flags for plumbing, ventilation, and reversible doors where stated.
- If a number is ambiguous, output null/low confidence and require manual review. Never infer a missing dimension from nearby text.

## Local evidence files

Raw PDFs should live outside git under `data/pdf-evidence/` or on the local evidence disk. Commit only small fixtures that are safe to redistribute.
