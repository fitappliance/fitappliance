import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  appendPendingEvidenceEpoch,
  completeEvidenceEpoch,
  createEvidenceEpochDescriptor,
  createEvidenceEpochLedger,
  effectiveEvidencePublicationState,
  sameEvidenceEpochDescriptor,
  validateEvidenceEpochLedger,
  validateEvidenceEpochState,
} from '../../src/domain/evidence-epoch-reconciliation.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);

function descriptor(overrides = {}) {
  return createEvidenceEpochDescriptor({
    targetId: 'target-1',
    identity: { brand: 'Example', model: 'EX100', category: 'dishwasher' },
    priorReceiptBindingSha256: A,
    candidateSourceIdentities: ['https://example.com/b.pdf', 'https://example.com/a.pdf'],
    requiredSourceHashes: [C, B],
    conflictHashes: [B, A],
    policyVersions: ['policy-2', 'policy-1'],
    ...overrides,
  });
}

test('descriptor normalization is deterministic and sorts every set-valued field', () => {
  const first = descriptor();
  const second = descriptor({
    candidateSourceIdentities: [...first.candidateSourceIdentities].reverse(),
    requiredSourceHashes: [...first.requiredSourceHashes].reverse(),
    conflictHashes: [...first.conflictHashes].reverse(),
    policyVersions: [...first.policyVersions].reverse(),
  });

  assert.equal(sameEvidenceEpochDescriptor(first, second), true);
  assert.equal(first.semanticDescriptorSha256, second.semanticDescriptorSha256);
  assert.deepEqual(first.candidateSourceIdentities, [...first.candidateSourceIdentities].sort());
  assert.deepEqual(first.requiredSourceHashes, [B, C]);
  assert.deepEqual(first.conflictHashes, [A, B]);
  assert.deepEqual(first.policyVersions, ['policy-1', 'policy-2']);
});

test('candidate URL identity hashes cannot masquerade as acquired content hashes', () => {
  const sourceUrl = 'https://example.com/manual.pdf';
  const urlSha256 = createHash('sha256').update(sourceUrl).digest('hex');

  assert.throws(() => descriptor({
    candidateSourceIdentities: [sourceUrl],
    requiredSourceHashes: [urlSha256],
  }), /URL-derived identity.*content hash/i);
});

test('pending epoch survives a crash and identical begin and completion are idempotent', () => {
  const current = descriptor();
  const pending = appendPendingEvidenceEpoch({
    ledger: createEvidenceEpochLedger(),
    descriptor: current,
  });
  const replayedPending = appendPendingEvidenceEpoch({ ledger: pending, descriptor: current });
  assert.deepEqual(replayedPending, pending);
  assert.equal(effectiveEvidencePublicationState({
    ledger: pending,
    targetId: current.targetId,
    descriptorSha256: current.semanticDescriptorSha256,
  }).status, 'PENDING');

  const completed = completeEvidenceEpoch({ ledger: pending, descriptor: current, outcome: 'RETAINED' });
  const replayedCompletion = completeEvidenceEpoch({
    ledger: completed,
    descriptor: current,
    outcome: 'RETAINED',
  });
  assert.deepEqual(replayedCompletion, completed);
  assert.equal(completed.records.length, 2);
  assert.equal(effectiveEvidencePublicationState({
    ledger: completed,
    targetId: current.targetId,
    descriptorSha256: current.semanticDescriptorSha256,
  }).receiptBindingSha256, A);
});

test('supersession requires a distinct replacement receipt and conflicting completion is rejected', () => {
  const current = descriptor();
  const pending = appendPendingEvidenceEpoch({ ledger: createEvidenceEpochLedger(), descriptor: current });
  assert.throws(() => completeEvidenceEpoch({
    ledger: pending, descriptor: current, outcome: 'SUPERSEDED',
  }), /replacement receipt/i);
  assert.throws(() => completeEvidenceEpoch({
    ledger: pending, descriptor: current, outcome: 'SUPERSEDED', replacementReceiptBindingSha256: A,
  }), /different.*receipt/i);

  const completed = completeEvidenceEpoch({
    ledger: pending, descriptor: current, outcome: 'SUPERSEDED', replacementReceiptBindingSha256: B,
  });
  assert.equal(effectiveEvidencePublicationState({
    ledger: completed, targetId: current.targetId, descriptorSha256: current.semanticDescriptorSha256,
  }).receiptBindingSha256, B);
  assert.throws(() => completeEvidenceEpoch({
    ledger: completed,
    descriptor: current,
    outcome: 'ACCEPTANCE_REVOKED',
    reasonCode: 'OFFICIAL_CONFLICT',
    decisionEvidenceHashes: [C],
  }), /conflicting.*completion/i);
});

test('revoked and quarantined outcomes preserve history but block effective publication', () => {
  for (const outcome of ['ACCEPTANCE_REVOKED', 'ACCEPTANCE_QUARANTINED']) {
    const current = descriptor({ targetId: `target-${outcome}` });
    const pending = appendPendingEvidenceEpoch({ ledger: createEvidenceEpochLedger(), descriptor: current });
    const completed = completeEvidenceEpoch({
      ledger: pending,
      descriptor: current,
      outcome,
      reasonCode: outcome === 'ACCEPTANCE_REVOKED' ? 'OFFICIAL_CONFLICT' : 'IDENTITY_UNRESOLVED',
      decisionEvidenceHashes: [B, A, B],
    });
    const state = effectiveEvidencePublicationState({
      ledger: completed, targetId: current.targetId, descriptorSha256: current.semanticDescriptorSha256,
    });
    assert.equal(state.publishable, false);
    assert.equal(state.status, outcome);
    assert.equal(completed.records[0].descriptor.priorReceiptBindingSha256, A);
    assert.deepEqual(completed.records[1].decisionEvidenceHashes, [A, B]);
    assert.match(completed.records[1].reasonCode, /^[A-Z][A-Z0-9_]*$/);
  }
});

test('blocking outcomes require a typed reason and at least one decision evidence hash', () => {
  const current = descriptor();
  const pending = appendPendingEvidenceEpoch({ ledger: createEvidenceEpochLedger(), descriptor: current });

  assert.throws(() => completeEvidenceEpoch({
    ledger: pending,
    descriptor: current,
    outcome: 'ACCEPTANCE_REVOKED',
    decisionEvidenceHashes: [B],
  }), /reason code/i);
  assert.throws(() => completeEvidenceEpoch({
    ledger: pending,
    descriptor: current,
    outcome: 'ACCEPTANCE_QUARANTINED',
    reasonCode: 'IDENTITY_UNRESOLVED',
  }), /decision evidence hash/i);
  assert.throws(() => completeEvidenceEpoch({
    ledger: pending,
    descriptor: current,
    outcome: 'ACCEPTANCE_REVOKED',
    reasonCode: 'free form reason',
    decisionEvidenceHashes: [B],
  }), /machine-readable reason code/i);
});

test('decision evidence participates in idempotence and conflicting re-completion checks', () => {
  const current = descriptor();
  const pending = appendPendingEvidenceEpoch({ ledger: createEvidenceEpochLedger(), descriptor: current });
  const completed = completeEvidenceEpoch({
    ledger: pending,
    descriptor: current,
    outcome: 'ACCEPTANCE_REVOKED',
    reasonCode: 'OFFICIAL_CONFLICT',
    decisionEvidenceHashes: [B],
  });
  assert.deepEqual(completeEvidenceEpoch({
    ledger: completed,
    descriptor: current,
    outcome: 'ACCEPTANCE_REVOKED',
    reasonCode: 'OFFICIAL_CONFLICT',
    decisionEvidenceHashes: [B],
  }), completed);
  assert.throws(() => completeEvidenceEpoch({
    ledger: completed,
    descriptor: current,
    outcome: 'ACCEPTANCE_REVOKED',
    reasonCode: 'OFFICIAL_CONFLICT',
    decisionEvidenceHashes: [C],
  }), /conflicting.*completion/i);
});

test('ledger validation rejects reordered records, hash mutation and duplicate outcomes', () => {
  const current = descriptor();
  const pending = appendPendingEvidenceEpoch({ ledger: createEvidenceEpochLedger(), descriptor: current });
  const completed = completeEvidenceEpoch({ ledger: pending, descriptor: current, outcome: 'RETAINED' });

  const reordered = structuredClone(completed);
  reordered.records.reverse();
  assert.throws(() => validateEvidenceEpochLedger(reordered), /sequence|chain/i);

  const mutated = structuredClone(completed);
  mutated.records[0].recordSha256 = C;
  assert.throws(() => validateEvidenceEpochLedger(mutated), /record hash/i);

  const duplicate = structuredClone(completed);
  duplicate.records.push({ ...duplicate.records[1], sequence: 3, previousRecordSha256: duplicate.records[1].recordSha256 });
  assert.throws(() => validateEvidenceEpochLedger(duplicate), /duplicate.*outcome|record hash/i);
});

test('state rejects a stale current descriptor and omission of a later target epoch', () => {
  const first = descriptor();
  let ledger = appendPendingEvidenceEpoch({ ledger: createEvidenceEpochLedger(), descriptor: first });
  ledger = completeEvidenceEpoch({ ledger, descriptor: first, outcome: 'RETAINED' });
  const later = descriptor({ policyVersions: ['policy-3'] });
  ledger = appendPendingEvidenceEpoch({ ledger, descriptor: later });

  assert.throws(
    () => validateEvidenceEpochState({ ledger, descriptors: [first] }),
    /latest pending.*target-1/i,
  );
  assert.throws(
    () => validateEvidenceEpochState({ ledger, descriptors: [] }),
    /current descriptor missing.*target-1/i,
  );
  assert.equal(validateEvidenceEpochState({ ledger, descriptors: [later] }).descriptors[0], later);
});
