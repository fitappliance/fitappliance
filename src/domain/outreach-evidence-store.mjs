import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isAbsolute, join, resolve, sep } from 'node:path';

const MARKER = Object.freeze({
  schemaVersion: 1,
  rootEnv: 'FITAPPLIANCE_STORAGE_ROOT',
  classification: 'private_not_for_git_or_publication',
});

const PRIVATE_KEY_PATTERN = /(^|_)(private|email|recipient|contact|body|mime|message_text|attachment_path)($|_)/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function parseDateOnly(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) throw new TypeError(`${label} must be YYYY-MM-DD`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new TypeError(`${label} must be a real calendar date`);
  }
  return date;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function assertSafeValue(value, path = '$') {
  if (typeof value === 'string') {
    if (EMAIL_PATTERN.test(value)) throw new TypeError(`email address is private at ${path}`);
    if (value.startsWith('/') || value.startsWith('file://')) throw new TypeError(`absolute path is private at ${path}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeValue(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (PRIVATE_KEY_PATTERN.test(key)) throw new TypeError(`private outreach field ${path}.${key}`);
    assertSafeValue(item, `${path}.${key}`);
  }
}

export function resolvePrivateOutreachRoot(storageRoot) {
  if (!storageRoot) throw new TypeError('storage root is required');
  if (!isAbsolute(storageRoot)) throw new TypeError('storage root must be absolute');
  const normalizedRoot = resolve(storageRoot);
  const outreachRoot = resolve(normalizedRoot, 'outreach');
  if (!outreachRoot.startsWith(`${normalizedRoot}${sep}`)) throw new TypeError('outreach root escaped storage root');
  return outreachRoot;
}

export function calculateFollowUpSchedule(sentOn, offsets = { first: 5, final: 10 }) {
  const sentDate = parseDateOnly(sentOn, 'sent date');
  if (!Number.isInteger(offsets.first) || !Number.isInteger(offsets.final) || offsets.first < 1 || offsets.final <= offsets.first) {
    throw new TypeError('follow-up offsets must be increasing positive integers');
  }
  return {
    firstFollowUpDueOn: addDays(sentDate, offsets.first),
    finalFollowUpDueOn: addDays(sentDate, offsets.final),
  };
}

export function validatePrivateOutreachDraft(draft, expected) {
  if (draft?.schemaVersion !== 1) throw new TypeError('private outreach draft schemaVersion must be 1');
  if (!expected?.id || draft.organizationId !== expected.id) throw new TypeError('draft organization identity mismatch');
  parseDateOnly(draft.createdOn, 'draft creation date');
  if (draft.publicRouteSourceUrl !== expected.publicRouteSourceUrl || !draft.publicRouteSourceUrl.startsWith('https://')) {
    throw new TypeError('draft public route does not match the researched official route');
  }
  if (!Array.isArray(draft.attachments) || draft.attachments.length !== 0) {
    throw new TypeError('outreach drafts must not include attachments before review');
  }
  if (typeof draft.subject !== 'string' || draft.subject.trim().length < 20) throw new TypeError('draft subject is required');
  if (typeof draft.body !== 'string' || draft.body.trim().length < 200) throw new TypeError('draft body is required');

  for (const brand of expected.coveredBrands ?? []) {
    if (!draft.body.includes(brand)) throw new TypeError(`draft must name covered brand ${brand}`);
  }
  const requiredPatterns = [
    [/20-model/i, '20-model validation sample'],
    [/\bCSV\b/, 'CSV format'],
    [/\bExcel\b/, 'Excel format'],
    [/\bJSON\b/, 'JSON format'],
    [/\bXML\b/, 'XML format'],
    [/\bAPI\b/, 'API option'],
    [/dimension/i, 'dimensions'],
    [/installation/i, 'installation requirements'],
    [/document link/i, 'document links'],
    [/cache/i, 'cache rights'],
    [/display/i, 'display rights'],
    [/attribution/i, 'attribution terms'],
    [/update/i, 'update process'],
    [/withdrawal/i, 'withdrawal process'],
    [/provenance/i, 'field-level provenance'],
    [/conflict/i, 'conflict isolation'],
    [/https:\/\/www\.fitappliance\.com\.au/i, 'website'],
    [/hello@fitappliance\.com\.au/i, 'canonical email'],
    [/ABN 46 168 974 169/i, 'ABN'],
  ];
  for (const [pattern, label] of requiredPatterns) {
    if (!pattern.test(draft.body)) throw new TypeError(`draft must include ${label}`);
  }
  return true;
}

export function fingerprintPrivateOutreachDraft(draft) {
  if (typeof draft?.subject !== 'string' || typeof draft?.body !== 'string') {
    throw new TypeError('draft subject and body are required for fingerprinting');
  }
  return Object.freeze({
    subjectSha256: sha256(draft.subject),
    bodySha256: sha256(draft.body),
    draftObjectSha256: sha256(JSON.stringify(canonicalize(draft))),
  });
}

export function assertGitSafeOutreachLedger(ledger) {
  if (ledger?.schemaVersion !== 1) throw new TypeError('outreach ledger schemaVersion must be 1');
  assertSafeValue(ledger);
  const first = ledger.schedulePolicy?.firstFollowUpOffsetDays;
  const final = ledger.schedulePolicy?.finalFollowUpOffsetDays;
  if (!Array.isArray(ledger.threads)) throw new TypeError('outreach ledger threads are required');
  const ids = new Set();
  for (const thread of ledger.threads) {
    if (!thread.id || ids.has(thread.id)) throw new TypeError(`duplicate or missing outreach thread id: ${thread.id}`);
    ids.add(thread.id);
    if (!thread.organization || !Array.isArray(thread.coveredBrands) || thread.coveredBrands.length === 0) {
      throw new TypeError(`${thread.id} needs organization and covered brands`);
    }
    if (thread.publicRouteSourceUrl && !thread.publicRouteSourceUrl.startsWith('https://')) {
      throw new TypeError(`${thread.id} public route must be HTTPS`);
    }
    if (thread.state === 'sent') {
      const expected = calculateFollowUpSchedule(thread.sentOn, { first, final });
      if (thread.firstFollowUpDueOn !== expected.firstFollowUpDueOn || thread.finalFollowUpDueOn !== expected.finalFollowUpDueOn) {
        throw new TypeError(`${thread.id} follow-up schedule drift`);
      }
      if (!SHA256_PATTERN.test(thread.subjectSha256 ?? '')) throw new TypeError(`${thread.id} needs a subject hash`);
      if (!SHA256_PATTERN.test(thread.bodySha256 ?? '')) throw new TypeError(`${thread.id} needs a body hash`);
      for (const hash of thread.attachmentSha256 ?? []) {
        if (!SHA256_PATTERN.test(hash)) throw new TypeError(`${thread.id} has an invalid attachment hash`);
      }
      if (thread.externalCaptureState === 'captured_eml') {
        if (!SHA256_PATTERN.test(thread.messageObjectSha256 ?? '')) throw new TypeError(`${thread.id} needs a message object hash`);
        if (!Number.isInteger(thread.messageObjectByteSize) || thread.messageObjectByteSize < 1) {
          throw new TypeError(`${thread.id} needs a message object byte size`);
        }
      }
    }
    if (thread.state === 'draft_ready') {
      parseDateOnly(thread.draftedOn, `${thread.id} drafted date`);
      if (!SHA256_PATTERN.test(thread.subjectSha256 ?? '')) throw new TypeError(`${thread.id} needs a subject hash`);
      if (!SHA256_PATTERN.test(thread.bodySha256 ?? '')) throw new TypeError(`${thread.id} needs a body hash`);
      if (!SHA256_PATTERN.test(thread.draftObjectSha256 ?? '')) throw new TypeError(`${thread.id} needs a draft object hash`);
      if (!SHA256_PATTERN.test(thread.draftFileSha256 ?? '')) throw new TypeError(`${thread.id} needs a draft file hash`);
      if (!Number.isInteger(thread.draftFileByteSize) || thread.draftFileByteSize < 1) {
        throw new TypeError(`${thread.id} needs a draft file byte size`);
      }
    }
  }
  return true;
}

export function assertDraftAuditMatchesLedger(auditEntries, ledger) {
  assertGitSafeOutreachLedger(ledger);
  if (!Array.isArray(auditEntries)) throw new TypeError('private draft audit entries are required');
  const auditById = new Map(auditEntries.map((entry) => [entry.id, entry]));
  const fields = [
    'subjectSha256',
    'bodySha256',
    'draftObjectSha256',
    'draftFileSha256',
    'draftFileByteSize',
  ];
  for (const thread of ledger.threads.filter(({ state }) => state === 'draft_ready')) {
    const audit = auditById.get(thread.id);
    if (!audit) throw new TypeError(`missing private draft audit for ${thread.id}`);
    for (const field of fields) {
      if (audit[field] !== thread[field]) throw new TypeError(`${thread.id} draft fingerprint mismatch for ${field}`);
    }
    auditById.delete(thread.id);
  }
  if (auditById.size > 0) throw new TypeError(`private draft audit has no ledger thread: ${[...auditById.keys()].join(', ')}`);
  return true;
}

export async function initializePrivateOutreachStore(storageRoot) {
  const root = resolvePrivateOutreachRoot(storageRoot);
  const directories = ['messages', 'attachments/sha256', 'provider-samples/sha256', 'rights', 'drafts'];
  await Promise.all(directories.map((directory) => mkdir(join(root, directory), { recursive: true })));
  const markerPath = join(root, '.fitappliance-outreach-store.json');
  const serialized = `${JSON.stringify(MARKER, null, 2)}\n`;
  try {
    const existing = await readFile(markerPath, 'utf8');
    if (existing !== serialized) throw new TypeError('private outreach marker does not match the expected contract');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await writeFile(markerPath, serialized, { flag: 'wx' });
  }
  return Object.freeze({ root, markerPath, directories: Object.freeze([...directories]) });
}
