# Architecture V2 Completion Audit

Status: Phase 7 implementation complete; production verification pending
Last audited: 2026-07-11

This document is the requirement-by-requirement truth source. A green unit test
does not change an item to complete unless the named runtime or data artifact
also exists.

| Phase | Requirement | Status | Current evidence / remaining work |
| --- | --- | --- | --- |
| 1 | Alias decision system | Complete | Nine pending decisions, zero approvals; Tier A/Tier B gates in `model-alias.mjs` |
| 1 | Resolve quarantine | Incomplete by evidence | Nine products remain quarantined; no target has met Tier A or Tier B |
| 2 | Canonical identity and reversible mapping | Complete | 3,520 active mappings; 3,593 historical mappings retained separately |
| 2 | Collision/rename migration | Complete | Reviewed rename/merge decisions are supported; empty decision artifact records no approved merges |
| 3 | Immutable retailer observation ledger | Complete in shadow | 183 migrated observations; outage-safe reconciliation and lifecycle transitions tested |
| 3 | Live major-retailer collection | Partial | TGG Partnerize is authorised; Bing Lee is historical-only; AO/HN/JB remain disabled pending terms review |
| 3 | Reproducible raw collection | Partial | New adapter requires raw hash/reference; historical raw payloads cannot be reconstructed |
| 4 | PDF state machine and common adapter contract | Complete in shadow | Payload signature, lifecycle, hash dedup links, identity and controlled OCR contracts exist |
| 4 | Migrate legacy approvals | Incomplete by evidence | 2,005 legacy documents quarantined; zero meet complete V2 page/quote/hash/parser provenance |
| 4 | Replace brand-specific resolver entry points | Complete at shared gate | All batch resolver results pass through the common source-result contract; brand discovery remains adapter-specific |
| 5 | Category/form-factor geometry contracts | Complete | Installation, operation, service and delivery are separate; top/front opening and WashTower contracts differ |
| 5 | Approved clearance migration | Complete but empty | Evidence-only migrator ran; 0/3,520 products have V2-approved installation evidence |
| 5 | Full semantic parity | Partial | Impossible-value audit is clean; operation/service/delivery parity awaits approved data |
| 6 | Legacy width parity | Complete | Historical parity evidence retained; browser/domain FitDecision contract is tested directly |
| 6 | Production FitDecision cutover | Complete | Browser results expose explicit V2 outcomes and reject `NO_FIT` |
| 6 | Mobile/desktop browser QA | Complete | Deployed desktop, zero-result and 390x844 mobile flows passed with zero final console errors |
| 7 | Stable public projection | Complete locally | One 3,520-product projection drives runtime and generated pages; 21 invalid/ambiguous rows are quarantined |
| 7 | All generators/browser use canonical view | Complete locally | Browser, category, product, retailer and audit jobs use the same projection |
| 7 | Legacy deletion | Complete locally | Snapshot, selector, dual projection and runtime switch removed with owner approval; historical mappings retained |

## Current hard gates

1. Deploy the Phase 7 single-projection build and repeat desktop/mobile and
   Sentinel production checks.
2. V2 cannot claim Verified Fit while the approved document count is zero.
3. Legacy resolver deletion is unsafe until every active manufacturer adapter
   is routed through the common document contract.
4. Automated public retailer collection remains disabled where terms/path
   review is unresolved or access is denied.
