import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const repoRoot = '/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2';
const gscModuleUrl = pathToFileURL(path.join(repoRoot, 'scripts', 'gsc-fetch.js')).href;
const gapModuleUrl = pathToFileURL(path.join(repoRoot, 'scripts', 'keyword-gap.js')).href;

test('phase 23 gsc: normalizeSearchAnalyticsRows maps google response rows to report schema', async () => {
  const { normalizeSearchAnalyticsRows } = await import(gscModuleUrl);
  const rows = normalizeSearchAnalyticsRows([
    {
      keys: ['lg fridge clearance australia', 'https://fitappliance.com.au/brands/lg-fridge-clearance'],
      clicks: 18,
      impressions: 240,
      ctr: 0.075,
      position: 9.4
    }
  ]);

  assert.deepEqual(rows[0], {
    query: 'lg fridge clearance australia',
    page: 'https://fitappliance.com.au/brands/lg-fridge-clearance',
    clicks: 18,
    impressions: 240,
    ctr: 0.075,
    position: 9.4
  });
});

test('phase 23 gsc: validateSearchAnalyticsRows enforces ctr range [0,1]', async () => {
  const { validateSearchAnalyticsRows } = await import(gscModuleUrl);
  assert.throws(
    () => validateSearchAnalyticsRows([{ query: 'q', page: 'https://fitappliance.com.au/', clicks: 1, impressions: 10, ctr: 1.2, position: 4.2 }]),
    /ctr/i
  );
});

test('phase 23 gsc: validateSearchAnalyticsRows enforces positive search position', async () => {
  const { validateSearchAnalyticsRows } = await import(gscModuleUrl);
  assert.throws(
    () => validateSearchAnalyticsRows([{ query: 'q', page: 'https://fitappliance.com.au/', clicks: 1, impressions: 10, ctr: 0.2, position: 0 }]),
    /position/i
  );
});

test('phase 23 gsc: fetchGscReport writes a dated report file with mocked google client', async () => {
  const { fetchGscReport } = await import(gscModuleUrl);
  const reportsDir = await mkdtemp(path.join(tmpdir(), 'fitappliance-gsc-'));

  const serviceAccountJson = JSON.stringify({
    type: 'service_account',
    project_id: 'fitappliance',
    private_key_id: 'abc123',
    private_key: '-----BEGIN PRIVATE KEY-----\\nTEST\\n-----END PRIVATE KEY-----\\n',
    client_email: 'gsc-bot@fitappliance.iam.gserviceaccount.com',
    client_id: '1234567890',
    token_uri: 'https://oauth2.googleapis.com/token'
  });

  const result = await fetchGscReport({
    reportsDir,
    today: '2026-04-18',
    serviceAccountJson,
    searchanalyticsQueryFn: async () => ({
      data: {
        rows: [
          {
            keys: ['samsung fridge clearance', 'https://fitappliance.com.au/brands/samsung-fridge-clearance'],
            clicks: 9,
            impressions: 110,
            ctr: 0.0818,
            position: 7.2
          }
        ]
      }
    }),
    logger: { log() {} }
  });

  assert.equal(result.summary.rowCount, 1);
  assert.equal(result.rows[0].query, 'samsung fridge clearance');
  assert.equal(result.rows[0].position > 0, true);

  const outputPath = path.join(reportsDir, 'gsc-2026-04-18.json');
  const written = JSON.parse(await readFile(outputPath, 'utf8'));
  assert.equal(written.summary.rowCount, 1);
  assert.equal(written.rows[0].ctr <= 1 && written.rows[0].ctr >= 0, true);
});

test('phase 23 gsc: buildKeywordGapReport identifies content gaps and page-2 opportunities', async () => {
  const { buildKeywordGapReport } = await import(gapModuleUrl);

  const report = buildKeywordGapReport({
    today: '2026-04-18',
    sitemapUrls: [
      'https://fitappliance.com.au/',
      'https://fitappliance.com.au/brands/lg-fridge-clearance'
    ],
    rows: [
      {
        query: 'lg fridge clearance australia',
        page: 'https://fitappliance.com.au/brands/lg-fridge-clearance',
        clicks: 4,
        impressions: 120,
        ctr: 0.0333,
        position: 14.2
      },
      {
        query: 'hisense dryer vent space',
        page: 'https://fitappliance.com.au/',
        clicks: 0,
        impressions: 40,
        ctr: 0,
        position: 22
      }
    ]
  });

  assert.equal(report.summary.optimizationOpportunities, 1);
  assert.equal(report.summary.contentGaps >= 1, true);
  assert.equal(report.opportunities[0].position >= 11 && report.opportunities[0].position <= 20, true);
});

test('phase 23 gsc: writeKeywordGapReport outputs dated markdown report', async () => {
  const { writeKeywordGapReport } = await import(gapModuleUrl);
  const reportsDir = await mkdtemp(path.join(tmpdir(), 'fitappliance-gap-'));

  const outputPath = await writeKeywordGapReport({
    reportsDir,
    report: {
      generatedAt: '2026-04-18T00:00:00.000Z',
      date: '2026-04-18',
      summary: { totalQueries: 2, contentGaps: 1, optimizationOpportunities: 1 },
      contentGaps: [{ query: 'hisense dryer vent space', impressions: 40 }],
      opportunities: [{ query: 'lg fridge clearance australia', page: 'https://fitappliance.com.au/brands/lg-fridge-clearance', position: 14.2 }]
    }
  });

  const markdown = await readFile(outputPath, 'utf8');
  assert.match(markdown, /# Keyword Gap Report/);
  assert.match(markdown, /2026-04-18/);
  assert.match(markdown, /Content gaps/);
});

test('phase 23 gsc: parseServiceAccountJson fails fast when secret is missing', async () => {
  const { parseServiceAccountJson } = await import(gscModuleUrl);
  assert.throws(() => parseServiceAccountJson(''), /GSC_SA_JSON/i);
  assert.throws(() => parseServiceAccountJson('{"invalid":true}'), /client_email/i);
});

test('phase 23 gsc: keyword-gap script can ingest gsc json from disk', async () => {
  const { readRowsFromReportFile } = await import(gapModuleUrl);
  const reportsDir = await mkdtemp(path.join(tmpdir(), 'fitappliance-gap-read-'));
  const reportPath = path.join(reportsDir, 'gsc-sample.json');
  await writeFile(
    reportPath,
    JSON.stringify({
      generatedAt: '2026-04-18T00:00:00.000Z',
      summary: { rowCount: 1 },
      rows: [
        {
          query: 'samsung fridge clearance',
          page: 'https://fitappliance.com.au/brands/samsung-fridge-clearance',
          clicks: 9,
          impressions: 110,
          ctr: 0.0818,
          position: 7.2
        }
      ]
    }),
    'utf8'
  );

  const rows = await readRowsFromReportFile(reportPath);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].query, 'samsung fridge clearance');
});
