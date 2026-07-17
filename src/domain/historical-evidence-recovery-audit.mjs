import { createHash } from 'node:crypto';

import { verifyAttestedResolutionArtifact } from './evidence-artifact-verifier.mjs';
import { computeCandidateInventorySha256 } from './evidence-candidate-inventory.mjs';
import {
  buildLowerAuthorityHints,
  reconcileEvidenceClaims,
} from './evidence-claim-reconciliation.mjs';
import { projectEvidenceGeometry } from './evidence-geometry-projector.mjs';
import {
  canonicalJsonSha256,
  validateHistoricalEvidenceRecoveryAcceptanceBundle,
  validateHistoricalEvidenceRecoveryAudit,
  validateHistoricalEvidenceRecoveryBatch,
  validateHistoricalEvidenceRecoveryPolicy,
  validateHistoricalEvidenceRecoveryResults,
} from './historical-evidence-recovery-contract.mjs';
import {
  reconciliationDecisionSummary,
  recoveryOutcomeSemanticSha256,
} from './receipt-bound-evidence-batch-runner.mjs';
import { verifyVerificationReceipt } from './evidence-source-verifier.mjs';

function requiredTimestamp(value, label) {
  const text = String(value ?? '').trim();
  if (!Number.isFinite(Date.parse(text))) throw new TypeError(`${label} invalid`);
  return new Date(text).toISOString();
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function same(left, right) {
  return canonicalJsonSha256(left) === canonicalJsonSha256(right);
}

function resultsSemanticSha256(outcomes) {
  return canonicalJsonSha256([...outcomes]
    .sort((left, right) => left.targetId.localeCompare(right.targetId))
    .map((outcome) => ({
      targetId: outcome.targetId,
      semanticOutcomeSha256: outcome.semanticOutcomeSha256,
    })));
}

function identityKey(value) {
  const normalize = (input) => String(input ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
  return `${normalize(value.brand)}\0${normalize(value.model)}\0${value.category}`;
}

function addViolation(violations, label, error) {
  const detail = String(error?.message ?? error).replace(/\s+/g, ' ').trim();
  violations.push(`${label}: ${detail}`);
}

function validateInventoryForTarget(inventory, target, outcome) {
  if (!inventory || typeof inventory !== 'object') throw new Error('candidate inventory missing');
  if (computeCandidateInventorySha256(inventory) !== outcome.candidateInventorySha256
    || inventory.candidateInventorySha256 !== outcome.candidateInventorySha256) {
    throw new Error('candidate inventory hash mismatch');
  }
  if (inventory.targetId !== target.targetId
    || identityKey(inventory.identity) !== identityKey(target)) {
    throw new Error('candidate inventory target identity mismatch');
  }
  if (inventory.completionStatus !== 'complete'
    || inventory.incompleteResolvers?.length
    || inventory.missingBatchCandidateJobIds?.length) {
    throw new Error('candidate inventory discovery incomplete');
  }
  if ((inventory.resolvers ?? []).some((resolver) => resolver.required && resolver.completion !== 'complete')) {
    throw new Error('required resolver did not complete');
  }
  const representedBatchJobs = new Set((inventory.candidates ?? []).flatMap((candidate) => candidate.batchJobIds ?? []));
  for (const jobId of target.candidateJobIds) {
    if (!representedBatchJobs.has(jobId)) throw new Error(`candidate inventory missing batch job ${jobId}`);
  }
  for (const candidate of inventory.candidates ?? []) {
    if (candidate.authorityMode === 'reference') {
      if (candidate.outcome?.status !== 'reference_only' || candidate.outcome?.source) {
        throw new Error('reference candidate produced authoritative evidence');
      }
      continue;
    }
    if (candidate.requiredAttempt && (!candidate.outcome
      || candidate.outcome.status === 'not_attempted_optional')) {
      throw new Error('required official candidate was not attempted');
    }
  }
  const inventorySourceHashes = new Set([
    ...(inventory.activeReceiptSources ?? []).map((source) => source.contentSha256),
    ...(inventory.candidates ?? []).map((candidate) => candidate.outcome?.source?.contentSha256).filter(Boolean),
  ]);
  for (const source of outcome.sources ?? []) {
    if (!inventorySourceHashes.has(source.contentSha256)) {
      throw new Error(`accepted source is absent from candidate inventory: ${source.contentSha256}`);
    }
  }
}

function validateReconciliationReplay(target, outcome, policy) {
  const inventory = outcome.candidateInventory;
  if (!inventory) return;
  const replayed = reconcileEvidenceClaims({
    brand: target.brand,
    model: target.model,
    category: target.category,
  }, inventory, {
    registryAxisPermutationToleranceMm: policy?.reconciliation?.registryAxisPermutationToleranceMm ?? 0,
    officialSemanticResolutionVersion: policy?.reconciliation?.officialSemanticResolutionVersion ?? 0,
    requestedFields: target.requestedFields,
    lowerAuthorityHints: buildLowerAuthorityHints(target),
    verifyInventoryHash: true,
  });
  if (replayed.status !== outcome.status || replayed.failureCode !== outcome.failureCode) {
    throw new Error(`reconciliation replay mismatch: expected ${replayed.status}/${replayed.failureCode ?? 'none'}, recorded ${outcome.status}/${outcome.failureCode ?? 'none'}`);
  }
  if (!same(reconciliationDecisionSummary(replayed), outcome.reconciliation)) {
    throw new Error('reconciliation replay decision summary mismatch');
  }
  if (['accepted', 'receipt_accepted_non_scalar'].includes(outcome.status)) {
    const replayedHashes = (replayed.sources ?? []).map((source) => source.contentSha256).sort();
    const recordedHashes = (outcome.sources ?? []).map((source) => source.contentSha256).sort();
    if (!same(replayedHashes, recordedHashes)) {
      throw new Error('reconciliation replay accepted source set mismatch');
    }
  }
}

function validateState(state, batch, results) {
  if (!state || typeof state !== 'object') throw new Error('authoritative run state required');
  if (state.status !== 'completed' || state.runId !== results.runId || state.batchId !== batch.batchId) {
    throw new Error('run state identity or completion mismatch');
  }
  if (state.input?.batchSha256 !== results.batchSha256
    || state.input?.queueSha256 !== results.queueSha256
    || state.input?.policySha256 !== results.policySha256
    || state.semanticOutcomeSha256 !== results.semanticOutcomeSha256) {
    throw new Error('run state input or semantic binding mismatch');
  }
  const resultTargets = new Map(results.outcomes.map((outcome) => [outcome.targetId, outcome]));
  if (Object.keys(state.targets ?? {}).length !== resultTargets.size) {
    throw new Error('run state target accounting mismatch');
  }
  for (const [targetId, outcome] of resultTargets) {
    const stateTarget = state.targets?.[targetId];
    if (stateTarget?.state !== 'completed' || !same(stateTarget.outcome, outcome)) {
      throw new Error(`run state outcome mismatch for ${targetId}`);
    }
  }
}

async function verifyOnlineSource(source, identity, readObject, verifiedObjects) {
  if (typeof readObject !== 'function') throw new TypeError('online audit object reader required');
  const raw = Buffer.from(await readObject(source.objectPath));
  if (raw.length !== source.byteSize || sha256(raw) !== source.contentSha256) {
    throw new Error('raw evidence object hash or size mismatch');
  }
  let derived = null;
  let fallbackTrigger = null;
  if (source.derivedArtifact) {
    derived = Buffer.from(await readObject(source.derivedArtifact.objectPath));
    if (derived.length !== source.derivedArtifact.byteSize
      || sha256(derived) !== source.derivedArtifact.contentSha256) {
      throw new Error('MinerU object hash or size mismatch');
    }
    verifiedObjects.add(source.derivedArtifact.objectPath);
    if (source.derivedArtifact.fallbackTrigger) {
      fallbackTrigger = Buffer.from(await readObject(source.derivedArtifact.fallbackTrigger.objectPath));
      if (sha256(fallbackTrigger) !== source.derivedArtifact.fallbackTrigger.contentSha256) {
        throw new Error('MinerU fallback trigger object hash mismatch');
      }
      verifiedObjects.add(source.derivedArtifact.fallbackTrigger.objectPath);
    }
  }
  let discovery = null;
  if (source.discoveryProvenance?.discoveryObjectPath) {
    discovery = Buffer.from(await readObject(source.discoveryProvenance.discoveryObjectPath));
    verifiedObjects.add(source.discoveryProvenance.discoveryObjectPath);
  }
  verifyAttestedResolutionArtifact({
    source,
    caseIdentity: identity,
    bytes: raw,
    derivedArtifactBytes: derived,
    fallbackTriggerArtifactBytes: fallbackTrigger,
    discoveryArtifactBytes: discovery,
  });
  verifiedObjects.add(source.objectPath);
}

function replayBundleEntry(entry) {
  const identity = { brand: entry.brand, model: entry.model, category: entry.category };
  for (const source of entry.sources) {
    verifyVerificationReceipt(source, identity, { asOf: source.verificationReceipt?.verifiedAt });
  }
  if (entry.geometryProjection !== null) {
    const replayed = projectEvidenceGeometry({ ...identity, formFactor: null, sources: entry.sources });
    if (!same(replayed, entry.geometryProjection)) throw new Error('bundle geometry projection replay mismatch');
  }
}

function immutableRawArtifactBinding(source) {
  return {
    authority: source.authority,
    sourceType: source.sourceType,
    sourceUrl: source.sourceUrl,
    finalUrl: source.finalUrl,
    redirectChain: source.redirectChain,
    contentSha256: source.contentSha256,
    objectPath: source.objectPath,
    contentType: source.contentType,
    byteSize: source.byteSize,
    identity: source.identity,
    discoveryProvenance: source.discoveryProvenance ?? null,
  };
}

function preservesEveryRawArtifactBinding(priorSources, replacementSources) {
  const replacementBindings = new Set(replacementSources
    .map((source) => canonicalJsonSha256(immutableRawArtifactBinding(source))));
  return priorSources.every((source) => replacementBindings.has(
    canonicalJsonSha256(immutableRawArtifactBinding(source)),
  ));
}

function buildIdenticalArtifactRepair(entry, target, outcome) {
  if (!entry || !target || !outcome
    || entry.targetId !== target.targetId
    || outcome.targetId !== target.targetId
    || identityKey(entry) !== identityKey(target)
    || entry.referenceId !== target.referenceId
    || entry.legacyRuntimeId !== target.legacyRuntimeId
    || entry.canonicalProductId !== target.canonicalProductId
    || entry.lifecycleState !== target.lifecycleState
    || entry.acceptanceStatus !== outcome.status
    || !['accepted', 'receipt_accepted_non_scalar'].includes(outcome.status)
    || !preservesEveryRawArtifactBinding(entry.sources, outcome.sources)) {
    return null;
  }
  return Object.freeze({
    targetId: target.targetId,
    reason: 'receipt_rederived_from_identical_raw_artifact_with_verified_corroboration',
    priorEntrySha256: canonicalJsonSha256(entry),
    replacementOutcomeSha256: outcome.semanticOutcomeSha256,
  });
}

function receiptReplayFailureCode(error) {
  const detail = String(error?.message ?? error).toLowerCase();
  if (/claims do not match|claim.*mismatch|expected receipt claim.*not rederived/.test(detail)) {
    return 'claim_replay_mismatch';
  }
  if (/identity|model scope|family manual|multiple models/.test(detail)) return 'identity_replay_mismatch';
  if (/receipt|attestation/.test(detail)) return 'receipt_replay_mismatch';
  if (/object|hash|size|missing|enoent/.test(detail)) return 'object_replay_failure';
  return 'verification_replay_failure';
}

export async function auditHistoricalAcceptanceReceipts({
  bundle,
  generatedAt,
  readObject,
}) {
  validateHistoricalEvidenceRecoveryAcceptanceBundle(bundle);
  const checkedObjects = new Set();
  const outcomes = [];
  for (const entry of bundle.entries) {
    const identity = { brand: entry.brand, model: entry.model, category: entry.category };
    for (const source of entry.sources) {
      const base = {
        targetId: entry.targetId,
        referenceId: entry.referenceId,
        brand: entry.brand,
        model: entry.model,
        category: entry.category,
        sourceUrl: source.sourceUrl,
        sourcePdfSha256: source.contentType === 'application/pdf' ? source.contentSha256 : null,
        contentSha256: source.contentSha256,
        receiptBindingSha256: source.verificationReceipt.bindingSha256,
        derivedObjectPath: source.derivedArtifact?.objectPath ?? null,
      };
      try {
        await verifyOnlineSource(source, identity, readObject, checkedObjects);
        outcomes.push({ ...base, status: 'passed', failureCode: null });
      } catch (error) {
        outcomes.push({
          ...base,
          status: 'failed',
          failureCode: receiptReplayFailureCode(error),
          diagnostic: String(error?.message ?? error).replace(/\s+/g, ' ').trim(),
        });
      }
    }
  }
  outcomes.sort((left, right) => left.targetId.localeCompare(right.targetId)
    || left.contentSha256.localeCompare(right.contentSha256));
  const sourceBundleSha256 = canonicalJsonSha256(bundle);
  const semanticAuditSha256 = canonicalJsonSha256({ sourceBundleSha256, outcomes });
  return Object.freeze({
    schemaVersion: 1,
    generatedAt: requiredTimestamp(generatedAt, 'acceptance receipt audit generation time'),
    sourceBundleSha256,
    outcomes,
    summary: {
      entries: bundle.entries.length,
      sources: outcomes.length,
      passed: outcomes.filter((outcome) => outcome.status === 'passed').length,
      failed: outcomes.filter((outcome) => outcome.status === 'failed').length,
    },
    checkedObjects: checkedObjects.size,
    semanticAuditSha256,
  });
}

export function filterHistoricalAcceptanceBundleByReceiptReplayAudit(bundle, audit) {
  validateHistoricalEvidenceRecoveryAcceptanceBundle(bundle);
  if (audit?.schemaVersion !== 1 || !Array.isArray(audit.outcomes)) {
    throw new TypeError('acceptance receipt replay audit schema v1 required');
  }
  const sourceBundleSha256 = canonicalJsonSha256(bundle);
  if (audit.sourceBundleSha256 !== sourceBundleSha256
    || audit.semanticAuditSha256 !== canonicalJsonSha256({
      sourceBundleSha256,
      outcomes: audit.outcomes,
    })) {
    throw new Error('acceptance receipt replay audit binding mismatch');
  }
  const expected = new Map();
  for (const entry of bundle.entries) {
    for (const source of entry.sources) {
      const key = `${entry.targetId}\0${source.contentSha256}\0${source.verificationReceipt.bindingSha256}`;
      expected.set(key, { entry, source });
    }
  }
  const failedTargets = new Set();
  const observed = new Set();
  for (const outcome of audit.outcomes) {
    if (!['passed', 'failed'].includes(outcome.status)) throw new Error('invalid receipt replay outcome status');
    const key = `${outcome.targetId}\0${outcome.contentSha256}\0${outcome.receiptBindingSha256}`;
    const bound = expected.get(key);
    if (!bound || observed.has(key)
      || bound.entry.referenceId !== outcome.referenceId
      || bound.source.sourceUrl !== outcome.sourceUrl) {
      throw new Error(`acceptance receipt replay outcome binding mismatch for ${outcome.targetId}`);
    }
    observed.add(key);
    if (outcome.status === 'failed') failedTargets.add(outcome.targetId);
  }
  if (observed.size !== expected.size) throw new Error('acceptance receipt replay audit coverage incomplete');
  const summary = {
    entries: bundle.entries.length,
    sources: audit.outcomes.length,
    passed: audit.outcomes.filter((outcome) => outcome.status === 'passed').length,
    failed: audit.outcomes.filter((outcome) => outcome.status === 'failed').length,
  };
  if (!same(summary, audit.summary)) throw new Error('acceptance receipt replay audit summary mismatch');
  const filtered = {
    ...structuredClone(bundle),
    entries: bundle.entries
      .filter((entry) => !failedTargets.has(entry.targetId))
      .map((entry) => structuredClone(entry)),
  };
  validateHistoricalEvidenceRecoveryAcceptanceBundle(filtered);
  return Object.freeze({
    bundle: filtered,
    excludedTargetIds: [...failedTargets].sort(),
  });
}

export function auditHistoricalEvidenceRecoveryBundle(bundle) {
  const violations = [];
  try { validateHistoricalEvidenceRecoveryAcceptanceBundle(bundle); } catch (error) {
    addViolation(violations, 'bundle contract', error);
  }
  const identities = new Set();
  for (const entry of bundle?.entries ?? []) {
    try {
      const key = identityKey(entry);
      if (identities.has(key)) throw new Error('duplicate exact product identity');
      identities.add(key);
      replayBundleEntry(entry);
    } catch (error) {
      addViolation(violations, `bundle entry ${entry?.targetId ?? 'unknown'}`, error);
    }
  }
  const semantic = {
    mode: 'offline',
    bundleSha256: (() => { try { return canonicalJsonSha256(bundle); } catch { return null; } })(),
    checkedEntries: bundle?.entries?.length ?? 0,
    violations: [...new Set(violations)].sort(),
  };
  return Object.freeze({
    schemaVersion: 1,
    mode: 'offline',
    status: semantic.violations.length ? 'failed' : 'passed',
    bundleSha256: semantic.bundleSha256,
    checkedEntries: semantic.checkedEntries,
    externalObjectsOpened: 0,
    violations: semantic.violations,
    semanticAuditSha256: canonicalJsonSha256(semantic),
  });
}

export async function auditHistoricalEvidenceRecovery({
  mode,
  batch,
  results,
  state,
  queue = null,
  policy = null,
  priorBundle = null,
  generatedAt,
  readObject,
  replayPriorObjects = false,
}) {
  if (mode !== 'online') throw new TypeError('run audit currently requires online mode');
  const at = requiredTimestamp(generatedAt, 'audit generation time');
  const violations = [];
  const repairs = [];
  const verifiedObjects = new Set();
  try { validateHistoricalEvidenceRecoveryBatch(batch); } catch (error) {
    addViolation(violations, 'batch contract', error);
  }
  try { validateHistoricalEvidenceRecoveryResults(results); } catch (error) {
    addViolation(violations, 'results contract', error);
  }
  if (priorBundle) {
    const offline = auditHistoricalEvidenceRecoveryBundle(priorBundle);
    if (offline.status !== 'passed') {
      for (const violation of offline.violations) violations.push(`prior ${violation}`);
    }
  }
  try {
    const batchSha256 = canonicalJsonSha256(batch);
    if (results.batchId !== batch.batchId || results.batchSha256 !== batchSha256) {
      throw new Error('results do not bind the audited batch snapshot');
    }
    if (results.queueSha256 !== batch.queue.sha256 || results.policySha256 !== batch.policy.sha256) {
      throw new Error('results queue or policy binding mismatch');
    }
  } catch (error) {
    addViolation(violations, 'input binding', error);
  }
  if (queue !== null) {
    try {
      if (canonicalJsonSha256(queue) !== batch.queue.sha256) throw new Error('queue snapshot SHA mismatch');
    } catch (error) {
      addViolation(violations, 'queue snapshot', error);
    }
  }
  if (policy !== null) {
    try {
      validateHistoricalEvidenceRecoveryPolicy(policy);
      if (canonicalJsonSha256(policy) !== batch.policy.sha256) throw new Error('policy document SHA mismatch');
    } catch (error) {
      addViolation(violations, 'policy document', error);
    }
  }
  try { validateState(state, batch, results); } catch (error) {
    addViolation(violations, 'run state', error);
  }
  try {
    if (resultsSemanticSha256(results.outcomes) !== results.semanticOutcomeSha256) {
      throw new Error('results semantic outcome digest mismatch');
    }
  } catch (error) {
    addViolation(violations, 'results semantics', error);
  }

  const targets = new Map((batch?.targets ?? []).map((target) => [target.targetId, target]));
  const outcomeIds = (results?.outcomes ?? []).map((outcome) => outcome.targetId).sort();
  if (JSON.stringify([...targets.keys()].sort()) !== JSON.stringify(outcomeIds)) {
    violations.push('target accounting: batch and results target IDs differ');
  }
  const productIdentities = new Set();
  for (const outcome of results?.outcomes ?? []) {
    const target = targets.get(outcome.targetId);
    if (!target) continue;
    try {
      const key = identityKey(target);
      if (productIdentities.has(key)) throw new Error('duplicate exact product identity');
      productIdentities.add(key);
      if (recoveryOutcomeSemanticSha256(outcome) !== outcome.semanticOutcomeSha256) {
        throw new Error('semantic outcome digest mismatch');
      }
      if (outcome.candidateInventory) validateInventoryForTarget(outcome.candidateInventory, target, outcome);
      else if (['accepted', 'receipt_accepted_non_scalar'].includes(outcome.status)) {
        throw new Error('accepted outcome candidate inventory missing');
      }
      validateReconciliationReplay(target, outcome, policy);
      if (!['accepted', 'receipt_accepted_non_scalar'].includes(outcome.status)) {
        if (outcome.sources?.length || outcome.geometryProjection !== null) {
          throw new Error('non-accepted outcome carries releasable evidence');
        }
        continue;
      }
      const identity = { brand: target.brand, model: target.model, category: target.category };
      const sourceHashes = new Set();
      for (const source of outcome.sources) {
        if (source.authority !== 'manufacturer') throw new Error('accepted source is not manufacturer authority');
        if (sourceHashes.has(source.contentSha256)) throw new Error('duplicate accepted source hash');
        sourceHashes.add(source.contentSha256);
        verifyVerificationReceipt(source, identity, { asOf: source.verificationReceipt?.verifiedAt });
        const retrieved = Date.parse(source.retrievedAt);
        const verified = Date.parse(source.verificationReceipt?.verifiedAt);
        if (retrieved < Date.parse(results.startedAt) || retrieved > Date.parse(results.completedAt)
          || verified < retrieved || verified > Date.parse(results.completedAt)) {
          throw new Error('source retrieval or verification timestamp lies outside the run');
        }
        await verifyOnlineSource(source, identity, readObject, verifiedObjects);
        const represented = Object.values(state?.artifacts ?? {}).some((artifact) => (
          artifact.state === 'available'
          && artifact.artifactRecord?.contentSha256 === source.contentSha256
          && artifact.artifactRecord?.objectPath === source.objectPath
        ));
        if (!represented) throw new Error('accepted source is absent from authoritative run artifact state');
      }
      if (outcome.geometryProjection !== null) {
        const replayed = projectEvidenceGeometry({ ...identity, formFactor: null, sources: outcome.sources });
        if (!same(replayed, outcome.geometryProjection)) throw new Error('geometry projection replay mismatch');
      }
    } catch (error) {
      addViolation(violations, `target ${outcome.targetId}`, error);
    }
  }

  if (replayPriorObjects && priorBundle) {
    const currentOutcomes = new Map((results?.outcomes ?? []).map((outcome) => [outcome.targetId, outcome]));
    for (const entry of priorBundle.entries) {
      const identity = { brand: entry.brand, model: entry.model, category: entry.category };
      try {
        for (const source of entry.sources) {
          await verifyOnlineSource(source, identity, readObject, verifiedObjects);
        }
      } catch (error) {
        const repair = buildIdenticalArtifactRepair(
          entry,
          targets.get(entry.targetId),
          currentOutcomes.get(entry.targetId),
        );
        if (repair) repairs.push(repair);
        else addViolation(violations, `prior object ${entry.targetId}`, error);
      }
    }
  }

  const uniqueViolations = [...new Set(violations)].sort();
  const uniqueRepairs = [...new Map(repairs.map((repair) => [repair.targetId, repair])).values()]
    .sort((left, right) => left.targetId.localeCompare(right.targetId));
  const semanticView = {
    mode: 'online',
    batchId: batch?.batchId ?? results?.batchId ?? 'invalid-batch',
    batchSha256: (() => { try { return canonicalJsonSha256(batch); } catch { return '0'.repeat(64); } })(),
    queueSha256: batch?.queue?.sha256 ?? results?.queueSha256 ?? '0'.repeat(64),
    policySha256: batch?.policy?.sha256 ?? results?.policySha256 ?? '0'.repeat(64),
    resultsSha256: (() => { try { return canonicalJsonSha256(results); } catch { return '0'.repeat(64); } })(),
    priorBundleSha256: priorBundle ? canonicalJsonSha256(priorBundle) : null,
    priorObjectsReplayed: Boolean(priorBundle && replayPriorObjects),
    checkedTargets: results?.outcomes?.length ?? 0,
    checkedObjects: verifiedObjects.size,
    repairs: uniqueRepairs,
    violations: uniqueViolations,
  };
  const semanticAuditSha256 = canonicalJsonSha256(semanticView);
  return validateHistoricalEvidenceRecoveryAudit({
    schemaVersion: 1,
    auditId: `historical-recovery-audit-${semanticAuditSha256.slice(0, 24)}`,
    generatedAt: at,
    mode: 'online',
    status: uniqueViolations.length ? 'failed' : 'passed',
    ...semanticView,
    semanticAuditSha256,
  });
}

function promotionInputBindings(batch, results, audit, priorBundle) {
  if (audit.mode !== 'online' || audit.status !== 'passed') throw new Error('passing online audit required');
  if (audit.batchId !== batch.batchId
    || audit.batchSha256 !== canonicalJsonSha256(batch)
    || audit.queueSha256 !== batch.queue.sha256
    || audit.policySha256 !== batch.policy.sha256
    || audit.resultsSha256 !== canonicalJsonSha256(results)
    || audit.priorBundleSha256 !== (priorBundle ? canonicalJsonSha256(priorBundle) : null)) {
    throw new Error('audit input binding mismatch');
  }
}

function equivalentEntry(left, right) {
  return left.targetId === right.targetId
    && identityKey(left) === identityKey(right)
    && left.lifecycleState === right.lifecycleState
    && left.acceptanceStatus === right.acceptanceStatus
    && same(left.sources.map((source) => source.contentSha256).sort(), right.sources.map((source) => source.contentSha256).sort())
    && same(left.geometryProjection, right.geometryProjection)
    && same(left.reconciliation ?? null, right.reconciliation ?? null);
}

export function promoteHistoricalEvidenceRecovery({
  batch,
  results,
  audit,
  priorBundle = null,
  generatedAt,
}) {
  validateHistoricalEvidenceRecoveryBatch(batch);
  validateHistoricalEvidenceRecoveryResults(results);
  validateHistoricalEvidenceRecoveryAudit(audit);
  if (priorBundle) {
    validateHistoricalEvidenceRecoveryAcceptanceBundle(priorBundle);
    const offline = auditHistoricalEvidenceRecoveryBundle(priorBundle);
    if (offline.status !== 'passed') throw new Error(`prior bundle replay failed: ${offline.violations.join('; ')}`);
    if (priorBundle.policySha256 !== results.policySha256 && audit.priorObjectsReplayed !== true) {
      throw new Error('prior bundle policy drift requires a full prior-object replay audit');
    }
  }
  promotionInputBindings(batch, results, audit, priorBundle);
  const auditSha256 = canonicalJsonSha256(audit);
  const batchSha256 = canonicalJsonSha256(batch);
  const resultsSha256 = canonicalJsonSha256(results);
  const priorLineageRows = priorBundle?.lineage ?? [];
  const matchingLineage = priorLineageRows.filter((row) => (
    row.batchSha256 === batchSha256
      && row.queueSha256 === batch.queue.sha256
      && row.resultsSha256 === resultsSha256
  ));
  if (matchingLineage.length > 1) {
    throw new Error(`ambiguous lineage for run ${results.runId}`);
  }
  let lineageId = matchingLineage[0]?.batchId ?? batch.batchId;
  if (!matchingLineage.length && priorLineageRows.some((row) => row.batchId === lineageId)) {
    lineageId = `${batch.batchId}--results-${resultsSha256.slice(0, 16)}`;
    if (priorLineageRows.some((row) => row.batchId === lineageId)) {
      throw new Error(`conflicting derived lineage for run ${results.runId}`);
    }
  }
  const targets = new Map(batch.targets.map((target) => [target.targetId, target]));
  const entries = new Map((priorBundle?.entries ?? []).map((entry) => [entry.targetId, structuredClone(entry)]));
  const identities = new Map([...entries.values()].map((entry) => [identityKey(entry), entry.targetId]));
  const repairs = new Map((audit.repairs ?? []).map((repair) => [repair.targetId, repair]));
  for (const outcome of results.outcomes) {
    if (!['accepted', 'receipt_accepted_non_scalar'].includes(outcome.status)) continue;
    const target = targets.get(outcome.targetId);
    if (!target) throw new Error(`promotion target missing: ${outcome.targetId}`);
    const next = {
      targetId: target.targetId,
      referenceId: target.referenceId,
      legacyRuntimeId: target.legacyRuntimeId,
      canonicalProductId: target.canonicalProductId,
      brand: target.brand,
      model: target.model,
      category: target.category,
      lifecycleState: target.lifecycleState,
      acceptanceStatus: outcome.status,
      sourceBatchId: lineageId,
      auditSha256,
      sources: structuredClone(outcome.sources),
      geometryProjection: structuredClone(outcome.geometryProjection),
      reconciliation: structuredClone(outcome.reconciliation),
    };
    const existing = entries.get(target.targetId);
    if (existing) {
      if (!equivalentEntry(existing, next)) {
        const expectedRepair = buildIdenticalArtifactRepair(existing, target, outcome);
        const auditedRepair = repairs.get(target.targetId);
        if (!expectedRepair || !auditedRepair || !same(expectedRepair, auditedRepair)) {
          throw new Error(`conflicting replacement for ${target.targetId}`);
        }
        entries.set(next.targetId, next);
      }
      continue;
    }
    const duplicateIdentity = identities.get(identityKey(next));
    if (duplicateIdentity) throw new Error(`duplicate promoted product identity: ${duplicateIdentity} and ${next.targetId}`);
    entries.set(next.targetId, next);
    identities.set(identityKey(next), next.targetId);
  }

  const lineage = new Map((priorBundle?.lineage ?? []).map((row) => [row.batchId, structuredClone(row)]));
  const nextLineage = {
    batchId: lineageId,
    batchSha256,
    queueSha256: batch.queue.sha256,
    resultsSha256,
    auditSha256,
  };
  if (matchingLineage.length) {
    const prospectiveEntries = [...entries.values()]
      .sort((left, right) => left.targetId.localeCompare(right.targetId));
    const committedEntries = structuredClone(priorBundle.entries)
      .sort((left, right) => left.targetId.localeCompare(right.targetId));
    if (!same(prospectiveEntries, committedEntries)) {
      throw new Error(`incomplete prior promotion for run ${results.runId}`);
    }
    return structuredClone(priorBundle);
  }
  lineage.set(lineageId, nextLineage);
  return validateHistoricalEvidenceRecoveryAcceptanceBundle({
    schemaVersion: 1,
    bundleId: priorBundle?.bundleId ?? 'historical-recovery-cumulative-v1',
    generatedAt: requiredTimestamp(generatedAt, 'bundle generation time'),
    policySha256: results.policySha256,
    entries: [...entries.values()].sort((left, right) => left.targetId.localeCompare(right.targetId)),
    lineage: [...lineage.values()].sort((left, right) => left.batchId.localeCompare(right.batchId)),
  });
}
