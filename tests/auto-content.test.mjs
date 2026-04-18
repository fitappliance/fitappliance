import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = '/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2';
const pipelineModuleUrl = pathToFileURL(path.join(repoRoot, 'scripts', 'auto-content-pipeline.js')).href;
const prModuleUrl = pathToFileURL(path.join(repoRoot, 'scripts', 'open-content-pr.js')).href;

test('phase 34 auto-content: classifyQuery maps cavity intent correctly', async () => {
  const { classifyQuery } = await import(pipelineModuleUrl);
  assert.equal(classifyQuery('dishwasher cavity 600mm'), 'cavity');
  assert.equal(classifyQuery('fridge doorway width 780mm'), 'doorway');
  assert.equal(classifyQuery('samsung fridge dimensions australia'), 'brand');
  assert.equal(classifyQuery('perth fridge fit guide'), 'location');
  assert.equal(classifyQuery('how to measure fridge cavity'), 'how-to');
});

test('phase 34 auto-content: blacklisted commercial intent query is skipped', async () => {
  const { selectCandidates } = await import(pipelineModuleUrl);

  const result = selectCandidates({
    rows: [
      { query: 'buy cheap dishwasher 600mm cavity', page: '/', impressions: 180, ctr: 0.01, position: 14 }
    ],
    sitemapUrls: []
  });

  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected[0].reason, 'blacklist');
});

test('phase 34 auto-content: short query is skipped when fewer than 3 words', async () => {
  const { selectCandidates } = await import(pipelineModuleUrl);

  const result = selectCandidates({
    rows: [{ query: 'samsung fridge', page: '/', impressions: 220, ctr: 0.02, position: 16 }],
    sitemapUrls: []
  });

  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected[0].reason, 'query_too_short');
});

test('phase 34 auto-content: cavity query with weak CTR and page-2 position is accepted and classified', async () => {
  const { selectCandidates } = await import(pipelineModuleUrl);

  const result = selectCandidates({
    rows: [
      {
        query: 'dishwasher cavity 600mm depth guide',
        page: 'https://fitappliance.com.au/',
        impressions: 95,
        ctr: 0.021,
        position: 18.4
      }
    ],
    sitemapUrls: ['https://fitappliance.com.au/cavity/700mm-fridge']
  });

  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].type, 'cavity');
});

test('phase 34 auto-content: query is skipped when sitemap slug similarity is above 0.9', async () => {
  const { selectCandidates } = await import(pipelineModuleUrl);

  const result = selectCandidates({
    rows: [
      {
        query: 'dishwasher cavity 600mm depth guide',
        page: 'https://fitappliance.com.au/',
        impressions: 180,
        ctr: 0.03,
        position: 17.2
      }
    ],
    sitemapUrls: ['https://fitappliance.com.au/guides/dishwasher-cavity-600mm-depth-guide']
  });

  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected[0].reason, 'already_covered');
});

test('phase 34 auto-content: quality gate rejects html without table/dl data block', async () => {
  const { runQualityGate } = await import(pipelineModuleUrl);

  const badHtml = `<!doctype html><html><body>
    <main>
      <h1>dishwasher cavity 600mm depth guide</h1>
      <p>${'data '.repeat(320)}</p>
      <a href="/cavity/600mm-fridge">Internal</a>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage"}</script>
    </main>
  </body></html>`;

  const gate = runQualityGate({
    html: badHtml,
    internalLinkPattern: /\/(cavity|doorway|brands)\//,
    schemaErrors: 0
  });

  assert.equal(gate.ok, false);
  assert.equal(gate.failures.includes('missing_data_block'), true);
});

test('phase 34 auto-content: query with fewer than 3 real data points is skipped', async () => {
  const { ensureMinimumDataPoints } = await import(pipelineModuleUrl);

  const result = ensureMinimumDataPoints([
    { file: 'public/data/fridges.json', line: 10, field: 'model', value: 'A' },
    { file: 'public/data/fridges.json', line: 11, field: 'model', value: 'B' }
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'insufficient_real_data_points');
});

test('phase 34 auto-content: pr plan enforces weekly cap of 10 candidates', async () => {
  const { buildPrPlan } = await import(prModuleUrl);

  const candidates = Array.from({ length: 11 }).map((_, index) => ({
    query: `dishwasher cavity ${600 + index}mm depth guide`,
    slug: `dishwasher-cavity-${600 + index}mm-depth-guide`
  }));

  const plan = buildPrPlan({ candidates, maxPrsPerRun: 10 });

  assert.equal(plan.selected.length, 10);
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.skipped[0].reason, 'rate_limit_max_10');
});
