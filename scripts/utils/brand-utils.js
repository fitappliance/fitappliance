'use strict';

const { BRAND_NAME_MAP, normalizeBrandName } = require('../common/brand-name.js');

function displayBrandName(raw) {
  return normalizeBrandName(raw);
}

module.exports = {
  displayBrandName,
  BRAND_DISPLAY_MAP: BRAND_NAME_MAP
};
