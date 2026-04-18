#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const { mkdir, readdir, readFile, writeFile } = require('node:fs/promises');

function toIsoDate(value = new Date()) {
  const iso = typeof value === 'string' ? value : value.toISOString();
  return iso.slice(0, 10);
}

function parseErrorLine(line) {
  const text = String(line ?? '').trim();
  if (!text) return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (!parsed.message || !parsed.source) return null;
  return {
    message: String(parsed.message),
    source: String(parsed.source),
    line: Number(parsed.line ?? 0),
    col: Number(parsed.col ?? 0),
    stack: String(parsed.stack ?? ''),
    ts: Number(parsed.ts ?? Date.now())
  };
}

function parseErrorNdjson(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => parseErrorLine(line))
    .filter(Boolean);
}

function sourceBaseName(source) {
  try {
    const url = new URL(source);
    return path.basename(url.pathname || 'unknown');
  } catch {
    return path.basename(String(source || 'unknown'));
  }
}

function buildSignature(event) {
  const raw = `${event.message}|${sourceBaseName(event.source)}|${event.line}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function aggregateErrorEvents(events = []) {
  const buckets = new Map();

  for (const event of events) {
    const signature = buildSignature(event);
    if (!buckets.has(signature)) {
      buckets.set(signature, {
        signature,
        count: 0,
        firstSeen: new Date(event.ts).toISOString(),
        lastSeen: new Date(event.ts).toISOString(),
        sampleStack: event.stack,
        message: event.message,
        source: event.source,
        line: event.line
      });
    }

    const bucket = buckets.get(signature);
    bucket.count += 1;
    const tsIso = new Date(event.ts).toISOString();
    if (tsIso < bucket.firstSeen) bucket.firstSeen = tsIso;
    if (tsIso > bucket.lastSeen) bucket.lastSeen = tsIso;
  }

  return {
    totals: {
      totalEvents: events.length,
      signatureCount: buckets.size
    },
    signatures: [...buckets.values()].sort((left, right) => right.count - left.count || left.signature.localeCompare(right.signature))
  };
}

async function listErrorFiles(errorsDir) {
  try {
    const entries = await readdir(errorsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ndjson'))
      .map((entry) => path.join(errorsDir, entry.name))
      .sort();
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
}

async function runAggregateErrors({
  repoRoot = path.resolve(__dirname, '..'),
  errorsDir = path.join(repoRoot, 'reports', 'errors'),
  reportsDir = path.join(repoRoot, 'reports'),
  today = new Date(),
  logger = console
} = {}) {
  const isoDate = toIsoDate(today);
  const outputPath = path.join(reportsDir, `errors-${isoDate.replace(/-/g, '')}.json`);
  const latestPath = path.join(reportsDir, 'errors-latest.json');

  const files = await listErrorFiles(errorsDir);
  const events = [];
  for (const filePath of files) {
    const text = await readFile(filePath, 'utf8');
    events.push(...parseErrorNdjson(text));
  }

  const summary = aggregateErrorEvents(events);
  const report = {
    generatedAt: new Date().toISOString(),
    date: isoDate,
    sourceFiles: files.map((filePath) => path.relative(repoRoot, filePath).replace(/\\/g, '/')),
    totals: summary.totals,
    signatures: summary.signatures
  };

  await mkdir(reportsDir, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(latestPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  logger.log(`[aggregate-errors] events=${summary.totals.totalEvents} signatures=${summary.totals.signatureCount}`);
  return report;
}

async function runCli() {
  try {
    await runAggregateErrors();
  } catch (error) {
    console.error(`[aggregate-errors] ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  parseErrorLine,
  parseErrorNdjson,
  buildSignature,
  aggregateErrorEvents,
  runAggregateErrors
};
