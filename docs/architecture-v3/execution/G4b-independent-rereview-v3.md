# G4b R2 独立限定复审（frozen delivery v3）

**结论：CHANGES_REQUIRED。原 R1-1 ADDRESSED；新增 Important R2-1 阻止代码接收。**

日期：2026-09-23（Australia/Perth）。Avicenna 已 STOP WRITING；本轮由既有独立审计席 Meitner 执行，未委派、实施修复、提交或发布。只新增本报告及私有 `G4b-audit-v3-*` 诊断；旧审计结论原件保留。

## 范围与冻结身份

依据批准的 R2 两份 brief、原 R1-1 及 CRLF boundary 要求，仅检查 frozen-v2→R2 修复和相关新破坏。没有重审未改 owner、F2/F3、profile、rights 或整个 corpus。Base/HEAD 均为 `7b0764b0c5b099ed19b8af9b46860408c4121083`，分支 `codex/architecture-v3-g4b-source-binding`，源码仍未提交；未用空 Git 区间代替修复包。

| 对象 | SHA-256 |
| --- | --- |
| Frozen delivery v3 manifest | `585400a74f2e25d9bfd564c6ce985b44f886c586d7b335d02fdc643929df0739` |
| Exact frozen-v2→R2 diff | `80ba8f35d1d30c2e38d1d3ed07a7d639349299662fdac8bc1bc847d2549d3062` |
| R2 base manifest | `80c2cf18f706d7f124aef35b14cb5a212fd2c312f9654d8437442a89d40e5880` |
| `src/domain/architecture-v3/verified-source-binding.mjs` | `cc0dac3d3d4e0efcdacf52701c652d1088e804653ba5082f32761c48a70cd78e` |
| `tests/architecture-v3/direct-source-binding.test.mjs` | `d541f8a62b2b99e3ef4bc02c7bdf415d5dc8abc263f8a13cf69bbfaeb7046f6e` |
| `docs/architecture-v3/execution/G4b-direct-binding.md` | `511398d15748ea9892cb59d43a355bfe1cad8d370d8bb7a784c4c7d57ebbc297` |
| 未改 `src/domain/architecture-v3/evidence-claim-receipt.mjs` | `a08e82f80f2649a8e0a92d7942b8e4d2bf1fe1dfbdee64f6d5d925dced11f95f` |
| 原初审 `docs/architecture-v3/execution/G4b-independent-audit.md` | `381f06e6401f0c9bf0dca8408e2ddad07340128cdf63f12c08814c80b27c40a5` |
| 原 R1 复审 `docs/architecture-v3/execution/G4b-independent-rereview-v2.md` | `b1dbeb3f75d7a51a1ab1b1b4165e1b53c6c08bab57100f05f3642815838a366c` |
| 主方已批准并冻结的 plan | `2f2652d6490f793d32b4da92062a76f8bdc3e2408ed72911c8ac535ab6d239a9` |

已逐项验证 7 个 base snapshots；按修复包在内存中验证所有旧上下文并重建 3 个变更文件，结果逐字等于冻结当前文件。实际改动为 binding `+26/-8`、tests `+112/-3`、handoff `+228/-13`。binding 的全部生产改动均在既有 `replaySourceRelations` 内；未增加依赖、第二套 AST 或修改既有 owner。

## 原 R1-1：ADDRESSED

原发现：“遗漏 `<tr>` 的异型号表格单元格逃过行计数与 scope 校验，仍获得 exact-model receipt。”

- `verified-source-binding.mjs:636-656` 由同一次默认 HTML/parse5 解析提供语义与原始 UTF-16 位置，删除 htmlparser2 的独立位置解释。被选中的 table、caption、label/scalar cell 及其 text 必须有有效原始 span（另见 `:663-673`）；没有原始 span 的隐式语义行被拒绝，允许只作分组的隐式 `tbody`。
- `direct-source-binding.test.mjs:1850-1883` 经实际 factory 检查孤立 `th`/`td` 的新签发及外层重算 receipt replay；`:1914-1918` 拒绝无原始 span 的 scalar row。
- 本轮使用精确 frozen-v2 构建器（SHA `cc63d3e73b1e38f6bf1f0e04a61eea43f03b08712b0b3a8a3db1cfe04f3a07fc`）重建原 PoC 输入，并 import 当前生产函数。两例历史 installation replay 均 PASS；v2 binding 接受，R2 新签发均以 `SOURCE_RELATION_CANDIDATE_GAP` 拒绝。
- 同时读取执行者首 RED stdout 中实际保存的两份完整坏 envelope，不伪造新 envelope：原 receipt `99fe9a4bdecca1557b67a1a69a02839cf9351c7f6c675d706c476a96fd2f47b3` 与 `47ec69bb5432f223b80d9fc38e56e3af2d479ad29a0115f1eac7a65c41ec2d87` 均以 `SOURCE_BINDING_REPLAY_FAILED`、`exact source table row` 原因拒绝。不是 harness 错误、缺对象或仅 digest 不匹配。

位置处理的其余批准要求在代码及原始捕获中成立：`:651-661,697-701` 使用原始 substring 做匹配/偏移，仅用 CR/LF 归一化核对 parse5 text；不把归一化后的字符串下标当作源位置。测试 `:1886-1911` 独立断言 UTF-16 prefix 在原 JSON 的 12-unit 偏移；`:1921-1944` 断言 CRLF scalar edges 的 value/unit 16-unit 偏移并完成 JSON replay；`:1947-1953` 仍拒绝内部 CRLF 和 encoded-space entity。正常 control receipt ID 保持 `bd1f6483796bc571e7623eaeddcf028f85271b068ab48d29c10d40d5158e4204`。

这里的 ADDRESSED 限于原孤立行缺陷及上述修复要求，**不等于 F1 全部来源关系可接受**：本次解析器切换新增了下述回归。

## 新发现：Important R2-1

**表内冲突标题/文本被 parse5 移到表外后，绕过仅检查 DOM 后裔的 source-scope 门禁。**

位置：`src/domain/architecture-v3/verified-source-binding.mjs:636`、`:662-686`。新解析路径会修复非法 table 内容的位置（foster parenting）；后续范围/unsupported markup 检查仍仅遍历 `$(table).find(...)` 及其 contents。没有检查处于原始 table 源文本区间内、却被修复迁到 DOM table 外的非空语义内容。以下位置均为原 HTML 的 UTF-16 code-unit 坐标。

实际反例的完整单行 HTML（存放在选定 MinerU `content.html`，其他证据从此源重新构造）：

```html
<table><caption>EWF7524CDWA-PORTABLE-SYNTHETIC</caption><tr><th>Dimensions</th><th>Value</th></tr><h2>EWFOTHER-SYNTHETIC</h2><tr><td>Unpackaged Width</td><td>598 mm</td></tr></table>
```

因果证据：该次 parse5 解析记录 table 原始范围为 `[0,182)`，冲突 `h2` 为 `[98,125)`，明确位于原 table 中、header 与 scalar row 之间。然而 `h2` 的 DOM parent 成为 root，序列化结果为 `h2` 在 table 前；table 后裔只剩正确 caption、普通 header 和 scalar row。于是 `:683-686` 看不到冲突标题，后续 exact span 检查全部通过。将 `h2` 换为裸 `EWFOTHER-SYNTHETIC` 文本同样绕过：其原始 `[98,116)` 在 table `[0,173)` 内，DOM 中却被移出 table。

同一批完全重建、全部历史 replay 为 PASS 的输入得到以下实际结果。v2 对照是读取冻结源码 SHA `69373ebea2fdc42509a2d0692d1c0b2a486f4ab76f509e1753044338a09a4282` 后仅在内存中执行 factory，未替换磁盘生产模块。

| 来源变体 | frozen-v2 binding | 当前 R2 factory / JSON replay |
| --- | --- | --- |
| 正常支持表 | 接受 | 接受，control ID 不变 |
| 显式错误型号 `tr/th` | candidate gap | candidate gap |
| 原孤立 `th` / `td` | 接受 | 两者均 candidate gap；实际旧坏 receipt 均拒绝 |
| 表内错误型号 `h2` | candidate gap | **错误接受，receipt replay 成功** |
| 表内错误型号裸文本 | candidate gap | **错误接受，receipt replay 成功** |

两条新错误 receipt 身份分别为：

- `h2`：`df2ddb9d86bd6326188830012197b59a12cf40d9a9e2b9e5ed24ea7b3abcb78e`；binding `a42c6fb0c0c0c780ff03d49cd59090ff6fabf4c588e1ad05fdf47d64de36fba8`；MinerU SHA `a3825d3e353cccb31fbc882bc378b6f9d7edbec2e64b1fbd58a48b60e1aa39e3`。
- 裸文本：`e8e286aa198196dfc117421c05445e56f1a61f9b1acff27c1fc0ad76b3e3f1e5`；binding `245c1e90414924dae5b5b6026f3b94b4ad4dcaedd8cd6f6d2543221f8c11bdd2`；MinerU SHA `b72bb3fd4ed0f9e408e95faefa4aebf639cb14ef7cedb87d4e26de27ace7e840`。

两例均有 `claimEligible=true`、598 mm Claim 和 `unknown_blocked` rights；不是未完成的 factory、旧 ID 复用、哈希破坏或只演示 Cheerio internals。所有 owner/PDF/MinerU/fragment/witness/proof 在 source 改变后重新构建并完整保存。这证明的是**不受支持/矛盾来源被错误晋升**，不宣称真实产品尺寸已经错误发布；这些 receipt 只存在于 synthetic 审计内存/诊断中。

影响及最低修复范围：单一解析路径消除了双 AST 分歧，但仍须约束同次解析的原始 source-range 与被验证 table/row scope 的对应关系；原 table 区间内的语义内容不能因解析器迁移而从审查范围消失。该类含义不确定的修复布局应 field-scoped candidate gap。仅修 G4b relation replay 并增加实际 factory RED→GREEN，覆盖迁出的标题和文本、新签发及 serialized replay；保留正常/UTF-16/CRLF positives、原孤立行 negatives。无需改变既有 owner、回退第二套解析器、增加标签黑名单或放宽 profile/rights。

没有确认新的 Critical 或另一个独立 Minor。本项是 R2 引入、旧版本明确拒绝的 Important 合并前阻断，而非扩大到未改 owner 的新一轮审计。

## 原始捕获、TDD 与独立诊断身份

执行者当前最终 manifest 为 `G4b-r2-final-20260923T135535974Z-manifest.json`，SHA `94bd9b1b7e42089672cc1beb7e7bf3abe281222ace943576a562be633e6b2171`；输入快照 SHA `11e50cebfae73955960b5eac1c67a930da20d37f7e71d951bd2d7124743a8c5f`。本轮独立核对其 901 个直接引用 / 642 路径；只展开本次 final 的 metadata/inputs 后为 6816 个引用 / 2977 路径，全部长度/hash 相符。旧 artifacts 仅按不可变字节验证，不将历史 manifest 内的旧 canonical 路径身份套用到当前源码/plan。

完整 raw stdout 与真实子进程 metadata 一致：2026-09-23 UTC 13:55:36–13:56:38，focused 40/40、full 3311/3311（含 nested suite），均零 fail/cancelled/skip/todo；lint exit 0；隔离 schema exit 0、2330 pages / 6145 blocks / 0 errors。四条命令均无 signal/spawn error、stderr 为 0 bytes。focused stdout SHA `c7546a62bcbf0e2422ad6fbd757ad129b9a83a37d61c26da72e64037ca3ecfda`；full stdout SHA `47df1b71749795ff60ea035b03a56b243bad1db4b20a46bf90aa0794b5ff1146`。本轮没有重跑这些绿色命令，也没有运行写 build/原 schema 命令。

已核对全部 9 组 R2 run 的 manifest、原始输出、actual exit、metadata 和对应 source/test snapshots；分类与 handoff 一致：

- 首 RED `134916625Z`：exit 1、4/6 pass。两份实际坏 receipt 已创建并 replay，随后报 `Missing expected rejection`；是有效行为 RED，不是 fixture setup 失败。其完整 stdout SHA `40f02570db5622442d2880ed2ee74ee710f98d08b3a34dfac0e9ccfda485bb70`。
- 首 green `135027606Z` 为 37/37；`135049679Z` stored-replay helper 因 normalized set 与未排序数组比较失败，是诊断 setup 失败，不能充当源语义拒绝。原失败及 helper 均保留；新 helper `135135851Z` 通过。
- 中间 `final-135213577Z` 为 37/3308 真正通过，但源码随后因批准的 CRLF 要求变化，被当前 final 替代，不能当当前来源身份。
- CRLF RED `135436590Z` 为 exit 1、2/3 pass；有效边缘 CRLF 已通过历史 replay/独立偏移断言，实际 factory 报 candidate gap。`135502475Z` 为 40/40，最终源码的 stored replay `135535360Z` 也通过；其后 final 绑定当前 3 个执行文件。

新独立只读诊断使用 `G4b-audit-v3-topology-probe.mjs`，SHA `1695e96817f915e38eb8e61fe8c965aad999939f337fefc9a83450c2888a2b77`；自动捕获器 SHA `fc7e87db185ac19da9a5ce1f179097e71786dc9fd789a663eefd504e4ed7de84`。实际运行 Node `v22.23.1`，UTC `2026-09-23T14:11:33.671Z` 至 `14:11:37.578Z`。capture family 为 `G4b-audit-v3-20260923T141133531Z-topology-probe`：

| 诊断 artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 完整 stdout：6 case 的全部实际输入、各 object 的 base64 原字节、解析位置、完整输出及旧 envelope | 3769863 | `a17cb1520c8d87e71a171706920f9f4fefae3620672a46d45ba347ad17f3e5ba` |
| 完整 stderr | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| 输入/保护文件快照 | 873786 | `32b865263984ec74911fd669f361697ff868b8da9c84f5508b0966c30b30fc45` |
| actual exit/time/hash/before-after metadata | 905353 | `35bde1cd92f0a97e87ca3ce3c690fe662630c5c563c32c2cfc7b0c0767c06894` |

子进程 exit 0、signal null、无 spawn error、所有保护输入前后相同。**exit 0 仅表示诊断完整完成，并非六例安全验收通过；其中两例明确记录错误接受。**

另有只读 `G4b-audit-v3-evidence-check.mjs`（SHA `f7d5c776d968a11a72390aa6adb4b6aa1cbeab88ba35459a515ad4f582764cee`），验证 exact diff 内存重建及上述完整历史捕获。capture family `G4b-audit-v3-20260923T141357191Z-evidence-check`，exit 0、stderr 空、保护输入不变；完整 stdout 287061 bytes / SHA `ebb63ebc4dab53bd166cb85bb81c40e367fe361a893f468460e176db9d514c2a`，metadata SHA `74f2507f0f3b72d9b5ea3058f05005237cb5d0ca9af6bcacaee85d5915621f61`。这些验证结果不被当成代码正确性的替代证明。本可提交报告不链接私有 SDD。

## Spec / code quality 与未裁决项

**Spec-compliance：CHANGES_REQUIRED。** 原 R1-1、同次原始位置解析、UTF-16/CRLF 和旧 receipt 拒绝要求得到落实；R2-1 仍违反 exact-model/context source authority 及批准范围中“不晋升含义不确定布局”的要求。40/3311 绿色不覆盖这一新来源形态。

**Code quality：CHANGES_REQUIRED。** 变更集中、删除竞争解析路径、保留原始字符坐标、复用既有 owner 且未增加依赖，方向符合批准设计。但仅验证 DOM 后裔，不验证解析修复前原始 table 区间内的内容是否仍被完整审查，造成承重边界回归。

原初审及 v2 复审的 whole-branch coverage，加上本次精确 R2 diff/修复相关检查，构成当前分支的连续审计范围；未重复未改模块。**当前仍有一个代码接收 blocker：Important R2-1。** 原 R1-1 关闭，既有 F2/F3 的 ADDRESSED 不被重新打开；整个分支仍不能给 APPROVED。

Declined / 未裁决事项：

- 未穷举 parse5 的所有 malformed HTML 修复形态，也未宣称两适配器所有输入均已验证；新增反例实际经过 installation factory。不能据此假定其它迁移/丢弃形态安全。
- 未改 owner、F2/F3、profile、rights 及其历史设计不重新裁决；原审核结论按冻结字节和精确 diff 边界承接。
- 未重新解释真实 PDF、做 OCR 或 corpus repair。执行者捕获的 5 个 supported synthetic receipt ID 与 raw diagnostic 一致；本轮两份新错误 synthetic receipt 不计入该 positive 数或真实产出。真实新 binding / receipt、reviewed/admitted、accepted/public 均为 0，OCR 新增为 0；whole-corpus 未完成。
- 缺外置盘 CI 的四个原件 skip、portable positive 实际 CI 执行、生产/发布权限仍由主 agent 的单独检查负责；本轮未运行 CI 或发布。
- G5/CurrentEligibility、G6、rights grant、公开 Fit/Verified Fit 不在本轮范围。代码复审本来也不能赋予这些接受或发布状态。

审计期间及结束时核对 frozen v3 目标、受保护捕获/旧审计、HEAD 和 index 保持相同；index SHA 为 `72fb1672d8e93f3025f3b199f4842d1aeeb7aa57d0f71aa5410f6a89d26d0de8`。根因证据与最低修复范围交主 agent 决策/分派，本审计席不实施。

**STOP WRITING。**
