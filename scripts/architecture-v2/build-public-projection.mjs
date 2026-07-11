#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildPublicProjection } from '../../src/domain/public-projection.mjs';
import { applyEvidencePilotReview, buildPilotEvidenceProjection } from '../../src/domain/evidence-review.mjs';
import { buildSpaceEvidenceProjection } from '../../src/domain/space-evidence-review.mjs';
import { createCategoryGeometry } from '../../src/domain/category-geometry.mjs';
import brandCanon from '../brand-canon.js';

const root = resolve(new URL('../..', import.meta.url).pathname);
const registry = JSON.parse(await readFile(resolve(root, 'data/architecture-v2/canonical-registry.json'), 'utf8'));
const catalog = JSON.parse(await readFile(resolve(root, 'data/catalog-final.json'), 'utf8'));
const reviewBundles = JSON.parse(await readFile(resolve(root, 'data/architecture-v2/evidence-review-bundles.json'), 'utf8'));
const reviewManifest = JSON.parse(await readFile(resolve(root, 'data/architecture-v2/evidence-pilot-review-manifest.json'), 'utf8'));
const spaceReviewManifest = JSON.parse(await readFile(resolve(root, 'data/architecture-v2/space-evidence-pilot-review-manifest.json'), 'utf8'));
const pilotEvidence = buildPilotEvidenceProjection(applyEvidencePilotReview({ bundles: reviewBundles.bundles, manifest: reviewManifest }));
const spaceEvidence = buildSpaceEvidenceProjection(spaceReviewManifest.results);
const canonicalByLegacy = new Map(registry.identifierMappings.map((row) => [row.legacyRuntimeId, row.canonicalProductId]));
const quarantined = new Set(registry.quarantine.map((row) => row.legacyRuntimeId));
const filtered = {
  ...catalog,
  products: catalog.products
    .filter((row) => !quarantined.has(String(row.id).toLowerCase()))
    .map((row) => {
      const canonicalProductId = canonicalByLegacy.get(String(row.id).toLowerCase());
      const review = pilotEvidence.get(canonicalProductId);
      if (!review) return { ...row, brand: brandCanon.canonicalizeBrand(row.brand) };
      const space = spaceEvidence.get(canonicalProductId);
      const values = { ...review.values, ...(space?.values ?? {}) };
      const geometryV2 = review.trustLevel === 'dimensions_verified' ? createCategoryGeometry(row.cat, {
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
        data_source: review.trustLevel === 'dimensions_verified' ? 'official_pdf_dimensions_only' : 'retailer_spec',
        evidence: {
          ...(row.evidence ?? {}),
          has_pdf_evidence: true,
          trust_level: review.trustLevel,
          verified_fields: review.trustLevel === 'dimensions_verified' ? ['dimensions'] : [],
          clearance_verified: space?.clearanceVerified === true,
          v2_review: {
            status: space ? 'space_partially_approved' : review.reviewStatus,
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
await writeFile(resolve(root, 'data/architecture-v2/public-catalog-projection.json'), `${JSON.stringify(projection)}\n`);
console.log(JSON.stringify({ products: projection.products.length, quarantined: registry.quarantine.length }));
