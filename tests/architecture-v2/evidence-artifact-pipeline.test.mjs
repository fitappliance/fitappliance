import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  acquireEvidenceArtifact,
  attestEvidenceArtifactForCase,
  observeEvidenceArtifactDimensionsForCase,
  preflightEvidenceArtifactForCase,
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
        transport: 'fetch',
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
  assert.equal(first.transport, 'fetch');
  assert.deepEqual(counts, { fetch: 1, mineru: 1, writes: 2 });
  const identityPreflight = await preflightEvidenceArtifactForCase(
    caseRecord('HRCD640TBW'), first, { now: '2026-08-05T00:00:00.000Z' },
  );
  assert.ok(identityPreflight.signals.length > 0);

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
  assert.equal(accepted.source.transport, 'fetch');
  assert.equal(accepted.source.verificationReceipt.schemaVersion, 3);
  assert.equal(counts.fetch, 1);
  assert.equal(counts.mineru, 1);
});

test('HTML sibling identity fails before ambiguous dimension extraction', async () => {
  const targetModel = 'HRCD640TBW';
  const siblingModel = 'HRCD640TBX';
  const artifactUrl = `https://hisense.com.au/product/${siblingModel.toLowerCase()}/`;
  const bytes = Buffer.from(`<!doctype html><html><head>
    <title>${siblingModel} refrigerator</title>
    <link rel="canonical" href="${artifactUrl}">
  </head><body data-product-model="${siblingModel}">
    <dl><dt>Total width (mm)</dt><dd>600 mm</dd>
    <dt>Total width (mm)</dt><dd>700 mm</dd></dl>
  </body></html>`);
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');

  await assert.rejects(() => attestEvidenceArtifactForCase(caseRecord(targetModel), {
    authorityMode: 'official', authorityBrand: 'Hisense', requestedUrl: artifactUrl,
    finalUrl: artifactUrl, redirectChain: [], contentType: 'text/html',
    contentSha256, objectPath: `evidence/web/sha256/${contentSha256}.html`,
    byteSize: bytes.length, bytes,
  }, {
    now: '2026-08-05T00:00:00.000Z',
    requestedFields: ['closedEnvelope.widthMm'], claimSemanticsVersion: 2,
  }), (error) => /exact model|identity/i.test(error.message)
    && !/ambiguous extracted values/i.test(error.message));
});

test('MinerU sibling identity fails before ambiguous dimension extraction', async () => {
  const targetModel = 'HRCD640TBW';
  const siblingModel = 'HRCD640TBX';
  const pdfBytes = Buffer.from('%PDF-1.7\nsibling artifact');
  const pdfSha256 = createHash('sha256').update(pdfBytes).digest('hex');
  const jsonBytes = Buffer.from(JSON.stringify([[
    {
      type: 'title',
      content: { title_content: [{ type: 'text', content: `${siblingModel} Specifications` }] },
      bbox: [80, 60, 400, 120],
    },
    {
      type: 'table',
      content: {
        html: `<table><tr><td>Model Number</td><td>${siblingModel}</td></tr><tr><td>Width</td><td>600 mm</td></tr><tr><td>Width</td><td>700 mm</td></tr></table>`,
      },
      bbox: [80, 200, 800, 900],
    },
  ]]));
  const artifactUrl = `https://dtc-aus-api.hisense.com/medias/${siblingModel}.pdf`;

  await assert.rejects(() => attestEvidenceArtifactForCase(caseRecord(targetModel), {
    authorityMode: 'official', authorityBrand: 'Hisense', requestedUrl: artifactUrl,
    finalUrl: artifactUrl, redirectChain: [], contentType: 'application/pdf',
    contentSha256: pdfSha256, objectPath: `evidence/web/sha256/${pdfSha256}.pdf`,
    byteSize: pdfBytes.length, bytes: pdfBytes, derivedArtifactBytes: jsonBytes,
    derivedArtifact: buildMineruDerivedArtifact(jsonBytes, {
      pdfSha256, parserVersion: '3.4.4', modelRevision: MODEL_REVISION,
    }),
  }, {
    now: '2026-08-05T00:00:00.000Z',
    requestedFields: ['closedEnvelope.widthMm'], claimSemanticsVersion: 2,
  }), (error) => /exact model|identity/i.test(error.message)
    && !/ambiguous extracted values/i.test(error.message));
});

test('identity-gated artifact observation preserves unitless MinerU evidence as shadow only', async () => {
  const model = 'HRCD640TBW';
  const pdfBytes = Buffer.from('%PDF-1.7\nunit observation artifact');
  const pdfSha256 = createHash('sha256').update(pdfBytes).digest('hex');
  const jsonBytes = Buffer.from(JSON.stringify([[
    {
      type: 'title',
      content: { title_content: [{ type: 'text', content: `${model} Specifications` }] },
      bbox: [80, 60, 400, 90],
    },
    {
      type: 'paragraph',
      content: { paragraph_content: [{ type: 'text', content: 'Dimensions (mm)' }] },
      bbox: [80, 100, 300, 130],
    },
    {
      type: 'paragraph',
      content: { paragraph_content: [{ type: 'text', content: 'Product dimensions (H x W x D): 850 x 600 x 635' }] },
      bbox: [80, 150, 700, 190],
    },
  ]]));
  const artifactUrl = `https://dtc-aus-api.hisense.com/medias/${model}.pdf`;
  const artifact = {
    authorityMode: 'official', authorityBrand: 'Hisense', requestedUrl: artifactUrl,
    finalUrl: artifactUrl, redirectChain: [], contentType: 'application/pdf',
    contentSha256: pdfSha256, objectPath: `evidence/web/sha256/${pdfSha256}.pdf`,
    byteSize: pdfBytes.length, bytes: pdfBytes, derivedArtifactBytes: jsonBytes,
    derivedArtifact: buildMineruDerivedArtifact(jsonBytes, {
      pdfSha256, parserVersion: '3.4.4', modelRevision: MODEL_REVISION,
    }),
  };
  const observed = await observeEvidenceArtifactDimensionsForCase(caseRecord(model), artifact, {
    market: 'AU', policyVersion: 'dimension-unit-observation-v1',
  });

  assert.equal(observed.status, 'OBSERVED');
  assert.equal(observed.dimensionUnitObservations.length, 1);
  const [observation] = observed.dimensionUnitObservations;
  assert.equal(observation.unitState, 'DOCUMENT_METRIC_CONTEXT');
  assert.equal(observation.receiptEligible, false);
  assert.equal(observation.rawLabel, 'Product dimensions (H x W x D)');
  assert.equal(observation.rawTuple, '850 x 600 x 635');
  assert.equal(observation.source.page, 1);
  assert.deepEqual(observation.source.bbox, [80, 150, 700, 190]);
  assert.match(observation.source.fragmentSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(observation.axisOrder, ['height', 'width', 'depth']);
  assert.deepEqual(observation.modelScope, {
    modelBinding: 'SAME_PAGE_EXACT_MODEL', boundModels: [model],
  });
  assert.equal(observed.verificationReceipt, undefined);

  await assert.rejects(() => observeEvidenceArtifactDimensionsForCase(
    caseRecord('HRCD640TBX'), artifact,
    { market: 'AU', policyVersion: 'dimension-unit-observation-v1' },
  ), /exact model|identity/i);
});

test('unitless exact H W D observation preserves inferred dimensions without becoming receipt eligible', async () => {
  const model = 'HRCD640TBW';
  const pdfBytes = Buffer.from('%PDF-1.7\nunitless exact axes observation');
  const pdfSha256 = createHash('sha256').update(pdfBytes).digest('hex');
  const jsonBytes = Buffer.from(JSON.stringify([[
    {
      type: 'title',
      content: { title_content: [{ type: 'text', content: `${model} Specifications` }] },
      bbox: [80, 60, 400, 90],
    },
    {
      type: 'paragraph',
      content: { paragraph_content: [{ type: 'text', content: 'Product dimensions (H x W x D): 850 x 600 x 635' }] },
      bbox: [80, 150, 700, 190],
    },
  ]]));
  const artifactUrl = `https://dtc-aus-api.hisense.com/medias/${model}.pdf`;
  const artifact = {
    authorityMode: 'official', authorityBrand: 'Hisense', requestedUrl: artifactUrl,
    finalUrl: artifactUrl, redirectChain: [], contentType: 'application/pdf',
    contentSha256: pdfSha256, objectPath: `evidence/web/sha256/${pdfSha256}.pdf`,
    byteSize: pdfBytes.length, bytes: pdfBytes, derivedArtifactBytes: jsonBytes,
    derivedArtifact: buildMineruDerivedArtifact(jsonBytes, {
      pdfSha256, parserVersion: '3.4.4', modelRevision: MODEL_REVISION,
    }),
  };

  const observed = await observeEvidenceArtifactDimensionsForCase(caseRecord(model), artifact, {
    market: 'AU', policyVersion: 'dimension-unit-observation-v1',
  });
  const [observation] = observed.dimensionUnitObservations;
  assert.equal(observation.unitState, 'DOMAIN_INFERRED_MM');
  assert.equal(observation.axisState, 'EXPLICIT_DEPTH');
  assert.deepEqual(observation.dimensionsMm, {
    height: { min: 850, max: 850 },
    width: { min: 600, max: 600 },
    depth: { min: 635, max: 635 },
  });
  assert.equal(observation.receiptEligible, false);
});

test('explicit-unit dimension fragments do not produce duplicate shadow observations', async () => {
  const model = 'HRCD640TBW';
  const pdfBytes = Buffer.from('%PDF-1.7\nexplicit unit observation exclusion');
  const pdfSha256 = createHash('sha256').update(pdfBytes).digest('hex');
  const jsonBytes = Buffer.from(JSON.stringify([[
    {
      type: 'title',
      content: { title_content: [{ type: 'text', content: `${model} Specifications` }] },
      bbox: [80, 60, 400, 90],
    },
    {
      type: 'paragraph',
      content: { paragraph_content: [{ type: 'text', content: 'Product dimensions (H x W x D): 850 mm x 600 mm x 635 mm' }] },
      bbox: [80, 150, 700, 190],
    },
  ]]));
  const artifactUrl = `https://dtc-aus-api.hisense.com/medias/${model}.pdf`;
  const artifact = {
    authorityMode: 'official', authorityBrand: 'Hisense', requestedUrl: artifactUrl,
    finalUrl: artifactUrl, redirectChain: [], contentType: 'application/pdf',
    contentSha256: pdfSha256, objectPath: `evidence/web/sha256/${pdfSha256}.pdf`,
    byteSize: pdfBytes.length, bytes: pdfBytes, derivedArtifactBytes: jsonBytes,
    derivedArtifact: buildMineruDerivedArtifact(jsonBytes, {
      pdfSha256, parserVersion: '3.4.4', modelRevision: MODEL_REVISION,
    }),
  };

  const observed = await observeEvidenceArtifactDimensionsForCase(caseRecord(model), artifact, {
    market: 'AU', policyVersion: 'dimension-unit-observation-v1',
  });
  assert.deepEqual(observed, {
    status: 'NO_OBSERVATION',
    reasonCode: 'NO_SUPPORTED_DIMENSION_EXPRESSION',
    dimensionUnitObservations: [],
  });
});

test('supported transport value survives acquisition, persisted record and rehydration', async () => {
  for (const transport of ['fetch', 'curl', 'scrapling', 'content_addressed_discovery_object']) {
    const bytes = Buffer.from(`<html><body>${transport}</body></html>`);
    const objects = new Map();
    let record;
    const sourceUrl = `https://dtc-aus-api.hisense.com/${transport}.html`;
    const base = {
      authorityBrand: 'Hisense', authorityMode: 'official', transportPolicySha256: POLICY_SHA,
      artifactCache: new Map(), contentCache: new Map(),
      fetchArtifact: async () => ({
        requestedUrl: sourceUrl,
        finalUrl: sourceUrl,
        redirectChain: [],
        contentType: 'text/html',
        transport,
        bytes,
      }),
      writeObject: async (path, value) => objects.set(path, Buffer.from(value)),
      writeArtifactRecord: async (value) => { record = structuredClone(value); },
    };
    const acquired = await acquireEvidenceArtifact({ sourceUrl }, base);
    assert.equal(acquired.transport, transport);
    assert.equal(record.transport, transport);

    const rehydrated = await acquireEvidenceArtifact({ sourceUrl }, {
      ...base,
      artifactCache: new Map(), contentCache: new Map(),
      fetchArtifact: async () => assert.fail('network must not run'),
      readArtifactRecord: async () => record,
      readObject: async (path) => objects.get(path),
    });
    assert.equal(rehydrated.transport, transport);
  }

  for (const transport of ['browser', 'verified_legacy_content_addressed_object']) {
    await assert.rejects(acquireEvidenceArtifact({
      sourceUrl: `https://dtc-aus-api.hisense.com/${transport}.html`,
    }, {
      authorityBrand: 'Hisense', authorityMode: 'official', transportPolicySha256: POLICY_SHA,
      fetchArtifact: async (sourceUrl) => ({
        requestedUrl: sourceUrl, finalUrl: sourceUrl, redirectChain: [],
        contentType: 'text/html', transport, bytes: Buffer.from('<html></html>'),
      }),
      writeObject: async () => {},
    }), /transport/i);
  }
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
    transport: 'content_addressed_discovery_object',
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
  assert.equal(result.source.transport, 'content_addressed_discovery_object');
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
