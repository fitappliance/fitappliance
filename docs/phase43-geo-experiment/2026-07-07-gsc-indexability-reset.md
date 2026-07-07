# GSC Indexability Reset

Date: 2026-07-07

## Problem

Google Search Console reported `Crawled - currently not indexed` validation failure for `https://fitappliance.com.au/`.

Observed GSC sample set:

- Query app states: `/?cat=fridge&w=780&h=1800&d=700`, `/?cat=fridge&w=900&h=1800&d=700&door=770`
- Thin or stale programmatic URLs: `/cavity/610mm-fridge`, `/doorway/810mm-fridge-doorway`, `/location/canberra/dishwasher`, `/brands/comfee-dishwasher-clearance`, `/brands/tuscany-fridge-clearance`
- Keep-indexable trust/editorial URLs: `/about/editorial-standards`, `/guides/appliance-fit-sizing-handbook`
- One stale comparison path redirected live: `/compare/euro-vs-robinhood-dryer-clearance`

The failure mode is not a schema-only problem. The site was submitting too many low-uniqueness programmatic URLs before Google had enough confidence in the domain and page set.

## Decision

Treat GEO as dependent on conventional crawl and indexing quality.

The XML sitemap now uses `data/indexability-policy.json` as a crawl-budget gate:

- Static trust pages, guides, fit-check experiment pages, and verified product pages remain indexable.
- Brand clearance pages require at least 10 models before sitemap inclusion.
- Comparison pages require at least 20 total models and at least 5 models on each side.
- Cavity, doorway, and location programmatic pages are temporarily held out of the sitemap and carry `noindex, follow`.
- Homepage query URLs are classified as app states, not canonical landing pages.
- `/account` is explicitly `noindex, follow`.

This keeps low-value generated pages crawlable for link discovery while preventing them from competing as index candidates.

## Validation Commands

```bash
npm run build
npm run generate-cavity
npm run generate-doorway
npm run audit-indexability-policy
npm run gsc-indexing-audit
npm test
```

`npm run build` does not currently rebuild cavity or doorway pages, so the two explicit generation commands are required before `audit-indexability-policy`.

## GSC Operating Steps

1. Deploy the policy and regenerated sitemap.
2. In Search Console, submit `https://www.fitappliance.com.au/sitemap.xml`.
3. Do not restart validation until the deployed sitemap has dropped held routes.
4. Use URL Inspection on priority pages only:
   - `/`
   - `/about/editorial-standards`
   - `/guides/appliance-fit-sizing-handbook`
   - one `/fit-check/` treatment page
   - one high-evidence product page
5. Treat query URL samples as application-state cleanup, not as page-quality fixes.
6. Wait for the next GSC crawl cycle before expanding held page groups.

## Expansion Gates

Do not re-add held page groups to the sitemap until the matching content gate is true:

- Brand pages below 10 models: add unique evidence, retailer/manual coverage, or keep held.
- Compare pages below threshold: require enough model coverage on both sides.
- Cavity/doorway pages: add visible evidence blocks, answer quality, and route-specific fit examples before allowing index.
- Location pages: add genuine local value such as state retailer availability, delivery constraints, installer context, or remove from search surface.

References used for the policy:

- Google Search Central, URL structure: https://developers.google.com/search/docs/crawling-indexing/url-structure
- Google Search Central, robots meta and noindex behavior: https://developers.google.com/search/docs/crawling-indexing/block-indexing
- Search Console indexing reasons: https://support.google.com/webmasters/answer/7440203
