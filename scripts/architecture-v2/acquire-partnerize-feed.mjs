#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import * as defaultFs from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import {
  createEvidenceObjectStore,
  verifyEvidenceStorageRoot,
} from '../../src/domain/evidence-recovery-state-store.mjs';
import {
  acquireAuthorizedRetailerSource,
  validateRetailerSourceAcquisitionReceipt,
} from '../../src/domain/retailer-source-acquisition-receipt.mjs';
import { retailerRawObjectPath } from '../../src/domain/retail-lifecycle-refresh-execution.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_SOURCE_POLICY_ID = 'the-good-guys-partnerize-feed-v1';
const execFile = promisify(execFileCallback);

function required(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function mountedVolumeUuid(path) {
  const { stdout: dfOutput } = await execFile('df', ['-P', path], { timeout: 10_000 });
  const device = dfOutput.trim().split('\n').at(-1)?.trim().split(/\s+/)[0];
  if (!device) throw new Error('df did not report the Partnerize acquisition storage device');
  const { stdout } = await execFile('diskutil', ['info', device], { timeout: 10_000 });
  const value = /^\s*Volume UUID:\s*(\S+)\s*$/im.exec(stdout)?.[1];
  if (!value) throw new Error('diskutil did not report the Partnerize acquisition volume UUID');
  return value;
}

async function writeImmutable(fs, path, bytes) {
  await fs.mkdir(dirname(path), { recursive: true });
  try {
    const handle = await fs.open(path, 'wx');
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const existing = await fs.readFile(path);
    if (!Buffer.from(existing).equals(Buffer.from(bytes))) {
      throw new Error(`immutable acquisition artifact conflict: ${path}`);
    }
  }
}

export async function acquirePartnerizeFeedToStorage(options = {}, dependencies = {}) {
  const fs = dependencies.fs ?? defaultFs;
  const root = resolve(options.root ?? defaultRoot);
  const storageRoot = resolve(required(options.storageRoot, 'Partnerize acquisition storage root'));
  const url = required(options.url ?? process.env.PARTNERIZE_TGG_FEED_URL, 'Partnerize feed URL');
  const sourcePolicyId = options.sourcePolicyId ?? DEFAULT_SOURCE_POLICY_ID;
  const policyPath = resolveArchitectureV2Path(root, 'retailerSourcePolicy');
  const policyBytes = await fs.readFile(policyPath);
  const policy = JSON.parse(policyBytes);
  const source = policy.sources?.find((candidate) => candidate.id === sourcePolicyId);
  if (!source || source.sourceType !== 'affiliate_feed'
    || source.collectionMode !== 'partnerize_feed_only'
    || source.termsReviewState !== 'authorized_partner_feed') {
    throw new Error(`source policy is not an authorised partner feed: ${sourcePolicyId}`);
  }
  if (!Array.isArray(source.acquisitionHosts) || source.acquisitionHosts.length === 0) {
    throw new Error(`authorised partner feed lacks acquisition hosts: ${sourcePolicyId}`);
  }
  const storageIdentity = dependencies.storageIdentity ?? await verifyEvidenceStorageRoot(storageRoot, {
    fs,
    getVolumeUuid: dependencies.getVolumeUuid ?? mountedVolumeUuid,
  });
  const result = await acquireAuthorizedRetailerSource({
    url,
    sourcePolicyId,
    sourcePolicySha256: sha256(policyBytes),
    acquisitionHosts: source.acquisitionHosts,
    fetchImpl: dependencies.fetchImpl,
    now: dependencies.now,
    timeoutMs: options.timeoutMs ?? 120_000,
    maximumBytes: options.maximumBytes ?? 64 * 1024 * 1024,
    maximumRedirects: options.maximumRedirects ?? 5,
  });
  const receipt = validateRetailerSourceAcquisitionReceipt(result.receipt, {
    sourcePolicyId,
    sourcePolicySha256: sha256(policyBytes),
    acquisitionHosts: source.acquisitionHosts,
    rawPayloadSha256: sha256(result.bytes),
    byteSize: result.bytes.length,
  });
  const objectPath = retailerRawObjectPath(receipt.payload.sha256, 'csv');
  const objectStore = dependencies.objectStore ?? createEvidenceObjectStore(storageIdentity.root, { fs });
  await objectStore.writeObject(objectPath, result.bytes);
  const receiptPath = join(
    storageIdentity.root,
    'runs',
    'retailer-source-acquisition',
    receipt.acquisitionId,
    'receipt.json',
  );
  await writeImmutable(fs, receiptPath, Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`));
  return {
    acquisitionId: receipt.acquisitionId,
    receivedAt: receipt.receivedAt,
    rawPayloadSha256: receipt.payload.sha256,
    byteSize: receipt.payload.byteSize,
    feedPath: join(storageIdentity.root, ...objectPath.split('/')),
    receiptPath,
  };
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new TypeError(`${name} requires a value`);
  return value;
}

export function parseArgs(args) {
  const supported = new Set(['--root', '--storage-root', '--source-policy-id']);
  for (let index = 0; index < args.length; index += 2) {
    if (!supported.has(args[index])) throw new TypeError(`unknown argument: ${args[index]}`);
  }
  return {
    root: option(args, '--root') ?? defaultRoot,
    storageRoot: option(args, '--storage-root') ?? process.env.FITAPPLIANCE_STORAGE_ROOT,
    sourcePolicyId: option(args, '--source-policy-id') ?? DEFAULT_SOURCE_POLICY_ID,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  acquirePartnerizeFeedToStorage(parseArgs(process.argv.slice(2)))
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.stack ?? error}\n`);
      process.exitCode = 1;
    });
}
