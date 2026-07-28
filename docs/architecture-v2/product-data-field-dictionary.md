# Product Data Field and Rights Dictionary

**Status:** Active Architecture V2 contract
**Canonical machine definition:** `data/architecture-v2/policies/product-data-field-rights-dictionary.json`

This contract defines what FitAppliance may request, ingest, compare and publish. It separates product facts from installation requirements and separates data quality from permission to use the data.

## Field Layers

| Layer | Examples | Publication rule |
| --- | --- | --- |
| Exact AU identity | supported product category, brand, complete model suffix, market, GTIN | Category, brand, model and Australian market must all match. Exact string or receipt-bound alias only. Country variants are separate until proven equivalent. |
| Lifecycle | current, discontinued, replacement model | A dated Australian market source is required. Lifecycle does not establish geometry. |
| Closed product envelope | W/H/D with doors and controls in the stated closed position | Product scope and each axis must be explicit. Package, cavity and open-door values cannot substitute. |
| Packaged envelope | carton W/H/D | Delivery information only. Never used as product dimensions. |
| Adjustable range | minimum and maximum W/H/D | Preserve both bounds and the adjustment context. Do not collapse a range into a fixed value. |
| Installation clearance | left, right, top, rear and front/service gaps | Model-specific installation evidence only. Generic brand guidance remains a normative hint. |
| Operation envelope | door, drawer or lid open W/H/D | Keep the open state and axis label. `D`, `D'` and `D"` remain distinct until the document defines them. |
| Ventilation | directional gaps and open area | Must be explicitly labelled as ventilation. A general cavity gap is not automatically ventilation. |
| Site connections | water, power and drain zones, reach and limits | Connection evidence may block Verified Fit even when closed dimensions pass. |
| Documents | product page, manual, installation guide, QRG and CAD | Retain revision, withdrawal and supersession signals with the URL. |

Every accepted field retains its original value and unit, normalized value, source URL, content hash, retrieval time, applicable models, identity outcome and scope. Unknown values remain unknown; zero is never inferred from absence.

## Rights Contract

Rights are bound to `providerId + sourceId + fieldId + actionId`. A general relationship, login or data download does not grant all actions.

The independently recorded actions are:

- caching the original source;
- caching normalized factual fields;
- public display;
- quoting excerpts;
- linking documents;
- attribution requirements;
- retaining an audit copy;
- deletion or withdrawal obligations.

The default is `unknown_blocked`. Only written terms or a clearly applicable published licence can change an action to `granted` or `granted_with_conditions`. Withdrawal, expiry or deletion obligations never silently fall back to an earlier grant.

## Evidence and Fit Rules

- Family manuals remain quarantined until exact model membership is proven.
- Variant suffixes require exact evidence or a receipt-bound alias decision.
- Axis order must be explicit or unambiguous in a labelled table or diagram.
- Product, package, cavity, installation and operation scopes never share a field implicitly.
- One failed applicable hard condition produces `NO_FIT`.
- An unknown applicable hard condition produces `INSUFFICIENT_DATA`.
- Passing geometry with unresolved service or operation conditions produces `CONDITIONAL_FIT`.
- `VERIFIED_FIT` requires exact-model evidence for every applicable hard condition.
- Numeric scores can rank products within a Fit class but cannot override a hard condition.

## Provider Intake

Provider files enter quarantine first. Before catalog use they must pass rights confirmation, exact Australian identity, field normalization, conflict checks and receipt issuance. The state machine in the active brand-data plan remains authoritative; this dictionary defines the field and rights payload carried through that state machine.
