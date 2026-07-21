import { createHash } from 'node:crypto';
import { readFile as readFileFs } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

import { isCurrentRetailProduct } from './historical-appliance-reference.mjs';
import { inspectMineruContentListV2 } from './mineru-document.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const REQUESTED_FIELDS = Object.freeze([
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
]);
const COMPLETE_EXTRACTION_STATES = new Set(['ALL_AXIS_SCALAR', 'ALL_AXIS_RANGE']);

function requiredText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function keyPart(value) {
  return requiredText(value, 'identity value').toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function identityKey(value) {
  return `${keyPart(value.brand ?? value.canonicalBrand)}\0${keyPart(value.model)}\0${requiredText(value.category ?? value.cat, 'category')}`;
}

function trustedHttpsUrl(value) {
  const url = new URL(requiredText(value, 'PDF source URL'));
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new TypeError('PDF source URL must use trusted HTTPS');
  }
  url.hash = '';
  return url.toString();
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function storagePath(storageRoot, relativePath) {
  const root = resolve(requiredText(storageRoot, 'storage root'));
  const path = resolve(root, ...requiredText(relativePath, 'storage object path').split('/'));
  if (!path.startsWith(`${root}${sep}`)) throw new Error('evidence object escaped storage root');
  return path;
}

function completeDimensions(value) {
  return value && ['width', 'height', 'depth']
    .every((axis) => Number.isFinite(Number(value[axis])) && Number(value[axis]) > 0);
}

function normalizedDimensions(value) {
  if (!completeDimensions(value)) return null;
  return {
    width: Number(value.width),
    height: Number(value.height),
    depth: Number(value.depth),
  };
}

function replayTargetId(referenceId, legacyRuntimeId, brand, model, category) {
  const seed = [
    'historical-evidence-target-v1',
    referenceId,
    String(legacyRuntimeId).toLowerCase(),
    keyPart(brand).toLowerCase(),
    requiredText(model, 'model').toUpperCase(),
    category,
    ...REQUESTED_FIELDS,
  ].join('\0');
  return `recovery_target_${createHash('sha256').update(seed).digest('hex').slice(0, 24)}`;
}

function replayJobId(link, brand) {
  const seed = ['historical-pdf-offline-replay-v1', link.sourcePdfSha256, link.sourceUrl, keyPart(brand)].join('\0');
  return `offline_replay_${createHash('sha256').update(seed).digest('hex').slice(0, 24)}`;
}

function priorityClass(reference) {
  if (reference.lifecycleState === 'CURRENT_RETAIL') {
    return reference.lookupAction === 'MEASURE_REQUIRED'
      ? 'P0_CURRENT_MISSING_DIMENSIONS'
      : 'P2_CURRENT_CONFIRMATION';
  }
  return reference.lookupAction === 'MEASURE_REQUIRED'
    ? 'P1_HISTORICAL_MISSING_DIMENSIONS'
    : 'P3_HISTORICAL_CONFIRMATION';
}

function registryDimensionHints(reference) {
  const dimensionsMm = normalizedDimensions(reference.dimensionsMm);
  if (reference.registryDimensionState !== 'CONSISTENT' || !dimensionsMm) return [];
  return (reference.sources ?? [])
    .filter((source) => source?.sourceId !== 'fitappliance:catalog'
      && SHA256.test(String(source?.snapshotSha256 ?? '')))
    .map((source) => ({
      sourceId: source.sourceId,
      snapshotSha256: source.snapshotSha256,
      dimensionsMm,
    }))
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));
}

function indexUnique(rows, keyFor, label) {
  const values = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    if (values.has(key)) throw new TypeError(`duplicate ${label}: ${key}`);
    values.set(key, row);
  }
  return values;
}

function acceptedIdentityIndex(bundle) {
  const referenceIds = new Set();
  const identities = new Set();
  for (const entry of bundle?.entries ?? []) {
    if (!['accepted', 'receipt_accepted_non_scalar'].includes(entry.acceptanceStatus)) continue;
    referenceIds.add(requiredText(entry.referenceId, 'accepted reference ID'));
    identities.add(identityKey(entry));
  }
  return { referenceIds, identities };
}

function replayableLinks(record) {
  return (record.documentLinks ?? []).filter((link) => (
    link.corpusState === 'CURRENT_MINERU'
    && link.sourceAuthority === 'OFFICIAL'
    && link.identityScope === 'EXACT_MODEL'
    && COMPLETE_EXTRACTION_STATES.has(link.extractionState)
    && SHA256.test(String(link.sourcePdfSha256 ?? ''))
  ));
}

function currentProductFor(reference, productsById) {
  const candidates = (reference.catalogProductIds ?? [])
    .map((id) => productsById.get(String(id).toLowerCase()))
    .filter(Boolean)
    .filter((product) => identityKey(product) === identityKey(reference))
    .filter(isCurrentRetailProduct);
  if (candidates.length !== 1) {
    throw new Error(`${reference.referenceId} must bind exactly one current catalog product; found ${candidates.length}`);
  }
  const canonicalProductId = requiredText(candidates[0].canonicalProductId, 'current canonical product ID');
  return { legacyRuntimeId: requiredText(candidates[0].id, 'current catalog product ID'), canonicalProductId };
}

function archivedProductFor(reference, productsById) {
  const candidates = (reference.catalogProductIds ?? [])
    .map((id) => productsById.get(String(id).toLowerCase()))
    .filter(Boolean)
    .filter((product) => identityKey(product) === identityKey(reference))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const product = candidates[0] ?? null;
  return {
    legacyRuntimeId: product?.id ?? `historical-${reference.referenceId}`,
    canonicalProductId: product?.canonicalProductId ?? null,
  };
}

function productBinding(reference, productsById) {
  if (reference.lifecycleState === 'CURRENT_RETAIL') return currentProductFor(reference, productsById);
  if (reference.lifecycleState === 'CATALOG_ARCHIVED') return archivedProductFor(reference, productsById);
  throw new Error(`unsupported offline replay lifecycle ${reference.lifecycleState}`);
}

function canonicalReplayOutcome(imageRepairAudit, record, link) {
  if (imageRepairAudit?.schemaVersion !== 1 || !Array.isArray(imageRepairAudit.outcomes)) {
    throw new TypeError('historical PDF image repair audit schema v1 required');
  }
  const matches = imageRepairAudit.outcomes.filter((outcome) => (
    outcome.referenceId === record.referenceId
    && outcome.sourcePdfSha256 === link.sourcePdfSha256
  ));
  if (matches.length !== 1) {
    throw new Error(`canonical parser replay edge missing or ambiguous for ${record.referenceId}`);
  }
  const outcome = matches[0];
  const dimensions = outcome.dimensionEvidence ?? outcome.dimensionsMm;
  if (outcome.decision !== 'READY_FOR_RECEIPT_REPLAY'
    || outcome.extractionStatus !== 'extracted'
    || outcome.evidenceBinding?.sourcePdfSha256 !== link.sourcePdfSha256
    || outcome.officialSource?.referenceId !== record.referenceId
    || outcome.officialSource?.documentId !== `pdf:${link.sourcePdfSha256}`
    || outcome.officialSource?.sourceAuthority !== 'OFFICIAL'
    || !['width', 'height', 'depth'].every((axis) => Number.isFinite(dimensions?.[axis]))) {
    throw new Error(`canonical parser audit is not replay ready for ${record.referenceId}`);
  }
  return outcome;
}

function assertAuditReplay(pdf, record, link, imageRepairAudit) {
  if (!pdf) throw new Error(`PDF audit record missing for replay ${link.sourcePdfSha256}`);
  if (pdf.sourceAuthority !== 'OFFICIAL' || pdf.mineruIndex?.status !== 'indexed'
    || !Array.isArray(pdf.physicalPaths) || pdf.physicalPaths.length < 1) {
    throw new Error(`PDF audit is not replay ready for ${link.sourcePdfSha256}`);
  }
  const modelLinks = (pdf.modelLinks ?? []).filter((candidate) => (
    candidate.referenceId === record.referenceId
    && identityKey(candidate) === identityKey(record)
    && candidate.identityScope === 'EXACT_MODEL'
  ));
  if (modelLinks.length !== 1) {
    throw new Error(`PDF audit replay edge missing or ambiguous for ${record.referenceId}`);
  }
  canonicalReplayOutcome(imageRepairAudit, record, link);
}

function countBy(rows, keyFor) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

export function buildHistoricalPdfOfflineReplayQueue({
  classification,
  historicalReference,
  publicProjection,
  legacyPdfAudit,
  imageRepairAudit,
  priorAcceptanceBundle = { entries: [] },
}) {
  if (classification?.schemaVersion !== 1 || !Array.isArray(classification.records)) {
    throw new TypeError('historical model classification schema v1 required');
  }
  if (!Array.isArray(historicalReference?.records)) throw new TypeError('historical reference records required');
  if (!Array.isArray(publicProjection?.products)) throw new TypeError('public catalog products required');
  if (!Array.isArray(legacyPdfAudit?.pdfDocuments)) throw new TypeError('legacy PDF audit documents required');
  const generatedAt = new Date(classification.generatedAt).toISOString();
  const references = indexUnique(historicalReference.records, (row) => row.referenceId, 'historical reference');
  const productsById = indexUnique(publicProjection.products, (row) => String(row.id).toLowerCase(), 'catalog product');
  const pdfsByHash = indexUnique(legacyPdfAudit.pdfDocuments, (row) => row.sourcePdfSha256, 'PDF audit hash');
  const accepted = acceptedIdentityIndex(priorAcceptanceBundle);
  const replayRecords = classification.records.filter((record) => record.operationalClass === 'OFFLINE_REPLAY');
  indexUnique(replayRecords, (row) => row.referenceId, 'offline replay reference');
  indexUnique(replayRecords, identityKey, 'offline replay identity');

  const excluded = {};
  const targets = [];
  const jobs = new Map();
  const artifacts = new Map();
  for (const record of replayRecords) {
    const reference = references.get(record.referenceId);
    if (!reference || identityKey(reference) !== identityKey(record)) {
      throw new Error(`classification identity drift for ${record.referenceId}`);
    }
    if (accepted.referenceIds.has(record.referenceId) || accepted.identities.has(identityKey(record))) {
      excluded.ALREADY_RECEIPT_BOUND = (excluded.ALREADY_RECEIPT_BOUND ?? 0) + 1;
      continue;
    }
    const links = replayableLinks(record);
    if (links.length !== 1) {
      throw new Error(`${record.referenceId} must bind exactly one replayable PDF; found ${links.length}`);
    }
    const link = { ...links[0], sourceUrl: trustedHttpsUrl(links[0].sourceUrl) };
    const pdf = pdfsByHash.get(link.sourcePdfSha256);
    assertAuditReplay(pdf, record, link, imageRepairAudit);
    const product = productBinding(reference, productsById);
    const targetId = replayTargetId(
      reference.referenceId,
      product.legacyRuntimeId,
      reference.brand,
      reference.model,
      reference.category,
    );
    const jobId = replayJobId(link, reference.brand);
    const legacyDimensions = normalizedDimensions(reference.dimensionsMm);
    const sourceDocumentId = `offline-pdf:${link.sourcePdfSha256}`;
    const target = {
      referenceId: reference.referenceId,
      legacyRuntimeId: product.legacyRuntimeId,
      canonicalProductId: product.canonicalProductId,
      category: reference.category,
      brand: reference.brand,
      model: reference.model,
      lifecycleState: reference.lifecycleState,
      currentLookupAction: reference.lookupAction,
      priorityClass: priorityClass(reference),
      publicationEligible: false,
      targetId,
      requestedFields: [...REQUESTED_FIELDS],
      sourceDocumentIds: [sourceDocumentId],
      legacyHints: legacyDimensions ? [{ sourceDocumentId, dimensionsMm: legacyDimensions }] : [],
      registryDimensionHints: registryDimensionHints(reference),
      candidateJobIds: [jobId],
      primaryJobId: jobId,
    };
    targets.push(target);

    const existingJob = jobs.get(jobId);
    if (existingJob && (existingJob.sourceUrl !== link.sourceUrl
      || existingJob.authorityBrand !== reference.brand)) {
      throw new Error(`offline replay job collision ${jobId}`);
    }
    const job = existingJob ?? {
      jobId,
      sourceUrl: link.sourceUrl,
      authorityBrand: reference.brand,
      authorityMode: 'official',
      acquisitionRoute: 'OFFICIAL_RECEIPT_REBUILD',
      priorityClass: target.priorityClass,
      transportHostTypes: ['manufacturer'],
      authorTypes: ['manufacturer'],
      checkpoints: ['downloaded', 'mineru_json', 'identity', 'claims', 'receipt'],
      targetIds: [],
    };
    job.targetIds.push(targetId);
    jobs.set(jobId, job);
    artifacts.set(jobId, {
      jobId,
      sourcePdfSha256: link.sourcePdfSha256,
      sourceUrl: link.sourceUrl,
      physicalPaths: [...pdf.physicalPaths].sort(),
      mineruIndex: structuredClone(pdf.mineruIndex),
    });
  }

  targets.sort((left, right) => left.priorityClass.localeCompare(right.priorityClass)
    || left.brand.localeCompare(right.brand, 'en-AU', { sensitivity: 'base' })
    || left.model.localeCompare(right.model, 'en-AU', { sensitivity: 'base' })
    || left.referenceId.localeCompare(right.referenceId));
  const sortedJobs = [...jobs.values()].map((job) => ({
    ...job,
    targetIds: [...new Set(job.targetIds)].sort(),
  })).sort((left, right) => left.jobId.localeCompare(right.jobId));
  const replayArtifacts = [...artifacts.values()].sort((left, right) => left.jobId.localeCompare(right.jobId));
  return Object.freeze({
    schemaVersion: 2,
    generatedAt,
    policy: {
      legacyDimensionsAreHintsOnly: true,
      automaticPublicationRequiresAllCheckpoints: true,
      officialSourceRequiredForReceiptPromotion: true,
      authorityContextRequired: true,
      frozenPdfReplayRequiresCurrentMineru: true,
    },
    summary: {
      candidateModels: replayRecords.length,
      artifacts: replayArtifacts.length,
      fetchJobs: sortedJobs.length,
      targets: targets.length,
      candidateEdges: sortedJobs.reduce((count, job) => count + job.targetIds.length, 0),
      uniqueReferences: new Set(targets.map((target) => target.referenceId)).size,
      byLifecycle: countBy(targets, (target) => target.lifecycleState),
      byCategory: countBy(targets, (target) => target.category),
      excluded: Object.fromEntries(Object.entries(excluded).sort(([left], [right]) => left.localeCompare(right))),
    },
    replayArtifacts,
    jobs: sortedJobs,
    targets,
  });
}

export async function loadHistoricalPdfReplayArtifact({
  job,
  replayArtifact,
  storageRoot,
  readFile = readFileFs,
  writeObject = null,
}) {
  if (job?.authorityMode !== 'official') throw new Error('offline replay requires official authority mode');
  if (requiredText(job?.jobId, 'artifact job ID') !== requiredText(replayArtifact?.jobId, 'replay artifact job ID')) {
    throw new Error('offline replay artifact job binding mismatch');
  }
  const sourceUrl = trustedHttpsUrl(job.sourceUrl);
  if (sourceUrl !== trustedHttpsUrl(replayArtifact.sourceUrl)) {
    throw new Error('offline replay source URL binding mismatch');
  }
  const expectedPdfSha = requiredText(replayArtifact.sourcePdfSha256, 'source PDF SHA-256');
  if (!SHA256.test(expectedPdfSha)) throw new Error('source PDF SHA-256 invalid');
  if (replayArtifact.mineruIndex?.status !== 'indexed'
    || replayArtifact.mineruIndex?.sourcePdfSha256 !== expectedPdfSha) {
    throw new Error('frozen MinerU index snapshot is not replay ready');
  }

  let pdfBytes = null;
  let objectPath = null;
  let lastReadError = null;
  for (const relativePath of [...new Set(replayArtifact.physicalPaths ?? [])].sort()) {
    const path = storagePath(storageRoot, relativePath);
    try {
      const candidate = Buffer.from(await readFile(path));
      if (candidate.subarray(0, 5).toString('ascii') !== '%PDF-' || sha256(candidate) !== expectedPdfSha) {
        throw new Error(`PDF object integrity mismatch: ${relativePath}`);
      }
      pdfBytes = candidate;
      objectPath = relativePath;
      break;
    } catch (error) {
      if (String(error?.message ?? error).includes('PDF object integrity mismatch')) throw error;
      lastReadError = error;
    }
  }
  if (!pdfBytes || !objectPath) {
    throw new Error(`PDF object unavailable for offline replay: ${String(lastReadError?.message ?? 'no physical paths')}`);
  }
  const canonicalObjectPath = `evidence/web/sha256/${expectedPdfSha.slice(0, 2)}/${expectedPdfSha.slice(2, 4)}/${expectedPdfSha}.pdf`;
  if (objectPath !== canonicalObjectPath) {
    if (typeof writeObject !== 'function') throw new Error('canonical evidence object writer required');
    await writeObject(canonicalObjectPath, pdfBytes);
    objectPath = canonicalObjectPath;
  }

  const indexPath = storagePath(storageRoot, `cache/mineru-index/${expectedPdfSha}.json`);
  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  const frozen = replayArtifact.mineruIndex;
  if (index.schemaVersion !== 1 || index.sourcePdfSha256 !== expectedPdfSha
    || index.parserVersion !== frozen.parserVersion
    || index.modelRevision !== frozen.modelRevision) {
    throw new Error('MinerU index metadata drift from audited replay snapshot');
  }
  const derived = index.derivedArtifact;
  if (derived?.schemaVersion !== 1 || derived.format !== 'content_list_v2'
    || derived.parserName !== 'MinerU' || derived.sourcePdfSha256 !== expectedPdfSha
    || derived.parserVersion !== index.parserVersion || derived.modelRevision !== index.modelRevision
    || !SHA256.test(String(derived.contentSha256 ?? ''))
    || !Number.isInteger(derived.byteSize) || derived.byteSize < 1) {
    throw new Error('MinerU derived artifact metadata invalid');
  }
  const derivedArtifactBytes = Buffer.from(await readFile(storagePath(storageRoot, derived.objectPath)));
  if (derivedArtifactBytes.length !== derived.byteSize || sha256(derivedArtifactBytes) !== derived.contentSha256) {
    throw new Error('MinerU derived JSON integrity mismatch');
  }
  const inspected = inspectMineruContentListV2(derivedArtifactBytes);
  if (inspected.contentSha256 !== derived.contentSha256 || inspected.pageCount !== derived.pageCount) {
    throw new Error('MinerU derived JSON metadata does not match content_list_v2');
  }

  return Object.freeze({
    schemaVersion: 1,
    sourceUrl,
    authorityBrand: requiredText(job.authorityBrand, 'authority brand'),
    authorityMode: 'official',
    requestedUrl: sourceUrl,
    finalUrl: sourceUrl,
    redirectChain: [],
    contentType: 'application/pdf',
    contentSha256: expectedPdfSha,
    objectPath,
    byteSize: pdfBytes.length,
    bytes: pdfBytes,
    derivedArtifact: structuredClone(derived),
    derivedArtifactBytes,
  });
}
