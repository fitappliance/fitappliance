# Brand Data and PDF Yield Program

**Created:** 2026-07-27

**Status:** WP0-WP10 execution checkpoint complete; WP11 and WP12 await replies and the Day-14 gate

**Owner:** FitAppliance

**Canonical outreach address:** `hello@fitappliance.com.au`

## Objective

Determine which source strategy adds the most exact-Australian-model, field-level evidence per engineering hour without weakening Fit publication safety:

1. official manufacturer, GS1, and government structured data; and
2. reusable PDF document-family parsing improvements.

The program is complete only when both tracks have comparable measured outputs. Download success, parsed text, or a brand reply alone is not success. The primary unit is a receipt-bound field that survives identity, rights, conflict, replay, and publication-isolation checks.

## Current Truth Snapshot

As of the 2026-07-27 execution checkpoint:

- `data/architecture-v2/reviews/automated/brand-data-outreach-queue.json` contains a frozen 100-model pilot across 12 brands.
- The queue has one confirmed official trade route and 11 brands requiring contact-route research.
- Brevo preserved `From: hello@fitappliance.com.au`; SPF, aligned DKIM and DMARC passed in the delivered original-message audit.
- Eight deduplicated organization requests covering all 13 target brands were sent and captured as private EML objects. The Git-safe ledger contains only public organization metadata, lifecycle state and hashes.
- WP7A terminated all 100 frozen acquisition attempts: 57 exact-model official PDFs were integrity-checked and MinerU-indexed, while 43 attempts ended in typed acquisition or identity failures.
- The frozen parser replay now yields 33 complete three-axis samples, up from 29 before WP10. Parser grammar gaps fell from 11 to 7.
- Four eligible real document variants were repaired: LG washer exact-model W/D/H suffix rows, LG refrigerator audited A/B/C diagrams, Beko dishwasher truncated-label cards and Esatto physical-versus-packaged product cards.
- The apparent fifth high-yield target is a Westinghouse official error-payload PDF. It is classified as `SOURCE_CONTENT_ERROR`, not repaired by weakening parser rules.
- Every WP7A and WP8 sample remains `publicationEligible: false`. No catalog record or FitDecision was promoted.
- Existing local changes in the worktree are user-owned and must not be reverted or folded into this program accidentally.

## Dependency Order

```text
freeze baseline
  -> prepare sample, field dictionary, storage, contacts, and drafts
  -> run PDF failure baseline in parallel
  -> pass outbound email authentication gate
  -> send organization-level requests
  -> ingest replies through Evidence Broker
  -> implement only high-yield PDF family rules
  -> compare receipt yield, rights, coverage, and engineering cost
  -> choose next investment allocation
```

Calendar-based outreach timing starts only after the outbound authentication gate passes. Waiting for DNS does not block preparation or the PDF baseline.

## Work Packages

| ID | Work package | Depends on | Primary capability | Durable output | Status |
| --- | --- | --- | --- | --- | --- |
| WP0 | Freeze objectives, baseline, and recovery protocol | none | CodeGraph + planning | this file | complete |
| WP1 | Authenticate outbound brand email | DNS propagation | Chrome + Gmail/Brevo header audit | private test message and checkpoint only | complete |
| WP2 | Export frozen 100-model validation sample | WP0 | data-quality analysis | generated CSV + manifest hash | complete |
| WP3 | Publish field and rights dictionary | WP0 | architecture review | `docs/architecture-v2/product-data-field-dictionary.md` | complete |
| WP4 | Establish private outreach evidence storage | WP0 | repository/data-governance review | external private directory + Git-safe ledger | complete |
| WP5 | Research and deduplicate official contact routes | WP0 | official web research / Agent Reach fallback | organization contact matrix with source URLs | complete |
| WP6 | Tailor and humanize organization-level drafts | WP2, WP3, WP5 | humanizer + evidence review | private draft set + body and file hashes | complete |
| WP7 | Run stratified 100-PDF failure baseline | WP0 | MinerU PDF skill + data-quality audit | frozen sample and baseline report | complete |
| WP7A | Acquire, validate and content-address the frozen 100 PDF candidates | WP7 | bounded official acquisition + PDF integrity checks | immutable PDF objects and rerun baseline | complete: 57 indexed, 43 typed stops |
| WP8 | Prioritize top five confirmed PDF document families | WP7A | metric diagnostics | ranked family backlog | complete: four grammar gaps; fifth is source error |
| WP9 | Send first organization requests | WP1, WP2, WP3, WP4, WP6 | Gmail | private sent messages + Git-safe status hashes | complete: 8 organization threads sent |
| WP10 | Implement reusable parser rules with TDD | WP8 | TDD + MinerU + replay audit | tests, parser changes, receipts | complete for four eligible variants; publication remains blocked |
| WP11 | Ingest and validate provider responses | WP9 | Evidence Broker + data quality | quarantined source objects and receipts | pending |
| WP12 | Day-14 investment decision | WP10, WP11 | product/business analysis | decision record and next allocation | pending |

## Phase 1: Work That Proceeds While Email Is Gated

### 1. Export the frozen validation sample

Use the existing 100 products in the outreach queue. Do not select a second competing sample.

Required columns:

- canonical product ID and legacy runtime ID;
- category, canonical brand, exact AU model and known GTIN;
- current/discontinued/unknown market state;
- current product W/H/D and evidence level;
- missing installation fields;
- official product page, manual, installation guide, QRG, and CAD URL slots;
- source receipt IDs and conflict state.

The export must include a manifest with row count, schema version, source file hashes, generation command, and SHA-256 of the CSV. Do not include Partnerize feed URLs or credentials.

Acceptance:

- exactly 100 unique canonical products;
- no silent model-suffix normalization;
- the frozen outreach scope remains exactly 50 refrigerators and 50 dishwashers;
- washing machines and dryers are not silently added to WP2; four-category coverage belongs to the independent WP7 PDF baseline;
- deterministic regeneration produces the same content hash when inputs are unchanged.

Completed result (2026-07-27):

- 100 unique rows: 50 refrigerators and 50 dishwashers;
- 7 receipt-bound dimension rows and 93 explicitly labelled catalog hints;
- 31 unresolved conflict rows remain visible rather than being silently reconciled;
- zero Partnerize, private-feed, SMTP, API-key, or password strings in the export;
- CSV SHA-256: `a33627be2502ce8b87b3bd5950542a5ced47597237dc096f4b6f971db247b55f`;
- manifest SHA-256: `67d095ff3261ad84c56c86e6b514baf2c14cb1811442323af51bb1c3a81a5568`;
- deterministic rebuild, focused tests, 350 architecture tests, 1,968 repository tests, lint, and schema validation passed.

### 2. Create the product data field and rights dictionary

Define each requested field independently. At minimum:

- exact AU identity, GTIN and variant/suffix;
- current/discontinued state and replacement model;
- closed product envelope;
- packaged/delivery envelope;
- adjustable ranges;
- installation clearances;
- operation envelope for doors, drawers and lids;
- ventilation;
- water, power and drain connection zones, reach and constraints;
- document/CAD URLs, revision date, withdrawal and supersession signals;
- cache, public display, quotation, attribution, retention and deletion rights.

Every geometry field must define axis, unit, range semantics, product/package/cavity scope, and whether it is a hard Fit condition. Unknown must remain unknown.

### 3. Establish private outreach evidence storage

Use the configured external evidence root. Do not hardcode a mounted-volume display name in code or documentation.

Private storage contains:

- contact names and direct addresses;
- sent and received MIME messages;
- attachments and provider samples;
- rights language, contracts, quotes and commercial terms;
- full message bodies and verification records.

Git may contain only:

- organization and covered brands;
- lifecycle state and dates;
- source URL proving the public contact route;
- body/attachment hashes;
- non-personal response classification;
- next action and terminal reason.

Before sending, verify `.gitignore` and the architecture path resolver cannot project private outreach artifacts into `public/`, generated catalog data, or commits.

### 4. Research official organization-level routes

Deduplicate by data owner, not by consumer brand:

- Fisher & Paykel Australia: Fisher & Paykel and Haier;
- Electrolux Home Products: Electrolux and Westinghouse;
- Residentia Group: Sôlt, Esatto, InAlto and MyKin;
- LG Australia;
- Hisense Australia;
- Smeg Australia;
- Miele Australia;
- CHiQ Australia.

Prefer official trade, design-support, PIM, e-commerce, technical-publication, developer, or media-data routes. A consumer support form is a routing fallback, not evidence that the data-owning team was reached.

Each route requires an official source URL, organization ownership evidence, route type, covered brands, research date, and confidence. Never infer an email-address pattern.

### 5. Prepare organization-specific drafts

Each draft must state:

- the exact covered brands and Australian model scope;
- the 20-model initial validation offer;
- requested formats: CSV, Excel, JSON, XML, API, or stable export;
- required technical fields and document links;
- rights, update, withdrawal and attribution questions;
- FitAppliance's field-level provenance and conflict isolation;
- website, canonical email, and ABN.

Do not attach large PDFs. Attach or link only the small validation CSV after its hash and content have been reviewed. Humanize wording without weakening technical precision or inventing a partnership.

### 6. Run the 100-PDF baseline before changing parsers

Freeze 25 PDFs per appliance category across:

- native tables;
- scanned tables;
- multi-model/family manuals;
- adjustable ranges;
- diagram-only dimensions;
- mixed axis order;
- `D`, `D'`, and `D"` operation-depth variants;
- filename, cover, and target-SKU suffix conflicts.

Every failure receives exactly one primary failed layer and optional secondary causes:

1. acquisition;
2. PDF integrity/rendering;
3. MinerU structure;
4. page/table association;
5. exact model identity;
6. dimension semantics;
7. range/operation-envelope representation;
8. evidence conflict;
9. receipt binding;
10. publication isolation.

Record the baseline before implementing fixes. A family is eligible for a shared parser rule only when one change is projected to recover at least 10 exact-model receipts.

## Phase 2: Outbound Email Authentication Gate

Do not send brand or provider messages until one test email satisfies all checks:

- visible and RFC5322 From are `FitAppliance <hello@fitappliance.com.au>`;
- Brevo does not rewrite From to `brevosend.com`;
- SPF passes;
- DKIM passes with a signing identity aligned to `fitappliance.com.au`;
- DMARC passes for `header.from=fitappliance.com.au`;
- Reply-To is `hello@fitappliance.com.au`;
- the message is delivered without a Brevo sender/domain error.

When DNS caches expire:

1. re-run public and authoritative DNS checks;
2. click Brevo domain authentication;
3. resend one self-test;
4. inspect Gmail's original message;
5. record only pass/fail, timestamp, and message hash in the Git-safe ledger.

## Phase 3: Outreach Execution

`T+0` begins when Phase 2 passes.

Authentication gate result (2026-07-27):

- Brevo reports `fitappliance.com.au` as authenticated;
- the delivered self-test preserved `From: hello@fitappliance.com.au`;
- SPF passed;
- DKIM passed with signing domain `fitappliance.com.au` and selector `brevo2`;
- DMARC passed with `header.from=fitappliance.com.au`.

Eight organization-level requests were then sent without attachments:

| Organization thread | State | Subject SHA-256 | Body SHA-256 |
| --- | --- | --- | --- |
| Fisher & Paykel / Haier | sent | `750e4f00c67bc18aeef99c47f7ee5af55f485b944d7d2442fa038ef04ebe79e3` | `f4a59d46c5c046ae888400093adc3340187a8b0b31e51c105a037fb2465a25bf` |
| Electrolux / Westinghouse | sent | `8c00ef74b618dc85bb12ddb0a8058f88322591d30b66bb81188db5e83faa944e` | `8810735be54827d5eaed6539bcced19ceabdbb39913ec46f00e483e9a866f663` |
| Residentia Group | sent | `ecdaef7579af1f51a8d1d981a1cb770c7b2abd7f5ed13360317acc01f3281f72` | `a4aaed29f206133766068fc4add1c0471d3e30834c4f39cfa8ffaed8dfbd8aa9` |
| LG Electronics Australia | sent | `c8470eda4e21b58d345fd67d058ba868c894e43295b332c703381561aa250b75` | `5502bb730f2a104efb9a69bcd8ef9486e6e78c843cb900600c7b7a546c5080da` |
| Hisense Australia | sent | `548ef0218dfb762ae942e88a36b4f5acbf3269c9b9a3ebe76a4883080a1eb7fc` | `95cd93e4350ba357725f57e03b04266f832baa94a419cbb885aba1fcdfd04943` |
| Smeg Australia | sent | `e4f02bae4d7fb12718cedbc05faeafbfccd77452fed635505cec0c026e2de3fb` | `8733fa87131d12a64d540ab53e5ec4077af3f1df690da8e57e7d3a88276b83dc` |
| Miele Australia | sent | `5b9620db6cc9383f449a71381e2c87fcf0bd1e582d084d5e12bbb784e20e7d3a` | `d9f75af07878fdbaabbd92dd4cef393962af2f173733519161121a65ad99b698` |
| CHiQ Australia | sent | `f8ebe158c353ad42404c935fe47dfe0d6bc5ecccd8d77df523de27f6346ea653` | `3356ebe13fe306b82f95425b4a4f2a92a3501fde5e377ddbfe58457972fcb9c7` |

All eight EML object hashes and byte sizes are recorded in the Git-safe ledger and verified against the private evidence store. First follow-up is due 2026-08-01 and final follow-up is due 2026-08-06 only when no human response exists.

- `T+0`: send one tailored request per data-owning organization;
- `T+5 days`: one concise follow-up only where no human response exists;
- `T+10 days`: final follow-up;
- after the final follow-up: mark `NO_RESPONSE_TERMINAL` and stop.

Do not create multiple threads for brands owned by the same organization. Do not claim a partnership. Do not expose retailer feeds or private user data.

The agent may send approved data requests and at most two follow-ups, answer factual technical questions, and provide the reviewed model sample. Separate user approval is required before:

- signing an NDA, contract, data licence or data-processing terms;
- purchasing GS1, Icecat or another commercial source;
- accepting attribution, exclusivity, deletion, audit, indemnity or service obligations;
- sharing Partnerize or other private retailer data;
- making a partnership or endorsement commitment.

## Phase 4: Response Acceptance Pipeline

No external file directly updates the catalog. The required state machine is:

```text
RECEIVED
  -> RIGHTS_CONFIRMED
  -> EXACT_AU_IDENTITY
  -> FIELD_NORMALIZED
  -> CONFLICT_CHECKED
  -> RECEIPT_ISSUED
  -> SHADOW_ACCEPTED
  -> eligible for normal publication review
```

Each accepted field retains original value, unit, axis definition, scope, applicable model, revision, source hash, rights scope and receipt binding. Family data, silent suffix collapse, or unresolved product/package mixing remains quarantined.

## Phase 5: PDF Family Improvements

Rank families by expected recovered exact-model receipts divided by engineering hours. Implement only the top five eligible families initially.

Each rule requires:

- a focused failing test first;
- positive fixtures from the family;
- dangerous counterexamples from another series or axis order;
- exact-model and regional-suffix checks;
- MinerU `content_list_v2` provenance;
- replay of the existing receipt corpus;
- publication-isolation tests;
- zero automatic promotion to Verified Fit from dimensions alone.

Two consecutive executions with zero new valid receipts trigger a typed stop. The next epoch must change acquisition, family identification, or parser capability before retrying.

### WP7A and WP10 execution checkpoint

The immutable WP7A artifact is
`data/architecture-v2/reviews/automated/pdf-failure-baseline-100-wp7a.json`
with SHA-256
`6050a0ee7f0cf0ab7198d8993e47b54b704aaa371b439a83e3a8d3837fa3b169`.
All 100 frozen attempts reached a terminal state:

| Acquisition outcome | Samples |
| --- | ---: |
| MinerU indexed | 57 |
| Official candidate not found | 37 |
| Transport failed | 5 |
| Exact-model identity unproven | 1 |

The post-repair WP8 replay is
`data/architecture-v2/reviews/automated/pdf-failure-baseline-100-wp8-replay.json`
with SHA-256
`eaccf44053faba67ed7e747615cb6ef6eeb4ac291f72c5b906f25880abcefefe`.
It re-hashes both PDF and MinerU objects before parsing.

| Variant | Representative exact model | Result | Publication boundary |
| --- | --- | --- | --- |
| `lg-au-washer-exact-model-size-wdh-v1` | `WF-T8582` | W/D/H suffix row recovered | one frozen receipt candidate; shared rule blocked |
| `lg-au-fridge-a-b-c-dimension-diagram-v1` | `GS-V600MBLC` | audited A/B/C mapped to W/H/closed D | all 15 declared manual models pass parser canaries; no receipt issuance |
| `beko_au_dishwasher_product_spec_truncated_labels_v1` | `BDF1410X` | explicit unpackaged labels recovered; unlabeled packaged tail excluded | one frozen receipt candidate; shared rule blocked |
| `esatto-au-product-card-physical-wdh-v1` | `ETLW55` | Physical W/D/H recovered; Packaged tuple excluded | one frozen receipt candidate; shared rule blocked |
| Westinghouse error-payload source | `WHE6874BA` | `SOURCE_CONTENT_ERROR` typed stop | parser relaxation prohibited |

Frozen replay outcomes changed from 29 to 33 complete three-axis samples and from
11 to 7 parser grammar gaps. Remaining outcomes are 43 acquisition unavailable,
12 identity-scope failures, 2 MinerU structure failures, 2 partial-axis samples and
1 source-content error. The four repairs remain dimensions-only research results:
`publicationEligible` is zero, no acceptance receipt was issued, and Verified Fit remains zero.

## Decision Gate

Continue expanding structured/provider acquisition only if the sample demonstrates:

- at least 80% exact AU model matching;
- at least 70% W/H/D coverage;
- no silent suffix collapse;
- explicit cache/display/attribution rights;
- an update and withdrawal mechanism.

Continue investing in a PDF family only if:

- each shared rule adds at least 10 valid receipts;
- existing receipt replay remains green;
- no Fit-level promotion error occurs;
- no quarantined or private data reaches the public projection.

At the decision point, compare:

- exact-model receipts gained;
- installation fields gained;
- rights-confirmed models;
- conflicts and false accepts;
- engineering/contact hours;
- elapsed time and recurring cost.

The output is a written allocation decision, not an automatic purchase or contract.

## Verification Commands

Use the narrowest relevant checks first, then the repository gates for changed behavior:

```bash
npm run build:brand-outreach-queue
npm run audit:pdf-json-first
npm run audit:historical-mineru
npm run audit:evidence-resolution
npm run test:architecture-v2
npm run validate-schema
```

Do not run a generator against production/public paths until its output and diff are understood in an isolated worktree or shadow directory.

## Long-Task Recovery Protocol

Before every execution session:

1. read this file;
2. read `git status --short --branch` and preserve unrelated changes;
3. identify the first incomplete work package whose dependencies are complete;
4. record the input hashes and intended output before running it;
5. perform one coherent work package;
6. run its focused verification;
7. update the checkpoint below before starting another package.

Never skip ahead because a downstream task is easier. Never mark a work package complete from a script exit code alone.

## Checkpoint

**Last updated:** 2026-07-27

**Last completed:** WP7, including WP3-WP6 dependencies, official contact matrix, private draft fingerprints and a deterministic 100-PDF failure baseline

**Active blocker:** parser-family ranking is blocked because 95 of the 100 frozen candidates do not yet have an immutable PDF object; URL path hints are not document-structure evidence

**Next executable without email:** WP7A, acquire, validate and content-address the frozen 100 candidates, then rerun the unchanged failure classifier

**Parallel next executable:** WP9 can continue with the six `draft_ready` organizations; WP11 remains response-driven

**External-message state:** two organization-level requests sent; six organization-specific drafts are validated and byte-bound in private storage; no attachment or private feed data included

**Verification at checkpoint:** `npm test` 1,987/1,987 passing; Architecture V2 369/369 passing; schema validation 2,334 pages, 6,522 blocks, 0 errors; six private draft files match their Git-safe hashes and are mode `0600`; PDF baseline SHA-256 `adce6cbaad3e212e9f4f0535406cde8dfadf47aa59f7c1f0b23e536e24ab67cc`

**Do not do next:** infer scanned/table/family layouts from filenames, or implement shared parser rules before WP7A exposes confirmed MinerU document structures
