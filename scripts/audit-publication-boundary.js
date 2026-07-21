#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { readdir, readFile } = require('node:fs/promises');

const WORKFLOW_EXTENSIONS = new Set(['.yml', '.yaml']);
const RUNTIME_ADD_PATTERN = /\bpublic\/data\b|\bpublic\/(?:sitemap\.xml|service-worker\.js|rss\.xml|image-sitemap\.xml)\b|\bpages\/(?:brands|compare|guides|location|products|cavity|doorway)\b/;

function violation(file, line, rule, message) {
  return { file, line, rule, message };
}

function auditWorkflow(relativePath, text) {
  const lines = text.split(/\r?\n/);
  const violations = [];
  const activeLines = lines.map((line, index) => ({
    line,
    lineNumber: index + 1,
    trimmed: line.trim()
  })).filter(({ trimmed }) => trimmed && !trimmed.startsWith('#'));

  for (const entry of activeLines) {
    if (/\bnpm\s+run\s+sync(?:\s|$)/.test(entry.line)) {
      violations.push(violation(
        relativePath,
        entry.lineNumber,
        'legacy-runtime-sync',
        'Legacy sync writes released runtime data outside the Architecture V2 publication path.'
      ));
    }

    if (/\bgit\s+push\s*$/.test(entry.trimmed)
      || /\bgit\s+push\b.*(?:\borigin\s+main\b|refs\/heads\/main\b|HEAD:main\b)/.test(entry.line)) {
      violations.push(violation(
        relativePath,
        entry.lineNumber,
        'direct-default-branch-push',
        'Generated changes must be pushed to an automation branch and reviewed in a pull request.'
      ));
    }
  }

  const runtimeAdd = activeLines.find(({ line }) => (
    /\bgit\s+add\s+-A\b/.test(line)
    || (/\bgit\s+add\b/.test(line) && RUNTIME_ADD_PATTERN.test(line))
  ));

  if (!runtimeAdd) return violations;

  const hasCanonicalBuild = activeLines.some(({ line }) => /\bnpm\s+run\s+build(?:\s|$)/.test(line));
  const prCreation = activeLines.find(({ line }) => (
    /\bgh\s+pr\s+create\b/.test(line)
    || /\bcreate-pull-request\b/.test(line)
    || /\bnpm\s+run\s+open-[a-z0-9-]*pr\b/i.test(line)
  ));
  const validationDispatch = activeLines.find(({ line }) => (
    /\bgh\s+workflow\s+run\s+pr-validation\.yml\b/.test(line)
  ));
  const hasPrPermission = activeLines.some(({ line }) => /^\s*pull-requests:\s*write\s*$/.test(line));
  const hasActionsPermission = activeLines.some(({ line }) => /^\s*actions:\s*write\s*$/.test(line));

  if (!prCreation) {
    violations.push(violation(
      relativePath,
      runtimeAdd.lineNumber,
      'runtime-update-without-pr',
      'A workflow that commits runtime output must open a pull request.'
    ));
  }
  if (!hasCanonicalBuild) {
    violations.push(violation(
      relativePath,
      runtimeAdd.lineNumber,
      'runtime-update-without-canonical-build',
      'A workflow that commits runtime output must run the canonical npm build first.'
    ));
  }
  if (!hasPrPermission) {
    violations.push(violation(
      relativePath,
      runtimeAdd.lineNumber,
      'missing-pull-request-permission',
      'A workflow that opens a publication PR requires pull-requests: write.'
    ));
  }
  if (prCreation && (!validationDispatch || validationDispatch.lineNumber <= prCreation.lineNumber)) {
    violations.push(violation(
      relativePath,
      prCreation.lineNumber,
      'missing-validation-dispatch',
      'A bot-created publication PR must explicitly dispatch pr-validation.yml after opening the PR.'
    ));
  }
  if (prCreation && !hasActionsPermission) {
    violations.push(violation(
      relativePath,
      prCreation.lineNumber,
      'missing-actions-permission',
      'Explicit publication validation requires actions: write.'
    ));
  }

  return violations;
}

async function auditPublicationBoundary({ repoRoot = path.resolve(__dirname, '..'), logger = console } = {}) {
  const workflowRoot = path.join(repoRoot, '.github', 'workflows');
  const workflowNames = (await readdir(workflowRoot))
    .filter((name) => WORKFLOW_EXTENSIONS.has(path.extname(name)))
    .sort();
  const violations = [];

  for (const workflowName of workflowNames) {
    const relativePath = path.posix.join('.github', 'workflows', workflowName);
    const text = await readFile(path.join(workflowRoot, workflowName), 'utf8');
    violations.push(...auditWorkflow(relativePath, text));
  }

  if (violations.length > 0) {
    for (const row of violations) {
      logger.error(`${row.file}:${row.line} [${row.rule}] ${row.message}`);
    }
  } else {
    logger.log(`[publication-boundary] checked ${workflowNames.length} workflows; no violations`);
  }

  return {
    checkedFiles: workflowNames.length,
    violations,
    exitCode: violations.length > 0 ? 1 : 0
  };
}

async function runCli() {
  try {
    const result = await auditPublicationBoundary();
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(`[publication-boundary] ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  auditPublicationBoundary,
  auditWorkflow
};
