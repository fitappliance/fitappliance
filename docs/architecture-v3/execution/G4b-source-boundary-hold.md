# G4b R3：来源范围边界阻断与主审裁决

2026-09-23 UTC。**CHANGES_REQUIRED — Important R3-1 尚未解决。**
主 agent 保存本记录；实现者 Avicenna 与独立审计者 Meitner 均已停写并关闭。
本轮没有 commit、push、PR、合并或发布。下一轮设计范围待用户决定。

## 结论与历史审计的关系

R3 修复了原 R2-1：表内内容被解析器迁出或丢弃时，已有四个反例和旧错误凭证
现在均被来源重放拒绝。执行者最终 focused45/full3316、lint 和隔离 schema
通过的原始记录真实有效，但这些检查没有覆盖本次新发现。

[v4 独立复审](G4b-independent-rereview-v4.md) 最初给出 APPROVED；随后主 agent
针对 `tableSpan.endOffset` 提出边界疑问，原独立审计者实际复现 R3-1。
**v4 的无阻断接收结论由这次补查取代，不能用于接收或发布。**
原报告逐字保留，不追改历史结论；原 R1-1、R2-1、F2/F3 的已闭合证据也不作废。
补查没有比较更早版本，因此不声称该漏洞首次由 R3 引入。

## 已复现的剩余缺口

原始选定 MinerU HTML 中，一个表格的 scalar row 后出现空的第二个表格、
异型号标题和最后的闭表标签。parse5 将首表提前隐式结束：

- 完整输入长度为 197 个 UTF-16 code units；首表的来源范围变成 `[0,147)`，
  且没有原始 `endTag`。
- 第二个表格与冲突标题成为同级节点；最后的闭表标签被丢弃。
- 当前完整性核算只检查至 147，尾部 `[147,197)` 未被解释，却没有阻断签发。
- 实际新凭证创建及序列化后重放均成功，`claimEligible=true`，值为 598 mm；
  rights 仍为 `unknown_blocked`。这是诊断错误，不是公开凭证或真实产品数据。

错误凭证 ID：
`f5471da39bccc40f5fe58c78c96886f00e852b34ae211f850b3e74e45c5eb4b4`。

四个完整重建来源对象的对照均先通过历史 installation replay：正常显式闭表
通过；闭表前出现冲突标题会拒绝；仅在该冲突前插入空表却通过；先显式闭合首表
再放第二张表和标题仍正常通过。因此问题是无法解释的来源范围缩短，而不是
“所有表后标题都属于前表”，也不是所有省略标签或整个 PDF 都错误。

主 agent 已读补查全文、核对原始四例摘要与输出身份，并核对安装中的 parse5
`_setEndLocation`：隐式结束确实使用触发 token 的起点作为节点终点。
该终点是解析结果，不独立证明原始证据范围完整。没有重复执行绿色全套测试或
另跑同一反例，也没有把机械哈希检查当成语义正确性证明。

## 可恢复证据身份

私有捕获在现有 SDD 目录保存，以下列明名称和身份，不将其作为公开证据链接。

| 记录 | SHA-256 |
| --- | --- |
| 原 v4 独立报告，8429 bytes | `2d4d233b028d6e8c47ec920d874a8f279f59e46b2ed5f03e46785440fc06c390` |
| `G4b-audit-v4-boundary-note.md`，6076 bytes | `0c906dc510dcf0ddd6bd3d77a57c1ce139483a86389c47aa1f2b5184b5e72268` |
| `G4b-audit-v4-20260923T145134619Z-table-end-probe.stdout.log`，1713205 bytes | `dc904f926918626342c4f31b4f9a51784c314db9c451bde0325a58e8f4812082` |
| 同组 `-metadata.json`，937385 bytes | `66463031d5b2bfd129e23c88d359d9d9ff012008267e47c480aabe3a925c2def` |
| 冻结受审 binding | `13ffa057142de8f46aa1c0a18db3f8c39c4f843cc08ae9da62068447b4a3b18d` |
| 冻结受审 tests | `1d4202f49d2170fb4330a74c094ef84524ca2169e80ee0f3958279e705f56385` |

补查真实运行 UTC 14:51:34.773–14:51:37.596，exit0、无 signal、stderr 空。
这里的 exit0 仅表示诊断完成；其实际结果是反例被错误接受，不能记成安全通过。
源文件、测试、receipt consumer 和既有审计在主方保存本记录前后保持原样。

## 下一步需要的决定

原则不是继续增加一种标签特例，而是**先证明所选原始证据的起止范围，再证明
范围内内容未丢失，并验证型号、字段、数值与上下文**。当前检查缺少第一个前提。

建议下一轮先完成这一段 relation replay 的来源范围契约与独立反例审计，
通过后再形成有界实现任务。设计需解释正常显式分表、合法隐式分组、提前闭表、
被丢弃尾部和序列化重放；不得仅宣称要求一个闭合标签就已完整解决问题。
这是局部来源绑定设计，不授权重做全项目、增加通用 HTML 解析器或改旧 owner。

无法证明范围的字段继续保留候选及明确缺口；原 PDF/OCR、旧凭证和尺寸筛选
不删除、不隔离成坏资料，也不升级为 Verified Fit。保持单次解析、现有依赖、
rights/profile 与物理门槛。用户确认前不派发新实现，也不修改当前源代码。

真实 new binding/receipt、reviewed/admitted、accepted/public 及新增 OCR 均为0；
whole-corpus 旧凭证补齐未完成。生产仍为已核对的 PR214/`7b0764b`，受保护恢复
工作区未更改。Goal UI 仍是 `usageLimited`，不是本轮新设的 paused/complete。
唯一正式进度索引仍为[原执行计划](../../superpowers/plans/2026-09-13-architecture-v3-evidence-foundation.md)。
