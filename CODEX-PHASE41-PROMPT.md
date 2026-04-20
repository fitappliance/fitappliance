# Codex 执行指令：FitAppliance v2 Phase 41 (Product Review Video Pilot)

把 `---` 之间内容整段发给 Codex。

---

你是 FitAppliance v2 项目唯一实现者。仓库根目录：
`/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2`。

**先读并严格遵守**：
- `PLAN-PHASE41.md`（本次完整规格）
- `PLAN-PHASE30`（章节在 PLAN-PHASE28-33.md）、`PLAN-PHASE34-36.md`、
  `PLAN-PHASE37-39.md`、`PLAN-PHASE40.md`（历史约束仍生效）
- `DEVGUIDE.md` + `.claude/rules/`

## 全局规则（违反立即 `git revert` 并停止）

1. **角色**：唯一实现者，不向用户提问，不操作浏览器，不过验证码，不登录任何服务。
2. **TDD**：先写 `tests/reviews.test.mjs` 跑 RED，再实现到 GREEN。
3. **本轮特别红线**：
   - **白名单硬约束**：`data/videos/creator-whitelist.json` 任何 creator 必须真实
     存在于 YouTube（oEmbed `author_name` 能拉到）；伪造 channelId → 整个 Phase revert。
   - **手工数据**：`review-videos.json` 的 youtubeId + timestamps + creatorId
     必须由你根据真实视频人工填写（不准调用 YouTube Data API 批量爬；也不准 LLM
     生成 title / timestamp label）。Codex 你要**真的去 youtube.com 看视频手挑**。
     如果在沙盒里没法访问 youtube.com → 跳过填充步骤，只落代码 + schema + tests，
     数据文件留 `"reviews": []` 空数组，并在 `docs/PHASE41-BACKFILL.md` 写明用户
     要回填的字段格式（类比 Phase 31 联盟 backfill）。**不许编造 youtubeId。**
   - **byte-identity**：非试点 485 个 model 页 generate-all 产物 diff 必须为 0。
   - **试点清单**：试点 5 个 model 由 `scripts/pick-review-pilot.js` 动态挑（读
     `public/data/appliances.json`，按覆盖度排序），不硬编码 slug。
   - **原创壳**：5 个试点页原创词数 ≥ 300，且必须包含当页的 clearance 数据。
     `audit-review-content.js` gate 阻塞 PR。
   - **隐私**：embed 域名必须 `youtube-nocookie.com`；facade 模式（Phase 30
     已实现的那套 template）不许简化。
4. **独立 PR** `phase-41-review-videos`；label `phase-41`；禁止 auto-merge。
5. **不合并 commit**；commit message 附指标；每 Phase README 一节。
6. **Secrets**：不需要新 secret；oEmbed 是公共端点。若未来需要 YouTube Data API，
   留 TODO 到 backfill 文档，不在本 Phase 引入。

## 执行顺序 + 验收

### Step 1 — whitelist + pilot 选择
- 写 `data/videos/creator-whitelist.json`（至少 4 条：CHOICE AU / ProductReview AU / 
  Appliances Online / Samsung AU）
- 写 `scripts/pick-review-pilot.js` → 输出 `data/videos/review-pilot-slugs.json`
  （5 个 model slug，按覆盖度降序）
- 写 `data/copy/review-disclaimer.json`（手写 3 个 tier 的模板）

### Step 2 — validator + renderer
- `scripts/validate-reviews.js`（Phase 30 `validate-videos.js` 派生；oEmbed 校验；
  author_name 必须匹配 whitelist displayName 或 channelId；写 `validatedAt`）
- `scripts/common/review-video-renderer.js`（复用 Phase 30 facade template；
  VideoObject schema 完整；nocookie 域名）
- `scripts/audit-review-content.js`（300 词闸门 + clearance 数据存在性）

### Step 3 — 生成器接入
- `scripts/generate-brand-pages.js` / `generate-cavity-pages.js` 在命中试点 slug 时
  调 renderer；其他 model 完全不动
- 运行 `npm run generate-all`：**试点 5 页变化，其余页面 0 字节变化**（证明附 PR body）

### Step 4 — workflow + tests
- `.github/workflows/validate-reviews.yml`：每周日 UTC 03:00 + workflow_dispatch
- `tests/reviews.test.mjs` 覆盖 PLAN 列的 6 个场景
- `npm test` 全绿（≥ 302）

### Step 5 — 数据填充（受限于沙盒）
- **如果 Codex 能访问 youtube.com**：真手工挑 5 × 2 = 10 条 video 填入
  `review-videos.json`，跑 `npm run validate-reviews` 通过
- **如果不能访问**：留空数组 + 写 `docs/PHASE41-BACKFILL.md` 清单（每 model 要几条、
  从哪个 creator 频道找、timestamp 格式示例），PR body 写明"pilot data requires
  manual backfill"。

### 验收

- `npm test` 全绿（≥ 302）
- `npm run validate-reviews` 通过（或空数组 + backfill 文档）
- `npm run audit-copy` 0 violations（disclaimer 不含 forbidden phrases）
- `npm run audit-portability` 0 violations
- Phase 22 `npm run validate-schema` 0 errors
- `npm run generate-all` 非试点页 diff = 0（PR body 贴 `git diff --stat` 证明）
- Lighthouse 5 试点页 perf ≥ 0.9、a11y ≥ 0.9
- PR body 含手动 checklist 5 条全勾（见 PLAN"验收"）

## 失败处理

- oEmbed 限流：指数退避 3 次；仍失败 → 该 video 不入 JSON，不报错
- 任一步失败 → `git revert` 回 Phase 起点，commit message 写原因 + 复现
- 试点 model 不足（appliances.json 数据异常）→ 停下报告，不自作主张改选取逻辑
- 发现非白名单 creator 在 review-videos.json → 删条目 + 报告
- byte-identity 破坏（非试点页产物变化）→ 找出原因修到 0，不能接受

## 完成后回报

1. commit SHA + PR URL
2. 文件变更数
3. 新增测试数 + 总测试数
4. 关键指标：
   - Whitelist creator 数
   - 试点 5 个 slug（具体列出）
   - validate-reviews 首跑结果（通过 / 跳过 / 沙盒受限）
   - 原创词数（每页实际 count）
   - 非试点页 diff 字节数（应 0）
5. 用户待办：
   - 如果 Codex 沙盒无 youtube.com 访问 → 按 `docs/PHASE41-BACKFILL.md` 手工填
     review-videos.json
   - 观察期开始后 4 周对试点页 GSC + RUM 指标
6. 被跳过子任务 + 原因

现在开始。从 `tests/reviews.test.mjs` RED 启动。

---
