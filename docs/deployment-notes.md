# Deployment Notes

## Canonical Host

`https://www.fitappliance.com.au` is the canonical production host used by canonical tags, hreflang links, JSON-LD, sitemap URLs, and IndexNow payloads.

`https://fitappliance.com.au` must permanently redirect to the matching `www` URL.

The active redirect is a Vercel project-domain setting:

- Domain: `fitappliance.com.au`
- Redirect target: `www.fitappliance.com.au`
- Redirect status code: `308`

`vercel.json` also includes a host-conditional permanent redirect rule as a repository-level guardrail, but Vercel's project-domain redirect can run before route-level config. If production ever returns `307` again, check the project-domain `redirectStatusCode` first.

## Verification after deployment

```bash
curl -I https://fitappliance.com.au/ # should be HTTP/2 308 to https://www.fitappliance.com.au/
curl -I https://fitappliance.com.au/ads.txt # should be HTTP/2 308 to https://www.fitappliance.com.au/ads.txt
curl -I https://www.fitappliance.com.au/sitemap.xml # should be HTTP/2 200
```
