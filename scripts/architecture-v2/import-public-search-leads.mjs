import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TextDecoder } from 'node:util';

import {
  createPublicSearchLead,
  publicSearchSha256,
} from '../../src/domain/public-search-lead.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export class PublicSearchCheckpointError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PublicSearchCheckpointError';
    this.code = code;
  }
}

function bytesSha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function safeId(value, label) {
  const normalized = String(value ?? '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized)) {
    throw new TypeError(`${label} must be a safe identifier`);
  }
  return normalized;
}

function timestamp(value, label) {
  const normalized = String(value ?? '').trim();
  if (!RFC3339_UTC.test(normalized) || !Number.isFinite(Date.parse(normalized))) {
    throw new TypeError(`${label} must be RFC 3339 UTC`);
  }
  return new Date(normalized).toISOString();
}

function packetSemantic(packet) {
  return {
    schemaVersion: packet.schemaVersion,
    activeReleaseId: packet.activeReleaseId,
    activeReleaseSha256: packet.activeReleaseSha256,
    targets: packet.targets,
    queries: packet.queries,
  };
}

function validatePacketAndQuery(packet, query) {
  if (!packet || packet.schemaVersion !== 1 || !Array.isArray(packet.targets)
    || !Array.isArray(packet.queries) || !SHA256.test(packet.semanticPacketSha256 ?? '')) {
    throw new TypeError('public search packet schema v1 required');
  }
  if (publicSearchSha256(packetSemantic(packet)) !== packet.semanticPacketSha256) {
    throw new Error('public search packet semantic hash mismatch');
  }
  const bound = packet.queries.find((candidate) => candidate.queryId === query?.queryId);
  if (!bound || JSON.stringify(bound) !== JSON.stringify(query)) {
    throw new Error('query is not exactly bound by the public search packet');
  }
  const { queryId, querySha256, ...semantic } = query;
  if (queryId !== `public_search_query_${querySha256.slice(0, 24)}`
    || publicSearchSha256(semantic) !== querySha256) {
    throw new Error('public search query hash mismatch');
  }
  return query;
}

export function publicSearchCheckpointPaths({
  storageRoot,
  runId,
  queryId,
  responseObjectSha256 = null,
}) {
  const rootValue = String(storageRoot ?? '').trim();
  if (!rootValue) throw new TypeError('storage root required');
  const root = resolve(rootValue);
  const run = safeId(runId, 'run ID');
  const query = safeId(queryId, 'query ID');
  const pointerPath = join(
    root,
    'evidence/discovery/public-search/runs',
    run,
    'queries',
    `${query}.json`,
  );
  if (responseObjectSha256 === null) return { pointerPath };
  const hash = String(responseObjectSha256).toLowerCase();
  if (!SHA256.test(hash)) throw new TypeError('response object SHA-256 required');
  const objectRelativePath = `evidence/discovery/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.json`;
  return {
    pointerPath,
    objectPath: join(root, objectRelativePath),
    objectRelativePath,
  };
}

async function readJson(path, code) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') throw new PublicSearchCheckpointError(code, `missing checkpoint file: ${path}`);
    throw new PublicSearchCheckpointError('CHECKPOINT_JSON_INVALID', `invalid checkpoint JSON: ${path}`);
  }
}

function pointerSemantic(pointer) {
  const { pointerSha256, ...semantic } = pointer;
  return semantic;
}

function validatePointer(pointer, { runId, packet, query }) {
  const expectedKeys = [
    'schemaVersion', 'runId', 'packetSha256', 'queryId', 'querySha256',
    'responseObjectSha256', 'responseObjectPath', 'responseByteSize', 'capturedAt',
    'pointerSha256',
  ];
  if (!pointer || typeof pointer !== 'object' || Array.isArray(pointer)
    || JSON.stringify(Object.keys(pointer).sort()) !== JSON.stringify([...expectedKeys].sort())) {
    throw new PublicSearchCheckpointError('QUERY_POINTER_INVALID', 'query pointer shape invalid');
  }
  if (pointer.schemaVersion !== 1
    || pointer.runId !== runId
    || pointer.packetSha256 !== packet.semanticPacketSha256
    || pointer.queryId !== query.queryId
    || pointer.querySha256 !== query.querySha256
    || !SHA256.test(pointer.responseObjectSha256)
    || !Number.isInteger(pointer.responseByteSize)
    || pointer.responseByteSize < 1
    || timestamp(pointer.capturedAt, 'pointer capture time') !== pointer.capturedAt) {
    throw new PublicSearchCheckpointError('QUERY_POINTER_BINDING_MISMATCH', 'query pointer binding invalid');
  }
  if (publicSearchSha256(pointerSemantic(pointer)) !== pointer.pointerSha256) {
    throw new PublicSearchCheckpointError('QUERY_POINTER_HASH_MISMATCH', 'query pointer hash mismatch');
  }
  return pointer;
}

async function atomicWrite(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
}

export async function verifyPublicSearchResponseCheckpoint({ storageRoot, runId, packet, query }) {
  validatePacketAndQuery(packet, query);
  const safeRunId = safeId(runId, 'run ID');
  const { pointerPath } = publicSearchCheckpointPaths({
    storageRoot, runId: safeRunId, queryId: query.queryId,
  });
  const pointer = validatePointer(
    await readJson(pointerPath, 'QUERY_POINTER_MISSING'),
    { runId: safeRunId, packet, query },
  );
  const paths = publicSearchCheckpointPaths({
    storageRoot,
    runId: safeRunId,
    queryId: query.queryId,
    responseObjectSha256: pointer.responseObjectSha256,
  });
  if (pointer.responseObjectPath !== paths.objectRelativePath) {
    throw new PublicSearchCheckpointError('RESPONSE_OBJECT_PATH_MISMATCH', 'response object path mismatch');
  }
  let rawResponseBytes;
  try {
    rawResponseBytes = await readFile(paths.objectPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new PublicSearchCheckpointError('RESPONSE_OBJECT_MISSING', 'response object missing');
    }
    throw error;
  }
  if (rawResponseBytes.length !== pointer.responseByteSize) {
    throw new PublicSearchCheckpointError('RESPONSE_OBJECT_SIZE_MISMATCH', 'response object size mismatch');
  }
  if (bytesSha256(rawResponseBytes) !== pointer.responseObjectSha256) {
    throw new PublicSearchCheckpointError('RESPONSE_OBJECT_HASH_MISMATCH', 'response object hash mismatch');
  }
  return { pointer, rawResponseBytes, paths };
}

export async function checkpointPublicSearchResponse({
  storageRoot,
  runId,
  packet,
  query,
  rawResponseBytes,
  capturedAt,
}) {
  validatePacketAndQuery(packet, query);
  const safeRunId = safeId(runId, 'run ID');
  const bytes = Buffer.isBuffer(rawResponseBytes)
    ? rawResponseBytes
    : Buffer.from(rawResponseBytes ?? '');
  if (bytes.length === 0) throw new TypeError('raw response bytes required');
  const normalizedCapturedAt = timestamp(capturedAt, 'capture time');

  const responseObjectSha256 = bytesSha256(bytes);
  const paths = publicSearchCheckpointPaths({
    storageRoot, runId: safeRunId, queryId: query.queryId, responseObjectSha256,
  });
  try {
    const verified = await verifyPublicSearchResponseCheckpoint({
      storageRoot, runId: safeRunId, packet, query,
    });
    if (verified.pointer.responseObjectSha256 !== responseObjectSha256
      || !verified.rawResponseBytes.equals(bytes)) {
      throw new PublicSearchCheckpointError('QUERY_POINTER_ALREADY_BOUND', 'query pointer binds different response bytes');
    }
    return { status: 'RESUMED_VERIFIED', ...verified };
  } catch (error) {
    if (error?.code !== 'QUERY_POINTER_MISSING') throw error;
  }

  await mkdir(dirname(paths.objectPath), { recursive: true });
  try {
    const existing = await readFile(paths.objectPath);
    if (!existing.equals(bytes)) {
      throw new PublicSearchCheckpointError('RESPONSE_OBJECT_COLLISION', 'content-addressed response object collision');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await atomicWrite(paths.objectPath, bytes);
  }
  const semanticPointer = {
    schemaVersion: 1,
    runId: safeRunId,
    packetSha256: packet.semanticPacketSha256,
    queryId: query.queryId,
    querySha256: query.querySha256,
    responseObjectSha256,
    responseObjectPath: paths.objectRelativePath,
    responseByteSize: bytes.length,
    capturedAt: normalizedCapturedAt,
  };
  const pointer = {
    ...semanticPointer,
    pointerSha256: publicSearchSha256(semanticPointer),
  };
  await atomicWrite(paths.pointerPath, `${JSON.stringify(pointer, null, 2)}\n`);
  const verified = await verifyPublicSearchResponseCheckpoint({
    storageRoot, runId: safeRunId, packet, query,
  });
  return { status: 'CAPTURED_VERIFIED', ...verified };
}

function normalizeRawResult(row, index) {
  const malformed = !row || typeof row !== 'object' || Array.isArray(row)
    || !Number.isInteger(row.rank) || row.rank < 1
    || typeof row.title !== 'string' || !row.title.trim()
    || typeof row.url !== 'string' || !row.url.trim()
    || typeof row.snippet !== 'string' || !row.snippet.trim();
  const field = (value, placeholder) => typeof value === 'string' && value.trim()
    ? value
    : placeholder;
  return {
    result: {
      rank: Number.isInteger(row?.rank) && row.rank > 0 ? row.rank : index + 1,
      title: field(row?.title, '[missing title]'),
      url: field(row?.url, '[missing URL]'),
      snippet: field(row?.snippet, '[missing snippet]'),
    },
    malformed,
  };
}

function parseAnySearchMarkdown(text) {
  const lines = text.split('\n').map((line) => line.endsWith('\r') ? line.slice(0, -1) : line);
  const header = /^## Search Results \((\d+) results, (\d+)ms\)$/.exec(lines[0] ?? '');
  if (!header) {
    throw new PublicSearchCheckpointError(
      'RESPONSE_ENVELOPE_UNSUPPORTED',
      'verified response is neither direct results JSON nor the AnySearch search envelope',
    );
  }
  const declaredCount = Number(header[1]);
  let index = 1;
  const rows = [];
  while (index < lines.length && lines[index] === '') index += 1;

  while (index < lines.length) {
    const heading = /^### (\d+)\.(?: (.*))?$/.exec(lines[index]);
    if (!heading) {
      throw new PublicSearchCheckpointError(
        'RESPONSE_MARKDOWN_STRUCTURE_INVALID',
        'AnySearch response contains an unexpected structure',
      );
    }
    const rank = Number(heading[1]);
    if (rank !== rows.length + 1) {
      throw new PublicSearchCheckpointError(
        'RESPONSE_MARKDOWN_RANK_INVALID',
        'AnySearch result ranks must be unique and contiguous from one',
      );
    }
    const row = { rank, title: heading[2] ?? '' };
    index += 1;

    const url = /^- \*\*URL\*\*:(?: (.*))?$/.exec(lines[index] ?? '');
    if (url) {
      row.url = url[1] ?? '';
      index += 1;
    }
    const snippet = /^- (?!\*\*URL\*\*:)(.*)$/.exec(lines[index] ?? '');
    if (snippet) {
      row.snippet = snippet[1];
      index += 1;
    }
    rows.push(row);

    if (index < lines.length && lines[index] !== '') {
      throw new PublicSearchCheckpointError(
        'RESPONSE_MARKDOWN_STRUCTURE_INVALID',
        'AnySearch result contains unexpected additional content',
      );
    }
    while (index < lines.length && lines[index] === '') index += 1;
  }

  if (rows.length !== declaredCount) {
    throw new PublicSearchCheckpointError(
      'RESPONSE_MARKDOWN_COUNT_MISMATCH',
      'AnySearch declared result count does not match parsed results',
    );
  }
  return rows;
}

function decodeResponseRows(bytes) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new PublicSearchCheckpointError(
      'RESPONSE_ENVELOPE_UNSUPPORTED',
      'verified response is not valid UTF-8',
    );
  }
  let response;
  try {
    response = JSON.parse(text);
  } catch {
    return parseAnySearchMarkdown(text);
  }
  if (!response || typeof response !== 'object' || Array.isArray(response)
    || !Array.isArray(response.results)) {
    throw new PublicSearchCheckpointError(
      'RESPONSE_ENVELOPE_UNSUPPORTED',
      'verified JSON response must contain a results array',
    );
  }
  return response.results;
}

export async function importPublicSearchLeadsFromCheckpoint({ storageRoot, runId, packet, query }) {
  const verified = await verifyPublicSearchResponseCheckpoint({ storageRoot, runId, packet, query });
  const target = packet.targets.find((candidate) => candidate.targetId === query.targetId);
  if (!target) throw new Error('query target missing from packet');
  const rows = decodeResponseRows(verified.rawResponseBytes).map(normalizeRawResult);
  const rankCounts = new Map();
  for (const row of rows) rankCounts.set(row.result.rank, (rankCounts.get(row.result.rank) ?? 0) + 1);
  const overLimit = rows.length > query.resultLimit;
  const leads = rows.map((row) => {
    let forcedReasonCode = null;
    if (overLimit) forcedReasonCode = 'RESULT_SET_LIMIT_EXCEEDED';
    else if (rankCounts.get(row.result.rank) > 1) forcedReasonCode = 'DUPLICATE_RESULT_RANK';
    else if (row.malformed) forcedReasonCode = 'MALFORMED_RESULT';
    return createPublicSearchLead({
      target: {
        targetId: target.targetId,
        referenceId: target.referenceId,
        category: target.category,
        brand: target.brand,
        exactModel: target.exactModel,
        lifecycleState: target.lifecycleState,
        activeReleaseId: target.activeReleaseId,
        activeReleaseSha256: target.activeReleaseSha256,
      },
      query: { queryId: query.queryId, querySha256: query.querySha256 },
      result: row.result,
      capture: {
        objectSha256: verified.pointer.responseObjectSha256,
        objectPath: verified.pointer.responseObjectPath,
        byteSize: verified.pointer.responseByteSize,
      },
    }, { forcedReasonCode });
  });
  return {
    schemaVersion: 1,
    packetSha256: packet.semanticPacketSha256,
    queryId: query.queryId,
    captureObjectSha256: verified.pointer.responseObjectSha256,
    leads,
    summary: {
      results: leads.length,
      unvalidated: leads.filter((lead) => lead.state.status === 'UNVALIDATED').length,
      rejected: leads.filter((lead) => lead.state.status === 'REJECTED').length,
    },
  };
}

function parseArgs(argv) {
  const allowed = new Set([
    '--packet', '--query-id', '--response', '--storage-root', '--run-id', '--captured-at', '--output',
  ]);
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(flag) || !value) throw new TypeError('explicit public-search import arguments required');
    options[flag.slice(2)] = value;
  }
  for (const name of ['packet', 'query-id', 'response', 'storage-root', 'run-id', 'captured-at', 'output']) {
    if (!options[name]) throw new TypeError(`--${name} required`);
  }
  return options;
}

export async function runCli(argv = process.argv.slice(2), { stdin = process.stdin } = {}) {
  return runCliWithIo(argv, { stdin });
}

async function readStreamBytes(stream) {
  if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
    throw new TypeError('stdin must be an async readable stream');
  }
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function runCliWithIo(argv = process.argv.slice(2), { stdin = process.stdin } = {}) {
  const options = parseArgs(argv);
  const packet = JSON.parse(await readFile(resolve(options.packet), 'utf8'));
  const query = packet.queries.find((candidate) => candidate.queryId === options['query-id']);
  if (!query) throw new Error('query ID absent from packet');
  const rawResponseBytes = options.response === '-'
    ? await readStreamBytes(stdin)
    : await readFile(resolve(options.response));
  await checkpointPublicSearchResponse({
    storageRoot: options['storage-root'],
    runId: options['run-id'],
    packet,
    query,
    rawResponseBytes,
    capturedAt: options['captured-at'],
  });
  const imported = await importPublicSearchLeadsFromCheckpoint({
    storageRoot: options['storage-root'], runId: options['run-id'], packet, query,
  });
  const output = resolve(options.output);
  await atomicWrite(output, `${JSON.stringify(imported, null, 2)}\n`);
  return imported;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli();
}
