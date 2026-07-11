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
  retailerObservations: `${base}/observations/retailer-observations.json`,
  canonicalRegistry: `${base}/generated/canonical-registry.json`,
  evidenceObjectIndex: `${base}/generated/evidence-object-index.json`,
  evidenceReviewBundles: `${base}/generated/evidence-review-bundles.json`,
  dimensionReviewManifest: `${base}/generated/evidence-pilot-review-manifest.json`,
  historicalIdentifierMappings: `${base}/generated/historical-identifier-mappings.json`,
  publicProjection: `${base}/generated/public-catalog-projection.json`,
  sourceDocuments: `${base}/generated/source-documents.json`,
  spaceReviewManifest: `${base}/generated/space-evidence-pilot-review-manifest.json`,
});

export const ARCHITECTURE_V2_BUILD_GRAPH = Object.freeze({
  canonicalRegistry: Object.freeze([]),
  evidenceReviewBundles: Object.freeze(['canonicalRegistry']),
  dimensionReviewManifest: Object.freeze(['evidenceReviewBundles']),
  spaceReviewManifest: Object.freeze(['evidenceReviewBundles', 'dimensionReviewManifest']),
  sourceDocuments: Object.freeze(['canonicalRegistry', 'evidenceReviewBundles', 'dimensionReviewManifest', 'spaceReviewManifest']),
  publicProjection: Object.freeze(['canonicalRegistry', 'evidenceReviewBundles', 'dimensionReviewManifest', 'spaceReviewManifest']),
});

export const ARCHITECTURE_V2_BUILD_ORDER = Object.freeze(Object.keys(ARCHITECTURE_V2_BUILD_GRAPH));

export function resolveArchitectureV2Path(root, key) {
  const relativePath = architectureV2Paths[key];
  if (!relativePath) throw new TypeError(`unknown Architecture V2 path: ${key}`);
  return resolve(root, relativePath);
}
