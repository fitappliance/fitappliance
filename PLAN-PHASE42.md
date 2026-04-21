# FitAppliance v2 — Phase 42 (Search UX + Data Quality)

> **角色**：Claude 设计 + 审核；Codex 实现。
> **沿用 Phases 19–41 全部红线**：TDD、真实数据、无人工步骤、无 PII、独立 commit + PR、无 AI-tell 文案、byte-identity 重构除外。
> **本轮主题**：用户实测反馈两大问题 — (1) 尺寸搜索逻辑不符合人类使用习惯；(2) 数据库含大量 AU 市场不相关/不可得的条目。

**顺序**：42a 先合并 → GSC 观察 ≥7 天 → 再做 42b。**禁止**并行两个 PR。

---

## Phase 42a — Search UX 重做 + 市场热度排序

### 动机

实测 `public/scripts/fit-checker.js` L67–72 `width > dims.w || height > dims.h || depth > dims.d` 硬拒绝，结合 L84–88 按体积 ASC 排序，导致：
- 必须 3 维齐全输入，缺一不可
- 2mm 超差即 0 结果（真实 install 容忍度不是 0）
- 无通风间隙语义（用户输 cavity，系统假定 0 clearance）
- 小容量 appliance 胜出，不符合"找最合适产品"直觉
- 空态无下一步提示
- 卡片 `Bosch KGN396LBAS` 是 SKU 天书，不可读

### 交付物

#### 1. 可选维度 + Category-first wizard
- 首页改 3 步：Category → Cavity dims (任一维度可空) → Results
- 每类提供 3 个常见 cavity preset chip（fridge: 600/700/900mm；dishwasher: 600×820×600；dryer/washer 类推）
- 任一维度留空 → 该轴过滤跳过

#### 2. 通风间隙内置（`data/clearance-defaults.json`）
```json
{
  "fridge":     { "rear": 25, "sides": 5,  "top": 25 },
  "dishwasher": { "rear": 5,  "sides": 0,  "top": 5  },
  "dryer":      { "rear": 25, "sides": 5,  "top": 0  },
  "washing_machine": { "rear": 15, "sides": 5, "top": 0 }
}
```
过滤语义：`appliance.w + 2*clearance.sides ≤ cavity.w`（H、D 同理）

#### 3. Tolerance 滑条
- 范围 0–20mm，默认 5mm
- 含义：允许 `appliance + clearance` 比 cavity 大 ≤ tolerance 仍列出，但标记 "tight fit — verify before purchase"
- URL param 持久化 (`tol=5`)

#### 4. Fit score 替换体积 ASC
```
axisScore(cavity, appliance, clearance) =
  clamp((cavity - appliance - 2*clearance) / cavity, -0.05, 0.5)
fitScore = geomean(axisW, axisH, axisD)
fitsTightly = fitScore >= 0 且任一轴 < 0.02
```
过滤阈值：`fitScore >= -tolerance/cavity_min`（超差在 tolerance 内仍列，带 tight 标记）

#### 5. Priority score（市场热度，内部评分）
**自动公式**（`scripts/common/popularity-score.js`）：
```
retailerReach = sum(retailerWeights[r] for r in product.retailers)
  where retailerWeights = {
    "Harvey Norman": 20, "The Good Guys": 20, "JB Hi-Fi": 18,
    "Appliances Online": 18, "Bing Lee": 10, "Betta": 8,
    "Winning Appliances": 12, "Retravision": 6, "2nds World": 4, "default": 3
  }
tierBoost  = { tier1: 30, tier2: 15, tier3: 0, dropped: -Infinity }[brand_tier]
stars10    = (product.stars || 0) * 6
stalePen   = verifiedAt older than 90d ? -10 : 0
raw        = retailerReach + tierBoost + stars10 + stalePen
priorityScore = clamp(round(raw), 0, 100)
```

#### 6. 市场可得性研究（`scripts/research-popularity.js`）
**一次性 + 可复跑**的离线脚本：
- 对每条 appliance 调用 **WebFetch** 打开 `retailers[i].url`
- 解析页面判定：
  - HTTP 200 + 页面不含 `out of stock` / `sold out` / `discontinued` → `available=true`
  - HTTP 404 / 410 → `available=false`
  - 抓 `$price` 或 `schema.org Product.offers.price` → 价格区间
  - 抓评论数（若 `schema.org aggregateRating.reviewCount` 存在）→ `reviewCount`
- 结果写入 `data/popularity-research.json`：
```json
{
  "schema_version": 1,
  "last_researched": "2026-04-21",
  "products": {
    "f6": {
      "retailersAvailable": 2,
      "retailersChecked": 3,
      "reviewCountSum": 87,
      "priceMinAud": 1299,
      "priceMaxAud": 1499,
      "researchedAt": "2026-04-21"
    }
  }
}
```
- **输入规模**：默认只跑 tier1+tier2 产品（估 ~400 条），tier3 可选。单次硬上限 500 次 WebFetch，超限停止 + 下次续跑（记 `cursor`）
- **失败宽容**：单条 fetch 失败 → 记 `error: "...", available: null`，不中断全量
- priority score 公式在有 research 结果时升级：
```
researchBoost = availableRetailers * 5 + min(reviewCountSum, 500) / 10
priorityScore(researched) = clamp(raw + researchBoost, 0, 100)
```

#### 7. 排序：`fitScore` 分组 → 组内 `priorityScore` DESC
结果列表顶部 "Popular in AU" 徽章规则：`priorityScore >= 70`

#### 8. 卡片可读性
每条 appliance 补两字段（enrich 阶段生成，不改源数据）：
- `displayName`：`${brand} ${series || ''}`.trim()，series 由规则从 model code 提取
- `readableSpec`：类别模板
  - fridge: `{capacityL}L {configuration}` (e.g. "368L Top-Mount")
  - dishwasher: `{placeSettings}-place {type}` (e.g. "15-place Built-in")
  - washing_machine: `{capacityKg}kg {loadType}` (e.g. "9kg Front Loader")
  - dryer: `{capacityKg}kg {technology}` (e.g. "8kg Heat Pump")

规则提取不到 → `series: null`（卡片只显示 brand + 类别，**不伪造**）。

#### 9. 系列字典 `data/series-dictionary.json`
```json
{
  "bosch":    { "KGN": "Serie 4", "KGE": "Serie 4", "KSV": "Serie 6", ... },
  "lg":       { "GR-":"InstaView", "GB-":"Essential", ... },
  "samsung":  { "RS":"Family Hub", "RF":"French Door", "SRS":"Bespoke" },
  "miele":    { "KFN":"Active", "KF":"Pure", ... }
}
```
首发覆盖 tier1 brands。tier2/3 后续迭代补。

#### 10. 文案红线
- 禁止 LLM 生成 `displayName` / `readableSpec`
- `audit-copy.js` 新增规则扫这两字段，命中 AI-tell 词 → fail
- `tests/readable-spec.test.mjs` 包含禁词断言

#### 11. 空态升级
```
0 exact matches.
12 fit with +5mm tolerance → [Relax to 5mm]
Or try a preset: [600mm Standard] [700mm Wide]
```

#### 12. 新卡片 HTML（byte-identity 验收标准放在 generator 层，不在 public/）
- homepage `index.html` 本身不变字节 —— 卡片渲染由 `fit-checker.js` 在客户端生成
- 客户端 HTML 模板见 spec 第 2 部分（上文卡片 ASCII 示意）

### 文件变更

**新增**
- `data/clearance-defaults.json`
- `data/series-dictionary.json`
- `data/popularity-research.json` (初始由 script 产生)
- `scripts/common/popularity-score.js`
- `scripts/common/readable-spec.js`
- `scripts/common/fit-score.js`
- `scripts/research-popularity.js`
- `scripts/enrich-appliances.js` (读原始 → 写回 `public/data/*.json` 加 `displayName`/`readableSpec`/`priorityScore` 字段)
- `public/scripts/search-core.js` (纯函数)
- `public/scripts/search-dom.js` (DOM 绑定)
- `public/scripts/ui/search-wizard.js`
- `tests/search-ux.test.mjs`
- `tests/popularity.test.mjs`
- `tests/readable-spec.test.mjs`

**改**
- `public/scripts/fit-checker.js` → 瘦身为 bootstrap shim，调用 search-core + search-dom
- `scripts/audit-copy.js` → 新增扫 enriched fields
- `package.json` → `research-popularity`、`enrich-appliances` scripts

### 验收

1. `npm test` 全绿，新增 ≥ 20 test
2. `npm run enrich-appliances` 后 `public/data/*.json` 新增字段，原字段不变
3. `npm run research-popularity` 在 sandbox 无网络时：空数组 fallback + exit 0 + 打 `docs/PHASE42A-RESEARCH-BACKFILL.md`
4. 首页 `index.html` byte-identity（html diff = 0）
5. 搜索 2 维输入（H=任何）正常出结果
6. tolerance=5mm 时 2mm 超差有 "tight fit" 标记
7. `Popular in AU` 徽章仅在 `priorityScore >= 70` 出现
8. 卡片主标题显示 `Bosch Serie 4`（不是 `KGN396LBAS`）
9. audit-copy 扫 displayName 命中禁词 → fail
10. Lighthouse mobile 分 ≥ 90（Perf/SEO/Best Practices）

### 红线

- ❌ 不用 LLM 生成 displayName/readableSpec（必须规则 + 字典）
- ❌ 不改 homepage 静态 HTML 字节
- ❌ 不假造 retailer availability（研究失败 → `available: null`，展示时按未研究处理）
- ❌ 不在 sandbox 里造 popularity-research.json 假数据 → 无网络直接 fallback

---

## Phase 42b — Data Quality Cleanup（42a 合并 + 7d GSC 观察后开 PR）

### 动机

实测 `public/data/*.json` 品牌质量问题：

| Category | 条目 | 品牌 | 主要问题 |
|---|---|---|---|
| Fridges | 1319 | 119 | `MIDEA`/`Midea` 重复、`Sub-Zero` 38 条（美国品牌）、`CHIQ` 69 条（AU 罕见） |
| Dishwashers | 354 | 86 | 44 个 ≤2 条品牌 |
| Dryers | 73 | 39 | 29 个 ≤2 条品牌 |
| Washers | 424 | 74 | 34 个 ≤2 条品牌 |

### 交付物

#### 1. AU 品牌登记表 `data/au-brand-registry.json`
```json
{
  "schema_version": 1,
  "last_updated": "2026-04-21",
  "tier1_featured": [
    "Samsung","LG","Westinghouse","Electrolux","Fisher & Paykel",
    "Bosch","Miele","Hisense","Beko","Haier","Panasonic","Smeg","Asko"
  ],
  "tier2_legitimate": [
    "Siemens","Liebherr","Neff","V-Zug","Gaggenau","Blomberg",
    "Whirlpool","Sharp","DeLonghi","ILVE","Omega"
  ],
  "tier3_house_brand": [
    "Kogan","Inalto","Esatto","Solt","Euromaid","Artusi","Heller","Vogue","Chef"
  ],
  "drop": ["Sub-Zero","CHIQ","SEIKI"]
}
```

#### 2. 品牌规范化 `data/brand-canon.json`
```json
{
  "MIDEA":"Midea",
  "ELECTROLUX":"Electrolux",
  "FISHER & PAYKEL":"Fisher & Paykel",
  "HISENSE":"Hisense",
  "WESTINGHOUSE":"Westinghouse",
  "MIELE":"Miele",
  ...
}
```

#### 3. Enrichment pipeline 扩展（`scripts/enrich-appliances.js` 42a 已建）
- **S1** 先 canonicalize brand（大小写合并）
- **S2** 查 registry：tier1/2/3 打 `brandTier`；drop list → 整条 `excluded: true`
- **S3** 若 `retailers.length === 0` → `unavailable: true`
- **S4** `unavailable || excluded` → 搜索 / 品牌页 / sitemap 排除；模型详情页保留 + 顶 banner

#### 4. SEO 保护（被 drop 的 brand 页 301）
- `public/_redirects` 或 `vercel.json` rewrites 增加 drop-brand slug → `/discontinued-brands`
- 新建一个简短 `discontinued-brands.html` 说明页
- **Sitemap 删除被排除的页面 URL**（generate-sitemap 读 enriched data）
- IndexNow 提交被删 URL（stale removal）

#### 5. 数据质量审计 `scripts/audit-data-quality.js`
扫 enriched `public/data/*.json`：
- dupe brand casing → error
- tier1 brand model count < 5 → warn（可能抓取漏）
- 零 retailer records → error
- drop-list brand 仍存在 → error
- stale verifiedAt (>90d) → warn
- 输出 `reports/data-quality-YYYYMMDD.json`

#### 6. CI gate
`.github/workflows/data-quality.yml` + 挂进 `pr.yml` workflow

#### 7. 测试 `tests/data-quality.test.mjs`
- brand-canon 合并正确（MIDEA → Midea）
- tier1 brand 带 featured 标签
- drop-list brand 被 excluded
- zero-retailer → unavailable
- redirect 映射完整

### 文件变更

**新增**
- `data/au-brand-registry.json`
- `data/brand-canon.json`
- `scripts/audit-data-quality.js`
- `pages/discontinued-brands.html`（或 generator 产出）
- `.github/workflows/data-quality.yml`
- `tests/data-quality.test.mjs`

**改**
- `scripts/enrich-appliances.js` → 加 canonicalize + tier + exclude
- `scripts/generate-*.js` → 过滤 `excluded || unavailable`
- `vercel.json` → drop-brand 301
- `public/robots.txt`? no

### 预期数据变化

- Fridges 1319 → ~650（drop CHIQ 69 + Sub-Zero 38 + SEIKI + case 合并）
- 品牌 119 → ~35
- **非 byte-identity**：这是内容变更，PR body 必须贴：
  - 被删页面 slug 清单
  - 301 目标
  - IndexNow 提交日志
  - GSC coverage 影响预估

### 验收

1. `npm test` 全绿
2. `npm run audit-data-quality` exit 0
3. `npm run generate-all` 后 `reports/data-quality-*.json` 零 error
4. 被 drop 的品牌 slug → 301 + IndexNow 提交
5. tier1 品牌不被误 drop
6. PR body 含：`count-before`/`count-after`/`dropped-brands`/`dropped-page-count`/`indexnow-submitted-urls`

### 红线

- ❌ 不在 42a 合并前开 42b PR
- ❌ 不删 tier1/tier2 brand（drop 只针对 `drop` list）
- ❌ 不硬删页面 slug → 必须 301
- ❌ 不跳 IndexNow 提交（遗留 URL 会留在 GSC coverage）
- ❌ 不在 sandbox 无网 fallback 时静默跳 IndexNow → 要打 backfill 文档

---

## 公共验收

- ✅ `npm test` 全绿（42a ≥ 20 新测试，42b ≥ 5 新测试）
- ✅ `npm run build` 无错
- ✅ 2 个独立 PR（`phase-42a-search-ux`、`phase-42b-data-quality`），不 auto-merge
- ✅ 每 PR README 一节 + commit message 附指标
- ✅ 42a 合并后 7d GSC 观察：impressions / position / LCP p75 无明显退化才开 42b

## 硬性红线汇总

1. ❌ 42a/42b 并行或乱序
2. ❌ LLM 生成产品 displayName/readableSpec（必须规则 + 字典）
3. ❌ Popularity research 伪造 availability / 价格 / reviewCount
4. ❌ homepage 静态 HTML 字节改变（42a）
5. ❌ 42b 硬删页面 slug 不做 301
6. ❌ tier1/tier2 brand 被误伤
7. ❌ Research 超 500 fetch 硬上限不 break

---
