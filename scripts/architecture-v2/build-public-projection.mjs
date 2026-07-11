#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildPublicProjection } from '../../src/domain/public-projection.mjs';
import { applyEvidencePilotReview, buildPilotEvidenceProjection } from '../../src/domain/evidence-review.mjs';
import { buildSpaceEvidenceProjection } from '../../src/domain/space-evidence-review.mjs';
import { createCategoryGeometry } from '../../src/domain/category-geometry.mjs';
import brandCanon from '../brand-canon.js';
import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { buildPhase10EvidenceProjection } from '../../src/domain/phase10-evidence-review.mjs';
import { applyResolutionToProduct } from '../../src/domain/evidence-resolution-loop.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const registry = JSON.parse(await readFile(resolveArchitectureV2Path(root, 'canonicalRegistry'), 'utf8'));
const catalog = JSON.parse(await readFile(resolve(root, 'data/catalog-final.json'), 'utf8'));
const reviewBundles = JSON.parse(await readFile(resolveArchitectureV2Path(root, 'evidenceReviewBundles'), 'utf8'));
const reviewManifest = JSON.parse(await readFile(resolveArchitectureV2Path(root, 'dimensionReviewManifest'), 'utf8'));
const spaceReviewManifest = JSON.parse(await readFile(resolveArchitectureV2Path(root, 'spaceReviewManifest'), 'utf8'));
const phase10ReviewManifest = JSON.parse(await readFile(resolveArchitectureV2Path(root, 'phase10ReviewManifest'), 'utf8'));
const resolutionManifest = JSON.parse(await readFile(resolveArchitectureV2Path(root, 'evidenceResolutionManifest'), 'utf8'));
const pilotEvidence = buildPilotEvidenceProjection(applyEvidencePilotReview({ bundles: reviewBundles.bundles, manifest: reviewManifest }));
for (const [id, review] of buildPhase10EvidenceProjection(phase10ReviewManifest.outcomes)) pilotEvidence.set(id, review);
const spaceEvidence = buildSpaceEvidenceProjection(spaceReviewManifest.results);
const canonicalByLegacy = new Map(registry.identifierMappings.map((row) => [row.legacyRuntimeId, row.canonicalProductId]));
const quarantined = new Set(registry.quarantine.map((row) => row.legacyRuntimeId));
for (const row of resolutionManifest.activeQuarantines ?? []) {
  if (!quarantined.has(row.legacyRuntimeId)) {
    throw new Error(`resolution quarantine missing from canonical registry: ${row.legacyRuntimeId}`);
  }
}
const resolutionByLegacy = new Map(resolutionManifest.results.map((row) => [row.legacyRuntimeId, row.decision]));
const filtered = {
  ...catalog,
  products: catalog.products
    .filter((row) => !quarantined.has(String(row.id).toLowerCase()))
    .map((row) => {
      const resolution = resolutionByLegacy.get(String(row.id).toLowerCase());
      if (resolution?.status === 'resolved' && resolution?.publication?.release === true) {
        return {
          ...applyResolutionToProduct(row, resolution),
          brand: brandCanon.canonicalizeBrand(row.brand),
        };
      }
      const canonicalProductId = canonicalByLegacy.get(String(row.id).toLowerCase());
      const review = pilotEvidence.get(canonicalProductId);
      if (!review) return { ...row, brand: brandCanon.canonicalizeBrand(row.brand) };
      const space = spaceEvidence.get(canonicalProductId);
      const values = { ...review.values, ...(space?.values ?? {}) };
      const hasVerifiedDimensions = ['dimensions_verified', 'verified_fit'].includes(review.trustLevel);
      const geometryV2 = hasVerifiedDimensions ? createCategoryGeometry(row.cat, {
        closedEnvelope: {
          widthMm: values['closedEnvelope.widthMm'] ?? null,
          heightMm: values['closedEnvelope.heightMm'] ?? null,
          depthMm: values['closedEnvelope.depthMm'] ?? null,
        },
        installation: {
          leftMm: values['installation.leftMm'] ?? null,
          rightMm: values['installation.rightMm'] ?? null,
          topMm: values['installation.topMm'] ?? null,
          rearMm: values['installation.rearMm'] ?? null,
          frontMm: values['installation.frontMm'] ?? null,
        },
        operation: {
          doorOpenDepthMm: values['operation.doorOpenDepthMm'] ?? null,
          hingeSideSpaceMm: values['operation.hingeSideSpaceMm'] ?? null,
          lidOpenHeightMm: values['operation.lidOpenHeightMm'] ?? null,
        },
        service: {
          plumbingRearMm: values['service.plumbingRearMm'] ?? null,
          rearServicesMm: values['service.rearServicesMm'] ?? null,
          rearVentilationMm: values['service.rearVentilationMm'] ?? null,
        },
        delivery: {},
      }) : null;
      const approvedFields = [...new Set([...review.approvedFields, ...(space?.approvedFields ?? [])])].sort();
      return {
        ...row,
        brand: brandCanon.canonicalizeBrand(row.brand),
        ...(geometryV2 ? { geometry_v2: geometryV2 } : {}),
        data_source: hasVerifiedDimensions ? 'official_pdf_dimensions_only' : 'retailer_spec',
        evidence: {
          ...(row.evidence ?? {}),
          has_pdf_evidence: true,
          trust_level: review.trustLevel,
          verified_fields: hasVerifiedDimensions ? ['dimensions'] : [],
          clearance_verified: (space?.clearanceVerified ?? review.clearanceVerified) === true,
          v2_review: {
            status: space ? 'space_partially_approved' : (review.reviewStatus ?? 'phase10_reviewed'),
            reviewed_at: review.reviewedAt,
            approved_fields: approvedFields,
            approved_space_values: space?.values ?? {},
            source_document_id: review.sourceDocumentId,
            document_sha256: review.documentSha256,
            limitations: review.limitations,
          },
        },
      };
    }),
};
const projection = buildPublicProjection(registry, filtered);
await writeFile(resolveArchitectureV2Path(root, 'publicProjection'), `${JSON.stringify(projection)}\n`);
console.log(JSON.stringify({ products: projection.products.length, quarantined: registry.quarantine.length }));
