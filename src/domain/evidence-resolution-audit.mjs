function daysBetween(earlier, later) {
  return Math.max(0, (Date.parse(later) - Date.parse(earlier)) / (24 * 60 * 60 * 1000));
}

function counts(values) {
  const result = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

export function auditEvidenceResolution(input, manifest, options = {}) {
  const asOf = options.asOf ?? new Date().toISOString();
  const errors = [];
  const warnings = [];
  const cases = Array.isArray(input?.cases) ? input.cases : [];
  const results = Array.isArray(manifest?.results) ? manifest.results : [];
  const caseIds = new Set();
  const productIds = new Set();
  for (const row of cases) {
    if (caseIds.has(row.id)) errors.push(`duplicate case ID ${row.id}`);
    if (productIds.has(row.legacyRuntimeId)) errors.push(`duplicate active product case ${row.legacyRuntimeId}`);
    caseIds.add(row.id);
    productIds.add(row.legacyRuntimeId);
  }
  if (results.length !== cases.length) errors.push('manifest result count does not match case count');
  const resultByProduct = new Map(results.map((row) => [row.legacyRuntimeId, row]));
  const activeQuarantine = new Set((manifest?.activeQuarantines ?? []).map((row) => row.legacyRuntimeId));
  const released = new Set(manifest?.releasedLegacyIds ?? []);
  const releaseGrants = new Set((manifest?.releaseGrants ?? []).map((row) => row.legacyRuntimeId));
  for (const row of results) {
    const resolved = row?.decision?.status === 'resolved' && row?.decision?.publication?.release === true;
    if (resolved) {
      if (!released.has(row.legacyRuntimeId) || !releaseGrants.has(row.legacyRuntimeId)) {
        errors.push(`release drift for ${row.legacyRuntimeId}`);
      }
      if (activeQuarantine.has(row.legacyRuntimeId)) errors.push(`resolved product remains in active quarantine ${row.legacyRuntimeId}`);
    } else {
      if (!activeQuarantine.has(row.legacyRuntimeId)) errors.push(`quarantine coverage missing for ${row.legacyRuntimeId}`);
      if (released.has(row.legacyRuntimeId) || releaseGrants.has(row.legacyRuntimeId)) {
        errors.push(`release drift for unresolved ${row.legacyRuntimeId}`);
      }
    }
    if (row?.decision?.requiresHumanReview === true) errors.push(`human review dependency for ${row.legacyRuntimeId}`);
  }
  for (const legacyRuntimeId of released) {
    const row = resultByProduct.get(legacyRuntimeId);
    if (!row || row.decision.status !== 'resolved') errors.push(`release drift for unknown or unresolved ${legacyRuntimeId}`);
  }
  if ((manifest?.summary?.requiresHumanReview ?? 0) !== 0) errors.push('human review summary must remain zero');
  const retrievedTimes = cases.flatMap((row) => (row.sources ?? []).map((source) => source.retrievedAt))
    .filter((value) => Number.isFinite(Date.parse(value)));
  const ages = retrievedTimes.map((value) => daysBetween(value, asOf));
  const refreshFailures = cases.reduce((total, row) => total
    + (row.refreshHistory ?? []).filter((event) => event.outcome === 'failed').length, 0);
  if (refreshFailures) warnings.push(`${refreshFailures} source refresh failures recorded`);
  const statuses = results.map((row) => row?.decision?.status ?? 'missing');
  const terminalReasons = results.map((row) => row?.decision?.terminalReason).filter(Boolean);
  const metrics = {
    cases: cases.length,
    resolved: statuses.filter((status) => status === 'resolved').length,
    researchRequired: statuses.filter((status) => status === 'research_required').length,
    reconciliationRequired: statuses.filter((status) => status === 'reconciliation_required').length,
    quarantined: statuses.filter((status) => status === 'quarantined').length,
    maximumAttempt: cases.length ? Math.max(...cases.map((row) => Number(row.attempt) || 0)) : 0,
    oldestEvidenceAgeDays: ages.length ? Math.max(...ages) : null,
    refreshFailures,
    statusCounts: counts(statuses),
    terminalReasonCounts: counts(terminalReasons),
  };
  return Object.freeze({
    schemaVersion: 1,
    asOf,
    metrics: Object.freeze(metrics),
    errors: Object.freeze([...new Set(errors)].sort()),
    warnings: Object.freeze(warnings.sort()),
  });
}

export function assertEvidenceResolutionAudit(audit) {
  if (!audit || !Array.isArray(audit.errors) || audit.errors.length) {
    throw new Error(`evidence resolution audit failed: ${(audit?.errors ?? ['invalid audit']).join('; ')}`);
  }
  return true;
}
