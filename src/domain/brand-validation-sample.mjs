import { createHash } from 'node:crypto';

export const BRAND_VALIDATION_COLUMNS = Object.freeze([
  'canonical_product_id',
  'legacy_runtime_id',
  'category',
  'brand',
  'model',
  'gtin',
  'market_state',
  'catalog_availability',
  'width_min_mm',
  'width_max_mm',
  'height_min_mm',
  'height_max_mm',
  'depth_min_mm',
  'depth_max_mm',
  'dimension_scope',
  'dimension_source_class',
  'dimension_evidence_level',
  'missing_for_verified_fit',
  'registry_reconciliation_state',
  'reason_codes',
  'official_product_url',
  'official_manual_url',
  'official_installation_guide_url',
  'official_qrg_url',
  'official_cad_url',
  'official_evidence_url',
  'source_document_ids',
  'source_receipt_hashes',
  'conflict_state',
]);

const GTIN_SCHEMES = new Set(['gtin', 'gtin_8', 'gtin_12', 'gtin_13', 'gtin_14', 'ean']);
const DIMENSION_FIELDS = Object.freeze([
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
]);

function indexUnique(rows, key, label) {
  const index = new Map();
  for (const row of rows ?? []) {
    const value = row?.[key];
    if (!value) throw new TypeError(`${label} row is missing ${key}`);
    if (index.has(value)) throw new TypeError(`${label} contains duplicate ${key}: ${value}`);
    index.set(value, row);
  }
  return index;
}

function assertExactIdentity(pilotProduct, candidate, source) {
  if (!candidate) throw new TypeError(`${source} product missing for ${pilotProduct.canonicalProductId}`);
  for (const field of ['category', 'brand', 'model']) {
    const candidateField = field === 'category' && candidate.cat ? 'cat' : field;
    const matches = field === 'brand'
      ? String(candidate[candidateField]).normalize('NFKC').trim().toLocaleLowerCase('en-AU')
        === String(pilotProduct[field]).normalize('NFKC').trim().toLocaleLowerCase('en-AU')
      : candidate[candidateField] === pilotProduct[field];
    if (!matches) {
      throw new TypeError(
        `exact identity mismatch in ${source} for ${pilotProduct.canonicalProductId}: `
        + `${field} ${JSON.stringify(pilotProduct[field])} != ${JSON.stringify(candidate[candidateField])}`,
      );
    }
  }
}

function normalizeRange(value) {
  if (Number.isFinite(value)) return { minimumMm: value, maximumMm: value };
  if (!value || typeof value !== 'object') return { minimumMm: '', maximumMm: '' };
  const minimumMm = Number.isFinite(value.minimumMm) ? value.minimumMm : '';
  const maximumMm = Number.isFinite(value.maximumMm) ? value.maximumMm : '';
  return { minimumMm, maximumMm };
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function isPublicHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function sourceDocumentsByProduct(sourceDocuments) {
  const index = new Map();
  for (const document of sourceDocuments?.documents ?? []) {
    for (const link of document.productLinks ?? []) {
      if (!link.canonicalProductId) continue;
      if (!index.has(link.canonicalProductId)) index.set(link.canonicalProductId, []);
      index.get(link.canonicalProductId).push(document);
    }
  }
  return index;
}

function collectReceiptHashes(product) {
  return uniqueSorted(Object.values(product.geometry_v2_provenance?.fieldEvidence ?? {})
    .map((field) => field?.receiptBindingSha256));
}

function hasReceiptBoundDimensions(product) {
  const fieldEvidence = product.geometry_v2_provenance?.fieldEvidence ?? {};
  return DIMENSION_FIELDS.every((field) => /^[a-f0-9]{64}$/.test(fieldEvidence[field]?.receiptBindingSha256 ?? ''));
}

function selectOfficialEvidenceUrl(product, documents) {
  const candidates = [];
  if (product.evidence?.has_official_evidence && isPublicHttpUrl(product.evidence.source_url)) {
    candidates.push(product.evidence.source_url);
  }
  for (const document of documents) {
    if (document.authorType !== 'manufacturer' && document.transportHostType !== 'manufacturer') continue;
    if (isPublicHttpUrl(document.finalUrl ?? document.sourceUrl)) candidates.push(document.finalUrl ?? document.sourceUrl);
  }
  return uniqueSorted(candidates)[0] ?? '';
}

function extractGtin(canonicalProduct) {
  return canonicalProduct.identifiers?.find((identifier) => GTIN_SCHEMES.has(identifier.scheme))?.value ?? '';
}

function conflictState(reconciliationState) {
  if (/CONFLICT|SUSPECT/.test(reconciliationState ?? '')) return reconciliationState;
  return 'none_recorded';
}

export function buildBrandValidationRows({ pilot, canonicalRegistry, publicProjection, sourceDocuments }) {
  const pilotProducts = pilot?.products ?? [];
  const pilotIds = new Set();
  const canonicalById = indexUnique(canonicalRegistry?.products, 'id', 'canonical registry');
  const publicByCanonicalId = indexUnique(publicProjection?.products, 'canonicalProductId', 'public projection');
  const documentsByProduct = sourceDocumentsByProduct(sourceDocuments);

  const rows = pilotProducts.map((pilotProduct) => {
    if (pilotIds.has(pilotProduct.canonicalProductId)) {
      throw new TypeError(`pilot contains duplicate canonicalProductId: ${pilotProduct.canonicalProductId}`);
    }
    pilotIds.add(pilotProduct.canonicalProductId);

    const canonicalProduct = canonicalById.get(pilotProduct.canonicalProductId);
    const publicProduct = publicByCanonicalId.get(pilotProduct.canonicalProductId);
    assertExactIdentity(pilotProduct, canonicalProduct, 'canonical registry');
    assertExactIdentity(pilotProduct, publicProduct, 'public projection');

    const documents = documentsByProduct.get(pilotProduct.canonicalProductId) ?? [];
    const receiptBound = hasReceiptBoundDimensions(publicProduct);
    const closedEnvelope = publicProduct.geometry_v2?.closedEnvelope ?? {
      widthMm: publicProduct.w,
      heightMm: publicProduct.h,
      depthMm: publicProduct.d,
    };
    const width = normalizeRange(closedEnvelope.widthMm);
    const height = normalizeRange(closedEnvelope.heightMm);
    const depth = normalizeRange(closedEnvelope.depthMm);
    const missing = publicProduct.geometry_v2_provenance?.missingForVerifiedFit
      ?? ['receipt_bound_fit_requirements_not_evaluated'];

    return {
      canonical_product_id: pilotProduct.canonicalProductId,
      legacy_runtime_id: pilotProduct.legacyRuntimeId,
      category: pilotProduct.category,
      brand: pilotProduct.brand,
      model: pilotProduct.model,
      gtin: extractGtin(canonicalProduct),
      market_state: 'unknown',
      catalog_availability: publicProduct.unavailable === true
        ? 'unavailable'
        : publicProduct.unavailable === false ? 'listed' : 'unknown',
      width_min_mm: width.minimumMm,
      width_max_mm: width.maximumMm,
      height_min_mm: height.minimumMm,
      height_max_mm: height.maximumMm,
      depth_min_mm: depth.minimumMm,
      depth_max_mm: depth.maximumMm,
      dimension_scope: 'closed_product_envelope',
      dimension_source_class: receiptBound ? 'receipt_bound' : 'catalog_hint',
      dimension_evidence_level: publicProduct.geometry_v2_provenance?.evidenceLevel
        ?? publicProduct.evidence?.trust_level
        ?? 'catalog_hint',
      missing_for_verified_fit: uniqueSorted(missing).join('|'),
      registry_reconciliation_state: pilotProduct.reconciliationState ?? 'unknown',
      reason_codes: uniqueSorted(pilotProduct.reasonCodes ?? []).join('|'),
      official_product_url: '',
      official_manual_url: '',
      official_installation_guide_url: '',
      official_qrg_url: '',
      official_cad_url: '',
      official_evidence_url: selectOfficialEvidenceUrl(publicProduct, documents),
      source_document_ids: uniqueSorted(documents.map((document) => document.id)).join('|'),
      source_receipt_hashes: collectReceiptHashes(publicProduct).join('|'),
      conflict_state: conflictState(pilotProduct.reconciliationState),
    };
  });

  return rows.sort((left, right) => left.category.localeCompare(right.category)
    || left.brand.localeCompare(right.brand)
    || left.model.localeCompare(right.model)
    || left.canonical_product_id.localeCompare(right.canonical_product_id));
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeBrandValidationCsv(rows) {
  const lines = [BRAND_VALIDATION_COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(BRAND_VALIDATION_COLUMNS.map((column) => csvCell(row[column])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

export function sha256Text(value) {
  return createHash('sha256').update(value).digest('hex');
}

function countsBy(rows, field) {
  const grouped = new Map();
  for (const row of rows) {
    const key = row[field];
    const values = grouped.get(key) ?? [];
    values.push(row);
    grouped.set(key, values);
  }
  return Object.fromEntries([...grouped.entries()]
    .sort(([left], [right]) => String(left).localeCompare(String(right)))
    .map(([key, values]) => [key, values.length]));
}

export function buildBrandValidationManifest({ rows, csv, csvPath, sourceFiles }) {
  const sortedSources = [...sourceFiles]
    .map((source) => ({ path: source.path, sha256: source.sha256 }))
    .sort((left, right) => left.path.localeCompare(right.path));
  return {
    schemaVersion: 1,
    generatedAt: null,
    samplePolicy: {
      frozen: true,
      expectedProducts: 100,
      identityPolicy: 'exact_brand_model_suffix_preserved',
      dimensionPolicy: 'receipt_bound_or_explicit_catalog_hint',
    },
    sourceFiles: sortedSources,
    csv: {
      path: csvPath,
      rowCount: rows.length,
      columns: [...BRAND_VALIDATION_COLUMNS],
      sha256: sha256Text(csv),
    },
    summary: {
      total: rows.length,
      byCategory: countsBy(rows, 'category'),
      byReconciliationState: countsBy(rows, 'registry_reconciliation_state'),
      withGtin: rows.filter((row) => row.gtin).length,
      receiptBoundDimensions: rows.filter((row) => row.dimension_source_class === 'receipt_bound').length,
      catalogHintDimensions: rows.filter((row) => row.dimension_source_class === 'catalog_hint').length,
      unresolvedConflicts: rows.filter((row) => row.conflict_state !== 'none_recorded').length,
    },
  };
}
