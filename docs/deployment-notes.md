# Deployment Notes

## Apex Domain → Direct 200 for ads.txt

**Current state:** `fitappliance.com.au` redirects (307) to `www.fitappliance.com.au`.
The IAB spec allows one redirect for ads.txt, so this is technically compliant.
However, to serve the apex domain directly:

**Manual step in Vercel Dashboard:**
1. Go to: fitappliance project → Settings → Domains
2. If `www.fitappliance.com.au` is set as "Primary Domain", click the ⋮ menu next to `fitappliance.com.au`
3. Select "Redirect to this domain" → change the redirect to go FROM www TO apex
4. Alternatively: click "Set as Primary" on `fitappliance.com.au`
5. After saving, both `fitappliance.com.au/ads.txt` and `www.fitappliance.com.au/ads.txt` return 200

**No code change required** — `v2/vercel.json` already has correct routing.
The redirect is configured at the Vercel platform CDN level, not in vercel.json.

## Verification after domain change:
```bash
curl -I https://fitappliance.com.au/ads.txt # should be HTTP/2 200
curl -I https://fitappliance.com.au/robots.txt # should be HTTP/2 200
curl -I https://fitappliance.com.au/sitemap.xml # should be HTTP/2 200
```
