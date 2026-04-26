import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

test('phase 48 clearance modes: config declares practical as the default mode', () => {
  const doc = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'clearance-modes.json'), 'utf8'));

  assert.equal(doc.schema_version, 1);
  assert.equal(doc.default_mode, 'practical');
  assert.deepEqual(doc.modes.physical, { side: 0, top: 0, rear: 0 });
  assert.deepEqual(doc.modes.practical, { side: 5, top: 20, rear: 10 });
  assert.equal(doc.modes.manufacturer, null);
});

test('phase 48 clearance modes: physical mode returns zero clearance for every brand', () => {
  const { getEffectiveClearance } = require('../scripts/common/clearance.js');
  const brandSpecific = {
    fridge: {
      Samsung: { side: 50, top: 100, rear: 50 },
      Haier: { side: 25.4, top: 25.4, rear: 25.4 }
    }
  };

  assert.deepEqual(getEffectiveClearance('fridge', 'Samsung', 'physical', brandSpecific), { side: 0, top: 0, rear: 0 });
  assert.deepEqual(getEffectiveClearance('fridge', 'Haier', 'physical', brandSpecific), { side: 0, top: 0, rear: 0 });
  assert.deepEqual(getEffectiveClearance('fridge', 'Unknown', 'physical', brandSpecific), { side: 0, top: 0, rear: 0 });
});

test('phase 48 clearance modes: practical mode returns fixed real-world default for every brand', () => {
  const { getEffectiveClearance } = require('../scripts/common/clearance.js');
  const brandSpecific = {
    fridge: {
      Samsung: { side: 50, top: 100, rear: 50 },
      Haier: { side: 25.4, top: 25.4, rear: 25.4 }
    }
  };

  assert.deepEqual(getEffectiveClearance('fridge', 'Samsung', 'practical', brandSpecific), { side: 5, top: 20, rear: 10 });
  assert.deepEqual(getEffectiveClearance('fridge', 'Haier', 'practical', brandSpecific), { side: 5, top: 20, rear: 10 });
  assert.deepEqual(getEffectiveClearance('fridge', 'Unknown', 'practical', brandSpecific), { side: 5, top: 20, rear: 10 });
});

test('phase 48 clearance modes: manufacturer mode uses brand-specific table and fallback defaults', () => {
  const { getEffectiveClearance } = require('../scripts/common/clearance.js');
  const brandSpecific = {
    fridge: {
      Samsung: { side: 50, top: 100, rear: 50 },
      '__default__': { side: 40, top: 50, rear: 25 }
    }
  };

  assert.deepEqual(getEffectiveClearance('fridge', 'Samsung', 'manufacturer', brandSpecific), { side: 50, top: 100, rear: 50 });
  assert.deepEqual(getEffectiveClearance('fridge', 'Obscure', 'manufacturer', brandSpecific), { side: 40, top: 50, rear: 25 });
});

test('phase 48 clearance modes: unknown mode falls back to practical', () => {
  const { getEffectiveClearance } = require('../scripts/common/clearance.js');

  assert.deepEqual(
    getEffectiveClearance('fridge', 'Samsung', 'not-a-mode', { fridge: { Samsung: { side: 50, top: 100, rear: 50 } } }),
    { side: 5, top: 20, rear: 10 }
  );
});
