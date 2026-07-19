const INPUT_SCHEMAS = Object.freeze({
  classification: 1,
  knowledge: 3,
  acquisitionQueue: 1,
  executableQueue: 2,
  acceptanceBundle: 1,
  attemptLedger: 1,
  mineruBackfillAudit: 1,
  receiptReplayAudit: 1,
  replacementAudit: 1,
  fitPublicationAudit: 1,
});

const SOURCE_ARTIFACTS = Object.freeze({
  classification: 'data/architecture-v2/generated/historical-model-evidence-classification.json',
  knowledge: 'data/architecture-v2/generated/dimension-expression-observations.json',
  acquisitionQueue: 'data/architecture-v2/reviews/automated/historical-model-pdf-acquisition-queue.json',
  executableQueue: 'data/architecture-v2/reviews/automated/historical-executable-evidence-recovery-queue.json',
  acceptanceBundle: 'data/architecture-v2/reviews/automated/historical-evidence-recovery-acceptance-bundle.json',
  attemptLedger: 'data/architecture-v2/reviews/automated/historical-evidence-recovery-attempt-ledger.json',
  mineruBackfillAudit: 'data/architecture-v2/reviews/automated/historical-mineru-backfill-audit.json',
  receiptReplayAudit: 'data/architecture-v2/reviews/automated/historical-acceptance-receipt-replay-audit.json',
  replacementAudit: 'data/architecture-v2/reviews/automated/historical-replacement-audit.json',
  fitPublicationAudit: 'data/architecture-v2/reviews/automated/fit-publication-audit.json',
});

const CONTENT_LANES = Object.freeze({
  'application/pdf': 'pdf',
  'text/html': 'html',
  'application/json': 'json',
});

function integer(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative integer`);
  return value;
}

function schema(input, key) {
  const expected = INPUT_SCHEMAS[key];
  if (input?.schemaVersion !== expected) throw new TypeError(`${key} schema version ${expected} required`);
  if (!input.summary && !['acceptanceBundle'].includes(key)) {
    throw new TypeError(`${key} summary required`);
  }
  return input;
}

function countValues(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} counts required`);
  return Object.values(value).reduce((sum, count) => sum + integer(count, `${label} count`), 0);
}

function metric({ id, label, grain, numerator, denominator, sourceArtifact }) {
  const safeNumerator = integer(numerator, `${id} numerator`);
  const safeDenominator = integer(denominator, `${id} denominator`);
  if (safeNumerator > safeDenominator) throw new Error(`${id} numerator exceeds denominator`);
  return {
    id,
    label,
    grain,
    numerator: safeNumerator,
    denominator: safeDenominator,
    rateBasisPoints: safeDenominator === 0
      ? null
      : Math.round((safeNumerator * 10_000) / safeDenominator),
    sourceArtifact,
  };
}

function acceptedSourceLanes(entries) {
  const counts = { pdf_only: 0, html_only: 0, json_only: 0, mixed: 0, pdf_involved: 0 };
  const references = new Set();
  for (const entry of entries) {
    if (!entry?.referenceId || references.has(entry.referenceId)) {
      throw new Error(`acceptance bundle duplicate or missing referenceId: ${entry?.referenceId ?? '<missing>'}`);
    }
    references.add(entry.referenceId);
    if (!Array.isArray(entry.sources) || entry.sources.length === 0) {
      throw new TypeError(`acceptance entry sources required: ${entry.referenceId}`);
    }
    const lanes = new Set(entry.sources.map((source) => {
      const lane = CONTENT_LANES[source?.contentType];
      if (!lane) throw new TypeError(`unsupported accepted source content type: ${source?.contentType}`);
      return lane;
    }));
    if (lanes.has('pdf')) counts.pdf_involved += 1;
    if (lanes.size > 1) counts.mixed += 1;
    else counts[`${[...lanes][0]}_only`] += 1;
  }
  return counts;
}

function pass(id, label) {
  return { id, label, status: 'PASS' };
}

function assertAccounting({
  classification,
  knowledge,
  acquisitionQueue,
  executableQueue,
  acceptanceBundle,
  mineruBackfillAudit,
  receiptReplayAudit,
  replacementAudit,
  fitPublicationAudit,
}) {
  const classified = integer(classification.summary.records, 'classification records');
  if (classification.summary.uniqueReferenceIds !== classified
    || classification.records.length !== classified
    || new Set(classification.records.map((record) => record.referenceId)).size !== classified) {
    throw new Error('classification unique-reference accounting mismatch');
  }
  const linkedModels = integer(classification.summary.modelsWithDocumentLinks, 'models with document links');
  const unlinkedModels = integer(classification.summary.modelsWithoutDocumentLinks, 'models without document links');
  if (linkedModels + unlinkedModels !== classified) {
    throw new Error('classification document-link accounting mismatch');
  }
  const classificationByReference = new Map(classification.records.map((record) => [record.referenceId, record]));

  const queued = integer(acquisitionQueue.summary.queuedModels, 'acquisition queued models');
  const acquisitionExcluded = countValues(acquisitionQueue.summary.excluded, 'acquisition excluded');
  if (acquisitionQueue.summary.classificationRecords !== classified
    || acquisitionQueue.records.length !== queued
    || queued + acquisitionExcluded !== classified) {
    throw new Error('acquisition model accounting mismatch');
  }

  const executableTargets = integer(executableQueue.summary.targets, 'executable targets');
  const executableExcluded = countValues(executableQueue.summary.excluded, 'executable excluded');
  const resolverSuppressed = integer(
    executableQueue.summary.suppressedPriorResolverOnlyTargets,
    'resolver-only suppressed targets',
  );
  if (executableQueue.summary.acquisitionRecords !== queued
    || executableQueue.targets.length !== executableTargets
    || executableTargets + executableExcluded + resolverSuppressed !== queued) {
    throw new Error('executable target accounting mismatch');
  }

  const acceptedEntries = acceptanceBundle.entries.length;
  for (const entry of acceptanceBundle.entries) {
    const classifiedRecord = classificationByReference.get(entry.referenceId);
    if (!classifiedRecord) throw new Error(`acceptance reference missing from classification: ${entry.referenceId}`);
    if (classifiedRecord.operationalClass !== 'COMPLETE_RECEIPT') {
      throw new Error(`accepted reference is not classified COMPLETE_RECEIPT: ${entry.referenceId}`);
    }
  }
  if (receiptReplayAudit.summary.entries !== acceptedEntries) {
    throw new Error('receipt replay entry accounting mismatch');
  }
  const replaySources = integer(receiptReplayAudit.summary.sources, 'receipt replay sources');
  const replayPassed = integer(receiptReplayAudit.summary.passed, 'receipt replay passed');
  const replayFailed = integer(receiptReplayAudit.summary.failed, 'receipt replay failed');
  if (replayPassed + replayFailed !== replaySources || replayFailed !== 0) {
    throw new Error('receipt replay source accounting mismatch');
  }

  if (replacementAudit.summary.referenceRecords !== classified
    || replacementAudit.summary.publicRecords !== classified) {
    throw new Error('replacement reference accounting mismatch');
  }
  if (countValues(replacementAudit.summary.byLookupAction, 'replacement lookup actions') !== classified) {
    throw new Error('replacement lookup-action accounting mismatch');
  }
  if (replacementAudit.summary.currentCatalogProducts !== fitPublicationAudit.summary.products) {
    throw new Error('current catalogue Fit accounting mismatch');
  }
  if (fitPublicationAudit.summary.violations !== 0 || replacementAudit.summary.issueCount !== 0) {
    throw new Error('publication audit contains violations');
  }
  if (fitPublicationAudit.summary.receiptBoundVerified
    > fitPublicationAudit.summary.receiptBoundDimensions) {
    throw new Error('Verified Fit exceeds receipt-bound dimensions');
  }

  const mineruTotal = integer(knowledge.summary.mineruDocuments, 'MinerU knowledge documents');
  const mineruValid = integer(knowledge.summary.validMineruDocuments, 'valid MinerU knowledge documents');
  const mineruInvalid = integer(knowledge.summary.invalidMineruDocuments, 'invalid MinerU knowledge documents');
  if (mineruValid + mineruInvalid !== mineruTotal) {
    throw new Error('MinerU validity accounting mismatch');
  }
  const observedDocuments = integer(
    knowledge.summary.documentsWithObservations,
    'MinerU documents with observations',
  );
  const unobservedDocuments = integer(
    knowledge.summary.documentsWithoutObservations,
    'MinerU documents without observations',
  );
  if (observedDocuments + unobservedDocuments !== mineruValid) {
    throw new Error('MinerU observation accounting mismatch');
  }

  const uniquePdfs = integer(mineruBackfillAudit.summary.uniqueDocuments, 'unique backfill PDFs');
  const indexedPdfs = integer(mineruBackfillAudit.summary.indexed, 'indexed backfill PDFs');
  const pendingPdfs = ['missing', 'stale', 'failed']
    .reduce((sum, key) => sum + integer(mineruBackfillAudit.summary[key] ?? 0, `${key} backfill PDFs`), 0);
  if (indexedPdfs + pendingPdfs !== uniquePdfs) throw new Error('MinerU backfill state accounting mismatch');
  const duplicatePdfs = integer(mineruBackfillAudit.summary.duplicatePhysicalFiles, 'duplicate physical PDFs');
  const invalidPdfs = integer(mineruBackfillAudit.summary.invalidFiles ?? 0, 'invalid physical PDFs');
  if (uniquePdfs + duplicatePdfs + invalidPdfs !== mineruBackfillAudit.summary.physicalFiles) {
    throw new Error('physical PDF accounting mismatch');
  }

  return [
    pass('classification_inventory', 'Classification inventory is unique and complete'),
    pass('acquisition_inventory', 'Acquisition queue accounts for every classified model'),
    pass('executable_inventory', 'Executable queue accounts for every acquisition target'),
    pass('receipt_replay', 'Every accepted source replays without failure'),
    pass('replacement_inventory', 'Replacement reference matches the historical inventory'),
    pass('fit_publication', 'Current catalogue and Fit audit agree without violations'),
  ];
}

function diagnosticsFor({ metrics, executableQueue, knowledge }) {
  const byId = new Map(metrics.map((entry) => [entry.id, entry]));
  const diagnostics = [];
  if (byId.get('model.with_document_links').rateBasisPoints < 5000) {
    diagnostics.push({
      code: 'SOURCE_LINK_COVERAGE_LOW',
      severity: 'CRITICAL',
      metricId: 'model.with_document_links',
      message: 'Fewer than half of historical models have any document link.',
    });
  }
  if (executableQueue.summary.targets > 0 && executableQueue.summary.fetchJobs === 0) {
    diagnostics.push({
      code: 'EXECUTION_GRAPH_RESOLVER_ONLY',
      severity: 'CRITICAL',
      metricId: 'model.executable_targets',
      message: 'The executable graph has targets but no materialized fetch jobs.',
    });
  }
  if (knowledge.summary.documentsWithoutObservations > 0) {
    diagnostics.push({
      code: 'MINERU_OBSERVATION_GAP',
      severity: 'HIGH',
      metricId: 'document.knowledge_recognized',
      message: 'Valid MinerU documents remain without recognized dimension expressions.',
    });
  }
  if (byId.get('model.current_valid_receipt').rateBasisPoints < 5000) {
    diagnostics.push({
      code: 'MODEL_RECEIPT_COVERAGE_LOW',
      severity: 'CRITICAL',
      metricId: 'model.current_valid_receipt',
      message: 'Fewer than half of historical models have a current valid evidence receipt.',
    });
  }
  if (byId.get('fit.receipt_bound_verified').denominator > 0
    && byId.get('fit.receipt_bound_verified').numerator === 0) {
    diagnostics.push({
      code: 'VERIFIED_FIT_ZERO',
      severity: 'HIGH',
      metricId: 'fit.receipt_bound_verified',
      message: 'No current catalogue product has complete receipt-bound Fit evidence.',
    });
  }
  return diagnostics;
}

export function buildHistoricalEvidenceProgramStatus(input) {
  if (!input || typeof input !== 'object') throw new TypeError('programme status inputs required');
  const generatedAt = new Date(input.generatedAt);
  if (Number.isNaN(generatedAt.valueOf())) throw new TypeError('valid programme status generatedAt required');
  const classification = schema(input.classification, 'classification');
  const knowledge = schema(input.knowledge, 'knowledge');
  const acquisitionQueue = schema(input.acquisitionQueue, 'acquisitionQueue');
  const executableQueue = schema(input.executableQueue, 'executableQueue');
  const acceptanceBundle = schema(input.acceptanceBundle, 'acceptanceBundle');
  const attemptLedger = schema(input.attemptLedger, 'attemptLedger');
  const mineruBackfillAudit = schema(input.mineruBackfillAudit, 'mineruBackfillAudit');
  const receiptReplayAudit = schema(input.receiptReplayAudit, 'receiptReplayAudit');
  const replacementAudit = schema(input.replacementAudit, 'replacementAudit');
  const fitPublicationAudit = schema(input.fitPublicationAudit, 'fitPublicationAudit');
  if (!Array.isArray(acceptanceBundle.entries)) throw new TypeError('acceptance bundle entries required');

  const controls = assertAccounting({
    classification,
    knowledge,
    acquisitionQueue,
    executableQueue,
    acceptanceBundle,
    mineruBackfillAudit,
    receiptReplayAudit,
    replacementAudit,
    fitPublicationAudit,
  });
  const inventory = classification.summary.records;
  const acceptedEntries = acceptanceBundle.entries.length;
  const sourceLanes = acceptedSourceLanes(acceptanceBundle.entries);
  const modelSource = SOURCE_ARTIFACTS.classification;
  const metrics = [
    metric({
      id: 'model.inventory_classified', label: 'Inventory classified', grain: 'historical_model_reference',
      numerator: inventory, denominator: inventory, sourceArtifact: modelSource,
    }),
    metric({
      id: 'model.with_document_links', label: 'Models with document links', grain: 'historical_model_reference',
      numerator: classification.summary.modelsWithDocumentLinks, denominator: inventory, sourceArtifact: modelSource,
    }),
    metric({
      id: 'model.without_document_links', label: 'Models without document links', grain: 'historical_model_reference',
      numerator: classification.summary.modelsWithoutDocumentLinks, denominator: inventory, sourceArtifact: modelSource,
    }),
    metric({
      id: 'model.current_valid_receipt', label: 'Models with current valid receipts', grain: 'historical_model_reference',
      numerator: classification.summary.byOperationalClass.COMPLETE_RECEIPT ?? 0,
      denominator: inventory, sourceArtifact: modelSource,
    }),
    metric({
      id: 'model.queued_for_acquisition', label: 'Models queued for acquisition', grain: 'historical_model_reference',
      numerator: acquisitionQueue.summary.queuedModels, denominator: inventory,
      sourceArtifact: SOURCE_ARTIFACTS.acquisitionQueue,
    }),
    metric({
      id: 'model.executable_targets', label: 'Executable model targets', grain: 'historical_model_reference',
      numerator: executableQueue.summary.targets, denominator: acquisitionQueue.summary.queuedModels,
      sourceArtifact: SOURCE_ARTIFACTS.executableQueue,
    }),
    metric({
      id: 'model.accepted_recovery_entries', label: 'Models in cumulative recovery acceptance', grain: 'historical_model_reference',
      numerator: acceptedEntries, denominator: inventory, sourceArtifact: SOURCE_ARTIFACTS.acceptanceBundle,
    }),
    metric({
      id: 'model.replacement_auto_fill', label: 'Historical models eligible for replacement auto-fill', grain: 'historical_model_reference',
      numerator: replacementAudit.summary.byLookupAction.AUTO_FILL ?? 0,
      denominator: inventory, sourceArtifact: SOURCE_ARTIFACTS.replacementAudit,
    }),
    metric({
      id: 'document.unique_pdf_content', label: 'Unique PDF content', grain: 'physical_pdf_file',
      numerator: mineruBackfillAudit.summary.uniqueDocuments,
      denominator: mineruBackfillAudit.summary.physicalFiles,
      sourceArtifact: SOURCE_ARTIFACTS.mineruBackfillAudit,
    }),
    metric({
      id: 'document.backfill_unique_indexed', label: 'Unique PDF content indexed', grain: 'unique_pdf_content',
      numerator: mineruBackfillAudit.summary.indexed,
      denominator: mineruBackfillAudit.summary.uniqueDocuments,
      sourceArtifact: SOURCE_ARTIFACTS.mineruBackfillAudit,
    }),
    metric({
      id: 'document.knowledge_valid', label: 'Valid MinerU knowledge documents', grain: 'mineru_knowledge_document',
      numerator: knowledge.summary.validMineruDocuments,
      denominator: knowledge.summary.mineruDocuments, sourceArtifact: SOURCE_ARTIFACTS.knowledge,
    }),
    metric({
      id: 'document.knowledge_recognized', label: 'MinerU knowledge documents with recognized expressions', grain: 'mineru_knowledge_document',
      numerator: knowledge.summary.documentsWithObservations,
      denominator: knowledge.summary.validMineruDocuments, sourceArtifact: SOURCE_ARTIFACTS.knowledge,
    }),
    metric({
      id: 'parser.complete_replays', label: 'Complete parser replays', grain: 'parser_replay',
      numerator: knowledge.summary.completeParserReplays,
      denominator: knowledge.summary.parserReplays, sourceArtifact: SOURCE_ARTIFACTS.knowledge,
    }),
    ...[
      ['pdf_only', 'PDF only'],
      ['html_only', 'HTML only'],
      ['json_only', 'JSON/API only'],
      ['mixed', 'Mixed official source lanes'],
      ['pdf_involved', 'PDF involved'],
    ].map(([key, label]) => metric({
      id: `accepted_source_lane.${key}`,
      label,
      grain: 'accepted_model_entry',
      numerator: sourceLanes[key],
      denominator: acceptedEntries,
      sourceArtifact: SOURCE_ARTIFACTS.acceptanceBundle,
    })),
    metric({
      id: 'fit.receipt_bound_dimensions', label: 'Current products with receipt-bound dimensions', grain: 'current_catalog_product',
      numerator: fitPublicationAudit.summary.receiptBoundDimensions,
      denominator: fitPublicationAudit.summary.products,
      sourceArtifact: SOURCE_ARTIFACTS.fitPublicationAudit,
    }),
    metric({
      id: 'fit.receipt_bound_verified', label: 'Current products with receipt-bound Verified Fit', grain: 'current_catalog_product',
      numerator: fitPublicationAudit.summary.receiptBoundVerified,
      denominator: fitPublicationAudit.summary.products,
      sourceArtifact: SOURCE_ARTIFACTS.fitPublicationAudit,
    }),
  ];

  return {
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    inventory: {
      historicalModelReferences: inventory,
      currentCatalogProducts: fitPublicationAudit.summary.products,
      acceptedRecoveryEntries: acceptedEntries,
      targetAttempts: integer(attemptLedger.summary.targetAttempts, 'target attempts'),
    },
    controls,
    metrics,
    diagnostics: diagnosticsFor({ metrics, executableQueue, knowledge }),
  };
}

function displayGrain(grain) {
  return grain.split('_').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
}

function displayRate(metricValue) {
  return metricValue.rateBasisPoints === null
    ? 'N/A'
    : `${(metricValue.rateBasisPoints / 100).toFixed(2)}%`;
}

function section(title, metrics) {
  return [
    `## ${title}`,
    '',
    '| Metric | Grain | Count | Denominator | Rate |',
    '| --- | --- | ---: | ---: | ---: |',
    ...metrics.map((entry) => (
      `| ${entry.label} | ${displayGrain(entry.grain)} | ${entry.numerator} | ${entry.denominator} | ${displayRate(entry)} |`
    )),
    '',
  ];
}

export function renderHistoricalEvidenceProgramStatusMarkdown(status) {
  if (status?.schemaVersion !== 1 || !Array.isArray(status.metrics)
    || !Array.isArray(status.controls) || !Array.isArray(status.diagnostics)) {
    throw new TypeError('historical evidence programme status schema v1 required');
  }
  const starts = (prefix) => status.metrics.filter((entry) => entry.id.startsWith(prefix));
  return [
    '# Historical Evidence Programme Status',
    '',
    `Generated: ${status.generatedAt}`,
    '',
    '> Counts are deliberately separated by grain. A PDF or MinerU document is not a model receipt, and W/H/D is not Verified Fit.',
    '',
    ...section('Model evidence funnel', starts('model.')),
    ...section('Document and parser funnel', [
      ...starts('document.'),
      ...starts('parser.'),
    ]),
    ...section('Accepted source lanes', starts('accepted_source_lane.')),
    ...section('Fit publication funnel', starts('fit.')),
    '## Cross-artifact controls',
    '',
    '| Control | Status |',
    '| --- | --- |',
    ...status.controls.map((control) => `| ${control.label} | ${control.status} |`),
    '',
    '## Active diagnostics',
    '',
    '| Severity | Code | Message |',
    '| --- | --- | --- |',
    ...(status.diagnostics.length
      ? status.diagnostics.map((diagnostic) => (
        `| ${diagnostic.severity} | ${diagnostic.code} | ${diagnostic.message} |`
      ))
      : ['| - | NONE | No active programme diagnostic. |']),
    '',
  ].join('\n');
}
