import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import publisher from '../../scripts/architecture-v2/publish-runtime-projection.js';

const { publishRuntimeProjection } = publisher;

test('phase 7 removes legacy runtime files and dual-projection code paths', () => {
  const root = path.resolve(new URL('../..', import.meta.url).pathname);
  assert.equal(existsSync(path.join(root, 'data/architecture-v2/legacy-public-catalog.json')), false);
  assert.equal(existsSync(path.join(root, 'data/architecture-v2/public-page-projection.json')), false);
  assert.equal(existsSync(path.join(root, 'data/architecture-v2/runtime-config.json')), false);
  assert.equal(existsSync(path.join(root, 'src/domain/projection-selector.mjs')), false);
  const publisherSource = readFileSync(path.join(root, 'scripts/architecture-v2/publish-runtime-projection.js'), 'utf8');
  const productGenerator = readFileSync(path.join(root, 'scripts/generate-product-pages.js'), 'utf8');
  assert.doesNotMatch(publisherSource, /FITAPPLIANCE_CATALOG_PROJECTION|rollbackProjection|legacy-public-catalog/);
  assert.match(productGenerator, /public-catalog-projection\.json/);
  assert.doesNotMatch(productGenerator, /public-page-projection\.json/);
});

test('publisher writes the canonical catalog and consistent category/meta files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fit-publish-'));
  const catalog = { schema_version: 3, last_updated: '2026-01-02', products: [{ id: 'new', canonicalProductId: 'fa_prod_1', cat: 'fridge' }] };
  const result = await publishRuntimeProjection({ root, catalog, logger: { log() {} } });
  assert.equal(result.projection, 'v2');
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'public/data/appliances.json'))).products[0].id, 'new');
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'public/data/fridges.json'))).products.length, 1);
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'public/data/appliances-meta.json'))).counts.fridge, 1);
  const marker = JSON.parse(await fs.readFile(path.join(root, 'public/data/catalog-projection.json')));
  assert.equal(marker.activeProjection, 'v2');
  assert.equal('rollbackProjection' in marker, false);
});
