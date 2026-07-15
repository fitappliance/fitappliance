import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  extractClaimsFromHtml,
  verifyAndAttestResolutionArtifact,
  verifyAttestedResolutionArtifact,
} from '../../src/domain/evidence-artifact-verifier.mjs';
import {
  containsExactModel,
  containsExactModelDocumentUrl,
  validateClaimSemantics,
  validateClaimsSemantics,
} from '../../src/domain/evidence-claim-semantics.mjs';
import {
  buildMineruDerivedArtifact,
  parseMineruContentListV2,
} from '../../src/domain/mineru-document.mjs';
import { createVerificationReceipt } from '../../src/domain/evidence-source-verifier.mjs';

const identity = { brand: 'Westinghouse', model: 'WHE6874BA', category: 'fridge' };
const MINERU_MODEL_REVISION = 'ed6b654c018d742e65a17671e379c5e6ecc87ec9';
const MINERU_VLM_MODEL_REVISION = 'bff20d4ae2bf202df9f45284b4d43681555a97ed';

function html(model = 'WHE6874BA') {
  return Buffer.from(`<!doctype html><html><head>
    <title>609L refrigerator - ${model} | Westinghouse Australia</title>
    <link rel="canonical" href="https://www.westinghouse.com.au/fridges/${model.toLowerCase()}/">
  </head><body data-product-model="${model}">
    <dl><dt>Total width (mm)</dt><dd>913 mm</dd>
      <dt>Total height (mm)</dt><dd>1782 mm</dd>
      <dt>Total depth (mm)</dt><dd>803 mm</dd>
      <dt>Depth door open 90 degree (mm)</dt><dd>1189 mm</dd>
      <dt>Air space above cabinet (mm)</dt><dd>25 mm</dd>
      <dt>Plumbed water supply required</dt><dd>Yes</dd></dl>
  </body></html>`);
}

function source(bytes, overrides = {}) {
  const hash = createHash('sha256').update(bytes).digest('hex');
  return {
    authority: 'manufacturer',
    sourceType: 'official_exact_model_product_page',
    sourceUrl: 'https://www.westinghouse.com.au/fridges/whe6874ba/',
    finalUrl: 'https://www.westinghouse.com.au/fridges/whe6874ba/',
    redirectChain: [],
    retrievedAt: '2026-07-11T14:30:00.000Z',
    contentSha256: hash,
    objectPath: `evidence/web/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.html`,
    contentType: 'text/html',
    byteSize: bytes.length,
    identity: { brand: 'Westinghouse', model: 'WHE6874BA', outcome: 'exact' },
    claims: [
      { field: 'closedEnvelope.widthMm', value: 913, unit: 'mm', label: 'Total width (mm)', quote: 'Total width (mm) 913 mm' },
      { field: 'closedEnvelope.heightMm', value: 1782, unit: 'mm', label: 'Total height (mm)', quote: 'Total height (mm) 1782 mm' },
      { field: 'closedEnvelope.depthMm', value: 803, unit: 'mm', label: 'Total depth (mm)', quote: 'Total depth (mm) 803 mm' },
      { field: 'operation.doorOpenDepthMm', value: 1189, unit: 'mm', label: 'Depth door open 90 degree (mm)', quote: 'Depth door open 90 degree (mm) 1189 mm' },
      { field: 'installation.topMm', value: 25, unit: 'mm', label: 'Air space above cabinet (mm)', quote: 'Air space above cabinet (mm) 25 mm' },
      { field: 'flags.requiresPlumbing', value: true, unit: 'boolean', label: 'Plumbed water supply required', quote: 'Plumbed water supply required Yes' },
    ],
    ...overrides,
  };
}

test('exact model matching does not accept longer, prefixed, or suffixed models', () => {
  assert.equal(containsExactModel('Model WHE6874BA', 'WHE6874BA'), true);
  assert.equal(containsExactModel('Model WHE6874BA-R', 'WHE6874BA'), false);
  assert.equal(containsExactModel('Model XWHE6874BA', 'WHE6874BA'), false);
  assert.equal(containsExactModel('Model ABC12', 'ABC1'), false);
});

test('exact model PDF URLs accept only bounded document, version, and date suffixes', () => {
  assert.equal(containsExactModelDocumentUrl(
    'https://www.lg.com/content/dam/au/pdfs/GF-L700PL_Specsheet_V2_230809_2.pdf',
    'GF-L700PL',
  ), true);
  assert.equal(containsExactModelDocumentUrl(
    'https://www.lg.com/content/dam/au/pdfs/GF-L700PL_Specsheet_V2_OTHER.pdf',
    'GF-L700PL',
  ), false);
  assert.equal(containsExactModelDocumentUrl(
    'https://www.lg.com/content/dam/au/pdfs/GF-L700PLB_Specsheet_V2_230809_2.pdf',
    'GF-L700PL',
  ), false);
});

test('claim values must be parsed from the matching field label and unit', () => {
  assert.equal(validateClaimSemantics({
    field: 'closedEnvelope.widthMm', value: 913, unit: 'mm',
    label: 'Total width (mm)', quote: 'Total width (mm) 913 mm',
  }, { category: 'fridge' }), true);
  assert.throws(() => validateClaimSemantics({
    field: 'closedEnvelope.widthMm', value: 1, unit: 'mm',
    label: 'Total width (mm)', quote: 'Total width (mm) 913 mm',
  }, { category: 'fridge' }), /quoted value/i);
  assert.throws(() => validateClaimSemantics({
    field: 'closedEnvelope.widthMm', value: 1782, unit: 'mm',
    label: 'Total height (mm)', quote: 'Total height (mm) 1782 mm',
  }, { category: 'fridge' }), /field label/i);
  assert.throws(() => validateClaimSemantics({
    field: 'flags.requiresPlumbing', value: true, unit: 'boolean',
    label: 'Water connection', quote: 'Water connection not required',
  }, { category: 'fridge' }), /boolean/i);
  assert.equal(validateClaimSemantics({
    field: 'closedEnvelope.depthMm', value: 803, unit: 'mm',
    label: 'Depth with door closed', quote: 'Depth with door closed 803 mm',
  }, { category: 'fridge' }), true);
  assert.equal(validateClaimSemantics({
    field: 'operation.doorOpenDepthMm', value: 1054, unit: 'mm',
    label: 'Appliance depth in mm with opened door', quote: 'Appliance depth in mm with opened door 1054',
  }, { category: 'dryer' }), true);
  assert.throws(() => validateClaimSemantics({
    field: 'closedEnvelope.depthMm', value: 1054, unit: 'mm',
    label: 'Appliance depth in mm with opened door', quote: 'Appliance depth in mm with opened door 1054',
  }, { category: 'dryer' }), /field label/i);
});

test('category ranges and cross-field geometry reject plausible-looking bad data', () => {
  const claims = source(html()).claims;
  assert.equal(validateClaimsSemantics(claims, identity), true);
  assert.throws(() => validateClaimsSemantics(claims.map((claim) => (
    claim.field === 'closedEnvelope.widthMm'
      ? { ...claim, value: 20, quote: 'Total width (mm) 20 mm' }
      : claim
  )), identity), /range/i);
  assert.throws(() => validateClaimsSemantics(claims.map((claim) => (
    claim.field === 'operation.doorOpenDepthMm'
      ? { ...claim, value: 700, quote: 'Depth door open 90 degree (mm) 700 mm' }
      : claim
  )), identity), /door-open depth/i);
});

test('HTML artifact needs canonical exact-model scope and independent product identity', () => {
  const bytes = html();
  const attested = verifyAndAttestResolutionArtifact({
    source: source(bytes), caseIdentity: identity, bytes,
    verifiedAt: '2026-07-11T14:35:00.000Z',
  });
  assert.ok(attested.identitySignals.some((signal) => signal.type === 'canonical_url'));
  assert.ok(attested.identitySignals.some((signal) => signal.type === 'product_model'));
  assert.equal(verifyAttestedResolutionArtifact({ source: attested, caseIdentity: identity, bytes }), true);

  const wrongBytes = html('WHE6874BA-R');
  assert.throws(() => verifyAndAttestResolutionArtifact({
    source: source(wrongBytes, {
      contentSha256: createHash('sha256').update(wrongBytes).digest('hex'),
      byteSize: wrongBytes.length,
    }),
    caseIdentity: identity, bytes: wrongBytes, verifiedAt: '2026-07-11T14:35:00.000Z',
  }), /canonical.*model|identity/i);
});

test('artifact attestation and replay require hash-bound product-page discovery evidence', () => {
  const bytes = html();
  const artifactUrl = 'https://www.westinghouse.com.au/fridges/whe6874ba/';
  const discoveryBytes = Buffer.from(`<!doctype html><html><body>
    <h1>WHE6874BA support</h1><a href="${artifactUrl}">Product specifications</a>
  </body></html>`);
  const discoveryHash = createHash('sha256').update(discoveryBytes).digest('hex');
  const discoveredSource = source(bytes, {
    discoveryProvenance: {
      schemaVersion: 1,
      method: 'official_product_page',
      market: 'AU',
      discoveryUrl: 'https://www.westinghouse.com.au/au/support/whe6874ba/',
      requestedModel: 'WHE6874BA',
      matchedModel: 'WHE6874BA',
      artifactUrl,
      artifactLinkUrl: artifactUrl,
      discoveryContentSha256: discoveryHash,
      discoveryObjectPath: `evidence/web/sha256/${discoveryHash.slice(0, 2)}/${discoveryHash.slice(2, 4)}/${discoveryHash}.html`,
      discoveryByteSize: discoveryBytes.length,
    },
  });

  assert.throws(() => verifyAndAttestResolutionArtifact({
    source: discoveredSource,
    caseIdentity: identity,
    bytes,
    verifiedAt: '2026-07-11T14:35:00.000Z',
  }), /discovery artifact bytes required/i);

  const attested = verifyAndAttestResolutionArtifact({
    source: discoveredSource,
    caseIdentity: identity,
    bytes,
    discoveryArtifactBytes: discoveryBytes,
    verifiedAt: '2026-07-11T14:35:00.000Z',
  });
  assert.throws(() => verifyAttestedResolutionArtifact({
    source: attested,
    caseIdentity: identity,
    bytes,
  }), /discovery artifact bytes required/i);
  assert.equal(verifyAttestedResolutionArtifact({
    source: attested,
    caseIdentity: identity,
    bytes,
    discoveryArtifactBytes: discoveryBytes,
  }), true);

  const legacyReceipt = { ...createVerificationReceipt({
    ...attested,
    verificationReceipt: undefined,
  }, identity, {
    verifiedAt: attested.verificationReceipt.verifiedAt,
    discoveryArtifactBytes: discoveryBytes,
    discoveryPolicyVersion: '2026-07-13.2',
  }) };
  delete legacyReceipt.discoveryPolicyVersion;
  assert.equal(verifyAttestedResolutionArtifact({
    source: { ...attested, verificationReceipt: legacyReceipt },
    caseIdentity: identity,
    bytes,
    discoveryArtifactBytes: discoveryBytes,
  }), true);
});

test('artifact replay preserves a supported legacy manufacturer policy receipt', () => {
  const bytes = html();
  const legacy = verifyAndAttestResolutionArtifact({
    source: source(bytes),
    caseIdentity: identity,
    bytes,
    verifiedAt: '2026-07-11T14:35:00.000Z',
    manufacturerPolicyVersion: '2026-07-12.1',
  });
  assert.equal(legacy.verificationReceipt.manufacturerPolicyVersion, '2026-07-12.1');
  assert.equal(verifyAttestedResolutionArtifact({ source: legacy, caseIdentity: identity, bytes }), true);

  assert.throws(() => verifyAndAttestResolutionArtifact({
    source: source(bytes),
    caseIdentity: identity,
    bytes,
    verifiedAt: '2026-07-11T14:35:00.000Z',
    manufacturerPolicyVersion: '2025-01-01.1',
  }), /manufacturer policy version is not supported/i);
});

test('HTML identity accepts an exact canonical path segment plus a matching structured product entity', () => {
  const hisenseIdentity = { brand: 'Hisense', model: 'HWF8I1015BX', category: 'washing_machine' };
  const bytes = Buffer.from(`<!doctype html><html><head>
    <title>Series 8i 10kg Front Load Washer</title>
    <link rel="canonical" href="https://www.hisense.com.au/product/HWF8I1015BX/series-8i-10kg-front-load-washer">
  </head><body>
    <div><h2>Dimensions (H*W*D) Unit: mm</h2><p>845*595*550</p></div>
    <script type="application/json">{"product":{"code":"HWF8I1015BX","url":"/product/HWF8I1015BX/series-8i-10kg-front-load-washer"}}</script>
  </body></html>`);
  const claims = extractClaimsFromHtml(bytes, {
    category: 'washing_machine',
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  const attested = verifyAndAttestResolutionArtifact({
    source: source(bytes, {
      sourceUrl: 'https://www.hisense.com.au/product/HWF8I1015BX/series-8i-10kg-front-load-washer',
      finalUrl: 'https://www.hisense.com.au/product/HWF8I1015BX/series-8i-10kg-front-load-washer',
      identity: { brand: 'Hisense', model: 'HWF8I1015BX', outcome: 'exact' },
      claims,
    }),
    caseIdentity: hisenseIdentity,
    bytes,
    verifiedAt: '2026-07-12T10:00:00.000Z',
  });
  assert.ok(attested.identitySignals.some((signal) => signal.type === 'structured_product_model'));

  const relatedBytes = Buffer.from(bytes.toString('utf8').replace(
    '"url":"/product/HWF8I1015BX/series-8i-10kg-front-load-washer"',
    '"url":"/product/RELATED123/other-product"',
  ));
  assert.throws(() => verifyAndAttestResolutionArtifact({
    source: source(relatedBytes, {
      sourceUrl: 'https://www.hisense.com.au/product/HWF8I1015BX/series-8i-10kg-front-load-washer',
      finalUrl: 'https://www.hisense.com.au/product/HWF8I1015BX/series-8i-10kg-front-load-washer',
      contentSha256: createHash('sha256').update(relatedBytes).digest('hex'),
      byteSize: relatedBytes.length,
      identity: { brand: 'Hisense', model: 'HWF8I1015BX', outcome: 'exact' },
      claims,
    }),
    caseIdentity: hisenseIdentity,
    bytes: relatedBytes,
    verifiedAt: '2026-07-12T10:00:00.000Z',
  }), /product model identity/i);
});

test('HTML identity accepts an exact model followed only by a numeric product ID in the canonical slug', () => {
  const dryerIdentity = { brand: 'Fisher & Paykel', model: 'DH9060HG1', category: 'dryer' };
  const canonical = 'https://www.fisherpaykel.com/au/laundry/dryers/dh9060hg1-93296.html';
  const bytes = Buffer.from(`<!doctype html><html><head>
    <title>Heat Pump Dryer DH9060HG1 | Fisher & Paykel Australia</title>
    <link rel="canonical" href="${canonical}">
  </head><body data-pim-sku="DH9060HG1"><dl>
    <dt>Width</dt><dd>600 mm</dd><dt>Height</dt><dd>850 mm</dd><dt>Depth</dt><dd>655 mm</dd>
  </dl></body></html>`);
  const claims = extractClaimsFromHtml(bytes, {
    category: 'dryer',
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  const attested = verifyAndAttestResolutionArtifact({
    source: source(bytes, {
      sourceUrl: canonical,
      finalUrl: canonical,
      identity: { brand: dryerIdentity.brand, model: dryerIdentity.model, outcome: 'exact' },
      claims,
    }),
    caseIdentity: dryerIdentity,
    bytes,
    verifiedAt: '2026-07-14T15:30:00.000Z',
  });
  assert.equal(attested.identity.outcome, 'exact');

  const siblingCanonical = canonical.replace('dh9060hg1-93296', 'dh9060hg10-93296');
  const siblingBytes = Buffer.from(bytes.toString('utf8').replaceAll(canonical, siblingCanonical));
  assert.throws(() => verifyAndAttestResolutionArtifact({
    source: source(siblingBytes, {
      sourceUrl: siblingCanonical,
      finalUrl: siblingCanonical,
      identity: { brand: dryerIdentity.brand, model: dryerIdentity.model, outcome: 'exact' },
      claims,
    }),
    caseIdentity: dryerIdentity,
    bytes: siblingBytes,
    verifiedAt: '2026-07-14T15:30:00.000Z',
  }), /canonical.*model|identity/i);
});

test('HTML identity records a strict official marketing alias and limits it to dimensions', () => {
  const aliasIdentity = { brand: 'Samsung', model: 'SRF5300SD', category: 'fridge' };
  const bytes = Buffer.from(`<!doctype html><html><head>
    <title>495L French Door Fridge Non Plumbed SRF5300SD | Samsung AU</title>
    <link rel="canonical" href="https://www.samsung.com/au/refrigerators/french-door/rf5000a-498l-silver-rf44a5202sl-sa/">
    <meta property="og:description" content="Purchase SRF5300SD 495L French Door refrigerator RF44A5202SL/SA from Samsung Australia.">
  </head><body data-model-code="RF44A5202SL/SA">
    <dl><dt>Total width (mm)</dt><dd>817 mm</dd>
      <dt>Total height (mm)</dt><dd>1776 mm</dd>
      <dt>Total depth (mm)</dt><dd>715 mm</dd></dl>
  </body></html>`);
  const claims = extractClaimsFromHtml(bytes, {
    category: 'fridge',
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  const input = source(bytes, {
    sourceUrl: 'https://www.samsung.com/au/refrigerators/french-door/rf5000a-498l-silver-rf44a5202sl-sa/',
    finalUrl: 'https://www.samsung.com/au/refrigerators/french-door/rf5000a-498l-silver-rf44a5202sl-sa/',
    identity: { brand: 'Samsung', model: 'SRF5300SD', outcome: 'exact' },
    claims,
  });
  const attested = verifyAndAttestResolutionArtifact({
    source: input,
    caseIdentity: aliasIdentity,
    bytes,
    verifiedAt: '2026-07-12T10:00:00.000Z',
  });
  assert.deepEqual(attested.identity, {
    brand: 'Samsung', model: 'SRF5300SD', outcome: 'official_marketing_alias',
    sourceModel: 'RF44A5202SL/SA',
  });
  assert.ok(attested.identitySignals.some((signal) => signal.type === 'official_alias_binding'));
  assert.equal(verifyAttestedResolutionArtifact({ source: attested, caseIdentity: aliasIdentity, bytes }), true);

  const unboundBytes = Buffer.from(bytes.toString('utf8').replace(
    'Purchase SRF5300SD 495L French Door refrigerator RF44A5202SL/SA',
    'Purchase this 495L French Door refrigerator',
  ));
  assert.throws(() => verifyAndAttestResolutionArtifact({
    source: source(unboundBytes, {
      sourceUrl: input.sourceUrl,
      finalUrl: input.finalUrl,
      identity: input.identity,
      claims,
    }),
    caseIdentity: aliasIdentity,
    bytes: unboundBytes,
    verifiedAt: '2026-07-12T10:00:00.000Z',
  }), /alias|canonical.*model|identity/i);
});

test('HTML extractor derives requested claims from source text instead of copied values', () => {
  const claims = extractClaimsFromHtml(html(), {
    category: 'fridge',
    fields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
      'operation.doorOpenDepthMm', 'installation.topMm', 'flags.requiresPlumbing',
    ],
  });
  assert.deepEqual(Object.fromEntries(claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': 913,
    'closedEnvelope.heightMm': 1782,
    'closedEnvelope.depthMm': 803,
    'operation.doorOpenDepthMm': 1189,
    'installation.topMm': 25,
    'flags.requiresPlumbing': true,
  });
});

test('HTML extractor prioritises structured product dimensions and rejects packaging dimensions', () => {
  const samsung = Buffer.from(`<!doctype html><html><head>
    <title>9kg dryer - DV90BB9440GH | Samsung AU</title>
    <link rel="canonical" href="https://www.samsung.com/au/dryers/dv90bb9440ghsa/">
  </head><body data-modelname="DV90BB9440GH" data-modelcode="DV90BB9440GHSA">
    <section><p>Dimensions</p><span>Width 600 mm</span><span>Height 850 mm</span><span>Depth 650 mm</span></section>
    <form><label>Depth (mm)</label><span>Ex.: 695</span></form>
    <ul role="list">
      <li role="listitem"><p>Product Dimension (WxHxD)</p><p>600 x 850 x 650 mm</p></li>
      <li role="listitem"><p>Packaging Dimension (WxHxD)</p><p>670 x 895 x 695 mm</p></li>
      <li role="listitem"><div class="spec-name"><p>Product Depth with door open 90 degree (mm)</p></div><div class="spec-value"><p>1115</p></div></li>
    </ul>
  </body></html>`);
  const claims = extractClaimsFromHtml(samsung, {
    category: 'dryer',
    fields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
      'operation.doorOpenDepthMm',
    ],
  });
  assert.deepEqual(Object.fromEntries(claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': 600,
    'closedEnvelope.heightMm': 850,
    'closedEnvelope.depthMm': 650,
    'operation.doorOpenDepthMm': 1115,
  });
  assert.ok(claims.filter((claim) => claim.field.startsWith('closedEnvelope.'))
    .every((claim) => claim.semanticBasis === 'explicit_axis_sequence'));

  const samsungIdentity = { brand: 'Samsung', model: 'DV90BB9440GH', category: 'dryer' };
  const attested = verifyAndAttestResolutionArtifact({
    source: source(samsung, {
      sourceUrl: 'https://www.samsung.com/au/dryers/dv90bb9440ghsa/',
      finalUrl: 'https://www.samsung.com/au/dryers/dv90bb9440ghsa/',
      identity: { brand: 'Samsung', model: 'DV90BB9440GH', outcome: 'exact' },
      claims,
    }),
    caseIdentity: samsungIdentity,
    bytes: samsung,
    verifiedAt: '2026-07-12T10:00:00.000Z',
  });
  assert.ok(attested.identitySignals.some((signal) => signal.type === 'canonical_regional_sku'));
  assert.ok(attested.identitySignals.some((signal) => signal.type === 'product_model'));
});

test('HTML extractor maps LG Unit W x D x H rows and excludes packaging dimensions', () => {
  const lg = Buffer.from(`<!doctype html><html><head>
    <title>WD1275A1 | LG Australia</title>
    <link rel="canonical" href="https://www.lg.com/au/washer-dryers/front-load-washing-machines/wd1275a1/">
  </head><body>
    <div data-pim-model-name="WD1275A1"></div>
    <ul>
      <li class="text c-compare-selling__item">
        <div class="cmp-text c-compare-selling__spec-name"><p>Unit(W x D x H)</p></div>
        <div class="cmp-text c-compare-selling__spec-desc"><p>600mm x 535mm x 850mm</p></div>
      </li>
      <li class="text c-compare-selling__item">
        <div class="cmp-text c-compare-selling__spec-name"><p>Packaging (W x D x H)</p></div>
        <div class="cmp-text c-compare-selling__spec-desc"><p>660mm x 580mm x 890mm</p></div>
      </li>
    </ul>
  </body></html>`);
  const fields = ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'];
  const claims = extractClaimsFromHtml(lg, { category: 'washing_machine', fields });

  assert.deepEqual(Object.fromEntries(claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': 600,
    'closedEnvelope.heightMm': 850,
    'closedEnvelope.depthMm': 535,
  });
  assert.ok(claims.every((claim) => claim.semanticBasis === 'explicit_axis_sequence'));
  assert.ok(claims.every((claim) => /Unit\(W x D x H\) 600mm x 535mm x 850mm/.test(claim.quote)));

  const lgIdentity = { brand: 'LG', model: 'WD1275A1', category: 'washing_machine' };
  const attested = verifyAndAttestResolutionArtifact({
    source: source(lg, {
      sourceUrl: 'https://www.lg.com/au/washer-dryers/front-load-washing-machines/wd1275a1/',
      finalUrl: 'https://www.lg.com/au/washer-dryers/front-load-washing-machines/wd1275a1/',
      identity: { brand: 'LG', model: 'WD1275A1', outcome: 'exact' },
      claims,
    }),
    caseIdentity: lgIdentity,
    bytes: lg,
    verifiedAt: '2026-07-13T12:00:00.000Z',
  });
  assert.ok(attested.identitySignals.some((signal) => signal.type === 'product_model'));
});

test('HTML extractor prefers an explicitly labelled doors-closed depth over a generic product tuple', () => {
  const lg = Buffer.from(`<!doctype html><html><body><ul role="list">
    <li role="listitem"><p>Product Dimensions (WxHxD mm)</p><p>600 x 850 x 615</p></li>
    <li role="listitem"><p>Product Depth with Doors Closed (D' mm)</p><p>660</p></li>
    <li role="listitem"><p>Product Depth with Doors Open 90 degrees (D'' mm)</p><p>1135</p></li>
    <li role="listitem"><p>Box Dimensions (WxHxD mm)</p><p>660 x 890 x 705</p></li>
  </ul></body></html>`);
  const claims = extractClaimsFromHtml(lg, {
    category: 'washing_machine',
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });

  assert.deepEqual(Object.fromEntries(claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': 600,
    'closedEnvelope.heightMm': 850,
    'closedEnvelope.depthMm': 660,
  });
  assert.match(claims.find((claim) => claim.field === 'closedEnvelope.depthMm').label, /doors closed/i);
});

test('HTML extractor does not confuse cabinet depth without the door with total product depth', () => {
  const refrigerator = Buffer.from(`<!doctype html><html><body><ul role="list">
    <li role="listitem"><p>Total Depth (mm)</p><p>715</p></li>
    <li role="listitem"><p>Depth without Door (mm)</p><p>625</p></li>
    <li role="listitem"><p>Packing Depth (mm)</p><p>776</p></li>
  </ul></body></html>`);
  const claims = extractClaimsFromHtml(refrigerator, {
    category: 'fridge',
    fields: ['closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.depthMm': 715,
  });
});

test('HTML grouped dimensions accept an explicit H*W*D axis order', () => {
  const washer = Buffer.from(`<!doctype html><html><body>
    <div class="specification"><h2>Dimensions (H*W*D) Unit: mm</h2><p>845*595*550</p></div>
  </body></html>`);
  const claims = extractClaimsFromHtml(washer, {
    category: 'washing_machine',
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  assert.deepEqual(Object.fromEntries(claims.map((claim) => [claim.field, claim.value])), {
    'closedEnvelope.widthMm': 595,
    'closedEnvelope.heightMm': 845,
    'closedEnvelope.depthMm': 550,
  });
});

test('HTML grouped dimensions fail closed when structured product rows conflict', () => {
  const conflicting = Buffer.from(`<!doctype html><html><body><ul>
    <li><span>Product Dimensions (W x H x D)</span><span>600 x 850 x 650 mm</span></li>
    <li><span>Product Dimensions (W x H x D)</span><span>700 x 850 x 650 mm</span></li>
  </ul></body></html>`);
  assert.throws(() => extractClaimsFromHtml(conflicting, {
    category: 'dryer',
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  }), /ambiguous extracted values/i);
});

test('PDF approval requires hash-bound MinerU JSON and replays claims from that JSON', () => {
  const pdfBytes = Buffer.from('%PDF-1.7\nimmutable test artifact');
  const pdfHash = createHash('sha256').update(pdfBytes).digest('hex');
  const jsonBytes = Buffer.from(JSON.stringify([[
    {
      type: 'title',
      content: { title_content: [{ type: 'text', content: 'Hisense HRCD640TBW Specifications' }], level: 2 },
      bbox: [80, 60, 400, 120],
    },
    {
      type: 'table',
      content: {
        html: '<table><tr><td>Model Number</td><td>HRCD640TBW</td></tr><tr><td>Dimensions (Net) (W x H x D)</td><td>914 x 1790 x 730 mm</td></tr></table>',
        table_caption: [], table_footnote: [], table_type: 'complex_table', table_nest_level: 1,
      },
      bbox: [80, 200, 800, 900],
    },
  ]]));
  const pdfIdentity = { brand: 'Hisense', model: 'HRCD640TBW', category: 'fridge' };
  const parsed = parseMineruContentListV2(jsonBytes, {
    pdfSha256: pdfHash, parserVersion: '3.4.4', modelRevision: MINERU_MODEL_REVISION, caseIdentity: pdfIdentity,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  const derivedArtifact = buildMineruDerivedArtifact(jsonBytes, {
    pdfSha256: pdfHash, parserVersion: '3.4.4', modelRevision: MINERU_MODEL_REVISION, pageCount: 1,
  });
  const pdfSource = {
    authority: 'manufacturer', sourceType: 'official_exact_model_pdf',
    sourceUrl: 'https://dtc-aus-api.hisense.com/medias/HRCD640TBW.pdf',
    finalUrl: 'https://dtc-aus-api.hisense.com/medias/HRCD640TBW.pdf', redirectChain: [],
    retrievedAt: '2026-07-11T14:30:00.000Z', contentSha256: pdfHash,
    objectPath: `evidence/web/sha256/${pdfHash.slice(0, 2)}/${pdfHash.slice(2, 4)}/${pdfHash}.pdf`,
    contentType: 'application/pdf', byteSize: pdfBytes.length,
    identity: { brand: 'Hisense', model: 'HRCD640TBW', outcome: 'exact' },
    claims: parsed.claims, derivedArtifact,
  };
  const attested = verifyAndAttestResolutionArtifact({
    source: pdfSource, caseIdentity: pdfIdentity, bytes: pdfBytes,
    derivedArtifactBytes: jsonBytes, verifiedAt: '2026-07-11T14:35:00.000Z',
  });
  assert.equal(attested.derivedArtifact.contentSha256, derivedArtifact.contentSha256);
  assert.equal(verifyAttestedResolutionArtifact({
    source: attested, caseIdentity: pdfIdentity, bytes: pdfBytes, derivedArtifactBytes: jsonBytes,
  }), true);

  const discoveryBytes = Buffer.from(`<!doctype html><html><body>
    <h1>HRCD640TBW product specification</h1>
    <a href="${pdfSource.sourceUrl}">Download product specification</a>
  </body></html>`);
  const discoveryHash = createHash('sha256').update(discoveryBytes).digest('hex');
  const legacyDiscovered = {
    ...attested,
    discoveryProvenance: {
      schemaVersion: 1,
      method: 'official_product_page',
      market: 'AU',
      discoveryUrl: 'https://hisense.com.au/product/hrcd640tbw/',
      requestedModel: 'HRCD640TBW',
      matchedModel: 'HRCD640TBW',
      artifactUrl: pdfSource.sourceUrl,
      artifactLinkUrl: pdfSource.sourceUrl,
      discoveryContentSha256: discoveryHash,
      discoveryObjectPath: `evidence/web/sha256/${discoveryHash.slice(0, 2)}/${discoveryHash.slice(2, 4)}/${discoveryHash}.html`,
      discoveryByteSize: discoveryBytes.length,
    },
    verificationReceipt: undefined,
  };
  legacyDiscovered.verificationReceipt = createVerificationReceipt(legacyDiscovered, pdfIdentity, {
    verifiedAt: '2026-07-11T14:35:00.000Z',
    discoveryArtifactBytes: discoveryBytes,
  });
  assert.equal(verifyAttestedResolutionArtifact({
    source: legacyDiscovered, caseIdentity: pdfIdentity, bytes: pdfBytes,
    derivedArtifactBytes: jsonBytes, discoveryArtifactBytes: discoveryBytes,
  }), true);

  const parsedV2 = parseMineruContentListV2(jsonBytes, {
    pdfSha256: pdfHash, parserVersion: '3.4.4', modelRevision: MINERU_MODEL_REVISION,
    caseIdentity: pdfIdentity, claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  });
  const attestedV2 = verifyAndAttestResolutionArtifact({
    source: { ...pdfSource, claims: parsedV2.claims },
    caseIdentity: pdfIdentity,
    bytes: pdfBytes,
    derivedArtifactBytes: jsonBytes,
    verifiedAt: '2026-07-11T14:35:00.000Z',
    claimSemanticsVersion: 2,
  });
  assert.equal(attestedV2.verificationReceipt.schemaVersion, 3);
  assert.equal(attestedV2.verificationReceipt.claimSemanticsVersion, 2);
  assert.equal(verifyAttestedResolutionArtifact({
    source: attestedV2,
    caseIdentity: pdfIdentity,
    bytes: pdfBytes,
    derivedArtifactBytes: jsonBytes,
  }), true);

  assert.throws(() => verifyAndAttestResolutionArtifact({
    source: pdfSource, caseIdentity: pdfIdentity, bytes: pdfBytes,
    verifiedAt: '2026-07-11T14:35:00.000Z',
  }), /MinerU JSON|derived artifact/i);
  assert.throws(() => verifyAndAttestResolutionArtifact({
    source: pdfSource, caseIdentity: pdfIdentity, bytes: pdfBytes,
    derivedArtifactBytes: Buffer.concat([jsonBytes, Buffer.from(' ')]),
    verifiedAt: '2026-07-11T14:35:00.000Z',
  }), /hash|byte size/i);
  assert.throws(() => verifyAndAttestResolutionArtifact({
    source: { ...pdfSource, claims: pdfSource.claims.map((claim) => (
      claim.field === 'closedEnvelope.widthMm' ? { ...claim, value: 730 } : claim
    )) },
    caseIdentity: pdfIdentity, bytes: pdfBytes, derivedArtifactBytes: jsonBytes,
    verifiedAt: '2026-07-11T14:35:00.000Z',
  }), /claim.*MinerU|MinerU.*claim/i);
});

test('PDF claim semantics v2 trusts exact MinerU replay when source labels are normalized', () => {
  const pdfBytes = Buffer.from('%PDF-1.7\nalternating axis test artifact');
  const pdfHash = createHash('sha256').update(pdfBytes).digest('hex');
  const jsonBytes = Buffer.from(JSON.stringify([[
    {
      type: 'title',
      content: { title_content: [{ type: 'text', content: 'Hisense HRCD640TBW Specifications' }], level: 2 },
      bbox: [80, 60, 400, 120],
    },
    {
      type: 'table', content: {
        html: '<table><tr><td>Model</td><td>HRCD640TBW</td></tr></table>',
        table_caption: [], table_footnote: [], table_type: 'simple_table', table_nest_level: 1,
      }, bbox: [80, 140, 800, 220],
    },
    {
      type: 'paragraph',
      content: { paragraph_content: [{ type: 'text', content: 'Dimension(mm)' }] },
      bbox: [80, 240, 300, 270],
    },
    {
      type: 'table', content: {
        html: '<table><tr><td>W</td><td>914</td><td>D</td><td>730</td></tr><tr><td>H</td><td>1790</td><td></td><td></td></tr></table>',
        table_caption: [], table_footnote: [], table_type: 'complex_table', table_nest_level: 1,
      }, bbox: [80, 300, 800, 500],
    },
  ]]));
  const caseIdentity = { brand: 'Hisense', model: 'HRCD640TBW', category: 'fridge' };
  const claims = parseMineruContentListV2(jsonBytes, {
    pdfSha256: pdfHash, parserVersion: '3.4.4', modelRevision: MINERU_MODEL_REVISION,
    caseIdentity, claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  }).claims;
  assert.ok(claims.some((claim) => claim.sourceLabel === 'Width (mm)'));
  assert.ok(!jsonBytes.toString('utf8').includes('Width (mm)'));
  const derivedArtifact = buildMineruDerivedArtifact(jsonBytes, {
    pdfSha256: pdfHash, parserVersion: '3.4.4', modelRevision: MINERU_MODEL_REVISION, pageCount: 1,
  });
  const attested = verifyAndAttestResolutionArtifact({
    source: {
      authority: 'manufacturer', sourceType: 'official_exact_model_pdf',
      sourceUrl: 'https://dtc-aus-api.hisense.com/medias/HRCD640TBW.pdf',
      finalUrl: 'https://dtc-aus-api.hisense.com/medias/HRCD640TBW.pdf', redirectChain: [],
      retrievedAt: '2026-07-11T14:30:00.000Z', contentSha256: pdfHash,
      objectPath: `evidence/web/sha256/${pdfHash.slice(0, 2)}/${pdfHash.slice(2, 4)}/${pdfHash}.pdf`,
      contentType: 'application/pdf', byteSize: pdfBytes.length,
      identity: { brand: 'Hisense', model: 'HRCD640TBW', outcome: 'exact' },
      claims, derivedArtifact,
    },
    caseIdentity, bytes: pdfBytes, derivedArtifactBytes: jsonBytes,
    verifiedAt: '2026-07-11T14:35:00.000Z', claimSemanticsVersion: 2,
  });
  assert.equal(attested.verificationReceipt.claimSemanticsVersion, 2);
});

test('PDF attestation binds a pinned hybrid image profile and rejects profile drift', () => {
  const pdfBytes = Buffer.from('%PDF-1.7\nhybrid image evidence');
  const pdfHash = createHash('sha256').update(pdfBytes).digest('hex');
  const jsonBytes = Buffer.from(JSON.stringify([[
    {
      type: 'page_header',
      content: { page_header_content: [{ type: 'text', content: 'SPEC SHEET > HRCD640TBW' }] },
      bbox: [40, 20, 500, 45],
    },
    {
      type: 'table', content: {
        html: '<table><tr><td>Width</td><td>914 mm</td></tr><tr><td>Height</td><td>1790 mm</td></tr><tr><td>Depth</td><td>730 mm</td></tr></table>',
        table_caption: [], table_footnote: [], table_type: 'simple_table', table_nest_level: 1,
      }, bbox: [80, 140, 800, 500],
    },
  ]]));
  const caseIdentity = { brand: 'Hisense', model: 'HRCD640TBW', category: 'fridge' };
  const primaryJsonBytes = Buffer.from(JSON.stringify([[
    {
      type: 'title',
      content: { title_content: [{ type: 'text', content: 'HRCD640TBW refrigerator' }] },
      bbox: [40, 20, 500, 45],
    },
    {
      type: 'image',
      content: { image_caption: ['Dimensions'], image_footnote: [] },
      bbox: [80, 140, 800, 500],
    },
  ]]));
  const primaryJsonHash = createHash('sha256').update(primaryJsonBytes).digest('hex');
  const claims = parseMineruContentListV2(jsonBytes, {
    pdfSha256: pdfHash, parserVersion: '3.4.4', modelRevision: MINERU_VLM_MODEL_REVISION,
    caseIdentity, claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  }).claims;
  const derivedArtifact = buildMineruDerivedArtifact(jsonBytes, {
    pdfSha256: pdfHash,
    parserVersion: '3.4.4',
    modelRevision: MINERU_VLM_MODEL_REVISION,
    profile: {
      profileId: 'hybrid-image-high-v1', backend: 'hybrid-engine', method: 'auto',
      effort: 'high', imageAnalysis: true,
    },
    fallbackTrigger: {
      profileId: 'pipeline-auto-v1', contentSha256: primaryJsonHash,
      objectPath: `evidence/derived/mineru-json/sha256/${primaryJsonHash.slice(0, 2)}/${primaryJsonHash.slice(2, 4)}/${primaryJsonHash}.json`,
      pages: [1],
    },
  });
  const sourceUrl = 'https://dtc-aus-api.hisense.com/medias/spec-sheet.pdf';
  const pdfSource = {
    authority: 'manufacturer', sourceType: 'official_exact_model_pdf',
    sourceUrl, finalUrl: sourceUrl, redirectChain: [],
    retrievedAt: '2026-07-14T14:30:00.000Z', contentSha256: pdfHash,
    objectPath: `evidence/web/sha256/${pdfHash.slice(0, 2)}/${pdfHash.slice(2, 4)}/${pdfHash}.pdf`,
    contentType: 'application/pdf', byteSize: pdfBytes.length,
    identity: { brand: 'Hisense', model: 'HRCD640TBW', outcome: 'exact' },
    claims, derivedArtifact,
  };
  const attested = verifyAndAttestResolutionArtifact({
    source: pdfSource, caseIdentity, bytes: pdfBytes, derivedArtifactBytes: jsonBytes,
    fallbackTriggerArtifactBytes: primaryJsonBytes,
    verifiedAt: '2026-07-14T14:35:00.000Z', claimSemanticsVersion: 2,
  });
  assert.equal(attested.derivedArtifact.profileId, 'hybrid-image-high-v1');
  assert.equal(verifyAttestedResolutionArtifact({
    source: attested, caseIdentity, bytes: pdfBytes, derivedArtifactBytes: jsonBytes,
    fallbackTriggerArtifactBytes: primaryJsonBytes,
  }), true);
  assert.throws(() => verifyAndAttestResolutionArtifact({
    source: pdfSource, caseIdentity, bytes: pdfBytes, derivedArtifactBytes: jsonBytes,
    verifiedAt: '2026-07-14T14:35:00.000Z', claimSemanticsVersion: 2,
  }), /fallback trigger artifact/i);
  assert.throws(() => verifyAndAttestResolutionArtifact({
    source: {
      ...pdfSource,
      derivedArtifact: { ...derivedArtifact, effort: 'medium' },
    },
    caseIdentity, bytes: pdfBytes, derivedArtifactBytes: jsonBytes,
    fallbackTriggerArtifactBytes: primaryJsonBytes,
    verifiedAt: '2026-07-14T14:35:00.000Z', claimSemanticsVersion: 2,
  }), /profile|MinerU JSON derived artifact metadata/i);
});

test('PDF attestation accepts only an empty hash-bound primary gap for operational hybrid fallback', () => {
  const caseIdentity = { brand: 'Hisense', model: 'HRCD640TBW', category: 'fridge' };
  const pdfBytes = Buffer.from('%PDF-1.7\noperational hybrid fallback');
  const pdfHash = createHash('sha256').update(pdfBytes).digest('hex');
  const primaryJsonBytes = Buffer.from(JSON.stringify([[]]));
  const primaryHash = createHash('sha256').update(primaryJsonBytes).digest('hex');
  const jsonBytes = Buffer.from(JSON.stringify([[
    {
      type: 'page_header',
      content: { page_header_content: [{ type: 'text', content: 'SPEC SHEET > HRCD640TBW' }] },
      bbox: [40, 20, 500, 45],
    },
    {
      type: 'table', content: {
        html: '<table><tr><td>Width</td><td>914 mm</td></tr><tr><td>Height</td><td>1790 mm</td></tr><tr><td>Depth</td><td>730 mm</td></tr></table>',
        table_caption: [], table_footnote: [], table_type: 'simple_table', table_nest_level: 1,
      }, bbox: [80, 140, 800, 500],
    },
  ]]));
  const claims = parseMineruContentListV2(jsonBytes, {
    pdfSha256: pdfHash, parserVersion: '3.4.4', modelRevision: MINERU_VLM_MODEL_REVISION,
    caseIdentity, claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
  }).claims;
  const derivedArtifact = buildMineruDerivedArtifact(jsonBytes, {
    pdfSha256: pdfHash,
    parserVersion: '3.4.4',
    modelRevision: MINERU_VLM_MODEL_REVISION,
    profile: {
      profileId: 'hybrid-image-high-v1', backend: 'hybrid-engine', method: 'auto',
      effort: 'high', imageAnalysis: true,
    },
    processedPages: [1],
    sourcePageCount: 1,
    fallbackTrigger: {
      profileId: 'pipeline-auto-v1',
      contentSha256: primaryHash,
      objectPath: `evidence/derived/mineru-json/sha256/${primaryHash.slice(0, 2)}/${primaryHash.slice(2, 4)}/${primaryHash}.json`,
      pages: [1],
      pageReasons: [{
        page: 1, reason: 'operational_page_failure', failureCode: 'MINERU_COMMAND_FAILED',
      }],
    },
  });
  const sourceUrl = 'https://dtc-aus-api.hisense.com/medias/HRCD640TBW-spec-sheet.pdf';
  const source = {
    authority: 'manufacturer', sourceType: 'official_exact_model_pdf',
    sourceUrl, finalUrl: sourceUrl, redirectChain: [],
    retrievedAt: '2026-07-15T10:00:00.000Z', contentSha256: pdfHash,
    objectPath: `evidence/web/sha256/${pdfHash.slice(0, 2)}/${pdfHash.slice(2, 4)}/${pdfHash}.pdf`,
    contentType: 'application/pdf', byteSize: pdfBytes.length,
    identity: { brand: 'Hisense', model: 'HRCD640TBW', outcome: 'exact' },
    claims, derivedArtifact,
  };
  assert.doesNotThrow(() => verifyAndAttestResolutionArtifact({
    source, caseIdentity, bytes: pdfBytes, derivedArtifactBytes: jsonBytes,
    fallbackTriggerArtifactBytes: primaryJsonBytes,
    verifiedAt: '2026-07-15T10:05:00.000Z', claimSemanticsVersion: 2,
  }));

  const nonGapPrimary = Buffer.from(JSON.stringify([[{
    type: 'paragraph', content: { paragraph_content: [{ type: 'text', content: 'ordinary text' }] },
    bbox: [1, 1, 10, 10],
  }]]));
  const nonGapHash = createHash('sha256').update(nonGapPrimary).digest('hex');
  const invalidArtifact = buildMineruDerivedArtifact(jsonBytes, {
    pdfSha256: pdfHash,
    parserVersion: '3.4.4', modelRevision: MINERU_VLM_MODEL_REVISION,
    profile: {
      profileId: 'hybrid-image-high-v1', backend: 'hybrid-engine', method: 'auto',
      effort: 'high', imageAnalysis: true,
    },
    processedPages: [1], sourcePageCount: 1,
    fallbackTrigger: {
      profileId: 'pipeline-auto-v1', contentSha256: nonGapHash,
      objectPath: `evidence/derived/mineru-json/sha256/${nonGapHash.slice(0, 2)}/${nonGapHash.slice(2, 4)}/${nonGapHash}.json`,
      pages: [1],
      pageReasons: [{
        page: 1, reason: 'operational_page_failure', failureCode: 'MINERU_COMMAND_FAILED',
      }],
    },
  });
  assert.throws(() => verifyAndAttestResolutionArtifact({
    source: { ...source, derivedArtifact: invalidArtifact },
    caseIdentity, bytes: pdfBytes, derivedArtifactBytes: jsonBytes,
    fallbackTriggerArtifactBytes: nonGapPrimary,
    verifiedAt: '2026-07-15T10:05:00.000Z', claimSemanticsVersion: 2,
  }), /not an empty primary gap/i);
});

test('a model-scoped PDF header still needs an independent exact-model source URL', () => {
  const pdfIdentity = { brand: 'Hisense', model: 'HRCD640TBW', category: 'fridge' };
  const pdfBytes = Buffer.from('%PDF-1.7\nheader-scoped artifact');
  const pdfHash = createHash('sha256').update(pdfBytes).digest('hex');
  const jsonBytes = Buffer.from(JSON.stringify([[
    {
      type: 'page_header',
      content: { page_header_content: [{ type: 'text', content: 'QUICK REFERENCE GUIDE > HRCD640TBW' }] },
      bbox: [40, 20, 500, 45],
    },
    {
      type: 'paragraph', content: { paragraph_content: [{ type: 'text', content: 'Width 914 mm' }] },
      bbox: [355, 147, 633, 171],
    },
  ]]));
  const parsed = parseMineruContentListV2(jsonBytes, {
    pdfSha256: pdfHash, parserVersion: '3.4.4', modelRevision: MINERU_MODEL_REVISION,
    caseIdentity: pdfIdentity, fields: ['closedEnvelope.widthMm'],
  });
  const derivedArtifact = buildMineruDerivedArtifact(jsonBytes, {
    pdfSha256: pdfHash, parserVersion: '3.4.4', modelRevision: MINERU_MODEL_REVISION,
  });
  const source = {
    authority: 'manufacturer',
    sourceUrl: 'https://dtc-aus-api.hisense.com/medias/generic-guide.pdf',
    finalUrl: 'https://dtc-aus-api.hisense.com/medias/generic-guide.pdf', redirectChain: [],
    retrievedAt: '2026-07-11T10:00:00.000Z', contentSha256: pdfHash,
    objectPath: `evidence/web/sha256/${pdfHash.slice(0, 2)}/${pdfHash.slice(2, 4)}/${pdfHash}.pdf`,
    contentType: 'application/pdf', byteSize: pdfBytes.length,
    identity: { brand: 'Hisense', model: 'HRCD640TBW', outcome: 'exact' },
    claims: parsed.claims, derivedArtifact,
  };
  assert.throws(() => verifyAndAttestResolutionArtifact({
    source, caseIdentity: pdfIdentity, bytes: pdfBytes,
    derivedArtifactBytes: jsonBytes, verifiedAt: '2026-07-11T10:01:00.000Z',
  }), /two independent identity signals/i);

  const exactUrl = 'https://dtc-aus-api.hisense.com/medias/HRCD640TBW.pdf';
  const attested = verifyAndAttestResolutionArtifact({
    source: { ...source, sourceUrl: exactUrl, finalUrl: exactUrl },
    caseIdentity: pdfIdentity, bytes: pdfBytes,
    derivedArtifactBytes: jsonBytes, verifiedAt: '2026-07-11T10:01:00.000Z',
  });
  assert.ok(attested.identitySignals.some((signal) => signal.type === 'pdf_source_url_model'));
});

test('a hash-bound official product page can independently bind a model-scoped PDF', () => {
  const pdfIdentity = { brand: 'Hisense', model: 'HRCD640TBW', category: 'fridge' };
  const pdfBytes = Buffer.from('%PDF-1.7\nproduct-page-bound artifact');
  const pdfHash = createHash('sha256').update(pdfBytes).digest('hex');
  const artifactUrl = 'https://dtc-aus-api.hisense.com/medias/generic-guide.pdf';
  const jsonBytes = Buffer.from(JSON.stringify([[
    {
      type: 'page_header',
      content: { page_header_content: [{ type: 'text', content: 'QUICK REFERENCE GUIDE > HRCD640TBW' }] },
      bbox: [40, 20, 500, 45],
    },
    {
      type: 'paragraph', content: { paragraph_content: [{ type: 'text', content: 'Width 914 mm' }] },
      bbox: [355, 147, 633, 171],
    },
  ]]));
  const parsed = parseMineruContentListV2(jsonBytes, {
    pdfSha256: pdfHash, parserVersion: '3.4.4', modelRevision: MINERU_MODEL_REVISION,
    caseIdentity: pdfIdentity, fields: ['closedEnvelope.widthMm'],
  });
  const derivedArtifact = buildMineruDerivedArtifact(jsonBytes, {
    pdfSha256: pdfHash, parserVersion: '3.4.4', modelRevision: MINERU_MODEL_REVISION,
  });
  const discoveryBytes = Buffer.from(`<!doctype html><html><head>
    <title>HRCD640TBW refrigerator support | Hisense Australia</title>
  </head><body><a href="${artifactUrl}">Download product specification</a></body></html>`);
  const discoveryHash = createHash('sha256').update(discoveryBytes).digest('hex');
  const discoveryProvenance = {
    schemaVersion: 1,
    method: 'official_product_page',
    market: 'AU',
    discoveryUrl: 'https://hisense.com.au/product/hrcd640tbw/',
    requestedModel: 'HRCD640TBW',
    matchedModel: 'HRCD640TBW',
    artifactUrl,
    artifactLinkUrl: artifactUrl,
    discoveryContentSha256: discoveryHash,
    discoveryObjectPath: `evidence/web/sha256/${discoveryHash.slice(0, 2)}/${discoveryHash.slice(2, 4)}/${discoveryHash}.html`,
    discoveryByteSize: discoveryBytes.length,
  };
  const pdfSource = {
    authority: 'manufacturer', sourceType: 'official_exact_model_pdf',
    sourceUrl: artifactUrl, finalUrl: artifactUrl, redirectChain: [],
    retrievedAt: '2026-07-15T00:00:00.000Z', contentSha256: pdfHash,
    objectPath: `evidence/web/sha256/${pdfHash.slice(0, 2)}/${pdfHash.slice(2, 4)}/${pdfHash}.pdf`,
    contentType: 'application/pdf', byteSize: pdfBytes.length,
    identity: { brand: 'Hisense', model: 'HRCD640TBW', outcome: 'exact' },
    claims: parsed.claims, derivedArtifact, discoveryProvenance,
  };

  const attested = verifyAndAttestResolutionArtifact({
    source: pdfSource, caseIdentity: pdfIdentity, bytes: pdfBytes,
    derivedArtifactBytes: jsonBytes, discoveryArtifactBytes: discoveryBytes,
    verifiedAt: '2026-07-15T00:01:00.000Z',
  });
  assert.deepEqual(new Set(attested.identitySignals.map((signal) => signal.type)), new Set([
    'mineru_page_header_model',
    'official_product_page_model',
  ]));
  assert.equal(verifyAttestedResolutionArtifact({
    source: attested, caseIdentity: pdfIdentity, bytes: pdfBytes,
    derivedArtifactBytes: jsonBytes, discoveryArtifactBytes: discoveryBytes,
  }), true);

  const tamperedDiscoveryBytes = Buffer.from(discoveryBytes.toString('utf8').replace('HRCD640TBW', 'HRCD640TBX'));
  assert.throws(() => verifyAndAttestResolutionArtifact({
    source: pdfSource, caseIdentity: pdfIdentity, bytes: pdfBytes,
    derivedArtifactBytes: jsonBytes, discoveryArtifactBytes: tamperedDiscoveryBytes,
    verifiedAt: '2026-07-15T00:01:00.000Z',
  }), /discovery artifact hash mismatch/i);
});

test('a hash-bound official AU market API can independently bind an exact ASKO model PDF', () => {
  const pdfIdentity = { brand: 'ASKO', model: 'T408HD.W', category: 'dryer' };
  const pdfBytes = Buffer.from('%PDF-1.7\nasko-api-bound artifact');
  const pdfHash = createHash('sha256').update(pdfBytes).digest('hex');
  const artifactUrl = 'https://partners.gorenje.com/fts/htmlNavodila/870866en.pdf';
  const jsonBytes = Buffer.from(JSON.stringify([[
    {
      type: 'page_header',
      content: { page_header_content: [{ type: 'text', content: 'Tumble dryer T408HD' }] },
      bbox: [40, 20, 500, 45],
    },
    {
      type: 'table',
      content: {
        html: '<table><tr><td>Height 850</td><td>mm</td></tr><tr><td>Width 595</td><td>mm</td></tr><tr><td>Depth 654</td><td>mm</td></tr></table>',
      },
      bbox: [355, 147, 633, 240],
    },
  ]]));
  const parsed = parseMineruContentListV2(jsonBytes, {
    pdfSha256: pdfHash, parserVersion: '3.4.4', modelRevision: MINERU_MODEL_REVISION,
    caseIdentity: pdfIdentity, fields: ['closedEnvelope.widthMm'],
    claimSemanticsVersion: 2, boundFamilyModel: 'T408HD',
  });
  const derivedArtifact = buildMineruDerivedArtifact(jsonBytes, {
    pdfSha256: pdfHash, parserVersion: '3.4.4', modelRevision: MINERU_MODEL_REVISION,
  });
  const discoveryPayload = {
    code: '000000000000576719',
    modelMark: 'T408HD.W',
    documents: [{ url: artifactUrl, name: 'Instructions for use' }],
    classifications: [{ features: [
      { name: 'Width', featureUnit: { symbol: 'mm' }, featureValues: [{ value: '595' }] },
      { name: 'Height', featureUnit: { symbol: 'mm' }, featureValues: [{ value: '850' }] },
      { name: 'Depth', featureUnit: { symbol: 'mm' }, featureValues: [{ value: '654' }] },
    ] }],
  };
  const discoveryBytes = Buffer.from(JSON.stringify(discoveryPayload));
  const discoveryHash = createHash('sha256').update(discoveryBytes).digest('hex');
  const discoveryProvenance = {
    schemaVersion: 1,
    method: 'official_market_api',
    market: 'AU',
    discoveryUrl: 'https://api-storefront.asko.com/ggcommercewebservices/v2/asko-au/products/manuals/search?query=T408HD.W&lang=en_AU&curr=AUD',
    requestedModel: 'T408HD.W',
    matchedModel: 'T408HD.W',
    artifactUrl,
    discoveryContentSha256: discoveryHash,
    discoveryObjectPath: `evidence/web/sha256/${discoveryHash.slice(0, 2)}/${discoveryHash.slice(2, 4)}/${discoveryHash}.json`,
    discoveryByteSize: discoveryBytes.length,
  };
  const pdfSource = {
    authority: 'manufacturer', sourceType: 'official_exact_model_pdf',
    sourceUrl: artifactUrl, finalUrl: artifactUrl, redirectChain: [],
    retrievedAt: '2026-07-15T00:00:00.000Z', contentSha256: pdfHash,
    objectPath: `evidence/web/sha256/${pdfHash.slice(0, 2)}/${pdfHash.slice(2, 4)}/${pdfHash}.pdf`,
    contentType: 'application/pdf', byteSize: pdfBytes.length,
    identity: { brand: 'ASKO', model: 'T408HD.W', outcome: 'exact' },
    claims: parsed.claims, derivedArtifact, discoveryProvenance,
  };

  const attested = verifyAndAttestResolutionArtifact({
    source: pdfSource, caseIdentity: pdfIdentity, bytes: pdfBytes,
    derivedArtifactBytes: jsonBytes, discoveryArtifactBytes: discoveryBytes,
    verifiedAt: '2026-07-15T00:01:00.000Z', claimSemanticsVersion: 2,
  });
  assert.deepEqual(new Set(attested.identitySignals.map((signal) => signal.type)), new Set([
    'mineru_bound_family_model',
    'official_market_api_model',
    'official_market_api_dimensions',
  ]));
  assert.equal(verifyAttestedResolutionArtifact({
    source: attested, caseIdentity: pdfIdentity, bytes: pdfBytes,
    derivedArtifactBytes: jsonBytes, discoveryArtifactBytes: discoveryBytes,
  }), true);

  const siblingBytes = Buffer.from(JSON.stringify({
    modelMark: 'T408HD.W.AU', documents: [{ url: artifactUrl }],
  }));
  const siblingHash = createHash('sha256').update(siblingBytes).digest('hex');
  assert.throws(() => verifyAndAttestResolutionArtifact({
    source: {
      ...pdfSource,
      discoveryProvenance: {
        ...discoveryProvenance,
        discoveryContentSha256: siblingHash,
        discoveryObjectPath: `evidence/web/sha256/${siblingHash.slice(0, 2)}/${siblingHash.slice(2, 4)}/${siblingHash}.json`,
        discoveryByteSize: siblingBytes.length,
      },
    },
    caseIdentity: pdfIdentity, bytes: pdfBytes,
    derivedArtifactBytes: jsonBytes, discoveryArtifactBytes: siblingBytes,
    verifiedAt: '2026-07-15T00:01:00.000Z', claimSemanticsVersion: 2,
  }), /does not prove the exact model/i);
});

test('an exact ASKO API may bind a series-placeholder manual only when all PDF dimensions match PIM', () => {
  const pdfIdentity = { brand: 'ASKO', model: 'W4086P.W', category: 'washing_machine' };
  const pdfBytes = Buffer.from('%PDF-1.7\nasko-api-bound series artifact');
  const pdfHash = createHash('sha256').update(pdfBytes).digest('hex');
  const artifactUrl = 'https://partners.gorenje.com/fts/GetDigitDoc.aspx?docName=574443en.pdf';
  const jsonBytes = Buffer.from(JSON.stringify([[
    {
      type: 'index',
      content: { list_items: [{ item_content: [{ type: 'text', content: 'W4086X/1/2/3' }] }] },
      bbox: [700, 800, 940, 850],
    },
    {
      type: 'table',
      content: {
        html: '<table><tr><td>Height 850</td><td>mm</td></tr><tr><td>Width 595</td><td>mm</td></tr><tr><td>Depth 585</td><td>mm</td></tr></table>',
      },
      bbox: [355, 147, 633, 240],
    },
  ]]));
  const derivedArtifact = buildMineruDerivedArtifact(jsonBytes, {
    pdfSha256: pdfHash, parserVersion: '3.4.4', modelRevision: MINERU_MODEL_REVISION,
  });
  const discoveryPayload = {
    code: '000000000000738297',
    modelMark: 'W4086P.W',
    documents: [{ url: artifactUrl, name: 'Instructions for use' }],
    classifications: [{ features: [
      { name: 'Width', featureUnit: { symbol: 'mm' }, featureValues: [{ value: '595' }] },
      { name: 'Height', featureUnit: { symbol: 'mm' }, featureValues: [{ value: '850' }] },
      { name: 'Depth', featureUnit: { symbol: 'mm' }, featureValues: [{ value: '585' }] },
    ] }],
  };
  const discoveryBytes = Buffer.from(JSON.stringify(discoveryPayload));
  const discoveryHash = createHash('sha256').update(discoveryBytes).digest('hex');
  const discoveryProvenance = {
    schemaVersion: 1,
    method: 'official_market_api',
    market: 'AU',
    discoveryUrl: 'https://api-storefront.asko.com/ggcommercewebservices/v2/asko-au/products/000000000000738297?fields=FULL&lang=en_AU&curr=AUD',
    requestedModel: 'W4086P.W',
    matchedModel: 'W4086P.W',
    artifactUrl,
    discoveryContentSha256: discoveryHash,
    discoveryObjectPath: `evidence/web/sha256/${discoveryHash.slice(0, 2)}/${discoveryHash.slice(2, 4)}/${discoveryHash}.json`,
    discoveryByteSize: discoveryBytes.length,
  };
  const claims = parseMineruContentListV2(jsonBytes, {
    pdfSha256: pdfHash, parserVersion: '3.4.4', modelRevision: MINERU_MODEL_REVISION,
    caseIdentity: pdfIdentity,
    fields: [
      'closedEnvelope.widthMm',
      'closedEnvelope.heightMm',
      'closedEnvelope.depthMm',
    ],
    claimSemanticsVersion: 2,
    boundSeriesModel: 'W4086',
  }).claims;
  const pdfSource = {
    authority: 'manufacturer', sourceType: 'official_exact_model_pdf',
    sourceUrl: artifactUrl, finalUrl: artifactUrl, redirectChain: [],
    retrievedAt: '2026-07-15T00:00:00.000Z', contentSha256: pdfHash,
    objectPath: `evidence/web/sha256/${pdfHash.slice(0, 2)}/${pdfHash.slice(2, 4)}/${pdfHash}.pdf`,
    contentType: 'application/pdf', byteSize: pdfBytes.length,
    identity: { brand: 'ASKO', model: 'W4086P.W', outcome: 'exact' },
    claims, derivedArtifact, discoveryProvenance,
  };

  const attested = verifyAndAttestResolutionArtifact({
    source: pdfSource, caseIdentity: pdfIdentity, bytes: pdfBytes,
    derivedArtifactBytes: jsonBytes, discoveryArtifactBytes: discoveryBytes,
    verifiedAt: '2026-07-15T00:01:00.000Z', claimSemanticsVersion: 2,
  });
  assert.ok(attested.identitySignals.some((signal) => signal.type === 'mineru_bound_series_model'));
  assert.equal(verifyAttestedResolutionArtifact({
    source: attested, caseIdentity: pdfIdentity, bytes: pdfBytes,
    derivedArtifactBytes: jsonBytes, discoveryArtifactBytes: discoveryBytes,
  }), true);

  const mismatchedPayload = structuredClone(discoveryPayload);
  mismatchedPayload.classifications[0].features
    .find((feature) => feature.name === 'Depth').featureValues[0].value = '640';
  const mismatchedBytes = Buffer.from(JSON.stringify(mismatchedPayload));
  const mismatchedHash = createHash('sha256').update(mismatchedBytes).digest('hex');
  assert.throws(() => verifyAndAttestResolutionArtifact({
    source: {
      ...pdfSource,
      discoveryProvenance: {
        ...discoveryProvenance,
        discoveryContentSha256: mismatchedHash,
        discoveryObjectPath: `evidence/web/sha256/${mismatchedHash.slice(0, 2)}/${mismatchedHash.slice(2, 4)}/${mismatchedHash}.json`,
        discoveryByteSize: mismatchedBytes.length,
      },
    },
    caseIdentity: pdfIdentity, bytes: pdfBytes,
    derivedArtifactBytes: jsonBytes, discoveryArtifactBytes: mismatchedBytes,
    verifiedAt: '2026-07-15T00:01:00.000Z', claimSemanticsVersion: 2,
  }), /PIM dimensions/i);
});

test('an exact ASKO API binds an exact cover model list while retaining an adjustable height range', () => {
  const pdfIdentity = { brand: 'ASKO', model: 'DBI343ID.W.AU', category: 'dishwasher' };
  const pdfBytes = Buffer.from('%PDF-1.7\nasko exact-cover dishwasher artifact');
  const pdfHash = createHash('sha256').update(pdfBytes).digest('hex');
  const artifactUrl = 'https://partners.gorenje.com/fts/GetDigitDoc.aspx?docName=874270en.pdf';
  const jsonBytes = Buffer.from(JSON.stringify([
    [{ type: 'paragraph', content: { paragraph_content: [{ type: 'text', content: 'DBI343ID.W.AU DBI343ID.S.AU' }] }, bbox: [40, 40, 700, 90] }],
    [{ type: 'table', content: { html: '<table><tr><td>Technical data</td></tr><tr><td>Height:</td><td>819-872 mm</td></tr><tr><td>Width:</td><td>596 mm</td></tr><tr><td>Depth:</td><td>554 mm</td></tr><tr><td>Weight:</td><td>45 kg</td></tr></table>' }, bbox: [80, 140, 800, 500] }],
  ]));
  const derivedArtifact = buildMineruDerivedArtifact(jsonBytes, {
    pdfSha256: pdfHash, parserVersion: '3.4.4', modelRevision: MINERU_MODEL_REVISION,
  });
  const discoveryPayload = {
    code: '000000000000739996', modelMark: 'DBI343ID.W.AU',
    documents: [{ url: artifactUrl, name: 'Instructions for use' }],
    classifications: [{ features: [
      { name: 'Width', featureUnit: { symbol: 'mm' }, featureValues: [{ value: '596' }] },
      { name: 'Height', featureUnit: { symbol: 'mm' }, featureValues: [{ value: '819' }] },
      { name: 'Depth', featureUnit: { symbol: 'mm' }, featureValues: [{ value: '554' }] },
    ] }],
  };
  const discoveryBytes = Buffer.from(JSON.stringify(discoveryPayload));
  const discoveryHash = createHash('sha256').update(discoveryBytes).digest('hex');
  const discoveryProvenance = {
    schemaVersion: 1, method: 'official_market_api', market: 'AU',
    discoveryUrl: 'https://api-storefront.asko.com/ggcommercewebservices/v2/asko-au/products/000000000000739996?fields=FULL&lang=en_AU&curr=AUD',
    requestedModel: pdfIdentity.model, matchedModel: pdfIdentity.model, artifactUrl,
    discoveryContentSha256: discoveryHash,
    discoveryObjectPath: `evidence/web/sha256/${discoveryHash.slice(0, 2)}/${discoveryHash.slice(2, 4)}/${discoveryHash}.json`,
    discoveryByteSize: discoveryBytes.length,
  };
  const claims = parseMineruContentListV2(jsonBytes, {
    pdfSha256: pdfHash, parserVersion: '3.4.4', modelRevision: MINERU_MODEL_REVISION,
    caseIdentity: pdfIdentity, claimSemanticsVersion: 2,
    fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
    boundExactCoverModel: pdfIdentity.model,
  }).claims;
  const pdfSource = {
    authority: 'manufacturer', sourceType: 'official_exact_model_pdf',
    sourceUrl: artifactUrl, finalUrl: artifactUrl, redirectChain: [],
    retrievedAt: '2026-07-15T00:00:00.000Z', contentSha256: pdfHash,
    objectPath: `evidence/web/sha256/${pdfHash.slice(0, 2)}/${pdfHash.slice(2, 4)}/${pdfHash}.pdf`,
    contentType: 'application/pdf', byteSize: pdfBytes.length,
    identity: { brand: 'ASKO', model: pdfIdentity.model, outcome: 'exact' },
    claims, derivedArtifact, discoveryProvenance,
  };
  const attested = verifyAndAttestResolutionArtifact({
    source: pdfSource, caseIdentity: pdfIdentity, bytes: pdfBytes,
    derivedArtifactBytes: jsonBytes, discoveryArtifactBytes: discoveryBytes,
    verifiedAt: '2026-07-15T00:01:00.000Z', claimSemanticsVersion: 2,
  });
  assert.ok(attested.identitySignals.some((signal) => signal.type === 'mineru_bound_exact_cover_model'));
  assert.deepEqual(claims.find((claim) => claim.field === 'closedEnvelope.heightMm').value,
    { kind: 'range', minMm: 819, maxMm: 872 });

  const mismatchedPayload = structuredClone(discoveryPayload);
  mismatchedPayload.classifications[0].features
    .find((feature) => feature.name === 'Height').featureValues[0].value = '850';
  const mismatchedBytes = Buffer.from(JSON.stringify(mismatchedPayload));
  const mismatchedHash = createHash('sha256').update(mismatchedBytes).digest('hex');
  assert.throws(() => verifyAndAttestResolutionArtifact({
    source: { ...pdfSource, discoveryProvenance: {
      ...discoveryProvenance, discoveryContentSha256: mismatchedHash,
      discoveryObjectPath: `evidence/web/sha256/${mismatchedHash.slice(0, 2)}/${mismatchedHash.slice(2, 4)}/${mismatchedHash}.json`,
      discoveryByteSize: mismatchedBytes.length,
    } },
    caseIdentity: pdfIdentity, bytes: pdfBytes,
    derivedArtifactBytes: jsonBytes, discoveryArtifactBytes: mismatchedBytes,
    verifiedAt: '2026-07-15T00:01:00.000Z', claimSemanticsVersion: 2,
  }), /PIM dimensions/i);
});

test('artifact verification catches hash drift, claim drift, and multi-product quote leakage', () => {
  const bytes = html();
  assert.throws(() => verifyAndAttestResolutionArtifact({
    source: source(bytes, { contentSha256: 'b'.repeat(64) }),
    caseIdentity: identity, bytes, verifiedAt: '2026-07-11T14:35:00.000Z',
  }), /hash/i);
  assert.throws(() => verifyAndAttestResolutionArtifact({
    source: source(bytes, { claims: [{
      field: 'closedEnvelope.widthMm', value: 1, unit: 'mm',
      label: 'Total width (mm)', quote: 'Total width (mm) 913 mm',
    }] }),
    caseIdentity: identity, bytes, verifiedAt: '2026-07-11T14:35:00.000Z',
  }), /quoted value/i);

  const generic = Buffer.from('<html><head><title>All fridges</title><link rel="canonical" href="https://www.westinghouse.com.au/fridges/"></head><body>WHE6874BA Total width (mm) 913 mm WHE6874SA Total height (mm) 1782 mm</body></html>');
  assert.throws(() => verifyAndAttestResolutionArtifact({
    source: source(generic, {
      contentSha256: createHash('sha256').update(generic).digest('hex'), byteSize: generic.length,
    }),
    caseIdentity: identity, bytes: generic, verifiedAt: '2026-07-11T14:35:00.000Z',
  }), /canonical.*model|identity/i);
});
