# FitAppliance Storage Layout

Status: adopted for new work; current repository paths remain compatible until
the Phase 10 storage-normalisation migration.

## Goals

- Keep deploys reproducible without requiring the external drive.
- Keep human decisions, policies and provenance in Git.
- Keep large PDFs, rendered pages and disposable caches outside Git.
- Address immutable evidence by SHA-256 rather than mutable filenames or URLs.
- Fail closed when original evidence is unavailable; never silently substitute
  a newly downloaded file for a reviewed hash.

## Canonical roots

Repository:

```text
/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2
```

External project storage:

```text
/Volumes/UGREEN-1TB/FitAppliance
```

The external volume is HFS+ with ownership disabled. It is suitable for PDF
objects, page renders, archives and caches. Active SQLite databases, primary Git
worktrees, secrets and application configuration must remain on the internal
APFS disk.

## Repository layout

The target Architecture V2 layout is:

```text
data/architecture-v2/
├── policies/                 # reviewed collection and publication rules
├── decisions/                # human identity, alias and quarantine decisions
├── reviews/
│   └── phase-XX/             # authoritative review input and decision records
├── observations/             # immutable lightweight retailer observations
└── generated/                # registries, manifests and public projections

docs/architecture-v2/         # durable architecture, status and audit conclusions
docs/superpowers/plans/       # execution plans
reports/committed/            # small review evidence intentionally retained
reports/generated/            # machine output; ignored and reproducible
public/                       # generated deploy assets
pages/                        # generated static pages
```

The ownership layout above became mandatory in Phase 10. All consumers resolve
these files through `src/domain/architecture-v2-paths.mjs`; flat JSON files at
the Architecture V2 root are rejected by the path-contract test.

## External-drive layout

```text
/Volumes/UGREEN-1TB/FitAppliance/
├── evidence/
│   ├── objects/sha256/aa/<full-sha256>.pdf
│   ├── text/sha256/aa/<full-sha256>.txt
│   └── renders/sha256/aa/<full-sha256>/page-0001.png
├── review-workspaces/
│   └── phase-XX/             # contact sheets and temporary reviewer exports
├── cache/
│   └── work/v2/              # disposable pipeline working files
├── imports/                  # immutable retailer-feed source snapshots
├── quarantine/               # mismatched or unapproved source documents
├── manual-evidence/          # existing legacy evidence pending object migration
└── backups/                  # dated project-data exports, never the only copy
```

The first two characters of the SHA-256 form the object shard. A reviewed PDF
must never be overwritten. A changed upstream file receives a new hash and a
new review lifecycle.

## Storage classes

| Class | Examples | Location | Git |
| --- | --- | --- | --- |
| Authoritative text | policy, alias decision, review decision | repository `data/` | tracked |
| Provenance index | URL, SHA-256, page, quote, parser version | repository `data/` | tracked |
| Derived deployment | public projection, category JSON, HTML pages | repository generated paths | tracked until CI publishes independently |
| Original evidence | manufacturer PDF, retailer source snapshot | external `evidence/` or `imports/` | never |
| Visual review artifact | rendered PDF page, contact sheet | external `evidence/renders/` | never |
| Disposable work | downloads, OCR scratch, test browser output | external `cache/work/` | never |
| Durable conclusion | completion audit, phase report | repository `docs/` | tracked |
| Machine report | uptime, broken links, orphan graph | `reports/generated/` | ignored |

## Runtime rules

1. `npm run build`, tests and Vercel deploys must work without the external
   drive by consuming committed manifests and projections.
2. Evidence acquisition, PDF rendering and manual-review preparation require
   the external drive. If it is absent, they must stop with an explicit error.
3. Approval requires the external object hash to match the committed document
   hash. URL availability alone is insufficient.
4. No secret, browser profile, cookie, API token or active database belongs on
   the external project root.
5. `tmp` remains ignored in Git and Vercel. The repository path may be a symlink
   to external `cache/work/v2/tmp`.
6. Generated files are never edited manually; their source input or generator
   must be changed instead.

## Backup policy

- Git and GitHub protect text history, not external PDF objects.
- External evidence requires a second backup before it is considered durable.
- A backup inventory records hash, byte size and relative object path.
- Quarterly restore tests should sample at least one approved PDF from each
  category and verify its SHA-256 and rendered review page.

## Migration order

1. Move the existing V2 `tmp` target into `FitAppliance/cache/work/v2/tmp`.
2. Create SHA-addressed evidence directories and import Phase 8/9 PDFs without
   changing their committed hashes.
3. Generate an object inventory and verify every approved source-document hash.
4. Split repository Architecture V2 inputs from generated outputs in one atomic
   build-script migration.
5. Remove the source-document/review-bundle build cycle.
6. Split committed audit conclusions from generated machine reports.

No migration step may change a trust level or evidence decision merely because
a file changed location.
