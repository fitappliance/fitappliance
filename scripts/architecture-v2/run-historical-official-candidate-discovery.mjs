#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { validateEvidenceSourceResolverResult } from '../../src/domain/evidence-source-adapter-contract.mjs';
import { resolveHistoricalEvidenceBoundedManifest } from '../../src/domain/historical-evidence-bounded-batch.mjs';
import {
  createEvidenceObjectStore,
  verifyEvidenceStorageRoot,
} from '../../src/domain/evidence-recovery-state-store.mjs';
import { buildHistoricalOfficialCandidateManifest } from '../../src/domain/historical-official-candidate-manifest.mjs';
import { recoveryCandidateResolversForTarget } from './run-historical-evidence-recovery.mjs';

const execFile = promisify(execFileCallback);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CORE_RESOLVER_ID = 'architecture-v2-core-official-discovery';
const MAXIMUM_TARGETS = 25;

function requiredText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new TypeError(`${label} must be a positive integer`);
  return number;
}

function optionValue(argv, index, inline, label) {
  const value = inline ?? argv[index + 1];
  return requiredText(value, label);
}

export function parseHistoricalOfficialCandidateDiscoveryArgs(argv) {
  const result = {
    manifestId: null,
    manifestInput: null,
    runId: null,
    storageRoot: null,
    input: null,
    output: null,
    networkConcurrency: 2,
    resolverTimeoutMs: 30_000,
  };
  const prohibitedSelectionFlags = new Set(['--brand', '--category', '--reference-id', '--limit']);
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const separator = raw.indexOf('=');
    const flag = separator < 0 ? raw : raw.slice(0, separator);
    const inline = separator < 0 ? null : raw.slice(separator + 1);
    if (prohibitedSelectionFlags.has(flag)) {
      throw new TypeError(`${flag} is prohibited; use a tracked --manifest-id`);
    }
    if (['--manifest-id', '--manifest-input', '--run-id', '--storage-root', '--input', '--output'].includes(flag)) {
      const value = optionValue(argv, index, inline, flag);
      if (separator < 0) index += 1;
      const key = {
        '--manifest-id': 'manifestId',
        '--manifest-input': 'manifestInput',
        '--run-id': 'runId',
        '--storage-root': 'storageRoot',
        '--input': 'input',
        '--output': 'output',
      }[flag];
      result[key] = value;
      continue;
    }
    if (['--network-concurrency', '--resolver-timeout-ms'].includes(flag)) {
      const number = positiveInteger(optionValue(argv, index, inline, flag), flag);
      if (separator < 0) index += 1;
      if (flag === '--network-concurrency') result.networkConcurrency = number;
      if (flag === '--resolver-timeout-ms') result.resolverTimeoutMs = number;
      continue;
    }
    throw new TypeError(`unknown argument: ${raw}`);
  }
  if (!result.manifestId) throw new TypeError('--manifest-id required');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(result.manifestId)) {
    throw new TypeError('manifest ID must be a safe value');
  }
  if (result.networkConcurrency > 4) throw new TypeError('network concurrency exceeds maximum 4');
  if (result.resolverTimeoutMs > 120_000) throw new TypeError('resolver timeout exceeds maximum 120000ms');
  if (result.runId && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(result.runId)) {
    throw new TypeError('run ID must be a safe path segment');
  }
  return result;
}

function normalizedIdentity(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function selectHistoricalOfficialCandidateTargets(acquisitionQueue, options) {
  if (acquisitionQueue?.schemaVersion !== 1 || !Array.isArray(acquisitionQueue.records)) {
    throw new TypeError('historical acquisition queue schema v1 required');
  }
  const requestedReferences = new Set(options.referenceIds ?? []);
  const selected = acquisitionQueue.records.filter((record) => {
    if (requestedReferences.size && !requestedReferences.has(record.referenceId)) return false;
    if (options.brand && normalizedIdentity(record.brand) !== normalizedIdentity(options.brand)) return false;
    if (options.category && normalizedIdentity(record.category) !== normalizedIdentity(options.category)) return false;
    return true;
  });
  for (const referenceId of requestedReferences) {
    if (!selected.some((record) => record.referenceId === referenceId)) {
      throw new TypeError(`selected reference is not in the acquisition queue: ${referenceId}`);
    }
  }
  const runnable = selected.filter((record) => Array.isArray(record.resolverIds) && record.resolverIds.length > 0);
  if (requestedReferences.size && runnable.length !== selected.length) {
    const blocked = selected.filter((record) => !record.resolverIds?.length).map((record) => record.referenceId);
    throw new TypeError(`selected reference has no bounded resolver contract: ${blocked.join(', ')}`);
  }
  const bounded = runnable.slice(0, options.limit);
  if (!bounded.length) throw new TypeError('selection produced no bounded discovery targets');
  return structuredClone(bounded);
}

function resolverOptions(objectStore) {
  const finderOptions = { writeObject: objectStore.writeObject };
  return {
    bosch: { finderOptions },
    beko: { finderOptions },
    haier: { finderOptions },
    asko: { finderOptions },
    esatto: { finderOptions },
    inalto: { finderOptions },
    fisherPaykel: { finderOptions },
  };
}

function resolversForRecord(record, options = {}) {
  if (!record.resolverIds?.length) return [];
  const declared = new Set(record.resolverIds);
  const resolvers = recoveryCandidateResolversForTarget(record, {
    resolverOptions: options.resolverOptions ?? {},
  });
  const specializedPresent = resolvers.some((resolver) => resolver.resolverId !== CORE_RESOLVER_ID);
  const selected = resolvers.filter((resolver) => declared.has(resolver.resolverId)
    || (resolver.resolverId === CORE_RESOLVER_ID && specializedPresent));
  for (const resolverId of declared) {
    if (!selected.some((resolver) => resolver.resolverId === resolverId)) {
      throw new Error(`declared resolver is unavailable: ${record.referenceId} ${resolverId}`);
    }
  }
  return selected;
}

export function historicalOfficialResolverContracts(acquisitionQueue) {
  if (acquisitionQueue?.schemaVersion !== 1 || !Array.isArray(acquisitionQueue.records)) {
    throw new TypeError('historical acquisition queue schema v1 required');
  }
  return new Map(acquisitionQueue.records.map((record) => [
    record.referenceId,
    resolversForRecord(record).map(({
      schemaVersion, resolverId, version, scope, required, sourceLanes,
    }) => ({
      schemaVersion: schemaVersion ?? 1,
      resolverId,
      version,
      scope,
      required,
      ...(sourceLanes ? { sourceLanes: structuredClone(sourceLanes) } : {}),
    })),
  ]));
}

function retryableResolverResult(resolver, code, message) {
  const schemaVersion = resolver.schemaVersion ?? 1;
  if (schemaVersion === 2) {
    return {
      schemaVersion: 2,
      resolverId: resolver.resolverId,
      version: resolver.version,
      scope: resolver.scope,
      required: resolver.required,
      completion: 'retryable',
      sourceLanes: resolver.sourceLanes.map((lane) => ({
        ...lane,
        status: lane.supported ? 'retryable' : 'unsupported',
        candidateCount: 0,
        provenance: [],
        reason: lane.supported ? message : 'Lane is not supported by this resolver.',
      })),
      candidates: [],
      failures: [{ code, message }],
    };
  }
  return {
    schemaVersion: 1,
    resolverId: resolver.resolverId,
    version: resolver.version,
    scope: resolver.scope,
    required: resolver.required,
    completion: code === 'resolver_timeout' ? 'timed_out' : 'failed',
    candidates: [],
    failures: [{ code, message }],
  };
}

async function resolveWithTimeout(resolver, target, timeoutMs) {
  let timer;
  try {
    const outcome = await Promise.race([
      Promise.resolve().then(() => resolver.resolve(structuredClone(target))),
      new Promise((resolveTimeout) => {
        timer = setTimeout(() => resolveTimeout(Symbol.for('candidate_discovery_timeout')), timeoutMs);
      }),
    ]);
    if (outcome === Symbol.for('candidate_discovery_timeout')) {
      return validateEvidenceSourceResolverResult(retryableResolverResult(
        resolver,
        'resolver_timeout',
        `resolver exceeded ${timeoutMs}ms`,
      ));
    }
    return validateEvidenceSourceResolverResult(outcome);
  } catch (error) {
    return validateEvidenceSourceResolverResult(retryableResolverResult(
      resolver,
      'resolver_failed',
      String(error?.message ?? error),
    ));
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function mapLimit(values, maximum, worker) {
  const output = new Array(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(maximum, values.length) }, run));
  return output;
}

function caseRecordFor(record, acquisitionQueue) {
  const sourcesById = new Map(acquisitionQueue.sources.map((source) => [source.sourceId, source]));
  const sources = (record.candidateSourceIds ?? []).map((sourceId) => {
    const source = sourcesById.get(sourceId);
    if (!source) throw new Error(`acquisition source missing: ${sourceId}`);
    return { sourceUrl: source.sourceUrl, finalUrl: source.sourceUrl };
  });
  return {
    id: record.acquisitionId,
    referenceId: record.referenceId,
    brand: record.brand,
    model: record.model,
    category: record.category,
    sources,
    reconciliationContext: {},
  };
}

async function mountedVolumeUuid(path) {
  const { stdout: dfOutput } = await execFile('df', ['-P', path], {
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  });
  const device = dfOutput.trim().split('\n').at(-1)?.trim().split(/\s+/)[0];
  if (!device) throw new Error('df did not report the storage device');
  const { stdout } = await execFile('diskutil', ['info', device], {
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  });
  const value = /^\s*Volume UUID:\s*(\S+)\s*$/im.exec(stdout)?.[1];
  if (!value) throw new Error('diskutil did not report a mounted volume UUID');
  return value;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readOptionalJson(path, fallback) {
  try { return await readJson(path); } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

function discoveryObjectPath(hash) {
  return `evidence/discovery/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.json`;
}

function discoveryRunPointerPath(runId) {
  return `evidence/discovery/runs/${runId}.json`;
}

function selectionFor(options, selected, boundedManifest) {
  return {
    manifestId: boundedManifest.manifestId,
    semanticManifestSha256: boundedManifest.semanticManifestSha256,
    selectedReferenceIds: selected.map((record) => record.referenceId),
  };
}

async function readOptionalObject(objectStore, path) {
  try {
    return await objectStore.readObject(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function verifySourceLaneProvenanceObjects(objectStore, resolverOutcomes) {
  const verified = new Set();
  async function verifyObject({ objectPath, contentSha256, byteSize }, label) {
    const key = `${objectPath}\0${contentSha256}\0${byteSize}`;
    if (verified.has(key)) return;
    let bytes;
    try {
      bytes = await objectStore.readObject(objectPath);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw new Error(`${label} object is missing: ${objectPath}`);
      }
      throw error;
    }
    const actualSha256 = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== byteSize || actualSha256 !== contentSha256) {
      throw new Error(`${label} object binding mismatch: ${objectPath}`);
    }
    verified.add(key);
  }
  for (const outcome of resolverOutcomes) {
    for (const lane of outcome.result.sourceLanes ?? []) {
      for (const provenance of lane.provenance ?? []) {
        await verifyObject(provenance, 'source lane provenance');
      }
    }
    for (const candidate of outcome.result.candidates ?? []) {
      const provenance = candidate.discoveryProvenance;
      if (provenance?.discoveryObjectPath) {
        await verifyObject({
          objectPath: provenance.discoveryObjectPath,
          contentSha256: provenance.discoveryContentSha256,
          byteSize: provenance.discoveryByteSize,
        }, 'candidate discovery provenance');
      }
    }
  }
}

async function loadIndexedDiscoveryRun({
  objectStore,
  pointerPath,
  runId,
  markerSha256,
  acquisitionQueueSha256,
  selection,
  boundedManifest,
}) {
  const pointerBytes = await readOptionalObject(objectStore, pointerPath);
  if (!pointerBytes) return null;
  let pointer;
  try { pointer = JSON.parse(pointerBytes.toString('utf8')); } catch {
    throw new Error(`discovery run pointer JSON invalid: ${runId}`);
  }
  if (pointer?.schemaVersion !== 1 || pointer.runId !== runId
    || pointer.markerSha256 !== markerSha256
    || !Number.isInteger(pointer.byteSize) || pointer.byteSize < 1
    || !/^[a-f0-9]{64}$/.test(String(pointer.contentSha256 ?? ''))
    || pointer.objectPath !== discoveryObjectPath(pointer.contentSha256)) {
    throw new Error(`discovery run pointer invalid: ${runId}`);
  }
  const payloadBytes = await objectStore.readObject(pointer.objectPath);
  const contentSha256 = createHash('sha256').update(payloadBytes).digest('hex');
  if (payloadBytes.length !== pointer.byteSize || contentSha256 !== pointer.contentSha256) {
    throw new Error(`discovery run object binding mismatch: ${runId}`);
  }
  let payload;
  try { payload = JSON.parse(payloadBytes.toString('utf8')); } catch {
    throw new Error(`discovery run object JSON invalid: ${runId}`);
  }
  if (payload?.schemaVersion !== 1 || payload.runId !== runId
    || payload.sourceAcquisitionQueueSha256 !== acquisitionQueueSha256
    || JSON.stringify(payload.selection) !== JSON.stringify(selection)
    || JSON.stringify(payload.boundedManifest) !== JSON.stringify(boundedManifest)) {
    throw new Error(`discovery run resume binding mismatch: ${runId}`);
  }
  return {
    ...payload,
    storageObject: {
      contentSha256: pointer.contentSha256,
      byteSize: pointer.byteSize,
      objectPath: pointer.objectPath,
      markerSha256: pointer.markerSha256,
    },
  };
}

export async function runHistoricalOfficialCandidateDiscovery(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseHistoricalOfficialCandidateDiscoveryArgs(argv);
  const storageRoot = resolve(options.storageRoot ?? process.env.FITAPPLIANCE_STORAGE_ROOT ?? '');
  if (!options.storageRoot && !process.env.FITAPPLIANCE_STORAGE_ROOT) {
    throw new TypeError('--storage-root or FITAPPLIANCE_STORAGE_ROOT required');
  }
  if (!options.runId) throw new TypeError('--run-id required');
  const acquisitionPath = resolve(options.input
    ?? resolveArchitectureV2Path(root, 'historicalModelPdfAcquisitionQueue'));
  const output = resolve(options.output
    ?? resolveArchitectureV2Path(root, 'historicalOfficialCandidateManifest'));
  const acquisitionQueue = await readJson(acquisitionPath);
  const controlPlane = dependencies.controlPlane ?? {
    boundedBatches: await readJson(resolve(options.manifestInput
      ?? resolveArchitectureV2Path(root, 'historicalEvidenceNextBatches'))),
    executableQueue: await readJson(resolveArchitectureV2Path(
      root,
      'historicalExecutableEvidenceRecoveryQueue',
    )),
    targetState: await readJson(resolveArchitectureV2Path(root, 'historicalEvidenceTargetState')),
    familyCanaries: await readJson(resolveArchitectureV2Path(root, 'historicalEvidenceFamilyCanaries')),
    scaleControl: await readJson(resolveArchitectureV2Path(root, 'historicalDimensionsScaleControl')),
  };
  const boundedManifest = resolveHistoricalEvidenceBoundedManifest({
    batches: controlPlane.boundedBatches,
    manifestId: options.manifestId,
    expectedExecutionLane: 'BOUNDED_DISCOVERY',
    executableQueue: controlPlane.executableQueue,
    targetState: controlPlane.targetState,
    familyCanaries: controlPlane.familyCanaries,
    scaleControl: controlPlane.scaleControl ?? null,
  });
  if (boundedManifest.targetBindings.length > MAXIMUM_TARGETS) {
    throw new Error(`bounded manifest exceeds discovery maximum ${MAXIMUM_TARGETS}`);
  }
  if (boundedManifest.sourceBindings.sourceAcquisitionQueueSha256
    !== acquisitionQueue.semanticQueueSha256) {
    throw new Error('acquisition queue hash drift against bounded manifest');
  }
  const priorManifest = await readOptionalJson(output, null);
  if (priorManifest?.runBindings?.some((binding) => binding.runId === options.runId)) {
    throw new Error(`discovery run ID already exists: ${options.runId}`);
  }
  const selected = selectHistoricalOfficialCandidateTargets(acquisitionQueue, {
    referenceIds: boundedManifest.targetBindings.map((binding) => binding.referenceId),
    brand: null,
    category: null,
    limit: boundedManifest.targetBindings.length,
  });
  const verifyStorage = dependencies.verifyStorageRoot
    ?? ((path) => verifyEvidenceStorageRoot(path, { getVolumeUuid: mountedVolumeUuid }));
  const storageIdentity = await verifyStorage(storageRoot);
  const objectStore = dependencies.objectStore ?? createEvidenceObjectStore(storageIdentity.root);
  const selection = selectionFor(options, selected, boundedManifest);
  const pointerPath = discoveryRunPointerPath(options.runId);
  let run = await loadIndexedDiscoveryRun({
    objectStore,
    pointerPath,
    runId: options.runId,
    markerSha256: storageIdentity.markerSha256,
    acquisitionQueueSha256: acquisitionQueue.semanticQueueSha256,
    selection,
    boundedManifest,
  });
  const resumed = Boolean(run);
  if (!run) {
    const resolverFactory = dependencies.resolversForRecord ?? resolversForRecord;
    const now = dependencies.now ?? (() => new Date());
    const startedAt = now().toISOString();
    const preparedTargets = selected.map((record) => {
      const target = caseRecordFor(record, acquisitionQueue);
      const resolvers = resolverFactory(record, { resolverOptions: resolverOptions(objectStore) });
      if (!Array.isArray(resolvers) || !resolvers.length) {
        throw new Error(`selected target has no available resolver: ${record.referenceId}`);
      }
      return { record, target, resolvers };
    });
    const resolverJobs = preparedTargets.flatMap(({ record, target, resolvers }) => (
      resolvers.map((resolver) => ({ referenceId: record.referenceId, target, resolver }))
    ));
    const resolverOutcomes = await mapLimit(
      resolverJobs,
      options.networkConcurrency,
      async ({ referenceId, target, resolver }) => ({
        referenceId,
        result: await resolveWithTimeout(resolver, target, options.resolverTimeoutMs),
      }),
    );
    await verifySourceLaneProvenanceObjects(objectStore, resolverOutcomes);
    const outcomesByReference = new Map();
    for (const outcome of resolverOutcomes) {
      const values = outcomesByReference.get(outcome.referenceId) ?? [];
      values.push(outcome.result);
      outcomesByReference.set(outcome.referenceId, values);
    }
    const targetResults = preparedTargets.map(({ record }) => {
      const results = outcomesByReference.get(record.referenceId) ?? [];
      return {
        referenceId: record.referenceId,
        brand: record.brand,
        model: record.model,
        category: record.category,
        resolvers: results.sort((left, right) => left.resolverId.localeCompare(right.resolverId)),
      };
    });
    const completedAt = now().toISOString();
    const runPayload = {
      schemaVersion: 1,
      runId: options.runId,
      startedAt,
      completedAt,
      sourceAcquisitionQueueSha256: acquisitionQueue.semanticQueueSha256,
      selection,
      boundedManifest: structuredClone(boundedManifest),
      targets: targetResults,
    };
    const bytes = Buffer.from(`${JSON.stringify(runPayload, null, 2)}\n`);
    const contentSha256 = createHash('sha256').update(bytes).digest('hex');
    const objectPath = discoveryObjectPath(contentSha256);
    await objectStore.writeObject(objectPath, bytes);
    const pointer = {
      schemaVersion: 1,
      runId: options.runId,
      contentSha256,
      byteSize: bytes.length,
      objectPath,
      markerSha256: storageIdentity.markerSha256,
    };
    await objectStore.writeObject(
      pointerPath,
      Buffer.from(`${JSON.stringify(pointer, null, 2)}\n`),
    );
    run = {
      ...runPayload,
      storageObject: {
        contentSha256,
        byteSize: bytes.length,
        objectPath,
        markerSha256: storageIdentity.markerSha256,
      },
    };
  }
  await verifySourceLaneProvenanceObjects(
    objectStore,
    run.targets.flatMap((target) => target.resolvers.map((result) => ({ result }))),
  );
  const manifest = buildHistoricalOfficialCandidateManifest({
    generatedAt: run.completedAt,
    acquisitionQueue,
    priorManifest,
    discoveryRuns: [run],
    resolverContractsByReference: dependencies.resolverContractsByReference
      ?? historicalOfficialResolverContracts(acquisitionQueue),
    ...(dependencies.officialCandidateValidator ? {
      officialCandidateValidator: dependencies.officialCandidateValidator,
    } : {}),
  });
  const writeManifest = dependencies.writeManifest ?? atomicJson;
  await writeManifest(output, manifest);
  const writeOutput = dependencies.writeOutput ?? ((value) => process.stdout.write(value));
  writeOutput(`${JSON.stringify({
    runId: options.runId,
    resumed,
    selectedTargets: selected.length,
    storageObject: run.storageObject,
    output,
    summary: manifest.summary,
  }, null, 2)}\n`);
  return { run, manifest, resumed };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runHistoricalOfficialCandidateDiscovery();
}
