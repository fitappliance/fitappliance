# Google AdSense Technical and UX Audit

Audit date: 2026-05-23  
Branch: `chore-adsense-audit`  
Scope: static FitAppliance frontend, generated pages, mobile search-results UX, affiliate conversion paths.

## Executive Summary

- FitAppliance is already partially AdSense-ready: `public/ads.txt` is present and valid, and the homepage loads the Google AdSense script with publisher ID `ca-pub-7257149597818537`.
- No real ad unit is currently wired into production. There are no `ins.adsbygoogle` blocks or `adsbygoogle.push(...)` calls, so current monetization impact is effectively zero.
- Auto Ads or unreserved responsive ad units are the main risk. They can inject above search results, inside result cards, or near retailer CTAs, causing mobile CLS and affiliate conversion cannibalization. Controlled, reserved-height slots are recommended instead.

## Phase A — Infrastructure Scan

### `ads.txt`

Status: PASS

File found:

```txt
public/ads.txt
```

Current content:

```txt
google.com, pub-7257149597818537, DIRECT, f08c47fec0942fa0
```

Assessment:

- Format is valid for Google AdSense.
- The publisher ID matches the AdSense script found in `index.html`.
- Because this is under `public/`, Vercel should serve it at `/ads.txt`.

### AdSense Loader Script

Status: PRESENT

Found in `index.html`:

```html
<!-- Google AdSense verification -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7257149597818537"
        crossorigin="anonymous"></script>
```

Assessment:

- The loader is already present on the homepage.
- It currently acts as verification/infrastructure only.
- No explicit ad units are present.
- If Auto Ads is enabled in the AdSense dashboard, Google may inject ads without code-level slot control.

### Existing Ad Unit Markup

Status: NO REAL AD UNITS

Search results:

- No `ins.adsbygoogle` markup found.
- No `adsbygoogle.push(...)` calls found.
- No old `.ad-slot` blocks found.
- One static sidebar placeholder exists in `index.html`:

```html
<div class="ad-side">
  <div>Advertisement</div>
  <div class="ad-side-ph">
    <div>Google AdSense</div>
    <div>300×250 Medium Rectangle</div>
  </div>
</div>
```

Assessment:

- This is not a real AdSense unit.
- It reserves a desktop-style sidebar area, but it is visually presented as an ad even before ads are active.
- If converted to a real unit later, it is one of the safer positions because it is below filters and outside product card CTAs.

## Phase B — UX and Layout Risk Assessment

### Site Architecture Notes

FitAppliance is a vanilla static site, not a React/Next.js app. There is no framework-level layout component or Next `<Head>` layer to protect ad placement. Ads must therefore be controlled through explicit static markup, generated templates, and CSS.

Relevant layout areas:

- Homepage hero search form: `index.html`
- Search results renderer: `public/scripts/search-dom.js`
- Card CTAs and retailer links: `public/scripts/search-dom.js`, `public/scripts/ui/product-card.js`
- Generated SEO pages: `scripts/generate-product-pages.js`, `scripts/generate-fit-check-pages.js`, `scripts/generate-guides.js`, `scripts/generate-brand-pages.js`, `scripts/generate-cavity-pages.js`
- Main styles: `public/styles.css`, `public/styles-deferred.css`

### Critical UX Risks

#### Risk 1 — Auto Ads may cannibalize affiliate CTA clicks

High risk if Auto Ads is left unrestricted.

The primary business CTA is the retailer product-link area:

- `Check Availability`
- retailer cards for JB Hi-Fi, Appliances Online, The Good Guys, Harvey Norman, Bing Lee
- product-page retailer links with `rel="sponsored nofollow noopener"`

These are high-intent affiliate exits. Any ad injected:

- inside a product card,
- immediately above the retailer accordion,
- between the fit score and retailer CTA,
- or above the first result card

would likely reduce affiliate conversion and weaken the utilitarian search experience.

Recommendation:

- Do not allow Auto Ads inside `.fit-result-list`, `.p-row`, `.card-zone-c`, `.card-availability`, `.retailer-brand-grid`, `.product-card`, or product evidence sections.
- Prefer manual controlled slots over Auto Ads for the search/results experience.

#### Risk 2 — Mobile CLS from unreserved ad height

High risk if responsive ads are inserted without reserved wrappers.

The mobile UI has recently been optimized around:

- no horizontal overflow,
- 44px touch targets,
- compact card CTAs,
- floating `Live Fit Preview`,
- sticky/mobile filter controls.

An auto-sized ad can introduce:

- vertical jump when ad creative loads,
- viewport-width overflow if the ad iframe exceeds the container,
- hidden or displaced retailer CTAs,
- overlap with the bottom-right `Live Fit Preview` widget.

Recommendation:

- Every manual ad wrapper must reserve height before the ad script loads.
- Use `min-height`, `max-width: 100%`, `overflow: hidden`, and `contain: layout paint`.
- On mobile, prefer lower page positions only.
- Never place ads directly above the first search result or inside the first two result cards.

#### Risk 3 — Hero/search-form ads would damage core task completion

High risk.

The homepage primary action is cavity input. Ads near or inside the hero search card would create the wrong priority hierarchy.

Do not place ads:

- inside `.search-card`,
- between category selector and dimensions,
- between dimensions and submit button,
- in the hero trust strip,
- in the sticky/mobile filter sheet,
- in the account/saved-appliance picker.

#### Risk 4 — Generated pages have many templates, so ad rollout must be template-gated

Medium risk.

AdSense added only to `index.html` would not monetize most SEO pages. But adding broad ad markup to every generator without layout gates can create many CLS and UX variants.

Recommendation:

- Add ads incrementally by template family.
- Start with guides and brand/cavity pages before product/search pages.
- Include tests that assert no ad slot appears before primary content or retailer CTAs.

## Recommended Ad Slot Locations

### Tier 1 — Safest initial placements

These monetize informational traffic without distracting from affiliate exits.

1. Guide articles, after the first explanatory section

   Templates:

   - `scripts/generate-guides.js`

   Conditions:

   - after H1 + intro summary,
   - not above the first useful answer block,
   - reserved mobile height of 280px.

2. Brand clearance pages, after the first model summary section

   Templates:

   - `scripts/generate-brand-pages.js`

   Conditions:

   - not before the first product/model link list,
   - desktop and mobile wrapper width constrained to content column,
   - no sticky behavior.

3. Cavity / doorway educational pages, after the first verdict block

   Templates:

   - `scripts/generate-cavity-pages.js`
   - `scripts/generate-doorway-pages.js`

   Conditions:

   - below the direct “run full check” CTA,
   - never between the cavity answer and the action link.

### Tier 2 — Safe with stronger controls

1. Homepage sidebar lower card

   Existing placeholder:

   - `index.html` `.ad-side`

   Conditions:

   - desktop/tablet only at first,
   - hidden or moved below content on mobile,
   - reserve `min-height: 250px`,
   - do not use sticky sidebar ads.

2. Product detail pages below retailer availability

   Template:

   - `scripts/generate-product-pages.js`

   Conditions:

   - after evidence/provenance and retailer availability,
   - never above `Retailer availability`,
   - no ad between product title and dimensions.

3. Fit-check SEO pages after alternatives

   Template:

   - `scripts/generate-fit-check-pages.js`

   Conditions:

   - after the main fit answer and alternatives,
   - not between answer and recommended alternatives,
   - not between alternative cards and their `Check Availability` controls.

### Tier 3 — Avoid for launch

Do not place ads here initially:

- inside live search result cards,
- between the first result and second result,
- inside retailer accordions,
- above the hero search CTA,
- inside mobile filter drawer,
- near the floating `Live Fit Preview` widget,
- in compare tables or sticky compare headers.

## CLS Prevention Requirements for Future Implementation

Any future ad wrapper should follow these constraints:

```css
.ad-unit {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-height: 280px;
  overflow: hidden;
  contain: layout paint;
}

@media (min-width: 768px) {
  .ad-unit--sidebar {
    min-height: 250px;
  }
}
```

Implementation requirements:

- Reserve a known height for every slot.
- Hide or defer sidebar ads on small mobile screens if they compete with search results.
- Add `aria-label="Advertisement"` and visible “Advertisement” disclosure.
- Keep ad slot containers outside affiliate CTA groups.
- Add tests that scan generated HTML for forbidden placements.

## Recommended Rollout Plan

### Phase 1 — Verification only

Current state is acceptable for account verification:

- `ads.txt` exists.
- AdSense loader exists on homepage.
- Privacy/disclosure copy references AdSense cookies.

No extra ad units required for this phase.

### Phase 2 — Controlled low-risk manual slot

Add exactly one manual ad slot in guide/article templates only.

Acceptance criteria:

- mobile screenshot at 390px has no horizontal overflow,
- Lighthouse CLS remains near zero,
- slot appears after primary informational answer,
- no ad appears inside result cards or above affiliate CTAs.

### Phase 3 — Sidebar desktop slot

Convert the existing `.ad-side` placeholder into a real manual ad unit.

Acceptance criteria:

- desktop only initially,
- reserved 300×250 or 336×280 wrapper,
- hidden or below main content on mobile,
- no sticky sidebar ad.

### Phase 4 — Product/fit-check pages

Only after Phase 2 and 3 performance data is clean:

- add post-retailer product-page ad slot,
- add post-alternatives fit-check ad slot,
- monitor affiliate click-through before/after.

## Go / No-Go Decision

Current status: YELLOW

Reason:

- Infrastructure is ready enough for AdSense verification.
- Production should not enable Auto Ads broadly yet.
- Manual ad units need reserved wrappers and placement tests before launch.

Recommended next action:

Do not inject real ad units into the search results page yet. Start with one reserved manual ad slot on guide pages, then measure CLS and affiliate CTR impact before expanding.
