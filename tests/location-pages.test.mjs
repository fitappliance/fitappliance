import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CITY_DATA_PATH = path.join(ROOT, 'data', 'locations', 'au-cities.json');
const LOCATION_ROOT = path.join(ROOT, 'pages', 'location');
const SCRIPT_PATH = path.join(ROOT, 'scripts', 'generate-location-pages.js');
const VERSEL_CONFIG_PATH = path.join(ROOT, 'vercel.json');
const LINK_GRAPH_PATH = path.join(ROOT, 'reports', 'link-graph.json');

const EXPECTED_CITY_SLUGS = [
  'sydney',
  'melbourne',
  'brisbane',
  'perth',
  'adelaide',
  'canberra',
  'hobart',
  'darwin'
];

const EXPECTED_CATEGORIES = ['dishwasher', 'fridge', 'washing-machine', 'dryer', 'oven'];

function walkHtmlFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      output.push(...walkHtmlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      output.push(fullPath);
    }
  }
  return output;
}

function extractHrefValues(html) {
  const matches = html.matchAll(/\bhref\s*=\s*(['"])(.*?)\1/gi);
  return [...matches].map((match) => match[2]);
}

function resolveInternalLinkToFile(urlPath) {
  if (!urlPath || !urlPath.startsWith('/')) return null;
  const normalized = urlPath.split('#')[0].split('?')[0];
  if (normalized === '/') return path.join(ROOT, 'index.html');
  if (normalized.startsWith('/location/')) {
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length !== 3) return null;
    return path.join(ROOT, 'pages', 'location', parts[1], `${parts[2]}.html`);
  }
  const [prefix, slug] = normalized.split('/').filter(Boolean);
  if (!slug) return null;
  if (['cavity', 'doorway', 'brands', 'compare', 'guides'].includes(prefix)) {
    return path.join(ROOT, 'pages', prefix, `${slug}.html`);
  }
  if (normalized === '/affiliate-disclosure') return path.join(ROOT, 'pages', 'affiliate-disclosure.html');
  if (normalized === '/privacy-policy') return path.join(ROOT, 'pages', 'privacy-policy.html');
  if (normalized === '/methodology') return path.join(ROOT, 'pages', 'methodology.html');
  if (normalized === '/about/editorial-standards') return path.join(ROOT, 'pages', 'about', 'editorial-standards.html');
  return null;
}

test('phase 24: location city data exists and keeps ABS fact-only fields', () => {
  assert.ok(fs.existsSync(SCRIPT_PATH), 'scripts/generate-location-pages.js should exist');
  assert.ok(fs.existsSync(CITY_DATA_PATH), 'data/locations/au-cities.json should exist');

  const document = JSON.parse(fs.readFileSync(CITY_DATA_PATH, 'utf8'));
  assert.ok(Array.isArray(document.cities), 'cities array should exist');
  assert.equal(document.cities.length, 8, 'should include exactly 8 Australian capital cities');

  const allowedKeys = new Set(['slug', 'name', 'state', 'stateCode']);
  const actualSlugs = new Set();

  for (const city of document.cities) {
    for (const key of Object.keys(city)) {
      assert.ok(allowedKeys.has(key), `unexpected city field: ${key}`);
    }
    assert.equal(typeof city.slug, 'string');
    assert.equal(typeof city.name, 'string');
    assert.equal(typeof city.state, 'string');
    assert.equal(typeof city.stateCode, 'string');
    assert.ok(city.slug.length > 0);
    actualSlugs.add(city.slug);
  }

  assert.deepEqual([...actualSlugs].sort(), [...EXPECTED_CITY_SLUGS].sort());
});

test('phase 24: generates 40 location pages (8 cities x 5 categories)', () => {
  assert.ok(fs.existsSync(LOCATION_ROOT), 'pages/location directory should exist');
  const htmlFiles = walkHtmlFiles(LOCATION_ROOT);
  assert.equal(htmlFiles.length, 40, 'should generate 40 location pages');

  for (const city of EXPECTED_CITY_SLUGS) {
    for (const category of EXPECTED_CATEGORIES) {
      const filePath = path.join(LOCATION_ROOT, city, `${category}.html`);
      assert.ok(fs.existsSync(filePath), `missing location page: ${city}/${category}.html`);
    }
  }
});

test('phase 24: location pages include valid BreadcrumbList and Place schema', () => {
  const pagePath = path.join(LOCATION_ROOT, 'sydney', 'fridge.html');
  const html = fs.readFileSync(pagePath, 'utf8');
  const schemaMatches = html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  const schemas = [...schemaMatches].map((match) => JSON.parse(match[1].trim()));

  const breadcrumb = schemas.find((schema) => schema['@type'] === 'BreadcrumbList');
  assert.ok(breadcrumb, 'BreadcrumbList schema should exist');
  assert.ok(Array.isArray(breadcrumb.itemListElement), 'BreadcrumbList should include itemListElement');
  assert.ok(breadcrumb.itemListElement.length >= 3, 'BreadcrumbList should include at least 3 levels');

  const place = schemas.find((schema) => schema['@type'] === 'Place');
  assert.ok(place, 'Place schema should exist');
  assert.equal(typeof place.name, 'string');
  assert.equal(typeof place.address?.addressRegion, 'string');
  assert.equal(place.address?.addressCountry, 'AU');
});

test('phase 24: location page internal links resolve to real generated pages', () => {
  const htmlFiles = walkHtmlFiles(LOCATION_ROOT);
  for (const filePath of htmlFiles) {
    const html = fs.readFileSync(filePath, 'utf8');
    const hrefs = extractHrefValues(html).filter((href) => href.startsWith('/'));
    const uniqueHrefs = [...new Set(hrefs)];
    assert.ok(uniqueHrefs.length >= 10, `${path.relative(ROOT, filePath)} should include at least 10 internal links`);
    for (const href of uniqueHrefs) {
      const targetPath = resolveInternalLinkToFile(href);
      if (!targetPath) continue;
      assert.ok(fs.existsSync(targetPath), `${path.relative(ROOT, filePath)} has broken internal link: ${href}`);
    }
  }
});

test('phase 24: vercel rewrite includes /location/:city/:category route', () => {
  const config = JSON.parse(fs.readFileSync(VERSEL_CONFIG_PATH, 'utf8'));
  const rewrites = Array.isArray(config.rewrites) ? config.rewrites : [];
  const rewrite = rewrites.find((row) => row.source === '/location/:city/:category');
  assert.ok(rewrite, 'vercel.json should include /location/:city/:category rewrite');
  assert.equal(rewrite.destination, '/pages/location/:city/:category.html');
});

test('phase 24: sitemap, rss, and image-sitemap include location pages', () => {
  const sitemap = fs.readFileSync(path.join(ROOT, 'public', 'sitemap.xml'), 'utf8');
  const rss = fs.readFileSync(path.join(ROOT, 'public', 'rss.xml'), 'utf8');
  const imageSitemap = fs.readFileSync(path.join(ROOT, 'public', 'image-sitemap.xml'), 'utf8');
  assert.match(sitemap, /\/location\/sydney\/fridge/);
  assert.match(rss, /\/location\/sydney\/fridge/);
  assert.match(imageSitemap, /\/location\/sydney\/fridge/);
});

test('phase 24: location pages remain non-orphan with healthy inlinks in link graph', () => {
  assert.ok(fs.existsSync(LINK_GRAPH_PATH), 'reports/link-graph.json should exist');
  const report = JSON.parse(fs.readFileSync(LINK_GRAPH_PATH, 'utf8'));
  const locationNodes = (report.nodes ?? []).filter((node) => String(node.url).startsWith('/location/'));
  assert.equal(locationNodes.length, 40, 'link graph should include all 40 location pages');
  assert.equal(locationNodes.every((node) => Number(node.inlinks) >= 1), true, 'location pages should not be orphaned');
  const avg = locationNodes.reduce((sum, node) => sum + Number(node.inlinks || 0), 0) / locationNodes.length;
  assert.equal(avg >= 3, true, `location pages should average >=3 inlinks, got ${avg.toFixed(2)}`);
});
