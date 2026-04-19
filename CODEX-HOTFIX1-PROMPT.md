# Codex 执行指令：Hotfix-1 — 消除测试绝对路径 + 修复 PR CI

## 背景
- PR #1 (phase34-auto-content) 和 PR #3 (phase35-rum-diagnostics) 的 CI 挂在 `test-and-verify`，133 个测试失败，错误形如：
  ```
  Cannot find module '/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/public/scripts/fit-checker.js'
  ```
- 根因：`tests/` 下 27 个文件硬编码 `const repoRoot = '/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2'`。本地偶然匹配所以绿，CI Linux 必 fail。

## 任务（在 `main` 上做，单独一个 commit）

1. **定位**：`grep -rln "/Users/clawdbot_jz" tests/` 找出所有文件（约 27 个）。
2. **替换规则**：把每个文件顶部的
   ```js
   const repoRoot = '/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2';
   ```
   改为：
   ```js
   import path from 'node:path';
   import { fileURLToPath } from 'node:url';
   const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
   ```
   （CommonJS 测试用 `const path = require('node:path'); const repoRoot = path.resolve(__dirname, '..');`）
3. **验证**：`grep -rn "/Users/clawdbot_jz" tests/ scripts/ public/ api/` → 必须 0 命中（确认没其他地方也藏）。
4. **跑测试**：`npm test` 必须依然 260+ 全绿（不得因重构丢失断言）。
5. **commit** 到 `main` 分支，消息：`fix(tests): replace hardcoded absolute repoRoot with __dirname-relative resolution`
6. **push main**。

## 然后 Rebase 两个 PR

7. `git checkout phase34-auto-content && git pull --rebase origin main`
   - 若有冲突 → 解决后 `git rebase --continue`
   - `git push --force-with-lease origin phase34-auto-content`
8. 同样处理 `phase35-rum-diagnostics`。
9. 观察 CI：`gh run watch` 或 `gh pr checks 1 / gh pr checks 3`，直到两个 PR 的 `test-and-verify` 都 green。

## 红线

- ❌ 不得跳过失败测试 / 删除测试 / 改断言让它通过。
- ❌ 不得用 `--no-verify` 或跳过 pre-commit。
- ❌ 若 rebase 冲突涉及业务逻辑，**停下**，在报告里列出冲突文件 + 粘贴冲突段，**不要自作主张**解决业务冲突。路径重写的机械冲突可以自行解决。
- ❌ 不 auto-merge PR。

## 完成后回报

- commit SHA（main hotfix + 2 个 PR 的 rebase 结果）
- 替换文件数
- `npm test` 本地数字
- `gh pr checks 1` 与 `gh pr checks 3` 最终状态
- 任何冲突或剩余手动项
