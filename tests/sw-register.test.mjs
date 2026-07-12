import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const source = fs.readFileSync(path.join(ROOT, 'public', 'scripts', 'sw-register.js'), 'utf8');
const homepage = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

test('service worker update handling does not render a blocking refresh toast', () => {
  assert.doesNotMatch(source, /New version available/);
  assert.doesNotMatch(source, /className\s*=\s*['"]sw-update-toast['"]/);
  assert.doesNotMatch(source, /z-index:\s*9999/);
  assert.doesNotMatch(source, /appendChild\(toast\)/);
});

test('service worker registration still waits for load and respects save-data mode', () => {
  assert.match(source, /window\.addEventListener\('load'/);
  assert.match(source, /navigator\.serviceWorker\.register\('\/service-worker\.js'\)/);
  assert.match(source, /connection\?\.saveData/);
});

test('release safety sw: fresh HTML installs an inline update guard before cached scripts execute', () => {
  const guardIndex = homepage.indexOf('data-sw-release-guard');
  const registerIndex = homepage.indexOf('/scripts/sw-register.js');

  assert.ok(guardIndex > 0, 'homepage must contain the inline release guard');
  assert.ok(guardIndex < registerIndex, 'the release guard must run before the external registration script');
  assert.match(homepage, /navigator\.serviceWorker\.controller/);
  assert.match(homepage, /controllerchange/);
  assert.match(homepage, /__fitApplianceServiceWorkerReloading/);
  assert.match(homepage, /window\.location\.reload\(\)/);
});
