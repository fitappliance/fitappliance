import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const WORKFLOW_DIR = path.join(ROOT, '.github', 'workflows');

const EXPECTED_PERMISSIONS = {
  'auto-content.yml': { contents: 'write', 'pull-requests': 'write' },
  'copy-lint.yml': { contents: 'read' },
  'data-sync.yml': { contents: 'write' },
  'doc-audit.yml': { contents: 'read' },
  'error-daily.yml': { contents: 'read', issues: 'write' },
  'gsc-weekly.yml': { contents: 'write' },
  'indexnow-on-deploy.yml': { contents: 'read' },
  'lighthouse.yml': { contents: 'read' },
  'perf-weekly.yml': { contents: 'write', 'pull-requests': 'write' },
  'portability.yml': { contents: 'read' },
  'pr-validation.yml': { contents: 'read' },
  'research-popularity.yml': { contents: 'write' },
  'sentinel.yml': { contents: 'read', issues: 'write' },
  'triage.yml': { contents: 'read', issues: 'write', 'pull-requests': 'write' },
  'validate-reviews.yml': { contents: 'write' },
  'validate-videos.yml': { contents: 'write', issues: 'write' },
  'weekly-growth.yml': { contents: 'write' }
};

function parseTopLevelPermissions(yamlText) {
  const lines = yamlText.split(/\r?\n/);
  const start = lines.findIndex((line) => line === 'permissions:');
  if (start === -1) return null;

  const permissions = {};
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line) && line.trim()) break;
    const match = line.match(/^  ([A-Za-z-]+):\s*([A-Za-z-]+)\s*$/);
    if (match) {
      permissions[match[1]] = match[2];
    }
  }
  return permissions;
}

test('phase 43a p2: every workflow declares least-privilege token permissions', () => {
  const workflowFiles = fs.readdirSync(WORKFLOW_DIR).filter((file) => file.endsWith('.yml')).sort();
  assert.deepEqual(workflowFiles, Object.keys(EXPECTED_PERMISSIONS).sort(), 'workflow permission map must cover every workflow');

  for (const fileName of workflowFiles) {
    const yaml = fs.readFileSync(path.join(WORKFLOW_DIR, fileName), 'utf8');
    const permissions = parseTopLevelPermissions(yaml);

    assert.ok(permissions, `${fileName} must declare top-level permissions`);
    assert.deepEqual(permissions, EXPECTED_PERMISSIONS[fileName], `${fileName} permissions should be least privilege`);
    assert.equal(yaml.includes('write-all'), false, `${fileName} must not use write-all`);
  }
});

test('phase 43a p2: read-only validation workflows do not request write scopes', () => {
  const readOnlyWorkflows = ['copy-lint.yml', 'doc-audit.yml', 'indexnow-on-deploy.yml', 'portability.yml', 'pr-validation.yml'];

  for (const fileName of readOnlyWorkflows) {
    const yaml = fs.readFileSync(path.join(WORKFLOW_DIR, fileName), 'utf8');
    const permissions = parseTopLevelPermissions(yaml);

    assert.deepEqual(permissions, { contents: 'read' }, `${fileName} should stay read-only`);
  }
});
