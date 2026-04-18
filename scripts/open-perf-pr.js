#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { readFile } = require('node:fs/promises');
const { spawnSync } = require('node:child_process');

function buildPerfPrPlan({ rumSummary = {}, issues = [] } = {}) {
  const totalEvents = Number(rumSummary?.totals?.totalEvents ?? 0);
  if (totalEvents < 100) {
    return {
      shouldOpenPr: false,
      reason: 'insufficient_samples',
      selectedIssues: []
    };
  }

  const severity = { LCP: 3, INP: 2, CLS: 1 };
  const selectedIssues = [...issues]
    .sort((left, right) => {
      const metricWeightDelta = (severity[right.metric] ?? 0) - (severity[left.metric] ?? 0);
      if (metricWeightDelta !== 0) return metricWeightDelta;
      return Number(right.p75 ?? 0) - Number(left.p75 ?? 0);
    })
    .slice(0, 5);

  if (selectedIssues.length === 0) {
    return {
      shouldOpenPr: false,
      reason: 'no_issues',
      selectedIssues: []
    };
  }

  return {
    shouldOpenPr: true,
    reason: 'ok',
    selectedIssues
  };
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

function runCommandSafe(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
  });
  return result;
}

function buildPrBody({ selectedIssues }) {
  const rows = selectedIssues
    .map((issue) => `- ${issue.path} | ${issue.metric} p75=${issue.p75} | ${issue.suggestion}\n  - evidence: ${issue.evidence}`)
    .join('\n');

  return [
    '## RUM Weekly Diagnosis',
    '',
    rows,
    '',
    '## Policy',
    '- This PR intentionally contains diagnostic report artifacts only.',
    '- No business/source code edits are included.',
    '- Manual follow-up optimization PR is required for implementation.'
  ].join('\n');
}

async function openPerfPr({
  repoRoot = path.resolve(__dirname, '..'),
  reportsDir = path.join(repoRoot, 'reports'),
  logger = console
} = {}) {
  const summary = JSON.parse(await readFile(path.join(reportsDir, 'rum-summary-latest.json'), 'utf8'));
  const perfReport = JSON.parse(await readFile(path.join(reportsDir, 'perf-issues-latest.json'), 'utf8'));

  const plan = buildPerfPrPlan({ rumSummary: summary, issues: perfReport.issues ?? [] });
  if (!plan.shouldOpenPr) {
    logger.log(`[open-perf-pr] skipped (${plan.reason})`);
    return { opened: false, reason: plan.reason };
  }

  const dateStamp = String(perfReport?.date ?? new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const branch = `auto/perf-${dateStamp}`;

  runCommand('git', ['checkout', 'main'], { cwd: repoRoot });
  runCommand('git', ['pull', '--ff-only', 'origin', 'main'], { cwd: repoRoot });
  runCommand('git', ['checkout', '-B', branch, 'main'], { cwd: repoRoot });

  runCommand('git', ['add', 'reports/rum-summary-latest.json', 'reports/perf-issues-latest.json'], { cwd: repoRoot });
  const staged = runCommandSafe('git', ['diff', '--cached', '--name-only'], { cwd: repoRoot, capture: true });
  if (!String(staged.stdout ?? '').trim()) {
    runCommand('git', ['checkout', 'main'], { cwd: repoRoot });
    return { opened: false, reason: 'no_report_changes' };
  }
  runCommand('git', ['commit', '-m', `chore(perf): weekly RUM diagnosis ${dateStamp}`], { cwd: repoRoot });
  runCommand('git', ['push', '-u', 'origin', branch], { cwd: repoRoot });

  const title = `chore(perf): weekly diagnosis ${dateStamp}`;
  const body = buildPrBody({ selectedIssues: plan.selectedIssues });
  runCommand('gh', ['pr', 'create', '--base', 'main', '--head', branch, '--title', title, '--body', body], { cwd: repoRoot });

  const labelResult = runCommandSafe(
    'gh',
    ['label', 'create', 'auto-perf', '--color', '1d76db', '--description', 'Automated performance diagnostics'],
    { cwd: repoRoot, capture: true }
  );
  if (labelResult.status !== 0 && !String(labelResult.stderr ?? '').includes('already exists')) {
    throw new Error(`Unable to create auto-perf label: ${String(labelResult.stderr ?? '').trim()}`);
  }
  runCommand('gh', ['pr', 'edit', branch, '--add-label', 'auto-perf'], { cwd: repoRoot });

  runCommand('git', ['checkout', 'main'], { cwd: repoRoot });
  return { opened: true, branch, issueCount: plan.selectedIssues.length };
}

async function runCli() {
  try {
    const result = await openPerfPr();
    if (result.opened) {
      console.log(`[open-perf-pr] opened branch=${result.branch} issueCount=${result.issueCount}`);
    }
  } catch (error) {
    console.error(`[open-perf-pr] ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  buildPerfPrPlan,
  openPerfPr
};
