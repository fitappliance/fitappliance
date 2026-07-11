#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { isAbsolute, resolve, sep } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveArchitectureV2Path } from '../../src/domain/architecture-v2-paths.mjs';
import { validateResolutionObjectPath } from '../../src/domain/evidence-resolution-loop.mjs';
import { verifyAttestedResolutionArtifact } from '../../src/domain/evidence-artifact-verifier.mjs';
import { load } from 'cheerio';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const execFile = promisify(execFileCallback);

function resolveWithin(root, relativePath) {
  if (isAbsolute(relativePath)) throw new TypeError('absolute evidence object path rejected');
  const normalizedRoot = resolve(root);
  const candidate = resolve(normalizedRoot, relativePath);
  if (!candidate.startsWith(`${normalizedRoot}${sep}`)) throw new TypeError('evidence object path escapes storage root');
  return candidate;
}

async function main(args) {
  const rootIndex = args.indexOf('--storage-root');
  const storageRoot = rootIndex >= 0 ? args[rootIndex + 1] : process.env.FITAPPLIANCE_STORAGE_ROOT;
  if (!storageRoot) throw new TypeError('storage root required');
  const input = JSON.parse(await readFile(resolveArchitectureV2Path(repoRoot, 'evidenceResolutionInput'), 'utf8'));
  let checked = 0;
  for (const caseRecord of input.cases) {
    for (const source of caseRecord.sources ?? []) {
      const relativePath = validateResolutionObjectPath(source.objectPath, source.contentSha256);
      const objectPath = resolveWithin(storageRoot, relativePath);
      const bytes = await readFile(objectPath);
      const actual = createHash('sha256').update(bytes).digest('hex');
      if (actual !== source.contentSha256) throw new Error(`resolution object hash mismatch: ${caseRecord.id}`);
      let extractedText;
      if (relativePath.toLowerCase().endsWith('.html')) {
        extractedText = load(bytes.toString('utf8')).text();
      } else if (relativePath.toLowerCase().endsWith('.pdf')) {
        ({ stdout: extractedText } = await execFile('pdftotext', ['-layout', objectPath, '-']));
      } else {
        extractedText = bytes.toString('utf8');
      }
      verifyAttestedResolutionArtifact({
        source,
        caseIdentity: { brand: caseRecord.brand, model: caseRecord.model, category: caseRecord.category },
        bytes,
        extractedText,
      });
      checked += 1;
    }
  }
  process.stdout.write(`${JSON.stringify({ checked, failures: 0 })}\n`);
}

await main(process.argv.slice(2));
