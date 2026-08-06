#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { registryBrandKey, registryModelKey } from '../../src/domain/energy-rating-registry.mjs';
import {
  buildHistoricalModelEvidenceClassification,
  renderHistoricalModelEvidenceClassificationMarkdown,
  validateHistoricalModelEvidenceClassificationPolicy,
} from '../../src/domain/historical-model-evidence-classification.mjs';
import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';
import { loadHistoricalRecoveryActiveRelease } from '../../src/domain/historical-recovery-active-release.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const policyPath = resolve(root, 'data/architecture-v2/policies/historical-model-evidence-classification-policy.json');
const knowledgePath = resolve(root, 'data/architecture-v2/generated/dimension-expression-observations.json');
const markdownPath = resolve(root, 'docs/architecture-v2/historical-model-evidence-classification.md');

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function exactKey(category, brand, model) {
  return `${String(category ?? '').toLowerCase()}\0${registryBrandKey(brand)}\0${registryModelKey(model)}`;
}

function sourceAuthority(document) {
  if (document?.authorType === 'manufacturer' && document?.transportHostType === 'manufacturer') return 'OFFICIAL';
  if (document?.transportHostType === 'retailer') return 'REFERENCE';
  return 'NONE';
}

function sourceIdentityScope(document) {
  if (document?.identityOutcome === 'exact') return 'EXACT_MODEL';
  if (document?.identityOutcome === 'alias') return 'ALIAS_CANDIDATE';
  return 'AMBIGUOUS';
}

function addToMap(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function receiptExtraction(source) {
  const claims = new Map((source?.claims ?? []).map((claim) => [claim.field, claim.value]));
  const axes = ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'];
  if (!axes.every((axis) => claims.has(axis))) return null;
  return axes.some((axis) => claims.get(axis)?.kind === 'range') ? 'ALL_AXIS_RANGE' : 'ALL_AXIS_SCALAR';
}

export function receiptDocumentLink(receipt) {
  const source = receipt?.source;
  const contentSha256 = source?.contentSha256;
  const bindingSha256 = source?.verificationReceipt?.bindingSha256;
  if (!receipt?.entry?.referenceId || !contentSha256 || !bindingSha256) {
    throw new TypeError('receipt document link requires reference, content and binding hashes');
  }
  const evidenceObjectIds = [
    source.objectPath,
    source.derivedArtifact?.objectPath,
    `receipt:${bindingSha256}`,
  ].filter(Boolean);
  return {
    documentId: `pdf:${contentSha256}`,
    sourceUrl: source.sourceUrl,
    sourcePdfSha256: contentSha256,
    evidenceObjectIds,
    reasonCodes: ['CURRENT_MINERU_INDEX', 'CURRENT_RECEIPT_BOUND'],
    corpusState: 'RECEIPT_BOUND',
    sourceAuthority: 'OFFICIAL',
    identityScope: 'EXACT_MODEL',
    extractionState: receiptExtraction(source) ?? 'PARSER_GAP',
    receiptState: 'CURRENT_VALID',
  };
}

function addReceipt(index, contentSha256, receipt) {
  if (!contentSha256) return;
  if (!index.has(contentSha256)) index.set(contentSha256, []);
  const receipts = index.get(contentSha256);
  const duplicate = receipts.find((entry) => entry.entry.referenceId === receipt.entry.referenceId);
  if (duplicate) {
    if (JSON.stringify(duplicate.source) !== JSON.stringify(receipt.source)) {
      throw new Error(`conflicting receipt for ${contentSha256}: ${receipt.entry.referenceId}`);
    }
    return;
  }
  receipts.push(receipt);
  receipts.sort((left, right) => left.entry.referenceId.localeCompare(right.entry.referenceId));
}

function activeCatalogReceiptHashes(products) {
  return new Set((products ?? []).flatMap((product) => (
    product?.geometry_v2_provenance?.activeSourceHashes ?? []
  )));
}

export function buildCurrentReceiptIndex({
  acceptanceBundle,
  legacyAcceptanceResults = [],
  publicProducts = [],
  referenceByExactKey,
}) {
  if (!(referenceByExactKey instanceof Map)) throw new TypeError('referenceByExactKey map required');
  const receiptByHash = new Map();
  for (const entry of acceptanceBundle?.entries ?? []) {
    for (const source of entry.sources ?? []) {
      addReceipt(receiptByHash, source.contentSha256, { entry, source });
    }
  }

  const activeHashes = activeCatalogReceiptHashes(publicProducts);
  for (const results of legacyAcceptanceResults) {
    for (const outcome of results?.outcomes ?? []) {
      const source = outcome?.source;
      if (outcome?.outcome !== 'accepted'
        || outcome?.receipt !== 'passed'
        || outcome?.identity !== 'exact'
        || !activeHashes.has(source?.contentSha256)) continue;
      const reference = referenceByExactKey.get(exactKey(
        outcome.category, outcome.brand, outcome.model,
      ));
      if (!reference) continue;
      addReceipt(receiptByHash, source.contentSha256, {
        entry: { referenceId: reference.referenceId },
        source,
      });
    }
  }
  return receiptByHash;
}

function buildGroups(knowledge, referenceByExactKey) {
  const groups = new Map();
  for (const category of knowledge.categories ?? []) {
    for (const brand of category.brands ?? []) {
      for (const family of brand.families ?? []) {
        for (const model of family.models ?? []) {
          const reference = referenceByExactKey.get(exactKey(category.category, brand.canonicalBrand, model));
          if (!reference) continue;
          addToMap(groups, reference.referenceId, {
            groupType: family.groupType,
            groupName: family.groupName,
            grammarProfileIds: family.parserProfileIds ?? [],
          });
        }
      }
    }
  }
  return groups;
}

function mergeDocumentLink(map, referenceId, link) {
  if (!map.has(referenceId)) map.set(referenceId, new Map());
  const documents = map.get(referenceId);
  const existing = documents.get(link.documentId);
  if (!existing) {
    documents.set(link.documentId, link);
    return;
  }
  if (JSON.stringify(existing) !== JSON.stringify(link)) {
    throw new Error(`conflicting document link for ${referenceId}: ${link.documentId}`);
  }
}

function materializeLinks(map) {
  return new Map([...map].map(([referenceId, documents]) => [
    referenceId,
    [...documents.values()].sort((left, right) => left.documentId.localeCompare(right.documentId)),
  ]));
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function hybridAuditEvidenceObjectIds(outcome) {
  if (outcome.evidenceBinding == null) return [];
  const binding = outcome.evidenceBinding;
  const primaryOnly = binding.hybridContentSha256 == null
    && binding.profileId === 'pipeline-auto-v1'
    && Array.isArray(binding.processedPages)
    && binding.processedPages.length === 0;
  const hybrid = /^[a-f0-9]{64}$/.test(String(binding.hybridContentSha256 ?? ''))
    && binding.profileId === 'hybrid-image-high-v1'
    && Array.isArray(binding.processedPages)
    && binding.processedPages.length > 0
    && binding.processedPages.every((page) => Number.isInteger(page) && page >= 1);
  if (binding.sourcePdfSha256 !== outcome.sourcePdfSha256
    || !/^[a-f0-9]{64}$/.test(String(binding.primaryContentSha256 ?? ''))
    || (!primaryOnly && !hybrid)) {
    throw new Error(`hybrid audit evidence binding invalid: ${outcome.referenceId}`);
  }
  return [
    `mineru-primary:${binding.primaryContentSha256}`,
    ...(hybrid ? [`mineru-hybrid:${binding.hybridContentSha256}`] : []),
  ];
}

export function applyHistoricalPdfImageAudit({ links, audit, activeReferenceIds = null }) {
  if (!(links instanceof Map) || audit?.schemaVersion !== 1 || !Array.isArray(audit?.outcomes)) {
    throw new TypeError('historical PDF image audit and classification links required');
  }
  const expectedAuditSha256 = canonicalJsonSha256({
    sourceQueueSha256: audit.sourceQueueSha256,
    ...(audit.auditScope ? { auditScope: audit.auditScope } : {}),
    toleranceMm: audit.toleranceMm,
    outcomes: audit.outcomes,
  });
  if (audit.semanticAuditSha256 !== expectedAuditSha256) {
    throw new Error('historical PDF image audit digest mismatch');
  }
  const conflictsByReference = new Map();
  let applied = 0;
  let skippedCurrentReceipts = 0;
  let quarantinedInactiveIdentities = 0;
  for (const outcome of audit.outcomes) {
    const referenceId = String(outcome.referenceId ?? '');
    if (activeReferenceIds instanceof Set && !activeReferenceIds.has(referenceId)) {
      quarantinedInactiveIdentities += 1;
      continue;
    }
    const documentId = `pdf:${String(outcome.sourcePdfSha256 ?? '')}`;
    const documents = links.get(referenceId);
    const existing = documents?.get(documentId);
    if (!existing) throw new Error(`hybrid audit document link missing: ${referenceId}/${documentId}`);
    if (existing.receiptState === 'CURRENT_VALID') {
      skippedCurrentReceipts += 1;
      continue;
    }
    const reasonCode = `HYBRID_AUDIT_${String(outcome.decision ?? 'UNKNOWN')}`;
    const next = {
      ...existing,
      evidenceObjectIds: uniqueSorted([
        ...existing.evidenceObjectIds,
        `hybrid-audit:${audit.semanticAuditSha256}`,
        ...hybridAuditEvidenceObjectIds(outcome),
      ]),
      reasonCodes: uniqueSorted([...existing.reasonCodes, reasonCode]),
    };
    if (outcome.decision === 'IDENTITY_SCOPE_UNRESOLVED') {
      next.identityScope = 'AMBIGUOUS';
      next.extractionState = 'PARSER_GAP';
    } else if (outcome.decision === 'INDEPENDENT_CORROBORATION_REQUIRED') {
      next.identityScope = 'AMBIGUOUS';
      next.extractionState = outcome.dimensionEvidence
        && Object.values(outcome.dimensionEvidence).some((value) => value?.kind === 'range')
        ? 'ALL_AXIS_RANGE'
        : 'ALL_AXIS_SCALAR';
    } else if (['NO_USABLE_DIMENSION_CLAIMS', 'NON_SCALAR_OR_INCOMPLETE_DIMENSIONS',
      'AMBIGUOUS_DIMENSION_VALUES', 'EXTRACTION_FAILED', 'HYBRID_REPAIR_REQUIRED',
      'PROFILE_DIMENSION_CONFLICT'].includes(outcome.decision)) {
      next.extractionState = 'PARSER_GAP';
    } else if (outcome.extractionStatus === 'extracted'
      && (outcome.dimensionEvidence || outcome.dimensionsMm)) {
      next.extractionState = outcome.dimensionEvidence
        && Object.values(outcome.dimensionEvidence).some((value) => value?.kind === 'range')
        ? 'ALL_AXIS_RANGE'
        : 'ALL_AXIS_SCALAR';
    }
    if (['DIMENSION_CONFLICT_QUARANTINE', 'PROFILE_DIMENSION_CONFLICT'].includes(outcome.decision)) {
      conflictsByReference.set(referenceId, 'SOURCE_CONFLICT');
    }
    documents.set(documentId, next);
    applied += 1;
  }
  return { conflictsByReference, applied, skippedCurrentReceipts, quarantinedInactiveIdentities };
}

export function applyAcceptanceReceiptReplayAudit({ links, audit }) {
  if (!(links instanceof Map) || audit?.schemaVersion !== 1 || !Array.isArray(audit?.outcomes)) {
    throw new TypeError('acceptance receipt replay audit and classification links required');
  }
  const expectedAuditSha256 = canonicalJsonSha256({
    sourceBundleSha256: audit.sourceBundleSha256,
    outcomes: audit.outcomes,
  });
  if (audit.semanticAuditSha256 !== expectedAuditSha256) {
    throw new Error('acceptance receipt replay audit digest mismatch');
  }
  let failedReceipts = 0;
  let passedReceipts = 0;
  for (const outcome of audit.outcomes) {
    if (outcome.status === 'passed') {
      passedReceipts += 1;
      continue;
    }
    if (outcome.status !== 'failed' || !outcome.sourcePdfSha256) continue;
    const documentId = `pdf:${outcome.sourcePdfSha256}`;
    const document = links.get(outcome.referenceId)?.get(documentId);
    if (!document) throw new Error(`failed receipt replay document link missing: ${outcome.referenceId}/${documentId}`);
    if (!document.evidenceObjectIds.includes(`receipt:${outcome.receiptBindingSha256}`)) {
      throw new Error(`failed receipt replay binding missing: ${outcome.referenceId}/${outcome.receiptBindingSha256}`);
    }
    const hasCurrentMineru = document.reasonCodes.includes('CURRENT_MINERU_INDEX')
      || Boolean(outcome.derivedObjectPath);
    links.get(outcome.referenceId).set(documentId, {
      ...document,
      evidenceObjectIds: uniqueSorted([
        ...document.evidenceObjectIds,
        `receipt-replay-audit:${audit.semanticAuditSha256}`,
      ]),
      reasonCodes: uniqueSorted([
        ...document.reasonCodes.filter((code) => code !== 'CURRENT_RECEIPT_BOUND'),
        `CURRENT_RECEIPT_REPLAY_FAILED_${String(outcome.failureCode).toUpperCase()}`,
      ]),
      corpusState: hasCurrentMineru ? 'CURRENT_MINERU' : 'STORED_PDF',
      identityScope: outcome.failureCode === 'identity_replay_mismatch'
        ? 'AMBIGUOUS'
        : document.identityScope,
      extractionState: 'PARSER_GAP',
      receiptState: 'LEGACY_UNBOUND',
    });
    failedReceipts += 1;
  }
  return Object.freeze({ failedReceipts, passedReceipts });
}

async function atomicWrite(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, bytes, { flag: 'wx' });
  await rename(temporary, path);
}

export function deriveHistoricalModelEvidenceClassificationGeneratedAt({
  historicalReference,
  sourceDocumentArtifact,
  knowledge,
  legacyAudit,
  recoveryQueue,
  acceptanceBundle,
  publicProjection,
  pdfAcceptanceResults,
  identityAcceptanceResults,
  imageRepairAudit,
  acceptanceReceiptReplayAudit,
}) {
  const values = [
    historicalReference?.generatedAt,
    sourceDocumentArtifact?.generatedAt,
    knowledge?.generatedAt,
    legacyAudit?.generatedAt,
    recoveryQueue?.generatedAt,
    acceptanceBundle?.generatedAt,
    publicProjection?.generatedAt,
    pdfAcceptanceResults?.generatedAt,
    pdfAcceptanceResults?.reviewedAt,
    identityAcceptanceResults?.generatedAt,
    identityAcceptanceResults?.reviewedAt,
    imageRepairAudit?.generatedAt,
    acceptanceReceiptReplayAudit?.generatedAt,
    acceptanceReceiptReplayAudit?.auditedAt,
  ].filter((value) => value != null).map((value) => {
    const timestamp = new Date(value);
    if (!Number.isFinite(timestamp.valueOf())) throw new TypeError('classification input timestamp invalid');
    return timestamp;
  });
  if (!values.length) throw new TypeError('classification input timestamp required');
  return new Date(Math.max(...values.map((value) => value.valueOf()))).toISOString();
}

async function main(args) {
  const outputPath = resolve(option(args, '--output') ?? resolveArchitectureV2Path(root, 'historicalModelEvidenceClassification'));
  const outputMarkdown = resolve(option(args, '--markdown') ?? markdownPath);
  const generatedAtOption = option(args, '--generated-at');
  const [policyValue, activeRecovery, sourceDocumentArtifact, knowledge, legacyAudit,
    recoveryQueue, acceptanceBundle, pdfAcceptanceResults,
    identityAcceptanceResults, imageRepairAudit, acceptanceReceiptReplayAudit] = await Promise.all([
    readJson(policyPath),
    loadHistoricalRecoveryActiveRelease({ root }),
    readJson(resolveArchitectureV2Path(root, 'sourceDocuments')),
    readJson(knowledgePath),
    readJson(resolveArchitectureV2Path(root, 'legacyPdfLibraryAudit')),
    readJson(resolveArchitectureV2Path(root, 'historicalEvidenceRecoveryQueue')),
    readJson(resolveArchitectureV2Path(root, 'historicalEvidenceRecoveryAcceptanceBundle')),
    readJson(resolveArchitectureV2Path(root, 'pdfBrandAcceptanceResults')),
    readJson(resolveArchitectureV2Path(root, 'identityRangeRecoveryAcceptanceResults')),
    readJson(resolveArchitectureV2Path(root, 'historicalPdfImageRepairAudit')),
    readJson(resolveArchitectureV2Path(root, 'historicalAcceptanceReceiptReplayAudit')),
  ]);
  const historicalReference = activeRecovery.reference;
  const publicProjection = activeRecovery.catalog;
  const generatedAt = generatedAtOption ?? deriveHistoricalModelEvidenceClassificationGeneratedAt({
    historicalReference,
    sourceDocumentArtifact,
    knowledge,
    legacyAudit,
    recoveryQueue,
    acceptanceBundle,
    publicProjection,
    pdfAcceptanceResults,
    identityAcceptanceResults,
    imageRepairAudit,
    acceptanceReceiptReplayAudit,
  });
  const policy = validateHistoricalModelEvidenceClassificationPolicy(policyValue);
  const records = historicalReference.records;
  const referenceById = new Map(records.map((entry) => [entry.referenceId, entry]));
  const referenceByExactKey = new Map(records.map((entry) => [exactKey(entry.category, entry.brand, entry.model), entry]));
  const referencesByCatalogId = new Map();
  for (const reference of records) {
    for (const productId of reference.catalogProductIds ?? []) addToMap(referencesByCatalogId, productId, reference);
  }
  const sourceDocuments = sourceDocumentArtifact.documents ?? [];
  const sourceById = new Map(sourceDocuments.map((entry) => [entry.id, entry]));
  const sourceWithPhysicalObject = new Set(legacyAudit.pdfDocuments.flatMap((entry) => entry.sourceDocumentIds));
  const receiptByHash = buildCurrentReceiptIndex({
    acceptanceBundle,
    legacyAcceptanceResults: [pdfAcceptanceResults, identityAcceptanceResults],
    publicProducts: publicProjection.products,
    referenceByExactKey,
  });
  const links = new Map();

  for (const document of legacyAudit.pdfDocuments) {
    const receipts = receiptByHash.get(document.sourcePdfSha256) ?? [];
    for (const modelLink of document.modelLinks) {
      const reference = referenceById.get(modelLink.referenceId);
      if (!reference) continue;
      const receiptForModel = receipts.find((receipt) => (
        receipt.entry.referenceId === reference.referenceId
      )) ?? null;
      const extractionState = receiptForModel ? (receiptExtraction(receiptForModel.source) ?? document.extractionState) : document.extractionState;
      const currentMineru = document.mineruIndex?.status === 'indexed';
      const sourceUrl = receiptForModel?.source.sourceUrl
        ?? document.sourceDocumentIds.map((id) => sourceById.get(id)?.sourceUrl).find(Boolean)
        ?? null;
      mergeDocumentLink(links, reference.referenceId, {
        documentId: `pdf:${document.sourcePdfSha256}`,
        ...(sourceUrl ? { sourceUrl } : {}),
        sourcePdfSha256: document.sourcePdfSha256,
        evidenceObjectIds: [
          ...document.physicalPaths.map((path) => `storage:${path}`),
          ...(currentMineru ? [`mineru-index:${document.sourcePdfSha256}`] : []),
          ...(receiptForModel
            ? [`receipt:${receiptForModel.source.verificationReceipt.bindingSha256}`]
            : []),
        ],
        reasonCodes: [
          'PHYSICAL_PDF_HASH_BOUND',
          ...(currentMineru ? ['CURRENT_MINERU_INDEX'] : []),
          ...(receiptForModel ? ['CURRENT_RECEIPT_BOUND'] : []),
        ],
        corpusState: receiptForModel ? 'RECEIPT_BOUND' : (currentMineru ? 'CURRENT_MINERU' : 'STORED_PDF'),
        sourceAuthority: receiptForModel ? 'OFFICIAL' : document.sourceAuthority,
        identityScope: receiptForModel ? 'EXACT_MODEL' : modelLink.identityScope,
        extractionState: receiptForModel
          ? extractionState
          : (modelLink.extractionState ?? document.extractionState),
        receiptState: receiptForModel ? 'CURRENT_VALID' : 'NONE',
        ...(document.grammarProfileIds[0] ? { grammarProfileId: document.grammarProfileIds[0] } : {}),
      });
    }
  }

  for (const receipts of receiptByHash.values()) {
    for (const receipt of receipts) {
      const referenceId = receipt.entry.referenceId;
      if (!referenceById.has(referenceId)) continue;
      const link = receiptDocumentLink(receipt);
      if (links.get(referenceId)?.has(link.documentId)) continue;
      mergeDocumentLink(links, referenceId, link);
    }
  }

  for (const summary of legacyAudit.legacySummaries) {
    for (const referenceId of summary.referenceIds) {
      mergeDocumentLink(links, referenceId, {
        documentId: `legacy:${summary.relativePath}`,
        ...(summary.sourceUrl ? { sourceUrl: summary.sourceUrl } : {}),
        evidenceObjectIds: summary.sourceDocumentIds,
        reasonCodes: ['LEGACY_SUMMARY_DISCOVERY_HINT', ...summary.issueCodes],
        corpusState: 'LEGACY_METADATA_ONLY',
        sourceAuthority: summary.sourceAuthority,
        identityScope: 'EXACT_MODEL',
        extractionState: 'NOT_PARSED',
        receiptState: 'LEGACY_UNBOUND',
      });
    }
  }

  for (const document of sourceDocuments) {
    if (sourceWithPhysicalObject.has(document.id)) continue;
    const linkedReferences = new Map();
    for (const productLink of document.productLinks ?? []) {
      for (const reference of referencesByCatalogId.get(productLink.legacyRuntimeId) ?? []) {
        linkedReferences.set(reference.referenceId, reference);
      }
    }
    for (const reference of linkedReferences.values()) {
      mergeDocumentLink(links, reference.referenceId, {
        documentId: `source:${document.id}`,
        ...(document.sourceUrl ? { sourceUrl: document.sourceUrl } : {}),
        evidenceObjectIds: [document.id],
        reasonCodes: ['SOURCE_DOCUMENT_DISCOVERY_HINT'],
        corpusState: 'SOURCE_URL_ONLY',
        sourceAuthority: sourceAuthority(document),
        identityScope: sourceIdentityScope(document),
        extractionState: 'NOT_PARSED',
        receiptState: document.fields?.length ? 'LEGACY_UNBOUND' : 'NONE',
      });
    }
  }

  const jobsById = new Map((recoveryQueue.jobs ?? []).map((entry) => [entry.jobId, entry]));
  for (const target of recoveryQueue.targets ?? []) {
    if (!referenceById.has(target.referenceId)) continue;
    const knownUrls = new Set([...(links.get(target.referenceId)?.values() ?? [])]
      .map((entry) => entry.sourceUrl).filter(Boolean));
    for (const jobId of target.candidateJobIds ?? []) {
      const job = jobsById.get(jobId);
      if (!job?.sourceUrl || knownUrls.has(job.sourceUrl)) continue;
      mergeDocumentLink(links, target.referenceId, {
        documentId: `recovery:${job.jobId}`,
        sourceUrl: job.sourceUrl,
        evidenceObjectIds: [job.jobId],
        reasonCodes: ['RECOVERY_QUEUE_CANDIDATE_ONLY'],
        corpusState: 'SOURCE_URL_ONLY',
        sourceAuthority: job.authorityMode === 'official' ? 'OFFICIAL' : 'REFERENCE',
        identityScope: 'UNPROVEN',
        extractionState: 'NOT_PARSED',
        receiptState: 'NONE',
      });
    }
  }

  const imageAuditApplication = applyHistoricalPdfImageAudit({
    links,
    audit: imageRepairAudit,
    activeReferenceIds: new Set(referenceById.keys()),
  });
  applyAcceptanceReceiptReplayAudit({ links, audit: acceptanceReceiptReplayAudit });

  const snapshot = buildHistoricalModelEvidenceClassification({
    generatedAt,
    policy,
    historicalRecords: records,
    linksByReference: materializeLinks(links),
    groupsByReference: buildGroups(knowledge, referenceByExactKey),
    conflictsByReference: imageAuditApplication.conflictsByReference,
  });
  await Promise.all([
    atomicWrite(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`),
    atomicWrite(outputMarkdown, renderHistoricalModelEvidenceClassificationMarkdown(snapshot)),
  ]);
  process.stdout.write(`${JSON.stringify({
    output: relative(root, outputPath).split(sep).join('/'),
    markdown: relative(root, outputMarkdown).split(sep).join('/'),
    semanticClassificationSha256: snapshot.semanticClassificationSha256,
    summary: snapshot.summary,
  }, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main(process.argv.slice(2));
}
