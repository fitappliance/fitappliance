import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = path.join(repoRoot, 'public', 'scripts', 'replacement-matcher.mjs');

async function loadModule() {
  return import(`${pathToFileURL(modulePath).href}?cacheBust=${Date.now()}`);
}

function reference(overrides = {}) {
  return {
    id: 'fa_ref_1234567890abcdef12345678',
    brand: 'Westinghouse',
    model: 'WTB4600WA',
    lifecycle: 'REGISTRY_ONLY',
    evidence: 'REGISTRY_CONSISTENT',
    action: 'CONFIRM_REQUIRED',
    registryMarket: 'INACTIVE_AU',
    dimensionsMm: { width: 699, height: 1725, depth: 723 },
    ...overrides,
  };
}

test('replacement reference data is fetched lazily by category and cached', async () => {
  const {
    clearReplacementReferenceCache,
    loadReplacementReference,
  } = await loadModule();
  clearReplacementReferenceCache();
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(url);
    return {
      ok: true,
      json: async () => ({ schemaVersion: 1, category: 'fridge', records: [reference()] }),
    };
  };
  assert.deepEqual(requests, []);
  const first = await loadReplacementReference('fridge', { fetchImpl });
  const second = await loadReplacementReference('fridge', { fetchImpl });
  assert.equal(first, second);
  assert.deepEqual(requests, ['/data/replacement-reference/fridges.json']);
  assert.equal(first.records.length, 1);
});

test('replacement reference loader rejects invalid action, evidence and dimension combinations', async () => {
  const {
    clearReplacementReferenceCache,
    loadReplacementReference,
  } = await loadModule();
  const invalidRecords = [
    reference({ action: 'TRUST_ME' }),
    reference({ action: 'AUTO_FILL', evidence: 'REGISTRY_CONSISTENT' }),
    reference({ action: 'AUTO_FILL', evidence: 'CATALOG_RECEIPT', dimensionsMm: undefined }),
    reference({ action: 'MEASURE_REQUIRED', evidence: 'IDENTITY_ONLY' }),
    reference({ action: 'QUARANTINED', evidence: 'INTERNAL_CONFLICT', dimensionsMm: undefined, retailers: [] }),
    reference({ aliases: [{ brand: 'Westinghouse' }] }),
  ];

  for (const invalidRecord of invalidRecords) {
    clearReplacementReferenceCache();
    await assert.rejects(
      loadReplacementReference('fridge', {
        fetchImpl: async () => ({
          ok: true,
          json: async () => ({ schemaVersion: 1, category: 'fridge', records: [invalidRecord] }),
        }),
      }),
      /invalid replacement reference record/i,
    );
  }
});

test('replacement lookup resolves exact brand and model or a unique exact model', async () => {
  const { resolveReplacementReference } = await loadModule();
  const records = [
    reference(),
    reference({ id: 'fa_ref_2234567890abcdef12345678', brand: 'LG', model: 'GB-450' }),
  ];
  assert.equal(resolveReplacementReference('Westinghouse WTB4600WA', records).record.id, records[0].id);
  assert.equal(resolveReplacementReference('WTB-4600-WA', records).record.id, records[0].id);
  assert.equal(resolveReplacementReference('gb450', records).record.id, records[1].id);
});

test('replacement lookup never auto-selects ambiguous or fuzzy model candidates', async () => {
  const { resolveReplacementReference } = await loadModule();
  const records = [
    reference({ brand: 'Brand A', model: 'ABC-100' }),
    reference({ id: 'fa_ref_2234567890abcdef12345678', brand: 'Brand B', model: 'ABC100' }),
    reference({ id: 'fa_ref_3234567890abcdef12345678', brand: 'Brand C', model: 'ABC-100-X' }),
  ];
  const ambiguous = resolveReplacementReference('ABC100', records);
  assert.equal(ambiguous.status, 'AMBIGUOUS');
  assert.equal(ambiguous.candidates.length, 2);
  assert.equal('record' in ambiguous, false);

  const fuzzy = resolveReplacementReference('ABC', records);
  assert.equal(fuzzy.status, 'SUGGESTIONS');
  assert.equal(fuzzy.candidates.length, 3);
  assert.equal('record' in fuzzy, false);
});

test('replacement lookup accepts an exact public identity alias without suffix sharing', async () => {
  const { resolveReplacementReference } = await loadModule();
  const row = reference({
    aliases: [{ brand: 'Westinghouse Appliances', model: 'WTB 4600 WA' }],
  });
  assert.equal(resolveReplacementReference('Westinghouse Appliances WTB 4600 WA', [row]).record.id, row.id);
  assert.equal(resolveReplacementReference('WTB4600', [row]).status, 'SUGGESTIONS');
});

test('replacement dimensions pass through unchanged and obey evidence action', async () => {
  const { buildReplacementDimensionState } = await loadModule();
  const confirm = buildReplacementDimensionState(reference());
  assert.deepEqual(confirm.dimensions, { w: 699, h: 1725, d: 723 });
  assert.deepEqual(confirm.productDimensions, { w: 699, h: 1725, d: 723 });
  assert.equal(confirm.requiresConfirmation, true);
  assert.equal(confirm.canUseDimensions, true);
  assert.doesNotMatch(confirm.note, /clearance|cavity/i);

  const automatic = buildReplacementDimensionState(reference({ action: 'AUTO_FILL', evidence: 'CATALOG_RECEIPT' }));
  assert.equal(automatic.requiresConfirmation, false);
  assert.equal(automatic.canUseDimensions, true);

  const modelReceipt = buildReplacementDimensionState(reference({ action: 'AUTO_FILL', evidence: 'MODEL_RECEIPT' }));
  assert.equal(modelReceipt.requiresConfirmation, false);
  assert.equal(modelReceipt.canUseDimensions, true);

  for (const [action, evidence] of [
    ['MEASURE_REQUIRED', 'IDENTITY_ONLY'],
    ['QUARANTINED', 'INTERNAL_CONFLICT'],
  ]) {
    const state = buildReplacementDimensionState(reference({
      action,
      evidence,
      dimensionsMm: undefined,
    }));
    assert.equal(state.canUseDimensions, false);
    assert.deepEqual(state.dimensions, { w: null, h: null, d: null });
    assert.match(state.note, /measure/i);
  }
});

test('replacement suggestion labels are deterministic and bounded', async () => {
  const { getReplacementReferenceSuggestions } = await loadModule();
  const records = Array.from({ length: 20 }, (_, index) => reference({
    id: `fa_ref_${String(index).padStart(24, '0')}`,
    brand: index % 2 === 0 ? 'Westinghouse' : 'Other',
    model: `WTB-${4600 + index}`,
  }));
  const suggestions = getReplacementReferenceSuggestions('West WTB46', records, { limit: 5 });
  assert.equal(suggestions.length, 5);
  assert.ok(suggestions.every((row) => row.label.startsWith('Westinghouse WTB-46')));
});
