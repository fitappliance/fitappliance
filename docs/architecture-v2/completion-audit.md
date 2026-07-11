# Architecture V2 Completion Audit

Status: cutover authorised; deployment and rollback window incomplete
Last audited: 2026-07-11

This document is the requirement-by-requirement truth source. A green unit test
does not change an item to complete unless the named runtime or data artifact
also exists.

| Phase | Requirement | Status | Current evidence / remaining work |
| --- | --- | --- | --- |
| 1 | Alias decision system | Complete | Nine pending decisions, zero approvals; Tier A/Tier B gates in `model-alias.mjs` |
| 1 | Resolve quarantine | Incomplete by evidence | Nine products remain quarantined; no target has met Tier A or Tier B |
| 2 | Canonical identity and reversible mapping | Complete | 3,593 mappings and ten quarantine records in `canonical-registry.json` |
| 2 | Collision/rename migration | Complete | Reviewed rename/merge decisions are supported; empty decision artifact records no approved merges |
| 3 | Immutable retailer observation ledger | Complete in shadow | 183 migrated observations; outage-safe reconciliation and lifecycle transitions tested |
| 3 | Live major-retailer collection | Partial | TGG Partnerize is authorised; Bing Lee is historical-only; AO/HN/JB remain disabled pending terms review |
| 3 | Reproducible raw collection | Partial | New adapter requires raw hash/reference; historical raw payloads cannot be reconstructed |
| 4 | PDF state machine and common adapter contract | Complete in shadow | Payload signature, lifecycle, hash dedup links, identity and controlled OCR contracts exist |
| 4 | Migrate legacy approvals | Incomplete by evidence | 2,005 legacy documents quarantined; zero meet complete V2 page/quote/hash/parser provenance |
| 4 | Replace brand-specific resolver entry points | Complete at shared gate | All batch resolver results pass through the common source-result contract; brand discovery remains adapter-specific |
| 5 | Category/form-factor geometry contracts | Complete in shadow | Installation, operation, service and delivery are separate; top/front opening differs |
| 5 | Approved clearance migration | Complete but empty | Evidence-only migrator ran; 0/2,268 products have V2-approved installation evidence |
| 5 | Full semantic parity | Partial | Impossible-value audit is clean; operation/service/delivery parity awaits approved data |
| 6 | Legacy width parity | Complete | 18,144 comparisons, zero mismatches |
| 6 | Production FitDecision cutover | In progress | Owner approved; V2 is build default, with deploy and browser QA pending |
| 6 | Mobile/desktop browser QA | Not started | Must run against deployed V2 flag, not legacy screenshots |
| 7 | Stable public projection | Complete | Runtime view has 2,259 products; evidence-page view has 3,534 products and preserves legacy URL identity |
| 7 | All generators/browser use canonical views | Complete locally | Browser/category data uses runtime view; evidence pages use the explicit page view from the same registry |
| 7 | Legacy deletion | Not started | Requires successful rollback window and no severity-1 data issue |

## Current hard gates

1. Production deployment and browser QA must pass before starting the rollback observation window.
2. V2 cannot claim Verified Fit while the approved document count is zero.
3. Legacy resolver deletion is unsafe until every active manufacturer adapter
   is routed through the common document contract.
4. Automated public retailer collection remains disabled where terms/path
   review is unresolved or access is denied.
