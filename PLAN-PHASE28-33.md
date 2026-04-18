# FitAppliance v2 — Phases 28–33 (Content Depth + Conversion)

> **角色**：Claude 设计 + 审核；Codex 实现。
> **沿用 Phases 19–27 全局规则**：TDD、真实数据、无人工步骤、无 Reddit/WP/CF、独立 commit、无 PII 采集、无重前端框架。

路线：**C（内容深度）→ B（转化层）**。C 先做让 B 的转化有内容支撑。

---

## Phase 28 — Measurement Walkthrough（SVG + `<details>` 步骤）

**目标**：每个 cavity 页自动嵌入"如何测量"交互区，提升停留时长 + E-E-A-T。

**交付物**
1. `scripts/generate-measurement-svg.js`：
   - 输入 cavity `{widthMm, heightMm, depthMm}`，输出 SVG 三视图（front / side / top），按真实比例（1mm=0.2px）。
   - 标注 W/H/D 数字 + 测量箭头 + 门开方向（若 data 里有 `doorSwing`）。
   - 无外部 SVG 库；纯字符串模板。
2. `scripts/generate-measurement-content.js`：
   - 为每 cavity 生成步骤 HTML（5 步：tape measure → W → H → D → clearances）。
   - 步骤文案从 `data/copy/measurement-steps.json`（Codex 新建，事实性描述）读取，非每页独立生成避免 duplicate content 的变体在末尾加 cavity 尺寸。
3. 嵌入点：所有 `pages/cavity/*.html` 增加 `<section id="measure">`，含 SVG + `<details>` 步骤 + `HowTo` schema（每步来自 measurement-steps.json 真实字段）。
4. `tests/measurement.test.mjs`：断言 (a) SVG 含三个 viewBox；(b) W/H/D 数字与 data 一致；(c) HowTo schema 的 step 数 = 5；(d) 不同尺寸生成不同 SVG（防止缓存穿透）。
5. Phase 20 Lighthouse 重跑 5 页 → performance 仍 ≥ 0.9（SVG 不拖慢）。

**红线**：禁止 SVG 里出现 raster 图；禁止嵌 `<img>` 外链。

---

## Phase 29 — PDF Installation Guide（纯前端）

**目标**：用户在 cavity 页点 "Download PDF" → 立即下载 A4 PDF。提升 backlink 机会 + 品牌资产。

**交付物**
1. `public/scripts/pdf-export.js`（< 30 KB gzip，可用 `pdf-lib` ESM CDN 或 `jspdf` min）：
   - 从页面 DOM 读取 cavity 尺寸 + 测量步骤文案 + SVG 三视图。
   - 客户端生成 A4 PDF（含 header logo、页脚 URL、二维码指回原页用 `qrcode` ESM 最小版）。
   - 下载文件名 `fitappliance-{slug}.pdf`。
2. 无服务端：**零**用户数据上传；纯 `URL.createObjectURL` + `<a download>`。
3. 所有 cavity 页静态 HTML 插入 "Download PDF" 按钮（`<button>` 带 `data-cavity-slug`，JS 懒挂载）。
4. `tests/pdf-export.test.mjs`（jsdom）：断言 (a) 脚本加载不抛错；(b) 无 `fetch(` 对外请求；(c) 按钮点击触发 `Blob` 生成；(d) 文件名合法。
5. README 增加 "Offline usage" 段。

**红线**：
- ❌ PDF 生成不得触发任何网络请求（除 CDN 加载库本身，但优先内嵌本地 bundle）。
- ❌ 不采集用户点击事件（不与 RUM 集成）。
- ❌ 不含广告 / 联盟链接（Phase 31 再加）。

---

## Phase 30 — 真实 YouTube VideoObject Schema

**目标**：给 brand 页和 hub 页加 `VideoObject` schema，吃 Google video rich result。

**数据源（真实）**
- **仅** 品牌官方 YouTube 频道的公开视频 URL。
- Codex 必须通过 YouTube oEmbed 端点 (`https://www.youtube.com/oembed?url=...&format=json`) 校验 URL 存在 + 获取真实 `title` / `author_name` / `thumbnail_url`，**不得**手填任何字段。
- 若某 brand 无官方频道或无法校验 → **跳过该 brand**，不伪造。

**交付物**
1. `data/videos/brand-videos.json`：每 brand 最多 3 条视频，字段 `{brandSlug, youtubeUrl, validatedAt}`。手动或半自动整理（Codex 先留种子 3–5 条 Bosch/Samsung/LG 官方安装视频，校验通过才写入）。
2. `scripts/validate-videos.js`：跑 oEmbed 校验所有 URL；失败项从 JSON 移除并在 `reports/video-validation.json` 记录。
3. `scripts/inject-video-schema.js`：把校验后的元数据注入对应 brand 页 `<script type="application/ld+json">` 为 `VideoObject`（uploadDate、name、description、thumbnailUrl、embedUrl、publisher 全部来自 oEmbed + YouTube data API **公开字段**，不估算 duration 若未知则省略）。
4. brand 页增加 `<section id="install-video">` 显示 YouTube 嵌入（`<iframe loading="lazy" srcdoc>` facade，点击后加载真 iframe，保性能）。
5. `.github/workflows/validate-videos.yml`：每月 1 号跑一次 `validate-videos`，失效视频开 sentinel issue。
6. `tests/videos.test.mjs`：(a) JSON 所有条目 `validatedAt` 在 90 天内；(b) schema 含必填字段；(c) 无 fake 字段（没有 oEmbed 响应就不能出现在 JSON）。

**红线**：
- ❌ 不嵌入私人频道 / 非官方 reup / UGC。
- ❌ 不伪造 viewCount / duration / uploadDate。
- ❌ oEmbed 校验失败 → 条目必须从 JSON 删除。

---

## Phase 31 — 联盟链接系统（Amazon AU / Appliances Online）

**目标**：compare + brand + location 页的"Buy"按钮指向真实联盟链接。**只在配置了联盟 ID 时才启用**。

**配置（环境变量，绝不硬编码）**
- `AMAZON_AU_TAG`
- `APPLIANCES_ONLINE_AFFILIATE_ID`
- 可选 `THE_GOOD_GUYS_AFFILIATE_ID`

**交付物**
1. `data/affiliates/providers.json`：每 provider `{slug, name, domain, linkTemplate, disclosureText}`。模板形如 `https://www.amazon.com.au/dp/{asin}?tag={AMAZON_AU_TAG}`。
2. `data/appliances/*.json` 增加可选字段 `affiliate: { amazonAU?: {asin}, appliancesOnline?: {sku}, ... }`。
   - Codex **不得**自行填充 ASIN/SKU。在 JSON 里把字段结构准备好，值留空 / 省略，写一个 `docs/AFFILIATE-BACKFILL.md` 指南告诉用户如何批量填。
3. `scripts/render-affiliate-links.js`：在构建时把 appliance 的 affiliate 字段 × 环境变量 → 真实 URL。没有 ASIN 或没有环境变量 → **渲染为禁用/占位或直接省略按钮**。
4. 所有联盟链接必须：
   - `rel="sponsored nofollow noopener"`
   - 按钮附近 **可见** 披露文案（从 `providers.json.disclosureText` 读）
   - `/affiliate-disclosure` 页已存在，在 footer 链接
5. `tests/affiliate.test.mjs`：
   - (a) 缺 `AMAZON_AU_TAG` 时渲染器不抛错且输出无 amazon 链接
   - (b) 有 tag + 有 ASIN 时 URL 严格匹配模板
   - (c) 所有联盟链接都含 `rel="sponsored nofollow noopener"`
   - (d) 披露文案在按钮同一页出现
6. sitemap / RSS 不变；联盟链接不进 sitemap。

**红线**：
- ❌ 不写任何 ASIN / SKU 进仓库（留空由用户回填）
- ❌ 不引入任何联盟追踪 JS（Amazon OneLink 等）；纯静态 href
- ❌ 任何 fake ASIN / 测试数据进 main

---

## Phase 32 — Email 订阅（自建 API 转发）

**目标**：首页 + hub 页加订阅表单，新 cavity 数据发布时推送。

**选型**
- 后端：Buttondown API（有免费档 + 干净 REST）或 ConvertKit API。Codex **二选一**，在 README 写明。
- 存储：不在仓库存 email；全部交给 provider。

**交付物**
1. `api/subscribe.js` Vercel function：
   - POST only，same-origin，rate-limit 10/min/IP（复用 Phase 26 rate-limiter）
   - 用 `process.env.BUTTONDOWN_API_KEY`（或 ConvertKit）转发
   - 返回 `{ok: true}` 或 `{error}`；**不回显 email**
   - 不记录 email 到日志
2. `public/scripts/subscribe.js`（< 4 KB gzip）：
   - 劫持 `<form data-subscribe>`，用 `fetch` POST；成功显示"Check your inbox"。
   - 无第三方追踪。
3. `pages/subscribe.html` 独立感谢页。
4. 首页 + 5 hub 页右栏插静态表单 HTML（`<form action="/api/subscribe" method="post">` 作为 noscript fallback）。
5. `/privacy-policy` 加订阅段（provider 名、数据处理、退订方式）。
6. `tests/subscribe.test.mjs`：
   - (a) 非 POST → 405
   - (b) 非 same-origin → 403
   - (c) 无 email 字段 → 422
   - (d) 缺 API key → 500 且不泄漏
   - (e) rate-limit 超限 → 429
   - (f) 成功路径 mock provider 返回 200

**红线**：
- ❌ 不写 email 到仓库 / 日志 / RUM
- ❌ 不加 open-tracking 像素
- ❌ 不集成 reCAPTCHA 等第三方反垃圾（引 PII）。简单用 honeypot 字段 + rate-limit。

---

## Phase 33 — PWA（offline + install prompt）

**目标**：cavity / doorway 页支持离线访问；移动端可安装。

**交付物**
1. `public/manifest.webmanifest`：`name`, `short_name`, `start_url`, `display: standalone`, `theme_color`, `icons` (复用 Phase 19 OG 图衍生的 192/512 PNG，已有就不重复生成)。
2. `public/service-worker.js`：
   - Strategy: **stale-while-revalidate** for HTML；**cache-first** for `/scripts/*` + `/og-images/*` + `/data/*`；**network-only** for `/api/*`
   - Cache 名版本化 `fitappliance-v{timestamp}`，旧 cache 自动清理
   - 不预缓存 400+ cavity/doorway 页（太大）；只预缓存 shell（index + 5 hub）
3. `public/scripts/sw-register.js`（< 1 KB）：懒注册 SW，仅在 `navigator.onLine` 且非 reduced-data 时注册。
4. `scripts/generate-sw.js`：build 时把 shell 清单注入 service-worker 的 `PRECACHE` 数组。`npm run build` 调用。
5. **install prompt UI**：首页右下角浮层按钮，`beforeinstallprompt` 捕获后显示；用户拒绝 7 天不再弹。`localStorage` 只存 `{dismissedAt}`，无 PII。
6. `tests/pwa.test.mjs`：
   - (a) manifest 合法 JSON，必填字段齐
   - (b) SW 文件有 version 常量且版本每次 build 变化
   - (c) SW 不缓存 `/api/*`
   - (d) register 脚本不阻塞首屏（defer / async 或 DOMContentLoaded）

**红线**：
- ❌ 不使用 Push Notifications（隐私）
- ❌ 不用 Background Sync 回传数据
- ❌ SW 不得缓存 `/api/rum`、`/api/subscribe`

---

## 公共验收（同 20–23）

- ✅ `npm test` 全绿（新增测试 ≥ 6 个文件）
- ✅ `npm run build` 无错
- ✅ 每个 Phase 独立 commit + push
- ✅ `package.json` 注册新脚本
- ✅ 新 workflow 手动 `workflow_dispatch` 至少跑通一次
- ✅ README 每个 Phase 一节
- ✅ commit message 附交付指标

## 硬性红线（违反 = 立即回滚）

1. ❌ 人工步骤
2. ❌ 伪造任何数据（ASIN / 视频字段 / email / 测量步骤）
3. ❌ 硬编码 secrets；泄漏 email 到日志
4. ❌ 重前端框架 / 第三方追踪 JS / 广告 JS
5. ❌ SW 缓存 API 响应
6. ❌ RUM 化 email / PDF / 订阅事件（绝不跨越 Phase 26 的隐私边界）
7. ❌ Reddit / WP / CF / bot-detection 站点
