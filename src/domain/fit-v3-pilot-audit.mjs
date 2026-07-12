function violation(code, detail) {
  return Object.freeze({ code, detail });
}

function leakedShadowPath(value, path = '$') {
  if (!value || typeof value !== 'object') return null;
  for (const [key, item] of Object.entries(value)) {
    const current = `${path}.${key}`;
    if (/fit[_-]?v3|official[_-]?registry|registry[_-]?reconciliation/i.test(key)) return current;
    const nested = leakedShadowPath(item, current);
    if (nested) return nested;
  }
  return null;
}

export function auditFitV3Pilot({
  baseline,
  currentHashes,
  enforceBaselineHashes = true,
  snapshots,
  reconciliation,
  pilot,
  researchQueue,
  fitV3Audit,
  publicCatalog,
}) {
  const violations = [];
  if (enforceBaselineHashes) {
    for (const key of ['publicProjection', 'runtimeCatalog', 'fitPublicationAudit']) {
      if (baseline?.[key]?.sha256 !== currentHashes?.[key]) {
        violations.push(violation(`${key.replace(/([A-Z])/g, '_$1').toUpperCase()}_HASH_DRIFT`, `${key} changed during a shadow-only pilot`));
      }
    }
  }
  const requiredSources = new Set(['energy-rating:fridge', 'energy-rating:dishwasher', 'wels:all-models']);
  for (const row of snapshots?.snapshots ?? []) {
    requiredSources.delete(row.manifest?.sourceId);
    if (!/^[a-f0-9]{64}$/.test(row.manifest?.contentSha256 ?? '') || !Number.isInteger(row.manifest?.byteLength) || row.manifest.byteLength <= 0) {
      violations.push(violation('INVALID_SNAPSHOT_MANIFEST', row.manifest?.sourceId ?? 'unknown source'));
    }
    if (row.manifest?.licence?.permitsRepositoryDerivatives !== true) violations.push(violation('SNAPSHOT_LICENCE_NOT_BOUND', row.manifest?.sourceId ?? 'unknown source'));
    if (row.manifest?.storage?.rootEnv !== 'FITAPPLIANCE_STORAGE_ROOT') violations.push(violation('NON_PORTABLE_SNAPSHOT_STORAGE', row.manifest?.sourceId ?? 'unknown source'));
  }
  for (const sourceId of requiredSources) violations.push(violation('MISSING_REQUIRED_SNAPSHOT', sourceId));
  const currentSnapshotHashes = [...new Set((snapshots?.snapshots ?? [])
    .filter((row) => ['energy-rating:fridge', 'energy-rating:dishwasher', 'wels:all-models'].includes(row.manifest?.sourceId))
    .map((row) => row.manifest.contentSha256))].sort();
  const pilotSnapshotHashes = [...new Set(pilot?.sourceSnapshotHashes ?? [])].sort();
  if (JSON.stringify(currentSnapshotHashes) !== JSON.stringify(pilotSnapshotHashes)) {
    violations.push(violation('FROZEN_PILOT_SNAPSHOT_DRIFT', 'Frozen pilot snapshot hashes do not match the committed registry inputs'));
  }
  if ((reconciliation?.summary?.dimensionsPromoted ?? -1) !== 0 || (reconciliation?.summary?.publicWrites ?? -1) !== 0
    || [...(reconciliation?.energyRating ?? []), ...(reconciliation?.wels ?? [])].some((row) => row.canPromoteDimensions === true)) {
    violations.push(violation('REGISTRY_DIMENSION_PROMOTION', 'Registry observations must remain candidate-only'));
  }
  const pilotIds = (pilot?.products ?? []).map((row) => row.canonicalProductId);
  if (pilot?.frozen !== true || pilotIds.length !== 100 || new Set(pilotIds).size !== 100
    || pilot?.summary?.byCategory?.fridge !== 50 || pilot?.summary?.byCategory?.dishwasher !== 50) {
    violations.push(violation('INVALID_FROZEN_PILOT', 'Pilot must contain 50 unique refrigerators and 50 unique dishwashers'));
  }
  if (pilot?.selectionPolicy?.maxRetailerAgeDays !== 90 || Number.isNaN(new Date(pilot?.selectionPolicy?.asOf).getTime())) {
    violations.push(violation('INVALID_CURRENT_LISTING_POLICY', 'Pilot must enforce the 90-day retailer freshness policy'));
  }
  const queueIds = new Set((researchQueue?.cases ?? []).map((row) => row.canonicalProductId));
  if (queueIds.size !== 100 || pilotIds.some((id) => !queueIds.has(id)) || (researchQueue?.cases ?? []).some((row) => row.publicationState !== 'shadow_quarantined' || !row.nextAction?.strategy)) {
    violations.push(violation('INCOMPLETE_RESEARCH_QUEUE', 'Every pilot product needs a quarantined case and bounded next action'));
  }
  const fitIds = new Set((fitV3Audit?.entries ?? []).map((row) => row.canonicalProductId));
  if (fitIds.size !== 100 || pilotIds.some((id) => !fitIds.has(id))) violations.push(violation('INCOMPLETE_FIT_V3_AUDIT', 'Fit V3 readiness must cover all pilot products'));
  if ((fitV3Audit?.summary?.verifiedFitEligible ?? -1) !== 0
    || (fitV3Audit?.summary?.publicMutations ?? -1) !== 0
    || (fitV3Audit?.entries ?? []).some((row) => row.verifiedFitEligible === true || row.publicationEligible === true)) {
    violations.push(violation('FALSE_VERIFIED_FIT_ELIGIBILITY', 'No pilot record may be publication or Verified Fit eligible'));
  }
  const leaked = leakedShadowPath(publicCatalog);
  if (leaked) violations.push(violation('SHADOW_FIELD_LEAKED_PUBLIC', leaked));
  return Object.freeze({
    schemaVersion: 1,
    passed: violations.length === 0,
    violations,
    summary: {
      snapshots: snapshots?.snapshots?.length ?? 0,
      pilotProducts: pilotIds.length,
      researchCases: queueIds.size,
      fitV3Entries: fitIds.size,
      publicHashDrift: violations.filter((row) => row.code.endsWith('_HASH_DRIFT')).length,
      dimensionPromotions: violations.filter((row) => row.code === 'REGISTRY_DIMENSION_PROMOTION').length,
      falseVerifiedFit: violations.filter((row) => row.code === 'FALSE_VERIFIED_FIT_ELIGIBILITY').length,
    },
  });
}
