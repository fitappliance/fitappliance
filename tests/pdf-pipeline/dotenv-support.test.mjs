import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const entryFiles = [
  'scripts/pdf-pipeline/1-fetch.js',
  'scripts/pdf-pipeline/2-extract-text.js',
  'scripts/pdf-pipeline/3-ai-parse.js',
  'scripts/pdf-pipeline/4-validate.js',
  'scripts/pdf-pipeline/5-merge.js',
  'scripts/pdf-pipeline/run-batch.js',
  'scripts/pdf-pipeline/run-pilot.js'
];

test('pdf pipeline entry scripts load .env via dotenv before reading API keys', () => {
  for (const filePath of entryFiles) {
    const head = fs.readFileSync(filePath, 'utf8').split('\n').slice(0, 5).join('\n');
    assert.match(head, /require\('dotenv'\)\.config\(\{ quiet: true \}\);/, `${filePath} should load dotenv quietly at the top`);
  }
});

test('dotenv is declared as a development dependency for local pipeline runs', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.match(pkg.devDependencies?.dotenv || '', /^\^?\d+\.\d+\.\d+/);
});
