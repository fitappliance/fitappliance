import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  auditGeoMetadata,
  collectAuditTargets,
  extractHtmlMetadata,
  routeToHtmlPath
} = require('../scripts/audit-geo-metadata.js');

function makeTempRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fitappliance-geo-metadata-'));
  fs.mkdirSync(path.join(repoRoot, 'data'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'pages', 'guides'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'pages', 'fit-check'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'pages', 'tools'), { recursive: true });
  return repoRoot;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function html({ title = 'Fixture', description = 'Fixture page for appliance fit and cavity clearance in mm.', canonical = 'https://www.fitappliance.com.au/fixture', body = 'Visible appliance fit text with cavity clearance in mm.', jsonLd = [] } = {}) {
  const blocks = jsonLd.map((block) => `<script type="application/ld+json">${JSON.stringify(block)}</script>`).join('\n');
  return `<!doctype html>
<html>
  <head>
    <title>${title}</title>
    <meta name="description" content="${description}">
    <link rel="canonical" href="${canonical}">
    ${blocks}
  </head>
  <body>${body}</body>
</html>`;
}

function writeRoute(repoRoot, route, htmlText) {
  const filePath = routeToHtmlPath(route, repoRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, htmlText, 'utf8');
}

function writeFixture(repoRoot) {
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

  writeRoute(repoRoot, '/', html({ title: 'FitAppliance' }));
  writeRoute(repoRoot, '/tools/fit-checker', html({ title: 'Fit Checker' }));
  writeRoute(repoRoot, '/guides/fridge-clearance-requirements', html({
    title: 'Fridge clearance guide',
    description: 'Reliable fridge cavity clearance guidance with width, depth, ventilation and mm checks.',
    body: 'Fridge cavity clearance guidance with width, depth, ventilation and mm checks.',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Fridge clearance guide',
        description: 'Reliable fridge cavity clearance guidance with width, depth, ventilation and mm checks.'
      }
    ]
  }));
  writeRoute(repoRoot, '/fit-check/model-a-in-640mm-cavity', html({
    title: 'Model A fit check',
    description: 'Exact dishwasher cavity fit check for a 640mm opening with width, depth and clearance notes.',
    body: 'Model A dishwasher fit check for a 640mm cavity with width, depth and clearance notes.',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Model A fit check',
        description: 'Exact dishwasher cavity fit check for a 640mm opening with width, depth and clearance notes.'
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Will it fit?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Check the finished cavity before ordering.'
            }
          }
        ]
      }
    ]
  }));
  writeRoute(repoRoot, '/fit-check/model-b-in-640mm-cavity', html({
    title: 'Model B fit check',
    description: 'Guaranteed dishwasher cavity fit with no remeasure needed.',
    body: 'Model B fit check body.'
  }));
  writeRoute(repoRoot, '/guides/off-manifest-bad-page', html({
    title: 'Bad off-manifest page',
    description: 'Guaranteed install hack.',
    body: 'This route is intentionally outside the audit target set.'
  }));
}

test('extractHtmlMetadata reads head fields, visible text, and JSON-LD types', () => {
  const metadata = extractHtmlMetadata(html({
    title: 'Metadata title',
    description: 'Metadata description with cavity mm.',
    canonical: 'https://www.fitappliance.com.au/meta',
    body: '<main>Visible fridge cavity text.</main>',
    jsonLd: [{ '@context': 'https://schema.org', '@type': 'Article', headline: 'Metadata title', description: 'Metadata description with cavity mm.' }]
  }));

  assert.equal(metadata.title, 'Metadata title');
  assert.equal(metadata.description, 'Metadata description with cavity mm.');
  assert.equal(metadata.canonical, 'https://www.fitappliance.com.au/meta');
  assert.match(metadata.visibleText, /Visible fridge cavity text/);
  assert.deepEqual(metadata.jsonLdTypes, ['Article']);
});

test('collectAuditTargets scans only core pages and manifest routes', () => {
  const repoRoot = makeTempRepo();
  writeFixture(repoRoot);

  const targets = collectAuditTargets({ repoRoot });
  const routes = targets.map((target) => target.route);

  assert.deepEqual(routes.sort(), [
    '/',
    '/fit-check/model-a-in-640mm-cavity',
    '/fit-check/model-b-in-640mm-cavity',
    '/guides/fridge-clearance-requirements',
    '/tools/fit-checker'
  ].sort());
  assert.equal(routes.includes('/guides/off-manifest-bad-page'), false);
  assert.equal(targets.find((target) => target.route === '/fit-check/model-a-in-640mm-cavity').group, 'treatment');
  assert.equal(targets.find((target) => target.route === '/fit-check/model-b-in-640mm-cavity').group, 'control');
});

test('auditGeoMetadata treats treatment drift as blockers and control/core drift as warnings', async () => {
  const repoRoot = makeTempRepo();
  writeFixture(repoRoot);
  writeRoute(repoRoot, '/guides/fridge-clearance-requirements', html({
    title: 'Fridge clearance guide',
    description: 'Generic buying page.',
    body: 'Visible fridge cavity clearance text still exists.'
  }));

  const report = await auditGeoMetadata({
    repoRoot,
    write: false,
    strictTreatment: true,
    logger: { log() {} }
  });

  const treatmentIssue = report.issues.find((issue) => issue.route === '/guides/fridge-clearance-requirements' && issue.code === 'description_missing_domain_entity');
  const controlIssue = report.issues.find((issue) => issue.route === '/fit-check/model-b-in-640mm-cavity' && issue.code === 'description_unsupported_claim');

  assert.equal(report.summary.targetsChecked, 5);
  assert.equal(treatmentIssue?.severity, 'blocker');
  assert.equal(controlIssue?.severity, 'warning');
  assert.equal(report.summary.blockerCount, 1);
  assert.equal(report.summary.warningCount, 1);
});

test('auditGeoMetadata blocks Product JSON-LD on treatment fit-check pages', async () => {
  const repoRoot = makeTempRepo();
  writeFixture(repoRoot);
  writeRoute(repoRoot, '/fit-check/model-a-in-640mm-cavity', html({
    title: 'Model A fit check',
    description: 'Dishwasher cavity fit check for a 640mm opening with width, depth and clearance notes.',
    body: 'Model A dishwasher fit check for a 640mm cavity with width, depth and clearance notes.',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'Model A'
      }
    ]
  }));

  const report = await auditGeoMetadata({
    repoRoot,
    write: false,
    strictTreatment: true,
    logger: { log() {} }
  });

  const issue = report.issues.find((row) => row.route === '/fit-check/model-a-in-640mm-cavity' && row.code === 'fit_check_product_json_ld');
  assert.equal(issue?.severity, 'blocker');
  assert.equal(report.summary.blockerCount, 1);
});

test('auditGeoMetadata can write the scoped JSON report', async () => {
  const repoRoot = makeTempRepo();
  writeFixture(repoRoot);
  const outputPath = path.join(repoRoot, 'reports', 'geo', 'metadata-audit-latest.json');

  const report = await auditGeoMetadata({
    repoRoot,
    outputPath,
    write: true,
    strictTreatment: false,
    logger: { log() {} }
  });

  assert.equal(fs.existsSync(outputPath), true);
  const written = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(written.summary.targetsChecked, report.summary.targetsChecked);
  assert.equal(written.scope, 'phase43-cohort-and-core');
});

test('package exposes audit-geo-metadata script without wiring it into build', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));

  assert.equal(pkg.scripts['audit-geo-metadata'], 'node scripts/audit-geo-metadata.js');
  assert.equal(pkg.scripts.build.includes('audit-geo-metadata'), false);
});
