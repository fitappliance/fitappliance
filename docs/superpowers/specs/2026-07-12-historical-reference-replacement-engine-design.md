# Historical Appliance Reference and Replacement Match Engine Design

## Purpose

FitAppliance has two separate user intents and must not evaluate them with one decision system:

1. **Cavity search** accepts measured household space and evaluates product geometry plus applicable installation requirements.
2. **Old-appliance replacement** accepts an old product identity or its outside dimensions and ranks current retail products by direct W/H/D similarity.

The official Australian registry is useful for the second intent even when a model has no current retailer listing. A historical model is an input reference, never a purchasable result and never evidence that a new product fits a cavity.

## Locked Invariants

1. Cavity mode continues to use `FitEngine` and its evidence-aware outcomes.
2. Replacement mode does not call `FitEngine.evaluateFit`, create a cavity, apply clearance, or emit `FitDecision` outcomes.
3. Historical and non-retail models may be searched as old appliances; replacement results must satisfy the existing current-retail invariant.
4. Sales lifecycle and dimension evidence are independent states.
5. Exact normalized brand + model identity is required before dimensions are attached. Model suffixes are not aliases.
6. Fuzzy or prefix matching may produce selectable suggestions but may not silently select or populate dimensions.
7. Old appliance dimensions are passed through unchanged. No fixed `10/20/10mm` or other synthetic buffer is added.
8. Registry dimensions remain candidate observations. Conflicts, likely axis errors and invalid dimensions fail closed.
9. Historical-only records do not receive product pages, affiliate links, offers, sitemap entries or structured Product data.
10. Normal build and deployment do not depend on the external storage volume.

## Global Data Order

```text
Source snapshot
  -> lossless source observation
  -> exact identity group
  -> retail lifecycle classification
  -> dimension evidence classification
  -> historical reference disposition
  -> category-split public lookup projection
  -> user-selected old model dimensions
  -> independent replacement comparison
  -> current retail results only
```

Identity is resolved before dimensions. Lifecycle is resolved before assigning input/output roles. UI integration occurs only after the reference projection and comparison engine are deterministic.

## Source and Storage Boundaries

- Energy Rating metadata and all four category CSV payloads are immutable SHA-256 objects under `FITAPPLIANCE_STORAGE_ROOT`.
- The repository stores source URL, licence, retrieval time, byte length, content hash, normalized identity records, dispositions and public lookup projections.
- Raw third-party CSV bytes remain outside Git.
- Repository-only audits replay committed manifests and projections without mounting the external drive.

The four categories are `fridge`, `dishwasher`, `dryer` and `washing_machine`. WELS remains a dishwasher identity/status source but does not control historical reference dimensions.

## Independent States

### Sales lifecycle

| State | Meaning |
| --- | --- |
| `CURRENT_RETAIL` | Exact catalog identity has `unavailable === false` and a verified product-page retailer link |
| `CATALOG_ARCHIVED` | Exact identity exists in the catalog but has no current retail eligibility |
| `REGISTRY_ONLY` | Exact registry identity is absent from the catalog |
| `UNKNOWN_RETAIL` | Source evidence cannot establish a current or archived retail state |

No state is called `DISCONTINUED` without an explicit official or retailer lifecycle source.

Registry market history is a separate field: `ACTIVE_AU`, `INACTIVE_AU`,
`MIXED_AU` or `NO_REGISTRY`. `Sold_in` naming Australia establishes historical
market scope; registry availability does not prove a current retailer listing.

### Dimension evidence

| State | Meaning | Lookup action |
| --- | --- | --- |
| `CATALOG_RECEIPT` | Exact receipt-bound catalog W/H/D is available; registry agreement or conflict is recorded separately | `AUTO_FILL` |
| `REGISTRY_CONSISTENT` | Exact registry group has one complete plausible W/H/D triplet | `CONFIRM_REQUIRED` |
| `IDENTITY_ONLY` | Exact identity exists but complete W/H/D does not | `MEASURE_REQUIRED` |
| `INTERNAL_CONFLICT` | Exact key has incompatible dimension triplets | `QUARANTINED` |
| `AXIS_SUSPECT` | Category geometry or corroborating evidence indicates likely axis inversion | `QUARANTINED` |
| `INVALID_DIMENSIONS` | Supplied numeric values are malformed, impossible or outside accepted bounds | `QUARANTINED` |

An `AUTO_FILL` record may populate the old dimensions immediately. A `CONFIRM_REQUIRED` record displays the exact source values in editable fields and requires an explicit user confirmation before replacement matching.

## Exact Identity Rules

- Group key: `category + registryBrandKey(brand) + registryModelKey(model)`.
- Cosmetic spacing, punctuation and case normalize; semantic suffixes remain part of the key.
- Same model code under different brands remains separate.
- Different raw identities collapsing to one normalized key are retained as variants and quarantined when their dimensions or category meaning conflict.
- Model-only input may auto-resolve only when exactly one eligible record in the selected category has that exact normalized model key.
- Brand + model input may auto-resolve only to the exact normalized pair.
- Prefix, substring and descriptive-name matches are suggestions requiring a user click.

## Public Projection

The authoritative generated document is:

`data/architecture-v2/generated/historical-appliance-reference.json`

The browser receives only category-split lookup files:

- `public/data/replacement-reference/fridges.json`
- `public/data/replacement-reference/dishwashers.json`
- `public/data/replacement-reference/dryers.json`
- `public/data/replacement-reference/washing-machines.json`
- `public/data/replacement-reference/meta.json`

Each row is minimal: stable reference ID, brand, model, non-duplicate public
aliases, W/H/D when allowed, lifecycle state, registry market state, evidence
state and lookup action. Category is supplied by the containing file and source
attribution is supplied once per document. Source-line receipts and hashes stay
in the private architecture artifact. Public rows contain no retailer links,
prices, Fit fields or affiliate metadata.

The homepage fetches one category file only after replacement mode is selected. Cavity mode never loads this index.

## Replacement Match Engine

For old dimensions `O` and current candidate dimensions `N`:

```text
deltaMm.axis = N.axis - O.axis
absoluteDeltaMm.axis = abs(deltaMm.axis)
maximumAbsoluteDeltaMm = max(absoluteDeltaMm.width, height, depth)
totalAbsoluteDeltaMm = sum(absoluteDeltaMm.width, height, depth)
normalizedDistance =
  0.40 * absoluteDeltaMm.width / O.width
  + 0.30 * absoluteDeltaMm.height / O.height
  + 0.30 * absoluteDeltaMm.depth / O.depth
```

Results sort by `maximumAbsoluteDeltaMm`, then `normalizedDistance`, then `totalAbsoluteDeltaMm`, then stable product identity. No candidate is hidden merely because one axis is slightly larger. The result exposes the signed difference on every axis and one relation:

- `IDENTICAL` when every delta is zero;
- `SAME_OR_SMALLER` when every delta is less than or equal to zero;
- `SAME_OR_LARGER` when every delta is greater than or equal to zero;
- `MIXED` otherwise.

Only current retail products with complete positive W/H/D are eligible outputs. Replacement results have `searchMode: "replacement"` and `replacementMatch`; they do not have `fitDecision`, `fitScore`, `requiredCavityMm` or clearance-derived ranking.

## User Flow

1. User selects **Old appliance** mode and a category.
2. The browser lazily loads that category's historical reference file.
3. User enters brand/model or selects a suggestion.
4. Exact and receipt-backed dimensions auto-fill; registry-only dimensions require confirmation; missing/conflicting dimensions direct the user to manual old-machine measurement.
5. Replacement engine ranks current products and shows signed W/H/D differences.
6. A separate action may copy the selected new product into cavity mode, but replacement ranking itself stays independent.

## Release and SEO Isolation

- Historical files inherit `/data/*` `X-Robots-Tag: noindex` headers.
- Historical identities never enter product-page generation, sitemap generation, comparison generation or schema generation.
- A repository audit checks that reference IDs do not create active catalog rows, retailer links, offers, Fit outcomes or public routes.
- A browser audit proves cavity mode does not request historical data and replacement mode returns only current retail products.

## Acceptance Gates

- Six immutable snapshots: Energy metadata, four Energy category CSVs and WELS.
- Every exact identity group has one deterministic lifecycle, evidence and lookup disposition.
- Conflict and axis canaries remain quarantined.
- Replacement tests prove zero calls to `FitEngine.evaluateFit`.
- Old dimensions pass through byte-for-byte as integers with no synthetic buffer.
- Public historical projection is category split, lazy loaded and non-indexed.
- Current public catalog hash and current cavity results do not drift unexpectedly.
- Full tests, lint, build, repository audit, production deployment and live browser flow pass.
