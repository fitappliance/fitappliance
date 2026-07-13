# PDF evidence pipeline

> **Legacy research compatibility only.** The supported production workflow is
> [`docs/architecture-v2/historical-evidence-recovery-runbook.md`](../../docs/architecture-v2/historical-evidence-recovery-runbook.md).
> The numbered pipeline, brand text parsers, fuzzy merge and vault cannot issue
> Architecture V2 receipts or publish data. Brand `*-official.js` finders remain
> in use through discovery-only Architecture V2 adapters and must not be removed
> until native resolver parity is proven.

This directory contains the Phase 53 foundation for turning manufacturer PDF manuals into reviewable catalog patches.

The pipeline is deliberately staged so future product-data work can stop at any point for human review:

1. `1-fetch.js` downloads a manufacturer PDF with a transparent `FitApplianceBot` user agent, retries transient failures, checks `application/pdf`, enforces a 15MB default maximum file size, aborts slow requests, and reuses a local cache when present.
2. `2-extract-text.js` is a compatibility adapter. It runs MinerU first, reads
   `content_list_v2.json`, and only then emits text for legacy brand parsers.
   It never reads PDF text directly in production.
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

MinerU JSON is derived, untrusted evidence rather than a source of truth. The
approval verifier must replay it against the immutable PDF hash and retain page,
bbox, fragment hash and explicit axis order. Legacy text and brand regex parsers
may create research candidates only; they cannot issue an Architecture V2
verification receipt. Apply these rules:

- Extract physical product height, width, and depth in millimetres.
- Extract required installation clearances: top, left, right, and rear.
- If the manual gives a cavity dimension rather than a clearance, calculate the clearance only when both cavity and product dimensions are explicit.
- Extract flags for plumbing, ventilation, and reversible doors where stated.
- If a number is ambiguous, leave it unknown and quarantine the candidate.
  Never infer a missing dimension from nearby text.

Before adding or widening a brand parser, consult
[`docs/architecture-v2/appliance-dimension-expression-knowledge-base.md`](../../docs/architecture-v2/appliance-dimension-expression-knowledge-base.md).
It inventories the four supported appliance categories, every catalog brand,
officially proven marketing series, shared-document families, repeated PDF
grammar profiles, axis order, safe axes and fail-closed decisions. The matching
JSON sidecar is
[`data/architecture-v2/generated/dimension-expression-observations.json`](../../data/architecture-v2/generated/dimension-expression-observations.json).

The knowledge base permits syntax reuse only. It cannot establish that two
models share dimensions, resolve a suffix alias, or authorise a public claim.
Every new PDF still needs exact-model source verification, immutable PDF and
MinerU hashes, page/fragment provenance and a verification receipt.

Required environment:

```text
FITAPPLIANCE_STORAGE_ROOT
FITAPPLIANCE_MINERU_BIN
MINERU_TOOLS_CONFIG_JSON
MINERU_MODEL_SOURCE=local
```

## Local evidence files

Raw PDFs should live outside git under `data/pdf-evidence/` or on the local evidence disk. Commit only small fixtures that are safe to redistribute.
