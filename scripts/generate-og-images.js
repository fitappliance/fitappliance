#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { mkdir, readdir, readFile, rm } = require('node:fs/promises');
const sharp = require('sharp');
const { slugNormalize } = require('./common/slug-normalize.js');

const CATEGORY_META = {
  fridge: { slug: 'fridge', label: 'Fridge' },
  washing_machine: { slug: 'washing-machine', label: 'Washing Machine' },
  dishwasher: { slug: 'dishwasher', label: 'Dishwasher' },
  dryer: { slug: 'dryer', label: 'Dryer' }
};

function slugify(value) {
  return slugNormalize(value);
}

function escSvg(value) {
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

async function readJson(filePath, fallback = []) {
  try {
    const text = await readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function buildSvg({ title, subtitle }) {
  const safeTitle = escSvg(title).slice(0, 70);
  const safeSubtitle = escSvg(subtitle).slice(0, 90);
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#131210" />
      <stop offset="100%" stop-color="#2d271f" />
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)" />
  <rect x="58" y="58" width="1084" height="514" rx="26" ry="26" fill="none" stroke="#B55A2C" stroke-width="2"/>
  <text x="90" y="220" font-family="Outfit, Arial, sans-serif" font-size="70" font-weight="700" fill="#FAF8F4">${safeTitle}</text>
  <text x="90" y="305" font-family="Outfit, Arial, sans-serif" font-size="42" font-weight="500" fill="#D4CBC0">${safeSubtitle}</text>
  <text x="90" y="540" font-family="Outfit, Arial, sans-serif" font-size="30" fill="#B9AF9F">fitappliance.com.au</text>
</svg>
`;
}

async function cleanOutputDir(outputDir) {
  await mkdir(outputDir, { recursive: true });
  const entries = await readdir(outputDir, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    if (entry.isFile() && (entry.name.endsWith('.png') || entry.name.endsWith('.webp'))) {
      await rm(path.join(outputDir, entry.name), { force: true });
    }
  }));
}

async function writeOgImage({ outputPath, title, subtitle }) {
  const svg = buildSvg({ title, subtitle });
  const webpPath = outputPath.replace(/\.png$/i, '.webp');
  const buffer = Buffer.from(svg);
  await sharp(buffer)
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
  await sharp(buffer)
    .webp({ quality: 82 })
    .toFile(webpPath);
}

async function generateOgImages({
  repoRoot = path.resolve(__dirname, '..'),
  outputDir = path.join(repoRoot, 'public', 'og-images'),
  logger = console
} = {}) {
  const brandsIndexPath = path.join(repoRoot, 'pages', 'brands', 'index.json');
  const compareIndexPath = path.join(repoRoot, 'pages', 'compare', 'index.json');
  const guideIndexPath = path.join(repoRoot, 'pages', 'guides', 'index.json');
  const brands = await readJson(brandsIndexPath, []);
  const compares = await readJson(compareIndexPath, []);
  const guides = await readJson(guideIndexPath, []);

  await cleanOutputDir(outputDir);

  let written = 0;
  for (const row of brands) {
    const catMeta = CATEGORY_META[row.cat] ?? { slug: String(row.cat ?? ''), label: String(row.cat ?? '') };
    const brandSlug = slugify(row.brand);
    const fileName = `${brandSlug}-${catMeta.slug}.png`;
    await writeOgImage({
      outputPath: path.join(outputDir, fileName),
      title: `${row.brand} ${catMeta.label}`,
      subtitle: 'Clearance Guide Australia'
    });
    written += 1;
  }

  for (const row of compares) {
    const catMeta = CATEGORY_META[row.cat] ?? { slug: String(row.cat ?? ''), label: String(row.cat ?? '') };
    const fileName = `compare-${row.slug}.png`;
    await writeOgImage({
      outputPath: path.join(outputDir, fileName),
      title: `${row.brandA} vs ${row.brandB}`,
      subtitle: `${catMeta.label} clearance comparison`
    });
    written += 1;
  }

  for (const row of guides) {
    const fileName = `guide-${row.slug}.png`;
    await writeOgImage({
      outputPath: path.join(outputDir, fileName),
      title: row.title ?? 'Appliance Fit Guide',
      subtitle: 'FitAppliance Topic Hub'
    });
    written += 1;
  }

  logger.log(`Generated ${written} OG images in ${outputDir}`);
  return { written, outputDir };
}

if (require.main === module) {
  generateOgImages().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  generateOgImages,
  slugify
};
