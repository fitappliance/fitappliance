import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  fetchRegistryBytes,
  persistRegistrySnapshot,
  selectEnergyRatingResources,
  validateRegistryCsvPayload,
} from '../../src/domain/official-registry-acquisition.mjs';
import { createRegistrySnapshotManifest } from '../../src/domain/official-registry-snapshot.mjs';

const LICENCE = {
  id: 'cc-by-3.0-au',
  name: 'Creative Commons Attribution 3.0 Australia',
  url: 'https://creativecommons.org/licenses/by/3.0/au/',
  attribution: 'DCCEEW',
  permitsRepositoryDerivatives: true,
};

test('Energy Rating resource selection uses exact category and newest modified CSV', () => {
  const resources = selectEnergyRatingResources({ result: { resources: [
    { name: 'Fridges and Freezers - rf_2026_07_11.csv', format: 'CSV', last_modified: '2026-07-11T00:00:00Z', url: 'https://data.gov.au/old-rf.csv' },
    { name: 'Fridges and Freezers - rf_2026_07_12.csv', format: 'CSV', last_modified: '2026-07-12T00:00:00Z', url: 'https://data.gov.au/new-rf.csv' },
    { name: 'Dishwashers - dw_2026_07_12.csv', format: 'CSV', last_modified: '2026-07-12T00:00:00Z', url: 'https://data.gov.au/dw.csv' },
  ] } }, ['fridge', 'dishwasher']);

  assert.equal(resources.fridge.url, 'https://data.gov.au/new-rf.csv');
  assert.equal(resources.dishwasher.url, 'https://data.gov.au/dw.csv');
});

test('registry fetch rejects cross-host redirect and oversized payload', async () => {
  const response = (url, body, headers = {}) => ({
    ok: true,
    status: 200,
    url,
    headers: new Headers(headers),
    arrayBuffer: async () => Buffer.from(body),
  });
  await assert.rejects(
    () => fetchRegistryBytes({
      url: 'https://data.gov.au/source.csv',
      allowedHosts: ['data.gov.au'],
      fetchFn: async () => response('https://evil.example/source.csv', 'a,b\n1,2\n'),
    }),
    /redirect|host/i,
  );
  await assert.rejects(
    () => fetchRegistryBytes({
      url: 'https://data.gov.au/source.csv',
      allowedHosts: ['data.gov.au'],
      maxBytes: 4,
      fetchFn: async () => response('https://data.gov.au/source.csv', 'a,b\n1,2\n', { 'content-length': '8' }),
    }),
    /size|large|bytes/i,
  );
});

test('snapshot persistence is content-addressed and idempotent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fit-registry-'));
  try {
    const bytes = Buffer.from('Brand,Model No\nHaier,HDW15F3S1\n');
    const manifest = createRegistrySnapshotManifest({
      sourceId: 'energy-rating:dishwasher',
      sourceUrl: 'https://data.gov.au/dw.csv',
      retrievedAt: '2026-07-12T00:00:00.000Z',
      mediaType: 'text/csv',
      bytes,
      licence: LICENCE,
    });
    const first = await persistRegistrySnapshot({ manifest, bytes, storageRoot: root });
    const second = await persistRegistrySnapshot({ manifest, bytes, storageRoot: root });
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.deepEqual(await readFile(first.absolutePath), bytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('registry payload validation rejects HTML and missing required CSV headers before storage', () => {
  assert.throws(
    () => validateRegistryCsvPayload(Buffer.from('<!doctype html><title>Sign in</title>'), { requiredHeaders: ['Brand'] }),
    /html|csv/i,
  );
  assert.throws(
    () => validateRegistryCsvPayload(Buffer.from('Brand,Wrong\nHaier,X\n'), { requiredHeaders: ['Brand', 'Model No'] }),
    /Model No|header/i,
  );
  const result = validateRegistryCsvPayload(Buffer.from('Brand,Model No\nHaier,HDW15F3S1\n'), { requiredHeaders: ['Brand', 'Model No'] });
  assert.equal(result.rows, 1);
});
