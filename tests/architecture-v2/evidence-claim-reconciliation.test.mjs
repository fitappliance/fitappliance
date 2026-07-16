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

test('explicit appliance depth plus an exact product page excludes a conflicting generic net-depth source', () => {
  const identity = { brand: 'Hisense', model: 'HWF3S8514X', category: 'washing_machine' };
  const applianceDepth = source('a'.repeat(64), { widthMm: 595, heightMm: 845, depthMm: 540 }, {
    identity: { ...identity, outcome: 'exact' },
  });
  applianceDepth.claims = applianceDepth.claims.map((entry) => (
    entry.field === 'closedEnvelope.depthMm'
      ? {
        ...entry,
        sourceLabel: 'Appliance depth (diagram E)',
        sourceAxisOrder: ['depth'],
        page: 11,
        fragmentSha256: '1'.repeat(64),
        bbox: [0, 0, 100, 100],
      }
      : entry
  ));
  const productPage = source('b'.repeat(64), { widthMm: 595, heightMm: 845, depthMm: 540 }, {
    sourceType: 'official_exact_model_product_page',
    contentType: 'text/html',
    finalUrl: 'https://hisense.com.au/product/HWF3S8514X/8.5kg-series-3-front-load-washer',
    identity: { ...identity, outcome: 'exact' },
  });
  productPage.claims = productPage.claims.map((entry) => ({
    ...entry,
    sourceLabel: 'Dimensions (H*W*D) Unit: mm',
    sourceAxisOrder: ['height', 'width', 'depth'],
  }));
  const genericNet = source('c'.repeat(64), { widthMm: 595, heightMm: 845, depthMm: 510 }, {
    identity: { ...identity, outcome: 'exact' },
  });
  genericNet.claims = genericNet.claims.map((entry) => ({
    ...entry,
    sourceLabel: 'Net dimensions(W x H x D) (mm)',
    sourceAxisOrder: ['width', 'height', 'depth'],
    page: 1,
    fragmentSha256: '2'.repeat(64),
    bbox: [0, 0, 100, 100],
  }));

  const result = reconcileEvidenceClaims(identity, inventory(
    [applianceDepth, productPage, genericNet],
    { identity, targetId: 'target-hisense-hwf3s8514x' },
  ), { verifyReceipt, officialSemanticResolutionVersion: 1 });

  assert.equal(result.status, 'accepted');
  assert.equal(
    result.officialSemanticResolution,
    'explicit_appliance_depth_with_exact_product_page_corroboration',
  );
  assert.deepEqual(
    result.sources.map((entry) => entry.contentSha256).sort(),
    [applianceDepth.contentSha256, productPage.contentSha256].sort(),
  );
});

test('explicit appliance depth cannot suppress a generic net-depth conflict without product-page corroboration', () => {
  const identity = { brand: 'Hisense', model: 'HWF3S8514X', category: 'washing_machine' };
  const applianceDepth = source('a'.repeat(64), { widthMm: 595, heightMm: 845, depthMm: 540 }, {
    identity: { ...identity, outcome: 'exact' },
  });
  applianceDepth.claims = applianceDepth.claims.map((entry) => (
    entry.field === 'closedEnvelope.depthMm'
      ? {
        ...entry,
        sourceLabel: 'Appliance depth (diagram E)',
        sourceAxisOrder: ['depth'],
        page: 11,
        fragmentSha256: '1'.repeat(64),
        bbox: [0, 0, 100, 100],
      }
      : entry
  ));
  const genericNet = source('c'.repeat(64), { widthMm: 595, heightMm: 845, depthMm: 510 }, {
    identity: { ...identity, outcome: 'exact' },
  });
  genericNet.claims = genericNet.claims.map((entry) => ({
    ...entry,
    sourceLabel: 'Net dimensions(W x H x D) (mm)',
    sourceAxisOrder: ['width', 'height', 'depth'],
  }));

  const result = reconcileEvidenceClaims(identity, inventory(
    [applianceDepth, genericNet],
    { identity, targetId: 'target-hisense-hwf3s8514x' },
  ), { verifyReceipt });

  assert.equal(result.status, 'conflict_quarantined');
  assert.deepEqual(result.conflictingFields, ['closedEnvelope.depthMm']);
  assert.equal(result.officialSemanticResolution, undefined);
});

test('an explicit overall-depth conflict is never discarded as a generic net-dimensions source', () => {
  const identity = { brand: 'Hisense', model: 'HWF3S8514X', category: 'washing_machine' };
  const applianceDepth = source('a'.repeat(64), { widthMm: 595, heightMm: 845, depthMm: 540 }, {
    identity: { ...identity, outcome: 'exact' },
  });
  applianceDepth.claims = applianceDepth.claims.map((entry) => (
    entry.field === 'closedEnvelope.depthMm'
      ? {
        ...entry,
        sourceLabel: 'Appliance depth (diagram E)',
        sourceAxisOrder: ['depth'],
        page: 11,
        fragmentSha256: '1'.repeat(64),
        bbox: [0, 0, 100, 100],
      }
      : entry
  ));
  const productPage = source('b'.repeat(64), { widthMm: 595, heightMm: 845, depthMm: 540 }, {
    sourceType: 'official_exact_model_product_page',
    contentType: 'text/html',
    identity: { ...identity, outcome: 'exact' },
  });
  const explicitConflict = source('c'.repeat(64), { widthMm: 595, heightMm: 845, depthMm: 510 }, {
    identity: { ...identity, outcome: 'exact' },
  });
  explicitConflict.claims = explicitConflict.claims.map((entry) => (
    entry.field === 'closedEnvelope.depthMm'
      ? { ...entry, sourceLabel: 'Overall appliance depth', sourceAxisOrder: ['depth'] }
      : entry
  ));

  const result = reconcileEvidenceClaims(identity, inventory(
    [applianceDepth, productPage, explicitConflict],
    { identity, targetId: 'target-hisense-hwf3s8514x' },
  ), { verifyReceipt });

  assert.equal(result.status, 'conflict_quarantined');
  assert.deepEqual(result.conflictingFields, ['closedEnvelope.depthMm']);
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

test('policy-bounded registry permutation tolerance resolves small registry transcription deltas', () => {
  const accepted = source('a'.repeat(64), { widthMm: 796, heightMm: 1718, depthMm: 727 });
  const result = reconcileEvidenceClaims(IDENTITY, inventory([accepted]), {
    verifyReceipt,
    registryAxisPermutationToleranceMm: 10,
    lowerAuthorityHints: [{
      sourceRole: 'registry_hint',
      sourceId: 'energy-rating',
      dimensionsMm: { widthMm: 1725, heightMm: 796, depthMm: 723 },
    }],
  });

  assert.equal(result.status, 'accepted');
  assert.equal(result.conflictHints[0].kind, 'axis_permutation_within_tolerance');
  assert.equal(result.conflictHints[0].maximumDeltaMm, 7);
  assert.equal(result.axisPermutationResolution, 'exact_official_axis_proof_with_registry_tolerance');
});

test('registry disagreement beyond the permutation tolerance remains quarantined', () => {
  const accepted = source('a'.repeat(64), { widthMm: 699, heightMm: 1725, depthMm: 723 });
  const result = reconcileEvidenceClaims(IDENTITY, inventory([accepted]), {
    verifyReceipt,
    registryAxisPermutationToleranceMm: 10,
    lowerAuthorityHints: [{
      sourceRole: 'registry_hint',
      sourceId: 'energy-rating',
      dimensionsMm: { widthMm: 1725, heightMm: 699, depthMm: 769 },
    }],
  });

  assert.equal(result.status, 'conflict_quarantined');
  assert.equal(result.conflictHints[0].kind, 'lower_authority_disagreement');
  assert.equal(result.axisPermutationResolution, undefined);
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

test('an exact official scoped depth can override a registry-only depth disagreement', () => {
  const accepted = source('a'.repeat(64), { widthMm: 600, heightMm: 850, depthMm: 660 });
  accepted.claims = accepted.claims.map((claim) => (
    claim.field === 'closedEnvelope.depthMm'
      ? {
        ...claim,
        sourceLabel: 'Product Depth with Doors Closed (D\' mm)',
        sourceAxisOrder: ['depth'],
        includesDoor: true,
      }
      : claim
  ));
  const result = reconcileEvidenceClaims(IDENTITY, inventory([accepted]), {
    verifyReceipt,
    lowerAuthorityHints: [{
      sourceRole: 'registry_hint',
      sourceId: 'energy-rating',
      dimensionsMm: { widthMm: 600, heightMm: 850, depthMm: 610 },
    }],
  });

  assert.equal(result.status, 'accepted');
  assert.equal(result.lowerAuthorityResolution, 'exact_official_scoped_depth_over_registry_hint');
});

test('one complete exact official axis proof supersedes a disagreeing legacy catalog hint', () => {
  const accepted = source('a'.repeat(64), { widthMm: 905, heightMm: 1830, depthMm: 731 });
  const result = reconcileEvidenceClaims(IDENTITY, inventory([accepted]), {
    verifyReceipt,
    lowerAuthorityHints: [{
      sourceRole: 'legacy_hint',
      sourceId: 'legacy-catalog',
      dimensionsMm: { widthMm: 910, heightMm: 1830, depthMm: 731 },
    }],
  });

  assert.equal(result.status, 'accepted');
  assert.equal(result.lowerAuthorityResolution, 'exact_official_axis_proof_over_legacy_hint');
});

test('a grouped tuple with an explicit handle-inclusive depth override is complete official axis proof', () => {
  const accepted = source('a'.repeat(64), { widthMm: 598, heightMm: 842, depthMm: 665 });
  accepted.claims = accepted.claims.map((claim) => (
    claim.field === 'closedEnvelope.depthMm'
      ? {
        ...claim,
        sourceLabel: 'Overall depth including door handle',
        sourceAxisOrder: ['depth'],
        includesHandle: true,
      }
      : { ...claim, sourceAxisOrder: ['height', 'width', 'depth'] }
  ));
  const result = reconcileEvidenceClaims(IDENTITY, inventory([accepted]), {
    verifyReceipt,
    lowerAuthorityHints: [{
      sourceRole: 'legacy_hint',
      sourceId: 'legacy-catalog',
      dimensionsMm: { widthMm: 598, heightMm: 842, depthMm: 599 },
    }],
  });

  assert.equal(result.status, 'accepted');
  assert.equal(result.lowerAuthorityResolution, 'exact_official_axis_proof_over_legacy_hint');
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

test('exact PDF and a strict dimensions-only HTML variant can corroborate an ordinary disagreement', () => {
  const variantIdentity = { brand: 'Westinghouse', model: 'WTB4600SC', category: 'fridge' };
  const dimensions = { widthMm: 699, heightMm: 1725, depthMm: 723 };
  const pdf = source('a'.repeat(64), dimensions, {
    identity: { ...variantIdentity, outcome: 'exact' },
  });
  const productPage = source('b'.repeat(64), dimensions, {
    sourceType: 'official_exact_model_product_page',
    contentType: 'text/html',
    finalUrl: 'https://www.westinghouse.com.au/fridges/wtb4600sc-r/',
    identity: {
      ...variantIdentity,
      outcome: 'official_marketing_alias',
      sourceModel: 'WTB4600SC-R',
    },
    identitySignals: [
      { type: 'document_title', value: '460L Top Mount Fridge WTB4600SC-R' },
      { type: 'canonical_source_model', value: 'WTB4600SC-R' },
      { type: 'official_variant_binding', value: 'WTB4600SC -> WTB4600SC-R (R)' },
    ],
  });
  const result = reconcileEvidenceClaims(variantIdentity, inventory([pdf, productPage], {
    identity: variantIdentity,
  }), {
    verifyReceipt,
    lowerAuthorityHints: [{
      sourceRole: 'registry_hint',
      sourceId: 'energy-rating',
      dimensionsMm: { widthMm: 1725, heightMm: 699, depthMm: 769 },
    }],
  });

  assert.equal(result.status, 'accepted');
  assert.equal(result.sources.length, 2);
  assert.equal(result.lowerAuthorityResolution, 'independent_official_dimension_corroboration');
});

test('strict HTML variant cannot establish target identity without an exact source anchor', () => {
  const variantIdentity = { brand: 'Westinghouse', model: 'WTB4600SC', category: 'fridge' };
  const productPage = source('b'.repeat(64), { widthMm: 699, heightMm: 1725, depthMm: 723 }, {
    contentType: 'text/html',
    identity: {
      ...variantIdentity,
      outcome: 'official_marketing_alias',
      sourceModel: 'WTB4600SC-R',
    },
  });
  const result = reconcileEvidenceClaims(variantIdentity, inventory([productPage], {
    identity: variantIdentity,
  }), { verifyReceipt });

  assert.equal(result.status, 'identity_rejected');
  assert.equal(result.failureCode, 'identity');
});

test('receipt-bound official AU model-variant PDF can establish dimensions without an exact source anchor', () => {
  const variantIdentity = { brand: 'ASKO', model: 'W4104C.W', category: 'washing_machine' };
  const variant = source('c'.repeat(64), { widthMm: 595, heightMm: 850, depthMm: 700 }, {
    sourceType: 'official_model_variant_pdf',
    contentType: 'application/pdf',
    sourceUrl: 'https://asko.hgecdn.net/medias/productSheet-W4104C-W-AU.pdf',
    finalUrl: 'https://asko.hgecdn.net/medias/productSheet-W4104C-W-AU.pdf',
    identity: {
      ...variantIdentity,
      outcome: 'official_marketing_alias',
      sourceModel: 'W4104C.W.AU',
    },
    identitySignals: [
      { type: 'mineru_bound_exact_cover_model', value: `W4104C.W.AU:exact-cover:W4104C.W.AU:page:1:${'e'.repeat(64)}` },
      { type: 'canonical_source_model', value: 'W4104C.W.AU' },
      { type: 'official_market_api_model', value: `W4104C.W:${'d'.repeat(64)}:https://api-storefront.asko.com/` },
      { type: 'official_market_api_dimensions', value: `W4104C.W:595x850x700:${'d'.repeat(64)}` },
      { type: 'official_market_api_variant_binding', value: 'W4104C.W -> W4104C.W.AU (AU)' },
    ],
    discoveryProvenance: {
      method: 'official_market_api',
      requestedModel: 'W4104C.W',
      matchedModel: 'W4104C.W.AU',
      discoveryUrl: 'https://api-storefront.asko.com/',
      discoveryContentSha256: 'd'.repeat(64),
    },
  });
  const result = reconcileEvidenceClaims(variantIdentity, inventory([variant], {
    identity: variantIdentity,
  }), { verifyReceipt });

  assert.equal(result.status, 'accepted');
  assert.deepEqual(result.sources, [variant]);
});

test('official model-variant PDF stays identity-rejected when any independent binding signal is absent', () => {
  const variantIdentity = { brand: 'ASKO', model: 'W4104C.W', category: 'washing_machine' };
  const variant = source('c'.repeat(64), { widthMm: 595, heightMm: 850, depthMm: 700 }, {
    sourceType: 'official_model_variant_pdf',
    contentType: 'application/pdf',
    identity: {
      ...variantIdentity,
      outcome: 'official_marketing_alias',
      sourceModel: 'W4104C.W.AU',
    },
    identitySignals: [
      { type: 'mineru_bound_exact_cover_model', value: `W4104C.W.AU:exact-cover:W4104C.W.AU:page:1:${'e'.repeat(64)}` },
      { type: 'canonical_source_model', value: 'W4104C.W.AU' },
      { type: 'official_market_api_model', value: 'W4104C.W:hash:url' },
      { type: 'official_market_api_dimensions', value: 'W4104C.W:595x850x700:hash' },
    ],
    discoveryProvenance: {
      method: 'official_market_api',
      requestedModel: 'W4104C.W',
      matchedModel: 'W4104C.W.AU',
      discoveryUrl: 'https://api-storefront.asko.com/',
      discoveryContentSha256: 'd'.repeat(64),
    },
  });
  const result = reconcileEvidenceClaims(variantIdentity, inventory([variant], {
    identity: variantIdentity,
  }), { verifyReceipt });

  assert.equal(result.status, 'identity_rejected');
  assert.equal(result.failureCode, 'identity');
});

test('strict HTML variant disagreement with its exact source anchor remains quarantined', () => {
  const variantIdentity = { brand: 'Westinghouse', model: 'WTB4600SC', category: 'fridge' };
  const pdf = source('a'.repeat(64), { widthMm: 699, heightMm: 1725, depthMm: 723 }, {
    identity: { ...variantIdentity, outcome: 'exact' },
  });
  const productPage = source('b'.repeat(64), { widthMm: 699, heightMm: 1725, depthMm: 769 }, {
    contentType: 'text/html',
    identity: {
      ...variantIdentity,
      outcome: 'official_marketing_alias',
      sourceModel: 'WTB4600SC-R',
    },
  });
  const result = reconcileEvidenceClaims(variantIdentity, inventory([pdf, productPage], {
    identity: variantIdentity,
  }), { verifyReceipt });

  assert.equal(result.status, 'conflict_quarantined');
  assert.deepEqual(result.conflictingFields, ['closedEnvelope.depthMm']);
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
