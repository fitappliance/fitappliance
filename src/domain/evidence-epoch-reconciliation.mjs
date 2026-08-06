import { createHash } from 'node:crypto';

import { canonicalJsonSha256 } from './historical-evidence-recovery-contract.mjs';

const OUTCOMES = new Set([
  'RETAINED',
  'SUPERSEDED',
  'ACCEPTANCE_REVOKED',
  'ACCEPTANCE_QUARANTINED',
]);
const SHA256 = /^[a-f0-9]{64}$/;
const REASON_CODE = /^[A-Z][A-Z0-9_]*$/;

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function exactKeys(value, label, required, optional = []) {
  object(value, label);
  const allowed = new Set([...required, ...optional]);
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new TypeError(`${label}.${key} required`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${label}.${key} is not allowed`);
  }
}

function text(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function sha256(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (!SHA256.test(String(value ?? ''))) throw new TypeError(`${label} must be a SHA-256`);
  return String(value);
}

function reasonCode(value) {
  if (value === null) return null;
  const normalized = text(value, 'evidence epoch reason code');
  if (!REASON_CODE.test(normalized)) {
    throw new TypeError('evidence epoch machine-readable reason code must use uppercase snake case');
  }
  return normalized;
}

function sortedUnique(values, label, normalize = (value) => text(value, label)) {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  return [...new Set(values.map(normalize))].sort((left, right) => left.localeCompare(right));
}

function descriptorSemantic(value) {
  return {
    schemaVersion: value.schemaVersion,
    targetId: value.targetId,
    identity: value.identity,
    priorReceiptBindingSha256: value.priorReceiptBindingSha256,
    candidateSourceIdentities: value.candidateSourceIdentities,
    requiredSourceHashes: value.requiredSourceHashes,
    conflictHashes: value.conflictHashes,
    policyVersions: value.policyVersions,
  };
}

function rawSha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function createEvidenceEpochDescriptor({
  targetId,
  identity,
  priorReceiptBindingSha256 = null,
  candidateSourceIdentities = [],
  requiredSourceHashes = [],
  conflictHashes = [],
  policyVersions = [],
}) {
  exactKeys(identity, 'epoch exact identity', ['brand', 'model', 'category']);
  const normalized = {
    schemaVersion: 1,
    targetId: text(targetId, 'epoch target ID'),
    identity: {
      brand: text(identity.brand, 'epoch identity brand'),
      model: text(identity.model, 'epoch identity model'),
      category: text(identity.category, 'epoch identity category'),
    },
    priorReceiptBindingSha256: sha256(
      priorReceiptBindingSha256,
      'epoch prior receipt binding',
      { nullable: true },
    ),
    candidateSourceIdentities: sortedUnique(
      candidateSourceIdentities,
      'candidate source identity',
    ),
    requiredSourceHashes: sortedUnique(
      requiredSourceHashes,
      'required source hash',
      (value) => sha256(value, 'required source hash'),
    ),
    conflictHashes: sortedUnique(
      conflictHashes,
      'conflict hash',
      (value) => sha256(value, 'conflict hash'),
    ),
    policyVersions: sortedUnique(policyVersions, 'policy version'),
  };
  const candidateIdentityHashes = new Set(normalized.candidateSourceIdentities.flatMap((value) => [
    rawSha256(value),
    canonicalJsonSha256(value),
  ]));
  if (normalized.requiredSourceHashes.some((value) => candidateIdentityHashes.has(value))) {
    throw new TypeError('URL-derived identity cannot be used as an acquired content hash');
  }
  return {
    ...normalized,
    semanticDescriptorSha256: canonicalJsonSha256(normalized),
  };
}

export function validateEvidenceEpochDescriptor(value) {
  exactKeys(value, 'evidence epoch descriptor', [
    'schemaVersion', 'targetId', 'identity', 'priorReceiptBindingSha256',
    'candidateSourceIdentities', 'requiredSourceHashes', 'conflictHashes',
    'policyVersions', 'semanticDescriptorSha256',
  ]);
  if (value.schemaVersion !== 1) throw new TypeError('evidence epoch descriptor schemaVersion 1 required');
  const rebuilt = createEvidenceEpochDescriptor(value);
  if (JSON.stringify(rebuilt) !== JSON.stringify(value)) {
    throw new Error('evidence epoch descriptor is not canonical or its semantic hash is stale');
  }
  return value;
}

export function sameEvidenceEpochDescriptor(left, right) {
  validateEvidenceEpochDescriptor(left);
  validateEvidenceEpochDescriptor(right);
  return left.semanticDescriptorSha256 === right.semanticDescriptorSha256;
}

export function createEvidenceEpochLedger() {
  return { schemaVersion: 1, records: [] };
}

function recordSemantic(record) {
  const { recordSha256, ...semantic } = record;
  return semantic;
}

function appendRecord(ledger, record) {
  const semantic = {
    ...record,
    sequence: ledger.records.length + 1,
    previousRecordSha256: ledger.records.at(-1)?.recordSha256 ?? null,
  };
  return {
    schemaVersion: 1,
    records: [...ledger.records, { ...semantic, recordSha256: canonicalJsonSha256(semantic) }],
  };
}

export function validateEvidenceEpochLedger(value) {
  exactKeys(value, 'evidence epoch ledger', ['schemaVersion', 'records']);
  if (value.schemaVersion !== 1 || !Array.isArray(value.records)) {
    throw new TypeError('evidence epoch ledger schemaVersion 1 with records required');
  }
  const outcomes = new Set();
  const pendingEpochs = new Set();
  let previous = null;
  for (let index = 0; index < value.records.length; index += 1) {
    const record = value.records[index];
    if (record.sequence !== index + 1 || record.previousRecordSha256 !== previous) {
      throw new Error('evidence epoch ledger sequence or chain mismatch');
    }
    if (canonicalJsonSha256(recordSemantic(record)) !== record.recordSha256) {
      throw new Error('evidence epoch ledger record hash mismatch');
    }
    if (record.recordType === 'PENDING') {
      exactKeys(record, 'pending epoch record', [
        'recordType', 'sequence', 'previousRecordSha256', 'epochId', 'targetId',
        'descriptorSha256', 'descriptor', 'recordSha256',
      ]);
      validateEvidenceEpochDescriptor(record.descriptor);
      if (record.targetId !== record.descriptor.targetId
        || record.descriptorSha256 !== record.descriptor.semanticDescriptorSha256
        || record.epochId !== `evidence_epoch_${record.descriptorSha256.slice(0, 24)}`) {
        throw new Error('pending epoch descriptor binding mismatch');
      }
      if (pendingEpochs.has(record.epochId)) throw new Error('duplicate pending evidence epoch');
      pendingEpochs.add(record.epochId);
    } else if (record.recordType === 'OUTCOME') {
      exactKeys(record, 'epoch outcome record', [
        'recordType', 'sequence', 'previousRecordSha256', 'epochId', 'targetId',
        'descriptorSha256', 'outcome', 'priorReceiptBindingSha256',
        'replacementReceiptBindingSha256', 'reasonCode', 'decisionEvidenceHashes',
        'recordSha256',
      ]);
      if (!OUTCOMES.has(record.outcome)) throw new TypeError('unsupported evidence epoch outcome');
      sha256(record.priorReceiptBindingSha256, 'outcome prior receipt binding', { nullable: true });
      sha256(record.replacementReceiptBindingSha256, 'outcome replacement receipt binding', { nullable: true });
      if (reasonCode(record.reasonCode) !== record.reasonCode) {
        throw new Error('evidence epoch reason code is not canonical');
      }
      const normalizedDecisionEvidence = sortedUnique(
        record.decisionEvidenceHashes,
        'decision evidence hash',
        (value) => sha256(value, 'decision evidence hash'),
      );
      if (JSON.stringify(normalizedDecisionEvidence) !== JSON.stringify(record.decisionEvidenceHashes)) {
        throw new Error('decision evidence hashes are not canonical');
      }
      if (['ACCEPTANCE_REVOKED', 'ACCEPTANCE_QUARANTINED'].includes(record.outcome)
        && (record.reasonCode === null || record.decisionEvidenceHashes.length === 0)) {
        throw new Error('blocking evidence epoch outcome requires reason code and decision evidence hash');
      }
      if (outcomes.has(record.epochId)) throw new Error('duplicate evidence epoch outcome');
      outcomes.add(record.epochId);
      const pending = value.records.find((candidate) => candidate.recordType === 'PENDING'
        && candidate.epochId === record.epochId);
      if (!pending || pending.sequence >= record.sequence
        || pending.targetId !== record.targetId
        || pending.descriptorSha256 !== record.descriptorSha256
        || pending.descriptor.priorReceiptBindingSha256 !== record.priorReceiptBindingSha256) {
        throw new Error('epoch outcome pending descriptor binding mismatch');
      }
      if (record.outcome === 'SUPERSEDED') {
        if (record.replacementReceiptBindingSha256 === null) {
          throw new Error('superseded epoch requires a replacement receipt binding');
        }
        if (record.replacementReceiptBindingSha256 === record.priorReceiptBindingSha256) {
          throw new Error('superseded epoch requires a different replacement receipt');
        }
      } else if (record.replacementReceiptBindingSha256 !== null) {
        throw new Error('only superseded epoch may carry a replacement receipt binding');
      }
    } else {
      throw new TypeError('unsupported evidence epoch record type');
    }
    previous = record.recordSha256;
  }
  return value;
}

export function appendPendingEvidenceEpoch({ ledger, descriptor }) {
  validateEvidenceEpochLedger(ledger);
  validateEvidenceEpochDescriptor(descriptor);
  const epochId = `evidence_epoch_${descriptor.semanticDescriptorSha256.slice(0, 24)}`;
  const existing = ledger.records.find((record) => record.epochId === epochId);
  if (existing) {
    if (existing.descriptorSha256 !== descriptor.semanticDescriptorSha256) {
      throw new Error('evidence epoch ID collision');
    }
    return structuredClone(ledger);
  }
  return appendRecord(ledger, {
    recordType: 'PENDING',
    epochId,
    targetId: descriptor.targetId,
    descriptorSha256: descriptor.semanticDescriptorSha256,
    descriptor: structuredClone(descriptor),
  });
}

export function completeEvidenceEpoch({
  ledger,
  descriptor,
  outcome,
  replacementReceiptBindingSha256 = null,
  reasonCode: rawReasonCode = null,
  decisionEvidenceHashes = [],
}) {
  validateEvidenceEpochLedger(ledger);
  validateEvidenceEpochDescriptor(descriptor);
  if (!OUTCOMES.has(outcome)) throw new TypeError('unsupported evidence epoch outcome');
  if (descriptor.priorReceiptBindingSha256 === null) {
    throw new Error('evidence epoch completion requires a prior receipt binding');
  }
  const epochId = `evidence_epoch_${descriptor.semanticDescriptorSha256.slice(0, 24)}`;
  const pending = ledger.records.find((record) => record.recordType === 'PENDING' && record.epochId === epochId);
  if (!pending) throw new Error('pending evidence epoch required before completion');
  const normalizedReplacement = sha256(
    replacementReceiptBindingSha256,
    'replacement receipt binding',
    { nullable: true },
  );
  const normalizedReasonCode = reasonCode(rawReasonCode);
  const normalizedDecisionEvidenceHashes = sortedUnique(
    decisionEvidenceHashes,
    'decision evidence hash',
    (value) => sha256(value, 'decision evidence hash'),
  );
  if (['ACCEPTANCE_REVOKED', 'ACCEPTANCE_QUARANTINED'].includes(outcome)) {
    if (normalizedReasonCode === null) {
      throw new Error('blocking evidence epoch outcome requires a reason code');
    }
    if (normalizedDecisionEvidenceHashes.length === 0) {
      throw new Error('blocking evidence epoch outcome requires at least one decision evidence hash');
    }
  }
  if (outcome === 'SUPERSEDED') {
    if (normalizedReplacement === null) throw new Error('superseded epoch requires a replacement receipt binding');
    if (normalizedReplacement === descriptor.priorReceiptBindingSha256) {
      throw new Error('superseded epoch requires a different replacement receipt');
    }
  } else if (normalizedReplacement !== null) {
    throw new Error('only superseded epoch may carry a replacement receipt binding');
  }
  const completion = {
    recordType: 'OUTCOME',
    epochId,
    targetId: descriptor.targetId,
    descriptorSha256: descriptor.semanticDescriptorSha256,
    outcome,
    priorReceiptBindingSha256: descriptor.priorReceiptBindingSha256,
    replacementReceiptBindingSha256: normalizedReplacement,
    reasonCode: normalizedReasonCode,
    decisionEvidenceHashes: normalizedDecisionEvidenceHashes,
  };
  const existing = ledger.records.find((record) => record.recordType === 'OUTCOME' && record.epochId === epochId);
  if (existing) {
    const existingComparable = recordSemantic(existing);
    delete existingComparable.sequence;
    delete existingComparable.previousRecordSha256;
    if (JSON.stringify(existingComparable) === JSON.stringify(completion)) return structuredClone(ledger);
    throw new Error('conflicting evidence epoch completion');
  }
  return appendRecord(ledger, completion);
}

export function effectiveEvidencePublicationState({ ledger, targetId, descriptorSha256 = null }) {
  validateEvidenceEpochLedger(ledger);
  const target = text(targetId, 'effective publication target ID');
  if (descriptorSha256 !== null) sha256(descriptorSha256, 'effective publication descriptor SHA');
  const pendingRecords = ledger.records.filter((record) => record.recordType === 'PENDING'
    && record.targetId === target
    && (descriptorSha256 === null || record.descriptorSha256 === descriptorSha256));
  const pending = pendingRecords.at(-1);
  if (!pending) return { status: 'UNKNOWN', publishable: false, epochId: null, descriptorSha256, receiptBindingSha256: null };
  const outcome = ledger.records.find((record) => record.recordType === 'OUTCOME'
    && record.epochId === pending.epochId);
  if (!outcome) {
    return {
      status: 'PENDING', publishable: false, epochId: pending.epochId,
      descriptorSha256: pending.descriptorSha256, receiptBindingSha256: null,
    };
  }
  const publishable = ['RETAINED', 'SUPERSEDED'].includes(outcome.outcome);
  return {
    status: outcome.outcome,
    publishable,
    epochId: outcome.epochId,
    descriptorSha256: outcome.descriptorSha256,
    receiptBindingSha256: outcome.outcome === 'SUPERSEDED'
      ? outcome.replacementReceiptBindingSha256
      : (outcome.outcome === 'RETAINED' ? outcome.priorReceiptBindingSha256 : null),
    priorReceiptBindingSha256: outcome.priorReceiptBindingSha256,
  };
}

export function validateEvidenceEpochState(value) {
  exactKeys(value, 'evidence epoch state', ['ledger', 'descriptors']);
  validateEvidenceEpochLedger(value.ledger);
  if (!Array.isArray(value.descriptors)) throw new TypeError('evidence epoch state descriptors must be an array');
  const targets = new Set();
  const latestPendingByTarget = new Map();
  for (const record of value.ledger.records) {
    if (record.recordType === 'PENDING') latestPendingByTarget.set(record.targetId, record);
  }
  for (const descriptor of value.descriptors) {
    validateEvidenceEpochDescriptor(descriptor);
    if (targets.has(descriptor.targetId)) throw new Error(`duplicate current epoch descriptor for ${descriptor.targetId}`);
    const latestPending = latestPendingByTarget.get(descriptor.targetId);
    if (!latestPending) {
      throw new Error(`current evidence epoch descriptor is not ledger-bound: ${descriptor.targetId}`);
    }
    if (latestPending.descriptorSha256 !== descriptor.semanticDescriptorSha256) {
      throw new Error(`current descriptor is not the latest pending epoch for ${descriptor.targetId}`);
    }
    targets.add(descriptor.targetId);
  }
  for (const targetId of latestPendingByTarget.keys()) {
    if (!targets.has(targetId)) throw new Error(`current descriptor missing for ledger target ${targetId}`);
  }
  return value;
}

export function resolveEvidenceEpochBatchDisposition({ state, descriptor, priorReceiptBindingSha256 }) {
  validateEvidenceEpochState(state);
  validateEvidenceEpochDescriptor(descriptor);
  const priorBinding = sha256(priorReceiptBindingSha256, 'prior receipt binding');
  if (descriptor.priorReceiptBindingSha256 !== priorBinding) return 'REENTER';
  const effective = effectiveEvidencePublicationState({
    ledger: state.ledger,
    targetId: descriptor.targetId,
    descriptorSha256: descriptor.semanticDescriptorSha256,
  });
  if (effective.publishable && effective.priorReceiptBindingSha256 === priorBinding) return 'SKIP';
  if (['ACCEPTANCE_REVOKED', 'ACCEPTANCE_QUARANTINED'].includes(effective.status)) return 'BLOCKED';
  return 'REENTER';
}
