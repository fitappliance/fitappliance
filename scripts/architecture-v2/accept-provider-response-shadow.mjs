#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, isAbsolute, resolve, sep } from 'node:path';

import { resolvePrivateOutreachRoot } from '../../src/domain/outreach-evidence-store.mjs';
import {
  buildProviderShadowAcceptance,
  persistProviderShadowAcceptance,
} from '../../src/domain/provider-response-shadow-acceptance.mjs';

function parseArgs(argv) {
  const options = { storageRoot: process.env.FITAPPLIANCE_STORAGE_ROOT ?? null };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new TypeError(`missing value for ${name}`);
    index += 1;
    if (name === '--receipt') options.receipt = value;
    else if (name === '--storage-root') options.storageRoot = value;
    else if (name === '--accepted-at') options.acceptedAt = value;
    else throw new TypeError(`unknown argument: ${name}`);
  }
  if (!options.receipt || !options.storageRoot || !options.acceptedAt) {
    throw new TypeError('--receipt, --storage-root, and --accepted-at are required');
  }
  return options;
}

function contained(root, relativePath, label) {
  if (typeof relativePath !== 'string' || !relativePath || isAbsolute(relativePath)) {
    throw new TypeError(`${label} must be a relative private-store path`);
  }
  const path = resolve(root, relativePath);
  if (!path.startsWith(`${root}${sep}`)) throw new TypeError(`${label} escaped the private store`);
  return path;
}

const options = parseArgs(process.argv.slice(2));
const outreachRoot = resolvePrivateOutreachRoot(resolve(options.storageRoot));
const receiptPath = resolve(options.receipt);
if (!receiptPath.startsWith(`${outreachRoot}${sep}`)) throw new TypeError('receipt must be inside the private outreach store');
const quarantineReceiptBytes = await readFile(receiptPath);
const quarantineReceiptSha256 = createHash('sha256').update(quarantineReceiptBytes).digest('hex');
if (basename(receiptPath) !== `${quarantineReceiptSha256}.json`) {
  throw new Error('receipt filename does not match its content hash');
}
const receipt = JSON.parse(quarantineReceiptBytes);
const sourceBytes = await readFile(contained(outreachRoot, receipt?.storage?.sourceObjectPath, 'source object'));
const rightsEvidence = await Promise.all((receipt?.rightsEvidenceSha256 ?? []).map(async (hash, index) => ({
  contentSha256: hash,
  bytes: await readFile(contained(outreachRoot, receipt?.storage?.rightsObjectPaths?.[index], 'rights object')),
})));
const result = buildProviderShadowAcceptance({
  quarantineReceiptBytes,
  quarantineReceiptSha256,
  sourceBytes,
  rightsEvidence,
  acceptedAt: options.acceptedAt,
});
const persisted = await persistProviderShadowAcceptance(resolve(options.storageRoot), result);
process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  status: result.status,
  quarantineReceiptSha256,
  shadowAcceptanceId: result.shadowAcceptance.shadowAcceptanceId,
  shadowAcceptanceSha256: persisted.shadowAcceptanceSha256,
  counts: { fieldReceipts: result.fieldReceipts.length },
  publicationEligible: false,
  fitEligible: false,
}, null, 2)}\n`);
