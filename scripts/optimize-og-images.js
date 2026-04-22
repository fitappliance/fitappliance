'use strict';

const path = require('node:path');
const { readdir, stat } = require('node:fs/promises');
const sharp = require('sharp');

const PNG_OPTIONS = {
  compressionLevel: 9,
  effort: 10,
  palette: true,
  quality: 70,
  colors: 6,
  dither: 0
};

async function optimizeOgImages({
  repoRoot = path.resolve(__dirname, '..'),
  ogDir = path.join(repoRoot, 'public', 'og-images'),
  logger = console
} = {}) {
  const files = (await readdir(ogDir)).filter((name) => name.endsWith('.png')).sort();
  let beforeBytes = 0;
  let afterBytes = 0;

  for (const name of files) {
    const filePath = path.join(ogDir, name);
    const fileStat = await stat(filePath);
    const input = sharp(filePath, { animated: false, limitInputPixels: false });
    const firstPass = await input
      .resize(1200, 630, { fit: 'fill' })
      .png(PNG_OPTIONS)
      .toBuffer();
    const secondPass = await sharp(firstPass, { animated: false, limitInputPixels: false })
      .png(PNG_OPTIONS)
      .toBuffer();
    beforeBytes += fileStat.size;
    afterBytes += secondPass.length;
    await sharp(secondPass).png(PNG_OPTIONS).toFile(filePath);
  }

  logger.log(
    `[optimize-og-images] files=${files.length} before=${beforeBytes} after=${afterBytes}`
  );

  return {
    files: files.length,
    beforeBytes,
    afterBytes
  };
}

if (require.main === module) {
  optimizeOgImages().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  PNG_OPTIONS,
  optimizeOgImages
};
