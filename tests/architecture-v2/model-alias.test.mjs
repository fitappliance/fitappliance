import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  createAliasRegistry,
  evaluateAliasCandidate,
  findApprovedAlias,
} from '../../src/domain/model-alias.mjs';

const DIMENSION_FIELDS = [
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
];

function pendingAlias(overrides = {}) {
  return {
    id: 'alias_kelvinator_ktb2502ab_to_ktb2502wb_v1',
    brand: 'Kelvinator',
    target_model: 'KTB2502AB',
    source_model: 'KTB2502WB',
    status: 'pending',
    identity_scope: 'manufacturer_model',
    candidate_fields: DIMENSION_FIELDS,
    approved_fields: [],
    evidence: [],
    decision: {
      reviewer: null,
      reviewed_at: null,
      rationale: 'Awaiting an explicit manufacturer variant table.',
    },
    supersedes: null,
    ...overrides,
  };
}

function approvedAlias(overrides = {}) {
  return pendingAlias({
    status: 'approved',
    candidate_fields: DIMENSION_FIELDS,
    approved_fields: DIMENSION_FIELDS,
    evidence: [{
      source_url: 'https://www.kelvinator.com.au/support/variant-guide.pdf',
      document_sha256: 'a'.repeat(64),
      page: 2,
      quote: 'KTB2502AB and KTB2502WB share product dimensions.',
      document_author_type: 'manufacturer',
      transport_host_type: 'manufacturer',
    }],
    decision: {
      approval_tier: 'tier_a',
      reviewer: 'Jagger Zhang',
      reviewed_at: '2026-07-11',
      rationale: 'Manufacturer variant table explicitly lists both models.',
    },
    ...overrides,
  });
}

function tierBApprovedAlias(overrides = {}) {
  const evidence = [
    {
      role: 'regulatory_family',
      source_url: 'https://data.gov.au/example.csv',
      document_sha256: 'b'.repeat(64),
      page: 1,
      quote: 'KTB2502AB and KTB2502WB share registration ARF3963 and family KTB2502**.',
      document_author_type: 'regulator',
      transport_host_type: 'regulator',
    },
    {
      role: 'source_dimensions',
      source_url: 'https://www.kelvinator.com.au/support/ktb2502wb.pdf',
      document_sha256: 'c'.repeat(64),
      page: 2,
      quote: 'KTB2502WB: height 1470 mm, width 540 mm, depth 615 mm.',
      document_author_type: 'manufacturer',
      transport_host_type: 'manufacturer',
      ordered_dimensions_mm: { width: 540, height: 1470, depth: 615 },
    },
    ...['retailer-one.example', 'retailer-two.example'].map((host, index) => ({
      role: 'target_market_dimensions',
      source_url: `https://${host}/ktb2502ab`,
      document_sha256: String(index + 1).repeat(64),
      page: 1,
      quote: 'KTB2502AB: height 1470 mm, width 540 mm, depth 615 mm.',
      document_author_type: 'retailer',
      transport_host_type: 'retailer',
      ordered_dimensions_mm: { width: 540, height: 1470, depth: 615 },
    })),
  ];
  return approvedAlias({
    evidence,
    decision: {
      approval_tier: 'tier_b',
      reviewer: 'Jagger Zhang',
      reviewed_at: '2026-07-11',
      rationale: 'Regulator family plus matching manufacturer and independent market dimensions.',
    },
    ...overrides,
  });
}

test('phase one fixture freezes exactly nine unique quarantine products', () => {
  const fixture = JSON.parse(readFileSync(
    new URL('../fixtures/architecture-v2/model-aliases.json', import.meta.url),
    'utf8',
  ));
  assert.equal(fixture.products.length, 9);
  assert.equal(new Set(fixture.products.map((row) => row.legacyId)).size, 9);
  assert.equal(new Set(fixture.products.map((row) => `${row.brand}:${row.model}`)).size, 9);
});

test('repository pending registry and disposition cover the frozen baseline without approvals', () => {
  const fixture = JSON.parse(readFileSync(new URL('../fixtures/architecture-v2/model-aliases.json', import.meta.url), 'utf8'));
  const registryDocument = JSON.parse(readFileSync(new URL('../../data/model-aliases.json', import.meta.url), 'utf8'));
  const disposition = JSON.parse(readFileSync(new URL('../../data/architecture-v2/decisions/phase1-quarantine-disposition.json', import.meta.url), 'utf8'));
  const registry = createAliasRegistry(registryDocument);

  assert.equal(registry.aliases.length, 9);
  assert.ok(registry.aliases.every((alias) => alias.status === 'pending'));
  assert.equal(disposition.products.length, 9);
  assert.deepEqual(
    new Set(disposition.products.map((row) => row.legacyId)),
    new Set(fixture.products.map((row) => row.legacyId)),
  );
  assert.ok(disposition.products.filter((row) => row.aliasId).every((row) => (
    registry.aliases.some((alias) => alias.id === row.aliasId)
  )));
});

test('creates an immutable registry with pending and fully evidenced approved aliases', () => {
  const input = {
    schema_version: 1,
    last_updated: '2026-07-11',
    aliases: [pendingAlias(), approvedAlias({
      id: 'alias_westinghouse_wtb2500ah_to_wtb2500wh_v1',
      brand: 'Westinghouse',
      target_model: 'WTB2500AH',
      source_model: 'WTB2500WH',
    })],
  };
  const snapshot = structuredClone(input);
  const registry = createAliasRegistry(input);

  assert.deepEqual(input, snapshot);
  assert.equal(Object.isFrozen(registry), true);
  assert.equal(Object.isFrozen(registry.aliases[0]), true);
  assert.equal(registry.aliases.length, 2);
});

test('finds only approved aliases for the requested field', () => {
  const approved = approvedAlias();
  const registry = createAliasRegistry({ schema_version: 1, last_updated: '2026-07-11', aliases: [approved] });

  assert.equal(findApprovedAlias(registry, {
    brand: ' kelvinator ',
    targetModel: 'ktb-2502-ab',
    field: 'closedEnvelope.widthMm',
  }).id, approved.id);
  assert.equal(findApprovedAlias(registry, {
    brand: 'Kelvinator',
    targetModel: 'KTB2502AB',
    field: 'installation.rearMm',
  }), null);
});

test('rejects self aliases, unsupported fields, and runtime fields on pending records', () => {
  for (const alias of [
    pendingAlias({ source_model: 'KTB-2502-AB' }),
    pendingAlias({ candidate_fields: ['installation.rearMm'] }),
    pendingAlias({ approved_fields: ['closedEnvelope.widthMm'] }),
  ]) {
    assert.throws(
      () => createAliasRegistry({ schema_version: 1, last_updated: '2026-07-11', aliases: [alias] }),
      /alias|field|pending/i,
    );
  }
});

test('approved aliases require complete manufacturer provenance and review', () => {
  const invalid = [
    approvedAlias({ decision: { reviewer: null, reviewed_at: '2026-07-11', rationale: 'Missing reviewer.' } }),
    approvedAlias({ evidence: [{ ...approvedAlias().evidence[0], document_sha256: '' }] }),
    approvedAlias({ evidence: [{ ...approvedAlias().evidence[0], page: 0 }] }),
    approvedAlias({ evidence: [{ ...approvedAlias().evidence[0], quote: '' }] }),
    approvedAlias({ evidence: [{ ...approvedAlias().evidence[0], document_author_type: 'retailer' }] }),
    approvedAlias({ evidence: [{ ...approvedAlias().evidence[0], transport_host_type: 'retailer' }] }),
  ];
  for (const alias of invalid) {
    assert.throws(
      () => createAliasRegistry({ schema_version: 1, last_updated: '2026-07-11', aliases: [alias] }),
      /approved|evidence|review|manufacturer|hash|page|quote/i,
    );
  }
});

test('tier B permits dimensions-only approval with regulator family and two independent market sources', () => {
  const alias = tierBApprovedAlias();
  const registry = createAliasRegistry({ schema_version: 1, last_updated: '2026-07-11', aliases: [alias] });
  assert.equal(registry.aliases[0].decision.approval_tier, 'tier_b');
  assert.deepEqual(registry.aliases[0].approved_fields, DIMENSION_FIELDS);
});

test('tier B rejects missing roles, duplicate market hosts, inconsistent target dimensions, and broader fields', () => {
  const base = tierBApprovedAlias();
  const invalid = [
    tierBApprovedAlias({ evidence: base.evidence.filter((item) => item.role !== 'regulatory_family') }),
    tierBApprovedAlias({ evidence: base.evidence.map((item) => item.role === 'target_market_dimensions'
      ? { ...item, source_url: 'https://same-retailer.example/product' }
      : item) }),
    tierBApprovedAlias({ evidence: base.evidence.map((item, index) => index === 3
      ? { ...item, ordered_dimensions_mm: { width: 541, height: 1470, depth: 615 } }
      : item) }),
  ];
  for (const alias of invalid) {
    assert.throws(
      () => createAliasRegistry({ schema_version: 1, last_updated: '2026-07-11', aliases: [alias] }),
      /tier|evidence|market|dimension|regulator/i,
    );
  }
});

test('rejects duplicate active pairs and contradictory approved fields', () => {
  const first = approvedAlias();
  const duplicate = approvedAlias({ id: 'alias_duplicate_v2' });
  assert.throws(
    () => createAliasRegistry({ schema_version: 1, last_updated: '2026-07-11', aliases: [first, duplicate] }),
    /duplicate|contradict/i,
  );
});

test('requires superseded decisions to reference an existing replacement', () => {
  const superseded = pendingAlias({ status: 'superseded', supersedes: 'alias_missing_v2' });
  assert.throws(
    () => createAliasRegistry({ schema_version: 1, last_updated: '2026-07-11', aliases: [superseded] }),
    /supersed/i,
  );
});

test('evaluates candidates without approving pending or retailer-only evidence', () => {
  assert.deepEqual(evaluateAliasCandidate(pendingAlias()), {
    approvable: false,
    reasons: ['status_not_approved'],
  });
  const retailer = approvedAlias({
    evidence: [{
      ...approvedAlias().evidence[0],
      document_author_type: 'retailer',
      transport_host_type: 'retailer',
    }],
  });
  const evaluation = evaluateAliasCandidate(retailer);
  assert.equal(evaluation.approvable, false);
  assert.ok(evaluation.reasons.includes('manufacturer_authorship_required'));
  assert.ok(evaluation.reasons.includes('manufacturer_transport_required'));
});
