#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

import { verifyProfileCanaryAttestation } from '../../src/domain/architecture-v3/region-router.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const fixtureRoot = resolve(repositoryRoot, 'tests/fixtures/architecture-v3/profile-canaries');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function boundedReport(report) {
  const output = {
    status: report.status,
    candidateStatus: report.candidateStatus,
    mode: report.mode ?? null,
    reasons: report.reasons,
  };
  if (report.summary) output.summary = report.summary;
  if (Array.isArray(report.fixtureResults)) {
    output.fixtureResults = report.fixtureResults.map((row) => ({
      fixtureId: row.fixtureId,
      sourceId: row.sourceId,
      sourcePdfSha256: row.sourcePdfSha256,
      profileId: row.profileId,
      route: row.route,
      status: row.status,
      gaps: row.gaps,
    }));
  }
  if (Array.isArray(report.negativeWitnessResults)) {
    output.negativeWitnessResults = report.negativeWitnessResults.map((row) => ({
      profileId: row.profileId,
      fixtureId: row.fixtureId,
      sourcePdfSha256: row.sourcePdfSha256,
      sourceJsonPointer: row.sourceJsonPointer,
      fragmentSha256: row.fragmentSha256,
      inspectionStatus: row.inspectionStatus,
      selectionStatus: row.selectionStatus,
      selectedProfileId: row.selectedProfileId,
      route: row.route,
      status: row.status,
      reason: row.reason,
    }));
  }
  if (Array.isArray(report.sourceIdentityTamperResults)) {
    output.sourceIdentityTamperResults = report.sourceIdentityTamperResults.map((row) => ({
      profileId: row.profileId,
      sourcePdfSha256: row.sourcePdfSha256,
      status: row.status,
      reason: row.reason,
    }));
  }
  if (report.failedFixtureId) output.failedFixtureId = report.failedFixtureId;
  if (report.historicalOcrToolAttestation) {
    output.historicalOcrToolAttestation = report.historicalOcrToolAttestation;
  }
  return output;
}

function exitCodeFor(status) {
  if (status === 'pass') return 0;
  if (status === 'blocked' || status === 'not_run') return 2;
  return 1;
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeRelativePath(root, relativePath) {
  if (typeof relativePath !== 'string' || relativePath === '' || relativePath.startsWith('/') || relativePath.includes('\0')) {
    throw new Error('invalid relative evidence path');
  }
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(resolvedRoot, relativePath);
  const relation = relative(resolvedRoot, resolvedPath);
  if (relation === '..' || relation.startsWith('..' + sep)) throw new Error('evidence path escapes store');
  return resolvedPath;
}

async function readRegularFile(path) {
  const status = await lstat(path);
  if (!status.isFile() || status.isSymbolicLink()) throw new Error('evidence object is not a regular file');
  return readFile(path);
}

async function readJson(path) {
  return JSON.parse((await readFile(path)).toString('utf8'));
}

async function buildCodeIdentity(manifest) {
  if (!plainObject(manifest?.codeIdentity) || !Array.isArray(manifest.codeIdentity.files)) {
    throw new Error('manifest code identity is unavailable');
  }
  return {
    schemaVersion: 1,
    files: await Promise.all(manifest.codeIdentity.files.map(async (expected) => ({
      path: expected.path,
      sha256: sha256(await readRegularFile(safeRelativePath(repositoryRoot, expected.path))),
    }))),
  };
}

async function loadPortableCanaryInput() {
  const manifest = await readJson(resolve(fixtureRoot, 'manifest.json'));
  const [policy, brandRegistryArtifact] = await Promise.all([
    readJson(resolve(repositoryRoot, manifest.policy.path)),
    readJson(resolve(repositoryRoot, manifest.brandRegistry.path)),
  ]);
  if (!plainObject(brandRegistryArtifact) || !plainObject(brandRegistryArtifact.registry)) {
    throw new Error('brand registry artifact is unavailable');
  }
  const fixtures = await Promise.all(manifest.fixtures.map(async (expected) => {
    const bytes = await readRegularFile(safeRelativePath(fixtureRoot, expected.fixtureFile));
    return {
      fixtureId: expected.fixtureId,
      fileSha256: sha256(bytes),
      payload: JSON.parse(bytes.toString('utf8')),
    };
  }));
  return {
    manifest,
    portableFixtures: {
      schemaVersion: 1,
      mode: 'portable',
      registry: {
        brandRegistry: brandRegistryArtifact.registry,
        brandRegistrySha256: brandRegistryArtifact.registrySha256,
        profilePolicy: policy,
      },
      fixtures,
    },
    codeIdentity: await buildCodeIdentity(manifest),
  };
}

async function buildOriginalObjectObservation(storeRoot, manifest) {
  const rootStatus = await lstat(storeRoot);
  if (!rootStatus.isDirectory() || rootStatus.isSymbolicLink()) throw new Error('evidence store is unavailable');
  async function observed(relativePath) {
    const bytes = await readRegularFile(safeRelativePath(storeRoot, relativePath));
    return { objectPath: relativePath, bytesBase64: bytes.toString('base64') };
  }
  return {
    schemaVersion: 1,
    acceptedBatch: await observed(manifest.acceptedBatch.objectPath),
    historicalOcrAttempt: await observed(manifest.historicalOcrAttempt.recordObjectPath),
    sources: await Promise.all(manifest.sourceExpectations.map(async (source) => ({
      sourceId: source.sourceId,
      sourcePdf: await observed(source.sourcePdfObjectPath),
      selectedMineruJson: await observed(source.selectedMineruJsonObjectPath),
      lineage: await observed(source.lineageObjectPath),
      renderedPages: await Promise.all(source.renderedPages.map(async (page) => ({
        pageNumber: page.pageNumber,
        ...(await observed(page.objectPath)),
      }))),
    }))),
  };
}

export function parseProfileCanaryCliArguments(argumentsList = []) {
  if (argumentsList.length === 1 && argumentsList[0] === '--portable') return { ok: true, mode: 'portable' };
  if (argumentsList.length === 3
    && argumentsList[0] === '--original-objects'
    && argumentsList[1] === '--evidence-store'
    && typeof argumentsList[2] === 'string'
    && argumentsList[2].trim() !== '') {
    return { ok: true, mode: 'original-objects', evidenceStore: argumentsList[2] };
  }
  return { ok: false, reason: 'INVALID_CLI_ARGUMENTS' };
}

export async function runProfileCanaries(argumentsList = process.argv.slice(2)) {
  const parsed = parseProfileCanaryCliArguments(argumentsList);
  if (!parsed.ok) {
    const report = {
      status: 'not_run',
      candidateStatus: 'STRUCTURAL_CANDIDATE_ONLY',
      reasons: [parsed.reason],
    };
    return { exitCode: exitCodeFor(report.status), report };
  }
  let input;
  try {
    input = await loadPortableCanaryInput();
  } catch {
    const report = {
      status: 'fail',
      candidateStatus: 'STRUCTURAL_CANDIDATE_ONLY',
      mode: parsed.mode,
      reasons: ['LOCAL_CANARY_INPUT_READ_FAILED'],
    };
    return { exitCode: exitCodeFor(report.status), report };
  }
  if (parsed.mode === 'original-objects') {
    try {
      input.portableFixtures = {
        ...input.portableFixtures,
        mode: 'original-objects',
        originalObjects: await buildOriginalObjectObservation(parsed.evidenceStore, input.manifest),
      };
    } catch {
      const report = {
        status: 'blocked',
        candidateStatus: 'STRUCTURAL_CANDIDATE_ONLY',
        mode: parsed.mode,
        reasons: ['EVIDENCE_STORE_UNAVAILABLE'],
        historicalOcrToolAttestation: 'INCOMPLETE_RECORDED_TOOL_PROVENANCE',
      };
      return { exitCode: exitCodeFor(report.status), report };
    }
  }
  const report = verifyProfileCanaryAttestation(input);
  return { exitCode: exitCodeFor(report.status), report };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runProfileCanaries().then(({ exitCode, report }) => {
    process.stdout.write(JSON.stringify(boundedReport(report), null, 2) + '\n');
    process.exitCode = exitCode;
  }).catch(() => {
    process.stdout.write(JSON.stringify({
      status: 'fail',
      candidateStatus: 'STRUCTURAL_CANDIDATE_ONLY',
      reasons: ['UNHANDLED_CANARY_RUNNER_FAILURE'],
    }, null, 2) + '\n');
    process.exitCode = 1;
  });
}
