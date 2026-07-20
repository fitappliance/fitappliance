import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { buildMineruDerivedArtifact } from '../../src/domain/mineru-document.mjs';
import {
  acquireOfficialIdentityEvidence,
  loadOfficialIdentityEvidence,
  validateOfficialIdentityEvidenceManifest,
} from '../../src/domain/official-identity-evidence.mjs';

const ACQUIRED_AT = '2026-07-21T01:00:00.000Z';
const WESTINGHOUSE_URL = 'https://www.westinghouse.com.au/fridges-and-freezers/fridges/wbe4302ac-r/';
const HAIER_URL = 'https://www.haier.com.au/support/manuals/hrf520bhs-user-manual.pdf';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function seeds(overrides = {}) {
  return {
    schemaVersion: 1,
    policyVersion: 'retailer-identity-official-evidence-seeds-v1',
    seeds: [{
      evidenceId: 'official_identity_haier_hrf520bhs_pdf',
      category: 'fridge',
      brand: 'Haier',
      model: 'HRF520BHS',
      sourceUrl: HAIER_URL,
      mediaType: 'application/pdf',
    }, {
      evidenceId: 'official_identity_westinghouse_wbe4302ac_r_html',
      category: 'fridge',
      brand: 'Westinghouse',
      model: 'WBE4302AC-R',
      sourceUrl: WESTINGHOUSE_URL,
      mediaType: 'text/html',
    }],
    ...overrides,
  };
}

function html(model = 'WBE4302AC-R') {
  return Buffer.from(`<!doctype html><html><head>
    <title>425L bottom freezer fridge - ${model} | Westinghouse Australia</title>
    <link rel="canonical" href="${WESTINGHOUSE_URL}">
    <script>ELECTROLUX.GA4 = {"page_type":"PDPs","market":"WHS AU 1","product_model_id":"${model}","product_brand":"Westinghouse"};</script>
  </head><body data-page-type="productdetailspage"></body></html>`);
}

function mineruJson(model = 'HRF520BHS') {
  return Buffer.from(JSON.stringify([[
    {
      type: 'title',
      content: { title_content: [{ type: 'text', content: 'Refrigerator user manual' }] },
      bbox: [40, 40, 400, 90],
    },
    {
      type: 'paragraph',
      content: { paragraph_content: [{ type: 'text', content: `Applicable models: HRF520BW, ${model}, HRF520BHC.` }] },
      bbox: [40, 120, 700, 180],
    },
  ]]));
}

async function fixture(options = {}) {
  const pdfBytes = Buffer.from('%PDF-1.7\nidentity fixture');
  const jsonBytes = mineruJson();
  const derivedArtifact = buildMineruDerivedArtifact(jsonBytes, {
    pdfSha256: sha256(pdfBytes),
    parserVersion: '3.4.4',
    modelRevision: 'ed6b654c018d742e65a17671e379c5e6ecc87ec9',
    pageCount: 1,
  });
  const objects = new Map();
  const manifest = await acquireOfficialIdentityEvidence({
    seedsDocument: options.seedsDocument ?? seeds(),
    acquiredAt: ACQUIRED_AT,
    fetchArtifact: options.fetchArtifact ?? (async (seed) => ({
      requestedUrl: seed.sourceUrl,
      finalUrl: seed.sourceUrl,
      redirectChain: [],
      contentType: seed.mediaType,
      bytes: seed.mediaType === 'application/pdf' ? pdfBytes : html(),
      transport: 'fetch',
    })),
    processPdf: options.processPdf ?? (async () => ({ jsonBytes, derivedArtifact })),
    writeObject: async (path, bytes) => {
      const payload = Buffer.from(bytes);
      const prior = objects.get(path);
      if (prior && !prior.equals(payload)) throw new Error('object collision');
      objects.set(path, payload);
    },
  });
  return { manifest, objects, pdfBytes, jsonBytes };
}

test('acquires official HTML and MinerU PDF identity evidence and replays it offline', async () => {
  const { manifest, objects } = await fixture();
  assert.equal(manifest.summary.records, 2);
  assert.deepEqual(manifest.summary.byEvidenceKind, {
    OFFICIAL_PDF_MINERU: 1,
    OFFICIAL_PRODUCT_PAGE: 1,
  });
  assert.doesNotThrow(() => validateOfficialIdentityEvidenceManifest(manifest));

  const observations = await loadOfficialIdentityEvidence({
    manifest,
    readObject: async (path) => objects.get(path),
  });
  assert.deepEqual(observations.map((row) => row.model).sort(), ['HRF520BHS', 'WBE4302AC-R']);
  assert.equal(observations.find((row) => row.model === 'HRF520BHS').evidenceKind, 'OFFICIAL_PDF_MINERU');
  assert.ok(observations.every((row) => row.identityLocators.length > 0));
  assert.ok(observations.every((row) => !('dimensions' in row) && !('fit' in row)));
});

test('rejects an unapproved seed host and a redirect escaping the official brand hosts', async () => {
  await assert.rejects(() => acquireOfficialIdentityEvidence({
    seedsDocument: seeds({ seeds: [{
      evidenceId: 'official_identity_fake', category: 'fridge', brand: 'Haier', model: 'HRF520BHS',
      sourceUrl: 'https://evil.example/HRF520BHS.pdf', mediaType: 'application/pdf',
    }] }),
    acquiredAt: ACQUIRED_AT,
    fetchArtifact: async () => assert.fail('unapproved seed must fail before fetch'),
    processPdf: async () => assert.fail('unapproved seed must fail before parse'),
    writeObject: async () => assert.fail('unapproved seed must not be stored'),
  }), /official.*Australian market|official.*market/i);

  await assert.rejects(() => fixture({
    fetchArtifact: async (seed) => ({
      requestedUrl: seed.sourceUrl,
      finalUrl: 'https://evil.example/fake',
      redirectChain: ['https://evil.example/fake'],
      contentType: seed.mediaType,
      bytes: seed.mediaType === 'application/pdf' ? Buffer.from('%PDF-1.7\nfake') : html(),
      transport: 'fetch',
    }),
  }), /redirect|final URL|official/i);
});

test('HTML identity must be in structured PDP metadata, not unrelated body text or the URL', async () => {
  for (const bytes of [
    Buffer.from('<!doctype html><html><head><title>Refrigerators</title></head><body>Related model WBE4302AC-R</body></html>'),
    Buffer.from('<!doctype html><html><head><title>Refrigerators</title></head><body>No product model</body></html>'),
  ]) {
    await assert.rejects(() => fixture({
      seedsDocument: seeds({ seeds: [seeds().seeds[1]] }),
      fetchArtifact: async (seed) => ({
        requestedUrl: seed.sourceUrl,
        finalUrl: seed.sourceUrl,
        redirectChain: [],
        contentType: seed.mediaType,
        bytes: seed.mediaType === 'application/pdf' ? Buffer.from('%PDF-1.7\nfake') : bytes,
        transport: 'fetch',
      }),
    }), /structured.*model|identity locator/i);
  }
});

test('offline replay rejects raw-object drift and MinerU JSON not bound to its source PDF', async () => {
  const rawDrift = await fixture();
  const htmlRecord = rawDrift.manifest.records.find((row) => row.evidenceKind === 'OFFICIAL_PRODUCT_PAGE');
  rawDrift.objects.set(htmlRecord.rawArtifact.objectPath, Buffer.from('<!doctype html><html></html>'));
  await assert.rejects(() => loadOfficialIdentityEvidence({
    manifest: rawDrift.manifest,
    readObject: async (path) => rawDrift.objects.get(path),
  }), /raw.*hash/i);

  const derivedDrift = await fixture();
  const pdfRecord = derivedDrift.manifest.records.find((row) => row.evidenceKind === 'OFFICIAL_PDF_MINERU');
  const changedJson = mineruJson('HRF520BHC');
  derivedDrift.objects.set(pdfRecord.derivedArtifact.objectPath, changedJson);
  await assert.rejects(() => loadOfficialIdentityEvidence({
    manifest: derivedDrift.manifest,
    readObject: async (path) => derivedDrift.objects.get(path),
  }), /MinerU.*hash|derived.*hash/i);
});
