#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdir, readFile, readdir, writeFile } = require('node:fs/promises');

const CATEGORY_SLUG = {
  fridge: 'fridge',
  washing_machine: 'washing-machine',
  dishwasher: 'dishwasher',
  dryer: 'dryer'
};

function escXml(value) {
  return String(value ?? '').replace(/[<>&'"]/g, (char) => {
    const map = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      "'": '&apos;',
      '"': '&quot;'
    };
    return map[char] ?? char;
  });
}

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function readJson(filePath, fallback = []) {
  try {
    const text = await readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function buildUrlNode({ loc, image }) {
  return [
    '  <url>',
    `    <loc>${escXml(loc)}</loc>`,
    '    <image:image>',
    `      <image:loc>${escXml(image)}</image:loc>`,
    '    </image:image>',
    '  </url>'
  ].join('\n');
}

async function generateImageSitemap({
  repoRoot = path.resolve(__dirname, '..'),
  outputPath = path.join(repoRoot, 'public', 'image-sitemap.xml'),
  baseUrl = 'https://fitappliance.com.au',
  logger = console
} = {}) {
  const brands = await readJson(path.join(repoRoot, 'pages', 'brands', 'index.json'), []);
  const compares = await readJson(path.join(repoRoot, 'pages', 'compare', 'index.json'), []);
  const ogDir = path.join(repoRoot, 'public', 'og-images');
  const ogFiles = new Set((await readdir(ogDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.png'))
    .map((entry) => entry.name));

  const rows = [];

  for (const row of brands) {
    const catSlug = CATEGORY_SLUG[row.cat] ?? slugify(row.cat);
    const imageFile = `${slugify(row.brand)}-${catSlug}.png`;
    if (!ogFiles.has(imageFile)) continue;
    rows.push({
      loc: `${baseUrl}${row.url ?? `/brands/${row.slug}`}`,
      image: `${baseUrl}/og-images/${imageFile}`
    });
  }

  for (const row of compares) {
    const imageFile = `compare-${row.slug}.png`;
    if (!ogFiles.has(imageFile)) continue;
    rows.push({
      loc: `${baseUrl}${row.url ?? `/compare/${row.slug}`}`,
      image: `${baseUrl}/og-images/${imageFile}`
    });
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...rows.map((row) => buildUrlNode(row)),
    '</urlset>',
    ''
  ].join('\n');

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, xml, 'utf8');
  logger.log(`Generated image sitemap with ${rows.length} URLs at ${outputPath}`);
  return { urlCount: rows.length, outputPath };
}

if (require.main === module) {
  generateImageSitemap().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  generateImageSitemap
};
