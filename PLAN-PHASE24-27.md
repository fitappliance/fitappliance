# FitAppliance v2 — Phases 24–27 (Autonomous Growth Plan, Round 2)

> **角色分工**：Claude = 设计 + 审核；Codex = 全部实现。
> **继续沿用 Phases 20–23 的全部全局规则**（TDD、真实数据、无人工步骤、无 Reddit/WP/CF、独立 commit）。

---

## Phase 24 — 澳洲地区 Landing Pages

**目标**：把 `/cavity/*` 和 `/doorway/*` 与澳洲主要城市交叉，生成地域化 landing 页，吃本地搜索词（"dishwasher cavity size Sydney"、"fridge doorway Melbourne" 等）。

**数据源（真实）**
- 仅使用澳洲 ABS 官方 capital city 名单：Sydney, Melbourne, Brisbane, Perth, Adelaide, Canberra, Hobart, Darwin。
- 不编造人口、房价、气候等数字。只能写通用真实事实（例如 "Sydney 是 NSW 首府"），或直接省略。

**交付物**
1. `data/locations/au-cities.json`：8 个首府的 `{slug, name, state, stateCode}`（字段全部是 ABS 公开事实）。
2. `scripts/generate-location-pages.js`：生成 `pages/location/:city/:category.html`，category ∈ {`dishwasher`, `fridge`, `washing-machine`, `dryer`, `oven`}。共 8 × 5 = **40 页**。
3. 每页必含：
   - H1：`Appliance Cavity & Doorway Guide — {Category} in {City}`
   - 指向全站对应 cavity/doorway 页的真实 link list（至少 10 条，来自实际 data）
   - `BreadcrumbList` + `ItemList` + `Place` schema（Place 仅用 ABS 事实字段）
4. `vercel.json` 增加 `/location/:city/:category` rewrite。
5. `sitemap.xml` / `rss.xml` / `image-sitemap.xml` 纳入新 40 页。
6. 在 Phase 21 的 link-graph 中，这 40 页必须非孤立（avgInlinks ≥ 3）。
7. `tests/location-pages.test.mjs`：断言 (a) 40 页生成；(b) 无 fake 数字；(c) BreadcrumbList 合法；(d) 所有 link 指向仓库内真实存在的页。

**红线**：禁止自动扩展到 suburb / LGA（会引入大量未核实数据）。只做 8 首府。

---

## Phase 25 — 交互式 Cavity Fit Checker

**目标**：纯前端 JS 工具，用户输入 cavity 尺寸（W×H×D mm）即返回"能装下哪些型号"。提升停留时长 + 用户信号。

**交付物**
1. `public/scripts/fit-checker.js`（<10 KB gzip）：
   - 读取 `data/appliances.json`（已存在，Codex 必须先确认字段）。
   - 输入三维 mm，输出匹配的 appliance slug + 跳转 link。
   - 使用 `<dialog>` / `localStorage` 保存最近 3 次查询；无外部依赖、无 cookies、无追踪。
2. `pages/tools/fit-checker.html`：独立工具页，含表单、结果区、说明段。
3. 在首页和所有 cavity 页右栏插入"Try the fit checker"入口（静态 HTML link，非 JS 注入，保 SEO）。
4. 工具页 schema：`SoftwareApplication` + `HowTo`（步骤真实）。
5. `vercel.json` 增加 `/tools/:slug` rewrite。
6. `tests/fit-checker.test.mjs`（node --test + jsdom）：断言 (a) 给定 600×850×600 返回包含至少 1 个真实 appliance；(b) 给定 1×1×1 返回空结果且显示"no match"文案；(c) 输入非数字不抛异常且友好提示；(d) JS 文件 < 10 KB gzip。
7. 无 `console.log`；错误走 UI 提示。

**红线**：不引入任何 npm 前端框架（无 React / Vue）。纯 vanilla JS。

---

## Phase 26 — 真实用户性能监控 (RUM)

**目标**：从真实访客收集 LCP/INP/CLS，补 Phase 20 lab 数据的盲区。

**交付物**
1. `public/scripts/rum.js`：用 `web-vitals` 库 (ESM CDN 或内嵌 min 版) 采集 LCP/INP/CLS/TTFB。
2. 数据发送：使用 `navigator.sendBeacon` POST 到 `/api/rum`（Vercel Serverless Function）。
3. `api/rum.js`（Vercel function）：
   - 仅接受 POST + same-origin
   - rate-limit（每 IP 60/min，用 Vercel KV 或内存 fallback）
   - 仅记录 `{metric, value, path, ts, ua-truncated}`；**不记录 IP、cookies、userId**。
4. 存储：写 `logs/rum-YYYYMMDD.ndjson`（Vercel 只读文件系统 → 改为直接 POST 到 GitHub `reports/rum/` 分支 via Actions，或输出到 Vercel Log Drain）。**Codex 自行选最简方案并在 README 写清楚**。
5. 页面嵌入：仅在 `<head>` 末尾 `<script defer src="/scripts/rum.js"></script>`；采样率 10%（`Math.random() < 0.1`）。
6. 隐私：更新 `/privacy-policy` 增加 RUM 段（说明字段、采样率、无 IP/cookie）。
7. `tests/rum.test.mjs`：断言 (a) rum.js 不使用 `document.cookie`、不读 `localStorage` 里 PII；(b) api/rum.js 拒绝非 POST；(c) payload schema 合法；(d) rate-limit 超限返回 429。
8. 不使用 Google Analytics / Vercel Analytics 付费功能。

**红线**：严禁采集 IP、Referer 中的 query、用户输入、localStorage/cookies 内容。

---

## Phase 27 — Uptime / 404 / Broken Link 哨兵

**目标**：自动巡检站点健康，有问题自动开 issue 或 PR。

**交付物**
1. `scripts/uptime-check.js`：
   - 抽样 sitemap 中 30 个 URL（首页 + 5 个 hub + 5 个 cavity + 5 个 doorway + 5 个 brand + 5 个 compare + 4 个 location）。
   - 并发 HEAD 请求（concurrency=5），超时 10s。
   - 非 200 → 收集到 `reports/uptime-YYYYMMDD.json` 并 `process.exit(1)`。
2. `scripts/broken-link-check.js`：
   - 解析所有 `pages/**/*.html` + `index.html` 的内部 `href`。
   - 验证每个 `href` 对应 `vercel.json` rewrite 或实际文件存在。
   - 发现 broken 立刻 fail，输出清单到 `reports/broken-links.json`。
3. `scripts/orphan-check.js`：
   - 复用 Phase 21 link-graph，确认 orphanPages==0；否则 fail。
4. `.github/workflows/sentinel.yml`：
   - 每天 UTC 00:30 跑一次 uptime + broken-link + orphan。
   - 失败时用 `peter-evans/create-issue-from-file` 或 `gh issue create` **自动开 issue** 到本 repo，title=`[sentinel] N issues detected YYYY-MM-DD`，body 贴 reports JSON。
   - 同一天已开过 issue 则复用（查 label `sentinel-auto`）。
5. `tests/sentinel.test.mjs`：mock fetch/fs，断言 (a) 非 200 触发 exit code 1；(b) broken link detector 找到故意埋的 `/this-page-does-not-exist` 引用；(c) 脚本不会误把外链当 broken。
6. README 新增 "Monitoring" 小节。

**红线**：issue 只由 GitHub Actions bot 开，不 email / 不 webhook 到第三方。

---

## 公共验收标准（同 Phase 20–23）

- ✅ `npm test` 全绿（新增测试 ≥ 4 个文件）
- ✅ `npm run build` 无错
- ✅ 每个 Phase 独立 commit + push
- ✅ `package.json` scripts 注册新脚本
- ✅ 新 workflow YAML 合法 + 手动 `workflow_dispatch` 跑通至少一次
- ✅ README 每个 Phase 一节
- ✅ commit message 附带交付指标

## 硬性红线（违反 = 立即回滚）

1. ❌ 人工步骤 / 登录 / 验证码
2. ❌ 伪造人口 / 房价 / 气候 / 评分 / 评论等任何数字
3. ❌ Secrets 硬编码；RUM 采集 PII
4. ❌ 前端引入重框架（React/Vue/Next）
5. ❌ 不跑测试就 push
6. ❌ 改测试让实现通过
7. ❌ Reddit / Whirlpool / Cloudflare / 任何 bot-detection 站点
