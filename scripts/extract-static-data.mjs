import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

/*
 * Migration-only utility for Task 1.
 * This script extracts legacy inline JS literals from index.html so they can be
 * written into standalone JSON files during the one-time data migration.
 *
 * It intentionally uses `vm.runInNewContext()` to evaluate trusted literals that
 * already live in this repository. The Node.js vm module is not a security
 * sandbox, so this script must not be reused for untrusted input or for the
 * automated sync pipeline in Task 3.
 */

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, '..');
const indexHtmlPath = path.join(repoRoot, 'index.html');
const dataDir = path.join(repoRoot, 'public', 'data');

export async function extractSourceData(htmlPath = indexHtmlPath) {
  const html = await readFile(htmlPath, 'utf8');

  return {
    products: evaluateLiteral(extractConstLiteral(html, 'PRODUCTS')),
    clearance: evaluateLiteral(extractConstLiteral(html, 'BRAND_CLEARANCE')),
    rebates: evaluateLiteral(extractConstLiteral(html, 'REBATES')),
  };
}

export function buildDocuments(sourceData, lastUpdated = currentDateStamp()) {
  return {
    appliances: {
      schema_version: 2,
      last_updated: lastUpdated,
      products: sourceData.products,
    },
    clearance: {
      schema_version: 1,
      last_updated: lastUpdated,
      rules: sourceData.clearance,
    },
    rebates: {
      schema_version: 1,
      last_updated: lastUpdated,
      rebates: sourceData.rebates,
    },
  };
}

export async function writeDocuments(documents, outputDir = dataDir) {
  await mkdir(outputDir, { recursive: true });

  await Promise.all([
    writeJson(path.join(outputDir, 'appliances.json'), documents.appliances),
    writeJson(path.join(outputDir, 'clearance.json'), documents.clearance),
    writeJson(path.join(outputDir, 'rebates.json'), documents.rebates),
  ]);
}

function currentDateStamp() {
  return new Date().toISOString().slice(0, 10);
}

export function evaluateLiteral(literal) {
  return vm.runInNewContext(`(${literal})`);
}

function writeJson(filePath, value) {
  return writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function extractConstLiteral(source, constName) {
  const declaration = `const ${constName} =`;
  const declarationIndex = source.indexOf(declaration);

  if (declarationIndex === -1) {
    throw new Error(`Unable to find ${constName} in index.html`);
  }

  let cursor = declarationIndex + declaration.length;
  while (/\s/.test(source[cursor])) {
    cursor += 1;
  }

  const openingToken = source[cursor];
  const closingToken = openingToken === '[' ? ']' : openingToken === '{' ? '}' : null;

  if (!closingToken) {
    throw new Error(`Unsupported literal type for ${constName}`);
  }

  const literalStart = cursor;
  let depth = 0;
  let stringQuote = null;
  let inLineComment = false;
  let inBlockComment = false;

  for (; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    const nextCharacter = source[cursor + 1];

    if (inLineComment) {
      if (character === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (character === '*' && nextCharacter === '/') {
        inBlockComment = false;
        cursor += 1;
      }
      continue;
    }

    if (stringQuote) {
      if (character === '\\') {
        cursor += 1;
        continue;
      }

      if (character === stringQuote) {
        stringQuote = null;
      }
      continue;
    }

    if (character === '/' && nextCharacter === '/') {
      inLineComment = true;
      cursor += 1;
      continue;
    }

    if (character === '/' && nextCharacter === '*') {
      inBlockComment = true;
      cursor += 1;
      continue;
    }

    if (character === '\'' || character === '"' || character === '`') {
      stringQuote = character;
      continue;
    }

    if (character === openingToken) {
      depth += 1;
      continue;
    }

    if (character === closingToken) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(literalStart, cursor + 1);
      }
    }
  }

  throw new Error(`Unable to extract literal for ${constName}`);
}

if (scriptPath === process.argv[1]) {
  const sourceData = await extractSourceData();
  const documents = buildDocuments(sourceData);
  await writeDocuments(documents);

  console.log('Created public/data/appliances.json');
  console.log('Created public/data/clearance.json');
  console.log('Created public/data/rebates.json');
}
