import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  getFitCheckSlug,
  loadDimensionAxisBlockerIds,
  selectFitCheckCombinations,
  writePages
} = require('../scripts/generate-fit-check-pages.js');

test('fit-check generator excludes dimension-axis blocker products from published combinations', () => {
  const catalog = [
    { id: 'bad', cat: 'fridge', brand: 'Westinghouse', model: 'WBE4302WC', w: 1725, h: 699, d: 723, priorityScore: 100 },
    { id: 'good', cat: 'fridge', brand: 'Electrolux', model: 'EBE4302BD', w: 699, h: 1725, d: 723, priorityScore: 90 }
  ];
  const blockedProductIds = new Set(['bad']);

  const combos = selectFitCheckCombinations(catalog, { topN: 20, cavityWidths: [620], blockedProductIds });

  assert.equal(combos.some((combo) => combo.product.id === 'bad'), false);
  assert.equal(combos.some((combo) => combo.product.id === 'good'), true);
});

test('fit-check generator loads blocker ids from dimension-axis report', () => {
  const tmpRoot = mkdtempSync(path.join(tmpdir(), 'fit-check-blockers-'));
  try {
    const reportDir = path.join(tmpRoot, 'reports', 'dimension-axis');
    const reportPath = path.join(reportDir, 'latest.json');
    mkdirp(reportDir);
    writeJson(reportPath, {
      issues: [
        { severity: 'warning', productId: 'review-only' },
        { severity: 'blocker', productId: 'blocked-a' },
        { severity: 'blocker', productId: 'blocked-b' }
      ]
    });

    const blocked = loadDimensionAxisBlockerIds(tmpRoot);

    assert.deepEqual([...blocked].sort(), ['blocked-a', 'blocked-b']);
  } finally {
    rmSync(tmpRoot, { force: true, recursive: true });
  }
});

test('fit-check generator writes blocker products to quarantine report instead of HTML', () => {
  const tmpRoot = mkdtempSync(path.join(tmpdir(), 'fit-check-quarantine-'));
  try {
    const blocked = { id: 'bad', cat: 'fridge', brand: 'Westinghouse', model: 'WBE4302WC', w: 1725, h: 699, d: 723, priorityScore: 100 };
    const allowed = { id: 'good', cat: 'fridge', brand: 'Electrolux', model: 'EBE4302BD', w: 699, h: 1725, d: 723, priorityScore: 90 };
    const blockedProductIds = new Set(['bad']);
    const combos = selectFitCheckCombinations([blocked, allowed], {
      topN: 20,
      cavityWidths: [620],
      blockedProductIds
    });

    writePages(combos, {
      repoRoot: tmpRoot,
      allProducts: [blocked, allowed],
      blockedProductIds,
      quarantinedProducts: [blocked]
    });

    const blockedSlug = getFitCheckSlug(blocked, 620);
    const allowedSlug = getFitCheckSlug(allowed, 620);
    const quarantinePath = path.join(tmpRoot, 'reports', 'fit-check', 'quarantined', 'latest.json');
    const quarantine = JSON.parse(readFileSync(quarantinePath, 'utf8'));

    assert.equal(existsSync(path.join(tmpRoot, 'pages', 'fit-check', `${blockedSlug}.html`)), false);
    assert.equal(existsSync(path.join(tmpRoot, 'pages', 'fit-check', `${allowedSlug}.html`)), true);
    assert.deepEqual(quarantine.products.map((product) => product.id), ['bad']);
  } finally {
    rmSync(tmpRoot, { force: true, recursive: true });
  }
});

test('fit-check generator removes stale fit-check HTML before writing current combinations', () => {
  const tmpRoot = mkdtempSync(path.join(tmpdir(), 'fit-check-stale-'));
  try {
    const outputDir = path.join(tmpRoot, 'pages', 'fit-check');
    mkdirp(outputDir);
    const stalePath = path.join(outputDir, 'westinghouse-wbe4302wc-in-620mm-cavity.html');
    writeFileSync(stalePath, '<p>Westinghouse WBE4302WC is 1725mm wide.</p>', 'utf8');

    const allowed = { id: 'good', cat: 'fridge', brand: 'Electrolux', model: 'EBE4302BD', w: 699, h: 1725, d: 723, priorityScore: 90 };
    const combos = selectFitCheckCombinations([allowed], {
      topN: 20,
      cavityWidths: [620]
    });

    writePages(combos, {
      repoRoot: tmpRoot,
      allProducts: [allowed]
    });

    assert.equal(existsSync(stalePath), false);
    assert.equal(existsSync(path.join(outputDir, 'electrolux-ebe4302bd-in-620mm-cavity.html')), true);
  } finally {
    rmSync(tmpRoot, { force: true, recursive: true });
  }
});

function mkdirp(dirPath) {
  const { mkdirSync } = require('node:fs');
  mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  const { writeFileSync } = require('node:fs');
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
