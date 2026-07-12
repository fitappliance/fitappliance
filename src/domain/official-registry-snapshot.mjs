import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { parse } from 'csv-parse/sync';

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freezeDeep(item);
  }
  return value;
}

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} is required`);
  return value.trim();
}

function httpsUrl(value, label) {
  const url = new URL(requiredString(value, label));
  if (url.protocol !== 'https:') throw new TypeError(`${label} must use HTTPS`);
  return url.toString();
}

function normalizeBytes(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof Uint8Array) return Buffer.from(bytes);
  if (typeof bytes === 'string') return Buffer.from(bytes);
  throw new TypeError('registry snapshot bytes are required');
}

function validateLicence(licence) {
  if (!licence || typeof licence !== 'object') throw new TypeError('registry licence is required');
  const normalized = {
    id: requiredString(licence.id, 'licence.id'),
    name: requiredString(licence.name, 'licence.name'),
    url: httpsUrl(licence.url, 'licence.url'),
    attribution: requiredString(licence.attribution, 'licence.attribution'),
    permitsRepositoryDerivatives: licence.permitsRepositoryDerivatives === true,
    scopeNote: licence.scopeNote ? requiredString(licence.scopeNote, 'licence.scopeNote') : null,
  };
  if (!normalized.permitsRepositoryDerivatives) {
    throw new TypeError('licence must explicitly permit repository derivatives');
  }
  return normalized;
}

function extensionFor(mediaType, sourceUrl) {
  if (mediaType === 'text/csv') return '.csv';
  if (/spreadsheet|excel|officedocument/i.test(mediaType)) return '.xlsx';
  const extension = extname(new URL(sourceUrl).pathname).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : '.bin';
}

export function createRegistrySnapshotManifest({
  sourceId,
  sourceUrl,
  retrievedAt,
  mediaType,
  bytes,
  licence,
  metadataSha256 = null,
}) {
  const payload = normalizeBytes(bytes);
  const hash = createHash('sha256').update(payload).digest('hex');
  const timestamp = new Date(requiredString(retrievedAt, 'retrievedAt'));
  if (Number.isNaN(timestamp.getTime())) throw new TypeError('retrievedAt must be an ISO timestamp');
  if (metadataSha256 !== null && !/^[a-f0-9]{64}$/.test(metadataSha256)) {
    throw new TypeError('metadataSha256 must be a SHA-256 hash or null');
  }
  const normalizedSourceUrl = httpsUrl(sourceUrl, 'sourceUrl');
  const normalizedMediaType = requiredString(mediaType, 'mediaType').toLowerCase().split(';')[0];
  const objectPath = `registries/objects/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}${extensionFor(normalizedMediaType, normalizedSourceUrl)}`;
  return freezeDeep({
    schemaVersion: 1,
    sourceId: requiredString(sourceId, 'sourceId'),
    sourceUrl: normalizedSourceUrl,
    retrievedAt: timestamp.toISOString(),
    contentSha256: hash,
    metadataSha256,
    byteLength: payload.length,
    mediaType: normalizedMediaType,
    licence: validateLicence(licence),
    storage: {
      rootEnv: 'FITAPPLIANCE_STORAGE_ROOT',
      objectPath,
    },
  });
}

export function verifyRegistrySnapshot(manifest, bytes) {
  if (!manifest || typeof manifest !== 'object') throw new TypeError('registry snapshot manifest is required');
  const payload = normalizeBytes(bytes);
  if (payload.length !== manifest.byteLength) throw new Error('registry snapshot byte length mismatch');
  const hash = createHash('sha256').update(payload).digest('hex');
  if (hash !== manifest.contentSha256) throw new Error('registry snapshot hash mismatch');
  const expectedPath = new RegExp(`^registries/objects/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}\\.[a-z0-9]{1,8}$`);
  if (!expectedPath.test(String(manifest.storage?.objectPath ?? ''))) {
    throw new Error('registry snapshot object path is not content addressed');
  }
  validateLicence(manifest.licence);
  return freezeDeep({ valid: true, contentSha256: hash, byteLength: payload.length });
}

export function parseRegistryCsv(input) {
  const text = normalizeBytes(input).toString('utf8');
  let records;
  try {
    records = parse(text, {
      bom: true,
      columns: true,
      info: true,
      skip_empty_lines: true,
      relax_column_count: false,
      relax_quotes: false,
      trim: true,
    });
  } catch (error) {
    throw new Error(`registry CSV parse failed: ${error.message}`, { cause: error });
  }
  return records.map(({ record, info }, index) => freezeDeep({
    record,
    sourceLine: Number.isInteger(info?.lines) ? info.lines : index + 2,
  }));
}
