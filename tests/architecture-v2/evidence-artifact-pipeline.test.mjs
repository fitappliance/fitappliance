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
