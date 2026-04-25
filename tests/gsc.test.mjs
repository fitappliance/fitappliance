import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gscModuleUrl = pathToFileURL(path.join(repoRoot, 'scripts', 'gsc-fetch.js')).href;
const gapModuleUrl = pathToFileURL(path.join(repoRoot, 'scripts', 'keyword-gap.js')).href;

test('phase 23 gsc: normalizeSearchAnalyticsRows maps google response rows to report schema', async () => {
  const { normalizeSearchAnalyticsRows } = await import(gscModuleUrl);
  const rows = normalizeSearchAnalyticsRows([
    {
      keys: ['lg fridge clearance australia', 'https://www.fitappliance.com.au/brands/lg-fridge-clearance'],
      clicks: 18,
      impressions: 240,
      ctr: 0.075,
      position: 9.4
    }
  ]);

  assert.deepEqual(rows[0], {
    query: 'lg fridge clearance australia',
    page: 'https://www.fitappliance.com.au/brands/lg-fridge-clearance',
    clicks: 18,
    impressions: 240,
    ctr: 0.075,
    position: 9.4
  });
});

test('phase 23 gsc: validateSearchAnalyticsRows enforces ctr range [0,1]', async () => {
  const { validateSearchAnalyticsRows } = await import(gscModuleUrl);
  assert.throws(
    () => validateSearchAnalyticsRows([{ query: 'q', page: 'https://www.fitappliance.com.au/', clicks: 1, impressions: 10, ctr: 1.2, position: 4.2 }]),
    /ctr/i
  );
});

test('phase 23 gsc: validateSearchAnalyticsRows enforces positive search position', async () => {
  const { validateSearchAnalyticsRows } = await import(gscModuleUrl);
  assert.throws(
    () => validateSearchAnalyticsRows([{ query: 'q', page: 'https://www.fitappliance.com.au/', clicks: 1, impressions: 10, ctr: 0.2, position: 0 }]),
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
            keys: ['samsung fridge clearance', 'https://www.fitappliance.com.au/brands/samsung-fridge-clearance'],
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
  assert.equal(result.siteUrl, 'sc-domain:fitappliance.com.au');

  const outputPath = path.join(reportsDir, 'gsc-2026-04-18.json');
  const written = JSON.parse(await readFile(outputPath, 'utf8'));
  assert.equal(written.summary.rowCount, 1);
  assert.equal(written.rows[0].ctr <= 1 && written.rows[0].ctr >= 0, true);
});

test('phase 23 gsc: fetchGscReport falls back from domain property to url-prefix when permission is missing', async () => {
  const { fetchGscReport } = await import(gscModuleUrl);

  const serviceAccountJson = JSON.stringify({
    type: 'service_account',
    project_id: 'fitappliance',
    private_key_id: 'abc123',
    private_key: '-----BEGIN PRIVATE KEY-----\\nTEST\\n-----END PRIVATE KEY-----\\n',
    client_email: 'gsc-bot@fitappliance.iam.gserviceaccount.com',
    client_id: '1234567890',
    token_uri: 'https://oauth2.googleapis.com/token'
  });

  const calls = [];
  const result = await fetchGscReport({
    write: false,
    today: '2026-04-18',
    serviceAccountJson,
    searchanalyticsQueryFn: async (request) => {
      calls.push(request.siteUrl);
      if (request.siteUrl === 'sc-domain:fitappliance.com.au') {
        throw new Error("User does not have sufficient permission for site 'sc-domain:fitappliance.com.au'.");
      }
      return {
        data: {
          rows: [
            {
              keys: ['fit appliance', 'https://www.fitappliance.com.au/'],
              clicks: 3,
              impressions: 50,
              ctr: 0.06,
              position: 12.3
            }
          ]
        }
      };
    },
    logger: { log() {} }
  });

  assert.deepEqual(calls, ['sc-domain:fitappliance.com.au', 'https://www.fitappliance.com.au/']);
  assert.equal(result.siteUrl, 'https://www.fitappliance.com.au/');
  assert.equal(result.summary.rowCount, 1);
});

test('phase 43a gsc: fetchGscReport accepts split service-account env secrets', async () => {
  const { fetchGscReport } = await import(gscModuleUrl);

  const result = await fetchGscReport({
    write: false,
    today: '2026-04-18',
    env: {
      GSC_SA_EMAIL: 'split-gsc@fitappliance.iam.gserviceaccount.com',
      GSC_SA_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nSPLIT\\n-----END PRIVATE KEY-----\\n',
      GSC_SA_PROJECT_ID: 'split-project'
    },
    searchanalyticsQueryFn: async () => ({
      data: {
        rows: [
          {
            keys: ['lg fridge clearance', 'https://www.fitappliance.com.au/brands/lg-fridge-clearance'],
            clicks: 7,
            impressions: 90,
            ctr: 0.0777,
            position: 8.4
          }
        ]
      }
    }),
    logger: { log() {} }
  });

  assert.equal(result.summary.rowCount, 1);
  assert.equal(result.rows[0].query, 'lg fridge clearance');
});

test('phase 43a gsc: fetchGscReport keeps legacy GSC_SA_JSON env fallback', async () => {
  const { fetchGscReport } = await import(gscModuleUrl);

  const result = await fetchGscReport({
    write: false,
    today: '2026-04-18',
    env: {
      GSC_SA_JSON: JSON.stringify({
        project_id: 'legacy-project',
        private_key: '-----BEGIN PRIVATE KEY-----\\nLEGACY\\n-----END PRIVATE KEY-----\\n',
        client_email: 'legacy-gsc@fitappliance.iam.gserviceaccount.com'
      })
    },
    searchanalyticsQueryFn: async () => ({
      data: {
        rows: [
          {
            keys: ['samsung fridge clearance', 'https://www.fitappliance.com.au/brands/samsung-fridge-clearance'],
            clicks: 4,
            impressions: 70,
            ctr: 0.0571,
            position: 10.1
          }
        ]
      }
    }),
    logger: { log() {} }
  });

  assert.equal(result.summary.rowCount, 1);
  assert.equal(result.rows[0].query, 'samsung fridge clearance');
});

test('phase 23 gsc: buildKeywordGapReport identifies content gaps and page-2 opportunities', async () => {
  const { buildKeywordGapReport } = await import(gapModuleUrl);

  const report = buildKeywordGapReport({
    today: '2026-04-18',
    sitemapUrls: [
      'https://www.fitappliance.com.au/',
      'https://www.fitappliance.com.au/brands/lg-fridge-clearance'
    ],
    rows: [
      {
        query: 'lg fridge clearance australia',
        page: 'https://www.fitappliance.com.au/brands/lg-fridge-clearance',
        clicks: 4,
        impressions: 120,
        ctr: 0.0333,
        position: 14.2
      },
      {
        query: 'hisense dryer vent space',
        page: 'https://www.fitappliance.com.au/',
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
      opportunities: [{ query: 'lg fridge clearance australia', page: 'https://www.fitappliance.com.au/brands/lg-fridge-clearance', position: 14.2 }]
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
          page: 'https://www.fitappliance.com.au/brands/samsung-fridge-clearance',
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
