'use strict';

const path = require('node:path');
const { mkdir, writeFile } = require('node:fs/promises');
const { loadCopyFile } = require('./common/copy-data.js');

async function generateUiCopy({
  repoRoot = path.resolve(__dirname, '..'),
  outputPath = path.join(repoRoot, 'public', 'data', 'ui-copy.json'),
  logger = console
} = {}) {
  const hero = await loadCopyFile('hero', repoRoot);
  const footer = await loadCopyFile('footer', repoRoot);
  const selectedKey = hero.default;
  const selectedHero = hero.variants?.[selectedKey] ?? {};

  const document = {
    hero: {
      key: selectedKey,
      ...selectedHero
    },
    footer
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  logger.log(`[generate-ui-copy] wrote ${path.relative(repoRoot, outputPath)}`);
  return { outputPath, document };
}

if (require.main === module) {
  generateUiCopy().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  generateUiCopy
};
