import { execFile as execFileCallback } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const PYTHON_FETCH_SCRIPT = String.raw`
import json
import sys
from pathlib import Path
from scrapling.fetchers import Fetcher

url, body_path, metadata_path, timeout_seconds = sys.argv[1:5]
response = Fetcher.get(url, impersonate="chrome", timeout=float(timeout_seconds))
body = bytes(response.body)
Path(body_path).write_bytes(body)
Path(metadata_path).write_text(json.dumps({
    "status": int(response.status),
    "finalUrl": str(response.url),
    "contentType": str(dict(response.headers).get("content-type", "")),
    "byteSize": len(body),
}), encoding="utf-8")
`;

async function resolveScraplingPython(options = {}) {
  if (options.pythonBinary) return options.pythonBinary;
  if (process.env.FITAPPLIANCE_SCRAPLING_PYTHON) {
    return process.env.FITAPPLIANCE_SCRAPLING_PYTHON;
  }
  const { stdout } = await execFile('which', [options.scraplingBinary ?? 'scrapling'], {
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 64 * 1024,
  });
  const executable = String(stdout).trim();
  const shebang = readFileSync(executable, 'utf8').split(/\r?\n/, 1)[0];
  if (!shebang.startsWith('#!')) throw new Error('Scrapling launcher has no Python shebang');
  return shebang.slice(2).trim().split(/\s+/, 1)[0];
}

export async function fetchViaScrapling(requestedUrl, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'fitappliance-scrapling-'));
  const bodyPath = join(directory, 'body');
  const metadataPath = join(directory, 'metadata.json');
  try {
    const timeoutMs = options.timeoutMs ?? 30000;
    const pythonBinary = await resolveScraplingPython(options);
    await execFile(pythonBinary, [
      '-c', PYTHON_FETCH_SCRIPT,
      new URL(requestedUrl).toString(),
      bodyPath,
      metadataPath,
      String(Math.max(1, timeoutMs / 1000)),
    ], {
      timeout: timeoutMs + 5000,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });
    const [metadata, bytes] = await Promise.all([
      readFile(metadataPath, 'utf8').then(JSON.parse),
      readFile(bodyPath),
    ]);
    if (!Number.isInteger(metadata.status) || metadata.status < 200 || metadata.status >= 300) {
      throw new Error(`scrapling_http_${metadata.status || 'unknown'}`);
    }
    if (metadata.byteSize !== bytes.length) throw new Error('Scrapling body size metadata mismatch');
    if (bytes.length > (options.maximumBytes ?? Number.POSITIVE_INFINITY)) {
      throw new Error('Scrapling artifact size outside limits');
    }
    const requested = new URL(requestedUrl).toString();
    const finalUrl = new URL(metadata.finalUrl, requested).toString();
    return {
      finalUrl,
      redirectChain: finalUrl === requested ? [] : [finalUrl],
      contentType: metadata.contentType,
      bytes,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
