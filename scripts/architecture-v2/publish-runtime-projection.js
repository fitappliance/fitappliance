#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { splitAppliances } = require('../split-appliances.js');

function chooseProjection(config, env = process.env) {
  const name = String(env.FITAPPLIANCE_CATALOG_PROJECTION || config.activeProjection || '').trim();
  if (!Array.isArray(config.allowedProjections) || !config.allowedProjections.includes(name)) {
    throw new TypeError(`unsupported runtime catalog projection ${name}`);
  }
  return Object.freeze({ name });
}

async function publishRuntimeProjection({ root, config, legacy, v2, env = process.env, logger = console }) {
  const { name } = chooseProjection(config, env);
  const catalog = name === 'v2' ? v2 : legacy;
  if (!catalog || !Array.isArray(catalog.products)) throw new TypeError(`${name} projection products required`);
  if (name === 'v2' && catalog.products.some((row) => !String(row.canonicalProductId || '').startsWith('fa_prod_'))) {
    throw new TypeError('V2 runtime projection contains a product without canonical ID');
  }
  const dataDir = path.join(root, 'public', 'data');
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, 'appliances.json'), JSON.stringify(catalog));
  await splitAppliances({ dataDir, logger });
  const marker = {
    schemaVersion: 1, activeProjection: name,
    productCount: catalog.products.length, sourceLastUpdated: catalog.last_updated ?? null,
    rollbackProjection: name === 'v2' ? 'legacy' : 'v2'
  };
  await fs.writeFile(path.join(dataDir, 'catalog-projection.json'), `${JSON.stringify(marker)}\n`);
  logger.log(`[catalog-projection] published ${name} with ${catalog.products.length} products`);
  return Object.freeze({ projection: name, productCount: catalog.products.length });
}

async function main() {
  const root = path.resolve(__dirname, '../..');
  const readJson = async (file) => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
  const config = await readJson('data/architecture-v2/runtime-config.json');
  const legacy = await readJson('data/architecture-v2/legacy-public-catalog.json');
  const v2 = await readJson('data/architecture-v2/public-catalog-projection.json');
  await publishRuntimeProjection({ root, config, legacy, v2 });
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { chooseProjection, publishRuntimeProjection };
