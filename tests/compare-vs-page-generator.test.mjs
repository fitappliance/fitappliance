import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generatorModule = await import(`file://${path.join(repoRoot, 'scripts', 'generate-compare-vs-pages.js')}?cacheBust=${Date.now()}`);
const {
  generateCompareVsPages,
  selectCompareVsPairs,
  slugifyCompareVs
} = generatorModule.default ?? generatorModule;

const BRANDS = ['LG', 'Samsung', 'Bosch', 'Haier', 'Hisense', 'Westinghouse', 'Fisher & Paykel', 'Miele', 'Beko', 'CHIQ', 'Electrolux', 'Smeg'];
const CATS = ['fridge', 'dishwasher', 'dryer', 'washing_machine'];

function fixtureProducts() {
  const rows = [];
  for (const cat of CATS) {
    BRANDS.forEach((brand, index) => {
      rows.push({
        id: `${cat}-${brand.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        cat,
        brand,
        model: `${brand.slice(0, 2).toUpperCase()}${index}00`,
        displayName: `${brand} ${cat}`,
        w: 600 + index,
        h: 1700 + index,
        d: 620 + index,
        stars: 3 + (index % 4),
        kwh_year: 250 + index,
        priorityScore: 100 - index,
        unavailable: index > 8,
        retailers: index < 5 ? [{ n: 'JB Hi-Fi', url: `https://www.jbhifi.com.au/products/${brand}-${cat}` }] : []
      });
    });
  }
  return rows;
}

test('phase 58 compare-vs generator: selects top-five brand pairs for each category', () => {
  const pairs = selectCompareVsPairs(fixtureProducts(), { targetPages: 100 });
  assert.ok(pairs.length >= 40, 'top five brand pairs across four categories should produce at least 40 pages');
  assert.equal(new Set(pairs.map((row) => row.slug)).size, pairs.length);
  assert.equal(slugifyCompareVs('Fisher & Paykel', 'LG', 'fridge'), 'fisher-paykel-vs-lg-fridge');
});

test('phase 58 compare-vs generator: writes new pages and preserves existing clearance index rows', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fitappliance-compare-vs-'));
  const dataDir = path.join(root, 'public', 'data');
  const outputDir = path.join(root, 'pages', 'compare');
  await mkdir(dataDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(dataDir, 'appliances.json'), JSON.stringify({
    last_updated: '2026-05-12',
    products: fixtureProducts()
  }, null, 2));
  await writeFile(path.join(outputDir, 'index.json'), JSON.stringify([
    {
      brandA: 'LG',
      brandB: 'Samsung',
      cat: 'fridge',
      slug: 'lg-vs-samsung-fridge-clearance',
      url: '/compare/lg-vs-samsung-fridge-clearance'
    }
  ], null, 2));

  const result = await generateCompareVsPages({
    repoRoot,
    dataPath: path.join(dataDir, 'appliances.json'),
    outputDir,
    targetPages: 12,
    logger: { log() {} }
  });

  assert.equal(result.generated, 12);
  const indexRows = JSON.parse(await readFile(path.join(outputDir, 'index.json'), 'utf8'));
  assert.ok(indexRows.some((row) => row.slug === 'lg-vs-samsung-fridge-clearance'), 'old clearance page index row should be preserved');
  assert.equal(indexRows.filter((row) => row.kind === 'rtings-compare').length, 12);
  const sample = await readFile(path.join(outputDir, `${result.rows[0].slug}.html`), 'utf8');
  assert.match(sample, /compare-table--rtings/);
  assert.match(sample, /"@type": "Article"/);
  assert.match(sample, /"@type": "ItemList"/);
  assert.doesNotMatch(result.rows[0].slug, /-clearance$/);
});
