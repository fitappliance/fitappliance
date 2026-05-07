'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const EVIDENCE_ROOT_ENV = 'EVIDENCE_ROOT_DIR';
const REQUIRED_DIRS = [];
const SUPPORTED_EVIDENCE_TYPES = new Set([
  'manufacturer_manual',
  'installation_manual',
  'spec_sheet',
  'energy_label',
  'retailer_product_page',
]);
const SUPPORTED_STATUSES = new Set(['candidate', 'extracted', 'approved', 'rejected']);

function parseDotEnvLine(line) {
  const match = String(line).match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (!match) return null;
  const [, key, rawValue] = match;
  const value = rawValue
    .replace(/^(['"])(.*)\1$/, '$2')
    .replace(/\\n/g, '\n');
  return [key, value];
}

function readLocalEnv(repoRoot = REPO_ROOT) {
  const filePath = path.join(repoRoot, '.env.local');
  if (!fs.existsSync(filePath)) return {};
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .reduce((acc, line) => {
      const parsed = parseDotEnvLine(line);
      if (parsed) acc[parsed[0]] = parsed[1];
      return acc;
    }, {});
}

function getEvidenceRoot(env = process.env, { repoRoot = REPO_ROOT } = {}) {
  const localEnv = readLocalEnv(repoRoot);
  return String(
    env[EVIDENCE_ROOT_ENV]
    || localEnv[EVIDENCE_ROOT_ENV]
    || ''
  ).trim();
}

function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

function shortHash(value) {
  return crypto.createHash('sha1').update(String(value ?? '')).digest('hex').slice(0, 8);
}

function inferExtension({ sourceUrl = '', localPath = '', fallback = 'pdf' } = {}) {
  const candidate = localPath || sourceUrl;
  const clean = String(candidate).split(/[?#]/)[0];
  const ext = path.extname(clean).replace(/^\./, '').toLowerCase();
  if (/^[a-z0-9]{1,8}$/.test(ext)) return ext;
  return fallback;
}

function buildEvidenceRelativePath({
  brand,
  model,
  type = 'manufacturer_manual',
  sourceUrl = '',
  localPath = '',
} = {}) {
  const extension = inferExtension({ sourceUrl, localPath, fallback: type === 'retailer_product_page' ? 'json' : 'pdf' });
  const hash = shortHash(`${type}:${sourceUrl || localPath}:${brand}:${model}`);
  return [
    slugify(brand),
    `${slugify(model)}-${hash}.${extension}`,
  ].join('/');
}

function isValidUrl(value) {
  try {
    const parsed = new URL(String(value ?? ''));
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateEvidenceEntry(entry, productSlug) {
  const issues = [];
  if (!SUPPORTED_EVIDENCE_TYPES.has(entry?.type)) {
    issues.push(`${productSlug}: unsupported evidence type ${entry?.type ?? '<missing>'}`);
  }
  if (!SUPPORTED_STATUSES.has(entry?.status)) {
    issues.push(`${productSlug}: unsupported evidence status ${entry?.status ?? '<missing>'}`);
  }
  if (!isValidUrl(entry?.source_url)) {
    issues.push(`${productSlug}: source_url must be http(s)`);
  }
  if (entry?.local_path && path.isAbsolute(String(entry.local_path))) {
    issues.push(`${productSlug}: local_path must be relative to the evidence root`);
  }
  if (entry?.sha256 && !/^[a-f0-9]{64}$/i.test(String(entry.sha256))) {
    issues.push(`${productSlug}: sha256 must be a 64-char hex digest`);
  }
  return issues;
}

function validateManualEvidenceDocument(document) {
  const issues = [];
  if (document?.schema_version !== 1) issues.push('schema_version must be 1');
  if (document?.storage?.root_env !== EVIDENCE_ROOT_ENV) issues.push(`storage.root_env must be ${EVIDENCE_ROOT_ENV}`);
  if (!String(document?.storage?.path_rule || '').toLowerCase().includes('relative')) {
    issues.push('storage.path_rule must describe relative local_path resolution');
  }
  if (!document?.products || typeof document.products !== 'object' || Array.isArray(document.products)) {
    issues.push('products must be an object map');
    return issues;
  }

  for (const [slug, product] of Object.entries(document.products)) {
    if (!Array.isArray(product?.evidence)) {
      issues.push(`${slug}: evidence must be an array`);
      continue;
    }
    for (const entry of product.evidence) {
      issues.push(...validateEvidenceEntry(entry, slug));
    }
  }

  return issues;
}

function addEvidenceCandidate(manifest, {
  slug,
  category,
  brand,
  model,
  type = 'manufacturer_manual',
  sourceUrl,
  localPath = '',
  verifiedAt,
  status = 'candidate',
  notes = '',
} = {}) {
  const productSlug = slugify(slug);
  if (!productSlug || productSlug === 'unknown') throw new Error('slug is required');
  if (!SUPPORTED_EVIDENCE_TYPES.has(type)) throw new Error(`unsupported evidence type: ${type}`);
  if (!SUPPORTED_STATUSES.has(status)) throw new Error(`unsupported evidence status: ${status}`);
  if (!isValidUrl(sourceUrl)) throw new Error('sourceUrl must be http(s)');

  const next = cloneJson(manifest);
  next.products = next.products ?? {};
  const previous = next.products[productSlug] ?? {};
  const evidence = Array.isArray(previous.evidence) ? previous.evidence.slice() : [];
  const resolvedLocalPath = localPath
    ? String(localPath).replace(/\\/g, '/')
    : buildEvidenceRelativePath({ category, brand, model, type, sourceUrl });
  const entry = {
    type,
    status,
    source_url: sourceUrl,
    local_path: resolvedLocalPath,
    verified_at: verifiedAt,
    sha256: localPath && fs.existsSync(localPath) ? sha256File(localPath) : null,
    notes,
  };

  next.products[productSlug] = {
    category: String(category ?? previous.category ?? '').trim(),
    brand: String(brand ?? previous.brand ?? '').trim(),
    model: String(model ?? previous.model ?? '').trim(),
    evidence: evidence.concat(entry),
  };

  return next;
}

function parseRootArg(args) {
  const index = args.indexOf('--root');
  if (index >= 0) return args[index + 1];
  return getEvidenceRoot();
}

function initEvidenceRoot(root) {
  if (!String(root || '').trim()) {
    throw new Error(`${EVIDENCE_ROOT_ENV} is required or pass --root PATH`);
  }
  fs.mkdirSync(root, { recursive: true });
  for (const dir of REQUIRED_DIRS) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
}

function checkEvidenceRoot(root) {
  if (!String(root || '').trim()) {
    throw new Error(`${EVIDENCE_ROOT_ENV} is required or pass --root PATH`);
  }
  const stat = fs.statSync(root);
  if (!stat.isDirectory()) throw new Error(`${root} is not a directory`);
  fs.accessSync(root, fs.constants.R_OK | fs.constants.W_OK);
  for (const dir of REQUIRED_DIRS) {
    const child = path.join(root, dir);
    if (!fs.existsSync(child) || !fs.statSync(child).isDirectory()) {
      throw new Error(`missing required evidence directory: ${child}`);
    }
  }
  return true;
}

function runCli(args = process.argv.slice(2)) {
  const command = args[0] ?? 'help';
  const root = parseRootArg(args);
  try {
    if (command === 'init-root') {
      initEvidenceRoot(root);
      console.log(`manual evidence root initialized: ${root}`);
      return 0;
    }
    if (command === 'check-root') {
      checkEvidenceRoot(root);
      console.log(`manual evidence root ok: ${root}`);
      return 0;
    }
    if (command === 'help' || command === '--help' || command === '-h') {
      console.log('Usage: node scripts/manual-evidence.js <init-root|check-root> [--root PATH]');
      return 0;
    }
    throw new Error(`unknown command: ${command}`);
  } catch (error) {
    console.error(`[manual-evidence] ${error.message}`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = runCli();
}

module.exports = {
  EVIDENCE_ROOT_ENV,
  REQUIRED_DIRS,
  SUPPORTED_EVIDENCE_TYPES,
  addEvidenceCandidate,
  buildEvidenceRelativePath,
  checkEvidenceRoot,
  getEvidenceRoot,
  initEvidenceRoot,
  sha256File,
  runCli,
  validateManualEvidenceDocument,
};
