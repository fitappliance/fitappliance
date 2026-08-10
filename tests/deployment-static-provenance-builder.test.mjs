import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  RightsContractError,
  buildStaticSourceInventory,
  validateGeneratedProvenanceRepositoryBindings,
} from '../src/domain/static-publication-rights.mjs';
import {
  buildProductionReplaySpecs,
  buildReceiptsForSpecs,
  collectLocalModuleClosure,
} from '../scripts/deployment/build-replayed-static-provenance.mjs';

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function write(root, relativePath, contents) {
  const absolutePath = path.join(root, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
}

function fixture() {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'fit-provenance-repo-'));
  const replayRoot = mkdtempSync(path.join(os.tmpdir(), 'fit-provenance-replay-'));
  git(repoRoot, ['init', '-q']);
  git(repoRoot, ['config', 'user.email', 'fixture@example.invalid']);
  git(repoRoot, ['config', 'user.name', 'Fixture']);
  write(repoRoot, 'scripts/generate.js', "const helper = require('./helper.js');\nmodule.exports = helper;\n");
  write(repoRoot, 'scripts/helper.js', "module.exports = 'helper';\n");
  write(repoRoot, 'data/input.json', '{"source":true}\n');
  write(repoRoot, 'pages/products/widget.html', 'generated\n');
  write(repoRoot, 'public/data/untargeted.json', '{"untargeted":true}\n');
  git(repoRoot, ['add', '.']);
  git(repoRoot, ['commit', '-qm', 'fixture']);
  write(replayRoot, 'scripts/generate.js', readFileSync(path.join(repoRoot, 'scripts/generate.js')));
  write(replayRoot, 'scripts/helper.js', readFileSync(path.join(repoRoot, 'scripts/helper.js')));
  write(replayRoot, 'data/input.json', readFileSync(path.join(repoRoot, 'data/input.json')));
  write(replayRoot, 'pages/products/widget.html', 'generated\n');
  return { repoRoot, replayRoot };
}

function spec() {
  return {
    id: 'fixture-products',
    outputPaths: ['pages/products/widget.html'],
    producerPath: 'scripts/generate.js',
    toolEntryPaths: [],
    inputPaths: ['data/input.json'],
    fontPaths: [],
    dependencyIds: ['FIRST_PARTY', 'RETAILER_FEED'],
  };
}

function assertCode(code) {
  return (error) => {
    assert.equal(error instanceof RightsContractError, true);
    assert.equal(error.code, code);
    return true;
  };
}

test('replay builder emits content-bound receipts with the local module closure', () => {
  const { repoRoot, replayRoot } = fixture();
  const inventory = buildStaticSourceInventory({ repoRoot });
  const closure = collectLocalModuleClosure({ repoRoot, entryPaths: ['scripts/generate.js'] });
  assert.deepEqual(closure, ['scripts/generate.js', 'scripts/helper.js']);

  const result = buildReceiptsForSpecs({
    repoRoot,
    replayRoot,
    inventory,
    specs: [spec()],
    existingProvenance: { schemaVersion: 1, receipts: [] },
  });

  assert.equal(result.receiptsAdded, 1);
  assert.equal(result.generatedProvenance.receipts.length, 1);
  const [receipt] = result.generatedProvenance.receipts;
  assert.equal(receipt.outputPath, 'pages/products/widget.html');
  assert.equal(receipt.producer.path, 'scripts/generate.js');
  assert.deepEqual(receipt.tools.map((row) => row.path), ['scripts/helper.js']);
  assert.deepEqual(receipt.inputs.map((row) => row.path), ['data/input.json']);
  assert.equal(
    validateGeneratedProvenanceRepositoryBindings({ repoRoot, inventory, generatedProvenance: result.generatedProvenance }),
    true,
  );
});

test('production replay specs include reproduced guides, product index, and vendored Fit engine', () => {
  const { repoRoot } = fixture();
  write(repoRoot, 'data/architecture-v2/decisions/active-retail-release.json', JSON.stringify({
    artifacts: {
      publicProjection: { path: 'data/release/catalog.json' },
      historicalReference: { path: 'data/release/reference.json' },
      authorizationManifest: { path: 'data/release/authorization.json' },
    },
  }));
  for (const path of ['data/release/catalog.json', 'data/release/reference.json', 'data/release/authorization.json']) write(repoRoot, path, '{}\n');
  write(repoRoot, 'pages/products.html', 'index\n');
  write(repoRoot, 'pages/guides/index.json', '[]\n');
  write(repoRoot, 'public/scripts/fit-engine.js', 'engine\n');
  git(repoRoot, ['add', '.']);
  git(repoRoot, ['commit', '-qm', 'production paths']);
  const inventory = buildStaticSourceInventory({ repoRoot });
  const specs = buildProductionReplaySpecs({ repoRoot, inventory });
  assert.equal(specs.find((row) => row.id === 'product-pages').outputPaths.includes('pages/products.html'), true);
  assert.deepEqual(specs.find((row) => row.id === 'guide-pages').outputPaths, ['pages/guides/index.json']);
  assert.deepEqual(specs.find((row) => row.id === 'vendored-fit-engine').outputPaths, ['public/scripts/fit-engine.js']);
});

test('production replay specs bind the public sanitizer and never authorize the private retailer feed', () => {
  const { repoRoot } = fixture();
  write(repoRoot, 'data/architecture-v2/decisions/active-retail-release.json', JSON.stringify({
    artifacts: {
      publicProjection: { path: 'data/release/catalog.json' },
      historicalReference: { path: 'data/release/reference.json' },
      authorizationManifest: { path: 'data/release/authorization.json' },
    },
  }));
  for (const relativePath of [
    'data/release/catalog.json',
    'data/release/reference.json',
    'data/release/authorization.json',
  ]) write(repoRoot, relativePath, '{}\n');
  git(repoRoot, ['add', '.']);
  git(repoRoot, ['commit', '-qm', 'production source boundary']);

  const specs = buildProductionReplaySpecs({
    repoRoot,
    inventory: buildStaticSourceInventory({ repoRoot }),
  });
  const activeCatalog = specs.find((row) => row.id === 'active-catalog-projection');

  assert.ok(activeCatalog.toolEntryPaths.includes('src/domain/public-projection.mjs'));
  assert.deepEqual(activeCatalog.dependencyIds, ['FIRST_PARTY']);
  assert.equal(specs.some((row) => row.dependencyIds.includes('RETAILER_FEED')), false);
});

test('replay builder fails closed on output drift and duplicate output claims', () => {
  const { repoRoot, replayRoot } = fixture();
  const inventory = buildStaticSourceInventory({ repoRoot });
  write(replayRoot, 'pages/products/widget.html', 'changed\n');
  assert.throws(() => buildReceiptsForSpecs({
    repoRoot,
    replayRoot,
    inventory,
    specs: [spec()],
    existingProvenance: { schemaVersion: 1, receipts: [] },
  }), assertCode('REPLAY_OUTPUT_DRIFT'));

  write(replayRoot, 'pages/products/widget.html', readFileSync(path.join(repoRoot, 'pages/products/widget.html')));
  assert.throws(() => buildReceiptsForSpecs({
    repoRoot,
    replayRoot,
    inventory,
    specs: [spec(), { ...spec(), id: 'duplicate' }],
    existingProvenance: { schemaVersion: 1, receipts: [] },
  }), assertCode('REPLAY_SPEC_DUPLICATE_OUTPUT'));
});

test('replay builder rejects a replay root inside the repository or behind a symlink', () => {
  const { repoRoot, replayRoot } = fixture();
  const inventory = buildStaticSourceInventory({ repoRoot });
  assert.throws(() => buildReceiptsForSpecs({
    repoRoot,
    replayRoot: path.join(repoRoot, 'data'),
    inventory,
    specs: [spec()],
    existingProvenance: { schemaVersion: 1, receipts: [] },
  }), assertCode('REPLAY_ROOT_INVALID'));

  const link = path.join(os.tmpdir(), `fit-provenance-link-${process.pid}-${Date.now()}`);
  symlinkSync(replayRoot, link);
  assert.throws(() => buildReceiptsForSpecs({
    repoRoot,
    replayRoot: link,
    inventory,
    specs: [spec()],
    existingProvenance: { schemaVersion: 1, receipts: [] },
  }), assertCode('REPLAY_ROOT_INVALID'));
});

test('replay builder rejects dirty tools and unresolved local modules', () => {
  const { repoRoot, replayRoot } = fixture();
  const inventory = buildStaticSourceInventory({ repoRoot });
  write(repoRoot, 'scripts/helper.js', "module.exports = 'changed';\n");
  write(replayRoot, 'scripts/helper.js', "module.exports = 'changed';\n");
  assert.throws(() => buildReceiptsForSpecs({
    repoRoot,
    replayRoot,
    inventory,
    specs: [spec()],
    existingProvenance: { schemaVersion: 1, receipts: [] },
  }), assertCode('PROVENANCE_REPOSITORY_DRIFT'));

  write(repoRoot, 'scripts/helper.js', "require('./missing.js');\n");
  assert.throws(
    () => collectLocalModuleClosure({ repoRoot, entryPaths: ['scripts/generate.js'] }),
    assertCode('PROVENANCE_TOOL_UNRESOLVED'),
  );
});
