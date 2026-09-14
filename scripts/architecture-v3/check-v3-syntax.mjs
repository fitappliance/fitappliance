#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DISCOVERY_DIRECTORIES = Object.freeze([
  'scripts/architecture-v3',
  'tests/architecture-v3',
  'src/domain/architecture-v3',
  'src/shared',
  'public/scripts',
]);

/**
 * @typedef {'pass' | 'path_missing' | 'syntax_error' | 'empty_list_error'} V3SyntaxStatus
 */

/**
 * @typedef {object} V3SyntaxCheckResult
 * @property {V3SyntaxStatus} status
 * @property {readonly string[]} checkedMjsPaths Paths passed to Node --check, in input order.
 * @property {string | null} failedMjsPath The original failed input path, or null for pass/empty.
 */

function result(status, checkedMjsPaths, failedMjsPath) {
  return Object.freeze({
    status,
    checkedMjsPaths: Object.freeze([...checkedMjsPaths]),
    failedMjsPath,
  });
}

async function isRegularFile(path) {
  if (typeof path !== 'string' || path.length === 0) return false;
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
    throw error;
  }
}

async function collectMjsPaths(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const paths = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...await collectMjsPaths(path));
    } else if (entry.isFile() && entry.name.endsWith('.mjs')) {
      paths.push(path);
    }
  }
  return paths;
}

async function discoverV3MjsPaths() {
  const paths = [];
  for (const directory of DISCOVERY_DIRECTORIES) {
    paths.push(...await collectMjsPaths(resolve(REPOSITORY_ROOT, directory)));
  }
  return paths.sort((left, right) => left.localeCompare(right));
}

/**
 * Checks each requested .mjs file with the current Node executable, one process per file.
 *
 * @param {{ explicitMjsPaths?: readonly string[] } = {}} input
 * @returns {Promise<V3SyntaxCheckResult>}
 */
export async function checkV3Syntax({ explicitMjsPaths } = {}) {
  if (!Array.isArray(explicitMjsPaths) || explicitMjsPaths.length === 0) {
    return result('empty_list_error', [], null);
  }

  const checkedMjsPaths = [];
  for (const explicitMjsPath of explicitMjsPaths) {
    if (!await isRegularFile(explicitMjsPath)) {
      return result('path_missing', checkedMjsPaths, typeof explicitMjsPath === 'string' ? explicitMjsPath : null);
    }
    try {
      await execFile(process.execPath, ['--check', '--', explicitMjsPath], {
        shell: false,
        maxBuffer: 20 * 1024 * 1024,
      });
      checkedMjsPaths.push(explicitMjsPath);
    } catch {
      checkedMjsPaths.push(explicitMjsPath);
      return result('syntax_error', checkedMjsPaths, explicitMjsPath);
    }
  }
  return result('pass', checkedMjsPaths, null);
}

function parseCli(args) {
  if (args.length === 0) return null;

  const explicitMjsPaths = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== '--path') throw new TypeError(`unknown argument: ${args[index]}`);
    const explicitMjsPath = args[index + 1];
    if (typeof explicitMjsPath !== 'string' || !explicitMjsPath.endsWith('.mjs')) {
      throw new TypeError('--path requires a .mjs path');
    }
    explicitMjsPaths.push(explicitMjsPath);
    index += 1;
  }
  return explicitMjsPaths;
}

export async function runCli(args = process.argv.slice(2)) {
  const explicitMjsPaths = parseCli(args);
  return checkV3Syntax({
    explicitMjsPaths: explicitMjsPaths ?? await discoverV3MjsPaths(),
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli().then((checkResult) => {
    process.stdout.write(`${JSON.stringify(checkResult, null, 2)}\n`);
    if (checkResult.status !== 'pass') process.exitCode = 1;
  }).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
