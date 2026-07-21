import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  buildRetailerIdentityResolution,
  validateRetailerIdentityResolution,
} from '../../src/domain/retailer-identity-resolution.mjs';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function resignResolution(value) {
  const document = structuredClone(value);
  delete document.resolutionId;
  delete document.semanticSha256;
  const semantic = digest(document);
  document.resolutionId = `retailer_identity_resolution_${semantic.slice(0, 24)}`;
  document.semanticSha256 = semantic;
  return document;
}

function signInventory(items) {
  const document = {
    schemaVersion: 2,
    policyVersion: 'retail-lifecycle-refresh-inventory-v2',
    releaseEpoch: 'fixture',
    asOf: '2026-07-21T00:00:00.000Z',
    sourceBindings: { shadowSha256: 'a'.repeat(64) },
    items: items.sort((left, right) => left.canonicalProductId.localeCompare(right.canonicalProductId)),
  };
  const countBy = (values, selector) => Object.fromEntries(Object.entries(values.reduce((result, item) => {
    const key = selector(item);
    result[key] = (result[key] ?? 0) + 1;
    return result;
  }, {})).sort(([left], [right]) => left.localeCompare(right)));
  document.summary = {
    products: document.items.length,
    listings: document.items.reduce((sum, item) => sum + item.sourceTasks.length, 0),
    byExecutionDisposition: countBy(document.items, (item) => item.executionDisposition),
    bySourceExecutionState: countBy(document.items.flatMap((item) => item.sourceTasks), (item) => item.executionState),
    resolutionTasks: document.items.reduce((sum, item) => sum + item.resolutionTasks.length, 0),
    byResolutionExecutionState: countBy(
      document.items.flatMap((item) => item.resolutionTasks),
      (item) => item.executionState,
    ),
  };
  const semantic = digest(document);
  document.inventoryId = `retail_lifecycle_refresh_${semantic.slice(0, 24)}`;
  document.semanticSha256 = semantic;
  return document;
}

function item({ id, legacyId, category = 'fridge', brand, model, receivedModels }) {
  const sources = receivedModels.map((receivedModel, index) => ({
    baselineLinkId: `retail_link_${digest({ id, index, receivedModel }).slice(0, 24)}`,
    retailer: index ? 'The Good Guys' : 'Appliances Online',
    url: `https://${index ? 'www.thegoodguys.com.au' : 'www.appliancesonline.com.au'}/product/${receivedModel.toLowerCase()}`,
    reasonCode: index ? 'PARTNERIZE_RETAILER_PRODUCT_IDENTITY_MISMATCH' : 'AO_MODEL_MISMATCH',
    receivedModel,
    rawSourceSha256: digest({ id, index, receivedModel, kind: 'raw-source' }),
  }));
  const resolutionTaskId = `retail_resolution_${digest({ canonicalProductId: id, quarantinedBaselineLinkIds: sources.map((row) => row.baselineLinkId) }).slice(0, 24)}`;
  return {
    canonicalProductId: id,
    legacyRuntimeId: legacyId,
    category,
    brand,
    model,
    lifecycleState: 'UNKNOWN_RETAIL',
    executionDisposition: 'REQUIRES_EXACT_MODEL_REDISCOVERY',
    sourceTasks: [],
    resolutionTasks: [{
      resolutionTaskId,
      kind: 'EXACT_MODEL_RETAIL_REDISCOVERY',
      action: 'DISCOVER_EXACT_MODEL_RETAIL_SOURCE',
      executionState: 'REQUIRES_DISCOVERY_PIPELINE',
      expectedIdentity: { category, brand, model },
      quarantinedBaselineLinkIds: sources.map((row) => row.baselineLinkId),
      quarantinedSources: sources,
    }],
  };
}

function registry({ sourceId, category, brand, model, registration = model }) {
  return {
    activeInAustralia: true,
    sourceId,
    snapshotSha256: sourceId.charCodeAt(0).toString(16).padStart(2, '0').repeat(32),
    sourceLine: 2,
    rowFingerprint: digest({ sourceId, category, brand, model }),
    category,
    identity: {
      brandCanonical: brand,
      modelRaw: model,
      registrationNumber: registration,
    },
  };
}

function official({
  evidenceId,
  evidenceKind = 'OFFICIAL_PRODUCT_PAGE',
  category = 'fridge',
  brand,
  model,
}) {
  const rawSha256 = digest({ evidenceId, kind: 'official-raw' });
  const manifestSemanticSha256 = 'e'.repeat(64);
  const locator = evidenceKind === 'OFFICIAL_PRODUCT_PAGE'
    ? {
      kind: 'product_analytics_model',
      path: 'script[0].ELECTROLUX.GA4.product_model_id',
      value: model,
      fragmentSha256: digest({ evidenceId, model, kind: 'html-locator' }),
    }
    : {
      kind: 'mineru_exact_model_fragment', page: 1, fragmentIndex: 0, fragmentType: 'paragraph',
      fragmentSha256: digest({ evidenceId, model, kind: 'pdf-fragment' }),
      textSha256: digest({ evidenceId, model, kind: 'pdf-text' }),
      textExcerpt: `Applicable model ${model}`,
    };
  return {
    evidenceKind,
    evidenceId,
    sourceId: `official-manufacturer:${evidenceId}`,
    category,
    brand,
    model,
    sourceUrl: `https://www.${brand.toLowerCase().replace(/[^a-z0-9]+/g, '')}.com.au/products/${model.toLowerCase()}`,
    finalUrl: `https://www.${brand.toLowerCase().replace(/[^a-z0-9]+/g, '')}.com.au/products/${model.toLowerCase()}`,
    observedAt: '2026-07-20T12:00:00.000Z',
    rawSha256,
    rawObjectPath: `evidence/web/sha256/${rawSha256.slice(0, 2)}/${rawSha256.slice(2, 4)}/${rawSha256}.${evidenceKind === 'OFFICIAL_PDF_MINERU' ? 'pdf' : 'html'}`,
    identityLocators: [locator],
    ...(evidenceKind === 'OFFICIAL_PDF_MINERU' ? {
      derivedArtifact: {
        schemaVersion: 1,
        format: 'content_list_v2',
        parserName: 'MinerU',
        parserVersion: '3.4.4',
        modelRevision: 'ed6b654c018d742e65a17671e379c5e6ecc87ec9',
        sourcePdfSha256: rawSha256,
        contentSha256: digest({ evidenceId, kind: 'mineru-json' }),
        objectPath: `evidence/derived/mineru-json/sha256/${digest({ evidenceId, kind: 'mineru-json' }).slice(0, 2)}/${digest({ evidenceId, kind: 'mineru-json' }).slice(2, 4)}/${digest({ evidenceId, kind: 'mineru-json' })}.json`,
        byteSize: 123,
        pageCount: 1,
      },
    } : {}),
    manifestSemanticSha256,
  };
}

function fact(source, overrides = {}) {
  return {
    baselineLinkId: source.baselineLinkId,
    adapterId: source.retailer === 'The Good Guys'
      ? 'the-good-guys-partnerize-feed-v1'
      : 'appliances-online-product-api-v1',
    retailer: source.retailer,
    sourceType: source.retailer === 'The Good Guys' ? 'affiliate_feed' : 'public_retailer_api',
    policyVersion: 'retailer-source-v2:fixture',
    expectedCadenceHours: 24,
    maximumCurrentAgeHours: 168,
    observedAt: '2026-07-20T00:00:00.000Z',
    rawSourceReference: `retailer-object:sha256:${source.rawSourceSha256}`,
    rawSourceSha256: source.rawSourceSha256,
    receivedModel: source.receivedModel,
    receivedUrl: source.url,
    availability: 'available',
    listingState: 'current',
    priceAud: 999,
    title: source.receivedModel,
    imageUrl: null,
    retailerProductId: '123',
    ...overrides,
  };
}

function buildFixture({ items, products, observations, officialEvidence = [], facts = null }) {
  const inventory = signInventory(items);
  return buildRetailerIdentityResolution({
    refreshInventory: inventory,
    publicProjection: {
      schemaVersion: 1,
      semanticSha256: 'f'.repeat(64),
      products,
    },
    registryObservations: observations,
    officialIdentityEvidence: officialEvidence,
    officialIdentityEvidenceManifestSemanticSha256: officialEvidence.length ? 'e'.repeat(64) : null,
    listingFacts: facts ?? items.flatMap((entry) => entry.resolutionTasks[0].quarantinedSources.map(fact)),
    generatedAt: '2026-07-21T00:00:00.000Z',
  });
}

test('official manufacturer identity evidence closes exact sibling and dirty duplicate cases without granting field evidence', () => {
  const sibling = item({
    id: 'fa_prod_111111111111111111111111', legacyId: 'westinghouse-base', brand: 'Westinghouse',
    model: 'WBE4302WC', receivedModels: ['WBE4302ACR'],
  });
  const dirty = item({
    id: 'fa_prod_222222222222222222222222', legacyId: 'haier-dirty', brand: 'Haier',
    model: 'HRF520BHS French Door 520L', receivedModels: ['HRF520BHS'],
  });
  const exactDestination = {
    canonicalProductId: 'fa_prod_333333333333333333333333', id: 'haier-exact', cat: 'fridge',
    brand: 'Haier', model: 'HRF520BHS',
  };
  const resolution = buildFixture({
    items: [sibling, dirty],
    products: [
      { canonicalProductId: sibling.canonicalProductId, id: sibling.legacyRuntimeId, cat: 'fridge', brand: sibling.brand, model: sibling.model },
      { canonicalProductId: dirty.canonicalProductId, id: dirty.legacyRuntimeId, cat: 'fridge', brand: dirty.brand, model: dirty.model },
      exactDestination,
    ],
    observations: [registry({ sourceId: 'f', category: 'fridge', brand: 'Westinghouse', model: 'WBE4302WC' })],
    officialEvidence: [
      official({ evidenceId: 'westinghouse_wbe4302ac_r', brand: 'Westinghouse', model: 'WBE4302AC-R' }),
      official({ evidenceId: 'haier_hrf520bhs', evidenceKind: 'OFFICIAL_PDF_MINERU', brand: 'Haier', model: 'HRF520BHS' }),
    ],
  });
  const byProduct = new Map(resolution.cases.map((entry) => [entry.canonicalProductId, entry]));
  assert.equal(byProduct.get(sibling.canonicalProductId).decision.action, 'KEEP_CANONICAL_IDENTITY');
  assert.equal(byProduct.get(sibling.canonicalProductId).decision.linkDispositions[0].action, 'INVALIDATE_WRONG_IDENTITY');
  assert.equal(byProduct.get(dirty.canonicalProductId).decision.action, 'MERGE_DUPLICATE_CANONICAL');
  assert.equal(byProduct.get(dirty.canonicalProductId).decision.targetCanonicalProductId, exactDestination.canonicalProductId);
  assert.ok(resolution.cases.every((entry) => !('dimensions' in entry.officialEvidence)));
});

test('official manufacturer evidence cannot replace the two-registry-source prefix correction rule', () => {
  const prefix = item({
    id: 'fa_prod_444444444444444444444444', legacyId: 'prefix', category: 'washtower_combo',
    brand: 'LG', model: '1910FGX', receivedModels: ['WWT-1910FGX'],
  });
  const resolution = buildFixture({
    items: [prefix],
    products: [{ canonicalProductId: prefix.canonicalProductId, id: 'prefix', cat: 'washtower_combo', brand: 'LG', model: '1910FGX' }],
    observations: [registry({ sourceId: 'w', category: 'washing_machine', brand: 'LG', model: 'WWT-1910FGX' })],
    officialEvidence: [official({
      evidenceId: 'lg_wwt_1910fgx', category: 'washtower_combo', brand: 'LG', model: 'WWT-1910FGX',
    })],
  });
  assert.equal(resolution.cases[0].decision.status, 'UNRESOLVED');
});

test('classifies strict prefix correction, dirty duplicate merge, and exact sibling invalidation', () => {
  const prefix = item({
    id: 'fa_prod_aaaaaaaaaaaaaaaaaaaaaaaa',
    legacyId: 'lg-prefix',
    category: 'washtower_combo',
    brand: 'LG',
    model: '1910FGX',
    receivedModels: ['WWT-1910FGX'],
  });
  const dirty = item({
    id: 'fa_prod_bbbbbbbbbbbbbbbbbbbbbbbb',
    legacyId: 'dirty',
    brand: 'Haier',
    model: 'HRF520BHS French Door 520L',
    receivedModels: ['HRF520BHS'],
  });
  const sibling = item({
    id: 'fa_prod_cccccccccccccccccccccccc',
    legacyId: 'sibling',
    brand: 'Westinghouse',
    model: 'WSE6640SA',
    receivedModels: ['WSE6640BA'],
  });
  const target = {
    canonicalProductId: 'fa_prod_dddddddddddddddddddddddd',
    id: 'target',
    cat: 'fridge',
    brand: 'Haier',
    model: 'HRF520BHS',
  };
  const resolution = buildFixture({
    items: [prefix, dirty, sibling],
    products: [
      { canonicalProductId: prefix.canonicalProductId, id: prefix.legacyRuntimeId, cat: prefix.category, brand: prefix.brand, model: prefix.model },
      { canonicalProductId: dirty.canonicalProductId, id: dirty.legacyRuntimeId, cat: dirty.category, brand: dirty.brand, model: dirty.model },
      { canonicalProductId: sibling.canonicalProductId, id: sibling.legacyRuntimeId, cat: sibling.category, brand: sibling.brand, model: sibling.model },
      target,
    ],
    observations: [
      registry({ sourceId: 'w', category: 'washing_machine', brand: 'LG', model: 'WWT-1910FGX' }),
      registry({ sourceId: 'd', category: 'dryer', brand: 'LG', model: 'WWT-1910FGX' }),
      registry({ sourceId: 'f', category: 'fridge', brand: 'Haier', model: 'HRF520BHS' }),
      registry({ sourceId: 'f', category: 'fridge', brand: 'Westinghouse', model: 'WSE6640SA', registration: 'same' }),
      registry({ sourceId: 'f', category: 'fridge', brand: 'Westinghouse', model: 'WSE6640BA', registration: 'same' }),
    ],
  });

  const byProduct = new Map(resolution.cases.map((entry) => [entry.canonicalProductId, entry]));
  assert.equal(byProduct.get(prefix.canonicalProductId).decision.action, 'CORRECT_CANONICAL_MODEL');
  assert.equal(byProduct.get(dirty.canonicalProductId).decision.action, 'MERGE_DUPLICATE_CANONICAL');
  assert.equal(byProduct.get(sibling.canonicalProductId).decision.action, 'KEEP_CANONICAL_IDENTITY');
  assert.equal(byProduct.get(prefix.canonicalProductId).decision.correctedModel, 'WWT-1910FGX');
  assert.equal(byProduct.get(dirty.canonicalProductId).decision.targetCanonicalProductId, target.canonicalProductId);
  assert.equal(
    byProduct.get(sibling.canonicalProductId).decision.linkDispositions[0].action,
    'INVALIDATE_WRONG_IDENTITY',
  );
  assert.equal(validateRetailerIdentityResolution(resolution), resolution);
});

test('quarantines rather than merges a polluted identity that conflicts with one exact destination', () => {
  const dirty = item({
    id: 'fa_prod_bbbbbbbbbbbbbbbbbbbbbbbb',
    legacyId: 'dirty-conflicting-model',
    brand: 'Fisher & Paykel',
    model: 'RF730QZUVX1 French Door 726L',
    receivedModels: ['RF730QZUVB1'],
  });
  const target = {
    canonicalProductId: 'fa_prod_dddddddddddddddddddddddd',
    id: 'target',
    cat: 'fridge',
    brand: 'Fisher & Paykel',
    model: 'RF730QZUVB1',
  };
  const resolution = buildFixture({
    items: [dirty],
    products: [
      {
        canonicalProductId: dirty.canonicalProductId,
        id: dirty.legacyRuntimeId,
        cat: dirty.category,
        brand: dirty.brand,
        model: dirty.model,
      },
      target,
    ],
    observations: [registry({
      sourceId: 'f',
      category: 'fridge',
      brand: 'Fisher & Paykel',
      model: 'RF730QZUVB1',
    })],
  });

  assert.equal(resolution.cases[0].decision.status, 'RESOLVED');
  assert.equal(resolution.cases[0].decision.action, 'QUARANTINE_UNSUPPORTED_CANONICAL');
  assert.equal(resolution.cases[0].decision.targetCanonicalProductId, target.canonicalProductId);
  assert.deepEqual(
    resolution.cases[0].decision.reasonCodes,
    ['UNSUPPORTED_POLLUTED_CANONICAL_WITH_ONE_EXACT_RECEIVED_DESTINATION'],
  );
  assert.ok(resolution.cases[0].decision.linkDispositions.every((row) => (
    row.action === 'REASSIGN_TO_EXISTING_CANONICAL'
    && row.destinationCanonicalProductId === target.canonicalProductId
  )));
});

test('keeps a conflicting polluted identity unresolved without one exact canonical destination', () => {
  const dirty = item({
    id: 'fa_prod_eeeeeeeeeeeeeeeeeeeeeeee',
    legacyId: 'dirty-no-destination',
    brand: 'Fisher & Paykel',
    model: 'RF730QZUVX1 French Door 726L',
    receivedModels: ['RF730QZUVB1'],
  });
  const resolution = buildFixture({
    items: [dirty],
    products: [{
      canonicalProductId: dirty.canonicalProductId,
      id: dirty.legacyRuntimeId,
      cat: dirty.category,
      brand: dirty.brand,
      model: dirty.model,
    }],
    observations: [registry({
      sourceId: 'f', category: 'fridge', brand: 'Fisher & Paykel', model: 'RF730QZUVB1',
    })],
  });
  assert.equal(resolution.cases[0].decision.status, 'UNRESOLVED');
  assert.deepEqual(
    resolution.cases[0].decision.reasonCodes,
    ['POLLUTED_IDENTITY_EMBEDDED_MODEL_CONFLICTS_WITH_RECEIVED_MODEL'],
  );
});

test('shared registration and dimensions do not turn distinct exact models into availability aliases', () => {
  const sibling = item({
    id: 'fa_prod_cccccccccccccccccccccccc', legacyId: 'sibling', brand: 'CHIQ',
    model: 'CTM202NW', receivedModels: ['CTM202NW3'],
  });
  const resolution = buildFixture({
    items: [sibling],
    products: [{ canonicalProductId: sibling.canonicalProductId, id: 'sibling', cat: 'fridge', brand: 'CHIQ', model: 'CTM202NW' }],
    observations: [
      registry({ sourceId: 'f', category: 'fridge', brand: 'CHIQ', model: 'CTM202NW', registration: 'same' }),
      registry({ sourceId: 'f', category: 'fridge', brand: 'CHIQ', model: 'CTM202NW3', registration: 'same' }),
    ],
  });
  assert.equal(resolution.cases[0].decision.action, 'KEEP_CANONICAL_IDENTITY');
  assert.equal(resolution.cases[0].decision.linkDispositions[0].action, 'INVALIDATE_WRONG_IDENTITY');
});

test('fails closed on one-source prefix evidence, incomplete received-model proof, and raw binding drift', () => {
  const prefix = item({
    id: 'fa_prod_aaaaaaaaaaaaaaaaaaaaaaaa', legacyId: 'prefix', category: 'washtower_combo',
    brand: 'LG', model: '1910FGX', receivedModels: ['WWT-1910FGX'],
  });
  const oneSource = buildFixture({
    items: [prefix],
    products: [{ canonicalProductId: prefix.canonicalProductId, id: 'prefix', cat: 'washtower_combo', brand: 'LG', model: '1910FGX' }],
    observations: [registry({ sourceId: 'w', category: 'washing_machine', brand: 'LG', model: 'WWT-1910FGX' })],
  });
  assert.equal(oneSource.cases[0].decision.status, 'UNRESOLVED');

  const conflict = item({
    id: 'fa_prod_bbbbbbbbbbbbbbbbbbbbbbbb', legacyId: 'conflict', brand: 'LG',
    model: 'GF-B505BB', receivedModels: ['GF-B505PL', 'GF-B505MBL'],
  });
  const conflicted = buildFixture({
    items: [conflict],
    products: [{ canonicalProductId: conflict.canonicalProductId, id: 'conflict', cat: 'fridge', brand: 'LG', model: 'GF-B505BB' }],
    observations: [
      registry({ sourceId: 'f', category: 'fridge', brand: 'LG', model: 'GF-B505BB' }),
      registry({ sourceId: 'f', category: 'fridge', brand: 'LG', model: 'GF-B505PL' }),
      registry({ sourceId: 'f', category: 'fridge', brand: 'LG', model: 'GF-B505MBL' }),
    ],
  });
  assert.equal(conflicted.cases[0].decision.action, 'KEEP_CANONICAL_IDENTITY');
  assert.ok(conflicted.cases[0].decision.linkDispositions.every((row) => (
    row.action === 'INVALIDATE_WRONG_IDENTITY'
  )));

  const partial = buildFixture({
    items: [conflict],
    products: [{ canonicalProductId: conflict.canonicalProductId, id: 'conflict', cat: 'fridge', brand: 'LG', model: 'GF-B505BB' }],
    observations: [
      registry({ sourceId: 'f', category: 'fridge', brand: 'LG', model: 'GF-B505BB' }),
      registry({ sourceId: 'f', category: 'fridge', brand: 'LG', model: 'GF-B505PL' }),
    ],
  });
  assert.equal(partial.cases[0].decision.status, 'UNRESOLVED');

  const source = prefix.resolutionTasks[0].quarantinedSources[0];
  assert.throws(() => buildFixture({
    items: [prefix],
    products: [{ canonicalProductId: prefix.canonicalProductId, id: 'prefix', cat: 'washtower_combo', brand: 'LG', model: '1910FGX' }],
    observations: [
      registry({ sourceId: 'w', category: 'washing_machine', brand: 'LG', model: 'WWT-1910FGX' }),
      registry({ sourceId: 'd', category: 'dryer', brand: 'LG', model: 'WWT-1910FGX' }),
    ],
    facts: [fact(source, { rawSourceSha256: '9'.repeat(64) })],
  }), /raw source mismatch/i);
});

test('does not resolve an identity without every immutable listing fact', () => {
  const prefix = item({
    id: 'fa_prod_aaaaaaaaaaaaaaaaaaaaaaaa', legacyId: 'prefix', category: 'washtower_combo',
    brand: 'LG', model: '1910FGX', receivedModels: ['WWT-1910FGX'],
  });
  const resolution = buildFixture({
    items: [prefix],
    products: [{ canonicalProductId: prefix.canonicalProductId, id: 'prefix', cat: 'washtower_combo', brand: 'LG', model: '1910FGX' }],
    observations: [
      registry({ sourceId: 'w', category: 'washing_machine', brand: 'LG', model: 'WWT-1910FGX' }),
      registry({ sourceId: 'd', category: 'dryer', brand: 'LG', model: 'WWT-1910FGX' }),
    ],
    facts: [],
  });
  assert.equal(resolution.cases[0].decision.status, 'UNRESOLVED');
  assert.deepEqual(resolution.cases[0].decision.reasonCodes, ['IMMUTABLE_LISTING_FACT_NOT_BOUND']);
});

test('validator rejects internally signed but semantically inconsistent resolutions', () => {
  const dirty = item({
    id: 'fa_prod_bbbbbbbbbbbbbbbbbbbbbbbb', legacyId: 'dirty', brand: 'Haier',
    model: 'HRF520BHS French Door 520L', receivedModels: ['HRF520BHS'],
  });
  const target = {
    canonicalProductId: 'fa_prod_dddddddddddddddddddddddd',
    id: 'target',
    cat: 'fridge',
    brand: 'Haier',
    model: 'HRF520BHS',
  };
  const resolution = buildFixture({
    items: [dirty],
    products: [
      { canonicalProductId: dirty.canonicalProductId, id: 'dirty', cat: 'fridge', brand: 'Haier', model: dirty.model },
      target,
    ],
    observations: [registry({ sourceId: 'f', category: 'fridge', brand: 'Haier', model: 'HRF520BHS' })],
  });

  const selfMerge = structuredClone(resolution);
  selfMerge.cases[0].decision.targetCanonicalProductId = dirty.canonicalProductId;
  assert.throws(() => validateRetailerIdentityResolution(resignResolution(selfMerge)), /merge destination/i);

  const staleRegistryBinding = structuredClone(resolution);
  staleRegistryBinding.sourceBindings.registrySnapshots.f = '0'.repeat(64);
  assert.throws(
    () => validateRetailerIdentityResolution(resignResolution(staleRegistryBinding)),
    /registry snapshot binding/i,
  );
});
