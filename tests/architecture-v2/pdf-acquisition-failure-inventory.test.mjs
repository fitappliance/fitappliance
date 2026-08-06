import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPdfAcquisitionFailureInventory,
  PDF_ACQUISITION_FAILURE_MECHANISMS,
} from '../../src/domain/pdf-acquisition-failure-inventory.mjs';

const SHA = 'ab'.repeat(32);

function sample(overrides = {}) {
  return {
    sampleId: 'pdf_baseline_fixture',
    category: 'dishwasher',
    brand: 'Esatto',
    model: 'DW42CS',
    representedTargetCount: 1,
    lifecycleState: 'CURRENT_RETAIL',
    priorityClass: 'P0_CURRENT_MISSING_DIMENSIONS',
    sourceHost: 'www.appliancesonline.com.au',
    publicationEligible: false,
    acquisition: { status: 'official_candidate_not_found' },
    ...overrides,
  };
}

function outcome(resolverId, candidates = [], required = true) {
  return {
    resolverId,
    result: {
      resolverId,
      required,
      completion: 'complete',
      candidates,
      failures: [],
    },
  };
}

function candidate(overrides = {}) {
  return {
    sourceUrl: 'https://www.appliancesonline.com.au/reference.pdf',
    authorityMode: 'reference',
    sourceRole: 'retailer_reference',
    discoveryMethod: 'reference_mirror_seed',
    sourceModelHint: 'DW42CS',
    ...overrides,
  };
}

function attempt(sampleId, status, overrides = {}) {
  return { sampleId, status, ...overrides };
}

function build(samples, attempts) {
  return buildPdfAcquisitionFailureInventory({
    wp7aReport: { schemaVersion: 1, baselineId: 'wp7a', samples },
    checkpoint: { schemaVersion: 1, attempts },
    contactMatrix: {
      schemaVersion: 1,
      organizations: [{
        id: 'residentia-group',
        organization: 'Residentia Group',
        coveredBrands: ['Esatto', 'InAlto'],
      }],
    },
    sourceBindings: {
      wp7aReportSha256: SHA,
      checkpointSha256: SHA,
      checkpointPolicySha256: SHA,
      manufacturerStrategySha256: SHA,
      manufacturerSourcePolicySha256: SHA,
      contactMatrixSha256: SHA,
    },
  });
}

test('failure inventory assigns exactly one typed mechanism and never changes publication state', () => {
  const rows = [
    sample({ sampleId: 'route', brand: 'Ilve', model: 'IVFSD60' }),
    sample({ sampleId: 'candidate', model: 'EDWI605S' }),
    sample({ sampleId: 'artifact', brand: 'Samsung', model: 'DW60H6050FW' }),
    sample({ sampleId: 'transport', model: 'EBF69W', acquisition: { status: 'transport_failed' } }),
    sample({ sampleId: 'identity', brand: 'ASKO', model: 'W4104C.W', acquisition: { status: 'identity_unproven' } }),
  ];
  const attempts = [
    attempt('route', 'official_candidate_not_found', {
      resolverOutcomes: [outcome('architecture-v2-core-official-discovery', [candidate()])],
    }),
    attempt('candidate', 'official_candidate_not_found', {
      resolverOutcomes: [
        outcome('architecture-v2-core-official-discovery', [candidate()]),
        outcome('esatto-official-discovery', []),
      ],
    }),
    attempt('artifact', 'official_candidate_not_found', {
      resolverOutcomes: [
        outcome('architecture-v2-core-official-discovery', [candidate()]),
        outcome('samsung-official-discovery', [candidate({
          sourceUrl: 'https://www.samsung.com/au/product/dw60h6050fwsa/',
          authorityMode: 'official',
          sourceRole: 'manufacturer_product_page',
          discoveryMethod: 'samsung_legacy_finder',
        })]),
      ],
    }),
    attempt('transport', 'transport_failed', {
      transportErrors: [{ sourceUrl: 'https://esatto.house/s/EBF69W.pdf', reason: 'redirect escaped official brand hosts or lacks provenance' }],
    }),
    attempt('identity', 'identity_unproven', {
      resolverOutcomes: [outcome('asko-official-manuals-api', [candidate({
        sourceUrl: 'https://asko.hgecdn.net/W4104C.W.AU.pdf',
        authorityMode: 'official',
        sourceRole: 'manufacturer_document',
        sourceModelHint: 'W4104C.W.AU',
      })])],
    }),
  ];

  const inventory = build(rows, attempts);

  assert.deepEqual(inventory.records.map(({ primaryMechanism }) => primaryMechanism), [
    'OFFICIAL_ROUTE_ABSENT',
    'OFFICIAL_CANDIDATE_ABSENT',
    'OFFICIAL_ARTIFACT_ABSENT',
    'OFFICIAL_TRANSPORT_FAILED',
    'EXACT_MODEL_IDENTITY_UNPROVEN',
  ]);
  assert.equal(inventory.summary.totalFailures, 5);
  assert.equal(inventory.summary.publicationEligible, 0);
  assert.equal(inventory.summary.byMechanism.SOURCE_CONTENT_ERROR, 0);
  assert.ok(inventory.records.every((entry) => entry.publicationEligible === false));
  assert.deepEqual(Object.keys(inventory.summary.byMechanism), PDF_ACQUISITION_FAILURE_MECHANISMS);
});

test('inventory groups by organization, host, category and resolver contract and ranks represented targets', () => {
  const rows = [
    sample({ sampleId: 'a', model: 'A', representedTargetCount: 7 }),
    sample({ sampleId: 'b', model: 'B', representedTargetCount: 2, sourceHost: 'esatto.house' }),
    sample({ sampleId: 'c', brand: 'Unknown Brand', model: 'C', representedTargetCount: 3 }),
  ];
  const attempts = [
    attempt('a', 'official_candidate_not_found', { resolverOutcomes: [outcome('esatto-official-discovery')] }),
    attempt('b', 'official_candidate_not_found', { resolverOutcomes: [outcome('esatto-official-discovery')] }),
    attempt('c', 'official_candidate_not_found', { resolverOutcomes: [outcome('architecture-v2-core-official-discovery')] }),
  ];

  const inventory = build(rows, attempts);

  assert.deepEqual(inventory.recoveryRanking[0], {
    mechanism: 'OFFICIAL_CANDIDATE_ABSENT',
    samples: 2,
    representedTargets: 9,
  });
  assert.deepEqual(inventory.groups.byOrganization[0], {
    key: 'residentia-group',
    label: 'Residentia Group',
    mapping: 'contact_matrix',
    samples: 2,
    representedTargets: 9,
  });
  assert.equal(inventory.records[2].organization.mapping, 'brand_fallback');
  assert.deepEqual(inventory.groups.byResolverContract.map(({ key }) => key), [
    'architecture-v2-core-official-discovery',
    'esatto-official-discovery',
  ]);
});

test('inventory separates five archived fixtures and caps diverse current canaries at seven', () => {
  const archivedModels = ['RHDW45PS', 'EDW6014X', 'EDWI605S', 'RHSD7W', 'EBF69W'];
  const archived = archivedModels.map((model, index) => sample({
    sampleId: `archived-${index}`,
    model,
    lifecycleState: 'CATALOG_ARCHIVED',
    priorityClass: 'P3_HISTORICAL_CONFIRMATION',
  }));
  const current = Array.from({ length: 9 }, (_, index) => sample({
    sampleId: `current-${index}`,
    brand: `Brand ${index}`,
    model: `CURRENT-${index}`,
  }));
  const rows = [...archived, ...current];
  const attempts = rows.map((row) => attempt(row.sampleId, 'official_candidate_not_found', {
    resolverOutcomes: [outcome(`${row.brand.toLowerCase().replaceAll(' ', '-')}-official-discovery`)],
  }));

  const inventory = build(rows, attempts);

  assert.deepEqual(inventory.historicalFixtures.map((row) => row.model), archivedModels);
  assert.equal(inventory.currentCanaries.length, 7);
  assert.ok(inventory.currentCanaries.every((row) => row.lifecycleState === 'CURRENT_RETAIL'));
  assert.equal(new Set(inventory.currentCanaries.map((row) => row.brand)).size, 7);
  assert.equal(inventory.currentRetailDenominator.records, 9);
});

test('inventory fails closed on missing, duplicate or unsupported attempt state', () => {
  const row = sample();
  assert.throws(() => build([row], []), /one attempt per failure sample/i);
  assert.throws(() => build([row], [attempt(row.sampleId, 'indexed')]), /unsupported failure status/i);
  assert.throws(() => build([row], [
    attempt(row.sampleId, 'transport_failed'),
    attempt(row.sampleId, 'transport_failed'),
  ]), /duplicate attempt/i);
});
