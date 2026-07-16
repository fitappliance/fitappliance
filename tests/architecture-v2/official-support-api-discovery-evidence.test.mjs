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

test('hash-bound Fisher & Paykel support API binds an exact DW60CH variant to its installation family', () => {
  const dishwasherIdentity = {
    brand: 'Fisher & Paykel', model: 'DW60CHW1', category: 'dishwasher',
  };
  const payload = {
    product: {
      modelNumber: dishwasherIdentity.model,
      articles: [{
        id: 'ka0-dw60ch-install',
        title: 'Dishwasher Classic Handle - Installation Guide',
        articleType: 'Installation Guide',
        articleBody: `<a href="${publicUrl}">Installation guide</a>`,
      }],
    },
  };
  const bytes = Buffer.from(JSON.stringify(payload));
  const hash = createHash('sha256').update(bytes).digest('hex');
  const provenance = {
    schemaVersion: 1,
    method: 'official_support_api',
    market: 'AU',
    sourceMarket: 'NZ',
    discoveryUrl: 'https://mf-support.mfe.fisherpaykel.com/nz/api/support/products/dishwasher-dw60chw1-fp-aa--DW60CHW1',
    requestedModel: dishwasherIdentity.model,
    matchedModel: dishwasherIdentity.model,
    artifactUrl,
    artifactLinkUrl: publicUrl,
    discoveryContentSha256: hash,
    discoveryObjectPath: `evidence/web/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.json`,
    discoveryByteSize: bytes.length,
    documentId: 'ka0-dw60ch-install',
  };

  assert.equal(officialSupportApiBoundFamilyModel(
    provenance, dishwasherIdentity, bytes,
  ), 'DW60CH');
  assert.equal(officialSupportApiBoundFamilyModel(
    provenance, { ...dishwasherIdentity, model: 'DW60CEW1' }, bytes,
  ), null);

  const nonInstallationBytes = Buffer.from(JSON.stringify({
    product: {
      modelNumber: dishwasherIdentity.model,
      articles: [{
        id: 'ka0-dw60ch-install',
        title: 'Dishwasher user guide',
        articleType: 'User/Care Guide',
        articleBody: `<a href="${publicUrl}">User guide</a>`,
      }],
    },
  }));
  const nonInstallationHash = createHash('sha256').update(nonInstallationBytes).digest('hex');
  assert.equal(officialSupportApiBoundFamilyModel({
    ...provenance,
    discoveryContentSha256: nonInstallationHash,
    discoveryObjectPath: `evidence/web/sha256/${nonInstallationHash.slice(0, 2)}/${nonInstallationHash.slice(2, 4)}/${nonInstallationHash}.json`,
    discoveryByteSize: nonInstallationBytes.length,
  }, dishwasherIdentity, nonInstallationBytes), null);
});

test('hash-bound Fisher & Paykel support document resource binds one WA top-loader base model', () => {
  const washerIdentity = {
    brand: 'Fisher & Paykel', model: 'WA7560E1', category: 'washing_machine',
  };
  const washerArtifactUrl = 'https://dam.fisherpaykel.com/KZ3PKN00/at/install/FP-Washsmart-installation-guide-WA60-models.pdf';
  const payload = {
    product: { modelNumber: washerIdentity.model, articles: [] },
    documentResources: [{
      url: washerArtifactUrl,
      name: 'FP-Washsmart-installation-guide-WA60-models.pdf',
      subType: 'Installation',
      resourceTitle: 'Installation Guide (English)',
    }],
  };
  const bytes = Buffer.from(JSON.stringify(payload));
  const hash = createHash('sha256').update(bytes).digest('hex');
  const provenance = {
    schemaVersion: 1,
    method: 'official_support_api',
    market: 'AU',
    sourceMarket: 'AU',
    discoveryUrl: 'https://mf-support.mfe.fisherpaykel.com/au/api/support/products/75kg-series-7-top-loader-washer--WA7560E1',
    requestedModel: washerIdentity.model,
    matchedModel: washerIdentity.model,
    artifactUrl: washerArtifactUrl,
    artifactLinkUrl: washerArtifactUrl,
    discoveryContentSha256: hash,
    discoveryObjectPath: `evidence/web/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.json`,
    discoveryByteSize: bytes.length,
    discoveryRecordType: 'support_document_resource',
    documentId: 'documentResources:0',
    documentTitleKey: 'Installation|Installation Guide (English)',
    originalFileName: 'FP-Washsmart-installation-guide-WA60-models.pdf',
  };

  assert.equal(verifyOfficialSupportApiDiscoveryEvidence(provenance, washerIdentity, bytes), true);
  assert.equal(officialSupportApiBoundFamilyModel(provenance, washerIdentity, bytes), 'WA7560E');
  assert.equal(officialSupportApiBoundFamilyModel(
    provenance, { ...washerIdentity, model: 'WA7560E11' }, bytes,
  ), null);

  const tamperedBytes = Buffer.from(JSON.stringify({
    ...payload,
    documentResources: [{
      ...payload.documentResources[0],
      url: 'https://dam.fisherpaykel.com/KZ3PKN00/at/sibling/sibling.pdf',
    }],
  }));
  const tamperedHash = createHash('sha256').update(tamperedBytes).digest('hex');
  assert.throws(() => verifyOfficialSupportApiDiscoveryEvidence({
    ...provenance,
    discoveryContentSha256: tamperedHash,
    discoveryObjectPath: `evidence/web/sha256/${tamperedHash.slice(0, 2)}/${tamperedHash.slice(2, 4)}/${tamperedHash}.json`,
    discoveryByteSize: tamperedBytes.length,
  }, washerIdentity, tamperedBytes), /document resource/i);
});

test('hash-bound Fisher & Paykel installation article binds one legacy WA top-loader base model', () => {
  const washerIdentity = {
    brand: 'Fisher & Paykel', model: 'WA7060G1', category: 'washing_machine',
  };
  const payload = {
    product: {
      modelNumber: washerIdentity.model,
      articles: [{
        id: 'ka0-wa70-install',
        title: 'Top Loader Washing Machine 7kg - Installation Guide',
        articleType: 'Installation Guide',
        articleBody: `<a href="${publicUrl}">Installation guide</a>`,
      }],
    },
  };
  const bytes = Buffer.from(JSON.stringify(payload));
  const hash = createHash('sha256').update(bytes).digest('hex');
  const provenance = {
    schemaVersion: 1, method: 'official_support_api', market: 'AU', sourceMarket: 'NZ',
    discoveryUrl: 'https://mf-support.mfe.fisherpaykel.com/nz/api/support/products/washer-wa7060g1-fp-aa--WA7060G1',
    requestedModel: washerIdentity.model, matchedModel: washerIdentity.model,
    artifactUrl, artifactLinkUrl: publicUrl,
    discoveryContentSha256: hash,
    discoveryObjectPath: `evidence/web/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.json`,
    discoveryByteSize: bytes.length,
    documentId: 'ka0-wa70-install',
    originalFileName: 'Top Loaders User Install NZAUSGROW',
  };

  assert.equal(verifyOfficialSupportApiDiscoveryEvidence(provenance, washerIdentity, bytes), true);
  assert.equal(officialSupportApiBoundFamilyModel(provenance, washerIdentity, bytes), 'WA7060G');

  const userBytes = Buffer.from(JSON.stringify({
    product: {
      modelNumber: washerIdentity.model,
      articles: [{
        ...payload.product.articles[0],
        title: 'Top Loader Washing Machine 7kg - User Guide',
        articleType: 'User/Care Guide',
      }],
    },
  }));
  const userHash = createHash('sha256').update(userBytes).digest('hex');
  assert.equal(officialSupportApiBoundFamilyModel({
    ...provenance,
    discoveryContentSha256: userHash,
    discoveryObjectPath: `evidence/web/sha256/${userHash.slice(0, 2)}/${userHash.slice(2, 4)}/${userHash}.json`,
    discoveryByteSize: userBytes.length,
  }, washerIdentity, userBytes), null);
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
