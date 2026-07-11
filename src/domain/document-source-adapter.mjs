function required(value, label) { const result = String(value ?? '').trim(); if (!result) throw new TypeError(`${label} required`); return result; }
function freezeDeep(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) freezeDeep(child); } return value; }

export function createDocumentSourceAdapter(input) {
  if (!input || !Array.isArray(input.allowedHosts) || !input.allowedHosts.length) throw new TypeError('document adapter allowed hosts required');
  const allowedHosts = [...new Set(input.allowedHosts.map((host) => required(host, 'allowed host').toLowerCase()))];
  return freezeDeep({
    id: required(input.id, 'adapter id'), manufacturer: required(input.manufacturer, 'manufacturer'),
    allowedHosts, parserVersion: required(input.parserVersion, 'parser version'),
    accepts(url) { try { return allowedHosts.includes(new URL(url).hostname.toLowerCase()); } catch { return false; } },
  });
}

export function inspectDocumentPayload({ contentType, bytes }) {
  if (!/^application\/pdf(?:;|$)/i.test(String(contentType ?? ''))) return freezeDeep({ accepted: false, reason: 'non_pdf_content_type' });
  const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? '');
  if (payload.subarray(0, 5).toString('ascii') !== '%PDF-') return freezeDeep({ accepted: false, reason: 'invalid_pdf_signature' });
  return freezeDeep({ accepted: true, reason: null });
}

export function deduplicateDocuments(documents) {
  if (!Array.isArray(documents)) throw new TypeError('documents must be an array');
  const groups = new Map();
  for (const document of documents) {
    if (!/^[a-f0-9]{64}$/.test(String(document.sha256 ?? ''))) throw new TypeError('document hash required');
    const prior = groups.get(document.sha256) ?? { sha256: document.sha256, documentIds: [], productIds: [] };
    prior.documentIds.push(required(document.id, 'document id'));
    if (!prior.productIds.includes(document.productId)) prior.productIds.push(required(document.productId, 'product id'));
    groups.set(document.sha256, prior);
  }
  return freezeDeep([...groups.values()].map((row) => ({ ...row, documentIds: row.documentIds.sort(), productIds: row.productIds.sort() })));
}

export function createOcrExtraction(input) {
  if (input?.imageBased !== true) throw new TypeError('OCR is only valid for image-based documents');
  if (input.renderedPageVerified !== true) throw new TypeError('OCR requires rendered-page verification');
  if (!(typeof input.confidence === 'number' && input.confidence >= 0 && input.confidence <= 1)) throw new TypeError('OCR confidence must be 0..1');
  if (!Array.isArray(input.pages) || input.pages.some((page) => !Number.isInteger(page.page) || page.page < 1 || !String(page.text ?? '').trim())) throw new TypeError('OCR pages require page numbers and text');
  return freezeDeep({
    engine: required(input.engine, 'OCR engine'), engineVersion: required(input.engineVersion, 'OCR engine version'),
    confidence: input.confidence, renderedPageVerified: true, pages: input.pages.map((page) => ({ ...page })),
    approvalState: 'extracted_not_approved',
  });
}
