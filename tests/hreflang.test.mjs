import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const SAMPLE_PAGES = [
  'index.html',
  'pages/brands/samsung-fridge-clearance.html',
  'pages/cavity/600mm-fridge.html',
  'pages/compare/westinghouse-vs-lg-fridge-clearance.html',
  'pages/guides/fridge-clearance-requirements.html'
];

function readHtml(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function extractHead(html) {
  return html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? '';
}

function extractCanonical(headHtml) {
  return headHtml.match(/<link rel="canonical" href="([^"]+)">/i)?.[1] ?? '';
}

function extractHreflangLinks(headHtml) {
  const matches = headHtml.matchAll(
    /<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/gi
  );
  return [...matches].map((match) => ({ hreflang: match[1], href: match[2] }));
}

test('phase 43a p2: sampled pages expose en-AU and x-default hreflang links', () => {
  for (const relativePath of SAMPLE_PAGES) {
    const head = extractHead(readHtml(relativePath));
    const canonical = extractCanonical(head);
    const alternates = extractHreflangLinks(head);

    assert.ok(canonical, `${relativePath} should have a canonical URL`);
    assert.equal(alternates.length, 2, `${relativePath} should have exactly two hreflang links`);
    assert.deepEqual(
      alternates.map((row) => row.hreflang).sort(),
      ['en-AU', 'x-default'],
      `${relativePath} should expose en-AU and x-default hreflang`
    );
    for (const alternate of alternates) {
      assert.equal(alternate.href, canonical, `${relativePath} hreflang should match canonical`);
    }
  }
});
