import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productCardModuleUrl = pathToFileURL(
  path.join(repoRoot, 'public', 'scripts', 'ui', 'product-card.js')
).href;

function makeProduct(overrides = {}) {
  return {
    id: 'phase55-perfect',
    cat: 'fridge',
    brand: 'Hisense',
    model: 'HRTF206',
    w: 580,
    h: 1780,
    d: 620,
    stars: 5,
    features: ['Top Mount', 'Reversible hinge', '205L'],
    retailers: [
      {
        n: 'JB Hi-Fi',
        url: 'https://www.jbhifi.com.au/products/hisense-hrtf206-205l-top-mount-fridge',
        p: null
      }
    ],
    fitAxisGaps: [
      { axis: 'width', label: 'W', cavity: 600, appliance: 580, clearanceMm: 0, gapMm: 20 },
      { axis: 'height', label: 'H', cavity: 1900, appliance: 1780, clearanceMm: 20, gapMm: 100 },
      { axis: 'depth', label: 'D', cavity: 650, appliance: 620, clearanceMm: 10, gapMm: 20 }
    ],
    bindingAxis: 'width',
    ...overrides
  };
}

test('phase 55 card refactor: list row exposes three RTINGS-style zones', async () => {
  const { buildRow } = await import(productCardModuleUrl);
  const html = buildRow(makeProduct(), {
    annualEnergyCost: () => '88',
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(html, /card-zone-a/);
  assert.match(html, /card-zone-b/);
  assert.match(html, /card-zone-c/);
  assert.match(html, /class="card-zone-title"/);
  assert.match(html, /class="card-zone-tech-specs"/);
});

test('phase 55 card refactor: clearance bars replace raw W/H/D chip emphasis', async () => {
  const { buildRow } = await import(productCardModuleUrl);
  const html = buildRow(makeProduct(), {
    annualEnergyCost: () => '88',
    resolveRetailerUrl: (retailer) => retailer.url
  });

  const bars = html.match(/class="clearance-bar\s/g) ?? [];
  assert.equal(bars.length, 3);
  assert.match(html, /W: 580mm \+ 0mm clearance \/ 600mm cavity \(20mm spare\)/);
  assert.doesNotMatch(html, /<span class="dim-tag">W 580mm<\/span>/);
});

test('phase 55 card refactor: clean fixture does not render product price tags', async () => {
  const { buildRow } = await import(productCardModuleUrl);
  const html = buildRow(makeProduct({
    kwh_year: undefined,
    retailers: [{ n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/hisense-hrtf206-205l-top-mount-fridge', p: 1299 }]
  }), {
    annualEnergyCost: () => '',
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.doesNotMatch(html, /\$\d{2,5}/);
  assert.doesNotMatch(html, /Best price/i);
  assert.doesNotMatch(html, /Price unavailable/i);
});

test('phase 55 card refactor: availability accordion reveals retailer product links', async () => {
  const { buildRow } = await import(productCardModuleUrl);
  const html = buildRow(makeProduct(), {
    annualEnergyCost: () => '88',
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(html, /<details class="card-availability"/);
  assert.match(html, /Check Availability/);
  assert.match(html, /class="retailer-link/);
  assert.match(html, /https:\/\/www\.jbhifi\.com\.au\/products\/hisense-hrtf206-205l-top-mount-fridge/);
  assert.match(html, /We may earn a commission/);
});

test('phase 55 card refactor: availability accordion falls back to online search without retailer links', async () => {
  const { buildRow } = await import(productCardModuleUrl);
  const html = buildRow(makeProduct({ retailers: [] }), {
    annualEnergyCost: () => '88',
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(html, /Search online/);
  assert.match(html, /google\.com\.au\/search/);
  assert.doesNotMatch(html, /retailer-brand-card--jb-hi-fi/);
});

test('active/current UI: archived rows show replacement CTA instead of retailer availability', async () => {
  const { buildRow } = await import(productCardModuleUrl);
  const html = buildRow(makeProduct({
    unavailable: true,
    retailers: [{ n: 'JB Hi-Fi', url: 'https://www.jbhifi.com.au/products/archived-hisense-hrtf206', p: null }]
  }), {
    annualEnergyCost: () => '88',
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(html, /badge-archived/);
  assert.match(html, /Archived Model/);
  assert.match(html, /Find a Modern Replacement/);
  assert.match(html, /triggerReplacementSearch\('580','1780','620'\)/);
  assert.doesNotMatch(html, /Check Availability/);
  assert.doesNotMatch(html, /retailer-brand-card--jb-hi-fi/);
});

test('phase 58 trust visualization: card replaces mini wireframe with clickable product photo thumbnail', async () => {
  const { buildRow } = await import(productCardModuleUrl);
  const html = buildRow(makeProduct(), {
    annualEnergyCost: () => '88',
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(html, /class="product-photo-thumb/);
  assert.match(html, /product-photo-thumb__zoom/);
  assert.match(html, /openProductPhotoLightboxFromButton/);
  assert.doesNotMatch(html, /mini-front-wireframe/);
  assert.doesNotMatch(html, /card-zone-wire-half/);
});

test('phase 58 trust visualization: photo thumbnail uses explicit image first and local asset fallbacks', async () => {
  const { getProductPhotoCandidates, renderProductPhotoThumb } = await import(productCardModuleUrl);
  const product = makeProduct({
    image_url: 'https://cdn.example.com/hisense.png'
  });

  const candidates = getProductPhotoCandidates(product);
  assert.equal(candidates[0], 'https://cdn.example.com/hisense.png');
  assert.ok(candidates.includes('/og-images/hisense-fridge.webp'));

  const html = renderProductPhotoThumb(product);
  assert.match(html, /src="https:\/\/cdn\.example\.com\/hisense\.png"/);
  assert.match(html, /data-photo-fallbacks="\/og-images\/hisense-fridge\.webp\|\/og-images\/hisense-fridge\.png"/);
});
