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

function receiptBoundProduct(overrides = {}, evidenceLevel = 'verified') {
  const product = makeProduct(overrides);
  const geometry = {
    category: product.cat,
    formFactor: null,
    closedEnvelope: {
      widthMm: product.w,
      heightMm: { minimumMm: product.h, maximumMm: product.h },
      depthMm: product.d,
    },
    installation: {
      leftMm: product.clearance_requirements?.left_mm ?? null,
      rightMm: product.clearance_requirements?.right_mm ?? null,
      topMm: product.clearance_requirements?.top_mm ?? null,
      rearMm: product.clearance_requirements?.rear_mm ?? null,
      frontMm: null,
    },
    operation: {
      doorOpenDepthMm: product.dimensions?.door_open_90_depth_mm ?? null,
      hingeSideSpaceMm: null,
      lidOpenHeightMm: null,
    },
    service: { plumbingRearMm: null, rearServicesMm: 50, rearVentilationMm: 50 },
    delivery: { widthMm: null, heightMm: null, depthMm: null },
  };
  const fields = evidenceLevel === 'verified'
    ? [
      'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
      'installation.leftMm', 'installation.rightMm', 'installation.topMm', 'installation.rearMm',
      'operation.doorOpenDepthMm', 'service.rearServicesMm',
    ]
    : ['closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm'];
  const fieldEvidence = Object.fromEntries(fields.map((field) => [field, {
    sourceUrl: product.evidence.source_url,
    contentSha256: 'a'.repeat(64),
    receiptBindingSha256: 'b'.repeat(64),
  }]));
  return {
    ...product,
    geometry_v2: geometry,
    geometry_v2_provenance: { evidenceLevel, fieldEvidence },
  };
}

function extractJsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
}

test('technical SEO: product schema includes physical dimensions and verified evidence', () => {
  const schema = buildProductJsonLd(receiptBoundProduct());

  assert.equal(schema['@type'], 'Product');
  assert.equal(schema.name, 'LG WWT-1910BX WashTower');
  assert.deepEqual(schema.brand, { '@type': 'Brand', name: 'LG' });
  assert.deepEqual(schema.width, { '@type': 'QuantitativeValue', value: 600, unitCode: 'MMT' });
  assert.deepEqual(schema.height, { '@type': 'QuantitativeValue', value: 1890, unitCode: 'MMT' });
  assert.deepEqual(schema.depth, { '@type': 'QuantitativeValue', value: 660, unitCode: 'MMT' });
  assert.equal(schema.image, 'https://www.fitappliance.com.au/og-images/lg-washing-machine.png');
  assert.ok(schema.additionalProperty.some((row) => row.name === 'Rear clearance' && row.value === 50));
  assert.ok(schema.additionalProperty.some((row) => row.name === 'Evidence trust level' && row.value === 'Fit Requirements Verified'));
  assert.ok(schema.additionalProperty.some((row) => row.name === 'Evidence source' && /dimensions and clearance/.test(row.value)));
});

test('technical SEO: receipt-bound adjustable height remains a range in schema, copy, and cavity maths', () => {
  const product = receiptBoundProduct({
    id: 'dishwasher-adw0961',
    cat: 'dishwasher',
    brand: 'Haier',
    model: 'HDW15F3S1',
    displayName: 'Haier Dishwasher HDW15F3S1',
    w: 597,
    h: 850,
    d: 599,
    dimensions: { width_mm: 597, height_mm: 850, depth_mm: 599 },
    clearance_requirements: { left_mm: null, right_mm: null, top_mm: null, rear_mm: null },
  }, 'dimensions');
  product.geometry_v2.closedEnvelope.heightMm = { minimumMm: 850, maximumMm: 895 };

  const schema = buildProductJsonLd(product);
  const html = buildProductPageHtml(product);
  const faq = extractJsonLd(html).find((entry) => entry['@type'] === 'FAQPage');
  const dimensionsAnswer = faq.mainEntity.find((entry) => /exact dimensions/.test(entry.name)).acceptedAnswer.text;

  assert.deepEqual(schema.height, {
    '@type': 'QuantitativeValue', minValue: 850, maxValue: 895, unitCode: 'MMT',
  });
  assert.match(html, /W 597mm, H 850-895mm, D 599mm/);
  assert.match(html, /<tr><th>Height<\/th><td>850-895mm<\/td><\/tr>/);
  assert.match(dimensionsAnswer, /850-895mm high/);
  assert.doesNotMatch(html, /<tr><th>Required height<\/th><td>850mm<\/td><\/tr>/);
});

test('technical SEO: receipt-bound manufacturer API dimensions never claim PDF or retailer evidence', () => {
  const product = receiptBoundProduct({
    id: 'dishwasher-asko-dbi253ibs',
    cat: 'dishwasher',
    brand: 'ASKO',
    model: 'DBI253IBS',
    displayName: 'ASKO DBI253IBS Dishwasher',
    w: 596,
    h: 819,
    d: 559,
    dimensions: { width_mm: 596, height_mm: 819, depth_mm: 559 },
    clearance_requirements: { left_mm: null, right_mm: null, top_mm: null, rear_mm: null },
    evidence: {
      has_pdf_evidence: false,
      has_official_evidence: true,
      source_url: 'https://api-storefront.asko.com/ggcommercewebservices/v2/asko-au/products/732487',
      source_type: 'official_model_variant_api',
      verified_at: '2026-07-16',
      trust_level: 'dimensions_verified',
      clearance_verified: false,
      acceptance: { artifact_type: 'json' },
    },
    data_source: 'official_api_receipt_bound',
  }, 'dimensions');

  const html = buildProductPageHtml(product);
  const schema = buildProductJsonLd(product);
  const sourceProperty = schema.additionalProperty.find((row) => row.name === 'Evidence source');

  assert.match(html, /manufacturer product-data dimensions/i);
  assert.match(html, /data-source="manufacturer-api-evidence"/);
  assert.match(sourceProperty.value, /manufacturer product-data dimensions/i);
  assert.doesNotMatch(html, /PDF-backed|from PDF evidence|retailer-sourced/i);
  assert.equal(
    schema.additionalProperty.find((row) => row.name === 'Data source').value,
    'official_api_receipt_bound',
  );
});

test('technical SEO: manufacturer API evidence fails closed on Fit or space claims', () => {
  const apiEvidence = {
    has_pdf_evidence: false,
    has_official_evidence: true,
    source_url: 'https://api-storefront.asko.com/ggcommercewebservices/v2/asko-au/products/732487',
    source_type: 'official_exact_model_api',
    verified_at: '2026-07-16',
    trust_level: 'dimensions_verified',
    acceptance: { artifact_type: 'json' },
  };
  const verified = receiptBoundProduct({ evidence: apiEvidence, data_source: 'official_api_receipt_bound' });
  const spaceClaim = receiptBoundProduct({ evidence: apiEvidence, data_source: 'official_api_receipt_bound' }, 'dimensions');
  spaceClaim.geometry_v2_provenance.fieldEvidence['installation.leftMm'] = {
    contentSha256: 'a'.repeat(64), receiptBindingSha256: 'b'.repeat(64),
  };

  assert.throws(() => buildProductPageHtml(verified), /cannot publish Fit or space-requirement claims/);
  assert.throws(() => buildProductPageHtml(spaceClaim), /cannot publish Fit or space-requirement claims/);
});

test('technical SEO: machine-resolved pages omit unknown clearance instead of inventing zero', () => {
  const product = makeProduct({
    cat: 'fridge', brand: 'Westinghouse', model: 'WHE6874BA',
    displayName: 'Westinghouse WHE6874BA Fridge', w: 913, h: 1782, d: 803,
    dimensions: { width_mm: 913, height_mm: 1782, depth_mm: 803, door_open_90_depth_mm: 1189 },
    clearance_requirements: { top_mm: 25 },
    evidence: {
      has_pdf_evidence: false,
      has_official_evidence: true,
      source_url: 'https://www.westinghouse.com.au/fridges-and-freezers/fridges/whe6874ba/',
      source_type: 'official_manufacturer_html',
      verified_at: '2026-07-11',
      trust_level: 'dimensions_verified',
      v2_resolution: {
        status: 'resolved',
        approved_fields: [
          'closedEnvelope.widthMm', 'closedEnvelope.heightMm', 'closedEnvelope.depthMm',
          'installation.topMm', 'operation.doorOpenDepthMm', 'flags.requiresPlumbing',
        ],
      },
    },
  });
  product.geometry_v2 = {
    category: 'fridge', formFactor: null,
    closedEnvelope: { widthMm: 913, heightMm: { minimumMm: 1782, maximumMm: 1782 }, depthMm: 803 },
    installation: { leftMm: null, rightMm: null, topMm: 25, rearMm: null, frontMm: null },
    operation: { doorOpenDepthMm: 1189, hingeSideSpaceMm: null, lidOpenHeightMm: null },
    service: { plumbingRearMm: null, rearServicesMm: null, rearVentilationMm: null },
    delivery: { widthMm: null, heightMm: null, depthMm: null },
  };
  product.geometry_v2_provenance = {
    evidenceLevel: 'dimensions',
    fieldEvidence: {
      'closedEnvelope.widthMm': { contentSha256: 'a'.repeat(64), receiptBindingSha256: 'b'.repeat(64) },
      'closedEnvelope.heightMm': { contentSha256: 'a'.repeat(64), receiptBindingSha256: 'b'.repeat(64) },
      'closedEnvelope.depthMm': { contentSha256: 'a'.repeat(64), receiptBindingSha256: 'b'.repeat(64) },
      'installation.topMm': { contentSha256: 'a'.repeat(64), receiptBindingSha256: 'b'.repeat(64) },
    },
  };
  const schema = buildProductJsonLd(product);
  const html = buildProductPageHtml(product);

  assert.equal(selectVerifiedProducts([product]).length, 1);
  assert.equal(schema.additionalProperty.some((row) => row.name === 'Width clearance'), false);
  assert.equal(schema.additionalProperty.some((row) => row.name === 'Rear clearance'), false);
  assert.ok(schema.additionalProperty.some((row) => row.name === 'Top clearance' && row.value === 25));
  assert.match(html, /<tr><th>Left<\/th><td>Unknown<\/td><\/tr>/);
  assert.match(html, /<tr><th>Rear<\/th><td>Unknown<\/td><\/tr>/);
  assert.doesNotMatch(html, /PDF-backed/);
  assert.match(html, /manufacturer-backed/i);
  assert.match(html, /Partial Space Evidence/);
  assert.match(html, /selected manufacturer space requirements/);
  assert.doesNotMatch(html, /estimate|estimated/i);
  assert.doesNotMatch(html, /Allow at least 913mm width, 1807mm height, and 803mm depth/);
  assert.match(html, /Width and depth clearance remain unknown/);
});

test('technical SEO: legacy evidence without field receipts never serializes null clearance values', () => {
  const product = makeProduct({
    geometry_v2: undefined,
    geometry_v2_provenance: undefined,
    evidence: {
      has_pdf_evidence: true,
      source_url: 'https://example.com/captured.pdf',
      verified_at: '2026-05-09',
      trust_level: 'verified_fit',
      clearance_verified: true,
    },
  });
  const schema = buildProductJsonLd(product);
  const html = buildProductPageHtml(product);
  const faq = extractJsonLd(html).find((entry) => entry['@type'] === 'FAQPage');
  const cavityAnswer = faq.mainEntity.find((entry) => /What cavity size/.test(entry.name)).acceptedAnswer.text;

  assert.equal(schema.additionalProperty.some((row) => /clearance/i.test(row.name)), false);
  assert.doesNotMatch(JSON.stringify(schema), /nullmm|"value":null/);
  assert.doesNotMatch(html, /nullmm/);
  assert.match(html, /<tr><th>Left<\/th><td>Unknown<\/td><\/tr>/);
  assert.doesNotMatch(cavityAnswer, /Allow at least/);
  assert.match(cavityAnswer, /Width, height, and depth clearance remain unknown\./);
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
  const product = receiptBoundProduct();
  const slug = slugifyProduct(product);
  const html = buildProductPageHtml(product);
  const jsonLd = extractJsonLd(html);

  assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.fitappliance\\.com\\.au/products/${slug}">`));
  assert.match(html, /LG WWT-1910BX WashTower Exact Dimensions &amp; Verified Installation Requirements \| FitAppliance/);
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
  const dimensionsOnly = buildProductPageHtml(receiptBoundProduct({
    evidence: {
      has_pdf_evidence: true,
      source_url: 'https://example.com/dimensions.pdf',
      verified_at: '2026-05-09',
      trust_level: 'dimensions_verified',
      verified_fields: ['dimensions'],
      clearance_verified: false,
    },
    data_source: 'official_pdf_dimensions_only',
  }, 'dimensions'));
  assert.match(dimensionsOnly, /Dimensions Verified/);
  assert.match(dimensionsOnly, /Exact Dimensions &amp; Clearance Pending/);
  assert.match(dimensionsOnly, /installation clearance remains unknown/);
  assert.doesNotMatch(dimensionsOnly, /clearance estimate|clearance estimates/i);
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

test('technical SEO: receipt-bound partial PDF space evidence is incomplete, never estimated', () => {
  const partial = receiptBoundProduct({
    evidence: {
      has_pdf_evidence: true,
      source_url: 'https://example.com/partial-space.pdf',
      verified_at: '2026-07-16',
      trust_level: 'dimensions_verified',
      verified_fields: ['dimensions'],
      clearance_verified: false,
    },
    data_source: 'official_pdf_dimensions_only',
  }, 'dimensions');
  partial.geometry_v2.installation.topMm = 25;
  partial.geometry_v2_provenance.fieldEvidence['installation.topMm'] = {
    sourceUrl: partial.evidence.source_url,
    contentSha256: 'a'.repeat(64),
    receiptBindingSha256: 'b'.repeat(64),
  };

  const html = buildProductPageHtml(partial);

  assert.match(html, /Exact Dimensions &amp; Partial Space Evidence/);
  assert.match(html, /selected manufacturer space requirements/);
  assert.match(html, /remaining space requirements are unknown/i);
  assert.doesNotMatch(html, /estimate|estimated/i);
});

test('technical SEO: receipt-bound manufacturer HTML is not described as PDF evidence', () => {
  const html = buildProductPageHtml(receiptBoundProduct({
    evidence: {
      has_pdf_evidence: false,
      source_type: 'official_exact_model_product_page',
      source_url: 'https://www.lg.com/au/fridges/gb-450uplx/',
      verified_at: '2026-07-15',
      trust_level: 'dimensions_verified',
      verified_fields: ['dimensions'],
      clearance_verified: false,
      acceptance: { artifact_type: 'html' },
    },
    data_source: 'official_html_receipt_bound',
  }, 'dimensions'));

  assert.match(html, /Manufacturer-backed dimensions/);
  assert.match(html, /from manufacturer page evidence/);
  assert.match(html, /data-source="manufacturer-evidence"/);
  assert.doesNotMatch(html, /data-source="pdf-evidence"/);
  assert.doesNotMatch(html, /PDF-backed|from PDF evidence/);
});

test('technical SEO: product page exposes V2 field review without claiming clearance approval', () => {
  const html = buildProductPageHtml(makeProduct({
    evidence: {
      has_pdf_evidence: true,
      trust_level: 'dimensions_verified',
      verified_fields: ['dimensions'],
      clearance_verified: false,
      v2_review: {
        status: 'phase10_reviewed',
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

test('technical SEO: generated product pages include only receipt-bound PDF or manufacturer API SKUs', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fitappliance-product-pages-'));
  await fs.mkdir(path.join(rootDir, 'data', 'architecture-v2', 'generated'), { recursive: true });
  const apiProduct = receiptBoundProduct({
    id: 'dishwasher-asko-api',
    cat: 'dishwasher',
    brand: 'ASKO',
    model: 'DBI253IBS',
    evidence: {
      has_pdf_evidence: false,
      has_official_evidence: true,
      source_type: 'official_model_variant_api',
      trust_level: 'dimensions_verified',
      acceptance: { artifact_type: 'json' },
    },
    data_source: 'official_api_receipt_bound',
  }, 'dimensions');
  await fs.writeFile(path.join(rootDir, 'data', 'architecture-v2', 'generated', 'public-catalog-projection.json'), `${JSON.stringify({
    products: [
      makeProduct(),
      apiProduct,
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

  assert.equal(result.count, 2);
  assert.equal(index.length, 2);
  assert.deepEqual(index.map((row) => row.slug), [
    slugifyProduct(apiProduct),
    slugifyProduct(makeProduct()),
  ]);
  assert.match(
    await fs.readFile(path.join(rootDir, 'pages', 'products.html'), 'utf8'),
    new RegExp(`href="/products/${slugifyProduct(makeProduct())}"`)
  );
  assert.equal(selectVerifiedProducts([makeProduct(), apiProduct, makeProduct({ evidence: null })]).length, 2);
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

test('technical SEO: page generators finalize comparison indexes before brand cross-links', async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf8'));
  for (const scriptName of ['build', 'generate-pages']) {
    const script = packageJson.scripts[scriptName];
    assert.ok(
      script.indexOf('generate-comparisons') < script.indexOf('generate-brand-pages'),
      `${scriptName}: brand pages must read the current comparison index`
    );
    assert.ok(
      script.indexOf('generate-compare-vs') < script.indexOf('generate-brand-pages'),
      `${scriptName}: brand pages must read the finalized compare-vs index`
    );
    assert.ok(
      script.indexOf('generate-brand-pages') < script.indexOf('inject-video-schema'),
      `${scriptName}: video schema must be injected after brand pages are regenerated`
    );
  }
});
