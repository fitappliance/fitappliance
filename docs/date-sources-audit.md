# Date Sources Audit

_Created 2026-04-26 for Phase 46._

## Scope

This inventory covers wallclock-derived date sources under `scripts/` that can affect generated files during `npm run generate-all`.
The triggering incident was PR #28 commit 3: a cross-day CI run refreshed hundreds of generated files solely because scripts still used "today" as metadata.

## Generated-Output Sources To Fix

| Source | Current date source | Generated output affected | Required fix |
| --- | --- | --- | --- |
| `scripts/utils/build-timestamp.js:10-23` | `FIT_BUILD_TIMESTAMP` fallback to `new Date().toISOString().slice(0, 10)` | Every consumer below | Delete unused helper after moving consumers to stable source dates. |
| `scripts/generate-sitemap.js:7,72,132-188` | `getBuildDate()` | `public/sitemap.xml` `<lastmod>` for every URL | Use `public/data/appliances.json.last_updated` for every URL to avoid shallow-checkout file history drift. |
| `scripts/generate-rss.js:6,131,139-151` | `getBuildDateObject().toUTCString()` | `public/rss.xml` item `<pubDate>` and feed `<lastBuildDate>` | Use `public/data/appliances.json.last_updated` for feed dates. |
| `scripts/generate-brand-pages.js:12,282,866` | `getBuildTimestampIso()` | `pages/brands/*.html` `article:modified_time` | Use `public/data/appliances.json.last_updated`. |
| `scripts/generate-cavity-pages.js:18,179,422` | `getBuildTimestampIso()` | `pages/cavity/*.html` `article:modified_time` | Use `public/data/appliances.json.last_updated`. |
| `scripts/generate-doorway-pages.js:8,151,273` | `getBuildTimestampIso()` | `pages/doorway/*.html` `article:modified_time` | Use `public/data/appliances.json.last_updated`. |
| `scripts/generate-location-pages.js:9,282,420` | `getBuildTimestampIso()` | `pages/location/**/*.html` `article:modified_time` | Use `public/data/appliances.json.last_updated`. |
| `scripts/generate-guides.js:11,173-174,270` | `getBuildTimestampIso()` fallback and head meta | `pages/guides/*.html` Article fallback dates and `article:modified_time` | Keep guide history constants/git-log dates; remove wallclock fallback from rendered metadata. |
| `scripts/generate-comparisons.js:12,388,458-459` | `getBuildDate()` default `lastUpdated` | `pages/compare/*.html` Article `datePublished` / `dateModified` when no caller value is provided | Use `public/data/appliances.json.last_updated`. |
| `scripts/pick-review-pilot.js:8,28-32,136-148` | `getBuildDate()` | `data/videos/review-pilot-slugs.json` `last_updated` | Use `public/data/appliances.json.last_updated`. |
| `scripts/build-link-graph.js:6,128` | `getBuildTimestampIso()` | `reports/link-graph.json` `generatedAt` | Remove volatile `generatedAt` field. |
| `scripts/validate-schema.js:6,76` | `getBuildTimestampIso()` | `reports/schema-validation.json` `generatedAt` | Remove volatile `generatedAt` field. |

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

1. Add `scripts/common/file-dates.js` with git-derived, cached timestamps and deterministic fallbacks for cases that genuinely need file history.
2. Wire dynamic generated page metadata, review pilot metadata, sitemap, and RSS to stable source dates instead of wallclock "today".
3. Remove volatile `generatedAt` fields from local reports that are regenerated in CI.
4. Tighten wallclock audit coverage so production generators cannot reintroduce `new Date()` / `Date.now()` metadata.
5. Add cross-day determinism coverage so `generate-all` remains byte-stable when CI runs on a different calendar day.

## Implementation Note

The first inventory pass considered using each generated page's own git modification time.
That is self-referential: committing a generated page changes the page's latest commit time, so the next CI run would rewrite the timestamp again.
The final implementation therefore uses stable source dates for generated pages (`public/data/appliances.json.last_updated`).
The same source date is also used for sitemap static URLs because GitHub Actions shallow checkouts do not always have enough file history for old static pages.
