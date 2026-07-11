#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createObservation } from '../../src/domain/retailer-observation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const catalog = JSON.parse(await readFile(resolve(root, 'data/architecture-v2/public-catalog-projection.json'), 'utf8'));
const registry = JSON.parse(await readFile(resolve(root, 'data/architecture-v2/canonical-registry.json'), 'utf8'));
const canonicalByLegacy = new Map(registry.identifierMappings.map((row) => [row.legacyRuntimeId, row.canonicalProductId]));
const observations = [];
for (const product of catalog.products) {
  const canonicalProductId = canonicalByLegacy.get(String(product.id).toLowerCase());
  if (!canonicalProductId) continue;
  for (const retailer of product.retailers ?? []) {
    if (!retailer.url || !retailer.verified_at) continue;
    const sourceType = retailer.source === 'partnerize-feed' ? 'affiliate_feed' : 'legacy_catalog';
    const seed = `${canonicalProductId}\0${retailer.n}\0${retailer.url}\0${retailer.verified_at}`;
    observations.push(createObservation({
      id: `obs_${createHash('sha256').update(seed).digest('hex').slice(0, 24)}`,
      canonicalProductId,
      retailer: retailer.n,
      observedAt: `${retailer.verified_at}T00:00:00.000Z`,
      url: retailer.url,
      availability: retailer.stock === 'No' ? 'unavailable' : 'unknown',
      priceAud: Number.isFinite(retailer.p) ? retailer.p : null,
      title: retailer.feed_title ?? null,
      retailerProductId: retailer.tgg_sku ?? null,
      sourceType,
      sourceReference: retailer.source ?? 'legacy-catalog',
    }));
  }
}
observations.sort((a, b) => a.id.localeCompare(b.id));
const output = resolve(root, 'data/architecture-v2/retailer-observations.json');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({ schemaVersion: 1, observations })}\n`);
console.log(JSON.stringify({ observations: observations.length, products: new Set(observations.map((row) => row.canonicalProductId)).size }));
