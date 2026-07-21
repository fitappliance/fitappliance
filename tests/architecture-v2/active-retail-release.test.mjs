import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  loadActiveRetailRelease,
  validateActiveRetailReleaseDescriptor,
} from '../../src/domain/active-retail-release.mjs';

test('active retail release is bound to the approved candidate and historical reference', async () => {
  const release = await loadActiveRetailRelease();

  assert.equal(release.manifest.authorization.status, 'READY_FOR_CUTOVER');
  assert.equal(release.descriptor.releaseCandidateId, release.manifest.releaseCandidateId);
  assert.equal(release.catalog.products.length, 3513);
  assert.equal(release.catalog.products.filter((product) => product.unavailable === false).length, 349);
  assert.equal(release.reference.records.length, 8087);
  assert.equal(
    release.descriptor.artifacts.publicProjection.sha256,
    release.manifest.sourceBindings.finalCandidateProjectionSha256,
  );
  assert.equal(
    release.descriptor.artifacts.historicalReference.sha256,
    release.manifest.sourceBindings.historicalReferenceCandidateSha256,
  );
});

test('active retail release descriptor rejects paths outside its immutable release directory', () => {
  const releaseCandidateId = 'retail_lifecycle_release_1234567890abcdef12345678';
  const descriptor = {
    schemaVersion: 1,
    policyVersion: 'active-retail-release-v1',
    releaseCandidateId,
    activatedAt: '2026-07-21T12:12:18.070Z',
    artifacts: {
      publicProjection: { path: '../../private.json', sha256: 'a'.repeat(64) },
      historicalReference: {
        path: `data/architecture-v2/releases/${releaseCandidateId}/historical-appliance-reference.json`,
        sha256: 'b'.repeat(64),
      },
      authorizationManifest: {
        path: `data/architecture-v2/releases/${releaseCandidateId}/authorization-manifest.json`,
        sha256: 'c'.repeat(64),
      },
    },
  };

  assert.throws(
    () => validateActiveRetailReleaseDescriptor(descriptor),
    /release directory/i,
  );
});

test('active retail release rejects artifact byte drift', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'fitappliance-active-release-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const descriptor = JSON.parse(readFileSync(
    'data/architecture-v2/decisions/active-retail-release.json',
    'utf8',
  ));
  descriptor.artifacts.publicProjection.sha256 = '0'.repeat(64);
  const descriptorPath = join(directory, 'active-retail-release.json');
  await writeFile(descriptorPath, JSON.stringify(descriptor), 'utf8');

  await assert.rejects(
    () => loadActiveRetailRelease({ descriptorPath }),
    /public projection hash drift/i,
  );
});

test('normal web build publishes and audits only the selected active release', () => {
  const packageDocument = JSON.parse(readFileSync('package.json', 'utf8'));
  const productGenerator = readFileSync('scripts/generate-product-pages.js', 'utf8');

  assert.match(packageDocument.scripts['publish:catalog'], /publish:active-retail-release/);
  assert.match(
    packageDocument.scripts['publish:active-retail-release'],
    /publish-active-retail-release\.mjs/,
  );
  assert.doesNotMatch(packageDocument.scripts['publish:catalog'], /publish-runtime-projection\.js/);
  assert.match(packageDocument.scripts['publish:runtime-catalog'], /publish:active-retail-release/);
  assert.doesNotMatch(
    packageDocument.scripts['publish:runtime-catalog'],
    /publish-runtime-projection\.js/,
  );
  assert.match(packageDocument.scripts.build, /audit:active-retail-release/);
  assert.match(
    productGenerator,
    /require\.main[\s\S]+public['"],\s*'data['"],\s*'appliances\.json/,
  );
});
