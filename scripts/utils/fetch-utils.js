'use strict';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseRetryAfterSeconds(value) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 60;
}

async function fetchWithRetry(url, options = {}, maxRetries = 3, deps = {}) {
  const fetchFn = deps.fetchFn ?? globalThis.fetch;
  const sleepFn = deps.sleepFn ?? sleep;
  const randomFn = deps.randomFn ?? Math.random;
  const logger = deps.logger ?? console;

  if (typeof fetchFn !== 'function') {
    throw new Error('fetchWithRetry requires a fetch implementation');
  }

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const response = await fetchFn(url, options);

    if (response.status === 429) {
      const retryAfterSeconds = parseRetryAfterSeconds(response.headers?.get?.('Retry-After'));
      logger.error(
        `[rate-limit] 429 received, waiting ${retryAfterSeconds}s before retry ${attempt + 1}/${maxRetries}`
      );
      await sleepFn(retryAfterSeconds * 1000);
      continue;
    }

    if (response.status >= 500 && attempt < maxRetries - 1) {
      const delay = Math.pow(2, attempt) * 1000 + randomFn() * 500;
      logger.error(
        `[retry] HTTP ${response.status} on attempt ${attempt + 1}, retrying in ${delay.toFixed(0)}ms`
      );
      await sleepFn(delay);
      continue;
    }

    return response;
  }

  throw new Error(`[fetch-failed] Max retries (${maxRetries}) exceeded for: ${url}`);
}

module.exports = {
  fetchWithRetry,
  sleep
};
