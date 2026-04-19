#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { readFile, writeFile } = require('node:fs/promises');
const { spawnSync } = require('node:child_process');
const { buildCandidateDraft } = require('./auto-content-pipeline.js');
const { generateSitemap } = require('./generate-sitemap.js');
const { generateRss } = require('./generate-rss.js');
const { validateSchema } = require('./validate-schema.js');

function buildPrPlan({ candidates = [], maxPrsPerRun = 10 } = {}) {
  const selected = [];
  const skipped = [];

  for (const candidate of candidates) {
    if (selected.length >= maxPrsPerRun) {
      skipped.push({ query: candidate.query, slug: candidate.slug, reason: 'rate_limit_max_10' });
      continue;
    }
    selected.push(candidate);
  }

  return { selected, skipped };
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
  });

  if (result.status !== 0) {
    const stderr = result.stderr ? String(result.stderr).trim() : '';
    const suffix = stderr ? `: ${stderr}` : '';
    throw new Error(`Command failed: ${command} ${args.join(' ')}${suffix}`);
  }

  return result;
}

async function updateGuideIndex({ repoRoot, slug, query }) {
  const indexPath = path.join(repoRoot, 'pages', 'guides', 'index.json');
  const text = await readFile(indexPath, 'utf8');
  const rows = JSON.parse(text);
  const nextRows = Array.isArray(rows) ? [...rows] : [];

  const exists = nextRows.some((row) => row.slug === slug);
  if (!exists) {
    nextRows.push({
      slug,
      title: query,
      description: `Data-backed guide for ${query}.`,
      url: `/guides/${slug}`,
      linkCount: 3
    });
    nextRows.sort((left, right) => String(left.slug).localeCompare(String(right.slug)));
    await writeFile(indexPath, `${JSON.stringify(nextRows, null, 2)}\n`, 'utf8');
  }
}

function buildPrBody({ candidate, draft }) {
  const refs = draft.references
    .map((ref) => `- ${ref.file}:${ref.line || 0} (${ref.field} = ${ref.value})`)
    .join('\n');

  return [
    `## Auto Content Candidate`,
    '',
    `- query: \`${candidate.query}\``,
    `- position: ${candidate.position}`,
    `- impressions: ${candidate.impressions}`,
    `- ctr: ${candidate.ctr}`,
    '',
    '## Real Data References',
    refs || '- none',
    '',
    '## Notes',
    '- If GSC data is not ready yet, this automation waits for report backfill before creating candidates.',
    '',
    '## Auto Review Checklist',
    '- [ ] 文案非 LLM 幻觉',
    '- [ ] 数据真实存在',
    '- [ ] 无关键词堆砌'
  ].join('\n');
}

function parseBoolEnv(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw == null) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

async function openContentPrs({
  repoRoot = path.resolve(__dirname, '..'),
  maxPrsPerRun = 10,
  logger = console,
  dryRun = parseBoolEnv('DRY_RUN', false)
} = {}) {
  const reportPath = path.join(repoRoot, 'reports', 'auto-content-latest.json');
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const candidates = Array.isArray(report?.candidates) ? report.candidates : [];
  const plan = buildPrPlan({ candidates, maxPrsPerRun });

  if (plan.selected.length === 0) {
    logger.log('[open-content-pr] no candidates selected; skipping PR creation');
    return { opened: 0, skipped: [...plan.skipped] };
  }

  const dateStamp = String(report?.date ?? new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const opened = [];
  const skipped = [...plan.skipped];

  runCommand('git', ['checkout', 'main'], { cwd: repoRoot });
  runCommand('git', ['pull', '--ff-only', 'origin', 'main'], { cwd: repoRoot });

  for (const candidate of plan.selected) {
    const existing = runCommand(
      'gh',
      ['pr', 'list', '--state', 'all', '--search', candidate.slug, '--json', 'number', '--jq', 'length'],
      { cwd: repoRoot, capture: true }
    );
    const existingCount = Number(String(existing.stdout).trim() || '0');
    if (existingCount > 0) {
      skipped.push({ query: candidate.query, slug: candidate.slug, reason: 'existing_pr_found' });
      continue;
    }

    const draft = await buildCandidateDraft({ candidate, repoRoot });
    if (draft.skipped) {
      skipped.push({ query: candidate.query, slug: candidate.slug, reason: draft.skipReason || 'draft_skipped' });
      continue;
    }

    const branch = `auto/content-${dateStamp}-${candidate.slug}`.slice(0, 72);
    runCommand('git', ['checkout', '-B', branch, 'main'], { cwd: repoRoot });

    const pagePath = path.join(repoRoot, 'pages', 'guides', `${candidate.slug}.html`);
    await writeFile(pagePath, draft.html, 'utf8');
    await updateGuideIndex({ repoRoot, slug: candidate.slug, query: candidate.query });

    await generateSitemap({ repoRoot, logger: { log() {} } });
    await generateRss({ repoRoot, logger: { log() {} } });

    const schemaReport = await validateSchema({ repoRoot, logger: { log() {} } });
    if (Number(schemaReport.errors ?? 0) > 0) {
      throw new Error(`Schema validation failed with ${schemaReport.errors} errors.`);
    }

    runCommand('git', ['add', pagePath, path.join(repoRoot, 'pages', 'guides', 'index.json'), path.join(repoRoot, 'public', 'sitemap.xml'), path.join(repoRoot, 'public', 'rss.xml')], { cwd: repoRoot });
    runCommand('git', ['commit', '-m', `feat(content): auto guide for ${candidate.slug}`], { cwd: repoRoot });

    if (!dryRun) {
      runCommand('git', ['push', '-u', 'origin', branch], { cwd: repoRoot });
      const title = `feat(content): ${candidate.query}`;
      const body = buildPrBody({ candidate, draft });
      runCommand('gh', ['pr', 'create', '--base', 'main', '--head', branch, '--title', title, '--body', body], { cwd: repoRoot });
      runCommand('gh', ['pr', 'edit', branch, '--add-label', 'auto-content'], { cwd: repoRoot });
      opened.push({ branch, query: candidate.query, slug: candidate.slug });
    }

    runCommand('git', ['checkout', 'main'], { cwd: repoRoot });
  }

  return { opened: opened.length, openedBranches: opened, skipped };
}

async function runCli() {
  try {
    const result = await openContentPrs();
    console.log(`[open-content-pr] opened=${result.opened} skipped=${result.skipped.length}`);
  } catch (error) {
    console.error(`[open-content-pr] ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  buildPrPlan,
  openContentPrs
};
