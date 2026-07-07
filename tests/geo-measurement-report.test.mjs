import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildGeoMeasurementReport,
  generateGeoMeasurementReport,
  normalizeRoute,
  parseCitationCsv
} = require('../scripts/generate-geo-measurement-report.js');

function makeTempRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-geo-measurement-'));
  fs.mkdirSync(path.join(repoRoot, 'data'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'docs', 'phase43-geo-experiment'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'reports', 'gsc-genai-import'), { recursive: true });
  return repoRoot;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeFixture(repoRoot) {
  const engines = ['google_ai_overviews', 'perplexity'];
  writeJson(path.join(repoRoot, 'data', 'geo-treatment-pages.json'), {
    schema_version: 1,
    experiment: 'phase43-geo',
    treatment: [
      {
        route: '/guides/fridge-clearance-requirements',
        template: 'guide',
        primary_query: 'How much clearance does a fridge need in Australia?',
        match_key: 'guide:fridge-clearance',
        evidence_level: 'visible-answer-and-evidence-block',
        measurement_bucket: 'guide-core'
      },
      {
        route: '/fit-check/model-a-in-640mm-cavity',
        template: 'fit-check',
        primary_query: 'Will Model A fit a 640mm cavity?',
        match_key: 'fit-check:dishwasher:640:pair-a',
        evidence_level: 'dimension-axis-pass',
        measurement_bucket: 'fit-check-dishwasher-640'
      }
    ],
    controls: [
      {
        route: '/fit-check/model-b-in-640mm-cavity',
        template: 'fit-check',
        primary_query: 'Will Model B fit a 640mm cavity?',
        match_key: 'fit-check:dishwasher:640:pair-a',
        evidence_level: 'dimension-axis-pass',
        measurement_bucket: 'fit-check-dishwasher-640'
      }
    ]
  });

  writeJson(path.join(repoRoot, 'data', 'geo-query-set.json'), {
    schema_version: 1,
    experiment: 'phase43-geo',
    frozen_at: '2026-07-07',
    baseline: {
      start_date: '2026-06-23',
      end_date: '2026-07-06'
    },
    observation: {
      start_date: '2026-07-07',
      minimum_days: 28,
      review_days: [14, 28, 56]
    },
    engines,
    capture_requirements: {
      country: 'AU',
      locale: 'en-AU',
      device: 'desktop'
    },
    queries: [
      {
        id: 'guide-fridge-clearance-au',
        query: 'How much clearance does a fridge need in Australia?',
        intent: 'informational',
        template: 'guide',
        measurement_bucket: 'guide-core',
        country: 'AU',
        locale: 'en-AU',
        device: 'desktop',
        treatment_routes: ['/guides/fridge-clearance-requirements'],
        control_routes: [],
        engines
      },
      {
        id: 'fit-check-dishwasher-640',
        query: 'Will Model A fit a 640mm cavity?',
        intent: 'fit-check',
        template: 'fit-check',
        measurement_bucket: 'fit-check-dishwasher-640',
        country: 'AU',
        locale: 'en-AU',
        device: 'desktop',
        treatment_routes: ['/fit-check/model-a-in-640mm-cavity'],
        control_routes: ['/fit-check/model-b-in-640mm-cavity'],
        engines
      }
    ]
  });

  writeJson(path.join(repoRoot, 'reports', 'gsc-genai-import', 'latest.json'), {
    schema_version: 1,
    source: 'gsc-generative-ai-export',
    summary: {
      totalImpressions: 9,
      pageRows: 3,
      countryRows: 0,
      deviceRows: 0,
      dateRows: 0
    },
    pages: [
      { page: '/guides/fridge-clearance-requirements', impressions: 5 },
      { page: 'https://www.fitappliance.com.au/fit-check/model-a-in-640mm-cavity', impressions: 3 },
      { page: '/fit-check/model-b-in-640mm-cavity', impressions: 1 }
    ],
    countries: [],
    devices: [],
    dates: []
  });

  writeJson(path.join(repoRoot, 'reports', 'gsc-latest.json'), {
    generatedAt: '2026-07-07T00:00:00.000Z',
    summary: {
      rowCount: 3,
      totalClicks: 3,
      totalImpressions: 50
    },
    rows: [
      { query: 'fridge clearance', page: 'https://www.fitappliance.com.au/guides/fridge-clearance-requirements', clicks: 1, impressions: 20, ctr: 0.05, position: 8 },
      { query: 'model a 640 cavity', page: '/fit-check/model-a-in-640mm-cavity', clicks: 2, impressions: 25, ctr: 0.08, position: 5 },
      { query: 'model b 640 cavity', page: '/fit-check/model-b-in-640mm-cavity', clicks: 0, impressions: 5, ctr: 0, position: 19 }
    ]
  });

  fs.writeFileSync(
    path.join(repoRoot, 'docs', 'phase43-geo-experiment', 'geo-ai-citation-log.csv'),
    [
      'date,engine,country,device,prompt,route_group,expected_route,cited_url,cited_domain,citation_position,answer_claim,claim_status,notes',
      '2026-07-07,perplexity,AU,desktop,"How much clearance does a fridge need in Australia?",treatment,/guides/fridge-clearance-requirements,https://www.fitappliance.com.au/guides/fridge-clearance-requirements,www.fitappliance.com.au,1,"mentions cavity clearance",correct,ok',
      '2026-07-07,chatgpt_browsing,AU,desktop,"Will Model A fit?",treatment,/fit-check/model-a-in-640mm-cavity,https://example.com/not-fit,example.com,2,"wrong citation",correct,bad url',
      '2026-07-07,perplexity,AU,desktop,"Will Model B fit?",control,/fit-check/model-b-in-640mm-cavity,https://www.fitappliance.com.au/fit-check/model-b-in-640mm-cavity,www.fitappliance.com.au,1,"not materially correct",incorrect,bad claim',
      ''
    ].join('\n'),
    'utf8'
  );
}

test('normalizeRoute resolves absolute URLs, trailing slashes, and root', () => {
  assert.equal(normalizeRoute('https://www.fitappliance.com.au/fit-check/model-a-in-640mm-cavity?utm=1'), '/fit-check/model-a-in-640mm-cavity');
  assert.equal(normalizeRoute('/guides/fridge-clearance-requirements/'), '/guides/fridge-clearance-requirements');
  assert.equal(normalizeRoute('https://example.com/other'), '/other');
  assert.equal(normalizeRoute(''), '');
});

test('parseCitationCsv keeps quoted prompts and detects useful citation requirements', () => {
  const rows = parseCitationCsv([
    'date,engine,country,device,prompt,route_group,expected_route,cited_url,cited_domain,citation_position,answer_claim,claim_status,notes',
    '2026-07-07,perplexity,AU,desktop,"Prompt, with comma",treatment,/guides/fridge-clearance-requirements,https://www.fitappliance.com.au/guides/fridge-clearance-requirements,www.fitappliance.com.au,1,"claim",correct,ok'
  ].join('\n'));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].prompt, 'Prompt, with comma');
  assert.equal(rows[0].claim_status, 'correct');
});

test('buildGeoMeasurementReport joins query set, manifest, GSC, GenAI, and manual citations', () => {
  const repoRoot = makeTempRepo();
  writeFixture(repoRoot);

  const report = buildGeoMeasurementReport({
    manifest: JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'geo-treatment-pages.json'), 'utf8')),
    querySet: JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'geo-query-set.json'), 'utf8')),
    genAiReport: JSON.parse(fs.readFileSync(path.join(repoRoot, 'reports', 'gsc-genai-import', 'latest.json'), 'utf8')),
    gscReport: JSON.parse(fs.readFileSync(path.join(repoRoot, 'reports', 'gsc-latest.json'), 'utf8')),
    manualCitations: parseCitationCsv(fs.readFileSync(path.join(repoRoot, 'docs', 'phase43-geo-experiment', 'geo-ai-citation-log.csv'), 'utf8')),
    generatedAt: '2026-07-07T00:00:00.000Z'
  });

  const treatmentRoute = report.routes.find((row) => row.route === '/fit-check/model-a-in-640mm-cavity');
  const controlRoute = report.routes.find((row) => row.route === '/fit-check/model-b-in-640mm-cavity');
  const bucket = report.buckets.find((row) => row.measurement_bucket === 'fit-check-dishwasher-640');

  assert.equal(report.summary.routeCount, 3);
  assert.equal(report.summary.queryCount, 2);
  assert.equal(report.summary.usefulManualCitationCount, 1);
  assert.equal(report.dataAvailability.gscGenAiImport.available, true);
  assert.equal(report.dataAvailability.gscSearchAnalytics.available, true);
  assert.equal(treatmentRoute.genAiImpressions, 3);
  assert.equal(treatmentRoute.gsc.impressions, 25);
  assert.equal(treatmentRoute.manualCitations.total, 1);
  assert.equal(treatmentRoute.manualCitations.useful, 0);
  assert.equal(controlRoute.genAiImpressions, 1);
  assert.deepEqual(bucket.treatment, {
    routeCount: 1,
    genAiImpressions: 3,
    gscClicks: 2,
    gscImpressions: 25,
    usefulManualCitations: 0
  });
  assert.deepEqual(bucket.control, {
    routeCount: 1,
    genAiImpressions: 1,
    gscClicks: 0,
    gscImpressions: 5,
    usefulManualCitations: 0
  });
});

test('generateGeoMeasurementReport writes JSON and package script is wired', async () => {
  const repoRoot = makeTempRepo();
  writeFixture(repoRoot);
  const outputPath = path.join(repoRoot, 'reports', 'geo', 'measurement-latest.json');

  const report = await generateGeoMeasurementReport({
    repoRoot,
    outputPath,
    write: true,
    generatedAt: '2026-07-07T00:00:00.000Z',
    logger: { log() {} }
  });

  assert.equal(fs.existsSync(outputPath), true);
  const written = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(written.summary.routeCount, report.summary.routeCount);

  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['geo-measurement-report'], 'node scripts/generate-geo-measurement-report.js');
});
