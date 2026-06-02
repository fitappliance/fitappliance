import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function extractJsonLdBlocks(html) {
  const matches = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)];
  return matches.map((match) => JSON.parse(match[1]));
}

test('homepage has HowTo schema', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  const schemas = extractJsonLdBlocks(html);
  const graphTypes = schemas.flatMap((schema) => {
    if (Array.isArray(schema['@graph'])) {
      return schema['@graph'].map((node) => node['@type']);
    }
    return [schema['@type']];
  });
  assert.ok(graphTypes.includes('HowTo'), 'HowTo schema missing from homepage');
});

test('brand pages have BreadcrumbList', () => {
  const html = fs.readFileSync(
    path.join(process.cwd(), 'pages', 'brands', 'samsung-fridge-clearance.html'),
    'utf8'
  );
  assert.match(html, /"@type":\s*"BreadcrumbList"/);
});

test('brand pages have non-product ItemList entries with dimension text', () => {
  const html = fs.readFileSync(
    path.join(process.cwd(), 'pages', 'brands', 'samsung-fridge-clearance.html'),
    'utf8'
  );
  const schemas = extractJsonLdBlocks(html);
  const itemList = schemas.find((schema) => schema['@type'] === 'ItemList');
  assert.ok(itemList, 'ItemList schema missing from brand page');
  assert.ok(Array.isArray(itemList.itemListElement));
  assert.ok(itemList.itemListElement.length > 0);
  assert.equal(itemList.itemListElement[0]['@type'], 'ListItem');
  assert.equal(itemList.itemListElement[0].item, undefined);
  assert.doesNotMatch(JSON.stringify(itemList), /"Product"/);
  assert.match(itemList.itemListElement[0].description, /W \d+mm x H \d+mm x D \d+mm/);
});
