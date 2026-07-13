import { createHash } from 'node:crypto';

import {
  acquireEvidenceArtifact,
  attestEvidenceArtifactForCase,
} from './evidence-artifact-pipeline.mjs';
import { recordResearchAttempt } from './evidence-research-state.mjs';
import { discoverRankedCandidateUrls } from './evidence-source-discovery.mjs';
import { resolutionFieldsForCase } from './evidence-resolution-loop.mjs';
import { evidenceSourcePolicy } from './evidence-source-verifier.mjs';
import { fetchOfficialArtifactResilient } from './official-artifact-transport.mjs';

export async function fetchOfficialArtifact(requestedUrl, brand, options = {}) {
  return fetchOfficialArtifactResilient(requestedUrl, brand, options);
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

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

const DEFAULT_TRANSPORT_POLICY_SHA256 = createHash('sha256').update(JSON.stringify(canonicalize({
  manufacturer: evidenceSourcePolicy.manufacturerPolicy,
  resolution: evidenceSourcePolicy.resolutionPolicy,
}))).digest('hex');

async function acquireCandidate(caseRecord, candidateUrl, options) {
  const fields = resolutionFieldsForCase(caseRecord);
  let artifact;
  try {
    artifact = await acquireEvidenceArtifact({ sourceUrl: candidateUrl }, {
      authorityBrand: caseRecord.brand,
      authorityMode: 'official',
      transportPolicySha256: options.transportPolicySha256 ?? DEFAULT_TRANSPORT_POLICY_SHA256,
      artifactCache: options.artifactCache,
      contentCache: options.contentCache,
      readArtifactRecord: options.readArtifactRecord,
      writeArtifactRecord: options.writeArtifactRecord,
      readObject: options.readObject,
      writeObject: options.writeObject,
      fetchArtifact: (url, brand) => fetchWithRetry(url, brand, options),
      processPdf: options.processPdf,
    });
  } catch (error) {
    if (/mineru/i.test(String(error?.message ?? error))) {
      throw new Error(`mineru_conversion:${error.message}`);
    }
    throw error;
  }
  try {
    return await attestEvidenceArtifactForCase(caseRecord, artifact, {
      now: options.now,
      requestedFields: fields,
      claimSemanticsVersion: options.claimSemanticsVersion ?? 1,
      requireRequestedFieldCoverage: options.requireRequestedFieldCoverage ?? false,
    });
  } catch (error) {
    throw new Error(`receipt_attestation:${error.message}`);
  }
}

export async function runEvidenceResearchCycle(caseRecord, options = {}) {
  if (typeof options.writeObject !== 'function') throw new TypeError('content-addressed object writer required');
  const now = String(options.now ?? new Date().toISOString());
  const runtimeOptions = {
    ...options,
    artifactCache: options.artifactCache ?? new Map(),
    contentCache: options.contentCache ?? new Map(),
  };
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
    candidates = await discoverRankedCandidateUrls(caseRecord, options);
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
      const acquired = await acquireCandidate(caseRecord, candidateUrl, { ...runtimeOptions, now });
      if (acquired.unchanged) {
        if (caseRecord.automationState === 'reconciliation_required') continue;
        return { caseRecord: structuredClone(caseRecord), failures, unchanged: true };
      }
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
