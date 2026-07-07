import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  auditIndexabilityPolicy,
  classifyRoute,
  classifyUrl,
  loadIndexabilityPolicy,
  robotsMetaTagForRoute
} = require('../scripts/common/indexability-policy.js');

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

test('indexability policy: classifies current GSC sample routes by search value', () => {
  const policy = loadIndexabilityPolicy(path.join(repoRoot, 'data', 'indexability-policy.json'));

  assert.equal(classifyUrl('https://fitappliance.com.au/?cat=fridge&w=780&h=1800&d=700', {}, policy).action, 'blocked-query');
  assert.equal(classifyUrl('https://fitappliance.com.au/?cat=fridge&w=900&h=1800&d=700&door=770', {}, policy).action, 'blocked-query');
  assert.equal(classifyRoute('/about/editorial-standards', {}, policy).action, 'index');
  assert.equal(classifyRoute('/guides/appliance-fit-sizing-handbook', {}, policy).action, 'index');
  assert.equal(classifyRoute('/cavity/610mm-fridge', {}, policy).action, 'noindex');
  assert.equal(classifyRoute('/doorway/810mm-fridge-doorway', {}, policy).action, 'noindex');
  assert.equal(classifyRoute('/location/canberra/dishwasher', {}, policy).action, 'noindex');
  assert.equal(classifyRoute('/brands/comfee-dishwasher-clearance', { models: 5 }, policy).action, 'noindex');
  assert.equal(classifyRoute('/brands/tuscany-fridge-clearance', { models: 5 }, policy).action, 'noindex');
});

test('indexability policy: brand and comparison thresholds keep only substantial pages indexable', () => {
  const policy = loadIndexabilityPolicy(path.join(repoRoot, 'data', 'indexability-policy.json'));

  assert.equal(classifyRoute('/brands/asko-dishwasher-clearance', { models: 10 }, policy).action, 'index');
  assert.equal(classifyRoute('/brands/tuscany-dryer-clearance', { models: 1 }, policy).action, 'noindex');
  assert.equal(classifyRoute('/compare/fisher-paykel-vs-artusi-dishwasher-clearance', { modelsA: 28, modelsB: 22 }, policy).action, 'index');
  assert.equal(classifyRoute('/compare/euro-vs-inalto-dryer-clearance', { modelsA: 4, modelsB: 4 }, policy).action, 'noindex');
});

test('indexability policy: noindex routes render a crawlable robots meta tag', () => {
  const policy = loadIndexabilityPolicy(path.join(repoRoot, 'data', 'indexability-policy.json'));

  assert.equal(robotsMetaTagForRoute('/cavity/610mm-fridge', {}, policy), '  <meta name="robots" content="noindex, follow">');
  assert.equal(robotsMetaTagForRoute('/guides/appliance-fit-sizing-handbook', {}, policy), '');
});

test('indexability audit: fails when sitemap contains policy-held routes or query URLs', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fit-indexability-policy-'));
  const sitemapPath = path.join(root, 'public', 'sitemap.xml');
  await fs.mkdir(path.dirname(sitemapPath), { recursive: true });
  await fs.writeFile(sitemapPath, [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url><loc>https://www.fitappliance.com.au/guides/appliance-fit-sizing-handbook</loc></url>',
    '  <url><loc>https://www.fitappliance.com.au/location/canberra/dishwasher</loc></url>',
    '  <url><loc>https://www.fitappliance.com.au/?cat=fridge&amp;w=780&amp;h=1800&amp;d=700</loc></url>',
    '</urlset>',
    ''
  ].join('\n'), 'utf8');

  const result = await auditIndexabilityPolicy({
    repoRoot: root,
    sitemapPath,
    policyPath: path.join(repoRoot, 'data', 'indexability-policy.json'),
    checkNoindexMeta: false,
    logger: { log() {} }
  });

  assert.equal(result.ok, false);
  assert.equal(result.summary.sitemapPolicyViolations, 2);
  assert.deepEqual(result.issues.sitemapPolicyViolations.map((row) => row.route), ['/', '/location/canberra/dishwasher']);
});
