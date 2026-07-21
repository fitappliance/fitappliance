import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  buildHistoricalPdfOfflineReplayQueue,
  loadHistoricalPdfReplayArtifact,
} from '../../src/domain/historical-pdf-offline-replay.mjs';

const PDF_SHA = 'a'.repeat(64);
const SNAPSHOT_SHA = 'b'.repeat(64);

function fixture(overrides = {}) {
  const classification = {
    schemaVersion: 1,
    generatedAt: '2026-07-14T12:00:00.000Z',
    records: [{
      referenceId: 'fa_ref_one',
      category: 'dishwasher',
      canonicalBrand: 'Example Brand',
      model: 'EX-100',
      lifecycleState: 'CURRENT_RETAIL',
      operationalClass: 'OFFLINE_REPLAY',
      documentLinks: [{
        documentId: `pdf:${PDF_SHA}`,
        sourceUrl: 'https://example.com.au/manuals/EX-100.pdf',
        evidenceObjectIds: [`mineru-index:${PDF_SHA}`],
        corpusState: 'CURRENT_MINERU',
        sourceAuthority: 'OFFICIAL',
        identityScope: 'EXACT_MODEL',
        extractionState: 'ALL_AXIS_SCALAR',
        receiptState: 'NONE',
        sourcePdfSha256: PDF_SHA,
        grammarProfileId: 'pdf_grammar_one',
      }],
    }],
  };
  const historicalReference = {
    generatedAt: '2026-07-14T11:00:00.000Z',
    records: [{
      referenceId: 'fa_ref_one',
      category: 'dishwasher',
      brand: 'Example Brand',
      model: 'EX-100',
      lifecycleState: 'CURRENT_RETAIL',
      lookupAction: 'CONFIRM_REQUIRED',
      evidenceState: 'REGISTRY_CONSISTENT',
      dimensionsMm: { width: 600, height: 820, depth: 570 },
      registryDimensionState: 'CONSISTENT',
      sources: [{ sourceId: 'energy-rating:dishwasher', snapshotSha256: SNAPSHOT_SHA }],
      catalogProductIds: ['dishwasher-ex-100'],
    }],
  };
  const publicProjection = {
    products: [{
      id: 'dishwasher-ex-100', cat: 'dishwasher', brand: 'Example Brand', model: 'EX-100',
      canonicalProductId: 'fa_prod_one', unavailable: false,
      retailers: [{ retailer: 'Example', url: 'https://www.appliancesonline.com.au/product/example' }],
      retailLifecycle: {
        schemaVersion: 1,
        policyVersion: 'retail-lifecycle-v1',
        asOf: '2026-07-20T00:00:00.000Z',
        canonicalProductId: 'fa_prod_one',
        catalogState: 'LISTED_UNVERIFIED',
        lifecycleState: 'CURRENT_RETAIL',
        authorizingObservation: {
          id: 'obs_example_current',
          canonicalProductId: 'fa_prod_one',
          adapterId: 'ao-api-v1',
          retailer: 'Appliances Online',
          retailerProductId: 'example',
          observedAt: '2026-07-19T00:00:00.000Z',
          url: 'https://www.appliancesonline.com.au/product/example',
          availability: 'available',
          listingState: 'current',
          freshnessState: 'FRESH',
          rawSourceSha256: 'c'.repeat(64),
          policyVersion: 'ao-source-v1',
        },
        latestObservations: [],
        observationConflicts: [],
        collectionAttempts: [],
        reasonCodes: [],
      },
    }],
  };
  publicProjection.products[0].retailLifecycle.latestObservations = [
    publicProjection.products[0].retailLifecycle.authorizingObservation,
  ];
  const legacyPdfAudit = {
    pdfDocuments: [{
      sourcePdfSha256: PDF_SHA,
      physicalPaths: [`evidence/web/sha256/aa/aa/${PDF_SHA}.pdf`],
      sourceAuthority: 'OFFICIAL',
      identityScope: 'EXACT_MODEL',
      extractionState: 'ALL_AXIS_SCALAR',
      modelLinks: [{
        referenceId: 'fa_ref_one', category: 'dishwasher', brand: 'Example Brand', model: 'EX-100',
        identityScope: 'EXACT_MODEL', extractionState: 'ALL_AXIS_SCALAR',
      }],
      mineruIndex: {
        sourcePdfSha256: PDF_SHA,
        status: 'indexed',
        parserVersion: '3.4.4',
        modelRevision: 'mineru-revision',
      },
    }],
  };
  const imageRepairAudit = {
    schemaVersion: 1,
    outcomes: [{
      schemaVersion: 1,
      referenceId: 'fa_ref_one',
      sourcePdfSha256: PDF_SHA,
      brand: 'Example Brand',
      model: 'EX-100',
      extractionStatus: 'extracted',
      dimensionEvidence: { width: 600, height: 820, depth: 570 },
      dimensionsMm: { width: 600, height: 820, depth: 570 },
      officialSource: {
        referenceId: 'fa_ref_one',
        documentId: `pdf:${PDF_SHA}`,
        sourceAuthority: 'OFFICIAL',
      },
      evidenceBinding: { sourcePdfSha256: PDF_SHA },
      decision: 'READY_FOR_RECEIPT_REPLAY',
      publicationEligible: false,
    }],
  };
  return {
    classification,
    historicalReference,
    publicProjection,
    legacyPdfAudit,
    imageRepairAudit,
    priorAcceptanceBundle: { entries: [] },
    ...overrides,
  };
}

test('offline replay queue binds one exact current MinerU PDF to one current catalog product', () => {
  const queue = buildHistoricalPdfOfflineReplayQueue(fixture());

  assert.equal(queue.schemaVersion, 2);
  assert.equal(queue.summary.targets, 1);
  assert.equal(queue.summary.artifacts, 1);
  assert.equal(queue.jobs[0].authorityMode, 'official');
  assert.equal(queue.jobs[0].acquisitionRoute, 'OFFICIAL_RECEIPT_REBUILD');
  assert.equal(queue.replayArtifacts[0].sourcePdfSha256, PDF_SHA);
  assert.equal(queue.replayArtifacts[0].mineruIndex.parserVersion, '3.4.4');
  assert.equal(queue.targets[0].legacyRuntimeId, 'dishwasher-ex-100');
  assert.equal(queue.targets[0].canonicalProductId, 'fa_prod_one');
  assert.deepEqual(queue.targets[0].registryDimensionHints, [{
    sourceId: 'energy-rating:dishwasher',
    snapshotSha256: SNAPSHOT_SHA,
    dimensionsMm: { width: 600, height: 820, depth: 570 },
  }]);
  assert.equal(queue.targets[0].publicationEligible, false);
});

test('offline replay queue fails closed on ambiguous products, PDFs, identity, or parser state', () => {
  const multipleProducts = fixture();
  multipleProducts.historicalReference.records[0].catalogProductIds.push('dishwasher-ex-100-copy');
  multipleProducts.publicProjection.products.push({
    ...multipleProducts.publicProjection.products[0],
    id: 'dishwasher-ex-100-copy',
  });
  assert.throws(
    () => buildHistoricalPdfOfflineReplayQueue(multipleProducts),
    /exactly one current catalog product/i,
  );

  const multiplePdfs = fixture();
  multiplePdfs.classification.records[0].documentLinks.push({
    ...multiplePdfs.classification.records[0].documentLinks[0],
    sourcePdfSha256: 'c'.repeat(64),
    documentId: `pdf:${'c'.repeat(64)}`,
  });
  assert.throws(
    () => buildHistoricalPdfOfflineReplayQueue(multiplePdfs),
    /exactly one replayable PDF/i,
  );

  const familyOnly = fixture();
  familyOnly.classification.records[0].documentLinks[0].identityScope = 'FAMILY';
  assert.throws(
    () => buildHistoricalPdfOfflineReplayQueue(familyOnly),
    /exactly one replayable PDF/i,
  );

  const parserGap = fixture();
  parserGap.classification.records[0].documentLinks[0].extractionState = 'PARSER_GAP';
  assert.throws(
    () => buildHistoricalPdfOfflineReplayQueue(parserGap),
    /exactly one replayable PDF/i,
  );
});

test('offline replay queue rejects audit drift and excludes identities already in the cumulative bundle', () => {
  const drift = fixture();
  drift.imageRepairAudit.outcomes[0].decision = 'AMBIGUOUS_DIMENSION_VALUES';
  assert.throws(() => buildHistoricalPdfOfflineReplayQueue(drift), /canonical parser audit.*replay/i);

  const repairedParser = fixture();
  repairedParser.legacyPdfAudit.pdfDocuments[0].modelLinks[0].extractionState = 'PARSER_GAP';
  assert.equal(buildHistoricalPdfOfflineReplayQueue(repairedParser).summary.targets, 1);

  const accepted = fixture({
    priorAcceptanceBundle: {
      entries: [{
        targetId: 'existing', referenceId: 'fa_ref_one', brand: 'Example Brand', model: 'EX-100',
        category: 'dishwasher', acceptanceStatus: 'receipt_accepted_non_scalar',
      }],
    },
  });
  const queue = buildHistoricalPdfOfflineReplayQueue(accepted);
  assert.equal(queue.summary.targets, 0);
  assert.equal(queue.summary.excluded.ALREADY_RECEIPT_BOUND, 1);
});

test('offline replay queue is deterministic and rejects unsafe source URLs', () => {
  const first = buildHistoricalPdfOfflineReplayQueue(fixture());
  const second = buildHistoricalPdfOfflineReplayQueue(fixture());
  assert.deepEqual(first, second);

  const unsafe = fixture();
  unsafe.classification.records[0].documentLinks[0].sourceUrl = 'http://example.com/EX-100.pdf';
  assert.throws(() => buildHistoricalPdfOfflineReplayQueue(unsafe), /trusted HTTPS/i);
});

async function artifactFixture() {
  const root = await mkdtemp(join(tmpdir(), 'fitappliance-offline-replay-'));
  const pdfBytes = Buffer.from('%PDF-1.7\nexample');
  const pdfSha = createHash('sha256').update(pdfBytes).digest('hex');
  const jsonBytes = Buffer.from(JSON.stringify([[]]));
  const jsonSha = createHash('sha256').update(jsonBytes).digest('hex');
  const pdfPath = `evidence/objects/sha256/${pdfSha.slice(0, 2)}/${pdfSha}.pdf`;
  const canonicalPdfPath = `evidence/web/sha256/${pdfSha.slice(0, 2)}/${pdfSha.slice(2, 4)}/${pdfSha}.pdf`;
  const jsonPath = `evidence/derived/mineru-json/sha256/${jsonSha.slice(0, 2)}/${jsonSha.slice(2, 4)}/${jsonSha}.json`;
  const indexPath = `cache/mineru-index/${pdfSha}.json`;
  const index = {
    schemaVersion: 1,
    sourcePdfSha256: pdfSha,
    parserVersion: '3.4.4',
    modelRevision: 'mineru-revision',
    derivedArtifact: {
      schemaVersion: 1,
      format: 'content_list_v2',
      parserName: 'MinerU',
      parserVersion: '3.4.4',
      modelRevision: 'mineru-revision',
      backend: 'pipeline',
      method: 'auto',
      tableEnabled: true,
      formulaEnabled: false,
      sourcePdfSha256: pdfSha,
      contentSha256: jsonSha,
      objectPath: jsonPath,
      byteSize: jsonBytes.length,
      pageCount: 1,
    },
  };
  for (const [path, bytes] of [[pdfPath, pdfBytes], [jsonPath, jsonBytes], [indexPath, Buffer.from(JSON.stringify(index))]]) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), bytes);
  }
  return {
    root, pdfBytes, jsonBytes, pdfPath, canonicalPdfPath, jsonPath, indexPath, index,
    async writeObject(relativePath, bytes) {
      await mkdir(dirname(join(root, relativePath)), { recursive: true });
      await writeFile(join(root, relativePath), bytes);
    },
    job: {
      jobId: 'offline_replay_one', sourceUrl: 'https://example.com.au/manual.pdf',
      authorityBrand: 'Example', authorityMode: 'official',
    },
    replayArtifact: {
      jobId: 'offline_replay_one', sourcePdfSha256: pdfSha,
      sourceUrl: 'https://example.com.au/manual.pdf', physicalPaths: [pdfPath],
      mineruIndex: {
        sourcePdfSha256: pdfSha, status: 'indexed', parserVersion: '3.4.4',
        modelRevision: 'mineru-revision',
      },
    },
  };
}

test('frozen replay loader verifies PDF, MinerU index and derived JSON before attestation', async () => {
  const fixture = await artifactFixture();
  const artifact = await loadHistoricalPdfReplayArtifact({
    job: fixture.job,
    replayArtifact: fixture.replayArtifact,
    storageRoot: fixture.root,
    writeObject: fixture.writeObject,
  });

  assert.equal(artifact.contentSha256, fixture.replayArtifact.sourcePdfSha256);
  assert.equal(artifact.objectPath, fixture.canonicalPdfPath);
  assert.deepEqual(artifact.bytes, fixture.pdfBytes);
  assert.deepEqual(artifact.derivedArtifactBytes, fixture.jsonBytes);
  assert.equal(artifact.derivedArtifact.contentSha256, fixture.index.derivedArtifact.contentSha256);
});

test('frozen replay loader rejects path escapes, hash drift and MinerU metadata drift', async () => {
  const escaped = await artifactFixture();
  escaped.replayArtifact.physicalPaths = ['../outside.pdf'];
  await assert.rejects(
    loadHistoricalPdfReplayArtifact({ job: escaped.job, replayArtifact: escaped.replayArtifact, storageRoot: escaped.root, writeObject: escaped.writeObject }),
    /escaped storage root/i,
  );

  const pdfDrift = await artifactFixture();
  await writeFile(join(pdfDrift.root, pdfDrift.pdfPath), Buffer.from('%PDF-1.7\ntampered'));
  await assert.rejects(
    loadHistoricalPdfReplayArtifact({ job: pdfDrift.job, replayArtifact: pdfDrift.replayArtifact, storageRoot: pdfDrift.root, writeObject: pdfDrift.writeObject }),
    /PDF.*integrity/i,
  );

  const mineruDrift = await artifactFixture();
  mineruDrift.replayArtifact.mineruIndex.modelRevision = 'unexpected-revision';
  await assert.rejects(
    loadHistoricalPdfReplayArtifact({ job: mineruDrift.job, replayArtifact: mineruDrift.replayArtifact, storageRoot: mineruDrift.root, writeObject: mineruDrift.writeObject }),
    /MinerU.*drift/i,
  );
});
