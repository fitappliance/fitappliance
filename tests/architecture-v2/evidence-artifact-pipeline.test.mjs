import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  acquireEvidenceArtifact,
  attestEvidenceArtifactForCase,
} from '../../src/domain/evidence-artifact-pipeline.mjs';
import { buildMineruDerivedArtifact } from '../../src/domain/mineru-document.mjs';

const MODEL_REVISION = 'ed6b654c018d742e65a17671e379c5e6ecc87ec9';
const VLM_MODEL_REVISION = 'bff20d4ae2bf202df9f45284b4d43681555a97ed';
const POLICY_SHA = 'a'.repeat(64);

function fixture() {
  const pdfBytes = Buffer.from('%PDF-1.7\nshared immutable artifact');
  const pdfSha256 = createHash('sha256').update(pdfBytes).digest('hex');
  const jsonBytes = Buffer.from(JSON.stringify([[
    {
      type: 'title',
      content: { title_content: [{ type: 'text', content: 'Hisense HRCD640TBW Specifications' }] },
      bbox: [80, 60, 400, 120],
    },
    {
      type: 'table',
      content: {
        html: '<table><tr><td>Model Number</td><td>HRCD640TBW</td></tr><tr><td>Dimensions (W x H x D)</td><td>914 x 1790 x 730 mm</td></tr></table>',
      },
      bbox: [80, 200, 800, 900],
    },
  ]]));
  return { pdfBytes, pdfSha256, jsonBytes };
}

function caseRecord(model) {
  return {
    id: `case-${model}`,
    brand: 'Hisense',
    model,
    category: 'fridge',
    sources: [],
  };
}

test('one shared URL causes one fetch and MinerU conversion but target-specific attestations', async () => {
  const { pdfBytes, pdfSha256, jsonBytes } = fixture();
  const counts = { fetch: 0, mineru: 0, writes: 0 };
  const artifactCache = new Map();
  const contentCache = new Map();
  const options = {
    authorityBrand: 'Hisense',
    authorityMode: 'official',
    transportPolicySha256: POLICY_SHA,
    artifactCache,
    contentCache,
    fetchArtifact: async (url, brand) => {
      counts.fetch += 1;
      assert.equal(brand, 'Hisense');
      return {
        requestedUrl: url,
        finalUrl: url,
        redirectChain: [],
        contentType: 'application/pdf',
        bytes: pdfBytes,
      };
    },
    processPdf: async () => {
      counts.mineru += 1;
      return {
        jsonBytes,
        derivedArtifact: buildMineruDerivedArtifact(jsonBytes, {
          pdfSha256,
          parserVersion: '3.4.4',
          modelRevision: MODEL_REVISION,
        }),
      };
    },
    writeObject: async () => { counts.writes += 1; },
  };
  const candidate = { sourceUrl: 'https://dtc-aus-api.hisense.com/medias/HRCD640TBW.pdf' };
  const [first, second] = await Promise.all([
    acquireEvidenceArtifact(candidate, options),
    acquireEvidenceArtifact(candidate, options),
  ]);
  assert.equal(first, second);
  assert.deepEqual(counts, { fetch: 1, mineru: 1, writes: 2 });

  await assert.rejects(() => attestEvidenceArtifactForCase(caseRecord('HRCD640TBX'), first, {
    now: '2026-07-13T00:00:00.000Z',
    requestedFields: ['closedEnvelope.widthMm'],
    claimSemanticsVersion: 2,
  }), /exact model|identity/i);

  const accepted = await attestEvidenceArtifactForCase(caseRecord('HRCD640TBW'), first, {
    now: '2026-07-13T00:00:00.000Z',
    requestedFields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
    ],
    claimSemanticsVersion: 2,
    requireRequestedFieldCoverage: true,
  });
  assert.equal(accepted.source.identity.model, 'HRCD640TBW');
  assert.equal(accepted.source.verificationReceipt.schemaVersion, 3);
  assert.equal(counts.fetch, 1);
  assert.equal(counts.mineru, 1);
});

test('transport cache never shares a host verdict across authority brands', async () => {
  const { pdfBytes } = fixture();
  let fetches = 0;
  const artifactCache = new Map();
  const common = {
    authorityMode: 'official',
    transportPolicySha256: POLICY_SHA,
    artifactCache,
    contentCache: new Map(),
    fetchArtifact: async (url) => {
      fetches += 1;
      return { requestedUrl: url, finalUrl: url, redirectChain: [], contentType: 'application/pdf', bytes: pdfBytes };
    },
    processPdf: async () => { throw new Error('stop after proving transport isolation'); },
    writeObject: async () => {},
  };
  const candidate = { sourceUrl: 'https://example.invalid/shared.pdf' };
  await Promise.allSettled([
    acquireEvidenceArtifact(candidate, { ...common, authorityBrand: 'Hisense' }),
    acquireEvidenceArtifact(candidate, { ...common, authorityBrand: 'Samsung' }),
  ]);
  assert.equal(fetches, 2);
});

test('same content from two URLs reuses raw/MinerU objects by content SHA', async () => {
  const { pdfBytes, pdfSha256, jsonBytes } = fixture();
  let parses = 0;
  let writes = 0;
  const common = {
    authorityBrand: 'Hisense', authorityMode: 'official', transportPolicySha256: POLICY_SHA,
    artifactCache: new Map(), contentCache: new Map(),
    fetchArtifact: async (url) => ({
      requestedUrl: url, finalUrl: url, redirectChain: [], contentType: 'application/pdf', bytes: pdfBytes,
    }),
    processPdf: async () => {
      parses += 1;
      return {
        jsonBytes,
        derivedArtifact: buildMineruDerivedArtifact(jsonBytes, {
          pdfSha256, parserVersion: '3.4.4', modelRevision: MODEL_REVISION,
        }),
      };
    },
    writeObject: async () => { writes += 1; },
  };
  await Promise.all([
    acquireEvidenceArtifact({ sourceUrl: 'https://dtc-aus-api.hisense.com/a.pdf' }, common),
    acquireEvidenceArtifact({ sourceUrl: 'https://dtc-aus-api.hisense.com/b.pdf' }, common),
  ]);
  assert.equal(parses, 1);
  assert.equal(writes, 2);
});

test('persisted artifact metadata rehydrates immutable objects without network or MinerU', async () => {
  const { pdfBytes, pdfSha256, jsonBytes } = fixture();
  const objects = new Map();
  let record;
  const base = {
    authorityBrand: 'Hisense', authorityMode: 'official', transportPolicySha256: POLICY_SHA,
    fetchArtifact: async (url) => ({
      requestedUrl: url, finalUrl: url, redirectChain: [], contentType: 'application/pdf', bytes: pdfBytes,
    }),
    processPdf: async () => ({
      jsonBytes,
      derivedArtifact: buildMineruDerivedArtifact(jsonBytes, {
        pdfSha256, parserVersion: '3.4.4', modelRevision: MODEL_REVISION,
      }),
    }),
    writeObject: async (path, bytes) => objects.set(path, Buffer.from(bytes)),
    writeArtifactRecord: async (value) => { record = structuredClone(value); },
  };
  const candidate = { sourceUrl: 'https://dtc-aus-api.hisense.com/medias/HRCD640TBW.pdf' };
  const acquired = await acquireEvidenceArtifact(candidate, base);
  const rehydrated = await acquireEvidenceArtifact(candidate, {
    ...base,
    artifactCache: new Map(),
    contentCache: new Map(),
    fetchArtifact: async () => assert.fail('network must not run'),
    processPdf: async () => assert.fail('MinerU must not run'),
    readArtifactRecord: async () => record,
    readObject: async (path) => objects.get(path),
  });
  assert.equal(rehydrated.contentSha256, acquired.contentSha256);
  assert.deepEqual(rehydrated.derivedArtifact, acquired.derivedArtifact);
});

test('hybrid fallback persists and rehydrates the hash-bound primary trigger for attestation', async () => {
  const pdfBytes = Buffer.from('%PDF-1.7\nhybrid artifact');
  const pdfSha256 = createHash('sha256').update(pdfBytes).digest('hex');
  const primaryJsonBytes = Buffer.from(JSON.stringify([[
    {
      type: 'title',
      content: { title_content: [{ type: 'text', content: 'HRCD640TBW refrigerator' }] },
      bbox: [40, 20, 500, 45],
    },
    {
      type: 'image', content: { image_caption: ['Product dimensions'], image_footnote: [] },
      bbox: [80, 140, 800, 500],
    },
  ]]));
  const primaryHash = createHash('sha256').update(primaryJsonBytes).digest('hex');
  const hybridJsonBytes = Buffer.from(JSON.stringify([[
    {
      type: 'title',
      content: { title_content: [{ type: 'text', content: 'Product dimensions' }] },
      bbox: [40, 20, 500, 45],
    },
    {
      type: 'table', content: {
        html: '<table><tr><td>Model</td><td>HRCD640TBW</td></tr><tr><td>Width</td><td>914 mm</td></tr><tr><td>Height</td><td>1790 mm</td></tr><tr><td>Depth</td><td>730 mm</td></tr></table>',
      }, bbox: [80, 140, 800, 500],
    },
  ]]));
  const derivedArtifact = buildMineruDerivedArtifact(hybridJsonBytes, {
    pdfSha256,
    parserVersion: '3.4.4',
    modelRevision: VLM_MODEL_REVISION,
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
    },
  });
  const objects = new Map();
  let record;
  const base = {
    authorityBrand: 'Hisense', authorityMode: 'official', transportPolicySha256: POLICY_SHA,
    fetchArtifact: async (url) => ({
      requestedUrl: url, finalUrl: url, redirectChain: [], contentType: 'application/pdf', bytes: pdfBytes,
    }),
    processPdf: async () => ({
      jsonBytes: hybridJsonBytes, derivedArtifact, primaryJsonBytes,
    }),
    writeObject: async (path, bytes) => objects.set(path, Buffer.from(bytes)),
    writeArtifactRecord: async (value) => { record = structuredClone(value); },
  };
  const candidate = { sourceUrl: 'https://dtc-aus-api.hisense.com/medias/HRCD640TBW.pdf' };
  const acquired = await acquireEvidenceArtifact(candidate, base);
  assert.deepEqual(acquired.fallbackTriggerArtifactBytes, primaryJsonBytes);
  assert.ok(objects.has(derivedArtifact.fallbackTrigger.objectPath));

  const rehydrated = await acquireEvidenceArtifact(candidate, {
    ...base,
    artifactCache: new Map(), contentCache: new Map(),
    fetchArtifact: async () => assert.fail('network must not run'),
    processPdf: async () => assert.fail('MinerU must not run'),
    readArtifactRecord: async () => record,
    readObject: async (path) => objects.get(path),
  });
  assert.deepEqual(rehydrated.fallbackTriggerArtifactBytes, primaryJsonBytes);
  const accepted = await attestEvidenceArtifactForCase(caseRecord('HRCD640TBW'), rehydrated, {
    now: '2026-07-14T15:00:00.000Z',
    requestedFields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
    ],
    claimSemanticsVersion: 2,
    requireRequestedFieldCoverage: true,
  });
  assert.equal(accepted.source.derivedArtifact.profileId, 'hybrid-image-high-v1');
  assert.equal(accepted.source.verificationReceipt.schemaVersion, 3);
});

test('attestation loads immutable product-page discovery evidence through the object store', async () => {
  const model = 'WHE6874BA';
  const artifactUrl = `https://www.westinghouse.com.au/fridges/${model.toLowerCase()}/`;
  const bytes = Buffer.from(`<!doctype html><html><head>
    <title>${model} refrigerator</title>
    <link rel="canonical" href="${artifactUrl}">
  </head><body data-product-model="${model}"><dl>
    <dt>Total width (mm)</dt><dd>913 mm</dd>
  </dl></body></html>`);
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');
  const discoveryBytes = Buffer.from(`<!doctype html><html><body>
    <h1>${model} support</h1><a href="${artifactUrl}">Specifications</a>
  </body></html>`);
  const discoveryContentSha256 = createHash('sha256').update(discoveryBytes).digest('hex');
  const discoveryObjectPath = `evidence/web/sha256/${discoveryContentSha256.slice(0, 2)}/${discoveryContentSha256.slice(2, 4)}/${discoveryContentSha256}.html`;
  const reads = [];
  const result = await attestEvidenceArtifactForCase({
    id: `case-${model}`,
    brand: 'Westinghouse',
    model,
    category: 'fridge',
    sources: [],
  }, {
    authorityMode: 'official',
    authorityBrand: 'Westinghouse',
    requestedUrl: artifactUrl,
    finalUrl: artifactUrl,
    redirectChain: [],
    contentType: 'text/html',
    contentSha256,
    objectPath: `evidence/web/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}.html`,
    byteSize: bytes.length,
    bytes,
  }, {
    now: '2026-07-13T00:00:00.000Z',
    requestedFields: ['closedEnvelope.widthMm'],
    claimSemanticsVersion: 2,
    discoveryProvenance: {
      schemaVersion: 1,
      method: 'official_product_page',
      market: 'AU',
      discoveryUrl: `https://www.westinghouse.com.au/au/support/${model.toLowerCase()}/`,
      requestedModel: model,
      matchedModel: model,
      artifactUrl,
      artifactLinkUrl: artifactUrl,
      discoveryContentSha256,
      discoveryObjectPath,
      discoveryByteSize: discoveryBytes.length,
    },
    readObject: async (path) => {
      reads.push(path);
      return discoveryBytes;
    },
  });

  assert.deepEqual(reads, [discoveryObjectPath]);
  assert.equal(result.source.verificationReceipt.schemaVersion, 3);
});

test('ASKO AU API variant attestation parses the source model and emits a dimensions-only model-variant PDF', async () => {
  const targetModel = 'W4104C.W';
  const sourceModel = 'W4104C.W.AU';
  const artifactUrl = 'https://asko.hgecdn.net/medias/productSheet-W4104C-W-AU.pdf';
  const pdfBytes = Buffer.from('%PDF-1.7\nASKO W4104C.W.AU product sheet');
  const pdfSha256 = createHash('sha256').update(pdfBytes).digest('hex');
  const jsonBytes = Buffer.from(JSON.stringify([
    [{
      type: 'paragraph',
      content: { paragraph_content: [{ type: 'text', content: sourceModel }] },
      bbox: [40, 40, 400, 80],
    }],
    [
      { type: 'title', content: { title_content: [{ type: 'text', content: 'Dimensions' }] }, bbox: [40, 40, 300, 80] },
      { type: 'paragraph', content: { paragraph_content: [{ type: 'text', content: 'Width: 595 mm' }] }, bbox: [40, 100, 300, 125] },
      { type: 'paragraph', content: { paragraph_content: [{ type: 'text', content: 'Height: 850 mm' }] }, bbox: [40, 130, 300, 155] },
      { type: 'paragraph', content: { paragraph_content: [{ type: 'text', content: 'Depth: 700 mm' }] }, bbox: [40, 160, 300, 185] },
      { type: 'paragraph', content: { paragraph_content: [{ type: 'text', content: 'Depth with door open: 1057 mm' }] }, bbox: [40, 190, 400, 215] },
      { type: 'title', content: { title_content: [{ type: 'text', content: 'Logistic information' }] }, bbox: [40, 230, 300, 260] },
      { type: 'paragraph', content: { paragraph_content: [{ type: 'text', content: 'Packaging depth: 776 mm' }] }, bbox: [40, 270, 300, 295] },
    ],
  ]));
  const discoveryPayload = {
    code: '000000000000592078',
    modelMark: sourceModel,
    documents: [{ url: artifactUrl, name: 'Product sheet' }],
    classifications: [{ features: [
      { name: 'Width', featureUnit: { symbol: 'mm' }, featureValues: [{ value: '595' }] },
      { name: 'Height', featureUnit: { symbol: 'mm' }, featureValues: [{ value: '850' }] },
      { name: 'Depth', featureUnit: { symbol: 'mm' }, featureValues: [{ value: '700' }] },
    ] }],
  };
  const discoveryBytes = Buffer.from(JSON.stringify(discoveryPayload));
  const discoveryHash = createHash('sha256').update(discoveryBytes).digest('hex');
  const discoveryObjectPath = `evidence/web/sha256/${discoveryHash.slice(0, 2)}/${discoveryHash.slice(2, 4)}/${discoveryHash}.json`;
  const artifact = {
    authorityMode: 'official',
    authorityBrand: 'ASKO',
    requestedUrl: artifactUrl,
    finalUrl: artifactUrl,
    redirectChain: [],
    contentType: 'application/pdf',
    contentSha256: pdfSha256,
    objectPath: `evidence/web/sha256/${pdfSha256.slice(0, 2)}/${pdfSha256.slice(2, 4)}/${pdfSha256}.pdf`,
    byteSize: pdfBytes.length,
    bytes: pdfBytes,
    derivedArtifactBytes: jsonBytes,
    derivedArtifact: buildMineruDerivedArtifact(jsonBytes, {
      pdfSha256, parserVersion: '3.4.4', modelRevision: MODEL_REVISION,
    }),
  };
  const result = await attestEvidenceArtifactForCase({
    id: `case-${targetModel}`,
    brand: 'ASKO',
    model: targetModel,
    category: 'washing_machine',
    sources: [],
  }, artifact, {
    now: '2026-07-16T00:00:00.000Z',
    requestedFields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
    ],
    requireRequestedFieldCoverage: true,
    claimSemanticsVersion: 2,
    discoveryProvenance: {
      schemaVersion: 1,
      method: 'official_market_api',
      market: 'AU',
      discoveryUrl: 'https://api-storefront.asko.com/ggcommercewebservices/v2/asko-au/products/000000000000592078?fields=FULL&lang=en_AU&curr=AUD',
      requestedModel: targetModel,
      matchedModel: sourceModel,
      artifactUrl,
      discoveryContentSha256: discoveryHash,
      discoveryObjectPath,
      discoveryByteSize: discoveryBytes.length,
    },
    readObject: async (path) => {
      assert.equal(path, discoveryObjectPath);
      return discoveryBytes;
    },
  });

  assert.equal(result.source.sourceType, 'official_model_variant_pdf');
  assert.deepEqual(result.source.identity, {
    brand: 'ASKO', model: targetModel, category: 'washing_machine',
    outcome: 'official_marketing_alias', sourceModel,
  });
  assert.deepEqual(result.source.claims.map((claim) => claim.field).sort(), [
    'closedEnvelope.depthMm', 'closedEnvelope.heightMm', 'closedEnvelope.widthMm',
  ]);
});

test('HTML V2 attestation binds a verbatim grouped product label instead of a parser-synthesized label', async () => {
  const model = 'XD2A25MB';
  const artifactUrl = `https://www.lg.com/au/dishwashers/free-standing/${model.toLowerCase()}/`;
  const bytes = Buffer.from(`<!doctype html><html><head>
    <title>${model} dishwasher | LG Australia</title>
    <link rel="canonical" href="${artifactUrl}">
  </head><body data-pim-model-name="${model}"><ul>
    <li><span>Product (WxHxD) (mm)</span><span>600 x 850 x 600</span></li>
    <li><span>Packing (WxHxD) (mm)</span><span>680 x 890 x 665</span></li>
  </ul></body></html>`);
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');
  const result = await attestEvidenceArtifactForCase({
    id: `case-${model}`,
    brand: 'LG',
    model,
    category: 'dishwasher',
    sources: [],
  }, {
    authorityMode: 'official',
    authorityBrand: 'LG',
    requestedUrl: artifactUrl,
    finalUrl: artifactUrl,
    redirectChain: [],
    contentType: 'text/html',
    contentSha256,
    objectPath: `evidence/web/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}.html`,
    byteSize: bytes.length,
    bytes,
  }, {
    now: '2026-07-15T00:00:00.000Z',
    requestedFields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
    ],
    claimSemanticsVersion: 2,
    requireRequestedFieldCoverage: true,
  });

  assert.deepEqual(result.source.claims.map((claim) => claim.sourceLabel), [
    'Product (WxHxD) (mm)',
    'Product (WxHxD) (mm)',
    'Product (WxHxD) (mm)',
  ]);
  assert.equal(result.source.verificationReceipt.schemaVersion, 3);
});

test('Hisense product-page grouped dimensions cannot enter V2 attestation', async () => {
  const model = 'HWF5I1015';
  const artifactUrl = `https://hisense.com.au/product/${model}/10kg-series-5i-front-load-washer`;
  const bytes = Buffer.from(`<!doctype html><html><head>
    <title>${model} washer | Hisense Australia</title>
    <link rel="canonical" href="${artifactUrl}">
  </head><body data-product-model="${model}">
    <div><h2>Dimensions (H*W*D) Unit: mm</h2><p>550*845*595</p></div>
  </body></html>`);
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');

  await assert.rejects(attestEvidenceArtifactForCase({
    id: `case-${model}`,
    brand: 'Hisense',
    model,
    category: 'washing_machine',
    sources: [],
  }, {
    authorityMode: 'official',
    authorityBrand: 'Hisense',
    requestedUrl: artifactUrl,
    finalUrl: artifactUrl,
    redirectChain: [],
    contentType: 'text/html',
    contentSha256,
    objectPath: `evidence/web/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}.html`,
    byteSize: bytes.length,
    bytes,
  }, {
    now: '2026-07-27T00:00:00.000Z',
    requestedFields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
    ],
    claimSemanticsVersion: 2,
    requireRequestedFieldCoverage: true,
  }), /no supported evidence claims extracted/i);
});

test('official HTML attestation treats punctuation-only Westinghouse hinge formatting as exact identity', async () => {
  const targetModel = 'WBE4504BBL';
  const sourceModel = 'WBE4504BB-L';
  const artifactUrl = `https://www.westinghouse.com.au/fridges-and-freezers/fridges/${sourceModel.toLowerCase()}/`;
  const bytes = Buffer.from(`<!doctype html><html><head>
    <title>453L bottom mount fridge - ${sourceModel} | Westinghouse Australia</title>
    <link rel="canonical" href="${artifactUrl}">
  </head><body data-product-model="${sourceModel}"><dl>
    <dt>Total width (mm)</dt><dd>699 mm</dd>
  </dl></body></html>`);
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');
  const result = await attestEvidenceArtifactForCase({
    id: `case-${targetModel}`,
    brand: 'Westinghouse',
    model: targetModel,
    category: 'fridge',
    sources: [],
  }, {
    authorityMode: 'official',
    authorityBrand: 'Westinghouse',
    requestedUrl: artifactUrl,
    finalUrl: artifactUrl,
    redirectChain: [],
    contentType: 'text/html',
    contentSha256,
    objectPath: `evidence/web/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}.html`,
    byteSize: bytes.length,
    bytes,
  }, {
    now: '2026-07-16T00:00:00.000Z',
    requestedFields: ['closedEnvelope.widthMm'],
    claimSemanticsVersion: 2,
    requireRequestedFieldCoverage: true,
  });

  assert.deepEqual(result.source.identity, {
    brand: 'Westinghouse', model: targetModel, outcome: 'exact',
  });
  assert.equal(result.source.claims[0].value.mm, 699);
});

test('official HTML attestation rejects punctuation-only identity outside the approved Westinghouse series', async () => {
  const targetModel = 'WBE9999XXR';
  const sourceModel = 'WBE9999XX-R';
  const artifactUrl = `https://www.westinghouse.com.au/fridges-and-freezers/fridges/${sourceModel.toLowerCase()}/`;
  const bytes = Buffer.from(`<!doctype html><html><head>
    <title>Bottom mount fridge - ${sourceModel} | Westinghouse Australia</title>
    <link rel="canonical" href="${artifactUrl}">
  </head><body data-product-model="${sourceModel}"><dl>
    <dt>Total width (mm)</dt><dd>699 mm</dd>
  </dl></body></html>`);
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');

  await assert.rejects(attestEvidenceArtifactForCase({
    id: `case-${targetModel}`,
    brand: 'Westinghouse',
    model: targetModel,
    category: 'fridge',
    sources: [],
  }, {
    authorityMode: 'official',
    authorityBrand: 'Westinghouse',
    requestedUrl: artifactUrl,
    finalUrl: artifactUrl,
    redirectChain: [],
    contentType: 'text/html',
    contentSha256,
    objectPath: `evidence/web/sha256/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}.html`,
    byteSize: bytes.length,
    bytes,
  }, {
    now: '2026-07-16T00:00:00.000Z',
    requestedFields: ['closedEnvelope.widthMm'],
    claimSemanticsVersion: 2,
    requireRequestedFieldCoverage: true,
  }), /canonical URL does not prove exact model/i);
});

test('official ASKO AU product JSON attests only receipt-bound closed-envelope dimensions for a mechanical model variant', async () => {
  const targetModel = 'DBI243IBS';
  const sourceModel = 'DBI243IB.S.AU';
  const sourceUrl = 'https://api-storefront.asko.com/ggcommercewebservices/v2/asko-au/products/000000000000732485?fields=FULL&lang=en_AU&curr=AUD';
  const bytes = Buffer.from(JSON.stringify({
    code: '000000000000732485',
    modelMark: sourceModel,
    classifications: [{ features: [
      { name: 'Width', featureUnit: { symbol: 'mm' }, featureValues: [{ value: '596' }] },
      { name: 'Height', featureUnit: { symbol: 'mm' }, featureValues: [{ value: '819' }] },
      { name: 'Depth', featureUnit: { symbol: 'mm' }, featureValues: [{ value: '559' }] },
    ] }],
  }));
  const hash = createHash('sha256').update(bytes).digest('hex');
  const objectPath = `evidence/web/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.json`;
  const discoveryProvenance = {
    schemaVersion: 1, method: 'official_market_api', market: 'AU',
    discoveryUrl: sourceUrl, requestedModel: targetModel, matchedModel: sourceModel,
    artifactUrl: sourceUrl, discoveryContentSha256: hash, discoveryObjectPath: objectPath,
    discoveryByteSize: bytes.length,
  };
  const artifact = {
    authorityMode: 'official', authorityBrand: 'ASKO', requestedUrl: sourceUrl,
    finalUrl: sourceUrl, redirectChain: [], contentType: 'application/json',
    contentSha256: hash, objectPath, byteSize: bytes.length, bytes,
    derivedArtifact: null, derivedArtifactBytes: null,
  };
  const caseValue = {
    id: `case-${targetModel}`, brand: 'ASKO', model: targetModel,
    category: 'dishwasher', sources: [],
  };
  const options = {
    now: '2026-07-16T00:00:00.000Z',
    requestedFields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
    ],
    requireRequestedFieldCoverage: true,
    claimSemanticsVersion: 2,
    discoveryProvenance,
    readObject: async (path) => {
      assert.equal(path, objectPath);
      return bytes;
    },
  };
  const result = await attestEvidenceArtifactForCase(caseValue, artifact, options);

  assert.equal(result.source.sourceType, 'official_model_variant_api');
  assert.deepEqual(result.source.identity, {
    brand: 'ASKO', model: targetModel, category: 'dishwasher',
    outcome: 'official_marketing_alias', sourceModel,
  });
  assert.deepEqual(result.source.claims.map((claim) => [claim.field, claim.value.mm]), [
    ['closedEnvelope.widthMm', 596],
    ['closedEnvelope.heightMm', 819],
    ['closedEnvelope.depthMm', 559],
  ]);
  assert.equal(result.source.derivedArtifact, undefined);

  await assert.rejects(() => attestEvidenceArtifactForCase(caseValue, artifact, {
    ...options,
    requestedFields: ['closedEnvelope.widthMm', 'installation.rearMm'],
  }), /dimensions only/i);
});

function mieleMaterialVariantFixture({
  targetModel = 'G7130SCCLST',
  pageModel = 'G 7130 SC',
  pdfModel = 'G 7130 SC',
  materialNumber = '12531610',
  pageFinish = 'CleanSteel',
  pdfFinish = 'CleanSteel front',
  productPath = 'freestanding-dishwashers/g-7130-sc-front-autodos',
  productTitle = `${pageModel} Front AutoDos`,
  firstPageModel = true,
  finishTableMaterialCaption = false,
  structuredPageFinish = false,
  includeFinishRow = true,
  pdfTitle = `${pdfModel} Front AutoDos`,
  width = 598,
  height = 845,
  depth = 600,
} = {}) {
  const productUrl = `https://shop.miele.com.au/en/kitchen/dishwashers/${productPath}-zid${materialNumber}/`;
  const artifactUrl = `https://www.miele.com.au/media/ex/au/specsheets/${materialNumber}.pdf`;
  const discoveryBytes = Buffer.from(`<!doctype html><html><head>
    <title>${productTitle} | Miele Australia</title>
    <link rel="canonical" href="${productUrl}">
  </head><body>
    <h1>${productTitle}</h1>
    ${structuredPageFinish
      ? `<div data-product-sku="${materialNumber}"></div><dl class="attribute-list-item"><dt>Control panel colour</dt><dd>${pageFinish}</dd></dl>`
      : `<div data-product-sku="${materialNumber}">${pageFinish}</div>`}
  </body></html>`);
  const discoveryHash = createHash('sha256').update(discoveryBytes).digest('hex');
  const discoveryObjectPath = `evidence/web/sha256/${discoveryHash.slice(0, 2)}/${discoveryHash.slice(2, 4)}/${discoveryHash}.html`;
  const jsonBytes = Buffer.from(JSON.stringify([
    [
      ...(firstPageModel ? [{
        type: 'list',
        content: {
          list_type: 'text_list',
          list_items: [{
            item_type: 'text',
            item_content: [{ type: 'text', content: pdfTitle }],
          }],
        },
        bbox: [112, 153, 699, 204],
      }] : []),
      ...(!finishTableMaterialCaption ? [{
        type: 'paragraph',
        content: {
          paragraph_content: [{
            type: 'text',
            content: `EAN: 4002516785118 / Material number: ${materialNumber}`,
          }],
        },
        bbox: [391, 208, 700, 222],
      }] : []),
      ...(includeFinishRow ? [{
        type: 'table',
        content: {
          table_caption: finishTableMaterialCaption ? [{
            type: 'text',
            content: `EAN: 4002516785118 / Material number: ${materialNumber}`,
          }] : [],
          table_footnote: [],
          html: `<table><tr><td>Control panel colour</td><td>${pdfFinish}</td></tr></table>`,
        },
        bbox: [391, 229, 931, 908],
      }] : []),
    ],
    [
      {
        type: 'list',
        content: {
          list_type: 'text_list',
          list_items: [{
            item_type: 'text',
            item_content: [{ type: 'text', content: pdfTitle }],
          }],
        },
        bbox: [112, 153, 699, 203],
      },
      {
        type: 'paragraph',
        content: {
          paragraph_content: [{
            type: 'text',
            content: `EAN: 4002516785118 / Material number: ${materialNumber}`,
          }],
        },
        bbox: [391, 208, 700, 222],
      },
      {
        type: 'table',
        content: {
          table_caption: [],
          table_footnote: [],
          html: `<table>
            <tr><td>Technical data</td><td></td></tr>
            <tr><td>Niche width minimal in mm</td><td>600</td></tr>
            <tr><td>Niche height maximal in mm</td><td>870</td></tr>
            <tr><td>Appliance width in mm</td><td>${width}</td></tr>
            <tr><td>Appliance height in mm</td><td>${height}</td></tr>
            <tr><td>Appliance depth in mm</td><td>${depth}</td></tr>
            <tr><td>Depth with door open in cm</td><td>119.5</td></tr>
          </table>`,
        },
        bbox: [391, 229, 931, 768],
      },
    ],
  ]));
  const pdfBytes = Buffer.from('%PDF-1.7\nMiele material-bound product sheet');
  const pdfHash = createHash('sha256').update(pdfBytes).digest('hex');
  return {
    targetModel,
    sourceModel: pageModel,
    materialNumber,
    productUrl,
    artifactUrl,
    discoveryBytes,
    discoveryObjectPath,
    jsonBytes,
    artifact: {
      authorityMode: 'official',
      authorityBrand: 'Miele',
      requestedUrl: artifactUrl,
      finalUrl: artifactUrl,
      redirectChain: [],
      contentType: 'application/pdf',
      contentSha256: pdfHash,
      objectPath: `evidence/web/sha256/${pdfHash.slice(0, 2)}/${pdfHash.slice(2, 4)}/${pdfHash}.pdf`,
      byteSize: pdfBytes.length,
      bytes: pdfBytes,
      derivedArtifactBytes: jsonBytes,
      derivedArtifact: buildMineruDerivedArtifact(jsonBytes, {
        pdfSha256: pdfHash,
        parserVersion: '3.4.4',
        modelRevision: MODEL_REVISION,
      }),
    },
    discoveryProvenance: {
      schemaVersion: 1,
      method: 'official_product_material',
      market: 'AU',
      discoveryUrl: productUrl,
      requestedModel: targetModel,
      matchedModel: pageModel,
      artifactUrl,
      materialNumber,
      discoveryContentSha256: discoveryHash,
      discoveryObjectPath,
      discoveryByteSize: discoveryBytes.length,
    },
  };
}

function mieleFridgeMaterialVariantFixture({
  targetModel = 'FNS4782EBS',
  pageModel = 'FNS 4782 E edt/bs',
  pdfModel = 'FNS 4782 E',
  materialNumber = '12430770',
  pageFinish = 'BlackSteel door',
  pdfFinish = 'BlackSteel',
  dimensions = '600 x 1850 x 675',
} = {}) {
  const productUrl = `https://shop.miele.com.au/en/kitchen/refrigeration/fns-4782-e-edt-bs-zid${materialNumber}/`;
  const artifactUrl = `https://www.miele.com.au/media/ex/au/specsheets/${materialNumber}.pdf`;
  const discoveryBytes = Buffer.from(`<!doctype html><html><head>
    <title>${pageModel} | Refrigeration | Miele online shop</title>
    <link rel="canonical" href="${productUrl}">
  </head><body>
    <h1>${pageModel}</h1>
    <div data-product-sku="${materialNumber}"></div>
    <dl class="attribute-list-item"><dt>Front colour</dt><dd>${pageFinish}</dd></dl>
  </body></html>`);
  const discoveryHash = createHash('sha256').update(discoveryBytes).digest('hex');
  const discoveryObjectPath = `evidence/web/sha256/${discoveryHash.slice(0, 2)}/${discoveryHash.slice(2, 4)}/${discoveryHash}.html`;
  const jsonBytes = Buffer.from(JSON.stringify([
    [
      {
        type: 'image',
        content: {
          image_source: { path: 'images/product.jpg' },
          image_caption: [{ type: 'text', content: pdfModel }],
          image_footnote: [],
        },
        bbox: [90, 111, 250, 360],
      },
      {
        type: 'table',
        content: {
          table_caption: [],
          table_footnote: [],
          html: `<table>
            <tr><td>Appliance category</td><td>Freezer</td></tr>
            <tr><td>Front colour</td><td>${pdfFinish}</td></tr>
            <tr><td>Technical data</td><td></td></tr>
            <tr><td>Appliance dimensions in mm (W x H x D)</td><td>${dimensions}</td></tr>
          </table>`,
        },
        bbox: [368, 118, 897, 538],
      },
    ],
  ]));
  const pdfBytes = Buffer.from('%PDF-1.7\nMiele refrigerator material-bound product sheet');
  const pdfHash = createHash('sha256').update(pdfBytes).digest('hex');
  return {
    targetModel,
    sourceModel: pdfModel,
    materialNumber,
    productUrl,
    artifactUrl,
    discoveryBytes,
    discoveryObjectPath,
    artifact: {
      authorityMode: 'official',
      authorityBrand: 'Miele',
      requestedUrl: artifactUrl,
      finalUrl: artifactUrl,
      redirectChain: [],
      contentType: 'application/pdf',
      contentSha256: pdfHash,
      objectPath: `evidence/web/sha256/${pdfHash.slice(0, 2)}/${pdfHash.slice(2, 4)}/${pdfHash}.pdf`,
      byteSize: pdfBytes.length,
      bytes: pdfBytes,
      derivedArtifactBytes: jsonBytes,
      derivedArtifact: buildMineruDerivedArtifact(jsonBytes, {
        pdfSha256: pdfHash,
        parserVersion: '3.4.4',
        modelRevision: MODEL_REVISION,
      }),
    },
    discoveryProvenance: {
      schemaVersion: 1,
      method: 'official_product_material',
      market: 'AU',
      discoveryUrl: productUrl,
      requestedModel: targetModel,
      matchedModel: pageModel,
      artifactUrl,
      materialNumber,
      discoveryContentSha256: discoveryHash,
      discoveryObjectPath,
      discoveryByteSize: discoveryBytes.length,
    },
  };
}

function mieleCleanSteelProductPageFixture({
  targetModel = 'KS4783EDETCCS',
  pageModel = 'KS 4783 EDT CS',
  materialNumber = '11949580',
  finish = 'Stainless steel/CleanSteel',
  canonicalUrl = null,
  dimensions = '597 x 1855 x 675',
} = {}) {
  const productUrl = 'https://shop.miele.com.au/en/kitchen/refrigeration/fridges/freestanding-fridges/ks-4783-edt-cs-zid11949580/';
  const effectiveCanonicalUrl = canonicalUrl ?? productUrl;
  const bytes = Buffer.from(`<!doctype html><html><head>
    <title>${pageModel} | Miele Australia</title>
    <link rel="canonical" href="${effectiveCanonicalUrl}">
  </head><body>
    <h1>${pageModel}</h1><div data-product-sku="${materialNumber}"></div>
    <dl class="attribute-list-item"><dt>Front colour</dt><dd>${finish}</dd></dl>
    <table><tr><th>Appliance dimensions in mm (W x H x D)</th><td>${dimensions}</td></tr></table>
  </body></html>`);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const objectPath = `evidence/web/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.html`;
  return {
    targetModel,
    pageModel,
    materialNumber,
    productUrl,
    bytes,
    artifact: {
      authorityMode: 'official',
      authorityBrand: 'Miele',
      requestedUrl: productUrl,
      finalUrl: productUrl,
      redirectChain: [],
      contentType: 'text/html',
      contentSha256: hash,
      objectPath,
      byteSize: bytes.length,
      bytes,
    },
    discoveryProvenance: {
      schemaVersion: 1,
      method: 'official_product_material',
      market: 'AU',
      discoveryUrl: productUrl,
      requestedModel: targetModel,
      matchedModel: pageModel,
      artifactUrl: productUrl,
      materialNumber,
      discoveryContentSha256: hash,
      discoveryObjectPath: objectPath,
      discoveryByteSize: bytes.length,
    },
  };
}

function mieleBlackSteelProductPageFixture({
  targetModel = 'FNS4782EBS',
  pageModel = 'FNS 4782 E edt/bs',
  materialNumber = '12430770',
  finish = 'BlackSteel door',
  dimensions = { widthMm: 597, heightMm: 1855, depthMm: 675 },
} = {}) {
  const productUrl = `https://shop.miele.com.au/en/kitchen/refrigeration/fns-4782-e-edt-bs-zid${materialNumber}/`;
  const bytes = Buffer.from(`<!doctype html><html><head>
    <title>${pageModel} | Refrigeration | Miele online shop</title>
    <link rel="canonical" href="${productUrl}">
  </head><body>
    <h1>${pageModel}</h1><div data-product-sku="${materialNumber}"></div>
    <dl class="attribute-list-item"><dt>Front colour</dt><dd>${finish}</dd></dl>
    <dl class="attribute-list-item"><dt>Appliance width in mm</dt><dd>${dimensions.widthMm}</dd></dl>
    <dl class="attribute-list-item"><dt>Appliance height in mm</dt><dd>${dimensions.heightMm}</dd></dl>
    <dl class="attribute-list-item"><dt>Appliance depth in mm</dt><dd>${dimensions.depthMm}</dd></dl>
  </body></html>`);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const objectPath = `evidence/web/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.html`;
  return {
    targetModel,
    pageModel,
    materialNumber,
    productUrl,
    bytes,
    artifact: {
      authorityMode: 'official',
      authorityBrand: 'Miele',
      requestedUrl: productUrl,
      finalUrl: productUrl,
      redirectChain: [],
      contentType: 'text/html',
      contentSha256: hash,
      objectPath,
      byteSize: bytes.length,
      bytes,
    },
    discoveryProvenance: {
      schemaVersion: 1,
      method: 'official_product_material',
      market: 'AU',
      discoveryUrl: productUrl,
      requestedModel: targetModel,
      matchedModel: pageModel,
      artifactUrl: productUrl,
      materialNumber,
      discoveryContentSha256: hash,
      discoveryObjectPath: objectPath,
      discoveryByteSize: bytes.length,
    },
  };
}

test('Miele material-bound official product sheet attests only closed W/H/D as a finish alias', async () => {
  const fixtureValue = mieleMaterialVariantFixture();
  const caseValue = {
    id: `case-${fixtureValue.targetModel}`,
    brand: 'Miele',
    model: fixtureValue.targetModel,
    category: 'dishwasher',
    sources: [],
  };
  const options = {
    now: '2026-07-25T00:00:00.000Z',
    requestedFields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
    ],
    requireRequestedFieldCoverage: true,
    claimSemanticsVersion: 2,
    discoveryProvenance: fixtureValue.discoveryProvenance,
    readObject: async (path) => {
      assert.equal(path, fixtureValue.discoveryObjectPath);
      return fixtureValue.discoveryBytes;
    },
  };

  const result = await attestEvidenceArtifactForCase(caseValue, fixtureValue.artifact, options);
  assert.equal(result.source.sourceType, 'official_model_variant_pdf');
  assert.deepEqual(result.source.identity, {
    brand: 'Miele',
    model: fixtureValue.targetModel,
    category: 'dishwasher',
    outcome: 'official_marketing_alias',
    sourceModel: fixtureValue.sourceModel,
  });
  assert.deepEqual(result.source.claims.map((claim) => [claim.field, claim.value.mm]), [
    ['closedEnvelope.widthMm', 598],
    ['closedEnvelope.heightMm', 845],
    ['closedEnvelope.depthMm', 600],
  ]);
  assert.ok(result.source.identitySignals.some((signal) => (
    signal.type === 'official_product_material_model'
  )));

  await assert.rejects(() => attestEvidenceArtifactForCase(caseValue, fixtureValue.artifact, {
    ...options,
    requestedFields: ['closedEnvelope.widthMm', 'installation.rearMm'],
  }), /dimensions only/i);
});

test('Miele integrated material sheet attests exact closed W/H/D without flattening niche or door-open dimensions', async () => {
  const fixtureValue = mieleMaterialVariantFixture({
    targetModel: 'G7130SCICLST',
    pageModel: 'G 7130 SCi',
    pdfModel: 'G 7130 SCi',
    materialNumber: '12531640',
    pageFinish: 'Stainless steel/CleanSteel',
    pdfFinish: 'Stainless steel/CleanSteel',
    productPath: 'integrated-dishwashers/g-7130-sci-autodos',
    productTitle: 'G 7130 SCi AutoDos',
    firstPageModel: false,
    finishTableMaterialCaption: true,
    width: 598,
    height: 805,
    depth: 570,
  });
  const result = await attestEvidenceArtifactForCase({
    id: `case-${fixtureValue.targetModel}`,
    brand: 'Miele',
    model: fixtureValue.targetModel,
    category: 'dishwasher',
    sources: [],
  }, fixtureValue.artifact, {
    now: '2026-07-26T00:00:00.000Z',
    requestedFields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
    ],
    requireRequestedFieldCoverage: true,
    claimSemanticsVersion: 2,
    discoveryProvenance: fixtureValue.discoveryProvenance,
    readObject: async () => fixtureValue.discoveryBytes,
  });

  assert.deepEqual(result.source.claims.map((claim) => [claim.field, claim.value.mm]), [
    ['closedEnvelope.widthMm', 598],
    ['closedEnvelope.heightMm', 805],
    ['closedEnvelope.depthMm', 570],
  ]);
  assert.equal(result.source.claims.some((claim) => /niche|door open/i.test(claim.sourceLabel)), false);
});

test('Miele Obsidian Black material sheet binds OBSW without sharing sibling dimensions', async () => {
  const fixtureValue = mieleMaterialVariantFixture({
    targetModel: 'G7719SCIXXLOBSW',
    pageModel: 'G 7719 SCi XXL',
    pdfModel: 'G 7719 SCi XXL',
    materialNumber: '12531710',
    pageFinish: 'Obsidian Black',
    pdfFinish: 'Obsidian Black',
    productPath: 'integrated-dishwashers/g-7719-sci-xxl-autodos',
    productTitle: 'G 7719 SCi XXL AutoDos',
    firstPageModel: false,
    finishTableMaterialCaption: true,
    structuredPageFinish: true,
    width: 598,
    height: 845,
    depth: 570,
  });
  const result = await attestEvidenceArtifactForCase({
    id: `case-${fixtureValue.targetModel}`,
    brand: 'Miele',
    model: fixtureValue.targetModel,
    category: 'dishwasher',
    sources: [],
  }, fixtureValue.artifact, {
    now: '2026-07-26T00:00:00.000Z',
    requestedFields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
    ],
    requireRequestedFieldCoverage: true,
    claimSemanticsVersion: 2,
    discoveryProvenance: fixtureValue.discoveryProvenance,
    readObject: async () => fixtureValue.discoveryBytes,
  });

  assert.deepEqual(result.source.claims.map((claim) => [claim.field, claim.value.mm]), [
    ['closedEnvelope.widthMm', 598],
    ['closedEnvelope.heightMm', 845],
    ['closedEnvelope.depthMm', 570],
  ]);
  assert.equal(result.source.identity.sourceModel, 'G 7719 SCI XXL');
  assert.match(
    result.source.identitySignals.find((signal) => (
      signal.type === 'mineru_miele_product_material_model'
    )).value,
    /finish:Obsidian Black:/,
  );
});

test('Miele BlackSteel refrigerator material sheet binds the compact W/H/D row without sharing CleanSteel', async () => {
  const fixtureValue = mieleFridgeMaterialVariantFixture();
  const options = {
    now: '2026-07-26T00:00:00.000Z',
    requestedFields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
    ],
    requireRequestedFieldCoverage: true,
    claimSemanticsVersion: 2,
    discoveryProvenance: fixtureValue.discoveryProvenance,
    readObject: async () => fixtureValue.discoveryBytes,
  };
  const caseValue = {
    id: `case-${fixtureValue.targetModel}`,
    brand: 'Miele',
    model: fixtureValue.targetModel,
    category: 'fridge',
    sources: [],
  };

  const result = await attestEvidenceArtifactForCase(caseValue, fixtureValue.artifact, options);

  assert.equal(result.source.sourceType, 'official_model_variant_pdf');
  assert.equal(result.source.identity.sourceModel, 'FNS 4782 E');
  assert.deepEqual(result.source.claims.map((claim) => [claim.field, claim.value.mm]), [
    ['closedEnvelope.widthMm', 600],
    ['closedEnvelope.heightMm', 1850],
    ['closedEnvelope.depthMm', 675],
  ]);
  for (const fixtureMutation of [
    mieleFridgeMaterialVariantFixture({ pageFinish: 'CleanSteel' }),
    mieleFridgeMaterialVariantFixture({ pdfFinish: 'CleanSteel' }),
    mieleFridgeMaterialVariantFixture({ pdfModel: 'FNS 4782 EDT' }),
  ]) {
    await assert.rejects(() => attestEvidenceArtifactForCase(caseValue, fixtureMutation.artifact, {
      ...options,
      discoveryProvenance: fixtureMutation.discoveryProvenance,
      readObject: async () => fixtureMutation.discoveryBytes,
    }), /finish|model|material|scope|variant/i);
  }
});

test('Miele material-bound product page self-attests only the mapped CleanSteel W/H/D', async () => {
  const fixtureValue = mieleCleanSteelProductPageFixture();
  const caseValue = {
    id: `case-${fixtureValue.targetModel}`,
    brand: 'Miele', model: fixtureValue.targetModel, category: 'fridge', sources: [],
  };
  const options = {
    now: '2026-07-26T00:00:00.000Z',
    requestedFields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
    ],
    requireRequestedFieldCoverage: true,
    claimSemanticsVersion: 2,
    discoveryProvenance: fixtureValue.discoveryProvenance,
    readObject: async () => fixtureValue.bytes,
  };

  const result = await attestEvidenceArtifactForCase(caseValue, fixtureValue.artifact, options);
  assert.equal(result.source.sourceType, 'official_model_variant_product_page');
  assert.deepEqual(result.source.identity, {
    brand: 'Miele', model: fixtureValue.targetModel, category: 'fridge',
    outcome: 'official_marketing_alias', sourceModel: fixtureValue.pageModel,
  });
  assert.deepEqual(result.source.claims.map((claim) => [claim.field, claim.value.mm]), [
    ['closedEnvelope.widthMm', 597],
    ['closedEnvelope.heightMm', 1855],
    ['closedEnvelope.depthMm', 675],
  ]);
  assert.ok(result.source.identitySignals.some((signal) => (
    signal.type === 'official_product_material_page'
  )));
  await assert.rejects(() => attestEvidenceArtifactForCase(caseValue, fixtureValue.artifact, {
    ...options, requestedFields: ['closedEnvelope.widthMm', 'installation.rearMm'],
  }), /dimensions only/i);

  for (const mutation of [
    mieleCleanSteelProductPageFixture({ materialNumber: '12431300' }),
    mieleCleanSteelProductPageFixture({ finish: 'BlackSteel' }),
    mieleCleanSteelProductPageFixture({ pageModel: 'KS 4383 EDT CS' }),
    mieleCleanSteelProductPageFixture({ canonicalUrl: 'https://shop.miele.com.au/en/kitchen/refrigeration/fridges/wrong-zid11949580/' }),
  ]) {
    await assert.rejects(() => attestEvidenceArtifactForCase(caseValue, mutation.artifact, {
      ...options,
      discoveryProvenance: mutation.discoveryProvenance,
      readObject: async () => mutation.bytes,
    }), /material|finish|model|canonical|variant/i);
  }
  await assert.rejects(() => attestEvidenceArtifactForCase(caseValue, fixtureValue.artifact, {
    ...options,
    discoveryProvenance: {
      ...fixtureValue.discoveryProvenance,
      artifactUrl: 'https://www.miele.com.au/media/ex/au/specsheets/11949580.pdf',
    },
  }), /artifact|self-source|match/i);
});

test('Miele BlackSteel suffix product page self-attests its exact page model and W/H/D', async () => {
  const fixtureValue = mieleBlackSteelProductPageFixture();
  const caseValue = {
    id: `case-${fixtureValue.targetModel}`,
    brand: 'Miele', model: fixtureValue.targetModel, category: 'fridge', sources: [],
  };
  const result = await attestEvidenceArtifactForCase(caseValue, fixtureValue.artifact, {
    now: '2026-07-26T00:00:00.000Z',
    requestedFields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
    ],
    requireRequestedFieldCoverage: true,
    claimSemanticsVersion: 2,
    discoveryProvenance: fixtureValue.discoveryProvenance,
    readObject: async () => fixtureValue.bytes,
  });

  assert.equal(result.source.sourceType, 'official_model_variant_product_page');
  assert.deepEqual(result.source.identity, {
    brand: 'Miele', model: fixtureValue.targetModel, category: 'fridge',
    outcome: 'official_marketing_alias', sourceModel: fixtureValue.pageModel,
  });
  assert.deepEqual(result.source.claims.map((claim) => [claim.field, claim.value.mm]), [
    ['closedEnvelope.widthMm', 597],
    ['closedEnvelope.heightMm', 1855],
    ['closedEnvelope.depthMm', 675],
  ]);
});

test('Miele exact K2O material sheet binds dimensions without inventing a finish alias', async () => {
  const fixtureValue = mieleMaterialVariantFixture({
    targetModel: 'G7989SCVIXXLK2O',
    pageModel: 'G 7989 SCVi XXL K2O',
    pdfModel: 'G 7989 SCVi XXL K2O',
    materialNumber: '12531740',
    pageFinish: 'Not used as identity evidence',
    productPath: 'fully-integrated-dishwashers/g-7989-scvi-xxl-autodos-k2o',
    productTitle: 'G 7989 SCVi XXL AutoDos K2O',
    pdfTitle: 'G 7989 SCVi XXL AutoDos K2O',
    firstPageModel: true,
    includeFinishRow: false,
    width: 598,
    height: 845,
    depth: 570,
  });
  const result = await attestEvidenceArtifactForCase({
    id: `case-${fixtureValue.targetModel}`,
    brand: 'Miele',
    model: fixtureValue.targetModel,
    category: 'dishwasher',
    sources: [],
  }, fixtureValue.artifact, {
    now: '2026-07-26T00:00:00.000Z',
    requestedFields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
    ],
    requireRequestedFieldCoverage: true,
    claimSemanticsVersion: 2,
    discoveryProvenance: fixtureValue.discoveryProvenance,
    readObject: async () => fixtureValue.discoveryBytes,
  });

  assert.equal(result.source.sourceType, 'official_exact_model_pdf');
  assert.deepEqual(result.source.identity, {
    brand: 'Miele', model: 'G7989SCVIXXLK2O', outcome: 'exact',
  });
  assert.deepEqual(result.source.claims.map((claim) => [claim.field, claim.value.mm]), [
    ['closedEnvelope.widthMm', 598],
    ['closedEnvelope.heightMm', 845],
    ['closedEnvelope.depthMm', 570],
  ]);
  assert.ok(result.source.identitySignals.some((signal) => (
    signal.type === 'official_product_material_model'
  )));
});

test('Miele material-bound PDF rejects sibling, material, finish, and discovery mutations', async () => {
  for (const [label, fixtureValue] of [
    ['sibling model', mieleMaterialVariantFixture({ pdfModel: 'G 7130 SCU' })],
    ['PDF finish', mieleMaterialVariantFixture({ pdfFinish: 'Brilliant White' })],
    ['product finish', mieleMaterialVariantFixture({ pageFinish: 'Brilliant White' })],
  ]) {
    await assert.rejects(() => attestEvidenceArtifactForCase({
      id: `case-${fixtureValue.targetModel}`,
      brand: 'Miele',
      model: fixtureValue.targetModel,
      category: 'dishwasher',
      sources: [],
    }, fixtureValue.artifact, {
      now: '2026-07-25T00:00:00.000Z',
      requestedFields: [
        'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
      ],
      requireRequestedFieldCoverage: true,
      claimSemanticsVersion: 2,
      discoveryProvenance: fixtureValue.discoveryProvenance,
      readObject: async () => fixtureValue.discoveryBytes,
    }), /identity|material|finish|model|binding|discovery/i, label);
  }

  const mismatch = mieleMaterialVariantFixture();
  mismatch.discoveryProvenance.materialNumber = '12531620';
  await assert.rejects(() => attestEvidenceArtifactForCase({
    id: `case-${mismatch.targetModel}`,
    brand: 'Miele',
    model: mismatch.targetModel,
    category: 'dishwasher',
    sources: [],
  }, mismatch.artifact, {
    now: '2026-07-25T00:00:00.000Z',
    requestedFields: [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
    ],
    requireRequestedFieldCoverage: true,
    claimSemanticsVersion: 2,
    discoveryProvenance: mismatch.discoveryProvenance,
    readObject: async () => mismatch.discoveryBytes,
  }), /material|binding|discovery/i);
});
