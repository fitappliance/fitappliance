import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FIT_POLICY_PACKS_V4 } from '../../src/domain/fit-policies-v4/index.mjs';

const CATEGORIES = Object.freeze(['dishwasher', 'dryer', 'refrigerator', 'washing_machine']);
const OUTCOMES = new Set(['NO_FIT', 'INSUFFICIENT_DATA', 'CONDITIONAL_FIT', 'LIKELY_FIT_ESTIMATED', 'VERIFIED_FIT']);
const ALLOWED_ORIGIN = 'SOURCE_BACKED_INDEPENDENT_REVIEW';
const SHA256 = /^[a-f0-9]{64}$/;
const BLOCKING_REASONS = new Set([
  'MINIMUM_SOURCE_BACKED_CASES_NOT_MET',
  'SUPPORTED_POLICY_BRANCH_COVERAGE_NOT_PROVEN',
  'BOUNDARY_AND_ADVERSARIAL_COVERAGE_NOT_PROVEN',
]);
const MARKERS = Object.freeze([
  ['fitScoreNumeric', /\bfitScoreNumeric\b/],
  ['fitScore', /\bfitScore\b/],
  ['fit-score', /fit-score/],
  ['score-filter-or-fallback', /\b(?:scoreMin|finalScore|sortScore)\b/],
  ['verified-fit-marker', /\bVERIFIED_FIT\b|\bverified_fit\b|\bdimensions_verified\b/],
  ['verified-filter-or-evidence', /\b(?:verifiedOnly|verificationLevel|has_pdf_evidence|clearance_verified)\b/],
  ['fit-decision-marker', /\bfitDecision\b/],
  ['verified-fit-eligibility', /\b(?:verifiedFitEligible|successfulFitOutcome)\b/],
  ['verified-fit-derived-field', /(?:missing_for_verified_fit|receiptBoundVerified|receipt_bound_verified)/],
]);
const LEGACY_SCAN_ROOTS = Object.freeze(['src', 'scripts', 'public/scripts', 'public/data']);
const V4_IMPLEMENTATION_PATH = /fit[^/]*[-_]v4/i;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function semanticHash(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${label} required`);
  return value;
}

function requiredArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} array required`);
  return value;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} object required`);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new TypeError(`${label} schema keys invalid`);
  }
}

function exactSet(actual, expected, label) {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new TypeError(`${label} must enumerate ${expected.join(', ')}`);
  }
}

function policyCoverage(category) {
  const pack = FIT_POLICY_PACKS_V4[category];
  if (!pack) throw new TypeError(`unknown calibration policy category: ${category}`);
  const supportedCaseIds = pack.coverageManifest.cases
    .filter((row) => row.disposition === 'EVALUATED')
    .map((row) => row.id);
  return {
    binding: {
      packVersion: pack.packVersion,
      fieldMapVersion: pack.fieldMapVersion,
      packSha256: semanticHash(pack),
      coverageSha256: semanticHash(pack.coverageManifest),
      supportedCoverageCaseCount: supportedCaseIds.length,
    },
    supportedCaseIds,
  };
}

function validateLabelRegistry(registry, expectedSha256) {
  exactKeys(registry, ['schemaVersion', 'registryId', 'frozenAt', 'labels', 'registrySha256'], 'calibration label registry');
  if (registry.schemaVersion !== 1) throw new TypeError('calibration label registry schema 1 required');
  requiredText(registry.registryId, 'calibration label registry ID');
  if (!Number.isFinite(Date.parse(requiredText(registry.frozenAt, 'calibration label registry frozenAt')))) {
    throw new TypeError('calibration label registry frozenAt invalid');
  }
  const payload = canonical({
    schemaVersion: 1,
    registryId: registry.registryId,
    frozenAt: registry.frozenAt,
    labels: requiredArray(registry.labels, 'calibration labels'),
  });
  if (!SHA256.test(registry.registrySha256) || semanticHash(payload) !== registry.registrySha256
    || registry.registrySha256 !== expectedSha256) {
    throw new TypeError('calibration label registry hash or manifest binding drift');
  }
  const index = new Map();
  for (const row of registry.labels) {
    exactKeys(row, [
      'labelId', 'caseId', 'category', 'canonicalProductId', 'installationOutcome',
      'preferenceBand', 'sourceRefs', 'sourceEvidenceSha256', 'reviewerId',
      'reviewerIndependent', 'reviewedAt', 'reviewRecordSha256',
    ], 'calibration label registry entry');
    const labelId = requiredText(row.labelId, 'calibration label ID');
    if (index.has(labelId)) throw new TypeError(`duplicate calibration label ID: ${labelId}`);
    const refs = requiredArray(row.sourceRefs, 'calibration label source refs');
    const hashes = requiredArray(row.sourceEvidenceSha256, 'calibration source evidence hashes');
    if (!refs.length || refs.length !== hashes.length || hashes.some((hash) => !SHA256.test(hash))) {
      throw new TypeError(`calibration label source evidence binding invalid: ${labelId}`);
    }
    requiredText(row.reviewerId, `calibration reviewer ID: ${labelId}`);
    if (row.reviewerIndependent !== true) throw new TypeError(`calibration independent reviewer required: ${labelId}`);
    const reviewedAt = Date.parse(requiredText(row.reviewedAt, `calibration reviewedAt: ${labelId}`));
    if (!Number.isFinite(reviewedAt) || reviewedAt > Date.parse(registry.frozenAt)) {
      throw new TypeError(`calibration review timestamp invalid: ${labelId}`);
    }
    if (!SHA256.test(row.reviewRecordSha256)) throw new TypeError(`calibration independent review record hash invalid: ${labelId}`);
    index.set(labelId, canonical(row));
  }
  return index;
}

export function expectedCalibrationSplit(row, holdout) {
  if (!holdout || holdout.strategy !== 'STRATIFIED_SHA256_V1' || holdout.fraction !== 0.3) {
    throw new TypeError('30% stratified SHA-256 holdout protocol required');
  }
  const strata = requiredArray(holdout.strata, 'holdout strata');
  const values = strata.map((name) => requiredText(row[name], `holdout stratum ${name}`));
  const digest = createHash('sha256')
    .update([requiredText(holdout.seed, 'holdout seed'), ...values, requiredText(row.caseId, 'case ID')].join('\0'))
    .digest('hex');
  const bucket = Number.parseInt(digest.slice(0, 12), 16) / 0x1000000000000;
  return bucket < holdout.fraction ? 'holdout' : 'calibration';
}

function validateCase(row, category, manifest, labelIndex, usedLabels, ids, productIds) {
  if (!row || typeof row !== 'object') throw new TypeError('calibration case object required');
  exactKeys(row, [
    'caseId', 'category', 'canonicalProductId', 'sourceLabelOrigin', 'sourceRefs',
    'installationOutcome', 'preferenceBand', 'policyBranchIds', 'coverageTags', 'split',
    'labelRegistryEntryId',
  ], 'calibration case');
  const caseId = requiredText(row.caseId, 'case ID');
  if (ids.has(caseId)) throw new TypeError(`duplicate calibration case ID: ${caseId}`);
  ids.add(caseId);
  if (row.category !== category) throw new TypeError(`calibration case category mismatch: ${caseId}`);
  const productId = requiredText(row.canonicalProductId, 'calibration canonical product ID');
  if (productIds.has(productId)) throw new TypeError(`duplicate calibration product: ${productId}`);
  productIds.add(productId);
  if (row.sourceLabelOrigin !== manifest.labelPolicy.allowedOrigin || row.sourceLabelOrigin !== ALLOWED_ORIGIN) {
    throw new TypeError(`evaluator-derived or non-source-backed label prohibited: ${caseId}`);
  }
  if (!manifest.labelPolicy.evaluatorDerivedLabelsProhibited) {
    throw new TypeError('evaluator-derived labels must be prohibited');
  }
  if (!requiredArray(row.sourceRefs, 'case source refs').length
    || new Set(row.sourceRefs.map((ref) => requiredText(ref, 'case source ref'))).size !== row.sourceRefs.length) {
    throw new TypeError(`case source refs invalid: ${caseId}`);
  }
  if (!OUTCOMES.has(row.installationOutcome)) throw new TypeError(`case installation outcome invalid: ${caseId}`);
  requiredText(row.preferenceBand, 'case preference band');
  const labelId = requiredText(row.labelRegistryEntryId, 'case label registry entry ID');
  const label = labelIndex.get(labelId);
  if (!label || usedLabels.has(labelId)
    || label.caseId !== caseId || label.category !== category
    || label.canonicalProductId !== productId
    || label.installationOutcome !== row.installationOutcome
    || label.preferenceBand !== row.preferenceBand
    || semanticHash(label.sourceRefs) !== semanticHash(row.sourceRefs)) {
    throw new TypeError(`case is not bound to one frozen independent label entry: ${caseId}`);
  }
  usedLabels.add(labelId);
  const policyBranchIds = requiredArray(row.policyBranchIds, 'case policy branch IDs');
  if (new Set(policyBranchIds).size !== policyBranchIds.length) throw new TypeError(`duplicate case policy branch ID: ${caseId}`);
  policyBranchIds.forEach((id) => requiredText(id, 'case policy branch ID'));
  requiredArray(row.coverageTags, 'case coverage tags').forEach((tag) => requiredText(tag, 'case coverage tag'));
  const expected = expectedCalibrationSplit(row, manifest.holdout);
  if (row.split !== expected) throw new TypeError(`holdout split drift or leakage: ${caseId}`);
  return row;
}

export function validateFitV4CalibrationManifest(manifest, { labelRegistry } = {}) {
  if (!manifest || manifest.schemaVersion !== 1) throw new TypeError('Fit V4 calibration manifest schema 1 required');
  exactKeys(manifest, [
    'schemaVersion', 'manifestId', 'frozenAt', 'minimumSourceBackedCasesPerEligibleCategory',
    'labelRegistrySha256', 'labelPolicy', 'holdout', 'categories',
  ], 'calibration manifest');
  requiredText(manifest.manifestId, 'calibration manifest ID');
  const frozenAt = requiredText(manifest.frozenAt, 'calibration frozen timestamp');
  if (!Number.isFinite(Date.parse(frozenAt))) throw new TypeError('calibration frozen timestamp invalid');
  if (!SHA256.test(manifest.labelRegistrySha256 ?? '')) throw new TypeError('calibration label registry SHA-256 required');
  const labelIndex = validateLabelRegistry(labelRegistry, manifest.labelRegistrySha256);
  if (manifest.minimumSourceBackedCasesPerEligibleCategory !== 50) {
    throw new TypeError('minimum 50 source-backed cases per eligible category required');
  }
  if (manifest.labelPolicy?.allowedOrigin !== ALLOWED_ORIGIN
    || manifest.labelPolicy?.evaluatorDerivedLabelsProhibited !== true) {
    throw new TypeError('source-backed independent labels and evaluator-derived prohibition required');
  }
  exactKeys(manifest.labelPolicy, ['allowedOrigin', 'evaluatorDerivedLabelsProhibited'], 'calibration label policy');
  exactKeys(manifest.holdout, ['strategy', 'fraction', 'strata', 'seed'], 'calibration holdout');
  expectedCalibrationSplit({
    caseId: 'protocol-check', category: 'refrigerator', installationOutcome: 'VERIFIED_FIT', preferenceBand: 'protocol',
  }, manifest.holdout);
  const categories = requiredArray(manifest.categories, 'calibration categories');
  exactSet(categories.map((row) => row.category), CATEGORIES, 'calibration categories');
  const ids = new Set();
  const productIds = new Set();
  const usedLabels = new Set();
  for (const category of categories) {
    exactKeys(category, [
      'category', 'sourceBackedCaseCount', 'eligible', 'blockingReasons',
      'policyBinding', 'cases',
    ], 'calibration category');
    const expectedCoverage = policyCoverage(category.category);
    exactKeys(category.policyBinding, [
      'packVersion', 'fieldMapVersion', 'packSha256', 'coverageSha256',
      'supportedCoverageCaseCount',
    ], `${category.category} policy binding`);
    if (semanticHash(category.policyBinding) !== semanticHash(expectedCoverage.binding)) {
      throw new TypeError(`${category.category} policy coverage binding drift`);
    }
    const cases = requiredArray(category.cases, `${category.category} cases`);
    if (!Number.isInteger(category.sourceBackedCaseCount)
      || category.sourceBackedCaseCount < 0
      || category.sourceBackedCaseCount !== cases.length) {
      throw new TypeError(`${category.category} source-backed case count drift`);
    }
    cases.forEach((row) => validateCase(row, category.category, manifest, labelIndex, usedLabels, ids, productIds));
    const supportedIds = new Set(expectedCoverage.supportedCaseIds);
    for (const branchId of cases.flatMap((row) => row.policyBranchIds)) {
      if (!supportedIds.has(branchId)) throw new TypeError(`${category.category} unknown policy coverage case: ${branchId}`);
    }
    const blockingReasons = requiredArray(category.blockingReasons, `${category.category} blocking reasons`);
    if (blockingReasons.some((reason) => !BLOCKING_REASONS.has(reason))) {
      throw new TypeError(`${category.category} unknown blocking reason`);
    }
    if (category.eligible === true) {
      if (cases.length < manifest.minimumSourceBackedCasesPerEligibleCategory) {
        throw new TypeError(`${category.category} minimum 50 source-backed cases not met`);
      }
      const coveredBranches = new Set(cases.flatMap((row) => row.policyBranchIds));
      const missingBranch = expectedCoverage.supportedCaseIds.find((id) => !coveredBranches.has(id));
      if (missingBranch) throw new TypeError(`${category.category} branch coverage missing: ${missingBranch}`);
      const tags = new Set(cases.flatMap((row) => row.coverageTags));
      if (!tags.has('boundary') || !tags.has('adversarial')) {
        throw new TypeError(`${category.category} boundary and adversarial coverage required`);
      }
      if (blockingReasons.length) throw new TypeError(`${category.category} eligible category cannot remain blocked`);
    } else if (blockingReasons.length === 0) {
      throw new TypeError(`${category.category} ineligible category requires a blocking reason`);
    }
  }
  if (usedLabels.size !== labelIndex.size) throw new TypeError('unused or unbound calibration label registry entry');
  return manifest;
}

function rolesFor(file, source) {
  const roles = [];
  if (/range-filters|filters|search|fit-engine/.test(file) || /scoreMin|verifiedOnly/.test(source)) roles.push('filter');
  if (/sort|compare-table/.test(file) || /sortScore|compareFitScore|fit-score-desc/.test(source)) roles.push('sorter');
  if (/product-card/.test(file)) roles.push('product_card');
  if (/compare|generate-.+pages/.test(file)) roles.push('compare_or_generated_page');
  if (file.startsWith('src/domain/') || file.startsWith('src/adapters/')
    || file.startsWith('src/shared/') || file.startsWith('scripts/')) roles.push('writer_or_domain');
  if (file.startsWith('public/data/')) roles.push('public_data');
  if (!roles.length) roles.push('other');
  return [...new Set(roles)].sort();
}

function filesystemCandidates(repoRoot) {
  const files = [];
  const walk = (relativeRoot) => {
    const absoluteRoot = path.join(repoRoot, relativeRoot);
    if (!statSync(absoluteRoot, { throwIfNoEntry: false })?.isDirectory()) return;
    for (const name of readdirSync(absoluteRoot).sort()) {
      const relative = path.posix.join(relativeRoot, name);
      const absolute = path.join(repoRoot, relative);
      if (statSync(absolute).isDirectory()) walk(relative);
      else if (/\.(?:js|mjs|json)$/.test(relative) && !V4_IMPLEMENTATION_PATH.test(relative)) files.push(relative);
    }
  };
  LEGACY_SCAN_ROOTS.forEach(walk);
  return [...new Set(files)].sort();
}

export function inventoryLegacyFitConsumers(repoRoot) {
  const files = [];
  for (const file of filesystemCandidates(repoRoot)) {
    const source = readFileSync(path.join(repoRoot, file), 'utf8');
    const markers = MARKERS.filter(([, pattern]) => pattern.test(source)).map(([name]) => name);
    if (/(?:^|\/)fit-score(?:-ring)?\.js$/.test(file)) markers.push('fit-score-module');
    if (!markers.length) continue;
    files.push({ path: file, roles: rolesFor(file, source), markers, migrated: false });
  }
  const groups = {};
  for (const row of files) {
    for (const role of row.roles) (groups[role] ??= []).push(row.path);
  }
  return {
    uniqueFileCount: files.length,
    files,
    groups: Object.fromEntries(Object.entries(groups).sort().map(([role, paths]) => [role, paths.sort()])),
  };
}

function renderInventory(inventory) {
  const rows = [];
  for (const [role, paths] of Object.entries(inventory.groups)) {
    rows.push(`### ${role} (${paths.length})`, '', ...paths.map((file) => `- \`${file}\``), '');
  }
  return rows.join('\n').trimEnd();
}

export function buildFitV4CalibrationReport({ manifest, labelRegistry, repoRoot }) {
  const validated = validateFitV4CalibrationManifest(manifest, { labelRegistry });
  const inventory = inventoryLegacyFitConsumers(repoRoot);
  const categoryRows = validated.categories.map((row) => ({
    category: row.category,
    sourceBackedCaseCount: row.sourceBackedCaseCount,
    eligible: row.eligible,
    blockingReasons: [...row.blockingReasons],
  }));
  const summary = {
    status: categoryRows.some((row) => row.eligible)
      ? 'CALIBRATION_REQUIRES_OWNER_REVIEW'
      : 'TOTAL_DISABLED_INSUFFICIENT_SOURCE_BACKED_LABELS',
    totalEnabled: false,
    eligibleCategoryCount: categoryRows.filter((row) => row.eligible).length,
    sourceBackedCaseCount: categoryRows.reduce((sum, row) => sum + row.sourceBackedCaseCount, 0),
    legacyConsumerCount: inventory.uniqueFileCount,
  };
  const metrics = {
    falseAcceptance: 'NOT_MEASURABLE',
    falseRejection: 'NOT_MEASURABLE',
    pairwiseAgreement: 'NOT_MEASURABLE',
    kendallTau: 'NOT_MEASURABLE',
    legacyBaseline: 'NOT_MEASURABLE',
  };
  const calibratedWeights = {
    criticalReserve: 0,
    operationReserve: 0,
    inverseInstallationComplexity: 0,
    evidence: 0,
  };
  const categoryTable = categoryRows.map((row) => (
    `| ${row.category} | ${row.sourceBackedCaseCount} | ${row.eligible ? 'yes' : 'no'} | ${row.blockingReasons.join(', ')} |`
  )).join('\n');
  const markdown = `# Fit V4 Calibration and Legacy Consumer Inventory

## Decision

- Status: \`${summary.status}\`
- Fit V4 total enabled: **no**
- Source-backed frozen labels: **${summary.sourceBackedCaseCount}**
- Eligible categories: **${summary.eligibleCategoryCount}/4**
- Calibrated weights: **0 / 0 / 0 / 0**
- Outcome and ordering metrics: **NOT_MEASURABLE**

The 40/25/20/15 values in the rank contract are uncalibrated shadow metadata.
They are not multiplied into a total. No accuracy, false-acceptance,
false-rejection, pairwise-agreement or Kendall correlation claim is measurable
from the current source-backed label set.

## Calibration Gate

| Category | Source-backed cases | Eligible | Blocking reasons |
| --- | ---: | --- | --- |
${categoryTable}

Labels must come from independent source-backed review. The V4 evaluator and
ranker are prohibited label sources. Eligibility requires at least 50 cases,
all declared policy branches, boundary and adversarial cases, and the frozen
deterministic 30% holdout.

## Legacy Consumer Inventory

Unique matching files from the explicit legacy scan roots: **${inventory.uniqueFileCount}**.

${renderInventory(inventory)}

None of the legacy consumers are migrated by Task 10. Public cutover remains
blocked until Task 12, owner approval, source-backed calibration eligibility,
and a separate consumer migration with rollback evidence.
`;
  return { summary, metrics, calibratedWeights, categories: categoryRows, inventory, markdown };
}

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const fixturePath = path.join(repoRoot, 'tests/fixtures/architecture-v2/fit-v4-labelled-cases.json');
  const labelRegistryPath = path.join(repoRoot, 'tests/fixtures/architecture-v2/fit-v4-label-registry.json');
  const outputPath = path.join(repoRoot, 'docs/architecture-v2/fit-v4-calibration-report.md');
  const manifest = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const labelRegistry = JSON.parse(readFileSync(labelRegistryPath, 'utf8'));
  const report = buildFitV4CalibrationReport({ manifest, labelRegistry, repoRoot });
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, report.markdown, 'utf8');
  process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
