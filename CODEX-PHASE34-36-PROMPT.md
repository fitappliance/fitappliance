# Codex 执行指令：FitAppliance v2 Phases 34–36

把 `---` 之间内容整段发给 Codex。

---

你是 FitAppliance v2 项目唯一实现者。仓库根目录：`/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2`。

**先读并严格遵守**：
- `PLAN-PHASE34-36.md`（本次完整规格）
- 所有历史 PLAN-PHASE19/20-23/24-27/28-33（约束依然有效）
- `DEVGUIDE.md` + `.claude/rules/`

## 全局规则（违反立即 `git revert` 并停止）

1. **角色**：唯一实现者，不向用户提问，不操作浏览器，不过验证码。
2. **TDD**：每 Phase 先写测试跑 RED，再实现到 GREEN。
3. **本轮特别红线**：
   - **Phase 34 严禁调用任何 LLM / AI** 生成内容文案；只能用 HTML 模板 + `public/data/*.json` 真实字段填空。如某 query 找不到 ≥ 3 条真实数据点 → **跳过**该 query，不生成页面。
   - **Phase 34/35 不得直接 push 到 main**；必须开 PR + label + 禁止 auto-merge。
   - **Phase 35 不自动改业务代码**；PR body 只列诊断报告 + 证据。
   - **Phase 36 stack trace ≤ 5 帧**；URL 去 query/fragment；email/phone-like 字符串 redact 成 `[redacted-*]`；不存原始 IP（哈希后做 rate-limit key 即可）。
4. **隐私不可跨越**：Phase 36 不得跨过 Phase 26 的隐私边界（无 cookies、无 localStorage PII、无 referer query、无用户输入）。
5. **无第三方 SaaS**：禁止 Sentry / Bugsnag / Rollbar / Datadog / New Relic 等。
6. **Secrets**：`GITHUB_TOKEN`（Actions 自带）/ `GSC_SA_JSON` / 任何 RUM 落盘所需 secret 都走 `process.env`，缺失 fail fast，不打印不 commit。
7. **每 Phase 独立闭环**：`npm test` 绿 → `npm run build` → 独立 commit + push → README 更新。
8. **不合并 commit**。

## 执行顺序 + 验收

### Phase 34 — GSC 自动内容 PR
按 PLAN "Phase 34"。验收：
- `auto-content.yml` workflow_dispatch 跑通至少一次（即便候选 = 0 也要 green run）
- 黑名单 query（`buy/cheap/coupon/...`）100% 跳过
- 单次最多 10 PR
- 质量闸门 5 项内置（字数 ≥ 300、含 table/dl、内链 ≥ 1、无 placeholder、schema 0 errors）
- `tests/auto-content.test.mjs` 全绿
- 不调用任何 LLM API；`grep -rE "openai|anthropic|gemini" scripts/auto-content-pipeline.js` = 0 命中

### Phase 35 — RUM 性能诊断 PR
按 "Phase 35"。验收：
- 选定 RUM 数据落盘方案（A/B/C 之一）+ README 写明 + 用户 secret 配置步骤
- `aggregate-rum.js` 用 nearest-rank p75 算法
- `perf-diagnose.js` 输出 `{path, metric, p75, suggestion, evidence}`
- PR body 仅诊断报告，**无源码 diff**
- 样本 < 100 → 跳过
- `perf-weekly.yml` 手动触发跑通
- `tests/perf-pipeline.test.mjs` 全绿

### Phase 36 — 自建 Error Monitor
按 "Phase 36"。验收：
- `public/scripts/error-beacon.js` < 2 KB gzip
- `api/error.js` 405/403/422/429 路径全测
- 同次会话签名去重（localStorage 仅存当日 signature 集合）
- 聚合按 `sha256(message + source-basename + line)`
- 新签名 → 开 issue；已 open → 评论累加；已 close 7 天内复发 → reopen
- `error-daily.yml` 手动跑通
- `tests/error-monitor.test.mjs` 全绿（sanitize / redact / 去重 / reopen / 405 五项）
- `/privacy-policy` 已加 error-monitor 段
- 不集成任何第三方 APM

## 失败处理

- 任一步失败 → `git revert` 回 Phase 起点，commit message 写原因 + 复现。
- 不修改测试让实现通过（除非测试本身有 bug，单独 commit 说明）。
- 不索取人工帮助跨 bot/登录/验证码；跳过并在最终报告说明。
- GSC 数据缺失（用户尚未配 secret）：Phase 34 workflow 应优雅退出（不报错），并在 PR description 写明"等 GSC 数据回流后才会有候选"。

## 完成后回报

1. 3 个 Phase commit SHA
2. 每 Phase 文件变更数
3. 新增测试数 + 总测试数
4. 关键指标：
   - Phase 34：黑名单关键词数 + 质量闸门项数 + workflow 首跑结果
   - Phase 35：选用的 RUM 落盘方案 + p75 算法名 + workflow 首跑结果
   - Phase 36：error-beacon.js gzip 大小 + sanitize 规则数 + workflow 首跑结果
5. 用户待办：
   - Phase 35 若选 PAT 方案 → 需配的 secret 名
   - 其他需手动的前置
6. 被跳过子任务 + 原因

现在开始。从 Phase 34 的 `tests/auto-content.test.mjs` RED 启动。

---
