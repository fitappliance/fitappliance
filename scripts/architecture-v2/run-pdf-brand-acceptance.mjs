#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runEvidenceResearchCycle } from '../../src/domain/evidence-research-runner.mjs';
import { projectEvidenceGeometry } from '../../src/domain/evidence-geometry-projector.mjs';
import { runMineruPdfToJson } from '../../src/domain/mineru-runner.mjs';
import { canonicalJsonSha256 } from '../../src/domain/historical-evidence-recovery-contract.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function argument(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function resolveWithin(root, relativePath) {
  if (isAbsolute(relativePath)) throw new TypeError('absolute evidence path rejected');
  const normalizedRoot = resolve(root);
  const candidate = resolve(normalizedRoot, relativePath);
  if (!candidate.startsWith(`${normalizedRoot}${sep}`)) throw new TypeError('evidence path escapes storage root');
  return candidate;
}

async function atomicWrite(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
}

async function objectWriter(storageRoot) {
  return async (relativePath, bytes) => {
    const path = resolveWithin(storageRoot, relativePath);
    try {
      const existing = await readFile(path);
      if (createHash('sha256').update(existing).digest('hex') !== createHash('sha256').update(bytes).digest('hex')) {
        throw new Error('content-addressed object collision');
      }
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await atomicWrite(path, bytes);
  };
}

export function acceptanceCase(entry) {
  return {
    id: entry.id,
    legacyRuntimeId: entry.legacyRuntimeId,
    brand: entry.brand,
    model: entry.model,
    category: entry.category,
    formFactor: entry.formFactor ?? null,
    candidateUrls: entry.urls ?? [entry.url],
    productPageUrls: entry.productPageUrls ?? [],
    releasableQuarantineReasons: ['evidence_projection_hold'],
    initialFailure: {
      code: 'source_identity_or_field_scope_is_incomplete',
      conflictingFields: [],
    },
    attempt: 1,
    maxAttempts: 3,
    automationState: 'research_required',
    terminalReason: null,
    sources: [],
    history: [],
  };
}

function summarizeOutcomes(outcomes) {
  return {
    entries: outcomes.length,
    accepted: outcomes.filter((row) => row.outcome === 'accepted').length,
    acceptedPdf: outcomes.filter((row) => row.artifactType === 'pdf').length,
    acceptedHtmlFallback: outcomes.filter((row) => row.artifactType === 'official_html_fallback').length,
    geometryDimensions: outcomes.filter((row) => row.geometryProjection?.evidenceLevel === 'dimensions').length,
    geometryVerified: outcomes.filter((row) => row.geometryProjection?.evidenceLevel === 'verified').length,
    fitInsufficient: outcomes.filter((row) => row.geometryProjection?.successfulFitOutcome === 'INSUFFICIENT_DATA').length,
    fitConditional: outcomes.filter((row) => row.geometryProjection?.successfulFitOutcome === 'CONDITIONAL_FIT').length,
    fitEstimated: outcomes.filter((row) => row.geometryProjection?.successfulFitOutcome === 'LIKELY_FIT_ESTIMATED').length,
    fitVerified: outcomes.filter((row) => row.geometryProjection?.successfulFitOutcome === 'VERIFIED_FIT').length,
    quarantined: outcomes.filter((row) => row.outcome === 'quarantined').length,
  };
}

function pdfBrandGraphBatch(batch) {
  const artifactJobs = [];
  const targets = [];
  for (const entry of batch.entries) {
    const urls = entry.urls ?? [entry.url];
    const candidateJobIds = urls.map((sourceUrl, index) => {
      const jobId = `pdf-brand-${canonicalJsonSha256({ id: entry.id, sourceUrl, index }).slice(0, 24)}`;
      artifactJobs.push({
        jobId,
        sourceUrl,
        authorityBrand: entry.brand,
        authorityMode: 'official',
        acquisitionRoute: 'OFFICIAL_RECEIPT_REBUILD',
        priorityClass: 'P2_CURRENT_CONFIRMATION',
        targetIds: [entry.id],
      });
      return jobId;
    });
    targets.push({
      targetId: entry.id,
      referenceId: entry.id,
      legacyRuntimeId: entry.legacyRuntimeId ?? entry.id,
      canonicalProductId: entry.id,
      brand: entry.brand,
      model: entry.model,
      category: entry.category,
      lifecycleState: 'CURRENT_RETAIL',
      requestedFields: [
        'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
      ],
      primaryJobId: candidateJobIds[0],
      candidateJobIds,
      publicationEligible: false,
      reconciliationContext: { activeReceiptSources: [], registryHints: [], legacyHints: [] },
    });
  }
  return {
    schemaVersion: 1,
    batchId: `pdf-brand-graph-${canonicalJsonSha256({ batchId: batch.batchId, entries: batch.entries }).slice(0, 24)}`,
    generatedAt: batch.reviewedAt,
    queue: { schemaVersion: 2, sha256: canonicalJsonSha256({ sourceBatchId: batch.batchId, entries: batch.entries }) },
    policy: { version: 'pdf-brand-compatibility-v1', sha256: canonicalJsonSha256({ adapter: 'pdf-brand-compatibility-v1' }) },
    selection: { jobIds: [], routes: [], priorities: [], brands: [], limit: null },
    artifactJobs,
    targets,
    summary: {
      artifactJobs: artifactJobs.length,
      targets: targets.length,
      candidateEdges: artifactJobs.reduce((count, job) => count + job.targetIds.length, 0),
    },
  };
}

function legacyOutcomeFromGraph(entry, graphOutcome) {
  const source = graphOutcome?.sources?.[0] ?? null;
  const accepted = graphOutcome?.status === 'accepted';
  return {
    id: entry.id,
    brand: entry.brand,
    model: entry.model,
    category: entry.category,
    requestedUrl: entry.url,
    requestedUrls: entry.urls ?? [entry.url],
    outcome: accepted ? 'accepted' : 'quarantined',
    acquisition: source ? 'passed' : 'failed',
    mineru: source?.derivedArtifact ? 'passed' : 'not_run_or_failed',
    identity: source?.identity?.outcome ?? 'not_accepted',
    claims: source?.claims?.map((claim) => ({ field: claim.field, value: claim.value, page: claim.page })) ?? [],
    receipt: source?.verificationReceipt ? 'passed' : 'not_accepted',
    geometryProjection: graphOutcome?.geometryProjection ?? null,
    artifactType: source?.contentType === 'application/pdf'
      ? 'pdf'
      : source?.contentType === 'text/html' ? 'official_html_fallback' : null,
    source: source ? structuredClone(source) : null,
    diagnosticArtifacts: {
      pdfObjectPath: source?.contentType === 'application/pdf' ? source.objectPath ?? null : null,
      derivedArtifact: source?.derivedArtifact ?? null,
    },
    failures: accepted ? [] : [{
      candidateUrl: entry.url,
      reason: graphOutcome?.failureCode ?? 'graph_outcome_missing',
    }],
  };
}

export async function runPdfBrandAcceptanceBatch(batch, options) {
  if (batch?.schemaVersion !== 1 || !Array.isArray(batch.entries)) throw new TypeError('PDF brand batch required');
  if (typeof options?.graphRunner === 'function') {
    const graph = pdfBrandGraphBatch(batch);
    const graphResult = await options.graphRunner(graph, options.graphDependencies ?? {});
    const byTargetId = new Map((graphResult?.outcomes ?? []).map((outcome) => [outcome.targetId, outcome]));
    const outcomes = batch.entries.map((entry) => legacyOutcomeFromGraph(entry, byTargetId.get(entry.id)));
    if (options.onProgress) {
      for (let index = 1; index <= outcomes.length; index += 1) await options.onProgress(outcomes.slice(0, index));
    }
    return {
      schemaVersion: 1,
      batchId: batch.batchId,
      reviewedAt: batch.reviewedAt,
      summary: summarizeOutcomes(outcomes),
      outcomes,
    };
  }
  const writeObject = await objectWriter(options.storageRoot);
  const outcomes = [];
  for (const entry of batch.entries) {
    const diagnostics = { acquisition: 'not_started', mineru: 'not_started', pdfObjectPath: null, derivedArtifact: null };
    const result = await runEvidenceResearchCycle(acceptanceCase(entry), {
      now: batch.reviewedAt,
      writeObject,
      fetchAttempts: 1,
      timeoutMs: 30000,
      allowCurlFallback: true,
      processPdf: async (bytes) => {
        diagnostics.acquisition = 'passed';
        const pdfSha256 = createHash('sha256').update(bytes).digest('hex');
        diagnostics.pdfObjectPath = `evidence/web/sha256/${pdfSha256.slice(0, 2)}/${pdfSha256.slice(2, 4)}/${pdfSha256}.pdf`;
        await writeObject(diagnostics.pdfObjectPath, bytes);
        const processed = await runMineruPdfToJson(bytes, { storageRoot: options.storageRoot });
        diagnostics.mineru = 'passed';
        diagnostics.derivedArtifact = processed.derivedArtifact;
        await writeObject(processed.derivedArtifact.objectPath, processed.jsonBytes);
        return processed;
      },
    });
    const source = result.caseRecord.sources[0] ?? null;
    const geometryProjection = source ? projectEvidenceGeometry({
      brand: entry.brand,
      model: entry.model,
      category: entry.category,
      formFactor: entry.formFactor ?? null,
      sources: [source],
    }) : null;
    outcomes.push({
      id: entry.id,
      brand: entry.brand,
      model: entry.model,
      category: entry.category,
      requestedUrl: entry.url,
      requestedUrls: entry.urls ?? [entry.url],
      outcome: source ? 'accepted' : 'quarantined',
      acquisition: diagnostics.acquisition === 'passed' || source ? 'passed' : 'failed',
      mineru: source?.derivedArtifact || diagnostics.mineru === 'passed' ? 'passed' : 'not_run_or_failed',
      identity: source?.identity?.outcome ?? 'not_accepted',
      claims: source?.claims?.map((claim) => ({ field: claim.field, value: claim.value, page: claim.page })) ?? [],
      receipt: source?.verificationReceipt ? 'passed' : 'not_accepted',
      geometryProjection,
      artifactType: source?.contentType === 'application/pdf'
        ? 'pdf'
        : source?.contentType === 'text/html' ? 'official_html_fallback' : null,
      source: source ? structuredClone(source) : null,
      diagnosticArtifacts: {
        pdfObjectPath: diagnostics.pdfObjectPath,
        derivedArtifact: diagnostics.derivedArtifact,
      },
      failures: result.failures,
    });
    if (options.onProgress) await options.onProgress(outcomes);
  }
  return {
    schemaVersion: 1,
    batchId: batch.batchId,
    reviewedAt: batch.reviewedAt,
    summary: summarizeOutcomes(outcomes),
    outcomes,
  };
}

async function main(args) {
  const storageRoot = argument(args, '--storage-root') ?? process.env.FITAPPLIANCE_STORAGE_ROOT;
  if (!storageRoot) throw new TypeError('storage root required');
  const inputPath = resolve(argument(args, '--input') ?? resolve(repoRoot, 'data/architecture-v2/reviews/automated/pdf-brand-acceptance-batch.json'));
  const outputPath = resolve(argument(args, '--output') ?? resolve(repoRoot, 'data/architecture-v2/reviews/automated/pdf-brand-acceptance-results.json'));
  const batch = JSON.parse(await readFile(inputPath, 'utf8'));
  const checkpoint = async (outcomes) => atomicWrite(outputPath, `${JSON.stringify({
    schemaVersion: 1,
    batchId: batch.batchId,
    reviewedAt: batch.reviewedAt,
    incomplete: outcomes.length !== batch.entries.length,
    summary: {
      entries: outcomes.length,
      accepted: outcomes.filter((row) => row.outcome === 'accepted').length,
      acceptedPdf: outcomes.filter((row) => row.artifactType === 'pdf').length,
      acceptedHtmlFallback: outcomes.filter((row) => row.artifactType === 'official_html_fallback').length,
      geometryDimensions: outcomes.filter((row) => row.geometryProjection?.evidenceLevel === 'dimensions').length,
      geometryVerified: outcomes.filter((row) => row.geometryProjection?.evidenceLevel === 'verified').length,
      fitInsufficient: outcomes.filter((row) => row.geometryProjection?.successfulFitOutcome === 'INSUFFICIENT_DATA').length,
      fitConditional: outcomes.filter((row) => row.geometryProjection?.successfulFitOutcome === 'CONDITIONAL_FIT').length,
      fitEstimated: outcomes.filter((row) => row.geometryProjection?.successfulFitOutcome === 'LIKELY_FIT_ESTIMATED').length,
      fitVerified: outcomes.filter((row) => row.geometryProjection?.successfulFitOutcome === 'VERIFIED_FIT').length,
      quarantined: outcomes.filter((row) => row.outcome === 'quarantined').length,
    },
    outcomes,
  }, null, 2)}\n`);
  const result = await runPdfBrandAcceptanceBatch(batch, { storageRoot, onProgress: checkpoint });
  await atomicWrite(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
