# Date Sources Audit

_Created 2026-04-26 for Phase 46._

## Scope

This inventory covers wallclock-derived date sources under `scripts/` that can affect generated files during `npm run generate-all`.
The triggering incident was PR #28 commit 3: a cross-day CI run refreshed hundreds of generated files solely because scripts still used "today" as metadata.

## Generated-Output Sources To Fix

| Source | Current date source | Generated output affected | Required fix |
| --- | --- | --- | --- |
| `scripts/utils/build-timestamp.js:10-23` | `FIT_BUILD_TIMESTAMP` fallback to `new Date().toISOString().slice(0, 10)` | Every consumer below | Replace wallclock default with git-derived helper. |
| `scripts/generate-sitemap.js:7,72,132-188` | `getBuildDate()` | `public/sitemap.xml` `<lastmod>` for every URL | Use per-URL generated file modification dates. |
| `scripts/generate-rss.js:6,131,139-151` | `getBuildDateObject().toUTCString()` | `public/rss.xml` item `<pubDate>` and feed `<lastBuildDate>` | Use each linked page's file date; feed date is max item date. |
| `scripts/generate-brand-pages.js:12,282,866` | `getBuildTimestampIso()` | `pages/brands/*.html` `article:modified_time` | Use each brand page's file date. |
| `scripts/generate-cavity-pages.js:18,179,422` | `getBuildTimestampIso()` | `pages/cavity/*.html` `article:modified_time` | Use each cavity page's file date. |
| `scripts/generate-doorway-pages.js:8,151,273` | `getBuildTimestampIso()` | `pages/doorway/*.html` `article:modified_time` | Use each doorway page's file date. |
| `scripts/generate-location-pages.js:9,282,420` | `getBuildTimestampIso()` | `pages/location/**/*.html` `article:modified_time` | Use each location page's file date. |
| `scripts/generate-guides.js:11,173-174,270` | `getBuildTimestampIso()` fallback and head meta | `pages/guides/*.html` Article fallback dates and `article:modified_time` | Keep git-log guide dates; remove wallclock fallback from rendered metadata. |
| `scripts/generate-comparisons.js:12,388,458-459` | `getBuildDate()` default `lastUpdated` | `pages/compare/*.html` Article `datePublished` / `dateModified` when no caller value is provided | Use comparison page file date or appliance dataset date explicitly. |
| `scripts/pick-review-pilot.js:8,28-32,136-148` | `getBuildDate()` | `data/videos/review-pilot-slugs.json` `last_updated` | Use a stable source date derived from the input data or committed output path. |
| `scripts/build-link-graph.js:6,128` | `getBuildTimestampIso()` | `reports/link-graph.json` `generatedAt` | Use repository HEAD commit time or remove wallclock dependence. |
| `scripts/validate-schema.js:6,76` | `getBuildTimestampIso()` | `reports/schema-validation.json` `generatedAt` | Use repository HEAD commit time or remove wallclock dependence. |

## Operational Sources Not Targeted By This Fix

These scripts still use dates for operational logs, local audit report filenames, temporary files, or runtime browser logic. They are not the root cause of `generate-all` cross-day byte drift.

| Source | Usage | Reason not in Phase 46 generator wiring |
| --- | --- | --- |
| `scripts/lighthouse-ci.js` | Local Lighthouse report timestamps and filenames | Operational report output, not canonical generated site content. |
| `scripts/audit-docs.js`, `scripts/audit-copy.js`, `scripts/audit-review-content.js`, `scripts/audit-portability.js` | Audit report metadata | Local audit artifacts; keep monitored by wallclock allowlist. |
| `scripts/keyword-gap.js`, `scripts/gsc-fetch.js`, `scripts/open-*.js`, `scripts/triage-issues.js` | Operational exports and GitHub issue metadata | Not part of `generate-all` deterministic site generation. |
| `scripts/utils/file-utils.js`, `scripts/split-appliances.js` | `Date.now()` suffixes for atomic temporary writes | File safety suffixes, not persisted metadata. |
| `scripts/generate-sw.js` | Runtime service-worker cache age checks | Browser runtime logic, not a build-time date stamp. |
| `scripts/research-popularity.js` | Backfill cursor and research metadata | Explicitly out of scope and redlined for this PR. |

## Fix Direction

1. Add `scripts/common/file-dates.js` with git-derived, cached file/repository timestamps.
2. Wire sitemap, RSS, rendered page metadata, review pilot metadata, and reports to git-derived dates instead of wallclock "today".
3. Tighten wallclock audit coverage so production generators cannot reintroduce `new Date()` / `Date.now()` metadata.
4. Add cross-day determinism coverage so `generate-all` remains byte-stable when CI runs on a different calendar day.
