import { execFile as execFileCallback } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

import {
  buildMineruDerivedArtifact,
  findMineruImageOnlyDimensionPages,
} from './mineru-document.mjs';
import { attestMineruToolIdentity } from './mineru-tool-identity.mjs';
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
  if (processing.strategy === 'selected_page_ranges') {
    if (!Array.isArray(processing.ranges) || !processing.ranges.length
      || !Array.isArray(processing.selectedPages) || !processing.selectedPages.length
      || processing.sourcePageCount !== pageCount) {
      throw new Error('MinerU cache integrity failure: selected page processing invalid');
    }
    const selectedPages = [...new Set(processing.selectedPages)].sort((left, right) => left - right);
    if (selectedPages.some((page) => !Number.isInteger(page) || page < 1 || page > pageCount)) {
      throw new Error('MinerU cache integrity failure: selected page map invalid');
    }
    const expectedRanges = [];
    for (const page of selectedPages) {
      const zeroBased = page - 1;
      const last = expectedRanges.at(-1);
      if (last && last[1] + 1 === zeroBased) last[1] = zeroBased;
      else expectedRanges.push([zeroBased, zeroBased]);
    }
    if (JSON.stringify(expectedRanges) !== JSON.stringify(processing.ranges)) {
      throw new Error('MinerU cache integrity failure: selected page ranges invalid');
    }
    return {
      strategy: 'selected_page_ranges',
      ranges: expectedRanges,
      selectedPages,
      sourcePageCount: pageCount,
    };
  }
  const hasOperationalFallback = processing.strategy === 'page_ranges_with_operational_fallback';
  if (!['page_ranges', 'page_ranges_with_operational_fallback'].includes(processing.strategy)
    || !Array.isArray(processing.ranges) || !processing.ranges.length) {
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
  if (hasOperationalFallback) {
    const fallbackPages = [...new Set(processing.fallbackPages ?? [])].sort((left, right) => left - right);
    if (!Array.isArray(processing.fallbackPages) || !fallbackPages.length
      || fallbackPages.length !== processing.fallbackPages.length
      || fallbackPages.some((page) => !Number.isInteger(page) || page < 1 || page > pageCount)) {
      throw new Error('MinerU cache integrity failure: operational fallback page map invalid');
    }
    return { strategy: processing.strategy, ranges, fallbackPages };
  }
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

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function resolveStoragePath(storageRoot, relativePath) {
  const path = resolve(storageRoot, ...String(relativePath ?? '').split('/'));
  if (!path.startsWith(`${storageRoot}${sep}`)) throw new Error('MinerU cache path escaped storage root');
  return path;
}

function resolvedProfile(options = {}) {
  if (!options.profileId) {
    return { ...evidenceSourcePolicy.resolutionPolicy.pdfEvidence, profileId: null, legacyCache: true };
  }
  const profile = evidenceSourcePolicy.resolutionPolicy.pdfEvidenceProfiles
    ?.find((entry) => entry.profileId === options.profileId);
  if (!profile) throw new TypeError(`unsupported MinerU profile: ${options.profileId}`);
  return { ...profile, legacyCache: false };
}

function selectedPageProcessing(options = {}) {
  if (options.selectedPages == null) {
    if (options.sourcePageCount != null) throw new TypeError('source page count requires selected pages');
    return null;
  }
  if (!Array.isArray(options.selectedPages) || options.selectedPages.length === 0
    || !Number.isInteger(options.sourcePageCount) || options.sourcePageCount < 1) {
    throw new TypeError('selected MinerU pages and source page count required');
  }
  const pages = [...new Set(options.selectedPages)].sort((left, right) => left - right);
  if (pages.some((page) => !Number.isInteger(page) || page < 1 || page > options.sourcePageCount)) {
    throw new TypeError('selected MinerU page is outside the source PDF');
  }
  const ranges = [];
  for (const page of pages) {
    const zeroBased = page - 1;
    const last = ranges.at(-1);
    if (last && last[1] + 1 === zeroBased) last[1] = zeroBased;
    else ranges.push([zeroBased, zeroBased]);
  }
  return Object.freeze({
    strategy: 'selected_page_ranges',
    ranges: Object.freeze(ranges.map((range) => Object.freeze(range))),
    selectedPages: Object.freeze(pages),
    sourcePageCount: options.sourcePageCount,
  });
}

function cacheIndexPath(storageRoot, pdfSha256, expected, selected) {
  if (expected.legacyCache && !selected) {
    return join(storageRoot, 'cache', 'mineru-index', `${pdfSha256}.json`);
  }
  const signature = sha256(Buffer.from(JSON.stringify({
    profileId: expected.profileId,
    selectedPages: selected?.selectedPages ?? null,
    sourcePageCount: selected?.sourcePageCount ?? null,
    fallbackTrigger: expected.fallbackTrigger ?? null,
  })));
  return join(
    storageRoot,
    'cache',
    'mineru-index-v2',
    pdfSha256,
    expected.profileId ?? 'pipeline-auto-v1',
    `${signature}.json`,
  );
}

function artifactBuildOptions(pdfSha256, expected, selected, extra = {}) {
  return {
    pdfSha256,
    parserVersion: expected.parserVersion,
    modelRevision: expected.modelRevision,
    ...(expected.profileId ? { profile: expected } : {}),
    ...(selected ? {
      processedPages: [...selected.selectedPages],
      sourcePageCount: selected.sourcePageCount,
    } : {}),
    ...(expected.fallbackTrigger ? { fallbackTrigger: expected.fallbackTrigger } : {}),
    ...extra,
  };
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

async function inspectCache(storageRoot, pdfSha256, expected, selected = null) {
  const indexPath = cacheIndexPath(storageRoot, pdfSha256, expected, selected);
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
  if (index?.schemaVersion !== 1 || index.sourcePdfSha256 !== pdfSha256
    || (expected.profileId && index.profileId !== expected.profileId)) {
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
    replayed = buildMineruDerivedArtifact(
      jsonBytes,
      artifactBuildOptions(pdfSha256, expected, selected),
    );
  } catch (error) {
    throw new Error(`MinerU cache integrity failure: ${error.message}`);
  }
  if (JSON.stringify(replayed) !== JSON.stringify(artifact)) {
    throw new Error('MinerU cache integrity failure: artifact metadata mismatch');
  }
  const processing = normalizedProcessing(index.processing, replayed.pageCount);
  if (processing.strategy === 'page_ranges_with_operational_fallback') {
    const pages = JSON.parse(jsonBytes.toString('utf8'));
    if (processing.fallbackPages.some((page) => !Array.isArray(pages[page - 1]) || pages[page - 1].length)) {
      throw new Error('MinerU cache integrity failure: operational fallback page is not an empty primary gap');
    }
  }
  return {
    status: 'indexed',
    sourcePdfSha256: pdfSha256,
    parserVersion: replayed.parserVersion,
    modelRevision: replayed.modelRevision,
    jsonBytes,
    derivedArtifact: replayed,
    processing,
    ...(processing.fallbackPages ? { operationalFallbackPages: processing.fallbackPages } : {}),
  };
}

async function readCache(storageRoot, pdfSha256, expected, selected = null) {
  const inspection = await inspectCache(storageRoot, pdfSha256, expected, selected);
  if (inspection.status !== 'indexed') return null;
  return {
    jsonBytes: inspection.jsonBytes,
    derivedArtifact: inspection.derivedArtifact,
    processing: inspection.processing,
    ...(inspection.operationalFallbackPages
      ? { operationalFallbackPages: inspection.operationalFallbackPages }
      : {}),
  };
}

async function writeCache(storageRoot, result, expected, selected = null) {
  const artifact = result.derivedArtifact;
  const objectPath = resolveStoragePath(storageRoot, artifact.objectPath);
  await writeImmutable(objectPath, result.jsonBytes, artifact.contentSha256);
  const indexPath = cacheIndexPath(storageRoot, artifact.sourcePdfSha256, expected, selected);
  await mkdir(dirname(indexPath), { recursive: true });
  const temporaryPath = `${indexPath}.${process.pid}.${randomUUID()}.tmp`;
  const index = Buffer.from(`${JSON.stringify({
    schemaVersion: 1,
    sourcePdfSha256: artifact.sourcePdfSha256,
    ...(expected.profileId ? { profileId: expected.profileId } : {}),
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
  const expected = { ...resolvedProfile(options), fallbackTrigger: options.fallbackTrigger ?? null };
  const selected = selectedPageProcessing(options);
  const pdfSha256 = sha256(bytes);
  if (options.cache !== false) {
    const cached = await readCache(storageRoot, pdfSha256, expected, selected);
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
    const toolIdentity = await attestMineruToolIdentity({
      stdout: versionResult?.stdout,
      backend: expected.backend,
      expectedVersion: expected.parserVersion,
      configPath: options.mineruConfigPath
        ?? options.env?.MINERU_TOOLS_CONFIG_JSON
        ?? process.env.MINERU_TOOLS_CONFIG_JSON
        ?? null,
    });
    const version = toolIdentity.version;
    const revision = toolIdentity.modelRevision;
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
        ...(expected.effort ? ['--effort', expected.effort] : []),
        ...(expected.imageAnalysis != null ? ['--image-analysis', String(expected.imageAnalysis)] : []),
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
      buildMineruDerivedArtifact(jsonBytes, artifactBuildOptions(pdfSha256, {
        ...expected,
        parserVersion: version,
        modelRevision: revision,
      }, null, expectedPages ? { pageCount: expectedPages } : {}));
      return jsonBytes;
    };

    let jsonBytes;
    let processing;
    const operationalFallbackPages = [];
    if (selected) {
      const pages = Array.from({ length: selected.sourcePageCount }, () => []);
      for (const range of selected.ranges) {
        const parsed = JSON.parse(await invoke(range));
        if (!Array.isArray(parsed) || parsed.length !== range[1] - range[0] + 1) {
          throw new Error('MinerU selected page range produced an invalid page count');
        }
        parsed.forEach((items, offset) => { pages[range[0] + offset] = items; });
      }
      jsonBytes = Buffer.from(JSON.stringify(pages));
      processing = {
        strategy: 'selected_page_ranges',
        ranges: selected.ranges.map((range) => [...range]),
        selectedPages: [...selected.selectedPages],
        sourcePageCount: selected.sourcePageCount,
      };
    } else try {
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
          if (rangeError?.code !== 'MINERU_COMMAND_FAILED') throw rangeError;
          if (start === end) {
            if (options.operationalImageFallback !== true) throw rangeError;
            operationalFallbackPages.push(start + 1);
            successfulRanges.push([start, end]);
            return [[]];
          }
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
      processing = normalizedProcessing({
        strategy: operationalFallbackPages.length
          ? 'page_ranges_with_operational_fallback'
          : 'page_ranges',
        ranges: successfulRanges,
        ...(operationalFallbackPages.length ? { fallbackPages: operationalFallbackPages } : {}),
      }, pageCount);
    }
    const runtimeProfile = { ...expected, parserVersion: version, modelRevision: revision };
    const derivedArtifact = buildMineruDerivedArtifact(
      jsonBytes,
      artifactBuildOptions(pdfSha256, runtimeProfile, selected),
    );
    const result = {
      jsonBytes,
      derivedArtifact,
      processing,
      ...(operationalFallbackPages.length ? { operationalFallbackPages } : {}),
    };
    if (options.cache !== false) await writeCache(storageRoot, result, expected, selected);
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
  const expected = { ...resolvedProfile(options), fallbackTrigger: options.fallbackTrigger ?? null };
  const selected = selectedPageProcessing(options);
  const inspection = await inspectCache(storageRoot, sha256(bytes), expected, selected);
  const { jsonBytes: _jsonBytes, ...metadata } = inspection;
  return freezeResult(metadata);
}

export async function runMineruPdfWithImageFallback(pdfBytes, options = {}) {
  const {
    profileId: _profileId,
    selectedPages: _selectedPages,
    sourcePageCount: _sourcePageCount,
    fallbackTrigger: _fallbackTrigger,
    operationalImageFallback: _operationalImageFallback,
    ...baseOptions
  } = options;
  const primary = await runMineruPdfToJson(pdfBytes, {
    ...baseOptions,
    operationalImageFallback: true,
  });
  const imagePages = [...findMineruImageOnlyDimensionPages(primary.jsonBytes)];
  const operationalPages = new Set(primary.operationalFallbackPages ?? []);
  const pages = [...new Set([...imagePages, ...operationalPages])]
    .sort((left, right) => left - right);
  if (!pages.length) return { ...primary, usedImageFallback: false };
  const fallbackTrigger = {
    profileId: 'pipeline-auto-v1',
    contentSha256: primary.derivedArtifact.contentSha256,
    objectPath: primary.derivedArtifact.objectPath,
    pages,
    ...(operationalPages.size ? {
      pageReasons: pages.map((page) => operationalPages.has(page) ? {
        page,
        reason: 'operational_page_failure',
        failureCode: 'MINERU_COMMAND_FAILED',
      } : {
        page,
        reason: 'image_dimension_signal',
      }),
    } : {}),
  };
  const hybrid = await runMineruPdfToJson(pdfBytes, {
    ...baseOptions,
    profileId: 'hybrid-image-high-v1',
    selectedPages: pages,
    sourcePageCount: primary.derivedArtifact.pageCount,
    fallbackTrigger,
  });
  let primaryPages;
  let hybridPages;
  try {
    primaryPages = JSON.parse(primary.jsonBytes.toString('utf8'));
    hybridPages = JSON.parse(hybrid.jsonBytes.toString('utf8'));
  } catch {
    throw new Error('MinerU image fallback merge received invalid content_list_v2 JSON');
  }
  const pageCount = primary.derivedArtifact.pageCount;
  if (!Array.isArray(primaryPages) || !Array.isArray(hybridPages)
    || primaryPages.length !== pageCount || hybridPages.length !== pageCount
    || primaryPages.some((page) => !Array.isArray(page))
    || hybridPages.some((page) => !Array.isArray(page))) {
    throw new Error('MinerU image fallback merge page map is incomplete');
  }
  const replacementPages = new Set(pages.map((page) => page - 1));
  const mergedJsonBytes = Buffer.from(JSON.stringify(primaryPages.map((page, index) => (
    replacementPages.has(index) ? hybridPages[index] : page
  ))));
  const selected = selectedPageProcessing({ selectedPages: pages, sourcePageCount: pageCount });
  const expected = {
    ...resolvedProfile({ profileId: 'hybrid-image-high-v1' }),
    fallbackTrigger,
  };
  const merged = {
    jsonBytes: mergedJsonBytes,
    derivedArtifact: buildMineruDerivedArtifact(
      mergedJsonBytes,
      artifactBuildOptions(sha256(Buffer.from(pdfBytes)), expected, selected),
    ),
    processing: hybrid.processing,
  };
  if (options.cache !== false) {
    await writeCache(resolve(options.storageRoot), merged, expected, selected);
  }
  return {
    ...merged,
    usedImageFallback: true,
    primaryDerivedArtifact: primary.derivedArtifact,
    primaryJsonBytes: primary.jsonBytes,
  };
}

function freezeResult(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeResult(child);
  }
  return value;
}
