'use strict';

const path = require('node:path');
const { mkdir, writeFile } = require('node:fs/promises');
const { parseArgs } = require('node:util');
const { execFileSync } = require('node:child_process');

const LABEL_ALLOWLIST = ['sentinel-auto', 'auto-content', 'auto-perf', 'auto-error'];
const BOT_LOGIN = 'github-actions[bot]';
const HARD_CLOSE_LIMIT = 20;
const HARD_COMMENT_LIMIT = 50;

function toDateStamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

function toCompactDate(value = new Date()) {
  return toDateStamp(value).replace(/-/g, '');
}

function getLabels(issue) {
  return Array.isArray(issue?.labels) ? issue.labels.map((row) => row?.name).filter(Boolean) : [];
}

function getPrimaryLabel(issue) {
  const labels = getLabels(issue);
  return LABEL_ALLOWLIST.find((label) => labels.includes(label)) ?? null;
}

function isEligible(issue) {
  if (!issue || typeof issue !== 'object') return false;
  if (issue?.user?.login !== BOT_LOGIN) return false;
  return Boolean(getPrimaryLabel(issue));
}

function parseGroupKey(issue, label) {
  const title = String(issue?.title ?? '');

  if (label === 'auto-error') {
    return (title.match(/(?:errorSignature|sig|hash)\s*[:=]\s*([a-z0-9_-]+)/i)?.[1] ?? title).toLowerCase();
  }
  if (label === 'auto-content') {
    return (title.match(/(?:query|slug)\s*[:=]\s*([a-z0-9/-]+)/i)?.[1] ?? title).toLowerCase();
  }
  if (label === 'auto-perf') {
    return (title.match(/(?:path|url)\s*[:=]\s*([^\s]+)/i)?.[1] ?? title).toLowerCase();
  }
  if (label === 'sentinel-auto') {
    return (title.match(/\b(uptime|broken-link|orphan)\b/i)?.[1] ?? title).toLowerCase();
  }
  return title.toLowerCase();
}

function buildSupersededComment({ newerNumber }) {
  return `superseded by #${newerNumber}`;
}

function byNewest(left, right) {
  const leftTs = Date.parse(left?.created_at ?? '') || 0;
  const rightTs = Date.parse(right?.created_at ?? '') || 0;
  if (rightTs !== leftTs) return rightTs - leftTs;
  return Number(right?.number ?? 0) - Number(left?.number ?? 0);
}

function buildTriagePlan({
  issues = [],
  maxClose = HARD_CLOSE_LIMIT,
  maxComment = HARD_COMMENT_LIMIT
} = {}) {
  const groups = new Map();
  const skippedIneligible = [];
  const groupedCounts = Object.fromEntries(LABEL_ALLOWLIST.map((label) => [label, 0]));

  for (const issue of issues) {
    if (!isEligible(issue)) {
      skippedIneligible.push(issue);
      continue;
    }
    const label = getPrimaryLabel(issue);
    if (!label) {
      skippedIneligible.push(issue);
      continue;
    }
    groupedCounts[label] += 1;
    const key = `${label}:${parseGroupKey(issue, label)}`;
    const list = groups.get(key) ?? [];
    list.push(issue);
    groups.set(key, list);
  }

  const keep = [];
  const duplicateCandidates = [];

  for (const [groupKey, list] of groups.entries()) {
    const sorted = [...list].sort(byNewest);
    const newest = sorted[0];
    const [label] = groupKey.split(':');
    keep.push(newest);
    for (const older of sorted.slice(1)) {
      duplicateCandidates.push({
        issue: older,
        label,
        groupKey,
        supersededBy: newest
      });
    }
  }

  duplicateCandidates.sort((left, right) => {
    const leftTs = Date.parse(left?.issue?.created_at ?? '') || 0;
    const rightTs = Date.parse(right?.issue?.created_at ?? '') || 0;
    if (leftTs !== rightTs) return leftTs - rightTs;
    return Number(left?.issue?.number ?? 0) - Number(right?.issue?.number ?? 0);
  });

  const toClose = [];
  const comments = [];
  const skippedDueToLimit = [];
  let closeBudget = Math.max(0, maxClose);
  let commentBudget = Math.max(0, maxComment);

  for (const row of duplicateCandidates) {
    if (closeBudget <= 0 || commentBudget <= 0) {
      skippedDueToLimit.push(row);
      continue;
    }
    toClose.push(row);
    comments.push({
      issue: row.issue,
      body: buildSupersededComment({ newerNumber: row.supersededBy.number })
    });
    closeBudget -= 1;
    commentBudget -= 1;
  }

  return {
    keep,
    toClose,
    comments,
    skippedDueToLimit,
    skippedIneligible,
    groupedCounts
  };
}

function buildDigestBody({ date, groupedCounts = {}, topSignatures = [], worstPath = null }) {
  const countsLines = LABEL_ALLOWLIST.map((label) => `- ${label}: ${groupedCounts[label] ?? 0}`).join('\n');
  const topLines = topSignatures.length > 0
    ? topSignatures.map((row, index) => `${index + 1}. ${row.key} (${row.count})`).join('\n')
    : '1. No recurring signatures observed this period.';
  const worstLine = worstPath ? `- Worst LCP p75 path: ${worstPath}` : '- Worst LCP p75 path: n/a';

  return [
    `Auto triage digest for week ending ${date}.`,
    '',
    '## New auto issues by label',
    countsLines,
    '',
    '## Top recurring signatures',
    topLines,
    '',
    '## Performance watch',
    worstLine
  ].join('\n');
}

function buildWeeklyDigestAction({
  date = toDateStamp(),
  groupedCounts = {},
  topSignatures = [],
  worstPath = null,
  existingDigestIssue = null
} = {}) {
  const title = `[weekly] auto-issue digest ${date}`;
  const body = buildDigestBody({ date, groupedCounts, topSignatures, worstPath });

  if (existingDigestIssue && existingDigestIssue.number) {
    return {
      action: 'comment',
      issueNumber: existingDigestIssue.number,
      title: null,
      body
    };
  }

  return {
    action: 'create',
    issueNumber: null,
    title,
    body
  };
}

function runGhJson(args, { allowFailure = false } = {}) {
  try {
    const stdout = execFileSync('gh', args, { encoding: 'utf8' });
    return stdout.trim() ? JSON.parse(stdout) : null;
  } catch (error) {
    if (allowFailure) return null;
    throw error;
  }
}

function runGh(args) {
  execFileSync('gh', args, { stdio: 'inherit' });
}

function requireRepoSlug() {
  const fromEnv = process.env.GITHUB_REPOSITORY;
  if (fromEnv) return fromEnv;
  const row = runGhJson(['repo', 'view', '--json', 'nameWithOwner']);
  if (row?.nameWithOwner) return row.nameWithOwner;
  throw new Error('Unable to resolve repository slug. Set GITHUB_REPOSITORY.');
}

function getCloseCommand(issue) {
  return issue?.pull_request
    ? ['pr', 'close', String(issue.number), '--comment', 'Superseded by newer auto report.']
    : ['issue', 'close', String(issue.number), '--reason', 'completed'];
}

function getCommentCommand(issue, body) {
  return issue?.pull_request
    ? ['pr', 'comment', String(issue.number), '--body', body]
    : ['issue', 'comment', String(issue.number), '--body', body];
}

async function runTriage({
  repoRoot = path.resolve(__dirname, '..'),
  today = toDateStamp(),
  dryRun = false,
  runDigest = false,
  maxClose = HARD_CLOSE_LIMIT,
  maxComment = HARD_COMMENT_LIMIT,
  logger = console
} = {}) {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN is required.');
  }

  const repo = requireRepoSlug();
  const issues = runGhJson(['api', `repos/${repo}/issues?state=open&per_page=100`], { allowFailure: false }) ?? [];
  const plan = buildTriagePlan({ issues, maxClose, maxComment });

  const executed = {
    comments: [],
    closes: [],
    digest: null
  };

  if (!dryRun) {
    for (const row of plan.toClose) {
      const body = buildSupersededComment({ newerNumber: row.supersededBy.number });
      runGh(getCommentCommand(row.issue, body));
      executed.comments.push(row.issue.number);
      runGh(getCloseCommand(row.issue));
      executed.closes.push(row.issue.number);
    }
  }

  let digestAction = null;
  if (runDigest) {
    const digestTitle = `[weekly] auto-issue digest ${today}`;
    const existing = runGhJson(
      ['issue', 'list', '--state', 'open', '--label', 'weekly-digest', '--search', digestTitle, '--json', 'number,title'],
      { allowFailure: true }
    ) ?? [];
    digestAction = buildWeeklyDigestAction({
      date: today,
      groupedCounts: plan.groupedCounts,
      existingDigestIssue: existing[0] ?? null
    });
    if (!dryRun) {
      if (digestAction.action === 'comment') {
        runGh(['issue', 'comment', String(digestAction.issueNumber), '--body', digestAction.body]);
      } else {
        runGh(['issue', 'create', '--title', digestAction.title, '--body', digestAction.body, '--label', 'weekly-digest']);
      }
      executed.digest = digestAction.action;
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    date: today,
    dryRun,
    limits: {
      close: maxClose,
      comment: maxComment
    },
    counts: {
      totalOpenFetched: issues.length,
      eligibleKept: plan.keep.length,
      plannedClose: plan.toClose.length,
      plannedComment: plan.comments.length,
      skippedIneligible: plan.skippedIneligible.length,
      skippedDueToLimit: plan.skippedDueToLimit.length
    },
    groupedCounts: plan.groupedCounts,
    plannedActions: {
      closeNumbers: plan.toClose.map((row) => row.issue.number),
      commentNumbers: plan.comments.map((row) => row.issue.number),
      skippedDueToLimitNumbers: plan.skippedDueToLimit.map((row) => row.issue.number)
    },
    executed,
    digestAction
  };

  const reportPath = path.join(repoRoot, 'reports', `triage-${toCompactDate(today)}.json`);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  logger.log(`[triage] kept=${plan.keep.length} close=${plan.toClose.length} skipped-limit=${plan.skippedDueToLimit.length} dryRun=${dryRun}`);
  logger.log(`[triage] report=${reportPath}`);

  return {
    reportPath,
    report,
    plan
  };
}

if (require.main === module) {
  const { values } = parseArgs({
    options: {
      dryRun: { type: 'boolean', default: false },
      digest: { type: 'boolean', default: false }
    }
  });

  runTriage({
    dryRun: values.dryRun,
    runDigest: values.digest
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  LABEL_ALLOWLIST,
  BOT_LOGIN,
  HARD_CLOSE_LIMIT,
  HARD_COMMENT_LIMIT,
  buildTriagePlan,
  buildWeeklyDigestAction,
  parseGroupKey,
  runTriage
};
