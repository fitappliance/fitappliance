import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RightsContractError,
  buildGeneratedProvenance,
  buildGeneratedProvenanceReceipt,
  buildStaticSourceInventory,
  canonicalJson,
  validateGeneratedProvenanceRepositoryBindings,
} from '../../src/domain/static-publication-rights.mjs';

const PROVENANCE_PATH = 'deployment/static-generated-provenance.json';
const SPEC_KEYS = [
  'dependencyIds',
  'fontPaths',
  'id',
  'inputPaths',
  'outputPaths',
  'producerPath',
  'toolEntryPaths',
];

function fail(code, message, details) {
  throw new RightsContractError(code, message, details);
}

function byteSort(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function uniqueSorted(values) {
  return [...new Set(values)].sort(byteSort);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function validateRelativePath(relativePath, code) {
  if (typeof relativePath !== 'string' || !relativePath || relativePath !== relativePath.normalize('NFC')
    || relativePath.includes('\\') || relativePath.includes('\0') || path.posix.isAbsolute(relativePath)
    || relativePath.split('/').some((part) => !part || part === '.' || part === '..')) {
    fail(code, `Invalid repository-relative path: ${String(relativePath)}`);
  }
}

function containedFileBytes(root, relativePath, code) {
  validateRelativePath(relativePath, code);
  let current = root;
  for (const segment of relativePath.split('/')) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = lstatSync(current);
    } catch {
      fail(code, `Required file is missing: ${relativePath}`);
    }
    if (stat.isSymbolicLink()) fail(code, `File path contains a symlink: ${relativePath}`);
  }
  if (!lstatSync(current).isFile()) fail(code, `Path is not a regular file: ${relativePath}`);
  return readFileSync(current);
}

function validateReplayRoot(repoRoot, replayRoot) {
  if (!path.isAbsolute(replayRoot)) fail('REPLAY_ROOT_INVALID', 'Replay root must be absolute');
  let replayStat;
  try {
    replayStat = lstatSync(replayRoot);
  } catch {
    fail('REPLAY_ROOT_INVALID', 'Replay root does not exist');
  }
  if (replayStat.isSymbolicLink() || !replayStat.isDirectory()) {
    fail('REPLAY_ROOT_INVALID', 'Replay root must be a regular directory, not a symlink');
  }
  const realRepo = realpathSync(repoRoot);
  const realReplay = realpathSync(replayRoot);
  const relative = path.relative(realRepo, realReplay);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..')) {
    fail('REPLAY_ROOT_INVALID', 'Replay root must be outside the repository');
  }
  return realReplay;
}

function resolveLocalModule(repoRoot, fromPath, specifier) {
  const base = path.resolve(repoRoot, path.dirname(fromPath), specifier);
  const candidates = path.extname(base)
    ? [base]
    : [base, `${base}.js`, `${base}.mjs`, `${base}.cjs`, `${base}.json`, path.join(base, 'index.js'), path.join(base, 'index.mjs')];
  const realRepo = realpathSync(repoRoot);
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const stat = lstatSync(candidate);
    if (stat.isSymbolicLink() || !stat.isFile()) continue;
    const relativePath = path.relative(realRepo, realpathSync(candidate)).split(path.sep).join('/');
    if (!relativePath || relativePath.startsWith('../')) break;
    return relativePath;
  }
  fail('PROVENANCE_TOOL_UNRESOLVED', `Cannot resolve local module ${specifier} from ${fromPath}`);
}

function localSpecifiers(source) {
  const values = [];
  const patterns = [
    /\brequire\s*\(\s*(['"])(\.[^'"]+)\1\s*\)/g,
    /\bimport\s*\(\s*(['"])(\.[^'"]+)\1\s*\)/g,
    /\b(?:import|export)\s+(?:[^'"]*?\s+from\s+)?(['"])(\.[^'"]+)\1/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) values.push(match[2]);
  }
  return uniqueSorted(values);
}

export function collectLocalModuleClosure({ repoRoot, entryPaths }) {
  if (!Array.isArray(entryPaths) || entryPaths.length === 0) {
    fail('PROVENANCE_SPEC_INVALID', 'At least one tool entry path is required');
  }
  const pending = uniqueSorted(entryPaths);
  const visited = new Set();
  while (pending.length > 0) {
    const relativePath = pending.shift();
    if (visited.has(relativePath)) continue;
    const bytes = containedFileBytes(repoRoot, relativePath, 'PROVENANCE_TOOL_UNRESOLVED');
    visited.add(relativePath);
    if (!/\.(?:c?js|mjs)$/.test(relativePath)) continue;
    for (const specifier of localSpecifiers(bytes.toString('utf8'))) {
      const dependency = resolveLocalModule(repoRoot, relativePath, specifier);
      if (!visited.has(dependency)) pending.push(dependency);
    }
    pending.sort(byteSort);
  }
  return [...visited].sort(byteSort);
}

function binding(repoRoot, replayRoot, relativePath) {
  const bytes = containedFileBytes(repoRoot, relativePath, 'PROVENANCE_REPOSITORY_DRIFT');
  const digest = sha256(bytes);
  const replayBytes = containedFileBytes(replayRoot, relativePath, 'REPLAY_INPUT_DRIFT');
  if (sha256(replayBytes) !== digest) fail('REPLAY_INPUT_DRIFT', `Replay input differs from repository bytes: ${relativePath}`);
  return { path: relativePath, sha256: digest };
}

function validateSpec(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) fail('PROVENANCE_SPEC_INVALID', 'Replay spec must be an object');
  const keys = Object.keys(spec).sort(byteSort);
  if (canonicalJson(keys) !== canonicalJson([...SPEC_KEYS].sort(byteSort))) {
    fail('PROVENANCE_SPEC_INVALID', `Replay spec has an invalid key set: ${String(spec.id ?? '')}`);
  }
  if (typeof spec.id !== 'string' || !spec.id || typeof spec.producerPath !== 'string'
    || !Array.isArray(spec.outputPaths) || spec.outputPaths.length === 0
    || !Array.isArray(spec.toolEntryPaths) || !Array.isArray(spec.inputPaths)
    || !Array.isArray(spec.fontPaths) || !Array.isArray(spec.dependencyIds)) {
    fail('PROVENANCE_SPEC_INVALID', `Replay spec is incomplete: ${String(spec.id ?? '')}`);
  }
}

export function buildReceiptsForSpecs({ repoRoot, replayRoot, inventory, specs, existingProvenance }) {
  const checkedReplayRoot = validateReplayRoot(repoRoot, replayRoot);
  if (!Array.isArray(specs) || specs.length === 0) fail('PROVENANCE_SPEC_INVALID', 'Replay specs are required');
  const inventoryByPath = new Map(inventory.rows.map((row) => [row.path, row]));
  const targetPaths = new Set();
  const replacementReceipts = [];

  for (const spec of specs) {
    validateSpec(spec);
    const outputPaths = uniqueSorted(spec.outputPaths);
    if (outputPaths.length !== spec.outputPaths.length) fail('REPLAY_SPEC_DUPLICATE_OUTPUT', `Spec repeats an output: ${spec.id}`);
    for (const outputPath of outputPaths) {
      if (targetPaths.has(outputPath)) fail('REPLAY_SPEC_DUPLICATE_OUTPUT', `Multiple specs claim the same output: ${outputPath}`);
      targetPaths.add(outputPath);
    }

    const closure = collectLocalModuleClosure({
      repoRoot,
      entryPaths: [spec.producerPath, ...spec.toolEntryPaths],
    });
    const producer = binding(repoRoot, checkedReplayRoot, spec.producerPath);
    const tools = closure
      .filter((relativePath) => relativePath !== spec.producerPath)
      .map((relativePath) => binding(repoRoot, checkedReplayRoot, relativePath));
    const inputs = uniqueSorted(spec.inputPaths).map((relativePath) => binding(repoRoot, checkedReplayRoot, relativePath));
    const fonts = uniqueSorted(spec.fontPaths).map((relativePath) => binding(repoRoot, checkedReplayRoot, relativePath));

    for (const outputPath of outputPaths) {
      const inventoryRow = inventoryByPath.get(outputPath);
      if (!inventoryRow) fail('REPLAY_OUTPUT_NOT_IN_INVENTORY', `Replay output is absent from the static inventory: ${outputPath}`);
      const replayBytes = containedFileBytes(checkedReplayRoot, outputPath, 'REPLAY_OUTPUT_DRIFT');
      if (sha256(replayBytes) !== inventoryRow.sha256) fail('REPLAY_OUTPUT_DRIFT', `Replay output differs from the reviewed source: ${outputPath}`);
      replacementReceipts.push(buildGeneratedProvenanceReceipt({
        outputPath,
        outputSha256: inventoryRow.sha256,
        producer,
        tools,
        fonts,
        inputs,
        dependencyIds: spec.dependencyIds,
      }));
    }
  }

  const preserved = (existingProvenance?.receipts ?? []).filter((receipt) => !targetPaths.has(receipt.outputPath));
  const receipts = [...preserved, ...replacementReceipts]
    .sort((left, right) => byteSort(left.outputPath, right.outputPath));
  const generatedProvenance = buildGeneratedProvenance({
    inventory,
    existingProvenance: { schemaVersion: 1, receipts },
  });
  validateGeneratedProvenanceRepositoryBindings({ repoRoot, inventory, generatedProvenance });
  return {
    generatedProvenance,
    receiptsAdded: replacementReceipts.length,
    receiptsPreserved: preserved.length,
    unresolvedOutputs: generatedProvenance.unresolvedOutputs.length,
  };
}

function outputsUnder(inventory, prefix) {
  return inventory.rows.filter((row) => row.path.startsWith(prefix)).map((row) => row.path);
}

export function buildProductionReplaySpecs({ repoRoot, inventory }) {
  const descriptorPath = 'data/architecture-v2/decisions/active-retail-release.json';
  const descriptor = JSON.parse(readFileSync(path.join(repoRoot, descriptorPath), 'utf8'));
  const releaseInputs = [
    descriptorPath,
    descriptor.artifacts?.publicProjection?.path,
    descriptor.artifacts?.historicalReference?.path,
    descriptor.artifacts?.authorizationManifest?.path,
  ];
  if (releaseInputs.some((value) => typeof value !== 'string')) {
    fail('PROVENANCE_SPEC_INVALID', 'Active retail release descriptor is incomplete');
  }
  const commonCopy = ['data/copy/review-disclaimer.json'];
  const commonVideos = [
    'data/videos/creator-whitelist.json',
    'data/videos/review-pilot-slugs.json',
    'data/videos/review-videos.json',
  ];
  const pageSpec = (id, prefix, producerPath, inputPaths, toolEntryPaths = []) => ({
    id,
    outputPaths: outputsUnder(inventory, prefix),
    producerPath,
    toolEntryPaths,
    inputPaths,
    fontPaths: [],
    dependencyIds: ['FIRST_PARTY', 'RETAILER_FEED'],
  });

  return [
    {
      id: 'active-catalog-projection',
      outputPaths: ['public/data/appliances.json', 'public/data/catalog-projection.json'],
      producerPath: 'scripts/architecture-v2/publish-active-retail-release.mjs',
      toolEntryPaths: [],
      inputPaths: releaseInputs,
      fontPaths: [],
      dependencyIds: ['FIRST_PARTY', 'RETAILER_FEED'],
    },
    {
      id: 'split-catalog',
      outputPaths: [
        'public/data/appliances-meta.json',
        'public/data/dishwashers.json',
        'public/data/dryers.json',
        'public/data/fridges.json',
        'public/data/washing-machines.json',
      ],
      producerPath: 'scripts/split-appliances.js',
      toolEntryPaths: [],
      inputPaths: ['public/data/appliances.json'],
      fontPaths: [],
      dependencyIds: ['FIRST_PARTY'],
    },
    {
      id: 'historical-replacement-reference',
      outputPaths: [
        'public/data/replacement-reference/dishwashers.json',
        'public/data/replacement-reference/dryers.json',
        'public/data/replacement-reference/fridges.json',
        'public/data/replacement-reference/meta.json',
        'public/data/replacement-reference/washing-machines.json',
      ],
      producerPath: 'scripts/architecture-v2/publish-active-retail-release.mjs',
      toolEntryPaths: [],
      inputPaths: [...releaseInputs, 'data/architecture-v2/generated/official-registry-snapshots.json'],
      fontPaths: [],
      dependencyIds: ['ENERGY_RATING_CC_BY', 'FIRST_PARTY'],
    },
    {
      id: 'ui-copy',
      outputPaths: ['public/data/ui-copy.json'],
      producerPath: 'scripts/generate-ui-copy.js',
      toolEntryPaths: [],
      inputPaths: ['data/copy/footer.json', 'data/copy/hero.json'],
      fontPaths: [],
      dependencyIds: ['FIRST_PARTY'],
    },
    {
      ...pageSpec('product-pages', 'pages/products/', 'scripts/generate-product-pages.js', ['public/data/appliances.json']),
      outputPaths: [...outputsUnder(inventory, 'pages/products/'), 'pages/products.html'],
    },
    pageSpec('doorway-pages', 'pages/doorway/', 'scripts/generate-doorway-pages.js', ['public/data/appliances.json']),
    pageSpec(
      'guide-pages',
      'pages/guides/',
      'scripts/generate-guides.js',
      [
        'pages/brands/index.json',
        'pages/cavity/index.json',
        'pages/compare/index.json',
        'pages/doorway/index.json',
      ],
    ),
    {
      id: 'vendored-fit-engine',
      outputPaths: ['public/scripts/fit-engine.js'],
      producerPath: 'scripts/vendor-fit-engine.js',
      toolEntryPaths: [],
      inputPaths: ['src/shared/fit-engine.js'],
      fontPaths: [],
      dependencyIds: ['FIRST_PARTY'],
    },
    pageSpec(
      'comparison-pages',
      'pages/compare/',
      'scripts/generate-compare-vs-pages.js',
      ['data/affiliates/providers.json', 'public/data/appliances.json', 'public/data/clearance.json'],
      ['scripts/generate-comparisons.js', 'public/scripts/ui/compare-table.js'],
    ),
    pageSpec(
      'brand-pages',
      'pages/brands/',
      'scripts/inject-video-schema.js',
      [
        'data/affiliates/providers.json',
        'data/copy/brand-intro.json',
        'data/copy/install-tips.json',
        ...commonCopy,
        ...commonVideos,
        'data/videos/brand-videos.json',
        'pages/compare/index.json',
        'public/data/appliances.json',
        'public/data/brands/metadata.json',
        'public/data/clearance.json',
      ],
      ['scripts/generate-brand-pages.js'],
    ),
    pageSpec(
      'cavity-pages',
      'pages/cavity/',
      'scripts/generate-cavity-pages.js',
      [
        'data/copy/cavity-intro.json',
        'data/copy/measurement-steps.json',
        ...commonCopy,
        ...commonVideos,
        'pages/compare/index.json',
        'public/data/appliances.json',
        'public/data/clearance.json',
      ],
    ),
    pageSpec(
      'location-pages',
      'pages/location/',
      'scripts/generate-location-pages.js',
      [
        'data/affiliates/providers.json',
        'data/locations/au-cities.json',
        'pages/brands/index.json',
        'pages/cavity/index.json',
        'pages/compare/index.json',
        'pages/doorway/index.json',
        'pages/guides/index.json',
        'public/data/appliances.json',
      ],
    ),
  ];
}

function readExistingProvenance(repoRoot) {
  const absolutePath = path.join(repoRoot, PROVENANCE_PATH);
  return existsSync(absolutePath)
    ? JSON.parse(readFileSync(absolutePath, 'utf8'))
    : { schemaVersion: 1, receipts: [] };
}

function writeCanonicalAtomically(absolutePath, value) {
  const bytes = canonicalJson(value);
  const temporaryPath = `${absolutePath}.${process.pid}.tmp`;
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  try {
    writeFileSync(temporaryPath, bytes, { mode: 0o600 });
    if (sha256(readFileSync(temporaryPath)) !== sha256(bytes)) {
      fail('PROVENANCE_WRITE_DRIFT', 'Temporary provenance bytes changed before activation');
    }
    renameSync(temporaryPath, absolutePath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const replayArg = args[0];
  if (args.length !== 1 || !replayArg.startsWith('--replay-root=')) {
    fail('REPLAY_ROOT_INVALID', 'Usage: build-replayed-static-provenance.mjs --replay-root=/absolute/path');
  }
  const repoRoot = process.cwd();
  const replayRoot = replayArg.slice('--replay-root='.length);
  const inventory = buildStaticSourceInventory({ repoRoot });
  const specs = buildProductionReplaySpecs({ repoRoot, inventory });
  const result = buildReceiptsForSpecs({
    repoRoot,
    replayRoot,
    inventory,
    specs,
    existingProvenance: readExistingProvenance(repoRoot),
  });
  const outputPath = path.join(repoRoot, PROVENANCE_PATH);
  writeCanonicalAtomically(outputPath, result.generatedProvenance);
  process.stdout.write(canonicalJson({
    status: 'REPLAY_PROVENANCE_RECORDED',
    receiptsAdded: result.receiptsAdded,
    receiptsPreserved: result.receiptsPreserved,
    unresolvedOutputs: result.unresolvedOutputs,
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = error instanceof RightsContractError ? error.code : 'REPLAY_PROVENANCE_FAILED';
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
