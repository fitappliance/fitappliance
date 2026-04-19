'use strict';

const path = require('node:path');
const { mkdir, readdir, readFile, writeFile } = require('node:fs/promises');

const DEFAULT_REPORT_PREFIX = 'doc-drift';

function todayStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

async function exists(filePath) {
  try {
    await readFile(filePath, 'utf8');
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function walk(dirPath) {
  const out = [];
  const entries = await readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walk(fullPath));
      continue;
    }
    out.push(fullPath);
  }
  return out;
}

async function listDefaultTargets(repoRoot) {
  const files = [];
  for (const relative of ['README.md', 'DEVGUIDE.md']) {
    const absolute = path.join(repoRoot, relative);
    if (await exists(absolute)) files.push(relative);
  }

  const docsRoot = path.join(repoRoot, 'docs');
  try {
    const docsFiles = await walk(docsRoot);
    files.push(...docsFiles
      .filter((filePath) => filePath.endsWith('.md'))
      .map((filePath) => path.relative(repoRoot, filePath).replace(/\\/g, '/')));
  } catch (error) {
    if (!(error && error.code === 'ENOENT')) throw error;
  }

  const rootEntries = await readdir(repoRoot, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (!entry.isFile()) continue;
    if (/^PLAN-PHASE.*\.md$/i.test(entry.name) || /^CODEX-PHASE.*-PROMPT\.md$/i.test(entry.name)) {
      files.push(entry.name);
    }
  }

  return [...new Set(files)];
}

function normalizeLinkTarget(rawTarget) {
  const target = String(rawTarget ?? '').trim();
  if (!target) return null;
  if (/^(https?:|mailto:|tel:)/i.test(target)) return null;
  if (target.startsWith('#')) return null;
  const hashIndex = target.indexOf('#');
  return hashIndex === -1 ? target : target.slice(0, hashIndex);
}

function extractBackticks(line) {
  const out = [];
  const matches = line.matchAll(/`([^`]+)`/g);
  for (const match of matches) {
    out.push(match[1]);
  }
  return out;
}

function extractMarkdownLinks(line) {
  const out = [];
  const matches = line.matchAll(/\[[^\]]*]\(([^)]+)\)/g);
  for (const match of matches) {
    out.push(match[1]);
  }
  return out;
}

function pushIssue(issues, issue) {
  issues.push({
    ...issue,
    file: issue.file.replace(/\\/g, '/')
  });
}

async function parseDoc({
  repoRoot,
  relativePath,
  scriptsMap,
  issues
}) {
  const absolutePath = path.join(repoRoot, relativePath);
  const text = await readFile(absolutePath, 'utf8');
  const lines = text.split(/\r?\n/);
  let inShellFence = false;
  let ignoreNextLine = false;

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index];
    const trimmed = line.trim();

    if (/^```(?:bash|sh)\s*$/i.test(trimmed)) {
      inShellFence = true;
      continue;
    }
    if (/^```\s*$/.test(trimmed)) {
      inShellFence = false;
      continue;
    }

    if (line.includes('<!-- doc-audit: ignore -->')) {
      if (/^\s*<!--\s*doc-audit:\s*ignore\s*-->\s*$/.test(line)) {
        ignoreNextLine = true;
      }
      continue;
    }
    if (ignoreNextLine) {
      ignoreNextLine = false;
      continue;
    }

    const contexts = [];
    if (inShellFence) contexts.push(line);
    contexts.push(...extractBackticks(line));

    for (const context of contexts) {
      const npmMatches = context.matchAll(/\bnpm run ([a-zA-Z0-9:_-]+)\b/g);
      for (const match of npmMatches) {
        const scriptName = match[1];
        if (Object.prototype.hasOwnProperty.call(scriptsMap, scriptName)) continue;
        pushIssue(issues, {
          rule: 'missing-npm-script',
          file: relativePath,
          line: lineNumber,
          reference: `npm run ${scriptName}`,
          message: `Referenced npm script "${scriptName}" does not exist in package.json scripts.`
        });
      }

      const nodeMatches = context.matchAll(/\bnode (scripts\/[^\s`]+?\.(?:js|mjs|cjs))\b/g);
      for (const match of nodeMatches) {
        const target = match[1];
        const targetPath = path.join(repoRoot, target);
        if (await exists(targetPath)) continue;
        pushIssue(issues, {
          rule: 'missing-node-script-target',
          file: relativePath,
          line: lineNumber,
          reference: `node ${target}`,
          message: `Referenced Node script "${target}" does not exist.`
        });
      }

      const workflowMatches = context.matchAll(/\bgh workflow run ([^\s`]+\.ya?ml)\b/g);
      for (const match of workflowMatches) {
        const workflowFile = match[1];
        const workflowPath = path.join(repoRoot, '.github', 'workflows', workflowFile);
        if (await exists(workflowPath)) continue;
        pushIssue(issues, {
          rule: 'missing-workflow-target',
          file: relativePath,
          line: lineNumber,
          reference: `gh workflow run ${workflowFile}`,
          message: `Referenced workflow "${workflowFile}" does not exist under .github/workflows/.`
        });
      }

      if (/^(scripts|tests|api)\/[^\s`]+\.(?:js|mjs|cjs)$/.test(context)) {
        if (context.includes('*')) continue;
        const inlinePath = path.join(repoRoot, context);
        if (!await exists(inlinePath)) {
          pushIssue(issues, {
            rule: 'missing-inline-path-target',
            file: relativePath,
            line: lineNumber,
            reference: context,
            message: `Inline path "${context}" does not exist.`
          });
        }
      }
    }

    const links = extractMarkdownLinks(line);
    for (const rawLink of links) {
      const normalized = normalizeLinkTarget(rawLink);
      if (!normalized) continue;
      if (!/[/.]/.test(normalized)) continue;
      let localTarget;
      if (path.isAbsolute(normalized)) {
        if (!normalized.startsWith(repoRoot)) continue;
        localTarget = normalized;
      } else if (normalized.startsWith('/')) {
        localTarget = path.join(repoRoot, normalized.slice(1));
      } else {
        localTarget = path.resolve(path.dirname(absolutePath), normalized);
      }
      if (await exists(localTarget)) continue;
      pushIssue(issues, {
        rule: 'missing-local-link-target',
        file: relativePath,
        line: lineNumber,
        reference: rawLink,
        message: `Markdown link target "${rawLink}" does not resolve to a repository file.`
      });
    }
  }
}

async function auditDocs({
  repoRoot = path.resolve(__dirname, '..'),
  includeFiles = null,
  reportDate = todayStamp(),
  reportPath = path.join(repoRoot, 'reports', `${DEFAULT_REPORT_PREFIX}-${reportDate}.json`),
  writeReport = true,
  logger = console
} = {}) {
  const packageJsonPath = path.join(repoRoot, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const scriptsMap = packageJson?.scripts ?? {};
  const targets = includeFiles ? [...new Set(includeFiles)] : await listDefaultTargets(repoRoot);
  const issues = [];

  for (const relativePath of targets) {
    const fullPath = path.join(repoRoot, relativePath);
    if (!await exists(fullPath)) continue;
    await parseDoc({
      repoRoot,
      relativePath,
      scriptsMap,
      issues
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    scannedFiles: targets,
    issueCount: issues.length,
    issues
  };

  if (writeReport) {
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  if (issues.length > 0) {
    logger.error(`[audit-docs] Found ${issues.length} documentation drift issue(s).`);
  } else {
    logger.log('[audit-docs] No documentation drift detected.');
  }

  return {
    exitCode: issues.length > 0 ? 1 : 0,
    reportPath,
    scannedFiles: targets,
    issues
  };
}

if (require.main === module) {
  auditDocs()
    .then((result) => {
      if (result.exitCode !== 0) process.exitCode = result.exitCode;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = {
  auditDocs,
  listDefaultTargets,
  normalizeLinkTarget
};
