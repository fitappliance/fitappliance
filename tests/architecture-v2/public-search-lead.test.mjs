import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPublicSearchLead,
  validatePublicSearchLead,
} from '../../src/domain/public-search-lead.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

function input(overrides = {}) {
  return {
    target: {
      targetId: 'target-samsung', referenceId: 'ref-samsung', category: 'fridge',
      brand: 'Samsung', exactModel: 'SRF5300SD', lifecycleState: 'CURRENT_RETAIL',
      activeReleaseId: 'retail_lifecycle_release_6c42c754aeb1ff49097b32b4',
      activeReleaseSha256: A,
    },
    query: { queryId: 'public_search_query_123', querySha256: B },
    result: {
      rank: 1,
      title: '  Samsung   SRF5300SD  ',
      url: 'HTTPS://WWW.SAMSUNG.COM/au/refrigerators/SRF5300SD',
      snippet: ' Official   product page ',
    },
    capture: {
      objectSha256: A,
      objectPath: `evidence/discovery/sha256/aa/aa/${A}.json`,
      byteSize: 123,
    },
    ...overrides,
  };
}

test('public search lead is deterministic, normalized and has no authority field', () => {
  const first = createPublicSearchLead(input());
  const second = createPublicSearchLead(input());

  assert.deepEqual(first, second);
  assert.equal(first.result.title, 'Samsung SRF5300SD');
  assert.equal(first.result.snippet, 'Official product page');
  assert.equal(first.result.url, 'https://www.samsung.com/au/refrigerators/SRF5300SD');
  assert.equal(first.state.status, 'UNVALIDATED');
  assert.equal('authority' in first, false);
  assert.equal('authorityMode' in first, false);
  assert.equal(validatePublicSearchLead(first), first);
});

test('malformed discovery rows remain auditable as typed rejected leads', () => {
  const lead = createPublicSearchLead(input({
    result: {
      rank: 1,
      title: 'mail results to test@example.com',
      url: 'file:///tmp/result.json',
      snippet: 'local fixture',
    },
  }));

  assert.equal(lead.state.status, 'REJECTED');
  assert.equal(lead.state.reasonCode, 'EMAIL_BEARING_VALUE');
  assert.equal(lead.result.url, 'file:///tmp/result.json');
});

test('lead validation rejects authority injection and unknown fields', () => {
  const lead = createPublicSearchLead(input());
  assert.throws(
    () => createPublicSearchLead({ ...input(), authority: 'official' }),
    /unknown.*authority|authority.*not allowed/i,
  );
  assert.throws(
    () => validatePublicSearchLead({ ...lead, authority: 'official' }),
    /unknown.*authority|authority.*not allowed/i,
  );
  assert.throws(() => createPublicSearchLead(input({
    target: { ...input().target, activeReleaseId: 'retail_lifecycle_release_stale' },
  })), /active release ID/i);
});

test('local, private-address and configured feed hosts are rejected before validation', () => {
  const privateHosts = [
    'localhost', 'api.localhost', 'printer.local',
    '0.0.0.0', '127.255.1.1', '10.1.2.3', '172.16.0.1', '172.31.255.255',
    '192.168.4.5', '169.254.10.20',
    '[::1]', '[fe80::1]', '[febf::1]', '[fc00::1]', '[fdff::1]',
    'prf.hn', 'feeds.partnerize.com',
  ];
  for (const host of privateHosts) {
    const lead = createPublicSearchLead(input({
      result: {
        rank: 1, title: 'Private result', url: `https://${host}/SRF5300SD`, snippet: 'Untrusted',
      },
    }));
    assert.equal(lead.state.reasonCode, 'PRIVATE_FEED_HOST', host);
  }

  for (const host of ['172.32.0.1', '192.0.2.1', '[fec0::1]']) {
    const lead = createPublicSearchLead(input({
      result: {
        rank: 1, title: 'Public result', url: `https://${host}/SRF5300SD`, snippet: 'Untrusted',
      },
    }));
    assert.equal(lead.state.status, 'UNVALIDATED', host);
  }
});
