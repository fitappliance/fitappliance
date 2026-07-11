import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import publisher from '../../scripts/architecture-v2/publish-runtime-projection.js';

const { chooseProjection, publishRuntimeProjection } = publisher;

test('runtime projection defaults to configured V2 and supports explicit legacy rollback', () => {
  const config = { activeProjection: 'v2', allowedProjections: ['legacy', 'v2'] };
  assert.equal(chooseProjection(config, {}).name, 'v2');
  assert.equal(chooseProjection(config, { FITAPPLIANCE_CATALOG_PROJECTION: 'legacy' }).name, 'legacy');
  assert.throws(() => chooseProjection(config, { FITAPPLIANCE_CATALOG_PROJECTION: 'invalid' }), /projection/i);
});

test('publisher writes one selected catalog and consistent category/meta files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fit-publish-'));
  const legacy = { schema_version: 2, last_updated: '2026-01-01', products: [{ id: 'old', cat: 'fridge' }] };
  const v2 = { schema_version: 3, last_updated: '2026-01-02', products: [{ id: 'new', canonicalProductId: 'fa_prod_1', cat: 'fridge' }] };
  const result = await publishRuntimeProjection({ root, config: { activeProjection: 'v2', allowedProjections: ['legacy', 'v2'] }, legacy, v2, env: {}, logger: { log() {} } });
  assert.equal(result.projection, 'v2');
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'public/data/appliances.json'))).products[0].id, 'new');
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'public/data/fridges.json'))).products.length, 1);
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'public/data/appliances-meta.json'))).counts.fridge, 1);
});
