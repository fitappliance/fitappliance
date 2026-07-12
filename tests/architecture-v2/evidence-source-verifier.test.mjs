import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createVerificationReceipt,
  isOfficialBrandUrl,
  isOfficialBrandHostUrl,
  isSourceFresh,
  validateTrustedSourceMetadata,
  verifyVerificationReceipt,
} from '../../src/domain/evidence-source-verifier.mjs';

const HASH = 'a'.repeat(64);
const JSON_HASH = 'b'.repeat(64);
const caseIdentity = Object.freeze({
  brand: 'Westinghouse', model: 'WHE6874BA', category: 'fridge',
});

function source(overrides = {}) {
  return {
    authority: 'manufacturer',
    sourceUrl: 'https://www.westinghouse.com.au/fridges/whe6874ba/',
    finalUrl: 'https://www.westinghouse.com.au/fridges/whe6874ba/',
    redirectChain: [],
    retrievedAt: '2026-07-11T14:30:00.000Z',
    contentSha256: HASH,
    objectPath: `evidence/web/sha256/aa/aa/${HASH}.html`,
    contentType: 'text/html',
    byteSize: 1234,
    identity: { brand: 'Westinghouse', model: 'WHE6874BA', outcome: 'exact' },
    identitySignals: [
      { type: 'canonical_url', value: 'https://www.westinghouse.com.au/fridges/whe6874ba/' },
      { type: 'product_model', value: 'WHE6874BA' },
    ],
    claims: [
      { field: 'closedEnvelope.widthMm', value: 913, unit: 'mm', label: 'Total width (mm)', quote: 'Total width (mm) 913 mm' },
    ],
    ...overrides,
  };
}

function pdfSource(overrides = {}) {
  return source({
    sourceUrl: 'https://www.westinghouse.com.au/support/WHE6874BA.pdf',
    finalUrl: 'https://www.westinghouse.com.au/support/WHE6874BA.pdf',
    objectPath: `evidence/web/sha256/aa/aa/${HASH}.pdf`,
    contentType: 'application/pdf',
    identitySignals: [
      { type: 'mineru_title_model', value: 'WHE6874BA:page:1' },
      { type: 'mineru_table_model', value: `WHE6874BA:page:1:${'c'.repeat(64)}` },
    ],
    claims: [{
      field: 'closedEnvelope.widthMm', value: 913, unit: 'mm',
      label: 'Dimensions (W x H x D)', quote: 'Dimensions (W x H x D) 913 x 1782 x 803 mm',
      page: 1, bbox: [80, 200, 800, 900], fragmentSha256: 'c'.repeat(64),
      semanticBasis: 'explicit_axis_sequence', axisOrder: ['width', 'height', 'depth'],
      sourceUnit: 'mm', sourceValues: [913, 1782, 803], sourceValuesMm: [913, 1782, 803],
    }],
    derivedArtifact: {
      schemaVersion: 1, format: 'content_list_v2', parserName: 'MinerU', parserVersion: '3.4.4',
      modelRevision: 'ed6b654c018d742e65a17671e379c5e6ecc87ec9',
      backend: 'pipeline', method: 'auto', tableEnabled: true, formulaEnabled: false,
      sourcePdfSha256: HASH, contentSha256: JSON_HASH,
      objectPath: `evidence/derived/mineru-json/sha256/bb/bb/${JSON_HASH}.json`,
      byteSize: 4567, pageCount: 1,
    },
    ...overrides,
  });
}

test('brand policy rejects self-declared manufacturers and cross-brand redirects', () => {
  assert.throws(() => validateTrustedSourceMetadata(source({
    sourceUrl: 'https://evil.example/fake', finalUrl: 'https://evil.example/fake',
  }), caseIdentity, { asOf: '2026-07-11T15:00:00.000Z' }), /official host/i);

  assert.throws(() => validateTrustedSourceMetadata(source({
    redirectChain: ['https://evil.example/redirect'],
  }), caseIdentity, { asOf: '2026-07-11T15:00:00.000Z' }), /redirect/i);

  assert.throws(() => validateTrustedSourceMetadata(source(), {
    ...caseIdentity, brand: 'Samsung',
  }, { asOf: '2026-07-11T15:00:00.000Z' }), /official host/i);
});

test('official source policy accepts explicit Australian static assets and query market signals', () => {
  assert.equal(isOfficialBrandUrl(
    'https://www.hisense.com.au/product/HWF8I1015BX/series-8i-10kg-front-load-washer',
    'Hisense',
  ), true);
  assert.equal(isOfficialBrandUrl(
    'https://www.lg.com/content/dam/channel/wcms/au/images/clothes-dryers/dvh5/DVH5-08W.pdf',
    'LG',
  ), true);
  assert.equal(isOfficialBrandUrl(
    'https://downloadcenter.samsung.com/content/manual.pdf?CDSite=UNI_AU&ModelName=DV90BB9440GH',
    'Samsung',
  ), true);
  assert.equal(isOfficialBrandUrl(
    'https://downloadcenter.samsung.com/content/manual.pdf?CDSite=UNI_US&ModelName=DV90BB9440GH',
    'Samsung',
  ), false);
  assert.equal(isOfficialBrandHostUrl(
    'https://downloadcenter.samsung.com/content/manual.pdf', 'Samsung',
  ), true);
  assert.equal(isOfficialBrandHostUrl('https://evil.example/manual.pdf', 'Samsung'), false);
});

test('market-scoped requests may redirect within the same official brand host family', () => {
  const redirected = pdfSource({
    sourceUrl: 'https://org.downloadcenter.samsung.com/file?CDSite=UNI_AU&ModelName=WHE6874BA',
    finalUrl: 'https://downloadcenter.samsung.com/content/manual.pdf',
    redirectChain: ['https://downloadcenter.samsung.com/content/manual.pdf'],
    identity: { brand: 'Samsung', model: 'WHE6874BA', outcome: 'exact' },
  });
  assert.doesNotThrow(() => validateTrustedSourceMetadata(redirected, {
    brand: 'Samsung', model: 'WHE6874BA', category: 'fridge',
  }, { asOf: '2026-07-11T15:00:00.000Z' }));
});

test('retrieval time must be real, non-future, and inside freshness policy', () => {
  assert.throws(() => validateTrustedSourceMetadata(source({
    retrievedAt: '2026-99-99T99:99:99Z',
  }), caseIdentity, { asOf: '2026-07-11T15:00:00.000Z' }), /retrieval time/i);
  assert.throws(() => validateTrustedSourceMetadata(source({
    retrievedAt: '2026-07-12T15:00:00.000Z',
  }), caseIdentity, { asOf: '2026-07-11T15:00:00.000Z' }), /future/i);
  assert.throws(() => validateTrustedSourceMetadata(source({
    retrievedAt: '2024-01-01T00:00:00.000Z',
  }), caseIdentity, { asOf: '2026-07-11T15:00:00.000Z' }), /stale/i);
});

test('verification receipt binds case identity, source metadata, artifact, and claims', () => {
  const input = source();
  input.verificationReceipt = createVerificationReceipt(input, caseIdentity, {
    verifiedAt: '2026-07-11T14:35:00.000Z',
  });

  assert.equal(verifyVerificationReceipt(input, caseIdentity, {
    asOf: '2026-07-11T15:00:00.000Z',
  }), true);
  assert.throws(() => verifyVerificationReceipt({
    ...input,
    claims: [{ ...input.claims[0], value: 1 }],
  }, caseIdentity, { asOf: '2026-07-11T15:00:00.000Z' }), /receipt digest/i);
  assert.throws(() => verifyVerificationReceipt(input, {
    ...caseIdentity, model: 'WHE6874SA',
  }, { asOf: '2026-07-11T15:00:00.000Z' }), /receipt digest|identity/i);
});

test('verification receipt binds an official marketing alias and rejects broader fields', () => {
  const identity = { brand: 'Samsung', model: 'SRF5300SD', category: 'fridge' };
  const alias = source({
    sourceUrl: 'https://www.samsung.com/au/refrigerators/french-door/rf5000a-498l-silver-rf44a5202sl-sa/',
    finalUrl: 'https://www.samsung.com/au/refrigerators/french-door/rf5000a-498l-silver-rf44a5202sl-sa/',
    identity: {
      brand: 'Samsung', model: 'SRF5300SD', outcome: 'official_marketing_alias',
      sourceModel: 'RF44A5202SL/SA',
    },
    identitySignals: [
      { type: 'document_title', value: '495L French Door Fridge SRF5300SD | Samsung AU' },
      { type: 'canonical_source_model', value: 'RF44A5202SL/SA' },
      { type: 'official_alias_binding', value: 'SRF5300SD refrigerator RF44A5202SL/SA' },
    ],
  });
  alias.verificationReceipt = createVerificationReceipt(alias, identity, {
    verifiedAt: '2026-07-11T14:35:00.000Z',
  });
  assert.equal(verifyVerificationReceipt(alias, identity, {
    asOf: '2026-07-11T15:00:00.000Z',
  }), true);
  assert.throws(() => verifyVerificationReceipt({
    ...alias,
    identity: { ...alias.identity, sourceModel: 'RF44A5202B1/SA' },
  }, identity, { asOf: '2026-07-11T15:00:00.000Z' }), /receipt|identity/i);
  assert.throws(() => createVerificationReceipt({
    ...alias,
    verificationReceipt: undefined,
    claims: [{
      field: 'installation.topMm', value: 25, unit: 'mm',
      label: 'Top clearance', quote: 'Top clearance 25 mm',
    }],
  }, identity, { verifiedAt: '2026-07-11T14:35:00.000Z' }), /dimensions only/i);
});

test('receipt rejects malformed artifact metadata and verification timestamps', () => {
  assert.throws(() => createVerificationReceipt(source({ byteSize: 0 }), caseIdentity, {
    verifiedAt: '2026-07-11T14:35:00.000Z',
  }), /byte size/i);
  assert.throws(() => createVerificationReceipt(source(), caseIdentity, {
    verifiedAt: 'not-a-date',
  }), /verification time/i);
});

test('PDF receipt requires and binds MinerU JSON plus page-level claim provenance', () => {
  assert.throws(() => createVerificationReceipt(pdfSource({ derivedArtifact: undefined }), caseIdentity, {
    verifiedAt: '2026-07-11T14:35:00.000Z',
  }), /MinerU|derived artifact/i);

  const input = pdfSource();
  input.verificationReceipt = createVerificationReceipt(input, caseIdentity, {
    verifiedAt: '2026-07-11T14:35:00.000Z',
  });
  assert.equal(verifyVerificationReceipt(input, caseIdentity, {
    asOf: '2026-07-11T15:00:00.000Z',
  }), true);
  assert.throws(() => verifyVerificationReceipt({
    ...input, derivedArtifact: { ...input.derivedArtifact, contentSha256: 'd'.repeat(64) },
  }, caseIdentity, { asOf: '2026-07-11T15:00:00.000Z' }), /path|receipt digest/i);
  assert.throws(() => verifyVerificationReceipt({
    ...input, claims: [{ ...input.claims[0], bbox: [81, 200, 800, 900] }],
  }, caseIdentity, { asOf: '2026-07-11T15:00:00.000Z' }), /receipt digest/i);
});

test('freshness is evaluated independently from immutable receipt integrity', () => {
  const input = source();
  input.verificationReceipt = createVerificationReceipt(input, caseIdentity, {
    verifiedAt: '2026-07-11T14:35:00.000Z',
  });
  assert.equal(isSourceFresh(input, '2026-07-12T00:00:00.000Z'), true);
  assert.equal(isSourceFresh(input, '2028-01-01T00:00:00.000Z'), false);
  assert.equal(verifyVerificationReceipt(input, caseIdentity, {
    asOf: input.verificationReceipt.verifiedAt,
  }), true);
});
