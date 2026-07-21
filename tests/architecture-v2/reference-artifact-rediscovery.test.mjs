import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  buildReferenceArtifactFingerprint,
  createReferenceArtifactTransport,
  validateReferenceArtifactPolicy,
} from '../../src/domain/reference-artifact-transport.mjs';
import { rediscoverOfficialArtifacts } from '../../src/domain/official-artifact-rediscovery.mjs';

const MIRROR = 'https://commercial.appliancesonline.com.au/public/manuals/Fisher---Paykel-E450LXFD1-451L-Upright-Fridge-Specifications-Sheet.pdf';
const OFFICIAL = 'https://mf-support.mfe.fisherpaykel.com/au/support/articles/450L-Vertical-refrigerator---User-Care-Guide-22309-ka0Jw000000NxXFIA0/';
const NON_AU_OFFICIAL = 'https://www.fisherpaykel.com/nz/support/articles/450L-Vertical-refrigerator---User-Care-Guide-22309-ka0Jw000000NxXFIA0/';

function policy(overrides = {}) {
  return {
    schemaVersion: 1,
    version: '2026-07-13.1',
    maximumBytes: 2_000_000,
    maximumRedirects: 2,
    sources: [{
      id: 'appliances-online-commercial-reference',
      retailer: 'Appliances Online Commercial',
      allowedHosts: ['commercial.appliancesonline.com.au'],
      minimumIntervalMs: 1_000,
      robots: {
        url: 'https://commercial.appliancesonline.com.au/robots.txt',
        reviewedAt: '2026-07-13',
        status: 'inaccessible_403',
      },
      terms: {
        url: 'https://www.appliancesonline.com.au/article/trading-terms/',
        reviewedAt: '2026-07-13',
        status: 'sale_terms_only',
      },
      scaleAllowed: false,
      manualCanaryUrls: [MIRROR],
      ...overrides,
    }],
  };
}

function response(bytes, contentType = 'application/pdf', status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': contentType, ...headers }),
    arrayBuffer: async () => Buffer.from(bytes),
  };
}

function mineruJson() {
  return Buffer.from(JSON.stringify([[
    {
      type: 'page_header',
      content: { page_header_content: [{ type: 'text', content: 'Fisher & Paykel E450LXFD1 Specifications Sheet' }] },
      bbox: [50, 30, 850, 90],
    },
    {
      type: 'text',
      content: { paragraph_content: [{ type: 'text', content: 'Model E450LXFD1. Visit https://www.fisherpaykel.com for current support.' }] },
      bbox: [50, 120, 850, 200],
    },
    {
      type: 'table',
      content: { html: '<table><tr><td>Dimensions</td><td>635 x 1695 x 695 mm</td></tr></table>' },
      bbox: [50, 250, 850, 500],
    },
  ]]));
}

function referenceFingerprint(overrides = {}) {
  return {
    schemaVersion: 1,
    authorityMode: 'reference',
    sourceUrl: MIRROR,
    finalUrl: MIRROR,
    contentSha256: 'a'.repeat(64),
    derivedContentSha256: 'b'.repeat(64),
    documentTitle: 'Fisher & Paykel E450LXFD1 Specifications Sheet',
    filename: 'Fisher-Paykel-E450LXFD1-Specifications-Sheet.pdf',
    modelTokens: ['E450LXFD1'],
    targetModelObserved: true,
    linkedOfficialDomains: ['www.fisherpaykel.com'],
    pageCount: 1,
    pdfMetadata: { status: 'unavailable_in_content_list_v2', title: null, author: null, subject: null },
    publishable: false,
    receiptEligible: false,
    identityUse: 'discovery_only',
    ...overrides,
  };
}

test('reference policy permits only reviewed single-URL canaries while robots access is unresolved', () => {
  const reviewed = validateReferenceArtifactPolicy(policy());
  assert.equal(reviewed.sources[0].scaleAllowed, false);
  assert.throws(
    () => createReferenceArtifactTransport(reviewed, { mode: 'scale' }),
    /scale.*not allowed/i,
  );
  assert.throws(
    () => createReferenceArtifactTransport(reviewed, { mode: 'manual_canary', sourceUrl: 'https://commercial.appliancesonline.com.au/public/manuals/other.pdf' }),
    /reviewed canary/i,
  );
});

test('reference policy rejects unknown fields instead of silently accepting policy drift', () => {
  assert.throws(() => validateReferenceArtifactPolicy({
    ...policy(),
    unexpectedOverride: true,
  }), /unknown.*unexpectedOverride/i);
  assert.throws(() => validateReferenceArtifactPolicy(policy({
    unreviewedEscapeHatch: true,
  })), /unknown.*unreviewedEscapeHatch/i);
});

test('reference transport enforces host, redirects, size, magic bytes and non-authoritative stamps', async () => {
  const calls = [];
  const transport = createReferenceArtifactTransport(policy(), {
    mode: 'manual_canary',
    sourceUrl: MIRROR,
    now: () => '2026-07-13T18:30:00.000Z',
    fetchImpl: async (url) => {
      calls.push(url);
      return response('%PDF-1.7\nreference bytes');
    },
  });
  const artifact = await transport.fetch(MIRROR);
  assert.equal(calls.length, 1);
  assert.equal(artifact.authorityMode, 'reference');
  assert.equal(artifact.publishable, false);
  assert.equal(artifact.receiptEligible, false);
  assert.match(artifact.contentSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(artifact.redirectChain, []);

  const escaped = createReferenceArtifactTransport(policy(), {
    mode: 'manual_canary', sourceUrl: MIRROR,
    fetchImpl: async () => response('', 'text/plain', 302, { location: 'https://evil.example/manual.pdf' }),
  });
  await assert.rejects(() => escaped.fetch(MIRROR), /redirect.*allowed host/i);

  const html = createReferenceArtifactTransport(policy(), {
    mode: 'manual_canary', sourceUrl: MIRROR,
    fetchImpl: async () => response('<html>blocked</html>', 'application/pdf'),
  });
  await assert.rejects(() => html.fetch(MIRROR), /magic bytes/i);
});

test('reference fingerprint is MinerU JSON first and cannot expose dimension claims', () => {
  const pdfBytes = Buffer.from('%PDF-1.7\nreference bytes');
  const jsonBytes = mineruJson();
  const pdfSha = createHash('sha256').update(pdfBytes).digest('hex');
  const jsonSha = createHash('sha256').update(jsonBytes).digest('hex');
  const fingerprint = buildReferenceArtifactFingerprint({
    authorityMode: 'reference',
    sourceUrl: MIRROR,
    finalUrl: MIRROR,
    contentType: 'application/pdf',
    contentSha256: pdfSha,
    byteSize: pdfBytes.length,
    derivedArtifact: {
      schemaVersion: 1,
      format: 'content_list_v2',
      sourcePdfSha256: pdfSha,
      contentSha256: jsonSha,
      byteSize: jsonBytes.length,
      pageCount: 1,
    },
    derivedArtifactBytes: jsonBytes,
  }, { brand: 'Fisher & Paykel', model: 'E450LXFD', category: 'fridge' });

  assert.equal(fingerprint.authorityMode, 'reference');
  assert.equal(fingerprint.targetModelObserved, true);
  assert.ok(fingerprint.modelTokens.includes('E450LXFD1'));
  assert.deepEqual(fingerprint.linkedOfficialDomains, ['www.fisherpaykel.com']);
  assert.equal(fingerprint.pdfMetadata.status, 'unavailable_in_content_list_v2');
  assert.doesNotMatch(JSON.stringify(fingerprint), /closedEnvelope|dimensionsMm|claims|verificationReceipt/);
});

test('reference fingerprint recognizes a bare exact official brand domain as discovery-only metadata', () => {
  const pdfBytes = Buffer.from('%PDF-1.7\nreference bytes');
  const jsonBytes = Buffer.from(JSON.stringify([[
    {
      type: 'text',
      content: { paragraph_content: [{ type: 'text', content: 'Support: fisherpaykel.com/au E450LXFD1' }] },
      bbox: [50, 120, 850, 200],
    },
  ]]));
  const pdfSha = createHash('sha256').update(pdfBytes).digest('hex');
  const jsonSha = createHash('sha256').update(jsonBytes).digest('hex');
  const fingerprint = buildReferenceArtifactFingerprint({
    authorityMode: 'reference',
    sourceUrl: MIRROR,
    finalUrl: MIRROR,
    contentType: 'application/pdf',
    contentSha256: pdfSha,
    byteSize: pdfBytes.length,
    derivedArtifact: {
      schemaVersion: 1,
      format: 'content_list_v2',
      sourcePdfSha256: pdfSha,
      contentSha256: jsonSha,
      byteSize: jsonBytes.length,
      pageCount: 1,
    },
    derivedArtifactBytes: jsonBytes,
  }, { brand: 'Fisher & Paykel', model: 'E450LXFD', category: 'fridge' });

  assert.deepEqual(fingerprint.linkedOfficialDomains, ['fisherpaykel.com']);
  assert.equal(fingerprint.receiptEligible, false);
});

test('mirror-only rediscovery ends source_authority and never fabricates an official source', async () => {
  const result = await rediscoverOfficialArtifacts({
    brand: 'Fisher & Paykel', model: 'E450LXFD', category: 'fridge',
  }, referenceFingerprint(), { discoverOfficialCandidates: async () => [] });

  assert.equal(result.status, 'source_authority');
  assert.deepEqual(result.officialCandidates, []);
  assert.equal(result.receiptEligible, false);
});

test('official rediscovery creates a separate official path even for an exact hash match', async () => {
  const fingerprint = referenceFingerprint();
  const result = await rediscoverOfficialArtifacts({
    brand: 'Fisher & Paykel', model: 'E450LXFD', category: 'fridge',
  }, fingerprint, {
    discoverOfficialCandidates: async () => [{
      sourceUrl: OFFICIAL,
      documentType: 'official_support_article',
      sourceModelHint: 'E450LXFD',
    }],
    inspectOfficialCandidate: async () => ({ contentSha256: 'a'.repeat(64) }),
  });

  assert.equal(result.status, 'official_candidates_discovered');
  assert.equal(result.officialCandidates[0].authorityMode, 'official');
  assert.equal(result.officialCandidates[0].matchBasis, 'exact_content_hash');
  assert.equal(result.officialCandidates[0].requiresOfficialAcquisition, true);
  assert.equal(result.receiptEligible, false);
  assert.notEqual(result.officialCandidates[0].sourceUrl, fingerprint.sourceUrl);
});

test('reference rediscovery drops another national market before acquisition', async () => {
  const result = await rediscoverOfficialArtifacts({
    brand: 'Fisher & Paykel', model: 'E450LXFD', category: 'fridge',
  }, referenceFingerprint(), {
    discoverOfficialCandidates: async () => [{
      sourceUrl: NON_AU_OFFICIAL,
      documentType: 'official_support_article',
      sourceModelHint: 'E450LXFD',
    }],
  });

  assert.equal(result.status, 'source_authority');
  assert.deepEqual(result.officialCandidates, []);
});

test('official rediscovery rejects reference fingerprints carrying publishable evidence or schema drift', async () => {
  const identity = { brand: 'Fisher & Paykel', model: 'E450LXFD', category: 'fridge' };
  const options = { discoverOfficialCandidates: async () => [] };
  await assert.rejects(() => rediscoverOfficialArtifacts(identity, referenceFingerprint({
    claims: [{ field: 'closedEnvelope.widthMm', value: 635 }],
  }), options), /unknown.*claims/i);
  await assert.rejects(() => rediscoverOfficialArtifacts(identity, referenceFingerprint({
    publishable: true,
  }), options), /publishable.*false/i);
  await assert.rejects(() => rediscoverOfficialArtifacts(identity, referenceFingerprint({
    receiptEligible: true,
  }), options), /receiptEligible.*false/i);
  await assert.rejects(() => rediscoverOfficialArtifacts(identity, referenceFingerprint({
    identityUse: 'exact_model_proof',
  }), options), /identityUse.*discovery_only/i);
  await assert.rejects(() => rediscoverOfficialArtifacts(identity, referenceFingerprint({
    pdfMetadata: { status: 'unavailable_in_content_list_v2', title: null, author: null, subject: null, dimensions: '635 x 1695 x 695' },
  }), options), /pdf metadata.*unknown.*dimensions/i);
});
