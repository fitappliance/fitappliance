import { createHash } from 'node:crypto';

import { extractClaimsFromHtml, verifyAndAttestResolutionArtifact } from './evidence-artifact-verifier.mjs';
import { upgradeLegacyDimensionClaim } from './dimension-evidence-claim.mjs';
import { parseMineruContentListV2 } from './mineru-document.mjs';
import { verifyVerificationReceipt } from './evidence-source-verifier.mjs';

const SHA256 = /^[a-f0-9]{64}$/;

function requiredText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} required`);
  return normalized;
}

function brandKey(value) {
  return requiredText(value, 'authority brand').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizedUrl(value) {
  const url = new URL(requiredText(value, 'candidate source URL'));
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new TypeError('candidate source URL must use trusted HTTPS');
  }
  url.hash = '';
  return url.toString();
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function extension(contentType) {
  if (contentType === 'application/pdf') return 'pdf';
  if (contentType === 'text/html') return 'html';
  throw new TypeError(`unsupported evidence content type ${contentType ?? 'missing'}`);
}

function rawObjectPath(hash, contentType) {
  return `evidence/web/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.${extension(contentType)}`;
}

function transportKey(sourceUrl, options) {
  const authorityMode = requiredText(options.authorityMode, 'authority mode');
  if (!['official', 'reference'].includes(authorityMode)) throw new TypeError('authority mode invalid');
  const policySha256 = requiredText(options.transportPolicySha256, 'transport policy SHA-256');
  if (!SHA256.test(policySha256)) throw new TypeError('transport policy SHA-256 invalid');
  return createHash('sha256').update([
    'evidence-artifact-transport-v1',
    brandKey(options.authorityBrand),
    normalizedUrl(sourceUrl),
    authorityMode,
    policySha256,
  ].join('\0')).digest('hex');
}

function verifyObject(bytes, expectedHash, expectedSize, label) {
  const buffer = Buffer.from(bytes ?? []);
  if (buffer.length !== expectedSize || sha256(buffer) !== expectedHash) {
    throw new Error(`${label} object integrity mismatch`);
  }
  return buffer;
}

async function rehydrateArtifact(record, options, expected) {
  if (!record || record.schemaVersion !== 1 || record.transportKey !== expected.transportKey
    || record.sourceUrl !== expected.sourceUrl
    || brandKey(record.authorityBrand) !== brandKey(expected.authorityBrand)
    || record.authorityMode !== expected.authorityMode
    || record.transportPolicySha256 !== expected.transportPolicySha256) return null;
  if (typeof options.readObject !== 'function') return null;
  const bytes = verifyObject(
    await options.readObject(record.objectPath),
    record.contentSha256,
    record.byteSize,
    'persisted evidence',
  );
  let derivedArtifactBytes = null;
  if (record.derivedArtifact) {
    derivedArtifactBytes = verifyObject(
      await options.readObject(record.derivedArtifact.objectPath),
      record.derivedArtifact.contentSha256,
      record.derivedArtifact.byteSize,
      'persisted MinerU',
    );
    if (record.derivedArtifact.sourcePdfSha256 !== record.contentSha256) {
      throw new Error('persisted MinerU PDF binding mismatch');
    }
  }
  return {
    ...record,
    bytes,
    derivedArtifactBytes,
  };
}

function artifactRecord(artifact) {
  const {
    bytes: _bytes,
    derivedArtifactBytes: _derivedArtifactBytes,
    ...record
  } = artifact;
  return record;
}

async function materializeContent(fetched, hash, options) {
  const contentType = String(fetched.contentType ?? '').toLowerCase();
  const bytes = Buffer.from(fetched.bytes ?? []);
  if (!bytes.length) throw new TypeError('non-empty artifact bytes required');
  const objectPath = rawObjectPath(hash, contentType);
  await options.writeObject(objectPath, bytes);
  if (contentType !== 'application/pdf') {
    return { contentType, bytes, contentSha256: hash, objectPath, byteSize: bytes.length, derivedArtifact: null, derivedArtifactBytes: null };
  }
  if (typeof options.processPdf !== 'function') throw new Error('MinerU PDF processor unavailable');
  const processed = await options.processPdf(bytes, { contentSha256: hash });
  if (!processed?.derivedArtifact || !processed?.jsonBytes) {
    throw new Error('MinerU PDF processor returned no JSON artifact');
  }
  const derivedArtifactBytes = verifyObject(
    processed.jsonBytes,
    processed.derivedArtifact.contentSha256,
    processed.derivedArtifact.byteSize,
    'MinerU',
  );
  if (processed.derivedArtifact.sourcePdfSha256 !== hash) {
    throw new Error('MinerU artifact is not bound to source PDF');
  }
  await options.writeObject(processed.derivedArtifact.objectPath, derivedArtifactBytes);
  return {
    contentType,
    bytes,
    contentSha256: hash,
    objectPath,
    byteSize: bytes.length,
    derivedArtifact: structuredClone(processed.derivedArtifact),
    derivedArtifactBytes,
  };
}

export async function acquireEvidenceArtifact(candidate, options = {}) {
  if (typeof options.fetchArtifact !== 'function') throw new TypeError('artifact fetcher required');
  if (typeof options.writeObject !== 'function') throw new TypeError('content-addressed object writer required');
  const sourceUrl = normalizedUrl(candidate?.sourceUrl ?? candidate);
  const key = transportKey(sourceUrl, options);
  const artifactCache = options.artifactCache ?? new Map();
  if (artifactCache.has(key)) return artifactCache.get(key);

  const promise = (async () => {
    const expected = {
      transportKey: key,
      sourceUrl,
      authorityBrand: requiredText(options.authorityBrand, 'authority brand'),
      authorityMode: options.authorityMode,
      transportPolicySha256: options.transportPolicySha256,
    };
    if (typeof options.readArtifactRecord === 'function') {
      const persisted = await rehydrateArtifact(await options.readArtifactRecord(key), options, expected);
      if (persisted) return persisted;
    }

    const fetched = await options.fetchArtifact(sourceUrl, expected.authorityBrand, options);
    const fetchedBytes = Buffer.from(fetched?.bytes ?? []);
    if (!fetchedBytes.length) throw new TypeError('non-empty artifact bytes required');
    const hash = sha256(fetchedBytes);
    const contentCache = options.contentCache ?? new Map();
    let contentPromise = contentCache.get(hash);
    if (!contentPromise) {
      contentPromise = materializeContent(fetched, hash, options);
      contentCache.set(hash, contentPromise);
      contentPromise.catch(() => contentCache.delete(hash));
    }
    const content = await contentPromise;
    const artifact = {
      schemaVersion: 1,
      transportKey: key,
      sourceUrl,
      authorityBrand: expected.authorityBrand,
      authorityMode: expected.authorityMode,
      transportPolicySha256: expected.transportPolicySha256,
      requestedUrl: normalizedUrl(fetched.requestedUrl ?? sourceUrl),
      finalUrl: normalizedUrl(fetched.finalUrl ?? sourceUrl),
      redirectChain: (fetched.redirectChain ?? []).map(normalizedUrl),
      contentType: content.contentType,
      contentSha256: content.contentSha256,
      objectPath: content.objectPath,
      byteSize: content.byteSize,
      bytes: content.bytes,
      derivedArtifact: content.derivedArtifact,
      derivedArtifactBytes: content.derivedArtifactBytes,
    };
    if (typeof options.writeArtifactRecord === 'function') {
      await options.writeArtifactRecord(artifactRecord(artifact));
    }
    return artifact;
  })();
  artifactCache.set(key, promise);
  promise.catch(() => artifactCache.delete(key));
  return promise;
}

function sameResource(left, right) {
  try {
    const a = new URL(left); const b = new URL(right);
    for (const url of [a, b]) {
      url.search = ''; url.hash = ''; url.pathname = url.pathname.replace(/\/+$/, '');
    }
    return a.toString() === b.toString();
  } catch {
    return false;
  }
}

export async function attestEvidenceArtifactForCase(caseRecord, artifact, options = {}) {
  if (artifact?.authorityMode !== 'official') throw new TypeError('official artifact authority required for attestation');
  if (brandKey(artifact.authorityBrand) !== brandKey(caseRecord?.brand)) {
    throw new TypeError('artifact authority brand does not match target brand');
  }
  const requestedFields = options.requestedFields;
  if (!Array.isArray(requestedFields) || requestedFields.length < 1) {
    throw new TypeError('requested evidence fields required');
  }
  const now = requiredText(options.now, 'attestation time');
  const claimSemanticsVersion = options.claimSemanticsVersion ?? 1;
  const identity = {
    brand: caseRecord.brand,
    model: caseRecord.model,
    category: caseRecord.category,
  };
  const unchanged = (caseRecord.sources ?? []).find((source) => source.contentSha256 === artifact.contentSha256);
  const unchangedCoversRequest = Boolean(unchanged) && (
    !options.requireRequestedFieldCoverage
    || requestedFields.every((field) => unchanged.claims?.some((claim) => claim.field === field))
  );
  if (unchanged && unchangedCoversRequest) {
    try {
      verifyVerificationReceipt(unchanged, identity, { asOf: now });
      return { unchanged: true, source: unchanged, replacesExistingHash: false };
    } catch {
      // Re-attest immutable bytes when policy or claim semantics advance.
    }
  }

  let claims;
  if (artifact.contentType === 'application/pdf') {
    if (!artifact.derivedArtifact || !artifact.derivedArtifactBytes) {
      throw new Error('MinerU JSON derived artifact required for PDF attestation');
    }
    claims = parseMineruContentListV2(artifact.derivedArtifactBytes, {
      pdfSha256: artifact.contentSha256,
      parserVersion: artifact.derivedArtifact.parserVersion,
      modelRevision: artifact.derivedArtifact.modelRevision,
      caseIdentity: identity,
      fields: requestedFields,
      claimSemanticsVersion,
    }).claims;
  } else if (artifact.contentType === 'text/html') {
    const extracted = extractClaimsFromHtml(artifact.bytes, {
      category: caseRecord.category,
      fields: requestedFields,
    });
    claims = claimSemanticsVersion === 2
      ? extracted.map(upgradeLegacyDimensionClaim)
      : extracted;
  } else {
    throw new TypeError('unsupported artifact content type');
  }
  if (!claims.length) throw new Error('no supported evidence claims extracted');
  const supersedesContentSha256 = (caseRecord.sources ?? [])
    .filter((source) => sameResource(source.finalUrl, artifact.finalUrl))
    .map((source) => source.contentSha256)
    .filter((value) => value !== artifact.contentSha256)
    .sort();
  const source = {
    authority: 'manufacturer',
    sourceType: artifact.contentType === 'application/pdf'
      ? 'official_exact_model_pdf'
      : 'official_exact_model_product_page',
    sourceUrl: artifact.requestedUrl,
    finalUrl: artifact.finalUrl,
    redirectChain: [...artifact.redirectChain],
    retrievedAt: now,
    contentSha256: artifact.contentSha256,
    objectPath: artifact.objectPath,
    contentType: artifact.contentType,
    byteSize: artifact.byteSize,
    supersedesContentSha256,
    identity: { brand: caseRecord.brand, model: caseRecord.model, outcome: 'exact' },
    claims,
    ...(artifact.derivedArtifact ? { derivedArtifact: structuredClone(artifact.derivedArtifact) } : {}),
  };
  const attested = verifyAndAttestResolutionArtifact({
    source,
    caseIdentity: identity,
    bytes: artifact.bytes,
    derivedArtifactBytes: artifact.derivedArtifactBytes,
    verifiedAt: now,
    claimSemanticsVersion,
  });
  return {
    unchanged: false,
    source: attested,
    replacesExistingHash: Boolean(unchanged),
  };
}
