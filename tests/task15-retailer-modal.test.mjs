import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleUrl = pathToFileURL(
  path.join(repoRoot, 'public', 'scripts', 'ui', 'retailer-modal.js')
).href;

function makeProduct(overrides = {}) {
  return {
    id: 'p-1',
    brand: 'LG',
    model: 'GB-335PL Bottom Mount',
    retailers: [],
    ...overrides
  };
}

test('task 15 retailer-modal: shouldShowRetailerModal false for 0 retailers', async () => {
  const { shouldShowRetailerModal } = await import(moduleUrl);
  assert.equal(shouldShowRetailerModal(makeProduct()), false);
});

test('task 15 retailer-modal: shouldShowRetailerModal false for 1 retailer', async () => {
  const { shouldShowRetailerModal } = await import(moduleUrl);
  assert.equal(
    shouldShowRetailerModal(makeProduct({ retailers: [{ n: 'JB Hi-Fi', p: 1200, url: 'https://example.com' }] })),
    false
  );
});

test('task 15 retailer-modal: shouldShowRetailerModal true for 2+ retailers', async () => {
  const { shouldShowRetailerModal } = await import(moduleUrl);
  assert.equal(
    shouldShowRetailerModal(makeProduct({
      retailers: [
        { n: 'JB Hi-Fi', p: 1200, url: 'https://example.com/jb' },
        { n: 'Bing Lee', p: 1190, url: 'https://example.com/bl' }
      ]
    })),
    true
  );
});

test('task 15 retailer-modal: trigger for 0 retailers is a single honest online search link', async () => {
  const { buildRetailerTriggerButton } = await import(moduleUrl);
  const html = buildRetailerTriggerButton(makeProduct(), {
    buildSearchOnlineUrl: () => 'https://www.google.com.au/search?q=ABC%20australia',
    resolveRetailerUrl: () => '#'
  });

  assert.match(html, /Search this model online/);
  assert.match(html, /retailer info not available/);
  assert.match(html, /class="btn-search-online"/);
  assert.match(html, /google\.com\.au\/search/);
  assert.match(html, /rel="sponsored nofollow noopener"/);
  assert.doesNotMatch(html, /Search at:/);
});

test('task 15 retailer-modal: online compare fallback escapes href values', async () => {
  const { buildRetailerTriggerButton } = await import(moduleUrl);
  const html = buildRetailerTriggerButton(makeProduct(), {
    buildSearchOnlineUrl: () => 'https://www.google.com.au/search?q=<bad>&x="1"'
  });

  assert.match(html, /q=&lt;bad&gt;&amp;x=&quot;1&quot;/);
  assert.doesNotMatch(html, /href="[^"]*<bad>/);
});

test('task 15 retailer-modal: trigger for 1 retailer uses the retailer chip pattern', async () => {
  const { buildRetailerTriggerButton } = await import(moduleUrl);
  const html = buildRetailerTriggerButton(makeProduct({
    retailers: [{ n: 'The Good Guys', p: 1299, url: 'https://www.thegoodguys.com.au/lg-gb335pl-fridge' }]
  }), {
    buildNoRetailerUrl: () => '#',
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(html, /retailer-logo-links/);
  assert.match(html, /Available at/);
  assert.match(html, /retailer-logo-mark">TGG</);
  assert.match(html, /The Good Guys/);
  assert.match(html, /href="https:\/\/www\.thegoodguys\.com\.au\/lg-gb335pl-fridge"/);
  assert.doesNotMatch(html, /openRetailerModal/);
});

test('hotfix retailer URL quality: root and search URLs fall back to honest online search', async () => {
  const { buildRetailerTriggerButton, shouldShowRetailerModal } = await import(moduleUrl);
  const product = makeProduct({
    retailers: [
      { n: 'Harvey Norman', p: null, url: 'https://www.harveynorman.com.au' },
      { n: 'Appliances Online', p: 4999, url: 'https://www.appliances-online.com.au' },
      { n: 'The Good Guys', p: 1299, url: 'https://www.thegoodguys.com.au/SearchDisplay?searchTerm=GB335' }
    ]
  });
  const html = buildRetailerTriggerButton(product, {
    buildSearchOnlineUrl: () => 'https://www.google.com.au/search?q=LG%20GB335PL%20fridge%20australia',
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.equal(shouldShowRetailerModal(product), false);
  assert.match(html, /Search this model online/);
  assert.match(html, /google\.com\.au\/search/);
  assert.doesNotMatch(html, /Harvey Norman/);
  assert.doesNotMatch(html, /Appliances Online/);
  assert.doesNotMatch(html, /Compare 2 Retailers/);
});

test('task 15 retailer-modal: trigger for 1 retailer without price still links to retailer URL', async () => {
  const { buildRetailerTriggerButton } = await import(moduleUrl);
  const html = buildRetailerTriggerButton(makeProduct({
    retailers: [{ n: 'JB Hi-Fi', p: null, url: 'https://www.jbhifi.com.au/products/lg-gb335pl' }]
  }), {
    buildSearchOnlineUrl: () => 'https://www.google.com.au/search?q=LG%20GB335PL%20fridge%20australia',
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(html, /retailer-logo-links/);
  assert.match(html, /Available at/);
  assert.match(html, /retailer-logo-mark">JB</);
  assert.match(html, /JB Hi-Fi/);
  assert.match(html, /href="https:\/\/www\.jbhifi\.com\.au\/products\/lg-gb335pl"/);
  assert.match(html, /data-price="0"/);
  assert.doesNotMatch(html, /google\.com\.au\/search/);
});

test('phase 50 retailer links: multiple unpriced retailer links render as selectable chips', async () => {
  const { buildRetailerTriggerButton } = await import(moduleUrl);
  const html = buildRetailerTriggerButton(makeProduct({
    retailers: [
      { n: 'JB Hi-Fi', p: null, url: 'https://www.jbhifi.com.au/products/lg-gb335pl' },
      { n: 'Appliances Online', p: null, url: 'https://www.appliancesonline.com.au/product/lg-gb335pl/' }
    ]
  }), {
    buildSearchOnlineUrl: () => 'https://www.google.com.au/search?q=LG%20GB335PL%20fridge%20australia',
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(html, /retailer-logo-links/);
  assert.match(html, /Available at/);
  assert.match(html, /JB Hi-Fi/);
  assert.match(html, /Appliances Online/);
  assert.match(html, /href="https:\/\/www\.jbhifi\.com\.au\/products\/lg-gb335pl"/);
  assert.match(html, /href="https:\/\/www\.appliancesonline\.com\.au\/product\/lg-gb335pl\/"/);
  assert.doesNotMatch(html, /google\.com\.au\/search/);
  assert.doesNotMatch(html, /Buy at JB Hi-Fi/);
});

test('phase 50 retailer links: five linked retailers use compact logo rail instead of long pills', async () => {
  const { buildRetailerTriggerButton } = await import(moduleUrl);
  const html = buildRetailerTriggerButton(makeProduct({
    retailers: [
      { n: 'JB Hi-Fi', p: null, url: 'https://www.jbhifi.com.au/products/lg-gb335pl' },
      { n: 'Appliances Online', p: null, url: 'https://www.appliancesonline.com.au/product/lg-gb335pl/' },
      { n: 'The Good Guys', p: null, url: 'https://www.thegoodguys.com.au/lg-gb335pl' },
      { n: 'Harvey Norman', p: null, url: 'https://www.harveynorman.com.au/lg-gb335pl.html' },
      { n: 'Bing Lee', p: null, url: 'https://www.binglee.com.au/products/lg-gb335pl' }
    ]
  }), {
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(html, /retailer-logo-panel--dense/);
  assert.match(html, /Available at 5 stores/);
  assert.match(html, /retailer-logo-rail/);
  assert.equal((html.match(/class="retailer-logo-dot"/g) ?? []).length, 5);
  assert.match(html, /title="Bing Lee"/);
  assert.doesNotMatch(html, /class="retailer-logo-name"/);
});

test('phase 50 retailer links: compact logo rail styling has bounded circular targets', () => {
  const css = fs.readFileSync(path.join(repoRoot, 'public', 'styles.css'), 'utf8');

  assert.match(css, /\.retailer-logo-rail\s*\{/);
  assert.match(css, /\.retailer-logo-dot\s*\{/);
  assert.match(css, /width:\s*34px/);
  assert.match(css, /height:\s*34px/);
  assert.match(css, /\.card-retailer-panel--dense\s+\.retailer-option-hint/);
});

test('phase 50 retailer links: retailer chip labels are escaped', async () => {
  const { buildRetailerTriggerButton } = await import(moduleUrl);
  const html = buildRetailerTriggerButton(makeProduct({
    retailers: [
      { n: '<img src=x onerror=alert(1)>', p: null, url: 'https://example.com/product' }
    ]
  }), {
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(html, /Retailer/);
  assert.doesNotMatch(html, /&lt;img/);
  assert.doesNotMatch(html, /onerror=/);
});

test('task 15 retailer-modal: modal only opens when at least 2 retailer prices are known', async () => {
  const { shouldShowRetailerModal, buildRetailerModalHtml } = await import(moduleUrl);
  const product = makeProduct({
    retailers: [
      { n: 'JB Hi-Fi', p: null, url: 'https://www.jbhifi.com.au/products/lg-gb335pl' },
      { n: 'Bing Lee', p: undefined, url: 'https://www.binglee.com.au/products/lg-gb335pl' }
    ]
  });

  assert.equal(shouldShowRetailerModal(product), false);
  assert.equal(buildRetailerModalHtml(product), '');
});

test('task 15 retailer-modal: trigger for 2 retailers is compare button opening modal', async () => {
  const { buildRetailerTriggerButton } = await import(moduleUrl);
  const html = buildRetailerTriggerButton(makeProduct({
    retailers: [
      { n: 'Retailer A', p: 1200, url: 'https://example.com/a' },
      { n: 'Retailer B', p: 1210, url: 'https://example.com/b' }
    ]
  }), {
    buildNoRetailerUrl: () => '#',
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(html, /Compare 2 Retailers/);
  assert.match(html, /openRetailerModal\('p-1'\)/);
});

test('task 15 retailer-modal: modal html sorts retailers by ascending price', async () => {
  const { buildRetailerModalHtml } = await import(moduleUrl);
  const html = buildRetailerModalHtml(makeProduct({
    retailers: [
      { n: 'Retailer C', p: 1350, url: 'https://example.com/c' },
      { n: 'Retailer A', p: 1200, url: 'https://example.com/a' },
      { n: 'Retailer B', p: 1290, url: 'https://example.com/b' }
    ]
  }), {
    resolveRetailerUrl: (retailer) => retailer.url
  });

  const posA = html.indexOf('Retailer A');
  const posB = html.indexOf('Retailer B');
  const posC = html.indexOf('Retailer C');
  assert.ok(posA < posB && posB < posC, 'retailers should be sorted by price ascending');
});

test('task 15 retailer-modal: modal marks cheapest retailer as best', async () => {
  const { buildRetailerModalHtml } = await import(moduleUrl);
  const html = buildRetailerModalHtml(makeProduct({
    retailers: [
      { n: 'Retailer High', p: 1500, url: 'https://example.com/high' },
      { n: 'Retailer Low', p: 1300, url: 'https://example.com/low' }
    ]
  }), {
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(html, /retailer-item retailer-item--best/);
  assert.match(html, /Lowest/);
});

test('task 15 retailer-modal: modal shows price delta from cheapest option', async () => {
  const { buildRetailerModalHtml } = await import(moduleUrl);
  const html = buildRetailerModalHtml(makeProduct({
    retailers: [
      { n: 'Retailer Low', p: 1000, url: 'https://example.com/low' },
      { n: 'Retailer Mid', p: 1050, url: 'https://example.com/mid' }
    ]
  }), {
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(html, /\+\$50/);
});
