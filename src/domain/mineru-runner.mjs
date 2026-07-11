import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { buildMineruDerivedArtifact } from './mineru-document.mjs';
import { evidenceSourcePolicy } from './evidence-source-verifier.mjs';

const execFile = promisify(execFileCallback);
const MAX_OUTPUT_FILES = 20000;
const DEFAULT_MAXIMUM_PDF_BYTES = 100 * 1024 * 1024;

async function defaultRunCommand(binary, args, options) {
  return execFile(binary, args, options);
}

async function findContentListV2Files(root) {
  const matches = [];
  let visited = 0;
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      visited += 1;
      if (visited > MAX_OUTPUT_FILES) throw new Error('MinerU output file limit exceeded');
      if (entry.isSymbolicLink()) throw new Error('MinerU output symlink rejected');
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith('_content_list_v2.json')) matches.push(path);
    }
  }
  await walk(root);
  return matches.sort();
}

function validatePdfPayload(pdfBytes, maximumPdfBytes) {
  const bytes = Buffer.from(pdfBytes ?? []);
  if (!bytes.length || !bytes.subarray(0, 16).toString('utf8').trimStart().startsWith('%PDF-')) {
    throw new TypeError('valid PDF payload required');
  }
  if (!Number.isSafeInteger(maximumPdfBytes) || maximumPdfBytes < 1) {
    throw new TypeError('maximum PDF byte limit must be a positive safe integer');
  }
  if (bytes.length > maximumPdfBytes) {
    throw new RangeError(`PDF payload exceeds ${maximumPdfBytes} bytes`);
  }
  return bytes;
}

function parserVersion(stdout) {
  const match = /\bversion\s+(\d+\.\d+\.\d+)\b/i.exec(String(stdout ?? ''));
  if (!match) throw new Error('MinerU version output invalid');
  return match[1];
}

function modelRevision(stdout) {
  const marker = /\bfitappliance-model-revision\s+([a-f0-9]{40})\b/i.exec(String(stdout ?? ''))?.[1];
  const revision = String(marker ?? '').toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('MinerU model revision is not attested');
  return revision;
}

export async function runMineruPdfToJson(pdfBytes, options = {}) {
  const bytes = validatePdfPayload(
    pdfBytes,
    options.maximumPdfBytes ?? DEFAULT_MAXIMUM_PDF_BYTES,
  );
  if (!options.storageRoot) throw new TypeError('storage root required for MinerU work files');
  const storageRoot = resolve(options.storageRoot);
  const workRoot = join(storageRoot, 'cache', 'work', 'mineru');
  await mkdir(workRoot, { recursive: true });
  const workDirectory = await mkdtemp(join(workRoot, 'parse-'));
  const inputPath = join(workDirectory, 'source.pdf');
  const outputPath = join(workDirectory, 'output');
  const mineruBinary = options.mineruBinary ?? process.env.FITAPPLIANCE_MINERU_BIN ?? 'mineru';
  const runCommand = options.runCommand ?? defaultRunCommand;
  const expected = evidenceSourcePolicy.resolutionPolicy.pdfEvidence;
  try {
    await writeFile(inputPath, bytes);
    await mkdir(outputPath, { recursive: true });
    const versionResult = await runCommand(mineruBinary, ['-v'], {
      env: { ...process.env, ...options.env },
      timeout: options.timeoutMs ?? 600000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const version = parserVersion(versionResult?.stdout);
    if (version !== expected.parserVersion) {
      throw new Error(`MinerU version ${version} does not match policy ${expected.parserVersion}`);
    }
    const revision = modelRevision(versionResult?.stdout);
    if (revision !== expected.modelRevision) {
      throw new Error(`MinerU model revision ${revision} does not match policy ${expected.modelRevision}`);
    }
    await runCommand(mineruBinary, [
      '-p', inputPath,
      '-o', outputPath,
      '-b', expected.backend,
      '-m', expected.method,
      '-f', 'false',
      '-t', 'true',
    ], {
      env: {
        ...process.env,
        ...options.env,
        MINERU_MODEL_SOURCE: 'local',
        MINERU_FORMULA_ENABLE: 'false',
        MINERU_TABLE_ENABLE: 'true',
      },
      timeout: options.timeoutMs ?? 600000,
      maxBuffer: 16 * 1024 * 1024,
    });
    const outputs = await findContentListV2Files(outputPath);
    if (outputs.length !== 1) {
      throw new Error(`MinerU must produce exactly one content_list_v2 JSON; found ${outputs.length}`);
    }
    if (basename(outputs[0]).startsWith('.')) throw new Error('hidden MinerU output rejected');
    const jsonBytes = await readFile(outputs[0]);
    const pdfSha256 = createHash('sha256').update(bytes).digest('hex');
    const derivedArtifact = buildMineruDerivedArtifact(jsonBytes, {
      pdfSha256,
      parserVersion: version,
      modelRevision: revision,
    });
    return { jsonBytes, derivedArtifact };
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}
