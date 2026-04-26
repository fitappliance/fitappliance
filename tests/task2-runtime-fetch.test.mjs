import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexHtmlPath = path.join(repoRoot, 'index.html');
const vercelConfigPath = path.join(repoRoot, 'vercel.json');
const devGuidePath = path.join(repoRoot, 'DEVGUIDE.md');

async function loadIndexHtml() {
  return readFile(indexHtmlPath, 'utf8');
}

test('index.html bootstraps appliance data from runtime JSON fetches', async () => {
  const html = await loadIndexHtml();

  assert.match(
    html,
    /Promise\.all\(\s*\[\s*fetch\('\/data\/clearance\.json'\)/,
  );
  assert.doesNotMatch(html, /fetch\('\/data\/rebates\.json'\)/);
  assert.match(html, /fetch\('\/data\/appliances-meta\.json'\)/);
  assert.match(html, /await loadCategory\(initialCat\);/);
  assert.match(html, /fetch\('\/data\/appliances\.json'\)\.then\(requireJson\)/);
  assert.match(
    html,
    /\.then\(\(\[clearData\]\)\s*=>\s*{\s*const BRAND_CLEARANCE = clearData\.rules;/s,
  );
  assert.match(html, /initApp\(BRAND_CLEARANCE\)/);
});

test('index.html removes embedded data constants and wraps app logic in initApp', async () => {
  const html = await loadIndexHtml();

  assert.doesNotMatch(html, /const PRODUCTS = \[/);
  assert.doesNotMatch(html, /const BRAND_CLEARANCE = \{/);
  assert.doesNotMatch(html, /const REBATES = \{/);
  assert.match(html, /let PRODUCTS = \[\];/);
  assert.match(html, /async function initApp\(BRAND_CLEARANCE\)\s*{/);
});

test('index.html exposes UI handlers after init and renders a load error message on fetch failure', async () => {
  const html = await loadIndexHtml();

  assert.match(html, /Object\.assign\(window,\s*{/);
  assert.match(html, /toggleAdv,/);
  assert.match(html, /toggleSave,/);
  assert.match(html, /copySavedShareLink,/);
  assert.match(html, /Unable to load appliance data\. Please refresh\./);
  assert.match(html, /document\.getElementById\('resultsSection'\)\.style\.display\s*=\s*'block';/);
  assert.match(html, /document\.getElementById\('productGrid'\)\.innerHTML\s*=\s*'(<p class="error">|<div class="error">)Unable to load appliance data\. Please refresh\./);
  assert.match(html, /const cat = BRAND_CLEARANCE\[category\] \?\? BRAND_CLEARANCE\.fridge;/);
  assert.match(html, /return cat\[brand\] \?\? cat\['__default__'\];/);
  assert.doesNotMatch(html, /rb\.color/);
});

test('data JSON files are routed from /data without relying on a checked-in symlink', async () => {
  const vercelConfig = JSON.parse(await readFile(vercelConfigPath, 'utf8'));
  const dataRewrite = (vercelConfig.rewrites ?? []).find(r => r.source === '/data/:path*');

  assert.ok(dataRewrite, 'vercel.json should have a rewrite for /data/:path*');
  assert.strictEqual(dataRewrite.destination, '/public/data/:path*');

  assert.ok(existsSync(path.join(repoRoot, 'public', 'data', 'appliances.json')));
  assert.ok(existsSync(path.join(repoRoot, 'public', 'data', 'clearance.json')));
  assert.ok(existsSync(path.join(repoRoot, 'public', 'data', 'rebates.json')));
  const rootDataPath = path.join(repoRoot, 'data');
  if (existsSync(rootDataPath)) {
    assert.ok(lstatSync(rootDataPath).isDirectory(), 'root data path should be a directory when present');
    assert.ok(!existsSync(path.join(rootDataPath, 'appliances.json')));
    assert.ok(!existsSync(path.join(rootDataPath, 'clearance.json')));
    assert.ok(!existsSync(path.join(rootDataPath, 'rebates.json')));
    assert.ok(existsSync(path.join(rootDataPath, 'locations', 'au-cities.json')));
  }
});

test('DEVGUIDE matches the current clearance key naming and local verification workflow', async () => {
  const guide = await readFile(devGuidePath, 'utf8');

  assert.match(guide, /"__default__":\s+\{\s+"side": 25, "rear": 25, "top": 50 \}/);
  assert.match(guide, /"__default__":\s+\{\s+"side": 0,\s+"rear": 50,\s+"top": 0 \}/);
  assert.match(guide, /Open site locally via `(?:npx )?vercel dev`/);
  assert.doesNotMatch(guide, /Open site locally via `python3 -m http\.server` from repo root/);
  assert.match(guide, /migration-only extraction script/i);
});

test('the repository does not keep a tracked data symlink workaround', async () => {
  const dataPath = path.join(repoRoot, 'data');
  assert.ok(!existsSync(dataPath) || !lstatSync(dataPath).isSymbolicLink());
});
