# Codex 执行指令：FitAppliance v2 Phases 24–27

把 `---` 之间的内容整段发给 Codex。

---

你是 FitAppliance v2 项目的实现者。仓库根目录：`/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2`。

**先读并严格遵守**：
- `PLAN-PHASE24-27.md`（本次完整规格）
- `PLAN-PHASE19.md` / `PLAN-PHASE20-23.md`（历史约束仍然适用）
- `DEVGUIDE.md` + `.claude/rules/`

## 全局规则（违反立即 `git revert` 并停止）

1. **角色**：唯一实现者。不向用户提问，不等待人工确认，不操作浏览器/Reddit/WP/CF，不过验证码。
2. **TDD**：每个 Phase 先写 `tests/*.test.mjs` 跑 RED，再实现到 GREEN。
3. **真实数据**：澳洲城市只用 ABS 首府 8 个事实字段；禁止人口/房价/气候/评分等任何编造数字；不存在来源 → 字段省略。
4. **隐私**：Phase 26 的 RUM 严禁采集 IP、cookies、localStorage PII、用户输入、referer query。
5. **无重前端框架**：Phase 25 只能用 vanilla JS，不引 React/Vue/Next。
6. **Secrets**：`process.env.*` + fail fast；不打印、不 commit。
7. **每个 Phase 独立闭环**：`npm test` 绿 → `npm run build` → 独立 commit + push → 更新 README。
8. **不同 Phase 不合并 commit**。

## 执行顺序

### Phase 24 — 澳洲地区 Landing Pages
按 `PLAN-PHASE24-27.md` "Phase 24" 节。验收：
- 40 页生成（8 首府 × 5 类别）
- `data/locations/au-cities.json` 只含 ABS 事实字段
- `vercel.json` 加 `/location/:city/:category` rewrite
- sitemap/rss/image-sitemap 纳入
- Phase 21 link-graph 重跑 → orphanPages 仍 = 0，新页 avgInlinks ≥ 3
- `tests/location-pages.test.mjs` 全绿

### Phase 25 — 交互式 Cavity Fit Checker
按 "Phase 25" 节。验收：
- `public/scripts/fit-checker.js` < 10 KB gzip，0 外部依赖
- `pages/tools/fit-checker.html` 生成
- 所有 cavity 页 + 首页有静态 HTML 入口链接
- `tests/fit-checker.test.mjs` 4 项断言全绿
- 无 `console.log`

### Phase 26 — 真实用户性能监控 (RUM)
按 "Phase 26" 节。验收：
- `public/scripts/rum.js` + `api/rum.js` 实现
- 采样率 10%，`sendBeacon`，same-origin
- rate-limit 60/min/IP，拒绝非 POST
- `/privacy-policy` 已加 RUM 段
- `tests/rum.test.mjs` 4 项全绿
- 不引入 Google Analytics / 付费分析

### Phase 27 — 哨兵 (uptime / broken-link / orphan)
按 "Phase 27" 节。验收：
- `scripts/uptime-check.js` + `broken-link-check.js` + `orphan-check.js`
- `.github/workflows/sentinel.yml` 每日跑 + `workflow_dispatch` 手动触发成功一次
- 失败自动开 GitHub issue（label `sentinel-auto`，同日复用）
- `tests/sentinel.test.mjs` 全绿
- README 新增 Monitoring 节

## 失败处理

- 任何一步失败 → `git revert` 回到 Phase 起点，commit message 写明原因与复现。
- 不绕过测试；不修改测试让实现通过（测试本身有 bug 要单独 commit 说明）。
- 不向用户索取帮助去过 bot 检测 / 登录 / 验证码；跳过并在最终报告里说明。

## 完成后回报

输出：
1. 4 个 Phase 的 commit SHA
2. 每 Phase 新增 / 修改文件数
3. 新增测试数 + 总测试数
4. 关键指标：Phase 24 新页数、Phase 25 JS gzip 大小、Phase 26 采样率 & 隐私审计结果、Phase 27 sentinel 第一次运行状态
5. 被跳过子任务 + 原因
6. 需用户手动操作的前置（例如 Phase 26 若选 GitHub 分支方案需 PAT）

现在开始。从 Phase 24 的 `tests/location-pages.test.mjs` RED 启动。

---
