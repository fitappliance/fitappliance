'use strict';

const path = require('node:path');
const { access, mkdir, readdir, readFile, writeFile } = require('node:fs/promises');
const { JSDOM } = require('jsdom');

const DEFAULT_REPORT_PREFIX = 'copy-lint';
const FORBIDDEN_PHRASES = [
  { pattern: /\bper-brand\b/i, suggestion: "Use \"each brand's\" or \"brand-specific\"." },
  { pattern: /\bmost precise\b/i, suggestion: 'Remove superlative marketing language.' },
  { pattern: /^notable:/i, scope: 'paragraph', suggestion: 'Lead with the fact directly instead of a transition label.' },
  { pattern: /^importantly,/i, scope: 'paragraph', suggestion: 'Remove the transition and state the point plainly.' },
  { pattern: /^additionally,/i, scope: 'paragraph', suggestion: 'Remove the transition and join naturally.' },
  { pattern: /so you don['’]t have to/i, suggestion: 'Remove conversational filler.' },
  { pattern: /not just a generic/i, suggestion: 'Avoid comparative marketing filler.' },
  { pattern: /in one search/i, suggestion: 'Avoid conversion copy filler.' },
  { pattern: /\bcurrently fit\b/i, suggestion: 'Avoid unstable time-based phrasing.' },
  { pattern: /\bas of today\b/i, suggestion: 'Avoid unstable time-based phrasing.' },
  { pattern: /\bmeticulously\b/i, suggestion: 'Avoid generic AI-flavoured adverbs.' },
  { pattern: /\bseamlessly\b/i, suggestion: 'Avoid generic AI-flavoured adverbs.' },
  { pattern: /\brobustly\b/i, suggestion: 'Avoid generic AI-flavoured adverbs.' },
  { pattern: /\bleverages\b/i, suggestion: 'Prefer a plain verb such as uses.' },
  { pattern: /\bdelve\b/i, suggestion: 'Prefer plain language.' }
];
const HEADING_EMOJI_RE = /\p{Extended_Pictographic}/u;
const UPPERCASE_LEAD_RE = /^\s*([A-Z][A-Z&/]{1,}(?:\s+[A-Z&/]{2,})*)\b/;
const REPEATED_NGRAM_MIN_WORDS = 3;
const REPEATED_NGRAM_MAX_WORDS = 5;
const REPEATED_NGRAM_MIN_COUNT = 3;
const STOPWORD_ONLY_RE = /^(?:and|the|for|with|from|that|this|your|into|over|under|about|after|before|through|which|these|those|their|there|have|will|does|need|clearance|requirements|guide|models|fit|brand|brands|fridge|washing|machine|dishwasher|dryer|australia|australian|homes|installed|page|pages)(?:\s+(?:and|the|for|with|from|that|this|your|into|over|under|about|after|before|through|which|these|those|their|there|have|will|does|need|clearance|requirements|guide|models|fit|brand|brands|fridge|washing|machine|dishwasher|dryer|australia|australian|homes|installed|page|pages))+$/i;

function todayStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
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

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function listDefaultTargets(repoRoot) {
  const pagesRoot = path.join(repoRoot, 'pages');
  if (!await exists(pagesRoot)) return [];
  const files = await walk(pagesRoot);
  return files
    .filter((filePath) => filePath.endsWith('.html'))
    .map((filePath) => path.relative(repoRoot, filePath).replace(/\\/g, '/'))
    .sort();
}

function normalizeText(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function addIssue(target, issue) {
  target.push({
    ...issue,
    file: issue.file.replace(/\\/g, '/')
  });
}

function collectForbiddenPhraseViolations({ rawHtml, relativePath, violations }) {
  const lines = rawHtml.split(/\r?\n/);
  lines.forEach((line, index) => {
    FORBIDDEN_PHRASES
      .filter((rule) => !rule.scope)
      .forEach((rule) => {
        if (!rule.pattern.test(line)) return;
        addIssue(violations, {
          rule: 'forbidden-phrase',
          file: relativePath,
          line: index + 1,
          message: `Forbidden phrase matched: ${rule.pattern}`,
          excerpt: line.trim().slice(0, 240),
          suggestion: rule.suggestion
        });
      });
  });
}

function collectParagraphViolations({ document, relativePath, violations }) {
  const paragraphs = Array.from(document.querySelectorAll('p'));

  paragraphs.forEach((paragraph, index) => {
    const text = normalizeText(paragraph.textContent);
    if (!text) return;

    FORBIDDEN_PHRASES
      .filter((rule) => rule.scope === 'paragraph')
      .forEach((rule) => {
        if (!rule.pattern.test(text)) return;
        addIssue(violations, {
          rule: 'forbidden-phrase',
          file: relativePath,
          line: index + 1,
          message: `Forbidden paragraph lead matched: ${rule.pattern}`,
          excerpt: text.slice(0, 240),
          suggestion: rule.suggestion
        });
      });

    const emDashCount = (text.match(/—/g) ?? []).length;
    if (emDashCount > 1) {
      addIssue(violations, {
        rule: 'excess-em-dash',
        file: relativePath,
        line: index + 1,
        message: 'Paragraph contains more than one em dash.',
        excerpt: text.slice(0, 240)
      });
    }

    const uppercaseLead = text.match(UPPERCASE_LEAD_RE)?.[1] ?? null;
    if (uppercaseLead && !paragraph.hasAttribute('data-source') && !paragraph.hasAttribute('cite')) {
      addIssue(violations, {
        rule: 'uppercase-lead-without-source',
        file: relativePath,
        line: index + 1,
        message: 'Paragraph starts with uppercase copy without source attribution.',
        excerpt: text.slice(0, 240)
      });
    }
  });
}

function collectHeadingViolations({ document, relativePath, violations }) {
  const headings = Array.from(document.querySelectorAll('h1, h2, h3'));

  headings.forEach((heading, index) => {
    const text = normalizeText(heading.textContent);
    if (!text) return;

    if (heading.hasAttribute('style')) {
      addIssue(violations, {
        rule: 'heading-inline-style',
        file: relativePath,
        line: index + 1,
        message: `${heading.tagName.toLowerCase()} must not use inline style.`,
        excerpt: heading.outerHTML.slice(0, 240)
      });
    }

    if (HEADING_EMOJI_RE.test(text)) {
      addIssue(violations, {
        rule: 'emoji-heading',
        file: relativePath,
        line: index + 1,
        message: 'Headings must not contain emoji.',
        excerpt: text.slice(0, 240)
      });
    }

    if (heading.tagName === 'H1' && /\b(?:Fridges|Washing Machines|Dishwashers)\s+Clearance\b/i.test(text)) {
      addIssue(violations, {
        rule: 'clearance-heading-singular',
        file: relativePath,
        line: index + 1,
        message: 'Clearance heading must use singular appliance noun as an adjective.',
        excerpt: text.slice(0, 240)
      });
    }
  });
}

function collectRepeatedPhraseWarnings({ document, relativePath, warnings }) {
  const pageText = normalizeText(document.body?.textContent ?? '');
  if (!pageText) return;

  const tokens = pageText
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const counts = new Map();

  for (let size = REPEATED_NGRAM_MIN_WORDS; size <= REPEATED_NGRAM_MAX_WORDS; size += 1) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      const phrase = tokens.slice(index, index + size).join(' ');
      if (STOPWORD_ONLY_RE.test(phrase)) continue;
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }
  }

  Array.from(counts.entries())
    .filter(([, count]) => count >= REPEATED_NGRAM_MIN_COUNT)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 25)
    .forEach(([phrase, count]) => {
      addIssue(warnings, {
        rule: 'repeated-phrase',
        file: relativePath,
        message: `Repeated phrase appears ${count} times.`,
        excerpt: phrase
      });
    });
}

async function auditCopy({
  repoRoot = path.resolve(__dirname, '..'),
  includeFiles = null,
  reportDate = todayStamp(),
  reportPath = path.join(repoRoot, 'reports', `${DEFAULT_REPORT_PREFIX}-${reportDate}.json`),
  writeReport = true,
  logger = console
} = {}) {
  const targets = includeFiles ? [...new Set(includeFiles)] : await listDefaultTargets(repoRoot);
  const violations = [];
  const warnings = [];

  for (const relativePath of targets) {
    const absolutePath = path.join(repoRoot, relativePath);
    const rawHtml = await readFile(absolutePath, 'utf8');
    const dom = new JSDOM(rawHtml);
    const { document } = dom.window;

    collectForbiddenPhraseViolations({ rawHtml, relativePath, violations });
    collectParagraphViolations({ document, relativePath, violations });
    collectHeadingViolations({ document, relativePath, violations });
    collectRepeatedPhraseWarnings({ document, relativePath, warnings });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    scannedFiles: targets,
    violationCount: violations.length,
    warningCount: warnings.length,
    violations,
    warnings
  };

  if (writeReport) {
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  if (violations.length > 0) {
    logger.error(`[audit-copy] Found ${violations.length} copy violation(s).`);
  } else {
    logger.log('[audit-copy] No copy violations detected.');
  }

  if (warnings.length > 0) {
    logger.warn(`[audit-copy] ${warnings.length} warning(s) detected.`);
  }

  return {
    exitCode: violations.length > 0 ? 1 : 0,
    reportPath,
    violations,
    warnings
  };
}

if (require.main === module) {
  auditCopy()
    .then((result) => {
      if (result.exitCode !== 0) process.exitCode = result.exitCode;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = {
  FORBIDDEN_PHRASES,
  auditCopy,
  collectForbiddenPhraseViolations,
  collectHeadingViolations,
  collectParagraphViolations,
  collectRepeatedPhraseWarnings,
  listDefaultTargets,
  todayStamp
};
