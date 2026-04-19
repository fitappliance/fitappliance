# FitAppliance v2 — Phases 37–39 (Stability Week + Issue Triage)

> **角色**：Claude 设计 + 审核；Codex 实现。
> **沿用 Phases 19–36 全部红线**：TDD、真实数据、无人工步骤、无 PII、独立 commit + PR。
> **本轮主题**：A（仓库稳定性：可移植性 + generator 去重 + 文档漂移）+ B（issue 自动分诊防刷屏）。

---

## Phase 37 — 仓库可移植性与 Generator 去重

**动机**：Hotfix-1 暴露的"绝对路径炸弹"只是冰山一角。要把"在任何 clean checkout 上 `npm ci && npm test && npm run build` 都绿"变成强制门。

### 交付物

1. **`scripts/audit-portability.js`**（纯检查，不改文件）：
   扫描 `tests/` + `scripts/` + `public/` + `api/` + `.github/workflows/`，违规立即 `exit 1`。禁止模式（可配置白名单）：
   - `/Users/` 或 `/home/` 或 `C:\\` 绝对路径
   - `localhost:\d+` / `127\.0\.0\.1:\d+`（测试 setup 可白名单）
   - `process.env.HOME` / `os.homedir()` 在 `scripts/` 下使用
   - tz 假设：`new Date(` 不带 UTC / ISO 字符串（启发式，仅 warn）
   - 硬编码 `main` 分支名（应读 `git symbolic-ref`）
   输出 `reports/portability-YYYYMMDD.json`。

2. **`.github/workflows/portability.yml`**：PR 上跑 audit-portability，fail 阻塞 merge。

3. **Generator 去重**（源码重构，不改输出）：
   - 扫 `scripts/generate-*.js`，把重复逻辑（HTML head/meta 生成、schema JSON-LD 模板、sitemap loc 构造、slug 规范化）抽到 `scripts/common/`。
   - **验收**：`npm run generate-all` 前后产物 `git diff --stat` **必须 0 字节变化**。在 PR body 贴 diff 输出证明。
   - 新增 `scripts/common/` 每个 util 都有单测。

4. **CI 增强**：在现有 `pr.yml` 末加 `npm run generate-all && git diff --exit-code` 重复确认生成物已 commit（之前有，确保还在且严格）。

5. `tests/portability.test.mjs`：
   - (a) audit 脚本扫到真实绝对路径 → exit 1
   - (b) 白名单机制工作
   - (c) 纯净 repo 扫 → exit 0
   - (d) generator 共用 util 的单测齐全

### 红线
- ❌ 不在重构中改任何生成物的字节（纯内部重构）
- ❌ 不删掉现有 generator 的入口（保持 `package.json` scripts 向后兼容）
- ❌ audit 白名单不得膨胀为"禁止规则的借口"——每条白名单要注释说明原因

---

## Phase 38 — README / 文档漂移检测

**动机**：README 和各 Phase 文档里有几十处 script 名、文件路径、命令示例。人改代码时经常忘改 doc。

### 交付物

1. **`scripts/audit-docs.js`**：
   解析 `README.md`、`DEVGUIDE.md`、`docs/**/*.md`、`PLAN-PHASE*.md`、`CODEX-PHASE*-PROMPT.md` 中的：
   - ` ```bash / ```sh` fenced code block 里的 shell 命令（提取 `npm run <x>`、`node scripts/<file>`、`gh workflow run <yml>`）
   - markdown 链接 `[text](path)` 里指向仓库内的相对路径
   - 内联反引号里的 `scripts/*.js` / `tests/*.mjs` / `api/*.js` 路径
   
   验证：
   - `npm run <x>` 必须在 `package.json.scripts` 存在
   - `node scripts/<file>` 指向的文件存在
   - `gh workflow run <yml>` 文件在 `.github/workflows/`
   - 相对路径 link 必须解析到存在的文件
   
   输出 `reports/doc-drift-YYYYMMDD.json`；有漂移 → `exit 1`。

2. **`.github/workflows/doc-audit.yml`**：PR 上跑。

3. **修现有漂移**：先跑一次 audit，把当前所有 stale 引用在同一个 commit 里修掉（或补足缺失的 script/文件）。

4. `tests/doc-audit.test.mjs`：
   - (a) 指向不存在 script → 检出
   - (b) 指向不存在文件 link → 检出
   - (c) 所有合法场景通过
   - (d) 忽略 `example.com`、外部 URL、锚点（`#section`）

### 红线
- ❌ 不把文档里指向未来 Phase 的 placeholder 错误标成漂移（要支持 `<!-- doc-audit: ignore -->` 注释）
- ❌ 不在 fix 阶段删文档内容以"消除漂移"——缺失的 script 应该补齐，不是删引用

---

## Phase 39 — Issue Triage 自动分诊

**动机**：Phase 27/34/35/36 各自会自动开 issue/PR。没分诊会每天刷屏。要一个"分诊机器人"：归档、合并、周报。

### 输入类型

所有带 label 前缀的 issue/PR：
- `sentinel-auto`（Phase 27 每日）
- `auto-content`（Phase 34 每周）
- `auto-perf`（Phase 35 每周）
- `auto-error`（Phase 36 每日）

### 交付物

1. **`scripts/triage-issues.js`**：
   - 用 `gh api` 拉所有 open issue/PR
   - 按 label 分组；每组内按签名去重：
     - `auto-error`：同 `errorSignature`（title 里的 hash）→ 仅保留最新的 open，旧的 comment "superseded by #N" 并 close
     - `auto-content`：同 query slug → 同上
     - `auto-perf`：同 path → 同上
     - `sentinel-auto`：同类型（uptime/broken-link/orphan）→ 同上
   - 输出 `reports/triage-YYYYMMDD.json`（每组 before/after 计数）

2. **周报 issue**：
   每周一 UTC 05:00 开一个汇总 issue `[weekly] auto-issue digest YYYY-MM-DD`，body：
   - 本周新增 auto-* issue 数 by label
   - Top 5 最频繁错误签名
   - 最差 LCP p75 path
   - 用 label `weekly-digest`
   - 同周已有 → 更新评论，不重开

3. **`.github/workflows/triage.yml`**：
   - 每日 UTC 05:00 跑 triage
   - 每周一额外跑 digest
   - 使用 `GITHUB_TOKEN` (Actions 自带)，**只读 + issue 操作**，不触发其他 auto-* workflow

4. **防刷屏硬限**：
   - 单次 triage 最多 close 20 个 issue（防失控误杀）
   - 单次最多 comment 50 次
   - 超限 → 部分处理 + 在下次运行继续

5. `tests/triage.test.mjs`：
   - (a) 同签名 5 个 open → 保留最新 1 个，4 个 close + comment
   - (b) 不同签名不合并
   - (c) 单次 close 超 20 → 停止并在报告里写明
   - (d) digest 周重跑 → 只更新评论不重开
   - (e) 不处理 label 不在白名单的 issue（保守）

### 红线
- ❌ 不 close 人工开的 issue（必须严格校验 label 前缀 + 作者是 github-actions[bot]）
- ❌ 不自动修改 issue title（仅评论 + close/reopen）
- ❌ 不跨 repo 操作
- ❌ 不在 triage 里删除任何数据，只 close/reopen/comment

---

## 公共验收

- ✅ `npm test` 全绿（新增测试 ≥ 3 文件）
- ✅ `npm run build` 无错
- ✅ 3 个 Phase 独立 PR → CI green → 人工 merge
- ✅ 3 个新 workflow 各 `workflow_dispatch` 跑通一次
- ✅ README 每 Phase 一节
- ✅ 每 Phase commit message 附指标

## 硬性红线汇总

1. ❌ 人工步骤 / 登录 / 验证码
2. ❌ 生成物字节改变（Phase 37 纯重构）
3. ❌ 文档 fix 阶段删掉 script 引用（应补齐功能）
4. ❌ 误 close 人工 issue（Phase 39 严格 bot-author 校验）
5. ❌ 绝对路径 / OS 特定路径重现
6. ❌ Reddit / WP / CF / bot-detection
7. ❌ 跨 Phase 26 隐私边界
