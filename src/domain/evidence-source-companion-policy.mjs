const CLOSED_ENVELOPE_DIMENSION_FIELDS = Object.freeze([
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
]);

function normalizedToken(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function dimensionBinding(source) {
  const dimensions = new Map((source?.claims ?? [])
    .filter((claim) => CLOSED_ENVELOPE_DIMENSION_FIELDS.includes(claim.field))
    .map((claim) => [claim.field, claim.value]));
  if (dimensions.size !== CLOSED_ENVELOPE_DIMENSION_FIELDS.length) return null;
  return CLOSED_ENVELOPE_DIMENSION_FIELDS.map((field) => ({
    field,
    value: dimensions.get(field),
  }));
}

function isMieleRefrigeratorMaterialPdf(identity, source) {
  return normalizedToken(identity?.brand) === 'MIELE'
    && identity?.category === 'fridge'
    && source?.contentType === 'application/pdf'
    && source?.discoveryProvenance?.method === 'official_product_material';
}

function sameMaterialProvenance(identity, pdf, provenance) {
  const pdfProvenance = pdf?.discoveryProvenance;
  return provenance?.method === 'official_product_material'
    && provenance.discoveryUrl === pdfProvenance?.discoveryUrl
    && provenance.materialNumber === pdfProvenance?.materialNumber
    && normalizedToken(provenance.requestedModel) === normalizedToken(identity?.model);
}

function matchingProductPageSource(identity, pdf, source) {
  const provenance = source?.discoveryProvenance;
  return source?.contentType === 'text/html'
    && ['official_exact_model_product_page', 'official_model_variant_product_page']
      .includes(source.sourceType)
    && sameMaterialProvenance(identity, pdf, provenance)
    && provenance.artifactUrl === provenance.discoveryUrl
    && source.sourceUrl === provenance.discoveryUrl
    && source.finalUrl === provenance.discoveryUrl
    && source.contentSha256 === provenance.discoveryContentSha256
    && source.objectPath === provenance.discoveryObjectPath;
}

function matchingProductPageCandidate(identity, pdf, candidate) {
  const provenance = candidate?.discoveryProvenance;
  return candidate?.authorityMode === 'official'
    && candidate?.requiredAttempt === true
    && candidate?.sourceRole === 'manufacturer_product_page'
    && sameMaterialProvenance(identity, pdf, provenance)
    && provenance.artifactUrl === provenance.discoveryUrl
    && candidate.sourceUrl === provenance.discoveryUrl;
}

function candidateFailure(candidate) {
  const outcome = candidate?.outcome ?? {};
  const hasArtifact = Boolean(outcome.artifactBinding);
  if ((outcome.status === 'transport_failure' || outcome.failureCode === 'transport')
    && !hasArtifact) {
    return {
      kind: 'candidate_failure',
      status: 'retryable_failure',
      failureCode: 'transport',
      diagnostic: 'required Miele product page could not be acquired',
    };
  }
  if (outcome.status === 'identity_rejected'
    || outcome.failureCode === 'identity'
    || (hasArtifact && /identity|canonical source-model|product-page binding/i.test(outcome.reason ?? ''))) {
    return {
      kind: 'candidate_failure',
      status: 'identity_rejected',
      failureCode: 'identity',
      diagnostic: 'required Miele product page failed exact model or finish identity attestation',
    };
  }
  if (outcome.failureCode === 'payload') {
    return {
      kind: 'candidate_failure',
      status: 'terminal_failure',
      failureCode: 'payload',
      diagnostic: 'required Miele product page payload failed validation',
    };
  }
  return {
    kind: 'candidate_failure',
    status: 'claims_incomplete',
    failureCode: outcome.failureCode === 'claim_semantics' ? 'claim_semantics' : 'source_authority',
    diagnostic: 'required Miele product page did not yield attested dimension evidence',
  };
}

export function evaluateRequiredEvidenceCompanions({ identity, sources = [], candidates = [] }) {
  const materialPdfs = sources.filter((source) => (
    isMieleRefrigeratorMaterialPdf(identity, source)
  ));
  for (const pdf of materialPdfs) {
    const companion = sources.find((source) => matchingProductPageSource(identity, pdf, source));
    if (!companion) {
      const candidate = candidates.find((entry) => (
        matchingProductPageCandidate(identity, pdf, entry)
      ));
      if (candidate) return Object.freeze(candidateFailure(candidate));
      return Object.freeze({
        kind: 'missing',
        status: 'claims_incomplete',
        failureCode: 'source_authority',
        diagnostic: 'Miele refrigerator material PDF requires a same-material hash-bound official product page',
      });
    }
    const pdfDimensions = dimensionBinding(pdf);
    const pageDimensions = dimensionBinding(companion);
    if (!pdfDimensions || !pageDimensions) {
      return Object.freeze({
        kind: 'invalid',
        status: 'claims_incomplete',
        failureCode: 'claim_semantics',
        diagnostic: 'Miele refrigerator material PDF and product page must each attest all closed-envelope dimensions',
      });
    }
    const conflictingFields = CLOSED_ENVELOPE_DIMENSION_FIELDS.filter((field, index) => (
      !sameValue(pdfDimensions[index].value, pageDimensions[index].value)
    )).sort();
    if (conflictingFields.length) {
      return Object.freeze({
        kind: 'conflict',
        status: 'conflict_quarantined',
        failureCode: 'conflict',
        conflictingFields,
        diagnostic: 'Miele refrigerator product page and material PDF disagree on closed-envelope dimensions',
      });
    }
  }
  return null;
}
