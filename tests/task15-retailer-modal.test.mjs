import test from 'node:test';
import assert from 'node:assert/strict';
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

test('task 15 retailer-modal: trigger for 0 retailers is Google Shopping link', async () => {
  const { buildRetailerTriggerButton } = await import(moduleUrl);
  const html = buildRetailerTriggerButton(makeProduct(), {
    buildNoRetailerUrl: () => 'https://www.google.com.au/search?q=ABC&tbm=shop',
    resolveRetailerUrl: () => '#'
  });

  assert.match(html, /Search online/);
  assert.match(html, /google\.com\.au\/search/);
});

test('task 15 retailer-modal: trigger for 1 retailer uses search label for search-like URL', async () => {
  const { buildRetailerTriggerButton } = await import(moduleUrl);
  const html = buildRetailerTriggerButton(makeProduct({
    retailers: [{ n: 'The Good Guys', p: 1299, url: 'https://www.thegoodguys.com.au/search?text=GB335' }]
  }), {
    buildNoRetailerUrl: () => '#',
    resolveRetailerUrl: (retailer) => retailer.url
  });

  assert.match(html, /Search at The Good Guys/);
  assert.match(html, /href="https:\/\/www\.thegoodguys\.com\.au\/search\?text=GB335"/);
  assert.doesNotMatch(html, /openRetailerModal/);
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
