import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadActiveRetailRelease } from '../../src/domain/active-retail-release.mjs';
import { validateFitV4FieldMap } from '../../src/domain/fit-v4-contract.mjs';
import {
  buildFitV4ReadinessEpoch,
  createNotMaterializedFitV4SourceRegistry,
  materializeFitV4ReadinessEpoch,
  readFitV4ReadinessHead,
  sha256,
} from '../../src/domain/fit-v4-readiness-epoch.mjs';
import { createFitV4ReceiptBundle } from '../../src/domain/installation-evidence-receipt-v4.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const paths = {
  descriptor: resolve(root, 'data/architecture-v2/decisions/active-retail-release.json'),
  identityMap: resolve(root, 'data/architecture-v2/reviews/automated/fit-v4-universe-reconciliation.json'),
  fieldMap: resolve(root, 'data/architecture-v2/policies/fit-v4-field-map.json'),
  rightsDictionary: resolve(root, 'data/architecture-v2/policies/product-data-field-rights-dictionary.json'),
  publicationRights: resolve(root, 'data/architecture-v2/policies/fit-v4-publication-rights-registry.json'),
  producer: resolve(root, 'src/domain/fit-v4-readiness-epoch.mjs'),
  materializer: fileURLToPath(import.meta.url),
  store: resolve(root, 'data/architecture-v2/epochs/fit-v4-readiness'),
};

async function jsonBinding(path) {
  const bytes = await readFile(path);
  return { bytes, document: JSON.parse(bytes) };
}

const active = await loadActiveRetailRelease({ root, descriptorPath: paths.descriptor });
const [
  descriptor,
  catalogBytes,
  referenceBytes,
  identityMap,
  fieldMap,
  rightsDictionary,
  publicationRights,
  producerBytes,
  materializerBytes,
] = await Promise.all([
  jsonBinding(paths.descriptor),
  readFile(active.paths.catalog),
  readFile(active.paths.reference),
  jsonBinding(paths.identityMap),
  jsonBinding(paths.fieldMap),
  jsonBinding(paths.rightsDictionary),
  jsonBinding(paths.publicationRights),
  readFile(paths.producer),
  readFile(paths.materializer),
]);
const validatedFieldMap = validateFitV4FieldMap(fieldMap.document);
const asOf = publicationRights.document.asOf;
const receiptBundle = createFitV4ReceiptBundle([], { fieldMap: validatedFieldMap });
const sourceRegistry = createNotMaterializedFitV4SourceRegistry(asOf);
const epoch = buildFitV4ReadinessEpoch({
  activeRelease: {
    descriptorBytes: descriptor.bytes,
    descriptor: descriptor.document,
    catalogBytes,
    catalog: active.catalog,
    referenceBytes,
    reference: active.reference,
  },
  identityMap,
  fieldMap,
  rightsDictionary,
  receiptBundle,
  sourceRegistry,
  publicationRights: {
    ...publicationRights,
    authorizationEvidenceBytes: {},
  },
  producer: {
    producerSha256: sha256(producerBytes),
    materializerSha256: sha256(materializerBytes),
  },
  asOf,
  clocks: {
    catalog: active.catalog.retailLifecycleRelease.asOf,
    receipt: asOf,
    source: asOf,
    rights: asOf,
  },
});
const observed = await readFitV4ReadinessHead(paths.store);
const processStartedAt = new Date(Date.now() - Math.floor(process.uptime() * 1000)).toISOString();
const result = await materializeFitV4ReadinessEpoch({
  storeRoot: paths.store,
  epoch,
  expectedHeadSha256: observed?.headSha256 ?? null,
  owner: {
    ownerToken: randomUUID(),
    pid: process.pid,
    host: hostname(),
    processStartFingerprint: `${process.pid}:${processStartedAt}`,
  },
  now: new Date().toISOString(),
});

process.stdout.write(`${JSON.stringify({
  ...result,
  semanticSha256: epoch.semanticSha256,
  safetyFloorSha256: epoch.safetyFloor.semanticSha256,
  summary: epoch.summary,
}, null, 2)}\n`);
