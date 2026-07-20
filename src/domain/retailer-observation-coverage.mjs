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
      const seed = [canonicalProductId, retailerName, url, originSource].join('\0');
      links.push({
        baselineLinkId: `retail_link_${createHash('sha256').update(seed).digest('hex').slice(0, 24)}`,
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
    'TYPED_REDIRECTED', 'TYPED_UNKNOWN', 'TYPED_CONFLICT', 'TYPED_POLICY_EXCLUDED']);
  for (const item of document.items) {
    required(item.canonicalProductId, 'coverage canonical product ID');
    retailerUrl(item.url);
    if (!states.has(item.terminalObservationState)) throw new TypeError('unsupported terminal observation state');
    const resolved = ['TYPED_AVAILABLE', 'TYPED_UNAVAILABLE']
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
  const links = baselineLinks(publicProjection, normalizedPolicy);
  const items = links.map((link) => {
    const typed = typedByLink.get(linkKey(link.canonicalProductId, link.url)) ?? null;
    const resolved = typed && ['TYPED_AVAILABLE', 'TYPED_UNAVAILABLE'].includes(typed.state);
    return {
      baselineLinkId: link.baselineLinkId,
      canonicalProductId: link.canonicalProductId,
      retailer: link.retailer,
      url: link.url,
      originSource: link.originSource,
      sourcePolicyId: link.sourcePolicy.id,
      terminalObservationState: typed?.state ?? 'LEGACY_UNKNOWN',
      typedObservation: typed,
      revalidation: resolved ? null : {
        action: typed ? 'REVALIDATE_TYPED_NON_TERMINAL' : link.sourcePolicy.legacyLinkAction,
        policyState: link.sourcePolicy.termsReviewState,
        executionState: policyExecutionState(link.sourcePolicy.termsReviewState),
        collectionMode: link.sourcePolicy.collectionMode,
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
