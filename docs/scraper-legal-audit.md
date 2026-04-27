# Phase 49 Scraper Legal Audit

Status: draft POC audit, 2026-04-27.

This is not legal advice. It is a risk screen for whether FitAppliance should invest in a retailer inventory scraper. The POC remains report-only: no scraped data is written to `public/data/*.json`, no retailer content is republished, and all scraper runs must obey robots.txt and rate limits.

## Scope and compliance posture

Target retailers:

- JB Hi-Fi: https://www.jbhifi.com.au
- Harvey Norman: https://www.harveynorman.com.au
- The Good Guys: https://www.thegoodguys.com.au
- Appliances Online: https://www.appliancesonline.com.au
- Bing Lee: https://www.binglee.com.au

FitAppliance's proposed scraper may collect only factual catalogue signals:

- brand
- model number
- retailer product URL
- numeric price when displayed in the product card
- scrape timestamp and HTTP status metadata

The scraper must not copy product descriptions, editorial copy, reviews, images, ratings text, Q&A content, or retailer UI assets. Affiliate relationships do not by themselves grant scraping rights; until written permission exists, they are treated only as a reason to keep the bot transparent and easy to identify.

Operational rules for the POC:

- User agent: `FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)`.
- Default delay: at least 3 seconds between requests to the same host.
- Run manually only via `workflow_dispatch`.
- Upload reports as GitHub Actions artifacts; do not commit reports or mutate the catalogue.
- Abort on robots disallow, RED legal status, 429 loops, or anti-bot/captcha responses.

## Decision table

| Retailer | robots.txt category pages | Terms / website risk | POC decision | Notes |
|---|---|---:|---|---|
| JB Hi-Fi | Product/category collection pages not explicitly disallowed; `/search` and query params are disallowed. | YELLOW | YELLOW | Shopify robots permits clean collection paths but disallows search and several filtered URLs. ToS page is JavaScript-heavy; no scraper-specific grant found. Use sitemap/category URLs only after manual confirmation. |
| Harvey Norman | Product/category `.html` pages appear allowed; `/catalogsearch/`, `/search/`, checkout/customer paths and many filters are disallowed. | YELLOW | YELLOW | Robots is specific and allows `.html`; avoid search/filter URLs. Terms page was protected by bot mitigation in curl. Manual legal review needed before any run. |
| The Good Guys | Shopify collections appear allowed except sort/filter/search; `/products/` is disallowed. | YELLOW | RED for product pages, YELLOW for category metadata | Product detail scraping is disallowed by robots. Category/list metadata may be possible, but detail URLs must not be fetched. |
| Appliances Online | Ordinary user-agent only disallowed `/checkout`; sitemap category/product URLs are listed. | YELLOW | GREEN for POC | Best reference target for a report-only scraper. Use category pages, obey rate limit, and keep facts-only extraction. |
| Bing Lee | `robots.txt` fetch from curl returned DataDome 403/captcha page. | YELLOW | RED | Anti-bot response means do not automate. Treat as blocked until Bing Lee provides permission or a crawlable robots file can be accessed reliably. |

## JB Hi-Fi

Sources checked:

- robots.txt: https://www.jbhifi.com.au/robots.txt
- Help/terms candidate: https://www.jbhifi.com.au/pages/help-and-support/360053005194-Terms-of-use

Robots observations:

- `User-agent: *` disallows `/search`, `/*?q*`, `/account`, `/cart`, `/checkout`, `/orders`, `/pages/sku/*`, and several Shopify technical paths.
- Clean `/collections/...` paths are not globally disallowed, but sorted/filtered collection variants are disallowed.
- `Nutch` is explicitly disallowed. FitApplianceBot must not identify as Nutch or use generic crawler identities.

Terms observations:

- The public terms candidate is JavaScript-heavy and not easily rendered to plain text by curl.
- No explicit permission for automated extraction was found during this audit.

Decision: **YELLOW**.

FitAppliance should not scrape JB Hi-Fi search or query URLs. A future crawler could consider sitemap-listed collection pages only after a manual review confirms ToS acceptance risk. Do not copy descriptions or images.

## Harvey Norman

Sources checked:

- robots.txt: https://www.harveynorman.com.au/robots.txt
- Terms and Conditions: https://www.harveynorman.com.au/terms-and-conditions

Robots observations:

- `Allow: /*.html$` is present for ordinary user-agents.
- Disallowed paths include `/svc/`, `/customer/`, `/checkout/`, `/catalog/`, `/catalogsearch/`, `/search/`, and many filter/query patterns.
- Sitemaps are published under `/media/sitemap...xml`.

Terms observations:

- The terms URL returned bot-mitigation headers and a short HTML response through curl, so this audit could not reliably extract the website terms text.
- Search snippets confirm the page is purchase-terms focused, but the website-use terms still need manual review.

Decision: **YELLOW**.

Robots suggests plain `.html` category/product pages may be crawlable, but search/filter paths are not. Do not run automated scraping until the website terms are manually reviewed.

## The Good Guys

Sources checked:

- robots.txt: https://www.thegoodguys.com.au/robots.txt
- Website Terms of Use: https://www.thegoodguys.com.au/website-terms-of-use

Robots observations:

- Disallowed paths include `/products/`, `/search`, `/collections/*sort_by*`, filter combinations, checkout/cart/account paths, and several app endpoints.
- Clean collection pages may be crawlable, but product pages are not.

Terms observations:

- The terms say the website contents are copyrighted.
- They allow browser viewing and limited personal/non-commercial copying, while prohibiting other use unless permitted by law.
- They reserve the right to change, remove, stop, or suspend the website.

Decision: **RED for product detail scraping; YELLOW for category/list metadata**.

A reference scraper must not fetch `/products/...` pages. If The Good Guys is used later, use only allowed collection/list pages and facts visible on those pages, subject to manual legal review.

## Appliances Online

Sources checked:

- robots.txt: https://www.appliancesonline.com.au/robots.txt
- Terms candidate: https://www.appliancesonline.com.au/terms-and-conditions/
- Category probe: https://www.appliancesonline.com.au/category/fridges/

Robots observations:

- Ordinary `User-agent: *` only disallows `/checkout`.
- `Bingbot` is separately disallowed from `/search/`.
- Product, category, image, manual, content, and SEO keyword sitemaps are published.
- Category URLs such as `/category/fridges/`, `/category/dishwashers/`, `/category/dryers/`, and `/category/washing-machines/` returned HTTP 200 in this audit.

Terms observations:

- The website terms page exists and redirects to a trailing slash URL, but the rendered HTML is app-style and did not expose clear scraper terms in this quick pass.
- Several promotion terms mention automated entry bans, but those apply to promotions rather than catalogue browsing.

Decision: **GREEN for POC**.

Appliances Online is the reference scraper target because robots allows category pages for ordinary user-agents, category pages return 200, and the POC is facts-only/report-only. Keep the run manual, low-rate, and non-persistent.

## Bing Lee

Sources checked:

- robots.txt: https://www.binglee.com.au/robots.txt
- Terms of Sale: https://www.binglee.com.au/articles/help/terms-of-sale
- Website Terms of Use: https://www.binglee.com.au/articles/help/terms-of-sale/website-terms-of-use

Robots observations:

- Direct curl to `/robots.txt` returned HTTP 403 with a DataDome captcha page.
- Because robots could not be read reliably by the scraper client, automation should abort.

Terms observations:

- Website terms require users not to disrupt the website or electronic systems.
- They also require users not to circumvent website security systems.
- Copyright terms prohibit modifying, reproducing, broadcasting, printing, publishing, or creating derivative works without written consent, except as legally permitted.

Decision: **RED**.

Bing Lee has active anti-bot protection in front of robots.txt from this environment. Do not scrape Bing Lee unless written permission or an approved feed/API is obtained.

## Go / no-go summary

Path A remains viable only as a cautious POC:

- **Go:** Appliances Online category pages, report-only, low-rate, facts-only.
- **Hold:** JB Hi-Fi and Harvey Norman until manual ToS review and URL-specific robots checks are complete.
- **Limited:** The Good Guys category/list pages only; no `/products/` requests.
- **No-go:** Bing Lee due DataDome/robots access failure.

Recommended next decision after the POC report:

1. Run Appliances Online fridges manually and inspect match rate.
2. If match rate is useful, request explicit affiliate/data-feed permission from the other retailers.
3. Prefer official affiliate/product feeds over crawling wherever available.
