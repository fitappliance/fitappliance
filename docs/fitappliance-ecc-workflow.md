# FitAppliance v2 — ECC Workflow

适用范围：FitAppliance v2 的数据更新、research、compare/link 修复、页面生成、审计与验证。

## 核心原则

1. **Audit first**
   - 先看当前数据语义、覆盖率、缺失状态、已有 research 资产。
   - 先确认是数据问题、生成脚本问题，还是展示层问题。

2. **Smallest safe change**
   - 优先做最小必要改动。
   - 不为小修复引入重型重构。

3. **Generation must be verified**
   - 任何改动到数据脚本、生成脚本、链接逻辑后，都要重新生成并验证结果。

4. **Research must be adoptable**
   - research 不是堆资料，必须能落到具体 ID、字段、候选值、证据和 adoptable 结论。

5. **Field semantics are strict**
   - 不要混淆 `null` / `undefined` / `0` / 空字符串 / 缺省字段。
   - 对 sentinel value 和真实缺失要分开处理。

---

## 推荐工作流

### A. 数据 / research 任务
适用于：door swing、clearance、rebate、brand coverage、缺失字段补全

1. 审计现状
   - 看 `docs/coverage-audit.json`
   - 看 `docs/door-swing-research-notes.md`
   - 看已有 research sheet / groups
   - 明确缺失语义和当前覆盖状态

2. 定义本轮目标
   - 明确品牌、型号、字段、批次
   - 区分 adoptable / not adoptable

3. 产出最小 research output
   - 精确 ID
   - 品牌 / 型号
   - 当前值
   - 候选值
   - 证据来源
   - adoptable 结论
   - 下一步建议

4. 回写数据
   - 只改已确认字段
   - 不顺手改无关数据

5. 运行验证
   - `npm test`
   - `npm run lint`
   - 必要时跑 coverage / audit 脚本

---

### B. 链接 / compare 页面任务
适用于：direct_url、retailer link、compare 页 Buy link、affiliate link 闭环

1. 先确认问题层级
   - 数据里没有 link
   - 生成脚本没带出 link
   - 页面模板没渲染 link
   - 渲染逻辑 fallback 错误

2. 优先修数据流，不只修表面 HTML
   - 能在生成脚本修，就不要手改静态页面
   - 能在 link resolver 修，就不要到处 patch 模板

3. 重新生成
   - `npm run generate-comparisons`
   - 必要时 `npm run generate-pages`

4. 验证结果
   - 检查覆盖数量
   - spot check 样本页面
   - 检查 link 类型是否合理
   - 确认无空链接、无明显根域名误跳转

---

### C. UI / UX 任务
适用于：sticky banner、filters、product card、search UX

1. 先确认是否影响数据逻辑
   - UI 改动不能悄悄破坏 search/filter/result generation 语义

2. 小步改动
   - 优先局部函数、局部样式、局部组件逻辑

3. 至少做这些检查
   - 桌面 / 移动端行为
   - 空状态
   - 参数切换后同步
   - 搜索结果和 CTA 不回归

---

## 任务类型对应的 ECC 使用建议

### 应强使用
- audit / verification
- JS/TS coding standards
- security baseline
- regression thinking
- research-first for missing data and link issues

### 应弱使用
- planner / PRD / architecture doc
- full TDD ceremony for every small fix
- framework-specific guidance unrelated to current stack

### 默认忽略
- 与当前项目无关的多语言规则
- Next.js 专项规则
- 为小修复引入大规模目录重构

---

## 对当前项目的实际规则

### 必做
- 改字段语义前，先确认现状和历史结论
- 改生成脚本后，必须重新生成
- 改链接逻辑后，必须抽样检查真实输出
- 产出 research 时，必须可执行、可采纳、可追溯

### 不做
- 不把 `0` 当作天然缺失
- 不凭感觉批量补数据
- 不手改大量生成产物来绕过脚本问题
- 不为了小改动写重型产品文档

---

## 推荐命令清单

```bash
npm test
npm run lint
npm run generate-comparisons
npm run generate-pages
npm run research-sheet
```

按任务需要再使用：

```bash
npm run sync
npm run split-data
npm run suggest-swing
npm run infer-swing
npm run bulk-import
```

---

## 完成定义

一个 FitAppliance 任务，只有同时满足下面条件才算完成：

- 目标问题被准确定位
- 改动发生在正确层级
- 相关生成已重跑
- 关键结果已验证
- 必要的 research / notes 已更新
- 没引入新的语义混乱或链接回归

---

## 一句话版本

**FitAppliance 的 ECC 工作流不是“重文档”，而是：先审计，后小改，重生成，强验证。**
