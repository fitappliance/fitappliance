#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { execFile } = require('node:child_process');
const { lstat, readFile } = require('node:fs/promises');
const { promisify } = require('node:util');

const run = promisify(execFile);
const POLICY_PATH = 'data/architecture-v2/policies/retailer-source-policy.json';
const PARTNERIZE_POLICY_ID = 'the-good-guys-partnerize-feed-v1';
const SCANNED_ROOTS = ['data', 'deployment', 'pages', 'public', 'reports'];
const MARKERS = [
  ['partnerize-selection-basis', /active_partnerize_inventory/i],
  ['feed-url', /https?:\/\/(?:prf\.hn\/click|feeds\.(?:performancehorizon|partnerize)\.com)/i],
  ['affiliate-network', /"affiliate_network"\s*:\s*"partnerize"/i],
  ['feed-source', /"(?:source|originSource)"\s*:\s*"partnerize-feed(?:-description)?"/i],
  ['feed-source-type', /"sourceType"\s*:\s*"affiliate_feed"/i],
  ['feed-adapter', /"(?:adapterId|sourcePolicyId)"\s*:\s*"the-good-guys-partnerize-feed-v1"/i],
  ['feed-reference', /"(?:rawSourceReference|sourceReference)"\s*:\s*"[^"]*partnerize[^"]*"/i],
  ['feed-field', /"(?:tgg_sku|feed_title|feed_model)"\s*:/i],
];
const PUBLIC_HTML_MARKERS = [
  ['partnerize', /\bpartnerize\b/i],
  ['commission-factory', /\bcommission factory\b/i],
  ['performance-horizon', /\bperformance horizon\b/i],
  ['prf-hn', /\bprf\.hn\b/i],
];

function lineFor(text, offset) {
  return text.slice(0, offset).split(/\r?\n/).length;
}

function violation(file, line, rule, marker) {
  return { file, line, rule, marker };
}

function auditPolicy(text) {
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    return [violation(POLICY_PATH, 1, 'partnerize-policy-invalid', 'invalid-json')];
  }
  const source = document?.sources?.find((row) => row?.id === PARTNERIZE_POLICY_ID);
  if (!source || source.sourceType !== 'affiliate_feed'
    || source.termsReviewState !== 'reviewed_private_campaign_use'
    || source.legacyLinkAction !== 'PRIVATE_EVIDENCE_ONLY') {
    return [violation(POLICY_PATH, 1, 'partnerize-policy-not-private', PARTNERIZE_POLICY_ID)];
  }
  return [];
}

function auditPrivateEvidenceFiles(files) {
  const violations = [];
  for (const file of files) {
    const relativePath = String(file?.path ?? '').split(path.sep).join('/');
    const text = String(file?.text ?? '');
    if (relativePath === POLICY_PATH) {
      violations.push(...auditPolicy(text));
      continue;
    }
    if (relativePath.endsWith('.html')) {
      for (const [marker, pattern] of PUBLIC_HTML_MARKERS) {
        const match = pattern.exec(text);
        if (match) {
          violations.push(violation(
            relativePath,
            lineFor(text, match.index),
            'public-private-affiliate-reference',
            marker,
          ));
        }
      }
      continue;
    }
    for (const [marker, pattern] of MARKERS) {
      const match = pattern.exec(text);
      if (match) {
        violations.push(violation(
          relativePath,
          lineFor(text, match.index),
          'tracked-private-evidence',
          marker,
        ));
      }
    }
  }
  return { checkedFiles: files.length, violations };
}

async function trackedOperationalPaths(repoRoot) {
  const { stdout } = await run('git', ['ls-files', '-z', '--', ...SCANNED_ROOTS], {
    cwd: repoRoot,
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout.toString('utf8').split('\0').filter(Boolean).sort();
}

async function auditRepositoryPrivateEvidence({ repoRoot = process.cwd(), logger = console } = {}) {
  const files = [];
  const structuralViolations = [];
  for (const relativePath of await trackedOperationalPaths(repoRoot)) {
    const absolutePath = path.join(repoRoot, relativePath);
    let stat;
    try {
      stat = await lstat(absolutePath);
    } catch (error) {
      structuralViolations.push(violation(relativePath, 1, 'tracked-file-unreadable', error.code ?? 'read-error'));
      continue;
    }
    if (!stat.isFile()) {
      structuralViolations.push(violation(relativePath, 1, 'tracked-file-not-regular', stat.isSymbolicLink() ? 'symlink' : 'special-file'));
      continue;
    }
    const bytes = await readFile(absolutePath);
    if (bytes.includes(0)) continue;
    files.push({ path: relativePath, text: bytes.toString('utf8') });
  }
  const result = auditPrivateEvidenceFiles(files);
  result.violations.unshift(...structuralViolations);
  result.exitCode = result.violations.length === 0 ? 0 : 1;
  if (result.exitCode === 0) {
    logger.log(`[private-evidence-boundary] checked ${result.checkedFiles} tracked operational files; no violations`);
  } else {
    for (const row of result.violations) {
      logger.error(`[private-evidence-boundary] ${row.file}:${row.line} ${row.rule} (${row.marker})`);
    }
  }
  return result;
}

if (require.main === module) {
  auditRepositoryPrivateEvidence().then((result) => {
    process.exitCode = result.exitCode;
  }).catch((error) => {
    console.error(error.stack ?? error);
    process.exitCode = 1;
  });
}

module.exports = {
  auditPrivateEvidenceFiles,
  auditRepositoryPrivateEvidence,
};
