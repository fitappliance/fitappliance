# FitAppliance v2 — Link Backfill Priority

基于 compare 页 link quality audit 与底层 `direct_url` / `retailers[].url` 覆盖情况整理。

## Execution Status (Updated: 2026-04-18)

- Batch A — Fridge: ✅ Completed
  - HISENSE / FISHER & PAYKEL / WESTINGHOUSE / CHIQ 已完成样本命中 backfill
  - fridge compare pages 已全部升级为 `strong`
- Batch B — Dishwasher: ✅ Completed
  - Artusi / MIELE / Smeg / Ilve 样本命中 backfill 已完成
  - dishwasher compare pages 已全部升级为 `strong`
- Batch C — Dryer: ✅ Completed
  - Esatto / Inalto / Robinhood / EURO 样本命中 backfill 已完成
  - dryer compare pages 已全部升级为 `strong`
- Follow-up — Washing machine residual pages: ✅ Completed
  - HISENSE / MIDEA 样本命中 backfill 完成后，compare 已无 `search_only`

Current quality snapshot:
- `strongPages`: 38 / 38
- `searchOnlyPages`: 0
- `noBuyPages`: 0

## Priority 1 — Fridge

### 1. HISENSE
- 影响高质量提升：高
- 当前问题：多个 fridge compare 页仍是 search-only
- 当前覆盖：少量 direct_url，整体仍薄
- 优先原因：品牌出现频率高，fridge 商业价值高
- 重点页面：
  - `hisense-vs-chiq-fridge-clearance`
  - `hisense-vs-fisher-paykel-fridge-clearance`
  - `hisense-vs-lg-fridge-clearance`

### 2. FISHER & PAYKEL
- 影响高质量提升：高
- 当前问题：横跨 fridge / dishwasher 多页 search-only
- 当前覆盖：仅少量 direct_url
- 优先原因：品牌强、覆盖广、补一批收益大
- 重点页面：
  - `chiq-vs-fisher-paykel-fridge-clearance`
  - `hisense-vs-fisher-paykel-fridge-clearance`
  - `westinghouse-vs-fisher-paykel-fridge-clearance`

### 3. WESTINGHOUSE
- 影响高质量提升：高
- 当前问题：fridge compare 页受影响
- 当前覆盖：仅少量 direct_url
- 优先原因：fridge 中影响面好，适合一起做

### 4. CHIQ
- 影响高质量提升：中高
- 当前问题：fridge compare 页多为 JB Hi-Fi search URL
- 当前覆盖：有少量 direct_url，但不足
- 优先原因：和 HISENSE / F&P 联动价值高

---

## Priority 2 — Dishwasher

### 5. Artusi
- 当前覆盖：几乎无 direct_url / retailer URL
- 当前问题：多个 dishwasher compare 页纯 search-only
- 重点页面：
  - `artusi-vs-ilve-dishwasher-clearance`
  - `artusi-vs-miele-dishwasher-clearance`
  - `artusi-vs-smeg-dishwasher-clearance`

### 6. MIELE
- 当前覆盖：几乎无 direct_url / retailer URL
- 当前问题：高频出现在 dishwasher search-only compare 页

### 7. Smeg
- 当前覆盖：几乎无 direct_url / retailer URL
- 当前问题：dishwasher compare 页受影响明显

### 8. Ilve
- 当前覆盖：几乎无 direct_url / retailer URL
- 当前问题：dishwasher compare 页较集中

---

## Priority 3 — Dryer

### 9. Esatto
### 10. Inalto
### 11. Robinhood
### 12. EURO
- 当前问题：dryer compare 页基本靠 Appliances Online search URL
- 说明：建议在 fridge / dishwasher 首批完成后再做

---

## Recommended Execution Order

### Batch A — Fridge first
1. HISENSE
2. FISHER & PAYKEL
3. WESTINGHOUSE
4. CHIQ

### Batch B — Dishwasher second
5. Artusi
6. MIELE
7. Smeg
8. Ilve

### Batch C — Dryer third
9. Esatto
10. Inalto
11. Robinhood
12. EURO

---

## Task Definition for Codex

每个品牌 backfill 任务需要完成：

1. 审计该品牌当前产品数据中的 `direct_url` / `retailers[].url`
2. 找出可直接升级为 product-level URL 的样本产品
3. 优先提升 compare 页中被选为 sample 的型号
4. 回写到底层数据，而不是手改 compare HTML
5. 重新生成 compare 页
6. 运行：
   - `npm run audit-compare-links`
   - `npm run audit-link-quality`
7. 汇报：
   - 改了哪些品牌/型号
   - strong pages 增加多少
   - 还剩哪些 search-only 页面
