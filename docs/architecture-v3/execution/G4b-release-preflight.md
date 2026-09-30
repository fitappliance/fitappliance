# G4b release preflight — commit and CI eligible

Date: 2026-09-30. Reviewed G4b implementation commit: `56228b996f3ab91615c8017bc591f89c6123c964`. Integration: [draft PR215](https://github.com/fitappliance/fitappliance/pull/215), isolated branch `codex/g4b-source-boundary-repair`. Code/design approval is recorded in [independent acceptance v5](G4b-independent-acceptance-v5.md); the small video release unblock has a [separate independent review](G4b-video-release-review.md).

The user approved D-1 option 1. Declared npm/Vercel builds compare the actual producer-resolved Cheerio/parse5 dependency closure, package lock and binding/receipt code against the reviewed manifest. Stored receipt replay uses the current parser and rejects failed source proof. This does not prove an arbitrary historical runtime's parser identity.

## Verified local gates

- Focused source-binding, build identity and public deployment: 64/64 pass; the independent reviewer separately reproduced the original R3-1 failure and repaired rejection from hash-verified captures.
- Clean lockfile dependency installation on UGREEN; final local Node22 full suite: 3328/3328 pass, zero skips/cancellations/todo. The prior unavailable fflate dependency is present.
- Canonical build passes; 3281 public files, 54856636 bytes; public artifact digest `286a1d323b1dcc93f913057b07f8c39aeefce0f1f5a0380723ac0f3c0670aece`. Fit publication violations remain zero.
- Lint, documentation audit and schema gate pass; schema: 2330 pages, 6145 blocks, zero errors.
- Existing video expiry was genuinely revalidated: executor and distinct auditor each obtained 6 valid / 0 invalid live official YouTube oEmbed results. Video identities/upload dates are retained; no test or freshness threshold was weakened.

## Storage alignment

At the user's direction, this task's three new isolated worktrees and review/build artifacts were moved to `/Volumes/UGREEN-1TB/FitAppliance/review-workspaces/codex-2026-09-30/`. Git registration, commits, branches, file hashes/modes and uncommitted state were verified; pre-move recoverable source snapshots and inventories are retained on UGREEN. Internal task directories now occupy 0 KiB, freeing approximately 1.25 GiB. Fresh dependencies, npm cache and test temporary files also reside on UGREEN. The original main checkout, old G4b worktree and common Git metadata remain internal and unchanged.

## Remaining release gates

The final committed head needs passing Node20 PR Validation (including downstream build/publication/sitemap/review-content/generated-diff steps), doc audit, portability, copy lint and Vercel Preview. Required original-store absence skips must be explicitly accounted for. Merge/deployment require the reviewed source tree and passing commit to match; production deployment identity and bounded smoke checks must then be verified. No release is certified by local test counts.

No real new G4b receipt, reviewed admission, public right or Verified Fit outcome is created by this module release. G5/G6, current eligibility and whole-inventory repair remain pending. The separate trust-display branch is not included.
