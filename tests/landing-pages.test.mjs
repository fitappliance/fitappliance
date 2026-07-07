import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function extractJsonLdBlocks(html) {
  const matches = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)];
  return matches.map((match) => JSON.parse(match[1]));
}

test('cavity pages generated for common widths', () => {
  const expected = [500, 600, 700, 800, 900, 1000];
  for (const width of expected) {
    const file = path.join(process.cwd(), 'pages', 'cavity', `${width}mm-fridge.html`);
    assert.ok(fs.existsSync(file), `Missing cavity page: ${width}mm`);
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, new RegExp(`${width}mm`), `Page should mention ${width}mm`);
    assert.match(html, /application\/ld\+json/, 'Should have JSON-LD');
  }
});

test('GSC CTR: cavity pages use search-aligned titles without Product schema', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'pages', 'cavity', '600mm-fridge.html'), 'utf8');
  assert.match(html, /<title>600mm Fridge Cavity: Fridges That Fit 600mm-Wide Spaces \| FitAppliance<\/title>/);
  assert.match(html, /<meta name="description" content="Find \d+ fridges that fit a 600mm wide Australian kitchen cavity after clearance checks\./);
  assert.match(html, /<meta name="robots" content="noindex, follow">/);

  const schemas = extractJsonLdBlocks(html);
  assert.equal(schemas.some((schema) => schema['@type'] === 'Product'), false);
  assert.ok(schemas.some((schema) => schema['@type'] === 'CollectionPage'));
  const itemList = schemas.find((schema) => schema['@type'] === 'ItemList');
  assert.ok(itemList);
  assert.equal(JSON.stringify(itemList).includes('"Product"'), false);
});

test('doorway pages generated for common widths', () => {
  const expected = [700, 750, 800, 850, 900];
  for (const width of expected) {
    const file = path.join(process.cwd(), 'pages', 'doorway', `${width}mm-fridge-doorway.html`);
    assert.ok(fs.existsSync(file), `Missing doorway page: ${width}mm`);
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, new RegExp(`${width}mm`), `Page should mention ${width}mm`);
    assert.match(html, /application\/ld\+json/, 'Should have JSON-LD');
  }
});

test('GSC CTR: doorway pages use delivery-intent titles without Product schema', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'pages', 'doorway', '700mm-fridge-doorway.html'), 'utf8');
  assert.match(html, /<title>700mm Doorway Fridge Delivery Check \| Models That Fit \| FitAppliance<\/title>/);
  assert.match(html, /<meta name="robots" content="noindex, follow">/);

  const schemas = extractJsonLdBlocks(html);
  assert.equal(schemas.some((schema) => schema['@type'] === 'Product'), false);
  assert.ok(schemas.some((schema) => schema['@type'] === 'CollectionPage'));
});

test('GSC indexability: sitemap omits held cavity and doorway pages', () => {
  const sitemap = fs.readFileSync(path.join(process.cwd(), 'public', 'sitemap.xml'), 'utf8');
  assert.doesNotMatch(sitemap, /\/cavity\//);
  assert.doesNotMatch(sitemap, /\/doorway\//);
});
