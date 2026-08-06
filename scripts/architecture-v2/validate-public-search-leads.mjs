import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  isOfficialBrandArtifactUrl,
  isOfficialBrandMarketUrl,
} from '../../src/domain/evidence-source-verifier.mjs';
import {
  publicSearchSha256,
  validatePublicSearchLead,
} from '../../src/domain/public-search-lead.mjs';

function modelTokens(value) {
  return String(value ?? '').toUpperCase().match(/[A-Z0-9]+/g) ?? [];
}

function exactModelUrlSignal(url, exactModel) {
  let decoded;
  try {
    const parsed = new URL(url);
    decoded = decodeURIComponent(`${parsed.pathname}${parsed.search}`);
  } catch {
    return false;
  }
  const targetTokens = modelTokens(exactModel);
  const urlTokens = modelTokens(decoded);
  if (targetTokens.length === 0 || targetTokens.length > urlTokens.length) return false;
  return urlTokens.some((token, index) => (
    token === targetTokens[0]
    && targetTokens.every((targetToken, offset) => urlTokens[index + offset] === targetToken)
  ));
}

function reject(lead, reasonCode) {
  return {
    leadId: lead.leadId,
    status: 'REJECTED',
    reasonCode,
    candidateId: null,
  };
}

export function validatePublicSearchLeads({ leads }) {
  if (!Array.isArray(leads)) throw new TypeError('public search leads array required');
  const validated = leads.map((lead) => {
    validatePublicSearchLead(lead);
    if (lead.state.status === 'REJECTED') {
      return { outcome: reject(lead, lead.state.reasonCode), candidate: null };
    }
    const marketUrlAccepted = isOfficialBrandMarketUrl(lead.result.url, lead.target.brand);
    const artifactUrlAccepted = isOfficialBrandArtifactUrl(
      lead.result.url,
      lead.target.brand,
      { model: lead.target.exactModel, category: lead.target.category },
    );
    if (!marketUrlAccepted && !artifactUrlAccepted) {
      return { outcome: reject(lead, 'OFFICIAL_HOST_OR_MARKET_REJECTED'), candidate: null };
    }
    const modelSignal = exactModelUrlSignal(lead.result.url, lead.target.exactModel);
    if (!modelSignal) {
      return { outcome: reject(lead, 'EXACT_MODEL_URL_SIGNAL_MISSING'), candidate: null };
    }
    const semanticCandidate = {
      schemaVersion: 1,
      targetId: lead.target.targetId,
      referenceId: lead.target.referenceId,
      brand: lead.target.brand,
      exactModel: lead.target.exactModel,
      category: lead.target.category,
      lifecycleState: lead.target.lifecycleState,
      activeReleaseId: lead.target.activeReleaseId,
      activeReleaseSha256: lead.target.activeReleaseSha256,
      sourceUrl: lead.result.url,
      authorityMode: 'official',
      validation: {
        marketUrlAccepted,
        artifactUrlAccepted,
        exactModelUrlSignal: true,
      },
      publicSearchLeadBinding: {
        leadId: lead.leadId,
        semanticLeadSha256: lead.semanticLeadSha256,
        queryId: lead.query.queryId,
        querySha256: lead.query.querySha256,
        captureObjectSha256: lead.capture.objectSha256,
      },
    };
    const candidateSha256 = publicSearchSha256(semanticCandidate);
    const candidate = {
      ...semanticCandidate,
      candidateId: `public_search_candidate_${candidateSha256.slice(0, 24)}`,
      candidateSha256,
    };
    return {
      candidate,
      outcome: {
        leadId: lead.leadId,
        status: 'VALIDATED_OFFICIAL_CANDIDATE_INPUT',
        reasonCode: null,
        candidateId: candidate.candidateId,
      },
    };
  }).sort((left, right) => left.outcome.leadId.localeCompare(right.outcome.leadId));

  return {
    schemaVersion: 1,
    candidates: validated.flatMap((row) => row.candidate ? [row.candidate] : []),
    outcomes: validated.map((row) => row.outcome),
    summary: {
      leads: validated.length,
      validated: validated.filter((row) => row.candidate).length,
      rejected: validated.filter((row) => !row.candidate).length,
    },
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!['--input', '--output'].includes(flag) || !value) {
      throw new TypeError('explicit --input and --output required');
    }
    options[flag.slice(2)] = resolve(value);
  }
  if (!options.input || !options.output) throw new TypeError('explicit --input and --output required');
  return options;
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const input = JSON.parse(await readFile(options.input, 'utf8'));
  const result = validatePublicSearchLeads(input);
  await mkdir(dirname(options.output), { recursive: true });
  const temporary = `${options.output}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`);
  await rename(temporary, options.output);
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli();
}
