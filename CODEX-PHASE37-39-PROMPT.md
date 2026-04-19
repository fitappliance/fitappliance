# Codex 执行指令：FitAppliance v2 Phases 37–39

把 `---` 之间内容整段发给 Codex。

---

你是 FitAppliance v2 项目唯一实现者。仓库根目录：`/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2`。

**先读并严格遵守**：
- `PLAN-PHASE37-39.md`（本次完整规格）
- 所有历史 PLAN-PHASE19 / 20-23 / 24-27 / 28-33 / 34-36（约束依然有效）
- `DEVGUIDE.md` + `.claude/rules/`

## 全局规则（违反立即 `git revert` 并停止）

1. **角色**：唯一实现者，不向用户提问，不操作浏览器，不过验证码，不登录任何服务。
2. **TDD**：每 Phase 先写测试跑 RED，再实现到 GREEN。
3. **本轮特别红线**：
   - **Phase 37**：generator 重构必须 **byte-identical**。重构前先 `npm run generate-all && git add -A && git stash`，重构后再 `npm run generate-all && git diff --stat` → **必须 0 改动**。有任何字节变化 → revert 重构，不改生成物。
   - **Phase 37**：`audit-portability.js` 的白名单每条必须有注释解释"为什么例外"；不得用白名单掩盖违规。
   - **Phase 38**：doc drift 修复阶段**绝不**删 script/file 引用来"消除漂移"——缺失的 script 要补齐（或引用本来就是未来 Phase placeholder → 加 `<!-- doc-audit: ignore -->`）。
   - **Phase 39**：close issue 前必须双重校验：(a) label 在白名单 `[sentinel-auto, auto-content, auto-perf, auto-error]` 之一；(b) `author.login === 'github-actions[bot]'`。任一不满足 → 跳过。
   - **Phase 39**：单次运行硬上限 close 20 + comment 50；超限立即停止，**不**拆绕。
4. **跨环境可移植性**：本轮 Phase 37 就是专门堵这个洞。Codex 自己写的任何新代码也必须通过 audit-portability（吃自己的狗粮）。
5. **独立 PR**：3 个 Phase 各自一个 branch + PR；不 auto-merge；label 分别为 `phase-37` / `phase-38` / `phase-39`。
6. **Secrets**：`GITHUB_TOKEN`（Actions 自带）走 `process.env`，缺失 fail fast。
7. **不合并 commit**；每 Phase README 一节，commit message 附指标。

## 执行顺序 + 验收

### Phase 37 — Portability & Generator Dedup
按 PLAN "Phase 37"。验收：
- `scripts/audit-portability.js` 可独立 `node` 运行；扫到现有违规 exit 1
- `.github/workflows/portability.yml` 在 PR 上跑通（自身 PR 首跑必须绿 = 无违规）
- `scripts/common/` 至少抽出 4 个 util：html-head、schema-jsonld、sitemap-loc、slug-normalize，每个都有单测
- `npm run generate-all` 前后 `git diff --stat` = 空
- `tests/portability.test.mjs` 4 项全绿
- PR body 必须贴"重构前后 generate-all 的 git diff --stat = 0"截图/文本证明

### Phase 38 — Doc Drift Detection
按 "Phase 38"。验收：
- `scripts/audit-docs.js` 扫 README/DEVGUIDE/docs/**/*.md/PLAN-PHASE*.md/CODEX-PHASE*-PROMPT.md
- 支持 `<!-- doc-audit: ignore -->` 行级忽略
- 首跑列出当前所有漂移 → 同一 commit 内补齐/修复（**不删引用**）
- `.github/workflows/doc-audit.yml` PR 上跑通
- `tests/doc-audit.test.mjs` 4 项全绿（含外部 URL / 锚点忽略）

### Phase 39 — Issue Triage
按 "Phase 39"。验收：
- `scripts/triage-issues.js` 只处理白名单 label + bot 作者的 issue/PR
- 周一 UTC 05:00 产出 `[weekly] auto-issue digest YYYY-MM-DD` 单 issue（已存在 → 更新评论）
- `.github/workflows/triage.yml` 每日 + 周一跑；`workflow_dispatch` 至少跑通一次
- 单次 close ≤ 20，comment ≤ 50，超限输出到报告
- `tests/triage.test.mjs` 5 项全绿（含"人工 issue 不动"）
- 首跑报告 `reports/triage-YYYYMMDD.json` 提交

## 失败处理

- 任一步失败 → `git revert` 回 Phase 起点，commit 写原因 + 复现
- generator 重构出现字节变化 → 整个 Phase 37 revert，不强行调 util
- Phase 38 发现的漂移数过多（> 50）→ 分批修，但禁止"快速删除引用"
- Phase 39 dry-run 发现会误伤人工 issue → 立即停止，打印候选列表，不执行

## 完成后回报

1. 3 个 Phase commit SHA + PR URL
2. 每 Phase 文件变更数
3. 新增测试数 + 总测试数
4. 关键指标：
   - Phase 37：抽出 util 数 + generator 字节 diff（必须 0）+ audit 初始违规数（应 0，因为 hotfix-1 已清）
   - Phase 38：初次扫到的漂移数 + 修复后 = 0
   - Phase 39：白名单 label 数 + dry-run 下 close/comment 计划数
5. 3 个新 workflow 的 `workflow_dispatch` run URL
6. 被跳过子任务 + 原因

现在开始。从 Phase 37 的 `tests/portability.test.mjs` RED 启动。

---
