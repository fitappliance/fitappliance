import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const indexHtml = fs.readFileSync('index.html', 'utf8');

test('old appliance UI: exposes visible retailer-backed suggestion buttons', () => {
  assert.match(indexHtml, /id="oldModelQuickPicks"/);
  assert.match(indexHtml, /replacement-suggestion/);
  assert.match(indexHtml, /data-old-model-value/);
  assert.match(indexHtml, /countVerifiedRetailerLinks/);
});

test('old appliance UI: suggestion buttons fill the old model input and trigger matching', () => {
  assert.match(indexHtml, /oldModelQuickPicks[\s\S]+addEventListener\('click'/);
  assert.match(indexHtml, /oldModelInput'\)\.value = value/);
  assert.match(indexHtml, /useOldModelSize\(\)/);
});
