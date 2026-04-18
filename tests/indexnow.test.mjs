import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('IndexNow key file exists in public/', () => {
  const keyPath = path.join(process.cwd(), '.indexnow-key');
  assert.ok(fs.existsSync(keyPath), '.indexnow-key is missing');

  const key = fs.readFileSync(keyPath, 'utf8').trim();
  assert.match(key, /^[a-f0-9]{32}$/);

  const keyFilePath = path.join(process.cwd(), 'public', `${key}.txt`);
  assert.ok(fs.existsSync(keyFilePath), `Key file ${keyFilePath} missing`);
  assert.equal(fs.readFileSync(keyFilePath, 'utf8').trim(), key);
});

test('ping-indexnow.js script exists and parses sitemap', () => {
  const scriptPath = path.join(process.cwd(), 'scripts', 'ping-indexnow.js');
  assert.ok(fs.existsSync(scriptPath), `${scriptPath} missing`);

  const script = fs.readFileSync(scriptPath, 'utf8');
  assert.match(script, /api\.indexnow\.org/);
  assert.match(script, /sitemap\.xml/);
});
