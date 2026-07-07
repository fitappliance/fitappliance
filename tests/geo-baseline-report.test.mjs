import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  generateGeoBaselineReport,
  routeToHtmlPath
} = require('../scripts/generate-geo-baseline-report.js');

function makeTempRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-geo-baseline-'));
  fs.mkdirSync(path.join(repoRoot, 'data'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'pages', 'guides'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'pages', 'fit-check'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'reports', 'dimension-axis'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'reports', 'gsc-genai-import'), { recursive: true });
  return repoRoot;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeHtml(repoRoot, route) {
  const filePath = routeToHtmlPath(route, repoRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '<!doctype html><title>Fixture</title>', 'utf8');
}

function writeFixture(repoRoot, { includeControlHtml = true } = {}) {
  const manifest = {
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
  };
  const querySet = {
    schema_version: 1,
    experiment: 'phase43-geo',
    frozen_at: '2026-07-07',
    timezone: 'Australia/Perth',
    baseline: {
      start_date: '2026-06-23',
      end_date: '2026-07-06',
      source: 'pre-remediation snapshot'
    },
    observation: {
      start_date: '2026-07-07',
      minimum_days: 28,
      review_days: [14, 28, 56]
    },
    engines: ['google_ai_overviews', 'google_ai_mode', 'perplexity', 'chatgpt_browsing'],
    capture_requirements: {
      country: 'AU',
      locale: 'en-AU',
      device: 'desktop',
      requires_raw_answer: true,
      requires_cited_url: true,
      requires_canonical_route: true,
      requires_observed_at: true,
      requires_evidence_path: true
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
        engines: ['google_ai_overviews', 'google_ai_mode', 'perplexity', 'chatgpt_browsing']
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
        engines: ['google_ai_overviews', 'google_ai_mode', 'perplexity', 'chatgpt_browsing']
      }
    ]
  };

  writeJson(path.join(repoRoot, 'data', 'geo-treatment-pages.json'), manifest);
  writeJson(path.join(repoRoot, 'data', 'geo-query-set.json'), querySet);
  writeJson(path.join(repoRoot, 'reports', 'schema-validation.json'), {
    method: 'local-json-ld-parser',
    pagesChecked: 12,
    jsonLdBlocks: 18,
    errors: 0,
    issues: [{ file: 'pages/example.html', issue: 'fixture issue should not be copied into baseline' }]
  });
  writeJson(path.join(repoRoot, 'reports', 'dimension-axis', 'latest.json'), {
    summary: {
      blockerCount: 0,
      warningCount: 3
    },
    issues: [{ route: '/fixture', issue: 'fixture issue should not be copied into baseline' }]
  });
  writeJson(path.join(repoRoot, 'reports', 'gsc-genai-import', 'latest.json'), {
    summary: {
      rowsImported: 4,
      totalImpressions: 11
    }
  });

  writeHtml(repoRoot, '/guides/fridge-clearance-requirements');
  writeHtml(repoRoot, '/fit-check/model-a-in-640mm-cavity');
  if (includeControlHtml) writeHtml(repoRoot, '/fit-check/model-b-in-640mm-cavity');
}

test('routeToHtmlPath resolves root and nested generated routes', () => {
  const repoRoot = '/tmp/fitappliance-fixture';

  assert.equal(routeToHtmlPath('/', repoRoot), path.join(repoRoot, 'index.html'));
  assert.equal(
    routeToHtmlPath('/fit-check/model-a-in-640mm-cavity', repoRoot),
    path.join(repoRoot, 'pages', 'fit-check', 'model-a-in-640mm-cavity.html')
  );
});

test('generateGeoBaselineReport summarizes query, route, and source-report coverage', async () => {
  const repoRoot = makeTempRepo();
  writeFixture(repoRoot);

  const report = await generateGeoBaselineReport({
    repoRoot,
    write: false,
    generatedAt: '2026-07-07T00:00:00.000Z',
    logger: { log() {} }
  });

  assert.equal(report.schema_version, 1);
  assert.equal(report.method, 'phase43-geo-baseline');
  assert.equal(report.generatedAt, '2026-07-07T00:00:00.000Z');
  assert.equal(report.summary.queryCount, 2);
  assert.equal(report.summary.treatmentRouteCount, 2);
  assert.equal(report.summary.controlRouteCount, 1);
  assert.equal(report.summary.missingRouteCount, 0);
  assert.deepEqual(report.coverage.uncoveredTreatmentRoutes, []);
  assert.deepEqual(report.coverage.uncoveredControlRoutes, []);
  assert.equal(report.sourceReports.schemaValidation.errors, 0);
  assert.equal(report.sourceReports.schemaValidation.issues, undefined);
  assert.equal(report.sourceReports.dimensionAxis.summary.blockerCount, 0);
  assert.equal(report.sourceReports.dimensionAxis.issues, undefined);
  assert.equal(report.sourceReports.gscGenerativeAiImport.summary.rowsImported, 4);
});

test('generateGeoBaselineReport reports missing and uncovered manifest routes', async () => {
  const repoRoot = makeTempRepo();
  writeFixture(repoRoot, { includeControlHtml: false });
  const querySetPath = path.join(repoRoot, 'data', 'geo-query-set.json');
  const querySet = JSON.parse(fs.readFileSync(querySetPath, 'utf8'));
  querySet.queries[1].control_routes = [];
  writeJson(querySetPath, querySet);

  const report = await generateGeoBaselineReport({
    repoRoot,
    write: false,
    logger: { log() {} }
  });

  assert.equal(report.summary.missingRouteCount, 0, 'unreferenced missing control HTML is reported as uncovered, not missing');
  assert.deepEqual(report.coverage.uncoveredControlRoutes, ['/fit-check/model-b-in-640mm-cavity']);
  assert.equal(report.summary.blockerCount, 1);
});
