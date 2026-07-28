import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  assertGitSafeOutreachLedger,
  assertDraftAuditMatchesLedger,
  calculateFollowUpSchedule,
  fingerprintPrivateOutreachDraft,
  initializePrivateOutreachStore,
  resolvePrivateOutreachRoot,
  validatePrivateOutreachDraft,
} from '../../src/domain/outreach-evidence-store.mjs';

const HASH = 'a'.repeat(64);

function safeLedger(overrides = {}) {
  return {
    schemaVersion: 1,
    schedulePolicy: {
      firstFollowUpOffsetDays: 5,
      finalFollowUpOffsetDays: 10,
      terminalState: 'NO_RESPONSE_TERMINAL',
    },
    threads: [{
      id: 'fisher-paykel-australia',
      organization: 'Fisher & Paykel Australia',
      coveredBrands: ['Fisher & Paykel', 'Haier'],
      state: 'sent',
      sentOn: '2026-07-27',
      firstFollowUpDueOn: '2026-08-01',
      finalFollowUpDueOn: '2026-08-06',
      subjectSha256: HASH,
      bodySha256: HASH,
      attachmentSha256: [],
      publicRouteSourceUrl: 'https://www.fisherpaykel.com/au/trade-resources',
      responseClass: null,
      nextAction: 'WAIT_FOR_RESPONSE_OR_FIRST_FOLLOW_UP',
      terminalReason: null,
    }],
    ...overrides,
  };
}

test('private outreach root is absolute, portable, and contained by the configured storage root', () => {
  assert.equal(resolvePrivateOutreachRoot('/tmp/FitAppliance'), '/tmp/FitAppliance/outreach');
  assert.throws(() => resolvePrivateOutreachRoot('relative/root'), /absolute/i);
  assert.throws(() => resolvePrivateOutreachRoot(''), /required/i);
});

test('follow-up schedule is deterministic from the sent date', () => {
  assert.deepEqual(calculateFollowUpSchedule('2026-07-27', { first: 5, final: 10 }), {
    firstFollowUpDueOn: '2026-08-01',
    finalFollowUpDueOn: '2026-08-06',
  });
  assert.throws(() => calculateFollowUpSchedule('not-a-date', { first: 5, final: 10 }), /sent date/i);
});

test('Git-safe outreach ledger permits hashes and public organization metadata only', () => {
  assert.doesNotThrow(() => assertGitSafeOutreachLedger(safeLedger()));

  for (const forbidden of [
    { recipientEmail: 'person@example.com' },
    { contactName: 'Private Person' },
    { body: 'full private message' },
    { mime: 'From: person@example.com' },
    { attachmentPath: '/private/sample.xlsx' },
  ]) {
    assert.throws(
      () => assertGitSafeOutreachLedger(safeLedger({ private: forbidden })),
      /private outreach field|email address|absolute path/i,
    );
  }
});

test('committed outreach ledger contains no private message or contact data', async () => {
  const ledger = JSON.parse(await readFile(
    'data/architecture-v2/reviews/automated/brand-data-outreach-ledger.json',
    'utf8',
  ));
  assert.doesNotThrow(() => assertGitSafeOutreachLedger(ledger));
});

test('Git-safe outreach ledger rejects schedule drift and unbound sent messages', () => {
  assert.throws(() => assertGitSafeOutreachLedger(safeLedger({
    threads: [{ ...safeLedger().threads[0], firstFollowUpDueOn: '2026-08-03' }],
  })), /follow-up schedule/i);
  assert.throws(() => assertGitSafeOutreachLedger(safeLedger({
    threads: [{ ...safeLedger().threads[0], bodySha256: null }],
  })), /body hash/i);
  assert.throws(() => assertGitSafeOutreachLedger(safeLedger({
    threads: [{ ...safeLedger().threads[0], externalCaptureState: 'captured_eml' }],
  })), /message object hash/i);
});

test('private organization drafts retain required scope, rights, provenance, and identity details', () => {
  const draft = {
    schemaVersion: 1,
    organizationId: 'residentia-group',
    createdOn: '2026-07-27',
    publicRouteSourceUrl: 'https://residentia.group/contact-us',
    attachments: [],
    subject: 'Australian appliance product data request for Residentia Group brands',
    body: `Hello,

I publish FitAppliance. We cover Sôlt, Esatto, InAlto and MyKin models in Australia.
Could we begin with a 20-model validation sample in CSV, Excel, JSON, XML or through an API?
We need model identity, dimensions, installation requirements, document links and revision data.
Please confirm whether we may cache and display factual fields with attribution, how updates and
withdrawals are communicated, and any required usage terms. We preserve field-level provenance and
isolate conflicting records rather than merging them.

https://www.fitappliance.com.au
hello@fitappliance.com.au
ABN 46 168 974 169`,
  };
  const expected = {
    id: 'residentia-group',
    coveredBrands: ['Sôlt', 'Esatto', 'InAlto', 'MyKin'],
    publicRouteSourceUrl: 'https://residentia.group/contact-us',
  };

  assert.doesNotThrow(() => validatePrivateOutreachDraft(draft, expected));
  assert.deepEqual(fingerprintPrivateOutreachDraft(draft), {
    subjectSha256: 'c372f5250aee42eb5e76370c835355d5d93db630bf9025a774558d1afacc0b4c',
    bodySha256: '901867780accc5b2d0866ac04545639a4822bae712b082cc725d99c0aa808d33',
    draftObjectSha256: '7d30cf1f2e08446060fc1ad01f75d63c011d21f64078a12d4c7d2aec24a85696',
  });

  assert.throws(
    () => validatePrivateOutreachDraft({ ...draft, body: draft.body.replace('withdrawals', 'changes') }, expected),
    /withdrawal/i,
  );
});

test('Git-safe ledger requires hashes for private drafts without exposing their content', () => {
  const draftThread = {
    id: 'residentia-group',
    organization: 'Residentia Group',
    coveredBrands: ['Sôlt', 'Esatto', 'InAlto', 'MyKin'],
    state: 'draft_ready',
    draftedOn: '2026-07-27',
    subjectSha256: HASH,
    bodySha256: HASH,
    draftObjectSha256: HASH,
    draftFileSha256: HASH,
    draftFileByteSize: 1024,
    publicRouteSourceUrl: 'https://residentia.group/contact-us',
    nextAction: 'REVIEW_BEFORE_SEND',
  };
  assert.doesNotThrow(() => assertGitSafeOutreachLedger(safeLedger({ threads: [draftThread] })));
  assert.throws(
    () => assertGitSafeOutreachLedger(safeLedger({ threads: [{ ...draftThread, bodySha256: null }] })),
    /body hash/i,
  );
});

test('private draft audit must match every draft-ready Git ledger fingerprint', () => {
  const thread = {
    id: 'residentia-group',
    organization: 'Residentia Group',
    coveredBrands: ['Sôlt'],
    state: 'draft_ready',
    draftedOn: '2026-07-27',
    subjectSha256: HASH,
    bodySha256: HASH,
    draftObjectSha256: HASH,
    draftFileSha256: HASH,
    draftFileByteSize: 1024,
    publicRouteSourceUrl: 'https://residentia.group/contact-us',
    nextAction: 'REVIEW_BEFORE_SEND',
  };
  const audit = [{
    id: thread.id,
    subjectSha256: HASH,
    bodySha256: HASH,
    draftObjectSha256: HASH,
    draftFileSha256: HASH,
    draftFileByteSize: 1024,
  }];
  const ledger = safeLedger({ threads: [thread] });
  assert.doesNotThrow(() => assertDraftAuditMatchesLedger(audit, ledger));
  assert.throws(
    () => assertDraftAuditMatchesLedger([{ ...audit[0], draftFileByteSize: 1025 }], ledger),
    /fingerprint mismatch/i,
  );
});

test('private outreach initializer creates only the approved external layout and marker', async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'fitappliance-outreach-'));
  const result = await initializePrivateOutreachStore(storageRoot);

  assert.equal(result.root, join(storageRoot, 'outreach'));
  for (const directory of [
    'messages',
    'attachments/sha256',
    'provider-samples/sha256',
    'provider-samples/receipts',
    'rights',
    'drafts',
  ]) {
    assert.equal((await stat(join(result.root, directory))).isDirectory(), true);
  }
  const marker = JSON.parse(await readFile(join(result.root, '.fitappliance-outreach-store.json'), 'utf8'));
  assert.deepEqual(marker, {
    schemaVersion: 1,
    rootEnv: 'FITAPPLIANCE_STORAGE_ROOT',
    classification: 'private_not_for_git_or_publication',
  });
});
