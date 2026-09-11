import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const canonical = new URL('../../src/shared/fit-engine.js', import.meta.url);
const browser = new URL('../../public/scripts/fit-engine.js', import.meta.url);
const require = createRequire(import.meta.url);

test('browser fit engine is an exact generated copy of the canonical engine', () => {
  assert.equal(readFileSync(browser, 'utf8'), readFileSync(canonical, 'utf8'));
});

test('canonical and browser engines expose the Fit V4 contract', () => {
  assert.equal(typeof require('../../src/shared/fit-engine.js').evaluateFitV4, 'function');
  assert.equal(typeof require('../../public/scripts/fit-engine.js').evaluateFitV4, 'function');
  assert.equal(typeof require('../../src/shared/fit-engine.js').resolveEvidenceLevel, 'function');
  assert.equal(typeof require('../../public/scripts/fit-engine.js').resolveEvidenceLevel, 'function');
});
