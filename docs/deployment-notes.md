# Deployment Notes

## Canonical Host

`https://www.fitappliance.com.au` is the canonical production host used by canonical tags, hreflang links, JSON-LD, sitemap URLs, and IndexNow payloads.

`https://fitappliance.com.au` must permanently redirect to the matching `www` URL. The redirect is defined in `vercel.json` with a `host: fitappliance.com.au` condition so it is controlled by the repository instead of only by Vercel's primary-domain redirect.

## Verification after deployment

```bash
curl -I https://fitappliance.com.au/ # should be HTTP/2 308 to https://www.fitappliance.com.au/
curl -I https://fitappliance.com.au/ads.txt # should be HTTP/2 308 to https://www.fitappliance.com.au/ads.txt
curl -I https://www.fitappliance.com.au/sitemap.xml # should be HTTP/2 200
```
