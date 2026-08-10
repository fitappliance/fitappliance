#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { loadActiveRetailRelease } from '../../src/domain/active-retail-release.mjs';
import { validateFitV4FieldMap } from '../../src/domain/fit-v4-contract.mjs';
import { FIT_POLICY_PACKS_V4 } from '../../src/domain/fit-policies-v4/index.mjs';
import {
  createFitV4ReceiptBundle,
  restoreV3ReceiptBytes,
} from '../../src/domain/installation-evidence-receipt-v4.mjs';
import {
  FIT_V4_DISAGREEMENT_CLASSES,
  canonical,
  classifyFitV4Disagreement,
  semanticHash,
} from './build-fit-v4-shadow-cohort.mjs';

const DEFAULT_ROOT = new URL('../..', import.meta.url).pathname;
const HASH = /^[a-f0-9]{64}$/;

function violation(code, detail) {
  return { code, detail };
}

function bytesHash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizedPilot(value) {
  return canonical({
    ...value,
    products: [...(value?.products ?? [])].sort((left, right) => left.canonicalProductId.localeCompare(right.canonicalProductId)),
  });
}

function containsPublicationField(value, path = '$') {
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    const current = `${path}.${key}`;
    if (/publication[_-]?eligibility/i.test(key) || /publication[_-]?eligible/i.test(key)) return current;
    const nested = containsPublicationField(child, current);
    if (nested) return nested;
  }
  return null;
}

function expectedSemantic(artifact) {
  const copy = structuredClone(artifact);
  delete copy.semanticSha256;
  delete copy.cohortId;
  return semanticHash(copy);
}

export async function auditFitV4ShadowCohort(artifact, { root = DEFAULT_ROOT, descriptorPath } = {}) {
  const violations = [];
  if (!artifact || typeof artifact !== 'object') {
    return { schemaVersion: 1, passed: false, violations: [violation('INVALID_COHORT', 'artifact object required')] };
  }
  const expected = expectedSemantic(artifact);
  if (artifact.semanticSha256 !== expected || artifact.cohortId !== `fit_v4_cohort_${expected.slice(0, 24)}`) {
    violations.push(violation('SEMANTIC_HASH_DRIFT', 'cohort semantic identity mismatch'));
  }
  if (artifact.schemaVersion !== 1 || artifact.cohortType !== 'FIT_V4_PRIVATE_SHADOW_COHORT') {
    violations.push(violation('INVALID_COHORT', 'schema or cohort type invalid'));
  }
  if (artifact.products?.length !== 100 || new Set(artifact.products?.map((row) => row.canonicalProductId)).size !== 100) {
    violations.push(violation('COHORT_CARDINALITY_VIOLATION', 'exactly 100 unique products required'));
  }
  const categories = (artifact.products ?? []).reduce((counts, row) => {
    counts[row.category] = (counts[row.category] ?? 0) + 1;
    return counts;
  }, {});
  if (categories.refrigerator !== 50 || categories.dishwasher !== 50 || Object.keys(categories).length !== 2) {
    violations.push(violation('CATEGORY_COUNT_VIOLATION', JSON.stringify(categories)));
  }
  for (const product of artifact.products ?? []) {
    if ((product.pilotCategory === 'fridge' ? 'refrigerator' : product.pilotCategory) !== product.category) {
      violations.push(violation('CATEGORY_BINDING_VIOLATION', product.canonicalProductId));
    }
    if (!FIT_V4_DISAGREEMENT_CLASSES.includes(product.disagreementClass)) {
      violations.push(violation('INVALID_DISAGREEMENT_CLASS', product.canonicalProductId));
    }
    if (product.v4?.status === 'VERIFIED_FIT' && (product.v4.receiptRefs?.length ?? 0) === 0) {
      violations.push(violation('RIGHTS_INVALID_PROMOTION', product.canonicalProductId));
    }
    const v4ReceiptRefs = Array.isArray(product.v4?.receiptRefs) ? product.v4.receiptRefs : [];
    if ((product.v4?.executed === false && (product.v4?.status !== 'NOT_EVALUATED' || v4ReceiptRefs.length !== 0))
      || (product.v4?.executed === true && product.v4?.status === 'NOT_EVALUATED')
      || typeof product.v4?.executed !== 'boolean') {
      violations.push(violation('V4_EXECUTION_STATE_MISMATCH', product.canonicalProductId));
    }
    for (const gap of product.v4?.unknowns ?? []) {
      if (!/^(EVIDENCE|IDENTITY|RIGHTS|KNOWLEDGE)_GAP$/.test(gap.type ?? '') || !/^[A-Z][A-Z0-9_]+$/.test(gap.reasonCode ?? '')) {
        violations.push(violation('UNTYPED_UNKNOWN', product.canonicalProductId));
      }
    }
    try {
      const unknownTypes = new Set((product.v4?.unknowns ?? []).map((row) => row.type));
      const expectedClass = classifyFitV4Disagreement({
        v2: product.v2?.status,
        v3: product.v3?.status,
        v4: product.v4?.status,
        identityDefect: unknownTypes.has('IDENTITY_GAP'),
        missingV4Evidence: ['KNOWLEDGE_GAP', 'EVIDENCE_GAP', 'RIGHTS_GAP'].some((type) => unknownTypes.has(type)),
        policyDefect: product.policyDefect === true,
        correctionProven: product.correctionProven === true,
      });
      if (product.disagreementClass !== expectedClass) {
        violations.push(violation('DISAGREEMENT_CLASS_MISMATCH', product.canonicalProductId));
      }
    } catch (error) {
      violations.push(violation('DISAGREEMENT_CLASS_MISMATCH', `${product.canonicalProductId}:${error.message}`));
    }
  }
  const publicationPath = containsPublicationField(artifact);
  if (publicationPath || artifact.isolation?.publicMutation !== false) {
    violations.push(violation('PUBLICATION_VIOLATION', publicationPath ?? '$.isolation.publicMutation'));
  }
  const pilotBytes = await readFile(resolve(root, 'data/architecture-v2/generated/installation-knowledge-pilot.json'));
  const pilot = JSON.parse(pilotBytes);
  const pilotById = new Map(pilot.products.map((row) => [row.canonicalProductId, row]));
  for (const product of artifact.products ?? []) {
    const source = pilotById.get(product.canonicalProductId);
    if (!source || product.brand !== source.brand || product.model !== source.model
      || product.formFactor !== source.formFactor || product.legacyRuntimeId !== source.legacyRuntimeId
      || product.pilotCategory !== source.category) {
      violations.push(violation('PILOT_BINDING_VIOLATION', product.canonicalProductId));
    }
  }
  const expectedPilotIds = [...pilotById.keys()].sort();
  if (artifact.bindings?.pilot?.bytesSha256 !== bytesHash(pilotBytes)
    || artifact.bindings?.pilot?.semanticSha256 !== semanticHash(normalizedPilot(pilot))
    || artifact.bindings?.pilot?.productIdsSha256 !== semanticHash(expectedPilotIds)) {
    violations.push(violation('HASH_BINDING_VIOLATION', 'pilot'));
  }
  const fieldMapBytes = await readFile(resolve(root, 'data/architecture-v2/policies/fit-v4-field-map.json'));
  const rawFieldMap = JSON.parse(fieldMapBytes);
  const fieldMap = validateFitV4FieldMap(rawFieldMap);
  if (artifact.bindings?.fieldMap?.bytesSha256 !== bytesHash(fieldMapBytes)
    || artifact.bindings?.fieldMap?.semanticSha256 !== semanticHash(rawFieldMap)
    || artifact.bindings?.fieldMap?.version !== fieldMap.version) {
    violations.push(violation('HASH_BINDING_VIOLATION', 'fieldMap'));
  }
  const v3BundleBytes = await readFile(resolve(root, 'data/architecture-v2/reviews/automated/installation-evidence-receipts.json'));
  const v3Bundle = JSON.parse(v3BundleBytes);
  const v3AuditBytes = await readFile(resolve(root, 'data/architecture-v2/reviews/automated/fit-v3-shadow-audit.json'));
  const v3Audit = JSON.parse(v3AuditBytes);
  if (artifact.bindings?.v3ReceiptBundle?.bytesSha256 !== bytesHash(v3BundleBytes)
    || artifact.bindings?.v3ReceiptBundle?.semanticSha256 !== semanticHash(v3Bundle)
    || artifact.bindings?.v3Audit?.bytesSha256 !== bytesHash(v3AuditBytes)
    || artifact.bindings?.v3Audit?.semanticSha256 !== semanticHash(v3Audit)) {
    violations.push(violation('HASH_BINDING_VIOLATION', 'V3 sources'));
  }
  const expectedPolicyHashes = Object.fromEntries(Object.entries(FIT_POLICY_PACKS_V4)
    .map(([category, pack]) => [category, semanticHash(pack)]).sort(([left], [right]) => left.localeCompare(right)));
  const cohortCases = artifact.cohortCases;
  if (JSON.stringify(Object.keys(cohortCases ?? {}).sort()) !== JSON.stringify([
    'artifactType', 'caseSetId', 'cases', 'containsUserData', 'schemaVersion', 'sourceKind',
  ].sort())
    || cohortCases?.artifactType !== 'FIT_V4_NON_EVALUATED_COHORT_CASES'
    || !Array.isArray(cohortCases?.cases) || cohortCases.cases.length === 0
    || cohortCases.cases.some((row) => row.evaluationStatus !== 'NOT_EVALUATED')
    || Object.hasOwn(cohortCases ?? {}, 'scenarioSetId')) {
    violations.push(violation('INVALID_COHORT_CASES', 'fixed non-evaluated cohort cases required'));
  }
  if (JSON.stringify(artifact.bindings?.policies) !== JSON.stringify(expectedPolicyHashes)
    || artifact.bindings?.cohortCases?.semanticSha256 !== semanticHash(artifact.cohortCases)
    || artifact.bindings?.adapters?.semanticSha256 !== semanticHash(artifact.adapters)) {
    violations.push(violation('HASH_BINDING_VIOLATION', 'policy, cohort cases or adapter'));
  }
  const adapterByHash = new Map();
  for (const row of artifact.adapters ?? []) {
    let bytes;
    let receipt;
    try {
      bytes = restoreV3ReceiptBytes(row.adapter);
      receipt = JSON.parse(bytes);
      const mapping = fieldMap.fields.find((field) => field.v3Mapping?.fieldId === receipt.field);
      if (!mapping || mapping.id !== row.adapter.v4FieldId) throw new Error('adapter is not an exact field mapping');
    } catch (error) {
      violations.push(violation('LOSSY_MAPPING', error.message));
      continue;
    }
    const sourceReceipt = Number.isInteger(row.sourceReceiptIndex)
      ? v3Bundle.receipts?.[row.sourceReceiptIndex]
      : null;
    if (!sourceReceipt
      || semanticHash(receipt) !== semanticHash(sourceReceipt)
      || row.extraction?.encoding !== 'JSON_PRETTY_2_LF'
      || row.extraction?.bytesSha256 !== bytesHash(bytes)) {
      violations.push(violation('UNBOUND_V3_ADAPTER', row.adapter.originalV3ReceiptId));
      continue;
    }
    const source = pilotById.get(row.productId);
    if (!source || receipt.canonicalProductId !== row.productId
      || receipt.category !== source.category || receipt.brand !== source.brand
      || receipt.model !== source.model || receipt.formFactor !== source.formFactor) {
      violations.push(violation('CROSS_MODEL_RECEIPT', row.adapter.originalV3ReceiptId));
      continue;
    }
    adapterByHash.set(row.adapter.adapterSemanticSha256, row);
  }
  for (const product of artifact.products ?? []) {
    for (const ref of product.v3AdapterRefs ?? []) {
      const row = adapterByHash.get(ref);
      if (!row || row.productId !== product.canonicalProductId) {
        violations.push(violation('CROSS_MODEL_RECEIPT', `${product.canonicalProductId}:${ref}`));
      }
    }
  }
  try {
    const rebuilt = createFitV4ReceiptBundle(artifact.v4ReceiptBundle?.receipts, { fieldMap });
    if (rebuilt.bundleSha256 !== artifact.v4ReceiptBundle?.bundleSha256
      || rebuilt.bundleSha256 !== artifact.bindings?.v4ReceiptBundle?.semanticSha256) {
      throw new Error('V4 receipt bundle hash drift');
    }
    const products = new Map((artifact.products ?? []).map((row) => [row.canonicalProductId, row]));
    for (const receipt of rebuilt.receipts) {
      const product = products.get(receipt.identity.canonicalProductId);
      if (!product || product.model !== receipt.identity.model || product.category !== receipt.identity.category) {
        violations.push(violation('CROSS_MODEL_RECEIPT', receipt.receiptId));
      }
    }
  } catch (error) {
    violations.push(violation('RIGHTS_INVALID_PROMOTION', error.message));
  }
  for (const [label, hash] of Object.entries({
    fieldMap: artifact.bindings?.fieldMap?.semanticSha256,
    cohortCases: artifact.bindings?.cohortCases?.semanticSha256,
    adapters: artifact.bindings?.adapters?.semanticSha256,
  })) {
    if (!HASH.test(hash ?? '')) violations.push(violation('INVALID_BINDING_HASH', label));
  }
  const expectedSummary = {
    total: artifact.products?.length ?? 0,
    byCategory: { dishwasher: categories.dishwasher ?? 0, refrigerator: categories.refrigerator ?? 0 },
    adapters: artifact.adapters?.length ?? 0,
    lossyMappings: artifact.gaps?.filter((row) => row.reasonCode === 'LOSSY_V3_FIELD_MAPPING').length ?? 0,
    disagreementClasses: Object.fromEntries(FIT_V4_DISAGREEMENT_CLASSES.map((name) => [name, (artifact.products ?? []).filter((row) => row.disagreementClass === name).length])),
  };
  if (JSON.stringify(artifact.summary) !== JSON.stringify(canonical(expectedSummary))) {
    violations.push(violation('HASH_BINDING_VIOLATION', 'summary'));
  }
  try {
    const active = await loadActiveRetailRelease({ root, descriptorPath });
    const binding = artifact.bindings?.activeRelease;
    if (binding?.releaseCandidateId !== active.descriptor.releaseCandidateId
      || binding?.catalogSha256 !== active.descriptor.artifacts.publicProjection.sha256
      || binding?.historicalReferenceSha256 !== active.descriptor.artifacts.historicalReference.sha256
      || binding?.authorizationManifestSha256 !== active.descriptor.artifacts.authorizationManifest.sha256) {
      violations.push(violation('ACTIVE_RELEASE_DRIFT', 'cohort binding differs from active release'));
    }
    const activeById = new Map(active.catalog.products.map((row) => [row.canonicalProductId, row]));
    for (const product of artifact.products ?? []) {
      const activeProduct = activeById.get(product.canonicalProductId);
      const expectedLifecycleState = activeProduct?.retailLifecycle?.lifecycleState ?? 'NOT_BOUND_TO_ACTIVE_CATALOG';
      if (product.activeCatalogPresent !== Boolean(activeProduct)
        || product.activeLifecycleState !== expectedLifecycleState) {
        violations.push(violation('ACTIVE_RELEASE_DRIFT', product.canonicalProductId));
      }
    }
  } catch (error) {
    violations.push(violation('ACTIVE_RELEASE_DRIFT', error.message));
  }
  return canonical({
    schemaVersion: 1,
    passed: violations.length === 0,
    cohortId: artifact.cohortId ?? null,
    violations,
    summary: {
      products: artifact.products?.length ?? 0,
      adapters: artifact.adapters?.length ?? 0,
      disagreements: (artifact.products ?? []).filter((row) => row.disagreementClass !== 'NO_DISAGREEMENT').length,
    },
  });
}

export async function runCli(args = process.argv.slice(2)) {
  const artifactPath = args[0];
  if (!artifactPath) throw new TypeError('cohort artifact path required');
  const artifact = JSON.parse(await readFile(resolve(artifactPath), 'utf8'));
  const audit = await auditFitV4ShadowCohort(artifact);
  process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
  if (!audit.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runCli();
}
