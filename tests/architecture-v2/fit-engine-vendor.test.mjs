import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const canonical = new URL('../../src/shared/fit-engine.js', import.meta.url);
const browser = new URL('../../public/scripts/fit-engine.js', import.meta.url);

test('browser fit engine is an exact generated copy of the canonical engine', () => {
  assert.equal(readFileSync(browser, 'utf8'), readFileSync(canonical, 'utf8'));
});
