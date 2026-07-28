#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, resolve } from 'node:path';

import {
  buildProviderExistingGeometryClaims,
  buildProviderKnownModelCatalogue,
  parseAndQuarantineProviderResponse,
  persistQuarantinedProviderResponse,
} from '../../src/domain/provider-response-quarantine.mjs';

const DEFAULT_CURRENT_PROJECTION = 'data/architecture-v2/generated/public-catalog-projection.json';
const DEFAULT_HISTORICAL_CLASSIFICATION = 'data/architecture-v2/generated/historical-model-evidence-classification.json';

function usage() {
  return `Usage:
  npm run quarantine:provider-response -- \\
    --file /private/provider-sample.xlsx \\
    --manifest /private/provider-sample-intake.json \\
    --storage-root /Volumes/UGREEN-1TB/FitAppliance

The private manifest must contain schemaVersion 1, organizationId, providerId,
sourceId, receivedAt, format, schemaMapping, field-level rights decisions, and
rightsEvidenceFiles entries with a path and expected contentSha256.
No provider file, exact row value, contact, or absolute path is written to Git.`;
}

function parseArgs(argv) {
  const options = {
    currentProjection: DEFAULT_CURRENT_PROJECTION,
    historicalClassification: DEFAULT_HISTORICAL_CLASSIFICATION,
    storageRoot: process.env.FITAPPLIANCE_STORAGE_ROOT ?? null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === '--help') return { help: true };
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new TypeError(`missing value for ${name}`);
    index += 1;
    if (name === '--file') options.file = value;
    else if (name === '--manifest') options.manifest = value;
    else if (name === '--storage-root') options.storageRoot = value;
    else if (name === '--current-projection') options.currentProjection = value;
    else if (name === '--historical-classification') options.historicalClassification = value;
    else if (name === '--existing-claims') options.existingClaims = value;
    else throw new TypeError(`unknown argument: ${name}`);
  }
  if (!options.file || !options.manifest || !options.storageRoot) {
    throw new TypeError('--file, --manifest, and --storage-root are required');
  }
  return options;
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(resolve(path), 'utf8'));
  } catch (error) {
    throw new TypeError(`${label} could not be read as JSON: ${error.message}`, { cause: error });
  }
}

async function loadRightsEvidence(manifest, manifestPath) {
  if (!Array.isArray(manifest?.rightsEvidenceFiles) || manifest.rightsEvidenceFiles.length === 0) {
    throw new TypeError('private provider manifest needs rightsEvidenceFiles');
  }
  const base = dirname(resolve(manifestPath));
  return Promise.all(manifest.rightsEvidenceFiles.map(async (item, index) => {
    if (typeof item?.path !== 'string' || !item.path.trim()) {
      throw new TypeError(`rightsEvidenceFiles[${index}].path is required`);
    }
    const path = isAbsolute(item.path) ? item.path : resolve(base, item.path);
    return {
      contentSha256: item.contentSha256,
      bytes: await readFile(path),
    };
  }));
}

function safeSummary(report, persisted) {
  return {
    schemaVersion: 1,
    reportId: report.reportId ?? null,
    organizationId: report.organizationId,
    providerId: report.providerId,
    sourceId: report.sourceId,
    receivedAt: report.receivedAt,
    format: report.format,
    contentSha256: report.contentSha256,
    byteLength: report.byteLength,
    schemaMappingSha256: report.schemaMappingSha256,
    rightsStateSha256: report.rightsStateSha256,
    status: report.status,
    counts: {
      claims: report.claims.length,
      conflicts: report.conflicts.length,
      rows: report.rowDiagnostics.length,
      rejectedRows: report.rowDiagnostics.filter(({ outcome }) => outcome === 'REJECTED').length,
      blockedRights: report.rightsDiagnostics.length,
    },
    publicationEligible: false,
    fitEligible: false,
    persisted: Boolean(persisted),
    storage: persisted ? {
      rootEnv: 'FITAPPLIANCE_STORAGE_ROOT',
      sourceObjectPath: persisted.sourceRelativePath,
      receiptObjectPath: persisted.receiptRelativePath,
      receiptSha256: persisted.receiptSha256,
    } : null,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const [bytes, manifest, currentProjection, historicalClassification, existingClaims] = await Promise.all([
    readFile(resolve(options.file)),
    readJson(options.manifest, 'private provider manifest'),
    readJson(options.currentProjection, 'current projection'),
    readJson(options.historicalClassification, 'historical classification'),
    options.existingClaims ? readJson(options.existingClaims, 'existing claims') : Promise.resolve([]),
  ]);
  if (manifest?.schemaVersion !== 1) throw new TypeError('private provider manifest schemaVersion must be 1');
  const rightsEvidence = await loadRightsEvidence(manifest, options.manifest);
  const knownModels = buildProviderKnownModelCatalogue({ currentProjection, historicalClassification });
  const currentGeometryClaims = buildProviderExistingGeometryClaims({ currentProjection });
  const report = await parseAndQuarantineProviderResponse({
    ...manifest,
    bytes,
    fileName: basename(options.file),
    rightsEvidence,
    knownModels,
    existingClaims: [...currentGeometryClaims, ...existingClaims],
  });
  const persisted = report.cacheSourceAuthorized
    && report.cacheNormalizedFieldsAuthorized
    && report.publicDisplayAuthorized
    ? await persistQuarantinedProviderResponse(resolve(options.storageRoot), bytes, report, { rightsEvidence })
    : null;
  process.stdout.write(`${JSON.stringify(safeSummary(report, persisted), null, 2)}\n`);
  if (report.status !== 'QUARANTINED_CANDIDATES') process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
