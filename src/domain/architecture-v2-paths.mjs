import { resolve } from 'node:path';

const base = 'data/architecture-v2';

export const architectureV2Paths = Object.freeze({
  retailerSourcePolicy: `${base}/policies/retailer-source-policy.json`,
  canonicalIdentityDecisions: `${base}/decisions/canonical-identity-decisions.json`,
  canonicalPublicationQuarantine: `${base}/decisions/canonical-publication-quarantine.json`,
  phase1QuarantineDisposition: `${base}/decisions/phase1-quarantine-disposition.json`,
  phase08Selection: `${base}/reviews/phase-08/evidence-pilot.json`,
  phase08DimensionInput: `${base}/reviews/phase-08/evidence-pilot-review-input.json`,
  phase09SpaceInput: `${base}/reviews/phase-09/space-evidence-pilot-input.json`,
  phase10SelectionInput: `${base}/reviews/phase-10/evidence-batch-selection-input.json`,
  phase10AcquisitionInput: `${base}/reviews/phase-10/evidence-acquisition-input.json`,
  phase10ReviewInput: `${base}/reviews/phase-10/evidence-review-input.json`,
  phase10AliasEvidenceObjects: `${base}/reviews/phase-10/alias-evidence-objects.json`,
  evidenceResolutionInput: `${base}/reviews/automated/evidence-resolution-cases.json`,
  retailerObservations: `${base}/observations/retailer-observations.json`,
  canonicalRegistry: `${base}/generated/canonical-registry.json`,
  evidenceResolutionManifest: `${base}/generated/evidence-resolution-manifest.json`,
  evidenceObjectIndex: `${base}/generated/evidence-object-index.json`,
  evidenceReviewBundles: `${base}/generated/evidence-review-bundles.json`,
  dimensionReviewManifest: `${base}/generated/evidence-pilot-review-manifest.json`,
  historicalIdentifierMappings: `${base}/generated/historical-identifier-mappings.json`,
  phase10EvidenceBatch: `${base}/generated/phase10-evidence-batch.json`,
  phase10Acquisition: `${base}/generated/phase10-evidence-acquisition.json`,
  phase10ReviewCandidates: `${base}/generated/phase10-evidence-review-candidates.json`,
  phase10ReviewManifest: `${base}/generated/phase10-evidence-review-manifest.json`,
  publicProjection: `${base}/generated/public-catalog-projection.json`,
  sourceDocuments: `${base}/generated/source-documents.json`,
  spaceReviewManifest: `${base}/generated/space-evidence-pilot-review-manifest.json`,
});

export const ARCHITECTURE_V2_BUILD_GRAPH = Object.freeze({
  evidenceResolutionManifest: Object.freeze([]),
  canonicalRegistry: Object.freeze(['evidenceResolutionManifest']),
  phase10EvidenceBatch: Object.freeze([]),
  phase10Acquisition: Object.freeze(['phase10EvidenceBatch']),
  evidenceReviewBundles: Object.freeze(['canonicalRegistry']),
  dimensionReviewManifest: Object.freeze(['evidenceReviewBundles']),
  spaceReviewManifest: Object.freeze(['evidenceReviewBundles', 'dimensionReviewManifest']),
  phase10ReviewManifest: Object.freeze(['phase10EvidenceBatch', 'phase10Acquisition']),
  sourceDocuments: Object.freeze(['canonicalRegistry', 'evidenceReviewBundles', 'dimensionReviewManifest', 'spaceReviewManifest', 'phase10ReviewManifest']),
  publicProjection: Object.freeze(['canonicalRegistry', 'evidenceReviewBundles', 'dimensionReviewManifest', 'spaceReviewManifest', 'phase10ReviewManifest']),
});

export const ARCHITECTURE_V2_BUILD_ORDER = Object.freeze(Object.keys(ARCHITECTURE_V2_BUILD_GRAPH));

export function resolveArchitectureV2Path(root, key) {
  const relativePath = architectureV2Paths[key];
  if (!relativePath) throw new TypeError(`unknown Architecture V2 path: ${key}`);
  return resolve(root, relativePath);
}
