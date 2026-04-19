import test from 'node:test';
import assert from 'node:assert/strict';
import { constants as fsConstants } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const auditModuleUrl = pathToFileURL(path.join(repoRoot, 'scripts', 'audit-coverage.js')).href;
const brandUtilsModuleUrl = pathToFileURL(path.join(repoRoot, 'scripts', 'utils', 'brand-utils.js')).href;

function makeProduct(overrides = {}) {
  return {
    id: 'p1',
    cat: 'fridge',
    brand: 'HISENSE',
    model: 'HRBC113',
    w: 550,
    h: 1430,
    d: 560,
    kwh_year: 220,
    stars: 3,
    price: null,
    emoji: '🧊',
    door_swing_mm: null,
    features: ['No Frost'],
    retailers: [],
    sponsored: false,
    ...overrides
  };
}

async function createWorkspace(products) {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'fitappliance-audit-'));
  const dataDir = path.join(rootDir, 'public', 'data');
  const outputPath = path.join(rootDir, 'docs', 'coverage-audit.json');
  await mkdir(dataDir, { recursive: true });

  await writeFile(
    path.join(dataDir, 'appliances.json'),
    `${JSON.stringify({
      schema_version: 2,
      last_updated: '2026-04-15',
      products
    }, null, 2)}\n`,
    'utf8'
  );

  return { rootDir, dataDir, outputPath };
}

test('task 9.2 audit: counts door swing missing/covered products correctly', async () => {
  const { auditCoverage } = await import(auditModuleUrl);
  const workspace = await createWorkspace([
    makeProduct({ id: 'a', door_swing_mm: null }),
    makeProduct({ id: 'b', door_swing_mm: null }),
    makeProduct({ id: 'c', door_swing_mm: null }),
    makeProduct({ id: 'd', door_swing_mm: 0 }),
    makeProduct({ id: 'e', door_swing_mm: 620 })
  ]);

  const result = await auditCoverage({
    dataDir: workspace.dataDir,
    outputPath: workspace.outputPath,
    logger: { log() {} }
  });

  assert.equal(result.summary.total, 5);
  assert.equal(result.summary.doorSwingMissing, 3);
  assert.equal(result.summary.doorSwingCovered, 2);
});

test('task 9.2 audit: doorSwingByBrand list is sorted by missing desc', async () => {
  const { auditCoverage } = await import(auditModuleUrl);
  const workspace = await createWorkspace([
    makeProduct({ id: 'a1', brand: 'WESTINGHOUSE', cat: 'fridge', door_swing_mm: null }),
    makeProduct({ id: 'a2', brand: 'WESTINGHOUSE', cat: 'fridge', door_swing_mm: null }),
    makeProduct({ id: 'b1', brand: 'HISENSE', cat: 'fridge', door_swing_mm: null }),
    makeProduct({ id: 'b2', brand: 'HISENSE', cat: 'fridge', door_swing_mm: 600 })
  ]);

  const result = await auditCoverage({
    dataDir: workspace.dataDir,
    outputPath: workspace.outputPath,
    logger: { log() {} }
  });

  assert.equal(result.doorSwingByBrand[0].brand, 'WESTINGHOUSE');
  assert.equal(result.doorSwingByBrand[0].missing, 2);
});

test('task 9.2 audit: hasPrice counts only integer values > 0', async () => {
  const { auditCoverage } = await import(auditModuleUrl);
  const workspace = await createWorkspace([
    makeProduct({ id: 'p-null', price: null }),
    makeProduct({ id: 'p-zero', price: 0 }),
    makeProduct({ id: 'p-positive', price: 1499 }),
    makeProduct({ id: 'p-float', price: 1499.5 })
  ]);

  const result = await auditCoverage({
    dataDir: workspace.dataDir,
    outputPath: workspace.outputPath,
    logger: { log() {} }
  });

  assert.equal(result.summary.hasPrice, 1);
});

test('task 9.2 audit: writes coverage report JSON to outputPath by default', async () => {
  const { auditCoverage } = await import(auditModuleUrl);
  const workspace = await createWorkspace([makeProduct()]);

  await auditCoverage({
    dataDir: workspace.dataDir,
    outputPath: workspace.outputPath,
    logger: { log() {} }
  });

  const json = JSON.parse(await readFile(workspace.outputPath, 'utf8'));
  assert.equal(typeof json.generated, 'string');
  assert.equal(typeof json.summary.total, 'number');
  assert.ok(Array.isArray(json.doorSwingByBrand));
});

test('task 9.2 audit: write=false skips file output but still returns report', async () => {
  const { auditCoverage } = await import(auditModuleUrl);
  const workspace = await createWorkspace([makeProduct()]);

  const result = await auditCoverage({
    dataDir: workspace.dataDir,
    outputPath: workspace.outputPath,
    write: false,
    logger: { log() {} }
  });

  assert.equal(result.summary.total, 1);
  await assert.rejects(access(workspace.outputPath, fsConstants.F_OK));
});

test('task 9.2 brand display map: displayBrandName maps known uppercase brand keys', async () => {
  const { displayBrandName } = await import(brandUtilsModuleUrl);
  assert.equal(displayBrandName('HISENSE'), 'Hisense');
  assert.equal(displayBrandName('Fisher & Paykel'), 'Fisher & Paykel');
});

test('task 9.2 brand display map: displayBrandName falls back for unknown brand names', async () => {
  const { displayBrandName } = await import(brandUtilsModuleUrl);
  assert.equal(displayBrandName('AEG'), 'AEG');
});
