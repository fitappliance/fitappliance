import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  HISTORICAL_REFERENCE_PUBLIC_FILES,
  buildHistoricalReferencePublication,
  serializeHistoricalReferenceDocument,
} from '../../src/domain/historical-reference-publication.mjs';

function record(overrides = {}) {
  return {
    schemaVersion: 1,
    referenceId: 'fa_ref_1234567890abcdef12345678',
    category: 'fridge',
    brand: 'Example',
    model: 'MODEL-1',
    brandKey: 'EXAMPLE',
    modelKey: 'MODEL1',
    rawIdentityVariants: [{ brand: 'Example', model: 'MODEL-1' }],
    lifecycleState: 'REGISTRY_ONLY',
    evidenceState: 'REGISTRY_CONSISTENT',
    lookupAction: 'CONFIRM_REQUIRED',
    dimensionsMm: { width: 600, height: 1700, depth: 650 },
    sources: [{ sourceId: 'energy-rating:fridge', snapshotSha256: 'a'.repeat(64), sourceLines: [2] }],
    registryObservationCount: 1,
    registryMarketState: 'INACTIVE_AU',
    registryDimensionState: 'CONSISTENT',
    reasonCodes: [],
    ...overrides,
  };
}

const attribution = {
  sourceName: 'Australian Government Energy Rating',
  sourceUrl: 'https://www.energyrating.gov.au/',
  licenceId: 'CC-BY-3.0-AU',
  licenceName: 'Creative Commons Attribution 3.0 Australia',
  licenceUrl: 'https://creativecommons.org/licenses/by/3.0/au/',
  attribution: 'Australian Government Energy Rating',
};

test('historical publication is category split, deterministic, minimal and conflict-safe', () => {
  const input = {
    schemaVersion: 1,
    generatedAt: '2026-07-12T12:40:00.000Z',
    records: [
      record(),
      record({
        referenceId: 'fa_ref_2234567890abcdef12345678',
        model: 'MODEL-2',
        modelKey: 'MODEL2',
        rawIdentityVariants: [
          { brand: 'Example', model: 'MODEL-2' },
          { brand: 'Example Appliances', model: 'MODEL 2' },
        ],
        evidenceState: 'INTERNAL_CONFLICT',
        lookupAction: 'QUARANTINED',
        dimensionsMm: null,
        registryDimensionState: 'INTERNAL_CONFLICT',
        reasonCodes: ['REGISTRY_INTERNAL_DIMENSION_CONFLICT'],
      }),
      record({
        referenceId: 'fa_ref_3234567890abcdef12345678',
        category: 'dishwasher',
        model: 'DW-1',
        modelKey: 'DW1',
        rawIdentityVariants: [{ brand: 'Example', model: 'DW-1' }],
        lifecycleState: 'CURRENT_RETAIL',
        evidenceState: 'CATALOG_RECEIPT',
        lookupAction: 'AUTO_FILL',
        dimensionsMm: { width: 598, height: 850, depth: 600 },
        registryMarketState: 'ACTIVE_AU',
      }),
    ],
  };

  const first = buildHistoricalReferencePublication(input, { attribution });
  const second = buildHistoricalReferencePublication({ ...input, records: [...input.records].reverse() }, { attribution });
  assert.deepEqual(first, second);
  assert.deepEqual(HISTORICAL_REFERENCE_PUBLIC_FILES, {
    fridge: 'fridges.json',
    dishwasher: 'dishwashers.json',
    dryer: 'dryers.json',
    washing_machine: 'washing-machines.json',
  });
  assert.deepEqual(Object.keys(first.documents), ['fridge', 'dishwasher', 'dryer', 'washing_machine']);
  assert.equal(first.documents.fridge.records.length, 2);
  assert.equal(first.documents.dryer.records.length, 0);

  const quarantined = first.documents.fridge.records.find((row) => row.action === 'QUARANTINED');
  assert.equal('dimensionsMm' in quarantined, false);
  assert.deepEqual(quarantined.aliases, [{ brand: 'Example Appliances', model: 'MODEL 2' }]);
  const accepted = first.documents.dishwasher.records[0];
  assert.deepEqual(accepted.dimensionsMm, { width: 598, height: 850, depth: 600 });

  const serialized = serializeHistoricalReferenceDocument(first.documents.fridge);
  assert.equal(first.manifest.files.fridge.contentSha256, createHash('sha256').update(serialized).digest('hex'));
  assert.equal(first.manifest.files.fridge.byteLength, Buffer.byteLength(serialized));
  assert.equal(first.meta.files.fridge.url, '/data/replacement-reference/fridges.json');

  const publicJson = JSON.stringify({ documents: first.documents, meta: first.meta });
  assert.doesNotMatch(publicJson, /retailer|price|affiliate|fitDecision|fitScore|requiredCavity|clearance|canonicalProductId/i);
  assert.doesNotMatch(publicJson, /snapshotSha256|sourceLines|reasonCodes/i);
});

test('Vercel keeps all replacement reference JSON out of search indexes', async () => {
  const vercel = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url), 'utf8'));
  const dataHeaders = vercel.headers.find((entry) => entry.source === '/data/:path*');
  assert.ok(dataHeaders);
  assert.ok(dataHeaders.headers.some((header) => (
    header.key.toLowerCase() === 'x-robots-tag' && header.value.toLowerCase() === 'noindex'
  )));
});
