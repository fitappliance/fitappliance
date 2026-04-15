'use strict';

const path = require('node:path');
const { mkdir, readFile, writeFile } = require('node:fs/promises');

const STATIC_PAGES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/affiliate-disclosure', changefreq: 'monthly', priority: '0.4' },
  { path: '/privacy-policy', changefreq: 'monthly', priority: '0.4' }
];

const PRIORITY_BY_CAT = {
  fridge: '0.8',
  washing_machine: '0.7',
  dishwasher: '0.7',
  dryer: '0.6'
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

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl ?? 'https://fitappliance.com.au').replace(/\/+$/, '');
}

function toAbsoluteUrl(baseUrl, relativePath) {
  const normalizedPath = String(relativePath ?? '/').startsWith('/')
    ? String(relativePath)
    : `/${relativePath}`;
  return `${normalizeBaseUrl(baseUrl)}${normalizedPath}`;
}

function sortBrandEntries(entries) {
  return [...entries].sort((left, right) => {
    const leftCat = String(left?.cat ?? '');
    const rightCat = String(right?.cat ?? '');
    if (leftCat !== rightCat) return leftCat.localeCompare(rightCat);

    const leftBrand = String(left?.brand ?? '');
    const rightBrand = String(right?.brand ?? '');
    return leftBrand.localeCompare(rightBrand);
  });
}

function buildUrlNode({ loc, lastmod, changefreq, priority }) {
  return [
    '  <url>',
    `    <loc>${escXml(loc)}</loc>`,
    `    <lastmod>${escXml(lastmod)}</lastmod>`,
    `    <changefreq>${escXml(changefreq)}</changefreq>`,
    `    <priority>${escXml(priority)}</priority>`,
    '  </url>'
  ].join('\n');
}

async function generateSitemap({
  repoRoot = path.resolve(__dirname, '..'),
  brandsIndexPath = path.join(repoRoot, 'pages', 'brands', 'index.json'),
  outputPath = path.join(repoRoot, 'public', 'sitemap.xml'),
  baseUrl = 'https://fitappliance.com.au',
  today = new Date().toISOString().slice(0, 10),
  logger = console
} = {}) {
  const brandsText = await readFile(brandsIndexPath, 'utf8');
  const brandRows = JSON.parse(brandsText);
  const sortedBrands = sortBrandEntries(Array.isArray(brandRows) ? brandRows : []);

  const staticNodes = STATIC_PAGES.map((page) =>
    buildUrlNode({
      loc: toAbsoluteUrl(baseUrl, page.path),
      lastmod: today,
      changefreq: page.changefreq,
      priority: page.priority
    })
  );

  const brandNodes = sortedBrands.map((row) =>
    buildUrlNode({
      loc: toAbsoluteUrl(baseUrl, row.url ?? `/brands/${row.slug}`),
      lastmod: today,
      changefreq: 'weekly',
      priority: PRIORITY_BY_CAT[row.cat] ?? '0.6'
    })
  );

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...staticNodes,
    ...brandNodes,
    '</urlset>',
    ''
  ].join('\n');

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, xml, 'utf8');
  const urlCount = STATIC_PAGES.length + brandNodes.length;
  logger.log(`Generated sitemap with ${urlCount} URLs at ${outputPath}`);

  return { urlCount, outputPath };
}

if (require.main === module) {
  generateSitemap().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  generateSitemap,
  STATIC_PAGES,
  PRIORITY_BY_CAT
};
