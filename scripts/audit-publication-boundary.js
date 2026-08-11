#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { readdir, readFile } = require('node:fs/promises');

const WORKFLOW_EXTENSIONS = new Set(['.yml', '.yaml']);
const RUNTIME_ADD_PATTERN = /\bpublic\/data\b|\bpublic\/(?:sitemap\.xml|service-worker\.js|rss\.xml|image-sitemap\.xml)\b|\bpages\/(?:brands|compare|guides|location|products|cavity|doorway)\b/;
const PUBLIC_ARTIFACT_ROOTS = [
  ['public', 'data'],
  ['pages', 'brands'],
  ['pages', 'compare'],
  ['pages', 'guides'],
  ['pages', 'location'],
  ['pages', 'products'],
  ['pages', 'cavity'],
  ['pages', 'doorway']
];
const PUBLIC_ARTIFACT_EXTENSIONS = new Set(['.html', '.json']);
const PRIVATE_FEED_PATTERN = /prf\.hn\/click|feeds\.(?:performancehorizon|partnerize)\.com|retailer-observation:affiliate_feed|partnerize-feed|the-good-guys-partnerize-feed-v1|"sourceType"\s*:\s*"affiliate_feed"|"affiliate_network"\s*:\s*"partnerize"|"(?:affiliate_campaign|affiliate_url|camref|commission_cookie_days|commission_eligible|commission_exclusion_reason|commission_model|commission_rate_percent|commission_terms_observed_at|feed_title|feed_model|pubref|retailer_dimension_hint(?:_catalog_delta_mm|_review_required|_source_text)?|tgg_sku|tracking_verified_at)"\s*:/i;
const TGG_URL_PATTERN = /https?:\/\/(?:www\.)?thegoodguys\.com\.au\/[^\s"'<>\\]+/gi;

function violation(file, line, rule, message) {
  return { file, line, rule, message };
}

function lineForOffset(text, offset) {
  return text.slice(0, offset).split(/\r?\n/).length;
}

function normalizeUrl(value) {
  return String(value ?? '')
    .replaceAll('&amp;', '&')
    .replace(/[),.;]+$/, '')
    .replace(/\/$/, '');
}

async function filesBelow(root) {
  const files = [];
  const visit = async (directory) => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() && PUBLIC_ARTIFACT_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(absolute);
      }
    }
  };
  await visit(root);
  return files.sort();
}

async function authorizedTggUrls(repoRoot) {
  const catalogPath = path.join(repoRoot, 'public', 'data', 'appliances.json');
  let document;
  try {
    document = JSON.parse(await readFile(catalogPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return new Set();
    throw error;
  }
  const urls = new Set();
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === 'object') {
      Object.values(value).forEach(visit);
      return;
    }
    if (/^https?:\/\/(?:www\.)?thegoodguys\.com\.au\//i.test(String(value ?? ''))) {
      urls.add(normalizeUrl(value));
    }
  };
  visit(document);
  return urls;
}

async function auditPublicArtifacts(repoRoot) {
  const authorizedUrls = await authorizedTggUrls(repoRoot);
  const files = [];
  for (const segments of PUBLIC_ARTIFACT_ROOTS) {
    files.push(...await filesBelow(path.join(repoRoot, ...segments)));
  }
  const violations = [];
  for (const absolutePath of [...new Set(files)].sort()) {
    const relativePath = path.relative(repoRoot, absolutePath).split(path.sep).join('/');
    const text = await readFile(absolutePath, 'utf8');
    const marker = PRIVATE_FEED_PATTERN.exec(text);
    if (marker) {
      violations.push(violation(
        relativePath,
        lineForOffset(text, marker.index),
        'private-retailer-feed-marker',
        'Private Partnerize feed data reached a public artifact.'
      ));
    }
    const seenUrls = new Set();
    for (const match of text.matchAll(TGG_URL_PATTERN)) {
      const url = normalizeUrl(match[0]);
      if (seenUrls.has(url) || authorizedUrls.has(url)) continue;
      seenUrls.add(url);
      violations.push(violation(
        relativePath,
        lineForOffset(text, match.index),
        'unbound-retailer-product-link',
        'The Good Guys product link is not present in the sanitized public catalog.'
      ));
    }
  }
  return { checkedFiles: [...new Set(files)].length, violations };
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

    if (/\bnpm\s+run\s+(?:generate-all|enrich-evidence|enrich-manual-retailers)(?:\s|$)/.test(entry.line)
      || /\bnode\s+scripts\/architecture-v2\/publish-runtime-projection\.js(?:\s|$)/.test(entry.line)) {
      violations.push(violation(
        relativePath,
        entry.lineNumber,
        'legacy-runtime-mutation',
        'Workflows must use the canonical build instead of legacy runtime mutation commands.'
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

  const artifactAudit = await auditPublicArtifacts(repoRoot);
  violations.push(...artifactAudit.violations);

  if (violations.length > 0) {
    for (const row of violations) {
      logger.error(`${row.file}:${row.line} [${row.rule}] ${row.message}`);
    }
  } else {
    logger.log(`[publication-boundary] checked ${workflowNames.length} workflows and ${artifactAudit.checkedFiles} public artifacts; no violations`);
  }

  return {
    checkedFiles: workflowNames.length + artifactAudit.checkedFiles,
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
  auditPublicArtifacts,
  auditPublicationBoundary,
  auditWorkflow
};
