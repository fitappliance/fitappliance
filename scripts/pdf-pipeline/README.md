# PDF evidence pipeline

This directory contains the Phase 53 foundation for turning manufacturer PDF manuals into reviewable catalog patches.

The pipeline is deliberately staged so future product-data work can stop at any point for human review:

1. `1-fetch.js` downloads a manufacturer PDF with a transparent `FitApplianceBot` user agent, retries transient failures, checks `application/pdf`, and reuses a local cache when present.
2. `2-extract-text.js` uses `pdf-parse` to extract text and basic metadata, then removes page-number/footer noise before an LLM sees the text.
3. `3-ai-parse.js` builds the prompt contract and accepts an injectable `llmCaller`. The default caller is a deterministic Bosch fixture stub for offline tests.
4. `4-validate.js` applies schema and sanity-range checks before data can become a candidate patch.
5. `5-merge.js` fuzzy-matches the extracted product to the catalog by brand and SKU prefix, then returns a patch object plus conflicts. It never writes `public/data`.

Phase 53 B1 is framework-only. B2 can replace the stub `llmCaller` with a real extractor and run the first 50 PDF/manual candidates.

## Local evidence files

Raw PDFs should live outside git under `data/pdf-evidence/` or on the local evidence disk. Commit only small fixtures that are safe to redistribute.
