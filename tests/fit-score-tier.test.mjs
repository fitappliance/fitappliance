import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const searchCoreUrl = pathToFileURL(path.join(repoRoot, 'public', 'scripts', 'search-core.js')).href;

async function loadSearchCore() {
  const module = await import(`${searchCoreUrl}?cacheBust=${Date.now()}`);
  return module.default ?? module;
}

test('phase 58 fit score tiers map documented thresholds', async () => {
  const { getFitScoreTier } = await loadSearchCore();

  assert.equal(getFitScoreTier(100), 'excellent');
  assert.equal(getFitScoreTier(90), 'excellent');
  assert.equal(getFitScoreTier(89), 'strong');
  assert.equal(getFitScoreTier(75), 'strong');
  assert.equal(getFitScoreTier(74), 'workable');
  assert.equal(getFitScoreTier(60), 'workable');
  assert.equal(getFitScoreTier(59), 'tight');
  assert.equal(getFitScoreTier(40), 'tight');
  assert.equal(getFitScoreTier(39), 'marginal');
  assert.equal(getFitScoreTier(1), 'marginal');
  assert.equal(getFitScoreTier(0), 'no-fit');
});

test('phase 58 fit score labels match documented copy', async () => {
  const { getFitScoreLabel } = await loadSearchCore();

  assert.equal(getFitScoreLabel(95), 'Excellent fit');
  assert.equal(getFitScoreLabel(80), 'Strong fit');
  assert.equal(getFitScoreLabel(70), 'Workable fit');
  assert.equal(getFitScoreLabel(45), 'Tight fit');
  assert.equal(getFitScoreLabel(20), 'Marginal fit');
  assert.equal(getFitScoreLabel(0), "Won't fit");
});
