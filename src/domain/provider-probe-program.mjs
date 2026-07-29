import { createHash } from 'node:crypto';

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const PROVIDER_STATES = new Set(['draft_ready', 'sent', 'sample_received', 'comparison_ready']);
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PRIVATE_KEY_PATTERN = /(^|_)(private|email|recipient|contact|body|message|attachment_path)($|_)/i;

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function dateOnly(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) throw new TypeError(`${label} must be YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new TypeError(`${label} must be a real date`);
  }
  return value;
}

function assertHash(value, label) {
  if (!HASH_PATTERN.test(value ?? '')) throw new TypeError(`${label} must be a SHA-256 hash`);
}

function assertGitSafe(value, path = '$') {
  if (typeof value === 'string') {
    if (EMAIL_PATTERN.test(value)) throw new TypeError(`email address is private at ${path}`);
    if (value.startsWith('/') || value.startsWith('file://')) throw new TypeError(`private path at ${path}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertGitSafe(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (PRIVATE_KEY_PATTERN.test(key)) throw new TypeError(`private provider probe field ${path}.${key}`);
    assertGitSafe(item, `${path}.${key}`);
  }
}

export function validatePrivateProviderProbeDraft(draft, expected) {
  if (draft?.schemaVersion !== 1) throw new TypeError('provider probe draft schemaVersion must be 1');
  if (!expected?.id || draft.providerId !== expected.id) throw new TypeError('provider identity mismatch');
  dateOnly(draft.createdOn, 'draft creation date');
  if (draft.publicRouteSourceUrl !== expected.publicRouteSourceUrl || !draft.publicRouteSourceUrl.startsWith('https://')) {
    throw new TypeError('provider route does not match the researched official route');
  }
  if (typeof draft.subject !== 'string' || draft.subject.trim().length < 20) throw new TypeError('draft subject is required');
  if (typeof draft.body !== 'string' || draft.body.trim().length < 200) throw new TypeError('draft body is required');
  if (draft.sample?.rowCount !== 100) throw new TypeError('frozen 100-model sample is required');
  assertHash(draft.sample.csvSha256, 'sample CSV');
  assertHash(draft.sample.manifestSha256, 'sample manifest');

  const required = [
    [/100 exact Australian/i, '100 exact Australian models'],
    [/no-obligation/i, 'no-obligation request'],
    [/\bGTIN\b/, 'GTIN'],
    [/product and package dimensions/i, 'separate product and package dimensions'],
    [/manual link/i, 'manual links'],
    [/cache/i, 'cache rights'],
    [/public display/i, 'public display rights'],
    [/attribution/i, 'attribution terms'],
    [/update/i, 'update process'],
    [/withdrawal/i, 'withdrawal process'],
    [/model-suffix/i, 'model suffix protection'],
    [/does not authorize a purchase, contract or data licence/i, 'commercial approval boundary'],
  ];
  for (const [pattern, label] of required) {
    if (!pattern.test(draft.body)) throw new TypeError(`draft must include ${label}`);
  }
  return true;
}

export function fingerprintPrivateProviderProbeDraft(draft) {
  if (typeof draft?.subject !== 'string' || typeof draft?.body !== 'string') {
    throw new TypeError('provider probe subject and body are required');
  }
  return Object.freeze({
    subjectSha256: sha256(draft.subject),
    bodySha256: sha256(draft.body),
    draftObjectSha256: sha256(JSON.stringify(canonicalize(draft))),
  });
}

export function assertGitSafeProviderProbeLedger(ledger) {
  if (ledger?.schemaVersion !== 1) throw new TypeError('provider probe ledger schemaVersion must be 1');
  if (ledger.classification !== 'git_safe_provider_probe_ledger') throw new TypeError('provider probe classification mismatch');
  dateOnly(ledger.reviewedOn, 'provider probe review date');
  assertHash(ledger.frozenQueueSha256, 'frozen queue');
  assertGitSafe(ledger);
  if (!Array.isArray(ledger.providers)) throw new TypeError('provider probes are required');

  const ids = new Set();
  for (const provider of ledger.providers) {
    if (!provider.id || ids.has(provider.id)) throw new TypeError(`duplicate or missing provider id: ${provider.id}`);
    ids.add(provider.id);
    if (!PROVIDER_STATES.has(provider.state)) throw new TypeError(`${provider.id} has an unsupported provider state`);
    if (!provider.channelId || !provider.provider) throw new TypeError(`${provider.id} needs channel and provider identity`);
    if (!provider.publicRouteSourceUrl?.startsWith('https://')) throw new TypeError(`${provider.id} needs an HTTPS route`);
    if (provider.sampleRows !== 100) throw new TypeError(`${provider.id} must bind the frozen 100-model sample`);
    assertHash(provider.sampleCsvSha256, `${provider.id} sample CSV`);
    assertHash(provider.sampleManifestSha256, `${provider.id} sample manifest`);
    if (provider.commercialCommitment !== 'none') throw new TypeError(`${provider.id} commercial commitment is not approved`);
    if (provider.state === 'draft_ready') {
      dateOnly(provider.draftedOn, `${provider.id} drafted date`);
      for (const field of ['subjectSha256', 'bodySha256', 'draftObjectSha256', 'draftFileSha256']) {
        assertHash(provider[field], `${provider.id} ${field}`);
      }
      if (!Number.isInteger(provider.draftFileByteSize) || provider.draftFileByteSize < 1) {
        throw new TypeError(`${provider.id} needs a draft byte size`);
      }
    }
    if (['sent', 'sample_received', 'comparison_ready'].includes(provider.state)) {
      dateOnly(provider.sentOn, `${provider.id} sent date`);
      assertHash(provider.messageObjectSha256, `${provider.id} message object`);
      if (!Number.isInteger(provider.messageObjectByteSize) || provider.messageObjectByteSize < 1) {
        throw new TypeError(`${provider.id} needs a message byte size`);
      }
    }
    if (['sample_received', 'comparison_ready'].includes(provider.state)) {
      dateOnly(provider.receivedOn, `${provider.id} received date`);
      assertHash(provider.sampleReceiptSha256, `${provider.id} sample receipt`);
    }
    if (provider.state === 'comparison_ready') {
      assertHash(provider.comparisonMetricsSha256, `${provider.id} comparison metrics`);
    }
  }
  return true;
}

export function assertProviderProbeDraftAuditMatchesLedger(auditEntries, ledger) {
  assertGitSafeProviderProbeLedger(ledger);
  if (!Array.isArray(auditEntries)) throw new TypeError('provider probe draft audit entries are required');
  const byId = new Map(auditEntries.map((entry) => [entry.id, entry]));
  const fields = ['subjectSha256', 'bodySha256', 'draftObjectSha256', 'draftFileSha256', 'draftFileByteSize'];
  for (const provider of ledger.providers.filter(({ state }) => state === 'draft_ready')) {
    const audit = byId.get(provider.id);
    if (!audit) throw new TypeError(`missing provider probe draft audit for ${provider.id}`);
    for (const field of fields) {
      if (audit[field] !== provider[field]) throw new TypeError(`${provider.id} draft fingerprint mismatch for ${field}`);
    }
    byId.delete(provider.id);
  }
  if (byId.size > 0) throw new TypeError(`provider probe draft has no ledger entry: ${[...byId.keys()].join(', ')}`);
  return true;
}

export function buildProviderProbeStatus({ ledger, asOf }) {
  assertGitSafeProviderProbeLedger(ledger);
  const states = ledger.providers.map(({ state }) => state);
  return Object.freeze({
    schemaVersion: 1,
    asOf: dateOnly(asOf, 'asOf'),
    classification: 'git_safe_provider_probe_status',
    frozenQueueSha256: ledger.frozenQueueSha256,
    independentOfBrandOutreach: true,
    comparisonReadyProviders: Object.freeze(ledger.providers
      .filter(({ state }) => state === 'comparison_ready')
      .map(({ id }) => id)
      .sort()),
    summary: Object.freeze({
      providers: states.length,
      draftReady: states.filter((state) => state === 'draft_ready').length,
      sent: states.filter((state) => state === 'sent').length,
      samplesReceived: states.filter((state) => ['sample_received', 'comparison_ready'].includes(state)).length,
      commercialCommitments: ledger.providers.filter(({ commercialCommitment }) => commercialCommitment !== 'none').length,
    }),
    publicationEligible: false,
    fitEligible: false,
  });
}
