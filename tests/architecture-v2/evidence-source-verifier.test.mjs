import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  createVerificationReceipt,
  isOfficialBrandArtifactUrl,
  isOfficialBrandArtifactHostUrl,
  isOfficialBrandUrl,
  isOfficialBrandHostUrl,
  isOfficialBrandMarketUrl,
  isSourceFresh,
  normalizeOfficialArtifactDiscoveryProvenance,
  officialHtmlModelVariant,
  validateTrustedSourceMetadata,
  verifyVerificationReceipt,
} from '../../src/domain/evidence-source-verifier.mjs';

const HASH = 'a'.repeat(64);
const JSON_HASH = 'b'.repeat(64);
const caseIdentity = Object.freeze({
  brand: 'Westinghouse', model: 'WHE6874BA', category: 'fridge',
});

test('official HTML model variants are limited to policy-approved brand, category, and suffixes', () => {
  assert.deepEqual(officialHtmlModelVariant({
    brand: 'Westinghouse', model: 'WTB4600SC', category: 'fridge',
  }, 'WTB4600SC-R'), { sourceModel: 'WTB4600SC-R', suffix: 'R' });
  assert.equal(officialHtmlModelVariant({
    brand: 'Westinghouse', model: 'WTB4600SC', category: 'dishwasher',
  }, 'WTB4600SC-R'), null);
  assert.equal(officialHtmlModelVariant({
    brand: 'Electrolux', model: 'WTB4600SC', category: 'fridge',
  }, 'WTB4600SC-R'), null);
  assert.equal(officialHtmlModelVariant({
    brand: 'Westinghouse', model: 'WTB4600SC', category: 'fridge',
  }, 'WTB4600SC-X'), null);
  assert.equal(officialHtmlModelVariant({
    brand: 'Westinghouse', model: 'WTB4600SC', category: 'fridge',
  }, 'WTB4600SCR'), null);
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

test('official source policy accepts only explicitly qualified Australian brand hosts', () => {
  assert.equal(isOfficialBrandMarketUrl(
    'https://dtc-aus-api.hisense.com/medias/HRAF242-Spec.pdf',
    'Hisense',
  ), true);
  assert.equal(isOfficialBrandMarketUrl(
    'https://support.hisense.com/medias/HRAF242-Spec.pdf',
    'Hisense',
  ), false);
  assert.equal(isOfficialBrandMarketUrl(
    'https://esatto.house/discontinued-products/p/207l-top-mount-refrigerator-stainless-steel-etm207x',
    'Esatto',
  ), true);
  assert.equal(isOfficialBrandMarketUrl(
    'https://support.esatto.house/manuals/ETM207X.pdf',
    'Esatto',
  ), false);
});

test('Esatto CDN redirects require product-page-bound discovery provenance', () => {
  const artifactUrl = 'https://esatto.house/s/Esatto_UserManual_ETM207-239-268_0518.pdf';
  const provenance = {
    schemaVersion: 1,
    method: 'official_product_page',
    market: 'AU',
    discoveryUrl: 'https://esatto.house/discontinued-products/p/207l-top-mount-refrigerator-stainless-steel-etm207x',
    requestedModel: 'ETM207X',
    matchedModel: 'ETM207X',
    artifactUrl,
    artifactLinkUrl: artifactUrl,
    discoveryContentSha256: 'c'.repeat(64),
    discoveryObjectPath: `evidence/web/sha256/cc/cc/${'c'.repeat(64)}.html`,
    discoveryByteSize: 1234,
  };
  const cdnUrl = 'https://static1.squarespace.com/static/site/t/file/Esatto_UserManual_ETM207.pdf';
  assert.equal(isOfficialBrandArtifactHostUrl(cdnUrl, 'Esatto', {
    model: 'ETM207X', artifactUrl, discoveryProvenance: provenance,
  }), true);
  assert.equal(isOfficialBrandArtifactHostUrl(cdnUrl, 'Esatto', {
    model: 'ETM207X', artifactUrl,
  }), false);
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

test('global official artifact is trusted only with receipt-bound Australian discovery provenance', () => {
  const identity = { brand: 'LG', model: 'WD1275A1', category: 'washing_machine' };
  const artifactUrl = 'https://gscs-b2c.lge.com/open/downloadFile?fileId=fixture';
  const discoveryProvenance = {
    schemaVersion: 1,
    method: 'official_market_api',
    market: 'AU',
    discoveryUrl: 'https://www.lg.com/ncms/asia/api/v1/support/proxy/retrieveManualSoftwareList?locale=AU',
    requestedModel: 'WD1275A1',
    matchedModel: 'WD1275A1',
    artifactUrl,
    documentId: '20152207223286',
  };
  const input = pdfSource({
    sourceUrl: artifactUrl,
    finalUrl: artifactUrl,
    identity: { ...identity, outcome: 'exact' },
    identitySignals: [
      { type: 'mineru_title_model', value: 'WD1275A1:page:1' },
      { type: 'mineru_table_model', value: `WD1275A1:page:1:${'c'.repeat(64)}` },
    ],
    discoveryProvenance,
  });

  assert.throws(() => createVerificationReceipt({
    ...input,
    discoveryProvenance: undefined,
  }, identity, {
    verifiedAt: '2026-07-11T14:35:00.000Z',
  }), /Australian market|official host|provenance/i);

  input.verificationReceipt = createVerificationReceipt(input, identity, {
    verifiedAt: '2026-07-11T14:35:00.000Z',
  });
  assert.equal(input.verificationReceipt.discoveryPolicyVersion, '2026-07-16.2');
  assert.equal(verifyVerificationReceipt(input, identity, {
    asOf: input.verificationReceipt.verifiedAt,
  }), true);
  const legacyReceipt = { ...createVerificationReceipt({
    ...input, verificationReceipt: undefined,
  }, identity, {
    verifiedAt: '2026-07-11T14:35:00.000Z',
    discoveryPolicyVersion: '2026-07-13.2',
  }) };
  delete legacyReceipt.discoveryPolicyVersion;
  assert.equal(verifyVerificationReceipt({
    ...input, verificationReceipt: legacyReceipt,
  }, identity, { asOf: legacyReceipt.verifiedAt }), true);
  assert.throws(() => createVerificationReceipt({
    ...input, verificationReceipt: undefined,
  }, identity, {
    verifiedAt: '2026-07-11T14:35:00.000Z',
    discoveryPolicyVersion: '2025-01-01.1',
  }), /discovery policy version/i);
  assert.throws(() => verifyVerificationReceipt({
    ...input,
    discoveryProvenance: { ...discoveryProvenance, matchedModel: 'WD1275A2' },
  }, identity, { asOf: input.verificationReceipt.verifiedAt }), /model|receipt|provenance/i);
});

test('ASKO AU API provenance requires hash-bound exact-model JSON and an artifact link', () => {
  const identity = { brand: 'ASKO', model: 'T408HD.W', category: 'dryer' };
  const artifactUrl = 'https://partners.gorenje.com/fts/GetDigitDoc.aspx?sifra=576719&jezik=en&tipVsebine=1&docName=577992en.pdf';
  const discoveryUrl = 'https://api-storefront.asko.com/ggcommercewebservices/v2/asko-au/products/manuals/search?query=T408HD.W&lang=en_AU&curr=AUD';
  const discoveryBytes = Buffer.from(JSON.stringify({ products: [{
    code: 'ggProductCatalog/Online/000000000000576719',
    modelMark: 'T408HD.W',
    manuals: [{ desc: 'Instructions for use', url: artifactUrl }],
  }] }));
  const discoveryHash = createHash('sha256').update(discoveryBytes).digest('hex');
  const discoveryProvenance = {
    schemaVersion: 1,
    method: 'official_market_api',
    market: 'AU',
    discoveryUrl,
    requestedModel: 'T408HD.W',
    matchedModel: 'T408HD.W',
    artifactUrl,
    discoveryContentSha256: discoveryHash,
    discoveryObjectPath: `evidence/web/sha256/${discoveryHash.slice(0, 2)}/${discoveryHash.slice(2, 4)}/${discoveryHash}.json`,
    discoveryByteSize: discoveryBytes.length,
    documentId: '000000000000576719',
  };
  const input = pdfSource({
    sourceUrl: artifactUrl,
    finalUrl: artifactUrl,
    identity: { ...identity, outcome: 'exact' },
    identitySignals: [
      { type: 'mineru_page_header_model', value: 'T408HD.W:page:1' },
      { type: 'official_market_api_model', value: `T408HD.W:${discoveryHash}:${discoveryUrl}` },
    ],
    discoveryProvenance,
  });

  assert.equal(isOfficialBrandMarketUrl(discoveryUrl, 'ASKO'), true);
  assert.equal(isOfficialBrandArtifactUrl(artifactUrl, 'ASKO', {
    model: identity.model, discoveryProvenance,
  }), true);
  assert.throws(() => createVerificationReceipt(input, identity, {
    verifiedAt: '2026-07-15T00:00:00.000Z',
  }), /discovery artifact bytes required/i);
  input.verificationReceipt = createVerificationReceipt(input, identity, {
    verifiedAt: '2026-07-15T00:00:00.000Z',
    discoveryArtifactBytes: discoveryBytes,
  });
  assert.equal(verifyVerificationReceipt(input, identity, {
    asOf: input.verificationReceipt.verifiedAt,
    discoveryArtifactBytes: discoveryBytes,
  }), true);

  const siblingBytes = Buffer.from(discoveryBytes.toString('utf8').replaceAll('T408HD.W', 'T408HD.W.AU'));
  assert.throws(() => createVerificationReceipt({ ...input, verificationReceipt: undefined }, identity, {
    verifiedAt: '2026-07-15T00:00:00.000Z',
    discoveryArtifactBytes: siblingBytes,
  }), /hash mismatch|exact model/i);
});

test('Fisher & Paykel Salesforce receipt remains bound to exact AU article, model and artifact', () => {
  const identity = { brand: 'Fisher & Paykel', model: 'E450LXFD', category: 'fridge' };
  const artifactLinkUrl = 'https://fisherpaykel.my.salesforce.com/sfc/p/90000000kftP/a/Jw000004i0Rp/gKgnd7UT1q7A7nAqk2zykrP7pAE97kUQhsSbt7O3JzE';
  const artifactUrl = 'https://fisherpaykel.my.salesforce.com/sfc/dist/version/download/?oid=00D90000000kftP&ids=068Jw00000efk6MIAQ&d=/a/Jw000004i0Rp/gKgnd7UT1q7A7nAqk2zykrP7pAE97kUQhsSbt7O3JzE&operationContext=DELIVERY&viewId=05HJw00000Q7B2zMAF&dpt=';
  const discoveryBytes = Buffer.from(`<!doctype html><html><body>
    <h1>450L Vertical refrigerator E450LXFD User Care Guide</h1>
    <a href="${artifactLinkUrl}">Download user guide</a>
  </body></html>`);
  const discoveryContentSha256 = createHash('sha256').update(discoveryBytes).digest('hex');
  const discoveryProvenance = {
    schemaVersion: 1,
    method: 'official_product_page',
    market: 'AU',
    discoveryUrl: 'https://mf-support.mfe.fisherpaykel.com/au/support/articles/450L-Vertical-refrigerator---User-Care-Guide-22309-ka0Jw000000NxXFIA0/',
    requestedModel: 'E450LXFD',
    matchedModel: 'E450LXFD',
    artifactUrl,
    artifactLinkUrl,
    discoveryContentSha256,
    discoveryObjectPath: `evidence/web/sha256/${discoveryContentSha256.slice(0, 2)}/${discoveryContentSha256.slice(2, 4)}/${discoveryContentSha256}.html`,
    discoveryByteSize: discoveryBytes.length,
    documentId: '068Jw00000efk6MIAQ',
  };
  const input = pdfSource({
    sourceUrl: artifactUrl,
    finalUrl: artifactUrl,
    identity: { ...identity, outcome: 'exact' },
    identitySignals: [
      { type: 'mineru_title_model', value: 'E450LXFD:page:1' },
      { type: 'mineru_table_model', value: `E450LXFD:page:1:${'c'.repeat(64)}` },
    ],
    discoveryProvenance,
  });

  assert.throws(() => createVerificationReceipt(input, identity, {
    verifiedAt: '2026-07-11T14:35:00.000Z',
  }), /discovery artifact bytes required/i);

  input.verificationReceipt = createVerificationReceipt(input, identity, {
    verifiedAt: '2026-07-11T14:35:00.000Z',
    discoveryArtifactBytes: discoveryBytes,
  });
  assert.equal(verifyVerificationReceipt(input, identity, {
    asOf: input.verificationReceipt.verifiedAt,
  }), true);
  assert.equal(verifyVerificationReceipt(input, identity, {
    asOf: input.verificationReceipt.verifiedAt,
    discoveryArtifactBytes: discoveryBytes,
  }), true);
  assert.throws(() => verifyVerificationReceipt({
    ...input,
    discoveryProvenance: { ...discoveryProvenance, discoveryUrl: discoveryProvenance.discoveryUrl.replace('/au/', '/nz/') },
  }, identity, {
    asOf: input.verificationReceipt.verifiedAt,
    discoveryArtifactBytes: discoveryBytes,
  }), /market|receipt|provenance/i);

  const siblingBytes = Buffer.from(discoveryBytes.toString('utf8').replaceAll('E450LXFD', 'E450LXFD1'));
  assert.throws(() => createVerificationReceipt({
    ...input,
    verificationReceipt: undefined,
    discoveryProvenance: {
      ...discoveryProvenance,
      discoveryContentSha256: createHash('sha256').update(siblingBytes).digest('hex'),
      discoveryObjectPath: `evidence/web/sha256/${createHash('sha256').update(siblingBytes).digest('hex').slice(0, 2)}/${createHash('sha256').update(siblingBytes).digest('hex').slice(2, 4)}/${createHash('sha256').update(siblingBytes).digest('hex')}.html`,
      discoveryByteSize: siblingBytes.length,
    },
  }, identity, {
    verifiedAt: '2026-07-11T14:35:00.000Z',
    discoveryArtifactBytes: siblingBytes,
  }), /exact.*model|model.*discovery/i);

  const noLinkBytes = Buffer.from('<!doctype html><html><body><h1>E450LXFD user guide</h1></body></html>');
  const noLinkHash = createHash('sha256').update(noLinkBytes).digest('hex');
  assert.throws(() => createVerificationReceipt({
    ...input,
    verificationReceipt: undefined,
    discoveryProvenance: {
      ...discoveryProvenance,
      discoveryContentSha256: noLinkHash,
      discoveryObjectPath: `evidence/web/sha256/${noLinkHash.slice(0, 2)}/${noLinkHash.slice(2, 4)}/${noLinkHash}.html`,
      discoveryByteSize: noLinkBytes.length,
    },
  }, identity, {
    verifiedAt: '2026-07-11T14:35:00.000Z',
    discoveryArtifactBytes: noLinkBytes,
  }), /artifact link/i);

  assert.throws(() => createVerificationReceipt({
    ...input,
    verificationReceipt: undefined,
    sourceUrl: artifactUrl.replace('gKgnd7UT1q7A7nAqk2zykrP7pAE97kUQhsSbt7O3JzE', 'DIFFERENTTOKEN'),
    finalUrl: artifactUrl.replace('gKgnd7UT1q7A7nAqk2zykrP7pAE97kUQhsSbt7O3JzE', 'DIFFERENTTOKEN'),
    discoveryProvenance: {
      ...discoveryProvenance,
      artifactUrl: artifactUrl.replace('gKgnd7UT1q7A7nAqk2zykrP7pAE97kUQhsSbt7O3JzE', 'DIFFERENTTOKEN'),
    },
  }, identity, {
    verifiedAt: '2026-07-11T14:35:00.000Z',
    discoveryArtifactBytes: discoveryBytes,
  }), /artifact link|Salesforce|relationship/i);
});

test('Fisher & Paykel archived support API provenance stays bound to exact model, source market and artifact', () => {
  const artifactUrl = 'https://content.fisherpaykel.com/guides/DW60CDW2-installation-guide.pdf';
  const provenance = {
    schemaVersion: 1,
    method: 'official_support_api',
    market: 'AU',
    sourceMarket: 'NZ',
    discoveryUrl: 'https://mf-support.mfe.fisherpaykel.com/nz/api/support/products/dishwasher-dw60cdw2-fp-nzau--DW60CDW2',
    requestedModel: 'DW60CDW2',
    matchedModel: 'DW60CDW2',
    artifactUrl,
    documentId: 'ka0Jw000000Nu4jIAC',
    originalFileName: 'DW60CDW2 installation guide.pdf',
  };

  assert.deepEqual(normalizeOfficialArtifactDiscoveryProvenance(provenance, {
    brand: 'Fisher & Paykel',
    model: 'DW60CDW2',
    artifactUrl,
  }), provenance);
  assert.equal(isOfficialBrandArtifactUrl(artifactUrl, 'Fisher & Paykel', {
    model: 'DW60CDW2', discoveryProvenance: provenance,
  }), true);

  assert.throws(() => normalizeOfficialArtifactDiscoveryProvenance({
    ...provenance, matchedModel: 'DW60CDW1',
  }, {
    brand: 'Fisher & Paykel', model: 'DW60CDW2', artifactUrl,
  }), /model/i);
  assert.throws(() => normalizeOfficialArtifactDiscoveryProvenance({
    ...provenance, sourceMarket: 'AU',
  }, {
    brand: 'Fisher & Paykel', model: 'DW60CDW2', artifactUrl,
  }), /source market|discovery URL/i);
  assert.throws(() => normalizeOfficialArtifactDiscoveryProvenance({
    ...provenance,
    discoveryUrl: 'https://mf-support.mfe.fisherpaykel.com/nz/api/search?q=DW60CDW2&market=NZ',
  }, {
    brand: 'Fisher & Paykel', model: 'DW60CDW2', artifactUrl,
  }), /approved.*support API|discovery URL/i);
  assert.throws(() => normalizeOfficialArtifactDiscoveryProvenance({
    ...provenance,
    discoveryUrl: 'https://support.example.com/nz/api/support/products/DW60CDW2',
  }, {
    brand: 'Fisher & Paykel', model: 'DW60CDW2', artifactUrl,
  }), /official host|approved.*support API|discovery URL/i);
});

test('new Fisher & Paykel support API receipts verify their hash-bound exact article response', () => {
  const identity = { brand: 'Fisher & Paykel', model: 'RF610ADUQSX4', category: 'fridge' };
  const artifactUrl = 'https://content.fisherpaykel.com/guides/RF610ADUQSX4-install.pdf';
  const discoveryBytes = Buffer.from(JSON.stringify({
    product: {
      modelNumber: 'RF610ADUQSX4',
      articles: [{
        id: 'ka0-rf610-install',
        articleBody: `<a href="${artifactUrl}">Installation guide</a>`,
      }],
    },
  }));
  const discoveryHash = createHash('sha256').update(discoveryBytes).digest('hex');
  const discoveryProvenance = {
    schemaVersion: 1,
    method: 'official_support_api',
    market: 'AU',
    sourceMarket: 'NZ',
    discoveryUrl: 'https://mf-support.mfe.fisherpaykel.com/nz/api/support/products/refrig-rf610aduqsx4-fp-aa--RF610ADUQSX4',
    requestedModel: 'RF610ADUQSX4',
    matchedModel: 'RF610ADUQSX4',
    artifactUrl,
    artifactLinkUrl: artifactUrl,
    discoveryContentSha256: discoveryHash,
    discoveryObjectPath: `evidence/web/sha256/${discoveryHash.slice(0, 2)}/${discoveryHash.slice(2, 4)}/${discoveryHash}.json`,
    discoveryByteSize: discoveryBytes.length,
    documentId: 'ka0-rf610-install',
  };
  const input = pdfSource({
    sourceUrl: artifactUrl,
    finalUrl: artifactUrl,
    identity: { ...identity, outcome: 'exact' },
    identitySignals: [
      { type: 'mineru_title_model', value: 'RF610ADUQSX4:page:1' },
      { type: 'official_support_api_model', value: `RF610ADUQSX4:${discoveryHash}:${discoveryProvenance.discoveryUrl}` },
    ],
    discoveryProvenance,
  });

  assert.throws(() => createVerificationReceipt(input, identity, {
    verifiedAt: '2026-07-16T05:00:00.000Z',
  }), /discovery artifact bytes required/i);
  input.verificationReceipt = createVerificationReceipt(input, identity, {
    verifiedAt: '2026-07-16T05:00:00.000Z',
    discoveryArtifactBytes: discoveryBytes,
  });
  assert.equal(verifyVerificationReceipt(input, identity, {
    asOf: input.verificationReceipt.verifiedAt,
    discoveryArtifactBytes: discoveryBytes,
  }), true);
  assert.throws(() => normalizeOfficialArtifactDiscoveryProvenance({
    ...discoveryProvenance,
    discoveryObjectPath: undefined,
  }, { brand: identity.brand, model: identity.model, artifactUrl }), /object path/i);
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

  assert.deepEqual(input.verificationReceipt, {
    schemaVersion: 2,
    policyVersion: '2026-07-12.2',
    manufacturerPolicyVersion: '2026-07-16.1',
    verifiedAt: '2026-07-11T14:35:00.000Z',
    bindingSha256: '141e648500f9f7feb487eef01dd895fc10b6c629a61e6e037316763bf8e8b31f',
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

test('receipt schema v3 binds claim semantics v2 without invalidating schema v2 replay', () => {
  const input = source({
    claims: [{
      field: 'closedEnvelope.widthMm',
      value: { kind: 'fixed', mm: 913 },
      sourceLabel: 'Total width (mm)',
      sourceAxisOrder: ['width'],
      sourceUnit: 'mm',
      measurementScope: 'product_closed_external',
      includesDoor: null,
      includesHandle: null,
      page: null,
      fragmentSha256: null,
      bbox: null,
    }],
  });
  input.verificationReceipt = createVerificationReceipt(input, caseIdentity, {
    verifiedAt: '2026-07-11T14:35:00.000Z',
    claimSemanticsVersion: 2,
  });
  assert.equal(input.verificationReceipt.schemaVersion, 3);
  assert.equal(input.verificationReceipt.claimSemanticsVersion, 2);
  assert.equal(verifyVerificationReceipt(input, caseIdentity, {
    asOf: input.verificationReceipt.verifiedAt,
  }), true);
  assert.throws(() => verifyVerificationReceipt({
    ...input,
    claims: [{ ...input.claims[0], measurementScope: 'package' }],
  }, caseIdentity, { asOf: input.verificationReceipt.verifiedAt }), /scope|receipt/i);
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
