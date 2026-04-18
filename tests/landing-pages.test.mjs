import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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

test('sitemap includes cavity and doorway pages', () => {
  const sitemap = fs.readFileSync(path.join(process.cwd(), 'public', 'sitemap.xml'), 'utf8');
  assert.match(sitemap, /\/cavity\//);
  assert.match(sitemap, /\/doorway\//);
});
