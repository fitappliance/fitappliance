#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createSourceDocument } from '../../src/domain/source-document.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const manual = JSON.parse(await readFile(resolve(root, 'data/manual-evidence.json'), 'utf8'));
const documents = [];
for (const [legacyId, product] of Object.entries(manual.products ?? {})) {
  for (const [index, evidence] of (product.evidence ?? []).entries()) {
    if (!evidence.source_url) continue;
    const extracted = evidence.extracted ?? {};
    const sourceType = String(evidence.source_type ?? 'legacy_unknown');
    const manufacturer = /official|manufacturer/i.test(sourceType) && !/retailer/i.test(sourceType);
    const identityOutcome = String(extracted.sku ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase()
      === String(product.model ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase() ? 'exact' : 'ambiguous';
    const fields = [];
    const dimensions = extracted.dimensions ?? {};
    for (const [field, key] of [['closedEnvelope.widthMm', 'width_mm'], ['closedEnvelope.heightMm', 'height_mm'], ['closedEnvelope.depthMm', 'depth_mm']]) {
      if (Number.isFinite(dimensions[key])) fields.push({ field, value: dimensions[key], unit: 'mm', page: null, quote: null });
    }
    const seed = `${legacyId}\0${evidence.source_url}\0${index}`;
    documents.push(createSourceDocument({
      id: `doc_${createHash('sha256').update(seed).digest('hex').slice(0, 24)}`,
      sourceUrl: evidence.source_url, finalUrl: evidence.source_url,
      authorType: manufacturer ? 'manufacturer' : 'unknown',
      transportHostType: manufacturer ? 'manufacturer' : /appliancesonline|thegoodguys|harveynorman/i.test(evidence.source_url) ? 'retailer' : 'unknown',
      contentType: 'application/pdf', retrievedAt: evidence.verified_at ? `${String(evidence.verified_at).slice(0, 10)}T00:00:00.000Z` : null,
      sha256: evidence.sha256 ?? null, pageCount: null, parserVersion: 'legacy-manual-evidence-v1',
      identityOutcome, fields, state: 'quarantined', history: [],
      rejectionReason: 'legacy_evidence_missing_page_level_v2_provenance',
    }));
  }
}
documents.sort((a, b) => a.id.localeCompare(b.id));
const report = {
  schemaVersion: 1, documents,
  summary: {
    total: documents.length,
    exactIdentity: documents.filter((row) => row.identityOutcome === 'exact').length,
    manufacturerTransport: documents.filter((row) => row.transportHostType === 'manufacturer').length,
    approved: documents.filter((row) => row.state === 'approved').length,
    quarantined: documents.filter((row) => row.state === 'quarantined').length,
  },
};
await writeFile(resolve(root, 'data/architecture-v2/source-documents.json'), `${JSON.stringify(report)}\n`);
console.log(JSON.stringify(report.summary));
