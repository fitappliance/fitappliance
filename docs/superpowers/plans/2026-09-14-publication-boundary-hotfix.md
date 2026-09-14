# Publication Boundary Hotfix Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development. User-selected
> workflow: one GPT-5.6 Terra / Max implementer; main owns judgment, review and release.

**Goal:** Independently ship an actual static-artifact boundary without changing
Fit, evidence, catalogue membership, prices, API behavior or the V3 work in progress.

**Architecture:** Keep the existing canonical build/publisher. After it succeeds,
copy only intended static website files into `.site-public/` and make that the
explicit Vercel output directory. Keep the current `public/` and `pages/` layout
inside the artifact so existing rewrites and URLs remain compatible. Vercel still
builds existing API functions from repository `api/`; they are not static assets.

**Tech Stack:** Existing Node >=20 CommonJS build scripts and node:test; no new dependency.

**Spec:** The contract below and `docs/product-core-brief.md` sections1–2 and Runtime
catalogue ownership. This is a standalone production hotfix authorized by the user
on2026-09-14, not an Architecture V3 gate or a replacement for the long V3 plan.

## Contract and frozen baseline

- Worktree `/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/publication-boundary-hotfix`;
  branch `codex/publication-boundary-hotfix`, base `35a4ea0a180f0f9f2d4c35b281cf618d8c93023a`.
- GitHub push/admin and local Vercel access were verified; main owns commit/push,
  PR, merge and deployment, authorized after acceptance. No other PR is included.
- Existing runtime catalog and active descriptor must remain unchanged. Pointer
  SHA256 `976a1463dd747763d20c959d52ecceaa1617a52eff6b06f17d9d8f59b2a6f222`.
- Locked package SHA256 `00cbcb0501ce04eb96da80bf5d34ca3adbcaf21193848c597b56dda927823a56`;
  lock SHA256 `ad45d58a7bf0e4c88a0b26edc9c73100810358286f2f39354b978bc25238d0e7`.
- Original vercel.json SHA256 `8b7111edda3d361a363de163e5af5a06e7511a22f4acdafae1ee0ae8acef937e`.
- Production root-output issue is confirmed by exact-byte GETs of internal docs,
  source and active descriptor. Repository is already public: this is publication
  scope separation, not proof of private-code or credential leakage.
- Main ran existing vercel-production/publication-boundary tests:15/15 pass. They
  lack a deployed-file inventory check. Dependencies installed with unchanged lock.
- Public tree currently942 files (.txt/.json/.png/.xml/.js/.webmanifest/.webp/.mjs/.css),
  pages2336 files (.html and seven index.json), no symlinks/hidden entries. Counts
  are observed baseline, not acceptance constants. No private evidence may be
  discovered merely because it shares a file extension with a public asset.

## Task 1: Build and enforce the static artifact boundary

**Worker writable files:**

- Create `scripts/build-public-deployment.js` and `tests/public-deployment.test.mjs`.
- Modify `package.json`, `vercel.json`, `.gitignore`, `.vercelignore`,
  `tests/vercel-production.test.mjs`, `docs/deployment-notes.md`.
- Write task report only to the ignored brief-adjacent `task-1-report.md` path.
- No other source/data/lock/API/UI/workflow edits without main's scoped review.
  Normal existing build may regenerate outputs in this isolated worktree, but
  report any drift and never commit unrelated changes or suppress failed checks.

**Interfaces and minimal implementation decisions:**

Export `buildPublicDeployment({ repoRoot } = {})` from the CommonJS script;
return output path and enough file/count/hash information for tests/audit. CLI
calls it and exits nonzero on unsafe or incomplete inputs. No network or evidence
acquisition. Use fixed `.site-public` output, never caller-provided arbitrary delete paths.

Static allowlist is `index.html`, the two already-existing exact Google verification
HTML filenames, `public/` and `pages/`, preserving their relative paths. These are
the existing intentionally public producers; new root directories do not auto-enrol.
`public/` is the public asset contract, not a reason to recursively include root
`data/`, `src/`, `docs/`, `scripts/`, `api/`, `tests/`, `reports/`, `v2/`, `.env` or
`.git`. Reject symlinks/special files and hidden entries in allowed trees rather
than following a link to evidence/secrets. Read source bytes without modification.

`data/pdf-evidence/README.md` expressly reserves local/copyrighted manuals. It is
the only current entry, and cannot be copied. Point the legacy `/pdf-evidence/`
route to an explicitly public namespace (e.g. `/public/pdf-evidence/`) without
auto-publishing raw evidence; absence correctly404. Existing reviewed links point
externally, and there are no approved local PDFs to migrate in this hotfix.

Add `.site-public/` to git/upload ignores. Set `vercel.json.outputDirectory` to
`.site-public`, overriding the old remote project setting. Append the packaging
step after the existing canonical build+audit; preserve existing buildCommand
`npm run build` and all legitimate rewrites/redirects/headers/API handling.
No duplicated publisher, regex denylist as the sole guard, or whole-root copy.

Rebuild from a fresh staged directory; do not merge into stale output. Failure
must fail the build and not leave a mixed publishable artifact. Repeated runs
remove stale output files without deleting originals. Use bounded generated-output
paths, reject symlinked output/ancestors, retain or safely replace prior generated
output only after success. Prefer existing helpers; no framework or general deploy
manager. Do not erase recovery directories or evidence; no shell recursive cleanup.

- [x] Write behavior-level RED tests before implementation. A useful initial test
  asserts current config `outputDirectory === '.site-public'` (currently absent)
  and shows a root-static resolver reaches `/docs/private.md` while desired output
  must not. Missing module or syntax errors alone do not count as the witness.
- [x] Implement the bounded packager and config wiring with apply_patch. Tests must
  preserve public/index/pages JSON+HTML bytes and exclude internal/hidden/symlink
  paths, alternative nested internal paths, and root data shadowing public rewrites.
- [x] Test repeat, source removal/stale file exclusion, invalid input/failure,
  source preservation and deterministic unchanged output. Assert allowed output
  has no root control-plane directory, secrets or raw PDF directory.
- [x] Run focused tests, existing route/API/search contracts, then full `npm test`
  once after readiness, lint, syntax-check new script, `npm run build`, schema
  validation, read-only docs audit and diff check. Ordinary build has no external
  evidence dependency. Record exact command/results/byte identities and drift.
- [x] Self-review both bypass and legitimate behavior; report REVIEW_REQUIRED.
  Main independently reviews the patch and remote/browser tests; worker does not
  commit/push/merge/deploy, change project settings or create subagents.

## Task 2: Main review, exact-commit preview, standalone merge and release

- [x] Review final diff, static inventory, removed-file and unsafe-path witnesses;
  compare runtime/catalog/reference bytes to base. Main does not repeat unchanged
  implementer full-suite checks. No open boundary/compatibility defect may pass.
- [ ] Create one standalone PR against fresh main, excluding V3 and recovery work.
  Verify exact final head CI and actual Vercel Node24 build. Preview must test both
  original internal URLs and sibling/encoded variants return404/not data, while
  homepage, guides/products, public JSON/JS/styles/images and safe API GETs work.
- [ ] Verify cavity/replacement browser flows using preview; do not submit real
  subscriptions, send outbound messages or mutate user/customer data during tests.
- [ ] Merge only this PR when checks pass. Main Git integration creates production;
  verify actual production deployment ID/SHA/status, redirects, byte identities,
  negative URLs, search flows and safe API method handling before claiming fixed.
- [ ] Preserve prior deployment identity for emergency recovery, but do not
  automatically re-promote the known-exposed old artifact. Prefer a corrected
  artifact with unchanged runtime data if recovery is necessary.
- [ ] Record final delivery in docs/deployment-notes.md or this plan and update
  the original V3 plan checkpoint without including unfinished V3 in this release.

No cleaning of worktrees/source/evidence is part of completion. When skills request
additional reviewer seats, automatic cleanup or renewed consent, the user's
one-executor/main-review, preservation and explicit merge/release authorization win.

## Progress

Task1 accepted after independent main review; Task2 exact-commit preview/release
pending. No production change as of this pre-merge checkpoint.

- Worker: 18 boundary/config, 73 route/search contracts and 2,971 full-suite tests
  passed; canonical build, lint, schema and indexability checks passed. Main checked
  the logs and separately ran the read-only documentation audit: no drift.
- Build preserves the exact original command sequence. Independent review caught
  and corrected a missing video-schema step before acceptance, with regression
  coverage. Symlinked roots/ancestors and generated crash remnants are covered.
- Artifact:3,281 regular files,54,854,799 bytes; SHA256
  `08c7917052eac35900e7ed08c16d472fc4a5bef3d27eff3b706b4eb5ab3abbb5`.
  Main verified every artifact file equals its corresponding source. No changes
  in runtime catalog/reference data, pages, UI, API, Fit code or lock file.
- Active-release build audit:3,513 catalog entries,349 current-retail products,
  8,087 historical records;0 Fit publication violations and0 replacement issues.
- Live baseline:22 positive route samples200 and3 safe API GETs405. Desktop/mobile
  normal ready-state cavity/replacement searches both return23/158 respectively;
  no failed first-party runtime assets or uncaught application errors.
- A separate pre-existing early-sample/bootstrap race can duplicate catalog loads
  before controls are ready. It is not fixed or masked as part of this packaging
  hotfix; preserve it as a follow-up, without changing UI or data in this release.
- The local GitHub CLI credential failed revalidation. The existing GitHub
  connector authenticated as fitappliance with current push/admin permissions;
  the reviewed tree will be committed through that connection. Git commit/tree
  identity and final CI must still match before merge.
