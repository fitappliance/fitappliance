import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { reconstructRetailerListingFacts } from '../../scripts/architecture-v2/build-retailer-identity-resolutions.mjs';

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function source({ id, retailer, sourceType }) {
  return {
    id,
    retailer,
    sourceType,
    expectedCadenceHours: 24,
    maximumCurrentAgeHours: 72,
  };
}

test('reconstructs AO and Partnerize mismatch facts only from hash-bound raw objects', async () => {
  const aoPayload = Buffer.from(JSON.stringify({
    productId: 101,
    sku: 'RECEIVED-AO',
    title: 'AO received product',
    uri: '/product/received-ao',
    price: 799,
    available: false,
  }));
  const tggUrl = 'https://www.thegoodguys.com.au/received-tgg';
  const partnerizeUrl = `https://prf.hn/click/camref:abc/destination:${encodeURIComponent(tggUrl)}`;
  const tggPayload = Buffer.from([
    'Category|SKU/Unique Identifier|URL|PriceSale|Price|Stock|ModelNumber|Title|Brand|Description',
    `Fridges & Freezers > Refrigerators|RECEIVED-TGG|${partnerizeUrl}|999|1099|yes|5001|TGG received product|LG|`,
  ].join('\n'));
  const aoHash = digest(aoPayload);
  const tggHash = digest(tggPayload);
  const resolutionItems = [{
    resolutionTasks: [{
      quarantinedSources: [{
        baselineLinkId: 'retail_link_aaaaaaaaaaaaaaaaaaaaaaaa',
        retailer: 'Appliances Online',
        url: 'https://www.appliancesonline.com.au/product/received-ao/',
        reasonCode: 'AO_MODEL_MISMATCH',
        receivedModel: 'RECEIVED-AO',
        rawSourceSha256: aoHash,
      }, {
        baselineLinkId: 'retail_link_bbbbbbbbbbbbbbbbbbbbbbbb',
        retailer: 'The Good Guys',
        url: tggUrl,
        reasonCode: 'PARTNERIZE_RETAILER_PRODUCT_IDENTITY_MISMATCH',
        receivedModel: 'RECEIVED-TGG',
        rawSourceSha256: tggHash,
      }],
    }],
  }];
  const retailerLedger = {
    collectionAttempts: [{
      adapterId: 'appliances-online-product-api-v1',
      retailer: 'Appliances Online',
      observedAt: '2026-07-20T17:00:00.000Z',
      rawSourceReference: `retailer-object:sha256:${aoHash}`,
      rawPayloadSha256: aoHash,
      policyVersion: 'retailer-source-policy-v2:appliances-online-product-api-v1',
      failureContext: { baselineLinkId: 'retail_link_aaaaaaaaaaaaaaaaaaaaaaaa' },
    }, {
      adapterId: 'the-good-guys-partnerize-feed-v1',
      retailer: 'The Good Guys',
      observedAt: '2026-07-20T18:00:00.000Z',
      rawSourceReference: `retailer-object:sha256:${tggHash}`,
      rawPayloadSha256: tggHash,
      policyVersion: 'retailer-source-policy-v2:the-good-guys-partnerize-feed-v1',
      listingReconciliations: [{ baselineLinkId: 'retail_link_bbbbbbbbbbbbbbbbbbbbbbbb' }],
    }],
  };
  const sourcePolicy = {
    sources: [
      source({ id: 'appliances-online-product-api-v1', retailer: 'Appliances Online', sourceType: 'public_retailer_api' }),
      source({ id: 'the-good-guys-partnerize-feed-v1', retailer: 'The Good Guys', sourceType: 'affiliate_feed' }),
    ],
  };
  const payloads = new Map([[aoHash, aoPayload], [tggHash, tggPayload]]);

  const facts = await reconstructRetailerListingFacts({
    resolutionItems,
    retailerLedger,
    sourcePolicy,
    readRawObject: async (hash) => payloads.get(hash),
  });

  assert.equal(facts.length, 2);
  assert.deepEqual(facts.map((fact) => fact.baselineLinkId), [
    'retail_link_aaaaaaaaaaaaaaaaaaaaaaaa',
    'retail_link_bbbbbbbbbbbbbbbbbbbbbbbb',
  ]);
  assert.deepEqual(
    facts.map(({ receivedModel, availability, listingState, retailerProductId }) => ({
      receivedModel, availability, listingState, retailerProductId,
    })),
    [
      { receivedModel: 'RECEIVED-AO', availability: 'unavailable', listingState: 'unavailable', retailerProductId: '101' },
      { receivedModel: 'RECEIVED-TGG', availability: 'available', listingState: 'current', retailerProductId: '5001' },
    ],
  );
});

test('rejects raw object hash drift before parsing a listing fact', async () => {
  const expectedHash = digest('expected');
  await assert.rejects(() => reconstructRetailerListingFacts({
    resolutionItems: [{ resolutionTasks: [{ quarantinedSources: [{
      baselineLinkId: 'retail_link_aaaaaaaaaaaaaaaaaaaaaaaa',
      retailer: 'Appliances Online',
      url: 'https://www.appliancesonline.com.au/product/model',
      reasonCode: 'AO_MODEL_MISMATCH',
      receivedModel: 'MODEL',
      rawSourceSha256: expectedHash,
    }] }] }],
    retailerLedger: { collectionAttempts: [{
      adapterId: 'appliances-online-product-api-v1',
      retailer: 'Appliances Online',
      observedAt: '2026-07-20T17:00:00.000Z',
      rawSourceReference: `retailer-object:sha256:${expectedHash}`,
      rawPayloadSha256: expectedHash,
      policyVersion: 'retailer-source-policy-v2:appliances-online-product-api-v1',
      failureContext: { baselineLinkId: 'retail_link_aaaaaaaaaaaaaaaaaaaaaaaa' },
    }] },
    sourcePolicy: { sources: [source({
      id: 'appliances-online-product-api-v1',
      retailer: 'Appliances Online',
      sourceType: 'public_retailer_api',
    })] },
    readRawObject: async () => Buffer.from('drifted'),
  }), /raw object hash mismatch/i);
});
