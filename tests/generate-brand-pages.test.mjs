import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = '/Users/clawdbot_jz/Documents/Claude/Projects/Fitmyappliance/v2';
const generatorModuleUrl = pathToFileURL(
  path.join(repoRoot, 'scripts', 'generate-brand-pages.js')
).href;

async function createWorkspace() {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'fitappliance-brand-pages-'));
  const dataDir = path.join(rootDir, 'public', 'data');
  const outputDir = path.join(rootDir, 'pages', 'brands');
  await mkdir(dataDir, { recursive: true });

  const appliances = {
    schema_version: 2,
    last_updated: '2026-04-15',
    products: [
      {
        id: 'f-samsung-1',
        cat: 'fridge',
        brand: 'Samsung',
        model: 'SRF7500WFH French Door',
        w: 912,
        h: 1780,
        d: 748,
        kwh_year: 420,
        stars: 3,
        price: null,
        emoji: '🧊',
        door_swing_mm: null,
        features: ['French door'],
        retailers: [],
        sponsored: false
      }
    ]
  };

  const clearance = {
    schema_version: 1,
    last_updated: '2026-04-15',
    rules: {
      fridge: {
        __default__: { side: 40, rear: 25, top: 50 },
        Samsung: { side: 50, rear: 50, top: 100 },
        LG: { side: 25, rear: 25, top: 50 }
      }
    }
  };

  await writeFile(path.join(dataDir, 'appliances.json'), `${JSON.stringify(appliances, null, 2)}\n`);
  await writeFile(path.join(dataDir, 'clearance.json'), `${JSON.stringify(clearance, null, 2)}\n`);

  return { dataDir, outputDir };
}

test('generateBrandPages creates a brand page when a brand has at least one model', async () => {
  const { generateBrandPages } = await import(generatorModuleUrl);
  const workspace = await createWorkspace();

  const result = await generateBrandPages({
    dataDir: workspace.dataDir,
    outputDir: workspace.outputDir,
    logger: { log() {} }
  });

  assert.equal(result.generated, 1);

  const samsungPath = path.join(workspace.outputDir, 'samsung-fridge-clearance.html');
  await access(samsungPath, fsConstants.F_OK);

  const indexRows = JSON.parse(await readFile(path.join(workspace.outputDir, 'index.json'), 'utf8'));
  assert.equal(indexRows.length, 1);
  assert.equal(indexRows[0].slug, 'samsung-fridge-clearance');
  assert.equal(indexRows[0].models, 1);
});

test('generateBrandPages does not create brand pages for rules with zero matched models', async () => {
  const { generateBrandPages } = await import(generatorModuleUrl);
  const workspace = await createWorkspace();

  await generateBrandPages({
    dataDir: workspace.dataDir,
    outputDir: workspace.outputDir,
    logger: { log() {} }
  });

  const indexRows = JSON.parse(await readFile(path.join(workspace.outputDir, 'index.json'), 'utf8'));
  const hasLgPage = indexRows.some((row) => row.slug === 'lg-fridge-clearance');
  assert.equal(hasLgPage, false);
});
