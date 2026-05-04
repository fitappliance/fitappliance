import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = path.join(repoRoot, 'public', 'scripts', 'space-alerts.mjs');

async function loadModule() {
  return import(`${pathToFileURL(modulePath).href}?cacheBust=${Date.now()}`);
}

test('phase 52 space alerts: marks a 600mm fridge cavity as common but tight', async () => {
  const { buildSpaceAlerts } = await loadModule();

  const alerts = buildSpaceAlerts({ cat: 'fridge', w: 600, h: 1900, d: 650, door: 820 });

  assert.equal(alerts.some((alert) => alert.id === 'fridge-600-width'), true);
  assert.match(alerts.find((alert) => alert.id === 'fridge-600-width')?.label ?? '', /600mm cavity/i);
});

test('phase 52 space alerts: warns when fridge depth is shallow', async () => {
  const { buildSpaceAlerts } = await loadModule();

  const alerts = buildSpaceAlerts({ cat: 'fridge', w: 700, h: 1900, d: 610, door: 820 });

  assert.equal(alerts.some((alert) => alert.id === 'shallow-depth'), true);
  assert.match(alerts.find((alert) => alert.id === 'shallow-depth')?.detail ?? '', /rear pipe/i);
});

test('phase 52 space alerts: warns about tight delivery paths', async () => {
  const { buildSpaceAlerts } = await loadModule();

  const alerts = buildSpaceAlerts({ cat: 'washing_machine', w: 600, h: 850, d: 650, door: 720 });

  assert.equal(alerts.some((alert) => alert.id === 'tight-delivery-path'), true);
});

test('phase 52 space alerts: returns no alerts when dimensions are incomplete', async () => {
  const { buildSpaceAlerts } = await loadModule();

  assert.deepEqual(buildSpaceAlerts({ cat: 'fridge', w: 600, h: null, d: 650 }), []);
});
