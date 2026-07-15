import { readFile, realpath, stat } from 'node:fs/promises';

function parserVersion(stdout) {
  const match = /\bversion\s+(\d+\.\d+\.\d+)\b/i.exec(String(stdout ?? ''));
  if (!match) throw new Error('MinerU version output invalid');
  return match[1];
}

function markerRevision(stdout, backend) {
  const markerName = backend === 'hybrid-engine'
    ? 'fitappliance-vlm-model-revision'
    : 'fitappliance-model-revision';
  return new RegExp(`\\b${markerName}\\s+([a-f0-9]{40})\\b`, 'i')
    .exec(String(stdout ?? ''))?.[1]?.toLowerCase() ?? null;
}

async function configuredSnapshotRevision(configPath, backend) {
  if (!configPath) return null;
  let config;
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch (error) {
    throw new Error(`MinerU model config is not readable JSON: ${error.message}`, { cause: error });
  }
  const modelKey = backend === 'hybrid-engine' ? 'vlm' : 'pipeline';
  const configuredPath = config?.['models-dir']?.[modelKey];
  if (typeof configuredPath !== 'string' || configuredPath.trim() === '') {
    throw new Error(`MinerU model config has no ${modelKey} snapshot path`);
  }
  let snapshotPath;
  let snapshotStat;
  try {
    snapshotPath = await realpath(configuredPath);
    snapshotStat = await stat(snapshotPath);
  } catch (error) {
    throw new Error(`MinerU ${modelKey} snapshot directory is unavailable: ${error.message}`, { cause: error });
  }
  if (!snapshotStat.isDirectory()) throw new Error(`MinerU ${modelKey} snapshot path is not a directory`);
  const revision = /(?:^|[\\/])snapshots[\\/]([a-f0-9]{40})(?:[\\/]|$)/i.exec(snapshotPath)?.[1]?.toLowerCase();
  if (!revision) throw new Error(`MinerU ${modelKey} snapshot path has no revision identity`);
  return revision;
}

export async function attestMineruToolIdentity({
  stdout,
  backend = 'pipeline',
  configPath = null,
  expectedVersion = null,
}) {
  const version = parserVersion(stdout);
  if (expectedVersion !== null && version !== expectedVersion) {
    throw new Error(`MinerU version ${version} does not match policy ${expectedVersion}`);
  }
  const marker = markerRevision(stdout, backend);
  const snapshot = await configuredSnapshotRevision(configPath, backend);
  if (marker && snapshot && marker !== snapshot) {
    throw new Error('MinerU version marker and configured local model snapshot disagree');
  }
  const modelRevision = marker ?? snapshot;
  if (!modelRevision) throw new Error('MinerU model revision is not attested');
  return {
    version,
    modelRevision,
    modelRevisionSource: marker && snapshot
      ? 'version_marker_and_local_model_snapshot'
      : marker ? 'version_marker' : 'local_model_snapshot',
  };
}
