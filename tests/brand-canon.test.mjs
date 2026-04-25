import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonPath = path.join(repoRoot, 'data', 'brand-canon.json');

function loadCanonDocument() {
  return JSON.parse(fs.readFileSync(canonPath, 'utf8'));
}

test('phase 42b brand-canon: document has schema v1 and no drop brands', () => {
  const doc = loadCanonDocument();

  assert.equal(doc.schema_version, 1);
  assert.deepEqual(doc.policies.drop_brands, []);
});

test('phase 42b brand-canon: alias map has 24 non-chained entries', () => {
  const doc = loadCanonDocument();
  const aliasMap = doc.policies.alias_map;
  const keys = Object.keys(aliasMap);

  assert.equal(keys.length, 24);
  for (const [source, target] of Object.entries(aliasMap)) {
    assert.equal(typeof source, 'string');
    assert.equal(typeof target, 'string');
    assert.ok(target.length > 0);
    assert.equal(Object.hasOwn(aliasMap, target), false, `${source} points to chained alias key ${target}`);
  }
});

test('phase 42b brand-canon: evidence records all alias collisions with reason', () => {
  const doc = loadCanonDocument();
  const collisions = doc.evidence.alias_collisions;

  assert.equal(Object.keys(collisions).length, 24);
  for (const row of Object.values(collisions)) {
    assert.ok(Array.isArray(row.variants));
    assert.ok(row.variants.length >= 2);
    assert.equal(typeof row.chosen_canonical, 'string');
    assert.ok(row.variants.includes(row.chosen_canonical));
    assert.match(row.reason, /withRetailers|display-friendly/i);
  }
});

test('phase 42b brand-canon: deferred drops record all audit candidates', () => {
  const doc = loadCanonDocument();
  const deferred = doc.evidence.deferred_drops;

  assert.match(deferred.rationale, /drop decisions deferred/i);
  for (const brand of ['Sub-Zero', 'CHIQ', 'SEIKI', 'Solt', 'Sonai']) {
    assert.ok(Object.hasOwn(deferred.candidates_observed, brand), `${brand} missing from deferred evidence`);
  }
  assert.equal(deferred.candidates_observed.Sonai, 'not_found_in_catalog');
});
