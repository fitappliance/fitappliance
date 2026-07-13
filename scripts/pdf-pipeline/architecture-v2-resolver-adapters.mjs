import { createRequire } from 'node:module';

import { createEvidenceSourceResolverAdapter } from '../../src/domain/evidence-source-adapter-contract.mjs';
import { isOfficialBrandUrl } from '../../src/domain/evidence-source-verifier.mjs';

const require = createRequire(import.meta.url);
const { findFisherPaykelOfficialPdf } = require('./fisher-paykel-official.js');
const { findLgOfficialPdf } = require('./lg-official.js');
const { findElectroluxGroupFactsheet } = require('./electrolux-group-official.js');

function exactTarget(caseRecord) {
  const brand = String(caseRecord?.brand ?? '').trim();
  const model = String(caseRecord?.model ?? caseRecord?.sku ?? '').trim();
  if (!brand || !model) throw new TypeError('resolver target requires exact brand and model');
  return { brand, model, sku: model };
}

function authorityForUrl(sourceUrl, brand) {
  return isOfficialBrandUrl(sourceUrl, brand) ? 'official' : 'reference';
}

function sourceRole(authorityMode, documentType) {
  if (documentType === 'product_page') return 'manufacturer_product_page';
  return authorityMode === 'official' ? 'manufacturer_document' : 'retailer_reference';
}

function normalizeDocumentType(value) {
  const text = String(value ?? '').toLowerCase().replace(/[\s-]+/g, '_');
  if (/quick_reference|\bqrg\b/.test(text)) return 'quick_reference_guide';
  if (/install/.test(text)) return 'installation_guide';
  if (/fact|spec|data_sheet|technical/.test(text)) return 'specification_sheet';
  if (/owner|user|operat|instruction|manual/.test(text)) return 'user_manual';
  return 'family_manual';
}

function typedCandidate({
  sourceUrl,
  brand,
  discoveryMethod,
  documentType,
  sourceModelHint,
  requiredAttempt = true,
}) {
  const authorityMode = authorityForUrl(sourceUrl, brand);
  return {
    sourceUrl,
    discoveryMethod,
    documentType,
    sourceModelHint: sourceModelHint || null,
    authorityMode,
    sourceRole: sourceRole(authorityMode, documentType),
    requiredAttempt: authorityMode === 'official' ? requiredAttempt : false,
  };
}

function uniqueCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = `${candidate.authorityMode}\0${new URL(candidate.sourceUrl).toString()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function completionFromError(error) {
  const message = String(error?.message ?? error);
  if (/not found|returned HTTP 404|HTTP 410/i.test(message)) {
    return { completion: 'complete', candidates: [], failures: [] };
  }
  return {
    completion: error?.name === 'AbortError' || /timeout|timed out|aborted/i.test(message)
      ? 'timed_out'
      : 'failed',
    candidates: [],
    failures: [{ code: 'resolver_failed', message }],
  };
}

export function createFisherPaykelResolverAdapter(options = {}) {
  const finder = options.finder ?? findFisherPaykelOfficialPdf;
  return createEvidenceSourceResolverAdapter({
    resolverId: 'fisher-paykel-official-support',
    version: '1',
    scope: 'exact_model_product_page_and_support_documents',
    required: true,
    async resolve(caseRecord) {
      const target = exactTarget(caseRecord);
      try {
        const result = await finder(target, options.finderOptions ?? {});
        if (!result?.sourceUrl) {
          return { completion: 'complete', candidates: [], failures: [] };
        }
        const modelHint = result.matchedSku || target.model;
        const resources = [
          {
            url: result.sourceUrl,
            type: result.resourceType,
          },
          ...(result.resources ?? []),
        ].filter((resource) => resource?.url && !/energy_label/i.test(resource.type ?? ''));
        const candidates = resources.map((resource) => typedCandidate({
          sourceUrl: resource.url,
          brand: target.brand,
          discoveryMethod: 'fisher_paykel_product_page_resource',
          documentType: normalizeDocumentType(resource.type),
          sourceModelHint: modelHint,
        }));
        if (result.productPageUrl) {
          candidates.push(typedCandidate({
            sourceUrl: result.productPageUrl,
            brand: target.brand,
            discoveryMethod: 'fisher_paykel_product_page',
            documentType: 'product_page',
            sourceModelHint: modelHint,
            requiredAttempt: false,
          }));
        }
        return { completion: 'complete', candidates: uniqueCandidates(candidates), failures: [] };
      } catch (error) {
        return completionFromError(error);
      }
    },
  });
}

export function createLgResolverAdapter(options = {}) {
  const finder = options.finder ?? findLgOfficialPdf;
  return createEvidenceSourceResolverAdapter({
    resolverId: 'lg-official-support',
    version: '1',
    scope: 'exact_model_au_support_api_documents',
    required: true,
    async resolve(caseRecord) {
      const target = exactTarget(caseRecord);
      try {
        const result = await finder(target, options.finderOptions ?? {});
        return {
          completion: 'complete',
          candidates: result?.sourceUrl ? [typedCandidate({
            sourceUrl: result.sourceUrl,
            brand: target.brand,
            discoveryMethod: 'lg_au_support_api',
            documentType: normalizeDocumentType(result.resourceType || result.originalFileName),
            sourceModelHint: result.lookupSku || result.modelName || target.model,
          })] : [],
          failures: [],
        };
      } catch (error) {
        return completionFromError(error);
      }
    },
  });
}

export function createElectroluxGroupResolverAdapter(options = {}) {
  const finder = options.finder ?? findElectroluxGroupFactsheet;
  return createEvidenceSourceResolverAdapter({
    resolverId: 'electrolux-group-official-factsheet',
    version: '1',
    scope: 'exact_model_au_factsheet_endpoint',
    required: true,
    async resolve(caseRecord) {
      const target = exactTarget(caseRecord);
      try {
        const result = await finder(target, options.finderOptions ?? {});
        return {
          completion: 'complete',
          candidates: result?.sourceUrl ? [typedCandidate({
            sourceUrl: result.sourceUrl,
            brand: target.brand,
            discoveryMethod: 'electrolux_group_factsheet_endpoint',
            documentType: 'specification_sheet',
            sourceModelHint: result.verifiedAlias || target.model,
          })] : [],
          failures: [],
        };
      } catch (error) {
        return completionFromError(error);
      }
    },
  });
}

function brandKey(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function buildArchitectureV2ResolverAdapters(caseRecord, options = {}) {
  const brand = brandKey(caseRecord?.brand);
  if (brand === 'fisherpaykel') return [createFisherPaykelResolverAdapter(options.fisherPaykel)];
  if (brand === 'lg') return [createLgResolverAdapter(options.lg)];
  if (['electrolux', 'westinghouse', 'kelvinator'].includes(brand)) {
    return [createElectroluxGroupResolverAdapter(options.electroluxGroup)];
  }
  return [];
}
