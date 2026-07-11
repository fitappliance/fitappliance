import test from 'node:test';
import assert from 'node:assert/strict';

import { auditAliasRegistry } from '../../scripts/architecture-v2/audit-model-aliases.mjs';

const registry = {
  schema_version: 1,
  last_updated: '2026-07-11',
  aliases: [{
    id: 'alias_pending_v1', brand: 'Kelvinator', target_model: 'KTB2502AB', source_model: 'KTB2502WB',
    status: 'pending', identity_scope: 'manufacturer_model',
    candidate_fields: ['closedEnvelope.widthMm'], approved_fields: [], evidence: [],
    decision: { reviewer: null, reviewed_at: null, rationale: 'Awaiting proof.' }, supersedes: null,
  }],
};

test('alias audit reports deterministic status and disposition counts', () => {
  const disposition = {
    products: [
      { legacyId: 'fridge-one', disposition: 'pending_more_evidence', aliasId: 'alias_pending_v1' },
      { legacyId: 'fridge-two', disposition: 'quarantined_no_manufacturer_evidence', aliasId: null },
    ],
  };
  const first = auditAliasRegistry(registry, disposition);
  const second = auditAliasRegistry(structuredClone(registry), structuredClone(disposition));

  assert.deepEqual(first, second);
  assert.deepEqual(first.statusCounts, { approved: 0, pending: 1, rejected: 0, superseded: 0 });
  assert.deepEqual(first.dispositionCounts, {
    pending_more_evidence: 1,
    quarantined_no_manufacturer_evidence: 1,
  });
  assert.deepEqual(first.missingAliasReferences, []);
  assert.deepEqual(first.inconsistentAliasDispositions, []);
  assert.equal(Object.isFrozen(first), true);
});

test('alias audit reports disposition references absent from the registry', () => {
  const result = auditAliasRegistry(registry, {
    products: [{ legacyId: 'fridge-one', disposition: 'pending_more_evidence', aliasId: 'alias_missing' }],
  });
  assert.deepEqual(result.missingAliasReferences, [{ legacyId: 'fridge-one', aliasId: 'alias_missing' }]);
});

test('alias audit reports disposition values that disagree with registry status', () => {
  const result = auditAliasRegistry(registry, {
    products: [{ legacyId: 'fridge-one', disposition: 'approved_dimensions_alias', aliasId: 'alias_pending_v1' }],
  });
  assert.deepEqual(result.inconsistentAliasDispositions, [{
    aliasId: 'alias_pending_v1',
    actual: 'approved_dimensions_alias',
    expected: 'pending_more_evidence',
    legacyId: 'fridge-one',
  }]);
});

test('alias audit rejects malformed disposition documents', () => {
  for (const disposition of [null, {}, { products: {} }]) {
    assert.throws(() => auditAliasRegistry(registry, disposition), /disposition.*products/i);
  }
});
