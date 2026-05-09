require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { findFisherPaykelOfficialPdf } = require('./fisher-paykel-official');

const DEFAULT_USER_AGENT = 'FitApplianceBot/1.0 (+https://www.fitappliance.com.au/about)';
const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;
const PDF_MAGIC = '%PDF-';

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

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

function isPdfContentType(contentType) {
  return String(contentType || '').toLowerCase().includes('application/pdf');
}

function canVerifyPdfByMagicBytes(contentType) {
  const normalized = String(contentType || '').toLowerCase();
  return !normalized || normalized.includes('application/octet-stream');
}

function hasPdfMagicBytes(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const buffer = Buffer.alloc(PDF_MAGIC.length);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buffer, 0, PDF_MAGIC.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  return buffer.toString('latin1') === PDF_MAGIC;
}

function loadManualEvidence(repoRoot = process.cwd()) {
  return readJson(path.join(repoRoot, 'data', 'manual-evidence.json'), { products: {} });
}

function normalizeSku(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function isFisherPaykelTarget(target = {}) {
  return /fisher\s*&\s*paykel|f&p|fisherpaykel/i.test([
    target.brand,
    target.product?.brand
  ].filter(Boolean).join(' '));
}

function getTargetIds(target = {}) {
  return [
    target.id,
    target.product?.id,
    target.slug,
    target.product?.slug
  ].filter(Boolean).map(String);
}

function getTargetSkuCandidates(target = {}) {
  return [
    target.sku,
    target.model,
    target.product?.model,
    target.product?.sku
  ].filter(Boolean).map(normalizeSku).filter(Boolean);
}

function getEvidenceItems(entry) {
  if (!entry) return [];

  const items = [];
  if (entry.source_url) {
    items.push({
      type: entry.type || 'spec_sheet',
      status: entry.status || 'candidate',
      source_url: entry.source_url
    });
  }

  if (Array.isArray(entry.evidence)) {
    items.push(...entry.evidence);
  }

  return items;
}

function isUsableManualEvidence(item) {
  if (!item?.source_url) return false;
  if (item.status === 'rejected') return false;
  const type = String(item.type || 'spec_sheet');
  return /spec|sheet|manual|install|qrg|quick|reference|guide|pdf/i.test(type);
}

function findManualEvidenceEntry(target, manualEvidence) {
  const products = manualEvidence?.products || {};
  for (const id of getTargetIds(target)) {
    if (products[id]) return products[id];
  }

  const targetSkus = new Set(getTargetSkuCandidates(target));
  if (targetSkus.size === 0) return null;

  for (const entry of Object.values(products)) {
    const entrySkus = [
      entry?.sku,
      entry?.model,
      entry?.product?.model,
      entry?.product?.sku
    ].filter(Boolean).map(normalizeSku);
    if (entrySkus.some((sku) => targetSkus.has(sku))) {
      return entry;
    }
  }

  return null;
}

function findManualEvidenceSourceUrl(target, manualEvidence) {
  const entry = findManualEvidenceEntry(target, manualEvidence);
  const item = getEvidenceItems(entry).find(isUsableManualEvidence);
  return item?.source_url || null;
}

async function resolvePdfSourceUrl(target, {
  repoRoot = process.cwd(),
  manualEvidence = loadManualEvidence(repoRoot),
  searchPdf = null,
  fisherPaykelOfficialFinder = findFisherPaykelOfficialPdf,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  userAgent = DEFAULT_USER_AGENT
} = {}) {
  const manualSource = findManualEvidenceSourceUrl(target, manualEvidence);
  if (manualSource) {
    return { sourceUrl: manualSource, source: 'manual-evidence' };
  }

  let officialError = null;
  if (isFisherPaykelTarget(target) && fisherPaykelOfficialFinder) {
    try {
      const official = await fisherPaykelOfficialFinder(target, {
        fetchImpl,
        timeoutMs,
        userAgent
      });
      if (official?.sourceUrl) {
        return { sourceUrl: official.sourceUrl, source: official.source };
      }
    } catch (error) {
      officialError = error;
    }
  }

  if (!searchPdf) {
    if (officialError) {
      throw officialError;
    }
    throw new Error('PDF source URL not found in manual-evidence; provide searchPdf fallback or seed data/manual-evidence.json');
  }

  return {
    sourceUrl: await searchPdf(target),
    source: 'search'
  };
}

async function fetchPdfForTarget(target, destPath, opts = {}) {
  const { sourceUrl, source } = await resolvePdfSourceUrl(target, opts);
  const result = await fetchPdf(sourceUrl, destPath, opts);
  return { ...result, sourceUrl, source };
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
      const requiresMagicByteCheck = !isPdfContentType(contentType) && canVerifyPdfByMagicBytes(contentType);
      if (!isPdfContentType(contentType) && !requiresMagicByteCheck) {
        throw new Error(`Expected application/pdf content-type, received "${contentType || 'unknown'}"`);
      }

      const contentLength = Number.parseInt(String(response.headers?.get?.('content-length') || ''), 10);
      if (Number.isFinite(contentLength)) {
        assertWithinByteLimit(contentLength, maxBytes, 'PDF response');
      }

      const body = await responseToReadable(response);
      await pipeline(body, createByteLimitTransform(maxBytes), fs.createWriteStream(tmpPath));

      if (requiresMagicByteCheck && !hasPdfMagicBytes(tmpPath)) {
        throw new Error(`PDF magic bytes not found for content-type "${contentType || 'unknown'}"`);
      }

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
exports.fetchPdfForTarget = fetchPdfForTarget;
exports.findManualEvidenceSourceUrl = findManualEvidenceSourceUrl;
exports.loadManualEvidence = loadManualEvidence;
exports.resolvePdfSourceUrl = resolvePdfSourceUrl;
exports.DEFAULT_USER_AGENT = DEFAULT_USER_AGENT;
exports.DEFAULT_MAX_BYTES = DEFAULT_MAX_BYTES;
exports.DEFAULT_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
