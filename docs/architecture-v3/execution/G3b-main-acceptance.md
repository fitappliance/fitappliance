# G3b — main acceptance and release gates

Date: 2026-09-15. Base: `c83aa475d892e5bdb8bc7f65a0cee4cb05292a50`.
Branch: `codex/architecture-v3-g3b-region-canaries`.

**Code/spec ACCEPTED for the bounded G3b task. Merge/release remains conditional
on passing full exact-head CI and actual deployment checks.** This document is
the pre-commit acceptance checkpoint, not a claim that CI or release has already
occurred. It does not issue a Claim/receipt or approve physical installation.

## Independent roles and version binding

- Dalton `01a0a264-0a86-7ae0-a250-764c686e384d`: implementation/TDD and fixes.
- Dewey `01a0a2c0-4b22-7cb0-884c-f2e03755915b`: separate read-only audit and
  scoped re-reviews, no implementation changes.
- Main: contract decisions, critical evidence, integration, acceptance and release.

Both agents were explicitly dispatched GPT-5.6 Terra/max. The auditor separately
discloses the generic self-visible model label rather than asserting unexposed
serving identity. Executor and auditor were not active writers together. Both
are closed at this checkpoint.

The [original audit](G3b-independent-audit.md) is preserved as CHANGES_REQUIRED.
[Re-review v2](G3b-independent-rereview-v2.md) resolves F1/F2/F3 and preserves the
new N1 finding. [Re-review v3](G3b-independent-rereview-v3.md) marks N1 ADDRESSED,
spec/code quality APPROVED, no new concrete finding, with full exact-head CI
explicitly outstanding. Its raw SHA256 is
`39023ebb73ab7bfeacf83c0266e7dac311c4a2cc21ed333376a426420a67ec52`.

Frozen v3 contains17 files; full-package SHA256
`d76d09b88c5e598a52d5d3246dc46668e3d38099d6620c5149e7740a1d42856d`.
The preserved-v2-to-v3 fix-package SHA256 is
`7bc4a4387831fa6de7ec7e7443d20841529aee30f6fa7c2e447457930c45d6d8`.
Main rechecked all17 frozen file lengths/hashes and the final audit hash after
the auditor stopped: unchanged. Subsequent plan-status edits and this acceptance
record are main-authored handoff metadata, not modifications to reviewed code.

## Accepted contract and checks

The closed, versioned registry resolves real G2a brand identities. Selection and
routing replay one shared raw observation implementation. Missing/unsupported
raw kinds remain identifiable incomplete candidates and cannot supply guessed
page context; legitimate neighbouring regions stay usable. Native page headers
cannot prove an unreadable drawing's numeric labels. Ambiguous profile matches
fail rather than selecting the first result.

Image/crop representations reuse G3a's source/page/rotation/raw-coordinate and
actual full-page ancestry checks. JSON-pointer text/table evidence does not
invent rendered-page records. Synthetic crop controls are structural tests, not
new source crops. Unresolved units, labels, ranges, axes or installation meaning
remain gaps; no routing result becomes a verified geometry fact.

Main accepts the captured tests without duplicating unchanged suites:

- Final fix2 affected26/26, actual exit0, no failures/skips/cancellations. RED
  passes the valid index control and fails4 assertions; GREEN5/5 follows the fix.
- All39 final input byte lengths/hashes match before/after and current objects;
  actual process exits and complete log hashes are checked.
- Six positives and12 genuine alternate-source negatives exercise selection;
 12 separate tamper controls exercise source-identity rejection. Portable and
  original-object modes both exit0, with actual-object authority only in the
  latter. Missing-store mode returns blocked/exit2.
- Historical full3196 and fix1 affected47 remain historical. **The final committed
  version still needs its full CI**, canonical build and publication gates.

Current [executor record](G3b-router-canaries.md) SHA256:
`7b80cceaeb409ab4967dc9589aa1dba3b3e527c8fe64973d631cc44b148d06e1`.
Its original and fix1 byte prefixes are preserved. Prior failed/intermediate
captures are retained and not counted as successful final runs.

## Real coverage and publication limits

Exactly3 existing PDF/selected-MinerU pairs,6 existing full-page images and17
accepted external input objects support this bounded replay. These PDFs are
outside the older590-PDF inventory; this is not3/590 or whole-catalogue repair.
Six profiles/fixtures and12 cross-source pairs are not12 independent originals.
No OCR, new rendering, acquisition, external message or paid call was performed.

No original PDF/OCR bytes, receipt or external evidence object enters the commit.
Runtime/public data, active release, Fit behavior, package/lock/workflows and
deployment configuration stay unchanged. The actual preview and production must
prove .site-public isolation, all changed internal paths inaccessible, unchanged
public application bytes except the commit-specific service-worker cache version,
and the exact deployment/commit/alias binding. Preserve the previous production
for rollback and the original dirty recovery checkout unchanged.

Still unfinished: unreadable BDF diagram labels, incomplete historic OCR flags,
BDP589/568 depth meaning, EWF575/hose20 context, installation requirements, field
witnesses and common-standard old-receipt reissue. New V3 receipts and newly
VERIFIED_FIT products:0. G4 remains NOT_STARTED; code release does not complete
these semantic and evidence obligations.
