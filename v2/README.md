# FitMyAppliance — Deployment & Monetisation Playbook
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
   - Business name: FitMyAppliance
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

*Built with FitMyAppliance v2 — April 2026*
