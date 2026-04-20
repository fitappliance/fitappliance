# Phase 41 Review Video Backfill

Review data for Phase 41 stays manual by design. Do not invent creators, titles, timestamps, or labels.

## Pilot model slugs

Fill only the current pilot models from [`data/videos/review-pilot-slugs.json`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/data/videos/review-pilot-slugs.json):

1. `bosch-kgn396lbas`
2. `electrolux-ehe5267b`
3. `lg-rc802hm2f`
4. `samsung-dw60bg830fssp`
5. `samsung-ww90t684dlh`

## Allowed creators

Use only these `creatorId` values from [`data/videos/creator-whitelist.json`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/data/videos/creator-whitelist.json):

- `choice-au`
- `productreview-au`
- `appliances-online`
- `samsung-au`

## Required per model

- `2` videos per pilot model
- `3` timestamps per video
- `youtubeId`, `title`, `publishedAt`, `durationSec`, and every timestamp label must be entered by hand after checking the source video

## Entry format

Add review rows inside [`data/videos/review-videos.json`](/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2/data/videos/review-videos.json):

```json
{
  "youtubeId": "dQw4w9WgXcQ",
  "creatorId": "choice-au",
  "title": "CHOICE review: Samsung SRF7500WFH",
  "publishedAt": "2025-08-10",
  "durationSec": 487,
  "timestamps": [
    { "t": 42, "label": "Dimensions and fit" },
    { "t": 180, "label": "Noise test" },
    { "t": 310, "label": "Energy score" }
  ],
  "validatedAt": null
}
```

## After backfill

Run these commands in order:

1. `npm run validate-reviews`
2. `npm run generate-all`
3. `npm run audit-review-content`
4. `npm test`

Only commit the data if all four steps pass.
