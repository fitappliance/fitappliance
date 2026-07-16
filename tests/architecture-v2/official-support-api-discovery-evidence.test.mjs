import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  officialSupportApiBoundFamilyModel,
  verifyOfficialSupportApiDiscoveryEvidence,
} from '../../src/domain/official-support-api-discovery-evidence.mjs';

const identity = { brand: 'Fisher & Paykel', model: 'RF610ADUQSX4', category: 'fridge' };
const publicUrl = 'https://fisherpaykel.my.salesforce.com/sfc/p/90000000kftP/a/Jw000004hSYD/content-token-1234';
const artifactUrl = 'https://fisherpaykel.my.salesforce.com/sfc/dist/version/download/?oid=00D90000000kftP&ids=068Jw00000ecUKeIAM&d=%2Fa%2FJw000004hSYD%2Fcontent-token-1234&operationContext=DELIVERY&viewId=05HJw00000QCIJxMAP&dpt=';

function fixture(overrides = {}) {
  const payload = overrides.payload ?? {
    product: {
      modelNumber: 'RF610ADUQSX4',
      articles: [{
        id: 'ka0-rf610-install',
        title: 'RF610ADUQSX4 installation guide',
        articleBody: `<iframe src="${publicUrl}"></iframe>`,
      }],
    },
  };
  const bytes = Buffer.from(JSON.stringify(payload));
  const hash = createHash('sha256').update(bytes).digest('hex');
  return {
    bytes,
    provenance: {
      schemaVersion: 1,
      method: 'official_support_api',
      market: 'AU',
      sourceMarket: 'NZ',
      discoveryUrl: 'https://mf-support.mfe.fisherpaykel.com/nz/api/support/products/refrig-rf610aduqsx4-fp-aa--RF610ADUQSX4',
      requestedModel: 'RF610ADUQSX4',
      matchedModel: 'RF610ADUQSX4',
      artifactUrl,
      artifactLinkUrl: publicUrl,
      discoveryContentSha256: hash,
      discoveryObjectPath: `evidence/web/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.json`,
      discoveryByteSize: bytes.length,
      documentId: 'ka0-rf610-install',
      ...overrides.provenance,
    },
  };
}

test('hash-bound Fisher & Paykel support API proves an exact product article and RF610A family', () => {
  const { provenance, bytes } = fixture();
  assert.equal(verifyOfficialSupportApiDiscoveryEvidence(provenance, identity, bytes), true);
  assert.equal(officialSupportApiBoundFamilyModel(provenance, identity, bytes), 'RF610A');
});

test('support API evidence rejects sibling models and links outside the declared article', () => {
  const sibling = fixture({ payload: {
    product: {
      modelNumber: 'RF610ADUB5',
      articles: [{ id: 'ka0-rf610-install', articleBody: `<a href="${publicUrl}">Guide</a>` }],
    },
  } });
  assert.throws(
    () => verifyOfficialSupportApiDiscoveryEvidence(sibling.provenance, identity, sibling.bytes),
    /exact model/,
  );

  const unlinked = fixture({ payload: {
    product: {
      modelNumber: 'RF610ADUQSX4',
      articles: [{ id: 'ka0-rf610-install', articleBody: '<p>No document link</p>' }],
    },
  } });
  assert.throws(
    () => verifyOfficialSupportApiDiscoveryEvidence(unlinked.provenance, identity, unlinked.bytes),
    /declared artifact link/,
  );
});

test('support API evidence rejects hash, path, size, document ID and resolved artifact drift', () => {
  const valid = fixture();
  for (const provenance of [
    { ...valid.provenance, discoveryContentSha256: '0'.repeat(64) },
    { ...valid.provenance, discoveryObjectPath: 'evidence/web/sha256/00/00/bad.json' },
    { ...valid.provenance, discoveryByteSize: valid.bytes.length + 1 },
    { ...valid.provenance, documentId: 'ka0-sibling' },
    { ...valid.provenance, artifactUrl: 'https://content.fisherpaykel.com/guides/unrelated.pdf' },
    {
      ...valid.provenance,
      artifactUrl: 'https://fisherpaykel.my.salesforce.com/sfc/dist/version/download/?oid=00D90000000kftP&ids=068Jw00000ecUKeIAM&d=%2Fa%2FJw0000099999%2Funrelated-token&operationContext=DELIVERY&viewId=05HJw0000000001',
    },
    {
      ...valid.provenance,
      artifactUrl: 'https://fisherpaykel.my.salesforce.com/sfc/dist/version/download/?oid=00D90000000kftP&ids=not-a-version&d=%2Fa%2FJw000004hSYD%2Fcontent-token-1234&operationContext=DELIVERY&viewId=05HJw0000000001',
    },
  ]) {
    assert.throws(() => verifyOfficialSupportApiDiscoveryEvidence(provenance, identity, valid.bytes));
  }
});

test('support family binding stays unavailable to other brands, categories and RF families', () => {
  const { provenance, bytes } = fixture();
  assert.equal(officialSupportApiBoundFamilyModel(provenance, { ...identity, brand: 'Haier' }, bytes), null);
  assert.equal(officialSupportApiBoundFamilyModel(provenance, { ...identity, category: 'dishwasher' }, bytes), null);
  assert.equal(officialSupportApiBoundFamilyModel(provenance, { ...identity, model: 'RF605QNUVB1' }, bytes), null);
});
