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
const OG_CANVAS = {
  width: 1200,
  height: 630
};
const FONT_FILES = {
  medium: path.join(__dirname, 'assets', 'fonts', 'Outfit-Medium.ttf'),
  bold: path.join(__dirname, 'assets', 'fonts', 'Outfit-Bold.ttf')
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

function escPango(value) {
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

async function loadEmbeddedFonts() {
  return {
    medium: FONT_FILES.medium,
    bold: FONT_FILES.bold
  };
}

function buildBackgroundSvg() {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${OG_CANVAS.width}" height="${OG_CANVAS.height}" viewBox="0 0 ${OG_CANVAS.width} ${OG_CANVAS.height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#131210" />
      <stop offset="100%" stop-color="#2d271f" />
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#B55A2C" stop-opacity="0.95" />
      <stop offset="100%" stop-color="#D97A42" stop-opacity="0.4" />
    </linearGradient>
  </defs>
  <rect width="${OG_CANVAS.width}" height="${OG_CANVAS.height}" fill="url(#bg)" />
  <rect x="58" y="58" width="1084" height="514" rx="26" ry="26" fill="none" stroke="#B55A2C" stroke-width="2"/>
  <rect x="90" y="94" width="340" height="8" rx="4" fill="url(#accent)" />
  <circle cx="1072" cy="128" r="74" fill="#201b16" opacity="0.92" />
  <circle cx="1072" cy="128" r="57" fill="none" stroke="#B55A2C" stroke-width="2" opacity="0.7" />
  <path d="M986 510 C1088 438 1118 390 1142 310" fill="none" stroke="#3A3128" stroke-width="22" stroke-linecap="round" opacity="0.65" />
  <path d="M1018 540 C1114 470 1146 414 1170 332" fill="none" stroke="#B55A2C" stroke-width="3" stroke-linecap="round" opacity="0.65" />
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

async function buildTextOverlay({
  text,
  fontfile,
  font,
  width,
  height,
  color
}) {
  return sharp({
    text: {
      text: `<span foreground="${color}">${escPango(text)}</span>`,
      font,
      fontfile,
      width,
      height,
      align: 'left',
      rgba: true,
      wrap: 'word-char'
    }
  }).png().toBuffer();
}

async function writeOgImage({ outputPath, title, subtitle, fonts }) {
  const svg = buildBackgroundSvg();
  const webpPath = outputPath.replace(/\.png$/i, '.webp');
  const background = Buffer.from(svg);
  const safeTitle = String(title ?? '').slice(0, 70);
  const safeSubtitle = String(subtitle ?? '').slice(0, 90);
  const [titleOverlay, subtitleOverlay, brandOverlay] = await Promise.all([
    buildTextOverlay({
      text: safeTitle,
      fontfile: fonts.bold,
      font: 'Outfit 70',
      width: 980,
      height: 120,
      color: '#FAF8F4'
    }),
    buildTextOverlay({
      text: safeSubtitle,
      fontfile: fonts.medium,
      font: 'Outfit 42',
      width: 900,
      height: 80,
      color: '#D4CBC0'
    }),
    buildTextOverlay({
      text: 'fitappliance.com.au',
      fontfile: fonts.medium,
      font: 'Outfit 30',
      width: 420,
      height: 48,
      color: '#B9AF9F'
    })
  ]);

  const baseImage = sharp(background).composite([
    { input: titleOverlay, left: 90, top: 130 },
    { input: subtitleOverlay, left: 90, top: 248 },
    { input: brandOverlay, left: 90, top: 505 }
  ]);

  await baseImage.clone()
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
  await baseImage.clone()
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
  const fonts = await loadEmbeddedFonts();

  await cleanOutputDir(outputDir);

  let written = 0;
  for (const row of brands) {
    const catMeta = CATEGORY_META[row.cat] ?? { slug: String(row.cat ?? ''), label: String(row.cat ?? '') };
    const brandSlug = slugify(row.brand);
    const fileName = `${brandSlug}-${catMeta.slug}.png`;
    await writeOgImage({
      outputPath: path.join(outputDir, fileName),
      title: `${row.brand} ${catMeta.label}`,
      subtitle: 'Clearance Guide Australia',
      fonts
    });
    written += 1;
  }

  for (const row of compares) {
    const catMeta = CATEGORY_META[row.cat] ?? { slug: String(row.cat ?? ''), label: String(row.cat ?? '') };
    const fileName = `compare-${row.slug}.png`;
    await writeOgImage({
      outputPath: path.join(outputDir, fileName),
      title: `${row.brandA} vs ${row.brandB}`,
      subtitle: `${catMeta.label} clearance comparison`,
      fonts
    });
    written += 1;
  }

  for (const row of guides) {
    const fileName = `guide-${row.slug}.png`;
    await writeOgImage({
      outputPath: path.join(outputDir, fileName),
      title: row.title ?? 'Appliance Fit Guide',
      subtitle: 'FitAppliance Topic Hub',
      fonts
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
  FONT_FILES,
  loadEmbeddedFonts,
  slugify
};
