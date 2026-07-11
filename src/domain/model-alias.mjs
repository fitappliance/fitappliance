const STATUSES = new Set(['pending', 'approved', 'rejected', 'superseded']);
const ALLOWED_FIELDS = new Set([
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
]);

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function requireString(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${label} must be a non-empty string`);
  return text;
}

function normalizeIdentifier(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function normalizeBrand(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function requireFields(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const fields = value.map((field) => requireString(field, `${label} field`));
  if (new Set(fields).size !== fields.length) throw new TypeError(`${label} contains duplicate fields`);
  for (const field of fields) {
    if (!ALLOWED_FIELDS.has(field)) throw new TypeError(`${label} contains unsupported field ${field}`);
  }
  return fields;
}

function evidenceReasons(evidence) {
  const reasons = [];
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return ['evidence_record_required'];
  }
  try {
    new URL(evidence.source_url);
  } catch {
    reasons.push('valid_source_url_required');
  }
  if (!/^[a-f0-9]{64}$/.test(String(evidence.document_sha256 || ''))) reasons.push('document_hash_required');
  if (!Number.isInteger(evidence.page) || evidence.page < 1) reasons.push('positive_page_required');
  if (!String(evidence.quote || '').trim()) reasons.push('source_quote_required');
  if (evidence.document_author_type !== 'manufacturer') reasons.push('manufacturer_authorship_required');
  if (evidence.transport_host_type !== 'manufacturer') reasons.push('manufacturer_transport_required');
  return reasons;
}

export function evaluateAliasCandidate(record) {
  const reasons = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return freezeDeep({ approvable: false, reasons: ['alias_record_required'] });
  }
  if (record.status !== 'approved') reasons.push('status_not_approved');
  const evidence = Array.isArray(record.evidence) ? record.evidence : [];
  if (record.status === 'approved' && evidence.length === 0) reasons.push('manufacturer_evidence_required');
  for (const item of evidence) {
    for (const reason of evidenceReasons(item)) {
      if (!reasons.includes(reason)) reasons.push(reason);
    }
  }
  const decision = record.decision;
  if (record.status === 'approved') {
    if (!String(decision?.reviewer || '').trim()) reasons.push('reviewer_required');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(decision?.reviewed_at || ''))) reasons.push('review_date_required');
    if (!String(decision?.rationale || '').trim()) reasons.push('review_rationale_required');
  }
  return freezeDeep({ approvable: reasons.length === 0, reasons });
}

function normalizeEvidence(item) {
  const evidence = requireObject(item, 'alias evidence');
  return {
    source_url: requireString(evidence.source_url, 'alias evidence source_url'),
    document_sha256: requireString(evidence.document_sha256, 'alias evidence document_sha256'),
    page: evidence.page,
    quote: requireString(evidence.quote, 'alias evidence quote'),
    document_author_type: requireString(evidence.document_author_type, 'alias evidence document_author_type'),
    transport_host_type: requireString(evidence.transport_host_type, 'alias evidence transport_host_type'),
  };
}

function normalizeAlias(input) {
  const alias = requireObject(input, 'alias');
  const status = requireString(alias.status, 'alias status');
  if (!STATUSES.has(status)) throw new TypeError(`unsupported alias status ${status}`);
  const brand = requireString(alias.brand, 'alias brand');
  const targetModel = requireString(alias.target_model, 'alias target_model');
  const sourceModel = requireString(alias.source_model, 'alias source_model');
  if (normalizeIdentifier(targetModel) === normalizeIdentifier(sourceModel)) {
    throw new TypeError('alias target and source model must differ');
  }
  const candidateFields = requireFields(alias.candidate_fields ?? [], 'candidate_fields');
  const approvedFields = requireFields(alias.approved_fields ?? [], 'approved_fields');
  if (status !== 'approved' && approvedFields.length > 0) {
    throw new TypeError(`${status} alias cannot expose approved fields`);
  }
  if (status === 'approved' && approvedFields.length === 0) {
    throw new TypeError('approved alias requires approved fields');
  }
  for (const field of approvedFields) {
    if (!candidateFields.includes(field)) throw new TypeError(`approved field ${field} is not a candidate field`);
  }
  const decision = requireObject(alias.decision, 'alias decision');
  const normalized = {
    id: requireString(alias.id, 'alias id'),
    brand,
    target_model: targetModel,
    source_model: sourceModel,
    status,
    identity_scope: requireString(alias.identity_scope, 'alias identity_scope'),
    candidate_fields: candidateFields,
    approved_fields: approvedFields,
    evidence: Array.isArray(alias.evidence) ? alias.evidence.map(normalizeEvidence) : [],
    decision: {
      reviewer: decision.reviewer === null ? null : requireString(decision.reviewer, 'decision reviewer'),
      reviewed_at: decision.reviewed_at === null ? null : requireString(decision.reviewed_at, 'decision reviewed_at'),
      rationale: requireString(decision.rationale, 'decision rationale'),
    },
    supersedes: alias.supersedes === null ? null : requireString(alias.supersedes, 'alias supersedes'),
  };
  if (status === 'approved') {
    const evaluation = evaluateAliasCandidate(normalized);
    if (!evaluation.approvable) throw new TypeError(`approved alias evidence invalid: ${evaluation.reasons.join(', ')}`);
  }
  return normalized;
}

export function createAliasRegistry(document) {
  const input = requireObject(document, 'alias registry');
  if (input.schema_version !== 1) throw new TypeError('alias registry schema_version must be 1');
  const lastUpdated = requireString(input.last_updated, 'alias registry last_updated');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastUpdated)) throw new TypeError('alias registry last_updated must be YYYY-MM-DD');
  if (!Array.isArray(input.aliases)) throw new TypeError('alias registry aliases must be an array');
  const aliases = input.aliases.map(normalizeAlias);
  const ids = new Set();
  const activePairs = new Set();
  const approvedTargets = new Map();
  for (const alias of aliases) {
    if (ids.has(alias.id)) throw new TypeError(`duplicate alias id ${alias.id}`);
    ids.add(alias.id);
    if (alias.status === 'pending' || alias.status === 'approved') {
      const pair = `${normalizeBrand(alias.brand)}:${normalizeIdentifier(alias.target_model)}:${normalizeIdentifier(alias.source_model)}`;
      if (activePairs.has(pair)) throw new TypeError(`duplicate active alias pair ${pair}`);
      activePairs.add(pair);
    }
    if (alias.status === 'approved') {
      for (const field of alias.approved_fields) {
        const key = `${normalizeBrand(alias.brand)}:${normalizeIdentifier(alias.target_model)}:${field}`;
        const existing = approvedTargets.get(key);
        if (existing && existing !== normalizeIdentifier(alias.source_model)) {
          throw new TypeError(`contradictory approved alias for ${key}`);
        }
        approvedTargets.set(key, normalizeIdentifier(alias.source_model));
      }
    }
  }
  for (const alias of aliases) {
    if (alias.status === 'superseded' && (!alias.supersedes || !ids.has(alias.supersedes))) {
      throw new TypeError(`superseded alias ${alias.id} must reference an existing replacement`);
    }
  }
  return freezeDeep({ schema_version: 1, last_updated: lastUpdated, aliases });
}

export function findApprovedAlias(registry, { brand, targetModel, field }) {
  if (!registry || !Array.isArray(registry.aliases) || !ALLOWED_FIELDS.has(field)) return null;
  const brandKey = normalizeBrand(brand);
  const modelKey = normalizeIdentifier(targetModel);
  return registry.aliases.find((alias) => (
    alias.status === 'approved'
    && normalizeBrand(alias.brand) === brandKey
    && normalizeIdentifier(alias.target_model) === modelKey
    && alias.approved_fields.includes(field)
  )) || null;
}

export const APPROVABLE_ALIAS_FIELDS = freezeDeep([...ALLOWED_FIELDS]);
