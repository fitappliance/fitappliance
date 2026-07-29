import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { initializePrivateOutreachStore } from './outreach-evidence-store.mjs';

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const ALLOWED_STATUSES = new Set(['QUARANTINED_CANDIDATES', 'QUARANTINED_WITH_CONFLICTS']);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freezeDeep(item);
  }
  return value;
}

function bytes(value, label) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  throw new TypeError(`${label} bytes are required`);
}

function timestamp(value, label) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be an ISO timestamp`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new TypeError(`${label} must be an exact ISO timestamp`);
  }
  return value;
}

function semanticId(prefix, value) {
  return `${prefix}_${sha256(canonicalJson(value)).slice(0, 24)}`;
}

function normalizeRightsEvidence(items, expectedHashes) {
  if (!Array.isArray(items)) throw new TypeError('rights evidence objects are required');
  const byHash = new Map();
  for (const item of items) {
    const payload = bytes(item?.bytes, 'rights evidence');
    const hash = sha256(payload);
    if (item?.contentSha256 !== hash || byHash.has(hash)) {
      throw new Error('rights evidence hash mismatch or duplicate');
    }
    byHash.set(hash, payload);
  }
  const actual = [...byHash.keys()].sort();
  const expected = [...(expectedHashes ?? [])].sort();
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error('rights evidence objects do not match the quarantine receipt');
  }
  return byHash;
}

function verifyReportBinding(receipt) {
  const { storage: ignoredStorage, ...storedReport } = receipt;
  const report = { ...storedReport, originalBytesPreserved: false };
  const { reportId, ...semanticReport } = report;
  const expected = semanticId('provider_response', semanticReport);
  if (reportId !== expected) throw new Error('provider report binding does not match the sealed receipt');
}

function validateQuarantineReceipt(receipt, sourceBytes, rightsEvidence) {
  if (receipt?.schemaVersion !== 1
    || receipt?.classification !== 'private_provider_response_quarantine'
    || receipt?.originalBytesPreserved !== true
    || receipt?.publicationEligible !== false
    || receipt?.fitEligible !== false
    || receipt?.publicProjection !== null
    || !ALLOWED_STATUSES.has(receipt?.status)
    || !Array.isArray(receipt?.claims)
    || receipt.claims.length === 0
    || !Array.isArray(receipt?.conflicts)
    || receipt?.cacheSourceAuthorized !== true
    || receipt?.cacheNormalizedFieldsAuthorized !== true
    || receipt?.publicDisplayAuthorized !== true
    || !Array.isArray(receipt?.rightsDiagnostics)
    || receipt.rightsDiagnostics.length !== 0) {
    throw new TypeError('a candidate-bearing private provider quarantine receipt is required');
  }
  if (!HASH_PATTERN.test(receipt.contentSha256 ?? '')
    || sha256(sourceBytes) !== receipt.contentSha256
    || sourceBytes.length !== receipt.byteLength) {
    throw new Error('provider source bytes do not match the quarantine receipt hash');
  }
  normalizeRightsEvidence(rightsEvidence, receipt.rightsEvidenceSha256);
  verifyReportBinding(receipt);
}

function fieldReceiptFor(claim, receipt, quarantineReceiptSha256, acceptedAt) {
  if (claim?.identity?.outcome !== 'exact'
    || claim?.market?.normalized !== 'AU'
    || claim?.rights?.cacheNormalizedFields !== 'granted'
    || claim?.rights?.publicDisplay !== 'granted'
    || claim?.publicationEligible !== false
    || claim?.fitEligible !== false
    || claim?.provenance?.providerId !== receipt.providerId
    || claim?.provenance?.sourceId !== receipt.sourceId
    || claim?.provenance?.contentSha256 !== receipt.contentSha256) {
    throw new Error('provider claim is not eligible for a private field receipt');
  }
  const { claimId, ...semanticClaim } = claim;
  if (claimId !== semanticId('provider_claim', semanticClaim)) {
    throw new Error('provider claim binding does not match the sealed receipt');
  }
  const semantic = {
    schemaVersion: 1,
    classification: 'private_provider_field_receipt',
    status: 'RECEIPT_ISSUED',
    acceptedAt,
    quarantineReceiptSha256,
    quarantineReportId: receipt.reportId,
    organizationId: receipt.organizationId,
    providerId: receipt.providerId,
    sourceId: receipt.sourceId,
    contentSha256: receipt.contentSha256,
    claimId,
    identity: claim.identity,
    market: claim.market,
    fieldId: claim.fieldId,
    normalizedValue: claim.normalizedValue,
    originalValue: claim.originalValue,
    originalUnit: claim.originalUnit,
    axis: claim.axis,
    scope: claim.scope,
    sourceBinding: claim.provenance,
    rightsBinding: {
      rightsStateSha256: receipt.rightsStateSha256,
      rightsEvidenceSha256: receipt.rightsEvidenceSha256,
    },
    publicationEligible: false,
    fitEligible: false,
    publicProjection: null,
  };
  return freezeDeep({ ...semantic, fieldReceiptId: semanticId('provider_field_receipt', semantic) });
}

export function buildProviderShadowAcceptance(input) {
  const quarantineReceiptBytes = bytes(input?.quarantineReceiptBytes, 'quarantine receipt');
  const expectedReceiptSha256 = input?.quarantineReceiptSha256;
  if (!HASH_PATTERN.test(expectedReceiptSha256 ?? '')
    || sha256(quarantineReceiptBytes) !== expectedReceiptSha256) {
    throw new Error('quarantine receipt hash mismatch');
  }
  let receipt;
  try {
    receipt = JSON.parse(quarantineReceiptBytes);
  } catch (error) {
    throw new TypeError(`quarantine receipt is not valid JSON: ${error.message}`);
  }
  if (!quarantineReceiptBytes.equals(Buffer.from(`${canonicalJson(receipt)}\n`))) {
    throw new Error('quarantine receipt is not canonical sealed JSON');
  }
  const sourceBytes = bytes(input?.sourceBytes, 'provider source');
  validateQuarantineReceipt(receipt, sourceBytes, input?.rightsEvidence);
  const acceptedAt = timestamp(input?.acceptedAt, 'acceptedAt');
  if (Date.parse(acceptedAt) < Date.parse(receipt.receivedAt)) {
    throw new Error('shadow acceptance cannot predate provider receipt');
  }

  const seen = new Set();
  const fieldReceipts = receipt.claims.map((claim) => {
    const key = `${claim.identity?.category}\0${claim.identity?.brand}\0${claim.identity?.model}\0${claim.fieldId}`;
    if (seen.has(key)) throw new Error(`duplicate provider field claim: ${key}`);
    seen.add(key);
    return fieldReceiptFor(claim, receipt, expectedReceiptSha256, acceptedAt);
  }).sort((left, right) => left.fieldReceiptId.localeCompare(right.fieldReceiptId, 'en'));
  const shadowSemantic = {
    schemaVersion: 1,
    classification: 'private_provider_shadow_acceptance',
    status: 'SHADOW_ACCEPTED',
    acceptedAt,
    quarantineReceiptSha256: expectedReceiptSha256,
    quarantineReportId: receipt.reportId,
    fieldReceiptIds: fieldReceipts.map(({ fieldReceiptId }) => fieldReceiptId),
    quarantinedConflictCount: receipt.conflicts.length,
    publicationEligible: false,
    fitEligible: false,
    publicProjection: null,
  };
  const shadowAcceptance = freezeDeep({
    ...shadowSemantic,
    shadowAcceptanceId: semanticId('provider_shadow_acceptance', shadowSemantic),
  });
  return freezeDeep({
    schemaVersion: 1,
    status: 'SHADOW_ACCEPTED',
    quarantineReceiptSha256: expectedReceiptSha256,
    fieldReceipts,
    shadowAcceptance,
    publicationEligible: false,
    fitEligible: false,
  });
}

async function writeImmutable(path, payload) {
  try {
    await writeFile(path, payload, { flag: 'wx' });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    if (!(await readFile(path)).equals(payload)) throw new Error(`immutable provider shadow object mismatch: ${path}`);
  }
}

export async function persistProviderShadowAcceptance(storageRoot, result) {
  if (result?.status !== 'SHADOW_ACCEPTED'
    || result?.publicationEligible !== false
    || result?.fitEligible !== false
    || !Array.isArray(result?.fieldReceipts)
    || result.fieldReceipts.length === 0
    || result?.shadowAcceptance?.status !== 'SHADOW_ACCEPTED') {
    throw new TypeError('a private provider shadow acceptance result is required');
  }
  const store = await initializePrivateOutreachStore(storageRoot);
  const fieldObjects = result.fieldReceipts.map((receipt) => {
    const payload = Buffer.from(`${canonicalJson(receipt)}\n`);
    const hash = sha256(payload);
    const relativePath = join('provider-samples', 'field-receipts', hash.slice(0, 2), `${hash}.json`);
    return { payload, relativePath, path: join(store.root, relativePath) };
  });
  const shadowPayload = Buffer.from(`${canonicalJson(result.shadowAcceptance)}\n`);
  const shadowSha256 = sha256(shadowPayload);
  const shadowAcceptanceRelativePath = join(
    'provider-samples', 'shadow-acceptance', shadowSha256.slice(0, 2), `${shadowSha256}.json`,
  );
  const shadowAcceptancePath = join(store.root, shadowAcceptanceRelativePath);
  await Promise.all(fieldObjects.map(({ path }) => mkdir(dirname(path), { recursive: true })));
  await mkdir(dirname(shadowAcceptancePath), { recursive: true });
  await Promise.all(fieldObjects.map(({ path, payload }) => writeImmutable(path, payload)));
  await writeImmutable(shadowAcceptancePath, shadowPayload);
  return freezeDeep({
    fieldReceiptPaths: fieldObjects.map(({ path }) => path),
    fieldReceiptRelativePaths: fieldObjects.map(({ relativePath }) => relativePath),
    shadowAcceptancePath,
    shadowAcceptanceRelativePath,
    shadowAcceptanceSha256: shadowSha256,
  });
}
