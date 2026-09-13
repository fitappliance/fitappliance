# G0b CI and syntax wiring

Status: REVIEW_REQUIRED

## Scope and inputs

- Base/current HEAD: `af7d53502074d5ece3159a1dc1634c1ce3b48451`; branch: `codex/architecture-v3-g0b-ci`.
- Packet-bound plan/spec SHA-256: `2f0b2a39c2c765a7bcc597c9c406f559ec94e54c13d938ac8b34c8c274fc886d` / `01c60666b562f10a893c288eb7d58657031f5437e36b3dfba26e77b9c6af4039`.
- G0a report SHA-256 remains `f68e876aeafe5d886be165b743d5d1047e56a647d6acc26d257e50986aeba51c`.
- Final tested hashes: `package.json` `2955346db8853126dc7731a235ee911af60039d09e356a0812a228c058c6b4b3`; `package-lock.json` `ad45d58a7bf0e4c88a0b26edc9c73100810358286f2f39354b978bc25238d0e7`; runner `b958b727ba0fb882460ffe6e307034f5f06fdf61d1b328b989af208d0f527e70`; contract test `c53809efde1dbe8e072fba3242657c2d90e914a8a59f1327cd1499114e9f1138`.

## Implemented contract

`checkV3Syntax({ explicitMjsPaths })` returns exactly `{ status, checkedMjsPaths, failedMjsPath }`, where `status` is `pass`, `path_missing`, `syntax_error`, or `empty_list_error`. `checkedMjsPaths` preserves input order and original filename strings; `failedMjsPath` is `null` for pass/empty.

Each file is passed independently to the current Node executable as array arguments `['--check', '--', originalInput]`: no shell evaluation, and the option terminator prevents a valid leading-`-` filename from becoming a Node option. CLI default discovery covers present `.mjs` under `scripts/architecture-v3`, `tests/architecture-v3`, `src/domain/architecture-v3`, `src/shared`, and `public/scripts`; absent future producer directories are skipped, while an explicitly requested missing path returns `path_missing`.

`npm test` now calls this runner once before the existing test globs plus `tests/architecture-v3/*.test.mjs`. The PR workflow was deliberately unchanged: it already uses read-only permissions, Node 20, `npm ci`, and one `npm test` step, so this is the smallest non-duplicating local/CI route.

## TDD witnesses and checks

| witness / check | result |
| --- | --- |
| RED: default command before V3 wiring | exit 1; real V3 marker was absent |
| RED: leading-dash relative file before `--` | exit 1; returned `syntax_error` for `--g0b leading dash.mjs` |
| RED mutation: stop after first valid file | exit 1; second invalid file was masked, then mutation was removed |
| GREEN: `node --test tests/architecture-v3/*.test.mjs` | exit 0; 19 pass, 0 fail |
| Default-command fixture | pass marker; injected failing V3 test made `npm test` nonzero; fixture supplies a minimal test for every existing glob to avoid Node 20 unmatched-glob differences |
| `npm ci` | exit 0 under Node `v22.23.1` / npm `10.9.8`; unchanged lockfile |
| `node scripts/architecture-v3/check-v3-syntax.mjs` | exit 0; 9 present V3/shared/generated `.mjs` files checked |
| final `npm test` | exit 0; 2,982 pass, 0 fail |

Node 20 execution was not run locally; the unchanged PR workflow is the CI proof path. `git diff --check` passed. `public/`, `data/`, `src/`, and `package-lock.json` have no tracked or untracked changes; no build, sync, publish, recovery, OCR, network evidence operation, commit, or push was run. The pre-existing main-agent plan progress edit remains outside G0b.

## Handoff

No product, Fit, lifecycle, rights, evidence, hash-code, or G1a codec semantics changed. Next eligible work is G1a/G2a only after main resolves the raised G1a compatibility policy; neither was executed here.
