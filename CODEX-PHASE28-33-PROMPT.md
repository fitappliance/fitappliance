# Codex 执行指令：FitAppliance v2 Phases 28–33

把 `---` 之间内容整段发给 Codex。

---

你是 FitAppliance v2 项目唯一实现者。仓库根目录：`/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2`。

**先读并严格遵守**：
- `PLAN-PHASE28-33.md`（本次完整规格）
- `PLAN-PHASE19.md` / `PLAN-PHASE20-23.md` / `PLAN-PHASE24-27.md`（历史约束仍然生效）
- `DEVGUIDE.md` + `.claude/rules/`

## 全局规则（违反立即 `git revert` 并停止）

1. **角色**：唯一实现者。不向用户提问，不等待人工确认，不操作浏览器，不过验证码。
2. **TDD**：每个 Phase 先写测试跑 RED，再实现到 GREEN。
3. **真实数据**（本次重点）：
   - Phase 30 视频：所有 YouTube URL 必须通过 oEmbed 校验通过才写入 JSON；fields 只能来自 oEmbed 真实响应；校验失败 → 删除条目。
   - Phase 31 联盟：**不得**自行填充任何 ASIN / SKU；JSON 留空结构，写 `docs/AFFILIATE-BACKFILL.md` 给用户。
   - Phase 32 订阅：不写 email 到仓库 / 日志 / RUM。
   - Phase 28 测量：步骤文案从 `data/copy/measurement-steps.json` 统一读取，禁止每页编造不同版本。
4. **隐私不可跨越**：
   - Phase 29 PDF：纯客户端生成，**零网络请求**，不与 RUM 联动。
   - Phase 32 订阅：不加 open-tracking、不加 reCAPTCHA；只用 honeypot + rate-limit。
   - Phase 33 PWA：**禁用** Push Notifications、Background Sync；SW 不缓存 `/api/*`。
5. **无重前端框架**：依然禁止 React / Vue / Next；Phase 29 PDF 的 `pdf-lib` / `jspdf` + `qrcode` 必须是最小打包（优先本地 bundle，<30 KB gzip 总和）。
6. **Secrets**：`AMAZON_AU_TAG` / `APPLIANCES_ONLINE_AFFILIATE_ID` / `BUTTONDOWN_API_KEY` 等全部 `process.env`，fail fast，不打印不 commit。
7. **每 Phase 独立闭环**：`npm test` 绿 → `npm run build` 无错 → 独立 commit + push → 更新 README。
8. **不合并 commit**。

## 执行顺序 + 验收

### Phase 28 — Measurement Walkthrough
按 PLAN "Phase 28"。验收：
- 所有 cavity 页含 `<section id="measure">` + 三视图 SVG + HowTo schema 5 步
- `data/copy/measurement-steps.json` 单一来源
- Lighthouse 5 页 performance 仍 ≥ 0.9
- `tests/measurement.test.mjs` 全绿

### Phase 29 — 客户端 PDF
按 "Phase 29"。验收：
- `public/scripts/pdf-export.js` < 30 KB gzip（含任何本地库）
- 无 `fetch(` / `XMLHttpRequest` 外发
- cavity 页有 "Download PDF" 按钮
- `tests/pdf-export.test.mjs` 4 项全绿

### Phase 30 — 真实 YouTube VideoObject
按 "Phase 30"。验收：
- `scripts/validate-videos.js` 首跑通过 oEmbed 校验
- `data/videos/brand-videos.json` 所有条目都有 `validatedAt`
- brand 页含 `VideoObject` schema + facade iframe
- `.github/workflows/validate-videos.yml` 首次 `workflow_dispatch` 跑通
- `tests/videos.test.mjs` 全绿
- 零 fake 字段（任何 oEmbed 未校验的条目不得出现）

### Phase 31 — 联盟链接
按 "Phase 31"。验收：
- `providers.json` + appliance affiliate 结构就绪，**所有 ASIN/SKU 为空**
- `docs/AFFILIATE-BACKFILL.md` 清晰告诉用户怎么填
- 缺环境变量时渲染器不崩，且不输出联盟 href
- 所有联盟链接 `rel="sponsored nofollow noopener"` + 披露文案
- `tests/affiliate.test.mjs` 6 项全绿

### Phase 32 — Email 订阅
按 "Phase 32"。验收：
- `api/subscribe.js` 实现 + 405/403/422/500/429/200 路径全测
- 不回显 email，不记录 email 到日志
- 表单有 honeypot 字段 + client-side rate-limit 辅助
- `tests/subscribe.test.mjs` 6 项全绿
- `/privacy-policy` 已更新订阅段

### Phase 33 — PWA
按 "Phase 33"。验收：
- `manifest.webmanifest` + `service-worker.js` + `sw-register.js`
- SW 版本每次 build 变化；旧 cache 自动清
- SW 不缓存 `/api/*`
- install prompt 拒绝 7 天不再弹（localStorage 只存 `{dismissedAt}`）
- `tests/pwa.test.mjs` 4 项全绿
- Lighthouse PWA 分类主要项（installable / manifest / SW）全绿

## 失败处理

- 任何一步失败 → `git revert` 回 Phase 起点，commit message 写原因 + 复现。
- 不修改测试让实现通过（除非测试本身有 bug，单独 commit 说明）。
- 不索取用户帮助跨 bot / 登录 / 验证码；跳过并在最终报告说明。
- oEmbed 限流或失败：带指数退避重试 3 次；仍失败 → 该条目不进 JSON。

## 完成后回报

1. 6 个 Phase commit SHA
2. 每 Phase 文件变更数
3. 新增测试数 + 总测试数
4. 关键指标：
   - Phase 28：cavity 页数 + SVG viewBox 总数
   - Phase 29：pdf-export.js gzip 大小 + 是否零外发
   - Phase 30：校验通过视频数 / 初始种子数
   - Phase 31：providers 数 + appliance affiliate 字段就绪数（全空 OK）
   - Phase 32：所选 provider（Buttondown / ConvertKit）
   - Phase 33：shell precache 条目数 + SW 版本字符串样例
5. 需用户手动操作的前置：
   - Phase 31 → 配 `AMAZON_AU_TAG` / `APPLIANCES_ONLINE_AFFILIATE_ID`；回填 ASIN/SKU
   - Phase 32 → 配 `BUTTONDOWN_API_KEY` 或 `CONVERTKIT_*`
   - Phase 30 → 若 oEmbed 种子不够可手动补官方视频 URL
6. 被跳过子任务 + 原因

现在开始。从 Phase 28 的 `tests/measurement.test.mjs` RED 启动。

---
