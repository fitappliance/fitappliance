import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  verifyOfficialMarketApiDiscoveryEvidence,
} from '../../src/domain/official-market-api-discovery-evidence.mjs';

const discoveryUrl = 'https://dtc-aus-api.hisense.com/occ/v2/au/products/HWF5I1015?fields=FULL';
const specificationUrl = 'https://dtc-aus-api.hisense.com/medias/HWF5I1015-specification.pdf';

function hisenseDiscoveryFixture(overrides = {}) {
  const payload = {
    code: 'HWF5I1015',
    specificationDoc: {
      url: '/medias/HWF5I1015-specification.pdf',
    },
    productManual: {
      url: '/medias/HWF5I1015-user-manual.pdf',
    },
    ...overrides,
  };
  const bytes = Buffer.from(JSON.stringify(payload));
  const hash = createHash('sha256').update(bytes).digest('hex');
  return {
    bytes,
    provenance: {
      schemaVersion: 1,
      method: 'official_market_api',
      market: 'AU',
      discoveryUrl,
      requestedModel: 'HWF5I1015',
      matchedModel: 'HWF5I1015',
      artifactUrl: specificationUrl,
      discoveryContentSha256: hash,
      discoveryObjectPath: `evidence/web/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.json`,
      discoveryByteSize: bytes.length,
    },
  };
}

test('Hisense OCC discovery binds an exact code to a relative official document URL', () => {
  const fixture = hisenseDiscoveryFixture();
  assert.equal(verifyOfficialMarketApiDiscoveryEvidence(
    fixture.provenance,
    { brand: 'Hisense', model: 'HWF5I1015' },
    fixture.bytes,
  ), true);
});

test('Hisense OCC discovery rejects a different product code', () => {
  const fixture = hisenseDiscoveryFixture({ code: 'HWF5I1014' });
  assert.throws(() => verifyOfficialMarketApiDiscoveryEvidence(
    fixture.provenance,
    { brand: 'Hisense', model: 'HWF5I1015' },
    fixture.bytes,
  ), /does not prove the declared model/i);
});

test('Hisense OCC discovery rejects a document not linked by the exact product', () => {
  const fixture = hisenseDiscoveryFixture();
  fixture.provenance.artifactUrl = 'https://dtc-aus-api.hisense.com/medias/unlisted.pdf';
  assert.throws(() => verifyOfficialMarketApiDiscoveryEvidence(
    fixture.provenance,
    { brand: 'Hisense', model: 'HWF5I1015' },
    fixture.bytes,
  ), /missing the declared artifact link/i);
});
