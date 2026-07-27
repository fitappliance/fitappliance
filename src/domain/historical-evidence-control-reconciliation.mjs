import { join } from 'node:path';

import { canonicalJsonSha256 } from './historical-evidence-recovery-contract.mjs';

const HASH = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ACCEPTED_STATUSES = new Set(['accepted', 'receipt_accepted_non_scalar']);

function requiredText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function requiredSafeId(value, label) {
  const normalized = requiredText(value, label);
  if (!SAFE_ID.test(normalized)) throw new TypeError(`${label} invalid`);
  return normalized;
}

function requiredHash(value, label) {
  const normalized = requiredText(value, label).toLowerCase();
  if (!HASH.test(normalized)) throw new TypeError(`${label} must be a SHA-256 hash`);
  return normalized;
}

function requiredTimestamp(value, label) {
  const normalized = requiredText(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(normalized)
    || Number.isNaN(Date.parse(normalized))) {
    throw new TypeError(`${label} must be RFC 3339 UTC`);
  }
  return normalized;
}

function requiredObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} required`);
  }
  return value;
}

function targetIds(value) {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError('reconciliation target IDs required');
  const normalized = value.map((entry) => requiredSafeId(entry, 'reconciliation target ID')).sort();
  if (new Set(normalized).size !== normalized.length) throw new TypeError('reconciliation target IDs must be unique');
  return normalized;
}

function exactTargetSet(left, right) {
  return JSON.stringify(targetIds(left)) === JSON.stringify(targetIds(right));
}

export function historicalControlReconciliationPath(runRoot, currentManifestId, currentControlId = null) {
  const root = requiredText(runRoot, 'historical run root');
  const manifestId = requiredSafeId(currentManifestId, 'current manifest ID');
  if (currentControlId === null) {
    return join(root, 'control-reconciliations', `${manifestId}.json`);
  }
  return join(
    root,
    'control-reconciliations',
    manifestId,
    `${requiredSafeId(currentControlId, 'current control ID')}.json`,
  );
}

export function validateHistoricalControlReconciliationReceipt(value) {
  requiredObject(value, 'historical control reconciliation receipt');
  if (value.schemaVersion !== 1) throw new TypeError('historical control reconciliation schema v1 required');
  if (value.reason !== 'CONTROL_EPOCH_RECONCILIATION') {
    throw new TypeError('historical control reconciliation reason invalid');
  }
  requiredSafeId(value.priorRunId, 'prior run ID');
  requiredSafeId(value.priorManifestId, 'prior manifest ID');
  requiredSafeId(value.currentControlId, 'current control ID');
  requiredSafeId(value.currentManifestId, 'current manifest ID');
  requiredSafeId(value.rebaselineId, 'rebaseline ID');
  requiredTimestamp(value.createdAt, 'reconciliation creation time');
  for (const field of [
    'priorStateSha256', 'priorBatchSha256', 'priorResultsSha256', 'priorAuditSha256',
    'priorManifestSha256', 'currentControlSha256', 'currentManifestSha256',
    'rebaselineSha256',
  ]) requiredHash(value[field], field);
  targetIds(value.targetIds);
  const { reconciliationId, semanticReconciliationSha256, ...semantic } = value;
  const expected = canonicalJsonSha256(semantic);
  if (semanticReconciliationSha256 !== expected
    || reconciliationId !== `historical-control-reconciliation-${expected.slice(0, 24)}`) {
    throw new Error('historical control reconciliation hash drift');
  }
  return value;
}

export function buildHistoricalControlReconciliationReceipt({
  createdAt,
  priorRunId,
  priorState,
  priorBatch,
  priorResults,
  priorAudit,
  priorManifest,
  currentControl,
  currentManifest,
  rebaseline,
  targetIds: selectedTargetIds,
}) {
  const state = requiredObject(priorState, 'prior state');
  const batch = requiredObject(priorBatch, 'prior batch');
  const results = requiredObject(priorResults, 'prior results');
  const audit = requiredObject(priorAudit, 'prior audit');
  const oldManifest = requiredObject(priorManifest, 'prior manifest');
  const control = requiredObject(currentControl, 'current scale control');
  const manifest = requiredObject(currentManifest, 'current manifest');
  const transition = requiredObject(rebaseline, 'scale rebaseline');
  const runId = requiredSafeId(priorRunId, 'prior run ID');
  const selected = targetIds(selectedTargetIds);
  if (state.runId !== runId || results.runId !== runId) throw new Error('prior run identity drift');
  if (control.decision?.allowedManifestId !== manifest.manifestId) {
    throw new Error('current manifest is not authorised by scale control');
  }
  const stateAcceptedIds = Object.entries(state.targets ?? {})
    .filter(([, target]) => target?.state === 'completed' && ACCEPTED_STATUSES.has(target?.outcome?.status))
    .map(([targetId]) => targetId);
  const resultAcceptedIds = (results.outcomes ?? [])
    .filter((outcome) => ACCEPTED_STATUSES.has(outcome?.status))
    .map((outcome) => outcome.targetId);
  const priorManifestTargetIds = (oldManifest.targetBindings ?? []).map((row) => row.targetId);
  const currentManifestTargetIds = (manifest.targetBindings ?? []).map((row) => row.targetId);
  if (!exactTargetSet(selected, stateAcceptedIds)
    || !exactTargetSet(selected, resultAcceptedIds)
    || !exactTargetSet(selected, priorManifestTargetIds)
    || !exactTargetSet(selected, currentManifestTargetIds)) {
    throw new Error('control reconciliation target binding drift');
  }
  const semantic = {
    schemaVersion: 1,
    reason: 'CONTROL_EPOCH_RECONCILIATION',
    createdAt: requiredTimestamp(createdAt, 'reconciliation creation time'),
    priorRunId: runId,
    priorStateSha256: canonicalJsonSha256(state),
    priorBatchSha256: canonicalJsonSha256(batch),
    priorResultsSha256: canonicalJsonSha256(results),
    priorAuditSha256: canonicalJsonSha256(audit),
    priorManifestId: requiredSafeId(oldManifest.manifestId, 'prior manifest ID'),
    priorManifestSha256: canonicalJsonSha256(oldManifest),
    currentControlId: requiredSafeId(control.controlId, 'current control ID'),
    currentControlSha256: canonicalJsonSha256(control),
    currentManifestId: requiredSafeId(manifest.manifestId, 'current manifest ID'),
    currentManifestSha256: canonicalJsonSha256(manifest),
    rebaselineId: requiredSafeId(transition.rebaselineId, 'rebaseline ID'),
    rebaselineSha256: requiredHash(
      transition.semanticRebaselineSha256,
      'rebaseline semantic SHA-256',
    ),
    targetIds: selected,
  };
  const semanticReconciliationSha256 = canonicalJsonSha256(semantic);
  return Object.freeze({
    ...semantic,
    reconciliationId: `historical-control-reconciliation-${semanticReconciliationSha256.slice(0, 24)}`,
    semanticReconciliationSha256,
  });
}

export function historicalControlReconciliationMatches({
  receipt,
  priorState,
  priorBatch,
  priorResults,
  priorAudit,
  priorManifest,
  currentControl,
  currentManifest,
  targetId,
}) {
  try {
    validateHistoricalControlReconciliationReceipt(receipt);
    if (receipt.priorRunId !== priorState?.runId
      || receipt.priorStateSha256 !== canonicalJsonSha256(priorState)
      || receipt.priorBatchSha256 !== canonicalJsonSha256(priorBatch)
      || receipt.priorResultsSha256 !== canonicalJsonSha256(priorResults)
      || receipt.priorAuditSha256 !== canonicalJsonSha256(priorAudit)
      || receipt.priorManifestId !== priorManifest?.manifestId
      || receipt.priorManifestSha256 !== canonicalJsonSha256(priorManifest)
      || receipt.currentControlId !== currentControl?.controlId
      || receipt.currentControlSha256 !== canonicalJsonSha256(currentControl)
      || receipt.currentManifestId !== currentManifest?.manifestId
      || receipt.currentManifestSha256 !== canonicalJsonSha256(currentManifest)
      || !receipt.targetIds.includes(targetId)) return false;
    const outcome = (priorResults?.outcomes ?? []).find((row) => row.targetId === targetId);
    return ACCEPTED_STATUSES.has(outcome?.status)
      && priorAudit?.mode === 'online'
      && priorAudit?.status === 'passed'
      && priorAudit?.priorObjectsReplayed === true
      && Array.isArray(priorAudit?.violations)
      && priorAudit.violations.length === 0
      && priorAudit.batchSha256 === canonicalJsonSha256(priorBatch)
      && priorAudit.resultsSha256 === canonicalJsonSha256(priorResults)
      && currentControl?.decision?.allowedManifestId === currentManifest?.manifestId;
  } catch {
    return false;
  }
}
