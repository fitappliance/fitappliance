import { createHash } from 'node:crypto';

import { extractClaimsFromHtml, verifyAndAttestResolutionArtifact } from './evidence-artifact-verifier.mjs';
import { recordResearchAttempt } from './evidence-research-state.mjs';
import { discoverCandidateUrls } from './evidence-source-discovery.mjs';
import { resolutionFieldsForCase } from './evidence-resolution-loop.mjs';
import { isOfficialBrandHostUrl, isOfficialBrandUrl, verifyVerificationReceipt } from './evidence-source-verifier.mjs';
import { parseMineruContentListV2 } from './mineru-document.mjs';

const MAX_ARTIFACT_BYTES = 20 * 1024 * 1024;

function normalizeContentType(value) {
  return String(value ?? '').split(';')[0].trim().toLowerCase();
}

function artifactExtension(contentType) {
  if (contentType === 'text/html') return 'html';
  if (contentType === 'application/pdf') return 'pdf';
  throw new TypeError(`unsupported evidence content type ${contentType || 'missing'}`);
}

function validatePayloadType(contentType, bytes) {
  const prefix = Buffer.from(bytes).subarray(0, 16).toString('utf8').trimStart().toLowerCase();
  if (contentType === 'application/pdf' && !prefix.startsWith('%pdf-')) throw new Error('PDF content type does not match payload');
  if (contentType === 'text/html' && !prefix.startsWith('<!doctype') && !prefix.startsWith('<html')) {
    throw new Error('HTML content type does not match payload');
  }
}

export async function fetchOfficialArtifact(requestedUrl, brand, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maximumRedirects = options.maximumRedirects ?? 5;
  if (!isOfficialBrandUrl(requestedUrl, brand)) throw new TypeError('requested URL is not an official brand URL');
  let current = new URL(requestedUrl).toString();
  const redirectChain = [];
  for (let redirect = 0; redirect <= maximumRedirects; redirect += 1) {
    const response = await fetchImpl(current, {
      redirect: 'manual',
      signal: options.signal ?? AbortSignal.timeout(options.timeoutMs ?? 30000),
      headers: {
        'user-agent': 'FitApplianceEvidenceBot/2.0 (+https://www.fitappliance.com.au/about/editorial-standards)',
        accept: 'text/html,application/pdf;q=0.9',
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirect >= maximumRedirects) throw new Error('official redirect limit exceeded');
      const location = response.headers.get('location');
      if (!location) throw new Error('redirect location missing');
      const next = new URL(location, current).toString();
      if (!isOfficialBrandHostUrl(next, brand)) throw new Error('redirect escaped official brand hosts');
      redirectChain.push(next);
      current = next;
      continue;
    }
    if (!response.ok) throw new Error(`http_${response.status}`);
    const contentType = normalizeContentType(response.headers.get('content-type'));
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_ARTIFACT_BYTES) throw new Error('artifact size outside limits');
    validatePayloadType(contentType, bytes);
    return { requestedUrl: new URL(requestedUrl).toString(), finalUrl: current, redirectChain, contentType, bytes };
  }
  throw new Error('unreachable redirect state');
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

async function fetchWithRetry(url, brand, options) {
  const attempts = options.fetchAttempts ?? 3;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchOfficialArtifact(url, brand, options);
    } catch (error) {
      lastError = error;
      if (attempt < attempts && options.retryDelayMs) {
        await (options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))))(
          options.retryDelayMs * attempt,
        );
      }
    }
  }
  throw lastError;
}

function buildObjectPath(hash, extension) {
  return `evidence/web/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.${extension}`;
}

async function acquireCandidate(caseRecord, candidateUrl, options) {
  const fetched = await fetchWithRetry(candidateUrl, caseRecord.brand, options);
  const hash = createHash('sha256').update(fetched.bytes).digest('hex');
  const unchanged = (caseRecord.sources ?? []).find((source) => source.contentSha256 === hash);
  const caseIdentity = { brand: caseRecord.brand, model: caseRecord.model, category: caseRecord.category };
  if (unchanged) {
    try {
      verifyVerificationReceipt(unchanged, caseIdentity, { asOf: options.now });
      return { unchanged };
    } catch {
      // Reprocess unchanged bytes when the parser or evidence policy has advanced.
    }
  }
  const fields = resolutionFieldsForCase(caseRecord);
  let claims;
  let derivedArtifact = null;
  let derivedArtifactBytes = null;
  if (fetched.contentType === 'text/html') {
    claims = extractClaimsFromHtml(fetched.bytes, { category: caseRecord.category, fields });
  } else {
    if (typeof options.processPdf !== 'function') {
      throw new Error('MinerU PDF processor unavailable');
    }
    let processed;
    try {
      processed = await options.processPdf(fetched.bytes, { caseRecord, fields });
    } catch (error) {
      throw new Error(`mineru_conversion:${error.message}`);
    }
    derivedArtifact = processed?.derivedArtifact;
    derivedArtifactBytes = processed?.jsonBytes;
    if (!derivedArtifact || !derivedArtifactBytes) throw new Error('MinerU PDF processor returned no JSON artifact');
    try {
      claims = parseMineruContentListV2(derivedArtifactBytes, {
        pdfSha256: hash,
        parserVersion: derivedArtifact.parserVersion,
        modelRevision: derivedArtifact.modelRevision,
        caseIdentity,
        fields,
      }).claims;
    } catch (error) {
      throw new Error(`claim_extraction:${error.message}`);
    }
  }
  if (!claims.length) throw new Error('no supported evidence claims extracted');
  const supersedesContentSha256 = (caseRecord.sources ?? [])
    .filter((source) => sameResource(source.finalUrl, fetched.finalUrl))
    .map((source) => source.contentSha256)
    .filter((value) => value !== hash)
    .sort();
  const source = {
    authority: 'manufacturer',
    sourceType: fetched.contentType === 'application/pdf'
      ? 'official_exact_model_pdf'
      : 'official_exact_model_product_page',
    sourceUrl: fetched.requestedUrl,
    finalUrl: fetched.finalUrl,
    redirectChain: fetched.redirectChain,
    retrievedAt: options.now,
    contentSha256: hash,
    objectPath: buildObjectPath(hash, artifactExtension(fetched.contentType)),
    contentType: fetched.contentType,
    byteSize: fetched.bytes.length,
    supersedesContentSha256,
    identity: { brand: caseRecord.brand, model: caseRecord.model, outcome: 'exact' },
    claims,
    ...(derivedArtifact ? { derivedArtifact } : {}),
  };
  let attested;
  try {
    attested = verifyAndAttestResolutionArtifact({
      source,
      caseIdentity,
      bytes: fetched.bytes,
      derivedArtifactBytes,
      verifiedAt: options.now,
    });
  } catch (error) {
    throw new Error(`receipt_attestation:${error.message}`);
  }
  const objects = [{ objectPath: attested.objectPath, bytes: fetched.bytes }];
  if (derivedArtifact) objects.push({ objectPath: derivedArtifact.objectPath, bytes: derivedArtifactBytes });
  return { source: attested, objects, replacesExistingHash: Boolean(unchanged) };
}

export async function runEvidenceResearchCycle(caseRecord, options = {}) {
  if (typeof options.writeObject !== 'function') throw new TypeError('content-addressed object writer required');
  const now = String(options.now ?? new Date().toISOString());
  let candidates;
  const refreshFailure = (reason, failures) => ({
    caseRecord: {
      ...structuredClone(caseRecord),
      refreshHistory: [...(caseRecord.refreshHistory ?? []), {
        at: now, outcome: 'failed', reason,
      }],
    },
    failures,
    unchanged: true,
  });
  try {
    candidates = await discoverCandidateUrls(caseRecord, options);
  } catch (error) {
    if (options.refresh && (caseRecord.sources ?? []).length) {
      return refreshFailure(`discovery:${error.message}`, [{ candidateUrl: null, reason: error.message }]);
    }
    return {
      caseRecord: recordResearchAttempt(caseRecord, {
        outcome: 'failed', candidateUrl: null, reason: `discovery:${error.message}`,
      }, now),
      failures: [{ candidateUrl: null, reason: error.message }],
    };
  }
  const failures = [];
  for (const candidateUrl of candidates) {
    try {
      const acquired = await acquireCandidate(caseRecord, candidateUrl, { ...options, now });
      if (acquired.unchanged) {
        if (caseRecord.automationState === 'reconciliation_required') continue;
        return { caseRecord: structuredClone(caseRecord), failures, unchanged: true };
      }
      for (const object of acquired.objects) await options.writeObject(object.objectPath, object.bytes);
      return {
        caseRecord: recordResearchAttempt(caseRecord, {
          outcome: 'verified', source: acquired.source,
          replaceExisting: acquired.replacesExistingHash,
        }, now),
        failures,
        unchanged: false,
      };
    } catch (error) {
      failures.push({ candidateUrl, reason: String(error?.message ?? error) });
    }
  }
  const reason = candidates.length ? failures.map((failure) => failure.reason).join(';') : 'no_official_candidate';
  if (options.refresh && (caseRecord.sources ?? []).length) return refreshFailure(reason, failures);
  return {
    caseRecord: recordResearchAttempt(caseRecord, {
      outcome: 'failed', candidateUrl: candidates[0] ?? null, reason,
    }, now),
    failures,
    unchanged: false,
  };
}
