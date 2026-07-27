import { createHash } from 'node:crypto';

import { parseMineruContentListV2 } from './mineru-document.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const DIMENSION_FIELDS = Object.freeze([
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
]);

function requiredText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function countBy(values) {
  return Object.fromEntries([...values.reduce((counts, value) => (
    counts.set(value, (counts.get(value) ?? 0) + 1)
  ), new Map())].sort(([left], [right]) => left.localeCompare(right)));
}

function artifactText(bytes) {
  try { return JSON.stringify(JSON.parse(bytes)); } catch { return bytes.toString('utf8'); }
}

function hasDimensionStructure(text) {
  const dimensionContext = /\b(?:dimensions?|size|width|height|depth|wide|high|deep)\b/i.test(text);
  const explicitAxes = /\b(?:w|width|wide)\b/i.test(text)
    && /\b(?:h|height|high)\b/i.test(text)
    && /\b(?:d|depth|deep)\b/i.test(text);
  const values = text.match(/\b\d+(?:\.\d+)?\s*mm\b/gi) ?? [];
  const tuple = /\b\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?(?:\s*mm)?\b/i.test(text);
  return dimensionContext && (explicitAxes || values.length >= 3 || tuple);
}

export function classifyPdfParserFailure(error, jsonBytes) {
  const message = String(error?.message ?? error);
  const text = artifactText(jsonBytes);
  if (/unexpected error has occurred|contact the technical team|document (?:is )?(?:blank|unavailable)/i.test(text)) {
    return {
      outcome: 'SOURCE_CONTENT_ERROR',
      code: 'official_document_contains_error_payload',
      detail: 'The official PDF is a rendered error payload rather than usable product evidence.',
    };
  }
  if (/identity signal|identity scope|unresolved family|multiple models|bound (?:family|series|exact cover|support family)|exact-model identity/i.test(message)) {
    return {
      outcome: 'IDENTITY_SCOPE_FAILURE',
      code: 'exact_model_identity_scope_unproven',
      detail: message,
    };
  }
  if (/ambiguous|conflict|multiple .*values|expected receipt claim/i.test(message)) {
    return {
      outcome: 'DIMENSION_SEMANTICS_AMBIGUOUS',
      code: 'dimension_semantics_ambiguous',
      detail: message,
    };
  }
  if (/no exact-model MinerU evidence with explicit axes extracted/i.test(message)) {
    return hasDimensionStructure(text) ? {
      outcome: 'PARSER_GRAMMAR_GAP',
      code: 'dimension_structure_present_but_unparsed',
      detail: message,
    } : {
      outcome: 'MINERU_STRUCTURE_INSUFFICIENT',
      code: 'no_machine_readable_dimension_structure',
      detail: message,
    };
  }
  return {
    outcome: 'PARSER_RUNTIME_ERROR',
    code: 'unclassified_parser_error',
    detail: message,
  };
}

async function verifiedObject(loadObject, descriptor, label, { pdf = false } = {}) {
  const path = requiredText(descriptor?.objectPath, `${label} object path`);
  if (!SHA256.test(descriptor?.contentSha256 ?? '')) throw new TypeError(`${label} SHA-256 invalid`);
  const bytes = await loadObject(path);
  if (!Buffer.isBuffer(bytes)
    || bytes.length !== descriptor.byteSize
    || sha256(bytes) !== descriptor.contentSha256) {
    throw new Error(`${label} integrity mismatch at ${path}`);
  }
  if (pdf && bytes.subarray(0, 5).toString() !== '%PDF-') {
    throw new Error(`${label} PDF magic-byte mismatch at ${path}`);
  }
  return bytes;
}

function familyKey(value) {
  return [
    value.category,
    value.brand,
    value.sourceHost,
    value.sourceFamilyHint ?? value.documentPattern?.hint,
    value.acquisitionRoute,
  ].map((part) => String(part ?? '').trim().toLowerCase()).join('\0');
}

function summarizeClaims(claims) {
  return claims.map((claim) => ({
    field: claim.field,
    value: structuredClone(claim.value),
    page: claim.page,
    quote: claim.quote,
    semanticBasis: claim.semanticBasis ?? null,
    parserProfileId: claim.parserProfileId ?? claim.grammarProfileId ?? null,
  }));
}

function validateInputs(originalBaseline, wp7aRerun, sourceRerunSha256, builtOn) {
  if (!SHA256.test(sourceRerunSha256 ?? '')) throw new TypeError('source rerun SHA-256 invalid');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requiredText(builtOn, 'replay build date'))) {
    throw new TypeError('replay build date invalid');
  }
  const originals = originalBaseline?.samples;
  const rerunSamples = wp7aRerun?.samples;
  if (!Array.isArray(originals) || !Array.isArray(rerunSamples) || originals.length !== rerunSamples.length) {
    throw new TypeError('original and WP7A samples must have equal non-empty scope');
  }
  const expectedIds = originals.map(({ sampleId }) => sampleId);
  if (wp7aRerun?.selection?.sampleCount !== expectedIds.length
    || JSON.stringify(wp7aRerun.selection.sampleIds) !== JSON.stringify(expectedIds)
    || JSON.stringify(rerunSamples.map(({ sampleId }) => sampleId)) !== JSON.stringify(expectedIds)) {
    throw new Error('WP7A parser replay sample selection drift');
  }
  if (rerunSamples.some(({ publicationEligible }) => publicationEligible !== false)) {
    throw new Error('WP7A parser replay must remain publication isolated');
  }
}

function rankedFamilyBacklog(originalBaseline, replaySamples) {
  const replayById = new Map(replaySamples.map((sample) => [sample.sampleId, sample]));
  const originalsByFamily = new Map();
  for (const sample of originalBaseline.samples) {
    const key = familyKey(sample);
    originalsByFamily.set(key, [...(originalsByFamily.get(key) ?? []), sample]);
  }
  const threshold = originalBaseline.familyBacklog?.eligibilityThresholdExactModelReceipts ?? 10;
  const ranked = (originalBaseline.familyBacklog?.ranked ?? []).map((family) => {
    const samples = (originalsByFamily.get(familyKey(family)) ?? [])
      .map(({ sampleId }) => replayById.get(sampleId))
      .filter(Boolean);
    const outcomes = countBy(samples.map(({ outcome }) => outcome));
    const eligibleForParserResearch = family.candidateTargets >= threshold
      && (outcomes.PARSER_GRAMMAR_GAP ?? 0) > 0;
    return {
      ...structuredClone(family),
      sampledDocuments: samples.length,
      replayOutcomes: outcomes,
      representativeSampleIds: samples.map(({ sampleId }) => sampleId),
      eligibleForParserResearch,
      eligibleForSharedRulePublication: false,
      sharedRuleBlocker: eligibleForParserResearch
        ? `At least ${threshold} exact-model canary receipts must pass after the representative grammar repair.`
        : 'No indexed representative exposes a confirmed parser grammar gap.',
    };
  });
  return {
    eligibilityThresholdExactModelReceipts: threshold,
    rankedForParserResearch: ranked
      .filter(({ eligibleForParserResearch }) => eligibleForParserResearch)
      .sort((left, right) => right.candidateTargets - left.candidateTargets
        || left.familyId.localeCompare(right.familyId))
      .slice(0, 5),
    excluded: ranked.filter(({ eligibleForParserResearch }) => !eligibleForParserResearch),
  };
}

export async function buildPdfBaselineParserReplay({
  originalBaseline,
  wp7aRerun,
  sourceRerunSha256,
  builtOn,
  loadObject,
  parse = parseMineruContentListV2,
}) {
  validateInputs(originalBaseline, wp7aRerun, sourceRerunSha256, builtOn);
  if (typeof loadObject !== 'function') throw new TypeError('evidence object loader required');
  if (typeof parse !== 'function') throw new TypeError('MinerU parser required');

  const samples = [];
  for (const sample of wp7aRerun.samples) {
    const base = {
      sampleId: sample.sampleId,
      category: sample.category,
      brand: sample.brand,
      model: sample.model,
      publicationEligible: false,
      acquisitionStatus: sample.acquisition.status,
      officialSourceUrl: sample.acquisition.officialSourceUrl ?? null,
      documentType: sample.acquisition.documentType ?? null,
    };
    if (sample.acquisition.status !== 'indexed') {
      samples.push({
        ...base,
        outcome: sample.acquisition.status === 'mineru_failed'
          ? 'MINERU_UNAVAILABLE'
          : 'ACQUISITION_UNAVAILABLE',
        code: sample.acquisition.status,
        detail: sample.acquisition.reason ?? null,
        claims: [],
        grammarProfileIds: [],
      });
      continue;
    }

    const pdfBytes = await verifiedObject(loadObject, sample.acquisition, 'source PDF', { pdf: true });
    const derived = sample.acquisition.derivedArtifact;
    if (derived?.format !== 'content_list_v2'
      || derived.sourcePdfSha256 !== sample.acquisition.contentSha256) {
      throw new Error(`MinerU source binding mismatch for ${sample.sampleId}`);
    }
    const jsonBytes = await verifiedObject(loadObject, derived, 'MinerU artifact');
    try {
      const parsed = parse(jsonBytes, {
        pdfSha256: sample.acquisition.contentSha256,
        parserVersion: derived.parserVersion,
        modelRevision: derived.modelRevision,
        caseIdentity: {
          brand: sample.brand,
          model: sample.model,
          category: sample.category,
        },
        fields: [...DIMENSION_FIELDS],
        claimSemanticsVersion: 2,
        sourceUrls: [...new Set([
          sample.acquisition.officialSourceUrl,
          sample.acquisition.finalUrl,
        ].filter(Boolean))],
      });
      const claims = (parsed.claims ?? []).filter(({ field }) => DIMENSION_FIELDS.includes(field));
      const uniqueFields = new Set(claims.map(({ field }) => field));
      if (uniqueFields.size !== claims.length) {
        throw new Error('ambiguous duplicate dimension claims returned by parser');
      }
      samples.push({
        ...base,
        outcome: uniqueFields.size === DIMENSION_FIELDS.length ? 'COMPLETE_3_AXIS' : 'PARTIAL_AXIS',
        code: uniqueFields.size === DIMENSION_FIELDS.length
          ? 'closed_envelope_three_axis_complete'
          : 'closed_envelope_axis_incomplete',
        detail: null,
        claims: summarizeClaims(claims),
        grammarProfileIds: [...new Set(parsed.grammarProfileIds ?? [])].sort(),
        sourcePdfSha256: sha256(pdfBytes),
        mineruContentSha256: sha256(jsonBytes),
      });
    } catch (error) {
      const classified = classifyPdfParserFailure(error, jsonBytes);
      samples.push({
        ...base,
        ...classified,
        claims: [],
        grammarProfileIds: [],
        sourcePdfSha256: sha256(pdfBytes),
        mineruContentSha256: sha256(jsonBytes),
      });
    }
  }

  return Object.freeze({
    schemaVersion: 1,
    reportId: 'pdf-failure-baseline-100-wp8-parser-replay',
    builtOn,
    sourceBaselineId: originalBaseline.baselineId,
    sourceRerunId: wp7aRerun.baselineId,
    sourceRerunSha256,
    requestedFields: [...DIMENSION_FIELDS],
    summary: {
      total: samples.length,
      byOutcome: countBy(samples.map(({ outcome }) => outcome)),
      publicationEligible: samples.filter(({ publicationEligible }) => publicationEligible).length,
    },
    familyBacklog: rankedFamilyBacklog(originalBaseline, samples),
    samples,
  });
}
