import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fitScoreModuleUrl = pathToFileURL(
  path.join(repoRoot, 'public', 'scripts', 'ui', 'fit-score.js')
).href;

function makeProduct(overrides = {}) {
  return {
    id: 'p-fit-1',
    cat: 'fridge',
    brand: 'LG',
    model: 'Fit Model',
    w: 800,
    h: 1700,
    d: 700,
    ...overrides
  };
}

test('task 14 fit-score: perfect fit returns 100', async () => {
  const { computeFitScore } = await import(fitScoreModuleUrl);
  const result = computeFitScore(
    makeProduct(),
    1000,
    2000,
    900,
    { side: 20, rear: 50, top: 50 }
  );

  assert.equal(result.score, 100);
  assert.match(result.label, /100\/100/);
  assert.deepEqual(result.warnings, []);
});

test('task 14 fit-score: width too small returns no fit', async () => {
  const { computeFitScore } = await import(fitScoreModuleUrl);
  const result = computeFitScore(
    makeProduct({ w: 850 }),
    800,
    2000,
    900,
    { side: 20, rear: 50, top: 50 }
  );

  assert.equal(result.score, 0);
  assert.match(result.label, /No fit/);
});

test('task 14 fit-score: width tight but positive gives a partial score', async () => {
  const { computeFitScore } = await import(fitScoreModuleUrl);
  const result = computeFitScore(
    makeProduct({ w: 790 }),
    820,
    2000,
    900,
    { side: 20, rear: 50, top: 50 }
  );

  assert.ok(result.score < 100 && result.score >= 60);
  assert.ok(result.warnings.some((warning) => warning.includes('Side clearance tight')));
});

test('task 14 fit-score: multiple tight dimensions apply cumulative penalties', async () => {
  const { computeFitScore } = await import(fitScoreModuleUrl);
  const loose = computeFitScore(
    makeProduct(),
    1000,
    2000,
    900,
    { side: 20, rear: 50, top: 50 }
  );
  const tight = computeFitScore(
    makeProduct(),
    845,
    1720,
    740,
    { side: 25, rear: 60, top: 60 }
  );

  assert.ok(tight.score < loose.score);
  assert.ok(tight.warnings.length >= 2);
});

test('task 14 fit-score: missing cavity input returns null score with prompt label', async () => {
  const { computeFitScore } = await import(fitScoreModuleUrl);
  const result = computeFitScore(
    makeProduct(),
    null,
    null,
    null,
    { side: 20, rear: 50, top: 50 }
  );

  assert.equal(result.score, null);
  assert.equal(result.label, 'Enter cavity size to score');
});

test('task 14 fit-score: default clearance fallback applies when rule is missing', async () => {
  const { computeFitScore } = await import(fitScoreModuleUrl);
  const result = computeFitScore(
    makeProduct({ w: 790 }),
    820,
    2000,
    900
  );

  assert.ok(result.warnings.some((warning) => warning.includes('40mm recommended')));
});

test('task 14 fit-score: height too small returns no fit', async () => {
  const { computeFitScore } = await import(fitScoreModuleUrl);
  const result = computeFitScore(
    makeProduct({ h: 1850 }),
    1000,
    1800,
    900,
    { side: 20, rear: 50, top: 50 }
  );

  assert.equal(result.score, 0);
  assert.match(result.label, /No fit/);
});
