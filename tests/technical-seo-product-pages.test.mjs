import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  buildOfferJsonLd,
  buildProductIndexHtml,
  buildProductJsonLd,
  buildProductPageHtml,
  generateProductPages,
  productName,
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
      verified_at: '2026-05-09',
      trust_level: 'verified_fit',
      verified_fields: ['dimensions', 'clearance'],
      clearance_verified: true,
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
  assert.equal(schema.image, 'https://www.fitappliance.com.au/og-images/lg-washing-machine.png');
  assert.ok(schema.additionalProperty.some((row) => row.name === 'Rear clearance' && row.value === 50));
  assert.ok(schema.additionalProperty.some((row) => row.name === 'Evidence trust level' && row.value === 'Verified Fit'));
  assert.ok(schema.additionalProperty.some((row) => row.name === 'Evidence source' && /dimensions and clearance/.test(row.value)));
});

test('technical SEO: product schema adds real Offer from captured retailer price', () => {
  const schema = buildProductJsonLd(makeProduct({
    price: null,
    retailers: [
      { n: 'Appliances Online', url: 'https://www.appliancesonline.com.au/product/lg-wwt-1910bx', p: 3999 }
    ]
  }));

  assert.equal(schema.offers['@type'], 'Offer');
  assert.equal(schema.offers.price, 3999);
  assert.equal(schema.offers.priceCurrency, 'AUD');
  assert.equal(schema.offers.availability, 'https://schema.org/InStock');
  assert.equal(schema.offers.url, 'https://www.appliancesonline.com.au/product/lg-wwt-1910bx');
  assert.deepEqual(schema.offers.seller, { '@type': 'Organization', name: 'Appliances Online' });
  assert.equal(schema.offers.shippingDetails['@type'], 'OfferShippingDetails');
  assert.deepEqual(schema.offers.shippingDetails.shippingDestination, { '@type': 'DefinedRegion', addressCountry: 'AU' });
  assert.equal(schema.offers.shippingDetails.shippingRate.currency, 'AUD');
  assert.equal(schema.offers.hasMerchantReturnPolicy['@type'], 'MerchantReturnPolicy');
  assert.equal(schema.offers.hasMerchantReturnPolicy.merchantReturnLink, 'https://www.fitappliance.com.au/terms#affiliate-retailer-policies');
  assert.equal(schema.offers.hasMerchantReturnPolicy.returnPolicyCategory, undefined);
  assert.equal(schema.offers.hasMerchantReturnPolicy.applicableCountry, undefined);
});

test('technical SEO: product schema aggregates multiple real retailer prices', () => {
  const offers = buildOfferJsonLd(makeProduct({
    retailers: [
      { n: 'Appliances Online', url: 'https://www.appliancesonline.com.au/product/lg-wwt-1910bx', p: 3999 },
      { n: 'The Good Guys', url: 'https://www.thegoodguys.com.au/lg-wwt-1910bx', p: 4099 }
    ]
  }));

  assert.equal(offers['@type'], 'AggregateOffer');
  assert.equal(offers.lowPrice, 3999);
  assert.equal(offers.highPrice, 4099);
  assert.equal(offers.offerCount, 2);
  assert.equal(offers.priceCurrency, 'AUD');
  assert.equal(offers.shippingDetails['@type'], 'OfferShippingDetails');
  assert.equal(offers.hasMerchantReturnPolicy['@type'], 'MerchantReturnPolicy');
  assert.equal(offers.hasMerchantReturnPolicy.returnPolicyCategory, undefined);
  assert.equal(offers.offers.length, 2);
  assert.equal(offers.offers[0].shippingDetails['@type'], 'OfferShippingDetails');
  assert.equal(offers.offers[0].hasMerchantReturnPolicy['@type'], 'MerchantReturnPolicy');
  assert.equal(offers.offers[0].hasMerchantReturnPolicy.returnPolicyCategory, undefined);
});

test('technical SEO: product schema falls back to stable image asset when brand category image is absent', () => {
  const schema = buildProductJsonLd(makeProduct({
    brand: 'Example Missing Brand',
    cat: 'fridge'
  }));

  assert.equal(schema.image, 'https://www.fitappliance.com.au/og-images/guide-appliance-fit-sizing-handbook.png');
});

test('technical SEO: product schema does not invent Offer when price is absent', () => {
  const schema = buildProductJsonLd(makeProduct({
    price: null,
    retailers: [
      { n: 'Appliances Online', url: 'https://www.appliancesonline.com.au/product/lg-wwt-1910bx', p: null }
    ]
  }));

  assert.equal(schema.offers, undefined);
});

test('technical SEO: product page avoids Product schema when no rich-result qualifier exists', () => {
  const product = makeProduct();
  const slug = slugifyProduct(product);
  const html = buildProductPageHtml(product);
  const jsonLd = extractJsonLd(html);

  assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.fitappliance\\.com\\.au/products/${slug}">`));
  assert.match(html, /LG WWT-1910BX WashTower Exact Dimensions &amp; Verified Cavity Fit \| FitAppliance/);
  assert.equal(jsonLd.some((block) => block['@type'] === 'Product'), false);
  assert.ok(jsonLd.some((block) => block['@type'] === 'BreadcrumbList'), 'Breadcrumb JSON-LD missing');
  assert.ok(jsonLd.some((block) => block['@type'] === 'FAQPage'), 'FAQ JSON-LD missing');
});

test('technical SEO: product page emits Product schema only with real priced offer', () => {
  const html = buildProductPageHtml(makeProduct({
    retailers: [
      { n: 'Appliances Online', url: 'https://www.appliancesonline.com.au/product/lg-wwt-1910bx', p: 3999 }
    ]
  }));
  const jsonLd = extractJsonLd(html);
  const productSchema = jsonLd.find((block) => block['@type'] === 'Product');

  assert.ok(productSchema, 'Product JSON-LD missing for priced retailer offer');
  assert.equal(productSchema.offers['@type'], 'Offer');
  assert.equal(productSchema.offers.price, 3999);
});

test('technical SEO: product page displays captured retailer price used by Offer schema', () => {
  const html = buildProductPageHtml(makeProduct({
    retailers: [
      { n: 'Appliances Online', url: 'https://www.appliancesonline.com.au/product/lg-wwt-1910bx', p: 3999 }
    ]
  }));

  assert.match(html, />Appliances Online · \$3,999<\/a>/);
});

test('technical SEO: product names always include model for unique GSC crawl signals', () => {
  assert.equal(
    productName(makeProduct({
      brand: 'CHIQ',
      model: 'CSH310NBSL',
      displayName: 'CHiQ Fridge'
    })),
    'CHiQ Fridge CSH310NBSL'
  );

  assert.equal(
    productName(makeProduct({
      brand: 'Westinghouse',
      model: 'WBE5300SBL',
      displayName: 'Westinghouse 528L Bottom Mount Fridge WBE5300SBL'
    })),
    'Westinghouse 528L Bottom Mount Fridge WBE5300SBL'
  );
});

test('technical SEO: dimensions-only and retailer spec pages avoid Verified Fit wording', () => {
  const dimensionsOnly = buildProductPageHtml(makeProduct({
    evidence: {
      has_pdf_evidence: true,
      source_url: 'https://example.com/dimensions.pdf',
      verified_at: '2026-05-09',
      trust_level: 'dimensions_verified',
      verified_fields: ['dimensions'],
      clearance_verified: false,
    },
    data_source: 'official_pdf_dimensions_only',
  }));
  assert.match(dimensionsOnly, /Dimensions Verified/);
  assert.match(dimensionsOnly, /Exact Dimensions &amp; Clearance Estimate/);
  assert.doesNotMatch(dimensionsOnly, /Verified PDF evidence/);

  const retailerSpec = buildProductPageHtml(makeProduct({
    evidence: {
      has_pdf_evidence: false,
      source_url: 'https://www.appliancesonline.com.au/product/example',
      verified_at: '2026-05-09',
      trust_level: 'retailer_spec',
      verified_fields: ['dimensions'],
      clearance_verified: false,
    },
    data_source: 'retailer_spec',
  }));
  assert.match(retailerSpec, /Retailer Spec/);
  assert.match(retailerSpec, /Retailer Dimensions/);
  assert.doesNotMatch(retailerSpec, /Verified Cavity Fit/);
});

test('technical SEO: product page exposes V2 field review without claiming clearance approval', () => {
  const html = buildProductPageHtml(makeProduct({
    evidence: {
      has_pdf_evidence: true,
      trust_level: 'dimensions_verified',
      verified_fields: ['dimensions'],
      clearance_verified: false,
      v2_review: {
        status: 'dimensions_approved',
        reviewed_at: '2026-07-11',
        approved_fields: ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'],
        source_document_id: 'doc-test',
      },
    },
  }));
  assert.match(html, /Architecture V2 evidence review/);
  assert.match(html, /Width, height, depth/);
  assert.match(html, /Reviewed:<\/strong> 11 Jul 2026/);
  assert.match(html, /Installation clearance remains unapproved/);
  assert.doesNotMatch(html, /Clearance approved/);
});

test('technical SEO: product page separates approved installation and operation facts from unknown fit fields', () => {
  const html = buildProductPageHtml(makeProduct({
    evidence: {
      has_pdf_evidence: true,
      trust_level: 'dimensions_verified',
      verified_fields: ['dimensions'],
      clearance_verified: false,
      v2_review: {
        status: 'space_partially_approved',
        reviewed_at: '2026-07-11',
        approved_fields: [
          'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
          'installation.leftMm', 'installation.rightMm', 'installation.rearMm',
          'operation.doorOpenDepthMm',
        ],
        approved_space_values: {
          'installation.leftMm': 20,
          'installation.rightMm': 20,
          'installation.rearMm': 100,
          'operation.doorOpenDepthMm': 1135,
        },
      },
    },
  }));
  assert.match(html, /Left installation clearance: 20 mm/);
  assert.match(html, /Rear installation clearance: 100 mm/);
  assert.match(html, /Door-open total depth: 1135 mm/);
  assert.match(html, /remaining space requirements are unknown/i);
  assert.doesNotMatch(html, />Verified Fit</);
});

test('technical SEO: generated product pages include only PDF-verified SKUs', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fitappliance-product-pages-'));
  await fs.mkdir(path.join(rootDir, 'data', 'architecture-v2'), { recursive: true });
  await fs.writeFile(path.join(rootDir, 'data', 'architecture-v2', 'public-catalog-projection.json'), `${JSON.stringify({
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
