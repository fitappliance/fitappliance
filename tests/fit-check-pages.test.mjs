import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import * as cheerio from 'cheerio';

import {
  buildFitCheckPage,
  selectFitCheckCombinations,
  textSimilarity,
  writePages
} from '../scripts/generate-fit-check-pages.js';

const repoRoot = path.resolve(import.meta.dirname, '..');

function loadCatalog() {
  const files = ['fridges.json', 'dishwashers.json', 'dryers.json', 'washing-machines.json'];
  return files.flatMap((file) => {
    const data = JSON.parse(readFileSync(path.join(repoRoot, 'public', 'data', file), 'utf8'));
    return data.products ?? [];
  });
}

describe('fit-check page generator', () => {
  const catalog = loadCatalog();

  it('selectFitCheckCombinations respects topN, cavity widths, and limit', () => {
    const combos = selectFitCheckCombinations(catalog, {
      topN: 3,
      cavityWidths: [540, 600],
      limit: 5
    });

    assert.equal(combos.length, 5);
    assert.ok(combos.every((combo) => combo.product?.id));
    assert.deepEqual([...new Set(combos.map((combo) => combo.cavityW))].sort((a, b) => a - b), [540, 600]);
  });

  it('buildFitCheckPage returns a full page with H1, dimensions, FAQ, and schema', () => {
    const combo = selectFitCheckCombinations(catalog, { topN: 20, limit: 1 })[0];
    const page = buildFitCheckPage(combo.product, combo.cavityW, catalog);
    const $ = cheerio.load(page.html);
    const scripts = $('script[type="application/ld+json"]')
      .map((_, node) => JSON.parse($(node).text()))
      .get();

    assert.match(page.slug, /-in-\d+mm-cavity$/);
    assert.match($('h1').first().text(), new RegExp(String(combo.cavityW)));
    assert.ok($('.verdict-box').text().length > 20);
    assert.equal($('.dimensions-table').length, 1);
    assert.ok($('.faq-list dt').length >= 5);
    assert.ok(scripts.some((entry) => entry['@type'] === 'Article'));
    assert.ok(scripts.some((entry) => entry['@type'] === 'FAQPage'));
  });

  it('two adjacent products in the same cavity are not doorway duplicates', () => {
    const combos = selectFitCheckCombinations(catalog, {
      topN: 30,
      cavityWidths: [600],
      limit: 2
    });
    assert.equal(combos.length, 2);

    const first = buildFitCheckPage(combos[0].product, combos[0].cavityW, catalog).html;
    const second = buildFitCheckPage(combos[1].product, combos[1].cavityW, catalog).html;

    assert.ok(textSimilarity(first, second) < 0.8);
  });

  it('writePages creates valid sample pages and a validation report', () => {
    const tmpRoot = mkdtempSync(path.join(tmpdir(), 'fit-check-pages-'));
    try {
      const combos = selectFitCheckCombinations(catalog, { topN: 30, limit: 10 });
      const result = writePages(combos, { repoRoot: tmpRoot, allProducts: catalog });
      const reportPath = path.join(tmpRoot, 'reports', 'fit-check', 'sample-validation.json');
      const report = JSON.parse(readFileSync(reportPath, 'utf8'));

      assert.equal(result.count, 10);
      assert.equal(report.pages.length, 10);
      assert.ok(report.pages.every((page) => page.slug && page.verdict));

      for (const page of report.pages) {
        const htmlPath = path.join(tmpRoot, 'pages', 'fit-check', `${page.slug}.html`);
        assert.equal(existsSync(htmlPath), true);
        const $ = cheerio.load(readFileSync(htmlPath, 'utf8'));
        assert.equal($('h1').length, 1);
        assert.ok($('script[type="application/ld+json"]').length >= 2);
      }
    } finally {
      rmSync(tmpRoot, { force: true, recursive: true });
    }
  });
});
