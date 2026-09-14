#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const OUTPUT_DIRECTORY = '.site-public';
const STAGE_PREFIX = '.site-public-stage-';
const BACKUP_PREFIX = '.site-public-backup-';
const ROOT_PUBLIC_FILES = [
  'index.html',
  'google32758d7798f4a670.html',
  'google5keGnUyvuq31_mxZ9pNVPIsh7BzKBbM7aHdxUTZZDJM.html'
];
const PUBLIC_DIRECTORIES = ['public', 'pages'];

function deploymentError(message) {
  return new Error(`[public-deployment] ${message}`);
}

function lstatOrNull(targetPath) {
  try {
    return fs.lstatSync(targetPath);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function assertRepositoryRoot(repoRoot) {
  if (typeof repoRoot !== 'string' || repoRoot.trim() === '') {
    throw deploymentError('repoRoot must be a non-empty path');
  }

  const resolvedRoot = path.resolve(repoRoot);
  const stats = lstatOrNull(resolvedRoot);
  if (!stats) throw deploymentError(`repository root does not exist: ${resolvedRoot}`);
  if (stats.isSymbolicLink()) throw deploymentError('repository root must not be a symbolic link');
  if (!stats.isDirectory()) throw deploymentError(`repository root is not a directory: ${resolvedRoot}`);
  const physicalRoot = fs.realpathSync.native(resolvedRoot);
  if (physicalRoot !== resolvedRoot) {
    throw deploymentError('repository root or an ancestor must not be a symbolic link');
  }
  return physicalRoot;
}

function assertGeneratedChild(repoRoot, targetPath, label) {
  const relativePath = path.relative(repoRoot, targetPath);
  if (path.dirname(relativePath) !== '.' || !relativePath || path.isAbsolute(relativePath)) {
    throw deploymentError(`${label} must be a direct generated child of the repository root`);
  }
}

function assertSafeOutputPath(repoRoot, outputPath) {
  assertGeneratedChild(repoRoot, outputPath, 'output directory');
  if (path.basename(outputPath) !== OUTPUT_DIRECTORY) {
    throw deploymentError(`output directory must be ${OUTPUT_DIRECTORY}`);
  }

  const stats = lstatOrNull(outputPath);
  if (!stats) return;
  if (stats.isSymbolicLink()) throw deploymentError('output directory must not be a symbolic link');
  if (!stats.isDirectory()) throw deploymentError('output path must be a directory when it already exists');
}

function assertSourceFile(sourcePath, relativePath) {
  const stats = lstatOrNull(sourcePath);
  if (!stats) throw deploymentError(`required public file is missing: ${relativePath}`);
  if (stats.isSymbolicLink()) throw deploymentError(`symbolic link is not allowed in public sources: ${relativePath}`);
  if (!stats.isFile()) throw deploymentError(`required public source is not a regular file: ${relativePath}`);
}

function assertSourceDirectory(sourcePath, relativePath) {
  const stats = lstatOrNull(sourcePath);
  if (!stats) throw deploymentError(`required public directory is missing: ${relativePath}`);
  if (stats.isSymbolicLink()) throw deploymentError(`symbolic link is not allowed in public sources: ${relativePath}`);
  if (!stats.isDirectory()) throw deploymentError(`required public source is not a directory: ${relativePath}`);
}

function copyRegularFile(sourcePath, destinationPath, relativePath, files) {
  assertSourceFile(sourcePath, relativePath);
  const bytes = fs.readFileSync(sourcePath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.writeFileSync(destinationPath, bytes);
  files.push({
    relativePath,
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex')
  });
}

function copyPublicDirectory(sourceRoot, destinationRoot, relativePath, files) {
  assertSourceDirectory(sourceRoot, relativePath);

  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const childRelativePath = path.posix.join(relativePath, entry.name);
    const sourcePath = path.join(sourceRoot, entry.name);
    const destinationPath = path.join(destinationRoot, entry.name);
    const stats = fs.lstatSync(sourcePath);

    if (entry.name.startsWith('.')) {
      throw deploymentError(`hidden entry is not allowed in public sources: ${childRelativePath}`);
    }
    if (stats.isSymbolicLink()) {
      throw deploymentError(`symbolic link is not allowed in public sources: ${childRelativePath}`);
    }
    if (stats.isDirectory()) {
      copyPublicDirectory(sourcePath, destinationPath, childRelativePath, files);
    } else if (stats.isFile()) {
      copyRegularFile(sourcePath, destinationPath, childRelativePath, files);
    } else {
      throw deploymentError(`special file is not allowed in public sources: ${childRelativePath}`);
    }
  }
}

function removeGeneratedDirectory(repoRoot, targetPath, label) {
  assertGeneratedChild(repoRoot, targetPath, label);
  const stats = lstatOrNull(targetPath);
  if (!stats) return;
  if (stats.isSymbolicLink()) throw deploymentError(`${label} must not be a symbolic link`);
  if (!stats.isDirectory()) throw deploymentError(`${label} must be a directory`);
  fs.rmSync(targetPath, { recursive: true, force: false });
}

function generatedSibling(repoRoot, prefix, label) {
  const targetPath = fs.mkdtempSync(path.join(repoRoot, prefix));
  assertGeneratedChild(repoRoot, targetPath, label);
  const stats = fs.lstatSync(targetPath);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw deploymentError(`${label} must be a regular directory`);
  }
  return targetPath;
}

function replaceOutput(repoRoot, stagedPath, outputPath) {
  assertSafeOutputPath(repoRoot, outputPath);
  let backupPath = null;

  if (lstatOrNull(outputPath)) {
    backupPath = generatedSibling(repoRoot, BACKUP_PREFIX, 'output backup');
    removeGeneratedDirectory(repoRoot, backupPath, 'output backup');
    fs.renameSync(outputPath, backupPath);
  }

  try {
    fs.renameSync(stagedPath, outputPath);
  } catch (error) {
    if (backupPath) {
      try {
        fs.renameSync(backupPath, outputPath);
      } catch (restoreError) {
        throw deploymentError(`failed to replace output and restore prior output: ${restoreError.message}`);
      }
    }
    throw error;
  }

  if (backupPath) removeGeneratedDirectory(repoRoot, backupPath, 'output backup');
}

function artifactSummary(files) {
  const sortedFiles = [...files].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const manifest = sortedFiles.map((file) => `${file.relativePath}\0${file.sha256}`).join('\n');
  return {
    files: sortedFiles,
    fileCount: sortedFiles.length,
    totalBytes: sortedFiles.reduce((total, file) => total + file.bytes, 0),
    artifactSha256: crypto.createHash('sha256').update(manifest).digest('hex')
  };
}

function buildPublicDeployment({ repoRoot = path.resolve(__dirname, '..') } = {}) {
  const root = assertRepositoryRoot(repoRoot);
  const outputPath = path.join(root, OUTPUT_DIRECTORY);
  assertSafeOutputPath(root, outputPath);

  let stagedPath;
  try {
    stagedPath = generatedSibling(root, STAGE_PREFIX, 'staged output');
    const files = [];

    for (const filename of ROOT_PUBLIC_FILES) {
      copyRegularFile(path.join(root, filename), path.join(stagedPath, filename), filename, files);
    }
    for (const directory of PUBLIC_DIRECTORIES) {
      copyPublicDirectory(path.join(root, directory), path.join(stagedPath, directory), directory, files);
    }

    const summary = artifactSummary(files);
    replaceOutput(root, stagedPath, outputPath);
    stagedPath = null;
    return { outputPath, ...summary };
  } finally {
    if (stagedPath) removeGeneratedDirectory(root, stagedPath, 'staged output');
  }
}

function runCli() {
  try {
    const result = buildPublicDeployment();
    process.stdout.write(
      `[public-deployment] ${result.fileCount} files, ${result.totalBytes} bytes, ${result.artifactSha256}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  buildPublicDeployment
};
