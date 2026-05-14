import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('account dashboard: account route and page shell are present', () => {
  const vercel = fs.readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8');
  const page = fs.readFileSync(path.join(repoRoot, 'pages', 'account.html'), 'utf8');

  assert.match(vercel, /"source":\s*"\/account"/);
  assert.match(page, /My Appliances/);
  assert.match(page, /data-account-app/);
  assert.match(page, /account-dashboard\.mjs/);
});

test('account dashboard: supports the four core categories and WashTower / Combo', () => {
  const page = fs.readFileSync(path.join(repoRoot, 'pages', 'account.html'), 'utf8');

  assert.match(page, /Fridge/);
  assert.match(page, /Washing Machine/);
  assert.match(page, /Dishwasher/);
  assert.match(page, /Dryer/);
  const dashboard = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'account-dashboard.mjs'), 'utf8');
  assert.match(dashboard, /WashTower \/ Combo/);
});

test('account dashboard: homepage navigation exposes account entry point', () => {
  const index = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

  assert.match(index, /href="\/account"/);
  assert.match(index, /My Appliances/);
});
