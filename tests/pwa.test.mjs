import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createServiceWorkerSource,
  generateServiceWorker
} = require('../scripts/generate-sw.js');

const repoRoot = '/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2';

test('phase 33 pwa: manifest.webmanifest has required fields', () => {
  const manifestPath = path.join(repoRoot, 'public', 'manifest.webmanifest');
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);

  assert.equal(typeof manifest.name, 'string');
  assert.equal(typeof manifest.short_name, 'string');
  assert.equal(manifest.display, 'standalone');
  assert.equal(typeof manifest.start_url, 'string');
  assert.equal(typeof manifest.theme_color, 'string');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
});

test('phase 33 pwa: service-worker source includes version constant and version changes across builds', async () => {
  const first = createServiceWorkerSource({
    version: 'fitappliance-v111',
    precache: ['/index.html', '/guides/fridge-clearance-requirements']
  });
  const second = createServiceWorkerSource({
    version: 'fitappliance-v222',
    precache: ['/index.html', '/guides/fridge-clearance-requirements']
  });

  assert.match(first, /const SW_VERSION = 'fitappliance-v111'/);
  assert.match(second, /const SW_VERSION = 'fitappliance-v222'/);
  assert.notEqual(first, second);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fit-pwa-test-'));
  const outputPath = path.join(tmpDir, 'service-worker.js');
  await generateServiceWorker({
    outputPath,
    nowFn: () => new Date('2026-04-18T00:00:00.000Z')
  });
  const generated = fs.readFileSync(outputPath, 'utf8');
  assert.match(generated, /const SW_VERSION = 'fitappliance-v/);
});

test('phase 33 pwa: service-worker explicitly avoids caching /api/* requests', () => {
  const serviceWorkerPath = path.join(repoRoot, 'public', 'service-worker.js');
  const source = fs.readFileSync(serviceWorkerPath, 'utf8');

  assert.match(source, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(source, /return fetch\(request\)/);
});

test('phase 33 pwa: sw-register is non-blocking and loaded with defer in homepage', () => {
  const registerPath = path.join(repoRoot, 'public', 'scripts', 'sw-register.js');
  const registerSource = fs.readFileSync(registerPath, 'utf8');
  assert.match(registerSource, /window\.addEventListener\('load'/);
  assert.match(registerSource, /navigator\.serviceWorker\.register/);

  const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
  assert.match(indexHtml, /<script defer src="\/scripts\/sw-register\.js"><\/script>/);
});
