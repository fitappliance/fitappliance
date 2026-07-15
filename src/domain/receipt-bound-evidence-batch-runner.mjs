import { canonicalJsonSha256, validateHistoricalEvidenceRecoveryBatch } from './historical-evidence-recovery-contract.mjs';
import { buildLowerAuthorityHints } from './evidence-claim-reconciliation.mjs';
import { expandOptionalOfficialEvidenceCandidates } from './evidence-candidate-inventory.mjs';

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${label} must be a positive integer`);
  return value;
}

export function createBoundedSemaphore(limit) {
  positiveInteger(limit, 'semaphore limit');
  let active = 0;
  const waiters = [];
  const acquire = () => {
    if (active < limit) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => waiters.push(resolve));
  };
  const release = () => {
    const next = waiters.shift();
    if (next) next();
    else active -= 1;
  };
  return Object.freeze({
    limit,
    async run(task) {
      if (typeof task !== 'function') throw new TypeError('semaphore task required');
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
  });
}

export function createNetworkSemaphore(globalLimit, perHostLimit) {
  positiveInteger(globalLimit, 'network concurrency');
  positiveInteger(perHostLimit, 'per-host concurrency');
  if (perHostLimit > globalLimit) throw new TypeError('per-host concurrency cannot exceed global network concurrency');
  const global = createBoundedSemaphore(globalLimit);
  const hosts = new Map();
  return Object.freeze({
    globalLimit,
    perHostLimit,
    async run(sourceUrl, task) {
      const host = new URL(sourceUrl).host.toLowerCase();
      let hostSemaphore = hosts.get(host);
      if (!hostSemaphore) {
        hostSemaphore = createBoundedSemaphore(perHostLimit);
        hosts.set(host, hostSemaphore);
      }
      return hostSemaphore.run(() => global.run(task));
    },
  });
}

function requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError(`${label} required`);
  return value;
}

function errorRecord(error, fallbackCode = 'transport') {
  const message = String(error?.message ?? error);
  const rawCode = String(error?.code ?? '').toLowerCase();
  const failureCode = [
    'environment', 'queue_drift', 'discovery', 'discovery_incomplete', 'transport',
    'payload', 'mineru', 'identity', 'claim_semantics', 'source_authority',
    'conflict', 'receipt',
  ].includes(rawCode) ? rawCode : fallbackCode;
  return { failureCode, reason: message };
}

function cloneWithoutOperationalTime(value) {
  if (Array.isArray(value)) return value.map(cloneWithoutOperationalTime);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key, child]) => child !== undefined
      && !['retrievedAt', 'verifiedAt', 'generatedAt', 'startedAt', 'completedAt'].includes(key))
    .map(([key, child]) => [key, cloneWithoutOperationalTime(child)]));
}

export function recoveryOutcomeSemanticSha256(outcome) {
  return canonicalJsonSha256(cloneWithoutOperationalTime({
    targetId: outcome.targetId,
    status: outcome.status,
    failureCode: outcome.failureCode,
    candidateInventorySha256: outcome.candidateInventorySha256,
    sources: outcome.sources,
    geometryProjection: outcome.geometryProjection,
    reconciliation: outcome.reconciliation,
  }));
}

function sortedStrings(values) {
  return [...new Set((values ?? []).map((value) => String(value)))].sort();
}

function sortedRecords(values) {
  return (values ?? [])
    .map((value) => structuredClone(value))
    .sort((left, right) => canonicalJsonSha256(left).localeCompare(canonicalJsonSha256(right)));
}

export function reconciliationDecisionSummary(reconciled) {
  if (!reconciled || typeof reconciled !== 'object') return null;
  return {
    conflictingFields: sortedStrings(reconciled.conflictingFields),
    conflictHints: sortedRecords(reconciled.conflictHints),
    missingFields: sortedStrings(reconciled.missingFields),
    supersessionViolations: sortedRecords(reconciled.supersessionViolations),
    axisPermutationResolution: reconciled.axisPermutationResolution ?? null,
    lowerAuthorityResolution: reconciled.lowerAuthorityResolution ?? null,
    conflictReason: reconciled.conflictReason ?? null,
  };
}

async function hydrateActiveReceiptSources(target, loadActiveReceiptSource) {
  const values = target.reconciliationContext?.activeReceiptSources ?? [];
  const hydrated = [];
  for (const value of values) {
    if (value?.claims && value?.verificationReceipt) {
      hydrated.push(structuredClone(value));
      continue;
    }
    if (typeof loadActiveReceiptSource !== 'function') {
      throw Object.assign(new Error(`active receipt source cannot be replayed for ${target.targetId}`), { code: 'receipt' });
    }
    const source = await loadActiveReceiptSource(structuredClone(value), structuredClone(target));
    if (!source || source.contentSha256 !== value.contentSha256
      || source.verificationReceipt?.bindingSha256 !== value.receiptBindingSha256) {
      throw Object.assign(new Error(`active receipt source binding mismatch for ${target.targetId}`), { code: 'receipt' });
    }
    hydrated.push(source);
  }
  return hydrated;
}

function batchResolver(jobs) {
  const resolver = {
    resolverId: 'batch-candidates',
    version: '1',
    scope: 'recovery_batch_graph',
    required: true,
    async resolve() {
      return {
        resolverId: resolver.resolverId,
        version: resolver.version,
        scope: resolver.scope,
        required: resolver.required,
        completion: 'complete',
        candidates: jobs.map((job) => ({
          sourceUrl: job.sourceUrl,
          authorityMode: job.authorityMode,
          sourceRole: job.authorityMode === 'official' ? 'manufacturer_document' : 'reference_document',
          discoveryMethod: 'recovery_batch',
          requiredAttempt: true,
          batchJobId: job.jobId,
        })),
      };
    },
  };
  return resolver;
}

function artifactSummary(job, state) {
  return {
    jobId: job.jobId,
    sourceUrl: job.sourceUrl,
    authorityMode: job.authorityMode,
    status: state.status,
    failureCode: state.failureCode,
    contentSha256: state.artifact?.contentSha256 ?? null,
  };
}

function needsIndependentOfficialCorroboration(reconciled, inventory) {
  if (reconciled?.status !== 'conflict_quarantined') return false;
  const requiresCorroboration = (reconciled.conflictHints ?? [])
    .some((hint) => ['axis_permutation', 'lower_authority_disagreement'].includes(hint.kind));
  if (!requiresCorroboration) return false;
  return (inventory?.candidates ?? []).some((candidate) => (
    candidate.authorityMode === 'official'
    && candidate.requiredAttempt === false
    && candidate.outcome?.status === 'not_attempted_optional'
  ));
}

function needsExactOfficialProductPageFallback(reconciled, inventory) {
  if (!['identity_rejected', 'claims_incomplete'].includes(reconciled?.status)) return false;
  return (inventory?.candidates ?? []).some((candidate) => (
    candidate.authorityMode === 'official'
    && candidate.sourceRole === 'manufacturer_product_page'
    && candidate.requiredAttempt === false
    && candidate.outcome?.status === 'not_attempted_optional'
  ));
}

function persistedArtifactRecord(artifact) {
  if (!artifact || typeof artifact !== 'object') return null;
  const {
    bytes: _bytes,
    derivedArtifactBytes: _derivedArtifactBytes,
    ...record
  } = artifact;
  return structuredClone(record);
}

export async function runReceiptBoundEvidenceBatch(batch, dependencies = {}) {
  validateHistoricalEvidenceRecoveryBatch(batch);
  const acquireArtifact = requiredFunction(dependencies.acquireArtifact, 'artifact acquisition function');
  const attestTarget = requiredFunction(dependencies.attestTarget, 'target attestation function');
  const collectCandidates = requiredFunction(dependencies.collectCandidates, 'candidate collector');
  const reconcileClaims = requiredFunction(dependencies.reconcileClaims, 'claim reconciler');
  const projectGeometry = requiredFunction(dependencies.projectGeometry, 'geometry projector');
  const onTransition = dependencies.onTransition ?? (async () => {});
  requiredFunction(onTransition, 'transition callback');

  const networkSemaphore = dependencies.networkSemaphore
    ?? createNetworkSemaphore(dependencies.networkConcurrency ?? 2, dependencies.perHostConcurrency ?? 1);
  const mineruSemaphore = dependencies.mineruSemaphore
    ?? createBoundedSemaphore(dependencies.mineruConcurrency ?? 1);
  if (typeof networkSemaphore.run !== 'function' || typeof mineruSemaphore.run !== 'function') {
    throw new TypeError('network and MinerU semaphores must expose run()');
  }

  const jobsById = new Map(batch.artifactJobs.map((job) => [job.jobId, job]));
  const artifactPromises = new Map();
  const artifactStates = new Map();
  const emit = async (delta) => onTransition(Object.freeze(structuredClone(delta)));

  const ensureArtifact = (job) => {
    const key = job.jobId;
    if (artifactPromises.has(key)) return artifactPromises.get(key);
    const promise = (async () => {
      try {
        const artifact = await networkSemaphore.run(job.sourceUrl, async () => {
          await emit({ entity: 'artifact', id: key, state: 'running', artifactJob: structuredClone(job) });
          return acquireArtifact(structuredClone(job), {
            withMineru: (task) => mineruSemaphore.run(task),
          });
        });
        if (!artifact || typeof artifact !== 'object') throw new TypeError('artifact acquisition returned no artifact');
        const state = { status: 'available', failureCode: null, reason: null, artifact };
        artifactStates.set(key, state);
        await emit({
          entity: 'artifact', id: key, state: 'available',
          contentSha256: artifact.contentSha256 ?? null,
          artifactRecord: persistedArtifactRecord(artifact),
        });
        return state;
      } catch (error) {
        const failure = errorRecord(error);
        const state = { status: 'failed', ...failure, artifact: null };
        artifactStates.set(key, state);
        await emit({ entity: 'artifact', id: key, state: 'failed', ...failure });
        return state;
      }
    })();
    artifactPromises.set(key, promise);
    return promise;
  };

  const initialJobs = [...batch.artifactJobs].sort((left, right) => left.jobId.localeCompare(right.jobId));
  await Promise.all(initialJobs.map(ensureArtifact));

  async function processTarget(target) {
    await emit({ entity: 'target', id: target.targetId, state: 'running' });
    const linkedJobs = target.candidateJobIds.map((jobId) => jobsById.get(jobId))
      .sort((left, right) => left.jobId.localeCompare(right.jobId));
    let inventory;
    let outcome;
    let reconciled = null;
    try {
      const activeReceiptSources = await hydrateActiveReceiptSources(target, dependencies.loadActiveReceiptSource);
      const extraResolvers = typeof dependencies.candidateResolversForTarget === 'function'
        ? await dependencies.candidateResolversForTarget(structuredClone(target))
        : [];
      if (!Array.isArray(extraResolvers)) throw new TypeError('candidateResolversForTarget must return an array');
      const resolverHost = String(target.brand ?? 'unknown')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
      const caseRecord = {
        id: target.targetId,
        targetId: target.targetId,
        brand: target.brand,
        model: target.model,
        category: target.category,
        sources: activeReceiptSources,
        reconciliationContext: structuredClone(target.reconciliationContext),
      };
      const acquireAndAttest = async (candidate) => {
        let job = candidate.batchJobIds.map((jobId) => jobsById.get(jobId)).find(Boolean);
        if (!job) {
          job = [...jobsById.values()].find((entry) => entry.sourceUrl === candidate.sourceUrl
            && entry.authorityMode === candidate.authorityMode);
        }
        if (!job) {
          job = {
            jobId: `discovered_${canonicalJsonSha256({
              authorityBrand: target.brand,
              authorityMode: candidate.authorityMode,
              sourceUrl: candidate.sourceUrl,
            }).slice(0, 24)}`,
            sourceUrl: candidate.sourceUrl,
            authorityBrand: target.brand,
            authorityMode: candidate.authorityMode,
            acquisitionRoute: 'OFFICIAL_SOURCE_DISCOVERY_REQUIRED',
            priorityClass: 'P2_CURRENT_CONFIRMATION',
            targetIds: [target.targetId],
          };
        }
        if (candidate.discoveryProvenance) {
          const provenanceSha = canonicalJsonSha256(candidate.discoveryProvenance);
          if (!job.discoveryProvenance) {
            job = {
              ...job,
              jobId: `discovered_${canonicalJsonSha256({
                authorityBrand: target.brand,
                authorityMode: candidate.authorityMode,
                sourceUrl: candidate.sourceUrl,
                provenanceSha,
              }).slice(0, 24)}`,
            };
          }
          job = {
            ...job,
            targetModel: target.model,
            discoveryProvenance: structuredClone(candidate.discoveryProvenance),
          };
        }
        const state = await ensureArtifact(job);
        if (state.status !== 'available') {
          throw Object.assign(new Error(state.reason), { code: state.failureCode });
        }
        return attestTarget({
          ...structuredClone(target),
          id: target.targetId,
          sources: structuredClone(activeReceiptSources),
        }, state.artifact, structuredClone(job), structuredClone(candidate));
      };
      inventory = await collectCandidates(caseRecord, {
        batchCandidateJobIds: target.candidateJobIds,
        activeReceiptSources,
        resolvers: [batchResolver(linkedJobs), ...extraResolvers],
        scheduleResolver: (task) => networkSemaphore.run(
          `https://${resolverHost}.resolver.fitappliance.invalid/`,
          task,
        ),
        acquireAndAttest,
        resolverTimeoutMs: dependencies.resolverTimeoutMs,
      });
      reconciled = await reconcileClaims({
        brand: target.brand,
        model: target.model,
        category: target.category,
      }, inventory, {
        requestedFields: target.requestedFields,
        lowerAuthorityHints: buildLowerAuthorityHints(target),
        verifyInventoryHash: true,
      });
      const needsCorroboration = needsIndependentOfficialCorroboration(reconciled, inventory);
      const needsProductPageFallback = needsExactOfficialProductPageFallback(reconciled, inventory);
      if (needsCorroboration || needsProductPageFallback) {
        inventory = await expandOptionalOfficialEvidenceCandidates(inventory, {
          acquireAndAttest,
          ...(needsCorroboration ? {} : { sourceRoles: ['manufacturer_product_page'] }),
        });
        reconciled = await reconcileClaims({
          brand: target.brand,
          model: target.model,
          category: target.category,
        }, inventory, {
          requestedFields: target.requestedFields,
          lowerAuthorityHints: buildLowerAuthorityHints(target),
          verifyInventoryHash: true,
        });
      }
      let geometryProjection = null;
      let status = reconciled.status;
      let failureCode = reconciled.failureCode;
      let sources = structuredClone(reconciled.sources ?? []);
      if (status === 'accepted') {
        try {
          geometryProjection = await projectGeometry({
            brand: target.brand,
            model: target.model,
            category: target.category,
            formFactor: null,
            sources,
          });
          if (!geometryProjection || typeof geometryProjection !== 'object') {
            throw new TypeError('geometry projector returned no projection');
          }
        } catch (error) {
          status = 'conflict_quarantined';
          failureCode = 'conflict';
          geometryProjection = null;
        }
      }
      if (!['accepted', 'receipt_accepted_non_scalar'].includes(status)) sources = [];
      outcome = {
        targetId: target.targetId,
        status,
        failureCode,
        candidateInventorySha256: inventory.candidateInventorySha256,
        candidateInventory: structuredClone(inventory),
        sources,
        geometryProjection,
        reconciliation: reconciliationDecisionSummary(reconciled),
      };
    } catch (error) {
      const failure = errorRecord(error, 'claim_semantics');
      outcome = {
        targetId: target.targetId,
        status: failure.failureCode === 'discovery' || failure.failureCode === 'discovery_incomplete'
          ? 'retryable_failure'
          : 'terminal_failure',
        failureCode: failure.failureCode,
        candidateInventorySha256: inventory?.candidateInventorySha256
          ?? canonicalJsonSha256({ targetId: target.targetId, failureCode: failure.failureCode }),
        candidateInventory: inventory ? structuredClone(inventory) : null,
        sources: [],
        geometryProjection: null,
        reconciliation: reconciliationDecisionSummary(reconciled),
      };
    }
    outcome.semanticOutcomeSha256 = recoveryOutcomeSemanticSha256(outcome);
    await emit({
      entity: 'target', id: target.targetId, state: 'completed',
      status: outcome.status, semanticOutcomeSha256: outcome.semanticOutcomeSha256,
      outcome: structuredClone(outcome),
    });
    return outcome;
  }

  const outcomes = (await Promise.all(
    [...batch.targets].sort((left, right) => left.targetId.localeCompare(right.targetId)).map(processTarget),
  )).sort((left, right) => left.targetId.localeCompare(right.targetId));
  if (new Set(outcomes.map((outcome) => outcome.targetId)).size !== batch.targets.length) {
    throw new Error('target outcome accounting mismatch');
  }
  const artifacts = [...artifactStates.entries()].map(([jobId, state]) => {
    const job = jobsById.get(jobId) ?? {
      jobId,
      sourceUrl: state.artifact?.sourceUrl ?? null,
      authorityMode: state.artifact?.authorityMode ?? 'official',
    };
    return artifactSummary(job, state);
  }).sort((left, right) => left.jobId.localeCompare(right.jobId));
  return {
    schemaVersion: 1,
    batchId: batch.batchId,
    artifacts,
    outcomes,
    summary: {
      artifacts: artifacts.length,
      artifactAvailable: artifacts.filter((entry) => entry.status === 'available').length,
      artifactFailed: artifacts.filter((entry) => entry.status === 'failed').length,
      targets: batch.targets.length,
      accounted: outcomes.length,
      accepted: outcomes.filter((entry) => entry.status === 'accepted').length,
      nonScalar: outcomes.filter((entry) => entry.status === 'receipt_accepted_non_scalar').length,
      retryable: outcomes.filter((entry) => entry.status === 'retryable_failure').length,
      terminal: outcomes.filter((entry) => !['accepted', 'receipt_accepted_non_scalar', 'retryable_failure'].includes(entry.status)).length,
    },
  };
}
