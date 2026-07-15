import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectEvidenceCandidates,
  expandOptionalOfficialEvidenceCandidates,
} from '../../src/domain/evidence-candidate-inventory.mjs';

const TARGET = Object.freeze({
  id: 'target-westinghouse-whe6874ba',
  brand: 'Westinghouse',
  model: 'WHE6874BA',
  category: 'fridge',
});

function source(hash, url) {
  return {
    authority: 'manufacturer',
    sourceType: 'official_exact_model_pdf',
    sourceUrl: url,
    finalUrl: url,
    contentSha256: hash,
    supersedesContentSha256: [],
    identity: { brand: TARGET.brand, model: TARGET.model, outcome: 'exact' },
    claims: [{ field: 'closedEnvelope.widthMm', value: { kind: 'fixed', mm: 913 } }],
    verificationReceipt: { bindingSha256: hash },
  };
}

function resolver({
  id = 'official-index',
  completion = 'complete',
  candidates = [],
  wait = null,
} = {}) {
  const resolve = async () => {
    if (wait) await wait;
    return {
      resolverId: id,
      version: '2026-07-13.1',
      scope: 'manufacturer_official',
      required: true,
      completion,
      candidates,
    };
  };
  resolve.resolverId = id;
  resolve.version = '2026-07-13.1';
  resolve.scope = 'manufacturer_official';
  resolve.required = true;
  return resolve;
}

function candidate(sourceUrl, overrides = {}) {
  return {
    sourceUrl,
    authorityMode: 'official',
    sourceRole: 'manufacturer_document',
    discoveryMethod: 'official_index',
    requiredAttempt: true,
    batchJobId: null,
    ...overrides,
  };
}

test('collector attempts every required official candidate after the first acceptance', async () => {
  const calls = [];
  const firstUrl = 'https://www.westinghouse.com.au/manuals/first.pdf';
  const secondUrl = 'https://www.westinghouse.com.au/manuals/second.pdf';
  const inventory = await collectEvidenceCandidates(TARGET, {
    batchCandidateJobIds: [],
    activeReceiptSources: [],
    resolvers: [resolver({ candidates: [candidate(firstUrl), candidate(secondUrl)] })],
    acquireAndAttest: async (entry) => {
      calls.push(entry.sourceUrl);
      return { source: source(entry.sourceUrl === firstUrl ? 'a'.repeat(64) : 'b'.repeat(64), entry.sourceUrl) };
    },
  });

  assert.deepEqual(calls.sort(), [firstUrl, secondUrl].sort());
  assert.equal(inventory.completionStatus, 'complete');
  assert.equal(inventory.candidates.length, 2);
  assert.ok(inventory.candidates.every((entry) => entry.outcome.status === 'accepted'));
  assert.match(inventory.candidateInventorySha256, /^[a-f0-9]{64}$/);
});

test('required resolver timeout fails closed as discovery_incomplete', async () => {
  const inventory = await collectEvidenceCandidates(TARGET, {
    batchCandidateJobIds: [],
    activeReceiptSources: [],
    resolverTimeoutMs: 5,
    resolvers: [resolver({ id: 'hung-resolver', wait: new Promise(() => {}) })],
    acquireAndAttest: async () => assert.fail('a timed-out resolver has no candidate to acquire'),
  });

  assert.equal(inventory.completionStatus, 'discovery_incomplete');
  assert.deepEqual(inventory.incompleteResolvers, ['hung-resolver']);
  assert.equal(inventory.resolvers[0].completion, 'timed_out');
});

test('resolver timeout starts after the bounded scheduler grants a slot', async () => {
  let scheduled = false;
  const inventory = await collectEvidenceCandidates(TARGET, {
    batchCandidateJobIds: [],
    activeReceiptSources: [],
    resolverTimeoutMs: 5,
    scheduleResolver: async (task) => {
      scheduled = true;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return task();
    },
    resolvers: [resolver()],
    acquireAndAttest: async () => assert.fail('empty resolver has no candidate to acquire'),
  });

  assert.equal(scheduled, true);
  assert.equal(inventory.completionStatus, 'complete');
  assert.equal(inventory.resolvers[0].completion, 'complete');
});

test('resolver result metadata cannot override its declared safety contract', async () => {
  const drifted = resolver();
  drifted.required = false;
  const inventory = await collectEvidenceCandidates(TARGET, {
    batchCandidateJobIds: [],
    activeReceiptSources: [],
    resolvers: [drifted],
    acquireAndAttest: async () => assert.fail('metadata drift has no candidate to acquire'),
  });

  assert.equal(inventory.completionStatus, 'complete');
  assert.equal(inventory.resolvers[0].completion, 'failed');
  assert.equal(inventory.resolvers[0].required, false);
  assert.match(inventory.resolvers[0].failure, /required flag/i);
});

test('duplicate official URLs merge provenance and are acquired exactly once', async () => {
  const url = 'https://www.westinghouse.com.au/manuals/WHE6874BA.pdf';
  let acquisitions = 0;
  const inventory = await collectEvidenceCandidates(TARGET, {
    batchCandidateJobIds: ['job-primary', 'job-alternate'],
    activeReceiptSources: [],
    resolvers: [
      resolver({
        id: 'batch-edges',
        candidates: [candidate(url, { batchJobId: 'job-primary', discoveryMethod: 'queue' })],
      }),
      resolver({
        id: 'brand-resolver',
        candidates: [candidate(url, { batchJobId: 'job-alternate', discoveryMethod: 'product_page' })],
      }),
    ],
    acquireAndAttest: async () => {
      acquisitions += 1;
      return { source: source('c'.repeat(64), url) };
    },
  });

  assert.equal(acquisitions, 1);
  assert.equal(inventory.candidates.length, 1);
  assert.deepEqual(inventory.candidates[0].batchJobIds, ['job-alternate', 'job-primary']);
  assert.deepEqual(
    inventory.candidates[0].resolverRefs.map((entry) => entry.resolverId),
    ['batch-edges', 'brand-resolver'].sort(),
  );
});

test('duplicate URL retains one exact market discovery provenance and binds it into inventory hash', async () => {
  const url = 'https://gscs-b2c.lge.com/open/downloadFile?fileId=fixture';
  const discoveryProvenance = {
    schemaVersion: 1,
    method: 'official_market_api',
    market: 'AU',
    discoveryUrl: 'https://www.lg.com/ncms/asia/api/v1/support/proxy/retrieveManualSoftwareList?locale=AU',
    requestedModel: 'WD1275A1',
    matchedModel: 'WD1275A1',
    artifactUrl: url,
    documentId: '20152207223286',
  };
  let received;
  const target = { id: 'target-lg', brand: 'LG', model: 'WD1275A1', category: 'washing_machine' };
  const inventory = await collectEvidenceCandidates(target, {
    batchCandidateJobIds: ['legacy-job'],
    activeReceiptSources: [],
    resolvers: [
      resolver({ id: 'batch', candidates: [candidate(url, { batchJobId: 'legacy-job' })] }),
      resolver({ id: 'lg-api', candidates: [candidate(url, { discoveryProvenance })] }),
    ],
    acquireAndAttest: async (entry) => {
      received = entry;
      return { source: source('e'.repeat(64), url) };
    },
  });

  assert.deepEqual(received.discoveryProvenance, discoveryProvenance);
  assert.deepEqual(inventory.candidates[0].discoveryProvenance, discoveryProvenance);
  const changed = await collectEvidenceCandidates(target, {
    batchCandidateJobIds: [],
    activeReceiptSources: [],
    resolvers: [resolver({ id: 'tampered', candidates: [candidate(url, {
      discoveryProvenance: { ...discoveryProvenance, matchedModel: 'WD1275A2' },
    })] })],
    acquireAndAttest: async () => ({ source: source('e'.repeat(64), url) }),
  });
  assert.notEqual(inventory.candidateInventorySha256, changed.candidateInventorySha256);
});

test('truncated resolver and an unrepresented batch edge both prevent a complete inventory', async () => {
  const url = 'https://www.westinghouse.com.au/manuals/WHE6874BA.pdf';
  const inventory = await collectEvidenceCandidates(TARGET, {
    batchCandidateJobIds: ['job-present', 'job-missing'],
    activeReceiptSources: [],
    resolvers: [resolver({
      completion: 'truncated',
      candidates: [candidate(url, { batchJobId: 'job-present' })],
    })],
    acquireAndAttest: async () => ({ source: source('d'.repeat(64), url) }),
  });

  assert.equal(inventory.completionStatus, 'discovery_incomplete');
  assert.deepEqual(inventory.missingBatchCandidateJobIds, ['job-missing']);
  assert.deepEqual(inventory.incompleteResolvers, ['official-index']);
});

test('inventory hash and ordering are deterministic under reversed resolver input', async () => {
  const aUrl = 'https://www.westinghouse.com.au/manuals/a.pdf';
  const bUrl = 'https://www.westinghouse.com.au/manuals/b.pdf';
  const make = (resolvers) => collectEvidenceCandidates(TARGET, {
    batchCandidateJobIds: [],
    activeReceiptSources: [],
    resolvers,
    acquireAndAttest: async (entry) => ({
      source: source(entry.sourceUrl === aUrl ? 'a'.repeat(64) : 'b'.repeat(64), entry.sourceUrl),
    }),
  });
  const leftResolver = resolver({ id: 'left', candidates: [candidate(bUrl)] });
  const rightResolver = resolver({ id: 'right', candidates: [candidate(aUrl)] });
  const first = await make([leftResolver, rightResolver]);
  const second = await make([rightResolver, leftResolver]);

  assert.equal(first.candidateInventorySha256, second.candidateInventorySha256);
  assert.deepEqual(first, second);
});

test('failed attestation retains the immutable artifact binding for retry adjudication', async () => {
  const url = 'https://www.westinghouse.com.au/manuals/wrong-family.pdf';
  const artifactBinding = {
    sourceUrl: url,
    finalUrl: url,
    contentSha256: 'f'.repeat(64),
    objectPath: `evidence/web/sha256/ff/ff/${'f'.repeat(64)}.pdf`,
    contentType: 'application/pdf',
    byteSize: 1234,
  };
  const inventory = await collectEvidenceCandidates(TARGET, {
    batchCandidateJobIds: ['job-family'],
    activeReceiptSources: [],
    resolvers: [resolver({ candidates: [candidate(url, { batchJobId: 'job-family' })] })],
    acquireAndAttest: async () => {
      throw Object.assign(new Error('structured exact-model identity signal required'), {
        code: 'identity',
        artifactBinding,
      });
    },
  });

  assert.equal(inventory.candidates[0].outcome.status, 'identity_rejected');
  assert.deepEqual(inventory.candidates[0].outcome.artifactBinding, artifactBinding);
});

test('prior terminal source is suppressed while a newly discovered official source remains executable', async () => {
  const oldUrl = 'https://www.westinghouse.com.au/manuals/family.pdf';
  const newUrl = 'https://www.westinghouse.com.au/manuals/exact-model.pdf';
  const calls = [];
  const inventory = await collectEvidenceCandidates(TARGET, {
    batchCandidateJobIds: [],
    activeReceiptSources: [],
    priorAttemptSuppressions: [{
      attemptId: 'attempt-old',
      sourceUrl: oldUrl,
      contentSha256: 'e'.repeat(64),
      status: 'identity_rejected',
      failureCode: 'identity',
      policySha256: 'p'.repeat(64),
    }],
    resolvers: [resolver({ candidates: [candidate(oldUrl), candidate(newUrl)] })],
    acquireAndAttest: async (entry) => {
      calls.push(entry.sourceUrl);
      return { source: source('d'.repeat(64), entry.sourceUrl) };
    },
  });

  assert.deepEqual(calls, [newUrl]);
  assert.equal(
    inventory.candidates.find((entry) => entry.sourceUrl === oldUrl).outcome.status,
    'previous_terminal_suppressed',
  );
  assert.equal(
    inventory.candidates.find((entry) => entry.sourceUrl === newUrl).outcome.status,
    'accepted',
  );
});

test('optional product-page failure also retains its immutable artifact binding', async () => {
  const url = 'https://www.samsung.com/au/support/model/WW12BB944DGBSA/';
  const inventory = await collectEvidenceCandidates(TARGET, {
    batchCandidateJobIds: [],
    activeReceiptSources: [],
    resolvers: [resolver({ candidates: [candidate(url, {
      sourceRole: 'manufacturer_product_page', requiredAttempt: false,
    })] })],
    acquireAndAttest: async () => assert.fail('optional source is not acquired in the initial pass'),
  });
  const artifact = {
    sourceUrl: url,
    finalUrl: url,
    contentSha256: '9'.repeat(64),
    objectPath: `evidence/web/sha256/99/99/${'9'.repeat(64)}.html`,
    contentType: 'text/html',
    byteSize: 2048,
  };
  const expanded = await expandOptionalOfficialEvidenceCandidates(inventory, {
    acquireAndAttest: async () => {
      throw Object.assign(new Error('exact page has no supported dimension claims'), {
        code: 'claim_semantics', artifactBinding: artifact,
      });
    },
  });

  assert.equal(expanded.candidates[0].outcome.status, 'claims_incomplete');
  assert.deepEqual(expanded.candidates[0].outcome.artifactBinding, artifact);
});
