# G3b router and profile canaries — executor record

Status: **REVIEW_REQUIRED**

This is an executor implementation and verification record, not an independent audit, approval, merge, release, or deployment record. It freezes the G3b working-tree state for the separately assigned review.

## Scope frozen

- Structural document-family selection and region routing only. No new semantic fit engine, claim, receipt, publication, OCR, network activity, or persistent canary state was added.
- Portable mode replays sanitized fixtures. Original-object mode replays the accepted batch, exact PDF bytes, selected MinerU JSON/raw blocks and pointers, lineage, and applicable page-render/rotation/transform records.
- The historical OCR record remains `INCOMPLETE_RECORDED_TOOL_PROVENANCE`; its missing `tableEnabled` and `formulaEnabled` flags are recorded limitations, never a successful tool attestation.
- Earlier G3b scratch captures remain untouched. The captures below are new, `wx`-created records and are distinct from earlier oral/console status updates.

## Delivered files and SHA-256

| File | SHA-256 |
| --- | --- |
| `src/domain/architecture-v3/document-family-registry.mjs` | `9fb009cfd5be611f5362f93008d68ad9021ee92eb80b8c9271b09baceecd926a` |
| `src/domain/architecture-v3/region-router.mjs` | `5d5e568ce7efa94c415b1d9e75f511e2d86898a8bc755bb787a4951a7a746726` |
| `scripts/architecture-v3/run-profile-canaries.mjs` | `461faec6b8f8663ca19df94cb78f045f5f5b13e51e5c1bb1894eddef82c08e3e` |
| `data/architecture-v3/policies/document-family-profiles.json` | `7eda21ad3693e8934808d4ff7e38203ba4b97e93c61d54a7fd8f52af270294a8` |
| `tests/architecture-v3/region-router.test.mjs` | `82d8e02f24bc518bf7e944a455e85db63ca0dbf7fb75fefc6221c597f51488d7` |
| `tests/fixtures/architecture-v3/profile-canaries/manifest.json` | `53494340a8a2d17bfd7b7b11740c2d11c694d6f4321c869b5c47bd3f74c236e0` |
| `tests/fixtures/architecture-v3/profile-canaries/bdf1620w-p1-structured.json` | `137e5d87be9be08db627c8484cee5c0bec44ba35df0800c8ea175151436baa69` |
| `tests/fixtures/architecture-v3/profile-canaries/bdf1620w-p2-image.json` | `c4093d68b1b55fc13e682e33ee4a38e9b5117b742fa3557a461f552e7b3930c9` |
| `tests/fixtures/architecture-v3/profile-canaries/bdp810w-p1-split-columns.json` | `a7723bb82db4179583b017dc901df6ec9872a09a53baf710e604e0c2ebe20c90` |
| `tests/fixtures/architecture-v3/profile-canaries/bdp810w-p2-table.json` | `169f5568f6975620a157070ec6d18e2a450202951ae1006e90fcebef57dd94c2` |
| `tests/fixtures/architecture-v3/profile-canaries/ewf7524cdwa-p3-table.json` | `f26a5f56757b945d7e74e61f63cf4167cbb8155f254188f8ba42e916d67d2def` |
| `tests/fixtures/architecture-v3/profile-canaries/ewf7524cdwa-p6-image-context.json` | `18967beba40b25e54083aaf80ac38b6a2c02a255e33c45d86de06edb09be3aac` |
| ignored capture harness: `.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/G3b-router-canaries-capture.mjs` | `778aedd12db2ddb6340986abc57b9ed8816f5acfed13b34f33d43d03f0a5deaf` |

The manifest’s self identity is `26c7d263082767a577fe98cc3a6f7f99afb1c33d32cff4eda5932b64b4defe62`. Its code identity additionally binds the existing brand-registry file `data/architecture-v3/generated/brand-registry.json` (`cbb4dac77938ae0f9bf40278325b42a33b0e61c6403a5212eff9e9a05e7dbf0d`; registry payload `9f462e007851692a191fe47d462dce390129afd4d6edf0b047a41e9492bd04eb`). The policy payload identity is `9e3c2d99de044203bdf1f33fa74f754fea89f42a2d4310429204c57c82120326`.

## Profile and source bindings

Six active profiles use one positive and two negative source-hash witnesses each:

- `beko-au-dishwasher-image-v1`
- `beko-au-dishwasher-structured-v1`
- `beko-au-dryer-split-columns-v1`
- `beko-au-dryer-table-v1`
- `electrolux-au-washer-image-context-v1`
- `electrolux-au-washer-table-v1`

The accepted batch is `934db1b37339d66a5843fa7a6cc9234283f2d5a90f3ea80573d81a42794d8733`. Selected source identities are:

| Source | PDF | selected MinerU JSON | lineage | selected MinerU revision |
| --- | --- | --- | --- | --- |
| `bdf1620w` | `fe7384670caa100d2845dd16570af6143a7bf649cb670742d5b399af18c2e283` | `f79e8b2f1130389a1257bf5dcc2317a8f2c18b6754f46eab99ddf98702bf182c` | `4232a93b5184082e5dd0024b3f52df6f34a092d3b88f57f7f724eccff65fb4fd` | `MinerU@3.4.4:bff20d4ae2bf202df9f45284b4d43681555a97ed` |
| `bdp810w` | `bfef66f009e1bbb2dcec74172f749be9e99b336dde7d1a7c922785a26e1cdcc6` | `3947274f218015c9d56093f20b58b3942b902c1ac8cdb2c3ef4f15caa2f9fd1f` | `8207c2f531c6dcc1e659659e83adf031ee02833d3f331ed45b8331f0940c47a1` | `MinerU@3.4.4:ed6b654c018d742e65a17671e379c5e6ecc87ec9` |
| `ewf7524cdwa` | `1b8980e6e6e287657658fd2b5c7b58c6013f21d544cf7b2c5393cd7d877e5244` | `f9fee3fa81c18dfa8db90301491d669d33c9e9793ef5eeccf813a70b7387c181` | `b89197f0bac18c2de0b8e22d65b1a7122cb21141a5d09b37edcd41f5a7029e59` | `MinerU@3.4.4:bff20d4ae2bf202df9f45284b4d43681555a97ed` |

The manifest also binds the six exact rendered-page objects, all with rotation `0` and `full_page` transform: BDF pages 1/2 (`9d473a6bd008d2acde3d7f17668df263c2fdaada17315002e3190758a3fd1681`, `35331eb7214e9367637210ce6050da365f7f21b223e0f73fadd8ff083023d3f9`); BDP pages 1/2 (`bae37c330d14558f206e9e7dc780b6758e4754e8d338a1ac8056f903c8954cd0`, `f998ee095d1f417749e5fe0c8e12f013941748b8dd21de9a3f4d385ef60aa767`); and EWF pages 3/6 (`584ada38e72a7e0959d876ed7aeaa79d8a20a47c29129642337df75c62386970`, `a9ef7651e4cb4c502c869bad029cabb61ca49c58c18f4851b7cef5df1b738a75`). Renderer identity is Poppler `26.06.0`, binary SHA-256 `76126535b3a04b7be1db84808e39c4e71218903d4d7cbe846b9b4514c97caf0a`, at 150 DPI with the frozen full-page command options in the manifest.

## Fresh child-process captures

Each new capture contains its actual child exit, start/end time, output log hash, and full before/after inventory of 36 G3b code/fixture/dependency/accepted-source inputs. All five observed no input change while the child ran.

| Capture | Actual child exit | Result | Capture SHA-256 | Log SHA-256 |
| --- | ---: | --- | --- | --- |
| `G3b-router-canaries-focused.capture.json` | 0 | TAP: 16 tests, 16 pass, 0 fail, 0 cancelled/skipped/todo; 10,496.431042 ms | `0a5f5a76e770d702ceee34b849f0aa2010b229fb3675285bc78450ff3158f030` | `5757ace183bb510db4b315b03c6faeef075e2a3580c581ed276d1f470e399ca4` |
| `G3b-router-canaries-portable.capture.json` | 0 | portable: 6 fixture results pass; 12 negative witnesses pass | `99d346ae4ee81352a06089d0cf95c733265958d7a73d9410ca516ad80491dde3` | `880cd15ab1dcd08f4d0ecc3a1d16f1cdf9b7cbde36a24da804b0d41bc0ab8bce` |
| `G3b-router-canaries-original-objects.capture.json` | 0 | original-objects: 6 fixture results pass; 12 negative witnesses pass | `fe6f6faadc3ed7cf9e6e852d7c0862ce6adafb8aa77f9420cbdaf94a6d35a6d7` | `6112181dc5d73c031a58448ff061b332948334bb8aa3fd6cd9f14c33f0fc8be0` |
| `G3b-router-canaries-missing-store.capture.json` | 2, expected 2 | `blocked`: `EVIDENCE_STORE_UNAVAILABLE` | `43032f7e9892a002d71ce97602aa5028976a926491b146c0535e7a8778cdae16` | `d4616e3534f630974efa193638444dbe7b06e2dbaffad1d26065a7fcec1d2bbb` |
| `G3b-router-canaries-full.capture.json` | 0 | `npm test` TAP: 3,196 tests, 3,196 pass, 0 fail, 0 cancelled/skipped/todo; 26,556.525625 ms | `6f11afe8239d354ab68b61c222f6f27ac9701d0c9ae881e138523ff0577b5d44` | `e88072e138dbb64531c533361205411010905a33f1021a827715ca3f46b10188` |

The focused capture ran from `2026-09-15T01:41:50.807Z` to `2026-09-15T01:42:01.333Z`. The three CLI mode captures began at `2026-09-15T01:42:14Z`; original-object and portable checks do not emit TAP totals because they are bounded JSON CLI reports. The one full-suite capture ran from `2026-09-15T01:42:25.392Z` to `2026-09-15T01:42:52.833Z` and contains the complete TAP summary plus actual child exit.

## Remaining review boundaries

- `REVIEW_REQUIRED` is intentional: a different reviewer must assess the frozen implementation and evidence; this report makes no independent-acceptance claim.
- The source store was available for the captured original-object run. A missing or unreadable store is deliberately `blocked`, and invalid CLI input is deliberately `not_run`; neither writes, fetches, or re-runs OCR.
- Local `npm run audit-docs` remains outside this task and was not run. The known pre-existing EISDIR behavior from an old absolute directory Markdown link is unrelated to G3b and was not modified.
- No commit, push, deployment, plan rewrite, G4 work, or further implementation writes followed this report.

---

## Fix round 1 — 2026-09-15 executor handoff

Status: **REVIEW_REQUIRED**. This section records the same G3b executor's repairs to the three main-confirmed findings in `G3b-independent-audit.md`. Main owns the next freeze, distinct independent re-review and Git/release decisions.

The entire v1 report above is preserved as a historical prefix (SHA-256 `ff84a975f68f10a1db061a280e864506f1489406156158fb6bd870a49f591442`). Its 3,196-test full-suite result is historical and is **not** full-suite evidence for fix1. No full `npm test` was run in fix1.

### Repairs and boundary behavior

1. **P1 negative witnesses:** manifest schema 3 names a real alternate fixture for each negative source hash, with independently authored expected selection/profile/route. All 12 negatives replay the alternate document's own raw blocks, source pointer, fragment identity and brand/category before inspection/selection/routing. A target profile must not be selected, and the declared alternate outcome must match. The old declaration-hash mutation is retained separately as `sourceIdentityTamperResults` (12 controls); it no longer counts as a profile negative. Original mode reuses its validated original-object states for negative replay too.
2. **P1 G3a image/crop contract:** page metadata now carries the accepted G3a artifact records and PDF-bbox fragments. The six portable fixtures copy those records from the unchanged accepted lineages. Inspection delegates strict fragment/locator/source-root/crop-ancestor checks to `validateEvidenceAnchors`, then reconciles the observed raw block, exact page, pixels, rotation and full-page locator. Only G3a `full_page` / `crop_from_full_page` transforms are accepted; the old `crop` alias is rejected. Crop bounds are checked in the ancestor full page's recorded frame, retaining decimal values. The G3a producer's `mineru_normalized_top_left_1000` coordinates are already normalized; they are not rotated twice. Original mode additionally compares submitted image artifacts/fragments with the accepted lineage records, so a rehashed coordinate edit does not pass.
3. **P2 direct selection:** existing inspection/replay logic moved into `extraction-region-observation.mjs`, the one explicitly allowed internal file. Registry selection and routing consume the same data-based replay. Forged status, text or structural signals cannot produce a selected envelope. The complete selected envelope and serialized replay remain the public flow; no opaque token or registry/router import cycle was introduced.

All outcomes remain structural candidates. The six active policy profiles, accepted three PDFs, selected MinerU JSONs, raw pointers and six original full-page render records are unchanged. The manifest self identity for fix1 is `118354372d5c8433b5e1330cdc59d61327c0fb603283e697a84cc63a4d374f20`.

### TDD and failures retained

The TDD skill was used to record failing behavior before each repair. No independent audit was performed by the executor.

- `red-v1-corrected`: four test cases failed against v1 for the reported status spoof, rejected valid G3a crop, accepted weak crop alias and missing negative inspection. The initial `red-v1` run is retained but contains two test-construction errors (missing canonical fragment identity), so it is not the authoritative RED for those two cases.
- `green-selection-crop` and `green-negative` are intermediate execution results. The first predates adding the shared observation file to manifest code identity, so its 38-input capture does not fully bind that new file and is not final fix evidence.
- `affected` retained a real exit 1: 46/47 passed. The sole failure was an incorrect expected reason in the raw-hash counterexample; shared replay correctly returned the original `INVALID_REGION_REPLAY` because the raw block failed identity before a region could be rebuilt. The assertion was restored.
- `red-normalized-frame` retained a real exit 1 for the producer-compatible rotated-page fixture. The intermediate implementation rotated an already-normalized box twice; that transformation was removed. The final affected run covers the corrected producer frame.
- Final crop cases use **synthetic, explicitly labelled G3a artifact records** over an accepted raw BDF region. They cover valid rotation 0/90 and decimal crop boxes, same-PDF wrong-page ancestry, missing actual crop ancestry, changed/unknown raw coordinates, wrong rotation and a crop that does not contain the region. No crop image was rendered, acquired, or claimed as an accepted original object.

### Final affected checks and three modes

Capture directory: `.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation`. The literal commands below ran in the linked worktree via `G3b-fix1-capture.mjs`; the capture records hold the actual child exit/signal, PID, start/end timestamps, complete TAP totals when applicable, log identity, and before/after hashes.

```text
node G3b-fix1-capture.mjs affected-final 0 node --test tests/architecture-v3/region-router.test.mjs tests/architecture-v3/artifact-lineage.test.mjs
node G3b-fix1-capture.mjs portable 0 node scripts/architecture-v3/run-profile-canaries.mjs --portable
node G3b-fix1-capture.mjs original-objects 0 node scripts/architecture-v3/run-profile-canaries.mjs --original-objects --evidence-store /Volumes/UGREEN-1TB/FitAppliance
node G3b-fix1-capture.mjs missing-store 2 node scripts/architecture-v3/run-profile-canaries.mjs --original-objects --evidence-store /definitely-missing-fitappliance-g3b-store
```

In those commands, the capture script is at the capture directory above; all child paths are worktree-relative.

| Capture | Actual child exit | Result | Started → ended (UTC) |
| --- | ---: | --- | --- |
| `G3b-fix1-affected-final.capture.json` | 0 | 47 tests / 47 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo; 30,538.147084 ms | `2026-09-15T02:22:19.798Z` → `2026-09-15T02:22:50.364Z` |
| `G3b-fix1-portable.capture.json` | 0 | PASS: 6 fixtures, 6 active profiles, 12 genuine negative witnesses, 12 separate hash-tamper controls | `2026-09-15T02:23:20.216Z` → `2026-09-15T02:23:25.916Z` |
| `G3b-fix1-original-objects.capture.json` | 0 | PASS: 6 fixtures, 6 active profiles, 12 genuine negative witnesses, 12 separate hash-tamper controls | `2026-09-15T02:23:20.216Z` → `2026-09-15T02:23:26.048Z` |
| `G3b-fix1-missing-store.capture.json` | 2 | Expected BLOCKED / EVIDENCE_STORE_UNAVAILABLE | `2026-09-15T02:23:20.219Z` → `2026-09-15T02:23:20.271Z` |

All four final captures bind **39 inputs**, including the shared observation module, G3a artifact/anchor code, G2a registry code, strict JSON codec, policy/registry data, tests/fixtures, package files, capture harness and the 17 referenced accepted external objects. Each reports no changed, missing or added input during execution. Portable/original stdout remains bounded JSON (respectively 11,622 / 11,629 bytes) with identities, results and gaps; no repeated raw replay or brand-registry bodies. Both retain `INCOMPLETE_RECORDED_TOOL_PROVENANCE`. Missing-store exits 2 with that historical limitation still explicit.

| Final capture filename | Capture SHA-256 | Log filename | Log SHA-256 |
| --- | --- | --- | --- |
| `G3b-fix1-affected-final.capture.json` | `453415d4fafe9304eb64acf923863e095ec631779cceeee22102eaac83e29b5d` | `G3b-fix1-affected-final.log` | `592fc1679bc9afd89154fc35caaf81e563ebc397c45aa375692d9ea9368971db` |
| `G3b-fix1-portable.capture.json` | `5bef9041d7f55fd63a1ed7a098a3be0a068a5c5881a0a7e294b4a5e641b53ff7` | `G3b-fix1-portable.log` | `6918bc401edb1a94782eaec5a6e0b41827ede46b799daef8e079fe763b794210` |
| `G3b-fix1-original-objects.capture.json` | `a8d0ae050381fb2e87f864e066c9e253393ce499d0d242c6ac5e9433a90a1ec3` | `G3b-fix1-original-objects.log` | `f5d1a6dc26a8a977692cf94b665c0724d251a8d7dded350edfc4b602c415c3f3` |
| `G3b-fix1-missing-store.capture.json` | `7d285b9ba5c0ccbf6a58e6b0a373e660593985ac52f7a6277687bb0b38251e76` | `G3b-fix1-missing-store.log` | `d4616e3534f630974efa193638444dbe7b06e2dbaffad1d26065a7fcec1d2bbb` |

### Changed/new implementation and fixture files

The following hashes describe the functional files used in the final affected and three-mode captures. This report is the additional append-only documentation change; its final whole-file checksum is supplied with the handoff because a document cannot embed its own checksum.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `src/domain/architecture-v3/document-family-registry.mjs` | 13762 | `9083962d1b34cc14f8bdaf98215d80637b55099f9c7bd41694f8e68649ec9aea` |
| `src/domain/architecture-v3/region-router.mjs` | 59297 | `4b2d359872ad97df22041bd3e582df4f7401d31b90e65e21bf1d2de666b97a6c` |
| `src/domain/architecture-v3/extraction-region-observation.mjs` | 19820 | `78b2f60c2e517c92cbd2e8e924a009198da30bf59e9453ab44459fd081a07c18` |
| `scripts/architecture-v3/run-profile-canaries.mjs` | 8460 | `ecfea8365d16f7144554b990e4838e158f3d7588b70a8766cba1262453a1042e` |
| `tests/architecture-v3/region-router.test.mjs` | 39845 | `0f6c63fe993c38edf20163e444949ffbd266b4bdcf867c8a20d6ce6362696964` |
| `tests/fixtures/architecture-v3/profile-canaries/manifest.json` | 26658 | `f9fac38530b327e7fca2118cb4e596f51a83ea7eb092066102fa27f9d8f9dff8` |
| `tests/fixtures/architecture-v3/profile-canaries/bdf1620w-p1-structured.json` | 6424 | `f05adf83cc8aaf221f7979b9bc90bf9d6c781d80a062564de565bbe539dd23b1` |
| `tests/fixtures/architecture-v3/profile-canaries/bdf1620w-p2-image.json` | 6472 | `1c0172c54c4cdcdf85c841361d4f1b151ac00dcded53446bf8026291895f8f48` |
| `tests/fixtures/architecture-v3/profile-canaries/bdp810w-p1-split-columns.json` | 13947 | `6961b5210b87cfc541ee6de96d7996ae5a847a30db5d4129e3816c6e36445fc8` |
| `tests/fixtures/architecture-v3/profile-canaries/bdp810w-p2-table.json` | 7671 | `6a39860184009b0ec801f61b3840a935e915e2fb321906b4e3a3eb53ac54bdfc` |
| `tests/fixtures/architecture-v3/profile-canaries/ewf7524cdwa-p3-table.json` | 8602 | `8314bf6dc98ff9a520d1126ffe370b04f303c7132643e0bad257dddf978ee8fc` |
| `tests/fixtures/architecture-v3/profile-canaries/ewf7524cdwa-p6-image-context.json` | 6673 | `3eb1c266eb2b45f1f9ab7118e856a6a1fa1959edef068b1a59086a55fc5793c5` |
| `.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/G3b-fix1-capture.mjs` | 8089 | `be8828fdc2df1586ec9a0b22cb1b5fbb5107729b31916f096dcb3bd75b28d426` |

Manifest code identity also explicitly binds these unchanged dependencies:

| Dependency | SHA-256 |
| --- | --- |
| `data/architecture-v3/policies/document-family-profiles.json` | `7eda21ad3693e8934808d4ff7e38203ba4b97e93c61d54a7fd8f52af270294a8` |
| `data/architecture-v3/generated/brand-registry.json` | `cbb4dac77938ae0f9bf40278325b42a33b0e61c6403a5212eff9e9a05e7dbf0d` |
| `src/domain/architecture-v3/artifact-lineage.mjs` | `bb375d5a809d3b4137a79e526b21980a1a73ea5d49961c6d73472facd9660eb0` |
| `src/domain/architecture-v3/evidence-anchors.mjs` | `19f76808cf5886cf397af31429fc3c7c8e5e497b5e912b8ba3b2dd999286524c` |
| `src/domain/architecture-v3/brand-registry.mjs` | `48ef3cf23f6df1473e00d6eb559d3fe450742207dbac76ea0cd442bf0f61ae0b` |
| `src/shared/canonical-evidence-json.mjs` | `9bdf42c479827662497e1cf74c1ffd13a13d85085675c024c5809dd69647d451` |

### Preserved intermediate captures

All entries below remain in the same capture directory; each corresponding `.log` contains the actual original output. These are development history, not substitutes for the final captures.

| Capture stem | Child exit | TAP pass / tests | Capture SHA-256 | Log SHA-256 |
| --- | ---: | --- | --- | --- |
| `G3b-fix1-red-v1` | 1 | 0 / 4 | `47361d910804d3a1ca49e4e1476370e7f49f10815282777a7d8a933fac4d90f0` | `182a0f3d42140acf172113c1d2f9cc844b4325114b2d1bef0c361058319b9cc5` |
| `G3b-fix1-red-v1-corrected` | 1 | 0 / 4 | `39e162de9547752e0862c1574e913959a1f9048da894b4c3162446a24275e0a0` | `37627994a4cd3d3983baa6326e5c092ddb8793d2c69b609665900e816eaae95c` |
| `G3b-fix1-green-selection-crop` | 0 | 3 / 3 | `be36e90981a82038de71bc6f2890c7223bfdc9b60bce2e62fdd6379e7713198a` | `57f6000eec93bf217e47fcc8578b14e52f7eb84c3a4bcae9359a7365dd353748` |
| `G3b-fix1-green-negative` | 0 | 1 / 1 | `22bec78ca861d9365bcfce38e8b50d7a517a940fa1cf2564b08cb65261ee29bc` | `c64c47032f54fb6be9972d820a217ea6da088464cb2e2934504ccd9ea2023c0d` |
| `G3b-fix1-affected` | 1 | 46 / 47 | `7c7a4eab2bddd533b2c1991aab77ba834316602123e20cfbf2a47cd1cc9753f8` | `6dbe6213255def47cf3c57ba37cf3284fe556ecd617741ffa12cafcb4af17a66` |
| `G3b-fix1-red-normalized-frame` | 1 | 0 / 1 | `0d32c46fffa057c7c7a38a020804a802cba0a6336808652bc2d49f999cc6c279` | `8f962c2e96079ece4c8ddd581bf5e034986b8dfc84216f9415927f2039c99708` |

### Remaining limits and handoff

- Fix1 has affected-test and three-mode execution evidence. Full CI for the exact reviewed version remains mandatory before merge; v1's historical full3196 result cannot satisfy that gate.
- Crop tests establish G3a structural replay compatibility only. The accepted original objects remain the six full-page render records, all rotation 0; no new original crop or render attestation is asserted.
- Historical OCR `tableEnabled` / `formulaEnabled` flags remain missing. BDF diagram meaning, BDP depth scope and EWF installation/hoses/disclaimer semantics remain outside G3b approval.
- The separately disclosed local docs-audit EISDIR limitation is unchanged; fix1 did not run or modify that audit.
- No unresolved implementation failure remains in the final affected checks. Independent re-review is pending. No commit, push, merge, deployment, source acquisition, rendering, OCR, subdelegation or canonical-plan write was performed in this fix round.

Executor handoff: **REVIEW_REQUIRED**. Stop writing; main freezes and dispatches the distinct re-review.

---

## Fix round 2 — 2026-09-15 executor handoff

Status: **REVIEW_REQUIRED**. This append records only N1 from `G3b-fix-round2-brief.md` and the complete N1 finding in `G3b-independent-rereview-v2.md`. The distinct reviewer marked F1/F2/F3 ADDRESSED; this executor did not independently audit or reopen them. Main owns freezing, independent re-review and Git/release decisions.

The complete v1-plus-fix1 report remains an unchanged 22,191-byte prefix (SHA-256 `fd3b2f06f3df2f1b4a7bdedeacab3065bd2098ffa6d884c1b637f0200d6d1e63`). All earlier captures and reports remain historical evidence. Neither the earlier full3196 result nor fix1's affected47 result is exact-version full CI for fix2.

### N1 repair and preserved behavior

The existing shared `extraction-region-observation.mjs` now owns one closed raw-kind-to-content-mode table: `title`, `paragraph`, `page_header` and `index` map to structured text; `image` and `table` retain their respective modes. The type must be a string and an own key of that table. Missing, unknown, non-string, malformed, prototype-name and derived-signal-as-type values no longer fall through to `structured_text`.

Unsupported raw kinds remain visible as `incomplete` regions with `contentMode: unsupported`, explicit `UNSUPPORTED_RAW_KIND`, raw pointer/block/hash/PDF identity and bounding box retained. Their structural signals contain only `raw_block_identity`; they do not contribute guessed page-context signals to supported neighbours. No raw kind is inferred from text, and the document is not discarded or quarantined wholesale. Registry selection and routing reuse the existing serialized shared replay and reject an unsupported region; rewriting its status to `inspected` still fails replay comparison. No duplicate registry validator, parser, module or semantic engine was added.

The positive BDP JSON-pointer `/0/47` control remains a valid `index`: it selects `beko-au-dryer-split-columns-v1`, routes through MinerU and retains `AXIS_OR_LEGEND_GAP` without fake image metadata. The mixed BDF same-page control keeps both the unsupported title and the supported paragraph; the paragraph independently selects `beko-au-dishwasher-structured-v1` and routes through MinerU.

Only the shared module, its affected test file and two manifest hashes changed among the existing bound functional inputs. The manifest change refreshes that module's code identity and the manifest self identity; policy, source expectations, six portable raw fixtures, negative witnesses, selected PDF/MinerU/lineage/render objects, tool bindings, registry/router/CLI implementations and G3a/G2a dependencies are unchanged. Fix2 manifest self identity: `985ca87f91c1669e44d1e88a74baadf205d23139557f028982a368aa3cf758f0`.

### Focused TDD and final execution evidence

TDD was used before implementation: the legitimate-index control passed against fix1, while four N1 tests failed on the incorrect `inspected` fallback. The same five tests passed after the shared repair. Tests cover unknown and absent types separately, non-string/malformed/derived-signal values, preserved raw identity and replay rejection, the legitimate split-column gap, and a usable same-page neighbour. Raw-kind mutations are synthetic counterexamples with recomputed fragment identities, not newly accepted original source records.

The targeted GREEN predates the two manifest hash updates and is TDD evidence only. The final single affected-suite run and all three CLI runs bind the refreshed, stable manifest and functional files. No separate G3a suite or full `npm test` was run in fix2.

Capture directory: `.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation`. The new `G3b-fix2-capture.mjs` reuses the earlier child-process capture harness with fix2 names; exclusive creation preserves old captures. The actual child commands were:

```text
node --test --test-name-pattern=fix2 tests/architecture-v3/region-router.test.mjs
node --test tests/architecture-v3/region-router.test.mjs
node scripts/architecture-v3/run-profile-canaries.mjs --portable
node scripts/architecture-v3/run-profile-canaries.mjs --original-objects --evidence-store /Volumes/UGREEN-1TB/FitAppliance
node scripts/architecture-v3/run-profile-canaries.mjs --original-objects --evidence-store /definitely-missing-fitappliance-g3b-store
```

The targeted command ran once for RED and once for GREEN; each other command ran once in fix2. Each was invoked through the named harness with its capture label and expected exit. The table reports the **actual child exit**, not merely the harness exit; RED and missing-store deliberately expect nonzero child exits.

| Capture stem | Actual child exit | Complete result | Started → ended (UTC) |
| --- | ---: | --- | --- |
| `G3b-fix2-red-n1` | 1 | 5 tests / 1 pass / 4 fail / 0 cancelled / 0 skipped / 0 todo; 368.292458 ms | `2026-09-15T02:58:06.100Z` → `2026-09-15T02:58:06.499Z` |
| `G3b-fix2-green-n1` | 0 | 5 tests / 5 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo; 3069.753 ms | `2026-09-15T02:58:49.258Z` → `2026-09-15T02:58:52.357Z` |
| `G3b-fix2-affected-final` | 0 | 26 tests / 26 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo; 33574.512167 ms | `2026-09-15T02:59:28.199Z` → `2026-09-15T03:00:01.803Z` |
| `G3b-fix2-portable` | 0 | PASS: 6 fixtures, 6 active profiles, 12 genuine negative witnesses, 12 separate hash-tamper controls | `2026-09-15T03:01:54.148Z` → `2026-09-15T03:01:59.691Z` |
| `G3b-fix2-original-objects` | 0 | PASS: 6 fixtures, 6 active profiles, 12 genuine negative witnesses, 12 separate hash-tamper controls | `2026-09-15T03:01:54.148Z` → `2026-09-15T03:01:59.916Z` |
| `G3b-fix2-missing-store` | 2 | Expected BLOCKED / EVIDENCE_STORE_UNAVAILABLE | `2026-09-15T03:01:54.148Z` → `2026-09-15T03:01:54.196Z` |

All six captures have actual child PID/start/end/exit, no termination signal or spawn error, Node `v22.23.1` binary SHA-256 `2e3f1286a7eb3736346ed1803e458a0ff909e2b2d5bc746144dcb76970e9b99d`, full logs and before/after hashes for **39 inputs**. All report zero changed, missing or added inputs during their run. The G3a test file is a hash input only, not an executed fix2 suite. The 17 referenced external objects are read-only accepted objects; the missing-store child deliberately receives the unavailable path independently of the capture harness's real-object inventory.

Portable/original stdout remains bounded JSON (11,622 / 11,629 bytes); it includes six passing fixture results, twelve passing genuine alternate-source negatives and twelve separate passing source-hash-tamper controls. Original mode reports `originalObjectsBound: true`; portable reports false. Both retain `STRUCTURAL_CANDIDATE_ONLY` and `INCOMPLETE_RECORDED_TOOL_PROVENANCE`. Missing-store also preserves that historical limitation. CLI JSON does not emit TAP totals; it is not represented as a test-suite run.

| Capture filename | Capture SHA-256 | Log filename | Log SHA-256 | Log bytes |
| --- | --- | --- | --- | ---: |
| `G3b-fix2-red-n1.capture.json` | `124be14394169110ad73f9b254373f09ca1fb38649cf1acb407b82074f6f20f9` | `G3b-fix2-red-n1.log` | `2483f6ba63e1c12bc94cca65779df29b31a5ede80d284dc94476eb38883416fd` | 4404 |
| `G3b-fix2-green-n1.capture.json` | `bc5fa0c41800770b87ea0fa2c3fadf51117fb66d8474da84cbe92ee9582d8ef7` | `G3b-fix2-green-n1.log` | `9125e6a059187bac2e202c7b7ed407bc709d5ebdd8edc0abf07c61fe72d95d0b` | 1236 |
| `G3b-fix2-affected-final.capture.json` | `b4611789926f42c2935845503a9c7ffda6f5312f3a578536b18d894555fc6ca4` | `G3b-fix2-affected-final.log` | `ff6c0b93324783f4f8abfffdeefae9c042157f0db47a45e9e5440855f83a1f17` | 6292 |
| `G3b-fix2-portable.capture.json` | `11737a2f6acbad2257b57db9f3596c7e63a63208953c9476a4409ebb0498ac5c` | `G3b-fix2-portable.log` | `6918bc401edb1a94782eaec5a6e0b41827ede46b799daef8e079fe763b794210` | 11622 |
| `G3b-fix2-original-objects.capture.json` | `bb98e27991710a0a636e8b68eab483b9b25e7af0b16711baa7d6cf097347bed2` | `G3b-fix2-original-objects.log` | `f5d1a6dc26a8a977692cf94b665c0724d251a8d7dded350edfc4b602c415c3f3` | 11629 |
| `G3b-fix2-missing-store.capture.json` | `b7be33b37da913bf62cfb91cdeef20adce2cd4353dc6255dad2b716091c27724` | `G3b-fix2-missing-store.log` | `d4616e3534f630974efa193638444dbe7b06e2dbaffad1d26065a7fcec1d2bbb` | 232 |

The three CLI log hashes equal their fix1 counterparts because their bounded results are unchanged. Their new capture files have distinct timestamps/PIDs and bind the new code and manifest hashes; no old output was copied into these runs.

### Fix2 file identities and scope

| Changed/new file | Bytes | SHA-256 |
| --- | ---: | --- |
| `src/domain/architecture-v3/extraction-region-observation.mjs` | 20532 | `1a62e4d492a575fd3046553a7eba0b0180d5dcafe57bc51fe0031b24fce7dff3` |
| `tests/architecture-v3/region-router.test.mjs` | 44923 | `8b17b55951f04d5287661ca9d8d5371d8b324cac0514fb8371b5d3e278a7f14c` |
| `tests/fixtures/architecture-v3/profile-canaries/manifest.json` | 26658 | `d01e84bf90bcd2ecdd503264f0477c41b49db8b0c5cb89a788901879041916da` |
| `.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/G3b-fix2-capture.mjs` | 8089 | `31d6b94511c0521abfd7e8564de537ffa19e6ead9145e0cb0c71e92d3b50fead` |

This appended report is the remaining documentation change; its final whole-file checksum is provided with the handoff, rather than embedded recursively. The complete 39-input file/hash inventories are in each capture. Comparing final fix2 with final fix1 bound inputs shows only the three existing functional paths in the table changed; the new harness has its own fix2 path. All other bound local dependencies, six raw fixtures and accepted external objects retain the preceding hashes. The manifest binds ten code/policy/registry dependencies, including the updated shared observation module. `git diff --check` returned exit 0.

### Remaining limits and handoff

- N1's final affected checks and three modes have no unexpected execution failure. This is execution evidence, not independent acceptance; distinct re-review remains pending.
- Exact-fix-version full CI remains mandatory before merge and belongs to main. No full-suite rerun or G3a audit was performed for this fix.
- Historical OCR `tableEnabled` / `formulaEnabled` flags remain missing. Existing semantic/source gaps are not resolved by this structural raw-kind repair.
- The pre-existing local docs-audit EISDIR limitation remains separately disclosed, unchanged and unrerun. No old audit evidence or canonical-plan content was edited.
- No source acquisition, rendering, OCR, network action, new feature/parser/module, subdelegation, commit, push, merge or deployment was performed in fix2.

Executor handoff: **REVIEW_REQUIRED**. Stop writing; main freezes and dispatches the distinct re-review.
