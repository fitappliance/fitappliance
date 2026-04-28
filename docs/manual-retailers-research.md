# Manual Retailer Research Workflow

Phase 49 uses a hybrid workflow instead of writing retailer data directly from automated research. The scripts collect candidate links, then a human reviews each URL before anything enters the catalogue.

## Flow

1. Run the manual workflow:

   ```bash
   gh workflow run research-retailers.yml --ref main -f top=50
   ```

2. Download the `manual-retailers-candidates` artifact from GitHub Actions.
3. Review each candidate in `reports/manual-retailers-candidates-YYYY-MM-DD.json`.
4. Copy only approved entries into `data/manual-retailers.json`, set `approved: true`, and set `approved_by`.
5. Open a PR with the approved JSON change.
6. `npm run enrich-manual-retailers` merges approved links into `public/data/*.json`; unapproved candidates are ignored.

## Review checklist

- The URL opens the retailer's product page for the exact brand and model.
- The URL is not a search result, collection, category, filtered listing, cart, or checkout URL.
- The product page returns HTTP 200:

  ```bash
  curl -sLI "https://example-retailer/product-url" | head
  ```

- Retailer names use the existing canonical spelling: `JB Hi-Fi`, `Harvey Norman`, `The Good Guys`, `Appliances Online`, or `Bing Lee`.
- If the price is not visible or looks stale, keep `p: null`.
- Use `source: "manual"` for links you personally verified.

## Reject patterns

Reject candidates when the URL contains any of these patterns:

- `/search`, `?q=`, `?query=`, or `?searchTerm=`
- `/collections/`
- `/category/`
- `/cart` or `/checkout`
- A retailer homepage
- A model that only partially matches the FitAppliance product

Prefer product-page paths such as `/products/`, `/product/`, `/p/`, or retailer-specific `.html` product URLs.

## Why this is manual

The five target AU retailers are mostly SPA-heavy, bot-protected, or legally sensitive for direct crawling. This workflow keeps automation to search-result discovery only, and keeps catalogue writes behind human review. That is slower, but it gives us a trustworthy retailer dataset without pretending every automated result is safe to publish.

