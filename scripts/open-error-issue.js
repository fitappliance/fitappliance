#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { readFile } = require('node:fs/promises');
const { spawnSync } = require('node:child_process');

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
  });

  if (result.status !== 0) {
    const stderr = String(result.stderr ?? '').trim();
    throw new Error(`Command failed: ${command} ${args.join(' ')}${stderr ? `: ${stderr}` : ''}`);
  }

  return result;
}

function runCommandSafe(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
  });
}

function extractSignatureFromIssue(issue) {
  const body = String(issue?.body ?? '');
  const fromBody = body.match(/signature:([a-f0-9]{6,64})/i);
  if (fromBody) return fromBody[1].toLowerCase();

  const title = String(issue?.title ?? '');
  const fromTitle = title.match(/\[auto-error\]\s*([a-f0-9]{8,64})/i);
  if (fromTitle) return fromTitle[1].toLowerCase();
  return '';
}

function buildIssueActions({ signatures = [], existingIssues = [], nowIso = new Date().toISOString() } = {}) {
  const now = new Date(nowIso).getTime();
  const bySignature = new Map();
  for (const issue of existingIssues) {
    const signature = extractSignatureFromIssue(issue);
    if (!signature) continue;
    bySignature.set(signature, issue);
  }

  const actions = [];
  for (const signatureRow of signatures) {
    const signature = String(signatureRow.signature || '').toLowerCase();
    if (!signature) continue;
    const existing = bySignature.get(signature);

    if (!existing) {
      actions.push({ type: 'create', signature, payload: signatureRow });
      continue;
    }

    if (existing.state === 'open') {
      actions.push({ type: 'comment', signature, issueNumber: existing.number, payload: signatureRow });
      continue;
    }

    if (existing.state === 'closed') {
      const closedAtMs = Number.isFinite(Date.parse(existing.closedAt)) ? Date.parse(existing.closedAt) : 0;
      const ageMs = now - closedAtMs;
      if (ageMs <= 7 * 24 * 60 * 60 * 1000) {
        actions.push({ type: 'reopen', signature, issueNumber: existing.number, payload: signatureRow });
      } else {
        actions.push({ type: 'create', signature, payload: signatureRow });
      }
    }
  }

  return actions;
}

function buildIssueTitle(signatureRow) {
  return `[auto-error] ${signatureRow.signature.slice(0, 12)} ${String(signatureRow.message).slice(0, 80)}`;
}

function buildIssueBody(signatureRow) {
  return [
    `signature:${signatureRow.signature}`,
    '',
    `count: ${signatureRow.count}`,
    `firstSeen: ${signatureRow.firstSeen}`,
    `lastSeen: ${signatureRow.lastSeen}`,
    `source: ${signatureRow.source}`,
    `line: ${signatureRow.line}`,
    '',
    'sampleStack:',
    '```',
    signatureRow.sampleStack || '(empty)',
    '```'
  ].join('\n');
}

function buildIssueComment(action) {
  const payload = action.payload;
  return [
    `recurrence count update: ${payload.count}`,
    `lastSeen: ${payload.lastSeen}`,
    `source: ${payload.source}:${payload.line}`,
    '',
    'sampleStack:',
    '```',
    payload.sampleStack || '(empty)',
    '```'
  ].join('\n');
}

async function runOpenErrorIssue({
  repoRoot = path.resolve(__dirname, '..'),
  reportsPath = path.join(repoRoot, 'reports', 'errors-latest.json'),
  logger = console
} = {}) {
  const report = JSON.parse(await readFile(reportsPath, 'utf8'));
  const signatures = Array.isArray(report?.signatures) ? report.signatures : [];
  if (signatures.length === 0) {
    logger.log('[open-error-issue] no signatures to process');
    return { processed: 0, created: 0, reopened: 0, commented: 0 };
  }

  const listResult = runCommand('gh', ['issue', 'list', '--label', 'auto-error', '--state', 'all', '--json', 'number,title,state,body,closedAt'], {
    cwd: repoRoot,
    capture: true
  });
  const existingIssues = JSON.parse(String(listResult.stdout || '[]'));
  const actions = buildIssueActions({ signatures, existingIssues, nowIso: new Date().toISOString() });

  const labelCreate = runCommandSafe('gh', ['label', 'create', 'auto-error', '--color', 'd73a4a', '--description', 'Automated frontend error signatures'], {
    cwd: repoRoot,
    capture: true
  });
  if (labelCreate.status !== 0 && !String(labelCreate.stderr ?? '').includes('already exists')) {
    throw new Error(String(labelCreate.stderr ?? 'unable to create auto-error label').trim());
  }

  let created = 0;
  let reopened = 0;
  let commented = 0;

  for (const action of actions) {
    if (action.type === 'create') {
      runCommand('gh', ['issue', 'create', '--title', buildIssueTitle(action.payload), '--body', buildIssueBody(action.payload), '--label', 'auto-error'], {
        cwd: repoRoot
      });
      created += 1;
      continue;
    }

    if (action.type === 'comment') {
      runCommand('gh', ['issue', 'comment', String(action.issueNumber), '--body', buildIssueComment(action)], {
        cwd: repoRoot
      });
      commented += 1;
      continue;
    }

    if (action.type === 'reopen') {
      runCommand('gh', ['issue', 'reopen', String(action.issueNumber)], { cwd: repoRoot });
      runCommand('gh', ['issue', 'comment', String(action.issueNumber), '--body', buildIssueComment(action)], {
        cwd: repoRoot
      });
      reopened += 1;
    }
  }

  logger.log(`[open-error-issue] processed=${actions.length} created=${created} reopened=${reopened} commented=${commented}`);
  return { processed: actions.length, created, reopened, commented };
}

async function runCli() {
  try {
    await runOpenErrorIssue();
  } catch (error) {
    console.error(`[open-error-issue] ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  buildIssueActions,
  runOpenErrorIssue
};
