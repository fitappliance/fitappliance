function text(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${label} must be a positive integer`);
  return value;
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

function normalizeHash(value) {
  const hash = String(value ?? '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new TypeError('valid SHA-256 required');
  return hash;
}

function httpsUrl(value) {
  let url;
  try { url = new URL(String(value ?? '')); } catch { throw new TypeError('source URL must be HTTPS'); }
  if (url.protocol !== 'https:') throw new TypeError('source URL must be HTTPS');
  return url.toString();
}

export function evidenceObjectPaths(value) {
  const sha256 = normalizeHash(value);
  const shard = sha256.slice(0, 2);
  return freezeDeep({
    pdf: `evidence/objects/sha256/${shard}/${sha256}.pdf`,
    text: `evidence/text/sha256/${shard}/${sha256}.txt`,
    renderDirectory: `evidence/renders/sha256/${shard}/${sha256}`,
  });
}

export function buildEvidenceObjectIndex(records) {
  if (!Array.isArray(records) || records.length === 0) throw new TypeError('evidence object records required');
  const groups = new Map();
  for (const input of records) {
    const sha256 = normalizeHash(input?.sha256);
    const byteSize = positiveInteger(input?.byteSize, 'byte size');
    const textSha256 = normalizeHash(input?.textSha256);
    const textByteSize = positiveInteger(input?.textByteSize, 'text byte size');
    const pageCount = positiveInteger(input?.pageCount, 'page count');
    const sourceUrl = httpsUrl(input?.sourceUrl);
    const legacyRuntimeId = text(input?.legacyRuntimeId, 'legacy runtime ID');
    const canonicalProductId = text(input?.canonicalProductId, 'canonical product ID');
    const reviewPages = [...new Set(input?.reviewPages ?? [])].sort((a, b) => a - b);
    if (reviewPages.length === 0 || reviewPages.some((page) => !Number.isInteger(page) || page < 1 || page > pageCount)) {
      throw new TypeError(`invalid review page for ${legacyRuntimeId}`);
    }
    const group = groups.get(sha256) ?? {
      sha256, byteSize, textSha256, textByteSize, pageCount, sourceUrls: new Set(), productLinks: new Map(), reviewPages: new Set(),
    };
    if (group.byteSize !== byteSize) throw new TypeError(`conflicting byte size for ${sha256}`);
    if (group.textSha256 !== textSha256) throw new TypeError(`conflicting text hash for ${sha256}`);
    if (group.textByteSize !== textByteSize) throw new TypeError(`conflicting text byte size for ${sha256}`);
    if (group.pageCount !== pageCount) throw new TypeError(`conflicting page count for ${sha256}`);
    group.sourceUrls.add(sourceUrl);
    group.productLinks.set(`${legacyRuntimeId}\0${canonicalProductId}`, { legacyRuntimeId, canonicalProductId });
    for (const page of reviewPages) group.reviewPages.add(page);
    groups.set(sha256, group);
  }
  const documents = [...groups.values()].sort((a, b) => a.sha256.localeCompare(b.sha256)).map((group) => freezeDeep({
    sha256: group.sha256,
    byteSize: group.byteSize,
    textSha256: group.textSha256,
    textByteSize: group.textByteSize,
    pageCount: group.pageCount,
    sourceUrls: [...group.sourceUrls].sort(),
    paths: evidenceObjectPaths(group.sha256),
    productLinks: [...group.productLinks.values()].sort((a, b) => a.legacyRuntimeId.localeCompare(b.legacyRuntimeId)),
    reviewPages: [...group.reviewPages].sort((a, b) => a - b),
  }));
  return freezeDeep({
    schemaVersion: 1,
    addressing: 'sha256',
    documents,
    summary: {
      documents: documents.length,
      productLinks: documents.reduce((sum, row) => sum + row.productLinks.length, 0),
      reviewPages: documents.reduce((sum, row) => sum + row.reviewPages.length, 0),
      totalBytes: documents.reduce((sum, row) => sum + row.byteSize, 0),
      totalTextBytes: documents.reduce((sum, row) => sum + row.textByteSize, 0),
    },
  });
}

export function buildEvidenceObjectRecords({ dimensionReviews, spaceReviews, bundles, fileFacts }) {
  if (!Array.isArray(dimensionReviews) || !Array.isArray(spaceReviews) || !Array.isArray(bundles)) {
    throw new TypeError('review arrays and bundles required');
  }
  if (!(fileFacts instanceof Map)) throw new TypeError('file facts map required');

  const bundleByLegacyId = new Map(bundles.map((bundle) => [bundle?.product?.legacyRuntimeId, bundle]));
  const spaceByLegacyId = new Map(spaceReviews.map((review) => [review?.legacyRuntimeId, review]));

  return dimensionReviews.map((review) => {
    const legacyRuntimeId = text(review?.id, 'legacy runtime ID');
    const sha256 = normalizeHash(review?.hash);
    const pageCount = positiveInteger(review?.pages, 'page count');
    const bundle = bundleByLegacyId.get(legacyRuntimeId);
    if (!bundle) throw new TypeError(`missing evidence bundle for ${legacyRuntimeId}`);
    const sourceDocument = bundle.sourceDocument ?? {};
    if (sourceDocument.sha256 != null && normalizeHash(sourceDocument.sha256) !== sha256) {
      throw new TypeError(`document hash mismatch for ${legacyRuntimeId}`);
    }
    if (sourceDocument.pageCount != null && positiveInteger(sourceDocument.pageCount, 'source page count') !== pageCount) {
      throw new TypeError(`document page count mismatch for ${legacyRuntimeId}`);
    }

    const spaceReview = spaceByLegacyId.get(legacyRuntimeId);
    if (spaceReview) {
      if (normalizeHash(spaceReview.documentSha256) !== sha256) {
        throw new TypeError(`space review hash mismatch for ${legacyRuntimeId}`);
      }
      if (positiveInteger(spaceReview.pageCount, 'space review page count') !== pageCount) {
        throw new TypeError(`space review page count mismatch for ${legacyRuntimeId}`);
      }
    }

    const reviewPages = [...new Set([
      positiveInteger(review.page, 'dimension review page'),
      ...(spaceReview?.fields ?? []).map((field) => positiveInteger(field.page, 'space review page')),
    ])].sort((a, b) => a - b);

    const facts = fileFacts.get(legacyRuntimeId) ?? {};
    return {
      sha256,
      byteSize: positiveInteger(facts.byteSize, 'byte size'),
      textSha256: normalizeHash(facts.textSha256),
      textByteSize: positiveInteger(facts.textByteSize, 'text byte size'),
      pageCount,
      sourceUrl: sourceDocument.sourceUrl,
      legacyRuntimeId,
      canonicalProductId: text(bundle?.product?.canonicalProductId, 'canonical product ID'),
      reviewPages,
    };
  });
}
