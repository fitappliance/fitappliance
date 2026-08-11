import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  auditPrivateEvidenceFiles,
  auditRepositoryPrivateEvidence,
} = require('../scripts/audit-private-evidence-boundary.js');

const privatePolicy = JSON.stringify({
  sources: [{
    id: 'the-good-guys-partnerize-feed-v1',
    sourceType: 'affiliate_feed',
    termsReviewState: 'reviewed_private_campaign_use',
    legacyLinkAction: 'PRIVATE_EVIDENCE_ONLY',
  }],
});

test('private evidence boundary rejects tracked Partnerize rows and feed URLs', () => {
  const result = auditPrivateEvidenceFiles([
    {
      path: 'data/catalog-final.json',
      text: JSON.stringify({
        products: [{
          retailers: [{
            source: 'partnerize-feed',
            affiliate_network: 'partnerize',
            affiliate_url: 'https://prf.hn/click/redacted',
            tgg_sku: '50000000',
          }],
        }],
      }),
    },
  ]);

  assert.equal(result.violations.length > 0, true);
  assert.equal(result.violations.every((row) => row.rule === 'tracked-private-evidence'), true);
});

test('private evidence boundary rejects indirect Partnerize labels outside the source policy', () => {
  const result = auditPrivateEvidenceFiles([{
    path: 'data/architecture-v2/reviews/phase-10/evidence-batch-selection-input.json',
    text: JSON.stringify({ selectionBasis: 'active_partnerize_inventory_with_bounds' }),
  }]);

  assert.deepEqual(result.violations.map((row) => row.marker), ['partnerize-selection-basis']);
});

test('private evidence boundary rejects private affiliate details in public HTML', () => {
  const result = auditPrivateEvidenceFiles([{
    path: 'pages/affiliate-disclosure.html',
    text: '<p>Partnerize / Commission Factory / Performance Horizon via prf.hn.</p>',
  }]);

  assert.deepEqual(result.violations.map((row) => row.rule), [
    'public-private-affiliate-reference',
    'public-private-affiliate-reference',
    'public-private-affiliate-reference',
    'public-private-affiliate-reference',
  ]);
  assert.deepEqual(result.violations.map((row) => row.marker), [
    'partnerize',
    'commission-factory',
    'performance-horizon',
    'prf-hn',
  ]);
});

test('private evidence boundary permits only the explicit private-use source policy declaration', () => {
  const result = auditPrivateEvidenceFiles([
    {
      path: 'data/architecture-v2/policies/retailer-source-policy.json',
      text: privatePolicy,
    },
  ]);

  assert.deepEqual(result.violations, []);
});

test('private evidence boundary rejects a policy that claims public Partnerize use', () => {
  const result = auditPrivateEvidenceFiles([
    {
      path: 'data/architecture-v2/policies/retailer-source-policy.json',
      text: privatePolicy.replace('PRIVATE_EVIDENCE_ONLY', 'REPLAY_PARTNERIZE_FEED'),
    },
  ]);

  assert.deepEqual(result.violations.map((row) => row.rule), ['partnerize-policy-not-private']);
});

test('repository tracked operational data contains no private Partnerize evidence', async () => {
  const result = await auditRepositoryPrivateEvidence({
    repoRoot: process.cwd(),
    logger: { log() {}, error() {} },
  });

  assert.equal(result.exitCode, 0, JSON.stringify(result.violations.slice(0, 20), null, 2));
  assert.deepEqual(result.violations, []);
});
