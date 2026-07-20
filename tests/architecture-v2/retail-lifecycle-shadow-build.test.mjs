import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  buildRetailLifecycleShadowFromRepository,
} from '../../scripts/architecture-v2/build-retail-lifecycle-shadow.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('retail lifecycle shadow builder replays byte-for-byte and leaves production projection unchanged', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fitappliance-lifecycle-shadow-'));
  const output = join(directory, 'retail-lifecycle-shadow.json');
  const productionPath = resolve(root, 'data/architecture-v2/generated/public-catalog-projection.json');
  const productionBefore = await readFile(productionPath);
  try {
    const first = await buildRetailLifecycleShadowFromRepository({ root, output });
    const firstBytes = await readFile(output);
    const second = await buildRetailLifecycleShadowFromRepository({ root, output });
    const secondBytes = await readFile(output);

    assert.deepEqual(second, first);
    assert.equal(hash(secondBytes), hash(firstBytes));
    assert.equal(first.summary.products, 3515);
    assert.equal(first.summary.legacyCurrentProducts, 1384);
    assert.equal(first.cutover.status, 'BLOCKED');
    assert.equal(first.cutover.unresolvedLegacyCurrentIds.length, 1384);
    assert.equal(hash(await readFile(productionPath)), hash(productionBefore));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
