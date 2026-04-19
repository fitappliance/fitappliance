'use strict';

const path = require('node:path');
const { mkdir, readdir, readFile, writeFile } = require('node:fs/promises');

const DEFAULT_INCLUDE_ROOTS = ['tests', 'scripts', 'public', 'api', '.github/workflows'];
const SCANNED_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.html',
  '.css',
  '.yml',
  '.yaml'
]);

const DEFAULT_WHITELIST = [
  {
    filePattern: /^tests\/portability\.test\.mjs$/,
    rule: 'absolute-path',
    linePattern: /\/Users\/demo\/secret/,
    reason: 'Intentional fixture string used to assert the absolute-path detector.'
  },
  {
    filePattern: /^tests\/portability\.test\.mjs$/,
    rule: 'localhost-url',
    linePattern: /localhost:4173/,
    reason: 'Intentional fixture string used to assert localhost URL detection and whitelist behaviour.'
  },
  {
    filePattern: /^\.github\/workflows\/data-sync\.yml$/,
    rule: 'hardcoded-main-branch',
    linePattern: /\bgit push origin main\b/,
    reason: 'Production data sync intentionally publishes generated data to the canonical main branch.'
  },
  {
    filePattern: /^\.github\/workflows\/validate-videos\.yml$/,
    rule: 'hardcoded-main-branch',
    linePattern: /\bgit push origin main\b/,
    reason: 'Video validation workflow must commit refreshed schema metadata back to the canonical main branch.'
  },
  {
    filePattern: /^\.github\/workflows\/weekly-growth\.yml$/,
    rule: 'hardcoded-main-branch',
    linePattern: /\bgit push origin main\b/,
    reason: 'Weekly growth automation intentionally pushes generated reports to the canonical main branch.'
  }
];

const PORTABILITY_RULES = [
  {
    id: 'absolute-path',
    severity: 'error',
    test: (line) => /(?:^|[("'`\s])(?:\/Users\/|\/home\/|C:\\\\)/.test(line),
    message: 'Absolute OS-specific filesystem path detected.'
  },
  {
    id: 'localhost-url',
    severity: 'error',
    test: (line) => /\b(?:localhost|127\.0\.0\.1):\d+\b/.test(line),
    message: 'Hardcoded localhost URL with fixed port detected.'
  },
  {
    id: 'home-dir-api',
    severity: 'error',
    test: (line, ctx) => ctx.relativePath.startsWith('scripts/')
      && /(process\.env\.HOME|os\.homedir\(\))/.test(line),
    message: 'HOME directory API usage detected in scripts/ (non-portable).'
  },
  {
    id: 'hardcoded-main-branch',
    severity: 'error',
    test: (line) => /\b(origin main|refs\/heads\/main)\b/.test(line),
    message: 'Hardcoded main branch reference detected.'
  },
  {
    id: 'date-constructor-timezone',
    severity: 'warn',
    test: (line) => {
      if (!/\bnew Date\(/.test(line)) return false;
      if (/new Date\(\s*\)/.test(line)) return true;
      if (/new Date\(\s*['"`]\d{4}-\d{2}-\d{2}T/.test(line)) return false;
      if (/new Date\(\s*Date\.now\(\)/.test(line)) return false;
      return !/new Date\(\s*['"`]\d{4}-\d{2}-\d{2}['"`]\s*\)/.test(line);
    },
    message: 'new Date(...) usage may be timezone-dependent; prefer explicit UTC/ISO timestamps.'
  }
];

function todayStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function normalizeWhitelist(whitelist = DEFAULT_WHITELIST) {
  return whitelist.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Whitelist entry #${index + 1} must be an object.`);
    }
    if (!entry.reason || !String(entry.reason).trim()) {
      throw new Error(`Whitelist entry #${index + 1} for rule "${entry.rule ?? 'unknown'}" is missing reason.`);
    }
    const filePattern = entry.filePattern instanceof RegExp
      ? entry.filePattern
      : new RegExp(String(entry.filePattern ?? ''), 'i');
    const linePattern = entry.linePattern instanceof RegExp
      ? entry.linePattern
      : (entry.linePattern ? new RegExp(String(entry.linePattern), 'i') : null);
    return {
      ...entry,
      filePattern,
      linePattern
    };
  });
}

async function walkFiles(dirPath) {
  const out = [];
  const entries = await readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walkFiles(fullPath));
      continue;
    }
    out.push(fullPath);
  }
  return out;
}

function shouldScanFile(filePath) {
  return SCANNED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function matchWhitelist(whitelist, { relativePath, ruleId, line }) {
  return whitelist.find((entry) => {
    if (entry.rule && entry.rule !== ruleId) return false;
    if (!entry.filePattern.test(relativePath)) return false;
    if (entry.linePattern && !entry.linePattern.test(line)) return false;
    return true;
  }) ?? null;
}

function shouldSkipSelfLint(relativePath, line) {
  if (relativePath !== 'scripts/audit-portability.js') return false;
  return /linePattern:\s*\/|test:\s*\(line\)\s*=>/.test(line);
}

async function auditPortability({
  repoRoot = path.resolve(__dirname, '..'),
  includeRoots = DEFAULT_INCLUDE_ROOTS,
  reportDate = todayStamp(),
  reportPath = path.join(repoRoot, 'reports', `portability-${reportDate}.json`),
  whitelist = DEFAULT_WHITELIST,
  writeReport = true,
  logger = console
} = {}) {
  const normalizedWhitelist = normalizeWhitelist(whitelist);
  const violations = [];
  const warnings = [];
  const ignored = [];
  const scannedFiles = [];

  for (const root of includeRoots) {
    const rootPath = path.join(repoRoot, root);
    let files = [];
    try {
      files = await walkFiles(rootPath);
    } catch (error) {
      if (error && error.code === 'ENOENT') continue;
      throw error;
    }
    for (const filePath of files) {
      if (!shouldScanFile(filePath)) continue;
      const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, '/');
      const text = await readFile(filePath, 'utf8');
      const lines = text.split(/\r?\n/);
      scannedFiles.push(relativePath);

      for (let index = 0; index < lines.length; index += 1) {
        const lineNumber = index + 1;
        const line = lines[index];
        if (shouldSkipSelfLint(relativePath, line)) continue;
        for (const rule of PORTABILITY_RULES) {
          const matched = rule.test(line, { relativePath, lineNumber });
          if (!matched) continue;
          const allow = matchWhitelist(normalizedWhitelist, { relativePath, ruleId: rule.id, line });
          if (allow) {
            ignored.push({
              rule: rule.id,
              file: relativePath,
              line: lineNumber,
              reason: allow.reason
            });
            continue;
          }
          const row = {
            rule: rule.id,
            message: rule.message,
            severity: rule.severity,
            file: relativePath,
            line: lineNumber,
            excerpt: line.trim().slice(0, 200)
          };
          if (rule.severity === 'warn') warnings.push(row);
          else violations.push(row);
        }
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    repoRoot,
    includeRoots,
    scannedFileCount: scannedFiles.length,
    scannedFiles,
    violationCount: violations.length,
    warningCount: warnings.length,
    ignoredCount: ignored.length,
    violations,
    warnings,
    ignored
  };

  if (writeReport) {
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  if (violations.length > 0) {
    logger.error(`[audit-portability] Found ${violations.length} portability violation(s).`);
  } else {
    logger.log('[audit-portability] No portability violations detected.');
  }
  if (warnings.length > 0) {
    logger.warn(`[audit-portability] ${warnings.length} warning(s) detected.`);
  }

  return {
    exitCode: violations.length > 0 ? 1 : 0,
    reportPath,
    violations,
    warnings,
    ignored
  };
}

if (require.main === module) {
  auditPortability()
    .then((result) => {
      if (result.exitCode !== 0) process.exitCode = result.exitCode;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = {
  auditPortability,
  PORTABILITY_RULES,
  DEFAULT_WHITELIST,
  DEFAULT_INCLUDE_ROOTS
};
