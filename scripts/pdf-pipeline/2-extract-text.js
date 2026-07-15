require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

let testPdfProcessor = null;

function cleanExtractedText(rawText) {
  const lines = String(rawText || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trimEnd());

  const counts = new Map();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      counts.set(trimmed, (counts.get(trimmed) || 0) + 1);
    }
  }

  const cleaned = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\d+$/.test(trimmed)) continue;
    if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(trimmed)) continue;
    if (/copyright|©|all rights reserved|bsh home appliances/i.test(trimmed)) continue;
    if (trimmed.length < 80 && counts.get(trimmed) > 2) continue;
    cleaned.push(line);
  }

  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function persistDerivedJson(storageRoot, artifact, jsonBytes) {
  if (!storageRoot || !artifact?.objectPath || !artifact?.contentSha256) return;
  const bytes = Buffer.from(jsonBytes);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== artifact.contentSha256) throw new Error('MinerU JSON hash mismatch before persistence');
  const expectedPrefix = `evidence/derived/mineru-json/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/`;
  if (path.isAbsolute(artifact.objectPath) || artifact.objectPath.includes('..')
    || !artifact.objectPath.startsWith(expectedPrefix) || !artifact.objectPath.endsWith(`/${hash}.json`)) {
    throw new TypeError('content-addressed MinerU JSON path required');
  }
  const root = path.resolve(storageRoot);
  const target = path.resolve(root, artifact.objectPath);
  if (!target.startsWith(`${root}${path.sep}`)) throw new TypeError('MinerU JSON path escapes storage root');
  try {
    const existing = await fs.promises.readFile(target);
    if (createHash('sha256').update(existing).digest('hex') !== hash) {
      throw new Error('existing MinerU JSON object collision');
    }
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  await fs.promises.writeFile(temporary, bytes);
  await fs.promises.rename(temporary, target);
}

async function extractText(pdfPath, options = {}) {
  const data = fs.readFileSync(pdfPath);
  const processPdf = options.processPdf || testPdfProcessor;
  const storageRoot = options.storageRoot || process.env.FITAPPLIANCE_STORAGE_ROOT;
  let processed;
  if (processPdf) {
    processed = await processPdf(data, { pdfPath });
  } else {
    if (!storageRoot) throw new TypeError('FITAPPLIANCE_STORAGE_ROOT is required for MinerU PDF extraction');
    const { runMineruPdfWithImageFallback } = await import('../../src/domain/mineru-runner.mjs');
    processed = await runMineruPdfWithImageFallback(data, { storageRoot });
  }
  if (!processed?.jsonBytes) throw new Error('MinerU content_list_v2 JSON missing');
  await persistDerivedJson(storageRoot, processed.derivedArtifact, processed.jsonBytes);
  const { inspectMineruContentListV2 } = await import('../../src/domain/mineru-document.mjs');
  const inspection = inspectMineruContentListV2(processed.jsonBytes);
  const text = inspection.pages.map((page) => page.fragments
    .map((fragment) => fragment.rawText)
    .filter(Boolean)
    .join('\n')).join('\f');
  return {
    text: cleanExtractedText(text),
    pageCount: inspection.pageCount,
    info: {
      parser: 'MinerU',
      parserVersion: processed.derivedArtifact?.parserVersion ?? null,
      contentSha256: inspection.contentSha256,
    },
    extractionFormat: 'mineru_content_list_v2',
    parserVersion: processed.derivedArtifact?.parserVersion ?? null,
    derivedArtifact: processed.derivedArtifact ?? null,
  };
}

function setPdfProcessorForTests(processor) {
  if (process.env.FITAPPLIANCE_ALLOW_TEST_PDF_PROCESSOR !== '1') {
    throw new Error('test PDF processor override is disabled');
  }
  if (typeof processor !== 'function') throw new TypeError('test PDF processor must be a function');
  testPdfProcessor = processor;
}

exports.extractText = extractText;
exports.cleanExtractedText = cleanExtractedText;
exports.setPdfProcessorForTests = setPdfProcessorForTests;
