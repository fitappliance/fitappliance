import { constants } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { verifyRegistrySnapshot } from './official-registry-snapshot.mjs';
import { parseRegistryCsv } from './official-registry-snapshot.mjs';

const RESOURCE_PATTERNS = Object.freeze({
  fridge: /(?:fridges?\s+and\s+freezers?|\brf_\d{4}_\d{2}_\d{2}\.csv)/i,
  dishwasher: /(?:dishwashers?|\bdw_\d{4}_\d{2}_\d{2}\.csv)/i,
  dryer: /(?:clothes\s+dryers?|\bcd_\d{4}_\d{2}_\d{2}\.csv)/i,
  washing_machine: /(?:clothes\s+washers?|\bcw_\d{4}_\d{2}_\d{2}\.csv)/i,
});

function httpsWithAllowedHost(value, allowedHosts, label) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new TypeError(`${label} must use HTTPS`);
  if (!allowedHosts.includes(url.hostname)) throw new TypeError(`${label} host is not allowed: ${url.hostname}`);
  return url;
}

export function selectEnergyRatingResources(metadata, categories = ['fridge', 'dishwasher']) {
  const resources = metadata?.result?.resources;
  if (!Array.isArray(resources)) throw new TypeError('Energy Rating metadata is missing resources');
  const selected = {};
  for (const category of categories) {
    const pattern = RESOURCE_PATTERNS[category];
    if (!pattern) throw new TypeError(`unsupported Energy Rating category: ${category}`);
    const matches = resources.filter((resource) => {
      const text = `${resource.name ?? ''} ${resource.url ?? ''}`;
      return pattern.test(text) && (/csv/i.test(resource.format ?? '') || /\.csv(?:\?|$)/i.test(resource.url ?? ''));
    }).sort((left, right) => {
      const modified = new Date(right.last_modified ?? 0).getTime() - new Date(left.last_modified ?? 0).getTime();
      if (modified !== 0) return modified;
      return String(right.name ?? '').localeCompare(String(left.name ?? ''));
    });
    if (matches.length === 0 || !matches[0].url) throw new Error(`Energy Rating ${category} CSV resource not found`);
    selected[category] = {
      name: matches[0].name ?? category,
      url: matches[0].url,
      lastModified: matches[0].last_modified ?? null,
      resourceId: matches[0].id ?? null,
    };
  }
  return Object.freeze(selected);
}

export async function fetchRegistryBytes({
  url,
  allowedHosts,
  fetchFn = fetch,
  maxBytes = 50 * 1024 * 1024,
  timeoutMs = 30_000,
  attempts = 3,
  sleepFn = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
}) {
  const requested = httpsWithAllowedHost(url, allowedHosts, 'registry URL');
  let response;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      response = await fetchFn(requested, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      if (attempt === attempts) throw new Error(`registry fetch failed after ${attempts} attempts: ${error.message}`, { cause: error });
      await sleepFn(250 * (2 ** (attempt - 1)));
      continue;
    }
    if (response.ok || (response.status !== 429 && response.status < 500)) break;
    if (attempt === attempts) break;
    await sleepFn(250 * (2 ** (attempt - 1)));
  }
  if (!response.ok) throw new Error(`registry fetch failed with HTTP ${response.status}`);
  const finalUrl = httpsWithAllowedHost(response.url || requested.toString(), allowedHosts, 'registry redirect');
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error(`registry payload exceeds size limit (${contentLength} bytes)`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error('registry payload is empty');
  if (bytes.length > maxBytes) throw new Error(`registry payload exceeds size limit (${bytes.length} bytes)`);
  return Object.freeze({
    bytes,
    finalUrl: finalUrl.toString(),
    mediaType: String(response.headers.get('content-type') ?? 'application/octet-stream').split(';')[0].toLowerCase(),
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
  });
}

export function validateRegistryCsvPayload(bytes, { requiredHeaders }) {
  const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const prefix = payload.subarray(0, 512).toString('utf8');
  if (/^\s*(?:<!doctype\s+html|<html\b)/i.test(prefix)) throw new Error('registry CSV payload is HTML');
  const rows = parseRegistryCsv(payload);
  if (rows.length === 0) throw new Error('registry CSV payload contains no data rows');
  const headers = new Set(Object.keys(rows[0].record));
  for (const header of requiredHeaders) if (!headers.has(header)) throw new Error(`registry CSV missing required header: ${header}`);
  return Object.freeze({ rows: rows.length, headers: [...headers] });
}

function withinStorage(storageRoot, objectPath) {
  const root = resolve(storageRoot);
  const path = resolve(root, ...String(objectPath ?? '').split('/'));
  if (!path.startsWith(`${root}${sep}`)) throw new TypeError('registry object path escapes storage root');
  return path;
}

export async function persistRegistrySnapshot({ manifest, bytes, storageRoot }) {
  const absolutePath = withinStorage(storageRoot, manifest.storage?.objectPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  let created = false;
  try {
    await writeFile(absolutePath, bytes, { flag: 'wx' });
    created = true;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  await access(absolutePath, constants.R_OK);
  verifyRegistrySnapshot(manifest, await readFile(absolutePath));
  return Object.freeze({ created, absolutePath, objectPath: manifest.storage.objectPath });
}
