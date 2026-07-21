#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { existsSync } = require('node:fs');
const { mkdir, readFile, rm, writeFile } = require('node:fs/promises');

const { SITE_ORIGIN } = require('./common/site-origin.js');
const { escHtml, buildHtmlHead } = require('./common/html-head.js');
const { serializeJsonLd } = require('./common/schema-jsonld.js');
const { slugNormalize } = require('./common/slug-normalize.js');

const CATEGORY_LABELS = Object.freeze({
  fridge: 'Fridge',
  washing_machine: 'Washing Machine',
  dishwasher: 'Dishwasher',
  dryer: 'Dryer',
  washtower_combo: 'WashTower'
});

const CATEGORY_HUBS = Object.freeze({
  fridge: '/cavity/600mm-fridge',
  washing_machine: '/tools/fit-checker',
  dishwasher: '/tools/fit-checker',
  dryer: '/tools/fit-checker',
  washtower_combo: '/tools/fit-checker'
});

const CATEGORY_IMAGE_SLUGS = Object.freeze({
  fridge: 'fridge',
  washing_machine: 'washing-machine',
  dishwasher: 'dishwasher',
  dryer: 'dryer',
  washtower_combo: 'washing-machine'
});

const MERCHANT_POLICY_URL = `${SITE_ORIGIN}/terms#affiliate-retailer-policies`;
const FALLBACK_PRODUCT_IMAGE = `${SITE_ORIGIN}/og-images/guide-appliance-fit-sizing-handbook.png`;

function escAttr(value) {
  return escHtml(value);
}

function isFinitePositive(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
}

function roundMm(value) {
  return Math.round(Number(value));
}

function productName(product) {
  const brand = String(product?.brand ?? '').trim();
  const model = String(product?.model ?? '').trim();
  const displayName = String(product?.displayName ?? '').trim();
  const cleanName = (value) => String(value ?? '').replace(/[™®]/g, '').replace(/\s+/g, ' ').trim();
  const normalizedModel = model.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const includesModel = (value) => {
    if (!normalizedModel) return true;
    return String(value ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase().includes(normalizedModel);
  };
  const withModel = (value) => {
    const cleaned = cleanName(value);
    if (!model || includesModel(cleaned)) return cleaned;
    return cleanName(`${cleaned} ${model}`);
  };
  if (displayName && displayName.toLowerCase().startsWith(brand.toLowerCase())) {
    return withModel(displayName);
  }
  if (displayName && displayName.length > model.length + brand.length + 2) {
    return withModel(`${brand} ${displayName}`);
  }
  return cleanName(`${brand} ${model}`);
}

function categoryLabel(product) {
  return CATEGORY_LABELS[product?.cat] ?? String(product?.cat ?? 'Appliance').replace(/_/g, ' ');
}

function slugifyProduct(product) {
  const base = [
    product?.brand,
    product?.model,
    product?.id
  ].filter(Boolean).join(' ');
  return slugNormalize(base).slice(0, 140);
}

function productUrl(product) {
  return `${SITE_ORIGIN}/products/${slugifyProduct(product)}`;
}

function productImageUrl(product, repoRoot = path.resolve(__dirname, '..')) {
  const explicitImage = String(
    product?.image_url ??
    product?.imageUrl ??
    product?.image ??
    ''
  ).trim();
  if (isHttpUrl(explicitImage)) return explicitImage;

  const brandSlug = slugNormalize(product?.brand ?? '');
  const categorySlug = CATEGORY_IMAGE_SLUGS[product?.cat] ?? String(product?.cat ?? 'appliance').replace(/_/g, '-');
  const imageFile = `${brandSlug}-${categorySlug}.png`;
  const imagePath = path.join(repoRoot, 'public', 'og-images', imageFile);
  if (brandSlug && existsSync(imagePath)) {
    return `${SITE_ORIGIN}/og-images/${imageFile}`;
  }

  return FALLBACK_PRODUCT_IMAGE;
}

function getDimension(product, key, fallbackKey) {
  const receiptField = {
    width_mm: ['closedEnvelope.widthMm', 'widthMm'],
    depth_mm: ['closedEnvelope.depthMm', 'depthMm']
  }[key];
  if (receiptField) {
    const receiptValue = getReceiptBoundGeometryValue(
      product,
      receiptField[0],
      'closedEnvelope',
      receiptField[1]
    );
    if (receiptValue !== null) return receiptValue;
  }
  const fromEvidence = product?.dimensions?.[key];
  if (isFinitePositive(fromEvidence)) return roundMm(fromEvidence);
  if (isFinitePositive(product?.[fallbackKey])) return roundMm(product[fallbackKey]);
  return null;
}

function getHeightRange(product) {
  const evidence = product?.geometry_v2_provenance?.fieldEvidence?.['closedEnvelope.heightMm'];
  const height = product?.geometry_v2?.closedEnvelope?.heightMm;
  if (evidence
    && /^[a-f0-9]{64}$/i.test(String(evidence.contentSha256 ?? ''))
    && /^[a-f0-9]{64}$/i.test(String(evidence.receiptBindingSha256 ?? ''))
    && height && typeof height === 'object') {
    const minimumMm = roundMm(height.minimumMm);
    const maximumMm = roundMm(height.maximumMm);
    if (isFinitePositive(minimumMm) && isFinitePositive(maximumMm) && minimumMm <= maximumMm) {
      return { minimumMm, maximumMm };
    }
  }
  const fixed = getDimension(product, 'height_mm', 'h');
  return isFinitePositive(fixed) ? { minimumMm: fixed, maximumMm: fixed } : null;
}

function formatHeightRange(range) {
  if (!range) return 'Unknown';
  return range.minimumMm === range.maximumMm
    ? `${range.minimumMm}mm`
    : `${range.minimumMm}-${range.maximumMm}mm`;
}

function heightQuantitativeValue(range) {
  if (range?.minimumMm !== range?.maximumMm) {
    return {
      '@type': 'QuantitativeValue',
      minValue: range?.minimumMm ?? null,
      maxValue: range?.maximumMm ?? null,
      unitCode: 'MMT'
    };
  }
  return { '@type': 'QuantitativeValue', value: range?.maximumMm ?? null, unitCode: 'MMT' };
}

function getClearance(product, key) {
  const fieldByKey = {
    top_mm: 'installation.topMm',
    left_mm: 'installation.leftMm',
    right_mm: 'installation.rightMm',
    rear_mm: 'installation.rearMm',
    front_mm: 'installation.frontMm',
  };
  const field = fieldByKey[key];
  const evidence = product?.geometry_v2_provenance?.fieldEvidence?.[field];
  if (!field || !evidence
    || !/^[a-f0-9]{64}$/i.test(String(evidence.contentSha256 ?? ''))
    || !/^[a-f0-9]{64}$/i.test(String(evidence.receiptBindingSha256 ?? ''))) return null;
  const geometryKey = field.split('.')[1];
  const value = product?.geometry_v2?.installation?.[geometryKey];
  return Number.isFinite(value) && value >= 0 ? roundMm(value) : null;
}

function getReceiptBoundGeometryValue(product, field, section, key) {
  const evidence = product?.geometry_v2_provenance?.fieldEvidence?.[field];
  if (!evidence
    || !/^[a-f0-9]{64}$/i.test(String(evidence.contentSha256 ?? ''))
    || !/^[a-f0-9]{64}$/i.test(String(evidence.receiptBindingSha256 ?? ''))) return null;
  const value = product?.geometry_v2?.[section]?.[key];
  return Number.isFinite(value) && value > 0 ? roundMm(value) : null;
}

function formatMillimetres(value) {
  return Number.isInteger(value) ? `${value}mm` : 'Unknown';
}

function sumKnown(base, ...clearances) {
  return clearances.every(Number.isInteger)
    ? base + clearances.reduce((sum, value) => sum + value, 0)
    : null;
}

function reviewedFields(product) {
  const review = product?.evidence?.v2_resolution ?? product?.evidence?.v2_review;
  const fields = new Set(review?.approved_fields ?? []);
  for (const [field, evidence] of Object.entries(
    product?.geometry_v2_provenance?.fieldEvidence ?? {}
  )) {
    if (/^[a-f0-9]{64}$/i.test(String(evidence?.contentSha256 ?? ''))
      && /^[a-f0-9]{64}$/i.test(String(evidence?.receiptBindingSha256 ?? ''))) {
      fields.add(field);
    }
  }
  return fields;
}

function getEvidenceTrustLevel(product) {
  const geometryLevel = product?.geometry_v2_provenance?.evidenceLevel;
  if (geometryLevel === 'verified') return 'verified_fit';
  if (geometryLevel === 'dimensions') return 'dimensions_verified';
  const level = String(product?.evidence?.trust_level ?? product?.trust_level ?? '').trim();
  if (level === 'retailer_spec') return level;
  if (level === 'evidence_pending' || ['verified_fit', 'dimensions_verified'].includes(level)) return 'evidence_pending';
  if (product?.evidence?.has_pdf_evidence === true) return 'evidence_pending';
  return 'retailer_spec';
}

function hasManufacturerHtmlEvidence(product) {
  return product?.evidence?.acceptance?.artifact_type === 'html'
    || product?.data_source === 'official_html_receipt_bound'
    || ['official_manufacturer_html', 'official_exact_model_product_page']
      .includes(product?.evidence?.source_type);
}

function hasManufacturerApiEvidence(product) {
  return product?.evidence?.acceptance?.artifact_type === 'json'
    || product?.data_source === 'official_api_receipt_bound'
    || ['official_exact_model_api', 'official_model_variant_api']
      .includes(product?.evidence?.source_type);
}

function evidenceDataSource(product) {
  if (product?.evidence?.v2_resolution?.status === 'resolved') return 'evidence';
  if (hasManufacturerHtmlEvidence(product)) return 'manufacturer-evidence';
  if (hasManufacturerApiEvidence(product)) return 'manufacturer-api-evidence';
  if (product?.evidence?.has_pdf_evidence === true
    || String(product?.data_source ?? '').includes('pdf')) return 'pdf-evidence';
  return 'retailer-evidence';
}

function getEvidenceTrustCopy(product) {
  const trustLevel = getEvidenceTrustLevel(product);
  const manufacturerHtml = hasManufacturerHtmlEvidence(product);
  const manufacturerApi = hasManufacturerApiEvidence(product);
  if (trustLevel === 'evidence_pending') {
    return {
      label: 'Evidence Pending',
      titleSuffix: 'Listed Dimensions & Evidence Review',
      descriptionVerb: 'listed dimensions with field-level verification pending',
      sourceProperty: 'A source has been captured, but its dimensions and installation fields are not yet receipt-bound for fit publication',
      sourceLabel: 'Captured evidence source',
      faqVerification: 'Not yet. A source has been captured, but FitAppliance has not promoted its fields into the receipt-backed geometry used for fit decisions.',
      cavityAnswerSuffix: 'after confirming the model manual and installation requirements.'
    };
  }
  if (manufacturerApi) {
    const hasApprovedSpace = [...reviewedFields(product)].some((field) => (
      field.startsWith('installation.') || field.startsWith('operation.') || field.startsWith('service.')
    ));
    if (trustLevel === 'verified_fit' || hasApprovedSpace) {
      throw new Error('manufacturer API evidence cannot publish Fit or space-requirement claims');
    }
    if (trustLevel === 'dimensions_verified') {
      return {
        label: 'Dimensions Verified',
        titleSuffix: 'Exact Dimensions & Clearance Pending',
        descriptionVerb: 'Manufacturer product-data dimensions; installation clearance remains unknown',
        sourceProperty: 'Official manufacturer product-data dimensions captured by FitAppliance; clearance remains unknown until explicit installation evidence is captured',
        sourceLabel: 'Official manufacturer product data',
        faqVerification: 'Partially. FitAppliance has verified the physical dimensions from manufacturer product-data evidence, but installation clearance remains unknown until explicit evidence is captured.',
        cavityAnswerSuffix: 'after confirming the model-specific installation clearance.'
      };
    }
  }
  if (!manufacturerHtml) {
    if (trustLevel === 'verified_fit') {
      return {
        label: 'Fit Requirements Verified',
        titleSuffix: 'Exact Dimensions & Verified Installation Requirements',
        descriptionVerb: 'verified dimensions and manufacturer clearance requirements',
        sourceProperty: 'Official PDF dimensions and clearance evidence captured by FitAppliance',
        sourceLabel: 'Official PDF evidence',
        faqVerification: 'FitAppliance has receipt-backed dimensions and installation requirements for this model. Whether it fits depends on the cavity measurements entered in the fit checker.',
        cavityAnswerSuffix: 'after the verified requirements are compared with your measurements.'
      };
    }
    if (trustLevel === 'dimensions_verified') {
      const hasApprovedSpace = [...reviewedFields(product)].some((field) => (
        field.startsWith('installation.') || field.startsWith('operation.') || field.startsWith('service.')
      ));
      if (hasApprovedSpace) {
        return {
          label: 'Dimensions Verified',
          titleSuffix: 'Exact Dimensions & Partial Space Evidence',
          descriptionVerb: 'PDF-backed dimensions with selected manufacturer space requirements',
          sourceProperty: 'Official PDF dimensions and selected space fields captured by FitAppliance; remaining space requirements are unknown',
          sourceLabel: 'Official dimensions and partial space evidence',
          faqVerification: 'Partially. FitAppliance has verified the physical dimensions and selected installation or operating-space fields from manufacturer PDF evidence. Remaining space requirements are unknown.',
          cavityAnswerSuffix: 'after confirming the remaining model-specific space requirements.'
        };
      }
      return {
        label: 'Dimensions Verified',
        titleSuffix: 'Exact Dimensions & Clearance Pending',
        descriptionVerb: 'PDF-backed dimensions; installation clearance remains unknown',
        sourceProperty: 'Official PDF dimensions evidence captured by FitAppliance; clearance remains unknown until explicit installation evidence is captured',
        sourceLabel: 'Official dimensions evidence',
        faqVerification: 'Partially. FitAppliance has verified the physical dimensions from PDF evidence, but installation clearance remains unknown until explicit evidence is captured.',
        cavityAnswerSuffix: 'after confirming the model-specific installation clearance.'
      };
    }
    return {
      label: 'Retailer Spec',
      titleSuffix: 'Retailer Dimensions',
      descriptionVerb: 'retailer-sourced dimensions with unverified installation clearance',
      sourceProperty: 'Retailer dimensions evidence captured by FitAppliance; installation clearance is not verified',
      sourceLabel: 'Retailer specification evidence',
      faqVerification: 'No. FitAppliance has retailer-sourced dimensions for this model, but it is not marked as Verified Fit because installation clearance evidence is missing.',
      cavityAnswerSuffix: 'using unverified clearance assumptions.'
    };
  }
  const evidenceAdjective = manufacturerHtml ? 'manufacturer' : 'PDF';
  const descriptionAdjective = manufacturerHtml ? 'Manufacturer' : 'PDF';
  const evidenceMedium = manufacturerHtml ? 'manufacturer page' : 'PDF';
  const sourceLabel = manufacturerHtml ? 'Official manufacturer evidence' : 'Official PDF evidence';
  const approvedFields = reviewedFields(product);
  const hasApprovedSpace = [...approvedFields].some((field) => (
    field.startsWith('installation.') || field.startsWith('operation.') || field.startsWith('service.')
  ));
  if (trustLevel === 'verified_fit') {
    return {
      label: 'Fit Requirements Verified',
      titleSuffix: 'Exact Dimensions & Verified Installation Requirements',
      descriptionVerb: 'verified dimensions and manufacturer clearance requirements',
      sourceProperty: `Official ${evidenceAdjective} dimensions and clearance evidence captured by FitAppliance`,
      sourceLabel,
      faqVerification: `FitAppliance has receipt-backed dimensions and installation requirements from ${evidenceMedium} evidence. Whether it fits depends on the cavity measurements entered in the fit checker.`,
      cavityAnswerSuffix: 'after the verified requirements are compared with your measurements.'
    };
  }
  if (trustLevel === 'dimensions_verified') {
    if (hasApprovedSpace) {
      return {
        label: 'Dimensions Verified',
        titleSuffix: 'Exact Dimensions & Partial Space Evidence',
        descriptionVerb: `${descriptionAdjective}-backed dimensions with selected manufacturer space requirements`,
        sourceProperty: `Official ${evidenceAdjective} dimensions and selected space fields captured by FitAppliance; remaining space requirements are unknown`,
        sourceLabel: manufacturerHtml ? 'Official manufacturer dimensions and partial space evidence' : 'Official dimensions and partial space evidence',
        faqVerification: `Partially. FitAppliance has verified the physical dimensions and selected installation or operating-space fields from ${evidenceMedium} evidence. Remaining space requirements are unknown.`,
        cavityAnswerSuffix: 'after confirming the remaining model-specific space requirements.'
      };
    }
    return {
      label: 'Dimensions Verified',
      titleSuffix: 'Exact Dimensions & Clearance Pending',
      descriptionVerb: `${descriptionAdjective}-backed dimensions; installation clearance remains unknown`,
      sourceProperty: `Official ${evidenceAdjective} dimensions evidence captured by FitAppliance; clearance is unknown until explicit installation evidence is captured`,
      sourceLabel: manufacturerHtml ? 'Official manufacturer dimensions evidence' : 'Official dimensions evidence',
      faqVerification: `Partially. FitAppliance has verified the physical dimensions from ${evidenceMedium} evidence, but installation clearance remains unknown until explicit evidence is captured.`,
      cavityAnswerSuffix: 'after confirming the model-specific installation clearance.'
    };
  }
  return {
    label: 'Retailer Spec',
    titleSuffix: 'Retailer Dimensions',
    descriptionVerb: 'retailer-sourced dimensions with unverified installation clearance',
    sourceProperty: 'Retailer dimensions evidence captured by FitAppliance; installation clearance is not verified',
    sourceLabel: 'Retailer specification evidence',
    faqVerification: 'No. FitAppliance has retailer-sourced dimensions for this model, but it is not marked as Verified Fit because installation clearance evidence is missing.',
    cavityAnswerSuffix: 'using unverified clearance assumptions.'
  };
}

function formatReviewDate(value) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value ?? 'Unknown date');
  return `${Number(match[3])} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(match[2]) - 1]} ${match[1]}`;
}

function buildV2ReviewHtml(product) {
  const isResolution = product?.evidence?.v2_resolution?.status === 'resolved';
  const review = product?.evidence?.v2_resolution ?? product?.evidence?.v2_review;
  if (!review) return '';
  const labels = {
    'closedEnvelope.widthMm': 'width',
    'closedEnvelope.heightMm': 'height',
    'closedEnvelope.depthMm': 'depth',
    'installation.leftMm': 'left installation clearance',
    'installation.rightMm': 'right installation clearance',
    'installation.topMm': 'top installation clearance',
    'installation.rearMm': 'rear installation clearance',
    'installation.frontMm': 'front installation clearance',
    'operation.doorOpenDepthMm': 'door-open total depth',
    'operation.hingeSideSpaceMm': 'hinge-side operating space',
    'operation.lidOpenHeightMm': 'lid-open total height',
    'service.plumbingRearMm': 'rear plumbing space',
    'service.rearServicesMm': 'rear service space',
    'service.rearVentilationMm': 'rear ventilation space',
  };
  const approved = (review.approved_fields ?? []).map((field) => labels[field] ?? field);
  const approvedCopy = approved.length ? approved.join(', ') : 'No physical dimensions';
  const spaceValues = review.approved_space_values ?? {};
  const approvedSpace = Object.entries(spaceValues).map(([field, value]) => {
    const label = labels[field] ?? field;
    return `<li>${escHtml(`${label.charAt(0).toUpperCase()}${label.slice(1)}: ${value} mm`)}</li>`;
  }).join('');
  const approvedFields = new Set(review.approved_fields ?? []);
  const hasApprovedDimensions = [
    'closedEnvelope.widthMm',
    'closedEnvelope.heightMm',
    'closedEnvelope.depthMm'
  ].every((field) => approvedFields.has(field));
  const hasApprovedSpaceFields = [...approvedFields].some((field) => (
    field.startsWith('installation.') || field.startsWith('operation.') || field.startsWith('service.')
  ));
  const limitation = Object.keys(spaceValues).length > 0 || (isResolution && hasApprovedSpaceFields)
    ? 'These fields are approved individually. Verified Fit is not granted because the remaining space requirements are unknown.'
    : hasApprovedDimensions
      ? 'Installation clearance remains unapproved and is shown only as an estimate.'
      : 'The document did not pass the complete three-axis identity and field review gate.';
  return `\n    <section class="sku-panel" style="margin-top:24px" data-v2-evidence-review>
    <h2>Architecture V2 evidence review</h2>
    <p><strong>Approved fields:</strong> ${escHtml(approvedCopy.charAt(0).toUpperCase() + approvedCopy.slice(1))}</p>
${approvedSpace ? `    <ul>${approvedSpace}</ul>\n` : ''}    <p><strong>Reviewed:</strong> ${escHtml(formatReviewDate(review.reviewed_at ?? product?.evidence?.verified_at))}</p>
    <p>${escHtml(limitation)}</p>
  </section>`;
}

function selectVerifiedProducts(products) {
  return [...(Array.isArray(products) ? products : [])]
    .filter((product) => (
      (product?.evidence?.has_pdf_evidence === true || product?.evidence?.has_official_evidence === true) &&
      isFinitePositive(getDimension(product, 'width_mm', 'w')) &&
      isFinitePositive(getDimension(product, 'height_mm', 'h')) &&
      isFinitePositive(getDimension(product, 'depth_mm', 'd'))
    ))
    .sort((left, right) => {
      const leftCat = String(left?.cat ?? '');
      const rightCat = String(right?.cat ?? '');
      if (leftCat !== rightCat) return leftCat.localeCompare(rightCat);
      return productName(left).localeCompare(productName(right));
    });
}

function buildAdditionalProperties(product) {
  const trustCopy = getEvidenceTrustCopy(product);
  const left = getClearance(product, 'left_mm');
  const right = getClearance(product, 'right_mm');
  const top = getClearance(product, 'top_mm');
  const rear = getClearance(product, 'rear_mm');
  const doorOpenDepth = getReceiptBoundGeometryValue(
    product,
    'operation.doorOpenDepthMm',
    'operation',
    'doorOpenDepthMm',
  );
  const properties = [
    { '@type': 'PropertyValue', name: 'Evidence trust level', value: trustCopy.label },
    { '@type': 'PropertyValue', name: 'Evidence source', value: trustCopy.sourceProperty }
  ];
  if (Number.isInteger(left) && Number.isInteger(right)) {
    properties.unshift({ '@type': 'PropertyValue', name: 'Width clearance', value: `${left}mm left, ${right}mm right` });
  }
  if (Number.isInteger(top)) properties.unshift({ '@type': 'PropertyValue', name: 'Top clearance', value: top, unitCode: 'MMT' });
  if (Number.isInteger(rear)) properties.unshift({ '@type': 'PropertyValue', name: 'Rear clearance', value: rear, unitCode: 'MMT' });

  if (product?.data_source) {
    properties.push({ '@type': 'PropertyValue', name: 'Data source', value: String(product.data_source) });
  }
  if (product?.evidence?.verified_at) {
    properties.push({ '@type': 'PropertyValue', name: 'Verified at', value: String(product.evidence.verified_at) });
  }
  if (doorOpenDepth !== null) {
    properties.push({
      '@type': 'PropertyValue',
      name: 'Door open 90 degree depth',
      value: doorOpenDepth,
      unitCode: 'MMT'
    });
  }
  return properties;
}

function normalizePrice(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric * 100) / 100;
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value ?? ''));
}

function retailerClickUrl(retailer) {
  const affiliateUrl = String(retailer?.affiliate_url ?? '').trim();
  if (isHttpUrl(affiliateUrl)) return affiliateUrl;
  return String(retailer?.url ?? '').trim();
}

function getPricedRetailerOffers(product) {
  const productPrice = normalizePrice(product?.price);
  const retailers = Array.isArray(product?.retailers) ? product.retailers : [];

  return retailers
    .filter((retailer) => isHttpUrl(retailer?.url))
    .map((retailer) => {
      const retailerPrice = normalizePrice(retailer?.p);
      const price = retailerPrice ?? productPrice;
      if (price == null) return null;
      return {
        name: String(retailer?.n ?? 'Retailer').trim() || 'Retailer',
        url: String(retailer.url),
        price
      };
    })
    .filter(Boolean);
}

function buildShippingDetailsJsonLd() {
  return {
    '@type': 'OfferShippingDetails',
    deliveryTime: {
      '@type': 'ShippingDeliveryTime',
      handlingTime: {
        '@type': 'QuantitativeValue',
        minValue: 0,
        maxValue: 7,
        unitCode: 'DAY'
      },
      transitTime: {
        '@type': 'QuantitativeValue',
        minValue: 1,
        maxValue: 30,
        unitCode: 'DAY'
      }
    },
    shippingDestination: {
      '@type': 'DefinedRegion',
      addressCountry: 'AU'
    },
    shippingRate: {
      '@type': 'MonetaryAmount',
      currency: 'AUD',
      minValue: 0,
      maxValue: 999
    }
  };
}

function buildMerchantReturnPolicyJsonLd() {
  // Google Merchant listings reject MerchantReturnUnspecified in offer-level
  // markup. FitAppliance is an affiliate utility, so we link to the retailer
  // policy disclosure without inventing a universal return window.
  return {
    '@type': 'MerchantReturnPolicy',
    merchantReturnLink: MERCHANT_POLICY_URL
  };
}

function buildRetailerOfferJsonLd(offer, availability) {
  return {
    '@type': 'Offer',
    price: offer.price,
    priceCurrency: 'AUD',
    availability,
    itemCondition: 'https://schema.org/NewCondition',
    url: offer.url,
    seller: {
      '@type': 'Organization',
      name: offer.name
    },
    shippingDetails: buildShippingDetailsJsonLd(),
    hasMerchantReturnPolicy: buildMerchantReturnPolicyJsonLd()
  };
}

function buildOfferJsonLd(product) {
  const offers = getPricedRetailerOffers(product);
  if (offers.length === 0) return null;

  const availability = product?.unavailable === true
    ? 'https://schema.org/OutOfStock'
    : 'https://schema.org/InStock';

  if (offers.length === 1) {
    return buildRetailerOfferJsonLd(offers[0], availability);
  }

  const prices = offers.map((offer) => offer.price);
  return {
    '@type': 'AggregateOffer',
    lowPrice: Math.min(...prices),
    highPrice: Math.max(...prices),
    offerCount: offers.length,
    priceCurrency: 'AUD',
    availability,
    url: productUrl(product),
    shippingDetails: buildShippingDetailsJsonLd(),
    hasMerchantReturnPolicy: buildMerchantReturnPolicyJsonLd(),
    offers: offers.map((offer) => buildRetailerOfferJsonLd(offer, availability))
  };
}

function buildProductJsonLd(product) {
  const width = getDimension(product, 'width_mm', 'w');
  const height = getHeightRange(product);
  const depth = getDimension(product, 'depth_mm', 'd');
  const name = productName(product);
  const canonical = productUrl(product);
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${canonical}#product`,
    name,
    description: `${name} ${getEvidenceTrustCopy(product).descriptionVerb} for Australian homes.`,
    sku: String(product?.model ?? product?.id ?? ''),
    mpn: String(product?.model ?? product?.id ?? ''),
    image: productImageUrl(product),
    category: categoryLabel(product),
    brand: {
      '@type': 'Brand',
      name: String(product?.brand ?? '').trim()
    },
    width: { '@type': 'QuantitativeValue', value: width, unitCode: 'MMT' },
    height: heightQuantitativeValue(height),
    depth: { '@type': 'QuantitativeValue', value: depth, unitCode: 'MMT' },
    additionalProperty: buildAdditionalProperties(product),
    mainEntityOfPage: canonical
  };

  const offers = buildOfferJsonLd(product);
  if (offers) {
    schema.offers = offers;
  }

  return schema;
}

function hasProductRichResultQualifier(schema) {
  return Boolean(schema?.offers || schema?.review || schema?.aggregateRating);
}

function buildBreadcrumbJsonLd(product) {
  const canonical = productUrl(product);
  const category = categoryLabel(product);
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'FitAppliance',
        item: SITE_ORIGIN
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: `${category} dimensions`,
        item: `${SITE_ORIGIN}${CATEGORY_HUBS[product?.cat] ?? '/'}`
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: productName(product),
        item: canonical
      }
    ]
  };
}

function buildFaqJsonLd(product) {
  const name = productName(product);
  const trustCopy = getEvidenceTrustCopy(product);
  const width = getDimension(product, 'width_mm', 'w');
  const height = getHeightRange(product);
  const heightText = formatHeightRange(height);
  const depth = getDimension(product, 'depth_mm', 'd');
  const requiredWidth = sumKnown(width, getClearance(product, 'left_mm'), getClearance(product, 'right_mm'));
  const requiredHeight = sumKnown(height?.maximumMm ?? null, getClearance(product, 'top_mm'));
  const requiredDepth = sumKnown(depth, getClearance(product, 'rear_mm'));
  const knownMinimums = [
    Number.isInteger(requiredWidth) ? `${requiredWidth}mm width` : null,
    Number.isInteger(requiredHeight) ? `${requiredHeight}mm height` : null,
    Number.isInteger(requiredDepth) ? `${requiredDepth}mm depth` : null,
  ].filter(Boolean);
  const unknownAxes = [
    Number.isInteger(requiredWidth) ? null : 'width',
    Number.isInteger(requiredHeight) ? null : 'height',
    Number.isInteger(requiredDepth) ? null : 'depth',
  ].filter(Boolean);
  const capitalizedUnknownAxes = unknownAxes.map((axis, index) => (
    index === 0 ? `${axis.charAt(0).toUpperCase()}${axis.slice(1)}` : axis
  ));
  const unknownCopy = capitalizedUnknownAxes.length <= 1
    ? (capitalizedUnknownAxes[0] ?? '')
    : capitalizedUnknownAxes.length === 2
      ? capitalizedUnknownAxes.join(' and ')
      : `${capitalizedUnknownAxes.slice(0, -1).join(', ')}, and ${capitalizedUnknownAxes.at(-1)}`;
  const cavityAnswer = unknownAxes.length === 0
    ? `Allow at least ${knownMinimums.join(', ').replace(/, ([^,]*)$/, ', and $1')} ${trustCopy.cavityAnswerSuffix}`
    : `${knownMinimums.length ? `Known approved minimum: ${knownMinimums.join(', ')}. ` : ''}${unknownCopy} clearance remain unknown.`;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `What are the exact dimensions of the ${name}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `${name} measures ${width}mm wide, ${heightText} high, and ${depth}mm deep.`
        }
      },
      {
        '@type': 'Question',
        name: `What cavity size does the ${name} need?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: cavityAnswer
        }
      },
      {
        '@type': 'Question',
        name: `Is the ${name} verified by FitAppliance?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: trustCopy.faqVerification
        }
      }
    ]
  };
}

function safeJsonLd(value) {
  return serializeJsonLd(value).replace(/[<>&]/g, (char) => {
    const map = {
      '<': '\\u003c',
      '>': '\\u003e',
      '&': '\\u0026'
    };
    return map[char] ?? char;
  });
}

function renderRetailerLinks(product) {
  const links = (Array.isArray(product?.retailers) ? product.retailers : [])
    .filter((retailer) => isHttpUrl(retailer?.url) && retailer?.n)
    .slice(0, 5)
    .map((retailer) => {
      const price = normalizePrice(retailer?.p) ?? normalizePrice(product?.price);
      const priceText = price == null ? '' : ` · $${price.toLocaleString('en-AU')}`;
      return `<a href="${escAttr(retailerClickUrl(retailer))}" rel="sponsored nofollow noopener" target="_blank">${escHtml(retailer.n)}${escHtml(priceText)}</a>`;
    })
    .join('');
  return links || '<span>No verified retailer link recorded.</span>';
}

function buildProductPageHtml(product) {
  const name = productName(product);
  const category = categoryLabel(product);
  const trustCopy = getEvidenceTrustCopy(product);
  const canonical = productUrl(product);
  const width = getDimension(product, 'width_mm', 'w');
  const height = getHeightRange(product);
  const heightText = formatHeightRange(height);
  const depth = getDimension(product, 'depth_mm', 'd');
  const requiredWidth = sumKnown(width, getClearance(product, 'left_mm'), getClearance(product, 'right_mm'));
  const requiredHeight = sumKnown(height?.maximumMm ?? null, getClearance(product, 'top_mm'));
  const requiredDepth = sumKnown(depth, getClearance(product, 'rear_mm'));
  const titleSubject = new RegExp(`\\b${category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(name)
    ? name
    : `${name} ${category}`;
  const title = `${titleSubject} ${trustCopy.titleSuffix} | FitAppliance`;
  const description = `${name}: W ${width}mm, H ${heightText}, D ${depth}mm. ${trustCopy.descriptionVerb}. Check safe cavity size before buying in Australia.`;
  const sourceUrl = /^https?:\/\//i.test(String(product?.evidence?.source_url ?? ''))
    ? product.evidence.source_url
    : null;
  const modifiedTime = product?.evidence?.verified_at
    ? `${String(product.evidence.verified_at).slice(0, 10)}T00:00:00+08:00`
    : '2026-05-09T00:00:00+08:00';
  const head = buildHtmlHead({ title, description, canonical, modifiedTime });
  const productSchema = buildProductJsonLd(product);
  const productSchemaScript = hasProductRichResultQualifier(productSchema)
    ? `  <script type="application/ld+json">${safeJsonLd(productSchema)}</script>\n`
    : '';

  return `<!doctype html>
<html lang="en-AU">
<head>
${head}
  <link rel="stylesheet" href="/styles.css">
${productSchemaScript}  <script type="application/ld+json">${safeJsonLd(buildBreadcrumbJsonLd(product))}</script>
  <script type="application/ld+json">${safeJsonLd(buildFaqJsonLd(product))}</script>
  <style>
    .sku-page{max-width:980px;margin:0 auto;padding:48px 24px 72px}
    .breadcrumb{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:13px;line-height:1.6;color:#6b6b6b;overflow-wrap:anywhere}
    .breadcrumb a{display:inline-flex;align-items:center;min-width:44px;min-height:44px;color:#A34F22}
    .sku-grid{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(280px,.7fr);gap:24px}
    .sku-panel{background:#fff;border:1px solid #e0d9ce;border-radius:12px;padding:20px}
    .sku-kicker{font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b6b6b}
    .sku-title{font-size:clamp(32px,4vw,52px);line-height:1.02;margin:8px 0 16px}
    .sku-table{width:100%;border-collapse:collapse}
    .sku-table th,.sku-table td{border-bottom:1px solid #eee7dc;padding:10px;text-align:left}
    .sku-badge{display:inline-block;border:1px solid #047857;background:#ecfdf5;color:#047857;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;font-weight:700;padding:2px 6px}
    .sku-badge--dimensions_verified{border-color:#0369a1;background:#f0f9ff;color:#075985}
    .sku-badge--retailer_spec{border-color:#92400e;background:#fffbeb;color:#92400e}
    .sku-source{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;background:#f9fafb;border:1px solid #e5e7eb;padding:12px;margin-top:16px}
    .sku-source a{display:inline-flex;align-items:center;min-height:44px}
    .sku-source,.sku-panel,.sku-title{overflow-wrap:anywhere}
    .retailer-strip{display:flex;flex-wrap:wrap;gap:8px}.retailer-strip a{display:inline-flex;align-items:center;min-height:44px;border:1px solid #d8cfc1;padding:8px 10px;color:#1f1f1f;text-decoration:none}
    @media(max-width:760px){.sku-grid{grid-template-columns:1fr}.sku-page{width:100%;max-width:100vw;box-sizing:border-box;overflow-x:hidden;padding:28px 16px 56px}.sku-title{font-size:clamp(28px,9vw,40px)}.sku-table{font-size:14px}.sku-table th,.sku-table td{padding:10px 8px}}
  </style>
</head>
<body>
  <header class="site-header">
    <a class="brand" href="/">Fit<span>Appliance</span></a>
    <nav aria-label="Primary">
      <button type="button" data-fit-query="/?cat=fridge" onclick="window.location.href=this.dataset.fitQuery">Fridges</button>
      <button type="button" data-fit-query="/?cat=washing_machine" onclick="window.location.href=this.dataset.fitQuery">Laundry</button>
      <button type="button" data-fit-query="/?cat=dishwasher" onclick="window.location.href=this.dataset.fitQuery">Dishwashers</button>
      <a class="btn" href="/#fit-checker">Find your fit</a>
    </nav>
  </header>
  <main class="sku-page">
    <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a> → <a href="${escAttr(CATEGORY_HUBS[product?.cat] ?? '/')}">${escHtml(category)} dimensions</a> → ${escHtml(name)}</nav>
    <p class="sku-kicker" data-source="catalog-final">${escHtml(product?.brand ?? '')} · ${escHtml(category)} · Model ${escHtml(product?.model ?? product?.id ?? '')}</p>
    <h1 class="sku-title">${escHtml(name)} ${escHtml(trustCopy.titleSuffix.toLowerCase())}</h1>
    <p data-source="${evidenceDataSource(product)}">${escHtml(description)}</p>
    <p data-source="${evidenceDataSource(product)}"><span class="sku-badge sku-badge--${escAttr(getEvidenceTrustLevel(product))}">${escHtml(trustCopy.label)}</span></p>
    <div class="sku-grid">
      <section class="sku-panel">
        <h2>Physical dimensions</h2>
        <table class="sku-table">
          <tbody>
            <tr><th>Width</th><td>${width}mm</td></tr>
            <tr><th>Height</th><td>${heightText}</td></tr>
            <tr><th>Depth</th><td>${depth}mm</td></tr>
${isFinitePositive(product?.dimensions?.door_open_90_depth_mm) ? `            <tr><th>Door open 90° depth</th><td>${roundMm(product.dimensions.door_open_90_depth_mm)}mm</td></tr>` : ''}
          </tbody>
        </table>
      </section>
      <section class="sku-panel">
        <h2>Minimum cavity to verify</h2>
        <table class="sku-table">
          <tbody>
            <tr><th>Required width</th><td>${formatMillimetres(requiredWidth)}</td></tr>
            <tr><th>Required height</th><td>${formatMillimetres(requiredHeight)}</td></tr>
            <tr><th>Required depth</th><td>${formatMillimetres(requiredDepth)}</td></tr>
          </tbody>
        </table>
      </section>
    </div>
    <section class="sku-panel" style="margin-top:24px">
      <h2>Clearance requirements</h2>
      <table class="sku-table">
        <tbody>
          <tr><th>Left</th><td>${formatMillimetres(getClearance(product, 'left_mm'))}</td></tr>
          <tr><th>Right</th><td>${formatMillimetres(getClearance(product, 'right_mm'))}</td></tr>
          <tr><th>Top</th><td>${formatMillimetres(getClearance(product, 'top_mm'))}</td></tr>
          <tr><th>Rear</th><td>${formatMillimetres(getClearance(product, 'rear_mm'))}</td></tr>
        </tbody>
      </table>
      <div class="sku-source">
        Source of truth:
        ${sourceUrl ? `<a href="${escAttr(sourceUrl)}" target="_blank" rel="noopener">${escHtml(trustCopy.sourceLabel)}</a>` : escHtml(trustCopy.sourceLabel)}
        ${product?.evidence?.verified_at ? ` · Verified ${escHtml(product.evidence.verified_at)}` : ''}
      </div>
    </section>${buildV2ReviewHtml(product)}
    <section class="sku-panel" style="margin-top:24px">
      <h2>Retailer availability</h2>
      <div class="retailer-strip">${renderRetailerLinks(product)}</div>
    </section>
  </main>
  <footer class="site-footer">
    <a href="/about">About</a>
    <a href="/methodology">Methodology</a>
    <a href="/about/editorial-standards">Editorial standards</a>
    <a href="/privacy">Privacy</a>
    <a href="/terms">Terms</a>
    <a href="/contact">Contact</a>
  </footer>
</body>
</html>
`;
}

function buildProductIndexHtml(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = categoryLabel(row.cat ?? 'appliance');
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }

  const sections = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, items]) => {
      const links = [...items]
        .sort((left, right) => {
          const leftBrand = String(left.brand ?? '');
          const rightBrand = String(right.brand ?? '');
          if (leftBrand !== rightBrand) return leftBrand.localeCompare(rightBrand);
          return String(left.model ?? left.slug ?? '').localeCompare(String(right.model ?? right.slug ?? ''));
        })
        .map((row) => `<li><a href="${escAttr(row.url)}">${escHtml(`${row.brand} ${row.model}`.trim())}</a></li>`)
        .join('\n');

      return `<section class="sku-panel">
        <h2>${escHtml(label)} verified pages</h2>
        <ul class="product-index-list">
${links}
        </ul>
      </section>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Verified appliance dimension pages | FitAppliance</title>
  <meta name="description" content="Browse FitAppliance product pages with PDF-backed appliance dimensions, clearance requirements and source citations.">
  <meta name="article:modified_time" content="2026-05-16T00:00:00+08:00">
  <link rel="canonical" href="${SITE_ORIGIN}/products">
  <style>
    body { margin:0; font-family:'Outfit',-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif; color:#111; background:#faf8f3; }
    header, main, footer { max-width:1120px; margin:0 auto; padding:24px; }
    a { color:#111; text-decoration-thickness:2px; text-underline-offset:3px; }
    header > a,
    footer a,
    .product-index-list a {
      display:inline-flex;
      align-items:center;
      min-width:44px;
      min-height:44px;
    }
    .eyebrow { text-transform:uppercase; letter-spacing:.12em; font-size:12px; color:#6b6b6b; font-weight:800; }
    h1 { font-family:Georgia,serif; font-size:clamp(34px,5vw,56px); margin:8px 0 12px; }
    .sku-panel { background:#fff; border:1px solid #ddd4c8; border-radius:16px; padding:20px; margin:18px 0; }
    .product-index-list { columns:3 240px; column-gap:28px; margin:0; padding-left:18px; }
    .product-index-list li { break-inside:avoid; margin:0 0 8px; font-size:14px; }
    footer { color:#666; font-size:13px; }
  </style>
</head>
<body>
  <header>
    <a href="/">FitAppliance</a>
    <p class="eyebrow">Evidence-backed product pages</p>
    <h1>Evidence-backed appliance dimensions</h1>
    <p>These pages expose crawlable Product, Breadcrumb and FAQ structured data for appliances with captured evidence tiers.</p>
  </header>
  <main>
${sections}
  </main>
  <footer>
    <a href="/about">About</a> · <a href="/methodology">Methodology</a> · <a href="/about/editorial-standards">Editorial standards</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/contact">Contact</a>
  </footer>
</body>
</html>
`;
}

async function loadCatalog(repoRoot, catalogPath = path.join(
  repoRoot,
  'data',
  'architecture-v2',
  'generated',
  'public-catalog-projection.json'
)) {
  const text = await readFile(catalogPath, 'utf8');
  const payload = JSON.parse(text);
  return Array.isArray(payload?.products) ? payload.products : [];
}

async function generateProductPages({
  repoRoot = path.resolve(__dirname, '..'),
  outputDir = path.join(repoRoot, 'pages', 'products'),
  catalogPath,
  logger = console
} = {}) {
  const catalog = await loadCatalog(repoRoot, catalogPath);
  const products = selectVerifiedProducts(catalog);
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const rows = [];
  for (const product of products) {
    const slug = slugifyProduct(product);
    const html = buildProductPageHtml(product);
    await writeFile(path.join(outputDir, `${slug}.html`), html, 'utf8');
    rows.push({
      id: product.id,
      slug,
      url: `/products/${slug}`,
      cat: product.cat,
      brand: product.brand,
      model: product.model,
      verified_at: product?.evidence?.verified_at ?? null
    });
  }

  await writeFile(path.join(outputDir, 'index.json'), `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  await writeFile(path.join(repoRoot, 'pages', 'products.html'), buildProductIndexHtml(rows), 'utf8');
  logger.log(`Generated ${rows.length} evidence-backed product pages to ${path.relative(repoRoot, outputDir)}`);
  return { count: rows.length, rows };
}

if (require.main === module) {
  generateProductPages().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildOfferJsonLd,
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
  buildProductJsonLd,
  hasProductRichResultQualifier,
  buildProductIndexHtml,
  buildProductPageHtml,
  categoryLabel,
  generateProductPages,
  getPricedRetailerOffers,
  productName,
  selectVerifiedProducts,
  slugifyProduct
};
