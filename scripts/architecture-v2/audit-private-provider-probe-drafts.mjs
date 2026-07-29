#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { architectureV2Paths } from '../../src/domain/architecture-v2-paths.mjs';
import { resolvePrivateOutreachRoot } from '../../src/domain/outreach-evidence-store.mjs';
import {
  assertProviderProbeDraftAuditMatchesLedger,
  fingerprintPrivateProviderProbeDraft,
  validatePrivateProviderProbeDraft,
} from '../../src/domain/provider-probe-program.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const storageRootIndex = process.argv.indexOf('--storage-root');
const storageRoot = storageRootIndex >= 0 ? process.argv[storageRootIndex + 1] : process.env.FITAPPLIANCE_STORAGE_ROOT;
if (!storageRoot) throw new TypeError('FITAPPLIANCE_STORAGE_ROOT or --storage-root is required');

const ledger = JSON.parse(await readFile(join(root, architectureV2Paths.productDataProviderProbeLedger), 'utf8'));
const draftRoot = join(resolvePrivateOutreachRoot(storageRoot), 'provider-probes', 'drafts');
const results = [];

for (const provider of ledger.providers.filter(({ state }) => state === 'draft_ready')) {
  const source = await readFile(join(draftRoot, `${provider.id}.json`), 'utf8');
  const draft = JSON.parse(source);
  validatePrivateProviderProbeDraft(draft, {
    id: provider.id,
    publicRouteSourceUrl: provider.publicRouteSourceUrl,
  });
  results.push({
    id: provider.id,
    ...fingerprintPrivateProviderProbeDraft(draft),
    draftFileSha256: createHash('sha256').update(source).digest('hex'),
    draftFileByteSize: Buffer.byteLength(source, 'utf8'),
  });
}

assertProviderProbeDraftAuditMatchesLedger(results, ledger);
process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  auditedOn: ledger.reviewedOn,
  draftCount: results.length,
  drafts: results,
}, null, 2)}\n`);
