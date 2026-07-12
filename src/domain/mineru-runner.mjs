import { execFile as execFileCallback } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

import { buildMineruDerivedArtifact } from './mineru-document.mjs';
import { evidenceSourcePolicy } from './evidence-source-verifier.mjs';

const execFile = promisify(execFileCallback);
const MAX_OUTPUT_FILES = 20000;
const DEFAULT_MAXIMUM_PDF_BYTES = 100 * 1024 * 1024;
const DEFAULT_CHUNK_PAGE_COUNT = 20;

async function defaultRunCommand(binary, args, options) {
  return execFile(binary, args, options);
}

function mineruReportedPageCount(error) {
  const counts = [...String(error?.message ?? error).matchAll(/\b(\d+)\s+pages?\s+total\b/gi)]
    .map((match) => Number(match[1]));
  const unique = [...new Set(counts.filter((value) => Number.isSafeInteger(value) && value > 0))];
  if (unique.length !== 1) {
    throw new Error('MinerU command failed before reporting an unambiguous page count', { cause: error });
  }
  return unique[0];
}

function normalizedProcessing(value, pageCount) {
  const processing = value ?? { strategy: 'whole_document' };
  if (processing.strategy === 'whole_document') return { strategy: 'whole_document' };
  if (processing.strategy !== 'page_ranges' || !Array.isArray(processing.ranges) || !processing.ranges.length) {
    throw new Error('MinerU cache integrity failure: processing strategy invalid');
  }
  let expectedStart = 0;
  const ranges = processing.ranges.map((range) => {
    if (!Array.isArray(range) || range.length !== 2
      || !Number.isSafeInteger(range[0]) || !Number.isSafeInteger(range[1])
      || range[0] !== expectedStart || range[1] < range[0] || range[1] >= pageCount) {
      throw new Error('MinerU cache integrity failure: page ranges invalid');
    }
    expectedStart = range[1] + 1;
    return [range[0], range[1]];
  });
  if (expectedStart !== pageCount) throw new Error('MinerU cache integrity failure: page ranges incomplete');
  return { strategy: 'page_ranges', ranges };
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

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function resolveStoragePath(storageRoot, relativePath) {
  const path = resolve(storageRoot, ...String(relativePath ?? '').split('/'));
  if (!path.startsWith(`${storageRoot}${sep}`)) throw new Error('MinerU cache path escaped storage root');
  return path;
}

async function writeImmutable(path, bytes, expectedHash) {
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, bytes, { flag: 'wx' });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const existing = await readFile(path);
    if (sha256(existing) !== expectedHash) throw new Error('MinerU cache integrity failure: object collision');
  }
}

async function inspectCache(storageRoot, pdfSha256, expected) {
  const indexPath = join(storageRoot, 'cache', 'mineru-index', `${pdfSha256}.json`);
  let indexBytes;
  try {
    indexBytes = await readFile(indexPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return { status: 'missing', sourcePdfSha256: pdfSha256 };
    throw error;
  }
  if (indexBytes.length > 64 * 1024) throw new Error('MinerU cache integrity failure: index too large');
  let index;
  try { index = JSON.parse(indexBytes); } catch { throw new Error('MinerU cache integrity failure: invalid index'); }
  if (index?.schemaVersion !== 1 || index.sourcePdfSha256 !== pdfSha256) {
    throw new Error('MinerU cache integrity failure: PDF binding mismatch');
  }
  const artifact = index.derivedArtifact;
  if (!artifact || artifact.sourcePdfSha256 !== pdfSha256) {
    throw new Error('MinerU cache integrity failure: artifact binding mismatch');
  }
  if (index.parserVersion !== expected.parserVersion || index.modelRevision !== expected.modelRevision) {
    return {
      status: 'stale',
      sourcePdfSha256: pdfSha256,
      parserVersion: index.parserVersion ?? null,
      modelRevision: index.modelRevision ?? null,
    };
  }
  let jsonBytes;
  try {
    jsonBytes = await readFile(resolveStoragePath(storageRoot, artifact.objectPath));
  } catch (error) {
    if (error?.code === 'ENOENT') return { status: 'missing', sourcePdfSha256: pdfSha256 };
    throw error;
  }
  let replayed;
  try {
    replayed = buildMineruDerivedArtifact(jsonBytes, {
      pdfSha256,
      parserVersion: expected.parserVersion,
      modelRevision: expected.modelRevision,
    });
  } catch (error) {
    throw new Error(`MinerU cache integrity failure: ${error.message}`);
  }
  if (JSON.stringify(replayed) !== JSON.stringify(artifact)) {
    throw new Error('MinerU cache integrity failure: artifact metadata mismatch');
  }
  const processing = normalizedProcessing(index.processing, replayed.pageCount);
  return {
    status: 'indexed',
    sourcePdfSha256: pdfSha256,
    parserVersion: replayed.parserVersion,
    modelRevision: replayed.modelRevision,
    jsonBytes,
    derivedArtifact: replayed,
    processing,
  };
}

async function readCache(storageRoot, pdfSha256, expected) {
  const inspection = await inspectCache(storageRoot, pdfSha256, expected);
  if (inspection.status !== 'indexed') return null;
  return {
    jsonBytes: inspection.jsonBytes,
    derivedArtifact: inspection.derivedArtifact,
    processing: inspection.processing,
  };
}

async function writeCache(storageRoot, result) {
  const artifact = result.derivedArtifact;
  const objectPath = resolveStoragePath(storageRoot, artifact.objectPath);
  await writeImmutable(objectPath, result.jsonBytes, artifact.contentSha256);
  const indexPath = join(storageRoot, 'cache', 'mineru-index', `${artifact.sourcePdfSha256}.json`);
  await mkdir(dirname(indexPath), { recursive: true });
  const temporaryPath = `${indexPath}.${process.pid}.${randomUUID()}.tmp`;
  const index = Buffer.from(`${JSON.stringify({
    schemaVersion: 1,
    sourcePdfSha256: artifact.sourcePdfSha256,
    parserVersion: artifact.parserVersion,
    modelRevision: artifact.modelRevision,
    derivedArtifact: artifact,
    processing: result.processing,
  }, null, 2)}\n`);
  await writeFile(temporaryPath, index, { flag: 'wx' });
  await rename(temporaryPath, indexPath);
}

export async function runMineruPdfToJson(pdfBytes, options = {}) {
  const bytes = validatePdfPayload(
    pdfBytes,
    options.maximumPdfBytes ?? DEFAULT_MAXIMUM_PDF_BYTES,
  );
  if (!options.storageRoot) throw new TypeError('storage root required for MinerU work files');
  const storageRoot = resolve(options.storageRoot);
  const expected = evidenceSourcePolicy.resolutionPolicy.pdfEvidence;
  const pdfSha256 = sha256(bytes);
  if (options.cache !== false) {
    const cached = await readCache(storageRoot, pdfSha256, expected);
    if (cached) return cached;
  }
  const workRoot = join(storageRoot, 'cache', 'work', 'mineru');
  await mkdir(workRoot, { recursive: true });
  const workDirectory = await mkdtemp(join(workRoot, 'parse-'));
  const inputPath = join(workDirectory, 'source.pdf');
  const outputRoot = join(workDirectory, 'output');
  const mineruBinary = options.mineruBinary ?? process.env.FITAPPLIANCE_MINERU_BIN ?? 'mineru';
  const runCommand = options.runCommand ?? defaultRunCommand;
  try {
    await writeFile(inputPath, bytes);
    await mkdir(outputRoot, { recursive: true });
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
    const commandOptions = {
      env: {
        ...process.env,
        ...options.env,
        MINERU_MODEL_SOURCE: 'local',
        MINERU_FORMULA_ENABLE: 'false',
        MINERU_TABLE_ENABLE: 'true',
      },
      timeout: options.timeoutMs ?? 600000,
      maxBuffer: 16 * 1024 * 1024,
    };
    const invoke = async (range = null) => {
      const rangeLabel = range ? `range-${range[0]}-${range[1]}` : 'whole-document';
      const outputPath = join(outputRoot, rangeLabel);
      await mkdir(outputPath, { recursive: true });
      const args = [
        '-p', inputPath,
        '-o', outputPath,
        '-b', expected.backend,
        '-m', expected.method,
        '-f', 'false',
        '-t', 'true',
        ...(range ? ['-s', String(range[0]), '-e', String(range[1])] : []),
      ];
      try {
        await runCommand(mineruBinary, args, commandOptions);
      } catch (error) {
        const commandError = new Error(String(error?.message ?? error), { cause: error });
        commandError.code = 'MINERU_COMMAND_FAILED';
        throw commandError;
      }
      const outputs = await findContentListV2Files(outputPath);
      if (outputs.length !== 1) {
        throw new Error(`MinerU must produce exactly one content_list_v2 JSON; found ${outputs.length}`);
      }
      if (basename(outputs[0]).startsWith('.')) throw new Error('hidden MinerU output rejected');
      const jsonBytes = await readFile(outputs[0]);
      const expectedPages = range ? range[1] - range[0] + 1 : null;
      buildMineruDerivedArtifact(jsonBytes, {
        pdfSha256,
        parserVersion: version,
        modelRevision: revision,
        ...(expectedPages ? { pageCount: expectedPages } : {}),
      });
      return jsonBytes;
    };

    let jsonBytes;
    let processing;
    try {
      jsonBytes = await invoke();
      processing = { strategy: 'whole_document' };
    } catch (error) {
      if (error?.code !== 'MINERU_COMMAND_FAILED' || options.pageRangeFallback === false) throw error;
      const pageCount = options.getPageCount
        ? await options.getPageCount(bytes)
        : mineruReportedPageCount(error);
      if (!Number.isSafeInteger(pageCount) || pageCount < 1) throw new Error('PDF page count invalid');
      const chunkPageCount = options.chunkPageCount ?? DEFAULT_CHUNK_PAGE_COUNT;
      if (!Number.isSafeInteger(chunkPageCount) || chunkPageCount < 1 || chunkPageCount > 100) {
        throw new TypeError('MinerU chunk page count must be between 1 and 100');
      }
      const successfulRanges = [];
      const parseRange = async (start, end) => {
        try {
          const rangeBytes = await invoke([start, end]);
          successfulRanges.push([start, end]);
          return JSON.parse(rangeBytes);
        } catch (rangeError) {
          if (rangeError?.code !== 'MINERU_COMMAND_FAILED' || start === end) throw rangeError;
          const middle = Math.floor((start + end) / 2);
          return [
            ...await parseRange(start, middle),
            ...await parseRange(middle + 1, end),
          ];
        }
      };
      const pages = [];
      for (let start = 0; start < pageCount; start += chunkPageCount) {
        pages.push(...await parseRange(start, Math.min(pageCount - 1, start + chunkPageCount - 1)));
      }
      if (pages.length !== pageCount) throw new Error('MinerU page-range fallback produced incomplete pages');
      successfulRanges.sort((left, right) => left[0] - right[0]);
      jsonBytes = Buffer.from(JSON.stringify(pages));
      processing = normalizedProcessing({ strategy: 'page_ranges', ranges: successfulRanges }, pageCount);
    }
    const derivedArtifact = buildMineruDerivedArtifact(jsonBytes, {
      pdfSha256,
      parserVersion: version,
      modelRevision: revision,
    });
    const result = { jsonBytes, derivedArtifact, processing };
    if (options.cache !== false) await writeCache(storageRoot, result);
    return result;
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}

export async function inspectMineruPdfCache(pdfBytes, options = {}) {
  const bytes = validatePdfPayload(
    pdfBytes,
    options.maximumPdfBytes ?? DEFAULT_MAXIMUM_PDF_BYTES,
  );
  if (!options.storageRoot) throw new TypeError('storage root required for MinerU cache inspection');
  const storageRoot = resolve(options.storageRoot);
  const expected = evidenceSourcePolicy.resolutionPolicy.pdfEvidence;
  const inspection = await inspectCache(storageRoot, sha256(bytes), expected);
  const { jsonBytes: _jsonBytes, ...metadata } = inspection;
  return freezeResult(metadata);
}

function freezeResult(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeResult(child);
  }
  return value;
}
