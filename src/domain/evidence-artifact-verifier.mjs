import { createHash } from 'node:crypto';
import { load } from 'cheerio';

import {
  claimFromEvidenceFragment,
  containsExactModel,
  evidenceFieldRules,
  validateClaimsSemantics,
} from './evidence-claim-semantics.mjs';
import { createVerificationReceipt, verifyVerificationReceipt } from './evidence-source-verifier.mjs';

function normalizedText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function resourceKey(value) {
  const url = new URL(value);
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString();
}

function verifyBytes(source, bytes) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) throw new TypeError('artifact bytes required');
  const buffer = Buffer.from(bytes);
  const hash = createHash('sha256').update(buffer).digest('hex');
  if (hash !== source.contentSha256) throw new Error('artifact hash mismatch');
  if (buffer.length !== source.byteSize) throw new Error('artifact byte size mismatch');
  return buffer;
}

function htmlIdentitySignals(source, caseIdentity, bytes) {
  const $ = load(bytes.toString('utf8'));
  const canonical = $('link[rel="canonical"]').first().attr('href');
  if (!canonical || resourceKey(canonical) !== resourceKey(source.finalUrl)
    || !containsExactModel(new URL(canonical).pathname, caseIdentity.model)) {
    throw new Error('canonical URL does not prove exact model identity');
  }
  const signals = [{ type: 'canonical_url', value: canonical }];
  const title = normalizedText($('title').first().text());
  if (containsExactModel(title, caseIdentity.model)) signals.push({ type: 'document_title', value: title });
  const attributes = [
    'data-item-model', 'data-product-model', 'data-product-id', 'data-ga4-product-id',
    'datalayer-product-id', 'datalayer-origin-productmodelid',
  ];
  let productModel = null;
  for (const attribute of attributes) {
    $(`[${attribute}]`).each((_, element) => {
      const value = $(element).attr(attribute);
      if (!productModel && containsExactModel(value, caseIdentity.model)) productModel = value;
    });
  }
  if (productModel) signals.push({ type: 'product_model', value: productModel });
  if (!productModel) throw new Error('exact product model identity signal missing');
  const text = $.root().find('*').contents()
    .filter((_, node) => node.type === 'text')
    .map((_, node) => normalizedText(node.data))
    .get()
    .filter(Boolean)
    .join(' ');
  return { signals, text: normalizedText(text) };
}

function pdfIdentitySignals(source, caseIdentity, extractedText) {
  if (!normalizedText(extractedText)) throw new TypeError('PDF extracted text required');
  const pages = String(extractedText).split('\f');
  const modelPages = new Set();
  for (const claim of source.claims ?? []) {
    if (!Number.isInteger(claim.page) || claim.page < 1 || claim.page > pages.length) {
      throw new TypeError(`valid PDF page required for ${claim.field}`);
    }
    const page = normalizedText(pages[claim.page - 1]);
    if (!containsExactModel(page, caseIdentity.model)) throw new Error(`exact model missing from PDF claim page ${claim.page}`);
    if (!page.toLowerCase().includes(normalizedText(claim.quote).toLowerCase())) {
      throw new Error(`claim quote missing from PDF page ${claim.page}`);
    }
    modelPages.add(claim.page);
  }
  return {
    signals: [...modelPages].sort((a, b) => a - b).map((page) => ({ type: 'pdf_model_page', value: `${caseIdentity.model}:page:${page}` })),
    text: normalizedText(extractedText),
  };
}

function verifyQuotes(source, text) {
  const normalized = normalizedText(text).toLowerCase();
  for (const claim of source.claims ?? []) {
    if (!normalized.includes(normalizedText(claim.quote).toLowerCase())) {
      throw new Error(`artifact missing claim quote for ${claim.field}`);
    }
  }
}

function elementOwnText($, element) {
  return normalizedText($(element).contents()
    .filter((_, node) => node.type === 'text')
    .map((_, node) => node.data)
    .get()
    .join(' '));
}

function elementText($, element) {
  return normalizedText($(element).find('*').contents()
    .add($(element).contents())
    .filter((_, node) => node.type === 'text')
    .map((_, node) => node.data)
    .get()
    .join(' '));
}

export function extractClaimsFromHtml(bytes, { category, fields }) {
  if (!Array.isArray(fields) || !fields.length) throw new TypeError('requested evidence fields required');
  const $ = load(Buffer.from(bytes).toString('utf8'));
  const candidates = new Map(fields.map((field) => [field, []]));
  $('body *').not('script,style,noscript,template').each((_, element) => {
    if ($(element).closest('[hidden],[aria-hidden="true"],script,style,noscript,template').length) return;
    const label = elementOwnText($, element);
    if (!label) return;
    for (const field of fields) {
      const rule = evidenceFieldRules[field];
      if (!rule || !rule.label.test(label) || (rule.reject && rule.reject.test(label))) continue;
      const quote = element.tagName === 'dt'
        ? normalizedText(`${label} ${$(element).next('dd').first().text()}`)
        : elementText($, $(element).parent().get(0));
      try {
        candidates.get(field).push(claimFromEvidenceFragment(field, label, quote, { category }));
      } catch {
        // A matching label without an unambiguous value is not evidence.
      }
    }
  });
  const claims = [];
  for (const field of fields) {
    const unique = new Map(candidates.get(field).map((claim) => [`${JSON.stringify(claim.value)}\0${claim.quote}`, claim]));
    const values = new Set([...unique.values()].map((claim) => JSON.stringify(claim.value)));
    if (values.size > 1) throw new Error(`ambiguous extracted values for ${field}`);
    if (unique.size) claims.push([...unique.values()][0]);
  }
  return claims;
}

export function extractClaimsFromPdfText(extractedText, { caseIdentity, fields }) {
  if (!Array.isArray(fields) || !fields.length) throw new TypeError('requested evidence fields required');
  const candidates = new Map(fields.map((field) => [field, []]));
  const pages = String(extractedText ?? '').split('\f');
  pages.forEach((pageText, pageIndex) => {
    if (!containsExactModel(pageText, caseIdentity.model)) return;
    for (const rawLine of pageText.split(/\r?\n/)) {
      const quote = normalizedText(rawLine);
      if (!quote) continue;
      const label = quote.replace(/\s+[-+]?\d+(?:\.\d+)?\s*(?:mm|millimet(?:re|er)s?)?\s*$/i, '').trim();
      for (const field of fields) {
        const rule = evidenceFieldRules[field];
        if (!rule || !rule.label.test(label) || (rule.reject && rule.reject.test(label))) continue;
        try {
          candidates.get(field).push({
            ...claimFromEvidenceFragment(field, label, quote, { category: caseIdentity.category }),
            page: pageIndex + 1,
          });
        } catch {
          // Unscoped or ambiguous PDF rows are not evidence.
        }
      }
    }
  });
  const claims = [];
  for (const field of fields) {
    const fieldClaims = candidates.get(field);
    const values = new Set(fieldClaims.map((claim) => JSON.stringify(claim.value)));
    if (values.size > 1) throw new Error(`ambiguous extracted PDF values for ${field}`);
    if (fieldClaims.length) claims.push(fieldClaims[0]);
  }
  if (!claims.length) throw new Error('no exact-model PDF evidence extracted');
  return claims;
}

export function verifyAndAttestResolutionArtifact({ source, caseIdentity, bytes, extractedText = null, verifiedAt }) {
  const buffer = verifyBytes(source, bytes);
  let identityProof;
  if (source.contentType === 'text/html') {
    identityProof = htmlIdentitySignals(source, caseIdentity, buffer);
  } else if (source.contentType === 'application/pdf') {
    identityProof = pdfIdentitySignals(source, caseIdentity, extractedText);
  } else {
    throw new TypeError('unsupported artifact content type');
  }
  verifyQuotes(source, identityProof.text);
  validateClaimsSemantics(source.claims, caseIdentity);
  const attested = {
    ...source,
    identitySignals: identityProof.signals,
  };
  attested.verificationReceipt = createVerificationReceipt(attested, caseIdentity, { verifiedAt });
  return attested;
}

export function verifyAttestedResolutionArtifact({ source, caseIdentity, bytes, extractedText = null }) {
  const rebuilt = verifyAndAttestResolutionArtifact({
    source: { ...source, verificationReceipt: undefined },
    caseIdentity,
    bytes,
    extractedText,
    verifiedAt: source?.verificationReceipt?.verifiedAt,
  });
  if (rebuilt.verificationReceipt.bindingSha256 !== source?.verificationReceipt?.bindingSha256) {
    throw new Error('artifact attestation receipt mismatch');
  }
  return verifyVerificationReceipt(source, caseIdentity, { asOf: source.verificationReceipt.verifiedAt });
}
