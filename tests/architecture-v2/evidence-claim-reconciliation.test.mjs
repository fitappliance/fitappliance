import test from 'node:test';
import assert from 'node:assert/strict';

import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';
import { reconcileEvidenceClaims } from '../../src/domain/evidence-claim-reconciliation.mjs';

const IDENTITY = Object.freeze({ brand: 'Westinghouse', model: 'WHE6874BA', category: 'fridge' });
const INVENTORY_SHA = '9'.repeat(64);

function claim(field, mm, overrides = {}) {
  const axis = field.endsWith('widthMm') ? 'width' : field.endsWith('heightMm') ? 'height' : 'depth';
  return {
    field,
    value: { kind: 'fixed', mm },
    sourceLabel: `${axis} ${mm} mm`,
    sourceAxisOrder: [axis],
    sourceUnit: 'mm',
    measurementScope: 'product_closed_external',
    includesDoor: null,
    includesHandle: null,
    page: null,
    fragmentSha256: null,
    bbox: null,
    ...overrides,
  };
}

function source(hash, dimensions, overrides = {}) {
  const url = overrides.finalUrl ?? `https://www.westinghouse.com.au/manuals/${hash.slice(0, 8)}.pdf`;
  return {
    authority: 'manufacturer',
    sourceType: 'official_exact_model_pdf',
    sourceUrl: url,
    finalUrl: url,
    contentSha256: hash,
    supersedesContentSha256: [],
    identity: { ...IDENTITY, outcome: 'exact' },
    claims: [
      claim('closedEnvelope.widthMm', dimensions.widthMm),
      claim('closedEnvelope.heightMm', dimensions.heightMm),
      claim('closedEnvelope.depthMm', dimensions.depthMm),
    ],
    verificationReceipt: { bindingSha256: hash },
    ...overrides,
  };
}

function inventory(sources, overrides = {}) {
  return {
    schemaVersion: 1,
    targetId: 'target-westinghouse-whe6874ba',
    identity: { ...IDENTITY },
    completionStatus: 'complete',
    incompleteResolvers: [],
    missingBatchCandidateJobIds: [],
    resolvers: [],
    activeReceiptSources: [],
    candidates: sources.map((candidateSource, index) => ({
      candidateId: `candidate-${index}`,
      sourceUrl: candidateSource.sourceUrl,
      authorityMode: 'official',
      sourceRole: 'manufacturer_document',
      requiredAttempt: true,
      batchJobIds: [],
      resolverRefs: [],
      outcome: { status: 'accepted', failureCode: null, source: candidateSource },
    })),
    candidateInventorySha256: INVENTORY_SHA,
    ...overrides,
  };
}

const verifyReceipt = () => true;

test('same-hash official outcomes deduplicate to one accepted source', () => {
  const dimensions = { widthMm: 913, heightMm: 1782, depthMm: 803 };
  const first = source('a'.repeat(64), dimensions);
  const second = structuredClone(first);
  second.sourceUrl = 'https://www.westinghouse.com.au/cdn/copy.pdf';
  second.finalUrl = second.sourceUrl;
  const result = reconcileEvidenceClaims(IDENTITY, inventory([first, second]), { verifyReceipt });

  assert.equal(result.status, 'accepted');
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].contentSha256, 'a'.repeat(64));
});

test('conflicting active exact official sources are quarantined', () => {
  const first = source('a'.repeat(64), { widthMm: 913, heightMm: 1782, depthMm: 803 });
  const second = source('b'.repeat(64), { widthMm: 913, heightMm: 1782, depthMm: 723 });
  const result = reconcileEvidenceClaims(IDENTITY, inventory([first, second]), { verifyReceipt });

  assert.equal(result.status, 'conflict_quarantined');
  assert.equal(result.failureCode, 'conflict');
  assert.deepEqual(result.conflictingFields, ['closedEnvelope.depthMm']);
  assert.equal(result.sources.length, 2);
});

test('same-resource attested supersession removes an older conflicting source', () => {
  const url = 'https://www.westinghouse.com.au/manuals/WHE6874BA.pdf';
  const oldSource = source('a'.repeat(64), { widthMm: 913, heightMm: 1782, depthMm: 723 }, { finalUrl: url });
  const currentSource = source('b'.repeat(64), { widthMm: 913, heightMm: 1782, depthMm: 803 }, {
    finalUrl: `${url}?revision=2`,
    supersedesContentSha256: [oldSource.contentSha256],
  });
  const result = reconcileEvidenceClaims(IDENTITY, inventory([oldSource, currentSource]), { verifyReceipt });

  assert.equal(result.status, 'accepted');
  assert.deepEqual(result.sources.map((entry) => entry.contentSha256), [currentSource.contentSha256]);
});

test('cross-resource supersession claim cannot suppress a conflicting official source', () => {
  const oldSource = source('a'.repeat(64), { widthMm: 913, heightMm: 1782, depthMm: 723 });
  const currentSource = source('b'.repeat(64), { widthMm: 913, heightMm: 1782, depthMm: 803 }, {
    supersedesContentSha256: [oldSource.contentSha256],
  });
  const result = reconcileEvidenceClaims(IDENTITY, inventory([oldSource, currentSource]), { verifyReceipt });

  assert.equal(result.status, 'conflict_quarantined');
});

test('one exact official source with explicit axis labels resolves an exact registry permutation', () => {
  const accepted = source('a'.repeat(64), { widthMm: 913, heightMm: 1782, depthMm: 803 });
  const result = reconcileEvidenceClaims(IDENTITY, inventory([accepted]), {
    verifyReceipt,
    lowerAuthorityHints: [{
      sourceRole: 'registry_hint',
      sourceId: 'energy-rating',
      dimensionsMm: { widthMm: 1782, heightMm: 913, depthMm: 803 },
    }],
  });

  assert.equal(result.status, 'accepted');
  assert.equal(result.conflictHints[0].kind, 'axis_permutation');
  assert.equal(result.axisPermutationResolution, 'exact_official_axis_proof');
});

test('one official source with no coherent axis representation cannot resolve a registry permutation', () => {
  const accepted = source('a'.repeat(64), { widthMm: 913, heightMm: 1782, depthMm: 803 });
  accepted.claims = accepted.claims.map((claim) => ({
    ...claim,
    sourceAxisOrder: claim.field.endsWith('widthMm')
      ? ['width', 'depth']
      : claim.field.endsWith('heightMm') ? ['height', 'depth'] : ['depth', 'width'],
  }));
  const result = reconcileEvidenceClaims(IDENTITY, inventory([accepted]), {
    verifyReceipt,
    lowerAuthorityHints: [{
      sourceRole: 'registry_hint',
      sourceId: 'energy-rating',
      dimensionsMm: { widthMm: 1782, heightMm: 913, depthMm: 803 },
    }],
  });

  assert.equal(result.status, 'conflict_quarantined');
  assert.equal(result.axisPermutationResolution, undefined);
});

test('independent official axis representations can resolve a registry permutation', () => {
  const dimensions = { widthMm: 913, heightMm: 1782, depthMm: 803 };
  const individuallyLabelled = source('a'.repeat(64), dimensions);
  const matrixBound = source('b'.repeat(64), dimensions);
  matrixBound.claims = matrixBound.claims.map((value) => ({
    ...value,
    sourceLabel: `Product ${value.sourceAxisOrder[0]}`,
    sourceAxisOrder: ['height', 'width', 'depth'],
  }));
  const result = reconcileEvidenceClaims(IDENTITY, inventory([individuallyLabelled, matrixBound]), {
    verifyReceipt,
    lowerAuthorityHints: [{
      sourceRole: 'registry_hint',
      sourceId: 'energy-rating',
      dimensionsMm: { widthMm: 1782, heightMm: 913, depthMm: 803 },
    }],
  });

  assert.equal(result.status, 'accepted');
  assert.equal(result.sources.length, 2);
  assert.equal(result.conflictHints[0].kind, 'axis_permutation');
  assert.equal(result.axisPermutationResolution, 'independent_official_axis_corroboration');
});

test('two official documents using the same explicit axis representation retain exact axis proof', () => {
  const dimensions = { widthMm: 913, heightMm: 1782, depthMm: 803 };
  const first = source('a'.repeat(64), dimensions);
  const second = source('b'.repeat(64), dimensions);
  const result = reconcileEvidenceClaims(IDENTITY, inventory([first, second]), {
    verifyReceipt,
    lowerAuthorityHints: [{
      sourceRole: 'registry_hint',
      sourceId: 'energy-rating',
      dimensionsMm: { widthMm: 1782, heightMm: 913, depthMm: 803 },
    }],
  });

  assert.equal(result.status, 'accepted');
  assert.equal(result.axisPermutationResolution, 'exact_official_axis_proof');
});

test('partial official documents cannot be combined to resolve a registry permutation', () => {
  const dimensions = { widthMm: 913, heightMm: 1782, depthMm: 803 };
  const first = source('a'.repeat(64), dimensions);
  first.claims = first.claims.slice(0, 2);
  const second = source('b'.repeat(64), dimensions);
  second.claims = second.claims.map((value) => ({
    ...value,
    sourceLabel: `Product ${value.sourceAxisOrder[0]}`,
    sourceAxisOrder: ['height', 'width', 'depth'],
  })).slice(2);
  const result = reconcileEvidenceClaims(IDENTITY, inventory([first, second]), {
    verifyReceipt,
    lowerAuthorityHints: [{
      sourceRole: 'registry_hint',
      sourceId: 'energy-rating',
      dimensionsMm: { widthMm: 1782, heightMm: 913, depthMm: 803 },
    }],
  });

  assert.equal(result.status, 'conflict_quarantined');
  assert.equal(result.axisPermutationResolution, undefined);
});

test('ordinary lower-authority disagreement requires independent official corroboration', () => {
  const accepted = source('a'.repeat(64), { widthMm: 913, heightMm: 1782, depthMm: 803 });
  const result = reconcileEvidenceClaims(IDENTITY, inventory([accepted]), {
    verifyReceipt,
    lowerAuthorityHints: [{
      sourceRole: 'retailer_hint',
      sourceId: 'retailer-feed',
      dimensionsMm: { widthMm: 910, heightMm: 1782, depthMm: 803 },
    }],
  });

  assert.equal(result.status, 'conflict_quarantined');
  assert.equal(result.sources[0].contentSha256, accepted.contentSha256);
  assert.equal(result.conflictHints[0].kind, 'lower_authority_disagreement');
});

test('a receipt-bound exact market API dimension representation corroborates its official PDF', () => {
  const dimensions = { widthMm: 595, heightMm: 850, depthMm: 654 };
  const pdf = source('a'.repeat(64), dimensions, {
    identitySignals: [{
      type: 'official_market_api_dimensions',
      value: `T408HD.W:595x850x654:${'b'.repeat(64)}`,
    }],
  });
  const result = reconcileEvidenceClaims(IDENTITY, inventory([pdf]), {
    verifyReceipt,
    lowerAuthorityHints: [{
      sourceRole: 'legacy_hint',
      sourceId: 'legacy-catalog',
      dimensionsMm: { widthMm: 595, heightMm: 850, depthMm: 640 },
    }],
  });

  assert.equal(result.status, 'accepted');
  assert.equal(result.lowerAuthorityResolution, 'official_market_api_dimension_corroboration');
});

test('PDF and exact official product page can resolve an ordinary lower-authority disagreement', () => {
  const dimensions = { widthMm: 913, heightMm: 1782, depthMm: 803 };
  const pdf = source('a'.repeat(64), dimensions);
  const productPage = source('b'.repeat(64), dimensions, {
    sourceType: 'official_exact_model_product_page',
    finalUrl: 'https://www.westinghouse.com.au/fridges/whe6874ba/',
  });
  const result = reconcileEvidenceClaims(IDENTITY, inventory([pdf, productPage]), {
    verifyReceipt,
    lowerAuthorityHints: [{
      sourceRole: 'registry_hint',
      sourceId: 'energy-rating',
      dimensionsMm: { widthMm: 910, heightMm: 1782, depthMm: 803 },
    }],
  });

  assert.equal(result.status, 'accepted');
  assert.equal(result.sources.length, 2);
  assert.equal(result.lowerAuthorityResolution, 'independent_official_dimension_corroboration');
});

test('incomplete inventory cannot reconcile to acceptance', () => {
  const accepted = source('a'.repeat(64), { widthMm: 913, heightMm: 1782, depthMm: 803 });
  const incomplete = inventory([accepted], {
    completionStatus: 'discovery_incomplete',
    incompleteResolvers: ['official-index'],
  });
  const result = reconcileEvidenceClaims(IDENTITY, incomplete, { verifyReceipt });

  assert.equal(result.status, 'retryable_failure');
  assert.equal(result.failureCode, 'discovery_incomplete');
  assert.deepEqual(result.sources, []);
});

test('official parser and transport failures outrank an optional reference-only candidate', () => {
  const baseCandidates = [
    {
      candidateId: 'official-pdf', sourceUrl: 'https://www.westinghouse.com.au/manual.pdf',
      authorityMode: 'official', sourceRole: 'manufacturer_document', requiredAttempt: true,
      batchJobIds: [], resolverRefs: [],
      outcome: { status: 'mineru_failure', failureCode: 'mineru', reason: 'image-only dimensions', source: null },
    },
    {
      candidateId: 'official-parts', sourceUrl: 'https://www.westinghouse.com.au/parts.pdf',
      authorityMode: 'official', sourceRole: 'manufacturer_document', requiredAttempt: true,
      batchJobIds: [], resolverRefs: [],
      outcome: { status: 'transport_failure', failureCode: 'transport', reason: 'http_403', source: null },
    },
    {
      candidateId: 'reference-page', sourceUrl: 'https://retailer.example/WHE6874BA',
      authorityMode: 'reference', sourceRole: 'retailer_reference', requiredAttempt: false,
      batchJobIds: [], resolverRefs: [],
      outcome: { status: 'reference_only', failureCode: 'source_authority', source: null },
    },
  ];
  const parserResult = reconcileEvidenceClaims(IDENTITY, inventory([], { candidates: baseCandidates }));
  assert.equal(parserResult.status, 'claims_incomplete');
  assert.equal(parserResult.failureCode, 'mineru');

  const transportResult = reconcileEvidenceClaims(IDENTITY, inventory([], {
    candidates: baseCandidates.filter((candidate) => candidate.candidateId !== 'official-pdf'),
  }));
  assert.equal(transportResult.status, 'claims_incomplete');
  assert.equal(transportResult.failureCode, 'transport');
});

test('source authority is reported only when no official candidate reached evidence processing', () => {
  const result = reconcileEvidenceClaims(IDENTITY, inventory([], {
    candidates: [{
      candidateId: 'reference-page', sourceUrl: 'https://retailer.example/WHE6874BA',
      authorityMode: 'reference', sourceRole: 'retailer_reference', requiredAttempt: false,
      batchJobIds: [], resolverRefs: [],
      outcome: { status: 'reference_only', failureCode: 'source_authority', source: null },
    }],
  }));
  assert.equal(result.status, 'claims_incomplete');
  assert.equal(result.failureCode, 'source_authority');
});

test('non-scalar width range remains receipt accepted but cannot be scalar-projected', () => {
  const accepted = source('a'.repeat(64), { widthMm: 913, heightMm: 1782, depthMm: 803 });
  accepted.claims[0] = claim('closedEnvelope.widthMm', 913, {
    value: { kind: 'range', minMm: 910, maxMm: 913 },
  });
  const result = reconcileEvidenceClaims(IDENTITY, inventory([accepted]), { verifyReceipt });

  assert.equal(result.status, 'receipt_accepted_non_scalar');
  assert.equal(result.failureCode, null);
});

test('inventory hash binding is checked before reconciliation', () => {
  const accepted = source('a'.repeat(64), { widthMm: 913, heightMm: 1782, depthMm: 803 });
  const value = inventory([accepted]);
  value.candidateInventorySha256 = canonicalJsonSha256({ tampered: true });
  assert.throws(
    () => reconcileEvidenceClaims(IDENTITY, value, { verifyReceipt, verifyInventoryHash: true }),
    /inventory SHA-256/i,
  );
});
