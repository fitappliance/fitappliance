import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generatorModuleUrl = pathToFileURL(
  path.join(repoRoot, 'scripts', 'generate-cavity-pages.js')
).href;
const doorwayModuleUrl = pathToFileURL(
  path.join(repoRoot, 'scripts', 'generate-doorway-pages.js')
).href;

async function createWorkspace(prefix) {
  const root = await mkdtemp(path.join(tmpdir(), 'fitappliance-cavity-pages-'));
  const dataDir = path.join(root, 'public', 'data');
  await mkdir(dataDir, { recursive: true });
  await writeFile(path.join(dataDir, 'appliances.json'), `${JSON.stringify({
    schema_version: 2,
    last_updated: '2026-07-21',
    products: [
      {
        id: 'current-fridge',
        cat: 'fridge',
        brand: 'Example',
        model: 'CURRENT-500',
        w: 500,
        h: 1700,
        d: 600,
        unavailable: false,
        retailers: [{ n: 'Retailer', url: 'https://retailer.example/current-500' }],
      },
      {
        id: 'archived-fridge',
        cat: 'fridge',
        brand: 'Example',
        model: 'ARCHIVED-500',
        w: 500,
        h: 1700,
        d: 600,
        unavailable: true,
        retailers: [],
      },
    ],
  }, null, 2)}\n`);
  await writeFile(path.join(dataDir, 'clearance.json'), `${JSON.stringify({
    schema_version: 1,
    rules: { fridge: { __default__: { side: 20 }, Example: { side: 20 } } },
  }, null, 2)}\n`);
  return { dataDir, outputDir: path.join(root, 'pages', prefix) };
}

test('cavity pages count and feature only current retail products', async () => {
  const { generateCavityPages } = await import(generatorModuleUrl);
  const { dataDir, outputDir } = await createWorkspace('cavity');

  await generateCavityPages({
    repoRoot,
    dataDir,
    outputDir,
    logger: { log() {} },
  });

  const index = JSON.parse(await readFile(path.join(outputDir, 'index.json'), 'utf8'));
  const page = index.find((row) => row.width === 600);
  assert.equal(page.results, 1);

  const html = await readFile(path.join(outputDir, '600mm-fridge.html'), 'utf8');
  assert.match(html, /CURRENT-500/);
  assert.doesNotMatch(html, /ARCHIVED-500/);
});

test('doorway pages count and feature only current retail products', async () => {
  const { generateDoorwayPages } = await import(doorwayModuleUrl);
  const { dataDir, outputDir } = await createWorkspace('doorway');

  await generateDoorwayPages({ dataDir, outputDir, logger: { log() {} } });

  const index = JSON.parse(await readFile(path.join(outputDir, 'index.json'), 'utf8'));
  const page = index.find((row) => row.doorway === 650);
  assert.equal(page.results, 1);

  const html = await readFile(path.join(outputDir, '650mm-fridge-doorway.html'), 'utf8');
  assert.match(html, /CURRENT-500/);
  assert.doesNotMatch(html, /ARCHIVED-500/);
});
