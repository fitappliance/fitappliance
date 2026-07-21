import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildOfficialMarketLifecycle,
  validateOfficialMarketLifecycle,
} from '../../src/domain/official-market-lifecycle.mjs';

const SHA = (character) => character.repeat(64);
const AS_OF = '2026-07-21T12:00:00.000Z';

function canonicalSha256(value) {
  const canonical = (item) => {
    if (Array.isArray(item)) return item.map(canonical);
    if (item && typeof item === 'object') {
      return Object.fromEntries(Object.keys(item).sort().map((key) => [key, canonical(item[key])]));
    }
    return item;
  };
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function finalizeOfficialManifest(value) {
  const document = structuredClone(value);
  delete document.manifestId;
  delete document.semanticSha256;
  const semantic = canonicalSha256(document);
  document.manifestId = `official_identity_evidence_${semantic.slice(0, 24)}`;
  document.semanticSha256 = semantic;
  return document;
}

function projection() {
  return {
    products: [
      { id: 'active', canonicalProductId: 'p-active', cat: 'fridge', brand: 'LG', model: 'GS-B655PL' },
      { id: 'mixed', canonicalProductId: 'p-mixed', cat: 'fridge', brand: 'Bosch', model: 'KFI96AXEAA' },
      { id: 'identity', canonicalProductId: 'p-identity', cat: 'dishwasher', brand: 'Bosch', model: 'SMU8ZCS01A' },
      { id: 'inactive', canonicalProductId: 'p-inactive', cat: 'washing_machine', brand: 'Bosch', model: 'WAN24126AU' },
      { id: 'polluted', canonicalProductId: 'p-polluted', cat: 'fridge', brand: 'Fisher & Paykel', model: 'RF730QZUVX1 French Door 726L' },
    ],
  };
}

function referenceRecord({ id, category, brand, model, market, sourceLine }) {
  return {
    referenceId: id,
    category,
    brand,
    model,
    registryMarketState: market,
    sources: market === 'NO_REGISTRY' ? [{
      sourceId: 'fitappliance:catalog', snapshotSha256: SHA('c'), sourceLines: [],
    }] : [{
      sourceId: `energy-rating:${category}`,
      snapshotSha256: SHA('d'),
      sourceLines: [sourceLine],
    }],
  };
}

function historicalReference() {
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-12T12:40:00.000Z',
    records: [
      referenceRecord({ id: 'r-active', category: 'fridge', brand: 'LG', model: 'GS-B655PL', market: 'ACTIVE_AU', sourceLine: 383 }),
      referenceRecord({ id: 'r-mixed', category: 'fridge', brand: 'Bosch', model: 'KFI96AXEAA', market: 'MIXED_AU', sourceLine: 2238 }),
      referenceRecord({ id: 'r-identity', category: 'dishwasher', brand: 'Bosch', model: 'SMU8ZCS01A', market: 'NO_REGISTRY' }),
      referenceRecord({ id: 'r-inactive', category: 'washing_machine', brand: 'Bosch', model: 'WAN24126AU', market: 'NO_REGISTRY' }),
      referenceRecord({ id: 'r-polluted', category: 'fridge', brand: 'Fisher & Paykel', model: 'RF730QZUVX1 French Door 726L', market: 'NO_REGISTRY' }),
    ],
  };
}

function officialManifest() {
  const base = {
    schemaVersion: 2,
    policyVersion: 'retailer-identity-official-evidence-v2',
    acquiredAt: '2026-07-21T11:00:00.000Z',
    seedDocumentSemanticSha256: SHA('e'),
    records: [{
      evidenceId: 'official_bosch_kfi96axeaa',
      evidenceKind: 'OFFICIAL_PRODUCT_PAGE',
      identity: { category: 'fridge', brand: 'Bosch', model: 'KFI96AXEAA' },
      source: {
        sourceUrl: 'https://www.bosch-home.com.au/en/product/KFI96AXEAA',
        finalUrl: 'https://www.bosch-home.com.au/en/product/KFI96AXEAA',
        redirectChain: [], transport: 'fetch', acquiredAt: '2026-07-21T11:00:00.000Z',
      },
      rawArtifact: {
        contentSha256: SHA('f'),
        objectPath: `evidence/web/sha256/ff/ff/${SHA('f')}.html`,
        byteSize: 100,
        mediaType: 'text/html',
      },
      identityLocators: [{
        kind: 'json_ld_product_model', path: '$.mpn', value: 'KFI96AXEAA', fragmentSha256: SHA('1'),
      }],
      marketSignal: {
        status: 'AVAILABLE',
        locators: [{
          kind: 'json_ld_offer_availability',
          path: '$.offers.availability',
          value: 'https://schema.org/InStock',
          fragmentSha256: SHA('2'),
        }],
      },
    }, {
      evidenceId: 'official_bosch_smu8zcs01a',
      evidenceKind: 'OFFICIAL_PRODUCT_PAGE',
      identity: { category: 'dishwasher', brand: 'Bosch', model: 'SMU8ZCS01A' },
      source: {
        sourceUrl: 'https://www.bosch-home.com.au/en/product/SMU8ZCS01A',
        finalUrl: 'https://www.bosch-home.com.au/en/product/SMU8ZCS01A',
        redirectChain: [], transport: 'fetch', acquiredAt: '2026-07-21T11:00:00.000Z',
      },
      rawArtifact: {
        contentSha256: SHA('3'),
        objectPath: `evidence/web/sha256/33/33/${SHA('3')}.html`,
        byteSize: 100,
        mediaType: 'text/html',
      },
      identityLocators: [{
        kind: 'json_ld_product_model', path: '$.mpn', value: 'SMU8ZCS01A', fragmentSha256: SHA('4'),
      }],
      marketSignal: { status: 'UNKNOWN', locators: [] },
    }, {
      evidenceId: 'official_bosch_wan24126au',
      evidenceKind: 'OFFICIAL_PRODUCT_PAGE',
      identity: { category: 'washing_machine', brand: 'Bosch', model: 'WAN24126AU' },
      source: {
        sourceUrl: 'https://www.bosch-home.com.au/en/mkt-product/WAN24126AU',
        finalUrl: 'https://www.bosch-home.com.au/en/mkt-product/WAN24126AU',
        redirectChain: [], transport: 'fetch', acquiredAt: '2026-07-21T11:00:00.000Z',
      },
      rawArtifact: {
        contentSha256: SHA('5'),
        objectPath: `evidence/web/sha256/55/55/${SHA('5')}.html`,
        byteSize: 100,
        mediaType: 'text/html',
      },
      identityLocators: [{
        kind: 'json_ld_product_model', path: '$.mpn', value: 'WAN24126AU', fragmentSha256: SHA('6'),
      }],
      marketSignal: {
        status: 'UNAVAILABLE',
        locators: [{
          kind: 'json_ld_offer_availability', path: '$.offers.availability',
          value: 'https://schema.org/OutOfStock', fragmentSha256: SHA('7'),
        }],
      },
    }],
  };
  base.summary = {
    records: 3,
    byEvidenceKind: { OFFICIAL_PRODUCT_PAGE: 3 },
    byMarketSignal: { AVAILABLE: 1, UNAVAILABLE: 1, UNKNOWN: 1 },
  };
  return finalizeOfficialManifest(base);
}

function build() {
  return buildOfficialMarketLifecycle({
    publicProjection: projection(),
    publicProjectionSha256: SHA('8'),
    historicalReference: historicalReference(),
    historicalReferenceSha256: SHA('9'),
    officialIdentityEvidence: officialManifest(),
    officialIdentityEvidenceSha256: SHA('a'),
    asOf: AS_OF,
  });
}

function finalizeOfficialMarket(value) {
  const document = structuredClone(value);
  delete document.projectionId;
  delete document.semanticSha256;
  const semantic = canonicalSha256(document);
  document.projectionId = `official_market_lifecycle_${semantic.slice(0, 24)}`;
  document.semanticSha256 = semantic;
  return document;
}

test('keeps registry, official identity, official availability, and unresolved identity as separate states', () => {
  const result = build();
  assert.doesNotThrow(() => validateOfficialMarketLifecycle(result));
  const byId = new Map(result.records.map((record) => [record.canonicalProductId, record]));
  assert.equal(byId.get('p-active').marketState, 'ACTIVE_AU_REGISTERED');
  assert.equal(byId.get('p-mixed').marketState, 'ACTIVE_AU_OFFICIAL');
  assert.equal(byId.get('p-identity').marketState, 'IDENTITY_AU_OFFICIAL');
  assert.equal(byId.get('p-inactive').marketState, 'IDENTITY_AU_OFFICIAL');
  assert.equal(byId.get('p-inactive').officialOfferAvailability, 'UNAVAILABLE');
  assert.equal(byId.get('p-polluted').marketState, 'UNKNOWN_AU');
});

test('official market evidence never creates retail availability, price, Fit, or dimensions', () => {
  for (const record of build().records) {
    assert.equal('retailLifecycle' in record, false);
    assert.equal('retailers' in record, false);
    assert.equal('price' in record, false);
    assert.equal('fit' in record, false);
    assert.equal('dimensionsMm' in record, false);
  }
});

test('rejects stale official evidence and exact-identity collisions', () => {
  const stale = officialManifest();
  stale.acquiredAt = '2026-07-11T11:00:00.000Z';
  stale.records = stale.records.map((record) => ({
    ...record,
    source: { ...record.source, acquiredAt: stale.acquiredAt },
  }));
  const finalizedStale = finalizeOfficialManifest(stale);
  assert.throws(() => buildOfficialMarketLifecycle({
    publicProjection: projection(), publicProjectionSha256: SHA('8'),
    historicalReference: historicalReference(), historicalReferenceSha256: SHA('9'),
    officialIdentityEvidence: finalizedStale, officialIdentityEvidenceSha256: SHA('a'), asOf: AS_OF,
  }), /stale|precede/i);

  const duplicate = historicalReference();
  duplicate.records.push({ ...duplicate.records[0], referenceId: 'duplicate' });
  assert.throws(() => buildOfficialMarketLifecycle({
    publicProjection: projection(), publicProjectionSha256: SHA('8'),
    historicalReference: duplicate, historicalReferenceSha256: SHA('9'),
    officialIdentityEvidence: officialManifest(), officialIdentityEvidenceSha256: SHA('a'), asOf: AS_OF,
  }), /duplicate|multiple.*exact/i);
});

test('validation requires every upstream source binding even after re-signing', () => {
  const missing = structuredClone(build());
  delete missing.sourceBindings.historicalReferenceSha256;
  assert.throws(
    () => validateOfficialMarketLifecycle(finalizeOfficialMarket(missing)),
    /historical reference.*SHA-256/i,
  );
});

test('tracked official market projections bind the exact repository source bytes', () => {
  const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url));
  const parse = (path) => JSON.parse(read(path));
  const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const historicalPath = 'data/architecture-v2/generated/historical-appliance-reference.json';
  const officialPath = 'data/architecture-v2/generated/retailer-identity-official-evidence.json';
  const historical = parse(historicalPath);
  const official = parse(officialPath);
  for (const [projectionPath, publicPath] of [
    [
      'data/architecture-v2/generated/official-market-lifecycle.json',
      'data/architecture-v2/generated/public-catalog-projection.json',
    ],
    [
      'data/architecture-v2/generated/official-market-lifecycle-migration-candidate.json',
      'data/architecture-v2/generated/public-catalog-projection-migration-candidate.json',
    ],
  ]) {
    const projection = validateOfficialMarketLifecycle(parse(projectionPath));
    const publicProjection = parse(publicPath);
    assert.equal(projection.sourceBindings.publicProjectionSha256, sha256(read(publicPath)));
    assert.equal(projection.sourceBindings.publicProjectionSemanticSha256, canonicalSha256(publicProjection));
    assert.equal(projection.sourceBindings.historicalReferenceSha256, sha256(read(historicalPath)));
    assert.equal(projection.sourceBindings.historicalReferenceSemanticSha256, canonicalSha256(historical));
    assert.equal(projection.sourceBindings.officialIdentityEvidenceSha256, sha256(read(officialPath)));
    assert.equal(projection.sourceBindings.officialIdentityEvidenceSemanticSha256, official.semanticSha256);
  }
});
