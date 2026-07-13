import test from 'node:test';
import assert from 'node:assert/strict';

import { runPdfBrandAcceptanceBatch } from '../../scripts/architecture-v2/run-pdf-brand-acceptance.mjs';

test('PDF-brand acceptance preserves its legacy result schema through the graph adapter', async () => {
  const batch = {
    schemaVersion: 1,
    batchId: 'pdf-brand-test',
    reviewedAt: '2026-07-13T00:00:00.000Z',
    entries: [{
      id: 'entry-1',
      legacyRuntimeId: 'dishwasher-1',
      brand: 'Example',
      model: 'EX100',
      category: 'dishwasher',
      url: 'https://official.example.com/EX100.pdf',
    }],
  };
  let graphBatch;
  const source = {
    contentType: 'application/pdf',
    identity: { outcome: 'exact' },
    claims: [{ field: 'closedEnvelope.widthMm', value: 598, page: 1 }],
    verificationReceipt: { bindingSha256: 'a'.repeat(64) },
  };
  const result = await runPdfBrandAcceptanceBatch(batch, {
    graphRunner: async (input) => {
      graphBatch = input;
      return {
        outcomes: [{
          targetId: 'entry-1',
          status: 'accepted',
          failureCode: null,
          sources: [source],
          geometryProjection: { evidenceLevel: 'dimensions', successfulFitOutcome: 'INSUFFICIENT_DATA' },
        }],
      };
    },
    graphDependencies: {},
  });

  assert.equal(graphBatch.artifactJobs.length, 1);
  assert.equal(graphBatch.targets.length, 1);
  assert.deepEqual(Object.keys(result).sort(), ['batchId', 'outcomes', 'reviewedAt', 'schemaVersion', 'summary']);
  assert.deepEqual(Object.keys(result.outcomes[0]).sort(), [
    'acquisition', 'artifactType', 'brand', 'category', 'claims', 'diagnosticArtifacts',
    'failures', 'geometryProjection', 'id', 'identity', 'mineru', 'model', 'outcome',
    'receipt', 'requestedUrl', 'requestedUrls', 'source',
  ].sort());
  assert.equal(result.outcomes[0].outcome, 'accepted');
  assert.equal(result.summary.accepted, 1);
});

