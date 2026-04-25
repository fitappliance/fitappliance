'use strict';

const JSON_LD_KEY_ORDER = new Map([
  ['@context', 0],
  ['@type', 1],
  ['@id', 2]
]);

function compareJsonLdKeys(a, b) {
  const aRank = JSON_LD_KEY_ORDER.has(a) ? JSON_LD_KEY_ORDER.get(a) : 100;
  const bRank = JSON_LD_KEY_ORDER.has(b) ? JSON_LD_KEY_ORDER.get(b) : 100;
  if (aRank !== bRank) return aRank - bRank;
  return a.localeCompare(b);
}

function sortJsonLdKeys(value) {
  if (Array.isArray(value)) {
    return value.map((row) => sortJsonLdKeys(row));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.keys(value)
    .sort(compareJsonLdKeys)
    .reduce((acc, key) => ({
      ...acc,
      [key]: sortJsonLdKeys(value[key])
    }), {});
}

function stringifyJsonLd(value, { pretty = false, indent = 2 } = {}) {
  return pretty ? JSON.stringify(value, null, indent) : JSON.stringify(value);
}

function serializeJsonLd(value, { pretty = false, indent = 2 } = {}) {
  return stringifyJsonLd(sortJsonLdKeys(value), { pretty, indent });
}

function toJsonLdScriptTag(value, options = {}) {
  const { pretty = false, indent = 2 } = options;
  const payload = stringifyJsonLd(value, { pretty, indent });
  if (!pretty) {
    return `<script type="application/ld+json">${payload}</script>`;
  }
  return `<script type="application/ld+json">\n${payload}\n</script>`;
}

function buildArticleSchema({
  headline,
  description,
  datePublished,
  dateModified,
  image,
  url,
  authorName = 'FitAppliance Editorial Team',
  publisherName = 'FitAppliance',
  publisherUrl,
  publisherLogoUrl,
  language = 'en-AU'
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    author: {
      '@type': 'Organization',
      name: authorName
    },
    dateModified,
    datePublished,
    description,
    headline,
    image,
    inLanguage: language,
    publisher: {
      '@type': 'Organization',
      logo: {
        '@type': 'ImageObject',
        url: publisherLogoUrl
      },
      name: publisherName,
      url: publisherUrl
    },
    url
  };
}

module.exports = {
  buildArticleSchema,
  serializeJsonLd,
  stringifyJsonLd,
  sortJsonLdKeys,
  toJsonLdScriptTag
};
