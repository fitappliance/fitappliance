const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MANIFEST = {
  schema_version: 1,
  last_updated: '1970-01-01',
  storage: {
    root_env: 'EVIDENCE_ROOT_DIR',
    path_rule: 'Each evidence.local_path is relative to EVIDENCE_ROOT_DIR.'
  },
  products: {}
};

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function toDateOnly(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.slice(0, 10);
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function sanitizeSku(value) {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'unknown-sku';
}

function slashPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function readManifest(manualEvidencePath) {
  if (!fs.existsSync(manualEvidencePath)) {
    return cloneJson(DEFAULT_MANIFEST);
  }
  return JSON.parse(fs.readFileSync(manualEvidencePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeEvidenceVaultEntry({
  repoRoot = process.cwd(),
  productId,
  product = {},
  strictData,
  sourceUrl,
  verifiedAt
}) {
  if (!strictData || typeof strictData !== 'object') {
    throw new Error('writeEvidenceVaultEntry requires strictData');
  }
  const sku = sanitizeSku(strictData.sku || product.model || productId);
  const rawJsonRelativePath = slashPath(path.join('data', 'pdf-evidence-raw', `${sku}.json`));
  const rawJsonPath = path.join(repoRoot, rawJsonRelativePath);
  const payload = {
    schema_version: 1,
    product_id: productId,
    category: product.cat || product.category || String(strictData.category || '').toLowerCase(),
    brand: product.brand || strictData.brand,
    model: product.model || strictData.sku,
    source_url: sourceUrl || strictData.metadata?.source_pdf_url || null,
    verified_at: toDateOnly(verifiedAt || strictData.metadata?.extraction_date),
    extracted: strictData
  };

  writeJson(rawJsonPath, payload);

  return {
    rawJsonPath,
    rawJsonRelativePath
  };
}

function isSameEvidenceItem(item, type, sourceUrl) {
  return item?.type === type && item?.source_url === sourceUrl;
}

function upsertManualEvidence(manifest, {
  productId,
  product = {},
  strictData,
  sourceUrl,
  verifiedAt,
  rawJsonRelativePath
}) {
  if (!productId) throw new Error('upsertManualEvidence requires productId');
  if (!strictData || typeof strictData !== 'object') {
    throw new Error('upsertManualEvidence requires strictData');
  }

  const next = cloneJson({
    ...DEFAULT_MANIFEST,
    ...manifest,
    products: manifest?.products || {}
  });
  const verifiedDate = toDateOnly(verifiedAt || strictData.metadata?.extraction_date);
  const effectiveSourceUrl = sourceUrl || strictData.metadata?.source_pdf_url;
  const existing = next.products[productId] || {};
  const existingEvidence = Array.isArray(existing.evidence) ? existing.evidence : [];
  const type = 'spec_sheet';
  const evidenceItem = {
    type,
    status: 'approved',
    has_pdf_evidence: true,
    source_url: effectiveSourceUrl,
    verified_at: verifiedDate,
    raw_json_path: rawJsonRelativePath,
    ...(strictData.metadata?.verified_alias ? { verified_alias: strictData.metadata.verified_alias } : {}),
    extracted: strictData
  };

  next.last_updated = verifiedDate;
  next.products = {
    ...next.products,
    [productId]: {
      ...existing,
      category: product.cat || existing.category || String(strictData.category || '').toLowerCase(),
      brand: product.brand || existing.brand || strictData.brand,
      model: product.model || existing.model || strictData.sku,
      has_pdf_evidence: true,
      ...(strictData.metadata?.verified_alias ? { verified_alias: strictData.metadata.verified_alias } : {}),
      evidence: [
        ...existingEvidence.filter((item) => !isSameEvidenceItem(item, type, effectiveSourceUrl)),
        evidenceItem
      ]
    }
  };

  return next;
}

function saveExtractionToVault({
  repoRoot = process.cwd(),
  manualEvidencePath = path.join(repoRoot, 'data', 'manual-evidence.json'),
  productId,
  product,
  strictData,
  sourceUrl,
  verifiedAt
}) {
  const vaultResult = writeEvidenceVaultEntry({
    repoRoot,
    productId,
    product,
    strictData,
    sourceUrl,
    verifiedAt
  });
  const manifest = readManifest(manualEvidencePath);
  const nextManifest = upsertManualEvidence(manifest, {
    productId,
    product,
    strictData,
    sourceUrl,
    verifiedAt,
    rawJsonRelativePath: vaultResult.rawJsonRelativePath
  });

  writeJson(manualEvidencePath, nextManifest);

  return {
    productId,
    manualEvidencePath,
    ...vaultResult
  };
}

exports.saveExtractionToVault = saveExtractionToVault;
exports.upsertManualEvidence = upsertManualEvidence;
exports.writeEvidenceVaultEntry = writeEvidenceVaultEntry;
