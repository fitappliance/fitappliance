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

test('brand pages have ItemList with dimensions', () => {
  const html = fs.readFileSync(
    path.join(process.cwd(), 'pages', 'brands', 'samsung-fridge-clearance.html'),
    'utf8'
  );
  assert.match(html, /"@type":\s*"ItemList"/);
  assert.match(html, /QuantitativeValue/);
});
