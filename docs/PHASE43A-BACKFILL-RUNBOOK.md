# Phase 43A Backfill Runbook

## What this workflow does

`research-popularity.yml` extends the Phase 42A popularity scaffold into a resumable catalog backfill.
Each run:

1. reads the split appliance catalog from `public/data/*.json`
2. researches up to `RESEARCH_BATCH_SIZE` products (default `500`)
3. writes `data/popularity-research.json`
4. reruns `scripts/enrich-appliances.js`
5. commits only data changes back to `main`

## How to trigger the first run

1. Open GitHub Actions
2. Select `Research Popularity Backfill`
3. Click `Run workflow`
4. Leave the branch as `main`

## How to check cursor progress

After each run, inspect the latest committed `data/popularity-research.json` and compare:

- `cursor`
- `totalCatalog`
- `researched`
- `skipped.length`

The run is complete when `cursor >= totalCatalog`.

## Expected runtime and cadence

- Catalog size after Phase 42A: about `2170` products
- Batch size per run: `500`
- Expected dispatch count: `Math.ceil(2170 / 500) = 5`
- Practical completion window: `5-7` runs depending on skipped retailer pages and retries

## Failure and rollback steps

If a run fails:

1. Open the failed workflow log
2. Confirm whether the failure happened during research, enrich, or git push
3. If the failure is transient, rerun the job from GitHub Actions
4. If a bad data commit lands, revert that single bot commit on `main`
5. Re-run the workflow after the revert

## Safety rules

- This toolchain only flips `unavailable` from `true` to `false` when researched retailers exist
- Missing research entries do not clear existing `unavailable` flags
- The PR that adds this workflow should not modify `public/data/*.json`
