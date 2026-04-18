import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSourceData } from '../scripts/extract-static-data.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(repoRoot, 'public', 'data');
const indexHtmlPath = path.join(repoRoot, 'index.html');
const doorSwingResearchNotesPath = path.join(repoRoot, 'docs', 'door-swing-research-notes.md');

async function loadJsonDocument(filename) {
  const filePath = path.join(dataDir, filename);
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function loadDoorSwingResearchNotes() {
  return readFile(doorSwingResearchNotesPath, 'utf8');
}

async function loadSourceConstants() {
  const html = await readFile(indexHtmlPath, 'utf8');

  const hasEmbeddedConstants =
    html.includes('const PRODUCTS = [') &&
    html.includes('const BRAND_CLEARANCE = {') &&
    html.includes('const REBATES = {');

  if (!hasEmbeddedConstants) {
    return null;
  }

  return toPlainJson(await extractSourceData(indexHtmlPath));
}

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

test('JSON documents parse and expose schema metadata', async () => {
  const appliances = await loadJsonDocument('appliances.json');
  const clearance = await loadJsonDocument('clearance.json');
  const rebates = await loadJsonDocument('rebates.json');

  assert.equal(appliances.schema_version, 2);
  assert.match(appliances.last_updated, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(Array.isArray(appliances.products));
  assert.ok(appliances.products.length > 0);

  assert.equal(clearance.schema_version, 1);
  assert.match(clearance.last_updated, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(typeof clearance.rules, 'object');
  assert.ok(clearance.rules);

  assert.equal(rebates.schema_version, 1);
  assert.match(rebates.last_updated, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(typeof rebates.rebates, 'object');
  assert.ok(rebates.rebates);
});

test('appliances.json preserves the in-page product data when source constants exist', async () => {
  const appliances = await loadJsonDocument('appliances.json');
  const source = await loadSourceConstants();

  if (source) {
    assert.equal(appliances.products.length, source.products.length);
    assert.deepEqual(appliances.products, source.products);

    const sourceSamsung = source.products.find(product => product.id === 'f1');
    const extractedSamsung = appliances.products.find(product => product.id === 'f1');
    assert.deepEqual(extractedSamsung, sourceSamsung);
    return;
  }

  const samsung = appliances.products.find(product => product.id === 'f1');
  assert.ok(samsung);
  assert.equal(samsung.brand, 'Samsung');
  assert.equal(typeof samsung.w, 'number');
  assert.equal(typeof samsung.h, 'number');
  assert.equal(typeof samsung.d, 'number');
});

test('clearance.json and rebates.json preserve the current in-page lookup tables when source constants exist', async () => {
  const clearance = await loadJsonDocument('clearance.json');
  const rebates = await loadJsonDocument('rebates.json');
  const source = await loadSourceConstants();

  if (source) {
    assert.deepEqual(clearance.rules, source.clearance);
    assert.deepEqual(rebates.rebates, source.rebates);
    return;
  }

  assert.ok(clearance.rules.fridge);
  assert.ok(clearance.rules.washing_machine);
  assert.ok(rebates.rebates.VIC);
  assert.ok(rebates.rebates.NSW);
});

test('rebates.json stays presentation-agnostic and appliance data does not keep the legacy 63.5mm hinge placeholder', async () => {
  const appliances = await loadJsonDocument('appliances.json');
  const rebates = await loadJsonDocument('rebates.json');

  for (const rebate of Object.values(rebates.rebates)) {
    assert.ok(!Object.hasOwn(rebate, 'color'));
  }

  const fridgeDoorSwingValues = appliances.products
    .filter(product => product.cat === 'fridge')
    .map(product => product.door_swing_mm)
    .filter(value => value !== undefined);

  assert.ok(fridgeDoorSwingValues.length > 0);
  assert.ok(!fridgeDoorSwingValues.includes(63.5));
});

test('every product keeps an explicit door_swing_mm field even when the value is unknown', async () => {
  const appliances = await loadJsonDocument('appliances.json');

  for (const product of appliances.products) {
    assert.ok(
      Object.hasOwn(product, 'door_swing_mm'),
      `Expected ${product.id} to define door_swing_mm explicitly`
    );
  }
});

test('every unresolved priced model keeps a research-note reference for door swing checks', async () => {
  const appliances = await loadJsonDocument('appliances.json');
  const notes = await loadDoorSwingResearchNotes();
  const unresolvedProducts = appliances.products.filter(
    product => product.door_swing_mm === null && product.unavailable !== true
  );

  assert.ok(unresolvedProducts.length >= 0);
  if (unresolvedProducts.length === 0) {
    return;
  }

  for (const product of unresolvedProducts) {
    assert.ok(
      notes.includes(`\`${product.id}\``),
      `Expected ${product.id} to be documented in docs/door-swing-research-notes.md`
    );
  }
});
