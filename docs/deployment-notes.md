# Deployment Notes

## Canonical Host

`https://www.fitappliance.com.au` is the canonical production host used by canonical tags, hreflang links, JSON-LD, sitemap URLs, and IndexNow payloads.

`https://fitappliance.com.au` must permanently redirect to the matching `www` URL.

The active redirect is a Vercel project-domain setting:

- Domain: `fitappliance.com.au`
- Redirect target: `www.fitappliance.com.au`
- Redirect status code: `308`

`vercel.json` also includes a host-conditional permanent redirect rule as a repository-level guardrail, but Vercel's project-domain redirect can run before route-level config. If production ever returns `307` again, check the project-domain `redirectStatusCode` first.

## Static publication artifact

Vercel publishes only the generated `.site-public/` artifact. The canonical
build completes first, then `npm run build:public-deployment` copies only the
reviewed root entry pages, `public/`, and `pages/` into a fresh artifact.
Interrupted generated stage and backup directories use ignored
`.site-public-stage-*` and `.site-public-backup-*` names.

Repository `data/`, source, documentation, tests, reports, and local PDF
evidence are not static deployment inputs. `/pdf-evidence/:path*` resolves only
to the explicitly public `/public/pdf-evidence/` namespace; no local PDFs are
approved there in this hotfix, so absent paths correctly return 404.

## Verification after deployment

```bash
curl -I https://fitappliance.com.au/ # should be HTTP/2 308 to https://www.fitappliance.com.au/
curl -I https://fitappliance.com.au/ads.txt # should be HTTP/2 308 to https://www.fitappliance.com.au/ads.txt
curl -I https://www.fitappliance.com.au/sitemap.xml # should be HTTP/2 200
```
