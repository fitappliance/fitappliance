# FitAppliance v2 — Phases 34–36 (Data-Content Flywheel)

> **角色**：Claude 设计 + 审核；Codex 实现。
> **沿用 Phases 19–33 全部红线**：TDD、真实数据、无人工步骤、无 PII、无 Reddit/WP/CF、独立 commit。
> **本轮主题**：让 GSC 数据 → 新内容、RUM 数据 → 性能 PR、错误数据 → 自动 issue。三个反馈环全部自动化，但**写主分支前必经人工审 PR**。

---

## Phase 34 — GSC-Driven Auto Content Generation

**目标**：把 Phase 23 的 keyword-gap 报告变成自动开 PR 的内容生成机。

**数据输入**
- `reports/gsc-YYYYMMDD.json`（Phase 23 产物）
- `reports/keyword-gap-YYYYMMDD.md`

**筛选规则（硬性）**
1. impressions ≥ 50（避开噪音）
2. position 11–30（首页边缘）
3. CTR < 0.05（即"有需求未被满足"）
4. 当前 sitemap **不含** 精确匹配 URL（slug-similarity > 0.9 视为已存在 → 跳过）
5. query 长度 ≥ 3 词（避免品牌词/单字）
6. **黑名单**：含 `buy`, `cheap`, `deal`, `coupon`, `discount`, `free shipping` 的 query 一律跳过（避免低质 commercial intent 页）

**交付物**
1. `scripts/auto-content-pipeline.js`：
   - 读最新 gsc 报告 + sitemap
   - 应用筛选 → 候选 query 列表
   - 按 query 内容分类：`cavity` / `doorway` / `brand` / `location` / `how-to`
   - 调用对应的现有 generator（如 `generate-cavity-pages.js`）的可复用函数生成 HTML stub
   - **每页最少 3 条真实数据引用**（来自 `public/data/*.json` 真实字段，找不到 → 跳过该 query）
2. `scripts/open-content-pr.js`：
   - 用 `GITHUB_TOKEN`（Actions 默认）创建分支 `auto/content-YYYYMMDD-{slug}`
   - commit 新页 + sitemap/RSS 更新
   - `gh pr create`，body 含：
     - 来源 query + 当前 position / impressions / CTR
     - 引用的 data 文件 + 行号
     - 自动审核 checklist：[ ] 文案非 LLM 幻觉 / [ ] 数据真实存在 / [ ] 无关键词堆砌
   - label `auto-content`，**禁止 auto-merge**
3. `.github/workflows/auto-content.yml`：
   - 每周三 UTC 04:00 跑（在 Phase 23 GSC 周二抓取后）
   - **rate-limit：每周最多开 10 个 PR**
   - 同 query 已有 open/closed PR → 跳过（用 `gh pr list --search`）
4. **质量闸门**（脚本内置硬检查，不通过即不进 PR）：
   - 页面字数 ≥ 300 实词（去 nav/footer）
   - 至少含 1 个 `<table>` 或 `<dl>` 数据块
   - 至少 1 条出链到现有 cavity/doorway/brand 页（强化内链）
   - 0 个 `Lorem ipsum` / `TODO` / `FIXME` / `<placeholder>` 字符串
   - 自动跑 Phase 22 schema validator 0 errors
5. `tests/auto-content.test.mjs`：
   - mock GSC 报告 + sitemap → 断言筛选输出符合规则
   - 给 query "dishwasher cavity 600mm" → 选中且分类为 cavity
   - 给 query "buy cheap dishwasher" → 黑名单跳过
   - 给 query "samsung" → 长度不够跳过
   - 质量闸门：缺少 `<table>` 的 stub 被拒
   - rate-limit：第 11 个候选不进 PR

**红线**
- ❌ 不调用任何 LLM 生成文案；只用模板 + 真实数据填空
- ❌ 不直接 push 到 main；必须走 PR
- ❌ 不开 auto-merge
- ❌ 不为单个 query 同时开多个 PR

---

## Phase 35 — RUM-Driven Performance PR

**目标**：把 Phase 26 的 RUM 真实用户数据变成自动开"性能优化"PR。

**数据输入**
- Phase 26 的 RUM 事件流。当前 `storeEvent` = `console.info`，由 Vercel Log Drain 落盘。Codex 在本 Phase 自行选其一：
  - **方案 A**：Vercel Log Drain → 推到一个 webhook → 写到本仓库 `reports/rum/*.ndjson` 分支（GH Actions cron 拉取）
  - **方案 B**：临时改 `storeEvent` 为 GitHub API append 到 `reports/rum` 分支（需 PAT）
  - **方案 C**：用 Vercel KV 暂存 7 天滚动窗口
  - 选最简单可靠的，在 README 里写明选型理由 + 用户 secrets 配置步骤

**交付物**
1. `scripts/aggregate-rum.js`：
   - 读最近 7 天 RUM 事件
   - 按 `path` 分组，计算 LCP / INP / CLS 的 p50 / p75 / p95
   - 输出 `reports/rum-summary-YYYYMMDD.json`
2. `scripts/perf-diagnose.js`：
   - 输入 `rum-summary` + 该 path 的 HTML
   - 命中规则（启发式，**不是**自动改代码）：
     - LCP p75 > 2500 → 检查首屏图大小、是否缺 `fetchpriority`、preload 缺失
     - CLS > 0.1 → 检查 `<img>` 缺 width/height、动态注入元素
     - INP p75 > 200 → 检查 inline script 大小、未 defer 的 JS
   - 每个问题输出 `{path, metric, p75, suggestion, evidence}` 到 `reports/perf-issues-YYYYMMDD.json`
3. `scripts/open-perf-pr.js`：
   - 取最严重的 5 个 path（按 LCP p75 降序）
   - 创建分支 `auto/perf-YYYYMMDD`
   - **不直接改业务代码**；只在 PR body 列出 `{path, p75, suggestion, evidence}`，让人工/Codex 后续修。
   - label `auto-perf`，禁止 auto-merge
4. `.github/workflows/perf-weekly.yml`：每周四 UTC 04:00 跑；样本 < 100 事件时跳过（数据不足）。
5. `tests/perf-pipeline.test.mjs`：
   - mock RUM ndjson → aggregate 输出 p50/p75/p95 数学正确
   - mock 一页 LCP=4000 → diagnose 命中规则
   - 样本 < 100 → 不开 PR
   - p75 计算用 nearest-rank method（明确算法，可单测）

**红线**
- ❌ 不自动改业务代码（PR 只含报告，无源码 diff）
- ❌ 不在 RUM 数据里加新字段（守 Phase 26 隐私边界）
- ❌ 不依赖第三方 APM SaaS

---

## Phase 36 — 自建 Error Monitor（Sentry-style，无第三方）

**目标**：捕获前端 JS 错误，按签名聚合，自动开 issue。

**前端采集**
1. `public/scripts/error-beacon.js`（< 2 KB gzip）：
   - 监听 `window.onerror` + `window.onunhandledrejection`
   - 收集 `{message, source, line, col, stack(top 5 frames)}`
   - **签名 sanitize**：URL 去 query / fragment / hash；行号保留；用户输入绝不进字段
   - `navigator.sendBeacon` POST `/api/error`
   - 同次会话每个签名最多发 1 次（去重，localStorage 仅存当日 signature 集合）

**API**
2. `api/error.js`（复用 Phase 26 rate-limit + same-origin 模式）：
   - POST only，same-origin，rate-limit 30/min/IP（比 RUM 严）
   - sanitize 后 `console.info('[error] ...')` → log drain
   - 严禁记录 IP / cookies / 请求体里的 PII（任何 email/phone-like 字符串自动 redact）

**聚合 + issue**
3. `scripts/aggregate-errors.js`：
   - 按 `sha256(message + source-basename + line)` 签名聚合
   - 输出 `reports/errors-YYYYMMDD.json`：每签名 `{count, firstSeen, lastSeen, sampleStack}`
4. `scripts/open-error-issue.js`：
   - 新签名（首次出现）→ 自动开 issue，label `auto-error`
   - 同签名已有 open issue → 累加 count 评论，**不重开**
   - 同签名已 close → 若 7 天内复发 → 自动 reopen 并评论
5. `.github/workflows/error-daily.yml`：每天 UTC 02:00 跑。
6. `tests/error-monitor.test.mjs`：
   - sanitize 去掉 `?token=xxx` 和 `#user=foo`
   - email-like 字符串被 redact 成 `[redacted-email]`
   - 同签名 100 次 → 单个 issue（去重正确）
   - reopen 逻辑：close → 6 天复发 → reopen ✅
   - 非 POST → 405

**隐私段更新**
7. `/privacy-policy` 增加 error-monitor 段（字段、redact 规则、保留期）。

**红线**
- ❌ 不发送任何用户输入字符串
- ❌ 不集成 Sentry / Bugsnag / Rollbar 等第三方
- ❌ 不存原始 IP（哈希后用作 rate-limit key 即可）
- ❌ stack trace 不超过 5 帧（控制大小 + 减少误捕信息）

---

## 公共验收

- ✅ `npm test` 全绿（新增测试 ≥ 3 个文件）
- ✅ `npm run build` 通过
- ✅ 每 Phase 独立 commit + push
- ✅ 3 个新 workflow 至少各 `workflow_dispatch` 跑通一次（即使没 PR/issue 产物，要 green run）
- ✅ README 每 Phase 一节
- ✅ commit message 附交付指标

## 硬性红线汇总

1. ❌ 任何 LLM/AI 文案生成（Phase 34 必须模板+数据）
2. ❌ 自动 merge / 直接 push main（Phase 34/35 必走 PR）
3. ❌ 自动改业务代码（Phase 35 只产报告）
4. ❌ 任何第三方 APM/error SaaS（Phase 35/36 自建）
5. ❌ PII 采集 / 输入字符串落盘（Phase 36 sanitize 必须严格）
6. ❌ 人工步骤 / 登录 / 验证码
7. ❌ Reddit / WP / CF
