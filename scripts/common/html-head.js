'use strict';

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return map[char];
  });
}

function buildHtmlHead({
  title,
  description,
  canonical,
  modifiedTime = null,
  charset = 'UTF-8',
  viewport = 'width=device-width, initial-scale=1.0',
  extraMeta = ''
} = {}) {
  const lines = [
    `  <meta charset="${charset}">`,
    `  <meta name="viewport" content="${viewport}">`,
    `  <title>${escHtml(title)}</title>`,
    `  <meta name="description" content="${escHtml(description)}">`
  ];

  if (modifiedTime) {
    lines.push(`  <meta name="article:modified_time" content="${escHtml(modifiedTime)}">`);
  }
  if (canonical) {
    lines.push(`  <link rel="canonical" href="${canonical}">`);
  }
  if (typeof extraMeta === 'string' && extraMeta.trim()) {
    lines.push(extraMeta.trimEnd());
  }

  return lines.join('\n');
}

module.exports = {
  escHtml,
  buildHtmlHead
};
