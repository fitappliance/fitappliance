# FitAppliance v2 — Phase 41 (Product Review Video Integration, Pilot)

> **角色**：Claude 设计 + 审核；Codex 实现。
> 沿用 Phase 19–40 全部红线（TDD、真实数据、无 LLM 文案、无 Reddit/WP/CF、
> byte-identity 保持、copy-lint 0 violations、schema validator 0 errors）。
> **本轮主题**：在现有 Phase 30 VideoObject 基础设施上，增加"第三方产品 review 视频"试点，
> 只做 5 个头部 model × 2 个白名单创作者，跑 4 周真实数据再决定是否扩量。

---

## 为什么是 Pilot 而不是一次铺全站

- 全站上 video 若无原创壳 → Google 会判 thin content → 反向降权
- 视频会挂（删 / 私有 / embed disabled）→ 需要试点验证 `validate-videos.js` 再校验节奏
- 我们不知道哪种创作者组合 CTR 最好 → A/B 需数据
- 头部 5 个 model 占流量大头 → 最小样本最快出信号

---

## Phase 41 — Review Video Integration

### 数据结构

1. **`data/videos/creator-whitelist.json`**（手工维护，单一真源）：
   ```json
   {
     "creators": [
       {
         "id": "choice-au",
         "displayName": "CHOICE Australia",
         "channelId": "UCxxx",
         "channelUrl": "https://www.youtube.com/@CHOICEAustralia",
         "trustTier": "A",
         "notes": "独立非盈利消费者测评机构；观点权威。"
       },
       {
         "id": "productreview-au",
         "displayName": "ProductReview.com.au",
         "channelId": "UCyyy",
         "trustTier": "A",
         "notes": "AU 本土用户评测聚合平台官方频道。"
       },
       {
         "id": "appliances-online",
         "displayName": "Appliances Online",
         "channelId": "UCzzz",
         "trustTier": "B",
         "notes": "零售商；测评风格偏产品介绍，联盟关系需披露。"
       },
       {
         "id": "samsung-au",
         "displayName": "Samsung Australia",
         "channelId": "UCaaa",
         "trustTier": "M",
         "notes": "品牌官方；视为广告素材而非独立测评。"
       }
     ]
   }
   ```
   - `trustTier`：`A` = 独立测评，`B` = 零售合作（需披露），`M` = 厂商官方（标记为 "Manufacturer video"）
   - **严禁**白名单外创作者进入 pipeline

2. **`data/videos/review-videos.json`**（手工 + `validate-videos.js` 校验）：
   ```json
   {
     "samsung_srf7500wfh": {
       "modelSlug": "samsung-srf7500wfh",
       "reviews": [
         {
           "youtubeId": "dQw4w9WgXcQ",
           "creatorId": "choice-au",
           "title": "CHOICE review: Samsung SRF7500WFH",
           "publishedAt": "2025-08-10",
           "durationSec": 487,
           "timestamps": [
             { "t": 42,  "label": "Dimensions & fit" },
             { "t": 180, "label": "Noise level test" },
             { "t": 310, "label": "Energy score" }
           ],
           "validatedAt": null
         }
       ]
     }
   }
   ```
   - 每条 video 必须通过 oEmbed 校验才写入 `validatedAt`
   - `timestamps` 手动挑 3 个关键点（不要用 AI 生成；从视频大纲人工选）

3. **`data/copy/review-disclaimer.json`**（沿用 Phase 40 手写文案模式）：
   ```json
   {
     "tierA": "Third-party review by {creator}. FitAppliance did not produce or endorse this video. Clearance figures on this page are taken from the manufacturer install manual, not the review.",
     "tierB": "Review by {creator}, a retailer. FitAppliance does not receive payment for this embed. Clearance and energy figures are independent of the reviewer.",
     "tierM": "This is a {creator} brand video, not an independent review. Use it for feature orientation only; clearance data below comes from the install manual."
   }
   ```

### 试点 model 挑选（硬性规则）

1. 按 `public/data/appliances.json` 取 top 5 覆盖面最广的 model：
   - 2 个 fridge、1 个 washing machine、1 个 dishwasher、1 个 dryer
2. 必须是 manufacturer **当前在售** model（否则视频也易下架）
3. 必须在 brand 页和 cavity 页都有聚合（最大化 SEO 曝光面）

**试点清单（Codex 实现时按数据挑，不要硬编码）**：由 `scripts/pick-review-pilot.js` 输出 top 5 列表。

### 交付物

1. **`scripts/validate-reviews.js`**（基于 Phase 30 `validate-videos.js` 派生）：
   - 读 `data/videos/review-videos.json`
   - 对每条 video 调 YouTube oEmbed（`https://www.youtube.com/oembed?url=...`）
   - 校验：`html` 字段存在 = embed enabled；`author_name` 匹配 whitelist creator
   - 写 `validatedAt`；失败条目**不进渲染**（不删文件，只跳过）
   - 指数退避，最多 3 次；仍失败 → 日志记录 + 跳过
   - `.github/workflows/validate-reviews.yml`：每周日 UTC 03:00 跑

2. **`scripts/common/review-video-renderer.js`**（源码复用 Phase 30 facade 模板）：
   - 输入：`{modelSlug, reviews[], creatorWhitelist, disclaimerCopy}`
   - 输出：HTML 片段，包含：
     - Section 标题 "Independent reviews"（手写，不是 AI）
     - 每条 video 的 facade（thumbnail + play button；点击才加载 iframe）
     - iframe 用 `https://www.youtube-nocookie.com/embed/{id}`（隐私友好）
     - 3 个关键时间戳链接（跳 YouTube）
     - Disclaimer（从 `review-disclaimer.json` 按 `trustTier` 选）
     - VideoObject JSON-LD schema（`name`, `description`, `thumbnailUrl`, `contentUrl`,
       `embedUrl`, `uploadDate`, `duration`（ISO 8601 PT8M7S 格式）, `creator.@type=Person`）

3. **原创壳闸门**（Phase 34 的质量闸门模式复用）：
   - 带 review video 的页面必须 ≥ 300 实词的原创内容（去 nav/footer/video 标题）
   - 必须包含当页 clearance 数据 + FitAppliance 的 fit 判断
   - `scripts/audit-review-content.js`：PR 上跑；不达标 → exit 1
   - 已有 Phase 22 `scripts/validate-schema.js` 覆盖 JSON-LD 正确性

4. **渲染接入**：
   - `scripts/generate-brand-pages.js` / `generate-cavity-pages.js` 在试点 5 model 命中时调用 `review-video-renderer.js`，插入到 "Featured models" 之后、"Same brand alternatives" 之前
   - **非试点 model 不渲染**（试点白名单 = `data/videos/review-pilot-slugs.json` 5 条）

5. **隐私**：
   - 只用 `youtube-nocookie.com` embed domain
   - 页面不再加新 cookie、不接 GA/GTM、不改 Phase 26 RUM 边界
   - facade 模式：iframe 在用户点击前不加载（Phase 30 已有）

6. **tests/reviews.test.mjs**：
   - oEmbed mock：embed disabled → 不写 validatedAt
   - 白名单外 creatorId → 拒绝
   - 试点外 modelSlug → 不渲染 video section
   - 原创壳 < 300 词 → audit fail
   - disclaimer `tierA` / `tierB` / `tierM` 三种正确选择
   - VideoObject schema 字段齐全（`contentUrl`、`thumbnailUrl`、`duration` 必出）

### 验收

- `npm run validate-reviews` 首跑通过（5 model × 最多 2 video = ≤ 10 次 oEmbed 调用）
- 试点 5 个 model 页面各显示 1–2 个 review；其他 490 个 model 无改动
- Phase 22 schema validator 0 errors
- Phase 40 copy-lint 0 violations（disclaimer 模板不能出现 forbidden phrases）
- Phase 37 generator byte-identity：非试点页面产物 0 字节变化（只有 5 个试点页会动）
- Lighthouse：试点页 LCP ≤ 2500ms、CLS ≤ 0.1（facade 保证）
- 手动 checklist（PR body 必须逐条勾）：
  - [ ] 5 个试点页每页 ≥ 300 原创词
  - [ ] 每条 video 都有 disclaimer
  - [ ] 所有 embed 用 nocookie 域名
  - [ ] 所有 creator 在白名单
  - [ ] 3 个时间戳链接可跳转

### 观察期（merge 后 4 周）

**Codex 不做**，这里写给我和用户作跟踪指标：

| 指标 | 基线来源 | 目标 |
|---|---|---|
| 试点页 GSC impressions | Phase 23 gsc report | ↑ ≥ 20% |
| 试点页平均 position | 同上 | ↓ ≥ 2 位 |
| 试点页 LCP p75 | Phase 35 RUM | 不回退（≤ 2500ms） |
| 试点页 dwell time | Phase 26 RUM（需新加 `timeOnPage` 字段）| ↑ 可见 |
| Video rich result 出现次数 | GSC "Video" tab | ≥ 3 model |
| validate-reviews 周跑失败率 | workflow log | < 20% |

4 周后决策：
- **全绿** → 扩到 top 50 model
- **LCP / CLS 回退** → 只给非移动端加，或降级到 thumbnail-link（不 embed）
- **GSC 无变化** → 说明 clearance 数据已够强，video 收手，不扩

### 红线

- ❌ 不爬 YouTube 搜索结果、不自动抓 video title；review-videos.json 全手工
- ❌ 不调用 LLM 生成 disclaimer / 时间戳 label / "reviews" 介绍段
- ❌ 不下载 thumbnail 或任何视频帧到本仓库
- ❌ 不嵌入白名单外 creator（trustTier 必须在 A/B/M）
- ❌ 不改 Phase 26 隐私边界（无 cookie、无 localStorage PII）
- ❌ 不在试点 5 model 之外的页面渲染 video section
- ❌ 不让 video iframe 在页面加载时自动 fetch（facade 强制）
- ❌ 不破坏 Phase 37 byte-identity：非试点页面 `git diff --stat` = 0
- ❌ ACCC 披露缺失 = PR 不能 merge

### 硬性红线汇总

1. ❌ 白名单外 creator
2. ❌ 任何 LLM 生成文案
3. ❌ 自动下载 / 重上传视频内容
4. ❌ iframe 非 facade 加载
5. ❌ 隐私边界突破（Phase 26）
6. ❌ 试点 5 个以外的页面被动
7. ❌ ACCC disclaimer 缺失
