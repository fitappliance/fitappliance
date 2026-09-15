# G3b independent re-review v2 — fix round1

## 结论与身份

| 项目 | Verdict |
| --- | --- |
| 原 P1：负例未检验 profile 判别 | ADDRESSED |
| 原 P1：G3a crop 契约不兼容／弱化 | ADDRESSED（限定为获准的结构性 crop replay） |
| 原 P2：直接 selector 信任 inspected 快照 | ADDRESSED |
| Spec compliance | CHANGES_REQUIRED — 修复引入 N1 原始类型校验回归 |
| Code quality | CHANGES_REQUIRED — shared replay 移除旧检查时遗漏输入约束 |
| Whole-branch ready-to-merge | NO — N1 未修复，且无 exact fix-version full CI |

审计者 Dewey，agent ID `01a0a2c0-4b22-7cb0-884c-f2e03755915b`（本次环境 ID 与原审计一致）。与执行者 Dalton `01a0a264-0a86-7ae0-a250-764c686e384d` 职责分离。控制器调用参数据主 agent 的委托记录为 `gpt-5.6-terra / max`；自身可见通用模型标签为 GPT-5 / Codex，未独立探测更具体运行时。本报告不修改 v1 的模型记录或裁决。

工作树：`/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline`。base HEAD 为 `c83aa475d892e5bdb8bc7f65a0cee4cb05292a50`，branch 为 `codex/architecture-v3-g3b-region-canaries`；本轮为未提交冻结版本的定向复审，不是新的全库审计。主 agent 负责最终接纳、Git 与发布。

## 冻结与覆盖范围

以下路径以工作树为根；SDD 指 `.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation`。

| 对象 | SHA-256 |
| --- | --- |
| SDD/G3b-freeze-v2.json（16 files） | `8ef15b83285088e194f7be98fa7177be7496d14eeae7c4a4c9d3ef7662c43404` |
| SDD/G3b-review-v2.md（296096 bytes） | `368b3c74c8b4e40a88fcfb781e956a5daa2e0e00635c70575b0377e3e6e9ab01` |
| SDD/G3b-fix-review-v1-v2.md（217829 bytes） | `4d4e437d31741480301e5a485947e4bb2b28d92bea94e32771eb42c2fc1b4c53` |
| docs/architecture-v3/execution/G3b-independent-audit.md（旧审计） | `ce1cff3c900cfb1d4c2d7004488d3d2e3fb9779c23dd979f72ce432731906a39` |

先核对全部 16 个当前文件的 byte/hash、HEAD、branch 及上述包，再阅读已有的定向 diff；未生成另一个 diff，也未使用 HEAD~1。完整读取 fix brief、执行报告 fix1 段和定向差异。旧审计只读；未改代码、计划、Git、证据、旧凭证或既有捕获，也未委派。

覆盖：修复差异内的 registry、router、新 shared observation、CLI 输出、测试、六个 fixture、manifest，以及报告／主 agent 状态记录的变化。未变 policy/G3a/G2a/codec 仅作为边界与依赖参照，未重新全审。新报告不是冻结 16 文件之一。

## 原三项发现的逐条裁决

### F1 — ADDRESSED：12 条是真实 alternate-source negatives

判别链为：manifest 的独立 fixture/source/target 绑定（`region-router.mjs:511-555, 592-597`）→ alternate 自己的 payload 与原文身份检查（`:639-750`）→ inspection → 全 registry selection → route（`:753-809`）→ 目标 profile 不得被选、alternate profile 和 route 必须等于预写预期（`:863-893`）。original 模式传入该 alternate 的 original state（`:871`），不是借用 positive 的 bytes 或 brand/category。

逐对核对如下；每行两项均在 portable 和 original 的已捕获输出中到达 inspected/selected，选中该 alternate fixture 自己预期的 profile。除 bdf-image 为 ocr_or_vision 外，所列 alternate 路由均为 mineru。

| 被检验目标 profile | 两个独立负例 fixture / 原文 pointer | Manifest 行 |
| --- | --- | --- |
| beko-au-dishwasher-image-v1 | ewf-image-context /5/1；bdp-table /1/7 | 313-332 |
| beko-au-dishwasher-structured-v1 | ewf-table /2/4；bdp-split-columns /0/47 | 355-374 |
| beko-au-dryer-split-columns-v1 | ewf-table /2/4；bdf-structured /0/15 | 397-416 |
| beko-au-dryer-table-v1 | ewf-table /2/4；bdf-structured /0/15 | 439-458 |
| electrolux-au-washer-image-context-v1 | bdp-split-columns /0/47；bdf-image /1/4 | 481-500 |
| electrolux-au-washer-table-v1 | bdp-table /1/7；bdf-structured /0/15 | 523-542 |

Manifest 路径为 `tests/fixtures/architecture-v3/profile-canaries/manifest.json`。每个目标都有另外两个真实 PDF hash，12 行复用的是三个 PDF 的六个 fixture，**不是 12 个独立原件**。这些是有判别力的有限 brand/category/region 对照，不代表任意结构变异的全面覆盖。selector 对全部 active profiles 做唯一性选择，因此目标若也匹配会得到 ambiguous，并令该负例失败；不是先排除目标再宣告成功。

旧的 12 条 declaration-hash 篡改留在独立 `sourceIdentityTamperResults`（`region-router.mjs:895-921`），不计入 profile negatives；CLI 分别输出两组（`run-profile-canaries.mjs:34-60`）。错误 expected profile／借用 positive fixture 的负控制见 `region-router.test.mjs:713-723`。

本审计未重跑 portable/original 套件，而是将两份原日志的 24 个观察逐项对齐 manifest、fixture 与原文；结果保存在新诊断 log:69-262，具体源／fragment hash 逐行可追踪。

### F2 — ADDRESSED：复用 G3a typed crop 契约，synthetic 不冒充原件

`extraction-region-observation.mjs:227-308` 仅接受 full_page / crop_from_full_page，使用 `validateEvidenceAnchors` 处理规范 fragment 身份、源根和实际 strict ancestor（`:259-270`），随后核对同一 raw block、PDF/page、像素、旋转、transform、full-page locator 与原始坐标（`:272-306`）。这不是恢复 v1 的弱 crop alias，也不是仅凭一个 full-page hash 做 ancestry 证明。

G3a 参照：`artifact-lineage.mjs:114-194` 的 strict locator/transform；`evidence-anchors.mjs:206-245` 的 fragment/root/actual-ancestor 验证。既有 producer `scripts/architecture-v3/prepare-evidence-canary-inputs.mjs:495-506` 明确保留 MinerU 已归一化的 rawBbox，旋转单独记录；consumer 在同一 full-page frame 上检查 crop containment，不再二次旋转或舍入小数。

合法控制和反例已实际进入被捕获 affected 测试：`region-router.test.mjs:593-662` 为明确标记 synthetic 的 0/90° crop；`:665-689` 重新封装 fragment 后分别测试同 PDF 错页、非实际 crop 祖先、raw 值／frame、旋转、覆盖范围及弱 alias；`:835-846` 验证 original 模式拒绝重算 hash 的坐标替换。原始 lineage 精确比对位于 `region-router.mjs:728-743, 1172-1179`。

额外只读核对：六个 fixture 新增的 12 个 artifact-record 副本、15 个 PDF-bbox fragments 均等于各自 manifest 指向的三份原始 lineage；15 个 raw blocks 均等于三份选定 MinerU JSON 的原 pointer。六份 full-page 元数据的 page/hash/pixels/rotation/transform 未变，记录在新诊断 log:8-68。

边界裁决：synthetic crop 证明数据结构和 replay 兼容性，不证明新 raster 的实际像素或渲染真实性；接受的六个原始 render 仍全为 full_page/0°。因此 original canary manifest 继续只认这些 full-page 原件，与主确认的 fix 范围不矛盾。未制造 crop/render；也不把 0/90° synthetic 测试说成实际旋转原件或全部角度的实物验证。

### F3 — ADDRESSED：直接 selector 与 router 使用同一 replay

`document-family-registry.mjs:274-276` 调用共享 replay，并拒绝重建后不是 inspected 的区域；`extraction-region-observation.mjs:451-478` 从序列化输入重建并比较完整 core，提交者不能只改 status、text 或 signals。正例保留 JSON 序列化可回放能力，反例见 `region-router.test.mjs:572-591`。

`region-router.mjs:4-7` 保留原 public exports；routing（`:215-244`）仍验证区域、完整 selected envelope 和重选结果。静态依赖检查确认：registry 不再导入 router；shared module 只依赖 G3a 与 strict codec，G3a 不反向依赖 G3b。没有循环导入、第二套 inspector、WeakMap/token 权威或新增公共消费者。不同入口会重复调用同一 replay，属于串行边界重检，不是平行实现。manifest 的 code identity 已纳入 shared module 及其 G3a/G2a/codec 依赖（`region-router.mjs:97-109, 559-565`）。

原 status-spoof 问题已经解决。下面 N1 是迁移时遗漏旧输入约束的新回归，不将它重新命名为原 spoof 仍存在。

## 新引入问题 N1 — P2：shared replay 丢失 raw type 的封闭校验

位置：`src/domain/architecture-v3/document-family-registry.mjs:274-276`；`src/domain/architecture-v3/extraction-region-observation.mjs:115-118, 157, 352-375`。

旧 selector 除 replay 身份外，还要求 structuralSignals 均为已支持值且含 rawBlock.type（保留的 v1 `document-family-registry.mjs:362-371`）。修复删除该 validator 后，共享 inspector 没有承接 raw type 的必填／支持范围：除 image/table 外一律当作 structured_text，缺 type 也可生成 inspected。可回放只证明快照与输入一致，并不自动证明输入种类有效。

隔离反例：以 BDP /0/47 为文本 JSON-pointer-only 输入，保留内容、bbox、旁边标签区域和真实 registry；删去 type 或改成 unrecognized_raw_kind，并正确重算新 synthetic fragment 身份。对照也使用相同无 page-image 表示的合法文本输入，未借用或修改原图证据。

| 输入 | 保留 v1 selector | v2 selector / route | v2 gaps |
| --- | --- | --- | --- |
| 合法 index（控制） | selected | selected / mineru | AXIS_OR_LEGEND_GAP |
| 未知 type（synthetic） | invalid / INVALID_REGION_REPLAY | selected / mineru | 仅 STRUCTURAL_ROUTING_ONLY |
| 缺失 type（synthetic） | invalid / INVALID_REGION_REPLAY | selected / mineru | 仅 STRUCTURAL_ROUTING_ONLY |

新诊断 `G3b-audit-v2-review-checks.mjs:110-150` 使用 hash 核对后的 v1 selector，仅在内存中重绑定三个 import 到未变依赖，以隔离 selector 变化；不是切换 Git、改旧代码或运行 v1 全套。两版使用同一 rebuilt observation；v2 route 也真实执行。原始 index 的 axis/legend gap 因 `extraction-region-observation.mjs:194` 依赖 type 而在两份 malformed 输入中消失。完整结果在新 log:263-377；实际 child exit 0 表示**成功复现回归**。

影响范围：支持的直接 selection/routing 接口接受了 v1 拒绝的输入类型，违反 fix brief 的“不扩 API”和原 brief:75、84-99 的闭合、已验证区域边界。不是六个原始 canary 被篡改，也不是 original-object attestation、Claim、Receipt 或生产 Fit 的绕过；固定 source/raw hash gate 仍挡住这些 synthetic bytes 冒充既有 canary。P2 而非生产安全事故。

交回 Dalton 的修复要求：在唯一 shared inspection/replay 内承接既有支持类型／结构信号约束；未知／缺失类型保留为 typed incomplete/unsupported 区域，不能选中 active profile。增加合法 index、未知 type、缺 type 的定向控制，同时保持 F3 的完整 replay；不要重新建立两套 validator。本审计没有实施该修复。

## 检查证据与未解决项

复用主 agent 已核对的 fix1 捕获，未重跑 affected47 或三个 canary 模式，亦未重跑 full3196：

| 捕获（SDD 下） | actual exit / 结果 | Capture SHA-256 |
| --- | --- | --- |
| G3b-fix1-affected-final.capture.json | 0；47/47，fail/skip/cancel 均 0 | `453415d4fafe9304eb64acf923863e095ec631779cceeee22102eaac83e29b5d` |
| G3b-fix1-portable.capture.json | 0；6 fixture、12 negative、12 tamper | `5bef9041d7f55fd63a1ed7a098a3be0a068a5c5881a0a7e294b4a5e641b53ff7` |
| G3b-fix1-original-objects.capture.json | 0；同上，originalObjectsBound | `a8d0ae050381fb2e87f864e066c9e253393ce499d0d242c6ac5e9433a90a1ec3` |
| G3b-fix1-missing-store.capture.json | 2；BLOCKED | `7d285b9ba5c0ccbf6a58e6b0a373e660593985ac52f7a6277687bb0b38251e76` |

这四份捕获各声明 39 输入；主 agent 已核对当前 byte/hash 和 log identity，本审计不把执行者 PASS 当独立审核 PASS。affected log:230-259 的 fix1 测试与断言源码相符；portable/original log SHA 分别为 `6918bc401edb1a94782eaec5a6e0b41827ede46b799daef8e079fe763b794210`、`f5d1a6dc26a8a977692cf94b665c0724d251a8d7dded350edfc4b602c415c3f3`。

本审计新增且只读的单次定向诊断，Node v22.23.1，于 2026-09-15T02:41:57.191Z 完成；实际 child exit 0、signal null、stderr 空。子进程仅保留 PATH 环境，Node permission 模式无写许可；外部读取限 manifest 的三份 lineage／三份 MinerU 精确路径。记录 32 个被读输入且结束时无变化，不冒充执行者的 39 输入全套复核。

| 新证据（SDD 下） | SHA-256 |
| --- | --- |
| G3b-audit-v2-review-checks.mjs | `b6d7e2adda6331655a1f35d0319133fddb7eb6022ed7d0b7de71674a1deca119` |
| G3b-audit-v2-review-checks.log | `8ff56b4eb545d41447c36e28e152ff285927248daeab303beafabc3c0fc557d2` |
| G3b-audit-v2-review-checks.capture.json | `21ffd75ca82f02a6612d4bfebfd62caed20f1297c1696c10e6f50b0a9f3927f2` |

捕获保留 exact child command/arguments、真实退出、脚本和 stdout 身份；没有 OCR、网络、安装、渲染或 evidence 写入。补丁风险审查与单变量诊断技能用于冻结、边界追踪和 N1 复现；所有实现／发布步骤按独立审计权限跳过。

剩余门槛：N1 由原执行者修复并新冻结复审；准确修复版本的 full CI 仍须主 agent 验收，v1 历史 3196 不能替代。历史 tableEnabled/formulaEnabled 缺失、BDF 图示、BDP 深度语义、EWF 软管／安装说明、G4b proof/receipt 等原有边界不变。本轮未发现 crop synthetic 限定本身的契约矛盾；除 N1 外未确认其它修复引入的问题。

收尾只读检查实际 exit 0：16/16 冻结文件、10/10 manifest code-identity 文件、HEAD/branch、两个包与旧审计保持原身份；新诊断脚本／stdout 与 capture 中记录的 bytes/SHA 相符。下列 JSON 经补丁风险技能的现有 validator 验证，实际 exit 0；使用 Python -B，不生成缓存文件。此收尾检查不是测试套件重跑。

## 机器可读风险结论

以下为补丁审查技能的 advisory，非自动合并或发布授权；其范围仍是上述 v1→v2 定向差异。

```json
{
  "schemaVersion": 1,
  "patch": {
    "repository": "/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline",
    "sourceType": "patch_file",
    "base": "c83aa475d892e5bdb8bc7f65a0cee4cb05292a50",
    "head": "uncommitted frozen-v2 package 368b3c74c8b4e40a88fcfb781e956a5daa2e0e00635c70575b0377e3e6e9ab01",
    "changedFiles": [
      "docs/architecture-v3/execution/G3b-independent-audit.md",
      "docs/architecture-v3/execution/G3b-router-canaries.md",
      "docs/superpowers/plans/2026-09-13-architecture-v3-evidence-foundation.md",
      "scripts/architecture-v3/run-profile-canaries.mjs",
      "src/domain/architecture-v3/document-family-registry.mjs",
      "src/domain/architecture-v3/extraction-region-observation.mjs",
      "src/domain/architecture-v3/region-router.mjs",
      "tests/architecture-v3/region-router.test.mjs",
      "tests/fixtures/architecture-v3/profile-canaries/bdf1620w-p1-structured.json",
      "tests/fixtures/architecture-v3/profile-canaries/bdf1620w-p2-image.json",
      "tests/fixtures/architecture-v3/profile-canaries/bdp810w-p1-split-columns.json",
      "tests/fixtures/architecture-v3/profile-canaries/bdp810w-p2-table.json",
      "tests/fixtures/architecture-v3/profile-canaries/ewf7524cdwa-p3-table.json",
      "tests/fixtures/architecture-v3/profile-canaries/ewf7524cdwa-p6-image-context.json",
      "tests/fixtures/architecture-v3/profile-canaries/manifest.json"
    ],
    "sha256": "4d4e437d31741480301e5a485947e4bb2b28d92bea94e32771eb42c2fc1b4c53"
  },
  "recommendation": "revise",
  "workflowLabel": "revise",
  "impact": {
    "rating": "moderate",
    "rationale": "The exported structural selection/routing contract is affected; no current public consumer, receipt, persistent state or deployment path is introduced."
  },
  "regressionLikelihood": {
    "rating": "high",
    "rationale": "Missing and unknown raw block types now select and route under the split-column profile; the byte-bound v1 selector rejected the same replayed inputs."
  },
  "regressionProtection": {
    "rating": "partial",
    "rationale": "Frozen affected47 and three-mode captures protect the three original findings, but miss raw-kind acceptance and exact fix-version full CI.",
    "exactHeadChecksPassed": false
  },
  "recoverability": {
    "rating": "easy",
    "rationale": "Uncommitted local modules/fixtures only; correction or revert needs no migration or evidence rewrite, and is owned by executor/main."
  },
  "confidence": {
    "rating": "high",
    "rationale": "Exact immutable fix diff, live16 hashes, source traces, two counterexamples and a legitimate control bind the scoped conclusions; not a new whole-repository audit."
  },
  "applicability": {
    "status": "confirmed",
    "rationale": "The canary CLI consumes the router; the exported direct selector and router are supported G3b interfaces."
  },
  "statusQuoRisk": {
    "rating": "moderate",
    "rationale": "Uncorrected v1 retains the three prior defects; do not discard the successful fixes solely because a new refactoring regression needs repair."
  },
  "autoMergeExclusions": [
    "public_contract",
    "architecture_specific_rollout",
    "other"
  ],
  "affectedRuntimeRoots": [
    "scripts/architecture-v3/run-profile-canaries.mjs",
    "selectDocumentProfile",
    "routeExtractionRegion",
    "verifyProfileCanaryAttestation"
  ],
  "importantCallers": [
    "region-router.mjs:761-788",
    "region-router.mjs:863-878",
    "document-family-registry.mjs:274",
    "region-router.mjs:215-237"
  ],
  "riskDrivers": [
    "raw-kind closed validation removed at the selector-to-shared-replay change",
    "exact fix-version full CI unavailable"
  ],
  "protectiveFactors": [
    "single serializable replay implementation",
    "G3a strict anchors reused",
    "12 real alternate witnesses distinct from tamper controls",
    "no public or receipt authority"
  ],
  "materialBoundaries": [
    {
      "id": "negative-witnesses",
      "invariant": "Each negative replays its own source/region before target nonselection and expected alternate outcome.",
      "runtimeRoot": "verifyProfileCanaryAttestation",
      "counterexample": "Donated positive identity or rehashed wrong alternate profile is rejected (tests:713-723).",
      "legitimateControl": "All12 manifest pairs match the two preserved mode logs and their own original raw blocks (router:863-893).",
      "result": "supported"
    },
    {
      "id": "crop-structural-lineage",
      "invariant": "G3a typed crop ancestry, raw full-page coordinates and recorded rotation remain bound.",
      "runtimeRoot": "inspectExtractionRegions",
      "counterexample": "Wrong page/ancestor/raw frame/rotation/coverage and weak crop alias fail (tests:665-689; observation:227-306).",
      "legitimateControl": "Explicitly synthetic G3a crop records at0/90 degrees route structurally; all6 original full pages remain unchanged (tests:593-662).",
      "result": "supported"
    },
    {
      "id": "direct-replay",
      "invariant": "A submitted inspected status or derived signal cannot substitute for replay.",
      "runtimeRoot": "selectDocumentProfile",
      "counterexample": "Forged inspected status and extra derived signals fail (tests:572-591).",
      "legitimateControl": "Serialized genuine inspected region selects; registry and router use observation:451-478.",
      "result": "supported"
    },
    {
      "id": "raw-kind-closed-input",
      "invariant": "Missing or unsupported raw types do not become eligible structural text just by replaying them.",
      "runtimeRoot": "selectDocumentProfile / routeExtractionRegion",
      "counterexample": "Synthetic BDP /0/47 unknown/missing type is invalid in preserved v1 selector but selected/routed MinerU in v2, also omitting AXIS_OR_LEGEND_GAP.",
      "legitimateControl": "Original index type selects in both versions and retains AXIS_OR_LEGEND_GAP; audit log:263-377.",
      "result": "contradicted"
    }
  ],
  "validation": [
    {
      "name": "frozen-v2 identity and directional diff",
      "status": "passed",
      "protects": "16 live byte/hash pairs, original audit and both patch hashes match."
    },
    {
      "name": "prior executor affected47/47 plus portable/original/missing-store captures",
      "status": "passed",
      "protects": "Actual recorded exits0/0/0/2; reused, not rerun; main verified39 current inputs."
    },
    {
      "name": "Dewey read-only binding and raw-kind diagnostic",
      "status": "failed",
      "protects": "Child exit0 means the two raw-kind regressions were reproduced; semantic fail-closed expectation failed."
    },
    {
      "name": "exact fix-version full CI",
      "status": "unavailable",
      "protects": "Whole-branch integration/build/release protection remains a main-owned merge gate."
    }
  ],
  "unknowns": [
    {
      "summary": "Exact fix-version full CI is not available; historical v1 full3196 cannot substitute.",
      "decisionCritical": true
    }
  ],
  "evidencePlan": []
}
```
