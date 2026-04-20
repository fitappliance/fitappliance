# Fitmyappliance v2 — Development Guide

## Feature: Automated Appliance Database

**Goal**: Replace hardcoded `PRODUCTS` / `BRAND_CLEARANCE` / `REBATES` constants in `index.html`
with JSON files that are fetched at runtime and refreshed weekly via a fully automated pipeline.
Zero human intervention after initial setup.

---

## 1. Architecture Overview

```
Data Sources (automated pull, no human touch)
├── data.gov.au Energy Rating CSVs  ──→ dimensions, star ratings, kWh/year
│   (free, open gov data, monthly updates, HTTP download, no auth)
└── Commission Factory Product Feed API ──→ retail prices, affiliate URLs
    (authenticated, publishers endpoint, weekly pull)

GitHub Actions Cron (every Monday 02:00 UTC)
  └── scripts/sync.js
        ├── 1. Download & parse data.gov.au CSVs (4 categories)
        ├── 2. Fetch Commission Factory feed (prices + links)
        ├── 3. Merge by brand+model key
        ├── 4. Validate schema (required fields + type checks)
        ├── 5. Write public/data/*.json
        └── 6. git commit + push  ──→  Vercel auto-deploy triggered
```

**Runtime flow (browser)**:
```
index.html loads
  └── Promise.all([
        fetch('/data/appliances.json'),
        fetch('/data/clearance.json'),
        fetch('/data/rebates.json')
      ])
  └── renders UI (same logic, data-driven)
```

---

## 2. Data Sources

| Source | Data | URL / Endpoint | Auth | Frequency |
|---|---|---|---|---|
| data.gov.au Energy Rating | Dimensions, star rating, kWh/year, brand, model | `https://data.gov.au/data/dataset/energy-rating-for-household-appliances` (CKAN API or direct CSV) | None | Monthly (new file each month) |
| Commission Factory Feeds | Retail price AUD, affiliate URL, retailer name | `https://api.commissionfactory.com/V1/Affiliate/Functions/GetDataFeeds/` | API key (GitHub Secret) | On demand / weekly |
| Hardcoded fallback | `BRAND_CLEARANCE`, `REBATES` | `public/data/clearance.json`, `public/data/rebates.json` | N/A | Manual (rarely changes; ventilation rules are physical constants) |

**Note on clearance & rebates**: Ventilation clearance rules are set by manufacturers (rarely change).
State rebate programs change ~1x/year when budgets are announced. These two files start as static JSON
extracted from current `index.html` and are updated manually only when policy changes — that is acceptable
because they are not product data. Only `appliances.json` requires full automation.

---

## 3. JSON Schemas

### `/public/data/appliances.json`
```json
{
  "schema_version": 2,
  "last_updated": "2026-04-14",
  "products": [
    {
      "id": "f1",
      "cat": "fridge",
      "brand": "Samsung",
      "model": "SRF7500WFH French Door 740L",
      "w": 912,
      "h": 1780,
      "d": 748,
      "kwh_year": 420,
      "stars": 3,
      "price": 3499,
      "emoji": "🧊",
      "door_swing_mm": null,
      "features": ["French door", "Ice maker"],
      "retailers": [
        { "n": "Harvey Norman", "url": "https://...", "p": 3499 }
      ],
      "sponsored": false
    }
  ]
}
```

### `/public/data/clearance.json`
```json
{
  "schema_version": 1,
  "last_updated": "2026-04-14",
  "rules": {
    "fridge": {
      "__default__": { "side": 25, "rear": 25, "top": 50 },
      "Samsung":  { "side": 50, "rear": 50, "top": 100 },
      "LG":       { "side": 25, "rear": 25, "top": 50 }
    },
    "washing_machine": {
      "__default__": { "side": 0,  "rear": 50, "top": 0 }
    }
  }
}
```

### `/public/data/rebates.json`
```json
{
  "schema_version": 1,
  "last_updated": "2026-04-14",
  "rebates": {
    "VIC": { "name": "Victorian Energy Upgrades", "amount": 300, "url": "https://..." },
    "NSW": { "name": "NSW Energy Bill Relief", "amount": 250, "url": "https://..." },
    "QLD": { "name": "QLD Household Rebate", "amount": 100, "url": "https://..." },
    "SA":  { "name": "SA Home Battery Scheme", "amount": 200, "url": "https://..." }
  }
}
```

---

## 4. Task Breakdown

Tasks are ordered by dependency. Complete each in sequence.

---

### Task 1 — Extract JSON files from index.html

**Goal**: Migrate hardcoded `PRODUCTS`, `BRAND_CLEARANCE`, `REBATES` to standalone JSON files.
No functional change — this is a pure data extraction.

**Files**:
- Create `public/data/appliances.json` — full PRODUCTS array, wrapped in schema above
- Create `public/data/clearance.json` — BRAND_CLEARANCE object, wrapped in schema above
- Create `public/data/rebates.json` — REBATES object, wrapped in schema above

**Verification**:
- All three JSON files parse with `JSON.parse()` without errors
- Product count matches original `PRODUCTS.length` at extraction time
- Brand/model spot-check: Samsung SRF7500WFH French Door 740L → w:912, h:1780, d:748

**Implementation note**:
- `scripts/extract-static-data.mjs` is a migration-only extraction script for Task 1.
- It may use repository-trusted literal evaluation during the one-time migration, but it must not be reused in Task 3's automated sync pipeline.

---

### Task 2 — Refactor index.html to fetch JSON at runtime

**Goal**: Replace the three hardcoded JS constants with a `Promise.all` fetch on DOMContentLoaded.
Wrap the existing render logic in a callback that receives the loaded data.

**Files**:
- `index.html` — remove `const PRODUCTS = [...]`, `const BRAND_CLEARANCE = {...}`,
  `const REBATES = {...}`; add fetch bootstrap at top of `<script>` block:

```js
// Bootstrap: load data then initialise app
Promise.all([
  fetch('/data/appliances.json').then(r => r.json()),
  fetch('/data/clearance.json').then(r => r.json()),
  fetch('/data/rebates.json').then(r => r.json())
]).then(([appData, clearData, rebateData]) => {
  const PRODUCTS       = appData.products;
  const BRAND_CLEARANCE = clearData.rules;
  const REBATES        = rebateData.rebates;
  // ... rest of existing app logic unchanged
  initApp(PRODUCTS, BRAND_CLEARANCE, REBATES);
}).catch(err => {
  console.error('Data load failed', err);
  document.getElementById('results').innerHTML =
    '<p class="error">Unable to load appliance data. Please refresh.</p>';
});
```

- Wrap existing app logic in `function initApp(PRODUCTS, BRAND_CLEARANCE, REBATES) { ... }`

**Verification**:
- Open site locally via `npx vercel dev`
- Network tab shows 3 successful JSON fetches
- Dimension matching, rebate calculator, TCO sort all work identically to before
- With DevTools offline mode ON: error message appears (not a blank page)

---

### Task 3 — Build the data sync script

**Goal**: Create `scripts/sync.js` — a Node.js script that pulls from data.gov.au and
Commission Factory, merges the data, validates it, and writes the JSON files.

**Files**:
- Create `scripts/sync.js`
- Create `scripts/schema.js` — field validators（字段合法范围见下方"字段范围表"）
- Create `scripts/sources/energyrating.js` — downloads & parses data.gov.au CSV
- Create `scripts/sources/commissionfactory.js` — fetches CF product feed via API
- Create `scripts/utils/circuit-breaker.js` — 断路器逻辑（见下方 Task 3.1）

**Script logic**:
```
1. energyrating.js
   - Fetch CKAN dataset metadata for each category to get latest CSV URL
   - Download CSV (csv-parse)
   - Map columns: Registration Number, Brand, Model Name, Width, Height, Depth,
     Annual Energy Consumption, Star Rating
   - Return array of normalized energy records

2. commissionfactory.js
   - GET https://api.commissionfactory.com/V1/Affiliate/Functions/GetDataFeeds/
     Headers: { Authorization: Bearer $CF_API_KEY }
   - Parse response: ProductID, ProductName, Price, DeepLink, MerchantName
   - Return array of price records

3. sync.js
   - Merge by fuzzy brand+model match (lowercase, strip special chars)
   - For each matched product: build full product object per schema
   - Unmatched energy records: include with price=null (hidden from UI until priced)
   - Run circuit-breaker.js checks BEFORE writing (见 Task 3.1)
   - If circuit breaker trips: exit(1)，existing JSON is NOT overwritten
   - Write public/data/appliances.json with updated last_updated timestamp
   - schema.js validates: all required fields present, values within allowed ranges
   - If validation fails: exit with code 1
```

**Environment variables** (set as GitHub Secrets, local `.env` for development):
```
CF_API_KEY=<Commission Factory API key>
```

**Verification**:
- `node scripts/sync.js` locally (with test CF key or mock) exits code 0
- Output `public/data/appliances.json` is valid JSON and passes `node scripts/schema.js`
- `last_updated` field reflects today's date
- Running twice produces no diff if source data hasn't changed (idempotent)

---

### Task 3.1 — Defensive Sync Strategy（防护性同步策略）

> 本节为 Task 3 的强制补充。所有以下策略必须在 `sync.js` 和 `circuit-breaker.js` 中实现，
> 并在 Task 3 完成前通过对应测试。

---

#### 防护层 1 — Rate Limit 处理（指数退避 + Retry-After 遵守）

两个外部源的频率特征不同，需差异化处理：

| 数据源 | 频率限制 | 响应头 | 策略 |
|---|---|---|---|
| data.gov.au (CKAN) | 无官方限制，但需礼貌访问 | 无 `Retry-After` | 指数退避，最多 3 次重试 |
| Commission Factory API | 有限速（状态码 `429`） | `Retry-After: N`（秒） | 读取 `Retry-After` 精确等待后重试 |

**实现规范**（在 `scripts/utils/fetch-utils.js` 中统一封装）：

```js
// scripts/utils/fetch-utils.js
export async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, options);

    // 遵守 Retry-After（Commission Factory 会返回此 header）
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '60', 10);
      console.warn(`[rate-limit] 429 received, waiting ${retryAfter}s before retry ${attempt + 1}/${maxRetries}`);
      await sleep(retryAfter * 1000);
      continue;
    }

    // 5xx 服务器错误：指数退避 + 抖动
    if (res.status >= 500 && attempt < maxRetries - 1) {
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      console.warn(`[retry] HTTP ${res.status} on attempt ${attempt + 1}, retrying in ${delay.toFixed(0)}ms`);
      await sleep(delay);
      continue;
    }

    return res; // 2xx / 4xx（非 429）直接返回，由调用方判断
  }
  throw new Error(`[fetch-failed] Max retries (${maxRetries}) exceeded for: ${url}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

**规则**：
- `energyrating.js` 和 `commissionfactory.js` 必须通过 `fetchWithRetry` 发起所有请求，禁止直接调用 `fetch()`
- 重试日志必须输出到 `stderr`（GitHub Actions 可捕获），不得静默吞掉

---

#### 防护层 2 — 脏数据隔离（字段范围白名单校验）

外部 API 返回的数据不可信，特别是 `door_swing_mm` 这类物理量（Task 1 审计中曾出现 63.5mm 的错误值）。
每个数值字段都有物理上合理的范围，超出范围即为脏数据。

**字段合法范围表**（`scripts/schema.js` 必须实现这些断言）：

| 字段 | 类型 | 最小值 | 最大值 | 说明 |
|---|---|---|---|---|
| `w` | integer | 200 | 2500 | 宽度（mm），家电合理宽度范围 |
| `h` | integer | 200 | 2500 | 高度（mm） |
| `d` | integer | 200 | 1500 | 深度（mm） |
| `door_swing_mm` | number | 400 | 1200 | 开门所需侧向空间，63.5mm 将被拦截 |
| `kwh_year` | number | 50 | 2000 | 年耗电量（kWh） |
| `stars` | integer | 1 | 6 | 澳洲能效星级 |
| `price` | number | 1 | 100000 | 零售价（AUD） |

**脏数据处理规则**：

```js
// scripts/schema.js
export function validateProduct(product) {
  const errors = [];

  const RANGES = {
    w:            [200,  2500],
    h:            [200,  2500],
    d:            [200,  1500],
    door_swing_mm:[400,  1200],
    kwh_year:     [50,   2000],
    stars:        [1,    6],
    price:        [1,    100000],
  };

  for (const [field, [min, max]] of Object.entries(RANGES)) {
    const val = product[field];
    if (val == null) {
      errors.push(`missing required field: ${field}`);
    } else if (typeof val !== 'number' || val < min || val > max) {
      errors.push(`${field}=${val} is outside valid range [${min}, ${max}]`);
    }
  }

  return errors; // [] = clean, [...] = dirty
}
```

**处理策略**：单条产品记录脏数据 → **丢弃该记录 + 记录警告日志**，继续处理其余记录。
不因单条脏数据中断整个同步（由断路器的异常率阈值兜底）。

---

#### 防护层 3 — 断路器（Circuit Breaker）

断路器在写入 JSON **之前**执行，检测三类致命异常。任一触发 → `exit(1)`，现有 JSON **不被覆盖**。

```
断路器状态机：

CLOSED（正常）──→ 所有检查通过 ──→ 写入 JSON ──→ 触发 Vercel 部署
     │
     └──→ 任一规则触发 ──→ OPEN（熔断）──→ exit(1)
                                      ──→ 现有 JSON 保持不变
                                      ──→ GitHub Actions 标红
                                      ──→ 邮件通知（GH Actions 默认行为）
```

**三条熔断规则**（`scripts/utils/circuit-breaker.js`）：

```js
// scripts/utils/circuit-breaker.js
export class CircuitBreakerError extends Error {
  constructor(code, message) {
    super(`[circuit-breaker:${code}] ${message}`);
    this.code = code;
  }
}

export function runCircuitBreaker(newProducts, existingProducts) {

  // 规则 1：Schema 结构突变检测
  // 如果外部 API 返回数据缺少关键顶层字段，说明格式已变更
  const REQUIRED_FIELDS = ['id', 'cat', 'brand', 'model', 'w', 'h', 'd', 'kwh_year', 'stars'];
  if (newProducts.length > 0) {
    const sampleKeys = Object.keys(newProducts[0]);
    const missingFields = REQUIRED_FIELDS.filter(f => !sampleKeys.includes(f));
    if (missingFields.length > 0) {
      throw new CircuitBreakerError(
        'SCHEMA_MUTATION',
        `External API response is missing required fields: [${missingFields.join(', ')}]. ` +
        `This indicates a breaking schema change upstream. Manual inspection required.`
      );
    }
  }

  // 规则 2：数据量骤降检测（防止空响应或大规模数据丢失）
  if (existingProducts.length > 0) {
    const retentionRate = newProducts.length / existingProducts.length;
    if (retentionRate < 0.8) {
      throw new CircuitBreakerError(
        'DATA_LOSS',
        `New dataset has ${newProducts.length} products vs ${existingProducts.length} existing ` +
        `(retention ${(retentionRate * 100).toFixed(1)}%, threshold 80%). ` +
        `Possible cause: empty API response or upstream data purge.`
      );
    }
  }

  // 规则 3：字段异常率检测（脏数据比例过高）
  const { validateProduct } = await import('./schema.js');
  const anomalousProducts = newProducts.filter(p => validateProduct(p).length > 0);
  const anomalyRate = anomalousProducts.length / newProducts.length;
  if (anomalyRate > 0.30) {
    throw new CircuitBreakerError(
      'HIGH_ANOMALY_RATE',
      `${anomalousProducts.length}/${newProducts.length} products (${(anomalyRate * 100).toFixed(1)}%) ` +
      `have out-of-range fields, exceeding 30% threshold. ` +
      `First anomalous record: ${JSON.stringify(anomalousProducts[0])}`
    );
  }
}
```

**断路器在 sync.js 中的调用顺序**：

```
1. 拉取外部数据（energyrating + CF）
2. 合并 & 构建新产品列表
3. 读取现有 public/data/appliances.json（作为 baseline）
4. runCircuitBreaker(newProducts, existingProducts)  ← 在写入前执行
5. 逐条 validateProduct() 过滤脏数据，记录被丢弃的条目
6. 写入 public/data/appliances.json
```

---

### Task 4 — Set up GitHub Actions cron workflow

**Goal**: Automate weekly execution of `scripts/sync.js`. On success, commit updated JSON
and push to `main`, triggering Vercel auto-deploy. On circuit breaker trip or sync failure,
halt immediately and preserve existing data — **do not deploy stale or corrupted data**.

**Files**:
- Create `.github/workflows/sync-appliances.yml`

```yaml
name: Sync Appliance Data

on:
  schedule:
    - cron: '0 2 * * 1'   # Every Monday 02:00 UTC (Mon 12:00 AEDT)
  workflow_dispatch:        # Allow manual trigger from GitHub UI

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run sync script
        # exit 1 from circuit breaker or schema validation will fail this step,
        # halting the workflow before any git commit is made.
        env:
          CF_API_KEY: ${{ secrets.CF_API_KEY }}
        run: node scripts/sync.js

      - name: Commit updated data if changed
        # Only reached if sync script exits 0 (all circuit breaker checks passed)
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add public/data/appliances.json
          git diff --cached --quiet || git commit -m "chore: auto-sync appliance data $(date +%Y-%m-%d)"

      - name: Push changes
        uses: ad-m/github-push-action@v0.8.0
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          branch: main
```

**断路器熔断时 GitHub Actions 的行为**：

| sync.js 退出码 | Actions 步骤状态 | 后续步骤 | Vercel 部署 | 现有 JSON |
|---|---|---|---|---|
| `0`（正常） | ✅ success | 执行 commit + push | 触发新部署 | 被新数据替换 |
| `1`（熔断/校验失败） | ❌ failure | **跳过**（不 commit，不 push） | **不触发** | **保持不变** |

**收到失败通知后的手动处置步骤**：
1. 进入 GitHub Actions → 点击失败的 run → 查看 `Run sync script` 步骤的 stderr 日志
2. 根据断路器错误码定位问题：
   - `SCHEMA_MUTATION` → 检查上游 API 是否修改了响应格式，更新 `scripts/sources/` 中的字段映射
   - `DATA_LOSS` → 检查 data.gov.au 或 CF API 是否返回空集合，可能是临时故障，次日重试
   - `HIGH_ANOMALY_RATE` → 检查 `schema.js` 中字段范围是否需要调整，或上游数据单位发生变化
3. 问题修复后，通过 `workflow_dispatch` 手动触发重新同步

**GitHub Secrets to configure** (Settings → Secrets → Actions):
- `CF_API_KEY` — Commission Factory affiliate API key

**Verification**:
- Trigger manually via `workflow_dispatch` from GitHub Actions tab
- Workflow completes green
- New commit appears on `main` with message `chore: auto-sync appliance data YYYY-MM-DD`
- Vercel deployment log shows a new deploy triggered by the push
- Live site `last_updated` in footer reflects the new date
- **断路器验证**：在本地将 `newProducts` 数组清空，运行 `node scripts/sync.js`，
  确认脚本以 exit code 1 退出且 `appliances.json` 未被修改

---

### Task 5 — Add package.json and script dependencies

**Goal**: Add `package.json` with sync script dependencies. Keep zero runtime dependencies
(browser bundle stays vanilla JS).

**Files**:
- Create `package.json` (devDependencies only — not bundled into the site):

```json
{
  "name": "fitappliance-v2",
  "version": "2.0.0",
  "private": true,
  "scripts": {
    "sync": "node scripts/sync.js",
    "validate": "node scripts/schema.js"
  },
  "devDependencies": {
    "csv-parse": "^5.5.6",
    "node-fetch": "^3.3.2"
  }
}
```

**Verification**:
- `npm install` completes without errors
- `npm run sync` runs the sync script end-to-end
- `npm run validate-schema` validates current JSON files and exits 0

---

### Task 6 — Display data freshness in the UI

**Goal**: Show users when the appliance data was last updated. Builds trust and
confirms the pipeline is working.

**Files**:
- `index.html` — read `appData.last_updated` after fetch and inject into footer:

```js
document.getElementById('data-updated').textContent =
  'Appliance data updated: ' + appData.last_updated;
```

- Add `<span id="data-updated"></span>` to the existing footer element

**Verification**:
- Footer displays `Appliance data updated: 2026-04-14` (or current date after sync)
- After a cron run, the date updates automatically on next page load

---

## 5. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| data.gov.au CSV URL format changes | Sync fails silently | Use CKAN API to discover latest file URL dynamically (not hardcoded path) |
| Commission Factory API returns empty feed | Products have no prices | Script detects empty price array, logs warning, keeps previous prices from existing JSON |
| Brand/model fuzzy match fails | Appliance missing from output | Unmatched products logged to Actions output; existing known products preserved via merge-not-replace |
| Schema validation fails | Exit code 1, no deploy | Existing `appliances.json` untouched; Actions sends failure email via GitHub notification |
| Vercel build not triggered | Stale data on live site | Confirm Vercel project has "Auto Deploy on Push" enabled for `main` branch |
| data.gov.au dimensions not in CSV | Dimension matching broken | Fallback: retain existing hardcoded dimension data for known models; new models flagged as `"dims_verified": false` |
| CF_API_KEY secret missing/expired | Auth failure on price fetch | Script exits 1 with clear error message; existing JSON preserved |
| `fetch()` failure in browser | Blank product list | Error boundary in `initApp` shows user-facing message; consider `Cache-Control` on Vercel so stale JSON is served |

---

## 6. Development Standards

> 本章节记录 Task 1 & 2 重构周期中通过代码审计提炼的工程规范。
> 所有后续任务（Task 3 起）**必须遵守**这些规则，以避免重蹈覆辙。

---

### 规范 1 — 展示层与数据层严格分离

**来源**：Task 1 审计发现 `rebates.json` 中存储了 `"color": "var(--green)"` 等 CSS 变量。

**规则**：
- JSON 数据文件**只允许**存储业务数据（金额、名称、状态码、尺寸等）
- 颜色、字体、样式等一切展示属性**必须**在 UI 层（`index.html`）管理
- 颜色映射通过 state 键查表实现，不得写入 JSON

```js
// ✅ 正确：UI 层管理颜色映射
const STATE_COLORS = {
  VIC: 'var(--green)', NSW: 'var(--blue)',
  QLD: 'var(--amber)', SA:  'var(--copper)'
};

// ❌ 错误：数据文件中写入 CSS 变量
{ "VIC": { "amount": 300, "color": "var(--green)" } }
```

**适用范围**：所有 `public/data/*.json` 文件及 Task 3 `sync.js` 的输出字段定义。

---

### 规范 2 — 缺省值回退使用空值合并，不使用逻辑或

**来源**：Task 2 审计发现 `getClearance()` 中 `cat[brand] || cat['__default__']` 会将合法的 `0` 值（如侧面间隙 0mm）错误替换为默认值。

**规则**：
- 当属性值可能合法为 `0`、`false`、`""` 时，**必须使用 `??`（空值合并）**，禁止使用 `||`
- `||` 仅用于确认值"存在且有意义"的场景（如字符串非空判断）

```js
// ✅ 正确：0 是合法间隙值，不应被覆盖
const rule = BRAND_CLEARANCE[brand] ?? BRAND_CLEARANCE['__default__'];

// ❌ 错误：0 被误判为 falsy，回退到默认值
const rule = BRAND_CLEARANCE[brand] || BRAND_CLEARANCE['__default__'];
```

**适用范围**：`index.html` 中所有 clearance/rebate/config 的查表逻辑；Task 3 `sync.js` 的数据合并逻辑。

---

### 规范 3 — 禁止在 Git 仓库中追踪 Symlink

**来源**：Task 1 审计发现 `data -> public/data` symlink 被提交到 git，在 Windows 环境下会破坏本地开发和测试。

**规则**：
- 不得将 symlink 提交到版本控制
- 本地开发使用 `vercel dev`（而非 `python3 -m http.server`）作为标准开发服务器，`/data/(.*)` 路由由 `vercel.json` 自动处理
- 已存在的 symlink 应加入 `.gitignore`

```bash
# ✅ 正确：本地开发命令
vercel dev   # 自动应用 vercel.json 路由规则

# ❌ 错误：会导致 /data/ 路径 404
python3 -m http.server
```

**适用范围**：所有开发者本地环境；CI/CD 环境无此问题（Vercel 托管）。

---

### 规范 4 — 测试文件禁止复制业务逻辑，必须 import

**来源**：Task 1 审计发现 `extractConstLiteral()` / `evaluateLiteral()` 在脚本和测试文件中各自存在一份完全相同的 96 行实现。

**规则**：
- 测试文件**禁止复制**被测模块的内部实现
- 需要测试内部逻辑时，将该逻辑从模块中 export，再在测试中 import
- 如果无法 import（如 CLI 入口逻辑），则通过进程调用（`child_process.exec`）测试，而非复制代码

```js
// ✅ 正确：测试文件 import 被测模块
import { extractSourceData, buildDocuments } from '../scripts/extract-static-data.mjs';

// ❌ 错误：在测试文件中复制同一份实现
function extractConstLiteral(source, constName) { /* 96 行重复代码 */ }
```

**适用范围**：`tests/` 下所有测试文件；Task 3 新增的 `scripts/sources/*.js` 也应遵守此规范。

---

### 规范 5 — 一次性迁移脚本必须标注生命周期

**来源**：Task 1 审计发现 `scripts/extract-static-data.mjs` 使用 `vm.runInNewContext`（等同 eval）且无任何生命周期说明，将长期存在于代码库中造成安全隐患。

**规则**：
- 仅用于初始化或迁移的脚本，文件顶部**必须**添加生命周期注释
- 注明：用途、何时可删除、替代方案

```js
// ⚠️  MIGRATION SCRIPT — 一次性使用
// 用途：从 index.html 提取硬编码数据到 public/data/*.json
// 生命周期：Task 3 (sync.js) 上线并完成首次同步后即可删除
// 替代方案：scripts/sync.js 承接后续所有数据更新
```

---

### Task 3 执行前自查清单

在开始编写 `scripts/sync.js` 及相关文件前，确认以下各项：

- [x] **规范 1**：`sync.js` 输出的 JSON 字段定义中无任何 CSS 变量、颜色值、样式属性
- [x] **规范 2**：数据合并逻辑中所有回退操作使用 `??` 而非 `||`
- [x] **规范 3**：不创建任何 symlink；本地测试通过 `vercel dev` 验证
- [x] **规范 4**：`scripts/sources/*.js` 中的核心解析函数全部 export；测试文件通过 import 复用
- [x] **规范 5**：如有临时调试脚本，在文件顶部添加生命周期注释

---

## Task 6 — Frontend Enhancement

**目标**：在不引入构建工具的前提下，提升 `index.html` 的可维护性与用户体验。  
所有改动必须在零构建（no build step）约束下完成，使用浏览器原生 ES 模块（`<script type="module">`）。

---

### Task 6.1 — UI 模块化（Extract render functions to ES modules）

**背景**：当前所有渲染逻辑集中在 `initApp()` 闭包（`index.html` 第 1017–1377 行），单函数超过 360 行，违反 <800 行文件、<50 行函数原则。

**目标文件结构**：
```
scripts/ui/
├── product-card.js   # buildCard(), buildRow(), starsHtml(), warningsHtml()
├── freshness.js      # renderFreshnessBanner()
└── filters.js        # buildBrandOptions(), buildStarsOptions()
```

**执行步骤**：

1. 新建 `scripts/ui/product-card.js`，将以下函数**原样**从 `index.html` 提取（不改逻辑）：
   - `starsHtml(n, total = 6)`
   - `warningsHtml(p)` — **暂不修改逻辑**，Task 6.3 再改
   - `buildCard(p, clearanceMm)`
   - `buildRow(p, clearanceMm)`
   - 导出：`export { starsHtml, warningsHtml, buildCard, buildRow }`

2. 新建 `scripts/ui/freshness.js`，包含 `renderFreshnessBanner(lastUpdated)` 占位函数（实现在 Task 6.2 填充）：
   ```js
   export function renderFreshnessBanner(lastUpdated) { /* Task 6.2 */ }
   ```

3. 新建 `scripts/ui/filters.js`，包含 `buildBrandOptions(products, cat)` 占位函数（实现在 Task 6.4 填充）：
   ```js
   export function buildBrandOptions(products, cat) { /* Task 6.4 */ }
   ```

4. 修改 `index.html`：
   - 将 `<script>` 改为 `<script type="module">`
   - 在文件顶部（Bootstrap 块之前）添加 import：
     ```html
     <script type="module">
       import { buildCard, buildRow, starsHtml, warningsHtml } from '/scripts/ui/product-card.js';
       import { renderFreshnessBanner } from '/scripts/ui/freshness.js';
       import { buildBrandOptions } from '/scripts/ui/filters.js';
       // ... 其余 initApp 逻辑保留
     </script>
     ```
   - 删除 `index.html` 中已提取的函数体（`starsHtml`、`warningsHtml`、`buildCard`、`buildRow`）

**验收标准**：
- `npm run lint` 通过（lint 脚本需同时覆盖 `scripts/ui/*.js`，在 `package.json` 的 lint 命令末尾追加 `scripts/ui/*.js`）
- 浏览器打开 `vercel dev` 本地服务，功能与改前一致

---

### Task 6.2 — 数据新鲜度 Banner

**背景**：`appliances.json` 有 `last_updated` 字段，但 UI 从未展示，用户无法知道数据是否过期。

**实现位置**：`scripts/ui/freshness.js` → `renderFreshnessBanner(lastUpdated)`

**逻辑规范**：
```js
/**
 * @param {string} lastUpdated  ISO date string from appliances.json, e.g. "2026-04-14"
 */
export function renderFreshnessBanner(lastUpdated) {
  const banner = document.getElementById('freshness-banner');
  if (!banner) return;

  const updatedDate = new Date(lastUpdated);
  const today = new Date();
  // 计算天数差（忽略时区，只比较日期部分）
  const msPerDay = 86_400_000;
  const daysDiff = Math.floor((today - updatedDate) / msPerDay);

  if (daysDiff > 7) {
    banner.textContent = `⚠️ Product data last updated ${daysDiff} days ago — some prices may have changed.`;
    banner.classList.add('banner-stale');
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }
}
```

**HTML 改动**（`index.html`）：
- 在 `<section id="results">` 正上方插入：
  ```html
  <div id="freshness-banner" class="freshness-banner" hidden></div>
  ```
- 在 CSS 区块添加样式：
  ```css
  .freshness-banner {
    background: var(--amber, #f59e0b);
    color: #fff;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    margin: 0.75rem 0;
    font-size: 0.875rem;
  }
  ```

**调用时机**：在 `Promise.all` 成功回调中，拿到 `appData` 后立即调用：
```js
renderFreshnessBanner(appData.last_updated);
```

**验收标准**：
- 将 `appliances.json` 中的 `last_updated` 手动改为 8 天前的日期，刷新页面，Banner 可见且文案正确
- 将日期恢复为今天，Banner 隐藏

---

### Task 6.3 — `door_swing_mm: null` 状态渲染

**背景**：当前 `warningsHtml(p)` 和 `buildRow(p)` 均使用 `if (p.door_swing_mm > 0)` 判断，`null` 值被静默忽略，用户误以为该产品无需预留开门空间。

**规范**：`door_swing_mm` 的三种语义：
| 值 | 含义 | UI 展示 |
|---|---|---|
| `null` | 尚未研究 | 琥珀色 tag："⏳ Door clearance: pending research" |
| `0` | 已研究，无需额外空间 | 无 tag（静默） |
| `400–1200` | 已研究，需预留 N mm | 现有红色警告 tag |

**修改 `warningsHtml(p)`**（位于 `scripts/ui/product-card.js` 提取后）：
```js
function warningsHtml(p) {
  const parts = [];

  if (p.door_swing_mm === null) {
    parts.push('<span class="tag tag-amber">⏳ Door clearance: pending research</span>');
  } else if (p.door_swing_mm > 0) {
    parts.push(`<span class="tag tag-red">🚪 Needs ${p.door_swing_mm}mm door swing clearance</span>`);
  }
  // door_swing_mm === 0 → no tag

  return parts.join('');
}
```

**同步修改 `buildRow(p)`** 中的 door_swing 判断（逻辑同 `warningsHtml`，渲染形式为列表行内联）：
```js
// 替换 if (p.door_swing_mm > 0) { ... }
if (p.door_swing_mm === null) {
  rowParts.push('<span class="tag tag-amber">⏳ Clearance: pending</span>');
} else if (p.door_swing_mm > 0) {
  rowParts.push(`<span class="tag tag-red">🚪 ${p.door_swing_mm}mm clearance</span>`);
}
```

**CSS**（如不存在 `.tag-amber`，在 `index.html` CSS 区块中添加）：
```css
.tag-amber { background: var(--amber, #f59e0b); color: #fff; }
```

**验收标准**：
- 在 `appliances.json` 中将任一产品的 `door_swing_mm` 设为 `null`，该产品卡片显示琥珀色 tag
- 设为 `0`，无 tag
- 设为 `600`，显示红色 tag "Needs 600mm door swing clearance"

---

### Task 6.4 — 动态品牌筛选

**背景**：`index.html` 第 700–708 行的品牌 `<select>` 中，选项为硬编码 HTML：
```html
<option value="">All brands</option>
<option value="Samsung">Samsung</option>
<!-- ... -->
```
每次新增品牌都需手动改 HTML。

**实现位置**：`scripts/ui/filters.js` → `buildBrandOptions(products, cat)`

**逻辑规范**：
```js
/**
 * @param {Array} products  全量 PRODUCTS 数组
 * @param {string} cat      当前分类 tab（e.g. "fridge"）
 * @returns {string}        <option> HTML 片段
 */
export function buildBrandOptions(products, cat) {
  const brands = [...new Set(
    products
      .filter(p => p.cat === cat)
      .map(p => p.brand)
  )].sort();

  return '<option value="">All brands</option>' +
    brands.map(b => `<option value="${b}">${b}</option>`).join('');
}
```

**调用时机**（`index.html` 的 `initApp` 中）：
1. 应用初始化时调用一次（使用初始 `currentCat`）
2. 每次切换分类 tab 时重新调用并更新 `<select id="brandSel">` 的 `innerHTML`

**HTML 改动**：
- 删除 `index.html` 第 700–708 行的硬编码 `<option>` 列表
- 保留 `<select id="brandSel">` 元素
- 初始化时通过 JS 注入 options

**验收标准**：
- 初始分类（冰箱）的品牌 select 自动填充 PRODUCTS 中所有 `cat === "fridge"` 的品牌
- 切换到"洗衣机"分类，品牌 select 自动更新为该分类的品牌列表
- 选中某品牌后切换分类，select 自动重置为"All brands"

---

### Task 6.5 — 能效筛选增强

**背景**：
- `doSearch()` 的排序选项（`<select id="sortSel">`）中没有"最低 kWh"选项
- 没有"最低星级"筛选，用户无法直接找到 4 星及以上产品

**6.5a — 新增"Lowest kWh"排序**

在 `<select id="sortSel">` 中追加选项：
```html
<option value="kwh_asc">Lowest kWh (most efficient)</option>
```

在 `doSearch()` 的排序 switch/if 中添加对应分支：
```js
case 'kwh_asc':
  filtered.sort((a, b) => (a.kwh_year ?? Infinity) - (b.kwh_year ?? Infinity));
  break;
```

> `?? Infinity` 确保 `kwh_year: null` 的产品排在末尾而非最前。

**6.5b — 新增"最低星级"筛选**

在筛选表单中新增：
```html
<label for="starsSel">Min. energy rating</label>
<select id="starsSel">
  <option value="0">Any rating</option>
  <option value="3">3★ &amp; above</option>
  <option value="4">4★ &amp; above</option>
  <option value="5">5★ &amp; above</option>
</select>
```

在 `doSearch()` 的筛选逻辑中添加：
```js
const minStars = parseInt(document.getElementById('starsSel').value, 10) || 0;
if (minStars > 0) {
  filtered = filtered.filter(p => (p.stars ?? 0) >= minStars);
}
```

**验收标准**：
- 选择"Lowest kWh"排序后，结果按 `kwh_year` 升序排列；`kwh_year: null` 的产品在末尾
- 选择"4★ & above"后，结果中所有产品 `stars >= 4`
- 刷新页面，筛选器默认值为"Any rating"

---

### Task 6 — 执行顺序与依赖

```
6.1 (模块化，提取函数)
  └─ 6.3 (修改 warningsHtml/buildRow)  ← 依赖 6.1 已提取
  └─ 6.4 (动态品牌 filter)             ← 依赖 6.1 的模块结构
6.2 (freshness banner)                 ← 独立，可与 6.1 并行
6.5 (energy filter)                    ← 独立，可与 6.1–6.4 并行
```

**Codex 执行建议**：
1. 先执行 6.1（模块提取），不改任何逻辑，只做机械搬移
2. 验证 lint + 页面功能一致后，再执行 6.3（改 null 逻辑）
3. 6.2、6.4、6.5 可在 6.1 完成后并行执行

---

## Task 7: Database Expansion & No-Key Operations

### 7.1 Strategic context

- Commission Factory (CF) API is a future enhancement, not a prerequisite.
- Current core data source is Energy Rating Australia (GEMS) active register.
- Goal: AU's most complete appliance dimension database.
- Current counts (as of `2026-04-14`):
  - Fridge `1319`
  - Washing Machine `423`
  - Dishwasher `354`
  - Dryer `73`
  - Total `2169`

### 7.2 Running sync without CF key

```bash
npm run sync
# or explicitly
node scripts/sync.js --skip-cf
```

Success criteria (no CF key):

- ✅ Exit code `0`
- ✅ `public/data/appliances.json` updates with fresh GEMS data
- ✅ Log line includes: `[sync] CF_API_KEY not configured … CommissionFactory sync skipped`
- ✅ No products removed (Energy Rating source is additive-only)
- ✅ `npm test` passes (`21/21` gate)

Failure criteria (must not happen in no-key mode):

- ❌ Exit code `1`
- ❌ `CF_API_KEY required` (or equivalent hard-stop)
- ❌ Existing products deleted

### 7.3 Clearance.json maintenance

- Every brand in `appliances.json` must have an explicit entry in `clearance.json`.
- Coverage check command:

```bash
node -e "const fs=require('node:fs');const a=JSON.parse(fs.readFileSync('./public/data/appliances.json','utf8')).products;const c=JSON.parse(fs.readFileSync('./public/data/clearance.json','utf8')).rules;const missing=[];for(const p of a){const cat=c[p.cat]??{};if(!cat[p.brand])missing.push(`${p.cat}:${p.brand}`);}console.log(`${new Set(missing).size} brands use __default__`);"
```

- Expected output: `0 brands use __default__`.
- `__default__` is a safety net, not the preferred steady-state path.
- For any new brand: source clearance from manufacturer installation PDF first; if unavailable, use `__default__` and open a GitHub issue.

### 7.4 Bulk import workflow

- `scripts/bulk-import.js` handles initial large-scale ingestion.
- Do not run bulk import in CI; treat it as migration tooling.
- After bulk import, always run `npm test` before commit.

### 7.5 Future: CF integration reactivation

When `CF_API_KEY` becomes available:

1. Set GitHub Actions secret `CF_API_KEY`.
2. Remove `--skip-cf` from workflow command if present.
3. Verify `npm run sync` with key exits `0` and adds retailer data.
4. Update this section's success criteria to include retailer coverage counts.

---

## Task 8: SEO & Deep-Link Architecture

### 8.1 URL parameter schema

可分享/可抓取 URL 参数：

- `cat`: `fridge` | `washing_machine` | `dishwasher` | `dryer`
- `w`: cavity width（mm）
- `h`: cavity height（mm）
- `d`: cavity depth（mm）
- `brand`: 可选品牌过滤
- `door`: 可选门宽校验值（mm）
- `dwelling`: `house` | `apartment` | `townhouse`

示例：

`https://fitappliance.com.au/?cat=fridge&w=600&h=1800&d=650`

这些 URL 是规范化可分享格式。`Popular Searches` 全部使用该格式。

### 8.2 deep_url resolution order

零售商跳转采用三层回退策略（高可信到低可信）：

1. `L1`: `product.direct_url`（手工校准，最高优先级）
2. `L2`: Commission Factory 的 `DeepLink` / `AffiliateUrl`（依赖 `CF_API_KEY`）
3. `L3`: `extractModelSku(model)` + 零售商搜索模板 URL

SKU 提取逻辑：

```js
function extractModelSku(modelString) {
  if (typeof modelString !== 'string' || !modelString.trim()) return '';
  return modelString.trim().split(/\s+/)[0];
}
```

### 8.3 Maintaining direct_url seed data

- 在 `appliances.json` 的目标产品中增加：`"direct_url": "https://..."`
- 仅为重点新品或高流量型号维护该字段
- 每季度数据刷新前，复核 `direct_url` 是否仍可访问
- 优先填入“产品详情页”而非“站内搜索页”

### 8.4 Brand clearance guide pages

- 生成器命令：`node scripts/generate-brand-pages.js`
- 输出目录：`pages/brands/`
- `clearance.json` 更新后需重新生成
- 生成后，将 `pages/brands/index.json` 中 URL 提交至 Google Search Console（URL Inspection）
- 生成阈值：品牌+分类至少 `>= 3` 个型号

### 8.5 Popular Searches maintenance

- `index.html` 中的 `Popular Searches` 为静态 HTML（便于抓取）
- 每季度查看 Search Console Top Queries
- 对“高曝光低 CTR”查询补充对应 `<li><a ...>` 入口并优化 anchor 文案

### 8.6 Schema.org validation

每次修改 JSON-LD 后执行校验：

- `npx schema-dts-gen ...`（可选本地工具）
- 或直接粘贴到：`https://validator.schema.org`

---

## 9. Deployment

在 GitHub Actions 中创建/启用 `.github/workflows/sync-appliances.yml` 后，使用 `schedule` + `workflow_dispatch` 双触发模式：

- 每周一次（`cron`）自动运行 `node scripts/sync.js`
- 每次运行前确保 `CF_API_KEY` 已在 `Settings -> Secrets -> Actions` 配置
- 仅在 `sync.js` 退出码为 `0` 时执行 `git add public/data/appliances.json`、`commit`、`push`
- 若断路器或校验失败（退出码 `1`），工作流应立即失败并停止发布
- 通过 Vercel 的 Git 集成自动部署 `main` 分支提交，发布后校验站点 `last_updated`

---

## 10. Setup Checklist (one-time)

- [x] Complete Task 1–7 above
- [x] Register for Commission Factory affiliate account if not already done
- [x] Generate CF API key from Commission Factory dashboard
- [x] Add `CF_API_KEY` to GitHub repository Secrets
- [x] Enable Vercel auto-deploy on push to `main` (verify in Vercel project settings)
- [x] Trigger first manual `workflow_dispatch` run to validate full pipeline
- [x] Confirm live site loads data from JSON (not hardcoded)
- [x] Add GitHub Actions failure email notification (Settings → Notifications)
