import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  assertGitSafeProviderProbeLedger,
  assertProviderProbeDraftAuditMatchesLedger,
  buildProviderProbeStatus,
  fingerprintPrivateProviderProbeDraft,
  validatePrivateProviderProbeDraft,
} from '../../src/domain/provider-probe-program.mjs';

const HASH = 'a'.repeat(64);
const FROZEN_QUEUE_SHA256 = '148fad5da8dce61e44f420c35d97b0f27419ce831bbaee6301cbc842428ac20d';

function draft() {
  return {
    schemaVersion: 1,
    providerId: 'gs1-trusted-content',
    createdOn: '2026-07-29',
    publicRouteSourceUrl: 'https://www.gs1au.org/resources/faqs/trusted-data',
    subject: 'Australian appliance catalogue coverage sample request',
    body: `Hello,

FitAppliance is evaluating product-data coverage for a frozen sample of 100 exact Australian
refrigerator and dishwasher model codes. We would like a no-obligation sample or API trial
showing exact matched model and GTIN, Australian market status, product and package dimensions,
manual links, source authorization and update or withdrawal signals.

Please also confirm cache, public display and attribution rights. Silent model-suffix collapse or
mixed product/package measurements must remain distinguishable. This request is for evaluation
only and does not authorize a purchase, contract or data licence.

https://www.fitappliance.com.au
hello@fitappliance.com.au
ABN 46 168 974 169`,
    sample: {
      rowCount: 100,
      csvSha256: HASH,
      manifestSha256: HASH,
    },
  };
}

test('provider probe drafts require exact-AU scope, rights questions, and no commercial commitment', () => {
  const expected = {
    id: 'gs1-trusted-content',
    publicRouteSourceUrl: 'https://www.gs1au.org/resources/faqs/trusted-data',
  };

  assert.doesNotThrow(() => validatePrivateProviderProbeDraft(draft(), expected));
  assert.match(fingerprintPrivateProviderProbeDraft(draft()).draftObjectSha256, /^[a-f0-9]{64}$/);
  assert.throws(
    () => validatePrivateProviderProbeDraft({ ...draft(), body: draft().body.replace('no-obligation', 'paid') }, expected),
    /no-obligation/i,
  );
});

test('Git-safe provider probe ledger rejects private data and commercial approval', () => {
  const safe = {
    schemaVersion: 1,
    reviewedOn: '2026-07-29',
    classification: 'git_safe_provider_probe_ledger',
    frozenQueueSha256: FROZEN_QUEUE_SHA256,
    providers: [{
      id: 'gs1-trusted-content',
      channelId: 'gs1-npc',
      provider: 'GS1 Australia Trusted Content',
      state: 'draft_ready',
      draftedOn: '2026-07-29',
      publicRouteSourceUrl: 'https://www.gs1au.org/resources/faqs/trusted-data',
      sampleRows: 100,
      sampleCsvSha256: HASH,
      sampleManifestSha256: HASH,
      subjectSha256: HASH,
      bodySha256: HASH,
      draftObjectSha256: HASH,
      draftFileSha256: HASH,
      draftFileByteSize: 1000,
      commercialCommitment: 'none',
      nextAction: 'SEND_NO_OBLIGATION_SAMPLE_REQUEST',
    }],
  };

  assert.doesNotThrow(() => assertGitSafeProviderProbeLedger(safe));
  assert.throws(
    () => assertGitSafeProviderProbeLedger({
      ...safe,
      providers: [{ ...safe.providers[0], state: 'submittted' }],
    }),
    /unsupported.*state/i,
  );
  const sent = {
    ...safe,
    providers: [{
      ...safe.providers[0],
      state: 'sent',
      sentOn: '2026-07-29',
      messageObjectSha256: HASH,
      messageObjectByteSize: 512,
      nextAction: 'WAIT_FOR_SAMPLE_OR_RESPONSE',
    }],
  };
  assert.doesNotThrow(() => assertGitSafeProviderProbeLedger(sent));
  const replied = {
    ...sent,
    providers: [{
      ...sent.providers[0],
      responseReceivedOn: '2026-07-29',
      responseClass: 'sample_offer_no_obligation',
      responseCaptureState: 'gmail_dom_message_body',
      responseObjectSha256: HASH,
      responseObjectByteSize: 2034,
      nextAction: 'SEND_REVIEWED_SAMPLE',
    }],
  };
  assert.doesNotThrow(() => assertGitSafeProviderProbeLedger(replied));
  assert.throws(
    () => assertGitSafeProviderProbeLedger({
      ...replied,
      providers: [{ ...replied.providers[0], responseObjectSha256: null }],
    }),
    /response object/i,
  );
  const sampleShared = {
    ...replied,
    providers: [{
      ...replied.providers[0],
      sampleSharedOn: '2026-07-29',
      providerInputCsvSha256: HASH,
      providerInputSourceCsvSha256: HASH,
      providerInputCsvByteSize: 2563,
      providerInputRows: 100,
      providerInputKnownGtinRows: 0,
      sampleMessageObjectSha256: HASH,
      sampleMessageObjectByteSize: 1024,
      nextAction: 'WAIT_FOR_COVERAGE_STUDY',
    }],
  };
  assert.doesNotThrow(() => assertGitSafeProviderProbeLedger(sampleShared));
  assert.throws(
    () => assertGitSafeProviderProbeLedger({
      ...sampleShared,
      providers: [{ ...sampleShared.providers[0], providerInputKnownGtinRows: 101 }],
    }),
    /known GTIN rows/i,
  );
  assert.throws(
    () => assertGitSafeProviderProbeLedger({
      ...sent,
      providers: [{ ...sent.providers[0], messageObjectSha256: null }],
    }),
    /message object/i,
  );
  assert.throws(
    () => assertGitSafeProviderProbeLedger({ ...safe, recipientEmail: 'private@example.com' }),
    /private|email/i,
  );
  assert.throws(
    () => assertGitSafeProviderProbeLedger({
      ...safe,
      providers: [{ ...safe.providers[0], commercialCommitment: 'approved' }],
    }),
    /commercial commitment/i,
  );
  const audit = [{
    id: 'gs1-trusted-content',
    subjectSha256: HASH,
    bodySha256: HASH,
    draftObjectSha256: HASH,
    draftFileSha256: HASH,
    draftFileByteSize: 1000,
  }];
  assert.doesNotThrow(() => assertProviderProbeDraftAuditMatchesLedger(audit, safe));
  assert.throws(
    () => assertProviderProbeDraftAuditMatchesLedger([{ ...audit[0], draftFileByteSize: 999 }], safe),
    /fingerprint mismatch/i,
  );
});

test('committed provider probes remain independent of the brand-outreach denominator', async () => {
  const ledger = JSON.parse(await readFile(
    'data/architecture-v2/reviews/automated/product-data-provider-probe-ledger.json',
    'utf8',
  ));
  assert.doesNotThrow(() => assertGitSafeProviderProbeLedger(ledger));
  const icecat = ledger.providers.find(({ id }) => id === 'open-icecat');
  assert.equal(icecat.providerInputRows, 100);
  assert.equal(icecat.providerInputKnownGtinRows, 0);
  assert.equal(icecat.nextAction, 'WAIT_FOR_COVERAGE_STUDY');

  const status = buildProviderProbeStatus({ ledger, asOf: '2026-07-29' });
  assert.deepEqual(status.summary, {
    providers: 2,
    draftReady: 0,
    sent: 2,
    samplesReceived: 0,
    commercialCommitments: 0,
  });
  assert.equal(status.frozenQueueSha256, FROZEN_QUEUE_SHA256);
  assert.equal(status.independentOfBrandOutreach, true);
  assert.deepEqual(status.comparisonReadyProviders, []);
  assert.equal(status.publicationEligible, false);
  assert.equal(status.fitEligible, false);
});
