import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { loadActiveRetailRelease } from '../../src/domain/active-retail-release.mjs';
import {
  buildFitV4UniverseReconciliation,
  isReplacementCandidateEligible,
} from '../../src/domain/fit-v4-universe-reconciliation.mjs';
import { historicalReferenceIdFor } from '../../src/domain/historical-appliance-reference.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);

function documentSha256(document) {
  return createHash('sha256').update(`${JSON.stringify(document, null, 2)}\n`).digest('hex');
}

function releaseBinding({
  catalogDocument = { products: [] },
  historicalReferenceDocument = { records: [] },
} = {}) {
  return {
    releaseCandidateId: 'retail_lifecycle_release_aaaaaaaaaaaaaaaaaaaaaaaa',
    activatedAt: '2026-08-01T00:00:00.000Z',
    catalogSha256: documentSha256(catalogDocument),
    historicalReferenceSha256: documentSha256(historicalReferenceDocument),
  };
}

function currentProduct(overrides = {}) {
  const canonicalProductId = overrides.canonicalProductId ?? 'fa_prod_current';
  return {
    id: 'catalog-current',
    cat: 'fridge',
    brand: 'Example',
    model: 'EX-1',
    w: 600,
    h: 1700,
    d: 650,
    canonicalProductId,
    lifecycleVisibility: 'CURRENT_OUTPUT',
    unavailable: false,
    retailers: [{ url: 'https://retailer.example/product/ex-1' }],
    retailLifecycle: {
      lifecycleState: 'CURRENT_RETAIL',
      canonicalProductId,
      authorizingObservation: {
        canonicalProductId,
        availability: 'available',
        listingState: 'current',
        freshnessState: 'FRESH',
        rawSourceSha256: C,
      },
    },
    ...overrides,
  };
}

function modelReceipt({ missingAxis = null } = {}) {
  const fields = Object.fromEntries(['width', 'height', 'depth']
    .filter((axis) => axis !== missingAxis)
    .map((axis) => [axis, { locatorKind: 'PDF_FRAGMENT', page: 1, fragmentSha256: D }]));
  return {
    targetId: 'target-ex-1',
    sourceUrl: 'https://manufacturer.example/ex-1.pdf',
    contentSha256: C,
    receiptBindingSha256: D,
    verifiedAt: '2026-07-31T00:00:00.000Z',
    fields,
  };
}

function historicalRecord(overrides = {}) {
  const category = overrides.category ?? 'fridge';
  const brand = overrides.brand ?? 'Example';
  const model = overrides.model ?? 'EX-1';
  return {
    schemaVersion: 1,
    referenceId: historicalReferenceIdFor(category, brand, model),
    category,
    brand,
    model,
    brandKey: 'EXAMPLE',
    modelKey: 'EX1',
    lookupAction: 'AUTO_FILL',
    evidenceState: 'MODEL_RECEIPT',
    dimensionsMm: { width: 600, height: 1700, depth: 650 },
    reasonCodes: [],
    sources: [{ sourceId: 'historical-recovery:target-ex-1', snapshotSha256: C, sourceLines: [1] }],
    modelReceipts: [modelReceipt()],
    ...overrides,
  };
}

function rightsDisposition(overrides = {}) {
  return {
    disposition: 'ALLOWED',
    referenceId: historicalReferenceIdFor('fridge', 'Example', 'EX-1'),
    category: 'fridge',
    registryBrandKey: 'EXAMPLE',
    registryModelKey: 'EX1',
    useActions: ['replacement_lookup', 'public_display'],
    validFrom: '2026-07-01T00:00:00.000Z',
    validUntil: '2027-07-01T00:00:00.000Z',
    withdrawnAt: null,
    axisBindings: Object.fromEntries(['width', 'height', 'depth'].map((axis) => [axis, {
      contentSha256: C,
      receiptBindingSha256: D,
      sourceSnapshotSha256: C,
    }])),
    ...overrides,
  };
}

function fixture({ catalogProducts, historicalRecords, mappings = [], rights = [] } = {}) {
  const catalogDocument = {
    schema_version: 2,
    last_updated: '2026-07-31T00:00:00.000Z',
    products: catalogProducts ?? [currentProduct()],
  };
  const historicalReferenceDocument = {
    schemaVersion: 1,
    generatedAt: '2026-07-31T00:00:00.000Z',
    records: historicalRecords ?? [historicalRecord()],
  };
  return {
    releaseBinding: releaseBinding({ catalogDocument, historicalReferenceDocument }),
    catalogDocument,
    historicalReferenceDocument,
    explicitMappings: mappings,
    rightsDispositions: rights,
  };
}

test('rejects reused or implicitly typed universe inputs', () => {
  const input = fixture();
  assert.throws(() => buildFitV4UniverseReconciliation({
    ...input,
    historicalReferenceDocument: input.catalogDocument,
  }), /separate immutable universes/i);
  assert.throws(() => buildFitV4UniverseReconciliation({
    ...input,
    historicalReferenceDocument: { records: input.catalogDocument.products },
  }), /separate immutable universes/i);
  assert.throws(() => buildFitV4UniverseReconciliation({
    ...input,
    catalogDocument: { products: input.historicalReferenceDocument.records },
  }), /separate immutable universes|catalog.*role/i);
});

test('rejects source documents whose bytes do not match the active release binding', () => {
  const input = fixture();
  const tamperedCatalog = structuredClone(input.catalogDocument);
  tamperedCatalog.products[0].w += 1;
  assert.throws(() => buildFitV4UniverseReconciliation({
    ...input,
    catalogDocument: tamperedCatalog,
  }), /catalog.*hash drift/i);

  const tamperedReference = structuredClone(input.historicalReferenceDocument);
  tamperedReference.records[0].dimensionsMm.width += 1;
  assert.throws(() => buildFitV4UniverseReconciliation({
    ...input,
    historicalReferenceDocument: tamperedReference,
  }), /historical.*hash drift/i);
});

test('rejects duplicate exact identities even when they have no cross-universe match', () => {
  const first = historicalRecord({ model: 'OLD-1' });
  const duplicate = { ...first };
  assert.throws(() => buildFitV4UniverseReconciliation(fixture({
    catalogProducts: [currentProduct()],
    historicalRecords: [first, duplicate],
  })), /ambiguous historical.*identity/i);
});

test('reconciles each source row once without mutation and is deterministic', () => {
  const input = fixture({ rights: [rightsDisposition()] });
  const before = structuredClone(input);
  const first = buildFitV4UniverseReconciliation(input);
  const second = buildFitV4UniverseReconciliation(input);
  assert.deepEqual(input, before);
  assert.deepEqual(first, second);
  assert.equal(first.catalogRows.length, 1);
  assert.equal(first.historicalRows.length, 1);
  assert.equal(first.catalogRows[0].sourceOrdinal, 0);
  assert.equal(first.historicalRows[0].sourceOrdinal, 0);
  assert.equal(first.mappings[0].disposition, 'EXACT_SAME_MODEL');
  assert.equal(first.historicalRows[0].declaredLookupAction, 'AUTO_FILL');
  assert.equal(first.historicalRows[0].effectiveLookupAction, 'AUTO_FILL');
  assert.match(first.semanticSha256, /^[a-f0-9]{64}$/);
});

test('validates explicit non-inheriting mappings and rejects ambiguous input', () => {
  const catalog = currentProduct({ id: 'catalog-sibling', model: 'EX-2' });
  const reference = historicalRecord();
  const mapping = {
    catalogProductId: catalog.id,
    historicalReferenceId: reference.referenceId,
    category: 'fridge',
    catalogRegistryBrandKey: 'EXAMPLE',
    catalogRegistryModelKey: 'EX2',
    historicalRegistryBrandKey: 'EXAMPLE',
    historicalRegistryModelKey: 'EX1',
    disposition: 'SIBLING_ONLY',
  };
  const result = buildFitV4UniverseReconciliation(fixture({
    catalogProducts: [catalog],
    historicalRecords: [reference],
    mappings: [mapping],
    rights: [rightsDisposition()],
  }));
  assert.equal(result.mappings[0].disposition, 'SIBLING_ONLY');
  assert.equal(result.historicalRows[0].effectiveLookupAction, 'QUARANTINED');
  assert.ok(result.historicalRows[0].reasonCodes.includes('NON_EXACT_MODEL_MAPPING'));

  assert.throws(() => buildFitV4UniverseReconciliation(fixture({
    catalogProducts: [catalog], historicalRecords: [reference], mappings: [mapping, mapping],
  })), /duplicate.*mapping/i);
  assert.throws(() => buildFitV4UniverseReconciliation(fixture({
    catalogProducts: [catalog], historicalRecords: [reference],
    mappings: [{ ...mapping, catalogRegistryModelKey: 'WRONG' }],
  })), /mapping scope/i);
  assert.throws(() => buildFitV4UniverseReconciliation(fixture({
    mappings: [{ ...mapping, catalogProductId: 'catalog-current', catalogRegistryModelKey: 'EX1' }],
  })), /exact same model.*explicit/i);
});

test('effective lookup action fails closed for receipts, dimensions and rights', () => {
  const missingRights = buildFitV4UniverseReconciliation(fixture()).historicalRows[0];
  assert.equal(missingRights.effectiveLookupAction, 'CONFIRM_REQUIRED');
  assert.ok(missingRights.reasonCodes.includes('RIGHTS_DISPOSITION_MISSING'));

  const missingAxis = historicalRecord({ modelReceipts: [modelReceipt({ missingAxis: 'depth' })] });
  const missingAxisRow = buildFitV4UniverseReconciliation(fixture({
    historicalRecords: [missingAxis], rights: [rightsDisposition()],
  })).historicalRows[0];
  assert.equal(missingAxisRow.effectiveLookupAction, 'MEASURE_REQUIRED');
  assert.ok(missingAxisRow.reasonCodes.includes('RECEIPT_AXIS_MISSING'));

  const incomplete = historicalRecord({ dimensionsMm: { width: 600, height: 1700 } });
  assert.equal(buildFitV4UniverseReconciliation(fixture({
    historicalRecords: [incomplete], rights: [rightsDisposition()],
  })).historicalRows[0].effectiveLookupAction, 'MEASURE_REQUIRED');

  const invalidAxis = historicalRecord({ dimensionsMm: { width: 600, height: 1700, depth: -1 } });
  assert.equal(buildFitV4UniverseReconciliation(fixture({
    historicalRecords: [invalidAxis], rights: [rightsDisposition()],
  })).historicalRows[0].effectiveLookupAction, 'QUARANTINED');

  const unprovenScope = historicalRecord({ evidenceState: 'REGISTRY_CONSISTENT' });
  assert.equal(buildFitV4UniverseReconciliation(fixture({
    historicalRecords: [unprovenScope], rights: [rightsDisposition()],
  })).historicalRows[0].effectiveLookupAction, 'CONFIRM_REQUIRED');

  const quarantined = historicalRecord({ lookupAction: 'QUARANTINED', evidenceState: 'INTERNAL_CONFLICT' });
  assert.equal(buildFitV4UniverseReconciliation(fixture({
    historicalRecords: [quarantined], rights: [rightsDisposition()],
  })).historicalRows[0].effectiveLookupAction, 'QUARANTINED');
});

test('wrong, expired or withdrawn rights never authorize AUTO_FILL', () => {
  const cases = [
    rightsDisposition({ registryModelKey: 'WRONG' }),
    rightsDisposition({ axisBindings: { ...rightsDisposition().axisBindings, depth: {
      contentSha256: A, receiptBindingSha256: D, sourceSnapshotSha256: A,
    } } }),
    rightsDisposition({ validUntil: '2026-07-15T00:00:00.000Z' }),
    rightsDisposition({ withdrawnAt: '2026-07-20T00:00:00.000Z' }),
  ];
  for (const rights of cases) {
    const row = buildFitV4UniverseReconciliation(fixture({ rights: [rights] })).historicalRows[0];
    assert.notEqual(row.effectiveLookupAction, 'AUTO_FILL');
    assert.ok(row.reasonCodes.some((reason) => reason.startsWith('RIGHTS_')));
  }
  assert.throws(() => buildFitV4UniverseReconciliation(fixture({ rights: [true] })), /rights disposition/i);
});

test('replacement candidates require exact active catalog membership and authoritative lifecycle', () => {
  const valid = currentProduct();
  const document = { products: [valid] };
  const binding = releaseBinding({ catalogDocument: document });
  assert.equal(isReplacementCandidateEligible({
    candidate: valid, catalogDocument: document, releaseBinding: binding,
  }).eligible, true);

  const fake = currentProduct({ id: 'fake' });
  assert.equal(isReplacementCandidateEligible({
    candidate: fake, catalogDocument: document, releaseBinding: binding,
  }).eligible, false);

  const forgedDocument = { products: [fake] };
  const forged = isReplacementCandidateEligible({
    candidate: fake, catalogDocument: forgedDocument, releaseBinding: binding,
  });
  assert.equal(forged.eligible, false);
  assert.ok(forged.reasonCodes.includes('CATALOG_RELEASE_HASH_MISMATCH'));

  const urlOnly = { ...currentProduct(), retailLifecycle: null };
  const urlOnlyDocument = { products: [urlOnly] };
  assert.equal(isReplacementCandidateEligible({
    candidate: urlOnly,
    catalogDocument: urlOnlyDocument,
    releaseBinding: releaseBinding({ catalogDocument: urlOnlyDocument }),
  }).eligible, false);

  const noCanonicalId = currentProduct({ canonicalProductId: '' });
  const noCanonicalDocument = { products: [noCanonicalId] };
  assert.equal(isReplacementCandidateEligible({
    candidate: noCanonicalId,
    catalogDocument: noCanonicalDocument,
    releaseBinding: releaseBinding({ catalogDocument: noCanonicalDocument }),
  }).eligible, false);

  for (const lifecycleVisibility of ['HISTORICAL_INPUT_ONLY', 'MARKET_REFERENCE_ONLY']) {
    const row = currentProduct({ lifecycleVisibility });
    const rowDocument = { products: [row] };
    assert.equal(isReplacementCandidateEligible({
      candidate: row,
      catalogDocument: rowDocument,
      releaseBinding: releaseBinding({ catalogDocument: rowDocument }),
    }).eligible, false);
  }
});

test('rejects incomplete or future-dated exact receipts before rights evaluation', () => {
  const invalidPageReceipt = modelReceipt();
  invalidPageReceipt.fields.width.page = 0;
  const invalidPage = historicalRecord({ modelReceipts: [invalidPageReceipt] });
  const invalidPageRow = buildFitV4UniverseReconciliation(fixture({
    historicalRecords: [invalidPage], rights: [rightsDisposition()],
  })).historicalRows[0];
  assert.equal(invalidPageRow.effectiveLookupAction, 'MEASURE_REQUIRED');

  const futureReceipt = modelReceipt();
  futureReceipt.verifiedAt = '2026-08-02T00:00:00.000Z';
  const future = historicalRecord({ modelReceipts: [futureReceipt] });
  const futureRow = buildFitV4UniverseReconciliation(fixture({
    historicalRecords: [future], rights: [rightsDisposition()],
  })).historicalRows[0];
  assert.equal(futureRow.effectiveLookupAction, 'MEASURE_REQUIRED');
});

test('source stays isolated from Fit and cavity logic', () => {
  const sources = [
    readFileSync('src/domain/fit-v4-universe-reconciliation.mjs', 'utf8'),
    readFileSync('scripts/architecture-v2/build-fit-v4-universe-reconciliation.mjs', 'utf8'),
  ].join('\n');
  assert.doesNotMatch(sources, /from ['"][^'"]*(?:fit-decision|fit-engine)/i);
  assert.doesNotMatch(sources, /\b(?:FitDecision|FitEngine|evaluateFit|requiredCavity|clearance|cavity)\b/);
});

test('real active release reconciles exact populations with empty rights', async () => {
  const active = await loadActiveRetailRelease();
  const result = buildFitV4UniverseReconciliation({
    releaseBinding: {
      releaseCandidateId: active.descriptor.releaseCandidateId,
      activatedAt: active.descriptor.activatedAt,
      catalogSha256: active.descriptor.artifacts.publicProjection.sha256,
      historicalReferenceSha256: active.descriptor.artifacts.historicalReference.sha256,
    },
    catalogDocument: active.catalog,
    historicalReferenceDocument: active.reference,
    explicitMappings: [],
    rightsDispositions: [],
  });
  assert.deepEqual(result.summary, {
    catalogRecords: 3513,
    historicalReferenceRecords: 8087,
    catalogRowsReconciled: 3513,
    historicalRowsReconciled: 8087,
    exactSameModelMappings: 3510,
    explicitNonExactMappings: 0,
    noMappingHistorical: 4577,
    catalogOnly: 3,
    replacementCandidatesEligible: 349,
    effectiveAutoFill: 0,
  });
  assert.equal(result.catalogRows.filter((row) => row.replacementCandidateEligible).length, 349);
});
