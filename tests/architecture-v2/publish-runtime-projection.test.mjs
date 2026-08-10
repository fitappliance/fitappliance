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
  const projectionBuilderSource = readFileSync(path.join(root, 'scripts/architecture-v2/build-public-projection.mjs'), 'utf8');
  const productGenerator = readFileSync(path.join(root, 'scripts/generate-product-pages.js'), 'utf8');
  assert.doesNotMatch(publisherSource, /FITAPPLIANCE_CATALOG_PROJECTION|rollbackProjection|legacy-public-catalog/);
  assert.match(productGenerator, /architecture-v2['"],\s*'generated['"],\s*'public-catalog-projection\.json/);
  assert.doesNotMatch(productGenerator, /architecture-v2['"],\s*'public-catalog-projection\.json/);
  assert.doesNotMatch(productGenerator, /public-page-projection\.json/);
  assert.match(projectionBuilderSource, /enrichApplianceDocument/);
});

test('publisher writes the canonical catalog and consistent category/meta files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fit-publish-'));
  const catalog = { schema_version: 3, last_updated: '2026-01-02', products: [{ id: 'new', canonicalProductId: 'fa_prod_1', cat: 'fridge', readableSpec: 'Top-mount fridge', priorityScore: 12 }] };
  const result = await publishRuntimeProjection({ root, catalog, logger: { log() {} } });
  assert.equal(result.projection, 'v2');
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'public/data/appliances.json'))).products[0].id, 'new');
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'public/data/fridges.json'))).products.length, 1);
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'public/data/appliances-meta.json'))).counts.fridge, 1);
  const marker = JSON.parse(await fs.readFile(path.join(root, 'public/data/catalog-projection.json')));
  assert.equal(marker.activeProjection, 'v2');
  assert.equal('rollbackProjection' in marker, false);
});

test('publisher strips private Partnerize feed evidence before writing any public data file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fit-publish-private-feed-'));
  const catalog = {
    schema_version: 3,
    last_updated: '2026-01-02',
    products: [{
      id: 'private-feed',
      canonicalProductId: 'fa_prod_private',
      cat: 'fridge',
      readableSpec: 'Top-mount fridge',
      priorityScore: 12,
      unavailable: false,
      retailers: [{
        n: 'The Good Guys',
        url: 'https://www.thegoodguys.com.au/example',
        source: 'retailer-observation:affiliate_feed',
        feed_title: 'Private title',
      }],
      retailLifecycle: {
        lifecycleState: 'CURRENT_RETAIL',
        authorizingObservation: { sourceType: 'affiliate_feed' },
        latestObservations: [{ sourceType: 'affiliate_feed' }],
      },
      lifecycleVisibility: 'CURRENT_OUTPUT',
    }],
  };

  await publishRuntimeProjection({ root, catalog, logger: { log() {} } });
  for (const relativePath of ['appliances.json', 'fridges.json']) {
    const published = JSON.parse(await fs.readFile(path.join(root, 'public/data', relativePath)));
    assert.deepEqual(published.products[0].retailers, []);
    assert.equal(published.products[0].unavailable, true);
    assert.equal(Object.hasOwn(published.products[0], 'retailLifecycle'), false);
    assert.doesNotMatch(JSON.stringify(published), /affiliate_feed|feed_title|Private title/);
  }
});

test('publisher rejects a projection that dropped deterministic display metadata', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fit-publish-metadata-'));
  const catalog = {
    schema_version: 3,
    products: [{ id: 'new', canonicalProductId: 'fa_prod_1', cat: 'fridge' }],
  };

  await assert.rejects(
    publishRuntimeProjection({ root, catalog, logger: { log() {} } }),
    /display metadata/i,
  );
});
