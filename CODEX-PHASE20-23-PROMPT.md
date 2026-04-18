# Codex 执行指令：FitAppliance v2 Phases 20–23

把下面 `---` 之间的内容整段发给 Codex。Codex 必须按顺序执行 Phase 20 → 23，每个 Phase 完成并 push 后再进入下一个。

---

你是 FitAppliance v2 项目的实现者。仓库根目录：`/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2`。

**你必须读并严格遵守**：
- `PLAN-PHASE20-23.md`（本次任务的完整规格）
- `DEVGUIDE.md`（仓库约定）
- `.claude/rules/` 下所有 markdown

## 全局规则（违反立即 `git revert` 最近 commit 并停止）

1. **角色**：你是唯一实现者。不要向用户提问，不要等待人工确认。自主完成全部四个 Phase。
2. **不做**：不登录任何网站；不操作浏览器；不去 Reddit / Whirlpool / Cloudflare；不过验证码。
3. **TDD**：每个 Phase 先写测试 (`tests/*.test.mjs`)，跑到 RED，再写实现到 GREEN。单元测试用 `node --test`。
4. **真实数据**：所有 JSON-LD / schema / metadata 字段只能用 `data/` 目录或公开权威来源里**真实存在**的数据。任何字段没有真实来源 → **省略**，不要填 mock / placeholder / 估算值。尤其严禁 fake `aggregateRating` / `reviewCount` / fake 作者 / fake citations。
5. **Secrets**：所有密钥用 `process.env.*` 读；缺失则 fail fast；禁止打印到日志或 commit 到仓库。
6. **每个 Phase 完成闭环**：
   - `npm test` 全绿
   - `npm run build` 无错
   - `git add` + `git commit -m "feat(phaseN): ..."` + `git push origin main`
   - 更新 `README.md`，加一小节说明本 Phase 交付物
   - 在当前 Phase 的提交 message 里附上交付报告（行数、新页数、测试数、分数）
7. **不同 Phase 独立提交**，不合并成一个大 commit。

## 执行顺序与验收

### Phase 20 — Core Web Vitals
按 `PLAN-PHASE20-23.md` 第 "Phase 20" 节实现。验收：
- 5 个代表页 Lighthouse performance ≥ 0.9
- `.github/workflows/lighthouse.yml` 手动触发一次跑通
- `tests/performance.test.mjs` 全绿

### Phase 21 — 内部链接图谱
按 "Phase 21" 节实现。验收：
- `reports/link-graph.json` 中孤立页 = 0
- 5 个新 hub 页存在且每个出链 ≥ 30
- sitemap/rss/image-sitemap 已包含新页
- `tests/link-graph.test.mjs` 全绿

### Phase 22 — 结构化数据扩展
按 "Phase 22" 节实现。验收：
- 新建 `/methodology`、`/about/editorial-standards` 两页
- 所有页 footer 链到这两页
- `tests/schema.test.mjs` 断言无假字段、全部 JSON-LD 合法
- `reports/schema-validation.json` 生成且 0 errors

### Phase 23 — GSC 数据管道
按 "Phase 23" 节实现。验收：
- `scripts/gsc-fetch.js` + `scripts/keyword-gap.js` 可独立运行（用环境变量 `GSC_SA_JSON`）
- `.github/workflows/gsc-weekly.yml` YAML 合法、`workflow_dispatch` 可触发
- `tests/gsc.test.mjs` 用 mock 全绿
- README 明确告诉用户需手动把 service account 加为 GSC property owner

## 失败处理

- 某 Phase 中任何一步失败 → 先 `git revert` 把仓库拉回该 Phase 开始前的状态，然后在 commit message 或最后报告里写明失败原因与复现步骤。
- 不要"绕过"失败测试；不要修改测试以让实现通过（除非测试明确有 bug，并在 commit 里单独解释）。
- 不要向用户索取帮助去越过 bot 检测、登录或验证码；跳过该子任务并在报告里说明。

## 完成后回报（push 最后一个 commit 之后）

输出一段总结，包含：
1. 每个 Phase 的 commit SHA
2. 新增 / 修改 / 删除文件数
3. 新增测试数量 + 总测试数
4. Lighthouse 分数（Phase 20）、孤立页数（Phase 21）、schema validation errors（Phase 22）、GSC mock test 状态（Phase 23）
5. 任何被跳过的子任务及原因

现在开始。从 Phase 20 的 TDD（先写 `tests/performance.test.mjs` 并跑 RED）启动。

---
