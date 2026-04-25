import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

test('generateBrandPages uses display-friendly brand names in generated HTML while keeping raw slugs stable', async () => {
  const { generateBrandPages } = await import(generatorModuleUrl);
  const workspace = await createWorkspace();

  const appliances = JSON.parse(await readFile(path.join(workspace.dataDir, 'appliances.json'), 'utf8'));
  appliances.products = [
    {
      ...appliances.products[0],
      id: 'f-hisense-1',
      brand: 'HISENSE',
      model: 'HRBC113'
    }
  ];
  await writeFile(path.join(workspace.dataDir, 'appliances.json'), `${JSON.stringify(appliances, null, 2)}\n`);

  const clearance = JSON.parse(await readFile(path.join(workspace.dataDir, 'clearance.json'), 'utf8'));
  clearance.rules.fridge.HISENSE = { side: 25, rear: 25, top: 30 };
  await writeFile(path.join(workspace.dataDir, 'clearance.json'), `${JSON.stringify(clearance, null, 2)}\n`);

  await generateBrandPages({
    dataDir: workspace.dataDir,
    outputDir: workspace.outputDir,
    logger: { log() {} }
  });

  const hisensePath = path.join(workspace.outputDir, 'hisense-fridge-clearance.html');
  const html = await readFile(hisensePath, 'utf8');

  assert.match(html, /Hisense Fridge Clearance Requirements Australia/);
  assert.match(html, /Find Hisense Fridges That Fit Your Space/);
});

test('generateBrandPages merges alias variants into one canonical brand page', async () => {
  const { generateBrandPages } = await import(generatorModuleUrl);
  const workspace = await createWorkspace();

  const appliances = JSON.parse(await readFile(path.join(workspace.dataDir, 'appliances.json'), 'utf8'));
  appliances.products = [
    {
      ...appliances.products[0],
      id: 'f-midea-1',
      brand: 'MIDEA',
      model: 'MDRS710FGD'
    },
    {
      ...appliances.products[0],
      id: 'f-midea-2',
      brand: 'Midea',
      model: 'MDRE320FGD'
    }
  ];
  await writeFile(path.join(workspace.dataDir, 'appliances.json'), `${JSON.stringify(appliances, null, 2)}\n`);

  const clearance = JSON.parse(await readFile(path.join(workspace.dataDir, 'clearance.json'), 'utf8'));
  clearance.rules.fridge.MIDEA = { side: 20, rear: 50, top: 50 };
  clearance.rules.fridge.Midea = { side: 20, rear: 50, top: 50 };
  await writeFile(path.join(workspace.dataDir, 'clearance.json'), `${JSON.stringify(clearance, null, 2)}\n`);

  await generateBrandPages({
    dataDir: workspace.dataDir,
    outputDir: workspace.outputDir,
    logger: { log() {} }
  });

  const indexRows = JSON.parse(await readFile(path.join(workspace.outputDir, 'index.json'), 'utf8'));
  assert.equal(indexRows.length, 1);
  assert.equal(indexRows[0].brand, 'Midea');
  assert.equal(indexRows[0].slug, 'midea-fridge-clearance');
  assert.equal(indexRows[0].models, 2);
});

test('generateBrandPages injects og:title meta tags into brand pages', async () => {
  const { generateBrandPages } = await import(generatorModuleUrl);
  const workspace = await createWorkspace();

  await generateBrandPages({
    dataDir: workspace.dataDir,
    outputDir: workspace.outputDir,
    logger: { log() {} }
  });

  const html = await readFile(path.join(workspace.outputDir, 'samsung-fridge-clearance.html'), 'utf8');
  assert.match(html, /<meta property="og:title"/);
});

test('generateBrandPages keeps og:url aligned with canonical URL', async () => {
  const { generateBrandPages } = await import(generatorModuleUrl);
  const workspace = await createWorkspace();

  await generateBrandPages({
    dataDir: workspace.dataDir,
    outputDir: workspace.outputDir,
    logger: { log() {} }
  });

  const html = await readFile(path.join(workspace.outputDir, 'samsung-fridge-clearance.html'), 'utf8');
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.fitappliance\.com\.au\/brands\/samsung-fridge-clearance">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/www\.fitappliance\.com\.au\/brands\/samsung-fridge-clearance">/);
});

test('generateBrandPages injects twitter card meta tags', async () => {
  const { generateBrandPages } = await import(generatorModuleUrl);
  const workspace = await createWorkspace();

  await generateBrandPages({
    dataDir: workspace.dataDir,
    outputDir: workspace.outputDir,
    logger: { log() {} }
  });

  const html = await readFile(path.join(workspace.outputDir, 'samsung-fridge-clearance.html'), 'utf8');
  assert.match(html, /<meta name="twitter:card" content="summary">/);
});
