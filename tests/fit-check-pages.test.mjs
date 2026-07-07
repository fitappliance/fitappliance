import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import * as cheerio from 'cheerio';

import {
  buildFitCheckPage,
  getFitCheckSlug,
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

function writeGeoTreatmentManifest(repoRoot, { treatmentRoute, controlRoute }) {
  mkdirSync(path.join(repoRoot, 'data'), { recursive: true });
  writeFileSync(
    path.join(repoRoot, 'data', 'geo-treatment-pages.json'),
    `${JSON.stringify({
      schema_version: 1,
      experiment: 'phase43-geo',
      started_at: '2026-07-06',
      treatment: [{
        route: treatmentRoute,
        template: 'fit-check',
        primary_query: 'Will the Fisher & Paykel DW60UZT4B2 fit a 640mm cavity?',
        match_key: 'fit-check:dishwasher:640:test',
        evidence_level: 'dimension-axis-pass',
        measurement_bucket: 'fit-check-dishwasher-640'
      }],
      controls: [{
        route: controlRoute,
        template: 'fit-check',
        primary_query: 'Will the Fisher & Paykel DW60UT4I2 fit a 640mm cavity?',
        match_key: 'fit-check:dishwasher:640:test',
        evidence_level: 'dimension-axis-pass',
        measurement_bucket: 'fit-check-dishwasher-640'
      }]
    }, null, 2)}\n`,
    'utf8'
  );
}

function extractJsonLd(html) {
  const $ = cheerio.load(html);
  return $('script[type="application/ld+json"]')
    .map((_, node) => JSON.parse($(node).text()))
    .get();
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

  it('renders alternatives with the Phase 55 three-zone card contract', () => {
    const combos = selectFitCheckCombinations(catalog, {
      topN: 50,
      cavityWidths: [540, 580, 600, 620, 640],
      limit: 40
    });
    const page = combos
      .map((combo) => buildFitCheckPage(combo.product, combo.cavityW, catalog))
      .find((candidate) => cheerio.load(candidate.html)('.alternative-grid .p-row--rtings').length > 0);

    assert.ok(page, 'expected at least one generated page with alternatives');
    const $ = cheerio.load(page.html);
    const alternatives = $('.alternative-grid .p-row--rtings');

    assert.ok(alternatives.length > 0);
    assert.equal($('.alternative-grid .card-zone-a').length, alternatives.length);
    assert.equal($('.alternative-grid .card-zone-b').length, alternatives.length);
    assert.equal($('.alternative-grid .card-zone-c').length, alternatives.length);
    assert.ok($('.alternative-grid .clearance-bar').length >= alternatives.length);
    assert.ok($('.alternative-grid .card-availability').length >= alternatives.length);
    assert.doesNotMatch(page.html, /We earn a commission/i);
    assert.doesNotMatch(page.html, /\$[0-9][0-9][0-9]/);
  });

  it('only recommends current active products in fit-check alternatives', () => {
    const target = {
      id: 'target-current',
      cat: 'fridge',
      brand: 'Target',
      model: 'Current 700L',
      w: 700,
      h: 1780,
      d: 700,
      stars: 4,
      priorityScore: 1,
      unavailable: false,
      retailers: [{ n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/target-current-700l' }]
    };
    const archivedAlternative = {
      ...target,
      id: 'archived-best-fit',
      brand: 'Archived',
      model: 'Old Perfect Fit',
      w: 570,
      priorityScore: 100,
      unavailable: true,
      retailers: [{ n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/archived-old-perfect-fit' }]
    };
    const activeAlternative = {
      ...target,
      id: 'active-better-fit',
      brand: 'Active',
      model: 'Current Better Fit',
      w: 575,
      priorityScore: 10,
      unavailable: false,
      retailers: [{ n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/active-current-better-fit' }]
    };

    const page = buildFitCheckPage(target, 600, [target, archivedAlternative, activeAlternative]);

    assert.match(page.html, /Current Better Fit/);
    assert.doesNotMatch(page.html, /Old Perfect Fit/);
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

  it('phase 43 GEO treatment adds visible answer/evidence blocks only to treatment fit-check pages', () => {
    const tmpRoot = mkdtempSync(path.join(tmpdir(), 'fit-check-geo-treatment-'));
    try {
      const treatmentProduct = catalog.find((product) => product.model === 'DW60UZT4B2');
      const controlProduct = catalog.find((product) => product.model === 'DW60UT4I2');
      assert.ok(treatmentProduct, 'expected DW60UZT4B2 fixture product');
      assert.ok(controlProduct, 'expected DW60UT4I2 fixture product');

      const treatmentSlug = getFitCheckSlug(treatmentProduct, 640);
      const controlSlug = getFitCheckSlug(controlProduct, 640);
      writeGeoTreatmentManifest(tmpRoot, {
        treatmentRoute: `/fit-check/${treatmentSlug}`,
        controlRoute: `/fit-check/${controlSlug}`
      });

      writePages([
        { product: treatmentProduct, cavityW: 640 },
        { product: controlProduct, cavityW: 640 }
      ], { repoRoot: tmpRoot, allProducts: catalog });

      const treatmentHtml = readFileSync(path.join(tmpRoot, 'pages', 'fit-check', `${treatmentSlug}.html`), 'utf8');
      const controlHtml = readFileSync(path.join(tmpRoot, 'pages', 'fit-check', `${controlSlug}.html`), 'utf8');
      const treatmentSchemas = extractJsonLd(treatmentHtml);
      const faqSchema = treatmentSchemas.find((entry) => entry['@type'] === 'FAQPage');

      assert.match(treatmentHtml, /class="geo-answer-target"/);
      assert.match(treatmentHtml, /class="geo-evidence-box"/);
      assert.ok(
        treatmentHtml.indexOf('class="geo-answer-target"') < treatmentHtml.indexOf('<h2>Product dimensions</h2>'),
        'answer block should appear before long supporting detail'
      );
      assert.match(treatmentHtml, /href="\/products\/fisher-paykel-dw60uzt4b2-dishwasher-adw0956"/);
      assert.match(treatmentHtml, /href="\/guides\/dishwasher-cavity-sizing"/);
      assert.match(treatmentHtml, /href="#product-dimensions"/);
      assert.match(treatmentHtml, new RegExp(`W ${treatmentProduct.w}mm / H ${treatmentProduct.h}mm / D ${treatmentProduct.d}mm`));
      assert.doesNotMatch(treatmentHtml, /85% of users|trim cabinetry|cut cabinetry|zero-click|guaranteed/i);
      assert.ok(treatmentSchemas.every((entry) => entry['@type'] !== 'Product'), 'fit-check treatment must not add Product schema');
      assert.ok(faqSchema.mainEntity.some((row) => row.acceptedAnswer.text.includes(`${treatmentProduct.w}mm`)));
      assert.match(treatmentHtml, new RegExp(`<td>${treatmentProduct.w}mm</td>`));

      assert.doesNotMatch(controlHtml, /class="geo-answer-target"/);
      assert.doesNotMatch(controlHtml, /class="geo-evidence-box"/);
    } finally {
      rmSync(tmpRoot, { force: true, recursive: true });
    }
  });
});
