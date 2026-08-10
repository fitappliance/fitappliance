#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadActiveRetailRelease } from '../../src/domain/active-retail-release.mjs';
import { validateFitV4FieldMap } from '../../src/domain/fit-v4-contract.mjs';
import { FIT_POLICY_PACKS_V4 } from '../../src/domain/fit-policies-v4/index.mjs';
import { evaluateFitV3 } from '../../src/domain/fit-v3.mjs';
import { createInstallationKnowledge } from '../../src/domain/installation-knowledge-v3.mjs';
import {
  adaptV3Receipt,
  createFitV4ReceiptBundle,
} from '../../src/domain/installation-evidence-receipt-v4.mjs';

const DEFAULT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const require = createRequire(import.meta.url);
const { evaluateFit: evaluateFitV2 } = require('../../src/shared/fit-engine.js');
const PILOT_RELATIVE_PATH = 'data/architecture-v2/generated/installation-knowledge-pilot.json';
const V3_BUNDLE_RELATIVE_PATH = 'data/architecture-v2/reviews/automated/installation-evidence-receipts.json';
const FIELD_MAP_RELATIVE_PATH = 'data/architecture-v2/policies/fit-v4-field-map.json';
const COHORT_SCHEMA_VERSION = 1;

export const FIT_V4_SHADOW_COHORT_SCHEMA_VERSION = COHORT_SCHEMA_VERSION;
export const FIT_V4_DISAGREEMENT_CLASSES = Object.freeze([
  'INTENDED_CORRECTION',
  'MISSING_V4_EVIDENCE',
  'POLICY_DEFECT',
  'IDENTITY_DEFECT',
  'REGRESSION',
  'NO_DISAGREEMENT',
]);

const COHORT_CASES = Object.freeze({
  schemaVersion: 1,
  artifactType: 'FIT_V4_NON_EVALUATED_COHORT_CASES',
  caseSetId: 'fit-v4-task-7-fixed-non-evaluated-cases-v1',
  sourceKind: 'synthetic',
  containsUserData: false,
  cases: Object.freeze([
    Object.freeze({ id: 'synthetic-refrigerator-no-site-v1', category: 'refrigerator', measurementState: 'UNKNOWN', evaluationStatus: 'NOT_EVALUATED' }),
    Object.freeze({ id: 'synthetic-dishwasher-no-site-v1', category: 'dishwasher', measurementState: 'UNKNOWN', evaluationStatus: 'NOT_EVALUATED' }),
  ]),
});

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export function semanticHash(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function bytesHash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizedPilot(value) {
  return canonical({
    ...value,
    products: [...(value?.products ?? [])].sort((left, right) => left.canonicalProductId.localeCompare(right.canonicalProductId)),
  });
}

function assertSourceDocument(document, bytes, normalizer, label) {
  let parsed;
  try {
    parsed = JSON.parse(bytes);
  } catch {
    throw new TypeError(`${label} source bytes are not JSON`);
  }
  if (JSON.stringify(normalizer(document)) !== JSON.stringify(normalizer(parsed))) {
    throw new Error(`${label} source document and bytes drift`);
  }
}

function normalizeCategory(category) {
  if (category === 'fridge') return 'refrigerator';
  return category;
}

function assertFrozenPilot(pilot) {
  if (pilot?.schemaVersion !== 1 || pilot?.frozen !== true || !Array.isArray(pilot.products)) {
    throw new TypeError('frozen installation knowledge pilot required');
  }
  if (pilot.products.length !== 100) throw new Error('Task 7 requires exactly 100 pilot products');
  const ids = new Set(pilot.products.map((row) => row.canonicalProductId));
  if (ids.size !== 100) throw new Error('Task 7 pilot product IDs must be unique');
  const counts = pilot.products.reduce((result, row) => {
    const category = normalizeCategory(row.category);
    result[category] = (result[category] ?? 0) + 1;
    return result;
  }, {});
  if (counts.refrigerator !== 50 || counts.dishwasher !== 50 || Object.keys(counts).length !== 2) {
    throw new Error('Task 7 requires exactly 50 refrigerator and 50 dishwasher products');
  }
}

function unknownsFor(product) {
  const rows = [
    { type: 'KNOWLEDGE_GAP', reasonCode: 'MISSING_VALIDATED_V4_KNOWLEDGE' },
    { type: 'EVIDENCE_GAP', reasonCode: 'EXACT_V4_SOURCE_UNAVAILABLE' },
    { type: 'RIGHTS_GAP', reasonCode: 'FIELD_ACTION_RIGHTS_UNVERIFIED' },
  ];
  if (product.reconciliationState === 'NO_EXACT_REGISTRY_MATCH') {
    rows.push({ type: 'IDENTITY_GAP', reasonCode: 'EXACT_MODEL_IDENTITY_UNRESOLVED' });
  }
  return rows;
}

function runV2(product, activeProduct) {
  const result = evaluateFitV2({
    geometry: {
      category: product.category,
      closedEnvelope: {
        widthMm: Number.isFinite(activeProduct?.w) ? activeProduct.w : null,
        heightMm: Number.isFinite(activeProduct?.h) ? { maximumMm: activeProduct.h } : null,
        depthMm: Number.isFinite(activeProduct?.d) ? activeProduct.d : null,
      },
      installation: { leftMm: null, rightMm: null, topMm: null, rearMm: null },
      service: {},
    },
    cavity: { widthMm: null, heightMm: null, depthMm: null },
    evidenceLevel: 'dimensions',
    advisoryChecks: [],
  });
  return {
    engine: 'fit-v2',
    executed: true,
    status: result.outcome,
    reasonCode: 'SYNTHETIC_SITE_UNKNOWN',
    checkCount: result.checks.length,
  };
}

function runV3(product, v3AuditEntry) {
  const knowledge = createInstallationKnowledge({
    canonicalProductId: product.canonicalProductId,
    category: product.category,
    brand: product.brand,
    model: product.model,
    formFactor: null,
    requirements: {},
  });
  const result = evaluateFitV3({ knowledge, siteProfile: { measurementUncertaintyMm: 0 } });
  return {
    engine: 'fit-v3-shadow',
    executed: true,
    status: result.outcome,
    reasonCode: 'SYNTHETIC_SITE_UNKNOWN',
    checkCount: result.checks.length,
    evidenceReadiness: v3AuditEntry?.productEvidenceReadiness ?? 'PLACEMENT_EVIDENCE_INCOMPLETE',
  };
}

function sameOutcome(left, right) {
  const unknown = new Set(['NOT_EVALUATED', 'INSUFFICIENT_DATA', 'CONDITIONAL_FIT']);
  return left === right || (unknown.has(left) && unknown.has(right));
}

export function classifyFitV4Disagreement(input) {
  if (!input || typeof input.v2 !== 'string' || typeof input.v3 !== 'string' || typeof input.v4 !== 'string') {
    throw new TypeError('three engine outcomes required');
  }
  if (input.identityDefect === true) return 'IDENTITY_DEFECT';
  if (input.missingV4Evidence === true && ['NOT_EVALUATED', 'INSUFFICIENT_DATA'].includes(input.v4)) return 'MISSING_V4_EVIDENCE';
  if (input.policyDefect === true) return 'POLICY_DEFECT';
  if (input.correctionProven === true) return 'INTENDED_CORRECTION';
  if (sameOutcome(input.v2, input.v3) && sameOutcome(input.v3, input.v4)) return 'NO_DISAGREEMENT';
  return 'REGRESSION';
}

function sameV3PilotIdentity(receipt, pilot) {
  return receipt.canonicalProductId === pilot?.canonicalProductId
    && receipt.category === pilot.category
    && receipt.brand === pilot.brand
    && receipt.model === pilot.model
    && receipt.formFactor === pilot.formFactor;
}

function adapterRows(pilotById, receipts, fieldMap) {
  const accepted = [];
  const gaps = [];
  const indexed = receipts.map((receipt, sourceReceiptIndex) => ({ receipt, sourceReceiptIndex }));
  indexed.sort((left, right) => left.receipt.receiptId.localeCompare(right.receipt.receiptId));
  for (const { receipt, sourceReceiptIndex } of indexed) {
    const pilot = pilotById.get(receipt.canonicalProductId);
    if (!pilot) continue;
    if (!sameV3PilotIdentity(receipt, pilot)) {
      gaps.push({
        type: 'IDENTITY_GAP', reasonCode: 'V3_RECEIPT_IDENTITY_MISMATCH',
        productId: receipt.canonicalProductId, receiptId: receipt.receiptId,
      });
      continue;
    }
    const mapping = fieldMap.fields.find((field) => field.v3Mapping?.fieldId === receipt.field);
    if (!mapping) {
      gaps.push({
        type: 'EVIDENCE_GAP', reasonCode: 'LOSSY_V3_FIELD_MAPPING',
        productId: receipt.canonicalProductId, receiptId: receipt.receiptId, fieldId: receipt.field,
      });
      continue;
    }
    const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
    try {
      const adapter = adaptV3Receipt(bytes, {
        fieldMap,
        relation: mapping.v3Mapping.relation,
        coordinateFrameId: mapping.v3Mapping.coordinateFrameId,
        scope: mapping.v3Mapping.scope,
      });
      accepted.push({
        productId: receipt.canonicalProductId,
        sourceReceiptIndex,
        extraction: { encoding: 'JSON_PRETTY_2_LF', bytesSha256: bytesHash(bytes) },
        adapter,
      });
    } catch (error) {
      gaps.push({
        type: 'EVIDENCE_GAP', reasonCode: 'LOSSY_V3_FIELD_MAPPING',
        productId: receipt.canonicalProductId, receiptId: receipt.receiptId,
        fieldId: receipt.field, detail: error.message,
      });
    }
  }
  return { accepted, gaps };
}

async function readDefaults(root, input) {
  const pilotBytes = input.pilotBytes ?? await readFile(resolve(root, PILOT_RELATIVE_PATH));
  const v3BundleBytes = input.v3BundleBytes ?? await readFile(resolve(root, V3_BUNDLE_RELATIVE_PATH));
  const fieldMapBytes = await readFile(resolve(root, FIELD_MAP_RELATIVE_PATH));
  return {
    pilotBytes,
    pilot: input.pilot ?? JSON.parse(pilotBytes),
    v3BundleBytes,
    v3Bundle: input.v3Bundle ?? JSON.parse(v3BundleBytes),
    fieldMapBytes,
    rawFieldMap: JSON.parse(fieldMapBytes),
  };
}

export async function buildFitV4ShadowCohort(input = {}) {
  const root = resolve(input.root ?? DEFAULT_ROOT);
  const source = await readDefaults(root, input);
  assertSourceDocument(source.pilot, source.pilotBytes, normalizedPilot, 'pilot');
  assertSourceDocument(source.v3Bundle, source.v3BundleBytes, canonical, 'V3 receipt bundle');
  assertFrozenPilot(source.pilot);
  const active = await loadActiveRetailRelease({ root, descriptorPath: input.descriptorPath });
  const fieldMap = validateFitV4FieldMap(source.rawFieldMap);
  const v4ReceiptBundle = createFitV4ReceiptBundle([], { fieldMap });
  const pilotProducts = [...source.pilot.products].sort((left, right) => left.canonicalProductId.localeCompare(right.canonicalProductId));
  const pilotIds = new Set(pilotProducts.map((row) => row.canonicalProductId));
  const pilotById = new Map(pilotProducts.map((row) => [row.canonicalProductId, row]));
  const activeById = new Map(active.catalog.products.map((row) => [row.canonicalProductId, row]));
  const auditBytes = await readFile(resolve(root, 'data/architecture-v2/reviews/automated/fit-v3-shadow-audit.json'));
  const v3Audit = JSON.parse(auditBytes);
  const v3ById = new Map(v3Audit.entries.map((row) => [row.canonicalProductId, row]));
  const adapters = adapterRows(pilotById, source.v3Bundle.receipts ?? [], fieldMap);
  const adapterRefs = new Map();
  for (const row of adapters.accepted) {
    const refs = adapterRefs.get(row.productId) ?? [];
    refs.push(row.adapter.adapterSemanticSha256);
    adapterRefs.set(row.productId, refs);
  }
  const products = pilotProducts.map((product) => {
    const category = normalizeCategory(product.category);
    const v2 = runV2(product, activeById.get(product.canonicalProductId));
    const v3 = runV3(product, v3ById.get(product.canonicalProductId));
    const unknowns = unknownsFor(product);
    const v4 = { engine: 'fit-v4-shadow', executed: false, status: 'NOT_EVALUATED', reasonCode: 'MISSING_VALIDATED_V4_KNOWLEDGE', receiptRefs: [], unknowns };
    return {
      canonicalProductId: product.canonicalProductId,
      legacyRuntimeId: product.legacyRuntimeId,
      category,
      pilotCategory: product.category,
      brand: product.brand,
      model: product.model,
      formFactor: product.formFactor,
      activeCatalogPresent: activeById.has(product.canonicalProductId),
      activeLifecycleState: activeById.get(product.canonicalProductId)?.retailLifecycle?.lifecycleState ?? 'NOT_BOUND_TO_ACTIVE_CATALOG',
      scenarioId: `synthetic-${category}-no-site-v1`,
      v3AdapterRefs: (adapterRefs.get(product.canonicalProductId) ?? []).sort(),
      v2,
      v3,
      v4,
      disagreementClass: classifyFitV4Disagreement({
        v2: v2.status, v3: v3.status, v4: v4.status, missingV4Evidence: true,
        identityDefect: unknowns.some((row) => row.type === 'IDENTITY_GAP'),
      }),
    };
  });
  const policyHashes = Object.fromEntries(Object.entries(FIT_POLICY_PACKS_V4)
    .map(([category, pack]) => [category, semanticHash(pack)]).sort(([left], [right]) => left.localeCompare(right)));
  const semantic = canonical({
    schemaVersion: COHORT_SCHEMA_VERSION,
    cohortType: 'FIT_V4_PRIVATE_SHADOW_COHORT',
    bindings: {
      activeRelease: {
        releaseCandidateId: active.descriptor.releaseCandidateId,
        catalogSha256: active.descriptor.artifacts.publicProjection.sha256,
        historicalReferenceSha256: active.descriptor.artifacts.historicalReference.sha256,
        authorizationManifestSha256: active.descriptor.artifacts.authorizationManifest.sha256,
      },
      pilot: { bytesSha256: bytesHash(source.pilotBytes), semanticSha256: semanticHash(normalizedPilot(source.pilot)), productIdsSha256: semanticHash([...pilotIds].sort()) },
      v3ReceiptBundle: { bytesSha256: bytesHash(source.v3BundleBytes), semanticSha256: semanticHash(source.v3Bundle) },
      v3Audit: { bytesSha256: bytesHash(auditBytes), semanticSha256: semanticHash(v3Audit) },
      fieldMap: { version: fieldMap.version, bytesSha256: bytesHash(source.fieldMapBytes), semanticSha256: semanticHash(source.rawFieldMap) },
      policies: policyHashes,
      cohortCases: { semanticSha256: semanticHash(COHORT_CASES) },
      adapters: { semanticSha256: semanticHash(adapters.accepted) },
      v4ReceiptBundle: { semanticSha256: v4ReceiptBundle.bundleSha256 },
    },
    cohortCases: COHORT_CASES,
    adapters: adapters.accepted,
    gaps: adapters.gaps,
    v4ReceiptBundle,
    products,
    summary: {
      total: products.length,
      byCategory: { dishwasher: 50, refrigerator: 50 },
      adapters: adapters.accepted.length,
      lossyMappings: adapters.gaps.filter((row) => row.reasonCode === 'LOSSY_V3_FIELD_MAPPING').length,
      disagreementClasses: Object.fromEntries(FIT_V4_DISAGREEMENT_CLASSES.map((name) => [name, products.filter((row) => row.disagreementClass === name).length])),
    },
    isolation: { publicMutation: false, outputClass: 'NON_PUBLIC_IMMUTABLE' },
  });
  const semanticSha256 = semanticHash(semantic);
  return freezeDeep({ ...semantic, cohortId: `fit_v4_cohort_${semanticSha256.slice(0, 24)}`, semanticSha256 });
}

function isolatedOutput(path) {
  if (typeof path !== 'string' || !path.trim()) throw new TypeError('explicit output directory required');
  const absolute = resolve(path);
  if (absolute.split(sep).includes('public')) throw new Error('output directory must be isolated from public');
  return absolute;
}

export async function writeFitV4ShadowCohort({ artifact, outputDirectory } = {}) {
  const root = isolatedOutput(outputDirectory);
  await mkdir(root, { recursive: true });
  const directory = join(root, artifact.cohortId);
  try {
    await stat(directory);
    throw new Error(`immutable cohort exists: ${directory}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(directory, { recursive: false });
  const path = join(directory, 'cohort.json');
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(8).toString('hex')}`;
  try {
    const bytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`);
    await writeFile(temporary, bytes, { flag: 'wx' });
    await rename(temporary, path);
    return path;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function runCli(args = process.argv.slice(2)) {
  const outputIndex = args.indexOf('--output-dir');
  const outputDirectory = outputIndex >= 0 ? args[outputIndex + 1] : null;
  const artifact = await buildFitV4ShadowCohort();
  const path = await writeFitV4ShadowCohort({ artifact, outputDirectory });
  process.stdout.write(`${JSON.stringify({ cohortId: artifact.cohortId, path, summary: artifact.summary })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runCli();
}
