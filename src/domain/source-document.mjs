const STATES = new Set(['discovered', 'fetched', 'hashed', 'text_extracted', 'identity_matched', 'fields_parsed', 'reviewed', 'approved', 'rejected', 'quarantined']);
const NEXT = {
  discovered: new Set(['fetched', 'rejected', 'quarantined']),
  fetched: new Set(['hashed', 'rejected', 'quarantined']),
  hashed: new Set(['text_extracted', 'rejected', 'quarantined']),
  text_extracted: new Set(['identity_matched', 'rejected', 'quarantined']),
  identity_matched: new Set(['fields_parsed', 'rejected', 'quarantined']),
  fields_parsed: new Set(['reviewed', 'rejected', 'quarantined']),
  reviewed: new Set(['approved', 'rejected', 'quarantined']),
  approved: new Set([]), rejected: new Set([]), quarantined: new Set([]),
};

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value); for (const child of Object.values(value)) freezeDeep(child);
  } return value;
}
function required(value, label) { const text = String(value ?? '').trim(); if (!text) throw new TypeError(`${label} required`); return text; }

export function createSourceDocument(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('source document must be an object');
  const state = required(input.state, 'state');
  if (!STATES.has(state)) throw new TypeError(`unsupported document state ${state}`);
  const document = {
    id: required(input.id, 'document id'), sourceUrl: required(input.sourceUrl, 'source URL'),
    finalUrl: input.finalUrl ?? null, authorType: required(input.authorType, 'author type'),
    transportHostType: required(input.transportHostType, 'transport host type'), contentType: input.contentType ?? null,
    retrievedAt: input.retrievedAt ?? null, sha256: input.sha256 ?? null, pageCount: input.pageCount ?? null,
    parserVersion: input.parserVersion ?? null, identityOutcome: input.identityOutcome ?? null,
    productLinks: (input.productLinks ?? []).map((link) => ({
      legacyRuntimeId: required(link.legacyRuntimeId, 'legacy product link'),
      canonicalProductId: link.canonicalProductId === null ? null : required(link.canonicalProductId, 'canonical product link'),
    })),
    fields: (input.fields ?? []).map((field) => ({ ...field })), state,
    history: (input.history ?? []).map((entry) => ({ ...entry })),
    rejectionReason: input.rejectionReason ?? null,
  };
  if (document.productLinks.length === 0) throw new TypeError('source document requires at least one product link');
  if (state === 'approved') validateApproval(document);
  if ((state === 'rejected' || state === 'quarantined') && !document.rejectionReason) {
    throw new TypeError(`${state} document requires rejection reason`);
  }
  return freezeDeep(document);
}

function validateApproval(document) {
  if (!['exact', 'approved_alias'].includes(document.identityOutcome)) throw new TypeError('approved document requires matched identity');
  if (!document.parserVersion || !Number.isInteger(document.pageCount) || document.pageCount < 1) throw new TypeError('approved document requires parser and page count');
  if (!document.fields.length || document.fields.some((field) => !field.field || !Number.isInteger(field.page) || field.page < 1 || !String(field.quote ?? '').trim())) {
    throw new TypeError('approved document requires page-level field evidence');
  }
}

export function transitionSourceDocument(document, nextState, patch) {
  const current = createSourceDocument(document);
  if (!NEXT[current.state]?.has(nextState)) throw new TypeError(`invalid document transition ${current.state} -> ${nextState}`);
  const next = { ...current, ...patch, state: nextState, history: [...current.history, { from: current.state, to: nextState }] };
  if (nextState === 'hashed' && !/^[a-f0-9]{64}$/.test(String(next.sha256 ?? ''))) throw new TypeError('hashed document requires sha256');
  if (nextState === 'rejected' || nextState === 'quarantined') next.rejectionReason = required(patch?.reason, 'rejection reason');
  if (nextState === 'approved') validateApproval(next);
  return createSourceDocument(next);
}
