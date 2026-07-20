# Retailer Source Automation Review

## Decision scope

This review records the operational collection boundary for retail lifecycle
evidence. It does not grant, claim, or replace contractual permission or legal
advice. A source marked runnable is still restricted to the controls in
`data/architecture-v2/policies/retailer-source-policy.json` and may only produce
typed availability observations. It cannot authorize product identity,
dimensions, installation requirements, public visibility, or Fit status.

## Appliances Online exact-product source

Review date: 2026-07-20

Source policy ID: `appliances-online-product-api-v1`

The reviewed workflow starts from exact Appliances Online product URLs already
present in the bound FitAppliance catalogue. It extracts the product slug and
requests one matching product response. It does not use search pages, category
pages, sitemap expansion, or model discovery.

### External evidence reviewed

- `https://www.appliancesonline.com.au/robots.txt` returned HTTP 200. Its
  SHA-256 was
  `6182ec0bc41ff43cddc2d15a86d5f82bddb42c20c0eafcdbc596d5a3148fe65a`.
  The general user-agent rule disallowed `/checkout`; separate rules also
  disallowed selected bots and Bing search paths. This review does not treat a
  robots allowance as permission.
- `https://www.appliancesonline.com.au/article/trading-terms/` identifies itself
  as the Terms and Conditions of Sale between Appliances Online and purchasers.
  It does not document or expressly authorize this automated collection
  workflow. This absence is retained as an operational risk, not converted into
  an authorization claim.

### Bound canary

Run ID: `ao-canary-00-2026-07-20T163400Z`

Run SHA-256:
`e4646b7f209e15ed3c0bbd54757e9dff0590fb11f7906d07fe2f419043acdda5`

The immutable run contained 20 exact-product attempts: five refrigerators, five
dishwashers, five dryers, and five washing machines. All 20 completed without a
403, 429, identity mismatch, collection failure, or quarantine. Three responses
reported available and 17 reported unavailable. The result proves only that the
bounded collector and identity checks operated correctly for that sample.

### Operational controls

The source may run only when every control below is enforced by the signed plan
and runner:

1. Targets come from the current hash-bound refresh inventory and known exact
   product URLs.
2. Each immutable run contains at most 100 targets.
3. Maximum concurrency is one and the interval between attempts is at least
   1,000 milliseconds, including after resume.
4. HTTP 403 or 429 stops the complete run and prevents a replayable run
   manifest. One model or product-URI mismatch binds the raw response, emits no
   availability observation, quarantines only that baseline link, and permits
   unrelated exact-link work to continue.
5. Five consecutive failures, including identity mismatches, stop the complete
   run and persist the failure state for investigation.
6. Failed collection remains a failed attempt. Missing data or a failed request
   never becomes an `unavailable` observation.
7. Each successful response is stored as a content-addressed immutable object
   and verified again before application.
8. Batch selection is deterministic, category-stratified, disjoint, and frozen
   in the run plan. Arbitrary target IDs are not accepted by the CLI.
9. Search, category, checkout, broad crawling, parallel collection, and source
   discovery remain prohibited.

### Mandatory re-review triggers

Collection returns to `collection_blocked` or canary-only review before another
scale run when any of these occurs:

- the robots response hash changes;
- the source host, endpoint shape, or response identity contract changes;
- a 403 or 429 occurs;
- the consecutive-failure circuit breaker opens;
- the exact model or URI contract fails repeatedly or indicates endpoint-level
  drift rather than an isolated stale catalogue link;
- Appliances Online publishes applicable automation/API terms or sends a
  request that changes the permitted use;
- the runner cannot prove single concurrency, interval enforcement, immutable
  storage, resume safety, or cumulative application.

## Other retailer sources

The Good Guys remains restricted to the authorized Partnerize product feed.
Bing Lee, Harvey Norman, and JB Hi-Fi remain collection-blocked under the
current policy. No AO decision changes those source-specific states.

## Reviewed scale execution

The 2026-07-20 scale execution froze 1,169 distinct AO baseline links into 12
bounded runs. It produced 1,153 exact-identity snapshots and 16 raw-bound
identity quarantines, with zero ordinary collection failures, HTTP 403/429
responses, or unaccounted links. Applying every run produced 1,406 current
typed observations and 1,190 cumulative collection attempts in the tracked
ledger. Reapplying a completed run did not change the ledger bytes.

The resulting lifecycle shadow remains intentionally blocked: 81 products that
were current in the migration baseline still lack a conclusive current or
unavailable retailer disposition. The refresh inventory preserves all 81:
22 require a genuinely new authorised Partnerize feed epoch, 58 have only
collection-blocked legacy retailer pages, and one has an explicit exact-model
rediscovery task after its only AO link returned a sibling finish. Missing
affiliate-feed rows are not treated as unavailable, identity mismatches do not
donate sibling status, and no production lifecycle projection was changed.

Three of the Partnerize-missing rows also expose canonical model defects rather
than ordinary aliases: LG `1910FGX`/`1910BX` versus official
`WWT-1910FGX`/`WWT-1910BX`, and CHiQ `CTM202NW` versus `CTM202NW3`. They require
identity repair before availability can bind. Replaying the same Partnerize
bytes under a later observation time is rejected; the current file import does
not independently prove the source-processing epoch. A future direct HTTPS
acquisition receipt must bind response time and source host before unchanged
bytes can safely establish a later freshness epoch.

AO response-contract failures now retain the exact HTTP response bytes as
non-terminal failed attempts and publish no availability. Completed-run replay
verifies every raw-bound record, including identity quarantines and response
contract failures, rather than checking successful rows only.
