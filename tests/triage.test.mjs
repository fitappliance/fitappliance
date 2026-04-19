import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildTriagePlan, buildWeeklyDigestAction } = require('../scripts/triage-issues.js');

function makeIssue({
  id,
  number,
  title,
  labels = [],
  author = 'github-actions[bot]',
  createdAt = '2026-04-19T00:00:00Z',
  isPullRequest = false
}) {
  return {
    id,
    number,
    title,
    labels: labels.map((name) => ({ name })),
    user: { login: author },
    created_at: createdAt,
    html_url: `https://github.com/fitappliance/fitappliance/issues/${number}`,
    pull_request: isPullRequest ? { url: `https://api.github.com/repos/fitappliance/fitappliance/pulls/${number}` } : null
  };
}

test('phase 39 triage: same signature keeps newest open and closes older duplicates', () => {
  const issues = Array.from({ length: 5 }, (_, index) => makeIssue({
    id: index + 1,
    number: 100 + index,
    labels: ['auto-error'],
    title: '[auto-error] errorSignature=abc123 checkout failure',
    createdAt: `2026-04-1${index}T00:00:00Z`
  }));

  const plan = buildTriagePlan({ issues, maxClose: 20, maxComment: 50 });
  assert.equal(plan.keep.length, 1);
  assert.equal(plan.toClose.length, 4);
  assert.equal(plan.comments.length, 4);
  assert.equal(plan.keep[0].number, 104);
});

test('phase 39 triage: different signatures are not merged', () => {
  const issues = [
    makeIssue({ id: 1, number: 200, labels: ['auto-error'], title: '[auto-error] errorSignature=abc111 timeout' }),
    makeIssue({ id: 2, number: 201, labels: ['auto-error'], title: '[auto-error] errorSignature=def222 timeout' })
  ];

  const plan = buildTriagePlan({ issues, maxClose: 20, maxComment: 50 });
  assert.equal(plan.keep.length, 2);
  assert.equal(plan.toClose.length, 0);
});

test('phase 39 triage: close/comment limits are enforced at hard cap', () => {
  const issues = Array.from({ length: 30 }, (_, index) => makeIssue({
    id: index + 1,
    number: 300 + index,
    labels: ['auto-content'],
    title: '[auto-content] query=fridge-clearance-melbourne',
    createdAt: `2026-04-${String(index + 1).padStart(2, '0')}T00:00:00Z`
  }));

  const plan = buildTriagePlan({ issues, maxClose: 20, maxComment: 50 });
  assert.equal(plan.toClose.length, 20);
  assert.equal(plan.comments.length, 20);
  assert.equal(plan.skippedDueToLimit.length, 9);
});

test('phase 39 triage: weekly digest rerun comments existing issue instead of reopening', () => {
  const digest = buildWeeklyDigestAction({
    date: '2026-04-20',
    groupedCounts: { 'auto-error': 5, 'auto-content': 3 },
    existingDigestIssue: { number: 901, title: '[weekly] auto-issue digest 2026-04-20' }
  });

  assert.equal(digest.action, 'comment');
  assert.equal(digest.issueNumber, 901);
  assert.equal(digest.title, null);
});

test('phase 39 triage: ignores non-bot or non-whitelisted issues', () => {
  const issues = [
    makeIssue({
      id: 1,
      number: 400,
      labels: ['bug'],
      author: 'github-actions[bot]',
      title: 'manual bug issue'
    }),
    makeIssue({
      id: 2,
      number: 401,
      labels: ['auto-error'],
      author: 'octocat',
      title: '[auto-error] errorSignature=xyz crash'
    })
  ];

  const plan = buildTriagePlan({ issues, maxClose: 20, maxComment: 50 });
  assert.equal(plan.keep.length, 0);
  assert.equal(plan.toClose.length, 0);
  assert.equal(plan.skippedIneligible.length, 2);
});
