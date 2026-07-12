import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildIdentityResearchQueue,
  classifyIdentityFailure,
} from '../../src/domain/identity-research-queue.mjs';

const readJson = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const phase8Selection = readJson('data/architecture-v2/reviews/phase-08/evidence-pilot.json');
const phase8ReviewInput = readJson('data/architecture-v2/reviews/phase-08/evidence-pilot-review-input.json');
const phase8Bundles = readJson('data/architecture-v2/generated/evidence-review-bundles.json');
const phase10Manifest = readJson('data/architecture-v2/generated/phase10-evidence-review-manifest.json');
const recoveryBatch = readJson('data/architecture-v2/reviews/automated/identity-range-recovery-acceptance-batch.json');
const recoveryResults = readJson('data/architecture-v2/reviews/automated/identity-range-recovery-acceptance-results.json');

test('identity failure taxonomy distinguishes all known ambiguity classes', () => {
  assert.equal(classifyIdentityFailure('exact_sales_model_not_visible_on_rendered_page'), 'target_not_visible');
  assert.equal(classifyIdentityFailure('rendered_document_identifies_WSF6606X_not_WSF6606XB'), 'suffix_mismatch');
  assert.equal(classifyIdentityFailure('series_manual_does_not_show_exact_sales_model_on_rendered_dimension_page'), 'series_manual_missing_exact_sku');
  assert.equal(classifyIdentityFailure('official PDF covers RF44A family but does not print sales model SRF5300SD'), 'family_only');
  assert.equal(classifyIdentityFailure('official PDF filename references X but the rendered manual cover prints Y'), 'filename_cover_conflict');
  assert.equal(classifyIdentityFailure('network timeout'), null);
});

test('known identity failures become an autonomous fail-closed research queue', () => {
  const queue = buildIdentityResearchQueue({
    phase8Selection,
    phase8ReviewInput,
    phase8Bundles,
    phase10Outcomes: phase10Manifest.outcomes,
    recoveryBatch,
    recoveryResults,
    generatedAt: '2026-07-12T00:00:00.000Z',
  });
  assert.deepEqual(queue.summary, {
    cases: 9,
    needsResearch: 0,
    resolved: 8,
    quarantined: 1,
    targetNotVisible: 2,
    suffixMismatch: 2,
    seriesManualMissingExactSku: 3,
    familyOnly: 1,
    filenameCoverConflict: 1,
  });
  assert.ok(queue.cases.every((entry) => entry.requiresHumanReview === false));
  assert.ok(queue.cases.filter((entry) => entry.status === 'resolved').every((entry) => (
    entry.publication.release === true
    && entry.approvedFields.length === 3
    && entry.resolution.receiptBindingSha256.length === 64
  )));
  const unresolved = queue.cases.find((entry) => entry.status === 'quarantined');
  assert.equal(unresolved.legacyRuntimeId, 'discovery-washing-machine-samsung-ww12bb944dgb');
  assert.equal(unresolved.publication.release, false);
  assert.equal(unresolved.approvedFields.length, 0);
  const westinghouse = queue.cases.find((entry) => entry.legacyRuntimeId === 'dishwasher-adw1155');
  assert.equal(westinghouse.targetModel, 'WSF6606XB');
  assert.deepEqual(westinghouse.observedModels, ['WSF6606X']);
  assert.deepEqual(westinghouse.allowedApprovalTiers, ['tier_a', 'tier_b']);
  assert.deepEqual(westinghouse.tierBFieldLimit, [
    'closedEnvelope.depthMm',
    'closedEnvelope.heightMm',
    'closedEnvelope.widthMm',
  ]);
  const hisense = queue.cases.find((entry) => entry.legacyRuntimeId === 'washing_machine-acw1520');
  assert.deepEqual(hisense.observedModels, ['HWF8I1015B']);
  const samsungAlias = queue.cases.find((entry) => entry.legacyRuntimeId === 'ao-97642');
  assert.equal(samsungAlias.resolution.identityOutcome, 'official_marketing_alias');
  assert.equal(samsungAlias.resolution.sourceModel, 'RF44A5202SL_SA');
});
