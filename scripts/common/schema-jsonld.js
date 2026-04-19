'use strict';

function stringifyJsonLd(value, { pretty = false, indent = 2 } = {}) {
  return pretty ? JSON.stringify(value, null, indent) : JSON.stringify(value);
}

function toJsonLdScriptTag(value, options = {}) {
  const { pretty = false, indent = 2 } = options;
  const payload = stringifyJsonLd(value, { pretty, indent });
  if (!pretty) {
    return `<script type="application/ld+json">${payload}</script>`;
  }
  return `<script type="application/ld+json">\n${payload}\n</script>`;
}

module.exports = {
  stringifyJsonLd,
  toJsonLdScriptTag
};
