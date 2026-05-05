import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stylesCss = fs.readFileSync(path.join(repoRoot, 'public', 'styles.css'), 'utf8');
const deferredCss = fs.readFileSync(path.join(repoRoot, 'public', 'styles-deferred.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
const combinedCss = `${indexHtml}\n${stylesCss}\n${deferredCss}`;

function blockFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = combinedCss.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, 'm'));
  return match?.[1] ?? '';
}

function fontSizeFor(selector) {
  const block = blockFor(selector);
  const match = block.match(/font-size\s*:\s*([0-9.]+)px/);
  return match ? Number(match[1]) : null;
}

test('polish readability: product row and card text uses readable minimum sizes', () => {
  assert.ok((fontSizeFor('.p-row-name') ?? 0) >= 16, '.p-row-name should be at least 16px');
  assert.ok((fontSizeFor('.card-title') ?? 0) >= 16, '.card-title should be at least 16px');
  assert.ok((fontSizeFor('.p-row-meta') ?? 0) >= 13, '.p-row-meta should be at least 13px');
  assert.ok((fontSizeFor('.card-subtitle') ?? 0) >= 13, '.card-subtitle should be at least 13px');
  assert.ok((fontSizeFor('.dim-tag') ?? 0) >= 13, '.dim-tag should be at least 13px');
  assert.ok((fontSizeFor('.spec-chip') ?? 0) >= 13, '.spec-chip should be at least 13px');
  assert.ok((fontSizeFor('.tco-row') ?? 0) >= 13, '.tco-row should be at least 13px');
  assert.ok((fontSizeFor('.card-energy-line') ?? 0) >= 13, '.card-energy-line should be at least 13px');
});

test('polish readability: secondary card/list text never drops below 11px', () => {
  const rulePattern = /([^{}]*(?:\.p-row-|\.card-)[^{}]*)\{([^{}]+)\}/g;
  const tooSmall = [];
  let match;
  while ((match = rulePattern.exec(combinedCss)) !== null) {
    const selector = match[1].trim().replace(/\s+/g, ' ');
    const body = match[2];
    const sizeMatch = body.match(/font-size\s*:\s*([0-9.]+)px/);
    if (!sizeMatch) continue;
    const size = Number(sizeMatch[1]);
    if (size < 11) tooSmall.push(`${selector}=${size}px`);
  }

  assert.deepEqual(tooSmall, []);
});

test('polish readability: body copy has slight letter spacing and system fallback fonts', () => {
  assert.match(indexHtml, /body\s*\{[^}]*letter-spacing\s*:\s*\.01em/s);
  assert.match(combinedCss, /font-family:\s*'Outfit',\s*-apple-system,\s*BlinkMacSystemFont,\s*'SF Pro Text',\s*system-ui,\s*sans-serif/);
});
