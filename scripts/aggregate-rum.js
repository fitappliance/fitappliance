#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdir, readdir, readFile, writeFile } = require('node:fs/promises');

const METRICS = ['LCP', 'INP', 'CLS'];

function toIsoDate(value = new Date()) {
  const iso = typeof value === 'string' ? value : value.toISOString();
  return iso.slice(0, 10);
}

function sanitizePath(pathValue) {
  const raw = String(pathValue ?? '/').trim() || '/';
  try {
    const url = raw.startsWith('http://') || raw.startsWith('https://')
      ? new URL(raw)
      : new URL(raw, 'https://fitappliance.com.au');
    return `${url.pathname || '/'}${url.pathname.endsWith('/') && url.pathname.length > 1 ? '' : ''}`;
  } catch {
    return raw.split('#')[0].split('?')[0] || '/';
  }
}

function nearestRankPercentile(values, percentile) {
  const sorted = [...values]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (sorted.length === 0) return null;
  if (percentile <= 0) return sorted[0];
  if (percentile >= 100) return sorted[sorted.length - 1];

  const rank = Math.ceil((percentile / 100) * sorted.length);
  const index = Math.min(Math.max(rank - 1, 0), sorted.length - 1);
  return sorted[index];
}

function parseRumLine(rawLine) {
  const line = String(rawLine ?? '').trim();
  if (!line) return null;

  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }

  const metric = String(parsed.metric ?? '').toUpperCase();
  if (!METRICS.includes(metric)) return null;

  const value = Number(parsed.value);
  if (!Number.isFinite(value)) return null;

  return {
    metric,
    value,
    path: sanitizePath(parsed.path),
    ts: Number.isFinite(Number(parsed.ts)) ? Number(parsed.ts) : Date.now()
  };
}

function parseRumNdjson(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => parseRumLine(line))
    .filter(Boolean);
}

function aggregateRumEvents(events = []) {
  const buckets = new Map();

  for (const event of events) {
    const key = sanitizePath(event.path);
    if (!buckets.has(key)) {
      buckets.set(key, { path: key, metricValues: { LCP: [], INP: [], CLS: [] }, samples: 0 });
    }

    const bucket = buckets.get(key);
    bucket.metricValues[event.metric].push(Number(event.value));
    bucket.samples += 1;
  }

  const paths = [...buckets.values()]
    .map((bucket) => {
      const metrics = {};
      for (const metric of METRICS) {
        const values = bucket.metricValues[metric];
        if (values.length === 0) continue;
        metrics[metric] = {
          count: values.length,
          p50: nearestRankPercentile(values, 50),
          p75: nearestRankPercentile(values, 75),
          p95: nearestRankPercentile(values, 95)
        };
      }

      return {
        path: bucket.path,
        samples: bucket.samples,
        metrics
      };
    })
    .sort((left, right) => right.samples - left.samples || left.path.localeCompare(right.path));

  return {
    totals: {
      totalEvents: events.length,
      pathCount: paths.length
    },
    paths
  };
}

async function listRumFiles(rumDir) {
  try {
    const entries = await readdir(rumDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ndjson'))
      .map((entry) => path.join(rumDir, entry.name))
      .sort();
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
}

async function loadRumEvents({ rumDir }) {
  const files = await listRumFiles(rumDir);
  const events = [];

  for (const filePath of files) {
    const text = await readFile(filePath, 'utf8');
    events.push(...parseRumNdjson(text));
  }

  return { files, events };
}

async function runAggregateRum({
  repoRoot = path.resolve(__dirname, '..'),
  rumDir = path.join(repoRoot, 'reports', 'rum'),
  reportsDir = path.join(repoRoot, 'reports'),
  today = new Date(),
  logger = console
} = {}) {
  const isoDate = toIsoDate(today);
  const outputPath = path.join(reportsDir, `rum-summary-${isoDate.replace(/-/g, '')}.json`);
  const latestPath = path.join(reportsDir, 'rum-summary-latest.json');

  const { files, events } = await loadRumEvents({ rumDir });
  const summary = aggregateRumEvents(events);

  const report = {
    generatedAt: new Date().toISOString(),
    date: isoDate,
    source: {
      option: 'A',
      description: 'Vercel Log Drain exported as NDJSON into reports/rum',
      files: files.map((filePath) => path.relative(repoRoot, filePath).replace(/\\/g, '/'))
    },
    totals: summary.totals,
    status: summary.totals.totalEvents < 100 ? 'insufficient_samples' : 'ok',
    algorithm: 'nearest-rank',
    paths: summary.paths
  };

  await mkdir(reportsDir, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(latestPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  logger.log(`[aggregate-rum] events=${report.totals.totalEvents} paths=${report.totals.pathCount} status=${report.status}`);
  return report;
}

async function runCli() {
  try {
    await runAggregateRum();
  } catch (error) {
    console.error(`[aggregate-rum] ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  nearestRankPercentile,
  parseRumLine,
  parseRumNdjson,
  aggregateRumEvents,
  loadRumEvents,
  runAggregateRum
};
