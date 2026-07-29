#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { architectureV2Paths } from '../../src/domain/architecture-v2-paths.mjs';
import {
  buildBrandDataProgramStatus,
  evaluateDay14Decision,
  hasComparablePdfMetrics,
} from '../../src/domain/brand-data-program-status.mjs';
import { buildProviderProbeStatus } from '../../src/domain/provider-probe-program.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
};
const asOf = valueAfter('--as-of');
if (!asOf) throw new TypeError('--as-of YYYY-MM-DD is required');

const [queueBytes, matrixBytes, ledgerBytes, probeBytes, pdfBytes] = await Promise.all([
  readFile(join(root, architectureV2Paths.brandDataOutreachQueue)),
  readFile(join(root, architectureV2Paths.brandDataContactMatrix)),
  readFile(join(root, architectureV2Paths.brandDataOutreachLedger)),
  readFile(join(root, architectureV2Paths.productDataProviderProbeLedger)),
  readFile(join(root, architectureV2Paths.pdfFailureBaselineWp8Replay)),
]);
const brandProgram = buildBrandDataProgramStatus({
  queue: JSON.parse(queueBytes),
  matrix: JSON.parse(matrixBytes),
  ledger: JSON.parse(ledgerBytes),
  frozenQueueSha256: createHash('sha256').update(queueBytes).digest('hex'),
  asOf,
});
const providerProbes = buildProviderProbeStatus({ ledger: JSON.parse(probeBytes), asOf });
const pdfReplay = JSON.parse(pdfBytes);
const day14Decision = evaluateDay14Decision({
  asOf,
  gateOn: '2026-08-10',
  providerComparable: providerProbes.comparisonReadyProviders.length > 0,
  pdfComparable: hasComparablePdfMetrics(pdfReplay),
});

const requestedThreadId = valueAfter('--authorize-follow-up');
let followUpAuthorization = null;
if (requestedThreadId) {
  const thread = brandProgram.followUps.find(({ id }) => id === requestedThreadId);
  if (!thread) throw new TypeError(`unknown sent outreach thread: ${requestedThreadId}`);
  followUpAuthorization = Object.freeze({
    threadId: requestedThreadId,
    action: thread.action,
    authorized: thread.action === 'FIRST_FOLLOW_UP_DUE' || thread.action === 'FINAL_FOLLOW_UP_DUE',
  });
}

process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  asOf,
  brandProgram,
  providerProbes,
  day14Decision,
  followUpAuthorization,
}, null, 2)}\n`);
if (followUpAuthorization && !followUpAuthorization.authorized) process.exitCode = 2;
