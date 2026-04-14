import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = '/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2';
const fetchUtilsUrl = pathToFileURL(path.join(repoRoot, 'scripts', 'utils', 'fetch-utils.js')).href;
const circuitBreakerUrl = pathToFileURL(path.join(repoRoot, 'scripts', 'utils', 'circuit-breaker.js')).href;
const schemaUrl = pathToFileURL(path.join(repoRoot, 'scripts', 'schema.js')).href;

async function loadModule(moduleUrl, label) {
  try {
    return await import(moduleUrl);
  } catch (error) {
    assert.fail(`${label} is not implemented yet: ${error.message}`);
  }
}

function makeValidProduct(overrides = {}) {
  return {
    id: 'f-valid',
    cat: 'fridge',
    brand: 'Samsung',
    model: 'SRF7500WFH',
    w: 912,
    h: 1780,
    d: 748,
    kwh_year: 420,
    stars: 3,
    price: 3499,
    emoji: 'fridge',
    door_swing_mm: 650,
    features: ['French Door'],
    retailers: [{ n: 'Demo', url: 'https://example.com', p: 3499 }],
    sponsored: false,
    ...overrides
  };
}

test('red 1: fetchWithRetry waits Retry-After seconds before retrying HTTP 429', async () => {
  const { fetchWithRetry } = await loadModule(fetchUtilsUrl, 'scripts/utils/fetch-utils.js');

  let attempt = 0;
  const waits = [];
  const fakeFetch = async () => {
    attempt += 1;

    if (attempt === 1) {
      return {
        status: 429,
        headers: {
          get(name) {
            return name.toLowerCase() === 'retry-after' ? '2' : null;
          }
        }
      };
    }

    return {
      status: 200,
      headers: {
        get() {
          return null;
        }
      }
    };
  };

  const response = await fetchWithRetry(
    'https://example.com/rate-limited',
    {},
    3,
    {
      fetchFn: fakeFetch,
      sleepFn: async ms => {
        waits.push(ms);
      },
      randomFn: () => 0
    }
  );

  assert.equal(response.status, 200);
  assert.equal(attempt, 2);
  assert.deepEqual(waits, [2000]);
});

test('red 2: circuit-breaker throws DATA_LOSS and requests process termination', async () => {
  const { runCircuitBreaker, runCircuitBreakerOrExit, CircuitBreakerError } = await loadModule(
    circuitBreakerUrl,
    'scripts/utils/circuit-breaker.js'
  );

  assert.throws(
    () => runCircuitBreaker(new Array(79).fill(makeValidProduct()), new Array(100).fill(makeValidProduct())),
    error => error instanceof CircuitBreakerError && error.code === 'DATA_LOSS'
  );

  const exitCalls = [];
  assert.throws(
    () =>
      runCircuitBreakerOrExit(new Array(79).fill(makeValidProduct()), new Array(100).fill(makeValidProduct()), {
        exitFn(code) {
          exitCalls.push(code);
          throw new Error(`EXIT_${code}`);
        },
        logger: { error() {} }
      }),
    /EXIT_1/
  );
  assert.deepEqual(exitCalls, [1]);
});

test('red 3: schema rejects injected 63.5mm door_swing_mm outlier', async () => {
  const { validateProduct } = await loadModule(schemaUrl, 'scripts/schema.js');
  const errors = validateProduct(
    makeValidProduct({
      id: 'f-outlier',
      door_swing_mm: 63.5
    })
  );

  assert.ok(errors.length > 0);
  assert.ok(errors.some(error => /door_swing_mm/i.test(error)));
});
