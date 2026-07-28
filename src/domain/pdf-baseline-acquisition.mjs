import { createHash } from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/;
const CATEGORIES = Object.freeze(['dishwasher', 'dryer', 'fridge', 'washing_machine']);
const TERMINAL_ACQUISITION_STATUSES = new Set([
  'official_candidate_not_found',
  'identity_unproven',
  'transport_failed',
]);

function requiredText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function exactIdentity(value) {
  return requiredText(value, 'model identity').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function countBy(values) {
  const result = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function validateSampleIdentity(sample) {
  requiredText(sample?.sampleId, 'sample ID');
  requiredText(sample?.brand, 'sample brand');
  requiredText(sample?.model, 'sample model');
  requiredText(sample?.category, 'sample category');
  requiredText(sample?.sourceUrl, 'sample source URL');
  if (!CATEGORIES.includes(sample.category)) throw new TypeError(`unsupported sample category ${sample.category}`);
  const url = new URL(sample.sourceUrl);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new TypeError('sample source URL must be trusted HTTPS');
  }
}

function validateUniqueSamples(samples) {
  const sampleIds = new Set();
  const sourceUrls = new Set();
  for (const sample of samples) {
    validateSampleIdentity(sample);
    if (sampleIds.has(sample.sampleId)) throw new TypeError(`duplicate sample ID ${sample.sampleId}`);
    if (sourceUrls.has(sample.sourceUrl)) throw new TypeError(`duplicate sample source URL ${sample.sourceUrl}`);
    sampleIds.add(sample.sampleId);
    sourceUrls.add(sample.sourceUrl);
  }
}

export function validateFrozenPdfBaseline(baseline) {
  if (baseline?.schemaVersion !== 1) throw new TypeError('PDF failure baseline schema v1 required');
  if (baseline.baselineId !== 'pdf-failure-baseline-100-2026-07-27') {
    throw new TypeError('unexpected PDF failure baseline ID');
  }
  if (!Array.isArray(baseline.samples) || baseline.samples.length !== 100) {
    throw new TypeError('frozen PDF failure baseline must contain exactly 100 samples');
  }
  validateUniqueSamples(baseline.samples);
  const byCategory = countBy(baseline.samples.map(({ category }) => category));
  for (const category of CATEGORIES) {
    if (byCategory[category] !== 25) throw new TypeError(`frozen baseline category drift: ${category}`);
  }
  if (Object.keys(byCategory).length !== CATEGORIES.length) throw new TypeError('frozen baseline category set drift');
  if (baseline.samples.some(({ publicationEligible }) => publicationEligible !== false)) {
    throw new TypeError('frozen diagnostic baseline must remain publication isolated');
  }
  return baseline;
}

export function selectFrozenPdfBaselineSamples(samples, { sampleIds = [], limit = null } = {}) {
  if (!Array.isArray(samples) || samples.length === 0) throw new TypeError('frozen samples required');
  if (!Array.isArray(sampleIds)) throw new TypeError('sample IDs must be an array');
  if (sampleIds.length && limit != null) throw new TypeError('cannot combine sample IDs with limit');
  if (limit != null && (!Number.isInteger(limit) || limit < 1)) {
    throw new TypeError('sample limit must be a positive integer');
  }
  if (!sampleIds.length) return limit == null ? [...samples] : samples.slice(0, limit);

  const requested = new Set();
  for (const value of sampleIds) {
    const sampleId = requiredText(value, 'sample ID');
    if (requested.has(sampleId)) throw new TypeError(`duplicate sample ID ${sampleId}`);
    requested.add(sampleId);
  }
  const known = new Set(samples.map(({ sampleId }) => sampleId));
  const unknown = [...requested].filter((sampleId) => !known.has(sampleId));
  if (unknown.length) throw new TypeError(`unknown sample ID: ${unknown.sort().join(', ')}`);
  return samples.filter(({ sampleId }) => requested.has(sampleId));
}

function exactCandidateIdentity(sample, candidate) {
  const target = exactIdentity(sample.model);
  if (!candidate?.sourceModelHint || exactIdentity(candidate.sourceModelHint) !== target) return false;
  const provenance = candidate.discoveryProvenance;
  if (provenance?.requestedModel && exactIdentity(provenance.requestedModel) !== target) return false;
  if (provenance?.matchedModel && exactIdentity(provenance.matchedModel) !== target) return false;
  if (provenance?.market && String(provenance.market).trim().toUpperCase() !== 'AU') return false;
  return true;
}

export function selectExactOfficialPdfCandidates(sample, candidates) {
  validateSampleIdentity(sample);
  if (!Array.isArray(candidates)) throw new TypeError('candidate list required');
  const seen = new Set();
  const selected = [];
  for (const candidate of candidates) {
    if (candidate?.authorityMode !== 'official'
      || candidate?.sourceRole !== 'manufacturer_document'
      || candidate?.documentType === 'product_page'
      || !exactCandidateIdentity(sample, candidate)) continue;
    let url;
    try { url = new URL(candidate.sourceUrl); } catch { continue; }
    if (url.protocol !== 'https:' || url.username || url.password) continue;
    const normalized = url.toString();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    selected.push(candidate);
  }
  return selected;
}

export function pdfObjectPath(contentSha256) {
  const hash = requiredText(contentSha256, 'PDF SHA-256');
  if (!SHA256.test(hash)) throw new TypeError('PDF SHA-256 invalid');
  return `evidence/web/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.pdf`;
}

function acquisitionFailure(attempt) {
  const status = requiredText(attempt?.status, 'attempt status');
  const codes = {
    official_candidate_not_found: 'official_candidate_not_found',
    identity_unproven: 'official_candidate_identity_unproven',
    transport_failed: 'official_pdf_transport_failed',
  };
  return {
    layer: 1,
    id: 'acquisition',
    status: 'failed',
    code: codes[status] ?? 'official_pdf_not_acquired',
    detail: attempt?.reason ?? `WP7A ended with ${status}.`,
  };
}

function successfulTrace(attempt) {
  if (!SHA256.test(attempt.contentSha256 ?? '')) throw new TypeError('successful attempt PDF SHA-256 invalid');
  if (attempt.objectPath !== pdfObjectPath(attempt.contentSha256)) {
    throw new TypeError('successful attempt PDF object path mismatch');
  }
  const trace = [
    {
      layer: 1,
      id: 'acquisition',
      status: 'passed',
      code: 'official_pdf_content_addressed',
      detail: 'An exact-model official PDF passed transport validation and immutable storage checks.',
    },
    {
      layer: 2,
      id: 'pdf_integrity_rendering',
      status: 'passed',
      code: 'official_pdf_integrity_valid',
      detail: 'PDF magic bytes, byte limits, source hash and object path are valid.',
    },
  ];
  if (attempt.status !== 'indexed') {
    trace.push({
      layer: 3,
      id: 'mineru_structure',
      status: 'failed',
      code: 'mineru_content_list_v2_failed',
      detail: attempt.reason ?? 'MinerU did not produce a policy-compatible content_list_v2 artifact.',
    });
    return trace;
  }
  const derived = attempt.derivedArtifact;
  if (derived?.format !== 'content_list_v2'
    || derived.sourcePdfSha256 !== attempt.contentSha256
    || !SHA256.test(derived.contentSha256 ?? '')) {
    throw new TypeError('indexed attempt MinerU binding invalid');
  }
  trace.push(
    {
      layer: 3,
      id: 'mineru_structure',
      status: 'passed',
      code: 'mineru_content_list_v2_indexed',
      detail: 'A policy-compatible MinerU content_list_v2 artifact is hash-bound to the official PDF.',
    },
    {
      layer: 4,
      id: 'page_table_association',
      status: 'failed',
      code: 'page_table_association_unproven',
      detail: 'WP7A acquires and indexes evidence but does not infer document-family table relationships.',
    },
  );
  return trace;
}

function traceForAttempt(attempt) {
  if (TERMINAL_ACQUISITION_STATUSES.has(attempt.status)) return [acquisitionFailure(attempt)];
  if (attempt.status === 'acquired' || attempt.status === 'mineru_failed' || attempt.status === 'indexed') {
    return successfulTrace(attempt);
  }
  throw new TypeError(`unsupported WP7A attempt status ${attempt.status ?? 'missing'}`);
}

export function buildWp7aBaselineRerun(frozenBaseline, attempts, options = {}) {
  if (!Array.isArray(frozenBaseline?.samples) || !frozenBaseline.samples.length) {
    throw new TypeError('frozen baseline samples required');
  }
  validateUniqueSamples(frozenBaseline.samples);
  if (!SHA256.test(options.baselineSha256 ?? '')) throw new TypeError('baseline SHA-256 invalid');
  const builtOn = requiredText(options.builtOn, 'rerun build date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(builtOn)) throw new TypeError('rerun build date invalid');
  const samplesById = new Map(frozenBaseline.samples.map((entry) => [entry.sampleId, entry]));
  const attemptsById = new Map();
  for (const attempt of attempts ?? []) {
    if (!samplesById.has(attempt?.sampleId)) throw new TypeError(`unknown sample in WP7A attempts: ${attempt?.sampleId}`);
    if (attemptsById.has(attempt.sampleId)) throw new TypeError(`duplicate WP7A attempt: ${attempt.sampleId}`);
    attemptsById.set(attempt.sampleId, attempt);
  }
  if (attemptsById.size !== frozenBaseline.samples.length) {
    throw new TypeError('WP7A rerun requires one terminal attempt per frozen sample');
  }

  const samples = frozenBaseline.samples.map((entry) => {
    const attempt = attemptsById.get(entry.sampleId);
    const pipelineTrace = traceForAttempt(attempt);
    const primaryFailure = pipelineTrace.at(-1);
    const acquisition = {
      status: attempt.status,
      ...(attempt.officialSourceUrl ? { officialSourceUrl: attempt.officialSourceUrl } : {}),
      ...(attempt.finalUrl ? { finalUrl: attempt.finalUrl } : {}),
      ...(attempt.redirectChain ? { redirectChain: structuredClone(attempt.redirectChain) } : {}),
      ...(attempt.transport ? { transport: attempt.transport } : {}),
      ...(attempt.documentType ? { documentType: attempt.documentType } : {}),
      ...(attempt.discoveryMethod ? { discoveryMethod: attempt.discoveryMethod } : {}),
      ...(attempt.discoveryProvenance ? {
        discoveryProvenance: structuredClone(attempt.discoveryProvenance),
      } : {}),
      ...(attempt.contentSha256 ? {
        contentSha256: attempt.contentSha256,
        objectPath: attempt.objectPath,
        byteSize: attempt.byteSize,
      } : {}),
      ...(attempt.derivedArtifact ? { derivedArtifact: structuredClone(attempt.derivedArtifact) } : {}),
      ...(attempt.reason ? { reason: attempt.reason } : {}),
    };
    return {
      ...structuredClone(entry),
      sourcePdfSha256: attempt.contentSha256 ?? entry.sourcePdfSha256 ?? null,
      acquisition,
      pipelineTrace,
      primaryFailure: {
        layer: primaryFailure.layer,
        id: primaryFailure.id,
        code: primaryFailure.code,
        detail: primaryFailure.detail,
      },
      secondaryCauses: attempt.secondaryCauses ?? [],
    };
  });
  const byStatus = countBy(samples.map(({ acquisition }) => acquisition.status));
  const byPrimaryLayer = countBy(samples.map(({ primaryFailure }) => primaryFailure.id));
  return Object.freeze({
    schemaVersion: 1,
    baselineId: `${frozenBaseline.baselineId}-wp7a-rerun`,
    builtOn,
    sourceBaselineId: frozenBaseline.baselineId,
    sourceBaselineSha256: options.baselineSha256,
    selection: {
      frozen: true,
      sampleCount: samples.length,
      sampleIds: samples.map(({ sampleId }) => sampleId),
      selectionSha256: sha256(samples.map(({ sampleId }) => sampleId).join('\n')),
    },
    summary: {
      total: samples.length,
      byCategory: countBy(samples.map(({ category }) => category)),
      byAcquisitionStatus: byStatus,
      byPrimaryLayer,
      officialPdfsAcquired: samples.filter(({ acquisition }) => acquisition.contentSha256).length,
      mineruIndexedObjects: samples.filter(({ acquisition }) => acquisition.status === 'indexed').length,
      publicationEligible: samples.filter(({ publicationEligible }) => publicationEligible).length,
    },
    samples,
  });
}
