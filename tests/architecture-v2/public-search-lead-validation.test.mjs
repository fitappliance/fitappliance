import test from 'node:test';
import assert from 'node:assert/strict';

import { createPublicSearchLead } from '../../src/domain/public-search-lead.mjs';
import { validatePublicSearchLeads } from '../../scripts/architecture-v2/validate-public-search-leads.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

function lead({ brand, model, category = 'fridge', url, rank = 1 }) {
  return createPublicSearchLead({
    target: {
      targetId: `target-${brand}-${model}`, referenceId: `ref-${model}`, category,
      brand, exactModel: model, lifecycleState: 'CURRENT_RETAIL',
      activeReleaseId: 'retail_lifecycle_release_6c42c754aeb1ff49097b32b4',
      activeReleaseSha256: A,
    },
    query: { queryId: `query-${brand}-${model}`, querySha256: B },
    result: { rank, title: `${brand} ${model}`, url, snippet: 'search lead only' },
    capture: {
      objectSha256: A,
      objectPath: `evidence/discovery/sha256/aa/aa/${A}.json`,
      byteSize: 100,
    },
  });
}

test('separate validation promotes only exact-model official Australian candidate input', () => {
  const official = lead({
    brand: 'Samsung', model: 'SRF5300SD',
    url: 'https://www.samsung.com/au/refrigerators/SRF5300SD',
  });
  const result = validatePublicSearchLeads({ leads: [official] });

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].authorityMode, 'official');
  assert.equal(result.candidates[0].publicSearchLeadBinding.leadId, official.leadId);
  assert.equal(result.outcomes[0].status, 'VALIDATED_OFFICIAL_CANDIDATE_INPUT');
  assert.equal('claims' in result.candidates[0], false);
  assert.equal('receipt' in result.candidates[0], false);
});

test('validation rejects sibling, regional suffix, mirror, credentials and private-feed fixtures', () => {
  const fixtures = [
    lead({ brand: 'CHiQ', model: 'CCP205B', url: 'https://chiq.com.au/products/CCP206B' }),
    lead({ brand: 'Mitsubishi Electric', model: 'MR-CX370EJ-A', url: 'https://www.mitsubishi-electric.co.nz/MR-CX370EJ-P' }),
    lead({ brand: 'Samsung', model: 'SRF5300SD', url: 'https://manuals.example/SRF5300SD.pdf' }),
    lead({ brand: 'Samsung', model: 'SRF5300SD', url: 'https://user:secret@www.samsung.com/au/SRF5300SD' }),
    lead({ brand: 'Samsung', model: 'SRF5300SD', url: 'https://prf.hn/click/SRF5300SD' }),
  ];
  const result = validatePublicSearchLeads({ leads: fixtures });

  assert.equal(result.candidates.length, 0);
  assert.equal(result.outcomes.length, fixtures.length);
  assert.ok(result.outcomes.every((outcome) => outcome.status === 'REJECTED'));
  assert.ok(result.outcomes.every((outcome) => outcome.reasonCode));
});

test('exact model signal must occur in URL path or query rather than only the official hostname', () => {
  const hostnameOnly = lead({
    brand: 'Samsung', model: 'SAMSUNG',
    url: 'https://www.samsung.com/au/refrigerators/no-model-signal',
  });
  const result = validatePublicSearchLeads({ leads: [hostnameOnly] });
  assert.equal(result.candidates.length, 0);
  assert.equal(result.outcomes[0].reasonCode, 'EXACT_MODEL_URL_SIGNAL_MISSING');
});

test('exact model matching uses complete URL token sequences across delimiters', () => {
  const exact = [
    lead({
      brand: 'Samsung', model: 'MR-CX370EJ-A',
      url: 'https://www.samsung.com/au/refrigerators/mr-cx370ej-a',
    }),
    lead({
      brand: 'Samsung', model: 'RF44A5202SL/SA',
      url: 'https://www.samsung.com/au/refrigerators/rf44a5202sl-sa',
      rank: 2,
    }),
  ];
  const siblings = [
    lead({ brand: 'Samsung', model: 'ABC123', url: 'https://www.samsung.com/au/refrigerators/ABC1234', rank: 3 }),
    lead({ brand: 'Samsung', model: 'ABC123', url: 'https://www.samsung.com/au/refrigerators/XABC123', rank: 4 }),
    lead({ brand: 'Samsung', model: 'MR-CX370EJ-A', url: 'https://www.samsung.com/au/refrigerators/MR-CX370EJ-P', rank: 5 }),
    lead({ brand: 'Samsung', model: 'RF44A5202SL/SA', url: 'https://www.samsung.com/au/refrigerators/RF44A5202SL-SB', rank: 6 }),
  ];
  const result = validatePublicSearchLeads({ leads: [...exact, ...siblings] });

  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.candidates.map((candidate) => candidate.exactModel).sort(), [
    'MR-CX370EJ-A', 'RF44A5202SL/SA',
  ]);
  assert.equal(result.outcomes.filter((outcome) => outcome.reasonCode === 'EXACT_MODEL_URL_SIGNAL_MISSING').length, 4);
});
