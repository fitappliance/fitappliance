import { createRequire } from 'node:module';

import { createEvidenceSourceResolverAdapter } from '../../src/domain/evidence-source-adapter-contract.mjs';
import {
  isOfficialBrandArtifactUrl,
  isOfficialBrandMarketUrl,
} from '../../src/domain/evidence-source-verifier.mjs';

const require = createRequire(import.meta.url);
const manufacturerDocumentStrategies = require('../../data/architecture-v2/policies/manufacturer-document-strategies.json');
const { findFisherPaykelOfficialPdf } = require('./fisher-paykel-official.js');
const { findLgOfficialPdf } = require('./lg-official.js');
const { findElectroluxGroupFactsheet } = require('./electrolux-group-official.js');
const { findHaierOfficialPdf } = require('./haier-official.js');
const { findSamsungOfficialPdf } = require('./samsung-official.js');
const { findBekoOfficialPdf } = require('./beko-official.js');
const { findAskoOfficialPdf } = require('./asko-official.js');
const { findHisenseOfficialPdf } = require('./hisense-official.js');
const { findMieleOfficialPdf } = require('./miele-official.js');
const { findLiebherrOfficialPdf } = require('./liebherr-official.js');
const { findMideaOfficialPdf } = require('./midea-official.js');
const { findChiqOfficialPdf } = require('./chiq-official.js');
const { findArtusiOfficialPdf } = require('./artusi-official.js');
const { findEsattoOfficialPdf } = require('./esatto-official.js');
const { findEuromaidOfficialPdf } = require('./euromaid-official.js');
const { findInaltoOfficialPdf } = require('./inalto-official.js');
const { findKoganOfficialPdf } = require('./kogan-official.js');
const { findOmegaOfficialPdf } = require('./omega-official.js');
const { findRobinhoodOfficialPdf } = require('./robinhood-official.js');
const { findSubZeroOfficialPdf } = require('./sub-zero-official.js');
const { findTecoOfficialPdf } = require('./teco-official.js');
const { findVogueOfficialPdf } = require('./vogue-official.js');
const { findBoschOfficialPdf } = require('./bosch-official.js');

function exactTarget(caseRecord) {
  const brand = String(caseRecord?.brand ?? '').trim();
  const model = String(caseRecord?.model ?? caseRecord?.sku ?? '').trim();
  if (!brand || !model) throw new TypeError('resolver target requires exact brand and model');
  const category = String(caseRecord?.category ?? '').trim();
  return { brand, model, sku: model, ...(category ? { category } : {}) };
}

function authorityForUrl(sourceUrl, brand, model, category, discoveryProvenance) {
  const official = discoveryProvenance
    ? isOfficialBrandArtifactUrl(sourceUrl, brand, { model, category, discoveryProvenance })
    : isOfficialBrandMarketUrl(sourceUrl, brand);
  return official ? 'official' : 'reference';
}

function sourceRole(authorityMode, documentType) {
  if (documentType === 'product_page' && authorityMode === 'official') return 'manufacturer_product_page';
  if (documentType === 'structured_product_data' && authorityMode === 'official') return 'manufacturer_structured_data';
  return authorityMode === 'official' ? 'manufacturer_document' : 'retailer_reference';
}

function completeDimensionSignature(value) {
  const dimensions = value?.dimensionsMm ?? value;
  const values = [
    dimensions?.widthMm ?? dimensions?.width,
    dimensions?.heightMm ?? dimensions?.height,
    dimensions?.depthMm ?? dimensions?.depth,
  ].map(Number);
  return values.every((number) => Number.isFinite(number) && number > 0)
    ? values.join('x')
    : null;
}

function hasLowerAuthorityDimensionConflict(caseRecord) {
  const context = caseRecord?.reconciliationContext ?? {};
  const signatures = [
    ...(context.registryHints ?? []),
    ...(context.legacyHints ?? []),
  ].map(completeDimensionSignature).filter(Boolean);
  return new Set(signatures).size > 1;
}

function normalizeDocumentType(value) {
  const text = String(value ?? '').toLowerCase().replace(/[\s-]+/g, '_');
  if (/structured_product_data|product_api|pim_data/.test(text)) return 'structured_product_data';
  if (/(?:^|_)parts?(?:_|$)|(?:^|_)spare(?:_|$)/.test(text)) return 'parts_manual';
  if (/family/.test(text)) return 'family_manual';
  if (/quick_reference|quick_start|\bqrg\b|\bqsg\b/.test(text)) return 'quick_reference_guide';
  if (/design_guide/.test(text)) return 'design_guide';
  if (/install/.test(text)) return 'installation_guide';
  if (/fact|spec|data_sheet|technical|product_card/.test(text)) return 'specification_sheet';
  if (/owner|user|operat|instruction|manual/.test(text)) return 'user_manual';
  return 'family_manual';
}

function isFisherPaykelDimensionResource(resource) {
  const type = normalizeDocumentType(resource?.type ?? resource?.documentType ?? resource?.resourceType);
  return resource?.evidenceScope !== 'research_only_search_variant'
    && type !== 'parts_manual'
    && !excludedDocument(resource, resourceUrl(resource));
}

function typedCandidate({
  sourceUrl,
  brand,
  discoveryMethod,
  documentType,
  sourceModelHint,
  targetModel = sourceModelHint,
  category = null,
  discoveryProvenance = null,
  requiredAttempt = true,
}) {
  const authorityMode = authorityForUrl(
    sourceUrl,
    brand,
    targetModel,
    category,
    discoveryProvenance,
  );
  return {
    sourceUrl,
    discoveryMethod,
    documentType,
    sourceModelHint: sourceModelHint || null,
    authorityMode,
    sourceRole: sourceRole(authorityMode, documentType),
    requiredAttempt: authorityMode === 'official' ? requiredAttempt : false,
    discoveryProvenance,
  };
}

function resourceUrl(resource) {
  if (typeof resource === 'string') return resource.trim();
  return String(resource?.sourceUrl ?? resource?.url ?? resource?.href ?? resource?.downloadUrl ?? '').trim();
}

function resourceModelHint(resource, result, target) {
  return String(
    resource?.sourceModelHint ?? resource?.matchedSku ?? resource?.verifiedAlias
    ?? resource?.lookupSku ?? resource?.modelName ?? resource?.sku
    ?? result?.matchedSku ?? result?.verifiedAlias ?? result?.lookupSku
    ?? result?.modelName ?? result?.sourceModelHint ?? target.model,
  ).trim() || target.model;
}

function excludedDocument(resource, sourceUrl) {
  let filename = '';
  try { filename = new URL(sourceUrl).pathname.split('/').at(-1) ?? ''; } catch { /* URL validation follows. */ }
  const description = [
    resource?.resourceType, resource?.documentType, resource?.type,
    resource?.name, resource?.originalFileName, filename,
  ].filter(Boolean).join(' ');
  return /energy[\s_-]*label|water[\s_-]*rating|wels[\s_-]*label|warranty|catalog(?:ue)?/i.test(description);
}

function productPageResources(result) {
  const direct = [
    result?.productPageUrl,
    result?.productUrl,
    result?.supportUrl,
  ].filter(Boolean).map((sourceUrl) => ({ sourceUrl, documentType: 'product_page' }));
  const listed = (Array.isArray(result?.productUrls) ? result.productUrls : [])
    .filter(Boolean)
    .map((resource) => typeof resource === 'string'
      ? { sourceUrl: resource, documentType: 'product_page' }
      : { ...resource, documentType: 'product_page' });
  return [...direct, ...listed];
}

export function createLegacyFinderResolverAdapter({
  brandKey: resolverBrandKey,
  resolverId,
  version = '1',
  scope = `${resolverBrandKey}_legacy_discovery_only`,
  finder,
  finderOptions = {},
  maximumCandidates = 16,
}) {
  if (typeof finder !== 'function') throw new TypeError('legacy finder function required');
  if (!Number.isInteger(maximumCandidates) || maximumCandidates < 1) {
    throw new TypeError('legacy finder maximumCandidates must be a positive integer');
  }
  return createEvidenceSourceResolverAdapter({
    resolverId,
    version,
    scope,
    required: true,
    async resolve(caseRecord) {
      const target = exactTarget(caseRecord);
      if (/[*?]/.test(target.model)) return { completion: 'complete', candidates: [], failures: [] };
      try {
        const result = await finder(target, finderOptions);
        if (!result || typeof result !== 'object') {
          return { completion: 'complete', candidates: [], failures: [] };
        }
        const primary = result.sourceUrl ? [{
          ...result,
          sourceUrl: result.sourceUrl,
          resourceType: result.resourceType,
        }] : [];
        const resources = [
          ...primary,
          ...(Array.isArray(result.resources) ? result.resources : []),
          ...(Array.isArray(result.candidates) ? result.candidates : []),
          ...productPageResources(result),
        ];
        const invalidUrls = [];
        const candidates = [];
        for (const resource of resources) {
          const sourceUrl = resourceUrl(resource);
          if (!sourceUrl) continue;
          let parsed;
          try {
            parsed = new URL(sourceUrl);
          } catch {
            invalidUrls.push(sourceUrl);
            continue;
          }
          if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
            invalidUrls.push(sourceUrl);
            continue;
          }
          const requestedType = resource?.documentType === 'product_page'
            ? 'product_page'
            : normalizeDocumentType(
              resource?.resourceType ?? resource?.documentType ?? resource?.type
              ?? resource?.name ?? resource?.originalFileName ?? sourceUrl,
            );
          if (requestedType !== 'product_page' && excludedDocument(resource, sourceUrl)) continue;
          const sourceModelHint = resourceModelHint(resource, result, target);
          const discoveryProvenance = requestedType === 'product_page'
            ? resource?.discoveryProvenance ?? null
            : resource?.discoveryProvenance ?? result.discoveryProvenance ?? null;
          candidates.push(typedCandidate({
            sourceUrl: parsed.toString(),
            brand: target.brand,
            discoveryMethod: `${resolverBrandKey}_legacy_finder`,
            documentType: requestedType,
            sourceModelHint,
            targetModel: target.model,
            category: target.category,
            discoveryProvenance,
            requiredAttempt: resource?.requiredAttempt ?? requestedType !== 'product_page',
          }));
        }
        if (invalidUrls.length) {
          return {
            completion: 'failed',
            candidates: [],
            failures: invalidUrls.map(() => ({
              code: 'invalid_candidate_url',
              message: 'legacy finder returned an invalid or untrusted candidate URL',
            })),
          };
        }
        const unique = uniqueCandidates(candidates);
        const overflow = unique.length > maximumCandidates;
        return {
          completion: overflow ? 'truncated' : 'complete',
          candidates: unique.slice(0, maximumCandidates),
          failures: overflow ? [{
            code: 'candidate_limit',
            message: `legacy finder exceeded ${maximumCandidates} candidates`,
          }] : [],
        };
      } catch (error) {
        return completionFromError(error);
      }
    },
  });
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
  if (/not found|returned HTTP 404|HTTP 410|(?:returned\s+)?error:\s*404|HTTP\/\d(?:\.\d)?\s+404/i.test(message)) {
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
    version: '6',
    scope: 'exact_model_product_page_and_support_documents',
    required: true,
    async resolve(caseRecord) {
      const target = exactTarget(caseRecord);
      if (/[*?]/.test(target.model)) {
        return { completion: 'complete', candidates: [], failures: [] };
      }
      try {
        const result = await finder(target, options.finderOptions ?? {});
        const listedResources = result.resources ?? [];
        const matchingPrimary = listedResources.find((resource) => resource?.url === result.sourceUrl);
        const resources = [
          matchingPrimary ?? (result.sourceUrl ? {
            url: result.sourceUrl,
            type: result.resourceType,
            discoveryProvenance: result.discoveryProvenance,
          } : null),
          ...listedResources,
        ].filter((resource) => resource?.url && isFisherPaykelDimensionResource(resource));
        const candidates = resources.map((resource) => {
          const modelHint = resourceModelHint(resource, result, target);
          return typedCandidate({
            sourceUrl: resource.url,
            brand: target.brand,
            discoveryMethod: 'fisher_paykel_product_page_resource',
            documentType: normalizeDocumentType(resource.type),
            sourceModelHint: modelHint,
            targetModel: target.model,
            discoveryProvenance: resource.discoveryProvenance ?? null,
          });
        });
        if (result.productPageUrl) {
          candidates.push(typedCandidate({
            sourceUrl: result.productPageUrl,
            brand: target.brand,
            discoveryMethod: 'fisher_paykel_product_page',
            documentType: 'product_page',
            sourceModelHint: target.model,
            requiredAttempt: hasLowerAuthorityDimensionConflict(caseRecord),
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
    version: '2',
    scope: 'exact_model_au_support_api_documents_and_bounded_product_pages',
    required: true,
    async resolve(caseRecord) {
      const target = exactTarget(caseRecord);
      if (/[*?]/.test(target.model)) {
        return { completion: 'complete', candidates: [], failures: [] };
      }
      const categoryPaths = {
        dryer: ['washer-dryers/dryers'],
        washing_machine: [
          'washer-dryers/front-load-washing-machines',
          'washer-dryers/top-load-washing-machines',
        ],
        dishwasher: ['dishwashers', 'dishwashers/free-standing', 'dishwashers/built-in'],
        fridge: [
          'fridges',
          'fridge-freezers',
          'fridge-freezers/french-door',
          'fridge-freezers/bottom-mount',
          'fridge-freezers/top-mount',
          'fridge-freezers/side-by-side',
        ],
      }[String(caseRecord?.category ?? '').trim().toLowerCase()] ?? [];
      const productPageCandidates = categoryPaths.map((path) => typedCandidate({
        sourceUrl: `https://www.lg.com/au/${path}/${encodeURIComponent(target.model.toLowerCase())}/`,
        brand: target.brand,
        discoveryMethod: 'lg_au_exact_model_product_page_template',
        documentType: 'product_page',
        sourceModelHint: target.model,
        requiredAttempt: true,
      }));
      try {
        const result = await finder(target, options.finderOptions ?? {});
        return {
          completion: 'complete',
          candidates: uniqueCandidates([
            ...(result?.sourceUrl ? [typedCandidate({
              sourceUrl: result.sourceUrl,
              brand: target.brand,
              discoveryMethod: 'lg_au_support_api',
              documentType: normalizeDocumentType(result.resourceType || result.originalFileName),
              sourceModelHint: result.lookupSku || result.modelName || target.model,
              discoveryProvenance: result.discoveryUrl ? {
                schemaVersion: 1,
                method: 'official_market_api',
                market: 'AU',
                discoveryUrl: result.discoveryUrl,
                requestedModel: target.model,
                matchedModel: result.modelName || result.lookupSku,
                artifactUrl: result.sourceUrl,
                ...(result.docId ? { documentId: result.docId } : {}),
                ...(result.originalFileName ? { originalFileName: result.originalFileName } : {}),
              } : null,
            })] : []),
            ...productPageCandidates,
          ]),
          failures: [],
        };
      } catch (error) {
        return { ...completionFromError(error), candidates: productPageCandidates };
      }
    },
  });
}

export function createElectroluxGroupResolverAdapter(options = {}) {
  const finder = options.finder ?? findElectroluxGroupFactsheet;
  return createEvidenceSourceResolverAdapter({
    resolverId: 'electrolux-group-official-factsheet',
    version: '2',
    scope: 'exact_model_au_factsheet_endpoint',
    required: true,
    async resolve(caseRecord) {
      const target = exactTarget(caseRecord);
      if (/[*?]/.test(target.model)) {
        return { completion: 'complete', candidates: [], failures: [] };
      }
      const normalizedCategory = String(caseRecord?.category ?? '').trim().toLowerCase();
      const compactHinge = /^WBE4504(?:BB|SB)[LR]$/i.test(target.model)
        ? { base: target.model.slice(0, -1), side: target.model.slice(-1).toUpperCase() }
        : null;
      const productPageModels = compactHinge
        ? [`${compactHinge.base}-${compactHinge.side}`, target.model]
        : [target.model, `${target.model}-L`, `${target.model}-R`];
      const productPageCandidates = brandKey(target.brand) === 'westinghouse' && normalizedCategory === 'fridge'
        ? productPageModels.map((pageModel) => typedCandidate({
          sourceUrl: `https://www.westinghouse.com.au/fridges-and-freezers/fridges/${encodeURIComponent(pageModel.toLowerCase())}/`,
          brand: target.brand,
          discoveryMethod: 'westinghouse_au_exact_model_product_page_template',
          documentType: 'product_page',
          sourceModelHint: pageModel,
          requiredAttempt: Boolean(compactHinge) || hasLowerAuthorityDimensionConflict(caseRecord),
        }))
        : [];
      if (compactHinge && productPageCandidates.length) {
        return { completion: 'complete', candidates: uniqueCandidates(productPageCandidates), failures: [] };
      }
      try {
        const result = await finder(target, options.finderOptions ?? {});
        return {
          completion: 'complete',
          candidates: uniqueCandidates([
            ...(result?.sourceUrl ? [typedCandidate({
              sourceUrl: result.sourceUrl,
              brand: target.brand,
              discoveryMethod: 'electrolux_group_factsheet_endpoint',
              documentType: 'specification_sheet',
              sourceModelHint: result.verifiedAlias || target.model,
            })] : []),
            ...productPageCandidates,
          ]),
          failures: [],
        };
      } catch (error) {
        return { ...completionFromError(error), candidates: productPageCandidates };
      }
    },
  });
}

export function createBoschResolverAdapter(options = {}) {
  const finder = options.finder ?? findBoschOfficialPdf;
  return createEvidenceSourceResolverAdapter({
    resolverId: 'bosch-official-product-documents',
    version: '1',
    scope: 'exact_model_au_product_page_technical_document_manifest',
    required: true,
    async resolve(caseRecord) {
      const target = exactTarget(caseRecord);
      if (/[*?]/.test(target.model)) {
        return { completion: 'complete', candidates: [], failures: [] };
      }
      try {
        const result = await finder(target, options.finderOptions ?? {});
        const candidates = (result?.resources ?? []).map((resource) => typedCandidate({
          sourceUrl: resource.url,
          brand: target.brand,
          discoveryMethod: 'bosch_au_product_page_manifest',
          documentType: normalizeDocumentType(resource.resourceType ?? resource.titleKey),
          sourceModelHint: target.model,
          targetModel: target.model,
          discoveryProvenance: resource.discoveryProvenance ?? null,
          requiredAttempt: resource.requiredAttempt !== false,
        }));
        if (result?.productPageUrl) {
          candidates.push(typedCandidate({
            sourceUrl: result.productPageUrl,
            brand: target.brand,
            discoveryMethod: 'bosch_au_exact_model_product_page',
            documentType: 'product_page',
            sourceModelHint: target.model,
            targetModel: target.model,
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

function brandKey(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function hasDeterministicModelTemplate(value) {
  const templates = manufacturerDocumentStrategies.brands?.[brandKey(value)]?.templates ?? [];
  return templates.some((template) => String(template?.url ?? '').includes('{model}'));
}

const LEGACY_RESOLVER_PROFILES = new Map([
  ['asko', { optionKey: 'asko', brandKey: 'asko', resolverId: 'asko-official-manuals-api', finder: findAskoOfficialPdf }],
  ['haier', {
    optionKey: 'haier',
    brandKey: 'haier',
    resolverId: 'haier-official-discovery',
    version: '4',
    scope: 'haier_au_target_ready_support_articles_resolved_pdf_and_current_product_pages',
    finder: findHaierOfficialPdf,
  }],
  ['samsung', { optionKey: 'samsung', brandKey: 'samsung', resolverId: 'samsung-official-discovery', finder: findSamsungOfficialPdf }],
  ['beko', { optionKey: 'beko', brandKey: 'beko', resolverId: 'beko-official-discovery', finder: findBekoOfficialPdf }],
  ['hisense', { optionKey: 'hisense', brandKey: 'hisense', resolverId: 'hisense-official-discovery', finder: findHisenseOfficialPdf }],
  ['miele', { optionKey: 'miele', brandKey: 'miele', resolverId: 'miele-official-discovery', finder: findMieleOfficialPdf }],
  ['liebherr', { optionKey: 'liebherr', brandKey: 'liebherr', resolverId: 'liebherr-official-discovery', finder: findLiebherrOfficialPdf }],
  ['midea', { optionKey: 'midea', brandKey: 'midea', resolverId: 'midea-official-discovery', finder: findMideaOfficialPdf }],
  ['chiq', { optionKey: 'chiq', brandKey: 'chiq', resolverId: 'chiq-official-discovery', finder: findChiqOfficialPdf }],
  ['artusi', { optionKey: 'artusi', brandKey: 'artusi', resolverId: 'artusi-official-discovery', finder: findArtusiOfficialPdf }],
  ['esatto', { optionKey: 'esatto', brandKey: 'esatto', resolverId: 'esatto-official-discovery', finder: findEsattoOfficialPdf }],
  ['euromaid', { optionKey: 'euromaid', brandKey: 'euromaid', resolverId: 'euromaid-official-discovery', finder: findEuromaidOfficialPdf }],
  ['inalto', { optionKey: 'inalto', brandKey: 'inalto', resolverId: 'inalto-official-discovery', finder: findInaltoOfficialPdf }],
  ['kogan', { optionKey: 'kogan', brandKey: 'kogan', resolverId: 'kogan-official-discovery', finder: findKoganOfficialPdf }],
  ['omega', { optionKey: 'omega', brandKey: 'omega', resolverId: 'omega-official-discovery', finder: findOmegaOfficialPdf }],
  ['robinhood', { optionKey: 'robinhood', brandKey: 'robinhood', resolverId: 'robinhood-official-discovery', finder: findRobinhoodOfficialPdf }],
  ['subzero', { optionKey: 'subZero', brandKey: 'sub-zero', resolverId: 'sub-zero-official-discovery', finder: findSubZeroOfficialPdf }],
  ['teco', { optionKey: 'teco', brandKey: 'teco', resolverId: 'teco-official-discovery', finder: findTecoOfficialPdf }],
  ['vogue', { optionKey: 'vogue', brandKey: 'vogue', resolverId: 'vogue-official-discovery', finder: findVogueOfficialPdf }],
]);

export function resolverAdapterIdsForBrand(value) {
  const brand = brandKey(value);
  if (brand === 'bosch') return ['bosch-official-product-documents'];
  if (brand === 'fisherpaykel') return ['fisher-paykel-official-support'];
  if (brand === 'lg') return ['lg-official-support'];
  if (['electrolux', 'westinghouse', 'kelvinator'].includes(brand)) {
    return ['electrolux-group-official-factsheet'];
  }
  const profile = LEGACY_RESOLVER_PROFILES.get(brand);
  if (profile) return [profile.resolverId];
  return hasDeterministicModelTemplate(brand)
    ? ['architecture-v2-core-official-discovery']
    : [];
}

export function buildArchitectureV2ResolverAdapters(caseRecord, options = {}) {
  const brand = brandKey(caseRecord?.brand);
  if (brand === 'bosch') return [createBoschResolverAdapter(options.bosch)];
  if (brand === 'fisherpaykel') return [createFisherPaykelResolverAdapter(options.fisherPaykel)];
  if (brand === 'lg') return [createLgResolverAdapter(options.lg)];
  if (['electrolux', 'westinghouse', 'kelvinator'].includes(brand)) {
    return [createElectroluxGroupResolverAdapter(options.electroluxGroup)];
  }
  const profile = LEGACY_RESOLVER_PROFILES.get(brand);
  if (profile) {
    const overrides = options[profile.optionKey] ?? {};
    return [createLegacyFinderResolverAdapter({
      ...profile,
      ...overrides,
      finder: overrides.finder ?? profile.finder,
    })];
  }
  return [];
}
