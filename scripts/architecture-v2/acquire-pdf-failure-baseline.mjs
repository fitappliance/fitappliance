#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, rename, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { architectureV2Paths } from '../../src/domain/architecture-v2-paths.mjs';
import {
  buildWp7aBaselineRerun,
  pdfObjectPath,
  selectFrozenPdfBaselineSamples,
  selectExactOfficialPdfCandidates,
  validateFrozenPdfBaseline,
} from '../../src/domain/pdf-baseline-acquisition.mjs';
import { validateEvidenceSourceResolverResult } from '../../src/domain/evidence-source-adapter-contract.mjs';
import {
  createEvidenceObjectStore,
  verifyEvidenceStorageRoot,
} from '../../src/domain/evidence-recovery-state-store.mjs';
import {
  isOfficialBrandArtifactUrl,
  officialArtifactUrlNeedsDiscoveryProvenance,
} from '../../src/domain/evidence-source-verifier.mjs';
import { runMineruPdfWithImageFallback } from '../../src/domain/mineru-runner.mjs';
import { fetchOfficialArtifactResilient } from '../../src/domain/official-artifact-transport.mjs';
import {
  officialArtifactFetchOptions,
  recoveryCandidateResolversForTarget,
} from './run-historical-evidence-recovery.mjs';

const execFile = promisify(execFileCallback);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_RUN_ID = 'wp7a-pdf-failure-baseline-20260727';
const SHA256 = /^[a-f0-9]{64}$/;

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

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function identityKey(brand, model, category) {
  const normalize = (value) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  return [normalize(brand), normalize(model), normalize(category)].join('\0');
}

function parseArgs(argv) {
  const options = {
    storageRoot: process.env.FITAPPLIANCE_STORAGE_ROOT ?? null,
    runId: DEFAULT_RUN_ID,
    limit: null,
    networkConcurrency: 2,
    resolverTimeoutMs: 120_000,
    maximumCandidates: 3,
    retryTerminal: false,
    sampleIds: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--retry-terminal') { options.retryTerminal = true; continue; }
    if (!['--storage-root', '--run-id', '--limit', '--network-concurrency', '--resolver-timeout-ms', '--maximum-candidates', '--sample-id'].includes(flag)) {
      throw new TypeError(`unknown argument: ${flag}`);
    }
    const value = requiredText(argv[index + 1], flag);
    index += 1;
    if (flag === '--storage-root') options.storageRoot = value;
    if (flag === '--run-id') options.runId = value;
    if (flag === '--limit') options.limit = positiveInteger(value, flag);
    if (flag === '--network-concurrency') options.networkConcurrency = positiveInteger(value, flag);
    if (flag === '--resolver-timeout-ms') options.resolverTimeoutMs = positiveInteger(value, flag);
    if (flag === '--maximum-candidates') options.maximumCandidates = positiveInteger(value, flag);
    if (flag === '--sample-id') options.sampleIds.push(value);
  }
  options.storageRoot = requiredText(options.storageRoot, '--storage-root or FITAPPLIANCE_STORAGE_ROOT');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(options.runId)) throw new TypeError('run ID invalid');
  if (options.networkConcurrency > 2) throw new TypeError('WP7A network concurrency cannot exceed 2');
  if (options.resolverTimeoutMs > 120_000) throw new TypeError('resolver timeout cannot exceed 120000ms');
  if (options.maximumCandidates > 5) throw new TypeError('candidate attempts cannot exceed 5');
  return options;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readOptionalJson(path) {
  try { return await readJson(path); } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

async function mountedVolumeUuid(path) {
  const { stdout: dfOutput } = await execFile('df', ['-P', path], { timeout: 10_000 });
  const device = dfOutput.trim().split('\n').at(-1)?.trim().split(/\s+/)[0];
  if (!device) throw new Error('df did not report the storage device');
  const { stdout } = await execFile('diskutil', ['info', device], { timeout: 10_000 });
  const value = /^\s*Volume UUID:\s*(\S+)\s*$/im.exec(stdout)?.[1];
  if (!value) throw new Error('diskutil did not report a mounted volume UUID');
  return value;
}

function directOfficialCandidate(sample) {
  if (officialArtifactUrlNeedsDiscoveryProvenance(sample.sourceUrl, sample.brand)) return null;
  const context = {
    model: sample.model,
    category: sample.category,
    artifactUrl: sample.sourceUrl,
  };
  if (!isOfficialBrandArtifactUrl(sample.sourceUrl, sample.brand, context)) return null;
  return {
    sourceUrl: sample.sourceUrl,
    authorityMode: 'official',
    sourceRole: 'manufacturer_document',
    documentType: sample.documentPattern?.hint ?? 'family_manual',
    sourceModelHint: sample.model,
    discoveryMethod: 'frozen_official_source_url',
    discoveryProvenance: null,
  };
}

async function priorDiscoveryCandidates(storageRoot, objectStore, baseline) {
  const samplesByKey = new Map(baseline.samples.map((sample) => [
    identityKey(sample.brand, sample.model, sample.category), sample,
  ]));
  const candidatesBySample = new Map();
  const runsPath = join(storageRoot, 'evidence/discovery/runs');
  let names = [];
  try { names = (await readdir(runsPath)).filter((name) => name.endsWith('.json')).sort(); } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  for (const name of names) {
    const pointerBytes = await readFile(join(runsPath, name));
    const pointer = JSON.parse(pointerBytes);
    if (pointer?.schemaVersion !== 1 || !SHA256.test(pointer.contentSha256 ?? '')) {
      throw new Error(`discovery pointer invalid: ${name}`);
    }
    const payloadBytes = await objectStore.readObject(pointer.objectPath);
    if (payloadBytes.length !== pointer.byteSize || sha256(payloadBytes) !== pointer.contentSha256) {
      throw new Error(`discovery object integrity mismatch: ${name}`);
    }
    const payload = JSON.parse(payloadBytes);
    for (const target of payload.targets ?? []) {
      const sample = samplesByKey.get(identityKey(target.brand, target.model, target.category));
      if (!sample) continue;
      const candidates = (target.resolvers ?? []).flatMap((resolver) => resolver.candidates ?? []);
      const selected = selectExactOfficialPdfCandidates(sample, candidates).filter((candidate) => (
        !officialArtifactUrlNeedsDiscoveryProvenance(candidate.sourceUrl, sample.brand)
        || candidate.discoveryProvenance
      ));
      if (!selected.length) continue;
      candidatesBySample.set(sample.sampleId, [
        ...(candidatesBySample.get(sample.sampleId) ?? []),
        ...selected.map((candidate) => ({ ...candidate, priorDiscoveryRunId: payload.runId })),
      ]);
    }
  }
  return candidatesBySample;
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

async function resolveWithTimeout(resolver, caseRecord, timeoutMs) {
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`resolver exceeded ${timeoutMs}ms`)), timeoutMs);
    });
    return validateEvidenceSourceResolverResult(await Promise.race([
      resolver.resolve(structuredClone(caseRecord)), timeout,
    ]));
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function caseRecord(sample, acquisitionRecord, acquisitionQueue) {
  const sourcesById = new Map((acquisitionQueue.sources ?? []).map((source) => [source.sourceId, source]));
  const sources = (acquisitionRecord?.candidateSourceIds ?? [])
    .map((sourceId) => sourcesById.get(sourceId))
    .filter(Boolean)
    .map(({ sourceUrl }) => ({ sourceUrl, finalUrl: sourceUrl }));
  if (!sources.some(({ sourceUrl }) => sourceUrl === sample.sourceUrl)) {
    sources.push({ sourceUrl: sample.sourceUrl, finalUrl: sample.sourceUrl });
  }
  return {
    id: acquisitionRecord?.acquisitionId ?? sample.jobId,
    referenceId: sample.referenceId,
    brand: sample.brand,
    model: sample.model,
    category: sample.category,
    sources,
    reconciliationContext: {},
  };
}

async function discoverCandidates(sample, acquisitionRecord, acquisitionQueue, objectStore, timeoutMs) {
  const target = acquisitionRecord ?? caseRecord(sample, null, acquisitionQueue);
  const record = caseRecord(sample, acquisitionRecord, acquisitionQueue);
  const resolvers = recoveryCandidateResolversForTarget(target, {
    resolverOptions: resolverOptions(objectStore),
  });
  const outcomes = [];
  for (const resolver of resolvers) {
    try {
      outcomes.push({
        resolverId: resolver.resolverId,
        result: await resolveWithTimeout(resolver, record, timeoutMs),
      });
    } catch (error) {
      outcomes.push({
        resolverId: resolver.resolverId,
        error: String(error?.message ?? error).slice(0, 500),
      });
    }
  }
  const all = outcomes.flatMap(({ result }) => result?.candidates ?? []);
  return { outcomes, all, selected: selectExactOfficialPdfCandidates(sample, all) };
}

function candidateRank(candidate) {
  return {
    specification_sheet: 0,
    quick_reference_guide: 1,
    installation_guide: 2,
    design_guide: 3,
    user_manual: 4,
    family_manual: 5,
  }[candidate.documentType] ?? 6;
}

function uniqueRankedCandidates(candidates) {
  const seen = new Set();
  return [...candidates]
    .sort((left, right) => candidateRank(left) - candidateRank(right)
      || left.sourceUrl.localeCompare(right.sourceUrl))
    .filter((candidate) => {
      const url = new URL(candidate.sourceUrl).toString();
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
}

async function fetchWithRetry(candidate, sample, policy) {
  let lastError;
  for (let attempt = 1; attempt <= policy.retry.fetchAttempts; attempt += 1) {
    try {
      return await fetchOfficialArtifactResilient(candidate.sourceUrl, sample.brand, {
        ...officialArtifactFetchOptions(policy, {
          expectedModel: sample.model,
          expectedCategory: sample.category,
          discoveryProvenance: candidate.discoveryProvenance,
        }),
      });
    } catch (error) {
      lastError = error;
      if (attempt < policy.retry.fetchAttempts) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, policy.retry.baseDelayMs * attempt));
      }
    }
  }
  throw lastError;
}

async function persistMineruArtifacts(objectStore, result) {
  await objectStore.writeObject(result.derivedArtifact.objectPath, result.jsonBytes);
  if (result.derivedArtifact.fallbackTrigger) {
    const bytes = result.primaryJsonBytes;
    const trigger = result.derivedArtifact.fallbackTrigger;
    if (!bytes?.length || sha256(bytes) !== trigger.contentSha256) {
      throw new Error('MinerU fallback trigger artifact integrity mismatch');
    }
    await objectStore.writeObject(trigger.objectPath, bytes);
  }
}

async function indexPdf(sampleId, attempt, objectStore, storageRoot, policy, withMineru) {
  const bytes = await objectStore.readObject(attempt.objectPath);
  if (sha256(bytes) !== attempt.contentSha256 || !bytes.subarray(0, 5).toString().startsWith('%PDF-')) {
    throw new Error('persisted PDF integrity mismatch before MinerU');
  }
  const result = await withMineru(() => runMineruPdfWithImageFallback(bytes, {
    storageRoot,
    maximumPdfBytes: policy.limits.maximumBytes,
  }));
  await persistMineruArtifacts(objectStore, result);
  return {
    ...attempt,
    sampleId,
    status: 'indexed',
    derivedArtifact: result.derivedArtifact,
    usedImageFallback: result.usedImageFallback,
  };
}

async function reuseLegacyOfficialPdf(sample, documents, objectStore, storageRoot, policy, withMineru) {
  if (!sample.sourcePdfSha256 || !directOfficialCandidate(sample)) return null;
  const document = documents.find(({ sha256: hash, sourceUrls }) => (
    hash === sample.sourcePdfSha256 && sourceUrls?.includes(sample.sourceUrl)
  ));
  if (!document?.paths?.pdf) return null;
  const bytes = await objectStore.readObject(document.paths.pdf);
  if (sha256(bytes) !== sample.sourcePdfSha256 || bytes.length !== document.byteSize) {
    throw new Error(`legacy evidence object integrity mismatch: ${sample.sampleId}`);
  }
  const objectPath = pdfObjectPath(sample.sourcePdfSha256);
  await objectStore.writeObject(objectPath, bytes);
  return indexPdf(sample.sampleId, {
    sampleId: sample.sampleId,
    status: 'acquired',
    officialSourceUrl: sample.sourceUrl,
    finalUrl: sample.sourceUrl,
    redirectChain: [],
    contentSha256: sample.sourcePdfSha256,
    objectPath,
    byteSize: bytes.length,
    transport: 'verified_legacy_content_addressed_object',
  }, objectStore, storageRoot, policy, withMineru);
}

async function mapLimit(values, maximum, worker) {
  let cursor = 0;
  const output = new Array(values.length);
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

function checkpointTemplate(options) {
  return {
    schemaVersion: 1,
    runId: options.runId,
    baselineId: options.baseline.baselineId,
    baselineSha256: options.baselineSha256,
    policySha256: options.policySha256,
    storageMarkerSha256: options.storageIdentity.markerSha256,
    storageVolumeUuid: options.storageIdentity.volumeUuid,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attempts: {},
  };
}

function validateCheckpoint(checkpoint, expected) {
  if (checkpoint.schemaVersion !== 1 || checkpoint.runId !== expected.runId
    || checkpoint.baselineSha256 !== expected.baselineSha256
    || checkpoint.policySha256 !== expected.policySha256
    || checkpoint.storageMarkerSha256 !== expected.storageIdentity.markerSha256
    || checkpoint.storageVolumeUuid !== expected.storageIdentity.volumeUuid) {
    throw new Error('WP7A checkpoint binding mismatch');
  }
  return checkpoint;
}

function reportMarkdown(rerun, artifactSha256) {
  const rows = Object.entries(rerun.summary.byAcquisitionStatus)
    .map(([status, count]) => `| ${status} | ${count} |`).join('\n');
  return `# WP7A Frozen PDF Acquisition Rerun

**Built:** ${rerun.builtOn}

**Artifact SHA-256:** \`${artifactSha256}\`

This report replays the exact 100 frozen samples. It accepts only exact-model,
Australian official manufacturer PDFs. Retailer mirrors, sibling suffixes and product
pages cannot satisfy the acquisition gate.

| Status | Samples |
| --- | ---: |
${rows}

- Official PDFs content-addressed: **${rerun.summary.officialPdfsAcquired}**
- MinerU content_list_v2 indexes: **${rerun.summary.mineruIndexedObjects}**
- Publication-eligible rows: **${rerun.summary.publicationEligible}**

No result from this diagnostic run is projected into the public catalog or FitDecision.
`;
}

async function main(argv) {
  const options = parseArgs(argv);
  const baselinePath = join(root, architectureV2Paths.pdfFailureBaseline100);
  const baselineBytes = await readFile(baselinePath);
  const baselineSha256 = sha256(baselineBytes);
  const expectedSha = (await readFile(join(root, architectureV2Paths.pdfFailureBaseline100Sha256), 'utf8'))
    .trim().split(/\s+/)[0];
  if (baselineSha256 !== expectedSha) throw new Error('frozen PDF baseline hash drift');
  const baseline = validateFrozenPdfBaseline(JSON.parse(baselineBytes));

  const policyPath = join(root, architectureV2Paths.historicalEvidenceRecoveryPolicy);
  const policyBytes = await readFile(policyPath);
  const policy = JSON.parse(policyBytes);
  const policySha256 = sha256(policyBytes);
  const storageIdentity = await verifyEvidenceStorageRoot(options.storageRoot, { getVolumeUuid: mountedVolumeUuid });
  const objectStore = createEvidenceObjectStore(storageIdentity.root);
  const checkpointPath = join(storageIdentity.root, 'runs/wp7a-pdf-baseline', options.runId, 'checkpoint.json');
  const checkpointExpected = { ...options, baselineSha256, policySha256, storageIdentity };
  const priorCheckpoint = await readOptionalJson(checkpointPath);
  const checkpoint = priorCheckpoint
    ? validateCheckpoint(priorCheckpoint, checkpointExpected)
    : checkpointTemplate({ ...checkpointExpected, baseline });

  const discovery = await priorDiscoveryCandidates(storageIdentity.root, objectStore, baseline);
  const acquisitionQueue = await readJson(join(root, architectureV2Paths.historicalModelPdfAcquisitionQueue));
  const acquisitionByReference = new Map(acquisitionQueue.records.map((record) => [record.referenceId, record]));
  const evidenceObjectIndex = await readJson(join(root, architectureV2Paths.evidenceObjectIndex));
  const selectedSamples = selectFrozenPdfBaselineSamples(baseline.samples, {
    sampleIds: options.sampleIds,
    limit: options.limit,
  });

  let writeChain = Promise.resolve();
  let mineruChain = Promise.resolve();
  const withMineru = (operation) => {
    const result = mineruChain.then(operation, operation);
    mineruChain = result.catch(() => {});
    return result;
  };
  const saveCheckpoint = () => {
    checkpoint.updatedAt = new Date().toISOString();
    const snapshot = structuredClone(checkpoint);
    writeChain = writeChain.then(() => atomicJson(checkpointPath, snapshot));
    return writeChain;
  };
  if (!priorCheckpoint) await saveCheckpoint();

  await mapLimit(selectedSamples, options.networkConcurrency, async (sample) => {
    const prior = checkpoint.attempts[sample.sampleId];
    if (prior?.status === 'indexed') return;
    if (prior && ['official_candidate_not_found', 'identity_unproven', 'transport_failed'].includes(prior.status)
      && !options.retryTerminal) return;
    if (prior?.contentSha256 && prior?.objectPath) {
      try {
        checkpoint.attempts[sample.sampleId] = await indexPdf(
          sample.sampleId, prior, objectStore, storageIdentity.root, policy, withMineru,
        );
      } catch (error) {
        checkpoint.attempts[sample.sampleId] = {
          ...prior,
          status: 'mineru_failed',
          reason: String(error?.message ?? error).slice(0, 1000),
        };
      }
      await saveCheckpoint();
      return;
    }

    try {
      const reused = await reuseLegacyOfficialPdf(
        sample, evidenceObjectIndex.documents, objectStore, storageIdentity.root, policy, withMineru,
      );
      if (reused) {
        checkpoint.attempts[sample.sampleId] = reused;
        await saveCheckpoint();
        return;
      }
    } catch (error) {
      checkpoint.attempts[sample.sampleId] = {
        sampleId: sample.sampleId,
        status: 'mineru_failed',
        reason: String(error?.message ?? error).slice(0, 1000),
      };
      await saveCheckpoint();
    }

    const candidates = [...(discovery.get(sample.sampleId) ?? [])];
    const direct = directOfficialCandidate(sample);
    if (direct) candidates.push(direct);
    let liveDiscovery = null;
    if (!candidates.length) {
      liveDiscovery = await discoverCandidates(
        sample,
        acquisitionByReference.get(sample.referenceId),
        acquisitionQueue,
        objectStore,
        options.resolverTimeoutMs,
      );
      candidates.push(...liveDiscovery.selected);
    }
    const officialDocuments = uniqueRankedCandidates(selectExactOfficialPdfCandidates(sample, candidates));
    if (!officialDocuments.length) {
      const hadOfficialDocument = liveDiscovery?.all?.some((candidate) => (
        candidate.authorityMode === 'official' && candidate.sourceRole === 'manufacturer_document'
      ));
      checkpoint.attempts[sample.sampleId] = {
        sampleId: sample.sampleId,
        status: hadOfficialDocument ? 'identity_unproven' : 'official_candidate_not_found',
        reason: hadOfficialDocument
          ? 'Official document candidates did not preserve the exact target model identity.'
          : 'No exact-model official manufacturer PDF was discovered within the bounded resolver contract.',
        resolverOutcomes: liveDiscovery?.outcomes ?? [],
      };
      await saveCheckpoint();
      return;
    }

    const transportErrors = [];
    for (const candidate of officialDocuments.slice(0, options.maximumCandidates)) {
      try {
        const fetched = await fetchWithRetry(candidate, sample, policy);
        const contentSha256 = sha256(fetched.bytes);
        const objectPath = pdfObjectPath(contentSha256);
        await objectStore.writeObject(objectPath, fetched.bytes);
        const acquired = {
          sampleId: sample.sampleId,
          status: 'acquired',
          officialSourceUrl: candidate.sourceUrl,
          finalUrl: fetched.finalUrl,
          redirectChain: fetched.redirectChain,
          contentSha256,
          objectPath,
          byteSize: fetched.bytes.length,
          transport: fetched.transport,
          documentType: candidate.documentType,
          discoveryMethod: candidate.discoveryMethod,
          discoveryProvenance: candidate.discoveryProvenance,
        };
        checkpoint.attempts[sample.sampleId] = acquired;
        await saveCheckpoint();
        try {
          checkpoint.attempts[sample.sampleId] = await indexPdf(
            sample.sampleId, acquired, objectStore, storageIdentity.root, policy, withMineru,
          );
        } catch (error) {
          checkpoint.attempts[sample.sampleId] = {
            ...acquired,
            status: 'mineru_failed',
            reason: String(error?.message ?? error).slice(0, 1000),
          };
        }
        await saveCheckpoint();
        return;
      } catch (error) {
        transportErrors.push({
          sourceUrl: candidate.sourceUrl,
          reason: String(error?.message ?? error).slice(0, 500),
        });
      }
    }
    checkpoint.attempts[sample.sampleId] = {
      sampleId: sample.sampleId,
      status: 'transport_failed',
      reason: 'All bounded exact-model official PDF candidates failed transport validation.',
      transportErrors,
    };
    await saveCheckpoint();
  });
  await writeChain;

  const finalAttempts = baseline.samples.map(({ sampleId }) => checkpoint.attempts[sampleId]).filter(Boolean);
  if (finalAttempts.length === 100) {
    const rerun = buildWp7aBaselineRerun(baseline, finalAttempts, {
      baselineSha256,
      builtOn: new Date().toISOString().slice(0, 10),
    });
    const serialized = `${JSON.stringify(rerun, null, 2)}\n`;
    const artifactSha256 = sha256(serialized);
    const outputPath = join(root, architectureV2Paths.pdfFailureBaselineWp7a);
    await atomicJson(outputPath, rerun);
    await writeFile(join(root, architectureV2Paths.pdfFailureBaselineWp7aSha256),
      `${artifactSha256}  pdf-failure-baseline-100-wp7a.json\n`);
    await writeFile(join(root, 'docs/architecture-v2/pdf-failure-baseline-100-wp7a.md'),
      reportMarkdown(rerun, artifactSha256));
    process.stdout.write(`${JSON.stringify({ runId: options.runId, checkpointPath, artifactSha256, summary: rerun.summary }, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify({
    runId: options.runId,
    checkpointPath,
    selectedSamples: selectedSamples.length,
    completedSamples: finalAttempts.length,
    fullRerunWritten: false,
  }, null, 2)}\n`);
}

await main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
