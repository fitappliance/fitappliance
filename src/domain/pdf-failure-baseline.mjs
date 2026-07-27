import { createHash } from 'node:crypto';

export const PDF_FAILURE_LAYERS = Object.freeze([
  Object.freeze({ layer: 1, id: 'acquisition' }),
  Object.freeze({ layer: 2, id: 'pdf_integrity_rendering' }),
  Object.freeze({ layer: 3, id: 'mineru_structure' }),
  Object.freeze({ layer: 4, id: 'page_table_association' }),
  Object.freeze({ layer: 5, id: 'exact_model_identity' }),
  Object.freeze({ layer: 6, id: 'dimension_semantics' }),
  Object.freeze({ layer: 7, id: 'range_operation_representation' }),
  Object.freeze({ layer: 8, id: 'evidence_conflict' }),
  Object.freeze({ layer: 9, id: 'receipt_binding' }),
  Object.freeze({ layer: 10, id: 'publication_isolation' }),
]);

const CATEGORY_ORDER = Object.freeze(['dryer', 'dishwasher', 'washing_machine', 'fridge']);
const OUTPUT_CATEGORY_ORDER = Object.freeze(['dishwasher', 'dryer', 'fridge', 'washing_machine']);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function compareText(left, right) {
  return String(left).localeCompare(String(right), 'en');
}

function normalizedUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString();
  } catch {
    return value;
  }
}

function sourceHost(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return 'invalid-url';
  }
}

function sourceFamilyHint(value) {
  let path = value;
  try {
    path = new URL(value).pathname;
  } catch {
    // Keep the raw value as a non-authoritative path hint.
  }
  const normalized = path.toLowerCase();
  if (/\bqrg\b|quick[-_ ]?reference/.test(normalized)) return 'quick_reference_guide';
  if (/install|planning[-_ ]?guide/.test(normalized)) return 'installation_guide';
  if (/spec|datasheet|data[-_ ]?sheet/.test(normalized)) return 'specification_sheet';
  if (/user[-_ ]?manual|manual|use[-_ ]?care/.test(normalized)) return 'user_manual';
  if (/cad|bim|dwg/.test(normalized)) return 'cad_or_bim';
  return 'unclassified_pdf_url';
}

function stage(status, code, detail) {
  return Object.freeze({ status, code, detail });
}

export function classifyPdfFailure(evidenceState) {
  for (const layer of PDF_FAILURE_LAYERS) {
    const current = evidenceState?.[layer.id];
    if (current?.status === 'passed') continue;
    return Object.freeze({
      layer: layer.layer,
      id: layer.id,
      code: current?.code ?? `${layer.id}_not_evaluated`,
      detail: current?.detail ?? 'The layer has not been closed with durable evidence.',
    });
  }
  throw new TypeError('no failed layer exists in the supplied PDF evidence state');
}

function hasPageBoundFields(document) {
  return (document?.fields?.length ?? 0) > 0
    && document.fields.every((field) => Number.isInteger(field.page) && field.page > 0 && typeof field.quote === 'string' && field.quote.length > 0);
}

function hasClosedEnvelopeDimensions(document) {
  const fields = new Set((document?.fields ?? []).map(({ field }) => field));
  return ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm']
    .every((field) => fields.has(field));
}

function deriveEvidenceState({ candidate, sourceDocuments, evidenceObject, mineruEntry }) {
  const acquiredDocument = evidenceObject ?? sourceDocuments.find(({ sha256: hash }) => SHA256_PATTERN.test(hash ?? '')) ?? null;
  const sourcePdfSha256 = acquiredDocument?.sha256 ?? acquiredDocument?.sourcePdfSha256 ?? null;
  const acquired = SHA256_PATTERN.test(sourcePdfSha256 ?? '');
  const integrityValid = acquired
    && acquiredDocument?.contentType !== 'text/html'
    && Number.isInteger(acquiredDocument?.pageCount)
    && acquiredDocument.pageCount > 0
    && (!('byteSize' in acquiredDocument) || acquiredDocument.byteSize > 0);
  const mineruValid = mineruEntry?.status === 'indexed'
    && mineruEntry.derivedArtifact?.format === 'content_list_v2'
    && mineruEntry.derivedArtifact?.sourcePdfSha256 === sourcePdfSha256;
  const rejectionReasons = sourceDocuments.map(({ rejectionReason }) => rejectionReason).filter(Boolean);
  const pageProvenanceRejected = rejectionReasons.some((reason) => /missing_page_level|page.*table|table.*association/i.test(reason));
  const pageBound = sourceDocuments.some(hasPageBoundFields);
  const exactIdentity = sourceDocuments.some(({ identityOutcome }) => identityOutcome === 'exact');
  const identityRejected = rejectionReasons.some((reason) => /exact_sales_model|series_manual|suffix|identif|model.*not/i.test(reason));
  const dimensionComplete = sourceDocuments.some(hasClosedEnvelopeDimensions);
  const dimensionRejected = rejectionReasons.some((reason) => /axis|dimension|width|height|depth|packag|carton/i.test(reason));
  const rangeRejected = rejectionReasons.some((reason) => /range|adjustable|door.open|operation/i.test(reason));
  const conflictRejected = rejectionReasons.some((reason) => /conflict|contradict|multiple.*value/i.test(reason));

  const state = {
    acquisition: acquired
      ? stage('passed', 'source_pdf_content_addressed', 'An immutable PDF object is linked to this source URL.')
      : stage('missing', 'source_pdf_not_content_addressed', 'The recovery target has no immutable PDF hash in the current evidence object index.'),
    pdf_integrity_rendering: !acquired
      ? stage('not_reached', 'blocked_by_acquisition', 'PDF integrity cannot be evaluated before acquisition.')
      : integrityValid
        ? stage('passed', 'pdf_integrity_metadata_valid', 'The object has a valid hash, byte count and positive page count.')
        : stage('failed', 'pdf_integrity_metadata_incomplete', 'The acquired object lacks valid PDF integrity or rendering metadata.'),
    mineru_structure: !integrityValid
      ? stage('not_reached', 'blocked_by_pdf_integrity', 'MinerU structure cannot be accepted before PDF integrity passes.')
      : mineruValid
        ? stage('passed', 'mineru_content_list_v2_indexed', 'A policy-compatible MinerU content_list_v2 artifact is indexed.')
        : stage(mineruEntry?.status === 'failed' ? 'failed' : 'missing', 'mineru_content_list_v2_missing', 'No valid policy-compatible MinerU content_list_v2 artifact is bound to the PDF hash.'),
    page_table_association: !mineruValid
      ? stage('not_reached', 'blocked_by_mineru_structure', 'Page and table association requires a valid MinerU artifact.')
      : pageBound && !pageProvenanceRejected
        ? stage('passed', 'page_bound_fields_present', 'Existing fields retain page and quote provenance.')
        : stage('failed', 'page_table_association_unproven', 'The legacy field evidence is not bound to structured page regions and table relationships.'),
    exact_model_identity: !pageBound || pageProvenanceRejected
      ? stage('not_reached', 'blocked_by_page_table_association', 'Exact model scope cannot advance until page relationships are proven.')
      : exactIdentity && !identityRejected
        ? stage('passed', 'exact_model_identity_proven', 'The source document has exact model identity evidence.')
        : stage('failed', 'exact_model_identity_unproven', 'The exact Australian sales model is not proven for the claim region.'),
    dimension_semantics: !exactIdentity || identityRejected
      ? stage('not_reached', 'blocked_by_exact_model_identity', 'Dimension semantics cannot advance without exact model scope.')
      : dimensionComplete && !dimensionRejected
        ? stage('passed', 'closed_envelope_axes_proven', 'Closed-envelope width, height and depth are explicit.')
        : stage('failed', 'dimension_semantics_incomplete', 'Closed-envelope axes, units or scope are incomplete or ambiguous.'),
    range_operation_representation: !dimensionComplete || dimensionRejected
      ? stage('not_reached', 'blocked_by_dimension_semantics', 'Range and operation geometry require closed-envelope dimensions first.')
      : rangeRejected
        ? stage('failed', 'range_operation_representation_unresolved', 'Adjustable or operation-envelope geometry is not represented safely.')
        : stage('unknown', 'range_operation_applicability_unproven', 'Absence of a recorded range failure does not prove that adjustable or operation geometry is inapplicable.'),
    evidence_conflict: stage(
      'not_reached',
      conflictRejected ? 'known_conflict_blocked_by_range_representation' : 'blocked_by_range_operation_representation',
      'Cross-source conflict closure follows explicit range and operation-envelope applicability.',
    ),
    receipt_binding: stage('not_reached', 'blocked_by_evidence_conflict', 'Receipt binding requires an explicit cross-source conflict result.'),
    publication_isolation: candidate.representativeTarget.publicationEligible
      ? stage('passed', 'publication_eligible', 'The target is publication eligible.')
      : stage('failed', 'publication_isolated', 'The target remains excluded from public projection.'),
  };
  return Object.freeze({ state: Object.freeze(state), sourcePdfSha256, acquired });
}

function buildIndexes(sourceDocuments, mineruAudit, evidenceObjectIndex) {
  const sourceById = new Map((sourceDocuments.documents ?? []).map((document) => [document.id, document]));
  const evidenceByUrl = new Map();
  for (const document of evidenceObjectIndex.documents ?? []) {
    for (const sourceUrl of document.sourceUrls ?? []) evidenceByUrl.set(normalizedUrl(sourceUrl), document);
  }
  const mineruBySha = new Map((mineruAudit.entries ?? []).map((entry) => [entry.sourcePdfSha256, entry]));
  return { sourceById, evidenceByUrl, mineruBySha };
}

function buildCandidates(queue, indexes) {
  const candidates = [];
  for (const job of queue.jobs ?? []) {
    const targetsByCategory = new Map();
    for (const target of job.targets ?? []) {
      const targets = targetsByCategory.get(target.category) ?? [];
      targets.push(target);
      targetsByCategory.set(target.category, targets);
    }
    for (const [category, targets] of targetsByCategory) {
      if (!CATEGORY_ORDER.includes(category)) continue;
      const sortedTargets = [...targets].sort((left, right) => compareText(left.referenceId, right.referenceId));
      const representativeTarget = sortedTargets[0];
      const sourceDocumentIds = [...new Set(sortedTargets.flatMap(({ sourceDocumentIds = [] }) => sourceDocumentIds))].sort(compareText);
      const linkedSourceDocuments = sourceDocumentIds.map((id) => indexes.sourceById.get(id)).filter(Boolean);
      const evidenceObject = indexes.evidenceByUrl.get(normalizedUrl(job.sourceUrl)) ?? null;
      const sourceHash = evidenceObject?.sha256
        ?? linkedSourceDocuments.find(({ sha256: hash }) => SHA256_PATTERN.test(hash ?? ''))?.sha256
        ?? null;
      const mineruEntry = sourceHash ? indexes.mineruBySha.get(sourceHash) ?? null : null;
      const candidate = {
        job,
        category,
        targets: sortedTargets,
        representativeTarget,
        sourceDocumentIds,
        linkedSourceDocuments,
        evidenceObject,
        mineruEntry,
        sourceHost: sourceHost(job.sourceUrl),
        sourceFamilyHint: sourceFamilyHint(job.sourceUrl),
      };
      candidate.evidence = deriveEvidenceState({
        candidate,
        sourceDocuments: linkedSourceDocuments,
        evidenceObject,
        mineruEntry,
      });
      candidates.push(candidate);
    }
  }
  return candidates;
}

function selectCandidates(candidates, perCategory) {
  const selected = [];
  const globallyUsedUrls = new Set();
  for (const category of CATEGORY_ORDER) {
    const pool = candidates.filter((candidate) => candidate.category === category);
    const categorySelection = [];
    const usedBrands = new Set();
    const usedHosts = new Set();
    const usedRoutes = new Set();
    const usedFamilies = new Set();
    while (categorySelection.length < perCategory) {
      const eligible = pool.filter((candidate) => !globallyUsedUrls.has(normalizedUrl(candidate.job.sourceUrl)));
      if (eligible.length === 0) throw new TypeError(`not enough unique PDF candidates for ${category}`);
      eligible.sort((left, right) => {
        const score = (candidate) => (
          (candidate.evidence.acquired ? 1_000_000 : 0)
          + (!usedBrands.has(candidate.representativeTarget.brand) ? 10_000 : 0)
          + (!usedHosts.has(candidate.sourceHost) ? 1_000 : 0)
          + (!usedRoutes.has(candidate.job.acquisitionRoute) ? 100 : 0)
          + (!usedFamilies.has(candidate.sourceFamilyHint) ? 10 : 0)
          + Math.min(candidate.targets.length, 9)
        );
        return score(right) - score(left)
          || compareText(sha256(`${left.category}\0${left.job.sourceUrl}`), sha256(`${right.category}\0${right.job.sourceUrl}`));
      });
      const chosen = eligible[0];
      categorySelection.push(chosen);
      globallyUsedUrls.add(normalizedUrl(chosen.job.sourceUrl));
      usedBrands.add(chosen.representativeTarget.brand);
      usedHosts.add(chosen.sourceHost);
      usedRoutes.add(chosen.job.acquisitionRoute);
      usedFamilies.add(chosen.sourceFamilyHint);
    }
    selected.push(...categorySelection);
  }
  return selected;
}

function countBy(values) {
  const result = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => compareText(left, right)));
}

function buildFamilyBacklog(candidates, samples) {
  const sampledIds = new Set(samples.map(({ sampleId }) => sampleId));
  const groups = new Map();
  for (const candidate of candidates) {
    const familyKey = [
      candidate.category,
      candidate.representativeTarget.brand,
      candidate.sourceHost,
      candidate.sourceFamilyHint,
      candidate.job.acquisitionRoute,
    ].join('|');
    const group = groups.get(familyKey) ?? {
      familyId: `pdf_family_${sha256(familyKey).slice(0, 20)}`,
      category: candidate.category,
      brand: candidate.representativeTarget.brand,
      sourceHost: candidate.sourceHost,
      sourceFamilyHint: candidate.sourceFamilyHint,
      acquisitionRoute: candidate.job.acquisitionRoute,
      candidateTargets: 0,
      sampledDocuments: 0,
      acquiredSampleDocuments: 0,
    };
    group.candidateTargets += candidate.targets.length;
    const sampleId = `pdf_baseline_${sha256(`${candidate.category}\0${candidate.job.sourceUrl}`).slice(0, 24)}`;
    if (sampledIds.has(sampleId)) {
      group.sampledDocuments += 1;
      if (candidate.evidence.acquired) group.acquiredSampleDocuments += 1;
    }
    groups.set(familyKey, group);
  }
  const ranked = [...groups.values()]
    .map((group) => ({
      ...group,
      eligibleForSharedRuleResearch: group.candidateTargets >= 10,
      projectionBasis: 'candidate_upper_bound_requires_exact_model_receipt_validation',
    }))
    .filter(({ sampledDocuments }) => sampledDocuments > 0)
    .sort((left, right) => Number(right.eligibleForSharedRuleResearch) - Number(left.eligibleForSharedRuleResearch)
      || right.candidateTargets - left.candidateTargets
      || right.sampledDocuments - left.sampledDocuments
      || compareText(left.familyId, right.familyId));
  return Object.freeze({
    eligibilityThresholdExactModelReceipts: 10,
    rankingCaveat: 'Candidate counts are an upper bound. A shared rule is not approved until acquisition and exact-model replay prove at least ten receipts.',
    ranked,
    topFive: ranked.slice(0, 5),
  });
}

export function buildPdfFailureBaseline({
  queue,
  sourceDocuments,
  mineruAudit,
  evidenceObjectIndex,
  inputHashes,
  perCategory = 25,
}) {
  for (const key of ['queue', 'sourceDocuments', 'mineruAudit', 'evidenceObjectIndex']) {
    if (!SHA256_PATTERN.test(inputHashes?.[key] ?? '')) throw new TypeError(`missing SHA-256 for ${key}`);
  }
  const indexes = buildIndexes(sourceDocuments, mineruAudit, evidenceObjectIndex);
  const candidates = buildCandidates(queue, indexes);
  const selected = selectCandidates(candidates, perCategory);
  const samples = selected.map((candidate) => {
    const primaryFailure = classifyPdfFailure(candidate.evidence.state);
    const sampleId = `pdf_baseline_${sha256(`${candidate.category}\0${candidate.job.sourceUrl}`).slice(0, 24)}`;
    const pipelineTrace = PDF_FAILURE_LAYERS
      .slice(0, primaryFailure.layer)
      .map((layer) => ({
        layer: layer.layer,
        id: layer.id,
        ...candidate.evidence.state[layer.id],
      }));
    return {
      sampleId,
      jobId: candidate.job.jobId,
      category: candidate.category,
      brand: candidate.representativeTarget.brand,
      model: candidate.representativeTarget.model,
      representedTargetCount: candidate.targets.length,
      referenceId: candidate.representativeTarget.referenceId,
      lifecycleState: candidate.representativeTarget.lifecycleState,
      currentLookupAction: candidate.representativeTarget.currentLookupAction,
      publicationEligible: candidate.representativeTarget.publicationEligible,
      sourceUrl: candidate.job.sourceUrl,
      sourceHost: candidate.sourceHost,
      acquisitionRoute: candidate.job.acquisitionRoute,
      priorityClass: candidate.job.priorityClass,
      sourceDocumentIds: candidate.sourceDocumentIds,
      sourcePdfSha256: candidate.evidence.sourcePdfSha256,
      documentPattern: {
        hint: candidate.sourceFamilyHint,
        basis: 'url_path_hint_not_document_evidence',
        confirmed: false,
      },
      pipelineTrace,
      primaryFailure,
      secondaryCauses: primaryFailure.id === 'acquisition'
        ? ['legacy_source_document_has_no_content_hash', 'document_layout_unobservable_until_acquired']
        : candidate.linkedSourceDocuments.map(({ rejectionReason }) => rejectionReason).filter(Boolean),
    };
  }).sort((left, right) => OUTPUT_CATEGORY_ORDER.indexOf(left.category) - OUTPUT_CATEGORY_ORDER.indexOf(right.category)
    || compareText(left.sampleId, right.sampleId));

  const summary = {
    total: samples.length,
    byCategory: countBy(samples.map(({ category }) => category)),
    byPrimaryLayer: countBy(samples.map(({ primaryFailure }) => primaryFailure.id)),
    acquiredObjects: selected.filter(({ evidence }) => evidence.state.acquisition.status === 'passed').length,
    mineruIndexedObjects: selected.filter(({ evidence }) => evidence.state.mineru_structure.status === 'passed').length,
    distinctBrands: new Set(samples.map(({ brand }) => brand)).size,
    distinctSourceHosts: new Set(samples.map(({ sourceHost: host }) => host)).size,
    distinctAcquisitionRoutes: new Set(samples.map(({ acquisitionRoute }) => acquisitionRoute)).size,
  };
  if (summary.total !== perCategory * CATEGORY_ORDER.length) throw new TypeError('PDF baseline sample size drift');

  return Object.freeze({
    schemaVersion: 1,
    baselineId: 'pdf-failure-baseline-100-2026-07-27',
    builtOn: '2026-07-27',
    parserMutationCount: 0,
    selectionPolicy: {
      perCategory,
      categories: [...OUTPUT_CATEGORY_ORDER],
      uniqueSourceUrls: true,
      acquiredEvidencePriority: true,
      diversityDimensions: ['brand', 'source_host', 'acquisition_route', 'url_family_hint'],
      primaryFailureRule: 'first_non_passed_pipeline_layer',
    },
    inputHashes: { ...inputHashes },
    summary,
    samples,
    familyBacklog: buildFamilyBacklog(candidates, samples),
  });
}
