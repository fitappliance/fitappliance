import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

function fileExists(...segments) {
  return fs.existsSync(path.join(repoRoot, ...segments));
}

function readText(...segments) {
  return fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');
}

function walkFiles(dir, {
  extensions = new Set(['.js', '.mjs', '.json', '.yml', '.yaml']),
  skipDirs = new Set(['.git', 'node_modules', 'reports'])
} = {}) {
  const root = path.join(repoRoot, dir);
  const stack = [root];
  const files = [];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!fs.existsSync(current)) continue;

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) stack.push(path.join(current, entry.name));
        continue;
      }
      if (entry.isFile() && extensions.has(path.extname(entry.name))) {
        files.push(path.join(current, entry.name));
      }
    }
  }

  return files;
}

test('phase 43a cleanup: obsolete common fit-score helper has been removed', () => {
  assert.equal(fileExists('scripts', 'common', 'fit-score.js'), false);
});

test('phase 43a cleanup: no production import points at the removed common fit-score helper', () => {
  const sourceFiles = [
    ...walkFiles('scripts'),
    ...walkFiles('public', { extensions: new Set(['.js', '.mjs', '.json']) }),
    path.join(repoRoot, 'package.json')
  ];

  const offenders = sourceFiles
    .filter((file) => fs.existsSync(file))
    .filter((file) => /(?:require\(|from\s+['"]).*(?:common\/fit-score|scripts\/common\/fit-score|\.\/fit-score)/.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(repoRoot, file));

  assert.deepEqual(offenders, []);
});

test('phase 43a cleanup: measurement generators remain wired into generate-all', () => {
  assert.equal(fileExists('scripts', 'generate-measurement-content.js'), true);
  assert.equal(fileExists('scripts', 'generate-measurement-svg.js'), true);

  const cavityGenerator = readText('scripts', 'generate-cavity-pages.js');
  assert.match(cavityGenerator, /require\('\.\/generate-measurement-content'\)/);
  assert.match(cavityGenerator, /require\('\.\/generate-measurement-svg'\)/);

  const pkg = JSON.parse(readText('package.json'));
  assert.match(pkg.scripts['generate-cavity'], /generate-cavity-pages\.js/);
  assert.match(pkg.scripts['generate-all'], /npm run generate-cavity/);
});

test('phase 43a cleanup: temporary og-sync workflow is not present', () => {
  assert.equal(fileExists('.github', 'workflows', 'og-sync.yml'), false);
});

test('phase 43a cleanup: package scripts and workflows do not reference og-sync', () => {
  const workflowFiles = walkFiles('.github', { extensions: new Set(['.yml', '.yaml']) });
  const files = [
    path.join(repoRoot, 'package.json'),
    ...workflowFiles
  ];

  const offenders = files
    .filter((file) => /og-sync/i.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(repoRoot, file));

  assert.deepEqual(offenders, []);
});
