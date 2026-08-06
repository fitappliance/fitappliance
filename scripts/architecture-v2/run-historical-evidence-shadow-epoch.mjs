#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { loadHistoricalRecoveryActiveRelease } from '../../src/domain/historical-recovery-active-release.mjs';
import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import {
  acquireEvidenceArtifact,
  attestEvidenceArtifactForCase,
  observeEvidenceArtifactDimensionsForCase,
  preflightEvidenceArtifactForCase,
} from '../../src/domain/evidence-artifact-pipeline.mjs';
import {
  createEvidenceObjectStore,
  verifyEvidenceStorageRoot,
} from '../../src/domain/evidence-recovery-state-store.mjs';
import {
  resolveHistoricalEvidenceBoundedManifest,
} from '../../src/domain/historical-evidence-bounded-batch.mjs';
import {
  canonicalJsonSha256,
} from '../../src/domain/historical-evidence-recovery-contract.mjs';
import {
  buildHistoricalEvidenceShadowInputSnapshot,
  createHistoricalEvidenceShadowEpochStore,
  runHistoricalEvidenceShadowEpoch,
} from '../../src/domain/historical-evidence-shadow-epoch.mjs';
import { runMineruPdfWithImageFallback } from '../../src/domain/mineru-runner.mjs';
import { fetchOfficialArtifactResilient } from '../../src/domain/official-artifact-transport.mjs';
import { validatePublicSearchLeads } from './validate-public-search-leads.mjs';
import { runHistoricalOfficialCandidateDiscovery } from './run-historical-official-candidate-discovery.mjs';

const execFile = promisify(execFileCallback);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function text(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

function option(argv, index, inline, label) {
  return text(inline ?? argv[index + 1], label);
}

export function parseHistoricalEvidenceShadowEpochArgs(argv) {
  const result = {
    manifestId: null, runId: null, storageRoot: null, resume: false,
    activeReleaseId: null, publicSearchInput: null, networkConcurrency: 2,
  };
  const prohibited = new Set([
    '--output', '--public-output', '--generated-output', '--replacement-output',
    '--target-id', '--reference-id', '--limit',
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const separator = raw.indexOf('=');
    const flag = separator < 0 ? raw : raw.slice(0, separator);
    const inline = separator < 0 ? null : raw.slice(separator + 1);
    if (prohibited.has(flag)) throw new TypeError(`${flag} is prohibited for a shadow epoch`);
    if (flag === '--resume') { result.resume = true; continue; }
    if (['--manifest-id', '--active-release-id', '--run-id', '--storage-root', '--public-search-input'].includes(flag)) {
      const value = option(argv, index, inline, flag);
      if (separator < 0) index += 1;
      result[{
        '--manifest-id': 'manifestId', '--active-release-id': 'activeReleaseId',
        '--run-id': 'runId', '--storage-root': 'storageRoot',
        '--public-search-input': 'publicSearchInput',
      }[flag]] = value;
      continue;
    }
    if (flag === '--network-concurrency') {
      const value = Number(option(argv, index, inline, flag));
      if (separator < 0) index += 1;
      if (!Number.isInteger(value) || value < 1 || value > 4) {
        throw new TypeError('network concurrency must be between 1 and 4');
      }
      result.networkConcurrency = value;
      continue;
    }
    throw new TypeError(`unknown argument: ${raw}`);
  }
  result.storageRoot ??= process.env.FITAPPLIANCE_STORAGE_ROOT ?? null;
  for (const key of ['manifestId', 'activeReleaseId', 'runId', 'storageRoot']) {
    text(result[key], `--${key}`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(result.runId)) throw new TypeError('run ID invalid');
  return result;
}

export function scaleControlForShadowManifestResolution(resume, scaleControl) {
  return resume === true ? null : scaleControl;
}

async function readJson(path) {
  return JSON.parse(await fs.readFile(path, 'utf8'));
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

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function atomicJson(path, value) {
  await fs.mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await fs.rename(temporary, path);
}

function candidateRows(manifest, target) {
  const candidatesById = new Map(manifest.candidates.map((candidate) => [candidate.candidateId, candidate]));
  const row = manifest.targets.find((candidateTarget) => candidateTarget.referenceId === target.referenceId);
  if (!row) throw new Error(`candidate output missing target: ${target.referenceId}`);
  return row.candidateEdges.map((edge) => {
    const candidate = candidatesById.get(edge.candidateId);
    if (!candidate) throw new Error(`candidate output missing candidate: ${edge.candidateId}`);
    const discovery = [...candidate.discoveries].reverse().find((value) => value.discoveryProvenance);
    return {
      candidateId: candidate.candidateId,
      sourceUrl: candidate.sourceUrl,
      authorityMode: 'official',
      discoveryProvenance: discovery?.discoveryProvenance ?? null,
    };
  });
}

async function fetchWithRetry(url, brand, policy, target, candidate) {
  let lastError;
  for (let attempt = 1; attempt <= policy.retry.fetchAttempts; attempt += 1) {
    try {
      return await fetchOfficialArtifactResilient(url, brand, {
        timeoutMs: policy.limits.timeoutMs,
        maximumBytes: policy.limits.maximumBytes,
        maximumRedirects: policy.limits.maximumRedirects,
        allowCurlFallback: true,
        allowScraplingFallback: true,
        expectedModel: target.model,
        expectedCategory: target.category,
        discoveryProvenance: candidate.discoveryProvenance,
      });
    } catch (error) {
      lastError = error;
      if (attempt < policy.retry.fetchAttempts && policy.retry.baseDelayMs > 0) {
        await new Promise((done) => setTimeout(done, policy.retry.baseDelayMs * attempt));
      }
    }
  }
  throw lastError;
}

export async function runHistoricalEvidenceShadowEpochCli(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseHistoricalEvidenceShadowEpochArgs(argv);
  const verifyStorage = dependencies.verifyStorageRoot
    ?? ((path) => verifyEvidenceStorageRoot(path, { getVolumeUuid: mountedVolumeUuid }));
  const storageIdentity = await verifyStorage(options.storageRoot);
  const store = dependencies.store ?? createHistoricalEvidenceShadowEpochStore({
    storageRoot: storageIdentity.root, runId: options.runId,
  });
  const writeOutput = dependencies.writeOutput ?? ((value) => process.stdout.write(value));
  const emitResult = (result) => {
    writeOutput(`${JSON.stringify({
      runId: options.runId,
      results: store.paths.results,
      summary: result.summary,
    }, null, 2)}\n`);
    return result;
  };

  let runtime;
  if (options.resume) {
    if (typeof store.inspectResume !== 'function' || typeof store.readInputSnapshot !== 'function') {
      throw new TypeError('shadow resume store inspection required');
    }
    const persisted = await store.inspectResume({
      manifestId: options.manifestId,
      activeReleaseId: options.activeReleaseId,
    });
    if (persisted.report) return emitResult(persisted.report);
    runtime = await store.readInputSnapshot();
  } else {
    const control = dependencies.control ?? {
      boundedBatches: await readJson(resolveArchitectureV2Path(root, 'historicalEvidenceNextBatches')),
      executableQueue: await readJson(resolveArchitectureV2Path(root, 'historicalExecutableEvidenceRecoveryQueue')),
      targetState: await readJson(resolveArchitectureV2Path(root, 'historicalEvidenceTargetState')),
      familyCanaries: await readJson(resolveArchitectureV2Path(root, 'historicalEvidenceFamilyCanaries')),
      scaleControl: await readJson(resolveArchitectureV2Path(root, 'historicalDimensionsScaleControl')),
      acquisitionQueue: await readJson(resolveArchitectureV2Path(root, 'historicalModelPdfAcquisitionQueue')),
      policy: await readJson(resolveArchitectureV2Path(root, 'historicalEvidenceRecoveryPolicy')),
    };
    const manifest = resolveHistoricalEvidenceBoundedManifest({
      batches: control.boundedBatches,
      manifestId: options.manifestId,
      expectedExecutionLane: 'BOUNDED_DISCOVERY',
      executableQueue: control.executableQueue,
      targetState: control.targetState,
      familyCanaries: control.familyCanaries,
      scaleControl: scaleControlForShadowManifestResolution(false, control.scaleControl),
    });
    const executableById = new Map(control.executableQueue.discoveryTargets
      .map((target) => [target.targetId, target]));
    const targets = manifest.targetBindings.map((binding) => {
      const target = executableById.get(binding.targetId);
      if (!target) throw new Error(`manifest discovery target missing: ${binding.targetId}`);
      return structuredClone(target);
    });
    const active = await (dependencies.loadActiveRelease ?? loadHistoricalRecoveryActiveRelease)({ root });
    if (active.releaseCandidateId !== options.activeReleaseId) {
      throw new Error('loaded active release does not match the controller-authorized release ID');
    }
    for (const target of targets) {
      const reference = active.referencesById.get(target.referenceId);
      if (!reference || reference.lifecycleState !== 'CURRENT_RETAIL'
        || reference.brand !== target.brand || reference.model !== target.model
        || reference.category !== target.category) {
        throw new Error(`active-release target binding drift: ${target.referenceId}`);
      }
    }
    const activeRelease = {
      releaseCandidateId: active.releaseCandidateId,
      bindingSha256: canonicalJsonSha256({
        releaseCandidateId: active.releaseCandidateId,
        ...active.sourceBindings,
      }),
    };
    let publicSearchCandidates = [];
    let publicSearchInputSha256 = null;
    if (options.publicSearchInput) {
      const publicInput = await readJson(resolve(options.publicSearchInput));
      const validated = validatePublicSearchLeads(publicInput);
      publicSearchCandidates = validated.candidates;
      publicSearchInputSha256 = canonicalJsonSha256(publicInput);
    }
    const inputSha256 = canonicalJsonSha256({
      acquisitionQueueSha256: control.acquisitionQueue.semanticQueueSha256,
      executableQueueSha256: canonicalJsonSha256(control.executableQueue),
      policySha256: canonicalJsonSha256(control.policy),
      publicSearchInputSha256,
    });
    const verifierBytes = await fs.readFile(resolve(root, 'src/domain/evidence-artifact-verifier.mjs'));
    const capabilityIdentity = {
      resolverSha256: canonicalJsonSha256(targets.map((target) => target.resolverContract)),
      transportSha256: canonicalJsonSha256(control.policy),
      parserSha256: canonicalJsonSha256(control.executableQueue.evidenceProcessorEpochs),
      identitySha256: sha256(verifierBytes),
    };
    runtime = buildHistoricalEvidenceShadowInputSnapshot({
      runId: options.runId,
      manifest,
      activeRelease,
      inputSha256,
      capabilityIdentity,
      targets,
      acquisitionQueue: control.acquisitionQueue,
      policy: control.policy,
      publicSearchCandidates,
    });
    if (typeof store.writeInputSnapshot !== 'function') {
      throw new TypeError('shadow input snapshot store required');
    }
    await store.writeInputSnapshot(runtime);
  }

  const {
    manifest, activeRelease, inputSha256, capabilityIdentity, targets,
    acquisitionQueue, policy, publicSearchCandidates,
  } = runtime;
  const objectStore = dependencies.objectStore ?? createEvidenceObjectStore(storageIdentity.root);
  const artifactCache = new Map();
  const contentCache = new Map();
  const artifactRecordPath = (transportKey) => join(
    store.paths.artifactRecords,
    `${sha256(Buffer.from(transportKey))}.json`,
  );
  const readArtifactRecord = async (transportKey) => {
    try { return await readJson(artifactRecordPath(transportKey)); } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  };
  const writeArtifactRecord = async (record) => atomicJson(
    artifactRecordPath(record.transportKey), record,
  );
  let discoveryPromise = null;
  const discoverTarget = dependencies.discoverTarget ?? (async (target) => {
    discoveryPromise ??= runHistoricalOfficialCandidateDiscovery([
        '--manifest-id', manifest.manifestId,
        '--run-id', `${options.runId}-resolver`,
        '--storage-root', storageIdentity.root,
        '--output', store.paths.candidateManifest,
        '--network-concurrency', String(options.networkConcurrency),
      ], {
        ...(dependencies.discoveryDependencies ?? {}),
        acquisitionQueue,
        boundedManifest: manifest,
      });
    const discovery = await discoveryPromise;
    return {
      candidates: candidateRows(discovery.manifest, target),
      outputSha256: discovery.manifest.semanticManifestSha256,
    };
  });
  const acquireArtifact = dependencies.acquireArtifact ?? (async (target, candidate, hooks) => (
    acquireEvidenceArtifact(candidate, {
      authorityBrand: target.brand,
      authorityMode: 'official',
      transportPolicySha256: canonicalJsonSha256(policy),
      artifactCache,
      contentCache,
      readArtifactRecord,
      writeArtifactRecord,
      readObject: objectStore.readObject,
      writeObject: objectStore.writeObject,
      fetchArtifact: (url, brand) => fetchWithRetry(url, brand, policy, target, candidate),
      processPdf: async (bytes, context) => {
        const processed = await runMineruPdfWithImageFallback(bytes, {
          storageRoot: storageIdentity.root,
          maximumPdfBytes: policy.limits.maximumBytes,
        });
        await hooks.onMineruProcessed({
          contentSha256: context.contentSha256,
          derivedContentSha256: processed.derivedArtifact.contentSha256,
        });
        return processed;
      },
    })
  ));
  const result = await runHistoricalEvidenceShadowEpoch({
    runId: options.runId,
    resume: options.resume,
    manifest,
    activeRelease,
    inputSha256,
    inputSnapshotSha256: runtime.semanticSnapshotSha256,
    capabilityIdentity,
    targets,
    publicSearchCandidates,
  }, {
    store,
    discoverTarget,
    acquireArtifact,
    preflightArtifact: dependencies.preflightArtifact ?? ((target, artifact, candidate) => (
      preflightEvidenceArtifactForCase(target, artifact, {
        now: new Date().toISOString(),
        discoveryProvenance: candidate.discoveryProvenance,
        readObject: objectStore.readObject,
      })
    )),
    attestArtifact: dependencies.attestArtifact ?? ((target, artifact, candidate) => (
      attestEvidenceArtifactForCase(target, artifact, {
        now: new Date().toISOString(),
        requestedFields: target.requestedFields,
        claimSemanticsVersion: 2,
        requireRequestedFieldCoverage: true,
        discoveryProvenance: candidate.discoveryProvenance,
        readObject: objectStore.readObject,
      })
    )),
    observeArtifact: dependencies.observeArtifact ?? ((target, artifact, candidate) => (
      observeEvidenceArtifactDimensionsForCase(target, artifact, {
        market: 'AU',
        policyVersion: 'dimension-unit-observation-v1',
        discoveryProvenance: candidate.discoveryProvenance,
        readObject: objectStore.readObject,
      })
    )),
  });
  return emitResult(result);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runHistoricalEvidenceShadowEpochCli();
}
