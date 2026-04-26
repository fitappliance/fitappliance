import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleUrl = pathToFileURL(path.join(repoRoot, 'scripts', 'verify-sitemap.js')).href;

async function makeWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fit-sitemap-verify-'));
  await fs.mkdir(path.join(root, 'pages', 'brands'), { recursive: true });
  await fs.mkdir(path.join(root, 'public'), { recursive: true });
  await fs.writeFile(path.join(root, 'pages', 'brands', 'lg-fridge-clearance.html'), '<!doctype html>');
  await fs.writeFile(path.join(root, 'pages', 'affiliate-disclosure.html'), '<!doctype html>');
  await fs.writeFile(path.join(root, 'pages', 'privacy-policy.html'), '<!doctype html>');
  await fs.writeFile(path.join(root, 'pages', 'subscribe.html'), '<!doctype html>');
  await fs.writeFile(path.join(root, 'pages', 'about.html'), '<!doctype html>');
  await fs.writeFile(path.join(root, 'pages', 'methodology.html'), '<!doctype html>');
  await fs.mkdir(path.join(root, 'pages', 'about'), { recursive: true });
  await fs.writeFile(path.join(root, 'pages', 'about', 'editorial-standards.html'), '<!doctype html>');
  await fs.mkdir(path.join(root, 'pages', 'tools'), { recursive: true });
  await fs.writeFile(path.join(root, 'pages', 'tools', 'fit-checker.html'), '<!doctype html>');
  return root;
}

test('phase 43a quick wins: verify-sitemap fails when one expected route is missing from sitemap', async () => {
  const { verifySitemap } = await import(moduleUrl);
  const root = await makeWorkspace();
  const sitemapPath = path.join(root, 'public', 'sitemap.xml');
  await fs.writeFile(sitemapPath, `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.fitappliance.com.au/</loc></url>
  <url><loc>https://www.fitappliance.com.au/affiliate-disclosure</loc></url>
  <url><loc>https://www.fitappliance.com.au/privacy-policy</loc></url>
  <url><loc>https://www.fitappliance.com.au/about</loc></url>
  <url><loc>https://www.fitappliance.com.au/methodology</loc></url>
  <url><loc>https://www.fitappliance.com.au/about/editorial-standards</loc></url>
  <url><loc>https://www.fitappliance.com.au/subscribe</loc></url>
</urlset>`);

  const result = await verifySitemap({
    repoRoot: root,
    sitemapPath,
    logger: { log() {}, error() {} }
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ['/brands/lg-fridge-clearance', '/tools/fit-checker']);
});
