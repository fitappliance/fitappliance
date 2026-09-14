# G0a baseline and migration inventory

Status: REVIEW_REQUIRED

This is a read-only, point-in-time G0a audit. FROZEN_LIVE_INPUTS is deliberately absent: hashes in this report bind this run and do not become a permanent release or publication rule. --root changes only the resolved read location; validation rules are identical.

## Scope and live identity

| field | value |
| --- | --- |
| G0a worktree branch | codex/architecture-v3-g0a-baseline |
| G0a base / current HEAD | 495249b3212a89fc144185e939f95232c6bbae6b |
| active release candidate | retail_lifecycle_release_6c42c754aeb1ff49097b32b4 |
| audit timestamp | 2026-09-13T15:53:35.512Z |
| dirty checkout alias | RECOVERY_CHECKOUT |
| dirty checkout HEAD | 2593c68d8aa6932bc9cb31420ab399d77188546a |
| dirty status rows / SHA-256 | 176 / 7742f69ba67a858b6221586704184339fc280d8906055d29df24d3d734ccd68c |
| dirty non-sensitive tracked aggregate SHA-256 | fea1454bddd5afba9dd779f54f498353bb5b6c4d45a88a49711cdf9c87447f93 |
| dirty snapshot SHA-256 | fa0c4717e2d82d47825b8d109bbb68daf6afea21026f8f89a604d44bbb626f95 |
| aggregate scope | NON_SENSITIVE_TRACKED_DIFF |
| aggregate pathspec mode | LITERAL |
| aggregate diff options | --no-ext-diff --no-textconv --binary |
| aggregate included tracked paths | 42 |
| aggregate excluded sensitive paths | 0 |

The live recovery status hash and HEAD match the supplied point-in-time recovery witness. The aggregate uses only literal pathspecs and disables external diff and text conversion before it reads any included tracked path.

## Whitelisted local changes

| path | identity / status |
| --- | --- |
| scripts/architecture-v3/audit-baseline.mjs | 3c88aa3ddcfcd25e12a1502cbd9181478e4af2e16b878d47a93dcbf90eae4166 |
| tests/architecture-v3/baseline-contract.test.mjs | 583d119361ccfe89713e7726f388be2767427f5d18776380f9c867b34502a3bf |
| docs/architecture-v3/execution/G0a-baseline-migration-inventory.md | this report; self-hash is provided in the handoff, not recursively attested here |
| docs/superpowers/plans/2026-09-13-architecture-v3-evidence-foundation.md | pre-existing main-agent-owned modified file; excluded from G0a writes |

Workspace status captured before this report refresh:

    M docs/superpowers/plans/2026-09-13-architecture-v3-evidence-foundation.md
    ?? docs/architecture-v3/execution/
    ?? scripts/architecture-v3/
    ?? tests/architecture-v3/

## Byte-bound inputs

| role | owner | repository-relative path | raw SHA-256 | semantic SHA-256 / domain |
| --- | --- | --- | --- | --- |
| active descriptor | active-release-descriptor | data/architecture-v2/decisions/active-retail-release.json | 976a1463dd747763d20c959d52ecceaa1617a52eff6b06f17d9d8f59b2a6f222 | cd7a4e7e70c0dbf8f6e447131b66db18d9bd877f12f06639e5e307b56ee46879 / canonical JSON |
| active manifest | active-release-manifest | data/architecture-v2/releases/retail_lifecycle_release_6c42c754aeb1ff49097b32b4/authorization-manifest.json | 1289e8ea9fcacdbbc81df305193a28937bfb8d80a0b63b654cb3e04427b78fd1 | a4effdfcc738b659186bc0d4fc22b3317a732960eed4964a57c4cb955e059377 / canonical JSON |
| active public projection | active-release-public-projection | data/architecture-v2/releases/retail_lifecycle_release_6c42c754aeb1ff49097b32b4/public-catalog-projection.json | d29bce5366a3467f9aa4887d26268284681184fb4a1f9097e8f2ed477f66da90 | 77f1a07ef3e62e5b680ea520fce122bf33aaa85ace27d663a29fa0a4c20b9b85 / canonical catalog JSON |
| active historical reference | active-release-historical-reference | data/architecture-v2/releases/retail_lifecycle_release_6c42c754aeb1ff49097b32b4/historical-appliance-reference.json | bc71b7af5bd3e68ce388ab7897df726cfae8980dc84db961eac531270aabd882 | d61db5788481496186d97f5af5101c65f6014eb7af134bef5acb111a61f8ef13 / canonical JSON |
| runtime projection | runtime-public-projection | public/data/appliances.json | ef9695123681b4c8fe37ebd79d228bbcfaf24b89da68a012e1e3ddab7f0e558a | 77f1a07ef3e62e5b680ea520fce122bf33aaa85ace27d663a29fa0a4c20b9b85 / canonical catalog JSON |
| runtime marker | runtime-projection-marker | public/data/catalog-projection.json | 85f01ca1038d56cb50956ba8d27aebc355c469ae3d4f9d5e2b4e32d0c55084b3 | e70f956c1bc60f894e93e8d337f1072c72ea48d2df894dfadf50b503da48d142 / canonical JSON |
| legacy default audit projection | legacy-default-audit-input | data/architecture-v2/generated/public-catalog-projection.json | 50a85830929e5298a1f484b0ea3367d7480a3ddb91247bf16d7bd93eab6e33b1 | 67e67191ab26f38be436c2600a0346833e546297b323799b813d646208a31c9e / canonical catalog JSON |
| legacy audit receipt bundle | legacy-default-audit-receipts | data/architecture-v2/reviews/automated/installation-evidence-receipts.json | d59c885ce7a4f2ce72988f3d9991baab10d715cf1997ebeadfbb310b5bb6a15d | 56111f4830d568aba4fd58142e46972e84f1dc6e874addd7a421638c20ee537f / canonical JSON |
| legacy audit replay audit | legacy-default-audit-replay-audit | data/architecture-v2/reviews/automated/installation-evidence-receipt-replay-audit.json | 53493b43fddd137dfab86a2d306a670ca2df09209170263ff94652479a84a727 | 07e8e0506d2f2d5a33b16dad3abd15a01d7c55f27a6042f455c7c47de84c37cc / canonical JSON |
| legacy audit control plane | legacy-default-audit-control-plane | data/architecture-v2/generated/installation-evidence-pipeline.json | a779cb7718515901524db1cff446ae14f208a59e9042faa4a01649ac27372c5e | 806c035faa8d2d51c1f8630dd48ff811050ea55b10c26da47d76596555f28670 / canonical JSON |
| field-rights policy | policy-field-rights | data/architecture-v2/policies/product-data-field-rights-dictionary.json | 69c1dac30edb4b736777592eb70be541f7aa99fbe7e4f0982c6be5b573291d03 | 899195b34e31a00a288de0ec10aac2406315cd3ba3ca95ff9a2455da16d01d28 / canonical JSON |
| manufacturer-source policy | policy-manufacturer-source | data/architecture-v2/policies/manufacturer-source-policy.json | 35e35b0bda7b5df46b3044e25404e30fd512141e4b29a66aa9d43ae6e9ff3db1 | 8b314b3ae789102c5aee898aac0339963a46a0bb0919c28e03682d00418e1369 / canonical JSON |
| applicability matrix | policy-applicability-matrix | data/architecture-v2/generated/installation-evidence-applicability-matrix.json | 96182572d9d8da3aa6b6bb688dbf1cdbb55724e8252f4493722620aadba1a80f | b02e7a49c98a2ca5c3d548d9fa1384aa54c8de988220978fb588f5fb75fd3e9d / canonical JSON |

activeReleaseDescriptorSha256: 976a1463dd747763d20c959d52ecceaa1617a52eff6b06f17d9d8f59b2a6f222
activeManifestSha256: 1289e8ea9fcacdbbc81df305193a28937bfb8d80a0b63b654cb3e04427b78fd1
runtimeProjectionSha256: ef9695123681b4c8fe37ebd79d228bbcfaf24b89da68a012e1e3ddab7f0e558a
legacyAuditInputSha256: 50a85830929e5298a1f484b0ea3367d7480a3ddb91247bf16d7bd93eab6e33b1

## Bounded code identity

| bounded source | owner | raw SHA-256 |
| --- | --- | --- |
| scripts/architecture-v3/audit-baseline.mjs | code-audit-baseline | 3c88aa3ddcfcd25e12a1502cbd9181478e4af2e16b878d47a93dcbf90eae4166 |
| src/domain/active-retail-release.mjs | code-active-release-loader | 4f6872d98c7509e7c4b3a4b6dfa34208eaced9d6882996f2c8c58bddd191b373 |
| src/domain/retail-lifecycle-release-candidate.mjs | code-release-candidate-validator | 4ff630f035995d5e0506e3075c67a7d929ec9ae3dd6e3430be250bf485a63d02 |
| scripts/architecture-v2/audit-fit-publication.mjs | code-default-fit-publication-audit | f376694ff2ed85b3d960ec7d71f98c7f179cf98f2d135149da25cc73f799e2a8 |
| src/domain/architecture-v2-paths.mjs | code-architecture-v2-paths | d018b4e23197bd35442f369b8231c57f4ed7ed5ff5cc4a21016c23d33cea65d5 |
| scripts/architecture-v2/publish-runtime-projection.js | code-runtime-publisher | fee03ef2e75613ca0e06290dfb39656344e8d198e4b627da24905f0854fcabc2 |
| scripts/architecture-v2/publish-active-retail-release.mjs | code-active-publication-boundary | c7aa642ad76f0c5d1eb4d5ef29e1556633b7bbd04fd1a0060e199bc447a3b984 |

baselineCommit: 495249b3212a89fc144185e939f95232c6bbae6b
codeSha256 (bounded scope only): e565af1b46df247dcad30765875315d47eda14aa0dc907e4dc8fad1962f05ab5

## Artifact denominators and lanes

| artifact / lane | count | meaning |
| --- | --- | --- |
| active release products | 3513 | separate active artifact denominator |
| active current-retail lane | 349 | unavailable=false + CURRENT_OUTPUT + CURRENT_RETAIL |
| active archived lane | 3087 | unavailable=true + HISTORICAL_INPUT_ONLY + CATALOG_ARCHIVED |
| active market-reference lane | 77 | unavailable=true + MARKET_REFERENCE_ONLY + UNKNOWN_RETAIL |
| active unknown/conflicting lane | 0 | any other explicit or malformed combination |
| active historical-reference records | 8087 | independent historical artifact |
| legacy default-audit products | 3515 | separate legacy artifact denominator |
| legacy lifecycle unknown/conflicting | 3515 | legacy rows do not carry active lane fields |
| runtime projection products | 3513 | runtime artifact denominator |
| manifest historical baseline declaration | 3515 | BOUND |

No arithmetic complement such as total minus current minus market is used. Owners and paths remain distinct even if bytes happen to match; there is no equality requirement between current legacy count and the manifest historical baseline declaration.

| identity comparison | raw bytes | semantic content |
| --- | --- | --- |
| runtime projection vs active release | BYTE_DISTINCT | SEMANTIC_EQUAL |

## Manifest source-binding inventory

| binding | path | expected raw SHA-256 | actual raw SHA-256 | expected semantic SHA-256 | actual semantic SHA-256 | semantic domain | disposition | unresolved reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baselinePublicProjection | data/architecture-v2/generated/public-catalog-projection.json | 50a85830929e5298a1f484b0ea3367d7480a3ddb91247bf16d7bd93eab6e33b1 | 50a85830929e5298a1f484b0ea3367d7480a3ddb91247bf16d7bd93eab6e33b1 | 67e67191ab26f38be436c2600a0346833e546297b323799b813d646208a31c9e | 67e67191ab26f38be436c2600a0346833e546297b323799b813d646208a31c9e | canonical JSON | BOUND_LEGACY_DEFAULT_AUDIT_INPUT | none |
| candidateBaseProjectionSha256 | data/architecture-v2/generated/public-catalog-projection-migration-candidate.json | 5ce822636cf15e509b9404b7bcdd9b02f8f0efdbd253ea65216f937cd48b028f | 5ce822636cf15e509b9404b7bcdd9b02f8f0efdbd253ea65216f937cd48b028f | c9a0be36056c5240146bbc3417ebb7327291d089927cde9910c0e76f146630c6 | c9a0be36056c5240146bbc3417ebb7327291d089927cde9910c0e76f146630c6 | canonical JSON | CURRENT_MIGRATION_INPUT_MATCH | none |
| identityMigrationSha256 | data/architecture-v2/reviews/automated/retailer-identity-migration.json | 5528e4843539638a37d68db5329f5c85ddb95d006dbabc85dda9242d5984a751 | 5528e4843539638a37d68db5329f5c85ddb95d006dbabc85dda9242d5984a751 | 834f0021c83facefd7b341f49a6d181fecaf70128be7514c373ba0e3e4354946 | 834f0021c83facefd7b341f49a6d181fecaf70128be7514c373ba0e3e4354946 | existing producer validator | CURRENT_MIGRATION_INPUT_MATCH | none |
| candidateShadowSha256 | data/architecture-v2/reviews/automated/retail-lifecycle-shadow-migration-candidate.json | 3d5fd5f1ef0176afe7295f22ef993e46d7399eaad34786bc0eee84f42dbea414 | 03e3fd14e6aa859ab62b24ab61fbb5832eb62c0753b5245be473a71eafb16cfe | 53a6646ee9cad7a15828578040884371d1b1733ce4b2b8519e12c71b7d7a2fcd | a9633f57fb50a2efc3d48491395a4a04df30d04c5a10a2163c73749e342d838d | existing producer validator | STALE_MIGRATION_INPUT | CURRENT_LOCAL_BYTES_DO_NOT_MATCH_RELEASE_BINDING |
| officialMarketLifecycleSha256 | data/architecture-v2/generated/official-market-lifecycle-migration-candidate.json | 342aee3c528443fceb584e0c330c329a92cd1e3f47f9765418ac7bff51f3745d | e38414eb9cde0d8328339e7499df5af0dd22a33d019b531c0af2151b634a6387 | 97b16640a3d13b3f456a89f77d26ac9fe0cbcce405659936b09cb14097efe084 | 373a99e91f6861f3999e2a0af8dd16f13869861e1311019565828dc7318e0834 | existing producer validator | STALE_MIGRATION_INPUT | CURRENT_LOCAL_BYTES_DO_NOT_MATCH_RELEASE_BINDING |
| releasePolicySha256 | data/architecture-v2/policies/retail-lifecycle-release-policy.json | 1941c9a79a6640afc3357699ce8eb1078f7aea8d8cf57770fda97e30f0426241 | 1941c9a79a6640afc3357699ce8eb1078f7aea8d8cf57770fda97e30f0426241 | n/a | n/a | raw-only | CURRENT_MIGRATION_INPUT_MATCH | none |

Manifest historical baseline: declared products 3515, expected raw 50a85830929e5298a1f484b0ea3367d7480a3ddb91247bf16d7bd93eab6e33b1, actual raw 50a85830929e5298a1f484b0ea3367d7480a3ddb91247bf16d7bd93eab6e33b1, disposition BOUND.

Live missing bindings: none. A missing required artifact or invalid declared binding fails closed before a report is returned. STALE values mean the current local migration input is not asserted to reproduce an external upstream state.

## Read-only contract checks

- The exported auditV3Baseline validates the active descriptor, manifest authorization READY_FOR_CUTOVER, and matching descriptor/manifest rollback status plus baseline hash before it returns a result.
- Identity migration, lifecycle shadow, and official market lifecycle use their existing producer validators and the returned document.semanticSha256. Catalog projections use canonical JSON hashes; these domains are not mixed.
- Active release, legacy default audit, runtime, and manifest historical declaration are counted independently. Caller-supplied counts are not authority.
- Dirty inventory preserves Git status path bytes, rejects unsupported path forms without rewriting them, reads status twice, and rejects a changed snapshot.
- Aggregate diff uses Git --no-ext-diff --no-textconv --binary plus one literal pathspec per allowed path. Protected paths, symlinks, and path escapes are not read.
- loadActiveRetailRelease is used as an existing read-only validator. Neither the default publication audit nor the active release publisher was invoked.

## Targeted TDD red-green evidence

| phase | exit | real behavior evidence |
| --- | --- | --- |
| RED: node --test tests/architecture-v3/baseline-contract.test.mjs | 1 | 3 targeted failures, 10 pass |
| RED producer semantic | failure | correct identity producer semantic 834f0021c83facefd7b341f49a6d181fecaf70128be7514c373ba0e3e4354946 was compared to pre-fix full canonical 48fd52b0a05b865e0be493270aecd5f1b0aac475defd057591a38bd288e0bd48 and marked stale |
| RED whitespace path | failure | raw path with leading/trailing spaces was absent and both identities resolved to padded.txt |
| RED literal star pathspec | failure | pre-fix aggregate SHA-256 4c3f1aed86a21624c258c2c82bbfcff25649ed0742f02e4fd4d7fd32008363bf differed from literal-star expected 0e5e4488c0dcf27552058a885543245c2b28913218976b1570282259c011440c |
| GREEN: node --test tests/architecture-v3/baseline-contract.test.mjs | 0 | 13 pass, 0 fail |
| node --check scripts/architecture-v3/audit-baseline.mjs | 0 | syntax accepted |
| node --check tests/architecture-v3/baseline-contract.test.mjs | 0 | syntax accepted |
| node scripts/architecture-v3/audit-baseline.mjs --check-only | 0 | default dirty root resolved via Git common-dir |
| node scripts/architecture-v3/audit-baseline.mjs --check-only --root G0A_WORKTREE --dirty-recovery-root RECOVERY_CHECKOUT | 0 | explicit root and dirty-root overrides |
| git diff --check | 0 | no whitespace error |

## No-write proof

| surface | before | after |
| --- | --- | --- |
| G0A_WORKTREE public/data status SHA-256 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| RECOVERY_CHECKOUT HEAD | 2593c68d8aa6932bc9cb31420ab399d77188546a | 2593c68d8aa6932bc9cb31420ab399d77188546a |
| RECOVERY_CHECKOUT NUL status SHA-256 | 7742f69ba67a858b6221586704184339fc280d8906055d29df24d3d734ccd68c | 7742f69ba67a858b6221586704184339fc280d8906055d29df24d3d734ccd68c |

No public/data/policy artifact or dirty-recovery state changed during the recorded checks. No build, publish, sync, recovery, OCR, dependency installation, network acquisition, commit, or push was run.

## Dirty migration inventory

All paths are RECOVERY_CHECKOUT-relative. SHA-256 values identify index/worktree bytes only; none is a deliberate unavailable identity, never a content claim. This full table is mechanically generated from the same live audit result.

| status | path | previous path | index SHA-256 | worktree SHA-256 | disposition | unresolved reason |
| --- | --- | --- | --- | --- | --- | --- |
| ?? | AGENTS.md | none | none | 5ec4958f331efeed4850880b6dafb7eaac0236e9da1d2fd9677a66753de60589 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | data/architecture-v2/generated/historical-appliance-reference.json | none | 4e2bec9b0755aabed81bf6ae2059795bc81f4afc62d3ea069affceedd4543e97 | eb9b56cb79df1346b36fc04d27fd932231ff252b1f90dd7d0817370eb3bea2b2 | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | data/architecture-v2/generated/historical-reference-publication-manifest.json | none | 47989a605152af04b1eda09f97dcb5aab1ee23a867d3e1ac59ead091f6eb1be6 | 12c3c684dedebe9723fbd9b681c821e6400ab9bcadf2d2dbc510ee5d5a09d69a | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | data/architecture-v2/generated/public-catalog-projection.json | none | 50e6f7e1d5bde1a0721e864ec6d215d988645fc82b162d9123f1c0d25e00176c | b8c759083f3f81d65664bcaeff51d0dbc19c0f3e5944d69033cbd4edba80cac6 | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | data/architecture-v2/policies/manufacturer-document-strategies.json | none | 4b2757cd4dc7e5dad11356c152b0b958fbad23f88607077d79a812a6b3af5beb | f9c94119af91bdc3ee4e58bf4a56b2fa8c96adf0edd47e7b8cf62f39010f7779 | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | data/architecture-v2/policies/manufacturer-source-policy.json | none | 32b87021db50a7c0c4c6955b1347ef5ad1497645ea77b9a22d64c844cc38ab4e | f246b1a9f82db75364f139815bf5e2f1da21e6b150308414f035a5d0baf527c3 | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | data/architecture-v2/reviews/automated/adjustable-height-migration-audit.json | none | fd5123142f5f12326e8782fb5411036e14693fc53b603a0a7180dcf9f7c885cd | 1485236df4b0b83982d04de6854d793cd3374b78d5e0ebb2bdfc383782d2c7f5 | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/display-model-sku-bosch-canary-batch.json | none | none | a9ef4b395c78988dc1468b32a4d639055f324b59efec51dd8b0491ddfa60b8ab | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/display-model-sku-bosch-canary-results.json | none | none | 119b0b504925e887ef7619c7c9db380201d08c98124b4c4c2a804a3f452699d8 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/display-model-sku-bosch-canary-results.json.checkpoint.json | none | none | d740648b454716630a7526406c5e2f5b5bc591a602545178788959b856cf2738 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/display-model-sku-fisher-paykel-canary-batch.json | none | none | 3fa3d828158cef5197f64b527d66524b3cd9a93532192c76a1fb03cde6ee8a6b | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/display-model-sku-fisher-paykel-canary-results.json | none | none | f006bd753c9b378545c73764007f16c3e59fa6b1768c852370ab45e71dbed7ac | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/display-model-sku-fisher-paykel-canary-results.json.checkpoint.json | none | none | 36414a6b825f6c9bf5cb113b9604485f73a5850b1b2bc8bb2fe1d7dd2d53c7ed | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/display-model-sku-link-manifest.json | none | none | 04d9d5407aadbfea977f190096482b3e83638a2d79a5bf86a8ece00fe6c852cc | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/display-model-sku-non-bosch-canary-batch.json | none | none | d06b24fde4776f146ecc1845580d752b10cbf951399e76cc8b5a414ff16703f7 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/display-model-sku-non-bosch-canary-part2-results.json | none | none | 3139b170edeb21d90e95460d1e8a0d3d766b56037801cede32164d87ed401dba | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/display-model-sku-non-bosch-canary-part2.checkpoint.json | none | none | b997e888565734806e0de335a06ec60aab33cfbba832559750efae2edc35e0c2 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/display-model-sku-non-bosch-canary-results.json | none | none | cb6ef404c16bdf17d6ad06289bf9ef6386d4ce8c01a1aac16cb04ddcbd3fa97c | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/display-model-sku-non-bosch-canary-results.json.checkpoint.json | none | none | 6bd4bcce3e83544e36f99e0f8f7ae497efe0143285d8c1b9ac5cef4292159e9c | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/electrolux-official-source-recovery-batch.json | none | none | 838371579a188f14247a12c48a70b8c404e987bbfc0dbe3efd8b9a6b6820efee | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/electrolux-template-acceptance-batch.json | none | none | bb21d63f7ee538231a8cfbcac79d0d96cc2672cb83abb78026644aa2a7ccce14 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/electrolux-template-acceptance-results.json | none | none | df67ddc32ab038ae2e4870c3486d56b359051d58d32dcc20c586a08a008ed41a | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/fisher-paykel-official-source-recovery-batch.json | none | none | 838371579a188f14247a12c48a70b8c404e987bbfc0dbe3efd8b9a6b6820efee | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/fisher-paykel-sitemap-recovery-batch.json | none | none | bceb292bd56bb63fab46dd3401ae5e6f805a1d0aced4c1e8a1d7d3f819d70d5c | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/fisher-paykel-sitemap-recovery-results.json | none | none | 4e9d9dd719bc9bc5f7ac9e347c9607f94a42bdd87f1d382b530d74e9c866c0a3 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/fisher-paykel-sitemap-recovery-results.json.checkpoint.json | none | none | bbd49b807422a5e5fc1ed674de1f18431a9fc9d86cabbb953681227b57ecbb05 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/fit-decision-ledger.json | none | none | 54a460eb764425cf7be38a142475b5b987d05068552fd70e4a5fb2dd85b32074 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | data/architecture-v2/reviews/automated/fit-publication-audit.json | none | 79a436a9a2093233946f99ebb15c484087650f3819c280811a09e9e900b733e4 | 48bfc80e24725881a97f71c4888b09b4d02476e4d92d13f1679063b29bb635c9 | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/full-catalog-evidence-coverage.json | none | none | df8ae898b7d952a2193b8b1dbd1ae791956cca5fa802605803e11ffbc83a10c1 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/historical-evidence-recovery-official-batch.json | none | none | 7b30d1503adaab0f895fa7851e34dd6badae7b81ecd30bcb2eee854cd16eddbe | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/historical-evidence-recovery-official-results.json | none | none | ed101ef0f8d49e98a4fb59d7d54c9ed7cc5dc70c13e0482f13e013fe66779a69 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/historical-evidence-recovery-queue.json | none | none | 4f96463bbf0f2569a0017c4e7a05b215089c6116e6acc0a3555c0cd1b8b3ccfd | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/historical-graph-ocr-reparse-batch.json | none | none | b7f28a806201012121b690a76c1c7a9a8749f230d1da6b69066dedffa12276cb | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/historical-graph-ocr-reparse-results.checkpoint.json | none | none | c241f1a4033b7096b1be76e1fa53e12bc7197ed15c618005e6d9c76147075da9 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/historical-graph-ocr-reparse-results.json | none | none | 16d31a65fe91992e71037b01e11180981c25148ce09a8c93c392f2facd64af8f | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/historical-graph-official-batch.json | none | none | 95775d1419838231714908c37c29430a78990745870dec84ea029e6acc612a2d | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/historical-graph-official-canary.json | none | none | 66077820fde32bd00d62a737b0e6996077e7aa9823afd266a965246a33c2e46f | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/historical-graph-official-results-part2.json | none | none | 1784d48b9bf4b2fd2405f9cba114a82fd0709a9cb5046aa419984e168fee2265 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/historical-graph-official-results.json | none | none | 30f71b1194cb3c6cab270c79f513117296c2d913af94c1b9dfe6b47a9b19389a | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/historical-graph-source-recovery.json | none | none | 854bc027a339bf1dabaf258b513ad99f258313e446e1b231533a52a6f1a6f1e1 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | data/architecture-v2/reviews/automated/historical-mineru-backfill-audit.json | none | aa1491de161eebd312cf107b529ce6fb720ab0175edce37d0af23340567a186d | 5d9690968dc0bc8a1dd6cd79a99cdec9a58376169016ae9ad8cc1773b169d875 | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | data/architecture-v2/reviews/automated/historical-replacement-audit.json | none | 09c9d5436d7be8ab26cecdd9afca3587b8b60a589659cad65d1c657dff82906a | b764952f01f7376c00548dfbed0fff13f4d3161de0582b4fa900434a3f08886d | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/manual-evidence-official-batch.json | none | none | 09be7c55973a8fadf38628671b5140b860a245f8d7c2ff86bf50d36874dbf4bb | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/manual-evidence-official-canary-results.json | none | none | 2e705745abf594cac356c70befef133dfaf0eb9836f1392da3c2f204b0bbb127 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/manual-evidence-official-results-ocr-repaired.json | none | none | 403a6b521969f50f831e4659b26fed69f6ad39480a395c3b5a2e0cc8ce8e5a50 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/manual-evidence-official-results-part2.json | none | none | 8580a8846b02aeb80ad395bd2c7fd4fca81eaca9af27be9120f2bf9c1498f50a | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/manual-evidence-official-results.json | none | none | 403a6b521969f50f831e4659b26fed69f6ad39480a395c3b5a2e0cc8ce8e5a50 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/manual-evidence-storage-audit.json | none | none | 7397a84918587764582d954fd285b87c6acd262b01aff6d4351f2d676acfdd58 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/manufacturer-template-acceptance-batch.json | none | none | 4752ddbd992415d609393b6cccd0e8d677e9097fc72f499790a6023e24d8713b | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/manufacturer-template-acceptance-results.json | none | none | 0313d9ad7a6d1145b882de0a64f1a75bb243839c059ae13793818af7d15412bd | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/miele-kfn4776-official-recovery-batch.json | none | none | 116f6f4ee6d7e616d478d4468eb55a855029dcc09d85087e9d9da1531ba02f99 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/miele-kfn4776-official-recovery-results.json | none | none | 5d40539ba25fb55fec2abc31148f3ea4e244ffabcf8b0e31ecc866db56d73f68 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/miele-kfn4776-official-recovery-results.json.checkpoint.json | none | none | b0146b2edd2c86b1b376135d49a57e0d303141e086b7e591fd06e3132da6ed64 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/mineru-filter-validation.json | none | none | e20bb7cf1a48932efaa39df9666fbc78878c3e13ba82d793011f86508c57960c | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/official-sitemap-recovery-batch.json | none | none | 4dcf07bf09133416890890a5cf1947097254e87077b28b61c42aedbb70c79e4e | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/official-sitemap-recovery-expansion-2-batch.json | none | none | a4923f3ba5a2f576e22efaf7e255acf5ca0fc51ba8acfd89db01feb473692cfa | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/official-sitemap-recovery-expansion-2-results.json | none | none | 2d68d844d72b5cf2f23d913191eca7e63e5bf2019b2c3f38a8e2ca6cfe3fb43e | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/official-sitemap-recovery-expansion-batch.json | none | none | ff849e6563afb5c3b74a009815d061ad5afca1a0131b37bfe678ea2a45c606a6 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/official-sitemap-recovery-expansion-results.json | none | none | 30e14aaf224d8d82da272a3638ed2a65ef586d27ca293a6b4bc8d8462900fd01 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/official-sitemap-recovery-hisense-batch.json | none | none | 20505b0adfaf3e500b72e057642388ff24417f01365ee10d64aba4c3b98108cd | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/official-sitemap-recovery-hisense-results.json | none | none | c58cdece1be5253f82bae56a1ccae286b2bd97ab5be85b6d43e7b8edb4abb6dc | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/official-sitemap-recovery-results.json | none | none | 4f033fe68564b353241a4a47956e62263c597fa8aab4c2ab50eeea87622658cb | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/official-source-recovery-batch-2.json | none | none | 2d43ab09383218a0b6986ca1749d6780815ae1975c83d5ef5427c26a9b5d9a87 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/official-source-recovery-batch.json | none | none | f91eccc4a896efce83251d9b51f201a7191a87467adab91122c3586d49266145 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/official-source-recovery-queue.json | none | none | 0bf924e919d5e3c4fec5755249aa21e153fce2f2543e4d98dbeb7787db99e31a | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/official-source-recovery-results.json | none | none | d4958a98f5f620c34199efe0b37ed7bfc8809f863a6c9fb378ee350ebfb41c1c | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/reverse-mineru-official-rebind-batch.json | none | none | e6d82e734e690d2fa56159f5dd043d100dfe1fffd1a87c8f79d17a7a55dfad0a | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/reverse-mineru-official-rebind-results.checkpoint.json | none | none | cce01411913f9056c117b97e48db1d78bd6dfe812ed90c3f961078d1c2073bec | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/reverse-mineru-official-rebind-results.json | none | none | 2f673d708e27e22191c1c666a98edbf951da6c68df539826dbe1597639128605 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/reverse-mineru-product-candidates.json | none | none | 6caa9f6a3be162ac14bf84052c0ba9f0a4851b1aea443c02b53b0f0084a627be | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | data/architecture-v2/reviews/automated/structured-evidence-chain-audit.json | none | none | d182b28336b689151dcb355931abc1789417c61737ad41f6fadcb6e84e309c9b | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | docs/decisions/2026-09-13-miele-finish-display-model-investigation.md | none | none | 1909a5786a93f9eb4a12de14a2d23cda0594d528f375311096e50ffb7f5aa5f8 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | docs/decisions/2026-09-13-official-pdf-model-scope-policy.md | none | none | 288f3759fbd49d79885749b562a5cc30b7f6f00cfedbf51d854dfab40b6f50b6 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | docs/superpowers/plans/2026-07-12-historical-reference-replacement-engine.md | none | 30844ed5cee5f9e7b0bff2f4504a983957c496dc75d17e42847104096ec71695 | c0d33b9905b1d142062334e4ede7d2046dcfb06b7a0622c1e898363b72100d9f | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | docs/superpowers/plans/2026-07-13-historical-evidence-coverage-recovery.md | none | none | 68cfcac4f0ff1332245807d5ebf05de346aa473b6a91540148194a2d9d85f9ee | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | docs/superpowers/plans/2026-09-11-fit-v4-full-catalog-evidence-completion.md | none | none | 321ea05ff02600bed2e9564d0365b0608f676a902d0ab20fa08e7335ffdf0488 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | docs/superpowers/plans/2026-09-11-fit-v4-ocr-first-evidence-chain.md | none | none | 6f31db062a385d1394b7086fa783b19168fcc6542289c4dfe37add0cb884b4e4 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | package.json | none | 4846284a10eab24d2493ef48c5d959c0baeab8cae5fe2b33727277987675b14d | 510aedd54768d59b3c136a637f2861c5dbef835b3629af02cb98c1de440ee8de | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | public/data/replacement-reference/dishwashers.json | none | c404747be3c86635ca5038bdea90864dd3b5d76166a3daa8dd76a740290a8e6f | f3d12c2e45355788ca1e7f2b4b0fdb48f8c3732aeb793cf0e2580188819ad299 | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | public/data/replacement-reference/dryers.json | none | ce77773428fe6f504c85b30843487c0f57f0a0f2ffc9321bcdadfc79e91c9a27 | c30eb69f4b68401391143febb66751781c179d5b2731246fd46585027b7dd55b | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | public/data/replacement-reference/fridges.json | none | ac6d581173f884506fa86953ff5e080e97bedb56fe8d12367cde6de3c4d16eff | fa429cc0327678f67b45f9c1a2a3475f82059dbc875c575aec0f72126ec38787 | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | public/data/replacement-reference/meta.json | none | bfedec795fe9b897bfbfc412a386ed72e4e6c0de4e88d8733a58b20e6397f429 | ac7f4978f660deb30aa7029737fedd0839965845ec9eaae760a346afe75874ad | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | public/data/replacement-reference/washing-machines.json | none | d7c783b1780c6eacbfde52f9efafa4f8fe4d3d7c0d5a18df6567516663d3067a | 5fcb152c3475517e1e59094f577c37accce1a324be83c61a3c4e9b7328ab42e9 | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/audit-full-catalog-evidence-coverage.mjs | none | none | 578dfb17c65dcb7b703464733edc8bfce0d9f6898c6f5a39a5af141bee8653e1 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/audit-historical-graph-source-recovery.mjs | none | none | 2a20ce111c76fa76725b27995593b170ec5155ffd3bcde7d618ab41675b89963 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/audit-manual-evidence-storage.mjs | none | none | 359363c8faa537a9a5aa736bd61c384007b9f1a8f29c26f0d451a7981763c666 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/audit-reverse-mineru-product-candidates.mjs | none | none | 690c8c91ec0700812c255d317286de0ea4097afed91181fe7c7d3ac35e2779a8 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/audit-structured-evidence-chain.mjs | none | none | 2d47bf11c36445d1b55d9f111de982d9b085804ed85208eaf9bc8243c8d7dcdf | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/backfill-ai-readable-artifacts.mjs | none | none | a9325e13d5d0a633392db46ed3fd2f51100a9cbb0d4fb2e891de7dbf3222006b | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | scripts/architecture-v2/backfill-historical-mineru.mjs | none | d13bf2dac4fbcaf68300e25f13a00d7baf1f43e5ce9aff9d7dd1ef45101537a5 | 16363b1ccdfd85b811dd82413102bfe91e453831efc5e9aa5a48d3b6d51725cf | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/build-display-model-sku-link-manifest.mjs | none | none | 41d1d4542eba4b253d969f17f10abb798bb1cd412d58a0d9c1e77208b673ffcf | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/build-electrolux-template-acceptance-batch.mjs | none | none | 8de85815f411fcd390e0d5e878cc0b3b770a098b8d0a2ec999769f6d0a1fee2e | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/build-fit-decision-ledger.mjs | none | none | b8e02d3fe76638d5030359a8665dd8615bf708f938af4df6b8a0569884424460 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/build-historical-evidence-recovery-official-batch.mjs | none | none | a9e34100fe7cb9167cf00f0387f2df0f02200002baa75439b9c74c86da56a669 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/build-historical-evidence-recovery-queue.mjs | none | none | ffd8b224d630384979e77d3f9c0ab3222cc0a71371cb34ebdc971f75c24e2e9c | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/build-historical-graph-official-batch.mjs | none | none | f0b7e85195372adc95035a9aba1031fa8f678490d3a7dd5515f949eea6d5a862 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/build-manual-evidence-official-batch.mjs | none | none | 0af5c313c252da7e693ffd4ef6bb81e775f800fcfcbeb585b89422e8754bbd2a | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/build-manufacturer-template-acceptance-batch.mjs | none | none | dbd0e3a1ea3cdbfc10558eb021a90801f5d22f2824fa62287984d4eda80fe0ad | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/build-official-sitemap-recovery-batch.mjs | none | none | 7c9d88a5212cd7b901d15db0a79873e6e44c0528f3785636374242f484b07132 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/build-official-sitemap-recovery-expansion-2-batch.mjs | none | none | a63b9350532f8af98818aed98aa768f57470199890f40f0d0befa7c13a67d19d | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/build-official-sitemap-recovery-expansion-batch.mjs | none | none | d00e85c9f9d075da314ea1603a0c37277aba85f29353d34867f55acdf4ad669e | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/build-official-sitemap-recovery-hisense-batch.mjs | none | none | 17c8d2e3c9955ec85889d9312012a06a54b0ed2b6e277692b352948c6e7d9ab2 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/build-official-source-recovery-batch.mjs | none | none | 49418100cd36063a43549794d6fe920b1c5bfaecced1202a075904486f1a026a | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/build-official-source-recovery-queue.mjs | none | none | c1ddae7077b1cb6eb0276e64325f57ee454460d5361d53d4399aec10f9b8a548 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | scripts/architecture-v2/build-public-projection.mjs | none | bcb418acded453131f0f8474d00044d56cbc3d857d7d4eedd7c91b97cd91c453 | c0145d15405f04b84d26dc7862ee11a9332936897315dedd92a3c22f02bf08da | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/dedupe-acceptance-result-part.mjs | none | none | e6add3e55e850e3bd5db0914edb79b682859b59462134904c73436b5f7057f47 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/finalize-acceptance-checkpoint.mjs | none | none | e1866e7c9410a42ad5e5b70b43514938d545bb5316404769a4c83fca8158b7c8 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/merge-historical-graph-official-results.mjs | none | none | 83986280a4ead02ae363f7a868684d569766cc8d556550efecea52ec573100d8 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/merge-manual-evidence-ocr-repair.mjs | none | none | 728f356c4fb9604bdd700bead560527936f4ed866cc30af3bb95b3663a1c64fc | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/merge-manual-evidence-official-results.mjs | none | none | 7adb0b97bce983dbbd9c98d9e939d10f075b5173300c53a654a6f68ad1b38c82 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/merge-official-source-recovery-repair.mjs | none | none | ac675cafa73e6ff0ee23eda5a12c11bfc8631381955c2bb2dce20741b6009d30 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/merge-official-source-recovery-results.mjs | none | none | d07f8c06cda0581366f529ea4285ecaf8b4000a99cab7cc924f1b22ecfaa2dca | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/reconcile-official-source-recovery-batch.mjs | none | none | 4c788ae0af5bc306c502d5523c1e99cea853f89e185f5bec4ae82cbefbf0268d | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | scripts/architecture-v2/run-pdf-brand-acceptance.mjs | none | e904d464da05d1689cb96dbf157e5925ceb7a8e8bbad9411ff2483d31256c051 | d4515c037b9baf221a0f39592427a6a77fb665706ab8949e283340b8f478016e | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | scripts/architecture-v2/select-official-source-recovery-pending.mjs | none | none | 20cf48f573282d140a02d0de9c41a35418cc941f1f1ece147b6438ea060d377c | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | src/domain/acceptance-results-merge.mjs | none | none | 3c78d8d2a27ad9b6bc62d13acc66f41654d1d6258c0f8b04581ad049a182114d | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | src/domain/accepted-evidence-publication.mjs | none | a6e661e9c1bdd17c59b2867b9b4b44b5b2c03bdea92a48697b70f9746fa4cbb2 | 9adead0e8444dbc12e9177b67c51f41e34ce3e9aeb14704b27e607fc568f9b62 | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | src/domain/ai-readable-package.mjs | none | none | 3211ed1c6f37f3f20f494553ec832b5325820ffba95d0ab4209aa8f3d3ffac54 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | src/domain/architecture-v2-paths.mjs | none | b676f02c29a8b474b00749d5d76d93a062cd51b22d7966f0c82204adc54a79b9 | b30c29bc760930c4326421bd20d604469c41b48dc4dcb68915dad1f1b2948b3a | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | src/domain/display-model-sku-link.mjs | none | none | c96fe5828a7ec0b99c45bd801104f1bb797b1c5d7a9b3b7e20615803d747f300 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | src/domain/evidence-artifact-verifier.mjs | none | 7ef3cba522976fafc4097e9e186d5cc36786ebf74e50a8a591fc1a54c1647233 | 3a6a1d25fed981fed9da81ec32e92a5aa4bef9140e58b7c55e9305538482526b | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | src/domain/evidence-claim-semantics.mjs | none | a593cf31cb16c4a41a5280b189f0e16fcf2d92b341751502daf36566864ce88a | b5dd56898f035f96cb7618b076930f1d6a717bd48cb2278747e197d809023b1b | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | src/domain/evidence-research-runner.mjs | none | cfee12c7a9a2ce454abc95995ba538430a8c31f13f39fe60d3b07ea446cdd799 | dfaf8f535bab34d3972154f9b5ac97f7f3ebaf0b3188296a9b765f93498e25dc | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | src/domain/evidence-source-verifier.mjs | none | 084e5c14f0fdc4f48cd3dc539c4f2fd2c0cf61e7cd4102e0e84a7bc2783f29a9 | 6207781b3d022e3f00b8a38002ca3e290d6eeea060677fcebf78fdd3be93cfa0 | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | src/domain/fit-decision-ledger.mjs | none | none | dd146a4f74f0f87178a062d2e1d56338b1167e0d3826649968276cff17fa63cc | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | src/domain/full-catalog-evidence-coverage.mjs | none | none | a28f91a57298f1823717164e8afb2fe100c0695d5ee28fef471ce2529394c4f8 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | src/domain/historical-evidence-recovery.mjs | none | none | 8894b4350121ecdaf6298af0057eab8ea5336c1731f31a0a248aaa7f8b766415 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | src/domain/historical-graph-source-recovery.mjs | none | none | f6492257c0d6c642284a3cb894cc6b275aef206e41478ac710d30891348aa32c | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | src/domain/manual-evidence-graph-input.mjs | none | none | 0ec7ab806947dcb43433628a8b03d6039acf65b34d2c5a448d7422f21158bf40 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | src/domain/manual-evidence-official-batch.mjs | none | none | 20d224d0a0fc500358a60190563e04e3242f2b9f11a1cee9c4663fd63dbd0d88 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | src/domain/manual-evidence-storage.mjs | none | none | e9bc14d29f06ce22119d6bf4134c478f93cd4a44567dd62e3be35dd3b095f81d | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | src/domain/mineru-artifact-inventory.mjs | none | none | bbf8169f6b5ef929a8ea8620d005c4989440b965e3e8c4d7938f564911083b6a | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | src/domain/mineru-document.mjs | none | f634f169852a995517bb5d4c4a3b4a4e65c90e22d67c1629077209718b835fa7 | 8b2383fd3e36a7e098709b97b270c2912958a06c46f5d5b8568613803f40e7b7 | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | src/domain/mineru-runner.mjs | none | 052a3871a8b1c7d538115f8d610a7622da94156feabe2f31941b5af6744f4edc | f05dc54bf563b4e4c27cd9a9c03ede87e3c5394221d2926a57c28f3aaef4e5da | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | src/domain/official-artifact-transport.mjs | none | 09a130fa97978e1fbcc5109a6cef98a70cfdf63fca89997534fdf428efeeffb5 | 6cad3c8dcf722e3249575c43a1e2bdeda3152903df0f08ee702d415752815260 | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | src/domain/official-document-candidate.mjs | none | d42a56ef89ed936113af8c5d1b45aca1f7d30bbe634fffcb7c148184bb5bf860 | 310c8042d55c312d9cdf713e51c46350e78c76d3ea4fd60e35ad761666a2b488 | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | src/domain/official-document-discovery.mjs | none | ba3709a33716e39bb17973d2dcf87f743b16fe51f5601feacd331eceb7bbd67f | cbd95c14cf787578b398164848ca9e735ab5ded99e76713eebfa961ea4d6c93e | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | src/domain/official-sitemap-discovery.mjs | none | none | de5564b400f52014547b5b9712ee4c22a57f2450d14346637d5bb53d1b397831 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | src/domain/official-source-recovery-batch.mjs | none | none | 2d6712c5f941cc9bd032e0a63dccce6bf839c01478a88ee56178e785c47c15bf | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | src/domain/official-source-recovery-queue.mjs | none | none | 7499598cd898dab391a23d96b9f12e94f41e8fb5d9baa46746ed400d59662388 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | src/domain/resolution-evidence-graph-input.mjs | none | none | 73dcada258f6e6df19b4f5ca2dce9fd844ea6287a4dd65fdb9dc9d6e0883e76b | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | src/domain/reverse-mineru-product-candidates.mjs | none | none | ef1b55dc01a9f041aa875bdbdc4396c51486dbb319cea862db8aaafe4f4113a0 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | src/domain/structured-evidence-chain.mjs | none | none | fa0f7229f8c63174f1ab741a35bf41f8391ca959d566056c9e9e63d69543a9ad | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | tests/architecture-v2/acceptance-results-merge.test.mjs | none | none | 81bc36f732d6af2c758b79daf76c6d683909d0a104a16d8321ea5d14c881f469 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | tests/architecture-v2/accepted-evidence-publication.test.mjs | none | 5f5b7b9f530921c704f89cd3c83412d59b4fd807d605fe5513856feca960c6aa | a6afc018123d055aca1b5835406d9766af5b46c48a3f497af931de8ed021e559 | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | tests/architecture-v2/ai-readable-package.test.mjs | none | none | a4ea2ff6cd82e5a8bee17bb0f090ccc1c1a8e395fa5badae1ef11b82113df7ef | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | tests/architecture-v2/architecture-v2-paths.test.mjs | none | 1aeff8a666a54d55f84b8bedaf7c093f61189c8514a71d15f6a51f58411cd416 | 9ad8d223eae89cb9159b3fc96414624e7d0c27eaf70703536a1938bdf4b6d5cd | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | tests/architecture-v2/backfill-ai-readable-artifacts.test.mjs | none | none | 5e0b8ecd128ec2b7b9d9a66c8f1821910e1bf186812d9d59f7751387918b26b2 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | tests/architecture-v2/display-model-sku-link.test.mjs | none | none | 6e355828146648de2259919166b8a759be58fe4a3744b280bb3d82fd56042be5 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | tests/architecture-v2/evidence-artifact-verifier.test.mjs | none | ae6f3acc73e1d7a074d5b55b796a115948dac958edf8c3a0e4bfcc26a2280643 | dbf50a529454a7c373414ee02c6d4230668c26ba03e27c7e57eef8ba19e35f57 | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | tests/architecture-v2/evidence-research-runner.test.mjs | none | e1927598378d479516ea919dcf2d8021c8d49058a6436906050fc831dcc31356 | ba3052c7c892d119e0bea38ad7a3d621de4def495efea7c567e2e2a6810e89c2 | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | tests/architecture-v2/evidence-source-verifier.test.mjs | none | 06f3b1931f53ffe1b871ae3a11006bfd01cf90a8ec2c714444761c2de436fdd0 | a8f603a28b2c8deff55a8cecc71383dde19220cc78d5a65f0097da7e9e868bb9 | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | tests/architecture-v2/fit-decision-ledger.test.mjs | none | none | b0086b552131c231e1afc8dc9b812c4a9c5013a5a6ec8844a1d4945d138eff0e | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | tests/architecture-v2/fit-publication-audit.test.mjs | none | 0b7362c3d1b126577af41f7185183ed9fde4427dab18321d5e6a3a76d0ea051b | 54d49c2a2bab2e94407b25137c7400a45f55bbb1dd9c0715ae335b919d19d03d | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | tests/architecture-v2/full-catalog-evidence-coverage.test.mjs | none | none | 94696081362d7946170c8ee537bbe74d6b627bc2a3cad6d74306bb70e63a58b2 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | tests/architecture-v2/historical-evidence-recovery.test.mjs | none | none | c15a5196803b22a8f41e7ed659f4a4489c4398b1b3704a1df8aeca5fd1dadf89 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | tests/architecture-v2/historical-graph-source-recovery.test.mjs | none | none | 5bb18312519a434022f8950af374639fdbab4e7992889a707cf4ee6a878709ce | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | tests/architecture-v2/historical-replacement-audit.test.mjs | none | c267f0cf1f1a50a071688fa7a154b856a70cee041160e201eb8a45faa9cdf15b | 78b4e2cdf49f7d4ff12b58a667f779b58407e5a84368e17ce45372dfb1fe9d64 | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | tests/architecture-v2/manual-evidence-graph-input.test.mjs | none | none | b00c6df1403107f4b8f8275089c097a50c84661255e488fb43f2585f7bd8b673 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | tests/architecture-v2/manual-evidence-official-batch.test.mjs | none | none | 51da5a52804705a8a8b65949746cb0b5d41867f212e3963510854149d06930b1 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | tests/architecture-v2/manual-evidence-storage.test.mjs | none | none | cb96f901f0fb07dea23c2afd6b49029de185e5708c0593a37431f2ef8613bdf6 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | tests/architecture-v2/manufacturer-template-acceptance-batch.test.mjs | none | none | 4ee0c0c7f00627074482a4c9afc79453a4bf1b6f6a7b11e22b6eaf8ebf394d1e | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | tests/architecture-v2/mineru-artifact-inventory.test.mjs | none | none | 33eda6c666da73ecf4cfd87ba3ff6bc7a225e45b728403f9fb0a39b218642f23 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | tests/architecture-v2/mineru-document.test.mjs | none | fae4b64d0446381d1973ee19af12d94a4dfaae14ddbe46f9b09b3798ee2527de | f6abd0c061294611b21573e4f7a272f72d9ad807c99852a2ce19801a99dd75df | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | tests/architecture-v2/mineru-runner.test.mjs | none | ad98095de2f3400e8fc14ea2abcf2615b4aa98e07bbe5c3afc955abbc8c842dd | 4eff7772bd6c4205ed8947beb4b989bed5e8e47a00e07bbf040f0eb1b3c00fa2 | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | tests/architecture-v2/official-artifact-transport.test.mjs | none | dc33895fd117b270401a5aa9d11548096d11e1eb3b95501e4a9f9f4369b170b5 | cb1209e43daae11b88c32b1a1b25130be8e2ebf82df2214f77a6ca3232e0413a | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | tests/architecture-v2/official-document-discovery.test.mjs | none | bfb8ea47000c90c33e97592d34afed8dfd6dfbc9c251475111439d1604f4bdb6 | 0693c28a1541eb3374370ac0a8125363fe726ffd25d90f6f2f9f006a85560b75 | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | tests/architecture-v2/official-sitemap-discovery.test.mjs | none | none | d6a6e8d39c8f5314ae847132593395af545db5f34fb1b43fdd97d79f38e3c2bc | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | tests/architecture-v2/official-source-recovery-batch.test.mjs | none | none | 749beff056e9dcb71b58db9e7a000c30708bdf99211751c9812b9ce863737cc1 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | tests/architecture-v2/official-source-recovery-integration.test.mjs | none | none | c227195413f213147037e268e4391a993f4d5c2474dd0aeb31573fc58c61b930 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | tests/architecture-v2/official-source-recovery-queue.test.mjs | none | none | 99ea20f0961c66edd940f7fcedf9288a6707b29a10face1338e67439b548a7f5 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | tests/architecture-v2/official-source-recovery-reconciliation.test.mjs | none | none | 2fa499ccfa64af76c97167cc36703da249763385d5c0ca3f4e8dc90a1227fdfe | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
|  M | tests/architecture-v2/pdf-brand-acceptance-batch.test.mjs | none | 681ea424aad81222586555cba3593911e394a4c16d528a3e899f1eb3dbfccaa3 | 4fd531928ac455e6d0e9da3158a9fdcd553385ee15e3746c02d58fd6ba566e87 | TRACKED_EDIT | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | tests/architecture-v2/resolution-evidence-graph-input.test.mjs | none | none | cf6fdab101a634c8ae39fc79090e781c05ac1656ac8cf43a66b116da9823def0 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | tests/architecture-v2/reverse-mineru-product-candidates.test.mjs | none | none | c28f9ebb05f8a9519d525043e6f10b520214a5daa372e7247ae2de34af4bb46a | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |
| ?? | tests/architecture-v2/structured-evidence-chain.test.mjs | none | none | 55b4cc37e354ead0b56f76254153a99c10a0eceebc0fb408956f82ee7f42ed54 | UNTRACKED_NONIGNORED | MIGRATION_DISPOSITION_NOT_ADJUDICATED |

## Unresolved scope and handoff

- 2 local migration bindings are stale: candidateShadow and officialMarket. They remain inventory evidence only and require later owner review, not automatic regeneration or publication.
- Canary: NOT_RUN. This baseline gate is read-only and has no publication canary.
- G0b, schema changes, migration application, publishers, and release actions were not executed.
- Review required for the two stale migration bindings and the bounded dirty inventory; no user decision is requested by G0a.
