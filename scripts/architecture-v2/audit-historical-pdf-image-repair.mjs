#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { loadHistoricalRecoveryActiveRelease } from '../../src/domain/historical-recovery-active-release.mjs';
import {
  buildHistoricalPdfImageRepairAudit,
  reconcileMineruProfileExtractions,
} from '../../src/domain/historical-pdf-image-repair.mjs';
import { parseMineruContentListV2 } from '../../src/domain/mineru-document.mjs';
import { evidenceSourcePolicy } from '../../src/domain/evidence-source-verifier.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname);
const FIELDS = Object.freeze([
  'closedEnvelope.widthMm',
  'closedEnvelope.heightMm',
  'closedEnvelope.depthMm',
]);

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function failureCode(error) {
  const message = String(error?.message ?? error);
  if (/family manual|multiple models|identity signal|identity scope|exact-model/i.test(message)) {
    return 'IDENTITY_SCOPE_UNRESOLVED';
  }
  if (/ambiguous MinerU values/i.test(message)) return 'AMBIGUOUS_DIMENSION_VALUES';
  if (/no exact-model MinerU evidence|no supported evidence claims/i.test(message)) {
    return 'NO_USABLE_DIMENSION_CLAIMS';
  }
  return 'EXTRACTION_FAILED';
}

function parseProfile(bytes, options) {
  try {
    const parsed = parseMineruContentListV2(bytes, options);
    return {
      status: 'extracted',
      claims: parsed.claims,
      identitySignals: parsed.identitySignals,
    };
  } catch (error) {
    return {
      status: 'failed',
      failureCode: failureCode(error),
      error: String(error?.message ?? error),
    };
  }
}

async function atomicWrite(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

async function main(args) {
  const storageRootValue = option(args, '--storage-root') ?? process.env.FITAPPLIANCE_STORAGE_ROOT;
  if (!storageRootValue) throw new TypeError('--storage-root or FITAPPLIANCE_STORAGE_ROOT required');
  const storageRoot = resolve(storageRootValue);
  const outputPath = resolve(option(args, '--output')
    ?? resolveArchitectureV2Path(root, 'historicalPdfImageRepairAudit'));
  const [queue, activeRecovery] = await Promise.all([
    readJson(resolveArchitectureV2Path(root, 'historicalPdfImageRepairQueue')),
    loadHistoricalRecoveryActiveRelease({ root }),
  ]);
  const historicalReference = activeRecovery.reference;
  const hybridProfile = evidenceSourcePolicy.resolutionPolicy.pdfEvidenceProfiles
    .find((profile) => profile.profileId === 'hybrid-image-high-v1');
  const primaryProfile = evidenceSourcePolicy.resolutionPolicy.pdfEvidenceProfiles
    .find((profile) => profile.profileId === 'pipeline-auto-v1');
  if (!hybridProfile) throw new Error('hybrid image evidence profile missing');
  if (!primaryProfile) throw new Error('primary PDF evidence profile missing');
  const extractions = [];
  for (const document of queue.documents.filter((entry) => (
    entry.primaryScan?.status === 'current' && entry.linkedModels?.length > 0
  ))) {
    const primaryBytes = await readFile(resolve(
      storageRoot,
      `evidence/derived/mineru-json/sha256/${document.primaryScan.derivedContentSha256.slice(0, 2)}/${document.primaryScan.derivedContentSha256.slice(2, 4)}/${document.primaryScan.derivedContentSha256}.json`,
    ));
    const hybridHash = document.hybridIndex?.derivedContentSha256 ?? null;
    const hybridBytes = hybridHash ? await readFile(resolve(
      storageRoot,
      `evidence/derived/mineru-json/sha256/${hybridHash.slice(0, 2)}/${hybridHash.slice(2, 4)}/${hybridHash}.json`,
    )) : null;
    for (const model of document.linkedModels) {
      const sourceUrls = (document.sourceLinks ?? []).filter((link) => (
        link.referenceId === model.referenceId && link.sourceUrl
      )).map((link) => link.sourceUrl);
      const common = {
        pdfSha256: document.sourcePdfSha256,
        caseIdentity: { brand: model.brand, model: model.model, category: model.category },
        fields: [...FIELDS],
        claimSemanticsVersion: 2,
        sourceUrls,
      };
      const primary = parseProfile(primaryBytes, {
        ...common,
        parserVersion: primaryProfile.parserVersion,
        modelRevision: primaryProfile.modelRevision,
      });
      const hybrid = hybridBytes ? parseProfile(hybridBytes, {
          ...common,
          parserVersion: hybridProfile.parserVersion,
          modelRevision: hybridProfile.modelRevision,
          identityContextJsonBytes: primaryBytes,
          identityContextContentSha256: document.primaryScan.derivedContentSha256,
        }) : {
          status: 'failed',
          failureCode: String(document.repairClass).startsWith('HYBRID_REQUIRED')
            ? 'HYBRID_REPAIR_REQUIRED'
            : 'NO_USABLE_DIMENSION_CLAIMS',
          error: String(document.repairClass).startsWith('HYBRID_REQUIRED')
            ? 'current hybrid MinerU profile has not been generated for the selected image pages'
            : 'hybrid MinerU profile is not applicable to this primary text document',
        };
      extractions.push({
        sourcePdfSha256: document.sourcePdfSha256,
        referenceId: model.referenceId,
        ...reconcileMineruProfileExtractions({ primary, hybrid }),
      });
    }
  }
  const audit = buildHistoricalPdfImageRepairAudit({
    queue,
    historicalReference,
    extractions,
    generatedAt: option(args, '--generated-at') ?? new Date().toISOString(),
    toleranceMm: Number(option(args, '--tolerance-mm') ?? 2),
  });
  await atomicWrite(outputPath, audit);
  process.stdout.write(`${JSON.stringify({
    output: relative(root, outputPath).split(sep).join('/'),
    semanticAuditSha256: audit.semanticAuditSha256,
    summary: audit.summary,
  }, null, 2)}\n`);
}

await main(process.argv.slice(2));
