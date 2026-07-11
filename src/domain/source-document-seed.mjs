import { createHash } from 'node:crypto';
import { createSourceDocument } from './source-document.mjs';
import { classifyTransportHost } from './source-provenance.mjs';

export function buildLegacySourceDocuments({ manual, canonical }) {
  if (!manual?.products || !Array.isArray(canonical?.identifierMappings)) {
    throw new TypeError('manual evidence and canonical registry required');
  }
  const canonicalByLegacy = new Map(canonical.identifierMappings.map((row) => [row.legacyRuntimeId, row.canonicalProductId]));
  const documents = [];
  for (const [legacyId, product] of Object.entries(manual.products)) {
    for (const [index, evidence] of (product.evidence ?? []).entries()) {
      if (!evidence.source_url) continue;
      const extracted = evidence.extracted ?? {};
      const sourceType = String(evidence.source_type ?? 'legacy_unknown');
      const manufacturer = /official|manufacturer/i.test(sourceType) && !/retailer/i.test(sourceType);
      const identityOutcome = String(extracted.sku ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase()
        === String(product.model ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase() ? 'exact' : 'ambiguous';
      const fields = [];
      const dimensions = extracted.dimensions ?? {};
      for (const [field, key] of [
        ['closedEnvelope.widthMm', 'width_mm'],
        ['closedEnvelope.heightMm', 'height_mm'],
        ['closedEnvelope.depthMm', 'depth_mm'],
      ]) {
        if (Number.isFinite(dimensions[key])) fields.push({ field, value: dimensions[key], unit: 'mm', page: null, quote: null });
      }
      const seed = `${legacyId}\0${evidence.source_url}\0${index}`;
      documents.push(createSourceDocument({
        id: `doc_${createHash('sha256').update(seed).digest('hex').slice(0, 24)}`,
        sourceUrl: evidence.source_url,
        finalUrl: evidence.source_url,
        authorType: manufacturer ? 'manufacturer' : 'unknown',
        transportHostType: classifyTransportHost(evidence.source_url),
        contentType: 'application/pdf',
        retrievedAt: evidence.verified_at ? `${String(evidence.verified_at).slice(0, 10)}T00:00:00.000Z` : null,
        sha256: evidence.sha256 ?? null,
        pageCount: null,
        parserVersion: 'legacy-manual-evidence-v1',
        identityOutcome,
        fields,
        state: 'quarantined',
        history: [],
        productLinks: [{
          legacyRuntimeId: legacyId,
          canonicalProductId: canonicalByLegacy.get(legacyId.toLowerCase()) ?? null,
        }],
        rejectionReason: 'legacy_evidence_missing_page_level_v2_provenance',
      }));
    }
  }
  return documents.sort((a, b) => a.id.localeCompare(b.id));
}
