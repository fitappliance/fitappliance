import { createHash, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const STATIC_RIGHTS_ACTION = 'PUBLIC_STATIC_DISTRIBUTION';
export const STATIC_RIGHTS_CLASSIFIER_ID = 'fitappliance.static-rights-classifier/v1';
export const STATIC_RIGHTS_SCHEMA_ID = 'fitappliance.reviewed-static-source-manifest/v2';

const ROOT_STATIC_FILES = [
  'google32758d7798f4a670.html',
  'google5keGnUyvuq31_mxZ9pNVPIsh7BzKBbM7aHdxUTZZDJM.html',
  'index.html',
];
const LEGACY_SERVICE_WORKER_WITNESS = 'public/service-worker.js';
const GENERATED_FIRST_PARTY_PATHS = new Set([
  'public/data/evidence-index.json',
  'public/scripts/fit-engine.js',
]);
const EDITED_FIRST_PARTY_DATA_PATHS = new Set([
  'public/data/brands/metadata.json',
  'public/data/clearance.json',
  'public/data/rebates.json',
  'public/data/sources/direct-urls.json',
  'public/data/sources/manual-research.json',
]);
const HEX_64 = /^[0-9a-f]{64}$/;
const HEX_OID = /^[0-9a-f]{40,64}$/;
const SOURCE_CLASSES = new Set([
  'FIRST_PARTY',
  'FIRST_PARTY_CANDIDATE',
  'GENERATED_OG',
  'GENERATED_RETAIL_PRESENTATION',
  'GOOGLE_VERIFICATION_TOKEN',
  'OPEN_SOURCE_WEB_VITALS',
  'UNKNOWN',
]);

export class RightsContractError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'RightsContractError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) {
  throw new RightsContractError(code, message, details);
}

function byteSort(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function sortedUnique(values, code = 'DUPLICATE_ID') {
  const sorted = [...values].sort(byteSort);
  if (new Set(sorted).size !== sorted.length) fail(code, 'Canonical ID/path arrays cannot contain duplicates');
  return sorted;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort(byteSort);
}

function assertKeys(value, allowed, required = allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SCHEMA_INVALID', 'Expected a JSON object');
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) fail('SCHEMA_UNKNOWN_KEY', `Unknown schema keys: ${unknown.sort(byteSort).join(', ')}`);
  const missing = required.filter((key) => !Object.hasOwn(value, key));
  if (missing.length) fail('SCHEMA_INVALID', `Missing schema keys: ${missing.join(', ')}`);
}

function normalizeCanonical(value, sortedArrays, key = '') {
  if (typeof value === 'string') {
    if (value !== value.normalize('NFC')) fail('CANONICAL_JSON_INVALID', 'Strings must be NFC-normalized');
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) fail('CANONICAL_JSON_INVALID', 'JSON numbers must be safe integers');
    return value;
  }
  if (typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) {
    const normalized = value.map((item) => normalizeCanonical(item, sortedArrays));
    if (sortedArrays.has(key)) return sortedUnique(normalized.map((item) => canonicalJson(item).trim())).map((item) => JSON.parse(item));
    return normalized;
  }
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    fail('CANONICAL_JSON_INVALID', 'Only the strict JSON data model is supported');
  }
  return Object.fromEntries(Object.keys(value).sort(byteSort).map((childKey) => [
    childKey,
    normalizeCanonical(value[childKey], sortedArrays, childKey),
  ]));
}

export function canonicalJson(value, { sortedArrays = [] } = {}) {
  return `${JSON.stringify(normalizeCanonical(value, new Set(sortedArrays)), null, 2)}\n`;
}

export function semanticId(domain, schemaVersion, value, options = {}) {
  if (typeof domain !== 'string' || !domain || !Number.isSafeInteger(schemaVersion)) {
    fail('HASH_DOMAIN_INVALID', 'Semantic hashes require an explicit domain and integer schema version');
  }
  return createHash('sha256')
    .update(`${domain}\0${schemaVersion}\0`)
    .update(canonicalJson(value, options))
    .digest('hex');
}

function git(repoRoot, args) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { HOME: '', LANG: 'C', LC_ALL: 'C', TZ: 'UTC' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    fail('GIT_PROVENANCE_UNAVAILABLE', `Git command failed: git ${args.join(' ')}`, { stderr: String(error.stderr ?? '').trim() });
  }
}

function eligiblePath(relativePath) {
  return relativePath !== LEGACY_SERVICE_WORKER_WITNESS
    && (ROOT_STATIC_FILES.includes(relativePath) || relativePath.startsWith('public/') || relativePath.startsWith('pages/'));
}

function validatePath(relativePath) {
  if (typeof relativePath !== 'string' || relativePath !== relativePath.normalize('NFC') || !eligiblePath(relativePath)
    || relativePath.includes('\\') || relativePath.includes('\0') || path.posix.isAbsolute(relativePath)
    || relativePath.split('/').some((part) => !part || part === '.' || part === '..' || part.startsWith('.'))) {
    fail('STATIC_SOURCE_PATH_INVALID', `Invalid eligible static path: ${String(relativePath)}`);
  }
}

function validateEvidencePath(relativePath) {
  if (typeof relativePath !== 'string' || relativePath !== relativePath.normalize('NFC')
    || relativePath.includes('\\') || relativePath.includes('\0') || path.posix.isAbsolute(relativePath)
    || relativePath.split('/').some((part) => !part || part === '.' || part === '..')) {
    fail('PROVENANCE_SCHEMA_INVALID', `Invalid provenance path: ${String(relativePath)}`);
  }
}

function normalizedCollisionKey(relativePath) {
  return relativePath.normalize('NFKC').toLowerCase();
}

function trackedPathRows(repoRoot) {
  const output = git(repoRoot, ['ls-files', '-s', '--', ...ROOT_STATIC_FILES, 'public', 'pages']);
  if (!output) return [];
  return output.split('\n').map((line) => {
    const match = /^(\d{6}) ([0-9a-f]{40,64}) \d\t(.+)$/.exec(line);
    if (!match) fail('GIT_PROVENANCE_UNAVAILABLE', `Unexpected Git index row: ${line}`);
    return { mode: match[1], blobOid: match[2], path: match[3] };
  }).filter((row) => row.path !== LEGACY_SERVICE_WORKER_WITNESS)
    .sort((left, right) => byteSort(left.path, right.path));
}

function untrackedPaths(repoRoot) {
  const output = git(repoRoot, ['ls-files', '--others', '--exclude-standard', '--', ...ROOT_STATIC_FILES, 'public', 'pages']);
  return output ? output.split('\n').filter(Boolean).sort(byteSort) : [];
}

function workingMode(stat) {
  return (stat.mode & 0o111) === 0 ? '100644' : '100755';
}

function fileRow(repoRoot, indexRow) {
  validatePath(indexRow.path);
  const absolutePath = path.join(repoRoot, ...indexRow.path.split('/'));
  const stat = lstatSync(absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('STATIC_SOURCE_NOT_REGULAR', `Static source is not a regular file: ${indexRow.path}`);
  const bytes = readFileSync(absolutePath);
  return {
    blobOid: indexRow.blobOid,
    mode: workingMode(stat),
    path: indexRow.path,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.length,
  };
}

function inventoryPayload(rows) {
  return { schemaVersion: 1, rows: [...rows].sort((left, right) => byteSort(left.path, right.path)) };
}

export function buildStaticSourceInventory({ repoRoot }) {
  const untracked = untrackedPaths(repoRoot);
  if (untracked.length) fail('STATIC_SOURCE_SET_DRIFT', 'Untracked eligible static paths prevent inventory creation', { untracked });
  const dirty = git(repoRoot, [
    'status',
    '--porcelain=v1',
    '--untracked-files=no',
    '--',
    ...ROOT_STATIC_FILES,
    'public',
    'pages',
    `:(exclude)${LEGACY_SERVICE_WORKER_WITNESS}`,
  ]);
  if (dirty) fail('GIT_PROVENANCE_DRIFT', 'Tracked eligible static sources must match the Git index and HEAD');
  const rows = trackedPathRows(repoRoot).map((row) => fileRow(repoRoot, row));
  const payload = inventoryPayload(rows);
  return { ...payload, staticSourceInventoryId: semanticId('fitappliance.static-source-inventory', 1, payload, { sortedArrays: ['rows'] }) };
}

export function validateStaticSourceInventory({ repoRoot, inventory }) {
  assertKeys(inventory, ['rows', 'schemaVersion', 'staticSourceInventoryId']);
  if (inventory.schemaVersion !== 1 || !Array.isArray(inventory.rows) || !HEX_64.test(inventory.staticSourceInventoryId ?? '')) {
    fail('STATIC_SOURCE_INVENTORY_INVALID', 'Static source inventory schema is invalid');
  }
  const untracked = untrackedPaths(repoRoot);
  const tracked = trackedPathRows(repoRoot);
  const actualPaths = [...tracked.map((row) => row.path), ...untracked].sort(byteSort);
  const declaredPaths = inventory.rows.map((row) => row?.path).sort(byteSort);
  if (new Set(declaredPaths).size !== declaredPaths.length) fail('DUPLICATE_ID', 'Inventory paths must be unique');
  if (canonicalJson(actualPaths) !== canonicalJson(declaredPaths)) {
    fail('STATIC_SOURCE_SET_DRIFT', 'Eligible static path set differs from the frozen inventory', { untracked });
  }
  const actualRows = tracked.map((row) => fileRow(repoRoot, row));
  const expectedId = semanticId('fitappliance.static-source-inventory', 1, inventoryPayload(inventory.rows), { sortedArrays: ['rows'] });
  if (expectedId !== inventory.staticSourceInventoryId) fail('STATIC_SOURCE_INVENTORY_ID_INVALID', 'Static source inventory ID is invalid');
  if (canonicalJson(actualRows) !== canonicalJson([...inventory.rows].sort((left, right) => byteSort(left.path, right.path)))) {
    fail('STATIC_SOURCE_INVENTORY_DRIFT', 'Eligible static bytes, mode, size, hash, or blob changed');
  }
  return true;
}

function provenancePayload(receipt) {
  return {
    outputPath: receipt.outputPath,
    outputSha256: receipt.outputSha256,
    producer: receipt.producer,
    tools: receipt.tools,
    fonts: receipt.fonts,
    inputs: receipt.inputs,
    dependencyIds: receipt.dependencyIds,
  };
}

function provenanceId(payload) {
  return semanticId('fitappliance.static-generated-provenance-receipt', 1, payload, {
    sortedArrays: ['dependencyIds', 'fonts', 'inputs', 'tools'],
  });
}

export function buildGeneratedProvenanceReceipt({ outputPath, outputSha256, producer, tools = [], fonts = [], inputs = [], dependencyIds = [] }) {
  const payload = {
    outputPath,
    outputSha256,
    producer,
    tools: [...tools].sort((left, right) => byteSort(`${left.path}\0${left.sha256}`, `${right.path}\0${right.sha256}`)),
    fonts: [...fonts].sort((left, right) => byteSort(`${left.path}\0${left.sha256}`, `${right.path}\0${right.sha256}`)),
    inputs: [...inputs].sort((left, right) => byteSort(`${left.path}\0${left.sha256}`, `${right.path}\0${right.sha256}`)),
    dependencyIds: sortedUnique(dependencyIds),
  };
  const receipt = { ...payload, provenanceId: provenanceId(payload) };
  validateGeneratedProvenance({ schemaVersion: 1, receipts: [receipt] });
  return receipt;
}

function validateGeneratedProvenance(provenance) {
  assertKeys(provenance, ['receipts', 'schemaVersion', 'unresolvedOutputs'], ['receipts', 'schemaVersion']);
  if (provenance.schemaVersion !== 1 || !Array.isArray(provenance.receipts)) fail('PROVENANCE_SCHEMA_INVALID', 'Generated provenance schema is invalid');
  const seen = new Set();
  const seenOutputs = new Set();
  for (const receipt of provenance.receipts) {
    assertKeys(receipt, ['dependencyIds', 'fonts', 'inputs', 'outputPath', 'outputSha256', 'producer', 'provenanceId', 'tools']);
    if (seen.has(receipt.provenanceId)) fail('DUPLICATE_ID', `Duplicate provenance ID: ${receipt.provenanceId}`);
    seen.add(receipt.provenanceId);
    validatePath(receipt.outputPath);
    if (seenOutputs.has(receipt.outputPath)) fail('DUPLICATE_ID', `Duplicate provenance output: ${receipt.outputPath}`);
    seenOutputs.add(receipt.outputPath);
    assertKeys(receipt.producer, ['path', 'sha256']);
    validateEvidencePath(receipt.producer.path);
    if (!HEX_64.test(receipt.outputSha256 ?? '') || !HEX_64.test(receipt.producer.sha256 ?? '') || !Array.isArray(receipt.inputs)
      || !Array.isArray(receipt.fonts) || !Array.isArray(receipt.tools) || !Array.isArray(receipt.dependencyIds)) {
      fail('PROVENANCE_SCHEMA_INVALID', `Invalid provenance receipt: ${receipt.provenanceId}`);
    }
    sortedUnique(receipt.dependencyIds);
    for (const rows of [receipt.inputs, receipt.fonts, receipt.tools]) {
      sortedUnique(rows.map((input) => `${input.path}\0${input.sha256}`));
    }
    for (const input of [...receipt.inputs, ...receipt.fonts, ...receipt.tools]) {
      assertKeys(input, ['path', 'sha256']);
      validateEvidencePath(input.path);
      if (!HEX_64.test(input.sha256 ?? '')) fail('PROVENANCE_SCHEMA_INVALID', `Invalid provenance input: ${receipt.provenanceId}`);
    }
    if (receipt.provenanceId !== provenanceId(provenancePayload(receipt))) {
      fail('PROVENANCE_ID_INVALID', `Generated provenance ID is invalid: ${receipt.outputPath}`);
    }
  }
  const unresolved = new Set();
  for (const row of provenance.unresolvedOutputs ?? []) {
    assertKeys(row, ['outputPath', 'reason']);
    validatePath(row.outputPath);
    if (unresolved.has(row.outputPath) || seenOutputs.has(row.outputPath)) fail('DUPLICATE_ID', `Duplicate provenance output state: ${row.outputPath}`);
    unresolved.add(row.outputPath);
    if (row.reason !== 'GENERATED_PROVENANCE_NOT_REVIEWED') fail('PROVENANCE_SCHEMA_INVALID', `Invalid unresolved provenance reason: ${row.outputPath}`);
  }
  return provenance.receipts;
}

function readTrackedBinding(repoRoot, binding) {
  validateEvidencePath(binding.path);
  let current = repoRoot;
  for (const segment of binding.path.split('/')) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = lstatSync(current);
    } catch {
      fail('PROVENANCE_REPOSITORY_DRIFT', `Provenance binding is missing: ${binding.path}`);
    }
    if (stat.isSymbolicLink()) fail('PROVENANCE_REPOSITORY_DRIFT', `Provenance binding contains a symlink: ${binding.path}`);
  }
  const stat = lstatSync(current);
  if (!stat.isFile()) fail('PROVENANCE_REPOSITORY_DRIFT', `Provenance binding is not a regular file: ${binding.path}`);
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', binding.path], {
      cwd: repoRoot,
      env: { HOME: '', LANG: 'C', LC_ALL: 'C', TZ: 'UTC' },
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {
    fail('PROVENANCE_REPOSITORY_DRIFT', `Provenance binding is not Git tracked: ${binding.path}`);
  }
  if (git(repoRoot, ['status', '--porcelain=v1', '--untracked-files=no', '--', binding.path])) {
    fail('PROVENANCE_REPOSITORY_DRIFT', `Provenance binding has Git drift: ${binding.path}`);
  }
  const actualHash = createHash('sha256').update(readFileSync(current)).digest('hex');
  if (actualHash !== binding.sha256) fail('PROVENANCE_REPOSITORY_DRIFT', `Provenance binding bytes changed: ${binding.path}`);
}

export function validateGeneratedProvenanceRepositoryBindings({ repoRoot, inventory, generatedProvenance }) {
  const receipts = validateGeneratedProvenance(generatedProvenance);
  const inventoryByPath = new Map(inventory.rows.map((row) => [row.path, row]));
  const validatedBindings = new Set();
  for (const receipt of receipts) {
    const output = inventoryByPath.get(receipt.outputPath);
    if (!output || output.sha256 !== receipt.outputSha256) fail('PROVENANCE_OUTPUT_DRIFT', `Generated output bytes changed: ${receipt.outputPath}`);
    for (const binding of [receipt.producer, ...receipt.tools, ...receipt.fonts, ...receipt.inputs]) {
      const staticInput = inventoryByPath.get(binding.path);
      if (staticInput && staticInput.sha256 !== binding.sha256) fail('PROVENANCE_REPOSITORY_DRIFT', `Static provenance input changed: ${binding.path}`);
      const bindingKey = `${binding.path}\0${binding.sha256}`;
      if (!validatedBindings.has(bindingKey)) {
        readTrackedBinding(repoRoot, binding);
        validatedBindings.add(bindingKey);
      }
    }
  }
  return true;
}

function baseClassification(relativePath) {
  if (ROOT_STATIC_FILES.slice(0, 2).includes(relativePath)) return { sourceClass: 'GOOGLE_VERIFICATION_TOKEN', dependencyIds: ['GOOGLE_VERIFICATION'] };
  if (EDITED_FIRST_PARTY_DATA_PATHS.has(relativePath) || relativePath === 'public/data/evidence-index.json') {
    return { sourceClass: 'FIRST_PARTY_CANDIDATE', dependencyIds: ['FIRST_PARTY'] };
  }
  if (/^public\/data\/replacement-reference\/(?:dishwashers|dryers|fridges|meta|washing-machines)\.json$/.test(relativePath)) {
    return { sourceClass: 'GENERATED_RETAIL_PRESENTATION', dependencyIds: ['FIRST_PARTY'] };
  }
  if (relativePath === 'public/data/ui-copy.json') {
    return { sourceClass: 'GENERATED_RETAIL_PRESENTATION', dependencyIds: ['FIRST_PARTY'] };
  }
  if (/^(pages\/(products\.html|(?:products|brands|compare|location|fit-check|cavity|doorway|guides)\/)|public\/(fit-checker\.html|data\/))/.test(relativePath)
    || ['public/image-sitemap.xml', 'public/rss.xml', 'public/sitemap.xml'].includes(relativePath)) {
    return { sourceClass: 'GENERATED_RETAIL_PRESENTATION', dependencyIds: ['FIRST_PARTY', 'RETAILER_FEED'] };
  }
  if (/^public\/scripts\/vendor\/web-vitals(?:\.|\/)/.test(relativePath)) return { sourceClass: 'OPEN_SOURCE_WEB_VITALS', dependencyIds: ['WEB_VITALS_APACHE_2'] };
  if (/^public\/og-images\/.*\.(png|webp)$/.test(relativePath)) return { sourceClass: 'GENERATED_OG', dependencyIds: [] };
  if (/\.(html|css|js|mjs|json|xml|txt|webmanifest|svg|png|webp|jpg|jpeg|gif|ico|woff2?|ttf|map)$/i.test(relativePath)) {
    return { sourceClass: 'FIRST_PARTY_CANDIDATE', dependencyIds: ['FIRST_PARTY'] };
  }
  return { sourceClass: 'UNKNOWN', dependencyIds: [] };
}

function requiresGeneratedProvenance(relativePath, sourceClass = baseClassification(relativePath).sourceClass) {
  return ['GENERATED_RETAIL_PRESENTATION', 'GENERATED_OG'].includes(sourceClass)
    || GENERATED_FIRST_PARTY_PATHS.has(relativePath);
}

function isPrivateFeedSanitizerReceipt(receipt) {
  return ['public/data/appliances.json', 'public/data/catalog-projection.json'].includes(receipt.outputPath)
    && receipt.producer.path === 'scripts/architecture-v2/publish-active-retail-release.mjs'
    && receipt.tools.some((tool) => tool.path === 'src/domain/public-projection.mjs')
    && receipt.dependencyIds.includes('FIRST_PARTY')
    && !receipt.dependencyIds.includes('RETAILER_FEED');
}

export function buildGeneratedProvenance({ inventory, existingProvenance = { schemaVersion: 1, receipts: [] } }) {
  validateGeneratedProvenance(existingProvenance);
  const receiptOutputs = new Set(existingProvenance.receipts.map((row) => row.outputPath));
  const unresolvedOutputs = inventory.rows
    .filter((row) => requiresGeneratedProvenance(row.path))
    .filter((row) => !receiptOutputs.has(row.path))
    .map((row) => ({ outputPath: row.path, reason: 'GENERATED_PROVENANCE_NOT_REVIEWED' }))
    .sort((left, right) => byteSort(left.outputPath, right.outputPath));
  return { schemaVersion: 1, receipts: existingProvenance.receipts, unresolvedOutputs };
}

export function classifyStaticSources({ inventory, generatedProvenance }) {
  validateGeneratedProvenance(generatedProvenance);
  const inventoryByPath = new Map(inventory.rows.map((row) => [row.path, row]));
  const receiptByOutput = new Map(generatedProvenance.receipts.map((receipt) => [receipt.outputPath, receipt]));
  const resolvedByProvenanceId = new Map();
  const resolveReceiptDependencies = (receipt, stack = new Set()) => {
    if (stack.has(receipt.provenanceId)) fail('PROVENANCE_CYCLE', `Generated provenance cycle: ${receipt.provenanceId}`);
    if (resolvedByProvenanceId.has(receipt.provenanceId)) return resolvedByProvenanceId.get(receipt.provenanceId);
    const nextStack = new Set(stack).add(receipt.provenanceId);
    const dependencies = [...receipt.dependencyIds];
    const blockers = [];
    const generatedRetailParents = [];
    let privateFeedExcluded = isPrivateFeedSanitizerReceipt(receipt);
    for (const font of receipt.fonts) {
      if (font.path.toLowerCase().includes('outfit')) dependencies.push('OUTFIT_FONT');
    }
    for (const input of receipt.inputs) {
      const inventoryRow = inventoryByPath.get(input.path);
      if (!inventoryRow) continue;
      if (inventoryRow.sha256 !== input.sha256) fail('PROVENANCE_INPUT_DRIFT', `Generated input is changed: ${input.path}`);
      const parentReceipt = receiptByOutput.get(input.path);
      if (parentReceipt) {
        const parent = resolveReceiptDependencies(parentReceipt, nextStack);
        dependencies.push(...parent.dependencies);
        blockers.push(...parent.blockers);
        if (baseClassification(input.path).sourceClass === 'GENERATED_RETAIL_PRESENTATION') {
          generatedRetailParents.push(parent.privateFeedExcluded);
        }
      } else {
        const inputClass = baseClassification(input.path);
        dependencies.push(...inputClass.dependencyIds);
        if (requiresGeneratedProvenance(input.path, inputClass.sourceClass)) {
          blockers.push(`GENERATED_INPUT_PROVENANCE_MISSING:${input.path}`);
        }
      }
    }
    if (!privateFeedExcluded && generatedRetailParents.length > 0
      && generatedRetailParents.every(Boolean)
      && !receipt.dependencyIds.includes('RETAILER_FEED')) {
      privateFeedExcluded = true;
    }
    const resolved = {
      dependencies: uniqueSorted(dependencies),
      blockers: uniqueSorted(blockers),
      privateFeedExcluded,
    };
    resolvedByProvenanceId.set(receipt.provenanceId, resolved);
    return resolved;
  };
  const rows = inventory.rows.map((inventoryRow) => {
    const base = baseClassification(inventoryRow.path);
    const receipt = receiptByOutput.get(inventoryRow.path);
    const blockers = [];
    let dependencies = [...base.dependencyIds];
    const provenanceIds = [];
    if (requiresGeneratedProvenance(inventoryRow.path, base.sourceClass)) {
      if (!receipt) {
        blockers.push('GENERATED_PROVENANCE_MISSING');
        if (base.sourceClass === 'GENERATED_OG') dependencies.push('FIRST_PARTY', 'OUTFIT_FONT', 'RETAILER_FEED');
      }
      else {
        if (receipt.outputSha256 !== inventoryRow.sha256) fail('PROVENANCE_OUTPUT_DRIFT', `Generated output bytes changed: ${receipt.outputPath}`);
        provenanceIds.push(receipt.provenanceId);
        const inherited = resolveReceiptDependencies(receipt);
        if (base.sourceClass === 'GENERATED_RETAIL_PRESENTATION' && inherited.privateFeedExcluded) {
          dependencies = dependencies.filter((dependencyId) => dependencyId !== 'RETAILER_FEED');
        }
        dependencies.push(...inherited.dependencies);
        blockers.push(...inherited.blockers);
      }
    } else if (receipt) {
      provenanceIds.push(receipt.provenanceId);
      const inherited = resolveReceiptDependencies(receipt);
      dependencies.push(...inherited.dependencies);
      blockers.push(...inherited.blockers);
    }
    if (base.sourceClass === 'UNKNOWN') blockers.push('UNKNOWN_SOURCE_CLASS');
    if (dependencies.length === 0) blockers.push('MISSING_DEPENDENCY_CLASSIFICATION');
    return {
      path: inventoryRow.path,
      sourceClass: base.sourceClass,
      dependencyIds: uniqueSorted(dependencies),
      provenanceIds: sortedUnique(provenanceIds),
      blockers: sortedUnique(blockers),
    };
  }).sort((left, right) => byteSort(left.path, right.path));
  return { schemaVersion: 1, classifierId: STATIC_RIGHTS_CLASSIFIER_ID, rows };
}

export function buildDependencyScopeHash({ action, dependencyId, inventoryId, paths }) {
  if (action !== STATIC_RIGHTS_ACTION || typeof dependencyId !== 'string' || !dependencyId
    || !HEX_64.test(inventoryId ?? '') || !Array.isArray(paths) || paths.length === 0) {
    fail('DECISION_SCOPE_INVALID', 'Dependency scope requires an action, dependency, inventory and non-empty path set');
  }
  for (const relativePath of paths) validatePath(relativePath);
  const payload = {
    action,
    dependencyId,
    inventoryId,
    paths: sortedUnique(paths),
  };
  return semanticId('fitappliance.static-rights-dependency-scope', 1, payload, { sortedArrays: ['paths'] });
}

const AUTHORITY_KEYS = ['actions', 'issuerId', 'keyId', 'publicKey', 'roles'];

export function validateAuthoritySet({ authoritySet, trustRoot, testMode = false }) {
  assertKeys(authoritySet, ['authorities', 'environment', 'schemaVersion', 'trustRootEnrollment']);
  if (authoritySet.schemaVersion !== 1 || !['PRODUCTION', 'TEST'].includes(authoritySet.environment) || !Array.isArray(authoritySet.authorities)) {
    fail('AUTHORITY_SET_INVALID', 'Publication authority set schema is invalid');
  }
  if (authoritySet.environment === 'PRODUCTION' && !trustRoot) fail('PRODUCTION_TRUST_ROOT_NOT_ENROLLED', 'Production trust root is not enrolled');
  const issuers = new Set();
  for (const authority of authoritySet.authorities) {
    assertKeys(authority, AUTHORITY_KEYS);
    if (typeof authority.issuerId !== 'string' || !authority.issuerId || typeof authority.keyId !== 'string' || !authority.keyId
      || typeof authority.publicKey !== 'string' || !authority.publicKey || !Array.isArray(authority.actions) || !Array.isArray(authority.roles)) {
      fail('AUTHORITY_SET_INVALID', 'Publication authority fields are invalid');
    }
    sortedUnique(authority.actions);
    sortedUnique(authority.roles);
    if (issuers.has(authority.issuerId)) fail('DUPLICATE_ID', `Duplicate authority issuer: ${authority.issuerId}`);
    issuers.add(authority.issuerId);
    if (authority.issuerId.startsWith('TEST_') && (authoritySet.environment === 'PRODUCTION' || !testMode)) fail('TEST_ISSUER_FORBIDDEN', 'Test issuers cannot authorize production');
    if (!authority.actions.includes(STATIC_RIGHTS_ACTION) || !authority.roles.includes('RIGHTS_REVIEWER')) fail('AUTHORITY_SET_INVALID', `Authority lacks the required scope: ${authority.issuerId}`);
  }
  if (authoritySet.environment === 'PRODUCTION') {
    const enrollment = authoritySet.trustRootEnrollment;
    if (!enrollment || trustRoot.source !== 'INJECTED_READ_ONLY' || trustRoot.repositoryPath) {
      fail('REPOSITORY_SELF_ENROLLMENT_FORBIDDEN', 'Production authorities require an injected out-of-repository trust root');
    }
    assertKeys(enrollment, ['authoritySetHash', 'signature']);
    const payload = { schemaVersion: 1, environment: authoritySet.environment, authorities: authoritySet.authorities };
    const expectedHash = semanticId('fitappliance.static-publication-authority-set', 1, payload, { sortedArrays: ['authorities'] });
    let signatureValid = false;
    try {
      signatureValid = enrollment.authoritySetHash === expectedHash
        && verify(null, Buffer.from(canonicalJson({ authoritySetHash: expectedHash })), trustRoot.publicKey, Buffer.from(enrollment.signature, 'base64'));
    } catch {
      signatureValid = false;
    }
    if (!signatureValid) {
      fail('AUTHORITY_ENROLLMENT_INVALID', 'Detached authority-set enrollment is invalid');
    }
  }
  return authoritySet;
}

const DECISION_KEYS = [
  'action', 'attributionObligationIds', 'decisionAsOf', 'dependencyId', 'disposition', 'evidenceHashes', 'inventoryId',
  'issuerId', 'keyId', 'predecessorDecisionId', 'reviewBy', 'role', 'schemaVersion', 'scopeHash', 'sourceObjectHash',
  'supersedesDecisionId', 'validFrom', 'validThrough', 'withdrawalHeadHash',
];

function validateIso(value, name) {
  let normalized;
  try {
    normalized = typeof value === 'string' ? new Date(value).toISOString() : null;
  } catch {
    normalized = null;
  }
  if (normalized !== value) fail('DECISION_SCHEMA_INVALID', `${name} must be an exact ISO timestamp`);
  return Date.parse(value);
}

function withdrawalSigner(payload, authoritySet, label) {
  const authority = authoritySet.authorities?.find((row) => row.issuerId === payload.issuerId);
  if (!authority || authority.keyId !== payload.keyId
    || !authority.roles?.includes(payload.role)
    || !authority.actions?.includes(payload.action)) {
    fail('WITHDRAWAL_SIGNATURE_INVALID', `${label} signer is not enrolled`);
  }
  return authority;
}

function verifyWithdrawalEnvelope({ envelope, payload, id, authoritySet, label }) {
  const authority = withdrawalSigner(payload, authoritySet, label);
  let signatureValid = false;
  try {
    signatureValid = verify(
      null,
      Buffer.from(canonicalJson(payload)),
      authority.publicKey,
      Buffer.from(envelope.signature, 'base64'),
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) fail('WITHDRAWAL_SIGNATURE_INVALID', `${label} signature is invalid`);
  return id;
}

export function validateWithdrawalLog({ withdrawalLog, authoritySet }) {
  assertKeys(withdrawalLog, ['environment', 'events', 'heads', 'schemaVersion']);
  if (withdrawalLog.schemaVersion !== 1
    || !['PRODUCTION', 'TEST'].includes(withdrawalLog.environment)
    || withdrawalLog.environment !== authoritySet?.environment
    || !Array.isArray(withdrawalLog.events)
    || !Array.isArray(withdrawalLog.heads)
    || withdrawalLog.heads.length === 0
    || withdrawalLog.heads.length !== withdrawalLog.events.length + 1) {
    fail('WITHDRAWAL_CHAIN_INVALID', 'Withdrawal log shape or environment is invalid');
  }

  const eventIds = [];
  const eventTimes = [];
  for (const [index, envelope] of withdrawalLog.events.entries()) {
    assertKeys(envelope, ['eventId', 'payload', 'signature']);
    const payload = envelope.payload;
    assertKeys(payload, [
      'action', 'dependencyId', 'effectiveAt', 'environment', 'evidenceHashes', 'issuerId', 'keyId',
      'previousHeadHash', 'reasonCode', 'role', 'schemaVersion', 'withdrawnDecisionId',
    ]);
    if (payload.schemaVersion !== 1 || payload.environment !== withdrawalLog.environment
      || payload.action !== STATIC_RIGHTS_ACTION || payload.role !== 'RIGHTS_REVIEWER'
      || !/^[A-Z0-9_]+$/.test(payload.dependencyId ?? '')
      || !/^[A-Z0-9_]+$/.test(payload.reasonCode ?? '')
      || !HEX_64.test(payload.previousHeadHash ?? '')
      || !HEX_64.test(payload.withdrawnDecisionId ?? '')
      || !Array.isArray(payload.evidenceHashes) || payload.evidenceHashes.length === 0
      || payload.evidenceHashes.some((hash) => !HEX_64.test(hash))) {
      fail('WITHDRAWAL_EVENT_INVALID', `Withdrawal event ${index} is invalid`);
    }
    sortedUnique(payload.evidenceHashes);
    const eventId = semanticId('fitappliance.static-rights-withdrawal-event', 1, payload);
    if (envelope.eventId !== eventId) fail('WITHDRAWAL_EVENT_INVALID', `Withdrawal event ${index} identity is invalid`);
    verifyWithdrawalEnvelope({ envelope, payload, id: eventId, authoritySet, label: `Withdrawal event ${index}` });
    eventIds.push(eventId);
    eventTimes.push(validateIso(payload.effectiveAt, `events[${index}].effectiveAt`));
  }
  sortedUnique(eventIds);

  const headHashes = [];
  const headTimes = [];
  for (const [index, envelope] of withdrawalLog.heads.entries()) {
    assertKeys(envelope, ['payload', 'signature', 'withdrawalHeadHash']);
    const payload = envelope.payload;
    assertKeys(payload, [
      'action', 'environment', 'eventIds', 'issuedAt', 'issuerId', 'keyId', 'previousHeadHash',
      'role', 'schemaVersion', 'sequence',
    ]);
    const expectedPrevious = index === 0 ? null : headHashes[index - 1];
    const expectedEventIds = eventIds.slice(0, index);
    if (payload.schemaVersion !== 1 || payload.environment !== withdrawalLog.environment
      || payload.action !== STATIC_RIGHTS_ACTION || payload.role !== 'RIGHTS_REVIEWER'
      || !Number.isSafeInteger(payload.sequence) || payload.sequence !== index
      || payload.previousHeadHash !== expectedPrevious
      || !Array.isArray(payload.eventIds)
      || payload.eventIds.length !== expectedEventIds.length
      || payload.eventIds.some((eventId, eventIndex) => eventId !== expectedEventIds[eventIndex])) {
      fail('WITHDRAWAL_CHAIN_INVALID', `Withdrawal head ${index} does not extend the exact prior chain`);
    }
    const withdrawalHeadHash = semanticId('fitappliance.static-rights-withdrawal-head', 1, payload);
    if (envelope.withdrawalHeadHash !== withdrawalHeadHash) {
      fail('WITHDRAWAL_CHAIN_INVALID', `Withdrawal head ${index} identity is invalid`);
    }
    verifyWithdrawalEnvelope({ envelope, payload, id: withdrawalHeadHash, authoritySet, label: `Withdrawal head ${index}` });
    const issuedAt = validateIso(payload.issuedAt, `heads[${index}].issuedAt`);
    if (index > 0 && (withdrawalLog.events[index - 1].payload.previousHeadHash !== expectedPrevious
      || eventTimes[index - 1] < headTimes[index - 1]
      || issuedAt < eventTimes[index - 1])) {
      fail('WITHDRAWAL_CHAIN_INVALID', `Withdrawal event ${index - 1} is outside its signed head interval`);
    }
    headHashes.push(withdrawalHeadHash);
    headTimes.push(issuedAt);
  }

  return {
    withdrawalHeadHash: headHashes.at(-1),
    sequence: headHashes.length - 1,
    eventIds,
  };
}

export function buildAttributionRouteReceipt({
  inventoryId,
  configSha256,
  route,
  sourcePath,
  sourceSha256,
  targetPath,
}) {
  validatePath(sourcePath);
  validatePath(targetPath);
  if (!HEX_64.test(inventoryId ?? '') || !HEX_64.test(configSha256 ?? '') || !HEX_64.test(sourceSha256 ?? '')
    || typeof route !== 'string' || !route.startsWith('/')) {
    fail('ATTRIBUTION_UNMET', 'Attribution route receipt input is invalid');
  }
  const payload = {
    schemaVersion: 1,
    inventoryId,
    configSha256,
    route,
    sourcePath,
    sourceSha256,
    targetPath,
    terminal: 'STATIC_2XX',
  };
  return {
    payload,
    routeReceiptHash: semanticId('fitappliance.static-attribution-route-receipt', 1, payload),
  };
}

function validateAttributionRouteReceipt({ receipt, fulfillment, inventoryId, routeConfigSha256 }) {
  assertKeys(receipt, ['payload', 'routeReceiptHash']);
  assertKeys(receipt.payload, [
    'configSha256', 'inventoryId', 'route', 'schemaVersion', 'sourcePath', 'sourceSha256', 'targetPath', 'terminal',
  ]);
  const payload = receipt.payload;
  if (payload.schemaVersion !== 1 || payload.inventoryId !== inventoryId
    || !HEX_64.test(routeConfigSha256 ?? '') || payload.configSha256 !== routeConfigSha256
    || payload.route !== fulfillment.route
    || payload.sourcePath !== fulfillment.path || payload.targetPath !== fulfillment.path
    || payload.sourceSha256 !== fulfillment.sha256 || payload.terminal !== 'STATIC_2XX'
    || receipt.routeReceiptHash !== semanticId('fitappliance.static-attribution-route-receipt', 1, payload)) {
    fail('ATTRIBUTION_UNMET', `Attribution route receipt is invalid: ${fulfillment.obligationId}`);
  }
}

function validateFulfillments(fulfillments, { inventoryId, routeConfigSha256 }) {
  if (!Array.isArray(fulfillments)) fail('ATTRIBUTION_UNMET', 'Attribution fulfillments must be an array');
  if (fulfillments.length > 0 && !HEX_64.test(routeConfigSha256 ?? '')) {
    fail('ATTRIBUTION_UNMET', 'Attribution fulfillments must bind the active route configuration');
  }
  const byId = new Map();
  for (const row of fulfillments) {
    assertKeys(row, ['obligationId', 'path', 'route', 'routeReceipt', 'sha256']);
    if (byId.has(row.obligationId)) fail('DUPLICATE_ID', `Duplicate attribution fulfillment: ${row.obligationId}`);
    validatePath(row.path);
    if (!row.obligationId || typeof row.route !== 'string' || !row.route.startsWith('/')
      || !HEX_64.test(row.sha256 ?? '')) {
      fail('ATTRIBUTION_UNMET', `Attribution is not exactly fulfilled: ${row.obligationId}`);
    }
    validateAttributionRouteReceipt({
      receipt: row.routeReceipt,
      fulfillment: row,
      inventoryId,
      routeConfigSha256,
    });
    byId.set(row.obligationId, row);
  }
  return byId;
}

export function validateDecisionRegistryStructure({
  registry,
  inventoryId,
  decisionAsOf,
  withdrawalHeadHash,
  attributionFulfillments = [],
  routeConfigSha256,
  publicationRows,
  allowUnestablishedWithdrawal = false,
}) {
  assertKeys(
    registry,
    ['attributionFulfillments', 'decisionAsOf', 'decisions', 'schemaVersion', 'withdrawalHeadHash'],
    ['decisions', 'schemaVersion'],
  );
  if (registry.schemaVersion !== 1 || !Array.isArray(registry.decisions)) fail('DECISION_REGISTRY_INVALID', 'Decision registry schema is invalid');
  if (registry.decisionAsOf !== undefined && registry.decisionAsOf !== decisionAsOf) fail('DECISION_REGISTRY_INVALID', 'Registry decision clock does not match the requested frozen clock');
  if (registry.withdrawalHeadHash !== undefined && registry.withdrawalHeadHash !== withdrawalHeadHash) fail('DECISION_REGISTRY_INVALID', 'Registry withdrawal head does not match the requested head');
  if (!HEX_64.test(withdrawalHeadHash ?? '') || (!allowUnestablishedWithdrawal && /^0{64}$/.test(withdrawalHeadHash))) {
    fail('WITHDRAWAL_HEAD_NOT_ESTABLISHED', 'A non-placeholder withdrawal head is required');
  }
  const fulfillmentById = validateFulfillments(attributionFulfillments, { inventoryId, routeConfigSha256 });
  if (attributionFulfillments.length > 0 && !Array.isArray(publicationRows)) {
    fail('ATTRIBUTION_UNMET', 'Attribution fulfillment requires the exact publication rows');
  }
  const publicationByPath = Array.isArray(publicationRows) ? new Map(publicationRows.map((row) => [row.path, row])) : null;
  if (publicationByPath !== null) {
    for (const fulfillment of attributionFulfillments) {
      const published = publicationByPath.get(fulfillment.path);
      if (!published || published.sha256 !== fulfillment.sha256) fail('ATTRIBUTION_UNMET', `Attribution bytes are absent or stale: ${fulfillment.obligationId}`);
    }
  }
  const seenIds = new Set();
  const seenDependency = new Set();
  const clock = validateIso(decisionAsOf, 'decisionAsOf');
  for (const envelope of registry.decisions) {
    assertKeys(envelope, ['decisionId', 'payload', 'signature']);
    assertKeys(envelope.payload, DECISION_KEYS);
    const payload = envelope.payload;
    if (seenIds.has(envelope.decisionId)) fail('DUPLICATE_ID', `Duplicate decision ID: ${envelope.decisionId}`);
    seenIds.add(envelope.decisionId);
    const dependencyKey = `${payload.action}\0${payload.dependencyId}`;
    if (seenDependency.has(dependencyKey)) fail('DECISION_CONTRADICTORY', `Multiple active decisions for ${payload.dependencyId}`);
    seenDependency.add(dependencyKey);
    if (payload.schemaVersion !== 1 || payload.action !== STATIC_RIGHTS_ACTION || payload.disposition !== 'ALLOWED'
      || !payload.dependencyId || !payload.issuerId || !payload.keyId || !payload.role
      || !HEX_64.test(payload.sourceObjectHash ?? '') || !HEX_64.test(payload.scopeHash ?? '')
      || !Array.isArray(payload.evidenceHashes) || payload.evidenceHashes.length === 0 || payload.evidenceHashes.some((hash) => !HEX_64.test(hash))
      || !Array.isArray(payload.attributionObligationIds)) fail('DECISION_SCHEMA_INVALID', `Decision payload is invalid: ${envelope.decisionId}`);
    sortedUnique(payload.evidenceHashes);
    sortedUnique(payload.attributionObligationIds);
    for (const predecessor of [payload.predecessorDecisionId, payload.supersedesDecisionId]) {
      if (predecessor !== null && !HEX_64.test(predecessor ?? '')) fail('DECISION_SCHEMA_INVALID', `Decision predecessor is invalid: ${envelope.decisionId}`);
    }
    if (payload.inventoryId !== inventoryId) fail('DECISION_WRONG_INVENTORY', `Decision targets another inventory: ${envelope.decisionId}`);
    if (payload.withdrawalHeadHash !== withdrawalHeadHash) fail('DECISION_WITHDRAWN', `Decision withdrawal head is stale: ${envelope.decisionId}`);
    const from = validateIso(payload.validFrom, 'validFrom');
    const through = validateIso(payload.validThrough, 'validThrough');
    const reviewBy = validateIso(payload.reviewBy, 'reviewBy');
    validateIso(payload.decisionAsOf, 'payload.decisionAsOf');
    if (payload.decisionAsOf !== decisionAsOf) fail('DECISION_REGISTRY_INVALID', `Decision uses another frozen clock: ${envelope.decisionId}`);
    if (from > through || clock < from || clock > through || clock > reviewBy) fail('DECISION_EXPIRED', `Decision is not currently valid: ${envelope.decisionId}`);
    for (const obligationId of sortedUnique(payload.attributionObligationIds)) {
      if (!fulfillmentById.has(obligationId)) fail('ATTRIBUTION_UNMET', `Attribution obligation is unmet: ${obligationId}`);
    }
  }
  return { clock, fulfillmentById };
}

export function validateDecisionRegistry({
  registry,
  authoritySet,
  inventoryId,
  decisionAsOf,
  withdrawalHeadHash,
  attributionFulfillments = [],
  routeConfigSha256,
  publicationRows,
  trustRoot,
  testMode = false,
}) {
  validateDecisionRegistryStructure({
    registry,
    inventoryId,
    decisionAsOf,
    withdrawalHeadHash,
    attributionFulfillments,
    routeConfigSha256,
    publicationRows,
  });
  validateAuthoritySet({ authoritySet, trustRoot: testMode ? { source: 'TEST' } : trustRoot, testMode });
  const authorities = new Map(authoritySet.authorities.map((row) => [row.issuerId, row]));
  for (const envelope of registry.decisions) {
    const payload = envelope.payload;
    if (!testMode && payload.issuerId.startsWith('TEST_')) fail('TEST_ISSUER_FORBIDDEN', 'Test issuers cannot authorize production');
    const authority = authorities.get(payload.issuerId);
    if (!authority || authority.keyId !== payload.keyId || !authority.roles.includes(payload.role) || !authority.actions.includes(payload.action)) {
      fail('DECISION_ISSUER_UNBOUND', `Decision issuer is not authorized: ${payload.issuerId}`);
    }
    const expectedId = semanticId('fitappliance.static-rights-decision', 1, payload);
    let signatureValid = false;
    try {
      signatureValid = verify(null, Buffer.from(canonicalJson(payload)), authority.publicKey, Buffer.from(envelope.signature, 'base64'));
    } catch {
      signatureValid = false;
    }
    if (envelope.decisionId !== expectedId || !signatureValid) {
      fail('DECISION_SIGNATURE_INVALID', `Detached decision signature is invalid: ${envelope.decisionId}`);
    }
  }
  return { schemaVersion: 1, decisions: [...registry.decisions].sort((left, right) => byteSort(left.decisionId, right.decisionId)) };
}

function blocker(code, scope = 'ALL_ELIGIBLE_STATIC_SOURCES') {
  return { code, scope };
}

export function buildRightsReview({
  inventory,
  classifiedRows,
  verifiedDecisions = [],
  withdrawnProvenanceIds = [],
  decisionAsOf,
  withdrawalHeadHash,
  globalBlockers = [],
}) {
  if (!Array.isArray(classifiedRows)) fail('REVIEW_INVENTORY_MISMATCH', 'Rights review classification must be an array');
  const inventoryPaths = inventory.rows.map((row) => row.path).sort(byteSort);
  const classificationPaths = classifiedRows.map((row) => row?.path).sort(byteSort);
  if (new Set(classificationPaths).size !== classificationPaths.length
    || canonicalJson(inventoryPaths) !== canonicalJson(classificationPaths)) {
    fail('REVIEW_INVENTORY_MISMATCH', 'Classification must cover the exact inventory path set once');
  }
  const decisionsByDependency = new Map(verifiedDecisions.map((row) => [row.payload.dependencyId, row]));
  const pathsByDependency = new Map();
  for (const classification of classifiedRows) {
    for (const dependencyId of classification.dependencyIds) {
      const paths = pathsByDependency.get(dependencyId) ?? [];
      paths.push(classification.path);
      pathsByDependency.set(dependencyId, paths);
    }
  }
  const scopeByDependency = new Map([...pathsByDependency].map(([dependencyId, paths]) => [
    dependencyId,
    buildDependencyScopeHash({
      action: STATIC_RIGHTS_ACTION,
      dependencyId,
      inventoryId: inventory.staticSourceInventoryId,
      paths,
    }),
  ]));
  const withdrawn = new Set(withdrawnProvenanceIds);
  const inventoryByPath = new Map(inventory.rows.map((row) => [row.path, row]));
  const rows = classifiedRows.map((classification) => {
    if (!SOURCE_CLASSES.has(classification.sourceClass)) fail('UNKNOWN_SOURCE_CLASS', `Unknown static source class: ${classification.sourceClass}`);
    const inventoryRow = inventoryByPath.get(classification.path);
    if (!inventoryRow) fail('REVIEW_INVENTORY_MISMATCH', `Classification path is absent from inventory: ${classification.path}`);
    const blockers = [...classification.blockers];
    if (classification.sourceClass === 'UNKNOWN' && !blockers.includes('UNKNOWN_SOURCE_CLASS')) blockers.push('UNKNOWN_SOURCE_CLASS');
    if (classification.provenanceIds.some((id) => withdrawn.has(id))) blockers.push('WITHDRAWN_INPUT');
    const decisionIds = [];
    for (const dependencyId of classification.dependencyIds) {
      const decision = decisionsByDependency.get(dependencyId);
      if (!decision) blockers.push(`MISSING_DECISION:${dependencyId}`);
      else if (decision.payload.scopeHash !== scopeByDependency.get(dependencyId)) blockers.push(`DECISION_SCOPE_MISMATCH:${dependencyId}`);
      else decisionIds.push(decision.decisionId);
    }
    const rowPayload = {
      path: classification.path,
      sourceClass: classification.sourceClass,
      dependencyIds: sortedUnique(classification.dependencyIds),
      dependencyDecisionIds: sortedUnique(decisionIds),
      provenanceIds: sortedUnique(classification.provenanceIds),
      blockers: sortedUnique(blockers),
    };
    return { ...rowPayload, rightsReviewRowId: semanticId('fitappliance.static-rights-review-row', 1, rowPayload, { sortedArrays: ['blockers', 'dependencyDecisionIds', 'dependencyIds', 'provenanceIds'] }) };
  }).sort((left, right) => byteSort(left.path, right.path));
  if (rows.length !== inventory.rows.length) fail('REVIEW_INVENTORY_MISMATCH', 'Rights review does not cover the complete inventory');
  const blockers = [...globalBlockers.map((code) => blocker(code))];
  for (const row of rows) for (const code of row.blockers) blockers.push(blocker(code, row.path));
  const reviewPayload = {
    schemaVersion: 1,
    inventoryId: inventory.staticSourceInventoryId,
    classifierId: STATIC_RIGHTS_CLASSIFIER_ID,
    decisionAsOf,
    withdrawalHeadHash,
    status: blockers.length ? 'BLOCKED' : 'APPROVED',
    blockers: blockers.sort((left, right) => byteSort(`${left.code}\0${left.scope}`, `${right.code}\0${right.scope}`)),
    rows,
  };
  const rightsReviewId = semanticId('fitappliance.static-rights-review', 1, reviewPayload, { sortedArrays: ['blockers', 'rows'] });
  const sourceManifest = reviewPayload.status === 'APPROVED'
    ? {
        schemaVersion: 2,
        status: 'APPROVED',
        inventoryId: inventory.staticSourceInventoryId,
        rightsReviewId,
        limits: { maxFiles: 10000, maxFileBytes: 100000000, maxTotalBytes: 2000000000, maxPathBytes: 512 },
        rows: rows.map((reviewRow) => ({
          ...inventoryByPath.get(reviewRow.path),
          rightsReviewRowId: reviewRow.rightsReviewRowId,
          dependencyDecisionIds: reviewRow.dependencyDecisionIds,
        })),
      }
    : {
        schemaVersion: 2,
        status: 'BLOCKED',
        inventoryId: inventory.staticSourceInventoryId,
        rightsReviewId,
        blockers: reviewPayload.blockers,
        rows: [],
      };
  return { ...reviewPayload, rightsReviewId, sourceManifest };
}

function validateLimits(limits) {
  assertKeys(limits, ['maxFileBytes', 'maxFiles', 'maxPathBytes', 'maxTotalBytes']);
  if (Object.values(limits).some((value) => !Number.isSafeInteger(value) || value <= 0)) fail('MANIFEST_SCHEMA_INVALID', 'Manifest limits must be positive safe integers');
}

export function validateSchema2Manifest(manifest) {
  if (!manifest || manifest.schemaVersion !== 2 || !Array.isArray(manifest.rows)) fail('MANIFEST_SCHEMA_INVALID', 'Reviewed source manifest must use strict schema 2');
  if (manifest.status === 'BLOCKED') {
    assertKeys(manifest, ['blockers', 'inventoryId', 'rightsReviewId', 'rows', 'schemaVersion', 'status']);
    if (manifest.rows.length !== 0) fail('MANIFEST_SCHEMA_INVALID', 'Blocked source manifests must contain zero rows');
    fail('SOURCE_MANIFEST_BLOCKED', 'Reviewed source manifest is blocked', { blockers: manifest.blockers.map((row) => row.code) });
  }
  assertKeys(manifest, ['inventoryId', 'limits', 'rightsReviewId', 'rows', 'schemaVersion', 'status']);
  if (manifest.status !== 'APPROVED' || !HEX_64.test(manifest.inventoryId ?? '') || !HEX_64.test(manifest.rightsReviewId ?? '')) fail('MANIFEST_SCHEMA_INVALID', 'Approved source manifest identity is invalid');
  validateLimits(manifest.limits);
  const seenPaths = new Set();
  const seenCollisionKeys = new Map();
  let total = 0;
  for (const row of manifest.rows) {
    assertKeys(row, ['blobOid', 'dependencyDecisionIds', 'mode', 'path', 'rightsReviewRowId', 'sha256', 'size']);
    validatePath(row.path);
    if (seenPaths.has(row.path)) fail('DUPLICATE_ID', `Duplicate manifest path: ${row.path}`);
    seenPaths.add(row.path);
    const collisionKey = normalizedCollisionKey(row.path);
    if (seenCollisionKeys.has(collisionKey)) {
      fail('MANIFEST_PATH_COLLISION', `Manifest paths collide by case or Unicode normalization: ${seenCollisionKeys.get(collisionKey)} and ${row.path}`);
    }
    seenCollisionKeys.set(collisionKey, row.path);
    if (!['100644', '100755'].includes(row.mode) || !Number.isSafeInteger(row.size) || row.size < 0 || !HEX_64.test(row.sha256 ?? '')
      || !HEX_OID.test(row.blobOid ?? '') || !HEX_64.test(row.rightsReviewRowId ?? '') || !Array.isArray(row.dependencyDecisionIds) || row.dependencyDecisionIds.length === 0) {
      fail('MANIFEST_ROW_INVALID', `Schema-2 manifest row is invalid: ${row.path}`);
    }
    sortedUnique(row.dependencyDecisionIds);
    total += row.size;
    if (seenPaths.size > manifest.limits.maxFiles || row.size > manifest.limits.maxFileBytes || total > manifest.limits.maxTotalBytes || Buffer.byteLength(row.path) > manifest.limits.maxPathBytes) {
      fail('RESOURCE_LIMIT_EXCEEDED', `Manifest resource limit exceeded at ${row.path}`);
    }
  }
  return [...manifest.rows].sort((left, right) => byteSort(left.path, right.path));
}

export function buildStaticPublicationAuthorization({
  inventory,
  generatedProvenance,
  authoritySet,
  registry,
  review,
  manifest,
  attributionFulfillments,
  decisionAsOf,
  withdrawalHeadHash,
}) {
  const payload = {
    schemaVersion: 1,
    inventoryId: inventory.staticSourceInventoryId,
    provenanceId: semanticId('fitappliance.static-generated-provenance', 1, generatedProvenance, { sortedArrays: ['receipts', 'unresolvedOutputs'] }),
    authoritySetId: semanticId('fitappliance.static-publication-authority-set', 1, authoritySet, { sortedArrays: ['authorities'] }),
    decisionRegistryId: semanticId('fitappliance.static-rights-decision-registry', 1, registry, { sortedArrays: ['attributionFulfillments', 'decisions'] }),
    rightsReviewId: review.rightsReviewId,
    sourceManifestId: semanticId('fitappliance.reviewed-static-source-manifest', 2, manifest, { sortedArrays: ['rows'] }),
    attributionFulfillmentId: semanticId('fitappliance.static-attribution-fulfillment', 1, { fulfillments: attributionFulfillments }, { sortedArrays: ['fulfillments'] }),
    classifierId: STATIC_RIGHTS_CLASSIFIER_ID,
    manifestSchemaId: STATIC_RIGHTS_SCHEMA_ID,
    decisionAsOf,
    withdrawalHeadHash,
  };
  return { payload, staticPublicationAuthorizationId: semanticId('fitappliance.static-publication-authorization', 1, payload) };
}

export function verifyStaticPublicationGate({
  inventory,
  generatedProvenance,
  authoritySet,
  withdrawalLog,
  registry,
  review,
  manifest,
  authorization,
  attributionFulfillments,
  routeConfigSha256,
  currentDecisionAsOf,
  currentWithdrawalHeadHash,
}) {
  if (authoritySet.environment === 'PRODUCTION') {
    if (!withdrawalLog) fail('WITHDRAWAL_LOG_NOT_ESTABLISHED', 'Production static publication requires a signed withdrawal log');
    const signedHead = validateWithdrawalLog({ withdrawalLog, authoritySet }).withdrawalHeadHash;
    if (signedHead !== currentWithdrawalHeadHash) {
      fail('WITHDRAWAL_HEAD_MISMATCH', 'Production static publication does not bind the current signed withdrawal head');
    }
  }
  validateFulfillments(attributionFulfillments, {
    inventoryId: inventory.staticSourceInventoryId,
    routeConfigSha256,
  });
  const publicationByPath = new Map(inventory.rows.map((row) => [row.path, row]));
  for (const fulfillment of attributionFulfillments) {
    const published = publicationByPath.get(fulfillment.path);
    if (!published || published.sha256 !== fulfillment.sha256) {
      fail('ATTRIBUTION_UNMET', `Attribution bytes are absent or stale: ${fulfillment.obligationId}`);
    }
  }
  if (review.status !== 'APPROVED' || manifest.status !== 'APPROVED') fail('STATIC_RIGHTS_GATE_BLOCKED', 'Static rights review or source manifest is blocked');
  validateSchema2Manifest(manifest);
  if (manifest.inventoryId !== inventory.staticSourceInventoryId || manifest.rightsReviewId !== review.rightsReviewId) fail('STATIC_RIGHTS_GATE_BINDING_INVALID', 'Static rights gate inputs do not bind the same review');
  assertKeys(authorization, ['payload', 'staticPublicationAuthorizationId']);
  assertKeys(authorization.payload, [
    'attributionFulfillmentId', 'authoritySetId', 'classifierId', 'decisionAsOf', 'decisionRegistryId', 'inventoryId',
    'manifestSchemaId', 'provenanceId', 'rightsReviewId', 'schemaVersion', 'sourceManifestId', 'withdrawalHeadHash',
  ]);
  const expected = semanticId('fitappliance.static-publication-authorization', 1, authorization.payload);
  if (authorization.staticPublicationAuthorizationId !== expected) fail('STATIC_PUBLICATION_AUTHORIZATION_INVALID', 'Detached static publication authorization ID is invalid');
  const sourceManifestId = semanticId('fitappliance.reviewed-static-source-manifest', 2, manifest, { sortedArrays: ['rows'] });
  const provenanceId = semanticId('fitappliance.static-generated-provenance', 1, generatedProvenance, { sortedArrays: ['receipts', 'unresolvedOutputs'] });
  const authoritySetId = semanticId('fitappliance.static-publication-authority-set', 1, authoritySet, { sortedArrays: ['authorities'] });
  const decisionRegistryId = semanticId('fitappliance.static-rights-decision-registry', 1, registry, { sortedArrays: ['attributionFulfillments', 'decisions'] });
  const attributionFulfillmentId = semanticId('fitappliance.static-attribution-fulfillment', 1, { fulfillments: attributionFulfillments }, { sortedArrays: ['fulfillments'] });
  if (authorization.payload.inventoryId !== inventory.staticSourceInventoryId || authorization.payload.rightsReviewId !== review.rightsReviewId
    || authorization.payload.sourceManifestId !== sourceManifestId
    || authorization.payload.provenanceId !== provenanceId || authorization.payload.authoritySetId !== authoritySetId
    || authorization.payload.decisionRegistryId !== decisionRegistryId || authorization.payload.attributionFulfillmentId !== attributionFulfillmentId
    || authorization.payload.classifierId !== STATIC_RIGHTS_CLASSIFIER_ID || authorization.payload.manifestSchemaId !== STATIC_RIGHTS_SCHEMA_ID
    || authorization.payload.decisionAsOf !== currentDecisionAsOf || authorization.payload.withdrawalHeadHash !== currentWithdrawalHeadHash) {
    fail('STATIC_RIGHTS_GATE_BINDING_INVALID', 'Detached static publication authorization is stale or targets another input');
  }
  return true;
}
