#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const readJson = async (relativePath) => JSON.parse(await readFile(resolve(root, relativePath), 'utf8'));
const input = await readJson(resolveArchitectureV2Path(root, 'phase08DimensionInput'));
const bundles = (await readJson(resolveArchitectureV2Path(root, 'evidenceReviewBundles'))).bundles;
const bundleMap = new Map(bundles.map((row) => [row.product.legacyRuntimeId, row]));
const reviews = input.reviews.map((review) => {
  const bundle = bundleMap.get(review.id);
  if (!bundle) throw new TypeError(`review input has no bundle: ${review.id}`);
  const approvedFields = review.approve === 'all' ? new Set(bundle.fields.map((row) => row.field)) : new Set(review.approve ?? []);
  const documentApproved = approvedFields.size > 0;
  return {
    legacyRuntimeId: review.id,
    document: {
      authorType: 'manufacturer',
      sha256: review.hash,
      pageCount: review.pages,
      parserVersion: input.parserVersion,
      identityOutcome: documentApproved ? 'exact' : 'ambiguous',
    },
    renderedPages: [review.page],
    fields: bundle.fields.map((field) => ({
      field: field.field,
      status: approvedFields.has(field.field) ? 'approved' : 'quarantined',
      reason: approvedFields.has(field.field) ? null : (review.reason ?? review.fieldReason),
      reviewer: input.reviewer,
      reviewedAt: input.reviewedAt,
      renderedPageVerified: true,
      page: review.page,
      quote: review.quote ?? `No exact identity approval: ${review.reason}`,
    })),
  };
});
const output = { schemaVersion: 1, reviewedAt: input.reviewedAt, reviews };
await writeFile(resolveArchitectureV2Path(root, 'dimensionReviewManifest'), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ reviews: reviews.length, fields: reviews.reduce((sum, row) => sum + row.fields.length, 0) }));
