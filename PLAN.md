# Phase 17 Plan — Dynamic Sticky Banner + Compare Page Direct URL Audit

**Status:** Phase 16 完成 (148/148 tests passed)  
**Current Coverage:** 27.2% missing rate (2160/2169 products missing door_swing)  
**Target:** 继续压低缺失率 + 落地 Dynamic Sticky Banner + 修复 compare 页面链接

---

## 1. Dynamic Sticky Banner 落地方案

### 目标
在移动端滚动时，将搜索条件固定在顶部，方便用户快速修改参数而无需滚回页面顶部。

### 实施步骤

#### 1.1 HTML 结构（已存在）
- `index.html` 中已有 `.float-bar` 结构（line ~1100）
- 当前状态：`hidden` 属性，通过 `initFloatBar()` 控制显示

#### 1.2 触发逻辑（已实现）
```javascript
// 已存在于 index.html 底部
function initFloatBar() {
  const searchForm = document.getElementById('searchForm');
  const floatBar = document.getElementById('floatBar');
  const observer = new IntersectionObserver(
    ([entry]) => {
      floatBar.classList.toggle('visible', !entry.isIntersecting);
    },
    { threshold: 0, rootMargin: '-60px 0px 0px 0px' }
  );
  observer.observe(searchForm);
}
```

#### 1.3 内容同步（已实现）
- `updateFloatBarSummary()` 函数已存在
- 在 `doSearch()` 和 `setCategory()` 中调用
- 显示格式：`Fridges · 600×1800×650mm · Samsung`

#### 1.4 待优化项
1. **桌面端隐藏**：CSS 已设置 `@media (min-width:661px) { .float-bar { display: none !important; } }`
2. **Edit 按钮功能**：`scrollToSearch()` 已实现，滚动到搜索表单
3. **测试覆盖**：
   - 移动端滚动触发
   - 参数变更后内容同步
   - 点击 Edit 按钮跳转

### 验证清单
- [ ] 移动端（<660px）滚动时 banner 出现
- [ ] 桌面端（>660px）banner 始终隐藏
- [ ] 搜索后 banner 显示正确的 category + dimensions + brand
- [ ] 点击 Edit 按钮平滑滚动到搜索表单
- [ ] 切换 category 后 banner 内容更新

---

## 2. Compare 页面 Direct URL 链接审计与修复方案

### 问题诊断
- **现状**：38 个 compare 页面已生成（`pages/compare/*.html`）
- **问题**：0 个页面包含 `direct_url`（grep 结果为 0）
- **根因**：`generate-comparisons.js` 未使用 `direct_url` 字段

### 数据层面
#### 2.1 Direct URL 覆盖率
```bash
# 检查 appliances.json 中 direct_url 字段覆盖率
jq '[.products[] | select(.direct_url != null)] | length' public/data/appliances.json
```

#### 2.2 Retailer URL 质量
当前 `resolveRetailerUrl()` 逻辑（index.html line ~1800）：
1. 优先使用 `product.direct_url`
2. 回退到 `retailer.url`
3. 如果是根域名，拼接搜索 URL

### 修复方案

#### 2.3 更新 `generate-comparisons.js`
**目标**：在 compare 页面中为每个品牌的样本产品添加 "Buy" 链接

**修改位置**：`buildComparisonPageHtml()` 函数

**新增内容**：
```javascript
// 在 modelSamplesA/B 中添加 retailer 信息
function sampleBrandModels(products, cat, brand) {
  return products
    .filter((product) => product.cat === cat && product.brand === brand)
    .sort(/* existing sort logic */)
    .slice(0, 3)
    .map((product) => ({
      model: product.model,
      w: product.w,
      h: product.h,
      d: product.d,
      directUrl: product.direct_url,
      bestRetailer: product.retailers?.[0] // 最低价零售商
    }));
}
```

**HTML 模板更新**：
```javascript
const sampleItemsA = modelSamplesA.map((sample) => {
  const buyLink = sample.directUrl || sample.bestRetailer?.url || '#';
  const retailerName = sample.bestRetailer?.n || 'Retailer';
  return `<li>
    ${escHtml(sample.model)} · ${sample.w}×${sample.h}×${sample.d}mm
    ${buyLink !== '#' ? `<br><a href="${buyLink}" target="_blank" rel="noopener sponsored" style="font-size:12px;color:var(--copper)">Buy from ${escHtml(retailerName)} →</a>` : ''}
  </li>`;
}).join('');
```

#### 2.4 执行步骤
```bash
cd /Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2

# 1. 备份现有 compare 页面
cp -r pages/compare pages/compare.backup

# 2. 修改 scripts/generate-comparisons.js（见上方代码）

# 3. 重新生成
npm run generate-comparisons

# 4. 验证
grep -l "Buy from" pages/compare/*.html | wc -l  # 应该 > 0
```

#### 2.5 质量检查
```bash
# 检查生成的链接类型分布
for f in pages/compare/*.html; do
  grep -o 'href="[^"]*"' "$f" | grep -E "(harveynorman|thegoodguys|jbhifi|binglee|appliancesonline)"
done | sort | uniq -c
```

---

## 3. docs/reddit-launch.md 内容规划

### 目标
为 Reddit 发布准备一份完整的 launch checklist 和 post 模板。

### 文件结构
```markdown
# Reddit Launch Plan — FitAppliance

## Pre-Launch Checklist
- [ ] 确认 148/148 tests passed
- [ ] 验证 Dynamic Sticky Banner 在移动端正常工作
- [ ] 确认 compare 页面包含可用的 Buy 链接
- [ ] 准备 3-5 个真实用例截图（搜索结果、clearance 对比、rebate 计算）
- [ ] 设置 Google Analytics 事件追踪（搜索、点击 Buy、compare 使用）
- [ ] 准备 FAQ 回复模板（常见问题快速响应）

## Target Subreddits
1. **r/AusRenovation** (主力) — 装修人群，高度相关
2. **r/AusFinance** — 家电购买决策，TCO 计算吸引力
3. **r/australia** — 广泛受众，周末发布
4. **r/Appliances** — 国际受众，强调 AU-specific clearances

## Post Template (r/AusRenovation)

### Title Options
- "Built a tool to check if appliances actually fit your cavity (with per-brand clearances)"
- "Sick of buying fridges that don't fit? Made a calculator for AU kitchens"
- "FitAppliance — Does your Samsung fridge need 100mm top clearance? This tool knows."

### Body
```
Hey r/AusRenovation,

I got burned buying a fridge that "should have fit" but didn't account for Samsung's 100mm top clearance requirement. Turns out every brand has different ventilation specs, and no retailer tells you upfront.

So I built **FitAppliance** — you enter your cavity dimensions, and it:
- Subtracts per-brand clearances (Samsung vs LG vs Fisher&Paykel all different)
- Checks if it fits through your doorway
- Calculates VIC/NSW rebates
- Shows 10-year energy cost

**Live:** https://fitappliance.com.au

Currently covers 2169 AU models (fridges, washers, dishwashers, dryers). Data from GEMS regulator + OEM manuals.

**Example:** 600mm cavity → Samsung needs 100mm top clearance, so max fridge height is 1700mm. LG only needs 20mm, so you get 1780mm. That's a whole shelf of difference.

Open to feedback — especially if you spot missing brands or wrong clearances.

---
*Disclaimer: Affiliate links present (ACCC-compliant). I earn commission if you buy, but the tool is free and the math is transparent.*
```

## Post Schedule
- **Day 1 (Saturday 10am AEST):** r/AusRenovation
- **Day 3 (Monday 8pm AEST):** r/AusFinance
- **Day 7 (Sunday 2pm AEST):** r/australia
- **Day 10:** r/Appliances (international)

## Engagement Strategy
- **First 2 hours:** 快速回复所有评论
- **Common objections:**
  - "Why not just measure?" → 回复：Per-brand clearances 不透明，零售商不告诉你
  - "Affiliate spam?" → 回复：工具免费，数据公开，链接标注清楚
  - "Missing my brand" → 回复：记录 + 承诺 48h 内添加
- **Proof points:**
  - 148 tests passed
  - GEMS data source
  - ACCC compliance

## Success Metrics
- **Week 1:** 500+ unique searches
- **Week 2:** 10+ organic backlinks (blogs, forums)
- **Month 1:** 5000+ searches, 2% conversion to retailer clicks

## Risk Mitigation
- **Downvote brigade:** 准备 "I'm just a dev who got burned" 真实故事
- **Mod removal:** 提前 modmail 询问是否允许 self-promotion
- **Technical issues:** 监控 Sentry，确保 uptime > 99%

## Follow-Up Content
- **Week 2:** "Update: Added 50 more brands based on your feedback"
- **Month 1:** "Case study: How FitAppliance saved me $800 on a fridge return"
```

### 执行步骤
```bash
# 创建文件
cat > docs/reddit-launch.md << 'EOF'
[上方完整内容]
EOF

# 添加到 git
git add docs/reddit-launch.md
git commit -m "docs: add Reddit launch plan for Phase 17"
```

---

## Phase 17 执行顺序

### Week 1: Dynamic Sticky Banner
1. 验证现有实现（已完成 90%）
2. 移动端测试（iPhone Safari, Android Chrome）
3. 修复任何 edge cases

### Week 2: Compare Page Links
1. 修改 `generate-comparisons.js`
2. 重新生成 38 个页面
3. 手动抽查 5 个页面的链接质量
4. 提交 PR

### Week 3: Reddit Launch Prep
1. 创建 `docs/reddit-launch.md`
2. 准备截图和 demo GIF
3. 设置 GA 事件追踪
4. 周六发布第一个 post

### Success Criteria
- [ ] Mobile sticky banner 在 3 种设备上测试通过
- [ ] 38 个 compare 页面至少 30 个包含有效 Buy 链接
- [ ] Reddit launch doc 完成并 review
- [ ] Phase 17 测试基线保持 148/148

---

## 附录：快速命令

```bash
# 测试 sticky banner（需要本地 server）
open http://localhost:8000/?cat=fridge&w=600&h=1800&d=650

# 重新生成 compare 页面
npm run generate-comparisons

# 检查 direct_url 覆盖率
jq '[.products[] | select(.direct_url != null)] | length' public/data/appliances.json

# 验证 compare 页面链接
grep -h "Buy from" pages/compare/*.html | head -20

# 提交 Phase 17 changes
git add -A
git commit -m "feat(phase17): dynamic sticky banner + compare page links + reddit launch plan"
git push origin main
```
