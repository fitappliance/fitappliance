# Manual Evidence Pipeline

FitAppliance now keeps bulky manufacturer manuals and spec sheets outside the
Git repository. The repository stores only a small manifest plus tooling; PDF
files, OCR text, screenshots, and AI extraction drafts live on the local Ugreen
1T drive.

## Storage Location

Default root:

```bash
/Volumes/绿联扩展1T/FitAppliance/manual-evidence
```

Override it when needed:

```bash
export FITAPPLIANCE_EVIDENCE_ROOT="/Volumes/绿联扩展1T/FitAppliance/manual-evidence"
```

Required folders:

- `pdf/` — downloaded manufacturer installation PDF and spec-sheet files
- `extracted/` — OCR text, AI JSON drafts, and intermediate extraction output
- `approved/` — human-reviewed JSON ready to be applied in a later catalog PR
- `rejected/` — bad matches, obsolete manuals, and pages that should not be reused

Do not commit PDF files, screenshots, OCR dumps, or raw AI extraction output.
Only commit reviewed manifest metadata and small JSON fixtures that are needed
for tests.

## First-Time Setup

```bash
npm run manual-evidence -- init-root
npm run manual-evidence -- check-root
```

`check-root` should print:

```text
manual evidence root ok: /Volumes/绿联扩展1T/FitAppliance/manual-evidence
```

If the external disk is mounted under another path, set
`FITAPPLIANCE_EVIDENCE_ROOT` before running the command.

## Intended Workflow

1. Pick a high-value product already present in the catalog.
2. Find the official manufacturer installation PDF or spec sheet.
3. Save the PDF under the evidence root, normally below
   `pdf/<category>/<brand>/`.
4. Add a candidate entry to `data/manual-evidence.json` or generate one with
   the helper functions in `scripts/manual-evidence.js`.
5. Extract only factual fields:
   - width, height, depth
   - side/top/rear clearance
   - packed dimensions, when published
   - delivery warnings such as plumbing or anti-tip requirements
6. Review the extracted JSON manually before any catalog write.
7. Apply approved values in a separate PR with tests and a source link.

This keeps the public catalog from drifting into “AI guessed” data. The model
may help extract, but a human-approved evidence record is the gate before any
runtime data change.

## Manifest Shape

`data/manual-evidence.json` starts empty:

```json
{
  "schema_version": 1,
  "last_updated": "2026-05-07",
  "storage": {
    "root_env": "FITAPPLIANCE_EVIDENCE_ROOT",
    "default_root": "/Volumes/绿联扩展1T/FitAppliance/manual-evidence",
    "required_dirs": ["pdf", "extracted", "approved", "rejected"]
  },
  "products": {}
}
```

Future entries should remain product-keyed and evidence-first:

```json
{
  "fridge-hisense-hrcd640tbw": {
    "category": "fridge",
    "brand": "Hisense",
    "model": "HRCD640TBW",
    "evidence": [
      {
        "type": "manufacturer_manual",
        "status": "candidate",
        "source_url": "https://example.com/manual.pdf",
        "local_path": "pdf/fridge/hisense/hrcd640tbw-1234abcd.pdf",
        "verified_at": "2026-05-07",
        "sha256": null,
        "notes": ""
      }
    ]
  }
}
```

## Guardrails

- Manufacturer installation PDF evidence outranks retailer descriptions.
- Retailer product pages can support product names and buy links, but should not
  be treated as authoritative clearance data.
- `manufacturer_manual`, `installation_manual`, `spec_sheet`, `energy_label`,
  and `retailer_product_page` are the only current evidence types.
- `candidate`, `extracted`, `approved`, and `rejected` are the only current
  statuses.
- Keep catalog changes separate from evidence intake. Intake proves the source;
  a later PR applies reviewed facts to runtime data.
