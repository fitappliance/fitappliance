import { createHash } from 'node:crypto';
import { isAbsolute, posix } from 'node:path';

const CACHE_STATUSES = new Set(['indexed', 'missing', 'stale', 'failed']);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function validRelativePath(value) {
  const path = String(value ?? '');
  if (!path || isAbsolute(path) || path.includes('\\')) return false;
  const normalized = posix.normalize(path);
  return normalized === path && normalized !== '..' && !normalized.startsWith('../');
}

function validPdf(bytes) {
  return bytes.length > 0
    && bytes.subarray(0, 16).toString('utf8').trimStart().startsWith('%PDF-');
}

function assertSha256(value, label = 'source PDF SHA-256') {
  if (!SHA256_PATTERN.test(String(value ?? ''))) throw new TypeError(`${label} required`);
}

function boundedDiagnostic(value, maximum = 4096) {
  const text = String(value ?? '');
  if (text.length <= maximum) return text;
  const marker = '\n...[truncated]...\n';
  const prefixLength = 512;
  return `${text.slice(0, prefixLength)}${marker}${text.slice(-(maximum - prefixLength - marker.length))}`;
}

export function deduplicateHistoricalPdfs(records) {
  if (!Array.isArray(records)) throw new TypeError('historical PDF records must be an array');
  const byHash = new Map();
  for (const record of records) {
    if (!validRelativePath(record?.relativePath)) throw new TypeError('safe relative path required');
    const bytes = Buffer.from(record?.pdfBytes ?? []);
    if (!validPdf(bytes)) throw new TypeError(`valid PDF payload required: ${record.relativePath}`);
    const sourcePdfSha256 = sha256(bytes);
    const existing = byHash.get(sourcePdfSha256);
    if (existing) {
      existing.paths.push(record.relativePath);
      continue;
    }
    byHash.set(sourcePdfSha256, {
      sourcePdfSha256,
      byteSize: bytes.length,
      paths: [record.relativePath],
    });
  }
  return [...byHash.values()]
    .map((document) => ({ ...document, paths: [...new Set(document.paths)].sort() }))
    .sort((left, right) => left.sourcePdfSha256.localeCompare(right.sourcePdfSha256));
}

export function buildHistoricalMineruAudit(input) {
  const documents = Array.isArray(input?.documents) ? input.documents : [];
  const cacheStates = Array.isArray(input?.cacheStates) ? input.cacheStates : [];
  const attempts = Array.isArray(input?.attempts) ? input.attempts : [];
  const invalidFiles = Array.isArray(input?.invalidFiles) ? input.invalidFiles : [];
  const generatedAt = new Date(input?.generatedAt ?? '').toISOString();
  const stateByHash = new Map();
  for (const state of cacheStates) {
    assertSha256(state?.sourcePdfSha256);
    if (!CACHE_STATUSES.has(state?.status)) throw new TypeError(`invalid MinerU cache status: ${state?.status}`);
    if (stateByHash.has(state.sourcePdfSha256)) throw new TypeError(`duplicate cache state: ${state.sourcePdfSha256}`);
    stateByHash.set(state.sourcePdfSha256, state);
  }
  const attemptByHash = new Map();
  for (const attempt of attempts) {
    assertSha256(attempt?.sourcePdfSha256);
    if (attemptByHash.has(attempt.sourcePdfSha256)) throw new TypeError(`duplicate attempt state: ${attempt.sourcePdfSha256}`);
    attemptByHash.set(attempt.sourcePdfSha256, attempt);
  }
  const entries = documents.map((document) => {
    assertSha256(document?.sourcePdfSha256);
    const state = stateByHash.get(document.sourcePdfSha256)
      ?? { sourcePdfSha256: document.sourcePdfSha256, status: 'missing' };
    const attempt = attemptByHash.get(document.sourcePdfSha256) ?? {};
    const status = state.status === 'missing' && attempt.status === 'failed' ? 'failed' : state.status;
    return {
      sourcePdfSha256: document.sourcePdfSha256,
      byteSize: document.byteSize,
      paths: [...document.paths].sort(),
      status,
      attempts: Number.isSafeInteger(attempt.attempts) && attempt.attempts >= 0 ? attempt.attempts : 0,
      ...(state.parserVersion ? { parserVersion: state.parserVersion } : {}),
      ...(state.modelRevision ? { modelRevision: state.modelRevision } : {}),
      ...(state.derivedArtifact ? { derivedArtifact: structuredClone(state.derivedArtifact) } : {}),
      ...(state.processing ? { processing: structuredClone(state.processing) } : {}),
      ...(attempt.lastError ? { lastError: boundedDiagnostic(attempt.lastError) } : {}),
      ...(attempt.lastAttemptedAt ? { lastAttemptedAt: String(attempt.lastAttemptedAt) } : {}),
    };
  }).sort((left, right) => left.sourcePdfSha256.localeCompare(right.sourcePdfSha256));
  const physicalValidFiles = entries.reduce((sum, entry) => sum + entry.paths.length, 0);
  const count = (status) => entries.filter((entry) => entry.status === status).length;
  const indexed = count('indexed');
  return {
    schemaVersion: 1,
    generatedAt,
    parserVersion: input.parserVersion,
    modelRevision: input.modelRevision,
    summary: {
      physicalFiles: physicalValidFiles + invalidFiles.length,
      uniqueDocuments: entries.length,
      duplicatePhysicalFiles: physicalValidFiles - entries.length,
      indexed,
      missing: count('missing'),
      stale: count('stale'),
      failed: count('failed'),
      invalidFiles: invalidFiles.length,
      coveragePercent: entries.length === 0 ? 0 : Number(((indexed / entries.length) * 100).toFixed(1)),
    },
    invalidFiles: invalidFiles.map((entry) => ({
      relativePath: String(entry.relativePath ?? ''),
      error: String(entry.error ?? 'invalid PDF'),
    })).sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
    entries,
  };
}

export function selectHistoricalMineruBackfill(entries, options = {}) {
  if (!Array.isArray(entries)) throw new TypeError('backfill entries must be an array');
  const maximumAttempts = options.maximumAttempts ?? 3;
  if (!Number.isSafeInteger(maximumAttempts) || maximumAttempts < 1) {
    throw new TypeError('maximum attempts must be a positive safe integer');
  }
  const limit = options.limit ?? entries.length;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError('limit must be a positive safe integer');
  const targetHash = options.sha256 ?? null;
  if (targetHash) {
    assertSha256(targetHash, 'backfill SHA-256');
    if (!entries.some((entry) => entry.sourcePdfSha256 === targetHash)) {
      throw new Error(`backfill SHA-256 not found: ${targetHash}`);
    }
  }
  return entries
    .filter((entry) => !targetHash || entry.sourcePdfSha256 === targetHash)
    .filter((entry) => ['missing', 'stale', 'failed'].includes(entry.status))
    .filter((entry) => (entry.attempts ?? 0) < maximumAttempts)
    .sort((left, right) => left.sourcePdfSha256.localeCompare(right.sourcePdfSha256))
    .slice(0, limit);
}
