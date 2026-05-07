const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const DEFAULT_USER_AGENT = 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)';

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

async function fetchPdf(url, destPath, opts = {}) {
  const {
    fetchImpl = globalThis.fetch,
    force = false,
    retries = 3,
    retryDelayMs = 500,
    userAgent = DEFAULT_USER_AGENT
  } = opts;

  if (!fetchImpl) {
    throw new Error('fetchPdf requires a fetch implementation');
  }

  if (!force && fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
    return { path: destPath, cached: true, bytes: fs.statSync(destPath).size };
  }

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const tmpPath = `${destPath}.tmp`;
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          'User-Agent': userAgent
        }
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

      const body = await responseToReadable(response);
      await pipeline(body, fs.createWriteStream(tmpPath));
      fs.renameSync(tmpPath, destPath);

      return { path: destPath, cached: false, bytes: fs.statSync(destPath).size };
    } catch (error) {
      lastError = error;
      if (fs.existsSync(tmpPath)) {
        fs.rmSync(tmpPath, { force: true });
      }

      const retryable = error.transient || /fetch|network|timeout|ECONNRESET|ETIMEDOUT/i.test(error.message);
      if (!retryable || attempt === retries) {
        break;
      }
      await sleep(retryDelayMs * attempt);
    }
  }

  throw lastError;
}

exports.fetchPdf = fetchPdf;
exports.DEFAULT_USER_AGENT = DEFAULT_USER_AGENT;
