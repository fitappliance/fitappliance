import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

test('AdSense readiness: homepage exposes a clear original-value editorial section', () => {
  const html = read('index.html');
  const text = visibleText(html);

  assert.match(html, /id="adsense-content-value"/);
  assert.match(text, /original appliance fit utility/i);
  assert.match(text, /not a scraped price list/i);
  assert.match(text, /manual and retailer evidence/i);
  assert.match(html, /href="\/guides\/appliance-fit-sizing-handbook"/);
  assert.match(html, /href="\/methodology"/);
  assert.match(html, /href="\/about\/editorial-standards"/);
});

test('AdSense readiness: content quality audit script exists and writes a remediation report', () => {
  const script = read('scripts/audit-adsense-readiness.js');

  assert.match(script, /adsense-low-value-remediation\.md/);
  assert.match(script, /programmaticUrlRatio/);
  assert.match(script, /manualReviewChecklist/);
  assert.match(script, /minimum content/i);
});

test('AdSense readiness: generated remediation report records the low-value-content fix evidence', () => {
  const report = read('reports/adsense-low-value-remediation.md');

  assert.match(report, /# AdSense Low-Value Content Remediation/);
  assert.match(report, /fitappliance\.com\.au/);
  assert.match(report, /Original utility layer/);
  assert.match(report, /Deep editorial pages/);
  assert.match(report, /Manual resubmission checklist/);
});
