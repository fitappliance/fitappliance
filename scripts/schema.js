'use strict';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isInRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function validateRetailer(retailer, productId, errors) {
  if (!isPlainObject(retailer)) {
    errors.push(`Product ${productId} retailer entries must be objects`);
    return;
  }

  if (!isNonEmptyString(retailer.n)) {
    errors.push(`Product ${productId} retailer name must be a non-empty string`);
  }

  if (!isNonEmptyString(retailer.url)) {
    errors.push(`Product ${productId} retailer url must be a non-empty string`);
  }

  if (!(retailer.p === null || isNonNegativeInteger(retailer.p))) {
    errors.push(`Product ${productId} retailer price must be null or a non-negative integer`);
  }
}

function validateProduct(product) {
  const errors = [];

  if (!isPlainObject(product)) {
    errors.push('Each product must be an object');
    return errors;
  }

  const requiredStrings = ['id', 'cat', 'brand', 'model', 'emoji'];
  for (const key of requiredStrings) {
    if (!isNonEmptyString(product[key])) {
      errors.push(`Product ${product.id ?? '<unknown>'} is missing a valid ${key}`);
    }
  }

  if (!isPositiveInteger(product.w) || !isInRange(product.w, 200, 2500)) {
    errors.push(`Product ${product.id ?? '<unknown>'} field w must be an integer in [200, 2500]`);
  }

  if (!isPositiveInteger(product.h) || !isInRange(product.h, 200, 2500)) {
    errors.push(`Product ${product.id ?? '<unknown>'} field h must be an integer in [200, 2500]`);
  }

  if (!isPositiveInteger(product.d) || !isInRange(product.d, 200, 1500)) {
    errors.push(`Product ${product.id ?? '<unknown>'} field d must be an integer in [200, 1500]`);
  }

  if (!isNonNegativeInteger(product.kwh_year) || !isInRange(product.kwh_year, 50, 2000)) {
    errors.push(`Product ${product.id ?? '<unknown>'} field kwh_year must be in [50, 2000]`);
  }

  if (!Number.isInteger(product.stars) || !isInRange(product.stars, 1, 6)) {
    errors.push(`Product ${product.id ?? '<unknown>'} field stars must be an integer in [1, 6]`);
  }

  if (
    !(
      product.price === null ||
      (isNonNegativeInteger(product.price) && isInRange(product.price, 1, 100000))
    )
  ) {
    errors.push(`Product ${product.id ?? '<unknown>'} field price must be null or in [1, 100000]`);
  }

  if (product.door_swing_mm !== null) {
    // Sentinel 0 means this model has been manually verified to need no extra
    // hinge-side clearance beyond the measured cabinet footprint.
    const isSentinelZero = product.door_swing_mm === 0;
    const isIntegerSwing = Number.isInteger(product.door_swing_mm);
    const isHingeClearanceRange = isInRange(product.door_swing_mm, 5, 100);
    const isPhysicalRange = isInRange(product.door_swing_mm, 400, 1200);

    if (!(isSentinelZero || (isIntegerSwing && (isHingeClearanceRange || isPhysicalRange)))) {
      errors.push(
        `Product ${product.id ?? '<unknown>'} field door_swing_mm must be 0 or integer within [5, 100] or [400, 1200]`
      );
    }
  }

  if (!Array.isArray(product.features) || product.features.some(feature => !isNonEmptyString(feature))) {
    errors.push(`Product ${product.id ?? '<unknown>'} field features must be an array of non-empty strings`);
  }

  if (!Array.isArray(product.retailers)) {
    errors.push(`Product ${product.id ?? '<unknown>'} field retailers must be an array`);
  } else {
    for (const retailer of product.retailers) {
      validateRetailer(retailer, product.id ?? '<unknown>', errors);
    }
  }

  if (typeof product.sponsored !== 'boolean') {
    errors.push(`Product ${product.id ?? '<unknown>'} field sponsored must be boolean`);
  }

  if (
    Object.prototype.hasOwnProperty.call(product, 'unavailable') &&
    typeof product.unavailable !== 'boolean'
  ) {
    errors.push(`Product ${product.id ?? '<unknown>'} field unavailable must be boolean when provided`);
  }

  if (
    product.direct_url !== undefined &&
    product.direct_url !== null &&
    !(isNonEmptyString(product.direct_url) && product.direct_url.startsWith('https://'))
  ) {
    errors.push(`Product ${product.id ?? '<unknown>'} direct_url must be an https:// URL`);
  }

  if (
    Object.prototype.hasOwnProperty.call(product, 'inferred_door_swing') &&
    typeof product.inferred_door_swing !== 'boolean'
  ) {
    errors.push(`Product ${product.id ?? '<unknown>'} inferred_door_swing must be boolean when present`);
  }

  return errors;
}

function validateAppliancesDocument(document) {
  const errors = [];

  if (!isPlainObject(document)) {
    throw new Error('Invalid appliances document: document must be an object');
  }

  if (document.schema_version !== 2) {
    errors.push('Invalid appliances document: schema_version must be 2');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(document.last_updated ?? '')) {
    errors.push('Invalid appliances document: last_updated must be YYYY-MM-DD');
  }

  if (!Array.isArray(document.products)) {
    errors.push('Invalid appliances document: products must be an array');
  } else {
    const seenIds = new Set();
    for (const product of document.products) {
      errors.push(...validateProduct(product));

      if (isNonEmptyString(product?.id)) {
        if (seenIds.has(product.id)) {
          errors.push(`Invalid appliances document: duplicate product id ${product.id}`);
        }
        seenIds.add(product.id);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  return document;
}

function assertDoorSwingResearchCoverage(document, notesText) {
  const missingIds = document.products
    .filter(product => product.door_swing_mm === null && product.unavailable !== true)
    .map(product => product.id)
    .filter(id => !notesText.includes(`\`${id}\``));

  if (missingIds.length > 0) {
    throw new Error(
      `Door swing research notes are missing entries for: ${missingIds.join(', ')}`
    );
  }
}

module.exports = {
  assertDoorSwingResearchCoverage,
  validateAppliancesDocument,
  validateProduct
};
