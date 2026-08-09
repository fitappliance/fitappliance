#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadActiveRetailRelease } from '../../src/domain/active-retail-release.mjs';
import { inferApplianceFormFactor } from '../../src/domain/appliance-form-factor.mjs';
import { validateFitV4FieldMap } from '../../src/domain/fit-v4-contract.mjs';
import { FIT_POLICY_PACKS_V4 } from '../../src/domain/fit-policies-v4/index.mjs';

const DEFAULT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FIELD_MAP_PATH = 'data/architecture-v2/policies/fit-v4-field-map.json';
const RECEIPT_BUNDLE_PATH = 'data/architecture-v2/reviews/automated/installation-evidence-receipts.json';
const CATEGORIES = Object.freeze(['dryer', 'washing_machine']);
const LIFECYCLES = Object.freeze(['CURRENT_RETAIL', 'UNKNOWN_RETAIL', 'CATALOG_ARCHIVED']);
const HINT_AUTHORITY = 'CATALOG_HINT_UNVERIFIED';
const TARGET_PER_CATEGORY = 50;

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

function textFor(product) {
  return [
    product?.displayName,
    product?.readableSpec,
    ...(Array.isArray(product?.features) ? product.features : []),
  ].filter(Boolean).join(' ');
}

export function inferDryerTechnologyHint(product) {
  if (product?.cat !== 'dryer') return null;
  const text = textFor(product);
  if (/\bheat[- ]?pump\b/i.test(text)) return 'heat_pump';
  if (/\b(?:condenser|condensing)\b/i.test(text)) return 'condenser';
  if (/\bvented\b/i.test(text)) return 'vented';
  if (/\bgas\b/i.test(text)) return 'gas';
  return 'unknown';
}

function lifecycleState(product) {
  const state = product?.retailLifecycle?.lifecycleState;
  if (!LIFECYCLES.includes(state)) throw new TypeError(`unsupported lifecycle state: ${String(state)}`);
  return state;
}

function normalizedProduct(product) {
  const formFactor = inferApplianceFormFactor(product) ?? 'unknown';
  const dryerTechnology = inferDryerTechnologyHint(product);
  return {
    canonicalProductId: product.canonicalProductId,
    category: product.cat,
    brand: String(product.brand ?? '').trim(),
    model: String(product.model ?? '').trim(),
    lifecycleState: lifecycleState(product),
    hints: {
      formFactor: { value: formFactor, authority: HINT_AUTHORITY },
      ...(product.cat === 'dryer'
        ? { dryerTechnology: { value: dryerTechnology, authority: HINT_AUTHORITY } }
        : {}),
    },
    exactEvidence: {
      status: 'UNSUPPORTED',
      reasonCode: 'NO_RECEIPT_BOUND_EXACT_LAUNDRY_EVIDENCE',
      receiptRefs: [],
    },
  };
}

function groupKey(product) {
  return [
    product.hints.formFactor.value,
    product.hints.dryerTechnology?.value ?? 'not_applicable',
    product.brand.toLocaleLowerCase('en-AU'),
  ].join('|');
}

function roundRobin(rows, limit) {
  const groups = new Map();
  for (const row of rows) {
    const key = groupKey(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.sort((left, right) => left.canonicalProductId.localeCompare(right.canonicalProductId));
  }
  const keys = [...groups.keys()].sort();
  const selected = [];
  for (let position = 0; selected.length < limit; position += 1) {
    let added = false;
    for (const key of keys) {
      const row = groups.get(key)[position];
      if (!row) continue;
      selected.push(row);
      added = true;
      if (selected.length === limit) break;
    }
    if (!added) break;
  }
  return selected;
}

export function selectLaundryProducts(products, category, limit = TARGET_PER_CATEGORY) {
  if (!CATEGORIES.includes(category)) throw new TypeError(`unsupported laundry category: ${String(category)}`);
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError('positive integer selection limit required');
  const rows = products.filter((product) => product.cat === category).map(normalizedProduct);
  if (rows.length < limit) throw new Error(`${category} population is below requested cohort size`);
  const selected = [];
  for (const state of LIFECYCLES) {
    const remaining = limit - selected.length;
    if (remaining === 0) break;
    selected.push(...roundRobin(rows.filter((row) => row.lifecycleState === state), remaining));
  }
  if (selected.length !== limit) throw new Error(`${category} lifecycle selection is incomplete`);
  return selected;
}

function increment(target, key) {
  target[key] = (target[key] ?? 0) + 1;
}

function sortedObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function summarize(rows) {
  const byCategory = {};
  const byLifecycle = {};
  const byBrand = {};
  const byFormFactor = {};
  const byDryerTechnology = {};
  const byCategoryLifecycle = {};
  for (const row of rows) {
    increment(byCategory, row.category);
    increment(byLifecycle, row.lifecycleState);
    increment(byBrand, row.brand || 'unknown');
    increment(byFormFactor, row.hints.formFactor.value);
    if (row.category === 'dryer') increment(byDryerTechnology, row.hints.dryerTechnology.value);
    byCategoryLifecycle[row.category] ??= {};
    increment(byCategoryLifecycle[row.category], row.lifecycleState);
  }
  return {
    byCategory: sortedObject(byCategory),
    byLifecycle: sortedObject(byLifecycle),
    byCategoryLifecycle: Object.fromEntries(Object.entries(byCategoryLifecycle).sort(([left], [right]) => left.localeCompare(right))
      .map(([category, counts]) => [category, sortedObject(counts)])),
    byBrand: sortedObject(byBrand),
    byFormFactor: sortedObject(byFormFactor),
    byDryerTechnology: sortedObject(byDryerTechnology),
  };
}

function buildCoverageMatrix() {
  const branches = new Map();
  for (const category of CATEGORIES) {
    const pack = FIT_POLICY_PACKS_V4[category];
    for (const policyCase of pack.coverageManifest.cases) {
      if (policyCase.disposition !== 'EVALUATED'
        || !pack.supportedInstallationModes.includes(policyCase.installationMode)
        || !pack.recognizedFormFactors.includes(policyCase.formFactor)) continue;
      const selectorValues = canonical(policyCase.selectorValues);
      const key = JSON.stringify([
        category,
        policyCase.formFactor,
        policyCase.installationMode,
        policyCase.selectorBranchId,
        selectorValues,
      ]);
      const branch = branches.get(key) ?? {
        category,
        formFactor: policyCase.formFactor,
        installationMode: policyCase.installationMode,
        selectorBranchId: policyCase.selectorBranchId,
        selectorValues,
        requiredFieldIds: new Set(),
        requiredRuleIds: new Set(),
        relations: new Set(),
        configurationQuantifiers: new Set(),
        evaluatedPolicyCaseCount: 0,
      };
      branch.requiredFieldIds.add(policyCase.fieldId);
      branch.requiredRuleIds.add(policyCase.ruleId);
      branch.relations.add(policyCase.relation);
      branch.configurationQuantifiers.add(policyCase.configurationQuantifier);
      branch.evaluatedPolicyCaseCount += 1;
      branches.set(key, branch);
    }
  }
  return [...branches.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, branch]) => ({
    category: branch.category,
    formFactor: branch.formFactor,
    installationMode: branch.installationMode,
    selectorBranchId: branch.selectorBranchId,
    selectorValues: branch.selectorValues,
    requiredFieldIds: [...branch.requiredFieldIds].sort(),
    requiredRuleIds: [...branch.requiredRuleIds].sort(),
    relations: [...branch.relations].sort(),
    configurationQuantifiers: [...branch.configurationQuantifiers].sort(),
    evaluatedPolicyCaseCount: branch.evaluatedPolicyCaseCount,
    receiptBoundExactModelCaseCount: 0,
    explicitAdversarialCaseCount: 0,
    calibrationStatus: 'UNSUPPORTED',
    reasonCodes: [
      'NO_RECEIPT_BOUND_EXACT_MODEL_POLICY_CASE',
      'NO_EXPLICIT_ADVERSARIAL_POLICY_CASE',
    ],
  }));
}

function buildQuarantine(products) {
  return products
    .filter((product) => product.cat === 'dishwasher' && product.geometry_v2?.formFactor === 'front_loader')
    .map((product) => {
      const withoutPersistedGeometry = { ...product, geometry_v2: undefined };
      return {
        canonicalProductId: product.canonicalProductId,
        brand: product.brand,
        model: product.model,
        sourceFormFactor: 'front_loader',
        inferredTargetHint: inferApplianceFormFactor(withoutPersistedGeometry),
        hintAuthority: HINT_AUTHORITY,
        status: 'QUARANTINED_PENDING_EXISTING_IDENTITY_WORKFLOW',
        mutationApplied: false,
      };
    })
    .sort((left, right) => left.canonicalProductId.localeCompare(right.canonicalProductId));
}

function buildExclusions(products) {
  return products.filter((product) => product.cat === 'washtower_combo')
    .map((product) => ({
      canonicalProductId: product.canonicalProductId,
      brand: product.brand,
      model: product.model,
      category: product.cat,
      reasonCode: 'WASHTOWER_COMBO_REQUIRES_DEDICATED_POLICY',
      excludedFromFourCategoryClaims: true,
    }))
    .sort((left, right) => left.canonicalProductId.localeCompare(right.canonicalProductId));
}

function summarizePolicyCoverage(coverageMatrix) {
  const groups = new Map();
  for (const row of coverageMatrix) {
    const key = [row.category, row.formFactor, row.installationMode].join('|');
    const group = groups.get(key) ?? {
      category: row.category,
      formFactor: row.formFactor,
      installationMode: row.installationMode,
      branchConfigurations: 0,
      supported: 0,
      unsupported: 0,
    };
    group.branchConfigurations += 1;
    if (row.calibrationStatus === 'SUPPORTED') group.supported += 1;
    else group.unsupported += 1;
    groups.set(key, group);
  }
  const byConfiguration = [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, row]) => row);
  const supported = coverageMatrix.filter((row) => row.calibrationStatus === 'SUPPORTED').length;
  return {
    byConfiguration,
    supported,
    total: coverageMatrix.length,
    unsupported: coverageMatrix.length - supported,
  };
}

function reportFor({ summary, scopeDecision, identityQuarantine, excludedProducts }) {
  const branch = summary.policyBranchCoverage;
  const lines = [
    '# Fit V4 laundry cohort coverage',
    '',
    'This is a private, non-public calibration inventory. Catalog-derived form factor and dryer technology values are unverified hints.',
    '',
    '## Cohort',
    '',
    `- Washing machines: ${summary.selected.byCategory.washing_machine}`,
    `- Dryers: ${summary.selected.byCategory.dryer}`,
    `- Current-retail products: ${summary.selected.byLifecycle.CURRENT_RETAIL}`,
    `- Unknown-retail products: ${summary.selected.byLifecycle.UNKNOWN_RETAIL}`,
    `- Archived products: ${summary.selected.byLifecycle.CATALOG_ARCHIVED}`,
    '',
    '## Calibration',
    '',
    `- Policy branch configurations: ${branch.total}`,
    `- Supported: ${branch.supported}`,
    `- Unsupported: ${branch.unsupported}`,
    `- Laundry calibration eligible: ${scopeDecision.laundryCalibrationEligible}`,
    '',
    '## Branch matrix',
    '',
    '| Category | Form factor | Installation mode | Branch configurations | Supported | Unsupported |',
    '| --- | --- | --- | ---: | ---: | ---: |',
    ...branch.byConfiguration.map((row) => (
      `| ${row.category} | ${row.formFactor} | ${row.installationMode} | ${row.branchConfigurations} | ${row.supported} | ${row.unsupported} |`
    )),
    '',
    '## Current-retail shortfall',
    '',
    `- Washing machines: ${scopeDecision.currentRetailSample.byCategory.washing_machine.shortfall}`,
    `- Dryers: ${scopeDecision.currentRetailSample.byCategory.dryer.shortfall}`,
    '',
    '## Isolation',
    '',
    `- Dishwasher identity quarantines: ${identityQuarantine.length}`,
    `- WashTower exclusions: ${excludedProducts.length}`,
    '- Refrigerator and dishwasher calibration eligibility: not assessed by Task 8',
    '',
    '### Dishwasher form-factor quarantine',
    '',
    '| Canonical product | Brand | Model | Persisted | Inferred hint | Status |',
    '| --- | --- | --- | --- | --- | --- |',
    ...identityQuarantine.map((row) => (
      `| ${row.canonicalProductId} | ${row.brand} | ${row.model} | ${row.sourceFormFactor} | ${row.inferredTargetHint ?? 'unknown'} | ${row.status} |`
    )),
    '',
    '### WashTower exclusions',
    '',
    '| Canonical product | Brand | Model | Reason |',
    '| --- | --- | --- | --- |',
    ...excludedProducts.map((row) => (
      `| ${row.canonicalProductId} | ${row.brand} | ${row.model} | ${row.reasonCode} |`
    )),
    '',
  ];
  return lines.join('\n');
}

async function readTrackedInputs(root) {
  const [fieldMapBytes, receiptBytes] = await Promise.all([
    readFile(resolve(root, FIELD_MAP_PATH)),
    readFile(resolve(root, RECEIPT_BUNDLE_PATH)),
  ]);
  const rawFieldMap = JSON.parse(fieldMapBytes);
  const fieldMap = validateFitV4FieldMap(rawFieldMap);
  const receiptBundle = JSON.parse(receiptBytes);
  if (receiptBundle.schemaVersion !== 1 || !Array.isArray(receiptBundle.receipts)) {
    throw new TypeError('tracked installation receipt bundle required');
  }
  return { fieldMapBytes, rawFieldMap, fieldMap, receiptBytes, receiptBundle };
}

function activeBinding(active) {
  return {
    releaseCandidateId: active.descriptor.releaseCandidateId,
    catalogSha256: active.descriptor.artifacts.publicProjection.sha256,
    historicalReferenceSha256: active.descriptor.artifacts.historicalReference.sha256,
    authorizationManifestSha256: active.descriptor.artifacts.authorizationManifest.sha256,
  };
}

export async function buildFitV4LaundryCohort(input = {}) {
  const root = resolve(input.root ?? DEFAULT_ROOT);
  const [active, tracked] = await Promise.all([
    loadActiveRetailRelease({ root, descriptorPath: input.descriptorPath }),
    readTrackedInputs(root),
  ]);
  const sourceRows = active.catalog.products
    .filter((product) => CATEGORIES.includes(product.cat))
    .map(normalizedProduct);
  const products = CATEGORIES.flatMap((category) => selectLaundryProducts(
    active.catalog.products,
    category,
    TARGET_PER_CATEGORY,
  )).sort((left, right) => left.canonicalProductId.localeCompare(right.canonicalProductId));
  const coverageMatrix = buildCoverageMatrix();
  const identityQuarantine = buildQuarantine(active.catalog.products);
  const excludedProducts = buildExclusions(active.catalog.products);
  const selectedSummary = summarize(products);
  const sourceSummary = summarize(sourceRows);
  const currentByCategory = Object.fromEntries(CATEGORIES.map((category) => [
    category,
    sourceRows.filter((row) => row.category === category && row.lifecycleState === 'CURRENT_RETAIL').length,
  ]));
  const currentSelected = Object.fromEntries(CATEGORIES.map((category) => [
    category,
    products.filter((row) => row.category === category && row.lifecycleState === 'CURRENT_RETAIL').length,
  ]));
  const scopeDecision = {
    laundryCalibrationEligible: false,
    calibrationReasonCodes: [
      'NO_RECEIPT_BOUND_EXACT_LAUNDRY_POLICY_CASES',
      'NO_EXPLICIT_ADVERSARIAL_LAUNDRY_POLICY_CASES',
    ],
    currentRetailSample: {
      targetPerCategory: TARGET_PER_CATEGORY,
      byCategory: Object.fromEntries(CATEGORIES.map((category) => [category, {
        available: currentByCategory[category],
        selected: currentSelected[category],
        shortfall: Math.max(0, TARGET_PER_CATEGORY - currentByCategory[category]),
      }])),
      targetMet: CATEGORIES.every((category) => currentByCategory[category] >= TARGET_PER_CATEGORY),
    },
    maximumFuturePublicCandidateScope: {
      categoryCounts: currentByCategory,
      total: Object.values(currentByCategory).reduce((sum, count) => sum + count, 0),
      status: 'EVIDENCE_NOT_ESTABLISHED',
      limitation: 'CURRENT_RETAIL_POPULATION_ONLY_NOT_PUBLICATION_ELIGIBILITY',
    },
    unrelatedCategories: {
      dishwasher: 'NOT_ASSESSED_BY_TASK_8',
      refrigerator: 'NOT_ASSESSED_BY_TASK_8',
    },
  };
  const summary = {
    sourcePopulation: sourceSummary,
    selected: selectedSummary,
    receiptBoundExactLaundryProducts: 0,
    policyBranchCoverage: summarizePolicyCoverage(coverageMatrix),
    identityQuarantineCount: identityQuarantine.length,
    excludedWashTowerCount: excludedProducts.length,
  };
  const reportContent = reportFor({ summary, scopeDecision, identityQuarantine, excludedProducts });
  const semantic = {
    schemaVersion: 1,
    artifactType: 'FIT_V4_PRIVATE_LAUNDRY_CALIBRATION_COHORT',
    bindings: {
      activeRelease: activeBinding(active),
      fieldMap: {
        version: tracked.fieldMap.version,
        bytesSha256: bytesHash(tracked.fieldMapBytes),
        semanticSha256: semanticHash(tracked.rawFieldMap),
      },
      policyPacks: Object.fromEntries(CATEGORIES.map((category) => [category, {
        packVersion: FIT_POLICY_PACKS_V4[category].packVersion,
        semanticSha256: semanticHash(FIT_POLICY_PACKS_V4[category]),
      }])),
      installationReceiptBundle: {
        schemaVersion: tracked.receiptBundle.schemaVersion,
        bytesSha256: bytesHash(tracked.receiptBytes),
        semanticSha256: semanticHash(tracked.receiptBundle),
        receiptCount: tracked.receiptBundle.receipts.length,
      },
    },
    selectionPolicy: {
      targetPerCategory: TARGET_PER_CATEGORY,
      lifecyclePriority: [...LIFECYCLES],
      withinLifecycle: 'ROUND_ROBIN_FORM_FACTOR_DRYER_TECHNOLOGY_BRAND_THEN_CANONICAL_ID',
      hintAuthority: HINT_AUTHORITY,
    },
    products,
    receipts: [],
    coverageMatrix,
    identityQuarantine,
    excludedProducts,
    summary,
    scopeDecision,
    coverageReport: {
      format: 'text/markdown',
      content: reportContent,
      bytesSha256: bytesHash(reportContent),
    },
    isolation: {
      outputClass: 'NON_PUBLIC_IMMUTABLE',
      publicMutation: false,
      evidenceAcquisition: false,
    },
  };
  const semanticSha256 = semanticHash(semantic);
  return freezeDeep({
    ...semantic,
    cohortId: `fit_v4_laundry_${semanticSha256.slice(0, 24)}`,
    semanticSha256,
  });
}

function artifactSemanticHash(artifact) {
  const copy = { ...artifact };
  delete copy.cohortId;
  delete copy.semanticSha256;
  return semanticHash(copy);
}

function violation(code, detail) {
  return { code, detail };
}

export async function auditFitV4LaundryCohort(artifact, input = {}) {
  const root = resolve(input.root ?? DEFAULT_ROOT);
  const violations = [];
  if (artifact?.schemaVersion !== 1
    || artifact?.artifactType !== 'FIT_V4_PRIVATE_LAUNDRY_CALIBRATION_COHORT') {
    violations.push(violation('INVALID_COHORT', 'schema or private cohort type invalid'));
  }
  const expectedSemantic = artifactSemanticHash(artifact);
  if (artifact.semanticSha256 !== expectedSemantic
    || artifact.cohortId !== `fit_v4_laundry_${expectedSemantic.slice(0, 24)}`) {
    violations.push(violation('SEMANTIC_HASH_DRIFT', 'cohort identity does not match semantic content'));
  }
  const [active, tracked] = await Promise.all([
    loadActiveRetailRelease({ root, descriptorPath: input.descriptorPath }),
    readTrackedInputs(root),
  ]);
  if (JSON.stringify(artifact.bindings?.activeRelease) !== JSON.stringify(activeBinding(active))) {
    violations.push(violation('ACTIVE_RELEASE_DRIFT', 'active release binding changed'));
  }
  const fieldBinding = {
    version: tracked.fieldMap.version,
    bytesSha256: bytesHash(tracked.fieldMapBytes),
    semanticSha256: semanticHash(tracked.rawFieldMap),
  };
  if (JSON.stringify(artifact.bindings?.fieldMap) !== JSON.stringify(fieldBinding)) {
    violations.push(violation('FIELD_MAP_BINDING_DRIFT', 'field map binding changed'));
  }
  for (const category of CATEGORIES) {
    const expected = {
      packVersion: FIT_POLICY_PACKS_V4[category].packVersion,
      semanticSha256: semanticHash(FIT_POLICY_PACKS_V4[category]),
    };
    if (JSON.stringify(artifact.bindings?.policyPacks?.[category]) !== JSON.stringify(expected)) {
      violations.push(violation('POLICY_BINDING_DRIFT', `${category} policy binding changed`));
    }
  }
  const receiptBinding = {
    schemaVersion: tracked.receiptBundle.schemaVersion,
    bytesSha256: bytesHash(tracked.receiptBytes),
    semanticSha256: semanticHash(tracked.receiptBundle),
    receiptCount: tracked.receiptBundle.receipts.length,
  };
  if (JSON.stringify(artifact.bindings?.installationReceiptBundle) !== JSON.stringify(receiptBinding)) {
    violations.push(violation('RECEIPT_BINDING_DRIFT', 'installation receipt bundle binding changed'));
  }
  if (artifact.coverageReport?.bytesSha256 !== bytesHash(artifact.coverageReport?.content ?? '')) {
    violations.push(violation('REPORT_BINDING_DRIFT', 'coverage report bytes changed'));
  }
  if (artifact.isolation?.publicMutation !== false
    || artifact.isolation?.evidenceAcquisition !== false
    || artifact.receipts?.length !== 0) {
    violations.push(violation('ISOLATION_VIOLATION', 'cohort crossed its private evidence boundary'));
  }
  const expected = await buildFitV4LaundryCohort({ root, descriptorPath: input.descriptorPath });
  if (artifact.semanticSha256 !== expected.semanticSha256) {
    violations.push(violation('SOURCE_ARTIFACT_DRIFT', 'cohort differs from independently rebuilt tracked inputs'));
  }
  if (semanticHash(artifact.products) !== semanticHash(expected.products)
    || semanticHash(artifact.selectionPolicy) !== semanticHash(expected.selectionPolicy)) {
    violations.push(violation('SOURCE_COHORT_DRIFT', 'selected source rows or hint authority changed'));
  }
  if (semanticHash(artifact.coverageMatrix) !== semanticHash(expected.coverageMatrix)) {
    violations.push(violation('POLICY_MATRIX_DRIFT', 'policy coverage matrix changed'));
  }
  const derived = ['identityQuarantine', 'excludedProducts', 'summary', 'scopeDecision', 'coverageReport'];
  if (derived.some((key) => semanticHash(artifact[key]) !== semanticHash(expected[key]))) {
    violations.push(violation('DERIVED_ARTIFACT_DRIFT', 'derived cohort decision or report changed'));
  }
  return freezeDeep({ passed: violations.length === 0, violations });
}

function isolatedOutput(path) {
  if (typeof path !== 'string' || !path.trim()) throw new TypeError('explicit output directory required');
  const absolute = resolve(path);
  if (absolute.split(sep).some((part) => part.toLowerCase() === 'public')) {
    throw new Error('output directory must be isolated from public');
  }
  return absolute;
}

export async function writeFitV4LaundryCohort({ artifact, outputDirectory } = {}) {
  const root = isolatedOutput(outputDirectory);
  if (artifactSemanticHash(artifact) !== artifact.semanticSha256) throw new Error('semantic hash drift');
  await mkdir(root, { recursive: true });
  const directory = join(root, artifact.cohortId);
  try {
    await stat(directory);
    throw new Error(`immutable cohort exists: ${directory}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const temporary = join(root, `.${artifact.cohortId}.tmp-${process.pid}-${randomBytes(8).toString('hex')}`);
  try {
    await mkdir(temporary, { recursive: false });
    await Promise.all([
      writeFile(join(temporary, 'cohort.json'), `${JSON.stringify(artifact, null, 2)}\n`, { flag: 'wx' }),
      writeFile(join(temporary, 'coverage-report.md'), artifact.coverageReport.content, { flag: 'wx' }),
    ]);
    await rename(temporary, directory);
    return {
      cohortPath: join(directory, 'cohort.json'),
      reportPath: join(directory, 'coverage-report.md'),
    };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

export async function runCli(args = process.argv.slice(2)) {
  const outputIndex = args.indexOf('--output-dir');
  const outputDirectory = outputIndex >= 0 ? args[outputIndex + 1] : null;
  const artifact = await buildFitV4LaundryCohort();
  const paths = await writeFitV4LaundryCohort({ artifact, outputDirectory });
  process.stdout.write(`${JSON.stringify({ cohortId: artifact.cohortId, paths, summary: artifact.summary })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runCli();
}
