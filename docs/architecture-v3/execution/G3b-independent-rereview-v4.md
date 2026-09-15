# G3b v4 — 一行测试修复独立复审

**判定：APPROVED；未发现本次 diff 引入的新具体问题。** 保留既有 spec / quality 批准及 F1/F2/F3/N1 裁决，不重新开展架构或安全风险评估。合并仍须最终新 commit 的 exact-head Node20 全套 CI 通过。

2026-09-15；独立审计者 Dewey，agent `01a0a2c0-4b22-7cb0-884c-f2e03755915b`。请求模型维持 `gpt-5.6-terra / max`；自身可见通用标签 GPT-5 / Codex，未独立证实具体运行时模型。执行者已关闭，本轮不实施修复。

## 版本与范围

当前 HEAD / PR213：`1038467a2648e5b6be768362a7061ac852a0cc82`，修复尚未提交。只核对冻结的 test / report / plan 三文件；唯一测试变化是行 912 增加 `return`。

| 冻结身份 | SHA-256 |
| --- | --- |
| [fix3 freeze](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/G3b-fix3-freeze.json) | `f6df0ccc53ddaf049b816c075e3f46fc7d0c0def3c0481cfdb94c13ddb0e6a7a` |
| [完整 fix3 包](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/G3b-fix3-review.md) | `f2420024d831c039e7ec7952a2dd880271aadc48ecf40b641aa0652acd965e84` |
| [修复后测试](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/tests/architecture-v3/region-router.test.mjs) | `24746080113c8944e522bf87bb02c360b1af988e5c2d79c5d15a7549f8bf5860` |

## Correctness 检查

- [test:114](../../../tests/architecture-v3/region-router.test.mjs) 的既有 gate 只检查证据根目录是否可访问且为目录；[test:912](../../../tests/architecture-v3/region-router.test.mjs) 的 `return t.skip(...)` 仅在该 gate 为 false 时结束当前 async callback，阻止随后原件读取。没有扩大 skip 条件或包裹后续异常。
- [test:914](../../../tests/architecture-v3/region-router.test.mjs) 至测试末尾的内容与 HEAD 逐字一致：挂盘路径仍读取真实 accepted batch、检查 CLI exit/status/originalObjectsBound、比较 before/after，并断言 anchor/PDF/page/crop 替换被拒绝。目录可用但原件缺失或 CLI 失败仍会报错，不会转成 skip。
- [test:890](../../../tests/architecture-v3/region-router.test.mjs) 的独立 CLI 测试不受此 callback 的 return 影响；invalid / missing-store 的 exit2、blocked 断言保留。源代码、配置、manifest、fixtures、workflow 无本轮改动。

## 记录证据与剩余条件

| 证据 | 结果 | 文件 SHA-256 |
| --- | --- | --- |
| [Node20 CI 34925203676 / job104241682021 日志](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/G3b-ci-1038467-failed.log) | 权威 RED：skip 后 ENOENT；3205 pass / 0 fail / 1 skip 但 actual exit1，后续 build/publication skipped。 | `0128d2686abb815fbcd83ac1ff3750462db7301b42d4e0759305a477342e3d7f` |
| [Node22 不可访问盘 GREEN capture](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/G3b-fix3-absent-store-green.capture.json) | 同一真实测试，exit0 / 1 skip；无 not-ok、testCodeFailure 或读取错误；权限警告保留。 | `62e2a53ee588e0ef6bf9d97f3c19b867775639368bd60cdb6482a8bedc176d1c` |
| [Node22 挂盘 positive capture](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.worktrees/architecture-v3-g0a-baseline/.superpowers/sdd/2026-09-13-architecture-v3-evidence-foundation/G3b-fix3-mounted-positive.capture.json) | exit0 / pass1 / skip0；真实原件与替换拒绝断言完整执行。 | `15e6d660e324bf0ef2aa619e92f85a2038bf86f0afaa1ef628e8575cb8aa1d4b` |

本轮只读身份/单行差异检查于 `2026-09-15T03:46:22.050Z` 完成，退出 **0**：HEAD、三文件字节/hash、完整包、已失败 CI 日志、两份最终 capture/log 均核对。两次 Node22 RED 的 actual exit0 与其 not-ok + skip + ERR_ACCESS_DENIED 现象按执行报告保留，不能表述为重现 Node20 exit1。39 对象当前/before/after 核对沿用 main 的已确认结果，未重复读取原件或执行任何套件；无新诊断、安装或 Git/证据写入。

**唯一待验证项：main 在包含本修复的新 commit/PR exact head 上取得 Node20 全套 CI（含后续必需 build/publication 等 gate）通过。** 旧 head 的 preview26 PASS 和本地 Node22 GREEN 均不能替代它。最终验收/合并/发布归 main；本报告是 focused correctness 批准，不是 CI PASS。仅新增本报告，交回后停写。
