import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRegistrySnapshotManifest,
  parseRegistryCsv,
  verifyRegistrySnapshot,
} from '../../src/domain/official-registry-snapshot.mjs';

const LICENCE = Object.freeze({
  id: 'cc-by-3.0-au',
  name: 'Creative Commons Attribution 3.0 Australia',
  url: 'https://creativecommons.org/licenses/by/3.0/au/',
  attribution: 'Department of Climate Change, Energy, the Environment and Water',
  permitsRepositoryDerivatives: true,
});

test('registry snapshot binds source bytes, licence and portable object path', () => {
  const bytes = Buffer.from('Brand,Model No\nHaier,HDW15F3S1\n');
  const manifest = createRegistrySnapshotManifest({
    sourceId: 'energy-rating:dishwasher',
    sourceUrl: 'https://data.gov.au/example.csv',
    retrievedAt: '2026-07-12T08:04:34.000Z',
    mediaType: 'text/csv',
    bytes,
    licence: LICENCE,
  });

  assert.equal(manifest.contentSha256, '1d20ee2594520726ee62fc7d7a6739393a6a3d0f023a69d9ba92597caf1d2e56');
  assert.equal(manifest.byteLength, bytes.length);
  assert.match(manifest.storage.objectPath, /^registries\/objects\/sha256\/1d\/20\/[a-f0-9]{64}\.csv$/);
  assert.equal(manifest.storage.rootEnv, 'FITAPPLIANCE_STORAGE_ROOT');
  assert.equal(verifyRegistrySnapshot(manifest, bytes).valid, true);

  assert.throws(
    () => verifyRegistrySnapshot(manifest, Buffer.from('changed')),
    /hash|byte length/i,
  );
  assert.throws(
    () => verifyRegistrySnapshot({
      ...manifest,
      storage: { ...manifest.storage, objectPath: `unsafe/prefix/${manifest.storage.objectPath}` },
    }, bytes),
    /object path|content addressed/i,
  );
});

test('snapshot rejects incomplete licence and non-http source identity', () => {
  const input = {
    sourceId: 'energy-rating:fridge',
    sourceUrl: 'file:///tmp/fridge.csv',
    retrievedAt: '2026-07-12T08:04:34.000Z',
    mediaType: 'text/csv',
    bytes: Buffer.from('a,b\n1,2\n'),
    licence: LICENCE,
  };

  assert.throws(() => createRegistrySnapshotManifest(input), /https/i);
  assert.throws(
    () => createRegistrySnapshotManifest({
      ...input,
      sourceUrl: 'https://example.com/fridge.csv',
      licence: { name: 'Unknown' },
    }),
    /licence/i,
  );
});

test('structured registry parser handles quoted commas, escaped quotes and multiline fields', () => {
  const parsed = parseRegistryCsv(Buffer.from(
    'Brand,Model No,Sold_in,Notes\r\n' +
    'Haier,HDW15F3S1,"Australia,New Zealand","Line one\nLine ""two"""\r\n',
  ));

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].record.Sold_in, 'Australia,New Zealand');
  assert.equal(parsed[0].record.Notes, 'Line one\nLine "two"');
  assert.ok(parsed[0].sourceLine >= 2);
});

test('structured registry parser fails malformed quoted input instead of shifting columns', () => {
  assert.throws(
    () => parseRegistryCsv('Brand,Model No\n"Haier,HDW15F3S1\n'),
    /csv|quote|record/i,
  );
});
