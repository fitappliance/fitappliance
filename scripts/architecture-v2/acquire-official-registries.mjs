#!/usr/bin/env node
import { readFile, rename, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRegistrySnapshotManifest } from '../../src/domain/official-registry-snapshot.mjs';
import {
  fetchRegistryBytes,
  persistRegistrySnapshot,
  selectEnergyRatingResources,
  validateRegistryCsvPayload,
} from '../../src/domain/official-registry-acquisition.mjs';
import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const storageRoot = option('--storage-root') ?? process.env.FITAPPLIANCE_STORAGE_ROOT;
if (!storageRoot) throw new TypeError('--storage-root or FITAPPLIANCE_STORAGE_ROOT is required');
const retrievedAt = new Date(option('--retrieved-at') ?? Date.now()).toISOString();
const policy = JSON.parse(await readFile(resolveArchitectureV2Path(root, 'officialRegistrySourcePolicy'), 'utf8'));

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

async function acquire({ sourceId, sourceUrl, allowedHosts, mediaType, licence, metadataSha256 = null, validateBytes = null }) {
  const transport = await fetchRegistryBytes({ url: sourceUrl, allowedHosts });
  if (validateBytes) validateBytes(transport.bytes);
  const manifest = createRegistrySnapshotManifest({
    sourceId,
    sourceUrl: transport.finalUrl,
    retrievedAt,
    mediaType,
    bytes: transport.bytes,
    licence,
    metadataSha256,
  });
  await persistRegistrySnapshot({ manifest, bytes: transport.bytes, storageRoot });
  return {
    manifest,
    transport: {
      finalUrl: transport.finalUrl,
      etag: transport.etag,
      lastModified: transport.lastModified,
    },
    bytes: transport.bytes,
  };
}

const energyPolicy = policy.sources['energy-rating'];
const metadata = await acquire({
  sourceId: 'energy-rating:metadata',
  sourceUrl: energyPolicy.metadataUrl,
  allowedHosts: energyPolicy.allowedHosts,
  mediaType: 'application/json',
  licence: energyPolicy.licence,
  validateBytes: (bytes) => {
    const document = JSON.parse(bytes.toString('utf8'));
    if (document.success !== true || !Array.isArray(document.result?.resources)) throw new Error('Energy Rating metadata response is invalid');
  },
});
const metadataDocument = JSON.parse(metadata.bytes.toString('utf8'));
const energyResources = selectEnergyRatingResources(metadataDocument, ['fridge', 'dishwasher']);
const snapshots = [{ kind: 'metadata', category: null, manifest: metadata.manifest, transport: metadata.transport }];
for (const category of ['fridge', 'dishwasher']) {
  const resource = energyResources[category];
  const acquired = await acquire({
    sourceId: `energy-rating:${category}`,
    sourceUrl: resource.url,
    allowedHosts: energyPolicy.allowedHosts,
    mediaType: 'text/csv',
    licence: energyPolicy.licence,
    metadataSha256: metadata.manifest.contentSha256,
    validateBytes: (bytes) => validateRegistryCsvPayload(bytes, { requiredHeaders: ['Brand', 'Model No', 'Width', 'Height', 'Depth', 'Availability Status'] }),
  });
  snapshots.push({
    kind: 'energy-rating',
    category,
    resource: { name: resource.name, resourceId: resource.resourceId, lastModified: resource.lastModified },
    manifest: acquired.manifest,
    transport: acquired.transport,
  });
}

const welsPolicy = policy.sources.wels;
const wels = await acquire({
  sourceId: 'wels:all-models',
  sourceUrl: welsPolicy.downloadUrl,
  allowedHosts: welsPolicy.allowedHosts,
  mediaType: 'text/csv',
  licence: welsPolicy.licence,
  validateBytes: (bytes) => validateRegistryCsvPayload(bytes, { requiredHeaders: ['Brand', 'Product', 'Model name', 'Model code', 'Model status', 'Registration number'] }),
});
snapshots.push({ kind: 'wels', category: 'all', manifest: wels.manifest, transport: wels.transport });

const output = {
  schemaVersion: 1,
  policyVersion: policy.policyVersion,
  acquiredAt: retrievedAt,
  storage: { rootEnv: 'FITAPPLIANCE_STORAGE_ROOT', rawPayloadsInRepository: false },
  snapshots,
};
await atomicJson(resolveArchitectureV2Path(root, 'officialRegistrySnapshots'), output);
console.log(JSON.stringify({
  snapshots: snapshots.length,
  bytes: snapshots.reduce((sum, row) => sum + row.manifest.byteLength, 0),
  hashes: Object.fromEntries(snapshots.map((row) => [row.manifest.sourceId, row.manifest.contentSha256])),
}));
