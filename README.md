# FitAppliance — Deployment & Monetisation Playbook
## fitappliance.com.au

---

## 📁 Project Structure

```
fitappliance/
├── index.html                    ← Main site (all logic, no backend needed)
├── vercel.json                   ← Vercel routing + security headers
├── pages/
│   ├── affiliate-disclosure.html ← ACCC-required disclosure page
│   └── privacy-policy.html       ← Privacy Act 1988 + Spam Act 2003
└── public/
    ├── robots.txt                ← SEO crawler rules
    └── sitemap.xml               ← Search engine sitemap
```

---

## 🚀 Step 1: Deploy to Vercel (15 minutes, free)

### Option A — GitHub (recommended, enables auto-deploy on push)

```bash
# 1. Create a GitHub repo called "fitappliance"
# 2. Push this folder:
git init
git add .
git commit -m "Initial deploy"
git remote add origin https://github.com/YOUR_USERNAME/fitappliance.git
git push -u origin main

# 3. Go to vercel.com → New Project → Import from GitHub → select repo
# 4. Framework: Other (static)
# 5. Deploy → done ✓
```

### Option B — Vercel CLI (fastest)

```bash
npm install -g vercel
cd /path/to/fitappliance
vercel --prod
# Follow prompts: project name = fitappliance, region = syd1
```

### Add custom domain (fitappliance.com.au)

1. Buy domain at [VentraIP](https://ventraip.com.au) or [Crazy Domains](https://www.crazydomains.com.au) — ~$20/year
2. In Vercel dashboard → Domains → Add `fitappliance.com.au`
3. Update DNS: add CNAME record `76.76.21.21` (Vercel's IP)
4. Add `www.fitappliance.com.au` → redirects to apex

---

## 💰 Step 2: Set Up Affiliate Accounts (1–3 days for approval)

### Commission Factory (Bing Lee, Appliances Online, JB Hi-Fi)

1. Register at [commissionfactory.com](https://www.commissionfactory.com)
   - Business name: FitAppliance
   - Website: fitappliance.com.au
   - Category: Comparison / Review site
2. Apply to programmes:
   - **Bing Lee** — search "Bing Lee" in marketplace → Apply
   - **Appliances Online** — search and apply
   - **JB Hi-Fi** — search and apply
3. Approval typically 2–5 business days
4. Once approved: go to each programme → Get Links → Deep Link Generator
5. Replace placeholder URLs in `index.html` with your tracked links:
   ```
   Search for: https://www.binglee.com.au
   Replace with: https://t.cfjump.com/YOUR_PUBLISHER_ID/t/BINGLEE_PROGRAMME_ID?Url=https://www.binglee.com.au
   ```

### Partnerize (The Good Guys, Harvey Norman)

1. Register at [partnerize.com](https://partnerize.com/en/publishers)
2. Apply to:
   - **The Good Guys** (JB Hi-Fi Group)
   - **Harvey Norman**
3. Use their deep link builder for product-specific links

### Expected Revenue Model

| Metric | Conservative | Optimistic |
|--------|-------------|------------|
| Monthly organic visitors | 500 | 3,000 |
| Click-through rate to retailer | 15% | 25% |
| Retailer conversion rate | 3% | 6% |
| Avg. appliance order value | $1,200 | $1,800 |
| Avg. commission rate | 2.5% | 3% |
| **Monthly revenue** | **~$68** | **~$810** |

> Growth levers: SEO content (see Step 5), Google Ads targeting "fridge size finder Australia"

---

## 📣 Step 3: Google AdSense

1. Apply at [adsense.google.com](https://adsense.google.com)
   - Site must be live with real content before applying
   - Approval typically 1–2 weeks
2. Replace ad placeholder divs in `index.html`:

```html
<!-- Replace this: -->
<div class="ad-block">
  <div>Google AdSense — 728×90 Leaderboard</div>
</div>

<!-- With this (your actual AdSense code): -->
<ins class="adsbygoogle"
     style="display:inline-block;width:728px;height:90px"
     data-ad-client="ca-pub-YOUR_PUBLISHER_ID"
     data-ad-slot="YOUR_AD_SLOT_ID"></ins>
<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
```

3. Add AdSense script to `<head>` of index.html:
```html
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-YOUR_ID" crossorigin="anonymous"></script>
```

---

## ⚡ Step 4: Connect GEMS Energy Database API

The Australian Government provides free API access to verified appliance energy ratings.

```
Base URL: https://api.gov.au/service/gems
Documentation: https://api.gov.au
```

To replace static energy star data with live GEMS data:

```javascript
// Replace static star ratings with API call:
async function getEnergyRating(brand, model) {
  const res = await fetch(
    `https://api.gov.au/service/gems/products?brand=${encodeURIComponent(brand)}&model=${encodeURIComponent(model)}`
  );
  const data = await res.json();
  return data.results[0]?.energy_stars || null;
}
```

---

## 🔍 Step 5: SEO Content Strategy

Target these high-intent, low-competition keywords first:

| Keyword | Monthly Searches (est.) | Difficulty |
|---------|------------------------|------------|
| fridge size finder australia | 320 | Low |
| 600mm wide fridge australia | 260 | Low |
| samsung fridge clearance requirements | 140 | Very Low |
| washing machine dimensions australia | 480 | Medium |
| veu rebate fridge victoria 2026 | 210 | Very Low |
| dishwasher cavity size australia | 170 | Low |

### Quick wins (build these pages):

1. `/fridge-size-finder` — "Find a fridge that fits your exact space"
2. `/600mm-wide-fridges-australia` — pre-filtered to 600mm width
3. `/victorian-energy-upgrades-fridge-rebate` — targets VEU searchers
4. Blog: "Why your new fridge won't fit (and how to avoid it)"

Each page should pre-populate the search tool with relevant dimensions.

---

## 🔧 Step 6: Installation Lead Generation

Register with one of:
- **Oneflare** (oneflare.com.au/partner) — pay per lead model
- **hipages** (hipages.com.au/trades) — subscription model
- **ServiceSeeking** (serviceseeking.com.au) — free to list

When a user clicks "Book a Licensed Installer", send them to your Oneflare/hipages referral link. You earn ~$15–40 per qualified lead.

---

## 📊 Step 7: Analytics Setup

Add before `</head>` in index.html:

```html
<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-YOUR_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-YOUR_MEASUREMENT_ID', {
    anonymize_ip: true  // Privacy compliance
  });

  // Track affiliate clicks
  document.addEventListener('click', function(e) {
    const link = e.target.closest('a[rel*="sponsored"]');
    if (link) {
      gtag('event', 'affiliate_click', {
        retailer: link.textContent.trim(),
        destination: link.href
      });
    }
  });
</script>
```

Key metrics to watch in GA4:
- **Dimension inputs → search clicks** (conversion funnel)
- **Affiliate click rate** by category and retailer
- **Most searched dimensions** (reveals popular cavity sizes for SEO)

---

## 🗓 Go-Live Checklist

- [ ] Domain registered and pointed to Vercel
- [ ] SSL certificate active (automatic via Vercel)
- [ ] Commission Factory account approved
- [ ] Partnerize account approved
- [ ] Real affiliate URLs replacing placeholders in index.html
- [ ] Google AdSense approved and ad codes inserted
- [ ] Google Analytics 4 tracking active
- [ ] Google Search Console — submit sitemap.xml
- [ ] Test all Buy links open correct retailer pages
- [ ] Verify affiliate-disclosure.html is accessible at /affiliate-disclosure
- [ ] Verify privacy-policy.html is accessible at /privacy-policy
- [ ] Run Google Lighthouse — target 90+ on Performance, SEO, Accessibility

---

## 📋 Legal Checklist

- [ ] ABN registered (apply at abr.gov.au, free, 10 minutes)
- [ ] GST registration (required if revenue > $75,000/yr; optional below)
- [ ] Affiliate disclosures visible on all product links ✓ (already in code)
- [ ] Privacy policy published ✓
- [ ] `rel="sponsored"` on all affiliate links ✓ (already in code)
- [ ] NCC 2022 dryer warning for apartments ✓ (already in code)

---

*Built with FitAppliance v2 — April 2026*

### DNS Verification

TXT: fitappliance.com.au -> google-site-verification=5keGnUyvuq31_mxZ9pNVPIsh7BzKBbM7aHdxUTZZDJM

### Phase 20 — Core Web Vitals Automation

- Added `scripts/lighthouse-ci.js` to run Lighthouse performance audits on 5 representative pages and write reports to `reports/lighthouse-YYYYMMDD.json` plus `reports/lighthouse-latest.json`.
- Added `.github/workflows/lighthouse.yml` (weekly + manual `workflow_dispatch`) with a hard performance gate (`min-score=0.9`) and artifact upload.
- Updated OG image generation to emit both PNG and WebP assets (`scripts/generate-og-images.js`), and updated generated brand/compare pages to use `<picture>` with explicit `width`/`height`, `decoding="async"`, and lazy-loaded non-hero images.
- Validation commands:
  - `npm run generate-all`
  - `npm run lighthouse-ci -- --min-score 0.9`
  - `npm test`
  - `npm run build`

### Phase 21 — Internal Link Graph & Topic Hubs

- Added `scripts/build-link-graph.js` to crawl `index.html` + `pages/**/*.html` and generate `reports/link-graph.json` with node-level inlink/outlink metrics.
- Added `scripts/generate-guides.js` to generate 5 static hub pages in `/pages/guides/`, each with substantial static outlinks and cross-links between hub pages.
- Added static related-link modules to generated pages:
  - Cavity pages: `Related cavity sizes` + guide hub links.
  - Doorway pages: `Also viewed doorway guides` + guide hub links.
  - Brand pages: `Same brand alternatives` + guide hub links.
  - Compare pages: `Also viewed comparisons` + guide hub links.
- Updated pipelines and feeds so guide pages are included in:
  - `public/sitemap.xml`
  - `public/rss.xml`
  - `public/image-sitemap.xml`
- Validation commands:
  - `npm run generate-all`
  - `npm test`
  - `npm run build`

### Phase 22 — Structured Data Integrity & Editorial Transparency

- Added two trust pages with static routing:
  - `/methodology` → [`pages/methodology.html`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/pages/methodology.html)
  - `/about/editorial-standards` → [`pages/about/editorial-standards.html`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/pages/about/editorial-standards.html)
- Extended all generated page templates (brand, compare, cavity, doorway, guides) plus index/legal pages to include:
  - footer links to methodology/editorial standards
  - `<meta name="article:modified_time" ...>` timestamp metadata
- Expanded schema generation with real-data-only fields:
  - `Product` + `Speakable` for cavity/doorway pages
  - `Organization` for brand pages using real source data from `public/data/brands/metadata.json`
  - no fake `aggregateRating` / `reviewCount` introduced
- Added automated schema validation:
  - `scripts/validate-schema.js`
  - output report: `reports/schema-validation.json`
  - test gate: `tests/schema.test.mjs`
- Updated sitemap static set + Vercel rewrites to serve the new trust pages.
- Validation commands:
  - `npm run generate-all`
  - `npm test`
  - `npm run build`

### Phase 23 — Google Search Console Data Pipeline

- Added automated GSC ingestion script:
  - [`scripts/gsc-fetch.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/gsc-fetch.js)
  - reads `GSC_SA_JSON` from environment only (fail-fast when missing/invalid)
  - uses `googleapis` Search Console API and writes:
    - `reports/gsc-YYYY-MM-DD.json`
    - `reports/gsc-latest.json`
- Added keyword gap analysis script:
  - [`scripts/keyword-gap.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/keyword-gap.js)
  - compares GSC query rows with sitemap URLs
  - outputs:
    - `reports/keyword-gap-YYYY-MM-DD.md`
    - `reports/keyword-gap-latest.md`
- Added workflow:
  - [`.github/workflows/gsc-weekly.yml`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.github/workflows/gsc-weekly.yml)
  - schedule: every Tuesday `04:00 UTC` + `workflow_dispatch`
  - publishes reports to `reports/gsc` branch (does not commit report churn to `main`)
- Added test coverage:
  - [`tests/gsc.test.mjs`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/tests/gsc.test.mjs)
  - validates row schema normalization, CTR/position guardrails, mocked fetch path, and markdown report generation

#### Required Manual Setup (one-time)

1. Create a Google Cloud service account with Search Console API enabled.
2. Store full service-account JSON in repo secret `GSC_SA_JSON`.
3. In Google Search Console, add the service account email as an **Owner** of the property (`sc-domain:fitappliance.com.au`).

Without step 3, the workflow will authenticate but still fail API reads due to missing property permissions.

### Phase 24 — Australia Location Landing Pages

- Added ABS-fact-only city dataset:
  - [`data/locations/au-cities.json`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/data/locations/au-cities.json)
  - fields limited to `slug`, `name`, `state`, `stateCode` for 8 capital cities.
- Added generator:
  - [`scripts/generate-location-pages.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/generate-location-pages.js)
  - outputs 40 static pages (`8 cities × 5 categories`) under `pages/location/{city}/{category}.html`
  - each page includes:
    - required H1 `Appliance Cavity & Doorway Guide — {Category} in {City}`
    - static internal resource links (SEO-visible, no JS injection)
    - `BreadcrumbList` + `ItemList` + `Place` JSON-LD.
- Routing + indexing integration:
  - added Vercel rewrite `/location/:city/:category` → `/pages/location/:city/:category.html`
  - included location URLs in:
    - `public/sitemap.xml`
    - `public/rss.xml`
    - `public/image-sitemap.xml`
  - regenerated `reports/link-graph.json` with location pages included and non-orphan.
- Pipeline updates:
  - added `npm` script `generate-location`
  - `build` and `generate-all` now run location page generation.
- Validation commands:
  - `node --test tests/location-pages.test.mjs`
  - `npm test`
  - `npm run build`

### Phase 25 — Interactive Cavity Fit Checker

- Added standalone tool page:
  - [`pages/tools/fit-checker.html`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/pages/tools/fit-checker.html)
  - includes `SoftwareApplication` + `HowTo` schema blocks.
- Added zero-dependency checker script:
  - [`public/scripts/fit-checker.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/public/scripts/fit-checker.js)
  - loads `/data/appliances.json`
  - validates cavity dimensions safely
  - returns matching appliance slug + deep-link into `/?cat=...`
  - uses `<dialog>` + `localStorage` for last 3 searches
  - no cookies, no trackers, no `console.log`.
- Added static SEO-visible links to the tool:
  - homepage (`index.html`) has `Try the fit checker →`
  - all generated cavity pages now include `/tools/fit-checker` link.
- Routing:
  - added Vercel rewrite `/tools/:slug` → `/pages/tools/:slug.html`.
- Added test coverage:
  - [`tests/fit-checker.test.mjs`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/tests/fit-checker.test.mjs)
  - covers:
    - `600×850×600` returns real matches
    - `1×1×1` shows no-match state
    - invalid input handled with friendly message
    - script gzip size `< 10KB`
    - static link + rewrite + schema checks.
- Validation commands:
  - `node --test tests/fit-checker.test.mjs`
  - `npm test`
  - `npm run build`

### Phase 26 — Real User Monitoring (RUM)

- Added client collector:
  - [`public/scripts/rum.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/public/scripts/rum.js)
  - 10% sampling (`SAMPLE_RATE = 0.1`)
  - captures only `LCP`, `INP`, `CLS`, `TTFB`
  - uses same-origin `navigator.sendBeacon('/api/rum')` (fallback `fetch` with `keepalive`).
- Added serverless ingestion endpoint:
  - [`api/rum.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/api/rum.js)
  - accepts `POST` only
  - validates payload schema
  - strips query/hash from `path`
  - same-origin guard (`Origin`/`Referer`)
  - rate limit: `60 requests / minute / client fingerprint`
  - stores sanitized events through runtime logging (Vercel logs / log drains), without persisting IP.
- Privacy hardening:
  - removed Google Analytics script from homepage head.
  - updated [`pages/privacy-policy.html`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/pages/privacy-policy.html) with dedicated RUM section and explicit non-collection list:
    - no IP address storage
    - no cookies or localStorage reads
    - no user-entered form values
    - no referer query capture.
- Added test coverage:
  - [`tests/rum.test.mjs`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/tests/rum.test.mjs)
  - verifies:
    - client script privacy constraints + sampling + sendBeacon endpoint
    - API rejects non-POST
    - payload sanitizer behavior
    - rate-limit returns `429` when exceeded.
- Validation commands:
  - `node --test tests/rum.test.mjs`
  - `npm test`
  - `npm run build`

### Phase 27 — Sentinel Monitoring (Uptime + Broken Links + Orphans)

- Added sentinel scripts:
  - [`scripts/uptime-check.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/uptime-check.js)
    - samples 30 URLs from sitemap buckets (`/`, guides, cavity, doorway, brand, compare, location)
    - checks with `HEAD`, concurrency `5`, timeout `10s`
    - writes `reports/uptime-YYYYMMDD.json`
    - exits non-zero if any URL is non-200.
  - [`scripts/broken-link-check.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/broken-link-check.js)
    - scans `index.html` + all `pages/**/*.html`
    - validates internal hrefs against real pages/files and `vercel.json` rewrites
    - ignores external links
    - writes `reports/broken-links.json`
    - exits non-zero when broken links exist.
  - [`scripts/orphan-check.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/orphan-check.js)
    - validates `reports/link-graph.json` from Phase 21
    - enforces `orphanPages === 0`
    - writes `reports/orphan-check.json`.
- Added workflow:
  - [`.github/workflows/sentinel.yml`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.github/workflows/sentinel.yml)
  - schedule: daily at `00:30 UTC` + `workflow_dispatch`
  - runs uptime + broken-link + orphan checks
  - on failure creates or updates a same-day GitHub issue with label `sentinel-auto`.
- Added npm scripts:
  - `npm run uptime-check`
  - `npm run broken-link-check`
  - `npm run orphan-check`
  - `npm run sentinel`
- Added test coverage:
  - [`tests/sentinel.test.mjs`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/tests/sentinel.test.mjs)
  - verifies:
    - non-200 uptime responses trigger failure
    - broken-link detection catches `/this-page-does-not-exist`
    - external links are not treated as broken
    - orphan guard fails when `orphanPages > 0`.

## Monitoring

- Local quick run:
  - `npm run sentinel`
- Individual checks:
  - `npm run uptime-check`
  - `npm run broken-link-check`
  - `npm run build-link-graph && npm run orphan-check`
- CI automation:
  - GitHub Action `Sentinel Monitoring` runs daily and can be triggered manually via **Actions → Sentinel Monitoring → Run workflow**.
  - When checks fail, the workflow opens (or reuses) a same-day issue labeled `sentinel-auto` and attaches report JSON.

### Phase 28 — Measurement Walkthrough (SVG + HowTo)

- Added shared measurement-copy source:
  - [`data/copy/measurement-steps.json`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/data/copy/measurement-steps.json)
  - exactly 5 canonical measurement steps reused by all cavity pages.
- Added SVG and schema generators:
  - [`scripts/generate-measurement-svg.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/generate-measurement-svg.js)
  - [`scripts/generate-measurement-content.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/generate-measurement-content.js)
  - emits front/side/top measurement diagrams and `HowTo` JSON-LD.
- Updated cavity page generator:
  - [`scripts/generate-cavity-pages.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/generate-cavity-pages.js)
  - now injects `<section id="measure">` with:
    - proportional SVG diagrams
    - `<details>` step walkthrough
    - HowTo schema (5 steps).
- Added test coverage:
  - [`tests/measurement.test.mjs`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/tests/measurement.test.mjs)
  - validates:
    - 3 SVG viewBox diagrams
    - W/H/D dimension labels
    - 5-step HowTo schema
    - cavity pages include `#measure`.
- Validation commands:
  - `node --test tests/measurement.test.mjs`
  - `npm run lighthouse-ci`
  - `npm test`
  - `npm run build`

### Phase 29 — Client-side PDF Export

- Added browser-only exporter:
  - [`public/scripts/pdf-export.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/public/scripts/pdf-export.js)
  - generates PDF bytes locally and downloads via `Blob` + object URL.
- Zero-network guarantee:
  - no `fetch` / `XMLHttpRequest` usage inside PDF export script
  - no server API dependency for export.
- Static entry-point in cavity pages:
  - every `pages/cavity/*.html` now includes a build-time `Download PDF` button (`.btn-pdf-export`) with cavity metadata attributes.
- Added test coverage:
  - [`tests/pdf-export.test.mjs`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/tests/pdf-export.test.mjs)
  - validates:
    - gzip size `< 30KB`
    - no outbound network calls
    - click path generates Blob/object URL
    - deterministic legal filename
    - static button presence across all cavity pages.

### Offline Usage

- Cavity pages can export a printable installation PDF entirely on-device.
- The export flow does not upload user inputs or measurement content to any backend endpoint.

### Phase 30 — Real YouTube VideoObject Schema

- Added source + validator pipeline:
  - [`data/videos/brand-videos.json`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/data/videos/brand-videos.json)
  - [`scripts/validate-videos.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/validate-videos.js)
  - every listed YouTube URL is validated through oEmbed before staying in JSON
  - invalid items are removed and reported in [`reports/video-validation.json`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/reports/video-validation.json).
- Added brand-page video injection:
  - [`scripts/inject-video-schema.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/inject-video-schema.js)
  - injects `<section id="install-video">` with lazy facade buttons
  - injects `VideoObject` JSON-LD from validated oEmbed fields only.
- Added monthly automation:
  - [`.github/workflows/validate-videos.yml`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.github/workflows/validate-videos.yml)
  - schedule: day 1 monthly + `workflow_dispatch`
  - on failure, opens/updates a `sentinel-auto` issue with validation report.
- Added npm scripts:
  - `npm run validate-videos`
  - `npm run inject-video-schema`
- Added test coverage:
  - [`tests/videos.test.mjs`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/tests/videos.test.mjs)
  - validates:
    - each entry has fresh `validatedAt`
    - Samsung brand page includes `VideoObject` + facade markup
    - invalid oEmbed responses are filtered out.

### Phase 31 — Affiliate Link Rendering (Provider + Env Gated)

- Added provider configuration:
  - [`data/affiliates/providers.json`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/data/affiliates/providers.json)
  - includes `amazon-au`, `appliances-online`, and `the-good-guys` templates with disclosure text.
- Added reusable affiliate renderer:
  - [`scripts/render-affiliate-links.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/render-affiliate-links.js)
  - resolves provider URLs only when both:
    1. product affiliate identifier exists (`asin` or `sku`)
    2. required environment variable exists (for example `AMAZON_AU_TAG`)
  - missing env or identifier cleanly returns no affiliate CTA (no crash, no broken href).
- Integrated renderer into generated pages:
  - [`scripts/generate-brand-pages.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/generate-brand-pages.js)
  - [`scripts/generate-comparisons.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/generate-comparisons.js)
  - [`scripts/generate-location-pages.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/generate-location-pages.js)
  - all affiliate anchors render with `rel="sponsored nofollow noopener"` and include visible disclosure text linking to `/affiliate-disclosure`.
- Added manual backfill guide (no fake IDs committed):
  - [`docs/AFFILIATE-BACKFILL.md`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/docs/AFFILIATE-BACKFILL.md)
  - explains how to add real ASIN/SKU values and required environment variables.
- Added Phase 31 test coverage:
  - [`tests/affiliate.test.mjs`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/tests/affiliate.test.mjs)
  - verifies env-missing fallback, strict URL templating, sponsored/nofollow/noopener rel, and disclosure rendering.

### Phase 32 — Email Subscription (Buttondown via Serverless Proxy)

- Added subscription API endpoint:
  - [`api/subscribe.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/api/subscribe.js)
  - `POST` only, same-origin guard, honeypot support, and per-client rate limiting (`10/minute`).
  - forwards subscriptions to Buttondown using `BUTTONDOWN_API_KEY`.
  - never stores or returns subscriber email in API responses.
- Added client-side form handler:
  - [`public/scripts/subscribe.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/public/scripts/subscribe.js)
  - progressively enhances static forms (`form[data-subscribe]`) with:
    - async submit to `/api/subscribe`
    - status messaging
    - short local cooldown to reduce accidental repeat submits.
- Added subscription UX surfaces:
  - homepage sidebar form in [`index.html`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/index.html)
  - guide-page right-rail forms generated from [`scripts/generate-guides.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/generate-guides.js) across all 5 hub pages
  - thank-you page [`pages/subscribe.html`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/pages/subscribe.html).
- Routing + policy updates:
  - added `/subscribe` rewrites in both:
    - [`vercel.json`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/vercel.json)
    - [`v2/vercel.json`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/v2/vercel.json)
  - updated [`pages/privacy-policy.html`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/pages/privacy-policy.html) with provider details, data handling, and unsubscribe flow.
- Added test coverage:
  - [`tests/subscribe.test.mjs`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/tests/subscribe.test.mjs)
  - validates 405 / 403 / 422 / 500 / 429 / 200 response paths.

#### Required environment setup

- Set `BUTTONDOWN_API_KEY` in deployment environment before enabling production signups.

### Phase 33 — PWA (Offline + Install Prompt)

- Added manifest and install assets:
  - [`public/manifest.webmanifest`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/public/manifest.webmanifest)
  - [`public/icons/icon-192.png`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/public/icons/icon-192.png)
  - [`public/icons/icon-512.png`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/public/icons/icon-512.png)
- Added service worker generation pipeline:
  - [`scripts/generate-sw.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/generate-sw.js)
  - emits versioned SW cache (`fitappliance-v{timestamp}`) and shell precache list.
  - `build` now runs `generate-sw` automatically.
- Added runtime PWA scripts:
  - [`public/service-worker.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/public/service-worker.js)
  - [`public/scripts/sw-register.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/public/scripts/sw-register.js)
  - registration is non-blocking (`window.load`) and skipped on offline or reduced-data mode.
- Added install prompt UX on homepage:
  - [`index.html`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/index.html)
  - captures `beforeinstallprompt`, shows install card, and stores only `{dismissedAt}` in localStorage.
  - dismissal suppresses prompt for 7 days.
- Caching strategy implemented:
  - HTML: stale-while-revalidate
  - static assets (`/scripts/*`, `/og-images/*`, `/data/*`, `/icons/*`): cache-first
  - API routes (`/api/*`): network-only (never cached).
- Routing updates:
  - added explicit rewrites for `/manifest.webmanifest`, `/service-worker.js`, and `/icons/*` in:
    - [`vercel.json`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/vercel.json)
    - [`v2/vercel.json`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/v2/vercel.json)
- Added test coverage:
  - [`tests/pwa.test.mjs`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/tests/pwa.test.mjs)
  - validates manifest shape, SW versioning, `/api/*` non-caching, and deferred SW registration.

### Phase 34 — GSC-Driven Auto Content PR Pipeline

- Added deterministic candidate selector:
  - [`scripts/auto-content-pipeline.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/auto-content-pipeline.js)
  - reads latest `reports/gsc-*.json` + sitemap and applies hard filters:
    - impressions `>= 50`
    - position `11..30`
    - CTR `< 0.05`
    - query words `>= 3`
    - sitemap slug similarity `> 0.9` skip
    - blacklist skip: `buy`, `cheap`, `deal`, `coupon`, `discount`, `free shipping`
  - generates only template-based HTML drafts backed by real `public/data/*.json` fields.
  - enforces 5 quality gates before publishability:
    - word count `>= 300`
    - contains `<table>` or `<dl>`
    - contains internal links to existing fit pages
    - no placeholder markers (`Lorem ipsum`, `TODO`, `FIXME`, `<placeholder>`)
    - schema parse errors `= 0`
  - enforces minimum `3` real data references per query, otherwise skip.
- Added PR opening automation with cap:
  - [`scripts/open-content-pr.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/open-content-pr.js)
  - applies weekly max of `10` PRs
  - creates branch per query (`auto/content-YYYYMMDD-{slug}`)
  - updates guide page + `pages/guides/index.json` + sitemap + RSS
  - runs schema validation before commit
  - opens PR with `auto-content` label and checklist (no auto-merge flow).
- Added workflow:
  - [`.github/workflows/auto-content.yml`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.github/workflows/auto-content.yml)
  - schedule: Wednesday UTC `04:00` + `workflow_dispatch`
  - runs candidate pipeline first, then PR opener
  - remains green when GSC report is absent (no-candidate exit path).
- Added tests:
  - [`tests/auto-content.test.mjs`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/tests/auto-content.test.mjs)
  - covers classification, blacklist skip, query-length skip, sitemap similarity skip, quality-gate rejection, min-data-point skip, and `max 10` PR cap.

### Phase 35 — RUM Weekly Diagnostics (Report-Only PR)

- Selected RUM persistence option: **A** (Vercel Log Drain export to `reports/rum/*.ndjson`).
- Added RUM aggregation pipeline:
  - [`scripts/aggregate-rum.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/aggregate-rum.js)
  - reads `reports/rum/*.ndjson`, groups by path, computes p50/p75/p95 for `LCP` / `INP` / `CLS`
  - percentile algorithm is explicit **nearest-rank**
  - writes:
    - `reports/rum-summary-YYYYMMDD.json`
    - `reports/rum-summary-latest.json`
  - marks run as `insufficient_samples` when total events `< 100`.
- Added performance diagnosis:
  - [`scripts/perf-diagnose.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/perf-diagnose.js)
  - outputs normalized issues in shape:
    - `{path, metric, p75, suggestion, evidence}`
  - writes:
    - `reports/perf-issues-YYYYMMDD.json`
    - `reports/perf-issues-latest.json`
- Added report-only PR opener:
  - [`scripts/open-perf-pr.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/open-perf-pr.js)
  - opens branch `auto/perf-YYYYMMDD`
  - PR body contains diagnosis list only
  - no business/source code changes are included in the generated PR scope.
- Added workflow:
  - [`.github/workflows/perf-weekly.yml`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.github/workflows/perf-weekly.yml)
  - schedule: Thursday UTC `04:00` + `workflow_dispatch`
  - runs aggregate → diagnose → open report PR.
- Added tests:
  - [`tests/perf-pipeline.test.mjs`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/tests/perf-pipeline.test.mjs)
  - validates nearest-rank percentile math, LCP diagnose trigger, and sample `< 100` skip behavior.

### Phase 36 — Self-Hosted Error Monitor

- Added lightweight client beacon:
  - [`public/scripts/error-beacon.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/public/scripts/error-beacon.js)
  - captures `window.onerror` + `unhandledrejection`
  - stack trace is capped to top `5` frames
  - source URLs strip query/fragment
  - message/stack redact email and phone-like strings
  - same-day session dedupe via localStorage signature set
  - gzip size target is met (`< 2KB`).
- Added ingestion API:
  - [`api/error.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/api/error.js)
  - POST only, same-origin guard, 30/minute rate limit
  - validates + sanitizes payload (`405`, `403`, `422`, `429` covered)
  - never stores raw IP; uses hashed client token only for rate limiting.
- Added aggregation + issue automation:
  - [`scripts/aggregate-errors.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/aggregate-errors.js)
  - groups by `sha256(message + source-basename + line)` and writes `reports/errors-YYYYMMDD.json`
  - [`scripts/open-error-issue.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/open-error-issue.js)
  - action rules:
    - new signature → create issue (`auto-error`)
    - existing open issue → append comment
    - closed issue recurring within 7 days → reopen + comment.
- Added workflow:
  - [`.github/workflows/error-daily.yml`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.github/workflows/error-daily.yml)
  - schedule: daily UTC `02:00` + `workflow_dispatch`.
- Privacy updates:
  - [`pages/privacy-policy.html`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/pages/privacy-policy.html) now includes a dedicated error-monitor section (collected fields, redaction, dedupe, retention intent).
- Added tests:
  - [`tests/error-monitor.test.mjs`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/tests/error-monitor.test.mjs)
  - covers sanitize, redact, dedupe aggregation, reopen behavior, and 405 guard.

### Phase 41 — Product Review Video Pilot

- Added pilot selection + validation pipeline:
  - [`scripts/pick-review-pilot.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/pick-review-pilot.js)
  - [`scripts/validate-reviews.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/validate-reviews.js)
  - [`scripts/common/review-video-renderer.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/common/review-video-renderer.js)
  - [`scripts/audit-review-content.js`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/scripts/audit-review-content.js)
- Added manual data sources:
  - [`data/videos/creator-whitelist.json`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/data/videos/creator-whitelist.json)
  - [`data/videos/review-pilot-slugs.json`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/data/videos/review-pilot-slugs.json)
  - [`data/videos/review-videos.json`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/data/videos/review-videos.json)
  - [`data/copy/review-disclaimer.json`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/data/copy/review-disclaimer.json)
- Added weekly validation workflow:
  - [`.github/workflows/validate-reviews.yml`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/.github/workflows/validate-reviews.yml)
- Added manual backfill handoff:
  - [`docs/PHASE41-BACKFILL.md`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/docs/PHASE41-BACKFILL.md)
