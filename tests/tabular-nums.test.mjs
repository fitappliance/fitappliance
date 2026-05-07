import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stylesCss = fs.readFileSync(path.join(repoRoot, 'public', 'styles.css'), 'utf8');

function tabularRuleBody() {
  const match = stylesCss.match(/([^{}]+)\{\s*font-variant-numeric\s*:\s*tabular-nums;\s*font-feature-settings\s*:\s*"tnum";\s*\}/s);
  return match ? `${match[1]}\n${match[0]}` : '';
}

test('tabular numbers: numeric UI selectors use tabular figures', () => {
  const rule = tabularRuleBody();

  assert.match(rule, /font-variant-numeric\s*:\s*tabular-nums/);
  assert.match(rule, /font-feature-settings\s*:\s*"tnum"/);
});

test('tabular numbers: rule covers result specs fit bars and compare tables', () => {
  const rule = tabularRuleBody();

  for (const selector of [
    '.dim-tag',
    '.spec-chip',
    '.p-row-dims',
    '.card-specs-row',
    '.tco-row',
    '.card-energy-line',
    '.data-trust-line',
    '.fit-axis-bar',
    '.fit-axis-bar__label',
    'table.compare-table td',
    'table.compare-table th',
    '.results-meta-chip'
  ]) {
    assert.match(rule, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${selector} should be covered`);
  }
});

test('tabular numbers: no legacy numeric feature rule exists outside the shared selector block', () => {
  const occurrences = stylesCss.match(/font-variant-numeric\s*:\s*tabular-nums/g) ?? [];

  assert.equal(occurrences.length, 1);
});

test('tabular numbers: result metadata chips are covered for search summary numbers', () => {
  const rule = tabularRuleBody();

  assert.match(rule, /\.results-meta-chip/);
  assert.match(rule, /\.card-energy-line/);
});
