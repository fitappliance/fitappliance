import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { generateSitemap } = require('../scripts/generate-sitemap.js');

function extractNode(xmlText, locSuffix) {
  const matches = xmlText.matchAll(/<url>\s*([\s\S]*?)\s*<\/url>/g);
  for (const match of matches) {
    const block = match[1];
    if (!block.includes(locSuffix)) continue;
    const getValue = (tag) => block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1]?.trim() ?? '';
    return {
      loc: getValue('loc'),
      changefreq: getValue('changefreq'),
      priority: getValue('priority')
    };
  }
  return null;
}

test('phase 54 A3 sitemap metadata keeps fit-check pages monthly with 0.6 priority', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'fitappliance-sitemap-fit-check-'));
  const brandsDir = path.join(rootDir, 'pages', 'brands');
  const fitCheckDir = path.join(rootDir, 'pages', 'fit-check');
  const outputPath = path.join(rootDir, 'public', 'sitemap.xml');

  await mkdir(brandsDir, { recursive: true });
  await mkdir(fitCheckDir, { recursive: true });
  await writeFile(path.join(brandsDir, 'index.json'), '[]\n', 'utf8');
  await writeFile(path.join(fitCheckDir, 'sample-in-600mm-cavity.html'), '<html></html>', 'utf8');

  await generateSitemap({
    repoRoot: rootDir,
    brandsIndexPath: path.join(brandsDir, 'index.json'),
    outputPath,
    today: '2026-05-08',
    logger: { log() {} }
  });

  const xml = await readFile(outputPath, 'utf8');
  const node = extractNode(xml, '/fit-check/sample-in-600mm-cavity');

  assert.equal(node?.changefreq, 'monthly');
  assert.equal(node?.priority, '0.6');
});
