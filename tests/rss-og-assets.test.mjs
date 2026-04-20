import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('RSS feed is valid and has at least 20 items', () => {
  const rssPath = path.join(process.cwd(), 'public', 'rss.xml');
  assert.ok(fs.existsSync(rssPath), 'public/rss.xml should exist');
  const rss = fs.readFileSync(rssPath, 'utf8');
  assert.match(rss, /<rss[\s>]/, 'rss root element should exist');
  const itemCount = (rss.match(/<item>/g) || []).length;
  assert.ok(itemCount >= 20, `expected >=20 RSS items, got ${itemCount}`);
});

test('image sitemap exists and includes image entries', () => {
  const sitemapPath = path.join(process.cwd(), 'public', 'image-sitemap.xml');
  assert.ok(fs.existsSync(sitemapPath), 'public/image-sitemap.xml should exist');
  const xml = fs.readFileSync(sitemapPath, 'utf8');
  assert.match(xml, /<urlset[\s>]/, 'urlset root element should exist');
  assert.match(xml, /<image:image>/, 'image sitemap should include image:image entries');
});

test('OG images exist for top brand fridge pages', () => {
  const brands = ['samsung', 'lg', 'fisher-paykel', 'westinghouse', 'electrolux'];
  for (const brand of brands) {
    const filePath = path.join(process.cwd(), 'public', 'og-images', `${brand}-fridge.png`);
    assert.ok(fs.existsSync(filePath), `expected OG image: ${filePath}`);
  }
});

test('brand pages include og:image meta tag', () => {
  const html = fs.readFileSync(
    path.join(process.cwd(), 'pages', 'brands', 'samsung-fridge-clearance.html'),
    'utf8'
  );
  assert.match(html, /<meta property="og:image" content="https:\/\/www\.fitappliance\.com\.au\/og-images\/samsung-fridge\.png">/);
});
