import * as defaultFs from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { canonicalJsonSha256 } from './historical-evidence-recovery-contract.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const RELEASE_ID = /^retail_lifecycle_release_[a-f0-9]{24}$/;

function text(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

function hash(value, label) {
  const result = text(value, label).toLowerCase();
  if (!SHA256.test(result)) throw new TypeError(`${label} must be a SHA-256`);
  return result;
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function array(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value;
}

function canonicalEqual(left, right) {
  return canonicalJsonSha256(left) === canonicalJsonSha256(right);
}

function timestamp(value, label) {
  const result = text(value, label);
  if (!Number.isFinite(Date.parse(result))) throw new TypeError(`${label} invalid`);
  return new Date(result).toISOString();
}

async function readOptionalJson(fs, path, fallback = null) {
  try { return JSON.parse(await fs.readFile(path, 'utf8')); } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

let writeCounter = 0;
async function atomicJson(fs, path, value) {
  await fs.mkdir(dirname(path), { recursive: true });
  writeCounter += 1;
  const temporary = `${path}.tmp-${process.pid}-${writeCounter}`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await fs.rename(temporary, path);
}

function bindingRecord(input) {
  if (input.manifest?.executionLane !== 'BOUNDED_DISCOVERY') {
    throw new TypeError('shadow epoch requires a BOUNDED_DISCOVERY manifest');
  }
  if (!Array.isArray(input.manifest.targetBindings)
    || input.manifest.targetBindings.length < 1
    || input.manifest.targetBindings.length > 25) {
    throw new TypeError('shadow epoch requires 1 to 25 manifest targets');
  }
  const releaseCandidateId = text(input.activeRelease?.releaseCandidateId, 'active release ID');
  if (!RELEASE_ID.test(releaseCandidateId)) throw new TypeError('active release ID invalid');
  const capabilitySha256 = canonicalJsonSha256(input.capabilityIdentity);
  return {
    manifestId: text(input.manifest.manifestId, 'manifest ID'),
    manifestSha256: hash(input.manifest.semanticManifestSha256, 'manifest SHA-256'),
    activeReleaseId: releaseCandidateId,
    activeReleaseSha256: hash(input.activeRelease.bindingSha256, 'active release SHA-256'),
    inputSha256: hash(input.inputSha256, 'input SHA-256'),
    capabilitySha256,
    capabilityIdentity: structuredClone(input.capabilityIdentity),
    ...(input.inputSnapshotSha256 ? {
      inputSnapshotSha256: hash(input.inputSnapshotSha256, 'input snapshot SHA-256'),
    } : {}),
  };
}

function assertResumeBindings(actual, expected) {
  const labels = {
    manifestId: 'manifest ID', manifestSha256: 'manifest', activeReleaseId: 'active release ID',
    activeReleaseSha256: 'active release', inputSha256: 'input', capabilitySha256: 'capability',
    inputSnapshotSha256: 'input snapshot',
  };
  for (const key of Object.keys(labels)) {
    if (actual?.[key] !== expected[key]) throw new Error(`${labels[key]} drift blocks resume`);
  }
}

function validateSnapshotManifest(value) {
  const manifest = object(value, 'shadow snapshot manifest');
  const { manifestId, semanticManifestSha256, ...semantic } = manifest;
  const computed = canonicalJsonSha256(semantic);
  if (hash(semanticManifestSha256, 'snapshot manifest SHA-256') !== computed
    || manifestId !== `historical_batch_${computed.slice(0, 24)}`) {
    throw new Error('shadow snapshot manifest semantic hash drift');
  }
  return manifest;
}

function selectedAcquisitionQueue(acquisitionQueue, targets) {
  const queue = object(acquisitionQueue, 'shadow acquisition queue');
  if (queue.schemaVersion !== 1) throw new TypeError('shadow acquisition queue schema v1 required');
  const records = array(queue.records, 'shadow acquisition records');
  const sources = array(queue.sources, 'shadow acquisition sources');
  const recordsByReference = new Map(records.map((record) => [record.referenceId, record]));
  if (recordsByReference.size !== records.length) {
    throw new Error('shadow acquisition queue has duplicate references');
  }
  const selectedRecords = targets.map((target) => {
    const record = recordsByReference.get(target.referenceId);
    if (!record || record.brand !== target.brand || record.model !== target.model
      || record.category !== target.category) {
      throw new Error(`shadow acquisition target binding drift: ${target.referenceId}`);
    }
    return structuredClone(record);
  });
  const requiredSourceIds = [...new Set(selectedRecords.flatMap((record) => (
    array(record.candidateSourceIds ?? [], `candidate source IDs for ${record.referenceId}`)
  )))].sort();
  const sourcesById = new Map(sources.map((source) => [source.sourceId, source]));
  if (sourcesById.size !== sources.length) throw new Error('shadow acquisition queue has duplicate sources');
  const selectedSources = requiredSourceIds.map((sourceId) => {
    const source = sourcesById.get(sourceId);
    if (!source) throw new Error(`shadow acquisition source missing: ${sourceId}`);
    return structuredClone(source);
  });
  return {
    schemaVersion: 1,
    generatedAt: text(queue.generatedAt, 'shadow acquisition queue generatedAt'),
    semanticQueueSha256: hash(queue.semanticQueueSha256, 'shadow acquisition queue SHA-256'),
    records: selectedRecords,
    sources: selectedSources,
    summary: { queuedModels: selectedRecords.length },
  };
}

function validateSnapshotShape(snapshot) {
  const value = object(snapshot, 'shadow input snapshot');
  if (value.schemaVersion !== 1) throw new TypeError('shadow input snapshot schema v1 required');
  const runId = text(value.runId, 'snapshot run ID');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runId)) throw new TypeError('snapshot run ID invalid');
  validateSnapshotManifest(value.manifest);
  const targets = validateTargetGraph(value);
  const expectedBindings = bindingRecord(value);
  if (!canonicalEqual(value.bindings, expectedBindings)) {
    throw new Error('shadow input snapshot binding drift');
  }
  const selectedQueue = selectedAcquisitionQueue(value.acquisitionQueue, targets);
  if (!canonicalEqual(value.acquisitionQueue, selectedQueue)) {
    throw new Error('shadow input snapshot acquisition subset drift');
  }
  object(value.policy, 'shadow snapshot policy');
  const publicSearchCandidates = array(
    value.publicSearchCandidates,
    'shadow snapshot public-search candidates',
  );
  const targetsById = new Map(targets.map((target) => [target.targetId, target]));
  for (const candidate of publicSearchCandidates) {
    const target = targetsById.get(candidate?.targetId);
    if (!target) throw new Error('shadow snapshot public-search target binding drift');
    normalizedCandidate(candidate, 'PUBLIC_SEARCH', target, value.activeRelease);
  }
  const { semanticSnapshotSha256, ...semantic } = value;
  if (hash(semanticSnapshotSha256, 'shadow input snapshot SHA-256')
    !== canonicalJsonSha256(semantic)) {
    throw new Error('shadow input snapshot semantic hash drift');
  }
  return value;
}

export function buildHistoricalEvidenceShadowInputSnapshot(input) {
  const runId = text(input.runId, 'snapshot run ID');
  const manifest = structuredClone(validateSnapshotManifest(input.manifest));
  const targets = validateTargetGraph(input);
  const activeRelease = structuredClone(object(input.activeRelease, 'snapshot active release'));
  const capabilityIdentity = structuredClone(object(
    input.capabilityIdentity,
    'snapshot capability identity',
  ));
  const semantic = {
    schemaVersion: 1,
    runId,
    bindings: bindingRecord(input),
    manifest,
    targets,
    acquisitionQueue: selectedAcquisitionQueue(input.acquisitionQueue, targets),
    policy: structuredClone(object(input.policy, 'snapshot policy')),
    activeRelease,
    inputSha256: hash(input.inputSha256, 'snapshot input SHA-256'),
    capabilityIdentity,
    publicSearchCandidates: structuredClone(array(
      input.publicSearchCandidates ?? [],
      'snapshot public-search candidates',
    )),
  };
  return validateSnapshotShape({
    ...semantic,
    semanticSnapshotSha256: canonicalJsonSha256(semantic),
  });
}

export function validateHistoricalEvidenceShadowInputSnapshot(snapshot) {
  return validateSnapshotShape(snapshot);
}

export function validateHistoricalEvidenceShadowCompletedReport(state, report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('completed shadow result missing');
  }
  const { semanticReportSha256, ...semantic } = report;
  const computed = canonicalJsonSha256(semantic);
  if (hash(semanticReportSha256, 'completed shadow result SHA-256') !== computed
    || state?.semanticReportSha256 !== computed) {
    throw new Error('completed shadow result semantic hash drift');
  }
  if (report.runId !== state?.runId || !canonicalEqual(report.bindings, state?.bindings)) {
    throw new Error('completed shadow state and result binding drift');
  }
  return report;
}

export function createHistoricalEvidenceShadowEpochStore({
  storageRoot, runId, fs = defaultFs, now = () => new Date().toISOString(),
}) {
  const root = resolve(text(storageRoot, 'storage root'));
  const safeRunId = text(runId, 'run ID');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(safeRunId)) throw new TypeError('run ID invalid');
  const runDirectory = join(root, 'runs', 'historical-evidence-shadow', safeRunId);
  const paths = Object.freeze({
    runDirectory,
    state: join(runDirectory, 'state.json'),
    results: join(runDirectory, 'results.json'),
    familyHistory: join(root, 'runs', 'historical-evidence-shadow', 'family-attempts.json'),
    candidateManifest: join(runDirectory, 'candidate-manifest.json'),
    inputSnapshot: join(runDirectory, 'input-snapshot.json'),
    artifactRecords: join(runDirectory, 'artifact-records'),
  });

  return Object.freeze({
    paths,
    async inspectResume({ manifestId, activeReleaseId }) {
      const existing = await readOptionalJson(fs, paths.state);
      if (!existing) throw new Error('resume requested but shadow state is missing');
      if (existing.runId !== safeRunId) throw new Error('shadow state run ID drift');
      if (existing.bindings?.manifestId !== manifestId) throw new Error('manifest ID drift blocks resume');
      if (existing.bindings?.activeReleaseId !== activeReleaseId) {
        throw new Error('active release ID drift blocks resume');
      }
      if (!['RUNNING', 'COMPLETED'].includes(existing.status)) {
        throw new Error('shadow state status invalid');
      }
      if (existing.status === 'COMPLETED') {
        const report = await readOptionalJson(fs, paths.results);
        return {
          state: existing,
          report: validateHistoricalEvidenceShadowCompletedReport(existing, report),
        };
      }
      return { state: existing, report: null };
    },
    async writeInputSnapshot(snapshot) {
      const value = validateHistoricalEvidenceShadowInputSnapshot(snapshot);
      if (value.runId !== safeRunId) throw new Error('shadow input snapshot run ID drift');
      const existing = await readOptionalJson(fs, paths.inputSnapshot);
      if (existing) {
        const validated = validateHistoricalEvidenceShadowInputSnapshot(existing);
        if (validated.semanticSnapshotSha256 !== value.semanticSnapshotSha256) {
          throw new Error('shadow input snapshot re-completion drift');
        }
        return validated;
      }
      await atomicJson(fs, paths.inputSnapshot, value);
      return value;
    },
    async readInputSnapshot() {
      const value = await readOptionalJson(fs, paths.inputSnapshot);
      if (!value) throw new Error('incomplete shadow run input snapshot missing');
      const validated = validateHistoricalEvidenceShadowInputSnapshot(value);
      if (validated.runId !== safeRunId) throw new Error('shadow input snapshot run ID drift');
      return validated;
    },
    async open({ resume, bindings, targets }) {
      const existing = await readOptionalJson(fs, paths.state);
      if (resume) {
        if (!existing) throw new Error('resume requested but shadow state is missing');
        assertResumeBindings(existing.bindings, bindings);
        if (JSON.stringify(Object.keys(existing.targets).sort())
          !== JSON.stringify(targets.map((target) => target.targetId).sort())) {
          throw new Error('target graph drift blocks resume');
        }
        return existing;
      }
      if (existing) throw new Error('shadow run already exists; use --resume or another run ID');
      const startedAt = timestamp(now(), 'shadow start time');
      const state = {
        schemaVersion: 1,
        runId: safeRunId,
        status: 'RUNNING',
        startedAt,
        updatedAt: startedAt,
        bindings: structuredClone(bindings),
        targets: Object.fromEntries(targets.map((target) => [target.targetId, {
          checkpoint: 'QUEUED', candidates: null, discoveryOutputSha256: null,
          startedAt: null, funnel: [], failures: [], artifactRecords: [], decision: null,
        }])),
      };
      await atomicJson(fs, paths.state, state);
      return state;
    },
    async checkpoint(state) {
      state.updatedAt = timestamp(now(), 'checkpoint time');
      await atomicJson(fs, paths.state, state);
      return state;
    },
    async readResults() {
      return readOptionalJson(fs, paths.results);
    },
    async writeFinal(state, report) {
      await atomicJson(fs, paths.results, report);
      const next = structuredClone(state);
      next.status = 'COMPLETED';
      next.updatedAt = timestamp(now(), 'completion time');
      next.semanticReportSha256 = report.semanticReportSha256;
      await atomicJson(fs, paths.state, next);
      return next;
    },
    async readFamilyHistory() {
      const value = await readOptionalJson(fs, paths.familyHistory, { schemaVersion: 1, attempts: [] });
      if (value?.schemaVersion !== 1 || !Array.isArray(value.attempts)) {
        throw new Error('shadow family attempt history invalid');
      }
      return value;
    },
    async appendFamilyAttempt(attempt) {
      const history = await this.readFamilyHistory();
      const existing = history.attempts.find((value) => (
        value.runId === attempt.runId
        && value.targetId === attempt.targetId
        && value.capabilitySha256 === attempt.capabilitySha256
      ));
      if (existing) {
        if (canonicalJsonSha256(existing) !== canonicalJsonSha256(attempt)) {
          throw new Error('family attempt re-completion drift');
        }
        return history;
      }
      history.attempts.push(structuredClone(attempt));
      await atomicJson(fs, paths.familyHistory, history);
      return history;
    },
  });
}

function validateTargetGraph(input) {
  if (!Array.isArray(input.targets)) throw new TypeError('shadow targets required');
  const byId = new Map(input.targets.map((target) => [target.targetId, target]));
  if (byId.size !== input.targets.length) throw new TypeError('duplicate shadow target ID');
  return input.manifest.targetBindings.map((binding) => {
    const target = byId.get(binding.targetId);
    if (!target || target.referenceId !== binding.referenceId) {
      throw new Error(`manifest target binding drift: ${binding.targetId}`);
    }
    if (target.lifecycleState !== 'CURRENT_RETAIL') {
      throw new Error(`shadow target is not CURRENT_RETAIL: ${binding.referenceId}`);
    }
    return structuredClone(target);
  });
}

function normalizedCandidate(candidate, source, target, activeRelease) {
  if (candidate?.authorityMode !== 'official') throw new Error('shadow candidate must be official');
  const sourceUrl = new URL(text(candidate.sourceUrl, 'candidate URL')).toString();
  if (!sourceUrl.startsWith('https://')) throw new Error('shadow candidate must use HTTPS');
  if (source === 'PUBLIC_SEARCH') {
    if (candidate.targetId !== target.targetId || candidate.referenceId !== target.referenceId
      || candidate.activeReleaseId !== activeRelease.releaseCandidateId
      || candidate.activeReleaseSha256 !== activeRelease.bindingSha256) {
      throw new Error('public search candidate binding drift');
    }
  }
  return {
    candidateId: text(candidate.candidateId, 'candidate ID'), sourceUrl,
    authorityMode: 'official', source,
    discoveryProvenance: candidate.discoveryProvenance ?? null,
  };
}

function familyKey(input, binding) {
  return text(
    binding.familyId ?? input.manifest.familyId ?? input.manifest.cohortKey,
    'family or cohort key',
  );
}

function consecutiveNoYield(history, key, capabilitySha256) {
  const relevant = history.attempts.filter((attempt) => (
    attempt.familyKey === key && attempt.capabilitySha256 === capabilitySha256
  ));
  let count = 0;
  for (const attempt of relevant.reverse()) {
    if (attempt.explicitReceiptCount !== 0 || attempt.observationCount !== 0) break;
    count += 1;
  }
  return count;
}

function artifactRecord(artifact, candidate) {
  return {
    candidateId: candidate.candidateId,
    sourceUrl: candidate.sourceUrl,
    contentSha256: hash(artifact.contentSha256, 'artifact content SHA-256'),
    contentType: text(artifact.contentType, 'artifact content type'),
    ...(artifact.finalUrl ? { finalUrl: new URL(artifact.finalUrl).toString() } : {}),
    ...(artifact.transport ? { transport: text(artifact.transport, 'artifact transport') } : {}),
    ...(artifact.objectPath ? { objectPath: text(artifact.objectPath, 'artifact object path') } : {}),
    ...(artifact.derivedArtifact?.contentSha256 ? {
      derivedContentSha256: hash(artifact.derivedArtifact.contentSha256, 'derived content SHA-256'),
    } : {}),
    identityVerified: false,
  };
}

function addFunnel(targetState, event) {
  const semantic = { ...event };
  delete semantic.at;
  const eventSha256 = canonicalJsonSha256(semantic);
  if (!targetState.funnel.some((entry) => entry.eventSha256 === eventSha256)) {
    targetState.funnel.push({ ...event, eventSha256 });
  }
}

function addFailure(targetState, failure) {
  const failureSha256 = canonicalJsonSha256(failure);
  if (!targetState.failures.some((entry) => entry.failureSha256 === failureSha256)) {
    targetState.failures.push({ ...failure, failureSha256 });
  }
}

function targetElapsed(startedAt, completedAt) {
  return Math.max(0, Date.parse(completedAt) - Date.parse(startedAt));
}

export async function runHistoricalEvidenceShadowEpoch(input, dependencies = {}) {
  const targets = validateTargetGraph(input);
  const bindings = bindingRecord(input);
  const store = dependencies.store;
  if (!store?.open || !store?.checkpoint || !store?.writeFinal) {
    throw new TypeError('shadow epoch external checkpoint store required');
  }
  for (const name of [
    'discoverTarget', 'acquireArtifact', 'preflightArtifact', 'attestArtifact', 'observeArtifact',
  ]) {
    if (typeof dependencies[name] !== 'function') throw new TypeError(`${name} required`);
  }
  const now = dependencies.now ?? (() => new Date().toISOString());
  let state = await store.open({ resume: input.resume === true, bindings, targets });
  if (state.status === 'COMPLETED') {
    const existing = await store.readResults();
    return validateHistoricalEvidenceShadowCompletedReport(state, existing);
  }
  const history = await store.readFamilyHistory();
  const publicByTarget = new Map();
  for (const candidate of input.publicSearchCandidates ?? []) {
    const values = publicByTarget.get(candidate.targetId) ?? [];
    values.push(candidate);
    publicByTarget.set(candidate.targetId, values);
  }

  for (const [index, target] of targets.entries()) {
    const binding = input.manifest.targetBindings[index];
    const targetState = state.targets[target.targetId];
    if (targetState.decision) continue;
    if (targetState.pendingDecision) {
      const updatedHistory = await store.appendFamilyAttempt(targetState.pendingDecision.familyAttempt);
      history.attempts = updatedHistory.attempts;
      targetState.decision = structuredClone(targetState.pendingDecision.result);
      targetState.pendingDecision = null;
      targetState.checkpoint = 'DECISION_COMPLETE';
      state = await store.checkpoint(state);
      continue;
    }
    targetState.startedAt ??= timestamp(now(), 'target start time');
    const startedAt = targetState.startedAt;
    targetState.funnel ??= [];
    targetState.failures ??= [];
    const key = familyKey(input, binding);
    const priorNoYield = consecutiveNoYield(history, key, bindings.capabilitySha256);
    if (priorNoYield >= 2) {
      const completedAt = timestamp(now(), 'target completion time');
      targetState.decision = {
        targetId: target.targetId, referenceId: target.referenceId, familyKey: key,
        attempted: false, terminalResult: 'FAMILY_NO_YIELD_STOP',
        explicitReceiptCount: 0, observationCount: 0, sourceContentSha256s: [],
        startedAt, completedAt, elapsedMs: targetElapsed(startedAt, completedAt),
        verifiedOfficialArtifacts: 0,
        artifacts: [],
        funnel: [{
          state: 'FAMILY_NO_YIELD_STOP', at: completedAt,
          eventSha256: canonicalJsonSha256({ state: 'FAMILY_NO_YIELD_STOP' }),
        }],
        failures: [],
      };
      targetState.checkpoint = 'DECISION_COMPLETE';
      state = await store.checkpoint(state);
      continue;
    }

    let candidates;
    if (Array.isArray(targetState.candidates)) {
      candidates = structuredClone(targetState.candidates);
    } else {
      const discovered = await dependencies.discoverTarget(structuredClone(target));
      const resolver = (discovered?.candidates ?? []).map((candidate) => (
        normalizedCandidate(candidate, 'RESOLVER', target, input.activeRelease)
      ));
      const imported = resolver.length ? [] : (publicByTarget.get(target.targetId) ?? []).map((candidate) => (
        normalizedCandidate(candidate, 'PUBLIC_SEARCH', target, input.activeRelease)
      ));
      candidates = [...resolver, ...imported];
      targetState.candidates = structuredClone(candidates);
      targetState.discoveryOutputSha256 = hash(
        discovered?.outputSha256 ?? canonicalJsonSha256(discovered ?? {}),
        'discovery output SHA-256',
      );
      targetState.checkpoint = 'DISCOVERY_COMPLETE';
      addFunnel(targetState, {
        state: 'DISCOVERY_COMPLETE', at: timestamp(now(), 'discovery completion time'),
        outputSha256: targetState.discoveryOutputSha256,
        candidates: candidates.length,
      });
      state = await store.checkpoint(state);
    }

    let explicitReceiptCount = 0;
    let observationCount = 0;
    if (!candidates.length) {
      addFunnel(targetState, {
        state: 'PUBLIC_SEARCH_REQUIRED', at: timestamp(now(), 'search stop time'),
      });
    } else {
      for (const candidate of candidates) {
        let artifact;
        try {
          artifact = await dependencies.acquireArtifact(target, candidate, {
            onMineruProcessed: async (mineru) => {
              targetState.checkpoint = 'MINERU_PROCESSED';
              targetState.lastMineru = structuredClone(mineru);
              addFunnel(targetState, {
                state: 'MINERU_PROCESSED', at: timestamp(now(), 'MinerU completion time'),
                candidateId: candidate.candidateId,
                contentSha256: mineru.contentSha256,
                derivedContentSha256: mineru.derivedContentSha256,
              });
              state = await store.checkpoint(state);
            },
          });
        } catch (error) {
          if (error?.code === 'INTERRUPTED') throw error;
          addFailure(targetState, { candidateId: candidate.candidateId, stage: 'ACQUISITION', reason: String(error?.message ?? error) });
          addFunnel(targetState, { state: 'ARTIFACT_ACQUISITION_FAILED', at: timestamp(now(), 'acquisition failure time'), candidateId: candidate.candidateId });
          targetState.checkpoint = 'ARTIFACT_ATTEMPTED';
          state = await store.checkpoint(state);
          continue;
        }
        const record = artifactRecord(artifact, candidate);
        let persistedRecord = targetState.artifactRecords.find((existing) => (
          existing.candidateId === record.candidateId
          && existing.contentSha256 === record.contentSha256
        ));
        if (!persistedRecord) {
          targetState.artifactRecords.push(record);
          persistedRecord = record;
        }
        targetState.checkpoint = 'ARTIFACT_ACQUIRED';
        addFunnel(targetState, { state: 'ARTIFACT_ACQUIRED', at: timestamp(now(), 'acquisition time'), ...record });
        state = await store.checkpoint(state);
        if (!persistedRecord.identityVerified) {
          try {
            await dependencies.preflightArtifact(target, artifact, candidate);
            persistedRecord.identityVerified = true;
            targetState.checkpoint = 'IDENTITY_VERIFIED';
            addFunnel(targetState, {
              state: 'IDENTITY_VERIFIED', at: timestamp(now(), 'identity verification time'),
              candidateId: candidate.candidateId, contentSha256: record.contentSha256,
            });
            state = await store.checkpoint(state);
          } catch (error) {
            if (error?.code === 'INTERRUPTED') throw error;
            addFailure(targetState, {
              candidateId: candidate.candidateId, stage: 'IDENTITY',
              reason: String(error?.message ?? error),
            });
            targetState.checkpoint = 'IDENTITY_NOT_VERIFIED';
            addFunnel(targetState, {
              state: 'IDENTITY_NOT_VERIFIED', at: timestamp(now(), 'identity rejection time'),
              candidateId: candidate.candidateId, contentSha256: record.contentSha256,
            });
            state = await store.checkpoint(state);
            continue;
          }
        }
        try {
          const attested = await dependencies.attestArtifact(target, artifact, candidate);
          if (attested?.source?.verificationReceipt) explicitReceiptCount += 1;
        } catch (error) {
          addFailure(targetState, { candidateId: candidate.candidateId, stage: 'ATTESTATION', reason: String(error?.message ?? error) });
        }
        try {
          const observed = await dependencies.observeArtifact(target, artifact, candidate);
          observationCount += observed?.dimensionUnitObservations?.length ?? 0;
        } catch (error) {
          addFailure(targetState, { candidateId: candidate.candidateId, stage: 'OBSERVATION', reason: String(error?.message ?? error) });
        }
        if (explicitReceiptCount > 0 || observationCount > 0) break;
      }
    }

    const verifiedOfficialArtifacts = targetState.artifactRecords
      .filter((record) => record.identityVerified).length;
    let terminalResult = explicitReceiptCount > 0 ? 'EXPLICIT_RECEIPT'
      : observationCount > 0 ? 'SHADOW_OBSERVATION'
        : candidates.length === 0 ? 'PUBLIC_SEARCH_REQUIRED'
          : verifiedOfficialArtifacts > 0 ? 'VERIFIED_OFFICIAL_ARTIFACT_NO_DIMENSION_YIELD'
            : targetState.artifactRecords.length > 0 ? 'IDENTITY_NOT_VERIFIED'
              : 'NO_YIELD';
    const completedAt = timestamp(now(), 'target completion time');
    const noYield = explicitReceiptCount === 0 && observationCount === 0;
    const attempt = {
      runId: input.runId, targetId: target.targetId, referenceId: target.referenceId,
      familyKey: key, capabilitySha256: bindings.capabilitySha256,
      explicitReceiptCount, observationCount, terminalResult, completedAt,
    };
    if (noYield && priorNoYield + 1 >= 2) {
      attempt.underlyingResult = terminalResult;
      terminalResult = 'FAMILY_NO_YIELD_STOP';
      attempt.terminalResult = terminalResult;
    }
    addFunnel(targetState, { state: terminalResult, at: completedAt });
    const result = {
      targetId: target.targetId, referenceId: target.referenceId, familyKey: key,
      attempted: true, terminalResult,
      ...(attempt.underlyingResult ? { underlyingResult: attempt.underlyingResult } : {}),
      explicitReceiptCount, observationCount,
      verifiedOfficialArtifacts,
      sourceContentSha256s: [...new Set(targetState.artifactRecords
        .map((record) => record.contentSha256))].sort(),
      artifacts: structuredClone(targetState.artifactRecords),
      candidateInputSha256: canonicalJsonSha256(candidates),
      startedAt, completedAt, elapsedMs: targetElapsed(startedAt, completedAt),
      funnel: structuredClone(targetState.funnel),
      failures: structuredClone(targetState.failures),
    };
    targetState.pendingDecision = { familyAttempt: attempt, result };
    targetState.checkpoint = 'DECISION_PREPARED';
    state = await store.checkpoint(state);
    const updatedHistory = await store.appendFamilyAttempt(attempt);
    history.attempts = updatedHistory.attempts;
    targetState.decision = result;
    targetState.pendingDecision = null;
    targetState.checkpoint = 'DECISION_COMPLETE';
    state = await store.checkpoint(state);
  }

  const targetResults = targets.map((target) => state.targets[target.targetId].decision);
  const verifiedOfficialArtifacts = targetResults
    .reduce((sum, target) => sum + target.verifiedOfficialArtifacts, 0);
  const targetsWithVerifiedOfficialArtifacts = targetResults
    .filter((target) => target.verifiedOfficialArtifacts > 0).length;
  const semantic = {
    schemaVersion: 1,
    runId: input.runId,
    bindings,
    policy: {
      shadowOnly: true, publicSearchInvoked: false, publicWrites: false,
      generatedWrites: false, replacementWrites: false,
    },
    targets: targetResults,
    summary: {
      targets: targetResults.length,
      attempted: targetResults.filter((target) => target.attempted).length,
      verifiedOfficialArtifacts,
      measuredCoverage: {
        targetsWithVerifiedOfficialArtifacts,
        targets: targetResults.length,
        ratio: targetResults.length
          ? Number((targetsWithVerifiedOfficialArtifacts / targetResults.length).toFixed(6))
          : 0,
      },
      yield: {
        explicitReceipts: targetResults.reduce((sum, target) => sum + target.explicitReceiptCount, 0),
        observations: targetResults.reduce((sum, target) => sum + target.observationCount, 0),
      },
    },
  };
  const report = { ...semantic, semanticReportSha256: canonicalJsonSha256(semantic) };
  await store.writeFinal(state, report);
  return report;
}
