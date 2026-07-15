import { createHash } from 'node:crypto';
import { load } from 'cheerio';

import {
  claimFromEvidenceFragment,
  claimsFromExplicitDimensionSequence,
  containsExactModel,
  containsExactModelDocumentUrl,
  evidenceFieldRules,
  validateClaimsSemantics,
} from './evidence-claim-semantics.mjs';
import { validateDimensionEvidenceClaimsV2 } from './dimension-evidence-claim.mjs';
import {
  createVerificationReceipt,
  currentMineruEvidenceProfile,
  verificationReceiptDiscoveryPolicyVersion,
  verificationReceiptManufacturerPolicyVersion,
  verifyVerificationReceipt,
} from './evidence-source-verifier.mjs';
import {
  extractMineruIdentitySignals,
  findMineruImageOnlyDimensionPages,
  inspectMineruContentListV2,
  parseMineruContentListV2,
} from './mineru-document.mjs';
import { verifyOfficialProductPageDiscoveryEvidence } from './official-product-page-discovery-evidence.mjs';
import {
  officialMarketApiBoundExactCoverModel,
  officialMarketApiBoundFamilyModel,
  officialMarketApiBoundSeriesModel,
  officialMarketApiDimensions,
  verifyOfficialMarketApiDiscoveryEvidence,
} from './official-market-api-discovery-evidence.mjs';

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

function identifier(value) {
  return normalizedText(value).toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function modelWithNumericProductId(value, model) {
  const parts = normalizedText(model).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  if (!parts.length) return false;
  const escaped = parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[-_/.\\s]*');
  return new RegExp(`(?:^|[^A-Z0-9])${escaped}[-_]\\d{4,10}$`, 'i').test(value);
}

function urlHasExactModelSegment(value, model, base = undefined) {
  try {
    return new URL(value, base).pathname.split('/').filter(Boolean).some((segment) => {
      const decoded = decodeURIComponent(segment).replace(/\.(?:pdf|html?)$/i, '');
      return containsExactModel(decoded, model) || modelWithNumericProductId(decoded, model);
    });
  } catch {
    return false;
  }
}

function structuredProductModel($, model, canonical) {
  const target = identifier(model);
  let matched = null;
  $('script').each((_, element) => {
    if (matched) return;
    const raw = String($(element).html() ?? '').trim();
    if (!raw || raw.length > 5_000_000 || !/^[{[]/.test(raw)) return;
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return; }
    const queue = [{ value: parsed, depth: 0 }];
    let visited = 0;
    while (queue.length && !matched && visited < 100_000) {
      const { value, depth } = queue.shift();
      visited += 1;
      if (!value || typeof value !== 'object' || depth > 20) continue;
      if (!Array.isArray(value)) {
        const modelValue = ['code', 'model', 'modelCode', 'productCode', 'sku']
          .map((key) => value[key]).find((candidate) => identifier(candidate) === target);
        const productUrl = ['url', '@id', 'canonicalUrl']
          .map((key) => value[key]).find((candidate) => urlHasExactModelSegment(candidate, model, canonical));
        if (modelValue && productUrl) {
          matched = normalizedText(modelValue);
          break;
        }
      }
      for (const child of Object.values(value)) {
        if (child && typeof child === 'object') queue.push({ value: child, depth: depth + 1 });
      }
    }
  });
  return matched;
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
    'data-pim-model-name',
  ];
  const skuAttributes = ['data-modelcode', 'data-model-code', 'data-shop-sku', 'data-bv-product-id'];
  let productModel = null;
  for (const attribute of attributes) {
    $(`[${attribute}]`).each((_, element) => {
      const value = $(element).attr(attribute);
      if (!productModel && containsExactModel(value, caseIdentity.model)) productModel = value;
    });
  }
  const structuredModel = structuredProductModel($, caseIdentity.model, canonical);
  let canonicalRegionalSku = null;
  const canonicalModels = new Map();
  for (const attribute of skuAttributes) {
    $(`[${attribute}]`).each((_, element) => {
      const value = normalizedText($(element).attr(attribute));
      const normalizedModel = normalizedText(caseIdentity.model).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const normalizedSku = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const suffix = normalizedSku.slice(normalizedModel.length);
      if (urlHasExactModelSegment(canonical, value)) canonicalModels.set(normalizedSku, value);
      if (!canonicalRegionalSku && normalizedSku.startsWith(normalizedModel)
        && /^[A-Z0-9]{1,4}$/.test(suffix) && urlHasExactModelSegment(canonical, value)) {
        canonicalRegionalSku = value;
      }
    });
  }
  const text = $.root().find('*').contents()
    .filter((_, node) => node.type === 'text')
    .map((_, node) => normalizedText(node.data))
    .get()
    .filter(Boolean)
    .join(' ');
  if (urlHasExactModelSegment(canonical, caseIdentity.model) || canonicalRegionalSku) {
    if (canonicalRegionalSku) signals.push({ type: 'canonical_regional_sku', value: canonicalRegionalSku });
    if (productModel) signals.push({ type: 'product_model', value: productModel });
    if (structuredModel) signals.push({ type: 'structured_product_model', value: structuredModel });
    if (!productModel && !structuredModel) throw new Error('exact product model identity signal missing');
    return { signals, text: normalizedText(text), identity: {
      brand: caseIdentity.brand, model: caseIdentity.model, outcome: 'exact',
    } };
  }

  const target = identifier(caseIdentity.model);
  const sourceModels = [...canonicalModels.entries()]
    .filter(([key]) => key !== target && !key.startsWith(target) && !target.startsWith(key));
  if (containsExactModel(title, caseIdentity.model) && sourceModels.length === 1) {
    const [sourceKey, sourceModel] = sourceModels[0];
    const binding = $('meta[name="description"],meta[property="description"],meta[property="og:description"],meta[name="twitter:description"]')
      .map((_, element) => normalizedText($(element).attr('content'))).get()
      .find((value) => containsExactModel(value, caseIdentity.model)
        && containsExactModel(value, sourceModel) && identifier(sourceModel) === sourceKey);
    if (binding) {
      signals.push({ type: 'canonical_source_model', value: sourceModel });
      signals.push({ type: 'official_alias_binding', value: binding });
      return { signals, text: normalizedText(text), identity: {
        brand: caseIdentity.brand,
        model: caseIdentity.model,
        outcome: 'official_marketing_alias',
        sourceModel,
      } };
    }
  }
  throw new Error('canonical URL does not prove exact model or a strict official marketing alias');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function pdfIdentitySignals(
  source,
  caseIdentity,
  derivedArtifactBytes,
  claimSemanticsVersion = 1,
  fallbackTriggerArtifactBytes = null,
  discoveryArtifactBytes = null,
) {
  if (!derivedArtifactBytes) throw new TypeError('MinerU JSON derived artifact required for PDF evidence');
  const derived = source?.derivedArtifact;
  try {
    currentMineruEvidenceProfile(derived);
  } catch {
    throw new TypeError('valid MinerU JSON derived artifact metadata required');
  }
  let fallbackIdentitySignals = [];
  if (derived.fallbackTrigger) {
    if (!fallbackTriggerArtifactBytes) throw new TypeError('MinerU fallback trigger artifact required');
    const triggerBytes = Buffer.from(fallbackTriggerArtifactBytes);
    const triggerHash = createHash('sha256').update(triggerBytes).digest('hex');
    if (triggerHash !== derived.fallbackTrigger.contentSha256) {
      throw new Error('MinerU fallback trigger artifact hash mismatch');
    }
    const detectedPages = [...findMineruImageOnlyDimensionPages(triggerBytes)];
    if (JSON.stringify(detectedPages) !== JSON.stringify(derived.fallbackTrigger.pages)) {
      throw new Error('MinerU fallback trigger pages do not replay');
    }
    const triggerInspection = inspectMineruContentListV2(triggerBytes);
    if (derived.sourcePageCount != null && triggerInspection.pageCount !== derived.sourcePageCount) {
      throw new Error('MinerU fallback trigger source page count mismatch');
    }
    fallbackIdentitySignals = [...extractMineruIdentitySignals(triggerBytes, caseIdentity.model)];
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
  const boundFamilyModel = officialMarketApiBoundFamilyModel(
    source?.discoveryProvenance,
    caseIdentity,
    discoveryArtifactBytes,
    bytes,
  );
  const boundSeriesModel = officialMarketApiBoundSeriesModel(
    source?.discoveryProvenance,
    caseIdentity,
    discoveryArtifactBytes,
    bytes,
  );
  const boundExactCoverModel = officialMarketApiBoundExactCoverModel(
    source?.discoveryProvenance,
    caseIdentity,
    discoveryArtifactBytes,
    bytes,
  );
  const selectedBoundFamilyModel = boundExactCoverModel || boundSeriesModel ? null : boundFamilyModel;
  const parsed = parseMineruContentListV2(bytes, {
    pdfSha256: source.contentSha256,
    parserVersion: derived.parserVersion,
    modelRevision: derived.modelRevision,
    caseIdentity,
    claimSemanticsVersion,
    fields: (source.claims ?? []).map((claim) => claim.field),
    sourceUrls: [source.sourceUrl, source.finalUrl].filter(Boolean),
    ...(selectedBoundFamilyModel ? { boundFamilyModel: selectedBoundFamilyModel } : {}),
    ...(boundSeriesModel ? { boundSeriesModel } : {}),
    ...(boundExactCoverModel ? { boundExactCoverModel } : {}),
    ...(derived.fallbackTrigger ? {
      identityContextJsonBytes: fallbackTriggerArtifactBytes,
      identityContextContentSha256: derived.fallbackTrigger.contentSha256,
    } : {}),
  });
  if (boundSeriesModel || boundExactCoverModel) {
    const payload = JSON.parse(Buffer.from(discoveryArtifactBytes).toString('utf8'));
    const pim = officialMarketApiDimensions(payload, caseIdentity);
    const fields = new Map(parsed.claims.map((claim) => [claim.field, claim.value]));
    const expected = new Map([
      ['closedEnvelope.widthMm', pim.widthMm],
      ['closedEnvelope.heightMm', pim.heightMm],
      ['closedEnvelope.depthMm', pim.depthMm],
    ]);
    for (const [field, mm] of expected) {
      const value = fields.get(field);
      const matches = value?.kind === 'fixed'
        ? value.mm === mm
        : value?.kind === 'range' && (value.minMm === mm || value.maxMm === mm);
      if (!matches) {
        throw new Error('API-bound manual claims do not match exact PIM dimensions');
      }
    }
  }
  if (parsed.pageCount !== derived.pageCount) throw new Error('MinerU JSON page count mismatch');
  if (JSON.stringify(canonicalize(parsed.claims)) !== JSON.stringify(canonicalize(source.claims))) {
    throw new Error('source claims do not match replayed MinerU JSON claims');
  }
  const signals = [...new Map([
    ...parsed.identitySignals,
    ...fallbackIdentitySignals,
  ].map((signal) => [`${signal.type}\0${signal.value}`, signal])).values()];
  const exactModelUrl = [...new Set([source.sourceUrl, source.finalUrl])]
    .find((value) => containsExactModelDocumentUrl(value, caseIdentity.model));
  if (exactModelUrl) signals.push({ type: 'pdf_source_url_model', value: exactModelUrl });
  return { signals, text: parsed.documentText };
}

function officialProductPageIdentitySignal(source, caseIdentity, discoveryArtifactBytes) {
  const provenance = source?.discoveryProvenance;
  if (provenance?.method !== 'official_product_page') return null;
  verifyOfficialProductPageDiscoveryEvidence(provenance, caseIdentity, discoveryArtifactBytes);
  return {
    type: 'official_product_page_model',
    value: `${caseIdentity.model}:${provenance.discoveryContentSha256}:${provenance.discoveryUrl}`,
  };
}

function officialMarketApiIdentitySignals(source, caseIdentity, discoveryArtifactBytes) {
  const provenance = source?.discoveryProvenance;
  if (provenance?.method !== 'official_market_api' || !provenance.discoveryContentSha256) return [];
  verifyOfficialMarketApiDiscoveryEvidence(provenance, caseIdentity, discoveryArtifactBytes);
  const signals = [{
    type: 'official_market_api_model',
    value: `${caseIdentity.model}:${provenance.discoveryContentSha256}:${provenance.discoveryUrl}`,
  }];
  const payload = JSON.parse(Buffer.from(discoveryArtifactBytes).toString('utf8'));
  const dimensions = officialMarketApiDimensions(payload, caseIdentity);
  if (dimensions) signals.push({
    type: 'official_market_api_dimensions',
    value: `${caseIdentity.model}:${dimensions.widthMm}x${dimensions.heightMm}x${dimensions.depthMm}:${provenance.discoveryContentSha256}`,
  });
  return signals;
}

function verifyQuotes(source, text) {
  const normalized = normalizedText(text).toLowerCase();
  for (const claim of source.claims ?? []) {
    const evidenceText = claim.quote ?? claim.sourceLabel;
    if (!normalized.includes(normalizedText(evidenceText).toLowerCase())) {
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

function groupedDimensionLabel(label) {
  const normalized = normalizedText(label);
  if (/\b(?:dimension|dimensions|size)\b/i.test(normalized)) return normalized;
  if (/^(?:unit|product|appliance)\s*\(\s*[whd]\s*[x×/*]\s*[whd]\s*[x×/*]\s*[whd]\s*\)$/i.test(normalized)) {
    return normalized.replace(/^([^()]+)(?=\s*\()/, '$1 dimensions');
  }
  return null;
}

function groupedDimensionValue(value) {
  return normalizedText(value).replace(/(\d)(mm|cm)\b/gi, '$1 $2');
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
      const dimensionLabel = groupedDimensionLabel(label);
      if (dimensionLabel) {
        const grouped = claimsFromExplicitDimensionSequence({
          label: dimensionLabel, value: groupedDimensionValue(value), quote,
        }, { category }, fields);
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
    const quote = element.tagName === 'dt'
      ? normalizedText(`${label} ${$(element).next('dd').first().text()}`)
      : elementText($, $(element).parent().get(0));
    const dimensionLabel = groupedDimensionLabel(label);
    if (dimensionLabel && quote.length <= 500) {
      const labelIndex = quote.indexOf(label);
      const value = labelIndex < 0
        ? ''
        : normalizedText(`${quote.slice(0, labelIndex)} ${quote.slice(labelIndex + label.length)}`);
      const grouped = claimsFromExplicitDimensionSequence({
        label: dimensionLabel, value: groupedDimensionValue(value), quote,
      }, { category }, fields);
      grouped.forEach((claim) => structuredCandidates.get(claim.field)?.push(claim));
    }
    for (const field of fields) {
      const rule = evidenceFieldRules[field];
      if (!rule || !rule.label.test(label) || (rule.reject && rule.reject.test(label))) continue;
      try {
        candidates.get(field).push(claimFromEvidenceFragment(field, label, quote, { category }));
      } catch {
        // A matching label without an unambiguous value is not evidence.
      }
    }
  });
  const claims = [];
  for (const field of fields) {
    let preferred = structuredCandidates.get(field).length ? structuredCandidates.get(field) : candidates.get(field);
    if (field === 'closedEnvelope.depthMm') {
      const explicitlyClosed = preferred.filter((claim) => (
        /\bdoors?\s+closed\b|\bclosed\s+doors?\b/i.test(claim.label ?? '')
      ));
      if (explicitlyClosed.length) preferred = explicitlyClosed;
    }
    const unique = new Map(preferred.map((claim) => [`${JSON.stringify(claim.value)}\0${claim.quote}`, claim]));
    const values = new Set([...unique.values()].map((claim) => JSON.stringify(claim.value)));
    if (values.size > 1) throw new Error(`ambiguous extracted values for ${field}`);
    if (unique.size) claims.push([...unique.values()][0]);
  }
  return claims;
}

export function verifyAndAttestResolutionArtifact({
  source, caseIdentity, bytes, derivedArtifactBytes = null, fallbackTriggerArtifactBytes = null,
  discoveryArtifactBytes = null, verifiedAt,
  claimSemanticsVersion = 1, discoveryPolicyVersion = undefined,
  manufacturerPolicyVersion = undefined,
  includeOfficialProductPageIdentitySignal = true,
  includeOfficialMarketApiIdentitySignal = true,
}) {
  const buffer = verifyBytes(source, bytes);
  let identityProof;
  if (source.contentType === 'text/html') {
    identityProof = htmlIdentitySignals(source, caseIdentity, buffer);
  } else if (source.contentType === 'application/pdf') {
    identityProof = pdfIdentitySignals(
      source,
      caseIdentity,
      derivedArtifactBytes,
      claimSemanticsVersion,
      fallbackTriggerArtifactBytes,
      discoveryArtifactBytes,
    );
    const discoverySignal = includeOfficialProductPageIdentitySignal
      ? officialProductPageIdentitySignal(source, caseIdentity, discoveryArtifactBytes)
      : null;
    if (discoverySignal) {
      identityProof = {
        ...identityProof,
        signals: [...identityProof.signals, discoverySignal],
      };
    }
    const marketApiSignals = includeOfficialMarketApiIdentitySignal
      ? officialMarketApiIdentitySignals(source, caseIdentity, discoveryArtifactBytes)
      : [];
    if (marketApiSignals.length) {
      identityProof = {
        ...identityProof,
        signals: [...identityProof.signals, ...marketApiSignals],
      };
    }
  } else {
    throw new TypeError('unsupported artifact content type');
  }
  // V2 PDF claims are reproduced from hash-bound MinerU fragments; sourceLabel is semantic, not verbatim text.
  if (!(source.contentType === 'application/pdf' && claimSemanticsVersion === 2)) {
    verifyQuotes(source, identityProof.text);
  }
  if (claimSemanticsVersion === 2) validateDimensionEvidenceClaimsV2(source.claims);
  else validateClaimsSemantics(source.claims, caseIdentity);
  const attested = {
    ...source,
    identity: identityProof.identity ?? source.identity,
    identitySignals: identityProof.signals,
  };
  attested.verificationReceipt = createVerificationReceipt(attested, caseIdentity, {
    verifiedAt,
    claimSemanticsVersion,
    discoveryArtifactBytes,
    discoveryPolicyVersion,
    manufacturerPolicyVersion,
  });
  return attested;
}

export function verifyAttestedResolutionArtifact({
  source, caseIdentity, bytes, derivedArtifactBytes = null, fallbackTriggerArtifactBytes = null,
  discoveryArtifactBytes = null,
}) {
  const claimSemanticsVersion = source?.verificationReceipt?.claimSemanticsVersion ?? 1;
  verifyVerificationReceipt(source, caseIdentity, {
    asOf: source.verificationReceipt.verifiedAt,
    discoveryArtifactBytes,
  });
  const discoveryPolicyVersion = verificationReceiptDiscoveryPolicyVersion(source, caseIdentity);
  const manufacturerPolicyVersion = verificationReceiptManufacturerPolicyVersion(source);
  const rebuilt = verifyAndAttestResolutionArtifact({
    source: { ...source, verificationReceipt: undefined },
    caseIdentity,
    bytes,
    derivedArtifactBytes,
    fallbackTriggerArtifactBytes,
    discoveryArtifactBytes,
    verifiedAt: source?.verificationReceipt?.verifiedAt,
    claimSemanticsVersion,
    discoveryPolicyVersion: discoveryPolicyVersion ?? undefined,
    manufacturerPolicyVersion,
    includeOfficialProductPageIdentitySignal: (source.identitySignals ?? [])
      .some((signal) => signal?.type === 'official_product_page_model'),
    includeOfficialMarketApiIdentitySignal: (source.identitySignals ?? [])
      .some((signal) => signal?.type === 'official_market_api_model'),
  });
  if (rebuilt.verificationReceipt.bindingSha256 !== source?.verificationReceipt?.bindingSha256) {
    throw new Error('artifact attestation receipt mismatch');
  }
  return true;
}
