import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  auditGeoSchemaEligibility,
  extractJsonLd,
  routeToHtmlPath
} = require('../scripts/audit-geo-schema-eligibility.js');

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-geo-schema-'));
}

function writeRoute(repoRoot, route, html) {
  const filePath = routeToHtmlPath(route, repoRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, html, 'utf8');
}

function jsonLd(value) {
  return `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
}

function page({ title = 'Fixture', body = 'FitAppliance appliance cavity fit checker with width height depth mm.', blocks = [] } = {}) {
  return `<!doctype html>
<html>
  <head><title>${title}</title>${blocks.join('\n')}</head>
  <body>${body}</body>
</html>`;
}

function softwareSchema(overrides = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'FitAppliance Cavity Fit Checker',
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Web',
    url: 'https://www.fitappliance.com.au/tools/fit-checker',
    description: 'Interactive appliance cavity fit checker for Australian homes.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'AUD'
    },
    ...overrides
  };
}

test('extractJsonLd flattens graph nodes and reports schema types', () => {
  const blocks = extractJsonLd(page({
    blocks: [
      jsonLd({
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'WebSite', name: 'FitAppliance' },
          softwareSchema()
        ]
      })
    ]
  }));

  assert.deepEqual(blocks.flatMap((block) => block.types).sort(), ['SoftwareApplication', 'WebSite']);
});

test('auditGeoSchemaEligibility accepts current root and fit checker tool schemas', async () => {
  const report = await auditGeoSchemaEligibility({
    repoRoot: process.cwd(),
    write: false,
    logger: { log() {} }
  });

  assert.equal(report.summary.blockerCount, 0);
  assert.ok(report.pages.find((row) => row.route === '/' && row.toolSchemaTypes.includes('SoftwareApplication')));
  assert.ok(report.pages.find((row) => row.route === '/tools/fit-checker' && row.toolSchemaTypes.includes('SoftwareApplication')));
});

test('auditGeoSchemaEligibility blocks tool schema outside approved core routes', async () => {
  const repoRoot = makeTempRepo();
  writeRoute(repoRoot, '/', page({ blocks: [jsonLd(softwareSchema({ url: 'https://www.fitappliance.com.au/' }))] }));
  writeRoute(repoRoot, '/tools/fit-checker', page({ blocks: [jsonLd(softwareSchema())] }));
  writeRoute(repoRoot, '/fit-check/model-a-in-640mm-cavity', page({ blocks: [jsonLd(softwareSchema())] }));

  const report = await auditGeoSchemaEligibility({
    repoRoot,
    write: false,
    includeRoutes: ['/', '/tools/fit-checker', '/fit-check/model-a-in-640mm-cavity'],
    logger: { log() {} }
  });

  const issue = report.issues.find((row) => row.route === '/fit-check/model-a-in-640mm-cavity' && row.code === 'tool_schema_unapproved_route');
  assert.equal(issue?.severity, 'blocker');
});

test('auditGeoSchemaEligibility blocks incomplete or invisible tool schema fields', async () => {
  const repoRoot = makeTempRepo();
  writeRoute(repoRoot, '/', page({
    body: 'FitAppliance appliance cavity fit checker width height depth mm.',
    blocks: [
      jsonLd(softwareSchema({
        name: '',
        description: 'Hidden espresso machine recommender.',
        url: 'https://www.fitappliance.com.au/'
      }))
    ]
  }));

  const report = await auditGeoSchemaEligibility({
    repoRoot,
    write: false,
    includeRoutes: ['/'],
    logger: { log() {} }
  });

  assert.ok(report.issues.find((row) => row.code === 'tool_schema_missing_name'));
  assert.ok(report.issues.find((row) => row.code === 'tool_schema_description_not_visible'));
  assert.equal(report.summary.blockerCount, 2);
});

test('package exposes audit-geo-schema-eligibility without wiring it into build', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));

  assert.equal(pkg.scripts['audit-geo-schema-eligibility'], 'node scripts/audit-geo-schema-eligibility.js');
  assert.equal(pkg.scripts.build.includes('audit-geo-schema-eligibility'), false);
});
