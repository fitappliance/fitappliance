# G4b R1 独立复审（frozen delivery v2）

**结论：CHANGES_REQUIRED。F1 NOT ADDRESSED；F2 ADDRESSED；F3 ADDRESSED。**

复审日期：2026-09-23（Australia/Perth）。执行者 Avicenna（`01a0a453-4a89-7e93-b95b-05fbdf002700`）已 STOP WRITING；独立审计席 Meitner（`01a0a4bb-9764-7890-a2ab-515026cbed14`）仅审计和保存本报告/私有诊断，未委派、实施、提交或发布。

## 冻结对象与审计范围

Base 与 HEAD 均为 `7b0764b0c5b099ed19b8af9b46860408c4121083`，分支 `codex/architecture-v3-g4b-source-binding`；源码尚未提交。以下身份已独立重算：

| 对象 | SHA-256 |
| --- | --- |
| Frozen delivery v2 manifest | `254ee5c0bd1ff503e785c8cc02ecc2be1c59052f4da66f65ba13a0050502b7f6` |
| Repair v2 diff | `d49a65f359ff956ab10eb726bf9fba2ca3b942f2c7f6082ebe376494ab4c7b88` |
| Whole-branch v2 diff | `c89d7921ad9816b4ff6314576f20b2c23d427556c2ad25aac1c4e1ab6abeffda` |
| `src/domain/architecture-v3/verified-source-binding.mjs` | `69373ebea2fdc42509a2d0692d1c0b2a486f4ab76f509e1753044338a09a4282` |
| `src/domain/architecture-v3/evidence-claim-receipt.mjs` | `a08e82f80f2649a8e0a92d7942b8e4d2bf1fe1dfbdee64f6d5d925dced11f95f` |
| `tests/architecture-v3/direct-source-binding.test.mjs` | `cc63d3e73b1e38f6bf1f0e04a61eea43f03b08712b0b3a8a3db1cfe04f3a07fc` |
| `docs/architecture-v3/execution/G4b-direct-binding.md` | `c86e241094e3efa9a30dc305dc3f683a6b42ea028f08ef4d27babea6d04f8b32` |
| 原初审 `docs/architecture-v3/execution/G4b-independent-audit.md` | `381f06e6401f0c9bf0dca8408e2ddad07340128cdf63f12c08814c80b27c40a5` |
| `docs/superpowers/plans/2026-09-13-architecture-v3-evidence-foundation.md` | `dda17031ac90f55b364ae436d84adc92fbcc45f42cfab2b1a54361c612c512c0` |

完整分支 diff 已在内存中按 base 重建，6 个输出均逐字等于当前冻结文件。精确 v1 binding 快照 SHA 为 `656b85e1b53b32d27574a12ead7c524f18135863b3e2f64ac59b06968ed03332`；receipt consumer 与 v1 字节相同。本轮按该源码修复差异、完整当前测试及原初审覆盖边界审查；最早 RED 测试快照不是 v1 测试，未将其补充 diff 冒充 v1→v2 完整测试历史。

适用要求为 Product Core exact-model/field/UNKNOWN 原则、V3 spec §6.2、§7–9.1、计划 G4b、Terra 协议及本轮 F1/F2/F3 裁定。原初审结论保留原件；本报告不追改其历史判断。

## 逐项复审

| 项目 | 判定 | 代码与证据 |
| --- | --- | --- |
| F1 来源关系语义 | **NOT ADDRESSED** | `verified-source-binding.mjs:566-689` 已用来源对象、确切 locator/caption/row/span 校验三条关系，拒绝额外 relation、paragraph、伪造派生表、跨行/错误 SKU、metadata literal 转移；`tests/architecture-v3/direct-source-binding.test.mjs:1685-1718,1747-1819,1831-1846` 有相应反例及 truthful rehash 正例。但下述 Important R1-1 仍能绕过异型号行检查并产生可重放 receipt。 |
| F2 小数拒绝 | **ADDRESSED** | `verified-source-binding.mjs:692-699` 修正 decimal lexical regex；两条实际 factory 继续调用它（`:848,994`）。测试 `:1720-1745` 证明 manufacturer `59.8 cm → 598 mm` 且原 source representation 保留小数/单位，installation `waterConnection.hoseReachMm=598.5 mm` 完成 receipt JSON replay。`:1755-1760` 仍拒绝 fractional width 的既有 whole-mm 约束，`:1823-1829` 拒绝 exponent/sign/leading-zero/repeated-dot/backslash tokens；未放宽精度、舍入或猜测单位。 |
| F3 捕获引用 | **ADDRESSED** | `G4b-direct-binding.md:164-174` 引用完整 v1 SHA `57dabc8028df0ef3d592dbb49e3c3d94ebd8a1cdad43b26d3ce4b6b48599fb0c`；`:286-319` 将 2026-09-15 修复捕获及三个执行文件身份与 2026-09-23 报告更新分开。v1 原件未改。 |

F1 已做的实质改进有效：witness 的 tool tag/hash 不再构成关系权威；端点必须直接位于已重放对象；installation 将确切行交回既有字段语义 owner 校验。完整 proof、Claim 三键 projection、profile/policy identity、stored receipt replay 和 rights `unknown_blocked` 边界保留。然而，F1 要求对不支持或矛盾的来源结构 fail closed，不能只拦住现有测试的标签写法。

## 新发现：Important R1-1

**遗漏 `<tr>` 的异型号表格单元格逃过行计数与 scope 校验，仍获得 exact-model receipt。**

位置：`src/domain/architecture-v3/verified-source-binding.mjs:634` 使用带 `xml` options 的解析路径；`:655-668` 只计入其显式 `tr` 后裔，却允许任何位置的 `td/th` 标签，并允许它们包含非空文本。它没有要求每一个表格单元格均归属于被验证的行。

现有来源/字段解析 owner 使用另一种结构解析方式：`src/domain/mineru-document.mjs:147-156`、`src/domain/installation-evidence-pipeline.mjs:258-280` 使用 `load(html, null, false)`。同一段来源字节在该路径中包含隐式补出的异型号行，新 G4b 路径则漏掉该行。选中 scalar row 之后的字段校验仅检查该行，不能重新发现被漏掉的 model heading。

独立反例的关键来源结构为：

```html
<table>
  <caption>EWF7524CDWA-PORTABLE-SYNTHETIC</caption>
  <tr><th>Dimensions</th><th>Value</th></tr>
  <th>EWFOTHER-SYNTHETIC</th>
  <tr><td>Unpackaged Width</td><td>598 mm</td></tr>
</table>
```

省略 `<tr>` 的写法即使被视为不受支持的 HTML，也应成为 candidate gap；不能悄悄丢掉它表达的型号冲突。将孤立 `th` 换成 `td` 有相同绕过。

本轮只针对该新疑虑运行四个内存 synthetic case。复用冻结测试的 fixture builders，在创建全部原始/MinerU/owner/历史 receipt/fragment/witness/hash 之前替换 synthetic HTML；生产 factory 原样 import，无 `verified` stub、无修改仓内 fixture/实现。全部历史 installation replay 均 PASS；表内标准型号标题对照及普通正例行为如下：

| 输入 | 既有解析器 / G4b 解析器的行数 | 实际 factory 结果 |
| --- | --- | --- |
| 正常 caption + 普通 header + scalar row | 2 / 2 | 正常 receipt `bd1f6483796bc571e7623eaeddcf028f85271b068ab48d29c10d40d5158e4204`，JSON replay 相同 |
| 显式 `<tr><th>EWFOTHER…</th></tr>` | 3 / 3 | `SOURCE_RELATION_CANDIDATE_GAP` |
| 孤立 `<th>EWFOTHER…</th>` | 3 / 2 | **错误接受且 replay 成功**；receipt `99fe9a4bdecca1557b67a1a69a02839cf9351c7f6c675d706c476a96fd2f47b3` |
| 孤立 `<td>EWFOTHER…</td>` | 3 / 2 | **错误接受且 replay 成功**；receipt `47ec69bb5432f223b80d9fc38e56e3af2d479ad29a0115f1eac7a65c41ec2d87` |

两条错误接受均有 `claimEligible=true`、完整新 binding/receipt ID 和 `unknown_blocked` rights；不是复用旧 receipt ID 或篡改后验证被拒绝。它们只是在审计内存中生成的反例，不计入真实来源修复、接受或公开数量。

该反例直接延伸 `tests/architecture-v3/direct-source-binding.test.mjs:1831-1837` 的 intervening wrong-SKU 测试。当前测试只覆盖显式 `tr`，因此 33 个 focused 绿色未覆盖这个解析拓扑差异。也因此，handoff `G4b-direct-binding.md:122-124` 关于排除所有 intervening headings/unsupported markup 的表述超出了代码实际行为；这是同一 F1 阻断的报告影响，不另计一个发现。

最低修复范围：仅在 G4b 关系重放中约束完整 table/caption/section/row/cell 层级，确保没有被跳过的非空单元格或标题；或对既有解析语义与定位解析存在结构分歧的输入明确 fail closed。补实际 factory RED→GREEN，覆盖上述 `th`/`td` 两种遗漏行边界、原始历史 PASS、完整重算 closure 和 receipt 禁发，保留正常 supported positive 与 truthful rehash。无需修改现有 parser/G3a/G4a/profile/rights owner、扩展通用 HTML 语法或接入发布。

未确认新的 Critical；无另外独立的 Minor。当前无线上 consumer 或真实接受/公开行为，故不将此标为已发生的生产事故；它仍是 G4b source-authority gate 的合并前 Important 阻断。

## 可复现诊断与完整捕获身份

新诊断由 `G4b-audit-v2-structure-probe.mjs` 完成，脚本 SHA-256 `fdc7454456ad458b0c25229d495fb821eb9c1af658f40c7979ab54330b3d66b0`。自动捕获器 SHA-256 `411d06d3cb975e320b566e8fec897a81934e9ebe3f95843d5226af704b186332`。运行于 Node `v22.23.1`，实际 UTC 时间 `2026-09-22T23:07:29.143Z` 至 `23:07:31.984Z`。

- 完整 stdout：4244 bytes，SHA-256 `e0c7f7b74b90c3b4753b95a7bfda1862bed3283f0cf8d1b917dd9a81c92dec5a`。
- 完整 stderr：0 bytes，SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`。
- 子进程 exit `0`、signal `null`、无 spawn error；exit 0 表示四个诊断完成，**不表示安全断言通过**，其中两项明确记录错误接受。
- 输入快照：SHA-256 `0471054f6295c5c3f49ffd24fa99d8e85fdff75508e47f5a5c4ae3796aa11c79`；metadata：SHA-256 `449448687ff9ab1d23473804133779fc772d3de8a39953f0abca2b4dbd1eeb30`。自动捕获确认 frozen target、引用文件、HEAD/index 前后相同。

以上 private diagnostics 保存实际完整输出及输入身份；本可提交报告不链接私有 SDD。原初审 PoC、旧审计、旧报告和旧捕获未修改。

## 执行者历史测试证据核对

本轮重新读取并核对 2026-09-15 最终 capture manifest `bf91f8901047e0bb5869e79050d8cf6a62102144d0da5c1dee9f07350507d8ba` 的 314 个引用记录（263 个不同路径），字节数/hash 均无漂移；不是仅接受主 agent 或实现报告的汇总。input snapshot 为 `28e742e72d5a5f286471bf9f541163ca8fff3d87b59563fceb864a53374dc93d`。

完整原始输出及 metadata 相互一致：focused 33/33、full 3304/3304，fail/cancelled/skipped 均 0；lint exit 0；隔离 schema exit 0，2330 pages / 6145 blocks / 0 errors。所有四条命令 signal null、stderr 0 bytes。focused stdout SHA 为 `da13b5877231c091683f5cdc8a65b53281ebe2d2c4aad8fbf3253271274a5348`；full stdout SHA 为 `12bfba5f89ad55dc25b731a189cd732dd7fee051381705ef6da44ad24f2e48ff`。full 的顶层 plan 3265 与含 nested suite 的 total 3304 不冲突；失败的额外 seal helper 不被当作成功证明。

10 组迭代捕获的 SHA、退出码、完整失败诊断和 totals 与 handoff 分类一致，尤其：

- 首 RED 0/7 中只有 2 个真实 F1 行为失败；另 5 个是 form-factor/legacy integer-mm 夹具构造失败，不能充当目标 RED。
- 第二 RED 1/7 包含 4 个 F1 `Missing expected exception` 及两条实际 factory 的 `UNSUPPORTED_SOURCE_VALUE`。
- 名称带 green 的 6/7 run 实际 exit 1，fractional width 被既有 whole-mm 约束拒绝；报告没有把它标作成功。
- 后续 0/2 RED 的 fractional hose 已到达实际 factory，旧 regex 拒绝它；相同值 Depth-as-Width 未被拦住。该组确立 F2 的有效 RED，随后 green 与最终捕获闭合。
- intervening heading、非标准 JSON metadata 转移的后续 RED 都有实际缺失拒绝诊断；它们的显式测试在最终捕获中通过，但不证明 R1-1 已覆盖。

三个交付 synthetic receipt ID 与原始 diagnostic 行完全一致：width、fractional hose、truthful rehash；计数是 3 个 ID / 2 个 source-field scenario，不是 3 个真实来源。旧 `green-007` / `red-008` 仍为不完整历史诊断，未被补记成完整 TDD 证据。没有重跑未变 focused/full/lint/schema；其绿色日期保持 2026-09-15。

## Spec、质量及尚未裁决事项

**Spec-compliance：CHANGES_REQUIRED。** F2/F3 达标；F1 对多数已列反例的处理符合 source-derived 要求，但 R1-1 仍违反 spec §7.2 同一 model/row/context 证明及 §9 exact-source equality。隐藏矛盾来源行后重复运行相同 binding producer，不能使证据变为充分。

**Code quality：CHANGES_REQUIRED。** 改动集中在新 binding producer，复用既有安装字段语义、保持 consumer 字节不变、没有增加依赖/策略语言，错误返回为 field-scoped candidate gap；这些设计边界合理。新增解析路径与既有 owner 的结构差异缺乏完整检查，是本轮仍未解除的质量和正确性阻断。

原初审与本轮源码修复/完整当前测试复审合计覆盖所提交的整个 G4b 分支代码接受范围，未将空 HEAD→HEAD diff 当作审查范围。**覆盖完成不等于接受：整个分支最终仍为 CHANGES_REQUIRED，尚存一个承重缺口 R1-1。** F2/F3 不需因该缺口重复全套绿测试；下一轮应先修复并证明该局部危险反例，再冻结实际改动和受影响检查。

明确列出的未决 / declined-to-judge 项目：

- 真实 corpus 的来源语义与完整安装覆盖：本轮未做新原件视觉解释或 OCR，不将 synthetic 表格用于真实 PDF 认证。真实 G4b binding、新 receipt、accepted/public receipt 均为 0，新 OCR 为 0，whole-corpus repair 未完成。
- 复杂表、多行多型号、跨页关系、非标准 JSON 编码及不兼容 profile：目前声明为 candidate gap，未裁定应在 G4b 扩大支持；仍由后续证据/范围工作处理，不能据此放宽当前 F1 门槛。
- BDF1620W 的历史 replay 与其 paragraph 关系 gap，以及两份 Fisher & Paykel installation 的历史 PASS/缺 G3a closure/profile：按冻结实现和捕获保留，未升级真实 applicability、context 或 receipt。
- G5 review/CurrentEligibility、G6 corpus upgrade、rights grant、Fit/public/runtime consumer 和发布：不在本轮接受范围，未运行或授权。CI 的原件缺盘四项边界仍须主 agent 在实际 CI 中核验，portable positive 应执行；本轮未运行 CI。
- 精确 v1 测试历史不可恢复的部分：已采用完整当前测试与真实 RED source snapshots 审查，不虚构缺失 diff；不将该材料限制解释为所有历史行为均有逐项回归证明。

以上事项没有被静默计为已通过；它们也不能替代对 R1-1 的修复。由主 agent 交回原执行者，复审席不实施。

**STOP WRITING。**
