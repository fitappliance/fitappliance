import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const QUERY_SET_PATH = path.join(ROOT, 'data', 'geo-query-set.json');
const MANIFEST_PATH = path.join(ROOT, 'data', 'geo-treatment-pages.json');

const REQUIRED_CAPTURE_FLAGS = [
  'requires_raw_answer',
  'requires_cited_url',
  'requires_canonical_route',
  'requires_observed_at',
  'requires_evidence_path'
];

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function routeToHtmlPath(route) {
  const cleanRoute = String(route).replace(/^\/+/, '').replace(/\/+$/, '');
  if (!cleanRoute) return path.join(ROOT, 'index.html');
  return path.join(ROOT, 'pages', `${cleanRoute}.html`);
}

function collectManifestRoutes(manifest) {
  return {
    treatmentRoutes: new Set((manifest.treatment ?? []).map((row) => row.route)),
    controlRoutes: new Set((manifest.controls ?? []).map((row) => row.route))
  };
}

function assertIsoDate(value, label) {
  assert.match(String(value ?? ''), /^\d{4}-\d{2}-\d{2}$/, `${label} must be an ISO date`);
}

test('geo query set declares experiment metadata and capture requirements', () => {
  const querySet = loadJson(QUERY_SET_PATH);

  assert.equal(querySet.schema_version, 1);
  assert.equal(querySet.experiment, 'phase43-geo');
  assert.equal(querySet.timezone, 'Australia/Perth');
  assertIsoDate(querySet.frozen_at, 'frozen_at');
  assertIsoDate(querySet.baseline?.start_date, 'baseline.start_date');
  assertIsoDate(querySet.baseline?.end_date, 'baseline.end_date');
  assertIsoDate(querySet.observation?.start_date, 'observation.start_date');
  assert.ok(querySet.baseline.end_date < querySet.observation.start_date, 'baseline must end before observation starts');
  assert.ok(Number.isInteger(querySet.observation.minimum_days) && querySet.observation.minimum_days >= 28);

  assert.ok(Array.isArray(querySet.engines) && querySet.engines.length >= 4, 'engines must list tracked AI/search surfaces');
  assert.equal(querySet.capture_requirements.country, 'AU');
  assert.equal(querySet.capture_requirements.locale, 'en-AU');
  assert.equal(querySet.capture_requirements.device, 'desktop');
  for (const flag of REQUIRED_CAPTURE_FLAGS) {
    assert.equal(querySet.capture_requirements[flag], true, `${flag} must be required`);
  }
});

test('geo query set rows are complete and use the frozen engine/device scope', () => {
  const querySet = loadJson(QUERY_SET_PATH);
  const ids = new Set();

  assert.ok(Array.isArray(querySet.queries));
  assert.ok(querySet.queries.length >= 10, 'query set should cover guide and fit-check buckets');

  for (const row of querySet.queries) {
    assert.equal(typeof row.id, 'string');
    assert.match(row.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(ids.has(row.id), false, `${row.id} must be unique`);
    ids.add(row.id);

    assert.equal(typeof row.query, 'string');
    assert.ok(row.query.trim().length > 0, `${row.id} query must not be empty`);
    assert.ok(['informational', 'fit-check'].includes(row.intent), `${row.id} has unsupported intent`);
    assert.ok(['guide', 'fit-check'].includes(row.template), `${row.id} has unsupported template`);
    assert.equal(typeof row.measurement_bucket, 'string');
    assert.ok(row.measurement_bucket.trim().length > 0);
    assert.equal(row.country, 'AU');
    assert.equal(row.locale, 'en-AU');
    assert.equal(row.device, 'desktop');
    assert.deepEqual(row.engines, querySet.engines, `${row.id} must inherit the frozen engine list`);
    assert.ok(Array.isArray(row.treatment_routes), `${row.id} treatment_routes must be an array`);
    assert.ok(Array.isArray(row.control_routes), `${row.id} control_routes must be an array`);
    assert.ok(row.treatment_routes.length + row.control_routes.length > 0, `${row.id} must cover at least one route`);
  }
});

test('geo query set covers every Phase43 treatment/control route and every route exists on disk', () => {
  const querySet = loadJson(QUERY_SET_PATH);
  const manifest = loadJson(MANIFEST_PATH);
  const { treatmentRoutes, controlRoutes } = collectManifestRoutes(manifest);
  const coveredTreatmentRoutes = new Set();
  const coveredControlRoutes = new Set();

  for (const row of querySet.queries) {
    for (const route of row.treatment_routes) {
      assert.equal(treatmentRoutes.has(route), true, `${route} must be a manifest treatment route`);
      assert.equal(fs.existsSync(routeToHtmlPath(route)), true, `${route} must resolve to HTML`);
      coveredTreatmentRoutes.add(route);
    }
    for (const route of row.control_routes) {
      assert.equal(controlRoutes.has(route), true, `${route} must be a manifest control route`);
      assert.equal(fs.existsSync(routeToHtmlPath(route)), true, `${route} must resolve to HTML`);
      coveredControlRoutes.add(route);
    }
  }

  for (const route of treatmentRoutes) {
    assert.equal(coveredTreatmentRoutes.has(route), true, `${route} must be covered by the query set`);
  }
  for (const route of controlRoutes) {
    assert.equal(coveredControlRoutes.has(route), true, `${route} must be covered by the query set`);
  }
});
