import { createHash } from 'node:crypto';

import { createObservation } from './retailer-observation.mjs';
import {
  normalizeRetailerSourcePolicy,
  retailerObservationAuthorizedBySourcePolicy,
  validateRetailerObservationLedger,
} from './retailer-observation-ledger.mjs';

const SHA256 = /^[a-f0-9]{64}$/;

function required(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${label} required`);
  return result;
}

function sha256(value, label) {
  const result = String(value ?? '').trim().toLowerCase();
  if (!SHA256.test(result)) throw new TypeError(`${label} must be a SHA-256`);
  return result;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function canonicalSha256(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

function retailerUrl(value) {
  const url = new URL(required(value, 'retailer URL'));
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new TypeError('retailer URL must use trusted HTTPS');
  }
  url.hash = '';
  return url.toString();
}

function linkKey(canonicalProductId, url) {
  return `${canonicalProductId}\0${retailerUrl(url)}`;
}

export function createBaselineRetailerLinkId({
  canonicalProductId,
  retailer,
  url,
  originSource,
}) {
  const seed = [
    required(canonicalProductId, 'baseline canonical product ID'),
    required(retailer, 'baseline retailer'),
    retailerUrl(url),
    required(originSource, 'baseline origin source'),
  ].join('\0');
  return `retail_link_${createHash('sha256').update(seed).digest('hex').slice(0, 24)}`;
}

function typedState(observation) {
  if (observation.listingState === 'redirected') return 'TYPED_REDIRECTED';
  if (observation.availability === 'available'
    && ['current', 'relisted'].includes(observation.listingState)) return 'TYPED_AVAILABLE';
  if (observation.availability === 'unavailable'
    || observation.listingState === 'unavailable') return 'TYPED_UNAVAILABLE';
  return 'TYPED_UNKNOWN';
}

function observationStateKey(observation) {
  return [observation.availability, observation.listingState, observation.url,
    observation.redirectUrl ?? ''].join('\0');
}

function latestTypedByLink(ledger, normalizedPolicy) {
  const grouped = new Map();
  const excluded = new Map();
  for (const value of ledger.observations) {
    const observation = createObservation(value);
    if (observation.sourceType === 'legacy_catalog') continue;
    const key = linkKey(observation.canonicalProductId, observation.url);
    const target = retailerObservationAuthorizedBySourcePolicy(observation, normalizedPolicy)
      ? grouped
      : excluded;
    if (!target.has(key)) target.set(key, []);
    target.get(key).push(observation);
  }
  const result = new Map();
  const keys = [...new Set([...grouped.keys(), ...excluded.keys()])].sort();
  for (const key of keys) {
    const observations = grouped.get(key) ?? [];
    const excludedRows = (excluded.get(key) ?? [])
      .sort((left, right) => right.observedAt.localeCompare(left.observedAt)
        || left.id.localeCompare(right.id));
    const policyExcludedObservationIds = excludedRows.map((row) => row.id).sort();
    if (observations.length === 0) {
      result.set(key, {
        state: 'TYPED_POLICY_EXCLUDED',
        observationIds: policyExcludedObservationIds,
        observedAt: excludedRows[0].observedAt,
        policyExcludedObservationIds,
      });
      continue;
    }
    observations.sort((left, right) => right.observedAt.localeCompare(left.observedAt)
      || left.id.localeCompare(right.id));
    const newestAt = observations[0].observedAt;
    const newest = observations.filter((row) => row.observedAt === newestAt);
    if (new Set(newest.map(observationStateKey)).size > 1) {
      result.set(key, {
        state: 'TYPED_CONFLICT',
        observationIds: newest.map((row) => row.id).sort(),
        observedAt: newestAt,
        policyExcludedObservationIds,
      });
    } else {
      const observation = newest[0];
      result.set(key, {
        state: typedState(observation),
        observationIds: [observation.id],
        observedAt: observation.observedAt,
        adapterId: observation.adapterId,
        rawSourceSha256: observation.rawSourceSha256,
        redirectUrl: observation.redirectUrl,
        policyExcludedObservationIds,
      });
    }
  }
  return result;
}

function latestListingReconciliationByBaselineLink(ledger, normalizedPolicy) {
  const result = new Map();
  for (const attempt of ledger.collectionAttempts ?? []) {
    const source = normalizedPolicy.sources.find((candidate) => candidate.id === attempt.adapterId);
    if (!source || source.termsReviewState === 'collection_blocked'
      || attempt.policyVersion !== source.policyVersion) continue;
    const contexts = [attempt.failureContext, ...(attempt.listingReconciliations ?? [])]
      .filter((context) => ['identity_mismatch', 'source_absent'].includes(context?.kind));
    for (const context of contexts) {
      const sourceUrl = retailerUrl(context.sourceUrl);
      if (!source.allowedHosts.includes(new URL(sourceUrl).hostname.toLowerCase())) continue;
      const candidate = {
        state: context.kind === 'identity_mismatch'
          ? 'QUARANTINED_IDENTITY_MISMATCH'
          : 'SOURCE_ABSENT_IN_AUTHORIZED_FEED',
        attemptIds: [attempt.id],
        observedAt: attempt.observedAt,
        adapterId: attempt.adapterId,
        rawSourceSha256: context.rawPayloadSha256,
        canonicalProductId: context.canonicalProductId ?? attempt.canonicalProductIds[0],
        baselineLinkId: context.baselineLinkId,
        sourceUrl,
        reasonCode: context.reasonCode,
        ...(context.receivedModel ? { receivedModel: context.receivedModel } : {}),
        ...(context.receivedUrl ? { receivedUrl: context.receivedUrl } : {}),
        ...(context.retailerProductId !== undefined
          ? { retailerProductId: context.retailerProductId }
          : {}),
      };
      const prior = result.get(candidate.baselineLinkId);
      if (!prior || candidate.observedAt > prior.observedAt
        || (candidate.observedAt === prior.observedAt && attempt.id < prior.attemptIds[0])) {
        result.set(candidate.baselineLinkId, candidate);
      }
    }
  }
  return result;
}

function identityResolutionByBaselineLink(ledger) {
  const stateByAction = {
    ACCEPT_AFTER_CANONICAL_CORRECTION: 'IDENTITY_ACCEPTED_AFTER_CANONICAL_CORRECTION',
    REASSIGN_TO_EXISTING_CANONICAL: 'IDENTITY_REASSIGNED_TO_EXISTING_CANONICAL',
    INVALIDATE_WRONG_IDENTITY: 'IDENTITY_INVALIDATED_WRONG_MODEL',
  };
  return new Map((ledger.identityResolutionEvents ?? []).map((event) => [
    event.baselineLinkId,
    {
      kind: 'IDENTITY_RESOLUTION',
      state: stateByAction[event.action],
      eventId: event.id,
      action: event.action,
      observedAt: event.resolvedAt,
      sourceObservedAt: event.sourceObservedAt,
      rawSourceSha256: event.rawSourceSha256,
      canonicalProductId: event.sourceCanonicalProductId,
      destinationCanonicalProductId: event.destinationCanonicalProductId,
      observationId: event.observation?.id ?? null,
    },
  ]));
}

function baselineLinks(publicProjection, normalizedPolicy) {
  if (!publicProjection || !Array.isArray(publicProjection.products)) {
    throw new TypeError('public projection products required');
  }
  const links = [];
  for (const product of publicProjection.products) {
    const canonicalProductId = required(product.canonicalProductId, 'public product canonical ID');
    for (const retailer of product.retailers ?? []) {
      const url = retailerUrl(retailer.url ?? retailer.href ?? retailer.u ?? retailer.link);
      const sourcePolicy = normalizedPolicy.hosts.get(new URL(url).hostname.toLowerCase());
      if (!sourcePolicy) throw new TypeError(`unclassified retailer source host ${new URL(url).hostname}`);
      const originSource = required(retailer.source ?? 'legacy-catalog', 'retailer origin source');
      const retailerName = required(retailer.n ?? retailer.name, 'retailer name');
      links.push({
        baselineLinkId: createBaselineRetailerLinkId({
          canonicalProductId,
          retailer: retailerName,
          url,
          originSource,
        }),
        canonicalProductId,
        retailer: retailerName,
        url,
        originSource,
        sourcePolicy,
      });
    }
  }
  links.sort((left, right) => left.baselineLinkId.localeCompare(right.baselineLinkId));
  const ids = new Set();
  for (const link of links) {
    if (ids.has(link.baselineLinkId)) throw new TypeError(`duplicate baseline retailer link ${link.baselineLinkId}`);
    ids.add(link.baselineLinkId);
  }
  return links;
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) counts[item[key]] = (counts[item[key]] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function policyExecutionState(termsReviewState) {
  if (termsReviewState === 'authorized_partner_feed') return 'RUNNABLE_AUTHORIZED_SOURCE';
  if (termsReviewState === 'pending_automated_scale_review') return 'BOUNDED_CANARY_ONLY';
  if (termsReviewState === 'reviewed_bounded_exact_product_api') return 'RUNNABLE_POLICY_REVIEWED_SOURCE';
  if (termsReviewState === 'collection_blocked') return 'BLOCKED_BY_SOURCE_POLICY';
  throw new TypeError(`unsupported retailer policy execution state ${termsReviewState}`);
}

function countSelected(items, selector) {
  const counts = {};
  for (const item of items) {
    const value = selector(item);
    if (value != null) counts[value] = (counts[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

export function validateRetailerObservationCoverage(document) {
  if (!document || document.schemaVersion !== 1 || !Array.isArray(document.items)
    || !Array.isArray(document.sourceBindings)) {
    throw new TypeError('retailer observation coverage schema v1 required');
  }
  const { semanticSha256, ...withId } = document;
  if (semanticSha256 !== canonicalSha256(withId)) throw new Error('retailer observation coverage integrity mismatch');
  const { coverageId, ...withoutId } = withId;
  const expectedId = `retailer_observation_coverage_${canonicalSha256(withoutId).slice(0, 24)}`;
  if (coverageId !== expectedId) throw new Error('retailer observation coverage ID mismatch');
  const ids = document.items.map((item) => required(item.baselineLinkId, 'baseline retailer link ID'));
  if (new Set(ids).size !== ids.length) throw new TypeError('duplicate baseline retailer link ID');
  if (ids.some((id, index) => index > 0 && ids[index - 1].localeCompare(id) > 0)) {
    throw new TypeError('retailer observation coverage items must be sorted');
  }
  const states = new Set(['LEGACY_UNKNOWN', 'TYPED_AVAILABLE', 'TYPED_UNAVAILABLE',
    'TYPED_REDIRECTED', 'TYPED_UNKNOWN', 'TYPED_CONFLICT', 'TYPED_POLICY_EXCLUDED',
    'QUARANTINED_IDENTITY_MISMATCH', 'SOURCE_ABSENT_IN_AUTHORIZED_FEED',
    'IDENTITY_ACCEPTED_AFTER_CANONICAL_CORRECTION',
    'IDENTITY_REASSIGNED_TO_EXISTING_CANONICAL',
    'IDENTITY_INVALIDATED_WRONG_MODEL']);
  for (const item of document.items) {
    required(item.canonicalProductId, 'coverage canonical product ID');
    retailerUrl(item.url);
    if (!states.has(item.terminalObservationState)) throw new TypeError('unsupported terminal observation state');
    const resolved = ['TYPED_AVAILABLE', 'TYPED_UNAVAILABLE', 'QUARANTINED_IDENTITY_MISMATCH',
      'IDENTITY_ACCEPTED_AFTER_CANONICAL_CORRECTION',
      'IDENTITY_REASSIGNED_TO_EXISTING_CANONICAL',
      'IDENTITY_INVALIDATED_WRONG_MODEL']
      .includes(item.terminalObservationState);
    if (resolved !== (item.revalidation == null)) throw new TypeError('coverage revalidation state mismatch');
    if (item.terminalObservationState === 'LEGACY_UNKNOWN' && item.typedObservation != null) {
      throw new TypeError('legacy coverage item cannot carry typed observation');
    }
    if (item.terminalObservationState !== 'LEGACY_UNKNOWN' && item.typedObservation == null) {
      throw new TypeError('typed coverage item requires typed observation');
    }
  }
  const revalidationItems = document.items.filter((item) => item.revalidation != null);
  const expectedSummary = {
    baselineLinks: document.items.length,
    accountedLinks: document.items.length,
    typedLinks: document.items.filter((item) => item.typedObservation != null).length,
    revalidationItems: revalidationItems.length,
    byOriginSource: countBy(document.items, 'originSource'),
    byTerminalObservationState: countBy(document.items, 'terminalObservationState'),
    byRevalidationAction: countSelected(document.items, (item) => item.revalidation?.action),
    byPolicyExecutionState: countSelected(document.items, (item) => item.revalidation?.executionState),
  };
  if (JSON.stringify(document.summary) !== JSON.stringify(expectedSummary)) {
    throw new TypeError('retailer observation coverage summary mismatch');
  }
  const bindingKinds = document.sourceBindings.map((binding) => required(binding.kind, 'coverage source binding kind'));
  if (new Set(bindingKinds).size !== 3
    || !['PUBLIC_PROJECTION', 'RETAILER_OBSERVATION_LEDGER', 'RETAILER_SOURCE_POLICY']
      .every((kind) => bindingKinds.includes(kind))) {
    throw new TypeError('retailer observation coverage source bindings mismatch');
  }
  document.sourceBindings.forEach((binding) => sha256(binding.sha256, 'coverage source binding SHA-256'));
  return document;
}

export function buildRetailerObservationCoverage({
  publicProjection,
  publicProjectionSha256,
  ledger,
  ledgerSha256,
  sourcePolicy,
  sourcePolicySha256,
}) {
  const projectionSha = sha256(publicProjectionSha256, 'public projection SHA-256');
  const observationLedgerSha = sha256(ledgerSha256, 'retailer observation ledger SHA-256');
  const policySha = sha256(sourcePolicySha256, 'retailer source policy SHA-256');
  validateRetailerObservationLedger(ledger);
  const normalizedPolicy = normalizeRetailerSourcePolicy(sourcePolicy);
  const typedByLink = latestTypedByLink(ledger, normalizedPolicy);
  const reconciliationByLink = latestListingReconciliationByBaselineLink(ledger, normalizedPolicy);
  const identityResolutionByLink = identityResolutionByBaselineLink(ledger);
  const links = baselineLinks(publicProjection, normalizedPolicy);
  const items = links.map((link) => {
    const typedObservation = typedByLink.get(linkKey(link.canonicalProductId, link.url)) ?? null;
    const reconciliation = reconciliationByLink.get(link.baselineLinkId) ?? null;
    const identityResolution = identityResolutionByLink.get(link.baselineLinkId) ?? null;
    if (reconciliation && (reconciliation.canonicalProductId !== link.canonicalProductId
      || reconciliation.sourceUrl !== link.url)) {
      throw new Error(`listing reconciliation does not bind current baseline link ${link.baselineLinkId}`);
    }
    const typed = [typedObservation, reconciliation, identityResolution]
      .filter(Boolean)
      .sort((left, right) => (
        right.observedAt.localeCompare(left.observedAt)
        || (right.kind === 'IDENTITY_RESOLUTION' ? 1 : 0)
        - (left.kind === 'IDENTITY_RESOLUTION' ? 1 : 0)
      ))[0] ?? null;
    const resolved = typed && ['TYPED_AVAILABLE', 'TYPED_UNAVAILABLE'].includes(typed.state);
    const terminal = typed?.state === 'QUARANTINED_IDENTITY_MISMATCH'
      || typed?.kind === 'IDENTITY_RESOLUTION'
      || resolved;
    return {
      baselineLinkId: link.baselineLinkId,
      canonicalProductId: link.canonicalProductId,
      retailer: link.retailer,
      url: link.url,
      originSource: link.originSource,
      sourcePolicyId: link.sourcePolicy.id,
      terminalObservationState: typed?.state ?? 'LEGACY_UNKNOWN',
      typedObservation: typed,
      revalidation: terminal ? null : {
        action: typed?.state === 'SOURCE_ABSENT_IN_AUTHORIZED_FEED'
          ? 'COLLECT_ALTERNATE_AUTHORIZED_RETAIL_SOURCE'
          : typed ? 'REVALIDATE_TYPED_NON_TERMINAL' : link.sourcePolicy.legacyLinkAction,
        policyState: link.sourcePolicy.termsReviewState,
        executionState: typed?.state === 'SOURCE_ABSENT_IN_AUTHORIZED_FEED'
          ? 'BLOCKED_BY_SOURCE_POLICY'
          : policyExecutionState(link.sourcePolicy.termsReviewState),
        collectionMode: typed?.state === 'SOURCE_ABSENT_IN_AUTHORIZED_FEED'
          ? 'alternate_authorized_source_required'
          : link.sourcePolicy.collectionMode,
        sourcePolicyId: link.sourcePolicy.id,
      },
    };
  });
  const typedLinks = items.filter((item) => item.typedObservation != null).length;
  const document = {
    schemaVersion: 1,
    coveragePolicyVersion: 'retailer-observation-coverage-v1',
    sourcePolicyVersion: normalizedPolicy.policyVersion,
    sourceBindings: [
      { kind: 'PUBLIC_PROJECTION', sha256: projectionSha },
      { kind: 'RETAILER_OBSERVATION_LEDGER', sha256: observationLedgerSha },
      { kind: 'RETAILER_SOURCE_POLICY', sha256: policySha },
    ],
    items,
    summary: {
      baselineLinks: links.length,
      accountedLinks: items.length,
      typedLinks,
      revalidationItems: items.filter((item) => item.revalidation != null).length,
      byOriginSource: countBy(items, 'originSource'),
      byTerminalObservationState: countBy(items, 'terminalObservationState'),
      byRevalidationAction: countSelected(items, (item) => item.revalidation?.action),
      byPolicyExecutionState: countSelected(items, (item) => item.revalidation?.executionState),
    },
  };
  document.coverageId = `retailer_observation_coverage_${canonicalSha256(document).slice(0, 24)}`;
  document.semanticSha256 = canonicalSha256(document);
  return freezeDeep(validateRetailerObservationCoverage(document));
}
