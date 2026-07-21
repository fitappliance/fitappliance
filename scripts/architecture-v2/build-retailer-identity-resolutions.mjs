#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { normalizeEnergyRatingRows, registryModelKey } from '../../src/domain/energy-rating-registry.mjs';
import { verifyEvidenceStorageRoot } from '../../src/domain/evidence-recovery-state-store.mjs';
import { loadOfficialIdentityEvidence } from '../../src/domain/official-identity-evidence.mjs';
import { parseRegistryCsv, verifyRegistrySnapshot } from '../../src/domain/official-registry-snapshot.mjs';
import { retailerRawObjectPath } from '../../src/domain/retail-lifecycle-refresh-execution.mjs';
import { buildRetailerIdentityResolution } from '../../src/domain/retailer-identity-resolution.mjs';
import brandCanon from '../brand-canon.js';

const require = createRequire(import.meta.url);
const { parsePartnerizeFeedCsv } = require('../affiliate/partnerize-tgg.js');
const execFile = promisify(execFileCallback);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ENERGY_CATEGORIES = Object.freeze(['fridge', 'dishwasher', 'dryer', 'washing_machine']);
const AO_ADAPTER_ID = 'appliances-online-product-api-v1';
const TGG_ADAPTER_ID = 'the-good-guys-partnerize-feed-v1';
const AO_ORIGIN = 'https://www.appliancesonline.com.au';

function required(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizeUrl(value, base = undefined) {
  return new URL(required(value, 'retailer URL'), base).toString();
}

function sameProductUrl(left, right) {
  const first = new URL(left);
  const second = new URL(right);
  const normalizedPath = (url) => url.pathname.replace(/\/+$/, '') || '/';
  return first.protocol === second.protocol
    && first.hostname.toLowerCase() === second.hostname.toLowerCase()
    && normalizedPath(first) === normalizedPath(second);
}

function availabilityFromBoolean(value) {
  if (value === true) return { availability: 'available', listingState: 'current' };
  if (value === false) return { availability: 'unavailable', listingState: 'unavailable' };
  return { availability: 'unknown', listingState: 'current' };
}

function availabilityFromStock(value) {
  const stock = String(value ?? '').trim().toLowerCase();
  if (['yes', 'in stock', 'instock', 'true', '1'].includes(stock)) {
    return { availability: 'available', listingState: 'current' };
  }
  if (['no', 'out of stock', 'outofstock', 'false', '0'].includes(stock)) {
    return { availability: 'unavailable', listingState: 'unavailable' };
  }
  return { availability: 'unknown', listingState: 'current' };
}

function adapterIdForMismatch(source) {
  if (source.reasonCode === 'AO_MODEL_MISMATCH' && source.retailer === 'Appliances Online') {
    return AO_ADAPTER_ID;
  }
  if (source.reasonCode === 'PARTNERIZE_RETAILER_PRODUCT_IDENTITY_MISMATCH'
    && source.retailer === 'The Good Guys') {
    return TGG_ADAPTER_ID;
  }
  throw new TypeError(`unsupported retailer identity mismatch source: ${source.reasonCode}`);
}

function findBoundAttempt(attempts, source, adapterId) {
  const matches = attempts.filter((attempt) => (
    attempt.adapterId === adapterId
    && attempt.rawPayloadSha256 === source.rawSourceSha256
    && (attempt.failureContext?.baselineLinkId === source.baselineLinkId
      || attempt.listingReconciliations?.some((row) => row.baselineLinkId === source.baselineLinkId))
  ));
  if (matches.length !== 1) {
    throw new Error(`expected one raw-bound collection attempt for ${source.baselineLinkId}, received ${matches.length}`);
  }
  return matches[0];
}

function aoListingFact(source, bytes) {
  let payload;
  try {
    payload = JSON.parse(bytes);
  } catch {
    throw new Error(`AO raw object JSON invalid for ${source.baselineLinkId}`);
  }
  const product = payload?.product ?? payload;
  const receivedModel = required(product?.sku, 'AO received model');
  const receivedUrl = normalizeUrl(product?.uri, AO_ORIGIN);
  if (registryModelKey(receivedModel) !== registryModelKey(source.receivedModel)
    || !sameProductUrl(receivedUrl, source.url)) {
    throw new Error(`AO raw object identity mismatch for ${source.baselineLinkId}`);
  }
  const image = product?.image?.url ?? product?.imageUrl ?? null;
  return {
    receivedModel,
    receivedUrl: normalizeUrl(source.url),
    ...availabilityFromBoolean(product.available),
    priceAud: Number.isFinite(Number(product.price)) && Number(product.price) >= 0
      ? Number(product.price)
      : null,
    title: String(product.title ?? '').trim() || null,
    imageUrl: image ? normalizeUrl(image, AO_ORIGIN) : null,
    retailerProductId: product.productId == null ? null : required(product.productId, 'AO product ID'),
  };
}

function tggListingFact(source, bytes) {
  const rows = parsePartnerizeFeedCsv(bytes.toString('utf8'), { requireInStock: false }).filter((row) => (
    registryModelKey(row.manufacturer_model) === registryModelKey(source.receivedModel)
    && sameProductUrl(row.url, source.url)
  ));
  if (rows.length !== 1) {
    throw new Error(`expected one Partnerize row for ${source.baselineLinkId}, received ${rows.length}`);
  }
  const [row] = rows;
  return {
    receivedModel: row.manufacturer_model,
    receivedUrl: normalizeUrl(source.url),
    ...availabilityFromStock(row.stock),
    priceAud: row.p,
    title: row.title || null,
    imageUrl: null,
    retailerProductId: String(row.tgg_sku || row.manufacturer_model).trim() || null,
  };
}

export async function reconstructRetailerListingFacts({
  resolutionItems,
  retailerLedger,
  sourcePolicy,
  readRawObject,
}) {
  if (!Array.isArray(resolutionItems) || !Array.isArray(retailerLedger?.collectionAttempts)
    || !Array.isArray(sourcePolicy?.sources) || typeof readRawObject !== 'function') {
    throw new TypeError('resolution items, retailer ledger, source policy, and raw object reader required');
  }
  const policyById = new Map(sourcePolicy.sources.map((source) => [required(source.id, 'source policy ID'), source]));
  const mismatchSources = resolutionItems.flatMap((item) => (
    item.resolutionTasks?.flatMap((task) => task.quarantinedSources ?? []) ?? []
  ));
  const baselineIds = mismatchSources.map((source) => required(source.baselineLinkId, 'baseline link ID'));
  if (new Set(baselineIds).size !== baselineIds.length) throw new TypeError('duplicate mismatch baseline link');
  const facts = [];
  for (const source of mismatchSources) {
    const adapterId = adapterIdForMismatch(source);
    const policy = policyById.get(adapterId);
    if (!policy || policy.retailer !== source.retailer) {
      throw new Error(`retailer source policy missing for ${source.baselineLinkId}`);
    }
    const attempt = findBoundAttempt(retailerLedger.collectionAttempts, source, adapterId);
    if (attempt.retailer !== source.retailer
      || attempt.rawSourceReference !== `retailer-object:sha256:${source.rawSourceSha256}`) {
      throw new Error(`collection attempt binding mismatch for ${source.baselineLinkId}`);
    }
    const bytes = await readRawObject(source.rawSourceSha256, adapterId);
    if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
      throw new TypeError(`raw object bytes missing for ${source.baselineLinkId}`);
    }
    const buffer = Buffer.from(bytes);
    if (sha256(buffer) !== source.rawSourceSha256) {
      throw new Error(`raw object hash mismatch for ${source.baselineLinkId}`);
    }
    const rawFact = adapterId === AO_ADAPTER_ID
      ? aoListingFact(source, buffer)
      : tggListingFact(source, buffer);
    facts.push({
      baselineLinkId: source.baselineLinkId,
      adapterId,
      retailer: source.retailer,
      sourceType: required(policy.sourceType, 'retailer source type'),
      policyVersion: required(attempt.policyVersion, 'collection attempt policy version'),
      expectedCadenceHours: Number(policy.expectedCadenceHours),
      maximumCurrentAgeHours: Number(policy.maximumCurrentAgeHours),
      observedAt: new Date(required(attempt.observedAt, 'collection attempt observedAt')).toISOString(),
      rawSourceReference: attempt.rawSourceReference,
      rawSourceSha256: source.rawSourceSha256,
      ...rawFact,
    });
  }
  return facts.sort((left, right) => left.baselineLinkId.localeCompare(right.baselineLinkId));
}

function storagePath(storageRoot, relativePath) {
  const root = resolve(required(storageRoot, 'storage root'));
  const path = resolve(root, ...required(relativePath, 'storage object path').split('/').filter(Boolean));
  if (!path.startsWith(`${root}${sep}`)) throw new TypeError('storage object path escapes storage root');
  return path;
}

export async function loadOfficialRegistryObservations({ snapshotsDocument, storageRoot, read = readFile }) {
  if (!Array.isArray(snapshotsDocument?.snapshots)) throw new TypeError('official registry snapshots required');
  const snapshots = new Map(snapshotsDocument.snapshots.map((snapshot) => [snapshot.manifest?.sourceId, snapshot]));
  const observations = [];
  for (const category of ENERGY_CATEGORIES) {
    const sourceId = `energy-rating:${category}`;
    const snapshot = snapshots.get(sourceId);
    if (!snapshot || snapshot.category !== category) throw new Error(`missing registry snapshot ${sourceId}`);
    const bytes = await read(storagePath(storageRoot, snapshot.manifest.storage?.objectPath));
    verifyRegistrySnapshot(snapshot.manifest, bytes);
    observations.push(...normalizeEnergyRatingRows(parseRegistryCsv(bytes), {
      category,
      sourceId,
      snapshotSha256: snapshot.manifest.contentSha256,
      canonicalizeBrand: brandCanon.canonicalizeBrand,
    }));
  }
  return observations;
}

async function mountedVolumeUuid(path) {
  const { stdout: dfOutput } = await execFile('df', ['-P', path], { timeout: 10_000 });
  const device = dfOutput.trim().split('\n').at(-1)?.trim().split(/\s+/)[0];
  if (!device) throw new Error('df did not report the identity resolution storage device');
  const { stdout } = await execFile('diskutil', ['info', device], { timeout: 10_000 });
  const value = /^\s*Volume UUID:\s*(\S+)\s*$/im.exec(stdout)?.[1];
  if (!value) throw new Error('diskutil did not report the identity resolution volume UUID');
  return value;
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

function maximumTimestamp(values) {
  const times = values.map((value) => new Date(required(value, 'source timestamp')).valueOf());
  if (times.some(Number.isNaN)) throw new TypeError('source timestamp invalid');
  return new Date(Math.max(...times)).toISOString();
}

export async function buildFromRepository({
  root = repoRoot,
  storageRoot,
  read = readFile,
  refreshInventoryInput = resolveArchitectureV2Path(root, 'retailLifecycleRefreshInventory'),
  publicProjectionInput = resolveArchitectureV2Path(root, 'publicProjection'),
  registrySnapshotsInput = resolveArchitectureV2Path(root, 'officialRegistrySnapshots'),
  retailerLedgerInput = resolveArchitectureV2Path(root, 'retailerObservations'),
  sourcePolicyInput = resolveArchitectureV2Path(root, 'retailerSourcePolicy'),
  officialEvidenceInput = resolveArchitectureV2Path(root, 'retailerIdentityOfficialEvidence'),
}) {
  const [
    refreshInventory,
    publicProjection,
    snapshotsDocument,
    retailerLedger,
    sourcePolicy,
    officialIdentityManifest,
  ] = await Promise.all([
    read(refreshInventoryInput, 'utf8').then(JSON.parse),
    read(publicProjectionInput, 'utf8').then(JSON.parse),
    read(registrySnapshotsInput, 'utf8').then(JSON.parse),
    read(retailerLedgerInput, 'utf8').then(JSON.parse),
    read(sourcePolicyInput, 'utf8').then(JSON.parse),
    read(officialEvidenceInput, 'utf8').then(JSON.parse),
  ]);
  const registryObservations = await loadOfficialRegistryObservations({
    snapshotsDocument,
    storageRoot,
    read,
  });
  const listingFacts = await reconstructRetailerListingFacts({
    resolutionItems: refreshInventory.items,
    retailerLedger,
    sourcePolicy,
    readRawObject: async (hash, adapterId) => read(storagePath(
      storageRoot,
      retailerRawObjectPath(hash, adapterId === AO_ADAPTER_ID ? 'json' : 'csv'),
    )),
  });
  const officialIdentityEvidence = await loadOfficialIdentityEvidence({
    manifest: officialIdentityManifest,
    readObject: (relativePath) => read(storagePath(storageRoot, relativePath)),
  });
  const generatedAt = maximumTimestamp([
    refreshInventory.asOf,
    snapshotsDocument.acquiredAt,
    officialIdentityManifest.acquiredAt,
    ...listingFacts.map((fact) => fact.observedAt),
  ]);
  return buildRetailerIdentityResolution({
    refreshInventory,
    publicProjection,
    registryObservations,
    officialIdentityEvidence,
    officialIdentityEvidenceManifestSemanticSha256: officialIdentityManifest.semanticSha256,
    listingFacts,
    generatedAt,
  });
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new TypeError(`${name} requires a value`);
  return value;
}

export async function runCli(args = process.argv.slice(2), environment = process.env) {
  const supported = new Set([
    '--storage-root',
    '--refresh-inventory',
    '--public-projection',
    '--registry-snapshots',
    '--retailer-ledger',
    '--source-policy',
    '--official-evidence',
    '--output',
  ]);
  for (let index = 0; index < args.length; index += 2) {
    if (!supported.has(args[index])) throw new TypeError(`unknown argument: ${args[index]}`);
  }
  const storageRoot = resolve(required(
    option(args, '--storage-root') ?? environment.FITAPPLIANCE_STORAGE_ROOT,
    '--storage-root or FITAPPLIANCE_STORAGE_ROOT',
  ));
  await verifyEvidenceStorageRoot(storageRoot, { getVolumeUuid: mountedVolumeUuid });
  const artifact = await buildFromRepository({
    storageRoot,
    refreshInventoryInput: resolve(option(args, '--refresh-inventory')
      ?? resolveArchitectureV2Path(repoRoot, 'retailLifecycleRefreshInventory')),
    publicProjectionInput: resolve(option(args, '--public-projection')
      ?? resolveArchitectureV2Path(repoRoot, 'publicProjection')),
    registrySnapshotsInput: resolve(option(args, '--registry-snapshots')
      ?? resolveArchitectureV2Path(repoRoot, 'officialRegistrySnapshots')),
    retailerLedgerInput: resolve(option(args, '--retailer-ledger')
      ?? resolveArchitectureV2Path(repoRoot, 'retailerObservations')),
    sourcePolicyInput: resolve(option(args, '--source-policy')
      ?? resolveArchitectureV2Path(repoRoot, 'retailerSourcePolicy')),
    officialEvidenceInput: resolve(option(args, '--official-evidence')
      ?? resolveArchitectureV2Path(repoRoot, 'retailerIdentityOfficialEvidence')),
  });
  const output = resolve(option(args, '--output')
    ?? resolveArchitectureV2Path(repoRoot, 'retailerIdentityResolutions'));
  await atomicJson(output, artifact);
  process.stdout.write(`${JSON.stringify({ output, ...artifact.summary }, null, 2)}\n`);
  return artifact;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli();
}
