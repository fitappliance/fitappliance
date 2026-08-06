import { loadActiveRetailRelease } from './active-retail-release.mjs';

const LIFECYCLE_STATES = new Set([
  'CURRENT_RETAIL',
  'CATALOG_ARCHIVED',
  'REGISTRY_ONLY',
  'UNKNOWN_RETAIL',
]);

function requiredText(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

function lifecycleState(value, label) {
  const result = requiredText(value, label);
  if (!LIFECYCLE_STATES.has(result)) throw new TypeError(`${label} invalid: ${result}`);
  return result;
}

function uniqueMap(rows, key, label) {
  if (!Array.isArray(rows)) throw new TypeError(`${label} required`);
  const result = new Map();
  for (const row of rows) {
    const id = requiredText(row?.[key], `${label} ${key}`);
    if (result.has(id)) throw new TypeError(`duplicate ${label} ID: ${id}`);
    result.set(id, row);
  }
  return result;
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

export function buildHistoricalRecoveryActiveReleaseView(release) {
  if (!release?.descriptor || !release?.catalog || !release?.reference) {
    throw new TypeError('loaded active retail release required');
  }
  const productsById = uniqueMap(release.catalog.products, 'id', 'catalogue product');
  uniqueMap(release.reference.records, 'referenceId', 'reference');
  let boundReferences = 0;
  const bindingCounts = {};
  const records = release.reference.records.map((reference) => {
    const productIds = reference.catalogProductIds ?? [];
    if (!Array.isArray(productIds)) throw new TypeError(`catalogProductIds invalid: ${reference.referenceId}`);
    if (productIds.length > 1) {
      throw new Error(`reference binds multiple catalogue products: ${reference.referenceId}`);
    }
    if (productIds.length === 0) {
      const state = lifecycleState(reference.lifecycleState, `reference lifecycle ${reference.referenceId}`);
      bindingCounts[state] = (bindingCounts[state] ?? 0) + 1;
      return structuredClone(reference);
    }
    const product = productsById.get(productIds[0]);
    if (!product) throw new Error(`missing catalogue product: ${productIds[0]}`);
    const state = lifecycleState(
      product.retailLifecycle?.lifecycleState,
      `catalogue lifecycle ${product.id}`,
    );
    boundReferences += 1;
    bindingCounts[state] = (bindingCounts[state] ?? 0) + 1;
    return {
      ...structuredClone(reference),
      lifecycleState: state,
      retailLifecycle: structuredClone(product.retailLifecycle),
    };
  });
  const referencesById = new Map(records.map((reference) => [reference.referenceId, reference]));
  return Object.freeze({
    releaseCandidateId: requiredText(
      release.descriptor.releaseCandidateId,
      'active release candidate ID',
    ),
    sourceBindings: Object.freeze({
      publicProjectionSha256: requiredText(
        release.descriptor.artifacts?.publicProjection?.sha256,
        'active public projection SHA-256',
      ),
      historicalReferenceSha256: requiredText(
        release.descriptor.artifacts?.historicalReference?.sha256,
        'active historical reference SHA-256',
      ),
    }),
    catalog: release.catalog,
    paths: release.paths,
    reference: Object.freeze({
      ...structuredClone(release.reference),
      records: Object.freeze(records),
    }),
    referencesById,
    summary: Object.freeze({
      references: records.length,
      boundReferences,
      unboundReferences: records.length - boundReferences,
      byLifecycle: Object.freeze(bindingCounts),
    }),
  });
}

export async function loadHistoricalRecoveryActiveRelease(options = {}) {
  return buildHistoricalRecoveryActiveReleaseView(await loadActiveRetailRelease(options));
}

function currentLaneReason(row) {
  const currentPriority = String(row?.priority ?? row?.priorityClass ?? '').startsWith('P0_CURRENT');
  const currentWorkstream = row?.workstreamId === 'CURRENT_DIMENSIONS';
  if ((currentPriority || currentWorkstream) && row?.lifecycleState !== 'CURRENT_RETAIL') {
    return `${row?.referenceId ?? row?.targetId ?? '<unknown>'} is non-current in a current lane`;
  }
  return null;
}

export function auditHistoricalRecoveryActiveRelease({
  view,
  classification,
  generatedReference = { records: [] },
  acceptanceBundle = { entries: [] },
  acquisitionQueue = { records: [] },
  executableQueue = { targets: [], discoveryTargets: [] },
  targetState = { records: [] },
  boundedBatches = { manifests: [] },
  scaleControl = { decision: { status: 'COMPLETE', allowedManifestId: null } },
}) {
  if (!view?.reference?.records || !Array.isArray(classification?.records)) {
    throw new TypeError('active recovery view and classification required');
  }
  const issues = [];
  const expectedAcquisitionBinding = {
    releaseCandidateId: view.releaseCandidateId,
    ...view.sourceBindings,
  };
  if (JSON.stringify(acquisitionQueue?.activeReleaseSourceBinding)
    !== JSON.stringify(expectedAcquisitionBinding)) {
    issues.push('acquisition queue active-release source binding mismatch');
  }
  const expected = new Map(view.reference.records.map((row) => [row.referenceId, row]));
  const generated = new Map((generatedReference?.records ?? []).map((row) => [row.referenceId, row]));
  const receiptCountByReference = new Map();
  for (const entry of acceptanceBundle?.entries ?? []) {
    receiptCountByReference.set(
      entry.referenceId,
      (receiptCountByReference.get(entry.referenceId) ?? 0) + 1,
    );
  }
  const identityDispositions = sorted(
    [...generated.keys()].filter((referenceId) => !expected.has(referenceId)),
  ).map((referenceId) => {
    const row = generated.get(referenceId);
    return Object.freeze({
      referenceId,
      category: row.category,
      brand: row.brand,
      model: row.model,
      disposition: 'QUARANTINED_GENERATED_ONLY',
      receiptCount: receiptCountByReference.get(referenceId) ?? 0,
    });
  });
  const actual = new Map();
  for (const row of classification.records) {
    if (actual.has(row.referenceId)) issues.push(`duplicate classification reference: ${row.referenceId}`);
    actual.set(row.referenceId, row);
    const reference = expected.get(row.referenceId);
    if (!reference) issues.push(`classification identity outside active release: ${row.referenceId}`);
    else if (row.lifecycleState !== reference.lifecycleState) {
      issues.push(`classification lifecycle mismatch: ${row.referenceId}`);
    }
  }
  const missing = sorted([...expected.keys()].filter((id) => !actual.has(id)));
  if (missing.length) issues.push(`classification identity set missing ${missing.length} active references`);

  for (const entry of acceptanceBundle?.entries ?? []) {
    if (!expected.has(entry.referenceId)) issues.push(`orphaned receipt: ${entry.referenceId}`);
  }

  const laneRows = [
    ...(acquisitionQueue?.records ?? []),
    ...(executableQueue?.targets ?? []),
    ...(executableQueue?.discoveryTargets ?? []),
    ...(targetState?.records ?? []),
  ];
  for (const row of laneRows) {
    const reference = expected.get(row.referenceId);
    if (!reference) {
      issues.push(`control-plane identity outside active release: ${row.referenceId}`);
      continue;
    }
    if (row.lifecycleState !== reference.lifecycleState) {
      issues.push(`control-plane lifecycle mismatch: ${row.referenceId}`);
    }
    const reason = currentLaneReason(row);
    if (reason) issues.push(reason);
  }

  const manifestsById = new Map();
  for (const manifest of boundedBatches?.manifests ?? []) {
    manifestsById.set(manifest.manifestId, manifest);
    for (const binding of manifest.targetBindings ?? []) {
      const reference = expected.get(binding.referenceId);
      if (!reference) issues.push(`bounded manifest identity outside active release: ${binding.referenceId}`);
      if (manifest.workstreamId === 'CURRENT_DIMENSIONS'
        && reference?.lifecycleState !== 'CURRENT_RETAIL') {
        issues.push(`${binding.referenceId} is non-current in a current lane`);
      }
    }
  }
  const allowedManifestId = scaleControl?.decision?.allowedManifestId ?? null;
  if (allowedManifestId && !manifestsById.has(allowedManifestId)) {
    issues.push(`scale controller manifest is unbound: ${allowedManifestId}`);
  }

  return Object.freeze({
    schemaVersion: 1,
    releaseCandidateId: view.releaseCandidateId,
    sourceBindings: view.sourceBindings,
    summary: Object.freeze({
      activeReferences: expected.size,
      classifiedReferences: actual.size,
      boundReferences: view.summary.boundReferences,
      unboundReferences: view.summary.unboundReferences,
      generatedOnlyIdentities: identityDispositions.length,
      issues: issues.length,
    }),
    identityDispositions: Object.freeze(identityDispositions),
    issues: Object.freeze(issues),
  });
}

export function assertHistoricalRecoveryActiveRelease(input) {
  const audit = auditHistoricalRecoveryActiveRelease(input);
  if (audit.issues.length) {
    throw new Error(`historical recovery active-release audit failed: ${audit.issues.join('; ')}`);
  }
  return audit;
}
