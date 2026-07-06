'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');
const { canonicalizeBrand } = require('./brand-canon.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const DIMENSION_FIELDS = Object.freeze(['w', 'h', 'd']);

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isFinitePositiveNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function hasVerifiedDimensionEvidence(product) {
  const evidence = product?.evidence;
  if (!evidence || typeof evidence !== 'object') return false;
  if (typeof evidence.raw_json_path === 'string' && evidence.raw_json_path.trim()) return true;
  return Number(evidence.confidence_score) >= 0.8;
}

function hasUsableDimensions(product) {
  return DIMENSION_FIELDS.every((field) => isFinitePositiveNumber(product?.[field]));
}

function buildCatalogById(catalogFinal) {
  const products = Array.isArray(catalogFinal?.products) ? catalogFinal.products : [];
  return new Map(products.map((product) => [product.id, product]));
}

function projectedRuntimeProduct(runtimeProduct, catalogProduct) {
  return {
    ...runtimeProduct,
    w: catalogProduct.w,
    h: catalogProduct.h,
    d: catalogProduct.d,
    evidence: cloneJson(catalogProduct.evidence)
  };
}

function canonicalizeRuntimeProduct(product) {
  const canonicalBrand = canonicalizeBrand(product?.brand);
  if (!canonicalBrand || product?.brand === canonicalBrand) return { ...product };
  return {
    ...product,
    brand: canonicalBrand
  };
}

function didOverrideChange(runtimeProduct, updatedProduct) {
  return runtimeProduct?.brand !== updatedProduct?.brand ||
    DIMENSION_FIELDS.some((field) => runtimeProduct?.[field] !== updatedProduct?.[field]) ||
    JSON.stringify(runtimeProduct?.evidence ?? null) !== JSON.stringify(updatedProduct?.evidence ?? null);
}

function applyVerifiedCatalogOverrides({ runtime, catalogFinal } = {}) {
  const runtimeProducts = Array.isArray(runtime?.products) ? runtime.products : [];
  const catalogById = buildCatalogById(catalogFinal);
  let updatedProducts = 0;
  let eligibleCatalogRows = 0;
  let skippedUnverified = 0;
  let skippedMissingRuntime = 0;

  const seenRuntimeIds = new Set(runtimeProducts.map((product) => product.id));
  for (const catalogProduct of catalogById.values()) {
    if (!seenRuntimeIds.has(catalogProduct.id)) skippedMissingRuntime += 1;
    if (hasVerifiedDimensionEvidence(catalogProduct) && hasUsableDimensions(catalogProduct)) {
      eligibleCatalogRows += 1;
    }
  }

  const products = runtimeProducts.map((runtimeProduct) => {
    const catalogProduct = catalogById.get(runtimeProduct.id);
    if (!catalogProduct) {
      const updatedProduct = canonicalizeRuntimeProduct(runtimeProduct);
      if (didOverrideChange(runtimeProduct, updatedProduct)) updatedProducts += 1;
      return updatedProduct;
    }

    if (!hasVerifiedDimensionEvidence(catalogProduct) || !hasUsableDimensions(catalogProduct)) {
      skippedUnverified += 1;
      const updatedProduct = canonicalizeRuntimeProduct(runtimeProduct);
      if (didOverrideChange(runtimeProduct, updatedProduct)) updatedProducts += 1;
      return updatedProduct;
    }

    const updatedProduct = canonicalizeRuntimeProduct(projectedRuntimeProduct(runtimeProduct, catalogProduct));
    if (didOverrideChange(runtimeProduct, updatedProduct)) updatedProducts += 1;
    return updatedProduct;
  });

  return {
    ...runtime,
    products,
    summary: {
      scannedProducts: runtimeProducts.length,
      eligibleCatalogRows,
      updatedProducts,
      skippedUnverified,
      skippedMissingRuntime
    }
  };
}

async function readJson(filePath) {
  return JSON.parse(await fsp.readFile(filePath, 'utf8'));
}

async function writeJsonAtomically(filePath, document) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fsp.writeFile(tempPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await fsp.rename(tempPath, filePath);
}

async function applyVerifiedCatalogOverridesToFiles({
  repoRoot = REPO_ROOT,
  runtimePath = path.join(repoRoot, 'public', 'data', 'appliances.json'),
  catalogFinalPath = path.join(repoRoot, 'data', 'catalog-final.json'),
  write = true,
  logger = console
} = {}) {
  const [runtime, catalogFinal] = await Promise.all([
    readJson(runtimePath),
    readJson(catalogFinalPath)
  ]);
  const result = applyVerifiedCatalogOverrides({ runtime, catalogFinal });
  const { summary, ...document } = result;

  if (write) {
    await fsp.mkdir(path.dirname(runtimePath), { recursive: true });
    await writeJsonAtomically(runtimePath, document);
  }

  logger.log(`[verified-overrides] scanned=${summary.scannedProducts} eligible=${summary.eligibleCatalogRows} updated=${summary.updatedProducts}`);
  return { document, summary };
}

function parseArgs(argv) {
  return {
    write: !argv.includes('--no-write')
  };
}

async function runCli() {
  const options = parseArgs(process.argv.slice(2));
  const result = await applyVerifiedCatalogOverridesToFiles(options);
  if (options.write && result.summary.updatedProducts > 0) {
    console.log('[verified-overrides] Wrote public/data/appliances.json');
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error('[verified-overrides] Failed to apply verified catalog overrides', error);
    process.exitCode = 1;
  });
}

module.exports = {
  DIMENSION_FIELDS,
  applyVerifiedCatalogOverrides,
  applyVerifiedCatalogOverridesToFiles,
  canonicalizeRuntimeProduct,
  hasVerifiedDimensionEvidence
};
