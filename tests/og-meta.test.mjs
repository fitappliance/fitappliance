import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const SAMPLE_PAGES = [
  'pages/cavity/600mm-fridge.html',
  'pages/cavity/700mm-fridge.html',
  'pages/cavity/900mm-fridge.html',
  'pages/compare/westinghouse-vs-lg-fridge-clearance.html',
  'pages/compare/hisense-vs-lg-fridge-clearance.html',
  'pages/compare/artusi-vs-miele-dishwasher-clearance.html',
  'pages/guides/fridge-clearance-requirements.html',
  'pages/guides/dishwasher-cavity-sizing.html',
  'pages/guides/appliance-fit-sizing-handbook.html'
];

function readHtml(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function readMeta(headHtml, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<meta property="${escaped}" content="([^"]+)">`, 'i');
  return headHtml.match(pattern)?.[1] ?? '';
}

function extractHead(html) {
  return html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? '';
}

test('phase 43a p2: cavity, compare and guide pages expose local OG image meta', () => {
  for (const relativePath of SAMPLE_PAGES) {
    const head = extractHead(readHtml(relativePath));
    const imagePath = readMeta(head, 'og:image');
    const width = readMeta(head, 'og:image:width');
    const height = readMeta(head, 'og:image:height');

    assert.ok(imagePath, `${relativePath} should include og:image`);
    assert.match(imagePath, /^\/og-images\/[^"]+\.png$/, `${relativePath} should use a local og image path`);
    assert.equal(width, '1200', `${relativePath} should include og:image:width`);
    assert.equal(height, '630', `${relativePath} should include og:image:height`);
    assert.equal(
      fs.existsSync(path.join(ROOT, 'public', imagePath)),
      true,
      `${relativePath} references missing image ${imagePath}`
    );
  }
});
