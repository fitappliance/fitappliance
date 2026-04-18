# Codex 独立执行指令 — Phase 19

直接把下面整段复制粘贴给 Codex：

---

你是 FitAppliance v2 项目的自主执行代理。项目路径：`/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2`。

## 你的任务

按 `PLAN-PHASE19.md` 从 Part 1 到 Part 6 **连续执行**，不需要用户确认。每个 Part 完成后自动 commit + push 到 `origin/main`，继续下一个 Part。

## 执行规则

1. **TDD 优先**：每个 Part 先写测试，确认 FAIL，再写实现，确认 PASS。
2. **不询问用户**：所有技术决策自己做；遇到歧义选最安全的方案并在 commit message 里说明。
3. **失败即 rollback**：如果一个 Part 的测试无法通过，`git reset --hard HEAD` 回到上个 Part 的 commit，在 `PLAN-PHASE19.md` 末尾追加 `## 失败记录` 章节写明原因，然后**停止**——不要继续后续 Part。
4. **绝不触碰**：
   - Reddit / Whirlpool / Commission Factory（这些是人工任务，已在计划里明确排除）
   - `.env`（真实 secrets）
   - 不要用 `git push --force`
5. **每个 Part commit 之前必须跑 `npm test` 并全绿**。

## 起始验证

开始前先执行：

```bash
cd /Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2
git status                    # 必须 clean
git pull --ff-only origin main
npm test                      # 必须全部 pass（baseline 169+ tests）
cat PLAN-PHASE19.md | head -30  # 确认计划文件存在
```

如果 `git status` 不 clean 或测试失败，立即停止并报告。

## 执行顺序

- **Part 1** — IndexNow API 集成（生成 key、写 ping 脚本、加 GH Actions、首次手动 ping 确认 HTTP 200/202）
- **Part 2** — 长尾 SEO 页面批量生成（`scripts/generate-cavity-pages.js` + `scripts/generate-doorway-pages.js`，≥ 60 个 cavity + ≥ 30 个 doorway）
- **Part 3** — Schema 扩展（HowTo 首页、BreadcrumbList 所有页、ItemList 品牌页——**不要用伪造的 AggregateRating**）
- **Part 4** — RSS feed + image sitemap + OG images（用 `sharp` 生成 1200×630 PNG）
- **Part 5** — GitHub Actions workflow（weekly regen + PR validation）
- **Part 6** — 更新 `.openclaw_context` 和 `docs/coverage-audit.json`，最终 commit

## 关键约束重申

- **OG 图片必须真实生成**并提交到 `public/og-images/`（不要只写代码不跑脚本）
- **IndexNow key 文件必须存在于 `public/{key}.txt`** 且内容就是 key 本身
- **AggregateRating 不能伪造评分**——改用 `ItemList` 方案（计划 3.3 已注明）
- **不要 commit `.env`、`node_modules`、`.DS_Store`**
- **sitemap 必须包含新增的 cavity/doorway 页面**，`grep -c "<url>" public/sitemap.xml` 应 ≥ 800

## 完成后报告

所有 6 个 Part 完成后，输出一份 markdown 总结，包含：

1. 每个 Part 的 commit hash（`git log --oneline -10`）
2. 总测试数变化（before/after）
3. 总页面数变化（`grep -c "<url>" public/sitemap.xml`）
4. IndexNow 首次 ping 的 HTTP 状态码
5. OG 图片生成的数量（`ls public/og-images/*.png | wc -l`）
6. GitHub Actions workflow 文件列表

**如果遇到任何无法解决的阻塞**，立即停止、回滚到最近一个绿 commit、写清楚失败原因。**不要跳过 Part、不要留半成品、不要把失败伪装成成功。**

开始执行。

---

## 给用户的备注

把上面分隔线之间的内容发给 Codex 即可。Codex 预计执行时间：**40-90 分钟**（取决于 OG 图片批量生成的速度）。

你可以在另一个终端持续观察 GitHub：

```bash
watch -n 60 'git -C /Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2 log --oneline -5'
```

或者直接打开 https://github.com/fitappliance/fitappliance/commits/main 看 commit 进度。
