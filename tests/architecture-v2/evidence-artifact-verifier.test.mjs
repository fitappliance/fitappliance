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
  validateClaimSemantics,
  validateClaimsSemantics,
} from '../../src/domain/evidence-claim-semantics.mjs';
import {
  buildMineruDerivedArtifact,
  parseMineruContentListV2,
} from '../../src/domain/mineru-document.mjs';

const identity = { brand: 'Westinghouse', model: 'WHE6874BA', category: 'fridge' };
const MINERU_MODEL_REVISION = 'ed6b654c018d742e65a17671e379c5e6ecc87ec9';

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
