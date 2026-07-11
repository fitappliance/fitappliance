#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { splitAppliances } = require('../split-appliances.js');

async function publishRuntimeProjection({ root, catalog, logger = console }) {
  if (!catalog || !Array.isArray(catalog.products)) throw new TypeError('canonical projection products required');
  if (catalog.products.some((row) => !String(row.canonicalProductId || '').startsWith('fa_prod_'))) {
    throw new TypeError('V2 runtime projection contains a product without canonical ID');
  }
  const dataDir = path.join(root, 'public', 'data');
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, 'appliances.json'), JSON.stringify(catalog));
  await splitAppliances({ dataDir, logger });
  const marker = {
    schemaVersion: 2, activeProjection: 'v2',
    productCount: catalog.products.length, sourceLastUpdated: catalog.last_updated ?? null
  };
  await fs.writeFile(path.join(dataDir, 'catalog-projection.json'), `${JSON.stringify(marker)}\n`);
  logger.log(`[catalog-projection] published v2 with ${catalog.products.length} products`);
  return Object.freeze({ projection: 'v2', productCount: catalog.products.length });
}

async function main() {
  const root = path.resolve(__dirname, '../..');
  const readJson = async (file) => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
  const { architectureV2Paths } = await import('../../src/domain/architecture-v2-paths.mjs');
  const catalog = await readJson(architectureV2Paths.publicProjection);
  await publishRuntimeProjection({ root, catalog });
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { publishRuntimeProjection };
