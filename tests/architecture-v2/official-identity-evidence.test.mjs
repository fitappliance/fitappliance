import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { buildMineruDerivedArtifact } from '../../src/domain/mineru-document.mjs';
import {
  acquireOfficialIdentityEvidence,
  extractOfficialHtmlIdentityLocators,
  extractOfficialHtmlMarketSignal,
  loadOfficialIdentityEvidence,
  validateOfficialIdentityEvidenceManifest,
} from '../../src/domain/official-identity-evidence.mjs';

const ACQUIRED_AT = '2026-07-21T01:00:00.000Z';
const WESTINGHOUSE_URL = 'https://www.westinghouse.com.au/fridges-and-freezers/fridges/wbe4302ac-r/';
const HAIER_URL = 'https://www.haier.com.au/support/manuals/hrf520bhs-user-manual.pdf';
const SAMSUNG_URL = 'https://www.samsung.com/au/washers-and-dryers/washing-machines/ww6000t-front-loading-11kg-white-ww11cg604dlesa/';

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

function html(model = 'WBE4302AC-R', availability = null) {
  const offers = availability == null
    ? ''
    : `,"offers":{"@type":"Offer","availability":"${availability}"}`;
  return Buffer.from(`<!doctype html><html><head>
    <title>425L bottom freezer fridge - ${model} | Westinghouse Australia</title>
    <link rel="canonical" href="${WESTINGHOUSE_URL}">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","mpn":"${model}"${offers}}</script>
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

test('binds structured availability to the same exact Product identity without treating page text as stock', async () => {
  assert.equal(
    extractOfficialHtmlMarketSignal(html('WBE4302AC-R', 'https://schema.org/InStock'), 'WBE4302AC-R').status,
    'AVAILABLE',
  );
  assert.equal(
    extractOfficialHtmlMarketSignal(html('WBE4302AC-R', 'https://schema.org/OutOfStock'), 'WBE4302AC-R').status,
    'UNAVAILABLE',
  );
  assert.equal(extractOfficialHtmlMarketSignal(html(), 'WBE4302AC-R').status, 'UNKNOWN');
  assert.equal(extractOfficialHtmlMarketSignal(Buffer.from(`<!doctype html><html><head>
    <script type="application/ld+json">{"@type":"Product","mpn":"OTHER","offers":{"availability":"https://schema.org/InStock"}}</script>
  </head><body>WBE4302AC-R is in stock</body></html>`), 'WBE4302AC-R').status, 'UNKNOWN');

  const conflict = Buffer.from(`<!doctype html><html><head>
    <script type="application/ld+json">{"@type":"Product","mpn":"WBE4302AC-R","offers":[
      {"availability":"https://schema.org/InStock"},
      {"availability":"https://schema.org/OutOfStock"}
    ]}</script>
  </head></html>`);
  assert.equal(extractOfficialHtmlMarketSignal(conflict, 'WBE4302AC-R').status, 'CONFLICT');
});

test('acquisition and offline replay preserve structured official market signals', async () => {
  const { manifest, objects } = await fixture({
    seedsDocument: seeds({ seeds: [seeds().seeds[1]] }),
    fetchArtifact: async (seed) => ({
      requestedUrl: seed.sourceUrl,
      finalUrl: seed.sourceUrl,
      redirectChain: [],
      contentType: seed.mediaType,
      bytes: html('WBE4302AC-R', 'https://schema.org/InStock'),
      transport: 'fetch',
    }),
  });
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.records[0].marketSignal.status, 'AVAILABLE');
  assert.equal(manifest.summary.byMarketSignal.AVAILABLE, 1);
  const observations = await loadOfficialIdentityEvidence({
    manifest,
    readObject: async (path) => objects.get(path),
  });
  assert.equal(observations[0].marketSignal.status, 'AVAILABLE');
});

test('keeps canonical model separate from a narrowly approved Australian source SKU', async () => {
  const sourceModel = 'WW11CG604DLESA';
  const samsungSeeds = seeds({ seeds: [{
    evidenceId: 'official_identity_samsung_ww11cg604dle_html',
    category: 'washing_machine',
    brand: 'Samsung',
    model: 'WW11CG604DLE',
    sourceModel,
    sourceUrl: SAMSUNG_URL,
    mediaType: 'text/html',
  }] });
  const objects = new Map();
  const bytes = Buffer.from(`<!doctype html><html><head><script type="application/ld+json">{
    "@type":"Product","sku":"${sourceModel}",
    "offers":{"@type":"Offer","availability":"https://schema.org/InStock"}
  }</script></head></html>`);
  const manifest = await acquireOfficialIdentityEvidence({
    seedsDocument: samsungSeeds,
    acquiredAt: ACQUIRED_AT,
    fetchArtifact: async (seed) => ({
      requestedUrl: seed.sourceUrl,
      finalUrl: seed.sourceUrl,
      redirectChain: [],
      contentType: 'text/html',
      bytes,
      transport: 'fetch',
    }),
    writeObject: async (path, value) => objects.set(path, Buffer.from(value)),
  });
  assert.equal(manifest.records[0].identity.model, 'WW11CG604DLE');
  assert.equal(manifest.records[0].sourceIdentityModel, sourceModel);
  assert.equal(manifest.records[0].marketSignal.status, 'AVAILABLE');

  const observations = await loadOfficialIdentityEvidence({
    manifest,
    readObject: async (path) => objects.get(path),
  });
  assert.equal(observations[0].model, 'WW11CG604DLE');
  assert.equal(observations[0].sourceIdentityModel, sourceModel);
  assert.ok(!('dimensions' in observations[0]) && !('fit' in observations[0]));

  await assert.rejects(() => acquireOfficialIdentityEvidence({
    seedsDocument: seeds({ seeds: [{
      ...samsungSeeds.seeds[0],
      sourceModel: 'WW11CG604DLEAU',
    }] }),
    acquiredAt: ACQUIRED_AT,
    fetchArtifact: async () => assert.fail('unapproved variant must fail before fetch'),
    writeObject: async () => assert.fail('unapproved variant must not be stored'),
  }), /approved HTML model variant/i);
});

test('accepts the LG PDP copy-model control but not arbitrary data-sku attributes', () => {
  const exact = extractOfficialHtmlIdentityLocators(Buffer.from(`<!doctype html><html><body>
    <button class="btn-copy" data-sku="GS-B655PL">Copy model</button>
  </body></html>`), 'GS-B655PL');
  assert.equal(exact.length, 1);
  assert.equal(exact[0].kind, 'product_copy_model_attribute');

  assert.throws(() => extractOfficialHtmlIdentityLocators(Buffer.from(`<!doctype html><html><body>
    <div data-sku="GS-B655PL">Related product</div>
  </body></html>`), 'GS-B655PL'), /structured exact-model/i);
});

test('accepts only a Samsung AU exact support canonical as support identity', () => {
  const exact = extractOfficialHtmlIdentityLocators(Buffer.from(`<!doctype html><html><head>
    <link rel="canonical" href="https://www.samsung.com/au/support/model/WW90DG6U34LESA/">
  </head></html>`), 'WW90DG6U34LESA');
  assert.equal(exact.length, 1);
  assert.equal(exact[0].kind, 'official_support_canonical_model');

  for (const url of [
    'https://www.samsung.com/nz/support/model/WW90DG6U34LESA/',
    'https://example.com/au/support/model/WW90DG6U34LESA/',
    'https://www.samsung.com/au/support/search/?model=WW90DG6U34LESA',
  ]) {
    assert.throws(() => extractOfficialHtmlIdentityLocators(Buffer.from(`<!doctype html><html><head>
      <link rel="canonical" href="${url}">
    </head></html>`), 'WW90DG6U34LESA'), /structured exact-model/i);
  }
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
