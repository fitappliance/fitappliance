import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const GENERATED_OUTPUT_SCRIPTS = [
  'scripts/generate-ui-copy.js',
  'scripts/pick-review-pilot.js',
  'scripts/generate-brand-pages.js',
  'scripts/inject-video-schema.js',
  'scripts/generate-comparisons.js',
  'scripts/generate-cavity-pages.js',
  'scripts/generate-doorway-pages.js',
  'scripts/generate-guides.js',
  'scripts/generate-location-pages.js',
  'scripts/generate-sitemap.js',
  'scripts/generate-sw.js',
  'scripts/generate-og-images.js',
  'scripts/optimize-og-images.js',
  'scripts/generate-image-sitemap.js',
  'scripts/generate-rss.js',
  'scripts/build-link-graph.js',
  'scripts/validate-schema.js'
];

const WALLCLOCK_PATTERNS = [
  { name: 'new Date', pattern: /\bnew\s+Date\s*\(/ },
  { name: 'Date.now', pattern: /\bDate\.now\b/ },
  { name: 'Math.random', pattern: /\bMath\.random\s*\(/ }
];

const ALLOWED_WALLCLOCK_LINES = [
  {
    file: 'scripts/generate-guides.js',
    pattern: /\bnew\s+Date\s*\(/,
    reason: 'parses git log timestamps supplied as input; does not read wallclock time'
  },
  {
    file: 'scripts/generate-sw.js',
    pattern: /\bDate\.now\b/,
    reason: 'runtime cache freshness clock in generated service worker helpers; injectable in tests'
  },
  {
    file: 'scripts/generate-comparisons.js',
    pattern: /gtag\('js', new Date\(\)\);/,
    reason: 'literal client-side analytics snippet emitted into HTML, not a Node build timestamp'
  }
];

function isAllowedLine(file, line) {
  return ALLOWED_WALLCLOCK_LINES.some((entry) =>
    entry.file === file && entry.pattern.test(line)
  );
}

function findWallclockUsages(file, source) {
  const violations = [];
  const lines = source.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (isAllowedLine(file, line)) return;

    for (const { name, pattern } of WALLCLOCK_PATTERNS) {
      if (pattern.test(line)) {
        violations.push({
          file,
          line: index + 1,
          token: name,
          source: line.trim()
        });
      }
    }
  });

  return violations;
}

test('phase 43a cleanup: wallclock audit flags generated-output fixture usage', () => {
  const violations = findWallclockUsages('scripts/generate-fixture.js', [
    'const stamp = new Date();',
    'const id = Math.random();',
    'const now = Date.now();'
  ].join('\n'));

  assert.deepEqual(violations.map((row) => row.token), ['new Date', 'Math.random', 'Date.now']);
});

test('phase 46 date drift: comparison generator fixture cannot add build-time wallclock', () => {
  const violations = findWallclockUsages('scripts/generate-comparisons.js', [
    'const modified = new Date().toISOString();',
    "const analytics = \"gtag('js', new Date());\";"
  ].join('\n'));

  assert.deepEqual(violations, [
    {
      file: 'scripts/generate-comparisons.js',
      line: 1,
      token: 'new Date',
      source: 'const modified = new Date().toISOString();'
    }
  ]);
});

test('phase 43a cleanup: generated-output scripts use deterministic build timestamps', () => {
  const violations = GENERATED_OUTPUT_SCRIPTS.flatMap((file) => {
    const fullPath = path.join(repoRoot, file);
    const source = fs.readFileSync(fullPath, 'utf8');
    return findWallclockUsages(file, source);
  });

  assert.deepEqual(violations, []);
});
