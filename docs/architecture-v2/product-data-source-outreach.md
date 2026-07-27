# Product Data Source and Brand Outreach Package

**Date:** 2026-07-12
**Status:** Active pilot; two organization requests sent, six reviewed drafts ready, no commercial provider purchased
**Execution plan:** [Brand Data and PDF Yield Program](../superpowers/plans/2026-07-27-brand-data-and-pdf-yield-program.md)

This document records source and outreach research. The linked execution plan is the canonical task order, dependency gate, and recovery checkpoint for the active program.

The official route inventory is machine-readable in
`data/architecture-v2/policies/brand-data-contact-matrix.json`. Full message bodies,
recipient details, replies and provider files remain in the private external outreach
store. The Git-safe ledger records only organization metadata, public route URLs,
states and content hashes.

As of 2026-07-27, Fisher & Paykel Australia and Electrolux Home Products have been
contacted. Organization-specific drafts for Residentia Group, LG Electronics Australia,
Hisense Australia, Smeg Australia, Miele Australia and CHiQ Australia have passed the
private draft audit. A `draft_ready` state does not mean the message was sent.

## Current Source Decision

| Channel | Current decision | Measured or verified reason |
| --- | --- | --- |
| Energy Rating | Adopt for immutable shadow snapshots | Current fridge and dishwasher CSVs are publicly downloadable under CC BY 3.0 AU. They improve Australian identity coverage but contain real axis and dimension errors, so dimensions remain candidate observations. |
| WELS | Adopt for dishwasher identity/status shadow | The public register exposes a complete overnight CSV. In the frozen 50-dishwasher pilot, 42 models match a current Registered identity, 4 match only Expired records, 3 have identity conflicts and 1 has no exact match. WELS supplies no installation geometry. |
| EESS | Research on demand | Useful for responsible supplier and electrical registration corroboration; no product geometry is expected. |
| GS1 Australia NPC | Request sample and terms | GS1 confirms product names, GTINs, descriptions, dimensions and images are available through supplier/retailer data exchange. It does not establish that the target AU appliance models or installation clearances are available to FitAppliance under acceptable display rights. |
| Open Icecat | Probe after registration | Open Icecat is free and brand-authorized for sponsoring brands, with structured XML/CSV/JSON/HTML and manuals. Exact AU model-suffix coverage is unmeasured. |
| Full Icecat | Do not purchase yet | Current published entry pricing starts around EUR 375 per month. Headline catalogue size does not prove exact AU appliance coverage or installation-field quality. |
| Direct manufacturer trade/PIM | Prioritize | Fisher & Paykel's AU Trade Resources prove that comprehensive dimensions, CAD and installation guides can be exposed through a trade/specification channel. Other pilot brands need official contact-route research. |

Official references:

- [Energy Rating registered appliance data](https://www.energyrating.gov.au/about-us/gems-regulator/registered-appliance-and-equipment-data)
- [Energy Rating dataset](https://data.gov.au/data/dataset/energy-rating-for-household-appliances)
- [WELS product search and complete export instructions](https://wels-public-register.environment.gov.au/search-all-products/)
- [WELS register help](https://wels-public-register.environment.gov.au/help/)
- [DCCEEW copyright terms](https://www.dcceew.gov.au/about/copyright)
- [GS1 Australia services](https://www.gs1au.org/services)
- [GS1 National Product Catalogue](https://www.gs1au.org/services/data-and-content/national-product-catalogue)
- [Icecat content-user formats and coverage](https://icecat.com/structured-data-content-users/)
- [Icecat content-user pricing](https://icecat.com/pricing-content-users/)
- [Fisher & Paykel AU Trade Resources](https://www.fisherpaykel.com/au/trade-resources)

## Provider Sample Request

Before any GS1 or Icecat contract, send the frozen pilot's 100 exact brand/model pairs and request a machine-readable result with:

- exact matched product ID, GTIN and AU market/sales status;
- matched input model string and provider model string;
- product W/H/D, package W/H/D and a field definition for every axis;
- manual, installation guide, QRG, CAD and product-page URLs;
- update timestamp, deletion/supersession signal and replacement model;
- field-level source/brand authorization;
- rights to cache factual values, display them publicly, retain audit snapshots and show attribution;
- price, rate limits, refresh method and termination/deletion obligations.

Reject the sample if suffixes are silently collapsed, product and package dimensions are mixed, AU market identity is absent, or rights are described only as general catalogue access.

## Manufacturer Data Request

**Subject:** Australian appliance installation data for FitAppliance

Hello,

FitAppliance helps Australian shoppers check whether a refrigerator or dishwasher is likely to fit their measured space before they visit a retailer. We are building the service around exact model numbers and source-backed installation requirements, not generic brand estimates.

Could your product data, e-commerce, trade/specification or PIM team help us with a current Australian data export or feed? CSV, JSON, XML or a documented API would all work. For each model, we are looking for the exact AU model code and GTIN, sale/discontinued status, product and packaged dimensions, adjustable ranges, installation clearances, door or drawer opening space, ventilation, water/power/drain connection requirements, and links to current installation guides, quick-reference sheets and CAD files.

We would also like to confirm what factual fields and document links we may cache and display, the attribution you require, and how updates or withdrawals are communicated. We keep source hashes and field-level provenance so conflicting or superseded data can be isolated rather than published automatically.

The initial validation set is small and can be supplied as an exact model list. Please direct this request to the team that owns Australian product master or trade specification data.

Regards,

Jagger Zhang<br>
FitAppliance<br>
https://www.fitappliance.com.au/

## Operating Rules

- Do not claim a partnership until a brand or provider confirms it in writing.
- Do not send the full request to generic consumer support repeatedly. Ask for the owning data team once, then record the response or terminal route.
- Do not attach private retailer feeds or unrelated user data.
- Do not accept a family-level export as exact-SKU evidence without explicit model membership and field equivalence.
- Store replies, rights, sample hashes and effective dates as source-governance evidence; never put personal contact details or credentials in public repository artifacts.
- A successful provider match creates candidates. Exact official installation evidence still controls installation geometry and Fit publication.
