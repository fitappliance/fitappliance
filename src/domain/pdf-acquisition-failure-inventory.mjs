import { createHash } from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/;
const CORE_RESOLVER = 'architecture-v2-core-official-discovery';
const FAILURE_STATUSES = new Set([
  'official_candidate_not_found',
  'transport_failed',
  'identity_unproven',
  'source_content_error',
]);
const RETAINED_HISTORICAL_FIXTURE_IDS = Object.freeze([
  'pdf_baseline_0091f6e0fab54efeff6261c7',
  'pdf_baseline_4ff2baa8fd61b2dd045ec892',
  'pdf_baseline_b10098c89b1b7927d6a8cff9',
  'pdf_baseline_c3803a0f3b9196ea12abb89c',
  'pdf_baseline_0628a4f689af28d321e7bed6',
]);

export const PDF_ACQUISITION_FAILURE_MECHANISMS = Object.freeze([
  'OFFICIAL_ROUTE_ABSENT',
  'OFFICIAL_CANDIDATE_ABSENT',
  'OFFICIAL_ARTIFACT_ABSENT',
  'OFFICIAL_TRANSPORT_FAILED',
  'EXACT_MODEL_IDENTITY_UNPROVEN',
  'SOURCE_CONTENT_ERROR',
]);

function requiredText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function normalizedKey(value) {
  return requiredText(value, 'key')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function semanticSha256(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function validateSourceBindings(bindings) {
  const required = [
    'wp7aReportSha256',
    'checkpointSha256',
    'checkpointPolicySha256',
    'manufacturerStrategySha256',
    'manufacturerSourcePolicySha256',
    'contactMatrixSha256',
  ];
  for (const key of required) {
    if (!SHA256.test(bindings?.[key] ?? '')) throw new TypeError(`${key} must be a SHA-256`);
  }
  return Object.fromEntries(required.map((key) => [key, bindings[key]]));
}

function attemptsFromCheckpoint(checkpoint) {
  const raw = checkpoint?.attempts;
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.values(raw);
  throw new TypeError('checkpoint attempts required');
}

function candidateDetails(attempt) {
  const outcomes = Array.isArray(attempt.resolverOutcomes) ? attempt.resolverOutcomes : [];
  const resolverIds = [];
  const candidates = [];
  for (const outcome of outcomes) {
    const resolverId = requiredText(outcome?.resolverId ?? outcome?.result?.resolverId, 'resolver ID');
    resolverIds.push(resolverId);
    for (const candidate of outcome?.result?.candidates ?? []) {
      const url = new URL(requiredText(candidate?.sourceUrl, 'candidate source URL'));
      candidates.push({
        resolverId,
        host: url.hostname.toLowerCase(),
        authorityMode: String(candidate.authorityMode ?? ''),
        sourceRole: String(candidate.sourceRole ?? ''),
        discoveryMethod: String(candidate.discoveryMethod ?? ''),
      });
    }
  }
  const uniqueResolverIds = [...new Set(resolverIds)].sort();
  return {
    resolverIds: uniqueResolverIds,
    resolverContract: uniqueResolverIds.join('+') || 'none',
    candidates,
    hasDedicatedOfficialResolver: uniqueResolverIds.some((id) => id !== CORE_RESOLVER),
    officialDocuments: candidates.filter((entry) => entry.authorityMode === 'official'
      && entry.sourceRole === 'manufacturer_document'),
    officialProductPages: candidates.filter((entry) => entry.authorityMode === 'official'
      && entry.sourceRole === 'manufacturer_product_page'),
    references: candidates.filter((entry) => entry.authorityMode !== 'official'),
  };
}

function mechanismFor(attempt, details) {
  if (attempt.status === 'transport_failed') return 'OFFICIAL_TRANSPORT_FAILED';
  if (attempt.status === 'identity_unproven') return 'EXACT_MODEL_IDENTITY_UNPROVEN';
  if (attempt.status === 'source_content_error') return 'SOURCE_CONTENT_ERROR';
  if (attempt.status !== 'official_candidate_not_found') {
    throw new TypeError(`unsupported failure status ${attempt.status ?? 'missing'}`);
  }
  if (!details.hasDedicatedOfficialResolver) return 'OFFICIAL_ROUTE_ABSENT';
  if (details.officialProductPages.length > 0) return 'OFFICIAL_ARTIFACT_ABSENT';
  return 'OFFICIAL_CANDIDATE_ABSENT';
}

function transportFailureCode(reason) {
  const value = String(reason ?? '').toLowerCase();
  if (value.includes('redirect escaped official brand hosts')) return 'REDIRECT_PROVENANCE_REJECTED';
  if (value.includes('requested url is not an official brand url')) return 'OFFICIAL_AUTHORITY_REJECTED';
  if (value.includes('http_404') || value.includes('404')) return 'HTTP_NOT_FOUND';
  if (value.includes('command failed')) return 'TRANSPORT_COMMAND_FAILED';
  return 'TRANSPORT_VALIDATION_FAILED';
}

function buildOrganizationIndex(contactMatrix) {
  if (contactMatrix?.schemaVersion !== 1 || !Array.isArray(contactMatrix.organizations)) {
    throw new TypeError('brand contact matrix schema v1 required');
  }
  const byBrand = new Map();
  for (const organization of contactMatrix.organizations) {
    const id = requiredText(organization.id, 'organization ID');
    const name = requiredText(organization.organization, 'organization name');
    for (const brand of organization.coveredBrands ?? []) {
      const key = normalizedKey(brand);
      if (byBrand.has(key)) throw new TypeError(`duplicate organization mapping for ${brand}`);
      byBrand.set(key, { key: id, label: name, mapping: 'contact_matrix' });
    }
  }
  return byBrand;
}

function organizationFor(brand, index) {
  return index.get(normalizedKey(brand)) ?? {
    key: `brand-fallback:${normalizedKey(brand)}`,
    label: `Brand-level fallback: ${brand}`,
    mapping: 'brand_fallback',
  };
}

function groupRecords(records, descriptor) {
  const groups = new Map();
  for (const record of records) {
    const value = descriptor(record);
    const current = groups.get(value.key) ?? {
      ...value,
      samples: 0,
      representedTargets: 0,
    };
    current.samples += 1;
    current.representedTargets += record.representedTargetCount;
    groups.set(value.key, current);
  }
  return [...groups.values()].sort((left, right) => {
    if (left.mapping !== right.mapping) return left.mapping === 'contact_matrix' ? -1 : 1;
    return left.key.localeCompare(right.key);
  });
}

function countByMechanism(records) {
  const counts = Object.fromEntries(PDF_ACQUISITION_FAILURE_MECHANISMS.map((key) => [key, 0]));
  for (const record of records) counts[record.primaryMechanism] += 1;
  return counts;
}

function lifecyclePriority(sample, lifecycleState) {
  if (lifecycleState === 'CURRENT_RETAIL') return sample.priorityClass ?? null;
  if (sample.priorityClass === 'P0_CURRENT_MISSING_DIMENSIONS') {
    return 'P1_HISTORICAL_MISSING_DIMENSIONS';
  }
  if (sample.priorityClass === 'P2_CURRENT_CONFIRMATION') return 'P3_HISTORICAL_CONFIRMATION';
  return sample.priorityClass ?? null;
}

function selectCurrentCanaries(records, limit = 7) {
  const remaining = records.filter((record) => record.lifecycleState === 'CURRENT_RETAIL');
  const selected = [];
  const mechanisms = new Set();
  const brands = new Set();
  while (remaining.length && selected.length < limit) {
    remaining.sort((left, right) => {
      const leftScore = (mechanisms.has(left.primaryMechanism) ? 0 : 4)
        + (brands.has(normalizedKey(left.brand)) ? 0 : 2);
      const rightScore = (mechanisms.has(right.primaryMechanism) ? 0 : 4)
        + (brands.has(normalizedKey(right.brand)) ? 0 : 2);
      return rightScore - leftScore
        || right.representedTargetCount - left.representedTargetCount
        || left.sampleId.localeCompare(right.sampleId);
    });
    const next = remaining.shift();
    selected.push({ ...next, lane: 'CURRENT_RETAIL_CANARY' });
    mechanisms.add(next.primaryMechanism);
    brands.add(normalizedKey(next.brand));
  }
  return selected;
}

export function buildPdfAcquisitionFailureInventory({
  wp7aReport,
  checkpoint,
  contactMatrix,
  sourceBindings,
  activeRecoveryView = null,
}) {
  if (wp7aReport?.schemaVersion !== 1 || !Array.isArray(wp7aReport.samples)) {
    throw new TypeError('WP7A report schema v1 required');
  }
  const bindings = validateSourceBindings(sourceBindings);
  const failedSamples = wp7aReport.samples.filter((entry) => FAILURE_STATUSES.has(entry?.acquisition?.status));
  const sampleIds = new Set();
  for (const entry of failedSamples) {
    const id = requiredText(entry.sampleId, 'sample ID');
    if (sampleIds.has(id)) throw new TypeError(`duplicate failure sample ${id}`);
    if (entry.publicationEligible !== false) throw new TypeError(`failure sample must remain publication isolated: ${id}`);
    sampleIds.add(id);
  }

  const attempts = new Map();
  for (const entry of attemptsFromCheckpoint(checkpoint)) {
    const id = requiredText(entry?.sampleId, 'attempt sample ID');
    if (attempts.has(id)) throw new TypeError(`duplicate attempt ${id}`);
    attempts.set(id, entry);
  }
  if (failedSamples.some(({ sampleId }) => !attempts.has(sampleId))) {
    throw new TypeError('one attempt per failure sample required');
  }

  const organizationIndex = buildOrganizationIndex(contactMatrix);
  const activeReferences = activeRecoveryView
    ? new Map(activeRecoveryView.reference.records.map((row) => [row.referenceId, row]))
    : null;
  const records = failedSamples.map((sample) => {
    const attempt = attempts.get(sample.sampleId);
    if (!FAILURE_STATUSES.has(attempt.status)) {
      throw new TypeError(`unsupported failure status ${attempt.status ?? 'missing'}`);
    }
    if (attempt.status !== sample.acquisition.status) {
      throw new TypeError(`attempt/report status mismatch for ${sample.sampleId}`);
    }
    const details = candidateDetails(attempt);
    const organization = organizationFor(sample.brand, organizationIndex);
    const transportFailures = (attempt.transportErrors ?? []).map((entry) => ({
      code: transportFailureCode(entry.reason),
      host: new URL(requiredText(entry.sourceUrl, 'transport source URL')).hostname.toLowerCase(),
    }));
    const activeReference = activeReferences?.get(sample.referenceId) ?? null;
    if (activeReferences && !activeReference) {
      throw new Error(`failure inventory reference outside active release: ${sample.referenceId}`);
    }
    return {
      sampleId: sample.sampleId,
      category: requiredText(sample.category, 'sample category'),
      brand: requiredText(sample.brand, 'sample brand'),
      model: requiredText(sample.model, 'sample model'),
      representedTargetCount: Number.isInteger(sample.representedTargetCount) && sample.representedTargetCount > 0
        ? sample.representedTargetCount
        : 1,
      lifecycleState: activeReference?.lifecycleState ?? sample.lifecycleState ?? null,
      priorityClass: lifecyclePriority(
        sample,
        activeReference?.lifecycleState ?? sample.lifecycleState ?? null,
      ),
      sourceHost: requiredText(sample.sourceHost, 'sample source host').toLowerCase(),
      organization,
      acquisitionStatus: attempt.status,
      primaryMechanism: mechanismFor(attempt, details),
      resolverContract: details.resolverContract,
      resolverIds: details.resolverIds,
      candidateCounts: {
        all: details.candidates.length,
        officialDocuments: details.officialDocuments.length,
        officialProductPages: details.officialProductPages.length,
        references: details.references.length,
      },
      candidateHosts: [...new Set(details.candidates.map(({ host }) => host))].sort(),
      transportFailures,
      publicationEligible: false,
    };
  });

  const byMechanism = countByMechanism(records);
  const currentRecords = records.filter((record) => record.lifecycleState === 'CURRENT_RETAIL');
  const currentCanaries = selectCurrentCanaries(records);
  const archivedRecords = records.filter((record) => record.lifecycleState === 'CATALOG_ARCHIVED');
  const retainedFixtures = RETAINED_HISTORICAL_FIXTURE_IDS
    .map((sampleId) => archivedRecords.find((record) => record.sampleId === sampleId));
  const historicalFixtures = (retainedFixtures.every(Boolean)
    ? retainedFixtures
    : archivedRecords.slice(0, 5))
    .map((record) => ({ ...record, lane: 'HISTORICAL_OFFLINE_FIXTURE' }));
  const currentRetailDenominator = {
    records: currentRecords.length,
    representedTargets: currentRecords.reduce((sum, row) => sum + row.representedTargetCount, 0),
    byMechanism: countByMechanism(currentRecords),
    ...(activeRecoveryView ? {
      releaseCandidateId: activeRecoveryView.releaseCandidateId,
      activeHistoricalReferences: activeRecoveryView.summary.references,
      activeCurrentReferences: activeRecoveryView.summary.byLifecycle.CURRENT_RETAIL ?? 0,
    } : {}),
  };
  const recoveryRanking = PDF_ACQUISITION_FAILURE_MECHANISMS
    .map((mechanism) => {
      const matching = records.filter((entry) => entry.primaryMechanism === mechanism);
      return {
        mechanism,
        samples: matching.length,
        representedTargets: matching.reduce((sum, entry) => sum + entry.representedTargetCount, 0),
      };
    })
    .filter(({ samples }) => samples > 0)
    .sort((left, right) => right.representedTargets - left.representedTargets
      || right.samples - left.samples
      || left.mechanism.localeCompare(right.mechanism));

  const semantic = {
    schemaVersion: 1,
    sourceBindings: bindings,
    records,
    currentRetailDenominator,
    currentCanaries,
    historicalFixtures,
  };
  return {
    ...semantic,
    inventoryId: `pdf_acquisition_failure_inventory_${semanticSha256(semantic).slice(0, 24)}`,
    summary: {
      totalFailures: records.length,
      representedTargets: records.reduce((sum, entry) => sum + entry.representedTargetCount, 0),
      publicationEligible: records.filter(({ publicationEligible }) => publicationEligible).length,
      unmappedOrganizationSamples: records.filter(({ organization }) => organization.mapping === 'brand_fallback').length,
      byMechanism,
    },
    recoveryRanking,
    groups: {
      byOrganization: groupRecords(records, ({ organization }) => organization),
      byBrand: groupRecords(records, ({ brand }) => ({ key: normalizedKey(brand), label: brand })),
      byHost: groupRecords(records, ({ sourceHost }) => ({ key: sourceHost, label: sourceHost })),
      byCategory: groupRecords(records, ({ category }) => ({ key: category, label: category })),
      byResolverContract: groupRecords(records, ({ resolverContract }) => ({
        key: resolverContract,
        label: resolverContract,
      })),
    },
  };
}
