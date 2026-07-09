import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const criticalCss = indexHtml.match(/<style>\s*([\s\S]*?)<\/style>/)?.[1] ?? '';
const deferredCss = fs.readFileSync(path.join(ROOT, 'public', 'styles-deferred.css'), 'utf8');
const combinedCss = `${criticalCss}\n${deferredCss}`;

function blockFor(selector, css = combinedCss) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  return match?.[1] ?? '';
}

function exactBlockFor(selector, css = combinedCss) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
  return match?.[1] ?? '';
}

test('taste redesign: homepage hero reads as a light measurement workbench', () => {
  const hero = blockFor('.hero');
  const title = blockFor('.hero h1');
  const searchCard = blockFor('.search-card');
  const trust = blockFor('.hero-trust-strip');
  const trustItem = blockFor('.hero-trust-item');

  assert.match(hero, /background:\s*var\(--paper\)/);
  assert.doesNotMatch(hero, /background:\s*var\(--ink\)/);
  assert.match(title, /color:\s*var\(--ink\)/);
  assert.match(searchCard, /box-shadow:\s*var\(--shadow\)/);
  assert.doesNotMatch(searchCard, /0 28px 80px rgba\(0,0,0,\s*\.28\)/);
  assert.match(trust, /color:\s*var\(--ink-2\)/);
  assert.match(trustItem, /color:\s*var\(--ink-2\)/);
  assert.match(indexHtml, /<meta name="theme-color" content="#FAF8F4">/);
});

test('taste redesign: first viewport includes a functional cavity measurement diagram', () => {
  assert.match(indexHtml, /class="measurement-console"/);
  assert.match(indexHtml, /class="measurement-console__diagram"/);
  assert.match(indexHtml, /Cavity width/i);
  assert.match(indexHtml, /Practical clearance/i);
  assert.match(indexHtml, /Doorway path/i);
});

test('taste redesign: trust proof is presented as review-ready content, not a generic card row', () => {
  assert.match(indexHtml, /class="[^"]*\breview-ready-panel\b[^"]*"/);
  assert.match(indexHtml, /Manual-backed guides/i);
  assert.match(indexHtml, /Evidence-labelled results/i);
  assert.match(indexHtml, /Affiliate and contact details/i);
  assert.match(indexHtml, /hello@fitappliance\.com\.au/);
  assert.match(indexHtml, /ABN 46 168 974 169/);
});

test('taste redesign: dark standalone sections are removed from the light utility flow', () => {
  const how = blockFor('.how-sec', deferredCss);
  const footer = exactBlockFor('footer', deferredCss);

  assert.doesNotMatch(how, /background:\s*var\(--ink\)/);
  assert.match(how, /background:\s*var\(--paper-2\)/);
  assert.match(footer, /background:\s*var\(--ink\)/);
});
