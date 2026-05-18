import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function walkFiles(dir, predicate, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walkFiles(full, predicate, acc);
    } else if (entry.isFile() && predicate(full)) {
      acc.push(full);
    }
  }
  return acc;
}

test('CF readiness: affiliate disclosure does not overstate unapproved network relationships', () => {
  const text = visibleText(read('pages/affiliate-disclosure.html'));

  assert.doesNotMatch(text, /currently maintain affiliate relationships/i);
  assert.match(text, /may be affiliate links where FitAppliance is approved/i);
  assert.match(text, /programme details are shown as public programme information/i);
});

test('CF readiness: privacy enquiries use the active domain-matched mailbox', () => {
  const html = read('pages/privacy-policy.html');

  assert.doesNotMatch(html, /privacy@fitappliance\.com\.au/);
  assert.match(html, /mailto:hello@fitappliance\.com\.au/);
});

test('CF readiness: no deployed HTML keeps stale affiliate or privacy mailbox claims', () => {
  const htmlFiles = walkFiles(ROOT, (file) => file.endsWith('.html'));
  const combined = htmlFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');

  assert.doesNotMatch(combined, /currently maintain affiliate relationships/i);
  assert.doesNotMatch(combined, /privacy@fitappliance\.com\.au/);
});

test('GSC readiness: sitemap pages are crawlable, canonicalized, and reportable', async () => {
  const moduleUrl = pathToFileURL(path.join(ROOT, 'scripts', 'audit-gsc-indexing.js')).href;
  const { auditGscIndexing } = await import(moduleUrl);
  const result = await auditGscIndexing({
    repoRoot: ROOT,
    write: false,
    logger: { log() {}, warn() {}, error() {} }
  });

  assert.equal(result.ok, true);
  assert.ok(result.summary.sitemapUrls >= 2300, `expected a large sitemap, got ${result.summary.sitemapUrls}`);
  assert.ok(result.summary.productUrls >= 1500, `expected product URLs, got ${result.summary.productUrls}`);
  assert.equal(result.issues.missingFiles.length, 0);
  assert.equal(result.issues.noindex.length, 0);
  assert.equal(result.issues.canonicalMismatches.length, 0);
});
