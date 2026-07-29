# Provider Response Quarantine

**Status:** Active Architecture V2 intake contract  
**Scope:** CSV, JSON and XLSX files supplied by a manufacturer or data provider

Provider files never enter the catalogue, public projection or Fit engine directly. The intake command creates private, immutable source and rights objects, validates each row against the existing exact AU identity catalogue, and emits shadow claims or typed rejection diagnostics. Every output remains `publicationEligible: false` and `fitEligible: false`.

## Required Inputs

Keep all three inputs outside Git under the configured evidence volume:

1. The original provider file.
2. The written rights evidence, such as the relevant email, licence or terms export.
3. A private intake manifest containing source metadata, an explicit schema mapping and field-level rights decisions.

The command uses the current public projection plus the historical model classification as its identity allowlist. Category, brand, complete model string and an explicitly rights-bound Australian market column must all match. It also compares provider W/H/D against current catalogue W/H/D by default; a mismatch is isolated rather than overwritten. A provider-only new model remains `IDENTITY_UNPROVEN` until an Australian market source corroborates it.

```bash
npm run quarantine:provider-response -- \
  --file /private/provider-sample.xlsx \
  --manifest /private/provider-sample-intake.json \
  --storage-root /Volumes/UGREEN-1TB/FitAppliance
```

The CLI prints a Git-safe summary with hashes, counts and typed status only. Exact row values, private paths and rights text stay in the external evidence store.

## Private Manifest

The following is illustrative only. Every mapped field needs independent `cache_source`, `cache_normalized_fields` and `public_display` decisions bound to the same `providerId`, `sourceId`, `fieldId` and verified rights-evidence hash.

```json
{
  "schemaVersion": 1,
  "organizationId": "example-appliances-australia",
  "providerId": "example-appliances",
  "sourceId": "sample-export-2026-07-28",
  "receivedAt": "2026-07-28T09:30:00.000Z",
  "format": "xlsx",
  "rightsEvidenceFiles": [
    {
      "path": "rights-message.eml",
      "contentSha256": "<sha256-of-the-exact-rights-message>"
    }
  ],
  "schemaMapping": {
    "sheetName": "Products",
    "headerRow": 1,
    "columns": [
      {
        "source": "Product type",
        "fieldId": "identity.category",
        "valueMap": {
          "Dishwasher": "dishwasher"
        }
      },
      { "source": "Brand", "fieldId": "identity.brand" },
      { "source": "Model", "fieldId": "identity.model" },
      {
        "source": "Market",
        "fieldId": "identity.market",
        "role": "market",
        "acceptedValues": ["AU", "Australia"]
      },
      {
        "source": "Product width (mm)",
        "fieldId": "closedEnvelope.widthMm",
        "axis": "width",
        "unit": "mm",
        "sourceScope": "product_closed"
      },
      {
        "source": "Carton width (mm)",
        "fieldId": "packagedEnvelope.widthMm",
        "axis": "width",
        "unit": "mm",
        "sourceScope": "package"
      }
    ]
  },
  "rights": {
    "decisions": [
      {
        "providerId": "example-appliances",
        "sourceId": "sample-export-2026-07-28",
        "fieldId": "closedEnvelope.widthMm",
        "actionId": "public_display",
        "decision": "granted",
        "evidenceSha256": "<sha256-of-the-exact-rights-message>"
      }
    ]
  }
}
```

Never interpret `granted_with_conditions` automatically. Record the conditions, obtain any required approval, and only then create a separate explicit grant decision.

## Mapping Rules

- Supported catalogue categories are `fridge`, `dishwasher`, `dryer`, `washing_machine` and the explicit internal combined-laundry category `washtower_combo`.
- Provider category labels require an explicit `valueMap`; they are not guessed from product names.
- Brand and model matching is case-insensitive after outer whitespace is removed, but punctuation and suffixes are preserved. `WSF6606X` does not match `WSF6606XB`.
- Product, package, installation, operation and service scopes must match the canonical field dictionary. A carton value can only target `packagedEnvelope.*`.
- Scalar and range axes and units must be explicit. A range uses separate `minSource` and `maxSource` columns.
- GTIN and variant suffix are shadow field candidates; category, brand, model and market are the identity binding.
- An Australian market column and accepted values are mandatory. A generic global export is insufficient.

## Format Safety

- Source size is limited to 10 MiB, 20,000 rows, 256 columns and 20,000 characters per cell.
- XLSX is a narrowly supported, read-only OOXML subset. Macros, formulas, encrypted entries, external links, embedded objects, ZIP64, unsafe paths and oversized decompressed archives are rejected.
- CSV requires a unique header row and consistent column counts.
- JSON must be an array of row objects or an object containing a `rows` array.

## Typed Outcomes

| Status | Meaning | Allowed next action |
| --- | --- | --- |
| `QUARANTINED_CANDIDATES` | Rights, exact AU identity and normalization passed. | Compare with existing evidence and issue separate field receipts. Do not publish. |
| `QUARANTINED_WITH_CONFLICTS` | Some claims passed while other field values conflicted. | Research conflicting fields; only unaffected claims remain in quarantine. |
| `CONFLICT_QUARANTINED` | Every candidate field conflicted. | Resolve against exact official evidence. |
| `IDENTITY_UNPROVEN` | Category, AU market, brand or exact model did not bind. | Corroborate identity; do not create an alias automatically. |
| `RIGHTS_BLOCKED` | A required action is missing, conditional, denied or lacks its original evidence object. | Obtain explicit written rights or retain only the external incoming message. |
| `NO_CANDIDATE_FIELDS` | No usable mapped factual field remained. | Correct the mapping or request a better export. |

## Storage Layout

Original source bytes, rights evidence and quarantine receipts are content-addressed below `FITAPPLIANCE_STORAGE_ROOT/outreach`:

```text
provider-samples/sha256/<prefix>/<sha256>.<format>
provider-samples/receipts/<prefix>/<receipt-sha256>.json
rights/sha256/<prefix>/<sha256>.bin
```

Persistence is allowed only when every mapped field has evidence-bound grants
for `cache_source`, `cache_normalized_fields` and `public_display`. A
`RIGHTS_BLOCKED` response is not written into `provider-samples`, even when the
provider allowed source caching but did not grant the other required actions.
The original inbound message remains in the separately controlled mailbox.

After quarantine, the private shadow acceptance command re-verifies the receipt,
original source bytes, rights objects, report seal, exact AU identity and every claim
binding before issuing one immutable field receipt per accepted claim:

```bash
npm run accept:provider-response-shadow -- \
  --receipt /private/quarantine-receipt.json \
  --storage-root /Volumes/UGREEN-1TB/FitAppliance \
  --accepted-at 2026-07-29T12:00:00.000Z
```

Additional private objects are stored at:

```text
provider-samples/field-receipts/<prefix>/<receipt-sha256>.json
provider-samples/shadow-acceptance/<prefix>/<bundle-sha256>.json
```

Both layers remain `publicationEligible: false`, `fitEligible: false`, and carry a
null public projection. The public site and ordinary build do not depend on these
files. Provider intake or shadow acceptance alone can never produce `VERIFIED_FIT`.
