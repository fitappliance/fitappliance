import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = '/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2';
const sitemapModuleUrl = pathToFileURL(path.join(repoRoot, 'scripts', 'generate-sitemap.js')).href;

function extractNodes(xmlText) {
  const nodes = [];
  const matches = xmlText.matchAll(/<url>\s*([\s\S]*?)\s*<\/url>/g);
  for (const match of matches) {
    const block = match[1];
    const getValue = (tag) => {
      const tagMatch = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
      return tagMatch ? tagMatch[1].trim() : '';
    };
    nodes.push({
      loc: getValue('loc'),
      lastmod: getValue('lastmod'),
      changefreq: getValue('changefreq'),
      priority: getValue('priority')
    });
  }
  return nodes;
}

async function createWorkspace(indexRows) {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'fitappliance-sitemap-'));
  const brandsDir = path.join(rootDir, 'pages', 'brands');
  const outputPath = path.join(rootDir, 'public', 'sitemap.xml');
  const brandsIndexPath = path.join(brandsDir, 'index.json');

  await mkdir(brandsDir, { recursive: true });
  await writeFile(brandsIndexPath, `${JSON.stringify(indexRows, null, 2)}\n`, 'utf8');

  return {
    rootDir,
    brandsIndexPath,
    outputPath
  };
}

test('task 9.1 sitemap: generates expected URL count with static + brand pages', async () => {
  const { generateSitemap } = await import(sitemapModuleUrl);
  const workspace = await createWorkspace([
    { brand: 'Samsung', cat: 'fridge', slug: 'samsung-fridge-clearance', url: '/brands/samsung-fridge-clearance' },
    { brand: 'Bosch', cat: 'dishwasher', slug: 'bosch-dishwasher-clearance', url: '/brands/bosch-dishwasher-clearance' },
    { brand: 'LG', cat: 'dryer', slug: 'lg-dryer-clearance', url: '/brands/lg-dryer-clearance' }
  ]);

  const result = await generateSitemap({
    brandsIndexPath: workspace.brandsIndexPath,
    outputPath: workspace.outputPath,
    baseUrl: 'https://fitappliance.com.au',
    today: '2026-04-15',
    logger: { log() {} }
  });

  assert.equal(result.urlCount, 6);
});

test('task 9.1 sitemap: assigns category-based priority values', async () => {
  const { generateSitemap } = await import(sitemapModuleUrl);
  const workspace = await createWorkspace([
    { brand: 'Samsung', cat: 'fridge', slug: 'samsung-fridge-clearance', url: '/brands/samsung-fridge-clearance' },
    { brand: 'LG', cat: 'dryer', slug: 'lg-dryer-clearance', url: '/brands/lg-dryer-clearance' }
  ]);

  await generateSitemap({
    brandsIndexPath: workspace.brandsIndexPath,
    outputPath: workspace.outputPath,
    today: '2026-04-15',
    logger: { log() {} }
  });

  const xml = await readFile(workspace.outputPath, 'utf8');
  const nodes = extractNodes(xml);
  const fridgeNode = nodes.find((node) => node.loc.endsWith('/brands/samsung-fridge-clearance'));
  const dryerNode = nodes.find((node) => node.loc.endsWith('/brands/lg-dryer-clearance'));

  assert.equal(fridgeNode?.priority, '0.8');
  assert.equal(dryerNode?.priority, '0.6');
});

test('task 9.1 sitemap: outputs xml envelope with <urlset>', async () => {
  const { generateSitemap } = await import(sitemapModuleUrl);
  const workspace = await createWorkspace([]);

  await generateSitemap({
    brandsIndexPath: workspace.brandsIndexPath,
    outputPath: workspace.outputPath,
    today: '2026-04-15',
    logger: { log() {} }
  });

  const xml = await readFile(workspace.outputPath, 'utf8');
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.match(xml, /<urlset[\s\S]*<\/urlset>/);
});

test('task 9.1 sitemap: includes static pages even when brand index is empty', async () => {
  const { generateSitemap } = await import(sitemapModuleUrl);
  const workspace = await createWorkspace([]);

  await generateSitemap({
    brandsIndexPath: workspace.brandsIndexPath,
    outputPath: workspace.outputPath,
    today: '2026-04-15',
    logger: { log() {} }
  });

  const xml = await readFile(workspace.outputPath, 'utf8');
  const nodes = extractNodes(xml);
  assert.equal(nodes.length, 3);
  assert.equal(nodes[0].loc, 'https://fitappliance.com.au/');
  assert.equal(nodes[1].loc, 'https://fitappliance.com.au/affiliate-disclosure');
  assert.equal(nodes[2].loc, 'https://fitappliance.com.au/privacy-policy');
});

test('task 9.1 sitemap: keeps static URLs first and sorts brand URLs by category then brand', async () => {
  const { generateSitemap } = await import(sitemapModuleUrl);
  const workspace = await createWorkspace([
    { brand: 'Hisense', cat: 'fridge', slug: 'hisense-fridge-clearance', url: '/brands/hisense-fridge-clearance' },
    { brand: 'Bosch', cat: 'dishwasher', slug: 'bosch-dishwasher-clearance', url: '/brands/bosch-dishwasher-clearance' },
    { brand: 'LG', cat: 'fridge', slug: 'lg-fridge-clearance', url: '/brands/lg-fridge-clearance' }
  ]);

  await generateSitemap({
    brandsIndexPath: workspace.brandsIndexPath,
    outputPath: workspace.outputPath,
    today: '2026-04-15',
    logger: { log() {} }
  });

  const xml = await readFile(workspace.outputPath, 'utf8');
  const nodes = extractNodes(xml);
  const locs = nodes.map((node) => node.loc);

  assert.deepEqual(locs.slice(0, 3), [
    'https://fitappliance.com.au/',
    'https://fitappliance.com.au/affiliate-disclosure',
    'https://fitappliance.com.au/privacy-policy'
  ]);
  assert.deepEqual(locs.slice(3), [
    'https://fitappliance.com.au/brands/bosch-dishwasher-clearance',
    'https://fitappliance.com.au/brands/hisense-fridge-clearance',
    'https://fitappliance.com.au/brands/lg-fridge-clearance'
  ]);
});

test('task 9.1 sitemap: applies passed today value to all lastmod tags', async () => {
  const { generateSitemap } = await import(sitemapModuleUrl);
  const workspace = await createWorkspace([
    { brand: 'Samsung', cat: 'fridge', slug: 'samsung-fridge-clearance', url: '/brands/samsung-fridge-clearance' }
  ]);

  await generateSitemap({
    brandsIndexPath: workspace.brandsIndexPath,
    outputPath: workspace.outputPath,
    today: '2026-04-30',
    logger: { log() {} }
  });

  const xml = await readFile(workspace.outputPath, 'utf8');
  const nodes = extractNodes(xml);
  assert.equal(nodes.every((node) => node.lastmod === '2026-04-30'), true);
});

test('task 9.1 sitemap: returns urlCount and outputPath in result object', async () => {
  const { generateSitemap } = await import(sitemapModuleUrl);
  const workspace = await createWorkspace([
    { brand: 'Samsung', cat: 'fridge', slug: 'samsung-fridge-clearance', url: '/brands/samsung-fridge-clearance' }
  ]);

  const result = await generateSitemap({
    brandsIndexPath: workspace.brandsIndexPath,
    outputPath: workspace.outputPath,
    today: '2026-04-15',
    logger: { log() {} }
  });

  assert.equal(typeof result.urlCount, 'number');
  assert.equal(result.outputPath, workspace.outputPath);
});
