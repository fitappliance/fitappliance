# Manual Evidence Pipeline

FitAppliance now keeps bulky manufacturer manuals and spec sheets outside the
Git repository. The repository stores only a small manifest plus tooling; PDF
files, OCR text, screenshots, and AI extraction drafts live outside Git on the
operator's evidence volume.

## Storage Location

There is no hardcoded default root. Set the physical evidence root with
`EVIDENCE_ROOT_DIR`, either in the shell or in `.env.local`:

```bash
EVIDENCE_ROOT_DIR="/path/to/FitAppliance/manual-evidence/pdf/fridge"
```

`data/manual-evidence.json` stores only a relative local_path. The audit
script resolves a physical file by joining:

```text
EVIDENCE_ROOT_DIR + evidence.local_path
```

For example, if `EVIDENCE_ROOT_DIR` points to the fridge PDF folder, a manifest
entry can use `hisense/hrtf206-ff22c779.pdf` without storing any machine-specific
absolute path.

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
manual evidence root ok: /path/to/FitAppliance/manual-evidence/pdf/fridge
```

If the external disk is mounted under another path, update `EVIDENCE_ROOT_DIR`.

## Intended Workflow

1. Pick a high-value product already present in the catalog.
2. Find the official manufacturer installation PDF or spec sheet.
3. Save the PDF under the evidence root, normally below a brand folder such as
   `hisense/`.
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
    "root_env": "EVIDENCE_ROOT_DIR",
    "path_rule": "Each evidence.local_path is relative to EVIDENCE_ROOT_DIR. Do not store absolute machine paths in this manifest."
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
        "local_path": "hisense/hrcd640tbw-1234abcd.pdf",
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
- If `EVIDENCE_ROOT_DIR` is not available in CI, the PDF audit emits a warning
  and skips physical hash verification. Tiny committed fixtures cover the hash
  reader path so cloud tests still exercise file I/O and SHA256 calculation.
