import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPublicSearchResearchPacket,
} from '../../scripts/architecture-v2/build-public-search-research-packet.mjs';

const RELEASE_ID = 'retail_lifecycle_release_6c42c754aeb1ff49097b32b4';
const RELEASE_SHA = 'a'.repeat(64);

function target(model = 'SRF5300SD', overrides = {}) {
  return {
    targetId: `target-${model}`,
    referenceId: `reference-${model}`,
    category: 'fridge',
    brand: 'Samsung',
    exactModel: model,
    lifecycleState: 'CURRENT_RETAIL',
    activeReleaseId: RELEASE_ID,
    activeReleaseSha256: RELEASE_SHA,
    approvedOfficialHostSuffixes: ['samsung.com'],
    ...overrides,
  };
}

test('packet replay is byte-equivalent for reordered lifecycle-bound targets', () => {
  const targets = [target('SRF5300SD'), target('SRF7100B')];
  const first = buildPublicSearchResearchPacket({ targets });
  const second = buildPublicSearchResearchPacket({ targets: [...targets].reverse() });

  assert.deepEqual(first, second);
  assert.equal(first.targets.length, 2);
  assert.equal(first.queries.length, 4);
  assert.ok(first.queries.every((query) => query.resultLimit === 5));
  assert.ok(first.queries.every((query) => query.queryText.includes('Australia')));
  assert.ok(first.queries.filter((query) => query.templateId === 'OFFICIAL_DOMAIN').every(
    (query) => query.queryText.includes('site:samsung.com'),
  ));
});

test('packet rejects unbounded, non-current and free-form target input', () => {
  assert.throws(
    () => buildPublicSearchResearchPacket({ targets: Array.from({ length: 26 }, (_, index) => target(`M${index}`)) }),
    /25 targets/i,
  );
  assert.throws(
    () => buildPublicSearchResearchPacket({ targets: [target('OLD', { lifecycleState: 'CATALOG_ARCHIVED' })] }),
    /CURRENT_RETAIL/i,
  );
  assert.throws(
    () => buildPublicSearchResearchPacket({ targets: [{ ...target(), query: 'find anything' }] }),
    /unknown.*query/i,
  );
  assert.throws(
    () => buildPublicSearchResearchPacket({ targets: [target()], freeFormQuery: 'find anything' }),
    /unknown.*freeFormQuery/i,
  );
});

test('packet rejects unsafe identity values and non-policy official domains', () => {
  const cases = [
    target('*'),
    target('/tmp/model'),
    target('test@example.com'),
    target('SRF5300SD', { approvedOfficialHostSuffixes: ['user:pass@samsung.com'] }),
    target('SRF5300SD', { approvedOfficialHostSuffixes: ['prf.hn'] }),
    target('SRF5300SD', { approvedOfficialHostSuffixes: ['retailer.example'] }),
  ];
  for (const unsafe of cases) {
    assert.throws(() => buildPublicSearchResearchPacket({ targets: [unsafe] }));
  }
});
