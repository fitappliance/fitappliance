# G4b R3 独立限定复审（frozen delivery v4）

**APPROVED — 原 Important R2-1 ADDRESSED；Spec-compliance 与 Code quality 均通过本轮限定复审。未发现新的 Critical / Important / Minor。**

2026-09-23（Australia/Perth），独立审计席 Meitner；Avicenna 已 STOP WRITING。范围仅为批准的完整原文范围核算及其相关新破坏，未委派或实施修复。

## 精确受审身份

HEAD/base 为 `7b0764b0c5b099ed19b8af9b46860408c4121083`，分支 `codex/architecture-v3-g4b-source-binding`，尚未提交。审查的是冻结 snapshot diff，不是空 Git 区间。

| 对象 | SHA-256 |
| --- | --- |
| 八文件 frozen v4 manifest | `a1fa8a84702d16fb177a191283b509bacb7e98241753426848320cd20efde469` |
| Exact R2→R3 diff | `653834b9ed6a110c922fce8b154e30361c631ff52fd0ac5ca2d4459ce1bca236` |
| `src/domain/architecture-v3/verified-source-binding.mjs` | `13ffa057142de8f46aa1c0a18db3f8c39c4f843cc08ae9da62068447b4a3b18d` |
| `tests/architecture-v3/direct-source-binding.test.mjs` | `1d4202f49d2170fb4330a74c094ef84524ca2169e80ee0f3958279e705f56385` |
| `docs/architecture-v3/execution/G4b-direct-binding.md` | `162c423a16e01f94a3f57b639e6a87251a9ab02c27bda086909cbd8969a67925` |
| 未改 receipt consumer | `a08e82f80f2649a8e0a92d7942b8e4d2bf1fe1dfbdee64f6d5d925dced11f95f` |

八份 R3 base snapshots 均核对；修复包在内存逐行验证旧上下文并重建，三个输出逐字匹配当前冻结文件：binding `+30/-1`、tests `+52/-2`、handoff `+74/-4`。全部生产变化位于既有 relation replay，未增加依赖或改动既有 owner。

## R2-1 闭合依据

原发现：“表内冲突标题/文本被 parse5 移到表外后，绕过仅检查 DOM 后裔的 source-scope 门禁。”

- **不是父 span 假覆盖。** `verified-source-binding.mjs:688-697` 仅收集同次 parse5 的独立 `startTag/endTag` token；父元素完整 span 只用作边界，不放入覆盖集合。`:698-705` 要求每个 text 的原始 substring 经仅 CR/LF 归一化后等于完整 parsed text，故 coalesced text 也不能吞掉被丢弃 token。
- **范围实际闭合。** `:708-715` 按原始 UTF-16 位置排序，拒绝重叠、倒置、越界及间隙/尾部非空白。迁出 DOM table 的标题/裸文本不再被计入覆盖，留下的原文缺口使其拒绝；没有 DOM 节点的丢弃内容也会留下缺口或破坏 text 忠实性。没有第二次解析、标签黑名单、调用方 completeness 布尔值或虚构位置。
- **仍须满足原语义。** `:664-687,716-735` 保留 exact caption、行数/表头、field/scalar/unit 与精确 span 检查；范围覆盖不能代替这些条件。隐式 `tbody` 不获得伪造 token，而显式内容仍须被核算。

`direct-source-binding.test.mjs:1956-1994` 的四个实际 factory 回归覆盖原 `h2`、原裸文本、行间被丢弃 `</section>`、`Dimen</section>sions` 中被 text span 跨越的丢弃 token。它们先完成历史 PASS 及完整错误 receipt issuance/JSON replay，修复后才转为 typed source gap；不是只拦一个标签拼法。

已读完整 stored-replay helper 与两份原始输出：它直接读取原独立诊断的 envelope/base64 原件，逐对象校验 hash，不重建 fixture 或替换 proof。实际 R2 坏 receipt `df2ddb9d86bd6326188830012197b59a12cf40d9a9e2b9e5ed24ea7b3abcb78e`、`e8e286aa198196dfc117421c05445e56f1a61f9b1acff27c1fc0ad76b3e3f1e5`，修复前新签发与 replay 均接受；修复后分别以 `SOURCE_RELATION_CANDIDATE_GAP` / `SOURCE_BINDING_REPLAY_FAILED` 拒绝，原因是 source row，而非缺对象、digest 或 harness 错误。正常 stored control 仍通过，原孤立 th/td 的两个坏 envelope 仍拒绝。

正常/UTF-16/CRLF、fractional hose、truthful rehash 的五个 supported synthetic receipt ID 与 R2 完全相同。`:1997-2003` 的合法空白与隐式 tbody 正例通过 binding/replay，但没有新增第六个 receipt。原内部 CRLF/entity negatives、R1-1/F2 回归也仍在最终捕获中通过；本轮不重复全面审查其未改实现。

## 原始执行证据与本轮验证

最终 manifest：`G4b-r3-final-20260923T143559884Z-manifest.json`，SHA `885e6820ab05fb67f4d4435b60b2abdd9d800ff2fad3a88754a6545044adb4ae`；输入快照 SHA `c5e5a59ab04a44b3404b6f5782ebd3dbb23ce518248532f26f09f9362a60b427`。独立重算 1081 个直接引用 / 732 路径；仅展开本次 metadata/inputs 后为 **7086 个引用 / 3067 路径**，长度/hash 全部匹配。旧 artifacts 作为不可变字节验证，不把历史 canonical 路径身份误套到当前源码/plan。

执行者真实最终运行时间为 2026-09-23 UTC 14:36:00–14:37:04：focused **45/45**、full **3316/3316**，零 fail/cancel/skip/todo；lint exit 0；隔离 schema exit 0，2330 pages / 6145 blocks / 0 errors。四条命令无 signal/spawn error、stderr 为空。不是本审计轮重新运行的套件。

| 完整 raw stdout | SHA-256 |
| --- | --- |
| 最终 focused，12401 bytes | `e74e24e7d56072dbcb88a8763c0e1f346663a6dd1d60582ea7ada0d123137ceb` |
| 最终 full，761139 bytes | `df525b200af3be5d7074d199a9a87bc0f414cc7f83cd029488dc8b0cdcdaf12b` |
| 有效 RED `143345149Z`，440258 bytes | `5ecb4087dd04ad32aba88b7aba537849193688a9f0e5327eb206c308e747b6c2` |
| 修复后实际 stored replay `143524574Z`，2370 bytes | `cfa1c2ec376298fd5c8b648e3cac487eb93c62e82e29fa343a523f35ae6fb136` |

六组 run 的原始输出、退出码、metadata、source/test snapshots 和 handoff 分类相符。首 RED `143321817Z` 的 2/7 中，四个 `Missing expected rejection` 是有效行为 RED，另一个 `UNSAFE_JSON` 是空白测试传错参数名，不能计作目标 RED。改正测试调用后生产源码仍为 R2，`143345149Z` 为 3/7、四个真正 RED；`143408418Z` stored replay exit 1 是旧坏 envelope 仍被接受。随后 `143458165Z` 为 45/45、stored replay exit 0，最后 full 绑定同一最终源码。失败没有被删除、补写或重命名为通过。

本轮无剩余需新 factory 反例才能回答的具体疑问，未重跑 focused/full/lint/schema。新增只读 evidence check 自动保存 exact diff 重建、全部引用核对及 capture 比较，未把机械验证当成语义证明：`G4b-audit-v4-20260923T144316638Z-evidence-check`，exit 0、signal null、stderr 空、输入/保护文件前后相同。完整 stdout 39268 bytes / SHA `bb065c09394af23b323798952f505d674bf7eb5ebc5ec2c5e7d54a81c316a51e`；metadata SHA `cc92750cab14d6f87af06c65008fdcee47fdeac828b684b89b269f164af86816`；脚本 SHA `48cc0d4863cfcd4a723c1b5dddff9eb5beba4fadf4ecf8d5ecc4622b8c81bdc9`。完整输入、stdout/stderr 与真实 exit/hash 保存在新私有诊断中；本报告不链接私有 SDD。

## 质量、范围限制与累计结论

核算位于原有单次解析路径，以原文 token/text 约束既有语义，改动集中且失败仍是 field-scoped candidate gap；正常、Unicode/CRLF、隐式分组没有被一概拒绝。**Spec 与 code quality 达标，无新增已确认问题或必须修复项。**

Declined judgments / 限制：

- 不宣称穷举所有 HTML 或 corpus。表内 comment、非忠实 entity 等未核算/不支持写法可保守成为 candidate gap（`:703-715`）；扩大这些语法的支持不是本轮批准目标，不把保守拒绝称为坏 PDF。
- 不重新全面裁决未改 owner、R1-1、F2/F3、profile/rights；承接既有独立审计覆盖，而非实现者自我批准。
- 未做真实 PDF 解释、OCR 或 corpus repair。五个 synthetic positive 不等于真实来源修复；真实 new binding/receipt、reviewed/admitted、accepted/public 均为 **0**，新增 OCR 为 **0**，whole-corpus 仍未完成。
- 缺盘 CI 的四个原件 skip、portable positive 实际 CI 执行、exact-commit 集成与发布检查仍由主 agent 承担；G5/CurrentEligibility、G6、rights grant、Verified Fit 和发布不在本轮范围。

**原初审 + v2/v3 修复复审 + 本次 exact R3 范围构成当前分支连续覆盖；R2-1 已关闭，目前没有剩余代码接收 blocker，可接受这份冻结 G4b 代码交付。** 这不授权真实 receipt 晋升、公开权利或发布。审计结束核对八个冻结目标、受保护旧 artifacts、HEAD/index 无漂移；index SHA `72fb1672d8e93f3025f3b199f4842d1aeeb7aa57d0f71aa5410f6a89d26d0de8`。只新增本报告与私有诊断，未改实现/测试/计划，未提交或发布。

**STOP WRITING。**
