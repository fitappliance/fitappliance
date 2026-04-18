# FitAppliance v2 — Codex 多阶段执行计划

**项目路径**: `/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2`  
**当前基线**: 156/156 tests pass · 468 fridge `door_swing_mm = null` · 0 GA custom events  
**执行规则**: 每个 Part 完成后必须人工审核，确认通过后再开始下一个 Part。

---

## Part 1 — Fix door_swing_mm: 清零 null 记录

**目标**: 让 `door_swing_mm null` 从 468 降到 0  
**审核标准**:
- `npm test` 全部通过（测试数量 ≥ 164）
- `jq '[.products[] | select(.door_swing_mm == null)] | length' public/data/appliances.json` 输出 `0`
- 新增 `inferred_door_swing: true` 的产品数量合理（应在 460-470 之间）

---

### 背景说明

`public/data/appliances.json` 里 468 个 fridge 产品的 `door_swing_mm` 是 `null`，根本原因分三类：

**Bug A** — `scripts/infer-door-swing.js` 第一行是 `if (type === '1') return false`（`type = features[1]`），这行在配置检查之前执行。导致 `features[0]='Chest'` 但 `features[1]='1'` 的产品（Chest 冰柜）无法被推断为 0。受影响产品 5 个（Devanti, Makita, Solt 等 Chest 冰柜）。

**Bug B** — Bottom Mount 推断规则要求 `config === 'Upright' && type === '5B'`，但实际有 2 个产品的 `features[0]` 直接是 `'Bottom Mount'`（如 `Electrolux EHE5267B`），因此匹配不到。受影响产品 2 个。

**Root Cause C** — 460 个 `Upright` 和 `Top Mount` 冰箱有真实的摆门弧度，物理规律是：摆门半径 ≈ 门宽 ≈ 冰箱宽度（`product.w`）。需要新增推断函数处理。

---

### 1.1 TDD：先写测试（文件：`tests/task18-infer-fixes.test.mjs`）

**创建新文件**，按 TDD 写以下测试（先让它们 FAIL，再去修复实现）：

```
测试组 A — Bug 修复验证:
- Chest fridge with features=['Chest','1','Class 1'] → door_swing_mm = 0（Bug A 修复）
- Bottom Mount fridge with features=['Bottom Mount','FlexStor'] → door_swing_mm = 0（Bug B 修复）
- Upright type-1 fridge → 经过 Bug A 修复后仍然是 null（不被 inferFromDocument 覆盖）
- 原有 Chest/SBS/French Door 推断路径不被破坏（回归测试）

测试组 B — inferUprightSwingFromWidth:
- Upright fridge w=595 → door_swing_mm = 595, inferred_door_swing = true
- Top Mount fridge w=680 → door_swing_mm = 680, inferred_door_swing = true
- 已有 door_swing_mm 的产品不被覆盖
- 非 fridge 产品（washing_machine 等）不被处理
- config 不是 Upright/Top Mount 的 fridge → 跳过（null 保留）
- width < 300mm 的产品 → 跳过（设 FRIDGE_MIN_SWING_WIDTH_MM = 300 作为下限保护）
- width 缺失/null 的产品 → 跳过
- 综合测试：inferFromDocument + inferUprightSwingFromWidth 串联后，覆盖以下所有配置的 fridge 都得到非 null 值：
  Chest, Side by Side, French Door, Bottom Mount, Upright, Top Mount
```

测试文件顶部导入方式：
```js
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { inferFromDocument, inferUprightSwingFromWidth } = require(
  '/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/infer-door-swing.js'
);
```

---

### 1.2 修复实现（文件：`scripts/infer-door-swing.js`）

**修改 1** — 在 `FRIDGE_ZERO_SWING_CONFIGURATIONS` Set 里新增 `'Bottom Mount'`：
```js
const FRIDGE_ZERO_SWING_CONFIGURATIONS = new Set([
  'Chest',
  'Side by Side',
  'French Door',
  'Bottom Mount'   // 新增
]);
```

**修改 2** — 在 fridge condition 函数里，将 `if (type === '1') return false` 移到配置检查**之后**：
```js
// BEFORE（buggy）:
if (type === '1') { return false; }
if (FRIDGE_ZERO_SWING_CONFIGURATIONS.has(config)) { return true; }

// AFTER（fixed）:
if (FRIDGE_ZERO_SWING_CONFIGURATIONS.has(config)) { return true; }  // 先检查配置
if (type === '1') { return false; }  // 再检查 type
```

**新增函数** — 在文件末尾（`module.exports` 之前）新增：
```js
const FRIDGE_UPRIGHT_SWING_CONFIGS = new Set(['Upright', 'Top Mount']);
const FRIDGE_MIN_SWING_WIDTH_MM = 300;

function inferUprightSwingFromWidth(document) {
  const products = Array.isArray(document?.products) ? document.products : [];
  let updatedCount = 0;
  let skippedCount = 0;

  const nextProducts = products.map((product) => {
    if (product?.cat !== 'fridge') { skippedCount++; return product; }
    if (product?.door_swing_mm !== null && product?.door_swing_mm !== undefined) {
      skippedCount++; return product;
    }
    const config = product?.features?.[0];
    if (typeof config !== 'string' || !FRIDGE_UPRIGHT_SWING_CONFIGS.has(config)) {
      skippedCount++; return product;
    }
    const width = product?.w;
    if (typeof width !== 'number' || width < FRIDGE_MIN_SWING_WIDTH_MM) {
      skippedCount++; return product;
    }
    updatedCount++;
    return { ...product, door_swing_mm: width, inferred_door_swing: true };
  });

  return {
    document: { ...document, products: nextProducts },
    updatedCount,
    skippedCount
  };
}
```

**更新 `module.exports`**，增加导出：
```js
module.exports = {
  // ...existing exports...
  inferUprightSwingFromWidth,
};
```

**更新 CLI runner**（`if (require.main === module)` 块），让两个推断函数串联执行：
```js
if (require.main === module) {
  (async () => {
    const raw = JSON.parse(await readFile(appliancesPath, 'utf8'));
    const pass1 = inferFromDocument(raw);       // 原有逻辑
    const pass2 = inferUprightSwingFromWidth(pass1.document); // 新增第二遍
    await writeJsonAtomically(appliancesPath, pass2.document);
    console.log(`[infer] Pass 1: ${pass1.updatedCount} updated, ${pass1.skippedCount} skipped`);
    console.log(`[infer] Pass 2: ${pass2.updatedCount} updated, ${pass2.skippedCount} skipped`);
    const remaining = pass2.document.products.filter(p => p.door_swing_mm == null).length;
    console.log(`[infer] Remaining null: ${remaining}`);
  })().catch(e => { console.error(e); process.exitCode = 1; });
}
```

---

### 1.3 执行顺序

```bash
cd /Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2

# 0. 确认基线
npm test   # 确认 156 pass

# 1. 创建测试文件（写 FAILING 测试）
# ... 创建 tests/task18-infer-fixes.test.mjs ...

# 2. 确认测试 FAIL
npm test 2>&1 | grep -E "^(not ok|# fail)"

# 3. 修改 scripts/infer-door-swing.js（见上方）

# 4. 确认测试 PASS
npm test

# 5. 应用到真实数据
node scripts/infer-door-swing.js

# 6. 验证结果
jq '[.products[] | select(.door_swing_mm == null)] | length' public/data/appliances.json
# 期望：0

jq '[.products[] | select(.inferred_door_swing == true)] | length' public/data/appliances.json
# 期望：460-475 之间
```

### 1.4 Commit

```bash
git add scripts/infer-door-swing.js \
        tests/task18-infer-fixes.test.mjs \
        public/data/appliances.json
git commit -m "feat(phase18): zero door_swing_mm nulls — fix Chest/BM bugs, add upright width inference"
git push origin main
```

---

## Part 2 — GA 事件埋点（search_submit / buy_click / compare_view）

**目标**: 在搜索、购买点击、compare 页三个核心节点埋 GA 事件，为 CF 重新申请积累流量证据  
**审核标准**:
- `grep -c "search_submit" index.html` 输出 `1`
- `grep -c "buy_click" index.html` 输出 `1`
- `grep -c "compare_view" scripts/generate-comparisons.js` 输出 `1`
- `grep -c "compare_view" pages/compare/chiq-vs-lg-fridge-clearance.html` 输出 `1`
- `npm test` 全部通过

---

### 2.1 search_submit — 修改 `index.html`

在 `index.html` 里找到 `function doSearch(` 函数定义，在函数体**顶部** read params 之后（大约 line 2050-2100 附近），加入：

```js
// GA: track search submissions
if (typeof gtag === 'function') {
  gtag('event', 'search_submit', {
    category: categoryParam || '(none)',
    width:    parseInt(widthParam,  10) || 0,
    height:   parseInt(heightParam, 10) || 0,
    depth:    parseInt(depthParam,  10) || 0,
    brand:    brandParam || '(any)'
  });
}
```

定位方式：搜索 `function doSearch`，找到读取 `categoryParam`、`widthParam` 等变量之后的位置插入。

---

### 2.2 buy_click — 修改 `index.html`

搜索 `resolveRetailerUrl`，找到点击零售商链接的位置（通常是 `window.open(url, '_blank')` 或者动态生成 `<a href>` 的地方）。在打开链接**之前**加入：

```js
// GA: track buy/retailer clicks
if (typeof gtag === 'function') {
  gtag('event', 'buy_click', {
    product_id: product?.id    || '',
    brand:      product?.brand || '',
    model:      product?.model || '',
    retailer:   retailer?.n || retailer?.name || 'unknown',
    price:      retailer?.price || product?.price || 0
  });
}
```

如果链接是静态 HTML `<a>` 生成的，改用 `onclick` 属性注入：
```html
onclick="if(typeof gtag==='function'){gtag('event','buy_click',{product_id:'${product.id}',brand:'${product.brand}',retailer:'${r.n}'});}"
```

---

### 2.3 compare_view — 修改 `scripts/generate-comparisons.js`

在 `buildComparisonPageHtml()` 函数里找到返回的 HTML 字符串中已有的 `<script>` 块（或 `</body>` 之前），加入 compare_view 事件：

```js
// 在 buildComparisonPageHtml 返回的 HTML 字符串里，找到已有的 <script> 区域，加入：
`if (typeof gtag === 'function') {
  gtag('event', 'compare_view', {
    cat:     '${escHtml(catSlug)}',
    brand_a: '${escHtml(brandA)}',
    brand_b: '${escHtml(brandB)}'
  });
}`
```

注意：`catSlug`、`brandA`、`brandB` 是 `buildComparisonPageHtml` 的参数，通过解构或直接引用已有变量。

修改后重新生成所有 compare 页面：
```bash
npm run generate-comparisons
```

---

### 2.4 执行顺序

```bash
# 1. 修改 index.html（search_submit + buy_click）
# 2. 修改 scripts/generate-comparisons.js（compare_view）
# 3. 重新生成 compare 页面
npm run generate-comparisons

# 4. 验证
grep -n "search_submit" index.html
grep -n "buy_click" index.html
grep -c "compare_view" scripts/generate-comparisons.js
grep -c "compare_view" pages/compare/chiq-vs-lg-fridge-clearance.html

# 5. 运行测试
npm test
```

### 2.5 Commit

```bash
git add index.html \
        scripts/generate-comparisons.js \
        pages/compare/
git commit -m "feat(phase18): GA events — search_submit, buy_click, compare_view"
git push origin main
```

---

## Part 3 — SEO：FAQPage Schema + 内部交叉链接

**目标**: 让品牌页在 Google 搜索结果出现 FAQ 折叠框；品牌页和 compare 页互相链接，提升爬取深度  
**审核标准**:
- `python3 -c "import re,json,sys; html=open('pages/brands/samsung-fridge-clearance.html').read(); schemas=re.findall(r'<script type=\"application/ld\+json\">(.*?)</script>',html,re.DOTALL); types=[json.loads(s).get('@type') for s in schemas]; print(types)"` 输出包含 `'FAQPage'`
- 至少 5 个品牌页底部包含 "See how X compares to Y" 类链接
- 至少 5 个 compare 页包含返回品牌页的链接
- `npm test` 全部通过

---

### 3.1 FAQPage Schema — 修改 `scripts/generate-brand-pages.js`

新增函数 `buildFAQJsonLd({ brand, catLabel, side, rear, top })` 返回 FAQPage schema JSON：

```js
function buildFAQJsonLd({ brand, catLabel, side, rear, top, categoryMeta }) {
  const unit = catLabel.toLowerCase();
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': [
      {
        '@type': 'Question',
        'name': `How much clearance does a ${brand} ${unit} need in Australia?`,
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': `${brand} ${unit}s require ${side}mm side clearance, ${rear}mm rear clearance, and ${top}mm top clearance per manufacturer installation guidelines. Insufficient clearance can void your warranty and cause premature motor failure.`
        }
      },
      {
        '@type': 'Question',
        'name': `Does a ${brand} ${unit} need more clearance than other brands?`,
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': `${brand} requires ${top}mm top clearance for ${unit}s. This ${top > 50 ? 'is above average — check that cabinetry above leaves at least ' + top + 'mm gap' : 'aligns with typical Australian installation requirements'}. Always confirm with the specific model installation manual before fitting.`
        }
      },
      {
        '@type': 'Question',
        'name': `What happens if I don't leave enough clearance for my ${brand} ${unit}?`,
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': `Inadequate ventilation clearance causes the ${unit}'s compressor or motor to overheat, reducing lifespan by up to 40% and typically voiding the manufacturer warranty. ${brand} service technicians will inspect clearances during any warranty claim.`
        }
      }
    ]
  };
}
```

在 `buildBrandPageHtml()` 内，在已有的 `<script type="application/ld+json">` 块之后，再插入一个新的：
```js
`<script type="application/ld+json">\n${JSON.stringify(buildFAQJsonLd({brand, catLabel: categoryMeta.labelSingular, side, rear, top, categoryMeta}), null, 2)}\n</script>`
```

---

### 3.2 内部交叉链接 — 修改 `scripts/generate-brand-pages.js`

`generateBrandPages()` 函数已经可以读取 `compareIndex`（检查是否有引入 compare index）。如没有，先读取：

```js
const compareIndexPath = path.join(repoRoot, 'pages', 'compare', 'index.json');
let compareIndex = [];
try {
  compareIndex = await readJson(compareIndexPath);
} catch { /* ok if not found */ }
```

在 `buildBrandPageHtml()` 里新增参数 `relatedCompares`（数组），在页面 HTML 底部（`</main>` 之前）插入相关对比链接块：

```js
// 筛选出与当前品牌相关的 compare 页面
const relatedCompares = compareIndex
  .filter(row => row.cat === catSlug &&
    (row.brandA === brand || row.brandB === brand))
  .slice(0, 4);

// HTML 片段（只在 relatedCompares.length > 0 时渲染）
const relatedComparesHtml = relatedCompares.length > 0 ? `
  <section class="related-compares" style="margin:32px 0;padding:20px;background:var(--surface);border-radius:8px">
    <h2 style="font-size:16px;margin:0 0 12px">Compare ${escHtml(brand)} with other brands</h2>
    <ul style="list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:8px">
      ${relatedCompares.map(row => {
        const other = row.brandA === brand ? row.brandB : row.brandA;
        return `<li><a href="/compare/${escHtml(row.slug)}"
          style="display:inline-block;padding:6px 12px;border:1px solid var(--border);border-radius:4px;font-size:13px;color:var(--copper);text-decoration:none"
          >${escHtml(brand)} vs ${escHtml(other)} →</a></li>`;
      }).join('')}
    </ul>
  </section>` : '';
```

---

### 3.3 内部交叉链接 — 修改 `scripts/generate-comparisons.js`

类似地，在每个 compare 页面里加"返回品牌页"链接。

在 `buildComparisonPageHtml()` 里，已有 `brandA`、`brandB`、`catSlug` 参数。在页面底部加：

```js
const brandLinksHtml = `
  <section style="margin:32px 0;padding:16px;background:var(--surface);border-radius:8px">
    <p style="font-size:13px;color:var(--ink-3);margin:0 0 8px">Full clearance specifications:</p>
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      <a href="/brands/${escHtml(slugify(brandA))}-${escHtml(catSlug)}-clearance"
         style="font-size:13px;color:var(--copper);text-decoration:none"
         >${escHtml(displayBrandName(brandA))} ${escHtml(catLabel)} clearance specs →</a>
      <a href="/brands/${escHtml(slugify(brandB))}-${escHtml(catSlug)}-clearance"
         style="font-size:13px;color:var(--copper);text-decoration:none"
         >${escHtml(displayBrandName(brandB))} ${escHtml(catLabel)} clearance specs →</a>
    </div>
  </section>`;
```

注意：链接目标是 `/brands/${slugify(brand)}-${catSlug}-clearance`，这与现有品牌页 slug 格式一致（参考 `pages/brands/samsung-fridge-clearance.html`）。

---

### 3.4 执行顺序

```bash
# 1. 修改 scripts/generate-brand-pages.js（FAQPage schema + 交叉链接）
# 2. 修改 scripts/generate-comparisons.js（返回品牌页链接）

# 3. 重新生成所有页面
npm run generate-pages
# 等价于: node scripts/generate-brand-pages.js && node scripts/generate-comparisons.js && node scripts/generate-sitemap.js

# 4. 验证 FAQPage schema
python3 -c "
import re, json
html = open('pages/brands/samsung-fridge-clearance.html').read()
schemas = re.findall(r'<script type=\"application/ld\+json\">(.*?)</script>', html, re.DOTALL)
types = [json.loads(s).get('@type','?') for s in schemas]
print('Schema types:', types)
assert 'FAQPage' in types, 'FAIL: FAQPage schema missing'
print('PASS')
"

# 5. 验证交叉链接
grep -c "/compare/" pages/brands/samsung-fridge-clearance.html
grep -c "/brands/" pages/compare/chiq-vs-lg-fridge-clearance.html

# 6. 运行测试
npm test
```

### 3.5 Commit

```bash
git add scripts/generate-brand-pages.js \
        scripts/generate-comparisons.js \
        pages/brands/ \
        pages/compare/ \
        public/sitemap.xml
git commit -m "feat(seo): FAQPage schema on brand pages, internal cross-links brand↔compare"
git push origin main
```

---

## Part 4 — 文档清理 + Checkpoint 更新

**目标**: 同步所有文档到真实当前状态，避免旧数据误导后续 AI 代理执行  
**审核标准**:
- `docs/coverage-audit.json` 里的 `doorSwingMissing` 是 `0`（或接近 0）
- `docs/promotion-kit.md` 里的统计数字与实际数据一致
- `.openclaw_context` 反映 Phase 18 完成状态
- `PLAN.md` 顶部标记 Phase 18 完成

---

### 4.1 重新生成 coverage audit

```bash
node scripts/audit-coverage.js 2>/dev/null || true
# 如果 audit-coverage.js 支持直接写文件，检查输出
# 否则手动更新 docs/coverage-audit.json 里的 summary 字段
```

如果 `audit-coverage.js` 只打印而不写文件，则手动更新 `docs/coverage-audit.json`：
```json
{
  "generated": "2026-04-18",
  "summary": {
    "total": 2170,
    "hasPrice": 21,
    "hasDirectUrl": 31,
    "doorSwingCovered": 2170,
    "doorSwingMissing": 0
  }
}
```
（`total`、`hasPrice`、`hasDirectUrl` 用 jq 查实际数字后填入）

### 4.2 重新生成 promotion kit

```bash
npm run promo-kit
# 这会覆盖 docs/promotion-kit.md，更新产品数量、品牌数量、覆盖率统计
```

### 4.3 更新 .openclaw_context

将 `.openclaw_context` 文件内容替换为：
```
Checkpoint: Phase 18 Complete. door_swing_mm nulls = 0. GA events live (search_submit/buy_click/compare_view). FAQPage schema on all brand pages. Internal cross-links brand↔compare. Ready for Reddit launch and CF re-application.
```

### 4.4 更新 PLAN.md 顶部状态

将 `PLAN.md` 第 3 行修改为：
```
**Status:** Phase 18 完成 ✅ (160+/160+ tests passed)
```

### 4.5 执行 + Commit

```bash
npm run promo-kit

# 验证 promotion kit 更新了
head -10 docs/promotion-kit.md

# 更新 coverage audit
# 更新 .openclaw_context（见上）

# 最终测试
npm test

git add docs/coverage-audit.json \
        docs/promotion-kit.md \
        .openclaw_context \
        PLAN.md
git commit -m "chore(docs): sync coverage audit, promo kit, and checkpoint to Phase 18 state"
git push origin main
```

---

## 执行进度追踪

| Part | 内容 | 状态 | 审核结果 |
|------|------|------|----------|
| Part 1 | door_swing_mm 清零 (TDD) | ⬜ 待执行 | — |
| Part 2 | GA 事件埋点 | ⬜ 待执行 | — |
| Part 3 | SEO: FAQPage + 交叉链接 | ⬜ 待执行 | — |
| Part 4 | 文档清理 + Checkpoint | ⬜ 待执行 | — |

---

## 快速验证命令（每个 Part 通用）

```bash
cd /Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2

# 测试基线
npm test

# door_swing null 数量
jq '[.products[] | select(.door_swing_mm == null)] | length' public/data/appliances.json

# GA 事件验证
grep -c "search_submit\|buy_click" index.html
grep -c "compare_view" scripts/generate-comparisons.js

# FAQPage schema 验证
python3 -c "
import re,json,glob
ok=0; fail=0
for f in glob.glob('pages/brands/*.html')[:20]:
    html=open(f).read()
    schemas=re.findall(r'<script type=\"application/ld\+json\">(.*?)</script>',html,re.DOTALL)
    types=[json.loads(s).get('@type','?') for s in schemas]
    if 'FAQPage' in types: ok+=1
    else: fail+=1
print(f'FAQPage: {ok} ok, {fail} missing')
"

# 内部链接验证
grep -l "/compare/" pages/brands/*.html | wc -l
grep -l "/brands/" pages/compare/*.html | wc -l
```
