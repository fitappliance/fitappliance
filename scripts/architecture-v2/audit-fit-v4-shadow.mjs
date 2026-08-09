#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import {
  acquireFitV4RunWriter,
  buildFitV4Checkpoint,
  compareAndSwapFitV4ShadowPointer,
  createFitV4RunManifest,
  resumeFitV4Run,
  validateFitV4RunManifest,
  writeFitV4RunManifest,
} from '../../src/domain/fit-v4-run-manifest.mjs';
import { evaluateFitV4Shadow } from '../../src/domain/fit-v4-shadow.mjs';

export const FIT_V4_SHADOW_AUDIT_BOUNDARIES = Object.freeze([
  'before-temp-audit-write',
  'after-temp-audit-write',
  'before-audit-rename',
  'after-audit-rename',
  'before-checkpoint-write',
  'after-checkpoint-write',
  'before-pointer-cas',
  'after-pointer-cas',
]);

const AUDIT_SCHEMA_VERSION = 1;
const AUDIT_TYPE = 'FIT_V4_SHADOW_AUDIT';
const AUDIT_ID = /^fit_v4_shadow_audit_[a-f0-9]{24}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const PROHIBITED_NORMALIZED_KEYS = new Set([
  'publicationeligible', 'publicationeligibility', 'publicresult', 'publicpath',
  'userid', 'useridentifier', 'score', 'genericscore', 'fitscore', 'fitscorenumeric',
]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function semanticHash(value) {
  return sha256(JSON.stringify(canonical(value)));
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freezeDeep(item);
    Object.freeze(value);
  }
  return value;
}

function requiredObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} required`);
  return value;
}

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} required`);
  return value;
}

function exactKeys(value, keys, label) {
  requiredObject(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} schema keys invalid; caller-declared applicability is prohibited`);
  }
}

function hash(value, label) {
  if (!SHA256.test(String(value ?? ''))) throw new TypeError(`${label} SHA-256 invalid`);
  return value;
}

function same(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function assertIsolatedRoot(path, label) {
  const absolute = resolve(requiredText(path, label));
  if (absolute.split(sep).includes('public')) throw new Error(`${label} must be an isolated Fit V4 shadow path`);
  return absolute;
}

function assertNoProhibitedData(value, path = 'audit input') {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (PROHIBITED_NORMALIZED_KEYS.has(normalizedKey)) {
      throw new TypeError(`${path}.${key} is prohibited from the isolated shadow audit`);
    }
    if (typeof item === 'string'
      && (normalizedKey.endsWith('path') || normalizedKey.includes('import'))
      && item.split(/[\\/]/).includes('public')) {
      throw new TypeError(`${path}.${key} is a prohibited public path or import`);
    }
    assertNoProhibitedData(item, `${path}.${key}`);
  }
}

function independentlyValidateManifest(manifest) {
  try {
    validateFitV4RunManifest(manifest);
    buildFitV4Checkpoint({
      manifest,
      stage: 'shadow-audit-validation',
      inputHashes: { manifest: manifest.manifestSha256 },
      outputSha256: manifest.semanticSha256,
    });
    return true;
  } catch {
    return false;
  }
}

function fieldCompleteness(evaluations, reasons) {
  if (!Array.isArray(evaluations) || evaluations.length === 0) throw new TypeError('one or more evaluation records required');
  const summaries = [];
  for (const evaluation of evaluations) {
    exactKeys(evaluation, ['result', 'replayInput'], 'evaluation');
    let replayed;
    try {
      replayed = evaluateFitV4Shadow(evaluation.replayInput);
    } catch {
      reasons.add('EVALUATION_REPLAY_FAILED');
      summaries.push(canonical({
        productId: 'unverified', category: 'unknown', applicableHardFieldCount: 0, outcomeCheckCount: 0,
      }));
      continue;
    }
    if (!same(evaluation.result, replayed)) reasons.add('EVALUATION_REPLAY_DRIFT');
    const productId = requiredText(replayed.identity?.canonicalProductId, 'replayed evaluation product ID');
    const category = requiredText(replayed.identity?.category, 'replayed evaluation category');
    const accepted = replayed.acceptedRules.filter((item) => item.scope === 'installation');
    const applicableSet = new Set(accepted.map((item) => item.fieldId).filter(Boolean));
    for (const rule of accepted) {
      const covered = [...replayed.checks, ...replayed.gaps, ...replayed.conflicts].some((item) => (
        (rule.ruleId && item.ruleId === rule.ruleId)
        || (rule.constraintId && item.constraintId === rule.constraintId)
      ));
      if (!covered) reasons.add('HARD_FIELD_CHECK_MISSING');
    }
    const outcomeCount = replayed.checks.filter((item) => item.scope === 'installation').length;
    summaries.push(canonical({
      productId,
      category,
      applicableHardFieldCount: applicableSet.size,
      outcomeCheckCount: outcomeCount,
    }));
  }
  return summaries.sort((left, right) => left.productId.localeCompare(right.productId));
}

function bindingCheck(checkId, pass, reasonCodes) {
  return canonical({ checkId, pass, reasonCodes: [...new Set(reasonCodes)].sort() });
}

function checkBindings(manifest, bindings, reasons) {
  requiredObject(bindings, 'audit bindings');
  const checks = [];

  const active = requiredObject(bindings.activeRelease, 'active release binding');
  const activeReasons = [];
  if (!same(active.expected, manifest.semantic?.activeRelease) || !same(active.observed, active.expected)) {
    activeReasons.push('ACTIVE_RELEASE_DRIFT');
  }
  checks.push(bindingCheck('ACTIVE_RELEASE', activeReasons.length === 0, activeReasons));

  const conflict = requiredObject(bindings.conflictSet, 'conflict-set binding');
  hash(conflict.expectedSha256, 'expected conflict set');
  hash(conflict.observedSha256, 'observed conflict set');
  const conflictReasons = [];
  if (conflict.expectedSha256 !== conflict.observedSha256) conflictReasons.push('CONFLICT_SET_DRIFT');
  if (!Number.isInteger(conflict.unresolvedCount) || conflict.unresolvedCount < 0) throw new TypeError('unresolved conflict count invalid');
  if (conflict.unresolvedCount > 0) conflictReasons.push('UNRESOLVED_CONFLICT');
  checks.push(bindingCheck('CONFLICT_SET', conflictReasons.length === 0, conflictReasons));

  const policy = requiredObject(bindings.policy, 'policy binding');
  const policyReasons = [];
  if (policy.expectedEpoch !== manifest.semantic?.policyEpoch || policy.observedEpoch !== policy.expectedEpoch) {
    policyReasons.push('POLICY_EPOCH_DRIFT');
  }
  if (!same(policy.expectedHashes, manifest.semantic?.policyHashes)
    || !same(policy.observedHashes, policy.expectedHashes)) policyReasons.push('POLICY_HASH_DRIFT');
  checks.push(bindingCheck('POLICY', policyReasons.length === 0, policyReasons));

  const receipt = requiredObject(bindings.receiptLifecycle, 'receipt lifecycle binding');
  hash(receipt.expectedBundleSha256, 'expected receipt bundle');
  hash(receipt.observedBundleSha256, 'observed receipt bundle');
  const receiptReasons = [];
  if (receipt.withdrawn === true || receipt.status === 'WITHDRAWN') receiptReasons.push('RECEIPT_WITHDRAWN');
  if (receipt.expectedBundleSha256 !== manifest.semantic?.receiptBundleSha256
    || receipt.observedBundleSha256 !== receipt.expectedBundleSha256
    || receipt.status !== 'ACTIVE') receiptReasons.push('RECEIPT_LIFECYCLE_DRIFT');
  checks.push(bindingCheck('RECEIPT_LIFECYCLE', receiptReasons.length === 0, receiptReasons));

  const site = requiredObject(bindings.siteObservation, 'site observation binding');
  const siteReasons = [];
  const manifestSite = manifest.semantic?.clockBindings?.siteObservation;
  if (site.expectedBundleSha256 !== manifestSite?.bundleSha256
    || site.observedBundleSha256 !== site.expectedBundleSha256) siteReasons.push('SITE_OBSERVATION_BUNDLE_DRIFT');
  if (site.asOf !== manifest.semantic?.asOf || site.observedAt !== manifestSite?.observedAt) {
    siteReasons.push('SITE_OBSERVATION_CLOCK_DRIFT');
  }
  if (!Number.isFinite(site.maximumAgeMs) || site.maximumAgeMs < 0) throw new TypeError('site maximum age invalid');
  const observedAt = site.observedAt === null ? Number.NaN : Date.parse(site.observedAt);
  const asOf = Date.parse(site.asOf);
  if (!Number.isFinite(observedAt) || !Number.isFinite(asOf)) siteReasons.push('SITE_OBSERVATION_UNKNOWN');
  else if (observedAt > asOf) siteReasons.push('SITE_OBSERVATION_FUTURE');
  else if (asOf - observedAt > site.maximumAgeMs) siteReasons.push('SITE_OBSERVATION_STALE');
  checks.push(bindingCheck('SITE_OBSERVATION', siteReasons.length === 0, siteReasons));

  const source = requiredObject(bindings.sourceRevision, 'source revision binding');
  hash(source.expectedSha256, 'expected source revision');
  hash(source.observedSha256, 'observed source revision');
  const sourceReasons = [];
  if (source.superseded === true) sourceReasons.push('SOURCE_REVISION_SUPERSEDED');
  if (source.expectedSha256 !== manifest.semantic?.clockBindings?.documentRevision?.bundleSha256
    || source.observedSha256 !== source.expectedSha256) sourceReasons.push('SOURCE_REVISION_DRIFT');
  checks.push(bindingCheck('SOURCE_REVISION', sourceReasons.length === 0, sourceReasons));

  for (const check of checks) for (const reason of check.reasonCodes) reasons.add(reason);
  return checks.sort((left, right) => left.checkId.localeCompare(right.checkId));
}

export function auditFitV4Shadow({
  manifest,
  expectedManifest,
  evaluations,
  bindings,
  publicMutation,
}) {
  if (publicMutation !== false) throw new Error('public mutation is prohibited in the isolated Fit V4 shadow audit');
  assertNoProhibitedData({ evaluations, bindings });
  requiredObject(expectedManifest, 'expected manifest');
  const reasons = new Set();
  if (!independentlyValidateManifest(manifest)) reasons.add('MANIFEST_INTEGRITY_DRIFT');
  if (!independentlyValidateManifest(expectedManifest)
    || !same(manifest, expectedManifest)) {
    reasons.add('MANIFEST_EXPECTATION_DRIFT');
  }
  const evaluationSummary = fieldCompleteness(evaluations, reasons);
  const bindingChecks = checkBindings(manifest, bindings, reasons);
  const inputSemanticSha256 = semanticHash(canonical({
    manifestSha256: manifest?.manifestSha256,
    expectedManifestSemanticSha256: expectedManifest?.semanticSha256,
    publicMutation,
    evaluations,
    bindings,
  }));
  const semantic = canonical({
    schemaVersion: AUDIT_SCHEMA_VERSION,
    artifactType: AUDIT_TYPE,
    manifestId: manifest?.manifestId,
    runId: manifest?.runId,
    inputSemanticSha256,
    publicMutation: false,
    evaluationSummary,
    bindingChecks,
    verdict: reasons.size === 0 ? 'PASS' : 'FAIL',
    reasonCodes: [...reasons].sort(),
  });
  const semanticSha256 = semanticHash(semantic);
  return freezeDeep({
    ...semantic,
    semanticSha256,
    auditId: `fit_v4_shadow_audit_${semanticSha256.slice(0, 24)}`,
  });
}

export function verifyFitV4ShadowAuditArtifact({ artifact, ...auditInput }) {
  requiredObject(artifact, 'shadow audit artifact');
  if (artifact.schemaVersion !== AUDIT_SCHEMA_VERSION || artifact.artifactType !== AUDIT_TYPE
    || !AUDIT_ID.test(String(artifact.auditId ?? '')) || !SHA256.test(String(artifact.semanticSha256 ?? ''))) {
    throw new TypeError('shadow audit artifact schema invalid');
  }
  const rebuilt = auditFitV4Shadow(auditInput);
  if (!same(artifact, rebuilt)) throw new Error('shadow audit artifact independent semantic mismatch');
  return rebuilt;
}

export class FitV4ShadowFault extends Error {
  constructor(boundary, safeResumePoint) {
    super(`Fit V4 shadow fault injected at ${boundary}; safe resume point: ${safeResumePoint}`);
    this.name = 'FitV4ShadowFault';
    this.code = 'FIT_V4_SHADOW_FAULT';
    this.boundary = boundary;
    this.safeResumePoint = safeResumePoint;
  }
}

function injectFault(faultAt, boundary, safeResumePoint) {
  if (faultAt === boundary) throw new FitV4ShadowFault(boundary, safeResumePoint);
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function ensureManifest({ runsRoot, manifest, expectedInputs, root, descriptorPath }) {
  const expected = await createFitV4RunManifest(expectedInputs, { root, descriptorPath });
  if (expected.runId !== manifest.runId || expected.semanticSha256 !== manifest.semanticSha256
    || !same(expected.semantic, manifest.semantic)) throw new Error('fresh run semantic manifest drift');
  try {
    return await resumeFitV4Run({ runsRoot, manifestId: manifest.manifestId, expectedInputs, root, descriptorPath });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await writeFitV4RunManifest({ runsRoot, manifest });
  return resumeFitV4Run({ runsRoot, manifestId: manifest.manifestId, expectedInputs, root, descriptorPath });
}

async function readAndVerifyAudit(path, completeInput) {
  const bytes = await readFile(path);
  const artifact = verifyFitV4ShadowAuditArtifact({ artifact: JSON.parse(bytes), ...completeInput });
  const expectedBytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`);
  if (!bytes.equals(expectedBytes)) throw new Error('shadow audit immutable bytes mismatch');
  return { artifact, bytes };
}

async function writeAuditArtifact({ path, bytes, faultAt }) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(8).toString('hex')}`;
  try {
    injectFault(faultAt, 'before-temp-audit-write', 'WRITE_AUDIT');
    await writeFile(temporary, bytes, { flag: 'wx' });
    injectFault(faultAt, 'after-temp-audit-write', 'WRITE_AUDIT');
    if (sha256(await readFile(temporary)) !== sha256(bytes)) throw new Error('temporary shadow audit verification failed');
    injectFault(faultAt, 'before-audit-rename', 'WRITE_AUDIT');
    await rename(temporary, path);
    injectFault(faultAt, 'after-audit-rename', 'WRITE_CHECKPOINT');
    if (sha256(await readFile(path)) !== sha256(bytes)) throw new Error('renamed shadow audit verification failed');
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function runFitV4ShadowAudit({
  runsRoot,
  shadowRoot,
  root,
  descriptorPath,
  manifest,
  expectedInputs,
  auditInput,
  expectedRunId,
  writerId,
  faultAt = null,
}) {
  const isolatedRunsRoot = assertIsolatedRoot(runsRoot, 'runs root');
  const isolatedShadowRoot = assertIsolatedRoot(shadowRoot, 'shadow root');
  requiredObject(expectedInputs, 'complete expected semantic inputs');
  requiredObject(auditInput, 'shadow audit input');
  if (Object.hasOwn(auditInput, 'manifest')) throw new TypeError('shadow audit input cannot override the persisted manifest');
  if (faultAt !== null && !FIT_V4_SHADOW_AUDIT_BOUNDARIES.includes(faultAt)) throw new TypeError('unknown shadow audit fault boundary');
  const resumed = await ensureManifest({
    runsRoot: isolatedRunsRoot, manifest, expectedInputs, root, descriptorPath,
  });
  const completeInput = { ...auditInput, manifest: resumed.manifest };
  const expectedArtifact = auditFitV4Shadow(completeInput);
  if (expectedArtifact.verdict !== 'PASS') throw new Error(`shadow audit failed closed: ${expectedArtifact.reasonCodes.join(',')}`);
  const expectedBytes = Buffer.from(`${JSON.stringify(expectedArtifact, null, 2)}\n`);
  const auditPath = join(isolatedRunsRoot, manifest.runId, 'shadow-audit.json');
  const checkpoint = buildFitV4Checkpoint({
    manifest: resumed.manifest,
    stage: 'shadow-audit',
    inputHashes: {
      auditInput: expectedArtifact.inputSemanticSha256,
      manifest: resumed.manifest.manifestSha256,
    },
    outputSha256: sha256(expectedBytes),
  });
  const priorCheckpoint = resumed.checkpoints.find((item) => item.stage === 'shadow-audit');
  let artifactExists = await exists(auditPath);
  if (artifactExists) await readAndVerifyAudit(auditPath, completeInput);
  if (priorCheckpoint && !same(priorCheckpoint, checkpoint)) throw new Error('shadow audit checkpoint semantic mismatch');

  let pointerRunId = null;
  try {
    pointerRunId = JSON.parse(await readFile(join(isolatedShadowRoot, 'active-shadow.json'), 'utf8')).runId;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (artifactExists && priorCheckpoint && pointerRunId === manifest.runId) {
    if (expectedRunId !== manifest.runId) {
      throw new Error('existing shadow pointer differs from expected compare-and-swap state');
    }
    return freezeDeep({ artifact: expectedArtifact, checkpoint, pointer: { runId: manifest.runId }, replayed: true });
  }

  let writer;
  try {
    writer = await acquireFitV4RunWriter({
      runsRoot: isolatedRunsRoot, manifest: resumed.manifest, writerId,
    });
    if (!artifactExists) {
      await writeAuditArtifact({ path: auditPath, bytes: expectedBytes, faultAt });
      artifactExists = true;
    }
    if (!priorCheckpoint) {
      injectFault(faultAt, 'before-checkpoint-write', 'WRITE_CHECKPOINT');
      await writer.writeCheckpoint(checkpoint);
      injectFault(faultAt, 'after-checkpoint-write', 'ADVANCE_POINTER');
    }
  } finally {
    await writer?.close();
  }

  await readAndVerifyAudit(auditPath, completeInput);
  if (pointerRunId !== manifest.runId) {
    injectFault(faultAt, 'before-pointer-cas', 'ADVANCE_POINTER');
    await compareAndSwapFitV4ShadowPointer({
      shadowRoot: isolatedShadowRoot,
      expectedRunId,
      nextRunId: manifest.runId,
      verify: async () => {
        await readAndVerifyAudit(auditPath, completeInput);
        const latest = await resumeFitV4Run({
          runsRoot: isolatedRunsRoot,
          manifestId: manifest.manifestId,
          expectedInputs,
          root,
          descriptorPath,
        });
        const written = latest.checkpoints.find((item) => item.stage === 'shadow-audit');
        if (!written || !same(written, checkpoint)) throw new Error('shadow audit checkpoint missing before pointer CAS');
      },
    });
    injectFault(faultAt, 'after-pointer-cas', 'COMPLETE');
  } else if (expectedRunId !== manifest.runId) {
    throw new Error('existing shadow pointer differs from expected compare-and-swap state');
  }
  return freezeDeep({
    artifact: expectedArtifact,
    checkpoint,
    pointer: { runId: manifest.runId },
    replayed: artifactExists && Boolean(priorCheckpoint),
  });
}

export async function rollbackFitV4ShadowAudit({
  runsRoot,
  shadowRoot,
  expectedRunId,
  targetRunId,
  manifest,
  auditInput,
}) {
  if (targetRunId !== manifest?.runId) throw new Error('rollback target run and manifest mismatch');
  const isolatedRunsRoot = assertIsolatedRoot(runsRoot, 'runs root');
  const manifestPath = join(isolatedRunsRoot, targetRunId, 'manifest.json');
  const persistedManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!same(persistedManifest, manifest)) throw new Error('rollback target persisted manifest mismatch');
  requiredObject(auditInput, 'rollback audit input');
  if (Object.hasOwn(auditInput, 'manifest')) throw new TypeError('rollback audit input cannot override the persisted manifest');
  const completeInput = { ...auditInput, manifest };
  const auditPath = join(isolatedRunsRoot, targetRunId, 'shadow-audit.json');
  const { artifact, bytes } = await readAndVerifyAudit(auditPath, completeInput);
  const expectedCheckpoint = buildFitV4Checkpoint({
    manifest,
    stage: 'shadow-audit',
    inputHashes: {
      auditInput: artifact.inputSemanticSha256,
      manifest: manifest.manifestSha256,
    },
    outputSha256: sha256(bytes),
  });
  let persistedCheckpoint;
  try {
    persistedCheckpoint = JSON.parse(await readFile(
      join(isolatedRunsRoot, targetRunId, 'checkpoints', 'shadow-audit.json'),
      'utf8',
    ));
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('rollback target is incomplete: shadow audit checkpoint missing');
    throw error;
  }
  if (!same(persistedCheckpoint, expectedCheckpoint)) throw new Error('rollback target checkpoint mismatch');
  return compareAndSwapFitV4ShadowPointer({
    shadowRoot: assertIsolatedRoot(shadowRoot, 'shadow root'),
    expectedRunId,
    nextRunId: targetRunId,
    verify: async () => {
      const { artifact } = await readAndVerifyAudit(auditPath, completeInput);
      if (artifact.verdict !== 'PASS') throw new Error('rollback target audit did not pass');
    },
  });
}
