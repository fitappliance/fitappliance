# Codex 执行指令：FitAppliance v2 Phase 42

把 `---` 之间内容整段发给 Codex。

---

你是 FitAppliance v2 项目唯一实现者。仓库根目录：`/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2`。

**先读并严格遵守**：
- `PLAN-PHASE42.md`（本轮完整规格）
- 所有历史 PLAN-PHASE19 / 20-23 / 24-27 / 28-33 / 34-36 / 37-39 / 40 / 41（约束依然有效）
- `DEVGUIDE.md` + `.claude/rules/`

## 全局规则（违反立即 `git revert` 并停止）

1. **角色**：唯一实现者；不向用户提问；不操作浏览器；不过验证码；不登录任何服务。
2. **TDD**：每 sub-phase 先写测试跑 RED，再实现到 GREEN。
3. **本轮强约束**：
   - **严禁并行 42a + 42b**。先完成 42a → 独立 PR → 合并后再启动 42b。
   - **严禁 LLM 生成 `displayName` / `readableSpec`**。只能从 `data/series-dictionary.json` 查表或规则解析 model code。审计不通过 fail build。
   - **严禁伪造 popularity research 数据**。沙盒无 `www.harveynorman.com.au` / `www.thegoodguys.com.au` 等真实 AU 零售商访问 → 空 `popularity-research.json` + 打 `docs/PHASE42A-RESEARCH-BACKFILL.md`。
   - **严禁在 42a 改 homepage 静态 HTML**。客户端卡片改造只能通过 JS 模板。`git diff public/index.html public/pages/` 非零立即 revert。
   - **严禁 42b 硬删 page slug**。被 drop 的 brand 必须配 301 映射 + IndexNow 提交。遗漏任一条立即 revert。
4. **研究脚本上限**：单次 `scripts/research-popularity.js` 最多 500 次 WebFetch，超限记 `cursor` 下次续跑。
5. **独立 PR**：42a → `phase-42a-search-ux`；42b → `phase-42b-data-quality`。label 分别 `phase-42a` / `phase-42b`。不 auto-merge。
6. **Byte-identity 验证**（42a）：重构前 `npm run generate-all && git diff --stat` = 0。
7. **Secrets**：`GITHUB_TOKEN` 走 `process.env`，缺失 fail fast。
8. **不合并 commit**；每 Phase README 一节，commit message 附指标。

## 执行顺序 + 验收

### Phase 42a — Search UX + Market Popularity

按 PLAN "Phase 42a"。执行步骤：

1. **RED**：写 `tests/search-ux.test.mjs` / `tests/popularity.test.mjs` / `tests/readable-spec.test.mjs`（≥ 20 test），全失败
2. **GREEN 核心**：
   - `data/clearance-defaults.json` + `data/series-dictionary.json` 人工填 tier1 brands（Bosch/LG/Samsung/Miele/Fisher & Paykel）
   - `public/scripts/ui/fit-score.js` / `scripts/common/popularity-score.js` / `scripts/common/readable-spec.js` 纯函数
   - `scripts/enrich-appliances.js` one-shot enrich 现有 `public/data/*.json`（回写 displayName/readableSpec/priorityScore）
   - `scripts/research-popularity.js`：沙盒环境调 `globalThis.fetch` 去访问真实 AU 零售商；若任何一次 fetch 失败或 DNS 错 → **立即进入 fallback 模式**：写空 `data/popularity-research.json`（`products: {}`, `last_researched: null`）+ 打 `docs/PHASE42A-RESEARCH-BACKFILL.md` 记录需用户手动跑
3. **GREEN UI**：
   - 拆 `public/scripts/fit-checker.js` → `search-core.js` (纯) + `search-dom.js` + `ui/search-wizard.js`
   - 卡片模板升级（client-side render）
   - tolerance 滑条 + category preset chips + empty state 升级
4. **audit-copy 扩展**：扫 enriched displayName / readableSpec
5. **验收** (PR body 必贴)：
   - `npm test` pass 数 + 新增数
   - `git diff public/index.html` = 0 证明
   - `npm run enrich-appliances` 输出摘要（N 条加 displayName / N 条加 readableSpec / N 条 series=null）
   - `npm run research-popularity` 输出摘要（researched/total/skipped-reason）
   - Lighthouse mobile 4 项分数

### Phase 42b — Data Quality Cleanup

**前置**：42a PR 合并 + GSC 观察 ≥ 7d 后再启动。

按 PLAN "Phase 42b"：

<!-- doc-audit: ignore -->
1. **RED**：`tests/data-quality.test.mjs` ≥ 5 test
2. **GREEN**：
   - `data/au-brand-registry.json` 按 PLAN 填 tier1/2/3/drop
   - `data/brand-canon.json` 大小写合并表
   - `scripts/enrich-appliances.js` 扩展：canonicalize → tier → exclude-if-drop → unavailable-if-zero-retailer
   - `scripts/generate-*.js` 过滤 `excluded || unavailable`
<!-- doc-audit: ignore -->
   - `scripts/audit-data-quality.js` + `.github/workflows/data-quality.yml`
   - `vercel.json` 加 drop-brand 301 → `/discontinued-brands`
   - 生成 `/discontinued-brands` 页面（不用 LLM 写文案，用模板）
<!-- doc-audit: ignore -->
3. **IndexNow**：遍历"被删 slug 集合" 调 `scripts/submit-indexnow.js`（或 utility）提交。失败不静默吞 → 打 backfill 文档
4. **验收** (PR body 必贴)：
   - 被 drop 的 brand 清单 + 对应 slug 数
   - 301 规则 count（以及 sample curl 验证 3 条）
   - IndexNow 提交日志（或 backfill 文档链接）
   - 数据变化统计表：category × before → after（expected Fridges 1319 → ~650）

## 失败处理

- 任一步失败 → `git revert` 回 Phase 起点，commit 写原因 + 复现
- 42a 重构出现 homepage byte 变化 → 整个 42a revert
- 42b 发现 tier1 brand 被误 drop → 立即停止，打印清单，不执行
- Research 脚本沙盒无网 → 空数据 + backfill 文档，**不**伪造
- IndexNow 失败 → 打 backfill 文档，**不**跳

## 完成后回报

1. 每 Phase commit SHA + PR URL + label
2. 每 Phase 文件变更数
3. 新增测试数 + 总测试数
4. 关键指标：
   - **42a**：新增 util 数 / enriched 字段覆盖率 / researched 比例 / Lighthouse 4 分 / homepage byte-diff = 0 证明
   - **42b**：brand count before/after / dropped slug count / 301 rule count / IndexNow 提交数
5. 被跳过子任务 + 原因
6. 若研究脚本 fallback 生效：贴 `docs/PHASE42A-RESEARCH-BACKFILL.md` 内容

现在开始。从 Phase 42a 的 `tests/search-ux.test.mjs` RED 启动。**禁止**提前触碰 42b 文件。

---
