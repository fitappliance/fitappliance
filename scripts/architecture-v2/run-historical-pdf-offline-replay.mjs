#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { createEvidenceObjectStore } from '../../src/domain/evidence-recovery-state-store.mjs';
import { loadHistoricalPdfReplayArtifact } from '../../src/domain/historical-pdf-offline-replay.mjs';
import { runHistoricalEvidenceRecovery } from './run-historical-evidence-recovery.mjs';
import { runAuditCli } from './audit-historical-evidence-recovery.mjs';
import { runPromotionCli } from './promote-historical-evidence-recovery.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function parseArgs(argv) {
  const result = { storageRoot: null, runId: null, resume: false, promote: false, fullAudit: false };
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (raw === '--resume') { result.resume = true; continue; }
    if (raw === '--promote') { result.promote = true; continue; }
    if (raw === '--full-audit') { result.fullAudit = true; continue; }
    const [flag, inline] = raw.includes('=') ? raw.split(/=(.*)/s, 2) : [raw, null];
    if (!['--storage-root', '--run-id'].includes(flag)) throw new TypeError(`unknown argument: ${raw}`);
    const value = inline ?? argv[++index];
    if (!value) throw new TypeError(`${flag} requires a value`);
    result[flag === '--storage-root' ? 'storageRoot' : 'runId'] = value;
  }
  if (result.resume && !result.runId) throw new TypeError('--resume requires --run-id');
  return result;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function runHistoricalPdfOfflineReplay(options) {
  const storageRoot = resolve(options.storageRoot ?? process.env.FITAPPLIANCE_STORAGE_ROOT ?? '');
  if (!options.storageRoot && !process.env.FITAPPLIANCE_STORAGE_ROOT) {
    throw new TypeError('--storage-root or FITAPPLIANCE_STORAGE_ROOT required');
  }
  const queuePath = resolveArchitectureV2Path(repoRoot, 'historicalPdfOfflineReplayQueue');
  const batchPath = resolveArchitectureV2Path(repoRoot, 'historicalPdfOfflineReplayBatch');
  const resultsPath = resolveArchitectureV2Path(repoRoot, 'historicalPdfOfflineReplayResults');
  const auditPath = resolveArchitectureV2Path(repoRoot, 'historicalPdfOfflineReplayAudit');
  const bundlePath = resolveArchitectureV2Path(repoRoot, 'historicalEvidenceRecoveryAcceptanceBundle');
  const policyPath = resolveArchitectureV2Path(repoRoot, 'historicalEvidenceRecoveryPolicy');
  const queue = await readJson(queuePath);
  const objectStore = createEvidenceObjectStore(storageRoot);
  const artifactsByJobId = new Map((queue.replayArtifacts ?? []).map((artifact) => [artifact.jobId, artifact]));
  if (artifactsByJobId.size !== queue.replayArtifacts?.length) throw new Error('duplicate offline replay artifact job');
  const now = new Date().toISOString();
  const runId = options.runId ?? `offline-pdf-replay-${now.replace(/[^0-9]/g, '').slice(0, 14)}`;
  const results = await runHistoricalEvidenceRecovery({
    input: batchPath,
    output: resultsPath,
    policy: policyPath,
    queue: queuePath,
    storageRoot,
    runId,
    resume: Boolean(options.resume),
    dryRun: false,
    requireSelection: false,
    jobIds: [],
    routes: [],
    limit: null,
    networkConcurrency: null,
    mineruConcurrency: null,
  }, {
    graphDependencies: {
      acquireArtifact: (job) => {
        const replayArtifact = artifactsByJobId.get(job.jobId);
        if (!replayArtifact) throw Object.assign(new Error(`offline replay artifact missing for ${job.jobId}`), { code: 'queue_drift' });
        return loadHistoricalPdfReplayArtifact({
          job,
          replayArtifact,
          storageRoot,
          writeObject: objectStore.writeObject,
        });
      },
      candidateResolversForTarget: () => [],
    },
  });
  const audit = await runAuditCli({
    mode: 'online',
    results: resultsPath,
    output: auditPath,
    bundle: bundlePath,
    queue: queuePath,
    storageRoot,
    full: Boolean(options.fullAudit),
  });
  if (audit.status !== 'passed') throw new Error(`offline replay audit failed: ${audit.violations.join('; ')}`);
  let bundle = null;
  if (options.promote) {
    bundle = await runPromotionCli({
      results: resultsPath,
      audit: auditPath,
      bundle: bundlePath,
      storageRoot,
    });
  }
  return { runId: results.runId, results, audit, bundle };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const outcome = await runHistoricalPdfOfflineReplay(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify({
    runId: outcome.runId,
    results: outcome.results.summary,
    audit: {
      status: outcome.audit.status,
      checkedTargets: outcome.audit.checkedTargets,
      checkedObjects: outcome.audit.checkedObjects,
    },
    bundle: outcome.bundle ? {
      entries: outcome.bundle.entries.length,
      lineage: outcome.bundle.lineage.length,
    } : null,
  }, null, 2)}\n`);
}
