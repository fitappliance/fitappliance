#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { architectureV2Paths } from '../../src/domain/architecture-v2-paths.mjs';
import {
  assertDraftAuditMatchesLedger,
  fingerprintPrivateOutreachDraft,
  resolvePrivateOutreachRoot,
  validatePrivateOutreachDraft,
} from '../../src/domain/outreach-evidence-store.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const storageRootIndex = process.argv.indexOf('--storage-root');
const storageRoot = storageRootIndex >= 0 ? process.argv[storageRootIndex + 1] : process.env.FITAPPLIANCE_STORAGE_ROOT;
if (!storageRoot) throw new TypeError('FITAPPLIANCE_STORAGE_ROOT or --storage-root is required');

const matrix = JSON.parse(await readFile(join(root, architectureV2Paths.brandDataContactMatrix), 'utf8'));
const outreachRoot = resolvePrivateOutreachRoot(storageRoot);
const results = [];

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

for (const organization of matrix.organizations.filter(({ state }) => state === 'route_verified')) {
  const draftPath = join(outreachRoot, 'drafts', `${organization.id}.json`);
  const source = await readFile(draftPath, 'utf8');
  const draft = JSON.parse(source);
  validatePrivateOutreachDraft(draft, {
    id: organization.id,
    coveredBrands: organization.coveredBrands,
    publicRouteSourceUrl: organization.route.publicSourceUrl,
  });
  results.push({
    id: organization.id,
    organization: organization.organization,
    coveredBrands: organization.coveredBrands,
    publicRouteSourceUrl: organization.route.publicSourceUrl,
    draftedOn: draft.createdOn,
    ...fingerprintPrivateOutreachDraft(draft),
    draftFileSha256: sha256(source),
    draftFileByteSize: Buffer.byteLength(source, 'utf8'),
  });
}

const ledger = JSON.parse(await readFile(join(root, architectureV2Paths.brandDataOutreachLedger), 'utf8'));
assertDraftAuditMatchesLedger(results, ledger);

process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  auditedOn: matrix.researchedOn,
  draftCount: results.length,
  drafts: results,
}, null, 2)}\n`);
