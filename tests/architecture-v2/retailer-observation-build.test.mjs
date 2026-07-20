import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  buildRetailerObservationCoverageFromRepository,
} from '../../scripts/architecture-v2/build-retailer-observation-coverage.mjs';
import {
  buildRetailerObservationLedgerFromRepository,
} from '../../scripts/architecture-v2/build-retailer-ledger.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

test('retailer ledger and coverage builders replay byte-for-byte without network access', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fitappliance-retailer-build-'));
  const ledgerPath = join(directory, 'retailer-observations.json');
  const coveragePath = join(directory, 'retailer-observation-coverage.json');
  try {
    const firstLedger = await buildRetailerObservationLedgerFromRepository({ root, output: ledgerPath });
    const firstLedgerBytes = await readFile(ledgerPath);
    const secondLedger = await buildRetailerObservationLedgerFromRepository({ root, output: ledgerPath });
    const secondLedgerBytes = await readFile(ledgerPath);
    assert.deepEqual(secondLedger, firstLedger);
    assert.equal(hash(secondLedgerBytes), hash(firstLedgerBytes));

    const firstCoverage = await buildRetailerObservationCoverageFromRepository({
      root,
      output: coveragePath,
      ledgerInput: ledgerPath,
    });
    const firstCoverageBytes = await readFile(coveragePath);
    const secondCoverage = await buildRetailerObservationCoverageFromRepository({
      root,
      output: coveragePath,
      ledgerInput: ledgerPath,
    });
    const secondCoverageBytes = await readFile(coveragePath);
    assert.deepEqual(secondCoverage, firstCoverage);
    assert.equal(hash(secondCoverageBytes), hash(firstCoverageBytes));
    assert.equal(firstCoverage.summary.accountedLinks, firstCoverage.summary.baselineLinks);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
