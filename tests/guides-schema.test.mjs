import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const GUIDES_DIR = path.join(ROOT, 'pages', 'guides');
const require = createRequire(import.meta.url);
const { GUIDE_HUBS, resolveGuideArticleDates } = require('../scripts/generate-guides.js');
const PRODUCTION_HOST = 'fitappliance.com.au';
const PRODUCTION_ORIGIN = `https://${PRODUCTION_HOST}/`;
const GUIDE_FILES = [
  'appliance-fit-sizing-handbook.html',
  'dishwasher-cavity-sizing.html',
  'dryer-ventilation-guide.html',
  'fridge-clearance-requirements.html',
  'washing-machine-doorway-access.html'
];

function extractJsonLdBlocks(html) {
  const matches = html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  return [...matches].map((match) => match[1].trim());
}

function isIsoDate(value) {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

test('phase 43a: every guide page exposes exactly one Article JSON-LD block', () => {
  for (const fileName of GUIDE_FILES) {
    const html = fs.readFileSync(path.join(GUIDES_DIR, fileName), 'utf8');
    const blocks = extractJsonLdBlocks(html);
    assert.equal(blocks.length, 1, `${fileName} should have exactly one JSON-LD block`);

    const schema = JSON.parse(blocks[0]);
    assert.equal(schema['@context'], 'https://schema.org', `${fileName} should use schema.org context`);
    assert.equal(schema['@type'], 'Article', `${fileName} should be Article schema`);
  }
});

test('phase 43a: guide Article JSON-LD has required non-empty fields', () => {
  for (const fileName of GUIDE_FILES) {
    const html = fs.readFileSync(path.join(GUIDES_DIR, fileName), 'utf8');
    const [block] = extractJsonLdBlocks(html);
    const schema = JSON.parse(block);

    for (const field of ['headline', 'description', 'datePublished', 'dateModified', 'image', 'author', 'publisher', 'url']) {
      assert.ok(schema[field], `${fileName} missing ${field}`);
    }

    assert.equal(schema.author['@type'], 'Organization', `${fileName} author should be an Organization`);
    assert.equal(schema.author.name, 'FitAppliance Editorial Team', `${fileName} author name mismatch`);
    assert.equal(schema.publisher['@type'], 'Organization', `${fileName} publisher should be an Organization`);
    assert.equal(schema.publisher.name, 'FitAppliance', `${fileName} publisher name mismatch`);
    assert.ok(schema.publisher.logo?.url, `${fileName} publisher logo url missing`);
  }
});

test('phase 43a: guide Article dates are valid ISO strings and modified is not earlier than published', () => {
  for (const fileName of GUIDE_FILES) {
    const html = fs.readFileSync(path.join(GUIDES_DIR, fileName), 'utf8');
    const [block] = extractJsonLdBlocks(html);
    const schema = JSON.parse(block);

    assert.equal(isIsoDate(schema.datePublished), true, `${fileName} datePublished should be ISO 8601`);
    assert.equal(isIsoDate(schema.dateModified), true, `${fileName} dateModified should be ISO 8601`);
    assert.ok(
      Date.parse(schema.dateModified) >= Date.parse(schema.datePublished),
      `${fileName} dateModified should be >= datePublished`
    );
  }
});

test('phase 43a: guide Article URLs use production fitappliance.com.au host', () => {
  for (const fileName of GUIDE_FILES) {
    const html = fs.readFileSync(path.join(GUIDES_DIR, fileName), 'utf8');
    const [block] = extractJsonLdBlocks(html);
    const schema = JSON.parse(block);

    assert.ok(schema.url.startsWith(PRODUCTION_ORIGIN), `${fileName} url should use production host`);
    assert.equal(new URL(schema.url).hostname, PRODUCTION_HOST, `${fileName} url hostname mismatch`);
  }
});

test('phase 43a: guide Article headline matches the visible h1', () => {
  for (const fileName of GUIDE_FILES) {
    const html = fs.readFileSync(path.join(GUIDES_DIR, fileName), 'utf8');
    const [block] = extractJsonLdBlocks(html);
    const schema = JSON.parse(block);
    const h1 = html.match(/<h1>(.*?)<\/h1>/)?.[1]?.replace(/&amp;/g, '&');

    assert.equal(schema.headline, h1, `${fileName} headline should match h1`);
  }
});

test('phase 43a: guide Article description matches the meta description', () => {
  for (const fileName of GUIDE_FILES) {
    const html = fs.readFileSync(path.join(GUIDES_DIR, fileName), 'utf8');
    const [block] = extractJsonLdBlocks(html);
    const schema = JSON.parse(block);
    const metaDescription = html.match(/<meta name="description" content="([^"]+)">/)?.[1];

    assert.equal(schema.description, metaDescription, `${fileName} description should match meta description`);
  }
});

test('phase 43a: guide Article image and publisher logo use production fitappliance.com.au host', () => {
  for (const fileName of GUIDE_FILES) {
    const html = fs.readFileSync(path.join(GUIDES_DIR, fileName), 'utf8');
    const [block] = extractJsonLdBlocks(html);
    const schema = JSON.parse(block);

    assert.ok(schema.image.startsWith(PRODUCTION_ORIGIN), `${fileName} image host mismatch`);
    assert.equal(new URL(schema.image).hostname, PRODUCTION_HOST, `${fileName} image hostname mismatch`);
    assert.ok(
      schema.publisher.logo.url.startsWith(PRODUCTION_ORIGIN),
      `${fileName} publisher logo host mismatch`
    );
    assert.equal(
      new URL(schema.publisher.logo.url).hostname,
      PRODUCTION_HOST,
      `${fileName} publisher logo hostname mismatch`
    );
  }
});

test('phase 43a: guide Article JSON-LD is inserted immediately after the title tag', () => {
  for (const fileName of GUIDE_FILES) {
    const html = fs.readFileSync(path.join(GUIDES_DIR, fileName), 'utf8');

    assert.match(
      html,
      /<title>[^<]+<\/title>\n  <script type="application\/ld\+json">/,
      `${fileName} Article JSON-LD should be directly after <title>`
    );
  }
});

test('phase 43a: guide date metadata remains deterministic when git history is shallow', () => {
  const guide = GUIDE_HUBS.find((row) => row.slug === 'fridge-clearance-requirements');
  const dates = resolveGuideArticleDates({
    repoRoot: ROOT,
    filePath: path.join(ROOT, 'tmp', 'nonexistent-guide.html'),
    guide
  });

  assert.equal(dates.datePublished, '2026-04-18T12:11:49.000Z');
  assert.equal(dates.dateModified, '2026-04-25T00:00:00.000Z');
});
