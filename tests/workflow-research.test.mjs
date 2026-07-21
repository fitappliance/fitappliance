import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('phase 43a backfill: research workflow exists with dispatch and daily schedule', () => {
  const workflowPath = path.join(process.cwd(), '.github', 'workflows', 'research-popularity.yml');
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /cron:\s*'0 14 \* \* \*'/);
});

test('phase 43a backfill: workflow serializes runs with concurrency protection', () => {
  const workflowPath = path.join(process.cwd(), '.github', 'workflows', 'research-popularity.yml');
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /concurrency:/);
  assert.match(workflow, /group:\s*research-popularity/);
  assert.match(workflow, /cancel-in-progress:\s*false/);
});

test('phase 43a backfill: workflow rebuilds canonical artifacts and opens a review PR', () => {
  const workflowPath = path.join(process.cwd(), '.github', 'workflows', 'research-popularity.yml');
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /Validate required secrets/);
  assert.match(workflow, /GITHUB_TOKEN is required/);
  assert.match(workflow, /node scripts\/research-popularity\.js/);
  assert.match(workflow, /npm run build/);
  assert.doesNotMatch(workflow, /node scripts\/enrich-appliances\.js/);
  assert.doesNotMatch(workflow, /node scripts\/enrich-manual-retailers\.js/);
  assert.match(workflow, /node scripts\/sync-retailer-metrics-docs\.js/);
  assert.match(workflow, /npm run validate-schema/);
  assert.match(workflow, /npm run audit-indexability-policy/);
  assert.match(workflow, /node --test tests\/catalog-data-cleanup\.test\.mjs tests\/retailer-metrics-copy\.test\.mjs/);
  assert.match(workflow, /git add -A/);
  assert.match(workflow, /git diff --cached --quiet/);
  assert.match(workflow, /chore\(backfill\): retailer sync cursor=/);
  assert.match(workflow, /git push -u origin "\$branch"/);
  assert.match(workflow, /gh pr create/);
  assert.doesNotMatch(workflow, /git push origin main|^\s*git push\s*$/m);
});
