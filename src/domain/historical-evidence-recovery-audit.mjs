import { createHash } from 'node:crypto';

import { verifyAttestedResolutionArtifact } from './evidence-artifact-verifier.mjs';
import { computeCandidateInventorySha256 } from './evidence-candidate-inventory.mjs';
import { projectEvidenceGeometry } from './evidence-geometry-projector.mjs';
import {
  canonicalJsonSha256,
  validateHistoricalEvidenceRecoveryAcceptanceBundle,
  validateHistoricalEvidenceRecoveryAudit,
  validateHistoricalEvidenceRecoveryBatch,
  validateHistoricalEvidenceRecoveryResults,
} from './historical-evidence-recovery-contract.mjs';
import { recoveryOutcomeSemanticSha256 } from './receipt-bound-evidence-batch-runner.mjs';
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
  if (source.derivedArtifact) {
    derived = Buffer.from(await readObject(source.derivedArtifact.objectPath));
    if (derived.length !== source.derivedArtifact.byteSize
      || sha256(derived) !== source.derivedArtifact.contentSha256) {
      throw new Error('MinerU object hash or size mismatch');
    }
    verifiedObjects.add(source.derivedArtifact.objectPath);
  }
  verifyAttestedResolutionArtifact({
    source,
    caseIdentity: identity,
    bytes: raw,
    derivedArtifactBytes: derived,
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
    for (const entry of priorBundle.entries) {
      const identity = { brand: entry.brand, model: entry.model, category: entry.category };
      for (const source of entry.sources) {
        try { await verifyOnlineSource(source, identity, readObject, verifiedObjects); } catch (error) {
          addViolation(violations, `prior object ${entry.targetId}`, error);
        }
      }
    }
  }

  const uniqueViolations = [...new Set(violations)].sort();
  const semanticView = {
    mode: 'online',
    batchId: batch?.batchId ?? results?.batchId ?? 'invalid-batch',
    batchSha256: (() => { try { return canonicalJsonSha256(batch); } catch { return '0'.repeat(64); } })(),
    queueSha256: batch?.queue?.sha256 ?? results?.queueSha256 ?? '0'.repeat(64),
    policySha256: batch?.policy?.sha256 ?? results?.policySha256 ?? '0'.repeat(64),
    resultsSha256: (() => { try { return canonicalJsonSha256(results); } catch { return '0'.repeat(64); } })(),
    priorBundleSha256: priorBundle ? canonicalJsonSha256(priorBundle) : null,
    checkedTargets: results?.outcomes?.length ?? 0,
    checkedObjects: verifiedObjects.size,
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
    && same(left.geometryProjection, right.geometryProjection);
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
    if (priorBundle.policySha256 !== results.policySha256) throw new Error('prior bundle policy drift');
  }
  promotionInputBindings(batch, results, audit, priorBundle);
  const auditSha256 = canonicalJsonSha256(audit);
  const targets = new Map(batch.targets.map((target) => [target.targetId, target]));
  const entries = new Map((priorBundle?.entries ?? []).map((entry) => [entry.targetId, structuredClone(entry)]));
  const identities = new Map([...entries.values()].map((entry) => [identityKey(entry), entry.targetId]));
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
      sourceBatchId: batch.batchId,
      auditSha256,
      sources: structuredClone(outcome.sources),
      geometryProjection: structuredClone(outcome.geometryProjection),
    };
    const existing = entries.get(target.targetId);
    if (existing) {
      if (!equivalentEntry(existing, next)) throw new Error(`conflicting replacement for ${target.targetId}`);
      continue;
    }
    const duplicateIdentity = identities.get(identityKey(next));
    if (duplicateIdentity) throw new Error(`duplicate promoted product identity: ${duplicateIdentity} and ${next.targetId}`);
    entries.set(next.targetId, next);
    identities.set(identityKey(next), next.targetId);
  }

  const lineage = new Map((priorBundle?.lineage ?? []).map((row) => [row.batchId, structuredClone(row)]));
  const nextLineage = {
    batchId: batch.batchId,
    batchSha256: canonicalJsonSha256(batch),
    queueSha256: batch.queue.sha256,
    resultsSha256: canonicalJsonSha256(results),
    auditSha256,
  };
  const existingLineage = lineage.get(batch.batchId);
  if (existingLineage) {
    const sameRunInputs = existingLineage.batchSha256 === nextLineage.batchSha256
      && existingLineage.queueSha256 === nextLineage.queueSha256
      && existingLineage.resultsSha256 === nextLineage.resultsSha256;
    if (!sameRunInputs) throw new Error(`conflicting lineage for batch ${batch.batchId}`);

    const expectedTargetIds = results.outcomes
      .filter((outcome) => ['accepted', 'receipt_accepted_non_scalar'].includes(outcome.status))
      .map((outcome) => outcome.targetId)
      .sort();
    const committedTargetIds = priorBundle.entries
      .filter((entry) => entry.sourceBatchId === batch.batchId)
      .map((entry) => entry.targetId)
      .sort();
    if (!same(expectedTargetIds, committedTargetIds)) {
      throw new Error(`incomplete prior promotion for batch ${batch.batchId}`);
    }
    return structuredClone(priorBundle);
  }
  lineage.set(batch.batchId, nextLineage);
  return validateHistoricalEvidenceRecoveryAcceptanceBundle({
    schemaVersion: 1,
    bundleId: priorBundle?.bundleId ?? 'historical-recovery-cumulative-v1',
    generatedAt: requiredTimestamp(generatedAt, 'bundle generation time'),
    policySha256: results.policySha256,
    entries: [...entries.values()].sort((left, right) => left.targetId.localeCompare(right.targetId)),
    lineage: [...lineage.values()].sort((left, right) => left.batchId.localeCompare(right.batchId)),
  });
}
