# Architecture V2 Completion Audit

Status: incomplete; production cutover not authorised
Last audited: 2026-07-11

This document is the requirement-by-requirement truth source. A green unit test
does not change an item to complete unless the named runtime or data artifact
also exists.

| Phase | Requirement | Status | Current evidence / remaining work |
| --- | --- | --- | --- |
| 1 | Alias decision system | Complete | Nine pending decisions, zero approvals; Tier A/Tier B gates in `model-alias.mjs` |
| 1 | Resolve quarantine | Incomplete by evidence | Nine products remain quarantined; no target has met Tier A or Tier B |
| 2 | Canonical identity and reversible mapping | Complete in shadow | 2,259 mappings and nine quarantine records in `canonical-registry.json` |
| 2 | Collision/rename migration | Partial | Collision fixtures exist; reviewed rename/merge override is not implemented |
| 3 | Immutable retailer observation ledger | Complete in shadow | 183 migrated observations; outage-safe reconciliation and lifecycle transitions tested |
| 3 | Live major-retailer collection | Partial | TGG Partnerize is authorised; Bing Lee is historical-only; AO/HN/JB remain disabled pending terms review |
| 3 | Reproducible raw collection | Partial | New adapter requires raw hash/reference; historical raw payloads cannot be reconstructed |
| 4 | PDF state machine and common adapter contract | Complete in shadow | Payload signature, lifecycle, hash dedup links, identity and controlled OCR contracts exist |
| 4 | Migrate legacy approvals | Incomplete by evidence | 2,005 legacy documents quarantined; zero meet complete V2 page/quote/hash/parser provenance |
| 4 | Replace brand-specific resolver entry points | Partial | Common contract exists; legacy brand scripts have not all been routed through it |
| 5 | Category/form-factor geometry contracts | Complete in shadow | Installation, operation, service and delivery are separate; top/front opening differs |
| 5 | Approved clearance migration | Complete but empty | Evidence-only migrator ran; 0/2,268 products have V2-approved installation evidence |
| 5 | Full semantic parity | Partial | Impossible-value audit is clean; operation/service/delivery parity awaits approved data |
| 6 | Legacy width parity | Complete | 18,144 comparisons, zero mismatches |
| 6 | Production FitDecision cutover | Not started | Requires owner approval, feature wiring, deploy and browser QA |
| 6 | Mobile/desktop browser QA | Not started | Must run against deployed V2 flag, not legacy screenshots |
| 7 | Stable public projection | Complete in shadow | 2,259-product V2 projection generated with legacy URL identity |
| 7 | All generators/browser use one projection | Not started | Requires Phase 6 cutover approval |
| 7 | Legacy deletion | Not started | Requires successful rollback window and no severity-1 data issue |

## Current hard gates

1. Owner approval is required before public behavior changes.
2. V2 cannot claim Verified Fit while the approved document count is zero.
3. Legacy resolver deletion is unsafe until every active manufacturer adapter
   is routed through the common document contract.
4. Automated public retailer collection remains disabled where terms/path
   review is unresolved or access is denied.
