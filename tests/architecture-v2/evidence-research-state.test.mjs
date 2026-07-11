import test from 'node:test';
import assert from 'node:assert/strict';

import { recordResearchAttempt } from '../../src/domain/evidence-research-state.mjs';

function caseRecord(overrides = {}) {
  return {
    id: 'case-1', legacyRuntimeId: 'fridge-1', brand: 'Westinghouse', model: 'M1',
    category: 'fridge', attempt: 1, maxAttempts: 3, sources: [], history: [],
    ...overrides,
  };
}

test('failed research advances attempts and reaches machine terminal exhaustion', () => {
  const second = recordResearchAttempt(caseRecord(), {
    outcome: 'failed', candidateUrl: 'https://www.westinghouse.com.au/m1', reason: 'http_503',
  }, '2026-07-11T15:00:00.000Z');
  assert.equal(second.attempt, 2);
  assert.equal(second.automationState, 'research_required');
  const third = recordResearchAttempt(second, {
    outcome: 'failed', candidateUrl: 'https://www.westinghouse.com.au/m1', reason: 'http_503',
  }, '2026-07-11T15:05:00.000Z');
  assert.equal(third.attempt, 3);
  assert.equal(third.automationState, 'quarantined');
  assert.equal(third.terminalReason, 'evidence_search_exhausted');
});

test('verified source is appended once and replay of the same hash is idempotent', () => {
  const source = { contentSha256: 'a'.repeat(64), finalUrl: 'https://www.westinghouse.com.au/m1' };
  const updated = recordResearchAttempt(caseRecord(), { outcome: 'verified', source }, '2026-07-11T15:00:00.000Z');
  assert.equal(updated.sources.length, 1);
  assert.equal(updated.attempt, 2);
  const replayed = recordResearchAttempt(updated, { outcome: 'verified', source }, '2026-07-11T15:01:00.000Z');
  assert.deepEqual(replayed, updated);
});

test('interrupted attempts are recorded without inventing source evidence', () => {
  const updated = recordResearchAttempt(caseRecord(), {
    outcome: 'interrupted', candidateUrl: null, reason: 'process_signal',
  }, '2026-07-11T15:00:00.000Z');
  assert.equal(updated.sources.length, 0);
  assert.equal(updated.attempt, 2);
  assert.equal(updated.history.at(-1).outcome, 'interrupted');
});
