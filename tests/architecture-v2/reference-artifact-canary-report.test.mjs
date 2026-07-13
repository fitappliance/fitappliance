import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const reportUrl = new URL('../../data/architecture-v2/reviews/automated/reference-artifact-rediscovery-canary.json', import.meta.url);

test('reference rediscovery canary cannot publish mirror evidence or an unbound official family manual', async () => {
  const report = JSON.parse(await readFile(reportUrl, 'utf8'));
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.artifact.authorityMode, 'reference');
  assert.equal(report.fingerprint.authorityMode, 'reference');
  assert.equal(report.fingerprint.publishable, false);
  assert.equal(report.fingerprint.receiptEligible, false);
  assert.equal(report.fingerprint.identityUse, 'discovery_only');
  assert.equal(Object.hasOwn(report.artifact, 'claims'), false);
  assert.equal(Object.hasOwn(report.artifact, 'verificationReceipt'), false);
  assert.equal(Object.hasOwn(report.fingerprint, 'claims'), false);
  assert.equal(Object.hasOwn(report.fingerprint, 'verificationReceipt'), false);

  const official = report.officialAttachment;
  assert.equal(official.authorityMode, 'official');
  assert.notEqual(official.sourceUrl, report.artifact.sourceUrl);
  assert.notEqual(official.contentSha256, report.artifact.contentSha256);
  assert.equal(official.discoveryProvenance.method, 'official_product_page');
  assert.match(official.discoveryProvenance.discoveryContentSha256, /^[a-f0-9]{64}$/);
  assert.match(official.discoveryProvenance.discoveryObjectPath, /\.html$/);
  assert.ok(official.discoveryProvenance.discoveryByteSize > 0);
  assert.equal(official.discoveryProvenance.artifactLinkUrl, official.landingPageUrl);
  assert.equal(official.discoveryProvenance.artifactUrl, official.sourceUrl);
  assert.equal(official.attestation.status, 'identity_rejected');
  assert.equal(official.receiptEligible, false);
  assert.equal(Object.hasOwn(official, 'verificationReceipt'), false);

  assert.equal(report.summary.finalStatus, 'identity_rejected');
  assert.equal(report.summary.acceptedSources, 0);
  assert.equal(report.summary.referenceReceipts, 0);
  assert.equal(report.summary.officialReceipts, 0);
  assert.equal(report.summary.unsafePromotions, 0);
  assert.equal(report.summary.mirrorScaleAllowed, false);
});
