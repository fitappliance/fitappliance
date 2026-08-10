import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  RightsContractError,
  PRODUCTION_STATIC_RIGHTS_DEPENDENCIES,
  buildAttributionRouteReceipt,
  buildDependencyScopeHash,
  buildGeneratedProvenanceReceipt,
  buildRightsReview,
  buildStaticPublicationAuthorization,
  buildStaticSourceInventory,
  canonicalJson,
  classifyStaticSources,
  semanticId,
  validateAuthoritySet,
  validateDecisionRegistry,
  validateGeneratedProvenanceRepositoryBindings,
  validateSchema2Manifest,
  validateStaticSourceInventory,
  validateWithdrawalLog,
  verifyStaticPublicationGate,
} from '../src/domain/static-publication-rights.mjs';

const ACTION = 'PUBLIC_STATIC_DISTRIBUTION';
const HASH = 'a'.repeat(64);

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function initRepo(files = { 'index.html': 'home\n', 'public/app.js': 'app\n' }) {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'fit-rights-'));
  git(repoRoot, ['init', '-q']);
  git(repoRoot, ['config', 'user.email', 'fixture@example.invalid']);
  git(repoRoot, ['config', 'user.name', 'Fixture']);
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(repoRoot, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents);
  }
  git(repoRoot, ['add', '.']);
  git(repoRoot, ['commit', '-qm', 'fixture']);
  return repoRoot;
}

function assertCode(code) {
  return (error) => {
    assert.equal(error instanceof RightsContractError, true);
    assert.equal(error.code, code);
    return true;
  };
}

function fixtureAuthority() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKey,
    authoritySet: {
      schemaVersion: 1,
      environment: 'TEST',
      trustRootEnrollment: null,
      authorities: [{
        issuerId: 'TEST_RIGHTS_REVIEWER',
        keyId: 'TEST_KEY_1',
        publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
        roles: ['RIGHTS_REVIEWER'],
        actions: [ACTION],
      }],
    },
  };
}

function signedDecision({ privateKey, inventoryId, dependencyId = 'FIRST_PARTY', overrides = {} }) {
  const payload = {
    schemaVersion: 1,
    issuerId: 'TEST_RIGHTS_REVIEWER',
    keyId: 'TEST_KEY_1',
    role: 'RIGHTS_REVIEWER',
    action: ACTION,
    disposition: 'ALLOWED',
    dependencyId,
    inventoryId,
    sourceObjectHash: HASH,
    scopeHash: 'b'.repeat(64),
    evidenceHashes: ['c'.repeat(64)],
    attributionObligationIds: [],
    decisionAsOf: '2026-08-10T00:00:00.000Z',
    decisionSetId: 'e'.repeat(64),
    validFrom: '2026-08-09T00:00:00.000Z',
    validThrough: '2026-08-20T00:00:00.000Z',
    reviewBy: '2026-08-15T00:00:00.000Z',
    withdrawalHeadHash: 'd'.repeat(64),
    predecessorDecisionId: null,
    supersedesDecisionId: null,
    ...overrides,
  };
  const decisionId = semanticId('fitappliance.static-rights-decision', 1, payload);
  const signature = sign(null, Buffer.from(canonicalJson(payload)), privateKey).toString('base64');
  return { decisionId, payload, signature };
}

function signedWithdrawalLog({ privateKey, authoritySet, appendEvent = false }) {
  const authority = authoritySet.authorities[0];
  const common = {
    schemaVersion: 1,
    environment: authoritySet.environment,
    issuerId: authority.issuerId,
    keyId: authority.keyId,
    role: 'RIGHTS_REVIEWER',
    action: ACTION,
  };
  const genesisPayload = {
    ...common,
    sequence: 0,
    previousHeadHash: null,
    eventIds: [],
    issuedAt: '2026-08-10T00:00:00.000Z',
  };
  const genesisHash = semanticId('fitappliance.static-rights-withdrawal-head', 1, genesisPayload);
  const heads = [{
    withdrawalHeadHash: genesisHash,
    payload: genesisPayload,
    signature: sign(null, Buffer.from(canonicalJson(genesisPayload)), privateKey).toString('base64'),
  }];
  const events = [];
  if (appendEvent) {
    const eventPayload = {
      ...common,
      previousHeadHash: genesisHash,
      withdrawnDecisionId: 'f'.repeat(64),
      dependencyId: 'RETAILER_FEED',
      effectiveAt: '2026-08-10T01:00:00.000Z',
      reasonCode: 'PERMISSION_WITHDRAWN',
      evidenceHashes: ['e'.repeat(64)],
    };
    const eventId = semanticId('fitappliance.static-rights-withdrawal-event', 1, eventPayload);
    events.push({
      eventId,
      payload: eventPayload,
      signature: sign(null, Buffer.from(canonicalJson(eventPayload)), privateKey).toString('base64'),
    });
    const nextPayload = {
      ...common,
      sequence: 1,
      previousHeadHash: genesisHash,
      eventIds: [eventId],
      issuedAt: '2026-08-10T01:00:00.000Z',
    };
    heads.push({
      withdrawalHeadHash: semanticId('fitappliance.static-rights-withdrawal-head', 1, nextPayload),
      payload: nextPayload,
      signature: sign(null, Buffer.from(canonicalJson(nextPayload)), privateKey).toString('base64'),
    });
  }
  return { schemaVersion: 1, environment: authoritySet.environment, events, heads };
}

function scopeHashFor({ inventory, classifiedRows, dependencyId }) {
  return buildDependencyScopeHash({
    action: ACTION,
    dependencyId,
    inventoryId: inventory.staticSourceInventoryId,
    paths: classifiedRows
      .filter((row) => row.dependencyIds.includes(dependencyId))
      .map((row) => row.path),
  });
}

function fixtureReviewInput({ dependencies = ['FIRST_PARTY'], decisionOverrides = {} } = {}) {
  const repoRoot = initRepo({ 'index.html': 'home\n' });
  const inventory = buildStaticSourceInventory({ repoRoot });
  const classifiedRows = inventory.rows.map((row) => ({
    path: row.path,
    sourceClass: 'FIRST_PARTY',
    dependencyIds: dependencies,
    provenanceIds: [],
    blockers: [],
  }));
  const { privateKey, authoritySet } = fixtureAuthority();
  const decisions = dependencies.map((dependencyId) => signedDecision({
    privateKey,
    inventoryId: inventory.staticSourceInventoryId,
    dependencyId,
    overrides: {
      scopeHash: scopeHashFor({ inventory, classifiedRows, dependencyId }),
      ...decisionOverrides,
    },
  }));
  return { repoRoot, inventory, classifiedRows, authoritySet, decisions };
}

test('canonical JSON normalizes order but rejects non-NFC strings, floats, and unknown keys', () => {
  const left = { schemaVersion: 1, paths: ['public/z', 'index.html'], label: 'caf\u00e9' };
  const right = { label: 'caf\u00e9', paths: ['index.html', 'public/z'], schemaVersion: 1 };
  assert.equal(semanticId('fixture.domain', 1, left, { sortedArrays: ['paths'] }), semanticId('fixture.domain', 1, right, { sortedArrays: ['paths'] }));
  assert.throws(() => canonicalJson({ label: 'cafe\u0301' }), assertCode('CANONICAL_JSON_INVALID'));
  assert.throws(() => canonicalJson({ value: 1.5 }), assertCode('CANONICAL_JSON_INVALID'));
  assert.throws(
    () => validateAuthoritySet({ authoritySet: { schemaVersion: 1, environment: 'PRODUCTION', trustRootEnrollment: null, authorities: [], extra: true } }),
    assertCode('SCHEMA_UNKNOWN_KEY')
  );
});

test('inventory freezes exact tracked bytes and rejects changed, new tracked, and untracked eligible paths', () => {
  const repoRoot = initRepo();
  const inventory = buildStaticSourceInventory({ repoRoot });
  assert.equal(inventory.rows.length, 2);
  assert.deepEqual(Object.keys(inventory.rows[0]), ['blobOid', 'mode', 'path', 'sha256', 'size']);
  assert.equal(validateStaticSourceInventory({ repoRoot, inventory }), true);

  writeFileSync(path.join(repoRoot, 'public/app.js'), 'changed\n');
  assert.throws(() => validateStaticSourceInventory({ repoRoot, inventory }), assertCode('STATIC_SOURCE_INVENTORY_DRIFT'));
  writeFileSync(path.join(repoRoot, 'public/app.js'), 'app\n');
  writeFileSync(path.join(repoRoot, 'public/untracked.js'), 'new\n');
  assert.throws(() => validateStaticSourceInventory({ repoRoot, inventory }), assertCode('STATIC_SOURCE_SET_DRIFT'));
  git(repoRoot, ['add', 'public/untracked.js']);
  assert.throws(() => validateStaticSourceInventory({ repoRoot, inventory }), assertCode('STATIC_SOURCE_SET_DRIFT'));
});

test('B1 inventory excludes the exact tracked legacy service worker witness', () => {
  const repoRoot = initRepo({
    'index.html': 'home\n',
    'public/app.js': 'app\n',
    'public/service-worker.js': 'legacy worker\n',
  });
  const inventory = buildStaticSourceInventory({ repoRoot });

  assert.deepEqual(inventory.rows.map((row) => row.path), ['index.html', 'public/app.js']);
  assert.equal(validateStaticSourceInventory({ repoRoot, inventory }), true);

  writeFileSync(path.join(repoRoot, 'public/service-worker.js'), 'changed legacy worker\n');
  assert.deepEqual(
    buildStaticSourceInventory({ repoRoot }).rows.map((row) => row.path),
    ['index.html', 'public/app.js']
  );
  assert.equal(validateStaticSourceInventory({ repoRoot, inventory }), true);

  writeFileSync(path.join(repoRoot, 'public/service-worker.js.map'), '{}\n');
  assert.throws(() => validateStaticSourceInventory({ repoRoot, inventory }), assertCode('STATIC_SOURCE_SET_DRIFT'));
});

test('inventory construction rejects tracked working-tree or index drift', () => {
  const repoRoot = initRepo();
  writeFileSync(path.join(repoRoot, 'public/app.js'), 'dirty\n');
  assert.throws(() => buildStaticSourceInventory({ repoRoot }), assertCode('GIT_PROVENANCE_DRIFT'));
});

test('inventory ID is stable under semantically equal input reordering', () => {
  const repoRoot = initRepo({ 'public/z.js': 'z\n', 'index.html': 'home\n', 'public/a.js': 'a\n' });
  const inventory = buildStaticSourceInventory({ repoRoot });
  const reordered = { ...inventory, rows: [...inventory.rows].reverse() };
  assert.equal(validateStaticSourceInventory({ repoRoot, inventory: reordered }), true);
  assert.equal(reordered.staticSourceInventoryId, inventory.staticSourceInventoryId);
});

test('classification is conservative and generated families inherit first-party plus feed dependencies', () => {
  const repoRoot = initRepo({
    'index.html': 'home\n',
    'pages/products.html': 'product index\n',
    'pages/products/widget.html': 'widget\n',
    'pages/brands/acme.html': 'brand\n',
    'pages/compare/a-vs-b.html': 'compare\n',
    'pages/location/perth/fridge.html': 'location\n',
    'pages/fit-check/widget.html': 'fit route\n',
    'pages/cavity/600mm-fridge.html': 'cavity\n',
    'pages/doorway/800mm-fridge.html': 'doorway\n',
    'pages/guides/sizing.html': 'guide\n',
    'public/data/appliances.json': '{}\n',
    'public/fit-checker.html': 'fit\n',
    'public/image-sitemap.xml': '<xml/>\n',
    'public/rss.xml': '<rss/>\n',
    'public/service-worker.js': 'worker\n',
    'public/sitemap.xml': '<xml/>\n',
    'public/scripts/fit-engine.js': 'engine\n',
    'public/mystery.bin': Buffer.from([1, 2, 3]),
  });
  const inventory = buildStaticSourceInventory({ repoRoot });
  const result = classifyStaticSources({ inventory, generatedProvenance: { schemaVersion: 1, receipts: [] } });
  for (const row of result.rows.filter((candidate) => /pages\/(products(?:\.html|\/)|brands|compare|location|fit-check|cavity|doorway)|fit-checker|public\/data/.test(candidate.path))) {
    assert.deepEqual(row.dependencyIds, ['FIRST_PARTY', 'RETAILER_FEED']);
    assert.equal(row.sourceClass, 'GENERATED_RETAIL_PRESENTATION');
  }
  for (const path of ['pages/guides/sizing.html', 'public/image-sitemap.xml', 'public/rss.xml', 'public/sitemap.xml']) {
    const row = result.rows.find((candidate) => candidate.path === path);
    assert.equal(row.sourceClass, 'GENERATED_RETAIL_PRESENTATION');
    assert.deepEqual(row.dependencyIds, ['FIRST_PARTY', 'RETAILER_FEED']);
    assert.deepEqual(row.blockers, ['GENERATED_PROVENANCE_MISSING']);
  }
  for (const path of ['public/scripts/fit-engine.js']) {
    const row = result.rows.find((candidate) => candidate.path === path);
    assert.equal(row.sourceClass, 'FIRST_PARTY_CANDIDATE');
    assert.deepEqual(row.dependencyIds, ['FIRST_PARTY']);
    assert.deepEqual(row.blockers, ['GENERATED_PROVENANCE_MISSING']);
  }
  assert.equal(result.rows.some((row) => row.path === 'public/service-worker.js'), false);
  assert.deepEqual(result.rows.find((row) => row.path === 'public/mystery.bin').blockers, ['MISSING_DEPENDENCY_CLASSIFICATION', 'UNKNOWN_SOURCE_CLASS']);
});

test('sanitizer-bound catalog provenance removes the private-feed fallback only from its receipt chain', () => {
  const repoRoot = initRepo({
    'public/data/appliances.json': '{"products":[]}\n',
    'pages/products/widget.html': 'widget\n',
  });
  const inventory = buildStaticSourceInventory({ repoRoot });
  const catalog = inventory.rows.find((row) => row.path === 'public/data/appliances.json');
  const productPage = inventory.rows.find((row) => row.path === 'pages/products/widget.html');
  const catalogReceipt = buildGeneratedProvenanceReceipt({
    outputPath: catalog.path,
    outputSha256: catalog.sha256,
    producer: { path: 'scripts/architecture-v2/publish-active-retail-release.mjs', sha256: HASH },
    tools: [{ path: 'src/domain/public-projection.mjs', sha256: HASH }],
    inputs: [],
    dependencyIds: ['FIRST_PARTY'],
  });
  const pageReceipt = buildGeneratedProvenanceReceipt({
    outputPath: productPage.path,
    outputSha256: productPage.sha256,
    producer: { path: 'scripts/generate-product-pages.js', sha256: HASH },
    inputs: [{ path: catalog.path, sha256: catalog.sha256 }],
    dependencyIds: ['FIRST_PARTY'],
  });

  const classified = classifyStaticSources({
    inventory,
    generatedProvenance: { schemaVersion: 1, receipts: [catalogReceipt, pageReceipt] },
  });
  for (const row of classified.rows) {
    assert.deepEqual(row.dependencyIds, ['FIRST_PARTY']);
    assert.deepEqual(row.blockers, []);
  }

  const unprovedCatalogReceipt = buildGeneratedProvenanceReceipt({
    outputPath: catalog.path,
    outputSha256: catalog.sha256,
    producer: catalogReceipt.producer,
    tools: [],
    inputs: [],
    dependencyIds: ['FIRST_PARTY'],
  });
  const unproved = classifyStaticSources({
    inventory,
    generatedProvenance: { schemaVersion: 1, receipts: [unprovedCatalogReceipt, pageReceipt] },
  });
  for (const row of unproved.rows) {
    assert.deepEqual(row.dependencyIds, ['FIRST_PARTY', 'RETAILER_FEED']);
  }
});

test('edited public support data is first-party and evidence index remains provenance-gated', () => {
  const repoRoot = initRepo({
    'public/data/brands/metadata.json': '{}\n',
    'public/data/clearance.json': '{}\n',
    'public/data/rebates.json': '{}\n',
    'public/data/sources/direct-urls.json': '{}\n',
    'public/data/sources/manual-research.json': '{}\n',
    'public/data/evidence-index.json': '{}\n',
  });
  const inventory = buildStaticSourceInventory({ repoRoot });
  const result = classifyStaticSources({
    inventory,
    generatedProvenance: { schemaVersion: 1, receipts: [] },
  });

  for (const path of [
    'public/data/brands/metadata.json',
    'public/data/clearance.json',
    'public/data/rebates.json',
    'public/data/sources/direct-urls.json',
    'public/data/sources/manual-research.json',
  ]) {
    const row = result.rows.find((candidate) => candidate.path === path);
    assert.equal(row.sourceClass, 'FIRST_PARTY_CANDIDATE');
    assert.deepEqual(row.dependencyIds, ['FIRST_PARTY']);
    assert.deepEqual(row.blockers, []);
  }
  const evidenceIndex = result.rows.find((row) => row.path === 'public/data/evidence-index.json');
  assert.equal(evidenceIndex.sourceClass, 'FIRST_PARTY_CANDIDATE');
  assert.deepEqual(evidenceIndex.dependencyIds, ['FIRST_PARTY']);
  assert.deepEqual(evidenceIndex.blockers, ['GENERATED_PROVENANCE_MISSING']);
});

test('exact government reference provenance does not inherit the retailer-feed fallback', () => {
  const repoRoot = initRepo({
    'public/data/replacement-reference/fridges.json': '{"records":[]}\n',
  });
  const inventory = buildStaticSourceInventory({ repoRoot });
  const output = inventory.rows[0];
  const receipt = buildGeneratedProvenanceReceipt({
    outputPath: output.path,
    outputSha256: output.sha256,
    producer: { path: 'scripts/publish-government-reference.mjs', sha256: HASH },
    tools: [],
    fonts: [],
    inputs: [],
    dependencyIds: ['ENERGY_RATING_CC_BY', 'FIRST_PARTY'],
  });

  const result = classifyStaticSources({
    inventory,
    generatedProvenance: { schemaVersion: 1, receipts: [receipt] },
  });

  assert.deepEqual(result.rows[0].dependencyIds, ['ENERGY_RATING_CC_BY', 'FIRST_PARTY']);
  assert.deepEqual(result.rows[0].blockers, []);
});

test('first-party UI copy provenance does not inherit the retailer-feed fallback', () => {
  const repoRoot = initRepo({ 'public/data/ui-copy.json': '{"footer":{}}\n' });
  const inventory = buildStaticSourceInventory({ repoRoot });
  const output = inventory.rows[0];
  const receipt = buildGeneratedProvenanceReceipt({
    outputPath: output.path,
    outputSha256: output.sha256,
    producer: { path: 'scripts/generate-ui-copy.js', sha256: HASH },
    tools: [],
    fonts: [],
    inputs: [],
    dependencyIds: ['FIRST_PARTY'],
  });

  const result = classifyStaticSources({
    inventory,
    generatedProvenance: { schemaVersion: 1, receipts: [receipt] },
  });

  assert.deepEqual(result.rows[0].dependencyIds, ['FIRST_PARTY']);
  assert.deepEqual(result.rows[0].blockers, []);
});

test('OG provenance binds producer, font, inputs and inherits transitive dependencies', () => {
  const repoRoot = initRepo({ 'public/input.json': '{}\n', 'public/og-images/widget.png': Buffer.from([1, 2, 3]) });
  const inventory = buildStaticSourceInventory({ repoRoot });
  const receipt = buildGeneratedProvenanceReceipt({
    outputPath: 'public/og-images/widget.png',
    outputSha256: inventory.rows.find((row) => row.path === 'public/og-images/widget.png').sha256,
    producer: { path: 'scripts/generate-og-images.js', sha256: HASH },
    tools: [],
    fonts: [{ path: 'public/fonts/outfit.woff2', sha256: 'b'.repeat(64) }],
    inputs: [{ path: 'public/input.json', sha256: inventory.rows.find((row) => row.path === 'public/input.json').sha256 }],
    dependencyIds: ['FIRST_PARTY'],
  });
  const result = classifyStaticSources({
    inventory,
    generatedProvenance: {
      schemaVersion: 1,
      receipts: [receipt],
    },
  });
  assert.deepEqual(result.rows.find((row) => row.path.endsWith('.png')).dependencyIds, ['FIRST_PARTY', 'OUTFIT_FONT']);
  assert.throws(() => classifyStaticSources({
    inventory,
    generatedProvenance: {
      schemaVersion: 1,
      receipts: [{ ...receipt, producer: { ...receipt.producer, sha256: 'f'.repeat(64) } }],
    },
  }), assertCode('PROVENANCE_ID_INVALID'));
  const wrongOutput = buildGeneratedProvenanceReceipt({
    ...receipt,
    outputSha256: 'f'.repeat(64),
  });
  assert.throws(() => classifyStaticSources({
    inventory,
    generatedProvenance: { schemaVersion: 1, receipts: [wrongOutput] },
  }), assertCode('PROVENANCE_OUTPUT_DRIFT'));
});

test('generated provenance repository bindings reject changed producers and non-static inputs', () => {
  const repoRoot = initRepo({
    'index.html': 'home\n',
    'public/input.json': '{}\n',
    'public/output.html': 'output\n',
    'scripts/generate.js': 'generator\n',
    'scripts/helper.js': 'helper\n',
    'data/source.json': '{"source":true}\n',
  });
  const inventory = buildStaticSourceInventory({ repoRoot });
  const fileHash = (relativePath) => sha256(readFileSync(path.join(repoRoot, relativePath)));
  const receipt = buildGeneratedProvenanceReceipt({
    outputPath: 'public/output.html',
    outputSha256: fileHash('public/output.html'),
    producer: { path: 'scripts/generate.js', sha256: fileHash('scripts/generate.js') },
    tools: [{ path: 'scripts/helper.js', sha256: fileHash('scripts/helper.js') }],
    fonts: [],
    inputs: [
      { path: 'public/input.json', sha256: fileHash('public/input.json') },
      { path: 'data/source.json', sha256: fileHash('data/source.json') },
    ],
    dependencyIds: ['FIRST_PARTY'],
  });
  const generatedProvenance = { schemaVersion: 1, receipts: [receipt], unresolvedOutputs: [] };
  assert.equal(validateGeneratedProvenanceRepositoryBindings({ repoRoot, inventory, generatedProvenance }), true);
  writeFileSync(path.join(repoRoot, 'scripts/generate.js'), 'changed\n');
  assert.throws(
    () => validateGeneratedProvenanceRepositoryBindings({ repoRoot, inventory, generatedProvenance }),
    assertCode('PROVENANCE_REPOSITORY_DRIFT')
  );
});

test('generated output stays blocked when a generated static input has no provenance receipt', () => {
  const repoRoot = initRepo({
    'public/data/appliances.json': '{}\n',
    'pages/products/widget.html': 'widget\n',
  });
  const inventory = buildStaticSourceInventory({ repoRoot });
  const input = inventory.rows.find((row) => row.path === 'public/data/appliances.json');
  const output = inventory.rows.find((row) => row.path === 'pages/products/widget.html');
  const receipt = buildGeneratedProvenanceReceipt({
    outputPath: output.path,
    outputSha256: output.sha256,
    producer: { path: 'scripts/generate-product-pages.js', sha256: HASH },
    tools: [],
    fonts: [],
    inputs: [{ path: input.path, sha256: input.sha256 }],
    dependencyIds: ['FIRST_PARTY', 'RETAILER_FEED'],
  });
  const result = classifyStaticSources({
    inventory,
    generatedProvenance: { schemaVersion: 1, receipts: [receipt] },
  });
  assert.deepEqual(
    result.rows.find((row) => row.path === output.path).blockers,
    ['GENERATED_INPUT_PROVENANCE_MISSING:public/data/appliances.json']
  );
});

test('production authority validation fails closed without a trust root and rejects test issuers', () => {
  assert.throws(
    () => validateAuthoritySet({ authoritySet: { schemaVersion: 1, environment: 'PRODUCTION', trustRootEnrollment: null, authorities: [] } }),
    assertCode('PRODUCTION_TRUST_ROOT_NOT_ENROLLED')
  );
  const { authoritySet } = fixtureAuthority();
  authoritySet.environment = 'PRODUCTION';
  assert.throws(() => validateAuthoritySet({ authoritySet, trustRoot: { source: 'INJECTED' } }), assertCode('TEST_ISSUER_FORBIDDEN'));
  const malformed = fixtureAuthority().authoritySet;
  malformed.authorities[0].actions = ACTION;
  assert.throws(() => validateAuthoritySet({ authoritySet: malformed, testMode: true }), assertCode('AUTHORITY_SET_INVALID'));
});

test('decision validation rejects wrong inventory, expiry, withdrawal, test issuer in production, and invalid signature', () => {
  const input = fixtureReviewInput();
  const base = {
    registry: { schemaVersion: 1, decisions: input.decisions },
    authoritySet: input.authoritySet,
    inventoryId: input.inventory.staticSourceInventoryId,
    decisionAsOf: '2026-08-10T00:00:00.000Z',
    withdrawalHeadHash: 'd'.repeat(64),
    attributionFulfillments: [],
    testMode: true,
  };
  assert.equal(validateDecisionRegistry(base).decisions.length, 1);
  assert.throws(() => validateDecisionRegistry({ ...base, inventoryId: 'e'.repeat(64) }), assertCode('DECISION_WRONG_INVENTORY'));
  const expired = fixtureReviewInput({
    decisionOverrides: {
      decisionAsOf: '2026-08-21T00:00:00.000Z',
      validThrough: '2026-08-20T00:00:00.000Z',
      reviewBy: '2026-08-20T00:00:00.000Z',
    },
  });
  assert.throws(() => validateDecisionRegistry({
    ...base,
    registry: { schemaVersion: 1, decisions: expired.decisions },
    authoritySet: expired.authoritySet,
    inventoryId: expired.inventory.staticSourceInventoryId,
    decisionAsOf: '2026-08-21T00:00:00.000Z',
  }), assertCode('DECISION_EXPIRED'));
  assert.throws(() => validateDecisionRegistry({ ...base, withdrawalHeadHash: 'f'.repeat(64) }), assertCode('DECISION_WITHDRAWN'));
  assert.throws(() => validateDecisionRegistry({ ...base, testMode: false }), assertCode('TEST_ISSUER_FORBIDDEN'));
  const invalid = structuredClone(input.decisions[0]);
  invalid.signature = Buffer.alloc(64).toString('base64');
  assert.throws(() => validateDecisionRegistry({ ...base, registry: { schemaVersion: 1, decisions: [invalid] } }), assertCode('DECISION_SIGNATURE_INVALID'));
  const invalidDate = structuredClone(input.decisions[0]);
  invalidDate.payload.validFrom = 'not-a-date';
  assert.throws(() => validateDecisionRegistry({ ...base, registry: { schemaVersion: 1, decisions: [invalidDate] } }), assertCode('DECISION_SCHEMA_INVALID'));
});

test('attribution obligations require exact, reachable fulfillment', () => {
  const input = fixtureReviewInput({ decisionOverrides: { attributionObligationIds: ['NOTICE_WEB_VITALS'] } });
  const routeReceipt = buildAttributionRouteReceipt({
    inventoryId: input.inventory.staticSourceInventoryId,
    configSha256: 'e'.repeat(64),
    route: '/NOTICE.txt',
    sourcePath: 'public/NOTICE.txt',
    sourceSha256: HASH,
    targetPath: 'public/NOTICE.txt',
  });
  const fulfillment = {
    obligationId: 'NOTICE_WEB_VITALS',
    path: 'public/NOTICE.txt',
    sha256: HASH,
    route: '/NOTICE.txt',
    routeReceipt,
  };
  const base = {
    registry: { schemaVersion: 1, decisions: input.decisions },
    authoritySet: input.authoritySet,
    inventoryId: input.inventory.staticSourceInventoryId,
    decisionAsOf: '2026-08-10T00:00:00.000Z',
    withdrawalHeadHash: 'd'.repeat(64),
    routeConfigSha256: 'e'.repeat(64),
    testMode: true,
  };
  assert.throws(() => validateDecisionRegistry({ ...base, attributionFulfillments: [] }), assertCode('ATTRIBUTION_UNMET'));
  assert.throws(() => validateDecisionRegistry({
    ...base,
    attributionFulfillments: [fulfillment],
  }), assertCode('ATTRIBUTION_UNMET'));
  assert.throws(() => validateDecisionRegistry({
    ...base,
    attributionFulfillments: [fulfillment],
    publicationRows: [{ path: 'public/NOTICE.txt', sha256: 'f'.repeat(64) }],
  }), assertCode('ATTRIBUTION_UNMET'));
  const tamperedReceipt = structuredClone(routeReceipt);
  tamperedReceipt.payload.targetPath = 'public/OTHER.txt';
  assert.throws(() => validateDecisionRegistry({
    ...base,
    attributionFulfillments: [{ ...fulfillment, routeReceipt: tamperedReceipt }],
    publicationRows: [{ path: 'public/NOTICE.txt', sha256: HASH }],
  }), assertCode('ATTRIBUTION_UNMET'));
  assert.throws(() => validateDecisionRegistry({
    ...base,
    routeConfigSha256: 'f'.repeat(64),
    attributionFulfillments: [fulfillment],
    publicationRows: [{ path: 'public/NOTICE.txt', sha256: HASH }],
  }), assertCode('ATTRIBUTION_UNMET'));
  assert.equal(validateDecisionRegistry({
    ...base,
    attributionFulfillments: [fulfillment],
    publicationRows: [{ path: 'public/NOTICE.txt', sha256: HASH }],
  }).decisions.length, 1);
});

test('rights review accepts a decision only for its exact dependency path scope', () => {
  const input = fixtureReviewInput();
  const wrongScope = structuredClone(input.decisions[0]);
  wrongScope.payload.scopeHash = 'f'.repeat(64);
  wrongScope.decisionId = semanticId('fitappliance.static-rights-decision', 1, wrongScope.payload);
  const review = buildRightsReview({
    inventory: input.inventory,
    classifiedRows: input.classifiedRows,
    verifiedDecisions: [wrongScope],
    decisionAsOf: '2026-08-10T00:00:00.000Z',
    withdrawalHeadHash: 'd'.repeat(64),
  });
  assert.deepEqual(review.rows[0].blockers, ['DECISION_SCOPE_MISMATCH:FIRST_PARTY']);
  assert.deepEqual(review.rows[0].dependencyDecisionIds, []);
});

test('one unresolved dependency produces a complete blocked review and zero approved rows', () => {
  const input = fixtureReviewInput({ dependencies: ['FIRST_PARTY', 'RETAILER_FEED'] });
  const review = buildRightsReview({
    inventory: input.inventory,
    classifiedRows: input.classifiedRows,
    verifiedDecisions: [input.decisions[0]],
    decisionAsOf: '2026-08-10T00:00:00.000Z',
    withdrawalHeadHash: 'd'.repeat(64),
  });
  assert.equal(review.status, 'BLOCKED');
  assert.equal(review.rows.length, 1);
  assert.deepEqual(review.rows[0].blockers, ['MISSING_DECISION:RETAILER_FEED']);
  assert.equal(review.sourceManifest.status, 'BLOCKED');
  assert.equal(review.sourceManifest.rows.length, 0);
});

test('review construction rejects an unknown caller-supplied source class', () => {
  const input = fixtureReviewInput();
  input.classifiedRows[0].sourceClass = 'MAGIC_ALLOWED';
  assert.throws(() => buildRightsReview({
    inventory: input.inventory,
    classifiedRows: input.classifiedRows,
    verifiedDecisions: input.decisions,
    decisionAsOf: '2026-08-10T00:00:00.000Z',
    withdrawalHeadHash: 'd'.repeat(64),
  }), assertCode('UNKNOWN_SOURCE_CLASS'));
});

test('review construction rejects duplicate or incomplete classification coverage', () => {
  const repoRoot = initRepo({ 'index.html': 'home\n', 'public/app.js': 'app\n' });
  const inventory = buildStaticSourceInventory({ repoRoot });
  const classifiedRows = inventory.rows.map((row) => ({
    path: row.path,
    sourceClass: 'FIRST_PARTY',
    dependencyIds: ['FIRST_PARTY'],
    provenanceIds: [],
    blockers: [],
  }));
  const duplicated = [classifiedRows[0], classifiedRows[0]];
  assert.throws(() => buildRightsReview({
    inventory,
    classifiedRows: duplicated,
    decisionAsOf: '2026-08-10T00:00:00.000Z',
    withdrawalHeadHash: 'd'.repeat(64),
  }), assertCode('REVIEW_INVENTORY_MISMATCH'));
  assert.throws(() => buildRightsReview({
    inventory,
    classifiedRows: classifiedRows.slice(0, 1),
    decisionAsOf: '2026-08-10T00:00:00.000Z',
    withdrawalHeadHash: 'd'.repeat(64),
  }), assertCode('REVIEW_INVENTORY_MISMATCH'));
});

test('withdrawn input blocks every generated derivative', () => {
  const input = fixtureReviewInput();
  input.classifiedRows[0].provenanceIds = ['DERIVED_FROM_WITHDRAWN_INPUT'];
  const review = buildRightsReview({
    inventory: input.inventory,
    classifiedRows: input.classifiedRows,
    verifiedDecisions: input.decisions,
    withdrawnProvenanceIds: ['DERIVED_FROM_WITHDRAWN_INPUT'],
    decisionAsOf: '2026-08-10T00:00:00.000Z',
    withdrawalHeadHash: 'd'.repeat(64),
  });
  assert.equal(review.rows[0].blockers.includes('WITHDRAWN_INPUT'), true);
  assert.equal(review.sourceManifest.rows.length, 0);
});

test('schema 2 rejects arbitrary basis, schema-1 ALLOWED, unknown keys, and duplicate decision IDs', () => {
  const input = fixtureReviewInput();
  const row = { ...input.inventory.rows[0], rightsReviewRowId: HASH, dependencyDecisionIds: [input.decisions[0].decisionId] };
  const manifest = {
    schemaVersion: 2,
    status: 'APPROVED',
    inventoryId: input.inventory.staticSourceInventoryId,
    rightsReviewId: HASH,
    limits: { maxFiles: 10, maxFileBytes: 100, maxTotalBytes: 100, maxPathBytes: 240 },
    rows: [row],
  };
  assert.equal(validateSchema2Manifest(manifest).length, 1);
  assert.throws(() => validateSchema2Manifest({ ...manifest, schemaVersion: 1 }), assertCode('MANIFEST_SCHEMA_INVALID'));
  assert.throws(() => validateSchema2Manifest({ ...manifest, rows: [{ ...row, basis: 'I say ALLOWED' }] }), assertCode('SCHEMA_UNKNOWN_KEY'));
  assert.throws(() => validateSchema2Manifest({ ...manifest, rows: [{ ...row, dependencyDecisionIds: [input.decisions[0].decisionId, input.decisions[0].decisionId] }] }), assertCode('DUPLICATE_ID'));
  assert.throws(
    () => validateSchema2Manifest({ ...manifest, rows: [{ ...row, path: 'public/service-worker.js' }] }),
    assertCode('STATIC_SOURCE_PATH_INVALID')
  );
  assert.throws(
    () => validateSchema2Manifest({ ...manifest, rows: [{ ...row, path: 'public/A.txt' }, { ...row, path: 'public/a.txt' }] }),
    assertCode('MANIFEST_PATH_COLLISION')
  );
});

test('publication authorization is detached and the gate rejects an incorrect authorization ID', () => {
  const input = fixtureReviewInput();
  const review = buildRightsReview({
    inventory: input.inventory,
    classifiedRows: input.classifiedRows,
    verifiedDecisions: input.decisions,
    decisionAsOf: '2026-08-10T00:00:00.000Z',
    withdrawalHeadHash: 'd'.repeat(64),
  });
  const authorization = buildStaticPublicationAuthorization({
    inventory: input.inventory,
    generatedProvenance: { schemaVersion: 1, receipts: [] },
    authoritySet: input.authoritySet,
    registry: { schemaVersion: 1, decisions: input.decisions },
    review,
    manifest: review.sourceManifest,
    attributionFulfillments: [],
    decisionAsOf: '2026-08-10T00:00:00.000Z',
    withdrawalHeadHash: 'd'.repeat(64),
  });
  assert.equal('staticPublicationAuthorizationId' in review.sourceManifest, false);
  assert.equal(verifyStaticPublicationGate({
    inventory: input.inventory,
    generatedProvenance: { schemaVersion: 1, receipts: [] },
    authoritySet: input.authoritySet,
    registry: { schemaVersion: 1, decisions: input.decisions },
    review,
    manifest: review.sourceManifest,
    authorization,
    attributionFulfillments: [],
    currentDecisionAsOf: '2026-08-10T00:00:00.000Z',
    currentWithdrawalHeadHash: 'd'.repeat(64),
  }), true);
  assert.throws(() => verifyStaticPublicationGate({
    inventory: input.inventory,
    generatedProvenance: { schemaVersion: 1, receipts: [] },
    authoritySet: { ...input.authoritySet, environment: 'PRODUCTION' },
    registry: { schemaVersion: 1, decisions: input.decisions },
    review,
    manifest: review.sourceManifest,
    authorization,
    attributionFulfillments: [],
    currentDecisionAsOf: '2026-08-10T00:00:00.000Z',
    currentWithdrawalHeadHash: 'd'.repeat(64),
  }), assertCode('WITHDRAWAL_LOG_NOT_ESTABLISHED'));
  assert.throws(
    () => verifyStaticPublicationGate({ inventory: input.inventory, generatedProvenance: { schemaVersion: 1, receipts: [] }, authoritySet: input.authoritySet, registry: { schemaVersion: 1, decisions: input.decisions }, review, manifest: review.sourceManifest, authorization: { ...authorization, staticPublicationAuthorizationId: HASH }, attributionFulfillments: [], currentDecisionAsOf: '2026-08-10T00:00:00.000Z', currentWithdrawalHeadHash: 'd'.repeat(64) }),
    assertCode('STATIC_PUBLICATION_AUTHORIZATION_INVALID')
  );
  const tamperedPayload = { ...authorization.payload, sourceManifestId: 'f'.repeat(64) };
  assert.throws(
    () => verifyStaticPublicationGate({
      inventory: input.inventory,
      generatedProvenance: { schemaVersion: 1, receipts: [] },
      authoritySet: input.authoritySet,
      registry: { schemaVersion: 1, decisions: input.decisions },
      review,
      manifest: review.sourceManifest,
      authorization: {
        payload: tamperedPayload,
        staticPublicationAuthorizationId: semanticId('fitappliance.static-publication-authorization', 1, tamperedPayload),
      },
      attributionFulfillments: [],
      currentDecisionAsOf: '2026-08-10T00:00:00.000Z',
      currentWithdrawalHeadHash: 'd'.repeat(64),
    }),
    assertCode('STATIC_RIGHTS_GATE_BINDING_INVALID')
  );
  assert.throws(
    () => verifyStaticPublicationGate({
      inventory: input.inventory,
      generatedProvenance: { schemaVersion: 1, receipts: [{ tampered: true }] },
      authoritySet: input.authoritySet,
      registry: { schemaVersion: 1, decisions: input.decisions },
      review,
      manifest: review.sourceManifest,
      authorization,
      attributionFulfillments: [],
      currentDecisionAsOf: '2026-08-10T00:00:00.000Z',
      currentWithdrawalHeadHash: 'd'.repeat(64),
    }),
    assertCode('STATIC_RIGHTS_GATE_BINDING_INVALID')
  );
});

test('production registry requires a non-placeholder withdrawal head', () => {
  const input = fixtureReviewInput();
  assert.throws(() => validateDecisionRegistry({
    registry: { schemaVersion: 1, decisions: input.decisions },
    authoritySet: input.authoritySet,
    inventoryId: input.inventory.staticSourceInventoryId,
    decisionAsOf: '2026-08-10T00:00:00.000Z',
    withdrawalHeadHash: '0'.repeat(64),
    attributionFulfillments: [],
    testMode: true,
  }), assertCode('WITHDRAWAL_HEAD_NOT_ESTABLISHED'));
});

test('withdrawal log requires a signed append-only genesis and exact event chain', () => {
  const { privateKey, authoritySet } = fixtureAuthority();
  const genesis = signedWithdrawalLog({ privateKey, authoritySet });
  const genesisResult = validateWithdrawalLog({ withdrawalLog: genesis, authoritySet });
  assert.equal(genesisResult.sequence, 0);
  assert.equal(genesisResult.withdrawalHeadHash, genesis.heads[0].withdrawalHeadHash);

  const successor = signedWithdrawalLog({ privateKey, authoritySet, appendEvent: true });
  const successorResult = validateWithdrawalLog({ withdrawalLog: successor, authoritySet });
  assert.equal(successorResult.sequence, 1);
  assert.deepEqual(successorResult.eventIds, [successor.events[0].eventId]);

  const omitted = structuredClone(successor);
  omitted.events = [];
  assert.throws(() => validateWithdrawalLog({ withdrawalLog: omitted, authoritySet }), assertCode('WITHDRAWAL_CHAIN_INVALID'));

  const tampered = structuredClone(successor);
  tampered.events[0].payload.reasonCode = 'OTHER_REASON';
  assert.throws(() => validateWithdrawalLog({ withdrawalLog: tampered, authoritySet }), assertCode('WITHDRAWAL_EVENT_INVALID'));
});

test('production gate CLI has a valid success path for fully bound signed fixture inputs', () => {
  const repoRoot = initRepo({
    'index.html': 'home\n',
    'vercel.json': '{"cleanUrls":true}\n',
  });
  const projectRoot = process.cwd();
  for (const relativePath of [
    'src/domain/static-publication-rights.mjs',
    'scripts/deployment/build-static-rights-review.mjs',
    'scripts/deployment/verify-static-rights-gate.mjs',
  ]) {
    const destination = path.join(repoRoot, relativePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(path.join(projectRoot, relativePath), destination);
  }
  const inventory = buildStaticSourceInventory({ repoRoot });
  const classifiedRows = classifyStaticSources({ inventory, generatedProvenance: { schemaVersion: 1, receipts: [] } }).rows;
  const reviewer = generateKeyPairSync('ed25519');
  const owner = generateKeyPairSync('ed25519');
  const authorityPayload = {
    schemaVersion: 1,
    environment: 'PRODUCTION',
    authorities: [{
      issuerId: 'FITAPPLIANCE_RIGHTS_REVIEWER',
      keyId: 'FITAPPLIANCE_RIGHTS_KEY_1',
      publicKey: reviewer.publicKey.export({ type: 'spki', format: 'pem' }),
      roles: ['RIGHTS_REVIEWER'],
      actions: [ACTION],
    }],
  };
  const authoritySetHash = semanticId('fitappliance.static-publication-authority-set', 1, authorityPayload, { sortedArrays: ['authorities'] });
  const authoritySet = {
    ...authorityPayload,
    trustRootEnrollment: {
      authoritySetHash,
      signature: sign(null, Buffer.from(canonicalJson({ authoritySetHash })), owner.privateKey).toString('base64'),
    },
  };
  const withdrawalLog = signedWithdrawalLog({ privateKey: reviewer.privateKey, authoritySet });
  const withdrawalHeadHash = withdrawalLog.heads[0].withdrawalHeadHash;
  const decisions = PRODUCTION_STATIC_RIGHTS_DEPENDENCIES.map((dependencyId) => signedDecision({
    privateKey: reviewer.privateKey,
    inventoryId: inventory.staticSourceInventoryId,
    dependencyId,
    overrides: {
      issuerId: 'FITAPPLIANCE_RIGHTS_REVIEWER',
      keyId: 'FITAPPLIANCE_RIGHTS_KEY_1',
      scopeHash: dependencyId === 'FIRST_PARTY'
        ? scopeHashFor({ inventory, classifiedRows, dependencyId })
        : createHash('sha256').update(`unused-production-scope:${dependencyId}`).digest('hex'),
      withdrawalHeadHash,
    },
  }));
  const registry = {
    schemaVersion: 1,
    decisionAsOf: '2026-08-10T00:00:00.000Z',
    withdrawalHeadHash,
    attributionFulfillments: [],
    decisions,
  };
  const review = buildRightsReview({
    inventory,
    classifiedRows,
    verifiedDecisions: decisions,
    decisionAsOf: registry.decisionAsOf,
    withdrawalHeadHash: registry.withdrawalHeadHash,
  });
  const generatedProvenance = { schemaVersion: 1, receipts: [], unresolvedOutputs: [] };
  const authorization = buildStaticPublicationAuthorization({
    inventory,
    generatedProvenance,
    authoritySet,
    registry,
    review,
    manifest: review.sourceManifest,
    attributionFulfillments: [],
    decisionAsOf: registry.decisionAsOf,
    withdrawalHeadHash: registry.withdrawalHeadHash,
  });
  mkdirSync(path.join(repoRoot, 'deployment'), { recursive: true });
  for (const [name, value] of Object.entries({
    'static-generated-provenance.json': generatedProvenance,
    'static-publication-authorities.json': authoritySet,
    'static-rights-withdrawal-log.json': withdrawalLog,
    'static-rights-source-registry.json': registry,
    'static-publication-authorization.json': authorization,
  })) writeFileSync(path.join(repoRoot, 'deployment', name), canonicalJson(value));
  const trustRootPath = path.join(mkdtempSync(path.join(os.tmpdir(), 'fit-trust-root-')), 'trust-root.json');
  writeFileSync(trustRootPath, canonicalJson({
    source: 'INJECTED_READ_ONLY',
    publicKey: owner.publicKey.export({ type: 'spki', format: 'pem' }),
  }));
  const gate = spawnSync(process.execPath, ['scripts/deployment/verify-static-rights-gate.mjs', `--trust-root=${trustRootPath}`], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(gate.status, 0, gate.stderr);
  assert.match(gate.stdout, /"status": "APPROVED"/);

  rmSync(path.join(repoRoot, 'deployment/static-rights-withdrawal-log.json'));
  const missingLogGate = spawnSync(process.execPath, ['scripts/deployment/verify-static-rights-gate.mjs', `--trust-root=${trustRootPath}`], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.notEqual(missingLogGate.status, 0);
  assert.match(missingLogGate.stderr, /WITHDRAWAL_LOG_NOT_ESTABLISHED/);
});

test('real review command succeeds blocked while the production gate remains nonzero', () => {
  const repoRoot = process.cwd();
  const review = spawnSync(process.execPath, ['scripts/deployment/build-static-rights-review.mjs'], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(review.status, 0, review.stderr);
  const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'deployment/reviewed-static-source-manifest.json'), 'utf8'));
  const provenance = JSON.parse(readFileSync(path.join(repoRoot, 'deployment/static-generated-provenance.json'), 'utf8'));
  const rightsReview = JSON.parse(readFileSync(path.join(repoRoot, 'deployment/static-rights-review.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.status, 'BLOCKED');
  assert.equal(manifest.rows.length, 0);
  assert.deepEqual(provenance.unresolvedOutputs, []);
  assert.equal(rightsReview.rows.some((row) => row.path === 'public/service-worker.js'), false);
  assert.equal(rightsReview.blockers.some((row) => row.code === 'GENERATED_PROVENANCE_MISSING'), false);
  assert.equal(rightsReview.rows.every((row) => row.dependencyIds.length > 0), true);
  const gate = spawnSync(process.execPath, ['scripts/deployment/verify-static-rights-gate.mjs'], { cwd: repoRoot, encoding: 'utf8' });
  assert.notEqual(gate.status, 0);
  assert.match(gate.stderr, /PRODUCTION_TRUST_ROOT_NOT_ENROLLED/);
});

test.after(() => {
  for (const entry of []) rmSync(entry, { recursive: true, force: true });
});
