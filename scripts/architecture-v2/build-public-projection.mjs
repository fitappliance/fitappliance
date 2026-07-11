#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildPublicProjection } from '../../src/domain/public-projection.mjs';
import { applyEvidencePilotReview, buildPilotEvidenceProjection } from '../../src/domain/evidence-review.mjs';
import brandCanon from '../brand-canon.js';

const root = resolve(new URL('../..', import.meta.url).pathname);
const registry = JSON.parse(await readFile(resolve(root, 'data/architecture-v2/canonical-registry.json'), 'utf8'));
const catalog = JSON.parse(await readFile(resolve(root, 'data/catalog-final.json'), 'utf8'));
const reviewBundles = JSON.parse(await readFile(resolve(root, 'data/architecture-v2/evidence-review-bundles.json'), 'utf8'));
const reviewManifest = JSON.parse(await readFile(resolve(root, 'data/architecture-v2/evidence-pilot-review-manifest.json'), 'utf8'));
const pilotEvidence = buildPilotEvidenceProjection(applyEvidencePilotReview({ bundles: reviewBundles.bundles, manifest: reviewManifest }));
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
      return {
        ...row,
        brand: brandCanon.canonicalizeBrand(row.brand),
        data_source: review.trustLevel === 'dimensions_verified' ? 'official_pdf_dimensions_only' : 'retailer_spec',
        evidence: {
          ...(row.evidence ?? {}),
          has_pdf_evidence: true,
          trust_level: review.trustLevel,
          verified_fields: review.trustLevel === 'dimensions_verified' ? ['dimensions'] : [],
          clearance_verified: false,
          v2_review: {
            status: review.reviewStatus,
            reviewed_at: review.reviewedAt,
            approved_fields: review.approvedFields,
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
