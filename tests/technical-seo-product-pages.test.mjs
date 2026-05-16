import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  buildProductIndexHtml,
  buildProductJsonLd,
  buildProductPageHtml,
  generateProductPages,
  slugifyProduct,
  selectVerifiedProducts
} = require('../scripts/generate-product-pages.js');

function makeProduct(overrides = {}) {
  return {
    id: 'washing_machine-acw1910',
    cat: 'washtower_combo',
    brand: 'LG',
    model: 'WWT-1910BX',
    displayName: 'LG WWT-1910BX WashTower',
    w: 600,
    h: 1890,
    d: 660,
    unavailable: false,
    retailers: [
      { n: 'Appliances Online', url: 'https://www.appliancesonline.com.au/product/lg-wwt-1910bx' }
    ],
    evidence: {
      has_pdf_evidence: true,
      source_url: 'https://gscs-b2c.lge.com/open/downloadFile?fileId=aDEyNnLn9ZhB6npLvfqKzA',
      verified_at: '2026-05-09'
    },
    dimensions: {
      width_mm: 600,
      height_mm: 1890,
      depth_mm: 660,
      door_open_90_depth_mm: 1180
    },
    clearance_requirements: {
      top_mm: 5,
      left_mm: 20,
      right_mm: 20,
      rear_mm: 50
    },
    data_source: 'official_pdf',
    ...overrides
  };
}

function extractJsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
}

test('technical SEO: product schema includes physical dimensions and verified evidence', () => {
  const schema = buildProductJsonLd(makeProduct());

  assert.equal(schema['@type'], 'Product');
  assert.equal(schema.name, 'LG WWT-1910BX WashTower');
  assert.deepEqual(schema.brand, { '@type': 'Brand', name: 'LG' });
  assert.deepEqual(schema.width, { '@type': 'QuantitativeValue', value: 600, unitCode: 'MMT' });
  assert.deepEqual(schema.height, { '@type': 'QuantitativeValue', value: 1890, unitCode: 'MMT' });
  assert.deepEqual(schema.depth, { '@type': 'QuantitativeValue', value: 660, unitCode: 'MMT' });
  assert.ok(schema.additionalProperty.some((row) => row.name === 'Rear clearance' && row.value === 50));
  assert.ok(schema.additionalProperty.some((row) => row.name === 'Verified source' && /Official PDF/.test(row.value)));
});

test('technical SEO: product page renders canonical, Product, Breadcrumb, and FAQ schema', () => {
  const product = makeProduct();
  const slug = slugifyProduct(product);
  const html = buildProductPageHtml(product);
  const jsonLd = extractJsonLd(html);

  assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.fitappliance\\.com\\.au/products/${slug}">`));
  assert.match(html, /LG WWT-1910BX WashTower Exact Dimensions &amp; Verified Cavity Fit \| FitAppliance/);
  assert.ok(jsonLd.some((block) => block['@type'] === 'Product'), 'Product JSON-LD missing');
  assert.ok(jsonLd.some((block) => block['@type'] === 'BreadcrumbList'), 'Breadcrumb JSON-LD missing');
  assert.ok(jsonLd.some((block) => block['@type'] === 'FAQPage'), 'FAQ JSON-LD missing');
});

test('technical SEO: generated product pages include only PDF-verified SKUs', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fitappliance-product-pages-'));
  await fs.mkdir(path.join(rootDir, 'data'), { recursive: true });
  await fs.writeFile(path.join(rootDir, 'data', 'catalog-final.json'), `${JSON.stringify({
    products: [
      makeProduct(),
      makeProduct({
        id: 'fridge-unverified',
        cat: 'fridge',
        brand: 'Test',
        model: 'NO-PDF',
        evidence: { has_pdf_evidence: false }
      })
    ]
  }, null, 2)}\n`, 'utf8');

  const result = await generateProductPages({ repoRoot: rootDir, logger: { log() {} } });
  const indexText = await fs.readFile(path.join(rootDir, 'pages', 'products', 'index.json'), 'utf8');
  const index = JSON.parse(indexText);

  assert.equal(result.count, 1);
  assert.equal(index.length, 1);
  assert.equal(index[0].slug, slugifyProduct(makeProduct()));
  assert.match(
    await fs.readFile(path.join(rootDir, 'pages', 'products.html'), 'utf8'),
    new RegExp(`href="/products/${slugifyProduct(makeProduct())}"`)
  );
  assert.equal(selectVerifiedProducts([makeProduct(), makeProduct({ evidence: null })]).length, 1);
});

test('technical SEO: product index links generated product pages for crawl discovery', () => {
  const product = makeProduct();
  const slug = slugifyProduct(product);
  const html = buildProductIndexHtml([
    {
      slug,
      url: `/products/${slug}`,
      cat: product.cat,
      brand: product.brand,
      model: product.model
    }
  ]);

  assert.match(html, /<link rel="canonical" href="https:\/\/www\.fitappliance\.com\.au\/products">/);
  assert.match(html, new RegExp(`<a href="/products/${slug}">LG WWT-1910BX</a>`));
});

test('technical SEO: package build generates product pages before sitemap', async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf8'));

  assert.match(packageJson.scripts.build, /generate-product-pages/);
  assert.ok(
    packageJson.scripts.build.indexOf('generate-product-pages') < packageJson.scripts.build.indexOf('generate-sitemap'),
    'build must generate product index before sitemap'
  );
  assert.match(packageJson.scripts['generate-all'], /generate-product-pages/);
});
