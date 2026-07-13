import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  validateHistoricalEvidenceRecoveryAcceptanceBundle,
} from '../../src/domain/historical-evidence-recovery-contract.mjs';
import { verifyVerificationReceipt } from '../../src/domain/evidence-source-verifier.mjs';

const fixture = JSON.parse(await readFile(new URL(
  '../fixtures/architecture-v2/historical-recovery/wd8560f1-canary.json',
  import.meta.url,
), 'utf8'));
const bundle = JSON.parse(await readFile(new URL(
  '../../data/architecture-v2/reviews/automated/historical-evidence-recovery-acceptance-bundle.json',
  import.meta.url,
), 'utf8'));

test('real WD8560F1 canary binds exact official PDF, MinerU claims and dimensions-only geometry', () => {
  validateHistoricalEvidenceRecoveryAcceptanceBundle(bundle);
  const outcome = bundle.entries.find((row) => row.targetId === fixture.targetId);
  assert.equal(outcome?.acceptanceStatus, 'accepted');
  assert.equal(outcome.sources.length, 1);
  const source = outcome.sources[0];
  assert.equal(source.authority, 'manufacturer');
  assert.equal(source.sourceUrl, fixture.source.sourceUrl);
  assert.equal(source.contentSha256, fixture.source.contentSha256);
  assert.equal(source.byteSize, fixture.source.byteSize);
  assert.equal(source.derivedArtifact.contentSha256, fixture.source.derivedContentSha256);
  assert.equal(source.derivedArtifact.pageCount, fixture.source.pageCount);
  assert.equal(source.derivedArtifact.parserVersion, fixture.source.parserVersion);
  assert.equal(source.derivedArtifact.modelRevision, fixture.source.modelRevision);

  assert.deepEqual(source.claims.map((claim) => ({
    field: claim.field,
    mm: claim.value.mm,
    sourceLabel: claim.sourceLabel,
    page: claim.page,
    bbox: claim.bbox,
  })), fixture.claims);
  assert.equal(source.verificationReceipt.schemaVersion, 3);
  assert.equal(source.verificationReceipt.claimSemanticsVersion, 2);
  assert.equal(verifyVerificationReceipt(source, fixture.identity, {
    asOf: source.verificationReceipt.verifiedAt,
  }), true);

  const projection = outcome.geometryProjection;
  assert.deepEqual({
    widthMm: projection.geometry.closedEnvelope.widthMm,
    heightMinimumMm: projection.geometry.closedEnvelope.heightMm.minimumMm,
    heightMaximumMm: projection.geometry.closedEnvelope.heightMm.maximumMm,
    depthMm: projection.geometry.closedEnvelope.depthMm,
    evidenceLevel: projection.evidenceLevel,
    verifiedFitEligible: projection.verifiedFitEligible,
    successfulFitOutcome: projection.successfulFitOutcome,
  }, fixture.projection);
  assert.equal(projection.geometry.installation.rearMm, null);
  assert.equal(projection.geometry.service.rearServicesMm, null);
});

test('real canary result contains no retailer-mirror receipt or verified-fit promotion', () => {
  const outcome = bundle.entries.find((row) => row.targetId === fixture.targetId);
  assert.ok(outcome.sources.every((source) => !/appliancesonline\.com\.au/i.test(source.sourceUrl)));
  assert.equal(outcome.geometryProjection.verifiedFitEligible, false);
  assert.ok(outcome.geometryProjection.missingForVerifiedFit.length > 0);
});
