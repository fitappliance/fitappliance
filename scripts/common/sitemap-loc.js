'use strict';

const { SITE_ORIGIN } = require('./site-origin.js');

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl ?? SITE_ORIGIN).replace(/\/+$/, '');
}

function toAbsoluteSitemapLoc(baseUrl, relativePath) {
  const normalizedPath = String(relativePath ?? '/').startsWith('/')
    ? String(relativePath)
    : `/${relativePath}`;
  return `${normalizeBaseUrl(baseUrl)}${normalizedPath}`;
}

module.exports = {
  normalizeBaseUrl,
  toAbsoluteSitemapLoc
};
