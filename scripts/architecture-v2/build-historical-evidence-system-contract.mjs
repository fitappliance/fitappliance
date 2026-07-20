#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  architectureV2Paths,
  resolveArchitectureV2Path,
} from '../../src/domain/architecture-v2-paths.mjs';
import {
  buildHistoricalDimensionsScaleControl,
} from '../../src/domain/historical-dimensions-scale-control.mjs';
import {
  buildHistoricalEvidenceBoundedBatches,
  validateHistoricalEvidenceBoundedBatches,
} from '../../src/domain/historical-evidence-bounded-batch.mjs';
import {
  filterHistoricalAcceptanceBundleByReceiptReplayAudit,
} from '../../src/domain/historical-evidence-recovery-audit.mjs';
import {
  canonicalJsonSha256,
  validateHistoricalEvidenceRecoveryAcceptanceBundle,
} from '../../src/domain/historical-evidence-recovery-contract.mjs';
import {
  buildHistoricalEvidenceProgramStatus,
} from '../../src/domain/historical-evidence-program-status.mjs';
import {
  buildHistoricalEvidenceSystemContract,
  validateHistoricalEvidenceSystemContract,
} from '../../src/domain/historical-evidence-system-contract.mjs';
import {
  buildHistoricalEvidenceTargetState,
} from '../../src/domain/historical-evidence-target-state.mjs';
import {
  assertHistoricalReplacementAudit,
} from '../../src/domain/historical-replacement-audit.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const ARTIFACT_KEYS = Object.freeze([
  'retailerObservations',
  'officialRegistrySnapshots',
  'canonicalRegistry',
  'historicalEvidenceRecoveryAcceptanceBundle',
  'historicalAcceptanceReceiptReplayAudit',
  'historicalEvidenceRecoveryAttemptLedger',
  'publicProjection',
  'historicalApplianceReference',
  'historicalModelEvidenceClassification',
  'historicalDocumentFamilyGraph',
  'dimensionExpressionObservations',
  'historicalMineruBackfillAudit',
  'historicalModelPdfAcquisitionQueue',
  'historicalOfficialCandidateManifest',
  'historicalExecutableEvidenceRecoveryQueue',
  'historicalEvidenceFamilyCanaries',
  'historicalEvidenceTargetState',
  'historicalEvidenceNextBatches',
  'historicalReplacementAudit',
  'fitPublicationAudit',
  'historicalEvidenceProgramStatus',
  'historicalDimensionsScaleLedger',
  'historicalDimensionsScaleControl',
]);

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new TypeError(`${name} requires a value`);
  return value;
}

function assertCanonicalEqual(label, actual, expected) {
  if (canonicalJsonSha256(actual) !== canonicalJsonSha256(expected)) {
    throw new Error(`${label} does not replay from the released tracked sources`);
  }
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) throw new Error(`${label} mismatch`);
}

function classificationSemantic(value) {
  return {
    schemaVersion: value.schemaVersion,
    policyVersion: value.policyVersion,
    summary: value.summary,
    categorySummaries: value.categorySummaries,
    topGaps: value.topGaps,
    records: value.records,
  };
}

function documentGraphSemantic(value) {
  return {
    schemaVersion: value.schemaVersion,
    policy: value.policy,
    summary: value.summary,
    sourceVersions: value.sourceVersions,
    nonIndexedClassificationLinks: value.nonIndexedClassificationLinks,
    documents: value.documents,
    families: value.families,
  };
}

function acquisitionQueueSemantic(value) {
  return {
    sourceClassificationSha256: value.sourceClassificationSha256,
    records: value.records,
    sources: value.sources,
    excluded: value.excluded,
  };
}

function officialCandidateSemantic(value) {
  return {
    sourceAcquisitionQueueSha256: value.sourceAcquisitionQueueSha256,
    runBindings: value.runBindings,
    candidates: value.candidates,
    targets: value.targets,
  };
}

function familyCanarySemantic(value) {
  return {
    schemaVersion: value.schemaVersion,
    generatedAt: value.generatedAt,
    documentGraphSha256: value.documentGraphSha256,
    executableQueueSha256: value.executableQueueSha256,
    policySha256: value.policySha256,
    parserContractSha256: value.parserContractSha256,
    processorEpochs: value.processorEpochs,
    families: value.families,
    targetDecisions: value.targetDecisions,
  };
}

function boundedBatchesSemantic(value) {
  return {
    schemaVersion: value.schemaVersion,
    plannerVersion: value.plannerVersion,
    generatedAt: value.generatedAt,
    maximumTargets: value.maximumTargets,
    sourceBindings: value.sourceBindings,
    workstreams: value.workstreams,
    manifests: value.manifests,
    summary: value.summary,
  };
}

function receiptReplaySemantic(value) {
  return {
    sourceBundleSha256: value.sourceBundleSha256,
    outcomes: value.outcomes,
  };
}

function scaleControlSemantic(value) {
  const { controlId, semanticControlSha256, ...semantic } = value;
  return semantic;
}

function nativeSemantic(key, value) {
  if (key === 'historicalModelEvidenceClassification') {
    return { payload: classificationSemantic(value), declared: value.semanticClassificationSha256 };
  }
  if (key === 'historicalDocumentFamilyGraph') {
    return { payload: documentGraphSemantic(value), declared: value.semanticGraphSha256 };
  }
  if (key === 'historicalModelPdfAcquisitionQueue') {
    return { payload: acquisitionQueueSemantic(value), declared: value.semanticQueueSha256 };
  }
  if (key === 'historicalOfficialCandidateManifest') {
    return { payload: officialCandidateSemantic(value), declared: value.semanticManifestSha256 };
  }
  if (key === 'historicalEvidenceFamilyCanaries') {
    return { payload: familyCanarySemantic(value), declared: value.semanticCanarySha256 };
  }
  if (key === 'historicalEvidenceNextBatches') {
    return { payload: boundedBatchesSemantic(value), declared: value.semanticBatchesSha256 };
  }
  if (key === 'historicalAcceptanceReceiptReplayAudit') {
    return { payload: receiptReplaySemantic(value), declared: value.semanticAuditSha256 };
  }
  if (key === 'historicalDimensionsScaleControl') {
    return { payload: scaleControlSemantic(value), declared: value.semanticControlSha256 };
  }
  return { payload: value, declared: null };
}

function latestTimestamp(artifacts) {
  const values = Object.values(artifacts).flatMap((value) => [
    value.generatedAt,
    value.acquiredAt,
    value.activatedAt,
    value.last_updated,
  ]).map((value) => new Date(value ?? '').valueOf()).filter(Number.isFinite);
  if (!values.length) throw new TypeError('system contract source timestamp required');
  return new Date(Math.max(...values)).toISOString();
}

function retailerMigrationCounts(publicProjection, retailerObservations) {
  const observationKeys = new Set((retailerObservations.observations ?? []).map((observation) => (
    `${observation.canonicalProductId}\0${observation.retailer}\0${observation.url}`
  )));
  let rowsWithRetailerLinks = 0;
  let retailerLinksRequiringObservationMigration = 0;
  for (const product of publicProjection.products ?? []) {
    const retailers = product.retailers ?? [];
    if (retailers.length > 0) rowsWithRetailerLinks += 1;
    for (const retailer of retailers) {
      const key = `${product.canonicalProductId}\0${retailer.name ?? retailer.retailer ?? ''}\0${retailer.url ?? ''}`;
      if (!observationKeys.has(key)) retailerLinksRequiringObservationMigration += 1;
    }
  }
  return { rowsWithRetailerLinks, retailerLinksRequiringObservationMigration };
}

async function readArtifacts(root) {
  return Object.fromEntries(await Promise.all(ARTIFACT_KEYS.map(async (key) => [
    key,
    JSON.parse(await readFile(resolveArchitectureV2Path(root, key), 'utf8')),
  ])));
}

function verifyCurrentReplay(artifacts) {
  const acceptanceBundle = validateHistoricalEvidenceRecoveryAcceptanceBundle(
    artifacts.historicalEvidenceRecoveryAcceptanceBundle,
  );
  filterHistoricalAcceptanceBundleByReceiptReplayAudit(
    acceptanceBundle,
    artifacts.historicalAcceptanceReceiptReplayAudit,
  );
  assertHistoricalReplacementAudit(artifacts.historicalReplacementAudit);

  const targetState = buildHistoricalEvidenceTargetState({
    generatedAt: artifacts.historicalEvidenceTargetState.generatedAt,
    classification: artifacts.historicalModelEvidenceClassification,
    acquisitionQueue: artifacts.historicalModelPdfAcquisitionQueue,
    executableQueue: artifacts.historicalExecutableEvidenceRecoveryQueue,
    acceptanceBundle,
    attemptLedger: artifacts.historicalEvidenceRecoveryAttemptLedger,
  });
  assertCanonicalEqual('historical target state', artifacts.historicalEvidenceTargetState, targetState);

  validateHistoricalEvidenceBoundedBatches(artifacts.historicalEvidenceNextBatches);
  const nextBatches = buildHistoricalEvidenceBoundedBatches({
    executableQueue: artifacts.historicalExecutableEvidenceRecoveryQueue,
    targetState,
    familyCanaries: artifacts.historicalEvidenceFamilyCanaries,
    maximumTargets: artifacts.historicalEvidenceNextBatches.maximumTargets,
  });
  assertCanonicalEqual('historical bounded batches', artifacts.historicalEvidenceNextBatches, nextBatches);

  const status = buildHistoricalEvidenceProgramStatus({
    generatedAt: artifacts.historicalEvidenceProgramStatus.generatedAt,
    classification: artifacts.historicalModelEvidenceClassification,
    knowledge: artifacts.dimensionExpressionObservations,
    documentGraph: artifacts.historicalDocumentFamilyGraph,
    acquisitionQueue: artifacts.historicalModelPdfAcquisitionQueue,
    executableQueue: artifacts.historicalExecutableEvidenceRecoveryQueue,
    acceptanceBundle,
    attemptLedger: artifacts.historicalEvidenceRecoveryAttemptLedger,
    targetState,
    mineruBackfillAudit: artifacts.historicalMineruBackfillAudit,
    receiptReplayAudit: artifacts.historicalAcceptanceReceiptReplayAudit,
    replacementAudit: artifacts.historicalReplacementAudit,
    fitPublicationAudit: artifacts.fitPublicationAudit,
  });
  assertCanonicalEqual('historical evidence programme status', artifacts.historicalEvidenceProgramStatus, status);

  const scaleControl = buildHistoricalDimensionsScaleControl({
    generatedAt: artifacts.historicalDimensionsScaleControl.generatedAt,
    ledger: artifacts.historicalDimensionsScaleLedger,
    nextBatches,
    programStatus: status,
    receiptAudit: artifacts.historicalAcceptanceReceiptReplayAudit,
    replacementAudit: artifacts.historicalReplacementAudit,
    fitPublicationAudit: artifacts.fitPublicationAudit,
  });
  assertCanonicalEqual('historical dimensions scale control', artifacts.historicalDimensionsScaleControl, scaleControl);

  assertEqual(
    'classification -> acquisition semantic binding',
    artifacts.historicalModelPdfAcquisitionQueue.sourceClassificationSha256,
    artifacts.historicalModelEvidenceClassification.semanticClassificationSha256,
  );
  assertEqual(
    'acquisition -> official candidate semantic binding',
    artifacts.historicalOfficialCandidateManifest.sourceAcquisitionQueueSha256,
    artifacts.historicalModelPdfAcquisitionQueue.semanticQueueSha256,
  );
  assertEqual(
    'official candidate -> executable semantic binding',
    artifacts.historicalExecutableEvidenceRecoveryQueue.sourceOfficialCandidateManifestSha256,
    artifacts.historicalOfficialCandidateManifest.semanticManifestSha256,
  );
  assertEqual(
    'acquisition -> executable semantic binding',
    artifacts.historicalExecutableEvidenceRecoveryQueue.sourceAcquisitionQueueSha256,
    artifacts.historicalModelPdfAcquisitionQueue.semanticQueueSha256,
  );
  assertEqual(
    'document graph -> family canary semantic binding',
    artifacts.historicalEvidenceFamilyCanaries.documentGraphSha256,
    artifacts.historicalDocumentFamilyGraph.semanticGraphSha256,
  );
  assertEqual(
    'executable queue -> family canary content binding',
    artifacts.historicalEvidenceFamilyCanaries.executableQueueSha256,
    canonicalJsonSha256(artifacts.historicalExecutableEvidenceRecoveryQueue),
  );
  assertEqual(
    'acceptance bundle -> receipt replay binding',
    artifacts.historicalAcceptanceReceiptReplayAudit.sourceBundleSha256,
    canonicalJsonSha256(acceptanceBundle),
  );
  assertEqual(
    'acceptance bundle -> historical reference binding',
    artifacts.historicalApplianceReference.sourceSnapshotHashes[
      `historical-recovery:${acceptanceBundle.bundleId}`
    ],
    canonicalJsonSha256(acceptanceBundle),
  );
}

async function fileInputs(root, paths, cache) {
  return Promise.all(paths.map(async (path) => {
    if (!cache.has(path)) cache.set(path, await readFile(resolve(root, path)));
    return { path, content: cache.get(path) };
  }));
}

export async function buildHistoricalEvidenceSystemContractFromRepository({ root = defaultRoot } = {}) {
  const artifacts = await readArtifacts(root);
  verifyCurrentReplay(artifacts);
  const fileCache = new Map();

  const definitions = [
    ['retailer-observations', 'retailerObservations', 'src/domain/retailer-observation.mjs', ['src/domain/retailer-observation.mjs', 'src/domain/retailer-source-adapter.mjs'], [], ['CONTROL_INPUT']],
    ['official-registry-snapshots', 'officialRegistrySnapshots', 'scripts/architecture-v2/acquire-official-registries.mjs', ['scripts/architecture-v2/acquire-official-registries.mjs', 'data/architecture-v2/policies/official-registry-source-policy.json'], [], ['HISTORICAL_INPUT']],
    ['canonical-identity', 'canonicalRegistry', 'scripts/architecture-v2/build-canonical-registry.mjs', ['scripts/architecture-v2/build-canonical-registry.mjs', 'src/domain/canonical-registry.mjs'], [], ['CURRENT_INPUT', 'HISTORICAL_INPUT']],
    ['receipt-reconciliation', 'historicalEvidenceRecoveryAcceptanceBundle', 'src/domain/historical-evidence-recovery-contract.mjs', ['src/domain/historical-evidence-recovery-contract.mjs', 'data/architecture-v2/policies/historical-evidence-recovery-policy.json'], [], ['CURRENT_INPUT', 'HISTORICAL_INPUT']],
    ['attempt-ledger', 'historicalEvidenceRecoveryAttemptLedger', 'src/domain/historical-evidence-recovery-attempt-ledger.mjs', ['src/domain/historical-evidence-recovery-attempt-ledger.mjs'], [], ['CONTROL_INPUT']],
    ['receipt-replay', 'historicalAcceptanceReceiptReplayAudit', 'scripts/architecture-v2/audit-historical-acceptance-receipts.mjs', ['scripts/architecture-v2/audit-historical-acceptance-receipts.mjs', 'src/domain/historical-evidence-recovery-audit.mjs'], [['receipt-reconciliation', 'content']], ['CONTROL_ONLY']],
    ['current-publication', 'publicProjection', 'scripts/architecture-v2/build-public-projection.mjs', ['scripts/architecture-v2/build-public-projection.mjs', 'src/domain/historical-evidence-publication.mjs', 'src/domain/public-projection.mjs'], [['canonical-identity', 'content'], ['receipt-reconciliation', 'content'], ['receipt-replay', 'content']], ['CURRENT_OUTPUT']],
    ['lifecycle-reduction', 'historicalApplianceReference', 'scripts/architecture-v2/build-historical-appliance-reference.mjs', ['scripts/architecture-v2/build-historical-appliance-reference.mjs', 'src/domain/historical-appliance-reference.mjs', 'src/domain/historical-catalog-binding.mjs'], [['official-registry-snapshots', 'content'], ['current-publication', 'content'], ['receipt-reconciliation', 'content']], ['HISTORICAL_INPUT']],
    ['classification', 'historicalModelEvidenceClassification', 'scripts/architecture-v2/build-historical-model-evidence-classification.mjs', ['scripts/architecture-v2/build-historical-model-evidence-classification.mjs', 'src/domain/historical-model-evidence-classification.mjs', 'data/architecture-v2/policies/historical-model-evidence-classification-policy.json'], [['lifecycle-reduction', 'content']], ['CONTROL_ONLY']],
    ['document-identity', 'historicalDocumentFamilyGraph', 'scripts/architecture-v2/build-historical-document-family-graph.mjs', ['scripts/architecture-v2/build-historical-document-family-graph.mjs', 'src/domain/historical-document-family-graph.mjs'], [['classification', 'semantic']], ['CONTROL_ONLY']],
    ['mineru-knowledge', 'dimensionExpressionObservations', 'scripts/architecture-v2/build-dimension-expression-knowledge.mjs', ['scripts/architecture-v2/build-dimension-expression-knowledge.mjs', 'src/domain/mineru-document.mjs', 'src/domain/dimension-expression-knowledge.mjs'], [['lifecycle-reduction', 'content'], ['document-identity', 'semantic']], ['CONTROL_ONLY']],
    ['mineru-backfill-audit', 'historicalMineruBackfillAudit', 'scripts/architecture-v2/backfill-historical-mineru.mjs', ['scripts/architecture-v2/backfill-historical-mineru.mjs', 'src/domain/historical-mineru-backfill.mjs'], [], ['CONTROL_ONLY']],
    ['candidate-acquisition-queue', 'historicalModelPdfAcquisitionQueue', 'scripts/architecture-v2/build-historical-model-pdf-acquisition-queue.mjs', ['scripts/architecture-v2/build-historical-model-pdf-acquisition-queue.mjs', 'src/domain/historical-model-pdf-acquisition.mjs'], [['classification', 'semantic']], ['CONTROL_ONLY']],
    ['candidate-discovery', 'historicalOfficialCandidateManifest', 'scripts/architecture-v2/build-historical-official-candidate-manifest.mjs', ['scripts/architecture-v2/build-historical-official-candidate-manifest.mjs', 'src/domain/historical-official-candidate-manifest.mjs', 'scripts/pdf-pipeline/architecture-v2-resolver-adapters.mjs'], [['candidate-acquisition-queue', 'semantic']], ['CONTROL_ONLY']],
    ['executable-queue', 'historicalExecutableEvidenceRecoveryQueue', 'scripts/architecture-v2/build-historical-executable-recovery-queue.mjs', ['scripts/architecture-v2/build-historical-executable-recovery-queue.mjs', 'src/domain/historical-executable-recovery-queue.mjs'], [['candidate-acquisition-queue', 'semantic'], ['candidate-discovery', 'semantic'], ['receipt-reconciliation', 'content'], ['attempt-ledger', 'content']], ['CONTROL_ONLY']],
    ['family-canary', 'historicalEvidenceFamilyCanaries', 'scripts/architecture-v2/build-historical-evidence-family-canaries.mjs', ['scripts/architecture-v2/build-historical-evidence-family-canaries.mjs', 'src/domain/historical-evidence-family-canary.mjs'], [['document-identity', 'semantic'], ['executable-queue', 'content']], ['CONTROL_ONLY']],
    ['target-state', 'historicalEvidenceTargetState', 'scripts/architecture-v2/build-historical-evidence-target-state.mjs', ['scripts/architecture-v2/build-historical-evidence-target-state.mjs', 'src/domain/historical-evidence-target-state.mjs'], [['classification', 'semantic'], ['candidate-acquisition-queue', 'semantic'], ['executable-queue', 'content'], ['receipt-reconciliation', 'content'], ['attempt-ledger', 'content']], ['CONTROL_ONLY']],
    ['bounded-planner', 'historicalEvidenceNextBatches', 'scripts/architecture-v2/build-historical-evidence-bounded-batches.mjs', ['scripts/architecture-v2/build-historical-evidence-bounded-batches.mjs', 'src/domain/historical-evidence-bounded-batch.mjs'], [['executable-queue', 'content'], ['target-state', 'content'], ['family-canary', 'semantic']], ['CONTROL_ONLY']],
    ['historical-replacement-publication', 'historicalReplacementAudit', 'scripts/architecture-v2/audit-historical-replacement.mjs', ['scripts/architecture-v2/audit-historical-replacement.mjs', 'src/domain/historical-replacement-audit.mjs', 'src/domain/historical-reference-publication.mjs'], [['lifecycle-reduction', 'content'], ['current-publication', 'content']], ['HISTORICAL_OUTPUT']],
    ['fit-publication', 'fitPublicationAudit', 'scripts/architecture-v2/audit-fit-publication.mjs', ['scripts/architecture-v2/audit-fit-publication.mjs', 'src/domain/installation-evidence-pipeline.mjs', 'src/domain/fit-v3.mjs'], [['current-publication', 'content'], ['receipt-reconciliation', 'content'], ['receipt-replay', 'content']], ['FIT_GUARD']],
    ['program-status', 'historicalEvidenceProgramStatus', 'scripts/architecture-v2/build-historical-evidence-program-status.mjs', ['scripts/architecture-v2/build-historical-evidence-program-status.mjs', 'src/domain/historical-evidence-program-status.mjs'], [['classification', 'semantic'], ['mineru-knowledge', 'content'], ['document-identity', 'semantic'], ['candidate-acquisition-queue', 'semantic'], ['executable-queue', 'content'], ['receipt-reconciliation', 'content'], ['attempt-ledger', 'content'], ['target-state', 'content'], ['mineru-backfill-audit', 'content'], ['receipt-replay', 'content'], ['historical-replacement-publication', 'content'], ['fit-publication', 'content']], ['CONTROL_ONLY']],
    ['scale-ledger', 'historicalDimensionsScaleLedger', 'src/domain/historical-dimensions-scale-control.mjs', ['src/domain/historical-dimensions-scale-control.mjs'], [], ['CONTROL_INPUT']],
    ['scale-control', 'historicalDimensionsScaleControl', 'scripts/architecture-v2/build-historical-dimensions-scale-control.mjs', ['scripts/architecture-v2/build-historical-dimensions-scale-control.mjs', 'src/domain/historical-dimensions-scale-control.mjs'], [['scale-ledger', 'content'], ['bounded-planner', 'content'], ['program-status', 'content'], ['receipt-replay', 'content'], ['historical-replacement-publication', 'content'], ['fit-publication', 'content']], ['CONTROL_ONLY']],
  ];

  const stageById = new Map();
  for (const [id, key, owner, producerPaths, dependencies, lifecycleVisibility] of definitions) {
    const native = nativeSemantic(key, artifacts[key]);
    stageById.set(id, {
      id,
      artifactKey: key,
      artifactPath: architectureV2Paths[key],
      owner,
      producerInputs: await fileInputs(root, producerPaths, fileCache),
      consumers: [],
      schemaVersion: artifacts[key].schemaVersion ?? artifacts[key].schema_version,
      payload: artifacts[key],
      semanticPayload: native.payload,
      declaredSemanticSha256: native.declared,
      sourceBindings: [],
      releaseDependencies: dependencies.map(([dependency]) => dependency),
      releaseEpoch: 1,
      releaseState: 'RELEASED',
      lifecycleVisibility,
      nextTransitions: [],
      dependencyDefinitions: dependencies,
    });
  }
  for (const stage of stageById.values()) {
    stage.sourceBindings = stage.dependencyDefinitions.map(([sourceStageId, digestKind]) => {
      const source = stageById.get(sourceStageId);
      if (!source) throw new Error(`system stage dependency missing: ${sourceStageId}`);
      const declaredSha256 = digestKind === 'semantic'
        ? canonicalJsonSha256(source.semanticPayload)
        : canonicalJsonSha256(source.payload);
      source.consumers.push(stage.id);
      source.nextTransitions.push(stage.id);
      return { sourceStageId, digestKind, declaredSha256 };
    });
    delete stage.dependencyDefinitions;
  }

  const epochDefinitions = [
    ['identity-registry', 'src/domain/canonical-registry.mjs', ['src/domain/canonical-registry.mjs', 'scripts/architecture-v2/build-canonical-registry.mjs']],
    ['observation', 'src/domain/retailer-observation.mjs', ['src/domain/retailer-observation.mjs', 'src/domain/retailer-source-adapter.mjs']],
    ['lifecycle-policy', 'src/domain/historical-appliance-reference.mjs', ['src/domain/historical-appliance-reference.mjs', 'data/architecture-v2/policies/reference-artifact-policy.json']],
    ['resolver-contract', 'scripts/pdf-pipeline/architecture-v2-resolver-adapters.mjs', ['scripts/pdf-pipeline/architecture-v2-resolver-adapters.mjs', 'data/architecture-v2/policies/official-discovery-seed-policy.json']],
    ['source-authority-policy', 'data/architecture-v2/policies/manufacturer-source-policy.json', ['data/architecture-v2/policies/manufacturer-source-policy.json', 'data/architecture-v2/policies/retailer-source-policy.json']],
    ['mineru-toolchain', 'src/domain/mineru-tool-identity.mjs', ['src/domain/mineru-tool-identity.mjs', 'src/domain/mineru-runner.mjs', 'scripts/architecture-v2/parse-pdf-with-mineru.mjs']],
    ['parser', 'src/domain/mineru-document.mjs', ['src/domain/mineru-document.mjs', 'src/domain/dimension-expression-knowledge.mjs']],
    ['receipt-policy', 'src/domain/historical-evidence-recovery-contract.mjs', ['src/domain/historical-evidence-recovery-contract.mjs', 'data/architecture-v2/policies/historical-evidence-recovery-policy.json']],
    ['publication', 'src/domain/historical-evidence-publication.mjs', ['src/domain/historical-evidence-publication.mjs', 'src/domain/public-projection.mjs', 'src/domain/historical-reference-publication.mjs']],
    ['fit-policy', 'src/domain/fit-v3.mjs', ['src/domain/fit-v3.mjs', 'src/domain/installation-evidence-pipeline.mjs']],
  ];
  const epochs = await Promise.all(epochDefinitions.map(async ([id, owner, paths]) => ({
    id,
    owner,
    inputs: await fileInputs(root, paths, fileCache),
  })));

  const migration = retailerMigrationCounts(
    artifacts.publicProjection,
    artifacts.retailerObservations,
  );
  const currentWorkstream = artifacts.historicalEvidenceNextBatches.workstreams
    .find((entry) => entry.workstreamId === 'CURRENT_DIMENSIONS');
  const historicalWorkstream = artifacts.historicalEvidenceNextBatches.workstreams
    .find((entry) => entry.workstreamId === 'HISTORICAL_DIMENSIONS');
  const contract = buildHistoricalEvidenceSystemContract({
    generatedAt: latestTimestamp(artifacts),
    releaseId: `tracked-baseline-${latestTimestamp(artifacts)}`,
    producerInputs: await fileInputs(root, [
      'src/domain/historical-evidence-system-contract.mjs',
      'scripts/architecture-v2/build-historical-evidence-system-contract.mjs',
    ], fileCache),
    stages: [...stageById.values()],
    epochs,
    baseline: {
      historicalModelReferences: artifacts.historicalModelEvidenceClassification.summary.records,
      modelsWithDocumentLinks: artifacts.historicalModelEvidenceClassification.summary.modelsWithDocumentLinks,
      modelsWithCurrentValidReceipts: artifacts.historicalModelEvidenceClassification.summary.byOperationalClass.COMPLETE_RECEIPT,
      cumulativeRecoveryAcceptances: artifacts.historicalEvidenceRecoveryAcceptanceBundle.entries.length,
      replacementAutoFillModels: artifacts.historicalReplacementAudit.summary.byLookupAction.AUTO_FILL,
      uniquePdfGraphNodes: artifacts.historicalDocumentFamilyGraph.summary.uniquePdfDocuments,
      validPdfGraphNodes: artifacts.historicalDocumentFamilyGraph.summary.validIndexedPdfDocuments,
      provenDocumentModelEdges: artifacts.historicalDocumentFamilyGraph.summary.byProofLevel.EXACT_MODEL_PROVEN
        + artifacts.historicalDocumentFamilyGraph.summary.byProofLevel.MODEL_LIST_PROVEN,
      mappedDocumentModelEdges: artifacts.historicalDocumentFamilyGraph.summary.mappedModelEdges,
      currentProducts: artifacts.fitPublicationAudit.summary.products,
      currentProductsWithReceiptBoundDimensions: artifacts.fitPublicationAudit.summary.receiptBoundDimensions,
      currentProductsWithReceiptBoundVerifiedFit: artifacts.fitPublicationAudit.summary.receiptBoundVerified,
      publicRowsWithRetailerLinks: migration.rowsWithRetailerLinks,
      publicRowsUnavailableOrHistoryOnly: artifacts.publicProjection.products.filter((product) => product.unavailable).length,
      retailerLinksRequiringObservationMigration: migration.retailerLinksRequiringObservationMigration,
      p0AssignedTargets: currentWorkstream.assignedTargets,
      p0EligibleTargets: currentWorkstream.eligibleTargets,
      p1AssignedTargets: historicalWorkstream.assignedTargets,
      p1EligibleTargets: historicalWorkstream.eligibleTargets,
      knownContractGaps: [
        {
          id: 'RETAILER_OBSERVATIONS_NOT_BOUND_TO_LIFECYCLE',
          severity: 'CRITICAL',
          repairTask: 2,
          detail: 'The tracked lifecycle projection still derives current status from the legacy catalogue rather than retailer-observation hashes.',
        },
        {
          id: 'TARGET_STATE_LEGACY_TIME_BINDINGS',
          severity: 'HIGH',
          repairTask: 3,
          detail: 'The target-state artifact stores source generatedAt values; this contract supplies the missing recomputed content bindings until its schema is migrated.',
        },
        {
          id: 'PARTIAL_REPOSITORY_BUILD_GRAPH',
          severity: 'HIGH',
          repairTask: 9,
          detail: 'The repository build graph does not yet encode the complete release DAG represented by this contract.',
        },
      ],
    },
    controllerDecision: {
      ...artifacts.historicalDimensionsScaleControl.decision,
      checkpointCount: artifacts.historicalDimensionsScaleControl.checkpointCount,
    },
  });
  return validateHistoricalEvidenceSystemContract(contract);
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

export async function runCli(args = process.argv.slice(2)) {
  const root = resolve(option(args, '--root') ?? defaultRoot);
  const output = resolve(option(args, '--output')
    ?? resolveArchitectureV2Path(root, 'historicalEvidenceSystemContract'));
  const contract = await buildHistoricalEvidenceSystemContractFromRepository({ root });
  await atomicJson(output, contract);
  process.stdout.write(`${JSON.stringify({
    output,
    contractId: contract.contractId,
    releaseId: contract.releaseId,
    stages: contract.stages.length,
    epochs: contract.epochs.length,
    semanticContractSha256: contract.semanticContractSha256,
  }, null, 2)}\n`);
  return contract;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
