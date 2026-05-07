# PDF Evidence Audit

FitAppliance now treats catalog dimensions and manufacturer PDF evidence as two separate confidence layers.

## Definitions

- **Shape-valid catalog row**: the product has positive integer `w`, `h`, and `d` millimetre fields plus the basic `brand`, `model`, and `cat` fields needed by the fit checker.
- **PDF-verified row**: the product has an approved manufacturer manual, installation manual, or specification sheet in `data/manual-evidence.json`, and any extracted data passes the strict appliance-dimension Zod schema.

Shape-valid catalog rows are useful for search, but they are not automatically PDF verified. This distinction prevents us from overclaiming the quality of legacy dimensions while still keeping the current fit tool operational.

## Run the audit

```bash
npm run audit-pdf-evidence
```

The script writes:

- `reports/pdf-evidence-audit-YYYYMMDD.json`
- `reports/pdf-evidence-audit-YYYYMMDD.md`

Use `--output /tmp/some-folder` when you want a local report without adding files to the repository.

```bash
npm run audit-pdf-evidence -- --output /tmp/fitappliance-pdf-evidence-audit
```

## Review queue priority

The report prioritizes products in this order:

1. Products with verified retailer links first.
2. Higher `priorityScore` first.
3. Stable product id ordering as a final tie-break.

This keeps PDF acquisition focused on products users can actually buy before long-tail catalog cleanup.

## Evidence standard

Approved PDF evidence must come from one of:

- `manufacturer_manual`
- `installation_manual`
- `spec_sheet`

Retailer product pages can support availability and outbound links, but they do not count as manufacturer dimensional evidence.

Any extracted payload should conform to `ApplianceDimensionSchema` in `scripts/pdf-pipeline/lib/appliance-dimension-schema.js`. Ambiguous fields should be left for manual review rather than guessed.
