'use strict';

const path = require('node:path');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const { SITE_ORIGIN } = require('./common/site-origin.js');
const { toAbsoluteSitemapLoc } = require('./common/sitemap-loc.js');

const STATIC_PAGES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/affiliate-disclosure', changefreq: 'monthly', priority: '0.4' },
  { path: '/privacy-policy', changefreq: 'monthly', priority: '0.4' },
  { path: '/methodology', changefreq: 'monthly', priority: '0.6' },
  { path: '/about/editorial-standards', changefreq: 'monthly', priority: '0.6' }
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
  compareIndexPath = null,
  cavityIndexPath = null,
  doorwayIndexPath = null,
  guideIndexPath = null,
  locationIndexPath = null,
  outputPath = path.join(repoRoot, 'public', 'sitemap.xml'),
  baseUrl = SITE_ORIGIN,
  today = new Date().toISOString().slice(0, 10),
  logger = console
} = {}) {
  const readJsonIfExists = async (filePath) => {
    try {
      const text = await readFile(filePath, 'utf8');
      return JSON.parse(text);
    } catch (error) {
      if (error && error.code === 'ENOENT') return [];
      throw error;
    }
  };

  const effectiveCompareIndexPath = compareIndexPath
    ?? path.join(path.dirname(path.dirname(brandsIndexPath)), 'compare', 'index.json');
  const effectiveCavityIndexPath = cavityIndexPath
    ?? path.join(path.dirname(path.dirname(brandsIndexPath)), 'cavity', 'index.json');
  const effectiveDoorwayIndexPath = doorwayIndexPath
    ?? path.join(path.dirname(path.dirname(brandsIndexPath)), 'doorway', 'index.json');
  const effectiveGuideIndexPath = guideIndexPath
    ?? path.join(path.dirname(path.dirname(brandsIndexPath)), 'guides', 'index.json');
  const effectiveLocationIndexPath = locationIndexPath
    ?? path.join(path.dirname(path.dirname(brandsIndexPath)), 'location', 'index.json');

  const brandRows = await readJsonIfExists(brandsIndexPath);
  const compareRows = await readJsonIfExists(effectiveCompareIndexPath);
  const cavityRows = await readJsonIfExists(effectiveCavityIndexPath);
  const doorwayRows = await readJsonIfExists(effectiveDoorwayIndexPath);
  const guideRows = await readJsonIfExists(effectiveGuideIndexPath);
  const locationRows = await readJsonIfExists(effectiveLocationIndexPath);
  const sortedBrands = sortBrandEntries(Array.isArray(brandRows) ? brandRows : []);
  const sortedComparisons = [...(Array.isArray(compareRows) ? compareRows : [])].sort((left, right) => {
    const leftCat = String(left?.cat ?? '');
    const rightCat = String(right?.cat ?? '');
    if (leftCat !== rightCat) return leftCat.localeCompare(rightCat);

    const leftA = String(left?.brandA ?? '');
    const rightA = String(right?.brandA ?? '');
    if (leftA !== rightA) return leftA.localeCompare(rightA);

    const leftB = String(left?.brandB ?? '');
    const rightB = String(right?.brandB ?? '');
    return leftB.localeCompare(rightB);
  });
  const sortedCavity = [...(Array.isArray(cavityRows) ? cavityRows : [])].sort(
    (left, right) => Number(left?.width ?? 0) - Number(right?.width ?? 0)
  );
  const sortedDoorway = [...(Array.isArray(doorwayRows) ? doorwayRows : [])].sort(
    (left, right) => Number(left?.doorway ?? 0) - Number(right?.doorway ?? 0)
  );
  const sortedGuides = [...(Array.isArray(guideRows) ? guideRows : [])].sort((left, right) =>
    String(left?.slug ?? '').localeCompare(String(right?.slug ?? ''))
  );
  const sortedLocations = [...(Array.isArray(locationRows) ? locationRows : [])].sort((left, right) => {
    const leftCity = String(left?.citySlug ?? '');
    const rightCity = String(right?.citySlug ?? '');
    if (leftCity !== rightCity) return leftCity.localeCompare(rightCity);
    return String(left?.category ?? '').localeCompare(String(right?.category ?? ''));
  });

  const staticNodes = STATIC_PAGES.map((page) =>
    buildUrlNode({
      loc: toAbsoluteSitemapLoc(baseUrl, page.path),
      lastmod: today,
      changefreq: page.changefreq,
      priority: page.priority
    })
  );

  const brandNodes = sortedBrands.map((row) =>
    buildUrlNode({
      loc: toAbsoluteSitemapLoc(baseUrl, row.url ?? `/brands/${row.slug}`),
      lastmod: today,
      changefreq: 'weekly',
      priority: PRIORITY_BY_CAT[row.cat] ?? '0.6'
    })
  );

  const comparisonNodes = sortedComparisons.map((row) =>
    buildUrlNode({
      loc: toAbsoluteSitemapLoc(baseUrl, row.url ?? `/compare/${row.slug}`),
      lastmod: today,
      changefreq: 'monthly',
      priority: '0.6'
    })
  );

  const cavityNodes = sortedCavity.map((row) =>
    buildUrlNode({
      loc: toAbsoluteSitemapLoc(baseUrl, row.url ?? `/cavity/${row.slug}`),
      lastmod: today,
      changefreq: 'weekly',
      priority: '0.6'
    })
  );

  const doorwayNodes = sortedDoorway.map((row) =>
    buildUrlNode({
      loc: toAbsoluteSitemapLoc(baseUrl, row.url ?? `/doorway/${row.slug}`),
      lastmod: today,
      changefreq: 'weekly',
      priority: '0.6'
    })
  );
  const guideNodes = sortedGuides.map((row) =>
    buildUrlNode({
      loc: toAbsoluteSitemapLoc(baseUrl, row.url ?? `/guides/${row.slug}`),
      lastmod: today,
      changefreq: 'weekly',
      priority: '0.7'
    })
  );
  const locationNodes = sortedLocations.map((row) =>
    buildUrlNode({
      loc: toAbsoluteSitemapLoc(baseUrl, row.url ?? `/location/${row.citySlug}/${row.category}`),
      lastmod: today,
      changefreq: 'weekly',
      priority: '0.5'
    })
  );

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...staticNodes,
    ...brandNodes,
    ...comparisonNodes,
    ...cavityNodes,
    ...doorwayNodes,
    ...guideNodes,
    ...locationNodes,
    '</urlset>',
    ''
  ].join('\n');

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, xml, 'utf8');
  const urlCount = STATIC_PAGES.length + brandNodes.length + comparisonNodes.length + cavityNodes.length + doorwayNodes.length + guideNodes.length + locationNodes.length;
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
