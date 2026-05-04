import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

const BRAND_PAGE_SOURCES = fs.readdirSync(path.join(repoRoot, 'pages', 'brands'))
  .filter((file) => file.endsWith('.html'))
  .map((file) => path.join('pages', 'brands', file));

const DISPLAY_SOURCES = [
  'index.html',
  'data/copy/hero.json',
  'data/copy/footer.json',
  'public/data/ui-copy.json',
  'public/scripts/search-dom.js',
  'public/scripts/ui/product-card.js',
  'scripts/generate-brand-pages.js',
  ...BRAND_PAGE_SOURCES
];

const UNSUPPORTED_CLAIMS = [
  {
    pattern: /in stock at major Australian retailers/i,
    reason: 'retailer links are verified product-page links, not live stock checks'
  },
  {
    pattern: /products available at major Australian retailers/i,
    reason: 'availability implies stock; use verified retailer links instead'
  },
  {
    pattern: /Compare price and running cost/i,
    reason: 'current retailer rows do not carry verified prices'
  },
  {
    pattern: /lifetime energy cost side by side/i,
    reason: 'purchase price data is mostly absent, so avoid price-comparison framing'
  },
  {
    pattern: /All prices AUD incl\. GST/i,
    reason: 'the current catalog has no verified positive price rows'
  },
  {
    pattern: /May qualify for state energy rebate/i,
    reason: 'rebate eligibility is not calculated by FitAppliance'
  },
  {
    pattern: /per manufacturer installation guidelines/i,
    reason: 'clearance figures are advisory planning data unless model-specific manuals are checked'
  },
  {
    pattern: /Dimensions shown are after each brand's clearance rules/i,
    reason: 'default fit now uses practical clearance; manufacturer clearance is advisory'
  },
  {
    pattern: /We subtract each brand's ventilation spec/i,
    reason: 'default fit now uses practical clearance; manufacturer clearance is advisory'
  },
  {
    pattern: /brand-specific clearance rules applied/i,
    reason: 'default fit now uses practical clearance; manufacturer clearance is advisory'
  }
];

test('display accuracy copy: visible templates avoid unsupported data claims', () => {
  const failures = [];
  for (const file of DISPLAY_SOURCES) {
    const source = read(file);
    for (const claim of UNSUPPORTED_CLAIMS) {
      if (claim.pattern.test(source)) {
        failures.push(`${file}: ${claim.pattern} (${claim.reason})`);
      }
    }
  }

  assert.deepEqual(failures, []);
});

test('display accuracy copy: homepage names verified retailer links, not live stock or price feeds', () => {
  const home = read('index.html');

  assert.match(home, /verified retailer (?:product )?links/i);
  assert.doesNotMatch(home, /in stock at major Australian retailers/i);
  assert.doesNotMatch(home, /Retailer links and prices are shown only when feed data is available/i);
});
