import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, 'data', 'geo-treatment-pages.json');
const require = createRequire(import.meta.url);
const { getFitCheckSlug } = require('../scripts/generate-fit-check-pages.js');

const REQUIRED_FIELDS = [
  'route',
  'template',
  'primary_query',
  'match_key',
  'evidence_level',
  'measurement_bucket'
];

const REQUIRED_GUIDE_ROUTES = [
  '/guides/fridge-clearance-requirements',
  '/guides/dishwasher-cavity-sizing',
  '/guides/washing-machine-doorway-access',
  '/guides/dryer-ventilation-guide',
  '/guides/appliance-fit-sizing-handbook'
];

const CATEGORY_FILES = [
  'public/data/fridges.json',
  'public/data/dishwashers.json',
  'public/data/dryers.json',
  'public/data/washing-machines.json'
];

function loadManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function routeToHtmlPath(route) {
  const cleanRoute = route.replace(/^\/+/, '').replace(/\/+$/, '');

  if (cleanRoute === '') {
    return path.join(ROOT, 'index.html');
  }

  return path.join(ROOT, 'pages', `${cleanRoute}.html`);
}

function loadCatalog() {
  return CATEGORY_FILES.flatMap((file) => {
    const document = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    return Array.isArray(document.products) ? document.products : [];
  });
}

function catSlug(cat) {
  return String(cat ?? '').replace(/_/g, '-');
}

function findFitCheckProductForRoute(route, catalog) {
  const match = String(route).match(/^\/fit-check\/(.+)-in-(\d+)mm-cavity$/);
  if (!match) return null;
  const cavityW = Number(match[2]);
  const slug = `${match[1]}-in-${cavityW}mm-cavity`;
  const product = catalog.find((row) => getFitCheckSlug(row, cavityW) === slug);
  return product ? { product, cavityW } : null;
}

function assertExperimentRow(row, groupName) {
  for (const field of REQUIRED_FIELDS) {
    assert.equal(typeof row[field], 'string', `${groupName} ${row.route ?? '(missing route)'} must define ${field}`);
    assert.ok(row[field].trim().length > 0, `${groupName} ${row.route} ${field} must not be empty`);
  }

  assert.match(row.route, /^\//, `${groupName} route must be absolute-site relative`);
  assert.ok(['guide', 'fit-check'].includes(row.template), `${row.route} has unsupported template ${row.template}`);
  assert.equal(fs.existsSync(routeToHtmlPath(row.route)), true, `${row.route} must resolve to an existing HTML file`);
}

test('phase 43 GEO cohort manifest declares schema and experiment metadata', () => {
  const manifest = loadManifest();

  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.experiment, 'phase43-geo');
  assert.equal(manifest.started_at, '2026-07-06');
  assert.ok(Array.isArray(manifest.treatment));
  assert.ok(Array.isArray(manifest.controls));
  assert.ok(manifest.treatment.length > 0, 'treatment cohort must not be empty');
  assert.ok(manifest.controls.length > 0, 'control cohort must not be empty');
});

test('phase 43 GEO cohort rows are complete and point at existing pages', () => {
  const manifest = loadManifest();

  for (const row of manifest.treatment) {
    assertExperimentRow(row, 'treatment');
  }

  for (const row of manifest.controls) {
    assertExperimentRow(row, 'controls');
  }
});

test('phase 43 GEO cohort includes every guide in treatment and keeps route groups disjoint', () => {
  const manifest = loadManifest();
  const treatmentRoutes = new Set(manifest.treatment.map((row) => row.route));
  const controlRoutes = new Set(manifest.controls.map((row) => row.route));
  const allRoutes = [...treatmentRoutes, ...controlRoutes];

  for (const route of REQUIRED_GUIDE_ROUTES) {
    assert.equal(treatmentRoutes.has(route), true, `${route} must be in treatment`);
  }

  for (const route of treatmentRoutes) {
    assert.equal(controlRoutes.has(route), false, `${route} cannot be both treatment and control`);
  }

  assert.equal(new Set(allRoutes).size, allRoutes.length, 'cohort routes must be unique');
});

test('phase 43 GEO fit-check cohort buckets match the actual product category and cavity width', () => {
  const manifest = loadManifest();
  const catalog = loadCatalog();
  const rows = [...manifest.treatment, ...manifest.controls].filter((row) => row.template === 'fit-check');

  assert.ok(rows.length > 0, 'expected fit-check cohort rows');

  for (const row of rows) {
    const resolved = findFitCheckProductForRoute(row.route, catalog);
    assert.ok(resolved, `${row.route} must match a current catalog product`);

    const expectedCat = catSlug(resolved.product.cat);
    const expectedBucket = `fit-check-${expectedCat}-${resolved.cavityW}`;
    const expectedMatchPrefix = `fit-check:${expectedCat}:${resolved.cavityW}:`;

    assert.equal(row.measurement_bucket, expectedBucket, `${row.route} measurement bucket must match route metadata`);
    assert.ok(row.match_key.startsWith(expectedMatchPrefix), `${row.route} match_key must start with ${expectedMatchPrefix}`);
  }
});
