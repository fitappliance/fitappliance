# FitAppliance v2 — Phases 20–23 (Autonomous Growth Plan)

> **角色分工**：Claude = 设计 + 审核；Codex = 全部实现。
> **所有 Phase 必须 100% 自动化**：禁止任何人工浏览器操作、登录、Reddit/Whirlpool/Cloudflare 投稿、验证码处理。
> **TDD 强制**：每个 Phase 先写 `tests/*.test.mjs`，跑 RED，再实现到 GREEN。
> **禁止伪造数据**：严禁 fake AggregateRating、fake review count、fake citations。所有结构化数据必须来自真实 data source（本仓库 `data/` 或公开权威来源 URL）。

---

## Phase 20 — Core Web Vitals & 性能优化

**目标**：419 个公开 URL 全部达标 LCP ≤ 2.5s / INP ≤ 200ms / CLS ≤ 0.1。

**交付物**
1. `scripts/lighthouse-ci.js`：用 `lighthouse` npm 包跑 5 个代表页 (首页 / 1 cavity / 1 doorway / 1 brand / 1 compare)，输出 JSON 到 `reports/lighthouse-YYYYMMDD.json`。
2. `.github/workflows/lighthouse.yml`：每周一 UTC 03:00 跑一次，把报告作为 artifact 上传，并在 performance 分数 < 0.9 时失败。
3. 实际优化：
   - 所有 `<img>` 增加 `width`/`height`/`loading="lazy"`/`decoding="async"`；首屏图 `fetchpriority="high"`。
   - 把 `public/og-images/*.png` 用 `sharp` 同时生成 `.webp` 版本，页面里 `<picture>` 优先 WebP。
   - 关键 CSS 内联（< 14KB），其余 CSS 用 `<link rel="preload" as="style" onload="this.rel='stylesheet'">`。
   - Google Fonts 换 `font-display: swap` + preconnect。
4. `tests/performance.test.mjs`：断言 HTML 输出含 `loading="lazy"`（非首屏图）、`width`+`height`、`font-display: swap`。

**回滚**：生成脚本产物全部在 `public/` 和 `pages/`，回滚 = `git revert`。

---

## Phase 21 — 内部链接图谱 & Topic Clusters

**目标**：让 500+ 页面形成中心–辐射结构，提升 PageRank 流动与平均爬取深度。

**交付物**
1. `scripts/build-link-graph.js`：扫描 `data/` + `pages/`，输出 `reports/link-graph.json`（节点=页面、边=现有链接）。检测孤立页 (入链=0)。
2. 自动注入 **"Related cavity sizes"** / **"Same brand alternatives"** / **"Also viewed"** 模块（每页 6–10 条），基于：
   - cavity 页：±5cm 尺寸的其他 cavity 页
   - doorway 页：同类型 doorway
   - brand 页：同品牌其他型号
   - compare 页：交叉比较页
3. 新增 5 个 **hub 页** (`/guides/dishwasher-cavity-sizing`, `/guides/washing-machine-doorway-access`, 等)，每个 hub 链 30–50 个子页。
4. `tests/link-graph.test.mjs`：断言孤立页 = 0，平均入链 ≥ 3，hub 页出链 ≥ 30。
5. 更新 `sitemap.xml` / `rss.xml` / `image-sitemap.xml` 纳入 hub 页。

**禁止**：不许用 JS 注入链接——必须是 HTML 静态链接（SEO 可见）。

---

## Phase 22 — 真实结构化数据扩展

**目标**：加深 E-E-A-T 信号，只用真实数据来源。

**交付物**
1. 在每个 cavity / doorway 页增加：
   - `Product` schema：name, description, category, brand（仅当 brand 真实已知时）。
   - `Speakable` schema：标记 "quick answer" 段落（≤ 2 句），供语音搜索用。
2. 每个 brand 页增加 `Organization` schema（name, url, logo 来自 `data/brands/*.json` 已有字段；没有就省略，不伪造）。
3. 新增 `/methodology` 页面 + `/about/editorial-standards` 页面（作者、数据来源、更新周期），并在每页 footer 链到这两个页面。
4. 每页 head 增加 `<meta name="article:modified_time" content="...">` 用 git 最后修改时间填。
5. `tests/schema.test.mjs`：断言 (a) 不存在 `aggregateRating` 或 `reviewCount` 除非 `data/` 文件里真实存在；(b) 所有 JSON-LD 能被 `schema-dts` 或手写 validator 解析。
6. 跑一次 `curl` 到 Google Rich Results Test API（若无 API key 则用 Schema.org validator），记录 pass/fail 到 `reports/schema-validation.json`。

**红线**：任何 schema 字段如果没有来源数据，**必须省略**，绝不填占位或 mock。

---

## Phase 23 — GSC 数据管道 & 关键词缺口分析

**目标**：每周自动从 Search Console API 拉数据，生成关键词缺口报告，驱动下一批内容。

**交付物**
1. `scripts/gsc-fetch.js`：使用 **service account JSON**（存 GH Secret `GSC_SA_JSON`），通过 `googleapis` npm 包拉最近 28 天的 top queries + top pages + CTR + position。输出 `reports/gsc-YYYYMMDD.json`。
2. `scripts/keyword-gap.js`：对比 sitemap URL vs GSC queries，找出：
   - 有 impressions 但没有对应页（= 内容缺口）
   - position 11–20 的页面（= 优化机会，差一点进首页）
   输出 `reports/keyword-gap-YYYYMMDD.md`。
3. `.github/workflows/gsc-weekly.yml`：每周二 UTC 04:00 跑，报告 commit 到 `reports/` 分支 `reports/gsc`（不污染 main）。
4. `tests/gsc.test.mjs`：mock googleapis，断言 JSON schema、CTR 范围 [0,1]、position > 0。
5. 禁止把 `GSC_SA_JSON` 打印到日志；使用 `process.env`，缺失时 fail fast。

**前置条件**（Codex 自动跳过，留给用户）：用户需在 GSC 把 service account email 加成 property 的 "Owner"。Codex 在 README 写清楚这一步。

---

## 公共验收标准

每个 Phase 完成必须输出：
- ✅ `npm test` 全绿
- ✅ `npm run build` 无错
- ✅ 新/改文件 commit + push to `main`
- ✅ 若有脚本：`package.json` scripts 注册
- ✅ 若有 workflow：YAML valid + 第一次手动 `workflow_dispatch` 跑通
- ✅ README 增加本 Phase 的 "How it works" 小节
- ✅ 报告：本 Phase 改动行数、新增页数、测试数、Lighthouse/Schema 分数

## 硬性红线（违反 = 立即回滚）

1. ❌ 任何人工步骤（登录、点验证码、填表）。
2. ❌ 任何伪造数据（fake 评分、fake 评论、fake 作者、fake citation）。
3. ❌ 任何 secrets 硬编码。
4. ❌ 不跑测试就 push。
5. ❌ 不写新代码就修改已有测试（除非测试本身有 bug，要在 commit message 里说明）。
6. ❌ Reddit / Whirlpool / Cloudflare / 任何需要过 bot 检测的站点。
