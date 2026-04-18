import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const HUB_SLUGS = [
  'dishwasher-cavity-sizing',
  'washing-machine-doorway-access',
  'fridge-clearance-requirements',
  'dryer-ventilation-guide',
  'appliance-fit-sizing-handbook'
];

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('phase 21: build-link-graph script exists and writes report target', () => {
  const scriptPath = path.join(ROOT, 'scripts', 'build-link-graph.js');
  assert.ok(fs.existsSync(scriptPath), 'scripts/build-link-graph.js should exist');
  const source = fs.readFileSync(scriptPath, 'utf8');
  assert.match(source, /link-graph\.json/);
  assert.match(source, /pages/);
});

test('phase 21: link graph report has no orphan pages and healthy in-link average', () => {
  const reportPath = path.join(ROOT, 'reports', 'link-graph.json');
  assert.ok(fs.existsSync(reportPath), 'reports/link-graph.json should exist');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(report.summary.orphanPages, 0, 'orphan pages should be zero');
  assert.ok(
    Number(report.summary.averageInlinks) >= 3,
    `averageInlinks should be >= 3, got ${report.summary.averageInlinks}`
  );
});

test('phase 21: five guide hub pages exist and each has >=30 static outlinks', () => {
  for (const slug of HUB_SLUGS) {
    const relativePath = `pages/guides/${slug}.html`;
    const fullPath = path.join(ROOT, relativePath);
    assert.ok(fs.existsSync(fullPath), `${relativePath} should exist`);
    const html = readText(relativePath);
    const hrefMatches = html.match(/href="\/[^"]+"/g) ?? [];
    assert.ok(hrefMatches.length >= 30, `${relativePath} should include at least 30 outlinks`);
  }
});

test('phase 21: sitemap includes all guide hub pages', () => {
  const xml = readText('public/sitemap.xml');
  for (const slug of HUB_SLUGS) {
    assert.match(xml, new RegExp(`/guides/${slug}`));
  }
});

test('phase 21: rss and image sitemap include guide hub URLs', () => {
  const rss = readText('public/rss.xml');
  const imageSitemap = readText('public/image-sitemap.xml');
  for (const slug of HUB_SLUGS) {
    assert.match(rss, new RegExp(`/guides/${slug}`), `rss missing ${slug}`);
    assert.match(imageSitemap, new RegExp(`/guides/${slug}`), `image sitemap missing ${slug}`);
  }
});
