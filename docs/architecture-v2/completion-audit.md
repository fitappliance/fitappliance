# Architecture V2 Completion Audit

Status: Phase 1-7 remediation complete; Phase 8-9 production verified
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
| 4 | Migrate legacy approvals | Pilot complete | 10 approved, 3 reviewed and 1,992 quarantined documents after the first 20-model field review |
| 4 | Replace brand-specific resolver entry points | Complete at shared gate | All batch resolver results pass through the common source-result contract; brand discovery remains adapter-specific |
| 5 | Category/form-factor geometry contracts | Complete | Installation, operation, service and delivery are separate; top/front opening and WashTower contracts differ |
| 5 | Approved clearance migration | Pilot complete | Five products have partial V2 space evidence: 16 installation and 2 operation fields; unknown fields remain null |
| 5 | Full semantic parity | Partial | Impossible-value audit is clean; only two operation fields and no service/delivery fields are approved |
| 6 | Legacy width parity | Complete | Historical parity evidence retained; browser/domain FitDecision contract is tested directly |
| 6 | Production FitDecision cutover | Complete | Browser results expose explicit V2 outcomes and reject `NO_FIT` |
| 6 | Mobile/desktop browser QA | Complete | Deployed desktop, zero-result and 390x844 mobile flows passed with zero final console errors |
| 7 | Stable public projection | Complete | Production marker reports one 3,520-product V2 projection; 21 invalid/ambiguous rows are quarantined |
| 7 | All generators/browser use canonical view | Complete | Browser, category, product, retailer and audit jobs use the same projection |
| 7 | Legacy deletion | Complete | Snapshot, selector, dual projection and runtime switch removed with owner approval; historical mappings retained |

## Current hard gates

1. V2 cannot claim Verified Fit from the current pilot: five products have partial space evidence, but required installation, operation or service fields remain unknown.
2. Legacy resolver deletion is unsafe until every active manufacturer adapter
   is routed through the common document contract.
3. Automated public retailer collection remains disabled where terms/path
   review is unresolved or access is denied.

## Phase 7 production evidence

- Deployment commit: `7381c96d`.
- Marker: schema 2, V2 active, 3,520 products, no rollback projection.
- Desktop: 900 x 1900 x 800 fridge search returned 27 results with zero
  browser console errors.
- Mobile: 390 x 844 viewport returned results with no horizontal overflow.
- Quarantined WHE6200SA page returns 404; newly generated comparison route
  returns 200.
- Sentinel: 30 URLs checked with zero failures; 28,676 links checked with zero
  broken links; 2,331 pages and zero indexable orphans.

## Phase 8 evidence pilot

The first field-level pilot is production verified: 20 documents, 60 candidate
dimension fields, 36 approvals, 24 quarantines, ten complete dimensions-only
documents and zero approved installation-clearance fields. The detailed sample
decisions and production checks are recorded in
[`phase8-evidence-pilot-report.md`](./phase8-evidence-pilot-report.md).

## Phase 9 space evidence pilot

Ten complete-dimension documents were audited for installation, operation and
service space. Five models produced 18 approved fields; five produced explicit
no-candidate outcomes. The public projection now contains `geometry_v2` with
unknowns preserved as `null`, and no V2 product was promoted to Verified Fit.
See [`phase9-space-evidence-pilot-report.md`](./phase9-space-evidence-pilot-report.md).
