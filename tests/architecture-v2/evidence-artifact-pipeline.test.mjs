import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  acquireEvidenceArtifact,
  attestEvidenceArtifactForCase,
} from '../../src/domain/evidence-artifact-pipeline.mjs';
import { buildMineruDerivedArtifact } from '../../src/domain/mineru-document.mjs';

const MODEL_REVISION = 'ed6b654c018d742e65a17671e379c5e6ecc87ec9';
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
