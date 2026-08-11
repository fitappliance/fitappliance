import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { auditPublicationBoundary } = require('../scripts/audit-publication-boundary.js');

async function createWorkspace(workflow) {
  const root = await mkdtemp(path.join(tmpdir(), 'fitappliance-publication-boundary-'));
  const workflowDir = path.join(root, '.github', 'workflows');
  await mkdir(workflowDir, { recursive: true });
  await writeFile(path.join(workflowDir, 'candidate.yml'), workflow, 'utf8');
  return root;
}

const safeWorkflow = `name: Safe audit
on: workflow_dispatch
permissions:
  contents: read
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
`;

test('publication boundary rejects legacy sync and direct runtime publication to main', async () => {
  const root = await createWorkspace(`name: Unsafe publisher
on: workflow_dispatch
permissions:
  contents: write
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - run: npm run sync
      - run: |
          git add public/data pages/compare public/sitemap.xml
          git commit -m "publish"
          git push origin main
`);

  const result = await auditPublicationBoundary({ repoRoot: root, logger: { log() {}, error() {} } });
  assert.equal(result.exitCode, 1);
  assert.deepEqual(
    new Set(result.violations.map((violation) => violation.rule)),
    new Set([
      'legacy-runtime-sync',
      'direct-default-branch-push',
      'runtime-update-without-pr',
      'runtime-update-without-canonical-build',
      'missing-pull-request-permission'
    ])
  );
  assert.equal(result.violations.every((violation) => violation.file === '.github/workflows/candidate.yml'), true);
  assert.equal(result.violations.every((violation) => Number.isInteger(violation.line) && violation.line > 0), true);
});

test('publication boundary accepts canonical build changes opened as a bot-branch PR', async () => {
  const root = await createWorkspace(`name: Safe publisher
on: workflow_dispatch
permissions:
  actions: write
  contents: write
  pull-requests: write
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - run: npm run build
      - env:
          GH_TOKEN: \${{ github.token }}
        run: |
          branch="automation/safe-\${GITHUB_RUN_ID}"
          git switch -c "$branch"
          git add -A
          git commit -m "chore: propose generated output"
          git push -u origin "$branch"
          gh pr create --base main --head "$branch" --title "Generated output" --body "Review required."
          gh workflow run pr-validation.yml --ref "$branch"
`);

  const result = await auditPublicationBoundary({ repoRoot: root, logger: { log() {}, error() {} } });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.violations, []);
});

test('publication boundary rejects bot PRs that cannot start unattended validation', async () => {
  const root = await createWorkspace(`name: Unvalidated publisher
on: workflow_dispatch
permissions:
  contents: write
  pull-requests: write
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - run: npm run build
      - run: |
          branch="automation/unvalidated-\${GITHUB_RUN_ID}"
          git switch -c "$branch"
          git add -A
          git commit -m "chore: propose generated output"
          git push -u origin "$branch"
          gh pr create --base main --head "$branch" --title "Generated output" --body "Review required."
`);

  const result = await auditPublicationBoundary({ repoRoot: root, logger: { log() {}, error() {} } });
  assert.equal(result.exitCode, 1);
  assert.deepEqual(
    new Set(result.violations.map((violation) => violation.rule)),
    new Set(['missing-validation-dispatch', 'missing-actions-permission'])
  );
});

test('publication boundary rejects legacy runtime mutation commands without a git publish step', async () => {
  const commands = [
    'npm run generate-all',
    'npm run enrich-evidence',
    'npm run enrich-manual-retailers',
    'node scripts/architecture-v2/publish-runtime-projection.js'
  ];

  for (const command of commands) {
    const root = await createWorkspace(`name: Legacy runtime command
on: workflow_dispatch
permissions:
  contents: read
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - run: ${command}
`);
    const result = await auditPublicationBoundary({ repoRoot: root, logger: { log() {}, error() {} } });
    assert.equal(result.exitCode, 1, command);
    assert.equal(
      result.violations.some((violation) => violation.rule === 'legacy-runtime-mutation'),
      true,
      command
    );
  }
});

test('publication boundary rejects private Partnerize data and stale retailer links in public artifacts', async () => {
  const root = await createWorkspace(safeWorkflow);
  await mkdir(path.join(root, 'public', 'data'), { recursive: true });
  await mkdir(path.join(root, 'pages', 'products'), { recursive: true });
  await writeFile(path.join(root, 'public', 'data', 'appliances.json'), JSON.stringify({
    products: [{ id: 'safe', retailers: [] }],
  }));
  await writeFile(path.join(root, 'pages', 'products', 'leak.html'), `
    <a href="https://prf.hn/click/camref:redacted">Buy</a>
    <a href="https://www.thegoodguys.com.au/private-feed-product">The Good Guys</a>
    <script type="application/ld+json">{"commission_exclusion_reason":"private"}</script>
  `);

  const result = await auditPublicationBoundary({
    repoRoot: root,
    logger: { log() {}, error() {} },
  });
  assert.equal(result.exitCode, 1);
  assert.deepEqual(
    new Set(result.violations.map((violation) => violation.rule)),
    new Set(['private-retailer-feed-marker', 'unbound-retailer-product-link']),
  );
});

test('publication boundary permits a retailer URL only when the public catalog contains it', async () => {
  const root = await createWorkspace(safeWorkflow);
  const url = 'https://www.thegoodguys.com.au/publicly-authorized-product';
  await mkdir(path.join(root, 'public', 'data'), { recursive: true });
  await mkdir(path.join(root, 'pages', 'products'), { recursive: true });
  await writeFile(path.join(root, 'public', 'data', 'appliances.json'), JSON.stringify({
    products: [{ id: 'safe', retailers: [{ n: 'The Good Guys', url }] }],
  }));
  await writeFile(
    path.join(root, 'pages', 'products', 'safe.html'),
    `<a href="${url}">The Good Guys</a>`,
  );

  const result = await auditPublicationBoundary({
    repoRoot: root,
    logger: { log() {}, error() {} },
  });
  assert.equal(result.exitCode, 0, JSON.stringify(result.violations, null, 2));
});

test('repository workflows satisfy the publication boundary', async () => {
  const result = await auditPublicationBoundary({ repoRoot: process.cwd(), logger: { log() {}, error() {} } });
  assert.equal(result.exitCode, 0, JSON.stringify(result.violations, null, 2));
  assert.deepEqual(result.violations, []);
});
