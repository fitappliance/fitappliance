const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const DEFAULT_USER_AGENT = 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)';
const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientStatus(status) {
  return status === 429 || status >= 500;
}

async function responseToReadable(response) {
  if (response.body && typeof response.body.getReader === 'function') {
    return Readable.fromWeb(response.body);
  }

  if (typeof response.arrayBuffer === 'function') {
    return Readable.from(Buffer.from(await response.arrayBuffer()));
  }

  throw new Error('PDF fetch response has no readable body');
}

function assertWithinByteLimit(bytes, maxBytes, label = 'PDF') {
  if (Number.isFinite(maxBytes) && bytes > maxBytes) {
    throw new Error(`${label} exceeds ${maxBytes} bytes`);
  }
}

function createByteLimitTransform(maxBytes) {
  let bytes = 0;
  return new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      try {
        assertWithinByteLimit(bytes, maxBytes, 'PDF stream');
        callback(null, chunk);
      } catch (error) {
        callback(error);
      }
    }
  });
}

async function fetchPdf(url, destPath, opts = {}) {
  const {
    fetchImpl = globalThis.fetch,
    force = false,
    maxBytes = DEFAULT_MAX_BYTES,
    retries = 3,
    retryDelayMs = 500,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    userAgent = DEFAULT_USER_AGENT
  } = opts;

  if (!fetchImpl) {
    throw new Error('fetchPdf requires a fetch implementation');
  }

  if (!force && fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
    const cachedBytes = fs.statSync(destPath).size;
    assertWithinByteLimit(cachedBytes, maxBytes, 'Cached PDF');
    return { path: destPath, cached: true, bytes: cachedBytes };
  }

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const tmpPath = `${destPath}.tmp`;
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;
    try {
      const response = await fetchImpl(url, {
        headers: {
          'User-Agent': userAgent
        },
        signal: controller.signal
      });

      if (!response.ok) {
        const error = new Error(`PDF fetch failed with HTTP ${response.status}`);
        error.transient = isTransientStatus(response.status);
        throw error;
      }

      const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
      if (!contentType.includes('application/pdf')) {
        throw new Error(`Expected application/pdf content-type, received "${contentType || 'unknown'}"`);
      }

      const contentLength = Number.parseInt(String(response.headers?.get?.('content-length') || ''), 10);
      if (Number.isFinite(contentLength)) {
        assertWithinByteLimit(contentLength, maxBytes, 'PDF response');
      }

      const body = await responseToReadable(response);
      await pipeline(body, createByteLimitTransform(maxBytes), fs.createWriteStream(tmpPath));
      fs.renameSync(tmpPath, destPath);

      return { path: destPath, cached: false, bytes: fs.statSync(destPath).size };
    } catch (error) {
      lastError = controller.signal.aborted
        ? new Error(`PDF fetch timeout after ${timeoutMs}ms`)
        : error;
      if (fs.existsSync(tmpPath)) {
        fs.rmSync(tmpPath, { force: true });
      }

      const retryable = lastError.transient || /fetch|network|timeout|ECONNRESET|ETIMEDOUT/i.test(lastError.message);
      if (!retryable || attempt === retries) {
        break;
      }
      await sleep(retryDelayMs * attempt);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  throw lastError;
}

exports.fetchPdf = fetchPdf;
exports.DEFAULT_USER_AGENT = DEFAULT_USER_AGENT;
exports.DEFAULT_MAX_BYTES = DEFAULT_MAX_BYTES;
exports.DEFAULT_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
