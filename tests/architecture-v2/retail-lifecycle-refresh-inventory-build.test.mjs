import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  buildRetailLifecycleRefreshInventoryFromRepository,
} from '../../scripts/architecture-v2/build-retail-lifecycle-refresh-inventory.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const hash = (value) => createHash('sha256').update(value).digest('hex');

test('refresh inventory builder replays byte-for-byte without network or external storage', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fitappliance-retail-refresh-'));
  const output = join(directory, 'retail-lifecycle-refresh-inventory.json');
  try {
    const first = await buildRetailLifecycleRefreshInventoryFromRepository({ root, output });
    const firstBytes = await readFile(output);
    const second = await buildRetailLifecycleRefreshInventoryFromRepository({ root, output });
    const secondBytes = await readFile(output);
    assert.deepEqual(second, first);
    assert.equal(hash(secondBytes), hash(firstBytes));
    assert.equal(first.summary.products, 1384);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
