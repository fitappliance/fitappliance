import { createHash } from 'node:crypto';
import { load } from 'cheerio';

import {
  claimFromEvidenceFragment,
  claimsFromExplicitDimensionSequence,
  containsExactModel,
  evidenceFieldRules,
  validateClaimsSemantics,
} from './evidence-claim-semantics.mjs';
import { createVerificationReceipt, verifyVerificationReceipt } from './evidence-source-verifier.mjs';
import { parseMineruContentListV2 } from './mineru-document.mjs';

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
  if (!canonical || resourceKey(canonical) !== resourceKey(source.finalUrl)) {
    throw new Error('canonical model URL does not match the acquired product resource');
  }
  const signals = [{ type: 'canonical_url', value: canonical }];
  const title = normalizedText($('title').first().text());
  if (containsExactModel(title, caseIdentity.model)) signals.push({ type: 'document_title', value: title });
  const attributes = [
    'data-item-model', 'data-product-model', 'data-product-id', 'data-ga4-product-id',
    'datalayer-product-id', 'datalayer-origin-productmodelid',
    'data-modelname', 'data-model-name', 'data-sku', 'data-pim-sku',
  ];
  const skuAttributes = ['data-modelcode', 'data-model-code', 'data-shop-sku', 'data-bv-product-id'];
  let productModel = null;
  for (const attribute of attributes) {
    $(`[${attribute}]`).each((_, element) => {
      const value = $(element).attr(attribute);
      if (!productModel && containsExactModel(value, caseIdentity.model)) productModel = value;
    });
  }
  const canonicalPath = new URL(canonical).pathname;
  let canonicalRegionalSku = null;
  for (const attribute of skuAttributes) {
    $(`[${attribute}]`).each((_, element) => {
      const value = normalizedText($(element).attr(attribute));
      const normalizedModel = normalizedText(caseIdentity.model).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const normalizedSku = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const suffix = normalizedSku.slice(normalizedModel.length);
      if (!canonicalRegionalSku && normalizedSku.startsWith(normalizedModel)
        && /^[A-Z0-9]{1,4}$/.test(suffix) && containsExactModel(canonicalPath, value)) {
        canonicalRegionalSku = value;
      }
    });
  }
  if (!containsExactModel(canonicalPath, caseIdentity.model) && !canonicalRegionalSku) {
    throw new Error('canonical URL does not prove exact model or a page-declared regional SKU');
  }
  if (canonicalRegionalSku) signals.push({ type: 'canonical_regional_sku', value: canonicalRegionalSku });
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

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function pdfIdentitySignals(source, caseIdentity, derivedArtifactBytes) {
  if (!derivedArtifactBytes) throw new TypeError('MinerU JSON derived artifact required for PDF evidence');
  const derived = source?.derivedArtifact;
  if (!derived || derived.schemaVersion !== 1 || derived.format !== 'content_list_v2'
    || derived.parserName !== 'MinerU' || derived.backend !== 'pipeline'
    || derived.method !== 'auto' || derived.tableEnabled !== true || derived.formulaEnabled !== false) {
    throw new TypeError('valid MinerU JSON derived artifact metadata required');
  }
  const bytes = Buffer.from(derivedArtifactBytes);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== derived.contentSha256) throw new Error('MinerU JSON hash mismatch');
  if (bytes.length !== derived.byteSize) throw new Error('MinerU JSON byte size mismatch');
  if (derived.sourcePdfSha256 !== source.contentSha256) throw new Error('MinerU JSON is not bound to source PDF');
  const expectedPrefix = `evidence/derived/mineru-json/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/`;
  if (typeof derived.objectPath !== 'string' || !derived.objectPath.startsWith(expectedPrefix)
    || !derived.objectPath.endsWith(`/${hash}.json`)) {
    throw new TypeError('content-addressed MinerU JSON object path required');
  }
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256: source.contentSha256,
    parserVersion: derived.parserVersion,
    modelRevision: derived.modelRevision,
    caseIdentity,
    fields: (source.claims ?? []).map((claim) => claim.field),
  });
  if (parsed.pageCount !== derived.pageCount) throw new Error('MinerU JSON page count mismatch');
  if (JSON.stringify(canonicalize(parsed.claims)) !== JSON.stringify(canonicalize(source.claims))) {
    throw new Error('source claims do not match replayed MinerU JSON claims');
  }
  const signals = [...parsed.identitySignals];
  const exactModelUrl = [...new Set([source.sourceUrl, source.finalUrl])].find((value) => {
    try {
      return containsExactModel(new URL(value).pathname, caseIdentity.model);
    } catch {
      return false;
    }
  });
  if (exactModelUrl) signals.push({ type: 'pdf_source_url_model', value: exactModelUrl });
  return { signals, text: parsed.documentText };
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
  const structuredCandidates = new Map(fields.map((field) => [field, []]));
  $('body li, body [role="listitem"], body tr').each((_, row) => {
    if ($(row).closest('[hidden],[aria-hidden="true"],script,style,noscript,template').length) return;
    const rowText = elementText($, row);
    if (!rowText) return;
    $(row).find('*').addBack().each((__, element) => {
      const label = elementOwnText($, element);
      if (!label || $(element).closest('li,[role="listitem"],tr').get(0) !== row) return;
      const labelIndex = rowText.indexOf(label);
      if (labelIndex < 0) return;
      const value = normalizedText(`${rowText.slice(0, labelIndex)} ${rowText.slice(labelIndex + label.length)}`);
      if (!value) return;
      const quote = normalizedText(`${label} ${value}`);
      if (/\b(?:dimension|dimensions|size)\b/i.test(label)) {
        const grouped = claimsFromExplicitDimensionSequence({ label, value, quote }, { category }, fields);
        grouped.forEach((claim) => structuredCandidates.get(claim.field)?.push(claim));
      }
      for (const field of fields) {
        const rule = evidenceFieldRules[field];
        if (!rule || !rule.label.test(label) || (rule.reject && rule.reject.test(label))) continue;
        try {
          structuredCandidates.get(field).push(claimFromEvidenceFragment(field, label, quote, { category }));
        } catch {
          // The row must contain exactly one semantically valid value for this label.
        }
      }
    });
  });
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
    const preferred = structuredCandidates.get(field).length ? structuredCandidates.get(field) : candidates.get(field);
    const unique = new Map(preferred.map((claim) => [`${JSON.stringify(claim.value)}\0${claim.quote}`, claim]));
    const values = new Set([...unique.values()].map((claim) => JSON.stringify(claim.value)));
    if (values.size > 1) throw new Error(`ambiguous extracted values for ${field}`);
    if (unique.size) claims.push([...unique.values()][0]);
  }
  return claims;
}

export function verifyAndAttestResolutionArtifact({
  source, caseIdentity, bytes, derivedArtifactBytes = null, verifiedAt,
}) {
  const buffer = verifyBytes(source, bytes);
  let identityProof;
  if (source.contentType === 'text/html') {
    identityProof = htmlIdentitySignals(source, caseIdentity, buffer);
  } else if (source.contentType === 'application/pdf') {
    identityProof = pdfIdentitySignals(source, caseIdentity, derivedArtifactBytes);
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

export function verifyAttestedResolutionArtifact({ source, caseIdentity, bytes, derivedArtifactBytes = null }) {
  const rebuilt = verifyAndAttestResolutionArtifact({
    source: { ...source, verificationReceipt: undefined },
    caseIdentity,
    bytes,
    derivedArtifactBytes,
    verifiedAt: source?.verificationReceipt?.verifiedAt,
  });
  if (rebuilt.verificationReceipt.bindingSha256 !== source?.verificationReceipt?.bindingSha256) {
    throw new Error('artifact attestation receipt mismatch');
  }
  return verifyVerificationReceipt(source, caseIdentity, { asOf: source.verificationReceipt.verifiedAt });
}
