# G4b 独立审计

**结论：CHANGES_REQUIRED**

本报告审计的是冻结交付，不是来源接受、receipt review、CurrentEligibility、公开权利、Fit、合并或发布结论。

## 审计对象与独立性

- 执行者：Avicenna（`01a0a453-4a89-7e93-b95b-05fbdf002700`），已停止写入。
- 审计者：本次独立 GPT-5.6 Terra / Max 审计席；与执行者隔离上下文，未委派、未修改受审实现、测试、原件、策略、HEAD 或 index。
- 基线：`7b0764b0c5b099ed19b8af9b46860408c4121083`。
- 分支：`codex/architecture-v3-g4b-source-binding`。
- 冻结 capture manifest SHA-256：`57dabc8028df0ef3d592dbb49e3c3d94ebd8a1cdad43b26d3ce4b6b48599fb0c`（16/16 条记录的路径、字节数和 SHA-256 已重新核对）。

| 冻结文件 | SHA-256 |
| --- | --- |
| `docs/superpowers/plans/2026-09-13-architecture-v3-evidence-foundation.md` | `bc752601f518a2e3f40a7ecf9a21259f9f63352dbab96a988fe611ad9b168102` |
| `docs/architecture-v3/execution/G4b-direct-binding.md` | `ff7ae0f40b94b6682829d0648b20eb4c17203de43c39a43d005d81252c6e32e0` |
| `src/domain/architecture-v3/verified-source-binding.mjs` | `656b85e1b53b32d27574a12ead7c524f18135863b3e2f64ac59b06968ed03332` |
| `src/domain/architecture-v3/evidence-claim-receipt.mjs` | `a08e82f80f2649a8e0a92d7942b8e4d2bf1fe1dfbdee64f6d5d925dced11f95f` |
| `tests/architecture-v3/direct-source-binding.test.mjs` | `9301baa3dd27271ce5a19b23f9f8fa3241a2481e8db8ace760ba4db3b5dc6f19` |

## 捕获与报告引用核对

- 冻结 raw capture 的 focused、full、lint、schema 子进程均有完整 stdout/stderr、metadata 和真实 exit：分别为 `19/19`、`3290/3290`、lint exit 0、schema `2330` pages / `6145` blocks / `0` errors。历史 `G4b-green-007` / `G4b-red-008` 仍只算不完整诊断，未被当作最终 TDD 证据。
- capture input snapshot SHA-256 `72df929096df0bfe5bfeccb5b08392eae035bc67600158aef35b85b753f0f9de` 与 manifest 一致。计划、两份源码和 focused 测试的 captured hash 与上表一致。
- `G4b-direct-binding.md` 是执行后补写的 handoff：capture 内为 `8e4cbc6af5b1beb190fa674980913928d8dbcea9180337de3486b3ff2295b2db`，冻结交付为上表 `ff7ae…`。这与冻结交付记录的唯一 input drift 相符；它不能被当作源码正确性证明，也不改变已捕获源码/测试身份。
- handoff 的语义、rights dictionary、profile policy、brand registry identity、capture totals 和 input SHA 均重新计算为其列出的值；但 handoff 的 manifest 字面量遗漏末尾 `c`，见下方 Minor。独立审计使用实际 manifest 与完整 `57dabc8028df0ef3d592dbb49e3c3d94ebd8a1cdad43b26d3ce4b6b48599fb0c`，该引用问题不改变下述来源关系缺陷。
- 未重复完整绿套件。新运行的有争议只读检查为 `node --test --test-name-pattern=… tests/architecture-v3/direct-source-binding.test.mjs`：3/3 通过，覆盖 UNKNOWN 深冻结、portable JSON round-trip/replay、以及两份真实 installation receipt 仍因完整 G3a closure 缺失而保持 candidate gap。

## 发现

### Critical

无已确认的生产级 Critical：当前没有真实构造的 `EvidenceClaimReceipt`，没有 review/public/rights/Fit 消费路径或发布行为。

### Important

1. **可完全重算的 relation witness 可把语义错误的锚点关系变成直接 receipt。**

   - 位置：`src/domain/architecture-v3/verified-source-binding.mjs:461-487` 只将 fragment 内容与 caller 提供对象 bytes 对照；`:498-520` 将完整 proof 交给结构验证；`:544-550` 只检查某个声明的 relation 是否存在。`src/domain/architecture-v3/evidence-anchors.mjs:270-299` 也只校验 witness JSON 自述的 kind、端点 fragment hash 和 relation kind，未从原始 PDF/MinerU 的行、表、图或已认证生产者重放该语义。
   - 实际反例：portable positive 的原始 MinerU field 是 `paragraph`（`tests/architecture-v3/direct-source-binding.test.mjs:559-566`；legacy locator 同样为 `paragraph`，`:611-617`），但 fixture 将 label/value/unit 声明为两条 `same_table_row`（`:668-695`），并在 `:1287-1341` 成功 create -> JSON serialize -> verify。
   - 独立复现：保持原始 PDF、MinerU、installation receipt、owner、profile、policy、value、field 不变；只替换为内存中重新哈希的 JSON relation-witness artifact、fragment、object ref 和 anchor relation。该 artifact 的 tool revision 为 `g4b-audit-fully-rehashed-witness@1`，返回 `EvidenceClaimReceipt`，事实 ID 为 `fact_beko_portable_synthetic_width`，receipt 的关系仍为 `exact_model_scope`, `same_table_row`, `same_table_row`，而原始 MinerU item 仍是 `paragraph`。
   - 因果与影响：这不是篡改后 replay 失败的情况，而是攻击者能完整重算 hash、binding ID 和 receipt ID 的正向绕过。它违背 G4b 对同一精确 model/row/context 的 source-authority gate；在有可用 profile 的真实输入上，旧来源记录中碰巧相同的 label/unit/value 可被伪造 relation packet 重新包装为新的直接 receipt。当前真实候选仍被 profile/applicability/closure 缺口挡住，因而这不是已发生的真实 repair 或公开权利提升，但它是 G4b 合并前必须修复的完整性缺陷。
   - 最低修复范围：在 `verified-source-binding.mjs` 内将每个必需 relation 的语义重放绑定到实际已认证的原始/MinerU 结构和受限 locator，而非接受任意 caller-derived `relation_witness` JSON。对当前不支持的 paragraph、跨行、multi-model 或图例关系应 fail closed 为 candidate gap；portable fixture 应改为能从其自身 byte-bound structured source 重放的真实 relation。新增至少三类测试：paragraph 不能声称 `same_table_row`、完整重算的 forged witness 必须在 binding 前拒绝、同一 PDF 中错误 SKU/跨行 value 即使所有 fragment/hash 重新计算也必须拒绝。无需扩展 profile、权利、identity 或发布范围。

2. **本应接受的小数 source scalar 在 binding 前被错误拒绝。**

   - 位置：`src/domain/architecture-v3/verified-source-binding.mjs:553-560`。`:555` 的正则在 regex literal 中把小数点双重转义为 `\\.`；`:707`（manufacturer）和 `:834`（installation）都调用该函数。
   - 实际反例：独立只读 VM 直接执行冻结函数体（source SHA-256 `656b85e1b53b32d27574a12ead7c524f18135863b3e2f64ac59b06968ed03332`，函数 SHA-256 `cf5927eb74b9c28f07c8ca1ef5530273915d043a33dfe9756281e4619c3f107c`）：`598` 返回 `598`，而 `598.5` 和 `0.5` 均抛 `UNSUPPORTED_SOURCE_VALUE`。这与函数自身的 “non-negative decimal” 错误文案、spec §6.2 的无 universal integer-mm rule 和计划 §2.3 的 unconverted decimal metre 要求相冲突。
   - 因果与影响：这是 fail-closed 的完整性/覆盖缺陷，不是权利或公开路径绕过；任一合规小数 manufacturer 或 standalone installation source scalar 都会在 Claim/receipt 前被错误挡住。当前没有因它产生真实 receipt、repair、review、CurrentEligibility、public right 或 Fit 结论。
   - 最低修复范围：仅修正该 decimal token 识别，并新增经实际 `verifyAndBindSource` factory（非抽取 helper/VM）的 RED→GREEN 小数案例，至少覆盖一个未转换小数 metre 或小数 mm source scalar，且两条 adapter 调用路径均须证明不再偷偷收紧为 integer-only。继续由既有 semantic precision/bounds/unit conversion 决定可接受值；不扩展 profile、rights、identity 或发布范围。

### Minor

1. **handoff 的 capture manifest SHA-256 少了最后一个字符。**

   - 位置：`docs/architecture-v3/execution/G4b-direct-binding.md:148-150`。
   - 实际证据：引用值为 63 个 hex 字符 `57dabc8028df0ef3d592dbb49e3c3d94ebd8a1cdad43b26d3ce4b6b48599fb0`；实际 capture manifest SHA-256 是 64 个字符 `57dabc8028df0ef3d592dbb49e3c3d94ebd8a1cdad43b26d3ce4b6b48599fb0c`，缺失后缀为 `c`。
   - 影响与最低修复：这是 handoff 引用/provenance 书写错误，不改变冻结 capture、源码或测试的字节，不构成代码正确性证明或权限提升。由主 agent/执行者在其后续冻结交付中更正该一个字符即可；本独立审计未修改 handoff。

## 其余核验结果与边界

- case owner/hash/pointer、manufacturer original/derived/fallback/discovery byte replay、standalone installation PDF/MinerU/index replay、profile-owner hash/region-root binding、Claim 三键 evidence projection、named receipt type、stored replay、以及深冻结的 `UNKNOWN_CONTEXT` 均在受审路径中有对应实现与针对性检查。
- `createDirectClaimReceipt` / `verifyDirectClaimReceipt` 会通过 `readObject` 重跑同一 binding producer；未见 process-local `verified` token、schemaVersion-only legacy dispatch 或新的 runtime/public import。所有 emitted rights decision 仍是 `unknown_blocked`，不是 `public_display` 授权。
- CI 外置盘边界已静态核对：portable positive 没有 skip 条件；仅一个既有原件检查和三个本次真实原件检查允许在未挂载 CI 上跳过。该规则是待主 agent 的真实 CI capture 验收项，本审计没有运行会写入 capture 的 CI 工具。
- 真实候选仍保持原样：BDF1620W manufacturer 事实因 legacy applicability unknown 不可发 direct receipt；RF605QZUVB1 和 DW60UT4I2 的历史 installation replay 成功，但没有完整 G3a proof / 兼容 profile，仍为 candidate gap。新 OCR、真实 receipt 重发、旧 receipt repair、review、CurrentEligibility、public right 和 Verified Fit 均为 0 或未运行，不能从 portable positive 推出。

## 最终判定

**CHANGES_REQUIRED。** 在同一冻结目标上，执行者应仅修复 Important-1 与 Important-2 并补齐其危险反例；随后重新冻结源码、测试与完整 capture，再由独立审计复审。主 agent 负责该修复分派、集成和任何后续发布判断。
